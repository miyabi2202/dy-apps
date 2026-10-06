import type { Preview } from '@storybook/react-vite';
import { Page } from '../../src/ui';
import './preview.css';

const preview: Preview = {
  // Every story sits on an app page, so it gets the dark background, text colour and font.
  // A story sets `parameters: { page: false }` to opt out.
  decorators: [
    (Story, { parameters }) =>
      parameters.page === false ? (
        <Story />
      ) : (
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
