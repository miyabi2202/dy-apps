# Chat bot commands

A viewer runs a command by @ing the bot with a `/` first: `@默认关闭/修改收费 2` or `@默认关闭 /修改收费 2`. The space before the argument can be an ASCII or a full-width one (`　`). Admins are the user ids in `chat-bot/config.json`, read again whenever it changes.

## The commands

<!-- prompt.md gets this whole section, up to the next ##, as {{commands}}: keep it about using the commands. -->

| Command                | What it does                                       | Admins only | Default     |
| ---------------------- | -------------------------------------------------- | ----------- | ----------- |
| `/修改人设 <人设>`     | Change who the bot plays                           | yes         | none        |
| `/修改收费 <钻>`       | Change what an @ costs                             | yes         | 1           |
| `/自动回复阈值 <0–1>`  | How sure it must be it's talked about to join in   | yes         | 1 (off)     |
| `/自动回复间隔 <秒>`   | How long it keeps quiet after joining in           | yes         | 60          |
| `/自动谢礼 <钻>`       | Thank viewers who give more than this in 5 minutes | yes         | 99999 (off) |
| `/截图 <0\|1>`         | Send Claude the live video or not                  | yes         | 0           |
| `/识歌 [提示]`         | Name the song the streamer sings, from its lyrics  | no          | –           |
| `/识别背景音乐`        | Name the recording playing, from its sound         | no          | –           |
| `/解题 [提示]`         | Work out the puzzle on screen                      | yes         | –           |
| `/拼命解题 [提示]`     | The same, thinking harder                          | yes         | –           |
| `/自动识歌 <0\|1>`     | Name the songs the streamer sings, unasked         | yes         | 0           |
| `/识别恶意言论 <0\|1>` | @ viewers who keep posting malicious chat          | yes         | 0           |

Admin-only commands are free; the others are for anyone, and cost what an @ does (admins never pay). Changes last until the bot stops; a restart goes back to the command-line options and `config.json`.

### /修改人设

Sets who the bot plays: every prompt gets `你的人设是<人设>`. It starts as `persona` in `config.json`.

```text
@默认关闭 /修改人设 爱讲冷笑话的小猫
→ 已处理修改人设请求

@默认关闭 /修改人设
→ 人设不能为空，用法：/修改人设 人设
```

### /修改收费

Sets how many diamonds a viewer pays per @ (and per `/识歌`); `0` makes them free. It starts at `--cost`.

```text
@默认关闭 /修改收费 2
→ 已处理修改收费请求

@默认关闭 /修改收费 两个
→ 收费要写成钻石数，用法：/修改收费 2
```

### /自动回复阈值

