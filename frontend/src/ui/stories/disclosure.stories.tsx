import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from '../checkbox';
import { Disclosure } from '../disclosure';

const meta = {
  title: 'Disclosure',
  component: Disclosure,
  args: {
    summary: '清除方式（3/3）',
    children: (
      <>
        <Checkbox label="直升机" defaultChecked />
        <Checkbox label="飞碟" defaultChecked />
        <Checkbox label="娃娃机" defaultChecked />
      </>
    ),
  },
} satisfies Meta<typeof Disclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = { args: { open: true } };
