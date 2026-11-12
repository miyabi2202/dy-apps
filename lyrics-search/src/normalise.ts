import { Converter } from 'opencc-js';

/** Made once: building a converter loads OpenCC's character tables. */
const toSimplified = Converter({ from: 't', to: 'cn' });

/** Traditional characters to simplified ones, so 周杰倫 and 周杰伦 are the same name. */
export function fold(text: string): string {
  return toSimplified(text);
}

/** What a sung line is searched as: letters, digits and apostrophes, with spaces only between Latin words. */
export function cleanLine(line: string): string {
  return line
    .replace(/[^\p{L}\p{N}\p{M}\s']/gu, ' ')
    .replace(/(?<=[^\p{ASCII}])\s+|\s+(?=[^\p{ASCII}])/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Innermost first, so a bracket inside another (「千古(电视剧《花千骨》片头曲)」) goes with it.
const BRACKETED = /[（([【「《][^（([【「《）)\]】」》]*[）)\]】」》]/g;
const WAVED = /[～~](.*?)[～~]/g;
// A waved part that names a version (「～Yui final ver.～」) goes; one that doesn't is the song's own
// subtitle and stays: 「永遠語り～風ノ歌～」 and 「永遠語り～光ノ歌～」 are two songs.
const VERSION_NOTE =
  /ver\b|version|edit|mix|size|live|acoustic|inst|karaoke|off vocal|cover|remaster|demo|版/i;
const UNCLOSED = /[（([【].*$/;
const DASHED = /\s*[-–—].*$/;
const VERSION =
  /(深情|女声|男声|独唱|合唱|翻唱|伴奏|吉他|钢琴|完整|正式|抖音|dj|加速|降调|升调|live)*版$/i;
const VERSION_WORDS = /(?<![\p{L}\p{N}_])(live|dj|remix|cover|mp3)(?![\p{L}\p{N}_])/giu;

/** A title as a person reads it: without "(TV Size)", "～Yui final ver.～", " - DJ版" or a 版 suffix. */
export function displayTitle(title: string): string {
  let bare = title;
  for (let last = ''; bare !== last;) [last, bare] = [bare, bare.replace(BRACKETED, '')];
  return bare
    .replace(WAVED, (waved, inside: string) => (VERSION_NOTE.test(inside) ? '' : waved))
    .replace(UNCLOSED, '')
    .replace(DASHED, '')
    .trim()
    .replace(VERSION, '')
    .trim();
}

/**
 * The key for "the same song": NetEase and Codex spell it differently, so titles are compared
 * without versions, punctuation, case or traditional forms. Also the bot's key for songs it named.
 * Empty when nothing is left: such a title names nothing.
 */
export function normaliseTitle(title: string): string {
  const bare = displayTitle(title.normalize('NFKC')).replace(VERSION_WORDS, '');
  return fold(bare.replace(/[^\p{L}\p{N}]/gu, '')).toLowerCase();
}

/** A credit (one or several singers) as a key: 中島美嘉 and 中岛美嘉, 大塚 愛 and 大塚爱 are one singer. */
export function foldArtist(credit: string): string {
  return fold(credit.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '')).toLowerCase();
}
