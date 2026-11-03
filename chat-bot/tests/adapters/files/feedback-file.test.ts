import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedbackFile } from '../../../src/adapters/files/feedback-file';

const ITEM = {
  kind: 'prompt',
  time: '20:00:05',
  botSaid: '欢迎',
  feedback: '阿拂：别刷屏了',
  problem: '话太多',
  fix: '短一点',
} as const;

test('adds a section a stream, a box each, after what is there', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'data-')), 'feedback.md');
  const list = feedbackFile(path);
  list.add('834626631343', '2026-11-03', []);
  list.add('834626631343', '2026-11-03', [ITEM, { ...ITEM, kind: 'knowledge' }]);
  expect(readFileSync(path, 'utf8')).toBe(
    '\n## 2026-11-03 房间 834626631343\n\n' +
      '- [ ] 【提示词】20:00:05 机器人说「欢迎」→ 阿拂：别刷屏了。问题：话太多 改法：短一点\n' +
      '- [ ] 【知识】20:00:05 机器人说「欢迎」→ 阿拂：别刷屏了。问题：话太多 改法：短一点\n',
  );

  // A ticked box stays as it is.
  writeFileSync(path, '- [x] 改好了\n');
  list.add('1', '2026-11-04', [{ ...ITEM, kind: 'program' }]);
  expect(readFileSync(path, 'utf8')).toMatch(
    /^- \[x\] 改好了\n\n## 2026-11-04 房间 1\n\n- \[ \] 【程序】/,
  );
});
