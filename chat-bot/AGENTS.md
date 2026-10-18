# AGENTS.md (chat-bot)

How to run the chat bot for the user, e.g. when they say 「启动机器人，房间 123」 or 「停掉机器人」. What the bot does and every option are in the [README](../README.md#chat-bot).

## Start

The user gives a room number (the digits in `live.douyin.com/<id>`). Run both processes with the Bash tool's `run_in_background`, never `&` or `nohup`, so they can be stopped later.

1. **Check nothing is running yet**: `lsof -nP -iTCP:8757 -sTCP:LISTEN` and `pgrep -fl "transcribe.py|chat-bot/src/main"`. If DyHub is already up, skip step 2; if a bot is already running, ask before starting a second one.
2. **DyHub**, from `~/coding/dyhub` (the miyabi2202 fork, `main`): `npm run dev`. Wait until `curl -s localhost:8757/api/rooms` answers.
3. **Check the login**: `curl -s localhost:8757/api/cookie` must show `"hasLogin":true` (and `expiresAt` in the future). Without it the bot can't send chat and gifts don't arrive: tell the user to log in from the console at http://localhost:8757 (网页登录) and stop here.
4. **The bot**, from `chat-bot/`:

   ```sh
   pnpm start --room <房间号> --bot-name 默认关闭 --bot-id 7692586790687114297
   ```

   Add `--screenshot` when the stream is a lesson or game where Claude needs to see the video (a board, a question on screen); the user may ask for it. Without it, an admin can still turn screenshots on in the room while it runs: `/截图 1` (and `/截图 0` to turn them off). Every command is listed in [commands.md](commands.md).

   `默认关闭` / `7692586790687114297` is the Douyin account DyHub is logged in as. If the user logged in with another account, get its nickname from them and its uid from the `user.id` of one of its own chat messages (in `logs/chat-bot.log`).

5. **Confirm it's working** from the bot's output, and tell the user:
   - `dyhub ready` within seconds: connected to the room's chat.
   - `transcribing {"url": …}`: DyHub has the stream. If it never comes, the room isn't live.
   - `heard {"text": …}` within about 2 minutes: speech recognition is running (the first sentence waits for the models to load). The first run ever downloads about 10 GB of models first.
   - `gift {…}` lines as viewers send gifts, with their new balance.

## While it runs

- In someone else's room, the bot answers anyone who @s it, in public, as the user's account, and, when turned on (`--auto-reply-threshold 0.6` or `/自动回复阈值 0.6`; off by default), joins in when people talk to or about it without an @ (Jev, with `JEV_API_KEY` in `chat-bot/.env`; at most once a minute). Gift thanks (`--thanks-threshold`, `/自动谢礼`) are off by default too. The wake word is on by default too: if the streamer happens to say `我想吃鱼了`, the bot talks (set the room's id to `""` in `wake-words.json` to turn it off). Say so when starting it there.
- Read `chat-bot/logs/chat-bot.log` (JSON lines: every chat, prompt, answer, gift and transcript line) to answer questions like 「刚才机器人回了什么」 or 「谁送了礼物」.
- The room's chat record is in `chat-bot/data/<房间号>/chat/*.txt`, one line per speech (`[主播](speech)`, or `(sing)` when sung), chat or gift (`[昵称#uid](gift)`), 100 lines a file; it's kept across runs.
- The prompts (`chat-bot/prompt.md`, `auto-reply.md`, `song-id.md`, `song-id-web.md`, `gift-thanks.md`) are shared by every room, and each room's `chat-bot/data/<房间号>/context.md` (background on the room, in every prompt) holds what's particular to it; a room can override a prompt with its own `auto_reply.md`, `song_id.md`, `song_id_web.md` or `gift_thanks.md` there. All are read on every use: edit them to change the bot while it runs, no restart needed. `bot_logs.md` there has everything the bot sent, and `<uid>/talk.txt` each viewer's exchanges with it.
- Balances are in `chat-bot/data/<房间号>/wallet.json` (`gifted` − `spent` per user id) while the bot runs. In a 私密 room they're kept per viewer as below. Don't edit them unless the user asks.

## 私密 (anonymous) rooms

In a 私密 room Douyin hides who viewers are. Every viewer's chat, gift, like and entry comes with:

- user id `111111`, the same for everyone, and no `secUid`;
- the nickname's first character and `***` (`苦***`, `🌈***`);
- the same default avatar (only the CDN host differs);
- their wealth level (`payLevel`), and no fan club.

The bot's own account still comes with its real id and nickname.

How the bot tells viewers apart: set `"private": true` in the room's `data/<房间号>/room_config.json` (created with `false`, read again when it changes, no restart needed). Then `userIdOf` in `src/adapters/dyhub-events.ts` turns id `111111` into `111111-<nickname>-<wealth level>`, like `111111-苦***-31`, and everything keyed by user id (balances, each viewer's talk with the bot, gift thanks) uses that. A viewer's `talk.txt` folder is named by a hash of it (`src/adapters/room-talk-files.ts`). Known limits: two viewers with the same first character and wealth level are one viewer to the bot, and a viewer whose level goes up (by sending gifts) becomes a new one; both are accepted for now. Telling a 私密 room automatically (every viewer coming as `111111`) is for later.

**Every feature must work in a 私密 room, at least in its basics.** When you add or change a feature:

- Key viewers by the user id the adapter gives (never by `111111`, the raw nickname or the avatar), and don't assume ids are digits.
- Don't rely on a viewer's full nickname, avatar, `secUid` or fan club; with only `苦***`, the feature should still do its job (answer an @, thank a gift, charge and refund the right viewer).
- Add a test with 私密 viewers (id `111111`, a `X***` nickname, a wealth level) when the feature handles users.

## Stop

Stop the bot's background task first, then DyHub's (TaskStop), and check with the `pgrep` and `lsof` commands above that no `transcribe.py`, `ffmpeg` or DyHub process is left. Stopping clears every balance (`wallet.clear()` on exit); starting clears them too.

## Troubleshooting

- `transcriber stopped, restarting` now and then is normal (the stream URL expires or the stream drops); it retries every 10 s. If it repeats, `GET localhost:8757/api/rooms/<房间号>/stream` shows whether DyHub still has a stream.
- `reply did not show up in the room chat`: Douyin may be throttling the account; suggest a pause.
- `could not answer mention … claude …`: run `claude -p` by hand to check Claude Code works; the mention was refunded.
- `jev is out of credit, auto-reply off`: the TypeSafe account ran dry; the bot told the room (`钱包烧干了，自动回复已关闭`) and set the threshold to 10. Tell the user to top it up, then an admin can turn it back on with `/自动回复阈值 0.6`.
- `no JEV_API_KEY` at start, or `could not judge` now and then: the bot then only talks unprompted on the wake word. Check `chat-bot/.env` has `JEV_API_KEY` (a TypeSafe key) and that `curl -s -H "Authorization: Bearer $JEV_API_KEY" https://api.typesafe.ai/v1/models` answers.
- `/识歌 … codex failed`: Codex isn't logged in or ran out of quota; `codex login` logs in, and `/识歌模型 claude` switches to Claude meanwhile.
- Changed the code? Run `pnpm typecheck`, `pnpm test` and `pnpm lint` (from the repo root) before restarting it.
