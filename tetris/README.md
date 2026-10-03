# 方块干预实验室 (Block Intervention Lab)

A single-player falling-block game where a simulated audience team, 诅咒队 (curse), sends a virtual gift, 星光, to trigger random curses against the player. Curses queue up and resolve every 3 locked pieces. The product spec is [`hand_over.md`](hand_over.md); the UI is in Simplified Chinese.

Everything runs locally: no live-stream API, payments, backend or network access at runtime.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)
- For browser tests: Chromium via Playwright (installed below)

## Commands

This app is the `@dy-apps/tetris` package in the repo's pnpm workspace. Install once from the repo root, then run the scripts from `tetris/` (or from the root with `pnpm --filter @dy-apps/tetris <script>`). All scripts are plain Node CLIs, so they work in PowerShell/cmd as well as Bash.

```sh
pnpm install                            # at the repo root
pnpm exec playwright install chromium   # once, for e2e tests

pnpm dev            # Vite dev server → http://localhost:5173
pnpm build          # type-check + production build → dist/
pnpm preview        # serve dist/ → http://localhost:4173
pnpm typecheck      # tsc
pnpm lint           # ESLint (root eslint.config.js)
pnpm test           # Jest: unit, integration and stress tests
pnpm test:e2e       # Playwright: builds, serves, and drives Chromium
```

Formatting is repo-wide: `pnpm format` / `pnpm format:check` at the root.

Add `?seed=123` to the URL to make piece, garbage and gift randomness reproducible.

## Controls

| Key       | Action                   |
| --------- | ------------------------ |
| ← / →     | Move (hold to repeat)    |
| ↑ / X     | Rotate clockwise         |
| Z         | Rotate counter-clockwise |
| ↓         | Soft drop (hold)         |
| Space     | Hard drop                |
| C         | Hold / swap              |
| P         | Pause / resume           |
| Enter / P | Start (from ready)       |

Held keys use the game's own repeat timing (DAS 150 ms, ARR 45 ms), not the OS key repeat. Rotate, hard drop, hold and pause ignore auto-repeat. Keys are ignored while a text field or the probability dropdown has focus. The game keeps responding to the keyboard after you click a gift button, and the arrow keys and Space don't scroll the page while a game is running. Buttons under the board (左移 / 右移 / 旋转 / 暂存 / 硬降) cover mouse and touch.

## Project layout

```text
vite.config.ts     # \
jest.config.js     #  > thin wrappers around the presets in @dy-apps/config
playwright.config.ts # /
src/
  core/            # DOM-free engine — all rules live here
    config.ts      # every gameplay number
    types.ts
    random.ts      # seedable RNG, Fisher–Yates, independent streams
    pieces.ts      # matrices, rotation, simplified kicks, 7-bag
    board.ts       # collision, line clears, garbage
    interventions.ts  # queue, merge, promotion, reserve, settlement, conservation
    gifts.ts       # per-gift trigger + effect draw, batch stats
    effects.ts     # 4 curse effects, timed states, gravity formula
    game.ts        # GameEngine: phases, lock sequence, 3-piece settlement, log
  adapters/local-gift.ts  # the only gift source: button clicks → GiftBatchInput
  input/keyboard.ts       # DAS/ARR, focus and scroll handling
  render/board.ts         # Canvas 2D board and previews, devicePixelRatio aware
  loop.ts                 # rAF loop, frame clamp, auto-pause when hidden
  ui/                     # React + StyleX panels
tests/
  unit/            # engine rules, acceptance examples A–G
  integration/     # React UI (Testing Library), 30k-gift stress
  e2e/             # Playwright in Chromium
```

The engine updates the board every frame. The React panels re-render only when the engine bumps its `version` (gifts, locks, phase changes, holds). Movement and gravity don't trigger re-renders.

## Testing

- **Unit (Jest):** covers the 7-bag, collision, movement, rotation and kicks, the ghost piece, scoring, gravity remainder, 500 ms lock delay, the 12-reset limit, and free air moves. It also covers hold, seal, fog, settling every 3 locks, empty queues, top-out, line-clear cancellation, timed-effect windows, pause, and gift rules by phase. Every deterministic example from spec §14 (A–G) has a test, except D (shield before garbage), which went away with the bless team. Probability tests use fixed RNG sequences, so none of them can fail at random.
- **Integration (Jest + Testing Library):** example B through the real UI, distinct miss and overflow messages, invalid input rejection, start/pause/resume/restart confirmation, and keyboard focus after button clicks.
- **Stress:** 30,000+ gifts in mixed batch sizes, with 0–5 locks between batches. Capacity, conservation and bounded state are checked after every batch, and the game is checked to still be playable afterwards.
- **E2E (Playwright, Chromium):** real Canvas pixels and DPR sizing, gift buttons, phase controls, arrow/Space after clicking a gift button with no scroll, DAS/ARR hold, rapid hard drops, auto-pause on hidden with no catch-up, 320 px and desktop layouts, 30,000 UI gifts, and focus handling for the number input. Every test also asserts there were no console errors.

### Recorded results

Measured on 2026-10-03 on an Apple M1 Max (macOS 26.6), Node 25.9, Chromium (Playwright 1.63 headless shell):

| Suite                      | Result                                            |
| -------------------------- | ------------------------------------------------- |
| `pnpm test` (Jest)         | 73 / 73 passed                                    |
| Stress (engine)            | 31,440 gifts, 30 settlements, ≈ 60 ms             |
| `pnpm test:e2e` (Chromium) | 10 / 10 passed                                    |
| E2E UI stress              | 30,000 gifts (3 × 10,000 batches) + drops, passes |
| `pnpm build` (Vite)        | succeeds                                          |

These timings depend on the hardware. **Windows, Edge and Firefox were not tested.** Only Chromium on macOS was run.

## Rule interpretations

Where the spec left room, these are the choices made:

- **Fog / seal duration:** the level is the number of locks the state lasts (Lv.1 = 1 piece, up to 3). Fog hides the whole preview while active. Reapplying replaces the level and the remaining count.
- **Restart confirmation:** the dialog appears whenever there is anything to lose, including after game over.
- **Lock resets:** a move or rotation resets the lock timer only if the piece was grounded before it (up to 12 times). A piece that slides off a ledge and lands again restarts its 500 ms timer, as standard.
- **Promotion during reserve refill:** the code checks for it, but with capacity 3 it can never fire. After the head is popped only indices 0–1 remain, and index 1 can't cross the locked slot.

## Known limitations

- Simplified wall kicks (`(0,0), (-1,0), (1,0), (-2,0), (2,0), (0,-1), (0,-2)`). This is **not SRS**.
- No Web Worker. A 10,000-gift batch takes a few milliseconds on the main thread, so no "processing" indicator is shown.
- No OBS transparent mode, live-stream adapter, sound or persistence. A page refresh starts a new game, as the spec requires.
- The spec suggests Vitest. This project uses Jest because the toolchain was set up with it. The tests cover the same requirements.
- `window.__blockLab` exposes the engine for browser tests and debugging.
