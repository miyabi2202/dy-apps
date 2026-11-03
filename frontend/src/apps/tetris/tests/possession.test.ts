import { CONFIG } from '../core/config';
import { parsePossess, Possession } from '../core/room/possession';

const a = { id: 'a', name: '阿杰' };
const b = { id: 'b', name: '小鱼' };
const { programMs, stepMs, perChat, maxSteps } = CONFIG.possess;

describe('parsePossess', () => {
  it('reads one command per character, through spaces and punctuation', () => {
    expect(parsePossess('左右左右')).toEqual(['left', 'right', 'left', 'right']);
    expect(parsePossess(' 转，左！')).toEqual(['rotate', 'left']);
  });

  it('ignores any chat that is more than commands', () => {
    expect(parsePossess('左边那个好看')).toBeNull();
    expect(parsePossess('！！')).toBeNull();
    expect(parsePossess('')).toBeNull();
  });
});

describe('Possession', () => {
  it('queues chat in arrival order, up to perChat a chat and maxSteps in all', () => {
    const p = new Possession(a);
    expect(p.add(a, '左右')).toBe(true);
    expect(p.add(b, '转')).toBe(true);
    expect(p.add(b, '加油')).toBe(false);
    expect(p.view.steps.map((s) => [s.command, s.sender.name])).toEqual([
      ['left', '阿杰'],
      ['right', '阿杰'],
      ['rotate', '小鱼'],
    ]);
    p.add(a, '左'.repeat(perChat + 5));
    expect(p.view.steps).toHaveLength(3 + perChat);
    while (p.add(b, '右'.repeat(perChat))) {
      /* fill it up */
    }
    expect(p.view.steps).toHaveLength(maxSteps);
  });

  it('counts down, then plays a step every stepMs, then soft-drops a row every repeat', () => {
    const dropMs = CONFIG.input.softDropRepeatMs;
    const p = new Possession(a);
    p.add(a, '左右转');
    expect(p.countdown(programMs - 1)).toEqual({ changed: true, over: false });
    expect(p.countdown(1)).toEqual({ changed: true, over: true });
    expect(p.view.stage).toBe('play');
    expect(p.add(b, '左')).toBe(false);
    expect(p.play(stepMs - 1)).toEqual({ commands: [], drops: 0, changed: false });
    expect(p.play(1)).toMatchObject({ commands: ['left'], drops: 0 });
    expect(p.play(stepMs)).toMatchObject({ commands: ['right'], drops: 0 });
    // The last command, and the drop starts from there.
    expect(p.play(stepMs + dropMs * 2)).toEqual({ commands: ['rotate'], drops: 2, changed: true });
    expect(p.view).toMatchObject({ stage: 'drop', played: 3 });
    expect(p.play(dropMs).drops).toBe(1);
  });

  it('with nothing queued, goes straight to the drop', () => {
    const p = new Possession(null);
    p.countdown(programMs);
    expect(p.view.stage).toBe('drop');
    expect(p.play(CONFIG.input.softDropRepeatMs).drops).toBe(1);
  });
});
