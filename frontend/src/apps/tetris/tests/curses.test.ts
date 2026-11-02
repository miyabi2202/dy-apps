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

describe('双落', () => {
  function pairEngine() {
    return startedEngine({ pieces: { upcoming: ['T', 'O'] }, curses: { active: ['twin'] } });
  }

  it('spawns the next two pieces side by side', () => {
    const engine = pairEngine();
    expect(engine.active).toMatchObject({ type: 'T', x: 2, y: 0 });
    expect(engine.twin).toMatchObject({ type: 'O', x: 5, y: 0 });
  });

  it('moves both together, or neither when one is against the wall', () => {
    const engine = pairEngine();
    while (engine.move(-1)) {
      /* to the wall */
    }
    expect(engine.active!.x).toBe(0);
    expect(engine.twin!.x).toBe(3);
  });

  it('locks the one that lands; the other plays on and the pair counts as one lock', () => {
    const engine = pairEngine();
    engine.twin!.y = rows - 2;
    engine.tick(CONFIG.lock.delayMs);
    expect(engine.twin).toBeNull();
    expect(engine.active!.type).toBe('T');
    expect(engine.board[rows - 1]![5]).toBe('O');
    expect(engine.lockedPieceCount).toBe(0);
    engine.hardDrop();
    expect(engine.lockedPieceCount).toBe(1);
    // One pair, then the curse is over.
    expect(engine.twin).toBeNull();
  });

  it('with 调包, swaps both and says what each was, even after one lands', () => {
    const engine = startedEngine({
      pieces: { upcoming: ['T', 'O'] },
      curses: { active: ['twin', 'swap'] },
    });
    expect(engine.active!.type).not.toBe('T');
    expect(engine.twin!.type).not.toBe('O');
    expect(engine.boardView.swap).toMatchObject({ from: 'T', twinFrom: 'O' });
    // The twin (promised as O) lands; the one promised as T plays on.
    engine.twin!.y = rows - 2;
    engine.tick(CONFIG.lock.delayMs);
    expect(engine.boardView.swap).toMatchObject({ from: 'T' });
    expect(engine.boardView.swap!.twinFrom).toBeUndefined();
  });

  it('hard-drops the lower piece first, so the upper one lands on it', () => {
    const engine = pairEngine();
    engine.board = createBoard();
    engine.active!.x = 4;
    engine.active!.y = 5;
    engine.twin!.x = 4;
    engine.twin!.y = 10;
    engine.hardDrop();
    // The O fills the bottom two rows at columns 5-6; the T lands on top of it.
    expect(engine.board[rows - 1]![5]).toBe('O');
    expect(engine.board[rows - 3]![5]).toBe('T');
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('refuses hold while a pair is falling', () => {
    const engine = pairEngine();
    expect(engine.holdPiece()).toBe(false);
  });

  it('has a cutscene', () => {
    const engine = startedEngine();
    engine.team.pending.twin = 1;
    dropOnEmpty(engine, ROUND);
    expect(engine.cutscene?.curses.map((def) => def.type)).toEqual(['twin']);
  });
});
