import { busFeature } from '../../src/app/feature';
import { EventBus } from '../../src/app/event-bus';
import { silentLog } from '../support/fakes';

test('a bus feature listens from start() to stop(), and making it subscribes no one', () => {
  const bus = new EventBus(silentLog);
  const heard: string[] = [];
  const feature = busFeature('test', bus, {
    heard: (line) => void heard.push(line.text),
    answered: ({ userId }) => void heard.push(`answered ${userId}`),
  });
  const line = { start: 0, end: 1, text: '一', speech: 0.9 };
  bus.emit('heard', line);
  expect(heard).toEqual([]);

  feature.start();
  feature.start(); // a second start doesn't subscribe twice
  bus.emit('heard', line);
  bus.emit('answered', { userId: 'u-1' });
  expect(heard).toEqual(['一', 'answered u-1']);

  feature.stop();
  bus.emit('heard', line);
  expect(heard).toHaveLength(2);

  feature.start();
  bus.emit('heard', line);
  expect(heard).toHaveLength(3);
});
