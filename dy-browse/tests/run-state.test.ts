import { jsonStateStore } from '../src/app/json-state-store';
import { RunState } from '../src/core/run-state';
import { MemoryStore } from './support/memory-store';

describe('RunState', () => {
  it('saves each stage and what it produced on every change', () => {
    const data = new MemoryStore();
    const state = new RunState(jsonStateStore(data), '2026-11-02');
    state.advance('v1', 'found');
    state.advance('v1', 'transcribed', { transcript: ['你好'] });
    expect(JSON.parse(data.read('state/2026-11-02.json')!)).toEqual({
      v1: { stage: 'transcribed', transcript: ['你好'] },
    });
  });

  it('picks up where an earlier run stopped, and never goes backwards', () => {
    const data = new MemoryStore();
    const first = new RunState(jsonStateStore(data), '2026-11-02');
    first.advance('v1', 'ocr', { ocr: ['字幕'] });
    const second = new RunState(jsonStateStore(data), '2026-11-02');
    expect(second.reached('v1', 'transcribed')).toBe(true);
    expect(second.reached('v1', 'done')).toBe(false);
    second.advance('v1', 'metadata');
    expect(second.get('v1')).toEqual({ stage: 'ocr', ocr: ['字幕'] });
    expect(second.get('nope')).toBeNull();
  });

  it('keeps a day apart from the next', () => {
    const data = new MemoryStore();
    new RunState(jsonStateStore(data), '2026-11-02').advance('v1', 'done');
    expect(new RunState(jsonStateStore(data), '2026-11-03').get('v1')).toBeNull();
  });
});
