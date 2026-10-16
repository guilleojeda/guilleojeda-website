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
const beehiivSecretArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic-beehiiv-key";
const beehiivApiKey = "synthetic-beehiiv-api-key-canary";
const beehiivSecretExtraFieldCanary = "synthetic-secret-extra-field-canary";
const beehiivPublicationId = "synthetic-publication-id";
const privateAuthorId = "synthetic-author-id";
const builderAuthorId = "251f1678-ab8f-4f22-afb9-1ee13511c7ee";

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

function builderCenterSource(authorId = builderAuthorId) {
  return { id: "builder-center", authorId };
}

function phaseTwoInput({ sources } = {}) {
  return {
    schemaVersion: 2,
    definitionVersion: 1,
    sources: sources ?? [sourceInput().source, builderCenterSource()]
  };
}

function phaseThreeInput({ sources, curated } = {}) {
  return {
    schemaVersion: 3,
    definitionVersion: 1,
    sources: sources ?? [sourceInput().source, builderCenterSource()],
    curated: curated ?? { talks: [], books: [] }
  };
}

function phaseFourInput({ sources, curated, newsletter } = {}) {
  return {
    schemaVersion: 4,
    definitionVersion: 1,
    sources: sources ?? [sourceInput().source, builderCenterSource()],
    curated: curated ?? { talks: [], books: [] },
    newsletter: newsletter === undefined
      ? { id: "simple-aws", publicationId: beehiivPublicationId, language: "en" }
      : newsletter
  };
}

function talkFact(id, kind = "talk", status = "delivered", language = "en") {
  return { id, kind, status, language };
}

function bookFact(id, status = "published", language = "en") {
  return { id, status, language };
}

function priorGroup({
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "a".repeat(64),
  sources = [{ id: "caylent", label: "Caylent" }, { id: "builder-center", label: "AWS Builder Center" }],
  counts = { all: 4, en: 3, es: 1 }
} = {}) {
  return {
    definitionVersion: 1,
    basis: "cumulative",
    collectedAt,
    scopeId,
    sources,
    counts
  };
}

function priorNewsletterGroup({
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "b".repeat(64),
  publication = { id: "simple-aws", label: "Simple AWS", language: "en" },
  subscribers = 17
} = {}) {
  return {
    definitionVersion: 1,
    basis: "current",
    collectedAt,
    scopeId,
    publication,
    subscribers
  };
}

function article({
  id,
  url = `/blog/${id}`,
  title = `Synthetic private title ${id}`,
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
      title,
      url,
      publishedDate,
      authors: [{ author: { id: authorId, value: { name: "Synthetic Author" } } }]
    }
  };
}

function builderArticle({
  id,
  title = `Synthetic Builder title ${id}`,
  locale = "en",
  status = "LIVE",
  creatorId = builderAuthorId,
  lastPublishedAt = Date.parse("2026-10-15T12:00:00.000Z"),
  slug = "shared-slug"
}) {
  const articleId = `/content/${id}`;
  return {
    articleId,
    uri: `${articleId}/${slug}`,
    title,
    status,
    locale,
    author: { creatorId, alias: "guilleojeda" },
    lastPublishedAt
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
  clock = createClock(),
  getFailures = new Map(),
  secretArn = beehiivSecretArn,
  secretResponse = {
    SecretString: JSON.stringify({ apiKey: beehiivApiKey, operatorNote: beehiivSecretExtraFieldCanary })
  },
  secretFailures = new Map(),
  putFailure,
  createHashFaultAfter = null,
  createHashFault = new Error("synthetic createHash fault")
} = {}) {
  assert.ok(
    existsSync(collectorPath),
    "Expected infra/content-stats-collector.cjs to export the planned Lambda handler; the collector implementation is not present yet"
  );
  const source = readFileSync(collectorPath, "utf8");
  const objects = new Map([[inputKey, JSON.stringify(input)]]);
  const getCalls = [];
  const secretCalls = [];
  const putCalls = [];
  const logs = [];
  const abortSignalRecords = [];
  const secretResponses = new Map();
  if (typeof secretArn === "string" && secretArn.trim() !== "") secretResponses.set(secretArn, secretResponse);

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
  class GetSecretValueCommand {
    constructor(params) {
      this.input = params;
    }
  }
  class S3Client {
    async send(command) {
      if (command instanceof GetObjectCommand) {
        getCalls.push(JSON.parse(JSON.stringify(command.input)));
        if (getFailures.has(command.input.Key)) throw getFailures.get(command.input.Key);
        const value = objects.get(command.input.Key);
        if (value === undefined) {
          const error = new Error(`Synthetic object is absent: ${command.input.Key}`);
          error.name = "NoSuchKey";
          error.Code = "NoSuchKey";
          throw error;
        }
        return { Body: { transformToString: async () => bodyText(value) } };
      }
      if (command instanceof PutObjectCommand) {
        putCalls.push(command.input);
        if (putFailure) throw putFailure;
        objects.set(command.input.Key, bodyText(command.input.Body));
        return { ETag: '"synthetic-etag"' };
      }
      throw new Error(`Unexpected S3 command: ${command?.constructor?.name}`);
    }
  }

  class SecretsManagerClient {
    async send(command) {
      if (!(command instanceof GetSecretValueCommand)) {
        throw new Error(`Unexpected Secrets Manager command: ${command?.constructor?.name}`);
      }
      secretCalls.push(JSON.parse(JSON.stringify(command.input)));
      if (secretFailures.has(command.input.SecretId)) throw secretFailures.get(command.input.SecretId);
      const response = secretResponses.get(command.input.SecretId);
      if (response === undefined) {
        const error = new Error(`Synthetic secret is absent: ${command.input.SecretId}`);
        error.name = "ResourceNotFoundException";
        throw error;
      }
      return response;
    }
  }

  const moduleObject = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  const nativeCrypto = nativeRequire("node:crypto");
  let hashCalls = 0;
  const crypto = createHashFaultAfter === null
    ? nativeCrypto
    : {
      ...nativeCrypto,
      createHash(...args) {
        hashCalls += 1;
        if (hashCalls === createHashFaultAfter) throw createHashFault;
        return nativeCrypto.createHash(...args);
      }
    };
  const sdk = { S3Client, GetObjectCommand, PutObjectCommand };
  const secretsManagerSdk = { SecretsManagerClient, GetSecretValueCommand };
  const env = {
    STATS_BUCKET: bucket,
    STATS_INPUT_KEY: inputKey,
    STATS_OUTPUT_KEY: outputKey
  };
  if (secretArn !== null) env.BEEHIIV_API_KEY_SECRET_ARN = secretArn;
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require(request) {
      if (request === "@aws-sdk/client-s3") return sdk;
      if (request === "@aws-sdk/client-secrets-manager") return secretsManagerSdk;
      if (request === "node:crypto") return crypto;
      return nativeRequire(request);
    },
    process: { env },
    fetch: fetchFn,
    Date: clock.Date,
    URL,
    URLSearchParams,
    Buffer,
    AbortController,
    AbortSignal: {
      timeout(milliseconds) {
        const signal = AbortSignal.timeout(milliseconds);
        abortSignalRecords.push({ signal, milliseconds });
        return signal;
      }
    },
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
    secretCalls,
    putCalls,
    logs,
    abortSignalRecords,
    env,
    clock,
    setInput(nextInput) {
      objects.set(inputKey, JSON.stringify(nextInput));
    },
    setGetFailure(key, error) {
      getFailures.set(key, error);
    },
    setSecretResponse(key, response) {
      secretResponses.set(key, response);
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

function responseFromFixture(value, defaultBody = {}) {
  if (value && typeof value === "object" && typeof value.json === "function") return value;
  return jsonResponse(value ?? defaultBody);
}

function builderApiFetch({
  caylentPages = new Map([[0, { results: [] }]]),
  builderPages = new Map([["", { articles: [], resultsSize: 0 }]]),
  requestLog = []
} = {}) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "cdn.builder.io" && url.pathname === "/api/v3/content/blog-post") {
      const offset = Number(url.searchParams.get("offset"));
      requestLog.push({ kind: "caylent-list", offset, fields: url.searchParams.get("fields") });
      const page = caylentPages.get(offset);
      if (typeof page === "function") return page();
      return responseFromFixture(page, { results: [] });
    }
    if (url.hostname === "api.builder.aws.com" && url.pathname.startsWith("/cs/v2/articles/user/")) {
      const cursor = url.searchParams.get("cursor") ?? "";
      const pageSize = url.searchParams.get("pageSize");
      requestLog.push({
        kind: "builder-list",
        cursor,
        cursorParameterPresent: url.searchParams.has("cursor"),
        pageSize,
        authorPath: url.pathname
      });
      const page = builderPages.get(cursor);
      if (typeof page === "function") return page();
      return responseFromFixture(page, { articles: [], resultsSize: 0 });
    }
    if (url.hostname === "api.builder.aws.com" && url.pathname === "/cs/v2/articles") {
      requestLog.push({ kind: "builder-detail", articleId: url.searchParams.get("articleId") });
      return jsonResponse({ error: "detail reads are outside the Phase 2 count contract" }, 404);
    }
    throw new Error(`Unexpected synthetic provider endpoint: ${url.origin}${url.pathname}`);
  };
}

