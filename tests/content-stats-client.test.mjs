import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const clientSource = readFileSync(new URL('../src/scripts/content-stats.js', import.meta.url), 'utf8');
const collectedAt = '2026-08-04T00:00:00.000Z';
const talksCollectedAt = '2026-07-28T00:00:00.000Z';
const booksCollectedAt = '2026-06-30T00:00:00.000Z';
const newsletterCollectedAt = '2026-08-01T00:00:00.000Z';
const overviewKinds = ['articles', 'talks', 'books', 'newsletter'];
const caylent = { id: 'caylent', label: 'Caylent' };
const builderCenter = { id: 'builder-center', label: 'AWS Builder Center' };
const websiteInventory = { id: 'website-inventory', label: 'Website inventory' };
const simpleAws = { id: 'simple-aws', label: 'Simple AWS' };
const cloudyThings = { id: 'cloudy-things', label: 'Cloudy Things' };
const dondeAprendoAws = { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS' };
const awsForEngineers = { id: 'aws-for-engineers', label: 'AWS for Engineers' };
const devCommunity = { id: 'dev-community', label: 'DEV Community' };
const linkedinArticles = { id: 'linkedin-articles', label: 'LinkedIn' };
const spainClouds = { id: 'spainclouds', label: 'SpainClouds' };
const hackerNoon = { id: 'hackernoon', label: 'HackerNoon' };
const automaticArticleSources = [caylent, builderCenter, simpleAws, cloudyThings, dondeAprendoAws, awsForEngineers];
const individualArticleSources = [devCommunity, linkedinArticles, spainClouds, hackerNoon];
const articleViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];
const articleSearchPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const directoryViewPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const directoryOutboundClickPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const newsletterEmailPeriods = ['7d', '30d', '90d', '12m', 'ytd'];
const newsletterEmailMetricSpecs = [
  { group: 'newsletterEmailOpens', metric: 'opens', region: 'emailOpens', label: { en: /email opens?/i, es: /aperturas? de emails?/i }, unit: { en: /^opens?$/i, es: /^aperturas?$/i } },
  { group: 'newsletterEmailVerifiedClicks', metric: 'clicks', region: 'emailVerifiedClicks', label: { en: /verified email clicks?/i, es: /clics? verificados? en emails?/i }, unit: { en: /^clicks?$/i, es: /^clics?$/i } }
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

function manualBuilderArticleViewsGroup({
  views = { all: 83, en: 31, es: 52 },
  observedAt = '2026-10-22T17:30:00.000Z',
  scopeId = '8'.repeat(64)
} = {}) {
  return {
    definitionVersion: 2,
    basis: 'recorded-total',
    provenance: 'manual',
    observedAt,
    scopeId,
    source: { ...builderCenter },
    startDate: '2026-01-06',
    views
  };
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

function overviewSnapshot() {
  const data = snapshotWithArticleViews();
  data.groups.articles.counts = { all: 12_345, en: 9_000, es: 3_345 };
  data.groups.talks.counts = { all: 67, en: 23, es: 44 };
  data.groups.books.counts = { all: 1_234, en: 734, es: 500 };
  data.groups.newsletter.subscribers = 45_678;
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

function snapshotWithIndividualArticleSources({
  sources = individualArticleSources,
  automaticSources = automaticArticleSources,
  counts = { all: 618, en: 398, es: 220 },
  collectedAt = '2026-10-26T16:00:00.000Z'
} = {}) {
  const data = snapshotWithArticleSearchClicks();
  data.groups.articles.sources = [...automaticSources, ...sources];
  data.groups.articles.counts = { ...counts };
  data.groups.articles.collectedAt = collectedAt;
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
  if (/^[a-z][a-z0-9-]*$/i.test(selector)) return element.tagName.toLowerCase() === selector.toLowerCase();

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
  constructor({ dataset = {}, attributes = {}, textContent = '', hidden = false, disabled = false, value = '', tagName = 'div', documentRef = null } = {}) {
    this.dataset = { ...dataset };
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
    this.hidden = hidden;
    this.disabled = disabled;
    this.value = value;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentRef;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
  }

  get id() { return this.attributes.get('id') ?? ''; }
  get classList() { return (this.attributes.get('class') ?? '').split(/\s+/).filter(Boolean); }
  get href() {
    const value = this.attributes.get('href');
    if (value === undefined) return '';
    try {
      return new URL(value, this.ownerDocument?.baseURI ?? 'https://guilleojeda.com/').href;
    } catch {
      return value;
    }
  }
  set href(value) { this.setAttribute('href', value); }

  appendChild(child) {
    if (child.tagName === '#DOCUMENT-FRAGMENT') {
      for (const fragmentChild of [...child.children]) this.appendChild(fragmentChild);
      child.children = [];
      return child;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
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

  setSelectionRange(start, end) {
    this.selectionStart = Math.max(0, Math.min(Number(start), String(this.value).length));
    this.selectionEnd = Math.max(this.selectionStart, Math.min(Number(end), String(this.value).length));
  }

  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }

  dispatch(name, init = {}) {
    const event = {
      type: name,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...init
    };
    for (const callback of this.listeners.get(name) ?? []) callback(event);
    return event;
  }

  removeEventListener(name, callback) {
    const callbacks = this.listeners.get(name) ?? [];
    this.listeners.set(name, callbacks.filter((current) => current !== callback));
  }

  click() {
    if (!this.disabled) this.dispatch('click');
  }

  focus() {
    if (this.ownerDocument && !this.disabled) this.ownerDocument.activeElement = this;
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
    loading: 'Loading page views…',
    unavailable: 'Page view data are unavailable.',
    unit: 'views'
  },
  es: {
    loading: 'Cargando vistas de artículos…',
    unavailable: 'No hay datos disponibles de vistas de páginas.',
    unit: 'vistas'
  }
};

const searchCopy = {
  en: {
    loading: 'Loading Search clicks…',
    unavailable: 'Search click data are unavailable.',
    unit: 'clicks'
  },
  es: {
    loading: 'Cargando clics de búsqueda…',
    unavailable: 'No hay datos disponibles de clics de búsqueda.',
    unit: 'clics'
  }
};

const directoryViewsCopy = {
  en: {
    loading: 'Loading Dónde Aprendo AWS page views…',
    unavailable: 'Dónde Aprendo AWS page view data are unavailable.',
    unit: 'page views'
  },
  es: {
    loading: 'Cargando vistas de página de Dónde Aprendo AWS…',
    unavailable: 'No hay datos disponibles de vistas de páginas de Dónde Aprendo AWS.',
    unit: 'vistas de página'
  }
};

const directoryOutboundClicksCopy = {
  en: {
    label: 'External link clicks',
    loading: 'Loading Dónde Aprendo AWS external link clicks…',
    unavailable: 'Dónde Aprendo AWS external link click data are unavailable.',
    unit: 'clicks'
  },
  es: {
    label: 'Clics en enlaces externos',
    loading: 'Cargando clics en enlaces externos de Dónde Aprendo AWS…',
    unavailable: 'No hay datos disponibles de clics en enlaces externos de Dónde Aprendo AWS.',
    unit: 'clics'
  }
};

const newsletterEmailCopy = {
  en: {
    opens: {
      label: 'Email opens',
      loading: 'Loading email opens…',
      unavailable: 'Email open data are unavailable.',
      unit: 'opens'
    },
    clicks: {
      label: 'Verified email clicks',
      loading: 'Loading verified email clicks…',
      unavailable: 'Verified email click data are unavailable.',
      unit: 'clicks'
    }
  },
  es: {
    opens: {
      label: 'Aperturas de emails',
      loading: 'Cargando aperturas de emails…',
      unavailable: 'No hay datos disponibles de aperturas de emails.',
      unit: 'aperturas'
    },
    clicks: {
      label: 'Clics verificados en emails',
      loading: 'Cargando clics verificados en emails…',
      unavailable: 'No hay datos disponibles de clics verificados en emails.',
      unit: 'clics'
    }
  }
};

const newsletterSentCopy = {
  en: {
    label: 'Emails sent · cumulative total',
    loading: 'Loading emails sent…',
    unavailable: 'Emails sent are unavailable.'
  },
  es: {
    label: 'Emails enviados · total acumulado',
    loading: 'Cargando emails enviados…',
    unavailable: 'No se pueden mostrar los emails enviados.'
  }
};

const builderArticleViewsCopy = {
  en: {
    label: 'Builder Center views · recorded total',
    loading: 'Loading Builder Center recorded views…',
    unavailable: 'Builder Center recorded views are unavailable.',
    unit: 'views'
  },
  es: {
    label: 'Vistas en Builder Center · total registrado',
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
  const provenance = result.appendChild(new SemanticElement({ dataset: { statsBuilderViewsProvenance: '' } }));
  return { region, label, status, result, value, coverage, since, collectedDate, provenance };
}

function makeArticleCatalog(locale) {
  const root = new SemanticElement({
    dataset: {
      catalogSource: '/content-stats/v1/current.json',
      catalogLocale: locale
    },
    attributes: { id: 'article-catalog' }
  });
  const query = root.appendChild(new SemanticElement({
    dataset: { catalogQuery: '' },
    tagName: 'input',
    value: '',
    disabled: true,
    attributes: { type: 'search', id: 'article-catalog-query' }
  }));
  const sort = root.appendChild(new SemanticElement({
    dataset: { catalogSort: '' },
    tagName: 'select',
    value: 'date-desc',
    disabled: true
  }));
  for (const value of ['date-desc', 'date-asc', 'title-asc', 'title-desc', 'source-asc', 'source-desc']) {
    sort.appendChild(new SemanticElement({ tagName: 'option', attributes: { value }, textContent: value }));
  }
  const language = root.appendChild(new SemanticElement({
    dataset: { catalogLanguage: '' },
    tagName: 'select',
    value: 'all',
    disabled: true
  }));
  for (const [value, label] of [['all', 'All'], ['en', 'English'], ['es', 'Spanish']]) {
    language.appendChild(new SemanticElement({ tagName: 'option', attributes: { value }, textContent: label }));
  }
  const size = root.appendChild(new SemanticElement({
    dataset: { catalogSize: '' },
    tagName: 'select',
    value: '10',
    disabled: true
  }));
  for (const value of ['10', '20', '50']) size.appendChild(new SemanticElement({ tagName: 'option', attributes: { value }, textContent: value }));
  const collectedDate = root.appendChild(new SemanticElement({ dataset: { catalogCollectedDate: '' } }));
  const coverage = root.appendChild(new SemanticElement({ dataset: { catalogCoverage: '' } }));
  const status = root.appendChild(new SemanticElement({
    dataset: { catalogStatus: '' },
    attributes: { role: 'status', 'aria-live': 'polite' },
    textContent: locale === 'en' ? 'Loading articles…' : 'Cargando artículos…'
  }));
  const results = root.appendChild(new SemanticElement({ dataset: { catalogResults: '' }, hidden: true }));
  const range = results.appendChild(new SemanticElement({
    dataset: { catalogRange: '' },
    attributes: { role: 'status', 'aria-live': 'polite' }
  }));
  const list = results.appendChild(new SemanticElement({ dataset: { catalogList: '' }, tagName: 'ol' }));
  const empty = root.appendChild(new SemanticElement({ dataset: { catalogEmpty: '' }, hidden: true }));
  const fallback = root.appendChild(new SemanticElement({ dataset: { catalogFallback: '' } }));
  const previous = root.appendChild(new SemanticElement({
    dataset: { catalogPrevious: '' }, tagName: 'button', value: '', disabled: true,
    attributes: { type: 'button' }
  }));
  const next = root.appendChild(new SemanticElement({
    dataset: { catalogNext: '' }, tagName: 'button', value: '', disabled: true,
    attributes: { type: 'button' }
  }));
  return { root, query, sort, language, size, collectedDate, coverage, status, results, range, list, empty, fallback, previous, next };
}

function createBrowser(initialHref) {
  const entries = [{ url: new URL(initialHref), state: null }];
  const calls = [];
  const listeners = new Map();
  let index = 0;
  const current = () => entries[index];
  const location = {};
  for (const property of ['href', 'origin', 'pathname', 'search', 'hash']) {
    Object.defineProperty(location, property, {
      enumerable: true,
      get() { return current().url[property]; }
    });
  }

  const dispatch = (event) => {
    for (const callback of listeners.get(event.type) ?? []) callback({ target: windowRef, currentTarget: windowRef, ...event });
    return true;
  };
  const history = {
    pushState(state, title, url = null) {
      const nextUrl = url === null ? new URL(current().url) : new URL(url, current().url);
      calls.push({ method: 'pushState', state, title, url: url === null ? null : String(url), href: nextUrl.href });
      entries.splice(index + 1);
      entries.push({ url: nextUrl, state });
      index = entries.length - 1;
    },
    replaceState(state, title, url = null) {
      const nextUrl = url === null ? new URL(current().url) : new URL(url, current().url);
      calls.push({ method: 'replaceState', state, title, url: url === null ? null : String(url), href: nextUrl.href });
      entries[index] = { url: nextUrl, state };
    },
    go(delta = 0) {
      const nextIndex = Math.max(0, Math.min(entries.length - 1, index + Number(delta)));
      if (nextIndex === index) return;
      index = nextIndex;
      dispatch({ type: 'popstate', state: current().state });
    },
    back() { this.go(-1); },
    forward() { this.go(1); },
    get state() { return current().state; },
    get length() { return entries.length; },
    get calls() { return calls; },
    get entries() { return entries.map(({ url, state }) => ({ href: url.href, state })); }
  };
  const windowRef = {
    location,
    history,
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    removeEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      listeners.set(name, callbacks.filter((currentCallback) => currentCallback !== callback));
    },
    dispatchEvent: dispatch
  };
  windowRef.window = windowRef;
  return { window: windowRef, location, history, calls };
}

function createPage({
  locale = 'en', data = snapshot(), fetchError, responseOk = true, jsonError,
  includeViews = true, includeSearch = true, includeCatalog = false, includeStats = true, fetchGate, url
} = {}) {
  const section = new SemanticElement({
    dataset: {
      statsSource: '/content-stats/v1/current.json',
      statsLocale: locale,
      statsUnavailable: unavailableCopy[locale].articles
    },
    attributes: { id: 'content-stats' }
  });
  const overviewValues = Object.fromEntries(overviewKinds.map((kind) => [kind, section.appendChild(new SemanticElement({
    dataset: { statsOverviewValue: kind },
    textContent: loadingCopy[locale][kind]
  }))]));
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
  const catalog = includeCatalog ? makeArticleCatalog(locale) : null;
  const fetchCalls = [];
  const browser = createBrowser(url ?? 'https://guilleojeda.com/');
  const langToggle = new SemanticElement({
    tagName: 'a',
    attributes: {
      class: 'lang-toggle',
      href: includeCatalog
        ? (locale === 'es' ? '/articles/' : '/es/articles/')
        : (locale === 'es' ? '/' : '/es/')
    }
  });
  const documentRef = {
    activeElement: null,
    get baseURI() { return browser.location.href; },
    getElementById: (id) => id === 'content-stats' && includeStats ? section : id === 'article-catalog' ? catalog?.root ?? null : null,
    querySelector: (selector) => selector === '.lang-toggle' ? langToggle : null,
    querySelectorAll: (selector) => selector === '.lang-toggle' ? [langToggle] : [],
    createElement: (tagName) => new SemanticElement({ tagName, documentRef }),
    createDocumentFragment: () => new SemanticElement({ tagName: '#document-fragment', documentRef })
  };
  langToggle.ownerDocument = documentRef;

  if (catalog) {
    for (const element of [catalog.root, ...catalog.root.descendants()]) element.ownerDocument = documentRef;
  }

  const context = {
    document: documentRef,
    window: browser.window,
    location: browser.location,
    history: browser.history,
    URL,
    URLSearchParams,
    addEventListener: browser.window.addEventListener.bind(browser.window),
    removeEventListener: browser.window.removeEventListener.bind(browser.window),
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      if (fetchError) throw fetchError;
      if (fetchGate) await fetchGate;
      return {
        ok: responseOk,
        json: async () => {
          if (jsonError) throw jsonError;
          return data;
        }
      };
    }
  };

  vm.runInNewContext(clientSource, context, { filename: 'src/scripts/content-stats.js' });

  return {
    cards,
    overviewValues,
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
    catalog,
    langToggle,
    document: documentRef,
    window: browser.window,
    location: browser.location,
    history: browser.history,
    historyCalls: browser.calls,
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

const articleDestination = {
  caylent: (slug) => `https://caylent.com/blog/${slug}`,
  'builder-center': (slug) => `https://builder.aws.com/content/guille/${slug}`,
  'simple-aws': (slug) => `https://newsletter.simpleaws.dev/p/${slug}`,
  'cloudy-things': (slug) => `https://blog.guilleojeda.com/${slug}`,
  'donde-aprendo-aws': (slug) => `https://dondeaprendoaws.com/blog/${slug}`,
  'aws-for-engineers': (slug) => `https://awsforengineers.com/blog/${slug}`,
  'dev-community': (slug) => `https://dev.to/guille/${slug}`,
  'linkedin-articles': (slug) => `https://www.linkedin.com/pulse/${slug}`,
  spainclouds: (slug) => `https://spainclouds.com/blog/${slug}`,
  hackernoon: (slug) => `https://hackernoon.com/${slug}`
};

const articleSourceCoverage = [...automaticArticleSources, ...individualArticleSources];
const articleCatalogCollectedAt = '2026-10-27T18:55:58.115Z';

function catalogPublication({ sourceId = 'dev-community', title, publishedAt = '2024-01-01', url, emailOnly = false, ...extra } = {}) {
  const slug = String(title ?? 'fixture-article').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    sourceId,
    title: title ?? 'Fixture article',
    publishedAt,
    url: url === undefined ? articleDestination[sourceId]?.(slug || 'article') ?? null : url,
    emailOnly,
    ...extra
  };
}

function catalogRecord(index, {
  id = index.toString(16).padStart(64, '0'),
  title = `Article ${String(index).padStart(2, '0')}`,
  language = index % 2 === 0 ? 'en' : 'es',
  publishedAt = '2024-01-01',
  publications,
  ...extra
} = {}) {
  return {
    id,
    title,
    language,
    publishedAt,
    publications: publications ?? [catalogPublication({ title, publishedAt })],
    ...extra
  };
}

function catalogCounts(records) {
  const counts = { all: records.length, en: 0, es: 0 };
  for (const record of records) counts[record.language] += 1;
  return counts;
}

function articleCatalogSnapshot({ records = [], sources = articleSourceCoverage, collectedAt = articleCatalogCollectedAt, counts = catalogCounts(records) } = {}) {
  const data = snapshotWithDirectoryOutboundClicks();
  data.groups.talks = aggregateGroup({ sources: [websiteInventory], counts: { all: 6, en: 2, es: 4 }, collectedAt: talksCollectedAt });
  data.groups.books = aggregateGroup({ sources: [websiteInventory], counts: { all: 3, en: 2, es: 1 }, collectedAt: booksCollectedAt });
  data.groups.articles = {
    ...aggregateGroup({ counts, sources: sources.map((source) => ({ ...source })), collectedAt, scopeId: 'a'.repeat(64) }),
    definitionVersion: 2,
    records
  };
  return data;
}

function catalogSearchRecords() {
  return [
    catalogRecord(1201, {
      title: 'Café agent guide', language: 'en', publishedAt: '2024-05-01',
      publications: [
        catalogPublication({ sourceId: 'caylent', title: 'Café agent guide', publishedAt: '2024-05-01' }),
        catalogPublication({ sourceId: 'dev-community', title: 'Café agent guide', publishedAt: '2024-05-01', url: 'https://dev.to/guille/url-secret-token' })
      ]
    }),
    catalogRecord(1202, {
      title: 'Cafe agent patterns', language: 'en', publishedAt: '2024-04-01',
      publications: [catalogPublication({ sourceId: 'linkedin-articles', title: 'Cafe agent patterns', publishedAt: '2024-04-01' })]
    }),
    catalogRecord(1203, {
      title: 'Café para agentes', language: 'es', publishedAt: '2024-03-01',
      publications: [catalogPublication({ sourceId: 'spainclouds', title: 'Café para agentes', publishedAt: '2024-03-01' })]
    }),
    catalogRecord(1204, {
      title: 'Literal [C++] reference', language: 'en', publishedAt: '2024-02-01',
      publications: [catalogPublication({ sourceId: 'hackernoon', title: 'Literal [C++] reference', publishedAt: '2024-02-01' })]
    }),
    catalogRecord(1205, {
      title: 'Another AWS article', language: 'en', publishedAt: '2024-01-01',
      publications: [catalogPublication({ sourceId: 'caylent', title: 'Another AWS article', publishedAt: '2024-01-01' })]
    }),
    catalogRecord(1206, {
      title: '<img src=x onerror=alert(1)> sample', language: 'en', publishedAt: '2023-12-01',
      publications: [catalogPublication({ sourceId: 'simple-aws', title: '<img src=x onerror=alert(1)> sample', publishedAt: '2023-12-01', url: null, emailOnly: true })]
    })
  ];
}

function catalogSortRecords() {
  const earlierFraction = '2024-03-01T00:00:00.1234Z';
  const laterFraction = '2024-03-01T00:00:00.12345Z';
  return {
    alphaEn: catalogRecord(1102, {
      title: 'Alpha', language: 'en', publishedAt: earlierFraction,
      publications: [catalogPublication({ sourceId: 'caylent', title: 'Alpha', publishedAt: earlierFraction })]
    }),
    alphaEs: catalogRecord(1105, {
      title: 'Alpha', language: 'es', publishedAt: '2024-03-01T01:00:00.12345+01:00',
      publications: [catalogPublication({ sourceId: 'cloudy-things', title: 'Alpha', publishedAt: '2024-03-01T01:00:00.12345+01:00' })]
    }),
    accentedAlpha: catalogRecord(1103, {
      title: 'Álpha', language: 'en', publishedAt: laterFraction,
      publications: [catalogPublication({ sourceId: 'builder-center', title: 'Álpha', publishedAt: laterFraction })]
    }),
    beta: catalogRecord(1104, {
      title: 'Beta', language: 'en', publishedAt: '2024-02-01',
      publications: [
        catalogPublication({ sourceId: 'caylent', title: 'Beta', publishedAt: '2024-02-01' }),
        catalogPublication({ sourceId: 'builder-center', title: 'Beta', publishedAt: '2024-02-01' })
      ]
    }),
    betaEs: catalogRecord(1111, {
      title: 'Beta', language: 'es', publishedAt: '2024-02-01',
      publications: [catalogPublication({ sourceId: 'simple-aws', title: 'Beta', publishedAt: '2024-02-01', url: null, emailOnly: true })]
    }),
    cafe: catalogRecord(1106, {
      title: 'Cafe', language: 'en', publishedAt: '2024-01-01',
      publications: [catalogPublication({ sourceId: 'linkedin-articles', title: 'Cafe', publishedAt: '2024-01-01' })]
    }),
    cafeAccent: catalogRecord(1107, {
      title: 'Café', language: 'en', publishedAt: '2024-01-01',
      publications: [catalogPublication({ sourceId: 'simple-aws', title: 'Café', publishedAt: '2024-01-01', url: null, emailOnly: true })]
    }),
    delta: catalogRecord(1108, {
      title: 'Delta', language: 'en', publishedAt: '2024-02-15',
      publications: [catalogPublication({ sourceId: 'dev-community', title: 'Delta', publishedAt: '2024-02-15' })]
    }),
    echo: catalogRecord(1109, {
      title: 'Echo', language: 'en', publishedAt: null,
      publications: [catalogPublication({ sourceId: 'hackernoon', title: 'Echo', publishedAt: null })]
    }),
    zulu: catalogRecord(1110, {
      title: 'Zulu', language: 'es', publishedAt: null,
      publications: [catalogPublication({ sourceId: 'simple-aws', title: 'Zulu', publishedAt: null, url: null, emailOnly: true })]
    })
  };
}

function setCatalogQuery(page, value) {
  page.catalog.query.value = value;
  const caret = Math.floor(value.length / 2);
  page.catalog.query.setSelectionRange(caret, caret);
  page.catalog.query.focus();
  page.catalog.query.dispatch('input');
  return { selectionStart: caret, selectionEnd: caret };
}

function mutateArticleCatalog(data, mutate) {
  mutate(data.groups.articles);
  return data;
}

function catalogRows(page) {
  return page.catalog.list.children;
}

function assertCatalogUnavailable(page) {
  assert.equal(page.catalog.results.hidden, true, 'unavailable catalog must hide any old rows');
  assert.equal(page.catalog.list.children.length, 0, 'unavailable catalog must clear rows');
  assert.equal(page.catalog.status.hidden, false, 'unavailable state stays visible');
  assert.notEqual(page.catalog.status.textContent, '', 'unavailable state is explained');
  assert.doesNotMatch(page.catalog.status.textContent, /^(?:loading articles|cargando artículos)/i, 'an unavailable catalog must not remain stuck in loading');
}

function catalogRecordIds(page) {
  return catalogRows(page).map((row) => row.dataset.catalogRecord);
}

function semanticText(element) {
  return [element.textContent, ...element.children.map(semanticText)].filter(Boolean).join(' ');
}

function accessibleText(element) {
  return [element.getAttribute('aria-label') ?? '', element.textContent, ...element.children.map(accessibleText)].filter(Boolean).join(' ');
}

function catalogDisplayRecords() {
  return [
    catalogRecord(1, {
      title: 'Café Guide', language: 'en', publishedAt: '2023-01-01',
      publications: [
        catalogPublication({ sourceId: 'caylent', title: 'Café Guide', publishedAt: '2024-05-01', url: articleDestination.caylent('cafe-guide') }),
        catalogPublication({ sourceId: 'dev-community', title: '  café   guide ', publishedAt: '2023-01-01', url: articleDestination['dev-community']('cafe-guide') })
      ]
    }),
    catalogRecord(2, { title: 'Guía de AWS', language: 'es', publishedAt: '2024-10-05' }),
    catalogRecord(3, {
      title: 'Builder date unknown', language: 'en', publishedAt: null,
      publications: [catalogPublication({ sourceId: 'builder-center', title: 'Builder date unknown', publishedAt: null })]
    }),
    catalogRecord(4, {
      title: 'Offset timestamp', language: 'en', publishedAt: '2024-02-03T23:30:00.123456-05:00',
      publications: [catalogPublication({ sourceId: 'caylent', title: 'Offset timestamp', publishedAt: '2024-02-03T23:30:00.123456-05:00' })]
    }),
    catalogRecord(5, { title: '<img src=x onerror=alert(1)>', language: 'en', publishedAt: '2024-05-20' }),
    catalogRecord(6, {
      title: 'Email only article', language: 'es', publishedAt: '2024-04-10',
      publications: [catalogPublication({ sourceId: 'simple-aws', title: 'Email only article', publishedAt: '2024-04-10', url: null, emailOnly: true })]
    }),
    catalogRecord(7, {
      title: 'Web link unavailable', language: 'es', publishedAt: '2024-04-11',
      publications: [catalogPublication({ sourceId: 'simple-aws', title: 'Web link unavailable', publishedAt: '2024-04-11', url: null, emailOnly: false })]
    }),
    catalogRecord(8, { title: 'Cafe Guide', language: 'en', publishedAt: '2024-04-01' }),
    catalogRecord(9, { title: 'Café Guide!', language: 'en', publishedAt: '2024-03-01' }),
    catalogRecord(10, { title: 'Café Guide', language: 'es', publishedAt: '2024-02-01' })
  ];
}

function pagedCatalogRecords(count = 61) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
    const title = index < 2 ? 'Shared Guide' : `Catalog article ${String(index).padStart(2, '0')}`;
    const publications = index === 0
      ? [
        catalogPublication({ sourceId: 'caylent', title, publishedAt: date }),
        catalogPublication({ sourceId: 'dev-community', title, publishedAt: date })
      ]
      : undefined;
    return catalogRecord(index + 100, {
      title,
      language: index % 2 === 0 ? 'en' : 'es',
      publishedAt: date,
      publications
    });
  });
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

function assertOverviewCount(page, locale, kind, count) {
  assert.equal(page.overviewValues[kind].textContent, new Intl.NumberFormat(locale).format(count),
    `${kind} overview shows the all-language snapshot count`);
}

function assertOverviewUnavailable(page, locale, kind) {
  const text = page.overviewValues[kind].textContent.trim();
  assert.notEqual(text, '', `${kind} overview exposes an unavailable state`);
  assert.doesNotMatch(text, /^\d/, `${kind} overview does not leave a numeric value when unavailable`);
  if (locale === 'es') assert.match(text, /no disponible|no se pueden|no se pudo|no fue posible/i,
    `${kind} overview has a localized unavailable message`);
  else assert.match(text, /unavailable|not available|unable to load|could not load|couldn't load/i,
    `${kind} overview has a localized unavailable message`);
}

function assertOverviewLoading(page, locale, kind) {
  assert.match(page.overviewValues[kind].textContent, locale === 'es' ? /cargando/i : /loading/i,
    `${kind} overview announces loading before the snapshot resolves`);
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

function assertActivityUnavailableMessage(text, locale) {
  assert.match(text, locale === 'es'
    ? /no.*disponible|no\s+se\s+pueden|(?:s[oó]lo|[uú]nicamente).{0,90}ingl[eé]s|no\s+(?:ofrece|admite|soporta|permite).{0,60}total\s+registrado/i
    : /unavailable|not available|(?:only|exclusively).{0,90}English|(?:does\s+not|doesn't)\s+(?:offer|support|provide|admit).{0,60}recorded\s+total/i,
  'unavailable data has a localized data, language or recorded-total explanation');
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
  assertActivityUnavailableMessage(metric.status.textContent, locale);
}

function assertNewsletterEmailVisible(page, locale, spec, period) {
  const record = page.data.groups[spec.group].records[period];
  const metric = page.cards.newsletter[spec.region];
  assert.equal(metric.region.hidden, false, `${spec.group}: supported English email data is visible for All/English`);
  assert.equal(metric.results.hidden, false, `${period} ${spec.group} renders its own result`);
  assert.equal(metric.status.hidden, true, `${spec.group}: successful data clears the loading or unavailable status`);
  assert.equal(metric.value.textContent, new Intl.NumberFormat(locale).format(record[spec.metric]), `${spec.group}: value comes from the selected period`);
  assert.match(metric.label.textContent, spec.label[locale], `${spec.group}: heading names the metric in the interface language`);
  assert.match(metric.unit.textContent, spec.unit[locale], `${spec.group}: unit stays concise`);
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
  assertActivityUnavailableMessage(views.status.textContent, locale);
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
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimad[oa] a partir de una muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google puede omitir parte de los datos/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /puede faltar parte de la actividad/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimated from a sample/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google may withhold some data/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /some activity may be missing/i);
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
  assert.match(sent.label.textContent, locale === 'en' ? /emails sent.*cumulative total/i : /emails enviados.*total acumulado/i);
  assert.equal(sent.coverage.textContent, 'Simple AWS');
  assert.equal(sent.collectedDate.textContent, expectedDate(locale, collectedAt));
}

function assertBuilderViewsUnavailable(page, locale, { hidden = false } = {}) {
  const builder = page.cards.articles.builderViews;
  assert.equal(builder.region.hidden, hidden, 'Builder Center availability follows only its own content-language selection');
  assert.equal(builder.result.hidden, true, 'unavailable Builder Center results stay hidden');
  for (const [name, field] of Object.entries({ value: builder.value, coverage: builder.coverage, since: builder.since, collectedDate: builder.collectedDate, provenance: builder.provenance })) {
    assert.equal(field.textContent, '', `unavailable Builder Center views clear ${name}`);
  }
  assert.equal(builder.status.hidden, hidden, 'Builder Center status follows row visibility');
  if (hidden) {
    assert.equal(builder.status.textContent, '', 'a hidden Builder Center row clears its status');
  } else if (locale === 'en') {
    assert.match(builder.status.textContent, /unavailable|not available/i, 'English unavailable copy is clear');
  } else {
    assert.match(builder.status.textContent, /no disponible|no disponibles|no est[aá]n disponibles|no se pueden/i, 'Spanish unavailable copy is clear');
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
  assertActivityUnavailableMessage(search.status.textContent, locale);
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
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimad[oa] a partir de una muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google puede omitir parte de los datos/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /puede faltar parte de la actividad/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimated from a sample/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google may withhold some data/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /some activity may be missing/i);
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
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimad[oa] a partir de una muestra/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google puede omitir parte de los datos/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /puede faltar parte de la actividad/i);
  } else {
    if (record.qualifications.includes('sampled')) assert.match(qualificationText, /estimated from a sample/i);
    if (record.qualifications.includes('thresholding')) assert.match(qualificationText, /google may withhold some data/i);
    if (record.qualifications.includes('other-row')) assert.match(qualificationText, /some activity may be missing/i);
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

  test(`${locale} Dónde Aprendo AWS coverage renders its actual cumulative counts in All, English, and Español`, async () => {
    const data = snapshotWithArticleSearchClicks();
    const collectedAt = '2026-10-26T12:34:56.000Z';
    data.groups.articles.sources = [caylent, builderCenter, simpleAws, cloudyThings, dondeAprendoAws];
    data.groups.articles.counts = { all: 209, en: 13, es: 196 };
    data.groups.articles.collectedAt = collectedAt;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.articles.results.hidden, false, 'the supported aggregate renders');
    assert.equal(page.cards.articles.status.hidden, true);
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(209), 'All shows the published total');
    assert.match(page.cards.articles.coverage.textContent, /Dónde Aprendo AWS/, 'source coverage names the new Spanish publication');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt), 'the collection date remains truthful');

    for (const [language, expected] of [['en', 13], ['es', 196], ['all', 209]]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(expected), `${language} uses its own cumulative count`);
      assert.match(page.cards.articles.coverage.textContent, /Dónde Aprendo AWS/, `${language} retains actual source coverage`);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt), `${language} retains the aggregate collection date`);
      assert.equal(page.fetchCount, 1, `${language} filtering reuses the snapshot`);
    }
  });

  test(`${locale} AWS for Engineers coverage renders in All, English, and Español while activity filters stay local`, async () => {
    const data = snapshotWithArticleSearchClicks();
    const collectedAt = '2026-10-26T14:15:16.000Z';
    data.groups.articles.sources = [caylent, builderCenter, simpleAws, cloudyThings, dondeAprendoAws, awsForEngineers];
    data.groups.articles.counts = { all: 17, en: 12, es: 5 };
    data.groups.articles.collectedAt = collectedAt;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.articles.results.hidden, false, 'the six-source aggregate is recognized by the public client');
    assert.equal(page.cards.articles.status.hidden, true);
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(17));
    assert.match(page.cards.articles.coverage.textContent, /AWS for Engineers/, 'All names the new English source');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));

    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    for (const [language, expected] of [['en', 12], ['es', 5], ['all', 17]]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(expected),
        `${language} keeps its cumulative count when the activity period changes`);
      assert.match(page.cards.articles.coverage.textContent, /AWS for Engineers/, `${language} retains selected source coverage`);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt),
        `${language} retains the aggregate collection date`);
      assert.equal(page.periodSelector.value, '30d');
      assert.equal(page.fetchCount, 1, 'language and activity changes reuse the single aggregate request');
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

  test(`${locale} selected individual articles use the count-only schema and filter beside unchanged metrics`, async () => {
    const collectedAt = '2026-10-26T16:00:00.000Z';
    const data = snapshotWithIndividualArticleSources({ collectedAt });
    const expectedCoverage = [...automaticArticleSources, ...individualArticleSources]
      .map((source) => source.label)
      .join(', ');
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(data.schemaVersion, 1, 'individual coverage keeps the public root schema at version 1');
    assert.deepEqual(Object.keys(data.groups.articles).sort(),
      ['basis', 'collectedAt', 'counts', 'definitionVersion', 'scopeId', 'sources'].sort(),
      'Articles remains a counts-only group with its existing exact keys');
    assert.equal(data.groups.articles.definitionVersion, 1);
    assert.deepEqual(data.groups.articles.counts, { all: 618, en: 398, es: 220 });
    assert.equal(page.cards.articles.results.hidden, false);
    assert.equal(page.cards.articles.status.hidden, true);
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(618));
    assert.equal(page.cards.articles.coverage.textContent, expectedCoverage, 'All preserves exact automatic and individually selected source coverage');
    assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
    assertOverviewCount(page, locale, 'articles', 618);

    assert.equal(page.cards.talks.count.textContent, '6');
    assertCuratedCoverage(page, 'talks', locale);
    assert.equal(page.cards.talks.collectedDate.textContent, expectedDate(locale, talksCollectedAt));
    assert.equal(page.cards.books.count.textContent, '3');
    assertCuratedCoverage(page, 'books', locale);
    assert.equal(page.cards.books.collectedDate.textContent, expectedDate(locale, booksCollectedAt));
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assert.equal(page.cards.newsletter.coverage.textContent, simpleAws.label);
    assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
    assertViewsVisible(page, locale, '12m');
    assertSearchVisible(page, locale, '12m');

    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '30d');
    assertSearchVisible(page, locale, '30d');
    for (const [language, expected] of [
      ['all', { articles: 618, talks: 6, books: 3 }],
      ['en', { articles: 398, talks: 2, books: 2 }],
      ['es', { articles: 220, talks: 4, books: 1 }]
    ]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(expected.articles));
      assert.equal(page.cards.articles.coverage.textContent, expectedCoverage);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
      assert.equal(page.cards.talks.count.textContent, String(expected.talks));
      assert.equal(page.cards.talks.collectedDate.textContent, expectedDate(locale, talksCollectedAt));
      assert.equal(page.cards.books.count.textContent, String(expected.books));
      assert.equal(page.cards.books.collectedDate.textContent, expectedDate(locale, booksCollectedAt));
      assertOverviewCount(page, locale, 'articles', 618);
      if (language === 'es') {
        assertViewsUnavailable(page, locale);
        assertSearchUnavailable(page, locale);
        assert.equal(page.cards.newsletter.card.hidden, true);
      } else {
        assertViewsVisible(page, locale, '30d');
        assertSearchVisible(page, locale, '30d');
        assert.equal(page.cards.newsletter.count.textContent, '27');
        assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
      }
    }
    assert.equal(page.periodSelector.value, '30d', 'the cumulative count does not reset the activity period');
    assert.equal(page.fetchCount, 1, 'period and language changes reuse the single snapshot request');
    assert.equal(page.location.href, 'https://guilleojeda.com/', 'local filters do not navigate');
  });

  for (const [description, sources, automaticSources = automaticArticleSources] of [
    ...individualArticleSources.map((source) => [`single ${source.label} selection`, [source]]),
    ['a partial DEV Community and HackerNoon selection', [devCommunity, hackerNoon]],
    ['individual articles beside only Caylent and Builder', [devCommunity], [caylent, builderCenter]]
  ]) {
    test(`${locale} accepts ${description} in All with exact source labels`, async () => {
      const collectedAt = '2026-10-26T16:00:00.000Z';
      const data = snapshotWithIndividualArticleSources({ sources, automaticSources, collectedAt });
      const page = createPage({ locale, data });
      await page.settle();

      const expectedCoverage = [...automaticSources, ...sources].map((source) => source.label).join(', ');
      assert.equal(page.selector.value, 'all');
      assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(618));
      assert.equal(page.cards.articles.coverage.textContent, expectedCoverage);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
      assert.equal(page.fetchCount, 1);
    });
  }

  test(`${locale} an individual-source snapshot preserves a measured zero for all content languages`, async () => {
    const collectedAt = '2026-10-26T16:00:00.000Z';
    const data = snapshotWithIndividualArticleSources({
      sources: [linkedinArticles, spainClouds],
      counts: { all: 0, en: 0, es: 0 },
      collectedAt
    });
    const page = createPage({ locale, data });
    await page.settle();

    const expectedCoverage = [...automaticArticleSources, linkedinArticles, spainClouds]
      .map((source) => source.label)
      .join(', ');
    for (const language of ['all', 'en', 'es']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.results.hidden, false);
      assert.equal(page.cards.articles.status.hidden, true);
      assert.equal(page.cards.articles.count.textContent, '0');
      assert.equal(page.cards.articles.coverage.textContent, expectedCoverage);
      assert.equal(page.cards.articles.collectedDate.textContent, expectedDate(locale, collectedAt));
      assertOverviewCount(page, locale, 'articles', 0);
    }
    assert.equal(page.fetchCount, 1);
  });

  for (const [description, sources] of [
    ['unknown platform', [...automaticArticleSources, { id: 'unknown-platform', label: 'Unknown Platform' }]],
    ['duplicate individual platform', [...automaticArticleSources, devCommunity, { ...devCommunity }]],
    ['misordered individual platforms', [...automaticArticleSources, linkedinArticles, devCommunity]],
    ['wrong individual platform label', [...automaticArticleSources, { ...devCommunity, label: 'DEV' }]],
    ['excluded Medium platform', [...automaticArticleSources, { id: 'medium', label: 'Medium' }]]
  ]) {
    test(`${locale} invalid individual article coverage (${description}) invalidates only Articles`, async () => {
      const collectedAt = '2026-10-26T16:00:00.000Z';
      const data = snapshotWithArticleSearchClicks();
      data.groups.articles.sources = sources;
      data.groups.articles.collectedAt = collectedAt;
      const page = createPage({ locale, data });
      await page.settle();

      assertUnavailable(page, locale, 'articles');
      assertOverviewUnavailable(page, locale, 'articles');
      assert.equal(page.cards.talks.count.textContent, '6');
      assert.equal(page.cards.talks.collectedDate.textContent, expectedDate(locale, talksCollectedAt));
      assert.equal(page.cards.books.count.textContent, '3');
      assert.equal(page.cards.books.collectedDate.textContent, expectedDate(locale, booksCollectedAt));
      assert.equal(page.cards.newsletter.count.textContent, '27');
      assert.equal(page.cards.newsletter.collectedDate.textContent, expectedDate(locale, newsletterCollectedAt));
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');

      page.selector.value = 'en';
      page.selector.dispatch('change');
      assertUnavailable(page, locale, 'articles');
      assertViewsVisible(page, locale, '12m');
      assertSearchVisible(page, locale, '12m');
      assert.equal(page.fetchCount, 1, `${description} stays isolated and does not refetch`);
    });
  }

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

  test(`${locale} overview values use All content languages and stay fixed while detail filters change`, async () => {
    const data = overviewSnapshot();
    const page = createPage({ locale, data });
    const allLanguageValues = {
      articles: data.groups.articles.counts.all,
      talks: data.groups.talks.counts.all,
      books: data.groups.books.counts.all,
      newsletter: data.groups.newsletter.subscribers
    };
    await page.settle();

    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, allLanguageValues[kind]);
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(data.groups.articles.counts.all),
      'the detailed count initially uses All');
    assert.equal(page.cards.articles.views.value.textContent, new Intl.NumberFormat(locale).format(data.groups.articleViews.records['12m'].views),
      'the detailed activity starts at twelve months');

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(data.groups.articles.counts.en));
    assert.equal(page.cards.talks.count.textContent, new Intl.NumberFormat(locale).format(data.groups.talks.counts.en));
    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, allLanguageValues[kind]);
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '7d');
    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, allLanguageValues[kind]);
    page.periodSelector.value = '30d';
    page.periodSelector.dispatch('change');
    assertViewsVisible(page, locale, '30d');
    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, allLanguageValues[kind]);

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, new Intl.NumberFormat(locale).format(data.groups.articles.counts.es));
    assert.equal(page.cards.talks.count.textContent, new Intl.NumberFormat(locale).format(data.groups.talks.counts.es));
    assert.equal(page.cards.newsletter.card.hidden, true, 'the English newsletter detail is hidden for Spanish content');
    assertViewsUnavailable(page, locale);
    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, allLanguageValues[kind]);

    assert.equal(page.fetchCount, 1, 'overview and detail filter changes reuse the one page-load snapshot');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json']);
  });

  test(`${locale} overview displays a valid zero independently for every headline group`, async () => {
    const data = overviewSnapshot();
    data.groups.articles.counts = { all: 0, en: 0, es: 0 };
    data.groups.talks.counts = { all: 0, en: 0, es: 0 };
    data.groups.books.counts = { all: 0, en: 0, es: 0 };
    data.groups.newsletter.subscribers = 0;
    const page = createPage({ locale, data });
    await page.settle();

    for (const kind of overviewKinds) assertOverviewCount(page, locale, kind, 0);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} overview group failures stay local while healthy headline values remain usable`, async () => {
    const faults = [
      ['missing articles', 'articles', (data) => { delete data.groups.articles; }],
      ['invalid articles', 'articles', (data) => { data.groups.articles.counts.all += 1; }],
      ['missing talks', 'talks', (data) => { delete data.groups.talks; }],
      ['invalid talks', 'talks', (data) => { data.groups.talks.definitionVersion = 2; }],
      ['missing books', 'books', (data) => { delete data.groups.books; }],
      ['invalid books', 'books', (data) => { data.groups.books.sources = [caylent]; }],
      ['missing newsletter', 'newsletter', (data) => { delete data.groups.newsletter; }],
      ['invalid newsletter', 'newsletter', (data) => { data.groups.newsletter.subscribers = -1; }]
    ];

    for (const [description, invalidKind, corrupt] of faults) {
      const data = overviewSnapshot();
      corrupt(data);
      const page = createPage({ locale, data });
      await page.settle();

      for (const kind of overviewKinds) {
        if (kind === invalidKind) {
          assertOverviewUnavailable(page, locale, kind);
          continue;
        }
        const expected = kind === 'newsletter'
          ? data.groups.newsletter.subscribers
          : data.groups[kind].counts.all;
        assertOverviewCount(page, locale, kind, expected);
      }
      assert.equal(page.fetchCount, 1, `${description} does not trigger another snapshot request`);
    }
  });

  test(`${locale} overview replaces loading with unavailable states after snapshot failures`, async () => {
    const failures = [
      ['network failure', { fetchError: new Error('synthetic snapshot failure') }],
      ['HTTP failure', { responseOk: false }],
      ['JSON parse failure', { jsonError: new SyntaxError('synthetic invalid JSON') }],
      ['invalid root schema', { data: { schemaVersion: 2, groups: {} } }]
    ];

    for (const [description, options] of failures) {
      const page = createPage({ locale, ...options });
      for (const kind of overviewKinds) assertOverviewLoading(page, locale, kind);
      await page.settle();
      for (const kind of overviewKinds) assertOverviewUnavailable(page, locale, kind);
      assert.equal(page.fetchCount, 1, `${description} settles without retries or polling`);
    }
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
  ['manual definition with legacy automatic fields', (group) => { group.definitionVersion = 2; }],
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
    assertViewsVisible(page, locale, 'ytd');
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

// The manual observation date belongs to this metric, independently of a daily
// collector run or the dates of counts and other traffic measures.
function assertManualBuilderViews(page, locale, language, group) {
  const builder = page.cards.articles.builderViews;
  assert.equal(builder.region.hidden, false);
  assert.equal(builder.result.hidden, false, 'a valid manual observation is available');
  assert.equal(builder.status.hidden, true);
  assert.equal(builder.status.textContent, '');
  assert.equal(builder.value.textContent, new Intl.NumberFormat(locale).format(group.views[language]));
  assert.equal(builder.coverage.textContent, 'AWS Builder Center');
  assert.equal(builder.since.textContent, expectedDateOnly(locale, '2026-01-06'));
  assert.equal(builder.collectedDate.textContent, expectedDate(locale, group.observedAt), 'show the actual observation date, not the collector date');
  assert.match(builder.provenance.textContent, /manual/i, 'the visible metadata identifies manual maintenance');
  assert.equal(builder.provenance.hidden, false);
}

for (const locale of ['en', 'es']) {
  test(`${locale} manual Builder views preserve observation and provenance through language and period changes`, async () => {
    const group = manualBuilderArticleViewsGroup();
    const page = createPage({ locale, data: snapshotWithBuilderArticleViews({ group }) });
    const builder = page.cards.articles.builderViews;
    assert.equal(builder.result.hidden, true);
    assert.equal(builder.value.textContent, '');
    assert.equal(builder.provenance.textContent, '');
    await page.settle();

    for (const language of ['all', 'en', 'es', 'all']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.cards.articles.count.textContent, { all: '11', en: '7', es: '4' }[language]);
      for (const period of language === 'es' ? articleSearchPeriods : articleViewPeriods) {
        page.periodSelector.value = period;
        page.periodSelector.dispatch('change');
        assert.equal(page.periodSelector.value, period, 'manual views do not reset an applicable activity period');
        assertManualBuilderViews(page, locale, language, group);
        if (language === 'es') assertViewsUnavailable(page, locale);
        else assertViewsVisible(page, locale, period);
      }
    }
    assert.equal(page.fetchCount, 1, 'manual views reuse the same fetched snapshot');
  });

  test(`${locale} manual Builder zero works without counts or analytics and never enables Recorded total`, async () => {
    const group = manualBuilderArticleViewsGroup({ views: { all: 0, en: 0, es: 0 } });
    const page = createPage({ locale, data: { schemaVersion: 1, groups: { builderArticleViews: group } } });
    await page.settle();
    for (const language of ['all', 'en', 'es']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assertManualBuilderViews(page, locale, language, group);
      assert.equal(page.periodOptions.total.disabled, true, 'a fixed Builder row cannot supply an activity-period total');
      assert.equal(page.periodSelector.value, '12m');
    }
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} the retained October 21 Builder observation stays explicitly automatic`, async () => {
    const group = builderArticleViewsGroup({
      views: { all: 2624, en: 242, es: 2382 },
      collectedAt: '2026-10-21T20:23:53.969Z',
      scopeId: '3da7c7cd74258140ea982b74dd053ca7202f04c22ad8986c81e581052572e389'
    });
    const page = createPage({ locale, data: snapshotWithBuilderArticleViews({ group }) });
    await page.settle();
    for (const language of ['all', 'en', 'es']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assertBuilderViewsVisible(page, locale, language, group);
      assert.match(page.cards.articles.builderViews.provenance.textContent, locale === 'en' ? /automatic/i : /autom.tic/i);
      assert.doesNotMatch(page.cards.articles.builderViews.provenance.textContent, /manual/i, 'the old automatic result must never be relabeled manual');
    }
  });

  test(`${locale} manual Builder corrections replace the visible observation rather than appearing as daily refreshes`, async () => {
    const initial = manualBuilderArticleViewsGroup();
    const corrected = manualBuilderArticleViewsGroup({
      views: { all: 69, en: 24, es: 45 },
      observedAt: '2026-10-23T18:00:00.000Z',
      scopeId: initial.scopeId
    });
    const before = createPage({ locale, data: snapshotWithBuilderArticleViews({ group: initial }) });
    const repeated = createPage({ locale, data: snapshotWithBuilderArticleViews({ group: structuredClone(initial) }) });
    const after = createPage({ locale, data: snapshotWithBuilderArticleViews({ group: corrected }) });
    await Promise.all([before.settle(), repeated.settle(), after.settle()]);
    assertManualBuilderViews(before, locale, 'all', initial);
    assertManualBuilderViews(repeated, locale, 'all', initial);
    assertManualBuilderViews(after, locale, 'all', corrected);
    assert.equal(before.cards.articles.builderViews.collectedDate.textContent, repeated.cards.articles.builderViews.collectedDate.textContent);
    assert.notEqual(before.cards.articles.builderViews.collectedDate.textContent, after.cards.articles.builderViews.collectedDate.textContent);
  });
}

