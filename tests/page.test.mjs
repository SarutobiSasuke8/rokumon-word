// Runs the real page in jsdom: the same HTML, styles and scripts a player loads, driven through
// the on-screen keys and the keyboard. jsdom has no layout engine, so sizes, scrolling and
// animation are covered by the browser smoke test instead (npm run smoke).
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { JSDOM } from 'jsdom';

import { html, loadCore } from './load.mjs';

const core = loadCore();

// Close every window a test opened, even when the test failed first: an open window keeps its
// timers running and would stop the test process from exiting.
const opened = [];
afterEach(() => { while (opened.length) opened.pop().close(); });

/**
 * Open the page at a fixed local date and time. `storage` seeds localStorage; pass
 * `{ blocked: true }` to make every storage call throw, as in a sandboxed frame.
 */
function open({ at = new Date(2026, 10, 13, 12, 0, 0), storage = {}, blocked = false, hub = null, parent = null } = {}) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://games.example/games/rokumon-word/index.html',
    beforeParse(window) {
      const RealDate = window.Date;
      let now = at.getTime();
      class FixedDate extends RealDate {
        constructor(...args) { if (args.length) super(...args); else super(now); }
        static now() { return now; }
      }
      window.Date = FixedDate;
      window.__setNow = (date) => { now = date.getTime(); };
      window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }); // reduced motion: reveals are instant
      window.addEventListener('error', (event) => errors.push(event.error || event.message));
      if (hub) window.Hub = hub;
      if (parent) Object.defineProperty(window, 'parent', { value: parent, configurable: true });
      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
      if (blocked) {
        const refuse = () => { throw new window.DOMException('blocked', 'SecurityError'); };
        Object.defineProperty(window, 'localStorage', { get: refuse });
      }
    },
  });
  const { window } = dom;
  const { document } = window;
  opened.push(window);
  window.focus = () => {}; // jsdom does not implement it and logs a notice on every call
  const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
  const page = {
    window, document, errors, wait,
    key(letter) { [...document.querySelectorAll('.key')].find((k) => k.dataset.letter === letter).click(); },
    async type(word) {
      for (const letter of word) page.key(letter);
      document.getElementById('key-enter').click();
      await wait();
    },
    press(key, target = document.body) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    },
    row(r) { return [0, 1, 2, 3, 4].map((c) => document.getElementById(`t${r}${c}`)); },
    letters(r) { return page.row(r).map((t) => t.querySelector('.glyph').textContent).join(''); },
    statuses(r) { return page.row(r).map((t) => ['correct', 'present', 'absent'].find((s) => t.classList.contains(s)) || ''); },
    resultShown() { return !document.getElementById('result').hidden; },
    stat(id) { return document.getElementById(id).textContent; },
    stats() { return JSON.parse(window.localStorage.getItem('rw-stats')); },
    close() { window.close(); },
  };
  return page;
}

const DAY = '2026-11-13';
const TARGET = core.dailyWordFor(DAY);
const wrong = [...core.WORDS].filter((w) => w !== TARGET);

test('loads clean and plays a daily win through the on-screen keys', async () => {
  const calls = [];
  const hub = { ready: () => calls.push(['ready']), score: (n) => calls.push(['score', n]), event: (...a) => calls.push(['event', ...a]), gameOver: (...a) => calls.push(['gameOver', ...a]) };
  const page = open({ hub });
  assert.deepEqual(page.errors, []);
  await page.type(wrong[0]);
  assert.equal(page.letters(0), wrong[0]);
  assert.deepEqual(page.statuses(0), [...core.evaluate(wrong[0], TARGET)]);
  assert.equal(page.resultShown(), false);
  await page.type(TARGET);
  assert.deepEqual(page.statuses(1), Array(5).fill('correct'));
  assert.equal(page.resultShown(), true);
  assert.equal(page.document.getElementById('result-detail').textContent, 'Solved in 2 guesses');
  assert.deepEqual(page.stats().dailyResult.rows, [wrong[0], TARGET]);
  assert.equal(page.stats().lastDaily, DAY);
  assert.equal(page.stat('st-played'), '1');
  assert.equal(page.stat('st-streak'), '1');
  const sent = JSON.parse(JSON.stringify(calls.filter((c) => c[0] !== 'ready')));
  assert.deepEqual(sent.slice(0, 2), [['score', 5], ['event', 'puzzle-completed', { guesses: 2, daily: true, streak: 1 }]]);
  assert.equal(sent[2][0], 'gameOver');
  assert.equal(sent[2][1], 5);
  assert.ok(Number.isFinite(sent[2][2]) && sent[2][2] >= 0, 'gameOver carries a duration');
  assert.equal(sent.length, 3);
  assert.match(page.document.getElementById('sr-log').textContent, /Solved in 2/);
  assert.equal(page.row(1)[0].getAttribute('aria-label'), `${TARGET[0]}, right place`);
  assert.deepEqual(page.errors, []);
  page.close();
});