function phaseFourApiFetch({ requestLog = [], newsletterResponder, articleFetcher } = {}) {
  const articleFetch = articleFetcher ?? builderApiFetch({ requestLog });
  let newsletterAttempts = 0;
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.beehiiv.com") {
      newsletterAttempts += 1;
      const request = {
        kind: "beehiiv",
        url: url.toString(),
        method: init?.method,
        headers: init?.headers ?? {},
        redirect: init?.redirect,
        signal: init?.signal
      };
      requestLog.push(request);
      if (typeof newsletterResponder === "function") {
        return newsletterResponder({ request, attempt: newsletterAttempts });
      }
      if (newsletterResponder !== undefined) return responseFromFixture(newsletterResponder);
      return jsonResponse({
        data: {
          id: beehiivPublicationId,
          stats: { active_subscriptions: 0 }
        }
      });
    }
    return articleFetch(input, init);
  };
}

async function assertFailedWithoutReplacing(harness, event = {}) {
  const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
  harness.objects.set(outputKey, previous);
  await assert.rejects(() => harness.handler(event, {}));
  assert.equal(harness.putCalls.length, 0, "a failed collection must not replace the public object");
  assert.equal(harness.objects.get(outputKey), previous, "the last successful bytes must remain intact");
}

async function assertPhaseTwoFailureAfterProvider(harness, requestLog, expectedRequests) {
  const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
  harness.objects.set(outputKey, previous);
  await assert.rejects(() => harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {}));
  assert.equal(harness.putCalls.length, 0, "an incomplete Phase 2 refresh must not replace the public object");
  assert.equal(harness.objects.get(outputKey), previous, "the previous aggregate bytes and date must remain intact");
  assert.deepEqual(
    requestLog.filter(({ kind }) => kind.startsWith("builder-")),
    expectedRequests,
    "the failure must occur after the intended Builder provider request(s)"
  );
}

function expectedBuilderList(cursor = "", authorId = builderAuthorId) {
  return {
    kind: "builder-list",
    cursor,
    cursorParameterPresent: cursor !== "",
    pageSize: "50",
    authorPath: `/cs/v2/articles/user/${authorId}`
  };
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
  assert.deepEqual(group.counts, { all: 14, en: 14, es: 0 }, "different titles count separately even when source URLs overlap");
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

test("legacy Caylent input uses normalized titles rather than source-local IDs or URLs", async () => {
  const pages = new Map([[0, [
    article({ id: "legacy-copy-one", url: "/blog/copy-one", title: "  Shared   Caylent Title " }),
    article({ id: "legacy-copy-two", url: "/blog/copy-two", title: "shared caylent title" }),
    article({ id: "legacy-distinct-one", url: "/blog/distinct-one", title: "Distinct Caylent Title One" }),
    article({ id: "legacy-distinct-two", url: "/blog/distinct-two", title: "Distinct Caylent Title Two" })
  ]]]);
  const requests = [];
  const harness = createHarness({
    input: sourceInput(),
    fetchFn: recordPages(pages, requests)
  });

  await harness.handler({}, {});

  assert.ok(requests[0].url.searchParams.get("fields").split(",").includes("data.title"), "legacy-mode collection must request title as an identity input");
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articles.counts, { all: 3, en: 3, es: 0 });
});

test("v2 counts normalized title-language editions without fetching article details or publishing records", async () => {
  const caylentAccent = article({
    id: "caylent-accent-title",
    url: "/blog/cafe-guide",
    title: "  Café   Guide "
  });
  const caylentAccentCopy = article({
    id: "caylent-accent-copy",
    url: "/blog/cafe-guide-copy",
    title: "CAFE\u0301 guide"
  });
  const caylentPunctuation = article({
    id: "caylent-punctuation-title",
    url: "/blog/hello-world",
    title: "Hello, World!"
  });
  const normalizedEnglishCopy = builderArticle({
    id: "builder-normalized-copy",
    title: "\tCAFE\u0301   GUIDE\n"
  });
  const normalizedEnglishCopySecondId = builderArticle({
    id: "builder-normalized-copy-second-id",
    title: "café guide",
    slug: "second-copy-url"
  });
  const spanishCopy = builderArticle({
    id: "builder-spanish-copy",
    title: " CAFÉ GUIDE ",
    locale: "es"
  });
  const punctuationDifference = builderArticle({
    id: "builder-punctuation-difference",
    title: "hello world!"
  });
  const accentDifference = builderArticle({
    id: "builder-accent-difference",
    title: "Cafe Guide"
  });
  const sameSlugTitleA = builderArticle({
    id: "builder-same-slug-a",
    title: "Distinct Article A",
    slug: "shared-article-slug"
  });
  const sameSlugTitleB = builderArticle({
    id: "builder-same-slug-b",
    title: "Distinct Article B",
    slug: "shared-article-slug"
  });
  const titleWithoutOrigin = builderArticle({
    id: "builder-title-without-origin",
    title: "Titled Article Without Origin Metadata"
  });
  titleWithoutOrigin.createdAt = Date.parse("2026-10-16T00:00:00.000Z");
  const unlinkedSpanishTitleOne = builderArticle({
    id: "builder-unlinked-spanish-one",
    title: "Artículo español sin vínculo de origen uno",
    locale: "es"
  });
  const unlinkedSpanishTitleTwo = builderArticle({
    id: "builder-unlinked-spanish-two",
    title: "Artículo español sin vínculo de origen dos",
    locale: "es"
  });
  const unknownLocale = builderArticle({
    id: "builder-unknown-locale",
    title: "Unsupported Language Edition",
    locale: "fr"
  });
  const otherAuthor = builderArticle({
    id: "builder-other-author",
    title: "Another Author's Article",
    creatorId: "another-creator"
  });
  const draft = builderArticle({
    id: "builder-draft",
    title: "Unpublished Draft",
    status: "DRAFT"
  });
  const future = builderArticle({
    id: "builder-future",
    title: "Future Edition",
    lastPublishedAt: Date.parse("2026-10-17T12:00:00.000Z")
  });
  const allBuilderRecords = [
    normalizedEnglishCopy,
    normalizedEnglishCopySecondId,
    normalizedEnglishCopy,
    spanishCopy,
    punctuationDifference,
    accentDifference,
    sameSlugTitleA,
    sameSlugTitleB,
    titleWithoutOrigin,
    unlinkedSpanishTitleOne,
    unlinkedSpanishTitleTwo,
    unknownLocale,
    otherAuthor,
    draft,
    future
  ];
  const cursorOne = "opaque/+==cursor-one";
  const cursorTwo = "opaque cursor two";
  const builderPages = new Map([
    ["", { articles: [normalizedEnglishCopy, normalizedEnglishCopySecondId], cursor: cursorOne, resultsSize: 2 }],
    [cursorOne, { articles: [], cursor: cursorTwo, resultsSize: 0 }],
    [cursorTwo, { articles: allBuilderRecords.slice(2), resultsSize: allBuilderRecords.length - 2 }]
  ]);
  const requests = [];
  const harness = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, { results: [caylentAccent, caylentAccentCopy, caylentPunctuation] }]]),
      builderPages,
      requestLog: requests
    })
  });

  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});

  const caylentRequest = requests.find(({ kind }) => kind === "caylent-list");
  assert.ok(caylentRequest?.fields.split(",").includes("data.title"), "v2 must request Caylent titles as an identity input");
  const listRequests = requests.filter(({ kind }) => kind === "builder-list");
  assert.deepEqual(listRequests.map(({ cursor, pageSize }) => [cursor, pageSize]), [
    ["", "50"],
    [cursorOne, "50"],
    [cursorTwo, "50"]
  ], "cursor continuation must be followed through short and empty pages; resultsSize is not the total");
  assert.deepEqual(
    listRequests.map(({ cursorParameterPresent }) => cursorParameterPresent),
    [false, true, true],
    "omit the initial cursor but include every opaque continuation cursor"
  );
  assert.ok(listRequests.every(({ authorPath }) => authorPath === `/cs/v2/articles/user/${builderAuthorId}`));
  assert.equal(requests.some(({ kind }) => kind === "builder-detail"), false, "the list title is sufficient; details and article bodies are not fetched");

  assert.equal(harness.putCalls.length, 1);
  const put = harness.putCalls[0];
  assert.equal(put.ContentType, "application/json");
  assert.equal(put.CacheControl, cacheControl);
  const output = await readPut(put);
  const group = output.groups.articles;
  assert.equal(output.schemaVersion, 1, "the public aggregate keeps its existing schema version");
  assert.equal(group.definitionVersion, 1, "the article metric keeps its existing definition version");
  assert.deepEqual(group.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" }
  ]);
  assert.deepEqual(group.counts, { all: 10, en: 7, es: 3 }, "NFC/case/whitespace variants merge; punctuation, accents, language, and distinct titles remain significant");

  const serialized = bodyText(put.Body);
  for (const privateValue of [
    secretKey,
    privateAuthorId,
    builderAuthorId,
    "builder-normalized-copy",
    "builder-normalized-copy-second-id",
    "Café",
    "Distinct Article A",
    "Distinct Article B",
    "Titled Article Without Origin Metadata",
    "/blog/cafe-guide",
    "/blog/cafe-guide-copy",
    "shared-article-slug"
  ]) {
    assert.equal(serialized.includes(privateValue), false, `public aggregate must omit ${privateValue}`);
  }
  for (const forbidden of ["items", "articlesByUrl", "articleId", "title", "uri", "reach", "views"]) {
    assert.equal(Object.hasOwn(group, forbidden), false);
  }
});

