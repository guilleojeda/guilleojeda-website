import { formatOccurrenceDate, formatOccurrenceTime, upcomingAppearances } from '../content/appearances.mjs';

const section = document.getElementById('where-to-find-me');
if (section && section.dataset.appearancesInitialized !== 'true') {
  section.dataset.appearancesInitialized = 'true';

  const fallback = document.getElementById('appearances-fallback');
  const results = document.getElementById('appearances-results');
  const list = document.getElementById('appearances-list');
  const more = document.getElementById('appearances-more');
  const moreSummary = document.getElementById('appearances-more-summary');
  const moreList = document.getElementById('appearances-more-list');
  const empty = document.getElementById('appearances-empty');
  const dataNode = document.getElementById('appearances-data');

  const clearTimer = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };

  let timer;
  let lastRenderKey;
  try {
    if (!(fallback instanceof HTMLElement)
      || !(results instanceof HTMLElement)
      || !(list instanceof HTMLOListElement)
      || !(more instanceof HTMLDetailsElement)
      || !(moreSummary instanceof HTMLElement)
      || !(moreList instanceof HTMLOListElement)
      || !(empty instanceof HTMLElement)
      || !(dataNode instanceof HTMLScriptElement)) {
      throw new Error('The agenda markup is incomplete.');
    }

    const payload = JSON.parse(dataNode.textContent || '');
    if (!payload || !Array.isArray(payload.entries) || !['en', 'es'].includes(payload.locale) || !payload.copy) {
      throw new Error('The agenda data is invalid.');
    }

    const { entries, locale, copy } = payload;
    const localized = (value) => typeof value === 'string' ? value : value?.[locale] ?? '';
    const copyText = (key) => localized(copy[key]);
    const localizedEntry = (value) => typeof value === 'string' ? value : value?.[locale] ?? '';

    const appendText = (parent, tagName, className, value) => {
      if (!value) return null;
      const element = document.createElement(tagName);
      if (className) element.className = className;
      element.textContent = value;
      parent.append(element);
      return element;
    };

    const appendOccurrence = (parent, occurrence) => {
      const item = document.createElement('li');
      item.className = 'appearance-occurrence';

      const dateColumn = document.createElement('div');
      dateColumn.className = 'appearance-occurrence-date';
      appendText(dateColumn, 'span', 'appearance-date-label', copyText('date'));
      const date = document.createElement('time');
      date.dateTime = occurrence.date;
      date.textContent = formatOccurrenceDate(occurrence, locale);
      dateColumn.append(date);
      if (occurrence.state === 'today' || occurrence.state === 'in-progress') {
        const stateLabel = occurrence.state === 'today'
          ? 'today'
          : occurrence.when?.scope === 'event'
            ? 'eventInProgress'
            : 'inProgress';
        appendText(dateColumn, 'span', 'appearance-state', copyText(stateLabel));
      }
      item.append(dateColumn);

      const details = document.createElement('div');
      details.className = 'appearance-occurrence-details';
      const time = occurrence.when?.date ? copyText('timeTbc') : formatOccurrenceTime(occurrence, locale);
      appendText(details, 'p', 'appearance-time', time);
      appendText(details, 'p', 'appearance-time-note', localizedEntry(occurrence.timeNote));
      appendText(details, 'p', 'appearance-location', localizedEntry(occurrence.location));
      appendText(details, 'p', 'appearance-access', localizedEntry(occurrence.accessNote));
      item.append(details);
      parent.append(item);
    };

    const createCard = (group) => {
      if (!Array.isArray(group.occurrences) || group.occurrences.length === 0) {
        throw new Error('An agenda group has no occurrences.');
      }

      const item = document.createElement('li');
      const groupType = group.talkId ? 'talk' : 'appearance';
      item.dataset.appearanceGroupType = groupType;
      item.dataset.appearanceGroupId = String(group.talkId ?? group.id);
      const card = document.createElement('article');
      card.className = 'appearance-card';

      const main = document.createElement('div');
      main.className = 'appearance-main';
      const firstOccurrence = group.occurrences[0];
      const event = localizedEntry(group.event);
      if (!event) throw new Error('An agenda group has no event name.');
      const role = localizedEntry(firstOccurrence.role);
      const title = localizedEntry(group.title) || event;
      const roleLine = document.createElement('div');
      roleLine.className = 'appearance-role';
      roleLine.textContent = [role, title === event ? '' : event].filter(Boolean).join(' · ');
      if (roleLine.textContent) main.append(roleLine);

      const titleNote = localizedEntry(firstOccurrence.titleNote);
      appendText(main, 'p', 'appearance-title-note', titleNote);
      appendText(main, 'h3', '', title);

      const occurrenceList = document.createElement('ul');
      occurrenceList.className = 'appearance-occurrences';
      for (const occurrence of group.occurrences) appendOccurrence(occurrenceList, occurrence);
      card.append(main, occurrenceList);

      const href = group.occurrences.find((occurrence) => typeof occurrence.href === 'string' && occurrence.href)?.href;
      if (href) {
        const link = document.createElement('a');
        link.className = 'appearance-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = `${copyText('eventLink')} ↗`;
        link.setAttribute('aria-label', `${copyText('eventLink')}: ${event}`);
        card.append(link);
      }

      item.append(card);
      return item;
    };

    const nextDeadline = (groups, now) => {
      const nowMs = now.getTime();
      const deadlines = [];
      for (const group of groups) {
        for (const occurrence of group.occurrences) {
          if (!Number.isFinite(occurrence.startAt) || !Number.isFinite(occurrence.endAt)) {
            throw new Error('An agenda occurrence has invalid normalized deadlines.');
          }
          if (occurrence.startAt > nowMs) deadlines.push(occurrence.startAt);
          if (occurrence.endAt > nowMs) deadlines.push(occurrence.endAt);
        }
      }
      return deadlines.length ? Math.min(...deadlines) : undefined;
    };

    const scheduleNextUpdate = (groups, now) => {
      clearTimer();
      const deadline = nextDeadline(groups, now);
      if (deadline === undefined) return;
      const delay = Math.min(Math.max(1, deadline - now.getTime()), 2_147_483_647);
      timer = window.setTimeout(render, delay);
    };

    function render() {
      try {
        const now = new Date();
        const groups = upcomingAppearances(entries, now);
        if (!Array.isArray(groups)) throw new Error('The agenda resolver returned invalid data.');

        const renderKey = JSON.stringify(groups.map((group) => [
          group.id,
          group.occurrences.map((occurrence) => [occurrence.id, occurrence.state])
        ]));
        if (renderKey === lastRenderKey) {
          scheduleNextUpdate(groups, now);
          return;
        }

        const activeElement = document.activeElement;
        const focusedLink = activeElement instanceof HTMLAnchorElement
          && activeElement.classList.contains('appearance-link')
          ? activeElement
          : undefined;
        const focusedItem = focusedLink?.closest('li[data-appearance-group-id]');
        let focusedAgendaLink;
        if (focusedLink && focusedItem && (list.contains(focusedItem) || moreList.contains(focusedItem))) {
          const { top, bottom } = focusedLink.getBoundingClientRect();
          focusedAgendaLink = {
            groupType: focusedItem.dataset.appearanceGroupType,
            groupId: focusedItem.dataset.appearanceGroupId,
            href: focusedLink.href,
            label: focusedLink.getAttribute('aria-label'),
            wasVisible: bottom > 0 && top < window.innerHeight
          };
        }

        const visibleGroups = groups.slice(0, 5).map(createCard);
        const remainingGroups = groups.slice(5).map(createCard);
        list.replaceChildren(...visibleGroups);
        moreList.replaceChildren(...remainingGroups);
        if (remainingGroups.length > 0) {
          const label = copyText(remainingGroups.length === 1 ? 'moreOne' : 'moreMany');
          moreSummary.textContent = `${remainingGroups.length} ${label}`;
          more.hidden = false;
        } else {
          moreSummary.textContent = '';
          more.open = false;
          more.hidden = true;
        }

        empty.hidden = groups.length !== 0;
        list.hidden = groups.length === 0;
        results.hidden = false;
        fallback.hidden = true;
        lastRenderKey = renderKey;

        if (focusedAgendaLink) {
          const replacementItems = [...list.children, ...moreList.children];
          const replacementItem = replacementItems.find(
            (item) => item.dataset.appearanceGroupType === focusedAgendaLink.groupType
              && item.dataset.appearanceGroupId === focusedAgendaLink.groupId
          );
          const replacementLink = replacementItem?.querySelector('a.appearance-link');
          if (replacementLink
            && replacementLink.href === focusedAgendaLink.href
            && replacementLink.getAttribute('aria-label') === focusedAgendaLink.label) {
            if (moreList.contains(replacementLink)) more.open = true;
            replacementLink.focus({ preventScroll: !focusedAgendaLink.wasVisible });
          }
        }

        scheduleNextUpdate(groups, now);
      } catch {
        clearTimer();
        lastRenderKey = undefined;
        results.hidden = true;
        fallback.hidden = false;
      }
    }

    window.addEventListener('focus', render);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render();
    });
    render();
  } catch {
    clearTimer();
  }
}
