import { stylexPlugin } from '@dy-apps/config/vite';
import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/stories/*.stories.tsx'],
  // Storybook adds the React plugin itself; StyleX needs the same compiler the site uses.
  viteFinal: (config) => mergeConfig(config, { plugins: [stylexPlugin()] }),
};

export default config;