const invalidManualBuilderGroups = [
  ['unsupported definition version', (group) => { group.definitionVersion = 3; }],
  ['wrong basis', (group) => { group.basis = 'period'; }],
  ['automatic provenance on the manual definition', (group) => { group.provenance = 'automatic'; }],
  ['missing provenance', (group) => { delete group.provenance; }],
  ['missing observation date', (group) => { delete group.observedAt; }],
  ['impossible observation date', (group) => { group.observedAt = '2026-02-30T17:30:00.000Z'; }],
  ['noncanonical observation date', (group) => { group.observedAt = '2026-10-22T17:30:00Z'; }],
  ['observation before the tracking boundary', (group) => { group.observedAt = '2026-01-05T23:59:59.999Z'; }],
  ['collector date substituted for observation', (group) => { delete group.observedAt; group.collectedAt = '2026-10-23T00:00:00.000Z'; }],
  ['additional collector timestamp', (group) => { group.collectedAt = '2026-10-23T00:00:00.000Z'; }],
  ['wrong source', (group) => { group.source.id = 'simple-aws'; }],
  ['malformed scope', (group) => { group.scopeId = 'manual'; }],
  ['mismatched All total', (group) => { group.views.all += 1; }],
  ['negative language value', (group) => { group.views.en = -1; group.views.all = 51; }],
  ['fractional language value', (group) => { group.views.en = 1.5; group.views.all = 53.5; }],
  ['string language value', (group) => { group.views.es = '52'; }],
  ['missing language value', (group) => { delete group.views.es; }],
  ['unsafe language sum', (group) => { group.views = { all: Number.MAX_SAFE_INTEGER + 1, en: Number.MAX_SAFE_INTEGER, es: 1 }; }],
  ['private field', (group) => { group.providerResponse = { private: 'fixture-only' }; }]
];

