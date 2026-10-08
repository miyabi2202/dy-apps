# 弹幕墙 (danmaku)

Transparent chat overlay for OBS, at `/danmaku`. `?obs=1` shows just the overlay; `?demo=<ms>` starts fake messages; `?port=…&room=…` shows a live room.

## Debug log

The app logs to the browser console with the tag `[danmaku]` (`log.ts`): the start-up settings, the demo starting and stopping, the DyHub connection (connecting, status, retry delay) and the messages reaching the wall. Messages are one line each, the first 8 per second, then a `+N more` summary, so a busy room can't flood the console.

- The dev server (`pnpm dev`) logs at `debug`; a build logs `warn` and up; Jest is silent. Set `LOG_LEVEL=debug` (or `info`, `warn`, `error`, `silent`) to override, e.g. `LOG_LEVEL=debug pnpm build`.
- Chrome hides `console.debug` unless the console's level filter includes Verbose. Filter by `danmaku` to find the lines.
- In dev, React StrictMode mounts twice, so the start-up lines appear twice.
- `?logmsg=1` is the older switch that dumps each whole message object with `console.log`.
