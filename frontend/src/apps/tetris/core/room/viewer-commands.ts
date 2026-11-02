import { CONFIG } from '../config';
import type { Sender } from '../types';

/** What a viewer's chat can do to the piece while a curse hands it over (夺舍). */
export type ViewerCommand = keyof typeof CONFIG.viewerCommands;

/** A viewer's chat command that reached the piece, for the board to show who did what. */
export interface ViewerInput {
  id: number;
  user: Sender;
  command: ViewerCommand;
  /** Whether the piece actually moved or turned; against a wall it doesn't. */
  worked: boolean;
}

/** The command a chat is: exactly one of CONFIG.viewerCommands, give or take spaces. */
export function parseViewerCommand(text: string): ViewerCommand | null {
  const words = CONFIG.viewerCommands;
  return (Object.keys(words) as ViewerCommand[]).find((c) => words[c] === text.trim()) ?? null;
}

/** The last few viewers' commands, oldest first, for the board. */
export class ViewerInputs {
  list: readonly ViewerInput[] = [];
  private id = 0;

  push(user: Sender, command: ViewerCommand, worked: boolean): void {
    this.id += 1;
    this.list = [...this.list, { id: this.id, user, command, worked }].slice(
      -CONFIG.viewerInputsShown,
    );
  }

  clear(): void {
    this.list = [];
  }
}
