import type { Meta, StoryObj } from '@storybook/react-vite';
import { useArgs } from 'storybook/preview-api';
import { Slider } from '../slider';

const meta = {
  title: 'Slider',
  component: Slider,
  args: { label: '字号', value: 16, min: 10, max: 40, unit: 'px', onChange: () => {} },
  // Keep the control's value in step with the slider so dragging updates the story.
  render: function Render(args) {
    const [, updateArgs] = useArgs<typeof args>();
    return <Slider {...args} onChange={(value) => updateArgs({ value })} />;
  },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Percent: Story = {
  args: { label: '透明度', value: 80, min: 0, max: 100, step: 5, unit: '%' },
};

export const Disabled: Story = { args: { disabled: true } };
