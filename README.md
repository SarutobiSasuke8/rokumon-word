# Rokumon Word

Wordle-style word puzzle for the Rokumon Games platform.

## Concept

- Classic 5-letter (or configurable) word guess with colour feedback (correct / present / absent).
- Daily puzzle (shared seed or date-based) plus unlimited practice mode.
- Clear win/loss, guess count, and time optional.
- Strong fit for streaks, daily check-in gems, and leaderboards (guess count or fastest solve).

## Platform integration goals

- Local-first progress and streak tracking.
- Optional account sync.
- Emit events for completed puzzles, daily completion, and personal bests so the hub can surface them in quests and leaderboards.
- Mobile-friendly keyboard or on-screen keys.

## Technical notes

- Dictionary and answer list kept original or open-licensed.
- Deterministic daily word so all players see the same puzzle on a given day.
- Offline-capable where possible.

## Status

Private repo. Design stage, built with a view to platform play.

Created 2026-11-10.