for (const [description, mutate] of invalidManualBuilderGroups) {
  test(`invalid manual Builder views reject ${description} independently of healthy siblings`, async () => {
    const group = manualBuilderArticleViewsGroup();
    mutate(group);
    const page = createPage({ data: snapshotWithBuilderArticleViews({ group }) });
    await page.settle();
    assertBuilderViewsUnavailable(page, 'en');
    assert.equal(page.cards.articles.count.textContent, '11');
    assertViewsVisible(page, 'en', '12m');
    assert.equal(page.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  for (const [description, options] of [
    ['network failure', { fetchError: new Error('synthetic manual snapshot failure') }],
    ['missing observation', { data: snapshotWithArticleViews() }],
    ['invalid observation', { data: snapshotWithBuilderArticleViews({ group: { ...manualBuilderArticleViewsGroup(), provenance: 'automatic' } }) }]
  ]) {
    test(`${locale} ${description} clears stale manual Builder values, date and provenance`, async () => {
      const page = createPage({ locale, data: snapshotWithBuilderArticleViews({ group: manualBuilderArticleViewsGroup() }), ...options });
      const builder = page.cards.articles.builderViews;
      assert.equal(builder.provenance.textContent, '', 'loading has no observation provenance');
      builder.result.hidden = false;
      builder.value.textContent = '9999';
      builder.coverage.textContent = 'Stale source';
      builder.since.textContent = 'Stale start';
      builder.collectedDate.textContent = 'Stale date';
      builder.provenance.textContent = locale === 'en' ? 'Manual update' : 'Actualización manual';
      await page.settle();
      assertBuilderViewsUnavailable(page, locale);
      assert.equal(page.fetchCount, 1);
    });
  }
}

function idForCatalogIndex(index) {
  return index.toString(16).padStart(64, '0');
}

for (const locale of ['en', 'es']) {
  test(`${locale} Articles v2 renders its records and keeps overview counts independent of catalog filters`, async () => {
    const records = pagedCatalogRecords();
    const data = articleCatalogSnapshot({ records });
    const page = createPage({ locale, data, includeCatalog: true });
    await page.settle();

    assert.equal(page.fetchCount, 1);
    assert.equal(page.cards.articles.count.textContent, '61');
    assert.equal(page.overviewValues.articles.textContent, '61');
    assert.equal(page.catalog.results.hidden, false);
    assert.equal(catalogRows(page).length, 10, 'the catalog starts with ten records');
    assert.equal(catalogRows(page)[0].dataset.catalogRecord, idForCatalogIndex(160), 'the newest publication is first');
    assert.equal(page.catalog.collectedDate.textContent, expectedDate(locale, articleCatalogCollectedAt));
    assert.match(page.catalog.coverage.textContent, /DEV Community/);
    assert.match(page.catalog.coverage.textContent, /HackerNoon/);

    for (const [language, firstId, expectedFilteredCount] of [
      ['en', idForCatalogIndex(160), 31],
      ['es', idForCatalogIndex(159), 30]
    ]) {
      page.catalog.language.value = language;
      page.catalog.language.dispatch('change');
      assert.equal(page.catalog.language.value, language);
      assert.equal(catalogRows(page).length, 10);
      assert.equal(catalogRows(page)[0].dataset.catalogRecord, firstId);
      assert.match(page.catalog.range.textContent, new RegExp(String(expectedFilteredCount)));
      assert.equal(page.cards.articles.count.textContent, '61', 'filtering the local catalog does not change the All summary');
      assert.equal(page.overviewValues.articles.textContent, '61', 'the overview remains the unfiltered total');
    }

    page.selector.value = 'en';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '31');
    assert.equal(page.overviewValues.articles.textContent, '61');
    assert.equal(page.catalog.language.value, 'es', 'the homepage content-language filter is independent of the catalog filter');

    page.catalog.language.value = 'all';
    page.catalog.language.dispatch('change');
    page.catalog.size.value = '50';
    page.catalog.size.dispatch('change');
    page.catalog.next.click();
    const sharedEnglish = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(100)}"]`);
    const sharedSpanish = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(101)}"]`);
    assert.equal(sharedEnglish.querySelectorAll('a').length, 2, 'one identity keeps all of its source copies');
    assert.match(semanticText(sharedEnglish), /Shared Guide/);
    assert.match(semanticText(sharedSpanish), /Shared Guide/);
    page.catalog.language.value = 'es';
    page.catalog.language.dispatch('change');
    assert.equal(catalogRows(page).length, 30);
    assert.equal(page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(100)}"]`), null);
    assert.ok(page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(101)}"]`), 'a translation is a separate content-language identity');
    assert.equal(page.fetchCount, 1, 'filters use the same snapshot instead of requesting providers');
  });

  test(`${locale} Articles v2 preserves identities, all copies, date semantics, and safe text destinations`, async () => {
    const records = catalogDisplayRecords();
    const page = createPage({ locale, data: articleCatalogSnapshot({ records }), includeCatalog: true });
    await page.settle();

    assert.equal(page.catalog.results.hidden, false);
    assert.deepEqual(catalogRecordIds(page), [
      idForCatalogIndex(2), idForCatalogIndex(5), idForCatalogIndex(7), idForCatalogIndex(6),
      idForCatalogIndex(8), idForCatalogIndex(9), idForCatalogIndex(4), idForCatalogIndex(10),
      idForCatalogIndex(1), idForCatalogIndex(3)
    ], 'rows sort by their oldest supported publication date, with unknown dates last');

    const copyRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(1)}"]`);
    assert.equal(copyRow.querySelectorAll('a').length, 2, 'each approved copy has its own destination');
    assert.deepEqual(copyRow.querySelectorAll('a').map((link) => link.getAttribute('href')), [
      articleDestination.caylent('cafe-guide'), articleDestination['dev-community']('cafe-guide')
    ]);
    assert.match(semanticText(copyRow), /Café Guide/);
    assert.match(semanticText(copyRow), locale === 'en' ? /\bEnglish\b/ : /\bInglés\b/i, 'the row identifies the content language');
    for (const [sourceLabel, date] of [
      ['Caylent', '2024-05-01'],
      ['DEV Community', '2023-01-01']
    ]) {
      const publicationDate = expectedDateOnly(locale, date);
      assert.ok(copyRow.querySelectorAll('a').some((link) => {
        if (!accessibleText(link).includes(sourceLabel)) return false;
        for (let current = link; current && current !== copyRow; current = current.parentNode) {
          if (accessibleText(current).includes(sourceLabel) && accessibleText(current).includes(publicationDate)) return true;
        }
        return false;
      }), `${sourceLabel} has an accessible destination name and its own publication date`);
    }

    const dateOnlyRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(2)}"]`);
    assert.ok(semanticText(dateOnlyRow).includes(expectedDateOnly(locale, '2024-10-05')), 'date-only values keep their original calendar date');
    const offsetRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(4)}"]`);
    assert.ok(semanticText(offsetRow).includes(expectedDateOnly(locale, '2024-02-03')), 'an explicit offset does not shift the displayed publication day');

    const unknownDateRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(3)}"]`);
    assert.match(semanticText(unknownDateRow), /Builder date unknown/);
    assert.match(semanticText(unknownDateRow), locale === 'en' ? /date (?:unknown|unavailable|not available)|unknown date/i : /fecha (?:de publicación )?(?:desconocida|no disponible)/i, 'an unknown source date is labeled as unknown');
    assert.doesNotMatch(semanticText(unknownDateRow), /October 27|27 de octubre/i, 'unknown publication dates are not replaced by the collection date');

    const literalHtmlRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(5)}"]`);
    assert.match(semanticText(literalHtmlRow), /<img src=x onerror=alert\(1\)>/, 'source titles render as literal text');
    assert.equal(literalHtmlRow.querySelector('img'), null, 'untrusted title text does not create markup');

    const emailOnlyRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(6)}"]`);
    assert.equal(emailOnlyRow.querySelectorAll('a').length, 0);
    assert.match(semanticText(emailOnlyRow), locale === 'en' ? /Only by email/i : /S[oó]lo por email/i);
    const missingLinkRow = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(7)}"]`);
    assert.equal(missingLinkRow.querySelectorAll('a').length, 0);
    assert.match(semanticText(missingLinkRow), locale === 'en' ? /Link unavailable/i : /Enlace no disponible/i);
    assert.doesNotMatch(semanticText(missingLinkRow), locale === 'en' ? /Only by email/i : /S[oó]lo por email/i);

    page.catalog.language.value = 'es';
    page.catalog.language.dispatch('change');
    assert.deepEqual(catalogRecordIds(page), [idForCatalogIndex(2), idForCatalogIndex(7), idForCatalogIndex(6), idForCatalogIndex(10)]);
    const spanishRecord = page.catalog.list.querySelector(`[data-catalog-record="${idForCatalogIndex(10)}"]`);
    assert.match(semanticText(spanishRecord), /Café Guide/);
    assert.match(semanticText(spanishRecord), locale === 'en' ? /\bSpanish\b/ : /\bEspañol\b/i, 'the Spanish-language copy stays labeled in the content language');
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} catalog pagination supports 10, 20 and 50 with local filters, honest ranges, limits, and stable focus`, async () => {
    const page = createPage({ locale, data: articleCatalogSnapshot({ records: pagedCatalogRecords() }), includeCatalog: true });
    await page.settle();
    assert.equal(page.catalog.list.children.length, 10);
    assert.equal(page.catalog.previous.disabled, true);
    assert.equal(page.catalog.next.disabled, false);
    assert.equal(page.catalog.range.getAttribute('role'), 'status');
    assert.equal(page.catalog.range.getAttribute('aria-live'), 'polite');
    assert.match(page.catalog.range.textContent, /1\D+10/);
    assert.match(page.catalog.range.textContent, /61/);

    page.catalog.next.focus();
    page.catalog.next.click();
    assert.equal(page.document.activeElement, page.catalog.next, 'pagination does not move focus');
    assert.equal(page.catalog.previous.disabled, false);
    assert.equal(catalogRows(page)[0].dataset.catalogRecord, idForCatalogIndex(150));

    page.catalog.language.focus();
    page.catalog.language.value = 'es';
    page.catalog.language.dispatch('change');
    assert.equal(page.document.activeElement, page.catalog.language, 'filtering does not move focus');
    assert.equal(catalogRows(page)[0].dataset.catalogRecord, idForCatalogIndex(159), 'changing a filter resets the page');
    assert.match(page.catalog.range.textContent, /1\D+10/);
    assert.match(page.catalog.range.textContent, /30/);

    page.catalog.language.value = 'all';
    page.catalog.language.dispatch('change');
    page.catalog.next.click();
    page.catalog.next.click();
    page.catalog.size.focus();
    page.catalog.size.value = '50';
    page.catalog.size.dispatch('change');
    assert.equal(page.document.activeElement, page.catalog.size);
    assert.equal(page.catalog.size.value, '50');
    assert.equal(page.catalog.list.children.length, 50);
    assert.equal(catalogRows(page)[0].dataset.catalogRecord, idForCatalogIndex(160), 'changing page size resets to the first page');
    page.catalog.next.click();
    assert.equal(page.catalog.list.children.length, 11, 'the final page is partial');
    assert.match(page.catalog.range.textContent, /51\D+61/);
    assert.equal(page.catalog.next.disabled, true);
    const finalPageIds = catalogRecordIds(page);
    page.catalog.next.click();
    assert.deepEqual(catalogRecordIds(page), finalPageIds, 'a disabled next button cannot change the page');
    page.catalog.previous.click();
    assert.equal(page.catalog.list.children.length, 50);

    page.catalog.size.value = '20';
    page.catalog.size.dispatch('change');
    assert.equal(page.catalog.list.children.length, 20);
    page.catalog.next.click();
    page.catalog.next.click();
    page.catalog.next.click();
    assert.equal(page.catalog.list.children.length, 1, '20 per page also keeps the one-row last page');
    assert.match(page.catalog.range.textContent, /61\D+61/);
    assert.equal(page.catalog.next.disabled, true);
    assert.equal(page.fetchCount, 1, 'paging, filters, and page-size changes do not fetch again');
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} catalog stays in loading state until its single snapshot request resolves`, async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const page = createPage({
      locale,
      data: articleCatalogSnapshot({ records: [catalogRecord(1)] }),
      includeCatalog: true,
      includeStats: false,
      fetchGate: gate
    });
    await page.settle();
    assert.equal(page.fetchCount, 1);
    assert.equal(page.catalog.status.hidden, false);
    assert.equal(page.catalog.results.hidden, true);
    assert.equal(page.catalog.list.children.length, 0);
    assert.equal(page.catalog.language.disabled, true);
    assert.equal(page.catalog.size.disabled, true);
    assert.equal(page.catalog.previous.disabled, true);
    assert.equal(page.catalog.next.disabled, true);
    assert.match(page.catalog.status.textContent, locale === 'en' ? /load/i : /carg/i);

    release();
    await page.settle();
    assert.equal(page.catalog.results.hidden, false);
    assert.equal(page.catalog.list.children.length, 1);
    assert.equal(page.catalog.language.disabled, false);
    assert.equal(page.catalog.size.disabled, false);
  });

  test(`${locale} catalog v1 keeps counts but reports the record list unavailable`, async () => {
    const legacy = snapshot({ sources: [caylent, builderCenter] });
    legacy.groups.articles.counts = { all: 40, en: 30, es: 10 };
    const page = createPage({ locale, data: legacy, includeCatalog: true });
    await page.settle();
    assert.equal(page.cards.articles.count.textContent, '40', 'the legacy group remains valid for counts');
    assertCatalogUnavailable(page);
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} valid empty Articles v2 is an available empty catalog with zero counts`, async () => {
    const page = createPage({ locale, data: articleCatalogSnapshot({ records: [] }), includeCatalog: true });
    await page.settle();
    assert.equal(page.cards.articles.count.textContent, '0');
    assert.equal(page.catalog.results.hidden, false);
    assert.equal(page.catalog.empty.hidden, false, 'zero rows are a valid empty result');
    assert.equal(page.catalog.list.children.length, 0);
    assert.equal(page.catalog.previous.disabled, true);
    assert.equal(page.catalog.next.disabled, true);
    assert.equal(page.catalog.collectedDate.textContent, expectedDate(locale, articleCatalogCollectedAt));
    assert.equal(page.fetchCount, 1);
  });

  for (const filteredLanguage of ['en', 'es']) {
    test(`${locale} filtering a valid nonempty catalog to zero ${filteredLanguage} records keeps an honest empty state`, async () => {
      const onlyLanguage = filteredLanguage === 'en' ? 'es' : 'en';
      const records = [catalogRecord(710, {
        title: `${onlyLanguage} only article`, language: onlyLanguage, publishedAt: '2024-06-01'
      })];
      const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
      await page.settle();
      const collectedDate = page.catalog.collectedDate.textContent;
      const coverage = page.catalog.coverage.textContent;
      const overviewAll = page.overviewValues.articles.textContent;
      assert.equal(page.catalog.list.children.length, 1);
      assert.equal(page.cards.articles.count.textContent, '1');

      page.catalog.language.value = filteredLanguage;
      page.catalog.language.dispatch('change');
      assert.equal(page.catalog.list.children.length, 0);
      assert.equal(page.catalog.results.hidden, false);
      assert.equal(page.catalog.empty.hidden, false);
      assert.notEqual(page.catalog.empty.textContent, '');
      assert.match(page.catalog.range.textContent, /0/);
      assert.equal(page.catalog.previous.disabled, true);
      assert.equal(page.catalog.next.disabled, true);
      assert.equal(page.cards.articles.count.textContent, '1');
      assert.equal(page.overviewValues.articles.textContent, overviewAll);
      assert.equal(page.catalog.collectedDate.textContent, collectedDate);
      assert.equal(page.catalog.coverage.textContent, coverage);
      assert.equal(page.fetchCount, 1);

      page.catalog.language.value = 'all';
      page.catalog.language.dispatch('change');
      assert.equal(page.catalog.list.children.length, 1, 'returning to All restores the valid record');
      assert.equal(page.catalog.empty.hidden, true);
      assert.equal(page.catalog.collectedDate.textContent, collectedDate);
      assert.equal(page.catalog.coverage.textContent, coverage);
      assert.equal(page.fetchCount, 1);
    });
  }

  for (const [description, options] of [
    ['network failure', { fetchError: new Error('synthetic article catalog failure') }],
    ['HTTP failure', { responseOk: false }],
    ['invalid JSON', { jsonError: new Error('invalid JSON') }]
  ]) {
    test(`${locale} catalog clears its rows and exposes unavailable state after ${description}`, async () => {
      const page = createPage({
        locale,
        data: articleCatalogSnapshot({ records: [catalogRecord(1)] }),
        includeCatalog: true,
        includeStats: false,
        ...options
      });
      page.catalog.list.appendChild(new SemanticElement({ tagName: 'li', dataset: { catalogRecord: 'stale-record' }, textContent: 'Stale article title' }));
      page.catalog.results.hidden = false;
      page.catalog.collectedDate.textContent = 'Stale collection date';
      page.catalog.coverage.textContent = 'Stale coverage';
      page.catalog.previous.disabled = false;
      page.catalog.next.disabled = false;
      page.catalog.language.disabled = false;
      page.catalog.size.disabled = false;
      await page.settle();
      assertCatalogUnavailable(page);
      assert.equal(page.catalog.collectedDate.textContent, '');
      assert.equal(page.catalog.coverage.textContent, '');
      assert.equal(page.catalog.status.hidden, false);
      assert.equal(page.catalog.language.disabled, true);
      assert.equal(page.catalog.size.disabled, true);
      assert.equal(page.catalog.previous.disabled, true);
      assert.equal(page.catalog.next.disabled, true);
      assert.equal(page.fetchCount, 1);
    });
  }
}

const twoCatalogRecords = () => [
  catalogRecord(201, { title: 'Identity title', language: 'en', publishedAt: '2024-03-01' }),
  catalogRecord(202, { title: 'Another title', language: 'es', publishedAt: '2024-02-01' })
];

const invalidArticleCatalogCases = [
  ['unsupported definition version', (group) => { group.definitionVersion = 3; }],
  ['definition v1 cannot carry v2 records', (group) => { group.definitionVersion = 1; }],
  ['extra group field', (group) => { group.providerResponse = { private: true }; }],
  ['unknown coverage source', (group) => { group.sources[6] = { id: 'medium', label: 'Medium' }; }],
  ['incorrect coverage label', (group) => { group.sources[6].label = 'Developer site'; }],
  ['duplicate coverage source', (group) => { group.sources[6] = { ...group.sources[5] }; }],
  ['noncanonical coverage order', (group) => { [group.sources[6], group.sources[7]] = [group.sources[7], group.sources[6]]; }],
  ['Medium coverage', (group) => { group.sources.push({ id: 'medium', label: 'Medium' }); }],
  ['malformed record identifier', (group) => { group.records[0].id = 'A'.repeat(64); }],
  ['duplicate record identifier', (group) => { group.records[1].id = group.records[0].id; }],
  ['duplicate normalized title and language identity', (group) => {
    group.records[1].title = '  identity   title ';
    group.records[1].publications[0].title = ' identity title ';
    group.records[1].language = 'en';
    group.counts = { all: 2, en: 2, es: 0 };
  }],
  ['duplicate identity after Unicode whitespace normalization', (group) => {
    group.records[0].title = 'Identity title';
    group.records[0].publications[0].title = group.records[0].title;
    group.records[1].title = '\u00a0identity\u2003title\u00a0';
    group.records[1].publications[0].title = group.records[1].title;
    group.records[1].language = 'en';
    group.counts = { all: 2, en: 2, es: 0 };
  }],
  ['duplicate identity after NFC normalization', (group) => {
    group.records[0].title = 'Café Guide';
    group.records[0].publications[0].title = group.records[0].title;
    group.records[1].title = 'Cafe\u0301 Guide';
    group.records[1].publications[0].title = group.records[1].title;
    group.records[1].language = 'en';
    group.counts = { all: 2, en: 2, es: 0 };
  }],
  ['publication title with a different normalized identity', (group) => { group.records[0].publications[0].title = 'Different title'; }],
  ['unsupported language', (group) => { group.records[0].language = 'fr'; }],
  ['record with no destinations', (group) => { group.records[0].publications = []; }],
  ['publication from an unknown source', (group) => { group.records[0].publications[0].sourceId = 'medium'; }],
  ['publication source omitted from coverage', (group) => { group.sources = group.sources.filter(({ id }) => id !== 'dev-community'); }],
  ['extra private record field', (group) => { group.records[0].providerId = 'private-fixture-id'; }],
  ['extra preview URL field', (group) => { group.records[0].publications[0].preview_url = 'https://admin.example/preview'; }],
  ['malformed publication fields', (group) => { delete group.records[0].publications[0].emailOnly; }],
  ['counts disagree with records while totals remain self-consistent', (group) => { group.counts.all += 1; group.counts.en += 1; }],
  ['language counts disagree with records while All remains self-consistent', (group) => { group.counts.en += 1; group.counts.es -= 1; }],
  ['invalid supported date', (group) => {
    group.records[0].publishedAt = '2024-02-30';
    group.records[0].publications[0].publishedAt = '2024-02-30';
  }],
  ['timestamp without explicit timezone', (group) => {
    group.records[0].publishedAt = '2024-03-01T12:00:00';
    group.records[0].publications[0].publishedAt = '2024-03-01T12:00:00';
  }],
  ['future publication date', (group) => {
    group.records[0].publishedAt = '2026-10-28';
    group.records[0].publications[0].publishedAt = '2026-10-28';
  }],
  ['record date is not the minimum copy date', (group) => {
    const record = group.records[0];
    record.publications.push(catalogPublication({ sourceId: 'caylent', title: record.title, publishedAt: '2023-01-01' }));
    record.publishedAt = '2024-03-01';
  }],
  ['null record date when a copy has a date', (group) => { group.records[0].publishedAt = null; }],
  ['non-null record date when every copy is unknown', (group) => {
    group.records[0].publications[0].publishedAt = null;
    group.records[0].publishedAt = '2024-03-01';
  }],
  ['unsafe URL host', (group) => { group.records[0].publications[0].url = 'https://attacker.example/article'; }],
  ['URL credentials', (group) => { group.records[0].publications[0].url = 'https://user:pass@dev.to/guille/identity-title'; }],
  ['URL query string', (group) => { group.records[0].publications[0].url += '?preview=1'; }],
  ['URL fragment', (group) => { group.records[0].publications[0].url += '#admin'; }],
  ['alternate URL port', (group) => { group.records[0].publications[0].url = 'https://dev.to:8443/guille/identity-title'; }],
  ['administrative Builder preview destination', (group) => {
    group.records[0].publications[0] = catalogPublication({ sourceId: 'builder-center', title: group.records[0].title, publishedAt: '2024-03-01', url: 'https://builder.aws.com/admin/preview' });
  }],
  ['null URL for a non-Simple AWS publication', (group) => { group.records[0].publications[0].url = null; }],
  ['email-only flag with a web URL', (group) => {
    group.records[0].publications[0] = catalogPublication({ sourceId: 'simple-aws', title: group.records[0].title, publishedAt: '2024-03-01', url: articleDestination['simple-aws']('identity-title'), emailOnly: true });
  }],
  ['email-only flag on a non-Simple AWS source', (group) => { group.records[0].publications[0].emailOnly = true; }],
  ['non-boolean email-only flag', (group) => { group.records[0].publications[0].emailOnly = 'false'; }],
  ['duplicate exact publication', (group) => { group.records[0].publications.push({ ...group.records[0].publications[0] }); }]
];

for (const [description, mutate] of invalidArticleCatalogCases) {
  test(`invalid Articles v2 rejects ${description} as one family and preserves healthy siblings`, async () => {
    const records = twoCatalogRecords();
    const data = mutateArticleCatalog(articleCatalogSnapshot({ records }), mutate);
    const page = createPage({ data, includeCatalog: true });
    await page.settle();
    assert.equal(page.cards.articles.results.hidden, true, 'invalid catalog data also invalidates Article counts');
    assert.equal(page.cards.articles.count.textContent, '');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    assert.equal(page.cards.newsletter.count.textContent, '27');
    assertCatalogUnavailable(page);
    assert.equal(page.fetchCount, 1);
  });
}

test('valid Articles v2 IDs are shape-checked, not recalculated, and email-only metadata may coexist with an unavailable web link', async () => {
  const records = [catalogRecord(301, {
    id: 'f'.repeat(64),
    title: 'Simple AWS article', language: 'en', publishedAt: '2024-01-01',
    publications: [
      catalogPublication({ sourceId: 'simple-aws', title: 'Simple AWS article', publishedAt: '2024-01-01', url: null, emailOnly: true }),
      catalogPublication({ sourceId: 'simple-aws', title: 'Simple AWS article', publishedAt: '2024-01-01', url: null, emailOnly: false })
    ]
  })];
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();
  assert.equal(page.cards.articles.count.textContent, '1');
  assert.equal(page.catalog.results.hidden, false);
  assert.equal(page.catalog.list.children.length, 1);
  const row = page.catalog.list.children[0];
  assert.match(semanticText(row), /Only by email/i);
  assert.match(semanticText(row), /Link unavailable/i);
  assert.equal(row.querySelectorAll('a').length, 0);
  assert.equal(page.fetchCount, 1);
});

test('Articles v2 keeps different title-and-language identities when their public URL is the same', async () => {
  const sharedUrl = articleDestination['dev-community']('shared-destination');
  const records = [
    catalogRecord(801, {
      title: 'First distinct article', language: 'en', publishedAt: '2024-01-01',
      publications: [catalogPublication({ sourceId: 'dev-community', title: 'First distinct article', publishedAt: '2024-01-01', url: sharedUrl })]
    }),
    catalogRecord(802, {
      title: 'Second distinct article', language: 'en', publishedAt: '2024-02-01',
      publications: [catalogPublication({ sourceId: 'dev-community', title: 'Second distinct article', publishedAt: '2024-02-01', url: sharedUrl })]
    })
  ];
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();
  assert.equal(page.cards.articles.count.textContent, '2');
  assert.deepEqual(catalogRecordIds(page), [records[1].id, records[0].id], 'rows remain keyed by title and language, not URL');
  assert.deepEqual(page.catalog.list.children.map((row) => row.querySelector('a')?.getAttribute('href')), [sharedUrl, sharedUrl]);
  assert.match(semanticText(page.catalog.list.children[0]), /Second distinct article/);
  assert.match(semanticText(page.catalog.list.children[1]), /First distinct article/);
  assert.equal(page.fetchCount, 1);
});

test('Articles v2 accepts every canonical article destination and keeps tied dates deterministic', async () => {
  const sourceRecords = articleSourceCoverage.map((source, index) => {
    const title = `Destination ${source.id}`;
    return catalogRecord(400 + index, {
      title,
      language: index % 2 === 0 ? 'en' : 'es',
      publishedAt: `2025-01-${String(index + 1).padStart(2, '0')}`,
      publications: [catalogPublication({
        sourceId: source.id,
        title,
        publishedAt: `2025-01-${String(index + 1).padStart(2, '0')}`
      })]
    });
  });
  const equalInstantRecord = catalogRecord(499, {
    title: 'Equal instant', language: 'en',
    publishedAt: '2024-03-01T00:00:00Z',
    publications: [
      catalogPublication({ sourceId: 'caylent', title: 'Equal instant', publishedAt: '2024-03-01T01:00:00+01:00' }),
      catalogPublication({ sourceId: 'dev-community', title: 'Equal instant', publishedAt: '2024-03-01T00:00:00Z' })
    ]
  });
  const alphaEn = catalogRecord(2, { title: 'Alpha', language: 'en', publishedAt: '2024-03-01' });
  const alphaEs = catalogRecord(1, {
    title: 'Alpha', language: 'es', publishedAt: '2024-03-01',
    publications: [catalogPublication({ sourceId: 'caylent', title: 'Alpha', publishedAt: '2024-03-01' })]
  });
  const beta = catalogRecord(3, { title: 'Beta', language: 'en', publishedAt: '2024-03-01' });
  const records = [...sourceRecords, beta, alphaEn, equalInstantRecord, alphaEs];
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();

  assert.equal(page.cards.articles.count.textContent, String(records.length));
  assert.equal(page.catalog.results.hidden, false);
  page.catalog.size.value = '20';
  page.catalog.size.dispatch('change');
  assert.equal(page.catalog.list.children.length, 14, 'the twenty-row page size exposes every fixture row');
  const orderedIds = catalogRecordIds(page);
  assert.deepEqual(orderedIds.slice(-4), [alphaEs.id, alphaEn.id, beta.id, equalInstantRecord.id], 'same-date rows use title then ID for a stable order');
  const tiedRow = page.catalog.list.querySelector(`[data-catalog-record="${equalInstantRecord.id}"]`);
  assert.match(semanticText(tiedRow), /March 1, 2024|1 de marzo de 2024/i);
  assert.equal(page.fetchCount, 1);
});

test('Articles v2 accepts a canonical coverage subset without inventing mixed-platform coverage', async () => {
  const sources = [devCommunity, spainClouds];
  const records = [
    catalogRecord(601, { title: 'DEV article', language: 'en' }),
    catalogRecord(602, {
      title: 'SpainClouds article', language: 'es',
      publications: [catalogPublication({ sourceId: 'spainclouds', title: 'SpainClouds article' })]
    })
  ];
  const page = createPage({ data: articleCatalogSnapshot({ records, sources }), includeCatalog: true });
  await page.settle();
  assert.equal(page.cards.articles.count.textContent, '2');
  assert.equal(page.catalog.results.hidden, false);
  assert.match(page.catalog.coverage.textContent, /DEV Community/);
  assert.match(page.catalog.coverage.textContent, /SpainClouds/);
  assert.doesNotMatch(page.catalog.coverage.textContent, /Medium/);
  assert.equal(page.fetchCount, 1);
});

test('invalid root snapshot disables catalog and statistics together without fabricating zeros', async () => {
  const page = createPage({ data: { schemaVersion: 2, groups: {} }, includeCatalog: true });
  await page.settle();
  assertCatalogUnavailable(page);
  assert.equal(page.cards.articles.count.textContent, '');
  assert.equal(page.cards.talks.results.hidden, true);
  assert.equal(page.fetchCount, 1);
});

test('Articles v2 matches all Unicode White_Space characters in publication identities', async () => {
  const record = catalogRecord(901, {
    title: 'A title with a space', language: 'en', publishedAt: '2024-05-01',
    publications: [catalogPublication({
      sourceId: 'dev-community',
      title: 'A title\u0085with a space',
      publishedAt: '2024-05-01'
    })]
  });
  const page = createPage({ data: articleCatalogSnapshot({ records: [record] }), includeCatalog: true });
  await page.settle();
  assert.equal(page.cards.articles.count.textContent, '1');
  assert.equal(page.catalog.results.hidden, false);
  assert.equal(page.catalog.list.children.length, 1);
  assert.match(semanticText(page.catalog.list.children[0]), /A title with a space/);
  assert.equal(page.fetchCount, 1);
});

test('Articles v2 compares full timestamp fractions for minimum dates and catalog ordering', async () => {
  const earlier = '2024-05-01T12:00:00.1234Z';
  const later = '2024-05-01T12:00:00.12345Z';
  const minimumRecord = catalogRecord(902, {
    title: 'Minimum fractional date', language: 'en', publishedAt: earlier,
    publications: [
      catalogPublication({ sourceId: 'caylent', title: 'Minimum fractional date', publishedAt: later }),
      catalogPublication({ sourceId: 'dev-community', title: 'Minimum fractional date', publishedAt: earlier })
    ]
  });
  const laterRecord = catalogRecord(903, {
    title: 'Later fractional date', language: 'en', publishedAt: later
  });
  const records = [minimumRecord, laterRecord];
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();

  assert.equal(page.cards.articles.count.textContent, '2');
  assert.equal(page.catalog.results.hidden, false);
  assert.deepEqual(catalogRecordIds(page), [laterRecord.id, minimumRecord.id]);
  assert.equal(page.fetchCount, 1);

  const wrongMinimum = { ...minimumRecord, publishedAt: later };
  const invalidPage = createPage({
    data: articleCatalogSnapshot({ records: [wrongMinimum, laterRecord] }),
    includeCatalog: true
  });
  await invalidPage.settle();
  assertCatalogUnavailable(invalidPage);
  assert.equal(invalidPage.cards.articles.count.textContent, '');
  assert.equal(invalidPage.cards.talks.count.textContent, '6');
  assert.equal(invalidPage.fetchCount, 1);
});

test('Articles v2 rejects a publication fraction later than the collection timestamp', async () => {
  const collectedAt = '2026-10-27T18:55:58.123Z';
  const publicationAt = '2026-10-27T18:55:58.1231Z';
  const record = catalogRecord(904, {
    title: 'Fraction after collection', language: 'en', publishedAt: publicationAt,
    publications: [catalogPublication({
      sourceId: 'dev-community', title: 'Fraction after collection', publishedAt: publicationAt
    })]
  });
  const page = createPage({
    data: articleCatalogSnapshot({ records: [record], collectedAt }),
    includeCatalog: true
  });
  await page.settle();
  assertCatalogUnavailable(page);
  assert.equal(page.cards.articles.count.textContent, '');
  assert.equal(page.cards.talks.count.textContent, '6');
  assert.equal(page.fetchCount, 1);
});

for (const locale of ['en', 'es']) {
  test(`${locale} catalog enables the labeled search and six native sort choices only after valid Articles v2`, async () => {
    let release;
    const fetchGate = new Promise((resolve) => { release = resolve; });
    const records = [catalogRecord(1301, { title: 'Searchable article', language: 'en' })];
    const page = createPage({
      locale,
      data: articleCatalogSnapshot({ records }),
      includeCatalog: true,
      includeStats: false,
      fetchGate,
      url: `https://guilleojeda.com/${locale === 'es' ? 'es/' : ''}articles/?utm=one&utm=two#view`
    });

    assert.equal(page.catalog.query.tagName, 'INPUT');
    assert.equal(page.catalog.query.getAttribute('type'), 'search');
    assert.ok(page.catalog.query.id, 'the native search input has a label target');
    assert.equal(page.catalog.query.disabled, true);
    assert.equal(page.catalog.sort.tagName, 'SELECT');
    assert.deepEqual(page.catalog.sort.children.map((option) => option.getAttribute('value')),
      ['date-desc', 'date-asc', 'title-asc', 'title-desc', 'source-asc', 'source-desc']);
    assert.equal(page.catalog.sort.value, 'date-desc');
    assert.equal(page.catalog.sort.disabled, true);
    assert.equal(page.catalog.status.getAttribute('role'), 'status');
    assert.equal(page.catalog.status.getAttribute('aria-live'), 'polite');

    release();
    await page.settle();
    assert.equal(page.catalog.query.disabled, false);
    assert.equal(page.catalog.sort.disabled, false);
    assert.equal(page.catalog.query.value, '');
    assert.equal(page.catalog.sort.value, 'date-desc');
    assert.equal(page.catalog.fallback.hidden, true);
    assert.deepEqual(page.fetchCalls.map(({ url }) => url), ['https://guilleojeda.com/content-stats/v1/current.json']);
    assert.deepEqual(page.historyCalls, [], 'an already-default URL is not rewritten');
  });
}

