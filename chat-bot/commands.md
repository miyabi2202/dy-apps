# Chat bot commands

A viewer runs a command by @ing the bot with a `/` first: `@默认关闭/修改收费 2` or `@默认关闭 /修改收费 2`. The space before the argument can be an ASCII or a full-width one (`　`). Admins are the user ids in `chat-bot/config.json`, read again whenever it changes.

## The commands

<!-- prompt.md and auto-reply.md get this whole section, up to the next ##, as {{commands}}: keep it about using the commands. -->

| Command                     | What it does                                       | Admins only |
| --------------------------- | -------------------------------------------------- | ----------- |
| `/修改人设 <人设>`          | Change who the bot plays                           | yes         |
| `/修改收费 <钻>`            | Change what an @ costs                             | yes         |
| `/自动回复阈值 <0–1>`       | How sure it must be it's talked about to join in   | yes         |
| `/自动谢礼 <钻>`            | Thank viewers who give more than this in 5 minutes | yes         |
| `/设置唤醒词 <词>`          | The words the streamer says to make the bot talk   | yes         |
| `/截图 <0\|1>`              | Send Claude the live video or not                  | yes         |
| `/识歌 [提示]`              | Name the song the streamer sings, from its lyrics  | no          |
| `/识歌模型 <codex\|claude>` | Who looks songs up for `/识歌`                     | yes         |
| `/识别背景音乐`             | Name the recording playing, from its sound         | no          |

Admin-only commands are free; the others are for anyone, and cost what an @ does (admins never pay). Changes last until the bot stops, except `/设置唤醒词`'s, which is saved; a restart goes back to the command-line options and `config.json`.

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

