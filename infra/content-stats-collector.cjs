const { createHash } = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});
const CONTENT_API_ENDPOINT = "https://cdn.builder.io/api/v3/content/blog-post";
const PAGE_SIZE = 10;
const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_TRANSIENT_RETRIES = 1;
const OUTPUT_CACHE_CONTROL = "public,max-age=0,must-revalidate";
const SUPPORTED_LANGUAGES = new Set(["en", "es"]);

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

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("INPUT_SCHEMA_INVALID");
  if (input.schemaVersion !== 1 || input.definitionVersion !== 1) throw fail("INPUT_VERSION_UNSUPPORTED");

  const source = input.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw fail("INPUT_SCHEMA_INVALID");
  if (source.id !== "caylent") throw fail("SOURCE_UNSUPPORTED");
  const authorId = requireString(source.authorId, "INPUT_SCHEMA_INVALID");
  const apiKey = requireString(source.apiKey, "INPUT_SCHEMA_INVALID");
  const language = requireString(source.language, "INPUT_SCHEMA_INVALID");
  const originality = requireString(source.originality, "INPUT_SCHEMA_INVALID");
  if (!SUPPORTED_LANGUAGES.has(language)) throw fail("LANGUAGE_UNSUPPORTED");
  if (originality !== "original") throw fail("ORIGINALITY_POLICY_UNSUPPORTED");

  return { id: source.id, authorId, apiKey, language, originality };
}

function scopeFingerprint(source) {
  const scope = {
    definitionVersion: 1,
    source: {
      id: source.id,
      authorId: source.authorId,
      language: source.language,
      originality: source.originality
    }
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
    "data.publishedDate",
    "data.url",
    "data.authors"
  ].join(","));
  return `${CONTENT_API_ENDPOINT}?${params.toString()}`;
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function requestSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

async function fetchPage(source, offset) {
  const url = contentApiUrl(source, offset);
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: requestSignal()
      });
    } catch {
      if (attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId: source.id, offset, reason: "network" });
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
        log("warn", { event: "content_stats_source_retry", sourceId: source.id, offset, status });
        continue;
      }
      throw fail(`SOURCE_HTTP_${status}`);
    }

    let envelope;
    try {
      envelope = await response.json();
    } catch {
      throw fail("SOURCE_JSON_INVALID");
    }
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || !Array.isArray(envelope.results)) {
      throw fail("SOURCE_ENVELOPE_INVALID");
    }
    return envelope.results;
  }

  throw fail("SOURCE_NETWORK_FAILED");
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

function matchingAuthor(record, authorId) {
  const authors = record.data.authors;
  if (!Array.isArray(authors) || authors.length === 0) throw fail("ELIGIBLE_RECORD_INVALID");
  let matches = false;
  for (const item of authors) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw fail("ELIGIBLE_RECORD_INVALID");
    const author = item.author;
    if (!author || typeof author !== "object" || Array.isArray(author)) throw fail("ELIGIBLE_RECORD_INVALID");
    const id = author.id;
    if (typeof id !== "string" || id.trim() === "") throw fail("ELIGIBLE_RECORD_INVALID");
    if (id === authorId) matches = true;
  }
  return matches;
}

function normalizedArticleUrl(value) {
  if (typeof value !== "string" || value.trim() === "") throw fail("ELIGIBLE_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(value.trim(), "https://caylent.com");
  } catch {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  if (parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "caylent.com" ||
      parsed.username !== "" ||
      parsed.password !== "") {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.startsWith("/blog/") || pathname.length <= "/blog/".length) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  // Query parameters and fragments do not identify distinct Caylent articles.
  const hostname = "caylent.com";
  return `${hostname}${pathname}`;
}

function eligibleIdentity(record, source, now) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw fail("SOURCE_RECORD_INVALID");
  if (typeof record.published !== "string" || record.published.trim() === "") throw fail("SOURCE_RECORD_INVALID");
  if (record.published !== "published") return null;

  if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) {
    throw fail("ELIGIBLE_RECORD_INVALID");
  }
  if (!matchingAuthor(record, source.authorId)) return null;

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
  const url = normalizedArticleUrl(record.data.url);
  return { id, url };
}

async function collectSource(source, now) {
  const ids = new Set();
  const urls = new Set();
  let count = 0;
  let pages = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const records = await fetchPage(source, offset);
    pages += 1;

    for (const record of records) {
      const identity = eligibleIdentity(record, source, now);
      if (!identity) continue;
      const duplicate = ids.has(identity.id) || urls.has(identity.url);
      ids.add(identity.id);
      urls.add(identity.url);
      if (!duplicate) count += 1;
    }

    if (records.length < PAGE_SIZE) return { count, pages };
  }

  throw fail("SOURCE_PAGE_CAP_REACHED");
}

function makeOutput(source, count, collectedAt) {
  const counts = {
    all: count,
    en: source.language === "en" ? count : 0,
    es: source.language === "es" ? count : 0
  };
  return {
    schemaVersion: 1,
    groups: {
      articles: {
        definitionVersion: 1,
        basis: "cumulative",
        collectedAt,
        scopeId: scopeFingerprint(source),
        sources: [{ id: "caylent", label: "Caylent" }],
        counts
      }
    }
  };
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected.slice().sort()[index]);
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
  if (!Array.isArray(group.sources) || group.sources.length !== 1 ||
      !exactKeys(group.sources[0], ["id", "label"]) ||
      group.sources[0].id !== "caylent" || group.sources[0].label !== "Caylent") {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (!exactKeys(group.counts, ["all", "en", "es"])) throw fail("OUTPUT_SCHEMA_INVALID");
  for (const count of Object.values(group.counts)) {
    if (!Number.isSafeInteger(count) || count < 0) throw fail("OUTPUT_SCHEMA_INVALID");
  }
  if (group.counts.all !== group.counts.en + group.counts.es) throw fail("OUTPUT_SCHEMA_INVALID");
}

async function handler() {
  let sourceId = "caylent";
  try {
    const env = validateEnvironment(process.env || {});
    const input = await readInput(env.bucket, env.inputKey);
    const source = validateInput(input);
    sourceId = source.id;

    const collectedAt = new Date().toISOString();
    const now = Date.parse(collectedAt);
    const { count, pages } = await collectSource(source, now);
    const output = makeOutput(source, count, collectedAt);
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

    log("info", { event: "content_stats_collection_succeeded", sourceId, pages, count, collectedAt });
    return { status: "published", collectedAt, count };
  } catch (error) {
    const code = error instanceof CollectorError ? error.code : "COLLECTION_FAILED";
    log("error", { event: "content_stats_collection_failed", sourceId, code });
    if (error instanceof CollectorError) throw error;
    throw fail(code);
  }
}

module.exports = { handler };