for (const locale of ['en', 'es']) {
  const unavailableCases = [
    ['network failure', { fetchError: new Error('catalog network unavailable') }],
    ['HTTP failure', { responseOk: false }],
    ['invalid JSON', { jsonError: new Error('catalog JSON invalid') }],
    ['legacy Articles v1', { data: snapshot({ sources: [caylent, builderCenter] }) }],
    ['invalid Articles v2', {
      data: mutateArticleCatalog(articleCatalogSnapshot({ records: [catalogRecord(1302)] }), (group) => {
        group.records[0].publications[0].title = 'Mismatched title';
      })
    }]
  ];

  for (const [description, options] of unavailableCases) {
    test(`${locale} catalog clears and disables search and sort after ${description}`, async () => {
      const catalogPath = locale === 'es' ? '/es/articles/' : '/articles/';
      const url = `https://guilleojeda.com${catalogPath}?q=retained&lang=es&sort=title-desc&size=20&page=2&keep=a&keep=b#retain`;
      const page = createPage({ locale, includeCatalog: true, includeStats: false, url, ...options });
      page.catalog.query.value = 'stale search';
      page.catalog.sort.value = 'source-desc';
      await page.settle();
      assertCatalogUnavailable(page);
      assert.equal(page.catalog.query.value, '');
      assert.equal(page.catalog.query.disabled, true);
      assert.equal(page.catalog.sort.value, 'date-desc');
      assert.equal(page.catalog.sort.disabled, true);
      assert.equal(page.catalog.fallback.hidden, false);
      const retainedUrl = new URL(page.location.href);
      assert.equal(retainedUrl.pathname, catalogPath);
      assert.equal(retainedUrl.searchParams.get('q'), 'retained');
      assert.equal(retainedUrl.searchParams.get('lang'), 'es');
      assert.equal(retainedUrl.searchParams.get('sort'), 'title-desc');
      assert.equal(retainedUrl.searchParams.get('size'), '20');
      assert.equal(retainedUrl.searchParams.get('page'), '2');
      assert.deepEqual(retainedUrl.searchParams.getAll('keep'), ['a', 'b']);
      assert.equal(retainedUrl.hash, '#retain');
      assert.deepEqual(page.historyCalls, [], 'unavailable catalog data does not rewrite URL state');
      assert.equal(page.fetchCount, 1);
    });
  }
}

