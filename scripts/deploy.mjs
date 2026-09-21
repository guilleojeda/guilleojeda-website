import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const REQUIRED_DEPLOYMENT_VARS = [
  "AWS_REGION",
  "AWS_ROLE_ARN",
  "S3_BUCKET",
  "CLOUDFRONT_DISTRIBUTION_ID",
  "SITE_URL"
];

const immutableCacheControl = "public,max-age=31536000,immutable";
const revalidatingCacheControl = "public,max-age=0,must-revalidate";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"]
]);

export function validateDeploymentConfig(env = process.env) {
  const missing = REQUIRED_DEPLOYMENT_VARS.filter((name) => !String(env[name] ?? "").trim());
  if (!String(env.GITHUB_SHA ?? "").trim()) {
    missing.push("GITHUB_SHA");
  }
  if (missing.length > 0) {
    throw new Error(`Missing required deployment configuration: ${missing.join(", ")}`);
  }

  if (env.GITHUB_REF && env.GITHUB_REF !== "refs/heads/main") {
    throw new Error(`Deployment is restricted to refs/heads/main (received ${env.GITHUB_REF})`);
  }

  let siteUrl;
  try {
    siteUrl = new URL(env.SITE_URL);
  } catch {
    throw new Error("SITE_URL must be an absolute HTTPS URL");
  }
  if (siteUrl.protocol !== "https:" || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash) {
    throw new Error("SITE_URL must be an absolute HTTPS URL without credentials, query, or fragment");
  }
  if (siteUrl.pathname !== "/") {
    throw new Error("SITE_URL must point to the site origin without a path");
  }

  const distributionId = String(env.CLOUDFRONT_DISTRIBUTION_ID).trim();
  if (!/^[A-Z0-9]+$/i.test(distributionId)) {
    throw new Error("CLOUDFRONT_DISTRIBUTION_ID must be a CloudFront distribution ID");
  }

  return {
    region: String(env.AWS_REGION).trim(),
    roleArn: String(env.AWS_ROLE_ARN).trim(),
    bucket: String(env.S3_BUCKET).trim(),
    distributionId,
    siteUrl: siteUrl.toString().replace(/\/$/, ""),
    commitSha: String(env.GITHUB_SHA).trim(),
    distDir: resolve(env.DIST_DIR || "dist")
  };
}

export function isImmutableAsset(key) {
  return key.startsWith("_astro/") || /(?:^|\/)[^/]+\.[a-f0-9]{8,}(?:\.[^/]+)+$/i.test(key);
}

export function cacheControlFor(key) {
  return isImmutableAsset(key) ? immutableCacheControl : revalidatingCacheControl;
}

export function contentTypeFor(key) {
  return contentTypes.get(extname(key).toLowerCase()) || "application/octet-stream";
}

function listBuildFiles(directory, root = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listBuildFiles(absolutePath, root));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        key: relative(root, absolutePath).split(sep).join("/")
      });
    } else {
      throw new Error(`Unsupported build output entry: ${absolutePath}`);
    }
  }
  return files.sort((left, right) => left.key.localeCompare(right.key));
}

