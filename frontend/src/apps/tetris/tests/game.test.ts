import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import { activate, locksLeft } from '../core/curses/state';
import { GameEngine } from '../core/game';
import { createPiece, shapeOf } from '../core/pieces';
import { constantRng, sequenceRng } from '../core/random';
import { boardWithRows, dropOnEmpty, pendingOf, setActive, startedEngine } from './helpers';

const { rows, cols } = CONFIG.board;
/** Locks one fog runs for. */
/** Locks in one settlement round. */
const ROUND = CONFIG.settlement.everyLocks;
const FOG_LOCKS = CONFIG.effects.fogRounds * ROUND;

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
    expect(createPiece(shapeOf('O'))).toMatchObject({ x: 4, y: 0 });
    expect(createPiece(shapeOf('I'))).toMatchObject({ x: 3, y: 0 });
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
    expect(engine.hold?.type).toBe(first);
    expect(engine.active!.type).toBe(next);
    expect(engine.holdPiece()).toBe(false);
    engine.board = createBoard();
    engine.hardDrop();
    const third = engine.active!.type;
    expect(engine.holdPiece()).toBe(true);
    expect(engine.active!.type).toBe(first);
    expect(engine.hold?.type).toBe(third);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it('hold does not count as a lock or advance timed effects', () => {
    const engine = startedEngine();
    activate(engine.effects, 'fog', CURSES.fog);
    engine.holdPiece();
    expect(engine.lockedPieceCount).toBe(0);
    expect(locksLeft(engine.effects.active.fog!)).toBe(FOG_LOCKS);
  });

  it('seal blocks hold without clearing the stored piece', () => {
    const engine = startedEngine();
    engine.holdPiece();
    const stored = engine.hold;
    dropOnEmpty(engine, 1);
    activate(engine.effects, 'seal', CURSES.seal);
    expect(engine.holdPiece()).toBe(false);
    expect(engine.hold).toBe(stored);
  });
});

describe('settlement cycle', () => {
  it('settles exactly every round of locks, even with empty queues', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, ROUND - 1);
    expect(engine.settlementCount).toBe(0);
    expect(engine.piecesUntilSettlement).toBe(1);
    dropOnEmpty(engine, 1);
    expect(engine.settlementCount).toBe(1);
    dropOnEmpty(engine, ROUND * 2);
    expect(engine.settlementCount).toBe(3);
  });

  it('fires each pending curse type once per settlement; the rest waits', () => {
    const engine = startedEngine();
    engine.team.pending = pendingOf({ garbage: 2, haste: 1, fog: 1 });
    dropOnEmpty(engine, ROUND - 1);
    engine.board = createBoard();
    setActive(engine, 'O');
    engine.hardDrop();
    const fired = engine.lastSettlement!.executed.map((e) => e.type);
    expect(fired).toEqual(['garbage', 'haste', 'fog']);
    expect(engine.board.filter((row) => row.includes('G') && row.includes(null))).toHaveLength(1);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    expect(engine.previewHidden).toBe(true);
    expect(engine.team.pending).toEqual(pendingOf({ garbage: 1 }));
    expect(engine.log[0]!.text).toContain('执行 垃圾行、加速、迷雾');
  });

  it('fog and seal last the configured rounds', () => {
    const engine = startedEngine();
    engine.team.pending = pendingOf({ fog: 1, seal: 1 });
    dropOnEmpty(engine, ROUND);
    expect(locksLeft(engine.effects.active.fog!)).toBe(FOG_LOCKS);
    dropOnEmpty(engine, FOG_LOCKS - 1);
    expect(engine.previewHidden).toBe(true);
    expect(engine.holdBlocked).toBe(true);
    dropOnEmpty(engine, 1);
    expect(engine.previewHidden).toBe(false);
    expect(engine.holdBlocked).toBe(false);
  });

  it('line clears do not cancel pending garbage', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, ROUND - 1);
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
    dropOnEmpty(engine, ROUND - 1);
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
  it('each haste lasts the configured rounds, and overlapping hastes multiply', () => {
    const engine = startedEngine();
    const rounds = CONFIG.effects.hasteRounds;
    engine.team.pending.haste = 1;
    dropOnEmpty(engine, ROUND); // round 0: the first haste fires
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    engine.team.pending.haste = 1;
    dropOnEmpty(engine, ROUND); // round 1: a second one
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8 * 0.8);
    dropOnEmpty(engine, ROUND * (rounds - 2)); // the last round both are active
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8 * 0.8);
    dropOnEmpty(engine, ROUND); // the first expires
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    expect(engine.activeCurses[0]).toMatchObject({
      type: 'haste',
      count: 1,
      remainingLocks: ROUND,
    });
    dropOnEmpty(engine, ROUND); // the second expires
    expect(engine.gravityIntervalMs).toBe(850);
    expect(engine.speedMultiplier).toBe(1);
  });

  it('pending hastes fire one settlement at a time', () => {
    const engine = startedEngine();
    engine.team.pending.haste = 3;
    dropOnEmpty(engine, ROUND);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    dropOnEmpty(engine, ROUND * 2);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8 ** 3);
    expect(engine.team.pending.haste).toBe(0);
  });

  it('gravity interval follows the formula and clamps', () => {
    const engine = startedEngine();
    expect(engine.speedMultiplier).toBe(1);
    engine.lines = 100;
    expect(engine.gravityIntervalMs).toBe(280);
    engine.effects.gravityMultiplier = 0.01;
    expect(engine.gravityIntervalMs).toBe(140);
    expect(engine.speedMultiplier).toBeCloseTo(850 / 140);
  });
});

describe('phases', () => {
  it('rejects gifts before start and after game over, allows them while paused', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0) });
    expect(engine.sendGifts('foo', 5).ok).toBe(false);
    expect(engine.team.giftCount).toBe(0);
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
    activate(engine.effects, 'haste', CURSES.haste);
    engine.restart();
    expect(engine.phase).toBe('ready');
    expect(engine.probability).toBe(0.25);
    expect(engine.team.giftCount).toBe(0);
    expect(engine.team.pending).toEqual(pendingOf({}));
    expect(engine.giftHistory).toEqual([]);
    expect(engine.score).toBe(0);
    expect(engine.lockedPieceCount).toBe(0);
    expect(engine.settlementCount).toBe(0);
    expect(engine.effects.active).toEqual({});
    expect(engine.gravityIntervalMs).toBe(850);
    expect(engine.hold).toBeNull();
    expect(engine.board.flat().every((c) => c === null)).toBe(true);
  });
});