for (const locale of ['en', 'es']) {
  test(`${locale} search matches Unicode words across row titles and attached source labels`, async () => {
    const records = catalogSearchRecords();
    const page = createPage({
      locale,
      data: articleCatalogSnapshot({ records }),
      includeCatalog: true,
      url: `https://guilleojeda.com/${locale === 'es' ? 'es/' : ''}articles/?utm=one&utm=two#part`
    });
    await page.settle();
    const allCount = page.cards.articles.count.textContent;
    const overview = page.overviewValues.articles.textContent;
    const typedQuery = '  CAFE\u0301\u00a0DEV\u0085COMMUNITY  ';

    const selection = setCatalogQuery(page, typedQuery);
    assert.deepEqual(catalogRecordIds(page), [records[0].id],
      'accent-insensitive AND terms may match the title and a second publication source');
    assert.equal(page.catalog.query.value, typedQuery, 'typing preserves spaces and caret text');
    assert.equal(page.catalog.query.selectionStart, selection.selectionStart);
    assert.equal(page.catalog.query.selectionEnd, selection.selectionEnd);
    assert.equal(page.document.activeElement, page.catalog.query, 'search keeps keyboard focus');
    assert.equal(page.catalog.range.getAttribute('role'), 'status');
    assert.equal(page.catalog.range.getAttribute('aria-live'), 'polite');
    assert.equal(page.cards.articles.count.textContent, allCount);
    assert.equal(page.overviewValues.articles.textContent, overview);
    const updatedUrl = new URL(page.location.href);
    assert.equal(updatedUrl.searchParams.get('q'), 'CAFE\u0301\u00a0DEV\u0085COMMUNITY');
    assert.deepEqual(updatedUrl.searchParams.getAll('utm'), ['one', 'two']);
    assert.equal(updatedUrl.hash, '#part');
    assert.equal(page.historyCalls.at(-1)?.method, 'replaceState');
    assert.equal(page.fetchCount, 1);
  });
}

test('catalog search includes only sources attached to matching rows, not global coverage, URLs, IDs or dates', async () => {
  const records = catalogSearchRecords();
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();

  setCatalogQuery(page, 'LinkedIn');
  assert.deepEqual(catalogRecordIds(page), [records[1].id], 'the source label matches its publication row');
  for (const query of [
    'AWS for Engineers',
    'url-secret-token',
    records[0].id,
    '2024-05-01',
    'full body phrase not collected'
  ]) {
    setCatalogQuery(page, query);
    assert.deepEqual(catalogRecordIds(page), [], `search does not include ${query}`);
  }
  assert.equal(page.fetchCount, 1);
});

