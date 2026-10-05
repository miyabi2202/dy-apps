import { createStore } from '@dy-apps/services';

export const BORDER_STYLES = ['aurora', 'neon', 'gradient', 'ribbon', 'dashed', 'none'] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const BORDER_LABELS: Record<BorderStyle, string> = {
  aurora: '流光',
  neon: '霓虹',
  gradient: '渐变',
  ribbon: '丝带',
  dashed: '虚线',
  none: '无边框',
};

export interface FontPreset {
  label: string;
  family: string;
}

const CJK_FALLBACK = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif";

/** Local fonts only: nothing is fetched, so it works offline and in mainland China. */
export const FONT_PRESETS = {
  sans: { label: '黑体', family: CJK_FALLBACK },
  rounded: {
    label: '圆体',
    family: `'Yuanti SC', 'YouYuan', 'Varela Round', ${CJK_FALLBACK}`,
  },
  serif: { label: '宋体', family: "'Songti SC', 'SimSun', 'Noto Serif SC', serif" },
  kai: { label: '楷体', family: "'Kaiti SC', 'STKaiti', 'KaiTi', serif" },
} satisfies Record<string, FontPreset>;

export type FontKey = keyof typeof FONT_PRESETS | 'custom';

const FONT_KEYS = [
  ...(Object.keys(FONT_PRESETS) as (keyof typeof FONT_PRESETS)[]),
  'custom',
] as const;

/** The CSS font-family stack for the chosen font. */
export function fontFamily(s: Settings): string {
  if (s.font !== 'custom') return FONT_PRESETS[s.font].family;
  const name = s.customFont.replace(/["\\]/g, '').trim();
  return name ? `"${name}", ${CJK_FALLBACK}` : CJK_FALLBACK;
}

export interface Settings {
  border: BorderStyle;
  font: FontKey;
  /** Any installed font name, used when `font` is 'custom'. */
  customFont: string;
  /** Border hue when not colouring per user. */
  hue: number;
  perUser: boolean;
  borderWidth: number;
  radius: number;
  /** Card fill opacity, 0–100. */
  opacity: number;
  fontSize: number;
}

type NumericKey = 'hue' | 'borderWidth' | 'radius' | 'opacity' | 'fontSize';

/** Slider bounds, also used to clamp values read from the URL. */
export const RANGES: Record<NumericKey, readonly [min: number, max: number]> = {
  hue: [0, 359],
  borderWidth: [1, 6],
  radius: [0, 24],
  opacity: [0, 100],
  fontSize: [12, 32],
};

export const DEFAULT_SETTINGS: Settings = {
  border: 'aurora',
  font: 'sans',
  customFont: '',
  hue: 280,
  perUser: true,
  borderWidth: 2,
  radius: 14,
  opacity: 55,
  fontSize: 16,
};

/** URL parameter for each setting, so an OBS browser source gets the same look. */
const PARAMS = {
  border: 'border',
  font: 'font',
  customFont: 'customFont',
  hue: 'hue',
  perUser: 'perUser',
  borderWidth: 'bw',
  radius: 'radius',
  opacity: 'opacity',
  fontSize: 'size',
} as const satisfies Record<keyof Settings, string>;

/** Reads settings from a query string; anything missing or invalid comes from `base`. */
export function readSettings(search: string, base: Settings = DEFAULT_SETTINGS): Settings {
  const q = new URLSearchParams(search);
  const num = (key: NumericKey) => {
    const raw = q.get(PARAMS[key]);
    // Number('') is 0, so an empty `?size=` must count as missing, not as the minimum.
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
    const [min, max] = RANGES[key];
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : base[key];
  };
  const border = q.get(PARAMS.border);
  const font = q.get(PARAMS.font);
  const perUser = q.get(PARAMS.perUser);
  return {
    border: BORDER_STYLES.find((b) => b === border) ?? base.border,
    font: FONT_KEYS.find((f) => f === font) ?? base.font,
    customFont: q.get(PARAMS.customFont) ?? base.customFont,
    hue: num('hue'),
    perUser: perUser === null ? base.perUser : perUser === '1',
    borderWidth: num('borderWidth'),
    radius: num('radius'),
    opacity: num('opacity'),
    fontSize: num('fontSize'),
  };
}

export function settingsToParams(s: Settings): URLSearchParams {
  const params = new URLSearchParams({
    [PARAMS.border]: s.border,
    [PARAMS.font]: s.font,
    [PARAMS.hue]: String(s.hue),
    [PARAMS.perUser]: s.perUser ? '1' : '0',
    [PARAMS.borderWidth]: String(s.borderWidth),
    [PARAMS.radius]: String(s.radius),
    [PARAMS.opacity]: String(s.opacity),
    [PARAMS.fontSize]: String(s.fontSize),
  });
  if (s.font === 'custom') params.set(PARAMS.customFont, s.customFont);
  return params;
}

/** Saved as the same query string as the OBS link, so `readSettings` validates it on load. */
const settingsStore = createStore('danmaku.settings', {
  fallback: '',
  parse: (raw) => (typeof raw === 'string' ? raw : undefined),
});

/** URL parameters win over the saved settings, which win over the defaults. */
export function loadSettings(search: string): Settings {
  return readSettings(search, readSettings(settingsStore.read()));
}

export function saveSettings(s: Settings): void {
  settingsStore.write(settingsToParams(s).toString());
}
