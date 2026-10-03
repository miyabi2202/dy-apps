import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** React + StyleX app. `appRoot` is the directory holding index.html. */
export function createViteConfig(appRoot) {
  return defineConfig({
    root: appRoot,
    plugins: [stylex.vite({ useCSSLayers: true }), react()],
    build: { outDir: 'dist' },
    server: { port: 5173 },
    preview: { port: 4173 },
  });
}
