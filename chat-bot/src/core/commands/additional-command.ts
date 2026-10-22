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
  /**
   * Its prompt file, relative to the `additional_commands/` folder: can-sing/prompt.md. Missing
   * when it has a `fixedReply`.
   */
  prompt?: string;
  /** What it says, as it is, to whoever it's chosen for, with no model asked. */
  fixedReply?: string;
  /**
   * One of the bot's commands (commands.md) it runs instead, as if the asker had typed it:
   * 识别背景音乐.
   */
  run?: string;
  /** The command it runs instead of `run` while the streamer is singing (see singingNow): 识歌. */
  runWhileSinging?: string;
  /** It applies only to viewers matching any of these. */
  only?: UserCondition[];
  /** It doesn't apply to viewers matching any of these. */
  except?: UserCondition[];
  /**
   * A file in the room's folder, one phrase a line (a song list's titles, say): a chat containing
   * one is taken as for this command, like one matching its trigger.
   */
  mentions?: string;
  /** Only admins (and the streamer) may have it answered. */
  adminOnly?: boolean;
  /** Its answer may @ others too, each in a message of their own (MESSAGES_SCHEMA). */
  atOthers?: boolean;
  /** The shared command it builds on (`base`, a folder in chat-bot/prompts/commands/). */
  base?: string;
  /** Its `prompt` is the shared command's, in that folder, not one in the room's. */
  sharedPrompt?: true;
}

/** How index.json's commands are read beyond the file itself. */
export interface IndexOptions {
  /** A shared command's fields (its command.json, parsed), by its name; undefined when there's none. */
  shared?: (base: string) => unknown;
  /** What viewers call the streamer (room_config.json's `streamerNames`), for `{{streamerNames}}`. */
  streamerNames?: readonly string[];
}

/**
 * The commands in `index.json` (already parsed): an object of `"<id>": { "base"?, "name", "when",
 * "prompt"?, "fixedReply"?, "run"?, "runWhileSinging"?, "trigger"?, "mentions"?,
 * "adminOnly"?, "atOthers"?, "only"?, "except"? }`, at least one of `prompt`, `fixedReply` and
 * `run` (`runWhileSinging` only with a `run`), `run` and `runWhileSinging` names of the bot's
 * commands without the slash, `trigger` a regular expression,
 * `mentions` a file in the room's folder, `adminOnly` and `atOthers` true or
 * false, `only` and `except` lists of UserCondition. A command with a `base` starts from that
 * shared command's fields, and any the room writes replace them. `{{streamerNames}}` in `when`
 * and `trigger` is what viewers call the streamer (see streamerNamesIn).
 * Those that aren't right are left out, each with why.
 */
export function parseCommandIndex(
  json: unknown,
  { shared = () => undefined, streamerNames = [] }: IndexOptions = {},
): {
  commands: AdditionalCommandEntry[];
  errors: string[];
} {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { commands: [], errors: ['index.json must be an object of commands by id'] };
  }
  const commands: AdditionalCommandEntry[] = [];
  const errors: string[] = [];
  for (const [id, fields] of Object.entries(json)) {
    const entry = withBase(id, fields, shared, streamerNames);
    if (typeof entry === 'string') errors.push(`${id}: ${entry}`);
    else commands.push(entry);
  }
  return { commands, errors };
}

/** The command `id`, its fields on top of its `base`'s when it names one (see parseCommandIndex). */
function withBase(
  id: string,
  fields: unknown,
  shared: (base: string) => unknown,
  streamerNames: readonly string[],
): AdditionalCommandEntry | string {
  if (typeof fields !== 'object' || fields === null) return 'must be an object';
  const { base, ...own } = fields as Record<string, unknown>;
  if (base === undefined) return toEntry(id, own, streamerNames);
  // A folder name in commands/, so nothing outside that folder can be named.
  if (typeof base !== 'string' || !/^[\w-]+$/.test(base)) {
    return 'base must be the name of a shared command, like "can-sing"';
  }
  const from = shared(base);
  if (typeof from !== 'object' || from === null || Array.isArray(from)) {
    return `there is no shared command "${base}"`;
  }
  const entry = toEntry(id, { ...from, ...own }, streamerNames);
  if (typeof entry === 'string') return entry;
  const sharedPrompt = own.prompt === undefined && entry.prompt !== undefined;
  return { ...entry, base, ...(sharedPrompt && { sharedPrompt: true as const }) };
}

