import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  compareCollectorTemplates,
  runCollectorDeployment,
  validateCollectorDeploymentConfig
} from "../scripts/deploy-content-stats-collector.mjs";
import { renderInfra } from "../scripts/render-infra.mjs";

const commitSha = "a".repeat(40);
const functionName = "guilleojeda-website-ContentStatsCollector";
const targetTemplate = JSON.parse(renderInfra());
const targetSource = targetTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile;
const execFileAsync = promisify(execFile);

function env(overrides = {}) {
  return {
    AWS_REGION: "us-east-1",
    S3_BUCKET: "site-bucket",
    GITHUB_SHA: commitSha,
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_ATTEMPT: "1",
    ...overrides
  };
}

function response(stdout = "", stderr = "") {
  return { stdout, stderr };
}

function stackResponse(status = "UPDATE_COMPLETE", roleArn = undefined) {
  return {
    Stacks: [{
      StackStatus: status,
      RoleARN: roleArn,
      Outputs: [{ OutputKey: "ContentStatsFunctionName", OutputValue: functionName }],
      Parameters: [
        { ParameterKey: "BeehiivApiKeySecretArn", ParameterValue: "arn:secret:value-must-not-be-reused" },
        { ParameterKey: "GoogleOAuthParameterArn", ParameterValue: "arn:ssm:value-must-not-be-reused" },
        { ParameterKey: "GitHubOidcProviderArn", ParameterValue: "arn:oidc:provider" }
      ]
    }]
  };
}

function changeSetResponse() {
  return {
    Status: "CREATE_COMPLETE",
    ExecutionStatus: "AVAILABLE",
    Changes: [{ ResourceChange: {
      LogicalResourceId: "ContentStatsCollector",
      ResourceType: "AWS::Lambda::Function",
      Action: "Modify",
      Replacement: "False"
    } }]
  };
}

function dynamicReferencePreview({ logicalId, resourceType, targetName, causingEntities }) {
  return { ResourceChange: {
    LogicalResourceId: logicalId,
    ResourceType: resourceType,
    Action: "Modify",
    Replacement: "False",
    Scope: ["Properties"],
    Details: causingEntities.map((CausingEntity) => ({
      Evaluation: "Dynamic",
      ChangeSource: "ResourceAttribute",
      Target: { Attribute: "Properties", Name: targetName },
      CausingEntity
    }))
  } };
}

function awsRun({
  originalTemplate,
  remoteSha = commitSha,
  status = "UPDATE_COMPLETE",
  roleArn,
  noChange = false,
  failure = null,
  changeSetResponses = [changeSetResponse()],
  stackWaitFailure = false
} = {}) {
  const calls = [];
  let remoteShaIndex = 0;
  let changeSetIndex = 0;
  const run = async (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === "git" && args[0] === "rev-parse") return response(`${commitSha}\n`);
    if (command === "git" && args[0] === "ls-remote") {
      const value = Array.isArray(remoteSha) ? remoteSha[Math.min(remoteShaIndex++, remoteSha.length - 1)] : remoteSha;
      return response(`${value}\trefs/heads/main\n`);
    }
    if (command === "unzip") {
      const result = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
      return response(result.stdout, result.stderr);
    }
    if (command !== "aws") throw new Error(`Unexpected command ${command}`);

    if (args[0] === "cloudformation" && args[1] === "describe-stacks") {
      return response(JSON.stringify(stackResponse(status, roleArn)));
    }
    if (args[0] === "cloudformation" && args[1] === "get-template") {
      return response(JSON.stringify({ TemplateBody: originalTemplate ?? targetTemplate }));
    }
    if (args[0] === "s3" && args[1] === "cp") return response();
    if (args[0] === "cloudformation" && args[1] === "create-change-set") {
      if (failure) throw failure;
      if (noChange) {
        const error = new Error("create change set failed");
        error.stderr = "An error occurred (ValidationError): The submitted information didn't contain changes. Submit different information to create a change set.";
        throw error;
      }
      return response(JSON.stringify({ Id: `arn:aws:cloudformation:us-east-1:123456789012:changeSet/${args[args.indexOf("--change-set-name") + 1]}/abc` }));
    }
    if (args[0] === "cloudformation" && args[1] === "describe-change-set") {
      const value = changeSetResponses[Math.min(changeSetIndex++, changeSetResponses.length - 1)];
      return response(JSON.stringify(value));
    }
    if (args[0] === "cloudformation" && args[1] === "wait") {
      if (stackWaitFailure && args[2] === "stack-update-complete") {
        throw new Error("Waiter StackUpdateComplete failed after stack execution");
      }
      return response();
    }
    if (args[0] === "cloudformation" && args[1] === "execute-change-set") return response();
    if (args[0] === "lambda" && args[1] === "get-function") {
      return response(JSON.stringify({
        Configuration: { FunctionName: functionName },
        Code: { Location: "https://signed.example/never-log-this-url" }
      }));
    }
    throw new Error(`Unexpected AWS command: ${args.join(" ")}`);
  };
  return { calls, run };
}

