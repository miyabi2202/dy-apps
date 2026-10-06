import { render, screen } from '@testing-library/react';
import { Page } from '..';

describe('Page', () => {
  it('shows the title with the build hash, and sets the tab title', () => {
    render(<Page title="弹幕墙">内容</Page>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('弹幕墙');
    expect(heading).toContainElement(screen.getByTestId('commit-hash'));
    expect(screen.getByTestId('commit-hash')).toHaveTextContent('dev');
    expect(screen.getByTestId('commit-hash')).toHaveAttribute('title', 'dev');
    expect(document.title).toBe('弹幕墙');
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('shows the subtitle and actions next to the title', () => {
    render(<Page title="方块干预实验室" subtitle="单机测试" actions={<button>重新开始</button>} />);
    expect(screen.getByText('单机测试')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新开始' })).toBeInTheDocument();
  });

  it('has no heading or hash without a title', () => {
    document.title = 'before';
    render(<Page>内容</Page>);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByTestId('commit-hash')).toBeNull();
    expect(document.title).toBe('before');
  });
});
