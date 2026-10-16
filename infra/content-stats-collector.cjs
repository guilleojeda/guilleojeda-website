const { createHash } = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");

const s3 = new S3Client({});
const secretsManager = new SecretsManagerClient({});
const CONTENT_API_ENDPOINT = "https://cdn.builder.io/api/v3/content/blog-post";
const BUILDER_API_ENDPOINT = "https://api.builder.aws.com/cs/v2/articles/user/";
const PAGE_SIZE = 10;
const MAX_CAYLENT_PAGES = 100;
const BUILDER_PAGE_SIZE = 50;
const MAX_BUILDER_PAGES = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TRANSIENT_RETRIES = 1;
const OUTPUT_CACHE_CONTROL = "public,max-age=0,must-revalidate";
const SUPPORTED_LANGUAGES = new Set(["en", "es"]);
const ARTICLE_IDENTITY_POLICY = "title-language-v1";
const TALK_KINDS = new Set([
  "talk",
  "workshop",
  "training",
  "panel",
  "session",
  "hosting",
  "podcast",
  "commentary",
  "conversation",
  "unknown"
]);
const TALK_STATUSES = new Set(["delivered", "scheduled", "unknown"]);
const BOOK_STATUSES = new Set(["published", "in-progress", "unknown"]);
const SPEAKING_KINDS = new Set(["talk", "workshop", "training", "panel", "session"]);
const CURATED_SOURCE = Object.freeze({ id: "website-inventory", label: "Website inventory" });
const NEWSLETTER_PUBLICATION = Object.freeze({ id: "simple-aws", label: "Simple AWS" });
const BEEHIIV_API_ENDPOINT = "https://api.beehiiv.com/v2/publications/";
const SOURCE_LABELS = Object.freeze({
  caylent: "Caylent",
  "builder-center": "AWS Builder Center"
});

class CollectorError extends Error {
  constructor(code) {
    super("Content statistics collection failed");
    this.name = "ContentStatsCollectorError";
    this.code = code;
  }
}

function fail(code) {
  return new CollectorError(code);
}

function log(level, record) {
  try {
    console[level](JSON.stringify(record));
  } catch {
    // Logging must not change the collection or publication result.
  }
}

function requireString(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw fail(code);
  return value.trim();
}

function validateEnvironment(env) {
  const configuration = {
    bucket: requireString(env.STATS_BUCKET, "CONFIGURATION_INVALID"),
    inputKey: requireString(env.STATS_INPUT_KEY, "CONFIGURATION_INVALID"),
    outputKey: requireString(env.STATS_OUTPUT_KEY, "CONFIGURATION_INVALID"),
    BEEHIIV_API_KEY_SECRET_ARN: env.BEEHIIV_API_KEY_SECRET_ARN
  };
  if (configuration.inputKey === configuration.outputKey) throw fail("CONFIGURATION_INVALID");
  return configuration;
}

async function bodyToString(body) {
  if (body == null) throw fail("INPUT_BODY_MISSING");
  if (typeof body.transformToString !== "function") throw fail("INPUT_BODY_UNREADABLE");
  try {
    const value = await body.transformToString();
    if (typeof value !== "string") throw fail("INPUT_BODY_UNREADABLE");
    return value;
  } catch {
    throw fail("INPUT_BODY_UNREADABLE");
  }
}

