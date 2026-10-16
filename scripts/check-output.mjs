import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');

const rawSiteUrl = process.env.SITE_URL;
assert.ok(rawSiteUrl, 'SITE_URL is required for output checks');
let siteUrl;
try {
  siteUrl = new URL(rawSiteUrl);
} catch {
  throw new Error(`SITE_URL must be an absolute URL: ${rawSiteUrl}`);
}
assert.equal(siteUrl.protocol, 'https:', 'SITE_URL must use HTTPS');
assert.equal(siteUrl.pathname, '/', 'SITE_URL must be an origin without a path');
assert.equal(siteUrl.search, '', 'SITE_URL must be an origin without a query');
assert.equal(siteUrl.hash, '', 'SITE_URL must be an origin without a fragment');
assert.equal(siteUrl.username, '', 'SITE_URL must not include a username');
assert.equal(siteUrl.password, '', 'SITE_URL must not include a password');

function read(relativePath) {
  const filePath = join(dist, relativePath);
  assert.ok(existsSync(filePath), `missing build output: dist/${relativePath}`);
  return readFileSync(filePath, 'utf8');
}

function readContent(relativePath) {
  return JSON.parse(readFileSync(join(root, 'src/content', relativePath), 'utf8'));
}

const talks = readContent('talks.json');
const books = readContent('books.json');
const projects = readContent('projects.json');
const profile = readContent('profile.json');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mustContainText(html, value, message = value) {
  assert.ok(html.includes(value) || html.includes(escapeHtml(value)), `expected ${message}`);
}

function mustContain(html, fragment, message = fragment) {
  assert.ok(html.includes(fragment), `expected ${message}`);
}

function mustNotContain(html, fragment, message = fragment) {
  assert.ok(!html.toLowerCase().includes(fragment.toLowerCase()), `unexpected ${message}`);
}

