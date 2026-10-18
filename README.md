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
  commands.md             #   every /command: who may run it, price, where it's defined, how to add one
  prompt.md               #   the prompt sent to Claude: {{history}}, {{transcript}}, {{asker}}, {{question}}, …
  talk.md                 #   the prompt for what the bot says unprompted
  song-id.md              #   the prompt for /识歌 with Claude
  song-id-web.md          #   …and with Codex
  gift-thanks.md          #   the prompt for thanking big givers
  config.json             #   admins (user ids) and the starting persona
  src/main.ts             #   entry: real objects wired by hand (options parsed in cli-options.ts)
  src/core/               #   pure logic: mentions, prompt, reply splitting, wallet, chat record and talk record formats
  src/app/                #   use cases: ChatBot (commands, charging), RoomFeed (chat and gifts in), MentionAnswerer (questions to Claude), RoomState (what prompts know about the room), Billing, Outbox, Transcriber; ports.ts for the outside
  src/adapters/           #   DyHub, the Claude CLI, the ASR process, files and logging
  asr/                    #   Python (uv) speech-to-text worker: ffmpeg + fsmn-vad + FireRedLID + FireRedASR2-AED/SenseVoice + AST + CAM++
  logs/  data/            #   winston logs; data/<房间号>/ per room: chat/, <user id>/, bot_logs.md, context.md, wallet.json (not in git)
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
- For the chat bot: `POST /api/rooms/:roomId/chat` sends chat as the logged-in account, `GET …/stream` gives the room's FLV stream URL and `GET …/screenshot` a JPEG of the player

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

`chat-bot/` reads a room's chat from DyHub and keeps the last 100 messages in memory. When someone @s the bot's account, it fills [`chat-bot/prompt.md`](chat-bot/prompt.md) with that message, the chat before it and what the streamer said lately, runs `claude -p` (with a screenshot of the live video if `--screenshot` is on; only web search and fetch, no MCP servers, no saved session, since chat is untrusted), and posts `@asker reply` back to the room through DyHub's `POST /api/rooms/:roomId/chat`. Everything the bot says goes out at least 10 seconds apart, while Claude goes on to the next question. Replies and low-balance notices wait in two queues, each in order, and a waiting reply always goes before a waiting notice.