async function readInput(bucket, key) {
  let response;
  try {
    response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    throw fail("INPUT_READ_FAILED");
  }

  let raw;
  try {
    raw = await bodyToString(response && response.Body);
  } catch (error) {
    if (error instanceof CollectorError) throw error;
    throw fail("INPUT_BODY_UNREADABLE");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw fail("INPUT_JSON_INVALID");
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateCaylentSource(source) {
  if (!isObject(source)) throw fail("INPUT_SCHEMA_INVALID");
  if (source.id !== "caylent") throw fail("SOURCE_UNSUPPORTED");
  const validated = {
    id: "caylent",
    authorId: requireString(source.authorId, "INPUT_SCHEMA_INVALID"),
    apiKey: requireString(source.apiKey, "INPUT_SCHEMA_INVALID"),
    language: requireString(source.language, "INPUT_SCHEMA_INVALID"),
    originality: requireString(source.originality, "INPUT_SCHEMA_INVALID")
  };
  if (!SUPPORTED_LANGUAGES.has(validated.language)) throw fail("LANGUAGE_UNSUPPORTED");
  if (validated.originality !== "original") throw fail("ORIGINALITY_POLICY_UNSUPPORTED");
  return validated;
}

function validateBuilderSource(source) {
  if (!isObject(source)) throw fail("INPUT_SCHEMA_INVALID");
  if (source.id !== "builder-center") throw fail("SOURCE_UNSUPPORTED");
  return {
    id: "builder-center",
    authorId: requireString(source.authorId, "INPUT_SCHEMA_INVALID")
  };
}

function validateInput(input) {
  if (!isObject(input)) throw fail("INPUT_SCHEMA_INVALID");
  if (![1, 2, 3, 4].includes(input.schemaVersion)) {
    throw fail("INPUT_VERSION_UNSUPPORTED");
  }
  if (input.definitionVersion !== 1) throw fail("INPUT_VERSION_UNSUPPORTED");

  if (input.schemaVersion === 1) {
    return { schemaVersion: 1, sources: [validateCaylentSource(input.source)] };
  }

  if (!Array.isArray(input.sources) || input.sources.length !== 2) throw fail("INPUT_SCHEMA_INVALID");
  const sourcesById = new Map();
  for (const source of input.sources) {
    if (!isObject(source) || typeof source.id !== "string") throw fail("INPUT_SCHEMA_INVALID");
    if (sourcesById.has(source.id)) throw fail("SOURCE_SET_INVALID");
    if (source.id === "caylent") sourcesById.set(source.id, validateCaylentSource(source));
    else if (source.id === "builder-center") sourcesById.set(source.id, validateBuilderSource(source));
    else throw fail("SOURCE_UNSUPPORTED");
  }
  if (sourcesById.size !== 2 || !sourcesById.has("caylent") || !sourcesById.has("builder-center")) {
    throw fail("SOURCE_SET_INVALID");
  }

  if (input.schemaVersion === 3 || input.schemaVersion === 4) {
    const expectedKeys = input.schemaVersion === 3
      ? ["schemaVersion", "definitionVersion", "sources", "curated"]
      : ["schemaVersion", "definitionVersion", "sources", "curated", "newsletter"];
    if (!exactKeys(input, expectedKeys) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"])) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    return {
      schemaVersion: input.schemaVersion,
      sources: [sourcesById.get("caylent"), sourcesById.get("builder-center")],
      curated: input.curated,
      ...(input.schemaVersion === 4 ? { newsletter: input.newsletter } : {})
    };
  }

  // Always use a stable source order for public output and semantic scope.
  return {
    schemaVersion: 2,
    sources: [sourcesById.get("caylent"), sourcesById.get("builder-center")]
  };
}

function curatedScopeFingerprint(family, facts) {
  const selectors = facts.map((fact) => family === "talks"
    ? { id: fact.id, kind: fact.kind, status: fact.status, language: fact.language }
    : { id: fact.id, status: fact.status, language: fact.language })
    .sort((left, right) => left.id.localeCompare(right.id));
  const scope = {
    definitionVersion: 1,
    family,
    policy: family === "talks" ? "delivered-speaking-inventory-v1" : "published-books-inventory-v1",
    supportedLanguages: ["en", "es"],
    sources: [CURATED_SOURCE],
    facts: selectors
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function validateCuratedFacts(family, value) {
  if (!Array.isArray(value)) throw fail(`CURATED_${family.toUpperCase()}_INVALID`);
  const facts = [];
  const ids = new Set();
  for (const fact of value) {
    const expectedKeys = family === "talks"
      ? ["id", "kind", "status", "language"]
      : ["id", "status", "language"];
    if (!exactKeys(fact, expectedKeys)) throw fail(`CURATED_${family.toUpperCase()}_INVALID`);
    const id = requireString(fact.id, `CURATED_${family.toUpperCase()}_INVALID`);
    if (ids.has(id)) throw fail(`CURATED_${family.toUpperCase()}_INVALID`);
    ids.add(id);

    const status = requireString(fact.status, `CURATED_${family.toUpperCase()}_INVALID`);
    const kind = family === "talks"
      ? requireString(fact.kind, `CURATED_${family.toUpperCase()}_INVALID`)
      : undefined;
    if (family === "talks" && (!TALK_KINDS.has(kind) || !TALK_STATUSES.has(status))) {
      throw fail("CURATED_TALKS_INVALID");
    }
    if (family === "books" && !BOOK_STATUSES.has(status)) throw fail("CURATED_BOOKS_INVALID");
    const language = fact.language === null
      ? null
      : requireString(fact.language, `CURATED_${family.toUpperCase()}_INVALID`);
    facts.push(family === "talks"
      ? { id, kind, status, language }
      : { id, status, language });
  }
  return facts;
}

function deriveCuratedGroup(family, value, collectedAt) {
  const facts = validateCuratedFacts(family, value);
  const counts = { all: 0, en: 0, es: 0 };
  for (const fact of facts) {
    const eligible = family === "talks"
      ? fact.status === "delivered" && SPEAKING_KINDS.has(fact.kind)
      : fact.status === "published";
    if (!eligible || !SUPPORTED_LANGUAGES.has(fact.language)) continue;
    counts[fact.language] += 1;
    counts.all += 1;
  }
  return makeGroup({
    sources: [CURATED_SOURCE],
    counts,
    collectedAt,
    scopeId: curatedScopeFingerprint(family, facts)
  });
}

function validateNewsletterSelection(value) {
  if (!exactKeys(value, ["id", "publicationId", "language"]) || value.id !== NEWSLETTER_PUBLICATION.id) {
    throw fail("NEWSLETTER_CONFIGURATION_INVALID");
  }
  const publicationId = requireString(value.publicationId, "NEWSLETTER_CONFIGURATION_INVALID");
  const language = requireString(value.language, "NEWSLETTER_CONFIGURATION_INVALID");
  if (!SUPPORTED_LANGUAGES.has(language)) throw fail("NEWSLETTER_CONFIGURATION_INVALID");
  return { id: NEWSLETTER_PUBLICATION.id, publicationId, language };
}

function newsletterScopeFingerprint(selection) {
  const scope = {
    definitionVersion: 1,
    family: "newsletter",
    policy: "beehiiv-active-subscribers-v1",
    publication: { ...NEWSLETTER_PUBLICATION, language: selection.language },
    providerPublicationId: selection.publicationId
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function makeNewsletterGroup(selection, subscribers, collectedAt) {
  return {
    definitionVersion: 1,
    basis: "current",
    collectedAt,
    scopeId: newsletterScopeFingerprint(selection),
    publication: { ...NEWSLETTER_PUBLICATION, language: selection.language },
    subscribers
  };
}

async function readBeehiivApiKey(env) {
  const secretId = requireString(env.BEEHIIV_API_KEY_SECRET_ARN, "NEWSLETTER_CREDENTIAL_INVALID");
  let response;
  try {
    response = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretId }));
  } catch {
    throw fail("NEWSLETTER_CREDENTIAL_INVALID");
  }

  if (!isObject(response) || typeof response.SecretString !== "string" || response.SecretString.trim() === "") {
    throw fail("NEWSLETTER_CREDENTIAL_INVALID");
  }
  let secret;
  try {
    secret = JSON.parse(response.SecretString);
  } catch {
    throw fail("NEWSLETTER_CREDENTIAL_INVALID");
  }
  if (!isObject(secret) || typeof secret.apiKey !== "string" || secret.apiKey.trim() === "") {
    throw fail("NEWSLETTER_CREDENTIAL_INVALID");
  }
  return secret.apiKey;
}

async function collectNewsletter(value, env, collectedAt) {
  const selection = validateNewsletterSelection(value);
  const apiKey = await readBeehiivApiKey(env);
  const url = `${BEEHIIV_API_ENDPOINT}${encodeURIComponent(selection.publicationId)}?expand=stat_active_subscriptions`;
  const envelope = await fetchJson(url, selection.id, 1, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    redirect: "error"
  });
  if (!isObject(envelope) || !isObject(envelope.data) || envelope.data.id !== selection.publicationId ||
      !isObject(envelope.data.stats)) {
    throw fail("NEWSLETTER_RESPONSE_INVALID");
  }
  const subscribers = envelope.data.stats.active_subscriptions;
  if (!Number.isSafeInteger(subscribers) || subscribers < 0) throw fail("NEWSLETTER_RESPONSE_INVALID");
  return makeNewsletterGroup(selection, subscribers, collectedAt);
}

function scopeFingerprint(sources) {
  const sourceSelectors = sources.map((source) => source.id === "caylent"
    ? { id: source.id, authorId: source.authorId, language: source.language }
    : { id: source.id, authorId: source.authorId })
    .sort((left, right) => left.id.localeCompare(right.id));
  const scope = {
    definitionVersion: 1,
    identityPolicy: ARTICLE_IDENTITY_POLICY,
    supportedLanguages: ["en", "es"],
    sources: sourceSelectors
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function contentApiUrl(source, offset) {
  const params = new URLSearchParams();
  params.set("apiKey", source.apiKey);
  params.set("query.data.authors.author.id", source.authorId);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  params.set("includeRefs", "true");
  params.set("noTargeting", "true");
  params.set("sort.data.publishedDate", "-1");
  params.set("fields", [
    "id",
    "published",
    "startDate",
    "endDate",
    "data.title",
    "data.publishedDate",
    "data.url",
    "data.authors"
  ].join(","));
  return `${CONTENT_API_ENDPOINT}?${params.toString()}`;
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function fetchJson(url, sourceId, page, options = {}) {
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    let response;
    try {
      const requestOptions = {
        method: "GET",
        headers: options.headers ?? { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      };
      if (options.redirect !== undefined) requestOptions.redirect = options.redirect;
      response = await fetch(url, requestOptions);
    } catch {
      if (attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId, page, reason: "network" });
        continue;
      }
      throw fail("SOURCE_NETWORK_FAILED");
    }

    const status = response && response.status;
    if (!response || typeof response.ok !== "boolean" || !Number.isInteger(status)) {
      throw fail("SOURCE_RESPONSE_INVALID");
    }
    if (!response.ok) {
      if (isTransientStatus(status) && attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId, page, status });
        continue;
      }
      throw fail(`SOURCE_HTTP_${status}`);
    }

    try {
      return await response.json();
    } catch {
      throw fail("SOURCE_JSON_INVALID");
    }
  }

  throw fail("SOURCE_NETWORK_FAILED");
}

async function fetchCaylentPage(source, offset, page) {
  const envelope = await fetchJson(contentApiUrl(source, offset), source.id, page);
  if (!isObject(envelope) || !Array.isArray(envelope.results)) throw fail("SOURCE_ENVELOPE_INVALID");
  return envelope.results;
}

async function fetchBuilderPage(source, cursor, page) {
  const url = new URL(`${BUILDER_API_ENDPOINT}${encodeURIComponent(source.authorId)}`);
  url.searchParams.set("pageSize", String(BUILDER_PAGE_SIZE));
  if (cursor !== "") url.searchParams.set("cursor", cursor);
  const envelope = await fetchJson(url.toString(), source.id, page);
  if (!isObject(envelope) || !Array.isArray(envelope.articles)) throw fail("BUILDER_ENVELOPE_INVALID");
  if (Object.hasOwn(envelope, "cursor") && typeof envelope.cursor !== "string") {
    throw fail("BUILDER_ENVELOPE_INVALID");
  }
  return { articles: envelope.articles, nextCursor: envelope.cursor ?? "" };
}

function parseDate(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null)) return null;
  if (typeof value === "number") return isValidDateTimestamp(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;

  const normalized = value.trim();
  if (/^-?\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return isValidDateTimestamp(numeric) ? numeric : null;
  }
  const parsed = Date.parse(normalized);
  return isValidDateTimestamp(parsed) ? parsed : null;
}

