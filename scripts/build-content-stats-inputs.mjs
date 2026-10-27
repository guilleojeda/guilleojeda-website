import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TALK_KINDS = new Set([
  'talk',
  'workshop',
  'training',
  'panel',
  'session',
  'hosting',
  'podcast',
  'commentary',
  'conversation',
  'unknown'
]);
const TALK_STATUSES = new Set(['delivered', 'scheduled', 'unknown']);
const BOOK_STATUSES = new Set(['published', 'in-progress', 'unknown']);
const LANGUAGES = new Set(['en', 'es', null]);
const ARTICLE_SOURCE_IDS = new Set(['caylent', 'builder-center', 'simple-aws', 'cloudy-things', 'donde-aprendo-aws', 'aws-for-engineers']);
const REQUIRED_ARTICLE_SOURCE_IDS = ['caylent', 'builder-center'];
const BUILDER_VIEWS_START_AT = '2026-01-06T00:00:00.000Z';
const MANUAL_ARTICLE_SOURCE_IDS = new Set(['dev-community', 'linkedin-articles', 'spainclouds', 'hackernoon']);
const EXCLUSION_SOURCE_HOSTS = Object.freeze({
  caylent: ['caylent.com'],
  'builder-center': ['builder.aws.com'],
  'simple-aws': ['newsletter.simpleaws.dev'],
  'cloudy-things': ['blog.guilleojeda.com'],
  'donde-aprendo-aws': ['dondeaprendoaws.com'],
  'aws-for-engineers': ['awsforengineers.com'],
  'dev-community': ['dev.to'],
  'linkedin-articles': ['www.linkedin.com', 'es.linkedin.com'],
  spainclouds: ['spainclouds.com', 'www.spainclouds.com'],
  hackernoon: ['hackernoon.com'],
  medium: ['medium.com']
});

function invalid(message) {
  throw new Error(`Invalid content statistics input: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${label} must be a non-empty string`);
}

function assertLanguage(value, label) {
  if (!LANGUAGES.has(value)) invalid(`${label} must be en, es, or null`);
}

function isRealCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function articlePublicationInstant(value, label) {
  if (typeof value !== 'string') invalid(`${label} must be a real date, explicit-timezone timestamp, or null`);
  if (isRealCalendarDate(value)) return Date.parse(`${value}T00:00:00.000Z`);
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !isRealCalendarDate(match[1])) invalid(`${label} must be a real date or explicit-timezone timestamp`);
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) invalid(`${label} must be a real date or explicit-timezone timestamp`);
  return instant;
}

function isArticleDestinationPath(sourceId, pathname) {
  if (sourceId === 'caylent') return /^\/blog\/.+/.test(pathname);
  if (sourceId === 'builder-center') return /^\/content\/[^/]+\/.+/.test(pathname);
  if (sourceId === 'simple-aws') return /^\/p\/[^/]+$/.test(pathname);
  if (sourceId === 'cloudy-things') {
    return /^\/[^/]+$/.test(pathname) && !['/archive', '/rss.xml', '/sitemap.xml', '/recommendations'].includes(pathname);
  }
  if (sourceId === 'donde-aprendo-aws' || sourceId === 'aws-for-engineers') {
    return /^\/blog\/[^/]+$/.test(pathname);
  }
  if (sourceId === 'dev-community') return /^\/[^/]+\/.+/.test(pathname);
  if (sourceId === 'linkedin-articles') return /^\/pulse\/.+/.test(pathname);
  if (sourceId === 'spainclouds') return /^\/blog\/.+/.test(pathname);
  if (sourceId === 'hackernoon' || sourceId === 'medium') return /^\/.+/.test(pathname);
  return false;
}

