const endpointPath = '/content-stats/v1/current.json';
const knownKinds = ['articles', 'talks', 'books', 'newsletter'];
const allowedKeys = {
  document: ['groups', 'schemaVersion'],
  group: ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'],
  counts: ['all', 'en', 'es'],
  source: ['id', 'label'],
  newsletterGroup: ['basis', 'collectedAt', 'definitionVersion', 'publication', 'scopeId', 'subscribers'],
  publication: ['id', 'label', 'language']
};
const supportedArticleSources = new Map([
  ['caylent', 'Caylent'],
  ['builder-center', 'AWS Builder Center']
]);
const supportedCuratedSource = { id: 'website-inventory', label: 'Website inventory' };
const supportedNewsletter = { id: 'simple-aws', label: 'Simple AWS' };

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
    return ids.has('caylent') && (sources.length === 1 || (sources.length === 2 && ids.has('builder-center')));
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

function validateSnapshot(value) {
  if (!isRecord(value)
    || !hasOnlyKeys(value, allowedKeys.document)
    || value.schemaVersion !== 1
    || !isRecord(value.groups)
    || !hasAllowedKeys(value.groups, knownKinds)) return null;

  return Object.fromEntries(knownKinds.map((kind) => [
    kind,
    Object.hasOwn(value.groups, kind) ? validateGroup(value.groups[kind], kind) : null
  ]));
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

  return {
    cards,
    selector: section.querySelector('[data-stats-language]')
  };
}

function getLocale(section) {
  return section.dataset.statsLocale === 'es' ? 'es' : 'en';
}

function formatCollectedDate(timestamp, locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(timestamp));
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

  let groups = null;
  try {
    const source = section.dataset.statsSource;
    const requestUrl = new URL(source, window.location.href);
    if (requestUrl.origin !== window.location.origin
      || requestUrl.pathname !== endpointPath
      || requestUrl.search
      || requestUrl.hash) throw new Error('Unsupported statistics endpoint');

    const response = await fetch(requestUrl.href, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Statistics request failed');
    groups = validateSnapshot(await response.json());
    if (!groups) throw new Error('Unsupported statistics response');
  } catch {
    // A document, network, or HTTP failure invalidates the whole snapshot.
  }

  renderAll(groups, locale, elements.selector.value, elements);
  elements.selector.addEventListener('change', () => renderAll(groups, locale, elements.selector.value, elements));
}

const section = document.getElementById('content-stats');
if (section) void loadContentStats(section);
