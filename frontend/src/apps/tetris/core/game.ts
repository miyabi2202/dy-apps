import { clearFullLines, collides, createBoard } from './board';
import { CONFIG } from './config';
import {
  CURSE_LIST,
  type Command,
  type CurseContext,
  type CurseDef,
  type CurseOutcome,
  type EffectType,
} from './curses';
import {
  activate,
  createEffects,
  durationOf,
  gravityIntervalMs,
  locksLeft,
  tickTimedEffects,
  type EffectsState,
} from './curses/state';
import { isValidBatchCount, isValidProbability, processGiftBatch } from './gifts';
import { createTeam, settleTeam } from './interventions';
import {
  BagGenerator,
  createPiece,
  KICK_OFFSETS,
  pieceCells,
  rotateMatrix,
  shapeOf,
} from './pieces';
import { deriveSeed, mulberry32, type Rng } from './random';
import type {
  ActivePiece,
  Board,
  BoardView,
  GiftBatchResult,
  Phase,
  PieceShape,
  PieceType,
  TeamState,
} from './types';

/** The pieces a game starts with. Applied at construction and again on restart. */
export interface PiecesSetup {
  /** The piece in play when the game starts; spawned as given, with no onSpawn hooks. Default: the first of the queue. */
  active?: PieceType | PieceShape;
  /** The first pieces of the queue in order; the 7-bag continues after them. */
  upcoming?: readonly PieceType[];
}

/** The curses a game has. Applied at construction and again on restart. */
export interface CursesSetup {
  /**
   * Curse definitions in play, in settlement order: what gifts draw from, what settles and
   * what the panels list. Default: CURSE_LIST (registry order); a test can put
   * `{ ...CURSES.fog, onTick: spy }` in it. Throws on a duplicate type.
   */
  pool?: readonly CurseDef<unknown>[];
  /** Curses in effect from the start (生效中), one instance each, with a fresh initState(). Throws for a type not in the pool or a def that does not last. */
  active?: readonly EffectType[];
  /** Triggered curses waiting for the next settlement (待执行), as counts per type. Throws for a type not in the pool. */
  upcoming?: Partial<Record<EffectType, number>>;
}

/**
 * Real randomness and an empty, standard game by default. `board`, `pieces`, `curses` and
 * `gravityMultiplier` set up a scenario (for tests and demos) that restart() starts again.
 */
export interface EngineOptions {
  seed?: number;
  pieceRng?: Rng;
  garbageRng?: Rng;
  giftRng?: Rng;
  /** For curses that roll dice. */
  curseRng?: Rng;
  probability?: number;
  /** The starting board; copied, so the caller's array is never changed. Default: empty. */
  board?: Board;
  pieces?: PiecesSetup;
  curses?: CursesSetup;
  /**
   * The starting drop-interval multiplier (0.5 is twice as fast), default 1; must be finite and
   * above 0. `lines` also affects gravity and stays a public field.
   */
  gravityMultiplier?: number;
}

/** An active curse as the panels show it. */
export interface ActiveCurseView {
  type: EffectType;
  def: CurseDef<unknown>;
  /** Locks until its last instance ends. */
  remainingLocks: number;
  /** Instances running at once. */
  count: number;
}

export type LogKind = 'gift' | 'miss' | 'settle' | 'system';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
}

export interface SettlementReport {
  index: number;
  /** Curses that fired, one per type, in registry order. Empty when nothing was pending. */
  executed: { type: EffectType; outcome: CurseOutcome }[];
}

/** A gift batch as kept in the engine's history, with a stable id for rendering. */
export type GiftHistoryEntry = GiftBatchResult & { id: number };

export type GiftResponse = { ok: true; result: GiftBatchResult } | { ok: false; error: string };

type Listener = () => void;

export class GameEngine {
  phase: Phase = 'ready';
  board: Board;
  active: ActivePiece | null = null;
  /** The held piece's shape, unrotated. */
  hold: PieceShape | null = null;
  canHold = true;
  upcoming: PieceType[] = [];
  score = 0;
  lines = 0;
  lockedPieceCount = 0;
  settlementCount = 0;
  team: TeamState;
  /** The curses in play, in settlement order. */
  readonly curses: readonly CurseDef<unknown>[];
  effects: EffectsState;
  probability: number;
  /** Recent gift batches, newest first, at most CONFIG.gifts.historySize. */
  giftHistory: GiftHistoryEntry[] = [];
  lastSettlement: SettlementReport | null = null;
  log: LogEntry[] = [];
  gameOverReason: string | null = null;

