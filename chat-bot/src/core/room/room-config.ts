import type { Alias } from '../viewers/alias';
import { errorMessage } from '../errors';
import { DEFAULT_TIME_ZONE, isTimeZone } from '../prompts/local-time';
import { SETTING_DEFAULTS, settingsFrom, type Settings } from '../commands/settings';

/** What the bot says when the streamer starts a song (a cheer, say). */
export interface OnSingConfig {
  /** Sent as it is. */
  message: string;
  /** The chance it's sent for each song, 0–1. */
  probability: number;
}

/** What `room_config.json` says about a room. */
export interface RoomConfig extends Settings {
  /** A 私密 room: its viewers hide who they are, and come in under one shared user id. */
  private: boolean;
  /** What the bot says, now and then, as the streamer starts a song (`on_sing`); none when absent. */
  onSing?: OnSingConfig;
  /** What the bot says every `autoMessageIntervalSeconds` (`auto_message`); none when absent. */
  autoMessage?: string;
  /**
   * Other names viewers and the streamer call the bot (`aliases`), each with how speech
   * recognition may write it besides.
   */
  aliases: Alias[];
  /** What viewers call the streamer (`streamerNames`), for a tool's `{{streamerNames}}`. */
  streamerNames: string[];
  /** What to take off the start of a nickname when the bot @s someone (`atTrimStart`): 单推符号. */
  atTrimStart: string[];
  /**
   * Where the streamer is (`timeZone`, an IANA name like `Asia/Shanghai`): every time the models
   * and the records show is in it. Beijing time when not known.
   */
  timeZone: string;
  /** The declarative tools switched on here (`tools`), by name: `["can_sing", "too_easy"]`; the built-in tools need no listing. */
  tools: string[];
  /**
   * The song break sources on here (`songBreaks`), by name (`lyrics`, `shazam`, `backingGaps`): `["lyrics"]`, or `[]` for only pauses
   * and talk; every one there is when absent.
   */
  songBreaks?: string[];
  /**
   * The file in the room's folder (`persona`, like `personas/fairy.md`) that says who the bot
   * plays there, see livePersona; none for the shared default persona.
   */
  persona?: string;
  /** The room's streamer (`streamer`), which the bot writes in once room-feed says who it is. */
  streamer?: { uid: string; nickname: string };
}

/** Every field a room's room_config.json is filled in with (see fillRoomConfig), and its default. */
export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  private: false,
  aliases: [],
  streamerNames: [],
  atTrimStart: [],
  timeZone: DEFAULT_TIME_ZONE,
  tools: [],
  ...SETTING_DEFAULTS,
};

/**
 * The room config in `raw` (a parsed room_config.json), each field checked on its own: a bad one
 * is `last`'s value for it (the last good config), with what's wrong with it in `problems`, so a
 * typo in one setting can't, say, turn a 私密 room's `private` off with it.
 */
export function roomConfigFrom(
  raw: Readonly<Record<string, unknown>>,
  last: Readonly<RoomConfig> = DEFAULT_ROOM_CONFIG,
  problems: string[] = [],
): RoomConfig {
  const field = <T>(name: string, parse: () => T, fallback: T): T => {
    try {
      return parse();
    } catch (err) {
      problems.push(`${name}: ${errorMessage(err)}`);
      return fallback;
    }
  };
  const isPrivate = field(
    'private',
    () => {
      const value = raw.private ?? false;
      if (typeof value !== 'boolean') throw new Error('must be true or false');
      return value;
    },
    last.private,
  );
  const onSing = field(
    'on_sing',
    () => (raw.on_sing === undefined ? undefined : onSingConfig(raw.on_sing)),
    last.onSing,
  );
  const autoMessage = field(
    'auto_message',
    () => (raw.auto_message === undefined ? undefined : autoMessageText(raw.auto_message)),
    last.autoMessage,
  );
  const songBreaks = field(
    'songBreaks',
    () =>
      raw.songBreaks === undefined
        ? undefined
        : nameList(raw.songBreaks, 'songBreaks', '["lyrics"]'),
    last.songBreaks,
  );
  const persona = field(
    'persona',
    () => (raw.persona === undefined ? undefined : personaPath(raw.persona)),
    last.persona,
  );
  const streamer = field(
    'streamer',
    () => (raw.streamer === undefined ? undefined : streamerOf(raw.streamer)),
    last.streamer,
  );
  return {
    private: isPrivate,
    ...(streamer && { streamer }),
    ...(onSing && { onSing }),
    ...(autoMessage && { autoMessage }),
    ...(persona && { persona }),
    ...(songBreaks && { songBreaks }),
    aliases: field('aliases', () => aliasList(raw.aliases), last.aliases),
    streamerNames: field(
      'streamerNames',
      () => nameList(raw.streamerNames, 'streamerNames', '["茜茜", "茜颜"]'),
      last.streamerNames,
    ),
    atTrimStart: field('atTrimStart', () => prefixList(raw.atTrimStart), last.atTrimStart),
    timeZone: field('timeZone', () => timeZoneOf(raw.timeZone), last.timeZone),
    tools: field('tools', () => toolList(raw.tools), last.tools),
    ...settingsFrom(raw, last, problems),
  };
}

