import { FeedScroller, type FeedSurface } from '../src/app/feed-scroller';
import { fixedDwell, randomDwell, type DwellDecision, type DwellRule } from '../src/core/dwell';
import { BlockedError, EmptyReadError } from '../src/core/errors';
import { Pace } from '@dy-apps/douyin-chrome';
import { commentsBody, FakeTap, item } from './support/fakes';

const feedBody = (ids: string[]): object => ({
  aweme_list: ids.map((id) => ({
    aweme_id: id,
    desc: `视频${id}`,
    aweme_type: 0,
    video: { duration: 20_000 },
  })),
});

/** A feed that logs what it's asked; the clock moves with every wait. */
function setup({
  batches = [feedBody(['f1', 'f2', 'f3', 'f4'])],
  decisions = [] as DwellDecision[],
  wall = null as 'captcha' | 'login' | null,
} = {}) {
  const log: string[] = [];
  const tap = new FakeTap();
  let clock = 1_000_000;
  let batch = 0;
  const fetchBatch = () => {
    const body = batches[batch++];
    if (body) tap.push('feed', body);
  };
  const surface: FeedSurface = {
    open: () => (log.push('open'), fetchBatch(), Promise.resolve()),
    blocked: () => Promise.resolve(wall),
    waitForPlayer: () => Promise.resolve(void log.push('wait for player')),
    goToNext: () => (log.push('next'), fetchBatch(), Promise.resolve()),
    waitForCommentButton: () => Promise.resolve(void log.push('wait for comment button')),
    clickCommentButton: () => (
      log.push('click comment button'),
      tap.push('comments', commentsBody(['好玩'])),
      Promise.resolve()
    ),
    waitForComments: () => Promise.resolve(void log.push('wait for comments')),
    waitForClose: () => Promise.resolve(void log.push('wait for close')),
    clickClose: () => Promise.resolve(void log.push('click close')),
    pressEscape: () => Promise.resolve(void log.push('press Escape')),
  };
  let next = 0;
  const asked: string[] = [];
  const dwell: DwellRule = {
    decide: (i) => (asked.push(i.id), decisions[next++] ?? { action: 'watch', dwellMs: 1000 }),
  };
  const pace = new Pace({
    wait: (ms) => (log.push(`wait ${ms}`), (clock += ms), Promise.resolve()),
    random: () => 0,
  });
  const scroller = new FeedScroller(surface, tap, { pace, dwell, now: () => clock });
  return { scroller, log, asked };
}

