import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { constantRng, sequenceRng } from '../core/random';
import { dropOnEmpty, setActive, startedEngine } from './helpers';

const { rows, cols } = CONFIG.board;
const ROUND = CONFIG.settlement.everyLocks;

describe('调包', () => {
  it('spawns a different piece than the queue had, and says what it was', () => {
    const engine = startedEngine({ curses: { active: ['swap'] } });
    const promised = engine.upcoming[0]!;
    dropOnEmpty(engine, 1);
    expect(engine.active!.type).not.toBe(promised);
    expect(engine.boardView.swap).toMatchObject({ from: promised });
  });

  it('leaves a hold swap alone', () => {
    const engine = startedEngine({ curses: { active: ['swap'] } });
    setActive(engine, 'T');
    engine.holdPiece();
    dropOnEmpty(engine, 1);
    engine.holdPiece();
    expect(engine.active!.type).toBe('T');
    expect(engine.boardView.swap).toBeNull();
  });
});

describe('烂牌', () => {
  it('turns the next pieces into S or Z, in the preview too', () => {
    const engine = startedEngine();
    engine.team.pending.snakes = 1;
    dropOnEmpty(engine, ROUND);
    const n = CONFIG.effects.snakesPieces;
    const dealt = [engine.active!.type, ...engine.upcoming.slice(0, n - 1)];
    expect(dealt.every((t) => t === 'S' || t === 'Z')).toBe(true);
  });
});

describe('落石', () => {
  it('drops stones onto whatever is in their columns', () => {
    // Two stones (1 + 1), in column 0 and then column 3.
    const engine = startedEngine({ garbageRng: sequenceRng([0.99, 0, 0.3]) });
    engine.team.pending.rockfall = 1;
    dropOnEmpty(engine, ROUND - 1);
    engine.board = createBoard();
    engine.board[rows - 1]![0] = 'G';
    setActive(engine, 'O');
    engine.active!.x = cols - 2;
    engine.hardDrop();
    expect(engine.board[rows - 2]![0]).toBe('G');
    expect(engine.board[rows - 1]![3]).toBe('G');
    expect(engine.boardView.drops?.cells).toEqual([
      [0, rows - 2],
      [3, rows - 1],
    ]);
  });

  it('a stone with no room in its column ends the game', () => {
    const engine = startedEngine({ garbageRng: constantRng(0) });
    engine.team.pending.rockfall = 1;
    dropOnEmpty(engine, ROUND - 1);
    engine.board = createBoard();
    for (let r = 0; r < rows; r += 1) engine.board[r]![0] = 'G';
    setActive(engine, 'O');
    engine.active!.x = cols - 2;
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
    expect(engine.gameOverReason).toContain('落石');
  });
});

describe('急躁', () => {
  it('locks a piece the moment it touches down', () => {
    const engine = startedEngine({ curses: { active: ['hasty'] } });
    expect(engine.lockDelayMs).toBe(0);
    setActive(engine, 'O');
    engine.active!.y = rows - 2;
    engine.tick(1);
    expect(engine.lockedPieceCount).toBe(1);
  });
});

describe('打滑', () => {
  it('slides the piece a column on its own every interval, the other way when blocked', () => {
    const engine = startedEngine({ curseRng: constantRng(0), curses: { active: ['slip'] } });
    setActive(engine, 'O');
    engine.tick(CONFIG.effects.slipIntervalMs - 1);
    expect(engine.active!.x).toBe(4);
    engine.tick(1);
    expect(engine.active!.x).toBe(3);
    engine.active!.x = 0;
    engine.tick(CONFIG.effects.slipIntervalMs);
    expect(engine.active!.x).toBe(1);
  });

  it('has a cutscene', () => {
    const engine = startedEngine();
    engine.team.pending.slip = 1;
    dropOnEmpty(engine, ROUND);
    expect(engine.cutscene?.curses.map((def) => def.type)).toEqual(['slip']);
  });
});

describe('镜像', () => {
  it("swaps the player's left and right", () => {
    const engine = startedEngine({ curses: { active: ['mirror'] } });
    setActive(engine, 'O');
    engine.move(1);
    expect(engine.active!.x).toBe(3);
    engine.move(-1);
    expect(engine.active!.x).toBe(4);
  });
});
