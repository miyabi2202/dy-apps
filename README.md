# Tetris

React + TypeScript web app styled with [StyleX](https://stylexjs.com). It builds with either Vite or webpack.

## Requirements

- Node.js 22 or later
- pnpm 11 (`corepack enable`)

## Getting started

```sh
pnpm install
pnpm exec playwright install chromium   # once, for e2e tests
pnpm dev                                # Vite dev server on http://localhost:5173
```

## Scripts

| Script               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | Vite dev server (port 5173)                               |
| `pnpm build`         | Type-check, then Vite production build into `dist/`       |
| `pnpm preview`       | Serve `dist/` (port 4173)                                 |
| `pnpm dev:webpack`   | webpack dev server (port 8080)                            |
| `pnpm build:webpack` | Type-check, then webpack production build `dist-webpack/` |
| `pnpm typecheck`     | `tsc --noEmit`                                            |
| `pnpm lint`          | ESLint, with any warning treated as a failure             |
| `pnpm format`        | Prettier write (`format:check` to verify only)            |
| `pnpm test`          | Jest unit/component tests (`src/**/*.test.tsx`)           |
| `pnpm test:e2e`      | Playwright tests (`e2e/`) against a Vite production build |
| `pnpm check`         | typecheck + lint + format check + unit tests              |

## Tooling notes

- **StyleX** is compiled by `@stylexjs/unplugin` in both Vite and webpack. Jest compiles it with `@stylexjs/babel-plugin` (see `babel.config.cjs`).
- **Babel** (`babel.config.cjs`) is used only by webpack and Jest. Vite uses its own transform.
- **ESLint** uses a flat config (`eslint.config.js`): typescript-eslint (type-checked), `@eslint-react`, `react-hooks`, `@stylexjs/eslint-plugin`, and `eslint-config-prettier`.
- **Pre-commit**: Husky runs lint-staged, which runs ESLint and Prettier on staged files.
- TypeScript is pinned to 6.0.x because typescript-eslint does not support TS 7 yet.
