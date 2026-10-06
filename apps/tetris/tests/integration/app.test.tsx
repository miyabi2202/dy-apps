import type { DanmakuMessage } from '@dy-apps/services';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TetrisConfig } from '../../src/config';
import { GameEngine } from '../../src/core/game';
import { constantRng } from '../../src/core/random';
import { GiftFeed } from '../../src/gift-feed';
import { KeyboardController } from '../../src/input/keyboard';
import { App } from '../../src/ui/app';

// jsdom lays nothing out; give elements a height so the gift wall renders its cards.
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
});
afterEach(() => {
  jest.useRealTimers();
});

const CONFIG: TetrisConfig = {
  port: '',
  roomId: '',
  probability: 0.15,
  demo: { source: 'fake', intervalMs: 10_000 },
};

/** Two 5-diamond roses from one viewer: 10 draws. */
const roses = (): DanmakuMessage => ({
  id: `rose-${Math.random()}`,
  user: { id: 'u1', nickname: '阿杰' },
  text: '',
  gift: { name: '玫瑰', count: 2, diamonds: 5 },
  ts: 0,
});

function setup({ giftRng = constantRng(0), config = CONFIG } = {}) {
  const engine = new GameEngine({ seed: 1, giftRng });
  const feed = new GiftFeed(engine);
  const keyboard = new KeyboardController(engine);
  const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  render(<App engine={engine} feed={feed} keyboard={keyboard} config={config} fakeGift={roses} />);
  return { engine, feed, user };
}

const wall = () => screen.getByTestId('gift-history');

describe('App', () => {
  it('shows the board, the countdown and the curse panel, with no gift buttons', () => {
    setup();
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('再落下 3 块，诅咒结算');
    expect(screen.getByTestId('pending')).toHaveTextContent('暂无');
    expect(within(wall()).queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /送 \d+ 份/ })).not.toBeInTheDocument();
  });

  it('ignores fake gifts before the game starts', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始模拟送礼' }));
    act(() => jest.advanceTimersByTime(30_000));
    expect(engine.team.giftCount).toBe(0);
    expect(within(wall()).queryAllByRole('article')).toHaveLength(0);
  });

  it('turns each fake gift into a card with its curses, one draw per diamond', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    await user.click(screen.getByRole('button', { name: '开始模拟送礼' }));
    act(() => jest.advanceTimersByTime(300));
    expect(engine.team.giftCount).toBe(10);
    // constantRng(0) always hits and always draws the first curse, 垃圾行.
    expect(screen.getByTestId('pending')).toHaveTextContent('垃圾行×10');
    const card = within(wall()).getByRole('article');
    expect(card).toHaveTextContent('阿杰');
    expect(card).toHaveTextContent('玫瑰×2');
    expect(within(card).getByTestId('detail')).toHaveTextContent('触发 垃圾行×10');

    await user.click(screen.getByRole('button', { name: '停止模拟送礼' }));
    act(() => jest.advanceTimersByTime(60_000));
    expect(engine.team.giftCount).toBe(10);
  });

  it('says when a gift triggered nothing', async () => {
    const { feed, user } = setup({ giftRng: constantRng(0.99) });
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    act(() => {
      feed.send(roses());
    });
    expect(within(wall()).getByTestId('detail')).toHaveTextContent('未触发诅咒');
    expect(screen.getByTestId('pending')).toHaveTextContent('暂无');
  });

  it('starts from the board, pauses with P and resumes from the board', async () => {
    const { engine, user } = setup();
    expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(engine.phase).toBe('playing');
    await user.keyboard('p');
    expect(engine.phase).toBe('paused');
    expect(screen.getByTestId('overlay-paused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '继续游戏' }));
    expect(engine.phase).toBe('playing');
  });

  it('restarts after game over, emptying the gift wall', async () => {
    const { engine, feed, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    act(() => {
      feed.send(roses());
      for (let i = 0; i < 40 && engine.phase !== 'gameOver'; i += 1) engine.hardDrop();
    });
    expect(engine.phase).toBe('gameOver');
    await user.click(
      within(screen.getByTestId('overlay-gameOver')).getByRole('button', { name: '重新开始' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(engine.phase).toBe('ready');
    expect(within(wall()).queryAllByRole('article')).toHaveLength(0);
  });

  it('keyboard drives the piece after clicking a button', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    await user.click(screen.getByRole('button', { name: '开始模拟送礼' }));
    const x = engine.active!.x;
    await user.keyboard('a');
    expect(engine.active!.x).toBe(x - 1);
    await user.keyboard(' ');
    expect(engine.lockedPieceCount).toBe(1);
    // Space did not also activate the focused button.
    expect(screen.getByRole('button', { name: '停止模拟送礼' })).toBeInTheDocument();
  });

  it('the live source connects only with a valid port and room number', async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByRole('combobox', { name: '数据来源' }), 'live');
    const start = screen.getByRole('button', { name: '连接' });
    const port = screen.getByRole('textbox', { name: '端口' });
    const room = screen.getByRole('textbox', { name: '直播间号' });
    expect(start).toBeDisabled();
    await user.type(port, '8757');
    await user.type(room, '12a');
    expect(start).toBeDisabled();
    await user.clear(room);
    await user.type(room, '167920210669');
    expect(start).toBeEnabled();
  });

  it('puts the chance and the source in the OBS link', async () => {
    const { user } = setup();
    const link = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'OBS 链接' }).value;
    expect(link()).toContain('chance=15');
    expect(link()).toContain('demo=10000');
    await user.selectOptions(screen.getByRole('combobox', { name: '数据来源' }), 'live');
    await user.type(screen.getByRole('textbox', { name: '端口' }), '8757');
    await user.type(screen.getByRole('textbox', { name: '直播间号' }), '123');
    expect(link()).toContain('port=8757');
    expect(link()).toContain('room=123');
    expect(link()).not.toContain('demo=');
  });
});
