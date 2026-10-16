import { join } from 'node:path';
import { writeJsonAtomic } from './json-file';

/** One thing that happened in the room: the streamer spoke, a viewer chatted, or sent a gift. */
export type ChatRecord = {
  /** Local time, `YYYY-MM-DD HH:MM:SS`, for reading. */
  time: string;
  /** Ms since the epoch. */
  ts: number;
  /** `主播` for the streamer, otherwise the viewer's nickname. */
  sender: string;
  userId?: string;
} & (
  | { type: 'speech'; text: string; emotion: string | null }
  | { type: 'chat'; text: string }
  | { type: 'gift'; gift: { name: string; count: number; diamonds: number } }
);

/** Omit applied to each member of a union, so the result is still a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A record before the log stamps its time. */
export type NewChatRecord = DistributiveOmit<ChatRecord, 'time' | 'ts'>;

export interface ChatLogOptions {
  /** Records per file; a full file is left alone and the next record starts a new one. */
  perFile?: number;
  now?: () => number;
  write?: (path: string, value: unknown) => void;
}

/**
 * The room's chat record on disk: JSON files in `dir`, each an array of up to 100 records,
 * named by the time of their first record (`<ms>.json`), so sorting the names sorts the files.
 */
export class ChatLog {
  private file = '';
  private records: ChatRecord[] = [];
  private readonly perFile: number;
  private readonly now: () => number;
  private readonly write: (path: string, value: unknown) => void;

  constructor(
    readonly dir: string,
    { perFile = 100, now = Date.now, write = writeJsonAtomic }: ChatLogOptions = {},
  ) {
    this.perFile = perFile;
    this.now = now;
    this.write = write;
  }

  add(record: NewChatRecord): void {
    const ts = this.now();
    if (this.records.length === 0) this.file = join(this.dir, `${ts}.json`);
    this.records.push({ time: localTime(ts), ts, ...record });
    this.write(this.file, this.records);
    if (this.records.length >= this.perFile) this.records = [];
  }
}

/** `YYYY-MM-DD HH:MM:SS` in the machine's time zone. */
function localTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
