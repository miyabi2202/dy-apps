import { execSync } from 'node:child_process';
import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import { aliases, viteAliases } from './aliases.js';

/** A dependency under node_modules (pnpm's nested layout included). */
const dep = (names: string[]) =>
  new RegExp(`[\\\\/]node_modules[\\\\/](${names.join('|')})[\\\\/]`);

/**
 * Long-lived vendor chunks: they change only when the dependency is upgraded, so
 * browsers keep them cached across deploys while app chunks change.
 */
const VENDOR_CHUNKS = [
  {
    name: 'react',
    test: dep([
      'react',
      'react-dom',
      'scheduler',
      'react-router',
      '@remix-run[\\\\/][^\\\\/]+',
      'cookie-es',
    ]),
    priority: 20,
  },
  { name: 'stylex', test: dep(['@stylexjs[\\\\/]stylex']), priority: 10 },
];

/** Each app (src/apps/<name>) gets a readable chunk name; its `meta` stays with the index. */
const APP_SRC = /[\\/]src[\\/]apps[\\/]([^\\/]+)[\\/]/;
const APP_CHUNKS = {
  name: (id: string) => `app-${APP_SRC.exec(id)?.[1]}`,
  test: (id: string) => APP_SRC.test(id) && !/[\\/]meta\.ts$/.test(id),
  priority: 5,
};

/**
 * The commit being built: Cloudflare Workers Builds and GitHub Actions set it in the
 * environment; locally it comes from git. Exposed to pages as `__COMMIT_HASH__`.
 */
function commitHash() {
  const fromEnv = process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * First-party shared libraries go into one `lib` chunk (they're small). Otherwise the bundler
 * parks a module used by several apps inside one of those apps' chunks, and every other app
 * then has to download that whole app to get it.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHARED_LIBS = ['ui', 'services'];
const isSharedLib = (id: string) =>
  SHARED_LIBS.some((lib) => id.startsWith(join(ROOT, 'src', lib) + sep));
const LIB_CHUNKS = {
  name: 'lib',
  test: isSharedLib,
  priority: 6,
};

/** The StyleX compiler, set up the same way for the site and for Storybook. */
// The plugin is typed `any`.
export const stylexPlugin = () => stylex.vite({ useCSSLayers: true, aliases }) as PluginOption;

/** The site: index.html and the router in src/, each app lazily loaded on its route. */
export default defineConfig({
  root: ROOT,
  plugins: [stylexPlugin(), react()],
  resolve: { alias: viteAliases },
  // Only the site's page; the build, Storybook and test reports have HTML files here too.
  optimizeDeps: { entries: ['index.html'] },
  define: { __COMMIT_HASH__: JSON.stringify(commitHash()) },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [...VENDOR_CHUNKS, LIB_CHUNKS, APP_CHUNKS] },
      },
    },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
