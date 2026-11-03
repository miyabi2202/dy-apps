import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { CURSES, type CurseContext } from '../core/curses';
import { scaleMatrix } from '../core/curses/giant';
import type { GameEngine } from '../core/game';
import { createPiece, pieceCells } from '../core/pieces';
import { constantRng, sequenceRng } from '../core/random';
import type { Board } from '../core/types';
import { boardWithRows, dropOnEmpty, setActive, startedEngine } from './helpers';

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

  it("marks its own slides for the board, but not the player's moves", () => {
    const engine = startedEngine({ curseRng: constantRng(0), curses: { active: ['slip'] } });
    setActive(engine, 'O');
    engine.move(1);
    expect(engine.boardView.nudge).toBeNull();
    engine.tick(CONFIG.effects.slipIntervalMs);
    expect(engine.boardView.nudge).toEqual({
      atMs: CONFIG.effects.slipIntervalMs,
      by: 'slip',
      dx: -1,
    });
  });
});

describe('镜像', () => {
  const { mirrorChance } = CONFIG.effects;

  it("swaps the player's left and right on a piece at mirrorChance, rolled for each piece", () => {
    // The first piece rolls under the chance, the next over it.
    const engine = startedEngine({
      curses: { active: ['mirror'] },
      curseRng: sequenceRng([mirrorChance / 2, (1 + mirrorChance) / 2]),
    });
    const x = engine.active!.x;
    engine.move(1);
    expect(engine.active!.x).toBe(x - 1);
    dropOnEmpty(engine, 1);
    const next = engine.active!.x;
    engine.move(1);
    expect(engine.active!.x).toBe(next + 1);
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

describe('假死', () => {
  const a = { id: 'a', name: '阿杰' };
  const { riseMs, deadMs, revealMs, stunGravity } = CONFIG.fakeDeath;
  /** A stack just tall enough for 假死, with column 0 open so nothing clears. */
  const tall = () =>
    boardWithRows(
      Array.from(
        { length: Math.round(rows * CONFIG.fakeDeath.fromHeight) },
        (_, i) => rows - 1 - i,
      ),
      [0],
    );
  /** Plays out a round; its last piece lands on a tall stack, so the settlement is in danger. */
  const settleOnTall = (engine: GameEngine) => {
    dropOnEmpty(engine, ROUND - 1);
    engine.board = tall();
    setActive(engine, 'O');
    engine.hardDrop();
  };
  const pendingShown = (engine: GameEngine) =>
    engine.pendingCurses.map(({ def, count }) => [def.type, count]);

  it('passes for 垃圾行 and waits, pending, until the stack is in danger', () => {
    const engine = startedEngine({ garbageRng: constantRng(0) });
    engine.addCurse('fakeDeath', a);
    expect(pendingShown(engine)).toEqual([['garbage', 1]]);
    engine.addCurse('garbage', a);
    expect(pendingShown(engine)).toEqual([['garbage', 2]]);
    expect(engine.nextSettlement.map((def) => def.type)).toEqual(['garbage']);
    // Low stack: the real 垃圾行 fires, 假死 keeps waiting.
    dropOnEmpty(engine, ROUND);
    expect(engine.team.pending).toMatchObject({ garbage: 0, fakeDeath: 1 });
    expect(engine.fakeDeath).toBeNull();
    expect(engine.nextSettlement).toEqual([]);
  });

  it('waits through danger until the stack is fromHeight tall', () => {
    const engine = startedEngine();
    engine.addCurse('fakeDeath', a);
    dropOnEmpty(engine, ROUND - 1);
    // An O lands on top: in danger after it, but one row short of 假死.
    const target = Math.round(rows * CONFIG.fakeDeath.fromHeight) - 1;
    expect(target).toBeGreaterThanOrEqual(Math.round(rows * CONFIG.danger.fromHeight));
    engine.board = boardWithRows(
      Array.from({ length: target - 2 }, (_, i) => rows - 1 - i),
      [0],
    );
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.fakeDeath).toBeNull();
    expect(engine.team.pending.fakeDeath).toBe(1);
  });

  it('fakes a game over in danger, leaves the board as it was, then plays on stunned', () => {
    const engine = startedEngine();
    const normal = engine.gravityIntervalMs;
    engine.addCurse('fakeDeath', a);
    settleOnTall(engine);
    const board = engine.board.map((row) => [...row]);
    expect(engine.fakeDeath).toMatchObject({
      stage: 'rise',
      sender: a,
      reason: '垃圾行将方块挤出顶部',
    });
    expect(engine.phase).toBe('playing');
    expect(engine.active).toBeNull();

    engine.tick(riseMs);
    expect(engine.fakeDeath?.stage).toBe('dead');
    // Garbage rows pushed in under the stack, enough to shove its top off the board.
    const top = board.findIndex((row) => row.some(Boolean));
    const shown = engine.boardView;
    expect(shown.board.slice(0, rows - top - 1)).toEqual(board.slice(top + 1));
    expect(
      shown.board.slice(rows - top - 1).every((row) => row.filter(Boolean).length === cols - 1),
    ).toBe(true);
    expect(shown.rowLabels!.slice(rows - top - 1).every((name) => name === '阿杰')).toBe(true);
    expect(engine.fakeMvp[0]).toMatchObject({ sender: a, finalBlow: true });
    expect(engine.mvp[0]).toMatchObject({ sender: a, finalBlow: false });

    engine.tick(deadMs);
    expect(engine.fakeDeath?.stage).toBe('reveal');
    engine.tick(revealMs);
    expect(engine.fakeDeath).toBeNull();
    expect(engine.boardView.board).toBe(engine.board);
    expect(engine.board).toEqual(board);
    expect(engine.active).not.toBeNull();
    // Twice as fast until a direction is pressed.
    expect(engine.gravityIntervalMs).toBeCloseTo(normal * stunGravity);
    engine.move(1);
    expect(engine.gravityIntervalMs).toBe(normal);
  });

  it('重新开始 on the fake screen only brings 骗你的 on sooner', () => {
    const engine = startedEngine();
    engine.addCurse('fakeDeath', a);
    settleOnTall(engine);
    engine.tick(riseMs);
    engine.revealFakeDeath();
    expect(engine.fakeDeath?.stage).toBe('reveal');
    expect(engine.phase).toBe('playing');
  });

  it('is cancelled as 垃圾行, and never put up for a vote', () => {
    const engine = startedEngine();
    engine.addCurse('fakeDeath', a);
    engine.board = boardWithRows([rows - 2, rows - 1], [4, 5]);
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.team.pending.fakeDeath).toBe(0);
    expect(engine.notices.at(-1)).toMatchObject({ kind: 'cancelled', type: 'garbage' });

    for (const r of [0, 0.3, 0.6, 0.99]) {
      const voting = startedEngine({ voteRng: constantRng(r) });
      voting.forceVote(a, 'rare');
      expect(voting.vote?.options).not.toContain('fakeDeath');
    }
  });
});

describe('夺舍', () => {
  const a = { id: 'a', name: '阿杰' };
  const { programMs, stepMs } = CONFIG.possess;

  /** A game where 夺舍 just fired at the end of a round. */
  function possessed() {
    const engine = startedEngine();
    engine.addCurse('possess', a);
    dropOnEmpty(engine, ROUND);
    return engine;
  }

  it('holds play with the next piece in view while chat queues moves; the streamer has no say', () => {
    const engine = possessed();
    expect(engine.possession).toMatchObject({ stage: 'program', sender: a, steps: [] });
    engine.tick(16);
    expect(engine.active).not.toBeNull();
    const { x, y } = engine.active!;
    expect(engine.move(1)).toBe(false);
    expect(engine.hardDrop()).toBe(false);
    engine.tick(programMs / 2);
    expect(engine.active).toMatchObject({ x, y });
    expect(engine.possessInput(a, '右右')).toBe(true);
    expect(engine.possessInput(a, '主播加油')).toBe(false);
    expect(engine.possession!.steps).toHaveLength(2);
  });

  it('then the piece falls as usual, playing the moves a step at a time, then soft-drops', () => {
    const engine = possessed();
    engine.tick(16);
    engine.possessInput(a, '左左左');
    const x = engine.active!.x;
    engine.tick(programMs);
    expect(engine.possession?.stage).toBe('play');
    // Play is on again, but the streamer still can't touch it.
    expect(engine.move(1)).toBe(false);
    engine.tick(stepMs);
    expect(engine.active!.x).toBe(x - 1);
    engine.tick(stepMs * 2);
    expect(engine.active!.x).toBe(x - 3);
    expect(engine.possession?.stage).toBe('drop');
    const y = engine.active!.y;
    engine.tick(CONFIG.input.softDropRepeatMs * 3);
    expect(engine.active!.y).toBe(y + 3);
    // Landed and locked: the next piece is the streamer's again.
    const locked = engine.lockedPieceCount;
    for (let i = 0; i < 200 && engine.lockedPieceCount === locked; i += 1) engine.tick(50);
    expect(engine.lockedPieceCount).toBe(locked + 1);
    expect(engine.possession).toBeNull();
    expect(engine.board[rows - 1]![x - 3]).not.toBeNull();
    expect(engine.move(1)).toBe(true);
  });

  it('drops the moves still queued when the piece lands first', () => {
    const engine = possessed();
    engine.tick(16);
    engine.possessInput(a, '左'.repeat(10));
    engine.tick(programMs);
    // Down on an empty floor: it locks after the lock delay, long before ten moves are done.
    engine.board = createBoard();
    engine.active!.y = engine.ghostY!;
    let ms = 0;
    while (engine.possession && ms < 10 * stepMs) {
      engine.tick(16);
      ms += 16;
    }
    expect(engine.possession).toBeNull();
    expect(ms).toBeLessThan(10 * stepMs);
    expect(engine.move(1)).toBe(true);
  });
});

describe('小偷', () => {
  const a = { id: 'a', name: '阿杰' };
  const { sneakMs, grabMs, fleeMs } = CONFIG.theft;

  it('waits, pending, while the board is empty', () => {
    const ctx = (board: Board) => ({ board }) as CurseContext;
    expect(CURSES.theft.ready!(ctx(createBoard()))).toBe(false);
    expect(CURSES.theft.ready!(ctx(boardWithRows([rows - 1], [0])))).toBe(true);
  });

  it('holds play while it sneaks in, takes a cell from the fullest row, then plays on', () => {
    const engine = startedEngine({ curseRng: constantRng(0) });
    engine.addCurse('theft', a);
    dropOnEmpty(engine, ROUND - 1);
    // The bottom row is the fullest, with column 0 open; the O lands on top at columns 4 and 5.
    engine.board = boardWithRows([rows - 1], [0]);
    engine.board[rows - 2]![3] = 'T';
    setActive(engine, 'O');
    engine.hardDrop();

    expect(engine.theft).toMatchObject({ stage: 'sneak', sender: a, x: 1, y: rows - 1, cell: 'G' });
    expect(engine.active).toBeNull();
    // Still on the board while the thief sneaks up to it.
    expect(engine.board[rows - 1]![1]).toBe('G');
    engine.move(1);
    expect(engine.active).toBeNull();

    engine.tick(sneakMs);
    expect(engine.theft?.stage).toBe('grab');
    expect(engine.board[rows - 1]![1]).toBeNull();
    expect(engine.board[rows - 1]!.filter(Boolean)).toHaveLength(cols - 2);

    engine.tick(grabMs);
    expect(engine.theft?.stage).toBe('flee');
    engine.tick(fleeMs);
    expect(engine.theft).toBeNull();
    expect(engine.active).not.toBeNull();
  });
});
