# Forbidden words

Words the bot must never say in a room: Douyin quietly holds back a message with one of them, so nobody but the bot's account sees it. Every prompt that writes chat is told them (`{{forbiddenWords}}`, worded in `wording.md`), and the outbox refuses to send a message with one in it (`could not send … forbidden words`), as if sending had failed. One word a line, as `- 词`; this file is read on every use, so an edit applies at once.

- 警
- 编制
