# 方块干预实验室 (Block Intervention Lab)

A single-player falling-block game for live streams: the audience's gifts trigger random curses against the player. Every diamond a gift is worth is one draw at the trigger chance; each hit adds a random curse to a pending count, and every 3 locked pieces each curse with anything pending fires once. The original product spec is [`hand_over.md`](hand_over.md) (it describes a local-only 星光 gift; the rules below say what changed); the UI is in Simplified Chinese.

Gifts come from made-up viewers (the default) or from a live Douyin room through DyHub, which runs on the streamer's computer. There is no backend.

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

## Pages and config

Like the 弹幕墙, the route has two pages, set up by a `TetrisConfig` (`src/config.ts`): the trigger chance, and where gifts come from (`demo.source` with its interval, or the room in `port` / `roomId`).

- **`/tetris`, the config page.** Three panels, then the full game as a preview:
  - **游戏**: the trigger chance (1–100%, per diamond). The preview game starts from its own 开始游戏 button or Enter.
  - **数据来源** (the shared `SourcePanel`): 模拟数据, made-up viewers sending random gifts at random times (10 s apart on average, 2–30 s), or 直播间（DyHub）. 开始模拟送礼 or 连接 starts it.
  - **OBS**: the link for an OBS browser source, with the chance and the source.

  The config is saved in localStorage (`dy-apps:tetris.*`) and comes back on reload.

- **`/tetris?obs=1&chance=15&demo=10000`** (or `&port=8757&room=…`), the OBS page: only the board, the pending curses and the gift wall, on a transparent background. It sends the link's gifts as soon as it opens. The streamer plays it through OBS's 交互 window; Enter starts.

Each gift shows on the gift wall as a 弹幕墙 card (`MessageCard` from `@dy-apps/ui`) with the curses it drew underneath; a combo stays one card and adds up. Gifts count only while a game is running or paused: before 开始 and after game over they are ignored and get no card.

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

Held keys use the game's own repeat timing (DAS 150 ms, ARR 45 ms), not the OS key repeat. Rotate, hard drop, hold and pause ignore auto-repeat. Keys are ignored while a text field or a dropdown has focus. The game keeps responding to the keyboard after you click a button, and Space doesn't scroll the page while a game is running. On the config page, buttons under the board (左移 / 右移 / 旋转 / 暂存 / 硬降) cover mouse and touch.

## Project layout

```text
jest.config.js     # thin wrapper around the Jest preset in @dy-apps/config
src/
  index.ts         # package entry: TetrisPage
  meta.ts          # path / title / description for the site index (no imports)
  tetris-page.tsx  # the /tetris route: config page or ?obs=1; creates the engine (?seed=), window.__blockLab
  config.ts        # TetrisConfig: chance and gift source, from the URL or localStorage, and the OBS link
  gift-feed.ts     # GiftFeed: gift messages → the engine (one draw per diamond) + gift wall cards
  use-gift-source.ts  # fake gifts (createFakeGift) or a live room's, while running
  use-live-gifts.ts   # DyhubClient → GiftFeed, with retry
  core/            # DOM-free engine — all rules live here
    config.ts      # every gameplay number
    types.ts
    random.ts      # seedable RNG, Fisher–Yates, independent streams
    pieces.ts      # matrices, rotation, simplified kicks, 7-bag
    board.ts       # collision, line clears, garbage
    interventions.ts  # pending curse counts, settlement, conservation
    gifts.ts       # per-draw trigger + curse draw, batch results with sender
    effects.ts     # 4 curse effects, fog/seal timers, permanent haste, gravity formula
    game.ts        # GameEngine: phases, lock sequence, 3-piece settlement, log
  input/keyboard.ts       # DAS/ARR, focus and scroll handling
  render/board.ts         # Canvas 2D board and previews, devicePixelRatio aware
  loop.ts                 # rAF loop, frame clamp, auto-pause when hidden
  ui/                     # React + StyleX: app.tsx (config page), obs-view.tsx, panels
tests/
  unit/            # engine rules, acceptance examples A–G
  integration/     # React UI (Testing Library), 30k-gift stress
                   # (Playwright e2e: site/tests/e2e/tetris.spec.ts)
```

The engine updates the board every frame. The React panels re-render only when the engine bumps its `version` (gifts, locks, phase changes, holds). Movement and gravity don't trigger re-renders.

## Testing