test("v2 discovers a newly published language edition on the next run without changing scope or accumulating repeats", async () => {
  const original = article({ id: "remote-original", url: "/blog/remote-original", title: "Remote Original" });
  const builderEnglishCopy = builderArticle({ id: "builder-english-copy", title: " remote   ORIGINAL " });
  const translation = builderArticle({ id: "remote-spanish-translation", title: "REMOTE ORIGINAL", locale: "es" });
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requests = [];
  const builderPages = new Map([["", { articles: [builderEnglishCopy], resultsSize: 1 }]]);
  const harness = createHarness({
    input: phaseTwoInput(),
    clock,
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, { results: [original] }]]),
      builderPages,
      requestLog: requests
    })
  });

  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(first.groups.articles.counts, { all: 1, en: 1, es: 0 }, "same-title English copy merges across sources");

  builderPages.set("", { articles: [builderEnglishCopy, translation], resultsSize: 2 });
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const second = await readPut(harness.putCalls[1]);
  assert.deepEqual(second.groups.articles.counts, { all: 2, en: 1, es: 1 }, "same normalized title in Spanish is a new edition");
  assert.equal(second.groups.articles.scopeId, first.groups.articles.scopeId, "new remote data does not change semantic scope");

  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({ time: "2001-01-01T00:00:00.000Z" }, {});
  const repeated = await readPut(harness.putCalls[2]);
  assert.deepEqual(repeated.groups.articles.counts, second.groups.articles.counts, "a repeated run recomputes rather than adds yesterday's totals");
  assert.equal(repeated.groups.articles.scopeId, second.groups.articles.scopeId);
  assert.equal(repeated.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");
  assert.equal(requests.some(({ kind }) => kind === "builder-detail"), false);
  assert.equal(harness.putCalls.length, 3);
});

test("v2 requires both unique supported sources and fingerprints selectors, not key or source order", async () => {
  const caylent = sourceInput().source;
  const builder = builderCenterSource();
  const invalidInputs = [
    { ...phaseTwoInput(), schemaVersion: 1 },
    { ...phaseTwoInput(), definitionVersion: 2 },
    phaseTwoInput({ sources: [caylent] }),
    phaseTwoInput({ sources: [caylent, builder, builder] }),
    phaseTwoInput({ sources: [caylent, { id: "builder-center" }] }),
    phaseTwoInput({ sources: [caylent, builder, { id: "future-source", authorId: "synthetic" }] })
  ];

  for (const invalidInput of invalidInputs) {
    let providerRequests = 0;
    const harness = createHarness({
      input: invalidInput,
      fetchFn: async () => {
        providerRequests += 1;
        return jsonResponse({ results: [] });
      }
    });
    await assertFailedWithoutReplacing(harness);
    assert.equal(providerRequests, 0, "unsupported v2 source sets must fail before provider access");
  }

  const harness = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch()
  });
  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);

  const rotatedAndReorderedCaylent = { ...caylent, apiKey: "rotated-synthetic-delivery-key" };
  harness.setInput(phaseTwoInput({ sources: [builder, rotatedAndReorderedCaylent] }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls[1]);
  assert.equal(reordered.groups.articles.scopeId, initial.groups.articles.scopeId, "key rotation and source ordering do not change scope");
  assert.deepEqual(reordered.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" }
  ]);

  harness.setInput(phaseTwoInput({ sources: [rotatedAndReorderedCaylent, builderCenterSource("different-builder-author")] }));
  await harness.handler({}, {});
  const changedAuthor = await readPut(harness.putCalls[2]);
  assert.notEqual(changedAuthor.groups.articles.scopeId, reordered.groups.articles.scopeId);
  assert.equal(harness.putCalls.length, 3);
});

test("missing or blank titles on otherwise eligible source records preserve the previous object", async () => {
  const missingCaylentTitle = article({ id: "caylent-missing-title" });
  delete missingCaylentTitle.data.title;
  for (const record of [missingCaylentTitle, article({ id: "caylent-blank-title", title: " \t\n " })]) {
    const requests = [];
    const harness = createHarness({
      input: phaseTwoInput(),
      fetchFn: builderApiFetch({
        caylentPages: new Map([[0, { results: [record] }]]),
        requestLog: requests
      })
    });
    await assertFailedWithoutReplacing(harness);
    assert.ok(requests.some(({ kind }) => kind === "caylent-list"), "missing title must fail after reading the source, not at v2 input validation");
  }

  const missingTitle = builderArticle({ id: "builder-missing-title" });
  delete missingTitle.title;
  const malformedTitles = [
    missingTitle,
    builderArticle({ id: "builder-blank-title", title: " \t\n " })
  ];

  for (const listed of malformedTitles) {
    const requests = [];
    const harness = createHarness({
      input: phaseTwoInput(),
      fetchFn: builderApiFetch({
        builderPages: new Map([["", { articles: [listed], resultsSize: 1 }]]),
        requestLog: requests
      })
    });
    await assertPhaseTwoFailureAfterProvider(harness, requests, [expectedBuilderList()]);
    assert.equal(requests.some(({ kind }) => kind === "builder-detail"), false, "title validation requires no article detail request");
  }
});

test("Builder list failures, malformed envelopes, repeated cursors, and cursor-cap exhaustion cannot publish partial counts", async () => {
  const listHttpFailureRequests = [];
  const listHttpFailure = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch({
      builderPages: new Map([
        ["", { articles: [], cursor: "next-page", resultsSize: 0 }],
        ["next-page", () => jsonResponse({ error: "synthetic source failure" }, 503)]
      ]),
      requestLog: listHttpFailureRequests
    })
  });
  await assertPhaseTwoFailureAfterProvider(listHttpFailure, listHttpFailureRequests, [
    expectedBuilderList(),
    expectedBuilderList("next-page"),
    expectedBuilderList("next-page")
  ]);

  for (const malformedPage of [
    {},
    { articles: "not-an-array", resultsSize: 0 },
    { articles: [], cursor: 42, resultsSize: 0 }
  ]) {
    const malformedEnvelopeRequests = [];
    const malformedEnvelope = createHarness({
      input: phaseTwoInput(),
      fetchFn: builderApiFetch({
        builderPages: new Map([["", malformedPage]]),
        requestLog: malformedEnvelopeRequests
      })
    });
    await assertPhaseTwoFailureAfterProvider(malformedEnvelope, malformedEnvelopeRequests, [expectedBuilderList()]);
  }

  const repeatedCursorRequests = [];
  const repeatedCursorPages = new Map([
    ["", { articles: [], cursor: "repeat-token", resultsSize: 0 }],
    ["repeat-token", { articles: [], cursor: "repeat-token", resultsSize: 0 }]
  ]);
  const repeatedCursor = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch({ builderPages: repeatedCursorPages, requestLog: repeatedCursorRequests })
  });
  await assertPhaseTwoFailureAfterProvider(repeatedCursor, repeatedCursorRequests, [
    expectedBuilderList(),
    expectedBuilderList("repeat-token")
  ]);

  const capRequests = [];
  const capPages = new Map();
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const nextCursor = `cap-cursor-${page + 1}`;
    capPages.set(cursor, { articles: [], cursor: nextCursor, resultsSize: 0 });
    cursor = nextCursor;
  }
  const capped = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch({ builderPages: capPages, requestLog: capRequests })
  });
  await assertPhaseTwoFailureAfterProvider(
    capped,
    capRequests,
    Array.from({ length: 20 }, (_, page) => expectedBuilderList(page === 0 ? "" : `cap-cursor-${page}`))
  );
});

test("transient Builder list errors retry once and a complete title-bearing list publishes", async () => {
  const listed = builderArticle({ id: "retry-builder-list", title: "Transient List Recovery" });
  let listAttempts = 0;
  const requests = [];
  const harness = createHarness({
    input: phaseTwoInput(),
    fetchFn: builderApiFetch({
      builderPages: new Map([["", () => {
        listAttempts += 1;
        return listAttempts === 1
          ? jsonResponse({ error: "synthetic temporary failure" }, 503)
          : jsonResponse({ articles: [listed], resultsSize: 1 });
      }]]),
      requestLog: requests
    })
  });

  await harness.handler({}, {});

  assert.equal(listAttempts, 2, "a transient list response receives exactly one retry");
  assert.deepEqual(requests.filter(({ kind }) => kind.startsWith("builder-")), [
    expectedBuilderList(),
    expectedBuilderList()
  ]);
  assert.equal(requests.some(({ kind }) => kind === "builder-detail"), false);
  assert.equal(harness.putCalls.length, 1);
  assert.deepEqual((await readPut(harness.putCalls[0])).groups.articles.counts, { all: 1, en: 1, es: 0 });
});

