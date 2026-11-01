import { countTrends, trendsOf, type Trend, type TrendsFile } from '../core/trends';
import { clip, dateOf } from '../core/text';
import type { BrowseItem, Material } from '../core/types';
import type { FeedEntry } from './feed-scroller';
import type { DataStore } from './ports';

/**
 * `feed/<date>.jsonl`: one JSON line for every item the feed scrolled, with what was done with it.
 * Tier 0 only: the play and image URLs (which expire) and any commenter's identity are left out;
 * a comment is its text, likes and date.
 */
export class FeedLog {
  constructor(
    private readonly data: DataStore,
    private readonly now: () => number = Date.now,
  ) {}

  append(entry: FeedEntry): void {
    const { id, url, desc, hashtags, music, author, stats, durationMs, kind, postedAt } =
      entry.item;
    const line = {
      at: this.now(),
      id,
      url,
      desc,
      hashtags,
      music,
      author,
      stats,
      durationMs,
      kind,
      postedAt,
      action: entry.action,
      dwellMs: entry.dwellMs,
      ...(entry.comments.length ? { comments: entry.comments } : {}),
    };
    this.data.append(`feed/${dateOf(this.now())}.jsonl`, JSON.stringify(line) + '\n');
  }
}

/** Where the watched logs are, under the chat bot's `data/`. */
export const WATCHED_DIR = 'browse/watched';

/**
 * `browse/watched/<date>.md` in the chat bot's `data/` (`data` is the chat bot's `data/`): one line a video
 * the feed session watched, which the bot's life writer reads for her days.
 */
export class WatchedLog {
  constructor(
    private readonly data: DataStore,
    private readonly now: () => number = Date.now,
  ) {}

  add(item: BrowseItem, material: Material | null): void {
    const path = `${WATCHED_DIR}/${dateOf(this.now())}.md`;
    const existing = this.data.read(path) ?? '';
    if (existing.includes(`[id:${item.id}]`)) return;
    const sound = material?.song
      ? `${material.song.title} - ${material.song.artist}`
      : item.music?.title;
    const said = material?.transcript.length
      ? `，说的是「${clip(material.transcript.join(''), 40)}」`
      : '';
    const line =
      `- 看了 @${item.author.nickname || '某人'} 的视频「${clip(item.desc, 50) || '无文字'}」` +
      `${
        item.hashtags.length
          ? `（${item.hashtags
              .slice(0, 3)
              .map((t) => `#${t}`)
              .join(' ')}）`
          : ''
      }` +
      `${sound ? `，用的声音：${sound}` : ''}${said} [id:${item.id}]\n`;
    this.data.write(path, existing || `# ${dateOf(this.now())} 刷到的\n\n`);
    this.data.append(path, line);
  }
}

/** `trends.json`, counted by code over the day's items. */
export class Trends {
  constructor(
    private readonly data: DataStore,
    private readonly now: () => number = Date.now,
  ) {}

  read(): TrendsFile {
    const text = this.data.read('trends.json');
    if (!text) return { terms: {} };
    try {
      const file = JSON.parse(text) as Partial<TrendsFile>;
      return { terms: file.terms ?? {} };
    } catch {
      return { terms: {} };
    }
  }

  /** Counts today's items in, saves, and gives the trends now. */
  record(items: readonly BrowseItem[]): Trend[] {
    const file = countTrends(this.read(), dateOf(this.now()), items);
    this.data.write('trends.json', JSON.stringify(file, null, 2));
    return trendsOf(file);
  }
}