function fetchArchive(source) {
  return async (url, options) => {
    assert.equal(url, "https://signed.example/never-log-this-url");
    assert.deepEqual(options, { redirect: "error" });
    const workDir = mkdtempSync(join(tmpdir(), "content-stats-deploy-test-"));
    const sourcePath = join(workDir, "index.js");
    const archivePath = join(workDir, "function.zip");
    try {
      writeFileSync(sourcePath, source, "utf8");
      await execFileAsync("python3", [
        "-c",
        "import sys, zipfile; archive = zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED); archive.write(sys.argv[2], 'index.js'); archive.close()",
        archivePath,
        sourcePath
      ]);
      const archive = readFileSync(archivePath);
      return { ok: true, arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  };
}

test("collector deployment config is limited to main with a full commit SHA", () => {
  assert.equal(validateCollectorDeploymentConfig(env()).commitSha, commitSha);
  assert.throws(() => validateCollectorDeploymentConfig(env({ GITHUB_REF: "refs/heads/feature" })), /restricted to refs\/heads\/main/);
  assert.throws(() => validateCollectorDeploymentConfig(env({ GITHUB_SHA: "short" })), /full Git commit SHA/);
});

test("template comparison allows only the collector inline code property", () => {
  const original = structuredClone(targetTemplate);
  original.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  assert.equal(compareCollectorTemplates(original, targetTemplate).changed, true);

  original.Resources.SiteBucket.Properties.Tags = [{ Key: "changed", Value: "outside-code" }];
  assert.throws(() => compareCollectorTemplates(original, targetTemplate), /outside ContentStatsCollector/);
});

test("a changed collector is updated once through CloudFormation and verified from the signed archive", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const { calls, run } = awsRun({ originalTemplate });
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });

  assert.equal(result.status, "updated");
  assert.equal(result.functionName, functionName);
  assert.equal(result.sourceSha256, createHash("sha256").update(targetSource).digest("hex"));
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set").length, 1);
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "wait" && args[2] === "stack-update-complete").length, 1);

  const uploadIndex = calls.findIndex(({ command, args }) => command === "aws" && args[0] === "s3" && args[1] === "cp");
  const createIndex = calls.findIndex(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "create-change-set");
  const executeIndex = calls.findIndex(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set");
  assert.ok(uploadIndex < createIndex && createIndex < executeIndex, "upload, change-set, and execution must occur in order");
  const createArgs = calls[createIndex].args;
  const parameters = JSON.parse(createArgs[createArgs.indexOf("--parameters") + 1]);
  assert.ok(parameters.every((parameter) => parameter.UsePreviousValue === true && !Object.hasOwn(parameter, "ParameterValue")));
  assert.equal(JSON.stringify(createArgs).includes("value-must-not-be-reused"), false, "parameter values must not be forwarded");
  assert.equal(createArgs[createArgs.indexOf("--capabilities") + 1], "CAPABILITY_IAM");
  assert.equal(createArgs.includes("--resource-types"), false, "the full existing template requires capability acknowledgement");
  assert.equal(calls[executeIndex].options.timeoutMs, undefined);
  assert.ok(calls.some(({ command, args, options }) => command === "aws" && args[1] === "wait" && options.timeoutMs === 20 * 60 * 1000));
});

test("a code-only template accepts the known dynamic collector and Scheduler dependency previews", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const changeSet = changeSetResponse();
  changeSet.Changes.push(
    dynamicReferencePreview({
      logicalId: "ContentStatsSchedulerRole",
      resourceType: "AWS::IAM::Role",
      targetName: "Policies",
      causingEntities: ["ContentStatsCollector.Arn"]
    }),
    dynamicReferencePreview({
      logicalId: "ContentStatsDailySchedule",
      resourceType: "AWS::Scheduler::Schedule",
      targetName: "Target",
      causingEntities: ["ContentStatsCollector.Arn", "ContentStatsSchedulerRole.Arn"]
    })
  );
  const { calls, run } = awsRun({ originalTemplate, changeSetResponses: [changeSet] });
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });

  assert.equal(result.status, "updated");
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set").length, 1);
});

