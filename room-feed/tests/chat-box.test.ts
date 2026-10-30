import { ChatBox, type ChatSurface } from '../src/chat-box';
import { Pace } from '../src/pace';

/** A chat box holding `left` (what an earlier chat left), logging what it's asked, in order. */
function setup({
  left = '',
  noBox = false,
  keepsText = false,
}: { left?: string; noBox?: boolean; keepsText?: boolean } = {}) {
  const log: string[] = [];
  let text = left;
  const surface: ChatSurface = {
    waitForBox: () => {
      log.push('wait for box');
      return noBox ? Promise.reject(new Error('timeout')) : Promise.resolve();
    },
    clickBox: () => Promise.resolve(void log.push('click box')),
    text: () => Promise.resolve(text),
    selectAllAndDelete: () => {
      log.push('select all and delete');
      text = '';
      return Promise.resolve();
    },
    backspaceFromEnd: (times) => Promise.resolve(void log.push(`backspace ${times}`)),
    typeAndSend: (typed) => {
      log.push(`type ${typed} and send`);
      text = keepsText ? typed : '';
      return Promise.resolve();
    },
  };
  const shots: string[] = [];
  const box = new ChatBox(surface, {
    pace: new Pace({
      wait: (ms) => Promise.resolve(void log.push(`wait ${ms}`)),
      random: () => 0,
    }),
    screenshot: (name) => {
      shots.push(name);
      return Promise.resolve('/shots/chat-failed.png');
    },
  });
  return { box, log, shots };
}

describe('ChatBox', () => {
  it('waits for the box, pauses, clicks it; pauses, types the chat and sends it', async () => {
    const { box, log } = setup();
    await box.type('你好');
    expect(log).toEqual([
      'wait for box',
      'wait 500',
      'click box',
      'wait 500',
      'type 你好 and send',
      // Then it looks whether the box emptied.
      'wait 500',
    ]);
  });

  it('clears what an earlier chat left, after a pause of its own, before typing', async () => {
    const { box, log } = setup({ left: '旧的' });
    await box.type('新的');
    expect(log.slice(2)).toEqual([
      'click box',
      'wait 500',
      'select all and delete',
      'wait 500',
      'type 新的 and send',
      'wait 500',
    ]);
  });

  it('neither pauses nor clicks when the box never shows, and sends a picture with the error', async () => {
    const { box, log, shots } = setup({ noBox: true });
    await expect(box.type('你好')).rejects.toThrow('找不到弹幕输入框');
    expect(log).toEqual(['wait for box']);
    expect(shots).toEqual(['chat-failed']);
  });

  it('throws when the box is not empty after Enter, the chat maybe not sent', async () => {
    const { box } = setup({ keepsText: true });
    await expect(box.type('你好')).rejects.toThrow('回车后输入框没有清空');
  });
});
