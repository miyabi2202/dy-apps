import type { DyhubCommentEvent } from '@dy-apps/services';

/** One remembered chat line. */
export interface ChatLine {
  ts: number;
  userId?: string;
  nickname: string;
  content: string;
}

export function chatLineFrom(event: DyhubCommentEvent): ChatLine {
  return {
    ts: event.ts,
    userId: event.user?.id,
    nickname: event.user?.nickname ?? '匿名',
    content: event.data.content,
  };
}

/** The room's most recent chat lines, oldest first, holding at most `size`. */
export class ChatHistory {
  private readonly lines: ChatLine[] = [];

  constructor(private readonly size: number) {}

  add(line: ChatLine): void {
    this.lines.push(line);
    if (this.lines.length > this.size) this.lines.splice(0, this.lines.length - this.size);
  }

  recent(): ChatLine[] {
    return [...this.lines];
  }
}
