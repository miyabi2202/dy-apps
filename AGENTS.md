# AGENTS.md

See the [README](README.md) for layout and commands.

## Code splitting

Each page should download only the code it needs.

- The index page loads no app code.
- Each app is its own chunk.
- Apps never import from each other. Put shared code in a shared library.
- All our shared libraries go into one `lib` chunk. When you add a library, list it in `SHARED_LIBS` in `config/vite.js`.

Run `pnpm test:e2e` to check.

## File names

Use lowercase words joined by `-`, like `message-card.tsx` or `use-engine.ts`. Dots are only for extensions and suffixes (`.test.ts`, `.stylex.ts`). The exceptions are `README.md` and `AGENTS.md`, which tools look for by exact name.
