import { identifyBgmTool } from '../mcp/identify-bgm';
import { identifySongTool } from '../mcp/identify-song';
import type { BotTool } from '../mcp/rpc';
import { BotMcpServer } from '../mcp/server';
import { setThanksThresholdTool } from '../mcp/set-thanks-threshold';
import type { Container } from './container';
import { LOG, MCP_SERVER, OPTIONS, ROOM, SONG_ID, THANKER, TRANSCRIBER } from './tokens';

/**
 * The bot's tools for Claude (an MCP server in this process, src/mcp/): what it can do when
 * someone @s it, without a command round trip. Each needs what its command needs (listening to
 * the stream; Codex for the song), and an admin-only one is offered only when an admin asks; with
 * none, or with --no-mcp, there is no server.
 */
export function registerMcp(container: Container): void {
  container.register(MCP_SERVER, (c) => {
    const options = c.resolve(OPTIONS);
    if (!options.mcp) return null;
    const log = c.resolve(LOG);
    const transcriber = c.resolve(TRANSCRIBER);
    const songId = c.resolve(SONG_ID);
    const tools: BotTool[] = [
      ...(songId && transcriber
        ? [
            identifySongTool({
              songId,
              room: c.resolve(ROOM),
              maxLength: options.maxReplyLength,
              log,
            }),
          ]
        : []),
      ...(transcriber ? [identifyBgmTool(() => transcriber.identifyMusic(), log)] : []),
      setThanksThresholdTool(c.resolve(THANKER)),
    ];
    return tools.length ? new BotMcpServer({ tools, log, port: options.mcpPort }) : null;
  });
}