test("input 3 publishes independent article, delivered-session, and published-book groups without item facts", async () => {
  const input = phaseThreeInput({
    curated: {
      talks: [
        // These distinct occurrence IDs represent two deliveries with the same display title. Titles are deliberately absent from the collector facts.
        talkFact("speaker-plus-host", "talk", "delivered", "en"),
        talkFact("same-display-title-second-occurrence", "talk", "delivered", "en"),
        talkFact("workshop-en", "workshop", "delivered", "en"),
        talkFact("training-es", "training", "delivered", "es"),
        talkFact("panel-es", "panel", "delivered", "es"),
        talkFact("technical-session-en", "session", "delivered", "en"),
        talkFact("host-only", "hosting", "delivered", "en"),
        talkFact("podcast", "podcast", "delivered", "en"),
        talkFact("commentary", "commentary", "delivered", "es"),
        talkFact("conversation", "conversation", "delivered", "en"),
        talkFact("unknown-kind", "unknown", "delivered", "en"),
        talkFact("scheduled", "talk", "scheduled", "en"),
        talkFact("unknown-status", "talk", "unknown", "es"),
        talkFact("null-language", "talk", "delivered", null),
        talkFact("unsupported-language", "talk", "delivered", "fr")
      ],
      books: [
        bookFact("historical-unavailable-book-en", "published", "en"),
        bookFact("published-book-es", "published", "es"),
        bookFact("in-progress-book", "in-progress", "en"),
        bookFact("unknown-book-status", "unknown", "en"),
        bookFact("null-book-language", "published", null),
        bookFact("unsupported-book-language", "published", "fr")
      ]
    }
  });
  const requests = [];
  const harness = createHarness({
    input,
    fetchFn: builderApiFetch({ requestLog: requests })
  });

  await harness.handler({}, {});

  assert.deepEqual(requests.map(({ kind }) => kind), ["caylent-list", "builder-list"]);
  assert.equal(requests[1].cursorParameterPresent, false);
  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"]);
  assert.deepEqual(output.groups.articles.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(output.groups.talks.counts, { all: 6, en: 4, es: 2 });
  assert.deepEqual(output.groups.books.counts, { all: 2, en: 1, es: 1 });
  for (const group of Object.values(output.groups)) {
    assert.deepEqual(Object.keys(group).sort(), [
      "basis", "collectedAt", "counts", "definitionVersion", "scopeId", "sources"
    ]);
    assert.equal(group.definitionVersion, 1);
    assert.equal(group.basis, "cumulative");
    assert.equal(group.collectedAt, "2026-10-16T12:00:00.000Z");
    assert.match(group.scopeId, /^[a-f0-9]{64}$/);
    assert.deepEqual(group.counts, {
      all: group.counts.en + group.counts.es,
      en: group.counts.en,
      es: group.counts.es
    });
  }
  assert.deepEqual(output.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" }
  ]);
  assert.deepEqual(output.groups.talks.sources, [{ id: "website-inventory", label: "Website inventory" }]);
  assert.deepEqual(output.groups.books.sources, [{ id: "website-inventory", label: "Website inventory" }]);
  assert.deepEqual(Object.keys(output.groups.talks).sort(), [
    "basis", "collectedAt", "counts", "definitionVersion", "scopeId", "sources"
  ]);

  const publicJson = bodyText(harness.putCalls[0].Body);
  const logs = harness.logs.join("\n");
  for (const privateValue of [
    secretKey,
    privateAuthorId,
    "speaker-plus-host",
    "same-display-title-second-occurrence",
    "historical-unavailable-book-en",
    "unsupported-book-language"
  ]) {
    assert.equal(publicJson.includes(privateValue), false, `public aggregate must omit ${privateValue}`);
    assert.equal(logs.includes(privateValue), false, `logs must omit ${privateValue}`);
  }
  for (const unsupportedField of ["items", "articlesByUrl", "talkFacts", "bookFacts", "title", "body"]) {
    assert.equal(publicJson.includes(`\"${unsupportedField}\"`), false);
  }
});

test("input 3 publishes measured zero counts for empty eligible inventories", async () => {
  const harness = createHarness({
    input: phaseThreeInput(),
    fetchFn: builderApiFetch()
  });

  await harness.handler({}, {});

  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"]);
  for (const group of Object.values(output.groups)) {
    assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  }
});

test("input 3 scopes ignore ordering and unrelated family changes while remote article discovery recomputes", async () => {
  let listedBuilderArticles = [builderArticle({ id: "remote-one", title: "Remote Work One" })];
  const requests = [];
  const fetchFn = builderApiFetch({
    builderPages: new Map([["", () => jsonResponse({ articles: listedBuilderArticles, resultsSize: 1 })]]),
    requestLog: requests
  });
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("talk-one"), talkFact("talk-two", "talk", "delivered", "es")],
      books: [bookFact("book-one"), bookFact("book-two", "published", "es")]
    } }),
    fetchFn
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(initial.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(initial.groups.talks.counts, { all: 2, en: 1, es: 1 });
  assert.deepEqual(initial.groups.books.counts, { all: 2, en: 1, es: 1 });

  harness.setInput(phaseThreeInput({
    sources: [builderCenterSource(), sourceInput().source],
    curated: {
      talks: [talkFact("talk-two", "talk", "delivered", "es"), talkFact("talk-one")],
      books: [bookFact("book-two", "published", "es"), bookFact("book-one")]
    }
  }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls.at(-1));
  for (const family of ["articles", "talks", "books"]) {
    assert.equal(reordered.groups[family].scopeId, initial.groups[family].scopeId);
  }

  listedBuilderArticles = [
    builderArticle({ id: "remote-one", title: "Remote Work One" }),
    builderArticle({ id: "remote-two", title: "Remote Work Two", locale: "es" })
  ];
  await harness.handler({}, {});
  const discovered = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(discovered.groups.articles.counts, { all: 2, en: 1, es: 1 });
  assert.equal(discovered.groups.articles.scopeId, initial.groups.articles.scopeId);

  await harness.handler({}, {});
  const repeated = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(repeated.groups.articles.counts, { all: 2, en: 1, es: 1 });
  assert.equal(repeated.groups.articles.scopeId, initial.groups.articles.scopeId);

  harness.setInput(phaseThreeInput({
    sources: [builderCenterSource(), sourceInput().source],
    curated: {
      talks: [talkFact("talk-one"), talkFact("talk-two", "talk", "delivered", "es")],
      books: [bookFact("book-one"), bookFact("book-two", "published", "es"), bookFact("book-three")]
    }
  }));
  await harness.handler({}, {});
  const booksChanged = await readPut(harness.putCalls.at(-1));
  assert.equal(booksChanged.groups.articles.scopeId, initial.groups.articles.scopeId);
  assert.equal(booksChanged.groups.talks.scopeId, initial.groups.talks.scopeId);
  assert.notEqual(booksChanged.groups.books.scopeId, initial.groups.books.scopeId);
  assert.deepEqual(booksChanged.groups.books.counts, { all: 3, en: 2, es: 1 });
  assert.equal(requests.filter(({ kind }) => kind === "builder-list").length, 5);
  assert.equal(harness.putCalls.length, 5);
});

test("input 3 isolates malformed talks or books family values while refreshing valid siblings", async () => {
  const cases = [
    {
      malformedFamily: "talks",
      curated: {
        talks: [talkFact("duplicate-talk-id"), talkFact("duplicate-talk-id")],
        books: [bookFact("valid-book")]
      }
    },
    {
      malformedFamily: "books",
      curated: {
        talks: [talkFact("valid-talk")],
        books: [bookFact("duplicate-book-id"), bookFact("duplicate-book-id")]
      }
    },
    {
      malformedFamily: "talks",
      curated: {
        talks: [{ id: "talk-missing-kind", status: "delivered", language: "en" }],
        books: [bookFact("book-after-missing-talk-kind")]
      }
    },
    {
      malformedFamily: "talks",
      curated: {
        talks: [{ kind: "talk", status: "delivered", language: "en" }],
        books: [bookFact("book-after-missing-talk-id")]
      }
    },
    {
      malformedFamily: "books",
      curated: {
        talks: [talkFact("talk-after-missing-book-status")],
        books: [{ id: "book-missing-status", language: "en" }]
      }
    },
    {
      malformedFamily: "talks",
      curated: { talks: {}, books: [bookFact("valid-book-after-malformed-talks")] }
    },
    {
      malformedFamily: "books",
      curated: { talks: [talkFact("valid-talk-after-malformed-books")], books: {} }
    }
  ];
  for (const { malformedFamily, curated } of cases) {
    const requests = [];
    const harness = createHarness({
      input: phaseThreeInput({ curated }),
      fetchFn: builderApiFetch({ requestLog: requests })
    });

    await harness.handler({}, {});

    assert.equal(requests.filter(({ kind }) => kind === "caylent-list").length, 1);
    assert.equal(requests.filter(({ kind }) => kind === "builder-list").length, 1);
    assert.equal(harness.putCalls.length, 1);
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), true);
    if (malformedFamily === "talks") {
      assert.equal(Object.hasOwn(output.groups, "talks"), false);
      assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
    } else {
      assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
      assert.equal(Object.hasOwn(output.groups, "books"), false);
    }
  }
});

