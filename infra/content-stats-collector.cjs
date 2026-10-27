const { createHash } = require("node:crypto");
const { GetObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { GetSecretValueCommand, SecretsManagerClient } = require("@aws-sdk/client-secrets-manager");
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");

const s3 = new S3Client({});
const secretsManager = new SecretsManagerClient({});
const ssm = new SSMClient({});
const CONTENT_API_ENDPOINT = "https://cdn.builder.io/api/v3/content/blog-post";
const BUILDER_API_ENDPOINT = "https://api.builder.aws.com/cs/v2/articles/user/";
const CLOUDY_ARCHIVE_ORIGIN = "https://blog.guilleojeda.com";
const CLOUDY_ARCHIVE_PATH = "/archive";
const DONDE_APRENDO_INDEX_URL = "https://dondeaprendoaws.com/article-index.json";
const DONDE_APRENDO_ORIGIN = "https://dondeaprendoaws.com";
const DONDE_APRENDO_AUTHOR = Object.freeze({ name: "Guille Ojeda", url: "https://guilleojeda.com/es/" });
const PAGE_SIZE = 10;
const MAX_CAYLENT_PAGES = 100;
const BUILDER_PAGE_SIZE = 50;
const MAX_BUILDER_PAGES = 20;
const BEEHIIV_POST_PAGE_SIZE = 100;
const MAX_BEEHIIV_POST_PAGES = 5;
const MAX_CLOUDY_PAGES = 10;
const MAX_DECODED_SOURCE_BODY_BYTES = 1024 * 1024;
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
const DIRECTORY_VIEWS_PERIODS = Object.freeze(["7d", "30d", "90d", "12m", "ytd", "total"]);
const GOOGLE_SEARCH_PERIODS = Object.freeze(["7d", "30d", "90d", "12m", "ytd"]);
const NEWSLETTER_ENGAGEMENT_PERIODS = Object.freeze(["7d", "30d", "90d", "12m", "ytd"]);
const GOOGLE_VIEW_QUALIFICATIONS = new Set(["sampled", "thresholding", "other-row"]);
const GOOGLE_ANALYTICS_PUBLICATION = Object.freeze({ id: "simple-aws", label: "Simple AWS" });
const GOOGLE_ANALYTICS_HOSTNAME = "newsletter.simpleaws.dev";
const GOOGLE_ANALYTICS_PATH_PATTERN = "/p/[^/]+/?";
const GOOGLE_SEARCH_SITE_URL = "sc-domain:simpleaws.dev";
const GOOGLE_SEARCH_ARTICLE_URL_PATTERN = String.raw`(?-i)^https://newsletter\.simpleaws\.dev/p/[^/?#]+/?$`;
const GOOGLE_SEARCH_TIME_ZONE = "America/Los_Angeles";
const DIRECTORY_ANALYTICS_PUBLICATION = Object.freeze({ id: "donde-aprendo-aws", label: "Dónde Aprendo AWS" });
const DIRECTORY_ANALYTICS_HOSTNAME = "dondeaprendoaws.com";
const AWS_FOR_ENGINEERS_ORIGIN = "https://awsforengineers.com";
const AWS_FOR_ENGINEERS_INDEX_URL = `${AWS_FOR_ENGINEERS_ORIGIN}/article-index.json`;
const AWS_FOR_ENGINEERS_AUTHOR = Object.freeze({
  name: "Guille Ojeda",
  url: `${AWS_FOR_ENGINEERS_ORIGIN}/authors/guille-ojeda/`
});
const BUILDER_VIEWS_START_DATE = "2026-01-06";
const SOURCE_LABELS = Object.freeze({
  caylent: "Caylent",
  "builder-center": "AWS Builder Center",
  "simple-aws": "Simple AWS",
  "cloudy-things": "Cloudy Things",
  "donde-aprendo-aws": "Dónde Aprendo AWS",
  "aws-for-engineers": "AWS for Engineers"
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

function validateCloudySource(source) {
  if (!isObject(source)) throw fail("INPUT_SCHEMA_INVALID");
  if (source.id !== "cloudy-things") throw fail("SOURCE_UNSUPPORTED");
  if (!exactKeys(source, ["id", "authorName", "language"])) throw fail("INPUT_SCHEMA_INVALID");
  const authorName = requireString(source.authorName, "INPUT_SCHEMA_INVALID");
  if (source.language !== "en") throw fail("LANGUAGE_UNSUPPORTED");
  return { id: "cloudy-things", authorName, language: "en" };
}

function validateDondeAprendoAwsSource(source) {
  if (!exactKeys(source, ["id"]) || source.id !== "donde-aprendo-aws") throw fail("INPUT_SCHEMA_INVALID");
  return { id: "donde-aprendo-aws" };
}

function validateAwsForEngineersSource(source) {
  if (!exactKeys(source, ["id"]) || source.id !== "aws-for-engineers") throw fail("INPUT_SCHEMA_INVALID");
  return { id: "aws-for-engineers" };
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

function validateDirectoryAnalyticsSelection(value, outboundClicksEnabled = false, recordedSinceEnabled = false) {
  const expectedKeys = ["id", "propertyId", "hostname", "language", "timeZone"];
  if (outboundClicksEnabled) expectedKeys.push("outboundClicks");
  if (recordedSinceEnabled) expectedKeys.push("recordedSince");
  if (!exactKeys(value, expectedKeys) ||
      value.id !== DIRECTORY_ANALYTICS_PUBLICATION.id ||
      typeof value.propertyId !== "string" || !/^\d+$/.test(value.propertyId) ||
      value.hostname !== DIRECTORY_ANALYTICS_HOSTNAME || value.language !== "es" ||
      !isValidIanaTimeZone(value.timeZone) ||
      (outboundClicksEnabled && value.outboundClicks !== true) ||
      (recordedSinceEnabled && !isRealIsoDate(value.recordedSince))) {
    throw fail("DIRECTORY_ANALYTICS_CONFIGURATION_INVALID");
  }
  return {
    id: DIRECTORY_ANALYTICS_PUBLICATION.id,
    propertyId: value.propertyId,
    hostname: DIRECTORY_ANALYTICS_HOSTNAME,
    language: "es",
    timeZone: value.timeZone,
    ...(recordedSinceEnabled ? { recordedSince: value.recordedSince } : {})
  };
}

function validateInput(input) {
  if (!isObject(input)) throw fail("INPUT_SCHEMA_INVALID");
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(input.schemaVersion)) {
    throw fail("INPUT_VERSION_UNSUPPORTED");
  }
  if (input.definitionVersion !== 1) throw fail("INPUT_VERSION_UNSUPPORTED");
  if (input.schemaVersion !== 10 && Object.hasOwn(input, "newsletterEngagements")) {
    throw fail("INPUT_SCHEMA_INVALID");
  }

  if (input.schemaVersion === 1) {
    return { schemaVersion: 1, sources: [validateCaylentSource(input.source)] };
  }

  const simpleAwsAllowed = input.schemaVersion === 4 || input.schemaVersion === 5 || input.schemaVersion === 6 ||
    input.schemaVersion === 7 || input.schemaVersion === 8 || input.schemaVersion === 9 || input.schemaVersion === 10;
  if (!Array.isArray(input.sources)) {
    throw fail("INPUT_SCHEMA_INVALID");
  }
  const sourcesById = new Map();
  for (const source of input.sources) {
    if (!isObject(source) || typeof source.id !== "string") throw fail("INPUT_SCHEMA_INVALID");
    if (sourcesById.has(source.id)) throw fail("SOURCE_SET_INVALID");
    if (source.id === "caylent") sourcesById.set(source.id, validateCaylentSource(source));
    else if (source.id === "builder-center") sourcesById.set(source.id, validateBuilderSource(source));
    else if (source.id === "cloudy-things") sourcesById.set(source.id, validateCloudySource(source));
    else if (source.id === "donde-aprendo-aws") sourcesById.set(source.id, validateDondeAprendoAwsSource(source));
    else if (source.id === "aws-for-engineers") sourcesById.set(source.id, validateAwsForEngineersSource(source));
    else if (source.id === "simple-aws") {
      if (!simpleAwsAllowed || !exactKeys(source, ["id"])) throw fail("INPUT_SCHEMA_INVALID");
      sourcesById.set(source.id, { id: "simple-aws" });
    }
    else throw fail("SOURCE_UNSUPPORTED");
  }
  const hasSimpleAws = sourcesById.has("simple-aws");
  const hasCloudyThings = sourcesById.has("cloudy-things");
  const hasDondeAprendoAws = sourcesById.has("donde-aprendo-aws");
  const hasAwsForEngineers = sourcesById.has("aws-for-engineers");
  if (!sourcesById.has("caylent") || !sourcesById.has("builder-center")) {
    throw fail("SOURCE_SET_INVALID");
  }

  const configuredSources = (newsletterValue) => {
    const sources = [sourcesById.get("caylent"), sourcesById.get("builder-center")];
    if (!hasSimpleAws) {
      if (hasCloudyThings) sources.push(sourcesById.get("cloudy-things"));
      if (hasDondeAprendoAws) sources.push(sourcesById.get("donde-aprendo-aws"));
      if (hasAwsForEngineers) sources.push(sourcesById.get("aws-for-engineers"));
      return { sources, newsletter: newsletterValue };
    }
    const newsletter = validateNewsletterSelection(newsletterValue);
    if (newsletter.language !== "en") throw fail("NEWSLETTER_CONFIGURATION_INVALID");
    sources.push({
      id: "simple-aws",
      publicationId: newsletter.publicationId,
      language: newsletter.language
    });
    if (hasCloudyThings) sources.push(sourcesById.get("cloudy-things"));
    if (hasDondeAprendoAws) sources.push(sourcesById.get("donde-aprendo-aws"));
    if (hasAwsForEngineers) sources.push(sourcesById.get("aws-for-engineers"));
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

  if (input.schemaVersion === 7 || input.schemaVersion === 8 || input.schemaVersion === 9) {
    const outboundClicksEnabled = input.schemaVersion === 8 ||
      input.schemaVersion === 9 && isObject(input.directoryAnalytics) && Object.hasOwn(input.directoryAnalytics, "outboundClicks");
    const recordedSinceEnabled = input.schemaVersion === 9;
    const hasNewsletter = Object.hasOwn(input, "newsletter");
    const hasAnalytics = Object.hasOwn(input, "analytics");
    const hasSearchConsole = Object.hasOwn(input, "searchConsole");
    const expectedKeys = ["schemaVersion", "definitionVersion", "sources", "curated", "directoryAnalytics"];
    if (hasNewsletter) expectedKeys.push("newsletter");
    if (hasAnalytics) expectedKeys.push("analytics");
    if (hasSearchConsole) expectedKeys.push("searchConsole");
    if (!exactKeys(input, expectedKeys) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"]) ||
        !hasNewsletter && (hasAnalytics || hasSearchConsole) ||
        hasSearchConsole && !hasAnalytics) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    const { sources, newsletter } = configuredSources(input.newsletter);
    return {
      schemaVersion: input.schemaVersion,
      sources,
      curated: input.curated,
      ...(hasNewsletter ? { newsletter } : {}),
      ...(hasAnalytics ? { analytics: validateAnalyticsSelection(input.analytics) } : {}),
      ...(hasSearchConsole ? { searchConsole: validateSearchConsoleSelection(input.searchConsole) } : {}),
      directoryAnalytics: validateDirectoryAnalyticsSelection(input.directoryAnalytics, outboundClicksEnabled, recordedSinceEnabled),
      ...(outboundClicksEnabled ? { directoryOutboundClicks: true } : {})
    };
  }

  if (input.schemaVersion === 10) {
    const hasNewsletter = Object.hasOwn(input, "newsletter");
    const hasAnalytics = Object.hasOwn(input, "analytics");
    const hasSearchConsole = Object.hasOwn(input, "searchConsole");
    const hasDirectoryAnalytics = Object.hasOwn(input, "directoryAnalytics");
    const outboundClicksEnabled = hasDirectoryAnalytics && isObject(input.directoryAnalytics) &&
      Object.hasOwn(input.directoryAnalytics, "outboundClicks");
    const recordedSinceEnabled = hasDirectoryAnalytics && isObject(input.directoryAnalytics) &&
      Object.hasOwn(input.directoryAnalytics, "recordedSince");
    const expectedKeys = ["schemaVersion", "definitionVersion", "sources", "curated", "newsletter",
      "newsletterEngagements"];
    if (hasAnalytics) expectedKeys.push("analytics");
    if (hasSearchConsole) expectedKeys.push("searchConsole");
    if (hasDirectoryAnalytics) expectedKeys.push("directoryAnalytics");
    if (input.newsletterEngagements !== true ||
        !exactKeys(input, expectedKeys) ||
        !isObject(input.curated) || !exactKeys(input.curated, ["talks", "books"]) ||
        !hasNewsletter || hasSearchConsole && !hasAnalytics) {
      throw fail("INPUT_SCHEMA_INVALID");
    }
    const newsletterSelection = validateNewsletterSelection(input.newsletter);
    if (newsletterSelection.language !== "en") throw fail("NEWSLETTER_CONFIGURATION_INVALID");
    const { sources } = configuredSources(input.newsletter);
    return {
      schemaVersion: 10,
      sources,
      curated: input.curated,
      newsletter: newsletterSelection,
      newsletterEngagements: true,
      ...(hasAnalytics ? { analytics: validateAnalyticsSelection(input.analytics) } : {}),
      ...(hasSearchConsole ? { searchConsole: validateSearchConsoleSelection(input.searchConsole) } : {}),
      ...(hasDirectoryAnalytics ? {
        directoryAnalytics: validateDirectoryAnalyticsSelection(input.directoryAnalytics,
          outboundClicksEnabled, recordedSinceEnabled),
        ...(outboundClicksEnabled ? { directoryOutboundClicks: true } : {})
      } : {})
    };
  }

  // Always use a stable source order for public output and semantic scope.
  return {
    schemaVersion: 2,
    sources: [
      sourcesById.get("caylent"),
      sourcesById.get("builder-center"),
      ...(hasCloudyThings ? [sourcesById.get("cloudy-things")] : []),
      ...(hasDondeAprendoAws ? [sourcesById.get("donde-aprendo-aws")] : []),
      ...(hasAwsForEngineers ? [sourcesById.get("aws-for-engineers")] : [])
    ]
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

function builderArticleViewsScopeFingerprint(source) {
  const scope = {
    definitionVersion: 1,
    family: "builderArticleViews",
    policy: "builder-center-eligible-publication-views-v1",
    source: { id: "builder-center", label: SOURCE_LABELS["builder-center"] },
    providerAuthorId: source.authorId,
    metric: "viewsCount",
    basis: "recorded-total",
    startDate: BUILDER_VIEWS_START_DATE,
    supportedLanguages: ["en", "es"]
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function makeBuilderArticleViewsGroup(source, candidates, collectedAt) {
  const seen = new Map();
  const views = { all: 0, en: 0, es: 0 };

  for (const candidate of candidates) {
    const { providerId, language, viewsCount } = candidate;
    if (!Number.isSafeInteger(viewsCount) || viewsCount < 0) throw fail("BUILDER_VIEWS_INVALID");

    const prior = seen.get(providerId);
    if (prior) {
      if (prior.language !== language || prior.viewsCount !== viewsCount) throw fail("BUILDER_VIEWS_INVALID");
      continue;
    }
    seen.set(providerId, { language, viewsCount });

    const languageTotal = views[language] + viewsCount;
    const allTotal = views.all + viewsCount;
    if (!Number.isSafeInteger(languageTotal) || !Number.isSafeInteger(allTotal)) throw fail("BUILDER_VIEWS_INVALID");
    views[language] = languageTotal;
    views.all = allTotal;
  }

  return {
    definitionVersion: 1,
    basis: "recorded-total",
    collectedAt,
    scopeId: builderArticleViewsScopeFingerprint(source),
    source: { id: "builder-center", label: SOURCE_LABELS["builder-center"] },
    startDate: BUILDER_VIEWS_START_DATE,
    views
  };
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

function newsletterEmailsSentScopeFingerprint(selection) {
  const scope = {
    definitionVersion: 1,
    family: "newsletterEmailsSent",
    policy: "beehiiv-publication-total-sent-v1",
    publication: { ...NEWSLETTER_PUBLICATION, language: "en" },
    providerPublicationId: selection.publicationId,
    source: { providerMetric: "total_sent" }
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function makeNewsletterEmailsSentGroup(selection, sent, collectedAt) {
  return {
    definitionVersion: 1,
    basis: "cumulative",
    collectedAt,
    scopeId: newsletterEmailsSentScopeFingerprint(selection),
    publication: { ...NEWSLETTER_PUBLICATION, language: "en" },
    sent
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

async function collectNewsletter(selection, env, collectedAt) {
  const apiKey = await readBeehiivApiKey(env);
  const url = `${BEEHIIV_API_ENDPOINT}${encodeURIComponent(selection.publicationId)}?expand=stats`;
  const envelope = await fetchJson(url, selection.id, 1, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    redirect: "error"
  });
  if (!isObject(envelope) || !isObject(envelope.data) || envelope.data.id !== selection.publicationId ||
      !isObject(envelope.data.stats)) {
    throw fail("NEWSLETTER_RESPONSE_INVALID");
  }
  const subscribers = envelope.data.stats.active_subscriptions;
  const validSubscribers = Number.isSafeInteger(subscribers) && subscribers >= 0;
  const result = {
    newsletter: validSubscribers
      ? makeNewsletterGroup(selection, subscribers, collectedAt)
      : null,
    newsletterFailure: validSubscribers ? null : "NEWSLETTER_RESPONSE_INVALID"
  };

  if (selection.language === "en") {
    const sent = envelope.data.stats.total_sent;
    const validSent = Number.isSafeInteger(sent) && sent >= 0;
    result.newsletterEmailsSent = validSent
      ? makeNewsletterEmailsSentGroup(selection, sent, collectedAt)
      : null;
    result.newsletterEmailsSentFailure = validSent ? null : "NEWSLETTER_RESPONSE_INVALID";
  }
  return result;
}

function newsletterEngagementScopeFingerprint(selection, family, providerMetric) {
  const scope = {
    definitionVersion: 1,
    family,
    policy: "beehiiv-post-email-reported-daily-events-v1",
    publication: { ...NEWSLETTER_PUBLICATION, language: "en" },
    providerPublicationId: selection.publicationId,
    source: { emailType: "post", granularity: "day", providerMetric, timeZone: "UTC" }
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function newsletterEngagementRanges(now) {
  const collectionDate = new Date(now).toISOString().slice(0, 10);
  const endDate = addCalendarDays(collectionDate, -3);
  const anchor = addCalendarDays(endDate, 1);
  const byPeriod = {
    "7d": { startDate: addCalendarDays(endDate, -6), endDate },
    "30d": { startDate: addCalendarDays(endDate, -29), endDate },
    "90d": { startDate: addCalendarDays(endDate, -89), endDate },
    "12m": { startDate: addCalendarMonths(anchor, -12), endDate }
  };
  const yearStart = `${collectionDate.slice(0, 4)}-01-01`;
  if (yearStart <= endDate) byPeriod.ytd = { startDate: yearStart, endDate };
  return NEWSLETTER_ENGAGEMENT_PERIODS
    .filter((period) => Object.hasOwn(byPeriod, period))
    .map((period) => ({ period, ...byPeriod[period] }));
}

function newsletterEngagementChunks(ranges) {
  const startDate = ranges.reduce((earliest, range) => range.startDate < earliest ? range.startDate : earliest,
    ranges[0].startDate);
  const endDate = ranges.reduce((latest, range) => range.endDate > latest ? range.endDate : latest,
    ranges[0].endDate);
  const chunks = [];
  for (let start = startDate; start <= endDate;) {
    const remaining = Math.floor((Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
    const numberOfDays = Math.min(31, remaining);
    chunks.push({ startDate: start, endDate: addCalendarDays(start, numberOfDays - 1), numberOfDays });
    start = addCalendarDays(start, numberOfDays);
  }
  return chunks;
}

async function requestNewsletterEngagementChunk(selection, apiKey, chunk) {
  const url = new URL(`${BEEHIIV_API_ENDPOINT}${encodeURIComponent(selection.publicationId)}/engagements`);
  url.searchParams.set("start_date", chunk.startDate);
  url.searchParams.set("number_of_days", String(chunk.numberOfDays));
  url.searchParams.set("granularity", "day");
  url.searchParams.set("email_type", "post");
  const envelope = await fetchJson(url.toString(), "simple-aws-email-engagements", chunk.startDate, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    redirect: "error",
    noRedirectRetry: true,
    timeoutMs: 5_000
  });
  const boundaryDate = addCalendarDays(chunk.startDate, chunk.numberOfDays);
  if (!isObject(envelope) || envelope.publication_id !== selection.publicationId ||
      envelope.granularity !== "day" || envelope.email_type !== "post" ||
      envelope.start_date !== chunk.startDate || envelope.number_of_days !== chunk.numberOfDays ||
      !Array.isArray(envelope.data) || envelope.data.length > 32 ||
      envelope.data.length > chunk.numberOfDays + 1) {
    throw fail("BEEHIIV_ENGAGEMENT_RESPONSE_INVALID");
  }

  const dates = new Set();
  const rows = [];
  for (const row of envelope.data) {
    if (!isObject(row) || !isRealIsoDate(row.date) || row.date < chunk.startDate || row.date > boundaryDate || dates.has(row.date)) {
      throw fail("BEEHIIV_ENGAGEMENT_RESPONSE_INVALID");
    }
    dates.add(row.date);
    if (row.date < chunk.endDate || row.date === chunk.endDate) rows.push(row);
  }
  return rows;
}

function isValidBeehiivEventCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function makeNewsletterEngagementMetricResult({ selection, family, valueKey, providerMetric, ranges,
  rowsByDate, invalidMetricDates, failedChunks, collectedAt }) {
  const records = {};
  const failedPeriods = [];
  let failureCode;
  for (const range of ranges) {
    const hasChunkFailure = failedChunks.some(({ startDate, endDate }) =>
      startDate <= range.endDate && range.startDate <= endDate);
    let hasInvalidMetric = false;
    let total = 0;
    let rowCount = 0;
    if (!hasChunkFailure) {
      for (let date = range.startDate; date <= range.endDate; date = addCalendarDays(date, 1)) {
        if (invalidMetricDates.has(date)) {
          hasInvalidMetric = true;
          continue;
        }
        const row = rowsByDate.get(date);
        if (!row) continue;
        const value = row[providerMetric];
        if (!isValidBeehiivEventCount(value)) {
          hasInvalidMetric = true;
          continue;
        }
        const next = total + value;
        if (!Number.isSafeInteger(next)) {
          hasInvalidMetric = true;
          continue;
        }
        total = next;
        rowCount += 1;
      }
    }
    if (hasChunkFailure || hasInvalidMetric || rowCount === 0) {
      failedPeriods.push(range.period);
      failureCode ??= hasChunkFailure ? "BEEHIIV_ENGAGEMENT_REPORT_FAILED"
        : hasInvalidMetric ? "BEEHIIV_ENGAGEMENT_METRIC_INVALID" : "BEEHIIV_ENGAGEMENT_REPORT_EMPTY";
      continue;
    }
    records[range.period] = {
      basis: "period",
      collectedAt,
      scopeId: newsletterEngagementScopeFingerprint(selection, family, providerMetric),
      publication: { ...NEWSLETTER_PUBLICATION, language: "en" },
      timeZone: "UTC",
      startDate: range.startDate,
      endDate: range.endDate,
      [valueKey]: total
    };
  }
  return {
    group: Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null,
    failedPeriods,
    eligiblePeriods: ranges.map(({ period }) => period),
    ...(failureCode ? { failureCode } : {})
  };
}

async function collectNewsletterEngagements(value, env, collectedAt, now) {
  const selection = validateNewsletterSelection(value);
  const ranges = newsletterEngagementRanges(now);
  const failedResult = (code) => ({
    group: null,
    failedPeriods: ranges.map(({ period }) => period),
    eligiblePeriods: ranges.map(({ period }) => period),
    failureCode: code
  });
  let apiKey;
  try {
    apiKey = await readBeehiivApiKey(env);
  } catch (error) {
    if (!(error instanceof CollectorError)) throw error;
    return {
      opens: failedResult(error.code),
      verifiedClicks: failedResult(error.code)
    };
  }

  const chunks = newsletterEngagementChunks(ranges);
  const rowsByDate = new Map();
  const invalidOpenDates = new Set();
  const invalidClickDates = new Set();
  const failedChunks = [];
  let failureCode;
  for (const chunk of chunks) {
    try {
      const rows = await requestNewsletterEngagementChunk(selection, apiKey, chunk);
      for (const row of rows) {
        const openValid = isValidBeehiivEventCount(row.total_opens);
        const clickValid = isValidBeehiivEventCount(row.total_verified_clicks);
        if (!openValid) invalidOpenDates.add(row.date);
        if (!clickValid) invalidClickDates.add(row.date);
        rowsByDate.set(row.date, row);
      }
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failedChunks.push(chunk);
      failureCode ??= error.code;
    }
  }

  const opens = makeNewsletterEngagementMetricResult({
    selection, family: "newsletterEmailOpens", valueKey: "opens", providerMetric: "total_opens",
    ranges, rowsByDate, invalidMetricDates: invalidOpenDates, failedChunks, collectedAt
  });
  const verifiedClicks = makeNewsletterEngagementMetricResult({
    selection, family: "newsletterEmailVerifiedClicks", valueKey: "clicks", providerMetric: "total_verified_clicks",
    ranges, rowsByDate, invalidMetricDates: invalidClickDates, failedChunks, collectedAt
  });
  if (failureCode) {
    opens.failureCode ??= failureCode;
    verifiedClicks.failureCode ??= failureCode;
  }
  return { opens, verifiedClicks };
}

function scopeFingerprint(sources) {
  const sourceSelectors = sources.map((source) => {
    if (source.id === "caylent") return { id: source.id, authorId: source.authorId, language: source.language };
    if (source.id === "simple-aws") {
      return { id: source.id, publicationId: source.publicationId, language: source.language };
    }
    if (source.id === "cloudy-things") {
      return { id: source.id, authorName: source.authorName, language: source.language };
    }
    if (source.id === "donde-aprendo-aws") return { id: source.id };
    if (source.id === "aws-for-engineers") return { id: source.id };
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
        signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)
      };
      if (Object.hasOwn(options, "body")) requestOptions.body = options.body;
      if (options.redirect !== undefined) requestOptions.redirect = options.redirect;
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (options.noRedirectRetry === true && options.redirect === "error" && isRejectedRedirect(error)) {
        throw fail("SOURCE_REDIRECT_REJECTED");
      }
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

function isRejectedRedirect(error) {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current.message === "string" && /unexpected redirect/i.test(current.message)) return true;
    current = current.cause;
  }
  return false;
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

function supportedDirectoryViewRanges(analytics, now) {
  return supportedGoogleViewRanges(analytics, now);
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

function directoryViewsScopeFingerprint(analytics, period) {
  const scope = {
    definitionVersion: 1,
    family: "directoryViews",
    metric: "screenPageViews",
    publication: {
      id: analytics.id,
      propertyId: analytics.propertyId,
      language: analytics.language,
      hostname: analytics.hostname
    },
    timeZone: analytics.timeZone,
    ...(period === "total" ? { recordedSince: analytics.recordedSince } : {})
  };
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function directoryOutboundClicksScopeFingerprint(analytics, period) {
  const scope = {
    definitionVersion: 1,
    family: "directoryOutboundClicks",
    metric: "eventCount",
    filter: { eventName: "click", outbound: "true" },
    publication: {
      id: analytics.id,
      propertyId: analytics.propertyId,
      language: analytics.language,
      hostname: analytics.hostname
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

function validateGoogleReport(response, analytics, expectedMetricName) {
  if (!isObject(response) || !Array.isArray(response.metricHeaders) || response.metricHeaders.length !== 1 ||
      !exactKeys(response.metricHeaders[0], ["name", "type"]) ||
      response.metricHeaders[0].name !== expectedMetricName || response.metricHeaders[0].type !== "TYPE_INTEGER" ||
      (response.dimensionHeaders !== undefined &&
        (!Array.isArray(response.dimensionHeaders) || response.dimensionHeaders.length !== 0)) ||
      response.rowCount !== 1 || !Array.isArray(response.rows) || response.rows.length !== 1 ||
      !exactKeys(response.rows[0], ["metricValues"]) || !Array.isArray(response.rows[0].metricValues) ||
      response.rows[0].metricValues.length !== 1 || !exactKeys(response.rows[0].metricValues[0], ["value"]) ||
      typeof response.rows[0].metricValues[0].value !== "string" ||
      !/^(?:0|[1-9]\d*)$/.test(response.rows[0].metricValues[0].value)) {
    throw fail("ANALYTICS_REPORT_INVALID");
  }

  const value = Number(response.rows[0].metricValues[0].value);
  if (!Number.isSafeInteger(value) || value < 0) throw fail("ANALYTICS_REPORT_INVALID");

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
  return { value, qualifications };
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
  const result = validateGoogleReport(response, analytics, "screenPageViews");
  return {
    basis: range.period === "total" ? "recorded-total" : "period",
    collectedAt,
    scopeId: articleViewsScopeFingerprint(analytics, range.period),
    publication: { ...GOOGLE_ANALYTICS_PUBLICATION, language: analytics.language },
    timeZone: analytics.timeZone,
    startDate: range.startDate,
    endDate: range.endDate,
    views: result.value,
    qualifications: result.qualifications
  };
}

async function requestDirectoryGoogleReport(analytics, accessToken, range, collectedAt) {
  const url = `${GOOGLE_ANALYTICS_ENDPOINT}${analytics.propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: {
      andGroup: {
        expressions: [{
          filter: {
            fieldName: "hostName",
            stringFilter: { matchType: "EXACT", value: analytics.hostname, caseSensitive: true }
          }
        }]
      }
    }
  };
  const response = await fetchJson(url, "donde-aprendo-aws", range.period, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    redirect: "error"
  });
  const result = validateGoogleReport(response, analytics, "screenPageViews");
  return {
    basis: range.period === "total" ? "recorded-total" : "period",
    collectedAt,
    scopeId: directoryViewsScopeFingerprint(analytics, range.period),
    publication: { ...DIRECTORY_ANALYTICS_PUBLICATION, language: analytics.language },
    timeZone: analytics.timeZone,
    startDate: range.startDate,
    endDate: range.endDate,
    views: result.value,
    qualifications: result.qualifications
  };
}

async function requestDirectoryOutboundClickReport(analytics, accessToken, range, collectedAt) {
  const url = `${GOOGLE_ANALYTICS_ENDPOINT}${analytics.propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "hostName",
              stringFilter: { matchType: "EXACT", value: analytics.hostname, caseSensitive: true }
            }
          },
          {
            filter: {
              fieldName: "eventName",
              stringFilter: { matchType: "EXACT", value: "click", caseSensitive: true }
            }
          },
          {
            filter: {
              fieldName: "outbound",
              stringFilter: { matchType: "EXACT", value: "true", caseSensitive: true }
            }
          }
        ]
      }
    }
  };
  const response = await fetchJson(url, "donde-aprendo-aws", range.period, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    redirect: "error"
  });
  const result = validateGoogleReport(response, analytics, "eventCount");
  return {
    basis: range.period === "total" ? "recorded-total" : "period",
    collectedAt,
    scopeId: directoryOutboundClicksScopeFingerprint(analytics, range.period),
    publication: { ...DIRECTORY_ANALYTICS_PUBLICATION, language: analytics.language },
    timeZone: analytics.timeZone,
    startDate: range.startDate,
    endDate: range.endDate,
    clicks: result.value,
    qualifications: result.qualifications
  };
}

async function collectGooglePeriods(ranges, requestRecord) {
  const eligiblePeriods = ranges.map(({ period }) => period);
  if (ranges.length === 0) return { group: null, failedPeriods: [], eligiblePeriods };
  // Keep concurrency within one fixed, bounded family; callers still run families sequentially.
  const outcomes = await Promise.allSettled(ranges.map(async (range) => requestRecord(range)));
  const records = {};
  const failedPeriods = [];
  let failureCode;
  for (let index = 0; index < ranges.length; index += 1) {
    const outcome = outcomes[index];
    const period = ranges[index].period;
    if (outcome.status === "fulfilled") {
      records[period] = outcome.value;
    } else {
      const { reason: error } = outcome;
      if (!(error instanceof CollectorError)) throw error;
      failedPeriods.push(period);
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

async function collectArticleViews(analytics, accessToken, collectedAt, now) {
  const ranges = supportedGoogleViewRanges(analytics, now);
  return collectGooglePeriods(ranges, (range) => requestGoogleReport(analytics, accessToken, range, collectedAt));
}

async function collectDirectoryViews(analytics, accessToken, collectedAt, now) {
  const ranges = supportedDirectoryViewRanges(analytics, now);
  return collectGooglePeriods(ranges, (range) => requestDirectoryGoogleReport(analytics, accessToken, range, collectedAt));
}

async function collectDirectoryOutboundClicks(analytics, accessToken, collectedAt, now) {
  const ranges = supportedDirectoryViewRanges(analytics, now);
  return collectGooglePeriods(ranges, (range) => requestDirectoryOutboundClickReport(analytics, accessToken, range, collectedAt));
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
  return collectGooglePeriods(ranges, (range) => requestGoogleSearchReport(searchConsole, accessToken, range, collectedAt));
}

async function collectGoogleMetrics(configuration, env, collectedAt, now) {
  const supportsDirectoryAnalytics = configuration.schemaVersion === 7 || configuration.schemaVersion === 8 ||
    configuration.schemaVersion === 9 || configuration.schemaVersion === 10;
  const directoryEnabled = supportsDirectoryAnalytics && configuration.directoryAnalytics !== undefined;
  const directoryOutboundClicksEnabled = configuration.directoryOutboundClicks === true && directoryEnabled;
  const articleViewsEnabled = configuration.analytics !== undefined;
  const viewsRanges = articleViewsEnabled ? supportedGoogleViewRanges(configuration.analytics, now) : [];
  const viewsEligiblePeriods = viewsRanges.map(({ period }) => period);
  const directoryRanges = directoryEnabled ? supportedDirectoryViewRanges(configuration.directoryAnalytics, now) : [];
  const directoryEligiblePeriods = directoryRanges.map(({ period }) => period);
  const outboundClickRanges = directoryOutboundClicksEnabled ? directoryRanges : [];
  const outboundClickEligiblePeriods = outboundClickRanges.map(({ period }) => period);
  const searchRanges = (configuration.schemaVersion === 6 || configuration.schemaVersion === 7 || configuration.schemaVersion === 8 ||
    configuration.schemaVersion === 9 || configuration.schemaVersion === 10) && configuration.searchConsole !== undefined
    ? supportedGoogleSearchRanges(configuration.searchConsole, now)
    : [];
  const searchEligiblePeriods = searchRanges.map(({ period }) => period);
  const emptyViews = { group: null, failedPeriods: [], eligiblePeriods: viewsEligiblePeriods };
  const emptyDirectory = { group: null, failedPeriods: [], eligiblePeriods: directoryEligiblePeriods };
  const emptyOutboundClicks = { group: null, failedPeriods: [], eligiblePeriods: outboundClickEligiblePeriods };
  const emptySearch = { group: null, failedPeriods: [], eligiblePeriods: searchEligiblePeriods };
  if (viewsEligiblePeriods.length === 0 && directoryEligiblePeriods.length === 0 &&
      outboundClickEligiblePeriods.length === 0 && searchEligiblePeriods.length === 0) {
    return {
      articleViews: emptyViews,
      directoryViews: emptyDirectory,
      directoryOutboundClicks: emptyOutboundClicks,
      articleSearchClicks: emptySearch
    };
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
      directoryViews: directoryEligiblePeriods.length > 0
        ? { ...emptyDirectory, failedPeriods: directoryEligiblePeriods, failureCode: failure }
        : emptyDirectory,
      directoryOutboundClicks: outboundClickEligiblePeriods.length > 0
        ? { ...emptyOutboundClicks, failedPeriods: outboundClickEligiblePeriods, failureCode: failure }
        : emptyOutboundClicks,
      articleSearchClicks: searchEligiblePeriods.length > 0
        ? { ...emptySearch, failedPeriods: searchEligiblePeriods, failureCode: failure }
        : emptySearch
    };
  }

  const articleViews = viewsEligiblePeriods.length > 0
    ? await collectArticleViews(configuration.analytics, accessToken, collectedAt, now)
    : emptyViews;
  const directoryViews = directoryEligiblePeriods.length > 0
    ? await collectDirectoryViews(configuration.directoryAnalytics, accessToken, collectedAt, now)
    : emptyDirectory;
  const directoryOutboundClicks = outboundClickEligiblePeriods.length > 0
    ? await collectDirectoryOutboundClicks(configuration.directoryAnalytics, accessToken, collectedAt, now)
    : emptyOutboundClicks;
  const articleSearchClicks = searchEligiblePeriods.length > 0
    ? await collectArticleSearchClicks(configuration.searchConsole, accessToken, collectedAt, now)
    : emptySearch;
  return { articleViews, directoryViews, directoryOutboundClicks, articleSearchClicks };
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
  if (!Number.isSafeInteger(envelope.resultsSize) || envelope.resultsSize < 0 ||
      envelope.resultsSize !== envelope.articles.length) {
    throw fail("BUILDER_ENVELOPE_INVALID");
  }
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

function cloudyArchiveUrl(page) {
  return page === 1
    ? `${CLOUDY_ARCHIVE_ORIGIN}${CLOUDY_ARCHIVE_PATH}`
    : `${CLOUDY_ARCHIVE_ORIGIN}${CLOUDY_ARCHIVE_PATH}?page=${page}`;
}

function cloudyElementMatches(html, tagName) {
  const pattern = new RegExp(`<${tagName}(?=\\s|>)[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function cloudyOpeningTag(element, tagName) {
  const match = element.match(new RegExp(`^<${tagName}(?=\\s|>)[^>]*>`, "i"));
  return match?.[0] ?? "";
}

function cloudyInnerHtml(element, tagName) {
  const opening = cloudyOpeningTag(element, tagName);
  if (opening === "") return "";
  return element.slice(opening.length).replace(new RegExp(`</${tagName}\\s*>$`, "i"), "");
}

function cloudyAttribute(element, name) {
  const match = cloudyOpeningTag(element, "[a-z][a-z0-9-]*")
    .match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match?.[2];
}

function cloudyHasAttribute(element, name) {
  return new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|>)`, "i").test(cloudyOpeningTag(element, "[a-z][a-z0-9-]*"));
}

function decodeCloudyHtmlText(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function cloudyText(value) {
  return decodeCloudyHtmlText(value).replace(/[\s\p{White_Space}]+/gu, " ").trim();
}

function cloudyTypeIs(value, expected) {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

function cloudyArticleType(value) {
  return cloudyTypeIs(value, "Article") || cloudyTypeIs(value, "BlogPosting");
}

function normalizedCloudyArticleUrl(value) {
  if (typeof value !== "string" || value.trim() === "") throw fail("CLOUDY_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(value.trim(), CLOUDY_ARCHIVE_ORIGIN);
  } catch {
    throw fail("CLOUDY_RECORD_INVALID");
  }
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const reserved = new Set(["/archive", "/rss.xml", "/sitemap.xml", "/recommendations"]);
  if (parsed.origin !== CLOUDY_ARCHIVE_ORIGIN ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "" ||
      pathname === "" || pathname === "/" || reserved.has(pathname) || pathname.includes("//") ||
      pathname.slice(1).includes("/") || /%2f/i.test(pathname)) {
    throw fail("CLOUDY_RECORD_INVALID");
  }
  return `${CLOUDY_ARCHIVE_ORIGIN}${pathname}`;
}

function normalizedCloudyArchiveUrl(value, page) {
  if (typeof value !== "string" || value.trim() === "") throw fail("CLOUDY_PAGINATION_INVALID");
  let parsed;
  try {
    parsed = new URL(value.trim(), CLOUDY_ARCHIVE_ORIGIN);
  } catch {
    throw fail("CLOUDY_PAGINATION_INVALID");
  }
  const expected = new URL(cloudyArchiveUrl(page));
  if (parsed.origin !== CLOUDY_ARCHIVE_ORIGIN || parsed.protocol !== expected.protocol || parsed.hostname !== expected.hostname ||
      parsed.username !== "" || parsed.password !== "" || parsed.pathname !== expected.pathname ||
      parsed.search !== expected.search || parsed.hash !== "") {
    throw fail("CLOUDY_PAGINATION_INVALID");
  }
  return parsed.toString();
}

function cloudyJsonLdRecords(body, expectedUrl) {
  const scripts = [...body.matchAll(/<script(?=\s|>)[^>]*\s+type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const collections = [];
  for (const match of scripts) {
    let value;
    try {
      value = JSON.parse(match[2]);
    } catch {
      // An unrelated JSON-LD block must not make the selected CollectionPage
      // unavailable. A missing or malformed selected block still fails below.
      continue;
    }
    if (isObject(value) && cloudyTypeIs(value["@type"], "CollectionPage") && typeof value.url === "string") {
      try {
        if (normalizedCloudyArchiveUrl(value.url, expectedUrl.page) === expectedUrl.value) collections.push(value);
      } catch {
        // An unrelated CollectionPage does not affect the selected archive page.
      }
    }
  }
  if (collections.length !== 1) throw fail("CLOUDY_JSONLD_INVALID");
  const collection = collections[0];
  if (!Array.isArray(collection.hasPart) || collection.hasPart.length === 0) {
    throw fail("CLOUDY_JSONLD_INVALID");
  }

  const records = [];
  const urls = new Set();
  for (const item of collection.hasPart) {
    if (!isObject(item) || !cloudyArticleType(item["@type"]) ||
        typeof item.headline !== "string" || item.headline.trim() === "" || typeof item.url !== "string") {
      throw fail("CLOUDY_JSONLD_INVALID");
    }
    const url = normalizedCloudyArticleUrl(item.url);
    if (urls.has(url)) throw fail("CLOUDY_URL_REPEATED");
    urls.add(url);
    records.push({ title: normalizedTitle(item.headline), url });
  }
  return records;
}

function parseCloudyPublishedDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) return null;
  const date = new Date(parsed);
  const [, year, month, day, hours, minutes, seconds] = match;
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hours) ||
      date.getUTCMinutes() !== Number(minutes) || date.getUTCSeconds() !== Number(seconds)) {
    return null;
  }
  return parsed;
}

function cloudyRenderedRecords(body) {
  const sections = [...body.matchAll(/<section(?=\s|>)[^>]*\s+aria-labelledby\s*=\s*(["'])archive-heading\1[^>]*>[\s\S]*?<\/section\s*>/gi)];
  if (sections.length !== 1) throw fail("CLOUDY_MARKUP_INVALID");
  const section = sections[0][0];
  const articles = cloudyElementMatches(section, "article");
  if (articles.length === 0) throw fail("CLOUDY_MARKUP_INVALID");

  const records = [];
  const urls = new Set();
  for (const article of articles) {
    const anchors = cloudyElementMatches(article, "a");
    const times = cloudyElementMatches(article, "time");
    const paragraphs = cloudyElementMatches(article, "p");
    if (anchors.length !== 1 || times.length !== 1 || paragraphs.length !== 1) {
      throw fail("CLOUDY_MARKUP_INVALID");
    }
    const href = cloudyAttribute(anchors[0], "href");
    const dateTime = cloudyAttribute(times[0], "datetime");
    const author = cloudyText(cloudyInnerHtml(paragraphs[0], "p"));
    if (href === undefined || dateTime === undefined || author === "") throw fail("CLOUDY_MARKUP_INVALID");
    const url = normalizedCloudyArticleUrl(href);
    if (urls.has(url)) throw fail("CLOUDY_URL_REPEATED");
    const publishedAt = parseCloudyPublishedDate(dateTime);
    if (publishedAt === null) throw fail("CLOUDY_DATE_INVALID");
    urls.add(url);
    records.push({ url, author, publishedAt });
  }
  return records;
}

function cloudyPagination(body, page) {
  const headers = cloudyElementMatches(body, "header");
  const headerTotals = headers.flatMap((header) => cloudyElementMatches(header, "p"))
    .map((paragraph) => cloudyText(cloudyInnerHtml(paragraph, "p")))
    .filter((text) => /^\d+\s+posts\s+published\s+so\s+far$/i.test(text));
  if (headerTotals.length !== 1) throw fail("CLOUDY_PAGINATION_INVALID");
  const totalMatch = headerTotals[0].match(/^(\d+)\s+posts\s+published\s+so\s+far$/i);
  const totalPosts = Number(totalMatch[1]);
  if (!Number.isSafeInteger(totalPosts) || totalPosts < 1) throw fail("CLOUDY_PAGINATION_INVALID");

  const navs = [...body.matchAll(/<nav(?=\s|>)[^>]*\s+aria-label\s*=\s*(["'])Pagination\1[^>]*>[\s\S]*?<\/nav\s*>/gi)];
  if (navs.length !== 1) throw fail("CLOUDY_PAGINATION_INVALID");
  const nav = navs[0][0];
  const navText = cloudyText(nav);
  const pageMatch = navText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
  if (!pageMatch) throw fail("CLOUDY_PAGINATION_INVALID");
  const currentPage = Number(pageMatch[1]);
  const totalPages = Number(pageMatch[2]);
  if (!Number.isSafeInteger(currentPage) || !Number.isSafeInteger(totalPages) ||
      currentPage !== page || currentPage < 1 || totalPages < 1 || currentPage > totalPages) {
    throw fail("CLOUDY_PAGINATION_INVALID");
  }

  const controls = [...nav.matchAll(/<(a|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)]
    .map((match) => match[0])
    .filter((control) => cloudyText(control).toLowerCase() === "next");
  if (controls.length !== 1) throw fail("CLOUDY_PAGINATION_INVALID");
  const control = controls[0];
  const isAnchor = /^<a\b/i.test(control);
  const isDisabled = cloudyHasAttribute(control, "disabled");
  if (currentPage < totalPages) {
    if (!isAnchor || isDisabled) throw fail("CLOUDY_PAGINATION_INVALID");
    const href = cloudyAttribute(control, "href");
    if (href === undefined) throw fail("CLOUDY_PAGINATION_INVALID");
    return {
      totalPosts,
      totalPages,
      currentPage,
      nextUrl: normalizedCloudyArchiveUrl(href, currentPage + 1)
    };
  }
  if (isAnchor || !isDisabled) throw fail("CLOUDY_PAGINATION_INVALID");
  return { totalPosts, totalPages, currentPage, nextUrl: null };
}

function parseCloudyArchive(body, page) {
  const expectedUrl = { page, value: cloudyArchiveUrl(page) };
  const jsonLd = cloudyJsonLdRecords(body, expectedUrl);
  const rendered = cloudyRenderedRecords(body);
  const pagination = cloudyPagination(body, page);
  if (jsonLd.length !== rendered.length) throw fail("CLOUDY_RECORD_JOIN_INVALID");
  const renderedByUrl = new Map(rendered.map((record) => [record.url, record]));
  if (renderedByUrl.size !== rendered.length) throw fail("CLOUDY_URL_REPEATED");
  const publications = [];
  for (const record of jsonLd) {
    const renderedRecord = renderedByUrl.get(record.url);
    if (!renderedRecord) throw fail("CLOUDY_RECORD_JOIN_INVALID");
    publications.push({
      title: record.title,
      url: record.url,
      author: renderedRecord.author,
      publishedAt: renderedRecord.publishedAt
    });
  }
  return { ...pagination, publications };
}

async function readBoundedBody(response, { tooLargeCode, readFailedCode }) {
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const text = decoder.decode(result.value, { stream: true });
        bytes += Buffer.byteLength(text, "utf8");
        if (bytes > MAX_DECODED_SOURCE_BODY_BYTES) {
          await reader.cancel();
          throw fail(tooLargeCode);
        }
        chunks.push(text);
      }
      const tail = decoder.decode();
      bytes += Buffer.byteLength(tail, "utf8");
      if (bytes > MAX_DECODED_SOURCE_BODY_BYTES) throw fail(tooLargeCode);
      chunks.push(tail);
      return chunks.join("");
    } catch (error) {
      if (error instanceof CollectorError) throw error;
      try { await reader.cancel(); } catch { /* best effort */ }
      throw fail(readFailedCode);
    }
  }

  throw fail(readFailedCode);
}

function readCloudyBody(response) {
  return readBoundedBody(response, {
    tooLargeCode: "CLOUDY_BODY_TOO_LARGE",
    readFailedCode: "CLOUDY_BODY_READ_FAILED"
  });
}

async function fetchCloudyArchive(url, page) {
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: { accept: "text/html" },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      if (attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId: "cloudy-things", page, reason: "network" });
        continue;
      }
      throw fail("SOURCE_NETWORK_FAILED");
    }
    if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
      throw fail("SOURCE_RESPONSE_INVALID");
    }
    if (!response.ok) {
      if (isTransientStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId: "cloudy-things", page, status: response.status });
        continue;
      }
      throw fail(`SOURCE_HTTP_${response.status}`);
    }
    const contentType = response.headers?.get?.("content-type");
    if (typeof contentType !== "string" || !/^text\/html(?:\s*;|$)/i.test(contentType.trim())) {
      throw fail("CLOUDY_CONTENT_TYPE_INVALID");
    }
    try {
      return await readCloudyBody(response);
    } catch (error) {
      if (error instanceof CollectorError && error.code === "CLOUDY_BODY_READ_FAILED" && attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId: "cloudy-things", page, reason: "body" });
        continue;
      }
      throw error;
    }
  }
  throw fail("SOURCE_NETWORK_FAILED");
}

async function fetchNativeArticleIndex({ url, sourceId, errorPrefix }) {
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      if (isRejectedRedirect(error)) throw fail("SOURCE_REDIRECT_REJECTED");
      if (attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId, page: 1, reason: "network" });
        continue;
      }
      throw fail("SOURCE_NETWORK_FAILED");
    }

    if (!response || typeof response.ok !== "boolean" || !Number.isInteger(response.status)) {
      throw fail("SOURCE_RESPONSE_INVALID");
    }
    if (!response.ok) {
      if (isTransientStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId, page: 1, status: response.status });
        continue;
      }
      throw fail(`SOURCE_HTTP_${response.status}`);
    }

    let raw;
    try {
      raw = await readBoundedBody(response, {
        tooLargeCode: `${errorPrefix}_BODY_TOO_LARGE`,
        readFailedCode: `${errorPrefix}_BODY_READ_FAILED`
      });
    } catch (error) {
      if (error instanceof CollectorError && error.code === `${errorPrefix}_BODY_READ_FAILED` &&
          attempt < MAX_TRANSIENT_RETRIES) {
        log("warn", { event: "content_stats_source_retry", sourceId, page: 1, reason: "body" });
        continue;
      }
      throw error;
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw fail(`${errorPrefix}_INDEX_JSON_INVALID`);
    }
  }

  throw fail("SOURCE_NETWORK_FAILED");
}

function fetchDondeAprendoIndex() {
  return fetchNativeArticleIndex({
    url: DONDE_APRENDO_INDEX_URL,
    sourceId: "donde-aprendo-aws",
    errorPrefix: "DONDE"
  });
}

function fetchAwsForEngineersIndex() {
  return fetchNativeArticleIndex({
    url: AWS_FOR_ENGINEERS_INDEX_URL,
    sourceId: "aws-for-engineers",
    errorPrefix: "AWS_FOR_ENGINEERS"
  });
}

async function collectCloudyThings(source, now) {
  const publications = [];
  const seenPages = new Set();
  const seenUrls = new Set();
  let page = 1;
  let declaredTotal = null;
  let declaredPages = null;
  while (true) {
    if (page > MAX_CLOUDY_PAGES || seenPages.has(page)) throw fail("CLOUDY_PAGE_CAP_REACHED");
    seenPages.add(page);
    const body = await fetchCloudyArchive(cloudyArchiveUrl(page), page);
    const parsed = parseCloudyArchive(body, page);
    if (declaredTotal === null) {
      declaredTotal = parsed.totalPosts;
      declaredPages = parsed.totalPages;
    } else if (parsed.totalPosts !== declaredTotal || parsed.totalPages !== declaredPages) {
      throw fail("CLOUDY_PAGINATION_INVALID");
    }
    for (const record of parsed.publications) {
      if (seenUrls.has(record.url)) throw fail("CLOUDY_URL_REPEATED");
      seenUrls.add(record.url);
      if (record.author !== source.authorName) continue;
      if (record.publishedAt > now) continue;
      publications.push({
        sourceId: source.id,
        providerId: record.url,
        title: record.title,
        language: source.language,
        url: record.url
      });
    }
    if (parsed.nextUrl === null) {
      if (parsed.currentPage !== declaredPages || seenUrls.size !== declaredTotal || publications.length > seenUrls.size) {
        throw fail("CLOUDY_PAGINATION_INVALID");
      }
      return { publications, pages: seenPages.size };
    }
    if (parsed.currentPage >= declaredPages || seenPages.size >= MAX_CLOUDY_PAGES) {
      throw fail("CLOUDY_PAGE_CAP_REACHED");
    }
    const expectedNext = cloudyArchiveUrl(parsed.currentPage + 1);
    if (parsed.nextUrl !== expectedNext) throw fail("CLOUDY_PAGINATION_INVALID");
    page = parsed.currentPage + 1;
  }
}

function normalizedDondeAprendoArticleUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value === "") throw fail("DONDE_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail("DONDE_RECORD_INVALID");
  }
  if (parsed.href !== value || parsed.origin !== DONDE_APRENDO_ORIGIN ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "" ||
      !/^\/blog\/[^/]+\/$/.test(parsed.pathname) || /%(?:2f|5c)/i.test(parsed.pathname)) {
    throw fail("DONDE_RECORD_INVALID");
  }
  return value;
}

function normalizedDondeAprendoAuthorUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() !== value || value === "") throw fail("DONDE_AUTHOR_INVALID");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail("DONDE_AUTHOR_INVALID");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw fail("DONDE_AUTHOR_INVALID");
  }
  return value;
}

function validateDondeAprendoIndex(envelope, now) {
  if (!exactKeys(envelope, ["schemaVersion", "source", "articles"]) ||
      envelope.schemaVersion !== 1 ||
      !exactKeys(envelope.source, ["id", "label"]) ||
      envelope.source.id !== "donde-aprendo-aws" ||
      envelope.source.label !== SOURCE_LABELS["donde-aprendo-aws"] ||
      !Array.isArray(envelope.articles)) {
    throw fail("DONDE_INDEX_INVALID");
  }

  const today = new Date(now).toISOString().slice(0, 10);
  const seenUrls = new Map();
  const publications = [];
  for (const article of envelope.articles) {
    if (!exactKeys(article, ["title", "language", "publishedAt", "url", "author"]) ||
        article.language !== "es" || !isRealIsoDate(article.publishedAt) ||
        !exactKeys(article.author, ["name", "url"])) {
      throw fail("DONDE_RECORD_INVALID");
    }

    const title = normalizedTitle(article.title);
    const url = normalizedDondeAprendoArticleUrl(article.url);
    const authorName = requireString(article.author.name, "DONDE_AUTHOR_INVALID");
    const authorUrl = normalizedDondeAprendoAuthorUrl(article.author.url);
    const metadata = JSON.stringify([article.title, article.language, article.publishedAt, authorName, authorUrl]);
    const previousMetadata = seenUrls.get(url);
    if (previousMetadata !== undefined) {
      if (previousMetadata !== metadata) throw fail("DONDE_URL_CONTRADICTORY");
      continue;
    }
    seenUrls.set(url, metadata);

    if (authorName !== DONDE_APRENDO_AUTHOR.name) continue;
    if (authorUrl !== DONDE_APRENDO_AUTHOR.url) throw fail("DONDE_AUTHOR_INVALID");
    if (article.publishedAt > today) continue;

    publications.push({
      sourceId: "donde-aprendo-aws",
      providerId: url,
      title,
      language: "es",
      url,
      publishedAt: article.publishedAt
    });
  }
  return publications;
}

async function collectDondeAprendoAws(source, now) {
  const envelope = await fetchDondeAprendoIndex();
  const publications = validateDondeAprendoIndex(envelope, now);
  return { publications, pages: 1 };
}

function normalizedAwsForEngineersArticleUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value === "") throw fail("AWS_FOR_ENGINEERS_RECORD_INVALID");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail("AWS_FOR_ENGINEERS_RECORD_INVALID");
  }
  if (parsed.href !== value || parsed.origin !== AWS_FOR_ENGINEERS_ORIGIN ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "" ||
      !/^\/blog\/[^/]+\/$/.test(parsed.pathname) || /%(?:2f|5c)/i.test(parsed.pathname)) {
    throw fail("AWS_FOR_ENGINEERS_RECORD_INVALID");
  }
  return value;
}

function normalizedAwsForEngineersAuthorUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim() !== value || value === "") {
    throw fail("AWS_FOR_ENGINEERS_AUTHOR_INVALID");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw fail("AWS_FOR_ENGINEERS_AUTHOR_INVALID");
  }
  if (parsed.href !== value || !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username !== "" || parsed.password !== "") {
    throw fail("AWS_FOR_ENGINEERS_AUTHOR_INVALID");
  }
  return value;
}

function parseAwsForEngineersTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (!Number.isFinite(local.getTime()) ||
      local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day ||
      local.getUTCHours() !== hour || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) {
    return null;
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offset = zone.match(/^([+-])(\d{2}):(\d{2})$/);
    const offsetHours = Number(offset[2]);
    const offsetRemainder = Number(offset[3]);
    if (offsetHours > 14 || offsetRemainder > 59 || (offsetHours === 14 && offsetRemainder !== 0)) return null;
    offsetMinutes = (offsetHours * 60 + offsetRemainder) * (offset[1] === "+" ? 1 : -1);
  }

  const utcMilliseconds = local.getTime() - offsetMinutes * 60_000;
  if (!Number.isSafeInteger(utcMilliseconds)) return null;
  const nanosecondFraction = BigInt(fraction.slice(0, 9).padEnd(9, "0") || "0");
  return {
    nanoseconds: BigInt(utcMilliseconds) * 1_000_000n + nanosecondFraction,
    subNanosecondRemainderNonzero: /[1-9]/.test(fraction.slice(9))
  };
}

