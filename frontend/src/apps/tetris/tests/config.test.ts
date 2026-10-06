import { configToParams, readConfig, saveConfig, type TetrisConfig } from '../config';

beforeEach(() => localStorage.clear());

const live: TetrisConfig = {
  port: '8757',
  roomId: '123',
  probability: 0.07,
  demo: { source: 'live', intervalMs: 10_000, random: true },
};

describe('readConfig', () => {
  it('defaults to fake gifts every 10 s at 15%', () => {
    expect(readConfig('')).toEqual<TetrisConfig>({
      port: '',
      roomId: '',
      probability: 0.15,
      demo: { source: 'fake', intervalMs: 10_000, random: true },
    });
  });

  it('round-trips a live config through the OBS link', () => {
    expect(readConfig(`?${configToParams(live).toString()}`)).toEqual(live);
  });

  it('reads fake gifts and their interval from ?demo, clamped to 2–30 s', () => {
    expect(readConfig('?demo=500').demo).toEqual({
      source: 'fake',
      intervalMs: 2000,
      random: true,
    });
    expect(readConfig('?demo=99999').demo.intervalMs).toBe(30_000);
  });

  it('round-trips ?random=0, which fake gifts keep in the OBS link', () => {
    const fixed = readConfig('?demo=4000&random=0');
    expect(fixed.demo).toEqual({ source: 'fake', intervalMs: 4000, random: false });
    expect(readConfig(`?${configToParams(fixed).toString()}`).demo).toEqual(fixed.demo);
    expect(configToParams({ ...fixed, demo: { ...fixed.demo, random: true } }).has('random')).toBe(
      false,
    );
  });

  it('clamps the chance to whole percents from 1% to 100%, ignoring non-numbers', () => {
    expect(readConfig('?chance=abc').probability).toBe(0.15);
    expect(readConfig('?chance=').probability).toBe(0.15);
    expect(readConfig('?chance=0').probability).toBe(0.01);
    expect(readConfig('?chance=250').probability).toBe(1);
    expect(readConfig('?chance=33.4').probability).toBe(0.33);
  });

  it('falls back to what was saved', () => {
    saveConfig(live);
    expect(readConfig('')).toEqual(live);
  });
});

describe('configToParams', () => {
  it('leaves the room out of a fake config, and a live config without a valid room', () => {
    const fake = configToParams({ ...live, demo: { source: 'fake', intervalMs: 4000 } });
    expect(fake.get('demo')).toBe('4000');
    expect(fake.has('room')).toBe(false);
    const noRoom = configToParams({ ...live, roomId: 'abc' });
    expect(noRoom.has('room')).toBe(false);
    expect(noRoom.has('demo')).toBe(false);
  });
});
