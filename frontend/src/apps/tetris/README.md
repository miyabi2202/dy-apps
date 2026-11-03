# 方块干预实验室 (Block Intervention Lab)

## Layout

Each layer only reaches down, never up:

- `core/`: the game, with no React or DOM. `game.ts` (`GameEngine`) runs the board, pieces, settlements and whatever holds play (a cutscene, a vote), and wires the rest together. The rest knows nothing of the engine:
  - `curses/`: one file per curse, plus their registry and hooks (see [its README](core/curses/README.md)).
  - `room/`: what the room does besides gifts, each in its own class: the like meter, votes, the quiet room, viewers' chat commands, the MVP board.
  - `interventions.ts` (pending counts, settlement queues, cancelling), `gifts.ts` (drawing curses), `cutscene-clock.ts`, `delayed-inputs.ts`.
- `render/`: draws the board on a canvas from the engine's `BoardView`.
- `ui/`: React panels. Most take plain views (`VoteView`, `LikeMeterView`, notices) and callbacks; only `App`, `ObsView`, `CenterPanel` and `DebugPanel` hold the engine.
- `gift-feed.ts` keeps the gift wall's cards; `room-events.ts` is the one place that routes the live room's gifts, chat and likes into the game; `use-live-room.ts` and `use-gift-source.ts` connect it to room-feed or fake gifts.
- `tetris-page.tsx` builds and wires the real objects.

## Debug logs

The app logs to the browser console with the tag `[tetris]` (`log.ts`): the page's mode and settings, the game's start, pause, resume, restart and game over, line clears, settlements and cutscenes (each with score, lines, speed and pending curses), each gift and the curses it drew, each viewer's chat command while 夺舍 hands them the piece, the like meter filling or starting over, votes opening and their results, the gift source and the room-feed connection. Nothing is logged per tick or per frame, and a busy room's gifts are cut to 5 lines a second plus a summary.

- The dev server (`pnpm dev`) shows them at `debug` level. Chrome files `console.debug` under "Verbose", so turn that on in the console's level filter. A Playwright run reads them with `page.on('console', …)`.
- A build only logs `warn` and above; build with `LOG_LEVEL=debug pnpm build` to get the rest. Jest is silent.

## TODO

- Luck score (MVP points / diamonds spent, then scaled with a logarithm so the values look very different), with a leaderboard showing 1st, 2nd, …, second to last, and last.
- Extensive unit tests and integration tests.
