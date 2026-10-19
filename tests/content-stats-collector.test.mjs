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
const googleOAuthParameterArn = "arn:aws:ssm:us-east-1:123456789012:parameter/synthetic/google-oauth";
const googleClientId = "synthetic-google-client-id-canary";
const googleClientSecret = "synthetic-google-client-secret-canary";
const googleRefreshToken = "synthetic-google-refresh-token-canary";
const googleAccessToken = "synthetic-google-access-token-canary";
const googlePropertyId = "123456789";
const googleHostname = "newsletter.simpleaws.dev";
const googleArticlePathPattern = "/p/[^/]+/?";
const googleTimeZone = "America/Argentina/Cordoba";
const googleSearchSiteUrl = "sc-domain:simpleaws.dev";
const googleSearchArticleUrlPattern = String.raw`(?-i)^https://newsletter\.simpleaws\.dev/p/[^/?#]+/?$`;
const googleSearchTimeZone = "America/Los_Angeles";
const googleResponseCanary = "synthetic-google-private-response-canary";
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

function phaseFiveAnalytics({ propertyId = googlePropertyId, timeZone = googleTimeZone, recordedSince } = {}) {
  return {
    id: "simple-aws",
    propertyId,
    language: "en",
    hostname: googleHostname,
    articlePathPattern: googleArticlePathPattern,
    timeZone,
    ...(recordedSince === undefined ? {} : { recordedSince })
  };
}

function phaseFiveInput({ sources, curated, newsletter, analytics } = {}) {
  const input = phaseFourInput({ sources, curated, newsletter });
  return {
    ...input,
    schemaVersion: 5,
    analytics: analytics === undefined ? phaseFiveAnalytics() : analytics
  };
}

function phaseSixSearchConsole({
  id = "simple-aws",
  siteUrl = googleSearchSiteUrl,
  language = "en",
  articleUrlPattern = googleSearchArticleUrlPattern,
  availableSince = "2025-06-20"
} = {}) {
  return { id, siteUrl, language, articleUrlPattern, availableSince };
}

