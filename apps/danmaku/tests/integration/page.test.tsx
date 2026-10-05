import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DanmakuPage } from '../../src/danmaku-page';

const SETTINGS_KEY = 'dy-apps:danmaku.settings';

// jsdom lays nothing out; give elements a height so the virtual list renders rows.
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
});
afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
});

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  window.history.replaceState(null, '', '/danmaku');
});
afterEach(() => {
  jest.useRealTimers();
});

function setup(url = '/danmaku') {
  window.history.replaceState(null, '', url);
  const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  const view = render(<DanmakuPage />);
  return { user, ...view };
}

const count = () => Number(/(\d+) 条/.exec(screen.getByText(/\d+ 条$/).textContent)![1]);
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

describe('DanmakuPage editor', () => {
  it('shows the controls, an empty preview and the build hash', () => {
    setup();
    expect(screen.getByRole('heading', { name: /弹幕墙/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '弹幕设置' })).toBeInTheDocument();
    expect(screen.getByTestId('commit-hash')).toHaveTextContent('dev');
    expect(count()).toBe(0);
  });

  it('runs the demo until stopped, and clears', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '开始预览' }));
    advance(10_000);
    const spawned = count();
    expect(spawned).toBeGreaterThan(3);
    expect(
      within(screen.getByTestId('danmaku-list')).getAllByRole('article').length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '停止预览' }));
    advance(10_000);
    expect(count()).toBe(spawned);

    await user.click(screen.getByRole('button', { name: '清空' }));
    expect(count()).toBe(0);
    expect(within(screen.getByTestId('danmaku-list')).queryAllByRole('article')).toHaveLength(0);
  });

  it('starts the demo straight away with ?demo', () => {
    setup('/danmaku?demo=300');
    expect(screen.getByRole('button', { name: '停止预览' })).toBeInTheDocument();
    advance(3000);
    expect(count()).toBeGreaterThan(0);
  });

  it('saves settings and restores them on the next visit', async () => {
    const { user, unmount } = setup();
    await user.selectOptions(screen.getByLabelText('样式'), 'neon');
    await user.selectOptions(screen.getByLabelText('字体'), 'custom');
    await user.type(screen.getByLabelText('字体名称'), 'LXGW');
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('border=neon');
    unmount();

    setup();
    expect(screen.getByLabelText('样式')).toHaveValue('neon');
    expect(screen.getByLabelText('字体名称')).toHaveValue('LXGW');
  });

  it('resets to the default style', async () => {
    const { user } = setup('/danmaku?border=dashed');
    await user.click(screen.getByRole('button', { name: '恢复默认样式' }));
    expect(screen.getByLabelText('样式')).toHaveValue('aurora');
  });

  it('disables the hue slider while colouring per user', async () => {
    const { user } = setup();
    expect(screen.getByLabelText('色相')).toBeDisabled();
    await user.click(screen.getByLabelText('每位用户不同颜色'));
    expect(screen.getByLabelText('色相')).toBeEnabled();
  });

  it('builds an OBS link with the current settings, and the demo while it runs', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText('样式'), 'ribbon');
    const link = () => new URL(screen.getByLabelText<HTMLInputElement>('OBS 链接').value);
    expect(link().pathname).toBe('/danmaku');
    expect(link().searchParams.get('obs')).toBe('1');
    expect(link().searchParams.get('border')).toBe('ribbon');
    expect(link().searchParams.has('demo')).toBe(false);

    await user.click(screen.getByRole('button', { name: '开始预览' }));
    expect(link().searchParams.get('demo')).toBe('900');
  });
});

describe('DanmakuPage OBS mode', () => {
  it('renders only the overlay, styled from the URL', () => {
    setup('/danmaku?obs=1&demo=300&border=neon');
    expect(screen.queryByRole('region', { name: '弹幕设置' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    advance(3000);
    expect(
      within(screen.getByTestId('danmaku-list')).getAllByRole('article').length,
    ).toBeGreaterThan(0);
  });

  it('never overwrites the editor’s saved settings', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify('border=dashed'));
    setup('/danmaku?obs=1&border=neon');
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify('border=dashed'));
  });
});
