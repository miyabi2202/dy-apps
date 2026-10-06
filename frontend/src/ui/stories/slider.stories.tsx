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

export const WithHint: Story = {
  args: {
    label: '礼物触发概率',
    value: 15,
    min: 1,
    max: 100,
    unit: '%',
    hint: '每 1 钻有多少概率触发一个随机诅咒',
  },
};

/** Stored in ms, shown in seconds. */
export const Formatted: Story = {
  args: {
    label: '平均间隔',
    value: 10_000,
    min: 2000,
    max: 30_000,
    step: 500,
    unit: 's',
    format: (ms: number) => String(ms / 1000),
  },
};
