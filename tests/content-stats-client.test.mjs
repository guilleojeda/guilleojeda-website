import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const clientSource = readFileSync(new URL('../src/scripts/content-stats.js', import.meta.url), 'utf8');
const collectedAt = '2026-08-04T00:00:00.000Z';
const talksCollectedAt = '2026-07-28T00:00:00.000Z';
const booksCollectedAt = '2026-06-30T00:00:00.000Z';
const newsletterCollectedAt = '2026-08-01T00:00:00.000Z';
const caylent = { id: 'caylent', label: 'Caylent' };
const builderCenter = { id: 'builder-center', label: 'AWS Builder Center' };
const websiteInventory = { id: 'website-inventory', label: 'Website inventory' };
const simpleAws = { id: 'simple-aws', label: 'Simple AWS' };
const cloudyThings = { id: 'cloudy-things', label: 'Cloudy Things' };
const articleViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const articleSearchPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const directoryViewPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const directoryOutboundClickPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const newsletterEmailPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const newsletterEmailMetricSpecs = [
  { group: 'newsletterEmailOpens', metric: 'opens', region: 'emailOpens', label: { en: /email opens?/i, es: /aperturas? de emails?/i } },
  { group: 'newsletterEmailVerifiedClicks', metric: 'clicks', region: 'emailVerifiedClicks', label: { en: /verified email clicks?/i, es: /clics? verificados? en emails?/i } }
];
const newsletterEmailFacts = {
  '7d': { value: 7, collectedAt: '2026-09-08T00:00:00.000Z', startDate: '2026-09-01', endDate: '2026-09-07' },
  '30d': { value: 30, collectedAt: '2026-09-09T00:00:00.000Z', startDate: '2026-08-09', endDate: '2026-09-07' },
  '90d': { value: 90, collectedAt: '2026-09-10T00:00:00.000Z', startDate: '2026-06-10', endDate: '2026-09-07' },
  '12m': { value: 1200, collectedAt: '2026-09-11T00:00:00.000Z', startDate: '2025-09-08', endDate: '2026-09-07' },
  ytd: { value: 800, collectedAt: '2026-09-12T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-09-07' }
};
const directoryViewPeriodFacts = {
  '7d': { views: 17, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-25', endDate: '2026-08-31', qualifications: ['sampled'] },
  '30d': { views: 47, collectedAt: '2026-09-04T00:00:00.000Z', startDate: '2026-08-02', endDate: '2026-08-31', qualifications: ['thresholding'] },
  '90d': { views: 147, collectedAt: '2026-09-05T00:00:00.000Z', startDate: '2026-06-03', endDate: '2026-08-31', qualifications: ['other-row'] },
  '12m': { views: 1470, collectedAt: '2026-09-06T00:00:00.000Z', startDate: '2025-09-01', endDate: '2026-08-31', qualifications: ['sampled', 'thresholding', 'other-row'] },
  ytd: { views: 970, collectedAt: '2026-09-07T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-08-31', qualifications: [] },
  total: { views: 24378, collectedAt: '2026-09-07T00:00:00.000Z', startDate: '2024-01-21', endDate: '2026-08-31', qualifications: ['sampled'] }
};

const directoryOutboundClickPeriodFacts = {
  '7d': { clicks: 6, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-25', endDate: '2026-08-31', qualifications: ['other-row'] },
  '30d': { clicks: 41, collectedAt: '2026-09-04T00:00:00.000Z', startDate: '2026-08-02', endDate: '2026-08-31', qualifications: ['sampled'] },
  '90d': { clicks: 206, collectedAt: '2026-09-05T00:00:00.000Z', startDate: '2026-06-03', endDate: '2026-08-31', qualifications: ['thresholding'] },
  '12m': { clicks: 3111, collectedAt: '2026-09-06T00:00:00.000Z', startDate: '2025-09-01', endDate: '2026-08-31', qualifications: ['sampled', 'other-row'] },
  ytd: { clicks: 1901, collectedAt: '2026-09-07T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-08-31', qualifications: ['thresholding'] },
  total: { clicks: 2272, collectedAt: '2026-09-07T00:00:00.000Z', startDate: '2024-01-21', endDate: '2026-08-31', qualifications: ['other-row'] }
};

const articleViewPeriodFacts = {
  '7d': { views: 7, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-25', endDate: '2026-08-31', qualifications: ['sampled'] },
  '30d': { views: 30, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-02', endDate: '2026-08-31', qualifications: ['thresholding'] },
  '90d': { views: 90, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-06-03', endDate: '2026-08-31', qualifications: ['other-row'] },
  '12m': { views: 1200, collectedAt: '2026-09-04T00:00:00.000Z', startDate: '2025-09-01', endDate: '2026-08-31', qualifications: ['sampled', 'thresholding', 'other-row'] },
  ytd: { views: 800, collectedAt: '2026-09-05T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-08-31', qualifications: [] },
  total: { views: 3000, collectedAt: '2026-09-06T00:00:00.000Z', startDate: '2026-04-15', endDate: '2026-08-31', qualifications: ['sampled', 'other-row'] }
};

const articleSearchPeriodFacts = {
  '7d': { clicks: 7, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-25', endDate: '2026-08-31' },
  '30d': { clicks: 30, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-02', endDate: '2026-08-31' },
  '90d': { clicks: 90, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-06-03', endDate: '2026-08-31' },
  '12m': { clicks: 1200, collectedAt: '2026-09-04T00:00:00.000Z', startDate: '2025-09-01', endDate: '2026-08-31' },
  ytd: { clicks: 800, collectedAt: '2026-09-05T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-08-31' }
};

function aggregateGroup({
  counts,
  collectedAt: groupCollectedAt = collectedAt,
  scopeId = 'scope-2026-08',
  sources = [caylent],
  definitionVersion = 1
}) {
  return {
    definitionVersion,
    basis: 'cumulative',
    collectedAt: groupCollectedAt,
    scopeId,
    sources,
    counts
  };
}

function snapshot({ sources = [caylent], schemaVersion = 1, definitionVersion = 1 } = {}) {
  return {
    schemaVersion,
    groups: {
      articles: aggregateGroup({
        definitionVersion,
        sources,
        counts: { all: 40, en: 40, es: 0 }
      })
    }
  };
}

function threeGroupSnapshot() {
  return {
    schemaVersion: 1,
    groups: {
      articles: aggregateGroup({
        sources: [caylent, builderCenter],
        scopeId: 'article-scope-2026-08',
        counts: { all: 11, en: 7, es: 4 }
      }),
      talks: aggregateGroup({
        collectedAt: talksCollectedAt,
        scopeId: 'talks-scope-2026-07',
        sources: [websiteInventory],
        counts: { all: 6, en: 2, es: 4 }
      }),
      books: aggregateGroup({
        collectedAt: booksCollectedAt,
        scopeId: 'books-scope-2026-06',
        sources: [websiteInventory],
        counts: { all: 3, en: 2, es: 1 }
      })
    }
  };
}

function newsletterGroup({
  subscribers = 27,
  collectedAt: groupCollectedAt = newsletterCollectedAt,
  scopeId = 'a'.repeat(64),
  publication = { ...simpleAws, language: 'en' },
  definitionVersion = 1,
  basis = 'current'
} = {}) {
  return { definitionVersion, basis, collectedAt: groupCollectedAt, scopeId, publication, subscribers };
}

function newsletterSentGroup({
  sent = 4321,
  collectedAt: groupCollectedAt = '2026-09-01T00:00:00.000Z',
  scopeId = 'f'.repeat(64),
  publication = { ...simpleAws, language: 'en' },
  definitionVersion = 1,
  basis = 'cumulative'
} = {}) {
  return { definitionVersion, basis, collectedAt: groupCollectedAt, scopeId, publication, sent };
}

function builderArticleViewsGroup({
  views = { all: 120, en: 72, es: 48 },
  collectedAt: groupCollectedAt = '2026-09-16T00:00:00.000Z',
  scopeId = '9'.repeat(64),
  source = { ...builderCenter },
  startDate = '2026-01-06',
  definitionVersion = 1,
  basis = 'recorded-total'
} = {}) {
  return { definitionVersion, basis, collectedAt: groupCollectedAt, scopeId, source, startDate, views };
}

function snapshotWithNewsletter(options = {}) {
  const data = threeGroupSnapshot();
  data.groups.newsletter = newsletterGroup(options);
  return data;
}

function snapshotWithNewsletterSent({ data = snapshotWithNewsletter(), group = newsletterSentGroup() } = {}) {
  data.groups.newsletterEmailsSent = group;
  return data;
}

function newsletterEmailRecord(metric, period, overrides = {}) {
  const facts = newsletterEmailFacts[period];
  const scopeCharacter = 'abcde'[newsletterEmailPeriods.indexOf(period)];
  return {
    basis: 'period',
    collectedAt: facts.collectedAt,
    scopeId: scopeCharacter.repeat(64),
    publication: { id: 'simple-aws', label: 'Simple AWS', language: 'en' },
    timeZone: 'UTC',
    startDate: facts.startDate,
    endDate: facts.endDate,
    [metric]: facts.value,
    ...overrides
  };
}

function newsletterEmailRecords(metric) {
  return Object.fromEntries(newsletterEmailPeriods.map((period) => [period, newsletterEmailRecord(metric, period)]));
}

function snapshotWithNewsletterEngagements({ data = snapshotWithNewsletter(), opens = newsletterEmailRecords('opens'), clicks = newsletterEmailRecords('clicks') } = {}) {
  data.groups.newsletterEmailOpens = { definitionVersion: 1, records: opens };
  data.groups.newsletterEmailVerifiedClicks = { definitionVersion: 1, records: clicks };
  return data;
}

function directoryViewsRecord(period, overrides = {}) {
  const facts = directoryViewPeriodFacts[period];
  return {
    basis: period === 'total' ? 'recorded-total' : 'period',
    collectedAt: facts.collectedAt,
    scopeId: (period === 'total' ? 'e' : 'd').repeat(64),
    publication: { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS', language: 'es' },
    timeZone: 'America/Buenos_Aires',
    startDate: facts.startDate,
    endDate: facts.endDate,
    views: facts.views,
    qualifications: [...facts.qualifications],
    ...overrides
  };
}

function directoryViewsRecords() {
  return Object.fromEntries(directoryViewPeriods.map((period) => [period, directoryViewsRecord(period)]));
}

function snapshotWithDirectoryViews({ data = snapshotWithArticleSearchClicks(), records = directoryViewsRecords(), definitionVersion = 1 } = {}) {
  data.groups.directoryViews = { definitionVersion, records };
  return data;
}

function directoryOutboundClicksRecord(period, overrides = {}) {
  const facts = directoryOutboundClickPeriodFacts[period];
  return {
    basis: period === 'total' ? 'recorded-total' : 'period',
    collectedAt: facts.collectedAt,
    scopeId: (period === 'total' ? 'b' : 'a').repeat(64),
    publication: { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS', language: 'es' },
    timeZone: 'America/Buenos_Aires',
    startDate: facts.startDate,
    endDate: facts.endDate,
    clicks: facts.clicks,
    qualifications: [...facts.qualifications],
    ...overrides
  };
}

function directoryOutboundClicksRecords() {
  return Object.fromEntries(directoryOutboundClickPeriods.map((period) => [period, directoryOutboundClicksRecord(period)]));
}

function snapshotWithDirectoryOutboundClicks({
  data = snapshotWithDirectoryViews(),
  records = directoryOutboundClicksRecords(),
  definitionVersion = 1
} = {}) {
  data.groups.directoryOutboundClicks = { definitionVersion, records };
  return data;
}

function articleViewsRecord(period, overrides = {}) {
  const facts = articleViewPeriodFacts[period];
  return {
    basis: period === 'total' ? 'recorded-total' : 'period',
    collectedAt: facts.collectedAt,
    scopeId: (period === 'total' ? 'c' : 'b').repeat(64),
    publication: { ...simpleAws, language: 'en' },
    timeZone: 'America/Argentina/Cordoba',
    startDate: facts.startDate,
    endDate: facts.endDate,
    views: facts.views,
    qualifications: [...facts.qualifications],
    ...overrides
  };
}

function articleViewsRecords() {
  return Object.fromEntries(articleViewPeriods.map((period) => [period, articleViewsRecord(period)]));
}

function snapshotWithArticleViews({ records = articleViewsRecords(), definitionVersion = 1 } = {}) {
  const data = snapshotWithNewsletter();
  data.groups.articleViews = { definitionVersion, records };
  return data;
}

function snapshotWithBuilderArticleViews({ data = snapshotWithArticleViews(), group = builderArticleViewsGroup() } = {}) {
  data.groups.builderArticleViews = group;
  return data;
}

function articleSearchRecord(period, overrides = {}) {
  const facts = articleSearchPeriodFacts[period];
  return {
    basis: 'period',
    collectedAt: facts.collectedAt,
    scopeId: 'd'.repeat(64),
    publication: { ...simpleAws, language: 'en' },
    timeZone: 'America/Los_Angeles',
    startDate: facts.startDate,
    endDate: facts.endDate,
    clicks: facts.clicks,
    ...overrides
  };
}

function articleSearchRecords() {
  return Object.fromEntries(articleSearchPeriods.map((period) => [period, articleSearchRecord(period)]));
}

function snapshotWithArticleSearchClicks({ records = articleSearchRecords(), definitionVersion = 1, includeViews = true } = {}) {
  const data = includeViews ? snapshotWithArticleViews() : snapshotWithNewsletter();
  data.groups.articleSearchClicks = { definitionVersion, records };
  return data;
}

function toDatasetKey(attribute) {
  return attribute.slice('data-'.length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function getAttribute(element, name) {
  if (name.startsWith('data-')) return element.dataset[toDatasetKey(name)];
  return element.attributes.get(name);
}

function matchesSimpleSelector(element, selector) {
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return element.classList.includes(selector.slice(1));

  const attributeMatch = selector.match(/^\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]$/);
  if (!attributeMatch) return false;
  const [, name, expected] = attributeMatch;
  const actual = getAttribute(element, name);
  return expected === undefined ? actual !== undefined : String(actual) === expected;
}

function matchesSelector(element, selector) {
  return selector.split(',').some((alternative) => {
    const parts = alternative.trim().split(/\s+/);
    let current = element;
    if (!matchesSimpleSelector(current, parts.at(-1))) return false;
    for (let index = parts.length - 2; index >= 0; index -= 1) {
      current = current.parentNode;
      while (current && !matchesSimpleSelector(current, parts[index])) current = current.parentNode;
      if (!current) return false;
    }
    return true;
  });
}

class SemanticElement {
  constructor({ dataset = {}, attributes = {}, textContent = '', hidden = false, disabled = false, value = '' } = {}) {
    this.dataset = { ...dataset };
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
    this.hidden = hidden;
    this.disabled = disabled;
    this.value = value;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
  }

  get id() { return this.attributes.get('id') ?? ''; }
  get classList() { return (this.attributes.get('class') ?? '').split(/\s+/).filter(Boolean); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelectorAll(selector) {
    return this.descendants().filter((element) => matchesSelector(element, selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    const value = getAttribute(this, name);
    return value === undefined ? null : String(value);
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  dispatch(name) {
    for (const callback of this.listeners.get(name) ?? []) callback({ type: name, target: this });
  }
}

const unavailableCopy = {
  en: {
    articles: 'Article statistics are temporarily unavailable.',
    talks: 'Speaking statistics are temporarily unavailable.',
    books: 'Book statistics are temporarily unavailable.',
    newsletter: 'Newsletter statistics are temporarily unavailable.'
  },
  es: {
    articles: 'No se pueden cargar las estadísticas de artículos por el momento.',
    talks: 'Las estadísticas de sesiones no están disponibles por el momento.',
    books: 'Las estadísticas de libros no están disponibles por el momento.',
    newsletter: 'Las estadísticas del boletín no están disponibles por el momento.'
  }
};

const loadingCopy = {
  en: { articles: 'Loading article statistics…', talks: 'Loading speaking statistics…', books: 'Loading book statistics…', newsletter: 'Loading newsletter statistics…' },
  es: { articles: 'Cargando estadísticas de artículos…', talks: 'Cargando estadísticas de sesiones…', books: 'Cargando estadísticas de libros…', newsletter: 'Cargando estadísticas del boletín…' }
};

const initialUnits = {
  en: { articles: 'published articles', talks: 'sessions', books: 'published books', newsletter: 'active subscribers' },
  es: { articles: 'artículos publicados', talks: 'sesiones', books: 'libros publicados', newsletter: 'suscriptores activos' }
};

const viewsCopy = {
  en: {
    loading: 'Loading article views…',
    unavailable: 'Views are unavailable for this period.',
    unit: 'views'
  },
  es: {
    loading: 'Cargando vistas de artículos…',
    unavailable: 'Las vistas no están disponibles para este período.',
    unit: 'vistas'
  }
};

const searchCopy = {
  en: {
    loading: 'Loading Search Console clicks…',
    unavailable: 'Search clicks are unavailable for this period.',
    unit: 'clicks'
  },
  es: {
    loading: 'Cargando clics de Search Console…',
    unavailable: 'Los clics de búsqueda no están disponibles para este período.',
    unit: 'clics'
  }
};

const directoryViewsCopy = {
  en: {
    loading: 'Loading Dónde Aprendo AWS page views…',
    unavailable: 'Dónde Aprendo AWS page views are unavailable for this period.',
    unit: 'page views'
  },
  es: {
    loading: 'Cargando vistas de página de Dónde Aprendo AWS…',
    unavailable: 'Las vistas de página de Dónde Aprendo AWS no están disponibles para este período.',
    unit: 'vistas de página'
  }
};

const directoryOutboundClicksCopy = {
  en: {
    label: 'External link clicks',
    loading: 'Loading Dónde Aprendo AWS external link clicks…',
    unavailable: 'Dónde Aprendo AWS external link clicks are unavailable for this period.',
    unit: 'clicks'
  },
  es: {
    label: 'Clics en enlaces externos',
    loading: 'Cargando clics en enlaces externos de Dónde Aprendo AWS…',
    unavailable: 'Los clics en enlaces externos de Dónde Aprendo AWS no están disponibles para este período.',
    unit: 'clics'
  }
};

const newsletterEmailCopy = {
  en: {
    opens: {
      label: 'Email opens',
      loading: 'Loading email opens…',
      unavailable: 'Email opens are unavailable for this period.',
      unit: 'email opens'
    },
    clicks: {
      label: 'Verified email clicks',
      loading: 'Loading verified email clicks…',
      unavailable: 'Verified email clicks are unavailable for this period.',
      unit: 'verified email clicks'
    }
  },
  es: {
    opens: {
      label: 'Aperturas de emails',
      loading: 'Cargando aperturas de emails…',
      unavailable: 'Las aperturas de emails no están disponibles para este período.',
      unit: 'aperturas de emails'
    },
    clicks: {
      label: 'Clics verificados en emails',
      loading: 'Cargando clics verificados en emails…',
      unavailable: 'Los clics verificados en emails no están disponibles para este período.',
      unit: 'clics verificados en emails'
    }
  }
};

const newsletterSentCopy = {
  en: {
    label: 'Emails sent — reported total',
    loading: 'Loading reported emails sent…',
    unavailable: 'The reported emails-sent total is unavailable.'
  },
  es: {
    label: 'Emails enviados — total informado',
    loading: 'Cargando el total informado de emails enviados…',
    unavailable: 'El total informado de emails enviados no está disponible.'
  }
};

const builderArticleViewsCopy = {
  en: {
    label: 'Builder Center views — recorded total',
    loading: 'Loading Builder Center recorded views…',
    unavailable: 'Builder Center recorded views are unavailable.',
    unit: 'views'
  },
  es: {
    label: 'Vistas en Builder Center — total registrado',
    loading: 'Cargando vistas registradas de Builder Center…',
    unavailable: 'Las vistas registradas de Builder Center no están disponibles.'
  }
};

function makeCard(kind, locale) {
  const card = new SemanticElement({
    dataset: { statsKind: kind, statsUnavailable: unavailableCopy[locale][kind] },
    attributes: { 'aria-busy': 'false' }
  });
  const status = card.appendChild(new SemanticElement({
    dataset: { statsStatus: '' },
    textContent: loadingCopy[locale][kind],
    hidden: true
  }));
  const results = card.appendChild(new SemanticElement({ dataset: { statsResults: '' }, hidden: true }));
  const countRegion = results.appendChild(new SemanticElement({ dataset: { statsCountRegion: '' } }));
  const count = countRegion.appendChild(new SemanticElement({ dataset: { statsCount: '' } }));
  const countLabel = countRegion.appendChild(new SemanticElement({
    dataset: { statsCountLabel: '' },
    textContent: initialUnits[locale][kind]
  }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsCoverage: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsCollectedDate: '' } }));
  return { card, status, results, countRegion, count, countLabel, coverage, collectedDate };
}

function makeArticleViews(card, locale) {
  const region = card.appendChild(new SemanticElement({
    dataset: { statsViews: '', statsViewsUnavailable: viewsCopy[locale].unavailable }
  }));
  const status = region.appendChild(new SemanticElement({
    dataset: { statsViewsStatus: '' },
    textContent: viewsCopy[locale].loading,
    hidden: true
  }));
  const results = region.appendChild(new SemanticElement({ dataset: { statsViewsResults: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { statsViewsValue: '' } }));
  const unit = results.appendChild(new SemanticElement({ textContent: viewsCopy[locale].unit }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsViewsCoverage: '' } }));
  const interval = results.appendChild(new SemanticElement({ dataset: { statsViewsInterval: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsViewsCollectedDate: '' } }));
  const qualifications = results.appendChild(new SemanticElement({ dataset: { statsViewsQualifications: '' } }));
  return { region, status, results, value, unit, coverage, interval, collectedDate, qualifications };
}

function makeArticleSearch(card, locale) {
  const region = card.appendChild(new SemanticElement({
    dataset: { statsSearch: '', statsSearchUnavailable: searchCopy[locale].unavailable }
  }));
  const status = region.appendChild(new SemanticElement({
    dataset: { statsSearchStatus: '' },
    textContent: searchCopy[locale].loading,
    hidden: true
  }));
  const results = region.appendChild(new SemanticElement({ dataset: { statsSearchResults: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { statsSearchValue: '' } }));
  const unit = results.appendChild(new SemanticElement({ textContent: searchCopy[locale].unit }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsSearchCoverage: '' } }));
  const interval = results.appendChild(new SemanticElement({ dataset: { statsSearchInterval: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsSearchCollectedDate: '' } }));
  return { region, status, results, value, unit, coverage, interval, collectedDate };
}

function makeDirectoryViews(locale) {
  const card = new SemanticElement({
    dataset: {
      statsKind: 'directory-views',
      statsDirectoryViews: '',
      statsDirectoryViewsUnavailable: directoryViewsCopy[locale].unavailable,
      statsDirectoryOutboundClicksUnavailable: directoryOutboundClicksCopy[locale].unavailable
    },
    attributes: { 'aria-busy': 'false' }
  });
  const status = card.appendChild(new SemanticElement({
    dataset: { statsDirectoryViewsStatus: '' },
    textContent: directoryViewsCopy[locale].loading,
    hidden: true
  }));
  const results = card.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsResults: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsValue: '' } }));
  const unit = results.appendChild(new SemanticElement({
    dataset: { statsDirectoryViewsUnit: '' },
    textContent: directoryViewsCopy[locale].unit
  }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsCoverage: '' } }));
  const interval = results.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsInterval: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsCollectedDate: '' } }));
  const qualifications = results.appendChild(new SemanticElement({ dataset: { statsDirectoryViewsQualifications: '' }, hidden: true }));
  return { card, status, results, value, unit, coverage, interval, collectedDate, qualifications };
}

function makeDirectoryOutboundClicks(locale, card) {
  const region = card.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicks: '' } }));
  const label = region.appendChild(new SemanticElement({ textContent: directoryOutboundClicksCopy[locale].label }));
  const status = region.appendChild(new SemanticElement({
    dataset: { statsDirectoryOutboundClicksStatus: '' },
    textContent: directoryOutboundClicksCopy[locale].loading,
    hidden: true
  }));
  const results = region.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksResults: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksValue: '' } }));
  const unit = results.appendChild(new SemanticElement({
    dataset: { statsDirectoryOutboundClicksUnit: '' },
    textContent: directoryOutboundClicksCopy[locale].unit
  }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksCoverage: '' } }));
  const interval = results.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksInterval: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksCollectedDate: '' } }));
  const qualifications = results.appendChild(new SemanticElement({ dataset: { statsDirectoryOutboundClicksQualifications: '' }, hidden: true }));
  return { region, label, status, results, value, unit, coverage, interval, collectedDate, qualifications };
}

