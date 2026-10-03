import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalGiftAdapter } from '../../src/adapters/local-gift';
import { GameEngine } from '../../src/core/game';
import { constantRng } from '../../src/core/random';
import { KeyboardController } from '../../src/input/keyboard';
import { App } from '../../src/ui/App';

function setup(giftRng = constantRng(0)) {
  const engine = new GameEngine({ seed: 1, giftRng });
  const gifts = new LocalGiftAdapter(engine);
  const keyboard = new KeyboardController(engine);
  const user = userEvent.setup();
  render(<App engine={engine} gifts={gifts} keyboard={keyboard} />);
  return { engine, user };
}

describe('App', () => {
  it('shows both teams, the board and the countdown', () => {
    setup();
    expect(screen.getByRole('heading', { name: /祝福队/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /诅咒队/ })).toBeInTheDocument();
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveTextContent('再落下 3 块，双方结算');
  });

  it('example B through the UI: 10 forced shields', async () => {
    const { engine, user } = setup();
    for (let i = 0; i < 10; i += 1) {
      await user.click(screen.getByRole('button', { name: '祝福队送 1 份星光' }));
    }
    const panel = screen.getByTestId('panel-bless');
    expect(within(panel).getByTestId('slot-0')).toHaveTextContent('护盾 Lv.1');
    expect(within(panel).getByTestId('slot-0')).toHaveTextContent('锁定');
    expect(within(panel).getByTestId('slot-1')).toHaveTextContent('护盾 Lv.3');
    expect(within(panel).getByTestId('slot-1')).toHaveTextContent('能量 7/7');
    expect(within(panel).getByTestId('slot-2')).toHaveTextContent('空');
    expect(within(panel).getByTestId('reserve-bless')).toHaveTextContent('护盾2');
    expect(engine.teams.bless.overflowEnergy).toBe(0);
  });

  it('reports misses and overflow distinctly', async () => {
    const { engine, user } = setup(constantRng(0.99));
    await user.click(screen.getByRole('button', { name: '诅咒队送 10 份星光' }));
    expect(screen.getByTestId('batch-curse')).toHaveTextContent('未触发，队列没有改变');

    act(() => {
      engine.setProbability(1);
    });
    await user.click(screen.getByRole('button', { name: '诅咒队送 100 份星光' }));
    expect(screen.getByTestId('batch-curse')).toHaveTextContent('已触发，但容量已满，仅记录贡献');
  });

  it('rejects invalid custom counts without changing state', async () => {
    const { engine, user } = setup();
    const input = screen.getByRole('spinbutton', { name: '祝福队自定义份数' });
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: '祝福队送出自定义份数' }));
    expect(screen.getByRole('alert')).toHaveTextContent('份数必须是');
    expect(engine.teams.bless.giftCount).toBe(0);
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
    await user.click(screen.getByRole('button', { name: '祝福队送 1 份星光' }));
    const x = engine.active!.x;
    await user.keyboard('{ArrowLeft}');
    expect(engine.active!.x).toBe(x - 1);
    await user.keyboard(' ');
    expect(engine.lockedPieceCount).toBe(1);
    // Space did not also activate the focused gift button.
    expect(engine.teams.bless.giftCount).toBe(1);
  });

  it('typing in the custom count field does not move the piece', async () => {
    const { engine, user } = setup();
    await user.click(screen.getByRole('button', { name: '开始游戏' }));
    const x = engine.active!.x;
    const input = screen.getByRole('spinbutton', { name: '诅咒队自定义份数' });
    await user.click(input);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(engine.active!.x).toBe(x);
  });
});
