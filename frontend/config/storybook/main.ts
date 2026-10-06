import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  // Its own Vite config, not the site's chunk groups and commit hash.
  framework: {
    name: '@storybook/react-vite',
    options: { builder: { viteConfigPath: 'config/storybook/vite.config.ts' } },
  },
  stories: ['../../src/ui/stories/*.stories.tsx'],
  // The site's public/ (emoji images), served at the same paths as on the site.
  staticDirs: ['../../public'],
};

export default config;
