import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { formatOccurrenceDate, formatOccurrenceTime, resolveAppearances, upcomingAppearances } from '../src/content/appearances.mjs';

const clientSource = readFileSync(new URL('../src/scripts/appearances.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '');
const initialTime = Date.parse('2026-12-01T00:00:00.000Z');
const fixtureCopy = {
  date: 'Date', today: 'Today', inProgress: 'In progress', eventInProgress: 'Event in progress',
  timeTbc: 'Time to be confirmed', eventLink: 'Event link', moreOne: 'more event', moreMany: 'more events'
};

// Removing the focused subtree moves focus to BODY as in the browser. This fixture does not model native Tab order or <details> rendering; CUA covers those.
class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = undefined;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.hidden = false;
    this.open = false;
    this._textContent = '';
    this._href = '';
    this.classList = { contains: (name) => this.className.split(/\s+/).includes(name) };
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value);
  }

  get href() { return this._href; }
  set href(value) { this._href = new URL(value, 'https://site.example/').href; }

  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.removeChild(node);
      this.children.push(node);
      node.parentElement = this;
    }
  }

  removeChild(node) {
    if (node.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.children = this.children.filter((child) => child !== node);
    node.parentElement = undefined;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...nodes);
  }

  contains(node) {
    return node === this || this.children.some((child) => child.contains(node));
  }

  closest(selector) {
    if (selector === 'li[data-appearance-group-id]') {
      for (let current = this; current; current = current.parentElement) {
        if (current.tagName === 'LI' && current.dataset.appearanceGroupId !== undefined) return current;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = selector === 'a.appearance-link'
      ? (element) => element.tagName === 'A' && element.classList.contains('appearance-link')
      : selector === 'a'
        ? (element) => element.tagName === 'A'
        : () => false;
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  focus(options) {
    this.ownerDocument.activeElement = this;
    this.ownerDocument.lastFocusOptions = options;
  }
}

class FakeHTMLElement extends FakeElement {}
class FakeAnchorElement extends FakeHTMLElement {}
class FakeOrderedListElement extends FakeHTMLElement {}
class FakeDetailsElement extends FakeHTMLElement {}
class FakeScriptElement extends FakeHTMLElement {}

function appearance(id, startAt, endAt, { href, role = 'Attendee', event = `Event ${id}` } = {}) {
  return {
    id,
    event: { en: event, es: event },
    role: { en: role, es: role },
    when: {
      start: new Date(startAt).toISOString(),
      end: new Date(endAt).toISOString(),
      timeZone: 'UTC'
    },
    ...(href ? { href } : {})
  };
}

function sixUpcoming({ firstEnd = 30_000, secondStart = -5_000 } = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    const start = number === 2 ? secondStart : -5_000;
    const end = number === 1 ? firstEnd : 60_000;
    return appearance(
      `fixture-${number}`,
      initialTime + start,
      initialTime + end,
      { href: `https://example.test/event-${number}` }
    );
  });
}

function createClient({ appearances, talks = [] }) {
  const document = {
    visibilityState: 'visible',
    listeners: new Map(),
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(tagName) {
      const tag = tagName.toLowerCase();
      const ElementClass = tag === 'a' ? FakeAnchorElement
        : tag === 'ol' ? FakeOrderedListElement
          : tag === 'details' ? FakeDetailsElement
            : tag === 'script' ? FakeScriptElement
              : FakeHTMLElement;
      return new ElementClass(tag, this);
    }
  };
  document.body = new FakeHTMLElement('body', document);
  document.activeElement = document.body;

  const element = (tag, id) => {
    const result = document.createElement(tag);
    elements.set(id, result);
    return result;
  };
  const elements = new Map();
  const section = element('section', 'where-to-find-me');
  section.dataset.appearancesInitialized = 'false';
  element('div', 'appearances-fallback');
  element('div', 'appearances-results');
  element('ol', 'appearances-list');
  element('details', 'appearances-more');
  element('summary', 'appearances-more-summary');
  element('ol', 'appearances-more-list');
  element('div', 'appearances-empty');
  const dataNode = element('script', 'appearances-data');
  elements.get('appearances-more').append(elements.get('appearances-more-summary'), elements.get('appearances-more-list'));
  elements.get('appearances-results').append(elements.get('appearances-list'), elements.get('appearances-more'));
  section.append(elements.get('appearances-fallback'), elements.get('appearances-results'), elements.get('appearances-empty'), dataNode);
  document.body.append(section);
  const resolved = JSON.parse(JSON.stringify(resolveAppearances(appearances, talks)));
  dataNode.textContent = JSON.stringify({ locale: 'en', entries: resolved, copy: fixtureCopy });

  let now = initialTime;
  let nextTimerId = 0;
  const timers = new Map();
  const window = {
    listeners: new Map(),
    addEventListener(name, listener) { this.listeners.set(name, listener); },
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    fireNextTimer() {
      const next = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0];
      assert.ok(next, 'expected the client to have scheduled an agenda deadline');
      const [id, timer] = next;
      timers.delete(id);
      now += timer.delay;
      timer.callback();
    }
  };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }

  vm.runInNewContext(clientSource, {
    document,
    window,
    Date: FixtureDate,
    HTMLElement: FakeHTMLElement,
    HTMLAnchorElement: FakeAnchorElement,
    HTMLOListElement: FakeOrderedListElement,
    HTMLDetailsElement: FakeDetailsElement,
    HTMLScriptElement: FakeScriptElement,
    formatOccurrenceDate,
    formatOccurrenceTime,
    upcomingAppearances,
    URL
  }, { filename: 'src/scripts/appearances.js' });

  return { document, elements, window };
}

