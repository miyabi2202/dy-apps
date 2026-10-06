import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOUYIN_EMOJI } from '../douyin-emoji';
import { douyinEmojiUrl, splitEmoji } from '../emoji';

describe('douyinEmojiUrl', () => {
  it('serves a known code from /emoji/, and gives nothing for an unknown one', () => {
    expect(douyinEmojiUrl('[微笑]')).toBe('/emoji/smile.webp');
    // Codes that share an image share a file.
    expect(douyinEmojiUrl('[爱慕]')).toBe(douyinEmojiUrl('[色]'));
    expect(douyinEmojiUrl('[没有这个]')).toBeUndefined();
    expect(douyinEmojiUrl('微笑')).toBeUndefined();
  });

  it('has an image in public/emoji for every code, and no image without a code', () => {
    const files = new Set(readdirSync(join(__dirname, '../../../public/emoji')));
    const used = new Set(Object.values(DOUYIN_EMOJI));
    expect([...used].filter((file) => !files.has(file))).toEqual([]);
    expect([...files].filter((file) => !used.has(file))).toEqual([]);
  });
});

describe('splitEmoji', () => {
  it('leaves plain text whole', () => {
    expect(splitEmoji('主播晚上好～')).toEqual([{ text: '主播晚上好～' }]);
    expect(splitEmoji('')).toEqual([]);
  });

  it('turns known codes into images, each one, even side by side', () => {
    expect(splitEmoji('这波[鼓掌][鼓掌] 👍')).toEqual([
      { text: '这波' },
      { emoji: '[鼓掌]', url: '/emoji/clap.webp' },
      { emoji: '[鼓掌]', url: '/emoji/clap.webp' },
      { text: ' 👍' },
    ]);
  });

  it('keeps unknown codes and stray brackets as text, joined to the text around them', () => {
    expect(splitEmoji('a[没有这个]b[比心')).toEqual([{ text: 'a[没有这个]b[比心' }]);
    expect(splitEmoji('[]x')).toEqual([{ text: '[]x' }]);
  });

  it('looks codes up with the lookup it is given', () => {
    const lookup = (code: string) => (code === '[x]' ? '/x.png' : undefined);
    expect(splitEmoji('[微笑][x]', lookup)).toEqual([
      { text: '[微笑]' },
      { emoji: '[x]', url: '/x.png' },
    ]);
  });
});