test('catalog search treats punctuation literally and keeps matching markup-like titles as text', async () => {
  const records = catalogSearchRecords();
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();

  setCatalogQuery(page, '[');
  assert.deepEqual(catalogRecordIds(page), [records[3].id], 'a regex metacharacter is searched literally');
  setCatalogQuery(page, '<img');
  assert.deepEqual(catalogRecordIds(page), [records[5].id]);
  assert.equal(page.catalog.list.querySelector('img'), null, 'source titles remain text, not parsed markup');
  assert.match(semanticText(page.catalog.list.children[0]), /<img src=x onerror=alert\(1\)>/);
  assert.equal(page.fetchCount, 1);
});

test('accent-insensitive search leaves distinct accented article identities and counts intact', async () => {
  const records = catalogSearchRecords();
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();
  const allCount = page.cards.articles.count.textContent;
  const overview = page.overviewValues.articles.textContent;

  setCatalogQuery(page, 'cafe');
  assert.deepEqual(catalogRecordIds(page), [records[0].id, records[1].id, records[2].id]);
  assert.equal(page.cards.articles.count.textContent, allCount);
  assert.equal(page.overviewValues.articles.textContent, overview);
  assert.equal(page.fetchCount, 1);
});

for (const locale of ['en', 'es']) {
  test(`${locale} no-match search has its own empty state and clamps to page one`, async () => {
    const records = [catalogRecord(1310, { title: 'A listed article', language: 'en' })];
    const page = createPage({
      locale,
      data: articleCatalogSnapshot({ records }),
      includeCatalog: true,
      url: `https://guilleojeda.com/${locale === 'es' ? 'es/' : ''}articles/?q=no+matching+article&page=99#search`
    });
    await page.settle();
    const overview = page.overviewValues.articles.textContent;

    assert.equal(page.catalog.query.value, 'no matching article');
    assert.equal(page.catalog.list.children.length, 0);
    assert.equal(page.catalog.empty.hidden, false);
    assert.match(page.catalog.empty.textContent, locale === 'en' ? /search/i : /b[uú]squeda/i);
    assert.match(page.catalog.range.textContent, /0/);
    assert.equal(page.document.activeElement, null, 'restoring URL view state does not move focus');
    assert.equal(page.overviewValues.articles.textContent, overview);
    assert.equal(new URL(page.location.href).searchParams.has('page'), false, 'zero matches always use page one');
    assert.equal(page.catalog.previous.disabled, true);
    assert.equal(page.catalog.next.disabled, true);
  });

  test(`${locale} truly empty Articles v2 keeps a distinct valid zero state`, async () => {
    const emptyPage = createPage({ locale, data: articleCatalogSnapshot({ records: [] }), includeCatalog: true });
    await emptyPage.settle();
    assert.equal(emptyPage.catalog.results.hidden, false);
    assert.equal(emptyPage.catalog.empty.hidden, false);
    assert.notEqual(emptyPage.catalog.empty.textContent, '');
    assert.doesNotMatch(emptyPage.catalog.empty.textContent, locale === 'en' ? /search/i : /b[uú]squeda/i);
    assert.equal(emptyPage.catalog.query.disabled, false);
    assert.equal(emptyPage.catalog.sort.disabled, false);
    assert.equal(emptyPage.cards.articles.count.textContent, '0');
    assert.equal(emptyPage.catalog.previous.disabled, true);
    assert.equal(emptyPage.catalog.next.disabled, true);
    assert.deepEqual(emptyPage.historyCalls, []);
  });
}

const catalogSortOrders = [
  ['date-desc', ['alphaEs', 'accentedAlpha', 'alphaEn', 'delta', 'beta', 'betaEs', 'cafe', 'cafeAccent', 'echo', 'zulu']],
  ['date-asc', ['cafe', 'cafeAccent', 'beta', 'betaEs', 'delta', 'alphaEn', 'alphaEs', 'accentedAlpha', 'echo', 'zulu']],
  ['title-asc', ['alphaEn', 'alphaEs', 'accentedAlpha', 'beta', 'betaEs', 'cafe', 'cafeAccent', 'delta', 'echo', 'zulu']],
  ['title-desc', ['zulu', 'echo', 'delta', 'cafe', 'cafeAccent', 'beta', 'betaEs', 'alphaEn', 'alphaEs', 'accentedAlpha']],
  ['source-asc', ['beta', 'accentedAlpha', 'alphaEn', 'alphaEs', 'delta', 'echo', 'cafe', 'betaEs', 'cafeAccent', 'zulu']],
  ['source-desc', ['betaEs', 'cafeAccent', 'zulu', 'cafe', 'echo', 'delta', 'alphaEs', 'alphaEn', 'beta', 'accentedAlpha']]
];

for (const [sort, order] of catalogSortOrders) {
  test(`catalog ${sort} order honors exact dates, collation, minimum source and stable ties`, async () => {
    const records = catalogSortRecords();
    const page = createPage({ data: articleCatalogSnapshot({ records: Object.values(records) }), includeCatalog: true });
    await page.settle();
    page.catalog.sort.value = sort;
    page.catalog.sort.dispatch('change');
    assert.deepEqual(catalogRecordIds(page), order.map((key) => records[key].id));
    assert.equal(page.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} catalog uses the same fixed Spanish base collation for Ñ`, async () => {
    const nube = catalogRecord(1151, {
      title: 'Nube', language: 'en', publishedAt: '2024-01-01',
      publications: [catalogPublication({ sourceId: 'caylent', title: 'Nube', publishedAt: '2024-01-01' })]
    });
    const ene = catalogRecord(1152, {
      title: 'Ñandú', language: 'en', publishedAt: '2024-02-01',
      publications: [catalogPublication({ sourceId: 'caylent', title: 'Ñandú', publishedAt: '2024-02-01' })]
    });
    const page = createPage({ locale, data: articleCatalogSnapshot({ records: [nube, ene] }), includeCatalog: true });
    await page.settle();
    page.catalog.sort.value = 'title-asc';
    page.catalog.sort.dispatch('change');
    assert.deepEqual(catalogRecordIds(page), [nube.id, ene.id], 'Spanish collation keeps Ñ after N in either interface locale');
  });
}

test('catalog ordering is unchanged when records and their publications arrive in reverse order', async () => {
  const recordsByKey = catalogSortRecords();
  const sourceRecords = Object.values(recordsByKey);
  const reorderedRecords = sourceRecords.slice().reverse().map((record) => ({
    ...record,
    publications: record.publications.slice().reverse()
  }));
  const sourceSnapshot = articleCatalogSnapshot({ records: sourceRecords });
  const reorderedSnapshot = articleCatalogSnapshot({ records: reorderedRecords });
  const originalSourceSnapshot = structuredClone(sourceSnapshot);
  const originalReorderedSnapshot = structuredClone(reorderedSnapshot);
  let dateDescendingPage;
  let reversedDateDescendingPage;

  for (const [sort, order] of catalogSortOrders) {
    const page = createPage({ data: sourceSnapshot, includeCatalog: true });
    await page.settle();
    page.catalog.sort.value = sort;
    page.catalog.sort.dispatch('change');
    const expectedIds = order.map((key) => recordsByKey[key].id);
    const orderedIds = catalogRecordIds(page);
    assert.deepEqual(orderedIds, expectedIds, `${sort} uses its approved stable comparison`);

    const reversedPage = createPage({ data: reorderedSnapshot, includeCatalog: true });
    await reversedPage.settle();
    reversedPage.catalog.sort.value = sort;
    reversedPage.catalog.sort.dispatch('change');
    assert.deepEqual(catalogRecordIds(reversedPage), orderedIds,
      `${sort} does not depend on input order of records or copies`);
    assert.equal(page.fetchCount, 1);
    assert.equal(reversedPage.fetchCount, 1);
    if (sort === 'date-desc') {
      dateDescendingPage = page;
      reversedDateDescendingPage = reversedPage;
    }
  }

  for (const page of [dateDescendingPage, reversedDateDescendingPage]) {
    page.catalog.sort.value = 'title-asc';
    page.catalog.sort.dispatch('change');
    page.catalog.sort.value = 'date-desc';
    page.catalog.sort.dispatch('change');
    assert.deepEqual(catalogRecordIds(page), catalogSortOrders[0][1].map((key) => recordsByKey[key].id),
      'returning to date-desc restores the stable date order');
    assert.equal(page.fetchCount, 1);
  }

  assert.deepEqual(sourceSnapshot, originalSourceSnapshot, 'sorting never mutates the received snapshot');
  assert.deepEqual(reorderedSnapshot, originalReorderedSnapshot, 'sorting never mutates reordered records or copies');
});

test('search and sort compose with content-language and page size before paging and reset to page one', async () => {
  const records = Array.from({ length: 25 }, (_, index) => {
    const title = index === 24 ? 'Needle unique guide' : `Common guide ${String(index).padStart(2, '0')}`;
    return catalogRecord(1400 + index, {
      title,
      language: index === 24 ? 'en' : index % 2 === 0 ? 'en' : 'es',
      publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
    });
  });
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
  await page.settle();
  const allCount = page.cards.articles.count.textContent;
  const overview = page.overviewValues.articles.textContent;
  assert.equal(page.catalog.list.children.length, 10);
  page.catalog.next.click();
  assert.match(page.catalog.range.textContent, /11/);
  assert.equal(page.catalog.previous.disabled, false);

  setCatalogQuery(page, 'Needle');
  assert.deepEqual(catalogRecordIds(page), [records[24].id], 'search covers records beyond the current page');
  assert.match(page.catalog.range.textContent, /1/);
  assert.equal(page.catalog.previous.disabled, true, 'search resets to page one');
  assert.equal(page.catalog.next.disabled, true);
  assert.equal(page.document.activeElement, page.catalog.query);
  assert.equal(page.cards.articles.count.textContent, allCount);
  assert.equal(page.overviewValues.articles.textContent, overview);

  setCatalogQuery(page, '');
  assert.equal(page.catalog.list.children.length, 10);
  page.catalog.next.click();
  page.catalog.language.value = 'en';
  page.catalog.language.dispatch('change');
  assert.equal(page.catalog.previous.disabled, true, 'content-language changes reset the page');
  assert.match(page.catalog.range.textContent, /^Showing 1–|^Mostrando 1–/);
  page.catalog.next.click();
  page.catalog.sort.value = 'title-asc';
  page.catalog.sort.dispatch('change');
  assert.equal(page.catalog.previous.disabled, true, 'sort changes reset the page');
  page.catalog.next.click();
  page.catalog.size.value = '20';
  page.catalog.size.dispatch('change');
  assert.equal(page.catalog.previous.disabled, true, 'page-size changes reset the page');
  const selectedOverview = page.overviewValues.articles.textContent;
  const selectedCount = page.cards.articles.count.textContent;
  const selectedFields = {
    language: page.catalog.language.value,
    sort: page.catalog.sort.value,
    size: page.catalog.size.value
  };
  const historyLength = page.history.length;

  setCatalogQuery(page, 'no matching catalog article');
  assert.equal(page.catalog.list.children.length, 0);
  assert.equal(page.catalog.empty.hidden, false);
  assert.match(page.catalog.empty.textContent, /search/i);
  assert.match(page.catalog.range.textContent, /0/);
  assert.equal(page.catalog.previous.disabled, true);
  assert.equal(page.catalog.next.disabled, true);
  assert.equal(page.catalog.language.value, selectedFields.language);
  assert.equal(page.catalog.sort.value, selectedFields.sort);
  assert.equal(page.catalog.size.value, selectedFields.size);
  assert.equal(page.cards.articles.count.textContent, selectedCount);
  assert.equal(page.overviewValues.articles.textContent, selectedOverview);
  assert.equal(page.history.length, historyLength, 'search replaces the current entry instead of adding one');
  assert.equal(page.fetchCount, 1);

  const whitespaceOnly = ' \t\u00a0\u0085  ';
  setCatalogQuery(page, whitespaceOnly);
  assert.equal(page.catalog.query.value, whitespaceOnly, 'clearing by whitespace preserves the visible input');
  assert.equal(page.catalog.empty.hidden, true);
  assert.equal(page.catalog.list.children.length, 13, 'clearing search restores the first page under existing filters');
  assert.match(page.catalog.range.textContent, /^Showing 1–13 of 13 articles$/);
  assert.equal(page.catalog.language.value, selectedFields.language);
  assert.equal(page.catalog.sort.value, selectedFields.sort);
  assert.equal(page.catalog.size.value, selectedFields.size);
  assert.equal(new URL(page.location.href).searchParams.has('q'), false, 'Unicode whitespace canonicalizes to the empty query');
  assert.equal(page.cards.articles.count.textContent, selectedCount);
  assert.equal(page.overviewValues.articles.textContent, selectedOverview);
  assert.equal(page.fetchCount, 1);
});

test('catalog deep links use first duplicate values, clamp pages and preserve unknown parameters and fragments', async () => {
  const records = Array.from({ length: 21 }, (_, index) => catalogRecord(1500 + index, {
    title: `Spanish article ${String(index).padStart(2, '0')}`,
    language: 'es',
    publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
  }));
  const url = 'https://guilleojeda.com/articles/?q=Spanish&q=ignored&lang=es&lang=en&sort=title-desc&sort=date-asc&size=20&size=10&page=99&page=1&utm=one&utm=two#section';
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true, url });
  await page.settle();

  assert.equal(page.catalog.query.value, 'Spanish');
  assert.equal(page.catalog.language.value, 'es');
  assert.equal(page.catalog.sort.value, 'title-desc');
  assert.equal(page.catalog.size.value, '20');
  assert.deepEqual(catalogRecordIds(page), [records[0].id], 'the excessive page clamps after language, search and sort');
  assert.match(page.catalog.range.textContent, /21/);
  const canonical = new URL(page.location.href);
  for (const [key, value] of [['q', 'Spanish'], ['lang', 'es'], ['sort', 'title-desc'], ['size', '20'], ['page', '2']]) {
    assert.deepEqual(canonical.searchParams.getAll(key), [value], `${key} uses its first value and is canonicalized once`);
  }
  assert.deepEqual(canonical.searchParams.getAll('utm'), ['one', 'two']);
  assert.equal(canonical.hash, '#section');
  assert.equal(page.historyCalls.length, 1);
  assert.equal(page.historyCalls[0].method, 'replaceState');
  assert.equal(page.historyCalls[0].state, null);
  assert.equal(page.fetchCount, 1);
});

test('catalog invalid URL values fall back to defaults and remove only canonical view parameters', async () => {
  const records = [catalogRecord(1601, { title: 'First article', language: 'en' })];
  const url = 'https://guilleojeda.com/articles/?q=%C2%85%20&lang=invalid&lang=es&sort=unknown&sort=title-asc&size=15&size=50&page=0&page=2&keep=a&keep=b#leave-fragment';
  const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true, url });
  await page.settle();

  assert.equal(page.catalog.query.value, '', 'Unicode whitespace trims to the empty default');
  assert.equal(page.catalog.language.value, 'all');
  assert.equal(page.catalog.sort.value, 'date-desc');
  assert.equal(page.catalog.size.value, '10');
  assert.deepEqual(catalogRecordIds(page), [records[0].id]);
  const canonical = new URL(page.location.href);
  for (const key of ['q', 'lang', 'sort', 'size', 'page']) assert.deepEqual(canonical.searchParams.getAll(key), []);
  assert.deepEqual(canonical.searchParams.getAll('keep'), ['a', 'b']);
  assert.equal(canonical.hash, '#leave-fragment');
  assert.equal(page.historyCalls.length, 1);
  assert.equal(page.historyCalls[0].method, 'replaceState');
  assert.equal(page.historyCalls[0].state, null);
  assert.equal(page.fetchCount, 1);
});

for (const invalidPage of ['-1', '0', '2.5', '1e1', '9007199254740992']) {
  test(`catalog URL rejects page=${invalidPage} as not a positive safe base-10 integer`, async () => {
    const records = Array.from({ length: 26 }, (_, index) => catalogRecord(1650 + index, {
      title: `Page article ${String(index).padStart(2, '0')}`,
      language: 'en',
      publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
    }));
    const page = createPage({
      data: articleCatalogSnapshot({ records }),
      includeCatalog: true,
      url: `https://guilleojeda.com/articles/?page=${encodeURIComponent(invalidPage)}&keep=one#page`
    });
    await page.settle();
    assert.deepEqual(catalogRecordIds(page), records.slice().reverse().slice(0, 10).map(({ id }) => id),
      'invalid page values fall back to the first page rather than clamping/coercing');
    assert.match(page.catalog.range.textContent, /^Showing 1–10 of 26 articles$/);
    assert.equal(page.catalog.previous.disabled, true);
    assert.equal(page.catalog.next.disabled, false);
    assert.equal(new URL(page.location.href).searchParams.has('page'), false);
    assert.deepEqual(new URL(page.location.href).searchParams.getAll('keep'), ['one']);
    assert.equal(new URL(page.location.href).hash, '#page');
    assert.equal(page.historyCalls.length, 1);
    assert.equal(page.historyCalls[0].method, 'replaceState');
    assert.equal(page.fetchCount, 1);
  });
}

test('catalog input replaces URL state while selects and pagination push only changed views', async () => {
  const records = Array.from({ length: 25 }, (_, index) => catalogRecord(1700 + index, {
    title: index === 24 ? 'Needle [C++] & 100% unique article' : `Research article ${String(index).padStart(2, '0')}`,
    language: index % 2 === 0 ? 'en' : 'es',
    publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
  }));
  const page = createPage({
    data: articleCatalogSnapshot({ records }),
    includeCatalog: true,
    url: 'https://guilleojeda.com/articles/?utm=one&utm=two#preserve'
  });
  await page.settle();
  assert.deepEqual(page.historyCalls, [], 'the canonical initial URL does not create history entries');
  page.catalog.language.value = 'all';
  page.catalog.language.dispatch('change');
  page.catalog.sort.value = 'date-desc';
  page.catalog.sort.dispatch('change');
  page.catalog.size.value = '10';
  page.catalog.size.dispatch('change');
  assert.deepEqual(page.historyCalls, [], 'selecting already-active values does not push duplicate views');

  page.catalog.next.click();
  assert.equal(new URL(page.location.href).searchParams.get('page'), '2');
  assert.equal(page.historyCalls.at(-1)?.method, 'pushState');
  const historyLengthAfterPage = page.history.length;
  const typedQuery = '  Needle [C++] & 100%  ';
  const selection = setCatalogQuery(page, typedQuery);
  assert.equal(page.catalog.query.value, typedQuery);
  assert.equal(page.catalog.query.selectionStart, selection.selectionStart);
  assert.equal(page.catalog.query.selectionEnd, selection.selectionEnd);
  assert.deepEqual(catalogRecordIds(page), [records[24].id]);
  assert.equal(new URL(page.location.href).searchParams.get('q'), 'Needle [C++] & 100%');
  assert.equal(new URL(page.location.href).searchParams.has('page'), false, 'query reset returns URL to page one');
  assert.equal(page.history.length, historyLengthAfterPage, 'query input replaces the current history entry');
  assert.equal(page.historyCalls.at(-1)?.method, 'replaceState');
  assert.ok(page.historyCalls.every(({ state }) => state === null));

  page.catalog.sort.value = 'title-desc';
  page.catalog.sort.dispatch('change');
  assert.equal(page.catalog.previous.disabled, true);
  assert.equal(page.historyCalls.at(-1)?.method, 'pushState');
  page.catalog.language.value = 'en';
  page.catalog.language.dispatch('change');
  assert.equal(page.historyCalls.at(-1)?.method, 'pushState');
  page.catalog.size.value = '20';
  page.catalog.size.dispatch('change');
  assert.equal(page.historyCalls.at(-1)?.method, 'pushState');
  assert.equal(new URL(page.location.href).searchParams.get('q'), 'Needle [C++] & 100%');
  assert.deepEqual(new URL(page.location.href).searchParams.getAll('utm'), ['one', 'two']);
  assert.equal(new URL(page.location.href).hash, '#preserve');
  assert.equal(page.fetchCount, 1);
});

