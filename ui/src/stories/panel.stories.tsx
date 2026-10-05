import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button';
import { Field, Input } from '../form';
import { Panel } from '../panel';
import { text } from '../text';
import * as stylex from '@stylexjs/stylex';

const meta = {
  title: 'Panel',
  component: Panel,
  args: {
    title: 'DyHub 连接',
    children: (
      <>
        <p {...stylex.props(text.muted)}>在直播电脑上运行 DyHub，然后填写端口。</p>
        <Field label="端口">
          <Input defaultValue="8757" />
        </Field>
        <Button variant="primary">连接</Button>
      </>
    ),
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {};

export const WithoutTitle: Story = { args: { title: undefined, 'aria-label': 'DyHub 连接' } };