function linkFor(root, href) {
  const link = root.querySelectorAll('a.appearance-link').find((candidate) => candidate.href === href);
  assert.ok(link, `expected an agenda link to ${href}`);
  return link;
}

test('the real agenda client preserves only the still-valid focused link across updates', async (t) => {
  await t.test('another group expires while a five-row link stays focused', () => {
    const client = createClient({ appearances: sixUpcoming() });
    const { document, elements, window } = client;
    const list = elements.get('appearances-list');
    const link = linkFor(list, 'https://example.test/event-2');
    link.focus();

    window.fireNextTimer();

    assert.equal(list.contains(document.activeElement), true, 'focus stays on a connected agenda link');
    assert.equal(document.activeElement.href, link.href);
    assert.equal(document.activeElement.closest('li[data-appearance-group-id]').dataset.appearanceGroupId, 'fixture-2');
    assert.equal(elements.get('appearances-more').hidden, true, 'the six-to-five transition promotes the former sixth group');
    if (document.activeElement !== link) assert.equal(document.lastFocusOptions?.preventScroll, true);
  });

  await t.test('the focused sixth group keeps focus when promoted out of the details list', () => {
    const client = createClient({ appearances: sixUpcoming() });
    const { document, elements, window } = client;
    const more = elements.get('appearances-more');
    more.open = true;
    const link = linkFor(elements.get('appearances-more-list'), 'https://example.test/event-6');
    link.focus();

    window.fireNextTimer();

    assert.equal(document.activeElement.href, link.href);
    assert.equal(document.activeElement.closest('li[data-appearance-group-id]').dataset.appearanceGroupId, 'fixture-6');
    assert.equal(elements.get('appearances-list').contains(document.activeElement), true);
    assert.equal(more.hidden, true);
  });

  await t.test('a focused group remains focused when its own state changes to in-progress', () => {
    const client = createClient({ appearances: sixUpcoming({ firstEnd: 60_000, secondStart: 15_000 }) });
    const { document, elements, window } = client;
    const more = elements.get('appearances-more');
    more.open = true;
    const link = linkFor(elements.get('appearances-more-list'), 'https://example.test/event-2');
    link.focus();

    window.fireNextTimer();

    const currentLink = document.activeElement;
    assert.equal(elements.get('appearances-results').contains(currentLink), true);
    assert.equal(currentLink.href, link.href);
    assert.match(currentLink.closest('li[data-appearance-group-id]').textContent, /event in progress/i);
  });

  await t.test('focus outside the agenda is not moved by an update', () => {
    const client = createClient({ appearances: sixUpcoming() });
    const { document, elements, window } = client;
    const outsideButton = document.createElement('button');
    document.body.append(outsideButton);
    outsideButton.focus();

    window.fireNextTimer();

    assert.strictEqual(document.activeElement, outsideButton);
  });

  await t.test('an expired focused link is not replaced with an unrelated link', () => {
    const client = createClient({ appearances: sixUpcoming() });
    const { document, elements, window } = client;
    const expiredLink = linkFor(elements.get('appearances-list'), 'https://example.test/event-1');
    expiredLink.focus();

    window.fireNextTimer();

    assert.strictEqual(document.activeElement, document.body);
    assert.notEqual(document.activeElement.href, 'https://example.test/event-2');
  });

  await t.test('standalone and speaking groups with the same id keep distinct focus identity', () => {
    const id = 'shared-id';
    const href = 'https://example.test/shared-event';
    const event = 'Shared event';
    const talks = [{
      id,
      event: { en: event, es: event },
      title: { en: event, es: event },
      occurrences: [{ id: 'slot', status: 'scheduled' }]
    }];
    const appearances = [
      appearance('speaker-slot', initialTime - 10_000, initialTime + 60_000, { href, event, role: 'Speaker' }),
      {
        ...appearance(id, initialTime + 10_000, initialTime + 60_000, { href, event }),
        event: { en: event, es: event }
      }
    ];
    appearances[0].talkId = id;
    appearances[0].occurrenceId = 'slot';
    const client = createClient({ appearances, talks });
    const { document, elements, window } = client;
    const link = linkFor(elements.get('appearances-list'), href);
    assert.equal(link.closest('li[data-appearance-group-id]').dataset.appearanceGroupType, 'talk');

    const standaloneLink = elements.get('appearances-list').querySelectorAll('a.appearance-link')[1];
    assert.ok(standaloneLink, 'expected the same id to produce a separate standalone group');
    standaloneLink.focus();

    window.fireNextTimer();

    assert.equal(document.activeElement.href, href);
    assert.equal(document.activeElement.closest('li[data-appearance-group-id]').dataset.appearanceGroupType, 'appearance');
  });
});
