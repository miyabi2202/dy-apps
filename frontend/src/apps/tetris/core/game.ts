import type { Logger } from '@dy-apps/services';
import { log as appLog } from '../log';
import { clearFullLines, collides, createBoard, emptyRow } from './board';
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
  drawableCurses,
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
  previewSettlement,
  settleTeam,
  SYSTEM_SENDER,
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
import { CutsceneClock, type CutsceneView } from './cutscene-clock';
import { dangerLevel, Heartbeat } from './danger';
import { DelayedInputs } from './delayed-inputs';
import { FakeDeathClock, type FakeDeathView } from './fake-death-clock';
import { deriveSeed, mulberry32, type Rng } from './random';
import { LikeMeter, type LikeMeterView } from './room/like-meter';
import { MvpBoard, type MvpEntry } from './room/mvp-board';
import { Possession, type PossessView } from './room/possession';
import { QuietRoom } from './room/quiet-room';
import { ShoveClock, shovedAt, type ShoveView } from './shove-clock';
import { TheftClock, type TheftView } from './theft-clock';
import { VoteBox, type VoteView } from './room/vote-box';
import type {
  ActivePiece,
  Board,
  BoardView,
  CalloutView,
  Cell,
  DangerView,
  GiftBatchResult,
  Matrix,
  NudgeView,
  Phase,
  PieceShape,
  PieceType,
  Sender,
  SquatterView,
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

/**
 * Something the board shows briefly over play: a pending curse the player cancelled by clearing
 * lines or with a combo, one the game drew because the room was quiet, one the full like meter
 * drew, or one showing itself mid-play (画饼, 热心, a 钉子户 moving out).
 */
export interface BoardNotice {
  id: number;
  kind: 'cancelled' | 'combo' | 'quiet' | 'likes' | 'reveal';
  /** What a 'reveal' says under the curse's name; its tagline if unset. */
  text?: string;
  type: EffectType;
  /** Lines cleared at once, for 'cancelled'. */
  lines?: number;
  /** Clears in a row, for 'combo'. */
  combo?: number;
  /** How many likes filled the meter, for 'likes'. */
  likes?: number;
  /** Who sent the curse, when known. */
  sender?: Sender | null;
}

export type { CutsceneView } from './cutscene-clock';
export type { LikeMeterView } from './room/like-meter';
export type { Ballot, VoteView } from './room/vote-box';

/** A pending curse type and how many of it wait, for the panels. */
export interface PendingCurse {
  def: CurseDef<unknown>;
  count: number;
}

/**
 * What holds play with no piece under control, in turn: a cutscene before the next piece, or a
 * vote. Play goes on when the queue is empty.
 */
type Hold =
  | { kind: 'cutscene'; clock: CutsceneClock }
  | { kind: 'vote' }
  | { kind: 'fakeDeath'; clock: FakeDeathClock }
  | { kind: 'theft'; clock: TheftClock }
  | { kind: 'shove'; clock: ShoveClock; piece: ActivePiece }
  | { kind: 'possess'; possession: Possession };

export type LogKind = 'gift' | 'miss' | 'settle' | 'system';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
}

export interface SettlementReport {
  index: number;
  /** Curses that fired, at most one per queue, in settlement order. Empty when nothing was pending. */
  executed: { type: EffectType; outcome: CurseOutcome }[];
}

/** A gift batch as kept in the engine's history, with a stable id for rendering. */
export type GiftHistoryEntry = GiftBatchResult & { id: number };

export type GiftResponse = { ok: true; result: GiftBatchResult } | { ok: false; error: string };

type Listener = () => void;

