import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ButtonLink } from '../src';

describe('Button', () => {
  it('is type="button" by default so it never submits a form', async () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>开始</Button>
      </form>,
    );
    const button = screen.getByRole('button', { name: '开始' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('can still be a submit button', () => {
    render(<Button type="submit">保存</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('calls onClick, but not when disabled', async () => {
    const onClick = jest.fn();
    const { rerender } = render(<Button onClick={onClick}>开始</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        开始
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ButtonLink', () => {
  it('renders a link with its href', () => {
    render(<ButtonLink href="/tetris">打开</ButtonLink>);
    expect(screen.getByRole('link', { name: '打开' })).toHaveAttribute('href', '/tetris');
  });
});
