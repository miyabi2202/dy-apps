import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { isRoomId, parsePort } from '@dy-apps/services';

export const USAGE =
  'Usage: pnpm start --room <房间号> --bot-name <机器人账号昵称> [--bot-id <账号 uid>] [--port 8757]\n' +
  '       [--prompt prompt.md] [--history 100] [--max-reply 49] [--max-parts 5] [--tools WebSearch,WebFetch,Read,Glob,Grep]\n' +
  '       [--model opus] [--system <系统提示>] [--logs logs/]\n' +
  '       [--no-asr] [--transcript-minutes 5] [--screenshot] [--cost 1 | --test] [--queue 20]\n' +
  '       [--send-interval 10] [--data data/]';

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
  /** Diamonds per @mention; `--test` makes it 0. */
  cost: number;
  maxPending: number;
  sendIntervalMs: number;
  dataDir: string;
}

/** `args` (without node and the script) as options, or null when they're unusable. */
export function parseCliOptions(args: string[], packageDir: string): CliOptions | null {
  const { values } = parseArgs({
    args,
    allowNegative: true,
    options: {
      room: { type: 'string' },
      port: { type: 'string', default: '8757' },
      'bot-name': { type: 'string' },
      'bot-id': { type: 'string' },
      prompt: { type: 'string', default: join(packageDir, 'prompt.md') },
      history: { type: 'string', default: '100' },
      'max-reply': { type: 'string', default: '49' },
      'max-parts': { type: 'string', default: '5' },
      tools: { type: 'string', default: 'WebSearch,WebFetch,Read,Glob,Grep' },
      model: { type: 'string', default: 'opus' },
      system: { type: 'string', default: '你是一个抖音直播间的机器人' },
      logs: { type: 'string', default: join(packageDir, 'logs') },
      asr: { type: 'boolean', default: true },
      'transcript-minutes': { type: 'string', default: '5' },
      // Off by default: most streams don't need Claude to see the video (lessons with a board do).
      screenshot: { type: 'boolean', default: false },
      cost: { type: 'string', default: '1' },
      // Test mode: the same as --cost 0.
      test: { type: 'boolean', default: false },
      queue: { type: 'string', default: '20' },
      'send-interval': { type: 'string', default: '10' },
      data: { type: 'string', default: join(packageDir, 'data') },
    },
  });
  const roomId = values.room ?? '';
  const port = parsePort(values.port);
  const botName = values['bot-name'];
  if (!isRoomId(roomId) || port === null || !botName) return null;
  return {
    roomId,
    port,
    botName,
    botId: values['bot-id'],
    promptFile: values.prompt,
    historySize: Number(values.history),
    maxReplyLength: Number(values['max-reply']),
    maxReplyParts: Number(values['max-parts']),
    tools: values.tools.split(',').filter(Boolean),
    model: values.model,
    systemPrompt: values.system,
    logsDir: values.logs,
    asr: values.asr,
    transcriptMs: Number(values['transcript-minutes']) * 60_000,
    screenshot: values.screenshot,
    cost: values.test ? 0 : Number(values.cost),
    maxPending: Number(values.queue),
    sendIntervalMs: Number(values['send-interval']) * 1000,
    dataDir: values.data,
  };
}
