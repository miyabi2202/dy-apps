# Forbidden words

Words the bot must never say in a room: Douyin quietly holds back a message with one of them, so nobody but the bot's account sees it, or saying one could get the room in trouble (other platforms, country names). Every prompt that writes chat is told them (`{{forbiddenWords}}`, worded in `wording.md`), and the outbox refuses to send a message with one in it (`could not send … forbidden words`), as if sending had failed. One word a line, as `- 词`; this file is read on every use, so an edit applies at once.

- 警
- 编制

## Other platforms

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

## Countries

- 日本
- 韩国
- 南韩
- 朝鲜
- 北韩
- 美国
- 俄罗斯
- 乌克兰
- 印度
