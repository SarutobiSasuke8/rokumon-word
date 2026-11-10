# Rokumon Word

A daily five-letter word puzzle for the Rokumon catalogue. One shared word each day, plus unlimited practice. The whole game is `index.html` — no build step, no server.

## How to play

1. Open `index.html` in a browser, or let the hub load it in an iframe.
2. You have six guesses at a five-letter word.
3. Every guess has to be in the in-game word list. Submit with Enter, or tap the on-screen Enter key.
4. After a guess, each tile turns:
   - **Gold** — right letter, right place
   - **Violet** — the letter is in the word, wrong place
   - **Ink** — the letter is not in the word
5. A short guess shakes the row (“Not enough letters”). A word that is not in the list shakes too.
6. **Daily** locks after a win or a loss until the next local midnight. **Practice** deals another word immediately. The info button explains both modes and shows your record.

The on-screen keyboard and a physical keyboard both work. The layout fits a phone width without sideways scrolling.

## Share

When a puzzle is finished, **Share result** is the main action in the summary card (the keyboard steps aside so the card is on screen).

The copied text is unchanged from the original grid:

```
Rokumon Word 2026-11-10
🟩🟨⬛⬛⬛
⬛⬛🟩⬛⬛
```

Practice games use the line `Rokumon Word Practice`. On phones that expose the system share sheet, that same text is handed off first; otherwise it is copied to the clipboard. If copying is blocked, the grid is shown on the card so it can be selected.

## Stats and the daily lock

Progress stays in `localStorage` under `rw-stats`:

| Field | Meaning |
| --- | --- |
| `played`, `wins` | Every finished daily and practice game |
| `streak`, `maxStreak` | Daily only. A daily win increments the streak when that UTC day has not already been recorded. A daily loss sets the streak to 0. |
| `lastDaily` | UTC date key `YYYY-MM-DD` from `toISOString()` |
| `dailyResult` | `{ won, guesses, grid }` for the locked daily puzzle |

Opening a finished daily puzzle shows the saved colour grid, the word, and the share button. It does not deal a second daily word.

The daily answer is chosen with `mulberry32` seeded by the **local** calendar date (`year * 10000 + month * 100 + day`) and indexed into the built-in list, duplicates included. Everyone on that local date gets the same word. Practice picks with `Math.random`.

Sound on/off is stored separately in `rw-prefs` and does not change the record. Sounds are short Web Audio tones (no audio files). The context resumes on the first tap or key press.

## Hub bridge

If the host page installs `window.Hub`, the game calls it and ignores a missing bridge so the file still runs on its own:

- `Hub.ready()` when a mode becomes ready (also once at startup)
- `Hub.score(n)` on a win, where `n` is `7 - guesses`
- `Hub.event('puzzle-completed', { guesses, daily, streak })` on a win
- `Hub.gameOver(score, 0)` on a win (`score` as above) or a loss (`0`)

## Catalogue

`game-hub-manifest.json` is the embedded release descriptor.

- Runtime: iframe, entry `/games/rokumon-word/index.html`
- Bundle budget: one HTML file, well under 1 MB
- Controls: keyboard, mouse, touch. Single player. Portrait or landscape.

Drop `index.html` on any static host. No install step.
