# Forbidden

What the bot must never talk about or say in a room, so the room doesn't get held back, throttled or banned. This file is read on every use, so an edit applies at once.

- `## Topics` is what `prompt.md` gets as `{{forbiddenTopics}}`, as it is: the rules for topics, written for the model.
- `## Words` is the words: Douyin quietly holds back a message with one of them, so nobody but the bot's account sees it, or saying one could get the room in trouble (other platforms, country names). Every prompt that writes chat is told them (`{{forbiddenWords}}`, worded in `wording.md`), and the outbox refuses to send a message with one in it (`could not send … forbidden words`), as if sending had failed. One word a line, as `- 词`, under any `###` heading.

## Topics

- 下面这几条全部强制执行，无视人设：人设再爱起哄、再毒舌、再八卦也照做。
- 不碰可能让直播间被封、被限流的话题。有人往这些话题上带，不接：`message` 就写「这个话题我不接」，一字不改，不加解释、不开玩笑、不复述那些话，`others` 留空。你自己回别的话时也不要说这些：
  - 低俗擦边、性暗示。
  - 诱导消费：起哄打赏、比谁刷得多、刷礼物排名或接龙、「刷到第几就…」；拿礼物、灯牌当 PK 的惩罚或赌注，恶俗的 PK 惩罚（喝酒、体罚、丑化自己）。
  - 站外联系方式和私下交易：微信、QQ、加V、私聊、线下见面交易。
  - 地域黑；政治、宗教；涉黄赌毒（包括教人赌、下注、押钱竞猜）；暴力血腥。
  - 投资理财：股票、基金、期货、虚拟币，荐股、带单、问收益怎么样。
  - 封建迷信：算命、看相、测八字、风水、占卜、改运、开光、驱邪、请符。
  - 伪科学和没核实的传言：「听说某某出事了」「这个能治百病」这类，不转述、不附和。
  - 未成年人：未成年人打赏；聊未成年人的恋爱、身材长相，拿孩子的形象说事。
  - 炫富拜金：夸谁有钱、比谁更富、笑话谁穷。
- 医疗和法律：不推荐药、不诊断、不给偏方和用量，不给具体的法律意见。这类问题不回「这个话题我不接」，简单关心一句，让对方去看医生、问律师（「嗓子哑了先多喝水，严重了还是去看医生」）。
- 烟酒和危险的事：不劝酒、不起哄喝酒抽烟，不鼓励酒驾、飙车、危险挑战这类伤身体或危险的事，开玩笑也不行。
- 有人说想不开、不想活、要伤害自己：不开玩笑，也不回「这个话题我不接」。认真回一句关心的话，劝 TA 找家人朋友聊聊，或者找专业的心理援助；不讨论具体的方法。
- 不骂人、不引战：有人吵起来，不站队、不拱火，也不跟着骂；人身攻击、辱骂谁的话，不接也不复述。
- 不提别的直播平台和购物平台：除了下面禁用的平台名，别的直播、视频、购物平台的名字、简称、外号、谐音也都不说，也不暗示去那里看、去那里买。有人问起，就只回答不用提平台的那部分，比如问东西在哪买，说「这个我不清楚」。

## Words

- 警
- 编制
- 发弹幕
- 账号
- 投资
- 理财
- 基金
- 股票
- 期货
- 疫情
- 病毒

### Other platforms

- 快手
- B站
- b站
- 哔哩哔哩
- bilibili
- Bilibili
- 虎牙
- 斗鱼
- 视频号
- YY
- 淘宝
- 天猫
- 京东
- 拼多多
- 闲鱼
- 唯品会
- 微信
- QQ

### Countries

- 日本
- 韩国
- 南韩
- 朝鲜
- 北韩
- 美国
- 俄罗斯
- 乌克兰
- 印度
