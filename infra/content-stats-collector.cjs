const { createHash } = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");

const s3 = new S3Client({});
const secretsManager = new SecretsManagerClient({});
const ssm = new SSMClient({});
const CONTENT_API_ENDPOINT = "https://cdn.builder.io/api/v3/content/blog-post";
const BUILDER_API_ENDPOINT = "https://api.builder.aws.com/cs/v2/articles/user/";
const PAGE_SIZE = 10;
const MAX_CAYLENT_PAGES = 100;
const BUILDER_PAGE_SIZE = 50;
const MAX_BUILDER_PAGES = 20;
const BEEHIIV_POST_PAGE_SIZE = 100;
const MAX_BEEHIIV_POST_PAGES = 5;
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
const GOOGLE_OAUTH_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ANALYTICS_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta/properties/";
const GOOGLE_VIEWS_PERIODS = Object.freeze(["7d", "30d", "90d", "12m", "ytd", "total"]);
const GOOGLE_SEARCH_PERIODS = Object.freeze(["7d", "30d", "90d", "12m", "ytd"]);
const GOOGLE_VIEW_QUALIFICATIONS = new Set(["sampled", "thresholding", "other-row"]);
const GOOGLE_ANALYTICS_PUBLICATION = Object.freeze({ id: "simple-aws", label: "Simple AWS" });
const GOOGLE_ANALYTICS_HOSTNAME = "newsletter.simpleaws.dev";
const GOOGLE_ANALYTICS_PATH_PATTERN = "/p/[^/]+/?";
const GOOGLE_SEARCH_SITE_URL = "sc-domain:simpleaws.dev";
const GOOGLE_SEARCH_ARTICLE_URL_PATTERN = String.raw`(?-i)^https://newsletter\.simpleaws\.dev/p/[^/?#]+/?$`;
const GOOGLE_SEARCH_TIME_ZONE = "America/Los_Angeles";
const SOURCE_LABELS = Object.freeze({
  caylent: "Caylent",
  "builder-center": "AWS Builder Center",
  "simple-aws": "Simple AWS"
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
    BEEHIIV_API_KEY_SECRET_ARN: env.BEEHIIV_API_KEY_SECRET_ARN,
    GOOGLE_OAUTH_PARAMETER_ARN: env.GOOGLE_OAUTH_PARAMETER_ARN
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

function isValidIanaTimeZone(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const resolvedTimeZone = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return !/^[+-]/.test(resolvedTimeZone);
  } catch {
    return false;
  }
}

function isRealIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateAnalyticsSelection(value) {
  const requiredKeys = ["id", "propertyId", "language", "hostname", "articlePathPattern", "timeZone"];
  const allowedKeys = value && Object.hasOwn(value, "recordedSince")
    ? [...requiredKeys, "recordedSince"]
    : requiredKeys;
  if (!exactKeys(value, allowedKeys) || value.id !== GOOGLE_ANALYTICS_PUBLICATION.id ||
      typeof value.propertyId !== "string" || !/^\d+$/.test(value.propertyId) ||
      value.language !== "en" || value.hostname !== GOOGLE_ANALYTICS_HOSTNAME ||
      value.articlePathPattern !== GOOGLE_ANALYTICS_PATH_PATTERN ||
      !isValidIanaTimeZone(value.timeZone)) {
    throw fail("ANALYTICS_CONFIGURATION_INVALID");
  }
  if (Object.hasOwn(value, "recordedSince") && !isRealIsoDate(value.recordedSince)) {
    throw fail("ANALYTICS_CONFIGURATION_INVALID");
  }
  return {
    id: GOOGLE_ANALYTICS_PUBLICATION.id,
    propertyId: value.propertyId,
    language: "en",
    hostname: GOOGLE_ANALYTICS_HOSTNAME,
    articlePathPattern: GOOGLE_ANALYTICS_PATH_PATTERN,
    timeZone: value.timeZone,
    ...(Object.hasOwn(value, "recordedSince") ? { recordedSince: value.recordedSince } : {})
  };
}

function validateSearchConsoleSelection(value) {
  if (!exactKeys(value, ["id", "siteUrl", "language", "articleUrlPattern", "availableSince"]) ||
      value.id !== GOOGLE_ANALYTICS_PUBLICATION.id ||
      value.siteUrl !== GOOGLE_SEARCH_SITE_URL ||
      value.language !== "en" ||
      value.articleUrlPattern !== GOOGLE_SEARCH_ARTICLE_URL_PATTERN ||
      !isRealIsoDate(value.availableSince)) {
    throw fail("SEARCH_CONSOLE_CONFIGURATION_INVALID");
  }
  return {
    id: GOOGLE_ANALYTICS_PUBLICATION.id,
    siteUrl: GOOGLE_SEARCH_SITE_URL,
    language: "en",
    articleUrlPattern: GOOGLE_SEARCH_ARTICLE_URL_PATTERN,
    availableSince: value.availableSince
  };
}

function validateInput(input) {
  if (!isObject(input)) throw fail("INPUT_SCHEMA_INVALID");
  if (![1, 2, 3, 4, 5, 6].includes(input.schemaVersion)) {
    throw fail("INPUT_VERSION_UNSUPPORTED");
  }
  if (input.definitionVersion !== 1) throw fail("INPUT_VERSION_UNSUPPORTED");

  if (input.schemaVersion === 1) {
    return { schemaVersion: 1, sources: [validateCaylentSource(input.source)] };
  }

  const simpleAwsAllowed = input.schemaVersion === 4 || input.schemaVersion === 5 || input.schemaVersion === 6;
  if (!Array.isArray(input.sources) ||
      (simpleAwsAllowed ? ![2, 3].includes(input.sources.length) : input.sources.length !== 2)) {
    throw fail("INPUT_SCHEMA_INVALID");
  }
  const sourcesById = new Map();
  for (const source of input.sources) {
    if (!isObject(source) || typeof source.id !== "string") throw fail("INPUT_SCHEMA_INVALID");
    if (sourcesById.has(source.id)) throw fail("SOURCE_SET_INVALID");
    if (source.id === "caylent") sourcesById.set(source.id, validateCaylentSource(source));
    else if (source.id === "builder-center") sourcesById.set(source.id, validateBuilderSource(source));
    else if (source.id === "simple-aws") {
      if (!simpleAwsAllowed || !exactKeys(source, ["id"])) throw fail("INPUT_SCHEMA_INVALID");
      sourcesById.set(source.id, { id: "simple-aws" });
    }
    else throw fail("SOURCE_UNSUPPORTED");
  }
  const hasSimpleAws = sourcesById.has("simple-aws");
  if (sourcesById.size !== 2 + Number(hasSimpleAws) || !sourcesById.has("caylent") || !sourcesById.has("builder-center")) {
    throw fail("SOURCE_SET_INVALID");
  }

  const configuredSources = (newsletterValue) => {
    const sources = [sourcesById.get("caylent"), sourcesById.get("builder-center")];
    if (!hasSimpleAws) return { sources, newsletter: newsletterValue };
    const newsletter = validateNewsletterSelection(newsletterValue);
    if (newsletter.language !== "en") throw fail("NEWSLETTER_CONFIGURATION_INVALID");
    sources.push({
      id: "simple-aws",
      publicationId: newsletter.publicationId,
      language: newsletter.language
    });
    return { sources, newsletter };
  };

  if (input.schemaVersion === 3 || input.schemaVersion === 4) {
    const expectedKeys = input.schemaVersion === 3
      ? ["schemaVersion", "definitionVersion", "sources", "curated"]
      : ["schemaVersion", "definitionVersion", "sources", "curated", "newsletter"];
    if (!exactKeys(input, expectedKeys) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"])) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    const { sources, newsletter } = configuredSources(input.newsletter);
    return {
      schemaVersion: input.schemaVersion,
      sources,
      curated: input.curated,
      ...(input.schemaVersion === 4 ? { newsletter } : {})
    };
  }

  if (input.schemaVersion === 5) {
    if (!exactKeys(input, ["schemaVersion", "definitionVersion", "sources", "curated", "newsletter", "analytics"]) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"])) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    const { sources, newsletter } = configuredSources(input.newsletter);
    return {
      schemaVersion: 5,
      sources,
      curated: input.curated,
      newsletter,
      analytics: validateAnalyticsSelection(input.analytics)
    };
  }

  if (input.schemaVersion === 6) {
    if (!exactKeys(input, ["schemaVersion", "definitionVersion", "sources", "curated", "newsletter", "analytics", "searchConsole"]) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"])) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    const { sources, newsletter } = configuredSources(input.newsletter);
    return {
      schemaVersion: 6,
      sources,
      curated: input.curated,
      newsletter,
      analytics: validateAnalyticsSelection(input.analytics),
      searchConsole: validateSearchConsoleSelection(input.searchConsole)
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
  const sourceSelectors = sources.map((source) => {
    if (source.id === "caylent") return { id: source.id, authorId: source.authorId, language: source.language };
    if (source.id === "simple-aws") {
      return { id: source.id, publicationId: source.publicationId, language: source.language };
    }
    return { id: source.id, authorId: source.authorId };
  })
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
        method: options.method ?? "GET",
        headers: options.headers ?? { accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      };
      if (Object.hasOwn(options, "body")) requestOptions.body = options.body;
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

function formatIsoDate(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10);
}

function addCalendarDays(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day + days);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(value, months) {
  const [year, month, day] = value.split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  const firstOfTargetMonth = new Date(0);
  firstOfTargetMonth.setUTCHours(0, 0, 0, 0);
  firstOfTargetMonth.setUTCFullYear(targetYear, targetMonth, 0);
  const targetDay = Math.min(day, firstOfTargetMonth.getUTCDate());
  return formatIsoDate(targetYear, targetMonth, targetDay);
}

function localDateAt(timeZone, timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${String(values.year).padStart(4, "0")}-${values.month}-${values.day}`;
}

function supportedGoogleViewRanges(analytics, now) {
  const collectionDate = localDateAt(analytics.timeZone, now);
  const endDate = addCalendarDays(collectionDate, -3);
  const twelveMonthAnchor = addCalendarDays(endDate, 1);
  const rangeByPeriod = {
    "7d": { startDate: addCalendarDays(endDate, -6), endDate },
    "30d": { startDate: addCalendarDays(endDate, -29), endDate },
    "90d": { startDate: addCalendarDays(endDate, -89), endDate },
    "12m": { startDate: addCalendarMonths(twelveMonthAnchor, -12), endDate }
  };
  const yearStart = `${collectionDate.slice(0, 4)}-01-01`;
  if (yearStart <= endDate) rangeByPeriod.ytd = { startDate: yearStart, endDate };
  if (analytics.recordedSince !== undefined && analytics.recordedSince <= endDate) {
    rangeByPeriod.total = { startDate: analytics.recordedSince, endDate };
  }

  return GOOGLE_VIEWS_PERIODS
    .filter((period) => Object.hasOwn(rangeByPeriod, period))
    .filter((period) => period === "total" || analytics.recordedSince === undefined ||
      rangeByPeriod[period].startDate >= analytics.recordedSince)
    .map((period) => ({ period, ...rangeByPeriod[period] }));
}

function supportedGoogleSearchRanges(searchConsole, now) {
  const collectionDate = localDateAt(GOOGLE_SEARCH_TIME_ZONE, now);
  const endDate = addCalendarDays(collectionDate, -3);
  const rangeByPeriod = {
    "7d": { startDate: addCalendarDays(endDate, -6), endDate },
    "30d": { startDate: addCalendarDays(endDate, -29), endDate },
    "90d": { startDate: addCalendarDays(endDate, -89), endDate },
    "12m": { startDate: addCalendarMonths(addCalendarDays(endDate, 1), -12), endDate }
  };
  const yearStart = `${collectionDate.slice(0, 4)}-01-01`;
  if (yearStart <= endDate) rangeByPeriod.ytd = { startDate: yearStart, endDate };

  return GOOGLE_SEARCH_PERIODS
    .filter((period) => Object.hasOwn(rangeByPeriod, period))
    .filter((period) => rangeByPeriod[period].startDate >= searchConsole.availableSince)
    .map((period) => ({ period, ...rangeByPeriod[period] }));
}

async function readGoogleOAuthCredentials(env) {
  const parameterArn = requireString(env.GOOGLE_OAUTH_PARAMETER_ARN, "ANALYTICS_CREDENTIAL_INVALID");
  let response;
  try {
    response = await ssm.send(new GetParameterCommand({ Name: parameterArn, WithDecryption: true }));
  } catch {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }

  const parameter = response && response.Parameter;
  if (!isObject(parameter) || typeof parameter.Name !== "string" || parameter.Name.trim() === "" ||
      (parameter.ARN !== undefined && parameter.ARN !== parameterArn) || parameter.Type !== "SecureString" ||
      typeof parameter.Value !== "string" || parameter.Value.trim() === "" ||
      Buffer.byteLength(parameter.Value, "utf8") > 4096) {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }

  let credentials;
  try {
    credentials = JSON.parse(parameter.Value);
  } catch {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }
  if (!exactKeys(credentials, ["clientId", "clientSecret", "refreshToken"])) {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }
  try {
    return {
      clientId: requireString(credentials.clientId, "ANALYTICS_CREDENTIAL_INVALID"),
      clientSecret: requireString(credentials.clientSecret, "ANALYTICS_CREDENTIAL_INVALID"),
      refreshToken: requireString(credentials.refreshToken, "ANALYTICS_CREDENTIAL_INVALID")
    };
  } catch {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }
}

async function refreshGoogleAccessToken(credentials) {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken
  });
  let response;
  try {
    response = await fetchJson(GOOGLE_OAUTH_ENDPOINT, "simple-aws", 1, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString(),
      redirect: "error"
    });
  } catch {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }
  if (!isObject(response) || typeof response.access_token !== "string" || response.access_token.trim() === "" ||
      typeof response.token_type !== "string" || response.token_type.toLowerCase() !== "bearer" ||
      !Number.isSafeInteger(response.expires_in) || response.expires_in <= 0) {
    throw fail("ANALYTICS_CREDENTIAL_INVALID");
  }
  return response.access_token.trim();
}

function articleViewsScopeFingerprint(analytics, period) {
  const scope = {
    definitionVersion: 1,
    family: "articleViews",
    metric: "screenPageViews",
    publication: {
      id: analytics.id,
      propertyId: analytics.propertyId,
      language: analytics.language,
      hostname: analytics.hostname,
      articlePathPattern: analytics.articlePathPattern
    },
    timeZone: analytics.timeZone,
    ...(period === "total" ? { recordedSince: analytics.recordedSince } : {})
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function articleSearchClicksScopeFingerprint(searchConsole) {
  const scope = {
    definitionVersion: 1,
    family: "articleSearchClicks",
    metric: "clicks",
    publication: {
      id: searchConsole.id,
      siteUrl: searchConsole.siteUrl,
      language: searchConsole.language,
      articleUrlPattern: searchConsole.articleUrlPattern
    },
    searchType: "web",
    timeZone: GOOGLE_SEARCH_TIME_ZONE
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function validateGoogleReport(response, analytics) {
  if (!isObject(response) || !Array.isArray(response.metricHeaders) || response.metricHeaders.length !== 1 ||
      !exactKeys(response.metricHeaders[0], ["name", "type"]) ||
      response.metricHeaders[0].name !== "screenPageViews" || response.metricHeaders[0].type !== "TYPE_INTEGER" ||
      (response.dimensionHeaders !== undefined &&
        (!Array.isArray(response.dimensionHeaders) || response.dimensionHeaders.length !== 0)) ||
      response.rowCount !== 1 || !Array.isArray(response.rows) || response.rows.length !== 1 ||
      !exactKeys(response.rows[0], ["metricValues"]) || !Array.isArray(response.rows[0].metricValues) ||
      response.rows[0].metricValues.length !== 1 || !exactKeys(response.rows[0].metricValues[0], ["value"]) ||
      typeof response.rows[0].metricValues[0].value !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(response.rows[0].metricValues[0].value)) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }

  const views = Number(response.rows[0].metricValues[0].value);
  if (!Number.isSafeInteger(views) || views < 0) throw fail("ANALYTICS_REPORT_INVALID");

  const metadata = response.metadata;
  if (!isObject(metadata) || metadata.timeZone !== analytics.timeZone) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "subjectToThresholding") && typeof metadata.subjectToThresholding !== "boolean") {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "dataLossFromOtherRow") && typeof metadata.dataLossFromOtherRow !== "boolean") {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "samplingMetadatas") &&
      (!Array.isArray(metadata.samplingMetadatas) || metadata.samplingMetadatas.some((item) => !isObject(item)))) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "dataTruncationReasons") &&
      (!Array.isArray(metadata.dataTruncationReasons) || metadata.dataTruncationReasons.some((reason) => typeof reason !== "string"))) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "dataTruncationDateRanges") &&
      (!Array.isArray(metadata.dataTruncationDateRanges) || metadata.dataTruncationDateRanges.some((range) =>
        !exactKeys(range, ["startDate", "endDate"]) || !isRealIsoDate(range.startDate) || !isRealIsoDate(range.endDate) ||
        range.startDate > range.endDate))) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "dataTruncationDate") && !isRealIsoDate(metadata.dataTruncationDate)) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if (Object.hasOwn(metadata, "emptyReason") && typeof metadata.emptyReason !== "string") {
    throw fail("ANALYTICS_REPORT_INVALID");
  }
  if ((metadata.dataTruncationReasons?.length ?? 0) > 0 ||
      (metadata.dataTruncationDateRanges?.length ?? 0) > 0 ||
      Object.hasOwn(metadata, "dataTruncationDate") ||
      (metadata.emptyReason !== undefined && metadata.emptyReason !== "")) {
    throw fail("ANALYTICS_REPORT_UNAVAILABLE");
  }

  const qualifications = [];
  if ((metadata.samplingMetadatas?.length ?? 0) > 0) qualifications.push("sampled");
  if (metadata.subjectToThresholding === true) qualifications.push("thresholding");
  if (metadata.dataLossFromOtherRow === true) qualifications.push("other-row");
  return { views, qualifications };
}

async function requestGoogleReport(analytics, accessToken, range, collectedAt) {
  const url = `${GOOGLE_ANALYTICS_ENDPOINT}${analytics.propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: analytics.hostname, caseSensitive: true } } },
          { filter: { fieldName: "pagePath", stringFilter: { matchType: "FULL_REGEXP", value: analytics.articlePathPattern, caseSensitive: true } } }
        ]
      }
    }
  };
  const response = await fetchJson(url, "simple-aws", range.period, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    redirect: "error"
  });
  const result = validateGoogleReport(response, analytics);
  return {
    basis: range.period === "total" ? "recorded-total" : "period",
    collectedAt,
    scopeId: articleViewsScopeFingerprint(analytics, range.period),
    publication: { ...GOOGLE_ANALYTICS_PUBLICATION, language: analytics.language },
    timeZone: analytics.timeZone,
    startDate: range.startDate,
    endDate: range.endDate,
    views: result.views,
    qualifications: result.qualifications
  };
}

