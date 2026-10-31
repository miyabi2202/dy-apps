import { knowledgeText, mentioned, parseKnowledge } from '../../../src/core/knowledge/entries';

const FILE = `# 抖音直播（草稿说明，不进 prompt）

## 灯牌

aliases: 粉丝灯牌，保牌子、点灯牌
类型: 事实
截至: 2026-10
来源: 直播间记录
灯牌是主播粉丝团的徽章。
一段时间不来会熄灭。

## PK

aliases: pk, 偷塔
PK 是两个主播连线比拼。

## 七天熄灭

废弃: 说法不对，熄灭天数以 App 为准
灯牌七天不来就熄灭。
`;

test('an entry is its heading, its aliases and what it says, without the lines about it', () => {
  const entries = parseKnowledge(FILE);
  expect(entries).toEqual([
    {
      title: '灯牌',
      aliases: ['粉丝灯牌', '保牌子', '点灯牌'],
      text: '## 灯牌\n\n灯牌是主播粉丝团的徽章。\n一段时间不来会熄灭。',
    },
    { title: 'PK', aliases: ['pk', '偷塔'], text: '## PK\n\nPK 是两个主播连线比拼。' },
  ]);
});

test('what comes before the first heading, and an entry marked 废弃, are left out', () => {
  const titles = parseKnowledge(FILE).map(({ title }) => title);
  expect(titles).not.toContain('七天熄灭');
  expect(knowledgeText(parseKnowledge(FILE))).not.toContain('草稿说明');
});

test('an entry is named when its heading or an alias is said, in any case', () => {
  const entries = parseKnowledge(FILE);
  expect(mentioned(entries, ['今天要保牌子'])).toEqual([0]);
  expect(mentioned(entries, ['打pk了', '灯牌亮了'])).toEqual([0, 1]);
  expect(mentioned(entries, ['唱首歌吧'])).toEqual([]);
});

test('the prompt shows the entries a blank line apart', () => {
  expect(knowledgeText(parseKnowledge(FILE))).toBe(
    '## 灯牌\n\n灯牌是主播粉丝团的徽章。\n一段时间不来会熄灭。\n\n## PK\n\nPK 是两个主播连线比拼。',
  );
});
