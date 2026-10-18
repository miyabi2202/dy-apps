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

- In someone else's room, the bot answers anyone who @s it, in public, as the user's account, and, when turned on (`--talk-minutes`, `/自动回复间隔`), says something unprompted every few minutes; gift thanks (`--thanks-threshold`, `/自动谢礼`) are off by default too. The wake word is on by default, though: if the streamer happens to say `我想吃鱼了`, the bot talks (set the room's id to `""` in `wake-words.json` to turn it off). Say so when starting it there.
- Read `chat-bot/logs/chat-bot.log` (JSON lines: every chat, prompt, answer, gift and transcript line) to answer questions like 「刚才机器人回了什么」 or 「谁送了礼物」.
- The room's chat record is in `chat-bot/data/<房间号>/chat/*.txt`, one line per speech (`[主播](speech)`, or `(sing)` when sung), chat or gift (`[昵称#uid](gift)`), 100 lines a file; it's kept across runs.
- The prompts (`chat-bot/prompt.md`, `talk.md`, `song-id.md`, `song-id-web.md`, `gift-thanks.md`) are shared by every room, and each room's `chat-bot/data/<房间号>/context.md` (background on the room, in every prompt) holds what's particular to it; a room can override a prompt with its own `auto_reply.md`, `song_id.md`, `song_id_web.md` or `gift_thanks.md` there. All are read on every use: edit them to change the bot while it runs, no restart needed. `bot_logs.md` there has everything the bot sent, and `<uid>/talk.txt` each viewer's exchanges with it.
- Balances are in `chat-bot/data/<房间号>/wallet.json` (`gifted` − `spent` per user id) while the bot runs. Don't edit them unless the user asks.

## Stop

Stop the bot's background task first, then DyHub's (TaskStop), and check with the `pgrep` and `lsof` commands above that no `transcribe.py`, `ffmpeg` or DyHub process is left. Stopping clears every balance (`wallet.clear()` on exit); starting clears them too.

## Troubleshooting

- `transcriber stopped, restarting` now and then is normal (the stream URL expires or the stream drops); it retries every 10 s. If it repeats, `GET localhost:8757/api/rooms/<房间号>/stream` shows whether DyHub still has a stream.
- `reply did not show up in the room chat`: Douyin may be throttling the account; suggest a pause.
- `could not answer mention … claude …`: run `claude -p` by hand to check Claude Code works; the mention was refunded.
- `/识歌 … codex failed` / `agy failed`: Codex or Gemini (Antigravity's CLI) isn't logged in or ran out of quota; `codex login` or `agy` logs in, and `/识歌模型 gemini` or `/识歌模型 claude` switches meanwhile.
- Changed the code? Run `pnpm typecheck`, `pnpm test` and `pnpm lint` (from the repo root) before restarting it.
