const endpointPath = '/content-stats/v1/current.json';
const knownKinds = ['articles', 'talks', 'books', 'newsletter'];
const knownViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownSearchPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const knownDirectoryViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownDirectoryOutboundClickPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownNewsletterEmailPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const allowedKeys = {
  document: ['groups', 'schemaVersion'],
  group: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'],
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

function hasSources(group, kind) {
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
    if (sourceIds[0] !== 'caylent' || (sourceIds.length > 1 && sourceIds[1] !== 'builder-center')) return false;
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

function validateGroup(value, kind) {
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

function renderNewsletterEmailLoading(elements) {
  if (!newsletterEmailElementsReady(elements)) return;
  elements.region.hidden = false;
  elements.results.hidden = true;
  clearNewsletterEmailResult(elements);
  elements.status.hidden = false;
}

function renderNewsletterEmailUnavailable(elements, locale, hidden = false) {
  if (!newsletterEmailElementsReady(elements)) return;
  elements.region.hidden = hidden;
  elements.results.hidden = true;
  clearNewsletterEmailResult(elements);
  elements.status.textContent = hidden
    ? ''
    : elements.region.getAttribute(`${elements.attributePrefix}-unavailable`)?.trim()
      || (locale === 'es' ? 'No se pueden mostrar estos datos para este período.' : 'These figures are unavailable for this period.');
  elements.status.hidden = hidden;
}

function renderNewsletterEmailMetric(snapshot, locale, language, period, elements) {
  if (!newsletterEmailElementsReady(elements)) return;
  if (language === 'es' || !knownNewsletterEmailPeriods.includes(period)) {
    renderNewsletterEmailUnavailable(elements, locale, language === 'es');
    return;
  }

  const record = snapshot?.[elements.family]?.[period];
  if (!record) {
    renderNewsletterEmailUnavailable(elements, locale);
    return;
  }

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

function clearViewsResult(views) {
  views.value.textContent = '';
  views.coverage.textContent = '';
  views.interval.textContent = '';
  views.collectedDate.textContent = '';
  views.qualifications.textContent = '';
  views.qualifications.hidden = true;
}

function renderViewsUnavailable(elements, locale) {
  const { views } = elements;
  views.results.hidden = true;
  clearViewsResult(views);
  views.status.textContent = views.region.dataset.statsViewsUnavailable?.trim()
    || (locale === 'es' ? 'No se pueden mostrar las vistas para este período.' : 'Views are unavailable for this period.');
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

  if (language === 'es') {
    renderViewsUnavailable(elements, locale);
    return;
  }

  const period = knownViewPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const record = records?.[period];
  if (!record) {
    renderViewsUnavailable(elements, locale);
    return;
  }

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

function renderSearchUnavailable(elements, locale) {
  const { search } = elements;
  search.results.hidden = true;
  clearSearchResult(search);
  search.status.textContent = search.region.dataset.statsSearchUnavailable?.trim()
    || (locale === 'es' ? 'No se pueden mostrar los clics de búsqueda para este período.' : 'Search clicks are unavailable for this period.');
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
  if (language === 'es' || periodSelector.value === 'total') {
    renderSearchUnavailable(elements, locale);
    return;
  }

  const period = knownSearchPeriods.includes(periodSelector.value) ? periodSelector.value : '12m';
  const record = snapshot?.articleSearchClicks?.[period];
  if (!record) {
    renderSearchUnavailable(elements, locale);
    return;
  }

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

function renderDirectoryViewsUnavailable(elements, locale, hidden = false) {
  const { directoryViews } = elements;
  directoryViews.region.hidden = hidden;
  directoryViews.results.hidden = true;
  clearDirectoryViewsResult(directoryViews);
  directoryViews.status.textContent = directoryViews.region.dataset.statsDirectoryViewsUnavailable?.trim()
    || (locale === 'es'
      ? 'Las vistas de página de Dónde Aprendo AWS no están disponibles para este período.'
      : 'Dónde Aprendo AWS page views are unavailable for this period.');
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
  const record = snapshot?.directoryViews?.[period];
  if (!record) {
    renderDirectoryViewsUnavailable(elements, locale);
    return;
  }

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

function renderDirectoryOutboundClicksUnavailable(elements, locale, hidden = false) {
  const { directoryOutboundClicks: clicks } = elements;
  clicks.region.hidden = hidden;
  clicks.results.hidden = true;
  clearDirectoryOutboundClicksResult(clicks);
  clicks.status.textContent = clicks.card.dataset.statsDirectoryOutboundClicksUnavailable?.trim()
    || (locale === 'es'
      ? 'Clics en enlaces externos de Dónde Aprendo AWS: no disponibles para este período.'
      : 'Dónde Aprendo AWS external link clicks are unavailable for this period.');
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
  const record = snapshot?.directoryOutboundClicks?.[period];
  if (!record) {
    renderDirectoryOutboundClicksUnavailable(elements, locale);
    return;
  }

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

  let snapshot = null;
  try {
    const source = section.dataset.statsSource;
    const requestUrl = new URL(source, window.location.href);
    if (requestUrl.origin !== window.location.origin
      || requestUrl.pathname !== endpointPath
      || requestUrl.search
      || requestUrl.hash) throw new Error('Unsupported statistics endpoint');

    const response = await fetch(requestUrl.href, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Statistics request failed');
    snapshot = validateSnapshot(await response.json());
    if (!snapshot) throw new Error('Unsupported statistics response');
  } catch {
    // A document, network, or HTTP failure invalidates the whole snapshot.
  }

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

const section = document.getElementById('content-stats');
if (section) void loadContentStats(section);
