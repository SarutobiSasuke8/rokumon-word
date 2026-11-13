# Rokumon Word

A daily five-letter word puzzle for the Rokumon catalogue. One shared word each day, plus unlimited practice. The whole game is `index.html` — no build step, no server.

## How to play

1. Open `index.html` in a browser, or let the hub load it in an iframe.
2. You have six guesses at a five-letter word.
3. Every guess has to be in the in-game word list. Submit with Enter, or tap the on-screen Enter key.
4. After a guess, each tile flips. Gold has a bar along the bottom, violet a pale frame, and ink a hatch, so the three states still read if the colours are hard to tell apart:
   - **Gold** — right letter, right place
   - **Violet** — the letter is in the word, wrong place
   - **Ink** — the letter is not in the word
5. A short guess shakes the row (“Not enough letters”). A word that is not in the list shakes too.
6. **Daily** locks after a win or a loss until the next local midnight. **Practice** deals another word immediately. The info button explains both modes and shows your record.

The on-screen keyboard and a physical keyboard both work. The layout fits a phone width without sideways scrolling. The display and interface faces are embedded in the file, so the type stays the same when third-party font hosts are blocked.

## Share

When a puzzle is finished, **Share result** is the main action in the summary card (the keyboard steps aside so the card is on screen).

The copied text is the date and one line of squares per guess:

```
Rokumon Word 2026-11-10
🟩🟨⬛⬛⬛
⬛⬛🟩⬛⬛
```

Practice games use the line `Rokumon Word Practice`. On phones that expose the system share sheet, that same text is handed off first; otherwise it is copied to the clipboard. If copying is blocked, the grid is shown on the card so it can be selected.

## Stats and the daily lock

Everything is kept in the browser's `localStorage`. Nothing is sent anywhere.

| Key | Holds |
| --- | --- |
| `rw-stats` | The record, below |
| `rw-daily-progress` | `{ day, rows }`: the guesses already spent on today's unfinished daily word |
| `rw-prefs` | Sound on or off, and whether the how-to hint has been seen |

Fields of `rw-stats`:

| Field | Meaning |
| --- | --- |
| `played`, `wins` | Every finished daily and practice game |
| `streak`, `maxStreak` | Daily only. A win on the day after the last recorded day adds 1. A win after a missed day starts again at 1. A loss sets the streak to 0. The streak on screen reads 0 once a whole day has been missed. |
| `lastDaily` | The player's **local** date, `YYYY-MM-DD`, of the last finished daily puzzle |
| `dailyResult` | `{ won, guesses, grid, rows }` for that puzzle. `rows` holds the guessed words, so the locked board shows letters as well as colours. |

**One day key.** The daily word, the lock, the streak and the date in the share text all use the same local-date key. The word changes at the player's local midnight. A puzzle keeps the day it was dealt for: a game still open at midnight finishes against the old word and is recorded on the old day, and a tab with no game under way moves to the new word when it is next looked at.

**Reloads.** Reloading during a daily game puts the spent guesses back, so a reload cannot be used for extra tries. Practice games are not saved across a reload.

**Bad saves.** Each save is checked when it is read. Unreadable JSON, wrong types, impossible counts (more wins than games, a streak above the best streak) and malformed grids reset that save to empty rather than stopping the game. If the browser blocks storage altogether (private mode, a sandboxed frame) the game still plays and keeps the record for the visit only.

Opening a finished daily puzzle shows the saved board, the word and the share button. It does not deal a second daily word.

The daily answer is chosen with `mulberry32` seeded by the local calendar date (`year * 10000 + month * 100 + day`) and indexed into the built-in list, duplicates included. Everyone on that local date gets the same word. Practice picks with `Math.random`.

Sounds are short Web Audio tones (no audio files) and stop when sound is switched off. The context resumes on the first tap or key press.

## Accessibility

- Every control is a real button and reachable with Tab. Enter and Space work the focused control; Enter anywhere else submits the guess.
- Each tile has a spoken label ("C, right place"), and each on-screen key says what is known about its letter.
- The result of a guess, a win and a loss are announced through a polite live region.
- The how-to dialog takes focus when it opens, keeps Tab inside it, closes on Escape and returns focus to its button.
- The three tile states differ by shape as well as colour (bar, frame, hatch).
- With "reduce motion" set, tiles change without the flip and there is no win burst.

Not yet checked with a real screen reader or on a physical phone.

## Known limits

- **Small word list.** Answers and accepted guesses share one list of 502 words, so many ordinary words (for example BLADE, GHOST, NINJA) are refused as "Not in word list". This is the biggest thing holding the game back. Fixing it needs a larger guess list from a source whose licence allows shipping it.
- **Local midnight.** Players in different time zones get the new word at different moments, and changing the device clock changes the day.
- **The share grid** uses green, yellow and black squares, not the game's own gold and violet.

## Development checks

The game needs none of this to run. The checks read the scripts straight out of `index.html`, so there is no second copy of the rules.

```bash
npm ci
npm test                          # rules (node:test) and the real page in jsdom
npx playwright install chromium   # once
npm run smoke                     # the real file in Chromium: desktop, 390px and 320px phones
```

- `tests/core.test.mjs`: scoring with repeated letters, day keys, the daily word, streak rules, save and progress validation.
- `tests/page.test.mjs`: plays the page through its keys with a fixed clock: win, loss, reload mid-game, the daily lock, the next day, a tab left open past midnight, broken and blocked storage, keyboard and dialog focus.
- `tests/smoke.mjs`: real taps and key presses, reloads, no sideways scroll, key sizes, no console errors and no network requests.

Both run on every pull request (`.github/workflows/ci.yml`). The pure rules live in the `<script id="rw-core">` block and must stay free of DOM, storage and clock access.

## Hub bridge

If the host page installs `window.Hub`, the game calls it and ignores a missing bridge so the file still runs on its own:

- `Hub.ready()` when a mode becomes ready (also once at startup, and again when a new day's word is dealt)
- `Hub.score(n)` on a win, where `n` is `7 - guesses`
- `Hub.event('puzzle-completed', { guesses, daily, streak })` on a win
- `Hub.gameOver(score, 0)` on a win (`score` as above) or a loss (`0`)

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-word/index.html`
- Bundle budget: one HTML file, well under 1 MB
- Controls: keyboard, mouse, touch. Single player. Portrait or landscape.

Drop `index.html` on any static host. No install step.
