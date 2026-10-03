import { createBoard } from '../../src/core/board';
import { CONFIG } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { createPiece } from '../../src/core/pieces';
import { constantRng, sequenceRng } from '../../src/core/random';
import { boardWithRows, dropOnEmpty, setActive, startedEngine } from '../helpers';

const { rows, cols } = CONFIG.board;

function groundActive(engine: GameEngine) {
  while (engine.softDrop()) {
    /* drop to the floor */
  }
}

describe('spawning and movement', () => {
  it('spawns centred at y = 0', () => {
    const engine = startedEngine();
    setActive(engine, 'T');
    expect(engine.active).toMatchObject({ x: 3, y: 0 });
    expect(createPiece('O')).toMatchObject({ x: 4, y: 0 });
    expect(createPiece('I')).toMatchObject({ x: 3, y: 0 });
  });

  it('stops at walls', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    let moves = 0;
    while (engine.move(-1)) moves += 1;
    expect(moves).toBe(4);
    expect(engine.active!.x).toBe(0);
    while (engine.move(1)) moves += 1;
    expect(engine.active!.x).toBe(cols - 2);
  });

  it('rotates clockwise and counter-clockwise, kicking off walls', () => {
    const engine = startedEngine();
    setActive(engine, 'T');
    engine.active!.y = 5;
    expect(engine.rotate(1)).toBe(true);
    expect(engine.active!.matrix).toEqual([
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ]);
    expect(engine.rotate(-1)).toBe(true);
    expect(engine.active!.matrix).toEqual([
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ]);
    // Vertical I against the right wall kicks left when rotated back.
    setActive(engine, 'I');
    engine.active!.y = 5;
    engine.rotate(1);
    while (engine.move(1)) {
      /* to the wall */
    }
    expect(engine.rotate(1)).toBe(true);
    expect(engine.active!.x).toBeLessThanOrEqual(cols - 4);
  });

  it('rotation fails when every kick collides', () => {
    const engine = startedEngine();
    // A full board except a horizontal slot in row 10 that exactly fits a flat I.
    engine.board = boardWithRows([...Array(rows).keys()], []);
    for (let c = 3; c <= 6; c += 1) engine.board[10]![c] = null;
    setActive(engine, 'I');
    engine.active!.y = 9;
    expect(engine.rotate(1)).toBe(false);
    expect(engine.rotate(-1)).toBe(false);
  });

  it('ghost matches the hard-drop landing row', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    expect(engine.ghostY).toBe(rows - 2);
    engine.board[rows - 1]![4] = 'G';
    expect(engine.ghostY).toBe(rows - 3);
  });

  it('soft drop scores 1 per cell, hard drop 2 per cell', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    engine.softDrop();
    engine.softDrop();
    expect(engine.score).toBe(2);
    const before = engine.score;
    const distance = engine.ghostY! - engine.active!.y;
    engine.hardDrop();
    expect(engine.score).toBe(before + distance * 2);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('clears lines and scores 100/300/500/800', () => {
    for (const [n, points] of [
      [1, 100],
      [2, 300],
      [3, 500],
      [4, 800],
    ] as const) {
      const engine = startedEngine();
      const rowsToFill = Array.from({ length: n }, (_, i) => rows - 1 - i);
      engine.board = boardWithRows(rowsToFill, [0]);
      setActive(engine, 'I');
      engine.rotate(1); // vertical, in column 5
      while (engine.move(-1)) {
        /* to column 0 */
      }
      // Rotated I occupies matrix column 2, so x = -2 puts it in column 0.
      expect(engine.active!.x).toBe(-2);
      const dropScore = engine.ghostY! - engine.active!.y;
      engine.hardDrop();
      expect(engine.lines).toBe(n === 4 ? 4 : n);
      expect(engine.score).toBe(points + dropScore * 2);
    }
  });
});

