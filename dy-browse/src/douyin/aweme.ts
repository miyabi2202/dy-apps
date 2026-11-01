import type { BrowseItem, ItemKind } from '../core/types';

/**
 * Reading Douyin's web JSON. The field names (`aweme_id`, `desc`, `text_extra`, `music`,
 * `statistics`, `is_ads`, `aweme_type`, …) are the web API's as far as we know them; the
 * values of `aweme_type` for live and shop cards are guesses, to check against real captures
 * (see README). Bodies are untrusted: every read is defensive, and a field that isn't there is
 * the empty value, never a throw.
 */

type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

export function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A body's JSON, or null when it isn't JSON (or isn't an object). */
export function parseBody(body: string): Json | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function firstUrl(value: unknown): string | null {
  const first = str(arr(isObject(value) ? value.url_list : null)[0]);
  if (!first) return null;
  return first.startsWith('//') ? `https:${first}` : first;
}

/** `aweme_type` values we take for a live card and a shop card: guesses. */
const LIVE_TYPES = new Set([101]);
const SHOP_TYPES = new Set([201]);
const IMAGE_TYPES = new Set([2, 68, 150]);

function kindOf(aweme: Json, images: readonly unknown[]): ItemKind {
  const type = num(aweme.aweme_type);
  if (aweme.is_ads === true || aweme.is_ads === 1 || isObject(aweme.raw_ad_data)) return 'ad';
  if (LIVE_TYPES.has(type) || aweme.room_id !== undefined || isObject(aweme.live_info))
    return 'live';
  if (SHOP_TYPES.has(type) || isObject(aweme.product_info)) return 'shop';
  if (IMAGE_TYPES.has(type) || images.length > 0) return 'images';
  return 'video';
}

/** One `aweme` object as an item, or null when it has no id. */
export function readAweme(raw: unknown): BrowseItem | null {
  if (!isObject(raw)) return null;
  const id = str(raw.aweme_id);
  if (!id) return null;
  const images = arr(raw.images);
  const kind = kindOf(raw, images);
  const hashtags = [
    ...new Set(
      arr(raw.text_extra).flatMap((extra) => {
        const name = isObject(extra) ? str(extra.hashtag_name).trim() : '';
        return name ? [name] : [];
      }),
    ),
  ];
  const music = isObject(raw.music) && str(raw.music.title) ? raw.music : null;
  const author = isObject(raw.author) ? raw.author : {};
  const stats = isObject(raw.statistics) ? raw.statistics : {};
  const video = isObject(raw.video) ? raw.video : {};
  const created = num(raw.create_time);
  return {
    id,
    url: `https://www.douyin.com/${kind === 'images' ? 'note' : 'video'}/${id}`,
    desc: str(raw.desc).trim(),
    hashtags,
    music: music ? { title: str(music.title), author: str(music.author) } : null,
    author: { nickname: str(author.nickname), secUid: str(author.sec_uid) },
    stats: {
      likes: num(stats.digg_count),
      comments: num(stats.comment_count),
      shares: num(stats.share_count),
    },
    durationMs: num(video.duration) || num(raw.duration),
    kind,
    postedAt: created > 0 ? created * 1000 : null,
    playUrl: firstUrl(video.play_addr) ?? firstUrl(video.play_addr_h264),
    imageUrls: images.flatMap((image) => {
      const url = isObject(image) ? firstUrl(image) : null;
      return url ? [url] : [];
    }),
  };
}
