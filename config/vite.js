import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** A dependency under node_modules (pnpm's nested layout included). */
const dep = (names) => new RegExp(`[\\\\/]node_modules[\\\\/](${names.join('|')})[\\\\/]`);

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

/** Each app package (apps/<name>/src) gets a readable chunk name; its `meta` stays with the index. */
const APP_SRC = /[\\/]apps[\\/]([^\\/]+)[\\/]src[\\/]/;
const APP_CHUNKS = {
  name: (id) => `app-${APP_SRC.exec(id)?.[1]}`,
  test: (id) => APP_SRC.test(id) && !/[\\/]meta\.ts$/.test(id),
  priority: 5,
};

/** React + StyleX site. `appRoot` is the directory holding index.html. */
export function createViteConfig(appRoot) {
  return defineConfig({
    root: appRoot,
    plugins: [stylex.vite({ useCSSLayers: true }), react()],
    build: {
      outDir: 'dist',
      rolldownOptions: { output: { codeSplitting: { groups: [...VENDOR_CHUNKS, APP_CHUNKS] } } },
    },
    server: { port: 5173 },
    preview: { port: 4173 },
  });
}