test("a code-only template accepts the exact four-resource dynamic GetAtt preview", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const changeSet = changeSetResponse();
  changeSet.Changes.push(
    dynamicReferencePreview({
      logicalId: "ContentStatsSchedulerRole",
      resourceType: "AWS::IAM::Role",
      targetName: "Policies",
      causingEntities: ["ContentStatsCollector.Arn"]
    }),
    dynamicReferencePreview({
      logicalId: "ContentStatsDailySchedule",
      resourceType: "AWS::Scheduler::Schedule",
      targetName: "Target",
      causingEntities: ["ContentStatsCollector.Arn", "ContentStatsSchedulerRole.Arn"]
    }),
    dynamicReferencePreview({
      logicalId: "SiteDeploymentRole",
      resourceType: "AWS::IAM::Role",
      targetName: "Policies",
      causingEntities: ["ContentStatsSchedulerRole.Arn"]
    })
  );
  const { calls, run } = awsRun({ originalTemplate, changeSetResponses: [changeSet] });
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });

  assert.equal(result.status, "updated");
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set").length, 1);
});

test("direct or static Scheduler dependency changes are rejected before execution", async (t) => {
  const invalidPreviews = [
    {
      name: "direct IAM role edit",
      preview: dynamicReferencePreview({
        logicalId: "ContentStatsSchedulerRole",
        resourceType: "AWS::IAM::Role",
        targetName: "Policies",
        causingEntities: ["ContentStatsCollector.Arn"]
      }),
      mutate(preview) {
        preview.ResourceChange.Details[0].ChangeSource = "DirectModification";
      }
    },
    {
      name: "static schedule edit",
      preview: dynamicReferencePreview({
        logicalId: "ContentStatsDailySchedule",
        resourceType: "AWS::Scheduler::Schedule",
        targetName: "Target",
        causingEntities: ["ContentStatsCollector.Arn"]
      }),
      mutate(preview) {
        preview.ResourceChange.Details[0].Evaluation = "Static";
      }
    }
  ];

  for (const { name, preview, mutate } of invalidPreviews) {
    await t.test(name, async () => {
      const originalTemplate = structuredClone(targetTemplate);
      originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
      mutate(preview);
      const changeSet = changeSetResponse();
      changeSet.Changes.push(preview);
      const { calls, run } = awsRun({ originalTemplate, changeSetResponses: [changeSet] });

      await assert.rejects(
        () => runCollectorDeployment({ env: env(), run }),
        /unexpected or non-dynamic resource change/
      );
      assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
      assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "lambda" && args[1] === "get-function"), false);
    });
  }
});

test("a direct CI deployment policy edit is rejected before execution", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const ciRolePreview = dynamicReferencePreview({
    logicalId: "SiteDeploymentRole",
    resourceType: "AWS::IAM::Role",
    targetName: "Policies",
    causingEntities: ["ContentStatsSchedulerRole.Arn"]
  });
  ciRolePreview.ResourceChange.Details[0].ChangeSource = "DirectModification";
  const changeSet = changeSetResponse();
  changeSet.Changes.push(ciRolePreview);
  const { calls, run } = awsRun({ originalTemplate, changeSetResponses: [changeSet] });

  await assert.rejects(
    () => runCollectorDeployment({ env: env(), run }),
    /unexpected or non-dynamic resource change \(SiteDeploymentRole\)/
  );
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("a replacement CI role preview is rejected before execution", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const ciRolePreview = dynamicReferencePreview({
    logicalId: "SiteDeploymentRole",
    resourceType: "AWS::IAM::Role",
    targetName: "Policies",
    causingEntities: ["ContentStatsSchedulerRole.Arn"]
  });
  ciRolePreview.ResourceChange.Replacement = "True";
  const changeSet = changeSetResponse();
  changeSet.Changes.push(ciRolePreview);
  const { calls, run } = awsRun({ originalTemplate, changeSetResponses: [changeSet] });

  await assert.rejects(
    () => runCollectorDeployment({ env: env(), run }),
    /unexpected or non-dynamic resource change \(SiteDeploymentRole\)/
  );
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("an unchanged deployed template is idempotent and still verifies the live Lambda source", async () => {
  const { calls, run } = awsRun();
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });
  assert.equal(result.status, "unchanged");
  assert.ok(calls.some(({ command, args }) => command === "aws" && args[0] === "lambda" && args[1] === "get-function"));
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "s3"), false);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && ["create-change-set", "execute-change-set"].includes(args[1])), false);
});