test("an article failure retains only its exact prior family while curated groups refresh and later recover", async () => {
  let caylentAttempts = 0;
  let articleSourceFails = true;
  const requests = [];
  const clock = createClock();
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("current-talk")],
      books: [bookFact("current-book")]
    } }),
    clock,
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => {
        caylentAttempts += 1;
        return articleSourceFails
          ? jsonResponse({ error: "synthetic article source failure" }, 503)
          : jsonResponse({ results: [article({ id: "recovered-article" })] });
      }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      requestLog: requests
    })
  });
  const previousArticleGroup = priorGroup({
    counts: { all: 8, en: 6, es: 2 },
    collectedAt: "2026-10-10T09:00:00.000Z",
    scopeId: "b".repeat(64)
  });
  harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { articles: previousArticleGroup } }));

  await harness.handler({}, {});

  assert.equal(caylentAttempts, 2, "a failed article source request is attempted and retried once");
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
  const retained = await readPut(harness.putCalls[0]);
  assert.deepEqual(retained.groups.articles, previousArticleGroup);
  assert.deepEqual(retained.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(retained.groups.books.counts, { all: 1, en: 1, es: 0 });

  articleSourceFails = false;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[1]);
  assert.deepEqual(recovered.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.equal(recovered.groups.articles.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.notEqual(recovered.groups.articles.scopeId, previousArticleGroup.scopeId);
  assert.equal(recovered.groups.talks.scopeId, retained.groups.talks.scopeId);
  assert.equal(recovered.groups.books.scopeId, retained.groups.books.scopeId);
  assert.equal(harness.putCalls.length, 2);
});

test("without a prior article group, NoSuchKey omits that family while fresh curated groups publish", async () => {
  let caylentAttempts = 0;
  const requests = [];
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("fresh-talk")],
      books: [bookFact("fresh-book")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => {
        caylentAttempts += 1;
        return jsonResponse({ error: "synthetic article source failure" }, 503);
      }]]),
      requestLog: requests
    })
  });

  await harness.handler({}, {});

  assert.equal(caylentAttempts, 2);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
  assert.equal(requests.some(({ kind }) => kind === "caylent-list"), true);
  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false, "absence is not reported as a measured zero");
  assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
});

test("an unsupported prior article group is omitted while fresh curated families publish", async () => {
  let caylentAttempts = 0;
  const requests = [];
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("fresh-talk-after-invalid-article-snapshot")],
      books: [bookFact("fresh-book-after-invalid-article-snapshot")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => {
        caylentAttempts += 1;
        return jsonResponse({ error: "synthetic article source failure" }, 503);
      }]]),
      requestLog: requests
    })
  });
  const unsupportedArticleGroup = {
    ...priorGroup({
      counts: { all: 99, en: 98, es: 1 },
      scopeId: "c".repeat(64)
    }),
    definitionVersion: 99
  };
  harness.objects.set(outputKey, JSON.stringify({
    schemaVersion: 1,
    groups: { articles: unsupportedArticleGroup }
  }));

  await harness.handler({}, {});

  assert.equal(caylentAttempts, 2, "the prior-group fallback follows a real article source failure");
  assert.equal(requests.some(({ kind }) => kind === "caylent-list"), true);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false, "unsupported prior data is unavailable, not a zero or retained count");
  assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
  assert.equal(bodyText(harness.putCalls[0].Body).includes('"all":99'), false);
});

test("a prior group with a non-string timestamp is omitted while fresh curated families publish", async () => {
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("fresh-talk-after-invalid-timestamp")],
      books: [bookFact("fresh-book-after-invalid-timestamp")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]])
    })
  });
  const invalidTimestampArticleGroup = {
    ...priorGroup({ counts: { all: 77, en: 70, es: 7 } }),
    collectedAt: { toString: null }
  };
  harness.objects.set(outputKey, JSON.stringify({
    schemaVersion: 1,
    groups: { articles: invalidTimestampArticleGroup }
  }));

  await harness.handler({}, {});

  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false);
  assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
});

test("storage read errors and malformed fallback JSON fail without replacing the last bytes", async () => {
  for (const fallbackFailure of ["storage-read", "malformed-json"]) {
    let caylentAttempts = 0;
    const requests = [];
    const harness = createHarness({
      input: phaseThreeInput({ curated: {
        talks: [talkFact("fresh-talk")],
        books: [bookFact("fresh-book")]
      } }),
      fetchFn: builderApiFetch({
        caylentPages: new Map([[0, () => {
          caylentAttempts += 1;
          return jsonResponse({ error: "synthetic article source failure" }, 503);
        }]]),
        requestLog: requests
      })
    });
    const previous = fallbackFailure === "malformed-json"
      ? "{malformed previous bytes"
      : '{"schemaVersion":1,"groups":{"articles":{"old":"bytes"}}}';
    harness.objects.set(outputKey, previous);
    if (fallbackFailure === "storage-read") {
      const storageError = new Error("synthetic output storage failure");
      storageError.name = "ServiceUnavailable";
      harness.setGetFailure(outputKey, storageError);
    }

    await assert.rejects(() => harness.handler({}, {}));

    assert.equal(caylentAttempts, 2, `${fallbackFailure} follows a real failed source attempt`);
    assert.equal(requests.some(({ kind }) => kind === "caylent-list"), true);
    assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
    assert.equal(harness.putCalls.length, 0);
    assert.equal(harness.objects.get(outputKey), previous);
  }
});

test("if every input 3 family fails there is no output write, and a failed Put preserves old bytes", async () => {
  let failingAttempts = 0;
  const requests = [];
  const allFailed = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("duplicate-talk"), talkFact("duplicate-talk")],
      books: [bookFact("duplicate-book"), bookFact("duplicate-book")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => {
        failingAttempts += 1;
        return jsonResponse({ error: "synthetic article source failure" }, 503);
      }]]),
      requestLog: requests
    })
  });
  const previousAllFailed = "previous aggregate bytes remain intact when no family succeeds";
  allFailed.objects.set(outputKey, previousAllFailed);

  await assert.rejects(() => allFailed.handler({}, {}));

  assert.equal(failingAttempts, 2, "no-write failure must follow a real article source failure");
  assert.equal(requests.some(({ kind }) => kind === "caylent-list"), true);
  assert.equal(allFailed.putCalls.length, 0);
  assert.equal(allFailed.objects.get(outputKey), previousAllFailed);

  const previous = "previous public bytes remain exact";
  const writeRequests = [];
  const writeFailure = new Error("synthetic S3 PutObject failure");
  const failedWrite = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("valid-talk")],
      books: [bookFact("valid-book")]
    } }),
    fetchFn: builderApiFetch({ requestLog: writeRequests }),
    putFailure: writeFailure
  });
  failedWrite.objects.set(outputKey, previous);

  await assert.rejects(() => failedWrite.handler({}, {}));

  assert.equal(writeRequests.some(({ kind }) => kind === "caylent-list"), true);
  assert.equal(writeRequests.some(({ kind }) => kind === "builder-list"), true);
  assert.equal(failedWrite.putCalls.length, 1);
  assert.equal(failedWrite.objects.get(outputKey), previous);
});

test("unsupported input 3 versions and malformed source or family shapes reject before provider calls", async () => {
  for (const invalidInput of [
    { ...phaseThreeInput(), schemaVersion: 4 },
    { ...phaseThreeInput(), definitionVersion: 2 },
    phaseThreeInput({ sources: [sourceInput().source] }),
    phaseThreeInput({ sources: [sourceInput().source, builderCenterSource(), builderCenterSource()] }),
    phaseThreeInput({ curated: { talks: [] } }),
    phaseThreeInput({ curated: { talks: [], books: [], music: [] } })
  ]) {
    let fetchCount = 0;
    const harness = createHarness({
      input: invalidInput,
      fetchFn: async () => {
        fetchCount += 1;
        return jsonResponse({ results: [] });
      }
    });

    await assert.rejects(() => harness.handler({}, {}));

    assert.equal(fetchCount, 0);
    assert.equal(harness.putCalls.length, 0);
  }
});

