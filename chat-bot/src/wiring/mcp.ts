import { join } from 'node:path';
import { liveToolDefinitions } from '../adapters/files/tool-files';
import { askAboutPuzzleTool } from '../mcp/ask-about-puzzle';
import { declarativeTools } from '../mcp/declarative-tools';
import { identifyBgmTool } from '../mcp/identify-bgm';
import { identifySongTool } from '../mcp/identify-song';
import { BotMcpServer } from '../mcp/server';
import { numberTool, onOffTool } from '../mcp/setting-tools';
import { setThanksThresholdTool } from '../mcp/set-thanks-threshold';
import { updateMemoryTool } from '../mcp/update-memory';
import type { Container } from './container';
import {
  ADMINS,
  ANSWERER,
  ASK_SOLVE,
  AUTO_REPLY,
  AUTO_SONG_ID,
  BUS,
  LOG,
  MALICE_WATCH,
  MEMORY,
  MCP_SERVER,
  OPTIONS,
  OUTBOX,
  PACKAGE_DIR,
  PROMPT,
  ROOM,
  ROOM_CONFIG,
  ROOM_DIR,
  SETTINGS,
  SONG_ID,
  THANKER,
  TOOL_DEFINITIONS,
  TOOLS,
  TRANSCRIBER,
  USER_TALK,
} from './tokens';

/**
 * The bot's tools (src/mcp/): what it can do, for Claude when someone @s it and for a typed `/`
 * command alike, and the MCP server in this process that gives them to Claude. Each needs what
 * its feature needs (listening to the stream; Codex for the song), and an admin-only one is
 * offered only when an admin asks. The server is always on: without it Claude could not act on
 * anything said in words, so a server that can't start stops the bot at start. The declarative tools in src/mcp/tools/ are the ones a room
 * switches on in its room_config.json.
 */
export function registerMcp(container: Container): void {
  container
    // Read hot, like the prompts: an edit to a tool.json or a guidance applies at once.
    .register(TOOL_DEFINITIONS, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      return liveToolDefinitions(join(c.resolve(PACKAGE_DIR), 'src', 'mcp', 'tools'), {
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
      const autoReply = c.resolve(AUTO_REPLY);
      const autoSongId = c.resolve(AUTO_SONG_ID);
      const maliceWatch = c.resolve(MALICE_WATCH);
      // Made once: a tool may hold options. The function is read hot, for the room's declarative tools.
      // The order is the one the help and docs/commands.md list them in.
      const tools = [
        numberTool({
          name: 'set_auto_reply_threshold',
          command: '自动回复阈值',
          description:
            '改自动回复的阈值：观众或主播说到机器人、跟它说话时，Jev 判断的把握到这个数就主动接一句，0 到 1，1 以上关闭。有人要开、关自动回复或改阈值时调用（「把自动回复打开」填 0.6）。',
          arg: { name: 'threshold', description: '0 到 1 的小数；1 以上关闭自动回复' },
          min: 0,
          usage: '阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6',
          get: () => autoReply.threshold,
          set: (threshold) => (autoReply.threshold = threshold),
          log,
        }),
        numberTool({
          name: 'set_auto_reply_interval',
          command: '自动回复间隔',
          description: '改自动回复的间隔：主动接过一句后安静多少秒，0 不等。',
          arg: { name: 'seconds', description: '秒数；0 不等' },
          integer: true,
          min: 0,
          usage: '间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20',
          get: () => autoReply.quietMs / 1000,
          set: (seconds) => (autoReply.quietMs = seconds * 1000),
          log,
        }),
        numberTool({
          name: 'set_max_reply_parts',
          command: '最大回复条数',
          description: '改一条回答最多拆成几条弹幕（1 到 10）。',
          arg: { name: 'parts', description: '条数，1 到 10' },
          integer: true,
          min: 1,
          max: 10,
          usage: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3',
          get: () => room.maxReplyParts,
          set: (parts) => (room.maxReplyParts = parts),
          log,
        }),
        setThanksThresholdTool(c.resolve(THANKER), log),
        // What the bot remembers: the room's (admins) and the asker's own note (anyone).
        updateMemoryTool({
          memory: c.resolve(MEMORY),
          streamerId: () =>
            c.resolve(ADMINS).current()?.uid ?? c.resolve(ROOM_CONFIG)().streamer?.uid,
          isPrivate: () => c.resolve(ROOM_CONFIG)().private,
          log,
        }),
        onOffTool({
          name: 'set_screenshots',
          command: '截图',
          description:
            '开关直播画面截图：开着时每个问题都带一张截图给你看。有人要你看画面、看题、看板书，或要关掉时调用。',
          get: () => room.screenshots,
          set: (on) => (room.screenshots = on),
          log,
        }),
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
        askAboutPuzzleTool({
          ask: c.resolve(ASK_SOLVE),
          settings: c.resolve(SETTINGS),
          prompt: c.resolve(PROMPT)('solve'),
          room,
          outbox: c.resolve(OUTBOX),
          userTalk: c.resolve(USER_TALK),
          bus: c.resolve(BUS),
          maxLength: options.maxReplyLength,
          log,
        }),
        ...(autoSongId
          ? [
              onOffTool({
                name: 'set_auto_song_id',
                command: '自动识歌',
                description: '开关自动识歌：开着时主播唱歌，机器人自己认出是什么歌并说出来。',
                get: () => autoSongId.on,
                set: (on) => (autoSongId.on = on),
                log,
              }),
            ]
          : []),
        ...(maliceWatch
          ? [
              onOffTool({
                name: 'set_malice_watch',
                command: '识别恶意言论',
                description: '开关恶意言论识别：开着时 @ 发恶意弹幕的观众。',
                get: () => maliceWatch.on,
                set: (on) => (maliceWatch.on = on),
                log,
              }),
            ]
          : []),
      ];
      const roomConfig = c.resolve(ROOM_CONFIG);
      const defined = declarativeTools({
        definitions: c.resolve(TOOL_DEFINITIONS),
        enabled: () => roomConfig().tools,
        // Resolved when used: the answerer needs the MCP server, which needs these tools.
        say: (mention) => c.resolve(ANSWERER).ask(mention),
        room,
        streamer: () => c.resolve(ADMINS).current(),
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
