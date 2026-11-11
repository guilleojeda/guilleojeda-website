// @ts-check

/** @typedef {import('./types').AppearanceRecord} AppearanceRecord */
/** @typedef {import('./types').ResolvedAppearance} ResolvedAppearance */
/** @typedef {import('./types').UpcomingAppearanceGroup} UpcomingAppearanceGroup */
/** @typedef {import('./types').Locale} Locale */
/** @typedef {{ year: number, month: number, day: number, hour: number, minute: number, second: number }} ZonedParts */

const localeOptions = {
  en: 'en-US',
  es: 'es-AR'
};

const supportedStatuses = new Set(['delivered', 'scheduled', 'unknown']);
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const instantPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} field */
function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Appearance is missing ${field}.`);
  }
  return value;
}

/** @param {unknown} value @param {string} field */
function localizedText(value, field) {
  if (!isRecord(value)) {
    throw new Error(`Appearance ${field} must have English and Spanish text.`);
  }
  return {
    en: requiredText(value.en, `${field}.en`),
    es: requiredText(value.es, `${field}.es`)
  };
}

/** @param {AppearanceRecord} record @param {'location' | 'titleNote' | 'timeNote' | 'accessNote'} key @param {string} [field] */
function optionalLocalizedText(record, key, field = key) {
  if (!Object.hasOwn(record, key)) return undefined;
  return localizedText(record[key], field);
}

/** @param {unknown} date @param {string} field */
function assertValidDate(date, field) {
  const match = typeof date === 'string' ? datePattern.exec(date) : null;
  if (!match) throw new Error(`Appearance ${field} must use YYYY-MM-DD.`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const check = new Date(0);
  check.setUTCHours(0, 0, 0, 0);
  check.setUTCFullYear(year, month - 1, day);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Appearance ${field} is not a calendar date.`);
  }
  return { year, month, day };
}

/** @param {string} timeZone */
function formatterForZone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
  } catch {
    throw new Error(`Appearance has invalid IANA time zone: ${timeZone}.`);
  }
}

/** @param {number} epochMs @param {Intl.DateTimeFormat} formatter */
function zonedParts(epochMs, formatter) {
  const values = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map(({ type, value }) => [type, value]));
  const parts = {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
  if (Object.values(parts).some((part) => !Number.isInteger(part))) {
    throw new Error('Appearance calendar value is outside the supported date range.');
  }
  return parts;
}

/** @param {ZonedParts} parts */
function partsAsUtc(parts) {
  const value = new Date(0);
  value.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  value.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return value.getTime();
}

/** @param {number} epochMs @param {Intl.DateTimeFormat} formatter */
function offsetAt(epochMs, formatter) {
  const wholeSecond = Math.floor(epochMs / 1000) * 1000;
  return partsAsUtc(zonedParts(wholeSecond, formatter)) - wholeSecond;
}

/** @param {Pick<ZonedParts, 'year' | 'month' | 'day'>} parts */
function localDateString(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** @param {string} date @param {Intl.DateTimeFormat} formatter */
function localDayBoundary(date, formatter) {
  const target = assertValidDate(date, 'date');
  const localMidnightAsUtc = partsAsUtc({ ...target, hour: 0, minute: 0, second: 0 });
  /** @param {number} epochMs */
  const localDateAt = (epochMs) => localDateString(zonedParts(epochMs, formatter));
  let low = localMidnightAsUtc - 36 * 60 * 60 * 1000;
  let high = localMidnightAsUtc + 36 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 4 && localDateAt(low) >= date; attempt += 1) low -= 24 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 4 && localDateAt(high) < date; attempt += 1) high += 24 * 60 * 60 * 1000;
  // Midnight clock changes can make the first valid local time later than 00:00.
  while (high - low > 1000) {
    const midpoint = low + Math.max(1, Math.floor((high - low) / 2000)) * 1000;
    if (localDateAt(midpoint) < date) low = midpoint;
    else high = midpoint;
  }
  if (localDateAt(high) !== date) throw new Error(`Appearance date ${date} does not exist in its time zone.`);
  return high;
}

/** @param {string} date */
function nextDate(date) {
  const parts = assertValidDate(date, 'date');
  const next = new Date(0);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCFullYear(parts.year, parts.month - 1, parts.day + 1);
  return localDateString({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  });
}

