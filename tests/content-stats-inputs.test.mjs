import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  'cordoba-agent-economics-2026', 'nerdearla-2026-aws-booth-agent', 'mexico-agent-authorization',
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
  'cordoba-agent-economics-2026': 'es',
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
  assert.equal(confirmedLanguages.filter((language) => language === 'es').length, 20);

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

test('the October 22 meetup preserves both owner-confirmed speaking occurrences', async () => {
  const records = JSON.parse(readFileSync(new URL('../src/content/talks.json', import.meta.url), 'utf8'));
  const meetup = records.find((record) => record.id === 'cordoba-agent-economics-2026');
  assert.ok(meetup, 'the maintained meetup record remains available');
  assert.equal(meetup.year, 2026);
  assert.deepEqual(meetup.title, {
    en: 'La Economía de los Agentes de IA',
    es: 'La Economía de los Agentes de IA'
  });
  const expected = [
    { id: 'talk', kind: 'talk', status: 'delivered', language: 'es' },
    { id: 'certification-panel', kind: 'panel', status: 'delivered', language: 'es' }
  ];
  assert.deepEqual(meetup.occurrences, expected, 'the talk and panel were separately confirmed by the owner');
  const build = await inputBuilder();
  const result = build({ ...fixture(), talks: [meetup] });
  assert.deepEqual(result.curated.talks, expected.map((occurrence) => ({
    ...occurrence, id: `cordoba-agent-economics-2026/${occurrence.id}`
  })), 'the protected projection retains each delivered occurrence exactly once');
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

function newsletterSelection() {
  return { id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en' };
}

function searchConsoleSelection() {
  return {
    id: 'simple-aws',
    siteUrl: 'sc-domain:simpleaws.dev',
    language: 'en',
    articleUrlPattern: String.raw`(?-i)^https://newsletter\.simpleaws\.dev/p/[^/?#]+/?$`,
    availableSince: '2025-06-20'
  };
}

function directoryAnalyticsSelection() {
  return {
    id: 'donde-aprendo-aws',
    propertyId: '424203315',
    hostname: 'dondeaprendoaws.com',
    language: 'es',
    timeZone: 'America/Buenos_Aires'
  };
}

function directoryAnalyticsClickSelection() {
  return { ...directoryAnalyticsSelection(), outboundClicks: true };
}

function addInputFiveSelections(source) {
  source.articleConfig.newsletter = newsletterSelection();
  source.articleConfig.analytics = analyticsSelection();
  return source;
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

test('analytics timezone validation preserves fixed IANA zones but rejects numeric offsets', async () => {
  const build = await inputBuilder();
  const source = fixture();
  source.articleConfig.newsletter = {
    id: 'simple-aws', publicationId: 'pub_00000000-0000-4000-8000-000000000001', language: 'en'
  };
  source.articleConfig.analytics = { ...analyticsSelection(), timeZone: 'Etc/GMT+1' };
  assert.equal(build(source).analytics.timeZone, 'Etc/GMT+1');
  for (const timeZone of ['+01:00', '-03', '+0100']) {
    source.articleConfig.analytics.timeZone = timeZone;
    assert.throws(() => build(source), /IANA time zone/i);
  }
});

test('a configured Search Console source generates immutable exact input6 while preserving input5 fields', async () => {
  const build = await inputBuilder();
  const source = addInputFiveSelections(fixture());
  const input5 = build(source);
  const selection = searchConsoleSelection();
  source.articleConfig.searchConsole = selection;
  freeze(source);

  const result = build(source);

  assert.deepEqual(result, {
    ...input5,
    schemaVersion: 6,
    searchConsole: selection
  });
  assert.deepEqual({ ...result, schemaVersion: 5, searchConsole: undefined }, {
    ...input5,
    searchConsole: undefined
  }, 'input6 must retain every input5 field unchanged');
  assert.notEqual(result.searchConsole, source.articleConfig.searchConsole, 'the generated artifact cannot mutate maintained configuration');
  assert.deepEqual(Object.keys(result.searchConsole).sort(), [
    'articleUrlPattern', 'availableSince', 'id', 'language', 'siteUrl'
  ]);
  assert.equal(JSON.stringify(result).includes('clientSecret'), false);
  assert.equal(JSON.stringify(result).includes('refreshToken'), false);
  assert.equal(JSON.stringify(result).includes('accessToken'), false);

  result.searchConsole.availableSince = '2025-06-21';
  assert.equal(source.articleConfig.searchConsole.availableSince, '2025-06-20', 'result mutations must not change maintained configuration');
});

test('Search Console selector rejects unsupported, unknown, secret-bearing, null, and malformed values', async () => {
  const build = await inputBuilder();
  const valid = searchConsoleSelection();
  const missingRequiredFields = ['id', 'siteUrl', 'language', 'articleUrlPattern', 'availableSince'].map((key) => {
    const value = { ...valid };
    delete value[key];
    return value;
  });
  const invalid = [
    null,
    [],
    {},
    ...missingRequiredFields,
    { ...valid, id: 'another-publication' },
    { ...valid, siteUrl: 'sc-domain:other.dev' },
    { ...valid, siteUrl: 'https://sc-domain:simpleaws.dev' },
    { ...valid, siteUrl: null },
    { ...valid, language: 'es' },
    { ...valid, language: null },
    { ...valid, articleUrlPattern: String.raw`(?-i)^https://newsletter\.simpleaws\.dev/.*$` },
    { ...valid, articleUrlPattern: '' },
    { ...valid, articleUrlPattern: null },
    { ...valid, availableSince: '2025-6-20' },
    { ...valid, availableSince: '2025-02-29' },
    { ...valid, availableSince: null },
    { ...valid, clientSecret: 'synthetic-client-secret' },
    { ...valid, refreshToken: 'synthetic-refresh-token' },
    { ...valid, accessToken: 'synthetic-access-token' },
    { ...valid, secretArn: 'arn:aws:ssm:us-east-1:123456789012:parameter/google' },
    { ...valid, apiKey: 'synthetic-private-key' },
    { ...valid, typo: true }
  ];

  for (const value of invalid) {
    const source = addInputFiveSelections(fixture());
    source.articleConfig.searchConsole = value;
    assert.throws(() => build(source), /searchConsole|Search Console|siteUrl|language|articleUrlPattern|availableSince|date|credential|secret|input/i,
      `invalid Search Console selection ${JSON.stringify(value)}`);
  }
});

test('Search Console selection requires the existing input5 newsletter and analytics root combination', async () => {
  const build = await inputBuilder();
  const withoutInputFive = fixture();
  withoutInputFive.articleConfig.searchConsole = searchConsoleSelection();
  assert.throws(() => build(withoutInputFive), /searchConsole|Search Console|analytics|newsletter|input5|input 5|input/i,
    'Search Console cannot produce input6 without the existing input5 selections');

  const withoutAnalytics = fixture();
  withoutAnalytics.articleConfig.newsletter = newsletterSelection();
  withoutAnalytics.articleConfig.searchConsole = searchConsoleSelection();
  assert.throws(() => build(withoutAnalytics), /searchConsole|Search Console|analytics|input5|input 5|input/i,
    'Search Console cannot produce input6 without the existing analytics selection');
});

function addInputSixSelections(source) {
  addInputFiveSelections(source);
  source.articleConfig.searchConsole = searchConsoleSelection();
  return source;
}

test('a directory Analytics selector generates protected input7 without changing input6 facts', async () => {
  const build = await inputBuilder();
  const source = addInputSixSelections(fixture());
  const input6 = build(source);
  const { schemaVersion: input6Version, ...input6Base } = input6;
  const selector = directoryAnalyticsSelection();
  source.articleConfig.directoryAnalytics = selector;
  freeze(source);

  const result = build(source);
  const { schemaVersion, directoryAnalytics, ...input7Base } = result;

  assert.equal(input6Version, 6);
  assert.equal(schemaVersion, 7);
  assert.deepEqual(input7Base, input6Base, 'input7 preserves every existing input6 selector and curated fact');
  assert.deepEqual(directoryAnalytics, selector);
  assert.notEqual(directoryAnalytics, source.articleConfig.directoryAnalytics, 'the generated selector cannot mutate maintained configuration');
  assert.deepEqual(Object.keys(directoryAnalytics).sort(), ['hostname', 'id', 'language', 'propertyId', 'timeZone']);
  assert.equal(JSON.stringify(result).includes('clientSecret'), false);
  assert.equal(JSON.stringify(result).includes('refreshToken'), false);
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
  assert.equal(Object.hasOwn(result, 'counts'), false, 'build projection does not compute traffic');

  result.directoryAnalytics.timeZone = 'Etc/UTC';
  assert.equal(source.articleConfig.directoryAnalytics.timeZone, 'America/Buenos_Aires', 'result mutation cannot change maintained configuration');
});

test('outbound clicks are an explicit optional directory selector that alone advances input7 to input8', async () => {
  const build = await inputBuilder();
  const legacySource = addInputSixSelections(fixture());
  legacySource.articleConfig.directoryAnalytics = directoryAnalyticsSelection();
  const input7 = build(legacySource);
  assert.equal(input7.schemaVersion, 7);
  assert.deepEqual(Object.keys(input7.directoryAnalytics).sort(), ['hostname', 'id', 'language', 'propertyId', 'timeZone']);

  const source = addInputSixSelections(fixture());
  const previous = build(source);
  source.articleConfig.directoryAnalytics = directoryAnalyticsClickSelection();
  freeze(source);

  const result = build(source);
  const { schemaVersion, directoryAnalytics, ...input8Base } = result;
  const { schemaVersion: previousVersion, ...previousBase } = previous;

  assert.equal(previousVersion, 6);
  assert.equal(schemaVersion, 8, 'only selecting outbound clicks advances protected input to schema 8');
  assert.deepEqual(input8Base, previousBase, 'the click selector preserves every existing input6 source and curated fact');
  assert.deepEqual(directoryAnalytics, directoryAnalyticsClickSelection());
  assert.notEqual(directoryAnalytics, source.articleConfig.directoryAnalytics, 'the generated click selector is copied from maintained configuration');
  assert.deepEqual(Object.keys(directoryAnalytics).sort(), ['hostname', 'id', 'language', 'outboundClicks', 'propertyId', 'timeZone']);
  assert.equal(JSON.stringify(result).includes('clientSecret'), false);
  assert.equal(JSON.stringify(result).includes('refreshToken'), false);
  assert.equal(JSON.stringify(result).includes('accessToken'), false);
  assert.equal(Object.hasOwn(result, 'counts'), false, 'the protected input carries selectors and never computes metrics');

  result.directoryAnalytics.outboundClicks = false;
  result.directoryAnalytics.timeZone = 'Etc/UTC';
  assert.equal(source.articleConfig.directoryAnalytics.outboundClicks, true, 'mutating output cannot change the maintained click opt-in');
  assert.equal(source.articleConfig.directoryAnalytics.timeZone, 'America/Buenos_Aires', 'mutating output cannot change the maintained source scope');
});

test('directory Analytics works with base input3 alone and preserves each existing input4 through input6 combination', async () => {
  const build = await inputBuilder();
  const variants = [
    ['input3', () => {}, 3],
    ['input4', (source) => { source.articleConfig.newsletter = newsletterSelection(); }, 4],
    ['input5', (source) => { addInputFiveSelections(source); }, 5],
    ['input6 with current article sources', (source) => {
      addInputSixSelections(source);
      source.articleConfig.sources.push({ id: 'simple-aws' }, cloudyThingsSelection());
    }, 6]
  ];

  for (const [description, configure, priorVersion] of variants) {
    const source = fixture();
    configure(source);
    const prior = build(source);
    const { schemaVersion: priorSchemaVersion, ...previousFacts } = prior;
    const selector = directoryAnalyticsSelection();
    source.articleConfig.directoryAnalytics = selector;
    freeze(source);

    const expanded = build(source);
    const { schemaVersion, directoryAnalytics, ...expandedFacts } = expanded;
    assert.equal(priorSchemaVersion, priorVersion, `${description} prior schema remains supported`);
    assert.equal(schemaVersion, 7, `${description} plus directory uses input7`);
    assert.deepEqual(expandedFacts, previousFacts, `${description} retains every previous root fact unchanged`);
    assert.deepEqual(directoryAnalytics, selector);
    assert.notEqual(directoryAnalytics, source.articleConfig.directoryAnalytics, `${description} selector is independently projected`);
    assert.equal(Object.hasOwn(expanded, 'counts'), false, `${description} does not add computed traffic`);
  }
});

test('directory outbound clicks preserve base input3 through input7 and the current four-source combination', async () => {
  const build = await inputBuilder();
  const variants = [
    ['input3', (source) => {}, 3],
    ['input4', (source) => { source.articleConfig.newsletter = newsletterSelection(); }, 4],
    ['input5', (source) => { addInputFiveSelections(source); }, 5],
    ['input6', (source) => { addInputSixSelections(source); }, 6],
    ['input6 with all four current article sources', (source) => {
      addInputSixSelections(source);
      source.articleConfig.sources.push({ id: 'simple-aws' }, cloudyThingsSelection());
    }, 6],
    ['input7', (source) => {
      addInputSixSelections(source);
      source.articleConfig.directoryAnalytics = directoryAnalyticsSelection();
    }, 7]
  ];

  for (const [description, configure, priorVersion] of variants) {
    const source = fixture();
    configure(source);
    const prior = build(source);
    const { schemaVersion: actualPriorVersion, directoryAnalytics: priorDirectoryAnalytics, ...previousFacts } = prior;
    if (priorVersion === 7) assert.deepEqual(priorDirectoryAnalytics, directoryAnalyticsSelection());
    source.articleConfig.directoryAnalytics = directoryAnalyticsClickSelection();
    freeze(source);

    const expanded = build(source);
    const { schemaVersion, directoryAnalytics, ...expandedFacts } = expanded;
    assert.equal(actualPriorVersion, priorVersion, `${description} prior schema remains supported`);
    assert.equal(schemaVersion, 8, `${description} plus directory outbound clicks uses input8`);
    assert.deepEqual(expandedFacts, previousFacts, `${description} preserves every pre-existing root fact`);
    assert.deepEqual(directoryAnalytics, directoryAnalyticsClickSelection());
    assert.notEqual(directoryAnalytics, source.articleConfig.directoryAnalytics, `${description} selector is independently projected`);
    assert.equal(Object.hasOwn(expanded, 'counts'), false, `${description} does not add computed traffic`);
  }
});

test('a directory history date selects input9 for Views-only and click-enabled sources', async () => {
  const build = await inputBuilder();
  const recordedSince = '2024-01-21';

  const viewsOnlySource = fixture();
  const input3 = build(viewsOnlySource);
  viewsOnlySource.articleConfig.directoryAnalytics = { ...directoryAnalyticsSelection(), recordedSince };
  freeze(viewsOnlySource);
  const viewsOnly = build(viewsOnlySource);
  const { schemaVersion: viewsVersion, directoryAnalytics: viewsSelection, ...viewsBase } = viewsOnly;
  const { schemaVersion: baseVersion, ...baseFacts } = input3;
  assert.equal(baseVersion, 3);
  assert.equal(viewsVersion, 9);
  assert.deepEqual(viewsBase, baseFacts, 'directory-only input9 preserves input3 facts without adding an article or Newsletter dependency');
  assert.deepEqual(viewsSelection, { ...directoryAnalyticsSelection(), recordedSince });
  assert.equal(Object.hasOwn(viewsOnly, 'newsletter'), false);
  assert.equal(Object.hasOwn(viewsOnly, 'analytics'), false);
  assert.equal(Object.hasOwn(viewsOnly, 'searchConsole'), false);
  assert.deepEqual(Object.keys(viewsSelection).sort(), ['hostname', 'id', 'language', 'propertyId', 'recordedSince', 'timeZone']);

  const clickSource = JSON.parse(readFileSync(new URL('../public/_content-stats/inputs.json', import.meta.url), 'utf8'));
  clickSource.sources[0].apiKey = 'synthetic-public-delivery-key';
  delete clickSource.newsletterEngagements;
  const source = {
    articleConfig: clickSource,
    talks: JSON.parse(readFileSync(new URL('../src/content/talks.json', import.meta.url), 'utf8')),
    books: JSON.parse(readFileSync(new URL('../src/content/books.json', import.meta.url), 'utf8'))
  };
  delete source.articleConfig.directoryAnalytics.recordedSince;
  const input8 = build(source);
  assert.equal(input8.schemaVersion, 8, 'the maintained selector without a directory date stays input8');
  source.articleConfig.directoryAnalytics.recordedSince = recordedSince;
  freeze(source);
  const currentInput9 = build(source);
  assert.equal(currentInput9.schemaVersion, 9);
  assert.deepEqual(currentInput9.sources.map(({ id }) => id), input8.sources.map(({ id }) => id));
  assert.deepEqual(currentInput9.analytics, input8.analytics);
  assert.deepEqual(currentInput9.newsletter, input8.newsletter);
  assert.deepEqual(currentInput9.searchConsole, input8.searchConsole);
  assert.deepEqual(currentInput9.curated, input8.curated);
  assert.deepEqual(currentInput9.directoryAnalytics, { ...input8.directoryAnalytics, recordedSince });
  assert.deepEqual(Object.keys(currentInput9.directoryAnalytics).sort(), [
    'hostname', 'id', 'language', 'outboundClicks', 'propertyId', 'recordedSince', 'timeZone'
  ]);
});

test('directory recordedSince accepts only a real date and the existing literal click opt-in', async () => {
  const build = await inputBuilder();
  const valid = { ...directoryAnalyticsSelection(), recordedSince: '2024-01-21' };
  const invalid = [
    { ...valid, recordedSince: '2024-2-21' },
    { ...valid, recordedSince: '2024-02-30' },
    { ...valid, recordedSince: null },
    { ...valid, recordedSince: 20240121 },
    { ...valid, outboundClicks: false },
    { ...valid, outboundClicks: null },
    { ...valid, outboundClicks: 'true' },
    { ...valid, outboundClicks: 1 },
    { ...valid, clientSecret: 'synthetic-client-secret' },
    { ...valid, unknownField: true }
  ];
  for (const selector of invalid) {
    const source = fixture();
    source.articleConfig.directoryAnalytics = selector;
    assert.throws(() => build(source), /directory|analytics|date|credential|secret|input/i,
      `invalid input9 directory selection ${JSON.stringify(selector)}`);
  }
});

test('directory Analytics rejects missing, malformed, unknown, private, and credential-bearing selectors', async () => {
  const build = await inputBuilder();
  const valid = directoryAnalyticsSelection();
  const missingRequiredFields = ['id', 'propertyId', 'hostname', 'language', 'timeZone'].map((key) => {
    const value = { ...valid };
    delete value[key];
    return value;
  });
  const invalid = [
    null,
    [],
    ...missingRequiredFields,
    { ...valid, id: 'directory' },
    { ...valid, propertyId: 424203315 },
    { ...valid, propertyId: '424203315x' },
    { ...valid, hostname: 'www.dondeaprendoaws.com' },
    { ...valid, hostname: 'https://dondeaprendoaws.com' },
    { ...valid, language: 'en' },
    { ...valid, timeZone: 'Not/A_Timezone' },
    { ...valid, timeZone: '-03:00' },
    { ...valid, outboundClicks: false },
    { ...valid, outboundClicks: null },
    { ...valid, outboundClicks: 'true' },
    { ...valid, outboundClicks: 1 },
    { ...valid, outboundClicks: undefined },
    { ...valid, clientSecret: 'synthetic-client-secret' },
    { ...valid, refreshToken: 'synthetic-refresh-token' },
    { ...valid, accessToken: 'synthetic-access-token' },
    { ...valid, secretArn: 'arn:aws:ssm:us-east-1:123456789012:parameter/google' },
    { ...valid, unknownField: 'unexpected' }
  ];

  for (const selector of invalid) {
    const source = fixture();
    source.articleConfig.directoryAnalytics = selector;
    assert.throws(() => build(source), /directory|analytics|property|host|language|timezone|credential|secret|input/i,
      `invalid directory Analytics selector ${JSON.stringify(selector)}`);
  }
});

test('the exact Simple AWS article source requires the existing valid English newsletter selection', async () => {
  const build = await inputBuilder();
  const invalidSelections = [
    ['missing newsletter selection', undefined],
    ['null newsletter selection', null],
    ['malformed newsletter selection', { id: 'simple-aws', language: 'en' }],
    ['different newsletter identity', { ...newsletterSelection(), id: 'another-publication' }],
    ['empty publication ID', { ...newsletterSelection(), publicationId: '' }],
    ['Spanish newsletter selection', { ...newsletterSelection(), language: 'es' }]
  ];

  for (const [description, selection] of invalidSelections) {
    const source = fixture();
    source.articleConfig.sources.push({ id: 'simple-aws' });
    if (selection !== undefined) source.articleConfig.newsletter = selection;
    assert.throws(() => build(source), /simple-aws|newsletter|publication|language|input/i, description);
  }
});

test('a Simple AWS expansion keeps Caylent and Builder Center as mandatory base sources', async () => {
  const build = await inputBuilder();
  for (const missingId of ['caylent', 'builder-center']) {
    const source = fixture();
    source.articleConfig.sources.push({ id: 'simple-aws' });
    source.articleConfig.newsletter = newsletterSelection();
    source.articleConfig.sources = source.articleConfig.sources.filter((item) => item.id !== missingId);
    assert.throws(() => build(source), /source|caylent|builder-center|input/i, `expanded source set missing ${missingId}`);
  }
});

test('the Simple AWS article source accepts only its exact ID-only entry and rejects duplicates', async () => {
  const build = await inputBuilder();
  const invalidSources = [
    ['unknown ID', (sources) => sources.push({ id: 'simpleaws' })],
    ['unknown field', (sources) => sources.push({ id: 'simple-aws', label: 'Simple AWS' })],
    ['credential field', (sources) => sources.push({ id: 'simple-aws', apiKey: 'synthetic-private-key' })],
    ['duplicate ID', (sources) => sources.push({ id: 'simple-aws' }, { id: 'simple-aws' })]
  ];

  for (const [description, mutateSources] of invalidSources) {
    const source = fixture();
    mutateSources(source.articleConfig.sources);
    source.articleConfig.newsletter = newsletterSelection();
    assert.throws(() => build(source), /source|simple-aws|duplicate|credential|input/i, description);
  }
});

test('adding Simple AWS preserves root input4, input5, and input6 projections and deep-clones sources', async () => {
  const build = await inputBuilder();
  const variants = [
    ['input4', (source) => { source.articleConfig.newsletter = newsletterSelection(); }, 4],
    ['input5', (source) => { addInputFiveSelections(source); }, 5],
    ['input6', (source) => {
      addInputFiveSelections(source);
      source.articleConfig.searchConsole = searchConsoleSelection();
    }, 6]
  ];

  for (const [description, configure, expectedVersion] of variants) {
    const legacySource = fixture();
    configure(legacySource);
    const legacy = build(legacySource);
    assert.equal(legacy.schemaVersion, expectedVersion);

    const expandedSource = fixture();
    configure(expandedSource);
    expandedSource.articleConfig.sources.push({ id: 'simple-aws' });
    const expanded = build(freeze(expandedSource));
    const { sources: expandedSources, ...expandedRoot } = expanded;
    const { sources: legacySources, ...legacyRoot } = legacy;

    assert.equal(expanded.schemaVersion, expectedVersion, `${description} retains its existing root schema version`);
    assert.deepEqual(expandedRoot, legacyRoot, `${description} keeps every existing root fact unchanged`);
    assert.deepEqual(expandedSources, [...legacySources, { id: 'simple-aws' }], `${description} appends only the new source fact`);
    assert.notEqual(expandedSources, expandedSource.articleConfig.sources, `${description} clones the maintained source array`);
    assert.notEqual(expandedSources.at(-1), expandedSource.articleConfig.sources.at(-1), `${description} clones each source entry`);
    assert.deepEqual(Object.keys(expandedSources.at(-1)), ['id'], `${description} projects no fields beyond the exact source ID`);
    expandedSources.at(-1).id = 'mutated-result';
    assert.equal(expandedSource.articleConfig.sources.at(-1).id, 'simple-aws', `${description} result mutation cannot change maintained configuration`);
    assert.equal(Object.hasOwn(expanded, 'counts'), false, `${description} does not add computed counts`);
  }
});

test('the maintained article-source input8 can add Simple AWS available history without changing other selectors', async () => {
  const build = await inputBuilder();
  const articleConfig = JSON.parse(readFileSync(new URL('../public/_content-stats/inputs.json', import.meta.url), 'utf8'));
  articleConfig.sources[0].apiKey = 'synthetic-public-delivery-key';
  delete articleConfig.newsletterEngagements;
  delete articleConfig.directoryAnalytics.recordedSince;
  const source = {
    articleConfig,
    talks: JSON.parse(readFileSync(new URL('../src/content/talks.json', import.meta.url), 'utf8')),
    books: JSON.parse(readFileSync(new URL('../src/content/books.json', import.meta.url), 'utf8'))
  };
  const before = build(source);
  assert.equal(before.schemaVersion, 8);
  assert.deepEqual(before.sources, articleConfig.sources, 'input8 projects the exact maintained article selection');

  source.articleConfig.analytics.recordedSince = '2023-05-02';
  freeze(source);
  const result = build(source);

  assert.equal(result.schemaVersion, 8, 'recorded history does not require another protected-input version');
  assert.deepEqual(result.sources.map(({ id }) => id), before.sources.map(({ id }) => id));
  assert.deepEqual(result.analytics, { ...before.analytics, recordedSince: '2023-05-02' });
  assert.deepEqual(result.newsletter, before.newsletter);
  assert.deepEqual(result.searchConsole, before.searchConsole);
  assert.deepEqual(result.directoryAnalytics, before.directoryAnalytics);
  assert.deepEqual(result.curated, before.curated);
  assert.equal(Object.hasOwn(result, 'counts'), false, 'the build does not add derived traffic counts');
});

function cloudyThingsSelection() {
  return { id: 'cloudy-things', authorName: 'Guillermo Ojeda', language: 'en' };
}

test('Dónde Aprendo AWS projects as a fixed source selector without changing the protected input version', async () => {
  const build = await inputBuilder();
  const selector = { id: 'donde-aprendo-aws' };
  const source = fixture();
  const before = build(source);
  source.articleConfig.sources.push(selector);
  freeze(source);
  const after = build(source);

  assert.equal(after.schemaVersion, before.schemaVersion, 'an additional source does not require a new protected-input schema');
  assert.deepEqual(after.sources, [...before.sources, selector]);
  assert.deepEqual(Object.keys(after.sources.at(-1)), ['id'], 'the maintained selector exposes no endpoint or credential fields');
  assert.notEqual(after.sources, source.articleConfig.sources, 'the projected source list is copied');
  assert.notEqual(after.sources.at(-1), source.articleConfig.sources.at(-1), 'the projected selector is copied');

  const afterWithoutSource = { ...after, sources: after.sources.slice(0, -1) };
  assert.deepEqual(afterWithoutSource, before, 'adding source coverage preserves every other generated fact');
  assert.equal(Object.hasOwn(after, 'counts'), false, 'the build projection does not add computed counts');
});

test('Dónde Aprendo AWS rejects configurable endpoint, author, language, and credential selectors', async () => {
  const build = await inputBuilder();
  const invalidSelectors = [
    { id: 'donde-aprendo-aws', endpoint: 'https://another.example/feed.json' },
    { id: 'donde-aprendo-aws', language: 'en' },
    { id: 'donde-aprendo-aws', authorName: 'Different Author' },
    { id: 'donde-aprendo-aws', apiKey: 'synthetic-private-key' }
  ];

  for (const selector of invalidSelectors) {
    const source = fixture();
    source.articleConfig.sources.push(selector);
    assert.throws(
      () => build(source),
      /donde|source|selector|credential|input/i,
      `invalid Dónde Aprendo AWS selector ${JSON.stringify(selector)}`
    );
  }

  const duplicate = fixture();
  duplicate.articleConfig.sources.push({ id: 'donde-aprendo-aws' }, { id: 'donde-aprendo-aws' });
  assert.throws(() => build(duplicate), /donde|source|duplicate|input/i, 'a source can be selected only once');
});

test('AWS for Engineers projects as an exact fixed selector in input10 without changing other generated facts', async () => {
  const build = await inputBuilder();
  const source = fixture();
  source.articleConfig.sources.push(
    { id: 'simple-aws' },
    { id: 'cloudy-things', authorName: 'Guillermo Ojeda', language: 'en' },
    { id: 'donde-aprendo-aws' }
  );
  source.articleConfig.newsletter = newsletterSelection();
  source.articleConfig.analytics = analyticsSelection();
  source.articleConfig.searchConsole = searchConsoleSelection();
  source.articleConfig.directoryAnalytics = {
    ...directoryAnalyticsClickSelection(),
    recordedSince: '2024-01-21'
  };
  source.articleConfig.newsletterEngagements = true;
  const before = build(source);
  const awsSelector = { id: 'aws-for-engineers' };
  source.articleConfig.sources.push(awsSelector);
  freeze(source);
  const after = build(source);

  assert.equal(after.schemaVersion, 10, 'a new article source does not change the protected input version');
  assert.deepEqual(after.sources, [...before.sources, awsSelector]);
  assert.deepEqual(Object.keys(after.sources.at(-1)), ['id'], 'no endpoint, author, language, or credential is configurable');
  assert.notEqual(after.sources, source.articleConfig.sources);
  assert.notEqual(after.sources.at(-1), source.articleConfig.sources.at(-1));
  const afterWithoutSource = { ...after, sources: after.sources.slice(0, -1) };
  assert.deepEqual(afterWithoutSource, before, 'selecting the feed leaves every other generated fact unchanged');
  assert.equal(Object.hasOwn(after, 'counts'), false);
});

test('AWS for Engineers rejects configurable endpoint, author, language, credential, and duplicate selectors', async () => {
  const build = await inputBuilder();
  const invalidSelectors = [
    { id: 'aws-for-engineers', endpoint: 'https://another.example/feed.json' },
    { id: 'aws-for-engineers', language: 'es' },
    { id: 'aws-for-engineers', authorName: 'Different Author' },
    { id: 'aws-for-engineers', apiKey: 'synthetic-private-key' }
  ];

  for (const selector of invalidSelectors) {
    const source = fixture();
    source.articleConfig.sources.push(selector);
    assert.throws(
      () => build(source),
      /aws|source|selector|credential|input/i,
      `invalid AWS for Engineers selector ${JSON.stringify(selector)}`
    );
  }

  const duplicate = fixture();
  duplicate.articleConfig.sources.push({ id: 'aws-for-engineers' }, { id: 'aws-for-engineers' });
  assert.throws(() => build(duplicate), /aws|source|duplicate|input/i, 'a source can be selected only once');
});

test('Cloudy Things can generate input3 without newsletter access or a Simple AWS source', async () => {
  const build = await inputBuilder();
  const source = fixture();
  source.articleConfig.sources.push(cloudyThingsSelection());
  const result = build(source);

  assert.equal(result.schemaVersion, 3);
  assert.deepEqual(result.sources, source.articleConfig.sources);
  assert.equal(Object.hasOwn(result, 'newsletter'), false);
  assert.equal(Object.hasOwn(result, 'analytics'), false);
  assert.equal(Object.hasOwn(result, 'searchConsole'), false);
  assert.equal(Object.hasOwn(result, 'counts'), false);
});

test('Cloudy Things preserves input3 through input6 facts and clones both supported expanded source combinations', async () => {
  const build = await inputBuilder();
  const variants = [
    [3, () => {}],
    [4, (source) => { source.articleConfig.newsletter = newsletterSelection(); }],
    [5, (source) => { addInputFiveSelections(source); }],
    [6, (source) => {
      addInputFiveSelections(source);
      source.articleConfig.searchConsole = searchConsoleSelection();
    }]
  ];
  for (const [version, configure] of variants) {
    for (const includeSimpleAws of version === 3 ? [false] : [false, true]) {
      const source = fixture();
      configure(source);
      if (includeSimpleAws) source.articleConfig.sources.push({ id: 'simple-aws' });
      const before = build(source);
      source.articleConfig.sources.push(cloudyThingsSelection());
      const expanded = build(freeze(source));
      const { sources: beforeSources, ...beforeFacts } = before;
      const { sources: expandedSources, ...expandedFacts } = expanded;

      assert.equal(expanded.schemaVersion, version);
      assert.deepEqual(expandedFacts, beforeFacts, 'article coverage must not alter other family selectors or curated facts');
      assert.deepEqual(expandedSources, [...beforeSources, cloudyThingsSelection()]);
      assert.notEqual(expandedSources.at(-1), source.articleConfig.sources.at(-1));
      assert.deepEqual(Object.keys(expandedSources.at(-1)).sort(), ['authorName', 'id', 'language']);
      expandedSources.at(-1).authorName = 'Changed result only';
      assert.equal(source.articleConfig.sources.at(-1).authorName, 'Guillermo Ojeda');
    }
  }
});

test('Cloudy Things rejects incomplete, unsupported, duplicate, or credential-bearing maintained selectors', async () => {
  const build = await inputBuilder();
  const valid = cloudyThingsSelection();
  const invalid = [
    { id: 'cloudy-things' },
    { ...valid, authorName: '' },
    { ...valid, authorName: '  ' },
    { ...valid, authorName: null },
    { id: 'cloudy-things', authorName: valid.authorName },
    { ...valid, language: 'es' },
    { ...valid, language: null },
    { ...valid, apiKey: 'synthetic-private-key' },
    { ...valid, archiveUrl: 'https://another-publication.test/archive' },
    { ...valid, publicationId: 'unused-provider-selector' }
  ];
  for (const selection of invalid) {
    const source = fixture();
    source.articleConfig.sources.push(selection);
    assert.throws(() => build(source), /cloudy|source|author|language|credential|input/i);
  }
  const duplicate = fixture();
  duplicate.articleConfig.sources.push(valid, structuredClone(valid));
  assert.throws(() => build(duplicate), /cloudy|source|duplicate|input/i);
});

test('Cloudy Things keeps the base article sources and existing Simple AWS prerequisites mandatory', async () => {
  const build = await inputBuilder();
  for (const missingId of ['caylent', 'builder-center']) {
    const source = fixture();
    source.articleConfig.sources = source.articleConfig.sources.filter(({ id }) => id !== missingId);
    source.articleConfig.sources.push(cloudyThingsSelection());
    assert.throws(() => build(source), /source|caylent|builder|input/i);
  }
  const source = fixture();
  source.articleConfig.sources.push({ id: 'simple-aws' }, cloudyThingsSelection());
  assert.throws(() => build(source), /source|simple|newsletter|input/i,
    'Cloudy Things needs no credential, but cannot bypass the separate Simple AWS newsletter prerequisite');
});

test('the exact newsletter engagement opt-in emits input10 without changing other selected families', async () => {
  const build = await inputBuilder();
  const source = fixture();
  source.articleConfig.newsletter = newsletterSelection();
  source.articleConfig.analytics = analyticsSelection();
  source.articleConfig.searchConsole = searchConsoleSelection();
  source.articleConfig.directoryAnalytics = {
    ...directoryAnalyticsClickSelection(),
    recordedSince: '2024-01-21'
  };
  delete source.articleConfig.newsletterEngagements;
  const legacy = build(source);
  source.articleConfig.newsletterEngagements = true;
  freeze(source);

  const result = build(source);
  assert.equal(legacy.schemaVersion, 9, 'the existing date and click selectors retain input9 without the opt-in');
  assert.equal(result.schemaVersion, 10);
  assert.deepEqual(result, {
    ...legacy,
    schemaVersion: 10,
    newsletterEngagements: true
  });
  assert.deepEqual(result.newsletter, newsletterSelection());
  assert.deepEqual(result.analytics, analyticsSelection(), 'article history remains selected');
  assert.deepEqual(result.searchConsole, searchConsoleSelection());
  assert.deepEqual(result.directoryAnalytics, {
    ...directoryAnalyticsClickSelection(),
    recordedSince: '2024-01-21'
  });
  assert.equal(Object.hasOwn(result.newsletter, 'newsletterEngagements'), false,
    'engagement opt-in is a protected-input capability, not a new newsletter identity field');
  assert.equal(Object.hasOwn(legacy, 'newsletterEngagements'), false,
    'the existing generated projection does not grow an opt-in field when it is absent');
});

test('input10 engagement selection requires the exact true flag and an English newsletter', async () => {
  const build = await inputBuilder();
  const base = fixture();
  const invalidFlags = [false, 1, 'true', null, undefined];
  for (const flag of invalidFlags) {
    const source = fixture();
    source.articleConfig.newsletter = newsletterSelection();
    if (flag !== undefined) source.articleConfig.newsletterEngagements = flag;
    else source.articleConfig.newsletterEngagements = undefined;
    assert.throws(() => build(source), /engagement|newsletter|flag|input/i,
      `unsupported engagement selector ${JSON.stringify(flag)}`);
  }

  for (const selection of [undefined, { ...newsletterSelection(), language: 'es' }]) {
    const source = structuredClone(base);
    source.articleConfig.newsletterEngagements = true;
    if (selection !== undefined) source.articleConfig.newsletter = selection;
    assert.throws(() => build(source), /engagement|newsletter|English|language|input/i,
      `engagements require the selected English newsletter: ${JSON.stringify(selection)}`);
  }
});

test('input10 can omit optional Google families and keeps directory date and clicks independently optional', async () => {
  const build = await inputBuilder();
  const base = fixture();
  base.articleConfig.newsletter = newsletterSelection();
  base.articleConfig.newsletterEngagements = true;
  const input10 = build(base);
  assert.equal(input10.schemaVersion, 10);
  assert.deepEqual(Object.keys(input10).sort(), [
    'curated', 'definitionVersion', 'newsletter', 'newsletterEngagements', 'schemaVersion', 'sources'
  ]);

  for (const directoryAnalytics of [
    directoryAnalyticsSelection(),
    { ...directoryAnalyticsSelection(), outboundClicks: true },
    { ...directoryAnalyticsSelection(), recordedSince: '2024-01-21' },
    { ...directoryAnalyticsSelection(), outboundClicks: true, recordedSince: '2024-01-21' }
  ]) {
    const source = structuredClone(base);
    source.articleConfig.directoryAnalytics = directoryAnalytics;
    const result = build(source);
    assert.equal(result.schemaVersion, 10);
    assert.deepEqual(result.directoryAnalytics, directoryAnalytics);
    assert.deepEqual(result.newsletter, base.articleConfig.newsletter);
    assert.equal(result.newsletterEngagements, true);
  }

  const directoryOnlyOld = fixture();
  directoryOnlyOld.articleConfig.directoryAnalytics = { ...directoryAnalyticsSelection(), recordedSince: '2024-01-21' };
  assert.equal(build(directoryOnlyOld).schemaVersion, 9,
    'legacy directory-only selections remain legal without a Newsletter or engagement opt-in');
});

function builderArticleViewsSelection(overrides = {}) {
  return {
    observedAt: '2026-10-16T12:00:00.000Z',
    views: { en: 310, es: 740 },
    ...overrides
  };
}

test('an optional manual Builder observation adds only input11 and leaves absent inputs3 through 10 unchanged', async () => {
  const build = await inputBuilder();
  const withoutObservation = [
    [3, (source) => {}],
    [4, (source) => { source.articleConfig.newsletter = newsletterSelection(); }],
    [5, (source) => addInputFiveSelections(source)],
    [6, (source) => {
      addInputFiveSelections(source);
      source.articleConfig.searchConsole = searchConsoleSelection();
    }],
    [7, (source) => { source.articleConfig.directoryAnalytics = directoryAnalyticsSelection(); }],
    [8, (source) => { source.articleConfig.directoryAnalytics = directoryAnalyticsClickSelection(); }],
    [9, (source) => {
      source.articleConfig.directoryAnalytics = { ...directoryAnalyticsSelection(), recordedSince: '2024-01-21' };
    }],
    [10, (source) => {
      source.articleConfig.newsletter = newsletterSelection();
      source.articleConfig.newsletterEngagements = true;
    }]
  ];

  for (const [version, configure] of withoutObservation) {
    const source = fixture();
    configure(source);
    const legacy = build(source);
    assert.equal(legacy.schemaVersion, version);
    assert.equal(Object.hasOwn(legacy, 'builderArticleViews'), false,
      `input${version} remains unchanged when no manual observation is present`);
  }

  const minimum = fixture();
  minimum.articleConfig.builderArticleViews = builderArticleViewsSelection();
  freeze(minimum);
  const minimumResult = build(minimum);
  assert.equal(minimumResult.schemaVersion, 11);
  assert.deepEqual(minimumResult.builderArticleViews, builderArticleViewsSelection());
  assert.deepEqual(Object.keys(minimumResult).sort(), [
    'builderArticleViews', 'curated', 'definitionVersion', 'schemaVersion', 'sources'
  ]);
  assert.notEqual(minimumResult.builderArticleViews, minimum.articleConfig.builderArticleViews);
  assert.notEqual(minimumResult.builderArticleViews.views, minimum.articleConfig.builderArticleViews.views);
  minimumResult.builderArticleViews.views.en = 1;
  assert.equal(minimum.articleConfig.builderArticleViews.views.en, 310,
    'mutating generated counts cannot change the maintained observation');

  const directoryOnly = fixture();
  directoryOnly.articleConfig.directoryAnalytics = directoryAnalyticsSelection();
  directoryOnly.articleConfig.builderArticleViews = builderArticleViewsSelection();
  const directoryOnlyResult = build(directoryOnly);
  assert.equal(directoryOnlyResult.schemaVersion, 11);
  assert.deepEqual(directoryOnlyResult.directoryAnalytics, directoryAnalyticsSelection());
  assert.equal(Object.hasOwn(directoryOnlyResult, 'newsletter'), false,
    'the manual observation can coexist with directory Analytics without Simple AWS or Newsletter selectors');
  assert.equal(Object.hasOwn(directoryOnlyResult, 'analytics'), false);
  assert.equal(Object.hasOwn(directoryOnlyResult, 'newsletterEngagements'), false);

  const complete = fixture();
  complete.articleConfig.sources.push({ id: 'simple-aws' }, cloudyThingsSelection(), { id: 'donde-aprendo-aws' }, { id: 'aws-for-engineers' });
  complete.articleConfig.newsletter = newsletterSelection();
  complete.articleConfig.analytics = analyticsSelection();
  complete.articleConfig.searchConsole = searchConsoleSelection();
  complete.articleConfig.directoryAnalytics = { ...directoryAnalyticsClickSelection(), recordedSince: '2024-01-21' };
  complete.articleConfig.newsletterEngagements = true;
  const previous = build(complete);
  complete.articleConfig.builderArticleViews = builderArticleViewsSelection();
  freeze(complete);
  const result = build(complete);
  const sameExistingFacts = { ...result, schemaVersion: previous.schemaVersion };
  delete sameExistingFacts.builderArticleViews;
  assert.equal(previous.schemaVersion, 10);
  assert.equal(result.schemaVersion, 11);
  assert.deepEqual(sameExistingFacts, previous,
    'the observation advances only the input version and its own protected field, including with every existing selector enabled');
  assert.deepEqual(result.builderArticleViews, builderArticleViewsSelection());
  assert.deepEqual(Object.keys(result.builderArticleViews).sort(), ['observedAt', 'views']);
  assert.deepEqual(Object.keys(result.builderArticleViews.views).sort(), ['en', 'es']);
});

test('manual Builder input accepts explicit zero and a safe derived total at the integer boundary', async () => {
  const build = await inputBuilder();
  const zero = fixture();
  zero.articleConfig.builderArticleViews = builderArticleViewsSelection({ views: { en: 0, es: 0 } });
  const zeroResult = build(zero);
  assert.equal(zeroResult.schemaVersion, 11);
  assert.deepEqual(zeroResult.builderArticleViews.views, { en: 0, es: 0 },
    'zero is a valid recorded total, not an absent observation');

  const boundary = fixture();
  boundary.articleConfig.builderArticleViews = builderArticleViewsSelection({
    views: { en: Number.MAX_SAFE_INTEGER, es: 0 }
  });
  const boundaryResult = build(boundary);
  assert.deepEqual(boundaryResult.builderArticleViews.views, {
    en: Number.MAX_SAFE_INTEGER,
    es: 0
  });
});

test('manual Builder observations reject noncanonical dates, unknown fields, and invalid or overflowing totals', async () => {
  const build = await inputBuilder();
  const invalid = [
    ['null value', null],
    ['array value', []],
    ['missing date', { views: { en: 1, es: 2 } }],
    ['missing language total', { observedAt: '2026-10-16T12:00:00.000Z', views: { en: 1 } }],
    ['unknown top-level field', { ...builderArticleViewsSelection(), source: { id: 'builder-center' } }],
    ['unknown total field', { ...builderArticleViewsSelection(), views: { en: 1, es: 2, all: 3 } }],
    ['endpoint selector', { ...builderArticleViewsSelection(), endpoint: 'https://untrusted.example/feed.json' }],
    ['noncanonical timestamp', { ...builderArticleViewsSelection(), observedAt: '2026-10-16T12:00:00Z' }],
    ['impossible calendar date', { ...builderArticleViewsSelection(), observedAt: '2026-02-30T12:00:00.000Z' }],
    ['before tracking start', { ...builderArticleViewsSelection(), observedAt: '2026-01-05T23:59:59.999Z' }],
    ['future observation', { ...builderArticleViewsSelection(), observedAt: '2099-01-01T00:00:00.000Z' }],
    ['negative English total', { ...builderArticleViewsSelection(), views: { en: -1, es: 2 } }],
    ['fractional Spanish total', { ...builderArticleViewsSelection(), views: { en: 1, es: 2.5 } }],
    ['string total', { ...builderArticleViewsSelection(), views: { en: '1', es: 2 } }],
    ['null total', { ...builderArticleViewsSelection(), views: { en: 1, es: null } }],
    ['unsafe language total', { ...builderArticleViewsSelection(), views: { en: Number.MAX_SAFE_INTEGER + 1, es: 0 } }],
    ['unsafe derived sum', { ...builderArticleViewsSelection(), views: { en: Number.MAX_SAFE_INTEGER, es: 1 } }]
  ];

  for (const [name, value] of invalid) {
    const source = fixture();
    source.articleConfig.builderArticleViews = value;
    assert.throws(() => build(source), /builder|view|observation|date|total|input|invalid/i, name);
  }
});

test('input11 keeps existing optional selector dependencies when a manual observation is present', async () => {
  const build = await inputBuilder();
  const inputWithoutNewsletter = fixture();
  inputWithoutNewsletter.articleConfig.builderArticleViews = builderArticleViewsSelection();
  inputWithoutNewsletter.articleConfig.analytics = analyticsSelection();
  assert.throws(() => build(inputWithoutNewsletter), /analytics|newsletter|input/i,
    'Analytics still requires its existing Newsletter selection');

  const searchWithoutAnalytics = fixture();
  searchWithoutAnalytics.articleConfig.builderArticleViews = builderArticleViewsSelection();
  searchWithoutAnalytics.articleConfig.newsletter = newsletterSelection();
  searchWithoutAnalytics.articleConfig.searchConsole = searchConsoleSelection();
  assert.throws(() => build(searchWithoutAnalytics), /search|analytics|input/i,
    'Search Console still requires its existing Analytics selection');

  const engagementWithoutNewsletter = fixture();
  engagementWithoutNewsletter.articleConfig.builderArticleViews = builderArticleViewsSelection();
  engagementWithoutNewsletter.articleConfig.newsletterEngagements = true;
  assert.throws(() => build(engagementWithoutNewsletter), /engagement|newsletter|input/i,
    'the engagement opt-in still requires a Newsletter selector');

  for (const newsletterEngagements of [false, true]) {
    const nonEnglishEngagement = fixture();
    nonEnglishEngagement.articleConfig.builderArticleViews = builderArticleViewsSelection();
    nonEnglishEngagement.articleConfig.newsletter = { ...newsletterSelection(), language: 'es' };
    nonEnglishEngagement.articleConfig.newsletterEngagements = newsletterEngagements;
    assert.throws(() => build(nonEnglishEngagement), /engagement|newsletter|English|language|input/i,
      `non-English engagement selector ${newsletterEngagements} remains invalid with manual totals`);
  }

  const invalidEngagementFlag = fixture();
  invalidEngagementFlag.articleConfig.builderArticleViews = builderArticleViewsSelection();
  invalidEngagementFlag.articleConfig.newsletter = newsletterSelection();
  invalidEngagementFlag.articleConfig.newsletterEngagements = false;
  assert.throws(() => build(invalidEngagementFlag), /engagement|newsletter|flag|input/i,
    'a manual observation cannot make the literal-true opt-in permissive');
});

function individualArticleFacts() {
  return {
    publications: [
      {
        sourceId: 'dev-community',
        title: '  Café\u00a0con AWS  ',
        language: 'es',
        publishedAt: '2024-02-29T10:15:00-03:00',
        url: 'https://dev.to/guilleojeda/cafe-con-aws'
      },
      {
        sourceId: 'linkedin-articles',
        title: 'AWS Community Builders: How to Join the Program',
        language: 'en',
        publishedAt: '2025-01-17T13:43:49.000+00:00',
        url: 'https://es.linkedin.com/pulse/aws-community-builders-guille-ojeda'
      }
    ],
    exclusions: [
      {
        sourceId: 'medium',
        title: 'Personal fiction',
        url: 'https://medium.com/@guilleojeda/personal-fiction-123456789abc',
        reason: 'Personal fiction is outside the approved technical and AWS professional selection.'
      }
    ]
  };
}

test('individual article facts project once to input12, preserving public metadata and stripping editorial notes', async () => {
  const build = await inputBuilder();
  const source = fixture();
  const previous = build(source);
  source.articles = individualArticleFacts();
  freeze(source);
  const result = build(source);
  assert.equal(result.schemaVersion, 12, 'an explicit inventory advances the protected contract');
  assert.deepEqual(Object.keys(result).sort(), [
    'articleInventory', 'curated', 'definitionVersion', 'schemaVersion', 'sources'
  ]);
  assert.deepEqual(result.articleInventory, {
    publications: source.articles.publications,
    exclusions: [{ sourceId: 'medium', url: source.articles.exclusions[0].url }]
  });
  const { articleInventory, ...unchanged } = result;
  assert.deepEqual({ ...unchanged, schemaVersion: previous.schemaVersion }, previous,
    'article facts do not rewrite automatic selectors or maintained talks and books');
  assert.notEqual(articleInventory.publications, source.articles.publications);
  assert.notEqual(articleInventory.publications[0], source.articles.publications[0]);
  assert.notEqual(articleInventory.exclusions[0], source.articles.exclusions[0]);
  assert.equal(articleInventory.publications[0].title, '  Café\u00a0con AWS  ',
    'the build preserves readable source titles; only the shared collector normalizes identity');
  assert.equal(JSON.stringify(result).includes('Personal fiction'), false);
  assert.equal(JSON.stringify(result).includes('outside the approved'), false);
  assert.equal(Object.hasOwn(result, 'counts'), false, 'the daily collector derives the deduplicated figures');
});

test('individual article input12 coexists with every previous selector combination and optional manual Builder views', async () => {
  const build = await inputBuilder();
  const selections = [
    [3, () => {}],
    [4, (value) => { value.articleConfig.newsletter = newsletterSelection(); }],
    [5, (value) => addInputFiveSelections(value)],
    [6, (value) => {
      addInputFiveSelections(value);
      value.articleConfig.searchConsole = searchConsoleSelection();
    }],
    [7, (value) => { value.articleConfig.directoryAnalytics = directoryAnalyticsSelection(); }],
    [8, (value) => { value.articleConfig.directoryAnalytics = directoryAnalyticsClickSelection(); }],
    [9, (value) => {
      value.articleConfig.directoryAnalytics = { ...directoryAnalyticsClickSelection(), recordedSince: '2024-01-21' };
    }],
    [10, (value) => {
      value.articleConfig.sources.push({ id: 'simple-aws' }, cloudyThingsSelection(),
        { id: 'donde-aprendo-aws' }, { id: 'aws-for-engineers' });
      value.articleConfig.newsletter = newsletterSelection();
      value.articleConfig.newsletterEngagements = true;
      value.articleConfig.analytics = analyticsSelection();
      value.articleConfig.searchConsole = searchConsoleSelection();
      value.articleConfig.directoryAnalytics = { ...directoryAnalyticsClickSelection(), recordedSince: '2024-01-21' };
    }],
    [11, (value) => { value.articleConfig.builderArticleViews = builderArticleViewsSelection(); }]
  ];
  for (const [version, configure] of selections) {
    const source = fixture();
    configure(source);
    const previous = build(source);
    assert.equal(previous.schemaVersion, version, `input${version} baseline is valid without individual articles`);
    source.articles = individualArticleFacts();
    const current = build(source);
    assert.equal(current.schemaVersion, 12, `input${version} plus individual facts uses input12`);
    const { articleInventory, ...base } = current;
    assert.deepEqual({ ...base, schemaVersion: version }, previous,
      `input${version} selectors and facts survive unchanged`);
    assert.equal(articleInventory.publications.length, 2);

    source.articleConfig.builderArticleViews = builderArticleViewsSelection();
    const withManualViews = build(source);
    assert.equal(withManualViews.schemaVersion, 12);
    assert.deepEqual(withManualViews.builderArticleViews, builderArticleViewsSelection());
    assert.deepEqual(withManualViews.articleInventory, articleInventory,
      'a Builder observation does not edit the article selection');
  }
});

test('individual facts retain alternate destinations, explicit unknown dates and date-only precision without a build-time count', async () => {
  const build = await inputBuilder();
  const source = fixture();
  source.articles = individualArticleFacts();
  source.articles.publications.push(
    {
      ...source.articles.publications[0],
      sourceId: 'spainclouds',
      url: 'https://www.spainclouds.com/blog/cafe-con-aws',
      publishedAt: null
    },
    {
      sourceId: 'hackernoon',
      url: 'https://hackernoon.com/a-practical-guide-to-aws',
      title: 'A practical guide to AWS',
      language: 'en',
      publishedAt: '2024-02-29'
    }
  );
  const result = build(source);
  assert.equal(result.schemaVersion, 12);
  assert.deepEqual(result.articleInventory.publications, source.articles.publications,
    'copies are preserved for the eventual full catalog and deduplicated by the collector');
  assert.equal(result.articleInventory.publications[2].publishedAt, null,
    'unknown publication dates are never replaced with build or collection time');
  assert.equal(result.articleInventory.publications[3].publishedAt, '2024-02-29');
  assert.equal(Object.hasOwn(result.articleInventory, 'counts'), false);
  const empty = build({ ...fixture(), articles: { publications: [], exclusions: [] } });
  assert.equal(empty.schemaVersion, 12);
  assert.deepEqual(empty.articleInventory, { publications: [], exclusions: [] },
    'an explicitly empty valid selection is different from a missing or malformed inventory');
});

const invalidIndividualFacts = [
  ['null inventory', (value) => { value.articles = null; }],
  ['array inventory', (value) => { value.articles = []; }],
  ['missing publication collection', (value) => { delete value.articles.publications; }],
  ['missing exclusion collection', (value) => { delete value.articles.exclusions; }],
  ['unknown inventory field', (value) => { value.articles.counts = { all: 99 }; }],
  ['unknown publication field', (value) => { value.articles.publications[0].apiKey = 'synthetic-private-canary'; }],
  ['unknown source', (value) => { value.articles.publications[0].sourceId = 'unreviewed-source'; }],
  ['whole mixed-source selector', (value) => { value.articleConfig.sources.push({ id: 'dev-community' }); }],
  ['automatic source entered twice as maintained content', (value) => { value.articles.publications[0].sourceId = 'donde-aprendo-aws'; }],
  ['excluded Medium imported as articles', (value) => { value.articles.publications[0].sourceId = 'medium'; }],
  ['missing title', (value) => { delete value.articles.publications[0].title; }],
  ['blank title', (value) => { value.articles.publications[0].title = '\u2003\u00a0'; }],
  ['unsupported language', (value) => { value.articles.publications[0].language = 'fr'; }],
  ['missing publication date field', (value) => { delete value.articles.publications[0].publishedAt; }],
  ['invalid publication date', (value) => { value.articles.publications[0].publishedAt = '2026-02-30'; }],
  ['invalid timestamp date', (value) => { value.articles.publications[0].publishedAt = '2026-02-30T10:15:00Z'; }],
  ['future publication date', (value) => { value.articles.publications[0].publishedAt = '2099-01-01'; }],
  ['ambiguous local timestamp', (value) => { value.articles.publications[0].publishedAt = '2024-02-29T10:15:00'; }],
  ['missing public URL', (value) => { delete value.articles.publications[0].url; }],
  ['HTTP destination', (value) => { value.articles.publications[0].url = 'http://dev.to/guilleojeda/article'; }],
  ['credential destination', (value) => { value.articles.publications[0].url = 'https://user:password@dev.to/guilleojeda/article'; }],
  ['private destination', (value) => { value.articles.publications[0].url = 'https://127.0.0.1/article'; }],
  ['wrong platform host', (value) => { value.articles.publications[0].url = 'https://example.test/article'; }],
  ['preview query', (value) => { value.articles.publications[0].url += '?preview=synthetic-private-canary'; }],
  ['fragment destination', (value) => { value.articles.publications[0].url += '#private'; }],
  ['alternate port', (value) => { value.articles.publications[0].url = 'https://dev.to:8443/guilleojeda/article'; }],
  ['duplicate stable destination', (value) => { value.articles.publications.push(structuredClone(value.articles.publications[0])); }],
  ['duplicate stable destination with another title', (value) => {
    value.articles.publications.push({ ...value.articles.publications[0], title: 'Changed title', language: 'en' });
  }],
  ['duplicate exclusion', (value) => { value.articles.exclusions.push(structuredClone(value.articles.exclusions[0])); }],
  ['unknown exclusion source', (value) => { value.articles.exclusions[0].sourceId = 'unreviewed-source'; }],
  ['missing exclusion reason', (value) => { delete value.articles.exclusions[0].reason; }],
  ['blank exclusion reason', (value) => { value.articles.exclusions[0].reason = ' '; }],
  ['unknown exclusion field', (value) => { value.articles.exclusions[0].accessToken = 'synthetic-private-canary'; }],
  ['conflicting inclusion and exclusion', (value) => {
    value.articles.exclusions.push({
      sourceId: value.articles.publications[0].sourceId,
      url: value.articles.publications[0].url,
      title: value.articles.publications[0].title,
      reason: 'Contradictory editorial selection'
    });
  }]
];

for (const [description, mutate] of invalidIndividualFacts) {
  test(`individual article generation rejects ${description} before publishing protected input`, async () => {
    const build = await inputBuilder();
    const source = { ...fixture(), articles: individualArticleFacts() };
    mutate(source);
    assert.throws(() => build(source), /article|inventory|publication|exclusion|source|input|date|url|title|language/i,
      'invalid maintained data must stop the build, rather than dropping a row or inventing plausible counts');
  });
}

test('the maintained article inventory is exactly the approved 88 destinations and 11 stable exclusions', async () => {
  const maintainedUrl = new URL('../src/content/articles.json', import.meta.url);
  assert.ok(existsSync(maintainedUrl), 'approved individual article facts must have a maintained content file');
  const articles = JSON.parse(readFileSync(maintainedUrl, 'utf8'));
  assert.deepEqual(Object.keys(articles).sort(), ['exclusions', 'publications']);
  assert.equal(articles.publications.length, 88);
  assert.equal(articles.exclusions.length, 11);

  const publications = articles.publications.map(({ sourceId, title, language, publishedAt, url }) =>
    ({ sourceId, title, language, publishedAt, url })).sort((a, b) =>
    a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  const exclusions = articles.exclusions.map(({ sourceId, url }) => ({ sourceId, url })).sort((a, b) =>
    a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  // Independent expected sets from the user's approved editorial-review.csv, not collector output.
  assert.equal(digest(publications), '123cfa19b2a7cd5ee1e6336bd700d1a1b7929c4a39adedba66036a0c0d07545c',
    'preserve every approved original title, actual language, backed date and alternate destination; no invented LinkedIn items');
  assert.equal(digest(exclusions), '94df963b647ec16aed4fdb73d6d917bc86f61ef82f0233e3553a2cdb750a11cd',
    'all nine personal Medium texts, the DEV promotion and the general-study LinkedIn essay stay excluded');
  for (const item of articles.exclusions) {
    assert.equal(typeof item.title, 'string');
    assert.notEqual(item.title.trim(), '');
    assert.equal(typeof item.reason, 'string');
    assert.notEqual(item.reason.trim(), '', 'each exclusion documents its editorial reason');
  }
  const bySource = Object.fromEntries(['dev-community', 'linkedin-articles', 'spainclouds', 'hackernoon']
    .map((sourceId) => [sourceId, publications.filter((item) => item.sourceId === sourceId).length]));
  assert.deepEqual(bySource, { 'dev-community': 69, 'linkedin-articles': 10, spainclouds: 5, hackernoon: 4 });
  const normalize = (title) => title.normalize('NFC').toLowerCase().replace(/[\s\p{White_Space}]+/gu, ' ').trim();
  const identities = new Map(publications.map((item) => [JSON.stringify([normalize(item.title), item.language]), item.language]));
  assert.equal(identities.size, 81);
  assert.equal([...identities.values()].filter((language) => language === 'en').length, 73);
  assert.equal([...identities.values()].filter((language) => language === 'es').length, 8);
  assert.ok(publications.some((item) => /Community Builders: How to Join/i.test(item.title)),
    'the explicitly approved AWS professional guides remain included');
  const build = await inputBuilder();
  const result = build({ ...fixture(), articles });
  assert.equal(result.schemaVersion, 12);
  assert.deepEqual(result.articleInventory.publications, articles.publications);
  assert.equal(result.articleInventory.exclusions.length, 11);
});

test('implementation regression: build accepts article paths and rejects platform profile paths', async () => {
  const build = await inputBuilder();
  const validDestinations = [
    ['dev-community', 'https://dev.to/guilleojeda/an-article'],
    ['linkedin-articles', 'https://www.linkedin.com/pulse/an-article-guille-ojeda'],
    ['spainclouds', 'https://www.spainclouds.com/blog/an-article']
  ];
  for (const [index, [sourceId, url]] of validDestinations.entries()) {
    const source = { ...fixture(), articles: individualArticleFacts() };
    source.articles.publications.push({
      sourceId,
      title: `Valid destination ${index}`,
      language: sourceId === 'spainclouds' ? 'es' : 'en',
      publishedAt: '2025-01-17',
      url
    });
    assert.doesNotThrow(() => build(source), `${sourceId} article URL remains valid`);
  }

  const invalidDestinations = [
    ['dev-community', 'https://dev.to/guilleojeda'],
    ['linkedin-articles', 'https://www.linkedin.com/in/guilleojeda/'],
    ['spainclouds', 'https://www.spainclouds.com/about']
  ];
  for (const [index, [sourceId, url]] of invalidDestinations.entries()) {
    const source = { ...fixture(), articles: individualArticleFacts() };
    source.articles.publications.push({
      sourceId,
      title: `Invalid profile path ${index}`,
      language: sourceId === 'spainclouds' ? 'es' : 'en',
      publishedAt: '2025-01-17',
      url
    });
    assert.throws(() => build(source), /article|path|url|invalid/i,
      `${sourceId} profile or informational path cannot pass build validation`);
  }

  const whitespaceTitle = { ...fixture(), articles: individualArticleFacts() };
  whitespaceTitle.articles.publications.push({
    sourceId: 'dev-community',
    title: '\u0085',
    language: 'en',
    publishedAt: '2025-01-17',
    url: 'https://dev.to/guilleojeda/whitespace-title'
  });
  assert.throws(() => build(whitespaceTitle), /article|title|invalid/i,
    'the build rejects Unicode whitespace that the runtime identity normalizer removes');
});
