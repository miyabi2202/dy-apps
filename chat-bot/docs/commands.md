# Chat bot tools and commands

A viewer runs a command by @ing the bot with a `/` first: `@默认关闭/截图 1` or `@默认关闭 /截图 1`. The space before the argument can be an ASCII or a full-width one (`　`). A `/` without the @ is ordinary chat: the bot never sees it as a command. Each command calls one of the bot's always-on tools (its name is in the table) with no model in between; the same tools, and the ones a room switches on (see below), are what Claude calls when someone asks in words. Admins are the user ids in `chat-bot/config.json`, read again whenever it changes, and the room's streamer once room-feed tells who that is.

## The commands

| Command                | Tool                        | What it does                                                                                   | Admins only | Default     |
| ---------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | ----------- | ----------- |
| `/自动回复阈值 <0–1>`  | `set_auto_reply_threshold`  | How sure it must be it's talked about to join in                                               | yes         | 1 (off)     |
| `/自动回复间隔 <秒>`   | `set_auto_reply_interval`   | How long it keeps quiet after joining in                                                       | yes         | 60          |
| `/自动消息间隔 <秒>`   | `set_auto_message_interval` | Claude says something to the room on its own every this many seconds                           | yes         | 0 (off)     |
| `/最大回复条数 <1–10>` | `set_max_reply_parts`       | How many messages one @'s answer may take                                                      | yes         | 5           |
| `/自动谢礼 <钻>`       | `set_thanks_threshold`      | Thank viewers who give more than this in 5 minutes                                             | yes         | 99999 (off) |
| `/截图 <0\|1>`         | `set_screenshots`           | Send Claude the live video or not                                                              | yes         | 0           |
| `/识歌 [提示]`         | `identify_song`             | Name the song the streamer sings, from its lyrics                                              | no          | –           |
| `/识别背景音乐`        | `identify_bgm`              | Name the recording playing, from its sound                                                     | no          | –           |
| `/点赞 [次数]`         | `press_like`                | Likes the room as the bot's account, 200 unless told, up to 200                                | yes         | –           |
| `/灯牌`                | `send_fans_lamp`            | Sends the streamer today's 粉丝团灯牌 (2 diamonds), joining the 粉丝团 if need be              | yes         | –           |
| `/小心心`              | `send_heart`                | Sends the streamer one 小心心 (1 diamond), at most one every 4 minutes; the only gift it sends | yes         | –           |
| `/解题 [问题]`         | `ask_about_puzzle`          | Answer a question about the puzzle on screen (the answer, a hint, where an attempt went wrong) | no          | –           |
| `/自动识歌 <0\|1>`     | `set_auto_song_id`          | Name the songs the streamer sings, unasked                                                     | yes         | 0           |
| `/识别恶意言论 <0\|1>` | `set_malice_watch`          | @ viewers who keep posting malicious chat                                                      | yes         | 0           |
| `/开心送心 <0\|1>`     | `set_happy_heart`           | Lets the bot send the streamer a 小心心 of its own accord when someone makes it happy          | yes         | 0           |

These tools are always on, as far as their feature is: `identify_song` needs speech and Codex, `identify_bgm` speech. Admin-only commands are for admins and the streamer; the others are for anyone. A command that changes a setting writes it to the room's `data/<房间号>/room_config.json` (one field each, in the table below), so it stays after a restart, and the bot reads that file again whenever it changes: editing the field by hand does the same as the command, with no restart. A command-line option only seeds a room's setting the first time, when its `room_config.json` has no such field; after that the file wins, and an option that differs from it is a `setting from room_config, ignoring option` warning at start.

| Command                | `room_config.json` field     | Default    |
| ---------------------- | ---------------------------- | ---------- |
| `/自动回复阈值 <0–1>`  | `autoReplyThreshold`         | `1`        |
| `/自动回复间隔 <秒>`   | `autoReplyIntervalSeconds`   | `60`       |
| `/自动消息间隔 <秒>`   | `autoMessageIntervalSeconds` | `0`        |
| `/最大回复条数 <1–10>` | `maxReplyParts`              | `5`        |
| `/自动谢礼 <钻>`       | `thanksThreshold`            | `99999`    |
| `/自动识歌 <0\|1>`     | `autoSongId`                 | `false`    |
| `/识别恶意言论 <0\|1>` | `maliceWatch`                | `false`    |
| `/开心送心 <0\|1>`     | `happyHeart`                 | `false`    |
| `/截图 <0\|1>`         | `screenshots`                | `false`    |
| （无指令，只能改文件） | `solveEffort`                | `"medium"` |

When Jev runs out of money the bot sets `autoReplyThreshold` to `10` (off) in the file too. `solveEffort` is how hard Codex thinks for `ask_about_puzzle` / `/解题`: `"medium"` (up to 6 minutes) or `"high"` (up to 10); edit the file, it's read again at once.

### /自动回复阈值

