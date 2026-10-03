# dy-apps

pnpm monorepo for falling-block game experiments.

| Package                     | Path      | What it is                                               |
| --------------------------- | --------- | -------------------------------------------------------- |
| [`@dy-apps/tetris`](tetris) | `tetris/` | 方块干预实验室: block game with simulated audience gifts |
| [`@dy-apps/config`](config) | `config/` | Shared Vite, Jest, Playwright and Browserslist presets   |

## Layout

```text
tetris/               # the game app
config/               # @dy-apps/config: createViteConfig / createJestConfig / createPlaywrightConfig
eslint.config.js      # one flat config for every package (per-app sections inside)
.prettierrc.json      # repo-wide formatting (+ .prettierignore)
tsconfig.base.json    # packages extend this
package.json          # private root: shared tooling + scripts that fan out to packages
pnpm-workspace.yaml   # workspace packages and the version catalog for shared tools
pnpm-lock.yaml
```

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)

## Commands

Run from the repo root.

```sh
pnpm install
pnpm dev            # tetris dev server
pnpm build          # build every package
pnpm typecheck      # tsc in every package
pnpm lint           # ESLint, whole repo
pnpm test           # Jest in every package
pnpm test:e2e       # Playwright in every package (run `pnpm --filter @dy-apps/tetris exec playwright install chromium` once)
pnpm format         # Prettier, whole repo (format:check to verify)
pnpm check          # format:check + typecheck + lint + test
```

To target one package: `pnpm --filter @dy-apps/tetris <script>`.

## Shared config presets

Apps keep one short file per tool, using the default filenames so no `--config` flags are needed:

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
export default createJestConfig({ setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'] });
```

```
# .browserslistrc
extends @dy-apps/config/browserslist-config
```

The presets are plain JavaScript with `.d.ts` types, because Jest can't load a TypeScript config without extra tooling. `@dy-apps/config` owns the plugins and transforms (StyleX, React, SWC, jsdom). Apps only depend on the CLIs they run (`vite`, `jest`, `@playwright/test`), and those versions come from the catalog.

## Adding an app

1. Create `<name>/` at the repo root with a `package.json` named `@dy-apps/<name>` (`build`, `typecheck`, `lint`, `test` scripts).
2. Add `<name>` to `packages` in `pnpm-workspace.yaml`.
3. Add `"@dy-apps/config": "workspace:*"` and the config files above.
4. Add a `tsconfig.json` that extends `../tsconfig.base.json`.
5. Add a section for `<name>/**` to `eslint.config.js` if it needs extra rules.
6. Use `"catalog:"` for shared tools so versions stay in sync, then run `pnpm install`.