function awsForEngineersPublicationIsCurrent(value, now, today) {
  if (isRealIsoDate(value)) return value <= today;
  const timestamp = parseAwsForEngineersTimestamp(value);
  if (timestamp === null) throw fail("AWS_FOR_ENGINEERS_RECORD_INVALID");
  const cutoffNanoseconds = BigInt(now) * 1_000_000n;
  return timestamp.nanoseconds < cutoffNanoseconds ||
    timestamp.nanoseconds === cutoffNanoseconds && !timestamp.subNanosecondRemainderNonzero;
}

function validateAwsForEngineersIndex(envelope, now) {
  if (!exactKeys(envelope, ["schemaVersion", "source", "articles"]) ||
      envelope.schemaVersion !== 1 ||
      !exactKeys(envelope.source, ["id", "label"]) ||
      envelope.source.id !== "aws-for-engineers" ||
      envelope.source.label !== SOURCE_LABELS["aws-for-engineers"] ||
      !Array.isArray(envelope.articles)) {
    throw fail("AWS_FOR_ENGINEERS_INDEX_INVALID");
  }

  const today = new Date(now).toISOString().slice(0, 10);
  const seenUrls = new Map();
  const publications = [];
  for (const article of envelope.articles) {
    if (!exactKeys(article, ["title", "language", "publishedAt", "url", "author"]) ||
        article.language !== "en" || typeof article.publishedAt !== "string" ||
        !exactKeys(article.author, ["name", "url"])) {
      throw fail("AWS_FOR_ENGINEERS_RECORD_INVALID");
    }

    const title = normalizedTitle(article.title);
    const url = normalizedAwsForEngineersArticleUrl(article.url);
    const authorName = requireString(article.author.name, "AWS_FOR_ENGINEERS_AUTHOR_INVALID");
    if (article.author.name !== authorName) throw fail("AWS_FOR_ENGINEERS_AUTHOR_INVALID");
    const authorUrl = normalizedAwsForEngineersAuthorUrl(article.author.url);
    const isCurrent = awsForEngineersPublicationIsCurrent(article.publishedAt, now, today);
    const metadata = JSON.stringify([article.title, article.language, article.publishedAt, authorName, authorUrl]);
    const previousMetadata = seenUrls.get(url);
    if (previousMetadata !== undefined) {
      if (previousMetadata !== metadata) throw fail("AWS_FOR_ENGINEERS_URL_CONTRADICTORY");
      continue;
    }
    seenUrls.set(url, metadata);

    if (authorName !== AWS_FOR_ENGINEERS_AUTHOR.name) continue;
    if (authorUrl !== AWS_FOR_ENGINEERS_AUTHOR.url) throw fail("AWS_FOR_ENGINEERS_AUTHOR_INVALID");
    if (!isCurrent) continue;

    publications.push({
      sourceId: "aws-for-engineers",
      providerId: url,
      title,
      language: "en",
      url,
      publishedAt: article.publishedAt
    });
  }
  return publications;
}

