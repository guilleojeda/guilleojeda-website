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

function checkHomeIntroduction(page, html) {
  const { lang } = page;
  const expectedByLocale = {
    en: {
      headline: 'Cloud, AI,\nand the why.',
      intro: 'I’m Guille Ojeda, Principal Innovation Architect at Caylent. I build, write, and speak about AWS and applied AI, with a practical point of view from Córdoba, Argentina.'
    },
    es: {
      headline: 'Cloud, IA,\ny el porqué.',
      intro: 'Soy Guille Ojeda, Principal Innovation Architect en Caylent. Construyo, escribo y doy charlas sobre AWS e IA aplicada, con una mirada práctica desde Córdoba, Argentina.'
    }
  };
  const heroSections = [...html.matchAll(/<section\b(?=[^>]*\baria-labelledby=["']hero-title["'])[^>]*>/gi)];
  assert.equal(heroSections.length, 1, `${lang} homepage has one hero section`);

  const hero = extractElement(html, 'section', 'aria-labelledby', 'hero-title');
  assert.ok(hero, `${lang} homepage has a labeled hero section`);
  const title = extractElement(hero.html, 'h1', 'id', 'hero-title');
  const intro = extractElement(hero.html, 'p', 'class', 'hero-intro');
  const actions = extractElement(hero.html, 'div', 'class', 'hero-actions');
  assert.ok(title, `${lang} hero has its existing title`);
  assert.ok(intro, `${lang} hero has its existing introduction`);
  assert.ok(actions, `${lang} hero has its existing actions region`);
  assert.equal([...hero.html.matchAll(/<h1\b/gi)].length, 1, `${lang} hero has exactly one h1`);
  assert.equal(normalizedText(title.html), normalizedText(expectedByLocale[lang].headline),
    `${lang} hero keeps the localized headline`);
  assert.equal(normalizedText(intro.html), normalizedText(expectedByLocale[lang].intro),
    `${lang} hero keeps the localized introduction`);
  assert.ok(title.end <= intro.start, `${lang} hero headline precedes the introduction`);

  const introToActions = hero.html.slice(intro.end, actions.start).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.match(introToActions, /AWS Builder of the Year\s*·\s*LATAM-ES 2025/,
    `${lang} hero surfaces the award between the introduction and actions`);

  const actionLinks = [...actions.html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)];
  assert.equal(actionLinks.length, 2, `${lang} hero has two ordinary action links`);
  const readAction = (match) => {
    const openingTag = match[0].match(/^<a\b[^>]*>/i)?.[0] ?? '';
    const labelHtml = match[0].slice(openingTag.length).replace(/<[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
    const href = openingTag.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
    return { href, label: normalizedText(labelHtml) };
  };
  const [primaryAction, linkedInAction] = actionLinks.map(readAction);
  assert.equal(primaryAction.label, lang === 'en' ? 'view my work' : 'ver mi trabajo',
    `${lang} primary hero action has its approved localized label`);
  assert.equal(primaryAction.href, lang === 'en' ? '/#work' : '/es/#work',
    `${lang} primary hero action targets the work section`);
  assert.equal(linkedInAction.href, profile.site.linkedin, `${lang} secondary hero action targets LinkedIn`);
  assert.match(linkedInAction.label, lang === 'en'
    ? /(?:contact\w*|view|visit|open|connect\w*).{0,30}linkedin|linkedin.{0,30}(?:profile|contact)/
    : /(?:contact\w*|ver|visitar|escrib\w*|conectar\w*).{0,30}linkedin|linkedin.{0,30}(?:perfil|contact\w*)/,
  `${lang} LinkedIn action has a descriptive localized label`);

  const portraitImages = [...hero.html.matchAll(/<img\b[^>]*>/gi)];
  assert.equal(portraitImages.length, 1, `${lang} hero keeps one portrait image`);
  const portraitTag = portraitImages[0][0];
  const portraitAttribute = (name) => portraitTag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
  assert.equal(portraitAttribute('src'), '/images/guille-portrait.jpg', `${lang} hero uses the existing local portrait`);
  assert.equal([...html.matchAll(/<img\b(?=[^>]*\bsrc=["']\/images\/guille-portrait\.jpg["'])[^>]*>/gi)].length, 1,
    `${lang} homepage does not duplicate the portrait`);
  assert.equal(portraitAttribute('alt'), profile.site.portraitAlt[lang], `${lang} portrait keeps its localized alt text`);
  assert.equal(portraitAttribute('width'), '800', `${lang} portrait keeps its intrinsic width`);
  assert.equal(portraitAttribute('height'), '800', `${lang} portrait keeps its intrinsic height`);
  assert.ok(actions.end <= portraitImages[0].index,
    `${lang} hero places the portrait after its actions in DOM order`);

  const about = extractElement(html, 'section', 'id', 'about');
  assert.ok(about, `${lang} homepage keeps its About section`);
  assert.match(normalizedText(about.html), /aws builder of the year.{0,40}latam-es 2025/,
    `${lang} About section retains the award`);
}

function checkNewsletterActions(page, html) {
  const { lang } = page;
  const feature = extractElement(html, 'article', 'class', 'lead-work');
  assert.ok(feature, `${lang} homepage keeps its newsletter feature`);
  const heading = feature.html.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '';
  assert.equal(normalizedText(heading), 'simple aws', `${lang} newsletter feature names Simple AWS`);
  const actions = extractElement(feature.html, 'div', 'class', 'feature-actions');
  assert.ok(actions, `${lang} newsletter feature has its actions together`);
  const links = [...actions.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(links.length, 2, `${lang} newsletter offers distinct Subscribe and Read links`);

  const expected = lang === 'en'
    ? [['Subscribe to Simple AWS', 'https://newsletter.simpleaws.dev/subscribe'], ['Read the newsletter', 'https://newsletter.simpleaws.dev/']]
    : [['Suscribite a Simple AWS', 'https://newsletter.simpleaws.dev/subscribe'], ['Leé el newsletter', 'https://newsletter.simpleaws.dev/']];
  for (const [index, [label, href]] of expected.entries()) {
    const link = links[index];
    const actualHref = link[1].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';
    const labelHtml = link[2].replace(/<span\b[^>]*\baria-hidden=["']true["'][^>]*>[\s\S]*?<\/span>/gi, ' ');
    assert.equal(normalizedText(labelHtml), normalizedText(label), `${lang} newsletter action ${index + 1} has its descriptive localized label`);
    assert.equal(actualHref, href, `${lang} newsletter action ${index + 1} has its distinct approved destination`);
  }

  const offer = normalizedText(feature.html.slice(0, actions.start));
  assert.match(offer, lang === 'en' ? /\bbiweekly\b|every (?:two|2) weeks/ : /quincenal|cada (?:dos|2) semanas/,
    `${lang} newsletter visibly states its biweekly cadence before the actions`);
  const description = normalizedText(feature.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '');
  assert.match(description, /\baws\b/, `${lang} newsletter description names AWS`);
  assert.match(description, /arquitectur|architectur/, `${lang} newsletter description names architecture`);
  assert.match(description, lang === 'en' ? /choices|decisions|trade.?offs/ : /decisiones|elecciones|opciones/,
    `${lang} newsletter description identifies architecture choices`);
  assert.match(description, lang === 'en' ? /understand|choos|why|fits?/ : /entend|comprend|eleg|por que/,
    `${lang} newsletter description explains the reader benefit`);

  const sponsor = extractElement(feature.html, 'a', 'class', 'sponsor-note');
  assert.ok(sponsor, `${lang} newsletter keeps its sponsorship action in the feature`);
  const sponsorHref = sponsor.html.match(/^<a\b[^>]*\bhref=["']([^"']+)["']/i)?.[1] ?? '';
  assert.equal(sponsorHref, 'https://www.passionfroot.me/guilleojeda', `${lang} newsletter sponsorship keeps its destination`);
  assert.match(normalizedText(sponsor.html), lang === 'en' ? /sponsor/ : /patrocin/,
    `${lang} newsletter sponsorship keeps its descriptive localized label`);
  assert.ok(actions.end <= sponsor.start, `${lang} subscription and reading actions precede sponsorship`);
  assert.doesNotMatch(feature.html, /<(?:form|input|iframe|script)\b/i,
    `${lang} newsletter uses ordinary links without embedded subscription handling`);
  assert.doesNotMatch(feature.html, /\son[a-z]+\s*=/i, `${lang} newsletter links need no inline event handlers`);
}

function checkAuthorshipAndAbout(page, html) {
  const { lang } = page;
  const authorship = extractElement(html, 'section', 'aria-labelledby', 'authorship-title');
  assert.ok(authorship, `${lang} homepage keeps its Books and course section`);
  const booksHeading = extractElement(authorship.html, 'h2', 'id', 'authorship-title');
  assert.ok(booksHeading, `${lang} Books and course section has its heading`);
  const visibleHeading = (element) => element.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(visibleHeading(booksHeading.html), lang === 'en' ? 'Books and a course' : 'Libros y un curso',
    `${lang} Books and course section uses its direct descriptive heading`);
  assert.equal(normalizedText(authorship.html.slice(0, booksHeading.start)), '',
    `${lang} Books and course section has no decorative prefix`);
  mustContainText(authorship.html, profile.authorship.intro[lang], `${lang} Books and course introduction`);
  for (const book of books) {
    mustContainText(authorship.html, book.title[lang], `${lang} book title ${book.id}`);
    mustContainText(authorship.html, book.text[lang], `${lang} book text ${book.id}`);
    mustContainText(authorship.html, book.meta[lang], `${lang} book status and metadata ${book.id}`);
    if (book.href) mustContain(authorship.html, `href="${escapeHtml(book.href)}"`, `${lang} book destination ${book.id}`);
    if (book.cta) mustContainText(authorship.html, book.cta[lang], `${lang} book action ${book.id}`);
  }
  const course = extractElement(authorship.html, 'article', 'class', 'course-card');
  assert.ok(course, `${lang} Books and course section retains its course card`);
  mustContainText(course.html, profile.authorship.courseTitle[lang], `${lang} course title`);
  mustContainText(course.html, profile.authorship.courseMeta[lang], `${lang} course status`);
  mustContainText(course.html, profile.authorship.courseText[lang], `${lang} course details`);

  const about = extractElement(html, 'section', 'id', 'about');
  assert.ok(about, `${lang} homepage keeps its About section`);
  const aboutHeading = extractElement(about.html, 'h2', 'id', 'about-title');
  assert.ok(aboutHeading, `${lang} About section has its heading`);
  assert.equal(visibleHeading(aboutHeading.html), lang === 'en' ? 'About me' : 'Sobre mí',
    `${lang} About section uses its direct descriptive heading`);
  assert.equal(normalizedText(about.html.slice(0, aboutHeading.start)), '',
    `${lang} About section has no decorative prefix`);
  for (const key of ['intro', 'community']) {
    mustContainText(about.html, profile.about[key][lang], `${lang} About ${key} copy`);
  }
  for (const [index, fact] of profile.about.facts.entries()) {
    mustContainText(about.html, fact.label[lang], `${lang} About fact ${index + 1} label`);
    mustContainText(about.html, fact.value[lang], `${lang} About fact ${index + 1} value`);
  }
  for (const activity of profile.about.activities) {
    mustContainText(about.html, activity.title[lang], `${lang} activity title ${activity.id}`);
    mustContainText(about.html, activity.text[lang], `${lang} activity text ${activity.id}`);
    if (activity.href) mustContain(about.html, `href="${escapeHtml(activity.href)}"`, `${lang} activity destination ${activity.id}`);
    if (activity.cta) mustContainText(about.html, activity.cta[lang], `${lang} activity action ${activity.id}`);
  }
}

function checkWorkHighlights(page, html) {
  const { lang } = page;
  const work = extractElement(html, 'section', 'id', 'work');
  assert.ok(work, `${lang} homepage keeps its Work section`);
  const heading = extractElement(work.html, 'h2', 'id', 'work-title');
  assert.ok(heading, `${lang} Work has its section heading`);
  const expectedHeading = lang === 'en' ? 'Highlights of my work' : 'Trabajos destacados';
  assert.equal(normalizedText(heading.html), normalizedText(expectedHeading),
    `${lang} Work uses its approved descriptive heading`);

  const highlights = extractElement(work.html, 'div', 'class', 'work-highlights');
  assert.ok(highlights, `${lang} Work offers a row of direct recommendations`);
  assert.equal(normalizedText(work.html.slice(0, highlights.start)), normalizedText(expectedHeading),
    `${lang} Work introduces the choices without a redundant kicker or narrative paragraph`);
  assert.doesNotMatch(work.html.slice(0, highlights.start), /<(?:details|summary)\b/i,
    `${lang} work highlights are visible without opening a disclosure`);
  const newsletter = extractElement(work.html, 'article', 'class', 'lead-work');
  const supporting = extractElement(work.html, 'div', 'class', 'supporting-work');
  assert.ok(newsletter && supporting, `${lang} Work retains the newsletter and broader work cards`);
  assert.ok(highlights.end <= newsletter.start && newsletter.end <= supporting.start,
    `${lang} direct choices precede the newsletter and broader work`);

  const selectedTalk = talks.find((talk) => talk.id === 'unit-economics-ai-agents');
  const selectedProject = projects.find((project) => project.id === 'prompt-runner-game');
  assert.ok(selectedTalk && selectedProject, 'approved talk and project records remain available');
  const expected = [
    {
      title: 'From Prompt Edits to Performance Loops: Hands-On with Amazon Bedrock AgentCore Optimization',
      href: 'https://caylent.com/blog/from-prompt-edits-to-performance-loops-hands-on-with-amazon-bedrock-agentcore-optimization',
      label: lang === 'en' ? 'Read · English' : 'Leer · Inglés',
      purpose: lang === 'en' ? /improv[\s\S]*agent|agent[\s\S]*improv/ : /mejor[\s\S]*agente|agente[\s\S]*mejor/
    },
    {
      title: selectedTalk.title[lang],
      href: 'https://www.youtube.com/watch?v=QKM876A_AM4',
      label: lang === 'en' ? 'Watch · English' : 'Ver · Inglés',
      purpose: lang === 'en' ? /cost[\s\S]*value|value[\s\S]*cost/ : /cost[\s\S]*valor|valor[\s\S]*cost/
    },
    {
      title: selectedProject.title[lang],
      href: 'https://robotrunner.guilleojeda.com/',
      label: lang === 'en' ? 'Play · Spanish' : 'Jugar · Español',
      purpose: lang === 'en' ? /tools[\s\S]*instructions|instructions[\s\S]*tools/ : /herramientas[\s\S]*instrucciones|instrucciones[\s\S]*herramientas/
    }
  ];
  const links = [...highlights.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(links.length, 3, `${lang} work highlights offer exactly one Read, Watch and Play choice`);
  for (const [index, item] of expected.entries()) {
    const [, attributes, body] = links[index];
    const href = attributes.match(/\shref=["']([^"']+)["']/i)?.[1] ?? '';
    assert.equal(href, item.href, `${lang} highlight ${index + 1} opens its approved work directly`);
    const title = body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    assert.ok(title, `${lang} highlight ${index + 1} has a readable title`);
    assert.equal(normalizedText(title[1]), normalizedText(item.title),
      `${lang} highlight ${index + 1} names the selected work`);
    assert.equal(normalizedText(body.slice(0, title.index)), normalizedText(item.label),
      `${lang} highlight ${index + 1} labels its action and actual content language`);
    const description = body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
    assert.match(normalizedText(description), item.purpose,
      `${lang} highlight ${index + 1} explains its relevant purpose`);
    if (index === 1) assert.match(normalizedText(description), lang === 'en' ? /outcome/ : /resultado/,
      `${lang} recording recommendation connects cost and value to outcomes`);
    if (index === 2) assert.match(normalizedText(body), lang === 'en' ? /desktop/ : /computadora|escritorio/,
      `${lang} game recommendation states desktop play before navigation`);
  }
  assert.doesNotMatch(highlights.html, /<(?:form|input|iframe|script|details)\b/i,
    `${lang} recommendations are ordinary visible links rather than embeds or hidden content`);
  assert.doesNotMatch(highlights.html, /\son[a-z]+\s*=/i,
    `${lang} recommendations need no inline event handlers`);

  const broaderLinks = [...supporting.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const archive = extractElement(work.html, 'details', 'class', 'talk-archive work-archive');
  assert.ok(archive, `${lang} Work keeps its native broader-resource archive`);
  assert.doesNotMatch(archive.html.match(/^<details\b[^>]*>/i)?.[0] ?? '', /\sopen(?:\s|=|>)/i,
    `${lang} broader-resource archive starts closed`);
  const archivedLinks = [...archive.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  for (const project of projects) {
    const candidates = project.featured ? broaderLinks : archivedLinks;
    assert.ok(candidates.some(([, attributes]) => attributes.match(/\shref=["']([^"']+)["']/i)?.[1] === project.href),
      `${lang} broader work retains the destination for ${project.id}`);
  }
}

function checkOctoberMeetup(page, html) {
  const talksSection = extractElement(html, 'section', 'id', 'talks');
  const year = extractElement(talksSection.html, 'section', 'aria-labelledby', 'talk-year-2026');
  assert.ok(year, `${page.lang} speaking archive retains its 2026 group`);
  const title = 'La Economía de los Agentes de IA';
  const rows = [...year.html.matchAll(/<article\b[^>]*class="talk-archive-item"[^>]*>([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]).filter((row) => row.includes(title));
  assert.equal(rows.length, 1, `${page.lang} October meetup has one archive entry`);
  const row = rows[0];
  const expected = page.lang === 'en' ? {
    format: 'Meetup talk and panel',
    text: 'On October 22, 2026, I spoke about calculating cost per outcome and the real costs of an Amazon Bedrock AgentCore agent before production. I also joined the event’s AWS certification panel.',
    cta: 'Watch the talk'
  } : {
    format: 'Charla de meetup y panel',
    text: 'El 22 de octubre de 2026 hablé sobre cómo calcular el costo por resultado y los costos reales de un agente con Amazon Bedrock AgentCore antes de llevarlo a producción. También participé del panel sobre certificaciones de AWS.',
    cta: 'Ver la charla'
  };
  for (const value of [title, 'AWS User Group Córdoba & AWS AI User Group Argentina', expected.format, expected.text]) {
    mustContainText(row, value, `${page.lang} confirmed October meetup copy: ${value}`);
  }
  assert.doesNotMatch(row, /\bupcoming\b|pr[oó]xima/i, `${page.lang} delivered meetup is no longer upcoming`);
  const links = [...row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 1, `${page.lang} meetup has one ordinary recording link`);
  assert.equal(links[0][1].match(/\shref="([^"]+)"/)?.[1], 'https://www.youtube.com/live/QLt6OAZhNxw?t=5325s',
    `${page.lang} meetup opens its verified talk timestamp`);
  assert.equal(normalizedText(links[0][2]).replace(/\s*↗$/, ''), normalizedText(expected.cta),
    `${page.lang} meetup recording action is localized`);
}

// Approved speaker-resource content and owner-confirmed presentation languages.
// Inventory title language and recording speech language are separate facts.
function checkSpeakerResources(page, html) {
  const { lang } = page;
  const expected = lang === 'en' ? {
    title: 'Talks',
    availability: 'Open to speaking opportunities.',
    invite: 'Invite me to speak at your event',
    summary: 'Speaker resources',
    labels: ['Bio', 'Topics', 'Presentation languages', 'Photo', 'Recording'],
    bio: "Guille Ojeda is a Principal Innovation Architect in Caylent's Office of the CTO. He writes a newsletter called Simple AWS with 42,000 subscribers, has published more than 250 articles and 2 books, and speaks about AWS architecture and applied AI at events such as AWS Summits and re:Invent. He is an AWS Community Builder, leads AWS AI User Group Argentina, and was named AWS Builder of the Year for LATAM-ES 2025.",
    topics: ['Agent evaluation', 'Agent economics', 'AWS architecture'],
    languages: 'English and Spanish',
    download: 'Download Guille’s photo',
    recordingLanguage: 'In English'
  } : {
    title: 'Charlas',
    availability: 'Abierto a propuestas para dar charlas.',
    invite: 'Invitame a dar una charla en tu evento',
    summary: 'Recursos para organizadores',
    labels: ['Biografía', 'Temas', 'Idiomas de las charlas', 'Foto', 'Grabación'],
    bio: 'Guille Ojeda es Principal Innovation Architect en la oficina del CTO de Caylent. Escribe una newsletter llamada Simple AWS con 42,000 suscriptores, ha publicado más de 250 artículos y 2 libros, y da charlas sobre arquitectura AWS e IA aplicada en eventos como AWS Summits y re:Invents. Es AWS Community Builder, lidera AWS AI User Group Argentina y fue reconocido como AWS Builder del Año para LATAM-ES 2025.',
    topics: ['Evaluación de agentes', 'Economía de agentes', 'Arquitectura AWS'],
    languages: 'Inglés y español',
    download: 'Descargar foto de Guille',
    recordingLanguage: 'En inglés'
  };
  const visibleText = (value) => normalizedText(value
    .replace(/&#(?:39|x27);|&apos;/gi, "'")
    .replace(/[↗↘↓]/g, ''));
  const href = (attributes) => attributes.match(/\shref=["']([^"']+)["']/i)?.[1] ?? '';
  const opening = (element, tag) => element.html.match(new RegExp(`^<${tag}\\b[^>]*>`, 'i'))?.[0] ?? '';
  const talksSection = extractElement(html, 'section', 'id', 'talks');
  assert.ok(talksSection, `${lang} homepage keeps its Talks section`);
  const heading = extractElement(talksSection.html, 'h2', 'id', 'talks-title');
  assert.ok(heading, `${lang} Talks has its section heading`);
  assert.equal(visibleText(heading.html), visibleText(expected.title), `${lang} Talks uses its descriptive heading`);
  const featured = extractElement(talksSection.html, 'div', 'class', 'talk-grid');
  assert.ok(featured, `${lang} Talks keeps its featured cards`);
  assert.equal(visibleText(talksSection.html.slice(0, featured.start)), visibleText(expected.title),
    `${lang} Talks has no redundant kicker or narrative introduction`);
  assert.doesNotMatch(talksSection.html.slice(0, featured.start), /<(?:details|summary)\b/i,
    `${lang} featured talks stay outside disclosures`);

  const featuredRecords = talks.filter((talk) => talk.featured);
  const cards = [...featured.html.matchAll(/<(a|article)\b([^>]*\sclass=["']talk-card["'][^>]*)>([\s\S]*?)<\/\1>/gi)];
  assert.equal(cards.length, featuredRecords.length, `${lang} Talks retains every featured card`);
  for (const [index, talk] of featuredRecords.entries()) {
    mustContainText(cards[index][3], talk.title[lang], `${lang} featured talk ${talk.id}`);
    assert.equal(href(cards[index][2]), talk.href ?? '', `${lang} featured talk ${talk.id} keeps its destination`);
  }

  const archive = extractElement(talksSection.html, 'details', 'class', 'talk-archive');
  const availability = extractElement(talksSection.html, 'div', 'class', 'availability');
  assert.ok(archive && availability, `${lang} Talks retains its archive and speaking invitation`);
  assert.ok(featured.end <= archive.start && archive.end <= availability.start,
    `${lang} speaking invitation follows the featured talks and complete archive`);
  assert.doesNotMatch(opening(archive, 'details'), /\sopen(?:\s|=|>)/i, `${lang} speaking archive starts closed`);
  assert.equal((archive.html.match(/class=["']talk-archive-item["']/g) ?? []).length, talks.length,
    `${lang} complete archive retains every speaking record`);
  for (const talk of talks) {
    mustContainText(archive.html, talk.title[lang], `${lang} archive title for ${talk.id}`);
    mustContainText(archive.html, talk.text[lang], `${lang} archive description/status for ${talk.id}`);
    if (talk.href) mustContain(archive.html, `href="${escapeHtml(talk.href)}"`, `${lang} archive destination for ${talk.id}`);
  }

  const resources = extractElement(availability.html, 'details', 'class', 'speaker-resources');
  assert.ok(resources, `${lang} speaking invitation offers native speaker resources`);
  assert.equal((html.match(/<details\b[^>]*\sclass=["']speaker-resources["']/gi) ?? []).length, 1,
    `${lang} homepage has one speaker-resource disclosure`);
  assert.doesNotMatch(opening(resources, 'details'), /\sopen(?:\s|=|>)/i, `${lang} speaker resources start closed`);
  const archiveName = opening(archive, 'details').match(/\sname=["']([^"']+)["']/i)?.[1];
  const resourcesName = opening(resources, 'details').match(/\sname=["']([^"']+)["']/i)?.[1];
  assert.ok(!archiveName || archiveName !== resourcesName, `${lang} archive and resources do not form an exclusive accordion`);
  const summary = resources.html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ?? '';
  assert.equal(visibleText(summary), visibleText(expected.summary), `${lang} speaker-resource summary is localized`);

  const invitation = availability.html.slice(0, resources.start);
  const inviteLinks = [...invitation.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(inviteLinks.length, 1, `${lang} speaking invitation has one direct contact action`);
  assert.equal(href(inviteLinks[0][1]), 'https://www.linkedin.com/in/guilleojeda', `${lang} speaking inquiry still opens LinkedIn`);
  assert.equal(visibleText(inviteLinks[0][2]), visibleText(expected.invite), `${lang} invitation clearly refers to speaking at the visitor's event`);
  assert.equal(visibleText(invitation), visibleText(`${expected.availability} ${expected.invite}`),
    `${lang} availability stays outside the closed kit without a redundant Speaking label`);

  const fields = ['bio', 'topics', 'languages', 'photo', 'recording'].map((name, index) => {
    const id = `speaker-${name}-title`;
    const field = extractElement(resources.html, 'section', 'aria-labelledby', id);
    assert.ok(field, `${lang} resources include the ${name} field`);
    const label = extractElement(field.html, 'h3', 'id', id);
    assert.ok(label, `${lang} ${name} field has its accessible heading`);
    assert.equal(visibleText(label.html), visibleText(expected.labels[index]), `${lang} ${name} label is localized`);
    return field;
  });
  let previousEnd = 0;
  for (const [index, field] of fields.entries()) {
    assert.ok(field.start >= previousEnd, `${lang} speaker-resource fields retain their reading order`);
    assert.equal(visibleText(resources.html.slice(previousEnd, field.start)), index === 0 ? visibleText(expected.summary) : '',
      `${lang} speaker resources avoid additional introductory or decorative copy`);
    previousEnd = field.end;
  }
  assert.equal(visibleText(resources.html.slice(previousEnd)), '', `${lang} speaker resources have no trailing internal notes`);
  const [bio, topics, languages, photo, recording] = fields;
  assert.equal(visibleText(bio.html), visibleText(`${expected.labels[0]} ${expected.bio}`), `${lang} speaker bio matches the approved facts`);
  assert.deepEqual([...topics.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => visibleText(match[1])),
    expected.topics.map(visibleText), `${lang} speaker topics match the three approved subjects`);
  assert.equal(visibleText(topics.html), visibleText(`${expected.labels[1]} ${expected.topics.join(' ')}`),
    `${lang} topic copy stays concise`);
  assert.equal(visibleText(languages.html), visibleText(`${expected.labels[2]} ${expected.languages}`),
    `${lang} offered talk languages are owner-confirmed English and Spanish`);

  const resourceLinks = [...resources.html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  assert.equal(resourceLinks.length, 2, `${lang} kit has direct photo and recording links`);
  const photoLink = photo.html.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  assert.ok(photoLink, `${lang} photo is an ordinary link`);
  assert.equal(href(photoLink[1]), '/images/guille-portrait.jpg', `${lang} photo uses the same repository-owned image`);
  assert.match(photoLink[1], /\sdownload=["']guille-ojeda\.jpg["']/i, `${lang} photo requests a named native download`);
  assert.equal(visibleText(photoLink[2]), visibleText(expected.download), `${lang} photo download has its localized label`);
  assert.equal(visibleText(photo.html), visibleText(`${expected.labels[3]} ${expected.download} JPG · 800 × 800`),
    `${lang} photo copy contains only the useful label, action and file facts`);
  const recordingLink = recording.html.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  assert.ok(recordingLink, `${lang} representative recording is an ordinary link`);
  assert.equal(href(recordingLink[1]), 'https://www.youtube.com/watch?v=QKM876A_AM4', `${lang} kit opens the direct approved recording`);
  assert.equal(visibleText(recordingLink[2]), visibleText('The Unit Economics of AI Agents'), `${lang} recording retains its original title`);
  assert.equal(visibleText(recording.html), visibleText(`${expected.labels[4]} The Unit Economics of AI Agents ${expected.recordingLanguage}`),
    `${lang} representative recording identifies its English speech independently of offered languages`);
  assert.doesNotMatch(resources.html, /<(?:form|input|iframe|script|button)\b/i,
    `${lang} resources use readable text and links without embeds, forms or custom controls`);
  assert.equal((resources.html.match(/<details\b/gi) ?? []).length, 1, `${lang} kit fields need no nested disclosures`);
  assert.doesNotMatch(availability.html, /\son[a-z]+\s*=/i, `${lang} invitation and resources need no inline event handlers`);
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
  const overview = extractElement(statsHtml, null, 'data-stats-overview');
  assert.ok(overview, `${locale} statistics show a separate compact overview`);
  assert.equal([...statsHtml.matchAll(/\bdata-stats-overview(?:\s|=|>)/gi)].length, 1,
    `${locale} statistics have one overview region`);
  const sectionTitle = extractElement(statsHtml, 'h2', 'id', 'content-stats-title');
  assert.ok(sectionTitle, `${locale} statistics have a section heading`);
  assert.equal(normalizedText(sectionTitle.html), locale === 'en' ? 'statistics' : 'estadisticas',
    `${locale} statistics heading stays direct`);
  const headerText = normalizedText(statsHtml.slice(0, overview.start));
  assert.doesNotMatch(headerText, locale === 'en'
    ? /content statistics|at a glance|a snapshot of my published work and its reach across selected platforms/
    : /estadisticas de contenido|de un vistazo|un vistazo a mi trabajo publicado y su alcance en distintas plataformas/,
  `${locale} statistics omit the redundant kicker and introduction`);
  const reportDisclosure = extractElement(statsHtml, 'details', 'data-stats-report');
  assert.ok(reportDisclosure, `${locale} full statistics report uses a native disclosure`);
  assert.equal([...statsHtml.matchAll(/<details\b[^>]*\bdata-stats-report(?:\s|=|>)/gi)].length, 1,
    `${locale} statistics have one full-report disclosure`);
  const reportOpeningTag = reportDisclosure.html.match(/^<details\b[^>]*>/i)?.[0] ?? '';
  assert.doesNotMatch(reportOpeningTag, /\sopen(?:\s|=|$)/i, `${locale} full report starts closed`);
  const reportSummary = reportDisclosure.html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ?? '';
  assert.ok(reportSummary, `${locale} full report has a native summary label`);
  assert.match(normalizedText(reportSummary), locale === 'en' ? /^explore statistics$/ : /^explorar estadisticas$/,
    `${locale} full-report summary is localized and describes the action`);
  assert.ok(overview.end <= reportDisclosure.start, `${locale} overview stays outside and before the closed report`);
  const overviewAndScopeText = normalizedText(statsHtml.slice(0, reportDisclosure.start));
  assert.match(overviewAndScopeText, locale === 'en' ? /all content languages/ : /todos? los idiomas de contenido/,
    `${locale} visible overview identifies its all-language scope`);
  assert.match(overviewAndScopeText, locale === 'en' ? /covered|coverage/ : /cobertura|cubiert|incluye|abarca/,
    `${locale} visible overview identifies its covered scope`);

  const overviewKinds = [...overview.html.matchAll(/\bdata-stats-overview-value=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  assert.deepEqual(overviewKinds, ['articles', 'talks', 'books', 'newsletter'],
    `${locale} overview binds exactly one value to each approved headline metric`);
  assert.deepEqual([...statsHtml.matchAll(/\bdata-stats-overview-value=["']([^"']+)["']/gi)].map((match) => match[1]),
    overviewKinds, `${locale} overview value hooks are unique to the overview`);
  const overviewLabels = locale === 'en' ? [
    [/published articles?/, 'published article count'],
    [/delivered talks?.{0,30}sessions?|talks?.{0,20}sessions?/, 'delivered talks and sessions'],
    [/published books?/, 'published book count'],
    [/(?:current|active) .{0,20}subscribers?|subscribers?.{0,20}(?:current|active)/, 'current subscriber count']
  ] : [
    [/articulos publicados?/, 'published article count'],
    [/(?:charlas|sesiones).{0,40}(?:realizadas?|dictadas?|presentadas?)|(?:realizadas?|dictadas?|presentadas?).{0,40}(?:charlas|sesiones)/, 'delivered talks and sessions'],
    [/libros publicados?/, 'published book count'],
    [/(?:suscriptores?|suscripciones?).{0,30}(?:actuales?|activos?|vigentes?)/, 'current subscriber count']
  ];
  const overviewText = normalizedText(overview.html);
  assert.match(overviewText, /simple aws/, `${locale} current audience figure identifies Simple AWS`);
  for (const [pattern, description] of overviewLabels) {
    assert.match(overviewText, pattern, `${locale} overview labels its ${description}`);
  }
  for (const kind of overviewKinds) {
    const value = extractElement(overview.html, null, 'data-stats-overview-value', kind);
    assert.ok(value, `${locale} overview has a ${kind} value hook`);
    assert.doesNotMatch(normalizedText(value.html), /\d/, `${locale} ${kind} overview does not hardcode a count in the static HTML`);
  }

  const reportCardKinds = [...reportDisclosure.html.matchAll(/\bdata-stats-kind=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  assert.equal(reportCardKinds.length, 5, `${locale} closed report contains the complete five-card dashboard`);
  assert.deepEqual(reportCardKinds, ['articles', 'talks', 'books', 'newsletter', 'directory-views'],
    `${locale} closed report keeps every detailed card in order`);
  for (const attribute of ['data-stats-language', 'data-stats-period']) {
    assert.equal([...statsHtml.matchAll(new RegExp(`\\b${attribute}(?:\\s|=|>)`, 'gi'))].length, 1,
      `${locale} statistics keep one ${attribute} control`);
    assert.equal([...reportDisclosure.html.matchAll(new RegExp(`\\b${attribute}(?:\\s|=|>)`, 'gi'))].length, 1,
      `${locale} ${attribute} control stays inside the full report`);
  }
  const reportSourcesDisclosure = extractElement(reportDisclosure.html, 'details', 'class', 'content-stats-sources');
  assert.ok(reportSourcesDisclosure, `${locale} counting methodology is inside the full report`);
  mustContain(reportSourcesDisclosure.html, `href="${locale === 'en' ? '/content-statistics/privacy/' : '/es/content-statistics/privacy/'}"`,
    `${locale} privacy link stays inside the full report`);

  const sourcesDisclosure = extractElement(statsHtml, 'details', 'class', 'content-stats-sources');
  assert.ok(sourcesDisclosure, `${locale} statistics need the source and counting disclosure`);
  const sourcesCopy = normalizedText(sourcesDisclosure.html);
  const sourceBullets = [...sourcesDisclosure.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => normalizedText(match[1]));
  const recordedTrafficDisclosure = sourceBullets.find((bullet) => /recorded traffic totals|totales de trafico registrados/.test(bullet));
  assert.ok(recordedTrafficDisclosure, `${locale} disclosure preserves the recorded-traffic history limit`);
  if (locale === 'en') {
    assert.match(recordedTrafficDisclosure, /activity available since the start date shown/,
      'English recorded totals identify the displayed start date');
    assert.match(recordedTrafficDisclosure, /earlier activity.{0,80}tracking gaps? may be missing/,
      'English recorded totals warn that earlier activity and tracking gaps may be missing');
  } else {
    assert.match(recordedTrafficDisclosure, /actividad disponible desde la fecha de inicio indicada/,
      'Spanish recorded totals identify the displayed start date');
    assert.match(recordedTrafficDisclosure, /puede faltar actividad anterior.{0,100}periodos? sin seguimiento/,
      'Spanish recorded totals warn that earlier activity and tracking gaps may be missing');
  }
  const metadataDisclosures = [...statsHtml.matchAll(/<details class="content-stats-details">[\s\S]*?<\/details>/gi)];
  const metadataLists = [...statsHtml.matchAll(/<dl class="content-stats-meta\b/gi)];
  assert.equal(metadataLists.length, metadataDisclosures.length, `${locale} each metadata list stays inside a disclosure`);
  assert.equal([...reportDisclosure.html.matchAll(/<details class="content-stats-details">[\s\S]*?<\/details>/gi)].length,
    metadataDisclosures.length, `${locale} all per-metric metadata disclosures stay inside the full report`);
  assert.equal([...reportDisclosure.html.matchAll(/<dl class="content-stats-meta\b/gi)].length,
    metadataLists.length, `${locale} all metric source/date lists stay inside the full report`);
  for (const [index, match] of metadataDisclosures.entries()) {
    const disclosure = match[0];
    const summary = disclosure.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1] ?? '';
    assert.match(normalizedText(summary), locale === 'en' ? /source[\s&and]{0,8}dates?/ : /fuente[\s&y]{0,8}fechas?/,
      `${locale} metadata disclosure ${index + 1} has a meaningful localized summary`);
    assert.doesNotMatch(disclosure.match(/^<details[^>]*>/i)?.[0] ?? '', /\sopen(?:\s|=|$)/i,
      `${locale} metric metadata starts collapsed`);
    assert.match(disclosure, /<dl class="content-stats-meta\b/, `${locale} metadata disclosure contains its metric data list`);
    assert.equal([...disclosure.matchAll(/<dl class="content-stats-meta\b/gi)].length, 1,
      `${locale} each metadata disclosure contains exactly one metric list`);
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
  if (locale === 'en') assert.match(newsletterHeading, /newsletter/i, 'English newsletter card heading');
  else assert.match(newsletterHeading, /newsletter|bolet.n|suscriptores?/i, 'Spanish newsletter card heading');
  const newsletterCardHeader = extractElement(newsletterCard, 'div', 'class', 'content-stats-card-heading');
  assert.ok(newsletterCardHeader, `${locale} newsletter card needs its own heading region`);
  mustNotContain(newsletterCardHeader.html, locale === 'en' ? 'current' : 'actual',
    `${locale} newsletter header must not describe email activity as current`);
  for (const kind of ['articles', 'talks', 'books', 'newsletter']) {
    const card = extractElement(statsHtml, 'article', 'data-stats-kind', kind)?.html;
    assert.ok(card, `${locale} ${kind} must have a distinct accessible card`);
    for (const field of ['status', 'results', 'count', 'count-label', 'coverage', 'collected-date']) {
      assert.ok(new RegExp(`\\bdata-stats-${field}(?:\\s|=|>)`).test(card), `${locale} ${kind} needs its own ${field}`);
    }
    mustContain(card, 'aria-live="polite"', `${locale} ${kind} accessible updates`);
  }
  const newsletterUnit = newsletterCard.match(/<[^>]*\bdata-stats-count-label\b[^>]*>([\s\S]*?)<\//i)?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
  if (locale === 'en') assert.match(newsletterUnit, /(?:active|current) subscribers?|subscriptions?/i, 'English newsletter count keeps its current-subscriber meaning');
  else assert.match(newsletterUnit, /(?:suscriptores? (?:activos?|actuales?)|suscripciones? (?:activas?|actuales?))/i, 'Spanish newsletter count keeps its current-subscriber meaning');

  const subscriberResults = extractElement(newsletterCard, null, 'data-stats-results');
  assert.ok(subscriberResults, `${locale} current subscribers need their existing results region`);
  mustNotContain(subscriberResults.html, locale === 'en' ? 'cumulative' : 'total acumulado',
    `${locale} current subscribers must not be labeled as a cumulative total`);
  const subscriberCountRegion = extractElement(subscriberResults.html, null, 'data-stats-count-region');
  assert.ok(subscriberCountRegion, `${locale} current subscribers need their own labeled count region`);
  if (locale === 'en') assert.match(normalizedText(subscriberCountRegion.html), /current|currently/i, 'English current label stays with the subscriber count');
  else assert.match(normalizedText(subscriberCountRegion.html), /actual(?:es|mente)?|vigentes?/i, 'Spanish current label stays with the subscriber count');
  const newsletterEmailRegions = [
    {
      attribute: 'data-stats-newsletter-email-opens',
      label: locale === 'en' ? /email opens?/i : /aperturas? de emails?/i,
      loading: locale === 'en' ? /loading.*opens?/i : /cargando.*aperturas?/i
    },
    {
      attribute: 'data-stats-newsletter-email-verified-clicks',
      label: locale === 'en' ? /verified email clicks?/i : /clics? verificados? en emails?/i,
      loading: locale === 'en' ? /loading.*verified.*clicks?/i : /cargando.*clics?.*verificados?/i
    }
  ];
  for (const metric of newsletterEmailRegions) {
    const region = extractElement(newsletterCard, null, metric.attribute);
    assert.ok(region, `${locale} newsletter needs its independent ${metric.attribute} region`);
    assert.ok(region.end <= subscriberResults.start || region.start >= subscriberResults.end,
      `${locale} ${metric.attribute} must be outside the subscriber results so missing subscribers cannot hide it`);
    for (const field of ['status', 'results', 'value', 'unit', 'coverage', 'interval', 'collected-date']) {
      mustContain(region.html, `${metric.attribute}-${field}`, `${locale} ${metric.attribute} needs its ${field} selector`);
    }
    const regionText = normalizedText(region.html);
    assert.match(regionText, metric.label, `${locale} ${metric.attribute} names its event metric`);
    const status = extractElement(region.html, null, `${metric.attribute}-status`);
    assert.ok(status, `${locale} ${metric.attribute} needs its own status`);
    mustContain(status.html, 'role="status"', `${locale} ${metric.attribute} status has a status role`);
    mustContain(status.html, 'aria-live="polite"', `${locale} ${metric.attribute} status announces changes politely`);
    assert.match(normalizedText(status.html), metric.loading, `${locale} ${metric.attribute} has a localized loading state`);
    const unavailableAttribute = `${metric.attribute}-unavailable`;
    mustContain(region.html, `${unavailableAttribute}=`, `${locale} ${metric.attribute} needs localized unavailable copy`);
    const unavailable = region.html.match(new RegExp(`\\b${unavailableAttribute}=["']([^"']+)["']`, 'i'))?.[1] ?? '';
    const unavailableText = normalizedText(unavailable);
    if (locale === 'en') assert.match(unavailableText, /unavailable|not available/i, `English ${metric.attribute} unavailable copy is meaningful`);
    else assert.match(unavailableText, /no disponible|no disponibles|no se pueden/i, `Spanish ${metric.attribute} unavailable copy is meaningful`);
  }

  const sentAttribute = 'data-stats-newsletter-sent';
  const sentRegion = extractElement(newsletterCard, null, sentAttribute);
  assert.ok(sentRegion, `${locale} Newsletter needs a separate reported sent-total row`);
  assert.ok(sentRegion.end <= subscriberResults.start || sentRegion.start >= subscriberResults.end,
    `${locale} reported sent total must be outside current-subscriber results`);
  for (const metric of newsletterEmailRegions) {
    const emailRegion = extractElement(newsletterCard, null, metric.attribute);
    assert.ok(emailRegion, `${locale} ${metric.attribute} remains available beside sent totals`);
    assert.ok(sentRegion.end <= emailRegion.start || sentRegion.start >= emailRegion.end,
      `${locale} reported sent total stays separate from email-activity metrics`);
  }
  for (const field of ['status', 'results', 'value', 'coverage', 'collected-date']) {
    mustContain(sentRegion.html, `${sentAttribute}-${field}`, `${locale} reported sent total needs its ${field} selector`);
  }
  assert.ok(!new RegExp(`${sentAttribute}-(?:interval|start-date|end-date)\\b`, 'i').test(sentRegion.html),
    `${locale} reported sent total must not imply a selected activity period or invented coverage dates`);
  const sentText = normalizedText(sentRegion.html);
  if (locale === 'en') assert.match(sentText, /emails? sent.{0,60}cumulative totals?/, 'English sent row says this is a cumulative total');
  else assert.match(sentText, /emails? enviados?.{0,60}total acumulado/, 'Spanish sent row says this is a cumulative total');

  const sentLabelReference = sentRegion.html.match(/\baria-labelledby=["']([^"']+)["']/i)?.[1];
  const sentAccessibleName = sentRegion.html.match(/\baria-label=["']([^"']+)["']/i)?.[1];
  assert.ok(sentLabelReference || sentAccessibleName, `${locale} reported sent-total row has an accessible name`);
  if (sentLabelReference) {
    assert.ok(new RegExp(`<[^>]*\\bid=["']${sentLabelReference}["'][^>]*>`, 'i').test(sentRegion.html),
      `${locale} reported sent-total row references its own label`);
  }
  if (sentAccessibleName) {
    assert.match(normalizedText(sentAccessibleName), locale === 'en' ? /emails? sent.*cumulative total/ : /emails? enviados?.*total acumulado/,
      `${locale} reported sent-total accessible name is localized`);
  }
  const sentStatus = extractElement(sentRegion.html, null, `${sentAttribute}-status`);
  assert.ok(sentStatus, `${locale} reported sent total needs its own loading and unavailable status`);
  mustContain(sentStatus.html, 'role="status"', `${locale} sent-total status has a status role`);
  mustContain(sentStatus.html, 'aria-live="polite"', `${locale} sent-total status announces updates politely`);
  assert.match(normalizedText(sentStatus.html), locale === 'en' ? /loading.*emails? sent/ : /cargando.*emails? enviados?/,
    `${locale} sent-total status has localized loading copy`);
  assert.match(sentStatus.html, /\shidden(?:\s|=|>)/i, `${locale} sent-total loading copy starts hidden without JavaScript`);
  const sentResults = extractElement(sentRegion.html, null, `${sentAttribute}-results`);
  assert.ok(sentResults, `${locale} reported sent total needs its own results region`);
  assert.match(sentResults.html, /\shidden(?:\s|=|>)/i, `${locale} sent-total results start hidden without JavaScript`);
  const sentValue = extractElement(sentResults.html, null, `${sentAttribute}-value`);
  assert.ok(sentValue, `${locale} reported sent total needs a value element`);
  assert.equal(normalizedText(sentValue.html), '', `${locale} sent total has no initial placeholder number`);
  const sentUnavailable = sentRegion.html.match(/data-stats-newsletter-sent-unavailable=["']([^"']+)["']/i)?.[1] ?? '';
  if (locale === 'en') assert.match(normalizedText(sentUnavailable), /unavailable|not available/, 'English sent-total unavailable copy is meaningful');
  else assert.match(normalizedText(sentUnavailable), /no disponible|no disponibles|no se pueden/, 'Spanish sent-total unavailable copy is meaningful');

  const sentDisclosureParagraph = sourceBullets.find((bullet) => locale === 'en'
    ? /emails? sent/i.test(bullet)
    : /emails? enviados?/i.test(bullet));
  assert.ok(sentDisclosureParagraph, `${locale} sources disclosure explains the sent-email basis`);
  if (locale === 'en') {
    assert.match(sentDisclosureParagraph, /provider|beehiiv/i, 'English disclosure identifies the provider-reported figure');
    assert.match(sentDisclosureParagraph, /reported/i, 'English disclosure qualifies the provider figure as reported');
    assert.match(sentDisclosureParagraph, /cumulative/i, 'English disclosure identifies the figure as cumulative');
    assert.ok([
      /(?:multiple|several|repeated|more than one)[\s\S]{0,50}(?:emails?|sends?)[\s\S]{0,80}(?:one|same|single)[\s\S]{0,30}(?:person|people|recipient|subscriber)/i,
      /(?:one|same|single)[\s\S]{0,30}(?:person|people|recipient|subscriber)[\s\S]{0,80}(?:multiple|several|repeated|more than one)[\s\S]{0,50}(?:emails?|sends?)/i,
      /(?:emails?|sends?)[\s\S]{0,50}(?:per|for each|to each)[\s\S]{0,30}(?:person|people|recipient|subscriber)/i,
      /(?:emails?|sends?)[\s\S]{0,60}(?:can|may|might)[\s\S]{0,50}repeat/i
    ].some((pattern) => pattern.test(sentDisclosureParagraph)),
    'English disclosure says sends can repeat for one person');
    assert.match(sentDisclosureParagraph, /history[\s\S]{0,100}(?:incomplete|partial|gaps?)|(?:incomplete|partial|gaps?)[\s\S]{0,100}history/i,
      'English disclosure says available history can be partial');
    assert.match(sentDisclosureParagraph, /(?:may|can|might|could)[\s\S]{0,80}(?:revis|chang|updat)|(?:revis|chang|updat)[\s\S]{0,80}(?:may|can|might|could)/i,
      'English disclosure says the provider figure may be revised');
    assert.match(sentDisclosureParagraph, /(?:not|does not|is not|independent of|separate from)[\s\S]{0,100}(?:(?:selected|chosen|activity|reporting)[\s\S]{0,40}period|period selection)|(?:(?:selected|chosen|activity|reporting)[\s\S]{0,40}period|period selection)[\s\S]{0,100}(?:not|does not|is not|independent)/i,
      'English disclosure separates the total from the selected activity period');
  } else {
    assert.match(sentDisclosureParagraph, /proveedor|beehiiv/i, 'Spanish disclosure identifies the provider-reported figure');
    assert.match(sentDisclosureParagraph, /informad|reportad/i, 'Spanish disclosure qualifies the provider figure as reported');
    assert.match(sentDisclosureParagraph, /acumulad/i, 'Spanish disclosure identifies the figure as cumulative');
    assert.ok([
      /(?:varios|multiples|repetidos?|mas de uno)[\s\S]{0,50}(?:emails?|envios?)[\s\S]{0,80}(?:una misma|la misma|una sola|cada)[\s\S]{0,40}(?:personas?|destinatarios?|suscriptores?)/i,
      /(?:una|la misma|cada)[\s\S]{0,30}(?:personas?|destinatarios?|suscriptores?)[\s\S]{0,80}(?:varios|multiples|repetidos?|mas de uno)[\s\S]{0,50}(?:emails?|envios?)/i,
      /(?:emails?|envios?)[\s\S]{0,50}(?:por|para cada|a cada)[\s\S]{0,30}(?:personas?|destinatarios?|suscriptores?)/i,
      /(?:emails?|envios?)[\s\S]{0,60}(?:pueden|puede|podrian|podria)[\s\S]{0,50}repet/i
    ].some((pattern) => pattern.test(sentDisclosureParagraph)),
    'Spanish disclosure says sends can repeat for one person');
    assert.match(sentDisclosureParagraph, /historial[\s\S]{0,100}(?:incompleto|parcial|lagunas?)|(?:incompleto|parcial|lagunas?)[\s\S]{0,100}historial/i,
      'Spanish disclosure says available history can be partial');
    assert.match(sentDisclosureParagraph, /(?:puede|podria|pueden|podrian)[\s\S]{0,80}(?:revis|cambi|actualiz|correg)|(?:revis|cambi|actualiz|correg)[\s\S]{0,80}(?:puede|podria|pueden|podrian)/i,
      'Spanish disclosure says the provider figure may be revised');
    assert.match(sentDisclosureParagraph, /(?:no|independiente de|separado de)[\s\S]{0,100}(?:periodo de actividad|periodo seleccionado|periodo)|(?:periodo de actividad|periodo seleccionado|periodo)[\s\S]{0,100}(?:no|independiente|separado)/i,
      'Spanish disclosure separates the total from the selected activity period');
  }

  const emailDisclosure = sourcesCopy;
  if (locale === 'en') {
    assert.match(emailDisclosure, /opens?[\s\S]{0,250}tracking[- ]?pixels?[\s\S]{0,180}(?:privacy|machine|automated|prefetch)|tracking[- ]?pixels?[\s\S]{0,250}opens?[\s\S]{0,180}(?:privacy|machine|automated|prefetch)/i,
      'English disclosure qualifies tracking-pixel opens for privacy or machine loads');
    assert.match(emailDisclosure, /(?:miss|not detect|fail to register|not register|underestimate)[\s\S]{0,100}(?:reads?|opens?)|(?:reads?|opens?)[\s\S]{0,100}(?:miss|not detect|fail to register|not register|underestimate)/i,
      'English disclosure says pixel opens can miss reads');
    const verifiedClickDisclosure = sourceBullets.find((bullet) => /verified(?: email)? clicks?/i.test(bullet));
    assert.ok(verifiedClickDisclosure, 'English disclosure has a verified-email-click explanation');
    assert.match(verifiedClickDisclosure, /verified(?: email)? clicks?[\s\S]{0,180}beehiiv[- ]filtered events?|beehiiv[- ]filtered events?[\s\S]{0,180}verified(?: email)? clicks?/i,
      'English disclosure says verified clicks are filtered events');
    assert.match(emailDisclosure, /verified(?: email)? clicks?[\s\S]{0,180}(?:repeat|more than once|multiple times)|(?:repeat|more than once|multiple times)[\s\S]{0,180}verified(?: email)? clicks?/i,
      'English disclosure says verified clicks can repeat');
    assert.match(emailDisclosure, /verified(?: email)? clicks?[\s\S]{0,180}(?:not|never|do not|does not)[\s\S]{0,80}(?:unique|people)|(?:not|never|do not|does not)[\s\S]{0,80}(?:unique people|distinct people)[\s\S]{0,180}verified(?: email)? clicks?/i,
      'English disclosure says verified clicks are not unique people');
    assert.match(emailDisclosure, /(?:available|returned|provided)[\s\S]{0,120}history|history[\s\S]{0,120}(?:available|returned|provided)|currently available data|data (?:currently )?returned/i,
      'English disclosure limits figures to currently returned history');
    assert.match(emailDisclosure, /(?:can|may|might)[\s\S]{0,60}(?:omit|miss|incomplete|gap|not include)[\s\S]{0,100}activity|activity[\s\S]{0,100}(?:can|may|might)[\s\S]{0,60}(?:omit|miss|missing|incomplete)/i,
      'English disclosure avoids a completeness claim');
    assert.match(emailDisclosure, /(?:can|may|might)[\s\S]{0,60}(?:change|revise|update)[\s\S]{0,80}(?:later|again)|(?:later|again)[\s\S]{0,80}(?:change|revision|update)/i,
      'English disclosure warns reported figures may change');
  } else {
    assert.match(emailDisclosure, /aperturas?[\s\S]{0,250}pixel(?:es)? de seguimiento[\s\S]{0,180}(?:privacidad|maquina|automatic|precarga)|pixel(?:es)? de seguimiento[\s\S]{0,250}aperturas?[\s\S]{0,180}(?:privacidad|maquina|automatic|precarga)/i,
      'Spanish disclosure qualifies tracking-pixel opens for privacy or machine loads');
    assert.match(emailDisclosure, /(?:no detect|no registr|no medir|subestim)[\s\S]{0,100}(?:lecturas?|aperturas?)|(?:lecturas?|aperturas?)[\s\S]{0,100}(?:no detect|no registr|no medir|subestim)/i,
      'Spanish disclosure says pixel opens can miss reads');
    const verifiedClickDisclosure = sourceBullets.find((bullet) => /clics? verificados? en emails?/i.test(bullet));
    assert.ok(verifiedClickDisclosure, 'Spanish disclosure has a verified-email-click explanation');
    assert.match(verifiedClickDisclosure, /clics? verificados? en emails?[\s\S]{0,180}eventos? filtrados? por beehiiv|eventos? filtrados? por beehiiv[\s\S]{0,180}clics? verificados? en emails?/i,
      'Spanish disclosure says verified clicks are filtered events');
    assert.match(emailDisclosure, /clics? verificados?[\s\S]{0,180}(?:repet|mas de una vez|varias veces)|(?:repet|mas de una vez|varias veces)[\s\S]{0,180}clics? verificados?/i,
      'Spanish disclosure says verified clicks can repeat');
    assert.match(emailDisclosure, /clics? verificados?[\s\S]{0,180}(?:no|nunca)[\s\S]{0,80}(?:personas?|unicas?|distintas?)|(?:no|nunca)[\s\S]{0,80}(?:personas? unicas?|personas? distintas?)[\s\S]{0,180}clics? verificados?/i,
      'Spanish disclosure says verified clicks are not unique people');
    assert.match(emailDisclosure, /(?:historial|historia|datos?|informacion)[\s\S]{0,120}(?:disponible|devuelt[oa]s?|proporcionad[oa]s?)|(?:disponible|devuelt[oa]s?|proporcionad[oa]s?)[\s\S]{0,120}(?:historial|historia|datos?|informacion)/i,
      'Spanish disclosure limits figures to currently returned history');
    assert.match(emailDisclosure, /(?:puede|podria)[\s\S]{0,60}(?:faltar|omitirse|excluir|no incluir)[\s\S]{0,100}actividad|actividad[\s\S]{0,100}(?:puede|podria)[\s\S]{0,60}(?:faltar|omitirse|excluir|no incluir)/i,
      'Spanish disclosure avoids a completeness claim');
    assert.match(emailDisclosure, /(?:puede|podria|pueden|podrian)[\s\S]{0,60}(?:cambiar|revisar|actualizar)[\s\S]{0,80}(?:despues|mas adelante|nuevamente)|(?:despues|mas adelante)[\s\S]{0,80}(?:cambiar|revision|actualizar)/i,
      'Spanish disclosure warns reported figures may change');
  }
  mustContainText(statsHtml, 'Caylent', `${locale} Caylent source disclosure`);
  mustContainText(statsHtml, 'AWS Builder Center', `${locale} AWS Builder Center source disclosure`);
  for (const phrase of locale === 'en'
    ? ['Translations count by content language', 'matching titles in one language count once', 'partial coverage']
    : ['Las traducciones se cuentan según su idioma', 'los títulos iguales en un mismo idioma cuentan una vez', 'cobertura parcial']) {
    mustContainText(statsHtml, phrase, `${locale} counting disclosure: ${phrase}`);
  }
  mustContainText(statsHtml, locale === 'en'
    ? 'Talk and book languages follow their original titles'
    : 'El idioma de las charlas y los libros se determina por sus títulos originales',
  `${locale} title-language classification disclosure`);
  const disclosure = sourcesDisclosure.html;
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
  // Guard source facts here; direct bilingual verification assesses the full explanation.
  const builderViewsDisclosureFacts = locale === 'en' ? [
    [/builder center/i, 'Builder Center source'],
    [/january\s+6,?\s+2026|2026-01-06/, 'January 6, 2026 tracking boundary'],
    [/24[- ]hours?/i, '24-hour source counting window'],
    [/own visits?|author.{0,40}visits?|visits?.{0,40}author/i, 'author-visit rule'],
    [/repeat|return/i, 'repeat-visit meaning'],
    [/republication|republished/i, 'republication coverage'],
    [/recorded|counter/i, 'recorded counter basis'],
    [/not.{0,40}unique|unique.{0,40}not/i, 'unique-reader limitation'],
    [/not.{0,60}(?:complete lifetime|lifetime total)|incomplete.{0,40}lifetime/i, 'complete-lifetime limitation']
  ] : [
    [/builder center/i, 'fuente Builder Center'],
    [/6 de enero de 2026|2026-01-06/, 'inicio del registro el 6 de enero de 2026'],
    [/24[- ]horas?/i, 'ventana de conteo de 24 horas'],
    [/visitas?.{0,40}(?:propias?|autor|guille)|(?:propias?|autor|guille).{0,40}visitas?/i, 'regla de visitas del autor'],
    [/repet|regresa|vuelve|retorno/i, 'significado de las visitas repetidas'],
    [/republicaciones?|articulos? republicados?/i, 'cobertura de republicaciones'],
    [/registrad|contador/i, 'base del contador registrado'],
    [/no.{0,40}(?:personas? unic|visitantes? unic)/i, 'limite de personas unicas'],
    [/no.{0,60}(?:historial completo|total de por vida|toda la vida)/i, 'limite del historial completo']
  ];
  for (const [pattern, fact] of builderViewsDisclosureFacts) {
    assert.match(disclosureText, pattern, `${locale} source disclosure explains ${fact}`);
  }
  const builderObservationDisclosure = sourceBullets.filter((bullet) => /Builder Center/i.test(bullet)).join(' ');
  assert.match(builderObservationDisclosure, /manual/i, `${locale} Builder Center disclosure identifies manual maintenance`);
  assert.match(builderObservationDisclosure, locale === 'en' ? /observ(?:ation|ed)/i : /observa/i,
    `${locale} Builder Center disclosure distinguishes the observation date from daily collection`);
  const articleCountDisclosure = sourceBullets.find((bullet) =>
    /Simple AWS/i.test(bullet)
      && (locale === 'en' ? /article\s+counts?/i : /conteo\s+de\s+art[ií]culos/i).test(bullet));
  assert.ok(articleCountDisclosure, `${locale} disclosure connects Simple AWS to article-count coverage`);
  assert.match(articleCountDisclosure, /\bweb\b/i, `${locale} Simple AWS count disclosure includes web posts`);
  assert.match(articleCountDisclosure, locale === 'en' ? /\bemail\b|e-mail/i : /correo(?:\s+electr[oó]nico)?|email/i,
    `${locale} Simple AWS count disclosure includes email posts`);
  assert.match(articleCountDisclosure, locale === 'en'
    ? /individually\s+(?:registered|maintained|selected)|selected\s+(?:individual\s+)?articles?/i
    : /art[ií]culos?[\s\S]{0,100}(?:individual|seleccion)|(?:registro|inventario)[\s\S]{0,100}individual/i,
  `${locale} article-count disclosure explains individual article selection`);
  for (const [pattern, name] of [
    [/dev community/i, 'DEV Community'],
    [/linkedin/i, 'LinkedIn'],
    [/spainclouds/i, 'SpainClouds'],
    [/hackernoon/i, 'HackerNoon']
  ]) {
    assert.match(articleCountDisclosure, pattern, `${locale} individual article coverage names ${name}`);
  }
  assert.match(articleCountDisclosure, locale === 'en'
    ? /registered sources?[\s\S]{0,80}(?:updates?|updated|refresh(?:es|ed)?)[\s\S]{0,50}automatic(?:ally)?|registered sources?[\s\S]{0,80}automatic(?:ally)?[\s\S]{0,50}(?:updates?|updated|refresh(?:es|ed)?)|automatic(?:ally)?[\s\S]{0,80}(?:updates?|updated|refresh(?:es|ed)?)[\s\S]{0,50}registered sources?/i
    : /fuentes? registradas?[\s\S]{0,80}(?:se\s+)?actualiz\w*[\s\S]{0,50}automatic(?:amente)?|fuentes? registradas?[\s\S]{0,80}automatic(?:amente)?[\s\S]{0,50}(?:se\s+)?actualiz\w*|automatic(?:amente)?[\s\S]{0,80}(?:se\s+)?actualiz\w*[\s\S]{0,50}fuentes? registradas?/i,
  `${locale} article-count disclosure says registered sources update automatically`);
  assert.match(articleCountDisclosure, locale === 'en'
    ? /(?:mixed (?:platforms?|sources?)[\s\S]{0,100}(?:not|aren't|are not)[\s\S]{0,30}(?:imported|included|counted)[\s\S]{0,40}(?:in full|completely|entirely|as a whole)|(?:only|just)[\s\S]{0,80}(?:individual(?:ly)? selected|selected individual|selected)[\s\S]{0,80}articles?[\s\S]{0,80}(?:from|on|in)[\s\S]{0,40}mixed (?:platforms?|sources?))/i
    : /(?:no[\s\S]{0,30}(?:se\s+)?importan?[\s\S]{0,40}(?:complet[oa]s?|enter[oa]s?|integralmente)[\s\S]{0,30}plataformas? mixtas?|plataformas? mixtas?[\s\S]{0,80}no[\s\S]{0,30}(?:se\s+)?importan?[\s\S]{0,40}(?:complet[oa]s?|enter[oa]s?|integralmente)|(?:solo|solamente|unicamente)[\s\S]{0,100}(?:articulos?[\s\S]{0,50}(?:individual|seleccionad)|(?:individual|seleccionad)[\s\S]{0,50}articulos?)[\s\S]{0,100}(?:de|desde|en)[\s\S]{0,40}plataformas? mixtas?)/i,
  `${locale} individual article coverage does not imply complete imports from mixed platforms`);
  const personalContentExclusion = locale === 'en'
    ? /(?:personal[\s\S]{0,80}(?:exclud|omit|not included|not counted|left out)|(?:exclud|omit|not included|not counted|left out)[\s\S]{0,80}personal)/i
    : /(?:personales?[\s\S]{0,80}(?:excluid|se excluy|omitid|no se incluye|no se cuenta)|(?:excluid|se excluy|omitid|no se incluye|no se cuenta)[\s\S]{0,80}personales?)/i;
  assert.match(articleCountDisclosure, personalContentExclusion,
    `${locale} editorial selection excludes personal material`);
  const promotionWithoutSubstanceExclusion = locale === 'en'
    ? /(?:promot(?:ion|ional)s?[\s\S]{0,80}(?:without|lacking|with no)[\s\S]{0,40}(?:substantive|substantial)[\s\S]{0,30}(?:content|material)[\s\S]{0,50}(?:exclud|omit|not included|not counted)|(?:exclud|omit|not included|not counted)[\s\S]{0,50}promot(?:ion|ional)s?[\s\S]{0,80}(?:without|lacking|with no)[\s\S]{0,40}(?:substantive|substantial)[\s\S]{0,30}(?:content|material))/i
    : /(?:promocion(?:al(?:es)?)?[\s\S]{0,80}sin[\s\S]{0,40}contenido[\s\S]{0,40}sustantivo[\s\S]{0,50}(?:excluid|omitid|no se incluye|no se cuenta)|(?:excluid|se excluy|omitid|no se incluye|no se cuenta)[\s\S]{0,80}promocion(?:al(?:es)?)?[\s\S]{0,80}sin[\s\S]{0,40}contenido[\s\S]{0,40}sustantivo)/i;
  assert.match(articleCountDisclosure, promotionWithoutSubstanceExclusion,
    `${locale} editorial selection excludes promotion only when it lacks substantive content`);
  assert.match(articleCountDisclosure, locale === 'en'
    ? /professional[\s\S]{0,100}(?:aws|guide)|aws[\s\S]{0,100}professional[\s\S]{0,100}guide/i
    : /(?:gu[ií]as?|art[ií]culos?)[\s\S]{0,80}profesionales?[\s\S]{0,100}aws|aws[\s\S]{0,100}(?:gu[ií]as?|art[ií]culos?)[\s\S]{0,80}profesionales?/i,
  `${locale} editorial selection retains professional AWS guides`);
  const cloudyThingsCountDisclosure = sourceBullets.find((bullet) =>
    /Cloudy Things/i.test(bullet)
      && (locale === 'en' ? /article\s+counts?/i : /conteo\s+de\s+art[ií]culos/i).test(bullet));
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
  const searchDisclosureParagraph = sourceBullets.find((bullet) => /search console/i.test(bullet));
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
    assert.match(searchDisclosureParagraph, /parcial|pueden? omitir|pueden? excluir|filtra|filtrado|limites? de (?:datos|informe)/i, 'Spanish disclosure identifies Search clicks as partial');
    assert.match(searchDisclosureParagraph, /canonicas?.{0,120}(articulos?|url)|(?:articulos?|url).{0,120}canonicas?|google.{0,80}(?:preferida|seleccionada|preferidos|seleccionados).{0,80}(?:articulo|url)/i, 'Spanish disclosure limits Search to canonical or Google-preferred article URLs');
    assert.match(searchDisclosureParagraph, /no (?:son|representan|identifican) (?:personas|visitantes|lectores) unic[oa]s|no representan a personas unicas/i, 'Spanish disclosure says clicks do not represent unique people');
    assert.match(searchDisclosureParagraph, /no se (?:suman|combinan|agregan)|se muestran por separado|se mantienen separad[oa]s?|separad[oa]s? de|distint[oa]s? de/i, 'Spanish disclosure keeps Search clicks separate from views');
    assert.match(searchDisclosureParagraph, /vistas?|analytics/i, 'Spanish separation statement names the existing views metric');
  }
  const directoryOutboundDisclosure = sourceBullets.find((bullet) => /donde aprendo aws/i.test(bullet)
    && (locale === 'en' ? /external[- ]link clicks?/i : /clics? registrados? en enlaces externos/i).test(bullet));
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
    assert.match(directoryOutboundDisclosure, /repet|varias veces|mas de una vez|mas de un clic/, 'Spanish disclosure says outbound clicks can repeat');
    assert.match(directoryOutboundDisclosure, /separad|no se suman|no se combinan|se informan aparte/,
      'Spanish disclosure keeps outbound clicks separate from page views');
  }

  const articlesCard = extractElement(statsHtml, 'article', 'data-stats-kind', 'articles');
  assert.ok(articlesCard, `${locale} needs an Articles card for independent views`);
  const countResults = extractElement(articlesCard.html, null, 'data-stats-results');
  const viewsRegion = extractElement(articlesCard.html, null, 'data-stats-views');
  const viewsHeading = extractElement(viewsRegion?.html ?? '', 'h4', 'id', 'content-stats-views-title');
  assert.ok(viewsHeading, `${locale} article views need a visible source heading`);
  mustContainText(viewsHeading.html, locale === 'en' ? 'Simple AWS page views' : 'Vistas de páginas de Simple AWS', `${locale} Simple AWS views heading`);
  const searchRegion = extractElement(articlesCard.html, null, 'data-stats-search');
  const searchHeading = extractElement(searchRegion?.html ?? '', 'h4', 'id', 'content-stats-search-title');
  assert.ok(searchHeading, `${locale} Search clicks need a visible heading`);
  mustContainText(searchHeading.html, locale === 'en' ? 'Google Search clicks · Simple AWS' : 'Clics de búsqueda de Google · Simple AWS', `${locale} Search heading includes its publication`);
  const builderViewsRegion = extractElement(articlesCard.html, null, 'data-stats-builder-views');
  assert.ok(countResults, `${locale} Articles needs its cumulative count results`);
  assert.ok(viewsRegion, `${locale} Articles needs an independent views region`);
  assert.ok(viewsRegion.start > countResults.start && viewsRegion.start >= countResults.end, `${locale} views region must sit outside and after count results`);
  assert.ok(builderViewsRegion, `${locale} Articles needs a separate Builder Center recorded-views row`);
  assert.ok(builderViewsRegion.start > countResults.start && builderViewsRegion.start >= countResults.end, `${locale} Builder Center views must sit outside count results`);
  assert.ok(builderViewsRegion.end <= viewsRegion.start || viewsRegion.end <= builderViewsRegion.start, `${locale} Builder Center views and GA4 Views must remain independent rows`);
  assert.ok(searchRegion, `${locale} Articles needs an independent Search clicks region`);
  assert.ok(searchRegion.start > countResults.start && searchRegion.start >= countResults.end, `${locale} Search region must sit outside and after count results`);
  assert.ok(searchRegion.end <= viewsRegion.start || viewsRegion.end <= searchRegion.start, `${locale} Search and Views regions must remain independent siblings`);
  assert.ok(builderViewsRegion.end <= searchRegion.start || searchRegion.end <= builderViewsRegion.start, `${locale} Builder Center views and Search clicks must remain independent rows`);
  const builderTitle = extractElement(builderViewsRegion.html, 'h4', 'id', 'content-stats-builder-views-title')
    ?? extractElement(builderViewsRegion.html, 'h3', 'id', 'content-stats-builder-views-title')
    ?? extractElement(builderViewsRegion.html, 'p', 'id', 'content-stats-builder-views-title');
  assert.ok(builderTitle, `${locale} Builder Center row needs its own visible title`);
  mustContainText(builderTitle.html, locale === 'en'
    ? 'Builder Center views · recorded total'
    : 'Vistas en Builder Center · total registrado', `${locale} Builder Center row title`);
  assert.match(disclosureText, /recorded|counter|total/i, `${locale} Builder Center disclosure identifies source-recorded activity`);
  mustContain(builderViewsRegion.html, 'aria-labelledby="content-stats-builder-views-title"', `${locale} Builder Center row is named by its title`);
  for (const field of ['status', 'result', 'value', 'coverage', 'since', 'collected-date', 'provenance']) {
    const attribute = `data-stats-builder-views-${field}`;
    assert.ok(new RegExp(`\\b${attribute}(?:\\s|=|>)`, 'i').test(builderViewsRegion.html), `${locale} Builder Center row needs ${field}`);
  }
  const builderStatus = extractElement(builderViewsRegion.html, null, 'data-stats-builder-views-status');
  assert.ok(builderStatus, `${locale} Builder Center row needs a loading and unavailable status`);
  mustContain(builderStatus.html, 'role="status"', `${locale} Builder Center status has a status role`);
  mustContain(builderStatus.html, 'aria-live="polite"', `${locale} Builder Center status announces updates politely`);
  if (locale === 'en') {
    assert.match(normalizedText(builderStatus.html), /loading.*Builder Center/i, 'English Builder Center status has localized loading copy');
    assert.match(builderViewsRegion.html, /data-stats-builder-views-unavailable=["'][^"']*(?:unavailable|not available)/i, 'English Builder Center row has localized unavailable copy');
    assert.match(normalizedText(builderViewsRegion.html), /coverage|source/i, 'English Builder Center metadata labels source coverage');
    assert.match(normalizedText(builderViewsRegion.html), /since|tracking starts?|tracking begins/i, 'English Builder Center metadata labels the tracking start date');
    assert.match(normalizedText(builderViewsRegion.html), /observ(?:ation|ed)/i, 'English Builder Center metadata labels the observation date');
    assert.match(normalizedText(builderViewsRegion.html), /method|provenance|maintenance/i, 'English Builder Center metadata labels the observation provenance');
  } else {
    assert.match(normalizedText(builderStatus.html), /cargando.*Builder Center/i, 'Spanish Builder Center status has localized loading copy');
    assert.match(builderViewsRegion.html, /data-stats-builder-views-unavailable=["'][^"']*(?:no disponible|no disponibles|no est[aá]n disponibles|no se pueden)/i, 'Spanish Builder Center row has localized unavailable copy');
    assert.match(normalizedText(builderViewsRegion.html), /cobertura|fuente/i, 'Spanish Builder Center metadata labels source coverage');
    assert.match(normalizedText(builderViewsRegion.html), /desde|inicio|inicia|comienza/i, 'Spanish Builder Center metadata labels the tracking start date');
    assert.match(normalizedText(builderViewsRegion.html), /observa/i, 'Spanish Builder Center metadata labels the observation date');
    assert.match(normalizedText(builderViewsRegion.html), /metodo|procedencia|mantenimiento/i, 'Spanish Builder Center metadata labels the observation provenance');
  }
  assert.match(builderStatus.html, /\shidden(?:\s|=|>)/i, `${locale} Builder Center loading status starts hidden without JavaScript`);
  const builderResult = extractElement(builderViewsRegion.html, null, 'data-stats-builder-views-result');
  assert.ok(builderResult, `${locale} Builder Center row needs its independent result region`);
  assert.match(builderResult.html, /\shidden(?:\s|=|>)/i, `${locale} Builder Center result starts hidden without JavaScript`);
  const builderCount = extractElement(builderResult.html, 'p', 'role', 'status');
  assert.ok(builderCount, `${locale} Builder Center value needs an accessible result label`);
  mustContain(builderCount.html, 'aria-live="polite"', `${locale} Builder Center value announces updates politely`);
  mustContain(builderCount.html, 'aria-atomic="true"', `${locale} Builder Center value is announced as one result`);
  const builderValue = extractElement(builderCount.html, null, 'data-stats-builder-views-value');
  assert.ok(builderValue, `${locale} Builder Center accessible result needs its value`);
  assert.equal(normalizedText(builderValue.html), '', `${locale} Builder Center result has no static placeholder number`);
  for (const field of ['coverage', 'since', 'collected-date', 'provenance']) {
    const value = extractElement(builderResult.html, null, `data-stats-builder-views-${field}`);
    assert.ok(value, `${locale} Builder Center result needs its own ${field} metadata`);
    assert.equal(normalizedText(value.html), '', `${locale} Builder Center ${field} is empty before JavaScript loads`);
  }
  assert.ok(!/data-stats-builder-views-(?:interval|period|start-date|end-date)\b/i.test(builderViewsRegion.html), `${locale} Builder Center recorded total must not imply selected-period dates`);
  assert.match(builderViewsRegion.html, /^<[^>]+\saria-busy=["']false["'](?:\s|>)/i, `${locale} Builder Center row is not permanently busy without JavaScript`);
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
  assert.ok(noScriptPosition - sectionPosition < reportDisclosure.start
    || noScriptPosition - sectionPosition >= reportDisclosure.end,
  `${locale} no-JavaScript message stays visible outside the initially closed report`);
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
  checkHomeIntroduction(page, html);
  checkNewsletterActions(page, html);
  checkContentStatsShell(page, html);

  const featuredProjectCards = html.match(/class="support-card"/g) ?? [];
  const archivedProjectRows = html.match(/class="talk-archive-item work-archive-item"/g) ?? [];
  assert.equal(featuredProjectCards.length, projects.filter((project) => project.featured).length, `${page.lang} featured project count`);
  assert.equal(archivedProjectRows.length, projects.filter((project) => !project.featured).length, `${page.lang} archived project count`);
  for (const project of projects) mustContainText(html, project.title[page.lang], `${page.lang} project ${project.id}`);
  const archiveItems = html.match(/class="talk-archive-item"/g) ?? [];
  assert.equal(archiveItems.length, talks.length, `${page.lang} archive item count`);
  const yearGroups = html.match(/class="talk-year-group"/g) ?? [];
  assert.equal(yearGroups.length, new Set(talks.map((talk) => talk.year)).size, `${page.lang} archive year count`);
  for (const talk of talks) mustContainText(html, talk.title[page.lang], `${page.lang} archive item ${talk.id}`);
  checkWorkHighlights(page, html);
  checkAuthorshipAndAbout(page, html);
  checkSpeakerResources(page, html);
  checkOctoberMeetup(page, html);
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
const hasNewsletterEngagements = Object.hasOwn(sourceConfig, 'newsletterEngagements');
const hasManualBuilderObservation = Object.hasOwn(sourceConfig, 'builderArticleViews');
const hasIndividualArticleInventory = Object.hasOwn(inputs, 'articleInventory');
if (hasNewsletterEngagements) assert.equal(sourceConfig.newsletterEngagements, true, 'newsletter engagement selection must be the literal true opt-in');
const hasDirectoryOutboundClicks = hasDirectoryAnalyticsSelection
  && Object.hasOwn(sourceConfig.directoryAnalytics ?? {}, 'outboundClicks');
const hasDirectoryRecordedTotal = hasDirectoryAnalyticsSelection
  && Object.hasOwn(sourceConfig.directoryAnalytics ?? {}, 'recordedSince');
assert.deepEqual(Object.keys(inputs).sort(), [
  'curated',
  'definitionVersion',
  ...(hasNewsletterSelection ? ['newsletter'] : []),
  ...(hasNewsletterEngagements ? ['newsletterEngagements'] : []),
  ...(hasAnalyticsSelection ? ['analytics'] : []),
  ...(hasSearchConsoleSelection ? ['searchConsole'] : []),
  ...(hasDirectoryAnalyticsSelection ? ['directoryAnalytics'] : []),
  ...(hasManualBuilderObservation ? ['builderArticleViews'] : []),
  ...(hasIndividualArticleInventory ? ['articleInventory'] : []),
  'schemaVersion',
  'sources'
].sort(),
'protected build input must combine source configuration and maintained facts without credentials');
assert.equal(hasDirectoryAnalyticsSelection, Object.hasOwn(sourceConfig, 'directoryAnalytics'), 'directory selector and protected input must be published together');
if (hasDirectoryOutboundClicks) assert.equal(sourceConfig.directoryAnalytics.outboundClicks, true, 'outbound clicks require the literal true selector');
assert.equal(inputs.schemaVersion, hasIndividualArticleInventory ? 12 : hasManualBuilderObservation ? 11 : hasNewsletterEngagements ? 10 : hasDirectoryRecordedTotal ? 9 : hasDirectoryOutboundClicks ? 8 : hasDirectoryAnalyticsSelection ? 7 : hasSearchConsoleSelection ? 6 : hasAnalyticsSelection ? 5 : hasNewsletterSelection ? 4 : 3, 'protected build input schema version');
assert.equal(inputs.definitionVersion, 1, 'protected build input definition version');
assert.ok(Array.isArray(inputs.sources), 'protected build input sources must be an array');
if (hasIndividualArticleInventory) {
  const maintainedArticles = readContent('articles.json');
  assert.deepEqual(Object.keys(inputs.articleInventory).sort(), ['exclusions', 'publications'],
    'the article inventory has no separate counts or private provider data');
  assert.deepEqual(inputs.articleInventory.publications, maintainedArticles.publications,
    'protected input preserves the complete maintained publication metadata');
  assert.deepEqual(inputs.articleInventory.exclusions,
    maintainedArticles.exclusions.map(({ sourceId, url }) => ({ sourceId, url })),
    'stable exclusions project once without editorial notes or excluded titles');
  const individuallyMaintainedSources = new Set(['dev-community', 'linkedin-articles', 'spainclouds', 'hackernoon']);
  assert.equal(inputs.sources.some((source) => individuallyMaintainedSources.has(source.id)), false,
    'an individual publication never enables a complete mixed-platform import');
}
if (hasManualBuilderObservation) {
  assert.deepEqual(Object.keys(sourceConfig.builderArticleViews).sort(), ['observedAt', 'views'], 'maintained Builder observation contains only its real date and language totals');
  assert.deepEqual(Object.keys(sourceConfig.builderArticleViews.views).sort(), ['en', 'es'], 'All is derived, not maintained separately');
  assert.deepEqual(inputs.builderArticleViews, sourceConfig.builderArticleViews, 'protected input projects the manual Builder observation without refreshing its date');
} else {
  assert.equal(Object.hasOwn(inputs, 'builderArticleViews'), false, 'no synthetic manual observation is generated when the owner has not supplied one');
}
if (hasNewsletterEngagements) {
  assert.ok(hasNewsletterSelection, 'newsletter engagement opt-in requires the existing Newsletter publication');
  assert.equal(Object.hasOwn(inputs, 'newsletterEngagements'), true, 'protected input must include its explicit engagement selector');
  assert.equal(inputs.newsletterEngagements, true, 'engagement selector projects the literal true opt-in');
  assert.equal(sourceConfig.schemaVersion, 2, 'the maintained source selector remains schema 2');
} else {
  assert.equal(Object.hasOwn(inputs, 'newsletterEngagements'), false, 'protected input contains no engagement selector while email activity is disabled');
}
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
    'hostname', 'id', 'language', 'propertyId', 'timeZone',
    ...(hasDirectoryOutboundClicks ? ['outboundClicks'] : []),
    ...(hasDirectoryRecordedTotal ? ['recordedSince'] : [])
  ].sort(), 'maintained directory Analytics selector must contain only its source, scope facts, and optional click opt-in and recorded-history date');
  assert.equal(sourceConfig.directoryAnalytics.id, 'donde-aprendo-aws', 'directory selector identity');
  assert.equal(sourceConfig.directoryAnalytics.propertyId, '424203315', 'directory selector uses the verified GA4 property');
  assert.equal(sourceConfig.directoryAnalytics.hostname, 'dondeaprendoaws.com', 'directory selector covers the production apex hostname');
  assert.equal(sourceConfig.directoryAnalytics.language, 'es', 'directory language follows the Spanish original content');
  assert.equal(sourceConfig.directoryAnalytics.timeZone, 'America/Buenos_Aires', 'directory selector uses the verified GA4 property timezone');
  if (hasDirectoryRecordedTotal) {
    const recordedSince = sourceConfig.directoryAnalytics.recordedSince;
    assert.ok(typeof recordedSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(recordedSince), 'directory recorded total needs a configured start date');
    const parsedRecordedSince = new Date(`${recordedSince}T00:00:00.000Z`);
    assert.ok(Number.isFinite(parsedRecordedSince.getTime()) && parsedRecordedSince.toISOString().slice(0, 10) === recordedSince,
      'directory recorded-total start must be a real date');
  }
  assert.deepEqual(inputs.directoryAnalytics, sourceConfig.directoryAnalytics,
    `protected input${hasDirectoryRecordedTotal ? '9' : hasDirectoryOutboundClicks ? '8' : '7'} projects the exact maintained selector`);
} else {
  assert.ok(!Object.hasOwn(sourceConfig, 'directoryAnalytics'), 'compatible generated input remains valid before directory enablement');
}
const simpleAwsArticleSource = sourceConfig.sources.find((source) => source?.id === 'simple-aws');
const cloudyThingsArticleSource = sourceConfig.sources.find((source) => source?.id === 'cloudy-things');
const dondeAprendoAwsArticleSource = sourceConfig.sources.find((source) => source?.id === 'donde-aprendo-aws');
const awsForEngineersArticleSource = sourceConfig.sources.find((source) => source?.id === 'aws-for-engineers');
const expectedArticleSourceIds = [
  'builder-center',
  'caylent',
  ...(simpleAwsArticleSource ? ['simple-aws'] : []),
  ...(cloudyThingsArticleSource ? ['cloudy-things'] : []),
  ...(dondeAprendoAwsArticleSource ? ['donde-aprendo-aws'] : []),
  ...(awsForEngineersArticleSource ? ['aws-for-engineers'] : [])
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
if (dondeAprendoAwsArticleSource) {
  assert.deepEqual(dondeAprendoAwsArticleSource, { id: 'donde-aprendo-aws' },
    'Dónde Aprendo AWS article selection fixes the public index and author policy in code, without source-provided selectors');
}
if (awsForEngineersArticleSource) {
  assert.deepEqual(awsForEngineersArticleSource, { id: 'aws-for-engineers' },
    'AWS for Engineers article selection fixes the public index and author policy in code, without source-provided selectors');
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
    assert.match(privacyText, /aggregate.{0,60}(?:outbound|external)[- ]link clicks?|(?:outbound|external)[- ]link clicks?.{0,60}aggregate/i,
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
