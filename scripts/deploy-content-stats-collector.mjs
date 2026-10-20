import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { renderInfra } from "./render-infra.mjs";

const execFileAsync = promisify(execFile);
const STACK_NAME = "guilleojeda-website";
const CHANGE_SET_PREFIX = "content-stats-collector-";
const WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const TEMPLATE_PREFIX = "_content-stats/templates";
const COLLECTOR_RESOURCE = "ContentStatsCollector";

export function validateCollectorDeploymentConfig(env = process.env) {
  const missing = ["AWS_REGION", "S3_BUCKET", "GITHUB_SHA"].filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw new Error(`Missing collector deployment configuration: ${missing.join(", ")}`);
  if (env.GITHUB_REF !== "refs/heads/main") {
    throw new Error(`Collector deployment is restricted to refs/heads/main (received ${env.GITHUB_REF || ""})`);
  }
  const commitSha = String(env.GITHUB_SHA).trim();
  if (!/^[a-f0-9]{40,64}$/i.test(commitSha)) throw new Error("GITHUB_SHA must be a full Git commit SHA");

  return {
    region: String(env.AWS_REGION).trim(),
    bucket: String(env.S3_BUCKET).trim(),
    commitSha,
    runId: String(env.GITHUB_RUN_ID || "local").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "local",
    runAttempt: String(env.GITHUB_RUN_ATTEMPT || "1").replace(/[^a-z0-9-]/gi, "").slice(0, 8) || "1"
  };
}