/** @param {string} value @param {string} timeZone @param {Intl.DateTimeFormat} formatter @param {string} field */
function parseZonedInstant(value, timeZone, formatter, field) {
  const match = typeof value === 'string' ? instantPattern.exec(value) : null;
  if (!match) throw new Error(`Appearance ${field} must be an RFC 3339 timestamp with an offset.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', sourceOffset] = match;
  const date = `${yearText}-${monthText}-${dayText}`;
  const parts = assertValidDate(date, field);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Appearance ${field} has an invalid time.`);

  let sourceOffsetMs = 0;
  if (sourceOffset !== 'Z') {
    if (sourceOffset === '-00:00') throw new Error(`Appearance ${field} must use a known UTC offset.`);
    const sign = sourceOffset[0] === '+' ? 1 : -1;
    const offsetHours = Number(sourceOffset.slice(1, 3));
    const offsetMinutes = Number(sourceOffset.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error(`Appearance ${field} has an invalid UTC offset.`);
    sourceOffsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60_000;
  }

  const fractionMs = Number(`0.${fraction || '0'}`) * 1000;
  const localMs = partsAsUtc({ ...parts, hour, minute, second }) + Math.round(fractionMs);
  const epochMs = localMs - sourceOffsetMs;
  if (!Number.isFinite(epochMs) || new Date(epochMs).toString() === 'Invalid Date') {
    throw new Error(`Appearance ${field} is outside the supported date range.`);
  }
  if (offsetAt(epochMs, formatter) !== sourceOffsetMs) {
    throw new Error(`Appearance ${field} offset does not match ${timeZone}.`);
  }
  return epochMs;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {'event' | 'appearance'} defaultScope
 * @returns {{ when: import('./types').AppearanceWhen, startAt: number, endAt: number, date: string, timeZone: string }}
 */
function normalizeWhen(value, field, defaultScope) {
  if (!isRecord(value)) {
    throw new Error(`Appearance ${field} must be a date or interval.`);
  }
  const timeZone = requiredText(value.timeZone, `${field}.timeZone`);
  const hasScope = Object.hasOwn(value, 'scope');
  const scope = hasScope ? value.scope : defaultScope;
  if (scope !== 'event' && scope !== 'appearance') {
    throw new Error(`Appearance ${field}.scope must be event or appearance.`);
  }
  const formatter = formatterForZone(timeZone);
  const hasDate = Object.hasOwn(value, 'date');
  const hasStart = Object.hasOwn(value, 'start');
  const hasEnd = Object.hasOwn(value, 'end');
  if (hasDate === hasStart || (hasDate && hasEnd)) {
    throw new Error(`Appearance ${field} must have either a date or a timed interval.`);
  }

  if (hasDate) {
    const date = requiredText(value.date, `${field}.date`);
    assertValidDate(date, `${field}.date`);
    const followingDate = nextDate(date);
    const startAt = localDayBoundary(date, formatter);
    const endAt = localDayBoundary(followingDate, formatter);
    return {
      when: { date, timeZone, scope },
      startAt,
      endAt,
      date,
      timeZone
    };
  }

  const start = requiredText(value.start, `${field}.start`);
  const startAt = parseZonedInstant(start, timeZone, formatter, `${field}.start`);
  const date = localDateString(zonedParts(startAt, formatter));
  const end = hasEnd ? requiredText(value.end, `${field}.end`) : undefined;
  const endAt = end
    ? parseZonedInstant(end, timeZone, formatter, `${field}.end`)
    : localDayBoundary(nextDate(date), formatter);
  if (endAt <= startAt) throw new Error(`Appearance ${field} end must follow its start.`);
  return {
    when: { start, ...(end ? { end } : {}), timeZone, scope },
    startAt,
    endAt,
    date,
    timeZone
  };
}

/**
 * Resolve editorial agenda rows against the canonical talk inventory.
 * @param {AppearanceRecord[]} rows
 * @param {Array<import('./types').TalkRecord>} talks
 * @returns {ResolvedAppearance[]}
 */
export function resolveAppearances(rows, talks) {
  if (!Array.isArray(rows) || !Array.isArray(talks)) throw new Error('Appearances and talks must be arrays.');

  /** @type {Map<string, import('./types').TalkRecord>} */
  const talkById = new Map();
  for (const talk of talks) {
    const id = requiredText(talk?.id, 'talk id');
    if (talkById.has(id)) throw new Error(`Duplicate talk identity: ${id}.`);
    talkById.set(id, talk);
  }

  const appearanceIds = new Set();
  const occurrenceRefs = new Set();
  return rows.map((row) => {
    const id = requiredText(row?.id, 'id');
    if (appearanceIds.has(id)) throw new Error(`Duplicate appearance identity: ${id}.`);
    appearanceIds.add(id);

    const hasTalkId = row.talkId !== undefined;
    const hasOccurrenceId = row.occurrenceId !== undefined;
    if (hasTalkId !== hasOccurrenceId) throw new Error(`Appearance ${id} must reference both talkId and occurrenceId.`);

    let event;
    let title;
    /** @type {import('./types').TalkOccurrenceStatus} */
    let status = 'scheduled';
    /** @type {string | undefined} */
    let talkId;
    /** @type {string | undefined} */
    let occurrenceId;
    if (hasTalkId) {
      talkId = requiredText(row.talkId, `${id}.talkId`);
      occurrenceId = requiredText(row.occurrenceId, `${id}.occurrenceId`);
      const reference = `${talkId}\u0000${occurrenceId}`;
      if (occurrenceRefs.has(reference)) throw new Error(`Duplicate agenda reference: ${talkId}/${occurrenceId}.`);
      occurrenceRefs.add(reference);

      const talk = talkById.get(talkId);
      if (!talk) throw new Error(`Appearance ${id} references unknown talk ${talkId}.`);
      const matchingOccurrences = talk.occurrences.filter((item) => item.id === occurrenceId);
      if (matchingOccurrences.length !== 1) throw new Error(`Appearance ${id} references missing or duplicate occurrence ${talkId}/${occurrenceId}.`);
      const occurrence = matchingOccurrences[0];
      if (!supportedStatuses.has(occurrence.status)) throw new Error(`Appearance ${id} references an invalid editorial status.`);
      event = localizedText(talk.event, `${id}.event`);
      title = localizedText(talk.title, `${id}.title`);
      status = occurrence.status;
    } else {
      event = localizedText(row.event, `${id}.event`);
      title = event;
    }

    const role = localizedText(row.role, `${id}.role`);
    const location = optionalLocalizedText(row, 'location', `${id}.location`);
    const titleNote = optionalLocalizedText(row, 'titleNote', `${id}.titleNote`);
    const timeNote = optionalLocalizedText(row, 'timeNote', `${id}.timeNote`);
    const accessNote = optionalLocalizedText(row, 'accessNote', `${id}.accessNote`);
    let href;
    if (Object.hasOwn(row, 'href')) {
      href = requiredText(row.href, `${id}.href`);
      let parsedUrl;
      try {
        parsedUrl = new URL(href);
      } catch {
        throw new Error(`Appearance ${id} has an invalid public URL.`);
      }
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
        throw new Error(`Appearance ${id} public URL must use HTTPS without credentials.`);
      }
    }

    const calendar = normalizeWhen(row.when, `${id}.when`, hasTalkId ? 'appearance' : 'event');
    return {
      id,
      ...(talkId ? { talkId, occurrenceId } : {}),
      event,
      title,
      role,
      status,
      when: calendar.when,
      ...(location ? { location } : {}),
      ...(href ? { href } : {}),
      ...(titleNote ? { titleNote } : {}),
      ...(timeNote ? { timeNote } : {}),
      ...(accessNote ? { accessNote } : {}),
      startAt: calendar.startAt,
      endAt: calendar.endAt,
      date: calendar.date,
      timeZone: calendar.timeZone
    };
  });
}

/**
 * Return current scheduled groups without changing the resolved source rows.
 * @param {ResolvedAppearance[]} resolved
 * @param {Date} nowDate
 * @returns {UpcomingAppearanceGroup[]}
 */
export function upcomingAppearances(resolved, nowDate) {
  if (!Array.isArray(resolved)) throw new Error('Resolved appearances must be an array.');
  const now = nowDate instanceof Date ? nowDate.getTime() : Number.NaN;
  if (!Number.isFinite(now)) throw new Error('Agenda clock must be a valid Date.');

  /** @type {Map<string, UpcomingAppearanceGroup>} */
  const groups = new Map();
  for (const appearance of resolved) {
    if (appearance.status !== 'scheduled' || now >= appearance.endAt) continue;
    /** @type {import('./types').UpcomingAppearanceState} */
    const state = now < appearance.startAt
      ? 'upcoming'
      : Object.hasOwn(appearance.when, 'end')
        ? 'in-progress'
        : 'today';
    /** @type {import('./types').UpcomingAppearanceOccurrence} */
    const occurrence = { ...appearance, state };
    const groupId = appearance.talkId ?? appearance.id;
    const groupKey = appearance.talkId ? `talk:${appearance.talkId}` : `appearance:${appearance.id}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        id: groupId,
        ...(appearance.talkId ? { talkId: appearance.talkId } : {}),
        event: appearance.event,
        title: appearance.title,
        occurrences: [],
        nextAt: appearance.startAt
      };
      groups.set(groupKey, group);
    }
    group.occurrences.push(occurrence);
    group.nextAt = Math.min(group.nextAt, appearance.startAt);
  }

  const output = [...groups.entries()];
  for (const [, group] of output) {
    group.occurrences.sort((left, right) => left.startAt - right.startAt || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }
  output.sort(([leftKey, left], [rightKey, right]) => left.nextAt - right.nextAt || (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
  return output.map(([, group]) => group);
}

/** @param {number} epochMs @param {string} timeZone @param {Locale} locale */
function formatDateAt(epochMs, timeZone, locale) {
  const localeCode = localeOptions[locale];
  const parts = new Intl.DateTimeFormat(localeCode, {
    day: 'numeric',
    month: 'short',
    timeZone
  }).formatToParts(new Date(epochMs));
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = new Intl.DateTimeFormat(localeCode, { year: 'numeric', timeZone })
    .format(new Date(epochMs));
  if (!day || !month) throw new Error('Appearance date could not be formatted.');
  return locale === 'es' ? `${day} ${month} ${year}` : `${month} ${day}, ${year}`;
}

/** @param {ResolvedAppearance} appearance @param {Locale} locale */
export function formatOccurrenceDate(appearance, locale) {
  return formatDateAt(appearance.startAt, appearance.timeZone, locale);
}

/** @param {ResolvedAppearance} appearance @param {Locale} locale */
export function formatOccurrenceTime(appearance, locale) {
  if (Object.hasOwn(appearance.when, 'date')) return locale === 'es' ? 'Horario por confirmar' : 'Time to be confirmed';

  const localeCode = localeOptions[locale];
  /** @type {Intl.DateTimeFormatOptions} */
  const timeOptions = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: appearance.timeZone,
    ...(locale === 'es' ? { hourCycle: 'h23' } : {})
  };
  const start = new Date(appearance.startAt);
  const startText = new Intl.DateTimeFormat(localeCode, timeOptions).format(start);
  const formatter = formatterForZone(appearance.timeZone);
  const startOffset = offsetAt(appearance.startAt, formatter);
  const startOffsetText = formatUtcOffset(startOffset);
  if (!Object.hasOwn(appearance.when, 'end')) return `${startText} (${startOffsetText})`;

  const endAt = appearance.endAt;
  const endText = new Intl.DateTimeFormat(localeCode, timeOptions).format(new Date(endAt));
  const endDate = localDateString(zonedParts(endAt, formatter));
  const range = endDate === appearance.date
    ? `${startText}–${endText}`
    : `${formatDateAt(appearance.startAt, appearance.timeZone, locale)}, ${startText}–${formatDateAt(endAt, appearance.timeZone, locale)}, ${endText}`;
  const endOffsetText = formatUtcOffset(offsetAt(endAt, formatter));
  const offsets = startOffsetText === endOffsetText
    ? startOffsetText
    : locale === 'es'
      ? `${startOffsetText} a ${endOffsetText}`
      : `${startOffsetText} to ${endOffsetText}`;
  return `${range} (${offsets})`;
}

/** @param {number} offset */
function formatUtcOffset(offset) {
  const sign = offset < 0 ? '−' : '+';
  const absoluteOffsetMinutes = Math.abs(offset) / 60_000;
  const offsetHours = String(Math.floor(absoluteOffsetMinutes / 60)).padStart(2, '0');
  const offsetMinutes = String(absoluteOffsetMinutes % 60).padStart(2, '0');
  return `UTC${sign}${offsetHours}:${offsetMinutes}`;
}
