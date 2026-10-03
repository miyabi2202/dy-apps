import { createBoard } from '../../src/core/board';
import { CONFIG } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { createPiece } from '../../src/core/pieces';
import { constantRng, sequenceRng } from '../../src/core/random';
import { boardWithRows, dropOnEmpty, makeNode, setActive, startedEngine } from '../helpers';

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
    engine.effects.slow = { level: 1, remainingLocks: 3 };
    engine.holdPiece();
    expect(engine.lockedPieceCount).toBe(0);
    expect(engine.effects.slow.remainingLocks).toBe(3);
  });

  it('seal blocks hold without clearing the stored piece', () => {
    const engine = startedEngine();
    engine.holdPiece();
    const stored = engine.hold;
    dropOnEmpty(engine, 1);
    engine.effects.seal = { level: 1, remainingLocks: 1 };
    expect(engine.holdPiece()).toBe(false);
    expect(engine.hold).toBe(stored);
  });
});

describe('long-piece credits and preview', () => {
  it('preview shows I for pending credits and spawns match the preview', () => {
    const engine = startedEngine();
    engine.effects.longCredits = 2;
    const raw = [...engine.upcoming];
    expect(engine.preview).toEqual(['I', 'I', raw[2]]);
    dropOnEmpty(engine, 1);
    expect(engine.active!.type).toBe('I');
    expect(engine.effects.longCredits).toBe(1);
    // The sequence entry was still consumed.
    expect(engine.upcoming[0]).toBe(raw[1]);
  });

  it('a swap from a non-empty hold does not consume a credit; an empty hold does', () => {
    const engine = startedEngine();
    engine.effects.longCredits = 1;
    engine.holdPiece(); // empty hold: takes next from sequence -> I
    expect(engine.active!.type).toBe('I');
    expect(engine.effects.longCredits).toBe(0);

    const e2 = startedEngine();
    e2.holdPiece();
    dropOnEmpty(e2, 1);
    e2.effects.longCredits = 1;
    const stored = e2.hold;
    e2.holdPiece();
    expect(e2.active!.type).toBe(stored);
    expect(e2.effects.longCredits).toBe(1);
  });

  it('fog hides the preview only', () => {
    const engine = startedEngine();
    engine.effects.fog = { level: 2, remainingLocks: 2 };
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

  it('slot timing is 3 - locks % 3 + index * 3', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 1);
    expect([0, 1, 2].map((i) => engine.locksUntilSlot(i))).toEqual([2, 5, 8]);
  });

  it('example D: shield runs before garbage', () => {
    const engine = startedEngine();
    engine.teams.bless.queue = [makeNode('shield', 3)];
    engine.teams.curse.queue = [makeNode('garbage', 7)];
    dropOnEmpty(engine, 3);
    const report = engine.lastSettlement!;
    expect(report.curse!.outcome).toMatchObject({
      rawGarbage: 3,
      shieldAbsorbed: 2,
      netGarbage: 1,
    });
    expect(engine.effects.shield).toBe(0);
    const garbageRows = engine.board.filter((row) => row.filter((c) => c === 'G').length === 9);
    expect(garbageRows).toHaveLength(1);
  });

  it('example E: line clears on the settling lock cancel garbage first', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    engine.teams.curse.queue = [makeNode('garbage', 7)];
    engine.board = boardWithRows([rows - 1, rows - 2], [4, 5]);
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.lines).toBe(2);
    expect(engine.lastSettlement!.curse!.outcome).toMatchObject({ rawGarbage: 1, netGarbage: 1 });
    expect(engine.teams.curse.spentEnergy).toBe(7);
  });

  it('clear removes bottom rows with no score or line credit', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    engine.teams.bless.queue = [makeNode('clear', 3)];
    engine.board = boardWithRows([rows - 1, rows - 2, rows - 3], [0]);
    setActive(engine, 'O');
    engine.active!.x = 0;
    engine.active!.y = 0;
    engine.board[0]![9] = 'G'; // marker row that should not move off
    const scoreBefore = engine.score;
    const drop = engine.ghostY! - engine.active!.y;
    engine.hardDrop();
    expect(engine.lines).toBe(0);
    expect(engine.score).toBe(scoreBefore + drop * 2);
    // The O landed on rows 15-16 above the three filled rows, then 2 bottom rows were removed.
    expect(engine.board[rows - 1]!.filter(Boolean).length).toBeGreaterThan(0);
    expect(engine.board[0]!.every((c) => c === null)).toBe(true);
  });

  it('garbage pushing blocks off the top ends the game', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, 2);
    engine.teams.curse.queue = [makeNode('garbage', 1)];
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

