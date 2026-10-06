import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { SourcePanel } from '../src/source-panel';

const props: ComponentProps<typeof SourcePanel> = {
  running: false,
  onToggle: () => {},
  canStart: true,
  source: 'fake',
  onSourceChange: () => {},
  intervalMs: 900,
  onIntervalChange: () => {},
  connection: { port: '8757', roomId: '123' },
  onConnectionChange: () => {},
  liveState: { status: 'idle' },
};

describe('SourcePanel', () => {
  it('uses the fake labels for fake messages', () => {
    const { rerender } = render(
      <SourcePanel {...props} fakeLabels={{ start: '开始模拟送礼', stop: '停止模拟送礼' }} />,
    );
    expect(screen.getByRole('button', { name: '开始模拟送礼' })).toBeInTheDocument();
    rerender(
      <SourcePanel
        {...props}
        running
        fakeLabels={{ start: '开始模拟送礼', stop: '停止模拟送礼' }}
      />,
    );
    expect(screen.getByRole('button', { name: '停止模拟送礼' })).toBeInTheDocument();
  });

  it('says 连接 and 断开 for the live source, whatever the fake labels are', () => {
    const live = { ...props, source: 'live' as const, fakeLabels: { start: 'x', stop: 'y' } };
    const { rerender } = render(<SourcePanel {...live} />);
    expect(screen.getByRole('button', { name: '连接' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /安装教程/ })).toHaveAttribute(
      'href',
      '/dyhub-windows',
    );
    rerender(<SourcePanel {...live} running />);
    expect(screen.getByRole('button', { name: '断开' })).toBeInTheDocument();
  });

  it('shows the interval in seconds for a range from 1 s up', () => {
    render(
      <SourcePanel
        {...props}
        intervalMs={10_000}
        interval={{ range: [2000, 30_000], step: 500 }}
      />,
    );
    expect(screen.getByText('10s')).toBeInTheDocument();
  });
});