describe('gravity and lock delay', () => {
  it('falls one row per gravity interval and keeps the remainder', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    engine.tick(849);
    expect(engine.active!.y).toBe(0);
    engine.tick(1);
    expect(engine.active!.y).toBe(1);
    engine.tick(850 * 2 + 10);
    expect(engine.active!.y).toBe(3);
    engine.tick(840);
    expect(engine.active!.y).toBe(4);
  });

  it('locks 500 ms after touching the ground', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    groundActive(engine);
    engine.tick(499);
    expect(engine.lockedPieceCount).toBe(0);
    engine.tick(1);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('grounded moves reset the lock timer at most 12 times', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    groundActive(engine);
    for (let i = 0; i < CONFIG.lock.maxResets; i += 1) {
      engine.tick(400);
      expect(engine.move(i % 2 ? 1 : -1)).toBe(true);
    }
    expect(engine.lockedPieceCount).toBe(0);
    engine.tick(400);
    engine.move(1); // 13th move: legal but no reset
    engine.tick(100);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('air moves do not use up resets', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    for (let i = 0; i < 30; i += 1) engine.move(i % 2 ? 1 : -1);
    groundActive(engine);
    for (let i = 0; i < CONFIG.lock.maxResets; i += 1) {
      engine.tick(400);
      engine.move(i % 2 ? 1 : -1);
    }
    expect(engine.lockedPieceCount).toBe(0);
  });

  it('pausing stops gravity, lock delay and settlement', () => {
    const engine = startedEngine();
    setActive(engine, 'O');
    engine.pause();
    engine.tick(10_000);
    expect(engine.active!.y).toBe(0);
    expect(engine.hardDrop()).toBe(false);
    expect(engine.move(1)).toBe(false);
    engine.resume();
    engine.tick(850);
    expect(engine.active!.y).toBe(1);
  });

  it('repeated hard drops lock exactly once each', () => {
    const engine = startedEngine();
    for (let i = 0; i < 5; i += 1) {
      engine.board = createBoard();
      engine.hardDrop();
      expect(engine.lockedPieceCount).toBe(i + 1);
      expect(engine.active).not.toBeNull();
    }
    expect(engine.settlementCount).toBe(1);
  });
});

describe('hold', () => {
  it('holds once per piece; swaps the stored shape back', () => {
    const engine = startedEngine();
    const first = engine.active!.type;
    const next = engine.upcoming[0];
    expect(engine.holdPiece()).toBe(true);
    expect(engine.hold).toBe(first);
    expect(engine.active!.type).toBe(next);
    expect(engine.holdPiece()).toBe(false);
    engine.board = createBoard();
    engine.hardDrop();
    const third = engine.active!.type;
    expect(engine.holdPiece()).toBe(true);
    expect(engine.active!.type).toBe(first);
    expect(engine.hold).toBe(third);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('hold does not count as a lock or advance timed effects', () => {
    const engine = startedEngine();
    engine.effects.fog = { remainingLocks: 3 };
    engine.holdPiece();
    expect(engine.lockedPieceCount).toBe(0);
    expect(engine.effects.fog.remainingLocks).toBe(3);
  });

  it('seal blocks hold without clearing the stored piece', () => {
    const engine = startedEngine();
    engine.holdPiece();
    const stored = engine.hold;
    dropOnEmpty(engine, 1);
    engine.effects.seal = { remainingLocks: 1 };
    expect(engine.holdPiece()).toBe(false);
    expect(engine.hold).toBe(stored);
  });
});

describe('preview', () => {
  it('fog hides the preview only', () => {
    const engine = startedEngine();
    engine.effects.fog = { remainingLocks: 2 };
    expect(engine.previewHidden).toBe(true);
    expect(engine.ghostY).not.toBeNull();
    dropOnEmpty(engine, 2);
    expect(engine.previewHidden).toBe(false);
  });
});

describe('settlement cycle', () => {
  it('settles exactly every 3 locks, even with empty queues', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    expect(engine.settlementCount).toBe(0);
    expect(engine.piecesUntilSettlement).toBe(1);
    dropOnEmpty(engine, 1);
    expect(engine.settlementCount).toBe(1);
    dropOnEmpty(engine, 6);
    expect(engine.settlementCount).toBe(3);
  });

  it('fires each pending curse type once per settlement; the rest waits', () => {
    const engine = startedEngine();
    engine.team.pending = { garbage: 2, haste: 1, fog: 1, seal: 0 };
    dropOnEmpty(engine, 2);
    engine.board = createBoard();
    setActive(engine, 'O');
    engine.hardDrop();
    const fired = engine.lastSettlement!.executed.map((e) => e.type);
    expect(fired).toEqual(['garbage', 'haste', 'fog']);
    expect(engine.board.filter((row) => row.includes('G') && row.includes(null))).toHaveLength(1);
    expect(engine.effects.hasteMultiplier).toBeCloseTo(0.8);
    expect(engine.previewHidden).toBe(true);
    expect(engine.team.pending).toEqual({ garbage: 1, haste: 0, fog: 0, seal: 0 });
    expect(engine.log[0]!.text).toContain('执行 垃圾行、加速、迷雾');
  });

  it('fog and seal last three pieces', () => {
    const engine = startedEngine();
    engine.team.pending = { garbage: 0, haste: 0, fog: 1, seal: 1 };
    dropOnEmpty(engine, 3);
    expect(engine.effects.fog).toEqual({ remainingLocks: 3 });
    dropOnEmpty(engine, 2);
    expect(engine.previewHidden).toBe(true);
    expect(engine.holdBlocked).toBe(true);
    dropOnEmpty(engine, 1);
    expect(engine.previewHidden).toBe(false);
    expect(engine.holdBlocked).toBe(false);
  });

  it('line clears do not cancel pending garbage', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    engine.team.pending.garbage = 3;
    engine.board = boardWithRows([rows - 1, rows - 2], [4, 5]);
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.lines).toBe(2);
    expect(engine.lastSettlement!.executed.map((e) => e.type)).toEqual(['garbage']);
    expect(engine.team.pending.garbage).toBe(2);
  });

  it('garbage pushing blocks off the top ends the game', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    engine.team.pending.garbage = 1;
    engine.board = createBoard();
    engine.board[0]![0] = 'G';
    engine.board[1]![9] = 'G';
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
    expect(engine.gameOverReason).toContain('垃圾行');
    expect(engine.active).toBeNull();
  });

  it('locking above the visible top ends the game', () => {
    const engine = startedEngine();
    engine.board = boardWithRows([...Array(rows).keys()].slice(1), [0]);
    setActive(engine, 'I');
    engine.rotate(1);
    engine.active!.y = -3;
    engine.active!.x = -2;
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
  });

  it('spawn collision ends the game', () => {
    const engine = startedEngine();
    engine.board = createBoard();
    engine.board[0]![3] = 'G';
    engine.board[0]![4] = 'G';
    engine.board[0]![5] = 'G';
    engine.board[0]![6] = 'G';
    engine.board[1]![3] = 'G';
    engine.board[1]![4] = 'G';
    engine.board[1]![5] = 'G';
    engine.board[1]![6] = 'G';
    setActive(engine, 'O');
    engine.active!.x = 0;
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
    expect(engine.gameOverReason).toContain('出生');
  });
});

