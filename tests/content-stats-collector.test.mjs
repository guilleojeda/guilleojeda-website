import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const collectorPath = new URL("../infra/content-stats-collector.cjs", import.meta.url);
const inputKey = "_content-stats/inputs.json";
const outputKey = "content-stats/v1/current.json";
const bucket = "stats-test-bucket";
const cacheControl = "public,max-age=0,must-revalidate";
const secretKey = "synthetic-public-delivery-key";
const privateAuthorId = "synthetic-author-id";

function sourceInput({ language = "en", authorId = privateAuthorId } = {}) {
  return {
    schemaVersion: 1,
    definitionVersion: 1,
    source: {
      id: "caylent",
      authorId,
      apiKey: secretKey,
      language,
      originality: "original"
    }
  };
}

function article({
  id,
  url = `/blog/${id}`,
  publishedDate = Date.parse("2026-10-15T12:00:00.000Z"),
  published = "published",
  authorId = privateAuthorId,
  startDate,
  endDate,
  noTargeting = false
}) {
  return {
    id,
    published,
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    ...(noTargeting ? { noTargeting: true } : {}),
    data: {
      title: `Synthetic private title ${id}`,
      url,
      publishedDate,
      authors: [{ author: { id: authorId, value: { name: "Synthetic Author" } } }]
    }
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function createClock(initialTime = "2026-10-16T12:00:00.000Z") {
  let now = Date.parse(initialTime);
  const NativeDate = Date;
  class ControlledDate extends NativeDate {
    constructor(...args) {
      super(...(args.length === 0 ? [now] : args));
    }

    static now() {
      return now;
    }
  }
  return {
    Date: ControlledDate,
    set(value) {
      now = typeof value === "number" ? value : Date.parse(value);
    }
  };
}

function bodyText(body) {
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return String(body);
}

function createHarness({
  input = sourceInput(),
  fetchFn = async () => jsonResponse({ results: [] }),
  clock = createClock()
} = {}) {
  assert.ok(
    existsSync(collectorPath),
    "Expected infra/content-stats-collector.cjs to export the planned Lambda handler; the collector implementation is not present yet"
  );
  const source = readFileSync(collectorPath, "utf8");
  const objects = new Map([[inputKey, JSON.stringify(input)]]);
  const getCalls = [];
  const putCalls = [];
  const logs = [];

  class GetObjectCommand {
    constructor(params) {
      this.input = params;
    }
  }
  class PutObjectCommand {
    constructor(params) {
      this.input = params;
    }
  }
  class S3Client {
    async send(command) {
      if (command instanceof GetObjectCommand) {
        getCalls.push(JSON.parse(JSON.stringify(command.input)));
        const value = objects.get(command.input.Key);
        if (value === undefined) throw new Error(`Unexpected missing test object: ${command.input.Key}`);
        return { Body: { transformToString: async () => bodyText(value) } };
      }
      if (command instanceof PutObjectCommand) {
        putCalls.push(command.input);
        objects.set(command.input.Key, bodyText(command.input.Body));
        return { ETag: '"synthetic-etag"' };
      }
      throw new Error(`Unexpected S3 command: ${command?.constructor?.name}`);
    }
  }

  const moduleObject = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  const sdk = { S3Client, GetObjectCommand, PutObjectCommand };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require(request) {
      if (request === "@aws-sdk/client-s3") return sdk;
      return nativeRequire(request);
    },
    process: {
      env: {
        STATS_BUCKET: bucket,
        STATS_INPUT_KEY: inputKey,
        STATS_OUTPUT_KEY: outputKey
      }
    },
    fetch: fetchFn,
    Date: clock.Date,
    URL,
    URLSearchParams,
    Buffer,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    console: Object.fromEntries(["log", "info", "warn", "error"].map((level) => [
      level,
      (...parts) => logs.push(parts.map(String).join(" "))
    ]))
  };

  vm.runInNewContext(source, sandbox, { filename: collectorPath.pathname });
  assert.equal(typeof moduleObject.exports.handler, "function", "the public CommonJS module must export handler");

  return {
    handler: moduleObject.exports.handler,
    objects,
    getCalls,
    putCalls,
    logs,
    setInput(nextInput) {
      objects.set(inputKey, JSON.stringify(nextInput));
    }
  };
}

async function readPut(call) {
  return JSON.parse(bodyText(call.Body));
}

function recordPages(pages, requestLog = []) {
  return async (input) => {
    const url = new URL(String(input));
    requestLog.push({ url, offset: Number(url.searchParams.get("offset")) });
    return jsonResponse({ results: pages.get(Number(url.searchParams.get("offset"))) ?? [] });
  };
}

async function assertFailedWithoutReplacing(harness, event = {}) {
  const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
  harness.objects.set(outputKey, previous);
  await assert.rejects(() => harness.handler(event, {}));
  assert.equal(harness.putCalls.length, 0, "a failed collection must not replace the public object");
  assert.equal(harness.objects.get(outputKey), previous, "the last successful bytes must remain intact");
}

test("enumerates complete pages through empty termination and publishes one eligible, deduplicated aggregate", async () => {
  const page0 = Array.from({ length: 10 }, (_, index) => article({ id: `page0-${index}` }));
  const page1 = [
    article({ id: "page0-0", url: "/blog/duplicate-id" }),
    article({ id: "duplicate-url", url: "/blog/page0-1" }),
    article({ id: "draft", published: "draft" }),
    article({ id: "future-date", publishedDate: Date.parse("2026-10-17T12:00:00.000Z") }),
    article({ id: "other-author", authorId: "another-author" }),
    article({
      id: "future-start",
      startDate: Date.parse("2026-10-17T12:00:00.000Z"),
      noTargeting: true
    }),
    article({
      id: "expired-end",
      endDate: Date.parse("2026-10-15T12:00:00.000Z"),
      noTargeting: true
    }),
    article({ id: "page1-7" }),
    article({ id: "page1-8" }),
    article({ id: "page1-9" })
  ];
  const pages = new Map([[0, page0], [10, page1], [20, []]]);
  const requests = [];
  const harness = createHarness({ fetchFn: recordPages(pages, requests) });

  await harness.handler({ time: "2000-01-01T00:00:00.000Z" }, {});

  assert.equal(requests.length, 3, "two full pages must be followed by the empty termination page");
  assert.deepEqual(requests.map(({ offset }) => offset), [0, 10, 20]);
  for (const { url } of requests) {
    assert.equal(url.origin + url.pathname, "https://cdn.builder.io/api/v3/content/blog-post");
    assert.equal(url.searchParams.get("apiKey"), secretKey);
    assert.equal(url.searchParams.get("query.data.authors.author.id"), privateAuthorId);
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.get("includeRefs"), "true");
    assert.equal(url.searchParams.get("noTargeting"), "true");
  }

  assert.equal(harness.getCalls.length, 1);
  assert.deepEqual(harness.getCalls[0], { Bucket: bucket, Key: inputKey });
  assert.equal(harness.putCalls.length, 1, "one complete refresh must produce one S3 replacement");
  const put = harness.putCalls[0];
  assert.equal(put.Bucket, bucket);
  assert.equal(put.Key, outputKey);
  assert.equal(put.ContentType, "application/json");
  assert.equal(put.CacheControl, cacheControl);

  const output = await readPut(put);
  assert.deepEqual(Object.keys(output).sort(), ["groups", "schemaVersion"]);
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(Object.keys(output.groups), ["articles"]);
  const group = output.groups.articles;
  assert.equal(group.definitionVersion, 1);
  assert.equal(group.basis, "cumulative");
  assert.equal(group.collectedAt, "2026-10-16T12:00:00.000Z");
  assert.equal(typeof group.scopeId, "string");
  assert.ok(group.scopeId.length > 0);
  assert.deepEqual(group.sources, [{ id: "caylent", label: "Caylent" }]);
  assert.deepEqual(group.counts, { all: 13, en: 13, es: 0 });
  assert.deepEqual(
    Object.keys(group).sort(),
    ["basis", "collectedAt", "counts", "definitionVersion", "scopeId", "sources"].sort()
  );

  const serialized = bodyText(put.Body);
  for (const privateValue of [secretKey, privateAuthorId, "page0-1", "page1-9", "/blog/", "Synthetic private title"]) {
    assert.equal(serialized.includes(privateValue), false, `public aggregate must omit ${privateValue}`);
  }
  for (const unsupportedField of ["reach", "views", "subscribers", "articlesByUrl", "items"]) {
    assert.equal(Object.hasOwn(output, unsupportedField), false);
    assert.equal(Object.hasOwn(group, unsupportedField), false);
  }
});

