import { GiftCounter, type DyhubEvent } from '../src/dyhub';
import { likeMessage, messageFromEvent } from '../src/live-message';

const dyhubUser = {
  id: 'u1',
  nickname: '奶茶不加糖',
  avatar: 'https://example.com/a.png',
  fansClub: { name: '弹幕墙', level: 12, status: 1, anchorId: 'x' },
};

const chatEvent = (content: unknown): DyhubEvent => ({
  id: 'e1',
  roomId: 'r1',
  type: 'chat',
  ts: 100,
  user: dyhubUser,
  data: { content },
});

const giftEvent = (data: Record<string, unknown>, id = 'e2'): DyhubEvent => ({
  id,
  roomId: 'r1',
  type: 'gift',
  ts: 200,
  user: dyhubUser,
  data: { giftId: 'g1', giftName: '玫瑰', ...data },
});

describe('messageFromEvent', () => {
  it('turns a chat into a message, with the avatar and fan club', () => {
    expect(messageFromEvent(chatEvent('主播晚上好'), 0)).toEqual({
      id: 'e1',
      user: {
        id: 'u1',
        nickname: '奶茶不加糖',
        avatarUrl: 'https://example.com/a.png',
        fansClub: { name: '弹幕墙', level: 12 },
      },
      text: '主播晚上好',
      ts: 100,
    });
  });

  it('drops empty and non-text chats', () => {
    expect(messageFromEvent(chatEvent('   '), 0)).toBeNull();
    expect(messageFromEvent(chatEvent(42), 0)).toBeNull();
    expect(messageFromEvent(chatEvent(undefined), 0)).toBeNull();
  });

  it('drops events without a user, and other event types', () => {
    expect(messageFromEvent({ ...chatEvent('hi'), user: undefined }, 0)).toBeNull();
    expect(messageFromEvent({ ...chatEvent('hi'), type: 'like' }, 0)).toBeNull();
  });

  it('turns a gift into a card with its name, icon, price and new count', () => {
    const message = messageFromEvent(
      giftEvent({ groupId: 'grp', giftIcon: 'https://example.com/rose.png', diamondCount: 10 }),
      3,
    );
    expect(message).toMatchObject({
      text: '',
      gift: { name: '玫瑰', count: 3, diamonds: 10, iconUrl: 'https://example.com/rose.png' },
      ts: 200,
    });
  });

  it('drops a gift that adds nothing (a repeat)', () => {
    expect(messageFromEvent(giftEvent({ groupId: 'grp' }), 0)).toBeNull();
  });

  it('gives every message of one combo the same id, and other combos other ids', () => {
    const id = (data: Record<string, unknown>, eventId: string) =>
      messageFromEvent(giftEvent(data, eventId), 1)!.id;
    expect(id({ groupId: 'grp' }, 'm1')).toBe(id({ groupId: 'grp' }, 'm2'));
    expect(id({ groupId: 'grp' }, 'm1')).not.toBe(id({ groupId: 'other' }, 'm1'));
    expect(id({ groupId: 'grp' }, 'm1')).not.toBe(id({ groupId: 'grp', giftId: 'g2' }, 'm1'));
  });

  it('uses the event id when there is no groupId, so nothing merges', () => {
    expect(messageFromEvent(giftEvent({}, 'm1'), 1)!.id).toBe('m1');
    expect(messageFromEvent(giftEvent({}, 'm2'), 1)!.id).toBe('m2');
  });

  it('names an unnamed gift 礼物', () => {
    expect(messageFromEvent(giftEvent({ giftName: '' }), 1)!.gift!.name).toBe('礼物');
  });

  it('counts a combo once with GiftCounter: progress adds, the closing copy adds nothing', () => {
    const gifts = new GiftCounter();
    const combo = [
      giftEvent({ groupId: 'grp', repeatCount: 1 }, 'm1'),
      giftEvent({ groupId: 'grp', repeatCount: 5 }, 'm2'),
      giftEvent({ groupId: 'grp', repeatCount: 5, repeatEnd: true }, 'm3'),
    ];
    const counts = combo.map((ev) => messageFromEvent(ev, gifts.add(ev))?.gift?.count ?? null);
    expect(counts).toEqual([1, 4, null]);
  });
});

describe('likes', () => {
  const like = (data: Record<string, unknown>): DyhubEvent => ({
    id: 'l1',
    roomId: 'r1',
    type: 'like',
    ts: 300,
    user: dyhubUser,
    data,
  });

  it("makes one card from a run's last event and total", () => {
    expect(likeMessage(like({ count: 2 }), 37)).toEqual({
      id: 'like-l1',
      user: {
        id: 'u1',
        nickname: '奶茶不加糖',
        avatarUrl: 'https://example.com/a.png',
        fansClub: { name: '弹幕墙', level: 12 },
      },
      text: '',
      likes: 37,
      ts: 300,
    });
  });

  it('makes no card without a user', () => {
    expect(likeMessage({ ...like({}), user: undefined }, 3)).toBeNull();
  });
});