function isValidDateTimestamp(value) {
  if (!Number.isSafeInteger(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() === value;
}

function matchingCaylentAuthor(record, authorId) {
  const authors = record.data.authors;
  if (!Array.isArray(authors) || authors.length === 0) throw fail("ELIGIBLE_RECORD_INVALID");
  let matches = false;
  for (const item of authors) {
    if (!isObject(item) || !isObject(item.author)) throw fail("ELIGIBLE_RECORD_INVALID");
    const id = requireString(item.author.id, "ELIGIBLE_RECORD_INVALID");
    if (id === authorId) matches = true;
  }
  return matches;
}

function normalizedTitle(value) {
  if (typeof value !== "string") throw fail("ELIGIBLE_TITLE_INVALID");
  const normalized = value.normalize("NFC")
    .replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu, "")
    .replace(/[\s\p{White_Space}]+/gu, " ")
    .toLowerCase();
  if (normalized === "") throw fail("ELIGIBLE_TITLE_INVALID");
  return normalized;
}

function normalizedCaylentUrl(value) {
  if (typeof value !== "string" || value.trim() === "") throw fail("ELIGIBLE_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(value.trim(), "https://caylent.com");
  } catch {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "caylent.com" ||
      parsed.username !== "" || parsed.password !== "") {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.startsWith("/blog/") || pathname.length <= "/blog/".length) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  return `https://caylent.com${pathname}`;
}

function normalizedBuilderUrl(articleIdValue, uriValue) {
  const articleId = requireString(articleIdValue, "ELIGIBLE_RECORD_INVALID");
  if (!/^\/content\/[^/?#]+$/.test(articleId)) throw fail("ELIGIBLE_RECORD_INVALID");
  const uri = requireString(uriValue, "ELIGIBLE_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(uri, "https://builder.aws.com");
  } catch {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "builder.aws.com" ||
      parsed.username !== "" || parsed.password !== "") {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const requiredPrefix = `${articleId}/`;
  if (!pathname.startsWith(requiredPrefix) || pathname.length <= requiredPrefix.length) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  return `https://builder.aws.com${pathname}`;
}

function eligibleCaylentPublication(record, source, now) {
  if (!isObject(record)) throw fail("SOURCE_RECORD_INVALID");
  if (typeof record.published !== "string" || record.published.trim() === "") throw fail("SOURCE_RECORD_INVALID");
  if (record.published !== "published") return null;
  if (!isObject(record.data)) throw fail("ELIGIBLE_RECORD_INVALID");
  if (!matchingCaylentAuthor(record, source.authorId)) return null;

  const startDate = parseDate(record.startDate, { optional: true });
  if (record.startDate !== undefined && record.startDate !== null && startDate === null) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  const endDate = parseDate(record.endDate, { optional: true });
  if (record.endDate !== undefined && record.endDate !== null && endDate === null) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  if (startDate !== null && now < startDate) return null;
  if (endDate !== null && now >= endDate) return null;

  const publishedDate = parseDate(record.data.publishedDate);
  if (publishedDate === null) throw fail("ELIGIBLE_RECORD_INVALID");
  if (publishedDate > now) return null;

  const id = requireString(record.id, "ELIGIBLE_RECORD_INVALID");
  const url = normalizedCaylentUrl(record.data.url);
  const title = normalizedTitle(record.data.title);
  return { sourceId: source.id, providerId: id, title, language: source.language, url };
}

function eligibleBuilderPublication(record, source, now) {
  if (!isObject(record)) throw fail("SOURCE_RECORD_INVALID");
  const status = requireString(record.status, "BUILDER_RECORD_INVALID");
  if (status !== "LIVE") return null;
  if (!isObject(record.author)) throw fail("BUILDER_RECORD_INVALID");
  const authorId = requireString(record.author.creatorId, "BUILDER_RECORD_INVALID");
  if (authorId !== source.authorId) return null;

  const language = requireString(record.locale, "BUILDER_RECORD_INVALID");
  if (!SUPPORTED_LANGUAGES.has(language)) return null;
  const publishedAt = parseDate(record.lastPublishedAt);
  if (publishedAt === null) throw fail("BUILDER_RECORD_INVALID");
  if (publishedAt > now) return null;

  const title = normalizedTitle(record.title);
  const url = normalizedBuilderUrl(record.articleId, record.uri);
  return { sourceId: source.id, providerId: record.articleId, title, language, url };
}

async function collectCaylent(source, now) {
  const publications = [];
  let pages = 0;
  for (let page = 0; page < MAX_CAYLENT_PAGES; page += 1) {
    const records = await fetchCaylentPage(source, page * PAGE_SIZE, page + 1);
    pages += 1;
    for (const record of records) {
      const publication = eligibleCaylentPublication(record, source, now);
      if (publication) publications.push(publication);
    }
    if (records.length < PAGE_SIZE) return { publications, pages };
  }
  throw fail("SOURCE_PAGE_CAP_REACHED");
}

async function collectBuilderCenter(source, now) {
  const publications = [];
  const requestedCursors = new Set();
  let cursor = "";

  for (let page = 0; page < MAX_BUILDER_PAGES; page += 1) {
    if (requestedCursors.has(cursor)) throw fail("BUILDER_CURSOR_REPEATED");
    requestedCursors.add(cursor);
    const { articles, nextCursor } = await fetchBuilderPage(source, cursor, page + 1);
    for (const record of articles) {
      const publication = eligibleBuilderPublication(record, source, now);
      if (publication) publications.push(publication);
    }

    if (nextCursor === "") return { publications, pages: page + 1 };
    if (requestedCursors.has(nextCursor)) throw fail("BUILDER_CURSOR_REPEATED");
    if (page === MAX_BUILDER_PAGES - 1) throw fail("BUILDER_PAGE_CAP_REACHED");
    cursor = nextCursor;
  }

  throw fail("BUILDER_PAGE_CAP_REACHED");
}

async function collectPublications(sources, now) {
  const publications = [];
  const pagesBySource = {};
  for (const source of sources) {
    const result = source.id === "caylent"
      ? await collectCaylent(source, now)
      : await collectBuilderCenter(source, now);
    pagesBySource[source.id] = result.pages;
    publications.push(...result.publications);
  }

  const editions = new Set();
  const counts = { all: 0, en: 0, es: 0 };
  for (const publication of publications) {
    const key = JSON.stringify([publication.title, publication.language]);
    if (editions.has(key)) continue;
    editions.add(key);
    counts.all += 1;
    counts[publication.language] += 1;
  }
  return { counts, pagesBySource, publications };
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = expected.slice().sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function makeGroup({ sources, counts, collectedAt, scopeId }) {
  return {
    definitionVersion: 1,
    basis: "cumulative",
    collectedAt,
    scopeId,
    sources: sources.map(({ id, label }) => ({ id, label })),
    counts
  };
}

function makeArticleGroup(sources, counts, collectedAt) {
  return makeGroup({
    sources: sources.map(({ id }) => ({ id, label: SOURCE_LABELS[id] })),
    counts,
    collectedAt,
    scopeId: scopeFingerprint(sources)
  });
}

function makeOutput(groups) {
  return { schemaVersion: 1, groups };
}

function validSourceList(sources, family) {
  if (!Array.isArray(sources)) return false;
  if (family === "articles") {
    const expected = sources.length === 1
      ? [["caylent", "Caylent"]]
      : [["caylent", "Caylent"], ["builder-center", "AWS Builder Center"]];
    return (sources.length === 1 || sources.length === 2) && sources.every((source, index) =>
      exactKeys(source, ["id", "label"]) && source.id === expected[index][0] && source.label === expected[index][1]);
  }
  return sources.length === 1 && exactKeys(sources[0], ["id", "label"]) &&
    sources[0].id === CURATED_SOURCE.id && sources[0].label === CURATED_SOURCE.label;
}

function isValidGroup(group, family) {
  if (!exactKeys(group, ["definitionVersion", "basis", "collectedAt", "scopeId", "sources", "counts"])) {
    return false;
  }
  if (group.definitionVersion !== 1 || group.basis !== "cumulative") return false;
  if (typeof group.collectedAt !== "string") return false;
  const collected = Date.parse(group.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== group.collectedAt) return false;
  if (typeof group.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(group.scopeId)) return false;
  if (!validSourceList(group.sources, family)) return false;
  if (!exactKeys(group.counts, ["all", "en", "es"])) return false;
  for (const count of Object.values(group.counts)) {
    if (!Number.isSafeInteger(count) || count < 0) return false;
  }
  return group.counts.all === group.counts.en + group.counts.es;
}

function isValidNewsletterGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "basis", "collectedAt", "scopeId", "publication", "subscribers"])) {
    return false;
  }
  if (group.definitionVersion !== 1 || group.basis !== "current") return false;
  if (typeof group.collectedAt !== "string") return false;
  const collected = Date.parse(group.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== group.collectedAt) return false;
  if (typeof group.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(group.scopeId)) return false;
  if (!exactKeys(group.publication, ["id", "label", "language"]) ||
      group.publication.id !== NEWSLETTER_PUBLICATION.id || group.publication.label !== NEWSLETTER_PUBLICATION.label ||
      !SUPPORTED_LANGUAGES.has(group.publication.language)) {
    return false;
  }
  return Number.isSafeInteger(group.subscribers) && group.subscribers >= 0;
}

function validateOutput(output) {
  if (!exactKeys(output, ["schemaVersion", "groups"]) || output.schemaVersion !== 1 ||
      !isObject(output.groups)) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const families = Object.keys(output.groups);
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter"]);
  if (families.length < 1 || families.some((family) => !supportedFamilies.has(family))) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  for (const family of families) {
    const valid = family === "newsletter"
      ? isValidNewsletterGroup(output.groups[family])
      : isValidGroup(output.groups[family], family);
    if (!valid) throw fail("OUTPUT_SCHEMA_INVALID");
  }
}

function isNoSuchKey(error) {
  return error && (error.name === "NoSuchKey" || error.Code === "NoSuchKey");
}

async function readPreviousAggregate(bucket, key) {
  let response;
  try {
    response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isNoSuchKey(error)) return null;
    throw fail("OUTPUT_READ_FAILED");
  }

  let raw;
  try {
    raw = await bodyToString(response && response.Body);
  } catch {
    throw fail("OUTPUT_READ_FAILED");
  }
  let previous;
  try {
    previous = JSON.parse(raw);
  } catch {
    throw fail("OUTPUT_JSON_INVALID");
  }
  if (!exactKeys(previous, ["schemaVersion", "groups"]) || previous.schemaVersion !== 1 ||
      !isObject(previous.groups) || Object.keys(previous.groups).length === 0) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter"]);
  if (Object.keys(previous.groups).some((family) => !supportedFamilies.has(family))) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const groups = {};
  for (const family of supportedFamilies) {
    const valid = family === "newsletter"
      ? isValidNewsletterGroup(previous.groups[family])
      : isValidGroup(previous.groups[family], family);
    if (Object.hasOwn(previous.groups, family) && valid) {
      groups[family] = previous.groups[family];
    }
  }
  return groups;
}

