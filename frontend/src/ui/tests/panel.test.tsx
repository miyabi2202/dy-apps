import { render, screen } from '@testing-library/react';
import { Panel } from '..';

describe('Panel', () => {
  it('is a region named by its title', () => {
    render(<Panel title="DyHub 连接">内容</Panel>);
    const region = screen.getByRole('region', { name: 'DyHub 连接' });
    expect(region).toContainElement(screen.getByRole('heading', { name: 'DyHub 连接' }));
    expect(region).toHaveTextContent('内容');
  });

  it('prefers an explicit aria-label over the title', () => {
    render(
      <Panel title="设置" aria-label="弹幕设置">
        内容
      </Panel>,
    );
    const region = screen.getByRole('region', { name: '弹幕设置' });
    expect(region).not.toHaveAttribute('aria-labelledby');
  });

  it('has no heading without a title', () => {
    render(<Panel aria-label="面板">内容</Panel>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('region', { name: '面板' })).toBeInTheDocument();
  });

  it('shows a title of 0', () => {
    render(<Panel title={0}>内容</Panel>);
    expect(screen.getByRole('heading', { name: '0' })).toBeInTheDocument();
  });
});
