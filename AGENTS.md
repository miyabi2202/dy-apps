# AGENTS.md

See the [README](README.md) for layout and commands. To start or stop the live-room chat bot for the user, follow [chat-bot/AGENTS.md](chat-bot/AGENTS.md). Before changing how room-feed clicks or types on Douyin's page, read [room-feed/AGENTS.md](room-feed/AGENTS.md).

## Code splitting

Each page should download only the code it needs.

- The index page loads no app code.
- Each app is its own chunk.
- Apps never import from each other. Put shared code in a shared library. `pnpm lint` enforces this (see the README).
- All our shared libraries go into one `lib` chunk. When you add a library, list its folder in `SHARED_LIBS` in `frontend/config/vite.config.ts`. One inside `frontend/src/` also needs an import name in `frontend/config/aliases.js` and `frontend/tsconfig.json`; one that's its own workspace package (like `room-feed-protocol/`) needs none: list it as a `workspace:*` dependency of each package that imports it, with `"exports"` pointing at its `src/index.ts`.
- What room-feed sends and answers, and the client that reads it (`RoomFeedClient`, `GiftCounter`, the port and room-number checks), live once, in `@dy-apps/room-feed-protocol`. room-feed, the site and the chat bot import them; never copy them.

To check, run `pnpm build` in `frontend/` and read the chunk list: each app is an `app-<name>` chunk, and `/` should request only `index`, `react`, `stylex`, `lib` and the CSS (the Network tab in `pnpm preview`).

## File names

Use lowercase words joined by `-`, like `message-card.tsx` or `use-engine.ts`. Dots are only for extensions and suffixes (`.test.ts`, `.stylex.ts`). The exceptions are `README.md` and `AGENTS.md`, which tools look for by exact name.

## Reusing components

- Build UI from `@dy-apps/ui` whenever you can, and use its tokens for colour, spacing and radius.
- Before creating a new component in an app, check whether another app already has something similar. If it does, move it into `@dy-apps/ui` and use it from both apps.

## Dependency injection

Pass dependencies in, so tests can swap them for fakes without `jest.mock`.

- Anything a test needs to control comes in through a constructor option, function parameter or prop, with the real thing as the default. That includes randomness, time, the network (`WebSocket`, `fetch`) and the objects a class works with. For example, `GameEngine` takes `pieceRng`, and `GiftCounter` takes `now`.
- Build and wire the real objects in one place, at the entry: the site's pages like `createGame()` in `tetris-page.tsx`, and the chat bot through its container.
- The chat bot (`chat-bot/src/wiring/`) uses a small hand-written IoC container (`container.ts`): typed tokens, lazy singleton factories, an error on an unknown token or a cycle. Each area registers its own factories (`models.ts`, `room.ts`, …); a reference that points forward (the answerer to the bot) is resolved when it's used, not while the thing is made. A test registers fakes for the adapters' tokens (`tests/wiring/wiring.test.ts`) and builds the rest for real. Everything else stays hand-wired (the site's apps), and the container is hand-written: no library, no decorators, no reflection.
- Classes still take their dependencies as constructor options, with real defaults: the container only fills them in. No `jest.mock`, no decorators.