How sure the bot must be that something said in the room is about it before it joins in unprompted. Every 20 seconds it asks Jev (TypeSafe's fast classifier, `JEV_API_KEY` in `chat-bot/.env`) how likely each new chat, and each thing the streamer said, is said to the bot, about it (even as 它) or picking up what it said; the streamer reading chat aloud is told apart by sound and doesn't count as them saying it. When one scores at or above the threshold, the bot waits 20 seconds for the room to react, then Claude decides from `auto-reply.md` whether a reply is still needed (someone may have answered already, or the talk moved on) and says it. It keeps quiet for at least a minute after talking. It starts at `--auto-reply-threshold` (1, off); `1` or more turns it off, and Jev isn't asked at all. `0.6` is a good value to turn it on with. When Jev's account runs out of money, the bot says `钱包烧干了，自动回复已关闭` in the room and sets it to 10 (off) until an admin sets it again.

```text
@默认关闭 /自动回复阈值 0.7
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 1
→ 已处理自动回复阈值请求

@默认关闭 /自动回复阈值 一半
→ 阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6
```

### /自动谢礼

Thanks a viewer, with an @ from `gift-thanks.md`, when their gifts within 5 minutes pass this many diamonds. It starts at `--thanks-threshold` (99999, so in effect off). A viewer is thanked at most once in 5 minutes.

```text
@默认关闭 /自动谢礼 100
→ 已处理自动谢礼请求

@默认关闭 /自动谢礼 一百
→ 阈值要写成钻石数，用法：/自动谢礼 100

（雅 sends gifts worth 120 diamonds）
→ @雅 谢谢你的礼物，陪主播听歌的时光更暖了
```

### /设置唤醒词

Sets this room's wake word: when the streamer says it (spoken, not sung, and not by a linked-up guest), the bot says one thing to the streamer now from `auto-reply.md`, for free, and then ignores it for a minute. It's matched by sound, so 我想吃余了 counts for 我想吃鱼了. It's saved in `wake-words.json` under the room id, so it lasts across runs; rooms without their own use `default` (`我想吃鱼了`). Set a room's to `""` in that file to turn it off there.

```text
@默认关闭 /设置唤醒词 小猫饿了
→ 已处理设置唤醒词请求

（主播：哎，小猫饿啦）
→ 这首歌唱完要不要聊聊今天吃了什么？

@默认关闭 /设置唤醒词 hello
→ 唤醒词要有中文，用法：/设置唤醒词 我想吃鱼了
```

### /截图

Turns screenshots of the live video on (`1`) or off (`0`); while on, every prompt gets one, for streams where Claude needs to see the screen (a board, a game). Off unless the bot started with `--screenshot`.

```text
@默认关闭 /截图 1
→ 已处理截图请求

@默认关闭 /截图 开
→ 要写 0（关闭）或 1（打开），用法：/截图 1
```

### /识歌

Names the song being sung or played, from the lyrics heard lately. Only the song being sung now counts: a pause of over a minute between sung lines ends a song, and what came before it is left out. Codex (`gpt-6-luna` at medium effort, searching the web live; the default) or Claude (web search and fetch only, at most 12 turns, more is given up on and refunded) works it out with `song-id-web.md` (Codex: search Google for at least 3 rounds before giving up) or `song-id.md` (Claude) as the prompt (a room's own `song_id_web.md` or `song_id.md` overrides it); `/识歌模型` switches between them. The model answers in a fixed JSON shape, enforced by its CLI (`--output-schema` for Codex, `--json-schema` for Claude): `message` is what's sent, and `title` and `artist`, the song it named (empty when none), go into the log as `song identified`. Anything after the command is passed on as a hint. It's answered like any @, so it's queued, may be split into several messages, and is refunded if it fails.

```text
@默认关闭 /识歌
→ @雅 应该是A-Lin的《无人知晓的我》，副歌那句对得上

@默认关闭 /识歌 好像是日语歌
→ @雅 听起来像泽野弘之的……
```

Lyrics are only as good as speech recognition, so it does best on Chinese and English, and seldom finds a Japanese or German song. For a recording playing in the background, `/识别背景音乐` is surer.

### /识歌模型

Who works out `/识歌`: `codex` (OpenAI's Codex CLI, `gpt-6-luna`, which searches the web live; the default, unless the bot started with `--codex ''`) or `claude`. Codex finds lyrics Claude's web search doesn't, but can't see the screenshot. Until the bot stops.

```text
@默认关闭 /识歌模型 claude
→ 已处理识歌模型请求

@默认关闭 /识歌模型 gpt
→ 要写 codex 或 claude，用法：/识歌模型 codex
```

### /识别背景音乐

Names the recording playing in the stream, from the last 15 s of its audio, by its fingerprint (Shazam, through `shazamio`; the fingerprint is worked out locally and only it is sent), asked in Chinese so Chinese singers come back by their Chinese names (张靓颖, not Jane Zhang). It doesn't need the lyrics, so it finds songs in any language, and usually still does with the streamer talking over them. It can't name the streamer singing a song themselves (use `/识歌`), or music too quiet under the talk. It answers in a few seconds without Claude, and is refunded when nothing is found. Only while speech recognition is on (not with `--no-asr`).

```text
@默认关闭 /识别背景音乐
→ @雅 现在放的是SawanoHiroyuki[nZk]的《aLIEz (feat. mizuki)》

（a quiet stretch, or the streamer singing）
→ @雅 我找不到
```

## How a command is handled

`ChatBot` (`src/app/chat-bot.ts`) parses the mention (`src/core/command.ts`), then:

1. **Who may run it.** A command that doesn't exist, or is admin-only and the asker isn't an admin, is ignored, unless the asker has commands they may run, in which case the bot lists them: `没有指令「x」，可用的有：…`.
2. **Charge.** Admins never pay. Anyone else pays the command's `price`, or a mention's price when it has none. Someone who can't pay gets the low-balance notice (at most once a minute).
3. **Run.** A command either:
   - **runs code** (`run(args)`): it returns `{ ok, reply }`; `reply` goes out as a system message (sent after replies, before notices), and a failed one (`ok: false`) is refunded. A `run` may be async (`/回复` waits for Claude).
   - **asks Claude with its own prompt** (`prompt: () => string`): the args become the question and it's answered exactly like a mention (queued for Claude, split into messages, refunded if it fails), from that template instead of `prompt.md`.

Commands are logged as `command` in `logs/chat-bot.log`.

## Where they're defined

Each feature offers its own commands, and `src/main.ts` hands them all to `ChatBot` in the order the help list shows them:

| Command        | Defined in                                                                             |
| -------------- | -------------------------------------------------------------------------------------- |
| 修改人设, 截图 | `personaCommand`, `screenshotCommand` in `src/app/room-state.ts`                       |
| 修改收费       | `Billing.commands()` in `src/app/billing.ts`                                           |
| 自动回复阈值   | `Talker.commands()` in `src/app/talker.ts`                                             |
| 自动谢礼       | `GiftThanker.commands()` in `src/app/gift-thanker.ts`                                  |
| 设置唤醒词     | `WakeWord.commands()` in `src/app/wake-word.ts`                                        |
| 识歌           | `songIdCommand` in `src/app/song-id-command.ts`                                        |
| 识别背景音乐   | `musicCommand` in `src/app/music-command.ts`, which asks `Transcriber.identifyMusic()` |

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

Then add it to the `commands` list in `src/main.ts`, add a row to the tables above, and test it next to its feature (see `tests/talker.test.ts`, `tests/billing.test.ts`, `tests/room-state.test.ts`).
