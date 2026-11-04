import {
  addItems,
  formatItem,
  itemsToAdd,
  markDone,
  markOpen,
  openItems,
  parseToLearn,
  sameTerm,
  termKey,
} from '../src';

const FILE = [
  '# 还要学的',
  '',
  '一个人随手写的话，不是条目。',
  '',
  '## 要重新搜的话题',
  '',
  '- [ ] 星守护 — 抖音直播间的星守护有什么用？（手写 2026-11-01）',
  '  已经查到：按时长付费，和粉丝团有关。',
  '  `pnpm browse --topic 星守护`',
  '- [x] 灯牌 — 灯牌各级要多少亲密度？（刷抖音时好奇 2026-10-30）→ 2026-10-31 学到，草稿 2 条',
  '',
  '## 还没做的事',
  '',
  '- 审核步骤的改进还没提交。',
  '',
].join('\n');

describe('parseToLearn', () => {
  it('reads open and done items, their notes, and keeps every line', () => {
    const { lines, items } = parseToLearn(FILE);
    expect(lines.join('\n')).toBe(FILE);
    expect(items).toEqual([
      {
        term: '星守护',
        question: '抖音直播间的星守护有什么用？',
        from: '手写 2026-11-01',
        done: false,
        line: 6,
        notes: ['已经查到：按时长付费，和粉丝团有关。', '`pnpm browse --topic 星守护`'],
      },
      {
        term: '灯牌',
        question: '灯牌各级要多少亲密度？',
        from: '刷抖音时好奇 2026-10-30',
        done: true,
        outcome: '2026-10-31 学到，草稿 2 条',
        line: 9,
        notes: [],
      },
    ]);
    expect(openItems(FILE).map((i) => i.term)).toEqual(['星守护']);
  });

  it('is lenient with a hand-written line: a `-`, a `：`, no （…）, a bold term, a capital X', () => {
    const items = parseToLearn(
      [
        '- [ ] 宇宙之心 - 宇宙之心是什么礼物？',
        '- [ ] **新人展馆**：和礼物展馆是什么关系？',
        '- [ ] 团播',
        '- [X] 大飞 — 大飞是谁？ -> 没查到',
        '* [ ] 人气票 —— 人气票算财富等级吗？(直播 2026-11-02)',
        '  - [ ] 缩进的是备注，不是条目',
        '- [] 不是条目',
      ].join('\n'),
    ).items;
    expect(
      items.map(({ term, question, from, done, outcome }) => ({
        term,
        question,
        from,
        done,
        outcome,
      })),
    ).toEqual([
      {
        term: '宇宙之心',
        question: '宇宙之心是什么礼物？',
        from: '',
        done: false,
        outcome: undefined,
      },
      {
        term: '新人展馆',
        question: '和礼物展馆是什么关系？',
        from: '',
        done: false,
        outcome: undefined,
      },
      { term: '团播', question: '', from: '', done: false, outcome: undefined },
      { term: '大飞', question: '大飞是谁？', from: '', done: true, outcome: '没查到' },
      {
        term: '人气票',
        question: '人气票算财富等级吗？',
        from: '直播 2026-11-02',
        done: false,
        outcome: undefined,
      },
    ]);
    expect(items[4]!.notes).toEqual(['- [ ] 缩进的是备注，不是条目']);
  });
});

describe('formatItem', () => {
  it('writes the strict format, which reads back the same', () => {
    const item = {
      term: ' **宇宙 之心** ',
      question: '宇宙之心\n是什么？',
      from: '直播 2026-11-02',
    };
    const line = formatItem(item);
    expect(line).toBe('- [ ] 宇宙 之心 — 宇宙之心 是什么？（直播 2026-11-02）');
    expect(parseToLearn(line).items[0]).toMatchObject({
      term: '宇宙 之心',
      question: '宇宙之心 是什么？',
      from: '直播 2026-11-02',
      done: false,
    });
    expect(formatItem({ term: '甲', question: '', from: '', done: true, outcome: '学到' })).toBe(
      '- [x] 甲 — 「甲」是什么？ → 学到',
    );
  });
});