function normalizedArticleDestination(sourceId, value, label) {
  assertNonEmptyString(value, label);
  if (value.trim() !== value) invalid(`${label} must be a canonical public URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invalid(`${label} must be a canonical public URL`);
  }
  const hosts = EXCLUSION_SOURCE_HOSTS[sourceId];
  if (!hosts || parsed.protocol !== 'https:' || !hosts.includes(parsed.hostname.toLowerCase()) ||
      parsed.username !== '' || parsed.password !== '' || parsed.port !== '' ||
      parsed.search !== '' || parsed.hash !== '' || parsed.pathname === '/') {
    invalid(`${label} must use the public URL host for ${sourceId} without credentials, query, fragment, or alternate port`);
  }
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname === '' || pathname.includes('//') || /%(?:2f|5c)/i.test(pathname)) {
    invalid(`${label} must identify a public article destination`);
  }
  if (!isArticleDestinationPath(sourceId, pathname)) {
    invalid(`${label} must identify an article path for ${sourceId}`);
  }
  return `${parsed.origin}${pathname}`;
}

function projectArticles(articles) {
  assertObject(articles, 'articles');
  if (Object.keys(articles).sort().join(',') !== 'exclusions,publications' ||
      !Array.isArray(articles.publications) || !Array.isArray(articles.exclusions)) {
    invalid('articles must contain only publication and exclusion arrays');
  }

  const publicationUrls = new Set();
  const publications = articles.publications.map((record, index) => {
    assertObject(record, `article publication ${index}`);
    if (Object.keys(record).sort().join(',') !== 'language,publishedAt,sourceId,title,url' ||
        !MANUAL_ARTICLE_SOURCE_IDS.has(record.sourceId)) {
      invalid(`article publication ${index} must use a supported individually maintained source and exact fields`);
    }
    if (typeof record.title !== 'string' || !/[^\s\p{White_Space}]/u.test(record.title)) {
      invalid(`article publication ${index} title must contain non-whitespace text`);
    }
    if (!['en', 'es'].includes(record.language)) invalid(`article publication ${index} language must be en or es`);
    if (record.publishedAt !== null) {
      const publishedAt = articlePublicationInstant(record.publishedAt, `article publication ${index} publishedAt`);
      if (publishedAt > Date.now()) invalid(`article publication ${index} cannot be future-dated`);
    }
    const destination = normalizedArticleDestination(record.sourceId, record.url, `article publication ${index} url`);
    const key = `${record.sourceId}\u0000${destination}`;
    if (publicationUrls.has(key)) invalid(`duplicate article publication destination at index ${index}`);
    publicationUrls.add(key);
    return {
      sourceId: record.sourceId,
      title: record.title,
      language: record.language,
      publishedAt: record.publishedAt,
      url: record.url
    };
  });

  const exclusionUrls = new Set();
  const exclusions = articles.exclusions.map((record, index) => {
    assertObject(record, `article exclusion ${index}`);
    if (Object.keys(record).sort().join(',') !== 'reason,sourceId,title,url' ||
        !Object.hasOwn(EXCLUSION_SOURCE_HOSTS, record.sourceId)) {
      invalid(`article exclusion ${index} must use a known source and exact editorial fields`);
    }
    assertNonEmptyString(record.title, `article exclusion ${index} title`);
    assertNonEmptyString(record.reason, `article exclusion ${index} reason`);
    const destination = normalizedArticleDestination(record.sourceId, record.url, `article exclusion ${index} url`);
    const key = `${record.sourceId}\u0000${destination}`;
    if (exclusionUrls.has(key)) invalid(`duplicate article exclusion destination at index ${index}`);
    if (publicationUrls.has(key)) invalid(`article destination cannot be both included and excluded`);
    exclusionUrls.add(key);
    return { sourceId: record.sourceId, url: record.url };
  });

  return { publications, exclusions };
}

function validateArticleConfig(articleConfig) {
  assertObject(articleConfig, 'articleConfig');
  if (articleConfig.schemaVersion !== 2) invalid(`unsupported article schema version ${articleConfig.schemaVersion}`);
  if (articleConfig.definitionVersion !== 1) invalid(`unsupported article definition version ${articleConfig.definitionVersion}`);
  if (!Array.isArray(articleConfig.sources)) invalid('articleConfig.sources must be an array');

  const sourceIds = new Set();
  for (const [index, source] of articleConfig.sources.entries()) {
    assertObject(source, `article source ${index}`);
    assertNonEmptyString(source.id, `article source ${index} id`);
    if (!ARTICLE_SOURCE_IDS.has(source.id)) invalid(`unsupported article source ID ${source.id}`);
    if (sourceIds.has(source.id)) invalid(`duplicate article source ID ${source.id}`);
    if (source.id === 'simple-aws'
      && (Object.keys(source).length !== 1 || !Object.hasOwn(source, 'id'))) {
      invalid('Simple AWS article source must contain only its id');
    }
    if (source.id === 'donde-aprendo-aws'
      && (Object.keys(source).length !== 1 || !Object.hasOwn(source, 'id'))) {
      invalid('Dónde Aprendo AWS article source must contain only its id');
    }
    if (source.id === 'aws-for-engineers'
      && (Object.keys(source).length !== 1 || !Object.hasOwn(source, 'id'))) {
      invalid('AWS for Engineers article source must contain only its id');
    }
    if (source.id === 'cloudy-things') {
      const keys = Object.keys(source).sort();
      if (keys.join(',') !== 'authorName,id,language') {
        invalid('Cloudy Things article source must contain only its author and language selectors');
      }
      assertNonEmptyString(source.authorName, `article source ${index} authorName`);
      if (source.language !== 'en') invalid('Cloudy Things article source requires English language');
    }
    sourceIds.add(source.id);
  }

  for (const requiredId of REQUIRED_ARTICLE_SOURCE_IDS) {
    if (!sourceIds.has(requiredId)) invalid(`article sources must include ${requiredId}`);
  }
  return sourceIds;
}

function projectTalks(talks) {
  if (!Array.isArray(talks)) invalid('talks must be an array');

  const recordIds = new Set();
  const factIds = new Set();
  return talks.flatMap((record, recordIndex) => {
    assertObject(record, `talk record ${recordIndex}`);
    assertNonEmptyString(record.id, `talk record ${recordIndex} id`);
    if (recordIds.has(record.id)) invalid(`duplicate talk record ID ${record.id}`);
    recordIds.add(record.id);
    if (!Array.isArray(record.occurrences) || record.occurrences.length === 0) {
      invalid(`talk record ${record.id} is missing occurrence metadata`);
    }

    const occurrenceIds = new Set();
    return record.occurrences.map((occurrence, occurrenceIndex) => {
      assertObject(occurrence, `${record.id} occurrence ${occurrenceIndex}`);
      assertNonEmptyString(occurrence.id, `${record.id} occurrence ${occurrenceIndex} id`);
      if (occurrenceIds.has(occurrence.id)) invalid(`duplicate occurrence ID ${record.id}/${occurrence.id}`);
      occurrenceIds.add(occurrence.id);
      if (!TALK_KINDS.has(occurrence.kind)) invalid(`invalid occurrence kind for ${record.id}/${occurrence.id}`);
      if (!TALK_STATUSES.has(occurrence.status)) invalid(`invalid occurrence status for ${record.id}/${occurrence.id}`);
      if (!Object.hasOwn(occurrence, 'language')) invalid(`missing occurrence language for ${record.id}/${occurrence.id}`);
      assertLanguage(occurrence.language, `${record.id}/${occurrence.id} language`);

      const id = `${record.id}/${occurrence.id}`;
      if (factIds.has(id)) invalid(`duplicate occurrence fact ID ${id}`);
      factIds.add(id);
      return { id, kind: occurrence.kind, status: occurrence.status, language: occurrence.language };
    });
  });
}

function projectBooks(books) {
  if (!Array.isArray(books)) invalid('books must be an array');

  const bookIds = new Set();
  return books.map((book, index) => {
    assertObject(book, `book record ${index}`);
    assertNonEmptyString(book.id, `book record ${index} id`);
    if (bookIds.has(book.id)) invalid(`duplicate book ID ${book.id}`);
    bookIds.add(book.id);
    assertObject(book.publication, `book ${book.id} publication metadata`);
    if (!BOOK_STATUSES.has(book.publication.status)) invalid(`invalid publication status for ${book.id}`);
    if (!Object.hasOwn(book.publication, 'language')) invalid(`missing publication language for ${book.id}`);
    assertLanguage(book.publication.language, `${book.id} publication language`);
    return { id: book.id, status: book.publication.status, language: book.publication.language };
  });
}

function projectNewsletter(newsletter) {
  assertObject(newsletter, 'newsletter');
  const keys = Object.keys(newsletter).sort();
  if (keys.join(',') !== 'id,language,publicationId') invalid('newsletter must contain only id, publicationId, and language');
  if (newsletter.id !== 'simple-aws') invalid('unsupported newsletter id');
  assertNonEmptyString(newsletter.publicationId, 'newsletter publicationId');
  if (!['en', 'es'].includes(newsletter.language)) invalid('newsletter language must be en or es');
  return { id: newsletter.id, publicationId: newsletter.publicationId, language: newsletter.language };
}

function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isTimeZone(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const resolvedTimeZone = new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
    return !/^[+-]/.test(resolvedTimeZone);
  } catch {
    return false;
  }
}

function projectAnalytics(analytics) {
  assertObject(analytics, 'analytics');
  const keys = Object.keys(analytics).sort();
  const requiredKeys = ['articlePathPattern', 'hostname', 'id', 'language', 'propertyId', 'timeZone'];
  const expectedKeys = Object.hasOwn(analytics, 'recordedSince')
    ? [...requiredKeys, 'recordedSince'].sort()
    : requiredKeys;
  if (keys.join(',') !== expectedKeys.join(',')) invalid('analytics must contain only the supported selectors and optional recordedSince');
  if (analytics.id !== 'simple-aws') invalid('unsupported analytics publication id');
  if (typeof analytics.propertyId !== 'string' || !/^\d+$/.test(analytics.propertyId)) {
    invalid('analytics propertyId must be a decimal string');
  }
  if (analytics.language !== 'en') invalid('analytics language must be en');
  if (analytics.hostname !== 'newsletter.simpleaws.dev') invalid('unsupported analytics hostname');
  if (analytics.articlePathPattern !== '/p/[^/]+/?') invalid('unsupported analytics article path pattern');
  if (!isTimeZone(analytics.timeZone)) invalid('analytics timeZone must be a valid IANA time zone');
  if (Object.hasOwn(analytics, 'recordedSince') && !isRealDate(analytics.recordedSince)) {
    invalid('analytics recordedSince must be a real YYYY-MM-DD date');
  }

  const result = {
    id: analytics.id,
    propertyId: analytics.propertyId,
    language: analytics.language,
    hostname: analytics.hostname,
    articlePathPattern: analytics.articlePathPattern,
    timeZone: analytics.timeZone
  };
  if (Object.hasOwn(analytics, 'recordedSince')) result.recordedSince = analytics.recordedSince;
  return result;
}

function projectSearchConsole(searchConsole) {
  assertObject(searchConsole, 'searchConsole');
  const keys = Object.keys(searchConsole).sort();
  const expectedKeys = ['availableSince', 'articleUrlPattern', 'id', 'language', 'siteUrl'].sort();
  if (keys.join(',') !== expectedKeys.join(',')) {
    invalid('searchConsole must contain only the supported selectors and history boundary');
  }
  if (searchConsole.id !== 'simple-aws') invalid('unsupported searchConsole publication id');
  if (searchConsole.siteUrl !== 'sc-domain:simpleaws.dev') invalid('unsupported searchConsole site property');
  if (searchConsole.language !== 'en') invalid('searchConsole language must be en');
  if (searchConsole.articleUrlPattern !== String.raw`(?-i)^https://newsletter\.simpleaws\.dev/p/[^/?#]+/?$`) {
    invalid('unsupported searchConsole article URL pattern');
  }
  if (!isRealDate(searchConsole.availableSince)) {
    invalid('searchConsole availableSince must be a real YYYY-MM-DD date');
  }

  return {
    id: searchConsole.id,
    siteUrl: searchConsole.siteUrl,
    language: searchConsole.language,
    articleUrlPattern: searchConsole.articleUrlPattern,
    availableSince: searchConsole.availableSince
  };
}

