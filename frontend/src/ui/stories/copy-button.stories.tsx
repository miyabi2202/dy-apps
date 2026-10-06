import type { Meta, StoryObj } from '@storybook/react-vite';
import { CopyButton } from '../copy-button';

const meta = {
  title: 'CopyButton',
  component: CopyButton,
  args: { value: 'http://localhost:8757' },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = { args: { variant: 'primary' } };
