import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LyricsSearch } from '@dy-apps/lyrics-search';
import { RoomFeedClient } from '@dy-apps/room-feed-protocol';
import { connectWorker } from '../adapters/asr-worker';
import { claudeCli } from '../adapters/models/claude-cli';
import { codexCli } from '../adapters/models/codex-cli';
import { roomFeedEvents } from '../adapters/room-feed/room-feed-events';
import { RoomFeedApi } from '../adapters/room-feed/room-feed-api';
import { jev } from '../adapters/models/jev';
import { readDownloads, runDownloads } from '../adapters/files/room-downloads';
import { jsonFileStorage } from '../adapters/files/wallet-file';
import type { Container } from './container';
import {
  CHAT_DIR,
  CLAUDE_CLI,
  CODEX_CLI,
  DOWNLOADS,
  JEV_CLIENT,
  LOG,
  LYRICS_SEARCH,
  OPTIONS,
  PACKAGE_DIR,
  ROOM_API,
  ROOM_CONFIG,
  ROOM_DIR,
  ROOM_EVENTS,
  ROOM_FILES,
  SPAWN_WORKER,
  WALLET_STORAGE,
} from './tokens';

/**
 * Registers the real outside world: room-feed, `claude` and `codex`, Jev, the speech worker and the
 * room's files. Register fakes for these tokens after it, to build the bot without any of that.
 */
export function registerAdapters(container: Container): void {
  container
    .register(ROOM_API, (c) => new RoomFeedApi(c.resolve(OPTIONS).port, c.resolve(OPTIONS).roomId))
    .register(ROOM_EVENTS, (c) => {
      const { port, roomId } = c.resolve(OPTIONS);
      const roomConfig = c.resolve(ROOM_CONFIG);
      return roomFeedEvents(
        new RoomFeedClient({ port, roomId, retryMs: 5000 }),
        () => roomConfig().private,
      );
    })
    // The speech service, started by hand before the bot, keeps its models loaded across restarts
    // of the bot: connect to it.
    .register(SPAWN_WORKER, (c) => connectWorker({ port: c.resolve(OPTIONS).asrPort }))
    .register(WALLET_STORAGE, (c) => jsonFileStorage(join(c.resolve(ROOM_DIR), 'wallet.json')))
    .register(CLAUDE_CLI, (c) => {
      const options = c.resolve(OPTIONS);
      // An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
      return claudeCli({
        cwd: tmpdir(),
        tools: options.tools,
        readDirs: [c.resolve(CHAT_DIR)],
        model: options.model,
        systemPrompt: options.systemPrompt,
        // Zooming into a screenshot can make an answer take a minute or two.
        timeoutMs: 240_000,
        zoom: zoomServer(c.resolve(PACKAGE_DIR)),
      });
    })
    .register(CODEX_CLI, (c) => {
      const options = c.resolve(OPTIONS);
      // Codex reads its working directory, so it gets an empty one.
      let emptyDir: string | undefined;
      return (over) =>
        codexCli({
          cwd: (emptyDir ??= mkdtempSync(join(tmpdir(), 'chat-bot-agent-'))),
          systemPrompt: options.systemPrompt,
          model: options.codex,
          effort: 'medium',
          ...over,
        });
    })
    // NetEase's lyrics search names a song in about a second; Codex only when it isn't sure.
    .register(LYRICS_SEARCH, (c) => {
      if (!c.resolve(OPTIONS).lyricsSearch) return null;
      const search = new LyricsSearch();
      return (lines) => search.identify(lines);
    })
    .register(JEV_CLIENT, () => (apiKey) => jev({ apiKey }))
    // Each download goes through its transformer script, if it has one; a slow or failed one
    // doesn't hold up the bot.
    .register(DOWNLOADS, (c) => {
      const log = c.resolve(LOG);
      return () =>
        void runDownloads(
          readDownloads(c.resolve(ROOM_FILES).config, { log }),
          c.resolve(ROOM_DIR),
          {
            log,
          },
        );
    });
}

/**
 * With a screenshot, Claude and Codex may zoom into part of it to read small figures and text
 * (src/adapters/models/zoom-mcp.ts, an MCP server cropping with ffmpeg).
 */
export function zoomServer(packageDir: string) {
  return {
    command: join(packageDir, 'node_modules', '.bin', 'tsx'),
    args: [join(packageDir, 'src', 'adapters', 'models', 'zoom-mcp.ts')],
  };
}
