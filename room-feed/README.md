# room-feed

One Douyin live room's chat, gifts and likes, read from the room page in Chrome and sent to local clients (the site's overlays, the chat bot) over WebSocket. The streamer's guide is the site's `/room-feed-windows`; the endpoints are in the [repo README](../README.md#room-feed-live-room-events).

```sh
pnpm room-feed login             # from the repo root: log in to Douyin in a Chrome window
pnpm room-feed --room <房间号>    # serve that room on port 8757
```

Options: `--port <n>`, `--chrome <path to Chrome>` when it isn't found, `--headed` to see the room's Chrome window. The login is saved in `data/cookie.json` (not in git) and lasts about two months.

How it works: Chrome opens `live.douyin.com/<房间号>` with the saved login, so Douyin's own page does the signing and risk checks. `room-page.ts` watches the page's WebSocket frames over CDP; those that decode as Douyin push frames (`douyin/proto.ts`) are turned into events (`douyin/normalize.ts`) and sent to every client that asked for their type. Chat is sent by typing into the page's chat box. `room.ts` reopens the page when its push sockets all close, the page closes, or no push frame comes within a minute of opening it, waiting 5 s, 15 s, 30 s, then 60 s between tries in a row.

It started as a cut-down copy of [ymstar/dyhub](https://github.com/ymstar/dyhub), whose MIT licence is in [LICENSE](LICENSE): the protobuf schema, the message normaliser and the room-page code come from there.