function phaseSixInput({ sources, curated, newsletter, analytics, searchConsole } = {}) {
  const input = phaseFiveInput({ sources, curated, newsletter, analytics });
  return {
    ...input,
    schemaVersion: 6,
    searchConsole: searchConsole === undefined ? phaseSixSearchConsole() : searchConsole
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

function priorArticleViewRecord({
  basis = "period",
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "c".repeat(64),
  publication = { id: "simple-aws", label: "Simple AWS", language: "en" },
  timeZone = googleTimeZone,
  startDate = "2026-10-01",
  endDate = "2026-10-07",
  views = 17,
  qualifications = []
} = {}) {
  return { basis, collectedAt, scopeId, publication, timeZone, startDate, endDate, views, qualifications };
}

function priorArticleViewsGroup(records = {
  "7d": priorArticleViewRecord(),
  "30d": priorArticleViewRecord({ startDate: "2026-09-08", endDate: "2026-10-07", scopeId: "d".repeat(64), views: 30 }),
  "90d": priorArticleViewRecord({ startDate: "2026-07-10", endDate: "2026-10-07", scopeId: "e".repeat(64), views: 90 }),
  "12m": priorArticleViewRecord({ startDate: "2025-10-08", endDate: "2026-10-07", scopeId: "f".repeat(64), views: 120 }),
  ytd: priorArticleViewRecord({ startDate: "2026-01-01", endDate: "2026-10-07", scopeId: "1".repeat(64), views: 200 }),
  total: priorArticleViewRecord({ basis: "recorded-total", startDate: "2024-01-01", endDate: "2026-10-07", scopeId: "2".repeat(64), views: 500 })
}) {
  return { definitionVersion: 1, records };
}

function priorArticleSearchRecord({
  collectedAt = "2026-10-14T04:30:00.000Z",
  scopeId = "a".repeat(64),
  startDate = "2026-10-06",
  endDate = "2026-10-12",
  clicks = 17
} = {}) {
  return {
    basis: "period",
    collectedAt,
    scopeId,
    publication: { id: "simple-aws", label: "Simple AWS", language: "en" },
    timeZone: googleSearchTimeZone,
    startDate,
    endDate,
    clicks
  };
}

function priorArticleSearchClicksGroup(records = {
  "7d": priorArticleSearchRecord({ scopeId: "a".repeat(64), startDate: "2026-10-06", endDate: "2026-10-12", clicks: 17 }),
  "30d": priorArticleSearchRecord({ scopeId: "b".repeat(64), startDate: "2026-09-13", endDate: "2026-10-12", clicks: 30 }),
  "90d": priorArticleSearchRecord({ scopeId: "c".repeat(64), startDate: "2026-07-15", endDate: "2026-10-12", clicks: 90 }),
  "12m": priorArticleSearchRecord({ scopeId: "d".repeat(64), startDate: "2025-10-13", endDate: "2026-10-12", clicks: 120 }),
  ytd: priorArticleSearchRecord({ scopeId: "e".repeat(64), startDate: "2026-01-01", endDate: "2026-10-12", clicks: 200 })
}) {
  return { definitionVersion: 1, records };
}

function priorFullOutput({ articleViews = priorArticleViewsGroup() } = {}) {
  const inventoryGroup = priorGroup({ sources: [{ id: "website-inventory", label: "Website inventory" }] });
  return {
    schemaVersion: 1,
    groups: {
      articles: priorGroup(),
      talks: inventoryGroup,
      books: inventoryGroup,
      newsletter: priorNewsletterGroup(),
      ...(articleViews === null ? {} : { articleViews })
    }
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
  parameterArn = googleOAuthParameterArn,
  parameterResponse = {
    Parameter: {
      Name: googleOAuthParameterArn,
      Type: "SecureString",
      Value: JSON.stringify({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        refreshToken: googleRefreshToken
      })
    }
  },
  parameterFailures = new Map(),
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
  const parameterCalls = [];
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
  class GetParameterCommand {
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

  class SSMClient {
    async send(command) {
      if (!(command instanceof GetParameterCommand)) {
        throw new Error(`Unexpected SSM command: ${command?.constructor?.name}`);
      }
      parameterCalls.push(JSON.parse(JSON.stringify(command.input)));
      if (parameterFailures.has(command.input.Name)) throw parameterFailures.get(command.input.Name);
      if (command.input.Name !== parameterArn || parameterResponse === undefined) {
        const error = new Error(`Synthetic parameter is absent: ${command.input.Name}`);
        error.name = "ParameterNotFound";
        throw error;
      }
      return parameterResponse;
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
  const ssmSdk = { SSMClient, GetParameterCommand };
  const env = {
    STATS_BUCKET: bucket,
    STATS_INPUT_KEY: inputKey,
    STATS_OUTPUT_KEY: outputKey
  };
  if (secretArn !== null) env.BEEHIIV_API_KEY_SECRET_ARN = secretArn;
  if (parameterArn !== null) env.GOOGLE_OAUTH_PARAMETER_ARN = parameterArn;
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require(request) {
      if (request === "@aws-sdk/client-s3") return sdk;
      if (request === "@aws-sdk/client-secrets-manager") return secretsManagerSdk;
      if (request === "@aws-sdk/client-ssm") return ssmSdk;
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
    parameterCalls,
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
    },
    setParameterResponse(response) {
      parameterResponse = response;
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

function ga4Report({ views = 42, timeZone = googleTimeZone, metadata = {} } = {}) {
  return {
    metricHeaders: [{ name: "screenPageViews", type: "TYPE_INTEGER" }],
    dimensionHeaders: [],
    rowCount: 1,
    rows: [{ metricValues: [{ value: String(views) }] }],
    metadata: { timeZone, ...metadata }
  };
}

function phaseFiveApiFetch({
  requestLog = [],
  tokenResponder,
  reportResponder,
  searchResponder,
  newsletterResponder,
  articleFetcher,
  timeZone = googleTimeZone
} = {}) {
  const fallback = phaseFourApiFetch({ requestLog, newsletterResponder, articleFetcher });
  const attempts = new Map();
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const kind = url.origin === "https://oauth2.googleapis.com" && url.pathname === "/token"
      ? "google-oauth"
      : url.hostname === "analyticsdata.googleapis.com" && url.pathname.endsWith(":runReport")
        ? "google-report"
        : url.origin === "https://www.googleapis.com" && url.pathname.includes("/searchAnalytics/query")
          ? "google-search"
        : null;
    if (kind === null) return fallback(input, init);

    const bodyTextValue = typeof init.body === "string" ? init.body : String(init.body ?? "");
    const request = {
      kind,
      url: url.toString(),
      method: init.method,
      headers: init.headers ?? {},
      redirect: init.redirect,
      signal: init.signal,
      body: bodyTextValue,
      json: kind === "google-report" || kind === "google-search" ? JSON.parse(bodyTextValue) : undefined
    };
    const key = kind === "google-report"
      ? `${kind}:${request.json.dateRanges?.[0]?.startDate}:${request.json.dateRanges?.[0]?.endDate}`
      : kind === "google-search"
        ? `${kind}:${request.json.startDate}:${request.json.endDate}`
      : kind;
    const attempt = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, attempt);
    requestLog.push(request);
    if (kind === "google-oauth") {
      if (typeof tokenResponder === "function") return tokenResponder({ request, attempt });
      if (tokenResponder !== undefined) return responseFromFixture(tokenResponder);
      return jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" });
    }
    if (kind === "google-search") {
      if (typeof searchResponder === "function") return searchResponder({ request, attempt });
      if (searchResponder !== undefined) return responseFromFixture(searchResponder);
      return jsonResponse(searchConsoleResponse({ clicks: 42 }));
    }
    if (typeof reportResponder === "function") return reportResponder({ request, attempt });
    if (reportResponder !== undefined) return responseFromFixture(reportResponder);
    return jsonResponse(ga4Report({ views: 42, timeZone }));
  };
}

function assertNoGoogleCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregate must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
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

function googleRequests(requestLog, kind) {
  return requestLog.filter((request) => request.kind === kind);
}

function searchConsoleResponse({
  clicks = 42,
  rows,
  aggregationType = "byPage",
  metadata = {},
  ...rowFields
} = {}) {
  return {
    rows: rows ?? [{ keys: [], clicks, ...rowFields }],
    responseAggregationType: aggregationType,
    ...(Object.keys(metadata).length === 0 ? {} : { metadata })
  };
}

function reportRange(request) {
  return request.json.dateRanges[0];
}

function assertGoogleRequest(request, kind) {
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error", `${kind} must refuse credential redirects`);
  assert.ok(request.signal, `${kind} must carry a bounded request signal`);
}

function assertSearchRequest(request) {
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error", "Search Console requests must refuse redirects");
  assert.ok(request.signal, "Search Console requests must carry a bounded request signal");
}

test("inputs 1 through 4 remain compatible and never retrieve Google credentials or call Analytics", async () => {
  const cases = [
    { name: "input 1", input: sourceInput() },
    { name: "input 2", input: phaseTwoInput() },
    { name: "input 3", input: phaseThreeInput() },
    { name: "input 4", input: phaseFourInput() }
  ];
  for (const { name, input } of cases) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    await harness.handler({}, {});
    assert.deepEqual(harness.parameterCalls, [], `${name} must never retrieve Google OAuth credentials`);
    assert.equal(googleRequests(requestLog, "google-oauth").length, 0, `${name} must never refresh Google OAuth`);
    assert.equal(googleRequests(requestLog, "google-report").length, 0, `${name} must never query Analytics`);
    assert.deepEqual(Object.hasOwn((await readPut(harness.putCalls[0])).groups, "articleViews"), false);
  }
});

test("input 5 sends one fixed aggregate query per supported period and publishes safe interval records", async () => {
  const clock = createClock("2026-07-05T02:30:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput({ analytics: phaseFiveAnalytics({ recordedSince: "2025-06-01" }) }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      timeZone: googleTimeZone,
      reportResponder: () => jsonResponse({ ...ga4Report({ views: 42 }), providerPrivateField: googleResponseCanary })
    }),
    clock
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  const articleViews = output.groups.articleViews;
  assert.deepEqual(Object.keys(articleViews).sort(), ["definitionVersion", "records"]);
  assert.equal(articleViews.definitionVersion, 1);
  assert.deepEqual(Object.keys(articleViews.records).sort(), ["12m", "30d", "7d", "90d", "total", "ytd"]);
  assert.equal(output.schemaVersion, 1, "the public document keeps schema version 1");
  assert.deepEqual(Object.keys(output.groups).sort(), ["articleViews", "articles", "books", "newsletter", "talks"]);
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);

  const tokenRequests = googleRequests(requestLog, "google-oauth");
  assert.equal(tokenRequests.length, 1, "one invocation retrieves one OAuth token");
  const tokenRequest = tokenRequests[0];
  assert.equal(tokenRequest.url, "https://oauth2.googleapis.com/token");
  assertGoogleRequest(tokenRequest, "OAuth token request");
  assert.match(String(newsletterRequestHeader(tokenRequest, "content-type")), /^application\/x-www-form-urlencoded/i);
  const tokenBody = new URLSearchParams(tokenRequest.body);
  assert.deepEqual(Object.fromEntries(tokenBody), {
    grant_type: "refresh_token",
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: googleRefreshToken
  });
  assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === tokenRequest.signal)?.milliseconds, 10_000);

  const reports = googleRequests(requestLog, "google-report");
  assert.equal(reports.length, 6, "all five periods and the configured recorded total are queried once");
  const expectedRanges = [
    ["2026-06-25", "2026-07-01"],
    ["2026-06-02", "2026-07-01"],
    ["2026-04-03", "2026-07-01"],
    ["2025-07-02", "2026-07-01"],
    ["2026-01-01", "2026-07-01"],
    ["2025-06-01", "2026-07-01"]
  ];
  assert.deepEqual(reports.map((request) => [reportRange(request).startDate, reportRange(request).endDate]), expectedRanges);
  const expectedFilter = {
    andGroup: {
      expressions: [
        { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: googleHostname, caseSensitive: true } } },
        { filter: { fieldName: "pagePath", stringFilter: { matchType: "FULL_REGEXP", value: googleArticlePathPattern, caseSensitive: true } } }
      ]
    }
  };
  for (const request of reports) {
    assertGoogleRequest(request, "Analytics report request");
    assert.equal(request.url, `https://analyticsdata.googleapis.com/v1beta/properties/${googlePropertyId}:runReport`);
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${googleAccessToken}`);
    assert.deepEqual(request.json.metrics, [{ name: "screenPageViews" }]);
    assert.deepEqual(request.json.dimensionFilter, expectedFilter);
    assert.equal(Object.hasOwn(request.json, "dimensions"), false, "aggregate queries must not request page-level rows");
    assert.deepEqual(Object.keys(request.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }

  const recordKeys = ["basis", "collectedAt", "endDate", "publication", "qualifications", "scopeId", "startDate", "timeZone", "views"];
  const records = articleViews.records;
  const periodKeys = ["7d", "30d", "90d", "12m", "ytd", "total"];
  for (let index = 0; index < periodKeys.length; index += 1) {
    const period = periodKeys[index];
    const record = records[period];
    assert.deepEqual(Object.keys(record).sort(), recordKeys);
    assert.equal(record.basis, period === "total" ? "recorded-total" : "period");
    assert.equal(record.collectedAt, "2026-07-05T02:30:00.000Z");
    assert.equal(record.startDate, expectedRanges[index][0]);
    assert.equal(record.endDate, expectedRanges[index][1]);
    assert.equal(record.timeZone, googleTimeZone);
    assert.deepEqual(record.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
    assert.equal(record.views, 42);
    assert.deepEqual(record.qualifications, []);
    assert.match(record.scopeId, /^[a-f0-9]{64}$/);
  }

  const serialized = bodyText(harness.putCalls[0].Body);
  for (const canary of [
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    googleAccessToken,
    googleOAuthParameterArn,
    googlePropertyId,
    googleHostname,
    googleArticlePathPattern,
    googleResponseCanary
  ]) {
    assert.equal(serialized.includes(canary), false, `public aggregate must omit ${canary}`);
  }
  assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleAccessToken, googleOAuthParameterArn);
});

test("input 6 shares one decrypted OAuth refresh and publishes fixed Search Console aggregates safely", async () => {
  const clock = createClock("2026-10-16T04:30:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: () => jsonResponse(ga4Report({ views: 42 })),
      searchResponder: () => jsonResponse(searchConsoleResponse({
        rows: [{ clicks: 42, impressions: 100, ctr: 0.42, position: 2.5 }],
        metadata: { providerPrivateField: googleResponseCanary }
      }))
    }),
    clock
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  const records = output.groups.articleSearchClicks.records;
  assert.deepEqual(Object.keys(output.groups.articleSearchClicks).sort(), ["definitionVersion", "records"]);
  assert.equal(output.groups.articleSearchClicks.definitionVersion, 1);
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articleSearchClicks", "articleViews", "articles", "books", "newsletter", "talks"]);

  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  const tokenRequests = googleRequests(requestLog, "google-oauth");
  assert.equal(tokenRequests.length, 1, "Analytics and Search Console share one invocation-local token refresh");
  const reports = googleRequests(requestLog, "google-report");
  const searches = googleRequests(requestLog, "google-search");
  assert.equal(reports.length, 5);
  assert.equal(searches.length, 5);
  assert.ok([...reports, ...searches].every((request) => newsletterRequestHeader(request, "authorization") === `Bearer ${googleAccessToken}`));

  const expectedSearchRanges = [
    ["2026-10-06", "2026-10-12"],
    ["2026-09-13", "2026-10-12"],
    ["2026-07-15", "2026-10-12"],
    ["2025-10-13", "2026-10-12"],
    ["2026-01-01", "2026-10-12"]
  ];
  assert.deepEqual(searches.map((request) => [request.json.startDate, request.json.endDate]), expectedSearchRanges);
  const expectedFilter = {
    groupType: "and",
    filters: [{
      dimension: "page",
      operator: "includingRegex",
      expression: googleSearchArticleUrlPattern
    }]
  };
  for (const request of searches) {
    assertSearchRequest(request);
    assert.equal(request.url, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(googleSearchSiteUrl)}/searchAnalytics/query`);
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${googleAccessToken}`);
    assert.deepEqual(request.json, {
      startDate: request.json.startDate,
      endDate: request.json.endDate,
      type: "web",
      dataState: "final",
      aggregationType: "auto",
      dimensionFilterGroups: [expectedFilter]
    });
    assert.deepEqual(Object.keys(request.json).sort(), ["aggregationType", "dataState", "dimensionFilterGroups", "endDate", "startDate", "type"]);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }
  assert.deepEqual(
    reports.map((request) => [reportRange(request).startDate, reportRange(request).endDate])[0],
    ["2026-10-07", "2026-10-13"],
    "Analytics keeps its configured Cordoba date while Search Console uses Pacific dates"
  );

  const expectedRecordKeys = ["basis", "collectedAt", "clicks", "endDate", "publication", "scopeId", "startDate", "timeZone"].sort();
  const periods = ["7d", "30d", "90d", "12m", "ytd"];
  assert.deepEqual(Object.keys(records).sort(), periods.slice().sort());
  for (let index = 0; index < periods.length; index += 1) {
    const periodRecord = records[periods[index]];
    assert.deepEqual(Object.keys(periodRecord).sort(), expectedRecordKeys);
    assert.equal(periodRecord.basis, "period");
    assert.equal(periodRecord.collectedAt, "2026-10-16T04:30:00.000Z");
    assert.equal(periodRecord.startDate, expectedSearchRanges[index][0]);
    assert.equal(periodRecord.endDate, expectedSearchRanges[index][1]);
    assert.equal(periodRecord.timeZone, googleSearchTimeZone);
    assert.deepEqual(periodRecord.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
    assert.equal(periodRecord.clicks, 42);
    assert.match(periodRecord.scopeId, /^[a-f0-9]{64}$/);
  }

  const serialized = bodyText(harness.putCalls[0].Body);
  for (const privateValue of [
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    googleAccessToken,
    googleOAuthParameterArn,
    googlePropertyId,
    googleSearchSiteUrl,
    googleSearchArticleUrlPattern,
    googleHostname,
    googleArticlePathPattern,
    googleResponseCanary
  ]) {
    assert.equal(serialized.includes(privateValue), false, `public aggregate must omit ${privateValue}`);
  }
  assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleAccessToken, googleOAuthParameterArn, googleResponseCanary);
});

test("input 5 remains Analytics-only, while input 6 validates the exact Search Console selector before provider access", async () => {
  const input5Log = [];
  const input5Harness = createHarness({ input: phaseFiveInput(), fetchFn: phaseFiveApiFetch({ requestLog: input5Log }) });
  await input5Harness.handler({}, {});
  assert.equal(googleRequests(input5Log, "google-search").length, 0, "legacy input 5 cannot make a Search Console request");
  assert.equal(Object.hasOwn((await readPut(input5Harness.putCalls[0])).groups, "articleSearchClicks"), false);

  const selectorCases = [
    ["missing selector", undefined],
    ["null selector", null],
    ["unsupported identity", { ...phaseSixSearchConsole(), id: "other" }],
    ["wrong property", { ...phaseSixSearchConsole(), siteUrl: "https://simpleaws.dev/" }],
    ["unsupported language", { ...phaseSixSearchConsole(), language: "es" }],
    ["wrong article filter", { ...phaseSixSearchConsole(), articleUrlPattern: "https://newsletter.simpleaws.dev/.*" }],
    ["missing history boundary", (() => { const value = phaseSixSearchConsole(); delete value.availableSince; return value; })()],
    ["impossible history boundary", { ...phaseSixSearchConsole(), availableSince: "2025-02-30" }],
    ["credential field", { ...phaseSixSearchConsole(), refreshToken: googleRefreshToken }],
    ["unknown selector field", { ...phaseSixSearchConsole(), searchType: "web" }]
  ];
  for (const [name, selector] of selectorCases) {
    const requestLog = [];
    const input = selector === undefined
      ? (() => { const value = phaseSixInput(); delete value.searchConsole; return value; })()
      : phaseSixInput({ searchConsole: selector });
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED", `${name} must reach its own input validation`);
      return true;
    });
    assert.equal(harness.parameterCalls.length, 0, `${name} must fail before decrypting Google credentials`);
    assert.equal(harness.secretCalls.length, 0, `${name} must fail before retrieving newsletter credentials`);
    assert.equal(googleRequests(requestLog, "google-oauth").length, 0);
    assert.equal(googleRequests(requestLog, "google-report").length, 0);
    assert.equal(googleRequests(requestLog, "google-search").length, 0);
    assert.equal(harness.putCalls.length, 0);
  }

  for (const input of [
    { ...phaseSixInput(), analytics: null },
    { ...phaseSixInput(), unexpected: true }
  ]) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    await assert.rejects(() => harness.handler({}, {}));
    assert.equal(harness.parameterCalls.length, 0);
    assert.equal(googleRequests(requestLog, "google-search").length, 0);
  }
});

test("Search provenance stays independent from Analytics property changes and credential rotation", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({ requestLog })
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);

  const rotatedClientId = "rotated-google-client-id-canary";
  const rotatedClientSecret = "rotated-google-client-secret-canary";
  const rotatedRefreshToken = "rotated-google-refresh-token-canary";
  harness.setParameterResponse({
    Parameter: {
      Name: googleOAuthParameterArn,
      Type: "SecureString",
      Value: JSON.stringify({ clientId: rotatedClientId, clientSecret: rotatedClientSecret, refreshToken: rotatedRefreshToken })
    }
  });
  harness.setInput(phaseSixInput({ analytics: phaseFiveAnalytics({ propertyId: "987654321" }) }));
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);

  assert.equal(second.groups.articleSearchClicks.records["7d"].scopeId, first.groups.articleSearchClicks.records["7d"].scopeId);
  assert.notEqual(second.groups.articleViews.records["7d"].scopeId, first.groups.articleViews.records["7d"].scopeId);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 2, "each invocation still performs only one shared token refresh");
  assertNoGoogleCanaries(harness, rotatedClientId, rotatedClientSecret, rotatedRefreshToken);
});

test("Search Console uses Pacific calendar windows, keeps full history windows, and omits unsupported YTD", async () => {
  const clock = createClock("2026-01-02T04:30:00.000Z");
  const requestLog = [];
  const input = phaseSixInput();
  const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }), clock });
  await harness.handler({}, {});
  const searches = googleRequests(requestLog, "google-search");
  assert.deepEqual(searches.map((request) => [request.json.startDate, request.json.endDate]), [
    ["2025-12-23", "2025-12-29"],
    ["2025-11-30", "2025-12-29"],
    ["2025-10-01", "2025-12-29"]
  ], "Search uses Los Angeles D/E and does not issue a shortened 12-month range or future YTD");
  const records = (await readPut(harness.putCalls[0])).groups.articleSearchClicks.records;
  assert.deepEqual(Object.keys(records).sort(), ["30d", "7d", "90d"]);

  const previous = priorFullOutput();
  const previousSearchRecords = priorArticleSearchClicksGroup().records;
  previousSearchRecords.ytd = priorArticleSearchRecord({
    scopeId: "f".repeat(64),
    startDate: "2025-01-01",
    endDate: "2025-12-29",
    clicks: 500
  });
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup(previousSearchRecords);
  const staleYtdLog = [];
  const staleYtdHarness = createHarness({
    input,
    clock: createClock("2026-01-02T04:30:00.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog: staleYtdLog,
      searchResponder: ({ request }) => request.json.startDate === "2025-12-23"
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(searchConsoleResponse({ clicks: 12 }))
    })
  });
  staleYtdHarness.objects.set(outputKey, JSON.stringify(previous));
  await staleYtdHarness.handler({}, {});
  const staleYtdRecords = (await readPut(staleYtdHarness.putCalls[0])).groups.articleSearchClicks.records;
  assert.equal(Object.hasOwn(staleYtdRecords, "ytd"), false, "a previous calendar year's YTD cannot survive when current YTD is unsupported");

  const currentClock = createClock("2026-10-16T04:30:00.000Z");
  const currentLog = [];
  const boundedHarness = createHarness({
    input: phaseSixInput({ searchConsole: phaseSixSearchConsole({ availableSince: "2025-10-14" }) }),
    fetchFn: phaseFiveApiFetch({ requestLog: currentLog }),
    clock: currentClock
  });
  await boundedHarness.handler({}, {});
  const boundedSearches = googleRequests(currentLog, "google-search");
  assert.deepEqual(boundedSearches.map((request) => [request.json.startDate, request.json.endDate]), [
    ["2026-10-06", "2026-10-12"],
    ["2026-09-13", "2026-10-12"],
    ["2026-07-15", "2026-10-12"],
    ["2026-01-01", "2026-10-12"]
  ], "availableSince removes the unsupported full 12-month request instead of clipping it");
  assert.deepEqual(Object.keys((await readPut(boundedHarness.putCalls[0])).groups.articleSearchClicks.records).sort(), ["30d", "7d", "90d", "ytd"]);

  const leapClock = createClock("2024-03-02T12:00:00.000Z");
  const leapLog = [];
  const leapHarness = createHarness({
    input: phaseSixInput({ searchConsole: phaseSixSearchConsole({ availableSince: "2023-02-28" }) }),
    fetchFn: phaseFiveApiFetch({ requestLog: leapLog }),
    clock: leapClock
  });
  await leapHarness.handler({}, {});
  const leapTwelveMonthQuery = googleRequests(leapLog, "google-search").find((request) => request.json.startDate === "2023-02-28");
  assert.ok(leapTwelveMonthQuery, "12-month Search range subtracts calendar months and clamps leap day to Feb 28");
  assert.deepEqual([leapTwelveMonthQuery.json.startDate, leapTwelveMonthQuery.json.endDate], ["2023-02-28", "2024-02-28"]);
});

test("Search Console distinguishes explicit zero from empty, malformed, grouped, and incomplete responses", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    clock: createClock("2026-10-16T04:30:00.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      searchResponder: ({ request }) => {
        const { startDate } = request.json;
        if (startDate === "2026-10-06") {
          return jsonResponse(searchConsoleResponse({ clicks: 0, impressions: 5, ctr: 0, position: 2 }));
        }
        if (startDate === "2026-09-13") return jsonResponse({ rows: [], responseAggregationType: "byPage" });
        if (startDate === "2026-07-15") return jsonResponse(searchConsoleResponse({ aggregationType: "byProperty", clicks: 5 }));
        if (startDate === "2025-10-13") return jsonResponse(searchConsoleResponse({ clicks: Number.MAX_SAFE_INTEGER + 1 }));
        return jsonResponse(searchConsoleResponse({ metadata: { first_incomplete_date: "2026-10-10" } }));
      }
    })
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  const records = output.groups.articleSearchClicks.records;
  assert.deepEqual(Object.keys(records), ["7d"], "only the explicit ungrouped zero is a publishable Search result");
  assert.equal(records["7d"].clicks, 0);
  for (const period of ["30d", "90d", "12m", "ytd"]) assert.equal(Object.hasOwn(records, period), false);
  assert.equal(Object.hasOwn(output.groups.articleViews.records, "7d"), true, "Search response failures do not suppress Analytics");
  assertNoGoogleCanaries(harness, googleResponseCanary);

  const multiRowLog = [];
  const multiRowHarness = createHarness({
    input: phaseSixInput({ searchConsole: phaseSixSearchConsole({ availableSince: "2026-09-13" }) }),
    clock: createClock("2026-10-16T04:30:00.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog: multiRowLog,
      searchResponder: ({ request }) => request.json.startDate === "2026-10-06"
        ? jsonResponse(searchConsoleResponse({
          rows: [
            { keys: ["https://newsletter.simpleaws.dev/p/first"], clicks: 2 },
            { keys: ["https://newsletter.simpleaws.dev/p/second"], clicks: 3 }
          ]
        }))
        : jsonResponse(searchConsoleResponse({ metadata: { first_incomplete_hour: "2026-10-13T00:00:00" } }))
    })
  });
  await multiRowHarness.handler({}, {});
  const multiRowOutput = await readPut(multiRowHarness.putCalls[0]);
  assert.equal(Object.hasOwn(multiRowOutput.groups, "articleSearchClicks"), false, "multiple grouped rows cannot be converted into an aggregate");
  assert.equal(googleRequests(multiRowLog, "google-search").length, 2, "history eligibility leaves only the 7-day and 30-day queries in this focused response case");
});

test("Search Console retries a transient period once and does not retry a forbidden period", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    clock: createClock("2026-10-16T04:30:00.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      searchResponder: ({ request, attempt }) => {
        if (request.json.startDate === "2026-10-06" && attempt === 1) {
          return jsonResponse({ error: googleResponseCanary }, 429);
        }
        if (request.json.startDate === "2026-09-13") return jsonResponse({ error: googleResponseCanary }, 403);
        return jsonResponse(searchConsoleResponse({ clicks: request.json.startDate === "2026-10-06" ? 10 : 20 }));
      }
    })
  });

  await harness.handler({}, {});
  const searches = googleRequests(requestLog, "google-search");
  const attemptsByStart = new Map();
  for (const request of searches) attemptsByStart.set(request.json.startDate, (attemptsByStart.get(request.json.startDate) ?? 0) + 1);
  assert.deepEqual([...attemptsByStart.entries()], [
    ["2026-10-06", 2],
    ["2026-09-13", 1],
    ["2026-07-15", 1],
    ["2025-10-13", 1],
    ["2026-01-01", 1]
  ]);
  const records = (await readPut(harness.putCalls[0])).groups.articleSearchClicks.records;
  assert.equal(records["7d"].clicks, 10, "the transient period recovers on its one retry");
  assert.equal(Object.hasOwn(records, "30d"), false, "the forbidden period stays unavailable without retry");
  assert.equal(records["90d"].clicks, 20, "a forbidden sibling does not suppress healthy Search periods");
  assert.equal(Object.hasOwn((await readPut(harness.putCalls[0])).groups, "articleViews"), true);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("Search and Analytics period failures retain only their own prior records and recover independently", async () => {
  let searchPeriodFails = true;
  let viewPeriodFails = true;
  let searchClicks = 60;
  let pageViews = 70;
  const clock = createClock("2026-10-16T04:30:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => reportRange(request).startDate === "2026-10-07" && viewPeriodFails
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: pageViews })),
      searchResponder: ({ request }) => request.json.startDate === "2026-09-13" && searchPeriodFails
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(searchConsoleResponse({ clicks: searchClicks }))
    }),
    clock
  });
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  harness.objects.set(outputKey, JSON.stringify(previous));

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(first.groups.articleSearchClicks.records["30d"], previous.groups.articleSearchClicks.records["30d"], "a failed Search period keeps its original dates, scope, and collection time");
  assert.equal(first.groups.articleSearchClicks.records["7d"].clicks, 60, "healthy Search periods refresh while a sibling fails");
  assert.deepEqual(first.groups.articleViews.records["7d"], previous.groups.articleViews.records["7d"], "a failed Analytics period retains its own prior record");
  assert.equal(first.groups.articleViews.records["30d"].views, 70, "Analytics refresh continues beside Search and period failures");

  searchPeriodFails = false;
  viewPeriodFails = false;
  searchClicks = 99;
  pageViews = 88;
  clock.set("2026-10-17T04:30:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[1]);
  assert.equal(recovered.groups.articleSearchClicks.records["30d"].clicks, 99);
  assert.equal(recovered.groups.articleSearchClicks.records["30d"].collectedAt, "2026-10-17T04:30:00.000Z");
  assert.equal(recovered.groups.articleViews.records["7d"].views, 88);
  assert.equal(recovered.groups.articleViews.records["7d"].collectedAt, "2026-10-17T04:30:00.000Z");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("one shared OAuth failure retains both Google metrics while count families refresh", async () => {
  const requestLog = [];
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  delete previous.groups.articleViews.records.total;
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      tokenResponder: () => jsonResponse({ error: googleResponseCanary }, 403)
    })
  });
  harness.objects.set(outputKey, JSON.stringify(previous));

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articleViews, previous.groups.articleViews);
  assert.deepEqual(output.groups.articleSearchClicks, previous.groups.articleSearchClicks);
  assert.equal(output.groups.articles.collectedAt, "2026-10-16T12:00:00.000Z", "unrelated count families keep refreshing");
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 1);
  assert.equal(googleRequests(requestLog, "google-report").length, 0);
  assert.equal(googleRequests(requestLog, "google-search").length, 0);
  assertNoGoogleCanaries(harness, googleResponseCanary);

  const damagedPrevious = structuredClone(output);
  damagedPrevious.groups.articleSearchClicks.records["30d"].query = googleResponseCanary;
  harness.objects.set(outputKey, JSON.stringify(damagedPrevious));
  await harness.handler({}, {});
  const isolated = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(isolated.groups.articleSearchClicks.records, "30d"), false,
    "an invalid prior Search period cannot publish a private provider field during fallback");
  for (const period of ["7d", "90d", "12m", "ytd"]) {
    assert.deepEqual(isolated.groups.articleSearchClicks.records[period], previous.groups.articleSearchClicks.records[period],
      "a malformed known record cannot suppress healthy prior Search periods");
  }
  assert.deepEqual(isolated.groups.articleViews, previous.groups.articleViews);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("Search-only success publishes while every other family fails", async () => {
  const requestLog = [];
  const failingArticles = async () => jsonResponse({ error: googleResponseCanary }, 503);
  const harness = createHarness({
    input: phaseSixInput({ curated: {
      talks: [{ id: "bad-talk", kind: "unknown", status: "invalid", language: "en" }],
      books: [{ id: "bad-book", status: "draft", language: "en" }]
    } }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      articleFetcher: failingArticles,
      newsletterResponder: () => jsonResponse({ error: googleResponseCanary }, 403),
      reportResponder: () => jsonResponse({ error: googleResponseCanary }, 403),
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 9 }))
    })
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(output.groups), ["articleSearchClicks"]);
  assert.deepEqual(Object.keys(output.groups.articleSearchClicks.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.equal(output.groups.articleSearchClicks.records["7d"].clicks, 9);
  assert.equal(googleRequests(requestLog, "google-search").length, 5);
  assert.equal(googleRequests(requestLog, "google-report").length, 5);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 0, "one fresh family publishes without fallback storage");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("a prior Search record whose start falls before the new history boundary cannot be retained", async () => {
  let failEligibleSearchWindow = false;
  const clock = createClock("2026-10-16T04:30:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      searchResponder: ({ request }) => failEligibleSearchWindow
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(searchConsoleResponse({ clicks: 18 }))
    }),
    clock
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.equal(first.groups.articleSearchClicks.records["7d"].startDate, "2026-10-06");

  failEligibleSearchWindow = true;
  harness.setInput(phaseSixInput({ searchConsole: phaseSixSearchConsole({ availableSince: "2026-10-07" }) }));
  clock.set("2026-10-17T04:30:00.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  const searchRequests = googleRequests(requestLog, "google-search");
  assert.deepEqual(searchRequests.slice(-1).map((request) => [request.json.startDate, request.json.endDate]), [["2026-10-07", "2026-10-13"]]);
  assert.equal(Object.hasOwn(second.groups, "articleSearchClicks"), false, "the old Oct 6 record is ineligible after the boundary moves to Oct 7");
  assert.equal(second.groups.articles.collectedAt, "2026-10-17T04:30:00.000Z", "healthy count families still publish through Search failure");
});

test("rolling back to input 5 removes Search even when Analytics refresh fails", async () => {
  let failAnalytics = false;
  const requestLog = [];
  const harness = createHarness({
    input: phaseSixInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: () => failAnalytics
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: 41 })),
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 52 }))
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(first.groups, "articleSearchClicks"), true);
  const searchRequestCount = googleRequests(requestLog, "google-search").length;

  failAnalytics = true;
  harness.setInput(phaseFiveInput());
  await harness.handler({}, {});
  const rolledBack = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(rolledBack.groups, "articleSearchClicks"), false, "removing the selector intentionally removes its prior family");
  assert.deepEqual(rolledBack.groups.articleViews, first.groups.articleViews, "the still-enabled Analytics family keeps its prior records after failed refresh");
  assert.equal(googleRequests(requestLog, "google-search").length, searchRequestCount, "input 5 makes no Search request during rollback");
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "fallback accepts the known Search family while retaining enabled siblings");
});

test("input 6 all-failed runs and fallback storage failures do not replace the previous object", async () => {
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  const previousBytes = JSON.stringify(previous);
  const failingArticles = async () => jsonResponse({ error: googleResponseCanary }, 503);
  const allFailedLog = [];
  const allFailed = createHarness({
    input: phaseSixInput({ curated: {
      talks: [{ id: "bad-talk", kind: "unknown", status: "invalid", language: "en" }],
      books: [{ id: "bad-book", status: "draft", language: "en" }]
    } }),
    fetchFn: phaseFiveApiFetch({
      requestLog: allFailedLog,
      articleFetcher: failingArticles,
      newsletterResponder: () => jsonResponse({ error: googleResponseCanary }, 403),
      reportResponder: () => jsonResponse({ error: googleResponseCanary }, 403),
      searchResponder: () => jsonResponse({ error: googleResponseCanary }, 403)
    })
  });
  allFailed.objects.set(outputKey, previousBytes);
  await allFailed.handler({}, {});
  assert.equal(allFailed.putCalls.length, 0, "when every family fails, no replacement is attempted");
  assert.equal(allFailed.getCalls.filter(({ Key }) => Key === outputKey).length, 0, "all-failed collection does not read old output for fallback");
  assert.equal(allFailed.objects.get(outputKey), previousBytes);
  assert.equal(googleRequests(allFailedLog, "google-search").length, 5);

  const storageLog = [];
  const readFailure = createHarness({
    input: phaseSixInput(),
    clock: createClock("2026-10-16T04:30:00.000Z"),
    getFailures: new Map([[outputKey, new Error(googleResponseCanary)]]),
    fetchFn: phaseFiveApiFetch({
      requestLog: storageLog,
      searchResponder: ({ request }) => request.json.startDate === "2026-10-06"
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(searchConsoleResponse({ clicks: 4 }))
    })
  });
  readFailure.objects.set(outputKey, previousBytes);
  await assert.rejects(() => readFailure.handler({}, {}));
  assert.equal(readFailure.putCalls.length, 0, "a fallback storage read failure blocks publication");
  assert.equal(readFailure.objects.get(outputKey), previousBytes);
  assertNoGoogleCanaries(allFailed, googleResponseCanary);
  assertNoGoogleCanaries(readFailure, googleResponseCanary);
});

test("input 5 requires newsletter and validates the exact analytics selection before provider work", async () => {
  const missingNewsletter = phaseFiveInput();
  delete missingNewsletter.newsletter;
  const invalidInputs = [
    { name: "missing newsletter", input: missingNewsletter },
    { name: "missing analytics", input: (() => { const input = phaseFiveInput(); delete input.analytics; return input; })() },
    { name: "null analytics", input: phaseFiveInput({ analytics: null }) },
    { name: "array analytics", input: phaseFiveInput({ analytics: [] }) },
    { name: "missing property id", input: phaseFiveInput({ analytics: (() => { const value = phaseFiveAnalytics(); delete value.propertyId; return value; })() }) },
    { name: "nondecimal property id", input: phaseFiveInput({ analytics: phaseFiveAnalytics({ propertyId: "123abc" }) }) },
    { name: "unsupported identity", input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), id: "other" } }) },
    { name: "unsupported language", input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), language: "es" } }) },
    { name: "wrong hostname", input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), hostname: "other.example" } }) },
    { name: "empty path filter", input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), articlePathPattern: "" } }) },
    { name: "extra secret field", input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), clientSecret: googleClientSecret } }) },
    { name: "invalid timezone", input: phaseFiveInput({ analytics: phaseFiveAnalytics({ timeZone: "Mars/Olympus" }) }) },
    { name: "impossible recorded date", input: phaseFiveInput({ analytics: phaseFiveAnalytics({ recordedSince: "2025-02-30" }) }) },
    { name: "unknown root key", input: { ...phaseFiveInput(), unexpected: true } }
  ];

  for (const { name, input } of invalidInputs) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED", `${name} must reach its own input/config validation, not be masked by an unsupported-version rejection`);
      return true;
    });
    assert.equal(harness.parameterCalls.length, 0, `${name} must fail before reading OAuth credentials`);
    assert.equal(googleRequests(requestLog, "google-oauth").length, 0);
    assert.equal(googleRequests(requestLog, "google-report").length, 0);
    assert.equal(harness.putCalls.length, 0);
  }
});

test("schema versions newer than input 6 are rejected as unsupported", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: { ...phaseSixInput(), schemaVersion: 7 },
    fetchFn: phaseFiveApiFetch({ requestLog })
  });
  await assert.rejects(() => harness.handler({}, {}), (error) => error.code === "INPUT_VERSION_UNSUPPORTED");
  assert.deepEqual(harness.parameterCalls, []);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 0);
  assert.equal(googleRequests(requestLog, "google-report").length, 0);
  assert.equal(harness.putCalls.length, 0);
});

test("Google-local collection dates handle timezone midnight, calendar years, and leap-month clamping", async () => {
  const scenarios = [
    {
      name: "Cordoba midnight and early January",
      time: "2026-01-02T12:30:00.000Z",
      expected: [
        ["2025-12-24", "2025-12-30"],
        ["2025-12-01", "2025-12-30"],
        ["2025-10-02", "2025-12-30"],
        ["2024-12-31", "2025-12-30"]
      ],
      periods: ["7d", "30d", "90d", "12m"]
    },
    {
      name: "leap-day year boundary and 12-month clamp",
      time: "2024-03-02T12:00:00.000Z",
      expected: [
        ["2024-02-22", "2024-02-28"],
        ["2024-01-30", "2024-02-28"],
        ["2023-12-01", "2024-02-28"],
        ["2023-02-28", "2024-02-28"],
        ["2024-01-01", "2024-02-28"]
      ],
      periods: ["7d", "30d", "90d", "12m", "ytd"]
    }
  ];

  for (const scenario of scenarios) {
    const clock = createClock(scenario.time);
    const requestLog = [];
    const harness = createHarness({ input: phaseFiveInput(), fetchFn: phaseFiveApiFetch({ requestLog }), clock });
    if (scenario.name.startsWith("Cordoba midnight")) harness.objects.set(outputKey, JSON.stringify(priorFullOutput()));
    await harness.handler({}, {});
    const reports = googleRequests(requestLog, "google-report");
    assert.deepEqual(reports.map((request) => [reportRange(request).startDate, reportRange(request).endDate]), scenario.expected, scenario.name);
    const records = (await readPut(harness.putCalls[0])).groups.articleViews.records;
    assert.deepEqual(Object.keys(records).sort(), scenario.periods.slice().sort(), `${scenario.name} omits unsupported periods instead of retaining or fabricating them`);
  }

  const noTotalLog = [];
  const noTotal = createHarness({ input: phaseFiveInput(), fetchFn: phaseFiveApiFetch({ requestLog: noTotalLog }) });
  await noTotal.handler({}, {});
  assert.equal(googleRequests(noTotalLog, "google-report").some((request) => request.json.dateRanges[0].startDate === "2024-01-01"), false, "an absent recordedSince does not issue an invented lifetime request");
  assert.equal(Object.hasOwn((await readPut(noTotal.putCalls[0])).groups.articleViews.records, "total"), false);
});

test("recordedSince enables only supported intervals and gives the total its own scope", async () => {
  const clock = createClock("2026-07-05T02:30:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({ requestLog }),
    clock
  });
  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(initial.groups.articleViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);

  harness.setInput(phaseFiveInput({ analytics: phaseFiveAnalytics({ recordedSince: "2026-06-27" }) }));
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  const records = output.groups.articleViews.records;
  assert.deepEqual(Object.keys(records).sort(), ["total"], "windows beginning before recordedSince remain unsupported rather than being shortened");
  assert.deepEqual(reportRange(googleRequests(requestLog, "google-report").at(-1)), { startDate: "2026-06-27", endDate: "2026-07-01" });
  assert.equal(records.total.basis, "recorded-total");

  const firstTotalScope = records.total.scopeId;
  harness.setInput(phaseFiveInput({ analytics: phaseFiveAnalytics({ recordedSince: "2026-06-28" }) }));
  await harness.handler({}, {});
  const second = (await readPut(harness.putCalls[2])).groups.articleViews.records;
  assert.notEqual(second.total.scopeId, firstTotalScope, "recordedSince is part of total provenance");
  assert.deepEqual(Object.keys(second).sort(), ["total"]);
});

test("title deduplication and article inventory failures do not change aggregate view scope", async () => {
  let articlesFail = false;
  let items = [
    article({ id: "copy-one", title: "Same title", url: "/blog/one" }),
    article({ id: "copy-two", title: "same   TITLE", url: "/blog/two" })
  ];
  const articleFetcher = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "cdn.builder.io") {
      if (articlesFail) return jsonResponse({ error: "private article error canary" }, 503);
      return jsonResponse({ results: Number(url.searchParams.get("offset")) === 0 ? items : [] });
    }
    if (url.hostname === "api.builder.aws.com") return jsonResponse({ articles: [], resultsSize: 0 });
    throw new Error(`Unexpected article endpoint ${url.origin}${url.pathname}`);
  };
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({ requestLog, articleFetcher }),
    clock
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  items = [...items, article({ id: "new-title", title: "New unique title", url: "/blog/three" })];
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  assert.notEqual(second.groups.articles.counts.all, first.groups.articles.counts.all);
  for (const period of Object.keys(first.groups.articleViews.records)) {
    assert.equal(second.groups.articleViews.records[period].scopeId, first.groups.articleViews.records[period].scopeId);
  }

  articlesFail = true;
  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const third = await readPut(harness.putCalls[2]);
  assert.deepEqual(third.groups.articles, second.groups.articles, "article failure retains only its own prior count group");
  for (const period of Object.keys(second.groups.articleViews.records)) {
    assert.equal(third.groups.articleViews.records[period].collectedAt, "2026-10-18T12:00:00.000Z");
    assert.equal(third.groups.articleViews.records[period].scopeId, second.groups.articleViews.records[period].scopeId);
  }
  assertNoGoogleCanaries(harness, "private article error canary");
});

test("one report failure retains only its exact prior period; recovery replaces that record", async () => {
  let failStart = null;
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const range = reportRange(request);
        if (range.startDate === failStart) return jsonResponse({ error: googleResponseCanary }, 403);
        return jsonResponse(ga4Report({ views: 81 }));
      }
    }),
    clock
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const old30d = first.groups.articleViews.records["30d"];
  failStart = "2026-09-15";
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[1]);
  assert.deepEqual(retained.groups.articleViews.records["30d"], old30d, "failed supported period retains its exact original dates, scope, value, and collection time");
  assert.equal(retained.groups.articleViews.records["7d"].collectedAt, "2026-10-17T12:00:00.000Z");
  assert.equal(retained.groups.articleViews.records["7d"].views, 81);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "one prior-object read supports independent period fallback");

  failStart = null;
  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[2]);
  assert.equal(recovered.groups.articleViews.records["30d"].collectedAt, "2026-10-18T12:00:00.000Z");
  assert.equal(recovered.groups.articleViews.records["30d"].views, 81);
  assert.notEqual(recovered.groups.articleViews.records["30d"].startDate, old30d.startDate);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("malformed prior period is isolated while useful sibling periods remain publishable", async () => {
  let failStart = null;
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => reportRange(request).startDate === failStart
        ? jsonResponse({ error: "synthetic period failure" }, 403)
        : jsonResponse(ga4Report({ views: 22 }))
    })
  });
  await harness.handler({}, {});
  const original = await readPut(harness.putCalls[0]);
  const prior = JSON.parse(JSON.stringify(original));
  prior.groups.articleViews.records["12m"].views = "not-a-safe-count";
  harness.objects.set(outputKey, JSON.stringify(prior));
  failStart = "2025-10-14";
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(output.groups.articleViews.records, "12m"), false, "invalid known fallback is omitted instead of relabeled");
  for (const period of ["7d", "30d", "90d", "ytd"]) assert.equal(output.groups.articleViews.records[period].views, 22);
});

test("strict GA4 aggregate validation distinguishes measured zero from unavailable values", async () => {
  const malformed = [
    ["missing metric header", (value) => { delete value.metricHeaders; }],
    ["wrong metric header", (value) => { value.metricHeaders[0].name = "activeUsers"; }],
    ["wrong metric header type", (value) => { value.metricHeaders[0].type = "TYPE_STRING"; }],
    ["missing rows", (value) => { delete value.rows; }],
    ["empty rows", (value) => { value.rows = []; value.rowCount = 0; }],
    ["extra row", (value) => { value.rows.push({ metricValues: [{ value: "2" }] }); value.rowCount = 2; }],
    ["row count mismatch", (value) => { value.rowCount = 2; }],
    ["extra dimension", (value) => { value.dimensionHeaders = [{ name: "pagePath" }]; }],
    ["wrong property timezone", (value) => { value.metadata.timeZone = "UTC"; }],
    ["missing property timezone", (value) => { delete value.metadata.timeZone; }],
    ["missing metric value", (value) => { value.rows[0].metricValues = []; }],
    ["multiple metrics in row", (value) => { value.rows[0].metricValues.push({ value: "2" }); }],
    ["null metric", (value) => { value.rows[0].metricValues[0].value = null; }],
    ["boolean metric", (value) => { value.rows[0].metricValues[0].value = true; }],
    ["malformed numeric metric", (value) => { value.rows[0].metricValues[0].value = "not-a-number"; }],
    ["negative metric", (value) => { value.rows[0].metricValues[0].value = "-1"; }],
    ["fractional metric", (value) => { value.rows[0].metricValues[0].value = "1.5"; }],
    ["unsafe metric", (value) => { value.rows[0].metricValues[0].value = String(Number.MAX_SAFE_INTEGER + 1); }]
  ];

  for (const [name, mutate] of malformed) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFiveInput(),
      fetchFn: phaseFiveApiFetch({
        requestLog,
        reportResponder: ({ request }) => {
          if (reportRange(request).startDate !== "2026-10-07") return jsonResponse(ga4Report({ views: 6 }));
          const response = ga4Report({ views: 9 });
          mutate(response);
          return jsonResponse(response);
        }
      })
    });
    await harness.handler({}, {});
    const records = (await readPut(harness.putCalls[0])).groups.articleViews.records;
    assert.equal(Object.hasOwn(records, "7d"), false, `${name} cannot become zero or a stale-looking value`);
    assert.equal(records["30d"].views, 6, `${name} must not poison healthy sibling periods`);
  }

  const zeroHarness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      reportResponder: ({ request }) => jsonResponse(ga4Report({ views: reportRange(request).startDate === "2026-10-07" ? 0 : 6 }))
    })
  });
  await zeroHarness.handler({}, {});
  assert.equal((await readPut(zeroHarness.putCalls[0])).groups.articleViews.records["7d"].views, 0, "an explicit integer zero is a measured result");
});

test("sampling, thresholding, and other-row metadata qualify values; date truncation blocks only its period", async () => {
  let truncateStart = null;
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const startDate = reportRange(request).startDate;
        const metadata = ["2026-10-07", "2026-10-08"].includes(startDate)
          ? {
            samplingMetadatas: [{ samplesReadCount: "10", samplingSpaceSize: "20" }],
            subjectToThresholding: true,
            dataLossFromOtherRow: true
          }
          : startDate === truncateStart
            ? { dataTruncationReasons: ["DATE_RANGE"] }
            : {};
        return jsonResponse(ga4Report({ views: 55, metadata }));
      }
    })
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(first.groups.articleViews.records["7d"].qualifications.slice().sort(), ["other-row", "sampled", "thresholding"]);
  const old90d = first.groups.articleViews.records["90d"];
  truncateStart = "2026-07-17";
  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  assert.deepEqual(second.groups.articleViews.records["90d"], old90d, "truncated report retains the prior supported interval exactly");
  assert.equal(second.groups.articleViews.records["7d"].views, 55, "qualified estimates remain useful values");
  assert.deepEqual(second.groups.articleViews.records["7d"].qualifications.slice().sort(), ["other-row", "sampled", "thresholding"]);
});

test("SSM and OAuth failures isolate article views and retain prior provenance without exposing credentials", async () => {
  const badParameters = [
    ["missing parameter ARN", { parameterArn: null }],
    ["GetParameter failure", { parameterFailures: new Map([[googleOAuthParameterArn, new Error(googleResponseCanary)]]) }],
    ["missing parameter value", { parameterResponse: {} }],
    ["malformed parameter JSON", { parameterResponse: { Parameter: { Value: "{" } } }],
    ["parameter JSON null", { parameterResponse: { Parameter: { Value: "null" } } }],
    ["missing refresh token", { parameterResponse: { Parameter: { Value: JSON.stringify({ clientId: googleClientId, clientSecret: googleClientSecret }) } } }]
  ];
  for (const [name, credentialOptions] of badParameters) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFiveInput(),
      fetchFn: phaseFiveApiFetch({ requestLog }),
      ...credentialOptions
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articleViews"), false, `${name} cannot invent a metric group`);
    assert.equal(googleRequests(requestLog, "google-oauth").length, 0, `${name} cannot send a token request`);
    assert.equal(googleRequests(requestLog, "google-report").length, 0, `${name} cannot call Analytics`);
    assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleResponseCanary);
  }

  const tokenFailures = [
    ["OAuth 401", () => jsonResponse({ error: googleResponseCanary }, 401), 1],
    ["malformed OAuth body", () => jsonResponse({ access_token: 42, expires_in: 3600 }), 1],
    ["blank OAuth token", () => jsonResponse({ access_token: " \t", expires_in: 3600 }), 1],
    ["missing OAuth token", () => jsonResponse({ expires_in: 3600 }), 1],
    ["zero OAuth expiry", () => jsonResponse({ access_token: googleAccessToken, expires_in: 0 }), 1],
    ["OAuth transient retry", (() => { let attempts = 0; return () => ++attempts === 1 ? jsonResponse({ error: googleResponseCanary }, 503) : jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" }); })(), 2],
    ["OAuth network retry", (() => { let attempts = 0; return () => { if (++attempts === 1) throw new Error(googleResponseCanary); return jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" }); }; })(), 2]
  ];
  for (const [name, tokenResponder, expectedAttempts] of tokenFailures) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFiveInput(),
      fetchFn: phaseFiveApiFetch({ requestLog, tokenResponder })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(googleRequests(requestLog, "google-oauth").length, expectedAttempts, `${name} uses the bounded retry policy`);
    assert.equal(googleRequests(requestLog, "google-report").length, expectedAttempts === 2 ? 5 : 0);
    assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleResponseCanary);
    assert.equal(
      Object.hasOwn(output.groups, "articleViews"),
      expectedAttempts === 2,
      `${name} publishes views only after a valid token response`
    );
  }
});

test("views-only success publishes alone, while total family failure preserves the exact output bytes", async () => {
  let failGoogle = false;
  const requestLog = [];
  const articleFetcher = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "cdn.builder.io") return jsonResponse({ error: "synthetic legacy source failure" }, 503);
    if (url.hostname === "api.builder.aws.com") return jsonResponse({ error: "synthetic second source failure" }, 503);
    throw new Error(`Unexpected article endpoint ${url.origin}${url.pathname}`);
  };
  const harness = createHarness({
    input: phaseFiveInput({ curated: { talks: [{ id: "bad-talk", kind: "unknown" }], books: [{ id: "bad-book", status: "draft" }] } }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      articleFetcher,
      newsletterResponder: () => jsonResponse({ error: "synthetic newsletter authorization failure" }, 403),
      reportResponder: ({ request }) => failGoogle
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: 7 }))
    })
  });
  await harness.handler({}, {});
  const priorBytes = bodyText(harness.putCalls[0].Body);
  const viewOnly = JSON.parse(priorBytes);
  assert.deepEqual(Object.keys(viewOnly.groups), ["articleViews"], "a successful views family can publish without any healthy legacy family");
  assert.equal(viewOnly.groups.articleViews.records["7d"].views, 7);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "the fresh family allows one sibling fallback lookup");

  failGoogle = true;
  await assert.rejects(() => harness.handler({}, {}));
  assert.equal(harness.putCalls.length, 1, "all-families failure does not issue another write");
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "no successful family means no fallback read");
  assert.equal(harness.objects.get(outputKey), priorBytes, "the exact prior bytes remain intact");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("OAuth failure retains the exact prior views family while current count families refresh", async () => {
  let tokenFails = false;
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      tokenResponder: () => tokenFails
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" })
    }),
    clock
  });
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  tokenFails = true;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  assert.deepEqual(second.groups.articleViews, first.groups.articleViews, "credential failure retains all prior period provenance exactly");
  assert.equal(second.groups.articles.collectedAt, "2026-10-17T12:00:00.000Z", "count collection remains fresh");
  assert.equal(googleRequests(requestLog, "google-report").length, 5, "failed token refresh prevents all report calls for that invocation");
  assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleAccessToken, googleResponseCanary);
});

test("report transient failures retry once, authentication failures do not, and other periods still publish", async () => {
  for (const status of [408, 425, 429, 500, 599]) {
    let attempts = 0;
    const requestLog = [];
    const harness = createHarness({
      input: phaseFiveInput(),
      fetchFn: phaseFiveApiFetch({
        requestLog,
        reportResponder: ({ request }) => {
          if (reportRange(request).startDate !== "2026-10-07") return jsonResponse(ga4Report({ views: 11 }));
          attempts += 1;
          return attempts === 1 ? jsonResponse({ error: googleResponseCanary }, status) : jsonResponse(ga4Report({ views: 12 }));
        }
      })
    });
    await harness.handler({}, {});
    const records = (await readPut(harness.putCalls[0])).groups.articleViews.records;
    assert.equal(attempts, 2, `HTTP ${status} retries the affected report exactly once`);
    assert.equal(records["7d"].views, 12);
    assert.equal(records["30d"].views, 11);
    assertNoGoogleCanaries(harness, googleResponseCanary);
  }

  for (const status of [401, 403]) {
    let attempts = 0;
    const requestLog = [];
    const harness = createHarness({
      input: phaseFiveInput(),
      fetchFn: phaseFiveApiFetch({
        requestLog,
        reportResponder: ({ request }) => {
          if (reportRange(request).startDate !== "2026-10-07") return jsonResponse(ga4Report({ views: 11 }));
          attempts += 1;
          return jsonResponse({ error: googleResponseCanary }, status);
        }
      })
    });
    await harness.handler({}, {});
    const records = (await readPut(harness.putCalls[0])).groups.articleViews.records;
    assert.equal(attempts, 1, `HTTP ${status} must not retry`);
    assert.equal(Object.hasOwn(records, "7d"), false, "failed first-run period is unavailable, not zero");
    assert.equal(records["30d"].views, 11);
    assertNoGoogleCanaries(harness, googleResponseCanary);
  }

  let networkAttempts = 0;
  const networkLog = [];
  const networkHarness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog: networkLog,
      reportResponder: ({ request }) => {
        if (reportRange(request).startDate !== "2026-10-07") return jsonResponse(ga4Report({ views: 13 }));
        if (++networkAttempts === 1) throw new Error(googleResponseCanary);
        return jsonResponse(ga4Report({ views: 14 }));
      }
    })
  });
  await networkHarness.handler({}, {});
  const networkRecords = (await readPut(networkHarness.putCalls[0])).groups.articleViews.records;
  assert.equal(networkAttempts, 2, "a report network failure receives exactly one retry");
  assert.equal(networkRecords["7d"].views, 14);
  assert.equal(networkRecords["30d"].views, 13);
  assertNoGoogleCanaries(networkHarness, googleResponseCanary);
});

test("input 5 accepts the SSM parameter name and ARN and an omitted dimensions array", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    parameterResponse: {
      Parameter: {
        Name: "/synthetic/google-oauth",
        ARN: googleOAuthParameterArn,
        Type: "SecureString",
        Value: JSON.stringify({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          refreshToken: googleRefreshToken
        })
      }
    },
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: () => {
        const response = ga4Report({ views: 23 });
        delete response.dimensionHeaders;
        return jsonResponse(response);
      }
    })
  });

  await harness.handler({}, {});
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  const reports = googleRequests(requestLog, "google-report");
  assert.equal(reports.length, 5);
  assert.deepEqual(Object.keys((await readPut(harness.putCalls[0])).groups.articleViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  for (const record of Object.values((await readPut(harness.putCalls[0])).groups.articleViews.records)) {
    assert.equal(record.views, 23);
  }
});

test("input 5 accepts Etc/GMT zones and rejects numeric timezone offsets before provider work", async () => {
  const validRequestLog = [];
  const validZoneHarness = createHarness({
    input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), timeZone: "Etc/GMT+1" } }),
    fetchFn: phaseFiveApiFetch({ requestLog: validRequestLog, timeZone: "Etc/GMT+1" })
  });
  await validZoneHarness.handler({}, {});
  const validRecords = (await readPut(validZoneHarness.putCalls[0])).groups.articleViews.records;
  assert.equal(Object.keys(validRecords).length, 5);
  assert.equal(validRecords["7d"].timeZone, "Etc/GMT+1");

  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput({ analytics: { ...phaseFiveAnalytics(), timeZone: "+01:00" } }),
    fetchFn: phaseFiveApiFetch({ requestLog })
  });

  await assert.rejects(() => harness.handler({}, {}), (error) => error.code === "ANALYTICS_CONFIGURATION_INVALID");
  assert.deepEqual(harness.parameterCalls, []);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 0);
  assert.equal(googleRequests(requestLog, "google-report").length, 0);
  assert.equal(harness.putCalls.length, 0);
});

test("a failed January YTD report does not retain the prior calendar year's YTD record", async () => {
  const clock = createClock("2026-01-04T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFiveInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => reportRange(request).startDate === "2026-01-01"
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: 31 }))
    }),
    clock
  });
  const previous = priorFullOutput();
  previous.groups.articleViews.records.ytd = priorArticleViewRecord({
    startDate: "2025-01-01",
    endDate: "2025-12-29",
    scopeId: "9".repeat(64),
    views: 400
  });
  harness.objects.set(outputKey, JSON.stringify(previous));

  await harness.handler({}, {});
  const records = (await readPut(harness.putCalls[0])).groups.articleViews.records;
  assert.equal(Object.hasOwn(records, "ytd"), false);
  assert.deepEqual(records["7d"] && [records["7d"].startDate, records["7d"].endDate], ["2025-12-26", "2026-01-01"]);
  assert.equal(googleRequests(requestLog, "google-report").length, 5);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});
