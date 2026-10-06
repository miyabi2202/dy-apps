import { defineConfig } from 'vite';
import { viteAliases } from '../aliases.js';
import { stylexPlugin } from '../vite.config.ts';

// Storybook adds the React plugin itself; StyleX needs the same compiler the site uses.
export default defineConfig({
  plugins: [stylexPlugin()],
  resolve: { alias: viteAliases },
});
