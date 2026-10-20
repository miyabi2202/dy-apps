/**
 * One of a room's own commands, as `data/<房间号>/additional_commands/index.json` lists it: a
 * prompt the bot answers with when someone asks what it's for, whether they @ the bot or not.
 */
export interface AdditionalCommandEntry {
  /** Its key in index.json, which the picker and Claude call it by: can-sing. */
  id: string;
  /** What it's for, as viewers would say it: 主播会唱xxx吗. */
  name: string;
  /** When to use it, for the judge and the picker: 在问主播会不会唱某首歌…. */
  when: string;
  /** What's said that's surely for it, even when the judge doesn't think so; null for none. */
  trigger: RegExp | null;
  /** Its prompt file, relative to the `additional_commands/` folder: can-sing/prompt.md. */
  prompt: string;
  /** Diamonds an answer costs a viewer (0 free); what an @ costs when not set. */
  price?: number;
  /**
   * A file in the room's folder, one phrase a line (a song list's titles, say): a chat containing
   * one is taken as for this command, like one matching its trigger.
   */
  mentions?: string;
  /** Only admins (and the streamer) may have it answered. */
  adminOnly?: boolean;
  /** Its answer may @ others too, each in a message of their own (MESSAGES_SCHEMA). */
  atOthers?: boolean;
}

/**
 * The commands in `index.json` (already parsed): an object of `"<id>": { "name", "when",
 * "prompt", "trigger"?, "price"?, "mentions"?, "adminOnly"?, "atOthers"? }`, `trigger` a regular
 * expression, `price` whole diamonds, `mentions` a file in the room's folder, and the last two
 * true or false.
 * Those that aren't right are left out, each with why.
 */
export function parseCommandIndex(json: unknown): {
  commands: AdditionalCommandEntry[];
  errors: string[];
} {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { commands: [], errors: ['index.json must be an object of commands by id'] };
  }
  const commands: AdditionalCommandEntry[] = [];
  const errors: string[] = [];
  for (const [id, fields] of Object.entries(json)) {
    const entry = toEntry(id, fields);
    if (typeof entry === 'string') errors.push(`${id}: ${entry}`);
    else commands.push(entry);
  }
  return { commands, errors };
}

function toEntry(id: string, fields: unknown): AdditionalCommandEntry | string {
  if (!/^[\w-]+$/.test(id)) return 'the id may have only letters, digits, _ and -';
  if (typeof fields !== 'object' || fields === null) return 'must be an object';
  const { name, when, prompt, trigger, price, mentions, adminOnly, atOthers } = fields as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries({ name, when, prompt })) {
    if (typeof value !== 'string' || !value.trim()) return `${key} must be a non-empty string`;
  }
  if (!isInside(prompt as string)) return `prompt must be inside the folder: ${String(prompt)}`;
  if (trigger !== undefined && typeof trigger !== 'string') return 'trigger must be a string';
  let pattern: RegExp | null = null;
  if (trigger) {
    try {
      pattern = new RegExp(trigger);
    } catch {
      return `trigger is not a regular expression: ${trigger}`;
    }
  }
  if (price !== undefined && !(Number.isInteger(price) && (price as number) >= 0)) {
    return 'price must be whole diamonds, 0 or more';
  }
  if (mentions !== undefined && !(typeof mentions === 'string' && isInside(mentions))) {
    return 'mentions must be a file inside the room folder';
  }
  for (const [key, value] of Object.entries({ adminOnly, atOthers })) {
    if (value !== undefined && typeof value !== 'boolean') return `${key} must be true or false`;
  }
  return {
    id,
    name: name as string,
    when: when as string,
    trigger: pattern,
    prompt: prompt as string,
    ...(price !== undefined && { price: price as number }),
    ...(mentions !== undefined && { mentions: mentions }),
    ...(adminOnly === true && { adminOnly }),
    ...(atOthers === true && { atOthers }),
  };
}

/** Whether `path` is relative and stays inside its folder (no `..`). */
export function isInside(path: string): boolean {
  return !/^([\\/]|[A-Za-z]:)/.test(path) && !path.split(/[\\/]/).includes('..');
}

/**
 * The longest of `phrases` (one a line; blank lines and spaces around them ignored) that `text`
 * contains, ignoring case; null for none.
 */
export function mentionIn(text: string, phrases: string): string | null {
  const said = text.toLowerCase();
  let found: string | null = null;
  for (const line of phrases.split('\n')) {
    const phrase = line.trim();
    if (phrase && said.includes(phrase.toLowerCase()) && phrase.length > (found?.length ?? 0)) {
      found = phrase;
    }
  }
  return found;
}