test('framed without window.Hub, it posts the hub bridge v1 messages to its own origin', async () => {
  const messages = [];
  const page = open({ parent: { postMessage: (payload, origin) => messages.push([JSON.parse(JSON.stringify(payload)), origin]) } });
  await page.type(TARGET);
  const origin = 'https://games.example';
  assert.ok(messages.every(([, to]) => to === origin), 'every message is addressed to the game\'s own origin');
  const types = messages.map(([m]) => m.type);
  assert.equal(types[0], 'hub:ready');
  assert.deepEqual(types.filter((t) => t !== 'hub:ready'), ['hub:score', 'hub:event', 'hub:gameover']);
  const byType = Object.fromEntries(messages.map(([m]) => [m.type, m]));
  assert.deepEqual(byType['hub:ready'], { type: 'hub:ready', version: 1 });
  assert.deepEqual(byType['hub:score'], { type: 'hub:score', score: 6 });
  assert.deepEqual(byType['hub:event'], { type: 'hub:event', version: 1, name: 'puzzle-completed', data: { guesses: 1, daily: true, streak: 1 } });
  assert.equal(byType['hub:gameover'].score, 6);
  assert.ok(byType['hub:gameover'].durationMs >= 0);
  page.close();
});

test('opened on its own, it posts nothing', async () => {
  const page = open();
  let posted = 0;
  page.window.postMessage = () => { posted += 1; };
  await page.type(TARGET);
  assert.equal(posted, 0);
  page.close();
});

test('rejects short and unknown words without spending a guess', async () => {
  const page = open();
  page.key('C'); page.key('R');
  page.document.getElementById('key-enter').click();
  assert.equal(page.document.getElementById('toast').textContent, 'Not enough letters');
  for (const letter of 'ANE') page.key(letter);
  page.key('Z'); // a sixth letter is ignored
  assert.equal(page.letters(0), 'CRANE');
  page.press('Backspace'); page.press('Backspace'); page.press('q'); page.press('z');
  assert.equal(page.letters(0), 'CRAQZ');
  page.press('Enter');
  assert.equal(page.document.getElementById('toast').textContent, 'Not in word list');
  assert.equal(page.statuses(0).join(''), '');
  assert.equal(page.window.localStorage.getItem('rw-daily-progress'), null);
  page.close();
});

test('six wrong guesses lose, show the word and reset the streak', async () => {
  const yesterday = core.recordResult(core.emptyStats(), { mode: 'daily', won: true, guesses: 1, day: '2026-11-12', grid: [Array(5).fill('correct')], rows: ['CRANE'] });
  const page = open({ storage: { 'rw-stats': JSON.stringify(yesterday) } });
  assert.equal(page.stat('st-streak'), '1');
  for (let i = 0; i < 6; i++) await page.type(wrong[i]);
  assert.equal(page.resultShown(), true);
  assert.equal(page.document.getElementById('result-title').textContent, 'Not this time');
  assert.equal(page.document.getElementById('chips').textContent, TARGET);
  assert.equal(page.stats().streak, 0);
  assert.equal(page.stats().maxStreak, 1);
  assert.equal(page.stats().played, 2);
  assert.equal(page.window.localStorage.getItem('rw-daily-progress'), null);
  page.close();
});

test('a reload mid-game puts the spent guesses back', async () => {
  const first = open();
  await first.type(wrong[0]);
  await first.type(wrong[1]);
  const saved = first.window.localStorage.getItem('rw-daily-progress');
  assert.deepEqual(JSON.parse(saved), { day: DAY, rows: [wrong[0], wrong[1]] });
  first.close();

  const second = open({ storage: { 'rw-daily-progress': saved } });
  assert.equal(second.letters(0), wrong[0]);
  assert.equal(second.letters(1), wrong[1]);
  assert.deepEqual(second.statuses(1), [...core.evaluate(wrong[1], TARGET)]);
  assert.equal(second.letters(2), '');
  // Four guesses are left, not six.
  for (let i = 2; i < 6; i++) await second.type(wrong[i]);
  assert.equal(second.resultShown(), true);
  assert.equal(second.stats().dailyResult.guesses, 6);
  second.close();
});

test('a finished daily stays locked on reload and shows the saved guesses', async () => {
  const first = open();
  await first.type(TARGET);
  const stats = first.window.localStorage.getItem('rw-stats');
  first.close();

  const second = open({ storage: { 'rw-stats': stats }, at: new Date(2026, 10, 13, 23, 30, 0) });
  assert.equal(second.resultShown(), true);
  assert.equal(second.document.getElementById('result-kicker').textContent, 'Already played today');
  assert.equal(second.letters(0), TARGET);
  second.key('A');
  assert.equal(second.letters(1), '');
  assert.equal(second.stats().played, 1);
  second.close();
});