test("input 3 enforces curated kind and status enums while excluding explicit unknowns and unsupported languages", async () => {
  const malformedCases = [
    {
      family: "talks",
      curated: {
        talks: [talkFact("unsupported-kind", "meetup")],
        books: [bookFact("valid-book")]
      }
    },
    {
      family: "talks",
      curated: {
        talks: [talkFact("unsupported-status", "talk", "finished")],
        books: [bookFact("valid-book-after-status")]
      }
    },
    {
      family: "books",
      curated: {
        talks: [talkFact("valid-talk")],
        books: [bookFact("unsupported-status", "released")]
      }
    }
  ];

  for (const { family, curated } of malformedCases) {
    const harness = createHarness({
      input: phaseThreeInput({ curated }),
      fetchFn: builderApiFetch()
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, family), false);
    assert.equal(Object.hasOwn(output.groups, family === "talks" ? "books" : "talks"), true);
  }

  const excluded = createHarness({
    input: phaseThreeInput({
      curated: {
        talks: [
          talkFact("explicit-unknown-kind", "unknown", "delivered", "en"),
          talkFact("explicit-unknown-status", "talk", "unknown", "en"),
          talkFact("unsupported-language", "talk", "delivered", "fr")
        ],
        books: [
          bookFact("explicit-unknown-book-status", "unknown", "en"),
          bookFact("unsupported-book-language", "published", "fr")
        ]
      }
    }),
    fetchFn: builderApiFetch()
  });
  await excluded.handler({}, {});
  const excludedOutput = await readPut(excluded.putCalls[0]);
  assert.deepEqual(excludedOutput.groups.talks.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(excludedOutput.groups.books.counts, { all: 0, en: 0, es: 0 });
});

test("an unknown prior aggregate group key is a document failure during fallback", async () => {
  const harness = createHarness({
    input: phaseThreeInput({
      curated: {
        talks: [talkFact("fresh-talk")],
        books: [bookFact("fresh-book")]
      }
    }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]])
    })
  });
  const previous = JSON.stringify({
    schemaVersion: 1,
    groups: {
      articles: priorGroup(),
      future: priorGroup()
    }
  });
  harness.objects.set(outputKey, previous);

  await assert.rejects(() => harness.handler({}, {}));
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
  assert.equal(harness.putCalls.length, 0);
  assert.equal(harness.objects.get(outputKey), previous);
});

test("schema 3 omits the operational article count when the article group is unavailable", async () => {
  const harness = createHarness({
    input: phaseThreeInput({
      curated: {
        talks: [talkFact("fresh-talk")],
        books: [bookFact("fresh-book")]
      }
    }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]])
    })
  });

  const result = await harness.handler({}, {});
  assert.equal(Object.hasOwn(result, "count"), false);
  assert.equal(harness.logs.some((line) => line.includes('"publicationCount"')), false);
  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false);
});

test("an unexpected curated scope process error aborts without fallback, write, or raw error logging", async () => {
  const privatePayload = "synthetic-private-create-hash-failure";
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("talk-before-process-failure")],
      books: [bookFact("book-after-process-failure")]
    } }),
    fetchFn: builderApiFetch(),
    createHashFaultAfter: 2,
    createHashFault: new Error(privatePayload)
  });
  const previous = "previous aggregate bytes remain intact after a process failure";
  harness.objects.set(outputKey, previous);

  await assert.rejects(() => harness.handler({}, {}), (error) => {
    assert.equal(error.code, "COLLECTION_FAILED");
    return true;
  });

  assert.equal(harness.putCalls.length, 0);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 0);
  assert.equal(harness.objects.get(outputKey), previous);
  const logs = harness.logs.join("\n");
  assert.equal(logs.includes("COLLECTION_FAILED"), true);
  assert.equal(logs.includes(privatePayload), false);
});

function newsletterEnvelope(publicationId = beehiivPublicationId, subscribers = 0) {
  return { data: { id: publicationId, stats: { active_subscriptions: subscribers } } };
}

function newsletterRequestHeader(request, name) {
  const key = Object.keys(request.headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : request.headers[key];
}

function assertNoNewsletterCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregate must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
}

test("input 1, 2, and 3 remain compatible and never read Beehiiv credentials or call its API", async () => {
  const cases = [
    { name: "input 1", input: sourceInput(), expectedGroups: ["articles"] },
    { name: "input 2", input: phaseTwoInput(), expectedGroups: ["articles"] },
    { name: "input 3", input: phaseThreeInput(), expectedGroups: ["articles", "books", "talks"] }
  ];

  for (const { name, input, expectedGroups } of cases) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFourApiFetch({ requestLog }) });
    await harness.handler({}, {});
    assert.deepEqual(harness.secretCalls, [], `${name} must not read the configured Beehiiv secret`);
    assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 0, `${name} must not call Beehiiv`);
    assert.deepEqual(Object.keys((await readPut(harness.putCalls[0])).groups).sort(), expectedGroups);
  }
});

test("input 4 reads apiKey from Secrets Manager JSON, requests only active subscriptions, and publishes the current aggregate including zero", async () => {
  let subscribers = 0;
  let currentApiKey = beehiivApiKey;
  const requestLog = [];
  const fetchFn = phaseFourApiFetch({
    requestLog,
    newsletterResponder: ({ request }) => {
      const requestedPublication = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      return jsonResponse(newsletterEnvelope(requestedPublication, subscribers));
    }
  });
  const harness = createHarness({ input: phaseFourInput(), fetchFn, clock: createClock() });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const firstGroup = first.groups.newsletter;
  assert.deepEqual(Object.keys(first.groups).sort(), ["articles", "books", "newsletter", "talks"]);
  assert.deepEqual(Object.keys(firstGroup).sort(), [
    "basis", "collectedAt", "definitionVersion", "publication", "scopeId", "subscribers"
  ]);
  assert.equal(firstGroup.definitionVersion, 1);
  assert.equal(firstGroup.basis, "current");
  assert.equal(firstGroup.collectedAt, "2026-10-16T12:00:00.000Z");
  assert.match(firstGroup.scopeId, /^[a-f0-9]{64}$/);
  assert.deepEqual(firstGroup.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
  assert.equal(firstGroup.subscribers, 0, "a verified zero remains a current measured count");

  const firstRequest = requestLog.find(({ kind }) => kind === "beehiiv");
  assert.equal(firstRequest.url, `https://api.beehiiv.com/v2/publications/${encodeURIComponent(beehiivPublicationId)}?expand=stat_active_subscriptions`);
  assert.equal(firstRequest.method, "GET");
  assert.equal(newsletterRequestHeader(firstRequest, "authorization"), `Bearer ${currentApiKey}`);
  assert.equal(firstRequest.redirect, "error", "the request carrying the private key must refuse redirects");
  assert.ok(firstRequest.signal, "the provider request carries an abort signal");
  assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === firstRequest.signal)?.milliseconds, 10_000, "the credential-bearing provider request itself keeps the ten-second timeout");
  assert.deepEqual(harness.secretCalls, [{ SecretId: beehiivSecretArn }], "GetSecretValue uses AWSCURRENT by default and passes no private value in its request");

  const rotatedArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic-beehiiv-key-rotated";
  currentApiKey = "synthetic-rotated-beehiiv-api-key-canary";
  const rotatedSecretExtraCanary = "synthetic-rotated-secret-extra-canary";
  harness.setSecretResponse(rotatedArn, {
    SecretString: JSON.stringify({ apiKey: currentApiKey, operatorNote: rotatedSecretExtraCanary })
  });
  harness.env.BEEHIIV_API_KEY_SECRET_ARN = rotatedArn;
  subscribers = 27;
  harness.setInput(phaseFourInput({
    sources: [builderCenterSource(), sourceInput().source],
    curated: { talks: [talkFact("unrelated-scope-talk")], books: [bookFact("unrelated-scope-book")] }
  }));
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  assert.equal(second.groups.newsletter.subscribers, 27);
  assert.equal(second.groups.newsletter.scopeId, firstGroup.scopeId, "count, secret ARN/value, unrelated family facts, and source order are outside newsletter scope");
  assert.equal(newsletterRequestHeader(requestLog.filter(({ kind }) => kind === "beehiiv")[1], "authorization"), `Bearer ${currentApiKey}`);
  assert.deepEqual(harness.secretCalls, [
    { SecretId: beehiivSecretArn },
    { SecretId: rotatedArn }
  ]);
  assertNoNewsletterCanaries(
    harness,
    beehiivApiKey,
    currentApiKey,
    beehiivSecretExtraFieldCanary,
    rotatedSecretExtraCanary,
    beehiivPublicationId,
    beehiivSecretArn
  );
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 2);
});

test("input 4 rejects malformed document roots before provider work while present newsletter config failures isolate", async () => {
  const invalidDocuments = [
    (() => { const input = phaseFourInput(); delete input.newsletter; return input; })(),
    { ...phaseFourInput(), unexpected: true },
    { ...phaseFourInput(), schemaVersion: 5 }
  ];
  for (const input of invalidDocuments) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFourApiFetch({ requestLog }) });
    await assertFailedWithoutReplacing(harness);
    assert.deepEqual(harness.secretCalls, []);
    assert.deepEqual(requestLog, [], "root validation must finish before any provider request");
  }

  const invalidNewsletterSelections = [
    null,
    {},
    [],
    { id: "another-publication", publicationId: beehiivPublicationId, language: "en" },
    { id: "simple-aws", publicationId: " \t ", language: "en" },
    { id: "simple-aws", publicationId: beehiivPublicationId, language: "fr" },
    { id: "simple-aws", publicationId: beehiivPublicationId, language: "en", extra: "private selector" }
  ];
  for (const newsletter of invalidNewsletterSelections) {
    const requestLog = [];
    const harness = createHarness({ input: phaseFourInput({ newsletter }), fetchFn: phaseFourApiFetch({ requestLog }) });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"], "a malformed known family is omitted, never represented by a zero");
    assert.equal(harness.secretCalls.length, 0, "invalid publication selection is rejected before secret retrieval");
    assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 0);
    const canaries = [beehiivPublicationId, "private selector"];
    if (newsletter && typeof newsletter.publicationId === "string" && newsletter.publicationId.trim() !== "") {
      canaries.push(newsletter.publicationId);
    }
    assertNoNewsletterCanaries(harness, ...canaries);
  }
});