/** A 钉子户 holding a board cell; their row is the row itself, so they move with it. */
interface Squatter {
  id: number;
  row: Cell[];
  x: number;
  sender: Sender | null;
}

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
  /** Pieces in a row that cleared a line, this one included; 0 after one that cleared none. */
  combo = 0;
  /** Lines cleared by this combo so far, for 清底. */
  private comboLines = 0;
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
  /** The last few notices, oldest first; each shows once, when it is new. */
  notices: BoardNotice[] = [];

  /** Bumped on every change the panels care about (not on gravity or movement). */
  version = 0;

  private readonly logger: Logger;
  private readonly pieceRng: Rng;
  private readonly garbageRng: Rng;
  private readonly giftRng: Rng;
  private readonly curseRng: Rng;
  private readonly quietRng: Rng;
  private readonly likeRng: Rng;
  private readonly votes: VoteBox;
  private readonly likes = new LikeMeter();
  private readonly quiet = new QuietRoom();
  private readonly mvpBoard = new MvpBoard();
  /** Names printed on board rows (垃圾行), keyed by the row itself so they move with it. */
  private rowNames = new WeakMap<readonly Cell[], string>();
  private readonly delayed = new DelayedInputs();
  /** What holds play, the current one first. */
  private holds: Hold[] = [];
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
  /** What the falling pieces were before a curse swapped them at spawn, for the board to animate. */
  private swap: SwapView | null = null;
  /** Cells a curse dropped onto the board at the last settlement, for the board to animate. */
  private drops: { cells: [number, number][]; atMs: number } | null = null;
  /** The falling piece's last move a curse made on its own (醉酒, 打滑), for the board to animate. */
  private nudge: NudgeView | null = null;
  private readonly heartbeat = new Heartbeat();
  /** 夺舍 playing out after its countdown, until the piece locks; the streamer can't touch it. */
  private possessing: Possession | null = null;
  /** After a 假死, the piece falls faster until the streamer presses a direction or it locks. */
  private stunned = false;
  /** The stack's danger, updated each frame, for the board's red pulse. */
  private danger: DangerView | null = null;
  /** The last line clear worth shouting about, for the board to show. */
  private callout: CalloutView | null = null;
  /** Who holds board cells (钉子户). */
  private squatters: Squatter[] = [];
  private squatterId = 0;
  /**
   * 画饼: the preview shows `count` pieces from upcoming index `from` on as `shown`, whatever they
   * really are.
   */
  private promise: {
    shown: PieceType;
    from: number;
    count: number;
    sender: Sender | null;
    told: boolean;
  } | null = null;
  /** The piece 热心 has shoved, so it locks the next time without another. */
  private shoved: ActivePiece | null = null;
  /** Who sent each curse that fired last, for lasting ones that show themselves later (热心). */
  private readonly firedBy = new Map<EffectType, Sender | null>();
  private lockMs = 0;
  private lockResets = 0;
  private logId = 0;
  private batchId = 0;
  private noticeId = 0;
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
    this.votes = new VoteBox(options.voteRng ?? mulberry32(deriveSeed(seed, 6)));
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

  /** A curse in play by type. */
  curseOf(type: EffectType): CurseDef<unknown> {
    return this.curseByType[type]!;
  }

  /** The curses waiting to settle, in settlement order, with how many of each. */
  get pendingCurses(): PendingCurse[] {
    const counts = new Map<EffectType, number>();
    for (const def of this.curses) {
      const shown = this.shownAs(def.type);
      counts.set(shown, (counts.get(shown) ?? 0) + this.team.pending[def.type]);
    }
    return [...counts]
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ def: this.curseOf(type), count }));
  }

  /** The curse `type` shows as to the streamer: its disguise, if it has one in play. */
  shownAs(type: EffectType): EffectType {
    const disguise = this.curseByType[type]!.disguise as EffectType | undefined;
    return disguise && this.curseByType[disguise] ? disguise : type;
  }

  /** What the next settlement would fire as things stand: one per queue. */
  get nextSettlement(): CurseDef<unknown>[] {
    return previewSettlement(this.team, this.pool, this.queueOf, this.readyNow).map(
      (t) => this.curseByType[this.shownAs(t)]!,
    );
  }

  /** The cutscene holding play, while one does; no piece is active then. */
  get cutscene(): CutsceneView | null {
    const hold = this.holds[0];
    return hold?.kind === 'cutscene' ? hold.clock.view : null;
  }

  /** 夺舍, from its countdown until its piece locks: chat's queued moves and the time left. */
  get possession(): PossessView | null {
    const hold = this.holds[0];
    if (hold?.kind === 'possess') return hold.possession.view;
    return this.possessing?.view ?? null;
  }

  /**
   * A viewer's chat while 夺舍 is taking moves: 左, 右 and 转, as many as it spells (see
   * `parsePossess`). Not while paused. Returns whether any were queued.
   */
  possessInput(sender: Sender, text: string): boolean {
    const hold = this.holds[0];
    if (this.phase !== 'playing' || hold?.kind !== 'possess') return false;
    if (!hold.possession.add(sender, text)) return false;
    this.emit();
    return true;
  }

  /** A 假死 holding play, while one does. */
  get fakeDeath(): FakeDeathView | null {
    const hold = this.holds[0];
    return hold?.kind === 'fakeDeath' ? hold.clock.view : null;
  }

  /** On the fake game-over screen, 重新开始 only brings the reveal on sooner. */
  revealFakeDeath(): void {
    const hold = this.holds[0];
    if (hold?.kind !== 'fakeDeath' || hold.clock.view.stage === 'reveal') return;
    hold.clock.reveal();
    this.emit();
  }

  /** 热心 holding play as it shoves a piece, while it does. */
  get shoving(): ShoveView | null {
    const hold = this.holds[0];
    return hold?.kind === 'shove' ? hold.clock.view : null;
  }

  /** A 小偷 holding play, while one does. */
  get theft(): TheftView | null {
    const hold = this.holds[0];
    return hold?.kind === 'theft' ? hold.clock.view : null;
  }

  /** The vote holding play, while one does. */
  get vote(): VoteView | null {
    return this.holds[0]?.kind === 'vote' ? this.votes.view : null;
  }

  /** The room's likes towards the next curse. */
  get likeMeter(): LikeMeterView {
    return this.likes.view;
  }

  /** Settlements in a row with nothing pending, towards CONFIG.quiet.settlements. */
  get quietSettlements(): number {
    return this.quiet.settlements;
  }

  get piecesUntilSettlement(): number {
    return CONFIG.settlement.everyLocks - (this.lockedPieceCount % CONFIG.settlement.everyLocks);
  }

  get gravityIntervalMs(): number {
    return gravityIntervalMs(this.lines, this.gravityMultiplier);
  }

  /** The scenario's base multiplier times every active curse instance's. */
  private get gravityMultiplier(): number {
    const stun = this.stunned ? CONFIG.fakeDeath.stunGravity : 1;
    return this.effects.gravityMultiplier * this.curseMultiplier('gravityMultiplier') * stun;
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

  /** What the preview shows: the queue, with any pieces 画饼 promises as something else. */
  get preview(): PieceType[] {
    const { promise } = this;
    return this.upcoming
      .slice(0, CONFIG.sequence.visiblePreview)
      .map((type, i) =>
        promise && i >= promise.from && i < promise.from + promise.count ? promise.shown : type,
      );
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
    return this.active.y + this.dropDistance(this.active);
  }

  /** What the board renderer draws. */
  get boardView(): BoardView {
    return {
      board: this.board,
      // While 热心 pushes it, the piece is where the push has got to, with nowhere to aim.
      active: this.shoving ? { ...this.active!, ...shovedAt(this.shoving) } : this.active,
      ghostY: this.shoving ? null : this.ghostY,
      twin: this.twin,
      twinGhostY: this.twin && this.twin.y + this.dropDistance(this.twin),
      activeCurses: this.activeCurses.map((a) => a.type),
      timeMs: this.playMs,
      swap: this.swap,
      drops: this.drops,
      nudge: this.nudge,
      danger: this.danger,
      callout: this.callout,
      rowLabels: this.board.map((row) => this.rowNames.get(row) ?? null),
      excel: this.activeCurses.some(({ def }) => def.boardEffect === 'excel'),
      ...this.fakeBoard,
      squatters: this.squattersOn(this.fakeBoard?.board ?? this.board),
    };
  }

  /** The squatters where `board` shows their rows. */
  private squattersOn(board: Board): SquatterView[] {
    return this.squatters.flatMap(({ id, row, x, sender }) => {
      const y = board.indexOf(row);
      if (y === -1) return [];
      let buried = 0;
      while (buried < y && board[y - buried - 1]![x] !== null) buried += 1;
      return [{ id, x, y, sender, buried }];
    });
  }

  /** The viewers whose curses fired this game, most points first. */
  get mvp(): readonly MvpEntry[] {
    return this.mvpBoard.standings;
  }

  /** The MVP board as the fake game-over screen shows it: the 假死's sender dealt the final blow. */
  get fakeMvp(): readonly MvpEntry[] {
    return this.mvpBoard.standingsWithFinalBlow(this.fakeDeath?.sender ?? null);
  }

  /**
   * While 假死 plays, the board as it pretends: its garbage rows pushed in from the bottom one at
   * a time, the stack shoved up and off the top, then sliding back out. The real board is untouched.
   */
  private get fakeBoard(): Pick<BoardView, 'board' | 'rowLabels'> | null {
    const fake = this.fakeDeath;
    if (!fake) return null;
    const { stage, progress, sender, rows: n } = fake;
    const shown =
      stage === 'rise'
        ? Math.ceil(progress * n)
        : stage === 'dead'
          ? n
          : Math.ceil(n * Math.max(0, 1 - progress / CONFIG.fakeDeath.retractShare));
    const name = sender && sender.id !== SYSTEM_SENDER.id ? sender.name : null;
    const { cols } = CONFIG.board;
    const garbage: Cell[][] = Array.from({ length: shown }, (_, i) =>
      Array.from({ length: cols }, (_, x) =>
        x === (i * 7 + this.settlementCount * 3) % cols ? null : 'G',
      ),
    );
    return {
      board: [...this.board.slice(shown), ...garbage],
      rowLabels: [
        ...this.board.slice(shown).map((row) => this.rowNames.get(row) ?? null),
        ...garbage.map(() => name),
      ],
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
    this.rowNames = new WeakMap();
    this.mvpBoard.reset();
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
    this.combo = 0;
    this.comboLines = 0;
    this.team = this.startingTeam();
    this.effects = this.startingEffects();
    this.giftHistory = [];
    this.lastSettlement = null;
    this.log = [];
    this.gameOverReason = null;
    this.holds = [];
    this.notices = [];
    this.quiet.reset();
    this.delayed.clear();
    this.likes.reset();
    this.votes.reset();
    this.swap = null;
    this.drops = null;
    this.nudge = null;
    this.shoved = null;
    this.squatters = [];
    this.promise = null;
    this.firedBy.clear();
    this.heartbeat.reset();
    this.stunned = false;
    this.possessing = null;
    this.danger = null;
    this.callout = null;
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
    this.danger = null;
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
   * `count` likes from `sender` towards the like meter. Each time it fills it draws a curse the
   * way a gift does, sent by whoever liked most since it last filled. Only during a game.
   */
  addLikes(sender: Sender, count: number): boolean {
    if (this.phase === 'ready' || this.phase === 'gameOver') return false;
    if (!Number.isInteger(count) || count <= 0) return false;
    for (const { threshold, top } of this.likes.add(sender, count, this.playMs)) {
      const type = drawCurse(this.likeRng, rarityBands(drawableCurses(this.curses, this.team)));
      const head = `点赞满 ${threshold}：${top.sender.name}（${top.likes} 赞）`;
      if (this.openVote(type, top.sender)) {
        this.team.likeCount += 1;
        this.pushLog('system', `${head}发起投票。`);
      } else {
        addLikeCurse(this.team, type, top.sender);
        this.pushNotice({ kind: 'likes', type, likes: threshold, sender: top.sender });
        this.pushLog('system', `${head}送出 ${this.curseByType[type]!.name}。`);
      }
      this.logState(`likes filled ${threshold}, drew ${type} for ${top.sender.name}`);
    }
    this.emit();
    return true;
  }

  /**
   * A viewer drew `type`: if the vote box rolls for it, opens a vote between two curses of its
   * rarity instead of queueing it. Returns whether it did; the caller counts the draw either way.
   */
  private openVote(type: EffectType, sender: Sender): boolean {
    const { rarity } = this.curseByType[type]!;
    return this.votes.rolls(rarity) && this.startVote(sender, rarity);
  }

  /** Opens a vote between two curses of `rarity` and holds play for it, after any cutscene. */
  private startVote(sender: Sender, rarity: Rarity): boolean {
    const types = this.pool.filter(
      (t) => this.curseByType[t]!.rarity === rarity && !this.curseByType[t]!.disguise,
    );
    if (!this.votes.open(sender, rarity, types)) return false;
    this.holds.push({ kind: 'vote' });
    this.team.votingCount += 1;
    this.logState(`vote opened by ${sender.name}: ${this.votes.view!.options.join(' vs ')}`);
    this.emit();
    return true;
  }

  /** Debug: opens a vote between two curses of `rarity`, as if `sender` had drawn one. */
  forceVote(sender: Sender, rarity: Rarity = 'rare'): boolean {
    if (this.phase === 'ready' || this.phase === 'gameOver') return false;
    if (!this.startVote(sender, rarity)) return false;
    this.team.debugCount += 1;
    this.pushLog('system', `调试：${sender.name} 发起投票。`);
    return true;
  }

  /**
   * A viewer's chat while a vote holds play (see `ballotChoice`); a later vote replaces their
   * earlier one. Not while paused, when the vote isn't on screen. Returns whether it counted.
   */
  castVote(voter: Sender, text: string): boolean {
    if (this.phase !== 'playing' || !this.vote || !this.votes.cast(voter, text)) return false;
    this.emit();
    return true;
  }

  /** The streamer's +1 s while a vote holds play. */
  extendVote(): boolean {
    if (!this.vote || !this.votes.extend()) return false;
    this.emit();
    return true;
  }

  /** The vote's clock; the winner goes in as the drawer's, and play goes on once it closes. */
  private advanceVote(dtMs: number): void {
    const step = this.votes.advance(dtMs);
    switch (step.kind) {
      case 'counting':
        if (step.changed) this.emit();
        return;
      case 'showing':
        return;
      case 'closed':
        this.holds.shift();
        this.logState('vote over');
        this.emit();
        return;
      case 'decided': {
        const { sender } = this.votes.view!;
        this.team.votingCount -= 1;
        addHit(this.team, step.type, sender);
        this.pushLog(
          'system',
          `投票结果：${step.counts.join(' : ')}，${sender.name} 送出 ${this.curseByType[step.type]!.name}。`,
        );
        this.logState(`vote: ${step.counts.join(':')}, ${step.type} wins`);
        this.emit();
      }
    }
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

  /** A piece is in play and nothing (a cutscene, a vote) holds it. */
  private get canControl(): boolean {
    return this.phase === 'playing' && this.active !== null && this.holds.length === 0;
  }

  /** The streamer's keys work: the piece is in play and isn't chat's (夺舍). */
  private get playerControl(): boolean {
    return this.canControl && this.possessing === null;
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

  /** The player's move, of both pieces of a pair or neither, after the curses' onMove hooks. */
  move(dx: number): boolean {
    if (!this.playerControl) return false;
    this.stunned = false;
    if (this.deferred(() => this.move(dx))) return true;
    if (this.blockedBy('move')) return false;
    let step: -1 | 1 = dx < 0 ? -1 : 1;
    for (const { type, def } of this.activeCurses) {
      if (def.onMove)
        step = def.onMove(this.curseContext(), step, this.effects.active[type]!.state);
    }
    return this.moveFalling(step);
  }

  /** Only the player's moves may reset the lock timer, not chat's (夺舍). */
  private moveFalling(step: number, mayResetLock = true): boolean {
    // Both shift by the same step, so only the board can stop them.
    if (this.falling.some((p) => collides(this.board, p.matrix, p.x + step, p.y))) return false;
    const wasGrounded = this.isGrounded();
    for (const p of this.falling) p.x += step;
    if (mayResetLock) this.afterManipulation(wasGrounded);
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
    if (!this.playerControl) return false;
    this.stunned = false;
    if (this.deferred(() => this.rotate(dir))) return true;
    if (this.blockedBy('rotate')) return false;
    return this.rotateFalling(dir);
  }

  private rotateFalling(dir: 1 | -1, mayResetLock = true): boolean {
    let turned = false;
    for (const p of this.falling) turned = this.rotateWithKicks(p, dir, mayResetLock) || turned;
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
    if (!this.playerControl) return false;
    this.stunned = false;
    if (this.deferred(() => this.softDrop())) return true;
    if (this.blockedBy('softDrop')) return false;
    return this.softDropFalling();
  }

  private softDropFalling(): boolean {
    if (this.isGrounded()) return false;
    for (const p of this.falling) p.y += 1;
    this.score += CONFIG.score.softDropPerCell;
    this.gravityMs = 0;
    return true;
  }

  /** Drops and locks each falling piece, the lower first so the upper lands on it. */
  hardDrop(): boolean {
    if (!this.playerControl) return false;
    if (this.deferred(() => this.hardDrop())) return true;
    if (this.blockedBy('hardDrop')) return false;
    this.dropFalling();
    return true;
  }

  private dropFalling(): void {
    const pair = this.twin !== null;
    if (pair && bottomOf(this.twin!) > bottomOf(this.active!)) this.swapTwin();
    this.dropAndLock();
    if (pair && this.phase === 'playing' && this.holds.length === 0) this.dropAndLock();
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

  holdPiece(): boolean {
    if (!this.playerControl) return false;
    if (this.deferred(() => this.holdPiece())) return true;
    if (!this.canHold || this.blockedBy('hold')) return false;
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

  /** At most how late the player's commands act while a curse delays them (延迟); 0 when none does. */
  get maxInputDelayMs(): number {
    return Math.max(0, ...this.activeCurses.map(({ def }) => def.maxInputDelayMs ?? 0));
  }

  /**
   * While a curse delays input, queues `run` to act a random 0 to `maxInputDelayMs` of play time
   * from now, or loses it at the curse's `inputLossChance`, and says so; the caller then does
   * nothing yet. Not when it is that queued command acting at last.
   */
  private deferred(run: () => void): boolean {
    const max = this.maxInputDelayMs;
    if (max <= 0 || this.delayed.running) return false;
    const loss = Math.max(0, ...this.activeCurses.map(({ def }) => def.inputLossChance ?? 0));
    if (this.curseRng.next() < loss) return true;
    return this.delayed.defer(run, this.playMs + this.curseRng.next() * max);
  }

  /** Advance the cutscene, the vote, or gravity and lock delay, by `dtMs` of foreground play time. */
  tick(dtMs: number): void {
    if (this.phase !== 'playing') return;
    const hold = this.holds[0];
    if (hold?.kind === 'cutscene') {
      this.advanceCutscene(hold.clock, dtMs);
      return;
    }
    if (hold?.kind === 'vote') {
      this.advanceVote(dtMs);
      return;
    }
    if (hold?.kind === 'fakeDeath') {
      this.advanceFakeDeath(hold.clock, dtMs);
      return;
    }
    if (hold?.kind === 'possess') {
      this.advancePossession(hold.possession, dtMs);
      return;
    }
    if (hold?.kind === 'theft') {
      this.advanceTheft(hold.clock, dtMs);
      return;
    }
    if (hold?.kind === 'shove') {
      this.advanceShove(hold, dtMs);
      return;
    }
    if (!this.canControl) return;
    this.playMs += dtMs;
    if (this.likes.idle(this.playMs)) {
      this.logState('like meter idle: reset');
      this.emit();
    }
    this.delayed.runDue(this.playMs);
    if (!this.canControl) return;
    this.beatHeart(dtMs);
    if (this.possessing) this.playPossessed(this.possessing, dtMs);
    for (const { type, def } of this.activeCurses) {
      def.onTick?.(this.curseContext(null, type), dtMs, this.effects.active[type]!.state);
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
    // Not while 热心 holds the first: the pair goes on once it has locked.
    if (pair && this.phase === 'playing' && this.holds.length === 0) {
      if (this.restsOnBoard(this.active!)) this.lockPiece();
    }
  }

  // ---------------------------------------------------------------- spawning & locking

  private startingTeam(): TeamState {
    const team = createTeam(this.pool);
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
    const type = this.preview[0] ?? this.upcoming[0]!;
    const piece = this.takeFromQueue();
    const from = piece.type === type ? undefined : type;
    this.swap = from ? { from, atMs: this.playMs } : null;
    if (!this.activeCurses.some(({ def }) => def.spawnsTwin)) {
      this.place(piece);
      return;
    }
    const twinType = this.preview[0] ?? this.upcoming[0]!;
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
    this.keepPromise(type);
    let piece = createPiece(shapeOf(type));
    for (const { type: curse, def } of this.activeCurses) {
      if (def.onSpawn) {
        piece = def.onSpawn(this.curseContext(), piece, this.effects.active[curse]!.state);
      }
    }
    return piece;
  }

  /** 画饼: a promised piece leaves the queue; the first that isn't what was promised gives it away. */
  private keepPromise(type: PieceType): void {
    const promise = this.promise;
    if (!promise) return;
    if (promise.from > 0) {
      promise.from -= 1;
      return;
    }
    promise.count -= 1;
    if (promise.count === 0) this.promise = null;
    if (type === promise.shown || promise.told) return;
    promise.told = true;
    this.pushNotice({
      kind: 'reveal',
      type: 'pie',
      sender: promise.sender,
      text: `${this.curseByType.pie?.tagline ?? ''}（仅供参考）`,
    });
    this.logState(`pie revealed: ${type}`);
  }

  /** A hold swap or a scenario's first piece: spawned unrotated, and no curse sees it. */
  private spawn(shape: PieceShape): void {
    this.swap = null;
    this.place(createPiece(shape));
  }

  private place(piece: ActivePiece, twin: ActivePiece | null = null): void {
    this.resetPieceTimers();
    this.twin = null;
    this.nudge = null;
    if ([piece, twin].some((p) => p && collides(this.board, p.matrix, p.x, p.y))) {
      this.active = null;
      this.endGame('新方块的出生位置被占用');
      return;
    }
    this.active = piece;
    this.twin = twin;
  }

  /**
   * Lock the active piece. With a twin still falling, the turn goes on: the twin becomes active
   * with fresh timers. Otherwise the turn ends: count the lock, settle, spawn the next.
   */
  private lockPiece(): void {
    const piece = this.active;
    if (!piece || this.phase !== 'playing') return;
    if (this.startShove(piece)) return;
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
    this.moveOutBuriedNails();

    const held = new Set(this.squatters.map(({ row }) => row));
    const stays = (row: readonly Cell[]) => held.has(row as Cell[]);
    const full = this.board.flatMap((row, y) => (row.every(Boolean) && !stays(row) ? [y] : []));
    const cleared = clearFullLines(this.board, stays);
    this.combo = cleared > 0 ? this.combo + 1 : 0;
    const before = cleared > 0 ? this.comboLines : 0;
    this.comboLines = before + cleared;
    if (cleared > 0) {
      const { every } = CONFIG.sweep;
      const swept = this.sweepBottom(
        Math.floor(this.comboLines / every) - Math.floor(before / every),
        stays,
      );
      this.shout(cleared, full, swept);
      this.score += CONFIG.score.lineClear[cleared] ?? 0;
      this.lines += cleared + swept;
      this.logState(
        `cleared ${cleared} line${cleared > 1 ? 's' : ''}${swept ? `, swept ${swept}` : ''}`,
      );
      if (cleared >= CONFIG.relief.minLines)
        this.cancelPending({ kind: 'cancelled', lines: cleared });
      if (this.combo >= CONFIG.combo.cancelFrom)
        this.cancelPending({ kind: 'combo', combo: this.combo });
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

    // 延迟: presses still waiting were meant for the piece that just landed; they go with it.
    this.delayed.clear();
    this.stunned = false;
    // 夺舍: moves still queued go with the piece that landed.
    this.possessing = null;
    tickTimedEffects(this.effects);
    this.lockedPieceCount += 1;
    this.canHold = true;

    if (this.lockedPieceCount % CONFIG.settlement.everyLocks === 0) {
      this.settle();
      // The next piece waits for the game to end or the cutscene to finish.
      if ((this.phase as Phase) === 'gameOver' || this.holds.length > 0) {
        this.emit();
        return;
      }
    }
    this.spawnNext();
    this.emit();
  }

  /**
   * 热心: holds play to shove the piece about to lock, if a curse wants it shoved and it can go. It
   * locks where it lands once the helper is done (`advanceShove`).
   */
  private startShove(piece: ActivePiece): boolean {
    if (this.shoved === piece) return false;
    for (const { type, def } of this.activeCurses) {
      const dx = def.beforeLock?.(this.curseContext(), this.effects.active[type]!.state);
      const plan = dx && this.planShove(piece, dx);
      if (!plan) continue;
      this.shoved = piece;
      const sender = this.firedBy.get(type) ?? null;
      this.holds.unshift({
        kind: 'shove',
        piece,
        clock: new ShoveClock({ ...plan, by: type, sender }),
      });
      this.pushNotice({ kind: 'reveal', type, sender });
      this.logState(`${type} shoves the piece ${plan.to.x > plan.from.x ? 'right' : 'left'}`);
      this.emit();
      return true;
    }
    return false;
  }

  /**
   * Where a shove takes `piece`: `dx` columns over, or the other way if that is blocked, then down
   * to rest. A piece snug in a gap is lifted back up its way in until a step fits, so landing
   * neatly is no escape. Null only if its way up is shut before either step fits.
   */
  private planShove(
    piece: ActivePiece,
    dx: -1 | 1,
  ): Pick<ShoveView, 'from' | 'liftY' | 'to' | 'box'> | null {
    const { matrix } = piece;
    // Once it is above the board, only the walls are in the way.
    for (let y = piece.y; y >= -matrix.length; y -= 1) {
      if (collides(this.board, matrix, piece.x, y)) return null;
      const step = [dx, -dx].find((d) => !collides(this.board, matrix, piece.x + d, y));
      if (step === undefined) continue;
      const pushed = { ...piece, x: piece.x + step, y };
      const cells = pieceCells(matrix, 0, 0);
      return {
        from: { x: piece.x, y: piece.y },
        liftY: y,
        to: { x: pushed.x, y: y + this.dropDistance(pushed) },
        box: {
          left: Math.min(...cells.map(([cx]) => cx)),
          right: Math.max(...cells.map(([cx]) => cx)),
          top: Math.min(...cells.map(([, cy]) => cy)),
          bottom: Math.max(...cells.map(([, cy]) => cy)),
        },
      };
    }
    return null;
  }

  /** The helper's clock; when it is done the piece locks where it was pushed to. */
  private advanceShove(hold: { clock: ShoveClock; piece: ActivePiece }, dtMs: number): void {
    const step = hold.clock.advance(dtMs);
    if (step === 'done') {
      this.holds.shift();
      Object.assign(hold.piece, hold.clock.view.to);
      this.logState('shove over');
      this.lockPiece();
      this.emit();
    } else if (step === 'changed') {
      this.emit();
    }
  }

  /** 钉子户 with enough cells stacked on top take the money and go, leaving an ordinary cell. */
  private moveOutBuriedNails(): void {
    const depth = CONFIG.effects.nailBuryDepth;
    for (const view of this.squattersOn(this.board)) {
      if (view.buried < depth) continue;
      this.squatters = this.squatters.filter(({ id }) => id !== view.id);
      this.pushNotice({
        kind: 'reveal',
        type: 'nail',
        sender: view.sender,
        text: '拆迁款到手，搬走了 💰',
      });
      this.pushLog('system', `钉子户 ${view.sender?.name ?? ''} 拿钱搬走了。`);
      this.logState(`nail at ${view.x},${view.y} moved out`);
    }
  }

  /** A 钉子户 takes empty cell [x, y]: it blocks pieces, and its row stays until they go. */
  private squat([x, y]: [number, number], sender: Sender | null): void {
    const row = this.board[y];
    if (!row || row[x] !== null) return;
    row[x] = 'G';
    this.squatterId += 1;
    this.squatters.push({ id: this.squatterId, row, x, sender });
    this.logState(`nail by ${sender?.name ?? 'nobody'} at ${x},${y}`);
  }

  /** A big enough line clear, or a combo, cancels one pending curse, rarest first. */
  private cancelPending(
    why: { kind: 'cancelled'; lines: number } | { kind: 'combo'; combo: number },
  ): void {
    const type = cancelOne(this.team, this.pool, (t) => this.curseByType[this.shownAs(t)]!.rarity);
    if (type === null) return;
    const shown = this.shownAs(type);
    this.pushNotice({ ...why, type: shown, sender: takeSender(this.team, type) });
    const what = why.kind === 'combo' ? `连击 ×${why.combo}` : `消 ${why.lines} 行`;
    this.pushLog('system', `${what}，抵消 ${this.curseByType[shown]!.name}。`);
    this.logState(
      `${why.kind === 'combo' ? `combo ${why.combo}` : `${why.lines} lines`}: cancelled ${type}`,
    );
  }

  /** After enough settlements in a row with nothing pending, the game draws a curse itself. */
  private wakeQuietRoom(): void {
    if (!this.quiet.afterSettlement(pendingTotal(this.team))) return;
    const type = drawCurse(this.quietRng, rarityBands(drawableCurses(this.curses, this.team)));
    addSystemCurse(this.team, type);
    this.pushNotice({ kind: 'quiet', type });
    this.pushLog('system', `直播间太安静，系统送出 ${this.curseByType[type]!.name}。`);
    this.logState(`quiet room drew ${type}`);
  }

  /**
   * 清底: removes up to `n` of the lowest rows with anything in them (never one a 钉子户 holds),
   * adding empty rows on top. Returns how many went.
   */
  private sweepBottom(n: number, stays: (row: readonly Cell[]) => boolean): number {
    let swept = 0;
    for (let y = this.board.length - 1; y >= 0 && swept < n; y -= 1) {
      const row = this.board[y]!;
      if (!row.some(Boolean) || stays(row)) continue;
      this.board.splice(y, 1);
      swept += 1;
      // Everything above moved down into this row; look at it again.
      y += 1;
    }
    for (let i = 0; i < swept; i += 1) this.board.unshift(emptyRow());
    return swept;
  }

  /** A line clear's callout, when it is 2 lines or more, a combo, or it swept the bottom. */
  private shout(cleared: number, rows: readonly number[], swept: number): void {
    const combo = this.combo >= 2 ? this.combo : 0;
    if (cleared < 2 && !combo && !swept) return;
    const row = rows.reduce((sum, y) => sum + y, 0) / rows.length;
    this.callout = { atMs: this.playMs, combo, lines: cleared, swept, row };
  }

  /** The danger the board pulses red with, a beat at a time, while the stack is high. */
  private beatHeart(dtMs: number): void {
    const level = dangerLevel(this.board);
    if (this.heartbeat.advance(dtMs, level)) {
      this.danger = { beatAtMs: this.playMs, level: level! };
    } else if (level === null) {
      this.danger = null;
    } else if (this.danger) {
      this.danger = { ...this.danger, level };
    }
  }

  private pushNotice(notice: Omit<BoardNotice, 'id'>): void {
    this.noticeId += 1;
    this.notices = [...this.notices, { ...notice, id: this.noticeId }].slice(-3);
  }

  /** Holds play for a cutscene, ahead of anything else waiting, before the next piece spawns. */
  private startCutscene(
    curses: readonly CurseDef<unknown>[],
    senders: readonly (Sender | null)[],
  ): void {
    this.holds.unshift({ kind: 'cutscene', clock: new CutsceneClock(curses, senders) });
    this.logState(`cutscene for ${curses.map((def) => def.type).join(',')}`);
  }

  /**
   * 夺舍's countdown: the piece spawns and waits while chat queues moves. When time is up play
   * goes on, and the piece plays them out as it falls (see `playPossessed`).
   */
  private advancePossession(possession: Possession, dtMs: number): void {
    if (!this.active) {
      this.spawnNext();
      if (this.phase !== 'playing') return;
      this.emit();
    }
    const { changed, over } = possession.countdown(dtMs);
    if (over) {
      this.holds.shift();
      this.possessing = possession;
      this.logState(`possession plays ${possession.view.steps.length} moves`);
    }
    if (changed) this.emit();
  }

  /**
   * The possessed piece falling: chat's moves one a step, then a soft drop until it lands. Its
   * moves never hold off the lock, so once it lands the rest are soon lost.
   */
  private playPossessed(possession: Possession, dtMs: number): void {
    const { commands, drops, changed } = possession.play(dtMs);
    for (const command of commands) {
      if (command === 'rotate') this.rotateFalling(1, false);
      else this.moveFalling(command === 'left' ? -1 : 1, false);
    }
    for (let i = 0; i < drops && this.softDropFalling(); i += 1) {
      /* a row at a time */
    }
    if (changed) this.emit();
  }

  /** Whether a pending curse may fire at this settlement (see `CurseDef.ready`). */
  private readonly readyNow = (type: EffectType): boolean =>
    this.curseByType[type]!.ready?.(this.curseContext()) ?? true;

  private startFakeDeath(reason: string, sender: Sender | null): void {
    // Just enough rows to push the top of the stack off the board.
    const top = this.board.findIndex((row) => row.some(Boolean));
    const rows = Math.max(1, top + 1);
    this.holds.unshift({ kind: 'fakeDeath', clock: new FakeDeathClock(reason, sender, rows) });
    this.pushLog('system', `游戏结束：${reason}`);
    this.logState(`fake death by ${sender?.name ?? 'nobody'}`);
  }

  /** The wall, the fake game-over screen, then 骗你的; play goes on stunned after it. */
  private advanceFakeDeath(clock: FakeDeathClock, dtMs: number): void {
    const step = clock.advance(dtMs);
    if (step === 'done') {
      this.holds.shift();
      this.pushLog('system', `骗你的！${clock.view.sender?.name ?? ''} 送的是假死。`);
      this.logState('fake death over');
      if (this.holds.length === 0) this.spawnNext();
      this.stunned = true;
      this.emit();
    } else if (step === 'changed') {
      this.emit();
    }
  }

  /**
   * The thief sneaking in, lifting its cell off the board as it grabs, then running off. The next
   * piece spawns once it is gone, unless a cutscene waits to spawn it.
   */
  private advanceTheft(clock: TheftClock, dtMs: number): void {
    const step = clock.advance(dtMs);
    if (step === 'done') {
      this.holds.shift();
      this.logState('theft over');
      if (this.holds[0]?.kind !== 'cutscene') this.spawnNext();
      this.emit();
    } else if (step === 'changed') {
      const { stage, x, y } = clock.view;
      if (stage === 'grab') {
        const row = this.board[y]!;
        row[x] = null;
        // A squatter in that cell goes with it.
        this.squatters = this.squatters.filter((sq) => sq.row !== row || sq.x !== x);
      }
      this.emit();
    }
  }

  /** The names, then READY, then GO; the next piece spawns when GO is over. */
  private advanceCutscene(clock: CutsceneClock, dtMs: number): void {
    const step = clock.advance(dtMs);
    if (step === 'done') {
      this.holds.shift();
      this.logState('cutscene over');
      this.spawnNext();
      this.emit();
    } else if (step === 'changed') {
      this.emit();
    }
  }

  /**
   * Atomic settlement: at most one pending curse per queue fires (see `settleTeam`). A quiet room
   * may draw one first; curses with a cutscene then hold the next piece for it.
   */
  private settle(): void {
    this.votes.newRound();
    this.wakeQuietRoom();
    const dropped: [number, number][] = [];
    this.settlementCount += 1;
    const report: SettlementReport = { index: this.settlementCount, executed: [] };
    const senders = new Map<EffectType, Sender | null>();
    let gameOver: string | undefined;
    let fake: { reason: string; sender: Sender | null } | null = null;
    let theft: { at: [number, number]; sender: Sender | null } | null = null;
    const possessedBy: (Sender | null)[] = [];
    for (const type of settleTeam(this.team, this.pool, this.queueOf, this.readyNow)) {
      const sender = takeSender(this.team, type);
      senders.set(type, sender);
      this.firedBy.set(type, sender);
      const def = this.curseByType[type]!;
      this.mvpBoard.credit(sender, def.rarity);
      // A lasting curse is (re)activated first, so apply sees the state it keeps.
      const state =
        durationOf(def) === undefined ? def.initState?.() : activate(this.effects, type, def).state;
      const outcome = def.apply?.(this.curseContext(sender), state) ?? {};
      dropped.push(...(outcome.dropped ?? []));
      report.executed.push({ type, outcome });
      if (outcome.fakeGameOver) fake = { reason: outcome.fakeGameOver, sender };
      if (outcome.possess) possessedBy.push(sender);
      if (outcome.steal) theft = { at: outcome.steal, sender };
      if (outcome.squat) this.squat(outcome.squat, sender);
      if (outcome.promise) this.promise = { ...outcome.promise, sender, told: false };
      gameOver = outcome.gameOver;
      if (gameOver) {
        this.mvpBoard.finalBlow(sender);
        break;
      }
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
    // Behind any cutscene or 假死: chat takes the piece that spawns after them.
    for (const sender of possessedBy) {
      this.holds.push({ kind: 'possess', possession: new Possession(sender) });
    }
    const shown = report.executed.filter(({ type }) => this.curseByType[type]!.cutscene);
    if (shown.length > 0) {
      this.startCutscene(
        shown.map(({ type }) => this.curseByType[type]!),
        shown.map(({ type }) => senders.get(type) ?? null),
      );
    }
    if (theft) {
      const [x, y] = theft.at;
      const clock = new TheftClock(theft.sender, x, y, this.board[y]![x]!);
      this.holds.unshift({ kind: 'theft', clock });
      this.pushLog('system', `有小偷！${theft.sender?.name ?? ''} 偷走了一格。`);
      this.logState(`theft by ${theft.sender?.name ?? 'nobody'} at ${x},${y}`);
    }
    // Ahead of any cutscene or 小偷, so the fake death plays first and the cutscene after it.
    if (fake) this.startFakeDeath(fake.reason, fake.sender);
  }

  /**
   * What curses get to see and do: never the engine itself. `sender` sent the one firing; `by` is
   * the curse acting on its own, whose moves the board marks as not the player's.
   */
  private curseContext(sender: Sender | null = null, by: EffectType | null = null): CurseContext {
    return {
      board: this.board,
      active: this.active,
      curseRng: this.curseRng,
      garbageRng: this.garbageRng,
      tryRotate: (dir) => this.active !== null && this.rotateWithKicks(this.active, dir, false),
      tryMove: (dx) => {
        if (this.active === null || !this.shift(dx)) return false;
        if (by) this.nudge = { atMs: this.playMs, by, dx };
        return true;
      },
      trySetShape: (shape) => this.trySetShape(shape),
      upcoming: this.upcoming,
      setUpcoming: (index, type) => {
        if (!Number.isInteger(index) || index < 0 || index >= this.upcoming.length) return false;
        this.upcoming[index] = type;
        return true;
      },
      signRow: (y) => {
        const row = this.board[y];
        if (row && sender && sender.id !== SYSTEM_SENDER.id) this.rowNames.set(row, sender.name);
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