export async function runCommand(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || process.cwd(),
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    windowsHide: true
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

async function currentMainSha(run, cwd) {
  const result = await run("git", ["ls-remote", "origin", "refs/heads/main"], { cwd });
  const remoteSha = String(result.stdout || "").trim().split(/\s+/)[0];
  if (!remoteSha) {
    throw new Error("Could not resolve the current origin/main commit before upload");
  }
  return remoteSha;
}

async function uploadFile(run, file, config, cwd) {
  const destination = `s3://${config.bucket}/${file.key}`;
  await run(
    "aws",
    [
      "s3",
      "cp",
      file.absolutePath,
      destination,
      "--region",
      config.region,
      "--cache-control",
      cacheControlFor(file.key),
      "--content-type",
      contentTypeFor(file.key),
      "--only-show-errors"
    ],
    { cwd }
  );
}

async function invalidate(run, config, cwd) {
  const createResult = await run(
    "aws",
    [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      config.distributionId,
      "--paths",
      "/*",
      "--region",
      config.region,
      "--output",
      "json"
    ],
    { cwd }
  );
  let payload;
  try {
    payload = JSON.parse(createResult.stdout);
  } catch {
    throw new Error("CloudFront create-invalidation returned invalid JSON");
  }
  const invalidationId = payload?.Invalidation?.Id;
  if (!invalidationId) {
    throw new Error("CloudFront create-invalidation returned no invalidation ID");
  }

  await run(
    "aws",
    [
      "cloudfront",
      "wait",
      "invalidation-completed",
      "--distribution-id",
      config.distributionId,
      "--id",
      invalidationId,
      "--region",
      config.region
    ],
    { cwd }
  );
  return invalidationId;
}

async function fetchSmoke(fetchFn, siteUrl, path, expectedStatus, expectedBody, artifactPath) {
  const response = await fetchFn(new URL(path, `${siteUrl}/`), { redirect: "manual" });
  const body = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  if (body !== expectedBody) {
    throw new Error(`${path} response body did not match the exact build artifact ${artifactPath}`);
  }
  return { path, status: response.status };
}

export function expectedSmokeBodies(distDir) {
  const artifactPaths = {
    "/": resolve(distDir, "index.html"),
    "/es/": resolve(distDir, "es/index.html"),
    "/__phase1-missing-marker__": resolve(distDir, "404.html")
  };
  const expectedBodies = {};
  for (const [path, artifactPath] of Object.entries(artifactPaths)) {
    try {
      expectedBodies[path] = readFileSync(artifactPath, "utf8");
    } catch {
      throw new Error(`Required smoke-test artifact is missing: ${artifactPath}`);
    }
  }
  return { artifactPaths, expectedBodies };
}

export async function smokeCheck({ siteUrl, distDir, fetchFn = fetch }) {
  const { artifactPaths, expectedBodies } = expectedSmokeBodies(distDir);
  const checks = [];
  checks.push(await fetchSmoke(fetchFn, siteUrl, "/", 200, expectedBodies["/"], artifactPaths["/"]));
  checks.push(await fetchSmoke(fetchFn, siteUrl, "/es/", 200, expectedBodies["/es/"], artifactPaths["/es/"]));
  checks.push(await fetchSmoke(
    fetchFn,
    siteUrl,
    "/__phase1-missing-marker__",
    404,
    expectedBodies["/__phase1-missing-marker__"],
    artifactPaths["/__phase1-missing-marker__"]
  ));
  return checks;
}

export async function runDeployment({
  env = process.env,
  cwd = process.cwd(),
  run = runCommand,
  fetchFn = fetch
} = {}) {
  const config = validateDeploymentConfig(env);
  const files = listBuildFiles(config.distDir);
  if (files.length === 0) {
    throw new Error(`No files found in build output directory ${config.distDir}`);
  }
  // Validate the exact pages used by the post-invalidation smoke check before
  // any AWS command. A malformed artifact must never publish first.
  expectedSmokeBodies(config.distDir);

  // This read-only check is deliberately before the first S3 or CloudFront
  // command. A queued run for an older main commit therefore cannot publish.
  const remoteMainSha = await currentMainSha(run, cwd);
  if (remoteMainSha !== config.commitSha) {
    return {
      status: "superseded",
      commitSha: config.commitSha,
      currentMainSha: remoteMainSha,
      uploaded: 0
    };
  }

  const immutableFiles = files.filter((file) => isImmutableAsset(file.key));
  const mutableFiles = files.filter((file) => !isImmutableAsset(file.key));
  for (const file of [...immutableFiles, ...mutableFiles]) {
    await uploadFile(run, file, config, cwd);
  }

  const invalidationId = await invalidate(run, config, cwd);
  const smoke = await smokeCheck({ siteUrl: config.siteUrl, distDir: config.distDir, fetchFn });
  return {
    status: "published",
    commitSha: config.commitSha,
    uploaded: files.length,
    invalidationId,
    smoke
  };
}

const invokedScript = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedScript) {
  runDeployment()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
