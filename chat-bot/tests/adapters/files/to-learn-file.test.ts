import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toLearnFile } from '../../../src/adapters/files/to-learn-file';

const none = { known: () => false, max: 5 };

test('a missing list is made with its header when something is added, and gives no open items', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'to-learn-')), 'browse', 'to-learn.md');
  const list = toLearnFile(path);
  expect(list.open()).toEqual([]);
  expect(list.add([], none)).toEqual([]);
  list.add([{ term: '公会赛', question: '是什么？', from: '直播 2026-11-02' }], none);
  const text = readFileSync(path, 'utf8');
  expect(text).toMatch(/^# 还要学的\n/);
  expect(text).toContain('## 待学\n\n- [ ] 公会赛 — 是什么？（直播 2026-11-02）');
  expect(list.open()).toEqual(['公会赛']);
});

test('adds under 待学, keeps the lines a person wrote, and leaves out what the list or `known` has', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'to-learn-')), 'to-learn.md');
  writeFileSync(
    path,
    '# 还要学的\n\n## 话题\n\n- [ ] 星守护 — 有什么用？（手写）\n  已经查到一点\n- [x] 团播 — 是什么？（手写）→ 学了\n\n## 待学\n',
  );
  const added = toLearnFile(path).add(
    [
      { term: '星守护', question: '又问', from: '直播' },
      { term: '团播', question: '又问', from: '直播' },
      { term: '灯牌', question: '知道', from: '直播' },
      { term: 'PK段位', question: '有哪些？', from: '直播' },
    ],
    { known: (term) => term === '灯牌', max: 5 },
  );
  expect(added.map(({ term }) => term)).toEqual(['PK段位']);
  const text = readFileSync(path, 'utf8');
  expect(text).toContain('- [ ] 星守护 — 有什么用？（手写）\n  已经查到一点\n');
  expect(text).toContain('## 待学\n\n- [ ] PK段位 — 有哪些？（直播）');
  expect(toLearnFile(path).open()).toEqual(['星守护', 'PK段位']);
});
