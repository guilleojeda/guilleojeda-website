import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const clientSource = readFileSync(new URL('../src/scripts/content-stats.js', import.meta.url), 'utf8');
const collectedAt = '2026-08-04T00:00:00.000Z';
const talksCollectedAt = '2026-07-28T00:00:00.000Z';
const booksCollectedAt = '2026-06-30T00:00:00.000Z';
const caylent = { id: 'caylent', label: 'Caylent' };
const builderCenter = { id: 'builder-center', label: 'AWS Builder Center' };
const websiteInventory = { id: 'website-inventory', label: 'Website inventory' };

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
    books: 'Book statistics are temporarily unavailable.'
  },
  es: {
    articles: 'No se pueden cargar las estadísticas de artículos por el momento.',
    talks: 'Las estadísticas de sesiones no están disponibles por el momento.',
    books: 'Las estadísticas de libros no están disponibles por el momento.'
  }
};

const loadingCopy = {
  en: { articles: 'Loading article statistics…', talks: 'Loading speaking statistics…', books: 'Loading book statistics…' },
  es: { articles: 'Cargando estadísticas de artículos…', talks: 'Cargando estadísticas de sesiones…', books: 'Cargando estadísticas de libros…' }
};

const initialUnits = {
  en: { articles: 'published articles', talks: 'sessions', books: 'published books' },
  es: { articles: 'artículos publicados', talks: 'sesiones', books: 'libros publicados' }
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
  const cards = Object.fromEntries(['articles', 'talks', 'books'].map((kind) => {
    const card = makeCard(kind, locale);
    section.appendChild(card.card);
    return [kind, card];
  }));
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
    section,
    status: cards.articles.status,
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    get fetchCount() { return fetchCalls.length; },
    get fetchCalls() { return fetchCalls; },
    get fetchedUrl() { return fetchCalls[0]?.url; }
  };
}

function expectedDate(locale, timestamp = collectedAt) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(timestamp));
}

function assertUnavailable(page, locale, kind = 'articles') {
  const { card, results, count, status } = page.cards[kind];
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
      books: /libros/i
    }[kind];
    assert.match(label, expected, `${kind}: count unit should be clear in Spanish`);
  } else {
    const expected = {
      articles: /articles?/i,
      talks: /sessions?|talks?/i,
      books: /books?/i
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

function assertAllUnavailable(page, locale) {
  for (const kind of ['articles', 'talks', 'books']) assertUnavailable(page, locale, kind);
}

for (const locale of ['en', 'es']) {
  test(`${locale} UI shows a localized loading status in each card`, async () => {
    const page = createPage({ locale, data: threeGroupSnapshot() });

    for (const kind of ['articles', 'talks', 'books']) {
      const { card, status } = page.cards[kind];
      assert.equal(status.hidden, false, `${kind}: loading state should be visible`);
      assert.match(status.textContent, locale === 'es' ? /cargando/i : /loading/i);
      assert.equal(card.getAttribute('aria-busy'), 'true');
    }
    await page.settle();
  });

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
    const page = createPage({ locale, data: threeGroupSnapshot() });
    await page.settle();

    const all = { articles: '11', talks: '6', books: '3' };
    const dates = { articles: collectedAt, talks: talksCollectedAt, books: booksCollectedAt };
    for (const kind of ['articles', 'talks', 'books']) {
      assert.equal(page.cards[kind].results.hidden, false, `${kind} should render independently`);
      assert.equal(page.cards[kind].count.textContent, all[kind], `${kind} should start at All`);
      assert.equal(page.cards[kind].collectedDate.textContent, expectedDate(locale, dates[kind]), `${kind} keeps its own collection date`);
      assertLocalizedUnit(page, kind, locale);
    }
    assert.equal(page.cards.articles.coverage.textContent, 'Caylent, AWS Builder Center', 'article source labels stay unchanged');
    assertCuratedCoverage(page, 'talks', locale);
    assertCuratedCoverage(page, 'books', locale);

    for (const [language, counts] of [
      ['en', { articles: '7', talks: '2', books: '2' }],
      ['es', { articles: '4', talks: '4', books: '1' }],
      ['all', all]
    ]) {
      page.selector.value = language;
      page.selector.dispatch('change');
      for (const kind of ['articles', 'talks', 'books']) {
        assert.equal(page.cards[kind].count.textContent, counts[kind], `${kind} should independently show ${language}`);
        assert.equal(page.cards[kind].results.hidden, false);
      }
      assert.equal(page.section.dataset.statsLocale, locale, 'filtering must not change the page UI locale');
    }

    assert.equal(page.fetchCount, 1, 'all cards and filter changes use one aggregate request');
    assert.deepEqual(page.fetchCalls.map((call) => call.url), ['https://guilleojeda.com/content-stats/v1/current.json'], 'no provider requests are made');
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
    assert.equal(page.fetchCount, 1);
  });

  test(`${locale} UI displays a supported measured zero as zero`, async () => {
    const data = threeGroupSnapshot();
    data.groups.books.counts = { all: 0, en: 0, es: 0 };
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.books.results.hidden, false, 'a valid measured zero is available data');
    assert.equal(page.cards.books.status.hidden, true);
    assert.equal(page.cards.books.count.textContent, '0');
    assertCuratedCoverage(page, 'books', locale);
    assert.equal(page.cards.books.collectedDate.textContent, expectedDate(locale, booksCollectedAt));
  });

  test(`${locale} malformed book group affects only Books while valid families keep filtering`, async () => {
    const data = threeGroupSnapshot();
    data.groups.books.counts.all = 4;
    const page = createPage({ locale, data });
    await page.settle();

    assert.equal(page.cards.articles.count.textContent, '11');
    assert.equal(page.cards.talks.count.textContent, '6');
    assertUnavailable(page, locale, 'books');
    page.selector.value = 'es';
    page.selector.dispatch('change');
    assert.equal(page.cards.articles.count.textContent, '4');
    assert.equal(page.cards.talks.count.textContent, '4');
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
    const data = threeGroupSnapshot();
    delete data.groups.articles;
    const page = createPage({ locale, data });
    await page.settle();

    assertUnavailable(page, locale, 'articles');
    assert.equal(page.cards.talks.count.textContent, '6');
    assert.equal(page.cards.books.count.textContent, '3');
    page.selector.value = 'en';
    page.selector.dispatch('change');
    assertUnavailable(page, locale, 'articles');
    assert.equal(page.cards.talks.count.textContent, '2');
    assert.equal(page.cards.books.count.textContent, '2');
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

const invalidDocuments = [
  ['unsupported root schema', { ...threeGroupSnapshot(), schemaVersion: 2 }],
  ['unknown group key', { ...threeGroupSnapshot(), groups: { ...threeGroupSnapshot().groups, newsletters: threeGroupSnapshot().groups.books } }],
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
