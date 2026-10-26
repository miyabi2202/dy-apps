import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Log } from '../../app/ports';
import { errorMessage } from '../../core/errors';
import { composePersona, parsePersonaFile } from '../../core/prompts/persona';
import { wordingOf, type Wording } from '../../core/prompts/wording';

/**
 * The prompt files in chat-bot/prompts/, by what they're for. A room overrides one with a file of the same
 * name in its folder, with `_` for `-`: `song-id.md` by `song_id.md`.
 */
export const PROMPT_FILES = {
  mention: 'prompt.md',
  replyPick: 'reply-pick.md',
  songId: 'song-id.md',
  giftThanks: 'gift-thanks.md',
  songIntro: 'song-intro.md',
  autoMessage: 'auto-message.md',
  solve: 'solve.md',
  malice: 'malice.md',
  rememberNotes: 'remember-notes.md',
  rememberRoom: 'remember-room.md',
} as const;

export type PromptName = keyof typeof PROMPT_FILES;

/**
 * The prompt `name`, read on every call so edits apply at once: the room's own file in `roomDir`
 * when there is one, else the shared one in `promptsDir` (or `sharedPath`, for a prompt the command
 * line points elsewhere). Without `roomDir` the prompt has no room override. The shared file is read
 * once now, so a missing one stops the bot at start; it's also the text used if the shared file
 * can't be read later.
 */
export function livePrompt(
  name: PromptName,
  {
    promptsDir,
    roomDir,
    sharedPath,
  }: { promptsDir: string; roomDir?: string; sharedPath?: string },
): () => string {
  const file = PROMPT_FILES[name];
  const shared = sharedPath ?? join(promptsDir, file);
  const first = readFileSync(shared, 'utf8');
  const sharedText = liveText(shared, () => first);
  if (!roomDir) return sharedText;
  return liveText(join(roomDir, file.replaceAll('-', '_')), sharedText);
}

/**
 * Reads `path` each time it's called, so edits apply at once; `fallback` when it can't be read
 * (deleted, say).
 */
export function liveText(path: string, fallback: () => string = () => ''): () => string {
  return () => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return fallback();
    }
  };
}

/**
 * Who the bot plays in the room, read on every call so edits apply at once: the file `file()` names
 * in `roomDir` (room_config.json's `persona`), after its header (see parsePersonaFile), or, when it
 * names none, the shared `sharedDir/default.md` as it is (none if that's missing). With a
 * `base` there, the file is changes to `sharedDir/<base>.md` (see composePersona); either way its
 * `{{…}}`s are filled in from the header. A file or shared persona that can't be read, a header line
 * that can't, and a `{{…}}` with no value are each warned about once: the bot then plays what's left
 * (nothing, the room's changes alone, the blank as it is).
 */
export function livePersona({
  roomDir,
  sharedDir,
  file,
  log,
}: {
  roomDir: string;
  sharedDir: string;
  file: () => string | undefined;
  log: Log;
}): () => string {
  const defaultPersona = liveText(join(sharedDir, 'default.md'));
  const warned = new Set<string>();
  const warnOnce = (message: string, fields: Record<string, unknown>) => {
    const key = `${message} ${JSON.stringify(fields)}`;
    if (warned.has(key)) return;
    warned.add(key);
    log.warn(message, fields);
  };
  const read = (path: string, problem: string): string | null => {
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      warnOnce(problem, { path, error: errorMessage(err) });
      return null;
    }
  };
  return () => {
    const name = file();
    if (!name) return defaultPersona().trim();
    const text = read(join(roomDir, name), 'could not read the persona file, playing no persona');
    if (text === null) return '';
    const { base, vars, body, problems } = parsePersonaFile(text);
    if (problems.length) {
      warnOnce('the persona file has header lines it could not read', { file: name, problems });
    }
    const shared =
      base === undefined
        ? null
        : read(
            join(sharedDir, `${base}.md`),
            "could not read the shared persona, using the room's changes alone",
          );
    const composed = composePersona({ shared, room: body, vars });
    if (composed.missing.length) {
      warnOnce('the persona has {{…}}s with no value in its header', {
        file: name,
        missing: composed.missing,
      });
    }
    return composed.text;
  };
}

/**
 * The wording in `path` (wording.md), read on every use like a prompt so edits apply at once. The
 * file is read once now, so a missing one stops the bot at start; it's also the text used if it
 * can't be read later.
 */
export function liveWording(path: string): Wording {
  const first = readFileSync(path, 'utf8');
  return wordingOf(liveText(path, () => first));
}
