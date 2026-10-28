const endpointPath = '/content-stats/v1/current.json';
const snapshotRequests = new Map();
const knownKinds = ['articles', 'talks', 'books', 'newsletter'];
const knownViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownSearchPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const knownDirectoryViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownDirectoryOutboundClickPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownNewsletterEmailPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const allowedKeys = {
  document: ['groups', 'schemaVersion'],
  group: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'],
  articleGroupV2: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'records', 'scopeId', 'sources'],
  articleRecord: ['id', 'title', 'language', 'publishedAt', 'publications'],
  articlePublication: ['sourceId', 'title', 'publishedAt', 'url', 'emailOnly'],
  counts: ['all', 'en', 'es'],
  source: ['id', 'label'],
  newsletterGroup: ['basis', 'collectedAt', 'definitionVersion', 'publication', 'scopeId', 'subscribers'],
  newsletterSentGroup: ['basis', 'collectedAt', 'definitionVersion', 'publication', 'scopeId', 'sent'],
  newsletterEmailGroup: ['definitionVersion', 'records'],
  newsletterEmailOpensRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'opens'],
  newsletterEmailVerifiedClicksRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'clicks'],
  publication: ['id', 'label', 'language'],
  articleViewsGroup: ['definitionVersion', 'records'],
  articleViewsRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'views', 'qualifications'],
  builderArticleViewsV1: ['basis', 'collectedAt', 'definitionVersion', 'scopeId', 'source', 'startDate', 'views'],
  builderArticleViewsV2: ['basis', 'definitionVersion', 'observedAt', 'provenance', 'scopeId', 'source', 'startDate', 'views'],
  builderArticleViews: ['all', 'en', 'es'],
  articleSearchClicksGroup: ['definitionVersion', 'records'],
  articleSearchClicksRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'clicks'],
  directoryViewsGroup: ['definitionVersion', 'records'],
  directoryViewsRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'views', 'qualifications'],
  directoryOutboundClicksGroup: ['definitionVersion', 'records'],
  directoryOutboundClicksRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'clicks', 'qualifications']
};
const supportedArticleSources = new Map([
  ['caylent', 'Caylent'],
  ['builder-center', 'AWS Builder Center'],
  ['simple-aws', 'Simple AWS'],
  ['cloudy-things', 'Cloudy Things'],
  ['donde-aprendo-aws', 'Dónde Aprendo AWS'],
  ['aws-for-engineers', 'AWS for Engineers'],
  ['dev-community', 'DEV Community'],
  ['linkedin-articles', 'LinkedIn'],
  ['spainclouds', 'SpainClouds'],
  ['hackernoon', 'HackerNoon']
]);
const supportedArticleSourceOrder = [...supportedArticleSources.keys()];
const supportedArticleSourceHosts = new Map([
  ['caylent', ['caylent.com']],
  ['builder-center', ['builder.aws.com']],
  ['simple-aws', ['newsletter.simpleaws.dev']],
  ['cloudy-things', ['blog.guilleojeda.com']],
  ['donde-aprendo-aws', ['dondeaprendoaws.com']],
  ['aws-for-engineers', ['awsforengineers.com']],
  ['dev-community', ['dev.to']],
  ['linkedin-articles', ['www.linkedin.com', 'es.linkedin.com']],
  ['spainclouds', ['spainclouds.com', 'www.spainclouds.com']],
  ['hackernoon', ['hackernoon.com']]
]);
// Keep Forem's reserved route collisions aligned with the build and collector validators.
const devReservedUsernames = new Set(['admin', 'curation', 'dashboard', 'feed', 'internal', 'leadership', 'new', 'notifications', 'search', 'settings', 'tag', 't', 'top', 'trending', 'survey']);
const devReservedArticleSlugs = new Set(['admin', 'comments', 'members', 'moderate', 'series', 'settings']);
const supportedCuratedSource = { id: 'website-inventory', label: 'Website inventory' };
const supportedNewsletter = { id: 'simple-aws', label: 'Simple AWS' };
const supportedBuilderArticleViewsSource = { id: 'builder-center', label: 'AWS Builder Center' };
const supportedDirectoryPublication = { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS', language: 'es' };

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function hasAllowedKeys(value, keys) {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
}

function isSupportedTimestamp(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isSupportedScope(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function isNonnegativeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRealDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isSupportedTimeZone(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const resolved = new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
    return !/^[+-]/.test(resolved);
  } catch {
    return false;
  }
}

function hasSources(group, kind, allowArticleCoverageSubset = false) {
  const { sources } = group;
  if (!Array.isArray(sources) || sources.length === 0) return false;

  const ids = new Set();
  for (const source of sources) {
    if (!hasOnlyKeys(source, allowedKeys.source)
      || typeof source.id !== 'string'
      || ids.has(source.id)) return false;
    ids.add(source.id);

    if (kind === 'articles') {
      if (supportedArticleSources.get(source.id) !== source.label) return false;
    } else if (source.id !== supportedCuratedSource.id || source.label !== supportedCuratedSource.label) {
      return false;
    }
  }

  if (kind === 'articles') {
    const sourceIds = sources.map((source) => source.id);
    if (!allowArticleCoverageSubset
      && (sourceIds[0] !== 'caylent' || (sourceIds.length > 1 && sourceIds[1] !== 'builder-center'))) return false;
    let previousIndex = -1;
    for (const id of sourceIds) {
      const index = supportedArticleSourceOrder.indexOf(id);
      if (index <= previousIndex) return false;
      previousIndex = index;
    }
    return true;
  }
  return sources.length === 1 && ids.has(supportedCuratedSource.id);
}

function normalizeArticleTitle(title) {
  if (typeof title !== 'string') return '';
  return title.normalize('NFC').replace(/[\s\p{White_Space}]+/gu, ' ').trim().toLowerCase();
}

function articleDateInstant(value) {
  if (isRealDateOnly(value)) {
    const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(milliseconds)
      ? { seconds: milliseconds / 1000, fraction: '' }
      : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match || !isRealDateOnly(match[1])) return null;
  const [, date, hours, minutes, seconds, fraction = '', zone] = match;
  if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return null;
  if (zone !== 'Z') {
    const offset = zone.match(/^[+-](\d{2}):(\d{2})$/);
    const offsetHours = Number(offset[1]);
    const offsetMinutes = Number(offset[2]);
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return null;
  }

  const milliseconds = Date.parse(`${date}T${hours}:${minutes}:${seconds}${zone}`);
  return Number.isFinite(milliseconds)
    ? { seconds: milliseconds / 1000, fraction: fraction.replace(/0+$/, '') }
    : null;
}

function compareArticleDateInstants(left, right) {
  if (left.seconds !== right.seconds) return left.seconds < right.seconds ? -1 : 1;
  const precision = Math.max(left.fraction.length, right.fraction.length);
  for (let index = 0; index < precision; index += 1) {
    const leftDigit = left.fraction.charCodeAt(index) || 48;
    const rightDigit = right.fraction.charCodeAt(index) || 48;
    if (leftDigit !== rightDigit) return leftDigit < rightDigit ? -1 : 1;
  }
  return 0;
}

function compareArticlePublicationDates(left, right) {
  const leftInstant = articleDateInstant(left);
  const rightInstant = articleDateInstant(right);
  const instantOrder = compareArticleDateInstants(leftInstant, rightInstant);
  if (instantOrder !== 0) return instantOrder;
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPublicArticlePath(sourceId, pathname) {
  if (sourceId === 'caylent') return /^\/blog\/.+/.test(pathname);
  if (sourceId === 'builder-center') return /^\/content\/[^/]+\/.+/.test(pathname);
  if (sourceId === 'simple-aws') return /^\/p\/[^/]+$/.test(pathname);
  if (sourceId === 'cloudy-things') {
    return /^\/[^/]+$/.test(pathname) && !['/archive', '/rss.xml', '/sitemap.xml', '/recommendations'].includes(pathname);
  }
  if (sourceId === 'donde-aprendo-aws' || sourceId === 'aws-for-engineers') return /^\/blog\/[^/]+$/.test(pathname);
  if (sourceId === 'dev-community') {
    const match = pathname.match(/^\/([^/]+)\/([^/]+)$/);
    if (!match) return false;
    let username;
    let slug;
    try {
      username = decodeURIComponent(match[1]);
      slug = decodeURIComponent(match[2]);
    } catch {
      return false;
    }
    return !devReservedUsernames.has(username)
      && !devReservedArticleSlugs.has(slug)
      && !(username === 'following' && ['latest', 'latest_less_filtered'].includes(slug));
  }
  if (sourceId === 'linkedin-articles') return /^\/pulse\/.+/.test(pathname);
  if (sourceId === 'spainclouds') return /^\/blog\/.+/.test(pathname);
  if (sourceId === 'hackernoon') return /^\/.+/.test(pathname);
  return false;
}

function isPublicArticleUrl(sourceId, value) {
  if (typeof value !== 'string' || value === '' || value.trim() !== value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const hosts = supportedArticleSourceHosts.get(sourceId);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return Array.isArray(hosts)
    && parsed.protocol === 'https:'
    && hosts.includes(parsed.hostname.toLowerCase())
    && parsed.username === ''
    && parsed.password === ''
    && parsed.port === ''
    && parsed.search === ''
    && parsed.hash === ''
    && pathname !== ''
    && !pathname.includes('//')
    && !/%(?:2f|5c)/i.test(pathname)
    && isPublicArticlePath(sourceId, pathname);
}

function validateArticlePublication(value, coverageSourceIds, collectedAt, identity) {
  if (!hasOnlyKeys(value, allowedKeys.articlePublication)
    || !supportedArticleSources.has(value.sourceId)
    || !coverageSourceIds.has(value.sourceId)
    || typeof value.title !== 'string'
    || normalizeArticleTitle(value.title) === ''
    || normalizeArticleTitle(value.title) !== identity
    || !(value.publishedAt === null || articleDateInstant(value.publishedAt) !== null)
    || (value.publishedAt !== null
      && compareArticleDateInstants(articleDateInstant(value.publishedAt), articleDateInstant(collectedAt)) > 0)
    || typeof value.emailOnly !== 'boolean') return false;

  if (value.sourceId === 'simple-aws') {
    if (value.emailOnly) return value.url === null;
    return value.url === null || isPublicArticleUrl(value.sourceId, value.url);
  }
  return value.emailOnly === false && isPublicArticleUrl(value.sourceId, value.url);
}

function validateArticleGroupV2(value) {
  if (!hasOnlyKeys(value, allowedKeys.articleGroupV2)
    || value.definitionVersion !== 2
    || value.basis !== 'cumulative'
    || !isSupportedTimestamp(value.collectedAt)
    || !isSupportedScope(value.scopeId)
    || !hasSources(value, 'articles', true)
    || !hasOnlyKeys(value.counts, allowedKeys.counts)
    || !isNonnegativeCount(value.counts.all)
    || !isNonnegativeCount(value.counts.en)
    || !isNonnegativeCount(value.counts.es)
    || value.counts.all !== value.counts.en + value.counts.es
    || !Array.isArray(value.records)) return null;

  const coverageSourceIds = new Set(value.sources.map(({ id }) => id));
  const recordIds = new Set();
  const articleIdentities = new Set();
  const counts = { all: value.records.length, en: 0, es: 0 };

  for (const record of value.records) {
    if (!hasOnlyKeys(record, allowedKeys.articleRecord)
      || !isSha256(record.id)
      || recordIds.has(record.id)
      || typeof record.title !== 'string'
      || normalizeArticleTitle(record.title) === ''
      || !['en', 'es'].includes(record.language)
      || !(record.publishedAt === null || articleDateInstant(record.publishedAt) !== null)
      || !Array.isArray(record.publications)
      || record.publications.length === 0) return null;

    const identity = normalizeArticleTitle(record.title);
    const articleIdentity = JSON.stringify([identity, record.language]);
    if (articleIdentities.has(articleIdentity)) return null;

    const uniquePublications = new Set();
    const publicationDates = [];
    for (const publication of record.publications) {
      if (!validateArticlePublication(publication, coverageSourceIds, value.collectedAt, identity)) return null;
      const publicationIdentity = JSON.stringify([
        publication.sourceId,
        publication.title,
        publication.publishedAt,
        publication.url,
        publication.emailOnly
      ]);
      if (uniquePublications.has(publicationIdentity)) return null;
      uniquePublications.add(publicationIdentity);
      if (publication.publishedAt !== null) publicationDates.push(publication.publishedAt);
    }

    const oldestPublicationDate = publicationDates.sort(compareArticlePublicationDates)[0] ?? null;
    if (record.publishedAt !== oldestPublicationDate) return null;
    recordIds.add(record.id);
    articleIdentities.add(articleIdentity);
    counts[record.language] += 1;
  }

  if (value.counts.all !== counts.all || value.counts.en !== counts.en || value.counts.es !== counts.es) return null;
  return value;
}

function validateGroup(value, kind) {
  if (kind === 'articles' && value?.definitionVersion === 2) return validateArticleGroupV2(value);

  if (kind === 'newsletter') {
    if (!hasOnlyKeys(value, allowedKeys.newsletterGroup)
      || value.definitionVersion !== 1
      || value.basis !== 'current'
      || !isSupportedTimestamp(value.collectedAt)
      || !isSha256(value.scopeId)
      || !hasOnlyKeys(value.publication, allowedKeys.publication)
      || value.publication.id !== supportedNewsletter.id
      || value.publication.label !== supportedNewsletter.label
      || !['en', 'es'].includes(value.publication.language)
      || !isNonnegativeCount(value.subscribers)) return null;

    return value;
  }

  if (!hasOnlyKeys(value, allowedKeys.group)
    || value.definitionVersion !== 1
    || value.basis !== 'cumulative'
    || !isSupportedTimestamp(value.collectedAt)
    || !isSupportedScope(value.scopeId)
    || !hasSources(value, kind)) return null;

  const { counts } = value;
  if (!hasOnlyKeys(counts, allowedKeys.counts)
    || !isNonnegativeCount(counts.all)
    || !isNonnegativeCount(counts.en)
    || !isNonnegativeCount(counts.es)
    || counts.all !== counts.en + counts.es) return null;

  return value;
}

function validateNewsletterSentGroup(value) {
  if (!hasOnlyKeys(value, allowedKeys.newsletterSentGroup)
    || value.definitionVersion !== 1
    || value.basis !== 'cumulative'
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedNewsletter.id
    || value.publication.label !== supportedNewsletter.label
    || value.publication.language !== 'en'
    || !isNonnegativeCount(value.sent)) return null;

  return value;
}

function validateBuilderArticleViews(value) {
  const isHistorical = hasOnlyKeys(value, allowedKeys.builderArticleViewsV1);
  const isManual = hasOnlyKeys(value, allowedKeys.builderArticleViewsV2);
  if ((!isHistorical && !isManual)
    || value.basis !== 'recorded-total'
    || (isHistorical && (value.definitionVersion !== 1 || !isSupportedTimestamp(value.collectedAt)))
    || (isManual && (value.definitionVersion !== 2
      || value.provenance !== 'manual'
      || !isSupportedTimestamp(value.observedAt)
      || Date.parse(value.observedAt) < Date.parse('2026-01-06T00:00:00.000Z')))
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.source, allowedKeys.source)
    || value.source.id !== supportedBuilderArticleViewsSource.id
    || value.source.label !== supportedBuilderArticleViewsSource.label
    || value.startDate !== '2026-01-06'
    || !hasOnlyKeys(value.views, allowedKeys.builderArticleViews)
    || !isNonnegativeCount(value.views.all)
    || !isNonnegativeCount(value.views.en)
    || !isNonnegativeCount(value.views.es)
    || !Number.isSafeInteger(value.views.en + value.views.es)
    || value.views.all !== value.views.en + value.views.es) return null;

  return value;
}

function validateArticleViewsRecord(value, period) {
  const expectedBasis = period === 'total' ? 'recorded-total' : 'period';
  if (!hasOnlyKeys(value, allowedKeys.articleViewsRecord)
    || value.basis !== expectedBasis
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedNewsletter.id
    || value.publication.label !== supportedNewsletter.label
    || value.publication.language !== 'en'
    || !isSupportedTimeZone(value.timeZone)
    || !isRealDateOnly(value.startDate)
    || !isRealDateOnly(value.endDate)
    || value.startDate > value.endDate
    || !isNonnegativeCount(value.views)
    || !Array.isArray(value.qualifications)
    || value.qualifications.some((qualification) => !['sampled', 'thresholding', 'other-row'].includes(qualification))
    || new Set(value.qualifications).size !== value.qualifications.length) return null;

  return value;
}

function validateArticleViews(value) {
  if (!hasOnlyKeys(value, allowedKeys.articleViewsGroup)
    || value.definitionVersion !== 1
    || !isRecord(value.records)
    || !hasAllowedKeys(value.records, knownViewPeriods)) return null;

  return Object.fromEntries(knownViewPeriods.map((period) => [
    period,
    Object.hasOwn(value.records, period) ? validateArticleViewsRecord(value.records[period], period) : null
  ]));
}

function validateArticleSearchClicksRecord(value) {
  if (!hasOnlyKeys(value, allowedKeys.articleSearchClicksRecord)
    || value.basis !== 'period'
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedNewsletter.id
    || value.publication.label !== supportedNewsletter.label
    || value.publication.language !== 'en'
    || value.timeZone !== 'America/Los_Angeles'
    || !isRealDateOnly(value.startDate)
    || !isRealDateOnly(value.endDate)
    || value.startDate > value.endDate
    || !isNonnegativeCount(value.clicks)) return null;

  return value;
}

function validateArticleSearchClicks(value) {
  if (!hasOnlyKeys(value, allowedKeys.articleSearchClicksGroup)
    || value.definitionVersion !== 1
    || !isRecord(value.records)
    || !hasAllowedKeys(value.records, knownSearchPeriods)) return null;

  return Object.fromEntries(knownSearchPeriods.map((period) => [
    period,
    Object.hasOwn(value.records, period) ? validateArticleSearchClicksRecord(value.records[period]) : null
  ]));
}

function validateDirectoryViewsRecord(value, period) {
  const expectedBasis = period === 'total' ? 'recorded-total' : 'period';
  if (!hasOnlyKeys(value, allowedKeys.directoryViewsRecord)
    || value.basis !== expectedBasis
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedDirectoryPublication.id
    || value.publication.label !== supportedDirectoryPublication.label
    || value.publication.language !== supportedDirectoryPublication.language
    || !isSupportedTimeZone(value.timeZone)
    || !isRealDateOnly(value.startDate)
    || !isRealDateOnly(value.endDate)
    || value.startDate > value.endDate
    || !isNonnegativeCount(value.views)
    || !Array.isArray(value.qualifications)
    || value.qualifications.some((qualification) => !['sampled', 'thresholding', 'other-row'].includes(qualification))
    || new Set(value.qualifications).size !== value.qualifications.length) return null;

  return value;
}

function validateDirectoryViews(value) {
  if (!hasOnlyKeys(value, allowedKeys.directoryViewsGroup)
    || value.definitionVersion !== 1
    || !isRecord(value.records)
    || !hasAllowedKeys(value.records, knownDirectoryViewPeriods)) return null;

  return Object.fromEntries(knownDirectoryViewPeriods.map((period) => [
    period,
    Object.hasOwn(value.records, period) ? validateDirectoryViewsRecord(value.records[period], period) : null
  ]));
}

function validateDirectoryOutboundClicksRecord(value, period) {
  const expectedBasis = period === 'total' ? 'recorded-total' : 'period';
  if (!hasOnlyKeys(value, allowedKeys.directoryOutboundClicksRecord)
    || value.basis !== expectedBasis
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedDirectoryPublication.id
    || value.publication.label !== supportedDirectoryPublication.label
    || value.publication.language !== supportedDirectoryPublication.language
    || !isSupportedTimeZone(value.timeZone)
    || !isRealDateOnly(value.startDate)
    || !isRealDateOnly(value.endDate)
    || value.startDate > value.endDate
    || !isNonnegativeCount(value.clicks)
    || !Array.isArray(value.qualifications)
    || value.qualifications.some((qualification) => !['sampled', 'thresholding', 'other-row'].includes(qualification))
    || new Set(value.qualifications).size !== value.qualifications.length) return null;

  return value;
}

function validateDirectoryOutboundClicks(value) {
  if (!hasOnlyKeys(value, allowedKeys.directoryOutboundClicksGroup)
    || value.definitionVersion !== 1
    || !isRecord(value.records)
    || !hasAllowedKeys(value.records, knownDirectoryOutboundClickPeriods)) return null;

  return Object.fromEntries(knownDirectoryOutboundClickPeriods.map((period) => [
    period,
    Object.hasOwn(value.records, period) ? validateDirectoryOutboundClicksRecord(value.records[period], period) : null
  ]));
}

function validateNewsletterEmailRecord(value, metric) {
  const keys = metric === 'opens'
    ? allowedKeys.newsletterEmailOpensRecord
    : allowedKeys.newsletterEmailVerifiedClicksRecord;
  if (!hasOnlyKeys(value, keys)
    || value.basis !== 'period'
    || !isSupportedTimestamp(value.collectedAt)
    || !isSha256(value.scopeId)
    || !hasOnlyKeys(value.publication, allowedKeys.publication)
    || value.publication.id !== supportedNewsletter.id
    || value.publication.label !== supportedNewsletter.label
    || value.publication.language !== 'en'
    || value.timeZone !== 'UTC'
    || !isRealDateOnly(value.startDate)
    || !isRealDateOnly(value.endDate)
    || value.startDate > value.endDate
    || !isNonnegativeCount(value[metric])) return null;

  return value;
}

function validateNewsletterEmailFamily(value, metric) {
  if (!hasOnlyKeys(value, allowedKeys.newsletterEmailGroup)
    || value.definitionVersion !== 1
    || !isRecord(value.records)
    || !hasAllowedKeys(value.records, knownNewsletterEmailPeriods)) return null;

  const records = Object.fromEntries(knownNewsletterEmailPeriods.map((period) => [
    period,
    Object.hasOwn(value.records, period) ? validateNewsletterEmailRecord(value.records[period], metric) : null
  ]));
  return Object.values(records).some(Boolean) ? records : null;
}

function validateSnapshot(value) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, allowedKeys.document)
    || value.schemaVersion !== 1
    || !isRecord(value.groups)
    || !hasAllowedKeys(value.groups, [
      ...knownKinds,
      'builderArticleViews',
      'articleViews',
      'articleSearchClicks',
      'directoryViews',
      'directoryOutboundClicks',
      'newsletterEmailsSent',
      'newsletterEmailOpens',
      'newsletterEmailVerifiedClicks'
    ])) return null;

  return {
    groups: Object.fromEntries(knownKinds.map((kind) => [
      kind,
      Object.hasOwn(value.groups, kind) ? validateGroup(value.groups[kind], kind) : null
    ])),
    builderArticleViews: Object.hasOwn(value.groups, 'builderArticleViews')
      ? validateBuilderArticleViews(value.groups.builderArticleViews)
      : null,
    newsletterEmailsSent: Object.hasOwn(value.groups, 'newsletterEmailsSent')
      ? validateNewsletterSentGroup(value.groups.newsletterEmailsSent)
      : null,
    articleViews: Object.hasOwn(value.groups, 'articleViews') ? validateArticleViews(value.groups.articleViews) : null,
    articleSearchClicks: Object.hasOwn(value.groups, 'articleSearchClicks')
      ? validateArticleSearchClicks(value.groups.articleSearchClicks)
      : null,
    directoryViews: Object.hasOwn(value.groups, 'directoryViews')
      ? validateDirectoryViews(value.groups.directoryViews)
      : null,
    directoryOutboundClicks: Object.hasOwn(value.groups, 'directoryOutboundClicks')
      ? validateDirectoryOutboundClicks(value.groups.directoryOutboundClicks)
      : null,
    newsletterEmailOpens: Object.hasOwn(value.groups, 'newsletterEmailOpens')
      ? validateNewsletterEmailFamily(value.groups.newsletterEmailOpens, 'opens')
      : null,
    newsletterEmailVerifiedClicks: Object.hasOwn(value.groups, 'newsletterEmailVerifiedClicks')
      ? validateNewsletterEmailFamily(value.groups.newsletterEmailVerifiedClicks, 'clicks')
      : null
  };
}

