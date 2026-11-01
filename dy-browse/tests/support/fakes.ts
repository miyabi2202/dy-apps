import type { ResponseTap } from '../../src/app/ports';
import type { BrowseItem } from '../../src/core/types';
import type { AnswerKind } from '../../src/douyin/page-map';

/** A tap whose bodies are put there by the fake surface's acts, as the real page's calls would be. */
export class FakeTap implements ResponseTap {
  private readonly bodies = new Map<AnswerKind, string[]>();

  push(kind: AnswerKind, body: string | object): void {
    const list = this.bodies.get(kind) ?? [];
    list.push(typeof body === 'string' ? body : JSON.stringify(body));
    this.bodies.set(kind, list);
  }

  drain(kind: AnswerKind): string[] {
    const list = this.bodies.get(kind) ?? [];
    this.bodies.delete(kind);
    return list;
  }
}

/** A made-up item, for tests of what's done with items. */
export function item(
  id: string,
  postedAt: number | null = null,
  extra: Partial<BrowseItem> = {},
): BrowseItem {
  return {
    id,
    url: `https://www.douyin.com/video/${id}`,
    desc: `描述${id}`,
    hashtags: [],
    music: null,
    author: { nickname: '作者', secUid: 'SEC' },
    stats: { likes: 1, comments: 1, shares: 0 },
    durationMs: 10_000,
    kind: 'video',
    postedAt,
    playUrl: `https://v.example.invalid/${id}.mp4`,
    imageUrls: [],
    ...extra,
  };
}

/** A post list body in the shape of the guessed `aweme_list`. */
export function postsBody(ids: readonly string[], hasMore: boolean): object {
  return {
    has_more: hasMore ? 1 : 0,
    aweme_list: ids.map((id) => ({ aweme_id: id, desc: `post ${id}`, create_time: Number(id) })),
  };
}

export function commentsBody(texts: readonly string[]): object {
  return {
    comments: texts.map((text, i) => ({
      text,
      digg_count: i,
      user: { nickname: '某人', uid: '1' },
    })),
  };
}
