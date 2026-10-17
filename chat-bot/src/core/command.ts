/** A command as a viewer typed it, from a mention like `@机器人/修改人设 小猫`. */
export interface CommandCall {
  name: string;
  /** Everything after the name and the space, which may be an ASCII or a full-width one. */
  args: string;
}

/** The command a mention's question gives, or null when it doesn't start with `/` (or `／`). */
export function parseCommand(question: string): CommandCall | null {
  // `\s` covers the full-width space (U+3000) too.
  const match = /^[/／](\S+)(?:\s+([\s\S]*))?$/.exec(question.trim());
  if (!match) return null;
  const [, name = '', args = ''] = match;
  return { name, args: args.trim() };
}
