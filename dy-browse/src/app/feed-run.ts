import type { FeedLog, Trends, WatchedLog } from './feed-logs';
import type { FeedRunLimits, FeedScroller, FeedStop } from './feed-scroller';
import type { Log } from './ports';
import type { Trend } from '../core/trends';
import type { ReadItem } from '../core/types';
import type { ItemReader } from './video-reader';

export interface FeedRunOptions {
  scroller: Pick<FeedScroller, 'run'>;
  feedLog: FeedLog;
  watchedLog: WatchedLog;
  trends: Trends;
  log: Log;
  /** Tiers 1–2 for each video watched to the end (speech, picture text); none to stop at the metadata. */
  reader?: ItemReader | null;
}

export interface FeedRunResult {
  watched: number;
  skipped: number;
  withComments: number;
  stoppedBy: FeedStop;
  trends: Trend[];
  /** The videos watched to the end, with their comments and material, for the run's reflection. */
  reads: ReadItem[];
}

/**
 * A feed session: scrolls (logging every item to the day's JSONL as it goes, so a crash keeps
 * them), then reads the videos watched to the end through tiers 1–2, writes one line each to the
 * day's watched log, and counts hashtags, sounds and phrases into the trends.
 */
export class FeedRun {
  constructor(private readonly options: FeedRunOptions) {}

  async run(limits: FeedRunLimits): Promise<FeedRunResult> {
    const { scroller, feedLog, watchedLog, trends, log, reader } = this.options;
    const { entries, stoppedBy } = await scroller.run(limits, (entry) => feedLog.append(entry));
    const watched = entries.filter((e) => e.action !== 'skip');
    const reads: ReadItem[] = [];
    for (const { item, comments } of watched) {
      const material = reader ? await reader.read(item) : null;
      watchedLog.add(item, material);
      reads.push({ item, comments, material });
    }
    const counted = trends.record(entries.map((e) => e.item));
    const result: FeedRunResult = {
      watched: watched.length,
      skipped: entries.length - watched.length,
      withComments: entries.filter((e) => e.action === 'watchWithComments').length,
      stoppedBy,
      trends: counted,
      reads,
    };
    log(
      `feed session {watched: ${result.watched}, skipped: ${result.skipped}, comments: ${result.withComments}, stoppedBy: ${stoppedBy}}`,
    );
    return result;
  }
}
