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
const articleViewPeriods = ['7d', '30d', '90d', '12m', 'ytd', 'total'];

const articleViewPeriodFacts = {
  '7d': { views: 7, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-25', endDate: '2026-08-31', qualifications: ['sampled'] },
  '30d': { views: 30, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-08-02', endDate: '2026-08-31', qualifications: ['thresholding'] },
  '90d': { views: 90, collectedAt: '2026-09-03T00:00:00.000Z', startDate: '2026-06-03', endDate: '2026-08-31', qualifications: ['other-row'] },
  '12m': { views: 1200, collectedAt: '2026-09-04T00:00:00.000Z', startDate: '2025-09-01', endDate: '2026-08-31', qualifications: ['sampled', 'thresholding', 'other-row'] },
  ytd: { views: 800, collectedAt: '2026-09-05T00:00:00.000Z', startDate: '2026-01-01', endDate: '2026-08-31', qualifications: [] },
  total: { views: 3000, collectedAt: '2026-09-06T00:00:00.000Z', startDate: '2026-04-15', endDate: '2026-08-31', qualifications: ['sampled', 'other-row'] }
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

function snapshotWithNewsletter(options = {}) {
  const data = threeGroupSnapshot();
  data.groups.newsletter = newsletterGroup(options);
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

function createPage({ locale = 'en', data = snapshot(), fetchError, responseOk = true } = {}) {
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
  cards.articles.views = makeArticleViews(cards.articles.card, locale);
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
    assert.equal(page.periodSelector.value, '12m', 'the period control defaults to twelve months');
    assert.equal(page.periodSelector.disabled, true, 'period selection stays disabled while loading');
    await page.settle();
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
