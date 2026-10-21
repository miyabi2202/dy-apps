import {
  createSourceStores,
  readSourceConfig,
  saveSourceConfig,
  setSourceParams,
  urlSource,
  type SourceConfig,
} from '..';

beforeEach(() => localStorage.clear());

const stores = createSourceStores('test', { source: 'fake', intervalMs: 1000 }, [500, 5000]);

const live: SourceConfig = {
  port: '8757',
  roomId: '123',
  demo: { source: 'live', intervalMs: 1000, random: true },
};

const params = (config: SourceConfig) => {
  const p = new URLSearchParams();
  setSourceParams(p, config);
  return p;
};

describe('readSourceConfig', () => {
  it('round-trips a live config through the OBS link', () => {
    expect(readSourceConfig(`?${params(live)}`, stores)).toEqual(live);
  });

  it('reads the fake interval from ?demo, clamped to the range', () => {
    expect(readSourceConfig('?demo=100', stores).demo).toEqual({
      source: 'fake',
      intervalMs: 500,
      random: true,
    });
    expect(readSourceConfig('?demo=99999', stores).demo.intervalMs).toBe(5000);
  });

  it('round-trips ?random=0, and leaves random out of the link when it is on', () => {
    const fixed = readSourceConfig('?demo=4000&random=0', stores);
    expect(fixed.demo).toEqual({ source: 'fake', intervalMs: 4000, random: false });
    expect(readSourceConfig(`?${params(fixed)}`, stores).demo).toEqual(fixed.demo);
    expect(params({ ...fixed, demo: { ...fixed.demo, random: true } }).has('random')).toBe(false);
  });

  it('prefers the URL room over ?demo, and either over what was saved', () => {
    saveSourceConfig(stores, { ...live, demo: { source: 'live', intervalMs: 2000 } });
    expect(readSourceConfig('?demo=900&port=8757&room=456', stores)).toMatchObject({
      roomId: '456',
      demo: { source: 'live', intervalMs: 900 },
    });
    expect(readSourceConfig('?demo=900', stores)).toMatchObject({
      roomId: '123',
      demo: { source: 'fake', intervalMs: 900 },
    });
  });

  it('falls back to what was saved, without saving random', () => {
    saveSourceConfig(stores, {
      ...live,
      demo: { source: 'live', intervalMs: 2000, random: false },
    });
    expect(readSourceConfig('', stores)).toEqual({
      ...live,
      demo: { source: 'live', intervalMs: 2000, random: true },
    });
  });

  it('falls back to the defaults when nothing was saved', () => {
    expect(readSourceConfig('', stores)).toEqual({
      port: '',
      roomId: '',
      demo: { source: 'fake', intervalMs: 1000, random: true },
    });
  });
});

describe('urlSource', () => {
  it('is live for a room, fake for an interval, and null for neither', () => {
    expect(urlSource('?port=8757&room=123')).toBe('live');
    expect(urlSource('?demo=900')).toBe('fake');
    expect(urlSource('?obs=1')).toBeNull();
  });
});

describe('setSourceParams', () => {
  it('leaves the room out of a fake config, and a live config without a valid room', () => {
    const fake = params({ ...live, demo: { source: 'fake', intervalMs: 4000 } });
    expect(fake.get('demo')).toBe('4000');
    expect(fake.has('room')).toBe(false);
    const noRoom = params({ ...live, roomId: 'abc' });
    expect(noRoom.has('room')).toBe(false);
    expect(noRoom.has('demo')).toBe(false);
  });
});
