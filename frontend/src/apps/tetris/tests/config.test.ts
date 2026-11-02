import { CONFIG } from '../core/config';
import { configToParams, readConfig, saveConfig, type TetrisConfig } from '../config';

beforeEach(() => localStorage.clear());

const live: TetrisConfig = {
  port: '8757',
  roomId: '123',
  probability: 0.07,
  demo: { source: 'live', intervalMs: 10_000, random: true },
};

describe('readConfig', () => {
  it('round-trips a config, chance included, through the OBS link and what was saved', () => {
    saveConfig(live);
    expect(readConfig('')).toEqual(live);
    expect(readConfig(`?${configToParams(live).toString()}`)).toEqual(live);
  });

  it('clamps the chance to whole percents from 1% to 100%, ignoring non-numbers', () => {
    const fallback = CONFIG.gifts.defaultProbability;
    expect(readConfig('?chance=abc').probability).toBe(fallback);
    expect(readConfig('?chance=').probability).toBe(fallback);
    expect(readConfig('?chance=0').probability).toBe(0.01);
    expect(readConfig('?chance=250').probability).toBe(1);
    expect(readConfig('?chance=33.4').probability).toBe(0.33);
  });
});
