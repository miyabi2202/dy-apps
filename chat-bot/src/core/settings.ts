/**
 * What admins can change while the bot runs, kept per room in `room_config.json` (one field each,
 * same names), read hot: editing the file changes the running bot at once.
 */
export interface Settings {
  /** Diamonds one @ costs; 0 free (`/修改收费`, `--cost`). */
  mentionCost: number;
  /** How likely something must be about the bot for it to reply unprompted; 1 or more never (`/自动回复阈值`). */
  autoReplyThreshold: number;
  /** Seconds it keeps quiet after talking unprompted; 0 doesn't wait (`/自动回复间隔`). */
  autoReplyIntervalSeconds: number;
  /** Viewers whose gifts within 5 minutes pass this many diamonds are thanked (`/自动谢礼`). */
  thanksThreshold: number;
  /** Whether it names the songs the streamer sings without being asked (`/自动识歌`). */
  autoSongId: boolean;
  /** Whether it @s viewers who keep posting malicious chat (`/识别恶意言论`). */
  maliceWatch: boolean;
  /** Whether prompts get a screenshot of the live video (`/截图`). */
  screenshots: boolean;
  /** The most messages one @'s answer is split into (`/最大回复条数`, `--max-parts`). */
  maxReplyParts: number;
}

/** Each setting's value when neither room_config.json nor the command line says. */
export const SETTING_DEFAULTS: Readonly<Settings> = {
  mentionCost: 0,
  autoReplyThreshold: 1,
  autoReplyIntervalSeconds: 60,
  thanksThreshold: 99999,
  autoSongId: false,
  maliceWatch: false,
  screenshots: false,
  maxReplyParts: 5,
};

/** The settings' names, in the order room_config.json lists them. */
export const SETTING_NAMES = Object.keys(SETTING_DEFAULTS) as (keyof Settings)[];

/**
 * The settings in `raw` (a parsed room_config.json), each checked on its own: a missing one is its
 * default, and one of the wrong kind is `fallback`'s value for it (the last good settings), with
 * what's wrong with it in `problems`, so one bad value doesn't cost the others.
 */
export function settingsFrom(
  raw: Readonly<Record<string, unknown>>,
  fallback: Readonly<Settings> = SETTING_DEFAULTS,
  problems: string[] = [],
): Settings {
  const settings: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const name of SETTING_NAMES) {
    const value = raw[name];
    if (value === undefined) continue;
    const kind = typeof SETTING_DEFAULTS[name];
    if (kind === 'boolean' ? typeof value !== 'boolean' : !isCount(value)) {
      problems.push(
        `${name} must be ${kind === 'boolean' ? 'true or false' : 'a number, 0 or more'}`,
      );
      settings[name] = fallback[name];
      continue;
    }
    settings[name] = value;
  }
  return settings as unknown as Settings;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