  /** Bumped on every change the panels care about (not on gravity or movement). */
  version = 0;

  private readonly pieceRng: Rng;
  private readonly garbageRng: Rng;
  private readonly giftRng: Rng;
  private readonly curseRng: Rng;
  private readonly curseByType: Partial<Record<EffectType, CurseDef<unknown>>> = {};
  /** The curses' types in order: what gifts draw from and settlement fires in. */
  private readonly pool: readonly EffectType[];
  /** Which settlement queue a curse in play belongs to. */
  private readonly queueOf: (type: EffectType) => string;
  private readonly initialBoard: Board | undefined;
  private readonly initialUpcoming: readonly PieceType[];
  private readonly initialActivePiece: PieceShape | undefined;
  private readonly initialPending: Partial<Record<EffectType, number>>;
  private readonly initialActive: readonly EffectType[];
  private readonly initialGravity: number;
  private bag: BagGenerator;
  private gravityMs = 0;
  /** Foreground play time, for canvas animations. */
  private playMs = 0;
  private lockMs = 0;
  private lockResets = 0;
  private logId = 0;
  private batchId = 0;
  private readonly listeners: Set<Listener> = new Set();

  constructor(options: EngineOptions = {}) {
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
    this.pieceRng = options.pieceRng ?? mulberry32(deriveSeed(seed, 0));
    this.garbageRng = options.garbageRng ?? mulberry32(deriveSeed(seed, 1));
    this.giftRng = options.giftRng ?? mulberry32(deriveSeed(seed, 2));
    this.curseRng = options.curseRng ?? mulberry32(deriveSeed(seed, 3));
    this.probability = options.probability ?? CONFIG.gifts.defaultProbability;
    const { pieces = {}, curses = {} } = options;
    this.curses = curses.pool ?? CURSE_LIST;
    if (this.curses.length === 0) throw new RangeError('The curse pool is empty');
    for (const def of this.curses) {
      if (this.curseByType[def.type]) throw new RangeError(`Duplicate curse: ${def.type}`);
      this.curseByType[def.type] = def;
    }
    this.pool = this.curses.map((def) => def.type);
    this.queueOf = (type) => this.curseByType[type]!.queue;
    this.initialPending = { ...curses.upcoming };
    for (const type of Object.keys(this.initialPending) as EffectType[]) {
      if (!this.curseByType[type]) throw new RangeError(`Pending curse not in play: ${type}`);
    }
    this.initialActive = [...(curses.active ?? [])];
    for (const type of this.initialActive) {
      const def = this.curseByType[type];
      if (!def) throw new RangeError(`Active curse not in play: ${type}`);
      if (durationOf(def) === undefined) throw new RangeError(`Curse does not last: ${type}`);
    }
    this.initialGravity = options.gravityMultiplier ?? 1;
    if (!Number.isFinite(this.initialGravity) || this.initialGravity <= 0) {
      throw new RangeError(`Invalid gravity multiplier: ${String(options.gravityMultiplier)}`);
    }
    this.team = this.startingTeam();
    this.effects = this.startingEffects();
    this.initialBoard = options.board?.map((row) => [...row]);
    this.initialUpcoming = [...(pieces.upcoming ?? [])];
    this.initialActivePiece =
      typeof pieces.active === 'string' ? shapeOf(pieces.active) : pieces.active;
    this.board = this.startingBoard();
    this.upcoming = [...this.initialUpcoming];
    this.bag = new BagGenerator(this.pieceRng);
    this.fillUpcoming();
  }

  // ---------------------------------------------------------------- subscriptions

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private pushLog(kind: LogKind, text: string): void {
    this.logId += 1;
    this.log.unshift({ id: this.logId, kind, text });
    if (this.log.length > CONFIG.log.maxEntries) this.log.length = CONFIG.log.maxEntries;
  }

  // ---------------------------------------------------------------- derived state

  get piecesUntilSettlement(): number {
    return CONFIG.settlement.everyLocks - (this.lockedPieceCount % CONFIG.settlement.everyLocks);
  }

  get gravityIntervalMs(): number {
    return gravityIntervalMs(this.lines, this.gravityMultiplier);
  }

