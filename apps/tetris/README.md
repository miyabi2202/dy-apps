# 方块干预实验室 (Block Intervention Lab)

A single-player falling-block game where a simulated audience sends a virtual gift, 星光, to trigger random curses against the player. Each triggered curse adds to a pending count, and every 3 locked pieces each curse with anything pending fires once. The product spec is [`hand_over.md`](hand_over.md); the UI is in Simplified Chinese.

Everything runs locally: no live-stream API, payments, backend or network access at runtime.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)
- For browser tests: Chromium via Playwright (see the root README)

## Commands

This app is the `@dy-apps/tetris` package in the repo's pnpm workspace. It has no build of its own: it exports `TetrisPage` (and a small `meta`), and `@dy-apps/site` serves it at **`/tetris`**. Install once from the repo root, then run these from `apps/tetris/` (or from the root with `pnpm --filter @dy-apps/tetris <script>`):

```sh
pnpm install        # at the repo root
pnpm typecheck      # tsc
pnpm lint           # ESLint (root eslint.config.js)
pnpm test           # Jest: unit, integration and stress tests
```

To play or run browser tests, use the site from the repo root: `pnpm dev` (then open http://localhost:5173/tetris) and `pnpm test:e2e`. The game's Playwright tests live in `site/tests/e2e/tetris.spec.ts`.

Formatting is repo-wide: `pnpm format` / `pnpm format:check` at the root.

Add `?seed=123` to the URL to make piece, garbage and gift randomness reproducible.

## Controls

| Key       | Action                   |
| --------- | ------------------------ |
| A / D     | Move (hold to repeat)    |
| W         | Rotate clockwise         |
| Q         | Rotate counter-clockwise |
| S         | Soft drop (hold)         |
| Space     | Hard drop                |
| C         | Hold / swap              |
| P         | Pause / resume           |
| Enter / P | Start (from ready)       |

Held keys use the game's own repeat timing (DAS 150 ms, ARR 45 ms), not the OS key repeat. Rotate, hard drop, hold and pause ignore auto-repeat. Keys are ignored while a text field or the probability dropdown has focus. The game keeps responding to the keyboard after you click a gift button, and Space doesn't scroll the page while a game is running. Buttons under the board (左移 / 右移 / 旋转 / 暂存 / 硬降) cover mouse and touch.

## Project layout

```text
jest.config.js     # thin wrapper around the Jest preset in @dy-apps/config
src/
  index.ts         # package entry: TetrisPage
  meta.ts          # path / title / description for the site index (no imports)
  tetris-page.tsx  # the /tetris route: creates the engine (?seed=), window.__blockLab
  core/            # DOM-free engine — all rules live here
    config.ts      # every gameplay number
    types.ts
    random.ts      # seedable RNG, Fisher–Yates, independent streams
    pieces.ts      # matrices, rotation, simplified kicks, 7-bag
    board.ts       # collision, line clears, garbage
    interventions.ts  # pending curse counts, settlement, conservation
    gifts.ts       # per-gift trigger + curse draw, batch results with sender
    effects.ts     # 4 curse effects, fog/seal timers, permanent haste, gravity formula
    game.ts        # GameEngine: phases, lock sequence, 3-piece settlement, log
  adapters/local-gift.ts  # the only gift source: button clicks → GiftBatchInput
  input/keyboard.ts       # DAS/ARR, focus and scroll handling
  render/board.ts         # Canvas 2D board and previews, devicePixelRatio aware
  loop.ts                 # rAF loop, frame clamp, auto-pause when hidden
  ui/                     # React + StyleX panels
tests/
  unit/            # engine rules, acceptance examples A–G
  integration/     # React UI (Testing Library), 30k-gift stress
                   # (Playwright e2e: site/tests/e2e/tetris.spec.ts)
```

The engine updates the board every frame. The React panels re-render only when the engine bumps its `version` (gifts, locks, phase changes, holds). Movement and gravity don't trigger re-renders.

## Testing

- **Unit (Jest):** covers the 7-bag, collision, movement, rotation and kicks, the ghost piece, scoring, gravity remainder, 500 ms lock delay, the 12-reset limit, and free air moves. It also covers hold, seal, fog, settling every 3 locks with each pending curse firing once, empty queues, top-out, line clears leaving pending garbage alone, three-piece fog/seal, permanent stacking haste, the bounded gift history, pause, and gift rules by phase. Spec §14 examples A, F and G have tests; B, C, D and E described the energy queue, the bless team and line-clear cancellation, which no longer exist. Probability tests use fixed RNG sequences, so none of them can fail at random.
- **Integration (Jest + Testing Library):** pending counts and the per-sender gift history in the real UI, batches that trigger nothing, invalid input rejection, start/pause/resume/restart confirmation, and keyboard focus after button clicks.
- **Stress:** 30,000+ gifts in mixed batch sizes, with 0–5 locks between batches. Conservation and bounded history/log are checked after every batch, and the game is checked to still be playable afterwards.
- **E2E (Playwright, Chromium):** real Canvas pixels and DPR sizing, gift buttons, phase controls, WASD/Space after clicking a gift button with no scroll, DAS/ARR hold, rapid hard drops, auto-pause on hidden with no catch-up, 320 px and desktop layouts, 30,000 UI gifts, and focus handling for the number input. Every test also asserts there were no console errors.

### Recorded results

Measured on 2026-10-03 on an Apple M1 Max (macOS 26.6), Node 25.9, Chromium (Playwright 1.63 headless shell):

| Suite                      | Result                                            |
| -------------------------- | ------------------------------------------------- |
| `pnpm test` (Jest)         | 60 / 60 passed                                    |
| Stress (engine)            | 31,440 gifts, 30 settlements, ≈ 44 ms             |
| `pnpm test:e2e` (Chromium) | 10 / 10 passed                                    |
| E2E UI stress              | 30,000 gifts (3 × 10,000 batches) + drops, passes |
| `pnpm build` (Vite)        | succeeds                                          |

These timings depend on the hardware. **Windows, Edge and Firefox were not tested.** Only Chromium on macOS was run.

## Rule interpretations

Where the spec left room, these are the choices made:

- **Fog / seal duration:** one curse lasts three pieces; firing again while active restarts the count. Fog hides the whole preview while active.
- **Restart confirmation:** the dialog appears whenever there is anything to lose, including after game over.
- **Lock resets:** a move or rotation resets the lock timer only if the piece was grounded before it (up to 12 times). A piece that slides off a ledge and lands again restarts its 500 ms timer, as standard.
- **Curse queue:** no energy, levels, slots or reserve. Each triggered gift adds 1 to its curse's pending count, with no cap. At each settlement every curse type with a pending count fires once (in the order 垃圾行, 加速, 迷雾, 封存) and the rest keeps waiting, so a large gift becomes a steady stream rather than an instant loss. Line clears only score; they don't affect pending curses.
- **Haste:** permanent and stacking. Each haste multiplies the drop interval by 0.8 for the rest of the game, down to the 140 ms floor, and restart resets it. The 速度 box beside the preview shows the current fall speed relative to the starting speed, including line-clear speed-ups.
- **Gift sender:** every local batch is credited to the placeholder sender `foo` until a live-stream adapter supplies real viewer names. The gift history keeps the last 50 batches.
- **Trigger chance:** 10%, 15% (default) or 20%.

## Known limitations

- Simplified wall kicks (`(0,0), (-1,0), (1,0), (-2,0), (2,0), (0,-1), (0,-2)`). This is **not SRS**.
- No Web Worker. A 10,000-gift batch takes a few milliseconds on the main thread, so no "processing" indicator is shown.
- Live gifts aren't wired in yet. The DyHub panel at the bottom of the page uses `@dy-apps/services` (in `services/` at the repo root). It connects to `ws://localhost:<port>/ws` for one room and only logs chat and gift events to the browser console. DyHub gift events report `ts` in microseconds and chat in milliseconds, so use `receivedAt` when wiring them up.
- No OBS transparent mode, sound or persistence. A page refresh starts a new game, as the spec requires.
- The spec suggests Vitest. This project uses Jest because the toolchain was set up with it. The tests cover the same requirements.
- `window.__blockLab` exposes the engine for browser tests and debugging.
