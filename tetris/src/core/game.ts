import { clearFullLines, collides, createBoard } from './board';
import { CONFIG, EFFECT_INFO, GIFT_NAME, SIDE_INFO } from './config';
import {
  applyBless,
  applyCurse,
  createEffects,
  gravityIntervalMs,
  tickTimedEffects,
  type BlessOutcome,
  type CurseOutcome,
  type EffectsState,
} from './effects';
import { isValidBatchCount, isValidProbability, processGiftBatch } from './gifts';
import { cancelGarbage, createTeam, levelOf, settleTeam } from './interventions';
import { BagGenerator, createPiece, KICK_OFFSETS, pieceCells, rotateMatrix } from './pieces';
import { deriveSeed, mulberry32, type Rng } from './random';
import type {
  ActivePiece,
  Board,
  EffectNode,
  EffectType,
  GiftBatchResult,
  IdSource,
  Phase,
  PieceType,
  Side,
  TeamState,
} from './types';

export interface EngineOptions {
  seed?: number;
  pieceRng?: Rng;
  garbageRng?: Rng;
  giftRng?: Rng;
  probability?: number;
}

export type LogKind = 'gift' | 'miss' | 'overflow' | 'promote' | 'settle' | 'cancel' | 'system';

export interface LogEntry {
  id: number;
  kind: LogKind;
  side?: Side;
  text: string;
}

export interface SettlementReport {
  index: number;
  bless: { node: EffectNode; outcome: BlessOutcome } | null;
  curse: { node: EffectNode; outcome: CurseOutcome } | null;
  promotedEffects: Record<Side, EffectType[]>;
}

export type GiftResponse = { ok: true; result: GiftBatchResult } | { ok: false; error: string };

type Listener = () => void;

export class GameEngine {
  phase: Phase = 'ready';
  board: Board = createBoard();
  active: ActivePiece | null = null;
  hold: PieceType | null = null;
  canHold = true;
  /** Raw upcoming sequence, before long-piece substitution. */
  upcoming: PieceType[] = [];
  score = 0;
  lines = 0;
  lockedPieceCount = 0;
  settlementCount = 0;
  teams: Record<Side, TeamState> = { bless: createTeam(), curse: createTeam() };
  effects: EffectsState = createEffects();
  probability: number;
  lastBatch: Record<Side, GiftBatchResult | null> = { bless: null, curse: null };
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
  private nodeId = 0;
  private reserveOrder = 0;
  private logId = 0;
  private readonly listeners: Set<Listener> = new Set();

  readonly ids: IdSource = {
    nextNodeId: () => (this.nodeId += 1),
    nextReserveOrder: () => (this.reserveOrder += 1),
  };

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

  private pushLog(kind: LogKind, text: string, side?: Side): void {
    this.logId += 1;
    this.log.unshift({ id: this.logId, kind, side, text });
    if (this.log.length > CONFIG.log.maxEntries) this.log.length = CONFIG.log.maxEntries;
  }

  // ---------------------------------------------------------------- derived state

  get piecesUntilSettlement(): number {
    return CONFIG.settlement.everyLocks - (this.lockedPieceCount % CONFIG.settlement.everyLocks);
  }

  /** Locks until the node at queue `index` executes. */
  locksUntilSlot(index: number): number {
    return this.piecesUntilSettlement + index * CONFIG.settlement.everyLocks;
  }

  get gravityIntervalMs(): number {
    return gravityIntervalMs(this.lines, this.effects);
  }