- **What the streamer says**: `chat-bot/asr/transcribe.py` pulls the stream's audio with ffmpeg (the URL comes from DyHub's `GET /api/rooms/:roomId/stream`), finds sentences with fsmn-vad, tells each one's language with FireRedLID, transcribes it with [FireRedASR2-AED](https://github.com/FireRedTeam/FireRedASR2S) or, for Japanese and Korean, SenseVoice Small, and scores each for speech and music with AST (an AudioSet classifier), on Apple's GPU or CUDA. FireRedASR2-AED was picked over SenseVoice Small for making fewer mistakes with a song playing under the speech; it takes about a quarter of a sentence's length to transcribe it on an Apple GPU (SenseVoice took a hundredth), but over its length on the CPU, which then falls behind the stream. It only knows Mandarin, Chinese dialects and English, though: a Japanese song came out as romaji, `<unk>`s or loops like `HELLO HELLO …`, so those lines go to SenseVoice instead. Language ID is unreliable on short sentences, so one under 2 s skips it and goes to FireRedASR2-AED as Mandarin (`lang` empty), and only a sentence FireRedLID is at least 0.8 sure is Japanese or Korean goes to SenseVoice. FireRedLID adds about 0.15–0.2 s a sentence on an Apple GPU, and the log's `heard` shows its `lang` (`zh`, `en`, `ja`, …). FireRedASR2-AED's text has no punctuation (SenseVoice's has), and there's no emotion or background-music tag. Six or more of the same character or phrase (up to 12 characters) in a row are cut down to three. Audio stays in that process and is never written to disk; the bot keeps the text, timestamped, for 30 minutes, and gives the last 5 to the prompt as `{{transcript}}`. When the stream ends or its URL expires, the bot asks DyHub again and restarts the worker. A song is transcribed as if the streamer said it, so a line with a speech score under 0.2 is marked as sung (see the chat record below); the scores are also in the log (`heard`, as `speech` and `music`). AudioSet labels most songs Music rather than Singing, so the music score counts both.
- **Who's talking**: during a link-up (连线) Douyin mixes both streamers into one audio track, so the worker tells voices apart with CAM++ voiceprints (FunASR's `cam++`, on the CPU). Each sentence joins the closest voice heard so far if it's at least `--same-voice` close (0.6, cosine; set on `transcribe.py`), or starts a new voice; the first voice is the streamer until another has been heard for more than twice as long. Sentences under 1.5 s or sung are left out, as their voiceprints are too rough. Other voices' lines go into the chat record as `[连线]` and into the prompt marked `（连线）`; the log's `heard` shows `speaker`, `host` and `voice` (the similarity) for tuning. A sentence where both talk counts as one voice.
- **What music is playing**: the worker keeps the stream's last 15 s of audio in memory, and when the bot asks (a `{"music_id": …}` line on its stdin, for `/识别背景音乐`) looks it up by fingerprint with Shazam ([shazamio](https://github.com/shazamio/shazamio), an unofficial client: free and keyless, but it may stop working one day). The fingerprint is worked out locally and only it is sent. It finds the recording playing in the background, in any language, usually even with the streamer talking over it; it can't name a song the streamer sings themselves, which `/识歌` tries from the lyrics.
- **What's on screen**, while screenshots are on (off by default; `--screenshot` starts with them on, and admins switch them with `/截图 1` and `/截图 0` while it runs; most streams don't need it, lessons with a board do): DyHub's `GET /api/rooms/:roomId/screenshot` (the player only, as a JPEG) goes to Claude with each question.
- **Long answers**: Claude is asked to answer in one message. When it can't, the answer is split after punctuation into up to `--max-parts` messages, `@昵称 (1/3) …`. The @ uses the whole nickname when the message fits, and its first 3 characters when that's what it takes to fit, or when the answer is split.
- **Chat record**: everything the streamer says, every chat message and every gift goes into `data/<房间号>/chat/<ms>.txt`, one record per line, 100 lines per file, named by its first record's time: `2026-10-16 16:47:22 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）`, or `[主播](speech) …` for the streamer, `[连线](speech) …` for whoever they're linked up with, `[主播](sing) …` when sung (a speech score under 0.2; the prompt's transcript marks those lines `（唱）`). Lines rather than JSON halve what Claude spends reading them. Claude gets the folder (`--add-dir`) and is told in the prompt (`{{chatDir}}`) that it's the room's chat record, to read when the recent lines in the prompt aren't enough. Its file tools aren't pre-approved, so they reach only that folder: Claude Code denies reads anywhere else when nobody is there to approve them. The record is kept across runs.
- **Paying with gifts**: every gift a viewer sends in the room adds its diamonds (抖币) to their balance, and each @mention costs `--cost` diamonds. A viewer who can't pay gets `@昵称 你的余额不足，还剩0钻，每次@需要1钻（60秒内只提醒一次）` instead of an answer, at most once a minute; a mention that fails is refunded. Balances last one run: they're written to `data/<房间号>/wallet.json` (`gifted` and `spent` per user id) as they change, and cleared when the bot exits (and when it starts, in case it didn't exit cleanly). Gift events need DyHub logged in.
- **Admins and commands**: `chat-bot/config.json` lists the admins' user ids (`"admins": ["7664182420958889017"]`) and the starting persona (`"persona"`, which `{{persona}}` turns into `你的人设是…`). The bot reads the admins again whenever the file changes, so they can be added or removed while it runs; an edit that doesn't parse keeps the last good list (and logs a warning). A mention with a `/` first runs a command, like `@机器人/修改人设 爱讲冷笑话的小猫`: see [`chat-bot/commands.md`](chat-bot/commands.md) for each command, who may run it, what it costs, how they're handled and how to add one. In a private room (私密直播间) Douyin hides every viewer's user id, so admins aren't recognised there.
- **Talking unprompted**: every `--talk-minutes` (off by default: `0`) the bot has Claude say one message to the streamer from [`chat-bot/talk.md`](chat-bot/talk.md): what fits what was said, sung and chatted lately (and the video with `--screenshot`), with no @. When nothing was said, or chatted by anyone but the bot, since the last time, it stays quiet. Admins can make it talk now with `/回复`, and change the interval with `/自动回复间隔 5` (minutes, `0` for never) while it runs. The streamer can too, by voice: saying the room's wake word does the same as `/回复`, for free. Wake words are in [`chat-bot/wake-words.json`](chat-bot/wake-words.json), by room id, with `default` (`我想吃鱼了`) for rooms without their own (`""` for none); it's read again whenever it changes, and admins set the room's own with `/设置唤醒词 小猫饿了`. It counts only when spoken, not sung, and not by the guest in a link-up. It's matched by sound, as toneless pinyin (`src/core/sounds-like.ts`), so the transcript getting a character wrong doesn't matter: 我想吃余了 counts, and so do sounds people mix up (zh/z, ch/c, sh/s, n/l, -ng/-n). A phrase of 4 syllables or more may also have one syllable heard as a near one, with the same initial or final (我想吃鱼啦), but not as another word (我想吃饭了 doesn't count). After waking the bot it's ignored for a minute, so saying it twice doesn't make the bot talk twice.
- **Thanking big givers**: when a viewer's gifts within 5 minutes come to more than `--thanks-threshold` diamonds (99999 by default, so off; admins change it with `/自动谢礼 100`), Claude reads that viewer's own recent messages, their past exchanges with the bot, the room's chat and `context.md`, and writes one @ message to thank them from `gift-thanks.md`. The prompt keeps it conservative: no comments on looks, age, money or how much they gave, no guesses about who they are, no jokes or teasing, no comparing viewers. A viewer is thanked at most once in 5 minutes.
- **Prompts and room files**: the prompts are shared by every room: [`chat-bot/talk.md`](chat-bot/talk.md) for talking unprompted, [`chat-bot/song-id.md`](chat-bot/song-id.md) for `/识歌` with Claude ([`song-id-web.md`](chat-bot/song-id-web.md) with Codex) and [`chat-bot/gift-thanks.md`](chat-bot/gift-thanks.md) for thanking big givers, besides `prompt.md`. What's particular to a room goes in `data/<房间号>/context.md` (who the streamer is, running jokes, what to mind), which every prompt gets as `{{context}}`; the bot creates it empty when missing. A room can still override a prompt by putting its own `auto_reply.md`, `song_id.md`, `song_id_web.md` or `gift_thanks.md` there. All of these are read every time they're used, so edits apply while the bot runs.
- **Knowing its own settings and commands**: `prompt.md` and `talk.md` get the room's settings as they are now (`{{settings}}`: what an @ costs, screenshots on or off, the talk interval, the gift-thanks threshold, the wake word, and for a mention the asker's balance) and the command list from [`chat-bot/commands.md`](chat-bot/commands.md) (`{{commands}}`: its "The commands" section, read on every use). So a viewer asking what song this is can be pointed to `/识歌`, one asking why nobody thanked them told that thanks are an admin setting, and a streamer asking why the bot is quiet told about the wake word.
- **Not repeating itself**: everything the bot sends goes into the room's `bot_logs.md`, and each @ and its answer into `<user id>/talk.txt`. Every prompt gets the bot's last 40 messages (`{{botTalk}}`), and a mention also the asker's last 10 exchanges (`{{userHistory}}`), with the instruction not to say the same things again. These are plain text rather than resumed Claude Code sessions, which would replay every earlier prompt (transcripts, chat, screenshots) and grow without end.
- **What goes out first**: the bot sends one message at a time (`--send-interval`), from four queues: replies, then system messages (command results), then low-balance notices, then what it says unprompted.

