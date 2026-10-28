import type { Mention } from '../app/replies/mention-answerer';
import type { BotTool, DefinedTool, Log } from '../app/ports';
import type { RoomState } from '../app/room/room-state';
import { appliesTo } from '../core/tools/tool-definition';

export interface DeclarativeToolsOptions {
  /** The definitions in src/mcp/tools/ as they are now (see liveToolDefinitions). */
  definitions: () => readonly DefinedTool[];
  /** The names the room switched on (room_config.json's `tools`), read on each use. */
  enabled: () => readonly string[];
  /** Sends a fixed reply to the asker like an answer (the answerer's own way: talk record, `answered`); resolved when used (the answerer is made after the tools). */
  say: (mention: Mention) => void;
  room: Pick<RoomState, 'recentChat'>;
  /** The streamer once known, whose fan club a `fansLevel` counts. */
  streamer: () => { uid: string } | null;
  /** The names of the bot's own tools, which a definition can't take. */
  builtInNames: () => readonly string[];
  log: Log;
}

/**
 * The declarative tools the room switched on, one per name in its list that has a definition,
 * built again when the list or the definitions change. A guidance tool hands Claude its guidance
 * with the room's data filled in, and Claude answers from it in the same turn; a fixed-reply tool
 * sends its text and tells Claude `sent`; one whose `only` / `except` leave the asker out is
 * `skipped`.
 */
export function declarativeTools(options: DeclarativeToolsOptions): () => BotTool[] {
  let built: { definitions: readonly DefinedTool[]; enabled: string; tools: BotTool[] } | undefined;
  return () => {
    const definitions = options.definitions();
    const enabled = options.enabled().join(',');
    // The loader hands back the same array until a file changes, so the tools stay as they are.
    if (built?.definitions !== definitions || built.enabled !== enabled) {
      built = { definitions, enabled, tools: build(definitions, options) };
    }
    return built.tools;
  };
}

/** One tool for each name the room lists that has a definition and whose name is free; the others are warned about. */
function build(definitions: readonly DefinedTool[], options: DeclarativeToolsOptions): BotTool[] {
  const { log } = options;
  const taken = new Set(options.builtInNames());
  const tools: BotTool[] = [];
  for (const name of options.enabled()) {
    const definition = definitions.find((candidate) => candidate.name === name);
    if (!definition) {
      log.warn('room_config.json lists a tool there is no definition for', { name });
      continue;
    }
    if (taken.has(name)) {
      if (tools.some((tool) => tool.name === name)) continue;
      log.warn('skipping a tool: its name is a built-in tool’s', { name });
      continue;
    }
    taken.add(name);
    tools.push(declarativeTool(definition, options));
  }
  return tools;
}

function declarativeTool(definition: DefinedTool, options: DeclarativeToolsOptions): BotTool {
  const { say, room, streamer, log } = options;
  const { name, fixedReply, guidance, adminOnly, listen } = definition;
  return {
    name,
    description: `${definition.description}${adminOnly ? '（只有主播和机器人管理员问时才有）' : ''}`,
    // It works from what the asker said, which Claude has.
    inputSchema: { type: 'object', properties: {} },
    adminOnly,
    listen,
    call(_args, { asker, userId, question, admin, viewer }) {
      const who = viewer ?? { admin: admin === true };
      if (!appliesTo(definition, who, streamer()?.uid)) {
        log.info('skipped by user filter', { name, asker, userId });
        return Promise.resolve({ text: JSON.stringify({ skipped: true, why: 'user filter' }) });
      }
      if (fixedReply !== undefined) {
        log.info('fixed reply', { name, asker });
        say({ asker, userId, question, history: room.recentChat(), fixedReply });
        return Promise.resolve({ text: JSON.stringify({ sent: true }) });
      }
      log.info('tool guidance', { name, asker, userId });
      const text = guidance?.() ?? '';
      // Plain text: the guidance is written for Claude to read.
      return Promise.resolve(
        text.trim() ? { text } : { text: '这个工具的说明读不到，照常回答', isError: true },
      );
    },
  };
}
