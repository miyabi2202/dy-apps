import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalGiftAdapter } from '../../src/adapters/local-gift';
import { GameEngine } from '../../src/core/game';
import { constantRng } from '../../src/core/random';
import { KeyboardController } from '../../src/input/keyboard';
import { App } from '../../src/ui/app';

function setup(giftRng = constantRng(0)) {
  const engine = new GameEngine({ seed: 1, giftRng });
  const gifts = new LocalGiftAdapter(engine);
  const keyboard = new KeyboardController(engine);
  const user = userEvent.setup();
  render(<App engine={engine} gifts={gifts} keyboard={keyboard} />);
  return { engine, user };
}

describe('App', () => {
  it('shows the board, the countdown and the curse panel, with no team names', () => {
    setup();
    expect(screen.queryByText(/诅咒队|祝福/)).not.toBeInTheDocument();
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('再落下 3 块，诅咒结算');
    expect(screen.getByTestId('speed')).toHaveTextContent('×1.0');
    expect(screen.getByTestId('pending')).toHaveTextContent('暂无');
    expect(screen.getByTestId('gift-history')).toHaveTextContent('尚未送礼');
  });

  it('shows pending counts and logs each batch under the sender', async () => {
    const { user } = setup();
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: '送 1 份星光' }));
    }
    // constantRng(0) always hits and always draws the first curse, 垃圾行.
    const pending = screen.getByTestId('pending');
    expect(pending).toHaveTextContent('垃圾行×4');
    expect(pending).not.toHaveTextContent('加速');
    const history = screen.getByTestId('gift-history');
    expect(history).toHaveTextContent('foo 送出 1 份星光');
    expect(history).toHaveTextContent('垃圾行 ×1');
  });

  it('logs a batch that triggered nothing', async () => {
    const { user } = setup(constantRng(0.99));
    await user.click(screen.getByRole('button', { name: '送 10 份星光' }));
    expect(screen.getByTestId('gift-history')).toHaveTextContent('foo 送出 10 份星光未触发诅咒');
    expect(screen.getByTestId('pending')).toHaveTextContent('暂无');
  });

  it('rejects invalid custom counts without changing state', async () => {
    const { engine, user } = setup();
    const input = screen.getByRole('spinbutton', { name: '自定义份数' });
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: '送出自定义份数' }));
    expect(screen.getByRole('alert')).toHaveTextContent('份数必须是');
    expect(engine.team.giftCount).toBe(0);
  });

  it('starts, pauses, resumes and confirms restart in-page', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(engine.phase).toBe('playing');
    await user.click(screen.getByRole('button', { name: '暂停' }));
    expect(engine.phase).toBe('paused');
    expect(screen.getByTestId('overlay-paused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '继续游戏' }));
    expect(engine.phase).toBe('playing');

    await user.click(screen.getByRole('button', { name: '重新开始' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(engine.phase).toBe('playing');
    await user.click(screen.getByRole('button', { name: '重新开始' }));
    await user.click(screen.getByRole('button', { name: '确认重开' }));
    expect(engine.phase).toBe('ready');
  });

  it('keyboard drives the piece after clicking a gift button', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    await user.click(screen.getByRole('button', { name: '送 1 份星光' }));
    const x = engine.active!.x;
    await user.keyboard('{ArrowLeft}');
    expect(engine.active!.x).toBe(x - 1);
    await user.keyboard(' ');
    expect(engine.lockedPieceCount).toBe(1);
    // Space did not also activate the focused gift button.
    expect(engine.team.giftCount).toBe(1);
  });

  it('typing in the custom count field does not move the piece', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    const x = engine.active!.x;
    const input = screen.getByRole('spinbutton', { name: '自定义份数' });
    await user.click(input);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(engine.active!.x).toBe(x);
  });

  it('dyhub panel only connects with a valid port and room number', async () => {
    const { user } = setup();
    const connect = screen.getByRole('button', { name: '连接' });
    const port = screen.getByRole('textbox', { name: '端口' });
    const room = screen.getByRole('textbox', { name: '直播间号' });
    expect(port).toHaveValue('');
    expect(room).toHaveValue('');
    expect(connect).toBeDisabled();
    await user.type(port, '8757');
    expect(connect).toBeDisabled();
    await user.type(room, '12a');
    expect(connect).toBeDisabled();
    await user.clear(room);
    await user.type(room, '167920210669');
    expect(connect).toBeEnabled();
  });
});