function projectDirectoryAnalytics(directoryAnalytics) {
  assertObject(directoryAnalytics, 'directoryAnalytics');
  const keys = Object.keys(directoryAnalytics).sort();
  const requiredKeys = ['hostname', 'id', 'language', 'propertyId', 'timeZone'];
  const hasOutboundClicks = Object.hasOwn(directoryAnalytics, 'outboundClicks');
  const hasRecordedSince = Object.hasOwn(directoryAnalytics, 'recordedSince');
  const expectedKeys = [
    ...requiredKeys,
    ...(hasOutboundClicks ? ['outboundClicks'] : []),
    ...(hasRecordedSince ? ['recordedSince'] : [])
  ].sort();
  if (keys.join(',') !== expectedKeys.join(',')) {
    invalid('directoryAnalytics must contain only the supported directory scope selectors and optional outboundClicks flag and recordedSince date');
  }
  if (directoryAnalytics.id !== 'donde-aprendo-aws') invalid('unsupported directoryAnalytics publication id');
  if (typeof directoryAnalytics.propertyId !== 'string' || !/^\d+$/.test(directoryAnalytics.propertyId)) {
    invalid('directoryAnalytics propertyId must be a decimal string');
  }
  if (directoryAnalytics.hostname !== 'dondeaprendoaws.com') {
    invalid('unsupported directoryAnalytics hostname');
  }
  if (directoryAnalytics.language !== 'es') invalid('directoryAnalytics language must be es');
  if (!isTimeZone(directoryAnalytics.timeZone)) {
    invalid('directoryAnalytics timeZone must be a valid IANA time zone');
  }
  if (hasOutboundClicks && directoryAnalytics.outboundClicks !== true) {
    invalid('directoryAnalytics outboundClicks must be the literal true opt-in');
  }
  if (hasRecordedSince && !isRealDate(directoryAnalytics.recordedSince)) {
    invalid('directoryAnalytics recordedSince must be a real YYYY-MM-DD date');
  }

  const result = {
    id: directoryAnalytics.id,
    propertyId: directoryAnalytics.propertyId,
    hostname: directoryAnalytics.hostname,
    language: directoryAnalytics.language,
    timeZone: directoryAnalytics.timeZone
  };
  if (hasOutboundClicks) result.outboundClicks = true;
  if (hasRecordedSince) result.recordedSince = directoryAnalytics.recordedSince;
  return result;
}

