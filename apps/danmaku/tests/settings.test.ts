import { DEFAULT_CARD_STYLE, type CardStyle } from '@dy-apps/ui';
import { loadSettings, saveSettings } from '../src/settings';

const STORAGE_KEY = 'dy-apps:danmaku.settings';

beforeEach(() => localStorage.clear());

describe('loadSettings / saveSettings', () => {
  it('loads what was saved', () => {
    const saved: CardStyle = { ...DEFAULT_CARD_STYLE, border: 'neon', fontSize: 28 };
    saveSettings(saved);
    expect(loadSettings('')).toEqual(saved);
  });

  it('lets URL parameters override saved settings', () => {
    saveSettings({ ...DEFAULT_CARD_STYLE, border: 'neon', fontSize: 28 });
    const s = loadSettings('?border=dashed');
    expect(s.border).toBe('dashed');
    expect(s.fontSize).toBe(28);
  });

  it('ignores a corrupt saved value', () => {
    localStorage.setItem(STORAGE_KEY, '{"not":"a query string"}');
    expect(loadSettings('')).toEqual(DEFAULT_CARD_STYLE);
  });
});