async function collectAwsForEngineers(source, now) {
  const envelope = await fetchAwsForEngineersIndex();
  const publications = validateAwsForEngineersIndex(envelope, now);
  return { publications, pages: 1 };
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

async function collectBuilderCenter(source, now, includeViews = false) {
  const publications = [];
  const viewCandidates = [];
  const requestedCursors = new Set();
  let cursor = "";

  for (let page = 0; page < MAX_BUILDER_PAGES; page += 1) {
    if (requestedCursors.has(cursor)) throw fail("BUILDER_CURSOR_REPEATED");
    requestedCursors.add(cursor);
    const { articles, nextCursor } = await fetchBuilderPage(source, cursor, page + 1);
    for (const record of articles) {
      const publication = eligibleBuilderPublication(record, source, now);
      if (publication) {
        publications.push(publication);
        if (includeViews) {
          viewCandidates.push({
            providerId: publication.providerId,
            language: publication.language,
            viewsCount: record.viewsCount
          });
        }
      }
    }

    if (nextCursor === "") {
      return {
        publications,
        pages: page + 1,
        ...(includeViews ? { viewCandidates } : {})
      };
    }
    if (requestedCursors.has(nextCursor)) throw fail("BUILDER_CURSOR_REPEATED");
    if (page === MAX_BUILDER_PAGES - 1) throw fail("BUILDER_PAGE_CAP_REACHED");
    cursor = nextCursor;
  }

  throw fail("BUILDER_PAGE_CAP_REACHED");
}

async function collectPublications(sources, now, env, getBuilderCollection) {
  const publications = [];
  const pagesBySource = {};
  for (const source of sources) {
    let result;
    if (source.id === "caylent") result = await collectCaylent(source, now);
    else if (source.id === "builder-center") {
      result = getBuilderCollection
        ? await getBuilderCollection()
        : await collectBuilderCenter(source, now);
    }
    else if (source.id === "simple-aws") result = await collectSimpleAws(source, now, env);
    else if (source.id === "cloudy-things") result = await collectCloudyThings(source, now);
    else if (source.id === "donde-aprendo-aws") result = await collectDondeAprendoAws(source, now);
    else if (source.id === "aws-for-engineers") result = await collectAwsForEngineers(source, now);
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
    if (sources.length === 0) return false;
    const orderedIds = ["caylent", "builder-center", "simple-aws", "cloudy-things", "donde-aprendo-aws", "aws-for-engineers"];
    const seen = new Set();
    let previousIndex = -1;
    for (const source of sources) {
      if (!exactKeys(source, ["id", "label"]) ||
          typeof source.id !== "string" ||
          SOURCE_LABELS[source.id] !== source.label ||
          seen.has(source.id)) return false;
      const index = orderedIds.indexOf(source.id);
      if (index < 0 || index <= previousIndex) return false;
      seen.add(source.id);
      previousIndex = index;
    }
    return sources[0].id === "caylent" &&
      (sources.length === 1 || sources[1].id === "builder-center");
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

function isValidBuilderArticleViewsGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "basis", "collectedAt", "scopeId", "source", "startDate", "views"]) ||
      group.definitionVersion !== 1 || group.basis !== "recorded-total" || typeof group.collectedAt !== "string") {
    return false;
  }
  const collected = Date.parse(group.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== group.collectedAt ||
      typeof group.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(group.scopeId) ||
      !exactKeys(group.source, ["id", "label"]) ||
      group.source.id !== "builder-center" || group.source.label !== SOURCE_LABELS["builder-center"] ||
      group.startDate !== BUILDER_VIEWS_START_DATE || !exactKeys(group.views, ["all", "en", "es"])) {
    return false;
  }
  for (const count of Object.values(group.views)) {
    if (!Number.isSafeInteger(count) || count < 0) return false;
  }
  const languageTotal = group.views.en + group.views.es;
  return Number.isSafeInteger(languageTotal) && group.views.all === languageTotal;
}

