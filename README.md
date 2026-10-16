# dy-apps

Small live-stream apps, served as one site: an index page at `/` and each app on its own route. The site lives in one package, [`frontend/`](frontend) (`@dy-apps/frontend`), inside a pnpm workspace. Beside it, [`chat-bot/`](chat-bot) (`@dy-apps/chat-bot`) is a command-line bot, not a web page.

| Path                             | What it is                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `frontend/src/`                  | The site itself: index page, React Router, entry (`main.tsx`)                    |
| `frontend/src/apps/tetris/`      | 方块干预实验室 at `/tetris`: block game with audience curses                     |
| `frontend/src/apps/danmaku/`     | 弹幕墙 at `/danmaku`: transparent chat overlay for OBS                           |
| `frontend/src/apps/gift-pile/`   | 嘉年华堆堆乐 at `/gift-pile`: icons fall from the top and pile up, up to 100k    |
| `frontend/src/apps/dyhub-guide/` | DyHub Windows 安装教程 at `/dyhub-windows`, for streamers                        |
| `frontend/src/services/`         | Shared non-UI code: the DyHub client, messages, fake data and saved settings     |
| `frontend/src/ui/`               | Shared design tokens and components (Button, Panel, Field, MessageCard, Page, …) |
| `chat-bot/`                      | Command-line bot that answers paid @mentions in a live room with `claude -p`     |

## Layout

```text
frontend/                 # @dy-apps/frontend: the one package
  index.html              #   the site's page
  public/emoji/           #   Douyin's chat emoji images, served at /emoji/ (table in services/douyin-emoji.ts)
  wrangler.jsonc          #   Cloudflare Workers static-assets deploy (SPA fallback for deep links)
  src/
    main.tsx  apps.ts  …  #   the site: entry, index page, router; apps.ts registers each app's route
    apps/<name>/          #   one folder per app: index.ts exports the page component, meta.ts a tiny `meta`
      tests/              #     Jest unit tests
      integration-tests/  #     Playwright specs, against the site's production build
    services/             #   imported as `@dy-apps/services`: shared non-UI code
      demo-source.ts      #     fake or live source, the fake interval and `?demo=` in OBS links
      dyhub-client.ts     #     DyhubClient: onComment / onGift / onLike / onStatus, with retry
      dyhub.ts            #     the raw stream (connectDyhub), port/room validation, GiftCounter, status text
      fake-messages.ts    #     made-up viewers, chat and gifts for previews
      like-batcher.ts     #     LikeBatcher: one total per viewer once they stop liking
      live-message.ts     #     DanmakuMessage, and DyHub events turned into messages
      live-room.ts        #     liveRoomFrom, the room in OBS links, createConnectionStore
      local-storage.ts    #     createStore for `dy-apps:<app>.<key>` values
    ui/                   #   imported as `@dy-apps/ui`: design tokens + the components every app reuses
  config/
    aliases.js            #   the `@dy-apps/ui` and `@dy-apps/services` import names (mirrored in tsconfig.json)
    vite.config.ts        #   site build: StyleX, chunk groups, commit hash
    jest.config.js        #   every unit test (jest/ holds its setup and the StyleX stub)
    playwright.config.ts  #   every app's integration tests, against `vite build` + `vite preview`
    storybook/            #   ui stories
  tsconfig.json           #   stays here so editors and ESLint find it
chat-bot/                 # @dy-apps/chat-bot: command-line bot, run with tsx (see "Chat bot" below)
  prompt.md               #   the prompt sent to Claude: {{history}}, {{transcript}}, {{asker}}, {{question}}, …
  src/main.ts             #   entry: options, real objects wired by hand
  asr/                    #   Python (uv) speech-to-text worker: ffmpeg + fsmn-vad + SenseVoice
  logs/  data/            #   winston logs; balances and chat records per room (not in git)
eslint.config.js          # lint for the whole repo, including which folders may import which
.prettierrc.json          # repo-wide formatting (+ .prettierignore)
package.json              # private root: lint/format tools and the repo-wide checks
pnpm-workspace.yaml
pnpm-lock.yaml
```

## Code splitting

The site's Vite build (`frontend/config/vite.config.ts`) splits output so each page downloads only what it needs:

- **One chunk per app** (`app-<name>-*.js`), loaded by React Router's route `lazy` only when its path is visited. The index imports just each app's `meta`, not its code.
- **One `lib` chunk** for the first-party shared libraries (`ui` and `services`), so an app never has to download another app's chunk to get shared code.
- **Long-lived vendor chunks**: `react` (React, ReactDOM, React Router) and `stylex` (StyleX runtime). They change only on dependency upgrades, so browsers keep them cached across deploys.
- **CSS is one file.** StyleX compiles every component's styles into shared atomic classes in a single stylesheet, so it isn't split per app; it's small and hashed for long-term caching.

