# dy-apps

Small live-stream apps, served as one site: an index page at `/` and each app on its own route. Everything lives in one package, [`frontend/`](frontend) (`@dy-apps/frontend`), inside a pnpm workspace.

| Path                             | What it is                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `frontend/src/`                  | The site itself: index page, React Router, entry (`main.tsx`)                    |
| `frontend/src/apps/tetris/`      | 方块干预实验室 at `/tetris`: block game with audience curses                     |
| `frontend/src/apps/danmaku/`     | 弹幕墙 at `/danmaku`: transparent chat overlay for OBS                           |
| `frontend/src/apps/dyhub-guide/` | DyHub Windows 安装教程 at `/dyhub-windows`, for streamers                        |
| `frontend/src/services/`         | Shared non-UI code: the DyHub client, messages, fake data and saved settings     |
| `frontend/src/ui/`               | Shared design tokens and components (Button, Panel, Field, MessageCard, Page, …) |

## Layout

```text
frontend/                 # @dy-apps/frontend: the one package
  index.html              #   the site's page
  wrangler.jsonc          #   Cloudflare Workers static-assets deploy (SPA fallback for deep links)
  src/
    main.tsx  apps.ts  …  #   the site: entry, index page, router; apps.ts registers each app's route
    apps/<name>/          #   one folder per app: index.ts exports the page component, meta.ts a tiny `meta`
      tests/              #     Jest unit tests
      integration-tests/  #     Playwright specs, against the site's production build
    services/             #   imported as `@dy-apps/services`: shared non-UI code
      demo-source.ts      #     fake or live source, the fake interval and `?demo=` in OBS links
      dyhub-client.ts     #     DyhubClient: onComment / onGift / onLike / onStatus, with retry
      dyhub.ts            #     the raw stream (connectDyhub), port/room validation, GiftCounter, status text
      fake-messages.ts    #     made-up viewers, chat and gifts for previews
      like-batcher.ts     #     LikeBatcher: one total per viewer once they stop liking
      live-message.ts     #     DanmakuMessage, and DyHub events turned into messages
      live-room.ts        #     liveRoomFrom, the room in OBS links, createConnectionStore
      local-storage.ts    #     createStore for `dy-apps:<app>.<key>` values
    ui/                   #   imported as `@dy-apps/ui`: design tokens + the components every app reuses
  config/
    aliases.js            #   the `@dy-apps/ui` and `@dy-apps/services` import names (mirrored in tsconfig.json)
    vite.config.ts        #   site build: StyleX, chunk groups, commit hash
    jest.config.js        #   every unit test (jest/ holds its setup and the StyleX stub)
    playwright.config.ts  #   every app's integration tests, against `vite build` + `vite preview`
    storybook/            #   ui stories
  tsconfig.json           #   stays here so editors and ESLint find it
eslint.config.js          # lint for the whole repo, including which folders may import which
.prettierrc.json          # repo-wide formatting (+ .prettierignore)
package.json              # private root: lint/format tools and the repo-wide checks
pnpm-workspace.yaml
pnpm-lock.yaml
```

## Code splitting

The site's Vite build (`frontend/config/vite.config.ts`) splits output so each page downloads only what it needs:

- **One chunk per app** (`app-<name>-*.js`), loaded by React Router's route `lazy` only when its path is visited. The index imports just each app's `meta`, not its code.
- **One `lib` chunk** for the first-party shared libraries (`ui` and `services`), so an app never has to download another app's chunk to get shared code.
- **Long-lived vendor chunks**: `react` (React, ReactDOM, React Router) and `stylex` (StyleX runtime). They change only on dependency upgrades, so browsers keep them cached across deploys.
- **CSS is one file.** StyleX compiles every component's styles into shared atomic classes in a single stylesheet, so it isn't split per app; it's small and hashed for long-term caching.

