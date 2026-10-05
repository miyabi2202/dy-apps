# AGENTS.md

Guidance for coding agents working in this repo. The [README](README.md) covers layout, commands and conventions; this file lists rules that are easy to break without noticing.

## Code splitting

The site is one SPA, but each page must download only what it uses. The chunk groups live in `config/vite.js`.

- **The index never loads app code.** `site/src/apps.ts` imports only each package's `meta` (`@dy-apps/<name>/meta`); pages are loaded with `import()` in the route's `lazy`. Keep `meta.ts` free of imports. `/` must request no `app-*` chunk, no `lib` chunk and no `stylex` chunk (`site/tests/e2e/site.spec.ts` checks this).
- **One chunk per app.** Everything under `apps/<name>/src` becomes `app-<name>`.
- **Apps never import from another app.** Code two apps need moves into a shared library, not into one app that the other imports.
- **First-party shared libraries share one `lib` chunk.** `ui`, `local-storage` and `dyhub-client` are small, so they go into a single chunk, not one each. When adding a shared library, add its folder to `SHARED_LIBS` in `config/vite.js`; otherwise the bundler parks it inside one app's chunk and every other app downloads that whole app to get it.
- **Third-party code goes in the long-lived vendor chunks** (`react`, `stylex`) so it stays cached across deploys. A new dependency used by several apps should join a vendor chunk rather than land in an app chunk.

To check after a change, run `pnpm build` and confirm each `site/dist/assets/app-*.js` imports only `lib`, `react`, `stylex` and `rolldown-runtime`, never another `app-*` chunk; then run `pnpm test:e2e`.