function sanitizeBuilderArticleViewsGroup(group) {
  return isValidBuilderArticleViewsGroup(group) ? group : null;
}

function isValidNewsletterEmailsSentGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "basis", "collectedAt", "scopeId", "publication", "sent"]) ||
      group.definitionVersion !== 1 || group.basis !== "cumulative" || typeof group.collectedAt !== "string") {
    return false;
  }
  const collected = Date.parse(group.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== group.collectedAt ||
      typeof group.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(group.scopeId) ||
      !exactKeys(group.publication, ["id", "label", "language"]) ||
      group.publication.id !== NEWSLETTER_PUBLICATION.id || group.publication.label !== NEWSLETTER_PUBLICATION.label ||
      group.publication.language !== "en") {
    return false;
  }
  return Number.isSafeInteger(group.sent) && group.sent >= 0;
}

function sanitizeNewsletterEmailsSentGroup(group) {
  return isValidNewsletterEmailsSentGroup(group) ? group : null;
}

function isValidNewsletterEngagementRecord(record, valueKey) {
  if (!exactKeys(record, ["basis", "collectedAt", "scopeId", "publication", "timeZone", "startDate", "endDate", valueKey]) ||
      record.basis !== "period" || typeof record.collectedAt !== "string") {
    return false;
  }
  const collected = Date.parse(record.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== record.collectedAt ||
      typeof record.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(record.scopeId) ||
      !exactKeys(record.publication, ["id", "label", "language"]) ||
      record.publication.id !== NEWSLETTER_PUBLICATION.id || record.publication.label !== NEWSLETTER_PUBLICATION.label ||
      record.publication.language !== "en" || record.timeZone !== "UTC" ||
      !isRealIsoDate(record.startDate) || !isRealIsoDate(record.endDate) || record.startDate > record.endDate) {
    return false;
  }
  return Number.isSafeInteger(record[valueKey]) && record[valueKey] >= 0;
}

