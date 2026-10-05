# AGENTS.md

The apps here are tools for Douyin live streams. The [root AGENTS.md](../AGENTS.md) applies here too.

## The goal: working in OBS

The end goal for every app is something a streamer can use in OBS. They add the page as a browser source on the streaming PC, and it reacts to the live room through DyHub. An app that works only in an ordinary browser tab isn't finished.

When you build or change an app, keep it heading there:

- **An OBS view.** One URL shows just what goes on stream: no editor controls, and a transparent background where the app is an overlay. `apps/danmaku` does this with `?obs=1`.
- **Settings in the URL.** The streamer sets the app up in a normal tab, then copies a link into OBS. That link carries the settings, so the OBS source looks the same without anyone configuring it inside OBS.
- **Live events from DyHub.** Chat and gifts come through `@dy-apps/dyhub-client` from DyHub on `localhost` (see the [README](../README.md#dyhub-live-room-events)).
- **A demo mode.** It can be previewed without a live room, like danmaku's `?demo=<ms>`.

`apps/dyhub-guide` isn't an OBS app; it's the tutorial that helps streamers install DyHub.

## Scaling: lots of gifts

A room can send a few gifts or tens of thousands: one combo can be hundreds, and a busy room keeps them coming. Design every gift reaction so the app still works, and is still fun, at both ends.

## Page title and build hash

Every app's page is a `Page` from `@dy-apps/ui` with a `title`. That shows the title with the build's commit hash after it, so anyone can tell which version they're looking at, and sets the browser tab's title. Put the page's buttons in `actions` and a one-line description in `subtitle`. Keep the title out of the OBS view so it never goes on stream; `apps/danmaku` renders its overlay without `Page`.

## TODO

- Add a template page for new apps.
- Add a common config interface for the settings every app shares: the DyHub port and the room ID.
- Refactor the existing apps to match the template.