test("a successful empty inventory publishes measured zero counts", async () => {
  const harness = createHarness();

  await harness.handler({}, {});

  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articles.counts, { all: 0, en: 0, es: 0 });
});

test("unsupported source language and schema fail before collection and preserve the prior object", async () => {
  for (const invalidInput of [
    sourceInput({ language: "unknown" }),
    { ...sourceInput(), schemaVersion: 99 },
    { ...sourceInput(), definitionVersion: 99 }
  ]) {
    let fetchCount = 0;
    const harness = createHarness({
      input: invalidInput,
      fetchFn: async () => {
        fetchCount += 1;
        return jsonResponse({ results: [] });
      }
    });
    await assertFailedWithoutReplacing(harness);
    assert.equal(fetchCount, 0, "invalid protected input must fail before provider access");
  }
});

test("malformed eligible records and later-page failures preserve the last successful bytes", async () => {
  const malformed = article({ id: "malformed" });
  malformed.data.publishedDate = "not-a-millisecond-date";
  const scenarios = [
    {
      fetchFn: recordPages(new Map([[0, [malformed]]]))
    },
    {
      fetchFn: async (input) => {
        const url = new URL(String(input));
        if (Number(url.searchParams.get("offset")) === 0) {
          return jsonResponse({ results: Array.from({ length: 10 }, (_, index) => article({ id: `valid-${index}` })) });
        }
        return jsonResponse({ error: "synthetic upstream failure" }, 503);
      }
    },
    {
      fetchFn: async () => jsonResponse({})
    },
    {
      fetchFn: async () => jsonResponse({ results: { unexpected: "object" } })
    }
  ];

  for (const scenario of scenarios) {
    const harness = createHarness(scenario);
    await assertFailedWithoutReplacing(harness);
  }
});

