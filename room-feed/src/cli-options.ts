import { DEFAULT_PORT } from '@dy-apps/room-feed-protocol';
import { parseArgs } from 'node:util';

export const USAGE =
  '用法：\n' +
  '  pnpm room-feed login                        在弹出的 Chrome 里登录抖音，保存登录信息\n' +
  '  pnpm room-feed --room <房间号或直播间链接>  接收这个直播间的弹幕和礼物\n' +
  '选项：\n' +
  `  --port <端口>     默认 ${DEFAULT_PORT}\n` +
  '  --chrome <路径>   chrome.exe 的位置，找不到 Chrome 时用\n' +
  '  --headed          显示直播间的 Chrome 窗口（排查问题时用）';

export type CliOptions =
  | { command: 'login'; chrome?: string }
  | { command: 'serve'; roomId: string; port: number; chrome?: string; headed: boolean };

/**
 * The room number in what was typed: the digits, or the tail of a live.douyin.com link. Full-width
 * digits (from a Chinese input method) count too. Null when there's no room number in it.
 */
export function roomIdFrom(input: string): string | null {
  const ascii = input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const fromUrl = /live\.douyin\.com\/(\d+)/.exec(ascii)?.[1];
  if (fromUrl) return fromUrl;
  const digits = ascii.trim();
  return /^\d+$/.test(digits) ? digits : null;
}

/** The options, or an error to print above the usage. */
export function parseCliOptions(argv: string[]): CliOptions | { error: string } {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        room: { type: 'string' },
        port: { type: 'string', default: String(DEFAULT_PORT) },
        chrome: { type: 'string' },
        headed: { type: 'boolean', default: false },
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const { values, positionals } = parsed;
  const chrome = values.chrome ? { chrome: values.chrome } : {};
  if (positionals[0] === 'login') return { command: 'login', ...chrome };
  if (positionals.length) return { error: `不认识的命令：${positionals.join(' ')}` };

  if (!values.room) return { error: '缺少 --room' };
  const roomId = roomIdFrom(values.room);
  if (!roomId)
    return { error: `--room 应该是房间号（live.douyin.com/ 后面的数字）：${values.room}` };
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: `--port 应该是 1 到 65535 的数字：${values.port}` };
  }
  return { command: 'serve', roomId, port, headed: values.headed, ...chrome };
}
