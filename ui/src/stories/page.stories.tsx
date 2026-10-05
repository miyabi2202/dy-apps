import type { Meta, StoryObj } from '@storybook/react-vite';
import * as stylex from '@stylexjs/stylex';
import { Button } from '../button';
import { Column } from '../layout';
import { Page } from '../page';
import { Panel } from '../panel';
import { text } from '../text';
import { space } from '../tokens.stylex';

const styles = stylex.create({
  content: { padding: space.xxl },
});

const meta = {
  title: 'Page',
  component: Page,
  // Shown on its own, not inside the Page every other story gets from preview.tsx.
  parameters: { page: false },
  args: {
    children: (
      <Column xstyle={styles.content}>
        <h1>方块干预实验室</h1>
        <p {...stylex.props(text.muted)}>Page 提供背景色、文字颜色和字体。</p>
        <Panel title="DyHub 连接">
          <Button variant="primary">连接</Button>
        </Panel>
      </Column>
    ),
  },
} satisfies Meta<typeof Page>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