test('catalog popstate restores query, filters, order and page without refetching or adding history', async () => {
  const records = Array.from({ length: 46 }, (_, index) => catalogRecord(1800 + index, {
    title: `Research guide ${String(index).padStart(2, '0')}`,
    language: index % 2 === 0 ? 'en' : 'es',
    publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
  }));
  const allDateDesc = records.slice().reverse().map(({ id }) => id);
  const spanishDateDesc = records.filter(({ language }) => language === 'es').slice().reverse().map(({ id }) => id);
  const spanishTitleAsc = records.filter(({ language }) => language === 'es').map(({ id }) => id);
  const page = createPage({
    data: articleCatalogSnapshot({ records }),
    includeCatalog: true,
    url: 'https://guilleojeda.com/articles/?q=Research&utm=preserved#history'
  });
  await page.settle();

  const assertView = ({ query, language, sort, size, expectedIds, range }) => {
    assert.equal(page.catalog.query.value, query);
    assert.equal(page.catalog.language.value, language);
    assert.equal(page.catalog.sort.value, sort);
    assert.equal(page.catalog.size.value, String(size));
    assert.deepEqual(catalogRecordIds(page), expectedIds);
    assert.equal(page.catalog.range.textContent, range);
  };
  assertView({
    query: 'Research', language: 'all', sort: 'date-desc', size: 10,
    expectedIds: allDateDesc.slice(0, 10), range: 'Showing 1–10 of 46 articles'
  });

  page.catalog.language.value = 'es';
  page.catalog.language.dispatch('change');
  assertView({
    query: 'Research', language: 'es', sort: 'date-desc', size: 10,
    expectedIds: spanishDateDesc.slice(0, 10), range: 'Showing 1–10 of 23 articles'
  });

  page.catalog.sort.value = 'title-asc';
  page.catalog.sort.dispatch('change');
  assertView({
    query: 'Research', language: 'es', sort: 'title-asc', size: 10,
    expectedIds: spanishTitleAsc.slice(0, 10), range: 'Showing 1–10 of 23 articles'
  });

  page.catalog.size.value = '20';
  page.catalog.size.dispatch('change');
  assertView({
    query: 'Research', language: 'es', sort: 'title-asc', size: 20,
    expectedIds: spanishTitleAsc.slice(0, 20), range: 'Showing 1–20 of 23 articles'
  });

  const historyLengthBeforeQuery = page.history.length;
  setCatalogQuery(page, 'Guide');
  assert.equal(page.history.length, historyLengthBeforeQuery, 'editing query replaces the current entry');
  assertView({
    query: 'Guide', language: 'es', sort: 'title-asc', size: 20,
    expectedIds: spanishTitleAsc.slice(0, 20), range: 'Showing 1–20 of 23 articles'
  });
  page.catalog.next.click();
  assertView({
    query: 'Guide', language: 'es', sort: 'title-asc', size: 20,
    expectedIds: spanishTitleAsc.slice(20), range: 'Showing 21–23 of 23 articles'
  });
  assert.equal(page.catalog.previous.disabled, false);
  assert.equal(page.catalog.next.disabled, true);
  const historyLength = page.history.length;
  const historyCallCount = page.historyCalls.length;

  page.history.back();
  await page.settle();
  assertView({
    query: 'Guide', language: 'es', sort: 'title-asc', size: 20,
    expectedIds: spanishTitleAsc.slice(0, 20), range: 'Showing 1–20 of 23 articles'
  });
  assert.equal(page.catalog.previous.disabled, true);
  assert.equal(page.catalog.next.disabled, false);

  page.history.back();
  await page.settle();
  assertView({
    query: 'Research', language: 'es', sort: 'title-asc', size: 10,
    expectedIds: spanishTitleAsc.slice(0, 10), range: 'Showing 1–10 of 23 articles'
  });

  page.history.back();
  await page.settle();
  assertView({
    query: 'Research', language: 'es', sort: 'date-desc', size: 10,
    expectedIds: spanishDateDesc.slice(0, 10), range: 'Showing 1–10 of 23 articles'
  });

  page.history.back();
  await page.settle();
  assertView({
    query: 'Research', language: 'all', sort: 'date-desc', size: 10,
    expectedIds: allDateDesc.slice(0, 10), range: 'Showing 1–10 of 46 articles'
  });

  for (const state of [
    { query: 'Research', language: 'es', sort: 'date-desc', size: 10, expectedIds: spanishDateDesc.slice(0, 10), range: 'Showing 1–10 of 23 articles' },
    { query: 'Research', language: 'es', sort: 'title-asc', size: 10, expectedIds: spanishTitleAsc.slice(0, 10), range: 'Showing 1–10 of 23 articles' },
    { query: 'Guide', language: 'es', sort: 'title-asc', size: 20, expectedIds: spanishTitleAsc.slice(0, 20), range: 'Showing 1–20 of 23 articles' },
    { query: 'Guide', language: 'es', sort: 'title-asc', size: 20, expectedIds: spanishTitleAsc.slice(20), range: 'Showing 21–23 of 23 articles' }
  ]) {
    page.history.forward();
    await page.settle();
    assertView(state);
  }

  assert.equal(page.history.length, historyLength, 'back/forward does not create history entries');
  assert.equal(page.historyCalls.length, historyCallCount, 'popstate restoration does not push or replace history');
  assert.equal(page.fetchCount, 1);
  assert.ok(page.history.entries.every(({ state }) => state === null));
});

test('catalog reads the current URL when its one snapshot request resolves', async () => {
  let release;
  const fetchGate = new Promise((resolve) => { release = resolve; });
  const records = [
    catalogRecord(1901, { title: 'Initial query result', language: 'en' }),
    catalogRecord(1902, { title: 'Late query result', language: 'es' })
  ];
  const page = createPage({
    data: articleCatalogSnapshot({ records }),
    includeCatalog: true,
    includeStats: false,
    fetchGate,
    url: 'https://guilleojeda.com/articles/?utm=preserved#loading'
  });
  await page.settle();
  assert.equal(page.catalog.query.disabled, true);
  assert.equal(page.catalog.query.value, '');
  page.history.pushState(null, '', '?q=Late&lang=es&sort=title-asc&size=20&page=1&utm=preserved#resolved');
  release();
  await page.settle();

  assert.equal(page.catalog.query.value, 'Late');
  assert.equal(page.catalog.language.value, 'es');
  assert.equal(page.catalog.sort.value, 'title-asc');
  assert.equal(page.catalog.size.value, '20');
  assert.deepEqual(catalogRecordIds(page), [records[1].id]);
  assert.deepEqual(page.fetchCalls.map(({ url }) => url), ['https://guilleojeda.com/content-stats/v1/current.json']);
  assert.equal(page.fetchCount, 1);
});

test('catalog canonicalizes default URL fields only after a valid snapshot and requests the fixed endpoint', async () => {
  let release;
  const fetchGate = new Promise((resolve) => { release = resolve; });
  const page = createPage({
    data: articleCatalogSnapshot({ records: [catalogRecord(1951, { title: 'Canonical defaults', language: 'en' })] }),
    includeCatalog: true,
    includeStats: false,
    fetchGate,
    url: 'https://guilleojeda.com/articles/?q=%C2%85+&lang=all&sort=date-desc&size=10&page=1&keep=a&keep=b#defaults'
  });
  assert.deepEqual(page.historyCalls, [], 'loading does not rewrite URL state');
  assert.equal(page.catalog.query.value, '');
  assert.deepEqual(page.fetchCalls.map(({ url }) => url), ['https://guilleojeda.com/content-stats/v1/current.json']);

  release();
  await page.settle();
  const canonical = new URL(page.location.href);
  for (const key of ['q', 'lang', 'sort', 'size', 'page']) assert.deepEqual(canonical.searchParams.getAll(key), []);
  assert.deepEqual(canonical.searchParams.getAll('keep'), ['a', 'b']);
  assert.equal(canonical.hash, '#defaults');
  assert.equal(page.historyCalls.length, 1);
  assert.equal(page.historyCalls[0].method, 'replaceState');
  assert.equal(page.historyCalls[0].state, null);
  assert.equal(page.fetchCount, 1);
});

for (const locale of ['en', 'es']) {
  test(`${locale} catalog language switch carries the current search, filters, sort, unknown parameters and fragment`, async () => {
    const initialPath = locale === 'es' ? '/es/articles/' : '/articles/';
    const alternatePath = locale === 'es' ? '/articles/' : '/es/articles/';
    const records = Array.from({ length: 46 }, (_, index) => catalogRecord(2001 + index, {
      title: `Searchable work article ${String(index).padStart(2, '0')}`,
      language: 'en',
      publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
    }));
    const data = articleCatalogSnapshot({ records });
    const page = createPage({
      locale,
      data,
      includeCatalog: true,
      url: `https://guilleojeda.com${initialPath}?utm=one&utm=two#catalog`
    });
    await page.settle();
    setCatalogQuery(page, 'work');
    page.catalog.language.value = 'en';
    page.catalog.language.dispatch('change');
    page.catalog.sort.value = 'source-asc';
    page.catalog.sort.dispatch('change');
    page.catalog.size.value = '20';
    page.catalog.size.dispatch('change');
    page.catalog.next.click();
    const pageTwoIds = catalogRecordIds(page);
    const switchedLocale = locale === 'es' ? 'en' : 'es';
    const expectedRange = locale === 'es' ? 'Mostrando 21–40 de 46 artículos' : 'Showing 21–40 of 46 articles';
    const switchedExpectedRange = switchedLocale === 'es' ? 'Mostrando 21–40 de 46 artículos' : 'Showing 21–40 of 46 articles';
    assert.equal(page.catalog.range.textContent, expectedRange);
    const alternate = new URL(page.langToggle.href, page.location.href);
    assert.equal(alternate.pathname, alternatePath);
    assert.deepEqual(alternate.searchParams.getAll('utm'), new URL(page.location.href).searchParams.getAll('utm'));
    assert.deepEqual(alternate.searchParams.getAll('utm'), ['one', 'two']);
    assert.equal(alternate.searchParams.get('q'), 'work');
    assert.equal(alternate.searchParams.get('lang'), 'en');
    assert.equal(alternate.searchParams.get('sort'), 'source-asc');
    assert.equal(alternate.searchParams.get('size'), '20');
    assert.equal(alternate.searchParams.get('page'), '2');
    assert.equal(alternate.hash, '#catalog');

    const switchedPage = createPage({
      locale: switchedLocale,
      data: structuredClone(data),
      includeCatalog: true,
      url: alternate.href
    });
    await switchedPage.settle();
    assert.equal(switchedPage.catalog.query.value, 'work');
    assert.equal(switchedPage.catalog.language.value, 'en');
    assert.equal(switchedPage.catalog.sort.value, 'source-asc');
    assert.equal(switchedPage.catalog.size.value, '20');
    assert.deepEqual(catalogRecordIds(switchedPage), pageTwoIds);
    assert.equal(switchedPage.catalog.range.textContent, switchedExpectedRange);
    assert.equal(page.fetchCount, 1);
    assert.equal(switchedPage.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} homepage ignores catalog URL parameters and keeps its language link unchanged`, async () => {
    const homepageUrl = 'https://guilleojeda.com/?q=homepage&lang=es&sort=title-desc&size=50&page=4&keep=a&keep=b#home';
    const homepage = createPage({ locale, includeCatalog: false, url: homepageUrl });
    await homepage.settle();
    assert.equal(homepage.location.href, homepageUrl);
    assert.deepEqual(homepage.historyCalls, []);
    assert.equal(homepage.langToggle.getAttribute('href'), locale === 'es' ? '/' : '/es/');
    assert.deepEqual(homepage.fetchCalls.map(({ url }) => url), ['https://guilleojeda.com/content-stats/v1/current.json']);
    assert.equal(homepage.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} catalog language link follows the live URL during loading and popstate`, async () => {
    let release;
    const fetchGate = new Promise((resolve) => { release = resolve; });
    const catalogPath = locale === 'es' ? '/es/articles/' : '/articles/';
    const alternatePath = locale === 'es' ? '/articles/' : '/es/articles/';
    const initialUrl = `https://guilleojeda.com${catalogPath}?q=retained&lang=es&sort=title-desc&size=20&page=2&keep=a&keep=b#retain`;
    const page = createPage({
      locale,
      data: articleCatalogSnapshot({ records: [] }),
      includeCatalog: true,
      includeStats: false,
      fetchGate,
      url: initialUrl
    });
    const assertLanguageLinkMatchesLocation = () => {
      const current = new URL(page.location.href);
      const alternate = new URL(page.langToggle.href, page.location.href);
      assert.equal(alternate.pathname, alternatePath);
      assert.deepEqual([...alternate.searchParams], [...current.searchParams]);
      assert.equal(alternate.hash, current.hash);
    };

    assertLanguageLinkMatchesLocation();
    assert.equal(page.catalog.query.disabled, true);
    assert.equal(page.catalog.sort.disabled, true);
    assert.equal(page.location.href, initialUrl);
    assert.deepEqual(page.historyCalls, []);

    page.history.pushState(null, '', '?q=changed&lang=en&sort=date-asc&size=50&page=3&keep=x&keep=y#changed');
    const historyCallCount = page.historyCalls.length;
    page.history.back();
    assert.equal(page.location.href, initialUrl);
    assertLanguageLinkMatchesLocation();
    page.history.forward();
    assert.equal(page.location.search, '?q=changed&lang=en&sort=date-asc&size=50&page=3&keep=x&keep=y');
    assert.equal(page.location.hash, '#changed');
    assertLanguageLinkMatchesLocation();
    assert.equal(page.historyCalls.length, historyCallCount, 'updating the language link does not write history');
    assert.equal(page.catalog.query.disabled, true);
    assert.equal(page.catalog.sort.disabled, true);

    release();
    await page.settle();
  });

  test(`${locale} catalog language link keeps the failed request URL`, async () => {
    const catalogPath = locale === 'es' ? '/es/articles/' : '/articles/';
    const alternatePath = locale === 'es' ? '/articles/' : '/es/articles/';
    const initialUrl = `https://guilleojeda.com${catalogPath}?q=retained&lang=es&sort=title-desc&size=20&page=2&keep=a&keep=b#retain`;
    const page = createPage({
      locale,
      includeCatalog: true,
      includeStats: false,
      fetchError: new Error('snapshot request failed'),
      url: initialUrl
    });
    await page.settle();

    const alternate = new URL(page.langToggle.href, page.location.href);
    assert.equal(alternate.pathname, alternatePath);
    assert.deepEqual([...alternate.searchParams], [...new URL(initialUrl).searchParams]);
    assert.equal(alternate.hash, '#retain');
    assert.equal(page.location.href, initialUrl);
    assert.deepEqual(page.historyCalls, []);
    assert.equal(page.catalog.query.disabled, true);
    assert.equal(page.catalog.sort.disabled, true);
  });
}

test('catalog sorting preserves URL queries that a native search input displays with line breaks as spaces', async () => {
  const records = Array.from({ length: 61 }, (_, index) => catalogRecord(2200 + index, {
    title: `AWS Lambda guide ${String(index).padStart(2, '0')}`,
    language: 'en',
    publishedAt: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10)
  }));
  const page = createPage({
    data: articleCatalogSnapshot({ records }),
    includeCatalog: true,
    url: 'https://guilleojeda.com/articles/?q=AWS%0ALambda&utm=one&utm=two#newline'
  });
  await page.settle();

  assert.equal(page.catalog.query.value, 'AWS Lambda', 'restoring a URL query gives the native search control a visible word separator');
  assert.equal(page.catalog.range.textContent, 'Showing 1–10 of 61 articles');
  page.catalog.sort.value = 'title-asc';
  page.catalog.sort.dispatch('change');

  assert.equal(page.catalog.range.textContent, 'Showing 1–10 of 61 articles');
  assert.equal(new URL(page.location.href).searchParams.get('q'), 'AWS\nLambda');
  assert.deepEqual(new URL(page.location.href).searchParams.getAll('utm'), ['one', 'two']);
  assert.equal(new URL(page.location.href).hash, '#newline');
  assert.equal(page.fetchCount, 1);
});

const phase7MetricSpecs = [
  {
    key: 'articleViews',
    label: 'article views',
    group: 'articleViews',
    field: 'views',
    records: articleViewsRecords,
    metric: (page) => page.cards.articles.views,
    copy: (page, value) => { page.cards.articles.views.region.dataset.statsViewsUnavailable = value; },
    assertVisible: assertViewsVisible
  },
  {
    key: 'articleSearchClicks',
    label: 'Search clicks',
    group: 'articleSearchClicks',
    field: 'clicks',
    records: articleSearchRecords,
    metric: (page) => page.cards.articles.search,
    copy: (page, value) => { page.cards.articles.search.region.dataset.statsSearchUnavailable = value; },
    assertVisible: assertSearchVisible
  },
  {
    key: 'newsletterEmailOpens',
    label: 'newsletter opens',
    group: 'newsletterEmailOpens',
    field: 'opens',
    records: () => newsletterEmailRecords('opens'),
    metric: (page) => page.cards.newsletter.emailOpens,
    copy: (page, value) => { page.cards.newsletter.emailOpens.region.dataset.statsNewsletterEmailOpensUnavailable = value; },
    assertVisible: (page, locale, period) => assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[0], period)
  },
  {
    key: 'newsletterEmailVerifiedClicks',
    label: 'verified email clicks',
    group: 'newsletterEmailVerifiedClicks',
    field: 'clicks',
    records: () => newsletterEmailRecords('clicks'),
    metric: (page) => page.cards.newsletter.emailVerifiedClicks,
    copy: (page, value) => { page.cards.newsletter.emailVerifiedClicks.region.dataset.statsNewsletterEmailVerifiedClicksUnavailable = value; },
    assertVisible: (page, locale, period) => assertNewsletterEmailVisible(page, locale, newsletterEmailMetricSpecs[1], period)
  },
  {
    key: 'directoryViews',
    label: 'directory page views',
    group: 'directoryViews',
    field: 'views',
    records: () => ({ ...directoryViewsRecords(), total: directoryViewsRecord('total') }),
    metric: (page) => page.cards.directoryViews,
    copy: (page, value) => { page.cards.directoryViews.card.dataset.statsDirectoryViewsUnavailable = value; },
    assertVisible: assertDirectoryViewsVisible
  },
  {
    key: 'directoryOutboundClicks',
    label: 'directory outbound clicks',
    group: 'directoryOutboundClicks',
    field: 'clicks',
    records: () => ({ ...directoryOutboundClicksRecords(), total: directoryOutboundClicksRecord('total') }),
    metric: (page) => page.cards.directoryOutboundClicks,
    copy: (page, value) => { page.cards.directoryViews.card.dataset.statsDirectoryOutboundClicksUnavailable = value; },
    assertVisible: assertDirectoryOutboundClicksVisible
  }
];