  /** The scenario's base multiplier times every active curse instance's. */
  private get gravityMultiplier(): number {
    let m = this.effects.gravityMultiplier;
    for (const { def, count } of this.activeCurses) {
      if (def.gravityMultiplier !== undefined) m *= def.gravityMultiplier ** count;
    }
    return m;
  }

  /** Current fall speed relative to the starting speed (line-clear speed-ups and haste). */
  get speedMultiplier(): number {
    return CONFIG.gravity.baseMs / this.gravityIntervalMs;
  }

  get preview(): PieceType[] {
    return this.upcoming.slice(0, CONFIG.sequence.visiblePreview);
  }

  /** Active curses in the order of `curses`. */
  get activeCurses(): ActiveCurseView[] {
    const out: ActiveCurseView[] = [];
    for (const def of this.curses) {
      const active = this.effects.active[def.type];
      if (active) {
        out.push({
          type: def.type,
          def,
          remainingLocks: locksLeft(active),
          count: active.instances.length,
        });
      }
    }
    return out;
  }

  /** The first active curse that hides the preview, if any. */
  get previewHiddenBy(): CurseDef<unknown> | null {
    return this.activeCurses.find(({ def }) => def.hidesPreview)?.def ?? null;
  }

  get previewHidden(): boolean {
    return this.previewHiddenBy !== null;
  }

  /** The first active curse that blocks `cmd`, if any. */
  blockedBy(cmd: Command): CurseDef<unknown> | null {
    return this.activeCurses.find(({ def }) => def.blocks?.includes(cmd))?.def ?? null;
  }

  get holdBlocked(): boolean {
    return this.blockedBy('hold') !== null;
  }

  /** Y the active piece would land at. */
  get ghostY(): number | null {
    if (!this.active) return null;
    return this.active.y + this.dropDistance();
  }

  /** What the board renderer draws. */
  get boardView(): BoardView {
    return {
      board: this.board,
      active: this.active,
      ghostY: this.ghostY,
      activeCurses: this.activeCurses.map((a) => a.type),
      timeMs: this.playMs,
    };
  }