function getNewsletterEmailElements(section, attribute, family, valueField) {
  const selector = `[data-stats-newsletter-email-${attribute}]`;
  const region = section.querySelector(selector);
  if (!region) return null;

  return {
    region,
    family,
    valueField,
    attributePrefix: `data-stats-newsletter-email-${attribute}`,
    status: region.querySelector(`[data-stats-newsletter-email-${attribute}-status]`),
    results: region.querySelector(`[data-stats-newsletter-email-${attribute}-results]`),
    value: region.querySelector(`[data-stats-newsletter-email-${attribute}-value]`),
    coverage: region.querySelector(`[data-stats-newsletter-email-${attribute}-coverage]`),
    interval: region.querySelector(`[data-stats-newsletter-email-${attribute}-interval]`),
    collectedDate: region.querySelector(`[data-stats-newsletter-email-${attribute}-collected-date]`)
  };
}

function getNewsletterSentElements(section) {
  const region = section.querySelector('[data-stats-newsletter-sent]');
  if (!region) return null;

  return {
    region,
    attributePrefix: 'data-stats-newsletter-sent',
    status: region.querySelector('[data-stats-newsletter-sent-status]'),
    results: region.querySelector('[data-stats-newsletter-sent-results]'),
    value: region.querySelector('[data-stats-newsletter-sent-value]'),
    coverage: region.querySelector('[data-stats-newsletter-sent-coverage]'),
    collectedDate: region.querySelector('[data-stats-newsletter-sent-collected-date]')
  };
}

