import { addMessage, type DanmakuMessage } from '../src/live-message';

const user = { id: 'u1', nickname: '奶茶不加糖' };

const chat = (id: string, text = 'hi'): DanmakuMessage => ({ id, user, text, ts: 0 });

const gift = (id: string, count: number, ts = 0): DanmakuMessage => ({
  id,
  user,
  text: '',
  gift: { name: '玫瑰', count },
  ts,
});

describe('addMessage', () => {
  it('keeps only the newest `max` messages', () => {
    const messages = [chat('a'), chat('b'), chat('c')];
    expect(addMessage(messages, chat('d'), 3).map((m) => m.id)).toEqual(['b', 'c', 'd']);
  });

  it('appends a gift whose combo is not on the wall yet', () => {
    expect(addMessage([chat('a')], gift('g', 5), 10)).toEqual([chat('a'), gift('g', 5)]);
  });

  it('adds more of a combo to its card and moves the card to the bottom', () => {
    const messages = [gift('g', 5, 1), chat('a'), chat('b')];
    const next = addMessage(messages, gift('g', 3, 2), 10);
    expect(next.map((m) => m.id)).toEqual(['a', 'b', 'g']);
    expect(next.at(-1)).toEqual(gift('g', 8, 2));
  });

  it("keeps the gift's price when merging, so the total follows the count", () => {
    const priced = (count: number): DanmakuMessage => ({
      ...gift('g', count),
      gift: { name: '玫瑰', count, diamonds: 10 },
    });
    const next = addMessage([priced(5)], priced(3), 10);
    expect(next[0]!.gift).toEqual({ name: '玫瑰', count: 8, diamonds: 10 });
  });

  it('keeps a combo of hundreds as one card', () => {
    let messages: readonly DanmakuMessage[] = [];
    for (let i = 0; i < 300; i++) messages = addMessage(messages, gift('g', 1), 10);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.gift!.count).toBe(300);
  });

  it('never merges a chat that shares an id', () => {
    expect(addMessage([chat('a', 'one')], chat('a', 'two'), 10)).toHaveLength(2);
  });

  it('does not change the list it was given', () => {
    const messages = [gift('g', 5)];
    addMessage(messages, gift('g', 3), 10);
    expect(messages).toEqual([gift('g', 5)]);
  });
});
