import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import type { Connection } from '@dy-apps/services';
import { ConnectionForm } from '../connection-form';

const meta = {
  title: 'ConnectionForm',
  component: ConnectionForm,
  args: {
    value: { port: '', roomId: '' },
    onChange: fn(),
    connected: false,
    canConnect: false,
    onToggle: fn(),
    portPlaceholder: '8757',
  },
} satisfies Meta<typeof ConnectionForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Ready: Story = {
  args: { value: { port: '8757', roomId: '484088206186' }, canConnect: true },
};

export const Connected: Story = {
  args: { value: { port: '8757', roomId: '484088206186' }, canConnect: true, connected: true },
};

/** No button: something else, like a start button, opens the connection. */
export const FieldsOnly: Story = {
  args: { value: { port: '8757', roomId: '484088206186' }, onToggle: undefined },
};

export const FieldsOnlyLocked: Story = {
  args: { value: { port: '8757', roomId: '484088206186' }, onToggle: undefined, connected: true },
};

/** Type into it: 连接 enables once both fields are digits, and toggles to 断开. */
export const Interactive: Story = {
  render: (args) => <InteractiveForm {...args} />,
};

function InteractiveForm(args: Story['args']) {
  const [value, setValue] = useState<Connection>({ port: '', roomId: '' });
  const [connected, setConnected] = useState(false);
  return (
    <ConnectionForm
      portPlaceholder={args?.portPlaceholder}
      value={value}
      onChange={setValue}
      connected={connected}
      canConnect={/^\d+$/.test(value.port) && /^\d+$/.test(value.roomId)}
      onToggle={() => setConnected((c) => !c)}
    />
  );
}
