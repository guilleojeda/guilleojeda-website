const endpointPath = '/content-stats/v1/current.json';
const allowedKeys = {
  document: ['groups', 'schemaVersion'],
  groups: ['articles'],
  articles: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'],
  counts: ['all', 'en', 'es'],
  source: ['id', 'label']
};
const supportedSources = new Map([
  ['caylent', 'Caylent'],
  ['builder-center', 'AWS Builder Center']
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
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

function hasSupportedSources(sources) {
  if (!Array.isArray(sources) || (sources.length !== 1 && sources.length !== 2)) return false;

  const ids = new Set();
  for (const source of sources) {
    if (!hasOnlyKeys(source, allowedKeys.source)
      || typeof source.id !== 'string'
      || ids.has(source.id)
      || supportedSources.get(source.id) !== source.label) return false;
    ids.add(source.id);
  }

  return ids.has('caylent') && (sources.length === 1 || ids.has('builder-center'));
}

function validateSnapshot(value) {
  if (!hasOnlyKeys(value, allowedKeys.document) || value.schemaVersion !== 1) return null;
  if (!hasOnlyKeys(value.groups, allowedKeys.groups)) return null;

  const articles = value.groups.articles;
  if (!hasOnlyKeys(articles, allowedKeys.articles)
    || articles.definitionVersion !== 1
    || articles.basis !== 'cumulative'
    || !isSupportedTimestamp(articles.collectedAt)
    || !isSupportedScope(articles.scopeId)
    || !hasSupportedSources(articles.sources)) return null;

  const counts = articles.counts;
  if (!hasOnlyKeys(counts, allowedKeys.counts)
    || !isNonnegativeCount(counts.all)
    || !isNonnegativeCount(counts.en)
    || !isNonnegativeCount(counts.es)
    || counts.all !== counts.en + counts.es) return null;

  return articles;
}

function getElements(section) {
  return {
    card: section.querySelector('[data-stats-kind="articles"]'),
    selector: section.querySelector('[data-stats-language]'),
    status: section.querySelector('[data-stats-status]'),
    results: section.querySelector('[data-stats-results]'),
    count: section.querySelector('[data-stats-count]'),
    countLabel: section.querySelector('[data-stats-count-label]'),
    coverage: section.querySelector('[data-stats-coverage]'),
    collectedDate: section.querySelector('[data-stats-collected-date]')
  };
}

function getLocale(section) {
  return section.dataset.statsLocale === 'es' ? 'es' : 'en';
}

function formatCollectedDate(timestamp, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(timestamp));
}

function renderArticles(articles, locale, elements) {
  const language = elements.selector.value;
  const count = articles.counts[language];
  elements.count.textContent = new Intl.NumberFormat(locale).format(count);
  elements.coverage.textContent = articles.sources.map((source) => source.label).join(', ');
  elements.collectedDate.textContent = formatCollectedDate(articles.collectedAt, locale);
  elements.results.hidden = false;
}

async function loadContentStats(section) {
  const elements = getElements(section);
  if (!elements.card || !elements.selector || !elements.status || !elements.results
    || !elements.count || !elements.countLabel || !elements.coverage || !elements.collectedDate) return;

  const locale = getLocale(section);
  const unavailableMessage = section.dataset.statsUnavailable?.trim();
  if (!unavailableMessage) return;

  elements.selector.disabled = false;
  elements.status.hidden = false;
  elements.card.setAttribute('aria-busy', 'true');

  try {
    const source = section.dataset.statsSource;
    const requestUrl = new URL(source, window.location.href);
    if (requestUrl.origin !== window.location.origin
      || requestUrl.pathname !== endpointPath
      || requestUrl.search
      || requestUrl.hash) throw new Error('Unsupported statistics endpoint');

    const response = await fetch(requestUrl.href, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Statistics request failed');

    const articles = validateSnapshot(await response.json());
    if (!articles) throw new Error('Unsupported statistics response');

    elements.status.hidden = true;
    elements.status.textContent = '';
    elements.card.setAttribute('aria-busy', 'false');
    renderArticles(articles, locale, elements);
    elements.selector.addEventListener('change', () => renderArticles(articles, locale, elements));
  } catch {
    elements.status.textContent = unavailableMessage;
    elements.status.hidden = false;
    elements.card.setAttribute('aria-busy', 'false');
    elements.results.hidden = true;
  }
}

const section = document.getElementById('content-stats');
if (section) void loadContentStats(section);
