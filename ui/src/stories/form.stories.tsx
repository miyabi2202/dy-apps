import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Input, Select } from '../form';
import { Column } from '../layout';

const meta = {
  title: 'Field',
  component: Field,
  args: { label: '端口', children: null },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  args: { children: <Input defaultValue="8757" inputMode="numeric" /> },
};

export const WithSelect: Story = {
  args: {
    label: '方向',
    children: (
      <Select defaultValue="up">
        <option value="up">向上</option>
        <option value="down">向下</option>
      </Select>
    ),
  },
};

/** A short explanation under the control, read out with it. */
export const WithHint: Story = {
  args: {
    label: '直播间号',
    hint: 'live.douyin.com/ 后面的数字',
    children: <Input placeholder="如 484088206186" inputMode="numeric" />,
  },
};

export const Disabled: Story = {
  args: { children: <Input defaultValue="8757" disabled /> },
};

export const Form: Story = {
  render: () => (
    <Column>
      <Field label="端口">
        <Input defaultValue="8757" />
      </Field>
      <Field label="直播间号">
        <Input placeholder="live.douyin.com/ 后面的数字" />
      </Field>
    </Column>
  ),
};