test("an infrastructure delta is rejected before template upload or CloudFormation mutation", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  originalTemplate.Metadata = { OutOfScope: true };
  const { calls, run } = awsRun({ originalTemplate });
  await assert.rejects(() => runCollectorDeployment({ env: env(), run }), /outside ContentStatsCollector/);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "s3"), false);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && ["create-change-set", "execute-change-set"].includes(args[1])), false);
});

test("a superseded push exits before AWS access", async () => {
  const { calls, run } = awsRun({ remoteSha: "b".repeat(40) });
  const result = await runCollectorDeployment({ env: env(), run });
  assert.equal(result.status, "superseded");
  assert.equal(calls.some(({ command }) => command === "aws"), false);
});

test("a main advance after change-set preparation prevents execution", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const { calls, run } = awsRun({
    originalTemplate,
    remoteSha: [commitSha, commitSha, commitSha, "b".repeat(40)]
  });
  const result = await runCollectorDeployment({ env: env(), run });
  assert.equal(result.status, "superseded");
  assert.ok(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "describe-change-set"));
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("CREATE_IN_PROGRESS waits and re-describes before rejecting an out-of-scope resource", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const extraResourceChange = changeSetResponse();
  extraResourceChange.Changes.push({ ResourceChange: {
    LogicalResourceId: "SiteBucket",
    ResourceType: "AWS::S3::Bucket",
    Action: "Modify",
    Replacement: "False"
  } });
  const { calls, run } = awsRun({
    originalTemplate,
    changeSetResponses: [
      { Status: "CREATE_IN_PROGRESS", ExecutionStatus: "UNAVAILABLE", Changes: [] },
      extraResourceChange
    ]
  });

  await assert.rejects(() => runCollectorDeployment({ env: env(), run }), /unexpected or non-dynamic resource change \(SiteBucket\)/);
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "describe-change-set").length, 2);
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "wait" && args[2] === "change-set-create-complete").length, 1);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("a repaired release can proceed from UPDATE_ROLLBACK_COMPLETE", async () => {
  const { run } = awsRun({ status: "UPDATE_ROLLBACK_COMPLETE" });
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });
  assert.equal(result.status, "unchanged");
});

test("a stack service role is rejected so the existing caller permissions remain the update boundary", async () => {
  const { calls, run } = awsRun({ roleArn: "arn:aws:iam::123456789012:role/uninspected-service-role" });
  await assert.rejects(() => runCollectorDeployment({ env: env(), run }), /has a service role/);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "get-template"), false);
});

test("a genuine no-change CloudFormation response verifies the current function without executing", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const { calls, run } = awsRun({ originalTemplate, noChange: true });
  const result = await runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) });
  assert.equal(result.status, "unchanged");
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("a failed change-set command is retained as a failure", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const { calls, run } = awsRun({ originalTemplate, failure: new Error("AccessDenied from CloudFormation") });
  await assert.rejects(() => runCollectorDeployment({ env: env(), run }), /AccessDenied from CloudFormation/);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set"), false);
});

test("a failed stack-update waiter fails the release and skips Lambda readback", async () => {
  const originalTemplate = structuredClone(targetTemplate);
  originalTemplate.Resources.ContentStatsCollector.Properties.Code.ZipFile = "older collector source\n";
  const { calls, run } = awsRun({ originalTemplate, stackWaitFailure: true });

  await assert.rejects(
    () => runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(targetSource) }),
    /Waiter StackUpdateComplete failed/
  );
  assert.equal(calls.filter(({ command, args }) => command === "aws" && args[0] === "cloudformation" && args[1] === "execute-change-set").length, 1);
  assert.equal(calls.some(({ command, args }) => command === "aws" && args[0] === "lambda" && args[1] === "get-function"), false);
});

test("the deployed archive must contain the exact rendered source", async () => {
  const { run } = awsRun();
  await assert.rejects(
    () => runCollectorDeployment({ env: env(), run, fetchFn: fetchArchive(`${targetSource}unexpected`) }),
    /does not match this commit/
  );
});

test("CI runs collector CloudFormation update before site artifact publication", () => {
  const workflow = readFileSync(new URL("../.github/workflows/site.yml", import.meta.url), "utf8");
  const collectorStep = workflow.indexOf("node scripts/deploy-content-stats-collector.mjs");
  const siteStep = workflow.indexOf("node scripts/deploy.mjs");
  assert.ok(collectorStep !== -1 && siteStep !== -1 && collectorStep < siteStep);
  assert.match(workflow, /group: production-site/);
});