async function collectArticleViews(analytics, accessToken, collectedAt, now) {
  const ranges = supportedGoogleViewRanges(analytics, now);
  const eligiblePeriods = ranges.map(({ period }) => period);
  if (ranges.length === 0) return { group: null, failedPeriods: [], eligiblePeriods };
  const records = {};
  const failedPeriods = [];
  let failureCode;
  for (const range of ranges) {
    try {
      records[range.period] = await requestGoogleReport(analytics, accessToken, range, collectedAt);
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failedPeriods.push(range.period);
      failureCode ??= error.code;
    }
  }

  return {
    group: Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null,
    failedPeriods,
    eligiblePeriods,
    ...(failureCode ? { failureCode } : {})
  };
}

function validateSearchConsoleResponse(response) {
  if (!isObject(response) || response.responseAggregationType !== "byPage" ||
      !Array.isArray(response.rows) || response.rows.length !== 1 || !isObject(response.rows[0])) {
    throw fail("SEARCH_CONSOLE_REPORT_INVALID");
  }
  const row = response.rows[0];
  if (Object.hasOwn(row, "keys") && (!Array.isArray(row.keys) || row.keys.length !== 0) ||
      !Object.hasOwn(row, "clicks") || !Number.isSafeInteger(row.clicks) || row.clicks < 0) {
    throw fail("SEARCH_CONSOLE_REPORT_INVALID");
  }
  const metadata = response.metadata;
  if (metadata !== undefined && !isObject(metadata)) throw fail("SEARCH_CONSOLE_REPORT_INVALID");
  if (metadata && (Object.hasOwn(metadata, "first_incomplete_date") ||
      Object.hasOwn(metadata, "first_incomplete_hour"))) {
    throw fail("SEARCH_CONSOLE_REPORT_UNAVAILABLE");
  }
  return { clicks: row.clicks };
}

