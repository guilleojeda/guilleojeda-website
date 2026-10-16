import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const sourcePath = new URL("../infra/content-stats-collector.cjs", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const requireFromHere = createRequire(import.meta.url);

function record(overrides = {}) {
  return {
    id: "synthetic-article",
    published: "published",
    ...overrides,
    data: {
      url: "/blog/synthetic-article",
      publishedDate: Date.now() - 60_000,
      authors: [{ author: { id: "owner", value: { name: "Synthetic Author" } } }],
      ...overrides.data
    }
  };
}

function invokeWith(records) {
  const objects = new Map([[
    "_content-stats/inputs.json",
    JSON.stringify({
      schemaVersion: 1,
      definitionVersion: 1,
      source: { id: "caylent", authorId: "owner", apiKey: "test-key", language: "en", originality: "original" }
    })
  ]]);
  const putCalls = [];
  class GetObjectCommand {
    constructor(input) { this.input = input; }
  }
  class PutObjectCommand {
    constructor(input) { this.input = input; }
  }
  class S3Client {
    async send(command) {
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToString: async () => objects.get(command.input.Key) } };
      }
      if (command instanceof PutObjectCommand) {
        putCalls.push(command.input);
        return {};
      }
      throw new Error("Unexpected S3 command");
    }
  }

  const moduleObject = { exports: {} };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require(name) {
      if (name === "@aws-sdk/client-s3") return { S3Client, GetObjectCommand, PutObjectCommand };
      return requireFromHere(name);
    },
    process: { env: {
      STATS_BUCKET: "test-bucket",
      STATS_INPUT_KEY: "_content-stats/inputs.json",
      STATS_OUTPUT_KEY: "content-stats/v1/current.json"
    } },
    fetch: async (input) => {
      const url = new URL(String(input));
      return { ok: true, status: 200, json: async () => ({ results: Number(url.searchParams.get("offset")) === 0 ? records : [] }) };
    },
    AbortSignal,
    URL,
    URLSearchParams,
    console: { info() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath.pathname });
  return { handler: moduleObject.exports.handler, putCalls };
}

test("eligible records require a secure Caylent blog URL", async () => {
  const validHarness = invokeWith([record()]);
  await validHarness.handler({}, {});
  assert.equal(validHarness.putCalls.length, 1, "a valid Caylent blog record must publish successfully");

  const invalidUrls = [
    "https://other.example/blog/synthetic-article",
    "http://caylent.com/blog/synthetic-article",
    "https://user:password@caylent.com/blog/synthetic-article",
    "/insights/synthetic-article",
    "/blog/"
  ];

  for (const url of invalidUrls) {
    const harness = invokeWith([record({ data: { url } })]);
    await assert.rejects(
      () => harness.handler({}, {}),
      (error) => error.code === "ELIGIBLE_RECORD_INVALID"
    );
    assert.equal(harness.putCalls.length, 0, `invalid article URL must prevent publication: ${url}`);
  }
});

test("published and schedule timestamps must be representable Date values", async () => {
  const validHarness = invokeWith([record()]);
  await validHarness.handler({}, {});
  assert.equal(validHarness.putCalls.length, 1, "a valid published record must publish successfully");

  const invalidRecords = [
    record({ data: { publishedDate: 8_640_000_000_000_001 } }),
    record({ startDate: Number.MAX_SAFE_INTEGER }),
    record({ endDate: 8_640_000_000_000_001 })
  ];

  for (const item of invalidRecords) {
    const harness = invokeWith([item]);
    await assert.rejects(
      () => harness.handler({}, {}),
      (error) => error.code === "ELIGIBLE_RECORD_INVALID"
    );
    assert.equal(harness.putCalls.length, 0, "an unrepresentable date must prevent publication");
  }
});
