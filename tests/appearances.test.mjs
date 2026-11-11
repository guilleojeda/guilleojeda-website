import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../src/content/appearances.mjs', import.meta.url);

// Proposed public data contract:
// - speaking agenda rows have id, talkId, occurrenceId, role (EN/ES), when, and
//   optional localized location and href. Title, event, and status come from talks.json.
// - standalone attendee/organizer rows have id, event (EN/ES), role (EN/ES),
//   when, and optional localized location and href.
// - when is either { date: 'YYYY-MM-DD', timeZone: IANA zone } or
//   { start: RFC3339-with-offset, end?: RFC3339-with-offset, timeZone: IANA zone }.
//   A missing end means the end time is unknown; it does not mean in progress.
// - resolveAppearances(appearances, talks) resolves and validates the source
//   records. upcomingAppearances(resolved, now) returns all current groups,
//   grouping speaking rows by talkId and standalone rows by agenda id.
//   Each returned occurrence has state 'upcoming', 'today', or 'in-progress'.

function talk(id, event, title, occurrences) {
  return { id, event: { en: event, es: event }, title: { en: title, es: title }, occurrences };
}

function initialData() {
  const talks = [
    talk('utn-workshop', 'AWS Student Community Day UTN Córdoba', 'Strands Agents en la práctica', [
      { id: 'main', status: 'scheduled' }
    ]),
    talk('reinvent-agents', 'AWS re:Invent', 'Ship Reliable AI Agents with Strands Evaluation and AgentCore Evaluations', [
      { id: 'com317-r', status: 'scheduled' },
      { id: 'com317-r1', status: 'scheduled' }
    ]),
    // The canonical record uses the event name; no individual talk title is invented.
    talk('opensearch-breakfast', 'OpenSearch Partner Breakfast', 'OpenSearch Partner Breakfast', [
      { id: 'main', status: 'scheduled' }
    ])
  ];
  const appearances = [
    {
      id: 'opensearch-breakfast', talkId: 'opensearch-breakfast', occurrenceId: 'main',
      role: { en: 'Partner speaker', es: 'Expositor partner' },
      when: {
        start: '2026-12-02T08:30:00-08:00',
        end: '2026-12-02T10:00:00-08:00',
        timeZone: 'America/Los_Angeles'
      },
      location: { en: 'The Palazzo · Las Vegas', es: 'The Palazzo · Las Vegas' },
      href: 'https://example.test/opensearch-breakfast'
    },
    {
      id: 'reinvent-dec-3', talkId: 'reinvent-agents', occurrenceId: 'com317-r',
      role: { en: 'Speaker', es: 'Expositor' },
      when: {
        start: '2026-12-03T12:00:00-08:00', end: '2026-12-03T13:00:00-08:00',
        timeZone: 'America/Los_Angeles'
      },
      location: { en: 'Caesars Forum · Las Vegas', es: 'Caesars Forum · Las Vegas' }
    },
    {
      id: 'utn-2026', talkId: 'utn-workshop', occurrenceId: 'main',
      role: { en: 'Workshop instructor', es: 'Instructor del workshop' },
      when: { date: '2026-11-14', timeZone: 'America/Argentina/Cordoba' },
      location: { en: 'UTN Facultad Regional Córdoba · Córdoba', es: 'UTN Facultad Regional Córdoba · Córdoba' },
      href: 'https://example.test/utn'
    },
    {
      id: 'reinvent-dec-1', talkId: 'reinvent-agents', occurrenceId: 'com317-r1',
      role: { en: 'Speaker', es: 'Expositor' },
      when: {
        start: '2026-12-01T13:00:00-08:00', end: '2026-12-01T14:00:00-08:00',
        timeZone: 'America/Los_Angeles'
      },
      location: { en: 'Wynn/Encore · Las Vegas', es: 'Wynn/Encore · Las Vegas' }
    }
  ];
  return { appearances, talks };
}

function visibleOccurrenceIds(group) {
  return group.occurrences.map((occurrence) => occurrence.occurrenceId ?? occurrence.id);
}

function assertOccurrenceState(group, occurrenceId, expected) {
  const occurrence = group.occurrences.find((item) => (item.occurrenceId ?? item.id) === occurrenceId);
  assert.ok(occurrence, `expected visible occurrence ${occurrenceId}`);
  assert.equal(occurrence.state, expected);
}

