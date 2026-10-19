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

function extractElement(html, tagName, attributeName, attributeValue) {
  const tagPattern = tagName ?? '[a-z][a-z0-9:-]*';
  const valueMatcher = attributeValue === undefined
    ? ''
    : `(?=[^>]*\\b${attributeName}=["']${attributeValue}["'])`;
  const opening = new RegExp(`<(${tagPattern})\\b(?=[^>]*\\b${attributeName}(?:\\s|=|>))${valueMatcher}[^>]*>`, 'i');
  const match = opening.exec(html);
  if (!match) return null;

  const start = match.index;
  const matchedTag = match[1];
  const tokenPattern = new RegExp(`<\\/?${matchedTag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = start;
  let depth = 0;
  for (const token of html.matchAll(tokenPattern)) {
    const isClosing = /^<\//.test(token[0]);
    const isSelfClosing = /\/>$/.test(token[0]);
    if (isClosing) depth -= 1;
    else if (!isSelfClosing) depth += 1;
    if (depth === 0) {
      const end = token.index + token[0].length;
      return { html: html.slice(start, end), start, end };
    }
  }
  return null;
}

function normalizedText(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
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
  const newsletterCardElement = extractElement(statsHtml, 'article', 'data-stats-kind', 'newsletter');
  const newsletterCard = newsletterCardElement?.html;
  assert.ok(newsletterCard, `${locale} newsletter must have a distinct accessible card`);
  const newsletterHeading = newsletterCard.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  const newsletterCardText = newsletterCard.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (locale === 'en') assert.match(newsletterHeading, /newsletter/i, 'English newsletter card heading');
  else assert.match(newsletterHeading, /newsletter|bolet.n|suscriptores?/i, 'Spanish newsletter card heading');
  if (locale === 'en') assert.match(newsletterCardText, /current|currently/i, 'English newsletter card labels its total as current');
  else assert.match(newsletterCardText, /actual(?:es|mente)?|vigentes?/i, 'Spanish newsletter card labels its total as current');
  mustNotContain(newsletterCard, locale === 'en' ? 'cumulative' : 'total acumulado', `${locale} newsletter card must not label current subscribers as a cumulative total`);
  for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
    const card = extractElement(statsHtml, 'article', 'data-stats-kind', kind)?.html;
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
  const disclosureText = normalizedText(disclosure);
  if (locale === 'en') {
    assert.match(disclosureText, /simple aws[\s\S]*views?|views?[\s\S]*simple aws/i, 'English disclosure connects views to Simple AWS');
    assert.match(disclosureText, /page views?|repeated views?|views? can repeat/i, 'English disclosure explains that views can repeat');
    assert.match(disclosureText, /partial[\s\S]{0,100}(coverage|scope)|coverage[\s\S]{0,100}partial/i, 'English disclosure identifies partial views coverage');
    assert.match(disclosureText, /views?[\s\S]{0,100}(coverage|scope)[\s\S]{0,100}(count|article)|count[\s\S]{0,100}views?/i, 'English disclosure distinguishes count and views coverage');
    assert.match(disclosureText, /delay|lag|not immediately current/i, 'English disclosure explains reporting delay');
    assert.match(disclosureText, /revis|updated later|can change/i, 'English disclosure explains later revisions');
  } else {
    assert.match(disclosureText, /simple aws[\s\S]*vistas?|vistas?[\s\S]*simple aws/i, 'Spanish disclosure connects views to Simple AWS');
    assert.match(disclosureText, /vistas? de paginas?|visitas? repetidas?|se pueden repetir/i, 'Spanish disclosure explains that views can repeat');
    assert.match(disclosureText, /cobertura parcial|parcial[\s\S]{0,100}cobertura/i, 'Spanish disclosure identifies partial views coverage');
    assert.match(disclosureText, /vistas?[\s\S]{0,100}(cobertura|alcance)[\s\S]{0,100}(conteo|articulos?)|conteo[\s\S]{0,100}vistas?/i, 'Spanish disclosure distinguishes count and views coverage');
    assert.match(disclosureText, /demora|retras|tardar|no refleja.{0,30}inmediato/i, 'Spanish disclosure explains reporting delay');
    assert.match(disclosureText, /revis|puede[n]? cambiar|cambiar despues/i, 'Spanish disclosure explains later revisions');
  }

  const articlesCard = extractElement(statsHtml, 'article', 'data-stats-kind', 'articles');
  assert.ok(articlesCard, `${locale} needs an Articles card for independent views`);
  const countResults = extractElement(articlesCard.html, null, 'data-stats-results');
  const viewsRegion = extractElement(articlesCard.html, null, 'data-stats-views');
  assert.ok(countResults, `${locale} Articles needs its cumulative count results`);
  assert.ok(viewsRegion, `${locale} Articles needs an independent views region`);
  assert.ok(viewsRegion.start > countResults.start && viewsRegion.start >= countResults.end, `${locale} views region must sit outside and after count results`);
  for (const field of ['status', 'results', 'value', 'coverage', 'interval', 'collected-date', 'qualifications']) {
    const attribute = `data-stats-views-${field}`;
    assert.ok(new RegExp(`\\b${attribute}(?:\\s|=|>)`, 'i').test(viewsRegion.html), `${locale} views region needs ${field}`);
  }
  const viewsStatus = extractElement(viewsRegion.html, null, 'data-stats-views-status');
  assert.ok(viewsStatus, `${locale} views region needs a status message`);
  mustContain(viewsStatus.html, 'aria-live="polite"', `${locale} views status announces changes politely`);
  if (locale === 'en') assert.match(normalizedText(viewsStatus.html), /loading.*views?/i, 'English views status has a localized loading message');
  else assert.match(normalizedText(viewsStatus.html), /cargando.*vistas?/i, 'Spanish views status has a localized loading message');
  mustContain(viewsRegion.html, 'data-stats-views-unavailable=', `${locale} views region needs localized unavailable copy`);
  const unavailableAttribute = viewsRegion.html.match(/\bdata-stats-views-unavailable=["']([^"']+)["']/i)?.[1] ?? '';
  const unavailableText = normalizedText(unavailableAttribute);
  if (locale === 'en') assert.match(unavailableText, /unavailable|not available/i, 'English views unavailable copy is meaningful');
  else assert.match(unavailableText, /no disponibles?|no disponible|no se pueden/i, 'Spanish views unavailable copy is meaningful');

  const periodSelector = statsHtml.match(/<select\b(?=[^>]*\bdata-stats-period\b)[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(periodSelector, `${locale} needs a native article-views period selector`);
  const periodSelectorTag = periodSelector[0].match(/^<select\b([^>]*)>/i)?.[1] ?? '';
  const periodOptions = [...periodSelector[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((option) => ({
    attributes: option[1],
    label: normalizedText(option[2]),
    value: option[1].match(/\bvalue=["']([^"']+)["']/i)?.[1]
  }));
  assert.deepEqual(periodOptions.map((option) => option.value), ['7d', '30d', '90d', '12m', 'ytd', 'total'], `${locale} views period values`);
  const periodLabels = periodOptions.map((option) => option.label);
  if (locale === 'en') {
    assert.match(periodLabels[0], /7\s+days?/);
    assert.match(periodLabels[1], /30\s+days?/);
    assert.match(periodLabels[2], /90\s+days?/);
    assert.match(periodLabels[3], /12\s+months?/);
    assert.match(periodLabels[4], /year\s+to\s+date/);
    assert.match(periodLabels[5], /recorded\s+total/);
  } else {
    assert.match(periodLabels[0], /7\s+dias?/);
    assert.match(periodLabels[1], /30\s+dias?/);
    assert.match(periodLabels[2], /90\s+dias?/);
    assert.match(periodLabels[3], /12\s+mes(?:es)?/);
    assert.match(periodLabels[4], /ano\s+(?:hasta\s+la\s+fecha|a\s+la\s+fecha)/);
    assert.match(periodLabels[5], /total\s+registrado/);
  }
  const selectedPeriods = periodOptions.flatMap((option, index) => /(?:^|\s)selected(?:\s|=|$)/i.test(option.attributes) ? [index] : []);
  assert.deepEqual(selectedPeriods, [3], `${locale} views default to twelve months`);
  const totalOption = periodOptions[5];
  assert.match(totalOption.attributes, /(?:^|\s)disabled(?:\s|=|$)/i, `${locale} recorded total starts disabled without a source aggregate at build time`);
  const periodId = periodSelectorTag.match(/\bid=["']([^"']+)["']/i)?.[1];
  assert.ok(periodId, `${locale} views period control needs an ID for its native label`);
  const periodLabel = statsHtml.match(new RegExp(`<label\\b(?=[^>]*\\bfor=["']${periodId}["'])[^>]*>([\\s\\S]*?)<\\/label>`, 'i'))?.[1] ?? '';
  assert.ok(periodLabel, `${locale} views period control needs a native label`);
  if (locale === 'en') assert.match(normalizedText(periodLabel), /views|period/i, 'English period label describes views or their period');
  else assert.match(normalizedText(periodLabel), /vistas|periodo/i, 'Spanish period label describes views or their period');

  const selector = statsHtml.match(/<select\b(?=[^>]*\bdata-stats-language\b)[^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(selector, `${locale} must use a native content-language selector`);
  const languageSelectorId = selector[0].match(/^<select\b[^>]*\bid=["']([^"']+)["']/i)?.[1];
  assert.ok(languageSelectorId, `${locale} content-language control needs an ID for its native label`);
  const languageLabel = statsHtml.match(new RegExp(`<label\\b(?=[^>]*\\bfor=["']${languageSelectorId}["'])[^>]*>([\\s\\S]*?)<\\/label>`, 'i'))?.[1] ?? '';
  assert.ok(languageLabel, `${locale} content-language control needs a native label`);
  if (locale === 'en') assert.match(normalizedText(languageLabel), /content language/i, 'English language filter label is clear');
  else assert.match(normalizedText(languageLabel), /idioma del contenido/i, 'Spanish language filter label is clear');
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

  for (const forbidden of ['373694636', '5153208352', 'oauth2.googleapis.com', 'analyticsdata.googleapis.com', 'clientSecret', 'refreshToken', 'accessToken', 'propertyId', 'streamId']) {
    mustNotContain(statsHtml, forbidden, `${locale} public statistics must not expose provider identifiers, URLs or credentials`);
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
const hasAnalyticsSelection = Object.hasOwn(inputs, 'analytics');
assert.deepEqual(Object.keys(inputs).sort(), [
  'curated',
  'definitionVersion',
  ...(hasNewsletterSelection ? ['newsletter'] : []),
  ...(hasAnalyticsSelection ? ['analytics'] : []),
  'schemaVersion',
  'sources'
].sort(),
'protected build input must combine source configuration and maintained facts without credentials');
assert.equal(inputs.schemaVersion, hasAnalyticsSelection ? 5 : hasNewsletterSelection ? 4 : 3, 'protected build input schema version');
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
if (hasAnalyticsSelection) {
  assert.ok(hasNewsletterSelection, 'views inputs must retain the Newsletter publication selection');
  assert.ok(sourceConfig.analytics, 'views build input must come from a maintained analytics selection');
  const analyticsKeys = Object.keys(sourceConfig.analytics).sort();
  assert.deepEqual(analyticsKeys, ['articlePathPattern', 'hostname', 'id', 'language', 'propertyId', 'timeZone'].concat(
    Object.hasOwn(sourceConfig.analytics, 'recordedSince') ? ['recordedSince'] : []
  ).sort(), 'maintained analytics selection must contain only approved source and interval configuration');
  assert.equal(sourceConfig.analytics.id, 'simple-aws', 'maintained analytics selection must name Simple AWS');
  assert.equal(sourceConfig.analytics.propertyId, '373694636', 'maintained analytics selection must use the approved property');
  assert.equal(sourceConfig.analytics.language, 'en', 'Simple AWS initial content-language policy');
  assert.equal(sourceConfig.analytics.hostname, 'newsletter.simpleaws.dev', 'views selection must scope the approved publication host');
  assert.equal(sourceConfig.analytics.articlePathPattern, '/p/[^/]+/?', 'views selection must scope full article paths');
  assert.ok(typeof sourceConfig.analytics.timeZone === 'string' && sourceConfig.analytics.timeZone.trim(), 'views selection must include the verified source timezone');
  if (Object.hasOwn(sourceConfig.analytics, 'recordedSince')) assert.match(sourceConfig.analytics.recordedSince, /^\d{4}-\d{2}-\d{2}$/, 'recorded total needs a configured start date');
  assert.deepEqual(inputs.analytics, sourceConfig.analytics, 'views build input must project the exact maintained analytics selection');
} else {
  assert.ok(!Object.hasOwn(sourceConfig, 'analytics'), 'schema-v3/v4 output must match a source configuration without analytics');
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

const policyPages = [
  {
    path: 'content-statistics/privacy/index.html',
    lang: 'en',
    canonicalPath: '/content-statistics/privacy/',
    alternatePath: '/es/content-statistics/privacy/',
    title: 'Statistics privacy and use · Guille Ojeda',
    description: 'How Guille Ojeda’s private content statistics tool uses Google Analytics and publishes totals.',
    heading: 'Statistics privacy and use',
    privacy: 'Privacy',
    use: 'Use',
    skipLabel: 'Skip to privacy',
    homePath: '/'
  },
  {
    path: 'es/content-statistics/privacy/index.html',
    lang: 'es',
    canonicalPath: '/es/content-statistics/privacy/',
    alternatePath: '/content-statistics/privacy/',
    title: 'Privacidad y uso de las estadísticas · Guille Ojeda',
    description: 'Cómo se usan Google Analytics y se publican los totales en la herramienta privada de estadísticas de contenido de Guille Ojeda.',
    heading: 'Privacidad y uso de las estadísticas',
    privacy: 'Privacidad',
    use: 'Uso',
    skipLabel: 'Ir a privacidad',
    homePath: '/es/'
  }
];

for (const page of policyPages) {
  const html = read(page.path);
  const canonical = new URL(page.canonicalPath, siteUrl).href;
  const alternate = new URL(page.alternatePath, siteUrl).href;
  const englishPath = page.lang === 'en' ? canonical : alternate;
  const spanishPath = page.lang === 'es' ? canonical : alternate;
  mustContain(html, `<html lang="${page.lang}">`, `${page.lang} privacy-page language`);
  mustContain(html, `<title>${page.title}</title>`, `${page.lang} privacy-page title`);
  mustContain(html, `<meta name="description" content="${page.description}">`, `${page.lang} privacy-page description`);
  mustContain(html, `<link rel="canonical" href="${canonical}">`, `${page.lang} privacy-page canonical`);
  mustContain(html, `<link rel="alternate" hreflang="en" href="${englishPath}">`, `${page.lang} privacy-page English alternate`);
  mustContain(html, `<link rel="alternate" hreflang="es" href="${spanishPath}">`, `${page.lang} privacy-page Spanish alternate`);
  mustContain(html, `<link rel="alternate" hreflang="x-default" href="${englishPath}">`, `${page.lang} privacy-page default alternate`);
  mustContain(html, `<a class="lang-toggle" href="${page.alternatePath}"`, `${page.lang} privacy-page language switch stays on this page`);
  mustContainText(html, page.heading, `${page.lang} privacy-page heading`);
  mustContainText(html, page.privacy, `${page.lang} privacy section heading`);
  mustContainText(html, page.use, `${page.lang} use section heading`);
  const privacySection = extractElement(html, 'section', 'id', 'privacy');
  const useSection = extractElement(html, 'section', 'id', 'use');
  assert.ok(privacySection, `${page.lang} privacy section has a stable #privacy target`);
  assert.ok(useSection, `${page.lang} use section has a stable #use target`);
  const skipLink = html.match(/<a class="skip-link" href="([^"]+)">([^<]*)<\/a>/i);
  assert.ok(skipLink, `${page.lang} privacy page has a skip link`);
  assert.equal(skipLink[1], '#privacy', `${page.lang} privacy skip link targets this page`);
  assert.equal(skipLink[2], page.skipLabel, `${page.lang} privacy skip link label`);
  assert.match(privacySection.html, /tabindex="-1"/, `${page.lang} privacy skip target can receive focus`);
  assert.ok(privacySection.start < useSection.start, `${page.lang} Privacy section comes before Use`);
  mustContain(html, '<header class="site-header">', `${page.lang} policy uses the shared header`);
  mustContain(html, '<footer class="site-footer">', `${page.lang} policy uses the shared footer`);

  const homeHtml = read(page.homePath === '/' ? 'index.html' : 'es/index.html');
  const homeSkipLink = homeHtml.match(/<a class="skip-link" href="([^"]+)">([^<]*)<\/a>/i);
  assert.equal(homeSkipLink?.[1], '#work', `${page.lang} home keeps its original skip target`);
  const statsDetails = extractElement(homeHtml, 'details', 'class', 'content-stats-sources');
  assert.ok(statsDetails, `${page.lang} home retains the statistics disclosure`);
  mustContain(statsDetails.html, `href="${page.canonicalPath}"`, `${page.lang} statistics disclosure links to its privacy page`);
}

console.log('Static output checks passed for both content-statistics privacy routes.');
