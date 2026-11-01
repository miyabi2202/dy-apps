/** How far an item got: found → metadata → transcribed → ocr → done. */
export const STAGES = ['found', 'metadata', 'transcribed', 'ocr', 'done'] as const;
export type Stage = (typeof STAGES)[number];

/** One item's progress, with what its stages produced so a rerun doesn't redo them. */
export interface ItemState {
  stage: Stage;
  transcript?: string[];
  song?: { title: string; artist: string } | null;
  ocr?: string[];
}

export type StateFile = Record<string, ItemState>;

/** `state/<date>.json`: where the run's per-item progress is kept, read and written whole. */
export interface StateStore {
  read(date: string): StateFile | null;
  write(date: string, state: StateFile): void;
}

/**
 * Each item's stage for one day, saved on every change: a crash or a Douyin hiccup halfway costs
 * nothing, the next run picks up where this one stopped.
 */
export class RunState {
  private readonly file: StateFile;

  constructor(
    private readonly store: StateStore,
    private readonly date: string,
  ) {
    this.file = store.read(date) ?? {};
  }

  get(id: string): ItemState | null {
    return this.file[id] ?? null;
  }

  /** Whether `id` has reached `stage` (or beyond). */
  reached(id: string, stage: Stage): boolean {
    const have = this.file[id];
    return !!have && STAGES.indexOf(have.stage) >= STAGES.indexOf(stage);
  }

  /** Records a stage and what it produced; a stage never goes backwards. */
  advance(id: string, stage: Stage, produced: Omit<ItemState, 'stage'> = {}): void {
    const have = this.file[id];
    const keep = have && STAGES.indexOf(have.stage) > STAGES.indexOf(stage) ? have.stage : stage;
    this.file[id] = { ...have, ...produced, stage: keep };
    this.store.write(this.date, this.file);
  }
}
