import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdditionalCommand, Log } from '../app/ports';
import { isInside, mentionIn, parseCommandIndex } from '../core/additional-command';
import { errorMessage } from '../core/errors';

/**
 * The room's own commands, as `<roomDir>/additional_commands/index.json` lists them (none when it's
 * missing), each with its own folder there for its prompt and whatever else it needs (a download's
 * transformer, say). The list is read now; a command that isn't right is logged and left out. Each
 * prompt is read again on every use, with each `{{file:<path>}}` in it replaced by that file in
 * the room's folder (`{{file:artifacts/songs.txt}}`, the song list, say), read then too. The bot
 * knows nothing of what's in them.
 */
export function loadAdditionalCommands(
  roomDir: string,
  { log, read = (p) => readFileSync(p, 'utf8') }: { log: Log; read?: (path: string) => string },
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
  const { commands, errors } = parseCommandIndex(index);
  for (const error of errors) log.warn('skipping an additional command', { error });
  return commands.map(({ id, name, when, trigger, prompt: file, price, mentions, ...flags }) => {
    const path = join(dir, file);
    // The last prompt read, if the file can't be read while it runs.
    let last = '';
    const prompt = () => {
      try {
        last = read(path);
      } catch (err) {
        log.warn('could not read an additional command prompt', { id, error: errorMessage(err) });
      }
      return withFiles(last, roomDir, { log, read });
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
    log.info('additional command', { id, name, price, mentions, ...flags });
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
 * can't be read, or isn't inside it.
 */
function withFiles(
  body: string,
  roomDir: string,
  { log, read }: { log: Log; read: (path: string) => string },
): string {
  return body.replace(/\{\{file:([^}]+)\}\}/g, (_, file: string) => {
    const path = file.trim();
    try {
      if (!isInside(path)) throw new Error('the file must be inside the room folder');
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
