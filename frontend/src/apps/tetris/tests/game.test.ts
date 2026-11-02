import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import { activate, locksLeft } from '../core/curses/state';
import { GameEngine } from '../core/game';
import { isConserved } from '../core/interventions';
import { createPiece, shapeOf } from '../core/pieces';
import { constantRng, sequenceRng } from '../core/random';
import {
  boardWithRows,
  dropOnEmpty,
  forceEffectRng,
  pendingOf,
  setActive,
  startedEngine,
} from './helpers';

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

  it('the debug panel queues any curse, only during a game', () => {
    expect(new GameEngine().addCurse('spin')).toBe(false);
    const engine = startedEngine();
    expect(engine.addCurse('spin')).toBe(true);
    expect(engine.team.pending).toEqual(pendingOf({ spin: 1 }));
    expect(engine.team.debugCount).toBe(1);
    dropOnEmpty(engine, ROUND);
    expect(engine.lastSettlement!.executed.map((e) => e.type)).toEqual(['spin']);
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

  it('a 2-line clear cancels one pending curse, rarest first, before the settlement', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, ROUND - 1);
    engine.team.pending = pendingOf({ garbage: 3, fog: 1 });
    engine.board = boardWithRows([rows - 1, rows - 2], [4, 5]);
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.lines).toBe(2);
    expect(engine.team.cancelledCount).toBe(1);
    expect(engine.notices.at(-1)).toMatchObject({ kind: 'cancelled', type: 'garbage', lines: 2 });
    expect(engine.lastSettlement!.executed.map((e) => e.type)).toEqual(['garbage', 'fog']);
    expect(engine.team.pending).toEqual(pendingOf({ garbage: 1 }));
  });

  it('a 1-line clear cancels nothing', () => {
    const engine = startedEngine();
    engine.team.pending.garbage = 1;
    engine.board = boardWithRows([rows - 1, rows - 2], [4, 5]);
    engine.board[rows - 2]![0] = null;
    setActive(engine, 'O');
    engine.hardDrop();
    expect(engine.lines).toBe(1);
    expect(engine.team.pending.garbage).toBe(1);
    expect(engine.notices).toEqual([]);
  });

  it('a quiet room draws a curse itself after enough empty settlements', () => {
    const quiet = CONFIG.quiet.settlements;
    // 0 draws common, then the first common curse in pool order.
    const engine = startedEngine({ quietRng: constantRng(0) });
    dropOnEmpty(engine, ROUND * (quiet - 1));
    expect(engine.quietSettlements).toBe(quiet - 1);
    expect(engine.team.systemCount).toBe(0);
    dropOnEmpty(engine, ROUND);
    expect(engine.lastSettlement!.executed.map((e) => e.type)).toEqual(['fog']);
    expect(engine.team.systemCount).toBe(1);
    expect(engine.notices.at(-1)).toMatchObject({ kind: 'quiet', type: 'fog' });
    expect(engine.quietSettlements).toBe(0);
  });

  it('anything pending restarts the quiet count', () => {
    const engine = startedEngine();
    dropOnEmpty(engine, ROUND * 2);
    expect(engine.quietSettlements).toBe(2);
    engine.team.pending.seal = 1;
    dropOnEmpty(engine, ROUND);
    expect(engine.quietSettlements).toBe(0);
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

describe('cutscenes', () => {
  const { introMs, readyMs, goMs } = CONFIG.cutscene;

  /** An engine whose next lock settles a pending 禁转, which has a cutscene. */
  function settlingNoRotate(): GameEngine {
    const engine = startedEngine();
    engine.team.pending.noRotate = 1;
    dropOnEmpty(engine, ROUND);
    return engine;
  }

  it('shows who sent each curse in its cutscene', () => {
    const engine = startedEngine({ giftRng: constantRng(0) });
    const sender = { id: '7', name: '阿杰', avatarUrl: 'https://example.com/a.png' };
    expect(engine.sendGifts(sender, 1)).toMatchObject({ ok: true });
    const type = engine.curses.find((def) => engine.team.pending[def.type] > 0)!.type;
    expect(engine.team.senders[type]).toEqual([sender]);
    engine.team.pending = pendingOf({ noRotate: 1 });
    engine.team.senders = { noRotate: [sender] };
    dropOnEmpty(engine, ROUND);
    expect(engine.cutscene).toMatchObject({ curses: [CURSES.noRotate], senders: [sender] });
  });

  it('holds the next piece for the names, READY and GO, then spawns it', () => {
    const engine = settlingNoRotate();
    expect(engine.cutscene).toMatchObject({ curses: [CURSES.noRotate], stage: 'intro' });
    expect(engine.active).toBeNull();
    expect(engine.move(1)).toBe(false);
    expect(engine.holdPiece()).toBe(false);

    engine.tick(introMs);
    expect(engine.cutscene!.stage).toBe('ready');
    engine.tick(readyMs);
    expect(engine.cutscene!.stage).toBe('go');
    engine.tick(goMs - 1);
    expect(engine.cutscene).not.toBeNull();
    engine.tick(1);
    expect(engine.cutscene).toBeNull();
    expect(engine.active).not.toBeNull();
    // The curse covers the piece that spawned after it.
    expect(engine.rotate(1)).toBe(false);
  });

  it('a curse without a cutscene spawns the next piece at once', () => {
    const engine = startedEngine();
    engine.team.pending.fog = 1;
    dropOnEmpty(engine, ROUND);
    expect(engine.cutscene).toBeNull();
    expect(engine.active).not.toBeNull();
  });

  it('stands still while paused and ends on restart', () => {
    const engine = settlingNoRotate();
    engine.pause();
    engine.tick(60_000);
    expect(engine.cutscene).not.toBeNull();
    engine.resume();
    engine.restart();
    expect(engine.cutscene).toBeNull();
  });
});

describe('movement hooks', () => {
  it('lockDelayMultiplier scales the lock delay; 0 locks on touch', () => {
    const half = startedEngine({
      curses: { pool: [{ ...CURSES.fog, lockDelayMultiplier: 0.5 }], active: ['fog'] },
    });
    expect(half.lockDelayMs).toBe(CONFIG.lock.delayMs / 2);

    const engine = startedEngine({
      curses: { pool: [{ ...CURSES.fog, lockDelayMultiplier: 0 }], active: ['fog'] },
    });
    setActive(engine, 'O');
    groundActive(engine);
    engine.tick(1);
    expect(engine.lockedPieceCount).toBe(1);
  });

  it("mirrorsMoves swaps the player's left and right", () => {
    const engine = startedEngine({
      curses: { pool: [{ ...CURSES.fog, mirrorsMoves: true }], active: ['fog'] },
    });
    setActive(engine, 'O');
    expect(engine.movesMirroredBy?.type).toBe('fog');
    engine.move(1);
    expect(engine.active!.x).toBe(3);
  });

  it('tryMove moves the piece for a curse, unmirrored', () => {
    const engine = startedEngine({
      curses: {
        pool: [{ ...CURSES.fog, mirrorsMoves: true, onTick: (ctx) => void ctx.tryMove(1) }],
        active: ['fog'],
      },
    });
    setActive(engine, 'O');
    engine.tick(1);
    expect(engine.active!.x).toBe(5);
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

describe('like meter', () => {
  const { firstThreshold, maxThreshold, idleResetMs } = CONFIG.likes;
  const a = { id: 'a', name: '阿杰' };
  const b = { id: 'b', name: '小美' };

  it('fills at the first threshold and draws a curse from whoever liked most', () => {
    const engine = startedEngine({ likeRng: constantRng(0) });
    expect(engine.addLikes(a, firstThreshold - 40)).toBe(true);
    expect(engine.addLikes(b, 30)).toBe(true);
    expect(engine.likeMeter).toEqual({
      likes: firstThreshold - 10,
      threshold: firstThreshold,
      top: { sender: a, likes: firstThreshold - 40 },
    });
    engine.addLikes(b, 15);
    // 0 draws common, then the first common curse in pool order.
    expect(engine.team.pending.fog).toBe(1);
    expect(engine.team.senders.fog).toEqual([a]);
    expect(engine.notices.at(-1)).toMatchObject({ kind: 'likes', type: 'fog', sender: a });
    // The 5 past the threshold carry over as the last liker's.
    expect(engine.likeMeter).toEqual({
      likes: 5,
      threshold: firstThreshold * 2,
      top: { sender: b, likes: 5 },
    });
    expect(isConserved(engine.team)).toBe(true);
  });

  it('doubles each time up to the cap, even from one big batch', () => {
    const engine = startedEngine();
    let total = 0;
    for (let t = firstThreshold; t < maxThreshold; t *= 2) total += t;
    engine.addLikes(a, total + maxThreshold * 2);
    expect(engine.team.likeCount).toBe(Math.log2(maxThreshold / firstThreshold) + 2);
    expect(engine.likeMeter.threshold).toBe(maxThreshold);
    expect(engine.likeMeter.likes).toBe(0);
  });

  it('starts over at the first threshold after a while with nothing drawn', () => {
    const engine = startedEngine();
    engine.addLikes(a, firstThreshold + 20);
    engine.tick(idleResetMs - 1);
    expect(engine.likeMeter.threshold).toBe(firstThreshold * 2);
    engine.tick(1);
    expect(engine.likeMeter).toEqual({ likes: 0, threshold: firstThreshold, top: null });
  });

  it('counts only during a game', () => {
    expect(new GameEngine().addLikes(a, 10)).toBe(false);
    expect(startedEngine().addLikes(a, 0)).toBe(false);
  });
});

describe('votes', () => {
  const { durationMs, extendMs, resultMs } = CONFIG.votes;
  const drawer = { id: 'd', name: '阿杰' };
  const a = { id: 'a', name: '小美' };
  const b = { id: 'b', name: '老王' };

  /** A game with a rare curse's vote open; voteRng 0 always opens one and breaks ties to 1. */
  function voting(): GameEngine {
    const engine = startedEngine({ voteRng: constantRng(0), giftRng: forceEffectRng('garbage') });
    engine.sendGifts(drawer, 1);
    return engine;
  }

  it('an uncommon or rare draw opens a vote between two of its rarity, and stops play', () => {
    const engine = voting();
    const vote = engine.vote!;
    expect(vote).toMatchObject({ sender: drawer, rarity: 'rare', ballots: [], winner: null });
    expect(vote.options).toHaveLength(2);
    expect(new Set(vote.options).size).toBe(2);
    expect(vote.options.every((t) => CURSES[t].rarity === 'rare')).toBe(true);
    expect(engine.team.pending.garbage).toBe(0);
    expect(isConserved(engine.team)).toBe(true);
    const y = engine.active!.y;
    expect(engine.move(1)).toBe(false);
    engine.tick(durationMs - 1);
    expect(engine.active!.y).toBe(y);
  });

  it('a common draw never does, nor one while a vote is open', () => {
    const common = startedEngine({ voteRng: constantRng(0), giftRng: constantRng(0) });
    common.sendGifts(drawer, 1);
    expect(common.vote).toBeNull();
    const engine = voting();
    const id = engine.vote!.id;
    engine.sendGifts(drawer, 1);
    expect(engine.vote!.id).toBe(id);
    expect(engine.team.pending.garbage).toBe(1);
  });

  it('reads a 1 or a 2 anywhere in the chat; both or neither does not count', () => {
    const engine = voting();
    expect(engine.castVote(a, '选1')).toBe(true);
    expect(engine.castVote(b, '2222')).toBe(true);
    expect(engine.castVote(b, '12')).toBe(false);
    expect(engine.castVote(b, '加油')).toBe(false);
    expect(engine.vote!.ballots.map((x) => [x.voter.name, x.choice])).toEqual([
      ['小美', 0],
      ['老王', 1],
    ]);
  });

  it('lets a viewer change their vote, and the most votes win for the drawer', () => {
    const engine = voting();
    const [first, second] = engine.vote!.options;
    engine.castVote(a, '1');
    engine.castVote(b, '1');
    engine.castVote(a, '2');
    engine.castVote(a, '2');
    engine.castVote(b, '2');
    expect(engine.vote!.ballots).toHaveLength(2);
    engine.tick(durationMs);
    expect(engine.vote!.winner).toBe(1);
    expect(engine.team.pending[second!]).toBe(1);
    expect(engine.team.pending[first!]).toBe(0);
    expect(engine.team.senders[second!]).toEqual([drawer]);
    expect(isConserved(engine.team)).toBe(true);
    // The winner shows for a moment, then play goes on.
    engine.tick(resultMs);
    expect(engine.vote).toBeNull();
    expect(engine.move(1)).toBe(true);
  });

  it('with no votes or a tie, picks at random', () => {
    const engine = voting();
    engine.tick(durationMs);
    expect(engine.vote!.winner).toBe(0);
    const tied = voting();
    tied.castVote(a, '1');
    tied.castVote(b, '2');
    tied.tick(durationMs);
    expect(tied.vote!.winner).toBe(0);
  });

  it('the streamer can add time while it is open', () => {
    const engine = voting();
    expect(engine.extendVote()).toBe(true);
    engine.tick(durationMs);
    expect(engine.vote!.winner).toBeNull();
    engine.tick(extendMs);
    expect(engine.vote!.winner).not.toBeNull();
    expect(engine.extendVote()).toBe(false);
  });
});
