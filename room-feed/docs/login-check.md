# Plan: refuse to run without a working login

Not built yet. We can't test it until a login has actually been rejected, so this is the plan to follow when we can.

## The problem

room-feed decides whether it's logged in only from `data/cookie.json`. `LoginFile.read()` (`src/login-file.ts`) checks the `expiresAt` that was saved when you logged in. Douyin can end a session long before then: you log out elsewhere, the session is kicked from 登录设备管理, or the account has to be verified again. When that happens:

- `main.ts` still prints `已登录，有效期到 …`, and `GET /api/rooms/<id>` still reports `login: { expiresAt }`.
- The page opens logged out. Chat still comes in, but gifts don't, and the first chat the bot sends fails with `找不到弹幕输入框（没有登录、被禁言，或者抖音改版了）`. That error looks the same as being muted or a Douyin page change.

With no saved login at all, room-feed only prints a warning and carries on.

## What it should do

room-feed exits with an error whenever it can't send as the account, unless `--allow-logged-out` is given:

| Case                                            | Today                         | With the change                             | With `--allow-logged-out` |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------- | ------------------------- |
| No `cookie.json`, or its `expiresAt` has passed | warns, runs                   | exits 1 before opening Chrome               | warns, runs               |
| Cookie loaded, but the page is logged out       | runs, and sending fails later | exits 1 once the page shows it's logged out | warns, runs               |
| Logged out partway through (found on a reopen)  | runs, and sending fails       | exits 1, telling the clients why            | warns, runs               |

Every message tells you how to fix it: `登录已失效，请重新运行 pnpm room-feed login`.

## How to tell the page is logged out

These are candidates to check against the real page. Use the first one that proves reliable, and keep a second as a fallback, the same way `checkLive` uses the enter answer first and then the page's 直播已结束.

1. **The enter answer.** `webcast/room/web/enter/` already gets read (`src/douyin/enter-answer.ts`). Its body probably also describes the viewer (`data.user`), with a real `id_str` and nickname when logged in and something empty or anonymous when not. This needs checking: save one body logged in and one logged out as fixtures. If it works, it's the best signal, because it's Douyin's own answer and doesn't depend on the page layout.
2. **The page header.** When logged out, it shows a 「登录」 button where the avatar would be. Put the selector in `src/douyin/page-map.ts`. This is a read-only check (no click or type), so the wait/pause/act rule in `AGENTS.md` doesn't apply.
3. **The chat box (`CHAT_INPUT`) is missing.** Only use this as backup evidence: the box is also missing when muted, or after a page change.

## Changes

- **`src/cli-options.ts`:** add a `--allow-logged-out` boolean to `serve` and to `USAGE` (`不登录也继续运行：只收弹幕，收不到礼物，也不能发弹幕`).
- **`src/main.ts`:** if `loginFile.read()` is null and the flag isn't set, print the error and return 1. Pass to `ChromeRooms` whether a login is expected (`cookie` returned one and the flag isn't set).
- **`src/errors.ts`:** add `LoggedOutError`, next to `RoomEndedError`.
- **`src/room-page.ts`, `LivePage.open`:** after `checkLive()`, if a login was expected, check the signal above and throw `LoggedOutError` when it shows the page is logged out. Use the enter answer when it came, and the header otherwise.
- **`src/room.ts`, `connect`:** treat `LoggedOutError` like `RoomEndedError`: `end(e.message, 'loggedOut')` rather than `reopen`. Retrying won't log it back in. Because it's checked on every open, a logout during the stream is caught on the next reopen.
- **`room-feed-protocol/src/events.ts`:** `RoomGoneReason` gets `'loggedOut'`, so the `__ended` frame tells clients why room-feed stopped. `main.ts` exits 1 for it (only `ended` exits 0).
- **`room-feed-protocol/src/api.ts`:** with `--allow-logged-out`, room info reports `login: { expiresAt, loggedIn: false }` once the page is found logged out, rather than repeating what the file says.
- **chat-bot:** when the `__ended` reason is `loggedOut`, log that it has to log in again, rather than treating it like the stream ending. Check how it handles `__ended` today.

## Tests (no Douyin needed)

- `cli-options`: the flag parses, and it defaults to off.
- `readEnterAnswer` (or a new `readViewer`): the logged-in and logged-out fixtures saved from the real page.
- `Room`: a fake `open` that throws `LoggedOutError` ends the room with `loggedOut`, doesn't reopen, and tells the gone listeners once.
- `main` wiring: no login and no flag means exit 1 without launching Chrome. If that's awkward to test, move the decision into a small function and test that.

## Verifying it for real, when we can

1. Copy `data/cookie.json` to a backup, then end that session from the phone (设置 → 账号与安全 → 登录设备管理). The saved `expiresAt` will still be in the future.
2. Run `pnpm room-feed --room <id> --headed`. Save the enter answer's body and a screenshot of the header. These become the fixtures and the selector.
3. Check that it exits with the message, and that `--allow-logged-out` keeps it running with `loggedIn: false`.
4. Log in again with `pnpm room-feed login`, and check that a normal start isn't affected.
