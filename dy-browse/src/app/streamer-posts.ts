import { fallbackLine, postsPrompt } from '../core/prompts';
import { dateOf, jsonFrom } from '../core/text';
import type { BrowseItem, ReadItem } from '../core/types';
import type { AskClaude, DataStore, Log } from './ports';
import type { ItemReader } from './video-reader';
import type { UserPostsPort } from './user-posts';

/** What was read of the streamer's posts so far, in `streamer/<房间号>/mark.json`. */
export interface PostsMark {
  /** The newest post time (ms) read: what's newer than this is "new since last run". */
  newestAt: number;
  readIds: string[];
}

export interface StreamerPostsOptions {
  posts: UserPostsPort;
  /** dy-browse's own data: the mark of what was read. */
  data: DataStore;
  /** The chat bot's `data/`, where `<房间号>/memory/posts.md` goes for the bot to read. */
  bot: DataStore;
  ask: AskClaude;
  log: Log;
  /** Tiers 1–2 for each post read (speech and OCR); none to stop at the text. */
  reader?: ItemReader | null;
  /** How many older posts a run reads beside the new ones. */
  olderPerRun?: number;
  /** The most new posts a run reads. */
  maxNew?: number;
}

export interface StreamerPostsResult {
  new: number;
  older: number;
  file: string;
}

/**
 * The streamer's own posts: the ones since the last run first, then a few older ones each time.
 * Every post gets its comments (tier 0) and, with a reader, its speech and picture text; one
 * Claude call turns them into a line each, appended to `streamer/<房间号>/posts.md`.
 */
export class StreamerPosts {
  private readonly olderPerRun: number;
  private readonly maxNew: number;

  constructor(private readonly options: StreamerPostsOptions) {
    this.olderPerRun = options.olderPerRun ?? 3;
    this.maxNew = options.maxNew ?? 10;
  }

  async run(roomId: string, secUid: string): Promise<StreamerPostsResult> {
    const { posts, data, bot, ask, log, reader } = this.options;
    const dir = `streamer/${roomId}`;
    const postsFile = `${roomId}/memory/posts.md`;
    const mark = readMark(data.read(`${dir}/mark.json`));
    const read = new Set(mark?.readIds ?? []);
    const pick = (list: readonly BrowseItem[]) =>
      select(list, mark, read, this.olderPerRun, this.maxNew);
    const listed = await posts.list(secUid, (list) => {
      const { fresh, older } = pick(list);
      const reachedKnown = list.some((p) => read.has(p.id));
      const enough = mark
        ? reachedKnown && older.length >= this.olderPerRun
        : older.length >= this.olderPerRun;
      return enough || fresh.length >= this.maxNew;
    });
    const { fresh, older } = pick(listed);
    const chosen = [...fresh, ...older];
    log(`posts read {new: ${fresh.length}, older: ${older.length}}`);
    if (!chosen.length) return { new: 0, older: 0, file: postsFile };

    const readItems: ReadItem[] = [];
    for (const item of chosen) {
      const comments = await posts.commentsAt(listed.indexOf(item));
      const material = reader ? await reader.read(item) : null;
      readItems.push({ item, comments, material });
    }
    const lines = await this.lines(ask, readItems);
    const file = postsFile;
    const existing = bot.read(file) ?? '';
    const fresher = chosen.filter((item) => !existing.includes(`[id:${item.id}]`));
    const header = existing ? '' : `# ${roomId} 主播的作品\n\n`;
    bot.write(
      file,
      existing +
        header +
        fresher
          .map(
            (item) =>
              `- ${item.postedAt ? dateOf(item.postedAt) : '日期不详'}：${lines.get(item.id) ?? fallbackLine(item)} [id:${item.id}]\n`,
          )
          .join(''),
    );
    const readIds = [...read, ...chosen.map((p) => p.id)];
    const newestAt = Math.max(mark?.newestAt ?? 0, ...chosen.map((p) => p.postedAt ?? 0));
    data.write(
      `${dir}/mark.json`,
      JSON.stringify({ newestAt, readIds } satisfies PostsMark, null, 2),
    );
    return { new: fresh.length, older: older.length, file };
  }

  private async lines(ask: AskClaude, items: readonly ReadItem[]): Promise<Map<string, string>> {
    const answer = jsonFrom(await ask(postsPrompt(items)));
    const lines = new Map<string, string>();
    for (const entry of Array.isArray(answer) ? (answer as unknown[]) : []) {
      const { id, line } = (entry ?? {}) as { id?: unknown; line?: unknown };
      if (typeof id === 'string' && typeof line === 'string' && line.trim()) {
        lines.set(id, line.trim().replace(/\s+/g, ' '));
      }
    }
    return lines;
  }
}

/**
 * The posts to read: new ones (unread, newer than the newest read, newest first, up to `maxNew`),
 * then up to `olderPerRun` older unread ones, newest first. Before any run, nothing is new: the
 * newest few are the first "older".
 */
export function select(
  list: readonly BrowseItem[],
  mark: PostsMark | null,
  read: ReadonlySet<string>,
  olderPerRun: number,
  maxNew: number,
): { fresh: BrowseItem[]; older: BrowseItem[] } {
  const unread = list
    .filter((post) => !read.has(post.id))
    .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));
  const isNew = (post: BrowseItem) => !!mark && (post.postedAt ?? 0) > mark.newestAt;
  return {
    fresh: unread.filter(isNew).slice(0, maxNew),
    older: unread.filter((post) => !isNew(post)).slice(0, olderPerRun),
  };
}

function readMark(text: string | null): PostsMark | null {
  if (!text) return null;
  try {
    const mark = JSON.parse(text) as Partial<PostsMark>;
    return { newestAt: mark.newestAt ?? 0, readIds: mark.readIds ?? [] };
  } catch {
    return null;
  }
}
