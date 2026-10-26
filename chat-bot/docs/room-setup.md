# 给一个直播间定制机器人

每个直播间的东西都在 `chat-bot/data/<房间号>/` 里，不用改程序。程序只认这些文件的格式，不知道里面写的是什么：歌单、直播时间这些，全写在直播间自己的文件里。

## 文件夹里有什么

```
data/<房间号>/
  room_config.json        直播间设置（见下）
  memory.md               机器人记着的直播间的事，每个提示词都会带上（见「memory.md」）
  personas/<name>.md      这个直播间的人设，可以有好几个，room_config.json 的 persona 选一个（见「人设」）
  artifacts/              下载下来、或者手动放进来的资料（歌单之类）
  tools/<工具文件夹>/      这个直播间给某个工具的资料（can-sing/notes.md、can-sing/songs-transformer.js、schedule/hours.md，见「工具」）
  <用户 id>/note.md       机器人记着的这个人的事（见「memory.md」）
  chat/  bot_logs.md  <用户 id>/talk.txt   机器人自己写的，别手改
```

## room_config.json

机器人启动时会建这个文件，并把下面 `private`、`aliases`、`atTrimStart`、`timeZone`、`tools` 和九个设置的字段都补全（缺的写默认值，`on_sing`、`auto_message`、`download` 这些要你自己写的不补）。

