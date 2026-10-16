const { createHash } = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});
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
    outputKey: requireString(env.STATS_OUTPUT_KEY, "CONFIGURATION_INVALID")
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
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) throw fail("INPUT_VERSION_UNSUPPORTED");
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

  // Always use a stable source order for public output and semantic scope.
  return {
    schemaVersion: 2,
    sources: [sourcesById.get("caylent"), sourcesById.get("builder-center")]
  };
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

async function fetchJson(url, sourceId, page) {
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
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
  url.searchParams.set("cursor", cursor);
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

function makeOutput(sources, counts, collectedAt) {
  return {
    schemaVersion: 1,
    groups: {
      articles: {
        definitionVersion: 1,
        basis: "cumulative",
        collectedAt,
        scopeId: scopeFingerprint(sources),
        sources: sources.map(({ id }) => ({ id, label: SOURCE_LABELS[id] })),
        counts
      }
    }
  };
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = expected.slice().sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function validateOutput(output) {
  if (!exactKeys(output, ["schemaVersion", "groups"]) || output.schemaVersion !== 1) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (!exactKeys(output.groups, ["articles"])) throw fail("OUTPUT_SCHEMA_INVALID");
  const group = output.groups.articles;
  if (!exactKeys(group, ["definitionVersion", "basis", "collectedAt", "scopeId", "sources", "counts"])) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (group.definitionVersion !== 1 || group.basis !== "cumulative") throw fail("OUTPUT_SCHEMA_INVALID");
  const collected = Date.parse(group.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== group.collectedAt) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (typeof group.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(group.scopeId)) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (!Array.isArray(group.sources) || group.sources.length < 1 || group.sources.length > 2) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const expectedSources = group.sources.length === 1
    ? [["caylent", "Caylent"]]
    : [["caylent", "Caylent"], ["builder-center", "AWS Builder Center"]];
  if (group.sources.some((source, index) => !exactKeys(source, ["id", "label"]) ||
      source.id !== expectedSources[index][0] || source.label !== expectedSources[index][1])) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (!exactKeys(group.counts, ["all", "en", "es"])) throw fail("OUTPUT_SCHEMA_INVALID");
  for (const count of Object.values(group.counts)) {
    if (!Number.isSafeInteger(count) || count < 0) throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (group.counts.all !== group.counts.en + group.counts.es) throw fail("OUTPUT_SCHEMA_INVALID");
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
    const collection = await collectPublications(configuration.sources, now);
    const output = makeOutput(configuration.sources, collection.counts, collectedAt);
    validateOutput(output);

    try {
      await s3.send(new PutObjectCommand({
        Bucket: env.bucket,
        Key: env.outputKey,
        Body: JSON.stringify(output),
        ContentType: "application/json",
        CacheControl: OUTPUT_CACHE_CONTROL
      }));
    } catch {
      throw fail("OUTPUT_WRITE_FAILED");
    }

    log("info", {
      event: "content_stats_collection_succeeded",
      sourceIds,
      pagesBySource: collection.pagesBySource,
      publicationCount: collection.publications.length,
      counts: collection.counts,
      collectedAt
    });
    return { status: "published", collectedAt, count: collection.counts.all };
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : "COLLECTION_FAILED";
    log("error", { event: "content_stats_collection_failed", sourceIds, code });
    if (error instanceof CollectorError) throw error;
    throw fail(code);
  }
}

module.exports = { handler };
