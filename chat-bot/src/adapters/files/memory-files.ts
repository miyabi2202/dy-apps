import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Memory } from '../../app/ports';
import { writeTextAtomic } from './atomic-file';
import { folderOf } from './room-talk-files';

/**
 * What the bot remembers in the room in `dir` (`data/<房间号>/`): the room's in `memory.md`, and
 * each person's in `<user id>/note.md`, next to their talk.txt. Read on every use, so a hand edit
 * applies at once; a file that isn't there yet reads as empty.
 */
export function memoryFiles(
  dir: string,
  {
    read = (path) => readFileSync(path, 'utf8'),
    write = writeTextAtomic,
  }: { read?: (path: string) => string; write?: (path: string, text: string) => void } = {},
): Memory {
  const roomFile = join(dir, 'memory.md');
  const noteFile = (userId: string) => join(dir, folderOf(userId), 'note.md');
  const readOrEmpty = (path: string) => {
    try {
      return read(path);
    } catch {
      return '';
    }
  };
  return {
    room: () => readOrEmpty(roomFile),
    setRoom: (text) => write(roomFile, text),
    note: (userId) => readOrEmpty(noteFile(userId)),
    setNote: (userId, text) => write(noteFile(userId), text),
  };
}