| 字段                         | 作用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `private`                    | `true` 表示私密直播间（观众都显示成 `111111`），见 `AGENTS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `streamer`                   | 主播的昵称和 uid，机器人找到主播后自己写进来，不用填；主播的 `note.md` 按这个 uid 找                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `download`                   | 进直播间时要下载的文件，见下                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `on_sing`                    | 主播开始唱一首歌时，按概率发一条固定的弹幕：`{ "message": "…", "probability": 0.67 }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `auto_message`               | 每隔 `autoMessageIntervalSeconds` 秒原样发一次的弹幕，比如 `"点点关注不迷路"`；改了立刻生效。不写就不发                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `aliases`                    | 机器人在这个直播间的别名，比如 `[{ "name": "Fairy", "heardAs": ["ferry"] }, { "name": "菲瑞", "heardAs": [] }]`，见下                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `streamerNames`              | 观众怎么叫主播，比如 `["茜茜", "茜颜"]`：工具说明和 guidance 里的 `{{streamerNames}}` 换成它。默认 `[]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `atTrimStart`                | 机器人 @ 人时，昵称太长、要缩成前 3 个字时，先从昵称开头去掉的字符串（单推符号），比如 `["⊹꙳𝝑"]`：`⊹꙳𝝑阿拂（吃荷灵咪馊饭版）𝝔⋆₊` 放得下就照原样 @，放不下就 @ 成 `@阿拂（`，而不是 `@⊹꙳𝝑`。可以写好几个，开头连着几个都会去掉，长的先去；去完什么都不剩就保留原昵称。默认 `[]`                                                                                                                                                                                                                                                                                                                                               |
| `timeZone`                   | 主播所在地的时区（IANA 名字，比如 `Asia/Shanghai`、`Asia/Tokyo`、`America/New_York`），默认 `Asia/Shanghai`（北京时间）。提示词里的时间（`{{now}}`、`{{today}}`、弹幕和主播的话前面的时间、`{{botTalk}}` 和 `{{userHistory}}` 里的时间）都按它写，提示词也会说明是哪个时区。聊天记录、对话记录（`chat/*.txt`、`bot_logs.md`、`talk.txt`）也按它写，每行时间后面带上时区（`2026-10-21 08:47:38+08:00`），模型读文件时不用换算；以前写的没带时区的行是本机时间，提示词会告诉模型（`{{recordTimeZone}}`），放进提示词的也会先换算好；写错了会保留上一个有效的值                                                                 |
| `tools`                      | 这个直播间打开的工具，比如 `["can_sing", "too_easy"]`（`docs/commands.md` 的「Tools a room switches on」表）；程序自带的工具（设置、识歌、解题……）不用写。改了立刻生效；写了没有的名字，日志警告 `room_config.json lists a tool there is no definition for`。默认 `[]`                                                                                                                                                                                                                                                                                                                                                       |
| `songBreaks`                 | 除了停顿和说话，还用哪些办法分出一首歌到哪儿结束，按名字写：有 `"lyrics"`（认出一首歌后，拿它的歌词对后面唱的，连着 3 句对不上就算下一首开始了，这期间停顿和说话不算换歌；没认出的歌、网易云没有歌词的歌照旧按停顿）、`"shazam"`（唱的时候 Shazam 认出的伴奏换了歌名就算换歌，同一个歌名之间算一首；要语音服务开着 BackingTitles，`--no-backing-title` 关掉）、`"backingGaps"`（两句唱之间伴奏停了 3 秒以上就算换歌，伴奏一直没停就算一首，中间说话也不算换歌；要语音服务开着 BackingGaps，`--no-backing-gaps` 关掉），越靠前越优先。`[]` 只按停顿和说话。不写就是全部打开。改了立刻生效，见 `src/core/songs/song-breaks.ts` |
| `autoReplyThreshold`         | 自动回复的阈值，`1` 以上关闭（`/自动回复阈值`）。默认 `1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `autoReplyIntervalSeconds`   | 自动回复说话之后安静多少秒（`/自动回复间隔`）。默认 `60`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `autoMessageIntervalSeconds` | 每隔多少秒发一次 `auto_message`（`/自动消息间隔`），和自动回复间隔无关。默认 `0`（关闭）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `thanksThreshold`            | 5 分钟内送礼超过多少钻才谢（`/自动谢礼`）。默认 `99999`（关闭）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `autoSongId`                 | 是否自动识歌（`/自动识歌`）。默认 `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `maliceWatch`                | 是否识别恶意言论（`/识别恶意言论`）。默认 `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `screenshots`                | 是否给模型看直播画面截图（`/截图`）。默认 `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `persona`                    | 机器人在这个直播间演谁：直播间文件夹里的一个人设文件，比如 `"personas/fairy.md"`，见「人设」。不写就用共用的 `chat-bot/prompts/personas/default.md`（一个说话随意的普通观众）                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `solveEffort`                | 解题（`ask_about_puzzle`、`/解题`）让 Codex 想多久：`"medium"`（最多 6 分钟）或 `"high"`（最多 10 分钟）。没有指令，只能改文件，改了立刻生效。默认 `"medium"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `maxReplyParts`              | 回答一个 @ 最多拆成几条弹幕（`/最大回复条数`，1 到 10；`--max-parts`）。默认 `5`；机器人主动接话时总是一条                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

`autoReplyThreshold` 起的九个设置里，八个是管理员能用指令改的：指令改了会写进这个文件，手动改文件也立刻生效，不用重启；`solveEffort` 没有指令，只能手动改文件，也立刻生效。机器人启动时会把缺的字段都补上默认值（别的字段原样保留）；启动参数（比如 `--auto-reply-threshold 0.66`）只在文件里还没有这个字段时才用来补，文件里已有的值优先，不一样时会在日志里警告 `setting from room_config, ignoring option`。

### aliases：机器人的别名

主播和观众不一定叫机器人账号的昵称。`aliases` 里写他们实际怎么叫它：每个是 `name`（名字）和 `heardAs`（语音识别还会写成的样子，没有就写 `[]`，不写也是 `[]`）：

```json
"aliases": [
  { "name": "Fairy", "heardAs": ["ferry"] },
  { "name": "菲瑞", "heardAs": [] }
]
```

弹幕或主播的话里叫了机器人（账号昵称，比如「默认关闭」，或者某个别名），就像 @ 了它一样直接交给 Claude 回，不等 Jev 打分、也不经过 Codex，不等 20 秒一次的检查和安静间隔；之后的检查不会再看这一句。Claude 看出不是在叫它（名字碰巧出现在别的意思里、语音识别听错了），或者只是「谢谢」这种收尾的话，可以不回（日志 `claude skipped`）。

- 弹幕：要原样包含名字（英文字母不分大小写，`FAIRY` 也算 `Fairy`）；`heardAs` 和同音字都不算。
- 主播的话（语音识别）：名字或 `heardAs` 里的写法（不分大小写）都算；全是汉字的名字按拼音比，同音、近音（zh/z、n/l、-ng/-n 这些容易混的）也算，比如「默认关壁」算「默认关闭」。
- 别名也会写进回答 @ 的提示词、Jev 的问题和挑人的提示词里，告诉模型这些名字就是机器人。
- 只在自动回复开着的时候起作用（`/自动回复阈值` 小于 1），不会把它打开。
- 文件改了立刻生效，不用重启。程序里不写任何直播间的别名。
- 日志里 `name called`（哪个名字、谁、哪句话、弹幕还是语音）是每次叫到，`claude skipped` 是 Claude 决定不回的，可以用来数误判，见 `AGENTS.md`。

### download：进直播间时下载资料

```json
"download": [
  {
    "url": "https://gh2list.cn/api/public/natsuni",
    "file": "songs.txt",
    "transformer": "tools/can-sing/songs-transformer.js"
  }
]
```

- 每次机器人启动，在后台把 `url` 下载到 `artifacts/<file>`，覆盖旧的。`file` 只能是文件名，不能带路径。
- `transformer`（可选）：直播间文件夹里的一个 JS 脚本。下载下来的内容从标准输入给它，它打印出来的东西才会存进 `<file>`。用来把一大段 JSON 变成提示词能直接用的短列表。脚本在直播间文件夹里用 Node 跑。
- 下载或 transformer 失败，日志里会有 `download failed`，旧文件留着不动。

## 人设

机器人在直播间演谁，由 `room_config.json` 的 `persona` 选：它是直播间文件夹里的一个文件，一般放在 `personas/` 下面。

```json
"persona": "personas/fairy.md"
```

一个直播间可以准备好几个人设（`personas/fairy.md`、`personas/class-rep.md`……），换人设只改这一个字段，马上生效。不写 `persona` 就用共用的默认人设 `chat-bot/prompts/personas/default.md`：一个常来的普通观众，回得短、口语，避开一看就是 AI 的写法（收尾祝福、排比对仗、客服腔）；一个人设都不要，就让 `persona` 指向一个空文件。文件名用英文小写、单词之间用 `-`（`class-rep.md`，不用 `课代表.md`），和仓库里别的文件一样。

人设文件有两种写法：

- **完整的人设**：整个文件就是人设，直接写。
- **在共用人设上改一改**：好几个直播间用同一个人设（比如 Fairy）时，它放在 `chat-bot/prompts/personas/<name>.md`（在 git 里，和 `prompt.md` 这些共用提示词放在一起）。直播间的人设文件开头写一段 `---` 包起来的头，`base` 写共用人设的名字，下面只写这个直播间要改的地方，没有要改的就只写头：

```markdown
---
base: fairy
主播: 咿咿
---

## 身份

- 被派来这个直播间陪主人讲高数，觉得有点屈才。
```

头里除了 `base`，每一行 `名字: 值` 填人设里的一个空：共用人设写「把主播{{主播}}当主人」，这里写 `主播: 咿咿`。没填的空原样留着，日志里会警告一次。

`---` 下面按 `## 小节` 改共用人设：

- 和共用人设同名的小节：整节换成这里写的。
- 同名但下面什么都没写：删掉共用人设里的这一节。
- 共用人设里没有的小节：加在最后。
- 第一个 `## ` 之前的话（「Fairy 的直播间小助手」这种开头）：写了就换掉共用人设的开头。所以有 `base` 的文件不要把一整段完整人设写在 `## ` 前面，那样它会顶掉共用人设的开头，和共用人设的其他小节混在一起。

比如只想去掉 Fairy 的「嘴上嫌弃，心里在乎」、再加一条这个直播间的梗：

```markdown
---
base: fairy
主播: 虾虾
---

## 嘴上嫌弃，心里在乎

## 这个直播间的梗

- 大家叫主播「虾仁」，可以跟着叫。
```

人设文件和共用人设都是每次用都重新读，改了马上生效；机器人自己从不改人设文件。读不到的（文件不在、`base` 找不到、头里有看不懂的行），日志警告一次，读到多少用多少。启动日志 `starting` 里的 `persona` 是拼好之后的完整人设，可以用来核对。

人设不要写所有人设都该有的规矩（别有口头禅、例句别照抄、不透露隐私……）：这些在共用的 `prompt.md` 里，每个直播间都有。

## memory.md

机器人记着的直播间的事：主播是谁、观众怎么叫她、直播什么内容、直播时间、和她互动要注意什么、直播间的梗。每个提示词（回答 @、自动回复、识歌、谢礼……）都会带上它，所以写在这里的东西机器人会当常识。

机器人自己会改它（`update_memory` 工具，只有主播和管理员跟它说时才能改），你也可以手改，改了马上生效。一条一段，条与条之间单独一行 `§`；最多 4000 字，满了机器人会先合并、删旧的再写。适合写在这里的，比如：「这是专门唱欧美歌的直播间，别把『今天都是欧美歌』当新鲜事说」。

每个人还有自己的 `<用户 id>/note.md`（最多 1000 字）：TA 想被怎么叫、爱听的歌、跟机器人说好的事。谁跟机器人说，就记到谁的里面，记不到别人头上。回答或感谢这个人时提示词才带上 TA 的（`{{askerNote}}`）；主播的（按 `room_config.json` 的 `streamer.uid` 找）每个提示词都带（`{{memory}}` 里）。私密直播间分不清观众谁是谁，观众的 note 不写也不读，主播的照常。详见 `docs/commands.md` 的「What the bot remembers」。

## 覆盖共用的提示词

`chat-bot/` 下的提示词（`song-id.md`、`gift-thanks.md`、`song-intro.md`、`solve.md`、`reply-pick.md`、`malice.md`）是所有直播间共用的。在直播间文件夹里放一个同名文件，`-` 换成 `_`（比如 `song_id.md`），就只覆盖这个直播间的。`prompt.md` 不能覆盖。其中 `song-id.md`（`song_id.md`）现在只在歌词搜索（网易云）认不准、改让 Codex 找时才用。

## 工具：打开、配置、给它资料

比如「主播会唱 xxx 吗」「主播什么时候播」。观众不用打 `/`，正常问就行，机器人自己判断这条是不是在问这个。工具是仓库里定义的（`chat-bot/src/mcp/tools/<文件夹>/`：`tool.json` 写说明、规矩和什么话会让它去看，通常还有 `guidance.md` 写怎么回答；字段见 `docs/commands.md`），所有直播间共用。直播间只做三件事：打开哪些工具，给它们资料，需要时看日志。

### 打开

`room_config.json` 的 `tools`：

```json
{ "tools": ["can_sing", "too_easy"] }
```

可以打开的工具在 `docs/commands.md` 的「Tools a room switches on」表里（现在有 `can_sing`、`too_easy`、`wants_topic`、`schedule`）。程序自带的工具（改设置、识歌、解题）一直开着，不用写。改了立刻生效；写了没有定义的名字，日志里是 `room_config.json lists a tool there is no definition for`，那个名字被跳过。

### 资料

工具回答要用的、因直播间而不同的东西，放在直播间自己的文件夹里：`tools/<工具文件夹>/`（文件夹名和仓库里的一样，名字里的 `_` 写成 `-`：`can_sing` 是 `tools/can-sing/`）或 `artifacts/`。工具的 `guidance.md` 用 `{{file:…}}`、`{{file?:…}}` 读它们。

| 工具          | 读的资料                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `can_sing`    | `artifacts/songs.txt`（歌单，也当它的 `mentions` 用，见「例子：歌单」）；`tools/can-sing/notes.md`（可以没有） |
| `schedule`    | `tools/schedule/hours.md`：主播自己写的直播时间                                                                |
| `too_easy`    | 不用                                                                                                           |
| `wants_topic` | 不用                                                                                                           |

- `tools/can-sing/notes.md` 写只有这个直播间要的规矩，一条一行，接在 can_sing 的说明后面给 Claude 读。比如咿咿的：「韩语歌的原唱写的是组合或歌手，组合里成员的 solo 写成「组合 成员」」；虾虾的：「没说完就不说一共几首，改说歌单可以看右下角网址；问的是主播本人时照常说一共几首」。
- `tools/schedule/hours.md` 写直播时间和加场怎么通知，比如缇娅的：

  ```
  主播的直播时间（她主页写的）：「ʚ 固定出没：早7-9，不定时加场群内通知~ ɞ」

  - 固定是每天早上 7 点到 9 点播。
  - 另外会不定时加场，加场在粉丝群里通知；可以顺口提一句进粉丝群就不会错过加场。
  ```

- 和直播间有关的话不写进仓库里的 `tool.json` 和 `guidance.md`：主播的叫法写 `room_config.json` 的 `streamerNames`（说明里用 `{{streamerNames}}`），其余写进这里的文件。

### 用户过滤和固定回复

一个工具的 `tool.json` 可以写 `only` 和 `except`，一个有 `fixedReply` 的工具（比如 `wants_topic`：不用模型，直接回「宝宝，要求主播讲别的需要开会员哦～」，会员不回）直接发这句话。它们写在仓库的 `tool.json` 里，直播间改不了；要换规矩得加一个新工具。

**用户过滤**：`only` 和 `except` 都是条件的列表。观众符合列表里**任意一条**就算符合这个列表；一条条件里写了几个字段，要**全部**符合才算符合这一条。字段：

| 字段        | 意思                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `badge`     | 字符串：名字旁有这个徽章（比如直播间会员的 `V`、`V年`，要完全一样）                                                                            |
| `fansLevel` | 整数（1 以上）：粉丝团（灯牌）等级不低于它。room-feed 说了这是谁的粉丝团（`anchorId`）就只算本直播间主播的，别人的灯牌不算；没说就按这个灯牌算 |
| `payLevel`  | 整数（1 以上）：财富等级（room-feed 的 `user.payLevel`）不低于它                                                                               |
| `admin`     | `true`：主播或机器人管理员（和 `adminOnly` 同一个判断）                                                                                        |

`only` 写了，工具只对符合的人生效；`except` 写了，对符合的人不生效；两个都写要同时满足。不生效的时候，工具回 Claude `skipped`，Claude 对这条什么都不发，日志里是 `skipped by user filter`（`name`、`asker`）。主播自己说的话（语音识别）没有徽章和等级，只有 `admin` 条件能匹配它。

私密直播间里观众没有徽章和粉丝团，`badge`、`fansLevel` 条件永远不匹配（只写这两种的 `only` 在那里等于谁都不生效）；财富等级 room-feed 照发，`payLevel` 照常算；`admin` 和平时一样（那里认不出管理员，见 AGENTS.md「私密 (anonymous) rooms」）。

写错的字段（不认识的字段、类型不对、空列表、空条件）会让这个工具的定义无效，启动时日志里 `skipping a tool definition` 写明哪个文件夹、什么问题，例如 `only condition 2 has an unknown field "level" (use badge, fansLevel, payLevel, admin)`；这是仓库里的文件，测试会拦下。

### 一条弹幕是怎么用上工具的

**没 @ 机器人（自动回复）**，需要 `/自动回复阈值` 小于 1：

1. 每 20 秒看一次新弹幕；匹配某个工具 `listen.trigger`、或者提到它 `listen.mentions` 里的词的弹幕马上看。
2. **Jev** 给每条打分：是不是在跟机器人说话，以及对每个工具问一句「这条是不是 <listen.when>？」。有一项到阈值，或者匹配 `trigger`，就往下走；**说到机器人的分数超过 0.9** 的，直接让 Claude 回，不经过 Codex。
3. **Codex**（`reply-pick.md`）看最近 40 行聊天、机器人最近说的话，和工具在听什么（每个有 `listen` 的工具一行 `- <名字>：<when>`），只决定回不回、回谁。它**看不到**工具的 guidance 和歌单。
   - 只因为某个工具的 `listen` 才送来的弹幕也可以回；Jev 没觉得是这条弹幕在跟机器人说话、也没对上任何工具的，Codex 挑了也会被程序丢掉。
   - `listen` 只写了 `trigger`、没写 `when` 的工具（比如 `wuwa_meme`）不走 2、3 步：弹幕一匹配 `trigger` 就像叫了机器人名字一样马上交给 Claude（带这个工具的提示），Jev 和 Codex 都不知道这个工具；不受自动回复间隔限制，只看弹幕，不看主播说的话。
4. **Claude** 带着工具回答。对上了某个工具 `listen` 的弹幕，`{{asked}}` 里会多一句「程序提示」，说这条可能和哪个工具有关；只是提示，Claude 自己决定调不调。它调用的工具要是有 `guidance`，工具的结果就是 guidance（歌单也在里面），Claude 在**同一次**回答里照着用自己的话回；要是 `fixedReply`，程序直接发这句话（工具回 `sent`），Claude 自己什么都不发。比如「虾虾会吃醋吗」：Claude 调了 `can_sing`，guidance 说歌单里没有这首、看上去不是在问歌就当没调用过，Claude 就照常回答这个问题（要是不是在跟机器人说话，就什么都不发）。

**@ 了机器人**：

1. `/名字` 开头的，直接调用对应的工具（见 `docs/commands.md`），不经过 Claude。这个直播间打开的工具没有 `/` 名字。
2. 否则 Claude 带着工具回答，和上面第 4 步一样（不再有 `trigger` 的快捷方式：@ 匹配了 `trigger` 也由 Claude 决定调不调工具）。

### 新工具要改仓库

一个新的工具是 `chat-bot/src/mcp/tools/<文件夹>/` 里的 `tool.json`（和 `guidance.md`），见 `docs/commands.md` 的「Adding one」。`description` 和 `listen.when` 是 Claude、Jev 和 Codex 读到的，所以：先一句话说清楚问的是什么，再补上容易判断错的情况（比如 can_sing 的写了：观众常用昵称、外号叫主播；弹幕常有错别字；主播正在唱的就是被问的那首才算回答过；机器人刚回答过别的歌单问题，再问新的照常算）。`reply-pick.md` 只有通用的规则，和具体工具有关的都写在 `listen.when` 里。

### 占位符

`guidance.md` 里只有 `{{file:<路径>}}`、`{{file?:<路径>}}` 和 `{{streamerNames}}`：谁问的、问了什么、聊天、主播的话、时间，Claude 已经从 `prompt.md` 里有了，guidance 里不用再写。下面是提示词（`prompt.md`、`song-id.md` 等，直播间可以覆盖其中几个）里能用的占位符，前两个只用在 guidance 里读直播间的文件：

| 占位符                               | 换成                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{file:<路径>}}`                    | 直播间文件夹里那个文件的内容，比如 `{{file:artifacts/songs.txt}}`。读不到就是「（读取失败）」                                                                                       |
| `{{file?:<路径>}}`                   | 和上面一样，但这个直播间没有这个文件时是空的，也不警告：工具的 guidance 用它读直播间自己的补充（`{{file?:tools/can-sing/notes.md}}`）                                               |
| `{{asker}}` `{{question}}`           | 谁问的、问了什么                                                                                                                                                                    |
| `{{asked}}`                          | 一句话说谁 @ 了机器人、说了什么（没 @、是机器人主动接话时，说是在弹幕或直播里说到了它；对上了某个工具的 `listen` 时，再加一句提示是哪个工具）                                       |
| `{{askerBadges}}`                    | 提问的人名字旁边的徽章（直播间会员是 `V`、`V年`），几个就用「、」隔开；没有或者不知道时是 `（无）`                                                                                  |
| `{{botName}}` `{{persona}}`          | 机器人的昵称、人设（拼好的，见「人设」）                                                                                                                                            |
| `{{memory}}`                         | 直播间的 memory.md 和主播的 note.md，各带标题；都没有就是空的                                                                                                                       |
| `{{askerNote}}`                      | 问的人（或被感谢的人）的 note.md，带标题；没有、问的是主播、或者是私密直播间就是空的                                                                                                |
| `{{streamerNames}}`                  | 观众怎么叫主播（`room_config.json` 的 `streamerNames`，用「、」连起来；没写就是「主播」）。工具的 `description`、`listen.when` 和 `listen.trigger` 里也能用，`trigger` 里换成 `主播 | 茜茜 | 茜颜` 这样的几个选项 |
| `{{aliases}}`                        | 一句话告诉模型 `aliases` 里的名字也是在叫它；没有别名时是空的                                                                                                                       |
| `{{intro}}` `{{limitations}}`        | 机器人怎么介绍自己（`intro.md`）、它的限制和原因（`limitations.md`，观众问起时解释用），都是所有直播间共用的                                                                        |
| `{{today}}` `{{now}}` `{{timeZone}}` | 日期和星期（`2026-10-20 星期二`）、时间（`10:30:00`），都是房间 `timeZone` 的时间；时区的名字（`北京时间`，或 `Asia/Tokyo 时间`）                                                   |
| `{{recordTimeZone}}`                 | 本机的时区（比如 `Australia/Sydney`）：以前写的、没带时区的记录是这个时区的，模型自己读到这种行时用来换算                                                                           |
| `{{singleLength}}`                   | 一条弹幕最多多少字（已经去掉了 @ 的长度）                                                                                                                                           |
| `{{maxLength}}`                      | 整个回答拆成几条后，加起来最多多少字（见 `maxReplyParts`）                                                                                                                          |
| `{{history}}`                        | 最近的弹幕，近 5 分钟的礼物也按时间夹在里面                                                                                                                                         |
| `{{transcript}}`                     | 主播最近说的话（语音识别，`（唱）` 是在唱歌）                                                                                                                                       |
| `{{botTalk}}`                        | 机器人最近在直播间说过的话                                                                                                                                                          |
| `{{userHistory}}`                    | 提问的人和机器人以前的对话                                                                                                                                                          |
| `{{chatDir}}`                        | 直播间聊天记录文件（`chat/*.txt`）所在的文件夹，让模型自己去读更早的记录                                                                                                            |
| `{{settings}}`                       | 直播间现在的设置（截图、自动回复、自动谢礼……）                                                                                                                                      |
| `{{forbiddenTopics}}`                | `chat-bot/prompts/forbidden.md` 的 `## Topics`，原样放进来：不能接的话题（会让直播间被封、被限流的），和医疗、自伤这些要怎么回。只有 `prompt.md` 用                                 |
| `{{commonKnowledge}}`                | `chat-bot/prompts/common-knowledge.md` 里的抖音直播常识（灯牌是什么……），带标题；没有就是空的。每个直播间都一样，只放抖音本身的规矩，直播间自己的事写 `memory.md`                   |

`song-intro.md` 还用了一个只在它里面有的：`{{hook}}`（这首歌的介绍要不要加一句钩子，四首里一首，由程序掷骰子）。

### @ 别人

平常的 @（`prompt.md`）里 Claude 回答 `{ "message": "…", "others": [{ "to": "昵称", "message": "…" }] }`：观众说「跟杨叔打个招呼」，`others` 里写杨叔，就只给他发一条 `@杨叔 …`，不 @ 说这话的人，也不回他（`others` 有人时 `message` 不发）。每条发出去以后一分钟里，被 @ 的人（按昵称在最近的弹幕里找到的）再说话，不用经过 Jev 就直接交给 Codex，和提问的人一样。

### 例子：歌单

直播间打开 `can_sing`（`"tools": ["can_sing"]`），把歌单放在 `artifacts/songs.txt`，一行一首，`｜` 分列。每一份前面一行标题，写清是哪份、几首、每行有哪几列，提示词照标题读，不用为这个直播间改提示词：

```
会唱的歌（702 首），每行：歌名、原唱、语言，有的后面还有风格（主播歌单上分的类）；风格里标了「热门必点」的是主播的拿手歌：

晴天｜周杰伦｜国语｜流行、热门必点
Love Story｜Taylor Swift｜英语

还在学的歌（3 首），每行：歌名、原唱、语言：

…
```

- 标题里别用 `｜`：有 `｜` 的行会被当成一首歌。
- 原唱不知道的就空着（`晴｜｜中文`），提示词会让模型只按它确定的去对歌手。
- 有下载地址的直播间，`room_config.json` 的 `download` 每次进直播间下载歌单，`tools/can-sing/songs-transformer.js` 把它变成上面的样子（标题也由它写）。没有下载地址的，就直接把 `songs.txt` 放进 `artifacts/`。
- 歌名不用另外列一份：`mentions` 直接读 `songs.txt` 的第一列，「虾虾会喂猪吗」也知道《喂猪》是歌单里的歌。

## 改了要不要重启

| 文件                                                                                                                                                                                                                                                                                                                                                              | 改了马上生效？   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `memory.md`、`<用户 id>/note.md`、`personas/` 里的人设文件、`chat-bot/prompts/personas/` 里的共用人设、`room_config.json` 的 `persona`、`room_config.json` 的 `tools`、`tools/` 里的资料、`chat-bot/src/mcp/tools/` 里的 `tool.json` 和 `guidance.md`、`room_config.json` 的 `streamerNames`、`artifacts/` 里的文件、`room_config.json` 的 `private` 和 `on_sing` | ✓ 每次用都重新读 |
| `room_config.json` 的 `download`                                                                                                                                                                                                                                                                                                                                  | ✗ 只在启动时读   |

## 看日志确认

在 `logs/chat-bot.log`（或机器人的输出）里：

- `tool definition {"name": …}`：启动时（和改了 `tool.json` 之后）加载了哪些工具；`room config` 里有打开的 `tools`
- `looking now`：一条弹幕匹配了某个工具的 `listen.trigger` 或 `mentions`，马上去看了（只在 `logs/chat-bot.log` 里，机器人输出里没有）
- `picked whom to answer`：Codex 挑了谁
- `trigger matched`：一条弹幕匹配了只有 `trigger` 的工具，直接交给 Claude 了
- `sure about the bot`：Jev 很确定是在跟机器人说话，没经过 Codex 直接回的
- `mcp tool {"tool": "can_sing"}`：Claude 调用了这个工具
- `tool guidance`、`fixed reply`、`skipped by user filter`：工具把 guidance 交给了 Claude、发了固定回复、因为用户过滤没动
- `downloaded` / `download failed`：进直播间时的下载
