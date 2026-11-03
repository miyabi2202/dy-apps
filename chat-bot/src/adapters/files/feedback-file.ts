import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BotFeedback, FeedbackList } from '../../app/ports';

const KIND_LABELS: Record<BotFeedback['kind'], string> = {
  program: '程序',
  prompt: '提示词',
  knowledge: '知识',
};

/**
 * What audiences said the bot got wrong, in `path` (data/feedback.md), across rooms: a section a
 * stream, `## 2026-11-03 房间 834626631343`, and a `- [ ]` item each, for a person to tick off once
 * it's fixed. Appended and never rewritten, so their ticks and notes stay.
 */
export function feedbackFile(path: string): FeedbackList {
  return {
    add(roomId, date, items) {
      if (!items.length) return;
      const lines = items.map(
        (item) =>
          `- [ ] 【${KIND_LABELS[item.kind]}】${item.time} 机器人说「${item.botSaid}」→ ${item.feedback}。问题：${item.problem} 改法：${item.fix}`,
      );
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `\n## ${date} 房间 ${roomId}\n\n${lines.join('\n')}\n`);
    },
  };
}
