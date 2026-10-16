import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** One thing that happened in the room: the streamer spoke, a viewer chatted, or sent a gift. */
export type ChatRecord = {
  /** `主播` for the streamer, otherwise the viewer's nickname. */
  sender: string;
  userId?: string;
} & (
  | { type: 'speech'; text: string; emotion: string | null }
  | { type: 'chat'; text: string }
  | { type: 'gift'; gift: { name: string; count: number; diamonds: number } }
);

export interface ChatLogOptions {
  /** Lines per file; after a full file the next record starts a new one. */
  perFile?: number;
  now?: () => number;
  append?: (path: string, text: string) => void;
}

/**
 * One record as one line, short to keep Claude's reading cheap:
 *
 *     2026-10-16 16:47:33 [主播](speech)(NEUTRAL) 而且有出土的文物可以作证……
 *     2026-10-16 16:47:22 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）
 */
export function formatRecord(record: ChatRecord, ms: number): string {
  const who = record.userId ? `${record.sender}#${record.userId}` : record.sender;
  const emotion = record.type === 'speech' && record.emotion ? `(${record.emotion})` : '';
  const message =
    record.type === 'gift'
      ? `送出 ${record.gift.name}×${record.gift.count}（${record.gift.diamonds}钻）`
      : record.text;
  return `${localTime(ms)} [${who}](${record.type})${emotion} ${message}`.replace(/[\r\n]+/g, ' ');
}

/**
 * The room's chat record on disk: text files in `dir`, one record per line and up to 100 lines
 * each, named by the time of their first record (`<ms>.txt`), so sorting the names sorts them.
 */
export class ChatLog {
  private file = '';
  private lines = 0;
  private readonly perFile: number;
  private readonly now: () => number;
  private readonly append: (path: string, text: string) => void;

  constructor(
    readonly dir: string,
    { perFile = 100, now = Date.now, append = appendFileSync }: ChatLogOptions = {},
  ) {
    this.perFile = perFile;
    this.now = now;
    this.append = append;
  }

  add(record: ChatRecord): void {
    const ms = this.now();
    if (this.lines === 0) this.file = join(this.dir, `${ms}.txt`);
    this.append(this.file, formatRecord(record, ms) + '\n');
    this.lines = (this.lines + 1) % this.perFile;
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