  // ---------------------------------------------------------------- phases

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    if (this.initialActivePiece) this.spawn(this.initialActivePiece);
    else this.spawnNext();
    this.emit();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.emit();
  }

  togglePause(): void {
    if (this.phase === 'ready') this.start();
    else if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  /** Clears everything except the selected trigger probability. */
  restart(): void {
    this.phase = 'ready';
    this.board = this.startingBoard();
    this.active = null;
    this.hold = null;
    this.canHold = true;
    this.upcoming = [...this.initialUpcoming];
    this.bag = new BagGenerator(this.pieceRng);
    this.fillUpcoming();
    this.score = 0;
    this.lines = 0;
    this.lockedPieceCount = 0;
    this.settlementCount = 0;
    this.team = this.startingTeam();
    this.effects = this.startingEffects();
    this.giftHistory = [];
    this.lastSettlement = null;
    this.log = [];
    this.gameOverReason = null;
    this.playMs = 0;
    this.resetPieceTimers();
    this.pushLog('system', '已重新开始，触发概率保持不变。');
    this.emit();
  }

  setProbability(p: number): boolean {
    if (!isValidProbability(p)) return false;
    this.probability = p;
    this.emit();
    return true;
  }

  private endGame(reason: string): void {
    this.phase = 'gameOver';
    this.active = null;
    this.gameOverReason = reason;
    this.pushLog('system', `游戏结束：${reason}`);
  }

  // ---------------------------------------------------------------- gifts

  sendGifts(sender: string, count: number): GiftResponse {
    // Gifts count only during a game: not while getting ready, nor after it ends.
    if (this.phase === 'ready') return { ok: false, error: '游戏未开始，送礼不计入。' };
    if (this.phase === 'gameOver') return { ok: false, error: '游戏已结束，不能送礼。' };
    if (!isValidBatchCount(count)) {
      return {
        ok: false,
        error: `份数必须是 ${CONFIG.gifts.minBatch}–${CONFIG.gifts.maxBatch} 的整数。`,
      };
    }
    const p = this.probability;
    const result = processGiftBatch(this.team, sender, count, p, this.giftRng, this.curses);
    this.batchId += 1;
    this.giftHistory.unshift({ ...result, id: this.batchId });
    if (this.giftHistory.length > CONFIG.gifts.historySize) {
      this.giftHistory.length = CONFIG.gifts.historySize;
    }
    this.logBatch(result);
    this.emit();
    return { ok: true, result };
  }

  private logBatch(r: GiftBatchResult): void {
    const head = `${r.sender} 送出 ${r.count} 钻礼物`;
    if (r.hits === 0) {
      this.pushLog('miss', `${head}：未触发诅咒。`);
      return;
    }
    const effects = (Object.entries(r.effects) as [EffectType, number][])
      .map(([type, n]) => `${this.curseByType[type]!.name}×${n}`)
      .join('、');
    this.pushLog('gift', `${head}：触发 ${r.hits}（${effects}），未触发 ${r.misses}。`);
  }

  // ---------------------------------------------------------------- piece control

  private get canControl(): boolean {
    return this.phase === 'playing' && this.active !== null;
  }

  private isGrounded(): boolean {
    const p = this.active!;
    return collides(this.board, p.matrix, p.x, p.y + 1);
  }

  private dropDistance(): number {
    const p = this.active!;
    let d = 0;
    while (!collides(this.board, p.matrix, p.x, p.y + d + 1)) d += 1;
    return d;
  }

  /** A legal grounded move or rotation resets the lock timer, up to the limit. */
  private afterManipulation(wasGrounded: boolean): void {
    if (wasGrounded && this.lockResets < CONFIG.lock.maxResets) {
      this.lockMs = 0;
      this.lockResets += 1;
    }
  }

  move(dx: number): boolean {
    if (!this.canControl) return false;
    const p = this.active!;
    if (collides(this.board, p.matrix, p.x + dx, p.y)) return false;
    const wasGrounded = this.isGrounded();
    p.x += dx;
    this.afterManipulation(wasGrounded);
    return true;
  }

  rotate(dir: 1 | -1): boolean {
    if (!this.canControl || this.blockedBy('rotate')) return false;
    return this.rotateWithKicks(dir, true);
  }

  /** Rotate with the first kick that fits; only the player's rotations may reset the lock. */
  private rotateWithKicks(dir: 1 | -1, mayResetLock: boolean): boolean {
    const p = this.active!;
    const rotated = rotateMatrix(p.matrix, dir);
    for (const [kx, ky] of KICK_OFFSETS) {
      if (!collides(this.board, rotated, p.x + kx, p.y + ky)) {
        const wasGrounded = this.isGrounded();
        p.matrix = rotated;
        p.x += kx;
        p.y += ky;
        if (mayResetLock) this.afterManipulation(wasGrounded);
        return true;
      }
    }
    return false;
  }

  softDrop(): boolean {
    if (!this.canControl || this.isGrounded() || this.blockedBy('softDrop')) return false;
    this.active!.y += 1;
    this.score += CONFIG.score.softDropPerCell;
    this.gravityMs = 0;
    this.emit();
    return true;
  }

  hardDrop(): boolean {
    if (!this.canControl || this.blockedBy('hardDrop')) return false;
    const d = this.dropDistance();
    this.active!.y += d;
    this.score += d * CONFIG.score.hardDropPerCell;
    this.lockPiece();
    return true;
  }

  holdPiece(): boolean {
    if (!this.canControl || !this.canHold || this.blockedBy('hold')) return false;
    const current = this.active!.shape;
    if (this.hold === null) {
      this.hold = current;
      this.spawnNext();
    } else {
      const stored = this.hold;
      this.hold = current;
      this.spawn(stored);
    }
    this.canHold = false;
    this.emit();
    return true;
  }

  /** Advance gravity and lock delay by `dtMs` of foreground play time. */
  tick(dtMs: number): void {
    if (!this.canControl) return;
    this.playMs += dtMs;
    for (const { type, def } of this.activeCurses) {
      def.onTick?.(this.curseContext(), dtMs, this.effects.active[type]!.state);
    }
    if (this.isGrounded()) {
      this.gravityMs = 0;
      this.lockMs += dtMs;
      if (this.lockMs >= CONFIG.lock.delayMs) this.lockPiece();
      return;
    }
    this.lockMs = 0;
    this.gravityMs += dtMs;
    const interval = this.gravityIntervalMs;
    while (this.gravityMs >= interval) {
      this.gravityMs -= interval;
      if (this.isGrounded()) {
        this.gravityMs = 0;
        break;
      }
      this.active!.y += 1;
    }
  }

  // ---------------------------------------------------------------- spawning & locking

  private startingTeam(): TeamState {
    const team = createTeam();
    for (const [type, n] of Object.entries(this.initialPending) as [EffectType, number][]) {
      team.pending[type] = n;
    }
    return team;
  }

  private startingEffects(): EffectsState {
    const effects = createEffects();
    effects.gravityMultiplier = this.initialGravity;
    for (const type of this.initialActive) activate(effects, type, this.curseByType[type]!);
    return effects;
  }

  /** A fresh copy of the board the game starts from. */
  private startingBoard(): Board {
    return this.initialBoard?.map((row) => [...row]) ?? createBoard();
  }

  private fillUpcoming(): void {
    while (this.upcoming.length < CONFIG.sequence.minBuffer) this.upcoming.push(this.bag.next());
  }

  private resetPieceTimers(): void {
    this.gravityMs = 0;
    this.lockMs = 0;
    this.lockResets = 0;
  }

  private spawnNext(): void {
    const type = this.upcoming.shift()!;
    this.fillUpcoming();
    let piece = createPiece(shapeOf(type));
    for (const { type: curse, def } of this.activeCurses) {
      if (def.onSpawn) {
        piece = def.onSpawn(this.curseContext(), piece, this.effects.active[curse]!.state);
      }
    }
    this.place(piece);
  }

  /** A hold swap or a scenario's first piece: spawned unrotated, and no curse sees it. */
  private spawn(shape: PieceShape): void {
    this.place(createPiece(shape));
  }

  private place(piece: ActivePiece): void {
    this.resetPieceTimers();
    if (collides(this.board, piece.matrix, piece.x, piece.y)) {
      this.active = null;
      this.endGame('新方块的出生位置被占用');
      return;
    }
    this.active = piece;
  }

  private lockPiece(): void {
    const piece = this.active;
    if (!piece || this.phase !== 'playing') return;
    this.active = null;

    const cells = pieceCells(piece.matrix, piece.x, piece.y);
    if (cells.some(([, y]) => y < 0)) {
      this.endGame('方块锁定在可见区域顶部之外');
      this.emit();
      return;
    }
    for (const [x, y] of cells) this.board[y]![x] = piece.type;

    const cleared = clearFullLines(this.board);
    if (cleared > 0) {
      this.score += CONFIG.score.lineClear[cleared] ?? 0;
      this.lines += cleared;
    }

    tickTimedEffects(this.effects);
    this.lockedPieceCount += 1;
    this.canHold = true;

    if (this.lockedPieceCount % CONFIG.settlement.everyLocks === 0) {
      this.settle();
      if ((this.phase as Phase) === 'gameOver') {
        this.emit();
        return;
      }
    }
    this.spawnNext();
    this.emit();
  }

  /** Atomic settlement: every curse type with anything pending fires once. */
  private settle(): void {
    this.settlementCount += 1;
    const report: SettlementReport = { index: this.settlementCount, executed: [] };
    let gameOver: string | undefined;
    for (const type of settleTeam(this.team, this.pool, this.queueOf)) {
      const def = this.curseByType[type]!;
      // A lasting curse is (re)activated first, so apply sees the state it keeps.
      const state =
        durationOf(def) === undefined ? def.initState?.() : activate(this.effects, type, def).state;
      const outcome = def.apply?.(this.curseContext(), state) ?? {};
      report.executed.push({ type, outcome });
      gameOver = outcome.gameOver;
      if (gameOver) break;
    }
    this.lastSettlement = report;
    this.logSettlement(report);
    if (gameOver) this.endGame(gameOver);
  }

  /** What curses get to see and do: never the engine itself. */
  private curseContext(): CurseContext {
    return {
      board: this.board,
      active: this.active,
      curseRng: this.curseRng,
      garbageRng: this.garbageRng,
      tryRotate: (dir) => this.active !== null && this.rotateWithKicks(dir, false),
      trySetShape: (shape) => this.trySetShape(shape),
    };
  }

  /** Swap the active piece's shape in place if it fits; the lock timer is left alone. */
  private trySetShape(shape: PieceShape): boolean {
    const p = this.active;
    if (!p || collides(this.board, shape.matrix, p.x, p.y)) return false;
    p.shape = shape;
    p.type = shape.type;
    p.matrix = shape.matrix.map((row) => [...row]);
    return true;
  }

  private logSettlement(r: SettlementReport): void {
    const names = r.executed.map(({ type }) => this.curseByType[type]!.name);
    const text = names.length ? `执行 ${names.join('、')}` : '没有待执行的诅咒';
    this.pushLog('settle', `第 ${r.index} 次结算：${text}。`);
  }
}
