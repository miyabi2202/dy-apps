# AGENTS.md

See the [README](README.md) for layout and commands.

## Code splitting

Each page should download only the code it needs.

- The index page loads no app code.
- Each app is its own chunk.
- Apps never import from each other. Put shared code in a shared library.
- All our shared libraries go into one `lib` chunk. When you add a library, list it in `SHARED_LIBS` in `config/vite.js`.

To check, run `pnpm build` and read the chunk list: each app is an `app-<name>` chunk, and `/` should request only `index`, `react`, `stylex`, `lib` and the CSS (the Network tab in `pnpm --filter @dy-apps/site preview`).

## File names

Use lowercase words joined by `-`, like `message-card.tsx` or `use-engine.ts`. Dots are only for extensions and suffixes (`.test.ts`, `.stylex.ts`). The exceptions are `README.md` and `AGENTS.md`, which tools look for by exact name.

## Reusing components

- Build UI from `@dy-apps/ui` whenever you can, and use its tokens for colour, spacing and radius.
- Before creating a new component in an app, check whether another app already has something similar. If it does, move it into `@dy-apps/ui` and use it from both apps.