test("CI IAM permits only template reads and scoped collector code change sets", () => {
  const template = JSON.parse(readFileSync(new URL("../infra/template.json", import.meta.url), "utf8"));
  const policy = template.Resources.SiteDeploymentRole.Properties.Policies[0].PolicyDocument;
  const statements = policy.Statement;
  const templateRead = statements.find(({ Sid }) => Sid === "ReadCollectorTemplates");
  assert.deepEqual(templateRead.Action, "s3:GetObject");
  assert.match(JSON.stringify(templateRead.Resource), /_content-stats\/templates\/\*/);
  const stackRead = statements.find(({ Sid }) => Sid === "ReadCollectorStackTemplate");
  assert.deepEqual(stackRead.Action.sort(), ["cloudformation:DescribeStacks", "cloudformation:GetTemplate"].sort());
  assert.match(JSON.stringify(stackRead.Resource), /stack\/\$\{AWS::StackName\}\/\*/);
  const createChangeSet = statements.find(({ Sid }) => Sid === "CreateCollectorCodeChangeSet");
  assert.equal(createChangeSet.Action, "cloudformation:CreateChangeSet");
  assert.match(JSON.stringify(createChangeSet.Resource), /stack\/\$\{AWS::StackName\}\/\*/);
  assert.equal(createChangeSet.Condition.StringLike["cloudformation:ChangeSetName"], "content-stats-collector-*");
  assert.match(JSON.stringify(createChangeSet.Condition.StringLike["cloudformation:TemplateUrl"]), /_content-stats\/templates\/\*/);
  const inspectChangeSet = statements.find(({ Sid }) => Sid === "InspectAndExecuteCollectorCodeChangeSet");
  assert.deepEqual(inspectChangeSet.Action.sort(), ["cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet"].sort());
  assert.match(JSON.stringify(inspectChangeSet.Resource), /stack\/\$\{AWS::StackName\}\/\*/);
  assert.equal(inspectChangeSet.Condition, undefined);
  const lambda = statements.find(({ Sid }) => Sid === "ReadAndUpdateCollectorFunction");
  assert.deepEqual(lambda.Action.sort(), [
    "lambda:GetFunction",
    "lambda:GetFunctionCodeSigningConfig",
    "lambda:GetFunctionRecursionConfig",
    "lambda:GetRuntimeManagementConfig",
    "lambda:GetFunctionScalingConfig",
    "lambda:ListTags",
    "lambda:TagResource",
    "lambda:UntagResource",
    "lambda:UpdateFunctionCode",
    "lambda:UpdateFunctionConfiguration"
  ].sort());
  assert.match(JSON.stringify(lambda.Resource), /function:\$\{AWS::StackName\}-ContentStatsCollector/);
  const passRole = statements.find(({ Sid }) => Sid === "PassCollectorExecutionRoleToLambda");
  assert.equal(passRole.Action, "iam:PassRole");
  assert.deepEqual(passRole.Resource, { "Fn::GetAtt": ["ContentStatsCollectorExecutionRole", "Arn"] });
  assert.deepEqual(passRole.Condition.StringEquals["iam:PassedToService"], "lambda.amazonaws.com");
  const roleRead = statements.find(({ Sid }) => Sid === "ReadCollectorRelatedRoles");
  assert.equal(roleRead.Action, "iam:GetRole");
  assert.deepEqual(roleRead.Resource, [
    { "Fn::GetAtt": ["ContentStatsCollectorExecutionRole", "Arn"] },
    { "Fn::GetAtt": ["ContentStatsSchedulerRole", "Arn"] }
  ]);
  const actionNames = statements.flatMap(({ Action }) => Array.isArray(Action) ? Action : [Action]);
  assert.equal(actionNames.some((action) => /(?:InvokeFunction|scheduler:|secretsmanager:|ssm:|logs:|GetFunctionConfiguration)/i.test(action)), false);
  assert.deepEqual(actionNames.filter((action) => action.startsWith("iam:")).sort(), ["iam:GetRole", "iam:PassRole"].sort());
  assert.ok(actionNames.includes("s3:ListBucket"));
  assert.ok(actionNames.includes("s3:PutObject"));
  const outputDeny = statements.find(({ Sid }) => Sid === "DenyCollectorOutputWrites");
  assert.equal(outputDeny.Effect, "Deny");
  assert.equal(outputDeny.Action, "s3:PutObject");
  assert.match(JSON.stringify(outputDeny.Resource), /\/content-stats\/\*/);
});
