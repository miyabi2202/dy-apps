import { numberedComments, postOfRef } from './comments';
import type { Draft } from './drafts';
import type { ReadItem } from './types';
import type { OpinionPoint } from './understand';

/** How far one side of an opinion was seen: under how many posts, by how many creators, with how many likes. */
export interface SideCount {
  posts: number;
  /** Distinct posters of those posts: the same creator's posts count once. */
  creators: number;
  likes: number;
  postIds: string[];
}

/** An opinion point, counted by code: both sides, and the search it was seen under. */
export interface CountedOpinion {
  term: string;
  point: string;
  counter: string | null;
  side: SideCount;
  counterSide: SideCount | null;
}

/** The fewest distinct creators an opinion must be seen under to become a card: likes alone don't count. */
export const MIN_OPINION_CREATORS = 2;

/**
 * One side counted from its refs: the distinct posts they point into, the distinct creators of those
 * posts (a creator not known isn't counted), and the likes of each ref once (a comment's or reply's
 * own likes, a post's for a post id).
 */
export function countSide(refs: readonly string[], reads: readonly ReadItem[]): SideCount {
  const posts = new Map(reads.map((read) => [read.item.id, read]));
  const likesOf = new Map<string, number>();
  for (const read of reads) {
    likesOf.set(read.item.id, read.item.stats.likes);
    for (const { ref, comment } of numberedComments(read)) likesOf.set(ref, comment.likes);
  }
  const postIds = [...new Set(refs.map(postOfRef).filter((id) => posts.has(id)))];
  const creators = new Set(
    postIds.flatMap((id) => {
      const { author } = posts.get(id)!.item;
      const who = author.secUid || author.nickname;
      return who ? [who] : [];
    }),
  );
  const likes = [...new Set(refs)].reduce((sum, ref) => sum + (likesOf.get(ref) ?? 0), 0);
  return { posts: postIds.length, creators: creators.size, likes, postIds };
}

/** The points of one search, each side counted over the posts it read. */
export function countOpinions(
  points: readonly OpinionPoint[],
  reads: readonly ReadItem[],
  term: string,
): CountedOpinion[] {
  return points.map((p) => ({
    term,
    point: p.point,
    counter: p.counter,
    side: countSide(p.refs, reads),
    counterSide: p.counter && p.counterRefs.length ? countSide(p.counterRefs, reads) : null,
  }));
}

/** The opinions seen under at least `min` different creators: what's worth keeping as a 社区观点. */
/** The most a topic's opinion card lists. */
export const MAX_OPINIONS_PER_CARD = 6;

/** The views held most widely (most creators, then most likes), at most `max`. */
export function topOpinions(
  opinions: readonly CountedOpinion[],
  max = MAX_OPINIONS_PER_CARD,
): CountedOpinion[] {
  return [...opinions]
    .sort((a, b) => b.side.creators - a.side.creators || b.side.likes - a.side.likes)
    .slice(0, max);
}

export function keptOpinions(
  counted: readonly CountedOpinion[],
  min = MIN_OPINION_CREATORS,
): CountedOpinion[] {
  return counted.filter((o) => o.side.creators >= min);
}

const counts = (side: SideCount) => `${side.posts}个作品/${side.likes}赞`;

/**
 * A 社区观点 card for a search's kept opinions, written by code, never checked on the web: each
 * point as hearsay with its counts, and the other side with its own when there is one. Null with none.
 */
/**
 * An opinion as it follows 「有人觉得」: without a lead-in of its own (「也有观众说」「大家觉得」…) or
 * a full stop at the end, which the model often writes (seen on a topic run, 2026-11-01: 「有人觉得也有人觉得…。（…）。」).
 */
export function view(text: string): string {
  return text
    .trim()
    .replace(
      /^(?:(?:但|不过|而)?(?:也|还)?(?:有|不少|很多|一些|部分)?(?:人|观众|网友|粉丝|大家|评论)(?:们)?(?:都|也|还)?(?:觉得|认为|说|表示|吐槽|调侃|提到)[，,：:]?\s*)+/,
      '',
    )
    .replace(/[。.！!；;，,\s]+$/, '');
}

export function opinionDraft(term: string, opinions: readonly CountedOpinion[]): Draft | null {
  if (!opinions.length) return null;
  const lines = opinions.map((o) => {
    const other =
      o.counter && o.counterSide
        ? `，也有人觉得${view(o.counter)}（${counts(o.counterSide)}）`
        : o.counter
          ? `，也有人不这么看`
          : '';
    return `- 听说抖音上有人觉得${view(o.point)}（${counts(o.side)}）${other}。`;
  });
  const sources = [
    ...new Set(opinions.flatMap((o) => [...o.side.postIds, ...(o.counterSide?.postIds ?? [])])),
  ];
  return {
    kind: 'new',
    title: `${term}（大家怎么看）`,
    aliases: [],
    type: '社区观点',
    asOf: '',
    body: [
      '只是抖音评论区里的说法，不是事实；按不同作者数过（同一作者的作品只算一次）。',
      ...lines,
    ].join('\n'),
    change: '',
    from: term,
    sources: sources.slice(0, 5),
    urls: [],
  };
}
