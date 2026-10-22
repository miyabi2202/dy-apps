import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { droppedMessage } from './douyin/dropped';
import type { RawProtoMessage } from './douyin/proto';

export interface DroppedLogOptions {
  now?: () => number;
  append?: (path: string, text: string) => void;
  log?: (line: string) => void;
}

/**
 * The messages room-feed doesn't decode, kept in `dir` to work out later what Douyin sends (a
 * 直播间会员 bought, a 星守护…): one JSON line each (see DroppedMessage), a file a day,
 * `<YYYY-MM-DD>.jsonl` by this machine's date. `grep 会员 *.jsonl` finds them by their text.
 */
export class DroppedLog {
  private readonly now: () => number;
  private readonly append: (path: string, text: string) => void;
  private readonly log: (line: string) => void;
  private failed = false;

  constructor(
    readonly dir: string,
    { now = Date.now, append = appendFileSync, log = console.error }: DroppedLogOptions = {},
  ) {
    this.now = now;
    this.append = append;
    this.log = log;
  }

  add(message: RawProtoMessage): void {
    const ts = this.now();
    const day = new Date(ts).toLocaleDateString('sv'); // 2026-10-22
    try {
      this.append(
        join(this.dir, `${day}.jsonl`),
        JSON.stringify(droppedMessage(message, ts)) + '\n',
      );
    } catch (e) {
      // Keeping them is only for later: room-feed goes on, and says so once.
      if (!this.failed) this.log(`[room-feed] 无法记录未解析的消息：${(e as Error).message}`);
      this.failed = true;
    }
  }
}

/** A DroppedLog in `dir`, made first if it isn't there. */
export function droppedLogIn(dir: string): DroppedLog {
  mkdirSync(dir, { recursive: true });
  return new DroppedLog(dir);
}