describe('FeedScroller', () => {
  it('opens the feed, waits for the player; stays the dwell time; then moves on as a step', async () => {
    const { scroller, log } = setup({ decisions: [{ action: 'watch', dwellMs: 4000 }] });
    await scroller.run({ minutes: 10, maxVideos: 1 });
    expect(log).toEqual(['wait 500', 'open', 'wait for player', 'wait 1500', 'wait 4000']);
    const more = setup({
      decisions: [
        { action: 'skip', dwellMs: 2000 },
        { action: 'watch', dwellMs: 3000 },
      ],
    });
    await more.scroller.run({ minutes: 10, maxVideos: 1 });
    expect(more.log.slice(3)).toEqual([
      'wait 1500',
      'wait 2000',
      'wait for player',
      'wait 500',
      'next',
      'wait 1500',
      'wait 3000',
    ]);
  });

  it('asks the dwell rule about each item announced, in order, and records what it did', async () => {
    const { scroller, asked } = setup({
      decisions: [
        { action: 'skip', dwellMs: 0 },
        { action: 'watch', dwellMs: 10 },
        { action: 'skip', dwellMs: 0 },
        { action: 'watch', dwellMs: 10 },
      ],
    });
    const seen: string[] = [];
    const { entries, stoppedBy } = await scroller.run(
      { minutes: 10, maxVideos: 2 },
      (e) => void seen.push(`${e.item.id}:${e.action}`),
    );
    expect(asked).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(seen).toEqual(['f1:skip', 'f2:watch', 'f3:skip', 'f4:watch']);
    // Skipped videos don't count against max-videos.
    expect(entries).toHaveLength(4);
    expect(stoppedBy).toBe('maxVideos');
  });

  it('does not pause for a skipped ad', async () => {
    const { scroller, log } = setup({
      decisions: [
        { action: 'skip', dwellMs: 0 },
        { action: 'watch', dwellMs: 700 },
      ],
    });
    await scroller.run({ minutes: 10, maxVideos: 1 });
    expect(log).not.toContain('wait 0');
  });

  it('opens the comments of a video as a step, reads them, and closes them as a step', async () => {
    const { scroller, log } = setup({
      decisions: [{ action: 'watchWithComments', dwellMs: 1000 }],
    });
    const { entries } = await scroller.run({ minutes: 10, maxVideos: 1 });
    expect(log.slice(4)).toEqual([
      'wait 1000',
      'wait for comment button',
      'wait 500',
      'click comment button',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
    ]);
    expect(entries[0]!.comments.map((c) => c.text)).toEqual(['好玩']);
  });

  it('stops when the minutes are up', async () => {
    const { scroller } = setup({
      decisions: Array.from({ length: 4 }, () => ({ action: 'watch' as const, dwellMs: 40_000 })),
    });
    const { entries, stoppedBy } = await scroller.run({ minutes: 1, maxVideos: 99 });
    expect(stoppedBy).toBe('minutes');
    expect(entries).toHaveLength(2);
  });

  it('stops when the feed announces nothing more', async () => {
    const { scroller } = setup({ batches: [feedBody(['f1', 'f2'])] });
    const { entries, stoppedBy } = await scroller.run({ minutes: 10, maxVideos: 99 });
    expect(stoppedBy).toBe('stalled');
    expect(entries).toHaveLength(2);
  });

  it('takes a later batch when the first is used up', async () => {
    const { scroller, asked } = setup({ batches: [feedBody(['f1']), feedBody(['f1', 'f2'])] });
    await scroller.run({ minutes: 10, maxVideos: 99 });
    expect(asked).toEqual(['f1', 'f2']);
  });

  it('stops loudly, with the bodies, when the feed never read as anything', async () => {
    const { scroller } = setup({ batches: [{ status_code: 8, odd: true }] });
    const error = await scroller.run({ minutes: 1, maxVideos: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmptyReadError);
    expect((error as EmptyReadError).bodies).toEqual(['{"status_code":8,"odd":true}']);
  });

  it('stops at a login wall', async () => {
    const { scroller } = setup({ wall: 'login' });
    await expect(scroller.run({ minutes: 1, maxVideos: 1 })).rejects.toBeInstanceOf(BlockedError);
  });
});

describe('dwell rules', () => {
  const video = item('v', null, { durationMs: 20_000 });

  it('randomDwell skips ads, live cards and shop links at once, whatever the dice say', () => {
    for (const kind of ['ad', 'live', 'shop'] as const) {
      expect(randomDwell({ random: () => 0.99 }).decide(item('x', null, { kind }))).toEqual({
        action: 'skip',
        dwellMs: 0,
      });
    }
  });

  it('takes each branch of a video: skip after 1–3 s, watch to the end, watch with the comments', () => {
    expect(randomDwell({ random: () => 0 }).decide(video)).toEqual({
      action: 'skip',
      dwellMs: 1000,
    });
    expect(randomDwell({ random: () => 0.5 }).decide(video)).toEqual({
      action: 'watch',
      dwellMs: 20_000,
    });
    expect(randomDwell({ random: () => 0.99 }).decide(video)).toEqual({
      action: 'watchWithComments',
      dwellMs: 20_000,
    });
  });

  it('caps a long video at 3 minutes, and gives an image post 5–10 s', () => {
    expect(
      randomDwell({ random: () => 0.5 }).decide(item('l', null, { durationMs: 600_000 })).dwellMs,
    ).toBe(180_000);
    expect(randomDwell({ random: () => 0 }).decide(item('i', null, { kind: 'images' }))).toEqual({
      action: 'watch',
      dwellMs: 5000,
    });
  });

  it('fixedDwell watches everything 3–6 s', () => {
    expect(fixedDwell(() => 0).decide(video)).toEqual({ action: 'watch', dwellMs: 3000 });
  });
});
