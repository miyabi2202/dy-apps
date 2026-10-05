import type { Preview } from '@storybook/react-vite';
import { Page } from '../src';
import './preview.css';

const preview: Preview = {
  // Every story sits on an app page, so it gets the dark background, text colour and font.
  decorators: [
    (Story) => (
      <Page>
        <div style={{ padding: 24 }}>
          <Story />
        </div>
      </Page>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i } },
  },
};

export default preview;
