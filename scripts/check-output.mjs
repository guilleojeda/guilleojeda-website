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
  mustNotContain(html, '<script', `${page.lang} runtime JavaScript`);

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

console.log('Static output checks passed for /, /es/, and /404.html.');
