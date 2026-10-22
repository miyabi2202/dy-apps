import 云裳羽衣曲 from './fixtures/云裳羽衣曲.json';
import 南屏晚钟 from './fixtures/南屏晚钟.json';
import 晴天 from './fixtures/晴天.json';
import 雨爱 from './fixtures/雨爱.json';

/** Real NetEase responses, one per song: its lines, and the raw response for each query. */
export interface Recording {
  lines: string[];
  responses: Record<string, unknown>;
}

const RECORDINGS: Record<string, Recording> = { 云裳羽衣曲, 南屏晚钟, 晴天, 雨爱 };

export function recorded(name: string): Recording {
  const recording = RECORDINGS[name];
  if (!recording) throw new Error(`no recording of ${name}`);
  return recording;
}

/** A fetch that answers each query from a recording; a query it doesn't have is an HTTP 500. */
export function recordedFetch(
  recording: Recording,
  onCall?: (query: string) => void,
): typeof fetch {
  return (async (url: string) => {
    const query = new URL(url).searchParams.get('s') ?? '';
    onCall?.(query);
    const body = recording.responses[query];
    return body === undefined
      ? new Response('', { status: 500 })
      : new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
}
