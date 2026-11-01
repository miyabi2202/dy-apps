import { FeedLog, Trends, WatchedLog } from '../src/app/feed-logs';
import { FeedRun } from '../src/app/feed-run';
import type { FeedEntry } from '../src/app/feed-scroller';
import { countTrends, trendsOf, type TrendsFile } from '../src/core/trends';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

const video = (id: string, hashtags: string[] = [], sound?: string) =>
  item(id, null, {
    hashtags,
    music: sound ? { title: sound, author: 'x' } : null,
    desc: `视频${id}`,
  });

const empty: TrendsFile = { terms: {} };

describe('countTrends', () => {
  it('counts a hashtag and a sound once per video', () => {
    const file = countTrends(empty, '2026-11-01', [
      video('1', ['梗', '梗'], '神曲'),
      video('2', ['梗'], '神曲'),
      video('3', [], '别的'),
    ]);
    expect(file.terms['hashtag:梗']).toEqual({ kind: 'hashtag', days: { '2026-11-01': 2 } });
    expect(file.terms['sound:神曲']!.days).toEqual({ '2026-11-01': 2 });
  });

  it('leaves out ads and live cards', () => {
    const file = countTrends(empty, '2026-11-01', [
      item('a', null, { kind: 'ad', hashtags: ['广告'] }),
    ]);
    expect(file.terms).toEqual({});
  });

  it("counts phrases that repeat across the day's descriptions", () => {
    const items = ['今天出货了', '终于出货了', '大保底出货'].map((desc, i) =>
      item(`p${i}`, null, { desc }),
    );
    expect(countTrends(empty, '2026-11-01', items).terms['phrase:出货']!.days).toEqual({
      '2026-11-01': 3,
    });
  });

  it('is a trend only with 3 videos on 2 days; one big day is not', () => {
    const day1 = countTrends(empty, '2026-11-01', [
      video('1', ['梗']),
      video('2', ['梗']),
      video('3', ['梗']),
    ]);
    expect(trendsOf(day1)).toEqual([]);
    const day2 = countTrends(day1, '2026-11-03', [video('4', ['梗'])]);
    expect(trendsOf(day2)).toEqual([{ term: '梗', kind: 'hashtag', videos: 4, days: 2 }]);
  });

  it('counting the same day again replaces it instead of adding', () => {
    const once = countTrends(empty, '2026-11-01', [video('1', ['梗'])]);
    const twice = countTrends(once, '2026-11-01', [video('1', ['梗']), video('2', ['梗'])]);
    expect(twice.terms['hashtag:梗']!.days).toEqual({ '2026-11-01': 2 });
  });

  it('drops a term not seen for 21 days', () => {
    const old = countTrends(empty, '2026-10-01', [video('1', ['旧梗']), video('2', ['新梗'])]);
    const later = countTrends(old, '2026-10-20', [video('3', ['新梗'])]);
    expect(Object.keys(later.terms).sort()).toEqual(['hashtag:新梗', 'hashtag:旧梗']);
    const muchLater = countTrends(later, '2026-10-25', [video('4', ['新梗'])]);
    expect(Object.keys(muchLater.terms)).toEqual(['hashtag:新梗']);
  });
});

describe('the feed logs', () => {
  const NOW = new Date(2026, 10, 1, 9, 30).getTime();

  it("FeedLog appends one JSON line per item to the day's file, without play URLs or commenters", () => {
    const data = new MemoryStore();
    const log = new FeedLog(data, () => NOW);
    const entry: FeedEntry = {
      item: video('1', ['梗']),
      action: 'watchWithComments',
      dwellMs: 5000,
      comments: [{ text: '哈哈', likes: 2, postedAt: null }],
    };
    log.append(entry);
    log.append({ ...entry, action: 'skip', comments: [] });
    const lines = data
      .read('feed/2026-11-01.jsonl')!
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      id: '1',
      action: 'watchWithComments',
      hashtags: ['梗'],
      comments: [{ text: '哈哈', likes: 2 }],
    });
    expect(lines[1]).not.toHaveProperty('comments');
    expect(JSON.stringify(lines)).not.toContain('example.invalid');
  });

  it('WatchedLog writes one line a video, once each', () => {
    const data = new MemoryStore();
    const watched = new WatchedLog(data, () => NOW);
    const v = video('1', ['梗'], '神曲');
    watched.add(v, null);
    watched.add(v, null);
    watched.add(video('2'), {
      transcript: ['你好呀'],
      song: { title: '海阔天空', artist: 'Beyond' },
      ocr: [],
    });
    expect(data.read('browse/watched/2026-11-01.md')).toBe(
      '# 2026-11-01 刷到的\n\n' +
        '- 看了 @作者 的视频「视频1」（#梗），用的声音：神曲 [id:1]\n' +
        '- 看了 @作者 的视频「视频2」，用的声音：海阔天空 - Beyond，说的是「你好呀」 [id:2]\n',
    );
  });

  it('Trends keeps trends.json across calls', () => {
    const data = new MemoryStore();
    new Trends(data, () => NOW).record([video('1', ['梗'])]);
    const next = new Trends(data, () => NOW + 2 * 86_400_000).record([
      video('2', ['梗']),
      video('3', ['梗']),
    ]);
    expect(next).toEqual([{ term: '梗', kind: 'hashtag', videos: 3, days: 2 }]);
  });
});

describe('FeedRun', () => {
  it('logs every item as it comes, reads the watched ones, writes their lines and counts trends', async () => {
    const data = new MemoryStore();
    const NOW = new Date(2026, 10, 1, 9, 30).getTime();
    const entries: FeedEntry[] = [
      { item: video('1', ['梗']), action: 'skip', dwellMs: 1000, comments: [] },
      { item: video('2', ['梗']), action: 'watch', dwellMs: 5000, comments: [] },
      { item: video('3', ['梗']), action: 'watchWithComments', dwellMs: 5000, comments: [] },
    ];
    const read: string[] = [];
    const logs: string[] = [];
    const run = new FeedRun({
      scroller: {
        run: async (_limits, onEntry) => {
          for (const e of entries) await onEntry?.(e);
          return { entries, stoppedBy: 'maxVideos' };
        },
      },
      feedLog: new FeedLog(data, () => NOW),
      watchedLog: new WatchedLog(data, () => NOW),
      trends: new Trends(data, () => NOW),
      reader: { read: (i) => (read.push(i.id), Promise.resolve(null)) },
      log: (m) => logs.push(m),
    });
    const result = await run.run({ minutes: 5, maxVideos: 2 });
    expect(result).toMatchObject({ watched: 2, skipped: 1, withComments: 1 });
    expect(read).toEqual(['2', '3']);
    expect(data.read('feed/2026-11-01.jsonl')!.trim().split('\n')).toHaveLength(3);
    expect(data.read('browse/watched/2026-11-01.md')).toContain('[id:3]');
    expect(data.read('browse/watched/2026-11-01.md')).not.toContain('[id:1]');
    expect(data.read('trends.json')).toContain('hashtag:梗');
    expect(logs).toEqual([
      'feed session {watched: 2, skipped: 1, comments: 1, stoppedBy: maxVideos}',
    ]);
  });
});