async function putOutput(bucket, key, output) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(output),
      ContentType: "application/json",
      CacheControl: OUTPUT_CACHE_CONTROL
    }));
  } catch {
    throw fail("OUTPUT_WRITE_FAILED");
  }
}

async function collectLegacy(configuration, env, collectedAt, now) {
  const collection = await collectPublications(configuration.sources, now);
  const groups = { articles: makeArticleGroup(configuration.sources, collection.counts, collectedAt) };
  const output = makeOutput(groups);
  validateOutput(output);
  await putOutput(env.bucket, env.outputKey, output);
  log("info", {
    event: "content_stats_collection_succeeded",
    sourceIds: configuration.sources.map(({ id }) => id),
    pagesBySource: collection.pagesBySource,
    publicationCount: collection.publications.length,
    counts: collection.counts,
    collectedAt
  });
  return { status: "published", collectedAt, count: collection.counts.all };
}

async function collectIndependentGroups(configuration, env, collectedAt, now) {
  const groups = {};
  const failures = {};
  let articleCollection;
  try {
    articleCollection = await collectPublications(configuration.sources, now);
    groups.articles = makeArticleGroup(configuration.sources, articleCollection.counts, collectedAt);
  } catch (error) {
    if (!(error instanceof CollectorError)) throw error;
    failures.articles = error.code;
  }

  for (const family of ["talks", "books"]) {
    try {
      groups[family] = deriveCuratedGroup(family, configuration.curated[family], collectedAt);
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failures[family] = error.code;
    }
  }

  if (configuration.schemaVersion === 4) {
    try {
      groups.newsletter = await collectNewsletter(configuration.newsletter, env, collectedAt);
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failures.newsletter = error.code;
    }
  }

  const freshFamilies = Object.keys(groups);
  if (freshFamilies.length === 0) throw fail("NO_SUCCESSFUL_GROUPS");

  let previousGroups = null;
  if (Object.keys(failures).length > 0) {
    previousGroups = await readPreviousAggregate(env.bucket, env.outputKey);
    if (previousGroups) {
      for (const family of Object.keys(failures)) {
        if (previousGroups[family]) groups[family] = previousGroups[family];
      }
    }
  }

  const output = makeOutput(groups);
  validateOutput(output);
  await putOutput(env.bucket, env.outputKey, output);
  log("info", {
    event: "content_stats_collection_succeeded",
    sourceIds: configuration.sources.map(({ id }) => id),
    pagesBySource: articleCollection?.pagesBySource ?? {},
    ...(articleCollection ? { publicationCount: articleCollection.publications.length } : {}),
    families: Object.fromEntries(Object.entries(groups).map(([family, group]) => [family, {
      ...(group.counts ? { counts: group.counts } : { subscribers: group.subscribers }),
      collectedAt: group.collectedAt,
      scopeId: group.scopeId,
      retained: Object.hasOwn(failures, family)
    }])),
    familyFailures: failures,
    collectedAt
  });
  const result = { status: "published", collectedAt };
  if (groups.articles) result.count = groups.articles.counts.all;
  return result;
}

async function handler() {
  let sourceIds = ["caylent"];
  try {
    const env = validateEnvironment(process.env || {});
    const input = await readInput(env.bucket, env.inputKey);
    const configuration = validateInput(input);
    sourceIds = configuration.sources.map(({ id }) => id);

    const collectedAt = new Date().toISOString();
    const now = Date.parse(collectedAt);
    return configuration.schemaVersion === 3 || configuration.schemaVersion === 4
      ? await collectIndependentGroups(configuration, env, collectedAt, now)
      : await collectLegacy(configuration, env, collectedAt, now);
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : "COLLECTION_FAILED";
    log("error", { event: "content_stats_collection_failed", sourceIds, code });
    if (error instanceof CollectorError) throw error;
    throw fail(code);
  }
}

module.exports = { handler };
