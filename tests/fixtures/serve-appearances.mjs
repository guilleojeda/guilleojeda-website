import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dist = resolve(root, 'dist');
const host = '127.0.0.1';
const defaultPort = 5188;
const fixtureNames = new Set(['nov11', 'nov15', 'dec2', 'dec5', 'many', 'live', 'empty', 'invalid', 'noscript']);
const fixedClocks = {
  nov11: '2026-11-11T15:00:00.000Z', // Noon in Córdoba.
  nov15: '2026-11-15T03:00:00.000Z', // Midnight in Córdoba.
  dec2: '2026-12-02T17:00:00.000Z', // 09:00 PST.
  dec5: '2026-12-05T15:00:00.000Z' // Noon in Córdoba.
};

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${label} at ${relative(root, file)}: ${error.message}`);
  }
}

function attribute(openingTag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = openingTag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function appearancePayload(html, label) {
  const blocks = [];
  const scriptPattern = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
  let match;
  while ((match = scriptPattern.exec(html))) {
    const openingEnd = match[0].indexOf('>') + 1;
    const opening = match[0].slice(0, openingEnd);
    if (attribute(opening, 'id') !== 'appearances-data'
      || attribute(opening, 'type')?.toLowerCase() !== 'application/json') continue;
    const closeStart = match[0].toLowerCase().lastIndexOf('</script');
    let payload;
    try {
      payload = JSON.parse(match[0].slice(openingEnd, closeStart));
    } catch (error) {
      throw new Error(`${label} has invalid #appearances-data JSON: ${error.message}`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || !Array.isArray(payload.entries)) {
      throw new Error(`${label} #appearances-data must be an object with an entries array`);
    }
    blocks.push({ start: match.index, end: match.index + match[0].length, source: match[0], payload });
  }
  if (blocks.length !== 1) throw new Error(`${label} must contain exactly one application/json #appearances-data block`);
  return blocks[0];
}

function hasExternalClient(html, label) {
  if (!/<script\b(?=[^>]*\bsrc\s*=)[^>]*>/i.test(html)) {
    throw new Error(`${label} has no external client script to exercise`);
  }
}

async function loadApplication() {
  const resolverPath = resolve(root, 'src/content/appearances.mjs');
  const appearancesPath = resolve(root, 'src/content/appearances.json');
  const talksPath = resolve(root, 'src/content/talks.json');
  if (!existsSync(resolverPath)) throw new Error('missing production resolver src/content/appearances.mjs');
  if (!existsSync(appearancesPath)) throw new Error('missing agenda inventory src/content/appearances.json');
  if (!existsSync(talksPath)) throw new Error('missing canonical presentation data src/content/talks.json');

  const moduleUrl = pathToFileURL(resolverPath).href;
  let resolver;
  try {
    resolver = await import(moduleUrl);
  } catch (error) {
    throw new Error(`cannot import production resolver src/content/appearances.mjs: ${error.message}`);
  }
  if (typeof resolver.resolveAppearances !== 'function') {
    throw new Error('src/content/appearances.mjs must export resolveAppearances(appearances, talks)');
  }
  const rawAppearances = readJson(appearancesPath, 'agenda inventory');
  const talks = readJson(talksPath, 'canonical presentations');
  if (!Array.isArray(rawAppearances) || !Array.isArray(talks)) {
    throw new Error('agenda inventory and canonical presentations must be JSON arrays');
  }
  let actualEntries;
  try {
    actualEntries = resolver.resolveAppearances(rawAppearances, talks);
  } catch (error) {
    throw new Error(`cannot resolve the current agenda inventory: ${error.message}`);
  }
  if (!Array.isArray(actualEntries)) throw new Error('resolveAppearances must return an array');

  const pages = new Map();
  for (const [locale, pagePath] of [
    ['en', resolve(dist, 'index.html')],
    ['es', resolve(dist, 'es/index.html')]
  ]) {
    if (!existsSync(pagePath)) throw new Error(`missing built homepage ${relative(root, pagePath)}; build the site first`);
    const html = readFileSync(pagePath, 'utf8');
    const label = locale === 'en' ? 'English homepage' : 'Spanish homepage';
    hasExternalClient(html, label);
    pages.set(locale, { html, payloadBlock: appearancePayload(html, label) });
  }
  return { resolveAppearances: resolver.resolveAppearances, actualEntries, pages };
}

function localizedEntry(index, role, when) {
  return {
    id: `fixture-${index}`,
    event: { en: `Fixture event ${index}`, es: `Evento de prueba ${index}` },
    role: role === 'attendee'
      ? { en: 'Attendee', es: 'Asistente' }
      : { en: 'Organizer', es: 'Organizador' },
    location: { en: `Room ${index}`, es: `Sala ${index}` },
    when
  };
}