  /** What the next pieces will actually be, including pending long-piece credits. */
  get preview(): PieceType[] {
    return this.upcoming
      .slice(0, CONFIG.sequence.visiblePreview)
      .map((type, i) => (i < this.effects.longCredits ? 'I' : type));
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
    return (
      this.phase !== 'ready' ||
      this.lockedPieceCount > 0 ||
      this.teams.bless.giftCount > 0 ||
      this.teams.curse.giftCount > 0
    );
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
    this.teams = { bless: createTeam(), curse: createTeam() };
    this.effects = createEffects();
    this.lastBatch = { bless: null, curse: null };
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

  sendGifts(side: Side, count: number): GiftResponse {
    if (this.phase === 'gameOver') return { ok: false, error: '游戏已结束，不能送礼。' };
    if (!isValidBatchCount(count)) {
      return {
        ok: false,
        error: `份数必须是 ${CONFIG.gifts.minBatch}–${CONFIG.gifts.maxBatch} 的整数。`,
      };
    }
    const p = this.probability;
    const result = processGiftBatch(this.teams[side], side, count, p, this.giftRng, this.ids);
    this.lastBatch[side] = result;
    this.logBatch(result);
    this.emit();
    return { ok: true, result };
  }

  private logBatch(r: GiftBatchResult): void {
    const team = SIDE_INFO[r.side].name;
    if (r.hits === 0) {
      this.pushLog('miss', `${team}送出 ${r.count} 份${GIFT_NAME}：未触发，队列没有改变。`, r.side);
      return;
    }
    const effects = (Object.entries(r.effects) as [EffectType, number][])
      .map(([type, n]) => `${EFFECT_INFO[type].name}×${n}`)
      .join('、');
    const parts = [`入队/合并 ${r.queuedEnergy}`];
    if (r.reservedEnergy) parts.push(`储备 ${r.reservedEnergy}`);
    if (r.overflowEnergy) parts.push(`满额记账 ${r.overflowEnergy}`);
    this.pushLog(
      'gift',
      `${team}送出 ${r.count} 份${GIFT_NAME}：触发 ${r.hits}（${effects}），未触发 ${r.misses}；${parts.join('，')}。`,
      r.side,
    );
    if (r.overflowEnergy > 0) {
      this.pushLog(
        'overflow',
        `${team}：${r.overflowEnergy} 点已触发，但容量已满，仅记录贡献。`,
        r.side,
      );
    }
    for (const type of r.promotedEffects) {
      this.pushLog('promote', `${team}：${EFFECT_INFO[type].name}升级后插队前移一位。`, r.side);
    }
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

  /** Take the next piece from the sequence, applying a long-piece credit if any. */
  private spawnNext(): void {
    let type = this.upcoming.shift()!;
    this.fillUpcoming();
    if (this.effects.longCredits > 0) {
      this.effects.longCredits -= 1;
      type = 'I';
    }
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
      const canceled = cancelGarbage(this.teams.curse, cleared);
      if (canceled > 0) {
        this.pushLog('cancel', `消除 ${cleared} 行，抵消待执行垃圾 ${canceled} 行。`, 'curse');
      }
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

  /** Atomic settlement: both heads pop, reserves refill, bless runs, then curse. */
  private settle(): void {
    this.settlementCount += 1;
    const bless = settleTeam(this.teams.bless, this.ids);
    const curse = settleTeam(this.teams.curse, this.ids);

    const report: SettlementReport = {
      index: this.settlementCount,
      bless: null,
      curse: null,
      promotedEffects: { bless: bless.promotedEffects, curse: curse.promotedEffects },
    };
    if (bless.executed) {
      report.bless = {
        node: bless.executed,
        outcome: applyBless(this.effects, this.board, bless.executed),
      };
    }
    if (curse.executed) {
      report.curse = {
        node: curse.executed,
        outcome: applyCurse(this.effects, this.board, curse.executed, this.garbageRng),
      };
    }
    this.lastSettlement = report;
    this.logSettlement(report);
    if (report.curse?.outcome.toppedOut) this.endGame('垃圾行将方块挤出顶部');
  }

  private logSettlement(r: SettlementReport): void {
    const describe = (node: EffectNode) =>
      `${EFFECT_INFO[node.type].name} Lv.${levelOf(node.energy)}`;
    const parts: string[] = [];
    parts.push(r.bless ? `祝福执行 ${describe(r.bless.node)}` : '祝福队列为空');
    if (r.curse) {
      let text = `诅咒执行 ${describe(r.curse.node)}`;
      if (r.curse.node.type === 'garbage') {
        const o = r.curse.outcome;
        text += `，净增 ${o.netGarbage} 行`;
        if (o.shieldAbsorbed) text += `（护盾抵消 ${o.shieldAbsorbed}）`;
        if (r.curse.node.canceledLines) text += `（消行已抵消 ${r.curse.node.canceledLines}）`;
      }
      parts.push(text);
    } else {
      parts.push('诅咒队列为空');
    }
    this.pushLog('settle', `第 ${r.index} 次结算：${parts.join('；')}。`);
    for (const side of ['bless', 'curse'] as const) {
      for (const type of r.promotedEffects[side]) {
        this.pushLog(
          'promote',
          `${SIDE_INFO[side].name}：储备强化${EFFECT_INFO[type].name}后插队前移一位。`,
          side,
        );
      }
    }
  }
}