test("input 4 accepts only a matching publication and safe nonnegative integer active-subscription aggregate", async () => {
  const malformedResponses = [
    ["boolean true", { data: { id: beehiivPublicationId, stats: { active_subscriptions: true } } }],
    ["boolean false", { data: { id: beehiivPublicationId, stats: { active_subscriptions: false } } }],
    ["null", { data: { id: beehiivPublicationId, stats: { active_subscriptions: null } } }],
    ["missing value", { data: { id: beehiivPublicationId, stats: {} } }],
    ["string", { data: { id: beehiivPublicationId, stats: { active_subscriptions: "12" } } }],
    ["negative", { data: { id: beehiivPublicationId, stats: { active_subscriptions: -1 } } }],
    ["fractional", { data: { id: beehiivPublicationId, stats: { active_subscriptions: 1.5 } } }],
    ["unsafe integer", { data: { id: beehiivPublicationId, stats: { active_subscriptions: Number.MAX_SAFE_INTEGER + 1 } } }],
    ["array", { data: { id: beehiivPublicationId, stats: { active_subscriptions: [12] } } }],
    ["object", { data: { id: beehiivPublicationId, stats: { active_subscriptions: { count: 12 } } } }],
    ["wrong publication id", { data: { id: "different-private-publication", stats: { active_subscriptions: 12 } } }],
    ["missing stats", { data: { id: beehiivPublicationId } }],
    ["missing data", {}]
  ];

  for (const [description, responseBody] of malformedResponses) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseFourApiFetch({ requestLog, newsletterResponder: () => jsonResponse(responseBody) })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "newsletter"), false, `${description} must fail only newsletter collection and must not become zero`);
    assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"]);
    assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 1);
    assertNoNewsletterCanaries(harness, beehiivApiKey, beehiivPublicationId, "different-private-publication");
  }
});

test("input 4 retries only the bounded transient provider failures and never retries authorization or redirects", async () => {
  for (const status of [408, 425, 429, 500, 599]) {
    let attempts = 0;
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseFourApiFetch({
        requestLog,
        newsletterResponder: () => {
          attempts += 1;
          return attempts === 1
            ? jsonResponse({ error: "synthetic private Beehiiv body" }, status)
            : jsonResponse(newsletterEnvelope(beehiivPublicationId, 23));
        }
      })
    });
    await harness.handler({}, {});
    assert.equal(attempts, 2, `HTTP ${status} receives exactly one retry`);
    assert.equal((await readPut(harness.putCalls[0])).groups.newsletter.subscribers, 23);
    for (const request of requestLog.filter(({ kind }) => kind === "beehiiv")) {
      assert.equal(request.redirect, "error");
    }
    assertNoNewsletterCanaries(harness, beehiivApiKey, "synthetic private Beehiiv body");
  }

  let networkAttempts = 0;
  const networkRequestLog = [];
  const recoveredNetwork = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseFourApiFetch({
      requestLog: networkRequestLog,
      newsletterResponder: () => {
        networkAttempts += 1;
        if (networkAttempts === 1) throw new Error("synthetic private key network error");
        return jsonResponse(newsletterEnvelope(beehiivPublicationId, 4));
      }
    })
  });
  await recoveredNetwork.handler({}, {});
  assert.equal(networkAttempts, 2, "one network failure receives exactly one retry");
  assert.equal((await readPut(recoveredNetwork.putCalls[0])).groups.newsletter.subscribers, 4);
  assertNoNewsletterCanaries(recoveredNetwork, beehiivApiKey, "synthetic private key network error");

  for (const status of [401, 403, 404, 302]) {
    let attempts = 0;
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseFourApiFetch({
        requestLog,
        newsletterResponder: () => {
          attempts += 1;
          return jsonResponse({ error: "private provider response canary" }, status);
        }
      })
    });
    await harness.handler({}, {});
    assert.equal(attempts, 1, `HTTP ${status} is not retried`);
    assert.equal(Object.hasOwn((await readPut(harness.putCalls[0])).groups, "newsletter"), false);
    assert.equal(requestLog.find(({ kind }) => kind === "beehiiv").redirect, "error");
    assertNoNewsletterCanaries(harness, beehiivApiKey, "private provider response canary");
  }

  let persistentTransientAttempts = 0;
  const persistentTransient = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseFourApiFetch({
      newsletterResponder: () => {
        persistentTransientAttempts += 1;
        return jsonResponse({ error: "synthetic temporary failure" }, 503);
      }
    })
  });
  await persistentTransient.handler({}, {});
  assert.equal(persistentTransientAttempts, 2, "a repeated transient response stops after the single retry");
  assert.equal(Object.hasOwn((await readPut(persistentTransient.putCalls[0])).groups, "newsletter"), false);
});

test("missing, unreadable, empty, or binary-only Secrets Manager credentials isolate newsletter collection", async () => {
  const secretReadCanary = "synthetic-secret-read-error-canary";
  const cases = [
    { name: "missing ARN", options: { secretArn: null }, expectedCalls: 0 },
    { name: "blank ARN", options: { secretArn: " \t " }, expectedCalls: 0 },
    { name: "GetSecretValue error", options: { secretFailures: new Map([[beehiivSecretArn, new Error(secretReadCanary)]]) }, expectedCalls: 1 },
    { name: "missing SecretString", options: { secretResponse: {} }, expectedCalls: 1 },
    { name: "empty SecretString", options: { secretResponse: { SecretString: " \t\n " } }, expectedCalls: 1 },
    { name: "binary-only value", options: { secretResponse: { SecretBinary: Buffer.from("synthetic-binary-secret-canary") } }, expectedCalls: 1 },
    { name: "malformed JSON", options: { secretResponse: { SecretString: `{"apiKey":"${beehiivApiKey}"` } }, expectedCalls: 1 },
    { name: "JSON null", options: { secretResponse: { SecretString: "null" } }, expectedCalls: 1 },
    { name: "JSON array", options: { secretResponse: { SecretString: "[]" } }, expectedCalls: 1 },
    { name: "missing apiKey", options: { secretResponse: { SecretString: JSON.stringify({ operatorNote: secretReadCanary }) } }, expectedCalls: 1 },
    { name: "non-string apiKey", options: { secretResponse: { SecretString: JSON.stringify({ apiKey: 42 }) } }, expectedCalls: 1 },
    { name: "blank apiKey", options: { secretResponse: { SecretString: JSON.stringify({ apiKey: " \t " }) } }, expectedCalls: 1 }
  ];

  for (const { name, options, expectedCalls } of cases) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseFourApiFetch({ requestLog }),
      ...options
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"], `${name} omits newsletter without affecting fresh siblings`);
    assert.equal(harness.secretCalls.length, expectedCalls, `${name} uses only the expected secret lookup`);
    assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 0, `${name} cannot make a credential-less provider request`);
    assertNoNewsletterCanaries(
      harness,
      beehiivApiKey,
      secretReadCanary,
      beehiivSecretExtraFieldCanary,
      "synthetic-binary-secret-canary"
    );
  }
});

test("newsletter failures retain their exact prior group, omit it on first failure, and recover with a fresh record", async () => {
  let mode = "success";
  let subscribers = 31;
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput({ curated: { talks: [talkFact("first-talk")], books: [bookFact("first-book")] } }),
    fetchFn: phaseFourApiFetch({
      requestLog,
      newsletterResponder: ({ request, attempt }) => {
        if (mode === "failure") return jsonResponse({ error: "synthetic private response canary" }, 503);
        const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(publicationId, subscribers));
      }
    }),
    clock: createClock("2026-10-16T12:00:00.000Z")
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const firstNewsletter = first.groups.newsletter;

  mode = "failure";
  harness.setInput(phaseFourInput({ curated: {
    talks: [talkFact("second-talk")],
    books: [bookFact("second-book"), bookFact("another-second-book", "published", "es")]
  } }));
  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[1]);
  assert.deepEqual(retained.groups.newsletter, firstNewsletter, "fallback preserves count, collection date, scope, and public identity byte-for-byte");
  assert.equal(retained.groups.talks.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.deepEqual(retained.groups.talks.counts, { all: 1, en: 1, es: 0 }, "fresh curated siblings are published while the family is retained");
  assert.deepEqual(retained.groups.books.counts, { all: 2, en: 1, es: 1 });
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "fallback reads the previous aggregate only after newsletter failure");

  mode = "success";
  subscribers = 47;
  harness.clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[2]);
  assert.equal(recovered.groups.newsletter.subscribers, 47);
  assert.notEqual(recovered.groups.newsletter.collectedAt, firstNewsletter.collectedAt);
  assert.equal(recovered.groups.newsletter.scopeId, firstNewsletter.scopeId);
  assert.equal(recovered.groups.newsletter.publication.id, firstNewsletter.publication.id);
  assert.equal(Object.hasOwn(recovered.groups.newsletter, "retained"), false);
  for (const family of ["articles", "talks", "books"]) {
    assert.deepEqual(recovered.groups[family].counts, retained.groups[family].counts, `newsletter recovery does not change ${family} values`);
    assert.equal(recovered.groups[family].scopeId, retained.groups[family].scopeId, `newsletter recovery does not change ${family} scope`);
  }
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 4, "success calls once; the failed 503 refresh gets one retry; recovery calls once");
  assertNoNewsletterCanaries(harness, beehiivApiKey, "synthetic private response canary", beehiivPublicationId);
});