test('appearance data resolves and produces the approved upcoming agenda', async (t) => {
  assert.ok(existsSync(moduleUrl), 'implement src/content/appearances.mjs with the documented public interface');
  const api = await import(moduleUrl.href);
  assert.equal(typeof api.resolveAppearances, 'function', 'export resolveAppearances(appearances, talks)');
  assert.equal(typeof api.upcomingAppearances, 'function', 'export upcomingAppearances(resolved, now)');
  const { resolveAppearances, upcomingAppearances } = api;

  await t.test('initial agenda has three groups and four upcoming occurrences on November 11', () => {
    const { appearances, talks } = initialData();
    // The browser receives the actual resolver result through inert JSON.
    const resolved = JSON.parse(JSON.stringify(resolveAppearances(appearances, talks)));
    const groups = upcomingAppearances(resolved, new Date('2026-11-11T15:00:00.000Z'));

    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((group) => group.event.en), [
      'AWS Student Community Day UTN Córdoba',
      'AWS re:Invent',
      'OpenSearch Partner Breakfast'
    ]);
    assert.deepEqual(visibleOccurrenceIds(groups[0]), ['main']);
    assert.deepEqual(visibleOccurrenceIds(groups[1]), ['com317-r1', 'com317-r']);
    assert.deepEqual(visibleOccurrenceIds(groups[2]), ['main']);
    assert.equal(groups.reduce((sum, group) => sum + group.occurrences.length, 0), 4);
    assert.equal(groups[2].occurrences[0].href, 'https://example.test/opensearch-breakfast');
    assert.equal(groups[2].title.en, 'OpenSearch Partner Breakfast', 'the event name identifies a presentation without an announced individual title');
    assert.equal(groups[2].occurrences[0].location.en, 'The Palazzo · Las Vegas');
    assert.equal(groups[0].occurrences[0].location.es, 'UTN Facultad Regional Córdoba · Córdoba');
    assert.equal(groups[1].occurrences[0].location.en, 'Wynn/Encore · Las Vegas');
    assert.equal(groups[1].occurrences[1].location.en, 'Caesars Forum · Las Vegas');
    for (const group of groups) {
      for (const occurrence of group.occurrences) assert.equal(occurrence.state, 'upcoming');
    }
  });

  await t.test('date-only participation remains through November 14 and expires at its local midnight', () => {
    const { appearances, talks } = initialData();
    const resolved = resolveAppearances(appearances, talks);
    const beforeLocalMidnight = upcomingAppearances(resolved, new Date('2026-11-15T02:59:59.999Z'));
    const atLocalMidnight = upcomingAppearances(resolved, new Date('2026-11-15T03:00:00.000Z'));

    assert.ok(beforeLocalMidnight.some((group) => group.talkId === 'utn-workshop'));
    assertOccurrenceState(beforeLocalMidnight.find((group) => group.talkId === 'utn-workshop'), 'main', 'today');
    assert.equal(atLocalMidnight.some((group) => group.talkId === 'utn-workshop'), false);
    assert.equal(talks.find((item) => item.id === 'utn-workshop').occurrences[0].status, 'scheduled',
      'passing the visibility cutoff does not change editorial delivery status');
  });

  await t.test('during the December 2 breakfast, it precedes the remaining December 3 re:Invent session', () => {
    const { appearances, talks } = initialData();
    const resolved = resolveAppearances(appearances, talks);
    const groups = upcomingAppearances(resolved, new Date('2026-12-02T17:00:00.000Z'));

    assert.deepEqual(groups.map((group) => group.event.en), [
      'OpenSearch Partner Breakfast',
      'AWS re:Invent'
    ]);
    assert.deepEqual(visibleOccurrenceIds(groups[0]), ['main']);
    assert.deepEqual(visibleOccurrenceIds(groups[1]), ['com317-r']);
    assertOccurrenceState(groups[0], 'main', 'in-progress');
    assertOccurrenceState(groups[1], 'com317-r', 'upcoming');
  });

  await t.test('a confirmed interval includes its exact start and excludes its exact end', () => {
    const appearances = [{
      id: 'interval', event: { en: 'Interval', es: 'Intervalo' },
      role: { en: 'Attendee', es: 'Asistente' },
      when: {
        start: '2026-12-02T08:30:00-08:00', end: '2026-12-02T10:00:00-08:00',
        timeZone: 'America/Los_Angeles'
      }
    }];
    const resolved = resolveAppearances(appearances, []);

    assert.equal(upcomingAppearances(resolved, new Date('2026-12-02T16:29:59.999Z')).length, 1);
    const atStart = upcomingAppearances(resolved, new Date('2026-12-02T16:30:00.000Z'));
    assert.equal(atStart.length, 1);
    assertOccurrenceState(atStart[0], 'interval', 'in-progress');
    assert.equal(upcomingAppearances(resolved, new Date('2026-12-02T18:00:00.000Z')).length, 0);
  });

  await t.test('a known start with unknown end is today, not in progress, and expires next local midnight', () => {
    const appearances = [{
      id: 'unknown-end', event: { en: 'Breakfast', es: 'Desayuno' },
      role: { en: 'Attendee', es: 'Asistente' },
      when: { start: '2026-12-02T08:30:00-08:00', timeZone: 'America/Los_Angeles' }
    }];
    const resolved = resolveAppearances(appearances, []);
    const atNine = upcomingAppearances(resolved, new Date('2026-12-02T17:00:00.000Z'));
    assert.equal(atNine.length, 1);
    assertOccurrenceState(atNine[0], 'unknown-end', 'today');
    assert.equal(upcomingAppearances(resolved, new Date('2026-12-03T08:00:00.000Z')).length, 0);
  });

  await t.test('the agenda is empty after the last confirmed occurrence has ended', () => {
    const { appearances, talks } = initialData();
    const groups = upcomingAppearances(resolveAppearances(appearances, talks), new Date('2026-12-05T00:00:00.000Z'));

    assert.deepEqual(groups, []);
  });

  await t.test('same-title presentations from different talk records stay separate while repeated slots group', () => {
    const talks = [
      talk('first-event-talk', 'First event', 'Repeated title', [{ id: 'slot', status: 'scheduled' }]),
      talk('second-event-talk', 'Second event', 'Repeated title', [{ id: 'slot', status: 'scheduled' }])
    ];
    const appearances = [
      { id: 'first', talkId: 'first-event-talk', occurrenceId: 'slot', role: { en: 'Speaker', es: 'Expositor' }, when: { date: '2026-12-01', timeZone: 'UTC' } },
      { id: 'second', talkId: 'second-event-talk', occurrenceId: 'slot', role: { en: 'Speaker', es: 'Expositor' }, when: { date: '2026-12-02', timeZone: 'UTC' } }
    ];
    const groups = upcomingAppearances(resolveAppearances(appearances, talks), new Date('2026-11-30T00:00:00.000Z'));

    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.talkId), ['first-event-talk', 'second-event-talk']);
  });

  await t.test('delivered and unknown speaking records do not become upcoming even with future dates', () => {
    const talks = [
      talk('delivered', 'Past presentation', 'Delivered', [{ id: 'slot', status: 'delivered' }]),
      talk('unknown', 'Unverified presentation', 'Unknown', [{ id: 'slot', status: 'unknown' }]),
      talk('scheduled', 'Future presentation', 'Scheduled', [{ id: 'slot', status: 'scheduled' }])
    ];
    const appearances = talks.map((record) => ({
      id: `appearance-${record.id}`, talkId: record.id, occurrenceId: 'slot',
      role: { en: 'Speaker', es: 'Expositor' }, when: { date: '2026-12-01', timeZone: 'UTC' }
    }));
    const groups = upcomingAppearances(resolveAppearances(appearances, talks), new Date('2026-11-30T00:00:00.000Z'));

    assert.deepEqual(groups.map((group) => group.talkId), ['scheduled']);
  });

  await t.test('standalone attendee and organizer records work without talks or talk identities', () => {
    const appearances = [
      { id: 'attend', event: { en: 'Community meetup', es: 'Encuentro de comunidad' }, role: { en: 'Attendee', es: 'Asistente' }, when: { date: '2026-12-01', timeZone: 'UTC' } },
      { id: 'organize', event: { en: 'Local conference', es: 'Conferencia local' }, role: { en: 'Organizer', es: 'Organizador' }, when: { date: '2026-12-02', timeZone: 'UTC' } }
    ];
    const groups = upcomingAppearances(resolveAppearances(appearances, []), new Date('2026-11-30T00:00:00.000Z'));

    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.event.en), ['Community meetup', 'Local conference']);
    assert.equal(groups.every((group) => group.talkId === undefined), true);
    assert.equal(groups.every((group) => group.occurrences.length === 1), true);
  });

  await t.test('equal next times keep a deterministic order by standalone identity', () => {
    const appearances = [
      { id: 'zulu', event: { en: 'Zulu event', es: 'Evento Zulu' }, role: { en: 'Attendee', es: 'Asistente' }, when: { date: '2026-12-01', timeZone: 'UTC' } },
      { id: 'alpha', event: { en: 'Alpha event', es: 'Evento Alpha' }, role: { en: 'Organizer', es: 'Organizador' }, when: { date: '2026-12-01', timeZone: 'UTC' } }
    ];
    const groups = upcomingAppearances(resolveAppearances(appearances, []), new Date('2026-11-30T00:00:00.000Z'));

    assert.deepEqual(groups.map((group) => group.id), ['alpha', 'zulu']);
  });

  await t.test('resolved title always comes from the canonical talk record', () => {
    const { appearances, talks } = initialData();
    const appearance = appearances.find((item) => item.talkId === 'reinvent-agents');
    const firstResolution = resolveAppearances([appearance], talks);
    const firstGroup = upcomingAppearances(firstResolution, new Date('2026-11-11T15:00:00.000Z'))[0];
    assert.equal(firstGroup.title.en, 'Ship Reliable AI Agents with Strands Evaluation and AgentCore Evaluations');

    talks.find((item) => item.id === 'reinvent-agents').title.en = 'Canonical title edit';
    const afterEdit = resolveAppearances([appearance], talks);
    const editedGroup = upcomingAppearances(afterEdit, new Date('2026-11-11T15:00:00.000Z'))[0];

    assert.equal(editedGroup.title.en, 'Canonical title edit');
  });

  await t.test('invalid references and duplicate agenda identities fail instead of creating partial output', () => {
    const { appearances, talks } = initialData();
    assert.throws(() => resolveAppearances([{ ...appearances[0], id: 'duplicate-ref', talkId: 'missing', occurrenceId: 'none' }], talks));
    assert.throws(() => resolveAppearances([{ ...appearances[2], talkId: 'reinvent-agents', occurrenceId: 'missing' }], talks));
    assert.throws(() => resolveAppearances([appearances[0], { ...appearances[0] }], talks));
    assert.throws(() => resolveAppearances([
      { ...appearances[2], id: 'duplicate-occurrence' },
      { ...appearances[2], id: 'duplicate-occurrence-2' }
    ], talks));
  });

  await t.test('invalid dates, zones, offsets, and interval bounds fail validation', () => {
    const base = { id: 'bad-date', event: { en: 'Event', es: 'Evento' }, role: { en: 'Attendee', es: 'Asistente' } };
    const invalid = [
      { ...base, when: { date: '2026-02-30', timeZone: 'UTC' } },
      { ...base, when: { date: '2026-12-02', timeZone: 'Mars/Olympus' } },
      { ...base, when: { start: '2026-12-02T08:30:00-07:00', end: '2026-12-02T10:00:00-08:00', timeZone: 'America/Los_Angeles' } },
      { ...base, when: { start: '2026-12-02T08:30:00', timeZone: 'America/Los_Angeles' } },
      { ...base, when: { start: '2026-12-02T10:00:00-08:00', end: '2026-12-02T10:00:00-08:00', timeZone: 'America/Los_Angeles' } },
      { ...base, when: { start: '2026-12-02T10:00:00-08:00', end: '2026-12-02T09:00:00-08:00', timeZone: 'America/Los_Angeles' } },
      { ...base, when: { date: '2026-12-02', start: '2026-12-02T08:30:00-08:00', timeZone: 'America/Los_Angeles' } }
    ];
    for (const record of invalid) assert.throws(() => resolveAppearances([record], []));
  });

  await t.test('standalone and speaking roles require non-empty bilingual values', () => {
    const { appearances, talks } = initialData();
    const badStandalone = {
      id: 'bad-copy', event: { en: 'Event', es: 'Evento' }, role: { en: 'Attendee' },
      when: { date: '2026-12-01', timeZone: 'UTC' }
    };
    const badSpeaker = { ...appearances[2], role: { en: 'Workshop instructor', es: ' ' } };

    assert.throws(() => resolveAppearances([badStandalone], []));
    assert.throws(() => resolveAppearances([badSpeaker], talks));
  });
});
