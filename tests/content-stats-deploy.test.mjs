import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { runDeployment } from "../scripts/deploy.mjs";

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

function writePages(directory) {
  mkdirSync(join(directory, "es"), { recursive: true });
  writeFileSync(join(directory, "index.html"), "<html lang=\"en\">current</html>");
  writeFileSync(join(directory, "es", "index.html"), "<html lang=\"es\">current</html>");
  writeFileSync(join(directory, "404.html"), "<html>404 current</html>");
}

function smokeFetch(directory) {
  return async (url) => {
    const relativePath = url.pathname === "/" ? "index.html" : url.pathname === "/es/" ? "es/index.html" : "404.html";
    const status = relativePath === "404.html" ? 404 : 200;
    return { status, text: async () => readFileSync(join(directory, relativePath), "utf8") };
  };
}

test("the protected collector input uses the normal JSON and revalidation upload metadata", async () => {
  const directory = mkdtempSync(join(tmpdir(), "site-deploy-stats-input-"));
  try {
    writePages(directory);
    mkdirSync(join(directory, "_content-stats"), { recursive: true });
    // This is a synthetic English fixture; it does not set Caylent's real language policy.
    writeFileSync(join(directory, "_content-stats", "inputs.json"), JSON.stringify({
      schemaVersion: 1,
      definitionVersion: 1,
      source: { id: "caylent", authorId: "example-author", apiKey: "public-site-key", language: "en", originality: "original" }
    }));

    const calls = [];
    const run = async (command, args) => {
      calls.push({ command, args });
      if (command === "git") return { stdout: "sha-current\trefs/heads/main\n", stderr: "" };
      if (command === "aws" && args[0] === "cloudfront" && args[1] === "create-invalidation") {
        return { stdout: JSON.stringify({ Invalidation: { Id: "I123" } }), stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    await runDeployment({ env: deploymentEnv(directory), run, fetchFn: smokeFetch(directory) });
    const inputUploads = calls.filter(({ command, args }) =>
      command === "aws" && args[0] === "s3" && args[1] === "cp" && args[3] === "s3://site-bucket/_content-stats/inputs.json"
    );
    assert.equal(inputUploads.length, 1, "the exact build input object must be uploaded once");
    assert.equal(inputUploads[0].args[inputUploads[0].args.indexOf("--content-type") + 1], "application/json; charset=utf-8");
    assert.equal(inputUploads[0].args[inputUploads[0].args.indexOf("--cache-control") + 1], "public,max-age=0,must-revalidate");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a build that includes the collector-owned public aggregate is refused before AWS mutation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "site-deploy-stats-tamper-"));
  try {
    writePages(directory);
    mkdirSync(join(directory, "content-stats", "v1"), { recursive: true });
    writeFileSync(join(directory, "content-stats", "v1", "current.json"), JSON.stringify({ schemaVersion: 1, groups: {} }));

    const calls = [];
    await assert.rejects(
      () => runDeployment({
        env: deploymentEnv(directory),
        run: async (command, args) => {
          calls.push({ command, args });
          if (command === "git") return { stdout: "sha-current\trefs/heads/main\n", stderr: "" };
          if (command === "aws" && args[0] === "cloudfront" && args[1] === "create-invalidation") {
            return { stdout: JSON.stringify({ Invalidation: { Id: "I123" } }), stderr: "" };
          }
          return { stdout: "", stderr: "" };
        },
        fetchFn: smokeFetch(directory)
      }),
      /content-stats|collector-owned|reserved/i
    );
    assert.equal(calls.some(({ command }) => command === "aws"), false, "rejected output must not invoke AWS");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
