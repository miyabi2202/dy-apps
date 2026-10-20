# Wording

The sentences the program says to the models (Jev, Codex, Claude) around what it fills in, shared by every room and read on every use like the prompts, so edits apply while the bot runs. Each `## name` section is one piece; `{{key}}` is filled in by the program, and a section's text starts after its heading and ends before the next.

## malice-question

这条弹幕是不是在恶意贬低主播或观众：骂人、攻击外貌身材年龄（包括用谐音字、错别字、拼音缩写来绕开屏蔽的说法）、或者性暗示（暗指她私生活乱、陪睡、卖身、有金主、靠男人捞钱这类，配了爱心笑脸表情、装作夸人也算）？朋友间的玩笑、吐槽唱得不好、正常提问都不算。

## aliases-you

直播间里也有人叫你「{{names}}」，语音识别可能把它写成同音、近音的别的字或别的大小写，这些都是在叫你。

## aliases-it

它在这个直播间里还有别的叫法：{{names}}（语音识别可能写成同音、近音的别的字或别的大小写），这些也是在叫它。

## relevance-state

抖音直播间。直播间里有个聊天机器人，账号叫「{{botName}}」，平时只在被 @ 时回答（观众可能叫它机器人、小助手，或用它的人设名）。{{persona}}{{aliases}}[主播]/[连线] 是语音识别，可能有错字；（唱）是歌词。主播习惯把弹幕念出来，念的部分写成「{{readMark}}」。

## relevance-bot

新内容第 ({{n}}) 条和这个聊天机器人有关吗：在对它说话、评论或介绍它（哪怕只用「它/他」指它）、或在接它刚才的话？说到 AI 不一定是指它：AI 歌曲、AI 翻唱、豆包之类别的 AI 都不算，要看上下文。观众之间聊天、对主播说话、主播聊别的，都不算。

## relevance-topic

新内容第 ({{n}}) 条是不是{{when}}？

## pick-commands-head

除了跟它说话的，下面这些问题它也会回答，哪怕不是在跟它说话、也没提到它（每种用一个指令回答）：

## pick-commands-tail

行末标了「→ 指令名」的，是这一条对上了那个指令的关键词，或者提到了那个指令资料里的词（括号里写了是哪个）：多半是这类问题，拿不准也写那个指令名，交给它去判断（它能看到你看不到的资料，不是的话它会什么都不发）。这种也打分，`command` 只写指令名本身（不带括号里的说明）：问得清楚，后面主播和别的观众都还没回答，给 0.8～1；主播自己叫机器人、问它这类问题，也算，给最高；拿不准是不是在问，给 0.3～0.5；已经有人回答了、主播已经在回应了、主播是在回答观众或自言自语，或者同一个问题机器人刚回答过，给 0～0.2。好几个人接连问同一个问题（同一首歌、同一个歌手），只给最后一条打高分，前面的给低分，一个回答就够了。凡是这类问题，哪怕是在跟机器人说话，`command` 也要写那个指令名，不要留空。别的 `command` 都写空字符串。

## asked-speech

主播 {{asker}} 没有 @ 你，是在直播里说到了你（语音识别，可能有错字），你主动回 TA 一句：{{said}}

## asked-chat

{{asker}} 没有 @ 你，是在弹幕里说到了你或在跟你说话，你主动回 TA 一句：{{said}}

## asked-mention

{{asker}} @ 了你：{{said}}

## asked-nothing

（只 @ 了你，没有说别的）

## context

关于这个直播间的背景资料：

{{context}}

## intro

关于你自己（有人问起你是谁、谁做的、能做什么时，照这个回答，口径保持一致，不要编别的）：

{{intro}}

## song-unasked

没人问，是你听到主播在唱歌，主动告诉直播间这首是什么歌（不用 @ 谁）。只有找到歌词核对过、确定是这首时才填 title；不确定或认不出来，title 和 artist 都留空（这次就不会发出去）。

## song-last

你 {{minutes}} 分钟前已经说过这首是《{{title}}》{{artist}}。这次认出来的如果还是这首（哪怕版本、写法不一样），很可能主播还在唱同一首：title 和 artist 照常填，message 留空字符串，不要再说；只有上次说错了、需要更正时才写 message，并说明是更正。
