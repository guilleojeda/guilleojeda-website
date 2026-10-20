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
  const sourcesDisclosure = extractElement(statsHtml, 'details', 'class', 'content-stats-sources');
  assert.ok(sourcesDisclosure, `${locale} statistics need the source and counting disclosure`);
  const sourcesCopy = normalizedText(sourcesDisclosure.html);
  if (locale === 'en') {
    assert.match(sourcesCopy, /recorded totals?.{0,80}available activity.{0,100}displayed start date/,
      'English recorded totals identify the available-history start shown');
    assert.match(sourcesCopy, /earlier activity.{0,80}gaps? in tracking.{0,40}may be missing/,
      'English recorded-total disclosure warns that earlier activity and tracking gaps may be missing');
  } else {
    assert.match(sourcesCopy, /totales registrados.{0,80}actividad disponible.{0,100}fecha indicada/,
      'Spanish recorded totals identify the available-history start shown');
    assert.match(sourcesCopy, /puede faltar actividad anterior.{0,100}periodos? sin seguimiento/,
      'Spanish recorded-total disclosure warns that earlier activity and tracking gaps may be missing');
  }

  const cardKinds = [...statsHtml.matchAll(/\bdata-stats-kind=["']([^"']+)["']/gi)].map((match) => match[1]);
  assert.equal(cardKinds.length, 5, `${locale} statistics add one separate Dónde Aprendo AWS card`);
  assert.deepEqual(cardKinds.filter((kind) => ['articles', 'talks', 'books', 'newsletter'].includes(kind)),
    ['articles', 'talks', 'books', 'newsletter'], `${locale} statistics retain the existing four content groups`);
  assert.equal(cardKinds.filter((kind) => kind === 'directory-views').length, 1, `${locale} has exactly one directory Views card`);
  mustContain(statsHtml, 'data-stats-kind="articles"', `${locale} Articles card`);
  mustContainText(statsHtml, locale === 'en' ? 'Articles' : 'Artículos', `${locale} Articles card title`);
  mustContainText(statsHtml, locale === 'en' ? 'Talks & sessions' : 'Charlas y sesiones', `${locale} speaking card title`);
  mustContainText(statsHtml, locale === 'en' ? 'Books' : 'Libros', `${locale} books card title`);
  const directoryViewsCard = extractElement(statsHtml, 'article', 'data-stats-kind', 'directory-views')?.html;
  assert.ok(directoryViewsCard, `${locale} needs a separate Dónde Aprendo AWS page-views card`);
  mustContainText(directoryViewsCard, 'Dónde Aprendo AWS', `${locale} directory card identity`);
  const directoryCardText = normalizedText(directoryViewsCard);
  if (locale === 'en') assert.match(directoryCardText, /page views?/, 'English directory unit identifies page views');
  else assert.match(directoryCardText, /vistas? de paginas?/, 'Spanish directory unit identifies page views');
  for (const field of ['status', 'results', 'value', 'unit', 'coverage', 'interval', 'collected-date', 'qualifications']) {
    assert.ok(directoryViewsCard.includes(`data-stats-directory-views-${field}`), `${locale} directory page views need ${field}`);
  }
  assert.equal(directoryViewsCard.includes('data-stats-count'), false, `${locale} directory page views are a period metric, not a count card`);
  const directoryViewsStatus = extractElement(directoryViewsCard, null, 'data-stats-directory-views-status');
  assert.ok(directoryViewsStatus, `${locale} directory Views needs its own loading/unavailable status`);
  mustContain(directoryViewsStatus.html, 'role="status"', `${locale} directory status has a status role`);
  mustContain(directoryViewsStatus.html, 'aria-live="polite"', `${locale} directory status announces updates politely`);
  const directoryViewsStatusText = normalizedText(directoryViewsStatus.html);
  if (locale === 'en') assert.match(directoryViewsStatusText, /loading.*views?/i, 'English directory Views status has localized loading copy');
  else assert.match(directoryViewsStatusText, /cargando.*vistas?/i, 'Spanish directory Views status has localized loading copy');
  const directoryUnavailable = directoryViewsCard.match(/data-stats-directory-views-unavailable=["']([^"']+)["']/i)?.[1] ?? '';
  const directoryUnavailableText = normalizedText(directoryUnavailable);
  if (locale === 'en') assert.match(directoryUnavailableText, /unavailable|not available/i, 'English directory Views unavailable copy is meaningful');
  else assert.match(directoryUnavailableText, /no disponibles?|no disponible|no se pueden/i, 'Spanish directory Views unavailable copy is meaningful');
  const directoryOutboundClicks = extractElement(directoryViewsCard, null, 'data-stats-directory-outbound-clicks');
  assert.ok(directoryOutboundClicks, `${locale} directory clicks must be rendered in the existing directory card`);
  for (const field of ['status', 'results', 'value', 'unit', 'coverage', 'interval', 'collected-date', 'qualifications']) {
    assert.ok(directoryOutboundClicks.html.includes(`data-stats-directory-outbound-clicks-${field}`),
      `${locale} directory outbound clicks need ${field}`);
  }
  const clickRegionText = normalizedText(directoryOutboundClicks.html);
  if (locale === 'en') assert.match(clickRegionText, /external link clicks?/, 'English directory metric names external-link clicks');
  else assert.match(clickRegionText, /clics? en enlaces externos/, 'Spanish directory metric names external-link clicks');
  const clickStatus = extractElement(directoryOutboundClicks.html, null, 'data-stats-directory-outbound-clicks-status');
  assert.ok(clickStatus, `${locale} directory clicks need their own loading/unavailable status`);
  mustContain(clickStatus.html, 'role="status"', `${locale} click status has a status role`);
  mustContain(clickStatus.html, 'aria-live="polite"', `${locale} click status announces updates politely`);
  const clickStatusText = normalizedText(clickStatus.html);
  if (locale === 'en') assert.match(clickStatusText, /loading.*clicks?/, 'English click status has localized loading copy');
  else assert.match(clickStatusText, /cargando.*clics?/, 'Spanish click status has localized loading copy');
  const clickUnavailable = directoryViewsCard.match(/data-stats-directory-outbound-clicks-unavailable=["']([^"']+)["']/i)?.[1] ?? '';
  const clickUnavailableText = normalizedText(clickUnavailable);
  if (locale === 'en') assert.match(clickUnavailableText, /unavailable|not available/, 'English directory click unavailable copy is meaningful');
  else assert.match(clickUnavailableText, /no disponibles?|no disponible|no se pueden/, 'Spanish directory click unavailable copy is meaningful');
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
  const articleCountDisclosure = disclosureText.split(/[.!?]/).find((sentence) =>
    /Simple AWS/i.test(sentence)
      && (locale === 'en' ? /article\s+counts?|counts?\s+(?:of\s+)?articles/i : /conteo\s+de\s+art[ií]culos|art[ií]culos\s+(?:contados|incluyen)/i).test(sentence));
  assert.ok(articleCountDisclosure, `${locale} disclosure connects Simple AWS to article-count coverage`);
  assert.match(articleCountDisclosure, /\bweb\b/i, `${locale} Simple AWS count disclosure includes web posts`);
  assert.match(articleCountDisclosure, locale === 'en' ? /\bemail\b|e-mail/i : /correo(?:\s+electr[oó]nico)?|email/i,
    `${locale} Simple AWS count disclosure includes email posts`);
  const cloudyThingsCountDisclosure = disclosureText.split(/[.!?]/).find((sentence) =>
    /Cloudy Things/i.test(sentence)
      && (locale === 'en' ? /article\s+counts?|counts?\s+(?:of\s+)?articles/i : /conteo\s+de\s+art[ií]culos|art[ií]culos\s+(?:contados|incluyen)/i).test(sentence));
  assert.ok(cloudyThingsCountDisclosure, `${locale} disclosure connects Cloudy Things to article-count coverage`);
  assert.match(cloudyThingsCountDisclosure, locale === 'en' ? /\bcan\b|\bmay\b/ : /\bpuede\b|\bpueden\b/,
    `${locale} Cloudy Things count disclosure describes optional coverage`);
  assert.match(disclosureText, /donde aprendo aws/i, `${locale} source disclosure identifies the directory measured by its own Views card`);
  if (locale === 'en') {
    assert.match(disclosureText, /page views?/i, 'English disclosure identifies directory page views');
    assert.match(disclosureText, /full (?:directory|site)|entire (?:directory|website)|all (?:directory )?pages/i, 'English disclosure defines full-directory coverage');
    assert.match(disclosureText, /repeat|more than once|same person|multiple times/i, 'English disclosure makes clear that page views can repeat');
  } else {
    assert.match(disclosureText, /vistas? de paginas?/i, 'Spanish disclosure identifies directory page views');
    assert.match(disclosureText, /directorio completo|todas las paginas|sitio completo|todo el sitio/i, 'Spanish disclosure defines full-directory coverage');
    assert.match(disclosureText, /repetid|varias veces|misma persona/i, 'Spanish disclosure makes clear that page views can repeat');
  }
  const searchDisclosureParagraph = [...disclosure.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalizedText(match[1]))
    .find((paragraph) => /search console/i.test(paragraph));
  assert.ok(searchDisclosureParagraph, `${locale} disclosure needs a Search Console explanation`);
  if (locale === 'en') {
    assert.match(disclosureText, /simple aws[\s\S]*views?|views?[\s\S]*simple aws/i, 'English disclosure connects views to Simple AWS');
    assert.match(disclosureText, /page views?|repeated views?|views? can repeat/i, 'English disclosure explains that views can repeat');
    assert.match(disclosureText, /partial[\s\S]{0,100}(coverage|scope)|coverage[\s\S]{0,100}partial/i, 'English disclosure identifies partial views coverage');
    assert.match(disclosureText, /views?[\s\S]{0,100}(coverage|scope)[\s\S]{0,100}(count|article)|count[\s\S]{0,100}views?/i, 'English disclosure distinguishes count and views coverage');
    assert.match(disclosureText, /delay|lag|not immediately current/i, 'English disclosure explains reporting delay');
    assert.match(disclosureText, /revis|updated later|can change/i, 'English disclosure explains later revisions');
    assert.match(searchDisclosureParagraph, /simple aws/i, 'English disclosure connects Search clicks to Simple AWS');
    assert.match(searchDisclosureParagraph, /clicks?/, 'English disclosure identifies Search Console clicks');
    assert.match(searchDisclosureParagraph, /partial|may omit|can omit|filtering|reporting limits/i, 'English disclosure identifies Search clicks as partial');
    assert.match(searchDisclosureParagraph, /canonical.{0,120}(article|url)|(article|url).{0,120}canonical|google.{0,80}(preferred|selected).{0,80}(article|url)/i, 'English disclosure limits Search to canonical or Google-preferred article URLs');
    assert.match(searchDisclosureParagraph, /not unique (people|visitors|readers)|(?:aren't|are not|do not represent) (?:unique )?(?:people|visitors|readers)|not (?:a count of )?(?:unique )?(?:people|visitors|readers)/i, 'English disclosure says clicks do not represent unique people');
    assert.match(searchDisclosureParagraph, /not (?:added to|combined with|summed with)|shown separately|kept separate|separate from|distinct from/i, 'English disclosure keeps Search clicks separate from views');
    assert.match(searchDisclosureParagraph, /views?|analytics/i, 'English separation statement names the existing views metric');
  } else {
    assert.match(disclosureText, /simple aws[\s\S]*vistas?|vistas?[\s\S]*simple aws/i, 'Spanish disclosure connects views to Simple AWS');
    assert.match(disclosureText, /vistas? de paginas?|visitas? repetidas?|se pueden repetir/i, 'Spanish disclosure explains that views can repeat');
    assert.match(disclosureText, /cobertura parcial|parcial[\s\S]{0,100}cobertura/i, 'Spanish disclosure identifies partial views coverage');
    assert.match(disclosureText, /vistas?[\s\S]{0,100}(cobertura|alcance)[\s\S]{0,100}(conteo|articulos?)|conteo[\s\S]{0,100}vistas?/i, 'Spanish disclosure distinguishes count and views coverage');
    assert.match(disclosureText, /demora|retras|tardar|no refleja.{0,30}inmediato/i, 'Spanish disclosure explains reporting delay');
    assert.match(disclosureText, /revis|puede[n]? cambiar|cambiar despues/i, 'Spanish disclosure explains later revisions');
    assert.match(searchDisclosureParagraph, /simple aws/i, 'Spanish disclosure connects Search clicks to Simple AWS');
    assert.match(searchDisclosureParagraph, /clics?/, 'Spanish disclosure identifies Search Console clicks');
    assert.match(searchDisclosureParagraph, /parcial|puede omitir|puede excluir|filtra|filtrado|limites? de (?:datos|informe)/i, 'Spanish disclosure identifies Search clicks as partial');
    assert.match(searchDisclosureParagraph, /canonicas?.{0,120}(articulos?|url)|(?:articulos?|url).{0,120}canonicas?|google.{0,80}(?:preferida|seleccionada|preferidos|seleccionados).{0,80}(?:articulo|url)/i, 'Spanish disclosure limits Search to canonical or Google-preferred article URLs');
    assert.match(searchDisclosureParagraph, /no (?:son|representan|identifican) (?:personas|visitantes|lectores) unic[oa]s|no representan a personas unicas/i, 'Spanish disclosure says clicks do not represent unique people');
    assert.match(searchDisclosureParagraph, /no se (?:suman|combinan|agregan)|se muestran por separado|se mantienen separad[oa]s?|separad[oa]s? de|distint[oa]s? de/i, 'Spanish disclosure keeps Search clicks separate from views');
    assert.match(searchDisclosureParagraph, /vistas?|analytics/i, 'Spanish separation statement names the existing views metric');
  }
  const directoryOutboundDisclosure = [...disclosure.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => normalizedText(match[1]))
    .find((paragraph) => /donde aprendo aws/i.test(paragraph)
      && (locale === 'en' ? /outbound.{0,30}click|click.{0,30}outbound/i : /clic.{0,45}(?:salida|enlaces externos)|(?:salida|enlaces externos).{0,45}clic/i).test(paragraph));
  assert.ok(directoryOutboundDisclosure, `${locale} disclosure explains recorded Dónde Aprendo AWS outbound clicks`);
  if (locale === 'en') {
    assert.match(directoryOutboundDisclosure, /recorded|reported/, 'English disclosure describes source-reported clicks');
    assert.match(directoryOutboundDisclosure, /external|outbound/, 'English disclosure identifies external-link scope');
    assert.match(directoryOutboundDisclosure, /all recorded|site[- ]wide|full directory|whole directory|footer|social|publication/i,
      'English disclosure makes the broad directory link scope clear');
    assert.match(directoryOutboundDisclosure, /repeat|more than once|multiple times/, 'English disclosure says outbound clicks can repeat');
    assert.match(directoryOutboundDisclosure, /separate|not added to|not combined with/,
      'English disclosure keeps outbound clicks separate from page views');
  } else {
    assert.match(directoryOutboundDisclosure, /registrad|informad/, 'Spanish disclosure describes source-reported clicks');
    assert.match(directoryOutboundDisclosure, /enlaces externos|enlaces de salida/, 'Spanish disclosure identifies external-link scope');
    assert.match(directoryOutboundDisclosure, /todos los clics registrados|todo el directorio|pie de pagina|redes sociales|publicacion/i,
      'Spanish disclosure makes the broad directory link scope clear');
    assert.match(directoryOutboundDisclosure, /repet|varias veces|mas de una vez/, 'Spanish disclosure says outbound clicks can repeat');
    assert.match(directoryOutboundDisclosure, /separad|no se suman|no se combinan/,
      'Spanish disclosure keeps outbound clicks separate from page views');
  }

  const articlesCard = extractElement(statsHtml, 'article', 'data-stats-kind', 'articles');
  assert.ok(articlesCard, `${locale} needs an Articles card for independent views`);
  const countResults = extractElement(articlesCard.html, null, 'data-stats-results');
  const viewsRegion = extractElement(articlesCard.html, null, 'data-stats-views');
  const searchRegion = extractElement(articlesCard.html, null, 'data-stats-search');
  assert.ok(countResults, `${locale} Articles needs its cumulative count results`);
  assert.ok(viewsRegion, `${locale} Articles needs an independent views region`);
  assert.ok(viewsRegion.start > countResults.start && viewsRegion.start >= countResults.end, `${locale} views region must sit outside and after count results`);
  assert.ok(searchRegion, `${locale} Articles needs an independent Search clicks region`);
  assert.ok(searchRegion.start > countResults.start && searchRegion.start >= countResults.end, `${locale} Search region must sit outside and after count results`);
  assert.ok(searchRegion.end <= viewsRegion.start || viewsRegion.end <= searchRegion.start, `${locale} Search and Views regions must remain independent siblings`);
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

  for (const field of ['status', 'results', 'value', 'coverage', 'interval', 'collected-date']) {
    const attribute = `data-stats-search-${field}`;
    assert.ok(new RegExp(`\\b${attribute}(?:\\s|=|>)`, 'i').test(searchRegion.html), `${locale} Search region needs ${field}`);
  }
  const searchStatus = extractElement(searchRegion.html, null, 'data-stats-search-status');
  assert.ok(searchStatus, `${locale} Search region needs a status message`);
  mustContain(searchStatus.html, 'aria-live="polite"', `${locale} Search status announces changes politely`);
  const searchRegionText = normalizedText(searchRegion.html);
  if (locale === 'en') {
    assert.match(searchRegionText, /search[\s\S]{0,40}clicks?|clicks?[\s\S]{0,40}search/, 'English Search region distinguishes Search clicks from Views');
    assert.match(searchRegionText, /clicks?/, 'English Search region labels its unit');
    assert.match(normalizedText(searchStatus.html), /loading[\s\S]{0,50}(search console|search)[\s\S]{0,30}clicks?|loading[\s\S]{0,50}clicks?/, 'English Search status has a localized loading message');
  } else {
    assert.match(searchRegionText, /clics?[\s\S]{0,40}busqueda|busqueda[\s\S]{0,40}clics?/, 'Spanish Search region distinguishes Search clicks from Views');
    assert.match(searchRegionText, /clics?/, 'Spanish Search region labels its unit');
    assert.match(normalizedText(searchStatus.html), /cargando[\s\S]{0,50}(search console|busqueda)[\s\S]{0,30}clics?|cargando[\s\S]{0,50}clics?/, 'Spanish Search status has a localized loading message');
  }
  mustContain(searchRegion.html, 'data-stats-search-unavailable=', `${locale} Search region needs localized unavailable copy`);
  const searchUnavailableAttribute = searchRegion.html.match(/\bdata-stats-search-unavailable=["']([^"']+)["']/i)?.[1] ?? '';
  const searchUnavailableText = normalizedText(searchUnavailableAttribute);
  if (locale === 'en') assert.match(searchUnavailableText, /unavailable|not available/i, 'English Search unavailable copy is meaningful');
  else assert.match(searchUnavailableText, /no disponibles?|no disponible|no se pueden/i, 'Spanish Search unavailable copy is meaningful');

  assert.equal([...statsHtml.matchAll(/<select\b[^>]*\bdata-stats-period\b/gi)].length, 1, `${locale} Views and Search share one period selector`);
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

  assert.equal([...statsHtml.matchAll(/<select\b[^>]*\bdata-stats-language\b/gi)].length, 1, `${locale} content types share one language selector`);
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

  for (const forbidden of ['373694636', '5153208352', '424203315', '6662500072', 'oauth2.googleapis.com', 'analyticsdata.googleapis.com', 'clientSecret', 'refreshToken', 'accessToken', 'propertyId', 'streamId']) {
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
const hasSearchConsoleSelection = Object.hasOwn(inputs, 'searchConsole');
const hasDirectoryAnalyticsSelection = Object.hasOwn(inputs, 'directoryAnalytics');
const hasDirectoryOutboundClicks = hasDirectoryAnalyticsSelection
  && Object.hasOwn(sourceConfig.directoryAnalytics ?? {}, 'outboundClicks');
assert.deepEqual(Object.keys(inputs).sort(), [
  'curated',
  'definitionVersion',
  ...(hasNewsletterSelection ? ['newsletter'] : []),
  ...(hasAnalyticsSelection ? ['analytics'] : []),
  ...(hasSearchConsoleSelection ? ['searchConsole'] : []),
  ...(hasDirectoryAnalyticsSelection ? ['directoryAnalytics'] : []),
  'schemaVersion',
  'sources'
].sort(),
'protected build input must combine source configuration and maintained facts without credentials');
assert.equal(hasDirectoryAnalyticsSelection, Object.hasOwn(sourceConfig, 'directoryAnalytics'), 'directory selector and protected input must be published together');
if (hasDirectoryOutboundClicks) assert.equal(sourceConfig.directoryAnalytics.outboundClicks, true, 'outbound clicks require the literal true selector');
assert.equal(inputs.schemaVersion, hasDirectoryOutboundClicks ? 8 : hasDirectoryAnalyticsSelection ? 7 : hasSearchConsoleSelection ? 6 : hasAnalyticsSelection ? 5 : hasNewsletterSelection ? 4 : 3, 'protected build input schema version');
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
if (hasSearchConsoleSelection) {
  assert.ok(hasNewsletterSelection && hasAnalyticsSelection, 'Search Console input6 must retain both input5 selections');
  assert.ok(sourceConfig.searchConsole, 'Search Console input must come from a maintained selector');
  assert.deepEqual(Object.keys(sourceConfig.searchConsole).sort(), ['articleUrlPattern', 'availableSince', 'id', 'language', 'siteUrl'], 'maintained Search Console selection must contain only its source and interval configuration');
  assert.equal(sourceConfig.searchConsole.id, 'simple-aws', 'Search Console selection must name Simple AWS');
  assert.equal(sourceConfig.searchConsole.siteUrl, 'sc-domain:simpleaws.dev', 'Search Console selection must name the approved domain property');
  assert.equal(sourceConfig.searchConsole.language, 'en', 'Simple AWS Search Console content-language policy');
  assert.equal(sourceConfig.searchConsole.articleUrlPattern, '(?-i)^https://newsletter\\.simpleaws\\.dev/p/[^/?#]+/?$', 'Search Console selection must limit results to canonical Simple AWS article URLs');
  const availableSince = sourceConfig.searchConsole.availableSince;
  assert.ok(typeof availableSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(availableSince), 'Search Console selection needs a source-verified history boundary');
  const parsedAvailableSince = new Date(`${availableSince}T00:00:00.000Z`);
  assert.ok(Number.isFinite(parsedAvailableSince.getTime()) && parsedAvailableSince.toISOString().slice(0, 10) === availableSince, 'Search Console history boundary must be a real date');
  assert.deepEqual(inputs.searchConsole, sourceConfig.searchConsole, 'Search Console input must project the exact maintained selector');
} else {
  assert.ok(!Object.hasOwn(sourceConfig, 'searchConsole'), 'schema-v3/v4/v5 output must match a source configuration without Search Console');
}
if (hasDirectoryAnalyticsSelection) {
  assert.ok(sourceConfig.directoryAnalytics, 'directory Views input must come from a maintained selector');
  assert.deepEqual(Object.keys(sourceConfig.directoryAnalytics).sort(), [
    'hostname', 'id', 'language', 'propertyId', 'timeZone', ...(hasDirectoryOutboundClicks ? ['outboundClicks'] : [])
  ].sort(), 'maintained directory Analytics selector must contain only its source, scope facts, and optional click opt-in');
  assert.equal(sourceConfig.directoryAnalytics.id, 'donde-aprendo-aws', 'directory selector identity');
  assert.equal(sourceConfig.directoryAnalytics.propertyId, '424203315', 'directory selector uses the verified GA4 property');
  assert.equal(sourceConfig.directoryAnalytics.hostname, 'dondeaprendoaws.com', 'directory selector covers the production apex hostname');
  assert.equal(sourceConfig.directoryAnalytics.language, 'es', 'directory language follows the Spanish original content');
  assert.equal(sourceConfig.directoryAnalytics.timeZone, 'America/Buenos_Aires', 'directory selector uses the verified GA4 property timezone');
  assert.deepEqual(inputs.directoryAnalytics, sourceConfig.directoryAnalytics,
    `protected input${hasDirectoryOutboundClicks ? '8' : '7'} projects the exact maintained selector`);
  assert.equal(Object.hasOwn(inputs.directoryAnalytics, 'recordedSince'), false, 'directory Views do not add recorded-total configuration');
} else {
  assert.ok(!Object.hasOwn(sourceConfig, 'directoryAnalytics'), 'compatible generated input remains valid before directory enablement');
}
const simpleAwsArticleSource = sourceConfig.sources.find((source) => source?.id === 'simple-aws');
const cloudyThingsArticleSource = sourceConfig.sources.find((source) => source?.id === 'cloudy-things');
const expectedArticleSourceIds = [
  'builder-center',
  'caylent',
  ...(simpleAwsArticleSource ? ['simple-aws'] : []),
  ...(cloudyThingsArticleSource ? ['cloudy-things'] : [])
].sort();
assert.deepEqual(inputs.sources.map((source) => source?.id).sort(),
  expectedArticleSourceIds,
  'protected build input must contain exactly the currently selected article sources');
assert.deepEqual(inputs.sources, sourceConfig.sources, 'protected article selection must match the maintained configuration');
if (simpleAwsArticleSource) {
  assert.deepEqual(simpleAwsArticleSource, { id: 'simple-aws' }, 'Simple AWS article selection reuses existing publication facts without credentials or duplicated fields');
  assert.ok(sourceConfig.newsletter, 'Simple AWS article counts require the existing publication selection');
  assert.equal(sourceConfig.newsletter.id, 'simple-aws');
  assert.equal(sourceConfig.newsletter.language, 'en', 'Simple AWS article content language is owner-confirmed English');
}
if (cloudyThingsArticleSource) {
  assert.deepEqual(Object.keys(cloudyThingsArticleSource).sort(), ['authorName', 'id', 'language'],
    'Cloudy Things article selection must contain only its author and content language');
  assert.equal(cloudyThingsArticleSource.id, 'cloudy-things', 'Cloudy Things article source identity');
  assert.equal(typeof cloudyThingsArticleSource.authorName, 'string');
  assert.notEqual(cloudyThingsArticleSource.authorName.trim(), '', 'Cloudy Things author name must be non-empty');
  assert.equal(cloudyThingsArticleSource.language, 'en', 'the selected Cloudy Things inventory uses the currently verified English title policy');
}
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
  const description = html.match(/<meta name="description" content="([^"]*)">/i)?.[1] ?? '';
  assert.ok(description.length > 0, `${page.lang} privacy-page description is present`);
  assert.match(description, /Google Analytics/i, `${page.lang} privacy-page description names Analytics`);
  assert.match(description, /Search Console/i, `${page.lang} privacy-page description names Search Console`);
  if (page.lang === 'en') assert.match(normalizedText(description), /^how\b/, 'English privacy description uses English copy');
  else assert.match(normalizedText(description), /^como\b/, 'Spanish privacy description uses Spanish copy');
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
  mustContainText(privacySection.html, 'Google Analytics', `${page.lang} privacy text names Analytics`);
  mustContainText(privacySection.html, 'Search Console', `${page.lang} privacy text names Search Console`);
  mustContainText(privacySection.html, 'Dónde Aprendo AWS', `${page.lang} privacy text names directory Analytics use`);
  const privacyText = normalizedText(privacySection.html);
  if (page.lang === 'en') {
    assert.match(privacyText, /aggregate page views?/i, 'English privacy text identifies aggregate directory page views');
    assert.match(privacyText, /aggregate.{0,60}(?:outbound|external) link clicks?|(?:outbound|external) link clicks?.{0,60}aggregate/i,
      'English privacy text identifies aggregate outbound-link clicks');
  } else {
    assert.match(privacyText, /vistas? de paginas? agregadas?|vistas? agregadas? de paginas?/i, 'Spanish privacy text identifies aggregate directory page views');
    assert.match(privacyText, /clics?.{0,60}(?:salida|enlaces externos).{0,60}agregad|clics?.{0,60}(?:salida|enlaces externos)/i,
      'Spanish privacy text identifies aggregate outbound-link clicks');
  }
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