function getElements(section) {
  const cards = Object.fromEntries(knownKinds.map((kind) => {
    const card = section.querySelector(`[data-stats-kind="${kind}"]`);
    if (!card) return [kind, null];
    return [kind, {
      card,
      status: card.querySelector('[data-stats-status]'),
      results: card.querySelector('[data-stats-results]'),
      count: card.querySelector('[data-stats-count]'),
      countLabel: card.querySelector('[data-stats-count-label]'),
      coverage: card.querySelector('[data-stats-coverage]'),
      collectedDate: card.querySelector('[data-stats-collected-date]')
    }];
  }));

  const viewsRegion = section.querySelector('[data-stats-views]');
  const views = viewsRegion ? {
    region: viewsRegion,
    status: viewsRegion.querySelector('[data-stats-views-status]'),
    results: viewsRegion.querySelector('[data-stats-views-results]'),
    value: viewsRegion.querySelector('[data-stats-views-value]'),
    coverage: viewsRegion.querySelector('[data-stats-views-coverage]'),
    interval: viewsRegion.querySelector('[data-stats-views-interval]'),
    collectedDate: viewsRegion.querySelector('[data-stats-views-collected-date]'),
    qualifications: viewsRegion.querySelector('[data-stats-views-qualifications]')
  } : null;

  const builderViewsRegion = section.querySelector('[data-stats-builder-views]');
  const builderViews = builderViewsRegion ? {
    region: builderViewsRegion,
    status: builderViewsRegion.querySelector('[data-stats-builder-views-status]'),
    result: builderViewsRegion.querySelector('[data-stats-builder-views-result]'),
    value: builderViewsRegion.querySelector('[data-stats-builder-views-value]'),
    coverage: builderViewsRegion.querySelector('[data-stats-builder-views-coverage]'),
    since: builderViewsRegion.querySelector('[data-stats-builder-views-since]'),
    collectedDate: builderViewsRegion.querySelector('[data-stats-builder-views-collected-date]'),
    provenance: builderViewsRegion.querySelector('[data-stats-builder-views-provenance]')
  } : null;

  const searchRegion = section.querySelector('[data-stats-search]');
  const search = searchRegion ? {
    region: searchRegion,
    status: searchRegion.querySelector('[data-stats-search-status]'),
    results: searchRegion.querySelector('[data-stats-search-results]'),
    value: searchRegion.querySelector('[data-stats-search-value]'),
    coverage: searchRegion.querySelector('[data-stats-search-coverage]'),
    interval: searchRegion.querySelector('[data-stats-search-interval]'),
    collectedDate: searchRegion.querySelector('[data-stats-search-collected-date]')
  } : null;

  const directoryViewsRegion = section.querySelector('[data-stats-directory-views]');
  const directoryViews = directoryViewsRegion ? {
    region: directoryViewsRegion,
    status: directoryViewsRegion.querySelector('[data-stats-directory-views-status]'),
    results: directoryViewsRegion.querySelector('[data-stats-directory-views-results]'),
    value: directoryViewsRegion.querySelector('[data-stats-directory-views-value]'),
    coverage: directoryViewsRegion.querySelector('[data-stats-directory-views-coverage]'),
    interval: directoryViewsRegion.querySelector('[data-stats-directory-views-interval]'),
    collectedDate: directoryViewsRegion.querySelector('[data-stats-directory-views-collected-date]'),
    qualifications: directoryViewsRegion.querySelector('[data-stats-directory-views-qualifications]')
  } : null;

  const directoryOutboundClicksRegion = section.querySelector('[data-stats-directory-outbound-clicks]');
  const directoryOutboundClicks = directoryOutboundClicksRegion ? {
    card: directoryViewsRegion,
    region: directoryOutboundClicksRegion,
    status: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-status]'),
    results: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-results]'),
    value: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-value]'),
    coverage: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-coverage]'),
    interval: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-interval]'),
    collectedDate: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-collected-date]'),
    qualifications: directoryOutboundClicksRegion.querySelector('[data-stats-directory-outbound-clicks-qualifications]')
  } : null;

  return {
    cards,
    overviewRegion: section.querySelector('[data-stats-overview]'),
    overview: Object.fromEntries(knownKinds.map((kind) => [
      kind,
      section.querySelector(`[data-stats-overview-value="${kind}"]`)
    ])),
    selector: section.querySelector('[data-stats-language]'),
    periodSelector: section.querySelector('[data-stats-period]'),
    totalOption: section.querySelector('[data-stats-period]')?.querySelector('[value="total"]') ?? null,
    newsletterEmailsSent: getNewsletterSentElements(section),
    newsletterEmailOpens: getNewsletterEmailElements(section, 'opens', 'newsletterEmailOpens', 'opens'),
    newsletterEmailVerifiedClicks: getNewsletterEmailElements(section, 'verified-clicks', 'newsletterEmailVerifiedClicks', 'clicks'),
    views,
    builderViews,
    search,
    directoryViews,
    directoryOutboundClicks
  };
}

