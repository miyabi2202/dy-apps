import { MAX_LIKES } from '@dy-apps/room-feed-protocol';
import { join } from 'node:path';
import { liveToolDefinitions } from '../adapters/files/tool-files';
import { askAboutPuzzleTool } from '../app/tools/ask-about-puzzle';
import { declarativeTools } from '../app/tools/declarative-tools';
import { identifyBgmTool } from '../app/tools/identify-bgm';
import { identifySongTool } from '../app/tools/identify-song';
import { BotMcpServer } from '../adapters/mcp/server';
import { fansLampTool } from '../app/tools/fans-lamp';
import { happyHeartTool } from '../app/tools/happy-heart';
import { heartTool } from '../app/tools/heart';
import { HeartGate } from '../app/tools/heart-gate';
import { pressLikeTool } from '../app/tools/press-like';
import { settingTool } from '../app/tools/setting-tool';
import { updateMemoryTool } from '../app/tools/update-memory';
import type { Container } from './container';
import {
  ADMINS,
  ANSWERER,
  ASK_SOLVE,
  BUS,
  JUDGE,
  LOG,
  MEMORY,
  MCP_SERVER,
  OPTIONS,
  OUTBOX,
  PACKAGE_DIR,
  PROMPT,
  ROOM,
  ROOM_API,
  ROOM_CONFIG,
  ROOM_DIR,
  SETTINGS,
  SONG_ID,
  TOOL_DEFINITIONS,
  TOOLS,
  TRANSCRIBER,
  USER_TALK,
} from './tokens';

/**
 * The bot's tools (src/app/tools/): what it can do, for Claude when someone @s it and for a typed `/`
 * command alike, and the MCP server in this process that gives them to Claude. Each needs what
 * its feature needs (listening to the stream; Codex for the song), and an admin-only one is
 * offered only when an admin asks. The server is always on: without it Claude could not act on
 * anything said in words, so a server that can't start stops the bot at start. The declarative tools in chat-bot/tools/ are the ones a room
 * switches on in its room_config.json.
 */
export function registerMcp(container: Container): void {
  container
    // Read hot, like the prompts: an edit to a tool.json or a guidance applies at once.
    .register(TOOL_DEFINITIONS, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      return liveToolDefinitions(join(c.resolve(PACKAGE_DIR), 'tools'), {
        roomDir: c.resolve(ROOM_DIR),
        log: c.resolve(LOG),
        streamerNames: () => roomConfig().streamerNames,
      });
    })
    .register(TOOLS, (c) => {
      const options = c.resolve(OPTIONS);
      const log = c.resolve(LOG);
      const transcriber = c.resolve(TRANSCRIBER);
      const songId = c.resolve(SONG_ID);
      const room = c.resolve(ROOM);
      const settings = c.resolve(SETTINGS);
      // One clock for every 小心心 (HEART_COOLDOWN_MINUTES), asked for or sent out of happiness.
      const hearts = new HeartGate(c.resolve(ROOM_API).sendHeart, () => room.now());
      // Made once: a tool may hold options. The function is read hot, for the room's declarative tools.
      // The order is the one the help and docs/commands.md list them in.
      const setting = (name: Parameters<typeof settingTool>[0]) =>
        settingTool(name, { settings, log });
      const tools = [
        setting('autoReplyThreshold'),
        setting('autoReplyIntervalSeconds'),
        setting('autoMessageIntervalSeconds'),
        setting('maxReplyParts'),
        setting('thanksThreshold'),
        // What the bot remembers: the room's (admins) and the asker's own note (anyone).
        updateMemoryTool({ memory: c.resolve(MEMORY), log }),
        setting('screenshots'),
        ...(songId && transcriber
          ? [
              identifySongTool({
                songId,
                room,
                maxLength: options.maxReplyLength,
                log,
              }),
            ]
          : []),
        ...(transcriber ? [identifyBgmTool(() => transcriber.identifyMusic(), log)] : []),
        pressLikeTool(c.resolve(ROOM_API).like, log, MAX_LIKES),
        fansLampTool(c.resolve(ROOM_API).sendFansLamp, log),
        heartTool(hearts, log),
        happyHeartTool(hearts, { on: () => settings.get().happyHeart, log }),
        askAboutPuzzleTool({
          ask: c.resolve(ASK_SOLVE),
          settings,
          prompt: c.resolve(PROMPT)('solve'),
          room,
          outbox: c.resolve(OUTBOX),
          userTalk: c.resolve(USER_TALK),
          bus: c.resolve(BUS),
          maxLength: options.maxReplyLength,
          log,
        }),
        // Only where the feature can run: auto song id needs the stream and Codex's song id,
        // malice watch Jev.
        ...(songId && transcriber ? [setting('autoSongId')] : []),
        ...(c.resolve(JUDGE)('malice') ? [setting('maliceWatch')] : []),
        setting('happyHeart'),
      ];
      const roomConfig = c.resolve(ROOM_CONFIG);
      const admins = c.resolve(ADMINS);
      const defined = declarativeTools({
        definitions: c.resolve(TOOL_DEFINITIONS),
        enabled: () => roomConfig().tools,
        // Resolved when used, and the one reference that must stay a closure: the answerer needs
        // the MCP server, which needs these tools (ANSWERER -> MCP_SERVER -> TOOLS -> ANSWERER).
        say: (mention) => c.resolve(ANSWERER).ask(mention),
        room,
        streamer: () => admins.current(),
        builtInNames: () => tools.map((tool) => tool.name),
        log,
      });
      return () => [...tools, ...defined()];
    })
    .register(MCP_SERVER, (c) => {
      return new BotMcpServer({
        tools: c.resolve(TOOLS),
        log: c.resolve(LOG),
        port: c.resolve(OPTIONS).mcpPort,
      });
    });
}
