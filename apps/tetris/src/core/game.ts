import { clearFullLines, collides, createBoard } from './board';
import { CONFIG, EFFECT_INFO, GIFT_NAME } from './config';
import {
  applyCurse,
  createEffects,
  gravityIntervalMs,
  tickTimedEffects,
  type CurseOutcome,
  type EffectsState,
} from './effects';
import { isValidBatchCount, isValidProbability, processGiftBatch } from './gifts';
import { createTeam, settleTeam } from './interventions';
import { BagGenerator, createPiece, KICK_OFFSETS, pieceCells, rotateMatrix } from './pieces';
import { deriveSeed, mulberry32, type Rng } from './random';
import type {
  ActivePiece,
  Board,
  EffectType,
  GiftBatchResult,
  Phase,
  PieceType,
  TeamState,
} from './types';

export interface EngineOptions {
  seed?: number;
  pieceRng?: Rng;
  garbageRng?: Rng;
  giftRng?: Rng;
  probability?: number;
}

export type LogKind = 'gift' | 'miss' | 'settle' | 'system';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
}

export interface SettlementReport {
  index: number;
  /** Curses that fired, in queue order. Empty when the queue was empty. */
  /** Curses that fired, one per type. Empty when nothing was pending. */
  executed: { type: EffectType; outcome: CurseOutcome }[];
}

/** A gift batch as kept in the engine's history, with a stable id for rendering. */
export type GiftHistoryEntry = GiftBatchResult & { id: number };

export type GiftResponse = { ok: true; result: GiftBatchResult } | { ok: false; error: string };

type Listener = () => void;

export class GameEngine {
  phase: Phase = 'ready';
  board: Board = createBoard();
  active: ActivePiece | null = null;
  hold: PieceType | null = null;
  canHold = true;
  upcoming: PieceType[] = [];
  score = 0;
  lines = 0;
  lockedPieceCount = 0;
  settlementCount = 0;
  team: TeamState = createTeam();
  effects: EffectsState = createEffects();
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
  private bag: BagGenerator;
  private gravityMs = 0;
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
    this.probability = options.probability ?? CONFIG.gifts.defaultProbability;
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
    return gravityIntervalMs(this.lines, this.effects);
  }

  /** Current fall speed relative to the starting speed (line-clear speed-ups and haste). */
  get speedMultiplier(): number {
    return CONFIG.gravity.baseMs / this.gravityIntervalMs;
  }

  get preview(): PieceType[] {
    return this.upcoming.slice(0, CONFIG.sequence.visiblePreview);
  }

  get previewHidden(): boolean {
    return this.effects.fog !== null;
  }

  get holdBlocked(): boolean {
    return this.effects.seal !== null;
  }

  /** Y the active piece would land at. */
  get ghostY(): number | null {
    if (!this.active) return null;
    return this.active.y + this.dropDistance();
  }

  /** True when restarting would discard something. */
  get hasProgress(): boolean {
    return this.phase !== 'ready' || this.lockedPieceCount > 0 || this.team.giftCount > 0;
  }

  // ---------------------------------------------------------------- phases

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    this.spawnNext();
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
    this.board = createBoard();
    this.active = null;
    this.hold = null;
    this.canHold = true;
    this.upcoming = [];
    this.bag = new BagGenerator(this.pieceRng);
    this.fillUpcoming();
    this.score = 0;
    this.lines = 0;
    this.lockedPieceCount = 0;
    this.settlementCount = 0;
    this.team = createTeam();
    this.effects = createEffects();
    this.giftHistory = [];
    this.lastSettlement = null;
    this.log = [];
    this.gameOverReason = null;
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
    if (this.phase === 'gameOver') return { ok: false, error: '游戏已结束，不能送礼。' };
    if (!isValidBatchCount(count)) {
      return {
        ok: false,
        error: `份数必须是 ${CONFIG.gifts.minBatch}–${CONFIG.gifts.maxBatch} 的整数。`,
      };
    }
    const p = this.probability;
    const result = processGiftBatch(this.team, sender, count, p, this.giftRng);
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
    const head = `${r.sender} 送出 ${r.count} 份${GIFT_NAME}`;
    if (r.hits === 0) {
      this.pushLog('miss', `${head}：未触发诅咒。`);
      return;
    }
    const effects = (Object.entries(r.effects) as [EffectType, number][])
      .map(([type, n]) => `${EFFECT_INFO[type].name}×${n}`)
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
    if (!this.canControl) return false;
    const p = this.active!;
    const rotated = rotateMatrix(p.matrix, dir);
    for (const [kx, ky] of KICK_OFFSETS) {
      if (!collides(this.board, rotated, p.x + kx, p.y + ky)) {
        const wasGrounded = this.isGrounded();
        p.matrix = rotated;
        p.x += kx;
        p.y += ky;
        this.afterManipulation(wasGrounded);
        return true;
      }
    }
    return false;
  }

  softDrop(): boolean {
    if (!this.canControl || this.isGrounded()) return false;
    this.active!.y += 1;
    this.score += CONFIG.score.softDropPerCell;
    this.gravityMs = 0;
    this.emit();
    return true;
  }

  hardDrop(): boolean {
    if (!this.canControl) return false;
    const d = this.dropDistance();
    this.active!.y += d;
    this.score += d * CONFIG.score.hardDropPerCell;
    this.lockPiece();
    return true;
  }

  holdPiece(): boolean {
    if (!this.canControl || !this.canHold || this.holdBlocked) return false;
    const current = this.active!.type;
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
    this.spawn(type);
  }

  private spawn(type: PieceType): void {
    const piece = createPiece(type);
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
    for (const type of settleTeam(this.team)) {
      const outcome = applyCurse(this.effects, this.board, type, this.garbageRng);
      report.executed.push({ type, outcome });
      if (outcome.toppedOut) break;
    }
    this.lastSettlement = report;
    this.logSettlement(report);
    if (report.executed.some((e) => e.outcome.toppedOut)) this.endGame('垃圾行将方块挤出顶部');
  }

  private logSettlement(r: SettlementReport): void {
    const names = r.executed.map(({ type }) => EFFECT_INFO[type].name);
    const text = names.length ? `执行 ${names.join('、')}` : '没有待执行的诅咒';
    this.pushLog('settle', `第 ${r.index} 次结算：${text}。`);
  }
}
