# AGENTS.md

`@dy-apps/ui` holds the design tokens and the components every app shares. The [root AGENTS.md](../AGENTS.md) applies here too.

## Stories

Every component needs a story.

- Put it in `src/stories/<file>.stories.tsx`, named after the component's file (`button.tsx` → `button.stories.tsx`). One file covers every component that file exports.
- Show each variant and state, such as `primary`, `disabled` or an empty title.
- When you change a component's props or looks, update its story in the same change.

Run `pnpm storybook` to see them, and `pnpm --filter @dy-apps/ui build-storybook` to check they build (CI runs this).
