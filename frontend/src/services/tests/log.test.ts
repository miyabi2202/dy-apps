import { LOG_LEVEL, Logger, type LogSink } from '..';

function recorder() {
  const lines: string[] = [];
  const sink: LogSink = {
    debug: (m: string) => void lines.push(`debug ${m}`),
    info: (m: string) => void lines.push(`info ${m}`),
    warn: (m: string) => void lines.push(`warn ${m}`),
    error: (m: string) => void lines.push(`error ${m}`),
  };
  return { lines, sink };
}

function logEach(log: Logger) {
  log.debug('a');
  log.info('b');
  log.warn('c');
  log.error('d');
}

test('logs at its level and above, tagged, to the matching console method', () => {
  const { lines, sink } = recorder();
  logEach(new Logger('gl', { level: 'info', sink }));
  expect(lines).toEqual(['info [gl] b', 'warn [gl] c', 'error [gl] d']);
});

test('debug logs everything and silent nothing', () => {
  const all = recorder();
  logEach(new Logger('x', { level: 'debug', sink: all.sink }));
  expect(all.lines).toHaveLength(4);

  const none = recorder();
  logEach(new Logger('x', { level: 'silent', sink: none.sink }));
  expect(none.lines).toEqual([]);
});

test('is silent by default where nothing defines the level (Jest)', () => {
  expect(LOG_LEVEL).toBe('silent');
  const { lines, sink } = recorder();
  logEach(new Logger('x', { sink }));
  expect(lines).toEqual([]);
});
