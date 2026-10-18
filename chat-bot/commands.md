# Chat bot commands

A viewer runs a command by @ing the bot with a `/` first: `@默认关闭/修改收费 2` or `@默认关闭 /修改收费 2`. The space before the argument can be an ASCII or a full-width one (`　`). Admins are the user ids in `chat-bot/config.json`, read again whenever it changes.

## The commands

| Command                | Who    | Price                                  | What it does                                                                                           | Says back                                                                           |
| ---------------------- | ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/修改人设 <人设>`     | admins | free                                   | Who the bot plays: prompts get `你的人设是<人设>`                                                      | `已处理修改人设请求`; empty → `人设不能为空，用法：/修改人设 人设`                  |
| `/修改收费 <钻>`       | admins | free                                   | Diamonds per @ (0 = free)                                                                              | `已处理修改收费请求`; not a number → `收费要写成钻石数，用法：/修改收费 2`          |
| `/回复`                | admins | free                                   | Says something to the streamer now, from `talk.md`, whatever's going on                                | The message itself (sent as a reply); nothing to say → `没想好说什么，这次没有回复` |
| `/自动回复间隔 <分钟>` | admins | free                                   | How often the bot talks unprompted (0 = never)                                                         | `已处理自动回复间隔请求`; not a number → usage                                      |
| `/自动谢礼 <钻>`       | admins | free                                   | Thank a viewer whose gifts in 5 minutes pass this many diamonds (99999 by default, so off)             | `已处理自动谢礼请求`; not a number → usage                                          |
| `/截图 <0\|1>`         | admins | free                                   | Screenshots of the live video off (0) or on (1) for every prompt; off by default unless `--screenshot` | `已处理截图请求`; anything else → `要写 0（关闭）或 1（打开），用法：/截图 1`       |
| `/识歌 [提示]`         | anyone | a mention's (`--cost`, or `/修改收费`) | Names the song being sung or played, from `song-id.md` (the hint is passed on)                         | The answer, like a reply to a mention                                               |

The streamer can also run `/回复` by voice, for free, by saying `--wake-word` (`我想吃鱼了` by default; see `src/app/wake-word.ts`).

All changes last until the bot stops; a restart goes back to the command-line options and `config.json`.

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

| Command            | Defined in                                                       |
| ------------------ | ---------------------------------------------------------------- |
| 修改人设, 截图     | `personaCommand`, `screenshotCommand` in `src/app/room-state.ts` |
| 修改收费           | `Billing.commands()` in `src/app/billing.ts`                     |
| 回复, 自动回复间隔 | `Talker.commands()` in `src/app/talker.ts`                       |
| 自动谢礼           | `GiftThanker.commands()` in `src/app/gift-thanker.ts`            |
| 识歌               | `songIdCommand` in `src/app/song-id-command.ts`                  |

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
