import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { addItems, itemsToAdd, openItems } from '@dy-apps/to-learn';
import type { ToLearnList } from '../../app/ports';

/** What the file says about itself when the bot makes it. */
const HEADER = [
  '# 还要学的',
  '',
  '机器人还不知道、想学的东西，一行一条：`- [ ] 词 — 问题（从哪来的）`，学完打勾，后面写学到了什么。',
  '人可以随手加、改、删；直播后 `pnpm remember` 会把没懂的加进来。',
  '`pnpm browse --todo` 学最前面几条没打勾的。',
  '',
].join('\n');

/**
 * The to-learn list in `path` (data/browse/to-learn.md), read on every call, since a person edits
 * it by hand and dy-browse ticks it off; every line that isn't an item stays as it is.
 */
export function toLearnFile(path: string): ToLearnList {
  const read = (): string | null => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  return {
    open: () => openItems(read() ?? '').map((item) => item.term),
    add(items, options) {
      const text = read() ?? HEADER;
      const added = itemsToAdd(text, items, options);
      if (added.length) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, addItems(text, added));
      }
      return added;
    },
  };
}
