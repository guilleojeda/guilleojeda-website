import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const readJson = (file) => JSON.parse(readFileSync(join(root, 'src/content', file), 'utf8'));
const profile = readJson('profile.json');
const projects = readJson('projects.json');
const talks = readJson('talks.json');
const books = readJson('books.json');

function assertLocalized(value, label) {
  assert.equal(typeof value?.en, 'string', `${label}.en must be a string`);
  assert.equal(typeof value?.es, 'string', `${label}.es must be a string`);
  assert.ok(value.en.trim(), `${label}.en must not be empty`);
  assert.ok(value.es.trim(), `${label}.es must not be empty`);
}

function assertRecordSet(records, label, localizedFields, withHref = false) {
  assert.ok(Array.isArray(records) && records.length > 0, `${label} must contain at least one record`);
  const ids = records.map((record, index) => {
    assert.equal(typeof record.id, 'string', `${label}[${index}].id must be a string`);
    assert.ok(record.id.trim(), `${label}[${index}].id must not be empty`);
    assert.match(record.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label}[${index}].id must be a stable slug`);
    return record.id;
  });
  assert.equal(new Set(ids).size, ids.length, `${label} IDs must be unique`);

  for (const [index, record] of records.entries()) {
    for (const field of localizedFields) assertLocalized(record[field], `${label}[${index}].${field}`);
    if (withHref) {
      assert.equal(typeof record.href, 'string', `${label}[${index}].href must be a string`);
      assert.equal(new URL(record.href).protocol, 'https:', `${label}[${index}].href must use HTTPS`);
    }
  }
}

test('profile copy is complete in English and Spanish', () => {
  for (const [sectionName, section] of Object.entries(profile)) {
    if (sectionName === 'site') {
      for (const key of ['portraitAlt', 'title', 'description']) assertLocalized(section[key], `site.${key}`);
    } else if (sectionName === 'nav' || sectionName === 'hero' || sectionName === 'work' || sectionName === 'talks' || sectionName === 'authorship' || sectionName === 'footer') {
      for (const [key, value] of Object.entries(section)) assertLocalized(value, `${sectionName}.${key}`);
    } else if (sectionName === 'about') {
      for (const key of ['kicker', 'title', 'intro', 'community']) assertLocalized(section[key], `about.${key}`);
      for (const [index, fact] of section.facts.entries()) {
        assertLocalized(fact.label, `about.facts[${index}].label`);
        assertLocalized(fact.value, `about.facts[${index}].value`);
      }
    }
  }
  assert.match(profile.site.linkedin, /^https:\/\/www\.linkedin\.com\/in\/guilleojeda\/?$/);
  assert.match(profile.site.github, /^https:\/\/github\.com\/guilleojeda\/?$/);
  assert.equal(profile.site.sponsorship, 'https://www.passionfroot.me/guilleojeda');
  assert.equal(profile.site.newsletter, 'https://newsletter.simpleaws.dev/');
});

test('projects, talks, and books retain paired copy and public destinations', () => {
  assertRecordSet(projects, 'projects', ['label', 'title', 'text', 'cta'], true);
  assertRecordSet(talks, 'talks', ['year', 'title', 'text', 'cta'], true);
  assertRecordSet(books, 'books', ['title', 'text']);

  for (const href of [
    'https://www.andmore.dev/talks/aws-summit-la-2026',
    'https://d1.awsstatic.com/events/Summits/2024-la-summit-%28amer%29/DEV202_TestingGenerative_E2_LASummit_20240522.pptx.pdf',
    'https://d1.awsstatic.com/events/Summits/bogsummit24/DEV303_DisenoEficiente_V2_BOGSummit_20240718.pdf',
    'https://app.swapcard.com/event/nerdearla-2024/planning/UGxhbm5pbmdfMjA4OTAwNw=='
  ]) {
    assert.ok(talks.some((talk) => talk.href === href), `required talk destination is missing: ${href}`);
  }
  for (const title of ['Node.js on AWS', 'AWS Made Simple and Fun']) {
    assert.ok(books.some((book) => book.title.en === title), `required book is missing: ${title}`);
  }
});

test('profile media is repository-owned and copy avoids forbidden product claims', () => {
  const imagePath = join(root, 'public/images/guille-portrait.jpg');
  assert.ok(existsSync(imagePath), 'portrait asset should be present in public/');
  assert.equal(readFileSync(imagePath).subarray(0, 2).toString('hex'), 'ffd8', 'portrait should be a JPEG');

  const serialized = JSON.stringify({ profile, projects, talks, books }).toLowerCase();
  for (const phrase of ['consulting', 'consultoría', 'design preview', 'buy now', 'purchase now', 'current sales']) {
    assert.ok(!serialized.includes(phrase), `content must not include ${phrase}`);
  }
});
