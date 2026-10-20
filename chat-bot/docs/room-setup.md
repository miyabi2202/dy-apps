# 给一个直播间定制机器人

每个直播间的东西都在 `chat-bot/data/<房间号>/` 里，不用改程序。程序只认这些文件的格式，不知道里面写的是什么：歌单、直播时间这些，全写在直播间自己的文件里。

## 文件夹里有什么

```
data/<房间号>/
  room_config.json        直播间设置（见下）
  context.md              直播间背景，每个提示词都会带上
  artifacts/              下载下来、或者手动放进来的资料（歌单之类）
  additional_commands/    这个直播间自己的指令（见下）
    index.json
    <指令 id>/prompt.md   以及这个指令要用的别的文件（比如下载用的 transformer）
  chat/  bot_logs.md  <用户 id>/talk.txt  wallet.json   机器人自己写的，别手改
```

## room_config.json

机器人第一次进直播间时会建一个 `{ "private": false }`。

| 字段       | 作用                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| `private`  | `true` 表示私密直播间（观众都显示成 `111111`），见 `AGENTS.md`                        |
| `streamer` | 主播的昵称和 uid，机器人找到主播后自己写进来，不用填                                  |
| `download` | 进直播间时要下载的文件，见下                                                          |
| `on_sing`  | 主播开始唱一首歌时，按概率发一条固定的弹幕：`{ "message": "…", "probability": 0.67 }` |

### download：进直播间时下载资料

```json
"download": [
  {
    "url": "https://gh2list.cn/api/public/natsuni",
    "file": "songs.txt",
    "transformer": "additional_commands/can-sing/songs-transformer.js"
  }
]
```

- 每次机器人启动，在后台把 `url` 下载到 `artifacts/<file>`，覆盖旧的。`file` 只能是文件名，不能带路径。
- `transformer`（可选）：直播间文件夹里的一个 JS 脚本。下载下来的内容从标准输入给它，它打印出来的东西才会存进 `<file>`。用来把一大段 JSON 变成提示词能直接用的短列表。脚本在直播间文件夹里用 Node 跑。
- 下载或 transformer 失败，日志里会有 `download failed`，旧文件留着不动。

## context.md

直播间的背景：主播是谁、观众怎么叫她、直播什么内容、直播时间、和她互动要注意什么。每个提示词（回答 @、自动回复、识歌、谢礼……）都会带上它，所以写在这里的东西机器人会当常识。

适合写在这里的，比如：「这是专门唱欧美歌的直播间，别把『今天都是欧美歌』当新鲜事说」。

## 覆盖共用的提示词

`chat-bot/` 下的提示词（`song-id.md`、`gift-thanks.md`、`song-intro.md`、`solve.md`、`reply-pick.md`）是所有直播间共用的。在直播间文件夹里放一个同名文件，`-` 换成 `_`（比如 `song_id.md`），就只覆盖这个直播间的。`prompt.md` 不能覆盖。

## additional_commands：直播间自己的指令

比如「主播会唱 xxx 吗」「主播什么时候播」。观众不用打 `/`，正常问就行，机器人自己判断这条是不是在问这个。

### index.json

```json
{
  "can-sing": {
    "name": "主播会唱xxx吗、有什么拿手的",
    "when": "在问主播会不会唱某首歌，或者会唱哪些歌……",
    "trigger": "会唱|会不会唱|唱不唱|能唱|唱过|会.{0,12}歌吗|歌单里有|有没有.{0,12}歌",
    "prompt": "can-sing/prompt.md",
    "price": 0
  },
  "schedule": { "...": "..." }
}
```

| 字段             | 必填 | 作用                                                                                                                                                                                                                     |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 键（`can-sing`） | ✓    | 指令 id：字母、数字、`_`、`-`                                                                                                                                                                                            |
| `name`           | ✓    | 指令是干什么的，按观众的说法写；有人 @ 机器人时，Claude 在指令列表里看到的是它                                                                                                                                           |
| `when`           | ✓    | 什么时候用它。Jev 和 Codex 判断一条弹幕时只看这一句（见下），**怎么判断全靠它**                                                                                                                                          |
| `prompt`         | ✓    | 回答用的提示词，相对 `additional_commands/` 的路径                                                                                                                                                                       |
| `trigger`        |      | 正则表达式。弹幕匹配上就**马上**交给 Codex 判断（不等下一轮 20 秒的检查），哪怕 Jev 觉得不是                                                                                                                             |
| `price`          |      | 回答一次收多少钻，`0` 免费；不写就和 @ 一样。@ 时先按 @ 的价钱收，用到便宜的指令再退差价                                                                                                                                 |
| `mentions`       |      | 直播间文件夹里的一个文件，一行一个词（比如歌单的歌名）。弹幕里出现其中一个，就和匹配 `trigger` 一样马上交给 Codex，还会告诉 Codex 提到的是哪个词（「提到了它资料里的「喂猪」」），它就知道这是歌单里的歌。每次用都重新读 |

格式不对的指令会被跳过，日志里有 `skipping an additional command` 和原因。

### 一条弹幕是怎么用上指令的

**没 @ 机器人（自动回复）**，需要 `/自动回复阈值` 小于 1：