describe('example F: timed effects', () => {
  it('haste gained on lock 3 covers pieces 4-6 and expires on lock 6', () => {
    const engine = startedEngine();
    engine.teams.curse.queue = [makeNode('haste', 1)];
    dropOnEmpty(engine, 3);
    expect(engine.effects.haste).toEqual({ level: 1, remainingLocks: 3 });
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.8);
    engine.pause();
    engine.resume();
    engine.rotate(1);
    engine.holdPiece();
    expect(engine.effects.haste!.remainingLocks).toBe(3);
    dropOnEmpty(engine, 2);
    expect(engine.effects.haste!.remainingLocks).toBe(1);
    dropOnEmpty(engine, 1);
    expect(engine.effects.haste).toBeNull();
    expect(engine.gravityIntervalMs).toBe(850);
  });

  it('reapplying replaces the level and resets duration; slow and haste multiply', () => {
    const engine = startedEngine();
    engine.teams.bless.queue = [makeNode('slow', 7)];
    engine.teams.curse.queue = [makeNode('haste', 1), makeNode('haste', 7)];
    dropOnEmpty(engine, 3);
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 1.75 * 0.8);
    dropOnEmpty(engine, 3);
    expect(engine.effects.haste).toEqual({ level: 3, remainingLocks: 3 });
    expect(engine.effects.slow).toBeNull();
    expect(engine.gravityIntervalMs).toBeCloseTo(850 * 0.5);
  });

  it('gravity interval follows the formula and clamps', () => {
    const engine = startedEngine();
    engine.lines = 100;
    expect(engine.gravityIntervalMs).toBe(280);
    engine.effects.haste = { level: 3, remainingLocks: 3 };
    expect(engine.gravityIntervalMs).toBe(140);
    engine.lines = 0;
    engine.effects.haste = null;
    engine.effects.slow = { level: 3, remainingLocks: 3 };
    expect(engine.gravityIntervalMs).toBeCloseTo(1487.5);
  });

  it('shield caps at 6 and long credits at 3', () => {
    const engine = startedEngine();
    engine.effects.shield = 5;
    engine.effects.longCredits = 2;
    engine.teams.bless.queue = [makeNode('shield', 7), makeNode('long', 7)];
    dropOnEmpty(engine, 3);
    expect(engine.effects.shield).toBe(6);
    dropOnEmpty(engine, 3);
    expect(engine.effects.longCredits).toBeLessThanOrEqual(3);
  });
});

describe('phases', () => {
  it('allows gifts before start and while paused, rejects after game over', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0) });
    expect(engine.sendGifts('bless', 5).ok).toBe(true);
    engine.start();
    engine.pause();
    expect(engine.sendGifts('curse', 5).ok).toBe(true);
    engine.resume();
    engine.board = createBoard();
    engine.board[0]![4] = 'G';
    engine.board[1]![4] = 'G';
    setActive(engine, 'O');
    engine.active!.x = 0;
    engine.hardDrop();
    expect(engine.phase).toBe('gameOver');
    const before = JSON.stringify(engine.teams);
    expect(engine.sendGifts('bless', 10).ok).toBe(false);
    expect(JSON.stringify(engine.teams)).toBe(before);
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
    engine.sendGifts('bless', 50);
    dropOnEmpty(engine, 3);
    engine.restart();
    expect(engine.phase).toBe('ready');
    expect(engine.probability).toBe(0.25);
    expect(engine.teams.bless.giftCount).toBe(0);
    expect(engine.teams.bless.queue).toEqual([]);
    expect(engine.score).toBe(0);
    expect(engine.lockedPieceCount).toBe(0);
    expect(engine.settlementCount).toBe(0);
    expect(engine.effects.shield).toBe(0);
    expect(engine.hold).toBeNull();
    expect(engine.board.flat().every((c) => c === null)).toBe(true);
  });
});
