// Browser smoke test: opens the real index.html in Chromium from disk (no server) and plays it.
// Covers what jsdom cannot: layout at phone width, real taps and keys, animation timing, reloads.
// Run with `npm run smoke`. Needs `npx playwright install chromium` once.
import { pathToFileURL } from 'node:url';

import { chromium, devices } from 'playwright';

import { indexPath, loadCore } from './load.mjs';

const core = loadCore();
const url = pathToFileURL(indexPath).href;
const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    results.push(`FAIL ${name}\n     ${String(error && error.message ? error.message : error).split('\n').join('\n     ')}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(browser, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const problems = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('request', (request) => { if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) problems.push(`network: ${request.url()}`); });
  await page.goto(url);
  await page.waitForSelector('#keyboard .key');
  return { context, page, problems };
}
const today = (page) => page.evaluate(() => RWCore.dayKey(new Date()));
const lettersOf = (page, row) => page.$$eval(`#board .row:nth-child(${row + 1}) .tile`, (tiles) => tiles.map((t) => t.querySelector('.glyph').textContent).join(''));
async function waitForRow(page, row) {
  await page.waitForFunction((r) => {
    const tiles = [...document.querySelectorAll(`#board .row:nth-child(${r + 1}) .tile`)];
    return tiles.every((t) => t.classList.contains('revealed'));
  }, row);
  // Input is ignored until the flip has finished: the next row goes live, or the result card opens.
  await page.waitForFunction(() => !!document.querySelector('.row.current') || !document.getElementById('result').hidden);
}
async function typeWord(page, word, row) {
  await page.keyboard.type(word.toLowerCase(), { delay: 15 });
  await page.keyboard.press('Enter');
  await waitForRow(page, row);
}
async function tapWord(page, word, row) {
  for (const letter of word) await page.tap(`.key[data-letter="${letter}"]`);
  await page.tap('#key-enter');
  await waitForRow(page, row);
}
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);

const browser = await chromium.launch();
try {
  await check('desktop: keyboard win, result card, reload stays locked, no errors', async () => {
    const { context, page, problems } = await openPage(browser, { viewport: { width: 1280, height: 800 } });
    const day = await today(page);
    const target = core.dailyWordFor(day);
    const wrong = [...core.WORDS].filter((w) => w !== target);
    await typeWord(page, wrong[0], 0);
    expect((await lettersOf(page, 0)) === wrong[0], 'first guess not on the board');
    await typeWord(page, target, 1);
    await page.waitForSelector('#result:not([hidden])');
    expect((await page.textContent('#result-detail')).startsWith('Solved in 2'), 'result card does not say solved in 2');
    expect(await page.isHidden('#keyboard'), 'keyboard should step aside for the result card');
    await page.reload();
    await page.waitForSelector('#result:not([hidden])');
    expect((await page.textContent('#result-kicker')) === 'Already played today', 'daily not locked after reload');
    expect((await lettersOf(page, 1)) === target, 'saved guesses not shown after reload');
    expect(problems.length === 0, problems.join('; '));
    await context.close();
  });

  await check('phone 390x844: taps, mid-game reload keeps guesses, no sideways scroll, keys big enough', async () => {
    const { context, page, problems } = await openPage(browser, { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    const day = await today(page);
    const target = core.dailyWordFor(day);
    const wrong = [...core.WORDS].filter((w) => w !== target);
    expect(await noSidewaysScroll(page), 'page scrolls sideways at 390px');
    const sizes = await page.$$eval('.key', (keys) => keys.map((k) => { const b = k.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }));
    const small = sizes.filter(([w, h]) => w < 24 || h < 24);
    expect(small.length === 0, `keys under 24px: ${JSON.stringify(small)}`);
    const lastKey = await page.$eval('.kb-row:last-child .key:last-child', (k) => k.getBoundingClientRect().bottom);
    expect(lastKey <= 844, `keyboard runs off the bottom of the screen (${Math.round(lastKey)}px)`);
    await tapWord(page, wrong[0], 0);
    await tapWord(page, wrong[1], 1);
    await page.reload();
    await page.waitForSelector('#keyboard .key');
    expect((await lettersOf(page, 0)) === wrong[0] && (await lettersOf(page, 1)) === wrong[1], 'guesses lost on reload');
    expect((await lettersOf(page, 2)) === '', 'third row should be empty');
    for (let i = 2; i < 6; i++) await tapWord(page, wrong[i], i);
    await page.waitForSelector('#result:not([hidden])');
    expect((await page.textContent('#result-title')) === 'Not this time', 'six wrong guesses should lose');
    expect((await page.textContent('#chips')) === target, 'the answer is not shown after a loss');
    expect(await noSidewaysScroll(page), 'result card makes the page scroll sideways');
    const share = await page.$eval('#share-btn', (b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
    expect(share, 'share button is not on screen after the game');
    expect(problems.length === 0, problems.join('; '));
    await context.close();
  });

  await check('narrow phone 320x568: fits without sideways scroll', async () => {
    const { context, page, problems } = await openPage(browser, { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
    expect(await noSidewaysScroll(page), 'page scrolls sideways at 320px');
    await page.tap('#info-btn');
    await page.waitForSelector('#info:not([hidden])');
    expect(await noSidewaysScroll(page), 'how-to dialog scrolls sideways at 320px');
    await page.tap('#info-close');
    expect(problems.length === 0, problems.join('; '));
    await context.close();
  });

  await check('broken saves: the game still starts and plays', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('rw-stats', '{"played":');
      localStorage.setItem('rw-prefs', 'null');
      localStorage.setItem('rw-daily-progress', '[1,2');
    });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(url);
    await page.waitForSelector('#keyboard .key');
    expect((await page.textContent('#st-played')) === '0', 'broken record should read as empty');
    const day = await today(page);
    const wrong = [...core.WORDS].filter((w) => w !== core.dailyWordFor(day));
    await typeWord(page, wrong[0], 0);
    expect((await lettersOf(page, 0)) === wrong[0], 'could not play after a broken save');
    expect(problems.length === 0, problems.join('; '));
    await context.close();
  });

  await check('keyboard only: Tab reaches the controls, Enter works them, focus is visible', async () => {
    const { context, page, problems } = await openPage(browser, { viewport: { width: 1024, height: 800 } });
    await page.focus('#btn-practice');
    await page.keyboard.press('Enter');
    expect((await page.getAttribute('#btn-practice', 'aria-selected')) === 'true', 'Enter on the Practice button did not switch mode');
    await page.focus('#info-btn');
    const outline = await page.$eval('#info-btn', (b) => getComputedStyle(b).outlineStyle);
    expect(outline !== 'none' || (await page.$eval('#info-btn', (b) => b.matches(':focus'))), 'focused control has no outline');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#info:not([hidden])');
    expect((await page.evaluate(() => document.activeElement.id)) === 'info-close', 'dialog did not take focus');
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => document.activeElement.id)) === 'info-btn', 'focus did not return to the info button');
    expect(problems.length === 0, problems.join('; '));
    await context.close();
  });
} finally {
  await browser.close();
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed} of ${results.length} smoke checks passed`);
process.exit(failed ? 1 : 0);
