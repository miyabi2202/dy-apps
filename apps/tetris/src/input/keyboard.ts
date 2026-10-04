import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';

type Action =
  'left' | 'right' | 'softDrop' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold' | 'pause';

export const KEY_BINDINGS: Record<string, Action> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  KeyX: 'rotateCW',
  KeyZ: 'rotateCCW',
  Space: 'hardDrop',
  KeyC: 'hold',
  KeyP: 'pause',
};

/** Keys whose browser default (scrolling, button activation) must not fire during play. */
const SUPPRESSED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

interface Held {
  action: 'left' | 'right' | 'softDrop';
  elapsedMs: number;
  repeating: boolean;
}

/**
 * Keyboard → engine. Uses its own DAS/ARR timing instead of OS key repeat:
 * left/right/soft drop repeat while held; everything else ignores repeats.
 */
export class KeyboardController {
  private horizontal: Held | null = null;
  private softDrop: Held | null = null;
  private readonly pressed = new Set<string>();

  constructor(private readonly engine: GameEngine) {}

  attach(target: Window): () => void {
    const down = (e: KeyboardEvent) => this.handleKeyDown(e);
    const up = (e: KeyboardEvent) => this.handleKeyUp(e);
    const blur = () => this.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  handleKeyDown(e: KeyboardEvent): void {
    if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const engine = this.engine;
    if (
      e.code === 'Enter' &&
      engine.phase === 'ready' &&
      !(e.target instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      engine.start();
      return;
    }
    const action = KEY_BINDINGS[e.code];
    if (!action) return;
    if (engine.phase === 'playing' && SUPPRESSED.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.pressed.add(e.code);

    if (action === 'pause') {
      engine.togglePause();
      return;
    }
    if (engine.phase !== 'playing') return;
    switch (action) {
      case 'left':
      case 'right':
        this.horizontal = { action, elapsedMs: 0, repeating: false };
        engine.move(action === 'left' ? -1 : 1);
        break;
      case 'softDrop':
        this.softDrop = { action, elapsedMs: 0, repeating: false };
        engine.softDrop();
        break;
      case 'rotateCW':
        engine.rotate(1);
        break;
      case 'rotateCCW':
        engine.rotate(-1);
        break;
      case 'hardDrop':
        engine.hardDrop();
        break;
      case 'hold':
        engine.holdPiece();
        break;
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    if (this.engine.phase === 'playing' && SUPPRESSED.has(e.code) && !isEditable(e.target)) {
      e.preventDefault();
    }
    this.pressed.delete(e.code);
    const action = KEY_BINDINGS[e.code];
    if (action === 'softDrop') this.softDrop = null;
    if ((action === 'left' || action === 'right') && this.horizontal?.action === action) {
      // Fall back to the other direction if it is still held.
      const other = action === 'left' ? 'ArrowRight' : 'ArrowLeft';
      this.horizontal = this.pressed.has(other)
        ? { action: action === 'left' ? 'right' : 'left', elapsedMs: 0, repeating: false }
        : null;
    }
  }

  /** Drive held-key repeats. Call once per frame while playing. */
  update(dtMs: number): void {
    if (this.engine.phase !== 'playing') return;
    const { dasMs, arrMs, softDropRepeatMs } = CONFIG.input;
    if (this.horizontal) {
      const dx = this.horizontal.action === 'left' ? -1 : 1;
      this.repeat(this.horizontal, dtMs, dasMs, arrMs, () => this.engine.move(dx));
    }
    if (this.softDrop) {
      this.repeat(this.softDrop, dtMs, softDropRepeatMs, softDropRepeatMs, () =>
        this.engine.softDrop(),
      );
    }
  }

  private repeat(held: Held, dtMs: number, delay: number, interval: number, act: () => boolean) {
    held.elapsedMs += dtMs;
    if (!held.repeating) {
      if (held.elapsedMs < delay) return;
      held.repeating = true;
      held.elapsedMs -= delay;
      if (!act()) return;
    }
    while (held.elapsedMs >= interval) {
      held.elapsedMs -= interval;
      if (!act()) {
        held.elapsedMs = 0;
        return;
      }
    }
  }

  /** Forget all held keys (blur, tab hidden). */
  clear(): void {
    this.pressed.clear();
    this.horizontal = null;
    this.softDrop = null;
  }
}
