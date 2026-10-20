# Chat bot

A bot that sits in a Douyin live room as an ordinary viewer's account and talks in the chat, answered by Claude. What it does there:

- **Answers whoever @s it**: questions about the stream, the songs, the streamer, or anything else (with web search). Each @ is paid for with the gifts the asker sent the streamer, or free (`--cost 0`, `/修改收费 0`).
- **Joins in without an @** when people talk to or about it (`/自动回复阈值 0.6`; off by default).
- **Answers questions about the room**, such as 「主播会唱晴天吗」 or 「几点开播」, from the room's own files, like its song list and streaming times. Viewers just ask in the chat.
- **Names the songs the streamer sings** (`/识歌`, or every song with `/自动识歌 1`) and says something short about each.
- **Thanks big givers** with a message about their gift (`/自动谢礼 499`), and **works out puzzles on screen** (`/解题`).

To use it:

1. Start DyHub, logged in as the bot's account, and start the bot for a room: `pnpm start --room <房间号> --bot-name <its nickname>` (more under [Start](AGENTS.md#start)).
2. In the room, an admin (the streamer, or anyone in `config.json`) turns features on and off by @ing the bot with a command. The commands are listed in [`commands.md`](commands.md).
3. To fit it to one room, put that room's details in its `data/<房间号>/` folder, with no code changes: who the streamer is (`context.md`), a song list, commands only that room has, a message for when she sings. How is in [`docs/room-setup.md`](docs/room-setup.md).

Every option, and how each part works, are in the [repo README](../README.md#chat-bot).
