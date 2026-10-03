import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [stylex.vite({ useCSSLayers: true }), react()],
  build: { outDir: 'dist' },
  server: { port: 5173 },
  preview: { port: 4173 },
});
