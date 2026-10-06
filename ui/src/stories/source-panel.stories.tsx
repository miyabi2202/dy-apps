import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import type { Connection, DemoSource } from '@dy-apps/services';
import { Button } from '../button';
import { SourcePanel } from '../source-panel';

const meta = {
  title: 'SourcePanel',
  component: SourcePanel,
  args: {
    running: false,
    onToggle: fn(),
    canStart: true,
    source: 'fake',
    onSourceChange: fn(),
    intervalMs: 900,
    onIntervalChange: fn(),
    connection: { port: '', roomId: '' },
    onConnectionChange: fn(),
    liveState: { status: 'idle' },
  },
} satisfies Meta<typeof SourcePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fake: Story = {};

export const FakeRunning: Story = { args: { running: true } };

/** An app with slower messages passes its own range; from 1 s up it shows seconds. */
export const SlowInterval: Story = {
  args: {
    intervalMs: 10_000,
    interval: { range: [2000, 30_000], step: 500 },
    labels: { start: '开始送礼', stop: '停止送礼' },
  },
};

export const LiveEmpty: Story = { args: { source: 'live', canStart: false } };

export const LiveConnected: Story = {
  args: {
    source: 'live',
    running: true,
    connection: { port: '8757', roomId: '484088206186' },
    liveState: { status: 'ready' },
  },
};

export const LiveError: Story = {
  args: {
    source: 'live',
    running: true,
    connection: { port: '8757', roomId: '484088206186' },
    liveState: { status: 'error', detail: '无法连接 localhost:8757，请确认 DyHub 已启动' },
  },
};

/** More controls after the toggle, like danmaku's 清空 and message count. */
export const WithExtras: Story = {
  args: { children: <Button>清空</Button> },
};

/** Switch sources, type a room and start or stop. */
export const Interactive: Story = {
  render: () => <InteractivePanel />,
};

function InteractivePanel() {
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<DemoSource>('fake');
  const [intervalMs, setIntervalMs] = useState(900);
  const [connection, setConnection] = useState<Connection>({ port: '', roomId: '' });
  const valid = /^\d+$/.test(connection.port) && /^\d+$/.test(connection.roomId);
  return (
    <SourcePanel
      running={running}
      onToggle={() => setRunning((r) => !r)}
      canStart={source === 'fake' || valid}
      source={source}
      onSourceChange={setSource}
      intervalMs={intervalMs}
      onIntervalChange={setIntervalMs}
      connection={connection}
      onConnectionChange={setConnection}
      liveState={{ status: running && source === 'live' ? 'opening' : 'idle' }}
    />
  );
}