function checkContentStatsShell(page, html) {
  const locale = page.lang;
  const sectionIdPosition = html.indexOf('id="content-stats"');
  const workPosition = html.indexOf('id="work"');
  const talksPosition = html.indexOf('id="talks"');
  assert.ok(sectionIdPosition > workPosition && sectionIdPosition < talksPosition, `${locale} statistics section must sit between work and talks`);
  const sectionPosition = html.lastIndexOf('<', sectionIdPosition);
  const statsHtml = html.slice(sectionPosition, talksPosition);
  mustContain(statsHtml, 'data-stats-source="/content-stats/v1/current.json"', `${locale} statistics source URL`);

  const cardKinds = [...statsHtml.matchAll(/\bdata-stats-kind=["']([^"']+)["']/gi)].map((match) => match[1]);
  assert.deepEqual(cardKinds, ['articles', 'talks', 'books', 'newsletter'], `${locale} statistics must group articles, delivered sessions, published books and newsletter subscribers by content type`);
  mustContain(statsHtml, 'data-stats-kind="articles"', `${locale} Articles card`);
  mustContainText(statsHtml, locale === 'en' ? 'Articles' : 'Artículos', `${locale} Articles card title`);
  mustContainText(statsHtml, locale === 'en' ? 'Talks & sessions' : 'Charlas y sesiones', `${locale} speaking card title`);
  mustContainText(statsHtml, locale === 'en' ? 'Books' : 'Libros', `${locale} books card title`);
  const newsletterCard = statsHtml.match(/<article\b(?=[^>]*\bdata-stats-kind=["']newsletter["'])[^>]*>[\s\S]*?<\/article>/i)?.[0];
  assert.ok(newsletterCard, `${locale} newsletter must have a distinct accessible card`);
  const newsletterHeading = newsletterCard.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  const newsletterCardText = newsletterCard.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (locale === 'en') assert.match(newsletterHeading, /newsletter/i, 'English newsletter card heading');
  else assert.match(newsletterHeading, /newsletter|bolet.n|suscriptores?/i, 'Spanish newsletter card heading');
  if (locale === 'en') assert.match(newsletterCardText, /current|currently/i, 'English newsletter card labels its total as current');
  else assert.match(newsletterCardText, /actual(?:es|mente)?|vigentes?/i, 'Spanish newsletter card labels its total as current');
  mustNotContain(newsletterCard, locale === 'en' ? 'cumulative' : 'total acumulado', `${locale} newsletter card must not label current subscribers as a cumulative total`);
  for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
    const card = statsHtml.match(new RegExp(`<article\\b(?=[^>]*\\bdata-stats-kind=["']${kind}["'])[^>]*>[\\s\\S]*?<\\/article>`, 'i'))?.[0];
    assert.ok(card, `${locale} ${kind} must have a distinct accessible card`);
    for (const field of ['status', 'results', 'count', 'count-label', 'coverage', 'collected-date']) {
      assert.ok(new RegExp(`\\bdata-stats-${field}(?:\\s|=|>)`).test(card), `${locale} ${kind} needs its own ${field}`);
    }
    mustContain(card, 'aria-live="polite"', `${locale} ${kind} accessible updates`);
  }
  const newsletterUnit = newsletterCard.match(/<[^>]*\bdata-stats-count-label\b[^>]*>([\s\S]*?)<\//i)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  if (locale === 'en') assert.match(newsletterUnit, /subscribers?|subscriptions?/i, 'English newsletter count uses a subscriber unit');
  else assert.match(newsletterUnit, /suscriptores?|suscripciones?/i, 'Spanish newsletter count uses a subscriber unit');
  mustContainText(statsHtml, 'Caylent', `${locale} Caylent source disclosure`);
  mustContainText(statsHtml, 'AWS Builder Center', `${locale} AWS Builder Center source disclosure`);
  for (const phrase of locale === 'en'
    ? ['Translations count separately', 'Matching titles in the same language count once', 'partial coverage']
    : ['Las traducciones se cuentan por separado', 'Los títulos iguales en el mismo idioma se cuentan una sola vez', 'cobertura parcial']) {
    mustContainText(statsHtml, phrase, `${locale} counting disclosure: ${phrase}`);
  }
  mustContainText(statsHtml, locale === 'en'
    ? 'Talk and book languages follow their original titles'
    : 'El idioma de las charlas y los libros se determina por sus títulos originales',
  `${locale} title-language classification disclosure`);
  const disclosure = statsHtml.match(/<details\b[^>]*>[\s\S]*?<\/details>/i)?.[0] ?? statsHtml;
  if (locale === 'en') {
    assert.match(disclosure, /active\s+subscriptions?/i, 'English source disclosure names active subscriptions');
    assert.match(disclosure, /current/i, 'English source disclosure says the subscriber total is current');
    assert.match(disclosure, /Simple AWS/i, 'English source disclosure names the newsletter publication');
    assert.match(disclosure, /English/i, 'English source disclosure identifies the supported content language');
  } else {
    assert.match(disclosure, /suscripciones?\s+activas?/i, 'Spanish source disclosure names active subscriptions');
    assert.match(disclosure, /actual(?:es)?|vigentes?/i, 'Spanish source disclosure says the subscriber total is current');
    assert.match(disclosure, /Simple AWS/i, 'Spanish source disclosure names the newsletter publication');
    assert.match(disclosure, /ingl[eé]s/i, 'Spanish source disclosure identifies the supported content language');
  }
  assert.ok(!/\bdata-stats-period\b/i.test(statsHtml), `${locale} statistics must not expose a reach-period selector`);

  const selector = statsHtml.match(/<select\b(?=[^>]*\bdata-stats-language\b)[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(selector, `${locale} must use a native content-language selector`);
  const options = [...selector[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((match) => ({
    attributes: match[1],
    label: match[2].replace(/<[^>]*>/g, '').trim(),
    value: match[1].match(/\bvalue=["']([^"']+)["']/i)?.[1]
  }));
  assert.deepEqual(options.map((option) => option.value), ['all', 'en', 'es'], `${locale} content-language options`);
  const optionLabels = options.map((option) => option.label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''));
  if (locale === 'en') {
    assert.ok(/\ball\b/.test(optionLabels[0]) && optionLabels[1].includes('english') && optionLabels[2].includes('espanol'), 'English language filter labels');
  } else {
    assert.ok(/\ball\b|\btodos?\b/.test(optionLabels[0]) && /ingles|english/.test(optionLabels[1]) && optionLabels[2].includes('espanol'), 'Spanish language filter labels');
  }
  const isSelected = (option) => /(?:^|\s)selected(?:\s|=|$)/i.test(option.attributes);
  const selectedOptions = options.flatMap((option, index) => isSelected(option) ? [index] : []);
  assert.ok(selectedOptions.length === 0 || (selectedOptions.length === 1 && selectedOptions[0] === 0), `${locale} must default content language to All`);
  if (locale === 'en') {
    assert.ok(/loading/i.test(statsHtml), 'English statistics need a loading state');
    assert.ok(/unavailable|unable to load|could not load|couldn't load/i.test(statsHtml), 'English statistics need an unavailable state');
  } else {
    assert.ok(/cargando/i.test(statsHtml), 'Spanish statistics need a loading state');
    assert.ok(/no se pudo|no se pueden|no fue posible|no disponibles|no disponible/i.test(statsHtml), 'Spanish statistics need an unavailable state');
  }

  const noScriptBlocks = [...html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi)];
  assert.equal(noScriptBlocks.length, 1, `${locale} needs one stats-only no-JavaScript message`);
  const noScriptPosition = noScriptBlocks[0].index;
  assert.ok(noScriptPosition > sectionPosition && noScriptPosition < talksPosition, `${locale} no-JavaScript message must stay within the statistics section`);
  const noScriptText = noScriptBlocks[0][1].replace(/<[^>]*>/g, '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (locale === 'en') {
    assert.ok(/enable JavaScript|turn on JavaScript|JavaScript is required/i.test(noScriptText), 'English statistics need a localized no-JavaScript message');
  } else {
    assert.ok(/activar JavaScript|activa JavaScript|habilita JavaScript|JavaScript es necesario/i.test(noScriptText), 'Spanish statistics need a localized no-JavaScript message');
  }

  const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
  assert.equal(scriptTags.length, 1, `${locale} may load one statistics module`);
  assert.ok(/\btype=["']module["']/i.test(scriptTags[0]), `${locale} statistics script must be an external module`);
  const scriptPath = scriptTags[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
  assert.ok(scriptPath?.startsWith('/_astro/'), `${locale} statistics module must use a built asset`);
  assert.ok(existsSync(join(dist, decodeURIComponent(scriptPath.slice(1)))), `${locale} statistics module asset must exist in the build output`);
}

const pages = [
  { path: 'index.html', lang: 'en', canonical: new URL('/', siteUrl).href, otherLocale: '/es/' },
  { path: 'es/index.html', lang: 'es', canonical: new URL('/es/', siteUrl).href, otherLocale: '/' }
];

for (const page of pages) {
  const html = read(page.path);
  mustContain(html, `<html lang="${page.lang}">`, `${page.lang} language attribute`);
  mustContain(html, `<link rel="canonical" href="${page.canonical}">`, `${page.lang} canonical URL`);
  mustContain(html, `<link rel="alternate" hreflang="en" href="${new URL('/', siteUrl).href}">`);
  mustContain(html, `<link rel="alternate" hreflang="es" href="${new URL('/es/', siteUrl).href}">`);
  mustContain(html, `<a class="lang-toggle" href="${page.otherLocale}"`);
  for (const section of ['work', 'talks', 'about']) mustContain(html, `id="${section}"`, `${page.lang} ${section} section`);
  mustContain(html, 'src="/images/guille-portrait.jpg"', `${page.lang} local portrait`);
  mustNotContain(html, 'unicorn-images.b-cdn.net', `${page.lang} remote portrait runtime URL`);
  mustNotContain(html, 'design preview', `${page.lang} prototype label`);
  mustNotContain(html, 'consulting', `${page.lang} consulting claim`);
  mustNotContain(html, 'consultoría', `${page.lang} consulting claim`);
  mustNotContain(html, 'buy now', `${page.lang} purchase CTA`);
  mustNotContain(html, 'purchase now', `${page.lang} purchase CTA`);
  mustNotContain(html, 'current sales', `${page.lang} sales claim`);
  mustNotContain(html, 'built as a simple, bilingual static site', `${page.lang} implementation-detail footer`);
  mustNotContain(html, 'un sitio estático, simple y bilingüe', `${page.lang} implementation-detail footer`);
  mustContain(html, 'https://www.linkedin.com/in/guilleojeda', `${page.lang} LinkedIn link`);
  mustContain(html, 'https://www.passionfroot.me/guilleojeda', `${page.lang} sponsorship link`);
  checkContentStatsShell(page, html);

  const featuredProjectCards = html.match(/class="support-card"/g) ?? [];
  const archivedProjectRows = html.match(/class="talk-archive-item work-archive-item"/g) ?? [];
  assert.equal(featuredProjectCards.length, projects.filter((project) => project.featured).length, `${page.lang} featured project count`);
  assert.equal(archivedProjectRows.length, projects.filter((project) => !project.featured).length, `${page.lang} archived project count`);
  for (const project of projects) mustContainText(html, project.title[page.lang], `${page.lang} project ${project.id}`);
  for (const book of books) {
    mustContainText(html, book.title[page.lang], `${page.lang} book title ${book.id}`);
    mustContainText(html, book.text[page.lang], `${page.lang} book text ${book.id}`);
    mustContainText(html, book.meta[page.lang], `${page.lang} book metadata ${book.id}`);
  }
  for (const activity of profile.about.activities) {
    mustContainText(html, activity.title[page.lang], `${page.lang} activity title ${activity.id}`);
    mustContainText(html, activity.text[page.lang], `${page.lang} activity text ${activity.id}`);
  }

  const archiveItems = html.match(/class="talk-archive-item"/g) ?? [];
  assert.equal(archiveItems.length, talks.length, `${page.lang} archive item count`);
  const yearGroups = html.match(/class="talk-year-group"/g) ?? [];
  assert.equal(yearGroups.length, new Set(talks.map((talk) => talk.year)).size, `${page.lang} archive year count`);
  for (const talk of talks) mustContainText(html, talk.title[page.lang], `${page.lang} archive item ${talk.id}`);
}

const notFound = read('404.html');
mustContain(notFound, '<meta name="robots" content="noindex">', '404 noindex metadata');
mustNotContain(notFound, '<link rel="canonical"', '404 canonical metadata');
mustContain(notFound, 'href="/"', '404 English recovery link');
mustContain(notFound, 'href="/es/"', '404 Spanish recovery link');

const inputs = JSON.parse(read('_content-stats/inputs.json'));
const sourceConfig = JSON.parse(readFileSync(join(root, 'public/_content-stats/inputs.json'), 'utf8'));
const hasNewsletterSelection = Object.hasOwn(inputs, 'newsletter');
assert.deepEqual(Object.keys(inputs).sort(), hasNewsletterSelection
  ? ['curated', 'definitionVersion', 'newsletter', 'schemaVersion', 'sources']
  : ['curated', 'definitionVersion', 'schemaVersion', 'sources'],
'protected build input must combine source configuration and maintained facts without credentials');
assert.equal(inputs.schemaVersion, hasNewsletterSelection ? 4 : 3, 'protected build input schema version');
assert.equal(inputs.definitionVersion, 1, 'protected build input definition version');
assert.ok(Array.isArray(inputs.sources), 'protected build input sources must be an array');
if (hasNewsletterSelection) {
  assert.ok(sourceConfig.newsletter, 'newsletter build input must come from a maintained newsletter selection');
  assert.deepEqual(Object.keys(sourceConfig.newsletter).sort(), ['id', 'language', 'publicationId'], 'maintained newsletter selection must contain only its identity and content language');
  assert.equal(sourceConfig.newsletter.id, 'simple-aws', 'maintained newsletter selection must name Simple AWS');
  assert.equal(sourceConfig.newsletter.language, 'en', 'Simple AWS initial content-language policy');
  assert.ok(typeof sourceConfig.newsletter.publicationId === 'string' && sourceConfig.newsletter.publicationId.trim() !== '', 'maintained newsletter selection must contain a publication ID');
  assert.deepEqual(inputs.newsletter, sourceConfig.newsletter, 'newsletter build input must project the exact maintained publication selection');
} else {
  assert.ok(!Object.hasOwn(sourceConfig, 'newsletter'), 'schema-v3 output must match a source configuration without a newsletter selection');
}
assert.deepEqual(inputs.sources.map((source) => source?.id).sort(), ['builder-center', 'caylent'], 'protected build input must contain exactly the approved article sources');
const caylentSource = inputs.sources.find((source) => source.id === 'caylent');
assert.deepEqual(Object.keys(caylentSource).sort(), ['apiKey', 'authorId', 'id', 'language', 'originality'], 'Caylent input must contain only its public delivery key and counting configuration');
assert.equal(caylentSource.authorId, 'b5b5065ade8c42a6919ca40d1239b37c', 'protected input must keep the configured Caylent author');
assert.ok(typeof caylentSource.apiKey === 'string' && caylentSource.apiKey.length > 0, 'Caylent public delivery key must be configured');
assert.equal(caylentSource.language, 'en', 'Caylent content-language policy');
assert.equal(caylentSource.originality, 'original', 'Caylent source must use its confirmed originality policy');
const builderCenterSource = inputs.sources.find((source) => source.id === 'builder-center');
assert.deepEqual(Object.keys(builderCenterSource).sort(), ['authorId', 'id'], 'Builder Center input must not contain credentials');
assert.equal(builderCenterSource.authorId, '251f1678-ab8f-4f22-afb9-1ee13511c7ee', 'protected input must keep the configured Builder Center author');
assert.deepEqual(Object.keys(inputs.curated).sort(), ['books', 'talks'], 'only the two maintained metric families belong in curated input');
const expectedTalkFacts = talks.flatMap((talk) => {
  assert.ok(Array.isArray(talk.occurrences), `${talk.id} needs explicit occurrence metadata`);
  return talk.occurrences.map((occurrence) => ({
    id: `${talk.id}/${occurrence.id}`,
    kind: occurrence.kind,
    status: occurrence.status,
    language: occurrence.language
  }));
});
const expectedBookFacts = books.map((book) => {
  assert.ok(book.publication, `${book.id} needs explicit publication metadata`);
  return { id: book.id, status: book.publication.status, language: book.publication.language };
});
assert.deepEqual(inputs.curated.talks, expectedTalkFacts, 'built speaking facts must come from the complete maintained inventory once, not highlights plus archive or a copied catalog');
assert.deepEqual(inputs.curated.books, expectedBookFacts, 'built book facts must come from the maintained book records');
for (const fact of inputs.curated.talks) {
  assert.deepEqual(Object.keys(fact).sort(), ['id', 'kind', 'language', 'status'], 'speaking inputs project facts without prose, titles, URLs or reach data');
}
for (const fact of inputs.curated.books) {
  assert.deepEqual(Object.keys(fact).sort(), ['id', 'language', 'status'], 'book inputs project publication facts only');
}
assert.ok(!existsSync(join(dist, 'content-stats/v1/current.json')), 'the build must not contain a placeholder or collector-owned public aggregate');

console.log('Static output checks passed for /, /es/, and /404.html.');
