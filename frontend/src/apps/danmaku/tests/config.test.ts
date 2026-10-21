import { configToParams, readConfig, saveConfig, type DanmakuConfig } from '../config';

beforeEach(() => localStorage.clear());

const saved: DanmakuConfig = {
  port: '8757',
  roomId: '123',
  style: { ...readConfig('').style, fontSize: 30 },
  demo: { source: 'live', intervalMs: 2000 },
};

describe('readConfig', () => {
  it('falls back to what was saved', () => {
    saveConfig(saved);
    expect(readConfig('')).toEqual({ ...saved, demo: { ...saved.demo, random: true } });
  });

  it('takes the source from the URL room and the style from the URL over the saved style', () => {
    saveConfig(saved);
    const config = readConfig('?port=8757&room=456&size=20');
    expect(config.roomId).toBe('456');
    expect(config.demo.source).toBe('live');
    expect(config.style.fontSize).toBe(20);
  });
});

describe('configToParams', () => {
  it('carries the source only while the preview runs', () => {
    expect(configToParams(saved, false).has('room')).toBe(false);
    expect(configToParams(saved, true).get('room')).toBe('123');
    expect(configToParams(saved, false).get('obs')).toBe('1');
  });
});
