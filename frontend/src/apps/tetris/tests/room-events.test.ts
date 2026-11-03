import { GameEngine } from '../core/game';
import { constantRng } from '../core/random';
import { GiftFeed } from '../gift-feed';
import { RoomEvents } from '../room-events';
import { forceEffectRng } from './helpers';

const mei = { id: 'm', name: '小美' };

function room(options: ConstructorParameters<typeof GameEngine>[0] = {}) {
  const engine = new GameEngine({ seed: 1, ...options });
  engine.start();
  return { engine, events: new RoomEvents(engine, new GiftFeed(engine)) };
}

describe('RoomEvents', () => {
  it('sends a chat line to an open vote', () => {
    const { engine, events } = room({
      giftRng: forceEffectRng('garbage'),
      voteRng: constantRng(0),
    });
    engine.sendGifts('阿杰', 1);
    expect(events.comment(mei, '我选2！')).toBe(true);
    expect(engine.vote!.ballots).toEqual([{ voter: mei, choice: 1 }]);
  });

  it('sends 左/右/转 chat to 夺舍 while it takes moves', () => {
    const { engine, events } = room();
    expect(events.comment(mei, '左右')).toBe(false);
    engine.addCurse('possess');
    for (let i = 0; i < 5; i += 1) {
      engine.board = engine.board.map((row) => row.map(() => null));
      engine.hardDrop();
    }
    expect(events.comment(mei, '左右')).toBe(true);
    expect(engine.possession!.steps).toHaveLength(2);
  });

  it('ignores other chat, and sends likes to the meter', () => {
    const { engine, events } = room();
    expect(events.comment(mei, '主播加油')).toBe(false);
    expect(events.like(mei, 10)).toBe(true);
    expect(engine.likeMeter.likes).toBe(10);
  });
});
