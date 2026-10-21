import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RoomRecord } from '../app/ports';
import { formatRecord, type ChatRecord } from '../core/chat-record';

export interface ChatLogOptions {
  /** Lines per file; after a full file the next record starts a new one. */
  perFile?: number;
  now?: () => number;
  /** The time zone the records' times are in (the room's, read each time); the machine's without. */
  timeZone?: () => string | undefined;
  append?: (path: string, text: string) => void;
}

/**
 * The room's chat record on disk: text files in `dir`, one record per line and up to 100 lines
 * each, named by the time of their first record (`<ms>.txt`), so sorting the names sorts them.
 */
export class ChatLog implements RoomRecord {
  private file = '';
  private lines = 0;
  private readonly perFile: number;
  private readonly now: () => number;
  private readonly timeZone: () => string | undefined;
  private readonly append: (path: string, text: string) => void;

  constructor(
    readonly dir: string,
    {
      perFile = 100,
      now = Date.now,
      timeZone = () => undefined,
      append = appendFileSync,
    }: ChatLogOptions = {},
  ) {
    this.perFile = perFile;
    this.timeZone = timeZone;
    this.now = now;
    this.append = append;
  }

  add(record: ChatRecord): void {
    const ms = this.now();
    if (this.lines === 0) this.file = join(this.dir, `${ms}.txt`);
    this.append(this.file, formatRecord(record, ms, this.timeZone()) + '\n');
    this.lines = (this.lines + 1) % this.perFile;
  }
}