1. 每 20 秒看一次新弹幕；匹配 `trigger`、或者提到 `mentions` 里的词的弹幕马上看。
2. **Jev** 给每条打分：是不是在跟机器人说话，以及对每个指令问一句「这条是不是 <when>？」。有一项到阈值，或者匹配 `trigger`，就交给 Codex。
3. **Codex**（`reply-pick.md`）看最近 40 行聊天、机器人最近说的话，和每个指令的一行 `- <id>：<when>`，决定回不回、用哪个指令。它**看不到**指令的 prompt.md 和歌单。
   - 只因为某个指令（它的 `when` 或 `trigger`）才送来的弹幕，只能用指令回答；Codex 要是想照常回答它，程序会丢掉，因为 Jev 没觉得这是在跟机器人说话。比如「虾虾会吃醋吗」：歌单里没有《吃醋》，又不是在跟机器人说话，就不回。
4. **Claude** 用指令的 `prompt.md` 回答，@ 提问的人。

**@ 了机器人**：

1. Claude 先用 `prompt.md` 回答，指令列表里有这个直播间的指令（`- <id>（<name>）：<when>`）。它认出是这类问题，就在 `command_request` 写指令 id。
2. 程序换成这个指令的 `prompt.md` 再问一次 Claude，发这次的回答。

### 怎么写 when

`when` 是 Jev 的问题，也是 Codex 判断要不要回的依据，所以：

- 先一句话说清楚问的是什么，再补上容易判断错的情况。比如 can-sing 的 `when` 里写了：
  - 观众常用昵称、外号叫主播，也常省略主语
  - 弹幕常有错别字（「会唱写什么歌」就是「会唱些什么歌」）
  - 主播正在唱的就是被问的那首，才算回答过；唱别的歌不算
  - 机器人刚回答过别的歌单问题，再问新的照常算
- 程序里的 `reply-pick.md` 只有通用的规则（问得清楚、没人回答过就回，别人回答过、重复了就不回），和具体指令有关的都写在 `when` 里。

### prompt.md 里能用的占位符

| 占位符                      | 换成                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `{{file:<路径>}}`           | 直播间文件夹里那个文件的内容，比如 `{{file:artifacts/songs.txt}}`。读不到就是「（读取失败）」 |
| `{{asker}}` `{{question}}`  | 谁问的、问了什么                                                                              |
| `{{botName}}` `{{persona}}` | 机器人的昵称、人设                                                                            |
| `{{context}}`               | 直播间的 context.md                                                                           |
| `{{today}}` `{{now}}`       | 日期和星期（`2026-10-20 星期二`）、时间（`10:30:00`）                                         |
| `{{singleLength}}`          | 一条弹幕最多多少字（已经去掉了 @ 的长度）                                                     |
| `{{history}}`               | 最近的弹幕，近 5 分钟的礼物也按时间夹在里面                                                   |
| `{{transcript}}`            | 主播最近说的话（语音识别，`（唱）` 是在唱歌）                                                 |
| `{{botTalk}}`               | 机器人最近在直播间说过的话                                                                    |
| `{{userHistory}}`           | 提问的人和机器人以前的对话                                                                    |

提示词要让 Claude 按 JSON 回答，只有 `message` 会发出去：在提示词末尾写「按要求的 JSON 格式回答，`message` 是要发送的弹幕」就行，程序会给它 JSON 格式。

### 例子：歌单

`room_config.json` 的 `download` 每次进直播间下载歌单，`additional_commands/can-sing/songs-transformer.js` 把它变成一行一首：

```
会唱的歌（702 首）：

晴天｜周杰伦｜国语｜流行
Love Story｜Taylor Swift｜英语
```

同一个地址再下载一次，用另一个 transformer（`titles-transformer.js`）生成只有歌名的 `artifacts/song-titles.txt`，给 can-sing 的 `mentions` 用，这样「虾虾会喂猪吗」也知道《喂猪》是歌单里的歌。`can-sing/prompt.md` 用 `{{file:artifacts/songs.txt}}` 读进来，告诉 Claude 每行是 `歌名｜原唱｜语言｜风格`、歌单在哪能看、没找到时怎么说。没有下载地址的直播间，就直接把 `songs.txt` 放进 `artifacts/`。

## 改了要不要重启

| 文件                                                                                                | 改了马上生效？         |
| --------------------------------------------------------------------------------------------------- | ---------------------- |
| `context.md`、各个 `prompt.md`、`artifacts/` 里的文件、`room_config.json` 的 `private` 和 `on_sing` | ✓ 每次用都重新读       |
| `additional_commands/index.json`                                                                    | ✗ 只在启动时读，要重启 |
| `room_config.json` 的 `download`                                                                    | ✗ 只在启动时读         |

## 看日志确认

在 `logs/chat-bot.log`（或机器人的输出）里：

- `additional command {"id": …}`：启动时加载了哪些指令
- `looking now`：一条弹幕匹配了 `trigger`，马上去看了（只在 `logs/chat-bot.log` 里，机器人输出里没有）
- `picked whom to answer`：Codex 挑了谁、用哪个指令（`command`）
- `additional command requested`：@ 机器人时 Claude 要用哪个指令
- `downloaded` / `download failed`：进直播间时的下载