const phase7GenericCopy = {
  en: {
    articleViews: 'Page view data are unavailable.',
    articleSearchClicks: 'Search click data are unavailable.',
    newsletterEmailOpens: 'Email open data are unavailable.',
    newsletterEmailVerifiedClicks: 'Verified email click data are unavailable.',
    directoryViews: 'Dónde Aprendo AWS page view data are unavailable.',
    directoryOutboundClicks: 'Dónde Aprendo AWS external click data are unavailable.'
  },
  es: {
    articleViews: 'No hay datos disponibles de vistas de páginas.',
    articleSearchClicks: 'No hay datos disponibles de clics de búsqueda.',
    newsletterEmailOpens: 'No hay datos disponibles de aperturas de emails.',
    newsletterEmailVerifiedClicks: 'No hay datos disponibles de clics verificados en emails.',
    directoryViews: 'No hay datos disponibles de vistas de página de Dónde Aprendo AWS.',
    directoryOutboundClicks: 'No hay datos disponibles de clics en enlaces externos de Dónde Aprendo AWS.'
  }
};

function phase7Snapshot() {
  const data = snapshotWithArticleSearchClicks();
  data.groups.newsletterEmailOpens = { definitionVersion: 1, records: newsletterEmailRecords('opens') };
  data.groups.newsletterEmailVerifiedClicks = { definitionVersion: 1, records: newsletterEmailRecords('clicks') };
  data.groups.directoryViews = {
    definitionVersion: 1,
    records: { ...directoryViewsRecords(), total: directoryViewsRecord('total') }
  };
  data.groups.directoryOutboundClicks = {
    definitionVersion: 1,
    records: { ...directoryOutboundClicksRecords(), total: directoryOutboundClicksRecord('total') }
  };
  return data;
}

function phase7CreatePage(locale, data = phase7Snapshot(), options = {}) {
  const page = createPage({ locale, data, ...options });
  for (const spec of phase7MetricSpecs) spec.copy(page, phase7GenericCopy[locale][spec.key]);
  return page;
}

function phase7MetricRecords(data, spec) {
  return data.groups[spec.group].records;
}

function phase7NormalizeCopy(value) {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function assertPhase7ReasonText(text, locale, reason, label) {
  const normalized = phase7NormalizeCopy(text);
  assert.notEqual(normalized.trim(), '', `${label}: unavailable message is visible`);
  assert.doesNotMatch(normalized, /\b(?:failed|failure|error|fallo|falla|fallaron)\b/,
    `${label}: the message does not invent a collection or provider failure`);

  if (reason === 'generic') {
    assert.match(normalized, /\bdata\b|\bdatos\b/, `${label}: generic copy identifies missing data`);
    assert.match(normalized, locale === 'en' ? /unavailable|not available/ : /\bno\b.{0,60}\bdisponible/,
      `${label}: generic copy says the data are unavailable`);
    assert.doesNotMatch(normalized, /(?:only|exclusively).{0,70}(?:english|spanish)|(?:solo|unicamente).{0,70}(?:ingles|espanol)|unsupported|not supported|does not (?:offer|support|provide)|no (?:ofrece|admite|permite|soporta)/,
      `${label}: generic copy does not claim language-only coverage or an unsupported total`);
    return;
  }

  if (reason === 'language') {
    assert.match(normalized, locale === 'en' ? /\benglish\b/ : /\bingles\b/, `${label}: the covered language is named`);
    assert.match(normalized, /simple\s+aws/, `${label}: the metric's own source is named`);
    assert.match(normalized, locale === 'en' ? /\bonly\b/ : /\bsolo\b|\bunicamente\b/,
      `${label}: the message explains that language coverage is limited`);
    assert.doesNotMatch(normalized, /unsupported|not supported|does not (?:offer|support|provide)|no (?:ofrece|admite|permite|soporta)/, `${label}: language takes precedence over total-period support`);
    return;
  }

  assert.match(normalized, locale === 'en'
    ? /(?:does not|doesn't) (?:offer|admit|support|provide)/
    : /no (?:ofrece|admite|permite)/,
  `${label}: the metric states that it does not offer this total`);
  assert.match(normalized, locale === 'en' ? /recorded total/ : /total registrado/,
    `${label}: the message names the recorded total`);
  assert.doesNotMatch(normalized, /(?:only|exclusively).{0,70}(?:english|spanish)|(?:solo|unicamente).{0,70}(?:ingles|espanol)/,
    `${label}: total support is not confused with source-language coverage`);
}

function assertPhase7MetricUnavailable(page, locale, spec, reason = 'generic') {
  const metric = spec.metric(page);
  assert.equal(metric.results.hidden, true, `${spec.label}: unavailable results stay hidden`);
  assert.equal(metric.value.textContent, '', `${spec.label}: unavailable value is cleared`);
  assert.equal(metric.coverage.textContent, '', `${spec.label}: unavailable coverage is cleared`);
  assert.equal(metric.interval.textContent, '', `${spec.label}: unavailable interval is cleared`);
  assert.equal(metric.collectedDate.textContent, '', `${spec.label}: unavailable collection date is cleared`);
  if (metric.qualifications) assert.equal(metric.qualifications.textContent, '', `${spec.label}: unavailable qualifications are cleared`);
  assert.equal(metric.status.hidden, false, `${spec.label}: the visible metric explains its unavailable state`);
  assertPhase7ReasonText(metric.status.textContent, locale, reason, spec.label);
}

function assertPhase7OverviewUnchanged(page, expected) {
  for (const [kind, value] of Object.entries(expected)) {
    assert.equal(page.overviewValues[kind].textContent, value, `${kind} overview is unaffected by activity availability`);
  }
}

function phase7OverviewValues(page) {
  return Object.fromEntries(Object.entries(page.overviewValues).map(([kind, value]) => [kind, value.textContent]));
}

function invalidatePhase7Records(records, field) {
  for (const record of Object.values(records)) {
    if (record) record[field] = -1;
  }
}

for (const locale of ['en', 'es']) {
  test(`${locale} activity metrics with absent, invalid, empty, or all-invalid families use generic missing-data copy`, async () => {
    for (const spec of phase7MetricSpecs) {
      for (const scenario of ['absent', 'invalid group', 'empty records', 'no valid records']) {
        const data = phase7Snapshot();
        if (scenario === 'absent') {
          delete data.groups[spec.group];
        } else if (scenario === 'invalid group') {
          data.groups[spec.group].definitionVersion = 99;
        } else if (scenario === 'empty records') {
          data.groups[spec.group] = { definitionVersion: 1, records: {} };
        } else {
          invalidatePhase7Records(phase7MetricRecords(data, spec), spec.field);
        }

        const page = phase7CreatePage(locale, data);
        await page.settle();
        if (spec.key === 'articleViews' || spec.key === 'articleSearchClicks') {
          page.selector.value = 'es';
          page.selector.dispatch('change');
        }
        assertPhase7MetricUnavailable(page, locale, spec, 'generic');
        assert.equal(page.periodSelector.disabled, false, `${spec.label}/${scenario}: a healthy sibling keeps the shared period selector available`);
        assert.equal(page.periodOptions.total.disabled, false, `${spec.label}/${scenario}: a healthy sibling still supports Recorded total`);
        page.periodSelector.value = 'total';
        page.periodSelector.dispatch('change');

        assertPhase7MetricUnavailable(page, locale, spec, 'generic');
        assert.equal(page.fetchCount, 1, `${spec.label}/${scenario}: reason selection is local to the fetched snapshot`);
      }
    }
  });
}

for (const locale of ['en', 'es']) {
  for (const spec of phase7MetricSpecs) {
    test(`${locale} ${spec.label} clears only a missing period and restores its own valid zero and metadata`, async () => {
      const data = phase7Snapshot();
      const records = phase7MetricRecords(data, spec);
      records['7d'] = null;
      records['12m'][spec.field] = 0;
      const page = phase7CreatePage(locale, data);
      await page.settle();

      spec.assertVisible(page, locale, '12m');
      const count = page.cards.articles.count.textContent;
      const overview = phase7OverviewValues(page);
      page.periodSelector.value = '7d';
      page.periodSelector.dispatch('change');
      assertPhase7MetricUnavailable(page, locale, spec, 'generic');
      for (const sibling of phase7MetricSpecs.filter(({ key }) => key !== spec.key)) {
        const siblingMetric = sibling.metric(page);
        assert.equal(siblingMetric.results.hidden, false, `${sibling.label} remains available when ${spec.label} has no selected record`);
        assert.equal(siblingMetric.status.hidden, true, `${sibling.label} clears its independent status`);
      }
      assert.equal(page.cards.articles.count.textContent, count, 'period changes do not alter article counts');
      assertPhase7OverviewUnchanged(page, overview);

      page.periodSelector.value = '12m';
      page.periodSelector.dispatch('change');
      spec.assertVisible(page, locale, '12m');
      assert.equal(spec.metric(page).value.textContent, '0', `${spec.label} keeps a valid zero visible`);
      assert.equal(page.cards.articles.count.textContent, count);
      assertPhase7OverviewUnchanged(page, overview);
      assert.equal(page.fetchCount, 1);
    });
  }
}

for (const locale of ['en', 'es']) {
  test(`${locale} article Views and Search use same-family English coverage before missing-period or total reasons`, async () => {
    const data = phase7Snapshot();
    data.groups.articleViews.records['7d'] = null;
    data.groups.articleSearchClicks.records['7d'] = null;
    data.groups.articleViews.records['12m'].views = 0;
    data.groups.articleSearchClicks.records['12m'].clicks = 0;
    const page = phase7CreatePage(locale, data);
    await page.settle();
    const overview = phase7OverviewValues(page);

    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.periodOptions.total.disabled, false, 'valid Dónde totals keep the shared total choice enabled in Spanish');
    page.periodSelector.value = '7d';
    page.periodSelector.dispatch('change');
    for (const spec of phase7MetricSpecs.slice(0, 2)) {
      assert.equal(spec.metric(page).region.hidden, false, `${spec.label} stays visible to explain its English coverage`);
      assertPhase7MetricUnavailable(page, locale, spec, 'language');
    }

    page.periodSelector.value = 'total';
    page.periodSelector.dispatch('change');
    for (const spec of phase7MetricSpecs.slice(0, 2)) assertPhase7MetricUnavailable(page, locale, spec, 'language');
    assertDirectoryViewsVisible(page, locale, 'total');
    assertDirectoryOutboundClicksVisible(page, locale, 'total');
    for (const spec of newsletterEmailMetricSpecs) assertNewsletterEmailUnavailable(page, locale, spec, { hidden: true });
    assert.equal(page.cards.newsletter.card.hidden, true, 'Spanish still hides English-only newsletter engagement');
    page.selector.value = 'all';
    page.selector.dispatch('change');
    page.periodSelector.value = '12m';
    page.periodSelector.dispatch('change');
    for (const spec of phase7MetricSpecs.slice(0, 2)) {
      spec.assertVisible(page, locale, '12m');
      assert.equal(spec.metric(page).value.textContent, '0', `${spec.label}: returning to covered English restores a valid zero`);
    }
    assertPhase7OverviewUnchanged(page, overview);
    assert.equal(page.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} Search and email engagement explain unsupported totals only when each family has valid data`, async () => {
    const data = phase7Snapshot();
    data.groups.articleSearchClicks.records['12m'].clicks = 0;
    data.groups.newsletterEmailOpens.records['12m'].opens = 0;
    data.groups.newsletterEmailVerifiedClicks.records['12m'].clicks = 0;
    const page = phase7CreatePage(locale, data);
    await page.settle();
    const overview = phase7OverviewValues(page);

    for (const language of ['all', 'en']) {
      page.selector.value = language;
      page.selector.dispatch('change');
      assert.equal(page.periodOptions.total.disabled, false, `${language}: valid article Views keep Recorded total available`);
      const count = page.cards.articles.count.textContent;
      page.periodSelector.value = 'total';
      page.periodSelector.dispatch('change');
      for (const spec of phase7MetricSpecs.slice(1, 4)) assertPhase7MetricUnavailable(page, locale, spec, 'total');

      page.periodSelector.value = '12m';
      page.periodSelector.dispatch('change');
      for (const spec of phase7MetricSpecs.slice(1, 4)) {
        spec.assertVisible(page, locale, '12m');
        assert.equal(spec.metric(page).value.textContent, '0', `${spec.label}: a supported zero remains valid after the total view`);
      }
      assert.equal(page.cards.articles.count.textContent, count, `${language}: periods do not change counts`);
      assertPhase7OverviewUnchanged(page, overview);
    }
    assert.equal(page.fetchCount, 1);
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} missing or invalid article/directory totals use generic data-unavailable copy`, async () => {
    for (const spec of [phase7MetricSpecs[0], phase7MetricSpecs[4], phase7MetricSpecs[5]]) {
      for (const scenario of ['missing total', 'invalid total']) {
        const data = phase7Snapshot();
        const records = phase7MetricRecords(data, spec);
        if (scenario === 'missing total') delete records.total;
        else records.total[spec.field] = -1;
        const page = phase7CreatePage(locale, data);
        await page.settle();
        assert.equal(page.periodOptions.total.disabled, false, `${spec.label}/${scenario}: another valid Views family keeps the total choice enabled`);
        const count = page.cards.articles.count.textContent;
        const overview = phase7OverviewValues(page);
        page.periodSelector.value = 'total';
        page.periodSelector.dispatch('change');

        assert.equal(page.periodSelector.value, 'total', `${spec.label}/${scenario}: a healthy sibling keeps the selected total in place`);
        assertPhase7MetricUnavailable(page, locale, spec, 'generic');
        const siblingDirectorySpec = spec.key === 'directoryViews' ? phase7MetricSpecs[5] : phase7MetricSpecs[4];
        siblingDirectorySpec.assertVisible(page, locale, 'total');
        assert.equal(page.cards.articles.count.textContent, count);
        assertPhase7OverviewUnchanged(page, overview);
        assert.equal(page.fetchCount, 1);
      }
    }
  });
}

for (const locale of ['en', 'es']) {
  test(`${locale} failed snapshots leave the six activity metrics with generic, non-causal messages`, async () => {
    const failedCases = [
      ['network', { fetchError: new Error('private transport detail') }],
      ['HTTP', { responseOk: false }],
      ['JSON', { jsonError: new Error('private parser detail') }],
      ['invalid root', { data: { schemaVersion: 2, groups: {} } }]
    ];
    for (const [description, options] of failedCases) {
      const page = phase7CreatePage(locale, options.data ?? phase7Snapshot(), options);
      await page.settle();
      for (const spec of phase7MetricSpecs) {
        assertPhase7MetricUnavailable(page, locale, spec, 'generic');
        assert.doesNotMatch(spec.metric(page).status.textContent, /private transport detail|private parser detail/i,
          `${description}: private exception details do not appear in the metric message`);
      }
      assert.equal(page.fetchCount, 1, `${description}: one rejected snapshot does not trigger another request`);
    }
  });
}

test('implementation regression: client accepts supported Articles dates and rejects producer-invalid timestamps', async () => {
  const dateValues = [
    '2025-01-01',
    '2025-01-01T00:00:00.123456789-14:00',
    '2025-01-01T00:00:00+14:00',
    null
  ];
  const validRecords = dateValues.map((publishedAt, index) => {
    const title = `Date contract ${index}`;
    return catalogRecord(1401 + index, {
      title,
      language: 'en',
      publishedAt,
      publications: [catalogPublication({
        sourceId: 'dev-community',
        title,
        publishedAt,
        url: `https://dev.to/guille/date-contract-${index}`
      })]
    });
  });
  const validPage = createPage({ data: articleCatalogSnapshot({ records: validRecords }), includeCatalog: true });
  await validPage.settle();
  assert.equal(validPage.cards.articles.count.textContent, '4');
  assert.equal(validPage.catalog.list.children.length, 4);

  const invalidTimestamps = ['2025-01-01T24:00:00Z', '2025-01-01T00:00:00+15:00', '2025-01-01T00:00:00+14:01'];
  for (const publishedAt of invalidTimestamps) {
    const records = twoCatalogRecords();
    records[0].publishedAt = publishedAt;
    records[0].publications[0].publishedAt = publishedAt;
    const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
    await page.settle();
    assert.equal(page.cards.articles.count.textContent, '', `${publishedAt} invalidates counts and catalog together`);
    assert.equal(page.cards.talks.count.textContent, '6');
    assertCatalogUnavailable(page);
  }
});

test('implementation regression: client rejects DEV editor and reserved route destinations', async () => {
  const invalidPaths = [
    '/guille/a-post/edit',
    '/admin/preview',
    '/new/template',
    '/t/aws',
    '/t%61g/aws',
    '/tag/aws',
    '/top/week',
    '/feed/guille',
    '/leadership/weekly',
    '/curation/weekly',
    '/trending/aws',
    '/survey/example',
    '/guille/series',
    '/guille/comments',
    '/guille/admin',
    '/guille/settings',
    '/guille/members',
    '/following/latest'
  ];
  for (const pathname of invalidPaths) {
    const records = twoCatalogRecords();
    records[0].publications[0].url = `https://dev.to${pathname}`;
    const page = createPage({ data: articleCatalogSnapshot({ records }), includeCatalog: true });
    await page.settle();
    assert.equal(page.cards.articles.count.textContent, '', `${pathname} invalidates the entire Articles family`);
    assert.equal(page.cards.talks.count.textContent, '6');
    assertCatalogUnavailable(page);
  }
});