function getLocale(section) {
  return section.dataset.statsLocale === 'es' ? 'es' : 'en';
}

function formatCollectedDate(timestamp, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(timestamp));
}

async function loadSharedSnapshot(source) {
  let requestUrl;
  try {
    requestUrl = new URL(source, window.location.href);
    if (requestUrl.origin !== window.location.origin
      || requestUrl.pathname !== endpointPath
      || requestUrl.search
      || requestUrl.hash) return null;
  } catch {
    return null;
  }

  if (!snapshotRequests.has(requestUrl.href)) {
    snapshotRequests.set(requestUrl.href, (async () => {
      try {
        const response = await fetch(requestUrl.href, { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        return validateSnapshot(await response.json());
      } catch {
        return null;
      }
    })());
  }
  return snapshotRequests.get(requestUrl.href);
}

function formatDateOnly(date, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

function localizeSource(source, locale) {
  if (source.id === supportedCuratedSource.id && locale === 'es') return 'Inventario del sitio web';
  return source.label;
}

function renderOverviewLoading(locale, elements) {
  for (const kind of knownKinds) {
    const value = elements.overview[kind];
    if (value) {
      value.textContent = locale === 'es' ? 'Cargando…' : 'Loading…';
      value.setAttribute('data-stats-overview-state', 'loading');
    }
  }
  elements.overviewRegion?.setAttribute('aria-busy', 'true');
}

function renderOverview(snapshot, locale, elements) {
  for (const kind of knownKinds) {
    const value = elements.overview[kind];
    if (!value) continue;

    const group = snapshot?.groups?.[kind];
    const count = kind === 'newsletter' ? group?.subscribers : group?.counts?.all;
    if (Number.isSafeInteger(count)) {
      value.textContent = new Intl.NumberFormat(locale).format(count);
      value.setAttribute('data-stats-overview-state', 'value');
    } else {
      value.textContent = locale === 'es' ? 'No disponible' : 'Unavailable';
      value.setAttribute('data-stats-overview-state', 'unavailable');
    }
  }
  elements.overviewRegion?.setAttribute('aria-busy', 'false');
}

function renderGroup(group, locale, language, elements) {
  const count = group.counts[language];
  renderCount(count, group.sources.map((source) => localizeSource(source, locale)).join(', '), group.collectedAt, locale, elements);
}

function renderCount(count, coverage, collectedAt, locale, elements) {
  elements.card.hidden = false;
  elements.count.textContent = new Intl.NumberFormat(locale).format(count);
  elements.coverage.textContent = coverage;
  elements.collectedDate.textContent = formatCollectedDate(collectedAt, locale);
  elements.results.hidden = false;
  elements.status.hidden = true;
  elements.status.textContent = '';
  elements.card.setAttribute('aria-busy', 'false');
}

function renderUnavailable(elements) {
  elements.card.hidden = false;
  elements.results.hidden = true;
  elements.count.textContent = '';
  elements.coverage.textContent = '';
  elements.collectedDate.textContent = '';
  elements.status.textContent = elements.card.dataset.statsUnavailable?.trim() || 'Statistics are temporarily unavailable.';
  elements.status.hidden = false;
  elements.card.setAttribute('aria-busy', 'false');
}

function clearNewsletterSubscriber(elements, hidden = false) {
  elements.results.hidden = true;
  elements.count.textContent = '';
  elements.coverage.textContent = '';
  elements.collectedDate.textContent = '';
  elements.status.hidden = hidden;
  elements.status.textContent = '';
}

function renderNewsletter(snapshot, locale, language, elements) {
  const subscriber = snapshot?.groups?.newsletter ?? null;
  const sent = snapshot?.newsletterEmailsSent ?? null;
  const opens = snapshot?.newsletterEmailOpens ?? null;
  const verifiedClicks = snapshot?.newsletterEmailVerifiedClicks ?? null;
  const supportedLanguages = [
    ...(subscriber ? [subscriber.publication.language] : []),
    ...(sent ? ['en'] : []),
    ...(opens || verifiedClicks ? ['en'] : [])
  ];
  const hasSupportedNewsletterData = supportedLanguages.length > 0;
  const hasApplicableNewsletterData = language === 'all' || supportedLanguages.includes(language);

  if (language !== 'all' && hasSupportedNewsletterData && !hasApplicableNewsletterData) {
    elements.card.hidden = true;
    clearNewsletterSubscriber(elements, true);
    elements.card.setAttribute('aria-busy', 'false');
    return;
  }

  elements.card.hidden = false;
  const subscriberApplies = subscriber
    && (language === 'all' || subscriber.publication.language === language);
  if (subscriberApplies) {
    renderCount(subscriber.subscribers, subscriber.publication.label, subscriber.collectedAt, locale, elements);
  } else if (subscriber) {
    clearNewsletterSubscriber(elements, true);
    elements.card.setAttribute('aria-busy', 'false');
  } else {
    renderUnavailable(elements);
  }
}

function renderAll(snapshot, locale, language, elements) {
  const groups = snapshot?.groups ?? null;
  for (const kind of knownKinds) {
    if (kind === 'newsletter') continue;
    const card = elements.cards[kind];
    const group = groups?.[kind];
    if (!card || !group) {
      if (card) renderUnavailable(card);
      continue;
    }
    renderGroup(group, locale, language, card);
  }
  const newsletter = elements.cards.newsletter;
  if (newsletter) renderNewsletter(snapshot, locale, language, newsletter);
}

function newsletterEmailElementsReady(elements) {
  return Boolean(elements?.region && elements.status && elements.results && elements.value
    && elements.coverage && elements.interval && elements.collectedDate);
}

function clearNewsletterEmailResult(elements) {
  elements.value.textContent = '';
  elements.coverage.textContent = '';
  elements.interval.textContent = '';
  elements.collectedDate.textContent = '';
}

function newsletterEmailUnavailableFallback(locale, valueField) {
  if (valueField === 'opens') {
    return locale === 'es' ? 'Datos de aperturas de emails: no disponibles.' : 'Email open data are unavailable.';
  }
  return locale === 'es'
    ? 'Datos de clics verificados en emails: no disponibles.'
    : 'Verified email click data are unavailable.';
}

function renderNewsletterEmailLoading(elements) {
  if (!newsletterEmailElementsReady(elements)) return;
  elements.region.hidden = false;
  elements.results.hidden = true;
  clearNewsletterEmailResult(elements);
  elements.status.hidden = false;
}

function renderNewsletterEmailUnavailable(elements, locale, hidden = false, availability = null) {
  if (!newsletterEmailElementsReady(elements)) return;
  elements.region.hidden = hidden;
  elements.results.hidden = true;
  clearNewsletterEmailResult(elements);
  elements.status.textContent = hidden
    ? ''
    : activityUnavailableCopy(
      locale,
      availability,
      elements.region.getAttribute(`${elements.attributePrefix}-unavailable`)?.trim()
        || newsletterEmailUnavailableFallback(locale, elements.valueField)
    );
  elements.status.hidden = hidden;
}

function renderNewsletterEmailMetric(snapshot, locale, language, period, elements) {
  if (!newsletterEmailElementsReady(elements)) return;
  if (language === 'es') {
    renderNewsletterEmailUnavailable(elements, locale, true);
    return;
  }

  const records = snapshot?.[elements.family];
  const availability = classifyActivityAvailability(records, language, period, knownNewsletterEmailPeriods);
  if (availability) {
    renderNewsletterEmailUnavailable(elements, locale, false, availability);
    return;
  }
  const record = records?.[period];

  const startDate = formatDateOnly(record.startDate, locale);
  const endDate = formatDateOnly(record.endDate, locale);
  elements.region.hidden = false;
  elements.value.textContent = new Intl.NumberFormat(locale).format(record[elements.valueField]);
  elements.coverage.textContent = record.publication.label;
  elements.interval.textContent = `${startDate} – ${endDate} · ${record.timeZone}`;
  elements.collectedDate.textContent = formatCollectedDate(record.collectedAt, locale);
  elements.results.hidden = false;
  elements.status.hidden = true;
  elements.status.textContent = '';
}

function renderNewsletterEmail(snapshot, locale, language, elements) {
  const period = elements.periodSelector?.value ?? '12m';
  renderNewsletterEmailMetric(snapshot, locale, language, period, elements.newsletterEmailOpens);
  renderNewsletterEmailMetric(snapshot, locale, language, period, elements.newsletterEmailVerifiedClicks);
}

function newsletterSentElementsReady(elements) {
  return Boolean(elements?.region && elements.status && elements.results
    && elements.value && elements.coverage && elements.collectedDate);
}

function clearNewsletterSentResult(elements) {
  elements.value.textContent = '';
  elements.coverage.textContent = '';
  elements.collectedDate.textContent = '';
}

function renderNewsletterSentLoading(elements) {
  if (!newsletterSentElementsReady(elements)) return;
  elements.region.hidden = false;
  elements.results.hidden = true;
  clearNewsletterSentResult(elements);
  elements.status.hidden = false;
}

function renderNewsletterSentUnavailable(elements, locale, hidden = false) {
  if (!newsletterSentElementsReady(elements)) return;
  elements.region.hidden = hidden;
  elements.results.hidden = true;
  clearNewsletterSentResult(elements);
  elements.status.textContent = hidden
    ? ''
    : elements.region.getAttribute(`${elements.attributePrefix}-unavailable`)?.trim()
      || (locale === 'es' ? 'El total informado de emails enviados no está disponible.' : 'The reported emails-sent total is unavailable.');
  elements.status.hidden = hidden;
}

function renderNewsletterSent(snapshot, locale, language, elements, newsletterCard) {
  if (!newsletterSentElementsReady(elements)) return;
  if (language === 'es' || newsletterCard?.hidden) {
    renderNewsletterSentUnavailable(elements, locale, true);
    return;
  }

  const group = snapshot?.newsletterEmailsSent;
  if (!group) {
    renderNewsletterSentUnavailable(elements, locale);
    return;
  }

  elements.region.hidden = false;
  elements.value.textContent = new Intl.NumberFormat(locale).format(group.sent);
  elements.coverage.textContent = group.publication.label;
  elements.collectedDate.textContent = formatCollectedDate(group.collectedAt, locale);
  elements.results.hidden = false;
  elements.status.hidden = true;
  elements.status.textContent = '';
}

function builderViewsElementsReady(elements) {
  const builderViews = elements.builderViews;
  return Boolean(builderViews?.region && builderViews.status && builderViews.result
    && builderViews.value && builderViews.coverage && builderViews.since && builderViews.collectedDate && builderViews.provenance);
}

function clearBuilderViewsResult(builderViews) {
  builderViews.value.textContent = '';
  builderViews.coverage.textContent = '';
  builderViews.since.textContent = '';
  builderViews.collectedDate.textContent = '';
  builderViews.provenance.textContent = '';
}

function renderBuilderViewsLoading(builderViews) {
  builderViews.region.hidden = false;
  builderViews.result.hidden = true;
  clearBuilderViewsResult(builderViews);
  builderViews.status.hidden = false;
  builderViews.region.setAttribute('aria-busy', 'true');
}

function renderBuilderViewsUnavailable(elements, locale) {
  const { builderViews } = elements;
  builderViews.region.hidden = false;
  builderViews.result.hidden = true;
  clearBuilderViewsResult(builderViews);
  builderViews.status.textContent = builderViews.region.dataset.statsBuilderViewsUnavailable?.trim()
    || (locale === 'es'
      ? 'Las vistas registradas de Builder Center no están disponibles.'
      : 'Builder Center recorded views are unavailable.');
  builderViews.status.hidden = false;
  builderViews.region.setAttribute('aria-busy', 'false');
}

function renderBuilderViews(snapshot, locale, language, elements) {
  if (!builderViewsElementsReady(elements)) return;

  const group = snapshot?.builderArticleViews;
  if (!group) {
    renderBuilderViewsUnavailable(elements, locale);
    return;
  }

  const builderViews = elements.builderViews;
  builderViews.region.hidden = false;
  builderViews.value.textContent = new Intl.NumberFormat(locale).format(group.views[language]);
  builderViews.coverage.textContent = group.source.label;
  builderViews.since.textContent = formatDateOnly(group.startDate, locale);
  const observedAt = group.definitionVersion === 1 ? group.collectedAt : group.observedAt;
  builderViews.collectedDate.textContent = formatCollectedDate(observedAt, locale);
  builderViews.provenance.textContent = group.definitionVersion === 1
    ? builderViews.region.dataset.statsBuilderViewsAutomaticProvenance?.trim()
      || (locale === 'es' ? 'Observación automática histórica' : 'Automatic historical observation')
    : builderViews.region.dataset.statsBuilderViewsManualProvenance?.trim()
      || (locale === 'es' ? 'Mantenimiento manual' : 'Manually maintained');
  builderViews.result.hidden = false;
  builderViews.status.hidden = true;
  builderViews.status.textContent = '';
  builderViews.region.setAttribute('aria-busy', 'false');
}

const qualificationCopy = {
  en: {
    sampled: 'Estimated from a sample',
    thresholding: 'Google may withhold some data',
    'other-row': 'Some activity may be missing'
  },
  es: {
    sampled: 'Estimado a partir de una muestra',
    thresholding: 'Google puede omitir parte de los datos',
    'other-row': 'Puede faltar parte de la actividad'
  }
};

function viewsElementsReady(elements) {
  const views = elements.views;
  return Boolean(elements.periodSelector && elements.totalOption && views?.region && views.status && views.results
    && views.value && views.coverage && views.interval && views.collectedDate && views.qualifications);
}

function classifyActivityAvailability(records, language, period, supportedPeriods) {
  const selectedRecord = records?.[period] ?? null;
  const coverageRecord = selectedRecord ?? Object.values(records ?? {}).find(Boolean) ?? null;
  if (!coverageRecord) return { reason: 'missing' };
  if (language !== 'all' && coverageRecord.publication.language !== language) {
    return { reason: 'language', publication: coverageRecord.publication };
  }
  if (!supportedPeriods.includes(period)) return { reason: 'unsupported-total' };
  if (!selectedRecord) return { reason: 'missing' };
  return null;
}

function activityUnavailableCopy(locale, availability, genericCopy) {
  if (availability?.reason === 'language') {
    const publication = availability.publication;
    const language = locale === 'es'
      ? publication.language === 'en' ? 'inglés' : 'español'
      : publication.language === 'en' ? 'English' : 'Spanish';
    return locale === 'es'
      ? `Esta métrica solo cubre artículos de ${publication.label} en ${language}.`
      : `This metric only covers ${publication.label} articles in ${language}.`;
  }
  if (availability?.reason === 'unsupported-total') {
    return locale === 'es'
      ? 'Esta métrica no ofrece un total registrado.'
      : 'This metric does not offer a recorded total.';
  }
  return genericCopy;
}

function clearViewsResult(views) {
  views.value.textContent = '';
  views.coverage.textContent = '';
  views.interval.textContent = '';
  views.collectedDate.textContent = '';
  views.qualifications.textContent = '';
  views.qualifications.hidden = true;
}

function renderViewsUnavailable(elements, locale, availability) {
  const { views } = elements;
  views.results.hidden = true;
  clearViewsResult(views);
  views.status.textContent = activityUnavailableCopy(
    locale,
    availability,
    views.region.dataset.statsViewsUnavailable?.trim()
      || (locale === 'es' ? 'Datos de vistas de páginas: no disponibles.' : 'Page view data are unavailable.')
  );
  views.status.hidden = false;
}

function renderViewsLoading(views) {
  views.results.hidden = true;
  clearViewsResult(views);
  views.status.hidden = false;
}

function updateRecordedTotalAvailability(snapshot, language, elements) {
  const { periodSelector, totalOption } = elements;
  if (!periodSelector || !totalOption) return;

  const articleTotalSupported = language !== 'es' && Boolean(snapshot?.articleViews?.total);
  const directoryTotalSupported = language !== 'en'
    && Boolean(snapshot?.directoryViews?.total || snapshot?.directoryOutboundClicks?.total);
  const totalSupported = articleTotalSupported || directoryTotalSupported;
  totalOption.disabled = !totalSupported;
  if (!totalSupported && periodSelector.value === 'total') periodSelector.value = '12m';
}

function renderViews(snapshot, locale, language, elements) {
  if (!viewsElementsReady(elements)) return;

  const { periodSelector, views } = elements;
  const records = snapshot?.articleViews;
  const period = knownViewPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const availability = classifyActivityAvailability(records, language, period, knownViewPeriods);
  if (availability) {
    renderViewsUnavailable(elements, locale, availability);
    return;
  }
  const record = records?.[period];

  const startDate = formatDateOnly(record.startDate, locale);
  const endDate = formatDateOnly(record.endDate, locale);
  const interval = period === 'total'
    ? (locale === 'es' ? `Vistas desde ${startDate} · ${endDate} · ${record.timeZone}` : `Views since ${startDate} · ${endDate} · ${record.timeZone}`)
    : `${startDate} – ${endDate} · ${record.timeZone}`;
  const qualifications = record.qualifications.map((qualification) => qualificationCopy[locale][qualification]);

  views.value.textContent = new Intl.NumberFormat(locale).format(record.views);
  views.coverage.textContent = record.publication.label;
  views.interval.textContent = interval;
  views.collectedDate.textContent = formatCollectedDate(record.collectedAt, locale);
  views.qualifications.textContent = qualifications.join(' · ');
  views.qualifications.hidden = qualifications.length === 0;
  views.results.hidden = false;
  views.status.hidden = true;
  views.status.textContent = '';
}

function searchElementsReady(elements) {
  const search = elements.search;
  return Boolean(elements.periodSelector && search?.region && search.status && search.results
    && search.value && search.coverage && search.interval && search.collectedDate);
}

function clearSearchResult(search) {
  search.value.textContent = '';
  search.coverage.textContent = '';
  search.interval.textContent = '';
  search.collectedDate.textContent = '';
}

function renderSearchUnavailable(elements, locale, availability) {
  const { search } = elements;
  search.results.hidden = true;
  clearSearchResult(search);
  search.status.textContent = activityUnavailableCopy(
    locale,
    availability,
    search.region.dataset.statsSearchUnavailable?.trim()
      || (locale === 'es' ? 'Datos de clics de búsqueda: no disponibles.' : 'Search click data are unavailable.')
  );
  search.status.hidden = false;
}

function renderSearchLoading(search) {
  search.results.hidden = true;
  clearSearchResult(search);
  search.status.hidden = false;
}

function renderSearch(snapshot, locale, language, elements) {
  if (!searchElementsReady(elements)) return;

  const { periodSelector, search } = elements;
  const records = snapshot?.articleSearchClicks;
  const period = periodSelector.value === 'total'
    ? 'total'
    : knownSearchPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const availability = classifyActivityAvailability(records, language, period, knownSearchPeriods);
  if (availability) {
    renderSearchUnavailable(elements, locale, availability);
    return;
  }
  const record = records?.[period];

  const startDate = formatDateOnly(record.startDate, locale);
  const endDate = formatDateOnly(record.endDate, locale);
  search.value.textContent = new Intl.NumberFormat(locale).format(record.clicks);
  search.coverage.textContent = record.publication.label;
  search.interval.textContent = `${startDate} – ${endDate} · ${record.timeZone}`;
  search.collectedDate.textContent = formatCollectedDate(record.collectedAt, locale);
  search.results.hidden = false;
  search.status.hidden = true;
  search.status.textContent = '';
}

function directoryViewsElementsReady(elements) {
  const directoryViews = elements.directoryViews;
  return Boolean(elements.periodSelector && directoryViews?.region && directoryViews.status && directoryViews.results
    && directoryViews.value && directoryViews.coverage && directoryViews.interval
    && directoryViews.collectedDate && directoryViews.qualifications);
}

function clearDirectoryViewsResult(directoryViews) {
  directoryViews.value.textContent = '';
  directoryViews.coverage.textContent = '';
  directoryViews.interval.textContent = '';
  directoryViews.collectedDate.textContent = '';
  directoryViews.qualifications.textContent = '';
  directoryViews.qualifications.hidden = true;
}

function renderDirectoryViewsUnavailable(elements, locale, hidden = false, availability = null) {
  const { directoryViews } = elements;
  directoryViews.region.hidden = hidden;
  directoryViews.results.hidden = true;
  clearDirectoryViewsResult(directoryViews);
  directoryViews.status.textContent = hidden ? '' : activityUnavailableCopy(
    locale,
    availability,
    directoryViews.region.dataset.statsDirectoryViewsUnavailable?.trim()
      || (locale === 'es'
        ? 'Datos de vistas de páginas de Dónde Aprendo AWS: no disponibles.'
        : 'Dónde Aprendo AWS page view data are unavailable.')
  );
  directoryViews.status.hidden = hidden;
  directoryViews.region.setAttribute('aria-busy', 'false');
}

function renderDirectoryViewsLoading(directoryViews) {
  directoryViews.region.hidden = false;
  directoryViews.results.hidden = true;
  clearDirectoryViewsResult(directoryViews);
  directoryViews.status.hidden = false;
  directoryViews.region.setAttribute('aria-busy', 'true');
}

function renderDirectoryViews(snapshot, locale, language, elements) {
  if (!directoryViewsElementsReady(elements)) return;

  const { directoryViews, periodSelector } = elements;
  if (language === 'en') {
    renderDirectoryViewsUnavailable(elements, locale, true);
    return;
  }

  const period = knownDirectoryViewPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const records = snapshot?.directoryViews;
  const availability = classifyActivityAvailability(records, language, period, knownDirectoryViewPeriods);
  if (availability) {
    renderDirectoryViewsUnavailable(elements, locale, false, availability);
    return;
  }
  const record = records?.[period];

  const startDate = formatDateOnly(record.startDate, locale);
  const endDate = formatDateOnly(record.endDate, locale);
  const qualifications = record.qualifications.map((qualification) => qualificationCopy[locale][qualification]);
  directoryViews.region.hidden = false;
  directoryViews.value.textContent = new Intl.NumberFormat(locale).format(record.views);
  directoryViews.coverage.textContent = record.publication.label;
  directoryViews.interval.textContent = `${startDate} – ${endDate} · ${record.timeZone}`;
  directoryViews.collectedDate.textContent = formatCollectedDate(record.collectedAt, locale);
  directoryViews.qualifications.textContent = qualifications.join(' · ');
  directoryViews.qualifications.hidden = qualifications.length === 0;
  directoryViews.results.hidden = false;
  directoryViews.status.hidden = true;
  directoryViews.status.textContent = '';
  directoryViews.region.setAttribute('aria-busy', 'false');
}

function directoryOutboundClicksElementsReady(elements) {
  const clicks = elements.directoryOutboundClicks;
  return Boolean(elements.periodSelector && clicks?.card && clicks.region && clicks.status && clicks.results
    && clicks.value && clicks.coverage && clicks.interval && clicks.collectedDate && clicks.qualifications);
}

function clearDirectoryOutboundClicksResult(clicks) {
  clicks.value.textContent = '';
  clicks.coverage.textContent = '';
  clicks.interval.textContent = '';
  clicks.collectedDate.textContent = '';
  clicks.qualifications.textContent = '';
  clicks.qualifications.hidden = true;
}

function renderDirectoryOutboundClicksUnavailable(elements, locale, hidden = false, availability = null) {
  const { directoryOutboundClicks: clicks } = elements;
  clicks.region.hidden = hidden;
  clicks.results.hidden = true;
  clearDirectoryOutboundClicksResult(clicks);
  clicks.status.textContent = hidden ? '' : activityUnavailableCopy(
    locale,
    availability,
    clicks.card.dataset.statsDirectoryOutboundClicksUnavailable?.trim()
      || (locale === 'es'
        ? 'Datos de clics en enlaces externos de Dónde Aprendo AWS: no disponibles.'
        : 'Dónde Aprendo AWS external link click data are unavailable.')
  );
  clicks.status.hidden = hidden;
}

function renderDirectoryOutboundClicksLoading(clicks) {
  clicks.region.hidden = false;
  clicks.results.hidden = true;
  clearDirectoryOutboundClicksResult(clicks);
  clicks.status.hidden = false;
}

function renderDirectoryOutboundClicks(snapshot, locale, language, elements) {
  if (!directoryOutboundClicksElementsReady(elements)) return;

  const { directoryOutboundClicks: clicks, periodSelector } = elements;
  if (language === 'en') {
    renderDirectoryOutboundClicksUnavailable(elements, locale, true);
    return;
  }

  const period = knownDirectoryOutboundClickPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const records = snapshot?.directoryOutboundClicks;
  const availability = classifyActivityAvailability(records, language, period, knownDirectoryOutboundClickPeriods);
  if (availability) {
    renderDirectoryOutboundClicksUnavailable(elements, locale, false, availability);
    return;
  }
  const record = records?.[period];

  const startDate = formatDateOnly(record.startDate, locale);
  const endDate = formatDateOnly(record.endDate, locale);
  const qualifications = record.qualifications.map((qualification) => qualificationCopy[locale][qualification]);
  clicks.region.hidden = false;
  clicks.value.textContent = new Intl.NumberFormat(locale).format(record.clicks);
  clicks.coverage.textContent = record.publication.label;
  clicks.interval.textContent = `${startDate} – ${endDate} · ${record.timeZone}`;
  clicks.collectedDate.textContent = formatCollectedDate(record.collectedAt, locale);
  clicks.qualifications.textContent = qualifications.join(' · ');
  clicks.qualifications.hidden = qualifications.length === 0;
  clicks.results.hidden = false;
  clicks.status.hidden = true;
  clicks.status.textContent = '';
}

function renderActivity(snapshot, locale, language, elements) {
  updateRecordedTotalAvailability(snapshot, language, elements);
  renderNewsletterSent(snapshot, locale, language, elements.newsletterEmailsSent, elements.cards.newsletter?.card);
  renderNewsletterEmail(snapshot, locale, language, elements);
  renderBuilderViews(snapshot, locale, language, elements);
  renderViews(snapshot, locale, language, elements);
  renderSearch(snapshot, locale, language, elements);
  renderDirectoryViews(snapshot, locale, language, elements);
  renderDirectoryOutboundClicks(snapshot, locale, language, elements);
}

async function loadContentStats(section) {
  const elements = getElements(section);
  const cardsReady = knownKinds.every((kind) => {
    const card = elements.cards[kind];
    return card?.card && card.status && card.results && card.count && card.countLabel
      && card.coverage && card.collectedDate;
  });
  if (!elements.selector || !cardsReady) return;

  const locale = getLocale(section);
  elements.selector.disabled = false;
  renderOverviewLoading(locale, elements);
  for (const kind of knownKinds) {
    const card = elements.cards[kind];
    card.status.hidden = false;
    card.card.setAttribute('aria-busy', 'true');
  }
  if (newsletterSentElementsReady(elements.newsletterEmailsSent)) renderNewsletterSentLoading(elements.newsletterEmailsSent);
  if (newsletterEmailElementsReady(elements.newsletterEmailOpens)) renderNewsletterEmailLoading(elements.newsletterEmailOpens);
  if (newsletterEmailElementsReady(elements.newsletterEmailVerifiedClicks)) renderNewsletterEmailLoading(elements.newsletterEmailVerifiedClicks);
  if (builderViewsElementsReady(elements)) renderBuilderViewsLoading(elements.builderViews);
  if (viewsElementsReady(elements)) renderViewsLoading(elements.views);
  if (searchElementsReady(elements)) renderSearchLoading(elements.search);
  if (directoryViewsElementsReady(elements)) renderDirectoryViewsLoading(elements.directoryViews);
  if (directoryOutboundClicksElementsReady(elements)) renderDirectoryOutboundClicksLoading(elements.directoryOutboundClicks);

  const snapshot = await loadSharedSnapshot(section.dataset.statsSource);

  renderOverview(snapshot, locale, elements);
  renderAll(snapshot, locale, elements.selector.value, elements);
  if (snapshot && (newsletterEmailElementsReady(elements.newsletterEmailOpens)
    || newsletterEmailElementsReady(elements.newsletterEmailVerifiedClicks)
    || viewsElementsReady(elements) || searchElementsReady(elements)
    || directoryViewsElementsReady(elements) || directoryOutboundClicksElementsReady(elements))) {
    elements.periodSelector.disabled = false;
  }
  else if (elements.totalOption) elements.totalOption.disabled = true;
  renderActivity(snapshot, locale, elements.selector.value, elements);
  elements.selector.addEventListener('change', () => {
    renderAll(snapshot, locale, elements.selector.value, elements);
    renderActivity(snapshot, locale, elements.selector.value, elements);
  });
  if (newsletterEmailElementsReady(elements.newsletterEmailOpens)
    || newsletterEmailElementsReady(elements.newsletterEmailVerifiedClicks)
    || viewsElementsReady(elements) || searchElementsReady(elements)
    || directoryViewsElementsReady(elements) || directoryOutboundClicksElementsReady(elements)) {
    elements.periodSelector.addEventListener('change', () => {
      renderActivity(snapshot, locale, elements.selector.value, elements);
    });
  }
}

const articleCatalogCopy = {
  en: {
    unavailable: 'The full article list is unavailable. Browse the registered sources below.',
    legacyUnavailable: 'The full article list is unavailable. Browse the registered sources below.',
    empty: 'No articles are currently listed.',
    noResults: 'No articles match this content language.',
    noSearchResults: 'No articles match your search and content language.',
    unknownDate: 'Date unknown',
    onlyByEmail: 'Only by email',
    linkUnavailable: 'Link unavailable',
    published: 'Published',
    languages: { en: 'English', es: 'Spanish' },
    range: (start, end, total) => `Showing ${start}–${end} of ${total} articles`,
    emptyRange: () => 'Showing 0 of 0 articles'
  },
  es: {
    unavailable: 'No se puede mostrar la lista completa de artículos. Consulta las fuentes registradas abajo.',
    legacyUnavailable: 'No se puede mostrar la lista completa de artículos. Consulta las fuentes registradas abajo.',
    empty: 'No hay artículos para mostrar por ahora.',
    noResults: 'No hay artículos que coincidan con este idioma de contenido.',
    noSearchResults: 'No hay artículos que coincidan con la búsqueda y el idioma de contenido.',
    unknownDate: 'Fecha desconocida',
    onlyByEmail: 'Sólo por email',
    linkUnavailable: 'Enlace no disponible',
    published: 'Publicado',
    languages: { en: 'Inglés', es: 'Español' },
    range: (start, end, total) => `Mostrando ${start}–${end} de ${total} artículos`,
    emptyRange: () => 'Mostrando 0 de 0 artículos'
  }
};

const articleCatalogSorts = ['date-desc', 'date-asc', 'title-asc', 'title-desc', 'source-asc', 'source-desc'];
const articleCatalogLanguages = ['all', 'en', 'es'];
const articleCatalogPageSizes = [10, 20, 50];
const articleCatalogOwnParameters = ['q', 'lang', 'sort', 'size', 'page'];
const articleCatalogCollator = new Intl.Collator('es', { sensitivity: 'base' });

function getArticleCatalogElements(root) {
  const query = root.querySelector('[data-catalog-query]');
  const sort = root.querySelector('[data-catalog-sort]');
  const status = root.querySelector('[data-catalog-status]');
  const results = root.querySelector('[data-catalog-results]');
  const range = root.querySelector('[data-catalog-range]');
  const list = root.querySelector('[data-catalog-list]');
  const empty = root.querySelector('[data-catalog-empty]');
  const language = root.querySelector('[data-catalog-language]');
  const size = root.querySelector('[data-catalog-size]');
  const previous = root.querySelector('[data-catalog-previous]');
  const next = root.querySelector('[data-catalog-next]');
  const collectedDate = root.querySelector('[data-catalog-collected-date]');
  const coverage = root.querySelector('[data-catalog-coverage]');
  if (![query, sort, status, results, range, list, empty, language, size, previous, next, collectedDate, coverage].every(Boolean)) return null;

  return {
    root,
    query,
    sort,
    status,
    results,
    range,
    list,
    empty,
    language,
    size,
    previous,
    next,
    collectedDate,
    coverage,
    fallback: root.querySelector('[data-catalog-fallback]')
  };
}

function getArticleCatalogCopy(elements, locale) {
  const base = articleCatalogCopy[locale];
  const data = elements.root.dataset;
  return {
    unavailable: data.catalogUnavailable?.trim() || base.unavailable,
    legacyUnavailable: data.catalogLegacyUnavailable?.trim() || base.legacyUnavailable,
    empty: data.catalogEmpty?.trim() || base.empty,
    noResults: data.catalogNoResults?.trim() || base.noResults,
    noSearchResults: data.catalogNoSearchResults?.trim() || base.noSearchResults,
    unknownDate: data.catalogDateUnknown?.trim() || base.unknownDate,
    onlyByEmail: data.catalogOnlyByEmail?.trim() || base.onlyByEmail,
    linkUnavailable: data.catalogLinkUnavailable?.trim() || base.linkUnavailable,
    published: data.catalogPublished?.trim() || base.published,
    languages: {
      en: data.catalogLanguageEnglish?.trim() || base.languages.en,
      es: data.catalogLanguageSpanish?.trim() || base.languages.es
    },
    range: base.range,
    emptyRange: base.emptyRange
  };
}

function setArticleCatalogControlsDisabled(elements, disabled) {
  elements.query.disabled = disabled;
  elements.sort.disabled = disabled;
  elements.language.disabled = disabled;
  elements.size.disabled = disabled;
  elements.previous.disabled = true;
  elements.next.disabled = true;
  if (disabled) {
    elements.query.value = '';
    elements.sort.value = 'date-desc';
  }
}

function clearArticleCatalog(elements) {
  elements.list.replaceChildren();
  elements.results.hidden = true;
  elements.range.textContent = '';
  elements.empty.hidden = true;
  elements.collectedDate.textContent = '';
  elements.coverage.textContent = '';
}

function renderArticleCatalogUnavailable(elements, copy, legacy = false) {
  clearArticleCatalog(elements);
  setArticleCatalogControlsDisabled(elements, true);
  elements.status.textContent = legacy ? copy.legacyUnavailable : copy.unavailable;
  elements.status.hidden = false;
  elements.root.setAttribute('aria-busy', 'false');
  if (elements.fallback) elements.fallback.hidden = false;
}

function renderArticleCatalogLoading(elements, copy) {
  clearArticleCatalog(elements);
  setArticleCatalogControlsDisabled(elements, true);
  elements.status.textContent = elements.root.dataset.catalogLoading?.trim()
    || (elements.root.dataset.catalogLocale === 'es' ? 'Cargando artículos…' : 'Loading articles…');
  elements.status.hidden = false;
  elements.root.setAttribute('aria-busy', 'true');
  if (elements.fallback) elements.fallback.hidden = false;
}

function formatArticlePublicationDate(value, locale, copy) {
  if (value === null) return copy.unknownDate;
  return formatDateOnly(value.slice(0, 10), locale);
}

function createArticleDate(value, locale, copy, className = '') {
  const element = document.createElement(value === null ? 'span' : 'time');
  if (className) element.setAttribute('class', className);
  if (value !== null) element.setAttribute('datetime', value);
  element.textContent = formatArticlePublicationDate(value, locale, copy);
  return element;
}

function createArticleCatalogRow(record, locale, copy) {
  const row = document.createElement('li');
  row.setAttribute('class', 'article-catalog-record');
  row.dataset.catalogRecord = record.id;

  const heading = document.createElement('div');
  heading.setAttribute('class', 'article-catalog-record-heading');
  const title = document.createElement('h2');
  title.setAttribute('class', 'article-catalog-record-title');
  title.textContent = record.title;
  const language = document.createElement('span');
  language.setAttribute('class', 'article-catalog-record-language');
  language.textContent = copy.languages[record.language];
  const date = createArticleDate(record.publishedAt, locale, copy, 'article-catalog-record-date');
  heading.appendChild(title);
  heading.appendChild(language);
  heading.appendChild(date);
  row.appendChild(heading);

  const publications = document.createElement('ul');
  publications.setAttribute('class', 'article-catalog-publications');
  for (const publication of record.publications) {
    const sourceLabel = supportedArticleSources.get(publication.sourceId);
    const item = document.createElement('li');
    item.setAttribute('class', 'article-catalog-publication');
    if (publication.url) {
      const link = document.createElement('a');
      link.setAttribute('href', publication.url);
      link.setAttribute('aria-label', `${sourceLabel}: ${publication.title} · ${copy.published} ${formatArticlePublicationDate(publication.publishedAt, locale, copy)}`);
      link.textContent = sourceLabel;
      item.appendChild(link);
    } else {
      const source = document.createElement('span');
      source.setAttribute('class', 'article-catalog-publication-source');
      source.textContent = sourceLabel;
      item.appendChild(source);
    }

    if (publication.emailOnly) {
      const emailOnly = document.createElement('span');
      emailOnly.setAttribute('class', 'article-catalog-publication-note');
      emailOnly.textContent = copy.onlyByEmail;
      item.appendChild(emailOnly);
    } else if (publication.url === null) {
      const unavailable = document.createElement('span');
      unavailable.setAttribute('class', 'article-catalog-publication-note');
      unavailable.textContent = copy.linkUnavailable;
      item.appendChild(unavailable);
    }

    item.appendChild(createArticleDate(publication.publishedAt, locale, copy, 'article-catalog-publication-date'));
    publications.appendChild(item);
  }
  row.appendChild(publications);
  return row;
}

function compareArticleCatalogTitles(left, right) {
  if (left.title < right.title) return -1;
  if (left.title > right.title) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function normalizeArticleCatalogQuery(value) {
  return String(value ?? '').replace(/^[\s\p{White_Space}]+|[\s\p{White_Space}]+$/gu, '');
}

function tokenizeArticleCatalogQuery(value) {
  return normalizeArticleCatalogQuery(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[\s\p{White_Space}]+/gu)
    .filter(Boolean);
}

function articleCatalogRecordMatches(record, terms) {
  if (terms.length === 0) return true;
  const searchableText = [
    record.title,
    ...record.publications.map(({ sourceId }) => supportedArticleSources.get(sourceId) ?? '')
  ].map((value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).join(' ');
  return terms.every((term) => searchableText.includes(term));
}

function getArticleCatalogMinimumSource(record) {
  return record.publications
    .map(({ sourceId }) => supportedArticleSources.get(sourceId))
    .filter(Boolean)
    .sort((left, right) => articleCatalogCollator.compare(left, right) || (left < right ? -1 : left > right ? 1 : 0))[0] ?? '';
}

function compareArticleCatalogRecords(left, right, sort) {
  let primaryOrder = 0;
  if (sort === 'date-desc' || sort === 'date-asc') {
    const leftDate = articleDateInstant(left.publishedAt);
    const rightDate = articleDateInstant(right.publishedAt);
    if (leftDate === null && rightDate !== null) return 1;
    if (rightDate === null && leftDate !== null) return -1;
    if (leftDate !== null && rightDate !== null) {
      primaryOrder = compareArticleDateInstants(leftDate, rightDate);
      if (sort === 'date-desc') primaryOrder = -primaryOrder;
    }
  } else if (sort === 'title-asc' || sort === 'title-desc') {
    primaryOrder = articleCatalogCollator.compare(left.title, right.title);
    if (sort === 'title-desc') primaryOrder = -primaryOrder;
  } else {
    primaryOrder = articleCatalogCollator.compare(
      getArticleCatalogMinimumSource(left),
      getArticleCatalogMinimumSource(right)
    );
    if (sort === 'source-desc') primaryOrder = -primaryOrder;
  }
  return primaryOrder || compareArticleCatalogTitles(left, right);
}

function readArticleCatalogUrlState() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const query = normalizeArticleCatalogQuery(params.get('q') ?? '');
  const languageValue = params.get('lang');
  const sortValue = params.get('sort');
  const sizeValue = params.get('size');
  const pageValue = params.get('page');
  const parsedPage = pageValue !== null && /^\d+$/u.test(pageValue) ? Number(pageValue) : NaN;
  return {
    view: {
      query,
      language: articleCatalogLanguages.includes(languageValue) ? languageValue : 'all',
      sort: articleCatalogSorts.includes(sortValue) ? sortValue : 'date-desc',
      size: articleCatalogPageSizes.find((size) => String(size) === sizeValue) ?? 10,
      page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
    }
  };
}

function readArticleCatalogControls(elements, query = elements.query.value) {
  return {
    query: normalizeArticleCatalogQuery(query),
    language: articleCatalogLanguages.includes(elements.language.value) ? elements.language.value : 'all',
    sort: articleCatalogSorts.includes(elements.sort.value) ? elements.sort.value : 'date-desc',
    size: articleCatalogPageSizes.find((size) => String(size) === elements.size.value) ?? 10,
    page: 1
  };
}

function setArticleCatalogControls(elements, view) {
  elements.query.value = view.query.replace(/[\r\n]/gu, ' ');
  elements.language.value = view.language;
  elements.sort.value = view.sort;
  elements.size.value = String(view.size);
}

function writeArticleCatalogUrl(view, method) {
  const url = new URL(window.location.href);
  for (const parameter of articleCatalogOwnParameters) url.searchParams.delete(parameter);
  const query = normalizeArticleCatalogQuery(view.query);
  if (query) url.searchParams.append('q', query);
  if (view.language !== 'all') url.searchParams.append('lang', view.language);
  if (view.sort !== 'date-desc') url.searchParams.append('sort', view.sort);
  if (view.size !== 10) url.searchParams.append('size', String(view.size));
  if (view.page > 1) url.searchParams.append('page', String(view.page));

  if (url.href === window.location.href) return;
  window.history[method](null, '', url.href);
}

function updateArticleCatalogLanguageLink(locale) {
  const languageLink = document.querySelector('.lang-toggle');
  if (!languageLink) return;
  const url = new URL(window.location.href);
  url.pathname = locale === 'es' ? '/articles/' : '/es/articles/';
  languageLink.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
}

function renderArticleCatalogPage(elements, snapshot, locale, copy, view) {
  const group = snapshot.groups.articles;
  const terms = tokenizeArticleCatalogQuery(view.query);
  const filteredRecords = group.records
    .filter((record) => (view.language === 'all' || record.language === view.language)
      && articleCatalogRecordMatches(record, terms))
    .sort((left, right) => compareArticleCatalogRecords(left, right, view.sort));
  const pageCount = Math.ceil(filteredRecords.length / view.size);
  view.page = pageCount === 0 ? 1 : Math.max(1, Math.min(view.page, pageCount));
  const start = (view.page - 1) * view.size;
  const visibleRecords = filteredRecords.slice(start, start + view.size);

  elements.list.replaceChildren(...visibleRecords.map((record) => createArticleCatalogRow(record, locale, copy)));
  elements.empty.textContent = group.records.length === 0
    ? copy.empty
    : terms.length > 0 ? copy.noSearchResults : copy.noResults;
  elements.empty.hidden = filteredRecords.length !== 0;
  elements.range.textContent = filteredRecords.length === 0
    ? copy.emptyRange()
    : copy.range(start + 1, start + visibleRecords.length, filteredRecords.length);
  elements.previous.disabled = pageCount === 0 || view.page === 1;
  elements.next.disabled = pageCount === 0 || view.page >= pageCount;
  elements.results.hidden = false;
  return view;
}

async function loadArticleCatalog(root) {
  const elements = getArticleCatalogElements(root);
  if (!elements) return;
  const locale = root.dataset.catalogLocale === 'es' ? 'es' : 'en';
  const copy = getArticleCatalogCopy(elements, locale);
  renderArticleCatalogLoading(elements, copy);
  let restoreCatalogView = null;
  window.addEventListener('popstate', () => {
    if (restoreCatalogView) restoreCatalogView();
    else updateArticleCatalogLanguageLink(locale);
  });
  updateArticleCatalogLanguageLink(locale);

  const snapshot = await loadSharedSnapshot(root.dataset.catalogSource);
  const group = snapshot?.groups?.articles;
  if (!group || group.definitionVersion !== 2) {
    renderArticleCatalogUnavailable(elements, copy, group?.definitionVersion === 1);
    return;
  }

  elements.status.textContent = '';
  elements.status.hidden = true;
  elements.collectedDate.textContent = formatCollectedDate(group.collectedAt, locale);
  elements.coverage.textContent = group.sources.map(({ label }) => label).join(' · ');
  setArticleCatalogControlsDisabled(elements, false);
  if (elements.fallback) elements.fallback.hidden = true;
  root.setAttribute('aria-busy', 'false');
  const restoreFromUrl = () => {
    const { view } = readArticleCatalogUrlState();
    setArticleCatalogControls(elements, view);
    renderArticleCatalogPage(elements, snapshot, locale, copy, view);
    writeArticleCatalogUrl(view, 'replaceState');
    updateArticleCatalogLanguageLink(locale);
    return view;
  };
  let currentView = restoreFromUrl();

  const commitControls = (method, query = currentView.query) => {
    const nextView = readArticleCatalogControls(elements, query);
    const sameControls = nextView.query === currentView.query
      && nextView.language === currentView.language
      && nextView.sort === currentView.sort
      && nextView.size === currentView.size;
    if (sameControls && nextView.page === currentView.page) return;
    renderArticleCatalogPage(elements, snapshot, locale, copy, nextView);
    writeArticleCatalogUrl(nextView, method);
    updateArticleCatalogLanguageLink(locale);
    currentView = nextView;
  };

  elements.query.addEventListener('input', () => commitControls('replaceState', elements.query.value));

  elements.language.addEventListener('change', () => {
    commitControls('pushState');
  });
  elements.sort.addEventListener('change', () => {
    commitControls('pushState');
  });
  elements.size.addEventListener('change', () => {
    commitControls('pushState');
  });
  elements.previous.addEventListener('click', () => {
    if (currentView.page <= 1) return;
    const nextView = { ...currentView, page: currentView.page - 1 };
    renderArticleCatalogPage(elements, snapshot, locale, copy, nextView);
    writeArticleCatalogUrl(nextView, 'pushState');
    updateArticleCatalogLanguageLink(locale);
    currentView = nextView;
  });
  elements.next.addEventListener('click', () => {
    if (elements.next.disabled) return;
    const nextView = { ...currentView, page: currentView.page + 1 };
    renderArticleCatalogPage(elements, snapshot, locale, copy, nextView);
    writeArticleCatalogUrl(nextView, 'pushState');
    updateArticleCatalogLanguageLink(locale);
    currentView = nextView;
  });
  restoreCatalogView = () => { currentView = restoreFromUrl(); };
}

const section = document.getElementById('content-stats');
if (section) void loadContentStats(section);
const articleCatalog = document.getElementById('article-catalog');
if (articleCatalog) void loadArticleCatalog(articleCatalog);
