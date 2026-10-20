/**
 * Which of `names` (the bot's nickname and the room's aliases for it) `text` contains, as
 * configured; undefined for none. Latin letters match in any case (speech recognition writes
 * `Fairy` as `FAIRY`); Chinese matches as it is.
 */
export function matchName(text: string, names: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  return names.find((name) => name.trim() !== '' && lower.includes(name.trim().toLowerCase()));
}