describe('addItems', () => {
  it('appends under ## 待学 (made at the end when missing), leaving every other line as it was', () => {
    const text = addItems(FILE, [
      { term: '宇宙之心', question: '宇宙之心是什么？', from: '直播 2026-11-02' },
    ]);
    expect(text).toBe(`${FILE}\n## 待学\n\n- [ ] 宇宙之心 — 宇宙之心是什么？（直播 2026-11-02）\n`);
    const again = addItems(text, [{ term: '团播', question: '团播是什么？', from: '手写' }]);
    expect(again).toBe(
      `${FILE}\n## 待学\n\n- [ ] 宇宙之心 — 宇宙之心是什么？（直播 2026-11-02）\n- [ ] 团播 — 团播是什么？（手写）\n`,
    );
    expect(addItems('', [{ term: '甲', question: '甲？', from: 'x' }])).toBe(
      '## 待学\n\n- [ ] 甲 — 甲？（x）\n',
    );
  });

  it('adds to the end of an existing ## 待学 section, before the next heading', () => {
    const text = '# 表\n\n## 待学\n\n- [ ] 甲 — 甲？（x）\n\n## 备注\n\n随便写的\n';
    expect(addItems(text, [{ term: '乙', question: '乙？', from: 'y' }])).toBe(
      '# 表\n\n## 待学\n\n- [ ] 甲 — 甲？（x）\n- [ ] 乙 — 乙？（y）\n\n## 备注\n\n随便写的\n',
    );
  });

  it('dedupes by normalised term against every item (open or done), known terms and itself; caps at max', () => {
    const wanted = ['「星守护」', '灯牌', '知识库有的', '新一', '新 一', '新二', '新三'].map(
      (term) => ({
        term,
        question: `${term}？`,
        from: 'x',
      }),
    );
    const known = (term: string) => term === '知识库有的';
    expect(itemsToAdd(FILE, wanted, { known, max: 2 }).map((i) => i.term)).toEqual([
      '新一',
      '新二',
    ]);
    expect(addItems(FILE, wanted.slice(0, 3), { known })).toBe(FILE);
  });
});

describe('markDone', () => {
  it('ticks the open item and appends the outcome, changing no other line', () => {
    const text = markDone(FILE, '「星守护」', '2026-11-02 学到，草稿 3 条');
    const before = FILE.split('\n');
    const after = text.split('\n');
    expect(after[6]).toBe(
      '- [x] 星守护 — 抖音直播间的星守护有什么用？（手写 2026-11-01）→ 2026-11-02 学到，草稿 3 条',
    );
    expect(after.filter((_, i) => i !== 6)).toEqual(before.filter((_, i) => i !== 6));
    expect(parseToLearn(text).items[0]).toMatchObject({
      done: true,
      from: '手写 2026-11-01',
      outcome: '2026-11-02 学到，草稿 3 条',
    });
    // Done ones aren't ticked again; an unknown term changes nothing.
    expect(markDone(FILE, '灯牌', 'again')).toBe(FILE);
    expect(markDone(FILE, '没有', 'x')).toBe(FILE);
  });
});

describe('terms', () => {
  it('compares terms without case, spaces, quotes or bold marks', () => {
    expect(termKey(' **「Ab 鸣潮」** ')).toBe('ab鸣潮');
    expect(sameTerm('鸣潮', '鸣潮 卡池')).toBe(true);
    expect(sameTerm('鸣', '鸣潮')).toBe(false);
  });
});

describe('markOpen', () => {
  it('opens a done item again, dropping its outcome, changing no other line', () => {
    const done = markDone(FILE, '星守护', '2026-11-02 没查到，见 searches/x.json');
    const text = markOpen(done, '星守护');
    expect(text).toBe(FILE);
    expect(parseToLearn(text).items[0]).toMatchObject({ done: false, from: '手写 2026-11-01' });
    // An open item, or an unknown term, changes nothing.
    expect(markOpen(FILE, '星守护')).toBe(FILE);
    expect(markOpen(done, '没有的词')).toBe(done);
  });
});
