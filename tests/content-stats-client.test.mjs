import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const clientSource = readFileSync(new URL('../src/scripts/content-stats.js', import.meta.url), 'utf8');
const collectedAt = '2026-08-04T00:00:00.000Z';
const caylent = { id: 'caylent', label: 'Caylent' };
const builderCenter = { id: 'builder-center', label: 'AWS Builder Center' };

function snapshot({ sources = [caylent], schemaVersion = 1, definitionVersion = 1 } = {}) {
  return {
    schemaVersion,
    groups: {
      articles: {
        definitionVersion,
        basis: 'cumulative',
        collectedAt,
        scopeId: 'scope-2026-08',
        sources,
        counts: { all: 40, en: 40, es: 0 }
      }
    }
  };
}

function createPage({ locale = 'en', data = snapshot() } = {}) {
  const attributes = new Map([['aria-busy', 'false']]);
  const listeners = new Map();
  const card = {
    attributes,
    setAttribute(name, value) { attributes.set(name, value); }
  };
  const selector = {
    value: 'all',
    disabled: true,
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatch(name) { listeners.get(name)?.(); }
  };
  const status = { textContent: locale === 'es' ? 'Cargando estadísticas de artículos…' : 'Loading article statistics…', hidden: true };
  const results = { hidden: true };
  const count = { textContent: '' };
  const countLabel = { textContent: locale === 'es' ? 'artículos publicados' : 'published articles' };
  const coverage = { textContent: '' };
  const collectedDate = { textContent: '' };
  const elements = new Map([
    ['[data-stats-kind="articles"]', card],
    ['[data-stats-language]', selector],
    ['[data-stats-status]', status],
    ['[data-stats-results]', results],
    ['[data-stats-count]', count],
    ['[data-stats-count-label]', countLabel],
    ['[data-stats-coverage]', coverage],
    ['[data-stats-collected-date]', collectedDate]
  ]);
  const section = {
    dataset: {
      statsSource: '/content-stats/v1/current.json',
      statsLocale: locale,
      statsUnavailable: locale === 'es'
        ? 'No se pueden cargar las estadísticas de artículos por el momento.'
        : 'Article statistics are temporarily unavailable.'
    },
    querySelector: (selectorText) => elements.get(selectorText) ?? null
  };
  let fetchCount = 0;
  let fetchedUrl;

  const context = {
    document: { getElementById: (id) => id === 'content-stats' ? section : null },
    window: { location: { href: 'https://guilleojeda.com/', origin: 'https://guilleojeda.com' } },
    URL,
    fetch: async (url) => {
      fetchCount += 1;
      fetchedUrl = String(url);
      return { ok: true, json: async () => data };
    }
  };

  vm.runInNewContext(clientSource, context, { filename: 'src/scripts/content-stats.js' });

  return {
    card,
    collectedDate,
    count,
    countLabel,
    coverage,
    results,
    selector,
    section,
    status,
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    get fetchCount() { return fetchCount; },
    get fetchedUrl() { return fetchedUrl; }
  };
}

function expectedDate(locale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(collectedAt));
}

function assertUnavailable(page, locale) {
  assert.equal(page.results.hidden, true, 'unavailable data must not reveal a count');
  assert.equal(page.count.textContent, '', 'unavailable data must not leave a number');
  assert.equal(page.status.hidden, false, 'unavailable state must be visible');
  assert.equal(
    page.status.textContent,
    locale === 'es' ? 'No se pueden cargar las estadísticas de artículos por el momento.' : 'Article statistics are temporarily unavailable.'
  );
  assert.equal(page.card.attributes.get('aria-busy'), 'false');
}

for (const locale of ['en', 'es']) {
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
