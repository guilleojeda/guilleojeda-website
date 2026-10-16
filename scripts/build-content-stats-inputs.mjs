import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TALK_KINDS = new Set([
  'talk',
  'workshop',
  'training',
  'panel',
  'session',
  'hosting',
  'podcast',
  'commentary',
  'conversation',
  'unknown'
]);
const TALK_STATUSES = new Set(['delivered', 'scheduled', 'unknown']);
const BOOK_STATUSES = new Set(['published', 'in-progress', 'unknown']);
const LANGUAGES = new Set(['en', 'es', null]);

function invalid(message) {
  throw new Error(`Invalid content statistics input: ${message}`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') invalid(`${label} must be a non-empty string`);
}

function assertLanguage(value, label) {
  if (!LANGUAGES.has(value)) invalid(`${label} must be en, es, or null`);
}

function validateArticleConfig(articleConfig) {
  assertObject(articleConfig, 'articleConfig');
  if (articleConfig.schemaVersion !== 2) invalid(`unsupported article schema version ${articleConfig.schemaVersion}`);
  if (articleConfig.definitionVersion !== 1) invalid(`unsupported article definition version ${articleConfig.definitionVersion}`);
  if (!Array.isArray(articleConfig.sources)) invalid('articleConfig.sources must be an array');

  const sourceIds = new Set();
  for (const [index, source] of articleConfig.sources.entries()) {
    assertObject(source, `article source ${index}`);
    assertNonEmptyString(source.id, `article source ${index} id`);
    if (sourceIds.has(source.id)) invalid(`duplicate article source ID ${source.id}`);
    sourceIds.add(source.id);
  }
}

function projectTalks(talks) {
  if (!Array.isArray(talks)) invalid('talks must be an array');

  const recordIds = new Set();
  const factIds = new Set();
  return talks.flatMap((record, recordIndex) => {
    assertObject(record, `talk record ${recordIndex}`);
    assertNonEmptyString(record.id, `talk record ${recordIndex} id`);
    if (recordIds.has(record.id)) invalid(`duplicate talk record ID ${record.id}`);
    recordIds.add(record.id);
    if (!Array.isArray(record.occurrences) || record.occurrences.length === 0) {
      invalid(`talk record ${record.id} is missing occurrence metadata`);
    }

    const occurrenceIds = new Set();
    return record.occurrences.map((occurrence, occurrenceIndex) => {
      assertObject(occurrence, `${record.id} occurrence ${occurrenceIndex}`);
      assertNonEmptyString(occurrence.id, `${record.id} occurrence ${occurrenceIndex} id`);
      if (occurrenceIds.has(occurrence.id)) invalid(`duplicate occurrence ID ${record.id}/${occurrence.id}`);
      occurrenceIds.add(occurrence.id);
      if (!TALK_KINDS.has(occurrence.kind)) invalid(`invalid occurrence kind for ${record.id}/${occurrence.id}`);
      if (!TALK_STATUSES.has(occurrence.status)) invalid(`invalid occurrence status for ${record.id}/${occurrence.id}`);
      if (!Object.hasOwn(occurrence, 'language')) invalid(`missing occurrence language for ${record.id}/${occurrence.id}`);
      assertLanguage(occurrence.language, `${record.id}/${occurrence.id} language`);

      const id = `${record.id}/${occurrence.id}`;
      if (factIds.has(id)) invalid(`duplicate occurrence fact ID ${id}`);
      factIds.add(id);
      return { id, kind: occurrence.kind, status: occurrence.status, language: occurrence.language };
    });
  });
}

function projectBooks(books) {
  if (!Array.isArray(books)) invalid('books must be an array');

  const bookIds = new Set();
  return books.map((book, index) => {
    assertObject(book, `book record ${index}`);
    assertNonEmptyString(book.id, `book record ${index} id`);
    if (bookIds.has(book.id)) invalid(`duplicate book ID ${book.id}`);
    bookIds.add(book.id);
    assertObject(book.publication, `book ${book.id} publication metadata`);
    if (!BOOK_STATUSES.has(book.publication.status)) invalid(`invalid publication status for ${book.id}`);
    if (!Object.hasOwn(book.publication, 'language')) invalid(`missing publication language for ${book.id}`);
    assertLanguage(book.publication.language, `${book.id} publication language`);
    return { id: book.id, status: book.publication.status, language: book.publication.language };
  });
}

export function buildContentStatsInputs({ articleConfig, talks, books } = {}) {
  validateArticleConfig(articleConfig);
  return {
    schemaVersion: 3,
    definitionVersion: 1,
    sources: structuredClone(articleConfig.sources),
    curated: {
      talks: projectTalks(talks),
      books: projectBooks(books)
    }
  };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function buildFromMaintainedContent() {
  return buildContentStatsInputs({
    articleConfig: readJson('../public/_content-stats/inputs.json'),
    talks: readJson('../src/content/talks.json'),
    books: readJson('../src/content/books.json')
  });
}

function writeBuiltInputs() {
  const outputPath = fileURLToPath(new URL('../dist/_content-stats/inputs.json', import.meta.url));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(buildFromMaintainedContent(), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeBuiltInputs();
