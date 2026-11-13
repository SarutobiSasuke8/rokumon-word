import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';

import { html, inlineScripts, loadCore } from './load.mjs';

const core = loadCore();
// Values made inside the vm context have their own Array and Object, so compare by content.
const plain = (value) => JSON.parse(JSON.stringify(value));
const grid = (...rows) => rows.map((row) => [...row].map((ch) => ({ c: 'correct', p: 'present', a: 'absent' })[ch]));

test('every inline script parses', () => {
  for (const source of inlineScripts()) assert.doesNotThrow(() => new vm.Script(source));
});

test('the page asks nothing of another origin', () => {
  const urls = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/g)].map((m) => m[0]);
  assert.deepEqual(urls, []);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|@import/);
});

test('word list: five capital letters each', () => {
  assert.ok(core.WORDS.length >= 500);
  for (const word of core.WORDS) assert.match(word, /^[A-Z]{5}$/);
});

test('evaluate: exact matches, misplaced letters and repeats', () => {
  assert.deepEqual(plain(core.evaluate('CRANE', 'CRANE')), grid('ccccc')[0]);
  assert.deepEqual(plain(core.evaluate('TRACE', 'CRANE')), grid('accpc')[0]);
  // One L in the answer: only one of the guess's two Ls may light up, and the exact one wins.
  assert.deepEqual(plain(core.evaluate('LLAMA', 'ALIGN')), grid('acpaa')[0]);
  // Two Ls in the answer, neither in place: both of the guess's Ls are misplaced.
  assert.deepEqual(plain(core.evaluate('ALLOW', 'SMALL')), grid('pppaa')[0]);
  // Two Es in the answer: the exact E and one misplaced E light up, the third does not.
  assert.deepEqual(plain(core.evaluate('EERIE', 'THREE')), grid('pacac')[0]);
});

test('evaluate: never marks more copies of a letter than the answer holds', () => {
  const words = core.WORDS;
  for (let i = 0; i < words.length; i += 3) {
    for (let j = 0; j < words.length; j += 37) {
      const guess = words[i];
      const target = words[j];
      const result = core.evaluate(guess, target);
      const lit = {};
      const have = {};
      for (const ch of target) have[ch] = (have[ch] || 0) + 1;
      result.forEach((status, k) => {
        if (status !== 'absent') lit[guess[k]] = (lit[guess[k]] || 0) + 1;
        if (status === 'correct') assert.equal(guess[k], target[k]);
        if (guess[k] === target[k]) assert.equal(status, 'correct');
      });
      for (const ch of Object.keys(lit)) assert.ok(lit[ch] <= (have[ch] || 0), `${guess} vs ${target}`);
    }
  }
});

