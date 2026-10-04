import {
  DEFAULT_SETTINGS,
  fontFamily,
  loadSettings,
  readSettings,
  saveSettings,
  settingsToParams,
  type Settings,
} from '../../src/settings';

const STORAGE_KEY = 'dy-apps:danmaku.settings';

beforeEach(() => localStorage.clear());

describe('readSettings', () => {
  it('returns the defaults for an empty query', () => {
    expect(readSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('reads every parameter', () => {
    const s = readSettings(
      '?border=neon&font=kai&hue=120&perUser=0&bw=4&radius=6&opacity=80&size=24',
    );
    expect(s).toEqual<Settings>({
      border: 'neon',
      font: 'kai',
      customFont: '',
      hue: 120,
      perUser: false,
      borderWidth: 4,
      radius: 6,
      opacity: 80,
      fontSize: 24,
    });
  });

  it('clamps and rounds numbers to their slider ranges', () => {
    const s = readSettings('?hue=999&bw=0&radius=-5&opacity=50.6&size=100');
    expect(s).toMatchObject({ hue: 359, borderWidth: 1, radius: 0, opacity: 51, fontSize: 32 });
  });

  it('falls back for the removed Google Fonts presets in old links', () => {
    expect(readSettings('?font=kuaile').font).toBe(DEFAULT_SETTINGS.font);
  });

  it('falls back to the base for unknown or malformed values', () => {
    const base: Settings = { ...DEFAULT_SETTINGS, border: 'dashed', hue: 10, fontSize: 20 };
    const s = readSettings('?border=sparkles&font=comic&hue=abc&size=', base);
    expect(s.border).toBe('dashed');
    expect(s.font).toBe(base.font);
    expect(s.hue).toBe(10);
    expect(s.fontSize).toBe(20);
  });
});

describe('settingsToParams', () => {
  it('round-trips through readSettings', () => {
    const s: Settings = {
      border: 'ribbon',
      font: 'custom',
      customFont: 'LXGW WenKai',
      hue: 200,
      perUser: false,
      borderWidth: 3,
      radius: 20,
      opacity: 90,
      fontSize: 18,
    };
    expect(readSettings(settingsToParams(s).toString())).toEqual(s);
  });

  it('includes the custom font name only for the custom font', () => {
    const params = settingsToParams({ ...DEFAULT_SETTINGS, customFont: 'Leftover' });
    expect(params.has('customFont')).toBe(false);
  });
});

describe('fontFamily', () => {
  it('uses the preset stack', () => {
    expect(fontFamily({ ...DEFAULT_SETTINGS, font: 'rounded' })).toMatch(/^'Yuanti SC', /);
  });

  it('quotes a custom font, stripping characters that could break out of the quotes', () => {
    const family = fontFamily({ ...DEFAULT_SETTINGS, font: 'custom', customFont: ' My"Fo\\nt ' });
    expect(family).toMatch(/^"MyFont", /);
  });

  it('falls back to the default stack for an empty custom font', () => {
    const family = fontFamily({ ...DEFAULT_SETTINGS, font: 'custom', customFont: '  ' });
    expect(family).toBe(fontFamily({ ...DEFAULT_SETTINGS, font: 'sans' }));
  });
});

describe('loadSettings / saveSettings', () => {
  it('loads what was saved', () => {
    const saved: Settings = { ...DEFAULT_SETTINGS, border: 'neon', fontSize: 28 };
    saveSettings(saved);
    expect(loadSettings('')).toEqual(saved);
  });

  it('lets URL parameters override saved settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, border: 'neon', fontSize: 28 });
    const s = loadSettings('?border=dashed');
    expect(s.border).toBe('dashed');
    expect(s.fontSize).toBe(28);
  });

  it('ignores a corrupt saved value', () => {
    localStorage.setItem(STORAGE_KEY, '{"not":"a query string"}');
    expect(loadSettings('')).toEqual(DEFAULT_SETTINGS);
  });
});
