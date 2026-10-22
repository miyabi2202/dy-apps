import { DEFAULT_PORT } from '@dy-apps/room-feed-protocol';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isRoomId, parsePort } from '@dy-apps/room-feed-protocol';
import { DOUYIN_CHAT_LIMIT } from './core/reply';
import { SETTING_DEFAULTS, type Settings } from './core/settings';
import { DEFAULT_TRANSCRIPT_WINDOW_MS } from './core/transcript';

export const USAGE =
  `Usage: pnpm start --room <房间号> --bot-name <机器人账号昵称> [--bot-id <账号 uid>] [--port ${DEFAULT_PORT}]\n` +
  '       [--prompt prompt.md] [--history 100] [--max-reply 49] [--max-parts 5] [--tools WebSearch,WebFetch,Read,Glob,Grep]\n' +
  '       [--model opus] [--system <系统提示>] [--logs logs/]\n' +
  '       [--no-asr] [--transcript-minutes 5] [--screenshot] [--cost 0 | --test] [--queue 20]\n' +
  '       [--send-interval 10] [--data data/] [--config config.json] [--auto-reply-threshold 1]\n' +
  '       [--auto-reply-interval 60] [--thanks-threshold 99999] [--codex gpt-6-luna] [--auto-song-id]\n' +
  '       [--malice-watch] [--asr-port 8758] [--no-lyrics-search] [--no-mcp] [--mcp-port 0]';

/** The command line, checked and converted; see the README for what each option does. */
export interface CliOptions {
  roomId: string;
  port: number;
  botName: string;
  botId?: string;
  promptFile: string;
  historySize: number;
  maxReplyLength: number;
  maxReplyParts: number;
  tools: string[];
  model: string;
  systemPrompt: string;
  logsDir: string;
  asr: boolean;
  transcriptMs: number;
  screenshot: boolean;
  /** Diamonds per @mention; 0 (free) unless `--cost` says otherwise. */
  cost: number;
  maxPending: number;
  sendIntervalMs: number;
  dataDir: string;
  /** The admins. */
  configFile: string;
  /** How likely something must be about the bot for it to reply unprompted; 1 or more never. */
  autoReplyThreshold: number;
  autoReplyIntervalMs: number;
  /** Thank a viewer whose gifts in 5 minutes come to more than this many diamonds. */
  thanksThreshold: number;
  /**
   * The settings the command line gave, by their room_config.json names: the ones it didn't give
   * are left out, so the room's own (kept in its room_config.json) stay. A given one only fills in a
   * room's setting the first time, when its file has none (see fillRoomConfig).
   */
  given: Partial<Settings>;
  /** The Codex model for /识歌, auto-reply and malice watch; empty turns all three off. */
  codex: string;
  /** Name the songs the streamer sings without being asked, from the start. */
  autoSongId: boolean;
  /** @ viewers who keep posting malicious chat, from the start. */
  maliceWatch: boolean;
  /** The local port of the speech service, which outlives the bot. */
  asrPort: number;
  /** Name songs from NetEase's lyrics search before asking Codex. */
  lyricsSearch: boolean;
  /** Offer Claude the bot's tools (identify_song…) while it answers an @. */
  mcp: boolean;
  /** The local port of the tools' server; 0 lets the OS pick a free one. */
  mcpPort: number;
}

