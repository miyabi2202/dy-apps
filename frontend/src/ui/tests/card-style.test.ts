import {
  cardStyleToParams,
  DEFAULT_CARD_STYLE,
  fontFamily,
  readCardStyle,
  type CardStyle,
} from '../card-style';

describe('readCardStyle', () => {
  it('returns the defaults for an empty query', () => {
    expect(readCardStyle('')).toEqual(DEFAULT_CARD_STYLE);
  });

  it('reads every parameter', () => {
    const s = readCardStyle(
      '?border=neon&font=kai&hue=120&perUser=0&bw=4&radius=6&opacity=80&size=24',
    );
    expect(s).toEqual<CardStyle>({
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
    const s = readCardStyle('?hue=999&bw=0&radius=-5&opacity=50.6&size=100');
    expect(s).toMatchObject({ hue: 359, borderWidth: 1, radius: 0, opacity: 51, fontSize: 32 });
  });

  it('falls back to the base for unknown or malformed values', () => {
    const base: CardStyle = { ...DEFAULT_CARD_STYLE, border: 'dashed', hue: 10, fontSize: 20 };
    const s = readCardStyle('?border=sparkles&font=comic&hue=abc&size=', base);
    expect(s.border).toBe('dashed');
    expect(s.font).toBe(base.font);
    expect(s.hue).toBe(10);
    expect(s.fontSize).toBe(20);
  });
});

describe('cardStyleToParams', () => {
  it('round-trips through readCardStyle', () => {
    const s: CardStyle = {
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
    expect(readCardStyle(cardStyleToParams(s).toString())).toEqual(s);
  });

  it('includes the custom font name only for the custom font', () => {
    const params = cardStyleToParams({ ...DEFAULT_CARD_STYLE, customFont: 'Leftover' });
    expect(params.has('customFont')).toBe(false);
  });
});

describe('fontFamily', () => {
  it('quotes a custom font, stripping characters that could break out of the quotes', () => {
    const family = fontFamily({ ...DEFAULT_CARD_STYLE, font: 'custom', customFont: ' My"Fo\\nt ' });
    expect(family).toMatch(/^"MyFont", /);
  });

  it('falls back to the default stack for an empty custom font', () => {
    const family = fontFamily({ ...DEFAULT_CARD_STYLE, font: 'custom', customFont: '  ' });
    expect(family).toBe(fontFamily({ ...DEFAULT_CARD_STYLE, font: 'sans' }));
  });
});
