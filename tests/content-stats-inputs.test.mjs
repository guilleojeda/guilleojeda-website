import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const builderUrl = new URL('../scripts/build-content-stats-inputs.mjs', import.meta.url);

async function inputBuilder() {
  assert.ok(existsSync(builderUrl), 'the build must generate protected statistics inputs from maintained content');
  const module = await import(builderUrl.href);
  assert.equal(typeof module.buildContentStatsInputs, 'function', 'the build projection must expose its data interface');
  return module.buildContentStatsInputs;
}

function fixture() {
  return {
    articleConfig: {
      schemaVersion: 2,
      definitionVersion: 1,
      sources: [
        { id: 'caylent', authorId: 'fixture-author', apiKey: 'synthetic-public-delivery-key', language: 'en', originality: 'original' },
        { id: 'builder-center', authorId: 'fixture-builder-author' }
      ]
    },
    talks: [
      {
        id: 'same-session-at-first-event',
        title: { en: 'Repeated material', es: 'Material repetido' },
        text: { en: 'Private display prose', es: 'Texto de presentación' },
        href: 'https://example.test/private-recording',
        featured: true,
        occurrences: [{ id: 'main', kind: 'talk', status: 'delivered', language: 'es' }]
      },
      {
        id: 'same-session-at-second-event',
        title: { en: 'Repeated material', es: 'Material repetido' },
        occurrences: [
          { id: 'first-slot', kind: 'talk', status: 'delivered', language: 'en' },
          { id: 'second-slot', kind: 'panel', status: 'scheduled', language: null }
        ]
      }
    ],
    books: [
      {
        id: 'historical-published-book',
        title: { en: 'Historical credit', es: 'Crédito histórico' },
        text: { en: 'Unavailable today', es: 'Ya no está disponible' },
        publication: { status: 'published', language: 'en' }
      },
      {
        id: 'future-book',
        title: { en: 'Not yet published', es: 'Todavía sin publicar' },
        publication: { status: 'in-progress', language: null }
      }
    ]
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('the build projects each maintained occurrence and book into protected input3 without duplicating display content', async () => {
  const build = await inputBuilder();
  const source = freeze(fixture());
  const result = build(source);

  assert.deepEqual(result, {
    schemaVersion: 3,
    definitionVersion: 1,
    sources: source.articleConfig.sources,
    curated: {
      talks: [
        { id: 'same-session-at-first-event/main', kind: 'talk', status: 'delivered', language: 'es' },
        { id: 'same-session-at-second-event/first-slot', kind: 'talk', status: 'delivered', language: 'en' },
        { id: 'same-session-at-second-event/second-slot', kind: 'panel', status: 'scheduled', language: null }
      ],
      books: [
        { id: 'historical-published-book', status: 'published', language: 'en' },
        { id: 'future-book', status: 'in-progress', language: null }
      ]
    }
  });
  assert.equal(JSON.stringify(result).includes('Private display prose'), false);
  assert.equal(JSON.stringify(result).includes('https://example.test/private-recording'), false);
  assert.equal(JSON.stringify(result).includes('Repeated material'), false);
  assert.equal(Object.hasOwn(result, 'counts'), false, 'the daily collector, not the build, derives figures');
});

test('new maintained facts change generated inputs without a second hand-maintained catalog or count', async () => {
  const build = await inputBuilder();
  const source = fixture();
  const before = build(source);
  source.talks.push({
    id: 'new-event',
    occurrences: [{ id: 'workshop', kind: 'workshop', status: 'delivered', language: 'es' }]
  });
  source.books[1].publication = { status: 'published', language: 'es' };
  const after = build(source);

  assert.equal(before.curated.talks.length, 3);
  assert.equal(after.curated.talks.length, 4);
  assert.deepEqual(after.curated.talks.at(-1), { id: 'new-event/workshop', kind: 'workshop', status: 'delivered', language: 'es' });
  assert.deepEqual(after.curated.books[1], { id: 'future-book', status: 'published', language: 'es' });
  assert.deepEqual(after.sources, before.sources, 'curated edits must not rewrite article selection');
});

test('duplicate source identities and missing factual metadata fail generation instead of plausible counts', async () => {
  const build = await inputBuilder();
  const cases = [
    ['duplicate display record', (value) => value.talks.push(structuredClone(value.talks[0]))],
    ['duplicate occurrence', (value) => value.talks[0].occurrences.push(structuredClone(value.talks[0].occurrences[0]))],
    ['missing occurrence metadata', (value) => delete value.talks[0].occurrences],
    ['duplicate book', (value) => value.books.push(structuredClone(value.books[0]))],
    ['missing publication metadata', (value) => delete value.books[0].publication],
    ['unsupported base version', (value) => { value.articleConfig.schemaVersion = 99; }]
  ];
  for (const [description, mutate] of cases) {
    const value = fixture();
    mutate(value);
    assert.throws(() => build(value), /duplicate|invalid|unsupported|missing|metadata|occurrence|publication|version/i, description);
  }
});

const speakingIds = [
  'nerdearla-2026-aws-booth-agent', 'mexico-agent-authorization',
  'aws-sbg-utn-agent', 'aws-ai-meetup-1-agent', 'unit-economics-ai-agents',
  'tribu-production-genai', 'reinvent-know-before-you-go',
  'valkey-recommendations', 'valkey-cache', 'community-programs-panel',
  'tribu-llm-evaluations', 'agentful-architectures', 'summit-la-llm-evaluations',
  'beerai-llm-evaluations', 'summit-mexico-clown-architect', 'clown-architect',
  'dynamodb-data-modeling', 'uruguay-dynamodb', 'testing-generative-ai',
  'cordoba-security-ci-cd', 'basta-bastion-host', 'cordoba-dynamodb',
  'practitioner-serverless', 'practitioner-billing', 'practitioner-databases',
  'practitioner-kickoff', 'cordoba-low-cost', 'carameltalks-getting-started'
].sort();
const speakingLanguages = {
  'nerdearla-2026-aws-booth-agent': 'es',
  'mexico-agent-authorization': 'es',
  'aws-sbg-utn-agent': 'es',
  'aws-ai-meetup-1-agent': 'es',
  'unit-economics-ai-agents': 'en',
  'tribu-production-genai': 'es',
  'reinvent-know-before-you-go': 'en',
  'valkey-recommendations': 'en',
  'valkey-cache': 'en',
  'community-programs-panel': 'es',
  'tribu-llm-evaluations': 'es',
  'agentful-architectures': 'en',
  'summit-la-llm-evaluations': 'en',
  'beerai-llm-evaluations': 'en',
  'summit-mexico-clown-architect': 'es',
  'clown-architect': 'es',
  'dynamodb-data-modeling': 'es',
  'uruguay-dynamodb': 'es',
  'testing-generative-ai': 'en',
  'cordoba-security-ci-cd': 'es',
  'basta-bastion-host': 'es',
  'cordoba-dynamodb': 'es',
  'practitioner-serverless': 'es',
  'practitioner-billing': 'es',
  'practitioner-databases': 'es',
  'practitioner-kickoff': 'es',
  'cordoba-low-cost': 'es',
  'carameltalks-getting-started': 'en'
};
const eligibleKinds = new Set(['talk', 'workshop', 'training', 'panel', 'session']);

test('real maintained speaking facts preserve the confirmed deliveries and separate grouped future slots', () => {
  const records = JSON.parse(readFileSync(new URL('../src/content/talks.json', import.meta.url), 'utf8'));
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const included = [];
  for (const record of records) {
    assert.ok(Array.isArray(record.occurrences) && record.occurrences.length > 0, `${record.id} needs explicit occurrence facts`);
    const ids = new Set();
    for (const occurrence of record.occurrences) {
      assert.ok(typeof occurrence.id === 'string' && occurrence.id.trim(), `${record.id} occurrence ID`);
      assert.equal(ids.has(occurrence.id), false, `${record.id} occurrence IDs must be unique`);
      ids.add(occurrence.id);
      if (occurrence.status === 'delivered' && eligibleKinds.has(occurrence.kind)
        && ['en', 'es'].includes(occurrence.language)) {
        included.push(record.id);
      }
    }
  }
  assert.deepEqual(Object.keys(speakingLanguages).sort(), speakingIds, 'every supported delivery has an explicit title-language fact');
  for (const id of speakingIds) assert.ok(included.includes(id), `${id} needs confirmed eligible occurrence facts`);
  const confirmedLanguages = [];
  for (const id of speakingIds) {
    const record = recordsById.get(id);
    assert.equal(record.title.en, record.title.es, `${id} keeps the original session title across UI languages`);
    const delivered = record.occurrences.filter((occurrence) => occurrence.status === 'delivered'
      && eligibleKinds.has(occurrence.kind));
    assert.ok(delivered.length > 0, `${id} needs a delivered speaking occurrence`);
    confirmedLanguages.push(delivered[0].language);
    for (const occurrence of delivered) {
      assert.equal(occurrence.language, speakingLanguages[id], `${id}/${occurrence.id} language follows the original title`);
    }
  }
  assert.equal(confirmedLanguages.filter((language) => language === 'en').length, 9);
  assert.equal(confirmedLanguages.filter((language) => language === 'es').length, 19);

  const titleLanguageAnchors = [
    ['valkey-cache', 'Cache me if you can, Valkey edition', 'en'],
    ['mexico-agent-authorization', 'Autorización en capas para agentes de IA con acceso a producción', 'es']
  ];
  for (const [id, originalTitle, language] of titleLanguageAnchors) {
    const record = recordsById.get(id);
    assert.equal(record.title.en, originalTitle, `${id} retains its original title in English UI data`);
    assert.equal(record.title.es, originalTitle, `${id} retains its original title in Spanish UI data`);
    assert.equal(speakingLanguages[id], language, `${id} language follows the title, not translated interface text`);
  }

  for (const id of ['aws-ai-meetup-2-host', 'summit-nyc-keynote-recap-2026',
    'werner-reinvent-2025-keynote-recap', 'summit-nyc-keynote-recap',
    'neural-nebulai-agentic-ai', 'charlas-tecnicas-freelance', 'maxcloud-getting-started']) {
    assert.equal(included.includes(id), false, `${id} is a non-speaking appearance`);
  }

  for (const id of ['reinvent-2026-agent-evaluations', 'cordoba-agent-economics-2026']) {
    const record = records.find((item) => item.id === id);
    assert.equal(record.occurrences.length, 2, `${id} has two separately maintained slots`);
    assert.equal(new Set(record.occurrences.map((occurrence) => occurrence.id)).size, 2);
  }
});

test('real book facts retain the verified historical publication credits with title languages', () => {
  const books = JSON.parse(readFileSync(new URL('../src/content/books.json', import.meta.url), 'utf8'));
  for (const book of books) assert.ok(book.publication && typeof book.publication === 'object', `${book.id} needs publication facts`);
  const titleAnchors = new Map([
    ['aws-made-simple', 'AWS Made Simple and Fun'],
    ['nodejs-on-aws', 'Node.js on AWS']
  ]);
  for (const [id, originalTitle] of titleAnchors) {
    const book = books.find((item) => item.id === id);
    assert.equal(book.publication.status, 'published');
    assert.equal(book.title.en, originalTitle, `${id} original English title`);
    assert.equal(book.title.es, originalTitle, `${id} original title across UI languages`);
    assert.equal(book.publication.language, 'en', `${id} publication language follows its title`);
  }
});

test('a configured newsletter generates input4 from the existing configuration without changing maintained counts or legacy input3', async () => {
  const build = await inputBuilder();
  const source = fixture();
  const legacy = build(source);
  const selection = { id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en' };
  source.articleConfig.newsletter = selection;
  freeze(source);
  const result = build(source);
  assert.deepEqual(result, {
    ...legacy,
    schemaVersion: 4,
    newsletter: selection
  });
  assert.notEqual(result.newsletter, selection, 'the generated artifact cannot mutate maintained configuration');
  assert.deepEqual(result.sources, legacy.sources);
  assert.deepEqual(result.curated, legacy.curated);
  assert.equal(Object.hasOwn(result.newsletter, 'subscribers'), false, 'the build does not invent a provider measurement');
  assert.equal(Object.hasOwn(result.newsletter, 'secretArn'), false, 'credential references belong to the operator runtime');
  assert.equal(Object.hasOwn(result.newsletter, 'apiKey'), false, 'private keys never enter generated inputs');
  const withoutNewsletter = fixture();
  assert.deepEqual(build(withoutNewsletter), legacy, 'compatibility publication can still generate input3 without newsletter selection');
});

test('newsletter selection rejects missing selectors, unsupported languages and credential-bearing or unknown fields', async () => {
  const build = await inputBuilder();
  const selection = { id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en' };
  const invalid = [
    null,
    [],
    {},
    { ...selection, id: 'another-publication' },
    { ...selection, publicationId: '' },
    { ...selection, publicationId: null },
    { ...selection, language: 'fr' },
    { ...selection, language: null },
    { ...selection, apiKey: 'synthetic-private-beehiiv-key' },
    { ...selection, secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:synthetic-key-AbCdEf' },
    { ...selection, subscribers: 1234 },
    { ...selection, typo: true }
  ];
  for (const value of invalid) {
    const source = fixture();
    source.articleConfig.newsletter = value;
    assert.throws(() => build(source), /newsletter|publication|language|credential|input/i, `invalid newsletter selection ${JSON.stringify(value)}`);
  }
});

function analyticsSelection() {
  return {
    id: 'simple-aws',
    propertyId: '123456789',
    language: 'en',
    hostname: 'newsletter.simpleaws.dev',
    articlePathPattern: '/p/[^/]+/?',
    timeZone: 'Europe/Madrid',
    recordedSince: '2024-02-29'
  };
}

test('a configured analytics source generates input5 while preserving input4 data and protecting selectors', async () => {
  const build = await inputBuilder();
  const source = fixture();
  const newsletter = { id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en' };
  const analytics = analyticsSelection();
  const legacy = build(fixture());
  source.articleConfig.newsletter = newsletter;
  source.articleConfig.analytics = analytics;
  freeze(source);
  const result = build(source);

  assert.deepEqual(result, {
    schemaVersion: 5,
    definitionVersion: 1,
    sources: source.articleConfig.sources,
    curated: legacy.curated,
    newsletter,
    analytics
  });
  assert.deepEqual(result.curated, legacy.curated, 'analytics must not rewrite maintained talk/book facts');
  assert.notEqual(result.newsletter, newsletter, 'the generated artifact cannot mutate maintained newsletter configuration');
  assert.notEqual(result.analytics, analytics, 'the generated artifact cannot mutate maintained analytics configuration');
  assert.deepEqual(Object.keys(result.analytics).sort(), [
    'articlePathPattern', 'hostname', 'id', 'language', 'propertyId', 'recordedSince', 'timeZone'
  ]);
  assert.equal(Object.hasOwn(result.analytics, 'clientSecret'), false);
  assert.equal(Object.hasOwn(result.analytics, 'refreshToken'), false);
  assert.equal(Object.hasOwn(result.analytics, 'accessToken'), false);
  result.analytics.timeZone = 'Etc/UTC';
  assert.equal(source.articleConfig.analytics.timeZone, 'Europe/Madrid', 'result mutations must not change maintained configuration');

  const withoutRecordedSince = fixture();
  withoutRecordedSince.articleConfig.newsletter = newsletter;
  const analyticsWithoutTotal = analyticsSelection();
  delete analyticsWithoutTotal.recordedSince;
  withoutRecordedSince.articleConfig.analytics = analyticsWithoutTotal;
  const withoutTotal = build(withoutRecordedSince);
  assert.equal(withoutTotal.schemaVersion, 5);
  assert.deepEqual(withoutTotal.analytics, analyticsWithoutTotal);
  assert.equal(Object.hasOwn(withoutTotal.analytics, 'recordedSince'), false, 'recordedSince is optional until source history is evidenced');
});

test('analytics configuration is absent from input3/input4 and rejects unsupported or credential-bearing selectors', async () => {
  const build = await inputBuilder();
  const withoutAnalytics = build(fixture());
  assert.equal(withoutAnalytics.schemaVersion, 3);
  assert.equal(Object.hasOwn(withoutAnalytics, 'analytics'), false);

  const newsletterSource = fixture();
  newsletterSource.articleConfig.newsletter = {
    id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en'
  };
  const withNewsletter = build(newsletterSource);
  assert.equal(withNewsletter.schemaVersion, 4);
  assert.equal(Object.hasOwn(withNewsletter, 'analytics'), false);

  const valid = analyticsSelection();
  const invalid = [
    null,
    [],
    {},
    { ...valid, id: 'another-publication' },
    { ...valid, propertyId: '' },
    { ...valid, propertyId: '123.456' },
    { ...valid, propertyId: 'property-123' },
    { ...valid, language: 'es' },
    { ...valid, language: null },
    { ...valid, hostname: 'www.newsletter.simpleaws.dev' },
    { ...valid, articlePathPattern: '/p/.+' },
    { ...valid, articlePathPattern: '' },
    { ...valid, timeZone: 'not-an-iana-zone' },
    { ...valid, recordedSince: '2024-02-30' },
    { ...valid, recordedSince: '2024-2-29' },
    { ...valid, recordedSince: null },
    { ...valid, clientSecret: 'synthetic-client-secret' },
    { ...valid, refreshToken: 'synthetic-refresh-token' },
    { ...valid, accessToken: 'synthetic-access-token' },
    { ...valid, secretArn: 'arn:aws:ssm:us-east-1:123456789012:parameter/google' },
    { ...valid, typo: true }
  ];
  for (const value of invalid) {
    const source = fixture();
    source.articleConfig.newsletter = {
      id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en'
    };
    source.articleConfig.analytics = value;
    assert.throws(() => build(source), /analytics|property|language|host|path|timezone|date|credential|secret|input/i,
      `invalid analytics selection ${JSON.stringify(value)}`);
  }
});