The index page loads `react`, `stylex` and `lib` (it's built from `@dy-apps/ui` too) but never an `app-*` chunk.

## DyHub (live-room events)

Live chat and gifts come from [DyHub](https://github.com/ymstar/dyhub), a Douyin live-room event hub that runs on your own machine. The apps need **our fork, [miyabi2202/dyhub](https://github.com/miyabi2202/dyhub) (`main`)**, not upstream. The fork adds:

- Correct gift fields, including `groupId` and `repeatEnd`, which `GiftCounter` needs to count each gift once (upstream PR [ymstar/dyhub#4](https://github.com/ymstar/dyhub/pull/4), not merged yet)
- 网页登录 in the console: log in to Douyin in a pop-up window and the cookie is saved. Gift events need a logged-in cookie
- A fix so a room isn't marked closed when some other WebSocket on the live page closes
- The console's live feed merges the messages of one gift send

Run it on the machine that opens the app (the streaming PC, for OBS):

```sh
git clone https://github.com/miyabi2202/dyhub.git
cd dyhub
npm install
npm run build && npm start   # console → http://localhost:8757
```

It needs Node.js 20+ and Chrome installed. Log in once from the console (网页登录) to receive gifts. See the fork's README for environment variables such as `DYHUB_PORT`.

Apps connect through [`@dy-apps/services`](services) to `ws://localhost:<port>/ws?roomId=<id>`. Enter the port (DyHub's default is `8757`) and the room ID (the number in `live.douyin.com/<id>`), and DyHub starts collecting that room. The address is always `localhost`, so DyHub must run on the same computer as the browser or OBS showing the page. That also works from the deployed HTTPS site, because browsers allow `ws://localhost` from secure pages.

Status: both apps pick fake data or a live room in their 数据来源 panel. The danmaku wall shows the room's chat, gifts and likes; tetris turns its gifts into curses, one draw per diamond.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)

## Commands

Checks that cover the whole repo run from the root:

```sh
pnpm install
pnpm typecheck        # tsc
pnpm lint             # ESLint, whole repo
pnpm test             # Jest
pnpm format           # Prettier, whole repo (format:check to verify)
pnpm check            # format:check + typecheck + lint + test
```

Everything else belongs to the site, so run it from `frontend/` (or from the root with `pnpm --filter @dy-apps/frontend <script>`):

```sh
pnpm dev              # dev server → http://localhost:5173 (index) and /tetris
pnpm build            # type-check + Vite → frontend/dist/
pnpm preview          # serve that build → http://localhost:4173
pnpm test:integration # Playwright against the built site (run `pnpm exec playwright install chromium` once)
pnpm storybook        # ui components and tokens in Storybook → http://localhost:6006
pnpm build-storybook  # → frontend/storybook-static/
```

## One package, kept apart by lint

The site, apps and shared libraries share one `package.json`, `tsconfig.json` and set of tool configs (in `frontend/config/`, passed to each tool by the scripts). Folders still keep their boundaries; `pnpm lint` fails when an import crosses one (`import-x/no-restricted-paths` in `eslint.config.js`):

- an app imports another app, or the site
- `ui` or `services` imports an app or the site
- `services` imports `ui`

Apps import the shared libraries by name, `@dy-apps/ui` and `@dy-apps/services`. Those names come from `frontend/config/aliases.js`, which Vite, StyleX, Jest and Storybook read; `paths` in `frontend/tsconfig.json` repeats them for TypeScript.

## Adding an app

1. Create `frontend/src/apps/<name>/` with the page component exported from `index.ts`, and `meta = { path, title, description }` from `meta.ts`. Keep `meta.ts` free of imports so the index stays small.
2. Add one entry to `frontend/src/apps.ts`, importing `meta` and the page by relative path.
3. Put unit tests in `tests/` and Playwright specs in `integration-tests/`, both inside the app's folder. Jest, Playwright, TypeScript, ESLint and the chunk groups pick them up without any config.
4. Build the UI from `@dy-apps/ui` (see below) instead of styling your own buttons, panels or inputs.

## Design system

`@dy-apps/ui` keeps every app on one design language. It holds only what more than one app actually uses:

- **Tokens** in `@dy-apps/ui/tokens.stylex`: `colors`, `space`, `radius`, `fontSize`, `fonts`. Import them from that path directly, not through the package index; StyleX resolves variables by the file that defines them.
- **Components**: `Button` (`default` / `primary` / `danger`), `Panel`, `Field` with `Input` / `Select` and an optional `hint` (and `useFieldId` for custom controls), `Slider`, `Row` / `Column` / `Grid` for spacing, `Page` for an app's root, and `text.muted` / `text.caption` styles.
- **Live-stream pieces**: `MessageCard` and `MessageList` (the 弹幕墙 cards, styled by a `CardStyle`), `SourcePanel` with `useDemo` (fake or live data), `ConnectionForm` and `ObsLink`.

Browse them with `pnpm storybook` in `frontend/`; stories live in `frontend/src/ui/stories/`, unit tests in `frontend/src/ui/tests/`. Every component takes an `xstyle` prop for one-off tweaks. Styles that stay inside an app (a game board, an overlay card) still use the tokens for colour, padding and radius rather than literal values.
