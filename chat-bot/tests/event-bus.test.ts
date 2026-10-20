import { EventBus } from '../src/app/event-bus';
import type { Log } from '../src/app/ports';

function setup() {
  const errors: unknown[][] = [];
  const log: Log = {
    debug() {},
    info() {},
    warn() {},
    error: (...args: unknown[]) => void errors.push(args),
  };
  return { bus: new EventBus(log), errors };
}

test('tells each subscriber of an event, in the order they subscribed, and only that event', () => {
  const { bus } = setup();
  const told: string[] = [];
  bus.on('gift', ({ nickname }) => told.push(`一 ${nickname}`));
  bus.on('answered', ({ userId }) => told.push(`别的 ${userId}`));
  bus.on('gift', ({ nickname }) => told.push(`二 ${nickname}`));

  bus.emit('gift', { userId: 'u1', nickname: '阿明', name: '玫瑰', count: 1, diamonds: 1 });
  expect(told).toEqual(['一 阿明', '二 阿明']);
});

test('logs a subscriber that throws, and still tells the others', () => {
  const { bus, errors } = setup();
  const told: string[] = [];
  bus.on('answered', () => {
    throw new Error('boom');
  });
  bus.on('answered', ({ userId }) => told.push(userId));

  bus.emit('answered', { userId: 'u1' });
  expect(told).toEqual(['u1']);
  expect(errors).toEqual([['event handler failed', { event: 'answered', error: 'boom' }]]);
});

test('stops telling a subscriber that unsubscribed, and a subscriber added meanwhile hears the next one', () => {
  const { bus } = setup();
  const told: string[] = [];
  const stop = bus.on('answered', ({ userId }) => {
    told.push(`first ${userId}`);
    bus.on('answered', ({ userId: id }) => told.push(`late ${id}`));
  });
  bus.emit('answered', { userId: 'u1' });
  stop();
  bus.emit('answered', { userId: 'u2' });

  expect(told).toEqual(['first u1', 'late u2']);
});