function syntheticEntries(name, resolveAppearances, requestTime) {
  if (name === 'empty') return resolveAppearances([], []);
  if (name !== 'many' && name !== 'live') return undefined;

  const entries = Array.from({ length: 6 }, (_, offset) => {
    let start;
    let end;
    if (name === 'many') {
      start = requestTime + (offset + 1) * 60 * 60 * 1000;
      end = start + 60 * 60 * 1000;
    } else {
      start = requestTime - 5_000;
      end = requestTime + (offset === 0 ? 30_000 : 60_000);
    }
    return localizedEntry(offset + 1, offset % 2 === 0 ? 'attendee' : 'organizer', {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      timeZone: 'UTC'
    });
  });
  return resolveAppearances(entries, []);
}

function replacePayload(html, block, payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const openingEnd = block.source.indexOf('>') + 1;
  const closeStart = block.source.toLowerCase().lastIndexOf('</script');
  const script = `${block.source.slice(0, openingEnd)}${safeJson}${block.source.slice(closeStart)}`;
  return html.slice(0, block.start) + script + html.slice(block.end);
}

function clockShim(isoTime) {
  const timestamp = Date.parse(isoTime);
  return `<script data-appearance-test-clock>(()=>{const NativeDate=Date;const fixedNow=${timestamp};class FixtureDate extends NativeDate{constructor(...args){super(...(args.length?args:[fixedNow]))}static now(){return fixedNow}}globalThis.Date=FixtureDate})();</script>\n`;
}

function injectBeforeExternalScript(html, script, label) {
  const external = /<script\b(?=[^>]*\bsrc\s*=)[^>]*>/i.exec(html);
  if (!external) throw new Error(`${label} has no external client script before which to install the test clock`);
  return html.slice(0, external.index) + script + html.slice(external.index);
}

function injectBanner(html, locale, name) {
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) throw new Error(`${locale} homepage has no body for the visible fixture banner`);
  const banner = `<aside id="appearance-fixture-banner" role="status" style="position:fixed;z-index:2147483647;right:12px;bottom:12px;background:#142a22;color:#fff;padding:8px 12px;border-radius:6px;font:12px/1.4 system-ui,sans-serif;pointer-events:none">TEST FIXTURE · ${name} · ${locale}</aside>`;
  const insertAt = body.index + body[0].length;
  return html.slice(0, insertAt) + banner + html.slice(insertAt);
}

function htmlForCase(app, locale, name, requestTime) {
  const page = app.pages.get(locale);
  if (!page) throw new Error(`unsupported homepage locale: ${locale}`);

  let entries;
  const synthetic = syntheticEntries(name, app.resolveAppearances, requestTime);
  if (synthetic !== undefined) {
    entries = synthetic;
  } else if (name === 'invalid') {
    entries = null;
  } else {
    entries = app.actualEntries;
  }

  const payload = { ...page.payloadBlock.payload, entries };
  let html = replacePayload(page.html, page.payloadBlock, payload);
  if (fixedClocks[name]) html = injectBeforeExternalScript(html, clockShim(fixedClocks[name]), `${locale} homepage`);
  return injectBanner(html, locale, name);
}

function contentType(path) {
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml; charset=utf-8'
  })[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

function sendText(response, status, text) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  response.end(`${text}\n`);
}

async function serveStaticFile(request, response, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendText(response, 400, 'Invalid asset path');
    return;
  }
  let file = resolve(dist, `.${decoded}`);
  const rel = relative(dist, file);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    sendText(response, 403, 'Asset path is outside dist');
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (info.isDirectory()) {
      file = resolve(file, 'index.html');
      info = await stat(file);
    }
  } catch {
    sendText(response, 404, 'Not found');
    return;
  }
  if (!info.isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentType(file), 'content-length': info.size, 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}

async function handleRequest(app, request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Only GET and HEAD are supported');
    return;
  }
  const url = new URL(request.url ?? '/', `http://${host}`);
  const locale = url.pathname === '/' ? 'en' : (url.pathname === '/es/' ? 'es' : undefined);
  if (!locale) {
    await serveStaticFile(request, response, url.pathname);
    return;
  }
  const name = url.searchParams.get('case') ?? 'nov11';
  if (!fixtureNames.has(name)) {
    sendText(response, 400, `Unknown appearance fixture: ${name}. Use ${[...fixtureNames].join(', ')}.`);
    return;
  }
  const html = htmlForCase(app, locale, name, Date.now());
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    ...(name === 'noscript' ? { 'content-security-policy': "script-src 'none'" } : {})
  });
  if (request.method === 'HEAD') response.end();
  else response.end(html);
}

async function main() {
  const port = process.argv[2] === undefined ? defaultPort : Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be an integer from 1 through 65535');
  const app = await loadApplication();
  const server = createServer((request, response) => {
    handleRequest(app, request, response).catch((error) => {
      console.error(`Appearance fixture request failed: ${error.message}`);
      if (response.headersSent) response.destroy(error);
      else sendText(response, 500, `Appearance fixture failed: ${error.message}`);
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, resolveListen);
  });
  console.log(`Serving built site with appearance fixtures at http://${host}:${port}/`);
}

try {
  await main();
} catch (error) {
  console.error(`Cannot start appearance fixture server: ${error.message}`);
  process.exitCode = 1;
}
