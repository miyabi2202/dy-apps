import { CONFIG } from '../config';
import type { Sender } from '../types';

/** What one character of a viewer's chat does to the piece while 夺舍 holds it. */
export type PossessCommand = 'left' | 'right' | 'rotate';

const COMMANDS: Record<string, PossessCommand> = { 左: 'left', 右: 'right', 转: 'rotate' };

/** Spaces and punctuation a viewer might type between commands. */
const FILLER = /[\s,，.。、!！~～]/gu;

/**
 * The commands a chat spells, one per character: 左右左右 is left, right, left, right. Null for
 * anything else, so ordinary chat that happens to say 左 never counts.
 */
export function parsePossess(text: string): PossessCommand[] | null {
  const chars = [...text.replace(FILLER, '')];
  if (chars.length === 0 || !chars.every((c) => c in COMMANDS)) return null;
  return chars.map((c) => COMMANDS[c]!);
}

/** One command queued by a viewer. */
export interface PossessStep {
  readonly id: number;
  readonly command: PossessCommand;
  readonly sender: Sender;
}

/**
 * 夺舍. First 'program': play holds for `CONFIG.possess.programMs` while chat queues commands.
 * Then 'play': the piece falls as usual and runs one every `stepMs`; then 'drop': it soft-drops
 * until it lands. Commands still queued when it locks are dropped.
 */
export interface PossessView {
  stage: 'program' | 'play' | 'drop';
  /** Time left to queue commands, while programming. */
  remainingMs: number;
  steps: readonly PossessStep[];
  /** Steps already run. */
  played: number;
  /** Who sent the curse, when known. */
  sender: Sender | null;
}

/** What moving the playback on did: commands to run now, and how many rows to soft-drop. */
export interface PossessPlay {
  commands: PossessCommand[];
  drops: number;
  changed: boolean;
}

/** One 夺舍: the chat's commands, then playing them back. */
export class Possession {
  view: PossessView;
  private ms = 0;
  private stepId = 0;

  constructor(sender: Sender | null) {
    this.view = {
      stage: 'program',
      remainingMs: CONFIG.possess.programMs,
      steps: [],
      played: 0,
      sender,
    };
  }

  /**
   * A viewer's chat while programming: its commands go on the end of the queue, up to
   * `perChat` of them and `maxSteps` in all. Whether any were taken.
   */
  add(sender: Sender, text: string): boolean {
    if (this.view.stage !== 'program') return false;
    const commands = parsePossess(text);
    const room = CONFIG.possess.maxSteps - this.view.steps.length;
    if (!commands || room <= 0) return false;
    const taken = commands.slice(0, Math.min(room, CONFIG.possess.perChat)).map((command) => {
      this.stepId += 1;
      return { id: this.stepId, command, sender };
    });
    this.view = { ...this.view, steps: [...this.view.steps, ...taken] };
    return true;
  }

  /**
   * The programming countdown. `changed` when the shown second changes; `over` once time is
   * up, when playback starts (or the drop, with nothing queued).
   */
  countdown(dtMs: number): { changed: boolean; over: boolean } {
    const remainingMs = Math.max(0, this.view.remainingMs - dtMs);
    const changed = Math.ceil(remainingMs / 1000) !== Math.ceil(this.view.remainingMs / 1000);
    if (remainingMs > 0) {
      this.view = { ...this.view, remainingMs };
      return { changed, over: false };
    }
    const stage = this.view.steps.length > 0 ? 'play' : 'drop';
    this.view = { ...this.view, stage, remainingMs: 0 };
    this.ms = 0;
    return { changed: true, over: true };
  }

  /**
   * Playback by `dtMs` of play time: a command every `stepMs`, the first one `stepMs` in; after
   * the last, a row of soft drop every `CONFIG.input.softDropRepeatMs`.
   */
  play(dtMs: number): PossessPlay {
    const { stepMs } = CONFIG.possess;
    const dropMs = CONFIG.input.softDropRepeatMs;
    this.ms += dtMs;
    const result: PossessPlay = { commands: [], drops: 0, changed: false };
    if (this.view.stage === 'play') {
      const { steps, played } = this.view;
      const due = Math.min(steps.length, Math.floor(this.ms / stepMs));
      result.commands = steps.slice(played, due).map((s) => s.command);
      result.changed = due !== played;
      if (due === steps.length) {
        this.view = { ...this.view, stage: 'drop', played: due };
        this.ms -= due * stepMs;
      } else {
        this.view = { ...this.view, played: due };
        return result;
      }
    }
    if (this.view.stage === 'drop') {
      result.drops = Math.floor(this.ms / dropMs);
      this.ms -= result.drops * dropMs;
    }
    return result;
  }
}
