import { fileURLToPath } from 'node:url';

const file = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The shared libraries, imported by name from any app. Vite, StyleX, Jest and Storybook read
 * this; TypeScript can't, so keep `paths` in frontend/tsconfig.json the same.
 */
export const aliases = {
  '@dy-apps/services': file('../src/services/index.ts'),
  '@dy-apps/ui': file('../src/ui/index.ts'),
  '@dy-apps/ui/tokens.stylex': file('../src/ui/tokens.stylex.ts'),
};

const exactly = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`);

/** For Vite's `resolve.alias`: whole specifiers only, so `@dy-apps/ui` doesn't catch `@dy-apps/ui/tokens.stylex`. */
export const viteAliases = Object.entries(aliases).map(([name, path]) => ({
  find: exactly(name),
  replacement: path,
}));

/** For Jest's `moduleNameMapper`. */
export const jestAliases = Object.fromEntries(
  Object.entries(aliases).map(([name, path]) => [exactly(name).source, path]),
);