How sure the bot must be that something said in the room is about it before it joins in unprompted. Every 20 seconds it asks Jev (TypeSafe's fast classifier, `JEV_API_KEY` in `chat-bot/.env`) how likely each new chat, and each thing the streamer said, is said to the bot, about it (even as 它) or picking up what it said; the streamer reading chat aloud is told apart by sound and doesn't count as them saying it. For a minute after the bot's answer to someone is sent (or, talking to the room, the streamer, on the stream or from their own account; and anyone an answer @s, found by nickname in the chat), what that person says skips Jev and goes straight to Codex, since a reply to the bot (the next move in 成语接龙, say) often doesn't mention it and Jev can't tell. A line Jev scores above 0.9 as about the bot (`SURE_ABOUT_BOT` in `src/app/replies/auto-reply.ts`) is answered at once, without Codex (logged as `sure about the bot`); asking Codex would only add about 9 seconds. When one scores at or above the threshold, or such a follow-up comes, Codex (`gpt-6-luna` at medium effort, no web search, about 9 seconds) picks from `reply-pick.md` whom to answer, each with a confidence from 0 to 1, shown what the tools listen for (their `listen.when`, see [Listening without an @](#listening-without-an-)), and only those at the threshold or more are answered: of what was said since, the lines that still need an answer (none when someone answered already or the talk moved on; at most 3, one per person). Each is answered like an @ from that person, with `prompt.md` (telling Claude they didn't @ it) and the tools, their own past exchanges, and an @ in front, split like an @'s answer (`/最大回复条数`); the streamer's spoken lines are answered as theirs, by the uid room-feed found. Without Codex (`--codex ''`) this is off whatever the threshold, and the bot warns of it at start. It keeps quiet for at least a minute after talking (`/自动回复间隔` changes that). It starts at `--auto-reply-threshold` (1, off); `1` or more turns it off, and Jev isn't asked at all. `0.6` is a good value to turn it on with. When Jev's account runs out of money, the bot says `钱包烧干了，自动回复已关闭` in the room and sets it to 10 (off) until an admin sets it again.

```text
@默认关闭 /自动回复阈值 0.7
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 1
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 一半
→ 阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6
```

### /自动回复间隔

How many seconds auto-reply keeps quiet after it answered someone unprompted: what's said meanwhile is looked at once it's over. It starts at `--auto-reply-interval` (60). `0` doesn't wait, for a busy room: it still looks only every 20 seconds (at once for a tool's listen trigger), and the outbox still sends one message every `--send-interval` seconds. @s are never held back by it.

```text
@默认关闭 /自动回复间隔 0
→ 已处理自动回复间隔请求

@默认关闭 /自动回复间隔 半分钟
→ 间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20
```

### /自动消息间隔

