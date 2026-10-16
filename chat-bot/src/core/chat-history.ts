import type { ChatLine } from './room-events';

/** The room's most recent chat lines, oldest first, holding at most `size`. */
export class ChatHistory {
  private readonly lines: ChatLine[] = [];

  constructor(private readonly size: number) {}

  add({ ts, userId, nickname, content }: ChatLine): void {
    this.lines.push({ ts, userId, nickname, content });
    if (this.lines.length > this.size) this.lines.splice(0, this.lines.length - this.size);
  }

  recent(): ChatLine[] {
    return [...this.lines];
  }
}
