import type { Logger } from '@dy-apps/services';
import { log as appLog } from '../log';
import { clearFullLines, collides, createBoard } from './board';
import { CONFIG } from './config';
import {
  CURSE_LIST,
  type Command,
  type CurseContext,
  type CurseDef,
  type CurseOutcome,
  type EffectType,
  type Rarity,
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
import {
  drawCurse,
  isValidBatchCount,
  isValidProbability,
  processGiftBatch,
  rarityBands,
} from './gifts';
import {
  addDebugCurse,
  addHit,
  addLikeCurse,
  addSystemCurse,
  cancelOne,
  createTeam,
  pendingTotal,
  settleTeam,
  takeSender,
} from './interventions';
import {
  BagGenerator,
  createPiece,
  KICK_OFFSETS,
  pieceCells,
  rotateMatrix,
  shapeOf,
} from './pieces';
import { deriveSeed, mulberry32, randomInt, type Rng } from './random';
import type {
  ActivePiece,
  Board,
  BoardView,
  GiftBatchResult,
  Matrix,
  Phase,
  PieceShape,
  PieceType,
  Sender,
  SwapView,
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
  /** For the curse a quiet room draws. */
  quietRng?: Rng;
  /** For the curse the like meter draws. */
  likeRng?: Rng;
  /** For whether a draw opens a vote, what goes up, and breaking ties. */
  voteRng?: Rng;
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
  /** Where debug messages go; the app's `[tetris]` log by default. */
  logger?: Logger;
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

/** The hold before the piece of a curse with `cutscene`: its name, then READY, then GO. */
export interface CutsceneView {
  /** The curses that fired with a cutscene at this settlement, in settlement order. */
  curses: readonly CurseDef<unknown>[];
  /** Who sent each of `curses`, when known. */
  senders: readonly (Sender | null)[];
  stage: 'intro' | 'ready' | 'go';
}

/**
 * Something the board shows briefly over play: a pending curse the player cancelled by clearing
 * lines, one the game drew because the room was quiet, or one the full like meter drew.
 */
export interface BoardNotice {
  id: number;
  kind: 'cancelled' | 'quiet' | 'likes';
  type: EffectType;
  /** Lines cleared at once, for 'cancelled'. */
  lines?: number;
  /** How many likes filled the meter, for 'likes'. */
  likes?: number;
  /** Who sent the curse, when known. */
  sender?: Sender | null;
}

/** One viewer's vote: the index of the option they picked. Changing it replaces it. */
export interface Ballot {
  voter: Sender;
  choice: number;
}

/**
 * An open vote: play stops while chat picks which of `options` goes in for the curse `sender`
 * drew. Once time is up, `winner` is set and shows for a moment before play goes on.
 */
export interface VoteView {
  id: number;
  sender: Sender;
  rarity: Rarity;
  options: readonly EffectType[];
  ballots: readonly Ballot[];
  remainingMs: number;
  winner: number | null;
}

/** The like meter: likes so far towards the next curse, and who has liked most this time. */
export interface LikeMeterView {
  likes: number;
  threshold: number;
  top: { sender: Sender; likes: number } | null;
}

/** What a viewer's chat can do to the piece while a curse hands it over (夺舍). */
export type ViewerCommand = keyof typeof CONFIG.viewerCommands;

/** A viewer's chat command that reached the piece, for the board to show who did what. */
export interface ViewerInput {
  id: number;
  user: string;
  command: ViewerCommand;
  /** Whether the piece actually moved or turned; against a wall it doesn't. */
  worked: boolean;
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

/** The lowest row a piece has a cell in. */
function bottomOf(p: ActivePiece): number {
  return Math.max(...pieceCells(p.matrix, p.x, p.y).map(([, y]) => y));
}

export class GameEngine {
  phase: Phase = 'ready';
  board: Board;
  active: ActivePiece | null = null;
  /**
   * The second piece of a pair while a curse spawns two (双落). It moves and falls with `active`;
   * when one of them locks, the other becomes `active` and the turn ends when it locks too.
   */
  twin: ActivePiece | null = null;
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
  /** Set between a settlement and the next spawn while a cutscene plays; no piece is active. */
  cutscene: CutsceneView | null = null;
  /** The last few notices, oldest first; each shows once, when it is new. */
  notices: BoardNotice[] = [];
  /** Settlements in a row with nothing pending, towards CONFIG.quiet.settlements. */
  quietSettlements = 0;
  /** The vote holding play, if one is open. */
  vote: VoteView | null = null;
  /** The room's likes towards the next curse. */
  likeMeter: LikeMeterView = { likes: 0, threshold: CONFIG.likes.firstThreshold, top: null };
  /** The last few viewers' chat commands while they steer the piece, oldest first. */
  viewerInputs: ViewerInput[] = [];

  /** Bumped on every change the panels care about (not on gravity or movement). */
  version = 0;

  private readonly logger: Logger;
  private readonly pieceRng: Rng;
  private readonly garbageRng: Rng;
  private readonly giftRng: Rng;
  private readonly curseRng: Rng;
  private readonly quietRng: Rng;
  private readonly likeRng: Rng;
  private readonly voteRng: Rng;
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
  private cutsceneMs = 0;
  /** What the falling pieces were before a curse swapped them at spawn, for the board to animate. */
  private swap: SwapView | null = null;
  /** Cells a curse dropped onto the board at the last settlement, for the board to animate. */
  private drops: { cells: [number, number][]; atMs: number } | null = null;
  private lockMs = 0;
  private lockResets = 0;
  private logId = 0;
  private batchId = 0;
  private noticeId = 0;
  private viewerInputId = 0;
  private voteId = 0;
  /** How long the vote's winner has shown. */
  private voteResultMs = 0;
  /** Likes per viewer since the meter last filled, by viewer id. */
  private likers = new Map<string, { sender: Sender; likes: number }>();
  /** Play time when the meter last filled, or the game began. */
  private likesSinceMs = 0;
  /** The player's commands waiting out 延迟's delay, oldest first, each with when it acts. */
  private delayedInputs: { atMs: number; run: () => boolean }[] = [];
  private runningDelayed = false;
  private readonly listeners: Set<Listener> = new Set();

  constructor(options: EngineOptions = {}) {
    this.logger = options.logger ?? appLog;
    const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
    this.pieceRng = options.pieceRng ?? mulberry32(deriveSeed(seed, 0));
    this.garbageRng = options.garbageRng ?? mulberry32(deriveSeed(seed, 1));
    this.giftRng = options.giftRng ?? mulberry32(deriveSeed(seed, 2));
    this.curseRng = options.curseRng ?? mulberry32(deriveSeed(seed, 3));
    this.quietRng = options.quietRng ?? mulberry32(deriveSeed(seed, 4));
    this.likeRng = options.likeRng ?? mulberry32(deriveSeed(seed, 5));
    this.voteRng = options.voteRng ?? mulberry32(deriveSeed(seed, 6));
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
    return this.effects.gravityMultiplier * this.curseMultiplier('gravityMultiplier');
  }

  /** How long a grounded piece waits before it locks. */
  get lockDelayMs(): number {
    return CONFIG.lock.delayMs * this.curseMultiplier('lockDelayMultiplier');
  }

  /** Every active curse instance's `key` multiplied together. */
  private curseMultiplier(key: 'gravityMultiplier' | 'lockDelayMultiplier'): number {
    let m = 1;
    for (const { def, count } of this.activeCurses) {
      const factor = def[key];
      if (factor !== undefined) m *= factor ** count;
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

  /** The first active curse that hands the piece to the viewers' chat, if any. */
  get viewerControlBy(): CurseDef<unknown> | null {
    return this.activeCurses.find(({ def }) => def.viewerControl)?.def ?? null;
  }

  /** The first active curse that swaps left and right, if any. */
  get movesMirroredBy(): CurseDef<unknown> | null {
    return this.activeCurses.find(({ def }) => def.mirrorsMoves)?.def ?? null;
  }

  /** Y the active piece would land at. */
  get ghostY(): number | null {
    if (!this.active) return null;
    return this.active.y + this.dropDistance(this.active);
  }

  /** What the board renderer draws. */
  get boardView(): BoardView {
    return {
      board: this.board,
      active: this.active,
      ghostY: this.ghostY,
      twin: this.twin,
      twinGhostY: this.twin && this.twin.y + this.dropDistance(this.twin),
      activeCurses: this.activeCurses.map((a) => a.type),
      timeMs: this.playMs,
      swap: this.swap,
      drops: this.drops,
    };
  }

  // ---------------------------------------------------------------- phases

  start(): void {
    if (this.phase !== 'ready') return;
    this.phase = 'playing';
    if (this.initialActivePiece) this.spawn(this.initialActivePiece);
    else this.spawnNext();
    this.logState('game started');
    this.emit();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.logState('paused');
    this.emit();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.logState('resumed');
    this.emit();
  }

  togglePause(): void {
    if (this.phase === 'ready') this.start();
    else if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  /** Clears everything except the selected trigger probability. */
  restart(): void {
    this.logState('restart');
    this.phase = 'ready';
    this.board = this.startingBoard();
    this.active = null;
    this.twin = null;
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
    this.cutscene = null;
    this.cutsceneMs = 0;
    this.notices = [];
    this.quietSettlements = 0;
    this.viewerInputs = [];
    this.delayedInputs = [];
    this.likeMeter = { likes: 0, threshold: CONFIG.likes.firstThreshold, top: null };
    this.likers.clear();
    this.likesSinceMs = 0;
    this.vote = null;
    this.voteResultMs = 0;
    this.swap = null;
    this.drops = null;
    this.playMs = 0;
    this.resetPieceTimers();
    this.pushLog('system', '已重新开始，触发概率保持不变。');
    this.emit();
  }

  setProbability(p: number): boolean {
    if (!isValidProbability(p)) {
      this.logger.warn(`ignored invalid trigger chance: ${String(p)}`);
      return false;
    }
    this.probability = p;
    this.logger.debug(`trigger chance set to ${p}`);
    this.emit();
    return true;
  }

  private endGame(reason: string): void {
    this.phase = 'gameOver';
    this.active = null;
    this.gameOverReason = reason;
    this.pushLog('system', `游戏结束：${reason}`);
    this.logState(`game over (${reason})`);
  }

  /** `what` and the numbers that say where the game stands, as a debug line. */
  private logState(what: string): void {
    if (!this.logger.enabled('debug')) return;
    this.logger.debug(
      `${what}: score=${this.score} lines=${this.lines} speed=x${this.speedMultiplier.toFixed(2)} ` +
        `locks=${this.lockedPieceCount} settlements=${this.settlementCount} gifts=${this.team.giftCount} ` +
        `pending=${this.pendingText()}`,
    );
  }

  /** `fog:1,garbage:2` for the curses waiting to settle, or `none`. */
  private pendingText(): string {
    const waiting = this.pool.filter((type) => this.team.pending[type] > 0);
    return waiting.length ? waiting.map((t) => `${t}:${this.team.pending[t]}`).join(',') : 'none';
  }

  // ---------------------------------------------------------------- gifts

  /** Gifts from `sender` (a viewer, or just a name), worth `count` draws. */
  sendGifts(sender: string | Sender, count: number): GiftResponse {
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
    const result = processGiftBatch(
      this.team,
      sender,
      count,
      p,
      this.giftRng,
      this.curses,
      (type, from) => this.openVote(type, from),
    );
    this.batchId += 1;
    this.giftHistory.unshift({ ...result, id: this.batchId });
    if (this.giftHistory.length > CONFIG.gifts.historySize) {
      this.giftHistory.length = CONFIG.gifts.historySize;
    }
    this.logBatch(result);
    this.emit();
    return { ok: true, result };
  }

  /**
   * Debug: queue one of any curse in play, as if a gift had triggered it. Only during a game,
   * like gifts.
   */
  addCurse(type: EffectType, sender?: Sender): boolean {
    if (this.phase === 'ready' || this.phase === 'gameOver') return false;
    if (!this.curseByType[type]) return false;
    addDebugCurse(this.team, type, sender);
    this.pushLog('system', `调试：加入 ${this.curseByType[type].name}。`);
    this.logState(`debug added ${type}`);
    this.emit();
    return true;
  }

  /**
   * A viewer's chat line. While a curse hands the piece over (夺舍), exactly one of
   * CONFIG.viewerCommands moves or turns it at once, past any curse blocking the player; any other
   * text, or a chat at any other time, does nothing. Returns whether it was a command taken.
   */
  viewerCommand(user: string, text: string): boolean {
    if (!this.canControl || !this.viewerControlBy) return false;
    const words = CONFIG.viewerCommands;
    const command = (Object.keys(words) as ViewerCommand[]).find((c) => words[c] === text.trim());
    if (!command) return false;
    const worked =
      command === 'rotate' ? this.rotateFalling(1) : this.moveFalling(command === 'left' ? -1 : 1);
    this.viewerInputId += 1;
    this.viewerInputs = [
      ...this.viewerInputs,
      { id: this.viewerInputId, user, command, worked },
    ].slice(-CONFIG.viewerInputsShown);
    this.emit();
    return true;
  }

  /**
   * `count` likes from `sender` towards the like meter. When it fills, it draws a curse the way a
   * gift does, sent by whoever liked most since it last filled, and the next takes twice as many
   * (up to CONFIG.likes.maxThreshold); likes past the threshold carry over. Only during a game.
   */
  addLikes(sender: Sender, count: number): boolean {
    if (this.phase === 'ready' || this.phase === 'gameOver') return false;
    if (!Number.isInteger(count) || count <= 0) return false;
    const mine = this.likers.get(sender.id);
    this.likers.set(sender.id, { sender, likes: (mine?.likes ?? 0) + count });
    let { likes, threshold } = this.likeMeter;
    likes += count;
    while (likes >= threshold) {
      likes -= threshold;
      const top = this.topLiker()!;
      const type = drawCurse(this.likeRng, rarityBands(this.curses));
      if (this.openVote(type, top.sender)) {
        this.team.likeCount += 1;
        this.pushLog(
          'system',
          `点赞满 ${threshold}：${top.sender.name}（${top.likes} 赞）发起投票。`,
        );
      } else {
        addLikeCurse(this.team, type, top.sender);
        this.pushNotice({ kind: 'likes', type, likes: threshold, sender: top.sender });
        this.pushLog(
          'system',
          `点赞满 ${threshold}：${top.sender.name}（${top.likes} 赞）送出 ${this.curseByType[type]!.name}。`,
        );
      }
      this.logState(`likes filled ${threshold}, drew ${type} for ${top.sender.name}`);
      threshold = Math.min(threshold * 2, CONFIG.likes.maxThreshold);
      // Likes past the threshold carry over, as this viewer's.
      this.likers.clear();
      if (likes > 0) this.likers.set(sender.id, { sender, likes });
      this.likesSinceMs = this.playMs;
    }
    this.likeMeter = { likes, threshold, top: this.topLiker() };
    this.emit();
    return true;
  }

  private topLiker(): { sender: Sender; likes: number } | null {
    let top: { sender: Sender; likes: number } | null = null;
    for (const liker of this.likers.values()) if (!top || liker.likes > top.likes) top = liker;
    return top;
  }

  /** With no curse from the meter for a while, it starts over: empty, at the first threshold. */
  private idleLikeMeter(): void {
    if (this.playMs - this.likesSinceMs < CONFIG.likes.idleResetMs) return;
    this.likesSinceMs = this.playMs;
    const threshold = CONFIG.likes.firstThreshold;
    if (this.likeMeter.likes === 0 && threshold === this.likeMeter.threshold) return;
    this.likeMeter = { likes: 0, threshold, top: null };
    this.likers.clear();
    this.logState('like meter idle: reset');
    this.emit();
  }

  /**
   * A viewer drew `type`: if it is uncommon or rare, no vote is open and the dice say so
   * (CONFIG.votes.chance), opens a vote between two curses of its rarity instead of queueing it.
   * Returns whether it did; the caller counts the draw either way.
   */
  private openVote(type: EffectType, sender: Sender): boolean {
    const { rarity } = this.curseByType[type]!;
    if (rarity === 'common' || this.vote) return false;
    if (!(this.voteRng.next() < CONFIG.votes.chance)) return false;
    return this.startVote(sender, rarity);
  }

  /** Puts two different curses of `rarity` to the vote; false when there aren't two. */
  private startVote(sender: Sender, rarity: Rarity): boolean {
    const types = this.pool.filter((t) => this.curseByType[t]!.rarity === rarity);
    if (types.length < 2) return false;
    const first = randomInt(this.voteRng, types.length);
    let second = randomInt(this.voteRng, types.length - 1);
    if (second >= first) second += 1;
    this.voteId += 1;
    this.vote = {
      id: this.voteId,
      sender,
      rarity,
      options: [types[first]!, types[second]!],
      ballots: [],
      remainingMs: CONFIG.votes.durationMs,
      winner: null,
    };
    this.team.votingCount += 1;
    this.logState(`vote opened by ${sender.name}: ${this.vote.options.join(' vs ')}`);
    this.emit();
    return true;
  }

  /** Debug: opens a vote between two curses of `rarity`, as if `sender` had drawn one. */
  forceVote(sender: Sender, rarity: Rarity = 'rare'): boolean {
    if (this.phase === 'ready' || this.phase === 'gameOver' || this.vote) return false;
    if (!this.startVote(sender, rarity)) return false;
    this.team.debugCount += 1;
    this.pushLog('system', `调试：${sender.name} 发起投票。`);
    return true;
  }

  /**
   * A viewer's chat while a vote is open: a 1 anywhere in it votes for the first option, a 2 for
   * the second; with both or neither it doesn't count. A later vote replaces their earlier one.
   * Returns whether it counted.
   */
  castVote(voter: Sender, text: string): boolean {
    const vote = this.vote;
    if (!vote || vote.winner !== null) return false;
    const one = /[1１]/.test(text);
    const two = /[2２]/.test(text);
    if (one === two) return false;
    const choice = one ? 0 : 1;
    const others = vote.ballots.filter((b) => b.voter.id !== voter.id);
    this.vote = { ...vote, ballots: [...others, { voter, choice }] };
    this.emit();
    return true;
  }

  /** The streamer's +1 s while a vote is open. */
  extendVote(): boolean {
    const vote = this.vote;
    if (!vote || vote.winner !== null) return false;
    this.vote = { ...vote, remainingMs: vote.remainingMs + CONFIG.votes.extendMs };
    this.emit();
    return true;
  }

  /** Counts down; at zero the most votes win (no votes or a tie: at random), then shows it. */
  private advanceVote(dtMs: number): void {
    const vote = this.vote!;
    if (vote.winner !== null) {
      this.voteResultMs += dtMs;
      if (this.voteResultMs >= CONFIG.votes.resultMs) {
        this.vote = null;
        this.logState('vote over');
        this.emit();
      }
      return;
    }
    const remainingMs = vote.remainingMs - dtMs;
    if (remainingMs > 0) {
      this.vote = { ...vote, remainingMs };
      // Often enough for a smooth countdown, not every frame.
      if (Math.ceil(remainingMs / 100) !== Math.ceil(vote.remainingMs / 100)) this.emit();
      return;
    }
    const counts = vote.options.map((_, i) => vote.ballots.filter((b) => b.choice === i).length);
    const best = Math.max(...counts);
    const leaders = counts.flatMap((n, i) => (n === best ? [i] : []));
    const winner = leaders[randomInt(this.voteRng, leaders.length)]!;
    const type = vote.options[winner]!;
    this.vote = { ...vote, remainingMs: 0, winner };
    this.voteResultMs = 0;
    this.team.votingCount -= 1;
    addHit(this.team, type, vote.sender);
    this.pushLog(
      'system',
      `投票结果：${counts.join(' : ')}，${vote.sender.name} 送出 ${this.curseByType[type]!.name}。`,
    );
    this.logState(`vote: ${counts.join(':')}, ${type} wins`);
    this.emit();
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
    const votes = r.votes ? `${effects ? '，' : ''}发起投票` : '';
    this.pushLog('gift', `${head}：触发 ${r.hits}（${effects}${votes}），未触发 ${r.misses}。`);
  }

  // ---------------------------------------------------------------- piece control

  private get canControl(): boolean {
    return this.phase === 'playing' && this.active !== null && this.vote === null;
  }

  /** The falling pieces: the active one, and its twin while there is one. */
  private get falling(): ActivePiece[] {
    return this.twin ? [this.active!, this.twin] : [this.active!];
  }

  /**
   * Resting on the board. Only the board counts: a piece above its twin falls with it, so a
   * pair moves and falls as one until either piece touches down.
   */
  private restsOnBoard(p: ActivePiece): boolean {
    return collides(this.board, p.matrix, p.x, p.y + 1);
  }

  private isGrounded(): boolean {
    return this.falling.some((p) => this.restsOnBoard(p));
  }

  /** Whether `matrix` at x, y hits the board or the other falling piece. */
  private blocked(p: ActivePiece, matrix: Matrix, x: number, y: number): boolean {
    if (collides(this.board, matrix, x, y)) return true;
    const other = p === this.active ? this.twin : this.active;
    if (!other) return false;
    const taken = new Set(
      pieceCells(other.matrix, other.x, other.y).map(([cx, cy]) => `${cx},${cy}`),
    );
    return pieceCells(matrix, x, y).some(([cx, cy]) => taken.has(`${cx},${cy}`));
  }

  private dropDistance(p: ActivePiece): number {
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

  /** The player's move, of both pieces of a pair or neither: swapped while a curse mirrors moves. */
  move(dx: number): boolean {
    if (!this.canControl) return false;
    if (this.deferred(() => this.move(dx))) return true;
    if (this.blockedBy('move')) return false;
    let step: -1 | 1 = (this.movesMirroredBy ? -dx : dx) < 0 ? -1 : 1;
    for (const { type, def } of this.activeCurses) {
      if (def.onMove)
        step = def.onMove(this.curseContext(), step, this.effects.active[type]!.state);
    }
    return this.moveFalling(step);
  }

  private moveFalling(step: number): boolean {
    // Both shift by the same step, so only the board can stop them.
    if (this.falling.some((p) => collides(this.board, p.matrix, p.x + step, p.y))) return false;
    const wasGrounded = this.isGrounded();
    for (const p of this.falling) p.x += step;
    this.afterManipulation(wasGrounded);
    return true;
  }

  /** A curse's move of the active piece alone; it never resets the lock. */
  private shift(dx: number): boolean {
    const p = this.active!;
    if (this.blocked(p, p.matrix, p.x + dx, p.y)) return false;
    p.x += dx;
    return true;
  }

  /** Rotates each falling piece in place, each with its own kicks. */
  rotate(dir: 1 | -1): boolean {
    if (!this.canControl) return false;
    if (this.deferred(() => this.rotate(dir))) return true;
    if (this.blockedBy('rotate')) return false;
    return this.rotateFalling(dir);
  }

  private rotateFalling(dir: 1 | -1): boolean {
    let turned = false;
    for (const p of this.falling) turned = this.rotateWithKicks(p, dir, true) || turned;
    return turned;
  }

  /** Rotate with the first kick that fits; only the player's rotations may reset the lock. */
  private rotateWithKicks(p: ActivePiece, dir: 1 | -1, mayResetLock: boolean): boolean {
    const rotated = rotateMatrix(p.matrix, dir);
    for (const [kx, ky] of KICK_OFFSETS) {
      if (!this.blocked(p, rotated, p.x + kx, p.y + ky)) {
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
    if (!this.canControl) return false;
    if (this.deferred(() => this.softDrop())) return true;
    if (this.isGrounded() || this.blockedBy('softDrop')) return false;
    for (const p of this.falling) p.y += 1;
    this.score += CONFIG.score.softDropPerCell;
    this.gravityMs = 0;
    this.emit();
    return true;
  }

  /** Drops and locks each falling piece, the lower first so the upper lands on it. */
  hardDrop(): boolean {
    if (!this.canControl) return false;
    if (this.deferred(() => this.hardDrop())) return true;
    if (this.blockedBy('hardDrop')) return false;
    const pair = this.twin !== null;
    if (pair && bottomOf(this.twin!) > bottomOf(this.active!)) this.swapTwin();
    this.dropAndLock();
    if (pair && this.phase === 'playing') this.dropAndLock();
    return true;
  }

  private dropAndLock(): void {
    const d = this.dropDistance(this.active!);
    this.active!.y += d;
    this.score += d * CONFIG.score.hardDropPerCell;
    this.lockPiece();
  }

  private swapTwin(): void {
    [this.active, this.twin] = [this.twin, this.active];
    if (this.swap) this.swap = { ...this.swap, from: this.swap.twinFrom, twinFrom: this.swap.from };
  }

  /** Not while a pair is falling. */
  holdPiece(): boolean {
    if (!this.canControl) return false;
    if (this.deferred(() => this.holdPiece())) return true;
    if (!this.canHold || this.twin || this.blockedBy('hold')) return false;
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

  /** How late the player's commands act while a curse delays them (延迟); 0 when none does. */
  get inputDelayMs(): number {
    return Math.max(0, ...this.activeCurses.map(({ def }) => def.inputDelayMs ?? 0));
  }

  /**
   * While a curse delays input, queues `run` to act `inputDelayMs` of play time from now and says
   * so; the caller then does nothing yet. Not when it is that queued command acting at last.
   */
  private deferred(run: () => boolean): boolean {
    const ms = this.inputDelayMs;
    if (ms === 0 || this.runningDelayed) return false;
    this.delayedInputs.push({ atMs: this.playMs + ms, run });
    return true;
  }

  /** The delayed commands whose time has come, in the order they were given. */
  private runDelayedInputs(): void {
    while (this.delayedInputs.length > 0 && this.delayedInputs[0]!.atMs <= this.playMs) {
      const { run } = this.delayedInputs.shift()!;
      this.runningDelayed = true;
      try {
        run();
      } finally {
        this.runningDelayed = false;
      }
    }
  }

  /** Advance the cutscene, the vote, or gravity and lock delay, by `dtMs` of foreground play time. */
  tick(dtMs: number): void {
    if (this.phase === 'playing' && this.cutscene) {
      this.advanceCutscene(dtMs);
      return;
    }
    if (this.phase === 'playing' && this.vote) {
      this.advanceVote(dtMs);
      return;
    }
    if (!this.canControl) return;
    this.playMs += dtMs;
    this.idleLikeMeter();
    this.runDelayedInputs();
    if (!this.canControl) return;
    for (const { type, def } of this.activeCurses) {
      def.onTick?.(this.curseContext(), dtMs, this.effects.active[type]!.state);
    }
    if (this.isGrounded()) {
      this.gravityMs = 0;
      this.lockMs += dtMs;
      if (this.lockMs >= this.lockDelayMs) this.lockResting();
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
      for (const p of this.falling) p.y += 1;
    }
  }

  /** Lock what rests on the board; of a pair, one still in the air plays on. */
  private lockResting(): void {
    if (this.twin && this.restsOnBoard(this.twin) && !this.restsOnBoard(this.active!)) {
      this.swapTwin();
    }
    const pair = this.twin !== null;
    this.lockPiece();
    if (pair && this.phase === 'playing' && this.restsOnBoard(this.active!)) this.lockPiece();
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

  /** The next piece from the queue, through the curses' onSpawn hooks; two side by side while a curse spawns pairs. */
  private spawnNext(): void {
    const type = this.upcoming[0]!;
    const piece = this.takeFromQueue();
    const from = piece.type === type ? undefined : type;
    this.swap = from ? { from, atMs: this.playMs } : null;
    if (!this.activeCurses.some(({ def }) => def.spawnsTwin)) {
      this.place(piece);
      return;
    }
    const twinType = this.upcoming[0]!;
    const twin = this.takeFromQueue();
    if (twin.type !== twinType) this.swap = { from, twinFrom: twinType, atMs: this.playMs };
    const middle = CONFIG.board.cols / 2;
    piece.x = Math.floor(middle) - piece.matrix[0]!.length;
    twin.x = Math.ceil(middle);
    this.place(piece, twin);
  }

  private takeFromQueue(): ActivePiece {
    const type = this.upcoming.shift()!;
    this.fillUpcoming();
    let piece = createPiece(shapeOf(type));
    for (const { type: curse, def } of this.activeCurses) {
      if (def.onSpawn) {
        piece = def.onSpawn(this.curseContext(), piece, this.effects.active[curse]!.state);
      }
    }
    return piece;
  }

  /** A hold swap or a scenario's first piece: spawned unrotated, and no curse sees it. */
  private spawn(shape: PieceShape): void {
    this.swap = null;
    this.place(createPiece(shape));
  }

  private place(piece: ActivePiece, twin: ActivePiece | null = null): void {
    this.resetPieceTimers();
    this.twin = null;
    if ([piece, twin].some((p) => p && collides(this.board, p.matrix, p.x, p.y))) {
      this.active = null;
      this.endGame('新方块的出生位置被占用');
      return;
    }
    this.active = piece;
    this.twin = twin;
    this.viewerInputs = [];
  }

  /**
   * Lock the active piece. With a twin still falling, the turn goes on: the twin becomes active
   * with fresh timers. Otherwise the turn ends: count the lock, settle, spawn the next.
   */
  private lockPiece(): void {
    const piece = this.active;
    if (!piece || this.phase !== 'playing') return;
    this.active = null;
    const twin = this.twin;
    this.twin = null;

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
      this.logState(`cleared ${cleared} line${cleared > 1 ? 's' : ''}`);
      if (cleared >= CONFIG.relief.minLines) this.cancelPending(cleared);
    }

    if (twin) {
      // Rows that cleared beneath it can bring cells down into it; lift it clear.
      while (collides(this.board, twin.matrix, twin.x, twin.y) && twin.y > -twin.matrix.length) {
        twin.y -= 1;
      }
      this.active = twin;
      if (this.swap) this.swap = { from: this.swap.twinFrom, atMs: this.swap.atMs };
      this.resetPieceTimers();
      this.emit();
      return;
    }

    tickTimedEffects(this.effects);
    this.lockedPieceCount += 1;
    this.canHold = true;

    if (this.lockedPieceCount % CONFIG.settlement.everyLocks === 0) {
      this.settle();
      // The next piece waits for the game to end or the cutscene to finish.
      if ((this.phase as Phase) === 'gameOver' || this.cutscene) {
        this.emit();
        return;
      }
    }
    this.spawnNext();
    this.emit();
  }

  /** A big enough line clear cancels one pending curse, rarest first. */
  private cancelPending(lines: number): void {
    const type = cancelOne(this.team, this.pool, (t) => this.curseByType[t]!.rarity);
    if (type === null) return;
    this.pushNotice({ kind: 'cancelled', type, lines, sender: takeSender(this.team, type) });
    this.pushLog('system', `消 ${lines} 行，抵消 ${this.curseByType[type]!.name}。`);
    this.logState(`cancelled ${type}`);
  }

  /** After enough settlements in a row with nothing pending, the game draws a curse itself. */
  private wakeQuietRoom(): void {
    if (pendingTotal(this.team) > 0) {
      this.quietSettlements = 0;
      return;
    }
    this.quietSettlements += 1;
    if (this.quietSettlements < CONFIG.quiet.settlements) return;
    this.quietSettlements = 0;
    const type = drawCurse(this.quietRng, rarityBands(this.curses));
    addSystemCurse(this.team, type);
    this.pushNotice({ kind: 'quiet', type });
    this.pushLog('system', `直播间太安静，系统送出 ${this.curseByType[type]!.name}。`);
    this.logState(`quiet room drew ${type}`);
  }

  private pushNotice(notice: Omit<BoardNotice, 'id'>): void {
    this.noticeId += 1;
    this.notices = [...this.notices, { ...notice, id: this.noticeId }].slice(-3);
  }

  private startCutscene(
    curses: readonly CurseDef<unknown>[],
    senders: readonly (Sender | null)[],
  ): void {
    this.cutscene = { curses, senders, stage: 'intro' };
    this.cutsceneMs = 0;
    this.logState(`cutscene for ${curses.map((def) => def.type).join(',')}`);
  }

  /** The names, then READY, then GO; the next piece spawns when GO is over. */
  private advanceCutscene(dtMs: number): void {
    const { readyMs, goMs } = CONFIG.cutscene;
    const introMs = Math.max(
      ...this.cutscene!.curses.map((def) => def.cutsceneMs ?? CONFIG.cutscene.introMs),
    );
    this.cutsceneMs += dtMs;
    const t = this.cutsceneMs;
    if (t >= introMs + readyMs + goMs) {
      this.cutscene = null;
      this.logState('cutscene over');
      this.spawnNext();
      this.emit();
      return;
    }
    const stage = t < introMs ? 'intro' : t < introMs + readyMs ? 'ready' : 'go';
    if (stage !== this.cutscene!.stage) {
      this.cutscene = { ...this.cutscene!, stage };
      this.emit();
    }
  }

  /** Atomic settlement: every curse type with anything pending fires once. */
  private settle(): void {
    this.wakeQuietRoom();
    const dropped: [number, number][] = [];
    this.settlementCount += 1;
    const report: SettlementReport = { index: this.settlementCount, executed: [] };
    const senders = new Map<EffectType, Sender | null>();
    let gameOver: string | undefined;
    for (const type of settleTeam(this.team, this.pool, this.queueOf)) {
      senders.set(type, takeSender(this.team, type));
      const def = this.curseByType[type]!;
      // A lasting curse is (re)activated first, so apply sees the state it keeps.
      const state =
        durationOf(def) === undefined ? def.initState?.() : activate(this.effects, type, def).state;
      const outcome = def.apply?.(this.curseContext(), state) ?? {};
      dropped.push(...(outcome.dropped ?? []));
      report.executed.push({ type, outcome });
      gameOver = outcome.gameOver;
      if (gameOver) break;
    }
    this.drops = dropped.length ? { cells: dropped, atMs: this.playMs } : null;
    this.lastSettlement = report;
    this.logSettlement(report);
    if (this.logger.enabled('debug')) {
      const fired = report.executed.map(({ type }) => type).join(',') || 'nothing';
      this.logState(`settlement #${report.index} fired ${fired}`);
    }
    if (gameOver) {
      this.endGame(gameOver);
      return;
    }
    const shown = report.executed.filter(({ type }) => this.curseByType[type]!.cutscene);
    if (shown.length > 0) {
      this.startCutscene(
        shown.map(({ type }) => this.curseByType[type]!),
        shown.map(({ type }) => senders.get(type) ?? null),
      );
    }
  }

  /** What curses get to see and do: never the engine itself. */
  private curseContext(): CurseContext {
    return {
      board: this.board,
      active: this.active,
      curseRng: this.curseRng,
      garbageRng: this.garbageRng,
      tryRotate: (dir) => this.active !== null && this.rotateWithKicks(this.active, dir, false),
      tryMove: (dx) => this.active !== null && this.shift(dx),
      trySetShape: (shape) => this.trySetShape(shape),
      upcoming: this.upcoming,
      setUpcoming: (index, type) => {
        if (!Number.isInteger(index) || index < 0 || index >= this.upcoming.length) return false;
        this.upcoming[index] = type;
        return true;
      },
    };
  }

  /** Swap the active piece's shape in place if it fits; the lock timer is left alone. */
  private trySetShape(shape: PieceShape): boolean {
    const p = this.active;
    if (!p || this.blocked(p, shape.matrix, p.x, p.y)) return false;
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
