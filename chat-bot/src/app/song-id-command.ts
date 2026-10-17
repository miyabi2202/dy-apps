import type { Command } from './command';

/**
 * `/识歌`: anyone can ask, at a mention's price, and Claude works out the song from the lyrics
 * heard, with `prompt` (see buildPrompt) instead of the usual one.
 */
export function songIdCommand(prompt: () => string): Command {
  return { name: '识歌', adminOnly: false, prompt };
}
