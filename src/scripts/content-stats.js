const endpointPath = '/content-stats/v1/current.json';
const knownKinds = ['articles', 'talks', 'books', 'newsletter'];
const knownViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownSearchPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const knownDirectoryViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const knownDirectoryOutboundClickPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const allowedKeys = {
  document: ['groups', 'schemaVersion'],
  group: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'],
  counts: ['all', 'en', 'es'],
  source: ['id', 'label'],
  newsletterGroup: ['basis', 'collectedAt', 'definitionVersion', 'publication', 'scopeId', 'subscribers'],
  publication: ['id', 'label', 'language'],
  articleViewsGroup: ['definitionVersion', 'records'],
  articleViewsRecord: ['basis', 'collectedAt', 'scopeId', 'publication', 'timeZone', 'startDate', 'endDate', 'views', 'qualifications'],
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
  ['cloudy-things', 'Cloudy Things']
]);
const supportedArticleSourceSets = new Set([
  'caylent',
  'caylent,builder-center',
  'caylent,builder-center,simple-aws',
  'caylent,builder-center,cloudy-things',
  'caylent,builder-center,simple-aws,cloudy-things'
]);
const supportedCuratedSource = { id: 'website-inventory', label: 'Website inventory' };
const supportedNewsletter = { id: 'simple-aws', label: 'Simple AWS' };
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
    return supportedArticleSourceSets.has(sources.map((source) => source.id).join(','));
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

function validateSnapshot(value) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, allowedKeys.document)
    || value.schemaVersion !== 1
    || !isRecord(value.groups)
    || !hasAllowedKeys(value.groups, [...knownKinds, 'articleViews', 'articleSearchClicks', 'directoryViews', 'directoryOutboundClicks'])) return null;

  return {
    groups: Object.fromEntries(knownKinds.map((kind) => [
      kind,
      Object.hasOwn(value.groups, kind) ? validateGroup(value.groups[kind], kind) : null
    ])),
    articleViews: Object.hasOwn(value.groups, 'articleViews') ? validateArticleViews(value.groups.articleViews) : null,
    articleSearchClicks: Object.hasOwn(value.groups, 'articleSearchClicks')
      ? validateArticleSearchClicks(value.groups.articleSearchClicks)
      : null,
    directoryViews: Object.hasOwn(value.groups, 'directoryViews')
      ? validateDirectoryViews(value.groups.directoryViews)
      : null,
    directoryOutboundClicks: Object.hasOwn(value.groups, 'directoryOutboundClicks')
      ? validateDirectoryOutboundClicks(value.groups.directoryOutboundClicks)
      : null
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
    selector: section.querySelector('[data-stats-language]'),
    periodSelector: section.querySelector('[data-stats-period]'),
    totalOption: section.querySelector('[data-stats-period]')?.querySelector('[value="total"]') ?? null,
    views,
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

function renderNewsletterGroup(group, locale, language, elements) {
  if (language !== 'all' && language !== group.publication.language) {
    elements.card.hidden = true;
    elements.results.hidden = true;
    elements.count.textContent = '';
    elements.coverage.textContent = '';
    elements.collectedDate.textContent = '';
    elements.status.hidden = true;
    elements.status.textContent = '';
    elements.card.setAttribute('aria-busy', 'false');
    return;
  }

  renderCount(group.subscribers, group.publication.label, group.collectedAt, locale, elements);
}

function renderAll(groups, locale, language, elements) {
  for (const kind of knownKinds) {
    const card = elements.cards[kind];
    const group = groups?.[kind];
    if (!card || !group) {
      if (card) renderUnavailable(card);
      continue;
    }
    if (kind === 'newsletter') renderNewsletterGroup(group, locale, language, card);
    else renderGroup(group, locale, language, card);
  }
}

const qualificationCopy = {
  en: {
    sampled: 'Sampled report',
    thresholding: 'Thresholding applied',
    'other-row': 'Other rows omitted'
  },
  es: {
    sampled: 'Informe con muestreo',
    thresholding: 'Aplicación de umbral',
    'other-row': 'Otras filas omitidas'
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
  for (const kind of knownKinds) {
    const card = elements.cards[kind];
    card.status.hidden = false;
    card.card.setAttribute('aria-busy', 'true');
  }
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

  renderAll(snapshot?.groups ?? null, locale, elements.selector.value, elements);
  if (snapshot && (viewsElementsReady(elements) || searchElementsReady(elements)
    || directoryViewsElementsReady(elements) || directoryOutboundClicksElementsReady(elements))) {
    elements.periodSelector.disabled = false;
  }
  else if (elements.totalOption) elements.totalOption.disabled = true;
  renderActivity(snapshot, locale, elements.selector.value, elements);
  elements.selector.addEventListener('change', () => {
    renderAll(snapshot?.groups ?? null, locale, elements.selector.value, elements);
    renderActivity(snapshot, locale, elements.selector.value, elements);
  });
  if (viewsElementsReady(elements) || searchElementsReady(elements)
    || directoryViewsElementsReady(elements) || directoryOutboundClicksElementsReady(elements)) {
    elements.periodSelector.addEventListener('change', () => {
      renderActivity(snapshot, locale, elements.selector.value, elements);
    });
  }
}

const section = document.getElementById('content-stats');
if (section) void loadContentStats(section);