function projectBuilderArticleViews(value) {
  assertObject(value, 'builderArticleViews');
  if (Object.keys(value).sort().join(',') !== 'observedAt,views') {
    invalid('builderArticleViews must contain only observedAt and views');
  }
  if (typeof value.observedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedAt)) {
    invalid('builderArticleViews observedAt must be a canonical UTC ISO timestamp with milliseconds');
  }
  const observedAt = Date.parse(value.observedAt);
  if (!Number.isFinite(observedAt) || new Date(observedAt).toISOString() !== value.observedAt ||
      observedAt < Date.parse(BUILDER_VIEWS_START_AT) || observedAt > Date.now()) {
    invalid('builderArticleViews observedAt must be real, no earlier than 2026-01-06, and not in the future');
  }
  assertObject(value.views, 'builderArticleViews views');
  if (Object.keys(value.views).sort().join(',') !== 'en,es') {
    invalid('builderArticleViews views must contain only en and es');
  }
  const { en, es } = value.views;
  if (!Number.isSafeInteger(en) || en < 0 || !Number.isSafeInteger(es) || es < 0 ||
      !Number.isSafeInteger(en + es)) {
    invalid('builderArticleViews language totals and their sum must be safe nonnegative integers');
  }
  return { observedAt: value.observedAt, views: { en, es } };
}

