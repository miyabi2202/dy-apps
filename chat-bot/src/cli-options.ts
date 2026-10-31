import { DEFAULT_PORT } from '@dy-apps/room-feed-protocol';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isRoomId, parsePort } from '@dy-apps/room-feed-protocol';
import { DOUYIN_CHAT_LIMIT } from './core/replies/reply';
import { SETTINGS, SETTING_NAMES, type Settings } from './core/commands/settings';
import { DEFAULT_TRANSCRIPT_WINDOW_MS } from './core/songs/transcript';

export const USAGE =
  `Usage: pnpm start --room <房间号> --bot-name <机器人账号昵称> [--bot-id <账号 uid>] [--port ${DEFAULT_PORT}]\n` +
  '       [--prompt prompt.md] [--history 100] [--max-reply 49] [--max-parts 5] [--tools WebSearch,WebFetch,Read,Glob,Grep]\n' +
  '       [--model opus] [--system <系统提示>] [--logs logs/]\n' +
  '       [--no-asr] [--transcript-minutes 5] [--screenshot] [--queue 20]\n' +
  '       [--send-interval 10] [--data data/] [--config config.json] [--auto-reply-threshold 1]\n' +
  '       [--auto-reply-interval 60] [--thanks-threshold 99999] [--codex gpt-6-luna] [--auto-song-id]\n' +
  '       [--malice-watch] [--asr-port 8758] [--no-lyrics-search] [--mcp-port 0]';

/** The command line, checked and converted; see the README for what each option does. */
export interface CliOptions {
  roomId: string;
  port: number;
  botName: string;
  botId?: string;
  promptFile: string;
  historySize: number;
  maxReplyLength: number;
  tools: string[];
  model: string;
  systemPrompt: string;
  logsDir: string;
  asr: boolean;
  transcriptMs: number;
  maxPending: number;
  sendIntervalMs: number;
  dataDir: string;
  /** The admins. */
  configFile: string;
  /**
   * The settings the command line gave, by their room_config.json names: the ones it didn't give
   * are left out, so the room's own (kept in its room_config.json) stay. A given one only fills in a
   * room's setting the first time, when its file has none (see fillRoomConfig).
   */
  given: Partial<Settings>;
  /** The Codex model for /识歌, auto-reply and malice watch; empty turns all three off. */
  codex: string;
  /** The local port of the speech service, which outlives the bot. */
  asrPort: number;
  /** Name songs from NetEase's lyrics search before asking Codex. */
  lyricsSearch: boolean;
  /** The local port of the tools' server; 0 lets the OS pick a free one. */
  mcpPort: number;
}

/** The flags the settings have, by flag name, for parseArgs. */
const settingFlags: Record<string, { type: 'string' | 'boolean' }> = Object.fromEntries(
  SETTING_NAMES.flatMap((name) => {
    const { flag, default: initial } = SETTINGS[name];
    return flag ? [[flag, { type: typeof initial === 'boolean' ? 'boolean' : 'string' }]] : [];
  }),
);

/**
 * The settings the flags in `values` gave, by their room_config.json names, or null when one is
 * given as something that isn't valid (a number, 0 or more).
 */
function settingsGiven(
  values: Record<string, string | boolean | undefined>,
): Partial<Settings> | null {
  const given: Record<string, unknown> = {};
  for (const name of SETTING_NAMES) {
    const spec = SETTINGS[name];
    const raw = spec.flag ? values[spec.flag] : undefined;
    if (raw === undefined) continue;
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (!spec.valid.safeParse(value).success) return null;
    given[name] = value;
  }
  return given;
}

/** `args` (without node and the script) as options, or null when they're unusable. */
export function parseCliOptions(args: string[], packageDir: string): CliOptions | null {
  const { values } = parseArgs({
    args,
    allowNegative: true,
    options: {
      // The settings' flags (--max-parts, --screenshot, --auto-reply-threshold…), from SETTINGS: a
      // number is given as text, a switch as a flag. Off by default; each one given seeds the
      // room's room_config.json, and /<command> changes it while the bot runs.
      ...settingFlags,
      room: { type: 'string' },
      port: { type: 'string', default: String(DEFAULT_PORT) },
      'bot-name': { type: 'string' },
      'bot-id': { type: 'string' },
      prompt: { type: 'string', default: join(packageDir, 'prompts', 'prompt.md') },
      history: { type: 'string', default: '100' },
      'max-reply': { type: 'string', default: String(DOUYIN_CHAT_LIMIT) },
      tools: { type: 'string', default: 'WebSearch,WebFetch,Read,Glob,Grep' },
      model: { type: 'string', default: 'opus' },
      // Claude may write up its thinking or searching before the answer; only what follows the
      // last 弹幕： is sent (see oneLine).
      system: {
        type: 'string',
        default:
          '你是一个抖音直播间的机器人。把要发到直播间的弹幕写在回答的最后，以「弹幕：」开头；只有最后一个「弹幕：」后面的内容会被发出去，前面写的不会。',
      },
      logs: { type: 'string', default: join(packageDir, 'logs') },
      asr: { type: 'boolean', default: true },
      'transcript-minutes': {
        type: 'string',
        default: String(DEFAULT_TRANSCRIPT_WINDOW_MS / 60_000),
      },
      queue: { type: 'string', default: '20' },
      'send-interval': { type: 'string', default: '10' },
      data: { type: 'string', default: join(packageDir, 'data') },
      config: { type: 'string', default: join(packageDir, 'config.json') },
      // /识歌, auto-reply and malice watch ask Codex (fast and cheap at medium effort); '' turns them off.
      codex: { type: 'string', default: 'gpt-6-luna' },
      // The speech service (asr/transcribe.py --serve), started by hand before the bot, listens here.
      'asr-port': { type: 'string', default: '8758' },
      // /识歌 and /自动识歌 search the lyrics on NetEase first; --no-lyrics-search always asks Codex.
      'lyrics-search': { type: 'boolean', default: true },
      // The tools' server (identify_song, set_thanks_threshold…, which Claude may call while answering)
      // listens on 127.0.0.1 only, on a free port unless --mcp-port says one.
      'mcp-port': { type: 'string', default: '0' },
    },
  });
  const roomId = values.room ?? '';
  const port = parsePort(values.port);
  const botName = values['bot-name'];
  // 0 is allowed here (the OS picks a port), unlike room-feed's.
  const mcpPort = values['mcp-port'] === '0' ? 0 : parsePort(values['mcp-port']);
  if (!isRoomId(roomId) || port === null || mcpPort === null || !botName) return null;
  const given = settingsGiven(values);
  // A setting given as something that isn't a number, 0 or more (`--max-parts abc`), is a mistake: say
  // so, rather than write it into the room's room_config.json for good.
  if (!given) return null;
  return {
    roomId,
    port,
    botName,
    botId: values['bot-id'],
    promptFile: values.prompt,
    historySize: Number(values.history),
    maxReplyLength: Number(values['max-reply']),
    tools: values.tools.split(',').filter(Boolean),
    model: values.model,
    systemPrompt: values.system,
    logsDir: values.logs,
    asr: values.asr,
    transcriptMs: Number(values['transcript-minutes']) * 60_000,
    maxPending: Number(values.queue),
    sendIntervalMs: Number(values['send-interval']) * 1000,
    dataDir: values.data,
    configFile: values.config,
    codex: values.codex,
    given,
    asrPort: Number(values['asr-port']),
    lyricsSearch: values['lyrics-search'],
    mcpPort,
  };
}