/**
 * `text` with each `{{streamerNames}}` in it replaced by what viewers call the streamer: for a
 * regular expression (`pattern`), 主播 and each name as alternatives (`主播|茜茜|茜颜`); for text, the
 * names joined with 、, or 主播 when there are none.
 */
export function streamerNamesIn(
  text: string,
  names: readonly string[],
  { pattern = false }: { pattern?: boolean } = {},
): string {
  const value = pattern
    ? ['主播', ...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : names.join('、') || '主播';
  return text.replace(/\{\{streamerNames\}\}/g, () => value);
}

function toEntry(
  id: string,
  fields: Record<string, unknown>,
  streamerNames: readonly string[],
): AdditionalCommandEntry | string {
  if (!/^[\w-]+$/.test(id)) return 'the id may have only letters, digits, _ and -';
  const { name, prompt, fixedReply, run, runWhileSinging, mentions, adminOnly, atOthers } = fields;
  const when =
    typeof fields.when === 'string' ? streamerNamesIn(fields.when, streamerNames) : fields.when;
  const trigger =
    typeof fields.trigger === 'string'
      ? streamerNamesIn(fields.trigger, streamerNames, { pattern: true })
      : fields.trigger;
  const lists = fields as { only?: unknown; except?: unknown };
  for (const [key, value] of Object.entries({ name, when })) {
    if (typeof value !== 'string' || !value.trim()) return `${key} must be a non-empty string`;
  }
  for (const [key, value] of Object.entries({ prompt, fixedReply, run, runWhileSinging })) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      return `${key} must be a non-empty string`;
    }
  }
  if (prompt === undefined && fixedReply === undefined && run === undefined) {
    return 'needs a prompt, a fixedReply or a run';
  }
  if (runWhileSinging !== undefined && run === undefined) return 'runWhileSinging needs a run';
  if (prompt !== undefined && !isInside(prompt as string)) {
    return `prompt must be inside the folder: ${prompt as string}`;
  }
  if (trigger !== undefined && typeof trigger !== 'string') return 'trigger must be a string';
  let pattern: RegExp | null = null;
  if (trigger) {
    try {
      pattern = new RegExp(trigger);
    } catch {
      return `trigger is not a regular expression: ${trigger}`;
    }
  }
  if (mentions !== undefined && !(typeof mentions === 'string' && isInside(mentions))) {
    return 'mentions must be a file inside the room folder';
  }
  for (const [key, value] of Object.entries({ adminOnly, atOthers })) {
    if (value !== undefined && typeof value !== 'boolean') return `${key} must be true or false`;
  }
  const filters: { only?: UserCondition[]; except?: UserCondition[] } = {};
  for (const key of ['only', 'except'] as const) {
    if (lists[key] === undefined) continue;
    const parsed = parseConditions(lists[key]);
    if (typeof parsed === 'string') return `${key} ${parsed}`;
    filters[key] = parsed;
  }
  return {
    id,
    name: name as string,
    when: when as string,
    trigger: pattern,
    ...(prompt !== undefined && { prompt: prompt as string }),
    ...(fixedReply !== undefined && { fixedReply: fixedReply as string }),
    ...(run !== undefined && { run: (run as string).trim().replace(/^\//, '') }),
    ...(runWhileSinging !== undefined && {
      runWhileSinging: (runWhileSinging as string).trim().replace(/^\//, ''),
    }),
    ...filters,
    ...(mentions !== undefined && { mentions: mentions }),
    ...(adminOnly === true && { adminOnly }),
    ...(atOthers === true && { atOthers }),
  };
}

/**
 * What a viewer has to be, as a command's `only` or `except` says. A condition matches a viewer
 * when all its fields do; at least one is set.
 */
export interface UserCondition {
  /** They have this badge by their name. */
  badge?: string;
  /** Their fan club (the room's streamer's) level is at least this. */
  fansLevel?: number;
  /** Their wealth level is at least this. */
  payLevel?: number;
  /** They're the streamer or a bot admin. */
  admin?: true;
}

/** Who is asking, as much as is known: what a UserCondition is checked against. */
export interface Viewer {
  /** The streamer, or a bot admin. */
  admin: boolean;
  badges?: readonly string[];
  /** The fan club shown for them: its level, and whose it is when known. */
  fansClub?: { level: number; anchorId?: string };
  payLevel?: number;
}

const CONDITION_FIELDS = ['badge', 'fansLevel', 'payLevel', 'admin'];

/** `conditions` (a list in index.json) as UserConditions, or what's wrong with it. */
function parseConditions(conditions: unknown): UserCondition[] | string {
  if (!Array.isArray(conditions) || !conditions.length) {
    return 'must be a non-empty list of conditions';
  }
  const parsed: UserCondition[] = [];
  for (const [i, condition] of conditions.entries()) {
    const at = `condition ${i + 1}`;
    if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
      return `${at} must be an object`;
    }
    const { badge, fansLevel, payLevel, admin, ...unknown } = condition as Record<string, unknown>;
    const [extra] = Object.keys(unknown);
    if (extra !== undefined) {
      return `${at} has an unknown field "${extra}" (use ${CONDITION_FIELDS.join(', ')})`;
    }
    if (badge !== undefined && (typeof badge !== 'string' || !badge.trim())) {
      return `${at}: badge must be a non-empty string`;
    }
    for (const [key, level] of Object.entries({ fansLevel, payLevel })) {
      if (level !== undefined && !(Number.isInteger(level) && (level as number) >= 1)) {
        return `${at}: ${key} must be a whole number, 1 or more`;
      }
    }
    if (admin !== undefined && admin !== true) return `${at}: admin must be true`;
    const set = { badge, fansLevel, payLevel, admin };
    if (Object.values(set).every((value) => value === undefined)) {
      return `${at} needs at least one of ${CONDITION_FIELDS.join(', ')}`;
    }
    parsed.push({
      ...(badge !== undefined && { badge }),
      ...(fansLevel !== undefined && { fansLevel: fansLevel as number }),
      ...(payLevel !== undefined && { payLevel: payLevel as number }),
      ...(admin !== undefined && { admin: true as const }),
    });
  }
  return parsed;
}

/**
 * Whether `viewer` matches any of `conditions`, each matched when all its fields are. Their fan
 * club counts only when it's the streamer's (`streamerId`): one that says whose it is must be
 * that, and one that doesn't say counts.
 */
export function userMatches(
  conditions: readonly UserCondition[],
  viewer: Viewer,
  streamerId?: string,
): boolean {
  const { fansClub } = viewer;
  const theirs =
    fansClub && (fansClub.anchorId === undefined || fansClub.anchorId === streamerId)
      ? fansClub.level
      : undefined;
  return conditions.some(
    ({ badge, fansLevel, payLevel, admin }) =>
      (badge === undefined || !!viewer.badges?.includes(badge)) &&
      (fansLevel === undefined || (theirs !== undefined && theirs >= fansLevel)) &&
      (payLevel === undefined || (viewer.payLevel !== undefined && viewer.payLevel >= payLevel)) &&
      (admin === undefined || viewer.admin),
  );
}

/** Whether the command `entry` applies to `viewer`: matching its `only`, and not its `except`. */
export function appliesTo(
  { only, except }: Pick<AdditionalCommandEntry, 'only' | 'except'>,
  viewer: Viewer,
  streamerId?: string,
): boolean {
  return (
    (!only || userMatches(only, viewer, streamerId)) &&
    !(except && userMatches(except, viewer, streamerId))
  );
}

/** Whether `path` is relative and stays inside its folder (no `..`). */
export function isInside(path: string): boolean {
  return !/^([\\/]|[A-Za-z]:)/.test(path) && !path.split(/[\\/]/).includes('..');
}

/**
 * The phrases a mentions file lists: one a line (blank lines and spaces around them ignored), or,
 * in a table (a song list, with lines like `歌名｜原唱｜语言`), what's before each row's first `｜`,
 * its other lines (headings like `会唱的歌（693 首）：`) skipped. A phrase with another name in
 * brackets (ヤキモチ（吃醋）) counts as both. Ones too short to tell anything (光, if: one
 * character, or English under three letters) are left out, as most chats would contain them.
 */
export function mentionPhrases(list: string): string[] {
  const lines = list
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const table = lines.some((line) => line.includes('｜'));
  const phrases = new Set<string>();
  for (const line of lines) {
    if (table && !line.includes('｜')) continue;
    for (const part of line.split('｜')[0]!.split(/[（()）]/)) {
      const phrase = part.trim();
      const long = /^[ -~]+$/.test(phrase) ? phrase.length >= 3 : [...phrase].length >= 2;
      if (long) phrases.add(phrase);
    }
  }
  return [...phrases];
}

/** The longest of the phrases `list` has (see mentionPhrases) that `text` contains, ignoring case; null for none. */
export function mentionIn(text: string, list: string): string | null {
  const said = text.toLowerCase();
  let found: string | null = null;
  for (const phrase of mentionPhrases(list)) {
    if (said.includes(phrase.toLowerCase()) && phrase.length > (found?.length ?? 0)) {
      found = phrase;
    }
  }
  return found;
}
