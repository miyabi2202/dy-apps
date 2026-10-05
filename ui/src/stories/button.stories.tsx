import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button, ButtonLink } from '../button';
import { Row } from '../layout';

const meta = {
  title: 'Button',
  component: Button,
  args: { children: '开始', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'primary', 'danger'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = { args: { variant: 'primary' } };

export const Danger: Story = { args: { variant: 'danger', children: '清空' } };

export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  render: (args) => (
    <Row>
      <Button {...args}>默认</Button>
      <Button {...args} variant="primary">
        主要
      </Button>
      <Button {...args} variant="danger">
        危险
      </Button>
      <Button {...args} disabled>
        禁用
      </Button>
    </Row>
  ),
};

export const Link: Story = {
  render: () => (
    <ButtonLink href="https://github.com/miyabi2202/dyhub" target="_blank" variant="primary">
      打开 DyHub
    </ButtonLink>
  ),
};
