import { Logger, type DanmakuMessage, type LogSink } from '@dy-apps/services';
import { createMessageLogger } from '../message-log';

const chat = (i: number): DanmakuMessage => ({
  id: `m${i}`,
  user: { id: 'u', nickname: '小明' },
  text: `hello ${i}`,
  ts: 0,
});

function setup() {
  const lines: string[] = [];
  const sink = { debug: (m: string) => lines.push(m) } as unknown as LogSink;
  let t = 0;
  const logMessage = createMessageLogger(new Logger('t', { level: 'debug', sink }), () => t);
  return { lines, logMessage, advance: (ms: number) => (t += ms) };
}

describe('createMessageLogger', () => {
  it('logs the first messages of a second, then summarises the rest in the next window', () => {
    const { lines, logMessage, advance } = setup();
    for (let i = 0; i < 100; i++) logMessage(chat(i));
    expect(lines).toHaveLength(8);
    advance(1000);
    logMessage(chat(100));
    expect(lines[8]).toContain('+92 more');
    expect(lines).toHaveLength(10);
  });
});