describe('example F: haste and speed', () => {
  it('haste never expires', () => {
    const engine = startedEngine();
    engine.team.pending.haste = 1;
    dropOnEmpty(engine, 3);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    dropOnEmpty(engine, 30);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    expect(engine.speedMultiplier).toBeCloseTo(1.25);
  });

  it('pending hastes stack one settlement at a time', () => {
    const engine = startedEngine();
    engine.team.pending.haste = 3;
    dropOnEmpty(engine, 3);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    dropOnEmpty(engine, 6);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8 ** 3);
    expect(engine.team.pending.haste).toBe(0);
  });

  it('gravity interval follows the formula and clamps', () => {
    const engine = startedEngine();
    expect(engine.speedMultiplier).toBe(1);
    engine.lines = 100;
    expect(engine.gravityIntervalMs).toBe(280);
    engine.effects.hasteMultiplier = 0.01;
    expect(engine.gravityIntervalMs).toBe(140);
    expect(engine.speedMultiplier).toBeCloseTo(850 / 140);
  });
});

describe('phases', () => {
  it('allows gifts before start and while paused, rejects after game over', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0) });
    expect(engine.sendGifts('foo', 5).ok).toBe(true);
    engine.start();
    engine.pause();
    expect(engine.sendGifts('foo', 5).ok).toBe(true);
    engine.resume();
    engine.board = createBoard();
    engine.board[0]![4] = 'G';
    engine.board[1]![4] = 'G';
    setActive(engine, 'O');
    engine.active!.x = 0;
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
    const before = JSON.stringify(engine.team);
    expect(engine.sendGifts('foo', 10).ok).toBe(false);
    expect(JSON.stringify(engine.team)).toBe(before);
  });

  it('pieces cannot move before start', () => {
    const engine = new GameEngine({ seed: 1 });
    expect(engine.active).toBeNull();
    expect(engine.move(1)).toBe(false);
  });

  it('restart clears everything but keeps the probability', () => {
    const engine = new GameEngine({ seed: 1, giftRng: sequenceRng([0, 0.1]) });
    engine.setProbability(0.25);
    engine.start();
    engine.sendGifts('foo', 50);
    dropOnEmpty(engine, 3);
    engine.effects.hasteMultiplier = 0.5;
    engine.restart();
    expect(engine.phase).toBe('ready');
    expect(engine.probability).toBe(0.25);
    expect(engine.team.giftCount).toBe(0);
    expect(engine.team.pending).toEqual({ garbage: 0, haste: 0, fog: 0, seal: 0 });
    expect(engine.giftHistory).toEqual([]);
    expect(engine.score).toBe(0);
    expect(engine.lockedPieceCount).toBe(0);
    expect(engine.settlementCount).toBe(0);
    expect(engine.effects.hasteMultiplier).toBe(1);
    expect(engine.hold).toBeNull();
    expect(engine.board.flat().every((c) => c === null)).toBe(true);
  });
});