It needs DyHub running with the browser collector and logged in (网页登录) as the bot's account, Claude Code's `claude`, `ffmpeg` and [uv](https://docs.astral.sh/uv/) on `PATH`. The first run downloads the speech models: FireRedASR2-AED (4.7 GB) and FireRedLID (3.5 GB) into `~/.cache/fireredasr2`, fsmn-vad and SenseVoice Small (0.9 GB) into `~/.cache/modelscope` and AST into `~/.cache/huggingface`. From `chat-bot/`:

```sh
pnpm start --room <房间号> --bot-name <the logged-in account's nickname> [--bot-id <its uid>]
```

Other options:

| Option                 | Default                             | What it does                                                                                            |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--port`               | `8757`                              | DyHub's port                                                                                            |
| `--prompt`             | `prompt.md`                         | The prompt template                                                                                     |
| `--history`            | `100`                               | Chat messages remembered and passed as `{{history}}`                                                    |
| `--max-reply`          | `49`                                | Reply length; Douyin's limit is under 50, and `{{maxLength}}` is what's left after `@asker `            |
| `--max-parts`          | `5`                                 | A long answer is split into up to this many messages                                                    |
| `--model`              | `opus`                              | Claude model                                                                                            |
| `--system`             | `你是一个抖音直播间的机器人。…`     | Added to the system prompt; the default says only what follows `弹幕：` is sent                         |
| `--tools`              | `WebSearch,WebFetch,Read,Glob,Grep` | Claude Code's built-in tools, comma-separated; `''` for none. File tools read only `data/<房间号>/chat` |
| `--cost`               | `1`                                 | Diamonds per @mention; `0` makes them free                                                              |
| `--test`               |                                     | Test mode: the same as `--cost 0`                                                                       |
| `--queue`              | `20`                                | Paid questions waiting for Claude; more are dropped and refunded. Low-balance notices don't wait        |
| `--send-interval`      | `10`                                | Seconds between two messages the bot sends; replies first, then system messages, notices, then talk     |
| `--no-asr`             |                                     | Don't transcribe the streamer                                                                           |
| `--transcript-minutes` | `5`                                 | How far back `{{transcript}}` goes                                                                      |
| `--screenshot`         |                                     | Start with screenshots on: send Claude the live video with each question (`/截图` switches it)          |
| `--logs` / `--data`    | `logs/` / `data/`                   | Where logs and balances go                                                                              |
| `--config`             | `config.json`                       | Admins and the starting persona                                                                         |
| `--talk-minutes`       | `0`                                 | Say something to the streamer this often, unprompted; `0` never (`/自动回复间隔` changes it)            |
| `--talk-prompt`        | `talk.md`                           | The prompt for that (a room's own `auto_reply.md` overrides it)                                         |
| `--thanks-threshold`   | `99999`                             | Thank a viewer whose gifts in 5 minutes pass this many diamonds (`/自动谢礼` changes it)                |
| `--wake-words`         | `wake-words.json`                   | Each room's wake word and the default one (`/设置唤醒词` writes this room's)                            |
| `--codex`              | `gpt-6-luna`                        | The Codex model `/识歌` asks first (run `codex login` once); `''` to leave Codex out                    |

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
- in `chat-bot/src`, `core` imports `app` or `adapters`; `app` imports `adapters`; `adapters` imports from `app` anything but `ports.ts`; `app/ports.ts` imports another `app` module; any of them imports `main.ts` or `cli-options.ts`; or two modules there import each other (`import-x/no-cycle`, which doesn't count type-only imports). `core` and `app` may not import `node:*`, `@dy-apps/services` or `winston` either (`@typescript-eslint/no-restricted-imports`): only adapters and the entry touch the outside world

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
