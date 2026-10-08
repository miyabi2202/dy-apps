# 方块干预实验室 (Block Intervention Lab)

## Debug logs

The app logs to the browser console with the tag `[tetris]` (`log.ts`): the page's mode and settings, the game's start, pause, resume, restart and game over, line clears and settlements (each with score, lines, speed and pending curses), each gift and the curses it drew, the gift source and the DyHub connection. Nothing is logged per tick or per frame, and a busy room's gifts are cut to 5 lines a second plus a summary.

- The dev server (`pnpm dev`) shows them at `debug` level. Chrome files `console.debug` under "Verbose", so turn that on in the console's level filter. A Playwright run reads them with `page.on('console', …)`.
- A build only logs `warn` and above; build with `LOG_LEVEL=debug pnpm build` to get the rest. Jest is silent.

## TODO

- Show an MVP list on game over (score = the sum of each curse's 1 / chance, taken from its rarity).
- Luck score (MVP score / diamonds spent, then scaled with a logarithm so the values look very different), with a leaderboard showing 1st, 2nd, …, second to last, and last.
- Extensive unit tests and integration tests.