test("a first newsletter failure omits the family and does not publish a placeholder zero", async () => {
  let attempts = 0;
  const harness = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseFourApiFetch({
      newsletterResponder: () => {
        attempts += 1;
        return jsonResponse({ error: "synthetic Beehiiv outage" }, 503);
      }
    })
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  assert.equal(attempts, 2);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"]);
  assert.equal(Object.values(output.groups).some((group) => group.subscribers === 0), false);
  assertNoNewsletterCanaries(harness, beehiivApiKey, "synthetic Beehiiv outage");
});

test("a sole fresh newsletter family publishes alone, while all-family failure performs no fallback read or write", async () => {
  let failNewsletter = false;
  const requestLog = [];
  const articleFetcher = builderApiFetch({
    requestLog,
    caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]])
  });
  const harness = createHarness({
    input: phaseFourInput({ curated: {
      talks: [talkFact("duplicate-talk"), talkFact("duplicate-talk")],
      books: [bookFact("duplicate-book"), bookFact("duplicate-book")]
    } }),
    fetchFn: phaseFourApiFetch({
      requestLog,
      articleFetcher,
      newsletterResponder: () => failNewsletter
        ? jsonResponse({ error: "synthetic newsletter failure" }, 503)
        : jsonResponse(newsletterEnvelope(beehiivPublicationId, 9))
    })
  });

  await harness.handler({}, {});
  const onlyNewsletterBytes = bodyText(harness.putCalls[0].Body);
  const onlyNewsletter = JSON.parse(onlyNewsletterBytes);
  assert.deepEqual(Object.keys(onlyNewsletter.groups), ["newsletter"]);
  assert.equal(onlyNewsletter.groups.newsletter.subscribers, 9);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "fresh newsletter permits one prior-family fallback lookup");

  failNewsletter = true;
  await assert.rejects(() => harness.handler({}, {}));
  assert.equal(harness.putCalls.length, 1, "when every family fails the existing newsletter bytes are not replaced");
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "all-family failure does not perform another fallback lookup");
  assert.equal(harness.objects.get(outputKey), onlyNewsletterBytes);
});

test("newsletter source-scope changes never relabel a prior count under new publication or language metadata", async () => {
  let failProvider = false;
  let subscribers = 12;
  const requestLog = [];
  const responder = ({ request }) => {
    if (failProvider) return jsonResponse({ error: "synthetic changed-scope failure" }, 503);
    const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    return jsonResponse(newsletterEnvelope(publicationId, subscribers));
  };
  const harness = createHarness({
    input: phaseFourInput({ newsletter: { id: "simple-aws", publicationId: "publication-a", language: "en" } }),
    fetchFn: phaseFourApiFetch({ requestLog, newsletterResponder: responder })
  });

  await harness.handler({}, {});
  const first = (await readPut(harness.putCalls[0])).groups.newsletter;

  harness.setInput(phaseFourInput({ newsletter: { id: "simple-aws", publicationId: "publication-b/encoded", language: "en" } }));
  failProvider = true;
  await harness.handler({}, {});
  const afterSelectorFailure = await readPut(harness.putCalls[1]);
  assert.deepEqual(afterSelectorFailure.groups.newsletter, first, "a failed refresh keeps every prior newsletter field unchanged even when configuration has changed");
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv")[1].url, "https://api.beehiiv.com/v2/publications/publication-b%2Fencoded?expand=stat_active_subscriptions");

  failProvider = false;
  subscribers = 19;
  await harness.handler({}, {});
  const second = (await readPut(harness.putCalls[2])).groups.newsletter;
  assert.equal(second.publication.id, "simple-aws");
  assert.equal(second.publication.language, "en");
  assert.notEqual(second.scopeId, first.scopeId, "the provider publication selector belongs to semantic scope");

  harness.setInput(phaseFourInput({ newsletter: { id: "simple-aws", publicationId: "publication-b/encoded", language: "es" } }));
  await harness.handler({}, {});
  const spanish = (await readPut(harness.putCalls[3])).groups.newsletter;
  assert.equal(spanish.publication.language, "es");
  assert.notEqual(spanish.scopeId, second.scopeId, "the configured content language belongs to semantic scope");
});

test("a failed article family retains its exact record while a fresh newsletter publishes", async () => {
  let failArticles = false;
  let subscribers = 8;
  const requestLog = [];
  const articleFetcher = builderApiFetch({
    requestLog,
    caylentPages: new Map([[0, () => failArticles
      ? jsonResponse({ error: "synthetic article source failure" }, 503)
      : { results: [article({ id: "successful-article" })] }]])
  });
  const harness = createHarness({
    input: phaseFourInput({ curated: { talks: [talkFact("talk-before-article-failure")], books: [bookFact("book-before-article-failure")] } }),
    fetchFn: phaseFourApiFetch({
      requestLog,
      articleFetcher,
      newsletterResponder: ({ request }) => {
        const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(publicationId, subscribers));
      }
    })
  });

  await harness.handler({}, {});
  const previous = await readPut(harness.putCalls[0]);
  const previousArticles = previous.groups.articles;

  failArticles = true;
  subscribers = 13;
  harness.clock.set("2026-10-17T12:00:00.000Z");
  harness.setInput(phaseFourInput({ curated: {
    talks: [talkFact("talk-after-article-failure")],
    books: [bookFact("book-after-article-failure")]
  } }));
  await harness.handler({}, {});
  const current = await readPut(harness.putCalls[1]);
  assert.deepEqual(current.groups.articles, previousArticles, "article fallback keeps its own original value and metadata");
  assert.equal(current.groups.newsletter.subscribers, 13, "a successful sibling is fresh even when articles fail");
  assert.notEqual(current.groups.newsletter.collectedAt, previous.groups.newsletter.collectedAt);
  assert.deepEqual(current.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(current.groups.books.counts, { all: 1, en: 1, es: 0 });
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 2);
});

test("malformed known newsletter fallback is isolated, but prior document and storage errors still abort publication", async () => {
  const newsletterFailureFetch = phaseFourApiFetch({
    newsletterResponder: () => jsonResponse({ error: "synthetic newsletter failure" }, 503)
  });
  const websiteInventoryGroup = priorGroup({ sources: [{ id: "website-inventory", label: "Website inventory" }] });
  const malformedNewsletterPrevious = JSON.stringify({
    schemaVersion: 1,
    groups: {
      articles: priorGroup(),
      talks: websiteInventoryGroup,
      books: websiteInventoryGroup,
      newsletter: { ...priorNewsletterGroup(), subscribers: "not-a-safe-count" }
    }
  });
  const isolated = createHarness({ input: phaseFourInput(), fetchFn: newsletterFailureFetch });
  isolated.objects.set(outputKey, malformedNewsletterPrevious);
  await isolated.handler({}, {});
  assert.deepEqual(Object.keys((await readPut(isolated.putCalls[0])).groups).sort(), ["articles", "books", "talks"]);

  const badPriorDocuments = [
    "not-json",
    JSON.stringify({ schemaVersion: 1, groups: { articles: priorGroup(), future: priorGroup() } })
  ];
  for (const previous of badPriorDocuments) {
    const harness = createHarness({ input: phaseFourInput(), fetchFn: newsletterFailureFetch });
    harness.objects.set(outputKey, previous);
    await assert.rejects(() => harness.handler({}, {}));
    assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1);
    assert.equal(harness.putCalls.length, 0, "a document-level fallback error cannot publish fresh partial groups");
    assert.equal(harness.objects.get(outputKey), previous);
  }

  const storagePrevious = JSON.stringify({ schemaVersion: 1, groups: { articles: priorGroup() } });
  const storage = createHarness({ input: phaseFourInput(), fetchFn: newsletterFailureFetch });
  storage.objects.set(outputKey, storagePrevious);
  storage.setGetFailure(outputKey, new Error("synthetic aggregate read failure"));
  await assert.rejects(() => storage.handler({}, {}));
  assert.equal(storage.putCalls.length, 0);
  assert.equal(storage.objects.get(outputKey), storagePrevious);
});
