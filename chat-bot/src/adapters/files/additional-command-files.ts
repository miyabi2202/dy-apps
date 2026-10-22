import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdditionalCommand, Log } from '../../app/ports';
import {
  isInside,
  mentionIn,
  parseCommandIndex,
  streamerNamesIn,
} from '../../core/commands/additional-command';
import { errorMessage } from '../../core/errors';

/**
 * The room's own commands, as `<roomDir>/additional_commands/index.json` lists them (none when it's
 * missing), each with its own folder there for its prompt and whatever else it needs (a download's
 * transformer, say). One with a `base` builds on the shared command in `commandsDir/<base>/`: its
 * `command.json` has the fields, and its `prompt` is in that folder unless the room names its own.
 * The list is read now; a command that isn't right is logged and left out. Each prompt is read
 * again on every use, with each `{{file:<path>}}` in it replaced by that file in the room's folder
 * (`{{file:artifacts/songs.txt}}`, the song list, say), read then too, each `{{file?:<path>}}` the
 * same but empty, and nothing logged, when the room has no such file, and `{{streamerNames}}` by
 * what viewers call the streamer then. The bot knows nothing of what's in them.
 */
export function loadAdditionalCommands(
  roomDir: string,
  {
    log,
    read = (p) => readFileSync(p, 'utf8'),
    commandsDir,
    streamerNames = () => [],
  }: {
    log: Log;
    read?: (path: string) => string;
    /** The shared commands' folder (chat-bot/prompts/commands/); none to share when missing. */
    commandsDir?: string;
    /** What viewers call the streamer (room_config.json's `streamerNames`), read on each use. */
    streamerNames?: () => readonly string[];
  },
): AdditionalCommand[] {
  const dir = join(roomDir, 'additional_commands');
  let text: string;
  try {
    text = read(join(dir, 'index.json'));
  } catch {
    return [];
  }
  let index: unknown;
  try {
    index = JSON.parse(text);
  } catch (err) {
    log.warn('additional_commands/index.json is not JSON, no commands', {
      error: errorMessage(err),
    });
    return [];
  }
  const shared = (base: string): unknown => {
    if (commandsDir === undefined) return undefined;
    try {
      return JSON.parse(read(join(commandsDir, base, 'command.json')));
    } catch {
      return undefined;
    }
  };
  const { commands, errors } = parseCommandIndex(index, {
    shared,
    streamerNames: streamerNames(),
  });
  for (const error of errors) log.warn('skipping an additional command', { error });
  return commands.map(({ id, name, when, trigger, prompt: file, price, mentions, ...rest }) => {
    const { base, sharedPrompt, ...flags } = rest;
    const path =
      file === undefined
        ? undefined
        : sharedPrompt && commandsDir !== undefined && base !== undefined
          ? join(commandsDir, base, file)
          : join(dir, file);
    // The last prompt read, if the file can't be read while it runs.
    let last = '';
    const prompt = () => {
      if (path === undefined) return '';
      try {
        last = read(path);
      } catch (err) {
        log.warn('could not read an additional command prompt', { id, error: errorMessage(err) });
      }
      return streamerNamesIn(withFiles(last, roomDir, { log, read }), streamerNames());
    };
    // Read on each use, so a list the bot downloads after it starts counts; empty when missing.
    const mentioned = mentions
      ? (text: string) => {
          try {
            return mentionIn(text, read(join(roomDir, mentions)));
          } catch {
            return null;
          }
        }
      : undefined;
    log.info('additional command', { id, name, base, price, mentions, ...flags });
    return {
      id,
      name,
      when,
      trigger,
      prompt,
      ...(price !== undefined && { price }),
      ...(mentioned && { mentioned }),
      ...flags,
    };
  });
}

/**
 * `body` with each `{{file:<path>}}` replaced by that file in `roomDir`; `（读取失败）` for one that
 * can't be read, or isn't inside it. A `{{file?:<path>}}` is the same, but empty, and not warned
 * about, when the file isn't there: a room's notes a shared prompt reads if it has them.
 */
function withFiles(
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
      log.warn('could not read a file for an additional command', {
        file: path,
        error: errorMessage(err),
      });
      return '（读取失败）';
    }
  });
}

/**
 * The room's own commands as they are now (see loadAdditionalCommands), read hot: each call reads
 * `index.json`, the shared `command.json`s it names and the streamer's names again, and builds the
 * list again only when one of them changed, so an edit applies at once and the log has each
 * version once. An `index.json` that isn't JSON (mid-edit, say) keeps the last good list.
 */
export function liveAdditionalCommands(
  roomDir: string,
  options: Parameters<typeof loadAdditionalCommands>[1],
): () => AdditionalCommand[] {
  const { log, read = (p) => readFileSync(p, 'utf8'), commandsDir } = options;
  const streamerNames = options.streamerNames ?? (() => []);
  const tryRead = (path: string) => {
    try {
      return read(path);
    } catch {
      return null;
    }
  };
  let seen: string | null = null;
  let commands: AdditionalCommand[] = [];
  return () => {
    const index = tryRead(join(roomDir, 'additional_commands', 'index.json'));
    let parsed: unknown = null;
    if (index !== null) {
      try {
        parsed = JSON.parse(index);
      } catch (err) {
        if (index !== seen) {
          seen = index;
          log.warn('additional_commands/index.json is not JSON, keeping the last commands', {
            error: errorMessage(err),
          });
        }
        return commands;
      }
    }
    const bases =
      typeof parsed === 'object' && parsed !== null
        ? Object.values(parsed as Record<string, unknown>).map((fields) =>
            typeof fields === 'object' && fields !== null
              ? (fields as { base?: unknown }).base
              : undefined,
          )
        : [];
    const shared = [...new Set(bases.filter((base): base is string => typeof base === 'string'))]
      .sort()
      .map((base) =>
        commandsDir === undefined || !/^[\w-]+$/.test(base)
          ? null
          : tryRead(join(commandsDir, base, 'command.json')),
      );
    const key = JSON.stringify([index, shared, streamerNames()]);
    if (key !== seen) {
      seen = key;
      commands = index === null ? [] : loadAdditionalCommands(roomDir, { ...options, read });
    }
    return commands;
  };
}
