import { CONFIG } from '../core/config';
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

  it('sends a chat line to the piece while viewers steer it', () => {
    const { engine, events } = room({ curses: { active: ['possess'] } });
    const x = engine.active!.x;
    expect(events.comment(mei, CONFIG.viewerCommands.left)).toBe(true);
    expect(engine.active!.x).toBe(x - 1);
  });

  it('ignores other chat, and sends likes to the meter', () => {
    const { engine, events } = room();
    expect(events.comment(mei, '主播加油')).toBe(false);
    expect(events.like(mei, 10)).toBe(true);
    expect(engine.likeMeter.likes).toBe(10);
  });
});
