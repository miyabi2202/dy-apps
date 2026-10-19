import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { clampRegion, jpegSize, zoomArgs, zoomScale, type Region } from '../core/zoom';

/** One JSON-RPC message, as MCP sends them over stdio, one a line. */
interface RpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

export interface ZoomServerOptions {
  /** The screenshot's size, which the tool's description tells Claude. */
  size: { width: number; height: number };
  /** Cuts a region out of the screenshot, enlarged; the JPEG, or why it couldn't. */
  crop: (region: Region, scale: number) => Uint8Array | string;
}

/**
 * An MCP server with one tool, `zoom`: a region of the screenshot sent with the question,
 * enlarged, so Claude can read what's too small in the whole picture (a puzzle's figures,
 * small text). Answers each message (null for notifications, which get none).
 */
export function zoomServer({ size, crop }: ZoomServerOptions) {
  const tool = {
    name: 'zoom',
    description: `放大看直播截图的一部分。截图是 ${size.width}×${size.height} 像素，坐标从左上角算起。给出要看的区域（x、y、宽、高，单位像素），返回放大后的图；scale 是放大倍数，默认 2，最多 4。看不清图形、小字、选项时用，可以多次放大不同的地方。`,
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '区域左边离截图左边多少像素' },
        y: { type: 'number', description: '区域上边离截图上边多少像素' },
        width: { type: 'number', description: '区域宽多少像素' },
        height: { type: 'number', description: '区域高多少像素' },
        scale: { type: 'number', description: '放大倍数，1 到 4，默认 2' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  };
  const reply = (id: RpcMessage['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
  const text = (id: RpcMessage['id'], message: string) =>
    reply(id, { content: [{ type: 'text', text: message }], isError: true });

  return (message: RpcMessage): object | null => {
    const { id, method, params = {} } = message;
    if (id === undefined) return null;
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: (params.protocolVersion as string | undefined) ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'zoom', version: '1.0.0' },
        });
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, { tools: [tool] });
      case 'tools/call': {
        const args = (params.arguments ?? {}) as Partial<Region & { scale: number }>;
        const numbers = [args.x, args.y, args.width, args.height];
        if (params.name !== 'zoom' || !numbers.every((n) => typeof n === 'number')) {
          return text(id, '要给出 x、y、width、height 四个数字');
        }
        const region = clampRegion(args as Region, size);
        if (!region) return text(id, `这个区域不在截图里（截图是 ${size.width}×${size.height}）`);
        const image = crop(region, zoomScale(region, args.scale));
        if (typeof image === 'string') return text(id, `放大失败：${image}`);
        return reply(id, {
          content: [
            { type: 'image', data: Buffer.from(image).toString('base64'), mimeType: 'image/jpeg' },
          ],
        });
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } };
    }
  };
}

/** Crops with ffmpeg: the JPEG it wrote, or what it said went wrong. */
export function ffmpegCrop(file: string, ffmpeg = 'ffmpeg') {
  return (region: Region, scale: number): Uint8Array | string => {
    const run = spawnSync(ffmpeg, zoomArgs(file, region, scale), { maxBuffer: 64 * 1024 * 1024 });
    if (run.error) return run.error.message;
    if (run.status !== 0) return run.stderr.toString().trim() || `ffmpeg exited ${run.status}`;
    return new Uint8Array(run.stdout);
  };
}

/** `tsx zoom-mcp.ts <screenshot.jpg>`: serves the zoom tool for that screenshot over stdio. */
function main(file: string): void {
  const size = jpegSize(new Uint8Array(readFileSync(file))) ?? { width: 0, height: 0 };
  const handle = zoomServer({ size, crop: ffmpegCrop(file) });
  createInterface({ input: process.stdin }).on('line', (line) => {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    const response = handle(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
}

if (process.argv[1] && /zoom-mcp\.ts$/.test(process.argv[1]) && process.argv[2]) {
  main(process.argv[2]);
}