function sanitizeNewsletterEngagementGroup(group, valueKey) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 || !isObject(group.records)) {
    return null;
  }
  const records = {};
  for (const period of NEWSLETTER_ENGAGEMENT_PERIODS) {
    if (Object.hasOwn(group.records, period) && isValidNewsletterEngagementRecord(group.records[period], valueKey)) {
      records[period] = group.records[period];
    }
  }
  return Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null;
}

function isValidNewsletterEngagementGroup(group, valueKey) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 ||
      !isObject(group.records) || Object.keys(group.records).length === 0) {
    return false;
  }
  return Object.entries(group.records).every(([period, record]) =>
    NEWSLETTER_ENGAGEMENT_PERIODS.includes(period) && isValidNewsletterEngagementRecord(record, valueKey));
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

function isValidDirectoryViewRecord(record, period) {
  if (!DIRECTORY_VIEWS_PERIODS.includes(period)) return false;
  if (!exactKeys(record, ["basis", "collectedAt", "scopeId", "publication", "timeZone", "startDate", "endDate", "views", "qualifications"])) {
    return false;
  }
  const expectedBasis = period === "total" ? "recorded-total" : "period";
  if (record.basis !== expectedBasis || typeof record.collectedAt !== "string") return false;
  const collected = Date.parse(record.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== record.collectedAt) return false;
  if (typeof record.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(record.scopeId)) return false;
  if (!exactKeys(record.publication, ["id", "label", "language"]) ||
      record.publication.id !== DIRECTORY_ANALYTICS_PUBLICATION.id ||
      record.publication.label !== DIRECTORY_ANALYTICS_PUBLICATION.label ||
      record.publication.language !== "es") {
    return false;
  }
  if (!isValidIanaTimeZone(record.timeZone) || !isRealIsoDate(record.startDate) ||
      !isRealIsoDate(record.endDate) || record.startDate > record.endDate ||
      !Number.isSafeInteger(record.views) || record.views < 0 || !Array.isArray(record.qualifications)) {
    return false;
  }
  const qualifications = new Set();
  for (const qualification of record.qualifications) {
    if (typeof qualification !== "string" || !GOOGLE_VIEW_QUALIFICATIONS.has(qualification) || qualifications.has(qualification)) {
      return false;
    }
    qualifications.add(qualification);
  }
  return true;
}

function sanitizeDirectoryViewsGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 || !isObject(group.records)) {
    return null;
  }
  const records = {};
  for (const period of DIRECTORY_VIEWS_PERIODS) {
    if (Object.hasOwn(group.records, period) && isValidDirectoryViewRecord(group.records[period], period)) {
      records[period] = group.records[period];
    }
  }
  return Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null;
}

function isValidDirectoryViewsGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 ||
      !isObject(group.records) || Object.keys(group.records).length === 0) {
    return false;
  }
  return Object.entries(group.records).every(([period, record]) =>
    DIRECTORY_VIEWS_PERIODS.includes(period) && isValidDirectoryViewRecord(record, period));
}

function isValidDirectoryOutboundClickRecord(record, period) {
  if (!DIRECTORY_VIEWS_PERIODS.includes(period)) return false;
  if (!exactKeys(record, ["basis", "collectedAt", "scopeId", "publication", "timeZone", "startDate", "endDate", "clicks", "qualifications"])) {
    return false;
  }
  const expectedBasis = period === "total" ? "recorded-total" : "period";
  if (record.basis !== expectedBasis || typeof record.collectedAt !== "string") return false;
  const collected = Date.parse(record.collectedAt);
  if (!Number.isFinite(collected) || new Date(collected).toISOString() !== record.collectedAt) return false;
  if (typeof record.scopeId !== "string" || !/^[a-f0-9]{64}$/.test(record.scopeId)) return false;
  if (!exactKeys(record.publication, ["id", "label", "language"]) ||
      record.publication.id !== DIRECTORY_ANALYTICS_PUBLICATION.id ||
      record.publication.label !== DIRECTORY_ANALYTICS_PUBLICATION.label ||
      record.publication.language !== "es") {
    return false;
  }
  if (!isValidIanaTimeZone(record.timeZone) || !isRealIsoDate(record.startDate) ||
      !isRealIsoDate(record.endDate) || record.startDate > record.endDate ||
      !Number.isSafeInteger(record.clicks) || record.clicks < 0 || !Array.isArray(record.qualifications)) {
    return false;
  }
  const qualifications = new Set();
  for (const qualification of record.qualifications) {
    if (typeof qualification !== "string" || !GOOGLE_VIEW_QUALIFICATIONS.has(qualification) || qualifications.has(qualification)) {
      return false;
    }
    qualifications.add(qualification);
  }
  return true;
}

function sanitizeDirectoryOutboundClicksGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 || !isObject(group.records)) {
    return null;
  }
  const records = {};
  for (const period of DIRECTORY_VIEWS_PERIODS) {
    if (Object.hasOwn(group.records, period) && isValidDirectoryOutboundClickRecord(group.records[period], period)) {
      records[period] = group.records[period];
    }
  }
  return Object.keys(records).length > 0 ? { definitionVersion: 1, records } : null;
}

