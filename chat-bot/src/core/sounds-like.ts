import { pinyin } from 'pinyin-pro';

/** Sounds people (and the recognizer) mix up, merged: zh/z, ch/c, sh/s, n/l, -ng/-n. */
function normalize(syllable: string): string {
  return syllable
    .replace(/^([zcs])h/, '$1')
    .replace(/^l/, 'n')
    .replace(/ng$/, 'n')
    .replace(/^([jqxy])u/, '$1v');
}

/** `text`'s Chinese as toneless pinyin syllables, with mixed-up sounds merged; the rest dropped. */
export function syllables(text: string): string[] {
  if (!text) return [];
  return pinyin(text, { toneType: 'none', type: 'array', nonZh: 'removed', v: true }).map(
    normalize,
  );
}
