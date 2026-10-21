import type { ChatLine } from './room-events';

/** The room's most recent chat lines, oldest first, holding at most `size`. */
export class ChatHistory {
  private readonly lines: ChatLine[] = [];

  constructor(private readonly size: number) {}

  /** Keeps a line as it is, with the badges and levels DyHub sent (but not what an @ picked). */
  add({ ts, userId, nickname, content, badges, fansClub, payLevel }: ChatLine): void {
    this.lines.push({
      ts,
      userId,
      nickname,
      content,
      ...(badges && { badges }),
      ...(fansClub && { fansClub }),
      ...(payLevel !== undefined && { payLevel }),
    });
    if (this.lines.length > this.size) this.lines.splice(0, this.lines.length - this.size);
  }

  recent(): ChatLine[] {
    return [...this.lines];
  }
}
