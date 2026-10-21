# dy-apps

Small live-stream apps, served as one site: an index page at `/` and each app on its own route. The site lives in one package, [`frontend/`](frontend) (`@dy-apps/frontend`), inside a pnpm workspace. Beside it, [`chat-bot/`](chat-bot) (`@dy-apps/chat-bot`) is a command-line bot, not a web page, and [`room-feed/`](room-feed) (`@dy-apps/room-feed`) the local server both get a live room's chat and gifts from.

| Path                                 | What it is                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `frontend/src/`                      | The site itself: index page, React Router, entry (`main.tsx`)                    |
| `frontend/src/apps/tetris/`          | 方块干预实验室 at `/tetris`: block game with audience curses                     |
| `frontend/src/apps/danmaku/`         | 弹幕墙 at `/danmaku`: transparent chat overlay for OBS                           |
| `frontend/src/apps/gift-pile/`       | 嘉年华堆堆乐 at `/gift-pile`: icons fall from the top and pile up, up to 100k    |
| `frontend/src/apps/room-feed-guide/` | room-feed Windows 安装教程 at `/room-feed-windows`, for streamers                |
| `frontend/src/services/`             | Shared non-UI code: the room-feed client, messages, fake data and saved settings |
| `frontend/src/ui/`                   | Shared design tokens and components (Button, Panel, Field, MessageCard, Page, …) |
| `chat-bot/`                          | A bot that chats in a live room: answers @s, joins in, names songs, thanks gifts |
| `room-feed-protocol/`                | What room-feed sends and answers: events, status frames, HTTP API types, URLs    |
| `room-feed/`                         | The server that reads a live room in Chrome and sends its chat and gifts on      |

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
      room-feed-client.ts     #     RoomFeedClient: onComment / onGift / onLike / onStatus, with retry
      room-feed.ts            #     the raw stream (connectRoomFeed), port/room validation, GiftCounter, status text
      fake-messages.ts    #     made-up viewers, chat and gifts for previews
      like-batcher.ts     #     LikeBatcher: one total per viewer once they stop liking
      live-message.ts     #     DanmakuMessage, and room-feed events turned into messages
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
  commands.md             #   every /command: who may run it, price, where it's defined, how to add one
  prompt.md               #   the prompt sent to Claude: {{history}}, {{transcript}}, {{asker}}, {{question}}, …
  song-id.md              #   the prompt for /识歌 (Codex)
  solve.md                #   the prompt for /解题 and /拼命解题 (Codex)
  gift-thanks.md          #   the prompt for thanking big givers
  song-intro.md           #   the prompt for saying more about a song once it's named
  reply-pick.md           #   the prompt for picking whom to answer unprompted
  intro.md                #   what the bot says about itself when asked (in prompt.md)
  wording.md              #   the sentences the program says to Jev, Codex and Claude around what it fills in (asked, relevance, song notes…)
  config.json             #   admins (user ids) and the starting persona
  src/main.ts             #   entry: options (cli-options.ts), the container built, started and stopped
  src/wiring/             #   the IoC container (container.ts) and what each area registers in it (models, room, auto-reply, songs, malice, transcriber, bot)
  src/core/               #   pure logic: mentions, prompt, reply splitting, wallet, chat record and talk record formats
  src/app/                #   use cases: ChatBot (commands, charging), RoomFeed (chat and gifts in), MentionAnswerer (questions to Claude), RoomState (what prompts know about the room), Billing, Outbox, Transcriber; ports.ts for the outside
  src/adapters/           #   room-feed, the Claude CLI, the ASR process, files and logging
  asr/                    #   Python (uv) speech-to-text worker: ffmpeg + fsmn-vad + FireRedLID + FireRedASR2-AED/SenseVoice + AST + CAM++
  logs/  data/            #   winston logs; data/<房间号>/ per room: chat/, <user id>/, bot_logs.md, context.md, wallet.json (not in git)
