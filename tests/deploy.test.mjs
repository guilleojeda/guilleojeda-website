import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  cacheControlFor,
  runDeployment,
  smokeCheck,
  validateDeploymentConfig
} from "../scripts/deploy.mjs";

function deploymentEnv(distDir, commitSha = "sha-current") {
  return {
    AWS_REGION: "us-east-1",
    AWS_ROLE_ARN: "arn:aws:iam::719535286359:role/site-deployer",
    S3_BUCKET: "site-bucket",
    CLOUDFRONT_DISTRIBUTION_ID: "EDFDVBD6EXAMPLE",
    SITE_URL: "https://d111111abcdef8.cloudfront.net",
    GITHUB_SHA: commitSha,
    GITHUB_REF: "refs/heads/main",
    DIST_DIR: distDir
  };
}

function writeSmokeArtifacts(directory, bodies = {}) {
  mkdirSync(join(directory, "es"), { recursive: true });
  writeFileSync(join(directory, "index.html"), bodies.english || "<html lang=\"en\">current</html>");
  writeFileSync(join(directory, "es", "index.html"), bodies.spanish || "<html lang=\"es\">current</html>");
  writeFileSync(join(directory, "404.html"), bodies.notFound || "<html>404 current</html>");
}

test("missing deployment configuration fails before any command can mutate AWS", async () => {
  let commandCount = 0;
  await assert.rejects(
    () => runDeployment({
      env: { GITHUB_SHA: "sha-current", DIST_DIR: "/does/not/matter" },
      run: async () => {
        commandCount += 1;
        throw new Error("command should not run");
      }
    }),
    /Missing required deployment configuration: AWS_REGION, AWS_ROLE_ARN, S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, SITE_URL/
  );
  assert.equal(commandCount, 0);
});

test("a superseded main commit is skipped before the first S3 command", async () => {
  const directory = mkdtempSync(join(tmpdir(), "site-deploy-stale-"));
  try {
    writeSmokeArtifacts(directory);
    const calls = [];
    const result = await runDeployment({
      env: deploymentEnv(directory, "old-commit"),
      run: async (command, args) => {
        calls.push({ command, args });
        return { stdout: "new-commit\trefs/heads/main\n", stderr: "" };
      }
    });

    assert.deepEqual(result, {
      status: "superseded",
      commitSha: "old-commit",
      currentMainSha: "new-commit",
      uploaded: 0
    });
    assert.deepEqual(calls.map(({ command }) => command), ["git"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("publication uploads immutable assets first, revalidating files second, then invalidates and smokes the live site", async () => {
  const directory = mkdtempSync(join(tmpdir(), "site-deploy-publish-"));
  try {
    mkdirSync(join(directory, "_astro"));
    writeFileSync(join(directory, "_astro", "site.deadbeef.js"), "console.log('asset');");
    writeSmokeArtifacts(directory, {
      english: "<html lang=\"en\">current</html>",
      spanish: "<html lang=\"es\">current</html>",
      notFound: "<html>404 current /es/</html>"
    });
    writeFileSync(join(directory, "robots.txt"), "User-agent: *");

    const calls = [];
    const run = async (command, args) => {
      calls.push({ command, args });
      if (command === "git") {
        return { stdout: "sha-current\trefs/heads/main\n", stderr: "" };
      }
      if (command === "aws" && args[0] === "cloudfront" && args[1] === "create-invalidation") {
        return { stdout: JSON.stringify({ Invalidation: { Id: "I123" } }), stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const fetchFn = async (url) => {
      if (url.pathname === "/") {
        return { status: 200, text: async () => readFileSync(join(directory, "index.html"), "utf8") };
      }
      if (url.pathname === "/es/") {
        return { status: 200, text: async () => readFileSync(join(directory, "es", "index.html"), "utf8") };
      }
      return { status: 404, text: async () => readFileSync(join(directory, "404.html"), "utf8") };
    };

    const result = await runDeployment({ env: deploymentEnv(directory), run, fetchFn });
    const uploads = calls.filter(({ command, args }) => command === "aws" && args[0] === "s3" && args[1] === "cp");
    assert.deepEqual(uploads.map(({ args }) => args[3]), [
      "s3://site-bucket/_astro/site.deadbeef.js",
      "s3://site-bucket/404.html",
      "s3://site-bucket/es/index.html",
      "s3://site-bucket/index.html",
      "s3://site-bucket/robots.txt"
    ]);
    assert.equal(uploads[0].args[7], cacheControlFor("_astro/site.deadbeef.js"));
    assert.equal(uploads[1].args[7], "public,max-age=0,must-revalidate");
    assert.equal(uploads[2].args[7], "public,max-age=0,must-revalidate");
    assert.equal(uploads[3].args[7], "public,max-age=0,must-revalidate");
    assert.equal(uploads[4].args[7], "public,max-age=0,must-revalidate");
    assert.ok(calls.some(({ command, args }) => command === "aws" && args[0] === "cloudfront" && args[1] === "wait"));
    assert.ok(calls.every(({ args }) => !args.includes("--delete")));
    assert.equal(result.status, "published");
    assert.equal(result.invalidationId, "I123");
    assert.deepEqual(result.smoke.map(({ path, status }) => [path, status]), [
      ["/", 200],
      ["/es/", 200],
      ["/__phase1-missing-marker__", 404]
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("smoke checks reject stale page content and a generic wrong 404", async () => {
  const directory = mkdtempSync(join(tmpdir(), "site-deploy-smoke-"));
  try {
    writeSmokeArtifacts(directory, {
      english: "<html lang=\"en\">current</html>",
      spanish: "<html lang=\"es\">current</html>",
      notFound: "<html>404 current /es/</html>"
    });
    const expectedEnglish = readFileSync(join(directory, "index.html"), "utf8");
    const expectedSpanish = readFileSync(join(directory, "es", "index.html"), "utf8");
    const expectedNotFound = readFileSync(join(directory, "404.html"), "utf8");
    const siteUrl = "https://d111111abcdef8.cloudfront.net";

    await assert.rejects(
      () => smokeCheck({
        siteUrl,
        distDir: directory,
        fetchFn: async (url) => {
          if (url.pathname === "/") return { status: 200, text: async () => "<html lang=\"en\">stale</html>" };
          if (url.pathname === "/es/") return { status: 200, text: async () => expectedSpanish };
          return { status: 404, text: async () => expectedNotFound };
        }
      }),
      /\/ response body did not match the exact build artifact/
    );

    await assert.rejects(
      () => smokeCheck({
        siteUrl,
        distDir: directory,
        fetchFn: async (url) => {
          if (url.pathname === "/") return { status: 200, text: async () => expectedEnglish };
          if (url.pathname === "/es/") return { status: 200, text: async () => expectedSpanish };
          return { status: 404, text: async () => "404" };
        }
      }),
      /__phase1-missing-marker__ response body did not match the exact build artifact/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployment validation rejects a non-main ref", () => {
  assert.throws(
    () => validateDeploymentConfig({
      AWS_REGION: "us-east-1",
      AWS_ROLE_ARN: "arn:aws:iam::719535286359:role/site-deployer",
      S3_BUCKET: "site-bucket",
      CLOUDFRONT_DISTRIBUTION_ID: "EDFDVBD6EXAMPLE",
      SITE_URL: "https://d111111abcdef8.cloudfront.net",
      GITHUB_SHA: "sha-current",
      GITHUB_REF: "refs/heads/feature"
    }),
    /restricted to refs\/heads\/main/
  );
});
