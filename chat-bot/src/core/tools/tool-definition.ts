/** What a tool listens for in the room without an @, as tool.json writes it. */
export interface ListenDefinition {
  /** The sentence Jev judges each new line by: 在嫌主播讲的题太简单…. */
  when: string;
  /** What's said that's surely for it: auto-reply looks at once; null for none. */
  trigger: RegExp | null;
  /** A file in the room's folder of phrases (a song list's titles) that make auto-reply look at once too. */
  mentions?: string;
}

/**
 * One declarative tool, as `src/mcp/tools/<folder>/tool.json` defines it: what Claude reads to
 * decide to call it, and what it hands back (the guidance file, filled with the room's data) or
 * says (a fixed reply). A room switches it on by name in its room_config.json.
 */
export interface ToolDefinition {
  /** The tool's name, the folder's with `_` for `-`: can_sing. */
  name: string;
  /** What Claude reads: what it's for and the fine points of when it is and isn't. */
  description: string;
  /** The guidance file in the tool's folder, returned to Claude when called: guidance.md. Not with `fixedReply`. */
  guidance?: string;
  /** Sent as it is to whoever it's called for, with no model asked. Not with `guidance`. */
  fixedReply?: string;
  /** Offered only when an admin or the streamer asks. */
  adminOnly?: boolean;
  /** It applies only to viewers matching any of these. */
  only?: UserCondition[];
  /** It doesn't apply to viewers matching any of these. */
  except?: UserCondition[];
  listen?: ListenDefinition;
}

export interface DefinitionOptions {
  /** The folder the tool.json is in, which its `name` must match. */
  folder: string;
  /** What viewers call the streamer (room_config.json's `streamerNames`), for `{{streamerNames}}`. */
  streamerNames?: readonly string[];
}

const FIELDS = [
  'name',
  'description',
  'guidance',
  'fixedReply',
  'adminOnly',
  'only',
  'except',
  'listen',
];
const LISTEN_FIELDS = ['when', 'trigger', 'mentions'];
const NAME = /^[a-z][a-z0-9_]*$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/**
 * `json` (a parsed tool.json) as a ToolDefinition, or what's wrong with it. It holds `name`,
 * `description`, one of `guidance` and `fixedReply`, and optionally `adminOnly`, `only`, `except`
 * and `listen { when, trigger?, mentions? }`; a field it doesn't know is an error, since a typo
 * in the repo should fail loudly. `{{streamerNames}}` in `description`, `listen.when` and
 * `listen.trigger` is what viewers call the streamer (see streamerNamesIn).
 */
export function parseToolDefinition(
  json: unknown,
  { folder, streamerNames = [] }: DefinitionOptions,
): ToolDefinition | string {
  if (!isObject(json)) return 'tool.json must be an object';
  const unknown = Object.keys(json).find((key) => !FIELDS.includes(key));
  if (unknown !== undefined) return `unknown field "${unknown}" (use ${FIELDS.join(', ')})`;
  const { name, description, guidance, fixedReply, adminOnly } = json;
  if (typeof name !== 'string' || !NAME.test(name)) {
    return 'name must be lowercase letters, digits and _, like "can_sing"';
  }
  const expected = folder.replace(/-/g, '_');
  if (name !== expected) return `name must be the folder's name with _ for -: "${expected}"`;
  if (!isText(description)) return 'description must be a non-empty string';
  if (guidance === undefined && fixedReply === undefined) {
    return 'needs a guidance file or a fixedReply';
  }
  if (guidance !== undefined && fixedReply !== undefined) {
    return "guidance and fixedReply can't both be set";
  }
  if (
    guidance !== undefined &&
    !(isText(guidance) && isInside(guidance) && !/[\\/]/.test(guidance))
  ) {
    return 'guidance must be a file in the tool\'s folder, like "guidance.md"';
  }
  if (fixedReply !== undefined && !isText(fixedReply)) {
    return 'fixedReply must be a non-empty string';
  }
  if (adminOnly !== undefined && typeof adminOnly !== 'boolean') {
    return 'adminOnly must be true or false';
  }
  const filters: { only?: UserCondition[]; except?: UserCondition[] } = {};
  for (const key of ['only', 'except'] as const) {
    if (json[key] === undefined) continue;
    const parsed = parseConditions(json[key]);
    if (typeof parsed === 'string') return `${key} ${parsed}`;
    filters[key] = parsed;
  }
  const listen = json.listen === undefined ? undefined : parseListen(json.listen, streamerNames);
  if (typeof listen === 'string') return listen;
  return {
    name,
    description: streamerNamesIn(description, streamerNames),
    ...(guidance !== undefined && { guidance }),
    ...(fixedReply !== undefined && { fixedReply }),
    ...(adminOnly === true && { adminOnly }),
    ...filters,
    ...(listen && { listen }),
  };
}

/** `listen` as a ListenDefinition, or what's wrong with it. */
function parseListen(listen: unknown, streamerNames: readonly string[]): ListenDefinition | string {
  if (!isObject(listen)) return 'listen must be an object';
  const unknown = Object.keys(listen).find((key) => !LISTEN_FIELDS.includes(key));
  if (unknown !== undefined) {
    return `listen has an unknown field "${unknown}" (use ${LISTEN_FIELDS.join(', ')})`;
  }
  const { when, trigger, mentions } = listen;
  if (!isText(when)) return 'listen.when must be a non-empty string';
  let pattern: RegExp | null = null;
  if (trigger !== undefined) {
    try {
      if (typeof trigger !== 'string') throw new Error('not a string');
      pattern = new RegExp(streamerNamesIn(trigger, streamerNames, { pattern: true }));
    } catch {
      return `listen.trigger is not a regular expression: ${typeof trigger === 'string' ? trigger : JSON.stringify(trigger)}`;
    }
  }
  if (mentions !== undefined && !(typeof mentions === 'string' && isInside(mentions))) {
    return 'listen.mentions must be a file inside the room folder';
  }
  return {
    when: streamerNamesIn(when, streamerNames),
    trigger: pattern,
    ...(mentions !== undefined && { mentions }),
  };
}

/**
 * What a viewer has to be, as a tool's `only` or `except` says. A condition matches a viewer
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

/** `conditions` (a list in tool.json) as UserConditions, or what's wrong with it. */
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

/** Whether the tool `entry` applies to `viewer`: matching its `only`, and not its `except`. */
export function appliesTo(
  { only, except }: Pick<ToolDefinition, 'only' | 'except'>,
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
