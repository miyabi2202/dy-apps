import { parseCliOptions } from '../src/cli-options';

const parse = (...args: string[]) =>
  parseCliOptions(['--room', '416362684969', '--bot-name', 'x', ...args], '/pkg');

test('the command line says which settings it gave, and the rest stay the room’s own', () => {
  expect(parse()?.given).toEqual({});
  expect(
    parse('--auto-reply-threshold', '0.66', '--malice-watch', '--auto-song-id')?.given,
  ).toEqual({
    autoReplyThreshold: 0.66,
    maliceWatch: true,
    autoSongId: true,
  });
  expect(parse('--no-malice-watch', '--auto-reply-interval', '0')?.given).toEqual({
    maliceWatch: false,
    autoReplyIntervalSeconds: 0,
  });
  // --max-parts seeds maxReplyParts, which then lives in room_config.json like the others.
  expect(parse('--max-parts', '2')?.given).toEqual({ maxReplyParts: 2 });
});

test('a setting given on the command line that is not a number, 0 or more, is refused', () => {
  expect(parse('--thanks-threshold', 'abc')).toBeNull();
  expect(parse('--auto-reply-threshold=-1')).toBeNull();
  expect(parse('--thanks-threshold', '2')?.given).toEqual({ thanksThreshold: 2 });
});