test('day keys follow the local calendar and step back across months and years', () => {
  assert.equal(core.dayKey(new Date(2026, 10, 13, 23, 59, 59)), '2026-11-13');
  assert.equal(core.dayKey(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  assert.equal(core.previousDayKey('2026-11-13'), '2026-11-12');
  assert.equal(core.previousDayKey('2026-03-01'), '2026-02-28');
  assert.equal(core.previousDayKey('2028-03-01'), '2028-02-29');
  assert.equal(core.previousDayKey('2027-01-01'), '2026-12-31');
  assert.equal(core.isDayKey('2026-02-30'), false);
  assert.equal(core.isDayKey('2026-11-13T00:00'), false);
  assert.equal(core.isDayKey(20261113), false);
});

test('daily word: same for a given day, always from the list, numbered from 1 Jan 2026', () => {
  assert.equal(core.dailyWordFor('2026-11-13'), core.dailyWordFor('2026-11-13'));
  const seen = new Set();
  for (let d = 0; d < 400; d++) {
    const date = new Date(2026, 0, 1 + d);
    const word = core.dailyWordFor(core.dayKey(date));
    assert.ok(core.isValidGuess(word));
    seen.add(word);
  }
  assert.ok(seen.size > 200, `only ${seen.size} different words in 400 days`);
  assert.equal(core.puzzleNoFor('2026-01-01'), 1);
  assert.equal(core.puzzleNoFor('2026-11-13'), 317);
});

test('randomWord stays in range at both ends of the random source', () => {
  assert.equal(core.randomWord(() => 0), core.WORDS[0]);
  assert.equal(core.randomWord(() => 0.999999999), core.WORDS[core.WORDS.length - 1]);
  assert.equal(core.randomWord(() => 1), core.WORDS[core.WORDS.length - 1]);
});

const win = (day, guesses = 3) => ({
  mode: 'daily', won: true, guesses, day,
  grid: [...Array(guesses - 1).fill('aaaaa'), 'ccccc'].map((row) => grid(row)[0]),
  rows: Array(guesses).fill('CRANE'),
});
const loss = (day) => ({ mode: 'daily', won: false, guesses: 6, day, grid: grid('aaaaa', 'aaaaa', 'aaaaa', 'aaaaa', 'aaaaa', 'aaaaa'), rows: Array(6).fill('CRANE') });

test('streak: grows on consecutive days, restarts after a gap, drops on a loss', () => {
  let s = core.emptyStats();
  s = core.recordResult(s, win('2026-11-10'));
  s = core.recordResult(s, win('2026-11-11'));
  s = core.recordResult(s, win('2026-11-12'));
  assert.equal(s.streak, 3);
  assert.equal(s.maxStreak, 3);
  // Two days missed: the next win starts again at 1, the best streak is kept.
  s = core.recordResult(s, win('2026-11-15'));
  assert.equal(s.streak, 1);
  assert.equal(s.maxStreak, 3);
  s = core.recordResult(s, loss('2026-11-16'));
  assert.equal(s.streak, 0);
  s = core.recordResult(s, win('2026-11-17'));
  assert.equal(s.streak, 1);
  assert.equal(s.played, 6);
  assert.equal(s.wins, 5);
});

test('streak shown lapses once a day has been missed', () => {
  const s = core.recordResult(core.recordResult(core.emptyStats(), win('2026-11-10')), win('2026-11-11'));
  assert.equal(core.currentStreak(s, '2026-11-11'), 2);
  assert.equal(core.currentStreak(s, '2026-11-12'), 2); // still alive: today's word is not played yet
  assert.equal(core.currentStreak(s, '2026-11-13'), 0);
  assert.equal(core.currentStreak(core.emptyStats(), '2026-11-13'), 0);
});

test('a day cannot be recorded twice, and practice never touches the streak', () => {
  const once = core.recordResult(core.emptyStats(), win('2026-11-13'));
  const twice = core.recordResult(once, win('2026-11-13'));
  assert.deepEqual(plain(twice), plain(once));
  const practice = core.recordResult(once, { mode: 'practice', won: true, guesses: 2, grid: grid('aaaaa', 'ccccc'), rows: ['SLATE', 'CRANE'] });
  assert.equal(practice.played, 2);
  assert.equal(practice.wins, 2);
  assert.equal(practice.streak, 1);
  assert.equal(practice.lastDaily, '2026-11-13');
  assert.deepEqual(plain(practice.dailyResult), plain(once.dailyResult));
});

test('recordResult does not change the record it was given', () => {
  const before = core.recordResult(core.emptyStats(), win('2026-11-12'));
  const copy = plain(before);
  core.recordResult(before, win('2026-11-13'));
  assert.deepEqual(plain(before), copy);
});

test('saved record: a good one round-trips', () => {
  const s = core.recordResult(core.emptyStats(), win('2026-11-13', 4));
  assert.deepEqual(plain(core.sanitizeStats(JSON.stringify(s))), plain(s));
  // Records written before rows were saved are still accepted.
  const old = plain(s);
  delete old.dailyResult.rows;
  assert.deepEqual(plain(core.sanitizeStats(JSON.stringify(old))), old);
});

test('saved record: anything broken or impossible becomes a fresh record without throwing', () => {
  const good = plain(core.recordResult(core.emptyStats(), win('2026-11-13', 4)));
  const empty = plain(core.emptyStats());
  const broken = [
    null, undefined, '', 'not json', '{', 'null', '[]', '42', '"text"', 'true',
    JSON.stringify({ ...good, played: -1 }),
    JSON.stringify({ ...good, played: 1.5 }),
    JSON.stringify({ ...good, played: '1' }),
    JSON.stringify({ ...good, wins: 99 }),
    JSON.stringify({ ...good, streak: 5 }),
    JSON.stringify({ ...good, streak: 1e21 }),
    JSON.stringify({ ...good, maxStreak: 500, streak: 400 }),
    JSON.stringify({ played: 3 }),
  ];
  for (const raw of broken) assert.deepEqual(plain(core.sanitizeStats(raw)), empty, String(raw));
});

test('saved record: a bad daily result is dropped, the counts are kept', () => {
  const good = plain(core.recordResult(core.emptyStats(), win('2026-11-13', 2)));
  const variants = [
    { ...good.dailyResult, grid: 'ccccc' },
    { ...good.dailyResult, grid: [['correct']] },
    { ...good.dailyResult, grid: [['x', 'x', 'x', 'x', 'x'], good.dailyResult.grid[1]] },
    { ...good.dailyResult, guesses: 9 },
    { ...good.dailyResult, guesses: 1 },
    { ...good.dailyResult, won: false },
    { ...good.dailyResult, grid: [good.dailyResult.grid[0], good.dailyResult.grid[0]] },
    { ...good.dailyResult, grid: [['correct" onclick="x', 'absent', 'absent', 'absent', 'absent'], good.dailyResult.grid[1]] },
    'won',
  ];
  for (const dailyResult of variants) {
    const s = core.sanitizeStats(JSON.stringify({ ...good, dailyResult }));
    assert.equal(s.dailyResult, null, JSON.stringify(dailyResult));
    assert.equal(s.played, good.played);
  }
  const noDay = core.sanitizeStats(JSON.stringify({ ...good, lastDaily: 'yesterday' }));
  assert.equal(noDay.lastDaily, '');
  assert.equal(noDay.dailyResult, null);
  const badRows = core.sanitizeStats(JSON.stringify({ ...good, dailyResult: { ...good.dailyResult, rows: ['<img>', 'CRANE'] } }));
  assert.equal(badRows.dailyResult.rows, undefined);
});

test('progress: kept for today only, real words only, never a finished game', () => {
  const day = '2026-11-13';
  const target = core.dailyWordFor(day);
  const others = [...core.WORDS].filter((w) => w !== target).slice(0, 6);
  const save = (rows, d = day) => JSON.stringify({ day: d, rows });
  assert.deepEqual(plain(core.sanitizeProgress(save(others.slice(0, 3)), day)), others.slice(0, 3));
  assert.deepEqual(plain(core.sanitizeProgress(save(others.slice(0, 5)), day)), others.slice(0, 5));
  assert.deepEqual(plain(core.sanitizeProgress(save(others.slice(0, 3), '2026-11-12'), day)), []);
  assert.deepEqual(plain(core.sanitizeProgress(save(others), day)), []); // six rows is a finished game
  assert.deepEqual(plain(core.sanitizeProgress(save([others[0], target]), day)), []);
  assert.deepEqual(plain(core.sanitizeProgress(save(['ZZZZZ']), day)), []);
  assert.deepEqual(plain(core.sanitizeProgress(save('CRANE'), day)), []);
  for (const raw of [null, undefined, '', '{', 'null', '[]', '7']) assert.deepEqual(plain(core.sanitizeProgress(raw, day)), []);
});

test('share text carries the label and one line per guess', () => {
  const text = core.shareText('2026-11-13', grid('apaaa', 'ccccc'));
  assert.equal(text.split('\n').length, 3);
  assert.equal(text.split('\n')[0], 'Rokumon Word 2026-11-13');
  assert.equal([...text.split('\n')[2]].length, 5);
});