- **Unit (Jest):** covers the 7-bag, collision, movement, rotation and kicks, the ghost piece, scoring, gravity remainder, 500 ms lock delay, the 12-reset limit, and free air moves. It also covers hold, seal, fog, settling every 3 locks with each pending curse firing once, empty queues, top-out, line clears leaving pending garbage alone, three-piece fog/seal, permanent stacking haste, the bounded gift history, pause, and gift rules by phase. Spec §14 examples A, F and G have tests; B, C, D and E described the energy queue, the bless team and line-clear cancellation, which no longer exist. Probability tests use fixed RNG sequences, so none of them can fail at random.
- **Gift feed and config (Jest):** one draw per diamond, combos adding up on one card, gifts bigger than a batch, no gifts before start or after game over; `TetrisConfig` from the URL and localStorage, clamping, and the OBS link round trip.
- **Integration (Jest + Testing Library):** fake gifts ignored before start, then cards with their curses and pending counts in the real UI, gifts that trigger nothing, start/pause/resume, restarting after game over, the live source's port and room validation, the OBS link, and keyboard focus after button clicks.
- **Stress:** 30,000+ gifts in mixed batch sizes, with 0–5 locks between batches. Conservation and bounded history/log are checked after every batch, and the game is checked to still be playable afterwards.
- **E2E (Playwright, Chromium):** real Canvas pixels and DPR sizing, fake gifts reaching the wall only after start, phase controls and restart, WASD/Space after clicking a button with no scroll, DAS/ARR hold, rapid hard drops, auto-pause on hidden with no catch-up, 320 px and desktop layouts, 30,000 draws, focus handling for text fields, and the OBS page. Every test also asserts there were no console errors.

### Recorded results

Measured on 2026-10-06 on an Apple M1 Max (macOS 26.6), Node 25.9, Chromium (Playwright 1.63 headless shell):

| Suite                            | Result                                       |
| -------------------------------- | -------------------------------------------- |
| `pnpm test` (Jest, this package) | 71 / 71 passed                               |
| `pnpm test:e2e` (Chromium)       | 12 / 12 passed (tetris and the site)         |
| E2E stress                       | 30,000 draws (3 × 10,000 diamonds) + drops   |
| One 嘉年华 ×1314 (39.4M draws)   | ≈ 0.9 s on the main thread (see limitations) |
| `pnpm build` (Vite)              | succeeds                                     |

These timings depend on the hardware. **Windows, Edge and Firefox were not tested.** Only Chromium on macOS was run.

## Rule interpretations

Where the spec left room, these are the choices made:

- **Fog / seal duration:** one curse lasts three pieces; firing again while active restarts the count. Fog hides the whole preview while active.
- **Restart:** only from the game-over screen, without asking. There is no mid-game restart or pause button; P pauses.
- **Lock resets:** a move or rotation resets the lock timer only if the piece was grounded before it (up to 12 times). A piece that slides off a ledge and lands again restarts its 500 ms timer, as standard.
- **Curse queue:** no energy, levels, slots or reserve. Each triggered draw adds 1 to its curse's pending count, with no cap. At each settlement every curse type with a pending count fires once (in the order 垃圾行, 加速, 迷雾, 封存) and the rest keeps waiting, so a large gift becomes a steady stream rather than an instant loss. Line clears only score; they don't affect pending curses.
- **Haste:** permanent and stacking. Each haste multiplies the drop interval by 0.8 for the rest of the game, down to the 140 ms floor, and restart resets it. The 速度 box beside the preview shows the current fall speed relative to the starting speed, including line-clear speed-ups.
- **Gifts:** any Douyin gift counts, not just one kind. Every diamond it's worth is one draw (a gift without a price counts as 1 钻), credited to the viewer who sent it. Gifts before 开始 and after game over are ignored; gifts while paused count but wait for the next settlement. The engine keeps the last 50 batches; the gift wall keeps the last 200 cards.
- **Trigger chance:** any whole percent from 1% to 100% per diamond, 15% by default.

## Known limitations

- Simplified wall kicks (`(0,0), (-1,0), (1,0), (-2,0), (2,0), (0,-1), (0,-2)`). This is **not SRS**.
- No Web Worker, and every draw is rolled one by one. 10,000 draws take a few milliseconds, but a very expensive gift is slow: a 嘉年华 ×1314 (39.4 million draws) would block the page for about 0.9 s. Nobody sends that, and the fake viewers send at most 13 嘉年华 (390,000 draws).
- No sound, and the game itself isn't saved: a page refresh starts a new game, as the spec requires. The config page and the OBS page are separate games.
- The spec suggests Vitest. This project uses Jest because the toolchain was set up with it. The tests cover the same requirements.
- `window.__blockLab` exposes the engine for browser tests and debugging.