The index page loads `react`, `stylex` and `lib` (it's built from `@dy-apps/ui` too) but never an `app-*` chunk.

## DyHub (live-room events)

Live chat and gifts come from [DyHub](https://github.com/ymstar/dyhub), a Douyin live-room event hub that runs on your own machine. The apps need **our fork, [miyabi2202/dyhub](https://github.com/miyabi2202/dyhub) (`main`)**, not upstream. The fork adds:

- Correct gift fields, including `groupId` and `repeatEnd`, which `GiftCounter` needs to count each gift once (upstream PR [ymstar/dyhub#4](https://github.com/ymstar/dyhub/pull/4), not merged yet)
- 网页登录 in the console: log in to Douyin in a pop-up window and the cookie is saved. Gift events need a logged-in cookie
- A fix so a room isn't marked closed when some other WebSocket on the live page closes
- The console's live feed merges the messages of one gift send

Run it on the machine that opens the app (the streaming PC, for OBS):

```sh
git clone https://github.com/miyabi2202/dyhub.git
cd dyhub
npm install
npm run build && npm start   # console → http://localhost:8757
```

It needs Node.js 20+ and Chrome installed. Log in once from the console (网页登录) to receive gifts. See the fork's README for environment variables such as `DYHUB_PORT`.

Apps connect through [`@dy-apps/services`](services) to `ws://localhost:<port>/ws?roomId=<id>`. Enter the port (DyHub's default is `8757`) and the room ID (the number in `live.douyin.com/<id>`), and DyHub starts collecting that room. The address is always `localhost`, so DyHub must run on the same computer as the browser or OBS showing the page. That also works from the deployed HTTPS site, because browsers allow `ws://localhost` from secure pages.

Status: both apps pick fake data or a live room in their 数据来源 panel. The danmaku wall shows the room's chat, gifts and likes; tetris turns its gifts into curses, one draw per diamond.

## Chat bot

`chat-bot/` reads a room's chat from DyHub and keeps the last 100 messages in memory. When someone @s the bot's account, it fills [`chat-bot/prompt.md`](chat-bot/prompt.md) with that message, the chat before it and what the streamer said lately, runs `claude -p` with a screenshot of the live video (only web search, no MCP servers, no saved session, since chat is untrusted), and posts `@asker reply` back to the room through DyHub's `POST /api/rooms/:roomId/chat`.

- **What the streamer says**: `chat-bot/asr/transcribe.py` pulls the stream's audio with ffmpeg (the URL comes from DyHub's `GET /api/rooms/:roomId/stream`), finds sentences with fsmn-vad and transcribes them with SenseVoice, on Apple's GPU, CUDA or the CPU. Audio stays in that process and is never written to disk; the bot keeps the text, timestamped, for 30 minutes, and gives the last 5 to the prompt as `{{transcript}}`. When the stream ends or its URL expires, the bot asks DyHub again and restarts the worker. Singing comes out as background music and is mostly skipped.
- **What's on screen**: DyHub's `GET /api/rooms/:roomId/screenshot` (the player only, as a JPEG) goes to Claude with each question.
- **Chat record**: everything the streamer says (with SenseVoice's emotion), every chat message and every gift goes into `data/chat/<房间号>/<ms>.txt`, one record per line, 100 lines per file, named by its first record's time: `2026-10-16 16:47:22 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）`, or `[主播](speech)(NEUTRAL) …` for the streamer. Lines rather than JSON halve what Claude spends reading them. Claude gets the folder (`--add-dir`) and is told in the prompt (`{{chatDir}}`) that it's the room's chat record, to read when the recent lines in the prompt aren't enough. Its file tools aren't pre-approved, so they reach only that folder: Claude Code denies reads anywhere else when nobody is there to approve them. The record is kept across runs.
- **Paying with gifts**: every gift a viewer sends in the room adds its diamonds (抖币) to their balance, and each @mention costs `--cost` diamonds. A viewer who can't pay gets `@昵称 你的余额不足，每次@需要1钻` instead of an answer, at most once a minute; a mention that fails is refunded. Balances last one run: they're written to `data/wallet-<房间号>.json` (`gifted` and `spent` per user id) as they change, and cleared when the bot exits (and when it starts, in case it didn't exit cleanly). Gift events need DyHub logged in.

It needs DyHub running with the browser collector and logged in (网页登录) as the bot's account, Claude Code's `claude`, `ffmpeg` and [uv](https://docs.astral.sh/uv/) on `PATH`. The first run downloads the speech models (about 1 GB) into `~/.cache/modelscope`. From `chat-bot/`:

```sh
pnpm start --room <房间号> --bot-name <the logged-in account's nickname> [--bot-id <its uid>]
```

Other options:

| Option                 | Default                      | What it does                                                                                            |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--port`               | `8757`                       | DyHub's port                                                                                            |
| `--prompt`             | `prompt.md`                  | The prompt template                                                                                     |
| `--history`            | `100`                        | Chat messages remembered and passed as `{{history}}`                                                    |
| `--max-reply`          | `49`                         | Reply length; Douyin's limit is under 50, and `{{maxLength}}` is what's left after `@asker `            |
| `--model`              | `opus`                       | Claude model                                                                                            |
| `--system`             | `你是一个抖音直播间的机器人` | Added to Claude Code's system prompt                                                                    |
| `--tools`              | `WebSearch,Read,Glob,Grep`   | Claude Code's built-in tools, comma-separated; `''` for none. File tools read only `data/chat/<房间号>` |
| `--cost`               | `1`                          | Diamonds per @mention; `0` makes them free                                                              |
| `--no-asr`             |                              | Don't transcribe the streamer                                                                           |
| `--transcript-minutes` | `5`                          | How far back `{{transcript}}` goes                                                                      |
| `--no-screenshot`      |                              | Don't send a screenshot                                                                                 |
| `--logs` / `--data`    | `logs/` / `data/`            | Where logs and balances go                                                                              |

The console shows info and up (mentions, gifts, what was heard, replies); `logs/chat-bot.log` has everything, including every chat line and prompt, as JSON lines. `--bot-id` makes @mentions match by user id rather than nickname; DyHub shows it as the `user.id` of the bot's own chat messages.

Shared code comes from `@dy-apps/services` (the `DyhubClient`), read from `frontend/src/services` through `paths` in `chat-bot/tsconfig.json` and `moduleNameMapper` in `chat-bot/jest.config.js`.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)

## Commands

Checks that cover the whole repo run from the root:

```sh
pnpm install
pnpm typecheck        # tsc
pnpm lint             # ESLint, whole repo
pnpm test             # Jest
pnpm format           # Prettier, whole repo (format:check to verify)
pnpm check            # format:check + typecheck + lint + test
```

Everything else belongs to the site, so run it from `frontend/` (or from the root with `pnpm --filter @dy-apps/frontend <script>`):

```sh
pnpm dev              # dev server → http://localhost:5173 (index) and /tetris
pnpm build            # type-check + Vite → frontend/dist/
pnpm preview          # serve that build → http://localhost:4173
pnpm test:integration # Playwright against the built site (run `pnpm exec playwright install chromium` once)
pnpm storybook        # ui components and tokens in Storybook → http://localhost:6006
pnpm build-storybook  # → frontend/storybook-static/
```

## One package, kept apart by lint

The site, apps and shared libraries share one `package.json`, `tsconfig.json` and set of tool configs (in `frontend/config/`, passed to each tool by the scripts). Folders still keep their boundaries; `pnpm lint` fails when an import crosses one (`import-x/no-restricted-paths` in `eslint.config.js`):

- an app imports another app, or the site
- `ui` or `services` imports an app or the site
- `services` imports `ui`

Apps import the shared libraries by name, `@dy-apps/ui` and `@dy-apps/services`. Those names come from `frontend/config/aliases.js`, which Vite, StyleX, Jest and Storybook read; `paths` in `frontend/tsconfig.json` repeats them for TypeScript.

## Adding an app

1. Create `frontend/src/apps/<name>/` with the page component exported from `index.ts`, and `meta = { path, title, description }` from `meta.ts`. Keep `meta.ts` free of imports so the index stays small.
2. Add one entry to `frontend/src/apps.ts`, importing `meta` and the page by relative path.
3. Put unit tests in `tests/` and Playwright specs in `integration-tests/`, both inside the app's folder. Jest, Playwright, TypeScript, ESLint and the chunk groups pick them up without any config.
4. Build the UI from `@dy-apps/ui` (see below) instead of styling your own buttons, panels or inputs.

## Design system

`@dy-apps/ui` keeps every app on one design language. It holds only what more than one app actually uses:

- **Tokens** in `@dy-apps/ui/tokens.stylex`: `colors`, `space`, `radius`, `fontSize`, `fonts`. Import them from that path directly, not through the package index; StyleX resolves variables by the file that defines them.
- **Components**: `Button` (`default` / `primary` / `danger`), `Panel`, `Field` with `Input` / `Select` and an optional `hint` (and `useFieldId` for custom controls), `Slider`, `Row` / `Column` / `Grid` for spacing, `Page` for an app's root, and `text.muted` / `text.caption` styles.
- **Live-stream pieces**: `MessageCard` and `MessageList` (the 弹幕墙 cards, styled by a `CardStyle`), `SourcePanel` with `useDemo` (fake or live data), `ConnectionForm` and `ObsLink`.

Browse them with `pnpm storybook` in `frontend/`; stories live in `frontend/src/ui/stories/`, unit tests in `frontend/src/ui/tests/`. Every component takes an `xstyle` prop for one-off tweaks. Styles that stay inside an app (a game board, an overlay card) still use the tokens for colour, padding and radius rather than literal values.

## TODO

- A logging method in `@dy-apps/services` that logs only when the URL has `debug=1`, replacing per-app switches like the danmaku page's `?logmsg=1`.
