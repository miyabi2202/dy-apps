import { syllables } from './sounds-like';

/** A name the bot is called by: its nickname, or one of the room's aliases (room_config.json). */
export interface Alias {
  /** The name as people type it (`Fairy`, `菲瑞`). */
  name: string;
  /** How speech recognition writes it besides (`ferry`): only the streamer's speech matches these. */
  heardAs: readonly string[];
}

/**
 * Which name of `aliases` a chat contains, as it's written (Latin letters in any case); undefined
 * for none.
 */
export function matchChat(text: string, aliases: readonly Alias[]): string | undefined {
  const lower = text.toLowerCase();
  return aliases.find(({ name }) => contains(lower, name))?.name;
}

/**
 * Which name of `aliases` the streamer said, as speech recognition wrote it: the name or one of
 * its `heardAs`, Latin letters in any case, Chinese by its pinyin (默认关壁 for 默认关闭, with the
 * sounds people mix up merged, see syllables); undefined for none.
 */
export function matchSpeech(text: string, aliases: readonly Alias[]): string | undefined {
  const lower = text.toLowerCase();
  const sounds = syllables(text).join(' ');
  return aliases.find(({ name, heardAs }) =>
    [name, ...heardAs].some((form) => contains(lower, form) || soundsIn(sounds, form)),
  )?.name;
}

function contains(lower: string, form: string): boolean {
  const name = form.trim().toLowerCase();
  return name !== '' && lower.includes(name);
}

/** Whether `form`, all Chinese, is among `sounds` (the text's syllables, space-separated). */
function soundsIn(sounds: string, form: string): boolean {
  const name = form.trim();
  if (!/^\p{Script=Han}+$/u.test(name)) return false;
  return ` ${sounds} `.includes(` ${syllables(name).join(' ')} `);
}
