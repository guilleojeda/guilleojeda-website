import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const directoryGooglePropertyId = "424203315";
const directoryHostname = "dondeaprendoaws.com";
const directoryTimeZone = "America/Buenos_Aires";
const dondeAprendoOrigin = "https://dondeaprendoaws.com";
const dondeAprendoIndexUrl = `${dondeAprendoOrigin}/article-index.json`;
const awsForEngineersOrigin = "https://awsforengineers.com";
const awsForEngineersIndexUrl = `${awsForEngineersOrigin}/article-index.json`;
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

function simpleAwsArticleSource() {
  return { id: "simple-aws" };
}

function phaseSevenInput({ sources, ...options } = {}) {
  const input = phaseSixInput(options);
  return {
    ...input,
    sources: sources ?? [...input.sources, simpleAwsArticleSource()]
  };
}

function cloudyThingsSource({ authorName = "Guillermo Ojeda", language = "en" } = {}) {
  return { id: "cloudy-things", authorName, language };
}

function dondeAprendoAwsSource() {
  return { id: "donde-aprendo-aws" };
}

function awsForEngineersSource() {
  return { id: "aws-for-engineers" };
}

function phaseEightInput({ sources, ...options } = {}) {
  const input = phaseSevenInput(options);
  return {
    ...input,
    sources: sources ?? [...input.sources, cloudyThingsSource()]
  };
}

function phaseNineDirectoryAnalytics({
  id = "donde-aprendo-aws",
  propertyId = directoryGooglePropertyId,
  hostname = directoryHostname,
  language = "es",
  timeZone = directoryTimeZone,
  ...extra
} = {}) {
  return { id, propertyId, hostname, language, timeZone, ...extra };
}

function phaseNineInput({ baseInput, directoryAnalytics, ...options } = {}) {
  const input = baseInput === undefined ? phaseEightInput(options) : structuredClone(baseInput);
  return {
    ...input,
    schemaVersion: 7,
    directoryAnalytics: directoryAnalytics === undefined ? phaseNineDirectoryAnalytics() : directoryAnalytics
  };
}

function phaseTenInput({ baseInput, directoryAnalytics, ...options } = {}) {
  const input = phaseNineInput({ baseInput, directoryAnalytics, ...options });
  input.schemaVersion = 8;
  if (!Object.hasOwn(input.directoryAnalytics, "outboundClicks")) {
    input.directoryAnalytics.outboundClicks = true;
  }
  return input;
}

function phaseTwelveInput({ baseInput, directoryAnalytics, recordedSince = "2024-01-21", ...options } = {}) {
  const input = phaseNineInput({ baseInput, directoryAnalytics, ...options });
  input.schemaVersion = 9;
  input.directoryAnalytics = { ...input.directoryAnalytics, recordedSince };
  return input;
}

function phaseThirteenInput({ baseInput, ...options } = {}) {
  const input = baseInput === undefined ? phaseTwelveInput(options) : structuredClone(baseInput);
  input.schemaVersion = 10;
  input.newsletterEngagements = true;
  return input;
}

function phaseElevenInput({ baseInput, builderArticleViews = manualBuilderArticleViewsInput(), ...options } = {}) {
  const input = baseInput === undefined ? phaseThirteenInput(options) : structuredClone(baseInput);
  input.schemaVersion = 11;
  input.builderArticleViews = builderArticleViews;
  return input;
}

function cloudyArticle({
  id = "cloudy-id",
  slug = id,
  url = `https://blog.guilleojeda.com/${slug}`,
  title = `Synthetic Cloudy headline ${id}`,
  publishedAt = "2025-03-07T20:44:58.310Z"
} = {}) {
  return { id, slug, url, title, publishedAt };
}

function cloudyGeneratedArticles(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const id = offset + index;
    const title = `Synthetic Cloudy Things article ${id}`;
    return cloudyArticle({
      id: `synthetic-cloudy-${id}`,
      slug: `synthetic-cloudy-article-${id}`,
      title
    });
  });
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

function priorNewsletterEmailsSentGroup({
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "c".repeat(64),
  publication = { id: "simple-aws", label: "Simple AWS", language: "en" },
  sent = 170
} = {}) {
  return {
    definitionVersion: 1,
    basis: "cumulative",
    collectedAt,
    scopeId,
    publication,
    sent
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

function priorDirectoryOutboundClickRecord({
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "f".repeat(64),
  startDate = "2026-10-11",
  endDate = "2026-10-17",
  clicks = 17,
  qualifications = []
} = {}) {
  return {
    basis: "period",
    collectedAt,
    scopeId,
    publication: { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS", language: "es" },
    timeZone: directoryTimeZone,
    startDate,
    endDate,
    clicks,
    qualifications
  };
}

function priorDirectoryOutboundClicksGroup(records = {
  "7d": priorDirectoryOutboundClickRecord({ scopeId: "a".repeat(64), clicks: 17 }),
  "30d": priorDirectoryOutboundClickRecord({ scopeId: "b".repeat(64), startDate: "2026-09-18", clicks: 30 }),
  "90d": priorDirectoryOutboundClickRecord({ scopeId: "c".repeat(64), startDate: "2026-07-20", clicks: 90 }),
  "12m": priorDirectoryOutboundClickRecord({ scopeId: "d".repeat(64), startDate: "2025-10-18", clicks: 120 }),
  ytd: priorDirectoryOutboundClickRecord({ scopeId: "e".repeat(64), startDate: "2026-01-01", clicks: 200 })
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

const cloudyArticleOrigin = "https://blog.guilleojeda.com";
const hashnodeApiUrl = "https://gql-beta.hashnode.com/";
const hashnodeUsername = "GuilleOjeda";
const hashnodeAuthorName = "Guillermo Ojeda";

function cloudyHashnodePage({
  page = 1,
  totalPages = 1,
  rows = [],
  username = hashnodeUsername,
  name = hashnodeAuthorName,
  hasNextPage = page < totalPages,
  endCursor = hasNextPage ? `cloudy-cursor-${page}` : null,
  graphqlErrors,
  user = true,
  posts = true,
  edges = rows.map(({ title, url, publishedAt }) => ({ node: { title, url, publishedAt } })),
  pageInfo = { hasNextPage, endCursor }
} = {}) {
  if (graphqlErrors !== undefined) return { errors: graphqlErrors };
  if (!user) return { data: { user: null } };
  return {
    data: {
      user: {
        username,
        name,
        ...(posts ? { posts: { edges, pageInfo } } : {})
      }
    }
  };
}

function cloudyHashnodeResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function hashnodeStreamingResponse(chunks, { status = 200, contentType = "application/json; charset=utf-8" } = {}) {
  let chunksRead = 0;
  let cancelled = false;
  let completed = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (chunksRead >= chunks.length) {
        completed = true;
        controller.close();
        return;
      }
      const chunk = chunks[chunksRead++];
      controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    },
    cancel() {
      cancelled = true;
    }
  });
  const response = new Response(stream, { status, headers: { "content-type": contentType } });
  return {
    response,
    stats() {
      return { chunksRead, cancelled, completed, totalChunks: chunks.length };
    }
  };
}

function hashnodeApiFetcher({ requestLog = [], pages = new Map(), responder, fallback } = {}) {
  const articleFetch = fallback ?? builderApiFetch({ requestLog });
  const attempts = new Map();
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href !== hashnodeApiUrl) return articleFetch(input, init);
    let json;
    try {
      json = JSON.parse(String(init.body ?? ""));
    } catch {
      json = {};
    }
    const after = json.variables?.after ?? null;
    const cursorMatch = typeof after === "string" ? after.match(/^cloudy-cursor-(\d+)$/) : null;
    const page = cursorMatch ? Number(cursorMatch[1]) + 1 : 1;
    const attemptKey = `${page}:${after ?? "first"}`;
    const attempt = (attempts.get(attemptKey) ?? 0) + 1;
    attempts.set(attemptKey, attempt);
    const request = {
      kind: "hashnode-user-posts",
      url: url.toString(),
      page,
      after,
      attempt,
      method: init.method,
      headers: init.headers ?? {},
      redirect: init.redirect,
      signal: init.signal,
      body: String(init.body ?? ""),
      json
    };
    requestLog.push(request);
    let value = typeof responder === "function"
      ? await responder({ request, attempt, page })
      : pages.get(page);
    if (typeof value === "function") value = await value({ request, attempt, page });
    if (value instanceof Response || (value && typeof value.text === "function" && typeof value.status === "number")) {
      return value;
    }
    return cloudyHashnodeResponse(value ?? cloudyHashnodePage());
  };
}

function phaseEightApiFetch({
  requestLog = [],
  hashnodePages = new Map(),
  hashnodeResponder,
  caylentPages,
  builderPages,
  postsResponder,
  newsletterResponder,
  engagementResponder,
  tokenResponder,
  reportResponder,
  searchResponder
} = {}) {
  const sourceFetch = builderApiFetch({ requestLog, caylentPages, builderPages });
  const articleFetcher = hashnodeApiFetcher({ requestLog, pages: hashnodePages, responder: hashnodeResponder, fallback: sourceFetch });
  return phaseFiveApiFetch({
    requestLog,
    articleFetcher,
    postsResponder,
    newsletterResponder,
    engagementResponder,
    tokenResponder,
    reportResponder,
    searchResponder
  });
}

function dondeAprendoArticle({
  title,
  slug,
  publishedAt = "2025-03-07",
  authorName = "Guille Ojeda",
  authorUrl = "https://guilleojeda.com/es/",
  url = `${dondeAprendoOrigin}/blog/${slug}/`
}) {
  return {
    title,
    language: "es",
    publishedAt,
    url,
    author: { name: authorName, url: authorUrl }
  };
}

function dondeAprendoIndex(articles, { schemaVersion = 1, sourceId = "donde-aprendo-aws" } = {}) {
  return {
    schemaVersion,
    source: { id: sourceId, label: "Dónde Aprendo AWS" },
    articles
  };
}

function awsForEngineersArticle({
  title,
  slug,
  publishedAt = "2025-03-07T20:44:58.310000+00:00",
  authorName = "Guille Ojeda",
  authorUrl = "https://awsforengineers.com/authors/guille-ojeda/",
  url = `${awsForEngineersOrigin}/blog/${slug}/`
}) {
  return { title, language: "en", publishedAt, url, author: { name: authorName, url: authorUrl } };
}

function awsForEngineersIndex(articles, { schemaVersion = 1, sourceId = "aws-for-engineers" } = {}) {
  return {
    schemaVersion,
    source: { id: sourceId, label: "AWS for Engineers" },
    articles
  };
}

function dondeAprendoApiFetch({ requestLog = [], responder, response, ...apiOptions } = {}) {
  const fallback = phaseEightApiFetch({ requestLog, ...apiOptions });
  let attempt = 0;
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href !== dondeAprendoIndexUrl) return fallback(input, init);

    attempt += 1;
    const request = {
      kind: "donde-aprendo-index",
      url: url.href,
      method: init.method,
      headers: init.headers ?? {},
      redirect: init.redirect,
      signal: init.signal,
      attempt
    };
    requestLog.push(request);
    let value = typeof responder === "function"
      ? await responder({ request, attempt })
      : response;
    if (typeof value === "function") value = await value({ request, attempt });
    if (value instanceof Response || (value && typeof value.text === "function" && typeof value.status === "number")) {
      return value;
    }
    return new Response(JSON.stringify(value ?? dondeAprendoIndex([])), {
      headers: { "content-type": "application/json" }
    });
  };
}

function awsForEngineersApiFetch({
  requestLog = [],
  responder,
  response,
  dondeResponder,
  dondeResponse,
  dondeArticles = [],
  ...apiOptions
} = {}) {
  const fallback = dondeAprendoApiFetch({
    requestLog,
    responder: dondeResponder,
    response: dondeResponse ?? dondeAprendoIndex(dondeArticles),
    ...apiOptions
  });
  let attempt = 0;
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.href !== awsForEngineersIndexUrl) return fallback(input, init);

    attempt += 1;
    const request = {
      kind: "aws-for-engineers-index",
      url: url.href,
      method: init.method,
      headers: init.headers ?? {},
      redirect: init.redirect,
      signal: init.signal,
      attempt
    };
    requestLog.push(request);
    let value = typeof responder === "function"
      ? await responder({ request, attempt })
      : response;
    if (typeof value === "function") value = await value({ request, attempt });
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value ?? awsForEngineersIndex([])), {
      headers: { "content-type": "application/json" }
    });
  };
}

function assertDondeAprendoRequest(request, harness) {
  const url = new URL(request.url);
  assert.equal(url.href, dondeAprendoIndexUrl, "the collector uses the fixed public index endpoint");
  assert.equal(request.method === undefined ? "GET" : request.method, "GET");
  const headers = new Headers(request.headers);
  assert.equal(headers.has("authorization"), false, "the public feed request has no authorization header");
  assert.equal(headers.has("cookie"), false, "the public feed request has no cookie");
  assert.ok(request.signal, "the source request is bounded by an abort signal");
  const timeout = harness.abortSignalRecords.find(({ signal }) => signal === request.signal);
  assert.ok(timeout, "the request uses the collector's bounded fetch harness");
  assert.equal(timeout.milliseconds, 10_000, "each source attempt has the established 10-second deadline");
}

function assertAwsForEngineersRequest(request, harness) {
  const url = new URL(request.url);
  assert.equal(url.href, awsForEngineersIndexUrl, "the collector uses the fixed public index endpoint");
  assert.equal(request.method === undefined ? "GET" : request.method, "GET");
  const headers = new Headers(request.headers);
  assert.equal(headers.has("authorization"), false, "the public feed request has no authorization header");
  assert.equal(headers.has("cookie"), false, "the public feed request has no cookie");
  assert.ok(request.signal, "the source request is bounded by an abort signal");
  const timeout = harness.abortSignalRecords.find(({ signal }) => signal === request.signal);
  assert.ok(timeout, "the request uses the collector's bounded fetch harness");
  assert.equal(timeout.milliseconds, 10_000, "each source attempt has the established 10-second deadline");
}

function assertNoDondeAprendoCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregates must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
}

function assertNoAwsForEngineersCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregates must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
}

function awsSixSourceInput(sources = [
  ...phaseEightInput().sources,
  dondeAprendoAwsSource(),
  awsForEngineersSource()
]) {
  return phaseThirteenInput({ sources });
}

function awsSixSourceFetch({
  requestLog = [],
  awsResponder,
  awsResponse,
  dondeArticles = [dondeAprendoArticle({ title: "Six-source Spanish identity", slug: "six-source-spanish" })],
  caylentRows = [article({ id: "six-source-caylent", title: "Six-source Caylent identity" })],
  builderArticles = [builderArticle({ id: "six-source-builder", title: "Six-source Builder identity" })],
  simpleArticles = [beehiivPost({ id: "six-source-simple", title: "Six-source Simple identity" })],
  hashnodeRows = [cloudyArticle({ id: "six-source-cloudy", title: "Six-source Cloudy identity" })],
  ...apiOptions
} = {}) {
  return awsForEngineersApiFetch({
    requestLog,
    responder: awsResponder,
    response: awsResponse,
    dondeArticles,
    caylentPages: new Map([[0, { results: caylentRows }]]),
    builderPages: new Map([["", { articles: builderArticles, resultsSize: builderArticles.length }]]),
    postsResponder: () => jsonResponse(beehiivPostsEnvelope(simpleArticles)),
    hashnodePages: new Map([[1, cloudyHashnodePage({ rows: hashnodeRows })]]),
    ...apiOptions
  });
}

function assertNoCloudyCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregate must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
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
  putFailureAfterCommit,
  outputReadbackMode = "stored",
  outputReadbackFailure,
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
        if (command.input.Key === outputKey && putCalls.length > 0) {
          if (outputReadbackFailure) throw outputReadbackFailure;
          if (outputReadbackMode === "absent") {
            const error = new Error("Synthetic output object is absent");
            error.name = "NoSuchKey";
            error.Code = "NoSuchKey";
            throw error;
          }
          if (outputReadbackMode === "different" || outputReadbackMode === "malformed") {
            const value = outputReadbackMode === "different"
              ? '{"schemaVersion":1,"groups":{"talks":{"different":"bytes"}}}'
              : "{malformed readback bytes";
            return { Body: { transformToString: async () => value } };
          }
        }
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
        if (putFailureAfterCommit) throw putFailureAfterCommit;
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
    Response,
    ReadableStream,
    TextDecoder,
    TextEncoder,
    Uint8Array,
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

function phaseFourApiFetch({ requestLog = [], newsletterResponder, postsResponder, articleFetcher } = {}) {
  const articleFetch = articleFetcher ?? builderApiFetch({ requestLog });
  let newsletterAttempts = 0;
  const postAttempts = new Map();
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.beehiiv.com") {
      if (url.pathname.endsWith("/posts")) {
        const page = Number(url.searchParams.get("page"));
        const request = {
          kind: "beehiiv-posts",
          url: url.toString(),
          method: init?.method,
          headers: init?.headers ?? {},
          redirect: init?.redirect,
          signal: init?.signal,
          page
        };
        const attempt = (postAttempts.get(url.toString()) ?? 0) + 1;
        postAttempts.set(url.toString(), attempt);
        requestLog.push(request);
        if (typeof postsResponder === "function") return postsResponder({ request, attempt });
        if (postsResponder !== undefined) return responseFromFixture(postsResponder);
        return jsonResponse(beehiivPostsEnvelope([]));
      }
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

function ga4Report({ views = 42, metricName = "screenPageViews", timeZone = googleTimeZone, metadata = {} } = {}) {
  return {
    metricHeaders: [{ name: metricName, type: "TYPE_INTEGER" }],
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
  engagementResponder,
  postsResponder,
  articleFetcher,
  timeZone = googleTimeZone
} = {}) {
  const fallback = phaseFourApiFetch({ requestLog, newsletterResponder, postsResponder, articleFetcher });
  const attempts = new Map();
  return async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "api.beehiiv.com" && url.pathname.endsWith("/engagements")) {
      const request = {
        kind: "beehiiv-engagements",
        url: url.toString(),
        method: init.method,
        headers: init.headers ?? {},
        redirect: init.redirect,
        signal: init.signal
      };
      const attempt = (attempts.get(request.url) ?? 0) + 1;
      attempts.set(request.url, attempt);
      requestLog.push(request);
      if (typeof engagementResponder === "function") return engagementResponder({ request, attempt });
      if (engagementResponder !== undefined) return responseFromFixture(engagementResponder);
      return jsonResponse(beehiivEngagementsEnvelope([], {
        publicationId: decodeURIComponent(url.pathname.split("/").at(-2)),
        granularity: url.searchParams.get("granularity"),
        emailType: url.searchParams.get("email_type"),
        startDate: url.searchParams.get("start_date"),
        numberOfDays: Number(url.searchParams.get("number_of_days"))
      }));
    }
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
      ? `${kind}:${url.origin}${url.pathname}:${request.json.metrics?.map(({ name }) => name).join(",")}:${request.json.dateRanges?.[0]?.startDate}:${request.json.dateRanges?.[0]?.endDate}`
      : kind === "google-search"
        ? `${kind}:${url.origin}${url.pathname}:${request.json.startDate}:${request.json.endDate}`
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
  for (const family of ["articles", "talks", "books"]) {
    const group = output.groups[family];
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

test("the real inventory counts both October 22 appearances without counting future re:Invent slots", async () => {
  const { buildContentStatsInputs } = await import('../scripts/build-content-stats-inputs.mjs');
  const talks = JSON.parse(readFileSync(new URL('../src/content/talks.json', import.meta.url), 'utf8'));
  const books = JSON.parse(readFileSync(new URL('../src/content/books.json', import.meta.url), 'utf8'));
  const input = buildContentStatsInputs({ articleConfig: phaseTwoInput(), talks, books });
  assert.equal(talks.length, 37, 'two meetup appearances remain one archive record');
  assert.deepEqual(input.curated.talks.filter(({ id }) => id.startsWith('cordoba-agent-economics-2026/')), [
    talkFact('cordoba-agent-economics-2026/talk', 'talk', 'delivered', 'es'),
    talkFact('cordoba-agent-economics-2026/certification-panel', 'panel', 'delivered', 'es')
  ]);
  assert.deepEqual(input.curated.talks.filter(({ id }) => id.startsWith('reinvent-2026-agent-evaluations/')), [
    talkFact('reinvent-2026-agent-evaluations/com317-r', 'session', 'scheduled', 'en'),
    talkFact('reinvent-2026-agent-evaluations/com317-r1', 'session', 'scheduled', 'en')
  ]);
  const harness = createHarness({ input, fetchFn: builderApiFetch() });
  await harness.handler({}, {});
  assert.equal(harness.putCalls.length, 1);
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.talks.counts, { all: 30, en: 9, es: 21 });
  assert.deepEqual(output.groups.books.counts, { all: 2, en: 2, es: 0 });
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
  for (const family of ["articles", "talks", "books"]) {
    const group = output.groups[family];
    assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  }
});

test("input 3 scopes ignore ordering and unrelated family changes while remote article discovery recomputes", async () => {
  let listedBuilderArticles = [builderArticle({ id: "remote-one", title: "Remote Work One" })];
  const requests = [];
  const fetchFn = builderApiFetch({
    builderPages: new Map([["", () => jsonResponse({ articles: listedBuilderArticles, resultsSize: listedBuilderArticles.length })]]),
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
      builderPages: new Map([["", () => jsonResponse({ error: "synthetic Builder source failure" }, 503)]]),
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

  const previous = JSON.stringify({
    schemaVersion: 1,
    groups: { articles: priorGroup(), builderArticleViews: priorBuilderArticleViewsGroup() }
  });
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

function newsletterEnvelope(publicationId = beehiivPublicationId, subscribers = 0, totalSent) {
  return {
    data: {
      id: publicationId,
      stats: {
        active_subscriptions: subscribers,
        ...(totalSent === undefined ? {} : { total_sent: totalSent })
      }
    }
  };
}

function newsletterEmailsSentScopeId(providerPublicationId = beehiivPublicationId) {
  const scope = {
    definitionVersion: 1,
    family: "newsletterEmailsSent",
    policy: "beehiiv-publication-total-sent-v1",
    publication: { id: "simple-aws", label: "Simple AWS", language: "en" },
    providerPublicationId,
    source: { providerMetric: "total_sent" }
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function beehiivEngagementsEnvelope(data, {
  publicationId = beehiivPublicationId,
  granularity = "day",
  emailType = "post",
  startDate,
  numberOfDays
} = {}) {
  return {
    data,
    publication_id: publicationId,
    granularity,
    email_type: emailType,
    start_date: startDate,
    number_of_days: numberOfDays
  };
}

function addUtcDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function engagementRow(date, index, extra = {}) {
  const outsideUnion = date < "2025-10-18" || date > "2026-10-17";
  return {
    date,
    total_opens: outsideUnion ? 1_000_000 + Math.abs(index) : index + 1,
    total_verified_clicks: outsideUnion ? 2_000_000 + Math.abs(index) : index % 11,
    total_clicks: 8_000_000 - index,
    unique_opens: 9_000_000 + index,
    unique_clicks: 10_000_000 + index,
    unique_verified_clicks: 11_000_000 + index,
    privateResponseCanary: "synthetic-beehiiv-private-daily-canary",
    post_title: "synthetic-private-per-post-title",
    ...extra
  };
}

function engagementRowsForRequest(request, extraForDate = () => ({})) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start_date");
  const numberOfDays = Number(url.searchParams.get("number_of_days"));
  const unionStart = Date.parse("2025-10-18T00:00:00.000Z");
  return Array.from({ length: numberOfDays + 1 }, (_, offset) => {
    const date = addUtcDays(startDate, offset);
    const index = Math.floor((Date.parse(`${date}T00:00:00.000Z`) - unionStart) / 86_400_000);
    return engagementRow(date, index, extraForDate(date, index));
  });
}

function mutateIntendedEngagementDate(request, envelope, date, mutate) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start_date");
  const intendedDays = Number(url.searchParams.get("number_of_days"));
  const offset = Math.floor((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000);
  if (offset >= 0 && offset < intendedDays) {
    const row = envelope.data.find((candidate) => candidate.date === date);
    if (row) mutate(row, envelope.data);
  }
}

function beehiivEngagementRequests(requestLog) {
  return requestLog.filter(({ kind }) => kind === "beehiiv-engagements");
}

function assertBeehiivEngagementRequests(harness, requests, publicationId = beehiivPublicationId) {
  assert.ok(requests.length > 0, "the enabled engagement selector must make provider requests");
  for (const request of requests) {
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api.beehiiv.com");
    assert.equal(url.pathname, `/v2/publications/${encodeURIComponent(publicationId)}/engagements`);
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      start_date: url.searchParams.get("start_date"),
      number_of_days: url.searchParams.get("number_of_days"),
      granularity: "day",
      email_type: "post"
    });
    assert.match(url.searchParams.get("start_date"), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number(url.searchParams.get("number_of_days")) >= 1);
    assert.ok(Number(url.searchParams.get("number_of_days")) <= 31);
    assert.equal(request.method, "GET");
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${beehiivApiKey}`);
    assert.equal(request.redirect, "error");
    assert.ok(request.signal);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 5_000);
  }
}

function beehiivPostsEnvelope(data, {
  limit = 100,
  page = 1,
  totalResults = data.length,
  totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit)
} = {}) {
  return { data, limit, page, total_results: totalResults, total_pages: totalPages };
}

function beehiivPost({
  id,
  title,
  status = "confirmed",
  publishDate = "2026-10-15T12:00:00.000Z",
  platform = "both",
  ...providerFields
}) {
  const publishDateSeconds = typeof publishDate === "number"
    ? publishDate
    : Math.floor(Date.parse(publishDate) / 1000);
  return { id, title, status, publish_date: publishDateSeconds, platform, ...providerFields };
}

function assertBeehiivPostRequests(harness, requestLog, publicationId, expectedPages) {
  const requests = requestLog.filter(({ kind }) => kind === "beehiiv-posts");
  assert.deepEqual(requests.map(({ page }) => page), expectedPages);
  for (const request of requests) {
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api.beehiiv.com");
    assert.equal(url.pathname, `/v2/publications/${encodeURIComponent(publicationId)}/posts`);
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      status: "confirmed",
      platform: "all",
      hidden_from_feed: "all",
      limit: "100",
      page: String(request.page),
      order_by: "publish_date",
      direction: "asc"
    });
    assert.equal(request.method, "GET");
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${beehiivApiKey}`);
    assert.equal(request.redirect, "error");
    assert.ok(request.signal);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }
  return requests;
}

function assertNoBeehiivPostCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, `public aggregate must omit ${value}`);
    assert.equal(logs.includes(value), false, `collector logs must omit ${value}`);
  }
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

test("input 4 uses the shared publication stats request and preserves the current subscriber aggregate including zero", async () => {
  let subscribers = 0;
  let currentApiKey = beehiivApiKey;
  const requestLog = [];
  const fetchFn = phaseFourApiFetch({
    requestLog,
    newsletterResponder: ({ request }) => {
      const requestedPublication = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
      // Keep this subscriber-specific case deliberately without total_sent.
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
  assert.equal(firstRequest.url, `https://api.beehiiv.com/v2/publications/${encodeURIComponent(beehiivPublicationId)}?expand=stats`);
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
    const responseWithHealthySent = responseBody?.data?.stats
      ? {
        ...responseBody,
        data: { ...responseBody.data, stats: { ...responseBody.data.stats, total_sent: 41 } }
      }
      : responseBody;
    const sentIsValid = responseWithHealthySent?.data?.id === beehiivPublicationId &&
      responseWithHealthySent.data.stats && typeof responseWithHealthySent.data.stats === "object" &&
      !Array.isArray(responseWithHealthySent.data.stats);
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseFourApiFetch({ requestLog, newsletterResponder: () => jsonResponse(responseWithHealthySent) })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "newsletter"), false, `${description} must fail only newsletter collection and must not become zero`);
    assert.deepEqual(Object.keys(output.groups).sort(), sentIsValid
      ? ["articles", "books", "newsletterEmailsSent", "talks"]
      : ["articles", "books", "talks"]);
    if (sentIsValid) assert.equal(output.groups.newsletterEmailsSent.sent, 41,
      `${description} preserves the healthy sent sibling`);
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
        return jsonResponse(newsletterEnvelope(publicationId, subscribers, 80));
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
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 2, "one prior-object read per invocation supports Builder retention and newsletter fallback");

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
    caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]]),
    builderPages: new Map([["", () => jsonResponse({ error: "synthetic Builder source failure" }, 503)]])
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

test("a sole fresh sent family publishes while subscriber and inventory families fail", async () => {
  const requestLog = [];
  const articleFetcher = builderApiFetch({
    requestLog,
    caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic article source failure" }, 503)]]),
    builderPages: new Map([["", () => jsonResponse({ error: "synthetic Builder source failure" }, 503)]])
  });
  const harness = createHarness({
    input: phaseFourInput({ curated: {
      talks: [talkFact("duplicate-talk"), talkFact("duplicate-talk")],
      books: [bookFact("duplicate-book"), bookFact("duplicate-book")]
    } }),
    fetchFn: phaseFourApiFetch({
      requestLog,
      articleFetcher,
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, true, 19))
    })
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(output.groups), ["newsletterEmailsSent"]);
  assert.equal(output.groups.newsletterEmailsSent.sent, 19);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1,
    "fresh sent permits one prior-family fallback lookup after its siblings fail");
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
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv")[1].url, "https://api.beehiiv.com/v2/publications/publication-b%2Fencoded?expand=stats");

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

function googleFilterLeaves(filter) {
  if (filter === null || typeof filter !== "object") return [];
  if (Object.hasOwn(filter, "filter")) return [filter.filter];
  return Object.values(filter).flatMap((value) => Array.isArray(value)
    ? value.flatMap(googleFilterLeaves)
    : googleFilterLeaves(value));
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
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 0, 88)),
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
  assert.deepEqual(Object.keys(output.groups).sort(), ["articleViews", "articles", "books", "newsletter", "newsletterEmailsSent", "talks"]);
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
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 0, 88)),
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
  assert.deepEqual(Object.keys(output.groups).sort(), ["articleSearchClicks", "articleViews", "articles", "books", "newsletter", "newsletterEmailsSent", "talks"]);

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
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1, "failed sibling families require one prior-object lookup before publishing the fresh Search family");
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
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20, 80)),
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
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 2, "one prior-object read per invocation retains Builder history and enabled siblings during Search rollback");
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
  await assert.rejects(() => allFailed.handler({}, {}), { code: "NO_SUCCESSFUL_GROUPS" });
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

test("schema versions newer than input 12 are rejected as unsupported", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: { ...phaseSixInput(), schemaVersion: 13 },
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
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20, 80)),
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
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 2, "one prior-object read per invocation supports Builder retention and independent period fallback");

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

test("input 6 can opt into the complete Simple AWS catalog without exposing post records", async () => {
  const requestLog = [];
  const titles = [];
  const posts = Array.from({ length: 162 }, (_, index) => {
    const title = index < 10 ? `Generated Simple AWS title ${Math.floor(index / 2)}` : `Generated Simple AWS title ${index - 5}`;
    titles.push(title);
    const platform = ["web", "email", "both"][index % 3];
    return beehiivPost({
      id: `synthetic-post-${index}`,
      title,
      platform,
      displayed_date: null,
      audience: index % 2 === 0 ? "free" : "both",
      hidden_from_feed: index === 0,
      providerPrivateField: "synthetic-post-metadata-canary",
      ...(platform === "email" ? {} : { web_url: `https://private.example/posts/${index}` })
    });
  });
  const articleFetcher = builderApiFetch({
    caylentPages: new Map([[0, { results: [article({ id: "caylent-copy", title: "Generated Simple AWS title 0" })] }]]),
    builderPages: new Map([["", {
      articles: [builderArticle({ id: "builder-translation", title: "Generated Simple AWS title 0", locale: "es" })],
      resultsSize: 1
    }]]),
    requestLog
  });
  const publicationId = "synthetic/publication+id";
  const pages = new Map([[1, posts.slice(0, 100)], [2, posts.slice(100)]]);
  const harness = createHarness({
    input: phaseSevenInput({ newsletter: { id: "simple-aws", publicationId, language: "en" } }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      articleFetcher,
      postsResponder: ({ request }) => jsonResponse(beehiivPostsEnvelope(pages.get(request.page), {
        page: request.page,
        totalResults: posts.length,
        totalPages: 2
      })),
      newsletterResponder: ({ request }) => {
        const requestedId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(requestedId, 41));
      }
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assert.equal(output.schemaVersion, 1, "the public aggregate schema remains version 1");
  assert.deepEqual(group.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" }
  ]);
  assert.deepEqual(group.counts, { all: 158, en: 157, es: 1 },
    "five same-language title pairs merge within Simple AWS, its English copy merges with Caylent, and the Builder Spanish translation remains separate");
  assert.deepEqual(output.groups.newsletter.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
  assert.equal(output.groups.newsletter.subscribers, 41, "the existing subscriber metric remains independent");

  const requests = assertBeehiivPostRequests(harness, requestLog, publicationId, [1, 2]);
  assert.deepEqual(requests.map(({ page }) => page), [1, 2]);
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 1, "the existing subscriber lookup remains a separate request");
  assert.equal(requestLog.filter(({ kind }) => kind.startsWith("beehiiv")).length, 3,
    "the catalog is read only through two list pages; no post detail or expanded-stat request is needed");
  assertNoBeehiivPostCanaries(
    harness,
    beehiivApiKey,
    publicationId,
    "synthetic-post-metadata-canary",
    "synthetic-post-0",
    "https://private.example/posts/0",
    ...new Set(titles)
  );
});

test("the optional Simple AWS source works with maintained input versions 4 through 6", async () => {
  const sources = [sourceInput().source, builderCenterSource(), simpleAwsArticleSource()];
  const cases = [
    { name: "input 4", input: phaseFourInput({ sources }), useGoogle: false, groups: ["articles", "books", "newsletter", "newsletterEmailsSent", "talks"] },
    { name: "input 5", input: phaseFiveInput({ sources }), useGoogle: true, groups: ["articleViews", "articles", "books", "newsletter", "newsletterEmailsSent", "talks"] },
    { name: "input 6", input: phaseSixInput({ sources }), useGoogle: true, groups: ["articleSearchClicks", "articleViews", "articles", "books", "newsletter", "newsletterEmailsSent", "talks"] }
  ];

  for (const { name, input, useGoogle, groups } of cases) {
    const requestLog = [];
    const apiFetch = useGoogle
      ? phaseFiveApiFetch({
        requestLog,
        articleFetcher: builderApiFetch({ requestLog }),
        postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
        newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 0, 88))
      })
      : phaseFourApiFetch({
        requestLog,
        articleFetcher: builderApiFetch({ requestLog }),
        postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
        newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 0, 88))
      });
    const harness = createHarness({ input, fetchFn: apiFetch });

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.equal(output.schemaVersion, 1, `${name} keeps the public aggregate schema version`);
    assert.deepEqual(Object.keys(output.groups).sort(), groups);
    assert.deepEqual(output.groups.articles.sources, [
      { id: "caylent", label: "Caylent" },
      { id: "builder-center", label: "AWS Builder Center" },
      { id: "simple-aws", label: "Simple AWS" }
    ]);
    assert.deepEqual(output.groups.articles.counts, { all: 0, en: 0, es: 0 });
    assertBeehiivPostRequests(harness, requestLog, beehiivPublicationId, [1]);
  }
});

test("Simple AWS counts confirmed posts by publish_date across platforms and deduplicates normalized title-language editions", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const currentSecond = Math.floor(Date.parse("2026-10-16T12:00:00.000Z") / 1000);
  const rows = [
    beehiivPost({ id: "web-title", title: "  Café   Guide ", platform: "web", hidden_from_feed: true, audience: "free", displayed_date: "2026-12-01" }),
    beehiivPost({ id: "email-copy", title: "CAFE\u0301 guide", platform: "email", audience: "premium", displayed_date: null }),
    beehiivPost({ id: "both-copy", title: "Café Guide", platform: "both", audience: "both", displayed_date: null }),
    beehiivPost({ id: "boundary-post", title: "Published on the boundary", publishDate: currentSecond, platform: "web", displayed_date: null }),
    beehiivPost({ id: "future-schedule", title: "Future confirmed schedule", publishDate: currentSecond + 1 }),
    beehiivPost({ id: "draft-post", title: "Draft excluded", status: "draft" }),
    beehiivPost({ id: "archived-post", title: "Archived excluded", status: "archived" }),
    beehiivPost({ id: "punctuation-title", title: "Café, Guide!" }),
    beehiivPost({ id: "accent-title", title: "Cafe Guide" }),
    beehiivPost({ id: "cross-source-copy", title: "Cross-source edition" })
  ];
  const requestLog = [];
  const articleFetcher = builderApiFetch({
    caylentPages: new Map([[0, { results: [article({ id: "caylent-cross-source", title: "Cross-source edition" })] }]]),
    builderPages: new Map([["", {
      articles: [builderArticle({ id: "builder-spanish-translation", title: "Cross-source edition", locale: "es" })],
      resultsSize: 1
    }]]),
    requestLog
  });
  const harness = createHarness({
    input: phaseSevenInput(),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      articleFetcher,
      postsResponder: () => jsonResponse(beehiivPostsEnvelope(rows))
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articles.counts, { all: 6, en: 5, es: 1 },
    "web, email, both, hidden and paid/free posts count; future schedules and inactive statuses do not");
  assert.equal(output.groups.articles.sources[2].label, "Simple AWS");
  assert.equal(output.groups.articles.scopeId.length, 64);
  assertBeehiivPostRequests(harness, requestLog, beehiivPublicationId, [1]);
  assert.equal(requestLog.find(({ kind }) => kind === "beehiiv-posts").url.includes("expand="), false);
  assertNoBeehiivPostCanaries(harness, "web-title", "email-copy", "both-copy", "Future confirmed schedule", "Cross-source edition");

  const emptyLog = [];
  const emptyHarness = createHarness({
    input: phaseSevenInput(),
    fetchFn: phaseFiveApiFetch({
      requestLog: emptyLog,
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([], { limit: 100, page: 1, totalResults: 0, totalPages: 0 }))
    })
  });
  await emptyHarness.handler({}, {});
  const emptyOutput = await readPut(emptyHarness.putCalls[0]);
  assert.deepEqual(emptyOutput.groups.articles.counts, { all: 0, en: 0, es: 0 });
  assertBeehiivPostRequests(emptyHarness, emptyLog, beehiivPublicationId, [1]);
});

test("the optional Simple AWS selector and its newsletter prerequisite validate before provider work", async () => {
  const caylent = sourceInput().source;
  const builder = builderCenterSource();
  const selector = simpleAwsArticleSource();
  const invalidInputs = [
    phaseSevenInput({ sources: [caylent, selector] }),
    phaseSevenInput({ sources: [caylent, builder, { ...selector, publicationId: beehiivPublicationId, language: "en" }] }),
    phaseSevenInput({ sources: [caylent, builder, { ...selector, extra: "private selector canary" }] }),
    phaseSevenInput({ sources: [caylent, builder, { id: "another-publication" }] }),
    phaseSevenInput({ sources: [caylent, builder, selector, selector] }),
    phaseSevenInput({ newsletter: null }),
    phaseSevenInput({ newsletter: { id: "another-publication", publicationId: beehiivPublicationId, language: "en" } }),
    phaseSevenInput({ newsletter: { id: "simple-aws", publicationId: " \t ", language: "en" } }),
    phaseSevenInput({ newsletter: { id: "simple-aws", publicationId: beehiivPublicationId, language: "fr" } }),
    phaseSevenInput({ newsletter: { id: "simple-aws", publicationId: beehiivPublicationId, language: "es" } })
  ];

  for (const input of invalidInputs) {
    const requestLog = [];
    const harness = createHarness({
      input,
      fetchFn: phaseFiveApiFetch({
        requestLog,
        postsResponder: () => jsonResponse(beehiivPostsEnvelope([]))
      })
    });
    await assertFailedWithoutReplacing(harness);
    assert.deepEqual(requestLog, [], "invalid source selections fail before all external providers");
    assert.deepEqual(harness.secretCalls, [], "invalid source selections fail before Secrets Manager");
    assert.deepEqual(harness.parameterCalls, [], "invalid source selections fail before Google credentials");
  }

  const disabledInput = phaseSevenInput({ sources: [caylent, builder] });
  const disabledLog = [];
  const disabled = createHarness({
    input: disabledInput,
    secretArn: null,
    fetchFn: phaseFiveApiFetch({ requestLog: disabledLog })
  });
  await disabled.handler({}, {});
  const disabledOutput = await readPut(disabled.putCalls[0]);
  assert.deepEqual(disabledOutput.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" }
  ]);
  assert.equal(disabledLog.some(({ kind }) => kind === "beehiiv-posts"), false,
    "the disabled article source does not try to read its catalog without credentials");
  assert.equal(disabledLog.some(({ kind }) => kind === "beehiiv"), false);
  assert.deepEqual(disabled.secretCalls, []);

  const enabledLog = [];
  const enabled = createHarness({
    input: phaseSevenInput(),
    secretArn: null,
    fetchFn: phaseFiveApiFetch({ requestLog: enabledLog })
  });
  await enabled.handler({}, {});
  const enabledOutput = await readPut(enabled.putCalls[0]);
  assert.equal(Object.hasOwn(enabledOutput.groups, "articles"), false,
    "a selected catalog with no key is unavailable rather than published as a zero or a partial count");
  assert.equal(Object.hasOwn(enabledOutput.groups, "newsletter"), false);
  assert.equal(enabledLog.some(({ kind }) => kind.startsWith("beehiiv")), false,
    "the enabled source never sends a request without the key");
  assert.deepEqual(enabled.secretCalls, []);
});

test("Simple AWS article scope follows its selector while source order and key rotation leave other metrics alone", async () => {
  const requestLog = [];
  const articleFetcher = builderApiFetch({ requestLog });
  let remotePosts = [beehiivPost({ id: "scope-post-id", title: "Scope Fingerprint Article" })];
  const postsResponder = () => jsonResponse(beehiivPostsEnvelope(remotePosts));
  const newsletterResponder = ({ request }) => {
    const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    return jsonResponse(newsletterEnvelope(publicationId, 12));
  };
  const harness = createHarness({
    input: phaseSevenInput(),
    fetchFn: phaseFiveApiFetch({ requestLog, articleFetcher, postsResponder, newsletterResponder })
  });
  const metricScopes = (output) => ({
    views: output.groups.articleViews.records["7d"].scopeId,
    search: output.groups.articleSearchClicks.records["7d"].scopeId
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  const initialArticleScope = initial.groups.articles.scopeId;
  const initialNewsletterScope = initial.groups.newsletter.scopeId;
  const initialMetricScopes = metricScopes(initial);

  const rotatedArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic-rotated-beehiiv-key";
  const rotatedKey = "synthetic-rotated-beehiiv-api-key-canary";
  harness.setSecretResponse(rotatedArn, { SecretString: JSON.stringify({ apiKey: rotatedKey }) });
  harness.env.BEEHIIV_API_KEY_SECRET_ARN = rotatedArn;
  remotePosts = [
    ...remotePosts,
    beehiivPost({ id: "new-remote-post-id", title: "Discovered After the Prior Run" })
  ];
  harness.setInput(phaseSevenInput({ sources: [
    simpleAwsArticleSource(),
    builderCenterSource(),
    { ...sourceInput().source, apiKey: "rotated-synthetic-caylent-key" }
  ] }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls[1]);
  assert.equal(reordered.groups.articles.scopeId, initialArticleScope,
    "source order and secret/key rotation do not change article scope");
  assert.deepEqual(reordered.groups.articles.counts, { all: 2, en: 2, es: 0 },
    "newly published remote posts are discovered without changing semantic scope");
  assert.equal(reordered.groups.newsletter.scopeId, initialNewsletterScope);
  assert.deepEqual(metricScopes(reordered), initialMetricScopes,
    "the article source does not change Analytics or Search Console scope");
  assert.equal(newsletterRequestHeader(requestLog.filter(({ kind }) => kind === "beehiiv-posts")[1], "authorization"), `Bearer ${rotatedKey}`);

  const changedPublication = "synthetic-second-publication-id";
  harness.setInput(phaseSevenInput({ newsletter: { id: "simple-aws", publicationId: changedPublication, language: "en" } }));
  await harness.handler({}, {});
  const publicationChanged = await readPut(harness.putCalls[2]);
  assert.notEqual(publicationChanged.groups.articles.scopeId, initialArticleScope,
    "the resolved Beehiiv publication ID belongs to article scope");
  assert.notEqual(publicationChanged.groups.newsletter.scopeId, initialNewsletterScope);
  assert.deepEqual(metricScopes(publicationChanged), initialMetricScopes);

  harness.setInput(phaseSevenInput({ sources: [sourceInput().source, builderCenterSource()] }));
  await harness.handler({}, {});
  const disabled = await readPut(harness.putCalls[3]);
  assert.notEqual(disabled.groups.articles.scopeId, publicationChanged.groups.articles.scopeId,
    "disabling the optional source changes article scope");
  assert.equal(disabled.groups.articles.sources.some(({ id }) => id === "simple-aws"), false);
  assert.deepEqual(metricScopes(disabled), initialMetricScopes);
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv-posts").length, 3,
    "the disabled source makes no posts request");
  assert.equal(harness.putCalls.length, 4);
});

test("an incomplete Simple AWS catalog retains the whole previous article group, including both supported source sets", async () => {
  const makePages = (offset, count, prefix = "catalog") => Array.from({ length: count }, (_, index) =>
    beehiivPost({ id: `${prefix}-${offset + index}`, title: `${prefix} title ${offset + index}` }));
  const legacyArticles = priorGroup({
    sources: [
      { id: "caylent", label: "Caylent" },
      { id: "builder-center", label: "AWS Builder Center" }
    ],
    counts: { all: 8, en: 6, es: 2 },
    scopeId: "8".repeat(64),
    collectedAt: "2026-10-11T10:00:00.000Z"
  });
  const expandedArticles = priorGroup({
    sources: [
      { id: "caylent", label: "Caylent" },
      { id: "builder-center", label: "AWS Builder Center" },
      { id: "simple-aws", label: "Simple AWS" }
    ],
    counts: { all: 13, en: 11, es: 2 },
    scopeId: "9".repeat(64),
    collectedAt: "2026-10-12T10:00:00.000Z"
  });
  const malformedRows = [
    ["missing title", (row) => { delete row.title; }],
    ["null title", (row) => { row.title = null; }],
    ["missing post ID", (row) => { delete row.id; }],
    ["blank post ID", (row) => { row.id = " \t "; }],
    ["missing status", (row) => { delete row.status; }],
    ["unsupported status", (row) => { row.status = "scheduled"; }],
    ["missing publish date", (row) => { delete row.publish_date; }],
    ["null publish date", (row) => { row.publish_date = null; }],
    ["noninteger publish date", (row) => { row.publish_date = 1.5; }],
    ["non-numeric publish date", (row) => { row.publish_date = "not-a-date"; }],
    ["missing platform", (row) => { delete row.platform; }],
    ["null platform", (row) => { row.platform = null; }],
    ["unsupported platform", (row) => { row.platform = "rss"; }]
  ].map(([name, mutate], index) => {
    const row = beehiivPost({ id: `malformed-required-field-${index}`, title: "Valid row before corruption" });
    mutate(row);
    return {
      name,
      previousArticles: expandedArticles,
      responder: () => jsonResponse(beehiivPostsEnvelope([row]))
    };
  });
  const scenarios = [
    {
      name: "malformed eligible row",
      previousArticles: legacyArticles,
      responder: () => jsonResponse(beehiivPostsEnvelope([
        beehiivPost({ id: "malformed-post", title: " \t ", platform: "email" })
      ]))
    },
    {
      name: "response page does not match the request",
      previousArticles: legacyArticles,
      responder: ({ request }) => jsonResponse(beehiivPostsEnvelope([
        beehiivPost({ id: "wrong-page-post", title: "Wrong page" })
      ], { page: request.page + 1, totalResults: 1, totalPages: 1 }))
    },
    {
      name: "response limit does not match the request",
      previousArticles: expandedArticles,
      responder: () => jsonResponse(beehiivPostsEnvelope([
        beehiivPost({ id: "wrong-limit-post", title: "Wrong limit" })
      ], { limit: 99, totalResults: 1, totalPages: 1 }))
    },
    {
      name: "declared page count is inconsistent with total results",
      previousArticles: legacyArticles,
      responder: () => jsonResponse(beehiivPostsEnvelope(makePages(0, 100), {
        totalResults: 101,
        totalPages: 1
      }))
    },
    {
      name: "truncated page",
      previousArticles: expandedArticles,
      responder: ({ request }) => jsonResponse(beehiivPostsEnvelope(makePages(0, 99), {
        page: request.page,
        totalResults: 101,
        totalPages: 2
      }))
    },
    {
      name: "repeated provider ID across pages",
      previousArticles: expandedArticles,
      responder: ({ request }) => jsonResponse(beehiivPostsEnvelope(
        request.page === 1 ? makePages(0, 100) : [makePages(0, 1)[0]],
        { page: request.page, totalResults: 101, totalPages: 2 }
      ))
    },
    {
      name: "later-page failure after an earlier complete page",
      previousArticles: expandedArticles,
      responder: ({ request }) => request.page === 1
        ? jsonResponse(beehiivPostsEnvelope(makePages(0, 100), { page: 1, totalResults: 101, totalPages: 2 }))
        : jsonResponse({ error: "synthetic second-page outage" }, 503)
    },
    {
      name: "page totals change during enumeration",
      previousArticles: legacyArticles,
      responder: ({ request }) => jsonResponse(beehiivPostsEnvelope(
        request.page === 1 ? makePages(0, 100) : makePages(100, 2),
        { page: request.page, totalResults: request.page === 1 ? 101 : 102, totalPages: 2 }
      ))
    },
    {
      name: "declared catalog exceeds the bounded source limit",
      previousArticles: expandedArticles,
      responder: ({ request }) => jsonResponse(beehiivPostsEnvelope(makePages(0, 100), {
        page: request.page,
        totalResults: 501,
        totalPages: 6
      }))
    },
    {
      name: "authorization failure",
      previousArticles: expandedArticles,
      responder: () => jsonResponse({ error: "synthetic authorization failure" }, 401)
    },
    ...malformedRows
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const requestLog = [];
    const previous = priorFullOutput();
    previous.groups.articles = scenario.previousArticles;
    const harness = createHarness({
      input: phaseSevenInput({ curated: {
        talks: [talkFact(`fresh-talk-${index}`)],
        books: [bookFact(`fresh-book-${index}`)]
      } }),
      fetchFn: phaseFiveApiFetch({
        requestLog,
        articleFetcher: builderApiFetch({ requestLog }),
        postsResponder: scenario.responder,
        newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 44))
      })
    });
    harness.objects.set(outputKey, JSON.stringify(previous));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(output.groups.articles, scenario.previousArticles,
      `${scenario.name} must preserve the entire prior article group exactly`);
    assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
    assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
    assert.equal(output.groups.newsletter.subscribers, 44, "successful sibling families still refresh");
    assert.ok(requestLog.some(({ kind }) => kind === "beehiiv-posts"), "the fallback follows an actual catalog request");
    if (scenario.name === "authorization failure") {
      assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv-posts").length, 1,
        "an authorization failure is not retried");
    }
    if (scenario.name === "later-page failure after an earlier complete page") {
      assert.deepEqual(requestLog.filter(({ kind }) => kind === "beehiiv-posts").map(({ page }) => page), [1, 2, 2],
        "a failure after the first complete page cannot publish a partial catalog");
    }
    if (scenario.name === "declared catalog exceeds the bounded source limit") {
      assert.ok(requestLog.filter(({ kind }) => kind === "beehiiv-posts").length <= 1,
        "a declaration beyond the supported bound is rejected before catalog enumeration");
    }
  }

  const absentLog = [];
  const absentUrls = [];
  const absentFetch = phaseFiveApiFetch({
    requestLog: absentLog,
    postsResponder: () => jsonResponse({ error: "synthetic authorization failure" }, 401)
  });
  const absent = createHarness({
    input: phaseSevenInput({ curated: { talks: [talkFact("fresh-talk-without-prior")], books: [bookFact("fresh-book-without-prior")] } }),
    fetchFn: async (input, init) => {
      absentUrls.push(String(input));
      return absentFetch(input, init);
    }
  });
  await absent.handler({}, {});
  const withoutPrior = await readPut(absent.putCalls[0]);
  assert.equal(Object.hasOwn(withoutPrior.groups, "articles"), false,
    "a first catalog failure omits articles instead of publishing a partial or zero count");
  assert.equal(withoutPrior.groups.talks.counts.all, 1);
  assert.equal(withoutPrior.groups.books.counts.all, 1);
  assert.equal(absentLog.filter(({ kind }) => kind === "beehiiv-posts").length, 1,
    "authorization failures do not retry");
  assert.equal(absentUrls.some((value) => value.includes("newsletter.simpleaws.dev")), false,
    "an API failure never falls back to the public sitemap or archive");
});

test("Simple AWS inventory and subscriber failures recover independently without accumulating counts", async () => {
  let inventoryFails = false;
  let subscribersFail = false;
  let subscriberCount = 10;
  let inventory = [beehiivPost({ id: "first-post", title: "First Published Article" })];
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseSevenInput(),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      articleFetcher: builderApiFetch({ requestLog }),
      postsResponder: () => inventoryFails
        ? jsonResponse({ error: "synthetic catalog outage" }, 503)
        : jsonResponse(beehiivPostsEnvelope(inventory)),
      newsletterResponder: ({ request }) => subscribersFail
        ? jsonResponse({ error: "synthetic subscriber outage" }, 401)
        : jsonResponse(newsletterEnvelope(beehiivPublicationId, subscriberCount))
    })
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  const initialArticleGroup = initial.groups.articles;
  const initialNewsletterGroup = initial.groups.newsletter;
  assert.deepEqual(initialArticleGroup.counts, { all: 1, en: 1, es: 0 });
  assert.equal(initialNewsletterGroup.subscribers, 10);

  inventoryFails = true;
  subscriberCount = 20;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const articleFailure = await readPut(harness.putCalls[1]);
  assert.deepEqual(articleFailure.groups.articles, initialArticleGroup,
    "a posts failure retains source coverage, counts, scope, and collection time together");
  assert.equal(articleFailure.groups.newsletter.subscribers, 20,
    "the subscriber request can succeed while the post catalog fails");
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv-posts").length, 3,
    "the failed page receives one transient retry");

  inventoryFails = false;
  subscribersFail = true;
  inventory = [
    beehiivPost({ id: "first-post", title: "First Published Article" }),
    beehiivPost({ id: "second-post", title: "Second Published Article" })
  ];
  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const subscriberFailure = await readPut(harness.putCalls[2]);
  assert.deepEqual(subscriberFailure.groups.newsletter, articleFailure.groups.newsletter,
    "a subscriber failure retains its prior group while the article inventory refreshes");
  assert.deepEqual(subscriberFailure.groups.articles.counts, { all: 2, en: 2, es: 0 });
  assert.equal(subscriberFailure.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");

  subscribersFail = false;
  subscriberCount = 30;
  clock.set("2026-10-19T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[3]);
  assert.deepEqual(recovered.groups.articles.counts, { all: 2, en: 2, es: 0 },
    "recovery recomputes the current catalog instead of adding it to yesterday's count");
  assert.equal(recovered.groups.newsletter.subscribers, 30);
  assert.equal(recovered.groups.articles.scopeId, subscriberFailure.groups.articles.scopeId);
  assert.equal(recovered.groups.newsletter.scopeId, initialNewsletterGroup.scopeId);
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 4,
    "each independent subscriber read is made once, with the authorization error left unretried");
  assertNoBeehiivPostCanaries(harness, "synthetic catalog outage", "synthetic subscriber outage", beehiivApiKey);
});

test("Cloudy Things enumerates all 25/25/7 public user.posts pages with safe aggregate-only output", async () => {
  const records = cloudyGeneratedArticles(57);
  const pageFixture = new Map([
    [1, cloudyHashnodePage({ page: 1, totalPages: 3, rows: records.slice(0, 25) })],
    [2, cloudyHashnodePage({ page: 2, totalPages: 3, rows: records.slice(25, 50) })],
    [3, cloudyHashnodePage({ page: 3, totalPages: 3, rows: records.slice(50) })]
  ]);
  const requestLog = [];
  const harness = createHarness({
    input: phaseEightInput(),
    fetchFn: phaseEightApiFetch({ requestLog, hashnodePages: pageFixture })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(group.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" },
    { id: "cloudy-things", label: "Cloudy Things" }
  ]);
  assert.deepEqual(group.counts, { all: 57, en: 57, es: 0 });

  const requests = requestLog.filter(({ kind }) => kind === "hashnode-user-posts");
  assert.deepEqual(requests.map(({ page }) => page), [1, 2, 3]);
  for (const [index, request] of requests.entries()) {
    assert.equal(request.url, hashnodeApiUrl);
    assert.equal(request.method, "POST");
    assert.equal(request.json.variables.username, hashnodeUsername);
    assert.equal(request.json.variables.after, index === 0 ? null : `cloudy-cursor-${index}`);
    assert.match(request.json.query, /user\s*\(\s*username\s*:/);
    assert.match(request.json.query, /posts[\s\S]*first\s*:?\s*25/);
    assert.doesNotMatch(request.json.query, /\bauthor\b/i,
      "the query must not request post author metadata");
    assert.equal(String(Object.entries(request.headers).find(([name]) => name.toLowerCase() === "accept")?.[1]).includes("application/json"), true);
    assert.equal(String(Object.entries(request.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1]).includes("application/json"), true);
    assert.equal(Object.entries(request.headers).some(([name]) => ["authorization", "cookie"].includes(name.toLowerCase())), false);
    assert.equal(request.redirect, "error", "redirects are rejected for the fixed GraphQL endpoint");
    assert.ok(request.signal);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }
  assert.equal(requestLog.some(({ url }) => url !== undefined && !String(url).startsWith(hashnodeApiUrl) && /sitemap|rss|graphql|posts\//i.test(String(url))), false,
    "the source uses only the fixed public user.posts endpoint");
  assertNoCloudyCanaries(
    harness,
    ...records.flatMap(({ id, slug, url, title }) => [id, slug, url, title]),
    cloudyArticleOrigin
  );
});

test("Cloudy Hashnode metadata uses shared title-language identity and excludes future or foreign-origin posts", async () => {
  const rows = [
    cloudyArticle({ id: "cafe-composed", slug: "cafe-composed", title: "  Café   Guide " }),
    cloudyArticle({ id: "cafe-decomposed", slug: "cafe-decomposed", title: "CAFE\u0301 guide" }),
    cloudyArticle({ id: "cafe-unaccented", slug: "cafe-unaccented", title: "Cafe Guide" }),
    cloudyArticle({ id: "shared-title", slug: "shared-title", title: "Shared title across sources" }),
    cloudyArticle({ id: "future", slug: "future", title: "Future archive record", publishedAt: "2027-01-01T00:00:00.000Z" }),
    cloudyArticle({
      id: "foreign-origin",
      slug: "foreign-origin",
      title: "Foreign-origin post is excluded",
      url: "https://posts.hashnode.dev/foreign-origin"
    }),
    cloudyArticle({
      id: "site-root-origin",
      slug: "site-root-origin",
      title: "Site-root origin is excluded",
      url: "https://guilleojeda.com/site-root-origin"
    }),
    cloudyArticle({
      id: "json-escaped-title",
      slug: "json-escaped-title",
      title: "Café & Tools"
    })
  ];
  const requestLog = [];
  const harness = createHarness({
    input: phaseEightInput(),
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows, name: "  Guillermo\u00a0   Ojeda " })]]),
      caylentPages: new Map([[0, { results: [
        article({ id: "caylent-accent-copy", title: "Cafe Guide" }),
        article({ id: "caylent-json-headline-copy", title: "Café & Tools" })
      ] }]]),
      builderPages: new Map([["", {
        articles: [builderArticle({ id: "builder-spanish-copy", title: "Shared title across sources", locale: "es" })],
        resultsSize: 1
      }]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([
        beehiivPost({ id: "simple-shared-copy", title: "Shared title across sources" })
      ]))
    })
  });

  await harness.handler({}, {});

  const group = (await readPut(harness.putCalls[0])).groups.articles;
  assert.deepEqual(group.counts, { all: 5, en: 4, es: 1 },
    "NFC/case/whitespace copies collapse, punctuation/accent differences remain significant, and Spanish stays distinct");
  assert.deepEqual(group.sources.map(({ id }) => id), ["caylent", "builder-center", "simple-aws", "cloudy-things"]);
  assert.equal(requestLog.filter(({ kind }) => kind === "hashnode-user-posts").length, 1);
  assertNoCloudyCanaries(harness, ...rows.flatMap(({ id, slug, url, title }) => [id, slug, url, title]));
});

test("a healthy terminal Hashnode connection with no public posts contributes an explicit zero", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput({
      sources: [sourceInput().source, builderCenterSource(), cloudyThingsSource()],
      curated: { talks: [], books: [] }
    }),
    fetchFn: phaseEightApiFetch({
      requestLog,
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [], hasNextPage: false, endCursor: null })]])
    })
  });

  await harness.handler({}, {});

  const group = (await readPut(harness.putCalls[0])).groups.articles;
  assert.deepEqual(group.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "cloudy-things", label: "Cloudy Things" }
  ]);
  assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(requestLog.filter(({ kind }) => kind === "hashnode-user-posts").map(({ page, after }) => ({ page, after })), [
    { page: 1, after: null }
  ]);
});

test("Hashnode forwards opaque continuation cursors without deriving or rewriting them", async () => {
  const cursor = "opaque/+==/cursor-one";
  const first = cloudyArticle({ id: "opaque-cursor-first", title: "Opaque cursor first post" });
  const second = cloudyArticle({ id: "opaque-cursor-second", title: "Opaque cursor second post" });
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput({
      sources: [sourceInput().source, builderCenterSource(), cloudyThingsSource()],
      curated: { talks: [], books: [] }
    }),
    fetchFn: phaseEightApiFetch({
      requestLog,
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      hashnodeResponder: ({ request }) => request.json.variables.after === null
        ? cloudyHashnodePage({ rows: [first], hasNextPage: true, endCursor: cursor })
        : cloudyHashnodePage({ rows: [second], hasNextPage: false, endCursor: null })
    })
  });

  await harness.handler({}, {});

  const requests = requestLog.filter(({ kind }) => kind === "hashnode-user-posts");
  assert.deepEqual(requests.map(({ json }) => json.variables.after), [null, cursor]);
  assert.deepEqual((await readPut(harness.putCalls[0])).groups.articles.counts, { all: 2, en: 2, es: 0 });
});

test("Dónde Aprendo AWS contributes eligible Spanish identities to the mixed-source aggregate", async () => {
  const sharedTitle = "Café AWS: Guía!";
  const rows = [
    dondeAprendoArticle({ title: "  Café   AWS:   Guía!  ", slug: "shared-spanish-copy", publishedAt: "2024-01-23" }),
    dondeAprendoArticle({ title: "CAFE\u0301 AWS: GUÍA!", slug: "normalized-spanish-copy", publishedAt: "2024-02-01" }),
    dondeAprendoArticle({ title: "Cafe AWS: Guía!", slug: "unaccented-title", publishedAt: "2024-02-02" }),
    dondeAprendoArticle({ title: "Café AWS Guía!", slug: "punctuation-title", publishedAt: "2024-02-03" }),
    dondeAprendoArticle({ title: "Future Spanish identity", slug: "future", publishedAt: "2026-10-17" }),
    dondeAprendoArticle({
      title: "Another author's publication",
      slug: "other-author",
      publishedAt: "2024-02-04",
      authorName: "Synthetic unaffiliated author",
      authorUrl: null
    })
  ];
  const requestLog = [];
  const sources = [...phaseEightInput().sources, dondeAprendoAwsSource()];
  let sourceAttempts = 0;
  const harness = createHarness({
    input: phaseEightInput({ sources }),
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: dondeAprendoApiFetch({
      requestLog,
      responder: () => {
        sourceAttempts += 1;
        if (sourceAttempts === 1) throw new Error("synthetic transient Dónde network interruption");
        return dondeAprendoIndex(rows);
      },
      caylentPages: new Map([[0, { results: [article({ id: "english-title", title: sharedTitle })] }]]),
      builderPages: new Map([["", {
        articles: [builderArticle({ id: "spanish-title", title: sharedTitle, locale: "es" })],
        resultsSize: 1
      }]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([
        beehiivPost({ id: "simple-shared-title", title: sharedTitle })
      ])),
      hashnodePages: new Map([[1, cloudyHashnodePage({
        rows: [cloudyArticle({ id: "cloudy-shared-title", title: sharedTitle })]
      })]])
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assert.deepEqual(group.counts, { all: 4, en: 1, es: 3 },
    "the same title in English and Spanish counts separately; NFC/case/space copies collapse, accents and punctuation remain significant");
  assert.equal(group.collectedAt, "2026-10-16T12:00:00.000Z", "the aggregate reports its collection time, not a publication date");
  assert.ok(group.sources.some(({ id, label }) => id === "donde-aprendo-aws" && label === "Dónde Aprendo AWS"),
    "public source coverage identifies Dónde Aprendo AWS");
  assert.deepEqual(group.sources.map(({ id }) => id).sort(), sources.map(({ id }) => id).sort(),
    "the new source does not displace existing selected sources");
  const sourceRequests = requestLog.filter(({ kind }) => kind === "donde-aprendo-index");
  assert.equal(sourceRequests.length, 2, "one transient network failure is retried once");
  assert.deepEqual(sourceRequests.map(({ attempt }) => attempt), [1, 2], "the retry follows the failed first attempt");
  for (const request of sourceRequests) assertDondeAprendoRequest(request, harness);
  assertNoDondeAprendoCanaries(harness, "Synthetic unaffiliated author");
});

test("a valid empty Dónde Aprendo AWS index contributes an explicit zero", async () => {
  const requestLog = [];
  const sources = [sourceInput().source, builderCenterSource(), dondeAprendoAwsSource()];
  const harness = createHarness({
    input: phaseTwoInput({ sources }),
    secretArn: null,
    fetchFn: dondeAprendoApiFetch({
      requestLog,
      response: dondeAprendoIndex([]),
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]])
    })
  });

  await harness.handler({}, {});

  const group = (await readPut(harness.putCalls[0])).groups.articles;
  assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  assert.ok(group.sources.some(({ id }) => id === "donde-aprendo-aws"), "the empty source remains part of measured coverage");
  assert.deepEqual(harness.secretCalls, [], "the new public index adds no credential requirement");
  assertDondeAprendoRequest(requestLog.find(({ kind }) => kind === "donde-aprendo-index"), harness);
});

test("an invalid or incomplete Dónde Aprendo AWS index retains the whole prior Articles family", async () => {
  const goodRow = dondeAprendoArticle({ title: "Last complete Dónde identity", slug: "last-complete" });
  const oversizedBody = JSON.stringify(dondeAprendoIndex([
    goodRow,
    dondeAprendoArticle({ title: `Oversized valid identity ${"x".repeat(2_200_000)}`, slug: "oversized-valid" })
  ]));
  assert.ok(Buffer.byteLength(oversizedBody, "utf8") > 1024 * 1024, "the source response exceeds the shared 1 MiB decoded-body ceiling");
  const oversizedChunks = Array.from({ length: Math.ceil(oversizedBody.length / (64 * 1024)) }, (_, index) =>
    oversizedBody.slice(index * 64 * 1024, (index + 1) * 64 * 1024));
  const oversizedStream = hashnodeStreamingResponse(oversizedChunks, { contentType: "application/json; charset=utf-8" });
  const contradictoryCopy = dondeAprendoArticle({
    title: "Contradictory metadata for the same URL",
    slug: "conflict",
    url: `${dondeAprendoOrigin}/blog/last-complete/`
  });
  const failureCases = [
    ["wrong source identity", () => dondeAprendoIndex([goodRow], { sourceId: "another-source" })],
    ["unsupported schema version", () => dondeAprendoIndex([goodRow], { schemaVersion: 2 })],
    ["malformed eligible record after a valid row", () => dondeAprendoIndex([goodRow, { ...goodRow, title: "   ", url: `${dondeAprendoOrigin}/blog/malformed/` }])],
    ["invalid publication date after a valid row", () => dondeAprendoIndex([goodRow, { ...goodRow, title: "Invalid publication date", url: `${dondeAprendoOrigin}/blog/invalid-date/`, publishedAt: "2025-02-30" }])],
    ["non-canonical article destination after a valid row", () => dondeAprendoIndex([goodRow, { ...goodRow, title: "External destination", url: "https://attacker.example/blog/external/" }])],
    ["contradictory duplicate URL metadata", () => dondeAprendoIndex([goodRow, contradictoryCopy])],
    ["truncated JSON", () => new Response('{"schemaVersion":1,"source":', { headers: { "content-type": "application/json" } })],
    ["oversized valid JSON feed", () => oversizedStream.response, oversizedStream],
    ["failed HTTP response", () => new Response("synthetic-donde-error-body-canary", { status: 503 })],
    ["incomplete response body", () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      async json() { throw new Error("synthetic-donde-body-read-canary"); },
      async text() { throw new Error("synthetic-donde-body-read-canary"); }
    })]
  ];

  for (const [description, makeFailureResponse, stream] of failureCases) {
    let currentFeed = dondeAprendoIndex([goodRow]);
    let subscribers = 17;
    const requestLog = [];
    const sources = [...phaseEightInput().sources, dondeAprendoAwsSource()];
    const harness = createHarness({
      input: phaseEightInput({ sources }),
      fetchFn: dondeAprendoApiFetch({
        requestLog,
        responder: () => currentFeed,
        newsletterResponder: () => jsonResponse({ data: { id: beehiivPublicationId, stats: { active_subscriptions: subscribers } } }),
        caylentPages: new Map([[0, { results: [] }]]),
        builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
        hashnodePages: new Map([[1, cloudyHashnodePage({
          rows: [cloudyArticle({ id: "failure-cloudy-copy", title: goodRow.title })]
        })]])
      })
    });

    await harness.handler({}, {});
    const previous = (await readPut(harness.putCalls.at(-1))).groups.articles;
    assert.deepEqual(previous.counts, { all: 2, en: 1, es: 1 }, `${description} begins with a complete five-source aggregate`);

    currentFeed = makeFailureResponse();
    subscribers = 18;
    harness.clock.set("2026-10-17T12:00:00.000Z");
    await harness.handler({}, {});

    const refreshed = await readPut(harness.putCalls.at(-1));
    assert.deepEqual(refreshed.groups.articles, previous, `${description} preserves counts, source coverage, scope and collection time together`);
    assert.equal(refreshed.groups.newsletter.subscribers, 18, `${description} still refreshes a healthy sibling family`);
    const sourceRequests = requestLog.filter(({ kind }) => kind === "donde-aprendo-index");
    assert.ok(sourceRequests.length >= 2, `${description} reaches the Dónde feed on both invocations`);
    for (const request of sourceRequests) assertDondeAprendoRequest(request, harness);
    if (stream !== undefined) {
      const stats = stream.stats();
      assert.ok(stats.chunksRead < stats.totalChunks, "the decoded-body ceiling stops the oversized stream before its end");
      assert.equal(stats.cancelled, true, "the oversized source body is cancelled after crossing the limit");
    }
    assertNoDondeAprendoCanaries(harness, "synthetic-donde-error-body-canary", "synthetic-donde-body-read-canary");
  }
});

test("a first Dónde Aprendo AWS failure leaves Articles unavailable instead of publishing zero", async () => {
  const requestLog = [];
  const sources = [...phaseEightInput().sources, dondeAprendoAwsSource()];
  const harness = createHarness({
    input: phaseEightInput({ sources }),
    fetchFn: dondeAprendoApiFetch({
      requestLog,
      response: new Response("synthetic-donde-error-body-canary", { status: 503 }),
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      hashnodePages: new Map([[1, cloudyHashnodePage({
        rows: [cloudyArticle({ id: "first-failure-cloudy-row" })]
      })]])
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false, "there is no prior valid Articles family to retain");
  assert.equal(Object.hasOwn(output.groups, "talks"), true, "healthy curated families still publish");
  assert.equal(Object.hasOwn(output.groups, "books"), true, "healthy book data still publishes");
  assertDondeAprendoRequest(requestLog.find(({ kind }) => kind === "donde-aprendo-index"), harness);
  assertNoDondeAprendoCanaries(harness, "synthetic-donde-error-body-canary");
});

test("AWS for Engineers joins all six selected sources with English title-language identity rules", async () => {
  const requestLog = [];
  let attempt = 0;
  const awsRows = [
    awsForEngineersArticle({ title: "  Shared   language identity ", slug: "shared-copy", publishedAt: "2024-01-02" }),
    awsForEngineersArticle({ title: "SHARED LANGUAGE IDENTITY", slug: "shared-case-copy", publishedAt: "2024-02-03" }),
    awsForEngineersArticle({ title: "  Café: Guide!  ", slug: "cafe-composed" }),
    awsForEngineersArticle({ title: "CAFE\u0301: GUIDE!", slug: "cafe-decomposed" }),
    awsForEngineersArticle({ title: "Cafe: Guide!", slug: "cafe-unaccented" }),
    awsForEngineersArticle({ title: "Cloudy AWS only!", slug: "cloudy-copy" }),
    awsForEngineersArticle({ title: "Cloudy AWS only", slug: "cloudy-punctuation" }),
    awsForEngineersArticle({ title: "Boundary AWS", slug: "exact-cutoff", publishedAt: "2026-10-16T07:00:00.000000-05:00" }),
    awsForEngineersArticle({ title: "Date-only AWS", slug: "date-only", publishedAt: "2024-07-09" }),
    awsForEngineersArticle({ title: "Future date-only AWS", slug: "future-date-only", publishedAt: "2026-10-17" }),
    awsForEngineersArticle({ title: "Future same-day AWS", slug: "future-same-day", publishedAt: "2026-10-16T12:00:01+00:00" }),
    awsForEngineersArticle({
      title: "Another author's AWS publication",
      slug: "other-author",
      authorName: "Synthetic unaffiliated author",
      authorUrl: null
    })
  ];
  const sources = [...phaseEightInput().sources, dondeAprendoAwsSource(), awsForEngineersSource()];
  const harness = createHarness({
    input: phaseThirteenInput({ sources }),
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: awsSixSourceFetch({
      requestLog,
      awsResponder: () => {
        attempt += 1;
        if (attempt === 1) throw new Error("synthetic AWS for Engineers transient interruption");
        return awsForEngineersIndex(awsRows);
      },
      caylentRows: [article({ id: "same-title-caylent", title: "Shared language identity" })],
      builderArticles: [builderArticle({ id: "same-title-builder", title: "Shared language identity", locale: "es" })],
      simpleArticles: [beehiivPost({ id: "simple-only", title: "Simple AWS only" })],
      hashnodeRows: [cloudyArticle({ id: "cloudy-copy", title: "Cloudy AWS only!" })],
      dondeArticles: [dondeAprendoArticle({ title: "Shared language identity", slug: "same-title-spanish" })]
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assert.deepEqual(group.counts, { all: 9, en: 8, es: 1 },
    "English copies collapse across sources, Spanish stays distinct, normalized title copies collapse, and punctuation or accents remain significant");
  assert.deepEqual(group.sources.map(({ id }) => id), [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers"
  ], "AWS for Engineers is appended after all five existing source identities");
  assert.equal(group.collectedAt, "2026-10-16T12:00:00.000Z", "collection metadata reports the refresh time, not a feed publication date");
  assert.ok(group.sources.some(({ id, label }) => id === "aws-for-engineers" && label === "AWS for Engineers"));
  const requests = requestLog.filter(({ kind }) => kind === "aws-for-engineers-index");
  assert.equal(requests.length, 2, "one transient fetch failure is retried once");
  assert.deepEqual(requests.map(({ attempt: number }) => number), [1, 2]);
  for (const request of requests) assertAwsForEngineersRequest(request, harness);
  assertNoAwsForEngineersCanaries(harness,
    ...awsRows.flatMap(({ title, url }) => [title, url]),
    "Synthetic unaffiliated author");
});

test("a valid empty AWS for Engineers feed contributes zero without Beehiiv in an older input", async () => {
  const requestLog = [];
  const sources = [sourceInput().source, builderCenterSource(), awsForEngineersSource()];
  const harness = createHarness({
    input: phaseTwoInput({ sources }),
    secretArn: null,
    fetchFn: awsForEngineersApiFetch({
      requestLog,
      response: awsForEngineersIndex([]),
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]])
    })
  });

  await harness.handler({}, {});

  const group = (await readPut(harness.putCalls[0])).groups.articles;
  assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(group.sources.map(({ id }) => id), ["caylent", "builder-center", "aws-for-engineers"]);
  assert.deepEqual(harness.secretCalls, [], "the public article feed adds no credential requirement");
  assert.equal(requestLog.some(({ kind }) => kind.startsWith("beehiiv")), false, "an older source-array input makes no Beehiiv request");
  assertAwsForEngineersRequest(requestLog.find(({ kind }) => kind === "aws-for-engineers-index"), harness);
});

test("invalid, incomplete, or oversized AWS for Engineers feeds retain the whole prior Articles family", async () => {
  const goodRow = awsForEngineersArticle({ title: "Last complete AWS for Engineers identity", slug: "last-complete" });
  const oversizedBody = JSON.stringify(awsForEngineersIndex([
    goodRow,
    awsForEngineersArticle({ title: `Oversized valid identity ${"x".repeat(2_200_000)}`, slug: "oversized-valid" })
  ]));
  assert.ok(Buffer.byteLength(oversizedBody, "utf8") > 1024 * 1024, "the valid source response exceeds the 1 MiB decoded-body ceiling");
  const oversizedChunks = Array.from({ length: Math.ceil(oversizedBody.length / (64 * 1024)) }, (_, index) =>
    oversizedBody.slice(index * 64 * 1024, (index + 1) * 64 * 1024));
  let oversizedStream;
  const makeOversizedResponse = () => {
    oversizedStream = hashnodeStreamingResponse(oversizedChunks, { contentType: "application/json; charset=utf-8" });
    return oversizedStream.response;
  };
  const contradictoryCopy = awsForEngineersArticle({
    title: "Contradictory metadata for the same URL",
    slug: "contradictory-copy",
    url: `${awsForEngineersOrigin}/blog/last-complete/`
  });
  const makeIncompleteResponse = () => {
    let sentPartialBody = false;
    const incompleteBody = new ReadableStream({
      pull(controller) {
        if (!sentPartialBody) {
          sentPartialBody = true;
          controller.enqueue(Buffer.from(JSON.stringify(awsForEngineersIndex([goodRow])).slice(0, -1)));
          return;
        }
        controller.error(new Error("synthetic incomplete AWS for Engineers stream"));
      }
    });
    return new Response(incompleteBody, { headers: { "content-type": "application/json" } });
  };
  const failureCases = [
    ["wrong source identity", () => awsForEngineersIndex([goodRow], { sourceId: "another-source" })],
    ["unsupported schema version", () => awsForEngineersIndex([goodRow], { schemaVersion: 2 })],
    ["malformed eligible row after a valid row", () => awsForEngineersIndex([goodRow, { ...goodRow, title: "   ", url: `${awsForEngineersOrigin}/blog/malformed/` }])],
    ["invalid publication date after a valid row", () => awsForEngineersIndex([goodRow, { ...goodRow, title: "Invalid date", url: `${awsForEngineersOrigin}/blog/invalid-date/`, publishedAt: "not-a-date" }])],
    ["impossible calendar date after a valid row", () => awsForEngineersIndex([goodRow, { ...goodRow, title: "Impossible date", url: `${awsForEngineersOrigin}/blog/impossible-date/`, publishedAt: "2025-02-30" }])],
    ["impossible ISO calendar timestamp after a valid row", () => awsForEngineersIndex([goodRow, { ...goodRow, title: "Impossible timestamp", url: `${awsForEngineersOrigin}/blog/impossible-timestamp/`, publishedAt: "2025-02-30T12:00:00+00:00" }])],
    ["foreign article URL after a valid row", () => awsForEngineersIndex([goodRow, { ...goodRow, title: "Foreign article", url: "https://attacker.example/blog/foreign/" }])],
    ["contradictory duplicate URL metadata", () => awsForEngineersIndex([goodRow, contradictoryCopy])],
    ["truncated JSON", () => new Response('{"schemaVersion":1,"source":', { headers: { "content-type": "application/json" } })],
    ["incomplete response stream", makeIncompleteResponse, undefined, true],
    ["oversized valid JSON feed", makeOversizedResponse, undefined, false, () => oversizedStream],
    ["failed HTTP response", () => new Response("synthetic-aws-for-engineers-error-body-canary", { status: 503 }), undefined, true]
  ];

  for (const [description, makeFailureResponse, _unused, retries, getStream] of failureCases) {
    let failSource = false;
    let subscribers = 17;
    const requestLog = [];
    const harness = createHarness({
      input: awsSixSourceInput(),
      fetchFn: awsSixSourceFetch({
        requestLog,
        awsResponder: () => failSource ? makeFailureResponse() : awsForEngineersIndex([goodRow]),
        newsletterResponder: () => jsonResponse({ data: { id: beehiivPublicationId, stats: { active_subscriptions: subscribers } } })
      })
    });

    await harness.handler({}, {});
    const previous = (await readPut(harness.putCalls.at(-1))).groups.articles;
    assert.deepEqual(previous.counts, { all: 6, en: 5, es: 1 }, `${description} begins with a complete six-source aggregate`);

    failSource = true;
    subscribers = 18;
    harness.clock.set("2026-10-17T12:00:00.000Z");
    await harness.handler({}, {});

    const refreshed = await readPut(harness.putCalls.at(-1));
    assert.deepEqual(refreshed.groups.articles, previous, `${description} retains counts, coverage, scope, and collection time together`);
    assert.equal(refreshed.groups.newsletter.subscribers, 18, `${description} still refreshes a healthy sibling family`);
    const requests = requestLog.filter(({ kind }) => kind === "aws-for-engineers-index");
    assert.equal(requests.length, retries ? 3 : 2, `${description} uses the expected number of new-source reads`);
    for (const request of requests) assertAwsForEngineersRequest(request, harness);
    if (getStream !== undefined) {
      const stats = getStream().stats();
      assert.ok(stats.chunksRead < stats.totalChunks, "the decoded-body ceiling stops before reading the full oversized feed");
      assert.equal(stats.cancelled, true, "the oversized source stream is cancelled after crossing the limit");
    }
    assertNoAwsForEngineersCanaries(harness, "synthetic-aws-for-engineers-error-body-canary");
  }
});

test("a first AWS for Engineers failure leaves Articles unavailable instead of publishing zero or partial counts", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseThreeInput({ sources: [sourceInput().source, builderCenterSource(), awsForEngineersSource()] }),
    secretArn: null,
    fetchFn: awsForEngineersApiFetch({
      requestLog,
      response: new Response("synthetic-first-aws-source-error-canary", { status: 503 }),
      caylentPages: new Map([[0, { results: [article({ id: "first-failure-caylent", title: "Valid sibling article" })] }]]),
      builderPages: new Map([["", {
        articles: [builderArticle({ id: "first-failure-builder", title: "Valid sibling article", locale: "es" })],
        resultsSize: 1
      }]])
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "articles"), false, "a partial source set cannot publish as a measured total");
  assert.equal(Object.hasOwn(output.groups, "talks"), true, "healthy sibling families still publish");
  assert.equal(Object.hasOwn(output.groups, "books"), true);
  assert.equal(requestLog.filter(({ kind }) => kind === "aws-for-engineers-index").length, 2, "the transient HTTP failure is retried once");
  assert.deepEqual(harness.secretCalls, []);
  assertNoAwsForEngineersCanaries(harness, "synthetic-first-aws-source-error-canary");
});

test("AWS for Engineers activation retains the five-source aggregate on failure, then recovers without changing other scopes", async () => {
  let awsFeed = awsForEngineersIndex([]);
  let subscribers = 17;
  const requestLog = [];
  const priorSources = [...phaseEightInput().sources, dondeAprendoAwsSource()];
  const enabledSources = [...priorSources, awsForEngineersSource()];
  const harness = createHarness({
    input: phaseThirteenInput({ sources: priorSources }),
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: awsSixSourceFetch({
      requestLog,
      awsResponder: () => awsFeed,
      newsletterResponder: () => jsonResponse({ data: { id: beehiivPublicationId, stats: { active_subscriptions: subscribers } } }),
      caylentRows: [article({ id: "activation-caylent", title: "Activation shared English" })],
      builderArticles: [],
      simpleArticles: [beehiivPost({ id: "activation-simple", title: "Activation Simple article" })],
      hashnodeRows: [cloudyArticle({ id: "activation-cloudy", title: "Activation shared English" })],
      dondeArticles: [dondeAprendoArticle({ title: "Activation Spanish article", slug: "activation-spanish" })]
    })
  });

  const independentScopes = (output) => Object.fromEntries(Object.entries(output.groups)
    .filter(([name]) => name !== "articles")
    .map(([name, group]) => [name, group.scopeId ?? Object.fromEntries(
      Object.entries(group.records ?? {}).map(([period, record]) => [period, record.scopeId])
    )]));

  await harness.handler({}, {});
  const beforeActivation = await readPut(harness.putCalls.at(-1));
  const previousArticles = beforeActivation.groups.articles;
  assert.deepEqual(previousArticles.sources.map(({ id }) => id), [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws"
  ], "the prior snapshot contains all five currently selected article sources");
  const previousIndependentScopes = independentScopes(beforeActivation);

  harness.setInput(phaseThirteenInput({ sources: enabledSources }));
  awsFeed = new Response("synthetic-aws-for-engineers-activation-error-canary", { status: 503 });
  subscribers = 18;
  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const failedActivation = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(failedActivation.groups.articles, previousArticles,
    "a new source failure preserves the exact prior five-source coverage, counts, scope, and date");
  assert.equal(failedActivation.groups.newsletter.subscribers, 18);
  assert.deepEqual(independentScopes(failedActivation), previousIndependentScopes);

  awsFeed = awsForEngineersIndex([
    awsForEngineersArticle({ title: "AWS activation English article", slug: "activation-english", publishedAt: "2025-07-01T10:15:23.123456+00:00" })
  ]);
  subscribers = 19;
  harness.clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(recovered.groups.articles.sources.map(({ id }) => id), [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers"
  ]);
  assert.notEqual(recovered.groups.articles.scopeId, previousArticles.scopeId, "successful activation changes Articles selection scope");
  assert.deepEqual(recovered.groups.articles.counts, { all: 4, en: 3, es: 1 });
  assert.equal(recovered.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");
  assert.deepEqual(independentScopes(recovered), previousIndependentScopes,
    "Newsletter, views, Search, and directory scope ids remain independent of article-source selection");

  await harness.handler({}, {});
  const repeated = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(repeated.groups.articles.counts, recovered.groups.articles.counts,
    "a repeated invocation recomputes totals rather than adding the published count again");
  assert.equal(repeated.groups.articles.scopeId, recovered.groups.articles.scopeId);

  harness.setInput(phaseThirteenInput({ sources: [...enabledSources].reverse() }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(reordered.groups.articles.sources, recovered.groups.articles.sources,
    "reordered selectors still publish canonical source coverage");
  assert.equal(reordered.groups.articles.scopeId, recovered.groups.articles.scopeId,
    "selector order does not change semantic source scope");
  assert.deepEqual(reordered.groups.articles.counts, recovered.groups.articles.counts);

  for (const request of requestLog.filter(({ kind }) => kind === "aws-for-engineers-index")) {
    assertAwsForEngineersRequest(request, harness);
  }
  assertNoAwsForEngineersCanaries(harness, "synthetic-aws-for-engineers-activation-error-canary");
});

test("Dónde Aprendo AWS recovery recomputes the full aggregate after retaining a prior snapshot", async () => {
  const sharedTitle = "Shared title across languages";
  let sourceResponse = dondeAprendoIndex([
    dondeAprendoArticle({ title: "Old Dónde identity", slug: "old-identity" })
  ]);
  let caylentRows = [article({ id: "recovery-en", title: sharedTitle })];
  let subscribers = 17;
  const requestLog = [];
  const sources = [...phaseEightInput().sources, dondeAprendoAwsSource()];
  const harness = createHarness({
    input: phaseEightInput({ sources }),
    fetchFn: dondeAprendoApiFetch({
      requestLog,
      responder: () => sourceResponse,
      newsletterResponder: () => jsonResponse({ data: { id: beehiivPublicationId, stats: { active_subscriptions: subscribers } } }),
      caylentPages: new Map([[0, () => jsonResponse({ results: caylentRows })]]),
      builderPages: new Map([["", {
        articles: [builderArticle({ id: "recovery-es", title: sharedTitle, locale: "es" })],
        resultsSize: 1
      }]]),
      hashnodePages: new Map([[1, cloudyHashnodePage({
        rows: [cloudyArticle({ id: "recovery-cloudy-en", title: sharedTitle })]
      })]])
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(first.groups.articles.counts, { all: 3, en: 1, es: 2 });

  harness.clock.set("2026-10-17T12:00:00.000Z");
  sourceResponse = new Response("synthetic-donde-recovery-error-canary", { status: 503 });
  caylentRows = [
    article({ id: "recovery-en", title: sharedTitle }),
    article({ id: "recovery-new-en", title: "New English article during source outage" })
  ];
  subscribers = 18;
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(retained.groups.articles, first.groups.articles, "a new healthy source row cannot partially refresh Articles");
  assert.equal(retained.groups.newsletter.subscribers, 18, "healthy sibling statistics continue to refresh");

  harness.clock.set("2026-10-18T12:00:00.000Z");
  sourceResponse = dondeAprendoIndex([
    dondeAprendoArticle({ title: "Recovered Dónde identity", slug: "recovered-identity" })
  ]);
  subscribers = 19;
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(recovered.groups.articles.counts, { all: 4, en: 2, es: 2 },
    "recovery recomputes from the current complete source records, including the title-language collision");
  assert.equal(recovered.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");
  assert.equal(recovered.groups.articles.scopeId, first.groups.articles.scopeId, "content changes do not change source-selection scope");
  assert.equal(recovered.groups.newsletter.subscribers, 19);

  await harness.handler({}, {});
  const repeated = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(repeated.groups.articles.counts, recovered.groups.articles.counts,
    "a repeated invocation recomputes the same current count instead of incrementing the published total");
  assert.equal(repeated.groups.articles.scopeId, recovered.groups.articles.scopeId);
  assertNoDondeAprendoCanaries(harness, "synthetic-donde-recovery-error-canary");
});

test("a failed Dónde source activation retains the pre-activation family before recovery changes its scope", async () => {
  let failDondeSource = false;
  let subscribers = 17;
  const requestLog = [];
  const priorSources = phaseEightInput().sources;
  assert.equal(priorSources.length, 4, "activation starts from the actual four-source configuration");
  const harness = createHarness({
    input: phaseEightInput({ sources: priorSources }),
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: dondeAprendoApiFetch({
      requestLog,
      responder: () => failDondeSource
        ? new Response("synthetic-donde-activation-error-canary", { status: 503 })
        : dondeAprendoIndex([dondeAprendoArticle({ title: "New Dónde Spanish article", slug: "activation-article" })]),
      newsletterResponder: () => jsonResponse({ data: { id: beehiivPublicationId, stats: { active_subscriptions: subscribers } } }),
      caylentPages: new Map([[0, { results: [article({ id: "activation-en", title: "Existing English article" })] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      hashnodePages: new Map([[1, cloudyHashnodePage({
        rows: [cloudyArticle({ id: "activation-cloudy-en", title: "Existing English article" })]
      })]])
    })
  });

  await harness.handler({}, {});
  const beforeActivation = await readPut(harness.putCalls.at(-1));
  const priorArticleGroup = beforeActivation.groups.articles;
  assert.ok(priorArticleGroup, `the old selector should produce a valid Articles family; groups=${Object.keys(beforeActivation.groups).join(",")}, logs=${harness.logs.join("|")}`);
  assert.deepEqual(priorArticleGroup.sources.map(({ id }) => id), priorSources.map(({ id }) => id));
  const independentScopes = (output) => ({
    newsletter: output.groups.newsletter.scopeId,
    articleViews: output.groups.articleViews.records["12m"].scopeId,
    articleSearch: output.groups.articleSearchClicks.records["12m"].scopeId
  });
  const originalIndependentScopes = independentScopes(beforeActivation);

  harness.setInput(phaseEightInput({ sources: [...priorSources, dondeAprendoAwsSource()] }));
  failDondeSource = true;
  subscribers = 18;
  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const failedActivation = await readPut(harness.putCalls.at(-1));
  assert.deepEqual(failedActivation.groups.articles, priorArticleGroup,
    "a newly selected source failure retains the exact old coverage, scope, counts, and date");
  assert.equal(failedActivation.groups.newsletter.subscribers, 18, "healthy sibling families refresh during activation failure");
  assert.deepEqual(independentScopes(failedActivation), originalIndependentScopes,
    "the new article source does not change newsletter, views, or Search scopes");

  failDondeSource = false;
  subscribers = 19;
  harness.clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls.at(-1));
  assert.ok(recovered.groups.articles.sources.some(({ id, label }) => id === "donde-aprendo-aws" && label === "Dónde Aprendo AWS"),
    "recovery publishes the newly selected source coverage");
  assert.equal(recovered.groups.articles.scopeId === priorArticleGroup.scopeId, false,
    "source activation changes the Articles selection scope");
  assert.deepEqual(recovered.groups.articles.counts, { all: 2, en: 1, es: 1 });
  assert.equal(recovered.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");
  assert.deepEqual(independentScopes(recovered), originalIndependentScopes,
    "successful article source activation leaves independent metric scopes unchanged");
  assertNoDondeAprendoCanaries(harness, "synthetic-donde-activation-error-canary");
});

test("Cloudy Things is supported with source-array inputs 2 through 6 and adds no credential requirement", async () => {
  const baseSources = [sourceInput().source, builderCenterSource()];
  const cloudOnlySources = [...baseSources, cloudyThingsSource()];
  const allSources = [...baseSources, simpleAwsArticleSource(), cloudyThingsSource()];
  const cases = [
    { name: "input 2", input: phaseTwoInput({ sources: cloudOnlySources }), expected: ["caylent", "builder-center", "cloudy-things"] },
    { name: "input 3", input: phaseThreeInput({ sources: cloudOnlySources }), expected: ["caylent", "builder-center", "cloudy-things"] },
    { name: "input 4 without Simple AWS articles", input: phaseFourInput({ sources: cloudOnlySources }), expected: ["caylent", "builder-center", "cloudy-things"] },
    { name: "input 4", input: phaseFourInput({ sources: allSources }), expected: ["caylent", "builder-center", "simple-aws", "cloudy-things"] },
    { name: "input 5 without Simple AWS articles", input: phaseFiveInput({ sources: cloudOnlySources }), expected: ["caylent", "builder-center", "cloudy-things"] },
    { name: "input 5", input: phaseFiveInput({ sources: allSources }), expected: ["caylent", "builder-center", "simple-aws", "cloudy-things"] },
    { name: "input 6 without Simple AWS articles", input: phaseSixInput({ sources: cloudOnlySources }), expected: ["caylent", "builder-center", "cloudy-things"] },
    { name: "input 6", input: phaseSixInput({ sources: allSources }), expected: ["caylent", "builder-center", "simple-aws", "cloudy-things"] }
  ];

  for (const { name, input, expected } of cases) {
    const requestLog = [];
    const harness = createHarness({
      input,
      fetchFn: phaseEightApiFetch({
        requestLog,
        hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ id: `input-${input.schemaVersion}-${expected.length}-post` })] })]])
      })
    });
    await harness.handler({}, {});
    const group = (await readPut(harness.putCalls[0])).groups.articles;
    assert.deepEqual(group.sources.map(({ id }) => id), expected, `${name} keeps canonical source coverage`);
    assert.deepEqual(group.counts, { all: 1, en: 1, es: 0 }, `${name} publishes the fetched Cloudy article`);
    assert.equal(requestLog.filter(({ kind }) => kind === "hashnode-user-posts").length, 1);
    if (name === "input 2" || name === "input 3") {
      assert.deepEqual(harness.secretCalls, [], `${name} does not need a credential for Cloudy Things`);
      assert.equal(requestLog.some(({ kind }) => kind.startsWith("beehiiv")), false);
    }
  }
});

test("the Cloudy Things selector validates before provider work and can be disabled", async () => {
  const caylent = sourceInput().source;
  const builder = builderCenterSource();
  const simple = simpleAwsArticleSource();
  const validCloudy = cloudyThingsSource();
  const invalidInputs = [
    phaseEightInput({ sources: [caylent, builder, simple, { id: "cloudy-things", language: "en" }] }),
    phaseEightInput({ sources: [caylent, builder, simple, { ...validCloudy, authorName: " \t " }] }),
    phaseEightInput({ sources: [caylent, builder, simple, { ...validCloudy, language: "es" }] }),
    phaseEightInput({ sources: [caylent, builder, simple, { ...validCloudy, language: "fr" }] }),
    phaseEightInput({ sources: [caylent, builder, simple, { ...validCloudy, archiveUrl: cloudyArticleOrigin }] }),
    phaseEightInput({ sources: [caylent, builder, simple, validCloudy, validCloudy] })
  ];

  for (const input of invalidInputs) {
    const requestLog = [];
    const harness = createHarness({
      input,
      fetchFn: phaseEightApiFetch({ requestLog })
    });
    await assertFailedWithoutReplacing(harness);
    assert.deepEqual(requestLog, [], "malformed Cloudy selectors fail before any provider request");
    assert.deepEqual(harness.secretCalls, [], "malformed Cloudy selectors fail before Secrets Manager");
    assert.deepEqual(harness.parameterCalls, [], "malformed Cloudy selectors fail before Google credentials");
  }

  const disabledLog = [];
  const disabled = createHarness({
    input: phaseTwoInput({ sources: [caylent, builder] }),
    secretArn: null,
    fetchFn: phaseEightApiFetch({ requestLog: disabledLog })
  });
  await disabled.handler({}, {});
  const disabledGroup = (await readPut(disabled.putCalls[0])).groups.articles;
  assert.deepEqual(disabledGroup.sources.map(({ id }) => id), ["caylent", "builder-center"]);
  assert.equal(disabledLog.some(({ kind }) => kind === "hashnode-user-posts"), false,
    "the disabled Cloudy selector makes no archive request and needs no credential");
  assert.deepEqual(disabled.secretCalls, []);
});

test("Cloudy Things selector scope is independent of archive contents and other metrics", async () => {
  const caylent = sourceInput().source;
  const builder = builderCenterSource();
  const simple = simpleAwsArticleSource();
  const cloudy = cloudyThingsSource();
  const completeSources = [caylent, builder, simple, cloudy];
  let rows = [cloudyArticle({ id: "scope-cloudy-first", title: "Cloudy scope article one" })];
  const requestLog = [];
  const fetchFn = phaseEightApiFetch({
    requestLog,
    hashnodePages: new Map([[1, () => cloudyHashnodePage({ rows })]]),
    postsResponder: () => jsonResponse(beehiivPostsEnvelope([]))
  });
  const harness = createHarness({ input: phaseSixInput({ sources: completeSources }), fetchFn });
  const unrelatedScopes = (output) => ({
    newsletter: output.groups.newsletter.scopeId,
    views: Object.fromEntries(Object.entries(output.groups.articleViews.records).map(([period, record]) => [period, record.scopeId])),
    search: Object.fromEntries(Object.entries(output.groups.articleSearchClicks.records).map(([period, record]) => [period, record.scopeId]))
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  assert.deepEqual(initial.groups.articles.counts, { all: 1, en: 1, es: 0 });
  const initialArticleScope = initial.groups.articles.scopeId;
  const initialUnrelatedScopes = unrelatedScopes(initial);

  harness.setInput(phaseSixInput({ sources: [cloudy, simple, builder, caylent] }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls[1]);
  assert.equal(reordered.groups.articles.scopeId, initialArticleScope,
    "source array order does not change semantic article scope");
  assert.deepEqual(reordered.groups.articles.sources.map(({ id }) => id), ["caylent", "builder-center", "simple-aws", "cloudy-things"]);
  assert.deepEqual(unrelatedScopes(reordered), initialUnrelatedScopes);

  rows = [...rows, cloudyArticle({ id: "scope-cloudy-new", title: "Cloudy scope article two" })];
  await harness.handler({}, {});
  const newPublication = await readPut(harness.putCalls[2]);
  assert.deepEqual(newPublication.groups.articles.counts, { all: 2, en: 2, es: 0 },
    "newly published archive rows are discovered without changing scope");
  assert.equal(newPublication.groups.articles.scopeId, initialArticleScope);
  assert.deepEqual(unrelatedScopes(newPublication), initialUnrelatedScopes);

  harness.setInput(phaseSixInput({ sources: [caylent, builder, simple, cloudyThingsSource({ authorName: "Another Author" })] }));
  await harness.handler({}, {});
  const changedAuthor = await readPut(harness.putCalls[3]);
  assert.notEqual(changedAuthor.groups.articles.scopeId, initialArticleScope,
    "the configured Cloudy author filter belongs to article scope");
  assert.deepEqual(changedAuthor.groups.articles.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(unrelatedScopes(changedAuthor), initialUnrelatedScopes);

  harness.setInput(phaseSixInput({ sources: [caylent, builder, simple] }));
  await harness.handler({}, {});
  const disabled = await readPut(harness.putCalls[4]);
  assert.notEqual(disabled.groups.articles.scopeId, changedAuthor.groups.articles.scopeId,
    "disabling Cloudy Things changes article scope");
  assert.notEqual(disabled.groups.articles.scopeId, initialArticleScope,
    "an enabled versus disabled Cloudy selector changes article scope");
  assert.deepEqual(disabled.groups.articles.sources.map(({ id }) => id), ["caylent", "builder-center", "simple-aws"]);
  assert.deepEqual(unrelatedScopes(disabled), initialUnrelatedScopes,
    "Cloudy source selection does not change subscribers, Views, or Search scopes");
});

test("incomplete Cloudy Hashnode connections retain whole prior article groups and publish healthy siblings", async () => {
  const caylent = sourceInput().source;
  const builder = builderCenterSource();
  const simple = simpleAwsArticleSource();
  const cloudy = cloudyThingsSource();
  const one = cloudyArticle({ id: "failure-first-row", slug: "failure-first-row", title: "First valid row" });
  const two = cloudyArticle({ id: "failure-second-row", slug: "failure-second-row", title: "Second valid row" });
  const three = cloudyArticle({ id: "failure-third-row", slug: "failure-third-row", title: "Third valid row" });
  const previousCoverage = [
    priorGroup({
      sources: [{ id: "caylent", label: "Caylent" }, { id: "builder-center", label: "AWS Builder Center" }],
      counts: { all: 8, en: 6, es: 2 }, scopeId: "8".repeat(64), collectedAt: "2026-10-11T10:00:00.000Z"
    }),
    priorGroup({
      sources: [{ id: "caylent", label: "Caylent" }, { id: "builder-center", label: "AWS Builder Center" }, { id: "simple-aws", label: "Simple AWS" }],
      counts: { all: 13, en: 11, es: 2 }, scopeId: "9".repeat(64), collectedAt: "2026-10-12T10:00:00.000Z"
    }),
    priorGroup({
      sources: [
        { id: "caylent", label: "Caylent" },
        { id: "builder-center", label: "AWS Builder Center" },
        { id: "simple-aws", label: "Simple AWS" },
        { id: "cloudy-things", label: "Cloudy Things" }
      ],
      counts: { all: 18, en: 15, es: 3 }, scopeId: "a".repeat(64), collectedAt: "2026-10-13T10:00:00.000Z"
    })
  ];
  const largeTitleCanary = "synthetic-large-cloudy-post-canary";
  const oversizedBody = JSON.stringify(cloudyHashnodePage({
    rows: [cloudyArticle({ ...one, title: `${largeTitleCanary}${"x".repeat(2_200_000)}` })]
  }));
  const oversizedChunks = Array.from({ length: Math.ceil(oversizedBody.length / (64 * 1024)) }, (_, index) =>
    oversizedBody.slice(index * 64 * 1024, (index + 1) * 64 * 1024));
  const oversizedStream = hashnodeStreamingResponse(oversizedChunks);
  const scenarios = [
    {
      name: "GraphQL error after a complete earlier page",
      pages: new Map([
        [1, cloudyHashnodePage({ page: 1, totalPages: 2, rows: [one] })],
        [2, cloudyHashnodePage({ graphqlErrors: [{ message: "synthetic private GraphQL error", extensions: { code: "BAD_USER_INPUT" } }] })]
      ]),
      canaries: [one.title, one.url, "synthetic private GraphQL error"],
      expectedPages: [1, 2]
    },
    {
      name: "nonempty GraphQL errors reject otherwise valid partial data",
      pages: new Map([[1, {
        ...cloudyHashnodePage({ rows: [one] }),
        errors: [{ message: "synthetic partial-data error", extensions: { code: "BAD_USER_INPUT" } }]
      }]]),
      canaries: [one.title, one.url, "synthetic partial-data error"],
      expectedPages: [1]
    },
    {
      name: "mixed transient and permanent GraphQL errors are not retried",
      pages: new Map([[1, cloudyHashnodePage({ graphqlErrors: [
        { message: "synthetic internal error", extensions: { code: "INTERNAL_SERVER_ERROR" } },
        { message: "synthetic permanent error", extensions: { code: "BAD_USER_INPUT" } }
      ] })]]),
      canaries: ["synthetic internal error", "synthetic permanent error"],
      expectedPages: [1]
    },
    {
      name: "malformed JSON is not retried",
      pages: new Map([[1, () => cloudyHashnodeResponse('{"data":')]]),
      canaries: ["data"],
      expectedPages: [1]
    },
    { name: "missing API user", pages: new Map([[1, cloudyHashnodePage({ user: false })]]), canaries: [one.title] },
    { name: "username mismatch", pages: new Map([[1, cloudyHashnodePage({ username: "unrelated-user", rows: [one] })]]), canaries: [one.title] },
    { name: "missing public display name", pages: new Map([[1, cloudyHashnodePage({ name: null, rows: [one] })]]), canaries: [one.title] },
    { name: "missing posts connection", pages: new Map([[1, cloudyHashnodePage({ posts: false, rows: [one] })]]), canaries: [one.title] },
    { name: "missing page info", pages: new Map([[1, cloudyHashnodePage({ rows: [one], pageInfo: null })]]), canaries: [one.title] },
    {
      name: "malformed post after a valid prefix",
      pages: new Map([[1, cloudyHashnodePage({ edges: [
        { node: { title: one.title, url: one.url, publishedAt: one.publishedAt } },
        { node: { title: "Invalid post missing date", url: two.url } }
      ] })]]),
      canaries: [one.title, one.url, "Invalid post missing date", two.url]
    },
    { name: "blank title", pages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ ...one, title: " \t " })] })]]), canaries: [one.url] },
    { name: "missing publication date", pages: new Map([[1, cloudyHashnodePage({ edges: [{ node: { title: one.title, url: one.url } }] })]]), canaries: [one.title, one.url] },
    { name: "impossible publication date", pages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ ...one, publishedAt: "2025-02-30T00:00:00.000Z" })] })]]), canaries: [one.title, one.url] },
    { name: "unsafe same-host URL", pages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ ...one, url: `${cloudyArticleOrigin}/post?preview=private` })] })]]), canaries: [one.title, "preview=private"] },
    {
      name: "duplicate URL across pages",
      pages: new Map([
        [1, cloudyHashnodePage({ page: 1, totalPages: 2, rows: [one] })],
        [2, cloudyHashnodePage({ page: 2, totalPages: 2, rows: [cloudyArticle({ ...two, url: one.url })] })]
      ]),
      canaries: [one.title, two.title, one.url],
      expectedPages: [1, 2]
    },
    {
      name: "nonterminal empty page",
      pages: new Map([
        [1, cloudyHashnodePage({ page: 1, totalPages: 3, rows: [one] })],
        [2, cloudyHashnodePage({ page: 2, totalPages: 3, rows: [] })]
      ]),
      canaries: [one.title, one.url],
      expectedPages: [1, 2]
    },
    { name: "hasNextPage without a usable cursor", pages: new Map([[1, cloudyHashnodePage({ rows: [one], hasNextPage: true, endCursor: null })]]), canaries: [one.title] },
    {
      name: "repeated cursor",
      pages: new Map([
        [1, cloudyHashnodePage({ page: 1, totalPages: 2, rows: [one], endCursor: "cloudy-cursor-1" })],
        [2, cloudyHashnodePage({ page: 2, totalPages: 3, rows: [two], endCursor: "cloudy-cursor-1" })]
      ]),
      canaries: [one.title, two.title],
      expectedPages: [1, 2]
    },
    {
      name: "body exceeds the bounded JSON response size",
      pages: new Map([[1, () => oversizedStream.response]]),
      canaries: [largeTitleCanary, one.url],
      stream: oversizedStream
    },
    {
      name: "maximum cursor page count",
      pages: new Map(Array.from({ length: 11 }, (_, index) => [index + 1, cloudyHashnodePage({
        page: index + 1,
        totalPages: 11,
        rows: [cloudyArticle({ id: `cap-row-${index + 1}`, title: `Cap private title ${index + 1}` })]
      })])),
      canaries: ["Cap private title 1", "cap-row-1"],
      maxRequests: 10
    },
    {
      name: "later-page permanent HTTP failure after an earlier valid page",
      pages: new Map([
        [1, cloudyHashnodePage({ page: 1, totalPages: 2, rows: [one] })],
        [2, () => cloudyHashnodeResponse({ error: "synthetic Cloudy provider failure" }, { status: 403 })]
      ]),
      canaries: [one.title, one.url, "synthetic Cloudy provider failure"],
      expectedPages: [1, 2]
    }
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const previousArticles = previousCoverage[index % previousCoverage.length];
    const previous = priorFullOutput({ articleViews: null });
    previous.groups.articles = previousArticles;
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput({
        sources: [caylent, builder, simple, cloudy],
        curated: { talks: [talkFact(`fresh-hashnode-talk-${index}`)], books: [bookFact(`fresh-hashnode-book-${index}`)] }
      }),
      fetchFn: phaseEightApiFetch({ requestLog, hashnodePages: scenario.pages, hashnodeResponder: scenario.responder })
    });
    harness.objects.set(outputKey, JSON.stringify(previous));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(output.groups.articles, previousArticles, `${scenario.name} preserves prior coverage, scope, counts, and date`);
    assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
    assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
    assert.ok(output.groups.newsletter, "a healthy subscriber family still refreshes");
    const requests = requestLog.filter(({ kind }) => kind === "hashnode-user-posts");
    assert.ok(requests.length > 0, `${scenario.name} reaches the fixed public API`);
    if (scenario.maxRequests !== undefined) {
      assert.ok(requests.length <= scenario.maxRequests, "cursor pagination stops within the configured finite bound");
    }
    if (scenario.stream !== undefined) {
      const stats = scenario.stream.stats();
      assert.equal(scenario.stream.response.headers.get("content-length"), null);
      assert.ok(stats.chunksRead < stats.totalChunks, "the bounded reader stops before consuming the oversized response");
      assert.equal(stats.cancelled, true, "the unread body is cancelled after the size limit is exceeded");
    }
    if (scenario.expectedPages !== undefined) {
      assert.deepEqual(requests.map(({ page }) => page), scenario.expectedPages);
    }
    assertNoCloudyCanaries(harness, ...scenario.canaries, beehiivApiKey);
  }

  const absentLog = [];
  const absent = createHarness({
    input: phaseFourInput({
      sources: [caylent, builder, simple, cloudy],
      curated: { talks: [talkFact("fresh-without-prior")], books: [bookFact("fresh-book-without-prior")] }
    }),
    fetchFn: phaseEightApiFetch({
      requestLog: absentLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ graphqlErrors: [{ message: "synthetic malformed first fetch", extensions: { code: "BAD_USER_INPUT" } }] })]])
    })
  });
  await absent.handler({}, {});
  const absentOutput = await readPut(absent.putCalls[0]);
  assert.equal(Object.hasOwn(absentOutput.groups, "articles"), false,
    "a first API connection failure omits Articles instead of publishing a partial or zero count");
  assert.deepEqual(absentOutput.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(absentOutput.groups.books.counts, { all: 1, en: 1, es: 0 });
  assert.ok(absentOutput.groups.newsletter);
  assertNoCloudyCanaries(absent, "absent-prior-row", "synthetic malformed first fetch");
});

test("Cloudy Things failure and recovery recompute the complete family without blocking subscribers", async () => {
  let cloudyFails = false;
  let rows = [cloudyArticle({ id: "recovery-cloudy-one", title: "Cloudy recovery one" })];
  let posts = [beehiivPost({ id: "recovery-simple-one", title: "Simple recovery one" })];
  let subscriberCount = 10;
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput({ sources: [sourceInput().source, builderCenterSource(), simpleAwsArticleSource(), cloudyThingsSource()] }),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, () => cloudyFails
        ? cloudyHashnodeResponse("synthetic Cloudy recovery outage", { status: 503 })
        : cloudyHashnodePage({ rows })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope(posts)),
      newsletterResponder: ({ request }) => {
        const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(publicationId, subscriberCount));
      }
    })
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  const initialArticles = initial.groups.articles;
  const initialNewsletter = initial.groups.newsletter;
  assert.deepEqual(initialArticles.counts, { all: 2, en: 2, es: 0 });
  assert.equal(initialNewsletter.subscribers, 10);

  cloudyFails = true;
  posts = [...posts, beehiivPost({ id: "recovery-simple-two", title: "Simple recovery two" })];
  subscriberCount = 20;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const failed = await readPut(harness.putCalls[1]);
  assert.deepEqual(failed.groups.articles, initialArticles,
    "a Cloudy page failure retains the complete prior four-source group despite a fresh Simple AWS catalog");
  assert.equal(failed.groups.newsletter.subscribers, 20,
    "a Cloudy archive failure does not block the independent subscriber family");
  assert.equal(failed.groups.newsletter.collectedAt, "2026-10-17T12:00:00.000Z");

  cloudyFails = false;
  rows = [...rows, cloudyArticle({ id: "recovery-cloudy-two", title: "Cloudy recovery two" })];
  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[2]);
  assert.deepEqual(recovered.groups.articles.counts, { all: 4, en: 4, es: 0 },
    "recovery discovers both sources' new posts and recomputes instead of accumulating prior totals");
  assert.equal(recovered.groups.articles.scopeId, initialArticles.scopeId);
  assert.equal(recovered.groups.articles.collectedAt, "2026-10-18T12:00:00.000Z");
  assert.equal(recovered.groups.newsletter.subscribers, 20);
  assert.equal(recovered.groups.newsletter.scopeId, initialNewsletter.scopeId);
  assert.equal(requestLog.filter(({ kind }) => kind === "hashnode-user-posts").length, 4,
    "success, one failed attempt plus its single retry, and recovery all use only archive pages");
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv-posts").length, 3);
  assertNoCloudyCanaries(harness, "synthetic Cloudy recovery outage", "recovery-cloudy-one", "recovery-simple-one", beehiivApiKey);
});

test("Cloudy Hashnode rejects noncanonical article destinations while retaining the whole article family", async () => {
  const sources = [sourceInput().source, builderCenterSource(), simpleAwsArticleSource(), cloudyThingsSource()];
  const previousArticles = priorGroup({
    sources: [
      { id: "caylent", label: "Caylent" },
      { id: "builder-center", label: "AWS Builder Center" },
      { id: "simple-aws", label: "Simple AWS" },
      { id: "cloudy-things", label: "Cloudy Things" }
    ],
    counts: { all: 18, en: 15, es: 3 },
    scopeId: "f".repeat(64),
    collectedAt: "2026-10-13T10:00:00.000Z"
  });
  const valid = cloudyArticle({ id: "boundary-valid-row", slug: "boundary-valid-row", title: "Boundary valid row" });
  const cases = [
    {
      name: "non-default article port",
      page: cloudyHashnodePage({ rows: [cloudyArticle({ ...valid, url: "https://blog.guilleojeda.com:8443/boundary-port" })] }),
      canaries: [valid.title, "8443"]
    },
    {
      name: "nested article path",
      page: cloudyHashnodePage({ rows: [cloudyArticle({ ...valid, url: "https://blog.guilleojeda.com/author/boundary-nested" })] }),
      canaries: [valid.title, "author/boundary-nested"]
    },
    {
      name: "impossible ISO datetime",
      page: cloudyHashnodePage({ rows: [cloudyArticle({ ...valid, publishedAt: "2025-02-30T00:00:00.000Z" })] }),
      canaries: [valid.title, valid.url]
    },
    {
      name: "numeric datetime",
      page: cloudyHashnodePage({ rows: [cloudyArticle({ ...valid, publishedAt: "999" })] }),
      canaries: [valid.title, valid.url]
    }
  ];

  for (const scenario of cases) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput({ sources, curated: { talks: [talkFact(`boundary-talk-${scenario.name}`)], books: [bookFact(`boundary-book-${scenario.name}`)] } }),
      fetchFn: phaseEightApiFetch({
        requestLog,
        hashnodePages: new Map([[1, scenario.page]])
      })
    });
    const previous = priorFullOutput({ articleViews: null });
    previous.groups.articles = previousArticles;
    harness.objects.set(outputKey, JSON.stringify(previous));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(output.groups.articles, previousArticles, `${scenario.name} retains the complete prior article family`);
    assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 }, `${scenario.name} refreshes healthy talks`);
    assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 }, `${scenario.name} refreshes healthy books`);
    assert.ok(output.groups.newsletter, `${scenario.name} refreshes the healthy subscriber family`);
    assert.ok(requestLog.some(({ kind }) => kind === "hashnode-user-posts"), `${scenario.name} reaches the fixed Cloudy API`);
    assertNoCloudyCanaries(harness, ...scenario.canaries, beehiivApiKey);
  }
});

test("input 7 supports directory-only traffic and sends five bounded, all-path aggregate reports", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => jsonResponse(ga4Report({
        views: 0,
        timeZone: request.url.includes(`/properties/${directoryGooglePropertyId}:`)
          ? directoryTimeZone
          : googleTimeZone
      }))
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.equal(output.schemaVersion, 1);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "directoryViews", "talks"]);
  const reports = googleRequests(requestLog, "google-report");
  assert.equal(reports.length, 5);
  assert.deepEqual(reports.map((request) => [reportRange(request).startDate, reportRange(request).endDate]), [
    ["2026-10-11", "2026-10-17"],
    ["2026-09-18", "2026-10-17"],
    ["2026-07-20", "2026-10-17"],
    ["2025-10-18", "2026-10-17"],
    ["2026-01-01", "2026-10-17"]
  ], "the verified Buenos Aires timezone and three-closed-day lag define all five supported periods");
  const expectedHostFilter = {
    fieldName: "hostName",
    stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true }
  };
  for (const request of reports) {
    assertGoogleRequest(request, "Dónde Aprendo AWS Analytics request");
    assert.equal(request.url, `https://analyticsdata.googleapis.com/v1beta/properties/${directoryGooglePropertyId}:runReport`);
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${googleAccessToken}`);
    assert.deepEqual(request.json.metrics, [{ name: "screenPageViews" }]);
    assert.deepEqual(googleFilterLeaves(request.json.dimensionFilter), [expectedHostFilter],
      "only the exact host is filtered, leaving every path in scope");
    assert.deepEqual(Object.keys(request.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);
    assert.equal(Object.hasOwn(request.json, "dimensions"), false);
    assert.equal(JSON.stringify(request.json).includes("browserLanguage"), false);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }
  const group = output.groups.directoryViews;
  assert.deepEqual(Object.keys(group).sort(), ["definitionVersion", "records"]);
  assert.equal(group.definitionVersion, 1);
  assert.deepEqual(Object.keys(group.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.equal(Object.hasOwn(group.records, "total"), false, "a directory lifetime total is not inferred");
  for (const record of Object.values(group.records)) {
    assert.deepEqual(Object.keys(record).sort(), ["basis", "collectedAt", "endDate", "publication", "qualifications", "scopeId", "startDate", "timeZone", "views"]);
    assert.equal(record.basis, "period");
    assert.equal(record.collectedAt, "2026-10-20T16:45:46.000Z");
    assert.equal(record.timeZone, directoryTimeZone);
    assert.deepEqual(record.publication, { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS", language: "es" });
    assert.equal(record.views, 0, "an explicit numeric zero is measured data");
    assert.deepEqual(record.qualifications, []);
    assert.match(record.scopeId, /^[a-f0-9]{64}$/);
  }
  assert.equal(googleRequests(requestLog, "google-oauth").length, 1);
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  assert.deepEqual(harness.secretCalls, [], "directory-only input does not retrieve a Beehiiv secret");
  assert.equal(requestLog.some(({ kind }) => kind.startsWith("beehiiv")), false);
  assert.equal(Object.hasOwn(output.groups, "newsletter"), false);
  assert.equal(Object.hasOwn(output.groups, "articleViews"), false);
  assert.equal(Object.hasOwn(output.groups, "articleSearchClicks"), false);
  assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleAccessToken,
    googleOAuthParameterArn, directoryGooglePropertyId, directoryHostname);
});

test("input 9 adds the Views recorded total to directory-only collection without a Newsletter dependency", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const recordedSince = "2024-01-21";
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => jsonResponse(ga4Report({
        views: reportRange(request).startDate === recordedSince ? 24378 : 75,
        timeZone: directoryTimeZone
      }))
    })
  });

  await harness.handler({}, {});
  const baseline = await readPut(harness.putCalls[0]);
  assert.equal(googleRequests(requestLog, "google-report").length, 5);
  assert.equal(Object.hasOwn(baseline.groups.directoryViews.records, "total"), false);

  harness.setInput(phaseTwelveInput({ baseInput: phaseThreeInput() }));
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  const reports = googleRequests(requestLog, "google-report").slice(5);
  assert.equal(reports.length, 6, "input9 adds one Views aggregate to the five existing period reports");
  assert.deepEqual(reports.map((request) => reportRange(request)), [
    { startDate: "2026-10-11", endDate: "2026-10-17" },
    { startDate: "2026-09-18", endDate: "2026-10-17" },
    { startDate: "2026-07-20", endDate: "2026-10-17" },
    { startDate: "2025-10-18", endDate: "2026-10-17" },
    { startDate: "2026-01-01", endDate: "2026-10-17" },
    { startDate: recordedSince, endDate: "2026-10-17" }
  ]);
  const totalRequest = reports.at(-1);
  assertGoogleRequest(totalRequest, "directory Views recorded-total request");
  assert.equal(totalRequest.url, `https://analyticsdata.googleapis.com/v1beta/properties/${directoryGooglePropertyId}:runReport`);
  assert.deepEqual(totalRequest.json.metrics, [{ name: "screenPageViews" }]);
  assert.deepEqual(googleFilterLeaves(totalRequest.json.dimensionFilter), [{
    fieldName: "hostName",
    stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true }
  }]);
  assert.deepEqual(Object.keys(totalRequest.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);
  assert.equal(Object.hasOwn(totalRequest.json, "dimensions"), false);

  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "directoryViews", "talks"]);
  assert.deepEqual(output.groups.directoryViews.records.total, {
    basis: "recorded-total",
    collectedAt: "2026-10-20T16:45:46.000Z",
    endDate: "2026-10-17",
    publication: { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS", language: "es" },
    qualifications: [],
    scopeId: output.groups.directoryViews.records.total.scopeId,
    startDate: recordedSince,
    timeZone: directoryTimeZone,
    views: 24378
  });
  assert.match(output.groups.directoryViews.records.total.scopeId, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(output.groups.directoryViews.records).sort(), ["12m", "30d", "7d", "90d", "total", "ytd"]);
  const { total: _total, ...periodRecords } = output.groups.directoryViews.records;
  assert.deepEqual(periodRecords, baseline.groups.directoryViews.records,
    "all five ordinary directory records and their scopes remain byte-identical");
  assert.equal(Object.hasOwn(output.groups, "newsletter"), false);
  assert.equal(Object.hasOwn(output.groups, "articleViews"), false);
  assert.equal(Object.hasOwn(output.groups, "articleSearchClicks"), false);
  assert.deepEqual(harness.secretCalls, [], "directory-only input9 has no Beehiiv dependency");
  assert.equal(requestLog.some(({ kind }) => kind.startsWith("beehiiv")), false);
  assert.equal(Object.hasOwn(output.groups, "directoryOutboundClicks"), false);

  const earlyClock = createClock("2024-01-23T12:00:00.000Z");
  const earlyLog = [];
  const earlyHarness = createHarness({
    input: phaseTwelveInput({ baseInput: phaseThreeInput() }),
    clock: earlyClock,
    fetchFn: phaseFiveApiFetch({ requestLog: earlyLog })
  });
  await earlyHarness.handler({}, {});
  const early = await readPut(earlyHarness.putCalls[0]);
  assert.equal(googleRequests(earlyLog, "google-report").length, 0,
    "a recorded-history start after the three-closed-day end has no eligible total or shortened periods");
  if (early.groups.directoryViews) assert.deepEqual(Object.keys(early.groups.directoryViews.records), []);
});

test("malformed directory selectors fail before any provider or credential work", async () => {
  const valid = phaseNineDirectoryAnalytics();
  const { timeZone: _timeZone, ...missingTimeZone } = valid;
  const malformed = [
    { ...valid, privateNote: "directory selector canary" },
    { ...valid, propertyId: "not-a-decimal-property" },
    { ...valid, hostname: "www.dondeaprendoaws.com" },
    { ...valid, language: "en" },
    { ...valid, timeZone: "+03:00" },
    missingTimeZone
  ];
  for (const directoryAnalytics of malformed) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseNineInput({ baseInput: phaseThreeInput(), directoryAnalytics }),
      fetchFn: phaseFiveApiFetch({ requestLog })
    });
    const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
    harness.objects.set(outputKey, previous);
    await assert.rejects(() => harness.handler({}, {}), (error) => error.code !== "INPUT_VERSION_UNSUPPORTED",
      "the malformed selector must reach input-7 selector validation, not merely fail because input 7 is unsupported");
    assert.equal(harness.putCalls.length, 0);
    assert.equal(harness.objects.get(outputKey), previous);
    assert.deepEqual(requestLog, [], "selector validation precedes all provider requests");
    assert.deepEqual(harness.secretCalls, []);
    assert.deepEqual(harness.parameterCalls, [], "invalid configuration is rejected before Google credentials");
  }
});

test("directory reports retain and recover per period while sharing OAuth with Simple AWS views and Search", async () => {
  let failDirectory30d = false;
  let oauthFails = false;
  let directoryViews = 0;
  let simpleViews = 51;
  let searchClicks = 61;
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const cloudy = cloudyArticle({ id: "phase-nine-cloudy-row", title: "Phase Nine four-source proof" });
  const harness = createHarness({
    input: phaseNineInput(),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudy] })]]),
      tokenResponder: () => oauthFails
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" }),
      reportResponder: ({ request }) => {
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        const range = reportRange(request);
        const daySpan = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000;
        if (isDirectory && failDirectory30d && daySpan === 29) return jsonResponse({ error: googleResponseCanary }, 403);
        return jsonResponse(ga4Report({
          views: isDirectory ? directoryViews : simpleViews,
          timeZone: isDirectory ? directoryTimeZone : googleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: searchClicks })),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20, 88))
    })
  });

  const requestCountFrom = (start, kind) => googleRequests(requestLog.slice(start), kind);
  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(first.groups).sort(), ["articleSearchClicks", "articleViews", "articles", "books", "directoryViews", "newsletter", "newsletterEmailsSent", "talks"]);
  assert.deepEqual(first.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" },
    { id: "cloudy-things", label: "Cloudy Things" }
  ], "input 7 preserves the complete current four-source article family");
  assert.deepEqual(first.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.equal(requestCountFrom(0, "google-oauth").length, 1, "all three Google families share one invocation-local OAuth refresh");
  assert.equal(requestCountFrom(0, "google-report").length, 10, "Simple AWS and Dónde each request five periods");
  assert.equal(requestCountFrom(0, "google-search").length, 5);
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }],
    "two Analytics properties and Search still retrieve one shared OAuth parameter");
  assert.equal(first.groups.directoryViews.records["7d"].views, 0);
  assert.equal(first.groups.articleViews.records["7d"].views, simpleViews);
  assert.equal(first.groups.articleSearchClicks.records["7d"].clicks, searchClicks);

  failDirectory30d = true;
  directoryViews = 73;
  simpleViews = 82;
  searchClicks = 92;
  clock.set("2026-10-21T16:45:46.000Z");
  const secondStart = requestLog.length;
  const secondParameterStart = harness.parameterCalls.length;
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[1]);
  assert.deepEqual(retained.groups.directoryViews.records["30d"], first.groups.directoryViews.records["30d"],
    "a Dónde report error retains only its exact old interval, scope, value and collection date");
  assert.equal(retained.groups.directoryViews.records["7d"].views, 73);
  assert.equal(retained.groups.directoryViews.records["7d"].collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(retained.groups.articleViews.records["30d"].views, 82, "Simple AWS views refresh beside a Dónde failure");
  assert.equal(retained.groups.articleSearchClicks.records["30d"].clicks, 92, "Search refreshes beside a Dónde failure");
  assert.equal(requestCountFrom(secondStart, "google-oauth").length, 1);
  assert.equal(harness.parameterCalls.length - secondParameterStart, 1);

  failDirectory30d = false;
  directoryViews = 101;
  clock.set("2026-10-22T16:45:46.000Z");
  const thirdStart = requestLog.length;
  const thirdParameterStart = harness.parameterCalls.length;
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[2]);
  assert.equal(recovered.groups.directoryViews.records["30d"].views, 101, "recovery replaces rather than accumulates counts");
  assert.equal(recovered.groups.directoryViews.records["30d"].collectedAt, "2026-10-22T16:45:46.000Z");
  assert.equal(requestCountFrom(thirdStart, "google-oauth").length, 1);
  assert.equal(harness.parameterCalls.length - thirdParameterStart, 1);

  oauthFails = true;
  clock.set("2026-10-23T16:45:46.000Z");
  const fourthStart = requestLog.length;
  const fourthParameterStart = harness.parameterCalls.length;
  await harness.handler({}, {});
  const sharedFailure = await readPut(harness.putCalls[3]);
  for (const group of ["directoryViews", "articleViews", "articleSearchClicks"]) {
    assert.deepEqual(sharedFailure.groups[group], recovered.groups[group], `${group} retains its own prior records on shared OAuth failure`);
  }
  assert.equal(sharedFailure.groups.articles.collectedAt, "2026-10-23T16:45:46.000Z", "non-Google inventory still refreshes");
  assert.equal(sharedFailure.groups.newsletter.collectedAt, "2026-10-23T16:45:46.000Z", "non-Google subscriber data still refreshes");
  assert.equal(requestCountFrom(fourthStart, "google-oauth").length, 1);
  assert.equal(harness.parameterCalls.length - fourthParameterStart, 1);
  assert.equal(requestCountFrom(fourthStart, "google-report").length, 0);
  assert.equal(requestCountFrom(fourthStart, "google-search").length, 0);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("directory report failure without a usable prior omits only that family", async () => {
  const requestLog = [];
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseSevenInput() }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => request.url.includes(`/properties/${directoryGooglePropertyId}:`)
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: 44, timeZone: googleTimeZone })),
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 55 })),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([]))
    })
  });
  harness.objects.set(outputKey, JSON.stringify(previous));

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(output.groups, "directoryViews"), false,
    "an unavailable new family is omitted when there is no valid prior directory record");
  assert.equal(output.groups.articleViews.records["7d"].views, 44);
  assert.equal(output.groups.articleSearchClicks.records["7d"].clicks, 55);
  assert.equal(output.groups.articles.collectedAt, "2026-10-16T12:00:00.000Z");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("directory report validation keeps qualified aggregates and rejects wrong-timezone, noninteger, and truncated results", async () => {
  let exerciseInvalidReports = false;
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const range = reportRange(request);
        const daySpan = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000;
        const qualifications = daySpan === 6 ? {
          samplingMetadatas: [{ samplesReadCount: "10", samplingSpaceSize: "20" }],
          subjectToThresholding: true,
          dataLossFromOtherRow: true
        } : {};
        const timeZone = exerciseInvalidReports && daySpan === 29 ? "UTC" : directoryTimeZone;
        const response = ga4Report({ views: 55, timeZone, metadata: qualifications });
        if (exerciseInvalidReports && daySpan === 89) response.rows[0].metricValues[0].value = "1.5";
        if (exerciseInvalidReports && daySpan === 364) response.metadata.dataTruncationReasons = ["DATE_RANGE"];
        return jsonResponse(response);
      }
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const original = structuredClone(first);
  assert.deepEqual(first.groups.directoryViews.records["7d"].qualifications, ["sampled", "thresholding", "other-row"]);
  assert.deepEqual(first.groups.directoryViews.records["30d"].qualifications, []);

  original.groups.directoryViews.records["30d"].providerPropertyId = directoryGooglePropertyId;
  harness.objects.set(outputKey, JSON.stringify(original));
  exerciseInvalidReports = true;
  clock.set("2026-10-21T16:45:46.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  const records = second.groups.directoryViews.records;
  assert.equal(Object.hasOwn(records, "30d"), false, "a malformed prior cannot be republished after a wrong-timezone response");
  assert.deepEqual(records["90d"], original.groups.directoryViews.records["90d"],
    "a noninteger current result retains its valid previous period exactly");
  assert.deepEqual(records["12m"], original.groups.directoryViews.records["12m"],
    "a truncated current result retains its valid previous period exactly");
  assert.deepEqual(records["7d"].qualifications, ["sampled", "thresholding", "other-row"]);
  assertNoGoogleCanaries(harness, directoryGooglePropertyId, googleResponseCanary);
});

test("directory scope is independent of article selectors and disappears when disabled", async () => {
  const requestLog = [];
  let postRows = [beehiivPost({ id: "scope-one", title: "Directory-independent one" })];
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseSevenInput() }),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      postsResponder: () => jsonResponse(beehiivPostsEnvelope(postRows)),
      reportResponder: ({ request }) => jsonResponse(ga4Report({
        views: 42,
        timeZone: request.url.includes(`/properties/${directoryGooglePropertyId}:`) || request.url.includes("/properties/987654321:")
          ? directoryTimeZone
          : googleTimeZone
      })),
      newsletterResponder: ({ request }) => {
        const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(publicationId, 12));
      }
    })
  });
  const metricScopes = (output) => ({
    directory: Object.fromEntries(Object.entries(output.groups.directoryViews.records).map(([period, record]) => [period, record.scopeId])),
    articleViews: Object.fromEntries(Object.entries(output.groups.articleViews.records).map(([period, record]) => [period, record.scopeId])),
    search: Object.fromEntries(Object.entries(output.groups.articleSearchClicks.records).map(([period, record]) => [period, record.scopeId])),
    newsletter: output.groups.newsletter.scopeId
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const initialScopes = metricScopes(first);
  const reorderedSources = [simpleAwsArticleSource(), builderCenterSource(), sourceInput().source];
  const rotatedArn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic-directory-independent-rotated-key";
  harness.setSecretResponse(rotatedArn, { SecretString: JSON.stringify({ apiKey: "synthetic-directory-independent-rotated-key-value" }) });
  harness.env.BEEHIIV_API_KEY_SECRET_ARN = rotatedArn;
  postRows = [
    ...postRows,
    beehiivPost({ id: "scope-two", title: "New remote article does not change metric scope" })
  ];
  harness.setInput(phaseNineInput({ baseInput: phaseSevenInput({ sources: reorderedSources }) }));
  await harness.handler({}, {});
  const reordered = await readPut(harness.putCalls[1]);
  assert.deepEqual(metricScopes(reordered), initialScopes,
    "source order, Beehiiv key/ARN rotation, and remote post changes leave directory and existing independent metric scopes unchanged");
  assert.notEqual(reordered.groups.articles.counts.all, first.groups.articles.counts.all);

  harness.setInput(phaseNineInput({
    baseInput: phaseSevenInput({
      sources: reorderedSources,
      analytics: phaseFiveAnalytics({ propertyId: "555555555" })
    })
  }));
  await harness.handler({}, {});
  const changedSimpleProperty = await readPut(harness.putCalls[2]);
  assert.deepEqual(Object.fromEntries(Object.entries(changedSimpleProperty.groups.directoryViews.records).map(([period, record]) => [period, record.scopeId])), initialScopes.directory,
    "changing the Simple AWS Analytics selector leaves Dónde scope independent");
  assert.notDeepEqual(Object.fromEntries(Object.entries(changedSimpleProperty.groups.articleViews.records).map(([period, record]) => [period, record.scopeId])), initialScopes.articleViews);
  assert.deepEqual(Object.fromEntries(Object.entries(changedSimpleProperty.groups.articleSearchClicks.records).map(([period, record]) => [period, record.scopeId])), initialScopes.search);

  const changedPublicationId = "synthetic-second-newsletter-publication";
  harness.setInput(phaseNineInput({
    baseInput: phaseSevenInput({
      sources: reorderedSources,
      newsletter: { id: "simple-aws", publicationId: changedPublicationId, language: "en" }
    })
  }));
  await harness.handler({}, {});
  const changedNewsletter = await readPut(harness.putCalls[3]);
  assert.deepEqual(Object.fromEntries(Object.entries(changedNewsletter.groups.directoryViews.records).map(([period, record]) => [period, record.scopeId])), initialScopes.directory,
    "changing the shared newsletter publication selector does not change Dónde scope");
  assert.notEqual(changedNewsletter.groups.newsletter.scopeId, initialScopes.newsletter);
  assert.notEqual(changedNewsletter.groups.articles.scopeId, reordered.groups.articles.scopeId);
  assert.deepEqual(Object.fromEntries(Object.entries(changedNewsletter.groups.articleViews.records).map(([period, record]) => [period, record.scopeId])), initialScopes.articleViews);
  assert.deepEqual(Object.fromEntries(Object.entries(changedNewsletter.groups.articleSearchClicks.records).map(([period, record]) => [period, record.scopeId])), initialScopes.search);

  harness.setInput(phaseNineInput({
    baseInput: phaseSevenInput({ sources: reorderedSources }),
    directoryAnalytics: phaseNineDirectoryAnalytics({ propertyId: "987654321" })
  }));
  await harness.handler({}, {});
  const changedDirectory = await readPut(harness.putCalls[4]);
  for (const period of Object.keys(initialScopes.directory)) {
    assert.notEqual(changedDirectory.groups.directoryViews.records[period].scopeId, initialScopes.directory[period],
      "changing the directory property changes its own semantic scope");
    assert.equal(changedDirectory.groups.articleViews.records[period].scopeId, initialScopes.articleViews[period]);
    assert.equal(changedDirectory.groups.articleSearchClicks.records[period].scopeId, initialScopes.search[period]);
  }
  assert.equal(changedDirectory.groups.newsletter.scopeId, initialScopes.newsletter);

  const disabledStart = requestLog.length;
  harness.setInput(phaseSevenInput({ sources: reorderedSources }));
  await harness.handler({}, {});
  const disabled = await readPut(harness.putCalls[5]);
  assert.equal(Object.hasOwn(disabled.groups, "directoryViews"), false, "removing the selector removes the family");
  assert.ok(googleRequests(requestLog.slice(disabledStart), "google-report").every((request) => request.url.includes(`/properties/${googlePropertyId}:`)),
    "disabled directory analytics makes no Dónde property request");
  assert.deepEqual(Object.fromEntries(Object.entries(disabled.groups.articleViews.records).map(([period, record]) => [period, record.scopeId])), initialScopes.articleViews);
  assert.deepEqual(Object.fromEntries(Object.entries(disabled.groups.articleSearchClicks.records).map(([period, record]) => [period, record.scopeId])), initialScopes.search);
  assert.equal(disabled.groups.newsletter.scopeId, initialScopes.newsletter);
});

test("directory YTD is not retained across the year boundary when the lag ends in the prior year", async () => {
  const requestLog = [];
  const clock = createClock("2025-12-30T16:00:00.000Z");
  const harness = createHarness({
    input: phaseNineInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: () => jsonResponse(ga4Report({ views: 7, timeZone: directoryTimeZone }))
    })
  });
  await harness.handler({}, {});
  const prior = await readPut(harness.putCalls[0]);
  assert.equal(prior.groups.directoryViews.records.ytd.startDate, "2025-01-01");

  clock.set("2026-01-03T16:00:00.000Z");
  const secondInvocationStart = requestLog.length;
  await harness.handler({}, {});
  const current = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(current.groups.directoryViews.records, "ytd"), false,
    "the prior year's YTD record is not relabeled when the three-day lag has not reached January 1");
  const currentReports = googleRequests(requestLog.slice(secondInvocationStart), "google-report");
  assert.equal(currentReports.some((request) => reportRange(request).startDate === "2026-01-01" && reportRange(request).endDate === "2025-12-31"), false);
});

test("input 8 collects only safe aggregate outbound clicks for the exact directory host across five periods", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseTenInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? 0 : 19,
          metricName,
          timeZone: directoryTimeZone
        }));
      }
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "directoryOutboundClicks", "directoryViews", "talks"]);
  const reports = googleRequests(requestLog, "google-report");
  const clickReports = reports.filter((request) => request.json.metrics?.[0]?.name === "eventCount");
  assert.equal(reports.length, 10, "directory page views and outbound clicks each request the five supported periods");
  assert.equal(clickReports.length, 5);
  assert.deepEqual(clickReports.map((request) => reportRange(request)), [
    { startDate: "2026-10-11", endDate: "2026-10-17" },
    { startDate: "2026-09-18", endDate: "2026-10-17" },
    { startDate: "2026-07-20", endDate: "2026-10-17" },
    { startDate: "2025-10-18", endDate: "2026-10-17" },
    { startDate: "2026-01-01", endDate: "2026-10-17" }
  ], "click reports use the existing timezone, five windows, and three-closed-day lag");

  const expectedFilters = [
    { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true } },
    { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "click", caseSensitive: true } },
    { fieldName: "outbound", stringFilter: { matchType: "EXACT", value: "true", caseSensitive: true } }
  ];
  for (const request of clickReports) {
    assertGoogleRequest(request, "Dónde Aprendo AWS outbound-click Analytics request");
    assert.equal(request.url, `https://analyticsdata.googleapis.com/v1beta/properties/${directoryGooglePropertyId}:runReport`);
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${googleAccessToken}`);
    assert.deepEqual(request.json.metrics, [{ name: "eventCount" }]);
    assert.deepEqual(googleFilterLeaves(request.json.dimensionFilter).sort((left, right) => left.fieldName.localeCompare(right.fieldName)),
      expectedFilters.sort((left, right) => left.fieldName.localeCompare(right.fieldName)),
      "only exact case-sensitive host, click event, and outbound=true filters define the aggregate");
    assert.equal(request.json.dimensionFilter.andGroup.expressions.length, 3);
    assert.deepEqual(Object.keys(request.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);
    assert.equal(Object.hasOwn(request.json, "dimensions"), false, "the request returns no path or destination rows");
    assert.equal(JSON.stringify(request.json).includes("pagePath"), false);
    assert.equal(JSON.stringify(request.json).includes("destination"), false);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
  }

  const group = output.groups.directoryOutboundClicks;
  assert.deepEqual(Object.keys(group).sort(), ["definitionVersion", "records"]);
  assert.equal(group.definitionVersion, 1);
  assert.deepEqual(Object.keys(group.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.equal(Object.hasOwn(group.records, "total"), false);
  assert.equal(new Set(Object.values(group.records).map((record) => record.scopeId)).size, 1,
    "periods share one click-scope fingerprint independent of dates and values");
  for (const record of Object.values(group.records)) {
    assert.deepEqual(Object.keys(record).sort(), ["basis", "clicks", "collectedAt", "endDate", "publication", "qualifications", "scopeId", "startDate", "timeZone"]);
    assert.equal(record.basis, "period");
    assert.equal(record.collectedAt, "2026-10-20T16:45:46.000Z");
    assert.equal(record.timeZone, directoryTimeZone);
    assert.deepEqual(record.publication, { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS", language: "es" });
    assert.equal(record.clicks, 0, "an explicit integer zero is measured data");
    assert.ok(Number.isSafeInteger(record.clicks) && record.clicks >= 0);
    assert.deepEqual(record.qualifications, []);
    assert.match(record.scopeId, /^[a-f0-9]{64}$/);
  }
  assert.equal(googleRequests(requestLog, "google-oauth").length, 1);
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  assert.deepEqual(harness.secretCalls, [], "directory-only input 8 has no Beehiiv dependency");
  assert.equal(requestLog.some(({ kind }) => kind.startsWith("beehiiv")), false);
  assert.equal(Object.hasOwn(output.groups, "newsletter"), false);
  assert.equal(Object.hasOwn(output.groups, "articleViews"), false);
  assert.equal(Object.hasOwn(output.groups, "articleSearchClicks"), false);
  assertNoGoogleCanaries(harness, googleClientId, googleClientSecret, googleRefreshToken, googleAccessToken,
    googleOAuthParameterArn, directoryGooglePropertyId, directoryHostname);
  const publicJson = JSON.stringify(output);
  for (const providerDetail of ["eventCount", "hostName", "outbound", "pagePath", "browserLanguage", "destination"]) {
    assert.equal(publicJson.includes(providerDetail), false, `the aggregate must omit provider detail ${providerDetail}`);
  }
});

test("invalid input-8 outbound-click selectors reject before provider, credentials, or output work", async () => {
  const valid = phaseTenInput({ baseInput: phaseThreeInput() });
  const missingFlag = structuredClone(valid);
  delete missingFlag.directoryAnalytics.outboundClicks;
  const malformed = [
    { name: "missing selection", input: missingFlag },
    { name: "false selection", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, outboundClicks: false } } },
    { name: "null selection", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, outboundClicks: null } } },
    { name: "string selection", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, outboundClicks: "true" } } },
    { name: "unknown selector field", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, privateNote: "selector-canary" } } },
    { name: "unknown root field", input: { ...structuredClone(valid), privateNote: "root-canary" } }
  ];

  for (const { name, input } of malformed) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    const previous = JSON.stringify(priorFullOutput());
    harness.objects.set(outputKey, previous);
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED", `${name} must reach input-8 schema validation`);
      return true;
    });
    assert.deepEqual(harness.getCalls.map(({ Key }) => Key), [inputKey], `${name} must not read the current aggregate`);
    assert.deepEqual(requestLog, [], `${name} must not make provider calls`);
    assert.deepEqual(harness.secretCalls, []);
    assert.deepEqual(harness.parameterCalls, []);
    assert.equal(harness.putCalls.length, 0);
    assert.equal(harness.objects.get(outputKey), previous, `${name} must leave current.json byte-for-byte unchanged`);
  }
});

test("input 9 requires its own valid directory history date while inputs 7 and 8 keep their old shapes", async () => {
  const valid = phaseTwelveInput({ baseInput: phaseThreeInput() });
  const missingDate = structuredClone(valid);
  delete missingDate.directoryAnalytics.recordedSince;
  const malformed = [
    { name: "missing input9 date", input: missingDate },
    { name: "malformed input9 date", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, recordedSince: "2024-2-21" } } },
    { name: "non-real input9 date", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, recordedSince: "2024-02-30" } } },
    { name: "false click flag", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, outboundClicks: false } } },
    { name: "unknown input9 selector", input: { ...structuredClone(valid), directoryAnalytics: { ...valid.directoryAnalytics, privateNote: "selector-canary" } } },
    {
      name: "date on input7",
      input: phaseNineInput({
        baseInput: phaseThreeInput(),
        directoryAnalytics: { ...phaseNineDirectoryAnalytics(), recordedSince: "2024-01-21" }
      })
    },
    {
      name: "date on input8",
      input: phaseTenInput({
        baseInput: phaseThreeInput(),
        directoryAnalytics: { ...phaseNineDirectoryAnalytics(), outboundClicks: true, recordedSince: "2024-01-21" }
      })
    }
  ];

  for (const { name, input } of malformed) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseFiveApiFetch({ requestLog }) });
    const previous = JSON.stringify(priorFullOutput());
    harness.objects.set(outputKey, previous);
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED", `${name} must be rejected by supported-version or selector validation`);
      return true;
    });
    assert.deepEqual(harness.getCalls.map(({ Key }) => Key), [inputKey], `${name} is rejected after reading only protected input`);
    assert.deepEqual(requestLog, [], `${name} must not call providers`);
    assert.deepEqual(harness.secretCalls, []);
    assert.deepEqual(harness.parameterCalls, []);
    assert.equal(harness.putCalls.length, 0);
    assert.equal(harness.objects.get(outputKey), previous, `${name} leaves current.json byte-for-byte unchanged`);
  }
});

test("input 8 adds outbound clicks to four-source collection with one shared Google credential refresh", async () => {
  const requestLog = [];
  const cloudy = cloudyArticle({ id: "phase-ten-cloudy-row", title: "Phase Ten four-source proof" });
  const harness = createHarness({
    input: phaseTenInput(),
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudy] })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20)),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? 23 : isDirectory ? 31 : 41,
          metricName,
          timeZone: isDirectory ? directoryTimeZone : googleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 51 }))
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" },
    { id: "cloudy-things", label: "Cloudy Things" }
  ]);
  assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.equal(output.groups.newsletter.subscribers, 20);
  assert.equal(output.groups.articleViews.records["7d"].views, 41);
  assert.equal(output.groups.directoryViews.records["7d"].views, 31);
  assert.equal(output.groups.directoryOutboundClicks.records["7d"].clicks, 23);
  assert.equal(output.groups.articleSearchClicks.records["7d"].clicks, 51);
  assert.equal(googleRequests(requestLog, "google-report").length, 15,
    "Simple AWS views, directory views, and directory clicks each request five periods");
  assert.equal(googleRequests(requestLog, "google-report").filter(({ json }) => json.metrics?.[0]?.name === "eventCount").length, 5);
  assert.equal(googleRequests(requestLog, "google-search").length, 5);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 1);
  assert.deepEqual(harness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }],
    "all enabled Google families share one SSM read");
  assert.equal(harness.secretCalls.length, 2);
});

test("input 9 adds both directory totals to the existing collection with sent totals and preserves existing scopes", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T12:00:00.000Z");
  const articleRecordedSince = "2023-05-02";
  const directoryRecordedSince = "2024-01-21";
  const articleTimeZone = googleTimeZone;
  const directorySelection = { ...phaseNineDirectoryAnalytics(), outboundClicks: true };
  const articleSelection = phaseFiveAnalytics({ recordedSince: articleRecordedSince });
  const cloudy = cloudyArticle({ id: "phase-twelve-cloudy-row", title: "Phase Twelve four-source proof" });
  const harness = createHarness({
    input: phaseTenInput({ analytics: articleSelection, directoryAnalytics: directorySelection }),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudy] })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20, 88)),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const range = reportRange(request);
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        if (isDirectory && range.startDate === directoryRecordedSince) {
          return jsonResponse(ga4Report({
            views: metricName === "eventCount" ? 2272 : 24378,
            metricName,
            timeZone: directoryTimeZone
          }));
        }
        if (!isDirectory && range.startDate === articleRecordedSince) {
          return jsonResponse(ga4Report({ views: 131598, metricName, timeZone: articleTimeZone }));
        }
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? 23 : isDirectory ? 31 : 41,
          metricName,
          timeZone: isDirectory ? directoryTimeZone : articleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 51 }))
    })
  });

  await harness.handler({}, {});
  const input8 = await readPut(harness.putCalls[0]);
  const previousReportCount = googleRequests(requestLog, "google-report").length;
  assert.equal(previousReportCount, 16, "input8 retains its existing article total and five periods for each directory metric");
  assert.equal(input8.groups.articleViews.records.total.views, 131598);
  assert.deepEqual(Object.keys(input8.groups.directoryViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.deepEqual(Object.keys(input8.groups.directoryOutboundClicks.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);

  const input9 = phaseTwelveInput({ analytics: articleSelection, directoryAnalytics: directorySelection });
  harness.setInput(input9);
  const oauthStart = googleRequests(requestLog, "google-oauth").length;
  const parameterStart = harness.parameterCalls.length;
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  const reports = googleRequests(requestLog, "google-report").slice(previousReportCount);
  assert.equal(reports.length, 18, "the two directory totals add exactly two aggregate requests");
  const totals = reports.filter(({ url, json }) => url.includes(`/properties/${directoryGooglePropertyId}:`)
    && reportRange({ json }).startDate === directoryRecordedSince);
  assert.equal(totals.length, 2);
  assert.equal(googleRequests(requestLog, "google-oauth").length - oauthStart, 1);
  assert.equal(harness.parameterCalls.length - parameterStart, 1, "input9 still uses one shared Google credential refresh");
  assert.deepEqual(output.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" },
    { id: "cloudy-things", label: "Cloudy Things" }
  ]);
  assert.deepEqual(Object.keys(output.groups).sort(), [
    "articleSearchClicks", "articleViews", "articles", "books", "directoryOutboundClicks", "directoryViews", "newsletter", "newsletterEmailsSent", "talks"
  ]);
  assert.equal(output.schemaVersion, 1);

  const viewsRequest = totals.find(({ json }) => json.metrics[0].name === "screenPageViews");
  const clicksRequest = totals.find(({ json }) => json.metrics[0].name === "eventCount");
  assert.ok(viewsRequest);
  assert.ok(clicksRequest);
  assert.deepEqual(clicksRequest.json.dimensionFilter, {
    andGroup: {
      expressions: [
        { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true } } },
        { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "click", caseSensitive: true } } },
        { filter: { fieldName: "outbound", stringFilter: { matchType: "EXACT", value: "true", caseSensitive: true } } }
      ]
    }
  }, "the click total combines host, click event, and outbound selection with AND semantics");
  for (const request of totals) {
    assertGoogleRequest(request, "directory recorded-total request");
    assert.deepEqual(reportRange(request), { startDate: directoryRecordedSince, endDate: "2026-10-17" });
    assert.deepEqual(Object.keys(request.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);
    assert.equal(Object.hasOwn(request.json, "dimensions"), false);
  }
  assert.deepEqual(viewsRequest.json.metrics, [{ name: "screenPageViews" }]);
  assert.deepEqual(googleFilterLeaves(viewsRequest.json.dimensionFilter), [{
    fieldName: "hostName",
    stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true }
  }]);
  assert.deepEqual(clicksRequest.json.metrics, [{ name: "eventCount" }]);
  assert.deepEqual(googleFilterLeaves(clicksRequest.json.dimensionFilter).sort((left, right) => left.fieldName.localeCompare(right.fieldName)), [
    { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "click", caseSensitive: true } },
    { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: directoryHostname, caseSensitive: true } },
    { fieldName: "outbound", stringFilter: { matchType: "EXACT", value: "true", caseSensitive: true } }
  ]);

  for (const [groupName, valueKey, expected] of [
    ["directoryViews", "views", 24378],
    ["directoryOutboundClicks", "clicks", 2272]
  ]) {
    const record = output.groups[groupName].records.total;
    assert.equal(record.basis, "recorded-total");
    assert.equal(record.startDate, directoryRecordedSince);
    assert.equal(record.endDate, "2026-10-17");
    assert.equal(record.timeZone, directoryTimeZone);
    assert.equal(record.collectedAt, "2026-10-20T12:00:00.000Z");
    assert.deepEqual(record.publication, { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS", language: "es" });
    assert.equal(record[valueKey], expected);
    assert.deepEqual(record.qualifications, []);
    assert.match(record.scopeId, /^[a-f0-9]{64}$/);
  }
  assert.notEqual(output.groups.directoryViews.records.total.scopeId, output.groups.directoryOutboundClicks.records.total.scopeId,
    "directory Views and clicks keep metric-specific total scopes");
  assert.deepEqual(output.groups.articleViews, input8.groups.articleViews, "the existing article total and windows stay unchanged");
  assert.deepEqual(output.groups.articles, input8.groups.articles);
  assert.deepEqual(output.groups.newsletter, input8.groups.newsletter);
  assert.deepEqual(output.groups.talks, input8.groups.talks);
  assert.deepEqual(output.groups.books, input8.groups.books);
  assert.deepEqual(output.groups.articleSearchClicks, input8.groups.articleSearchClicks);
  for (const groupName of ["directoryViews", "directoryOutboundClicks"]) {
    const periods = ({ total, ...records }) => records;
    assert.deepEqual(periods(output.groups[groupName].records), input8.groups[groupName].records,
      `${groupName} keeps all five ordinary records and scopes unchanged`);
  }
  assertNoGoogleCanaries(harness, directoryGooglePropertyId, directoryHostname, googleResponseCanary);
});

test("directory totals fail, retain, recover, and follow date or click-selector removal independently", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  let recordedSince = "2024-01-21";
  let failViewsTotal = true;
  let failClicksTotal = true;
  let oauthFails = false;
  let totalViews = 0;
  let totalClicks = 0;
  let periodViews = 50;
  let periodClicks = 70;
  const clickSelection = { ...phaseNineDirectoryAnalytics(), outboundClicks: true };
  const harness = createHarness({
    input: phaseTwelveInput({ baseInput: phaseThreeInput(), directoryAnalytics: clickSelection }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      tokenResponder: () => oauthFails
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" }),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const range = reportRange(request);
        const isTotal = range.startDate === recordedSince;
        if (isTotal && metricName === "screenPageViews" && failViewsTotal) {
          return jsonResponse({ error: googleResponseCanary }, 403);
        }
        if (isTotal && metricName === "eventCount" && failClicksTotal) {
          return jsonResponse({ error: googleResponseCanary }, 403);
        }
        return jsonResponse(ga4Report({
          views: isTotal
            ? metricName === "eventCount" ? totalClicks : totalViews
            : metricName === "eventCount" ? periodClicks : periodViews,
          metricName,
          timeZone: directoryTimeZone,
          metadata: isTotal ? { subjectToThresholding: true } : {}
        }));
      }
    })
  });

  await harness.handler({}, {});
  const withoutPriorTotals = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(withoutPriorTotals.groups.directoryViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"],
    "failed totals without a prior value remain unavailable while ordinary Views publish");
  assert.deepEqual(Object.keys(withoutPriorTotals.groups.directoryOutboundClicks.records).sort(), ["12m", "30d", "7d", "90d", "ytd"],
    "failed click totals without a prior value remain unavailable while ordinary clicks publish");

  failViewsTotal = false;
  failClicksTotal = false;
  clock.set("2026-10-21T16:45:46.000Z");
  await harness.handler({}, {});
  const zeroTotals = await readPut(harness.putCalls[1]);
  const originalViewsTotal = zeroTotals.groups.directoryViews.records.total;
  const originalClicksTotal = zeroTotals.groups.directoryOutboundClicks.records.total;
  assert.equal(originalViewsTotal.views, 0, "an explicit integer-zero Views total is measured data");
  assert.equal(originalClicksTotal.clicks, 0, "an explicit integer-zero clicks total is measured data");
  assert.deepEqual(originalViewsTotal.qualifications, ["thresholding"]);
  assert.deepEqual(originalClicksTotal.qualifications, ["thresholding"]);

  failViewsTotal = true;
  totalClicks = 1;
  periodViews = 51;
  periodClicks = 71;
  clock.set("2026-10-22T16:45:46.000Z");
  await harness.handler({}, {});
  const viewsFailure = await readPut(harness.putCalls[2]);
  assert.deepEqual(viewsFailure.groups.directoryViews.records.total, originalViewsTotal,
    "a Views-total failure retains its exact successful value and provenance");
  assert.equal(viewsFailure.groups.directoryOutboundClicks.records.total.clicks, 1,
    "the click total refreshes independently when Views fails");
  assert.equal(viewsFailure.groups.directoryViews.records["7d"].collectedAt, "2026-10-22T16:45:46.000Z");

  failViewsTotal = false;
  failClicksTotal = true;
  totalViews = 2;
  periodViews = 52;
  periodClicks = 72;
  clock.set("2026-10-23T16:45:46.000Z");
  await harness.handler({}, {});
  const clicksFailure = await readPut(harness.putCalls[3]);
  assert.equal(clicksFailure.groups.directoryViews.records.total.views, 2,
    "the Views total refreshes independently when clicks fail");
  assert.deepEqual(clicksFailure.groups.directoryOutboundClicks.records.total,
    viewsFailure.groups.directoryOutboundClicks.records.total,
    "a click-total failure retains its own successful value and provenance");

  failClicksTotal = false;
  totalClicks = 3;
  periodViews = 53;
  periodClicks = 73;
  clock.set("2026-10-24T16:45:46.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[4]);
  assert.equal(recovered.groups.directoryViews.records.total.views, totalViews);
  assert.equal(recovered.groups.directoryOutboundClicks.records.total.clicks, totalClicks);
  assert.equal(recovered.groups.directoryViews.records.total.scopeId, originalViewsTotal.scopeId);
  assert.equal(recovered.groups.directoryOutboundClicks.records.total.scopeId, originalClicksTotal.scopeId);

  recordedSince = "2024-01-22";
  harness.setInput(phaseTwelveInput({
    baseInput: phaseThreeInput(),
    directoryAnalytics: clickSelection,
    recordedSince
  }));
  await harness.handler({}, {});
  const changedStart = await readPut(harness.putCalls[5]);
  assert.equal(changedStart.groups.directoryViews.records.total.startDate, recordedSince);
  assert.equal(changedStart.groups.directoryOutboundClicks.records.total.startDate, recordedSince);
  assert.notEqual(changedStart.groups.directoryViews.records.total.scopeId, recovered.groups.directoryViews.records.total.scopeId);
  assert.notEqual(changedStart.groups.directoryOutboundClicks.records.total.scopeId, recovered.groups.directoryOutboundClicks.records.total.scopeId);
  for (const groupName of ["directoryViews", "directoryOutboundClicks"]) {
    assert.deepEqual(changedStart.groups[groupName].records["30d"], recovered.groups[groupName].records["30d"],
      "changing the recorded-history start changes total scope but leaves ordinary period records unchanged");
  }

  oauthFails = true;
  recordedSince = "2024-01-23";
  harness.setInput(phaseTwelveInput({
    baseInput: phaseThreeInput(),
    directoryAnalytics: clickSelection,
    recordedSince
  }));
  clock.set("2026-10-26T16:45:46.000Z");
  await harness.handler({}, {});
  const oauthFailure = await readPut(harness.putCalls[6]);
  for (const groupName of ["directoryViews", "directoryOutboundClicks"]) {
    assert.deepEqual(oauthFailure.groups[groupName], changedStart.groups[groupName],
      `${groupName} eligible totals and ordinary records retain verbatim on shared credential failure`);
  }

  harness.setInput(phaseTenInput({
    baseInput: phaseThreeInput(),
    directoryAnalytics: clickSelection
  }));
  clock.set("2026-10-27T16:45:46.000Z");
  await harness.handler({}, {});
  const removedDate = await readPut(harness.putCalls[7]);
  for (const groupName of ["directoryViews", "directoryOutboundClicks"]) {
    assert.deepEqual(Object.keys(removedDate.groups[groupName].records).sort(), ["12m", "30d", "7d", "90d", "ytd"],
      `${groupName} drops an ineligible old total even when credential failure invokes prior retention`);
  }

  oauthFails = false;
  recordedSince = "2024-01-21";
  harness.setInput(phaseTwelveInput({
    baseInput: phaseThreeInput(),
    directoryAnalytics: phaseNineDirectoryAnalytics(),
    recordedSince
  }));
  clock.set("2026-10-28T16:45:46.000Z");
  await harness.handler({}, {});
  const clicksRemoved = await readPut(harness.putCalls[8]);
  assert.equal(clicksRemoved.groups.directoryViews.records.total.startDate, recordedSince);
  assert.equal(Object.hasOwn(clicksRemoved.groups, "directoryOutboundClicks"), false,
    "removing only the outbound-click selection removes that family but retains the Views total");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("a prior directory total with a period basis is discarded without losing valid periods or its healthy sibling", async () => {
  const requestLog = [];
  let viewsUnavailable = false;
  const harness = createHarness({
    input: phaseTwelveInput({
      baseInput: phaseThreeInput(),
      directoryAnalytics: { ...phaseNineDirectoryAnalytics(), outboundClicks: true }
    }),
    clock: createClock("2026-10-20T16:45:46.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        if (viewsUnavailable && metricName === "screenPageViews") {
          return jsonResponse({ error: googleResponseCanary }, 403);
        }
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? 70 : 40,
          metricName,
          timeZone: directoryTimeZone
        }));
      }
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const malformedPrior = structuredClone(first);
  malformedPrior.groups.directoryViews.records.total.basis = "period";
  harness.objects.set(outputKey, JSON.stringify(malformedPrior));

  viewsUnavailable = true;
  harness.clock.set("2026-10-21T16:45:46.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  const viewRecords = second.groups.directoryViews.records;
  const previousPeriods = ({ total, ...periods }) => periods;
  assert.equal(Object.hasOwn(viewRecords, "total"), false,
    "a malformed failed total is sanitized instead of retained from prior output");
  assert.deepEqual(viewRecords, previousPeriods(first.groups.directoryViews.records),
    "valid failed Views periods remain available with their exact prior values and metadata");
  assert.equal(second.groups.directoryOutboundClicks.records.total.clicks, 70,
    "the independent click total still refreshes successfully");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("input 8 adds the Simple AWS available-history total without changing other families and retains then recovers it", async () => {
  const clock = createClock("2026-10-20T12:00:00.000Z");
  const requestLog = [];
  const recordedSince = "2023-05-02";
  const articleTimeZone = "America/Cordoba";
  let failTotal = false;
  let totalViews = 131598;
  const analyticsWithoutTotal = phaseFiveAnalytics({ propertyId: googlePropertyId, timeZone: articleTimeZone });
  const cloudy = cloudyArticle({ id: "phase-eleven-cloudy-row", title: "Phase Eleven four-source proof" });
  const harness = createHarness({
    input: phaseTenInput({ analytics: { ...analyticsWithoutTotal } }),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudy] })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20)),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const range = reportRange(request);
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        const isArticleViews = !isDirectory && metricName === "screenPageViews";
        if (isArticleViews && range.startDate === recordedSince) {
          if (failTotal) return jsonResponse({ error: googleResponseCanary }, 403);
          return jsonResponse(ga4Report({ views: totalViews, metricName, timeZone: articleTimeZone }));
        }
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? 23 : isDirectory ? 31 : 41,
          metricName,
          timeZone: isDirectory ? directoryTimeZone : articleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 51 }))
    })
  });

  await harness.handler({}, {});
  const baseline = await readPut(harness.putCalls[0]);
  const reportsBeforeTotal = googleRequests(requestLog, "google-report");
  assert.equal(reportsBeforeTotal.length, 15, "input8 without recordedSince keeps the three existing five-period Analytics families");
  assert.deepEqual(Object.keys(baseline.groups.articleViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);

  const totalInput = phaseTenInput({
    analytics: { ...analyticsWithoutTotal, recordedSince }
  });
  harness.setInput(totalInput);
  await harness.handler({}, {});
  const enabled = await readPut(harness.putCalls[1]);
  const enabledReports = googleRequests(requestLog, "google-report").slice(reportsBeforeTotal.length);
  assert.equal(enabledReports.length, 16, "the supported article total adds one aggregate query to the existing input8 calls");
  const totalRequests = enabledReports.filter(({ url, json }) => url.includes(`/properties/${googlePropertyId}:`)
    && json.metrics?.[0]?.name === "screenPageViews" && reportRange({ json }).startDate === recordedSince);
  assert.equal(totalRequests.length, 1);
  const totalRequest = totalRequests[0];
  assert.equal(totalRequest.method, "POST");
  assert.equal(totalRequest.redirect, "error");
  assert.ok(totalRequest.signal);
  assert.deepEqual(reportRange(totalRequest), { startDate: recordedSince, endDate: "2026-10-17" });
  assert.deepEqual(totalRequest.json.metrics, [{ name: "screenPageViews" }]);
  assert.deepEqual(totalRequest.json.dimensionFilter, {
    andGroup: {
      expressions: [
        { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: googleHostname, caseSensitive: true } } },
        { filter: { fieldName: "pagePath", stringFilter: { matchType: "FULL_REGEXP", value: googleArticlePathPattern, caseSensitive: true } } }
      ]
    }
  });
  assert.deepEqual(Object.keys(totalRequest.json).sort(), ["dateRanges", "dimensionFilter", "metrics"]);

  const totalRecord = enabled.groups.articleViews.records.total;
  assert.deepEqual(Object.keys(totalRecord).sort(), ["basis", "collectedAt", "endDate", "publication", "qualifications", "scopeId", "startDate", "timeZone", "views"]);
  assert.equal(totalRecord.basis, "recorded-total");
  assert.equal(totalRecord.startDate, recordedSince);
  assert.equal(totalRecord.endDate, "2026-10-17");
  assert.equal(totalRecord.timeZone, articleTimeZone);
  assert.equal(totalRecord.collectedAt, "2026-10-20T12:00:00.000Z");
  assert.deepEqual(totalRecord.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
  assert.equal(totalRecord.views, totalViews);
  assert.deepEqual(totalRecord.qualifications, []);
  assert.match(totalRecord.scopeId, /^[a-f0-9]{64}$/);
  assert.notEqual(totalRecord.scopeId, enabled.groups.articleViews.records["12m"].scopeId,
    "the all-available-history interval has its own recorded scope");
  assert.notEqual(totalRecord.scopeId, enabled.groups.directoryViews.records["7d"].scopeId,
    "Simple AWS and directory measures keep independent scopes");

  const oldFamilies = (groups) => Object.fromEntries(Object.entries(groups).filter(([name]) => name !== "articleViews"));
  assert.deepEqual(oldFamilies(enabled.groups), oldFamilies(baseline.groups), "counts, subscribers, Search, and both directory measures remain unchanged");
  const articlePeriodsOnly = ({ total, ...periods }) => periods;
  assert.deepEqual(articlePeriodsOnly(enabled.groups.articleViews.records), baseline.groups.articleViews.records,
    "the five ordinary article-view windows remain unchanged");
  assert.deepEqual(Object.keys(enabled.groups.articleSearchClicks.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.deepEqual(Object.keys(enabled.groups.directoryViews.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.deepEqual(Object.keys(enabled.groups.directoryOutboundClicks.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
  assert.equal(enabled.schemaVersion, 1);

  failTotal = true;
  clock.set("2026-10-21T12:00:00.000Z");
  const reportsBeforeFailure = googleRequests(requestLog, "google-report").length;
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[2]);
  const failedTotalRequests = googleRequests(requestLog, "google-report").slice(reportsBeforeFailure)
    .filter(({ url, json }) => url.includes(`/properties/${googlePropertyId}:`)
      && json.metrics?.[0]?.name === "screenPageViews" && reportRange({ json }).startDate === recordedSince);
  assert.equal(failedTotalRequests.length, 1);
  assert.deepEqual(reportRange(failedTotalRequests[0]), { startDate: recordedSince, endDate: "2026-10-18" });
  assert.deepEqual(retained.groups.articleViews.records.total, totalRecord,
    "a failed total refresh retains its last successful value and complete provenance");
  assert.equal(retained.groups.articleViews.records["7d"].collectedAt, "2026-10-21T12:00:00.000Z",
    "successful ordinary article periods still refresh while the total is retained");

  failTotal = false;
  totalViews += 1;
  clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[3]);
  const recoveredTotal = recovered.groups.articleViews.records.total;
  assert.equal(recoveredTotal.views, totalViews);
  assert.equal(recoveredTotal.collectedAt, "2026-10-22T12:00:00.000Z");
  assert.equal(recoveredTotal.startDate, recordedSince);
  assert.equal(recoveredTotal.endDate, "2026-10-19");
  assert.equal(recoveredTotal.scopeId, totalRecord.scopeId, "recovery refreshes the same total scope");
  assert.equal(recovered.groups.articles.counts.all, enabled.groups.articles.counts.all);
  assertNoGoogleCanaries(harness, googlePropertyId, googleHostname, googleArticlePathPattern, googleResponseCanary);
});

test("outbound-click failures retain and recover per period independently from directory views", async () => {
  let failClicks30d = false;
  let failViews30d = false;
  let clickCount = 100;
  let viewCount = 50;
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseTenInput(),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ id: "phase-ten-valid-cloudy-row" })] })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20)),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        const range = reportRange(request);
        const days = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000;
        if (isDirectory && days === 29 && metricName === "eventCount" && failClicks30d) {
          return jsonResponse({ error: googleResponseCanary }, 403);
        }
        if (isDirectory && days === 29 && metricName === "screenPageViews" && failViews30d) {
          return jsonResponse({ error: googleResponseCanary }, 403);
        }
        return jsonResponse(ga4Report({
          views: metricName === "eventCount" ? clickCount : viewCount,
          metricName,
          timeZone: isDirectory ? directoryTimeZone : googleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 75 }))
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);

  failClicks30d = true;
  clickCount = 101;
  viewCount = 51;
  clock.set("2026-10-21T16:45:46.000Z");
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[1]);
  assert.deepEqual(retained.groups.directoryOutboundClicks.records["30d"], first.groups.directoryOutboundClicks.records["30d"],
    "a click report failure retains only the exact prior click record for its period");
  assert.equal(retained.groups.directoryOutboundClicks.records["7d"].clicks, 101);
  assert.equal(retained.groups.directoryOutboundClicks.records["7d"].collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(retained.groups.directoryViews.records["30d"].views, 51,
    "a click failure does not prevent healthy Views from refreshing");
  assert.equal(retained.groups.articleViews.records["30d"].collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(retained.groups.articleSearchClicks.records["30d"].clicks, 75);
  assert.equal(retained.groups.newsletter.collectedAt, "2026-10-21T16:45:46.000Z");

  failClicks30d = false;
  failViews30d = true;
  clickCount = 102;
  viewCount = 52;
  clock.set("2026-10-22T16:45:46.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[2]);
  assert.equal(recovered.groups.directoryOutboundClicks.records["30d"].clicks, 102,
    "a recovered click period replaces its retained value instead of accumulating it");
  assert.equal(recovered.groups.directoryOutboundClicks.records["30d"].collectedAt, "2026-10-22T16:45:46.000Z");
  assert.equal(recovered.groups.directoryOutboundClicks.records["30d"].scopeId,
    first.groups.directoryOutboundClicks.records["30d"].scopeId,
    "new counts and collection dates do not change the stable metric scope");
  assert.deepEqual(recovered.groups.directoryViews.records["30d"], retained.groups.directoryViews.records["30d"],
    "a Views failure retains its own prior interval while healthy clicks publish");
  assert.equal(recovered.groups.directoryOutboundClicks.records["7d"].clicks, 102);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("outbound clicks can be the only fresh family and total failure never replaces published bytes", async () => {
  let clicksAvailable = true;
  const requestLog = [];
  const input = phaseTenInput();
  input.curated = {
    talks: [{ id: "", kind: "talk", status: "delivered", language: "en" }],
    books: [{ id: "", status: "published", language: "en" }]
  };
  const harness = createHarness({
    input,
    fetchFn: phaseEightApiFetch({
      requestLog,
      caylentPages: new Map([[0, () => jsonResponse({ error: googleResponseCanary }, 503)]]),
      builderPages: new Map([["", () => jsonResponse({ error: googleResponseCanary }, 503)]]),
      hashnodeResponder: () => jsonResponse({ error: googleResponseCanary }, 503),
      postsResponder: () => jsonResponse({ error: googleResponseCanary }, 503),
      newsletterResponder: () => jsonResponse({ error: googleResponseCanary }, 503),
      reportResponder: ({ request }) => request.json.metrics?.[0]?.name === "eventCount" && clicksAvailable
        ? jsonResponse(ga4Report({ views: 66, metricName: "eventCount", timeZone: directoryTimeZone }))
        : jsonResponse({ error: googleResponseCanary }, 503),
      searchResponder: () => jsonResponse({ error: googleResponseCanary }, 503)
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(Object.keys(first.groups), ["directoryOutboundClicks"],
    "healthy clicks are sufficient for publication when article, curated, subscriber, Views, and Search families fail");
  assert.equal(first.groups.directoryOutboundClicks.records["7d"].clicks, 66);
  const publishedBytes = harness.objects.get(outputKey);

  clicksAvailable = false;
  harness.clock.set("2026-10-21T16:45:46.000Z");
  await assert.rejects(() => harness.handler({}, {}), (error) => error.code === "NO_SUCCESSFUL_GROUPS");
  assert.equal(harness.putCalls.length, 1, "no fresh family causes no replacement write");
  assert.equal(harness.objects.get(outputKey), publishedBytes, "complete failure preserves current.json byte-for-byte");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("outbound-click reports validate their header, timezone, integers, truncation, qualifications, and prior records", async () => {
  let invalidCurrentReports = false;
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseTenInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const range = reportRange(request);
        const days = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000;
        if (!invalidCurrentReports) {
          const qualifications = days === 6 ? {
            samplingMetadatas: [{ samplesReadCount: "10", samplingSpaceSize: "20" }],
            subjectToThresholding: true,
            dataLossFromOtherRow: true
          } : {};
          return jsonResponse(ga4Report({
            views: metricName === "eventCount" ? 70 : 40,
            metricName,
            timeZone: directoryTimeZone,
            metadata: qualifications
          }));
        }
        if (metricName === "eventCount") {
          if (days === 6) return jsonResponse(ga4Report({ views: 71, metricName: "screenPageViews", timeZone: directoryTimeZone }));
          if (days === 29) return jsonResponse(ga4Report({ views: 72, metricName, timeZone: "UTC" }));
          if (days === 89) return jsonResponse(ga4Report({ views: "9007199254740992", metricName, timeZone: directoryTimeZone }));
          if (days === 364) return jsonResponse(ga4Report({
            views: 74,
            metricName,
            timeZone: directoryTimeZone,
            metadata: { dataTruncationReasons: ["DATE_RANGE"] }
          }));
          return jsonResponse({ metricHeaders: [{ name: metricName, type: "TYPE_INTEGER" }], dimensionHeaders: [], rowCount: 0, rows: [], metadata: { timeZone: directoryTimeZone } });
        }
        return jsonResponse(ga4Report({ views: 40, metricName, timeZone: directoryTimeZone }));
      }
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assert.deepEqual(first.groups.directoryOutboundClicks.records["7d"].qualifications, ["sampled", "thresholding", "other-row"],
    "valid source qualifications are preserved on the click record");
  const previous = structuredClone(first);
  previous.groups.directoryOutboundClicks.records["30d"].providerPropertyId = directoryGooglePropertyId;
  previous.groups.directoryOutboundClicks.records["90d"].clicks = -1;
  delete previous.groups.directoryOutboundClicks.records["12m"];
  delete previous.groups.directoryOutboundClicks.records.ytd;
  harness.objects.set(outputKey, JSON.stringify(previous));

  invalidCurrentReports = true;
  clock.set("2026-10-21T16:45:46.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  const clickRecords = second.groups.directoryOutboundClicks.records;
  assert.deepEqual(Object.keys(clickRecords).sort(), ["7d"],
    "invalid prior periods are discarded, and malformed current reports stay unavailable instead of becoming zero");
  assert.deepEqual(clickRecords["7d"], first.groups.directoryOutboundClicks.records["7d"],
    "a wrong metric header retains the exact valid prior value, scope, interval, qualifications, and fetch time");
  assert.equal(Object.hasOwn(clickRecords, "30d"), false, "wrong timezone plus malformed prior cannot publish a record");
  assert.equal(Object.hasOwn(clickRecords, "90d"), false, "an unsafe integer plus malformed prior cannot publish a record");
  assert.equal(Object.hasOwn(clickRecords, "12m"), false, "a truncated response with no prior remains unavailable");
  assert.equal(Object.hasOwn(clickRecords, "ytd"), false, "an empty report is unavailable, never inferred to be zero");
  assert.equal(second.groups.directoryViews.records["7d"].views, 40, "invalid clicks do not prevent healthy directory Views");

  const noPriorLog = [];
  const noPriorHarness = createHarness({
    input: phaseTenInput({ baseInput: phaseThreeInput() }),
    fetchFn: phaseFiveApiFetch({
      requestLog: noPriorLog,
      reportResponder: ({ request }) => request.json.metrics[0]?.name === "eventCount"
        ? jsonResponse({ error: googleResponseCanary }, 403)
        : jsonResponse(ga4Report({ views: 43, timeZone: directoryTimeZone }))
    })
  });
  await noPriorHarness.handler({}, {});
  const withoutPrior = await readPut(noPriorHarness.putCalls[0]);
  assert.equal(Object.hasOwn(withoutPrior.groups, "directoryOutboundClicks"), false,
    "failed click reports without a valid prior remain unavailable instead of publishing zero");
  assert.equal(withoutPrior.groups.directoryViews.records["7d"].views, 43);
  assertNoGoogleCanaries(harness, googleResponseCanary, directoryGooglePropertyId);
  assertNoGoogleCanaries(noPriorHarness, googleResponseCanary, directoryGooglePropertyId);
});

test("shared Google credential failure retains outbound clicks with other Google families while non-Google families refresh", async () => {
  let tokenFails = false;
  const requestLog = [];
  const clock = createClock("2026-10-20T16:45:46.000Z");
  const harness = createHarness({
    input: phaseTenInput(),
    clock,
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ id: "phase-ten-valid-cloudy-row" })] })]]),
      tokenResponder: () => tokenFails
        ? jsonResponse({ error: googleResponseCanary }, 503)
        : jsonResponse({ access_token: googleAccessToken, expires_in: 3600, token_type: "Bearer" }),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20)),
      reportResponder: ({ request }) => {
        const metricName = request.json.metrics[0]?.name;
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
        return jsonResponse(ga4Report({ views: metricName === "eventCount" ? 17 : 27, metricName,
          timeZone: isDirectory ? directoryTimeZone : googleTimeZone }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 37 }))
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  tokenFails = true;
  clock.set("2026-10-21T16:45:46.000Z");
  const failedStart = requestLog.length;
  const parameterStart = harness.parameterCalls.length;
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);

  for (const family of ["articleViews", "directoryViews", "directoryOutboundClicks", "articleSearchClicks"]) {
    assert.deepEqual(second.groups[family], first.groups[family], `${family} retains its exact prior group on shared token failure`);
  }
  assert.equal(second.groups.articles.collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(second.groups.newsletter.collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(second.groups.talks.collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(second.groups.books.collectedAt, "2026-10-21T16:45:46.000Z");
  assert.equal(harness.parameterCalls.length - parameterStart, 1, "one failed shared refresh uses one SSM read");
  assert.equal(googleRequests(requestLog.slice(failedStart), "google-report").length, 0);
  assert.equal(googleRequests(requestLog.slice(failedStart), "google-search").length, 0);
  assert.equal(googleRequests(requestLog.slice(failedStart), "google-oauth").length, 2, "the shared token request gets its existing one retry");
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("outbound-click scope is independent from Views, and removing selection removes only clicks", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseTenInput(),
    fetchFn: phaseEightApiFetch({
      requestLog,
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle({ id: "phase-ten-valid-cloudy-row" })] })]]),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      newsletterResponder: ({ request }) => {
        const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
        return jsonResponse(newsletterEnvelope(publicationId, 12));
      },
      reportResponder: ({ request }) => {
        const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`) || request.url.includes("/properties/987654321:");
        return jsonResponse(ga4Report({
          views: request.json.metrics[0]?.name === "eventCount" ? 18 : 28,
          metricName: request.json.metrics[0]?.name,
          timeZone: isDirectory ? directoryTimeZone : googleTimeZone
        }));
      },
      searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 32 }))
    })
  });

  await harness.handler({}, {});
  const enabled = await readPut(harness.putCalls[0]);
  const scopes = (records) => Object.fromEntries(Object.entries(records).map(([period, record]) => [period, record.scopeId]));
  const enabledViewScopes = scopes(enabled.groups.directoryViews.records);
  const enabledClickScopes = scopes(enabled.groups.directoryOutboundClicks.records);
  const enabledArticleViewScopes = scopes(enabled.groups.articleViews.records);
  const enabledSearchScopes = scopes(enabled.groups.articleSearchClicks.records);

  const reorderedSources = [simpleAwsArticleSource(), builderCenterSource(), sourceInput().source, cloudyThingsSource()];
  const alternateBase = phaseEightInput({
    sources: reorderedSources,
    analytics: phaseFiveAnalytics({ propertyId: "555555555" }),
    newsletter: { id: "simple-aws", publicationId: "synthetic-second-newsletter-publication", language: "en" }
  });
  harness.setInput(phaseTenInput({ baseInput: alternateBase }));
  await harness.handler({}, {});
  const unrelatedSelectorsChanged = await readPut(harness.putCalls[1]);
  assert.deepEqual(scopes(unrelatedSelectorsChanged.groups.directoryViews.records), enabledViewScopes,
    "article selectors and source order do not change directory Views scope");
  assert.deepEqual(scopes(unrelatedSelectorsChanged.groups.directoryOutboundClicks.records), enabledClickScopes,
    "article selectors and source order do not change the independent click scope");
  assert.deepEqual(scopes(unrelatedSelectorsChanged.groups.articleSearchClicks.records), enabledSearchScopes);
  assert.notDeepEqual(scopes(unrelatedSelectorsChanged.groups.articleViews.records), enabledArticleViewScopes);

  harness.setInput(phaseTenInput({
    baseInput: alternateBase,
    directoryAnalytics: phaseNineDirectoryAnalytics({ propertyId: "987654321", outboundClicks: true })
  }));
  await harness.handler({}, {});
  const directorySelectorChanged = await readPut(harness.putCalls[2]);
  for (const period of Object.keys(enabledClickScopes)) {
    assert.notEqual(directorySelectorChanged.groups.directoryOutboundClicks.records[period].scopeId, enabledClickScopes[period],
      "changing the selected directory property changes click scope");
    assert.notEqual(directorySelectorChanged.groups.directoryViews.records[period].scopeId, enabledViewScopes[period]);
    assert.equal(directorySelectorChanged.groups.articleViews.records[period].scopeId,
      unrelatedSelectorsChanged.groups.articleViews.records[period].scopeId);
    assert.equal(directorySelectorChanged.groups.articleSearchClicks.records[period].scopeId, enabledSearchScopes[period]);
  }

  const disabledStart = requestLog.length;
  harness.setInput(phaseNineInput({
    baseInput: alternateBase,
    directoryAnalytics: phaseNineDirectoryAnalytics({ propertyId: "987654321" })
  }));
  await harness.handler({}, {});
  const disabled = await readPut(harness.putCalls[3]);
  assert.equal(Object.hasOwn(disabled.groups, "directoryOutboundClicks"), false,
    "omitting the permanent click selection removes only the click family");
  assert.ok(Object.hasOwn(disabled.groups, "directoryViews"));
  assert.ok(Object.hasOwn(disabled.groups, "articles"));
  assert.ok(Object.hasOwn(disabled.groups, "talks"));
  assert.ok(Object.hasOwn(disabled.groups, "books"));
  assert.deepEqual(scopes(disabled.groups.directoryViews.records), scopes(directorySelectorChanged.groups.directoryViews.records));
  assert.deepEqual(scopes(disabled.groups.articleViews.records), scopes(directorySelectorChanged.groups.articleViews.records));
  assert.deepEqual(scopes(disabled.groups.articleSearchClicks.records), scopes(directorySelectorChanged.groups.articleSearchClicks.records));
  assert.equal(googleRequests(requestLog.slice(disabledStart), "google-report").length, 10,
    "input 7 still refreshes the selected article Views and directory Views periods");
  assert.equal(googleRequests(requestLog.slice(disabledStart), "google-report")
    .some(({ json }) => json.metrics?.[0]?.name === "eventCount"), false,
    "input 7 after selection removal sends no click report");
  assert.equal(Object.keys(enabledClickScopes).length, 5);
  assertNoGoogleCanaries(harness);
});

test("outbound-click YTD is omitted when the closed-day lag still ends in the prior year", async () => {
  const requestLog = [];
  const clock = createClock("2025-12-30T16:00:00.000Z");
  const harness = createHarness({
    input: phaseTenInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      reportResponder: ({ request }) => jsonResponse(ga4Report({
        views: 7,
        metricName: request.json.metrics[0]?.name,
        timeZone: directoryTimeZone
      }))
    })
  });
  await harness.handler({}, {});
  const prior = await readPut(harness.putCalls[0]);
  assert.equal(prior.groups.directoryOutboundClicks.records.ytd.startDate, "2025-01-01");
  assert.equal(prior.groups.directoryViews.records.ytd.startDate, "2025-01-01");

  clock.set("2026-01-03T16:00:00.000Z");
  const secondStart = requestLog.length;
  await harness.handler({}, {});
  const current = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(current.groups.directoryOutboundClicks.records, "ytd"), false,
    "the prior year's click YTD is not relabeled as the new year");
  assert.equal(Object.hasOwn(current.groups.directoryViews.records, "ytd"), false);
  const currentReports = googleRequests(requestLog.slice(secondStart), "google-report");
  assert.equal(currentReports.length, 8, "only four eligible periods are requested for each metric");
  assert.equal(currentReports.some((request) => reportRange(request).startDate === "2026-01-01"), false,
    "no YTD request is made before the lag reaches January 1");
});

const phaseThirteenRanges = {
  "7d": ["2026-10-11", "2026-10-17"],
  "30d": ["2026-09-18", "2026-10-17"],
  "90d": ["2026-07-20", "2026-10-17"],
  "12m": ["2025-10-18", "2026-10-17"],
  ytd: ["2026-01-01", "2026-10-17"]
};

function phaseThirteenExpectedValue(date, metric) {
  const index = Math.floor((Date.parse(`${date}T00:00:00.000Z`) - Date.parse("2025-10-18T00:00:00.000Z")) / 86_400_000);
  if (date < "2025-10-18" || date > "2026-10-17") {
    return metric === "opens" ? 1_000_000 + Math.abs(index) : 2_000_000 + Math.abs(index);
  }
  return metric === "opens" ? index + 1 : index % 11;
}

function sumPhaseThirteenDates(startDate, endDate, metric, { omitDates = [], zeroRange = null } = {}) {
  const omitted = new Set(omitDates);
  let total = 0;
  for (let date = startDate; date <= endDate; date = addUtcDays(date, 1)) {
    if (omitted.has(date)) continue;
    if (metric === "clicks" && zeroRange && date >= zeroRange[0] && date <= zeroRange[1]) continue;
    total += phaseThirteenExpectedValue(date, metric);
  }
  return total;
}

function phaseThirteenEnvelopeForRequest(request, extraForDate = () => ({})) {
  const url = new URL(request.url);
  const rows = engagementRowsForRequest(request, extraForDate);
  return beehiivEngagementsEnvelope(rows, {
    publicationId: decodeURIComponent(url.pathname.split("/").at(-2)),
    granularity: url.searchParams.get("granularity"),
    emailType: url.searchParams.get("email_type"),
    startDate: url.searchParams.get("start_date"),
    numberOfDays: Number(url.searchParams.get("number_of_days"))
  });
}

function phaseThirteenFetch({ requestLog = [], engagementResponder, newsletterResponder, reportResponder,
  searchResponder, postsResponder, builderPages, caylentPages,
  hashnodePages = new Map([[1, cloudyHashnodePage({ rows: [] })]]) } = {}) {
  return phaseEightApiFetch({
    requestLog,
    builderPages,
    caylentPages,
    hashnodePages,
    engagementResponder,
    newsletterResponder,
    reportResponder,
    searchResponder,
    postsResponder
  });
}

test("input10 validates its exact engagement opt-in before provider work", async () => {
  const malformed = [
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); delete input.newsletterEngagements; return input; })(),
    phaseThirteenInput({ baseInput: phaseFourInput() }),
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); input.newsletter.language = "es"; return input; })(),
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); delete input.sources; return input; })(),
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); delete input.curated; return input; })(),
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); delete input.newsletter; return input; })(),
    (() => { const input = phaseThirteenInput({ baseInput: phaseFourInput() }); input.unexpected = true; return input; })(),
    (() => { const input = phaseTwelveInput({ baseInput: phaseFourInput() }); input.newsletterEngagements = true; return input; })()
  ];
  malformed[1].newsletterEngagements = false;
  for (const input of malformed) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseThirteenFetch({ requestLog }) });
    const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
    harness.objects.set(outputKey, previous);
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED",
        "invalid input10 must reach strict input10 validation instead of the old unsupported-version gate");
      return true;
    });
    assert.equal(harness.putCalls.length, 0);
    assert.equal(harness.objects.get(outputKey), previous);
    assert.deepEqual(requestLog, [], "invalid input10 fails before any provider access");
    assert.deepEqual(harness.secretCalls, [], "invalid input10 does not read Beehiiv credentials");
  }
});

test("legacy input1-9 shapes make no newsletter-engagement requests", async () => {
  const legacyInputs = [
    sourceInput(), phaseTwoInput(), phaseThreeInput(), phaseFourInput(), phaseFiveInput(), phaseSixInput(),
    phaseNineInput(), phaseTenInput(), phaseTwelveInput()
  ];
  for (const input of legacyInputs) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseThirteenFetch({ requestLog }) });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(beehiivEngagementRequests(requestLog), [], `input${input.schemaVersion} has no new engagement work`);
    assert.equal(Object.hasOwn(output.groups, "newsletterEmailOpens"), false);
    assert.equal(Object.hasOwn(output.groups, "newsletterEmailVerifiedClicks"), false);
  }
});

test("input10 derives both metrics from one clipped daily dataset and preserves prior families including cumulative sent", async () => {
  const requestLog = [];
  const legacyRequestLog = [];
  const allFamiliesInput = phaseTwelveInput({
    directoryAnalytics: phaseNineDirectoryAnalytics({ outboundClicks: true })
  });
  const hashnodePages = new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle()] })]]);
  const omittedDate = "2026-10-14";
  const clock = createClock("2026-10-20T12:00:00.000Z");
  const newsletterResponder = ({ request }) => {
    const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    return jsonResponse(newsletterEnvelope(publicationId, 20, 88));
  };
  const reportResponder = ({ request }) => {
    const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
    const metricName = request.json.metrics[0]?.name;
    return jsonResponse(ga4Report({
      views: metricName === "eventCount" ? 23 : isDirectory ? 31 : 41,
      metricName,
      timeZone: isDirectory ? directoryTimeZone : googleTimeZone
    }));
  };
  const legacyHarness = createHarness({
    input: allFamiliesInput,
    clock: createClock("2026-10-20T12:00:00.000Z"),
    fetchFn: phaseThirteenFetch({ requestLog: legacyRequestLog, hashnodePages, newsletterResponder, reportResponder })
  });
  await legacyHarness.handler({}, {});
  const legacy = await readPut(legacyHarness.putCalls[0]);
  assert.deepEqual(beehiivEngagementRequests(legacyRequestLog), [], "input9 remains disabled under the same provider fixtures");

  const harness = createHarness({
    input: phaseThirteenInput({ baseInput: allFamiliesInput }),
    clock,
    fetchFn: phaseThirteenFetch({
      requestLog,
      hashnodePages,
      newsletterResponder,
      reportResponder,
      engagementResponder: ({ request }) => {
        const envelope = phaseThirteenEnvelopeForRequest(request, (date) =>
          date >= "2026-10-11" && date <= "2026-10-17" ? { total_verified_clicks: 0 } : {});
        envelope.data = envelope.data.filter(({ date }) => date !== omittedDate);
        return jsonResponse(envelope);
      }
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const engagementRequests = beehiivEngagementRequests(requestLog);
  assertBeehiivEngagementRequests(harness, engagementRequests);
  assert.equal(engagementRequests.length, 12, "the 365-day union fits twelve shared chunks, not one fetch per metric/window");
  const chunks = engagementRequests
    .map((request) => new URL(request.url).searchParams)
    .sort((left, right) => left.get("start_date").localeCompare(right.get("start_date")));
  let nextStart = "2025-10-18";
  for (const params of chunks) {
    assert.equal(params.get("start_date"), nextStart);
    const intendedDays = Number(params.get("number_of_days"));
    assert.ok(intendedDays >= 1 && intendedDays <= 31);
    nextStart = addUtcDays(nextStart, intendedDays);
  }
  assert.equal(nextStart, "2026-10-18", "intended chunks cover the 12m/YTD union exactly once");

  const familyNames = Object.keys(first.groups).sort();
  assert.deepEqual(familyNames, [
    "articleSearchClicks", "articleViews", "articles", "directoryOutboundClicks", "directoryViews",
    "newsletter", "newsletterEmailsSent", "newsletterEmailOpens", "newsletterEmailVerifiedClicks", "talks", "books"
  ].sort());
  assert.equal(first.groups.newsletter.subscribers, 20, "the existing subscriber family remains independent");
  for (const [groupName, valueKey, metric] of [
    ["newsletterEmailOpens", "opens", "opens"],
    ["newsletterEmailVerifiedClicks", "clicks", "clicks"]
  ]) {
    const group = first.groups[groupName];
    assert.deepEqual(Object.keys(group).sort(), ["definitionVersion", "records"]);
    assert.equal(group.definitionVersion, 1);
    assert.deepEqual(Object.keys(group.records).sort(), ["12m", "30d", "7d", "90d", "ytd"]);
    for (const [period, [startDate, endDate]] of Object.entries(phaseThirteenRanges)) {
      const record = group.records[period];
      assert.deepEqual(Object.keys(record).sort(), [
        "basis", "collectedAt", "endDate", "publication", "scopeId", "startDate", "timeZone", valueKey
      ].sort());
      assert.equal(record.basis, "period");
      assert.equal(record.collectedAt, "2026-10-20T12:00:00.000Z");
      assert.equal(record.scopeId.length, 64);
      assert.match(record.scopeId, /^[a-f0-9]{64}$/);
      assert.deepEqual(record.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
      assert.equal(record.timeZone, "UTC");
      assert.equal(record.startDate, startDate);
      assert.equal(record.endDate, endDate);
      const zeroRange = metric === "clicks" ? ["2026-10-11", "2026-10-17"] : null;
      assert.equal(record[valueKey], sumPhaseThirteenDates(startDate, endDate, metric, {
        omitDates: [omittedDate], zeroRange
      }));
    }
    assert.equal(Object.hasOwn(group.records, "total"), false, "email events do not gain a cumulative total");
  }
  assert.notEqual(first.groups.newsletterEmailOpens.records["7d"].scopeId,
    first.groups.newsletterEmailVerifiedClicks.records["7d"].scopeId, "each metric has a separate scope");
  for (const oldGroup of ["articles", "books", "talks", "newsletter", "articleViews", "articleSearchClicks",
    "directoryViews", "directoryOutboundClicks", "newsletterEmailsSent"]) {
    assert.ok(first.groups[oldGroup], `${oldGroup} remains in the output`);
    assert.deepEqual(first.groups[oldGroup], legacy.groups[oldGroup],
      `${oldGroup} retains the exact existing values, dates, and scopes from the same input9 run`);
  }
  assert.equal(first.groups.newsletterEmailVerifiedClicks.records["7d"].clicks, 0,
    "present rows with explicit zero values produce measured zero");
  assert.ok(first.groups.newsletterEmailOpens.records["7d"].opens < 2_000_000,
    "the provider's extra boundary date is clipped from the intended range");
  assert.equal(first.groups.newsletterEmailOpens.records["7d"].opens,
    sumPhaseThirteenDates(...phaseThirteenRanges["7d"], "opens", { omitDates: [omittedDate] }),
    "a sparse nonempty period sums returned dates without a completeness claim");
  assertNoNewsletterCanaries(harness,
    beehiivApiKey,
    "synthetic-beehiiv-private-daily-canary",
    "synthetic-private-per-post-title",
    beehiivSecretExtraFieldCanary);

  const firstOpenScope = first.groups.newsletterEmailOpens.records["7d"].scopeId;
  const firstClickScope = first.groups.newsletterEmailVerifiedClicks.records["7d"].scopeId;
  const rotatedKey = "synthetic-rotated-beehiiv-api-key-canary";
  harness.setSecretResponse(beehiivSecretArn, { SecretString: JSON.stringify({ apiKey: rotatedKey }) });
  clock.set("2026-10-21T12:00:00.000Z");
  await harness.handler({}, {});
  const second = await readPut(harness.putCalls[1]);
  const secondOpen = second.groups.newsletterEmailOpens.records["7d"];
  const secondClick = second.groups.newsletterEmailVerifiedClicks.records["7d"];
  assert.notEqual(secondOpen.opens, first.groups.newsletterEmailOpens.records["7d"].opens,
    "a later invocation recomputes provider events rather than adding yesterday's total");
  assert.equal(secondOpen.opens, sumPhaseThirteenDates("2026-10-12", "2026-10-18", "opens", {
    omitDates: [omittedDate]
  }), "the new record is exactly the current provider sum, not a prior-plus-current accumulation");
  assert.equal(secondClick.clicks, sumPhaseThirteenDates("2026-10-12", "2026-10-18", "clicks", {
    omitDates: [omittedDate], zeroRange: ["2026-10-11", "2026-10-17"]
  }));
  assert.equal(secondOpen.scopeId, firstOpenScope, "clock and key rotation do not salt the metric scope");
  assert.equal(secondClick.scopeId, firstClickScope);
  assert.equal(secondOpen.collectedAt, "2026-10-21T12:00:00.000Z");
  const laterRequests = beehiivEngagementRequests(requestLog).slice(12);
  assert.equal(laterRequests.length, 12);
  assert.equal(newsletterRequestHeader(laterRequests[0], "authorization"), `Bearer ${rotatedKey}`);
  for (const request of laterRequests) assert.equal(harness.abortSignalRecords.find(({ signal }) =>
    signal === request.signal)?.milliseconds, 5_000);
  assert.equal(bodyText(harness.putCalls[1].Body).includes(rotatedKey), false);
  assert.equal(harness.logs.join("\n").includes(rotatedKey), false);

  const changedPublication = phaseThirteenInput();
  changedPublication.newsletter.publicationId = "synthetic-next-publication-id";
  harness.setInput(changedPublication);
  clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const third = await readPut(harness.putCalls[2]);
  assert.notEqual(third.groups.newsletterEmailOpens.records["7d"].scopeId, firstOpenScope,
    "a changed selected publication changes the metric scope");
  assert.notEqual(third.groups.newsletterEmailVerifiedClicks.records["7d"].scopeId, firstClickScope);
});

test("input10 isolates malformed selected values and common chunk failures to affected periods, then removes both families when disabled", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T12:00:00.000Z");
  let invalidJanuaryOpen = false;
  let failFirstChunk = false;
  const failedChunkStart = "2025-10-20";
  let failSubscribers = false;
  const harness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock,
    fetchFn: phaseThirteenFetch({
      requestLog,
      newsletterResponder: () => failSubscribers
        ? jsonResponse({ error: "synthetic subscriber failure" }, 403)
        : jsonResponse(newsletterEnvelope(beehiivPublicationId, 20)),
      engagementResponder: ({ request }) => {
        const url = new URL(request.url);
        if (failFirstChunk && url.searchParams.get("start_date") === failedChunkStart) {
          return jsonResponse({ error: "synthetic unavailable chunk" }, 403);
        }
        const envelope = phaseThirteenEnvelopeForRequest(request);
        if (invalidJanuaryOpen) {
          mutateIntendedEngagementDate(request, envelope, "2026-01-15", (row) => { row.total_opens = null; });
        }
        return jsonResponse(envelope);
      }
    })
  });

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  invalidJanuaryOpen = true;
  clock.set("2026-10-21T12:00:00.000Z");
  await harness.handler({}, {});
  const metricFailure = await readPut(harness.putCalls[1]);
  assert.deepEqual(metricFailure.groups.newsletterEmailOpens.records["12m"],
    initial.groups.newsletterEmailOpens.records["12m"], "invalid opens retain their eligible prior record verbatim");
  assert.deepEqual(metricFailure.groups.newsletterEmailOpens.records.ytd,
    initial.groups.newsletterEmailOpens.records.ytd, "only periods containing the invalid day retain opens");
  assert.equal(metricFailure.groups.newsletterEmailOpens.records["90d"].collectedAt, "2026-10-21T12:00:00.000Z");
  assert.equal(metricFailure.groups.newsletterEmailVerifiedClicks.records.ytd.collectedAt, "2026-10-21T12:00:00.000Z",
    "a malformed opens value does not invalidate the click metric");
  assert.equal(metricFailure.groups.newsletter.collectedAt, "2026-10-21T12:00:00.000Z",
    "an email-metric failure does not suppress current subscribers");
  assert.equal(metricFailure.groups.articles.collectedAt, "2026-10-21T12:00:00.000Z");

  invalidJanuaryOpen = false;
  failFirstChunk = true;
  clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const commonFailure = await readPut(harness.putCalls[2]);
  for (const groupName of ["newsletterEmailOpens", "newsletterEmailVerifiedClicks"]) {
    assert.deepEqual(commonFailure.groups[groupName].records["12m"],
      metricFailure.groups[groupName].records["12m"], "the shared failed chunk retains its exact affected period");
    assert.equal(commonFailure.groups[groupName].records.ytd.collectedAt, "2026-10-22T12:00:00.000Z",
      "a failure before YTD starts does not block healthy shorter source windows or YTD");
    assert.equal(commonFailure.groups[groupName].records["7d"].collectedAt, "2026-10-22T12:00:00.000Z");
  }

  failFirstChunk = false;
  clock.set("2026-10-23T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[3]);
  for (const groupName of ["newsletterEmailOpens", "newsletterEmailVerifiedClicks"]) {
    assert.equal(recovered.groups[groupName].records["12m"].collectedAt, "2026-10-23T12:00:00.000Z",
      "a healthy retry refreshes a previously failed interval with new provenance");
    assert.equal(recovered.groups[groupName].records["12m"].startDate, "2025-10-21");
    assert.notDeepEqual(recovered.groups[groupName].records["12m"], commonFailure.groups[groupName].records["12m"]);
  }

  failSubscribers = true;
  clock.set("2026-10-24T12:00:00.000Z");
  await harness.handler({}, {});
  const subscriberFailure = await readPut(harness.putCalls[4]);
  assert.deepEqual(subscriberFailure.groups.newsletter, recovered.groups.newsletter,
    "a failed subscriber refresh retains the exact current-subscriber record");
  assert.equal(subscriberFailure.groups.newsletterEmailOpens.records["7d"].collectedAt, "2026-10-24T12:00:00.000Z",
    "the engagement family refreshes while subscriber retrieval fails");

  const disabledInput = phaseTwelveInput({ baseInput: phaseFourInput() });
  harness.setInput(disabledInput);
  const requestCount = beehiivEngagementRequests(requestLog).length;
  clock.set("2026-10-25T12:00:00.000Z");
  await harness.handler({}, {});
  const disabled = await readPut(harness.putCalls[5]);
  assert.equal(Object.hasOwn(disabled.groups, "newsletterEmailOpens"), false);
  assert.equal(Object.hasOwn(disabled.groups, "newsletterEmailVerifiedClicks"), false,
    "removing the selected source removes both email families even with a failed subscriber refresh");
  assert.equal(beehiivEngagementRequests(requestLog).length, requestCount,
    "input9 does not make engagement requests after removal");
  assert.deepEqual(disabled.groups.newsletter, subscriberFailure.groups.newsletter,
    "subscriber failure retains only the unchanged subscriber family");
});

test("input10 sanitizes malformed prior email periods while retaining valid records and refreshing the other eight families", async () => {
  const clock = createClock("2026-10-20T12:00:00.000Z");
  let failEngagements = false;
  const newsletterResponder = ({ request }) => {
    const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    return jsonResponse(newsletterEnvelope(publicationId, 20));
  };
  const reportResponder = ({ request }) => {
    const isDirectory = request.url.includes(`/properties/${directoryGooglePropertyId}:`);
    const metricName = request.json.metrics[0]?.name;
    return jsonResponse(ga4Report({
      views: metricName === "eventCount" ? 23 : isDirectory ? 31 : 41,
      metricName,
      timeZone: isDirectory ? directoryTimeZone : googleTimeZone
    }));
  };
  const harness = createHarness({
    input: phaseThirteenInput({
      directoryAnalytics: phaseNineDirectoryAnalytics({ outboundClicks: true })
    }),
    clock,
    fetchFn: phaseThirteenFetch({
      hashnodePages: new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle()] })]]),
      newsletterResponder,
      reportResponder,
      engagementResponder: ({ request }) => failEngagements
        ? jsonResponse({ error: "synthetic engagement outage" }, 403)
        : jsonResponse(phaseThirteenEnvelopeForRequest(request))
    })
  });

  await harness.handler({}, {});
  const healthy = await readPut(harness.putCalls[0]);
  const prior = structuredClone(healthy);
  prior.groups.newsletterEmailOpens.records["30d"].scopeId = "malformed-scope";
  prior.groups.newsletterEmailVerifiedClicks.records["90d"].clicks = -1;
  harness.objects.set(outputKey, JSON.stringify(prior));
  failEngagements = true;
  clock.set("2026-10-21T12:00:00.000Z");
  await harness.handler({}, {});
  const refreshed = await readPut(harness.putCalls[1]);

  const expectedOpens = structuredClone(prior.groups.newsletterEmailOpens);
  delete expectedOpens.records["30d"];
  const expectedClicks = structuredClone(prior.groups.newsletterEmailVerifiedClicks);
  delete expectedClicks.records["90d"];
  assert.deepEqual(refreshed.groups.newsletterEmailOpens, expectedOpens,
    "valid opens periods survive verbatim and the malformed record is omitted");
  assert.deepEqual(refreshed.groups.newsletterEmailVerifiedClicks, expectedClicks,
    "click records are sanitized independently from opens");
  for (const family of ["articles", "books", "talks", "newsletter", "articleViews", "articleSearchClicks",
    "directoryViews", "directoryOutboundClicks"]) {
    assert.ok(refreshed.groups[family], `${family} remains publishable during an engagement outage`);
  }
  assert.equal(refreshed.groups.newsletter.collectedAt, "2026-10-21T12:00:00.000Z");
  assert.equal(refreshed.groups.articleViews.records["7d"].collectedAt, "2026-10-21T12:00:00.000Z");
});

test("input10 distinguishes an empty period from explicit zeros and retries only transient engagement errors", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-20T12:00:00.000Z");
  let emptySevenDays = false;
  let failTransiently = false;
  const transientAttempts = new Map();
  const harness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock,
    fetchFn: phaseThirteenFetch({
      requestLog,
      engagementResponder: ({ request }) => {
        const url = new URL(request.url);
        const startDate = url.searchParams.get("start_date");
        const attempt = (transientAttempts.get(startDate) ?? 0) + 1;
        transientAttempts.set(startDate, attempt);
        if (failTransiently && attempt === 1) {
          return jsonResponse({ error: "synthetic temporary failure" }, 503);
        }
        const envelope = phaseThirteenEnvelopeForRequest(request, (date) =>
          date >= "2026-10-11" && date <= "2026-10-17" ? { total_verified_clicks: 0 } : {});
        if (emptySevenDays) envelope.data = envelope.data.filter(({ date }) => date < "2026-10-12" || date > "2026-10-18");
        return jsonResponse(envelope);
      }
    })
  });
  failTransiently = true;
  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  const requestsAfterRetry = beehiivEngagementRequests(requestLog);
  assert.equal(requestsAfterRetry.length, 24, "twelve chunks with one transient retry each stay within 24 attempts");
  assert.deepEqual([...new Set(requestsAfterRetry.map(({ url }) => new URL(url).searchParams.get("start_date")))].length, 12);
  for (const count of transientAttempts.values()) assert.equal(count, 2, "each failed chunk retries exactly once");
  for (const request of requestsAfterRetry) {
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 5_000);
  }
  assert.equal(initial.groups.newsletterEmailVerifiedClicks.records["7d"].clicks, 0,
    "daily rows with integer zero values remain a measured period zero");

  failTransiently = false;
  emptySevenDays = true;
  clock.set("2026-10-21T12:00:00.000Z");
  await harness.handler({}, {});
  const withPrior = await readPut(harness.putCalls[1]);
  assert.deepEqual(withPrior.groups.newsletterEmailOpens.records["7d"],
    initial.groups.newsletterEmailOpens.records["7d"], "an entirely empty window retains eligible prior history");
  assert.deepEqual(withPrior.groups.newsletterEmailVerifiedClicks.records["7d"],
    initial.groups.newsletterEmailVerifiedClicks.records["7d"], "both metrics retain their prior records for an empty window");

  const noPriorLog = [];
  const noPrior = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock,
    fetchFn: phaseThirteenFetch({
      requestLog: noPriorLog,
      engagementResponder: ({ request }) => {
        const envelope = phaseThirteenEnvelopeForRequest(request, (date) =>
          date >= "2026-10-11" && date <= "2026-10-17" ? { total_verified_clicks: 0 } : {});
        envelope.data = envelope.data.filter(({ date }) => date < "2026-10-12" || date > "2026-10-18");
        return jsonResponse(envelope);
      }
    })
  });
  await noPrior.handler({}, {});
  const emptyOutput = await readPut(noPrior.putCalls[0]);
  assert.equal(Object.hasOwn(emptyOutput.groups.newsletterEmailOpens.records, "7d"), false,
    "an empty new period is unavailable rather than a guessed zero");
  assert.equal(Object.hasOwn(emptyOutput.groups.newsletterEmailVerifiedClicks.records, "7d"), false);
});

test("input10 validates echoed metadata, dates, duplicate rows and selected integer metrics", async () => {
  const invalidEnvelopes = [
    ["publication identity", (value) => { value.publication_id = "different-publication"; }],
    ["granularity", (value) => { value.granularity = "week"; }],
    ["email type", (value) => { value.email_type = "automation"; }],
    ["start date", (value) => { value.start_date = "2025-10-19"; }],
    ["requested count", (value) => { value.number_of_days += 1; }],
    ["non-array data", (value) => { value.data = {}; }],
    ["duplicate row", (value) => { value.data.push(structuredClone(value.data[0])); }],
    ["impossible row date", (value) => { value.data[0].date = "2025-02-30"; }],
    ["non-ISO row date", (value) => { value.data[0].date = "2025-10-8"; }],
    ["foreign row date", (value, request) => { value.data[0].date = addUtcDays(new URL(request.url).searchParams.get("start_date"), 40); }],
    ["too many rows", (value) => { value.data = Array.from({ length: 33 }, (_, index) => engagementRow(addUtcDays("2025-10-18", index), index)); }]
  ];
  for (const [description, corrupt] of invalidEnvelopes) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseThirteenInput({ baseInput: phaseFourInput() }),
      clock: createClock("2026-10-20T12:00:00.000Z"),
      fetchFn: phaseThirteenFetch({
        requestLog,
        engagementResponder: ({ request }) => {
          const url = new URL(request.url);
          const envelope = phaseThirteenEnvelopeForRequest(request);
          if (url.searchParams.get("start_date") === "2025-10-18") corrupt(envelope, request);
          return jsonResponse(envelope);
        }
      })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups.newsletterEmailOpens.records, "12m"), false,
      `${description} makes the intersecting 12m record unavailable without a prior value`);
    assert.equal(Object.hasOwn(output.groups.newsletterEmailVerifiedClicks.records, "12m"), false);
    assert.ok(output.groups.newsletterEmailOpens.records.ytd,
      `${description} in the first October chunk does not invalidate a disjoint YTD window`);
  }

  const invalidValues = [
    ["missing", ({ row }) => { delete row.total_opens; }],
    ["null", ({ row }) => { row.total_opens = null; }],
    ["boolean", ({ row }) => { row.total_opens = true; }],
    ["string", ({ row }) => { row.total_opens = "5"; }],
    ["fraction", ({ row }) => { row.total_opens = 1.5; }],
    ["negative", ({ row }) => { row.total_opens = -1; }],
    ["overflow", ({ row }) => {
      row.total_opens = Number.MAX_SAFE_INTEGER;
    }]
  ];
  for (const [description, corrupt] of invalidValues) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseThirteenInput({ baseInput: phaseFourInput() }),
      clock: createClock("2026-10-20T12:00:00.000Z"),
      fetchFn: phaseThirteenFetch({
        requestLog,
        engagementResponder: ({ request }) => {
          const envelope = phaseThirteenEnvelopeForRequest(request);
          mutateIntendedEngagementDate(request, envelope, "2026-01-15", (row, rows) => corrupt({ row, rows }));
          return jsonResponse(envelope);
        }
      })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups.newsletterEmailOpens.records, "12m"), false,
      `${description} invalidates the period containing its date`);
    assert.equal(Object.hasOwn(output.groups.newsletterEmailOpens.records, "ytd"), false,
      `${description} invalidates opens for YTD without creating a placeholder record`);
    assert.ok(output.groups.newsletterEmailVerifiedClicks.records.ytd,
      `${description} does not suppress the sibling metric`);
    assert.ok(output.groups.newsletterEmailOpens.records["90d"],
      `${description} does not affect a period that does not contain January 15`);
  }

  const invalidClickHarness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock: createClock("2026-10-20T12:00:00.000Z"),
    fetchFn: phaseThirteenFetch({
      engagementResponder: ({ request }) => {
        const envelope = phaseThirteenEnvelopeForRequest(request);
        mutateIntendedEngagementDate(request, envelope, "2026-01-15", (row) => { row.total_verified_clicks = null; });
        return jsonResponse(envelope);
      }
    })
  });
  await invalidClickHarness.handler({}, {});
  const invalidClickOutput = await readPut(invalidClickHarness.putCalls[0]);
  assert.ok(invalidClickOutput.groups.newsletterEmailOpens.records.ytd,
    "a malformed verified-click value leaves the open metric healthy");
  assert.equal(Object.hasOwn(invalidClickOutput.groups.newsletterEmailVerifiedClicks.records, "ytd"), false);
  assert.equal(Object.hasOwn(invalidClickOutput.groups.newsletterEmailVerifiedClicks.records, "12m"), false);
  assert.ok(invalidClickOutput.groups.newsletterEmailVerifiedClicks.records["90d"]);
});

test("input10 does not retry invalid requests, authorization errors or redirects and retries a network failure once", async () => {
  for (const status of [400, 401, 403]) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseThirteenInput({ baseInput: phaseFourInput() }),
      clock: createClock("2026-10-20T12:00:00.000Z"),
      fetchFn: phaseThirteenFetch({
        requestLog,
        engagementResponder: ({ request }) => {
          const url = new URL(request.url);
          if (url.searchParams.get("start_date") === "2025-10-18") {
            return jsonResponse({ error: "synthetic nontransient response" }, status);
          }
          return jsonResponse(phaseThirteenEnvelopeForRequest(request));
        }
      })
    });
    await harness.handler({}, {});
    const requests = beehiivEngagementRequests(requestLog);
    assert.equal(requests.length, 12, `HTTP ${status} does not retry its failed date chunk`);
    assert.equal(requests.filter(({ url }) => new URL(url).searchParams.get("start_date") === "2025-10-18").length, 1);
    assert.equal(requests[0].redirect, "error", "every provider read refuses redirects");
    assert.equal(Object.hasOwn((await readPut(harness.putCalls[0])).groups.newsletterEmailOpens.records, "12m"), false);
  }

  const redirectLog = [];
  const redirectHarness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock: createClock("2026-10-20T12:00:00.000Z"),
    fetchFn: phaseThirteenFetch({
      requestLog: redirectLog,
      engagementResponder: ({ request }) => {
        if (new URL(request.url).searchParams.get("start_date") === "2025-10-18") {
          const error = new TypeError("fetch failed");
          error.cause = new Error("unexpected redirect");
          throw error;
        }
        return jsonResponse(phaseThirteenEnvelopeForRequest(request));
      }
    })
  });
  await redirectHarness.handler({}, {});
  const redirectRequests = beehiivEngagementRequests(redirectLog);
  assert.equal(redirectRequests.length, 12, "a redirect rejected by fetch redirect:error is not retried as a network fault");
  assert.equal(redirectRequests.filter(({ url }) => new URL(url).searchParams.get("start_date") === "2025-10-18").length, 1);
  assert.equal(redirectRequests[0].redirect, "error");

  const networkLog = [];
  const harness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock: createClock("2026-10-20T12:00:00.000Z"),
    fetchFn: phaseThirteenFetch({
      requestLog: networkLog,
      engagementResponder: ({ request, attempt }) => {
        if (new URL(request.url).searchParams.get("start_date") === "2025-10-18" && attempt === 1) {
          const error = new TypeError("fetch failed");
          error.cause = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
          throw error;
        }
        return jsonResponse(phaseThirteenEnvelopeForRequest(request));
      }
    })
  });
  await harness.handler({}, {});
  const networkRequests = beehiivEngagementRequests(networkLog);
  assert.equal(networkRequests.length, 13, "one network failure gets one retry");
  assert.equal(networkRequests.filter(({ url }) => new URL(url).searchParams.get("start_date") === "2025-10-18").length, 2);
  assert.equal(Object.hasOwn((await readPut(harness.putCalls[0])).groups.newsletterEmailOpens.records, "12m"), true);
});

test("input10 uses UTC calendar month/YTD boundaries and omits YTD before the reporting year starts", async () => {
  const requestLog = [];
  const clock = createClock("2026-01-03T12:00:00.000Z");
  const harness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock,
    fetchFn: phaseThirteenFetch({
      requestLog,
      engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request))
    })
  });

  await harness.handler({}, {});
  const beforeYear = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(beforeYear.groups.newsletterEmailOpens.records, "ytd"), false);
  assert.equal(Object.hasOwn(beforeYear.groups.newsletterEmailVerifiedClicks.records, "ytd"), false);
  assert.equal(beforeYear.groups.newsletterEmailOpens.records["12m"].startDate, "2025-01-01");
  assert.equal(beforeYear.groups.newsletterEmailOpens.records["12m"].endDate, "2025-12-31");

  clock.set("2026-01-04T12:00:00.000Z");
  await harness.handler({}, {});
  const firstYearDay = await readPut(harness.putCalls[1]);
  assert.equal(firstYearDay.groups.newsletterEmailOpens.records.ytd.startDate, "2026-01-01");
  assert.equal(firstYearDay.groups.newsletterEmailOpens.records.ytd.endDate, "2026-01-01");
  assert.equal(firstYearDay.groups.newsletterEmailVerifiedClicks.records.ytd.endDate, "2026-01-01");
});

test("input10 keeps calendar-month arithmetic and clips a 366-day UTC union across February 29", async () => {
  const monthClock = createClock("2025-03-03T12:00:00.000Z");
  const monthHarness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock: monthClock,
    fetchFn: phaseThirteenFetch({ engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request)) })
  });
  await monthHarness.handler({}, {});
  const leapMonth = await readPut(monthHarness.putCalls[0]);
  assert.equal(leapMonth.groups.newsletterEmailOpens.records["12m"].startDate, "2024-03-01");
  assert.equal(leapMonth.groups.newsletterEmailOpens.records["12m"].endDate, "2025-02-28");

  const leapLog = [];
  const leapClock = createClock("2024-03-03T12:00:00.000Z");
  const leapHarness = createHarness({
    input: phaseThirteenInput({ baseInput: phaseFourInput() }),
    clock: leapClock,
    fetchFn: phaseThirteenFetch({
      requestLog: leapLog,
      engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request))
    })
  });
  await leapHarness.handler({}, {});
  const leapDayUnion = await readPut(leapHarness.putCalls[0]);
  const leapRequests = beehiivEngagementRequests(leapLog);
  assert.equal(leapRequests.length, 12, "a 366-day leap-year union still needs at most twelve chunks");
  assert.equal(leapDayUnion.groups.newsletterEmailOpens.records["12m"].startDate, "2023-03-01");
  assert.equal(leapDayUnion.groups.newsletterEmailOpens.records["12m"].endDate, "2024-02-29");
  assert.equal(leapDayUnion.groups.newsletterEmailOpens.records["12m"].opens,
    sumPhaseThirteenDates("2023-03-01", "2024-02-29", "opens"),
    "the extra provider boundary date after February 29 is clipped");
  assert.equal(leapDayUnion.groups.newsletterEmailVerifiedClicks.records["12m"].clicks,
    sumPhaseThirteenDates("2023-03-01", "2024-02-29", "clicks"));
});

test("legacy input1 and input2 reject the reserved newsletter engagement flag before provider work", async () => {
  for (const baseInput of [sourceInput(), phaseTwoInput()]) {
    for (const flag of [true, false, null, "true"]) {
      const input = structuredClone(baseInput);
      input.newsletterEngagements = flag;
      const requestLog = [];
      const harness = createHarness({ input, fetchFn: phaseThirteenFetch({ requestLog }) });
      const previous = '{"schemaVersion":1,"groups":{"articles":{"collectedAt":"2026-10-15T12:00:00.000Z"}}}';
      harness.objects.set(outputKey, previous);

      await assert.rejects(() => harness.handler({}, {}), (error) => {
        assert.equal(error.code, "INPUT_SCHEMA_INVALID");
        return true;
      });
      assert.deepEqual(requestLog, [], `input${baseInput.schemaVersion} rejects ${JSON.stringify(flag)} before provider access`);
      assert.deepEqual(harness.secretCalls, [], `input${baseInput.schemaVersion} rejects ${JSON.stringify(flag)} before credential access`);
      assert.equal(harness.putCalls.length, 0, "invalid legacy selectors never publish output");
      assert.equal(harness.objects.get(outputKey), previous, "invalid legacy selectors preserve prior output bytes");
    }
  }
});

test("input4 through input10 collect sent from one shared stats request when an English newsletter is selected", async () => {
  const cases = [
    [4, phaseFourInput()],
    [5, phaseFiveInput()],
    [6, phaseSixInput()],
    [7, phaseNineInput()],
    [8, phaseTenInput()],
    [9, phaseTwelveInput()],
    [10, phaseThirteenInput({ baseInput: phaseFourInput() })]
  ];

  for (const [version, input] of cases) {
    const requestLog = [];
    const harness = createHarness({
      input,
      clock: createClock("2026-10-21T12:00:00.000Z"),
      fetchFn: phaseThirteenFetch({
        requestLog,
        newsletterResponder: ({ request }) => {
          const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
          return jsonResponse(newsletterEnvelope(publicationId, 42, 1_234));
        }
      })
    });

    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    const group = output.groups.newsletterEmailsSent;
    assert.ok(group, `input${version} publishes the selected cumulative sent family`);
    assert.deepEqual(Object.keys(group).sort(), [
      "basis", "collectedAt", "definitionVersion", "publication", "scopeId", "sent"
    ]);
    assert.equal(group.definitionVersion, 1);
    assert.equal(group.basis, "cumulative");
    assert.equal(group.collectedAt, "2026-10-21T12:00:00.000Z");
    assert.equal(group.scopeId, newsletterEmailsSentScopeId());
    assert.deepEqual(group.publication, { id: "simple-aws", label: "Simple AWS", language: "en" });
    assert.equal(group.sent, 1_234);
    assert.equal(output.groups.newsletter.subscribers, 42, "the existing current-subscriber metric remains independent");

    const publicationRequests = requestLog.filter(({ kind }) => kind === "beehiiv");
    assert.equal(publicationRequests.length, 1, `input${version} shares the existing publication request`);
    const request = publicationRequests[0];
    assert.equal(request.url, `https://api.beehiiv.com/v2/publications/${encodeURIComponent(beehiivPublicationId)}?expand=stats`);
    assert.equal(request.method, "GET");
    assert.equal(newsletterRequestHeader(request, "authorization"), `Bearer ${beehiivApiKey}`);
    assert.equal(request.redirect, "error");
    assert.ok(request.signal);
    assert.equal(harness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000);
    const expectedSecretReads = version <= 6 ? 1 : 2;
    assert.equal(harness.secretCalls.length, expectedSecretReads,
      `input${version} performs no extra secret read for the sent field`);
    assertNoNewsletterCanaries(harness, beehiivApiKey, beehiivPublicationId, beehiivSecretExtraFieldCanary);
  }
});

test("total_sent accepts safe nonnegative integers, treats booleans as unavailable, and fails independently", async () => {
  const malformedValues = [
    ["true marker", true],
    ["false marker", false],
    ["null", null],
    ["string", "12"],
    ["fraction", 1.5],
    ["negative", -1],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["object", { count: 12 }],
    ["array", [12]]
  ];

  for (const [description, totalSent] of malformedValues) {
    const requestLog = [];
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseThirteenFetch({
        requestLog,
        newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17, totalSent))
      })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "newsletterEmailsSent"), false,
      `${description} must leave sent unavailable, never coerce it to zero`);
    assert.equal(output.groups.newsletter.subscribers, 17, "a bad total_sent value does not invalidate subscribers");
    assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 1);
  }

  const missingField = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseThirteenFetch({
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17))
    })
  });
  await missingField.handler({}, {});
  assert.equal(Object.hasOwn((await readPut(missingField.putCalls[0])).groups, "newsletterEmailsSent"), false,
    "a missing total_sent field is unavailable");

  const zero = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseThirteenFetch({
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17, 0))
    })
  });
  await zero.handler({}, {});
  const zeroGroup = (await readPut(zero.putCalls[0])).groups.newsletterEmailsSent;
  assert.ok(zeroGroup, "a numeric total_sent zero is eligible for publication");
  assert.equal(zeroGroup.sent, 0,
    "numeric zero is a measured cumulative value");

  const badSubscriber = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseThirteenFetch({
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, true, 0))
    })
  });
  await badSubscriber.handler({}, {});
  const independent = await readPut(badSubscriber.putCalls[0]);
  assert.equal(Object.hasOwn(independent.groups, "newsletter"), false);
  assert.ok(independent.groups.newsletterEmailsSent, "the valid sent field can publish without subscribers");
  assert.equal(independent.groups.newsletterEmailsSent.sent, 0,
    "an invalid subscriber value does not invalidate a healthy sent value");
});

test("sent and subscriber failures retain their own prior group, share common failures, and recover", async () => {
  let mode = "success";
  let selectedPublicationId = "publication-a";
  const secretFailures = new Map();
  const requestLog = [];
  const responder = ({ request }) => {
    const requestedId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    if (mode === "http-failure") return jsonResponse({ error: "synthetic shared provider failure" }, 503);
    if (mode === "stats-failure") return jsonResponse({ data: { id: requestedId } });
    const responseId = mode === "identity-failure" ? "publication-a" : requestedId;
    const subscribers = mode === "sent-failure" ? 20 : mode === "subscriber-failure" ? true : 30;
    const totalSent = mode === "sent-failure" ? "invalid" : mode === "subscriber-failure" ? 44 : 55;
    return jsonResponse(newsletterEnvelope(responseId, subscribers, totalSent));
  };
  const harness = createHarness({
    input: phaseFourInput({ newsletter: { id: "simple-aws", publicationId: selectedPublicationId, language: "en" } }),
    fetchFn: phaseThirteenFetch({ requestLog, newsletterResponder: responder }),
    secretFailures
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  const firstSubscriber = first.groups.newsletter;
  const firstSent = first.groups.newsletterEmailsSent;
  assert.equal(firstSubscriber.subscribers, 30);
  assert.ok(firstSent, "the initial response contains a valid sent field");
  assert.equal(firstSent.sent, 55);

  mode = "sent-failure";
  harness.clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const sentFailure = await readPut(harness.putCalls[1]);
  assert.deepEqual(sentFailure.groups.newsletterEmailsSent, firstSent,
    "a malformed sent field retains its exact old collection time and scope");
  assert.equal(sentFailure.groups.newsletter.subscribers, 20,
    "the healthy subscriber field refreshes when sent is unavailable");
  assert.equal(sentFailure.groups.newsletter.collectedAt, "2026-10-22T12:00:00.000Z");
  assert.equal(sentFailure.groups.newsletterEmailsSent.collectedAt, firstSent.collectedAt,
    "retaining sent does not rewrite its collection time to the subscriber refresh time");

  const subscriberBeforeFailure = sentFailure.groups.newsletter;
  mode = "subscriber-failure";
  harness.clock.set("2026-10-23T12:00:00.000Z");
  await harness.handler({}, {});
  const subscriberFailure = await readPut(harness.putCalls[2]);
  assert.deepEqual(subscriberFailure.groups.newsletter, subscriberBeforeFailure,
    "an invalid subscriber field retains only its exact prior family");
  assert.equal(subscriberFailure.groups.newsletterEmailsSent.sent, 44,
    "the healthy sent field refreshes when subscribers are unavailable");
  assert.equal(subscriberFailure.groups.newsletter.collectedAt, "2026-10-22T12:00:00.000Z");
  assert.equal(subscriberFailure.groups.newsletterEmailsSent.collectedAt, "2026-10-23T12:00:00.000Z",
    "refreshing sent does not rewrite the retained subscriber collection time");

  const beforeCommonFailure = await readPut(harness.putCalls[2]);
  secretFailures.set(beehiivSecretArn, new Error("synthetic secret access failure"));
  harness.clock.set("2026-10-24T12:00:00.000Z");
  const requestsBeforeCredentialFailure = requestLog.filter(({ kind }) => kind === "beehiiv").length;
  await harness.handler({}, {});
  const credentialFailure = await readPut(harness.putCalls[3]);
  assert.deepEqual(credentialFailure.groups.newsletter, beforeCommonFailure.groups.newsletter);
  assert.deepEqual(credentialFailure.groups.newsletterEmailsSent, beforeCommonFailure.groups.newsletterEmailsSent);
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, requestsBeforeCredentialFailure,
    "one shared credential failure prevents the publication request for both fields");
  assert.equal(harness.secretCalls.length, 4, "each invocation reads one credential for both publication fields");

  secretFailures.delete(beehiivSecretArn);
  mode = "http-failure";
  harness.clock.set("2026-10-25T12:00:00.000Z");
  const requestsBeforeHttpFailure = requestLog.filter(({ kind }) => kind === "beehiiv").length;
  await harness.handler({}, {});
  const httpFailure = await readPut(harness.putCalls[4]);
  assert.deepEqual(httpFailure.groups.newsletter, beforeCommonFailure.groups.newsletter);
  assert.deepEqual(httpFailure.groups.newsletterEmailsSent, beforeCommonFailure.groups.newsletterEmailsSent);
  const failedRequests = requestLog.filter(({ kind }) => kind === "beehiiv").slice(requestsBeforeHttpFailure);
  assert.equal(failedRequests.length, 2, "a shared transient HTTP error gets the existing single retry");
  assert.ok(failedRequests.every(({ url }) => url.endsWith("?expand=stats")));

  mode = "stats-failure";
  harness.clock.set("2026-10-26T12:00:00.000Z");
  await harness.handler({}, {});
  const statsFailure = await readPut(harness.putCalls[5]);
  assert.deepEqual(statsFailure.groups.newsletter, beforeCommonFailure.groups.newsletter,
    "a missing shared stats object retains the prior subscriber group");
  assert.deepEqual(statsFailure.groups.newsletterEmailsSent, beforeCommonFailure.groups.newsletterEmailsSent,
    "a missing shared stats object retains the prior sent group");

  selectedPublicationId = "publication-b";
  harness.setInput(phaseFourInput({
    newsletter: { id: "simple-aws", publicationId: selectedPublicationId, language: "en" }
  }));
  mode = "identity-failure";
  harness.clock.set("2026-10-27T12:00:00.000Z");
  await harness.handler({}, {});
  const identityFailure = await readPut(harness.putCalls[6]);
  assert.deepEqual(identityFailure.groups.newsletter, beforeCommonFailure.groups.newsletter,
    "a publication identity mismatch is common to both fields and cannot relabel the old subscriber count");
  assert.deepEqual(identityFailure.groups.newsletterEmailsSent, beforeCommonFailure.groups.newsletterEmailsSent,
    "a publication identity mismatch cannot relabel the old cumulative sent count");

  mode = "success";
  harness.clock.set("2026-10-28T12:00:00.000Z");
  await harness.handler({}, {});
  const recovered = await readPut(harness.putCalls[7]);
  assert.equal(recovered.groups.newsletter.subscribers, 30);
  assert.equal(recovered.groups.newsletterEmailsSent.sent, 55);
  assert.notEqual(recovered.groups.newsletterEmailsSent.scopeId, beforeCommonFailure.groups.newsletterEmailsSent.scopeId);
  assert.equal(recovered.groups.newsletterEmailsSent.scopeId, newsletterEmailsSentScopeId("publication-b"));
  assert.equal(recovered.groups.newsletterEmailsSent.collectedAt, "2026-10-28T12:00:00.000Z");
  assertNoNewsletterCanaries(harness, beehiivApiKey, "synthetic secret access failure", "synthetic shared provider failure");
});

test("malformed prior sent groups are omitted, and an ineligible or removed newsletter cannot retain them", async () => {
  const sentBase = priorNewsletterEmailsSentGroup();
  const malformedGroups = [
    { ...sentBase, basis: "current" },
    { ...sentBase, sent: Number.MAX_SAFE_INTEGER + 1 },
    { ...sentBase, privateField: "synthetic prior sent canary" }
  ];
  for (const malformedGroup of malformedGroups) {
    const harness = createHarness({
      input: phaseFourInput(),
      fetchFn: phaseThirteenFetch({
        newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17, false))
      })
    });
    harness.objects.set(outputKey, JSON.stringify({
      schemaVersion: 1,
      groups: { newsletterEmailsSent: malformedGroup }
    }));
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "newsletterEmailsSent"), false,
      "a malformed previous whole-family value is dropped rather than relabeled or partially repaired");
    assert.equal(output.groups.newsletter.subscribers, 17);
    assertNoNewsletterCanaries(harness, "synthetic prior sent canary");
  }

  let failSpanishSubscriber = false;
  const spanish = createHarness({
    input: phaseFourInput({ newsletter: { id: "simple-aws", publicationId: beehiivPublicationId, language: "en" } }),
    fetchFn: phaseThirteenFetch({
      newsletterResponder: () => jsonResponse(newsletterEnvelope(
        beehiivPublicationId,
        failSpanishSubscriber ? true : 17,
        100
      ))
    })
  });
  await spanish.handler({}, {});
  const priorEnglish = await readPut(spanish.putCalls[0]);
  const priorEnglishSent = priorEnglish.groups.newsletterEmailsSent;
  assert.ok(priorEnglishSent, "the initial English selection publishes the sent family");
  spanish.setInput(phaseFourInput({
    newsletter: { id: "simple-aws", publicationId: beehiivPublicationId, language: "es" }
  }));
  failSpanishSubscriber = true;
  spanish.clock.set("2026-10-22T12:00:00.000Z");
  await spanish.handler({}, {});
  const spanishOutput = await readPut(spanish.putCalls[1]);
  assert.equal(Object.hasOwn(spanishOutput.groups, "newsletterEmailsSent"), false,
    "an existing Spanish subscriber selection cannot retain the English-only sent family");
  assert.deepEqual(spanishOutput.groups.newsletter, priorEnglish.groups.newsletter,
    "the legacy subscriber fallback still retains its own prior group on provider field failure");

  const requestLog = [];
  const articleFetcher = builderApiFetch({
    requestLog,
    caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic removed-selection article failure" }, 503)]])
  });
  const removed = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseThirteenFetch({
      requestLog,
      articleFetcher,
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17, 100))
    })
  });
  await removed.handler({}, {});
  const prior = await readPut(removed.putCalls[0]);
  assert.ok(prior.groups.newsletterEmailsSent);
  const noNewsletter = phaseNineInput({ baseInput: phaseFourInput() });
  delete noNewsletter.newsletter;
  removed.setInput(noNewsletter);
  removed.clock.set("2026-10-22T12:00:00.000Z");
  await removed.handler({}, {});
  const outputWithoutSelection = await readPut(removed.putCalls[1]);
  assert.equal(Object.hasOwn(outputWithoutSelection.groups, "newsletterEmailsSent"), false,
    "selection removal prevents fallback from restoring the old sent family while articles fail");
  assert.equal(Object.hasOwn(outputWithoutSelection.groups, "newsletter"), false,
    "selection removal preserves the existing subscriber-family removal behavior");
  assert.equal(removed.secretCalls.length, 1, "input without newsletter does not read Beehiiv credentials");
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 1,
    "input without newsletter makes no Beehiiv publication request");
});

test("each invocation rereads cumulative sent without warm-runtime accumulation", async () => {
  let sent = 100;
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput(),
    fetchFn: phaseThirteenFetch({
      requestLog,
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 20, sent))
    })
  });

  await harness.handler({}, {});
  const first = (await readPut(harness.putCalls[0])).groups.newsletterEmailsSent;
  assert.ok(first, "the first valid provider total is published");
  sent = 90;
  harness.clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const second = (await readPut(harness.putCalls[1])).groups.newsletterEmailsSent;

  assert.equal(first.sent, 100);
  assert.ok(second, "the next invocation publishes its current provider total");
  assert.equal(second.sent, 90, "a lower corrected provider total replaces the previous observation without clamping or accumulating");
  assert.equal(second.scopeId, first.scopeId);
  assert.notEqual(second.collectedAt, first.collectedAt);
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 2,
    "each invocation makes one shared publication stats request");
  assert.equal(harness.secretCalls.length, 2, "each invocation retrieves the existing credential once");
});

test("input4 dispatches sent using the normalized English newsletter language and retains its own prior value", async () => {
  let subscribers = 17;
  let totalSent = 100;
  const requestLog = [];
  const clock = createClock("2026-10-21T12:00:00.000Z");
  const newsletter = { id: "simple-aws", publicationId: beehiivPublicationId, language: "en" };
  const input = phaseFourInput({ newsletter });
  const harness = createHarness({
    input,
    clock,
    fetchFn: phaseFourApiFetch({
      requestLog,
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, subscribers, totalSent))
    })
  });
  assert.equal(input.sources.some(({ id }) => id === "simple-aws"), false,
    "the no-catalog source path leaves the newsletter selection for collection-time normalization");

  await harness.handler({}, {});
  const initial = await readPut(harness.putCalls[0]);
  assert.equal(initial.groups.newsletterEmailsSent.sent, 100);

  harness.setInput(phaseFourInput({ newsletter: { ...newsletter, language: " en " } }));
  totalSent = 90;
  clock.set("2026-10-22T12:00:00.000Z");
  await harness.handler({}, {});
  const refreshed = await readPut(harness.putCalls[1]);
  const refreshedSent = refreshed.groups.newsletterEmailsSent;
  assert.equal(refreshed.groups.newsletter.publication.language, "en");
  assert.equal(refreshedSent.sent, 90, "normalized English selection publishes the fresh sent value");
  assert.equal(refreshedSent.scopeId, initial.groups.newsletterEmailsSent.scopeId);
  assert.equal(refreshedSent.collectedAt, "2026-10-22T12:00:00.000Z");

  subscribers = 18;
  totalSent = "unavailable";
  clock.set("2026-10-23T12:00:00.000Z");
  await harness.handler({}, {});
  const retained = await readPut(harness.putCalls[2]);
  assert.equal(retained.groups.newsletter.subscribers, 18, "subscriber refresh remains independent from sent failure");
  assert.deepEqual(retained.groups.newsletterEmailsSent, refreshedSent,
    "normalized English selection retains its own prior sent group on a bad sent value");
  assert.equal(requestLog.filter(({ kind }) => kind === "beehiiv").length, 3,
    "each collection invocation uses the existing single publication request");
  assert.equal(harness.secretCalls.length, 3, "the sent family adds no secret read");
});

test("Builder rejects invalid resultsSize metadata and retains a valid prior Articles family", async () => {
  const invalidCounts = [
    { label: "larger positive count", include: true, value: 13 },
    { label: "zero count with a returned row", include: true, value: 0 },
    { label: "string count", include: true, value: "1" },
    { label: "negative count", include: true, value: -1 },
    { label: "unsafe integer", include: true, value: Number.MAX_SAFE_INTEGER + 1 },
    { label: "missing count", include: false }
  ];
  const previousArticles = priorGroup({
    collectedAt: "2026-10-15T12:00:00.000Z",
    scopeId: "5".repeat(64),
    counts: { all: 53, en: 41, es: 12 }
  });

  for (const [index, invalid] of invalidCounts.entries()) {
    const builderPage = { articles: [builderArticle({ id: `bad-results-size-${index}` })] };
    if (invalid.include) builderPage.resultsSize = invalid.value;
    const requestLog = [];
    const harness = createHarness({
      input: phaseThreeInput({ curated: {
        talks: [talkFact(`healthy-talk-${index}`)],
        books: [bookFact(`healthy-book-${index}`)]
      } }),
      fetchFn: builderApiFetch({
        caylentPages: new Map([[0, { results: [] }]]),
        builderPages: new Map([["", builderPage]]),
        requestLog
      })
    });
    harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { articles: previousArticles } }));

    await harness.handler({}, {});

    assert.equal(harness.putCalls.length, 1, `${invalid.label}: healthy curated siblings still publish`);
    const output = await readPut(harness.putCalls[0]);
    assert.equal(JSON.stringify(output.groups.articles), JSON.stringify(previousArticles),
      `${invalid.label}: the complete prior Articles family remains verbatim`);
    assert.deepEqual(output.groups.articles.counts, { all: 53, en: 41, es: 12 });
    assert.deepEqual(output.groups.talks.counts, { all: 1, en: 1, es: 0 });
    assert.deepEqual(output.groups.books.counts, { all: 1, en: 1, es: 0 });
    assert.equal(requestLog.filter(({ kind }) => kind === "builder-list").length, 1);
  }

  const noPriorLog = [];
  const noPrior = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("healthy-talk-without-prior")],
      books: [bookFact("healthy-book-without-prior")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [builderArticle({ id: "bad-without-prior" })], resultsSize: 13 }]]),
      requestLog: noPriorLog
    })
  });

  await noPrior.handler({}, {});

  assert.equal(noPrior.putCalls.length, 1);
  const withoutPriorOutput = await readPut(noPrior.putCalls[0]);
  assert.equal(Object.hasOwn(withoutPriorOutput.groups, "articles"), false,
    "a failed first inventory is unavailable instead of an invented zero count");
  assert.deepEqual(withoutPriorOutput.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(withoutPriorOutput.groups.books.counts, { all: 1, en: 1, es: 0 });
  assert.equal(noPriorLog.filter(({ kind }) => kind === "builder-list").length, 1);
});

test("Builder recovers after a bad page and continues through valid short and empty cursor pages", async () => {
  const requestLog = [];
  const firstRow = builderArticle({ id: "recovered-builder-row", title: "Recovered Builder inventory" });
  const builderPages = new Map([["", { articles: [firstRow], resultsSize: 13 }]]);
  const previousArticles = priorGroup({
    collectedAt: "2026-10-15T12:00:00.000Z",
    scopeId: "6".repeat(64),
    counts: { all: 53, en: 41, es: 12 }
  });
  const harness = createHarness({
    input: phaseThreeInput({ curated: {
      talks: [talkFact("recovery-talk")],
      books: [bookFact("recovery-book")]
    } }),
    fetchFn: builderApiFetch({
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages,
      requestLog
    })
  });
  harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { articles: previousArticles } }));

  await harness.handler({}, {});

  const afterFailure = await readPut(harness.putCalls[0]);
  assert.equal(JSON.stringify(afterFailure.groups.articles), JSON.stringify(previousArticles));
  assert.deepEqual(afterFailure.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(afterFailure.groups.books.counts, { all: 1, en: 1, es: 0 });

  builderPages.set("", { articles: [firstRow], cursor: "short-page-cursor", resultsSize: 1 });
  builderPages.set("short-page-cursor", { articles: [], cursor: "empty-page-cursor", resultsSize: 0 });
  builderPages.set("empty-page-cursor", { articles: [], resultsSize: 0 });
  await harness.handler({}, {});

  const recovered = await readPut(harness.putCalls[1]);
  assert.deepEqual(recovered.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(recovered.groups.talks.counts, { all: 1, en: 1, es: 0 });
  assert.deepEqual(recovered.groups.books.counts, { all: 1, en: 1, es: 0 });
  const builderRequests = requestLog.filter(({ kind }) => kind === "builder-list");
  assert.deepEqual(builderRequests.slice(1).map(({ cursor, cursorParameterPresent }) => [cursor, cursorParameterPresent]), [
    ["", false],
    ["short-page-cursor", true],
    ["empty-page-cursor", true]
  ], "short and empty pages continue while the terminal empty page ends enumeration");
});

async function flushGooglePeriodMicrotasks() {
  for (let index = 0; index < 80; index += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function runHandlerWithVirtualAbortDeadlines(handlerPromise, timers, getTime, setTime) {
  let outcome;
  handlerPromise.then(
    (value) => { outcome = { value }; },
    (error) => { outcome = { error }; }
  );

  for (let step = 0; !outcome && step < 100; step += 1) {
    await flushGooglePeriodMicrotasks();
    if (outcome) break;

    const pendingTimers = timers.filter(({ settled, signal }) => !settled && !signal.aborted);
    if (pendingTimers.length === 0) continue;
    const nextDeadline = Math.min(...pendingTimers.map(({ deadline }) => deadline));
    setTime(nextDeadline);
    for (const timer of pendingTimers) {
      if (timer.deadline <= nextDeadline) timer.controller.abort(new Error("synthetic virtual timeout"));
    }
  }

  assert.ok(outcome, "the handler must settle after all recorded request deadlines");
  if (Object.hasOwn(outcome, "error")) throw outcome.error;
  return { value: outcome.value, elapsed: getTime() };
}

function googlePeriodFamily(request) {
  const url = new URL(request.url);
  const propertyId = url.pathname.match(/\/properties\/(\d+):runReport$/)?.[1];
  if (propertyId !== directoryGooglePropertyId) return "articleViews";
  return request.json.metrics[0]?.name === "eventCount" ? "directoryOutboundClicks" : "directoryViews";
}

function healthyGoogleReport(request) {
  const family = googlePeriodFamily(request);
  const metricName = request.json.metrics[0]?.name;
  const directory = family !== "articleViews";
  const views = metricName === "eventCount" ? 5 : directory ? 6 : 4;
  return jsonResponse(ga4Report({
    views,
    metricName,
    timeZone: directory ? directoryTimeZone : googleTimeZone
  }));
}

test("a stalled Analytics endpoint times out in parallel by family and still publishes healthy siblings", async () => {
  const directoryAnalytics = phaseNineDirectoryAnalytics({ outboundClicks: true, recordedSince: "2024-01-21" });
  const analytics = phaseFiveAnalytics({ recordedSince: "2024-01-01" });
  const hashnodePages = new Map([[1, cloudyHashnodePage({ rows: [cloudyArticle()] })]]);
  const previousInput = phaseThirteenInput({
    analytics,
    directoryAnalytics,
    curated: { talks: [talkFact("before-google-stall")], books: [bookFact("before-google-stall")] }
  });
  const previousLog = [];
  const previousHarness = createHarness({
    input: previousInput,
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: phaseThirteenFetch({
      requestLog: previousLog,
      hashnodePages,
      engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request)),
      newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, 17, 100)),
      postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
      reportResponder: ({ request }) => healthyGoogleReport(request)
    })
  });
  await previousHarness.handler({}, {});
  const previous = await readPut(previousHarness.putCalls[0]);
  for (const family of ["articleViews", "directoryViews", "directoryOutboundClicks"]) {
    assert.equal(Object.keys(previous.groups[family].records).length, 6, `${family} supplies prior records for all eligible periods`);
  }

  const currentInput = phaseThirteenInput({
    analytics,
    directoryAnalytics,
    curated: {
      talks: [talkFact("before-google-stall"), talkFact("after-google-stall")],
      books: [bookFact("before-google-stall"), bookFact("after-google-stall")]
    }
  });
  const requestLog = [];
  let subscribers = 29;
  let sent = 120;
  let virtualNow = 0;
  const virtualTimers = [];
  const timerBySignal = new Map();
  const originalAbortTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (milliseconds) => {
    const controller = new AbortController();
    const timer = {
      controller,
      signal: controller.signal,
      milliseconds,
      deadline: virtualNow + milliseconds,
      settled: false
    };
    virtualTimers.push(timer);
    timerBySignal.set(timer.signal, timer);
    return timer.signal;
  };

  const activeByProperty = new Map();
  const activeFamilyByProperty = new Map();
  const peakByProperty = new Map();
  const familyStarts = [];
  const concurrencyViolations = [];
  const phaseFetch = phaseThirteenFetch({
    requestLog,
    hashnodePages,
    engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request)),
    newsletterResponder: () => jsonResponse(newsletterEnvelope(beehiivPublicationId, subscribers, sent)),
    postsResponder: () => jsonResponse(beehiivPostsEnvelope([])),
    reportResponder: ({ request }) => {
      const family = googlePeriodFamily(request);
      const propertyId = new URL(request.url).pathname.match(/\/properties\/(\d+):runReport$/)?.[1];
      familyStarts.push({ family, propertyId, at: virtualNow });
      const activeFamily = activeFamilyByProperty.get(propertyId);
      if (activeFamily !== undefined && activeFamily !== family) {
        concurrencyViolations.push(`overlap:${activeFamily}:${family}`);
      }
      activeFamilyByProperty.set(propertyId, family);
      const active = (activeByProperty.get(propertyId) ?? 0) + 1;
      activeByProperty.set(propertyId, active);
      peakByProperty.set(propertyId, Math.max(peakByProperty.get(propertyId) ?? 0, active));

      return new Promise((_resolve, reject) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          const remaining = activeByProperty.get(propertyId) - 1;
          activeByProperty.set(propertyId, remaining);
          if (remaining === 0) {
            activeByProperty.delete(propertyId);
            activeFamilyByProperty.delete(propertyId);
          }
        };
        request.signal.addEventListener("abort", () => {
          finish();
          reject(new Error("synthetic Analytics endpoint stall"));
        }, { once: true });
        if (request.signal.aborted) {
          finish();
          reject(new Error("synthetic Analytics endpoint stall"));
        }
      });
    },
    searchResponder: () => jsonResponse(searchConsoleResponse({ clicks: 55 }))
  });
  const stalledHarness = createHarness({
    input: currentInput,
    clock: createClock("2026-10-17T12:00:00.000Z"),
    fetchFn: async (input, init) => {
      const timer = timerBySignal.get(init.signal);
      try {
        return await phaseFetch(input, init);
      } finally {
        if (timer) timer.settled = true;
      }
    }
  });
  stalledHarness.objects.set(outputKey, JSON.stringify(previous));

  try {
    let run;
    try {
      run = await runHandlerWithVirtualAbortDeadlines(
        stalledHarness.handler({}, {}),
        virtualTimers,
        () => virtualNow,
        (value) => { virtualNow = value; }
      );
    } catch (error) {
      throw error;
    }
    assert.equal(run.elapsed, 60_000, "three six-period GA4 families each consume two overlapping ten-second attempts");
    assert.ok(run.elapsed < 300_000, "healthy siblings publish inside the existing Lambda runtime budget");
  } finally {
    AbortSignal.timeout = originalAbortTimeout;
  }

  assert.equal(stalledHarness.abortSignalRecords.length, virtualTimers.length,
    "the virtual scheduler accounts for each actual request timeout created by the handler");
  const googleReports = googleRequests(requestLog, "google-report");
  assert.equal(googleReports.length, 36, "six reports in each of three failed families retry once");
  assert.deepEqual(Object.fromEntries(["articleViews", "directoryViews", "directoryOutboundClicks"].map((family) => [
    family,
    familyStarts.filter((start) => start.family === family).length
  ])), { articleViews: 12, directoryViews: 12, directoryOutboundClicks: 12 });
  assert.deepEqual([...new Set(familyStarts.map(({ family }) => family))], [
    "articleViews", "directoryViews", "directoryOutboundClicks"
  ], "Google families stay sequential while periods run together within each family");
  assert.deepEqual([...new Set(familyStarts.filter(({ family }) => family === "articleViews").map(({ at }) => at))], [0, 10_000],
    "all article periods start together and retry together at their recorded deadlines");
  assert.deepEqual([...new Set(familyStarts.filter(({ family }) => family === "directoryViews").map(({ at }) => at))], [20_000, 30_000]);
  assert.deepEqual([...new Set(familyStarts.filter(({ family }) => family === "directoryOutboundClicks").map(({ at }) => at))], [40_000, 50_000]);
  assert.equal(peakByProperty.size, 2, "the selected reports cover the article and directory properties");
  for (const [propertyId, peak] of peakByProperty) {
    assert.equal(peak, 6, `all six periods start together for property ${propertyId}, without exceeding the quota bound`);
  }
  assert.deepEqual(concurrencyViolations, [], "directory Views and click families never overlap for one property");
  assert.equal(googleRequests(requestLog, "google-search").length, 5, "healthy Search still refreshes every supported period");
  for (const request of [...googleReports, ...googleRequests(requestLog, "google-search")]) {
    assert.equal(stalledHarness.abortSignalRecords.find(({ signal }) => signal === request.signal)?.milliseconds, 10_000,
      "Google report and Search requests keep their actual ten-second timeout");
  }
  assert.deepEqual(stalledHarness.parameterCalls, [{ Name: googleOAuthParameterArn, WithDecryption: true }]);
  assert.equal(googleRequests(requestLog, "google-oauth").length, 1, "the invocation refreshes one shared Google token");
  assert.equal(stalledHarness.putCalls.length, 1, "one complete aggregate is written after the Google failures settle");

  const output = await readPut(stalledHarness.putCalls[0]);
  for (const family of ["articleViews", "directoryViews", "directoryOutboundClicks"]) {
    assert.deepEqual(output.groups[family], previous.groups[family], `${family} keeps every exact prior period record`);
  }
  assert.equal(output.groups.articleSearchClicks.records["7d"].clicks, 55);
  assert.equal(output.groups.articleSearchClicks.records["7d"].collectedAt, "2026-10-17T12:00:00.000Z");
  assert.ok(output.groups.articles, "the healthy article count remains available during the Google stall");
  assert.equal(output.groups.articles.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.deepEqual(output.groups.talks.counts, { all: 2, en: 2, es: 0 });
  assert.equal(output.groups.talks.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.deepEqual(output.groups.books.counts, { all: 2, en: 2, es: 0 });
  assert.equal(output.groups.books.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.equal(output.groups.newsletter.subscribers, 29);
  assert.equal(output.groups.newsletter.collectedAt, "2026-10-17T12:00:00.000Z");
  assert.equal(output.groups.newsletterEmailsSent.sent, 120);
  assert.equal(output.groups.newsletterEmailsSent.collectedAt, "2026-10-17T12:00:00.000Z");
  assertNoGoogleCanaries(stalledHarness, googleClientSecret, googleRefreshToken, googleResponseCanary);
});

test("Search periods settle out of order, retain only their own failures, and use range-order failure selection", async () => {
  const clock = createClock("2026-10-16T04:30:00.000Z");
  const requestLog = [];
  const pendingSearch = [];
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  const harness = createHarness({
    input: phaseSixInput(),
    clock,
    fetchFn: phaseFiveApiFetch({
      requestLog,
      searchResponder: ({ request }) => new Promise((resolve) => pendingSearch.push({ request, resolve }))
    })
  });
  harness.objects.set(outputKey, JSON.stringify(previous));
  let handlerOutcome;
  const handlerCompletion = harness.handler({}, {}).then(
    (value) => { handlerOutcome = { value }; },
    (error) => { handlerOutcome = { error }; }
  );

  for (let step = 0; pendingSearch.length < 5 && step < 100; step += 1) await flushGooglePeriodMicrotasks();
  assert.equal(pendingSearch.length, 5, "all five supported Search periods start before any response completes");
  assert.equal(harness.putCalls.length, 0, "publication waits for every period in the Search family");
  const requestStarts = pendingSearch.map(({ request }) => request.json.startDate);
  assert.deepEqual(requestStarts, ["2026-10-06", "2026-09-13", "2026-07-15", "2025-10-13", "2026-01-01"]);

  const completionOrder = [];
  for (const { request, resolve } of [...pendingSearch].reverse()) {
    const startDate = request.json.startDate;
    completionOrder.push(startDate);
    const response = startDate === "2026-09-13"
      ? jsonResponse({ error: googleResponseCanary }, 403)
      : startDate === "2025-10-13"
        ? jsonResponse({ error: googleResponseCanary }, 404)
        : jsonResponse(searchConsoleResponse({ clicks: 70 }));
    resolve(response);
    await flushGooglePeriodMicrotasks();
  }
  await handlerCompletion;

  assert.deepEqual(completionOrder, ["2026-01-01", "2025-10-13", "2026-07-15", "2026-09-13", "2026-10-06"]);
  assert.equal(handlerOutcome?.error, undefined);
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articleSearchClicks.records["30d"], previous.groups.articleSearchClicks.records["30d"]);
  assert.deepEqual(output.groups.articleSearchClicks.records["12m"], previous.groups.articleSearchClicks.records["12m"]);
  for (const period of ["7d", "90d", "ytd"]) {
    assert.equal(output.groups.articleSearchClicks.records[period].clicks, 70);
    assert.equal(output.groups.articleSearchClicks.records[period].collectedAt, "2026-10-16T04:30:00.000Z");
  }
  const successLog = JSON.parse(harness.logs.find((line) => line.includes('"event":"content_stats_collection_succeeded"')));
  assert.equal(successLog.familyFailures.articleSearchClicks, "SOURCE_HTTP_403",
    "the first failure follows supported-range order even when a later range failed earlier");
  assert.equal(googleRequests(requestLog, "google-search").length, 5, "non-retryable failures do not launch duplicate Search requests");
  assert.equal(harness.putCalls.length, 1);
  assertNoGoogleCanaries(harness, googleResponseCanary);
});

test("an unexpected Search period error waits for other started periods and cannot publish", async () => {
  const requestLog = [];
  const pendingSearch = [];
  const previous = priorFullOutput();
  previous.groups.articleSearchClicks = priorArticleSearchClicksGroup();
  const previousBytes = JSON.stringify(previous);
  const harness = createHarness({
    input: phaseSixInput(),
    clock: createClock("2026-10-16T04:30:00.000Z"),
    fetchFn: phaseFiveApiFetch({
      requestLog,
      searchResponder: ({ request }) => new Promise((resolve) => pendingSearch.push({ request, resolve }))
    })
  });
  harness.objects.set(outputKey, previousBytes);
  let handlerOutcome;
  const handlerCompletion = harness.handler({}, {}).then(
    (value) => { handlerOutcome = { value }; },
    (error) => { handlerOutcome = { error }; }
  );

  for (let step = 0; pendingSearch.length < 5 && step < 100; step += 1) await flushGooglePeriodMicrotasks();
  assert.equal(pendingSearch.length, 5, `all Search requests launch before the synthetic process error (handler=${JSON.stringify(handlerOutcome)})`);
  let programmerErrorObserved = false;
  const firstPeriod = pendingSearch.find(({ request }) => request.json.startDate === "2026-10-06");
  const malformedRow = { keys: [] };
  Object.defineProperty(malformedRow, "clicks", {
    enumerable: true,
    get() {
      programmerErrorObserved = true;
      throw new Error("synthetic Search validation programmer error");
    }
  });
  firstPeriod.resolve(jsonResponse({ responseAggregationType: "byPage", rows: [malformedRow] }));
  await flushGooglePeriodMicrotasks();
  assert.equal(programmerErrorObserved, true, "the first period has reached validation and failed unexpectedly");
  assert.equal(handlerOutcome, undefined, "the handler waits until every already-started period settles");
  assert.equal(harness.putCalls.length, 0);

  for (const { request, resolve } of pendingSearch) {
    if (request === firstPeriod.request) continue;
    resolve(jsonResponse(searchConsoleResponse({ clicks: 80 })));
  }
  await handlerCompletion;
  assert.equal(handlerOutcome?.error?.code, "COLLECTION_FAILED", "an unexpected provider-processing error still aborts publication");
  assert.equal(googleRequests(requestLog, "google-search").length, 5);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 0);
  assert.equal(harness.putCalls.length, 0);
  assert.equal(harness.objects.get(outputKey), previousBytes, "the exact prior object survives the failed invocation");
});

function phase15BuilderArticle(options) {
  const { viewsCount, ...articleOptions } = options;
  const record = builderArticle(articleOptions);
  if (Object.hasOwn(options, "viewsCount")) record.viewsCount = viewsCount;
  return record;
}

function manualBuilderArticleViewsInput({
  observedAt = "2026-10-16T12:00:00.000Z",
  views = { en: 310, es: 740 }
} = {}) {
  return { observedAt, views };
}

function priorBuilderArticleViewsGroup({
  collectedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "9".repeat(64),
  views = { all: 123, en: 100, es: 23 }
} = {}) {
  return {
    definitionVersion: 1,
    basis: "recorded-total",
    collectedAt,
    scopeId,
    source: { id: "builder-center", label: "AWS Builder Center" },
    startDate: "2026-01-06",
    views
  };
}

function priorManualBuilderArticleViewsGroup({
  observedAt = "2026-10-10T12:00:00.000Z",
  scopeId = "8".repeat(64),
  views = { all: 123, en: 100, es: 23 }
} = {}) {
  return {
    definitionVersion: 2,
    basis: "recorded-total",
    provenance: "manual",
    observedAt,
    scopeId,
    source: { id: "builder-center", label: "AWS Builder Center" },
    startDate: "2026-01-06",
    views
  };
}

function manualGroupScopeIds(groups) {
  const scopes = {};
  for (const [name, group] of Object.entries(groups)) {
    if (typeof group.scopeId === "string") scopes[name] = group.scopeId;
    for (const [recordName, record] of Object.entries(group.records ?? {})) {
      if (typeof record?.scopeId === "string") scopes[`${name}.${recordName}`] = record.scopeId;
    }
  }
  return scopes;
}

function credentialIdentities(harness) {
  return {
    secrets: [...new Set(harness.secretCalls.map(({ SecretId }) => SecretId))].sort(),
    parameters: [...new Set(harness.parameterCalls.map(({ Name }) => Name))].sort()
  };
}

test("input11 requires its manual view field and the existing strict roots before provider work", async () => {
  const valid = phaseElevenInput({ baseInput: phaseThreeInput() });
  const missingManual = structuredClone(valid);
  delete missingManual.builderArticleViews;
  const missingSources = structuredClone(valid);
  delete missingSources.sources;
  const missingCurated = structuredClone(valid);
  delete missingCurated.curated;
  const unknownRoot = { ...valid, privateField: "synthetic-manual-config-canary" };
  const falseEngagementOptIn = phaseElevenInput();
  falseEngagementOptIn.newsletterEngagements = false;
  const analyticsWithoutNewsletter = phaseThreeInput();
  analyticsWithoutNewsletter.analytics = phaseFiveAnalytics();
  const searchWithoutAnalytics = phaseFourInput();
  searchWithoutAnalytics.searchConsole = phaseSixSearchConsole();
  const engagementWithoutNewsletter = phaseThreeInput();
  engagementWithoutNewsletter.newsletterEngagements = true;
  const spanishNewsletter = phaseFourInput({
    newsletter: { id: "simple-aws", publicationId: beehiivPublicationId, language: "es" }
  });
  spanishNewsletter.newsletterEngagements = true;
  const cases = [
    ["missing builderArticleViews", missingManual],
    ["missing sources", missingSources],
    ["missing curated facts", missingCurated],
    ["unknown root field", unknownRoot],
    ["nonliteral engagement opt-in", falseEngagementOptIn],
    ["Analytics without Newsletter", phaseElevenInput({ baseInput: analyticsWithoutNewsletter })],
    ["Search without Analytics", phaseElevenInput({ baseInput: searchWithoutAnalytics })],
    ["engagement opt-in without Newsletter", phaseElevenInput({ baseInput: engagementWithoutNewsletter })],
    ["engagement opt-in for non-English Newsletter", phaseElevenInput({ baseInput: spanishNewsletter })]
  ];

  for (const [name, input] of cases) {
    const requestLog = [];
    const harness = createHarness({ input, fetchFn: phaseThirteenFetch({ requestLog }) });
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.notEqual(error.code, "INPUT_VERSION_UNSUPPORTED", `${name} must be checked as input11`);
      return true;
    });
    assert.equal(harness.putCalls.length, 0, `${name} cannot publish`);
    assert.equal(requestLog.length, 0, `${name} fails before provider work`);
    assert.deepEqual(harness.secretCalls, []);
    assert.deepEqual(harness.parameterCalls, []);
  }
});

test("input11 keeps manual Builder totals independent while all six article sources share title-language identities", async () => {
  const requestLog = [];
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const sameEnglishTitle = "CAFÉ, CACHE & AWS";
  const baseInput = awsSixSourceInput();
  baseInput.directoryAnalytics.outboundClicks = true;
  const builderPages = new Map([[
    "",
    {
      articles: [
        phase15BuilderArticle({
          id: "synthetic-manual-view-en-one",
          title: "  Cafe\u0301,   cache & AWS  ",
          viewsCount: "not-a-count"
        }),
        builderArticle({
          id: "synthetic-manual-view-en-two",
          title: "Café, cache & AWS"
        }),
        phase15BuilderArticle({
          id: "synthetic-manual-view-es",
          title: "Café, cache & AWS",
          locale: "es",
          viewsCount: -50
        })
      ],
      resultsSize: 3
    }
  ]]);
  const manual = manualBuilderArticleViewsInput({
    observedAt: "2026-10-15T18:30:00.000Z",
    views: { en: 310, es: 740 }
  });
  const makeFetch = (requests) => awsSixSourceFetch({
    requestLog: requests,
    newsletterResponder: () => jsonResponse({
      data: { id: beehiivPublicationId, stats: { active_subscriptions: 20, total_sent: 35 } }
    }),
    engagementResponder: ({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request)),
    reportResponder: ({ request }) => jsonResponse(ga4Report({
      metricName: request.json.metrics[0].name,
      timeZone: request.url.includes(`/properties/${directoryGooglePropertyId}:`)
        ? directoryTimeZone : googleTimeZone
    })),
    caylentRows: [article({ id: "synthetic-manual-view-caylent-copy", title: sameEnglishTitle })],
    builderArticles: builderPages.get("").articles,
    simpleArticles: [beehiivPost({ id: "synthetic-manual-view-simple-copy", title: sameEnglishTitle })],
    hashnodeRows: [cloudyArticle({ id: "synthetic-manual-view-cloudy-copy", title: sameEnglishTitle })],
    dondeArticles: [dondeAprendoArticle({ title: "Café, cache & AWS", slug: "synthetic-manual-view-donde-copy" })],
    awsResponse: awsForEngineersIndex([
      awsForEngineersArticle({ title: sameEnglishTitle, slug: "synthetic-manual-view-aws-copy" })
    ])
  });
  const baseline = createHarness({
    input: baseInput,
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: makeFetch([])
  });
  await baseline.handler({}, {});
  const baselineOutput = await readPut(baseline.putCalls[0]);
  assert.deepEqual(Object.keys(baselineOutput.groups).sort(), [
    "articles", "talks", "books", "newsletter", "newsletterEmailsSent", "articleViews", "articleSearchClicks",
    "directoryViews", "directoryOutboundClicks", "newsletterEmailOpens", "newsletterEmailVerifiedClicks"
  ].sort(), "all selected families must be healthy before adding a manual observation");

  const input = phaseElevenInput({ baseInput, builderArticleViews: manual });
  const harness = createHarness({
    input,
    clock,
    fetchFn: makeFetch(requestLog)
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.builderArticleViews;
  const otherGroups = { ...output.groups };
  delete otherGroups.builderArticleViews;
  assert.deepEqual(otherGroups, baselineOutput.groups,
    "adding manual views preserves every existing family's values, scopes, dates, coverage and availability");
  assert.equal(output.schemaVersion, 1, "the public snapshot remains on its shared schema");
  assert.deepEqual(output.groups.articles.counts, { all: 2, en: 1, es: 1 },
    "NFC, case, and repeated whitespace dedupe the English copies while the same title in Spanish remains a separate article identity");
  assert.deepEqual(Object.keys(group).sort(), [
    "basis", "definitionVersion", "observedAt", "provenance", "scopeId", "source", "startDate", "views"
  ]);
  assert.equal(group.definitionVersion, 2);
  assert.equal(group.basis, "recorded-total");
  assert.equal(group.provenance, "manual");
  assert.equal(group.observedAt, manual.observedAt, "the observation date is distinct from the collection clock");
  assert.match(group.scopeId, /^[a-f0-9]{64}$/);
  assert.deepEqual(group.source, { id: "builder-center", label: "AWS Builder Center" });
  assert.equal(group.startDate, "2026-01-06");
  assert.deepEqual(group.views, { all: 1050, en: 310, es: 740 }, "All is derived from the language totals");
  assert.equal(group.collectedAt, undefined, "manual provenance does not use an automatic collection timestamp");
  assert.deepEqual(output.groups.articles.sources.map(({ id }) => id), input.sources.map(({ id }) => id),
    "the manual view group does not reduce or replace the six-source article inventory");
  assert.equal(requestLog.filter(({ kind }) => kind === "builder-list").length, 1,
    "the existing Builder traversal remains available for article counts");
  assert.deepEqual(credentialIdentities(harness), credentialIdentities(baseline),
    "input11 adds no credential identity beyond the exact same selected input10 sources and metric families");
  assert.equal(JSON.stringify(output).includes("viewsCount"), false, "provider counters are not part of public output");
  assert.equal(JSON.stringify(output).includes("synthetic-manual-view-en-one"), false);
});

test("input11 accepts zero Builder totals beside directory views without Newsletter or Simple AWS Analytics", async () => {
  const requestLog = [];
  const manual = manualBuilderArticleViewsInput({ views: { en: 0, es: 0 } });
  const input = phaseElevenInput({
    baseInput: phaseNineInput({ baseInput: phaseThreeInput() }),
    builderArticleViews: manual
  });
  const harness = createHarness({
    input,
    fetchFn: phaseThirteenFetch({
      requestLog,
      reportResponder: () => jsonResponse(ga4Report({ views: 31, timeZone: directoryTimeZone }))
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.builderArticleViews.views, { all: 0, en: 0, es: 0 },
    "an explicit zero remains a published manual observation");
  assert.equal(output.groups.builderArticleViews.observedAt, manual.observedAt);
  assert.equal(output.groups.directoryViews.records["12m"].views, 31,
    "directory Analytics and manual Builder views can publish together without Newsletter selection");
  assert.equal(Object.hasOwn(output.groups, "newsletter"), false);
  assert.equal(Object.hasOwn(output.groups, "newsletterEmailsSent"), false);
  assert.equal(Object.hasOwn(output.groups, "articleViews"), false,
    "the test does not select Simple AWS Analytics");
  assert.equal(harness.secretCalls.length, 0, "no Newsletter credential is needed for this combination");
  const reports = googleRequests(requestLog, "google-report");
  assert.ok(reports.length > 0, "the selected directory metric still performs its own Google reports");
  assert.ok(reports.every(({ url }) => url.includes(`/properties/${directoryGooglePropertyId}:`)),
    "only the selected directory property is queried");
  assert.equal(googleRequests(requestLog, "beehiiv").length, 0);
});

test("manual Builder observation date and scope survive daily runs and downward corrections", async () => {
  const clock = createClock("2026-10-17T12:00:00.000Z");
  const requestLog = [];
  const sameBuilderRows = new Map([[
    "",
    { articles: [phase15BuilderArticle({ id: "synthetic-manual-repeat-article", viewsCount: 900 })], resultsSize: 1 }
  ]]);
  const harness = createHarness({
    input: phaseElevenInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseThirteenFetch({ requestLog, builderPages: sameBuilderRows })
  });

  await harness.handler({}, {});
  const firstOutput = await readPut(harness.putCalls[0]);
  const first = firstOutput.groups.builderArticleViews;
  assert.deepEqual(first.views, { all: 1050, en: 310, es: 740 });

  clock.set("2026-10-18T12:00:00.000Z");
  await harness.handler({}, {});
  const nextDay = (await readPut(harness.putCalls[1])).groups.builderArticleViews;
  assert.deepEqual(nextDay, first, "a daily collection does not replace the recorded observation date or recompute its value");

  const expandedInput = phaseElevenInput({
    baseInput: phaseThirteenInput(),
    builderArticleViews: manualBuilderArticleViewsInput()
  });
  harness.setInput(expandedInput);
  await harness.handler({}, {});
  const expandedOutput = await readPut(harness.putCalls[2]);
  const expanded = expandedOutput.groups.builderArticleViews;
  assert.equal(expanded.scopeId, first.scopeId,
    "adding other already-supported selectors does not alter the manual Builder scope");

  const correctedInput = phaseElevenInput({
    baseInput: phaseThirteenInput(),
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-17T10:30:00.000Z",
      views: { en: 270, es: 600 }
    })
  });
  harness.setInput(correctedInput);
  await harness.handler({}, {});
  const correctedOutput = await readPut(harness.putCalls[3]);
  const corrected = correctedOutput.groups.builderArticleViews;
  assert.deepEqual(corrected.views, { all: 870, en: 270, es: 600 },
    "corrected manual totals may move down and are recomputed from the supplied language values");
  assert.equal(corrected.observedAt, "2026-10-17T10:30:00.000Z");
  assert.equal(corrected.scopeId, expanded.scopeId, "the value and observation date are not scope inputs");
  assert.deepEqual(manualGroupScopeIds(correctedOutput.groups), manualGroupScopeIds(expandedOutput.groups),
    "changing manual views does not change the scope of Articles or any independent metric family");

  clock.set("2026-10-19T12:00:00.000Z");
  await harness.handler({}, {});
  const repeatedCorrection = (await readPut(harness.putCalls[4])).groups.builderArticleViews;
  assert.deepEqual(repeatedCorrection, corrected,
    "later invocations preserve the latest manually recorded date and corrected totals");
});

test("inputs3 through 10 never refresh Builder views and retain a valid prior v1 or v2 group exactly", async () => {
  const legacyInputs = [
    phaseThreeInput(), phaseFourInput(), phaseFiveInput(), phaseSixInput(),
    phaseNineInput(), phaseTenInput(), phaseTwelveInput(), phaseThirteenInput()
  ];

  for (const [index, input] of legacyInputs.entries()) {
    const previous = index % 2 === 0
      ? priorBuilderArticleViewsGroup(index === 0 ? {
        collectedAt: "2026-10-21T20:23:53.969Z",
        scopeId: "3da7c7cd74258140ea982b74dd053ca7202f04c22ad8986c81e581052572e389",
        views: { all: 2624, en: 242, es: 2382 }
      } : { views: { all: 30, en: 20, es: 10 } })
      : priorManualBuilderArticleViewsGroup({ views: { all: 30, en: 20, es: 10 } });
    const requestLog = [];
    const harness = createHarness({
      input,
      clock: createClock("2026-10-22T12:00:00.000Z"),
      fetchFn: phaseThirteenFetch({
        requestLog,
        hashnodePages: new Map([[1, cloudyHashnodePage({
          rows: [cloudyArticle({ id: `synthetic-retired-views-cloudy-${index}` })],
          name: "Another Author"
        })]]),
        builderPages: new Map([[
          "",
          { articles: [phase15BuilderArticle({ id: `synthetic-no-auto-views-${index}`, viewsCount: 900 + index })], resultsSize: 1 }
        ]])
      })
    });
    harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { builderArticleViews: previous } }));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(output.groups.builderArticleViews, previous,
      `input${input.schemaVersion} preserves historical provenance and never rewrites views from the Builder API`);
    assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 },
      "the unrelated Builder article remains counted while the mismatched Hashnode display name adds no article");
    assert.equal(requestLog.filter(({ kind }) => kind === "builder-list").length, 1,
      "the Builder article listing still runs exactly once for the Articles family");
  }

  const noPrior = createHarness({
    input: phaseThreeInput(),
    fetchFn: phaseEightApiFetch({
      builderPages: new Map([["", {
        articles: [phase15BuilderArticle({ id: "synthetic-no-prior-auto-views", viewsCount: 700 })],
        resultsSize: 1
      }]])
    })
  });
  await noPrior.handler({}, {});
  const withoutHistory = await readPut(noPrior.putCalls[0]);
  assert.equal(Object.hasOwn(withoutHistory.groups, "builderArticleViews"), false,
    "legacy configurations without a manual observation never turn API counters into a new view family");
  assert.deepEqual(withoutHistory.groups.articles.counts, { all: 1, en: 1, es: 0 });
});

test("legacy inputs 1 and 2 keep count-only output and never retain Builder views", async () => {
  const inputs = [sourceInput(), phaseTwoInput()];
  const previousGroups = [priorBuilderArticleViewsGroup(), priorManualBuilderArticleViewsGroup()];

  for (const input of inputs) {
    for (const previous of previousGroups) {
      const requestLog = [];
      const harness = createHarness({ input, fetchFn: phaseThirteenFetch({ requestLog }) });
      harness.objects.set(outputKey, JSON.stringify({
        schemaVersion: 1,
        groups: { builderArticleViews: previous }
      }));

      await harness.handler({}, {});

      const output = await readPut(harness.putCalls[0]);
      assert.deepEqual(Object.keys(output.groups), ["articles"]);
      assert.equal(Object.hasOwn(output.groups, "builderArticleViews"), false);
      assert.deepEqual(harness.secretCalls, [], `legacy input${input.schemaVersion} needs no Beehiiv credential`);
      assert.deepEqual(harness.parameterCalls, [], `legacy input${input.schemaVersion} needs no Google credential`);
      assert.equal(requestLog.filter(({ kind }) => kind === "builder-list").length,
        input.schemaVersion === 1 ? 0 : 1,
      `legacy input${input.schemaVersion} keeps only its existing inventory enumeration`);
    }
  }
});

test("malformed prior Builder view versions are dropped while healthy sibling families publish", async () => {
  const v1Variants = [
    { name: "v1 missing required key", mutate(group) { delete group.views.es; } },
    { name: "v1 inconsistent language sum", mutate(group) { group.views.all += 1; } },
    { name: "v1 unsafe total", mutate(group) { group.views.all = Number.MAX_SAFE_INTEGER + 1; } },
    { name: "v1 negative language count", mutate(group) { group.views.en = -1; } },
    { name: "v1 wrong fixed source", mutate(group) { group.source = { id: "other-source", label: "Other source" }; } },
    { name: "v1 wrong tracking start date", mutate(group) { group.startDate = "2026-01-07"; } },
    { name: "v1 wrong basis", mutate(group) { group.basis = "cumulative"; } },
    { name: "v1 noncanonical collection timestamp", mutate(group) { group.collectedAt = "2026-10-10T12:00:00Z"; } },
    { name: "v1 malformed scope hash", mutate(group) { group.scopeId = "A".repeat(64); } },
    {
      name: "v1 unknown public field",
      canary: "synthetic-malformed-prior-view-canary",
      mutate(group) { group.privateField = this.canary; }
    }
  ];
  const v2Variants = [
    { name: "v2 missing required key", mutate(group) { delete group.views.es; } },
    { name: "v2 inconsistent language sum", mutate(group) { group.views.all += 1; } },
    { name: "v2 unsafe total", mutate(group) { group.views.all = Number.MAX_SAFE_INTEGER + 1; } },
    { name: "v2 negative language count", mutate(group) { group.views.en = -1; } },
    { name: "v2 wrong fixed source", mutate(group) { group.source = { id: "other-source", label: "Other source" }; } },
    { name: "v2 wrong tracking start date", mutate(group) { group.startDate = "2026-01-07"; } },
    { name: "v2 wrong basis", mutate(group) { group.basis = "cumulative"; } },
    { name: "v2 missing observation timestamp", mutate(group) { delete group.observedAt; } },
    { name: "v2 noncanonical observation timestamp", mutate(group) { group.observedAt = "2026-10-10T12:00:00Z"; } },
    { name: "v2 malformed scope hash", mutate(group) { group.scopeId = "A".repeat(64); } },
    {
      name: "v2 unknown public field",
      canary: "synthetic-malformed-prior-view-canary",
      mutate(group) { group.privateField = this.canary; }
    },
    { name: "v2 missing manual provenance", mutate(group) { delete group.provenance; } },
    { name: "v2 wrong provenance", mutate(group) { group.provenance = "automatic"; } },
    { name: "v2 legacy collectedAt field", mutate(group) { group.collectedAt = "2026-10-10T12:00:00.000Z"; } }
  ];
  const variants = [
    ...v1Variants.map((variant) => ({ ...variant, version: 1, create: priorBuilderArticleViewsGroup })),
    ...v2Variants.map((variant) => ({ ...variant, version: 2, create: priorManualBuilderArticleViewsGroup }))
  ];

  for (const [index, variant] of variants.entries()) {
    const malformed = variant.create();
    variant.mutate.call(variant, malformed);
    const rowId = `synthetic-malformed-prior-row-${variant.version}-${index}`;
    const harness = createHarness({
      input: phaseThreeInput(),
      fetchFn: phaseEightApiFetch({
        builderPages: new Map([["", {
          articles: [phase15BuilderArticle({ id: rowId, viewsCount: "bad" })],
          resultsSize: 1
        }]])
      })
    });
    harness.objects.set(outputKey, JSON.stringify({
      schemaVersion: 1,
      groups: { builderArticleViews: malformed }
    }));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "builderArticleViews"), false,
      `${variant.name} prior value is omitted rather than partially repaired or relabeled`);
    assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 },
      `${variant.name} does not poison fresh article counts`);
    assert.deepEqual(output.groups.talks.counts, { all: 0, en: 0, es: 0 },
      `${variant.name} leaves healthy talks available`);
    assert.deepEqual(output.groups.books.counts, { all: 0, en: 0, es: 0 },
      `${variant.name} leaves healthy books available`);
    const successLog = JSON.parse(harness.logs.find((line) => line.includes('"event":"content_stats_collection_succeeded"')));
    assert.ok(successLog.familyFailures.builderArticleViews,
      `${variant.name} exercises previous-family validation instead of passing because views are unimplemented`);
    assertNoGoogleCanaries(harness, variant.canary ?? "synthetic-malformed-prior-view-canary", rowId);
  }
});

test("input11 isolates invalid manual values, retaining exact prior provenance or omitting only Builder views", async () => {
  const invalidValues = [
    {
      name: "null manual value",
      value: null
    },
    {
      name: "missing Spanish subtotal",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: 10 } }
    },
    {
      name: "missing observation date",
      value: { views: { en: 10, es: 20 } }
    },
    {
      name: "missing language totals",
      value: { observedAt: "2026-10-16T12:00:00.000Z" }
    },
    {
      name: "impossible observation date",
      value: { observedAt: "2026-02-30T12:00:00.000Z", views: { en: 10, es: 20 } }
    },
    {
      name: "noncanonical timestamp",
      value: { observedAt: "2026-10-16T12:00:00Z", views: { en: 10, es: 20 } }
    },
    {
      name: "before tracking start",
      value: { observedAt: "2026-01-05T23:59:59.999Z", views: { en: 10, es: 20 } }
    },
    {
      name: "future observation date",
      value: { observedAt: "2099-01-01T00:00:00.000Z", views: { en: 10, es: 20 } }
    },
    {
      name: "negative language total",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: -1, es: 20 } }
    },
    {
      name: "fractional language total",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: 10.5, es: 20 } }
    },
    {
      name: "string language total",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: "10", es: 20 } }
    },
    {
      name: "unsafe language integer",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: Number.MAX_SAFE_INTEGER + 1, es: 0 } }
    },
    {
      name: "unsafe derived sum",
      value: { observedAt: "2026-10-16T12:00:00.000Z", views: { en: Number.MAX_SAFE_INTEGER, es: 1 } }
    },
    {
      name: "unknown manual field",
      value: { ...manualBuilderArticleViewsInput(), endpoint: "https://untrusted.example/views" }
    }
  ];

  for (const [index, invalid] of invalidValues.entries()) {
    const previous = index === 0
      ? priorBuilderArticleViewsGroup()
      : index === 1
        ? priorManualBuilderArticleViewsGroup()
        : undefined;
    const input = phaseElevenInput({
      baseInput: phaseThreeInput(),
      builderArticleViews: invalid.value
    });
    const harness = createHarness({
      input,
      fetchFn: phaseEightApiFetch({
        builderPages: new Map([[
          "",
          { articles: [phase15BuilderArticle({ id: `synthetic-invalid-manual-${index}`, viewsCount: "ignored" })], resultsSize: 1 }
        ]])
      })
    });
    if (previous) harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { builderArticleViews: previous } }));

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 },
      `${invalid.name} does not block a fresh Articles result even when Builder rows have unusable counters`);
    if (previous) {
      assert.deepEqual(output.groups.builderArticleViews, previous,
        `${invalid.name} retains the complete valid previous group with its original provenance and date`);
    } else {
      assert.equal(Object.hasOwn(output.groups, "builderArticleViews"), false,
        `${invalid.name} without valid history omits views instead of publishing zero or partial values`);
    }
    assert.deepEqual(output.groups.talks.counts, { all: 0, en: 0, es: 0 });
    assert.deepEqual(output.groups.books.counts, { all: 0, en: 0, es: 0 });
  }
});

test("a valid manual correction recovers after isolated input failure and invalid prior variants are not retained", async () => {
  const clock = createClock("2026-10-18T12:00:00.000Z");
  const harness = createHarness({
    input: phaseElevenInput({ baseInput: phaseThreeInput() }),
    clock,
    fetchFn: phaseEightApiFetch({
      builderPages: new Map([["", {
        articles: [phase15BuilderArticle({ id: "synthetic-manual-recovery-article", viewsCount: 400 })],
        resultsSize: 1
      }]])
    })
  });
  await harness.handler({}, {});
  const first = (await readPut(harness.putCalls[0])).groups.builderArticleViews;

  harness.setInput(phaseElevenInput({ baseInput: phaseThreeInput(), builderArticleViews: null }));
  await harness.handler({}, {});
  const invalidRun = await readPut(harness.putCalls[1]);
  assert.deepEqual(invalidRun.groups.builderArticleViews, first,
    "a family-local input failure retains the last full manual group");
  assert.deepEqual(invalidRun.groups.articles.counts, { all: 1, en: 1, es: 0 });

  harness.setInput(phaseElevenInput({
    baseInput: phaseThreeInput(),
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-17T08:00:00.000Z",
      views: { en: 12, es: 3 }
    })
  }));
  await harness.handler({}, {});
  const recovered = (await readPut(harness.putCalls[2])).groups.builderArticleViews;
  assert.deepEqual(recovered.views, { all: 15, en: 12, es: 3 }, "recovery publishes the corrected lower total without accumulation");
  assert.equal(recovered.observedAt, "2026-10-17T08:00:00.000Z");
  assert.equal(recovered.scopeId, first.scopeId);

  const invalidPrevious = [
    priorBuilderArticleViewsGroup({ views: { all: 124, en: 100, es: 23 } }),
    { ...priorManualBuilderArticleViewsGroup(), collectedAt: "2026-10-10T12:00:00.000Z" }
  ];
  for (const previous of invalidPrevious) {
    const isolated = createHarness({
      input: phaseElevenInput({ baseInput: phaseThreeInput(), builderArticleViews: null }),
      fetchFn: phaseEightApiFetch({
        builderPages: new Map([["", {
          articles: [phase15BuilderArticle({ id: "synthetic-invalid-prior-article", viewsCount: 99 })],
          resultsSize: 1
        }]])
      })
    });
    isolated.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { builderArticleViews: previous } }));
    await isolated.handler({}, {});
    const output = await readPut(isolated.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "builderArticleViews"), false,
      "an invalid previous v1 or v2 group is not retained as if it were valid history");
    assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 });
  }
});

test("a Builder article-list failure does not block a valid manual observation", async () => {
  const requestLog = [];
  const manual = manualBuilderArticleViewsInput({ views: { en: 41, es: 9 } });
  const harness = createHarness({
    input: phaseElevenInput({ baseInput: phaseThreeInput(), builderArticleViews: manual }),
    fetchFn: phaseEightApiFetch({
      requestLog,
      caylentPages: new Map([[0, { results: [article({ id: "synthetic-healthy-caylent", title: "A fresh article" })] }]]),
      builderPages: new Map([["", () => jsonResponse({ error: "synthetic Builder list outage" }, 503)]])
    })
  });

  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.builderArticleViews.views, { all: 50, en: 41, es: 9 });
  assert.equal(output.groups.builderArticleViews.observedAt, manual.observedAt);
  assert.equal(Object.hasOwn(output.groups, "articles"), false,
    "the existing Builder page failure can keep the combined article family unavailable");
  assert.deepEqual(output.groups.talks.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(output.groups.books.counts, { all: 0, en: 0, es: 0 });
  assert.ok(requestLog.some(({ kind }) => kind === "builder-list"));
});

const manualArticleSourceLabels = {
  "dev-community": "DEV Community",
  "linkedin-articles": "LinkedIn",
  spainclouds: "SpainClouds",
  hackernoon: "HackerNoon"
};

function phaseTwelveArticleInventoryInput({
  articleInventory = { publications: [], exclusions: [] },
  builderArticleViews,
  sources,
  baseInput
} = {}) {
  const input = baseInput === undefined ? awsSixSourceInput(sources) : structuredClone(baseInput);
  if (baseInput === undefined) input.directoryAnalytics.outboundClicks = true;
  else if (sources !== undefined) input.sources = structuredClone(sources);
  input.schemaVersion = 12;
  input.articleInventory = structuredClone(articleInventory);
  if (builderArticleViews !== undefined) input.builderArticleViews = structuredClone(builderArticleViews);
  else if (baseInput === undefined || !Object.hasOwn(input, "builderArticleViews")) {
    delete input.builderArticleViews;
  }
  return input;
}

function phaseFourInventoryFetch({ requestLog = [], ...sourceOptions } = {}) {
  const newsletterResponder = sourceOptions.newsletterResponder ?? (({ request }) => {
    const publicationId = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1));
    return jsonResponse(newsletterEnvelope(publicationId, 20, 88));
  });
  const engagementResponder = sourceOptions.engagementResponder
    ?? (({ request }) => jsonResponse(phaseThirteenEnvelopeForRequest(request)));
  const reportResponder = sourceOptions.reportResponder ?? (({ request }) => {
    const isDirectory = request.url.includes("/properties/" + directoryGooglePropertyId + ":");
    const metricName = request.json.metrics[0]?.name;
    const value = metricName === "eventCount" ? 17 : isDirectory ? 23 : 31;
    return jsonResponse(ga4Report({
      views: value,
      metricName,
      timeZone: isDirectory ? directoryTimeZone : googleTimeZone
    }));
  });
  const searchResponder = sourceOptions.searchResponder
    ?? (() => jsonResponse(searchConsoleResponse({ clicks: 29 })));
  return awsSixSourceFetch({
    ...sourceOptions,
    requestLog,
    newsletterResponder,
    engagementResponder,
    reportResponder,
    searchResponder
  });
}

function manualArticlePublication(sourceId, title, language, publishedAt, url) {
  return { sourceId, title, language, publishedAt, url };
}

function assertNoArticleInventoryCanaries(harness, ...values) {
  const published = harness.putCalls.map((call) => bodyText(call.Body)).join("\n");
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(published.includes(value), false, "public aggregate must omit " + value);
    assert.equal(logs.includes(value), false, "collector logs must omit " + value);
  }
}

function assertPublicArticleMetadataNotLogged(harness, group, ...values) {
  const catalog = JSON.stringify(group);
  const logs = harness.logs.join("\n");
  for (const value of values) {
    assert.equal(catalog.includes(value), true, "approved public metadata appears in the Article catalog");
    assert.equal(logs.includes(value), false, "collector logs omit Article titles and destinations");
  }
}

test("input12 keeps strict root validation and the existing source dependencies before provider work", async () => {
  const valid = phaseTwelveArticleInventoryInput();
  const missingInventory = structuredClone(valid);
  delete missingInventory.articleInventory;
  const unknownRootField = { ...structuredClone(valid), unexpectedInventoryCanary: true };
  const manualSourceInSelectorList = structuredClone(valid);
  manualSourceInSelectorList.sources.push({ id: "dev-community" });
  const missingNewsletter = structuredClone(valid);
  delete missingNewsletter.newsletter;
  const invalidInputs = [
    ["missing required article inventory", missingInventory],
    ["unknown root field", unknownRootField],
    ["manual platform is not an automatic source selector", manualSourceInSelectorList],
    ["missing newsletter required by selected Simple AWS and Analytics", missingNewsletter]
  ];

  for (const [name, input] of invalidInputs) {
    const requestLog = [];
    const harness = createHarness({
      input,
      fetchFn: awsSixSourceFetch({ requestLog })
    });
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      if (name === "manual platform is not an automatic source selector") {
        assert.equal(error.code, "SOURCE_UNSUPPORTED", name);
      } else {
        assert.equal(error.code, "INPUT_SCHEMA_INVALID", name);
      }
      return true;
    });
    assert.deepEqual(requestLog, [], name + " must be rejected before provider work");
    assert.equal(harness.putCalls.length, 0, name + " must not publish a snapshot");
  }
});

test("input12 joins all six automatic sources with manual publications by normalized title and language", async () => {
  const manualInventory = {
    publications: [
      manualArticlePublication(
        "dev-community",
        "  CAFE\u0301   SHARED IDENTITY ",
        "en",
        "2024-02-03T09:15:00-03:00",
        "https://dev.to/guille/shared-identity"
      ),
      manualArticlePublication(
        "dev-community",
        "Café, Shared Identity!",
        "en",
        "2024-02-04",
        "https://dev.to/guille/punctuated-shared-identity"
      ),
      manualArticlePublication(
        "linkedin-articles",
        "Beehiiv email shared",
        "en",
        "2025-01-10T08:00:00.000-03:00",
        "https://www.linkedin.com/pulse/beehiiv-email-shared/"
      ),
      manualArticlePublication(
        "spainclouds",
        " Café TRANSLATION ",
        "es",
        "2024-05-02",
        "https://www.spainclouds.com/blog/cafe-translation"
      ),
      manualArticlePublication(
        "hackernoon",
        "Guide: AWS!",
        "en",
        "2024-01-01",
        "https://hackernoon.com/guide-aws"
      ),
      manualArticlePublication(
        "dev-community",
        "Destination copies",
        "en",
        "2023-07-04T12:30:00Z",
        "https://dev.to/guille/destination-copy-one"
      ),
      manualArticlePublication(
        "dev-community",
        "Destination copies",
        "en",
        "2023-07-04T12:30:00Z",
        "https://dev.to/guille/destination-copy-two"
      ),
      manualArticlePublication(
        "linkedin-articles",
        "Café Shared Identity",
        "es",
        "2022-06-03",
        "https://es.linkedin.com/pulse/cafe-shared-identity"
      ),
      manualArticlePublication(
        "hackernoon",
        "Approved article with no established date",
        "en",
        null,
        "https://hackernoon.com/approved-undated-article"
      )
    ],
    exclusions: [
      { sourceId: "medium", url: "https://medium.com/@guille/not-an-included-source" }
    ]
  };
  const requestLog = [];
  const manualBuilderViews = manualBuilderArticleViewsInput({
    observedAt: "2026-10-16T12:00:00.000Z",
    views: { en: 23, es: 7 }
  });
  const curated = {
    talks: [talkFact("phase4-delivered-spanish-talk", "talk", "delivered", "es")],
    books: [bookFact("phase4-published-english-book", "published", "en")]
  };
  const baseInput = awsSixSourceInput();
  baseInput.directoryAnalytics.outboundClicks = true;
  baseInput.curated = structuredClone(curated);
  const baselineInput = phaseElevenInput({
    baseInput,
    builderArticleViews: manualBuilderViews
  });
  const inventoryInput = phaseTwelveArticleInventoryInput({
    baseInput: baselineInput,
    articleInventory: manualInventory
  });
  const harness = createHarness({
    input: baselineInput,
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentRows: [article({ id: "phase4-caylent-copy", title: "Café Shared Identity" })],
      builderArticles: [builderArticle({
        id: "phase4-builder-copy",
        title: "Café translation",
        locale: "es"
      })],
      simpleArticles: [
        beehiivPost({ id: "phase4-web-post", title: "Beehiiv web unique", platform: "web" }),
        beehiivPost({ id: "phase4-email-post", title: "Beehiiv email shared", platform: "email" }),
        beehiivPost({ id: "phase4-both-post", title: "Beehiiv both unique", platform: "both" })
      ],
      hashnodeRows: [cloudyArticle({ id: "phase4-cloudy", title: "Cloudy unique" })],
      dondeArticles: [dondeAprendoArticle({ title: "Directory Spanish unique", slug: "phase4-directory" })],
      awsResponder: () => awsForEngineersIndex([
        awsForEngineersArticle({ title: "AWS for Engineers unique", slug: "phase4-aws-unique" })
      ])
    })
  });

  await harness.handler({}, {});
  const baseline = await readPut(harness.putCalls[0]);
  const familyNames = [
    "articles", "talks", "books", "newsletter", "newsletterEmailsSent", "articleViews",
    "directoryViews", "directoryOutboundClicks", "articleSearchClicks", "newsletterEmailOpens",
    "newsletterEmailVerifiedClicks", "builderArticleViews"
  ];
  assert.deepEqual(Object.keys(baseline.groups).sort(), familyNames.slice().sort(),
    "the fixture publishes all twelve healthy families before adding individual article facts");
  assert.deepEqual(baseline.groups.articles.counts, { all: 8, en: 6, es: 2 });
  assert.deepEqual(baseline.groups.talks.counts, { all: 1, en: 0, es: 1 });
  assert.deepEqual(baseline.groups.books.counts, { all: 1, en: 1, es: 0 });
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 0,
    "the complete baseline does not need a prior snapshot read");

  harness.setInput(inventoryInput);
  await harness.handler({}, {});

  const output = await readPut(harness.putCalls[1]);
  const group = output.groups.articles;
  assert.equal(output.schemaVersion, 1, "individual source records do not create another public root");
  assert.deepEqual(Object.keys(output.groups).sort(), familyNames.slice().sort());
  const baselineSiblings = { ...baseline.groups };
  const refreshedSiblings = { ...output.groups };
  delete baselineSiblings.articles;
  delete refreshedSiblings.articles;
  assert.deepEqual(refreshedSiblings, baselineSiblings,
    "input12 preserves every healthy sibling family, including non-empty talks and books, exactly");
  assertPhaseFiveCatalogShape(group);
  assert.notEqual(group.scopeId, baseline.groups.articles.scopeId,
    "the selected individual records and exclusions belong to the Articles scope");
  assert.deepEqual(group.counts, { all: 13, en: 10, es: 3 },
    "manual copies deduplicate by title/language, punctuation and language differences remain distinct, and destinations do not add identities");
  assert.deepEqual(group.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "simple-aws", label: "Simple AWS" },
    { id: "cloudy-things", label: "Cloudy Things" },
    { id: "donde-aprendo-aws", label: "Dónde Aprendo AWS" },
    { id: "aws-for-engineers", label: "AWS for Engineers" },
    { id: "dev-community", label: manualArticleSourceLabels["dev-community"] },
    { id: "linkedin-articles", label: manualArticleSourceLabels["linkedin-articles"] },
    { id: "spainclouds", label: manualArticleSourceLabels.spainclouds },
    { id: "hackernoon", label: manualArticleSourceLabels.hackernoon }
  ], "only selected automated sources and platforms with included manual entries appear in canonical order");
  assert.deepEqual(output.groups.builderArticleViews.views, { all: 30, en: 23, es: 7 },
    "manual Builder views remain a separate group while article inventory changes");
  assert.equal(output.groups.builderArticleViews.observedAt, manualBuilderViews.observedAt);
  assertBeehiivPostRequests(harness, requestLog, beehiivPublicationId, [1, 1]);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 0,
    "the complete input12 refresh also does not need a prior snapshot read");
  const mixedPlatformHosts = new Set([
    "dev.to", "www.linkedin.com", "es.linkedin.com", "spainclouds.com",
    "www.spainclouds.com", "hackernoon.com", "medium.com"
  ]);
  for (const request of requestLog) {
    if (request.url) {
      assert.equal(
        mixedPlatformHosts.has(new URL(String(request.url)).hostname),
        false,
        "manual records do not trigger requests to mixed article platforms"
      );
    }
  }
  assertPublicArticleMetadataNotLogged(
    harness,
    group,
    ...manualInventory.publications.flatMap(({ title, url }) => [title, url.replace(/\/+$/, "")])
  );
});

test("input12 exclusions match stable source URLs across title edits without hiding a same-title destination", async () => {
  const excludedUrl = "https://builder.aws.com/content/phase4-excluded-builder/excluded-destination/";
  const articleInventory = {
    publications: [],
    exclusions: [{ sourceId: "builder-center", url: excludedUrl }]
  };
  const requestLog = [];
  const builderPages = new Map([[
    "",
    {
      articles: [
        builderArticle({
          id: "phase4-excluded-builder",
          title: "Stable exclusion target",
          slug: "excluded-destination"
        }),
        builderArticle({
          id: "phase4-included-same-title",
          title: "Stable exclusion target",
          slug: "other-destination"
        })
      ],
      resultsSize: 2
    }
  ]]);
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput({ articleInventory }),
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      builderPages,
      awsResponder: () => awsForEngineersIndex([
        awsForEngineersArticle({ title: "Phase 4 AWS unique", slug: "phase4-aws" })
      ])
    })
  });

  await harness.handler({}, {});
  const first = (await readPut(harness.putCalls[0])).groups.articles;
  assert.deepEqual(first.counts, { all: 6, en: 5, es: 1 },
    "the non-excluded Builder destination still contributes when it shares a title with the excluded URL");
  assert.equal(first.scopeId.length, 64);

  builderPages.set("", {
    articles: [
      builderArticle({
        id: "phase4-excluded-builder",
        title: "Renamed after exclusion",
        slug: "excluded-destination"
      }),
      builderArticle({
        id: "phase4-included-same-title",
        title: "Stable exclusion target",
        slug: "other-destination"
      })
    ],
    resultsSize: 2
  });
  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const second = (await readPut(harness.putCalls[1])).groups.articles;
  assert.deepEqual(second.counts, first.counts,
    "changing the excluded article title does not readmit its stable source URL");
  assert.equal(second.scopeId, first.scopeId, "remote title edits do not change the maintained selection scope");
  assert.notEqual(second.collectedAt, first.collectedAt, "the refresh date remains current");
  assertNoArticleInventoryCanaries(harness, excludedUrl);
  for (const request of requestLog.filter(({ kind }) => kind === "builder-list")) {
    assert.ok(request.url === undefined || !String(request.url).includes(excludedUrl));
  }
});

test("invalid input12 article facts invalidate only Articles and never publish a valid prefix", async () => {
  const validPrefix = manualArticlePublication(
    "dev-community",
    "Synthetic valid prefix must not escape",
    "en",
    "2025-01-02T03:04:05Z",
    "https://dev.to/guille/valid-prefix"
  );
  const invalidRows = [
    ["unknown publication field", {
      ...validPrefix,
      extra: "synthetic-field-canary"
    }],
    ["unsupported included source", manualArticlePublication(
      "medium",
      "Unsupported automatic import",
      "en",
      "2025-01-02",
      "https://medium.com/@guille/unsupported-import"
    )],
    ["unsupported language", manualArticlePublication(
      "dev-community",
      "Invalid language",
      "fr",
      "2025-01-02",
      "https://dev.to/guille/invalid-language"
    )],
    ["impossible calendar date", manualArticlePublication(
      "dev-community",
      "Impossible date",
      "en",
      "2025-02-30T12:00:00+00:00",
      "https://dev.to/guille/impossible-date"
    )],
    ["timestamp without an explicit zone", manualArticlePublication(
      "dev-community",
      "Unzoned timestamp",
      "en",
      "2025-01-02T12:00:00",
      "https://dev.to/guille/unzoned-timestamp"
    )],
    ["future publication date", manualArticlePublication(
      "dev-community",
      "Future individual record",
      "en",
      "2026-10-17T00:00:00.000Z",
      "https://dev.to/guille/future-record"
    )],
    ["URL from another platform", manualArticlePublication(
      "dev-community",
      "Foreign host",
      "en",
      "2025-01-02",
      "https://www.linkedin.com/pulse/not-dev"
    )],
    ["URL with query", manualArticlePublication(
      "dev-community",
      "Query URL",
      "en",
      "2025-01-02",
      "https://dev.to/guille/query-url?tracking=canary"
    )],
    ["URL with credentials", manualArticlePublication(
      "dev-community",
      "Credential URL",
      "en",
      "2025-01-02",
      "https://user:password@dev.to/guille/credential-url"
    )],
    ["URL with non-default port", manualArticlePublication(
      "dev-community",
      "Port URL",
      "en",
      "2025-01-02",
      "https://dev.to:8443/guille/port-url"
    )],
    ["URL with fragment", manualArticlePublication(
      "dev-community",
      "Fragment URL",
      "en",
      "2025-01-02",
      "https://dev.to/guille/fragment-url#canary"
    )],
    ["duplicate source URL with conflicting metadata", manualArticlePublication(
      "dev-community",
      "Contradictory duplicate",
      "en",
      "2025-01-03",
      "https://dev.to/guille/valid-prefix/"
    )]
  ];
  const invalidInventories = invalidRows.map(([name, invalidRecord]) => ({
    name,
    inventory: {
      publications: [validPrefix, invalidRecord],
      exclusions: []
    }
  }));
  invalidInventories.push({
    name: "included and excluded normalized URL conflict",
    inventory: {
      publications: [validPrefix],
      exclusions: [{ sourceId: "dev-community", url: "https://dev.to/guille/valid-prefix/" }]
    }
  });
  invalidInventories.push({
    name: "unknown exclusion field",
    inventory: {
      publications: [validPrefix],
      exclusions: [{ sourceId: "medium", url: "https://medium.com/@guille/no-import", title: "must not be projected" }]
    }
  });
  invalidInventories.push({
    name: "unknown exclusion source",
    inventory: {
      publications: [validPrefix],
      exclusions: [{ sourceId: "unknown-platform", url: "https://example.com/not-an-exclusion" }]
    }
  });
  invalidInventories.push({
    name: "unknown article inventory field",
    inventory: {
      publications: [validPrefix],
      exclusions: [],
      unapprovedImport: true
    }
  });
  invalidInventories.push(
    { name: "null article inventory", inventory: null, canaries: ["synthetic-null-inventory-canary"] },
    {
      name: "publications is not an array",
      inventory: { publications: "synthetic-publications-shape-canary", exclusions: [] },
      canaries: ["synthetic-publications-shape-canary"]
    },
    {
      name: "exclusions is not an array",
      inventory: { publications: [validPrefix], exclusions: "synthetic-exclusions-shape-canary" },
      canaries: ["synthetic-exclusions-shape-canary"]
    }
  );

  for (const invalid of invalidInventories) {
    const requestLog = [];
    const input = phaseTwelveArticleInventoryInput({
      articleInventory: invalid.inventory,
      builderArticleViews: manualBuilderArticleViewsInput({ views: { en: 8, es: 2 } })
    });
    const harness = createHarness({
      input,
      fetchFn: phaseFourInventoryFetch({
        requestLog,
        awsResponder: () => awsForEngineersIndex([
          awsForEngineersArticle({ title: "Healthy sibling source", slug: "healthy-sibling" })
        ])
      })
    });

    await harness.handler({}, {});

    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), false,
      invalid.name + " must not publish automatic totals or a partial manual prefix");
    assert.deepEqual(Object.keys(output.groups).sort(), [
      "articleSearchClicks", "articleViews", "books", "builderArticleViews",
      "directoryOutboundClicks", "directoryViews", "newsletter", "newsletterEmailOpens",
      "newsletterEmailVerifiedClicks", "newsletterEmailsSent", "talks"
    ], invalid.name + " leaves every other selected family healthy");
    assert.deepEqual(output.groups.talks.counts, { all: 0, en: 0, es: 0 },
      invalid.name + " leaves healthy talks available");
    assert.deepEqual(output.groups.books.counts, { all: 0, en: 0, es: 0 },
      invalid.name + " leaves healthy books available");
    assert.deepEqual(output.groups.builderArticleViews.views, { all: 10, en: 8, es: 2 },
      invalid.name + " does not block the independent manual Builder family");
    const publications = Array.isArray(invalid.inventory?.publications)
      ? invalid.inventory.publications
      : [];
    const exclusions = Array.isArray(invalid.inventory?.exclusions)
      ? invalid.inventory.exclusions
      : [];
    assertNoArticleInventoryCanaries(
      harness,
      ...(invalid.canaries ?? []),
      ...publications.flatMap(({ title, url }) => [title, url]),
      ...exclusions.flatMap(({ title, url }) => [title, url].filter(Boolean))
    );
  }
});

test("input12 scope is canonical for manual facts, refreshes, Builder changes, and source ordering", async () => {
  const publication = manualArticlePublication(
    "dev-community",
    "Scope anchor",
    "en",
    "2025-03-04T10:00:00-03:00",
    "https://dev.to/guille/scope-anchor/"
  );
  const secondPublication = manualArticlePublication(
    "linkedin-articles",
    "Second scope anchor",
    "es",
    "2024-11-12",
    "https://www.linkedin.com/pulse/second-scope-anchor"
  );
  const exclusion = { sourceId: "medium", url: "https://medium.com/@guille/old-link/" };
  const secondExclusion = { sourceId: "builder-center", url: "https://builder.aws.com/content/old-post/old-destination/" };
  const inventory = {
    publications: [publication, secondPublication],
    exclusions: [exclusion, secondExclusion]
  };
  const requestLog = [];
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput({
      articleInventory: inventory,
      builderArticleViews: manualBuilderArticleViewsInput({
        observedAt: "2026-10-16T12:00:00.000Z",
        views: { en: 15, es: 4 }
      })
    }),
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      awsResponder: () => awsForEngineersIndex([
        awsForEngineersArticle({ title: "Stable automatic source", slug: "stable-auto" })
      ])
    })
  });
  await harness.handler({}, {});
  const firstOutput = await readPut(harness.putCalls[0]);
  const first = firstOutput.groups.articles;
  const firstIndependentScopes = manualGroupScopeIds(firstOutput.groups);
  delete firstIndependentScopes.articles;
  assert.match(first.scopeId, /^[a-f0-9]{64}$/);

  const reorderedInventory = {
    publications: [secondPublication, { ...publication, url: "https://dev.to/guille/scope-anchor" }],
    exclusions: [secondExclusion, exclusion]
  };
  const reorderedInput = phaseTwelveArticleInventoryInput({
    articleInventory: reorderedInventory,
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T11:00:00.000Z",
      views: { en: 10, es: 3 }
    }),
    sources: [...phaseTwelveArticleInventoryInput().sources].reverse()
  });
  reorderedInput.sources.find(({ id }) => id === "caylent").apiKey = "synthetic-rotated-caylent-key";
  harness.setInput(reorderedInput);
  await harness.handler({}, {});
  const reorderedOutput = await readPut(harness.putCalls[1]);
  const reordered = reorderedOutput.groups.articles;
  assert.deepEqual(reordered.counts, first.counts, "repeat collection recomputes rather than accumulates manual identities");
  assert.equal(reordered.scopeId, first.scopeId,
    "record ordering, trailing slash normalization, API key rotation, and Builder observation do not change semantic Articles scope");
  assert.equal(reordered.collectedAt, first.collectedAt);
  const secondIndependentScopes = manualGroupScopeIds(reorderedOutput.groups);
  delete secondIndependentScopes.articles;
  assert.deepEqual(secondIndependentScopes, firstIndependentScopes,
    "changing Articles inventory leaves Builder, talks, books, and other metric scopes independent");

  const changedInventory = {
    publications: [
      { ...publication, publishedAt: "2025-03-05T10:00:00-03:00" },
      secondPublication
    ],
    exclusions: [exclusion, secondExclusion]
  };
  harness.setInput(phaseTwelveArticleInventoryInput({
    articleInventory: changedInventory,
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T11:00:00.000Z",
      views: { en: 10, es: 3 }
    })
  }));
  await harness.handler({}, {});
  const changedOutput = await readPut(harness.putCalls[2]);
  const changed = changedOutput.groups.articles;
  assert.deepEqual(changed.counts, first.counts, "changing source date metadata does not alter the title-language identity");
  assert.notEqual(changed.scopeId, first.scopeId, "a changed maintained publication fact changes Articles scope");
  const changedIndependentScopes = manualGroupScopeIds(changedOutput.groups);
  delete changedIndependentScopes.articles;
  assert.deepEqual(changedIndependentScopes, firstIndependentScopes,
    "changing a maintained article date does not alter independent family scopes");

  harness.clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const later = (await readPut(harness.putCalls[3])).groups.articles;
  assert.equal(later.scopeId, changed.scopeId, "execution time does not salt the semantic Articles scope");
  assert.notEqual(later.collectedAt, changed.collectedAt);
});

test("input12 retains Articles only for an exact validated scope and recovers without accumulation", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const inventory = {
    publications: [
      manualArticlePublication(
        "dev-community",
        "Phase 4 retained inventory item",
        "en",
        "2025-03-04",
        "https://dev.to/guille/retained-inventory-item"
      )
    ],
    exclusions: []
  };
  let awsFails = false;
  const requestLog = [];
  const builderPages = new Map([["", {
    articles: [builderArticle({ id: "phase4-retention-builder", title: "Builder retained article" })],
    resultsSize: 1
  }]]);
  const inputFor = (nextInventory = inventory) => phaseTwelveArticleInventoryInput({
    articleInventory: nextInventory,
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T10:00:00.000Z",
      views: { en: 20, es: 4 }
    })
  });
  const harness = createHarness({
    input: inputFor(),
    clock,
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      builderPages,
      awsResponder: () => awsFails
        ? new Response("synthetic AWS source failure", { status: 503 })
        : awsForEngineersIndex([
          awsForEngineersArticle({ title: "AWS retained source", slug: "aws-retained" })
        ])
    })
  });

  await harness.handler({}, {});
  const firstOutput = await readPut(harness.putCalls[0]);
  const first = firstOutput.groups.articles;
  assert.deepEqual(first.counts, { all: 7, en: 6, es: 1 },
    "the prior Articles group includes the Builder publication that the later exclusion removes");
  const builderViewScope = firstOutput.groups.builderArticleViews.scopeId;
  const outputReads = () => harness.getCalls.filter(({ Key }) => Key === outputKey).length;
  assert.equal(outputReads(), 0, "the first all-family collection has no hidden prior-output read");

  awsFails = true;
  clock.set("2026-10-17T12:00:00.000Z");
  let readsBeforeInvocation = outputReads();
  await harness.handler({}, {});
  const failed = await readPut(harness.putCalls[1]);
  assert.deepEqual(failed.groups.articles, first,
    "a complete-source failure retains the exact prior counts, coverage, scope, and date when the validated inventory scope matches");
  assert.equal(failed.groups.talks.collectedAt, "2026-10-17T12:00:00.000Z",
    "healthy sibling groups refresh while Articles is retained");
  assert.equal(failed.groups.builderArticleViews.observedAt, "2026-10-16T10:00:00.000Z",
    "the separate manual Builder observation keeps its source date");
  assert.deepEqual(failed.groups.builderArticleViews.views, { all: 24, en: 20, es: 4 });
  assert.equal(failed.groups.builderArticleViews.scopeId, builderViewScope,
    "retaining or refreshing Articles does not change the independent manual Builder scope");
  assert.equal(outputReads() - readsBeforeInvocation, 1,
    "one failed refresh reads the prior output exactly once to retain the compatible Article group");

  const excludedInventory = {
    publications: inventory.publications,
    exclusions: [{
      sourceId: "builder-center",
      url: "https://builder.aws.com/content/phase4-retention-builder/shared-slug/"
    }]
  };
  harness.setInput(inputFor(excludedInventory));
  clock.set("2026-10-18T12:00:00.000Z");
  readsBeforeInvocation = outputReads();
  await harness.handler({}, {});
  const changedSelection = await readPut(harness.putCalls[2]);
  assert.equal(Object.hasOwn(changedSelection.groups, "articles"), false,
    "a Builder exclusion cannot retain a count-only group whose old scope still included that article");
  assert.deepEqual(changedSelection.groups.talks.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(changedSelection.groups.books.counts, { all: 0, en: 0, es: 0 });
  assert.ok(changedSelection.groups.builderArticleViews,
    "Builder's manual family remains available when Articles has no scope-compatible prior group");
  assert.deepEqual(Object.keys(changedSelection.groups).sort(), [
    "articleSearchClicks", "articleViews", "books", "builderArticleViews",
    "directoryOutboundClicks", "directoryViews", "newsletter", "newsletterEmailOpens",
    "newsletterEmailVerifiedClicks", "newsletterEmailsSent", "talks"
  ], "the selection mismatch omits only Articles while every healthy sibling refreshes");
  assert.equal(outputReads() - readsBeforeInvocation, 1,
    "scope-mismatch fallback shares only one prior-output read with the other independent families");

  awsFails = false;
  clock.set("2026-10-19T12:00:00.000Z");
  readsBeforeInvocation = outputReads();
  await harness.handler({}, {});
  const recoveredOutput = await readPut(harness.putCalls[3]);
  const recovered = recoveredOutput.groups.articles;
  assert.equal(recovered.counts.all, first.counts.all - 1,
    "recovery removes the excluded Builder identity from the full result rather than retaining or accumulating it");
  assert.equal(recovered.counts.all, recovered.counts.en + recovered.counts.es);
  assert.notEqual(recovered.scopeId, first.scopeId, "recovery uses the newly validated inventory scope");
  assert.equal(recoveredOutput.groups.builderArticleViews.scopeId, builderViewScope);
  assert.equal(outputReads() - readsBeforeInvocation, 0, "healthy recovery does not read a prior output");

  readsBeforeInvocation = outputReads();
  await harness.handler({}, {});
  const repeated = (await readPut(harness.putCalls[4])).groups.articles;
  assert.deepEqual(repeated.counts, recovered.counts, "a repeated invocation recomputes the same full count");
  assert.equal(repeated.scopeId, recovered.scopeId);
  assert.equal(outputReads() - readsBeforeInvocation, 0);
  assertPublicArticleMetadataNotLogged(
    harness,
    repeated,
    ...inventory.publications.flatMap(({ title, url }) => [title, url.replace(/\/+$/, "")])
  );
});

test("input12 without a valid manual Builder observation retains a valid prior v1 or v2 group", async () => {
  const previousGroups = [
    priorBuilderArticleViewsGroup(),
    priorManualBuilderArticleViewsGroup()
  ];

  for (const previous of previousGroups) {
    for (const builderArticleViews of [undefined, { observedAt: "invalid-date", views: { en: 1, es: 2 } }]) {
      const harness = createHarness({
        input: phaseTwelveArticleInventoryInput({ builderArticleViews }),
        fetchFn: phaseFourInventoryFetch({
          awsResponder: () => awsForEngineersIndex([
            awsForEngineersArticle({ title: "Input 12 Builder retention source", slug: "input12-builder-retention" })
          ])
        })
      });
      harness.objects.set(outputKey, JSON.stringify({
        schemaVersion: 1,
        groups: { builderArticleViews: previous }
      }));

      await harness.handler({}, {});

      const output = await readPut(harness.putCalls[0]);
      assert.deepEqual(output.groups.builderArticleViews, previous,
        "input12 without its optional manual observation preserves valid v1/v2 provenance exactly");
      assert.ok(output.groups.articles, "the article inventory refreshes independently of retained Builder views");
      assert.deepEqual(output.groups.articles.counts, { all: 6, en: 5, es: 1 },
        "an explicitly empty individual inventory still counts the complete automatic union");
      assert.deepEqual(output.groups.articles.sources.map(({ id }) => id), [
        "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers"
      ], "an empty individual inventory does not claim coverage of mixed platforms");
      assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1,
        "retaining Builder history shares the one prior-output read with any article failures");
    }
  }
});

test("implementation regression: Simple AWS URL exclusions require a matchable web destination", async () => {
  const url = "https://newsletter.simpleaws.dev/p/phase4-excluded-simple-aws";
  const privateTitle = "Synthetic Simple AWS URL exclusion canary";
  const input = phaseTwelveArticleInventoryInput({
    articleInventory: {
      publications: [],
      exclusions: [{ sourceId: "simple-aws", url }]
    }
  });
  const requestLog = [];
  const availableUrlHarness = createHarness({
    input,
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      simpleArticles: [beehiivPost({
        id: "phase4-simple-aws-url-exclusion",
        title: privateTitle,
        platform: "web",
        web_url: url
      })]
    })
  });
  await availableUrlHarness.handler({}, {});
  const excluded = (await readPut(availableUrlHarness.putCalls[0])).groups.articles;
  assert.deepEqual(excluded.counts, { all: 4, en: 3, es: 1 },
    "a Beehiiv web_url is matched by source and normalized destination before title-language counting");
  assertNoArticleInventoryCanaries(availableUrlHarness, url, privateTitle);

  const unavailableUrlHarness = createHarness({
    input,
    fetchFn: phaseFourInventoryFetch({
      simpleArticles: [beehiivPost({
        id: "phase4-simple-aws-url-missing",
        title: privateTitle,
        platform: "email"
      })]
    })
  });
  await unavailableUrlHarness.handler({}, {});
  const unavailable = await readPut(unavailableUrlHarness.putCalls[0]);
  assert.equal(Object.hasOwn(unavailable.groups, "articles"), false,
    "an email-only Beehiiv row without a URL cannot silently pass an explicit Simple AWS URL exclusion");
  assert.ok(unavailable.groups.talks && unavailable.groups.books,
    "the unavailable Article family does not block healthy curated groups");
  assert.ok(unavailableUrlHarness.logs.join("\n").includes("ARTICLE_INVENTORY_SOURCE_URL_UNAVAILABLE"));
  assertNoArticleInventoryCanaries(unavailableUrlHarness, url, privateTitle);
});

test("input12 supports individual articles without optional Newsletter, analytics, or manual Builder selections", async () => {
  const requestLog = [];
  const input = phaseTwelveArticleInventoryInput({
    baseInput: phaseThreeInput(),
    articleInventory: {
      publications: [manualArticlePublication(
        "dev-community", "Minimal Spanish individual article", "es", "2024-02-29",
        "https://dev.to/guille/minimal-spanish-individual-article"
      )],
      exclusions: []
    }
  });
  const harness = createHarness({ input: phaseThreeInput(), fetchFn: phaseFourInventoryFetch({ requestLog }) });
  await harness.handler({}, {});
  const baseline = await readPut(harness.putCalls[0]);
  assert.deepEqual(baseline.groups.articles.counts, { all: 2, en: 2, es: 0 },
    "the minimal fixture is healthy before individual articles are selected");
  harness.setInput(input);
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  assert.deepEqual(Object.keys(output.groups).sort(), ["articles", "books", "talks"],
    "the inventory does not imply unrelated Newsletter or activity selections");
  assert.deepEqual(output.groups.articles.counts, { all: 3, en: 2, es: 1 });
  assert.deepEqual(output.groups.articles.sources, [
    { id: "caylent", label: "Caylent" },
    { id: "builder-center", label: "AWS Builder Center" },
    { id: "dev-community", label: "DEV Community" }
  ]);
  assert.deepEqual(harness.secretCalls, [], "individual records add no credential requirement");
  assert.deepEqual(harness.parameterCalls, []);
  assert.deepEqual([...new Set(requestLog.map(({ kind }) => kind))].sort(), ["builder-list", "caylent-list"],
    "only the two selected automatic sources are queried");
});

test("implementation regression: automatic-source failure diagnostics expose only the source and sanitized code", async () => {
  const requestLog = [];
  const privateResponseBody = "synthetic-private-provider-response-canary";
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput(),
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentPages: new Map([[0, () => jsonResponse({ error: privateResponseBody }, 403)]])
    })
  });

  await harness.handler({}, {});

  const sourceFailureLine = harness.logs.find((line) => line.includes('"event":"content_stats_source_collection_failed"'));
  assert.ok(sourceFailureLine, "the failed automatic-source boundary emits a diagnostic");
  const sourceFailure = JSON.parse(sourceFailureLine);
  assert.deepEqual(sourceFailure, {
    event: "content_stats_source_collection_failed",
    sourceId: "caylent",
    code: "SOURCE_HTTP_403"
  }, "the diagnostic preserves the known source and existing HTTP error code without provider details");
  assert.equal(harness.logs.filter((line) => line.includes('"event":"content_stats_source_collection_failed"')).length, 1);
  const successLine = JSON.parse(harness.logs.find((line) => line.includes('"event":"content_stats_collection_succeeded"')));
  assert.equal(successLine.familyFailures.articles, "SOURCE_HTTP_403",
    "the original sanitized error still reaches family-level retention handling unchanged");
  assert.equal(JSON.stringify(sourceFailure).includes(privateResponseBody), false);
  assert.equal(JSON.stringify(sourceFailure).includes(secretKey), false);
  assert.equal(JSON.stringify(sourceFailure).includes(privateAuthorId), false);
  assert.equal(Object.hasOwn((await readPut(harness.putCalls[0])).groups, "articles"), false);
  assert.deepEqual((await readPut(harness.putCalls[0])).groups.talks.counts, { all: 0, en: 0, es: 0 });
  assert.ok(requestLog.some(({ kind }) => kind === "caylent-list"));
});

test("implementation regression: Hashnode retries one transient GraphQL error without exposing provider data", async () => {
  const privateMessage = "synthetic-private-graphql-message-canary";
  const privateCursor = "synthetic-private-cursor-canary";
  const article = cloudyArticle({ id: "hashnode-retry-success", title: "Recovered Hashnode article" });
  const requestLog = [];
  const harness = createHarness({
    input: phaseFourInput({
      sources: [sourceInput().source, builderCenterSource(), cloudyThingsSource()],
      curated: { talks: [], books: [] }
    }),
    fetchFn: phaseEightApiFetch({
      requestLog,
      caylentPages: new Map([[0, { results: [] }]]),
      builderPages: new Map([["", { articles: [], resultsSize: 0 }]]),
      hashnodeResponder: ({ attempt }) => attempt === 1
        ? cloudyHashnodePage({ graphqlErrors: [{
          message: privateMessage,
          extensions: { code: "INTERNAL_SERVER_ERROR", cursor: privateCursor }
        }] })
        : cloudyHashnodePage({ rows: [article] })
    })
  });

  await harness.handler({}, {});

  const requests = requestLog.filter(({ kind }) => kind === "hashnode-user-posts");
  assert.deepEqual(requests.map(({ page, attempt, after }) => ({ page, attempt, after })), [
    { page: 1, attempt: 1, after: null },
    { page: 1, attempt: 2, after: null }
  ], "only the first transient GraphQL failure is retried once for the same cursor");
  for (const request of requests) {
    assert.equal(request.url, hashnodeApiUrl);
    assert.equal(request.json.variables.username, hashnodeUsername);
    assert.equal(Object.entries(request.headers).some(([name]) => ["authorization", "cookie"].includes(name.toLowerCase())), false);
  }
  const output = await readPut(harness.putCalls[0]);
  assert.deepEqual(output.groups.articles.counts, { all: 1, en: 1, es: 0 });
  assert.equal(output.groups.articles.sources.at(-1).id, "cloudy-things");
  assert.equal(harness.logs.join("\n").includes(privateMessage), false);
  assert.equal(harness.logs.join("\n").includes(privateCursor), false);
  assertNoCloudyCanaries(harness, article.title, article.url, privateMessage, privateCursor);
});

function phaseFiveCatalogTitle(title) {
  return title.normalize("NFC")
    .replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu, "")
    .replace(/[\s\p{White_Space}]+/gu, " ")
    .toLowerCase();
}

function phaseFiveCatalogId(title, language) {
  return createHash("sha256")
    .update(JSON.stringify([phaseFiveCatalogTitle(title), language]))
    .digest("hex");
}

function phaseFiveInputWithoutInventory(input12) {
  const input = structuredClone(input12);
  input.schemaVersion = 11;
  delete input.articleInventory;
  return input;
}

function phaseFiveCatalogRows() {
  const sharedTitle = "  Shared   Catalog Café! ";
  const sharedCaylentDate = Date.parse("2025-01-03T04:05:06.000Z");
  const sharedCaylentUrl = "/blog/phase5-shared-catalog";
  return {
    sharedTitle,
    sharedCaylentUrl,
    caylentRows: [
      article({ id: "phase5-shared-caylent-a", title: sharedTitle, publishedDate: sharedCaylentDate, url: sharedCaylentUrl }),
      article({ id: "phase5-shared-caylent-b", title: sharedTitle, publishedDate: sharedCaylentDate, url: sharedCaylentUrl }),
      article({
        id: "phase5-cafe-tools-caylent",
        title: "Café & Tools",
        publishedDate: Date.parse("2024-12-31T23:00:00.000Z"),
        url: "/blog/phase5-cafe-tools"
      })
    ],
    builderArticles: [
      builderArticle({
        id: "phase5-shared-builder",
        title: "SHARED CATALOG CAFÉ!",
        lastPublishedAt: Date.parse("2025-01-04T00:00:00.000Z"),
        slug: "phase5-shared"
      }),
      builderArticle({
        id: "phase5-builder-date-unknown",
        title: "Builder eligibility date is not publication date",
        lastPublishedAt: Date.parse("2026-09-02T10:00:00.000Z"),
        slug: "phase5-date-unknown"
      })
    ],
    simpleArticles: [
      beehiivPost({
        id: "phase5-shared-simple",
        title: "Shared Catalog Café!",
        publishDate: "2025-01-04T00:00:00.000Z",
        platform: "both",
        web_url: "https://newsletter.simpleaws.dev/p/phase5-shared"
      }),
      beehiivPost({
        id: "phase5-shared-email-only",
        title: "shared catalog café!",
        publishDate: "2025-01-04T01:00:00.000Z",
        platform: "email",
        web_url: "https://private.example.invalid/shared-email-url-canary",
        preview_text: "synthetic-private-shared-email-preview-canary"
      }),
      beehiivPost({
        id: "phase5-web-no-url",
        title: "Simple AWS web post without a destination",
        publishDate: "2025-02-06T12:00:00.000Z",
        platform: "web"
      }),
      beehiivPost({
        id: "phase5-both-null-url",
        title: "Simple AWS both post with a null destination",
        publishDate: "2025-02-07T12:00:00.000Z",
        platform: "both",
        web_url: null
      }),
      beehiivPost({
        id: "phase5-email-only",
        title: "Email-only publication without a public destination",
        publishDate: "2025-02-01T12:00:00.000Z",
        platform: "email",
        web_url: "https://private.example.invalid/email-only-canary",
        preview_url: "https://private.example.invalid/preview-only-canary",
        preview_text: "synthetic-private-email-preview-canary"
      })
    ],
    cloudyRows: [
      cloudyArticle({
        id: "phase5-cloudy-shared-private-id",
        slug: "phase5-cloudy-shared",
        title: "SHARED CATALOG CAFÉ!",
        publishedAt: "2025-01-05T09:00:00-03:00"
      }),
      cloudyArticle({
        id: "phase5-cloudy-cafe-private-id",
        slug: "phase5-cloudy-cafe-tools",
        title: "CAFE\u0301 & Tools",
        publishedAt: "2025-01-01T00:00:00.000Z"
      }),
      cloudyArticle({ id: "phase5-cloudy-unaccented-private-id", slug: "phase5-unaccented-tools", title: "Cafe & Tools" })
    ],
    dondeArticles: [
      dondeAprendoArticle({ title: "Shared Catalog Café!", slug: "phase5-shared-spanish", publishedAt: "2025-01-07" }),
      dondeAprendoArticle({
        title: "Literal <b>HTML & title</b>",
        slug: "phase5-literal-html",
        publishedAt: "2025-02-02"
      }),
      dondeAprendoArticle({
        title: "Future catalog row is not eligible",
        slug: "phase5-future-row",
        publishedAt: "2026-10-17"
      })
    ],
    awsRows: [
      awsForEngineersArticle({
        title: "SHARED CATALOG CAFÉ!",
        slug: "phase5-shared-aws",
        publishedAt: "2025-01-03T01:05:06.000-03:00"
      }),
      awsForEngineersArticle({
        title: "AWS for Engineers date-preserving row",
        slug: "phase5-aws-date",
        publishedAt: "2025-02-03T20:30:00.000000+00:00"
      })
    ],
    manualPublications: [
      manualArticlePublication(
        "dev-community", "shared catalog café!", "en", "2025-01-08T10:00:00-05:00",
        "https://dev.to/guille/phase5-shared-catalog"
      ),
      manualArticlePublication(
        "dev-community", "SHARED CATALOG CAFÉ!", "en", "2025-01-09T10:00:00-05:00",
        "https://dev.to/guille/phase5-shared-catalog-copy"
      ),
      manualArticlePublication(
        "linkedin-articles", "LinkedIn individual catalog row", "en", "2025-02-04T09:30:00+01:00",
        "https://www.linkedin.com/pulse/phase5-linkedin-row"
      ),
      manualArticlePublication(
        "spainclouds", "Artículo individual de SpainClouds", "es", "2025-02-05",
        "https://www.spainclouds.com/blog/phase5-spainclouds-row"
      ),
      manualArticlePublication(
        "hackernoon", "HackerNoon without an established date", "en", null,
        "https://hackernoon.com/phase5-hackernoon-row"
      )
    ]
  };
}

function phaseFiveFetchForCatalogRows(rows, requestLog = []) {
  return phaseFourInventoryFetch({
    requestLog,
    caylentRows: rows.caylentRows,
    builderArticles: rows.builderArticles,
    simpleArticles: rows.simpleArticles,
    hashnodeRows: rows.cloudyRows,
    dondeArticles: rows.dondeArticles,
    awsResponder: () => awsForEngineersIndex(rows.awsRows)
  });
}

function assertPhaseFiveCatalogShape(group) {
  assert.ok(Array.isArray(group.records), "input12 publishes the complete Article records with its counts");
  assert.deepEqual(Object.keys(group).sort(), [
    "basis", "collectedAt", "counts", "definitionVersion", "records", "scopeId", "sources"
  ], "the catalog extends the existing Articles group without a second public object");
  assert.equal(group.definitionVersion, 2);
  assert.equal(group.basis, "cumulative");
  assert.deepEqual(Object.keys(group.counts).sort(), ["all", "en", "es"]);
  assert.equal(group.counts.all, group.records.length, "one count is published for each title-language identity");
  assert.equal(group.counts.en, group.records.filter(({ language }) => language === "en").length);
  assert.equal(group.counts.es, group.records.filter(({ language }) => language === "es").length);
  assert.equal(group.counts.all, group.counts.en + group.counts.es);
  assert.deepEqual(group.records.map(({ id }) => id), group.records.map(({ id }) => id).slice().sort(),
    "records have a stable lexical ID order");

  const ids = new Set();
  const sourceOrder = [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers",
    "dev-community", "linkedin-articles", "spainclouds", "hackernoon"
  ];
  for (const record of group.records) {
    assert.deepEqual(Object.keys(record).sort(), ["id", "language", "publications", "publishedAt", "title"]);
    assert.equal(record.id, phaseFiveCatalogId(record.title, record.language));
    assert.equal(ids.has(record.id), false, "each normalized title-language identity appears once");
    ids.add(record.id);
    assert.ok(record.title.trim(), "the representative title is readable");
    assert.ok(["en", "es"].includes(record.language));
    assert.ok(Array.isArray(record.publications) && record.publications.length > 0);
    const dated = [];
    let previousSourceIndex = -1;
    for (const publication of record.publications) {
      assert.deepEqual(Object.keys(publication).sort(), ["emailOnly", "publishedAt", "sourceId", "title", "url"]);
      assert.equal(phaseFiveCatalogTitle(publication.title), phaseFiveCatalogTitle(record.title));
      assert.equal(publication.sourceId in Object.fromEntries(sourceOrder.map((id) => [id, true])), true);
      const index = sourceOrder.indexOf(publication.sourceId);
      assert.ok(index >= previousSourceIndex, "publication copies follow canonical source order");
      previousSourceIndex = index;
      assert.equal(typeof publication.emailOnly, "boolean");
      if (publication.publishedAt !== null) {
        assert.equal(typeof publication.publishedAt, "string");
        assert.ok(Number.isFinite(Date.parse(publication.publishedAt)), "publication dates are parseable");
        assert.ok(Date.parse(publication.publishedAt) <= Date.parse(group.collectedAt), "future publications are absent");
        dated.push(publication.publishedAt);
      }
      if (publication.emailOnly) {
        assert.equal(publication.sourceId, "simple-aws", "only Simple AWS can be email-only");
        assert.equal(publication.url, null, "email-only Beehiiv publication has no public destination");
      } else if (publication.url === null) {
        assert.equal(publication.sourceId, "simple-aws", "only Simple AWS may lack a public destination");
      } else {
        assert.equal(typeof publication.url, "string", "web destinations and other sources keep their public URL");
      }
    }
    const compareString = (left, right) => left < right ? -1 : left > right ? 1 : 0;
    const minimum = dated.sort((left, right) => Date.parse(left) - Date.parse(right) || compareString(left, right))[0] ?? null;
    assert.equal(record.publishedAt, minimum, "the row date is the earliest backed publication date");

    const compareNullableText = (left, right) => left === null ? (right === null ? 0 : -1)
      : right === null ? 1 : compareString(left, right);
    const comparePublicationDate = (left, right) => left === null ? (right === null ? 0 : -1)
      : right === null ? 1 : Date.parse(left) - Date.parse(right) || compareString(left, right);
    const orderedCopies = record.publications.slice().sort((left, right) =>
      sourceOrder.indexOf(left.sourceId) - sourceOrder.indexOf(right.sourceId) ||
      compareNullableText(left.url, right.url) ||
      (left.url === null || right.url === null ? 0 : compareString(left.url, right.url)) ||
      comparePublicationDate(left.publishedAt, right.publishedAt) ||
      compareString(left.title, right.title));
    assert.deepEqual(record.publications, orderedCopies,
      "copies sort by source, null-first URL, date, and original title using stable string comparison");
  }
  assert.deepEqual(group.sources.map(({ id }) => id), group.sources.map(({ id }) => id).slice().sort((a, b) =>
    sourceOrder.indexOf(a) - sourceOrder.indexOf(b)), "coverage is emitted in canonical source order");
}

test("input12 publishes complete deterministic records for six adapters and individual destinations", async () => {
  const rows = phaseFiveCatalogRows();
  const articleInventory = {
    publications: rows.manualPublications,
    exclusions: [{ sourceId: "medium", url: "https://medium.com/@guille/phase5-not-imported" }]
  };
  const input12 = phaseTwelveArticleInventoryInput({
    articleInventory,
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T10:00:00.000Z",
      views: { en: 20, es: 4 }
    })
  });
  const input11 = phaseFiveInputWithoutInventory(input12);
  const requestLog = [];
  const harness = createHarness({
    input: input11,
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: phaseFiveFetchForCatalogRows(rows, requestLog)
  });

  await harness.handler({}, {});
  const legacy = await readPut(harness.putCalls[0]);
  assert.equal(legacy.groups.articles.definitionVersion, 1, "inputs1–11 retain the count-only Articles contract");
  assert.equal(Object.hasOwn(legacy.groups.articles, "records"), false);

  harness.setInput(input12);
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[1]);
  const group = output.groups.articles;
  assertPhaseFiveCatalogShape(group);
  assert.deepEqual(group.counts, { all: 13, en: 10, es: 3 });
  assert.deepEqual(group.sources.map(({ id }) => id), [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers",
    "dev-community", "linkedin-articles", "spainclouds", "hackernoon"
  ]);

  const sharedEnglish = group.records.find(({ id }) => id === phaseFiveCatalogId(rows.sharedTitle, "en"));
  assert.ok(sharedEnglish);
  assert.equal(sharedEnglish.title, rows.sharedTitle, "the first source in canonical order supplies the stable row title");
  assert.equal(sharedEnglish.publishedAt, "2025-01-03T01:05:06.000-03:00",
    "the row keeps the string-lexically first date when numeric and offset dates represent the same instant");
  assert.deepEqual(sharedEnglish.publications.map(({ sourceId }) => sourceId), [
    "caylent", "builder-center", "simple-aws", "simple-aws", "cloudy-things", "aws-for-engineers",
    "dev-community", "dev-community"
  ]);
  const sharedSimpleCopies = sharedEnglish.publications.filter(({ sourceId }) => sourceId === "simple-aws");
  assert.deepEqual(sharedSimpleCopies.map(({ url }) => url), [
    null, "https://newsletter.simpleaws.dev/p/phase5-shared"
  ], "null destinations sort before public web destinations within a source");
  assert.equal(sharedSimpleCopies[0].emailOnly, true);
  assert.equal(sharedSimpleCopies[1].emailOnly, false);
  assert.equal(sharedEnglish.publications.filter(({ sourceId }) => sourceId === "caylent").length, 1,
    "exact copies collapse by their public metadata despite distinct provider IDs");
  assert.deepEqual(sharedEnglish.publications.filter(({ sourceId }) => sourceId === "dev-community").map(({ url }) => url), [
    "https://dev.to/guille/phase5-shared-catalog",
    "https://dev.to/guille/phase5-shared-catalog-copy"
  ], "same-source destinations remain separate and sort lexically");
  const sharedPublicationBySource = Object.fromEntries(sharedEnglish.publications.map((publication) => [
    `${publication.sourceId}:${publication.url ?? "email"}`, publication
  ]));
  assert.equal(sharedPublicationBySource["caylent:https://caylent.com/blog/phase5-shared-catalog"].title, rows.sharedTitle,
    "the raw Caylent source title is retained on its destination copy");
  assert.equal(sharedPublicationBySource["builder-center:https://builder.aws.com/content/phase5-shared-builder/phase5-shared"].title,
    "SHARED CATALOG CAFÉ!");
  assert.equal(sharedPublicationBySource["simple-aws:https://newsletter.simpleaws.dev/p/phase5-shared"].publishedAt,
    "2025-01-04T00:00:00.000Z", "Beehiiv's numeric source date becomes canonical UTC ISO");
  assert.equal(sharedPublicationBySource["cloudy-things:https://blog.guilleojeda.com/phase5-cloudy-shared"].publishedAt,
    "2025-01-05T09:00:00-03:00", "Cloudy retains its original offset date");
  assert.equal(sharedPublicationBySource["aws-for-engineers:https://awsforengineers.com/blog/phase5-shared-aws/"].publishedAt,
    "2025-01-03T01:05:06.000-03:00", "AWS for Engineers retains its original offset date");
  assert.equal(sharedEnglish.publications.find(({ sourceId, url }) =>
    sourceId === "dev-community" && url === "https://dev.to/guille/phase5-shared-catalog").publishedAt,
  "2025-01-08T10:00:00-05:00", "manual publication copies keep their original offset date");
  assert.equal(sharedEnglish.publications.find(({ sourceId }) => sourceId === "builder-center").publishedAt, null,
    "lastPublishedAt keeps Builder eligibility but is not asserted to be its original publication date");
  assert.equal(sharedEnglish.publications.find(({ sourceId }) => sourceId === "donde-aprendo-aws"), undefined,
    "the same title in Spanish remains a separate record rather than an English copy");
  assert.equal(group.records.some(({ id }) => id === phaseFiveCatalogId(rows.sharedTitle, "es")), true);

  const spanishShared = group.records.find(({ id }) => id === phaseFiveCatalogId(rows.sharedTitle, "es"));
  assert.equal(spanishShared.publications[0].sourceId, "donde-aprendo-aws");
  assert.equal(spanishShared.publishedAt, "2025-01-07", "native date-only values remain date-only");
  const cafe = group.records.find(({ id }) => id === phaseFiveCatalogId("Café & Tools", "en"));
  const unaccented = group.records.find(({ id }) => id === phaseFiveCatalogId("Cafe & Tools", "en"));
  assert.ok(cafe && unaccented && cafe.id !== unaccented.id, "accent differences remain distinct identities");
  assert.deepEqual(cafe.publications.map(({ sourceId }) => sourceId), ["caylent", "cloudy-things"]);
  assert.equal(cafe.publishedAt, "2024-12-31T23:00:00.000Z");
  const emailOnlyRecord = group.records.find(({ title }) => title === "Email-only publication without a public destination");
  assert.equal(emailOnlyRecord.publications.length, 1);
  assert.deepEqual(emailOnlyRecord.publications[0], {
    sourceId: "simple-aws",
    title: "Email-only publication without a public destination",
    publishedAt: "2025-02-01T12:00:00.000Z",
    url: null,
    emailOnly: true
  }, "email-only metadata ignores provider web URLs and previews");
  for (const title of [
    "Simple AWS web post without a destination",
    "Simple AWS both post with a null destination"
  ]) {
    const publication = group.records.find((record) => record.title === title).publications[0];
    assert.equal(publication.url, null);
    assert.equal(publication.emailOnly, false, "a missing/null web URL does not imply an email-only publication");
  }
  const builderDateUnknown = group.records.find(({ title }) => title === "Builder eligibility date is not publication date");
  assert.equal(builderDateUnknown.publishedAt, null);
  assert.equal(builderDateUnknown.publications[0].publishedAt, null);
  const htmlTitle = "Literal <b>HTML & title</b>";
  const htmlRecord = group.records.find(({ title }) => title === htmlTitle);
  assert.ok(htmlRecord, "literal HTML-like source titles are retained as text data");
  assert.equal(htmlRecord.publications[0].title, htmlTitle);
  assert.equal(group.records.some(({ title }) => title === "Future catalog row is not eligible"), false,
    "a future native publication is excluded from the public catalog");
  const noDateRecord = group.records.find(({ title }) => title === "HackerNoon without an established date");
  assert.equal(noDateRecord.publishedAt, null);
  assert.equal(noDateRecord.publications[0].publishedAt, null);
  const awsDatedRecord = group.records.find(({ title }) => title === "AWS for Engineers date-preserving row");
  assert.equal(awsDatedRecord.publications[0].publishedAt, "2025-02-03T20:30:00.000000+00:00",
    "native offset and fractional precision are retained in the publication copy");
  assert.deepEqual(output.groups.talks, legacy.groups.talks);
  for (const family of Object.keys(legacy.groups).filter((name) => name !== "articles")) {
    assert.deepEqual(output.groups[family], legacy.groups[family], `${family} remains byte-for-byte equivalent across input 11 and 12`);
  }

  const publicTitlesAndUrls = rows.manualPublications.flatMap(({ title, url }) => [title, url])
    .concat(rows.caylentRows.flatMap(({ data }) => [data.title, `https://caylent.com${data.url}`]))
    .concat(rows.builderArticles.map(({ title }) => title))
    .concat(rows.simpleArticles.map(({ title }) => title))
    .concat(rows.cloudyRows.flatMap(({ title, url }) => [title, url]))
    .concat(rows.dondeArticles.filter(({ publishedAt }) => publishedAt <= "2026-10-16")
      .flatMap(({ title, url }) => [title, url]))
    .concat(rows.awsRows.flatMap(({ title, url }) => [title, url]));
  const serialized = JSON.stringify(output);
  for (const value of publicTitlesAndUrls) {
    assert.equal(serialized.includes(value), true, "approved public title/destination is represented in the catalog");
    assert.equal(harness.logs.join("\n").includes(value), false, "collector logs do not expose catalog metadata");
  }
  const privateValues = [
    ...rows.caylentRows.map(({ id }) => id),
    ...rows.simpleArticles.map(({ id }) => id),
    ...rows.cloudyRows.map(({ id }) => id),
    "phase5-email-only",
    "private.example.invalid",
    "preview-only-canary",
    "synthetic-private-email-preview-canary",
    "shared-email-url-canary",
    "synthetic-private-shared-email-preview-canary",
  ];
  for (const value of privateValues) {
    assert.equal(serialized.includes(value), false, `provider/private field is omitted: ${value}`);
    assert.equal(harness.logs.join("\n").includes(value), false, `provider/private field is not logged: ${value}`);
  }

  const reversedRows = {
    ...rows,
    caylentRows: [...rows.caylentRows].reverse(),
    builderArticles: [...rows.builderArticles].reverse(),
    simpleArticles: [...rows.simpleArticles].reverse(),
    cloudyRows: [...rows.cloudyRows].reverse(),
    dondeArticles: [...rows.dondeArticles].reverse(),
    awsRows: [...rows.awsRows].reverse(),
    manualPublications: [...rows.manualPublications].reverse()
  };
  const reorderedInput = phaseTwelveArticleInventoryInput({
    articleInventory: { publications: reversedRows.manualPublications, exclusions: articleInventory.exclusions },
    sources: [...input12.sources].reverse()
  });
  const reorderedHarness = createHarness({
    input: reorderedInput,
    clock: createClock("2026-10-16T12:00:00.000Z"),
    fetchFn: phaseFiveFetchForCatalogRows(reversedRows)
  });
  await reorderedHarness.handler({}, {});
  const reordered = (await readPut(reorderedHarness.putCalls[0])).groups.articles;
  assertPhaseFiveCatalogShape(reordered);
  assert.deepEqual(reordered.records, group.records,
    "input selector order and provider row order do not change record IDs or metadata ordering");
  assert.deepEqual(reordered.sources, group.sources);
  assert.deepEqual(reordered.counts, group.counts);
  assert.equal(reordered.scopeId, group.scopeId);
});

test("input12 publishes an explicit empty catalog when all six selected sources are valid and empty", async () => {
  const requestLog = [];
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput({
      builderArticleViews: manualBuilderArticleViewsInput()
    }),
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentRows: [],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsForEngineersIndex([])
    })
  });
  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assertPhaseFiveCatalogShape(group);
  assert.deepEqual(group.records, []);
  assert.deepEqual(group.counts, { all: 0, en: 0, es: 0 });
  assert.deepEqual(group.sources.map(({ id }) => id), [
    "caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers"
  ], "healthy empty sources remain explicit coverage");
  assert.equal(harness.getCalls.some(({ Key }) => Key === outputKey), false,
    "a healthy zero catalog needs no previous snapshot");
  assert.equal(requestLog.filter(({ kind }) => kind === "hashnode-user-posts").length, 1);
});

test("input12 retains and recovers an exact v2 catalog after a late source failure", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const simpleUrl = "https://newsletter.simpleaws.dev/p/phase5-retention-simple";
  const inventory = { publications: [], exclusions: [] };
  const inputFor = (articleInventory = inventory) => phaseTwelveArticleInventoryInput({
    articleInventory,
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T10:00:00.000Z",
      views: { en: 20, es: 4 }
    })
  });
  let awsFails = false;
  let awsTitle = "Phase five AWS source before failure";
  const requestLog = [];
  const harness = createHarness({
    input: inputFor(),
    clock,
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentRows: [],
      builderArticles: [],
      simpleArticles: [beehiivPost({
        id: "phase5-retention-simple-private-id",
        title: "Phase five Simple AWS retained source",
        publishDate: "2025-04-01T00:00:00.000Z",
        platform: "web",
        web_url: simpleUrl
      })],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsFails
        ? new Response("phase5-private-late-source-error-canary", { status: 503 })
        : awsForEngineersIndex([awsForEngineersArticle({ title: awsTitle, slug: "phase5-retention-aws" })])
    })
  });

  await harness.handler({}, {});
  const firstOutput = await readPut(harness.putCalls[0]);
  const first = firstOutput.groups.articles;
  assertPhaseFiveCatalogShape(first);
  assert.deepEqual(first.counts, { all: 2, en: 2, es: 0 });
  assert.equal(harness.getCalls.some(({ Key }) => Key === outputKey), false);
  const independentScopes = manualGroupScopeIds(firstOutput.groups);
  delete independentScopes.articles;
  const builderViews = firstOutput.groups.builderArticleViews;

  awsFails = true;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const failed = await readPut(harness.putCalls[1]);
  assert.deepEqual(failed.groups.articles, first, "late failure retains records and counts together with old metadata");
  assert.notEqual(failed.groups.talks.collectedAt, firstOutput.groups.talks.collectedAt,
    "healthy sibling families continue to refresh");
  assert.deepEqual(failed.groups.builderArticleViews, builderViews,
    "manual Builder history stays independent when Article records are retained");
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 1,
    "one failed full-source refresh reads the previous snapshot once");

  const changedInventory = {
    publications: [],
    exclusions: [{ sourceId: "simple-aws", url: simpleUrl }]
  };
  harness.setInput(inputFor(changedInventory));
  clock.set("2026-10-18T12:00:00.000Z");
  const readsBeforeScopeChange = harness.getCalls.filter(({ Key }) => Key === outputKey).length;
  await harness.handler({}, {});
  const changedScope = await readPut(harness.putCalls[2]);
  assert.equal(Object.hasOwn(changedScope.groups, "articles"), false,
    "an editorial exclusion changes scope, so a failed source cannot retain an incompatible prior catalog");
  assert.ok(changedScope.groups.talks && changedScope.groups.books);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length - readsBeforeScopeChange, 1);

  awsFails = false;
  awsTitle = "Phase five AWS source after recovery";
  clock.set("2026-10-19T12:00:00.000Z");
  const readsBeforeRecovery = harness.getCalls.filter(({ Key }) => Key === outputKey).length;
  await harness.handler({}, {});
  const recoveredOutput = await readPut(harness.putCalls[3]);
  const recovered = recoveredOutput.groups.articles;
  assertPhaseFiveCatalogShape(recovered);
  assert.deepEqual(recovered.counts, { all: 1, en: 1, es: 0 }, "recovery applies the exclusion and current source rows");
  assert.equal(recovered.records[0].title, awsTitle);
  assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length - readsBeforeRecovery, 0);
  const recoveredScopes = manualGroupScopeIds(recoveredOutput.groups);
  delete recoveredScopes.articles;
  assert.deepEqual(recoveredScopes, independentScopes,
    "an Article scope change does not alter independent family scopes");

  await harness.handler({}, {});
  const repeated = (await readPut(harness.putCalls[4])).groups.articles;
  assert.deepEqual(repeated.records, recovered.records, "a later invocation recomputes instead of accumulating records");
  assert.deepEqual(repeated.counts, recovered.counts);
  assert.equal(repeated.scopeId, recovered.scopeId);
  const outputText = harness.putCalls.map(({ Body }) => bodyText(Body)).join("\n");
  assert.equal(outputText.includes("phase5-private-late-source-error-canary"), false);
});

test("input12 rejects malformed previous v2 catalogs locally instead of retaining partial records", async () => {
  const previous = await (async () => {
    const seed = createHarness({
      input: phaseTwelveArticleInventoryInput(),
      fetchFn: phaseFourInventoryFetch({
        caylentRows: [article({ id: "phase5-invalid-prior-seed", title: "Prior v2 record seed" })],
        builderArticles: [],
        simpleArticles: [],
        hashnodeRows: [],
        dondeArticles: [],
        awsResponder: () => awsForEngineersIndex([])
      })
    });
    await seed.handler({}, {});
    return JSON.parse(seed.objects.get(outputKey));
  })();
  assert.ok(previous.groups.articles, "the fixture starts from an actual public input12 catalog");
  assertPhaseFiveCatalogShape(previous.groups.articles);

  const mutations = [
    ["record ID does not hash its identity", (group) => { group.records[0].id = "0".repeat(64); }],
    ["counts disagree with records while preserving the language sum", (group) => {
      group.counts.all += 1;
      group.counts[group.records[0].language] += 1;
    }],
    ["row date disagrees with its publication date", (group) => { group.records[0].publishedAt = "2025-01-01"; }],
    ["publication contains a provider-only field", (group) => {
      group.records[0].publications[0].providerId = "synthetic-private-prior-provider-id";
    }],
    ["identity is duplicated while count totals remain arithmetically valid", (group) => {
      group.records.push(structuredClone(group.records[0]));
      group.counts.all += 1;
      group.counts[group.records[0].language] += 1;
      group.records.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    }]
  ];
  for (const [name, mutate] of mutations) {
    const stored = structuredClone(previous);
    mutate(stored.groups.articles);
    const harness = createHarness({
      input: phaseTwelveArticleInventoryInput(),
      fetchFn: phaseFourInventoryFetch({
        caylentRows: [],
        builderArticles: [],
        simpleArticles: [],
        hashnodeRows: [],
        dondeArticles: [],
        awsResponder: () => new Response("synthetic v2 validation source failure", { status: 503 })
      })
    });
    harness.objects.set(outputKey, JSON.stringify(stored));
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), false, `${name} invalidates the whole old Article family`);
    assert.ok(output.groups.talks && output.groups.books, `${name} remains local to Articles`);
  }
});

test("input12 keeps title-language identity when distinct titles share a public URL", async () => {
  const sharedUrl = "/blog/phase5-same-destination";
  const englishTitle = "Same destination first identity";
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput(),
    fetchFn: phaseFourInventoryFetch({
      caylentRows: [
        article({ id: "phase5-same-url-first", title: englishTitle, url: sharedUrl }),
        article({ id: "phase5-same-url-second", title: "Same destination second identity", url: sharedUrl })
      ],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [dondeAprendoArticle({ title: englishTitle, slug: "phase5-same-destination-es" })],
      awsResponder: () => awsForEngineersIndex([])
    })
  });

  await harness.handler({}, {});

  const group = (await readPut(harness.putCalls[0])).groups.articles;
  assertPhaseFiveCatalogShape(group);
  assert.deepEqual(group.counts, { all: 3, en: 2, es: 1 },
    "title differences remain separate and the same title in another language is another identity");
  const firstEnglish = group.records.find(({ id }) => id === phaseFiveCatalogId(englishTitle, "en"));
  const secondEnglish = group.records.find(({ id }) => id === phaseFiveCatalogId("Same destination second identity", "en"));
  const translatedSpanish = group.records.find(({ id }) => id === phaseFiveCatalogId(englishTitle, "es"));
  assert.ok(firstEnglish && secondEnglish && translatedSpanish);
  assert.equal(firstEnglish.publications[0].url, "https://caylent.com/blog/phase5-same-destination");
  assert.equal(secondEnglish.publications[0].url, firstEnglish.publications[0].url,
    "the same destination can belong to two title identities without URL-based merging");
  assert.notEqual(firstEnglish.id, translatedSpanish.id, "language is part of the stable record identity");
  assert.equal(translatedSpanish.publications[0].sourceId, "donde-aprendo-aws");
});

const phaseFiveInvalidSimpleUrls = [
  "https://unapproved.example.invalid/not-a-simple-aws-article",
  "https://newsletter.simpleaws.dev/admin",
  "https://newsletter.simpleaws.dev/preview/phase5",
  "http://newsletter.simpleaws.dev/p/http-is-not-https",
  "https://user@newsletter.simpleaws.dev/p/credentials",
  "https://newsletter.simpleaws.dev:444/p/nonstandard-port",
  "https://newsletter.simpleaws.dev/p/query?preview=1",
  "https://newsletter.simpleaws.dev/p/fragment#preview"
];

for (const [index, webUrl] of phaseFiveInvalidSimpleUrls.entries()) {
  test(`input12 rejects an invalid explicit Simple AWS destination (${index + 1})`, async () => {
    const harness = createHarness({
      input: phaseTwelveArticleInventoryInput(),
      fetchFn: phaseFourInventoryFetch({
        caylentRows: [],
        builderArticles: [],
        simpleArticles: [beehiivPost({
          id: `phase5-invalid-url-${index}`,
          title: "Invalid public URL canary",
          platform: "both",
          web_url: webUrl
        })],
        hashnodeRows: [],
        dondeArticles: [],
        awsResponder: () => awsForEngineersIndex([])
      })
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), false,
      `invalid Simple AWS destination is rejected: ${webUrl}`);
    assert.ok(output.groups.talks && output.groups.books, "the invalid URL remains local to Articles");
    assert.equal(JSON.stringify(output).includes("Invalid public URL canary"), false);
    assert.equal(JSON.stringify(output).includes(webUrl), false);
    assert.equal(harness.logs.join("\n").includes(webUrl), false);
  });
}

test("input12 may retain a valid v1 count-only Articles group during the v2 transition", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  let awsFails = false;
  const harness = createHarness({
    input: phaseTwelveArticleInventoryInput(),
    clock,
    fetchFn: phaseFourInventoryFetch({
      caylentRows: [],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsFails
        ? new Response("synthetic transition source outage", { status: 503 })
        : awsForEngineersIndex([awsForEngineersArticle({ title: "Transition catalog source", slug: "phase5-transition" })])
    })
  });

  await harness.handler({}, {});
  const first = await readPut(harness.putCalls[0]);
  assertPhaseFiveCatalogShape(first.groups.articles);
  const previousV1 = structuredClone(first.groups.articles);
  previousV1.definitionVersion = 1;
  delete previousV1.records;
  harness.objects.set(outputKey, JSON.stringify({ schemaVersion: 1, groups: { articles: previousV1 } }));

  awsFails = true;
  clock.set("2026-10-17T12:00:00.000Z");
  await harness.handler({}, {});
  const failed = await readPut(harness.putCalls[1]);
  assert.deepEqual(failed.groups.articles, previousV1,
    "the same validated scope can retain a transitional v1 aggregate without fabricating records");
  assert.equal(Object.hasOwn(failed.groups.articles, "records"), false);
  assert.ok(failed.groups.talks && failed.groups.books, "siblings refresh with legacy Article fallback");
});

test("implementation regression: Article catalog date ordering and cutoff retain fractional precision", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const title = "Fractional date precision identity";
  const earlier = "2025-01-01T00:00:00.1234Z";
  const later = "2025-01-01T00:00:00.12345Z";
  const input = phaseTwelveArticleInventoryInput({
    articleInventory: {
      publications: [
        manualArticlePublication("dev-community", title, "en", earlier, "https://dev.to/guille/fraction-precision"),
        manualArticlePublication("linkedin-articles", title, "en", later, "https://www.linkedin.com/pulse/fraction-precision")
      ],
      exclusions: []
    },
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T10:00:00.000Z",
      views: { en: 4, es: 2 }
    })
  });
  let awsFails = false;
  const harness = createHarness({
    input,
    clock,
    fetchFn: phaseFourInventoryFetch({
      caylentRows: [],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsFails
        ? new Response("synthetic precision-cutoff outage", { status: 503 })
        : awsForEngineersIndex([])
    })
  });

  await harness.handler({}, {});
  const output = await readPut(harness.putCalls[0]);
  const group = output.groups.articles;
  assert.equal(group.definitionVersion, 2);
  assert.deepEqual(group.counts, { all: 1, en: 1, es: 0 });
  const record = group.records[0];
  assert.equal(record.publishedAt, earlier,
    "the shorter fraction is earlier even though Date.parse truncates both source values to milliseconds");
  assert.deepEqual(record.publications.map(({ publishedAt }) => publishedAt), [earlier, later]);

  const stored = JSON.parse(harness.objects.get(outputKey));
  const previousRecord = stored.groups.articles.records[0];
  const futureBySubNanosecond = "2026-10-16T12:00:00.0000000001Z";
  previousRecord.publications[0].publishedAt = futureBySubNanosecond;
  harness.objects.set(outputKey, JSON.stringify(stored));
  awsFails = true;
  await harness.handler({}, {});
  const failed = await readPut(harness.putCalls[1]);
  assert.equal(Object.hasOwn(failed.groups, "articles"), false,
    "a prior v2 publication even one sub-nanosecond beyond collectedAt is rejected as future");
  assert.ok(failed.groups.talks && failed.groups.books,
    "invalid prior Article date metadata remains local to Articles");
});

test("implementation regression: invalid v2 source metadata stays within Articles while legacy and recovery work", async () => {
  const privateEncodedPath = "/blog/article%2fprivate";
  const record = article({
    id: "phase5-encoded-caylent-url",
    title: "Caylent URL accepted by legacy count projection",
    url: privateEncodedPath
  });
  const requestLog = [];
  const legacyHarness = createHarness({
    input: phaseThreeInput(),
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentRows: [record],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsForEngineersIndex([])
    })
  });
  await legacyHarness.handler({}, {});
  const legacy = (await readPut(legacyHarness.putCalls[0])).groups.articles;
  assert.equal(legacy.definitionVersion, 1);
  assert.deepEqual(legacy.counts, { all: 1, en: 1, es: 0 },
    "legacy source eligibility and count-only validation remain unchanged");
  assert.equal(Object.hasOwn(legacy, "records"), false);

  const clock = createClock("2026-10-16T12:00:00.000Z");
  const input12 = phaseTwelveArticleInventoryInput({
    builderArticleViews: manualBuilderArticleViewsInput({
      observedAt: "2026-10-16T10:00:00.000Z",
      views: { en: 4, es: 2 }
    })
  });
  let awsFails = false;
  const harness = createHarness({
    input: input12,
    clock,
    fetchFn: phaseFourInventoryFetch({
      requestLog,
      caylentRows: [record],
      builderArticles: [],
      simpleArticles: [],
      hashnodeRows: [],
      dondeArticles: [],
      awsResponder: () => awsFails
        ? new Response("synthetic late source outage", { status: 503 })
        : awsForEngineersIndex([])
    })
  });

  await harness.handler({}, {});
  const invalidFirst = await readPut(harness.putCalls[0]);
  assert.equal(Object.hasOwn(invalidFirst.groups, "articles"), false,
    "a catalog-invalid source omits Articles when no scope-compatible prior exists");
  assert.ok(invalidFirst.groups.talks && invalidFirst.groups.books,
    "healthy siblings still publish when catalog-only validation rejects source metadata");

  record.data.url = "/blog/phase5-corrected-caylent-url";
  await harness.handler({}, {});
  const recoveredOutput = await readPut(harness.putCalls[1]);
  const recovered = recoveredOutput.groups.articles;
  assert.equal(recovered.definitionVersion, 2);
  assert.deepEqual(recovered.counts, { all: 1, en: 1, es: 0 });
  assert.equal(recovered.records[0].publications[0].url,
    "https://caylent.com/blog/phase5-corrected-caylent-url");

  const originalV2 = structuredClone(recovered);
  record.data.url = privateEncodedPath;
  awsFails = true;
  clock.set("2026-10-16T12:01:00.000Z");
  await harness.handler({}, {});
  const retainedOutput = await readPut(harness.putCalls[2]);
  assert.deepEqual(retainedOutput.groups.articles, originalV2,
    "the same exact scope retains its complete valid v2 group after local catalog validation fails");
  assert.equal(retainedOutput.groups.talks.collectedAt, "2026-10-16T12:01:00.000Z",
    "healthy siblings refresh beside the retained Article group");

  record.data.url = "/blog/phase5-corrected-caylent-url";
  record.data.title = "Caylent metadata recovered cleanly";
  awsFails = false;
  clock.set("2026-10-16T12:02:00.000Z");
  await harness.handler({}, {});
  const recoveredAgain = (await readPut(harness.putCalls[3])).groups.articles;
  assert.equal(recoveredAgain.definitionVersion, 2);
  assert.deepEqual(recoveredAgain.counts, { all: 1, en: 1, es: 0 });
  assert.equal(recoveredAgain.records[0].title, "Caylent metadata recovered cleanly");
  assert.equal(recoveredAgain.scopeId, originalV2.scopeId,
    "provider result changes do not alter the maintained selector/inventory scope");
});

test("implementation regression: input12 producer preserves valid date forms and rejects dates or DEV routes the client cannot publish", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const sources = [sourceInput().source, builderCenterSource()];
  const baseInput = phaseThreeInput({ sources });
  const inputFor = (articleInventory) => phaseTwelveArticleInventoryInput({ baseInput, articleInventory });
  const validPublications = [
    manualArticlePublication("dev-community", "Date-only producer control", "en", "2025-01-01", "https://dev.to/guille/date-only"),
    manualArticlePublication("dev-community", "Fraction and offset producer control", "en", "2025-01-01T00:00:00.123456789-14:00", "https://dev.to/guille/date-fraction"),
    manualArticlePublication("dev-community", "Maximum offset producer control", "en", "2025-01-01T00:00:00+14:00", "https://dev.to/guille/date-offset"),
    manualArticlePublication("dev-community", "Unknown producer date control", "en", null, "https://dev.to/guille/date-unknown")
  ];
  const validHarness = createHarness({
    input: inputFor({ publications: validPublications, exclusions: [] }),
    clock,
    fetchFn: builderApiFetch()
  });
  await validHarness.handler({}, {});
  const validGroup = (await readPut(validHarness.putCalls[0])).groups.articles;
  assert.equal(validGroup.definitionVersion, 2);
  assert.deepEqual(validGroup.records.map(({ publications }) => publications[0].publishedAt).sort(),
    validPublications.map(({ publishedAt }) => publishedAt).sort(),
    "the producer keeps date-only values, offsets, fractional precision, and unknown dates unchanged");

  const invalidCases = [
    ["24:00 timestamp", (publications) => { publications[0].publishedAt = "2025-01-01T24:00:00Z"; }],
    ["15-hour offset", (publications) => { publications[0].publishedAt = "2025-01-01T00:00:00+15:00"; }],
    ["14:01 offset", (publications) => { publications[0].publishedAt = "2025-01-01T00:00:00+14:01"; }],
    ["editor route", (publications) => { publications[0].url = "https://dev.to/guille/a-post/edit"; }],
    ["tag route", (publications) => { publications[0].url = "https://dev.to/t/aws"; }],
    ["encoded tag route", (publications) => { publications[0].url = "https://dev.to/t%61g/aws"; }],
    ["feed route", (publications) => { publications[0].url = "https://dev.to/feed/guille"; }],
    ["reserved user series route", (publications) => { publications[0].url = "https://dev.to/guille/series"; }],
    ["reserved user settings route", (publications) => { publications[0].url = "https://dev.to/guille/settings"; }],
    ["preview route", (publications) => { publications[0].url = "https://dev.to/admin/preview"; }]
  ];
  for (const [description, mutate] of invalidCases) {
    const publications = [manualArticlePublication(
      "dev-community", `Invalid ${description}`, "en", "2025-01-01", "https://dev.to/guille/invalid-control"
    )];
    mutate(publications);
    const harness = createHarness({
      input: inputFor({ publications, exclusions: [] }),
      clock,
      fetchFn: builderApiFetch()
    });
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), false,
      `${description}: an invalid manual inventory does not replace the Articles family`);
    assert.ok(output.groups.talks && output.groups.books, `${description}: independent curated families publish`);
  }
});

test("implementation regression: invalid timestamps and DEV routes are discarded from a prior Articles group", async () => {
  const clock = createClock("2026-10-16T12:00:00.000Z");
  const sources = [sourceInput().source, builderCenterSource()];
  const inventory = {
    publications: [manualArticlePublication(
      "dev-community", "Prior contract article", "en", "2025-01-01T12:00:00.123456Z", "https://dev.to/guille/prior-contract"
    )],
    exclusions: []
  };
  const baseInput = phaseThreeInput({ sources });
  const input = phaseTwelveArticleInventoryInput({ baseInput, articleInventory: inventory });
  const seed = createHarness({ input, clock, fetchFn: builderApiFetch() });
  await seed.handler({}, {});
  const previous = JSON.parse(seed.objects.get(outputKey));
  assert.ok(previous.groups.articles, "the fixture starts from a complete handler-produced v2 group");

  const invalidPriorCases = [
    ["24:00 timestamp", (group) => {
      group.records[0].publishedAt = "2025-01-01T24:00:00Z";
      group.records[0].publications[0].publishedAt = "2025-01-01T24:00:00Z";
    }],
    ["15-hour offset", (group) => {
      group.records[0].publishedAt = "2025-01-01T00:00:00+15:00";
      group.records[0].publications[0].publishedAt = "2025-01-01T00:00:00+15:00";
    }],
    ["editor route", (group) => { group.records[0].publications[0].url = "https://dev.to/guille/a-post/edit"; }],
    ["reserved tag route", (group) => { group.records[0].publications[0].url = "https://dev.to/t/aws"; }],
    ["encoded reserved tag route", (group) => { group.records[0].publications[0].url = "https://dev.to/t%61g/aws"; }],
    ["feed route", (group) => { group.records[0].publications[0].url = "https://dev.to/feed/guille"; }],
    ["reserved user settings route", (group) => { group.records[0].publications[0].url = "https://dev.to/guille/settings"; }],
    ["preview route", (group) => { group.records[0].publications[0].url = "https://dev.to/admin/preview"; }]
  ];
  for (const [description, mutate] of invalidPriorCases) {
    const stored = structuredClone(previous);
    mutate(stored.groups.articles);
    const harness = createHarness({
      input,
      clock,
      fetchFn: builderApiFetch({
        caylentPages: new Map([[0, () => jsonResponse({ error: "synthetic prior validation outage" }, 503)]]),
        builderPages: new Map([["", () => jsonResponse({ error: "synthetic prior validation outage" }, 503)]])
      })
    });
    harness.objects.set(outputKey, JSON.stringify(stored));
    await harness.handler({}, {});
    const output = await readPut(harness.putCalls[0]);
    assert.equal(Object.hasOwn(output.groups, "articles"), false,
      `${description}: invalid prior Article records are not retained`);
    assert.ok(output.groups.talks && output.groups.books,
      `${description}: invalid prior data remains isolated from healthy siblings`);
  }
});

test("implementation regression: uncertain S3 Put results resolve only when readback matches the complete intended bytes", async () => {
  const input = phaseThreeInput();
  const fetchFn = builderApiFetch();
  const healthy = createHarness({ input, fetchFn });
  const healthyResult = await healthy.handler({}, {});
  assert.equal(healthyResult.status, "published");
  assert.equal(healthy.putCalls.length, 1);
  assert.equal(healthy.getCalls.filter(({ Key }) => Key === outputKey).length, 1,
    "the healthy path performs only the existing prior-snapshot read");

  const lostResponse = new Error("synthetic connection lost after commit");
  const committed = createHarness({ input, fetchFn, putFailureAfterCommit: lostResponse });
  const committedResult = await committed.handler({}, {});
  assert.equal(committedResult.status, "published", "matching bytes prove the write committed despite the lost response");
  assert.equal(committed.putCalls.length, 1, "resolving uncertainty does not issue another write");
  assert.equal(committed.getCalls.filter(({ Key }) => Key === outputKey).length, 2,
    "one readback follows the existing prior-snapshot read");
  assert.equal(committed.objects.get(outputKey), bodyText(committed.putCalls[0].Body));
  assert.equal(committed.logs.join("\n").includes(lostResponse.message), false,
    "the SDK error detail is not logged");

  const previousBytes = '{"schemaVersion":1,"groups":{"talks":{"previous":"bytes"}}}';
  const precommit = createHarness({ input, fetchFn, putFailure: new Error("synthetic precommit failure") });
  precommit.objects.set(outputKey, previousBytes);
  await assert.rejects(() => precommit.handler({}, {}), (error) => error.code === "OUTPUT_WRITE_FAILED");
  assert.equal(precommit.objects.get(outputKey), previousBytes, "a precommit failure preserves the prior bytes");
  assert.equal(precommit.getCalls.filter(({ Key }) => Key === outputKey).length, 2,
    "the prior snapshot is read once and the uncertain Put is read back once");
  assert.equal(precommit.putCalls.length, 1);

  for (const mode of ["different", "malformed", "absent", "read-error"]) {
    const privateFailure = new Error("synthetic private readback detail");
    const harness = createHarness({
      input,
      fetchFn,
      putFailureAfterCommit: new Error("synthetic lost Put response"),
      ...(mode === "read-error"
        ? { outputReadbackFailure: privateFailure }
        : { outputReadbackMode: mode })
    });
    harness.objects.set(outputKey, previousBytes);
    await assert.rejects(() => harness.handler({}, {}), (error) => {
      assert.equal(error.code, "OUTPUT_WRITE_FAILED", `${mode}: the public error stays sanitized`);
      assert.equal(error.message.includes("synthetic"), false, `${mode}: storage details do not escape`);
      return true;
    });
    assert.equal(harness.putCalls.length, 1, `${mode}: uncertainty is resolved without a retry write`);
    assert.equal(harness.getCalls.filter(({ Key }) => Key === outputKey).length, 2,
      `${mode}: only one readback follows the existing prior-snapshot read`);
    assert.equal(harness.logs.join("\n").includes("synthetic"), false,
      `${mode}: storage details are not logged`);
  }
});
