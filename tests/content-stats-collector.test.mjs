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
      return responseFromFixture(caylentPages.get(offset), { results: [] });
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
