import { pinyin } from 'pinyin-pro';

/** Sounds people (and the recognizer) mix up, merged: zh/z, ch/c, sh/s, n/l, -ng/-n. */
function normalize(syllable: string): string {
  return syllable
    .replace(/^([zcs])h/, '$1')
    .replace(/^l/, 'n')
    .replace(/ng$/, 'n')
    .replace(/^([jqxy])u/, '$1v');
}

const INITIAL = /^([zcs]h?|[bpmfdtnlgkhjqxryw])?(.*)$/;

/** Close enough to be the recognizer's mistake: the same start (initial) or the same end (final). */
function near(a: string, b: string): boolean {
  const [, initialA = '', finalA] = INITIAL.exec(a) ?? [];
  const [, initialB = '', finalB] = INITIAL.exec(b) ?? [];
  return (initialA !== '' && initialA === initialB) || finalA === finalB;
}

/** `text`'s Chinese as toneless pinyin syllables, with mixed-up sounds merged; the rest dropped. */
export function syllables(text: string): string[] {
  if (!text) return [];
  return pinyin(text, { toneType: 'none', type: 'array', nonZh: 'removed', v: true }).map(
    normalize,
  );
}

/**
 * Whether `text` contains something that sounds like `phrase` (as `syllables`), ignoring tones,
 * punctuation and sounds people mix up, so the recognizer writing 我想吃余了 for 我想吃鱼了 still
 * counts. A phrase of 4 syllables or more may also have one syllable heard as a near one (我想吃鱼啦),
 * but not as another word (我想吃饭了).
 */
export function soundsLike(text: string, phrase: readonly string[]): boolean {
  if (phrase.length === 0) return false;
  const heard = syllables(text);
  const allowed = phrase.length >= 4 ? 1 : 0;
  for (let start = 0; start + phrase.length <= heard.length; start++) {
    let off = 0;
    for (let i = 0; i < phrase.length && off <= allowed; i++) {
      const [syllable, wanted] = [heard[start + i] ?? '', phrase[i] ?? ''];
      if (syllable === wanted) continue;
      off += near(syllable, wanted) ? 1 : Infinity;
    }
    if (off <= allowed) return true;
  }
  return false;
}
