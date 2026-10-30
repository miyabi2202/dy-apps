# AGENTS.md (room-feed)

How room-feed works Douyin's room page. What it does and its endpoints are in the [README](README.md) and the repo's [README](../README.md#room-feed-live-room-events).

## Wait, pause, act

Every step that clicks or types on the page goes in three parts, as a person would:

1. **Wait** for what it acts on to show (a `waitFor…` on the surface, which throws when it doesn't in time), or check that it shows (a `has(…)`, `…Shown()` or `…Visible()` that answered yes).
2. **Pause** 500–1000 ms, at random.
3. **Act**: the click, or the typing.

Never act before the target is seen, and never the moment it is. `Pace` (`src/pace.ts`) is the one place this lives: `pace.step(ready, act)` for a target to wait for, `pace.afterSeen(act)` for one a check has just seen. Don't write a pause of your own, and don't rely on Playwright's own wait inside `click()` or `fill()`: by the time it finds the target, the pause has already gone by.

Closing a panel is a step too: `closeRightPanel` (`src/right-panel.ts`) sees the ×, pauses, then clicks it.

How a feature is built (`ChatBox`, `LikeHold`, `FansLamp`, `HeartGift`):

- **The steps** are a class that takes a surface interface and a `Pace` (with a real one by default), and knows nothing of Playwright. Its tests give it a fake surface that logs what it was asked, and a `Pace` with a fake `wait`, then check the order: `wait for X`, the pause, `click X`.
- **The surface** (`Page…Surface` in `room-page.ts`) is the Playwright side: one `waitFor…` and one `click…` (or `type…`) for each target, found by the selectors in `src/douyin/page-map.ts`. It doesn't pause, and it doesn't decide anything.
- `LivePage` builds one `Pace` from the page's `waitForTimeout` and the `random` it's given, and hands it to every feature.

A step is one thing a person does: a click, typing a chat and pressing Enter, clearing the box, the first press of the like key. What's part of one act isn't paced inside it: the keydowns that repeat while the like key is held, the keys that clear the box. Opening the page clicks the player to start it after the page has settled, a step like the others.

## Gifts and diamonds

Anything that spends diamonds reads the balance (`data-e2e="recharge-btn"`) first, and with too few clicks nothing at all: it answers `{ result: 'notEnough', diamonds, price }`, a result in `@dy-apps/room-feed-protocol` and not an error. What can happen is a tagged union on `result` there; an error is only for what went wrong.