/** `args` (without node and the script) as options, or null when they're unusable. */
export function parseCliOptions(args: string[], packageDir: string): CliOptions | null {
  const { values } = parseArgs({
    args,
    allowNegative: true,
    options: {
      room: { type: 'string' },
      port: { type: 'string', default: String(DEFAULT_PORT) },
      'bot-name': { type: 'string' },
      'bot-id': { type: 'string' },
      prompt: { type: 'string', default: join(packageDir, 'prompts', 'prompt.md') },
      history: { type: 'string', default: '100' },
      'max-reply': { type: 'string', default: String(DOUYIN_CHAT_LIMIT) },
      'max-parts': { type: 'string' },
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
      // Off by default: most streams don't need Claude to see the video (lessons with a board do).
      screenshot: { type: 'boolean' },
      cost: { type: 'string' },
      // Test mode: the same as --cost 0 (the default now).
      test: { type: 'boolean', default: false },
      queue: { type: 'string', default: '20' },
      'send-interval': { type: 'string', default: '10' },
      data: { type: 'string', default: join(packageDir, 'data') },
      config: { type: 'string', default: join(packageDir, 'config.json') },
      // Jev's score at which the bot joins in when someone talks about it: 1, off, by default;
      // /自动回复阈值 0.6 turns it on while the bot runs.
      'auto-reply-threshold': { type: 'string' },
      // Seconds it keeps quiet after talking unprompted; /自动回复间隔 changes it while the bot runs.
      'auto-reply-interval': { type: 'string' },
      // So high it's off by default; /自动谢礼 lowers it while the bot runs.
      'thanks-threshold': { type: 'string' },
      // /识歌, auto-reply and malice watch ask Codex (fast and cheap at medium effort); '' turns them off.
      codex: { type: 'string', default: 'gpt-6-luna' },
      // Name the songs the streamer sings without being asked; /自动识歌 switches it while it runs.
      'auto-song-id': { type: 'boolean' },
      // @ viewers who keep posting malicious chat; /识别恶意言论 switches it while it runs.
      'malice-watch': { type: 'boolean' },
      // The speech service (asr/transcribe.py --serve), started by hand before the bot, listens here.
      'asr-port': { type: 'string', default: '8758' },
      // /识歌 and /自动识歌 search the lyrics on NetEase first; --no-lyrics-search always asks Codex.
      'lyrics-search': { type: 'boolean', default: true },
      // Claude may call the bot's tools (identify_song, identify_bgm) while answering; the server
      // listens on 127.0.0.1 only, on a free port unless --mcp-port says one.
      mcp: { type: 'boolean', default: true },
      'mcp-port': { type: 'string', default: '0' },
    },
  });
  const roomId = values.room ?? '';
  const port = parsePort(values.port);
  const botName = values['bot-name'];
  // 0 is allowed here (the OS picks a port), unlike room-feed's.
  const mcpPort = values['mcp-port'] === '0' ? 0 : parsePort(values['mcp-port']);
  if (!isRoomId(roomId) || port === null || mcpPort === null || !botName) return null;
  const given: Partial<Settings> = {
    ...(values.test
      ? { mentionCost: 0 }
      : values.cost !== undefined && { mentionCost: Number(values.cost) }),
    ...(values['auto-reply-threshold'] !== undefined && {
      autoReplyThreshold: Number(values['auto-reply-threshold']),
    }),
    ...(values['auto-reply-interval'] !== undefined && {
      autoReplyIntervalSeconds: Number(values['auto-reply-interval']),
    }),
    ...(values['thanks-threshold'] !== undefined && {
      thanksThreshold: Number(values['thanks-threshold']),
    }),
    ...(values['auto-song-id'] !== undefined && { autoSongId: values['auto-song-id'] }),
    ...(values['malice-watch'] !== undefined && { maliceWatch: values['malice-watch'] }),
    ...(values.screenshot !== undefined && { screenshots: values.screenshot }),
    ...(values['max-parts'] !== undefined && { maxReplyParts: Number(values['max-parts']) }),
  };
  // A setting given as something that isn't a number, 0 or more (`--cost abc`), is a mistake: say
  // so, rather than write it into the room's room_config.json for good.
  const badNumber = Object.values(given).some(
    (value) => typeof value === 'number' && !(Number.isFinite(value) && value >= 0),
  );
  if (badNumber) return null;
  const settings = { ...SETTING_DEFAULTS, ...given };
  return {
    roomId,
    port,
    botName,
    botId: values['bot-id'],
    promptFile: values.prompt,
    historySize: Number(values.history),
    maxReplyLength: Number(values['max-reply']),
    maxReplyParts: settings.maxReplyParts,
    tools: values.tools.split(',').filter(Boolean),
    model: values.model,
    systemPrompt: values.system,
    logsDir: values.logs,
    asr: values.asr,
    transcriptMs: Number(values['transcript-minutes']) * 60_000,
    screenshot: settings.screenshots,
    cost: settings.mentionCost,
    maxPending: Number(values.queue),
    sendIntervalMs: Number(values['send-interval']) * 1000,
    dataDir: values.data,
    configFile: values.config,
    autoReplyThreshold: settings.autoReplyThreshold,
    autoReplyIntervalMs: settings.autoReplyIntervalSeconds * 1000,
    thanksThreshold: settings.thanksThreshold,
    codex: values.codex,
    autoSongId: settings.autoSongId,
    maliceWatch: settings.maliceWatch,
    given,
    asrPort: Number(values['asr-port']),
    lyricsSearch: values['lyrics-search'],
    mcp: values.mcp,
    mcpPort,
  };
}
