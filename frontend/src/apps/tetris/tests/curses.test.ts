import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { scaleMatrix } from '../core/curses/giant';
import type { GameEngine } from '../core/game';
import { createPiece, pieceCells } from '../core/pieces';
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

describe('垃圾行', () => {
  /** Lock `n` O pieces in the two right-hand columns, clear of the garbage holes in column 0. */
  function dropRight(engine: GameEngine, n: number) {
    for (let i = 0; i < n; i += 1) {
      setActive(engine, 'O');
      engine.active!.x = cols - 2;
      engine.hardDrop();
    }
  }

  it("prints the sender's name on its row, which keeps it as later rows push it up", () => {
    const engine = startedEngine({ garbageRng: constantRng(0) });
    engine.addCurse('garbage', { id: 'a', name: '阿杰' });
    dropOnEmpty(engine, ROUND - 1);
    engine.board = createBoard();
    dropRight(engine, 1);
    expect(engine.boardView.rowLabels![rows - 1]).toBe('阿杰');

    // One no viewer sent goes in under it, unsigned.
    engine.addCurse('garbage');
    dropRight(engine, ROUND);
    expect(engine.boardView.rowLabels!.slice(rows - 2)).toEqual(['阿杰', null]);
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
});

describe('夺舍', () => {
  const { left, right, rotate } = CONFIG.viewerCommands;
  const jie = { id: 'j', name: '阿杰' };
  const mei = { id: 'm', name: '小美' };

  function possessed() {
    return startedEngine({ pieces: { active: 'T' }, curses: { active: ['possess'] } });
  }

  it("takes the player's controls away", () => {
    const engine = possessed();
    const { x, matrix } = engine.active!;
    expect(engine.move(-1)).toBe(false);
    expect(engine.rotate(1)).toBe(false);
    expect(engine.hardDrop()).toBe(false);
    expect(engine.holdPiece()).toBe(false);
    expect(engine.active).toMatchObject({ x, matrix });
  });

  it('moves or turns the piece at once for each viewer command, and shows who sent it', () => {
    const engine = possessed();
    const x = engine.active!.x;
    expect(engine.viewerCommand(jie, left)).toBe(true);
    expect(engine.viewerCommand(mei, ` ${left} `)).toBe(true);
    expect(engine.active!.x).toBe(x - 2);
    expect(engine.viewerCommand(jie, right)).toBe(true);
    expect(engine.active!.x).toBe(x - 1);
    const matrix = engine.active!.matrix;
    expect(engine.viewerCommand(jie, rotate)).toBe(true);
    expect(engine.active!.matrix).not.toEqual(matrix);
    expect(engine.viewerInputs.map((i) => [i.user.name, i.command])).toEqual([
      ['阿杰', 'left'],
      ['小美', 'left'],
      ['阿杰', 'right'],
      ['阿杰', 'rotate'],
    ]);
  });

  it('marks a command that hits the wall, and ignores any other chat', () => {
    const engine = possessed();
    while (engine.viewerCommand(jie, left) && engine.viewerInputs.at(-1)!.worked) {
      /* to the wall */
    }
    expect(engine.active!.x).toBe(0);
    expect(engine.viewerInputs.at(-1)!.worked).toBe(false);
    expect(engine.viewerCommand(jie, '左左左')).toBe(false);
    expect(engine.viewerCommand(jie, '主播加油')).toBe(false);
  });

  it('does nothing without the curse, and hands the piece back after one lock', () => {
    const plain = startedEngine();
    const x = plain.active!.x;
    expect(plain.viewerCommand(jie, left)).toBe(false);
    expect(plain.active!.x).toBe(x);

    const engine = possessed();
    engine.viewerCommand(jie, left);
    engine.active!.y = rows - 2;
    engine.tick(CONFIG.lock.delayMs);
    expect(engine.viewerInputs).toEqual([]);
    expect(engine.viewerCommand(jie, left)).toBe(false);
    expect(engine.move(-1)).toBe(true);
  });

  it('holds its cutscene longer, so viewers can read how to play', () => {
    const engine = startedEngine();
    engine.team.pending.possess = 1;
    dropOnEmpty(engine, ROUND);
    engine.tick(CONFIG.cutscene.introMs);
    expect(engine.cutscene!.stage).toBe('intro');
    engine.tick(CONFIG.effects.possessIntroMs - CONFIG.cutscene.introMs);
    expect(engine.cutscene!.stage).toBe('ready');
  });
});

describe('巨大化', () => {
  it('spawns the next piece twice as big, centred, and it cannot be held', () => {
    const engine = startedEngine({ pieces: { upcoming: ['O'] }, curses: { active: ['giant'] } });
    const piece = engine.active!;
    expect(piece.type).toBe('O');
    const cells = pieceCells(piece.matrix, piece.x, piece.y);
    expect(cells).toHaveLength(4 * CONFIG.effects.giantScale ** 2);
    expect(piece.x + piece.matrix[0]!.length / 2).toBe(cols / 2);
    expect(engine.holdPiece()).toBe(false);
  });

  it('scales each cell into a block', () => {
    expect(scaleMatrix([[1, 0]], 2)).toEqual([
      [1, 1, 0, 0],
      [1, 1, 0, 0],
    ]);
  });
});

describe('醉酒', () => {
  it('stumbles the piece a column on its own', () => {
    const engine = startedEngine({ curses: { active: ['drunk'] }, curseRng: constantRng(0) });
    const x = engine.active!.x;
    engine.tick(CONFIG.effects.drunkStumbleMs);
    expect(engine.active!.x).toBe(x - 1);
  });

  it('sends a move the wrong way some of the time', () => {
    const wrong = startedEngine({ curses: { active: ['drunk'] }, curseRng: constantRng(0) });
    const x = wrong.active!.x;
    wrong.move(-1);
    expect(wrong.active!.x).toBe(x + 1);
    const right = startedEngine({ curses: { active: ['drunk'] }, curseRng: constantRng(0.99) });
    right.move(-1);
    expect(right.active!.x).toBe(x - 1);
  });
});

describe('延迟', () => {
  const { lagMaxMs, lagLossChance } = CONFIG.effects;
  /** A loss roll that keeps the press; each kept press then rolls its delay. */
  const KEEP = 0.99;

  it('acts on each command a random 0 to lagMaxMs later, so a later press can act first', () => {
    // Each press is kept; left waits 90% of the most, the rotation 10%, the second left half.
    const engine = startedEngine({
      curses: { active: ['lag'] },
      curseRng: sequenceRng([KEEP, 0.9, KEEP, 0.1, KEEP, 0.5]),
    });
    const x = engine.active!.x;
    const matrix = engine.active!.matrix;
    expect(engine.move(-1)).toBe(true);
    expect(engine.rotate(1)).toBe(true);
    expect(engine.move(-1)).toBe(true);
    expect(engine.active!.x).toBe(x);
    engine.tick(lagMaxMs * 0.1);
    expect(engine.active!.matrix).not.toEqual(matrix);
    expect(engine.active!.x).toBe(x);
    engine.tick(lagMaxMs * 0.4);
    expect(engine.active!.x).toBe(x - 1);
    engine.tick(lagMaxMs * 0.4);
    expect(engine.active!.x).toBe(x - 2);
  });

  it('a late hard drop still lands, and presses still waiting when it does are dropped', () => {
    const engine = startedEngine({
      curses: { active: ['lag'] },
      curseRng: sequenceRng([KEEP, 0.2, KEEP, 0.8]),
    });
    engine.hardDrop();
    engine.move(-1);
    engine.tick(lagMaxMs * 0.2);
    expect(engine.lockedPieceCount).toBe(1);
    const x = createPiece(engine.active!.shape).x;
    expect(engine.active!.x).toBe(x);
    engine.tick(lagMaxMs);
    expect(engine.active!.x).toBe(x);
  });

  it('loses a press at lagLossChance: it never acts', () => {
    const engine = startedEngine({
      curses: { active: ['lag'] },
      curseRng: sequenceRng([lagLossChance / 2, KEEP, 0]),
    });
    const x = engine.active!.x;
    expect(engine.move(-1)).toBe(true);
    expect(engine.move(1)).toBe(true);
    engine.tick(lagMaxMs);
    expect(engine.active!.x).toBe(x + 1);
  });
});