function makeNewsletterEmailMetric(kind, locale, card) {
  const metric = kind === 'opens' ? 'opens' : 'clicks';
  const spec = kind === 'opens'
    ? { region: 'statsNewsletterEmailOpens', unavailable: 'statsNewsletterEmailOpensUnavailable' }
    : { region: 'statsNewsletterEmailVerifiedClicks', unavailable: 'statsNewsletterEmailVerifiedClicksUnavailable' };
  const copy = newsletterEmailCopy[locale][metric];
  const region = card.appendChild(new SemanticElement({
    dataset: { [spec.region]: '', [spec.unavailable]: copy.unavailable }
  }));
  const label = region.appendChild(new SemanticElement({ textContent: copy.label }));
  const status = region.appendChild(new SemanticElement({
    dataset: { [spec.region + 'Status']: '' },
    textContent: copy.loading,
    hidden: true
  }));
  const results = region.appendChild(new SemanticElement({ dataset: { [spec.region + 'Results']: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { [spec.region + 'Value']: '' } }));
  const unit = results.appendChild(new SemanticElement({
    dataset: { [spec.region + 'Unit']: '' },
    textContent: copy.unit
  }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { [spec.region + 'Coverage']: '' } }));
  const interval = results.appendChild(new SemanticElement({ dataset: { [spec.region + 'Interval']: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { [spec.region + 'CollectedDate']: '' } }));
  return { region, label, status, results, value, unit, coverage, interval, collectedDate };
}

function makeNewsletterSentMetric(locale, card) {
  const copy = newsletterSentCopy[locale];
  const region = card.appendChild(new SemanticElement({
    dataset: { statsNewsletterSent: '', statsNewsletterSentUnavailable: copy.unavailable }
  }));
  const label = region.appendChild(new SemanticElement({ textContent: copy.label }));
  const status = region.appendChild(new SemanticElement({
    dataset: { statsNewsletterSentStatus: '' },
    textContent: copy.loading,
    hidden: true
  }));
  const results = region.appendChild(new SemanticElement({ dataset: { statsNewsletterSentResults: '' }, hidden: true }));
  const value = results.appendChild(new SemanticElement({ dataset: { statsNewsletterSentValue: '' } }));
  const coverage = results.appendChild(new SemanticElement({ dataset: { statsNewsletterSentCoverage: '' } }));
  const collectedDate = results.appendChild(new SemanticElement({ dataset: { statsNewsletterSentCollectedDate: '' } }));
  return { region, label, status, results, value, coverage, collectedDate };
}

function makeBuilderArticleViews(locale, card) {
  const copy = builderArticleViewsCopy[locale];
  const region = card.appendChild(new SemanticElement({
    dataset: { statsBuilderViews: '', statsBuilderViewsUnavailable: copy.unavailable },
    attributes: { 'aria-labelledby': 'content-stats-builder-views-title' }
  }));
  const label = region.appendChild(new SemanticElement({
    attributes: { id: 'content-stats-builder-views-title' },
    textContent: copy.label
  }));
  const status = region.appendChild(new SemanticElement({
    dataset: { statsBuilderViewsStatus: '' },
    attributes: { role: 'status', 'aria-live': 'polite' },
    textContent: copy.loading,
    hidden: true
  }));
  const result = region.appendChild(new SemanticElement({
    dataset: { statsBuilderViewsResult: '' },
    attributes: { 'aria-live': 'polite', 'aria-atomic': 'true' },
    hidden: true
  }));
  const value = result.appendChild(new SemanticElement({ dataset: { statsBuilderViewsValue: '' } }));
  const coverage = result.appendChild(new SemanticElement({ dataset: { statsBuilderViewsCoverage: '' } }));
  const since = result.appendChild(new SemanticElement({ dataset: { statsBuilderViewsSince: '' } }));
  const collectedDate = result.appendChild(new SemanticElement({ dataset: { statsBuilderViewsCollectedDate: '' } }));
  return { region, label, status, result, value, coverage, since, collectedDate };
}

function createPage({ locale = 'en', data = snapshot(), fetchError, responseOk = true, includeViews = true, includeSearch = true } = {}) {
  const section = new SemanticElement({
    dataset: {
      statsSource: '/content-stats/v1/current.json',
      statsLocale: locale,
      statsUnavailable: unavailableCopy[locale].articles
    },
    attributes: { id: 'content-stats' }
  });
  const selector = section.appendChild(new SemanticElement({
    dataset: { statsLanguage: '' },
    value: 'all',
    disabled: true
  }));
  const periodSelector = section.appendChild(new SemanticElement({
    dataset: { statsPeriod: '' },
    value: '12m',
    disabled: true
  }));
  const periodOptions = Object.fromEntries(articleViewPeriods.map((period) => {
    const option = periodSelector.appendChild(new SemanticElement({
      attributes: { value: period },
      disabled: period === 'total'
    }));
    return [period, option];
  }));
  const cards = Object.fromEntries(['articles', 'talks', 'books', 'newsletter'].map((kind) => {
    const card = makeCard(kind, locale);
    section.appendChild(card.card);
    return [kind, card];
  }));
  cards.newsletter.emailOpens = makeNewsletterEmailMetric('opens', locale, cards.newsletter.card);
  cards.newsletter.emailVerifiedClicks = makeNewsletterEmailMetric('clicks', locale, cards.newsletter.card);
  cards.newsletter.sent = makeNewsletterSentMetric(locale, cards.newsletter.card);
  cards.articles.builderViews = makeBuilderArticleViews(locale, cards.articles.card);
  cards.directoryViews = makeDirectoryViews(locale);
  section.appendChild(cards.directoryViews.card);
  cards.directoryOutboundClicks = makeDirectoryOutboundClicks(locale, cards.directoryViews.card);
  if (includeViews) cards.articles.views = makeArticleViews(cards.articles.card, locale);
  if (includeSearch) cards.articles.search = makeArticleSearch(cards.articles.card, locale);
  const fetchCalls = [];

  const context = {
    document: { getElementById: (id) => id === 'content-stats' ? section : null },
    window: { location: { href: 'https://guilleojeda.com/', origin: 'https://guilleojeda.com' } },
    URL,
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      if (fetchError) throw fetchError;
      return { ok: responseOk, json: async () => data };
    }
  };

  vm.runInNewContext(clientSource, context, { filename: 'src/scripts/content-stats.js' });

  return {
    cards,
    card: cards.articles.card,
    collectedDate: cards.articles.collectedDate,
    count: cards.articles.count,
    countLabel: cards.articles.countLabel,
    coverage: cards.articles.coverage,
    results: cards.articles.results,
    selector,
    periodSelector,
    periodOptions,
    section,
    location: context.window.location,
    status: cards.articles.status,
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    get fetchCount() { return fetchCalls.length; },
    get fetchCalls() { return fetchCalls; },
    get fetchedUrl() { return fetchCalls[0]?.url; },
    get data() { return data; }
  };
}

function expectedDate(locale, timestamp = collectedAt) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(timestamp));
}

function expectedDateOnly(locale, date) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

function assertUnavailable(page, locale, kind = 'articles') {
  const { card, results, count, status } = page.cards[kind];
  assert.equal(card.hidden, false, `${kind}: invalid or missing data must show an unavailable card`);
  assert.equal(results.hidden, true, `${kind}: unavailable data must not reveal a count`);
  assert.equal(count.textContent, '', `${kind}: unavailable data must not leave a number`);
  assert.equal(status.hidden, false, `${kind}: unavailable state must be visible`);
  assert.notEqual(status.textContent.trim(), '', `${kind}: unavailable state must have a message`);
  if (kind === 'articles') {
    assert.equal(status.textContent, unavailableCopy[locale].articles);
  } else if (locale === 'es') {
    assert.match(status.textContent, /no\s+se\s+pueden|no\s+est.n\s+disponibles|no\s+está[n]?\s+disponible/i);
  } else {
    assert.match(status.textContent, /unavailable|not available/i);
  }
  assert.equal(card.getAttribute('aria-busy'), 'false');
}

function assertLocalizedUnit(page, kind, locale) {
  const label = page.cards[kind].countLabel.textContent;
  if (locale === 'es') {
    const expected = {
      articles: /artículos/i,
      talks: /sesion|charla|presentaci/i,
      books: /libros/i,
      newsletter: /suscriptores?|suscripciones?/i
    }[kind];
    assert.match(label, expected, `${kind}: count unit should be clear in Spanish`);
  } else {
    const expected = {
      articles: /articles?/i,
      talks: /sessions?|talks?/i,
      books: /books?/i,
      newsletter: /subscribers?/i
    }[kind];
    assert.match(label, expected, `${kind}: count unit should be clear in English`);
  }
}

function assertCuratedCoverage(page, kind, locale) {
  const label = page.cards[kind].coverage.textContent;
  assert.notEqual(label, '', `${kind}: its source label should be visible`);
  if (locale === 'es') {
    assert.notEqual(label, websiteInventory.label, `${kind}: generic source label should be localized`);
    assert.match(label, /inventario|sitio\s+web/i, `${kind}: Spanish source label should retain its meaning`);
  } else {
    assert.equal(label, websiteInventory.label, `${kind}: generic source identity should use the known label`);
  }
}

function assertNewsletterUnavailable(page, locale) {
  assertUnavailable(page, locale, 'newsletter');
}

function assertNewsletterEmailUnavailable(page, locale, spec, { hidden = false } = {}) {
  const metric = page.cards.newsletter[spec.region];
  assert.equal(metric.results.hidden, true, `${spec.group}: unavailable result stays hidden`);
  assert.equal(metric.value.textContent, '', `${spec.group}: unavailable result clears the old count`);
  assert.equal(metric.coverage.textContent, '', `${spec.group}: unavailable result clears old publication provenance`);
  assert.equal(metric.interval.textContent, '', `${spec.group}: unavailable result clears the old period`);
  assert.equal(metric.collectedDate.textContent, '', `${spec.group}: unavailable result clears the old collection date`);
  assert.equal(metric.status.hidden, hidden, `${spec.group}: unavailable status follows content-language visibility`);
  if (hidden) return;
  assert.equal(metric.status.textContent, newsletterEmailCopy[locale][spec.metric].unavailable);
}