export function buildContentStatsInputs({ articleConfig, talks, books, articles } = {}) {
  const sourceIds = validateArticleConfig(articleConfig);
  const hasNewsletter = Object.hasOwn(articleConfig, 'newsletter');
  const hasAnalytics = Object.hasOwn(articleConfig, 'analytics');
  const hasSearchConsole = Object.hasOwn(articleConfig, 'searchConsole');
  const hasDirectoryAnalytics = Object.hasOwn(articleConfig, 'directoryAnalytics');
  const hasDirectoryRecordedSince = hasDirectoryAnalytics
    && articleConfig.directoryAnalytics
    && Object.hasOwn(articleConfig.directoryAnalytics, 'recordedSince');
  const hasDirectoryOutboundClicks = hasDirectoryAnalytics
    && articleConfig.directoryAnalytics
    && Object.hasOwn(articleConfig.directoryAnalytics, 'outboundClicks');
  const hasNewsletterEngagements = Object.hasOwn(articleConfig, 'newsletterEngagements');
  const hasBuilderArticleViews = Object.hasOwn(articleConfig, 'builderArticleViews');
  const hasArticleInventory = articles !== undefined;
  if (hasNewsletterEngagements && articleConfig.newsletterEngagements !== true) {
    invalid('newsletterEngagements must be the literal true opt-in');
  }
  if (hasAnalytics && !hasNewsletter) invalid('analytics requires the existing newsletter selection');
  if (hasSearchConsole && (!hasNewsletter || !hasAnalytics)) {
    invalid('searchConsole requires the existing newsletter and analytics selections');
  }
  if (sourceIds.has('simple-aws') && !hasNewsletter) {
    invalid('Simple AWS article source requires the existing newsletter selection');
  }

  const newsletter = hasNewsletter ? projectNewsletter(articleConfig.newsletter) : null;
  if (hasNewsletterEngagements && !newsletter) {
    invalid('newsletterEngagements requires the existing English newsletter selection');
  }
  if (hasNewsletterEngagements && newsletter.language !== 'en') {
    invalid('newsletterEngagements requires an English newsletter selection');
  }
  if (sourceIds.has('simple-aws') && newsletter.language !== 'en') {
    invalid('Simple AWS article source requires an English newsletter selection');
  }
  const directoryAnalytics = hasDirectoryAnalytics
    ? projectDirectoryAnalytics(articleConfig.directoryAnalytics)
    : null;
  const builderArticleViews = hasBuilderArticleViews
    ? projectBuilderArticleViews(articleConfig.builderArticleViews)
    : null;
  const articleInventory = hasArticleInventory ? projectArticles(articles) : null;

  return {
    schemaVersion: hasArticleInventory ? 12
      : hasBuilderArticleViews ? 11
      : hasNewsletterEngagements ? 10
      : hasDirectoryRecordedSince ? 9
      : hasDirectoryOutboundClicks ? 8
        : hasDirectoryAnalytics ? 7
          : hasSearchConsole ? 6
            : hasAnalytics ? 5
              : hasNewsletter ? 4 : 3,
    definitionVersion: 1,
    sources: structuredClone(articleConfig.sources),
    curated: {
      talks: projectTalks(talks),
      books: projectBooks(books)
    },
    ...(newsletter ? { newsletter } : {}),
    ...(hasNewsletterEngagements ? { newsletterEngagements: true } : {}),
    ...(hasAnalytics ? { analytics: projectAnalytics(articleConfig.analytics) } : {}),
    ...(hasSearchConsole ? { searchConsole: projectSearchConsole(articleConfig.searchConsole) } : {}),
    ...(directoryAnalytics ? { directoryAnalytics } : {}),
    ...(builderArticleViews ? { builderArticleViews } : {}),
    ...(articleInventory ? { articleInventory } : {})
  };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function buildFromMaintainedContent() {
  return buildContentStatsInputs({
    articleConfig: readJson('../public/_content-stats/inputs.json'),
    talks: readJson('../src/content/talks.json'),
    books: readJson('../src/content/books.json'),
    articles: readJson('../src/content/articles.json')
  });
}

function writeBuiltInputs() {
  const outputPath = fileURLToPath(new URL('../dist/_content-stats/inputs.json', import.meta.url));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(buildFromMaintainedContent(), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeBuiltInputs();
