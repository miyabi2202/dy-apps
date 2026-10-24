/** A song the transcription worker named from the stream's audio. */
export interface MusicMatch {
  title: string;
  artist: string;
}

/** The worker's answer to a music request: the song, null when nothing matched, or an error. */
export interface MusicAnswer {
  id: number;
  match: MusicMatch | null;
  error?: string;
}

/** The line asking the worker what music is playing, answered under `id`. */
export function musicRequest(id: number): string {
  return JSON.stringify({ music_id: id });
}

/** A line of the worker's output as a music answer, or null when it isn't one. */
export function parseMusicLine(text: string): MusicAnswer | null {
  try {
    return musicAnswerFrom(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A parsed line of the worker's output as a music answer, or null when it isn't one. */
export function musicAnswerFrom(json: unknown): MusicAnswer | null {
  const line = json as { music_id?: unknown; title?: unknown; artist?: unknown; error?: unknown };
  if (typeof line?.music_id !== 'number') return null;
  const { music_id: id, title, artist, error } = line;
  if (typeof error === 'string') return { id, match: null, error };
  return {
    id,
    match:
      typeof title === 'string' && title
        ? { title, artist: typeof artist === 'string' ? artist : '' }
        : null,
  };
}