async function requestGoogleSearchReport(searchConsole, accessToken, range, collectedAt) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(searchConsole.siteUrl)}/searchAnalytics/query`;
  const body = {
    startDate: range.startDate,
    endDate: range.endDate,
    type: "web",
    dataState: "final",
    aggregationType: "auto",
    dimensionFilterGroups: [{
      groupType: "and",
      filters: [{
        dimension: "page",
        operator: "includingRegex",
        expression: searchConsole.articleUrlPattern
      }]
    }]
  };
  const response = await fetchJson(url, "simple-aws-search", range.period, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    redirect: "error"
  });
  const result = validateSearchConsoleResponse(response);
  return {
    basis: "period",
    collectedAt,
    scopeId: articleSearchClicksScopeFingerprint(searchConsole),
    publication: { ...GOOGLE_ANALYTICS_PUBLICATION, language: searchConsole.language },
    timeZone: GOOGLE_SEARCH_TIME_ZONE,
    startDate: range.startDate,
    endDate: range.endDate,
    clicks: result.clicks
  };
}

async function collectArticleSearchClicks(searchConsole, accessToken, collectedAt, now) {
  const ranges = supportedGoogleSearchRanges(searchConsole, now);
  const eligiblePeriods = ranges.map(({ period }) => period);
  if (ranges.length === 0) return { group: null, failedPeriods: [], eligiblePeriods };

  const records = {};
  const failedPeriods = [];
  let failureCode;
  for (const range of ranges) {
    try {
      records[range.period] = await requestGoogleSearchReport(searchConsole, accessToken, range, collectedAt);
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failedPeriods.push(range.period);
      failureCode ??= error.code;
    }
  }

  return {
    group: Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null,
    failedPeriods,
    eligiblePeriods,
    ...(failureCode ? { failureCode } : {})
  };
}

async function collectGoogleMetrics(configuration, env, collectedAt, now) {
  const viewsRanges = supportedGoogleViewRanges(configuration.analytics, now);
  const viewsEligiblePeriods = viewsRanges.map(({ period }) => period);
  const searchRanges = configuration.schemaVersion === 6
    ? supportedGoogleSearchRanges(configuration.searchConsole, now)
    : [];
  const searchEligiblePeriods = searchRanges.map(({ period }) => period);
  const emptyViews = { group: null, failedPeriods: [], eligiblePeriods: viewsEligiblePeriods };
  const emptySearch = { group: null, failedPeriods: [], eligiblePeriods: searchEligiblePeriods };
  if (viewsEligiblePeriods.length === 0 && searchEligiblePeriods.length === 0) {
    return { articleViews: emptyViews, articleSearchClicks: emptySearch };
  }

  let accessToken;
  try {
    const credentials = await readGoogleOAuthCredentials(env);
    accessToken = await refreshGoogleAccessToken(credentials);
  } catch (error) {
    if (!(error instanceof CollectorError)) throw error;
    const failure = error.code;
    return {
      articleViews: viewsEligiblePeriods.length > 0
        ? { ...emptyViews, failedPeriods: viewsEligiblePeriods, failureCode: failure }
        : emptyViews,
      articleSearchClicks: searchEligiblePeriods.length > 0
        ? { ...emptySearch, failedPeriods: searchEligiblePeriods, failureCode: failure }
        : emptySearch
    };
  }

  const articleViews = viewsEligiblePeriods.length > 0
    ? await collectArticleViews(configuration.analytics, accessToken, collectedAt, now)
    : emptyViews;
  const articleSearchClicks = searchEligiblePeriods.length > 0
    ? await collectArticleSearchClicks(configuration.searchConsole, accessToken, collectedAt, now)
    : emptySearch;
  return { articleViews, articleSearchClicks };
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

async function fetchBeehiivPostsPage(source, apiKey, page) {
  const url = new URL(`${BEEHIIV_API_ENDPOINT}${encodeURIComponent(source.publicationId)}/posts`);
  url.searchParams.set("status", "confirmed");
  url.searchParams.set("platform", "all");
  url.searchParams.set("hidden_from_feed", "all");
  url.searchParams.set("limit", String(BEEHIIV_POST_PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("order_by", "publish_date");
  url.searchParams.set("direction", "asc");
  return fetchJson(url.toString(), source.id, page, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    redirect: "error"
  });
}

function validateBeehiivPostsPage(envelope, requestedPage) {
  if (!isObject(envelope) || !Array.isArray(envelope.data) ||
      !Number.isSafeInteger(envelope.limit) || envelope.limit !== BEEHIIV_POST_PAGE_SIZE ||
      !Number.isSafeInteger(envelope.page) || envelope.page !== requestedPage ||
      !Number.isSafeInteger(envelope.total_results) || envelope.total_results < 0 ||
      !Number.isSafeInteger(envelope.total_pages) || envelope.total_pages < 0) {
    throw fail("BEEHIIV_PAGINATION_INVALID");
  }

  const expectedPages = envelope.total_results === 0
    ? 0
    : Math.ceil(envelope.total_results / BEEHIIV_POST_PAGE_SIZE);
  if (envelope.total_pages !== expectedPages) throw fail("BEEHIIV_PAGINATION_INVALID");

  const expectedRows = envelope.total_results === 0
    ? 0
    : Math.min(BEEHIIV_POST_PAGE_SIZE, envelope.total_results - (requestedPage - 1) * BEEHIIV_POST_PAGE_SIZE);
  if (expectedRows < 0 || envelope.data.length !== expectedRows) throw fail("BEEHIIV_PAGINATION_INVALID");
  return {
    totalResults: envelope.total_results,
    totalPages: envelope.total_pages
  };
}

function eligibleBeehiivPublication(record, source, now) {
  if (!isObject(record)) throw fail("BEEHIIV_POST_INVALID");

  const providerId = requireString(record.id, "BEEHIIV_POST_INVALID");
  const title = normalizedTitle(record.title);
  const status = record.status;
  if (typeof status !== "string" || !["confirmed", "draft", "archived"].includes(status)) {
    throw fail("BEEHIIV_POST_INVALID");
  }
  if (!["web", "email", "both"].includes(record.platform)) throw fail("BEEHIIV_POST_INVALID");
  if (!Number.isSafeInteger(record.publish_date)) throw fail("BEEHIIV_POST_INVALID");

  const publishedAt = record.publish_date * 1000;
  if (!Number.isFinite(new Date(publishedAt).getTime())) throw fail("BEEHIIV_POST_INVALID");
  if (status !== "confirmed" || publishedAt > now) return null;

  return {
    sourceId: source.id,
    providerId,
    title,
    language: source.language
  };
}

async function collectSimpleAws(source, now, env) {
  const apiKey = await readBeehiivApiKey(env);
  const publications = [];
  const providerIds = new Set();
  let totalResults = null;
  let totalPages = null;
  let collectedRows = 0;

  let page = 1;
  while (true) {
    const envelope = await fetchBeehiivPostsPage(source, apiKey, page);
    const pagination = validateBeehiivPostsPage(envelope, page);

    if (totalResults === null) {
      totalResults = pagination.totalResults;
      totalPages = pagination.totalPages;
      if (totalPages > MAX_BEEHIIV_POST_PAGES) throw fail("BEEHIIV_PAGE_CAP_REACHED");
    } else if (pagination.totalResults !== totalResults || pagination.totalPages !== totalPages) {
      throw fail("BEEHIIV_PAGINATION_INVALID");
    }

    for (const record of envelope.data) {
      if (!isObject(record)) throw fail("BEEHIIV_POST_INVALID");
      const providerId = requireString(record.id, "BEEHIIV_POST_INVALID");
      if (providerIds.has(providerId)) throw fail("BEEHIIV_POST_ID_REPEATED");
      providerIds.add(providerId);
      collectedRows += 1;
      const publication = eligibleBeehiivPublication(record, source, now);
      if (publication) publications.push(publication);
    }

    if (totalPages === 0 || page === totalPages) break;
    page += 1;
  }

  if (totalResults === null || collectedRows !== totalResults || providerIds.size !== totalResults) {
    throw fail("BEEHIIV_PAGINATION_INVALID");
  }
  return { publications, pages: totalPages === 0 ? 1 : totalPages };
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

async function collectPublications(sources, now, env) {
  const publications = [];
  const pagesBySource = {};
  for (const source of sources) {
    let result;
    if (source.id === "caylent") result = await collectCaylent(source, now);
    else if (source.id === "builder-center") result = await collectBuilderCenter(source, now);
    else if (source.id === "simple-aws") result = await collectSimpleAws(source, now, env);
    else throw fail("SOURCE_UNSUPPORTED");
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
      : sources.length === 2
        ? [["caylent", "Caylent"], ["builder-center", "AWS Builder Center"]]
        : sources.length === 3
          ? [["caylent", "Caylent"], ["builder-center", "AWS Builder Center"], ["simple-aws", "Simple AWS"]]
          : null;
    return expected !== null && sources.every((source, index) =>
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

function isValidArticleViewRecord(record, period) {
  if (!exactKeys(record, ["basis", "collectedAt", "scopeId", "publication", "timeZone", "startDate", "endDate", "views", "qualifications"])) {
    return false;
  }
  if (record.basis !== (period === "total" ? "recorded-total" : "period")) return false;
  if (typeof record.collectedAt !== "string") return false;
  const collected = Date.parse(record.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== record.collectedAt) return false;
  if (typeof record.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(record.scopeId)) return false;
  if (!exactKeys(record.publication, ["id", "label", "language"]) ||
      record.publication.id !== GOOGLE_ANALYTICS_PUBLICATION.id ||
      record.publication.label !== GOOGLE_ANALYTICS_PUBLICATION.label || record.publication.language !== "en") {
    return false;
  }
  if (!isValidIanaTimeZone(record.timeZone) || !isRealIsoDate(record.startDate) || !isRealIsoDate(record.endDate) ||
      record.startDate > record.endDate) {
    return false;
  }
  if (!Number.isSafeInteger(record.views) || record.views < 0 || !Array.isArray(record.qualifications)) return false;
  const qualifications = new Set();
  for (const qualification of record.qualifications) {
    if (typeof qualification !== "string" || !GOOGLE_VIEW_QUALIFICATIONS.has(qualification) || qualifications.has(qualification)) {
      return false;
    }
    qualifications.add(qualification);
  }
  return true;
}

function sanitizeArticleViewsGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 || !isObject(group.records)) {
    return null;
  }
  const records = {};
  for (const period of GOOGLE_VIEWS_PERIODS) {
    if (Object.hasOwn(group.records, period) && isValidArticleViewRecord(group.records[period], period)) {
      records[period] = group.records[period];
    }
  }
  return Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null;
}

function isValidArticleViewsGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 ||
      !isObject(group.records) || Object.keys(group.records).length === 0) {
    return false;
  }
  return Object.entries(group.records).every(([period, record]) =>
    GOOGLE_VIEWS_PERIODS.includes(period) && isValidArticleViewRecord(record, period));
}

function isValidArticleSearchRecord(record, period) {
  if (!exactKeys(record, ["basis", "collectedAt", "scopeId", "publication", "timeZone", "startDate", "endDate", "clicks"])) {
    return false;
  }
  if (period === "total" || record.basis !== "period") return false;
  if (typeof record.collectedAt !== "string") return false;
  const collected = Date.parse(record.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== record.collectedAt) return false;
  if (typeof record.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(record.scopeId)) return false;
  if (!exactKeys(record.publication, ["id", "label", "language"]) ||
      record.publication.id !== GOOGLE_ANALYTICS_PUBLICATION.id ||
      record.publication.label !== GOOGLE_ANALYTICS_PUBLICATION.label ||
      record.publication.language !== "en") {
    return false;
  }
  if (record.timeZone !== GOOGLE_SEARCH_TIME_ZONE || !isRealIsoDate(record.startDate) ||
      !isRealIsoDate(record.endDate) || record.startDate > record.endDate) {
    return false;
  }
  return Number.isSafeInteger(record.clicks) && record.clicks >= 0;
}

function sanitizeArticleSearchClicksGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 || !isObject(group.records)) {
    return null;
  }
  const records = {};
  for (const period of GOOGLE_SEARCH_PERIODS) {
    if (Object.hasOwn(group.records, period) && isValidArticleSearchRecord(group.records[period], period)) {
      records[period] = group.records[period];
    }
  }
  return Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null;
}

function isValidArticleSearchClicksGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 ||
      !isObject(group.records) || Object.keys(group.records).length === 0) {
    return false;
  }
  return Object.entries(group.records).every(([period, record]) =>
    GOOGLE_SEARCH_PERIODS.includes(period) && isValidArticleSearchRecord(record, period));
}

function validateOutput(output) {
  if (!exactKeys(output, ["schemaVersion", "groups"]) || output.schemaVersion !== 1 ||
      !isObject(output.groups)) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const families = Object.keys(output.groups);
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter", "articleViews", "articleSearchClicks"]);
  if (families.length < 1 || families.some((family) => !supportedFamilies.has(family))) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  for (const family of families) {
    const valid = family === "newsletter"
      ? isValidNewsletterGroup(output.groups[family])
      : family === "articleViews"
        ? isValidArticleViewsGroup(output.groups[family])
        : family === "articleSearchClicks"
          ? isValidArticleSearchClicksGroup(output.groups[family])
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
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter", "articleViews", "articleSearchClicks"]);
  if (Object.keys(previous.groups).some((family) => !supportedFamilies.has(family))) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  const groups = {};
  for (const family of supportedFamilies) {
    if (!Object.hasOwn(previous.groups, family)) continue;
    if (family === "articleViews") {
      const sanitized = sanitizeArticleViewsGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "articleSearchClicks") {
      const sanitized = sanitizeArticleSearchClicksGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    const valid = family === "newsletter"
      ? isValidNewsletterGroup(previous.groups[family])
      : isValidGroup(previous.groups[family], family);
    if (valid) groups[family] = previous.groups[family];
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
  const collection = await collectPublications(configuration.sources, now, env);
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
  let articleViewsResult;
  let articleSearchClicksResult;
  try {
    articleCollection = await collectPublications(configuration.sources, now, env);
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

  if (configuration.schemaVersion === 4 || configuration.schemaVersion === 5 || configuration.schemaVersion === 6) {
    try {
      groups.newsletter = await collectNewsletter(configuration.newsletter, env, collectedAt);
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failures.newsletter = error.code;
    }
  }

  if (configuration.schemaVersion === 5 || configuration.schemaVersion === 6) {
    try {
      const googleMetrics = await collectGoogleMetrics(configuration, env, collectedAt, now);
      articleViewsResult = googleMetrics.articleViews;
      articleSearchClicksResult = googleMetrics.articleSearchClicks;
      if (articleViewsResult.group) groups.articleViews = articleViewsResult.group;
      if (articleViewsResult.failedPeriods.length > 0) {
        failures.articleViews = articleViewsResult.failureCode ?? "ANALYTICS_REPORT_FAILED";
      }
      if (articleSearchClicksResult.group) groups.articleSearchClicks = articleSearchClicksResult.group;
      if (articleSearchClicksResult.failedPeriods.length > 0) {
        failures.articleSearchClicks = articleSearchClicksResult.failureCode ?? "SEARCH_CONSOLE_REPORT_FAILED";
      }
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      articleViewsResult = {
        group: null,
        failedPeriods: [],
        eligiblePeriods: supportedGoogleViewRanges(configuration.analytics, now).map(({ period }) => period)
      };
      articleViewsResult.failedPeriods = articleViewsResult.eligiblePeriods;
      failures.articleViews = error.code;
      if (configuration.schemaVersion === 6) {
        articleSearchClicksResult = {
          group: null,
          failedPeriods: [],
          eligiblePeriods: supportedGoogleSearchRanges(configuration.searchConsole, now).map(({ period }) => period)
        };
        articleSearchClicksResult.failedPeriods = articleSearchClicksResult.eligiblePeriods;
        if (articleSearchClicksResult.failedPeriods.length > 0) failures.articleSearchClicks = error.code;
      }
    }
  }

  const freshFamilies = Object.keys(groups);
  if (freshFamilies.length === 0) throw fail("NO_SUCCESSFUL_GROUPS");

  let previousGroups = null;
  if (Object.keys(failures).length > 0) {
    previousGroups = await readPreviousAggregate(env.bucket, env.outputKey);
    if (previousGroups) {
      for (const family of Object.keys(failures)) {
        if (family === "articleViews" || family === "articleSearchClicks") {
          const result = family === "articleViews" ? articleViewsResult : articleSearchClicksResult;
          const prior = previousGroups[family];
          const eligiblePeriods = new Set(result?.eligiblePeriods ?? []);
          const timeZone = family === "articleViews" ? configuration.analytics.timeZone : GOOGLE_SEARCH_TIME_ZONE;
          const currentYtdStart = `${localDateAt(timeZone, now).slice(0, 4)}-01-01`;
          const records = { ...(groups[family]?.records ?? {}) };
          for (const period of result?.failedPeriods ?? []) {
            if (!eligiblePeriods.has(period) || !prior || !Object.hasOwn(prior.records, period)) continue;
            if (period === "ytd" && prior.records[period].startDate !== currentYtdStart) continue;
            if (family === "articleSearchClicks" && prior.records[period].startDate < configuration.searchConsole.availableSince) continue;
            records[period] = prior.records[period];
          }
          if (Object.keys(records).length > 0) groups[family] = { definitionVersion: 1, records };
        } else if (previousGroups[family]) {
          groups[family] = previousGroups[family];
        }
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
      ...(group.counts ? { counts: group.counts } : {}),
      ...(Object.hasOwn(group, "subscribers") ? { subscribers: group.subscribers } : {}),
      ...(group.records ? { periods: Object.keys(group.records) } : {
        collectedAt: group.collectedAt,
        scopeId: group.scopeId
      }),
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
    return configuration.schemaVersion === 3 || configuration.schemaVersion === 4 || configuration.schemaVersion === 5 || configuration.schemaVersion === 6
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
