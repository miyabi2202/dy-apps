import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DefinedTool, Log } from '../../app/ports';
import { errorMessage } from '../../core/errors';
import {
  isInside,
  mentionIn,
  parseToolDefinition,
  streamerNamesIn,
} from '../../core/tools/tool-definition';

export interface ToolFilesOptions {
  /** The room's folder, which `{{file:…}}` and `listen.mentions` read from. */
  roomDir: string;
  log: Log;
  read?: (path: string) => string;
  /** The folder names in `toolsDir`, sorted; the default lists the directory. */
  folders?: (dir: string) => string[];
  /** What viewers call the streamer (room_config.json's `streamerNames`), read on each use. */
  streamerNames?: () => readonly string[];
}

/**
 * The declarative tools in `toolsDir` (src/mcp/tools/), one folder each: its `tool.json` says what
 * the tool is (see parseToolDefinition) and its guidance file, read again on every call, is what
 * Claude gets back, with each `{{file:<path>}}` in it replaced by that file in the room's folder
 * (`{{file:artifacts/songs.txt}}`, the song list, say), each `{{file?:<path>}}` the same but
 * empty, and nothing logged, when the room has no such file (a room's notes), and
 * `{{streamerNames}}` by what viewers call the streamer. The list is read now; a folder that isn't
 * right is logged and left out. The bot knows nothing of what's in them.
 */
export function loadToolDefinitions(
  toolsDir: string,
  {
    roomDir,
    log,
    read = (p) => readFileSync(p, 'utf8'),
    folders = folderNames(log),
    streamerNames = () => [],
  }: ToolFilesOptions,
): DefinedTool[] {
  return folders(toolsDir).flatMap((folder): DefinedTool[] => {
    let text: string;
    try {
      text = read(join(toolsDir, folder, 'tool.json'));
    } catch {
      log.warn('a tool folder has no tool.json', { folder });
      return [];
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      log.warn('tool.json is not JSON', { folder, error: errorMessage(err) });
      return [];
    }
    const definition = parseToolDefinition(json, { folder, streamerNames: streamerNames() });
    if (typeof definition === 'string') {
      log.warn('skipping a tool definition', { folder, error: definition });
      return [];
    }
    const { guidance: file, listen, ...rest } = definition;
    // The last text read, if the file can't be read while it runs.
    let last = '';
    const guidance =
      file === undefined
        ? undefined
        : () => {
            try {
              last = read(join(toolsDir, folder, file));
            } catch (err) {
              log.warn("could not read a tool's guidance", {
                name: definition.name,
                error: errorMessage(err),
              });
            }
            return streamerNamesIn(fillFiles(last, roomDir, { log, read }), streamerNames());
          };
    // Read on each use, so a list the bot downloads after it starts counts; empty when missing.
    const mentions = listen?.mentions;
    const mentioned =
      mentions === undefined
        ? undefined
        : (said: string) => {
            try {
              return mentionIn(said, read(join(roomDir, mentions)));
            } catch {
              return null;
            }
          };
    log.info('tool definition', {
      name: definition.name,
      folder,
      adminOnly: definition.adminOnly === true,
      listen: !!listen,
    });
    return [
      {
        ...rest,
        ...(guidance && { guidance }),
        ...(listen && {
          listen: {
            ...(listen.when !== undefined && { when: listen.when }),
            ...(listen.trigger && { trigger: listen.trigger }),
            ...(mentioned && { mentioned }),
          },
        }),
      },
    ];
  });
}

/** The sub-folders of a directory, sorted; none, with a warning, when it isn't there. */
function folderNames(log: Log): (dir: string) => string[] {
  return (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      log.warn('no tool definitions folder', { dir });
      return [];
    }
  };
}

/**
 * `body` with each `{{file:<path>}}` replaced by that file in `roomDir`; `（读取失败）` for one that
 * can't be read, or isn't inside it. A `{{file?:<path>}}` is the same, but empty, and not warned
 * about, when the file isn't there: a room's notes a tool reads if it has them.
 */
function fillFiles(
  body: string,
  roomDir: string,
  { log, read }: { log: Log; read: (path: string) => string },
): string {
  return body.replace(/\{\{file(\?)?:([^}]+)\}\}/g, (_, optional: string, file: string) => {
    const path = file.trim();
    try {
      if (!isInside(path)) throw new Error('the file must be inside the room folder');
      if (optional && !existsSync(join(roomDir, path))) return '';
      return read(join(roomDir, path)).trim();
    } catch (err) {
      log.warn('could not read a file for a tool', { file: path, error: errorMessage(err) });
      return '（读取失败）';
    }
  });
}

/**
 * The tools as they are now (see loadToolDefinitions), read hot: each call reads every
 * `tool.json` and the streamer's names again, and builds the list again only when one changed, so
 * an edit applies at once and the log has each version once. A `tool.json` that isn't JSON (mid-edit,
 * say) keeps the last good list.
 */
export function liveToolDefinitions(
  toolsDir: string,
  options: ToolFilesOptions,
): () => DefinedTool[] {
  const { log, read = (p) => readFileSync(p, 'utf8'), streamerNames = () => [] } = options;
  const listFolders = options.folders ?? folderNames(log);
  const tryRead = (path: string) => {
    try {
      return read(path);
    } catch {
      return null;
    }
  };
  let seen: string | null = null;
  let tools: DefinedTool[] = [];
  // What each folder's tool.json said when the list was last built, and the broken text last warned of.
  let built = new Map<string, string | null>();
  let warned: string | null = null;
  return () => {
    const texts = new Map(
      listFolders(toolsDir).map((folder) => [folder, tryRead(join(toolsDir, folder, 'tool.json'))]),
    );
    const key = JSON.stringify([[...texts], streamerNames()]);
    if (key === seen) return tools;
    // A tool.json that was fine before and isn't JSON now: keep what worked until it's fixed.
    const broken = [...texts].find(([folder, text]) => {
      if (text === null || text === built.get(folder) || seen === null) return false;
      try {
        JSON.parse(text);
        return false;
      } catch {
        return true;
      }
    });
    if (broken) {
      const [folder, text] = broken;
      if (text !== warned) {
        warned = text;
        log.warn('tool.json is not JSON, keeping the last tools', { folder });
      }
      return tools;
    }
    seen = key;
    built = texts;
    tools = loadToolDefinitions(toolsDir, { ...options, read, folders: () => [...texts.keys()] });
    return tools;
  };
}
