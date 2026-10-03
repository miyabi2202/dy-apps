import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Tetris' })).toBeInTheDocument();
  });

  it('increments the counter on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: 'Count: 0' });
    await user.click(button);
    expect(button).toHaveTextContent('Count: 1');
  });
});
