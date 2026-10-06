import type { DanmakuMessage } from '@dy-apps/services';
import { CONFIG } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { constantRng } from '../../src/core/random';
import { GiftFeed } from '../../src/gift-feed';
import { forceEffectRng } from '../helpers';

const gift = (id: string, count: number, diamonds?: number): DanmakuMessage => ({
  id,
  user: { id: 'u1', nickname: '阿杰' },
  text: '',
  gift: { name: '玫瑰', count, diamonds },
  ts: 0,
});

function started(giftRng = constantRng(0)) {
  const engine = new GameEngine({ seed: 1, giftRng });
  engine.start();
  return { engine, feed: new GiftFeed(engine) };
}

describe('GiftFeed', () => {
  it('draws once per diamond, credited to the viewer', () => {
    const { engine, feed } = started();
    const res = feed.send(gift('g1', 3, 10));
    expect(res.ok && res.result.count).toBe(30);
    expect(engine.giftHistory[0]?.sender).toBe('阿杰');
    expect(feed.getMessages()[0]?.detail).toBe('触发 垃圾行×30');
  });

  it('counts a gift without a price as 1 diamond', () => {
    const { engine, feed } = started();
    feed.send(gift('g1', 4));
    expect(engine.team.giftCount).toBe(4);
  });

  it('adds a combo to its card, with the curses of the whole combo', () => {
    const { feed } = started(forceEffectRng('fog'));
    feed.send(gift('combo', 1, 1));
    feed.send(gift('combo', 2, 1));
    const messages = feed.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]?.gift?.count).toBe(3);
    expect(messages[0]?.detail).toBe('触发 迷雾×3');
  });

  it('splits a gift worth more than one batch', () => {
    const { engine, feed } = started();
    const res = feed.send(gift('big', 3, CONFIG.gifts.maxBatch));
    expect(res.ok).toBe(true);
    expect(engine.team.giftCount).toBe(3 * CONFIG.gifts.maxBatch);
  });

  it('takes no gifts and makes no cards before the game starts or after it ends', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0) });
    const feed = new GiftFeed(engine);
    expect(feed.send(gift('early', 1, 1)).ok).toBe(false);
    engine.start();
    engine.phase = 'gameOver';
    expect(feed.send(gift('late', 1, 1)).ok).toBe(false);
    expect(feed.getMessages()).toHaveLength(0);
    expect(engine.team.giftCount).toBe(0);
  });

  it('tells subscribers about new cards and clears for a new game', () => {
    const { feed } = started();
    const listener = jest.fn();
    const unsubscribe = feed.subscribe(listener);
    feed.send(gift('g1', 1, 1));
    feed.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(feed.getMessages()).toHaveLength(0);
    unsubscribe();
    feed.send(gift('g2', 1, 1));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