room-feed-protocol/       # @dy-apps/room-feed-protocol: room-feed's events and API, as types (+ DEFAULT_PORT, eventsUrl, roomUrl)
  src/events.ts           #   chat, gift, like events and the status frames, one JSON object per WebSocket message
  src/api.ts              #   the HTTP API's answers, the default port and the URLs
room-feed/                # @dy-apps/room-feed: one live room's events, run with tsx (see "room-feed" below)
  src/main.ts             #   entry: `login` or `--room` (cli-options.ts), the real objects wired
  src/room.ts             #   Room: keeps the room page open, reopens it when chat drops, chat queue
  src/room-page.ts        #   the page in Chrome (Playwright): push frames over CDP, chat box, stream URL, screenshot
  src/server.ts           #   HTTP + WebSocket for clients
  src/douyin/             #   Douyin's protobuf, its messages turned into events, the streamer from the page
  src/login.ts            #   `login`: a Chrome window to log in, the cookie saved to data/cookie.json
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

## room-feed (live-room events)

Live chat, gifts and likes come from [`room-feed/`](room-feed) (`@dy-apps/room-feed`), a small server that runs on the streamer's own machine. It opens one Douyin live room in Chrome (headless), reads the chat socket's frames over CDP, and sends them on as JSON events to local clients over WebSocket. It started as a cut-down copy of [ymstar/dyhub](https://github.com/ymstar/dyhub) (MIT, see `room-feed/LICENSE`): only the browser collector, one room, no console.

```sh
pnpm room-feed login                 # log in to Douyin in a Chrome window; saved in room-feed/data/
pnpm room-feed --room <房间号>        # serve that room on port 8757 (--port to change)
```

It needs Chrome installed (`--chrome <path>` when it isn't found). Gifts only arrive, and chat can only be sent, when logged in. It serves one room: a client asking for another gets an error naming the room it serves, so two rooms need two room-feeds on different ports. When the chat socket drops, or no push frame comes within a minute (the room isn't live), it reopens the room page by itself.

| Endpoint                         | What                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `ws://…/ws?roomId=<id>&types=…`  | events (`chat`, `gift`, `like`) and `__connecting` / `__connected` status frames  |
| `GET /api/rooms/<id>`            | status, the streamer (`meta.uid`, from the room page) and the login's `expiresAt` |
| `POST /api/rooms/<id>/chat`      | `{ text }`: send a chat as the logged-in account; `echoed` once it came back      |
| `GET /api/rooms/<id>/stream`     | the FLV URL the page's player pulls (the bot's speech recognition)                |
| `GET /api/rooms/<id>/screenshot` | the player as a JPEG                                                              |

Every shape here is a type in [`room-feed-protocol/`](room-feed-protocol) (`@dy-apps/room-feed-protocol`): room-feed sends them, and `@dy-apps/services` and the chat bot read them.

Apps connect through [`@dy-apps/services`](frontend/src/services) to `ws://localhost:<port>/ws?roomId=<id>`. Enter the port (`8757` by default) and the room ID (the number in `live.douyin.com/<id>`). The address is always `localhost`, so room-feed must run on the same computer as the browser or OBS showing the page. That also works from the deployed HTTPS site, because browsers allow `ws://localhost` from secure pages.

Status: both apps pick fake data or a live room in their 数据来源 panel. The danmaku wall shows the room's chat, gifts and likes; tetris turns its gifts into curses, one draw per diamond.

## Chat bot

[`chat-bot/`](chat-bot) is a bot that chats in a live room: it answers @s, joins in, names the songs sung and thanks big givers, with Claude. What it does, how to use it and every option are in [`chat-bot/README.md`](chat-bot/README.md).

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
- in `chat-bot/src`, `core` imports `app` or `adapters`; `app` imports `adapters`; `adapters` imports from `app` anything but `ports.ts`; `app/ports.ts` imports another `app` module; any of them imports `main.ts`, `cli-options.ts` or `wiring/`; or two modules there import each other (`import-x/no-cycle`, which doesn't count type-only imports). `core` and `app` may not import `node:*`, `@dy-apps/services` or `winston` either (`@typescript-eslint/no-restricted-imports`): only adapters and the entry touch the outside world

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
