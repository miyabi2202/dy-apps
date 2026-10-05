# dy-apps

pnpm monorepo of small live-stream apps, served as one site: an index page at `/` and each app on its own route.

| Package                                    | Path                | What it is                                                                        |
| ------------------------------------------ | ------------------- | --------------------------------------------------------------------------------- |
| [`@dy-apps/site`](site)                    | `site/`             | The deployed SPA: index page, React Router, Vite build, Workers                   |
| [`@dy-apps/tetris`](apps/tetris)           | `apps/tetris/`      | 方块干预实验室 at `/tetris`: block game with audience curses                      |
| [`@dy-apps/danmaku`](apps/danmaku)         | `apps/danmaku/`     | 弹幕墙 at `/danmaku`: transparent chat overlay for OBS                            |
| [`@dy-apps/dyhub-guide`](apps/dyhub-guide) | `apps/dyhub-guide/` | DyHub Windows 安装教程 at `/dyhub-windows`, for streamers                         |
| [`@dy-apps/config`](config)                | `config/`           | Shared Vite, Jest, Playwright and Browserslist presets                            |
| [`@dy-apps/dyhub-client`](dyhub-client)    | `dyhub-client/`     | Browser client for DyHub's live-room WebSocket events                             |
| [`@dy-apps/local-storage`](local-storage)  | `local-storage/`    | Typed, validated, namespaced localStorage values for every app                    |
| [`@dy-apps/ui`](ui)                        | `ui/`               | Shared design tokens and components (Button, Panel, Field, Row/Column/Grid, Page) |

## Layout

```text
site/                 # the one deployed app: index page + a lazily loaded route per app
  src/apps.ts         #   registry of apps (path, title, description, lazy page import)
  tests/e2e/          #   Playwright against the production build
  wrangler.jsonc      #   Cloudflare Workers static-assets deploy (SPA fallback for deep links)
apps/<name>/          # one package per app: exports its page component and a tiny `meta`
config/               # @dy-apps/config: createViteConfig / createJestConfig / createPlaywrightConfig
dyhub-client/         # @dy-apps/dyhub-client: connectDyhub, port/room validation, GiftCounter (TS source, no build step)
local-storage/        # @dy-apps/local-storage: createStore for `dy-apps:<app>.<key>` values (TS source, no build step)
ui/                   # @dy-apps/ui: design tokens + the components every app reuses (TS source, no build step)
eslint.config.js      # one flat config for every package
.prettierrc.json      # repo-wide formatting (+ .prettierignore)
tsconfig.base.json    # packages extend this
package.json          # private root: shared tooling + scripts that fan out to packages
pnpm-workspace.yaml   # workspace packages and the version catalog for shared tools
pnpm-lock.yaml
```

## Code splitting

The site's Vite build (`config/vite.js`) splits output so each page downloads only what it needs:

- **One chunk per app** (`app-<name>-*.js`), loaded by React Router's route `lazy` only when its path is visited. The index imports just each app's `meta`, not its code.
- **One `lib` chunk** for the first-party shared libraries (`ui`, `local-storage`, `dyhub-client`), so an app never has to download another app's chunk to get shared code.
- **Long-lived vendor chunks**: `react` (React, ReactDOM, React Router) and `stylex` (StyleX runtime). They change only on dependency upgrades, so browsers keep them cached across deploys.
- **CSS is one file.** StyleX compiles every component's styles into shared atomic classes in a single stylesheet, so it isn't split per app; it's small and hashed for long-term caching.

The site's e2e tests check that `/` never requests an `app-*` chunk.

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

Apps connect through [`@dy-apps/dyhub-client`](dyhub-client) to `ws://localhost:<port>/ws?roomId=<id>`. Enter the port (DyHub's default is `8757`) and the room ID (the number in `live.douyin.com/<id>`), and DyHub starts collecting that room. The address is always `localhost`, so DyHub must run on the same computer as the browser or OBS showing the page. That also works from the deployed HTTPS site, because browsers allow `ws://localhost` from secure pages.

Status: the tetris page's DyHub panel connects and logs chat and gift events. The danmaku overlay doesn't connect yet and only shows demo messages.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)

## Commands

Run from the repo root.

```sh
pnpm install
pnpm dev            # site dev server → http://localhost:5173 (index) and /tetris
pnpm build          # build the site (type-check + Vite) → site/dist/
pnpm typecheck      # tsc in every package
pnpm lint           # ESLint, whole repo
pnpm test           # Jest in every package
pnpm test:e2e       # Playwright against the built site (run `pnpm --filter @dy-apps/site exec playwright install chromium` once)
pnpm format         # Prettier, whole repo (format:check to verify)
pnpm check          # format:check + typecheck + lint + test
```

To target one package: `pnpm --filter @dy-apps/<name> <script>`.

## Shared config presets

Packages keep one short file per tool, using the default filenames so no `--config` flags are needed. The site uses the Vite and Playwright presets; apps use the Jest preset:

```ts
// vite.config.ts
import { createViteConfig } from '@dy-apps/config/vite';
export default createViteConfig(import.meta.dirname);

// playwright.config.ts
import { createPlaywrightConfig } from '@dy-apps/config/playwright';
export default createPlaywrightConfig({ appRoot: import.meta.dirname });
```

```js
// jest.config.js
import { createJestConfig } from '@dy-apps/config/jest';
export default createJestConfig({ setupFilesAfterEnv: ['<rootDir>/src/setup-tests.ts'] });
```

```
# .browserslistrc
extends @dy-apps/config/browserslist-config
```

The presets are plain JavaScript with `.d.ts` types, because Jest can't load a TypeScript config without extra tooling. `@dy-apps/config` owns the plugins and transforms (StyleX, React, SWC, jsdom). Apps only depend on the CLIs they run (`vite`, `jest`, `@playwright/test`), and those versions come from the catalog.

## Adding an app

1. Create `apps/<name>/` with a `package.json` named `@dy-apps/<name>` and `"exports": { ".": "./src/index.ts", "./meta": "./src/meta.ts" }`. Put React in `peerDependencies` (and `devDependencies` for tests).
2. Export the page component from `src/index.ts`, and `meta = { path, title, description }` from `src/meta.ts`. Keep `meta.ts` free of imports so the index stays small.
3. Add `"@dy-apps/<name>": "workspace:*"` to `site/package.json` and one entry to `site/src/apps.ts`.
4. Add a `tsconfig.json` that extends `../../tsconfig.base.json`, plus `jest.config.js` if it has tests. `apps/*` is already in `pnpm-workspace.yaml` and the ESLint config.
5. Use `"catalog:"` for shared tools so versions stay in sync, then run `pnpm install`.
6. Build the UI from `@dy-apps/ui` (see below) instead of styling your own buttons, panels or inputs.

## Design system

`@dy-apps/ui` keeps every app on one design language. It holds only what more than one app actually uses:

- **Tokens** in `@dy-apps/ui/tokens.stylex`: `colors`, `space`, `radius`, `fontSize`, `fonts`. Import them from that path directly, not through the package index; StyleX resolves variables by the file that defines them.
- **Components**: `Button` (`default` / `primary` / `danger`), `Panel`, `Field` with `Input` / `Select` (and `useFieldId` for custom controls), `Row` / `Column` / `Grid` for spacing, `Page` for an app's root, and `text.muted` / `text.caption` styles.

Every component takes an `xstyle` prop for one-off tweaks. Styles that stay inside an app (a game board, an overlay card) still use the tokens for colour, padding and radius rather than literal values.