function assertNewsletterEmailVisible(page, locale, spec, period) {
  const record = page.data.groups[spec.group].records[period];
  const metric = page.cards.newsletter[spec.region];
  assert.equal(metric.region.hidden, false, `${spec.group}: supported English email data is visible for All/English`);
  assert.equal(metric.results.hidden, false, `${period} ${spec.group} renders its own result`);
  assert.equal(metric.status.hidden, true, `${spec.group}: successful data clears the loading or unavailable status`);
  assert.equal(metric.value.textContent, new Intl.NumberFormat(locale).format(record[spec.metric]), `${spec.group}: value comes from the selected period`);
  assert.match(metric.unit.textContent, spec.label[locale], `${spec.group}: label names the metric in the interface language`);
  assert.equal(metric.coverage.textContent, 'Simple AWS', `${spec.group}: publication identity is visible`);
  assert.ok(metric.interval.textContent.includes('UTC'), `${spec.group}: reported period names UTC`);
  const formatDateOnly = (date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  assert.ok(metric.interval.textContent.includes(formatDateOnly(record.startDate)), `${spec.group}: start date comes from the selected record`);
  assert.ok(metric.interval.textContent.includes(formatDateOnly(record.endDate)), `${spec.group}: end date comes from the selected record`);
  assert.equal(metric.collectedDate.textContent, expectedDate(locale, record.collectedAt), `${spec.group}: collection date is independent for this period`);
}

function assertViewsUnavailable(page, locale) {
  const views = page.cards.articles.views;
  assert.equal(views.results.hidden, true, 'unavailable views must not reveal an old value');
  assert.equal(views.value.textContent, '', 'unavailable views must clear their value');
  assert.equal(views.coverage.textContent, '', 'unavailable views must clear old source coverage');
  assert.equal(views.interval.textContent, '', 'unavailable views must clear an old interval');
  assert.equal(views.collectedDate.textContent, '', 'unavailable views must clear an old collection date');
  assert.equal(views.qualifications.textContent, '', 'unavailable views must clear old qualifications');
  assert.equal(views.status.hidden, false, 'unavailable views need a visible status');
  if (locale === 'es') assert.match(views.status.textContent, /no\s+est.n\s+disponibles?|no\s+está[n]?\s+disponible|no\s+se\s+pueden/i);
  else assert.match(views.status.textContent, /unavailable|not available/i);
}

function assertLocalizedViewsUnit(page, locale) {
  const label = page.cards.articles.views.unit.textContent;
  if (locale === 'es') assert.match(label, /vistas/i, 'views have a Spanish unit');
  else assert.match(label, /views/i, 'views have an English unit');
}

function assertViewsVisible(page, locale, period) {
  const record = page.data.groups.articleViews.records[period];
  const views = page.cards.articles.views;
  assert.equal(views.results.hidden, false, `${period} views should render independently`);
  assert.equal(views.status.hidden, true);
  assert.equal(views.value.textContent, new Intl.NumberFormat(locale).format(record.views));
  assertLocalizedViewsUnit(page, locale);
  assert.equal(views.coverage.textContent, record.publication.label, 'coverage comes from the selected record');
  assert.ok(views.interval.textContent.includes(record.timeZone), 'the selected interval includes its source timezone');
  const formatDateOnly = (date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  assert.ok(views.interval.textContent.includes(formatDateOnly(record.startDate)), 'the selected interval uses its retained localized start date');
  assert.ok(views.interval.textContent.includes(formatDateOnly(record.endDate)), 'the selected interval uses its retained localized end date');
  assert.notEqual(views.interval.textContent.trim(), '', 'the actual interval must be visible');
  assert.equal(views.collectedDate.textContent, expectedDate(locale, record.collectedAt), 'the selected record keeps its own collection date');
  if (period === 'total') {
    const since = locale === 'es' ? /vistas\s+desde/i : /views\s+since/i;
    assert.match(`${views.unit.textContent} ${views.interval.textContent} ${views.collectedDate.textContent}`, since, 'recorded total must be labeled as views since its configured start');
  }

  const qualificationText = views.qualifications.textContent;
  if (locale === 'es') {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /muest|muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /umbral/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /otras filas?|filas? restantes|l[ií]mite de filas/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /sampl|sampled/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /threshold/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /other rows?|rows? omitted|row limit/i);
  }
}

function assertNewsletterSentUnavailable(page, locale, { hidden = false } = {}) {
  const sent = page.cards.newsletter.sent;
  assert.equal(sent.region.hidden, hidden, 'sent-total row follows content-language visibility');
  assert.equal(sent.results.hidden, true, 'unavailable sent-total results stay hidden');
  assert.equal(sent.value.textContent, '', 'unavailable sent total clears its previous value');
  assert.equal(sent.coverage.textContent, '', 'unavailable sent total clears its publication');
  assert.equal(sent.collectedDate.textContent, '', 'unavailable sent total clears its collection date');
  assert.equal(sent.status.hidden, hidden, 'sent-total status follows content-language visibility');
  if (!hidden) {
    if (locale === 'en') assert.match(sent.status.textContent, /unavailable|not available/i);
    else assert.match(sent.status.textContent, /no disponible|no disponibles|no se pueden/i);
  } else {
    assert.equal(sent.status.textContent, '', 'hidden sent-total status clears its message');
  }
}

function assertNewsletterSentVisible(page, locale, expectedValue, collectedAt) {
  const sent = page.cards.newsletter.sent;
  assert.equal(sent.region.hidden, false, 'valid sent total is independently visible');
  assert.equal(sent.status.hidden, true, 'valid sent total clears its loading or unavailable status');
  assert.equal(sent.results.hidden, false, 'valid sent total reveals its result');
  assert.equal(sent.value.textContent, new Intl.NumberFormat(locale).format(expectedValue));
  assert.match(sent.label.textContent, locale === 'en' ? /emails sent.*reported total/i : /emails enviados.*total informado/i);
  assert.equal(sent.coverage.textContent, 'Simple AWS');
  assert.equal(sent.collectedDate.textContent, expectedDate(locale, collectedAt));
}

function assertBuilderViewsUnavailable(page, locale, { hidden = false } = {}) {
  const builder = page.cards.articles.builderViews;
  assert.equal(builder.region.hidden, hidden, 'Builder Center availability follows only its own content-language selection');
  assert.equal(builder.result.hidden, true, 'unavailable Builder Center results stay hidden');
  for (const [name, field] of Object.entries({ value: builder.value, coverage: builder.coverage, since: builder.since, collectedDate: builder.collectedDate })) {
    assert.equal(field.textContent, '', `unavailable Builder Center views clear ${name}`);
  }
  assert.equal(builder.status.hidden, hidden, 'Builder Center status follows row visibility');
  if (hidden) {
    assert.equal(builder.status.textContent, '', 'a hidden Builder Center row clears its status');
  } else if (locale === 'en') {
    assert.match(builder.status.textContent, /unavailable|not available/i, 'English unavailable copy is clear');
  } else {
    assert.match(builder.status.textContent, /no disponible|no disponibles|no se pueden/i, 'Spanish unavailable copy is clear');
  }
}

function assertBuilderViewsVisible(page, locale, language, group = page.data.groups.builderArticleViews) {
  const builder = page.cards.articles.builderViews;
  assert.equal(builder.region.hidden, false, `${language} Builder Center views remain independently visible`);
  assert.equal(builder.status.hidden, true, 'available Builder Center views clear loading or unavailable status');
  assert.equal(builder.status.textContent, '', 'available Builder Center views clear stale status text');
  assert.equal(builder.result.hidden, false, 'available Builder Center views reveal their result');
  assert.equal(builder.value.textContent, new Intl.NumberFormat(locale).format(group.views[language]));
  assert.equal(builder.coverage.textContent, group.source.label, 'Builder Center coverage comes from its source metadata');
  assert.equal(builder.since.textContent, expectedDateOnly(locale, group.startDate), 'Builder Center keeps its own fixed tracking start date');
  assert.equal(builder.collectedDate.textContent, expectedDate(locale, group.collectedAt), 'Builder Center shows its actual collection date');
  assert.match(builder.label.textContent, locale === 'en' ? /Builder Center views.*recorded total/i : /Vistas en Builder Center.*total registrado/i);
}

function assertSearchUnavailable(page, locale) {
  const search = page.cards.articles.search;
  assert.equal(search.results.hidden, true, 'unavailable Search clicks must not reveal an old value');
  assert.equal(search.value.textContent, '', 'unavailable Search clicks must clear the old value');
  assert.equal(search.coverage.textContent, '', 'unavailable Search clicks must clear old source coverage');
  assert.equal(search.interval.textContent, '', 'unavailable Search clicks must clear the old interval');
  assert.equal(search.collectedDate.textContent, '', 'unavailable Search clicks must clear the old collection date');
  assert.equal(search.status.hidden, false, 'unavailable Search clicks need a visible status');
  if (locale === 'es') assert.match(search.status.textContent, /no\s+est.n\s+disponibles?|no\s+está[n]?\s+disponible|no\s+se\s+pueden/i);
  else assert.match(search.status.textContent, /unavailable|not available/i);
}

function assertLocalizedSearchUnit(page, locale) {
  const label = page.cards.articles.search.unit.textContent;
  if (locale === 'es') assert.match(label, /clics?/i, 'Search clicks have a Spanish unit');
  else assert.match(label, /clicks?/i, 'Search clicks have an English unit');
}

function assertSearchVisible(page, locale, period) {
  const record = page.data.groups.articleSearchClicks.records[period];
  const search = page.cards.articles.search;
  assert.equal(search.results.hidden, false, `${period} Search clicks should render independently`);
  assert.equal(search.status.hidden, true);
  assert.equal(search.value.textContent, new Intl.NumberFormat(locale).format(record.clicks));
  assertLocalizedSearchUnit(page, locale);
  assert.equal(search.coverage.textContent, record.publication.label, 'Search source comes from the selected record');
  assert.ok(search.interval.textContent.includes(record.timeZone), 'the selected Search interval includes Pacific time');
  const formatDateOnly = (date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  assert.ok(search.interval.textContent.includes(formatDateOnly(record.startDate)), 'Search interval uses its retained localized start date');
  assert.ok(search.interval.textContent.includes(formatDateOnly(record.endDate)), 'Search interval uses its retained localized end date');
  assert.notEqual(search.interval.textContent.trim(), '', 'the Search interval should be visible');
  assert.equal(search.collectedDate.textContent, expectedDate(locale, record.collectedAt), 'Search retains its own collection date');
}

function assertDirectoryViewsUnavailable(page, locale, { hidden = false } = {}) {
  const views = page.cards.directoryViews;
  assert.equal(views.card.hidden, hidden, 'directory page views follow their Spanish content-language applicability');
  assert.equal(views.results.hidden, true, 'unavailable directory views must not reveal an old value');
  assert.equal(views.value.textContent, '', 'unavailable directory views clear their value');
  assert.equal(views.coverage.textContent, '', 'unavailable directory views clear old coverage');
  assert.equal(views.interval.textContent, '', 'unavailable directory views clear old interval metadata');
  assert.equal(views.collectedDate.textContent, '', 'unavailable directory views clear the old fetch date');
  assert.equal(views.qualifications.textContent, '', 'unavailable directory views clear old qualifications');
  assert.equal(views.card.getAttribute('aria-busy'), 'false');
  if (hidden) {
    assert.equal(views.status.hidden, true, 'the English content filter hides the inapplicable card status');
    return;
  }
  assert.equal(views.status.hidden, false, 'applicable but unavailable directory views show a status');
  if (locale === 'es') assert.match(views.status.textContent, /no.*disponible|no se pueden/i);
  else assert.match(views.status.textContent, /unavailable|not available/i);
}

function assertLocalizedDirectoryViewsUnit(page, locale) {
  if (locale === 'es') assert.match(page.cards.directoryViews.unit.textContent, /vistas\s+de\s+p[aá]gina/i);
  else assert.match(page.cards.directoryViews.unit.textContent, /page\s+views/i);
}

function assertDirectoryViewsVisible(page, locale, period) {
  const record = page.data.groups.directoryViews.records[period];
  const views = page.cards.directoryViews;
  assert.equal(views.card.hidden, false, 'All and Español can display this Spanish-source traffic');
  assert.equal(views.results.hidden, false, `${period} directory views should render`);
  assert.equal(views.status.hidden, true);
  assert.equal(views.value.textContent, new Intl.NumberFormat(locale).format(record.views));
  assertLocalizedDirectoryViewsUnit(page, locale);
  assert.equal(views.coverage.textContent, record.publication.label, 'directory coverage comes from the saved record');
  assert.ok(views.interval.textContent.includes(record.timeZone), 'the interval retains the source timezone');
  const formatDateOnly = (date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  assert.ok(views.interval.textContent.includes(formatDateOnly(record.startDate)), 'the interval retains its localized start date');
  assert.ok(views.interval.textContent.includes(formatDateOnly(record.endDate)), 'the interval retains its localized end date');
  assert.equal(views.collectedDate.textContent, expectedDate(locale, record.collectedAt), 'directory views retain their own collection date');
  assert.equal(views.qualifications.hidden, record.qualifications.length === 0);
  const qualificationText = views.qualifications.textContent;
  if (locale === 'es') {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /muest|muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /umbral/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /otras filas?|filas? restantes|l[ií]mite de filas/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /sampl|sampled/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /threshold/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /other rows?|rows? omitted|row limit/i);
  }
}

function assertDirectoryOutboundClicksUnavailable(page, locale, { hidden = false } = {}) {
  const clicks = page.cards.directoryOutboundClicks;
  assert.equal(page.cards.directoryViews.card.hidden, hidden, 'directory outbound clicks follow the Spanish-only card scope');
  assert.equal(clicks.results.hidden, true, 'unavailable outbound clicks must not reveal an old value');
  assert.equal(clicks.value.textContent, '', 'unavailable outbound clicks clear their value');
  assert.equal(clicks.coverage.textContent, '', 'unavailable outbound clicks clear old coverage');
  assert.equal(clicks.interval.textContent, '', 'unavailable outbound clicks clear old interval metadata');
  assert.equal(clicks.collectedDate.textContent, '', 'unavailable outbound clicks clear the old fetch date');
  assert.equal(clicks.qualifications.textContent, '', 'unavailable outbound clicks clear old qualifications');
  assert.equal(page.cards.directoryViews.card.getAttribute('aria-busy'), 'false');
  if (hidden) return;

  assert.equal(clicks.status.hidden, false, 'applicable but unavailable outbound clicks show a status');
  assert.equal(clicks.status.textContent, directoryOutboundClicksCopy[locale].unavailable);
  if (locale === 'es') assert.match(clicks.status.textContent, /no.*disponible|no se pueden/i);
  else assert.match(clicks.status.textContent, /unavailable|not available/i);
}

function assertLocalizedDirectoryOutboundClicksUnit(page, locale) {
  const clicks = page.cards.directoryOutboundClicks;
  if (locale === 'es') {
    assert.match(clicks.label.textContent, /clics\s+en\s+enlaces\s+externos/i);
    assert.match(clicks.unit.textContent, /clics?/i);
  } else {
    assert.match(clicks.label.textContent, /external\s+link\s+clicks/i);
    assert.match(clicks.unit.textContent, /clicks?/i);
  }
}

function assertDirectoryOutboundClicksVisible(page, locale, period) {
  const record = page.data.groups.directoryOutboundClicks.records[period];
  const clicks = page.cards.directoryOutboundClicks;
  assert.equal(page.cards.directoryViews.card.hidden, false, 'All and Español can display this Spanish-source metric');
  assert.equal(clicks.results.hidden, false, `${period} directory outbound clicks should render`);
  assert.equal(clicks.status.hidden, true);
  assert.equal(clicks.value.textContent, new Intl.NumberFormat(locale).format(record.clicks));
  assertLocalizedDirectoryOutboundClicksUnit(page, locale);
  assert.equal(clicks.coverage.textContent, record.publication.label, 'click coverage comes from its own saved record');
  assert.ok(clicks.interval.textContent.includes(record.timeZone), 'the click interval retains the source timezone');
  const formatDateOnly = (date) => new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
  assert.ok(clicks.interval.textContent.includes(formatDateOnly(record.startDate)), 'the click interval retains its localized start date');
  assert.ok(clicks.interval.textContent.includes(formatDateOnly(record.endDate)), 'the click interval retains its localized end date');
  assert.equal(clicks.collectedDate.textContent, expectedDate(locale, record.collectedAt), 'clicks retain their own collection date');
  assert.equal(clicks.qualifications.hidden, record.qualifications.length === 0);
  const qualificationText = clicks.qualifications.textContent;
  if (locale === 'es') {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /muest|muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /umbral/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /otras filas?|filas? restantes|l[ií]mite de filas/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /sampl|sampled/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /threshold/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /other rows?|rows? omitted|row limit/i);
  }
}

function assertAllUnavailable(page, locale) {
  for (const kind of ['articles', 'talks', 'books', 'newsletter']) assertUnavailable(page, locale, kind);
  assertViewsUnavailable(page, locale);
}

for (const locale of ['en', 'es']) {
  test(`${locale} UI shows a localized loading status in each card`, async () => {
    const page = createPage({ locale, data: threeGroupSnapshot() });

    for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
      const { card, status } = page.cards[kind];
      assert.equal(status.hidden, false, `${kind}: loading state should be visible`);
      assert.match(status.textContent, locale === 'es' ? /cargando/i : /loading/i);
      assert.equal(card.getAttribute('aria-busy'), 'true');
    }
    assert.equal(page.cards.articles.views.status.hidden, false, 'the independent views region has its own loading status');
    assert.match(page.cards.articles.views.status.textContent, locale === 'es' ? /cargando/i : /loading/i);
    for (const spec of newsletterEmailMetricSpecs) {
      const metric = page.cards.newsletter[spec.region];
      assert.equal(metric.status.hidden, false, `${spec.group} has an independent loading status`);
      assert.match(metric.status.textContent, locale === 'es' ? /cargando/i : /loading/i);
      assert.equal(metric.region.parentNode, page.cards.newsletter.card, `${spec.group} is outside the current-subscriber results`);
    }
    assert.equal(page.cards.directoryOutboundClicks.status.hidden, false, 'the independent click metric has its own loading status');
    assert.match(page.cards.directoryOutboundClicks.status.textContent, locale === 'es' ? /cargando.*clics/i : /loading.*clicks/i);
    assert.equal(page.periodSelector.value, '12m', 'the period control defaults to twelve months');
    assert.equal(page.periodSelector.disabled, true, 'period selection stays disabled while loading');
    await page.settle();
  });

  test(`${locale} directory page views use their own five period records and Spanish content-language scope`, async () => {
    const page = createPage({ locale, data: snapshotWithDirectoryViews() });
    await page.settle();

    assertDirectoryViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.cards.articles.views.coverage.textContent, 'Simple AWS');
    assert.equal(page.cards.articles.search.coverage.textContent, 'Simple AWS');
    for (const period of directoryViewPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertDirectoryViewsVisible(page, locale, period);
      assert.equal(page.cards.articles.count.textContent, '11', 'directory traffic does not replace cumulative article counts');
      assert.equal(page.cards.newsletter.count.textContent, '27', 'directory traffic does not replace current subscribers');
      assertViewsVisible(page, locale, period);
      assertSearchVisible(page, locale, period);
      assert.equal(page.fetchCount, 1, 'period changes reuse the aggregate snapshot');
    }

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });
    assert.equal(page.cards.articles.count.textContent, '7', 'English article counts remain independent');
    assert.equal(page.cards.newsletter.count.textContent, '27', 'the English newsletter remains visible');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, 'ytd');
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.newsletter.card.hidden, true);

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, 'ytd');
    assert.equal(page.fetchCount, 1, 'content-language changes stay local in both interface locales');
  });

  test(`${locale} directory outbound clicks use independent period records and Spanish content-language scope`, async () => {
    const page = createPage({ locale, data: snapshotWithDirectoryOutboundClicks() });
    await page.settle();

    assertDirectoryOutboundClicksVisible(page, locale, '12m');
    assertDirectoryViewsVisible(page, locale, '12m');
    assert.notEqual(page.cards.directoryOutboundClicks.value.textContent, page.cards.directoryViews.value.textContent,
      'outbound clicks retain a value independent from page views');
    assert.notDeepEqual(page.data.groups.directoryOutboundClicks.records['12m'].qualifications,
      page.data.groups.directoryViews.records['12m'].qualifications,
    'outbound clicks retain qualifications independent from page views');

    for (const period of directoryOutboundClickPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertDirectoryOutboundClicksVisible(page, locale, period);
      assertDirectoryViewsVisible(page, locale, period);
      assert.notEqual(page.cards.directoryOutboundClicks.value.textContent, page.cards.directoryViews.value.textContent,
        `${period} clicks do not reuse the page-views value`);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
      assert.equal(page.fetchCount, 1, 'period changes reuse the existing aggregate request');
    }

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertDirectoryOutboundClicksUnavailable(page, locale, { hidden: true });
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertDirectoryOutboundClicksVisible(page, locale, 'ytd');
    assertDirectoryViewsVisible(page, locale, 'ytd');
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.newsletter.card.hidden, true);

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertDirectoryOutboundClicksVisible(page, locale, 'ytd');
    assert.equal(page.fetchCount, 1, 'language changes stay local in both interface locales');
  });

  test(`${locale} directory outbound clicks distinguish zero, a missing period, and invalid period data`, async () => {
    const records = directoryOutboundClicksRecords();
    records['7d'].clicks = 0;
    delete records['30d'];
    records['90d'] = { ...records['90d'], clicks: '206' };
    const page = createPage({ locale, data: snapshotWithDirectoryOutboundClicks({ records }) });
    await page.settle();

    assertDirectoryOutboundClicksVisible(page, locale, '12m');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertDirectoryOutboundClicksVisible(page, locale, '7d');
    assert.equal(page.cards.directoryOutboundClicks.value.textContent, '0', 'a source-reported zero is measured data');
    assertDirectoryViewsVisible(page, locale, '7d');

    for (const period of ['30d', '90d']) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertDirectoryOutboundClicksUnavailable(page, locale);
      assertDirectoryViewsVisible(page, locale, period);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
    }

    page.periodSelector.value = 'ytd';
    page.periodSelector.dispatch('change');
    assertDirectoryOutboundClicksVisible(page, locale, 'ytd');
    assert.equal(page.fetchCount, 1, 'click record validation is isolated to its selected period');
  });

  test(`${locale} invalid directory outbound-click groups do not poison Views or other families`, async () => {
    const cases = [
      ['unsupported definition version', (group) => { group.definitionVersion = 2; }],
      ['private property field', (group) => { group.propertyId = '424203315'; }],
      ['unknown record key', (group) => { group.records.lifetime = directoryOutboundClicksRecord('12m'); }],
      ['malformed record map', (group) => { group.records = []; }]
    ];

    for (const [description, mutate] of cases) {
      const data = snapshotWithDirectoryOutboundClicks();
      mutate(data.groups.directoryOutboundClicks);
      const page = createPage({ locale, data });
      await page.settle();

      assertDirectoryOutboundClicksUnavailable(page, locale);
      assertDirectoryViewsVisible(page, locale, '12m');
      assert.equal(page.cards.articles.count.textContent, '11', `${description} leaves article counts available`);
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.cards.newsletter.count.textContent, '27');

      page.periodSelector.value = '30d';
      page.periodSelector.dispatch('change');
      assertDirectoryOutboundClicksUnavailable(page, locale);
      assertDirectoryViewsVisible(page, locale, '30d');
      assert.equal(page.fetchCount, 1);
    }
  });

  test(`${locale} invalid directory outbound-click records affect only their period`, async () => {
    const cases = [
      ['wrong basis', (record) => { record.basis = 'recorded-total'; }],
      ['noncanonical collection timestamp', (record) => { record.collectedAt = '2026-09-06T00:00:00Z'; }],
      ['invalid scope hash', (record) => { record.scopeId = 'not-a-sha256'; }],
      ['wrong publication identity', (record) => { record.publication.id = 'simple-aws'; }],
      ['wrong publication label', (record) => { record.publication.label = 'Simple AWS'; }],
      ['wrong publication language', (record) => { record.publication.language = 'en'; }],
      ['invalid timezone', (record) => { record.timeZone = 'Not/AZone'; }],
      ['invalid interval', (record) => { record.startDate = '2026-02-30'; }],
      ['unsafe click count', (record) => { record.clicks = Number.MAX_SAFE_INTEGER + 1; }],
      ['missing qualifications', (record) => { delete record.qualifications; }],
      ['duplicate qualification', (record) => { record.qualifications = ['sampled', 'sampled']; }],
      ['provider qualification', (record) => { record.qualifications = ['provider-warning']; }],
      ['private host field', (record) => { record.hostname = 'dondeaprendoaws.com'; }]
    ];

    for (const [description, mutate] of cases) {
      const data = snapshotWithDirectoryOutboundClicks();
      mutate(data.groups.directoryOutboundClicks.records['12m']);
      const page = createPage({ locale, data });
      await page.settle();

      assertDirectoryOutboundClicksUnavailable(page, locale);
      assertDirectoryViewsVisible(page, locale, '12m');
      assert.equal(page.cards.articles.count.textContent, '11', `${description} leaves article counts available`);
      page.periodSelector.value = '30d';
      page.periodSelector.dispatch('change');
      assertDirectoryOutboundClicksVisible(page, locale, '30d');
      assertDirectoryViewsVisible(page, locale, '30d');
      assert.equal(page.fetchCount, 1);
    }
  });

  test(`${locale} invalid directory Views do not hide healthy outbound clicks`, async () => {
    const data = snapshotWithDirectoryOutboundClicks();
    data.groups.directoryViews = { definitionVersion: 2, records: directoryViewsRecords() };
    const page = createPage({ locale, data });
    await page.settle();

    assertDirectoryViewsUnavailable(page, locale);
    assertDirectoryOutboundClicksVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale);
    assertDirectoryOutboundClicksVisible(page, locale, '30d');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} retained and recovered outbound clicks keep their own collection dates and metadata`, async () => {
    const retainedRecords = directoryOutboundClicksRecords();
    retainedRecords['12m'] = directoryOutboundClicksRecord('12m', {
      collectedAt: '2025-03-14T00:00:00.000Z',
      scopeId: 'b'.repeat(64),
      startDate: '2024-03-01',
      endDate: '2025-02-28',
      clicks: 520,
      qualifications: ['thresholding']
    });
    const retainedPage = createPage({ locale, data: snapshotWithDirectoryOutboundClicks({ records: retainedRecords }) });
    await retainedPage.settle();
    assertDirectoryOutboundClicksVisible(retainedPage, locale, '12m');
    assert.equal(retainedPage.cards.directoryOutboundClicks.value.textContent, new Intl.NumberFormat(locale).format(520));
    assert.equal(retainedPage.cards.directoryOutboundClicks.collectedDate.textContent,
      expectedDate(locale, '2025-03-14T00:00:00.000Z'));
    assert.ok(retainedPage.cards.directoryOutboundClicks.interval.textContent.includes('2024'), 'retained dates remain visible');

    const recoveredRecords = directoryOutboundClicksRecords();
    recoveredRecords['12m'] = directoryOutboundClicksRecord('12m', {
      collectedAt: '2026-10-18T00:00:00.000Z',
      scopeId: 'c'.repeat(64),
      clicks: 690,
      qualifications: ['other-row']
    });
    const recoveredPage = createPage({ locale, data: snapshotWithDirectoryOutboundClicks({ records: recoveredRecords }) });
    await recoveredPage.settle();
    assertDirectoryOutboundClicksVisible(recoveredPage, locale, '12m');
    assert.equal(recoveredPage.cards.directoryOutboundClicks.value.textContent, new Intl.NumberFormat(locale).format(690));
    assert.equal(recoveredPage.cards.directoryOutboundClicks.collectedDate.textContent,
      expectedDate(locale, '2026-10-18T00:00:00.000Z'));
    assert.equal(recoveredPage.cards.directoryViews.value.textContent, new Intl.NumberFormat(locale).format(1470),
      'recovered clicks do not replace the separately collected Views value');
    assert.equal(retainedPage.fetchCount, 1);
    assert.equal(recoveredPage.fetchCount, 1);
  });

  test(`${locale} directory page views distinguish zero, a missing period, and an invalid period record`, async () => {
    const records = directoryViewsRecords();
    records['7d'].views = 0;
    delete records['30d'];
    records['90d'] = { ...records['90d'], views: '147' };
    const page = createPage({ locale, data: snapshotWithDirectoryViews({ records }) });
    await page.settle();

    assertDirectoryViewsVisible(page, locale, '12m');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, '7d');
    assert.equal(page.cards.directoryViews.value.textContent, '0', 'a source-reported zero is measured data');

    for (const period of ['30d', '90d']) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertDirectoryViewsUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
      assertViewsVisible(page, locale, period);
      assertSearchVisible(page, locale, period);
    }
    page.periodSelector.value = 'ytd';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, 'ytd');
    assert.equal(page.fetchCount, 1, 'directory record validation is isolated to the selected period');
  });

  test(`${locale} an invalid directory Views group does not poison other families`, async () => {
    const data = snapshotWithDirectoryViews({ definitionVersion: 2 });
    const page = createPage({ locale, data });
    await page.settle();

    assertDirectoryViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assertViewsVisible(page, locale, '12m');
    assertSearchVisible(page, locale, '12m');
    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assertViewsVisible(page, locale, '30d');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} directory Views enforce their own publication and aggregate fields`, async () => {
    const cases = [
      ['wrong publication identity', (group) => {
        group.records['12m'].publication = { id: 'simple-aws', label: 'Simple AWS', language: 'es' };
      }, true],
      ['wrong publication language', (group) => {
        group.records['12m'].publication.language = 'en';
      }, true],
      ['private provider field', (group) => {
        group.records['12m'].propertyId = '424203315';
      }, true],
      ['unknown record key', (group) => {
        group.records.lifetime = directoryViewsRecord('12m');
      }, false],
      ['unknown directory group field', (group) => {
        group.hostname = 'dondeaprendoaws.com';
      }, false]
    ];

    for (const [description, mutate, periodOnly] of cases) {
      const data = snapshotWithDirectoryViews();
      mutate(data.groups.directoryViews);
      const page = createPage({ locale, data });
      await page.settle();

      if (periodOnly) {
        assertDirectoryViewsUnavailable(page, locale);
        page.periodSelector.value = '30d';
        page.periodSelector.dispatch('change');
        assertDirectoryViewsVisible(page, locale, '30d');
      } else {
        assertDirectoryViewsUnavailable(page, locale);
        page.periodSelector.value = '30d';
        page.periodSelector.dispatch('change');
        assertDirectoryViewsUnavailable(page, locale);
      }
      assert.equal(page.cards.articles.count.textContent, '11', `${description} does not affect article counts`);
      assert.equal(page.cards.newsletter.count.textContent, '27', `${description} does not affect subscribers`);
      assertViewsVisible(page, locale, '30d');
      assertSearchVisible(page, locale, '30d');
      assert.equal(page.fetchCount, 1);
    }
  });

  test(`${locale} retained and recovered directory Views keep their own dates and metadata`, async () => {
    const retainedRecords = directoryViewsRecords();
    retainedRecords['12m'] = directoryViewsRecord('12m', {
      collectedAt: '2025-03-14T00:00:00.000Z',
      scopeId: 'e'.repeat(64),
      startDate: '2024-03-01',
      endDate: '2025-02-28',
      views: 520,
      qualifications: ['sampled']
    });
    const retainedPage = createPage({ locale, data: snapshotWithDirectoryViews({ records: retainedRecords }) });
    await retainedPage.settle();
    assertDirectoryViewsVisible(retainedPage, locale, '12m');
    assert.equal(retainedPage.cards.directoryViews.value.textContent, new Intl.NumberFormat(locale).format(520));
    assert.equal(retainedPage.cards.directoryViews.collectedDate.textContent, expectedDate(locale, '2025-03-14T00:00:00.000Z'));

    const recoveredRecords = directoryViewsRecords();
    recoveredRecords['12m'] = directoryViewsRecord('12m', {
      collectedAt: '2026-10-18T00:00:00.000Z',
      scopeId: 'f'.repeat(64),
      views: 690,
      qualifications: ['other-row']
    });
    const recoveredPage = createPage({ locale, data: snapshotWithDirectoryViews({ records: recoveredRecords }) });
    await recoveredPage.settle();
    assertDirectoryViewsVisible(recoveredPage, locale, '12m');
    assert.equal(recoveredPage.cards.directoryViews.value.textContent, new Intl.NumberFormat(locale).format(690));
    assert.equal(recoveredPage.cards.directoryViews.collectedDate.textContent, expectedDate(locale, '2026-10-18T00:00:00.000Z'));
    assert.equal(recoveredPage.cards.articles.count.textContent, '11');
    assert.equal(recoveredPage.cards.newsletter.count.textContent, '27');
    assert.equal(retainedPage.fetchCount, 1);
    assert.equal(recoveredPage.fetchCount, 1);
  });

  test(`${locale} old snapshots keep existing groups and show directory views unavailable only for All and Español`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks() });
    await page.settle();

    assertDirectoryViewsUnavailable(page, locale);
    assertDirectoryOutboundClicksUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assertViewsVisible(page, locale, '12m');
    assertSearchVisible(page, locale, '12m');

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });
    assertDirectoryOutboundClicksUnavailable(page, locale, { hidden: true });
    assert.equal(page.cards.articles.count.textContent, '7');
    assert.equal(page.cards.newsletter.count.textContent, '27');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.newsletter.card.hidden, true);
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assertDirectoryOutboundClicksUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} directory recorded totals retain independent values and shared metadata`, async () => {
    const viewsRecords = directoryViewsRecords();
    viewsRecords.total = directoryViewsRecord('total', { views: 0, qualifications: ['sampled', 'other-row'] });
    const clicksRecords = directoryOutboundClicksRecords();
    clicksRecords.total = directoryOutboundClicksRecord('total');
    const data = snapshotWithDirectoryOutboundClicks({ records: clicksRecords });
    data.groups.directoryViews.records = viewsRecords;
    delete data.groups.articleViews;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, false, 'directory totals enable the shared option without article Views total');
    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, 'total');
    assert.equal(page.cards.directoryViews.value.textContent, '0', 'an explicit zero is a valid recorded total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.newsletter.count.textContent, '27');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'Spanish directory totals keep the shared selection available');
    assert.equal(page.periodOptions.total.disabled, false);
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.newsletter.card.hidden, true);

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, '12m', 'English falls back when no English total remains applicable');
    assert.equal(page.periodOptions.total.disabled, true);
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });
    assertDirectoryOutboundClicksUnavailable(page, locale, { hidden: true });
    assert.equal(page.cards.articles.count.textContent, '7');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, '12m', 'restoring total availability does not silently reselect it');
    assert.equal(page.periodOptions.total.disabled, false);
    assertDirectoryViewsVisible(page, locale, '12m');
    assertDirectoryOutboundClicksVisible(page, locale, '12m');

    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'All also retains the selected directory total');
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} article and directory totals stay selected as language applicability changes`, async () => {
    const clicksRecords = directoryOutboundClicksRecords();
    clicksRecords.total = directoryOutboundClicksRecord('total');
    const data = snapshotWithDirectoryOutboundClicks({ records: clicksRecords });
    data.groups.directoryViews.records.total = directoryViewsRecord('total');
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, false);
    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, 'total');
    assertSearchUnavailable(page, locale);
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'All to Spanish retains the selected period because directory totals apply');
    assert.equal(page.periodOptions.total.disabled, false);
    assertViewsUnavailable(page, locale);
    assertSearchUnavailable(page, locale);
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'Spanish to English retains the period because article Views total applies');
    assert.equal(page.periodOptions.total.disabled, false);
    assertViewsVisible(page, locale, 'total');
    assertSearchUnavailable(page, locale);
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });
    assertDirectoryOutboundClicksUnavailable(page, locale, { hidden: true });

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'English to All retains the selected period');
    assert.equal(page.periodOptions.total.disabled, false);
    assertViewsVisible(page, locale, 'total');
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} each valid directory total remains usable when its sibling total is missing or invalid`, async () => {
    const cases = [
      ['clicks only', false, true],
      ['Views only', true, false],
      ['Views total with invalid clicks total', true, 'invalid-clicks'],
      ['clicks total with invalid Views total', 'invalid-views', true]
    ];

    for (const [description, viewsState, clicksState] of cases) {
      const viewsRecords = directoryViewsRecords();
      const clicksRecords = directoryOutboundClicksRecords();
      if (viewsState === true) viewsRecords.total = directoryViewsRecord('total');
      if (viewsState === 'invalid-views') viewsRecords.total = directoryViewsRecord('total', { basis: 'period' });
      if (clicksState === true) clicksRecords.total = directoryOutboundClicksRecord('total');
      if (clicksState === 'invalid-clicks') clicksRecords.total = directoryOutboundClicksRecord('total', { basis: 'period' });
      const data = snapshotWithDirectoryOutboundClicks({ records: clicksRecords });
      data.groups.directoryViews.records = viewsRecords;
      data.groups.articleViews.definitionVersion = 99;
      const page = createPage({ locale, data });
      await page.settle();

      assert.equal(page.periodOptions.total.disabled, false, `${description}: one valid directory total enables the shared option`);
      page.periodSelector.value = 'total';
      page.periodSelector.dispatch('change');
      if (viewsState === true) assertDirectoryViewsVisible(page, locale, 'total');
      else assertDirectoryViewsUnavailable(page, locale);
      if (clicksState === true) assertDirectoryOutboundClicksVisible(page, locale, 'total');
      else assertDirectoryOutboundClicksUnavailable(page, locale);
      assertViewsUnavailable(page, locale);
      assertSearchUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      page.selector.value = 'es';
      page.selector.dispatch('change');
      assert.equal(page.periodSelector.value, 'total', `${description}: a valid Spanish directory total keeps the shared selection`);
      assert.equal(page.periodOptions.total.disabled, false);
      if (viewsState === true) assertDirectoryViewsVisible(page, locale, 'total');
      else assertDirectoryViewsUnavailable(page, locale);
      if (clicksState === true) assertDirectoryOutboundClicksVisible(page, locale, 'total');
      else assertDirectoryOutboundClicksUnavailable(page, locale);
      page.periodSelector.value = '12m';
      page.periodSelector.dispatch('change');
      assertDirectoryViewsVisible(page, locale, '12m');
      assertDirectoryOutboundClicksVisible(page, locale, '12m');
      page.periodSelector.value = 'total';
      page.periodSelector.dispatch('change');
      assert.equal(page.fetchCount, 1);
    }
  });

  test(`${locale} directory page views finish loading and isolate unavailable data after fetch failure`, async () => {
    const page = createPage({ locale, fetchError: new Error('synthetic fetch failure') });
    assert.equal(page.cards.directoryViews.status.hidden, false);
    assert.equal(page.cards.directoryViews.card.getAttribute('aria-busy'), 'true');
    await page.settle();

    assertDirectoryViewsUnavailable(page, locale);
    assertDirectoryOutboundClicksUnavailable(page, locale);
    assert.equal(page.cards.articles.results.hidden, true);
    assert.equal(page.cards.articles.count.textContent, '');
    assert.equal(page.cards.talks.results.hidden, true);
    assert.equal(page.cards.books.results.hidden, true);
    assert.equal(page.cards.newsletter.results.hidden, true);
    assert.equal(page.fetchCount, 1);

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertDirectoryViewsUnavailable(page, locale, { hidden: true });
    assertDirectoryOutboundClicksUnavailable(page, locale, { hidden: true });
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} article views support each period locally and keep counts independent`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleViews() });
    await page.settle();

    assert.equal(page.periodSelector.disabled, false, 'the views period control enables after a valid snapshot');
    assert.equal(page.periodSelector.value, '12m', 'twelve months is the initial reporting period');
    assert.equal(page.periodOptions.total.disabled, false, 'an available recorded total enables its option');
    assertViewsVisible(page, locale, '12m');
    const unchangedCounts = {
      articles: page.cards.articles.count.textContent,
      talks: page.cards.talks.count.textContent,
      books: page.cards.books.count.textContent,
      newsletter: page.cards.newsletter.count.textContent
    };

    for (const period of articleViewPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertViewsVisible(page, locale, period);
      for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
        assert.equal(page.cards[kind].count.textContent, unchangedCounts[kind], `${kind} count is independent of the selected views period`);
      }
      assert.equal(page.fetchCount, 1, 'period changes reuse the same aggregate request');
      assert.equal(page.section.dataset.statsLocale, locale, 'period changes do not change the interface locale');
    }

    page.periodSelector.value = '12m';
    page.periodSelector.dispatch('change');
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '7', 'English filtering still applies to cumulative article counts');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.results.hidden, false, 'unsupported views language does not hide article counts');
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.periodOptions.total.disabled, true, 'recorded total is unavailable for unsupported content language');
    assert.equal(page.cards.newsletter.card.hidden, true, 'the English newsletter follows its own supported-language rule');

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.periodOptions.total.disabled, false, 'All restores the supported recorded-total option');
    assert.equal(page.cards.articles.count.textContent, unchangedCounts.articles, 'All restores article counts and views');
    assert.equal(page.fetchCount, 1, 'language and period controls share one fetch');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json']);
    assert.equal(page.location.href, 'https://guilleojeda.com/', 'local controls must not navigate');

    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, 'total');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, '12m', 'article-only total falls back when Spanish has no directory total');
    assert.equal(page.periodOptions.total.disabled, true);
    assertViewsUnavailable(page, locale);
    assertDirectoryViewsUnavailable(page, locale);
    assertDirectoryOutboundClicksUnavailable(page, locale);

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, '12m', 'All re-enables article total without silently reselecting it');
    assert.equal(page.periodOptions.total.disabled, false);
    assertViewsVisible(page, locale, '12m');
  });

  test(`${locale} missing total disables only Recorded total and keeps supported periods available`, async () => {
    const records = articleViewsRecords();
    delete records.total;
    const page = createPage({ locale, data: snapshotWithArticleViews({ records }) });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, true, 'Recorded total is unavailable when no configured total exists');
    assert.equal(page.periodSelector.value, '12m');
    page.periodSelector.value = '90d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '90d');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} measured zero article views stay visible while unsupported Spanish stays unavailable`, async () => {
    const records = articleViewsRecords();
    records['12m'].views = 0;
    const page = createPage({ locale, data: snapshotWithArticleViews({ records }) });
    await page.settle();

    assert.equal(page.cards.articles.views.results.hidden, false, 'a supported measured zero is data, not an unavailable state');
    assert.equal(page.cards.articles.views.value.textContent, '0');
    assert.equal(page.cards.articles.views.status.hidden, true);
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.views.value.textContent, '0', 'English can select the measured English views record');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4', 'unsupported views language does not suppress Spanish article counts');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.views.results.hidden, false);
    assert.equal(page.cards.articles.views.value.textContent, '0', 'All restores the measured zero');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid recorded-total basis disables only Recorded total`, async () => {
    const data = snapshotWithArticleViews();
    data.groups.articleViews.records.total.basis = 'period';
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, true, 'an invalid total record cannot enable the option');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} missing one views period clears stale metadata without affecting other periods or cards`, async () => {
    const records = articleViewsRecords();
    delete records['30d'];
    const page = createPage({ locale, data: snapshotWithArticleViews({ records }) });
    await page.settle();

    assertViewsVisible(page, locale, '12m');
    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '7d',);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} schema-v1 four-family legacy snapshots keep all original cards and show views unavailable`, async () => {
    const page = createPage({ locale, data: snapshotWithNewsletter() });
    await page.settle();

    for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
      assert.equal(page.cards[kind].results.hidden, false, `${kind} remains available in the legacy snapshot`);
    }
    assertViewsUnavailable(page, locale);
    assert.equal(page.periodOptions.total.disabled, true, 'legacy data has no recorded total');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '4');
    assertViewsUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid article count data does not prevent valid article views`, async () => {
    const data = snapshotWithArticleViews();
    data.groups.articles.counts.all = 4;
    const page = createPage({ locale, data });
    await page.settle();

    assertUnavailable(page, locale, 'articles');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertUnavailable(page, locale, 'articles');
    assertViewsUnavailable(page, locale);
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid article views family leaves all four original cards available`, async () => {
    const data = snapshotWithArticleViews({ definitionVersion: 2 });
    const page = createPage({ locale, data });
    await page.settle();

    assertViewsUnavailable(page, locale);
    for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
      assert.equal(page.cards[kind].results.hidden, false, `${kind} stays available when only the views family is invalid`);
    }
    assert.equal(page.cards.articles.count.textContent, '11');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '4');
    assertViewsUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  for (const [description, updateFamily] of [
    ['unknown family key', (family) => ({ ...family, provider: 'Google Analytics' })],
    ['unknown period key', (family) => ({ ...family, records: { ...family.records, lifetime: family.records.total } })],
    ['malformed period map', (family) => ({ ...family, records: [] })]
  ]) {
    test(`${locale} article views ${description} makes the views family unavailable only`, async () => {
      const data = snapshotWithArticleViews();
      data.groups.articleViews = updateFamily(data.groups.articleViews);
      const page = createPage({ locale, data });
      await page.settle();

      assertViewsUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
      assert.equal(page.fetchCount, 1);
    });
  }

  for (const [description, value] of [
    ['boolean', true],
    ['null', null],
    ['string', '1200'],
    ['negative', -1],
    ['fractional', 1.5],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['missing', undefined]
  ]) {
    test(`${locale} article views ${description} count is isolated to its period`, async () => {
      const data = snapshotWithArticleViews();
      if (value === undefined) delete data.groups.articleViews.records['12m'].views;
      else data.groups.articleViews.records['12m'].views = value;
      const page = createPage({ locale, data });
      await page.settle();

      assertViewsUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
      page.periodSelector.value = '7d';
      page.periodSelector.dispatch('change');
      assertViewsVisible(page, locale, '7d');
      assert.equal(page.fetchCount, 1);
    });
  }

  for (const [description, updateRecord] of [
    ['wrong basis', (record) => ({ ...record, basis: 'recorded-total' })],
    ['noncanonical collection timestamp', (record) => ({ ...record, collectedAt: '2026-09-04T00:00:00Z' })],
    ['invalid scope hash', (record) => ({ ...record, scopeId: 'not-a-sha256' })],
    ['invalid timezone', (record) => ({ ...record, timeZone: 'Not/AZone' })],
    ['invalid start date', (record) => ({ ...record, startDate: '2026-02-30' })],
    ['reversed interval', (record) => ({ ...record, startDate: '2026-09-01', endDate: '2026-08-31' })],
    ['unsupported publication language', (record) => ({ ...record, publication: { ...record.publication, language: 'fr' } })],
    ['missing publication language', (record) => ({ ...record, publication: { id: 'simple-aws', label: 'Simple AWS' } })],
    ['wrong publication identity', (record) => ({ ...record, publication: { ...record.publication, id: 'other-publication' } })],
    ['wrong publication label', (record) => ({ ...record, publication: { ...record.publication, label: 'Other publication' } })],
    ['duplicate qualification', (record) => ({ ...record, qualifications: ['sampled', 'sampled'] })],
    ['unsupported qualification', (record) => ({ ...record, qualifications: ['provider-warning'] })],
    ['provider property identifier', (record) => ({ ...record, propertyId: '373694636' })]
  ]) {
    test(`${locale} article views ${description} makes only its period unavailable`, async () => {
      const data = snapshotWithArticleViews();
      data.groups.articleViews.records['12m'] = updateRecord(data.groups.articleViews.records['12m']);
      const page = createPage({ locale, data });
      await page.settle();

      assertViewsUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.newsletter.count.textContent, '27');
      page.periodSelector.value = '30d';
      page.periodSelector.dispatch('change');
      assertViewsVisible(page, locale, '30d');
      assert.equal(page.fetchCount, 1);
    });
  }

  test(`${locale} UI renders a saved Caylent-only aggregate with its original coverage and collection date`, async () => {
    const page = createPage({ locale, data: snapshot() });
    await page.settle();

    assert.equal(page.results.hidden, false, 'the harness must observe successful rendering');
    assert.equal(page.status.hidden, true);
    assert.equal(page.count.textContent, '40');
    assert.equal(page.countLabel.textContent, locale === 'es' ? 'artículos publicados' : 'published articles');
    assert.equal(page.coverage.textContent, 'Caylent', 'the saved snapshot must not be relabeled as newer coverage');
    assert.equal(page.collectedDate.textContent, expectedDate(locale), 'the saved collection date must be preserved');
    assert.equal(page.section.dataset.statsLocale, locale, 'content filtering must not change the UI locale');
    assert.equal(page.fetchCount, 1);
    assert.equal(page.fetchedUrl, 'https://guilleojeda.com/content-stats/v1/current.json');
  });

  test(`${locale} UI renders both known sources and filters the unchanged aggregate locally`, async () => {
    const data = snapshot({ sources: [caylent, builderCenter] });
    data.groups.articles.counts = { all: 5, en: 2, es: 3 };
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.results.hidden, false, 'the harness must observe successful rendering');
    assert.equal(page.count.textContent, '5', 'All should start selected');
    assert.equal(page.coverage.textContent, 'Caylent, AWS Builder Center');
    assert.equal(page.collectedDate.textContent, expectedDate(locale));

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.count.textContent, '2');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.count.textContent, '3');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.count.textContent, '5');
    assert.equal(page.coverage.textContent, 'Caylent, AWS Builder Center');
    assert.equal(page.fetchCount, 1, 'language changes must not issue another request');
  });

  test(`${locale} Simple AWS article coverage filters locally while views, Search, and subscribers keep their own facts`, async () => {
    const data = snapshotWithArticleSearchClicks();
    const originalDate = '2025-11-03T00:00:00.000Z';
    data.groups.articles.sources = [caylent, builderCenter, simpleAws];
    data.groups.articles.collectedAt = originalDate;
    const page = createPage({ locale, data });
    await page.settle();

    const articleCoverage = 'Caylent, AWS Builder Center, Simple AWS';
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.articles.coverage.textContent, articleCoverage);
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, originalDate));
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.views.value.textContent, new Intl.NumberFormat(locale).format(1200));
    assert.equal(page.cards.articles.views.coverage.textContent, simpleAws.label);
    assert.equal(page.cards.articles.views.collectedDate.textContent, expectedDate(locale, articleViewPeriodFacts['12m'].collectedAt));
    assertSearchVisible(page, locale, '12m');
    assert.equal(page.cards.articles.search.value.textContent, new Intl.NumberFormat(locale).format(1200));
    assert.equal(page.cards.articles.search.coverage.textContent, simpleAws.label);
    assert.equal(page.cards.articles.search.collectedDate.textContent, expectedDate(locale, articleSearchPeriodFacts['12m'].collectedAt));
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.cards.newsletter.coverage.textContent, simpleAws.label);
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));

    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '30d');
    assertSearchVisible(page, locale, '30d');
    assert.equal(page.cards.articles.count.textContent, '11', 'period changes do not change the article aggregate');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, originalDate));

    for (const [language, expectedCount] of [['en', '7'], ['es', '4'], ['all', '11']]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, expectedCount, `${language} uses its retained aggregate count`);
      assert.equal(page.cards.articles.coverage.textContent, articleCoverage, `${language} keeps all actual source coverage`);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, originalDate));
      if (language === 'es') {
        assertViewsUnavailable(page, locale);
        assertSearchUnavailable(page, locale);
        assert.equal(page.cards.newsletter.card.hidden, true, 'the English newsletter follows its own language support');
      } else {
        assertViewsVisible(page, locale, '30d');
        assertSearchVisible(page, locale, '30d');
        assert.equal(page.cards.newsletter.card.hidden, false);
        assert.equal(page.cards.newsletter.count.textContent, '27');
      }
      assert.equal(page.fetchCount, 1, 'language and period changes reuse the aggregate request');
    }
  });

  test(`${locale} an expanded Simple AWS source set can report a measured zero`, async () => {
    const data = snapshotWithNewsletter();
    data.groups.articles.sources = [caylent, builderCenter, simpleAws];
    data.groups.articles.counts = { all: 0, en: 0, es: 0 };
    const page = createPage({ locale, data });
    await page.settle();

    for (const [language, expected] of [['all', '0'], ['en', '0'], ['es', '0']]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.results.hidden, false, 'a supported zero remains visible data');
      assert.equal(page.cards.articles.status.hidden, true);
      assert.equal(page.cards.articles.count.textContent, expected);
      assert.equal(page.cards.articles.coverage.textContent, 'Caylent, AWS Builder Center, Simple AWS');
    }
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} Cloudy Things counts work without the Simple AWS article source`, async () => {
    const data = snapshotWithArticleSearchClicks();
    const collectedAt = '2025-11-03T00:00:00.000Z';
    data.groups.articles.sources = [caylent, builderCenter, cloudyThings];
    data.groups.articles.counts = { all: 13, en: 9, es: 4 };
    data.groups.articles.collectedAt = collectedAt;
    const page = createPage({ locale, data });
    await page.settle();

    const articleCoverage = 'Caylent, AWS Builder Center, Cloudy Things';
    assert.equal(page.cards.articles.count.textContent, '13');
    assert.equal(page.cards.articles.coverage.textContent, articleCoverage);
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.views.coverage.textContent, simpleAws.label, 'Views retain their own publication coverage');
    assert.equal(page.cards.articles.views.collectedDate.textContent, expectedDate(locale, articleViewPeriodFacts['12m'].collectedAt));
    assertSearchVisible(page, locale, '12m');
    assert.equal(page.cards.articles.search.coverage.textContent, simpleAws.label, 'Search retains its own publication coverage');
    assert.equal(page.cards.articles.search.collectedDate.textContent, expectedDate(locale, articleSearchPeriodFacts['12m'].collectedAt));
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.cards.newsletter.coverage.textContent, simpleAws.label, 'subscribers retain their own publication coverage');
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));

    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '30d');
    assertSearchVisible(page, locale, '30d');
    assert.equal(page.cards.articles.count.textContent, '13', 'activity periods do not change cumulative article counts');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));

    for (const [language, expectedCount] of [['all', '13'], ['en', '9'], ['es', '4']]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, expectedCount, `${language} applies the saved aggregate locally`);
      assert.equal(page.cards.articles.coverage.textContent, articleCoverage, `${language} keeps actual Cloudy Things coverage`);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
      if (language === 'es') {
        assertViewsUnavailable(page, locale);
        assertSearchUnavailable(page, locale);
        assert.equal(page.cards.newsletter.card.hidden, true);
      } else {
        assertViewsVisible(page, locale, '30d');
        assertSearchVisible(page, locale, '30d');
        assert.equal(page.cards.newsletter.count.textContent, '27');
      }
      assert.equal(page.fetchCount, 1, 'language and period changes reuse the single aggregate request');
    }
  });

  test(`${locale} a saved Simple AWS plus Cloudy Things snapshot retains exact coverage, date and zero`, async () => {
    const data = snapshotWithArticleSearchClicks();
    const collectedAt = '2024-10-19T00:00:00.000Z';
    data.groups.articles.sources = [caylent, builderCenter, simpleAws, cloudyThings];
    data.groups.articles.counts = { all: 0, en: 0, es: 0 };
    data.groups.articles.collectedAt = collectedAt;
    const page = createPage({ locale, data });
    await page.settle();

    for (const language of ['all', 'en', 'es']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.results.hidden, false, 'a measured zero stays visible');
      assert.equal(page.cards.articles.status.hidden, true);
      assert.equal(page.cards.articles.count.textContent, '0');
      assert.equal(page.cards.articles.coverage.textContent, 'Caylent, AWS Builder Center, Simple AWS, Cloudy Things');
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt), 'retained expanded coverage keeps its original collection date');
    }
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid Cloudy Things source sets affect Articles only`, async () => {
    const invalidSourceSets = [
      ['unknown ID', [caylent, builderCenter, { id: 'cloudy-thing', label: 'Cloudy Things' }]],
      ['wrong label', [caylent, builderCenter, { id: 'cloudy-things', label: 'CloudyThings' }]],
      ['duplicate source', [caylent, builderCenter, cloudyThings, { ...cloudyThings }]],
      ['private field', [caylent, builderCenter, { ...cloudyThings, apiKey: 'synthetic-private-key' }]],
      ['misordered sources', [caylent, builderCenter, cloudyThings, simpleAws]],
      ['missing required Builder Center source', [caylent, cloudyThings]]
    ];

    for (const [description, sources] of invalidSourceSets) {
      const data = snapshotWithArticleSearchClicks();
      data.groups.articles.sources = sources;
      const page = createPage({ locale, data });
      await page.settle();

      assertUnavailable(page, locale, 'articles');
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.cards.newsletter.count.textContent, '27');

      page.selector.value = 'en';
      page.selector.dispatch('change');
      assertUnavailable(page, locale, 'articles');
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');
      assert.equal(page.fetchCount, 1, `${description} does not cause another request`);
    }
  });

  for (const [description, extraSource] of [
    ['unknown Simple AWS ID', [{ id: 'simpleaws', label: 'Simple AWS' }]],
    ['wrong Simple AWS label', [{ id: 'simple-aws', label: 'AWS Simple' }]],
    ['duplicate Simple AWS source', [{ id: 'simple-aws', label: 'Simple AWS' }, { id: 'simple-aws', label: 'Simple AWS' }]],
    ['private Simple AWS field', [{ id: 'simple-aws', label: 'Simple AWS', apiKey: 'synthetic-private-key' }]]
  ]) {
    test(`${locale} invalid ${description} affects Articles only`, async () => {
      const data = snapshotWithArticleSearchClicks();
      data.groups.articles.sources = [caylent, builderCenter, ...extraSource];
      const page = createPage({ locale, data });
      await page.settle();

      assertUnavailable(page, locale, 'articles');
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.cards.newsletter.count.textContent, '27');

      page.selector.value = 'en';
      page.selector.dispatch('change');
      assertUnavailable(page, locale, 'articles');
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');
      assert.equal(page.fetchCount, 1, 'the invalid article source list does not trigger another request');
    });
  }

  test(`${locale} shared language filter updates all independent cards from one aggregate request`, async () => {
    const page = createPage({ locale, data: snapshotWithNewsletter() });
    await page.settle();

    const all = { articles: '11', talks: '6', books: '3', newsletter: '27' };
    const dates = { articles: collectedAt, talks: talksCollectedAt, books: booksCollectedAt, newsletter: newsletterCollectedAt };
    for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
      assert.equal(page.cards[kind].results.hidden, false, `${kind} should render independently`);
      assert.equal(page.cards[kind].count.textContent, all[kind], `${kind} should start at All`);
      assert.equal(page.cards[kind].collectedDate.textContent, expectedDate(locale, dates[kind]), `${kind} keeps its own collection date`);
      assertLocalizedUnit(page, kind, locale);
    }
    assert.equal(page.cards.articles.coverage.textContent, 'Caylent, AWS Builder Center', 'article source labels stay unchanged');
    assertCuratedCoverage(page, 'talks', locale);
    assertCuratedCoverage(page, 'books', locale);
    assert.equal(page.cards.newsletter.coverage.textContent, simpleAws.label, 'newsletter coverage uses its publication label');

    for (const [language, counts] of [
      ['en', { articles: '7', talks: '2', books: '2', newsletter: '27' }],
      ['es', { articles: '4', talks: '4', books: '1' }],
      ['all', all]
    ]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      for (const kind of ['articles', 'talks', 'books']) {
        assert.equal(page.cards[kind].count.textContent, counts[kind], `${kind} should independently show ${language}`);
        assert.equal(page.cards[kind].results.hidden, false);
      }
      if (language === 'es') {
        assert.equal(page.cards.newsletter.card.hidden, true, 'a publication without Spanish subscribers hides its whole card');
      } else {
        assert.equal(page.cards.newsletter.card.hidden, false, `${language} restores the supported newsletter card`);
        assert.equal(page.cards.newsletter.count.textContent, counts.newsletter, `${language} subscriber total is current and unchanged`);
        assert.equal(page.cards.newsletter.results.hidden, false);
      }
      assert.equal(page.section.dataset.statsLocale, locale, 'filtering must not change the page UI locale');
    }

    assert.equal(page.fetchCount, 1, 'all cards and filter changes use one aggregate request');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json'], 'no provider requests are made');
    assert.equal(page.location.href, 'https://guilleojeda.com/', 'filtering must not navigate');
  });

  test(`${locale} valid Spanish newsletter publication follows content language rather than interface language`, async () => {
    const page = createPage({ locale, data: snapshotWithNewsletter({ publication: { ...simpleAws, language: 'es' } }) });
    await page.settle();

    assert.equal(page.cards.newsletter.card.hidden, false, 'All includes a valid Spanish publication');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'Spanish content selection includes the matching publication');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, true, 'English content selection hides the Spanish publication');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'All restores the publication');
    assert.equal(page.fetchCount, 1);
    assert.equal(page.location.href, 'https://guilleojeda.com/');
  });

  test(`${locale} article-only snapshots preserve article provenance and leave new cards unavailable`, async () => {
    const originalDate = '2025-11-03T00:00:00.000Z';
    const data = snapshot({ sources: [caylent] });
    data.groups.articles.collectedAt = originalDate;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.articles.results.hidden, false);
    assert.equal(page.cards.articles.count.textContent, '40');
    assert.equal(page.cards.articles.coverage.textContent, 'Caylent');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, originalDate));
    assertUnavailable(page, locale, 'talks');
    assertUnavailable(page, locale, 'books');
    assertNewsletterUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} legacy three-group snapshots preserve the original cards and leave Newsletter unavailable`, async () => {
    const page = createPage({ locale, data: threeGroupSnapshot() });
    await page.settle();

    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assertNewsletterUnavailable(page, locale);
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.talks.count.textContent, '4');
    assert.equal(page.cards.books.count.textContent, '1');
    assertNewsletterUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} UI displays a supported measured zero as zero`, async () => {
    const data = snapshotWithNewsletter({ subscribers: 0 });
    data.groups.books.counts = { all: 0, en: 0, es: 0 };
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.books.results.hidden, false, 'a valid measured zero is available data');
    assert.equal(page.cards.books.status.hidden, true);
    assert.equal(page.cards.books.count.textContent, '0');
    assertCuratedCoverage(page, 'books', locale);
    assert.equal(page.cards.books.collectedDate.textContent, expectedDate(locale, booksCollectedAt));
    assert.equal(page.cards.newsletter.count.textContent, '0', 'a valid current subscriber total of zero remains visible');
    assert.equal(page.cards.newsletter.card.hidden, false, 'the measured zero is supported for All');
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.count.textContent, '0', 'English retains the measured zero');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, true, 'unsupported Spanish is hidden instead of shown as zero');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.count.textContent, '0', 'All restores the measured zero');
  });

  test(`${locale} malformed book group affects only Books while valid families keep filtering`, async () => {
    const data = snapshotWithNewsletter();
    data.groups.books.counts.all = 4;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assertUnavailable(page, locale, 'books');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.talks.count.textContent, '4');
    assert.equal(page.cards.newsletter.card.hidden, true, 'a supported English newsletter is hidden by the Spanish content filter');
    assertUnavailable(page, locale, 'books');
    assert.equal(page.fetchCount, 1);
  });

  for (const [description, invalidKind, updateGroup] of [
    ['Books using an article source', 'books', (group) => ({ ...group, sources: [caylent] })],
    ['Talks using a future definition', 'talks', (group) => ({ ...group, definitionVersion: 2 })]
  ]) {
    test(`${locale} ${description} leaves only that curated card unavailable`, async () => {
      const data = threeGroupSnapshot();
      data.groups[invalidKind] = updateGroup(data.groups[invalidKind]);
      const page = createPage({ locale, data });
      await page.settle();

      const all = { articles: '11', talks: '6', books: '3' };
      const spanish = { articles: '4', talks: '4', books: '1' };
      assertUnavailable(page, locale, invalidKind);
      for (const kind of ['articles', 'talks', 'books']) {
        if (kind === invalidKind) continue;
        assert.equal(page.cards[kind].results.hidden, false, `${kind} should remain available`);
        assert.equal(page.cards[kind].count.textContent, all[kind]);
      }

      page.selector.value = 'es';
      page.selector.dispatch('change');
      assertUnavailable(page, locale, invalidKind);
      for (const kind of ['articles', 'talks', 'books']) {
        if (kind === invalidKind) continue;
        assert.equal(page.cards[kind].count.textContent, spanish[kind], `${kind} should still filter locally`);
      }
      assert.equal(page.fetchCount, 1);
    });
  }

  test(`${locale} missing Articles group leaves valid Talks and Books usable`, async () => {
    const data = snapshotWithNewsletter();
    delete data.groups.articles;
    const page = createPage({ locale, data });
    await page.settle();

    assertUnavailable(page, locale, 'articles');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertUnavailable(page, locale, 'articles');
    assert.equal(page.cards.talks.count.textContent, '2');
    assert.equal(page.cards.books.count.textContent, '2');
    assert.equal(page.cards.newsletter.count.textContent, '27', 'newsletter aggregate remains unchanged under the English filter');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid Newsletter group leaves the original three cards available`, async () => {
    const data = snapshotWithNewsletter();
    data.groups.newsletter.subscribers = -1;
    const page = createPage({ locale, data });
    await page.settle();

    assertNewsletterUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertNewsletterUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.talks.count.textContent, '4');
    assert.equal(page.cards.books.count.textContent, '1');
    assert.equal(page.fetchCount, 1);
  });

  for (const [description, subscribers] of [
    ['boolean', true],
    ['null', null],
    ['string', '27'],
    ['negative', -1],
    ['fractional', 27.5],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['missing', undefined]
  ]) {
    test(`${locale} Newsletter ${description} subscriber count is unavailable without affecting other cards`, async () => {
      const data = snapshotWithNewsletter();
      if (subscribers === undefined) delete data.groups.newsletter.subscribers;
      else data.groups.newsletter.subscribers = subscribers;
      const page = createPage({ locale, data });
      await page.settle();

      assertNewsletterUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.fetchCount, 1);
    });
  }

  for (const [description, updateGroup] of [
    ['future definition version', (group) => ({ ...group, definitionVersion: 2 })],
    ['non-current basis', (group) => ({ ...group, basis: 'cumulative' })],
    ['invalid collection date', (group) => ({ ...group, collectedAt: 'not-a-date' })],
    ['non-canonical collection date', (group) => ({ ...group, collectedAt: '2026-08-01T00:00:00Z' })],
    ['invalid scope hash', (group) => ({ ...group, scopeId: 'not-a-sha256' })],
    ['cumulative counts payload', (group) => ({ ...group, counts: { all: 27, en: 27, es: 0 } })],
    ['unsupported source language', (group) => ({ ...group, publication: { ...group.publication, language: 'fr' } })],
    ['missing source language', (group) => ({ ...group, publication: { id: 'simple-aws', label: 'Simple AWS' } })],
    ['wrong publication identity', (group) => ({ ...group, publication: { ...group.publication, id: 'other-publication' } })],
    ['wrong publication label', (group) => ({ ...group, publication: { ...group.publication, label: 'Other publication' } })]
  ]) {
    test(`${locale} Newsletter ${description} makes only that card unavailable`, async () => {
      const data = snapshotWithNewsletter();
      data.groups.newsletter = updateGroup(data.groups.newsletter);
      const page = createPage({ locale, data });
      await page.settle();

      assertNewsletterUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '11');
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.fetchCount, 1);
    });
  }

  test(`${locale} email regions leave loading on snapshot failures and invalid root schemas`, async () => {
    for (const options of [
      { fetchError: new Error('Synthetic snapshot network failure') },
      { responseOk: false },
      { data: { schemaVersion: 999, groups: {} } },
      { data: null }
    ]) {
      const page = createPage({ locale, ...options });
      await page.settle();
      for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec);
      assert.equal(page.fetchCount, 1, 'a snapshot failure does not cause polling or provider requests');
    }
  });

  test(`${locale} email opens and verified clicks use their own five periods, local labels, and one fetch`, async () => {
    const page = createPage({ locale, data: snapshotWithNewsletterEngagements({ data: snapshotWithArticleViews() }) });
    await page.settle();

    assert.equal(page.cards.newsletter.count.textContent, '27', 'current subscribers remain visible next to email activity');
    assertLocalizedUnit(page, 'newsletter', locale);
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[0], '12m');
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[1], '12m');
    assert.equal(page.periodSelector.disabled, false, 'email metrics use the existing shared period selector');

    for (const period of newsletterEmailPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, locale, spec, period);
      assert.equal(page.cards.newsletter.count.textContent, '27', 'period selection does not change current subscribers');
      assert.equal(page.fetchCount, 1, 'period changes reuse the one aggregate snapshot');
    }

    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, 'total');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec);
    assert.equal(page.cards.newsletter.count.textContent, '27', 'current subscribers remain visible at Recorded total');
    assert.equal(page.periodOptions.total.disabled, false, 'email metrics do not disable a supported article Recorded total');
  });

  test(`${locale} email data alone does not enable Recorded total and missing periods clear only that metric`, async () => {
    const opens = newsletterEmailRecords('opens');
    opens.ytd.opens = 0;
    delete opens['30d'];
    const page = createPage({
      locale,
      data: snapshotWithNewsletterEngagements({ data: snapshotWithNewsletter(), opens })
    });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, true, 'email-only data cannot enable Recorded total');
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[0], '12m');
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[1], '12m');
    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertNewsletterEmailUnavailable(page, locale, newsletterEmailMetricSpecs[0]);
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[1], '30d');
    page.periodSelector.value = 'ytd';
    page.periodSelector.dispatch('change');
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[0], 'ytd');
    assert.equal(page.cards.newsletter.emailOpens.value.textContent, '0', 'a measured zero remains visible');
    assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[1], 'ytd');
    assert.equal(page.cards.newsletter.count.textContent, '27', 'missing email data does not alter current subscribers');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} directory Recorded total remains selected through All and Spanish while email rows stay unavailable`, async () => {
    const data = snapshotWithDirectoryViews();
    data.groups.directoryViews.records.total = directoryViewsRecord('total');
    const page = createPage({ locale, data: snapshotWithNewsletterEngagements({ data }) });
    await page.settle();

    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assert.equal(page.periodOptions.total.disabled, false, 'the supported directory total enables the shared total option');
    assertDirectoryViewsVisible(page, locale, 'total');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec);

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'Spanish content keeps the directory-supported total selected');
    assert.equal(page.periodOptions.total.disabled, false);
    assertDirectoryViewsVisible(page, locale, 'total');
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.newsletter.card.hidden, true, 'the English Newsletter card is hidden for Spanish content');
    assert.equal(page.cards.newsletter.results.hidden, true);
    assert.equal(page.cards.newsletter.count.textContent, '', 'Spanish filtering clears the current-subscriber count');
    assert.equal(page.cards.newsletter.coverage.textContent, '', 'Spanish filtering clears subscriber provenance');
    assert.equal(page.cards.newsletter.collectedDate.textContent, '', 'Spanish filtering clears the subscriber collection date');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec, { hidden: true });

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'returning to All preserves the directory total');
    assertDirectoryViewsVisible(page, locale, 'total');
    assertViewsVisible(page, locale, 'total');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec);
    assert.equal(page.cards.newsletter.card.hidden, false, 'All restores the Newsletter card');
    assert.equal(page.cards.newsletter.results.hidden, false);
    assert.equal(page.cards.newsletter.count.textContent, '27', 'All restores current subscribers despite the unavailable email total');
    assert.equal(page.cards.newsletter.coverage.textContent, 'Simple AWS');
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
    assert.equal(page.fetchCount, 1, 'content filters reuse the one aggregate snapshot');
  });

  test(`${locale} valid email data keeps Newsletter visible without subscribers and clears under the Spanish content filter`, async () => {
    const data = snapshotWithNewsletterEngagements();
    delete data.groups.newsletter;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.newsletter.card.hidden, false, 'a valid English email metric makes the Newsletter card useful by itself');
    assertNewsletterUnavailable(page, locale);
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, locale, spec, '12m');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, true, 'English email metrics are hidden for Spanish content');
    assert.equal(page.cards.newsletter.results.hidden, true);
    assert.equal(page.cards.newsletter.count.textContent, '', 'filtering clears the unavailable subscriber count region');
    assert.equal(page.cards.newsletter.coverage.textContent, '', 'filtering clears subscriber provenance');
    assert.equal(page.cards.newsletter.collectedDate.textContent, '', 'filtering clears subscriber collection date');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec, { hidden: true });

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'English content restores the card with email data');
    assertNewsletterUnavailable(page, locale);
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, locale, spec, '12m');
    assert.equal(page.section.dataset.statsLocale, locale, 'content filtering does not change interface language');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} Spanish filtering clears and restores current subscribers beside both email families`, async () => {
    const page = createPage({ locale, data: snapshotWithNewsletterEngagements() });
    await page.settle();

    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.cards.newsletter.coverage.textContent, 'Simple AWS');
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, locale, spec, '12m');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, true, 'the English Newsletter card is hidden for Spanish content');
    assert.equal(page.cards.newsletter.results.hidden, true);
    assert.equal(page.cards.newsletter.count.textContent, '', 'filtering clears the current-subscriber count');
    assert.equal(page.cards.newsletter.coverage.textContent, '', 'filtering clears subscriber provenance');
    assert.equal(page.cards.newsletter.collectedDate.textContent, '', 'filtering clears the subscriber collection date');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec, { hidden: true });

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'All restores the Newsletter card');
    assert.equal(page.cards.newsletter.results.hidden, false);
    assert.equal(page.cards.newsletter.count.textContent, '27', 'All restores the current-subscriber count');
    assert.equal(page.cards.newsletter.coverage.textContent, 'Simple AWS');
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, locale, spec, '12m');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} either healthy email family can keep Newsletter visible on its own`, async () => {
    for (const selectedSpec of newsletterEmailMetricSpecs) {
      const siblingSpec = newsletterEmailMetricSpecs.find((candidate) => candidate.group !== selectedSpec.group);
      const data = snapshotWithNewsletterEngagements();
      delete data.groups.newsletter;
      delete data.groups[siblingSpec.group];
      const page = createPage({ locale, data });
      await page.settle();

      assert.equal(page.cards.newsletter.card.hidden, false, `${selectedSpec.group} alone keeps the card visible`);
      assertNewsletterUnavailable(page, locale);
      assertNewsletterEmailVisible(page, locale, selectedSpec, '12m');
      assertNewsletterEmailUnavailable(page, locale, siblingSpec);
      assert.equal(page.fetchCount, 1);
    }
  });

  for (const spec of newsletterEmailMetricSpecs) {
    const invalidRecordCases = [
      ['wrong basis', { basis: 'recorded-total' }],
      ['wrong timezone', { timeZone: 'America/Los_Angeles' }],
      ['invalid collection timestamp', { collectedAt: '2026-09-11T00:00:00Z' }],
      ['invalid interval date', { startDate: '2026-02-30' }],
      ['reversed interval', { startDate: '2026-09-08', endDate: '2026-09-07' }],
      ['invalid scope hash', { scopeId: 'not-a-sha256' }],
      ['wrong publication', { publication: { id: 'other', label: 'Simple AWS', language: 'en' } }],
      ['wrong content language', { publication: { id: 'simple-aws', label: 'Simple AWS', language: 'es' } }],
      ['negative metric', { [spec.metric]: -1 }],
      ['fractional metric', { [spec.metric]: 1.5 }],
      ['unsafe integer metric', { [spec.metric]: Number.MAX_SAFE_INTEGER + 1 }],
      ['string metric', { [spec.metric]: '1200' }],
      ['null metric', { [spec.metric]: null }],
      ['boolean metric', { [spec.metric]: true }],
      ['unexpected record key', { qualifications: [] }]
    ];

    for (const [description, changes] of invalidRecordCases) {
      test(`${locale} ${spec.group} rejects ${description} without affecting its sibling metric or period`, async () => {
        const records = newsletterEmailRecords(spec.metric);
        Object.assign(records['12m'], changes);
        const data = snapshotWithNewsletterEngagements({
          data: snapshotWithNewsletter(),
          opens: spec.metric === 'opens' ? records : newsletterEmailRecords('opens'),
          clicks: spec.metric === 'clicks' ? records : newsletterEmailRecords('clicks')
        });
        const page = createPage({ locale, data });
        await page.settle();

        assertNewsletterEmailUnavailable(page, locale, spec);
        const sibling = newsletterEmailMetricSpecs.find((candidate) => candidate.group !== spec.group);
        assertNewsletterEmailVisible(page, locale, sibling, '12m');
        page.periodSelector.value = '7d';
        page.periodSelector.dispatch('change');
        assertNewsletterEmailVisible(page, locale, spec, '7d');
        assertNewsletterEmailVisible(page, locale, sibling, '7d');
        assert.equal(page.cards.newsletter.count.textContent, '27', 'invalid email data cannot affect subscribers');
        assert.equal(page.fetchCount, 1);
      });
    }

    test(`${locale} ${spec.group} rejects a missing metric field without affecting its sibling metric`, async () => {
      const records = newsletterEmailRecords(spec.metric);
      delete records['12m'][spec.metric];
      const data = snapshotWithNewsletterEngagements({
        opens: spec.metric === 'opens' ? records : newsletterEmailRecords('opens'),
        clicks: spec.metric === 'clicks' ? records : newsletterEmailRecords('clicks')
      });
      const page = createPage({ locale, data });
      await page.settle();

      assertNewsletterEmailUnavailable(page, locale, spec);
      const sibling = newsletterEmailMetricSpecs.find((candidate) => candidate.group !== spec.group);
      assertNewsletterEmailVisible(page, locale, sibling, '12m');
      assert.equal(page.fetchCount, 1);
    });

    for (const [description, mutate] of [
      ['unknown period key', (group) => { group.records.total = newsletterEmailRecord(spec.metric, '12m'); }],
      ['unknown group key', (group) => { group.future = true; }],
      ['future definition version', (group) => { group.definitionVersion = 2; }]
    ]) {
      test(`${locale} ${spec.group} isolates ${description} from the other email metric`, async () => {
        const data = snapshotWithNewsletterEngagements();
        mutate(data.groups[spec.group]);
        const page = createPage({ locale, data });
        await page.settle();

        assertNewsletterEmailUnavailable(page, locale, spec);
        const sibling = newsletterEmailMetricSpecs.find((candidate) => candidate.group !== spec.group);
        assertNewsletterEmailVisible(page, locale, sibling, '12m');
        assert.equal(page.cards.newsletter.count.textContent, '27');
        assert.equal(page.fetchCount, 1);
      });
    }
  }
}

test('English newsletter sent total remains cumulative across five periods and Recorded total', async () => {
  const collectedAt = '2024-02-15T00:00:00.000Z';
  const data = snapshotWithNewsletterSent({
    data: snapshotWithNewsletterEngagements({ data: snapshotWithArticleViews() }),
    group: newsletterSentGroup({ sent: 4321, collectedAt })
  });
  const page = createPage({ locale: 'en', data });
  await page.settle();

  assert.equal(page.periodSelector.disabled, false, 'existing activity families own the shared period selector');
  assert.equal(page.periodOptions.total.disabled, false, 'article views, not sent totals, support Recorded total');
  for (const period of [...newsletterEmailPeriods, 'total']) {
    page.periodSelector.value = period;
    page.periodSelector.dispatch('change');
    assert.equal(page.periodSelector.value, period, 'the sent total does not reset a shared activity-period selection');
    assertNewsletterSentVisible(page, 'en', 4321, collectedAt);
    assert.equal(page.cards.newsletter.count.textContent, '27', 'current subscribers stay independent of sent totals');
    if (period === 'total') {
      assertViewsVisible(page, 'en', 'total');
      for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, 'en', spec);
    } else {
      assertViewsVisible(page, 'en', period);
      for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, 'en', spec, period);
    }
  }
  assert.equal(page.fetchCount, 1, 'the cumulative total and existing period metrics use one aggregate request');
  assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json']);
});

for (const locale of ['en', 'es']) {
  test(`${locale} sent-only zero keeps Newsletter visible for All and English, then clears under Spanish filtering`, async () => {
    const data = snapshotWithNewsletterSent({
      data: snapshotWithNewsletter(),
      group: newsletterSentGroup({ sent: 0, collectedAt: '2026-01-04T00:00:00.000Z' })
    });
    delete data.groups.newsletter;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.newsletter.card.hidden, false, 'a valid sent total keeps the Newsletter card visible by itself');
    assertNewsletterUnavailable(page, locale);
    assertNewsletterSentVisible(page, locale, 0, '2026-01-04T00:00:00.000Z');
    assert.equal(page.periodOptions.total.disabled, true, 'the sent total does not enable shared Recorded total');

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'English content includes the sent total');
    assertNewsletterSentVisible(page, locale, 0, '2026-01-04T00:00:00.000Z');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, true, 'the English sent total is hidden for Spanish content');
    assert.equal(page.cards.newsletter.results.hidden, true);
    assert.equal(page.cards.newsletter.count.textContent, '', 'filtering clears the missing subscriber count');
    assert.equal(page.cards.newsletter.coverage.textContent, '', 'filtering clears subscriber coverage');
    assert.equal(page.cards.newsletter.collectedDate.textContent, '', 'filtering clears the subscriber date');
    assertNewsletterSentUnavailable(page, locale, { hidden: true });

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assert.equal(page.cards.newsletter.card.hidden, false, 'All restores the sent-only Newsletter card');
    assertNewsletterUnavailable(page, locale);
    assertNewsletterSentVisible(page, locale, 0, '2026-01-04T00:00:00.000Z');
    assert.equal(page.fetchCount, 1, 'content-language changes reuse the one aggregate request');
  });
}

test('missing newsletter sent data stays unavailable without hiding healthy newsletter siblings', async () => {
  const data = snapshotWithNewsletterEngagements({ data: snapshotWithArticleViews() });
  const page = createPage({ locale: 'en', data });
  await page.settle();

  assert.equal(page.cards.newsletter.card.hidden, false);
  assertNewsletterSentUnavailable(page, 'en');
  assert.equal(page.cards.newsletter.count.textContent, '27');
  for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, 'en', spec, '12m');
  assertViewsVisible(page, 'en', '12m');
  assert.equal(page.fetchCount, 1);
});

const invalidNewsletterSentGroups = [
  ['future definition version', (group) => { group.definitionVersion = 2; }],
  ['period basis', (group) => { group.basis = 'recorded-total'; }],
  ['noncanonical collection timestamp', (group) => { group.collectedAt = '2026-09-01T00:00:00Z'; }],
  ['nonlowercase scope hash', (group) => { group.scopeId = 'F'.repeat(64); }],
  ['malformed scope hash', (group) => { group.scopeId = 'not-a-sha256'; }],
  ['wrong publication id', (group) => { group.publication.id = 'other'; }],
  ['wrong publication label', (group) => { group.publication.label = 'Other'; }],
  ['wrong publication language', (group) => { group.publication.language = 'es'; }],
  ['negative sent value', (group) => { group.sent = -1; }],
  ['fractional sent value', (group) => { group.sent = 1.5; }],
  ['unsafe sent value', (group) => { group.sent = Number.MAX_SAFE_INTEGER + 1; }],
  ['string sent value', (group) => { group.sent = '4321'; }],
  ['null sent value', (group) => { group.sent = null; }],
  ['boolean true sent value', (group) => { group.sent = true; }],
  ['boolean false sent value', (group) => { group.sent = false; }],
  ['missing sent field', (group) => { delete group.sent; }],
  ['period field', (group) => { group.period = '12m'; }],
  ['activity date field', (group) => { group.startDate = '2026-08-01'; }],
  ['timezone field', (group) => { group.timeZone = 'UTC'; }],
  ['records field', (group) => { group.records = {}; }],
  ['provider identifier', (group) => { group.publication.providerId = 'secret-provider-id'; }],
  ['other unexpected field', (group) => { group.future = true; }]
];

for (const [description, mutate] of invalidNewsletterSentGroups) {
  test(`invalid newsletter sent ${description} clears only that family`, async () => {
    const group = newsletterSentGroup();
    mutate(group);
    const data = snapshotWithNewsletterSent({
      data: snapshotWithNewsletterEngagements({ data: snapshotWithArticleViews() }),
      group
    });
    const page = createPage({ locale: 'en', data });
    await page.settle();

    assertNewsletterSentUnavailable(page, 'en');
    assert.equal(page.cards.newsletter.card.hidden, false, 'invalid sent data does not hide the Newsletter card');
    assert.equal(page.cards.newsletter.count.textContent, '27', 'invalid sent data does not alter current subscribers');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailVisible(page, 'en', spec, '12m');
    assertViewsVisible(page, 'en', '12m');
    assert.equal(page.fetchCount, 1);
  });
}

test('newsletter sent loading and fetch or root failures clear any stale result', async () => {
  for (const options of [
    { fetchError: new Error('synthetic fetch failure') },
    { data: null }
  ]) {
    const page = createPage({
      locale: 'en',
      data: snapshotWithNewsletterSent(),
      ...options
    });
    const sent = page.cards.newsletter.sent;
    assert.equal(sent.status.hidden, false, 'the client shows a loading state while the shared request is pending');
    assert.match(sent.status.textContent, /loading.*emails sent/i);
    assert.equal(sent.results.hidden, true, 'the loading result stays hidden');
    assert.equal(sent.value.textContent, '', 'loading has no placeholder number');

    sent.results.hidden = false;
    sent.value.textContent = '9999';
    sent.coverage.textContent = 'Stale source';
    sent.collectedDate.textContent = 'Stale date';
    await page.settle();

    assertNewsletterSentUnavailable(page, 'en');
    assert.equal(page.fetchCount, 1, 'a failed request does not poll for the sent family');
  }
});

test('newsletter sent value and date reflect the reported snapshot when retained or refreshed', async () => {
  const retained = newsletterSentGroup({ sent: 3890, collectedAt: '2026-08-03T00:00:00.000Z' });
  const retainedPage = createPage({ locale: 'en', data: snapshotWithNewsletterSent({ group: retained }) });
  await retainedPage.settle();
  assertNewsletterSentVisible(retainedPage, 'en', 3890, retained.collectedAt);

  const refreshed = newsletterSentGroup({ sent: 4321, collectedAt: '2026-09-16T00:00:00.000Z' });
  const refreshedPage = createPage({ locale: 'en', data: snapshotWithNewsletterSent({ group: refreshed }) });
  await refreshedPage.settle();
  assertNewsletterSentVisible(refreshedPage, 'en', 4321, refreshed.collectedAt);
  assert.equal(retainedPage.fetchCount, 1);
  assert.equal(refreshedPage.fetchCount, 1);
});

for (const locale of ['en', 'es']) {
  test(`${locale} snapshot fetch and root failures also finish the Search loading state`, async () => {
    for (const failure of ['network', 'unknown family', 'unsupported schema']) {
      const data = snapshotWithArticleSearchClicks();
      if (failure === 'unknown family') data.groups.futureMetric = {};
      if (failure === 'unsupported schema') data.schemaVersion = 99;
      const page = createPage({
        locale,
        data,
        ...(failure === 'network' ? { fetchError: new Error('synthetic fetch failure') } : {})
      });
      await page.settle();
      assertSearchUnavailable(page, locale);
      assertAllUnavailable(page, locale);
      assert.equal(page.fetchCount, 1);
      assert.equal(page.periodSelector.disabled, true);
    }
  });

  test(`${locale} Search clicks expose their own localized loading status`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks() });

    assert.equal(page.cards.articles.search.status.hidden, false, 'Search has its own loading status while the shared snapshot is fetched');
    assert.match(page.cards.articles.search.status.textContent, locale === 'es' ? /cargando/i : /loading/i);
    assert.equal(page.cards.articles.search.results.hidden, true);
    await page.settle();
    assertSearchVisible(page, locale, '12m');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} Search clicks and views use shared local selectors with one aggregate fetch`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks() });
    await page.settle();

    assertSearchVisible(page, locale, '12m');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.selector.disabled, false, 'the shared language selector becomes usable');
    assert.equal(page.periodSelector.disabled, false, 'the shared period selector becomes usable');

    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertSearchVisible(page, locale, '30d');
    assertViewsVisible(page, locale, '30d');

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertSearchVisible(page, locale, '30d');
    assertViewsVisible(page, locale, '30d');
    assert.equal(page.cards.articles.count.textContent, '7', 'the shared language selector changes counts locally');

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertSearchUnavailable(page, locale);
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '4', 'unsupported Search language does not suppress Spanish article counts');

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertSearchVisible(page, locale, '30d');
    assertViewsVisible(page, locale, '30d');
    assert.equal(page.fetchCount, 1, 'both metric families and all selector changes reuse one snapshot fetch');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json']);
    assert.equal(page.location.href, 'https://guilleojeda.com/', 'local filtering does not navigate');
  });

  test(`${locale} Search zero is visible and unavailable language or period clears stale metadata`, async () => {
    const records = articleSearchRecords();
    records['12m'].clicks = 0;
    delete records.ytd;
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks({ records }) });
    await page.settle();

    assert.equal(page.cards.articles.search.results.hidden, false, 'an explicit zero is valid Search data');
    assert.equal(page.cards.articles.search.value.textContent, '0');
    assert.equal(page.cards.articles.search.status.hidden, true);

    page.periodSelector.value = 'ytd';
    page.periodSelector.dispatch('change');
    assertSearchUnavailable(page, locale);

    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertSearchVisible(page, locale, '7d');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertSearchUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} valid Search clicks render when the Views region is absent`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks({ includeViews: false }), includeViews: false });
    await page.settle();

    assertSearchVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.periodSelector.disabled, false, 'Search alone makes shared period controls usable');
    page.periodSelector.value = '90d';
    page.periodSelector.dispatch('change');
    assertSearchVisible(page, locale, '90d');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid Search family leaves valid Views and counts available`, async () => {
    const data = snapshotWithArticleSearchClicks({ definitionVersion: 2 });
    const page = createPage({ locale, data });
    await page.settle();

    assertSearchUnavailable(page, locale);
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '7d');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} malformed Search period records are isolated from healthy Search, Views and counts`, async () => {
    const invalidRecordCases = [
      ['unsafe clicks', { clicks: Number.MAX_SAFE_INTEGER + 1 }],
      ['string clicks', { clicks: '1200' }],
      ['negative clicks', { clicks: -1 }],
      ['invalid interval date', { startDate: '2026-02-30' }],
      ['wrong timezone', { timeZone: 'America/New_York' }],
      ['wrong basis', { basis: 'recorded-total' }],
      ['invalid scope hash', { scopeId: 'not-a-sha256' }],
      ['extra provider field', { query: 'private search query' }]
    ];

    for (const [description, changes] of invalidRecordCases) {
      const data = snapshotWithArticleSearchClicks();
      Object.assign(data.groups.articleSearchClicks.records['12m'], changes);
      const page = createPage({ locale, data });
      await page.settle();

      assertSearchUnavailable(page, locale);
      assertViewsVisible(page, locale, '12m');
      assert.equal(page.cards.articles.count.textContent, '11', `${description} does not affect article counts`);
      page.periodSelector.value = '7d';
      page.periodSelector.dispatch('change');
      assertSearchVisible(page, locale, '7d');
      assertViewsVisible(page, locale, '7d');
      assert.equal(page.fetchCount, 1);
    }
  });

  test(`${locale} Search rejects a total record key without affecting GA4 or counts`, async () => {
    const data = snapshotWithArticleSearchClicks();
    data.groups.articleSearchClicks.records.total = articleSearchRecord('12m');
    const page = createPage({ locale, data });
    await page.settle();

    assertSearchUnavailable(page, locale);
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, 'total');
    assertSearchUnavailable(page, locale);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} invalid Views family leaves valid Search clicks and counts available`, async () => {
    const data = snapshotWithArticleSearchClicks();
    data.groups.articleViews.definitionVersion = 2;
    const page = createPage({ locale, data });
    await page.settle();

    assertSearchVisible(page, locale, '12m');
    assertViewsUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertSearchVisible(page, locale, '7d');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} legacy snapshots without Search keep existing cards and Views`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleViews() });
    await page.settle();

    assertSearchUnavailable(page, locale);
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} retained Search provenance supplies source, interval, timezone and collection date`, async () => {
    const records = articleSearchRecords();
    records['12m'] = articleSearchRecord('12m', {
      collectedAt: '2025-11-03T00:00:00.000Z',
      scopeId: 'f'.repeat(64),
      startDate: '2024-11-01',
      endDate: '2025-10-31'
    });
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks({ records }) });
    await page.settle();

    assertSearchVisible(page, locale, '12m');
    assert.equal(page.cards.articles.search.coverage.textContent, 'Simple AWS');
    assert.ok(page.cards.articles.search.interval.textContent.includes('America/Los_Angeles'));
    assert.ok(page.cards.articles.search.interval.textContent.includes(new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date('2024-11-01T00:00:00.000Z'))));
    assert.equal(page.cards.articles.search.collectedDate.textContent, expectedDate(locale, '2025-11-03T00:00:00.000Z'));
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} Search has no total while a valid GA4 recorded total remains selectable`, async () => {
    const page = createPage({ locale, data: snapshotWithArticleSearchClicks() });
    await page.settle();

    assert.equal(page.periodOptions.total.disabled, false, 'the existing GA4 total keeps the shared total option enabled');
    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, 'total');
    assertSearchUnavailable(page, locale);
    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.fetchCount, 1);
  });
}

const invalidSnapshots = [
  ['unknown source', snapshot({ sources: [caylent, { id: 'unknown', label: 'Unknown' }] })],
  ['duplicate source', snapshot({ sources: [caylent, { ...caylent }] })],
  ['mislabeled source', snapshot({ sources: [{ id: 'caylent', label: 'AWS Builder Center' }] })],
  ['Builder Center only', snapshot({ sources: [builderCenter] })],
  ['unsupported document schema', snapshot({ schemaVersion: 99 })],
  ['unsupported article definition', snapshot({ definitionVersion: 2 })]
];

for (const [description, data] of invalidSnapshots) {
  test(`${description} produces a contained unavailable state without a number`, async () => {
    const page = createPage({ locale: 'en', data });
    await page.settle();

    assertUnavailable(page, 'en');
    assert.equal(page.fetchCount, 1);
  });
}

const unknownRootGroupSnapshot = snapshotWithNewsletter();
unknownRootGroupSnapshot.groups.newsletters = unknownRootGroupSnapshot.groups.books;
const unknownRootGroupWithViewsSnapshot = snapshotWithArticleViews();
unknownRootGroupWithViewsSnapshot.groups.newsletters = unknownRootGroupWithViewsSnapshot.groups.books;

const invalidDocuments = [
  ['unsupported root schema', { ...threeGroupSnapshot(), schemaVersion: 2 }],
  ['unknown group key beside valid newsletter', unknownRootGroupSnapshot],
  ['unknown group key beside valid article views', unknownRootGroupWithViewsSnapshot],
  ['malformed fetch response', null]
];

for (const [description, data] of invalidDocuments) {
  test(`${description} makes every card unavailable without a stale count`, async () => {
    const page = createPage({ locale: 'en', data });
    await page.settle();

    assertAllUnavailable(page, 'en');
    assert.equal(page.fetchCount, 1);
  });
}

for (const [description, options] of [
  ['non-OK HTTP response', { responseOk: false }],
  ['rejected network request', { fetchError: new Error('network unavailable') }]
]) {
  test(`${description} makes every card unavailable without a stale count`, async () => {
    const page = createPage({ locale: 'es', ...options });
    await page.settle();

    assertAllUnavailable(page, 'es');
    assert.equal(page.fetchCount, 1);
  });
}

test('views reject numeric-offset timezones while preserving fixed IANA zones and healthy periods', async () => {
  const records = articleViewsRecords();
  records['12m'].timeZone = '+01:00';
  records['30d'].timeZone = 'Etc/GMT+1';
  const page = createPage({ locale: 'en', data: snapshotWithArticleViews({ records }) });
  await page.settle();

  assertViewsUnavailable(page, 'en');
  assert.equal(page.cards.articles.count.textContent, '11');
  page.periodSelector.value = '30d';
  page.periodSelector.dispatch('change');
  assert.equal(page.cards.articles.views.results.hidden, false);
  assert.equal(page.cards.articles.views.value.textContent, '30');
  assert.match(page.cards.articles.views.interval.textContent, /Etc\/GMT\+1/);
  assert.equal(page.fetchCount, 1);
});

test('directory views accept a valid IANA timezone and render that source metadata', async () => {
  const records = directoryViewsRecords();
  records['12m'].timeZone = 'Etc/GMT+1';
  const page = createPage({ locale: 'en', data: snapshotWithDirectoryViews({ records }) });
  await page.settle();

  assertDirectoryViewsVisible(page, 'en', '12m');
  assert.match(page.cards.directoryViews.interval.textContent, /Etc\/GMT\+1/);
  assert.equal(page.fetchCount, 1);
});

test('invalid directory timezone metadata isolates its periods and preserves healthy siblings', async () => {
  const records = directoryViewsRecords();
  records['12m'].timeZone = '+01:00';
  records['30d'].timeZone = 'Not/A_Timezone';
  records['90d'].timeZone = 'Etc/GMT+2';
  const page = createPage({ locale: 'en', data: snapshotWithDirectoryViews({ records }) });
  await page.settle();

  assertDirectoryViewsUnavailable(page, 'en');
  page.periodSelector.value = '30d';
  page.periodSelector.dispatch('change');
  assertDirectoryViewsUnavailable(page, 'en');
  page.periodSelector.value = '90d';
  page.periodSelector.dispatch('change');
  assertDirectoryViewsVisible(page, 'en', '90d');
  assert.match(page.cards.directoryViews.interval.textContent, /Etc\/GMT\+2/);
  assert.equal(page.cards.articles.count.textContent, '11');
  assert.equal(page.fetchCount, 1);
});

for (const locale of ['en', 'es']) {
  test(`${locale} Builder Center recorded views stay independent of GA4 periods and content language`, async () => {
    const group = builderArticleViewsGroup();
    const page = createPage({ locale, data: snapshotWithBuilderArticleViews({ group }) });
    const builder = page.cards.articles.builderViews;

    assert.equal(builder.status.hidden, false, 'the independent row announces loading while the shared snapshot is fetched');
    assert.match(builder.status.textContent, locale === 'en' ? /loading.*Builder Center/i : /cargando.*Builder Center/i);
    assert.equal(builder.result.hidden, true, 'the initial result stays hidden');
    assert.equal(builder.value.textContent, '', 'the initial value has no placeholder number');
    assert.equal(builder.coverage.textContent, '', 'the initial source is empty');
    assert.equal(builder.since.textContent, '', 'the initial tracking date is empty');
    assert.equal(builder.collectedDate.textContent, '', 'the initial collection date is empty');
    await page.settle();

    assertBuilderViewsVisible(page, locale, 'all', group);
    assert.equal(page.cards.articles.count.textContent, '11');
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.periodSelector.disabled, false);
    assert.equal(page.periodOptions.total.disabled, false, 'the healthy GA4 total independently enables Recorded total');

    for (const period of articleViewPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assert.equal(page.periodSelector.value, period);
      assertViewsVisible(page, locale, period);
      assertBuilderViewsVisible(page, locale, 'all', group);
    }

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.periodSelector.value, 'total', 'the independent row does not reset GA4-supported Recorded total during English filtering');
    assertBuilderViewsVisible(page, locale, 'en', group);
    assert.equal(page.cards.articles.count.textContent, '7');
    for (const period of articleViewPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertViewsVisible(page, locale, period);
      assertBuilderViewsVisible(page, locale, 'en', group);
    }

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assertBuilderViewsVisible(page, locale, 'es', group);
    assert.equal(page.cards.articles.count.textContent, '4');
    assertViewsUnavailable(page, locale);
    assert.equal(page.periodOptions.total.disabled, true, 'Builder Center does not supply an activity-period total');
    assert.equal(page.periodSelector.value, '12m', 'Spanish filtering retains the existing unsupported-total reset behavior');
    for (const period of articleSearchPeriods) {
      page.periodSelector.value = period;
      page.periodSelector.dispatch('change');
      assertBuilderViewsVisible(page, locale, 'es', group);
      assertViewsUnavailable(page, locale);
      assert.equal(page.cards.articles.count.textContent, '4');
    }

    page.selector.value = 'all';
    page.selector.dispatch('change');
    assertBuilderViewsVisible(page, locale, 'all', group);
    assertViewsVisible(page, locale, '12m');
    assert.equal(page.periodOptions.total.disabled, false, 'returning to All restores GA4-supported Recorded total');
    assert.equal(page.fetchCount, 1, 'language and period changes reuse one aggregate request');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json']);
    assert.equal(page.location.href, 'https://guilleojeda.com/', 'local filtering does not navigate');
  });
}

test('Builder Center views work alone when article counts and GA4 views are missing', async () => {
  const group = builderArticleViewsGroup();
  const page = createPage({
    locale: 'en',
    data: { schemaVersion: 1, groups: { builderArticleViews: group } }
  });
  page.periodSelector.value = 'total';
  await page.settle();

  assertBuilderViewsVisible(page, 'en', 'all', group);
  assertUnavailable(page, 'en', 'articles');
  assertViewsUnavailable(page, 'en');
  assert.equal(page.periodOptions.total.disabled, true, 'Builder Center does not enable Recorded total');
  assert.equal(page.periodSelector.value, '12m', 'the existing control resets an unsupported Recorded total');

  page.selector.value = 'en';
  page.selector.dispatch('change');
  assertBuilderViewsVisible(page, 'en', 'en', group);
  assertUnavailable(page, 'en', 'articles');
  page.selector.value = 'es';
  page.selector.dispatch('change');
  assertBuilderViewsVisible(page, 'en', 'es', group);
  assertUnavailable(page, 'en', 'articles');
  assert.equal(page.fetchCount, 1);
});

test('Builder Center and GA4 views remain available when article counts are missing', async () => {
  const group = builderArticleViewsGroup();
  const data = snapshotWithArticleViews();
  delete data.groups.articles;
  data.groups.builderArticleViews = group;
  const page = createPage({ locale: 'en', data });
  await page.settle();

  assertUnavailable(page, 'en', 'articles');
  assertBuilderViewsVisible(page, 'en', 'all', group);
  assertViewsVisible(page, 'en', '12m');
  assert.equal(page.periodOptions.total.disabled, false, 'GA4 keeps its supported total available without article counts');
  assert.equal(page.fetchCount, 1);
});

test('Builder Center views remain available when article counts exist and GA4 views are missing', async () => {
  const group = builderArticleViewsGroup();
  const data = snapshotWithNewsletter();
  data.groups.builderArticleViews = group;
  const page = createPage({ locale: 'en', data });
  page.periodSelector.value = 'total';
  await page.settle();

  assert.equal(page.cards.articles.count.textContent, '11');
  assertBuilderViewsVisible(page, 'en', 'all', group);
  assertViewsUnavailable(page, 'en');
  assert.equal(page.periodOptions.total.disabled, true, 'Builder Center does not supply GA4 or another period total');
  assert.equal(page.periodSelector.value, '12m', 'the existing fallback still resets an unsupported total');
  assert.equal(page.fetchCount, 1);
});

test('Builder Center recorded zero stays visible for All, English, and Spanish content', async () => {
  const group = builderArticleViewsGroup({ views: { all: 0, en: 0, es: 0 } });
  const data = snapshotWithBuilderArticleViews({ group });
  data.groups.articles.counts = { all: 0, en: 0, es: 0 };
  const page = createPage({ locale: 'es', data });
  await page.settle();

  for (const [language, expectedCount] of [['all', '0'], ['en', '0'], ['es', '0']]) {
    page.selector.value = language;
    page.selector.dispatch('change');
    assertBuilderViewsVisible(page, 'es', language, group);
    assert.equal(page.cards.articles.count.textContent, expectedCount, 'valid zero article counts remain measured values');
  }
  assert.equal(page.fetchCount, 1);
});

test('missing Builder Center data stays unavailable without rejecting healthy existing families', async () => {
  const page = createPage({ locale: 'en', data: snapshotWithArticleViews() });
  await page.settle();

  assertBuilderViewsUnavailable(page, 'en');
  assert.equal(page.cards.articles.count.textContent, '11');
  assertViewsVisible(page, 'en', '12m');
  assert.equal(page.periodOptions.total.disabled, false, 'existing GA4 data still enables its own total');
  assert.equal(page.fetchCount, 1);
});

const invalidBuilderArticleViewsGroups = [
  ['future definition version', (group) => { group.definitionVersion = 2; }],
  ['wrong basis', (group) => { group.basis = 'cumulative'; }],
  ['noncanonical collection timestamp', (group) => { group.collectedAt = '2026-09-16T00:00:00Z'; }],
  ['nonlowercase scope hash', (group) => { group.scopeId = 'A'.repeat(64); }],
  ['malformed scope hash', (group) => { group.scopeId = 'builder-center'; }],
  ['wrong source id', (group) => { group.source.id = 'other'; }],
  ['wrong source label', (group) => { group.source.label = 'Other'; }],
  ['provider identifier in source', (group) => { group.source.providerId = 'private-id'; }],
  ['wrong tracking start date', (group) => { group.startDate = '2026-01-07'; }],
  ['mismatched language sum', (group) => { group.views.all = 121; }],
  ['negative language value', (group) => { group.views.en = -1; }],
  ['fractional language value', (group) => { group.views.es = 1.5; }],
  ['unsafe integer language value', (group) => { group.views.en = Number.MAX_SAFE_INTEGER + 1; }],
  ['string language value', (group) => { group.views.es = '48'; }],
  ['missing language value', (group) => { delete group.views.es; }],
  ['extra field in group', (group) => { group.providerId = 'private-id'; }],
  ['extra field in language counts', (group) => { group.views.fr = 1; }]
];

for (const [description, mutate] of invalidBuilderArticleViewsGroups) {
  test(`invalid Builder Center recorded views reject ${description} without affecting healthy siblings`, async () => {
    const group = builderArticleViewsGroup();
    mutate(group);
    const page = createPage({ locale: 'en', data: snapshotWithBuilderArticleViews({ group }) });
    await page.settle();

    assertBuilderViewsUnavailable(page, 'en');
    assert.equal(page.cards.articles.count.textContent, '11', 'invalid Builder Center metadata does not hide article counts');
    assertViewsVisible(page, 'en', '12m');
    assert.equal(page.periodOptions.total.disabled, false, 'invalid Builder Center metadata cannot disable a healthy GA4 total');
    assert.equal(page.fetchCount, 1);
  });
}

for (const [failure, options] of [
  ['network failure', { fetchError: new Error('synthetic fetch failure') }],
  ['HTTP failure', { responseOk: false }],
  ['invalid root document', { data: null }]
]) {
  test(`Builder Center loading and ${failure} clear stale values and provenance`, async () => {
    const page = createPage({ locale: 'en', data: snapshotWithBuilderArticleViews(), ...options });
    const builder = page.cards.articles.builderViews;
    assert.equal(builder.status.hidden, false, 'the row shows loading while the shared request is pending');
    assert.match(builder.status.textContent, /loading.*Builder Center/i);
    assert.equal(builder.result.hidden, true);
    assert.equal(builder.value.textContent, '');

    builder.result.hidden = false;
    builder.value.textContent = '9999';
    builder.coverage.textContent = 'Stale source';
    builder.since.textContent = 'Stale start';
    builder.collectedDate.textContent = 'Stale date';
    await page.settle();

    assertBuilderViewsUnavailable(page, 'en');
    assert.equal(page.fetchCount, 1, 'a failed shared request does not poll for this metric');
  });
}

test('Builder Center displays retained and refreshed snapshots with each page’s own collection date', async () => {
  const retainedGroup = builderArticleViewsGroup({
    views: { all: 37, en: 20, es: 17 },
    collectedAt: '2026-01-07T00:00:00.000Z'
  });
  const retainedPage = createPage({
    locale: 'en',
    data: snapshotWithBuilderArticleViews({ group: retainedGroup })
  });
  await retainedPage.settle();
  assertBuilderViewsVisible(retainedPage, 'en', 'all', retainedGroup);

  const refreshedGroup = builderArticleViewsGroup({
    views: { all: 124, en: 73, es: 51 },
    collectedAt: '2026-09-20T00:00:00.000Z'
  });
  const refreshedPage = createPage({
    locale: 'en',
    data: snapshotWithBuilderArticleViews({ group: refreshedGroup })
  });
  await refreshedPage.settle();
  assertBuilderViewsVisible(refreshedPage, 'en', 'all', refreshedGroup);
  assertBuilderViewsVisible(retainedPage, 'en', 'all', retainedGroup);
  assert.equal(retainedPage.fetchCount, 1);
  assert.equal(refreshedPage.fetchCount, 1);
});