/** `timeZone` as a time zone this machine knows (Beijing time when absent), or an error. */
function timeZoneOf(raw: unknown): string {
  if (raw === undefined) return DEFAULT_TIME_ZONE;
  if (typeof raw !== 'string' || !isTimeZone(raw)) {
    throw new Error('timeZone must be a time zone like "Asia/Shanghai" or "America/New_York"');
  }
  return raw;
}

/** `atTrimStart` as a list of prefixes (none when absent), or an error saying what's wrong with it. */
function prefixList(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((prefix) => typeof prefix === 'string')) {
    throw new Error('atTrimStart must be a list of what to take off nicknames, like ["⊹꙳𝝑"]');
  }
  return raw.filter((prefix) => prefix.trim());
}

/**
 * `aliases` as a list of Alias (none when absent), or an error saying what's wrong with it: each
 * `{ "name": "Fairy", "heardAs": ["ferry"] }`, `heardAs` [] when left out.
 */
function aliasList(raw: unknown): Alias[] {
  if (raw === undefined) return [];
  const wrong = () =>
    new Error(
      'aliases must be a list like [{ "name": "Fairy", "heardAs": ["ferry"] }, { "name": "菲瑞", "heardAs": [] }]',
    );
  if (!Array.isArray(raw)) throw wrong();
  return raw.flatMap((item: unknown): Alias[] => {
    if (typeof item !== 'object' || item === null) throw wrong();
    const { name, heardAs = [] } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !Array.isArray(heardAs)) throw wrong();
    if (!heardAs.every((form) => typeof form === 'string')) throw wrong();
    const forms = heardAs.map((form: string) => form.trim()).filter(Boolean);
    return name.trim() ? [{ name: name.trim(), heardAs: forms }] : [];
  });
}

/** A list of names (none when absent), or an error saying the field `name` should be like `example`. */
function nameList(raw: unknown, name: string, example: string): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string')) {
    throw new Error(`${name} must be a list of names, like ${example}`);
  }
  return raw.map((item) => item.trim()).filter(Boolean);
}

/** `streamer` as a uid and nickname, or an error saying what's wrong with it. */
function streamerOf(raw: unknown): { uid: string; nickname: string } {
  const { uid, nickname } = (raw ?? {}) as Record<string, unknown>;
  if (typeof uid !== 'string' || !uid.trim() || typeof nickname !== 'string') {
    throw new Error('streamer must be { "nickname": "…", "uid": "…" }');
  }
  return { uid: uid.trim(), nickname };
}

/** `tools` as a list of tool names (none when absent), or an error saying what's wrong with it. */
function toolList(raw: unknown): string[] {
  if (raw === undefined) return [];
  const names = nameList(raw, 'tools', '["can_sing", "too_easy"]');
  if (!names.every((name) => /^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error('tools must be a list of tool names, like ["can_sing", "too_easy"]');
  }
  return names;
}

/** `persona` as a path inside the room's folder, or an error saying what's wrong with it. */
function personaPath(raw: unknown): string {
  const parts = typeof raw === 'string' ? raw.trim().split(/[/\\]/) : [];
  if (!parts.length || !parts.every((part) => part && part !== '.' && part !== '..')) {
    throw new Error('persona must be a file in the room\'s folder, like "personas/fairy.md"');
  }
  return parts.join('/');
}

/** `on_sing` as a OnSingConfig, or an error saying what's wrong with it. */
function onSingConfig(raw: unknown): OnSingConfig {
  const { message, probability } = (raw ?? {}) as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('on_sing.message must be some text');
  }
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
    throw new Error('on_sing.probability must be a number from 0 to 1');
  }
  return { message, probability };
}

/** `auto_message` as the text to send, or an error saying what's wrong with it. */
function autoMessageText(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('auto_message must be some text');
  return raw;
}