export async function runCommand(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || process.cwd(),
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    timeout: options.timeoutMs,
    windowsHide: true
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function parseJson(text, description) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${description} returned invalid JSON`);
  }
}

function currentStack(stackResponse) {
  const stack = stackResponse?.Stacks?.[0];
  if (!stack) throw new Error(`CloudFormation stack ${STACK_NAME} was not found`);
  if (!["CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].includes(stack.StackStatus)) {
    throw new Error(`CloudFormation stack ${STACK_NAME} is not idle (${stack.StackStatus || "unknown status"})`);
  }
  if (String(stack.RoleARN || "").trim()) {
    throw new Error(`CloudFormation stack ${STACK_NAME} has a service role; collector CI requires the scoped caller permissions`);
  }
  const functionName = stack.Outputs?.find(({ OutputKey }) => OutputKey === "ContentStatsFunctionName")?.OutputValue;
  if (!functionName) throw new Error(`CloudFormation stack ${STACK_NAME} has no ContentStatsFunctionName output`);
  const parameters = (stack.Parameters || []).map(({ ParameterKey }) => ({
    ParameterKey,
    UsePreviousValue: true
  }));
  return { functionName, parameters };
}

function parseTemplateBody(response) {
  let body = response?.TemplateBody;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      throw new Error("The deployed CloudFormation template is not JSON");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("CloudFormation returned no usable original template");
  }
  return body;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function collectorCode(template, label) {
  const resource = template?.Resources?.[COLLECTOR_RESOURCE];
  if (resource?.Type !== "AWS::Lambda::Function" || typeof resource.Properties?.Code?.ZipFile !== "string") {
    throw new Error(`${label} does not contain the expected ${COLLECTOR_RESOURCE} inline code`);
  }
  return resource.Properties.Code.ZipFile;
}

export function compareCollectorTemplates(original, target) {
  const originalCode = collectorCode(original, "The deployed template");
  const targetCode = collectorCode(target, "The rendered template");
  const withoutCode = (template) => {
    const copy = structuredClone(template);
    delete copy.Resources[COLLECTOR_RESOURCE].Properties.Code.ZipFile;
    return canonical(copy);
  };
  if (JSON.stringify(withoutCode(original)) !== JSON.stringify(withoutCode(target))) {
    throw new Error("Refusing collector deployment: the rendered template changes infrastructure outside ContentStatsCollector.Properties.Code.ZipFile");
  }
  return { changed: originalCode !== targetCode, originalCode, targetCode };
}

async function checkCurrentMain({ run, cwd, commitSha, checkCheckout = false }) {
  if (checkCheckout) {
    const checkoutResult = await run("git", ["rev-parse", "HEAD"], { cwd });
    if (String(checkoutResult.stdout || "").trim() !== commitSha) {
      throw new Error("The checked-out source does not match GITHUB_SHA");
    }
  }
  const remoteResult = await run("git", ["ls-remote", "origin", "refs/heads/main"], { cwd });
  const remoteSha = String(remoteResult.stdout || "").trim().split(/\s+/)[0];
  if (!remoteSha) throw new Error("Could not resolve origin/main before the collector deployment operation");
  return remoteSha === commitSha;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function verifyDeployedCollector({ run, fetchFn = fetch, functionName, region, expectedSource }) {
  const result = await run("aws", [
    "lambda", "get-function", "--function-name", functionName,
    "--region", region, "--output", "json", "--no-cli-pager"
  ]);
  const response = parseJson(result.stdout, "Lambda get-function");
  if (response?.Configuration?.FunctionName !== functionName) {
    throw new Error("Lambda get-function returned an unexpected function");
  }
  const location = response?.Code?.Location;
  if (typeof location !== "string" || !location) throw new Error("Lambda get-function returned no signed code location");

  let archiveResponse;
  try {
    archiveResponse = await fetchFn(location, { redirect: "error" });
  } catch {
    throw new Error("Could not read the deployed collector code archive");
  }
  if (!archiveResponse.ok) throw new Error(`Could not read the deployed collector code archive (HTTP ${archiveResponse.status})`);
  let deployedSource;
  const workDir = mkdtempSync(join(tmpdir(), "content-stats-lambda-code-"));
  const archivePath = join(workDir, "function.zip");
  try {
    writeFileSync(archivePath, Buffer.from(await archiveResponse.arrayBuffer()), { mode: 0o600 });
    const listing = await run("unzip", ["-Z1", archivePath]);
    const entries = String(listing.stdout || "").trim().split(/\r?\n/).filter(Boolean);
    if (entries.length !== 1 || entries[0] !== "index.js") {
      throw new Error("Lambda code archive does not contain exactly one index.js source file");
    }
    const extracted = await run("unzip", ["-p", archivePath, "index.js"]);
    deployedSource = String(extracted.stdout || "");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const expectedHash = sha256Hex(expectedSource);
  const deployedHash = sha256Hex(deployedSource);
  if (deployedSource !== expectedSource) {
    throw new Error(`Deployed collector source does not match this commit (expected SHA-256 ${expectedHash}, received ${deployedHash})`);
  }
  return { sourceSha256: deployedHash };
}

function parseAwsErrorText(error) {
  return [error?.stderr, error?.message].filter(Boolean).join("\n");
}

function isNoChangeReason(reason) {
  const text = String(reason || "").trim();
  return /The submitted information didn't contain changes(?:\.[^\n]*)?/i.test(text) || /No updates are to be performed\.?/i.test(text);
}

function isNoChangeError(error) {
  return isNoChangeReason(parseAwsErrorText(error));
}

function parseChangeSet(result) {
  return parseJson(result.stdout, "CloudFormation create-change-set");
}

function ensureCodeOnlyChangeSet(changeSet) {
  const changes = changeSet?.Changes || [];
  if (changes.length !== 1) throw new Error(`Refusing CloudFormation change set with ${changes.length} resource changes`);
  const resourceChange = changes[0]?.ResourceChange;
  if (resourceChange?.LogicalResourceId !== COLLECTOR_RESOURCE ||
      resourceChange?.ResourceType !== "AWS::Lambda::Function" ||
      resourceChange?.Action !== "Modify" ||
      resourceChange?.Replacement !== "False") {
    throw new Error("Refusing CloudFormation change set that does not contain only an in-place collector Lambda update");
  }
}

async function describeChangeSet({ run, region, changeSetName }) {
  const result = await run("aws", [
    "cloudformation", "describe-change-set", "--stack-name", STACK_NAME,
    "--change-set-name", changeSetName, "--region", region, "--output", "json", "--no-cli-pager"
  ]);
  return parseJson(result.stdout, "CloudFormation describe-change-set");
}

async function finishNoOp(options) {
  const verified = await verifyDeployedCollector(options);
  return { status: "unchanged", functionName: options.functionName, sourceSha256: verified.sourceSha256 };
}

export async function runCollectorDeployment({
  env = process.env,
  cwd = process.cwd(),
  run = runCommand,
  fetchFn = fetch
} = {}) {
  const config = validateCollectorDeploymentConfig(env);
  if (!await checkCurrentMain({ run, cwd, commitSha: config.commitSha, checkCheckout: true })) {
    return { status: "superseded", commitSha: config.commitSha };
  }

  const stackResult = await run("aws", [
    "cloudformation", "describe-stacks", "--stack-name", STACK_NAME,
    "--region", config.region, "--output", "json", "--no-cli-pager"
  ]);
  const stack = currentStack(parseJson(stackResult.stdout, "CloudFormation describe-stacks"));
  const templateResult = await run("aws", [
    "cloudformation", "get-template", "--stack-name", STACK_NAME,
    "--template-stage", "Original", "--region", config.region,
    "--output", "json", "--no-cli-pager"
  ]);
  const originalTemplate = parseTemplateBody(parseJson(templateResult.stdout, "CloudFormation get-template"));
  const renderedTemplateText = renderInfra();
  const renderedTemplate = parseJson(renderedTemplateText, "Rendered CloudFormation template");
  const comparison = compareCollectorTemplates(originalTemplate, renderedTemplate);
  const expectedSource = comparison.targetCode;

  if (!comparison.changed) {
    const unchanged = await finishNoOp({ run, fetchFn, functionName: stack.functionName, region: config.region, expectedSource });
    return { ...unchanged, commitSha: config.commitSha };
  }

  const workDir = mkdtempSync(join(tmpdir(), "content-stats-template-"));
  const localTemplate = join(workDir, "template.json");
  writeFileSync(localTemplate, renderedTemplateText, { encoding: "utf8", mode: 0o600 });
  const templateKey = `${TEMPLATE_PREFIX}/${config.commitSha}.json`;
  const templateUrl = `https://s3.${config.region}.amazonaws.com/${config.bucket}/${templateKey}`;
  const changeSetName = `${CHANGE_SET_PREFIX}${config.commitSha.slice(0, 12)}-${config.runId}-${config.runAttempt}`;

  try {
    if (!await checkCurrentMain({ run, cwd, commitSha: config.commitSha })) {
      return { status: "superseded", commitSha: config.commitSha };
    }
    await run("aws", [
      "s3", "cp", localTemplate, `s3://${config.bucket}/${templateKey}`,
      "--region", config.region, "--content-type", "application/json",
      "--cache-control", "private,no-store", "--only-show-errors", "--no-cli-pager"
    ]);

    if (!await checkCurrentMain({ run, cwd, commitSha: config.commitSha })) {
      return { status: "superseded", commitSha: config.commitSha };
    }
    let createResult;
    try {
      createResult = await run("aws", [
        "cloudformation", "create-change-set", "--stack-name", STACK_NAME,
        "--change-set-name", changeSetName, "--change-set-type", "UPDATE",
        "--template-url", templateUrl,
        "--parameters", JSON.stringify(stack.parameters),
        "--capabilities", "CAPABILITY_IAM", "--region", config.region,
        "--description", `Collector code update for ${config.commitSha}`,
        "--output", "json", "--no-cli-pager"
      ]);
    } catch (error) {
      if (isNoChangeError(error)) {
        const unchanged = await finishNoOp({ run, fetchFn, functionName: stack.functionName, region: config.region, expectedSource });
        return { ...unchanged, commitSha: config.commitSha };
      }
      throw error;
    }
    const createResponse = parseChangeSet(createResult);
    if (typeof createResponse.Id !== "string" || !createResponse.Id) {
      throw new Error("CloudFormation create-change-set returned no change set ID");
    }
    if (!createResponse.Id.includes(changeSetName)) {
      throw new Error("CloudFormation created an unexpected change set");
    }

    let changeSet = await describeChangeSet({ run, region: config.region, changeSetName });
    if (changeSet.Status === "FAILED" && isNoChangeReason(changeSet.StatusReason)) {
      const unchanged = await finishNoOp({ run, fetchFn, functionName: stack.functionName, region: config.region, expectedSource });
      return { ...unchanged, commitSha: config.commitSha };
    }
    if (changeSet.Status !== "CREATE_COMPLETE") {
      try {
        await run("aws", [
          "cloudformation", "wait", "change-set-create-complete", "--stack-name", STACK_NAME,
          "--change-set-name", changeSetName, "--region", config.region, "--no-cli-pager"
        ], { timeoutMs: WAIT_TIMEOUT_MS });
      } catch (waitError) {
        changeSet = await describeChangeSet({ run, region: config.region, changeSetName });
        if (changeSet.Status === "FAILED" && isNoChangeReason(changeSet.StatusReason)) {
          const unchanged = await finishNoOp({ run, fetchFn, functionName: stack.functionName, region: config.region, expectedSource });
          return { ...unchanged, commitSha: config.commitSha };
        }
        throw waitError;
      }
      changeSet = await describeChangeSet({ run, region: config.region, changeSetName });
    }
    if (changeSet.Status !== "CREATE_COMPLETE" || changeSet.ExecutionStatus !== "AVAILABLE") {
      throw new Error(`CloudFormation change set is not executable (${changeSet.Status || "unknown"}/${changeSet.ExecutionStatus || "unknown"})`);
    }
    ensureCodeOnlyChangeSet(changeSet);

    if (!await checkCurrentMain({ run, cwd, commitSha: config.commitSha })) {
      return { status: "superseded", commitSha: config.commitSha };
    }
    await run("aws", [
      "cloudformation", "execute-change-set", "--stack-name", STACK_NAME,
      "--change-set-name", changeSetName, "--region", config.region, "--no-cli-pager"
    ]);
    await run("aws", [
      "cloudformation", "wait", "stack-update-complete", "--stack-name", STACK_NAME,
      "--region", config.region, "--no-cli-pager"
    ], { timeoutMs: WAIT_TIMEOUT_MS });

    const verified = await verifyDeployedCollector({
      run, fetchFn, functionName: stack.functionName, region: config.region, expectedSource
    });
    return {
      status: "updated",
      commitSha: config.commitSha,
      functionName: stack.functionName,
      sourceSha256: verified.sourceSha256,
      templateKey,
      changeSetName
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const invokedScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedScript) {
  runCollectorDeployment()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
