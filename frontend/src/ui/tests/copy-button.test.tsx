import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton, copyText } from '..';

describe('copyText', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the Clipboard API when it is available', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await expect(copyText('8757')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('8757');
  });

  it('falls back to a hidden textarea and execCommand, then removes the textarea', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    let copied: string | undefined;
    document.execCommand = jest.fn(() => {
      copied = document.querySelector('textarea')?.value;
      return true;
    });

    await expect(copyText('8757')).resolves.toBe(true);
    expect(copied).toBe('8757');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when the fallback fails too', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = jest.fn(() => false);

    await expect(copyText('8757')).resolves.toBe(false);
  });
});

describe('CopyButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows 已复制 after copying, then goes back to 复制', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    // After setup, which installs its own clipboard stub.
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyButton value="8757" />);

    await user.click(screen.getByRole('button', { name: '复制' }));
    expect(writeText).toHaveBeenCalledWith('8757');
    expect(await screen.findByRole('button', { name: '✓ 已复制' })).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(1600));
    expect(screen.getByRole('button', { name: '复制' })).toBeInTheDocument();
  });
});