How sure the bot must be that something said in the room is about it before it joins in unprompted. Every 20 seconds it asks Jev (TypeSafe's fast classifier, `JEV_API_KEY` in `chat-bot/.env`) how likely each new chat, and each thing the streamer said, is said to the bot, about it (even as 它) or picking up what it said; the streamer reading chat aloud is told apart by sound and doesn't count as them saying it. For a minute after the bot answers someone (or, talking to the room, the streamer, on the stream or from their own account), what that person says skips Jev and goes straight to Codex, since a reply to the bot (the next move in 成语接龙, say) often doesn't mention it and Jev can't tell. When one scores at or above the threshold, or such a follow-up comes, Codex (`gpt-6-luna` at medium effort, no web search, about 9 seconds) picks from `reply-pick.md` whom to answer, each with a confidence from 0 to 1, and only those at the threshold or more are answered: of what was said since, the lines that still need an answer (none when someone answered already or the talk moved on; at most 3, one per person). Each is answered like an @ from that person, with `prompt.md` (telling Claude they didn't @ it), their own past exchanges, and an @ in front, in one message: charged at a mention's price (free for admins and the streamer, whose spoken lines are answered as theirs, by the uid DyHub found), and someone who can't pay is told `你在跟我说话吗？要先给主播送礼：…，送了马上回你` and answered once they send a gift within 5 minutes. Without Codex (`--codex ''`) this is off whatever the threshold, and the bot warns of it at start. It keeps quiet for at least a minute after talking (`/自动回复间隔` changes that). It starts at `--auto-reply-threshold` (1, off); `1` or more turns it off, and Jev isn't asked at all. `0.6` is a good value to turn it on with. When Jev's account runs out of money, the bot says `钱包烧干了，自动回复已关闭` in the room and sets it to 10 (off) until an admin sets it again.

```text
@默认关闭 /自动回复阈值 0.7
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 1
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 一半
→ 阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6
```

### /自动回复间隔

How many seconds auto-reply keeps quiet after it answered someone unprompted: what's said meanwhile is looked at once it's over. It starts at `--auto-reply-interval` (60). `0` doesn't wait, for a busy room: it still looks only every 20 seconds (at once for a room command's trigger), and the outbox still sends one message every `--send-interval` seconds. @s are never held back by it.

```text
@默认关闭 /自动回复间隔 0
→ 已处理自动回复间隔请求

@默认关闭 /自动回复间隔 半分钟
→ 间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20
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

Turns screenshots of the live video on (`1`) or off (`0`); while on, every prompt gets one, for streams where Claude needs to see the screen (a board, a game). Off unless the bot started with `--screenshot`. With a screenshot, Claude also gets a `zoom` tool (`src/adapters/zoom-mcp.ts`, an MCP server that crops and enlarges a region with ffmpeg), so it can read small figures and text. For a puzzle on the screen, `/解题` does better.

```text
@默认关闭 /截图 1
→ 已处理截图请求

@默认关闭 /截图 开
→ 要写 0（关闭）或 1（打开），用法：/截图 1
```

### /识歌

Names the song being sung or played, from the lyrics heard lately. Only the song being sung now counts: a pause of over a minute between sung lines ends a song, and what came before it is left out. Codex (`--codex`, `gpt-6-luna` at medium effort, searching the web live) works it out with `song-id.md` as the prompt (search Google for at least 3 rounds before giving up; a room's own `song_id.md` overrides it). It answers in a fixed JSON shape, enforced by `--output-schema`: `message` is what's sent, and `title`, `artist` and `sure`, the song it named (empty when none), go into the log as `song identified`. Without Codex (`--codex ''`) there's no `/识歌`. Anything after the command is passed on as a hint. It's answered like any @, so it's queued, may be split into several messages, and is refunded if it fails. Once a song is named, Claude may say up to two more messages to the room (no @), whatever fits, from `song-intro.md` (a room's own `song_intro.md` overrides it): something it finds searching for the song, a line of the lyrics, who the song was for, the chat's reactions, a joke, or nothing. It only sees the lyrics as transcribed, not the voice, so it doesn't judge the singing. They're free, and come 30–60 seconds after the song's name.

```text
@默认关闭 /识歌
→ @雅 应该是A-Lin的《无人知晓的我》，副歌那句对得上

@默认关闭 /识歌 好像是日语歌
→ @雅 听起来像泽野弘之的……
```

Lyrics are only as good as speech recognition, so it does best on Chinese and English, and seldom finds a Japanese or German song. For a recording playing in the background, `/识别背景音乐` is surer.

### /自动识歌

Has the bot name the songs the streamer sings without anyone asking, as `/识歌` would, and say it in the room (no @). It counts the streamer as singing when, in the last minute, at least 3 of their lines were sung and those are at least 70% of their lines (singing ran 75–100% a minute, talk at most 40–60%). Once a song has 5 sung lines it's named; while the streamer goes on singing without a pause of over a minute, it's named again every 3 minutes, for the next song. Only a song the model is sure of is said: its answer has `sure: true` only once it has checked the lyrics, and a guess (「听着像…不太确定」) isn't said, nor introduced afterwards. A song told to the room within the hour (by this or by `/识歌`) isn't told again. A song it names is followed by the same up to two messages as with `/识歌`. It uses `/识歌`'s model and prompt, with the question saying nobody asked. It assumes the background music doesn't get transcribed as the streamer singing. Off unless `--auto-song-id`; until the bot stops. Only while speech recognition is on.

```text
@默认关闭 /自动识歌 1
→ 已处理自动识歌请求
（主播唱了一会儿）
→ 这首是《ひとつのハートで》，原唱三重野瞳！
```

### /解题

Works out the math, logic or figure puzzle on the screen (or written after the command), for admins only. It always sends a screenshot, even while `/截图` has them off, and asks Codex's `gpt-6-astra` (at medium effort, no web search, up to 6 minutes, with the `zoom` tool for a closer look at small figures and text) with its own prompt `solve.md` (a room's own `solve.md` overrides it). The prompt has it check several rules against every figure before it answers, and say so when two rules fit or it can't tell. It answers in JSON, so only the answer is sent. On three test puzzles astra was right every time, in 13–43 seconds (zooming only into the blurry live screenshot), where Claude Opus and Fable (even with a zoom tool) were slower and sometimes wrong. Answered like any @.

```text
@默认关闭 /解题
→ @雅 选A。封闭区域数为492、357、816，每行每列之和均为15。
```

### /拼命解题

`/解题` at high effort, with up to 10 minutes, for a puzzle `/解题` got wrong. Admins only.

### /识别背景音乐

Names the recording playing in the stream, from the last 15 s of its audio, by its fingerprint (Shazam, through `shazamio`; the fingerprint is worked out locally and only it is sent), asked in Chinese so Chinese singers come back by their Chinese names (张靓颖, not Jane Zhang). It doesn't need the lyrics, so it finds songs in any language, and usually still does with the streamer talking over them. It can't name the streamer singing a song themselves (use `/识歌`), or music too quiet under the talk. It answers in a few seconds without Claude, and is refunded when nothing is found. Only while speech recognition is on (not with `--no-asr`).

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

## How a command is handled

`ChatBot` (`src/app/chat-bot.ts`) parses the mention (`src/core/command.ts`), then:

1. **Who may run it.** A command that doesn't exist, or is admin-only and the asker isn't an admin, is ignored, unless the asker has commands they may run, in which case the bot lists them: `没有指令「x」，可用的有：…`.
2. **Charge.** Admins never pay. Anyone else pays the command's `price`, or a mention's price when it has none. Someone who can't pay gets the low-balance notice (at most once a minute), and their call waits: a gift from them within 5 minutes pays for it and runs it at once.
3. **Run.** A command either:
   - **runs code** (`run(args)`): it returns `{ ok, reply }`; `reply` goes out as a system message (sent after replies, before notices), and a failed one (`ok: false`) is refunded.
   - **asks Claude with its own prompt** (`prompt: () => string`): the args become the question and it's answered exactly like a mention (queued for Claude, split into messages, refunded if it fails), from that template instead of `prompt.md`.

**Asked for in words.** An admin-only command can also be asked for without the slash, in a mention or in what someone says to the bot unprompted: 「把你的人设改成小猫」, 「以后 100 钻以下的礼物不用谢了」. `prompt.md` answers in JSON (`message`, `command_request`, `command_args`; `src/core/mention-answer.ts`), and when Claude names a command there, `ChatBot.requestCommand` takes over instead of sending its message: an admin's (or the streamer's) runs as if they'd typed `/修改人设 小猫`, and anyone else gets `你无权调用「修改人设」指令，只有主播和雅才可以` (雅 is `adminNames` in `config.json`). Other commands asked for this way just get Claude's reply, since they cost diamonds the mention already paid.

Commands are logged as `command` in `logs/chat-bot.log` (`command requested` for one asked for in words).

## Where they're defined

Each feature offers its own commands, and `src/main.ts` hands them all to `ChatBot` in the order the help list shows them:

| Command                    | Defined in                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 修改人设, 截图             | `personaCommand`, `screenshotCommand` in `src/app/room-state.ts`                       |
| 修改收费                   | `Billing.commands()` in `src/app/billing.ts`                                           |
| 自动回复阈值, 自动回复间隔 | `AutoReply.commands()` in `src/app/auto-reply.ts`                                      |
| 自动谢礼                   | `GiftThanker.commands()` in `src/app/gift-thanker.ts`                                  |
| 识歌                       | `SongId.commands()` in `src/app/song-id.ts`                                            |
| 识别背景音乐               | `musicCommand` in `src/app/music-command.ts`, which asks `Transcriber.identifyMusic()` |
| 自动识歌                   | `AutoSongId.commands()` in `src/app/auto-song-id.ts`                                   |
| 识别恶意言论               | `MaliceWatch.commands()` in `src/app/malice-watch.ts`                                  |

The `Command` type and the `done` / `failed` helpers are in `src/app/command.ts`.

## Adding one

A command that runs code, offered by the feature whose setting it changes:

```ts
// In the feature's class:
commands(): Command[] {
  return [
    {
      name: '静音',
      adminOnly: true,
      price: 0,
      run: (args) => {
        if (args !== '0' && args !== '1') return failed('用法：/静音 1');
        this.muted = args === '1';
        return done('已处理静音请求');
      },
    },
  ];
}
```

A command that asks Claude with its own prompt (put the prompt next to `prompt.md`, read with `liveText` so edits apply at once):

```ts
export function jokeCommand(prompt: () => string): Command {
  return { name: '讲笑话', adminOnly: false, prompt };
}
```

Then add it to the `commands` list in `src/main.ts`, add a row to the tables above, and test it next to its feature (see `tests/auto-reply.test.ts`, `tests/billing.test.ts`, `tests/room-state.test.ts`).
