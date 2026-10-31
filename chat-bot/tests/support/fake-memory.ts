import { fileMemory, type FileMemoryOptions } from '@dy-apps/room-memory';

/** Where the room's memory.md is in a fake memory's files. */
export const ROOM_FILE = '/room/memory.md';

/** Where the room's archive of changed and removed entries is in a fake memory's files. */
export const ARCHIVE_FILE = '/room/memory/archive.md';

/** Where the room's summaries of streams are in a fake memory's files. */
export const STREAMS_FILE = '/room/memory/streams.md';

/** Where one person's note.md is in a fake memory's files. */
export function noteFile(userId: string): string {
  return `/room/${userId}/note.md`;
}

/**
 * The real room memory over files kept in a Map (path to text), in a room whose streamer is `s-1`
 * unless `options` say otherwise: put text in `files` to start with, read it back to see what was
 * written.
 */
export function fakeMemory(
  files: Record<string, string> = {},
  options: Partial<FileMemoryOptions> = {},
) {
  const store = new Map(Object.entries(files));
  const memory = fileMemory('/room', {
    read: (path) => {
      const text = store.get(path);
      if (text === undefined) throw new Error(`no ${path}`);
      return text;
    },
    write: (path, text) => void store.set(path, text),
    append: (path, text) => void store.set(path, (store.get(path) ?? '') + text),
    today: () => '2026-10-31',
    folderOf: (userId) => userId,
    streamerId: () => 's-1',
    isPrivate: () => false,
    ...options,
  });
  return { memory, store };
}