Every this many seconds, Claude looks at the room (what the streamer said lately, the recent chat, what the bot said lately, the room's memory and persona) with `prompts/auto-message.md` (a room overrides it with its own `auto_message.md`) and says one message of its own, unprompted, after any waiting @ answer; or nothing, when there's nothing worth saying (`auto message: nothing to say`). `0`, the default, turns it off. The first one is asked one interval after it's turned on (or the bot starts with it on), and the next is counted from when Claude answered, so it never asks twice at once. It has nothing to do with `/自动回复间隔`. The log has `claude asking` / `claude answered` with `task: "auto-message"`, and `auto message {text}` for each sent.

```text
@默认关闭 /自动消息间隔 300
→ 已处理自动消息间隔请求

@默认关闭 /自动消息间隔 0
→ 已处理自动消息间隔请求
```

### /最大回复条数

The most messages anything the bot says is split into, `@昵称 (1/3) …` (`(1/3) …` when it's to nobody in particular), sent one every `--send-interval` seconds: @ answers and unprompted ones, gift thanks, command results, song names. The prompts still ask for one message; this is for when Claude writes more. For an @'s answer, Claude is also told that much less room, so it writes less rather than being cut off. It starts at `--max-parts` (5).

```text
@默认关闭 /最大回复条数 2
→ 已处理最大回复条数请求

@默认关闭 /最大回复条数 十
→ 条数要写成 1 到 10 的整数，用法：/最大回复条数 3
```

### /自动谢礼

Thanks a viewer, with an @ from `gift-thanks.md`, when their gifts within 5 minutes pass this many diamonds. It starts at `--thanks-threshold` (99999, so in effect off). It waits 15 seconds first, so a combo is thanked once, for everything in it. What a viewer sends after a thanks counts afresh, and is thanked again once it passes the threshold too.

```text
@默认关闭 /自动谢礼 100
→ 已处理自动谢礼请求

@默认关闭 /自动谢礼 一百
→ 阈值要写成钻石数，用法：/自动谢礼 100

（雅 sends gifts worth 120 diamonds）
→ @雅 谢谢你的礼物，陪主播听歌的时光更暖了
```

### /截图

Turns screenshots of the live video on (`1`) or off (`0`); while on, every prompt gets one, for streams where Claude needs to see the screen (a board, a game). Off unless the bot started with `--screenshot`. With a screenshot, Claude also gets a `zoom` tool (`src/adapters/models/zoom-mcp.ts`, an MCP server that crops and enlarges a region with ffmpeg), so it can read small figures and text. For a puzzle on the screen, `/解题` does better.

```text
@默认关闭 /截图 1
→ 已处理截图请求

@默认关闭 /截图 开
→ 要写 0（关闭）或 1（打开），用法：/截图 1
```

### /识歌

Names the song being sung or played, from the lyrics heard lately, whoever's voice sang them; when most of them were another voice's than the streamer's (a 连线, a recording, or the streamer taken for someone else), the answer ends asking so (`song-others` in `wording.md`). Only the song being sung now counts (`currentSong` in `src/core/songs/transcript.ts`): a song ends at a pause of over a minute between sung lines, or of over 15 s in which the streamer said at least 2 lines (talk between songs), and what came before it is left out. Once a song is named (by any path: Shazam, the lyrics search or Codex), its lyrics are fetched from NetEase (the first 3 versions of the title with lyrics, the singer's first) and only they end it: from when it was asked about, each sung line of 8 characters or more is matched against them (pinyin pairs, half of them in the lyrics), and 3 misses in a row start the next song at the first of them, whoever's voice sang them; a later line of 12 characters or more, 70% from the lyrics, undoes that (garbled lines, or talk taken for singing). Pauses and talk don't end it meanwhile; a song not named yet, or one NetEase has no lyrics for, goes by them as before. This is the first song break source (`src/core/songs/song-breaks.ts`, `src/app/songs/lyrics-breaks.ts`): a room turns sources off with `songBreaks` in its `room_config.json`. The log has `lyrics kept` (`title`, `artist`, `lines`) or `no lyrics for`, and `song changed` (`by: "lyrics"`, `from`, the `line` the next song starts at, `misses`). Replaying a week of logs (`pnpm replay:song-breaks`), this split 164 of 182 changes between named songs where they happened (14 more a line or so late), against 141 by pauses alone, and 7 of 220 songs by mistake, against 27. Two songs sung straight on that the lyrics don't know (the first wasn't named, or has no lyrics) still aren't told apart, so the prompt says the first lines may still be the last song's and to go by the latest. It asks NetEase's lyrics search first (`lyrics-search/`, about a second): each of the 5 longest sung lines is searched as lyrics and the titles the searches agree on win; when one clearly leads (score at least 1 and 1.5 times the runner-up's) the song is taken from that, and Codex only writes the message (below). The singer is named only when one clearly leads among the lyric hits under that title and the hits of a search by the title itself (at least 40% of their weight), since covers rank high and the original is often missing from the lyrics search; otherwise the answer is the title alone, and Codex isn't asked just for the singer. When the search isn't sure (or NetEase is down: `lyrics search failed`, `netease down`), Codex answers as below, with the search's candidates added to its prompt as hints (`song-candidates`). The log has `lyrics search` (`why`, `ms`, `sure`, `title`, `artist`, `artistShare`, `queries`, `top`) and `song identified` with `by` (`lyrics-search` or `codex`) and `ms`. `--no-lyrics-search` always asks Codex. With under 40 sung characters in the song so far it doesn't ask anyone: it says it has heard only a few lines (and which), or, with nothing sung, that it hears no singing and `/识别背景音乐` may help (`song-too-early` and `song-no-lyrics` in `wording.md`). Each time it asks, the log has `song id asked` first (`why`: `command` for a typed `/识歌`, `tool` for Claude's, `auto` or `retry`; the song's sung `lines` and `chars`; its `first` and `last` sung line). Codex (`gpt-6-sol` at medium effort, set in `src/wiring/songs.ts` rather than by `--codex`, searching the web live) works it out with `song-id.md` as the prompt (search Google for at least 3 rounds before giving up; a room's own `song_id.md` overrides it). It answers in a fixed JSON shape, enforced by `--output-schema`: `message` is what's sent, and `title`, `artist` and `sure`, the song it named (empty when none), go into the log as `song identified`. Without Codex (`--codex ''`) or speech recognition there's no `/识歌`. Anything after the command is passed on as a hint. The message is Codex's own words from `song-id.md`: the title and singer woven into a line of its own, with whatever fits (something it finds searching for the song, a line of the lyrics, who the song was for, the chat's reactions, a joke) or nothing more; one message to the room in four, by the dice, is asked to end with a question anyone can answer about the song or its work, and the rest ask nothing (`song-hook` / `song-no-hook`). It only sees the lyrics as transcribed, not the voice, so it doesn't judge the singing. When Shazam or the lyrics search named the song, Codex is still asked (for `/识歌` and `/自动识歌`, not for Claude's `identify_song`, whose own reply is the message), told the song (`song-known`), only to write the message (`song message` in the log, with `named`: whether it had the title); its sentence (`song-found`) goes out instead when Codex fails, leaves the title out, or the song was mostly another voice's.

```text
@默认关闭 /识歌
→ @雅 应该是A-Lin的《无人知晓的我》，副歌那句对得上

@默认关闭 /识歌 好像是日语歌
→ @雅 听起来像泽野弘之的……
```

Lyrics are only as good as speech recognition, so it does best on Chinese and English, and seldom finds a Japanese or German song. For a recording playing in the background, `/识别背景音乐` is surer.

### /自动识歌

Has the bot name the songs the streamer sings without anyone asking, as `/识歌` would, and say it in the room (no @). It counts the streamer as singing when, in the last minute, at least 3 of their lines were sung and those are at least 70% of their lines (singing ran 75–100% a minute, talk at most 40–60%). Once a song has 40 sung characters it's named (speech recognition cuts singing into short pieces, so lines say little); while the streamer goes on singing, with no pause that ends the song (see `/识歌`), it's named again every 3 minutes, for the next song. When the model isn't sure, it asks again about the same song once the song's lyrics are twice as long as last time, twice at most; once a pause or talk ends the song, the next one is asked about on its own instead. Only a song the model is sure of is said: its answer has `sure: true` only once it has checked the lyrics, and a guess (「听着像…不太确定」) isn't said. A song told to the room within the hour (by this or by `/识歌`) isn't told again: the question names the last song told and when, and the model says nothing when it's still that one (however the version is written) unless it's correcting what it said, and then it looks again after 1 minute instead of 3. A song it names is followed by the same up to two messages as with `/识歌`. It uses `/识歌`'s lyrics search, model and prompt, with the question saying nobody asked. It assumes the background music doesn't get transcribed as the streamer singing. Off unless `--auto-song-id`; until the bot stops. Only while speech recognition is on.

```text
@默认关闭 /自动识歌 1
→ 已处理自动识歌请求
（主播唱了一会儿）
→ 这首是《ひとつのハートで》，原唱三重野瞳！
```

### /点赞

Likes the room as the bot's account, for admins only: `/点赞 300` gives 300 likes, `/点赞` 100 (up to 200, `MAX_LIKES` in `room-feed-protocol`). Asked in words (「帮我点点赞」), Claude calls the tool `press_like`. It asks room-feed (`POST /api/rooms/<id>/like {likes}`) to hold Douyin's like key, z, on the live video: room-feed clicks the player (so the key doesn't go to the chat box), then holds z, a keydown every 100 ms as a held key repeats, until Douyin's counter by the heart (「x22」) adds up to about that many. The counter can start again from 1 partway, so room-feed adds up the runs (`LikeTally` in `room-feed/src/like-tally.ts`); it's give or take a few. Holding gives about 5 likes a second (measured on 2026-10-29), so 200 takes some 40 seconds; when the counter doesn't show, room-feed guesses from the time held at that rate, and never holds longer than 60 seconds. When the page says 手速太快了, Douyin's limit, it lets go at once. It takes turns with the chats, which use the same keyboard.

Liking is done in silence. A typed `/点赞` says nothing; asked in words, the tool's result is `silent`, and the bot sends nothing for that question, @ or not, whatever Claude wrote (`silent after a tool` in the log; any tool can return `silent: true`, `src/app/replies/mention-answerer.ts`). With auto-reply on, it also listens (`listen.when`) for the streamer asking the room for likes (「大家帮我点点赞」「记得点一下赞」, not 「谢谢小雅的点赞」): like any topic, Jev scores her line, the picker (told it's for the streamer and admins only) picks it, and Claude calls `press_like` with the default 100, silently. That takes the 20-second check and the models, so the likes start some 30–40 s after she asks, and later while auto-reply keeps quiet after an answer. With auto-reply off it never listens.

The log has `liked {asker, likes, liked, heldMs, tooFast}` (`liked` is what Douyin's counter added up to), or `could not like`.

### /灯牌

Sends the streamer today's 粉丝团灯牌 as the bot's account, for admins only: one 2-diamond 「灯牌」 a day, which also joins the 粉丝团 when the account isn't in it yet. With fewer than 2 diamonds by 「充值」, room-feed clicks nothing, and the bot says 「钻石不够点灯牌」 itself, even when another tool in the same ask was silent (the log has how many are left). Asked in words (「帮我加个灯牌」「卡灯牌」「加入粉丝团」), Claude calls the tool `send_fans_lamp`. It asks room-feed (`POST /api/rooms/<id>/fans-lamp`), which works the room page like a viewer: it clicks 「关注」 first when the streamer isn't followed yet (untested: the bot's account followed every room it was tried in), then the header's 粉丝团 button, found by its icon since its words take turns with 「今日任务」. The panel (Lynx, in a frame of its own) loads in a few seconds and may open on a 「团等级更新 … 我知道了」 notice, which room-feed closes; then it clicks 「送灯牌」 (「送出粉丝灯牌」 on some accounts), or, when the panel already says 「今日第N位送灯牌」, sends nothing (`already`). It takes turns with the chats and likes, which use the same page.

Either way it's done in silence, like `/点赞`: the bot sends nothing back. It doesn't listen without an @. The log has `fans lamp {asker, result}` (`sent` or `already`), or `could not send the fans lamp`.

### /小心心

Sends the streamer one 小心心 (1 diamond) as the bot's account, for admins only: the only gift the bot sends. Asked in words (「送个小心心」「给主播送个礼物」), Claude calls the tool `send_heart`; one a call, and a tool runs once a question, so 「送三个小心心」 sends one. Asked for another gift (「送个嘉年华」), Claude calls it with that gift in `gift`: nothing is sent, and the tool fails with why (「只能送小心心，送不了嘉年华」), which Claude tells the asker in its own words (`asked for another gift {asker, gift}` in the log). One goes every 4 minutes at most, counted from the last one sent (`HEART_COOLDOWN_MS` in `src/app/tools/heart-gate.ts`, the one clock for every 小心心, a `/开心送心` one too); sooner, the tool fails with 「小心心 4 分钟只能送一次，还要等 N 分钟」 for Claude to put in its own words (`heart too soon {asker, waitMs}`); a typed `/小心心` gets that line as it is. A failure like these beside a silent tool (「先点赞，再送个小心心」) still gets Claude's answer out. The slot is taken as one starts sending, so two asks at once send one, and given back when nothing went (too few diamonds, a failure); it's kept in the bot's memory, so a restart starts afresh. It asks room-feed (`POST /api/rooms/<id>/heart`), which works the room page like a viewer: it clicks the gift bar's 「更多」 (`data-e2e="gifts-switch"`), the search icon at the end of the gift panel's tabs (skipped when the search box is still open), types 小心心, and clicks the result once: a click on a gift tile sends it at once, and the tile turns into 「连击」 then. The diamonds by 「充值」 (`data-e2e="recharge-btn"`) tell whether it went: with less than one, nothing is clicked, and the bot says 「钻石不够送小心心」 itself (the log has how many are left); when they don't drop within 5 s of the click, it's an error. It takes turns with the chats, likes and 灯牌, which use the same page.

Sent, it's done in silence, like `/灯牌`; with too few diamonds, the bot says 「钻石不够送小心心」 itself, and Claude says nothing. The log has `sent heart {asker, diamondsLeft}`, or `could not send a heart`.

### /解题

Answers a question about the math, logic or figure puzzle on the screen (the answer, a hint without the answer, where an attempt went wrong, how one step goes), for anyone. `/解题 问题` calls the tool `ask_about_puzzle` directly (with no question, it wants the answer); asked in words, Claude calls it for such questions and says 「稍等」 meanwhile. The tool takes a screenshot at once, even while `/截图` has them off, and starts Codex's `gpt-6-astra` in the background (no web search, with the `zoom` tool for a closer look at small figures and text) with its own prompt `solve.md` (a room's own `solve.md` overrides it) and the streamer's recent words. How hard it thinks is the room's `solveEffort`: `"medium"` takes up to 6 minutes, `"high"` up to 10; it's read on each call, from `room_config.json` only (no command sets it). The tool returns `started: true` at once, and the bot sends Codex's answer to the asker itself, with an @, when it comes (a typed `/解题` says nothing until then); if Codex fails, or has nothing to say, the asker is told so (`puzzle-failed` and `puzzle-no-answer` in `wording.md`). The prompt has it check several rules against every figure before it answers, and say so when two rules fit or it can't tell. On three test puzzles astra was right every time, in 13–43 seconds (zooming only into the blurry live screenshot), where Claude Opus and Fable (even with a zoom tool) were slower and sometimes wrong. The log has `puzzle answered` (`effort`, `ms`) and `could not answer about the puzzle`.

```text
@默认关闭 /解题 这题选什么
（nothing, until Codex is done）
→ @雅 选A。封闭区域数为492、357、816，每行每列之和均为15。
```

### /识别背景音乐

Names the recording playing in the stream, from the last 15 s of its audio, by its fingerprint (Shazam, through `shazamio`; the fingerprint is worked out locally and only it is sent), asked in Chinese so Chinese singers come back by their Chinese names (张靓颖, not Jane Zhang). It doesn't need the lyrics, so it finds songs in any language, and usually still does with the streamer talking over them. It can't name the streamer singing a song themselves (use `/识歌`), or music too quiet under the talk. It answers in a few seconds without Claude. Only while speech recognition is on (not with `--no-asr`).

```text
@默认关闭 /识别背景音乐
→ @雅 现在放的是SawanoHiroyuki[nZk]的《aLIEz (feat. mizuki)》

（a quiet stretch, or the streamer singing）
→ @雅 我找不到
```

### /识别恶意言论

Watches the chat for malicious messages (insults, attacks on looks or age, and sexual innuendo, including puns like 劳女 for 捞女 and digs dressed up with [比心]), and @s the viewer with `检测到恶意言论` as soon as one of their chats is found malicious. Never flagging an ordinary viewer matters more than catching every one. Jev scores each chat on its own, and only those at 0.5 or more (about 4%) go to Codex (the `--codex` model, medium effort, no web search) with the prompt `malice.md` (a room's own `malice.md` overrides it), the 90 seconds of chat and speech before it, and the viewer's own chat from the last 5 minutes; Codex is told to say no when unsure. On 2000 chats from friendly rooms Codex flagged one, a regular's teasing (感觉她胖了[看]). The streamer and admins are never judged. Each verdict is logged as `malice judged`, each @ as `malice warned`. Off by default; until the bot stops. Needs `JEV_API_KEY` and `--codex`.

```text
@默认关闭 /识别恶意言论 1
→ 已处理识别恶意言论请求
（不*** 发了「主包是劳女[比心]」）
→ @不*** 检测到恶意言论
```

### /开心送心

Lets the bot send the streamer a 小心心 (1 diamond) of its own accord, nobody asking, when someone makes it truly happy (praises it, plays along with it; the streamer sings one beautifully). Only the streamer and admins switch it; while it's on, Claude has the tool `send_happy_heart` in anyone's question, viewers' too, and calls it when it judges it's happy, with a line of why. Being asked for one never counts, however it's put (「夸你了快送个心」): the description tells Claude so, and the 4-minute clock caps what talking it into one could cost. Off, nobody has the tool (`offered` on `BotTool`, asked as each question opens). It's the same 小心心 as `/小心心`, on the same 4-minute clock: one sent either way holds the other off for 4 minutes. Nothing is said about it in the room, sent or not: the result only tells Claude to leave it out of its answer, which goes out as usual (it isn't `silent`, so it doesn't mute the answer). Too soon, too few diamonds or a failure, nothing goes and nothing is said. No daily cap; a restart starts the 4 minutes afresh. The log has `happy heart {asker, why, result}` (`sent` with `diamondsLeft`, `tooSoon` with `waitMs`, `notEnough` with `diamonds`), or `could not send a happy heart`.

```text
@默认关闭 /开心送心 1
→ 已处理开心送心请求
（糖果 唱完一首，说「默认关闭你觉得好听吗」）
→ @糖果 太好听了，副歌那一下我直接起鸡皮疙瘩（and a 小心心 goes, said nowhere）
```

## Tools a room switches on

Besides the tools above, a room can switch on the ones defined in `src/mcp/tools/`, each in a folder of its own. They have no `/` names: Claude calls them when someone asks in words. This table lists them (a test keeps it in step with the folders):

| Tool          | What it does                                                                       | Admins only | Data in the room's folder                                                         |
| ------------- | ---------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `can_sing`    | 主播会唱xxx吗、拿手的、推荐: answers from the song list                            | no          | `artifacts/songs.txt` (also its `mentions`), `tools/can-sing/notes.md` (optional) |
| `too_easy`    | Teases a viewer who calls the puzzle too easy (秒了)                               | no          | –                                                                                 |
| `wants_topic` | A fixed line to a viewer asking for another topic, members excepted                | no          | –                                                                                 |
| `schedule`    | When the streamer streams, from her own hours                                      | no          | `tools/schedule/hours.md`                                                         |
| `wuwa_meme`   | Picks up a 鸣潮 meme (Bon voyage, 至↑此↓间→…), on its trigger alone                | no          | `tools/wuwa-meme/notes.md` (optional)                                             |
| `say_one`     | Sends 「1」 when the streamer asks the room to 扣1 (能理解的打一), from her speech | no          | –                                                                                 |

A room switches tools on by name in its `data/<房间号>/room_config.json`: `"tools": ["can_sing", "too_easy"]`. It's read again whenever the file changes, so no restart is needed; the built-in tools need no listing, and a name no folder defines is warned about (`room_config.json lists a tool there is no definition for`) and skipped. The tools are built in the order the list gives them, after the built-in ones.

A tool's folder is its name with `-` for `_` (`src/mcp/tools/can-sing/` defines `can_sing`) and holds a `tool.json` and, usually, a `guidance.md`. Both are read again when they change. `tool.json` has these fields, and a field it doesn't know is an error (a typo in the repo should fail loudly):

| Field             | What it is                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`            | The tool's name, lowercase letters, digits and `_`, matching its folder's.                                                                                           |
| `description`     | What Claude reads to decide to call it: what it's for and the fine points of when it is and isn't, ending with what it hands back. `{{streamerNames}}` is filled in. |
| `guidance`        | The file in the folder (`guidance.md`) that Claude gets back when it calls the tool. Not with `fixedReply`.                                                          |
| `fixedReply`      | A text the program sends, as it is, to whoever the tool is called for, with no model asked. Not with `guidance`.                                                     |
| `adminOnly`       | `true`: only the streamer and the admins have it in their session.                                                                                                   |
| `only` / `except` | Lists of `{ "badge"?, "fansLevel"?, "payLevel"?, "admin"? }` (a viewer matches a list on any entry, an entry on all its fields); see [room-setup.md](room-setup.md). |
| `listen`          | What it listens for in the room without an @ (below): `{ "when", "trigger"?, "mentions"? }`, or `{ "trigger" }` alone.                                               |

A guidance tool returns the text of its `guidance.md` to Claude, which answers from it in the same turn, in its own words: the guidance says how, and has the room's data in it, with each `{{file:<path>}}` in it replaced by that file in the room's folder (`{{file:artifacts/songs.txt}}`), each `{{file?:<path>}}` the same but empty when the room has no such file (`{{file?:tools/can-sing/notes.md}}`), and `{{streamerNames}}` by what viewers call the streamer. Nothing else is filled in: Claude already has who asked, what, the chat, the transcript and the time from `prompt.md`. A `fixedReply` tool sends its text itself, like an answer (it's added to the viewer's talk record, and the viewer counts as answered), and returns `sent: true` for Claude to say nothing more. A viewer the tool's `only` / `except` leave out gets `skipped: true` and Claude says nothing; each is logged as `skipped by user filter`.

## Listening without an @

A tool may listen for what's said in the room without an @ of the bot: `listen` in its `tool.json` (or a `listen` field on a code tool, `BotTool.listen`).

- `when` is the sentence Jev judges each new line by (「在问主播会不会唱某首歌…」): one score per topic per new line, next to the one for being about the bot.
- `trigger` (a regular expression, `{{streamerNames}}` filled in as `主播|name|…`) and `mentions` (a file in the room's folder of phrases, one a line, or a `｜` table such as a song list, whose first column it uses) make auto-reply look at once instead of at its next 20-second check. They don't pick the tool; they only say the line is surely for it.

A `trigger` with no `when` is a tool that listens for that alone: a chat matching it is answered at once, like one calling the bot by name (Claude gets the tool as a hint and may still say nothing), and Jev and the picker never hear of the tool; the quiet time doesn't hold it back, nor does it start it. The streamer's speech doesn't go through it, and `mentions` needs a `when`. The log has `trigger matched {tools, who, text}`. `wuwa_meme` is one.

`"speech": true` beside such a `trigger` (and a `fixedReply` on the tool) turns it round: the trigger is matched against the streamer's own speech instead of the chat (not sung, not a guest, not her reading the chat out), and when it matches, the `fixedReply` goes out to the room as it is, with no @ and no model, at most once a minute for each tool (`src/app/replies/auto-reply.ts`, `replyToSpeech`). It needs auto-reply on (a threshold below 1). The log has `speech trigger matched {tool, text}`. `say_one` is one: 「能理解的打一」 → 1.

The picker (Codex, shown `reply-pick.md`'s `{{topics}}`) is told these topics, one `- name：when` line for each tool, and a line that matched one (by Jev's score, a trigger or a phrase) ends `→ name` there. The line then reaches Claude with a hint in `{{asked}}` naming the tool(s) (`asked-topics` in `wording.md`): only a hint, Claude still decides, and a tool whose guidance says the line isn't for it is treated as not called. A line Jev scores above 0.9 as about the bot is still answered at once, without the picker; that skip uses the about-the-bot score only, never a topic's.

Which tools listen today: `identify_song` (「这是什么歌」: Claude then picks `identify_song` or `identify_bgm`, by whether the streamer is singing), and the five above. The log has `looking now`, `about the bot`, `sure about the bot`, `picked whom to answer`, `mcp tool {tool}`, `tool guidance {name, asker, userId}`, `fixed reply`, `skipped by user filter` and, at start and whenever a `tool.json` changes, `tool definition {name, folder, adminOnly, listen}`.

## How a command is handled

`ChatBot` (`src/app/replies/chat-bot.ts`) gets every @ of the bot from the bus (a chat without the @ never reaches it), parses a mention starting with `/` (`src/core/commands/command.ts`) and hands it to `ToolRunner` (`src/app/tools/tool-runner.ts`), which:

1. **Finds the tool** with a command by that name. A name no tool has is answered with the commands the asker may run: `没有指令「x」，可用的有：…` (none, nothing said). An admin-only tool from anyone but an admin or the streamer is refused: `你无权调用「截图」指令，只有主播和雅才可以` (雅 is `adminNames` in `config.json`).
2. **Parses** the text after the name into the tool's arguments, or says its usage (`阈值要写成钻石数，用法：/自动谢礼 100`).
3. **Calls the tool** with `direct: true` (a tool may then answer differently: `/识歌` has Codex write the message even for a song Shazam or the lyrics search named) and says its reply, from the command's `say` or, for an error result, the error's text, as a system message (sent after replies, before what the bot says unprompted). A tool that throws is `指令「x」出错了，没有完成`.

Each is logged as `command {name, args, ok, ms}` in `logs/chat-bot.log`.

## Asking in words

Anything said to the bot in words (an @, its name, a line auto-reply lets through) goes to Claude with these same tools in its MCP session, an MCP server in the bot's own process (`src/mcp/`, on 127.0.0.1 and a free port, `--mcp-port`). It is always on: without it Claude could not act on anything said in words, so a server that can't start (a taken port, `could not start` with `EADDRINUSE`) stops the bot at start. Claude reads each tool's description, calls the one that fits (「识别一下背景音乐」, 「把截图打开」, 「以后 100 钻以下的礼物不用谢了」) and answers in its own words from the result. A tool marked `adminOnly` (`BotTool` in `src/app/ports.ts`) is left out of anyone else's session: they don't see it, and `prompt.md` tells Claude to say it can't be done and who can. Each tool runs at most once per question, and each question gets a token of its own, which stops working when the answer is done. The tools a room switches on are in the same list, beside the built-in ones; they have no `/` names, and a guidance tool's text comes back to Claude, which answers in the same turn (`tool guidance` in the log). The log has `mcp server listening {port}`, `mcp tool {tool, asker, userId, ms, isError}` and, in `claude answered`, `tools: [{tool, ms, isError}]`.

## What the bot remembers

`update_memory` (`src/mcp/update-memory.ts`) has no `/` name: Claude calls it when something said is worth keeping past this question. It writes one of two kinds of file, both read on every use and editable by hand:

- the room's `data/<房间号>/memory.md` (`scope: "room"`): running jokes, the room's rules, who the regulars are. Only the streamer and admins can change it; anyone else's call says so. It's in every prompt as `{{memory}}`, together with the streamer's note.
- one person's `data/<房间号>/<user id>/note.md` (`scope: "note"`), next to their `talk.txt`: what to call them, songs they like, what they agreed with the bot. The program picks the file from who asked, so nobody writes into someone else's. A viewer's note is in the prompts that answer or thank them (`{{askerNote}}`); the streamer's (by `room_config.json`'s `streamer.uid`, or room-feed's word once it has it) is in every prompt, as viewers ask about them. In a 私密 room viewers can't be told apart, so their notes are neither written nor read; the streamer's still is.

Each file is entries with a `§` line between them. The tool can `add` an entry, `replace` a piece of text (which must appear in exactly one place) or `remove` the entry holding it. `memory.md` holds at most 4000 characters, a note 1000, the streamer's note 2000 (it's in every prompt, like `memory.md`; `src/core/memory/memory-text.ts`); a change past that fails with a message telling Claude to merge or drop entries first. Memory may hold a word from `forbidden-words.json`: it only goes into prompts, and the word is swapped in anything the bot sends. The tool's description tells Claude what to keep (what lasts and the person wouldn't mind) and what not (moods, anyone's private life, what someone says about someone else, topics that get rooms banned), and `prompt.md` lets it say 「记下了」 only after the tool said so. The log has `memory updated {scope, action, asker, userId, content, old, used}`.

### Reading the chat into memory

Most of what's worth knowing about regulars is in their chat with each other, not in what they say to the bot. `pnpm remember` (with the same `--room`, `--bot-name`, `--bot-id` and `--data` as the bot; `src/remember.ts`, `src/app/memory/remember-chat.ts`) reads the room's chat record since it last ran (`data/<房间号>/memory_read.txt`; the last 12 hours the first time) and asks Claude, with no tools:

- for each viewer who sent at least 5 chats since then, 8 a question, with their own chats and their note: changes to their note (`remember-notes.md`). Not in a 私密 room, and never the bot's or the streamer's chat;
- once for the whole stream (the streamer's speech and everyone's chat, songs sung left out), with `memory.md` and the streamer's note: changes to both (`remember-room.md`).

The changes are the tool's add / replace / remove, checked the same way (the limits; one that fails is skipped, `memory change skipped {why}`), and logged as `memory updated {…, by: "chat"}`; a viewer Claude names that it wasn't asked about writes nowhere. `remembered {lines, viewers, changes, failed}` ends a run; the mark moves on only when every question was answered, so a failed run is read again next time. On 咿咿's room, a 394-line stream took three questions and 35 seconds.

## Where they're defined

Each tool is a `BotTool` in `src/mcp/`; `src/wiring/mcp.ts` lists them, in the order the help shows them. The ones a room switches on are folders in `src/mcp/tools/`, built by `src/mcp/declarative-tools.ts` and loaded by `src/adapters/files/tool-files.ts`.

| Tool                       | Defined in                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `set_auto_reply_threshold` | `numberTool` (`src/mcp/setting-tools.ts`), listed in `src/wiring/mcp.ts`                                       |
| `set_auto_reply_interval`  | `numberTool`, listed in `src/wiring/mcp.ts`                                                                    |
| `set_max_reply_parts`      | `numberTool`, listed in `src/wiring/mcp.ts`                                                                    |
| `set_thanks_threshold`     | `src/mcp/set-thanks-threshold.ts`                                                                              |
| `set_screenshots`          | `onOffTool` (`src/mcp/setting-tools.ts`), listed in `src/wiring/mcp.ts`                                        |
| `identify_song`            | `src/mcp/identify-song.ts`                                                                                     |
| `identify_bgm`             | `src/mcp/identify-bgm.ts`, which asks `Transcriber.identifyMusic()`                                            |
| `press_like`               | `src/mcp/press-like.ts`, which asks room-feed's `POST …/like`                                                  |
| `send_fans_lamp`           | `src/mcp/fans-lamp.ts`, which asks room-feed's `POST …/fans-lamp`                                              |
| `send_heart`               | `src/mcp/heart.ts`, through `HeartGate` (`src/app/tools/heart-gate.ts`), which asks room-feed's `POST …/heart` |
| `send_happy_heart`         | `src/mcp/happy-heart.ts`, through the same `HeartGate`                                                         |
| `ask_about_puzzle`         | `src/mcp/ask-about-puzzle.ts`                                                                                  |
| `set_auto_song_id`         | `onOffTool`, listed in `src/wiring/mcp.ts`                                                                     |
| `set_malice_watch`         | `onOffTool`, listed in `src/wiring/mcp.ts`                                                                     |
| `set_happy_heart`          | `onOffTool`, listed in `src/wiring/mcp.ts`                                                                     |
| `can_sing`                 | `src/mcp/tools/can-sing/` (`tool.json`, `guidance.md`)                                                         |
| `too_easy`                 | `src/mcp/tools/too-easy/` (`tool.json`, `guidance.md`)                                                         |
| `wants_topic`              | `src/mcp/tools/wants-topic/` (`tool.json`)                                                                     |
| `say_one`                  | `src/mcp/tools/say-one/` (`tool.json`)                                                                         |
| `schedule`                 | `src/mcp/tools/schedule/` (`tool.json`, `guidance.md`)                                                         |

## Adding one

A `BotTool` in `src/mcp/` with `commands: [{ name, parse, say }]` for its `/` name, listed in `src/wiring/mcp.ts`; a setting is a few lines with `onOffTool` or `numberTool`:

```ts
onOffTool({
  name: 'set_muted',
  command: '静音',
  description: '开关静音：开着时机器人不主动说话。有人要它安静或要它说话时调用。',
  get: () => muted.on,
  set: (on) => (muted.on = on),
  log,
}),
```

Then add a row to the table at the top (the `/` name and the tool's name; a test keeps it in step with the tools), and test it in `tests/mcp/` (see `tests/mcp/setting-tools.test.ts`).

A declarative tool, one a room can switch on, is a folder in `src/mcp/tools/` with a `tool.json` (and a `guidance.md` unless it has a `fixedReply`); add a row for it to the table in [Tools a room switches on](#tools-a-room-switches-on) (a test checks that the table and the folders agree), and a room switches it on in its `room_config.json`. Put nothing about one room in it: what differs per room goes in `data/<房间号>/tools/<folder>/` (or `artifacts/`) and is read with `{{file:…}}` in the guidance.