test('the next local day deals a new word and keeps the streak alive', async () => {
  const first = open();
  await first.type(TARGET);
  const stats = first.window.localStorage.getItem('rw-stats');
  first.close();

  // 00:30 the next morning, local time. The lock is keyed by the same local day as the word.
  const next = open({ storage: { 'rw-stats': stats }, at: new Date(2026, 10, 14, 0, 30, 0) });
  assert.equal(next.resultShown(), false);
  assert.equal(next.stat('st-streak'), '1');
  await next.type(core.dailyWordFor('2026-11-14'));
  assert.equal(next.stats().streak, 2);
  assert.equal(next.stats().lastDaily, '2026-11-14');
  next.close();

  const lapsed = open({ storage: { 'rw-stats': stats }, at: new Date(2026, 10, 20, 9, 0, 0) });
  assert.equal(lapsed.stat('st-streak'), '0');
  await lapsed.type(core.dailyWordFor('2026-11-20'));
  assert.equal(lapsed.stats().streak, 1);
  lapsed.close();
});

test('a tab left open past midnight moves on only when no game is under way', async () => {
  const idle = open({ at: new Date(2026, 10, 13, 23, 59, 0) });
  idle.window.__setNow(new Date(2026, 10, 14, 0, 1, 0));
  idle.document.dispatchEvent(new idle.window.Event('visibilitychange'));
  await idle.type(core.dailyWordFor('2026-11-14'));
  assert.equal(idle.stats().lastDaily, '2026-11-14');
  idle.close();

  const busy = open({ at: new Date(2026, 10, 13, 23, 59, 0) });
  await busy.type(wrong[0]);
  busy.window.__setNow(new Date(2026, 10, 14, 0, 1, 0));
  busy.document.dispatchEvent(new busy.window.Event('visibilitychange'));
  assert.equal(busy.letters(0), wrong[0]);
  await busy.type(TARGET); // still the 13th's word, recorded against the 13th
  assert.equal(busy.stats().lastDaily, DAY);
  busy.close();
});

test('broken saves never stop the game from starting', async () => {
  const bad = ['not json', '{', 'null', '[]', '42', '{"played":"x"}', '{"played":1,"wins":0,"streak":0,"maxStreak":0,"lastDaily":"2026-11-13","dailyResult":{"won":true,"guesses":1,"grid":"<img src=x onerror=alert(1)>"}}'];
  for (const value of bad) {
    const page = open({ storage: { 'rw-stats': value, 'rw-prefs': value, 'rw-daily-progress': value } });
    assert.deepEqual(page.errors, [], value);
    await page.type(wrong[0]);
    assert.equal(page.letters(0), wrong[0], value);
    assert.equal(page.document.querySelector('img'), null);
    page.close();
  }
});

test('plays with storage blocked, keeping the record for the visit', async () => {
  const page = open({ blocked: true });
  assert.deepEqual(page.errors, []);
  await page.type(TARGET);
  assert.equal(page.resultShown(), true);
  assert.equal(page.stat('st-played'), '1');
  page.document.getElementById('btn-practice').click();
  page.document.getElementById('btn-daily').click();
  assert.equal(page.document.getElementById('result-kicker').textContent, 'Already played today');
  assert.deepEqual(page.errors, []);
  page.close();
});

test('practice deals fresh words and leaves the daily record alone', async () => {
  const page = open();
  page.document.getElementById('btn-practice').click();
  for (let i = 0; i < 6 && !page.resultShown(); i++) await page.type(wrong[i]);
  assert.equal(page.resultShown(), true);
  assert.equal(page.stats().played, 1);
  assert.equal(page.stats().lastDaily, '');
  assert.equal(page.window.localStorage.getItem('rw-daily-progress'), null);
  page.document.getElementById('again-btn').click();
  assert.equal(page.resultShown(), false);
  assert.equal(page.letters(0), '');
  page.close();
});

test('Enter on a focused control works that control instead of submitting a guess', () => {
  const page = open();
  for (const letter of wrong[0]) page.key(letter);
  const practice = page.document.getElementById('btn-practice');
  const event = new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  practice.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false); // the browser goes on to click the button
  assert.equal(page.statuses(0).join(''), '');
  // On an on-screen letter key, Enter still submits rather than typing that letter again.
  const key = page.document.querySelector('.key[data-letter="A"]');
  const onKey = new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  key.dispatchEvent(onKey);
  assert.equal(onKey.defaultPrevented, true);
  page.close();
});

test('the how-to dialog takes focus, holds it and gives it back', () => {
  const page = open();
  const { document } = page;
  document.getElementById('info-btn').click();
  assert.equal(document.getElementById('info').hidden, false);
  assert.equal(document.activeElement.id, 'info-close');
  page.press('a');
  assert.equal(page.letters(0), ''); // typing is ignored while the dialog is open
  const toggle = document.getElementById('sound-toggle');
  toggle.focus();
  page.press('Tab', toggle);
  assert.equal(document.activeElement.id, 'info-close');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
  assert.equal(JSON.parse(page.window.localStorage.getItem('rw-prefs')).sound, false);
  page.press('Escape');
  assert.equal(document.getElementById('info').hidden, true);
  assert.equal(document.activeElement.id, 'info-btn');
  page.close();
});