test("a transient provider error retries once while authorization errors do not retry", async () => {
  let transientAttempts = 0;
  const transientHarness = createHarness({
    fetchFn: async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"));
      if (offset === 0 && transientAttempts++ === 0) return jsonResponse({ error: "temporary" }, 503);
      return jsonResponse({ results: offset === 0 ? [article({ id: "retry-success" })] : [] });
    }
  });

  await transientHarness.handler({}, {});
  assert.equal(transientAttempts, 2, "one transient error must lead to exactly one retry");
  assert.equal(transientHarness.putCalls.length, 1);
  assert.deepEqual((await readPut(transientHarness.putCalls[0])).groups.articles.counts, { all: 1, en: 1, es: 0 });

  let unauthorizedAttempts = 0;
  const unauthorizedHarness = createHarness({
    fetchFn: async () => {
      unauthorizedAttempts += 1;
      return jsonResponse({ error: "synthetic unauthorized response" }, 401);
    }
  });
  await assertFailedWithoutReplacing(unauthorizedHarness);
  assert.equal(unauthorizedAttempts, 1, "an authorization failure must not loop");
});

test("reaching the finite pagination cap is incomplete and cannot replace the public aggregate", async () => {
  let requests = 0;
  const harness = createHarness({
    fetchFn: async () => {
      requests += 1;
      return jsonResponse({ results: Array.from({ length: 10 }, (_, index) => article({ id: `cap-${requests}-${index}` })) });
    }
  });

  await assertFailedWithoutReplacing(harness);
  assert.equal(requests, 100, "the collector must stop at the planned 100-page bound");
});

test("each invocation recomputes from current input and execution time, and scope changes get a new fingerprint", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const remoteRecords = new Map([[privateAuthorId, ["remote-item-one"]]]);
  const harness = createHarness({
    clock,
    fetchFn: async (input) => {
      const url = new URL(String(input));
      const authorId = url.searchParams.get("query.data.authors.author.id");
      const offset = Number(url.searchParams.get("offset"));
      return jsonResponse({
        results: offset === 0
          ? (remoteRecords.get(authorId) ?? []).map((id) => article({ id, authorId }))
          : []
      });
    }
  });

  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const first = await readPut(harness.putCalls[0]);
  remoteRecords.get(privateAuthorId).push("remote-item-two");
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const second = await readPut(harness.putCalls[1]);

  assert.deepEqual(first.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(second.groups.articles.counts, { all: 2, en: 2, es: 0 }, "a newly published remote article must be discovered without changing inputs");
  assert.equal(second.groups.articles.scopeId, first.groups.articles.scopeId);
  assert.equal(first.groups.articles.collectedAt, "2026-10-16T12:00:00.000Z");
  assert.equal(second.groups.articles.collectedAt, "2026-10-17T12:00:00.000Z");

  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const duplicateRun = await readPut(harness.putCalls[2]);
  assert.deepEqual(duplicateRun.groups.articles.counts, second.groups.articles.counts, "a repeat invocation must not accumulate the remote inventory");
  assert.equal(duplicateRun.groups.articles.scopeId, second.groups.articles.scopeId);
  assert.equal(duplicateRun.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");

  const changedAuthorId = "different-synthetic-author";
  remoteRecords.set(changedAuthorId, ["different-policy-item"]);
  harness.setInput(sourceInput({ authorId: changedAuthorId }));
  clock.set("2026-10-19T12:00:00.000Z");
  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const changedScope = await readPut(harness.putCalls[3]);

  assert.equal(changedScope.groups.articles.scopeId === duplicateRun.groups.articles.scopeId, false);
  assert.deepEqual(changedScope.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.equal(changedScope.groups.articles.collectedAt, "2026-10-19T12:00:00.000Z");
  assert.equal(harness.putCalls.length, 4);
  assert.ok(harness.getCalls.every(({ Key }) => Key === inputKey), "the single-family collector need not read its old output");
});