function isValidDirectoryOutboundClicksGroup(group) {
  if (!exactKeys(group, ["definitionVersion", "records"]) || group.definitionVersion !== 1 ||
      !isObject(group.records) || Object.keys(group.records).length === 0) {
    return false;
  }
  return Object.entries(group.records).every(([period, record]) =>
    DIRECTORY_VIEWS_PERIODS.includes(period) && isValidDirectoryOutboundClickRecord(record, period));
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
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter", "newsletterEmailsSent", "articleViews", "directoryViews", "directoryOutboundClicks", "articleSearchClicks", "newsletterEmailOpens", "newsletterEmailVerifiedClicks", "builderArticleViews"]);
  if (families.length < 1 || families.some((family) => !supportedFamilies.has(family))) {
    throw fail("OUTPUT_SCHEMA_INVALID");
  }
  for (const family of families) {
    const valid = family === "newsletter"
      ? isValidNewsletterGroup(output.groups[family])
      : family === "newsletterEmailsSent"
        ? isValidNewsletterEmailsSentGroup(output.groups[family])
      : family === "articleViews"
        ? isValidArticleViewsGroup(output.groups[family])
        : family === "builderArticleViews"
          ? isValidBuilderArticleViewsGroup(output.groups[family])
        : family === "directoryViews"
          ? isValidDirectoryViewsGroup(output.groups[family])
          : family === "directoryOutboundClicks"
            ? isValidDirectoryOutboundClicksGroup(output.groups[family])
            : family === "articleSearchClicks"
              ? isValidArticleSearchClicksGroup(output.groups[family])
              : family === "newsletterEmailOpens"
                ? isValidNewsletterEngagementGroup(output.groups[family], "opens")
                : family === "newsletterEmailVerifiedClicks"
                  ? isValidNewsletterEngagementGroup(output.groups[family], "clicks")
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
  const supportedFamilies = new Set(["articles", "talks", "books", "newsletter", "newsletterEmailsSent", "articleViews", "directoryViews", "directoryOutboundClicks", "articleSearchClicks", "newsletterEmailOpens", "newsletterEmailVerifiedClicks", "builderArticleViews"]);
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
    if (family === "builderArticleViews") {
      const sanitized = sanitizeBuilderArticleViewsGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "directoryViews") {
      const sanitized = sanitizeDirectoryViewsGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "directoryOutboundClicks") {
      const sanitized = sanitizeDirectoryOutboundClicksGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "articleSearchClicks") {
      const sanitized = sanitizeArticleSearchClicksGroup(previous.groups[family]);
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "newsletterEmailOpens" || family === "newsletterEmailVerifiedClicks") {
      const sanitized = sanitizeNewsletterEngagementGroup(previous.groups[family],
        family === "newsletterEmailOpens" ? "opens" : "clicks");
      if (sanitized) groups[family] = sanitized;
      continue;
    }
    if (family === "newsletterEmailsSent") {
      const sanitized = sanitizeNewsletterEmailsSentGroup(previous.groups[family]);
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
  const builderSource = configuration.sources.find(({ id }) => id === "builder-center");
  let builderCollection;
  let builderCollectionPromise;
  const getBuilderCollection = () => {
    if (!builderCollectionPromise) {
      builderCollectionPromise = collectBuilderCenter(builderSource, now, true).then((collection) => {
        builderCollection = collection;
        return collection;
      });
    }
    return builderCollectionPromise;
  };
  let articleCollection;
  let articleViewsResult;
  let directoryViewsResult;
  let directoryOutboundClicksResult;
  let articleSearchClicksResult;
  let newsletterEmailOpensResult;
  let newsletterEmailVerifiedClicksResult;
  try {
    articleCollection = await collectPublications(configuration.sources, now, env, getBuilderCollection);
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

  try {
    const collection = await getBuilderCollection();
    groups.builderArticleViews = makeBuilderArticleViewsGroup(builderSource, collection.viewCandidates, collectedAt);
  } catch (error) {
    if (!(error instanceof CollectorError)) throw error;
    failures.builderArticleViews = error.code;
  }

  if (configuration.schemaVersion === 4 || configuration.schemaVersion === 5 || configuration.schemaVersion === 6 ||
      ((configuration.schemaVersion === 7 || configuration.schemaVersion === 8 || configuration.schemaVersion === 9 || configuration.schemaVersion === 10) &&
        configuration.newsletter !== undefined)) {
    let newsletterSelection;
    try {
      newsletterSelection = validateNewsletterSelection(configuration.newsletter);
      const newsletter = await collectNewsletter(newsletterSelection, env, collectedAt);
      if (newsletter.newsletter) groups.newsletter = newsletter.newsletter;
      else failures.newsletter = newsletter.newsletterFailure;
      if (newsletterSelection.language === "en") {
        if (newsletter.newsletterEmailsSent) groups.newsletterEmailsSent = newsletter.newsletterEmailsSent;
        else failures.newsletterEmailsSent = newsletter.newsletterEmailsSentFailure;
      }
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      failures.newsletter = error.code;
      if (newsletterSelection?.language === "en") failures.newsletterEmailsSent = error.code;
    }
  }

  if (configuration.newsletterEngagements === true) {
    const eligiblePeriods = newsletterEngagementRanges(now).map(({ period }) => period);
    const failedResult = (code) => ({ group: null, failedPeriods: eligiblePeriods, eligiblePeriods, failureCode: code });
    try {
      const result = await collectNewsletterEngagements(configuration.newsletter, env, collectedAt, now);
      newsletterEmailOpensResult = result.opens;
      newsletterEmailVerifiedClicksResult = result.verifiedClicks;
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      newsletterEmailOpensResult = failedResult(error.code);
      newsletterEmailVerifiedClicksResult = failedResult(error.code);
    }
    if (newsletterEmailOpensResult.group) groups.newsletterEmailOpens = newsletterEmailOpensResult.group;
    if (newsletterEmailOpensResult.failedPeriods.length > 0) {
      failures.newsletterEmailOpens = newsletterEmailOpensResult.failureCode ?? "BEEHIIV_ENGAGEMENT_REPORT_FAILED";
    }
    if (newsletterEmailVerifiedClicksResult.group) {
      groups.newsletterEmailVerifiedClicks = newsletterEmailVerifiedClicksResult.group;
    }
    if (newsletterEmailVerifiedClicksResult.failedPeriods.length > 0) {
      failures.newsletterEmailVerifiedClicks = newsletterEmailVerifiedClicksResult.failureCode ?? "BEEHIIV_ENGAGEMENT_REPORT_FAILED";
    }
  }

  if (configuration.schemaVersion === 5 || configuration.schemaVersion === 6 || configuration.schemaVersion === 10 ||
      ((configuration.schemaVersion === 7 || configuration.schemaVersion === 8 || configuration.schemaVersion === 9) &&
        configuration.directoryAnalytics !== undefined)) {
    try {
      const googleMetrics = await collectGoogleMetrics(configuration, env, collectedAt, now);
      articleViewsResult = googleMetrics.articleViews;
      directoryViewsResult = googleMetrics.directoryViews;
      directoryOutboundClicksResult = googleMetrics.directoryOutboundClicks;
      articleSearchClicksResult = googleMetrics.articleSearchClicks;
      if (articleViewsResult?.group) groups.articleViews = articleViewsResult.group;
      if (articleViewsResult?.failedPeriods.length > 0) {
        failures.articleViews = articleViewsResult.failureCode ?? "ANALYTICS_REPORT_FAILED";
      }
      if (directoryViewsResult?.group) groups.directoryViews = directoryViewsResult.group;
      if (directoryViewsResult?.failedPeriods.length > 0) {
        failures.directoryViews = directoryViewsResult.failureCode ?? "DIRECTORY_ANALYTICS_REPORT_FAILED";
      }
      if (directoryOutboundClicksResult?.group) groups.directoryOutboundClicks = directoryOutboundClicksResult.group;
      if (directoryOutboundClicksResult?.failedPeriods.length > 0) {
        failures.directoryOutboundClicks = directoryOutboundClicksResult.failureCode ?? "DIRECTORY_OUTBOUND_CLICKS_REPORT_FAILED";
      }
      if (articleSearchClicksResult?.group) groups.articleSearchClicks = articleSearchClicksResult.group;
      if (articleSearchClicksResult?.failedPeriods.length > 0) {
        failures.articleSearchClicks = articleSearchClicksResult.failureCode ?? "SEARCH_CONSOLE_REPORT_FAILED";
      }
    } catch (error) {
      if (!(error instanceof CollectorError)) throw error;
      if (configuration.analytics !== undefined) {
        articleViewsResult = {
          group: null,
          failedPeriods: [],
          eligiblePeriods: supportedGoogleViewRanges(configuration.analytics, now).map(({ period }) => period)
        };
        articleViewsResult.failedPeriods = articleViewsResult.eligiblePeriods;
        failures.articleViews = error.code;
      }
      if (configuration.directoryAnalytics !== undefined) {
        directoryViewsResult = {
          group: null,
          failedPeriods: [],
          eligiblePeriods: supportedDirectoryViewRanges(configuration.directoryAnalytics, now).map(({ period }) => period)
        };
        directoryViewsResult.failedPeriods = directoryViewsResult.eligiblePeriods;
        failures.directoryViews = error.code;
      }
      if (configuration.directoryOutboundClicks === true) {
        directoryOutboundClicksResult = {
          group: null,
          failedPeriods: [],
          eligiblePeriods: supportedDirectoryViewRanges(configuration.directoryAnalytics, now).map(({ period }) => period)
        };
        directoryOutboundClicksResult.failedPeriods = directoryOutboundClicksResult.eligiblePeriods;
        failures.directoryOutboundClicks = error.code;
      }
      if (configuration.searchConsole !== undefined) {
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
        if (family === "articleViews" || family === "directoryViews" || family === "directoryOutboundClicks" ||
            family === "articleSearchClicks" || family === "newsletterEmailOpens" ||
            family === "newsletterEmailVerifiedClicks") {
          const result = family === "articleViews"
            ? articleViewsResult
            : family === "directoryViews" ? directoryViewsResult
              : family === "directoryOutboundClicks" ? directoryOutboundClicksResult
                : family === "articleSearchClicks" ? articleSearchClicksResult
                  : family === "newsletterEmailOpens" ? newsletterEmailOpensResult : newsletterEmailVerifiedClicksResult;
          const prior = previousGroups[family];
          const eligiblePeriods = new Set(result?.eligiblePeriods ?? []);
          const timeZone = family === "articleViews"
            ? configuration.analytics.timeZone
            : family === "directoryViews" || family === "directoryOutboundClicks"
              ? configuration.directoryAnalytics.timeZone
              : family === "newsletterEmailOpens" || family === "newsletterEmailVerifiedClicks" ? "UTC" : GOOGLE_SEARCH_TIME_ZONE;
          const currentYtdStart = `${(timeZone === "UTC" ? new Date(now).toISOString().slice(0, 10)
            : localDateAt(timeZone, now)).slice(0, 4)}-01-01`;
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
    pagesBySource: articleCollection?.pagesBySource ?? (builderCollection ? { "builder-center": builderCollection.pages } : {}),
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
    return configuration.schemaVersion === 3 || configuration.schemaVersion === 4 || configuration.schemaVersion === 5 ||
      configuration.schemaVersion === 6 || configuration.schemaVersion === 7 || configuration.schemaVersion === 8 ||
      configuration.schemaVersion === 9 || configuration.schemaVersion === 10
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
