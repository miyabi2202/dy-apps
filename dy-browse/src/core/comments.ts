import type { Comment, ReadItem } from './types';

/**
 * What a comment says when it asks what something is or where it's from: the strongest sign there's
 * something worth looking up under a post.
 */
export const ASKING_WORDS = [
  '啥意思',
  '什么意思',
  '什么梗',
  '啥梗',
  '求科普',
  '出处',
  '谁啊',
  '是谁',
] as const;

/** Whether `text` asks what something is or where it's from (one of ASKING_WORDS). */
export function asksSomething(text: string): boolean {
  return ASKING_WORDS.some((word) => text.includes(word));
}

/** The comments with `asks` set on the ones that ask (ASKING_WORDS). */
export function markAsking(comments: readonly Comment[]): Comment[] {
  return comments.map((c) => (asksSomething(c.text) ? { ...c, asks: true } : c));
}

/**
 * Which comments (their places in `comments`) to open the replies of, at most `max`: the ones that
 * ask first (their replies are where the answer is), then the most liked. One Douyin says has no
 * replies is left out.
 */
export function repliesToOpen(comments: readonly Comment[], max = 3): number[] {
  const open = comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => comment.replyCount !== 0);
  const asking = open.filter(({ comment }) => asksSomething(comment.text));
  const liked = [...open].sort((a, b) => b.comment.likes - a.comment.likes);
  const picked: number[] = [];
  for (const { index } of [...asking, ...liked]) {
    if (picked.length >= max) break;
    if (!picked.includes(index)) picked.push(index);
  }
  return picked;
}

/** One comment or reply of a post, with the ref the prompts cite it by. */
export interface NumberedComment {
  /** `<post id>#<n>` for a comment, `<post id>#<n>.<m>` for a reply under it. */
  ref: string;
  postId: string;
  comment: Comment;
  /** Null for a comment; the ref of the comment it's under, for a reply. */
  parent: string | null;
}

/**
 * A post's comments as the prompts show them, most liked first, each with its ref, its replies
 * after it (most liked first too). The prompts and the code that reads refs back both use this, so a
 * ref means the same comment in both.
 */
export function numberedComments({
  item,
  comments,
}: Pick<ReadItem, 'item' | 'comments'>): NumberedComment[] {
  const out: NumberedComment[] = [];
  const byLikes = (list: readonly Comment[]) => [...list].sort((a, b) => b.likes - a.likes);
  byLikes(comments).forEach((comment, i) => {
    const ref = `${item.id}#${i + 1}`;
    out.push({ ref, postId: item.id, comment, parent: null });
    byLikes(comment.replies ?? []).forEach((reply, j) =>
      out.push({ ref: `${ref}.${j + 1}`, postId: item.id, comment: reply, parent: ref }),
    );
  });
  return out;
}

/** The post a ref points into: the part before `#` (a post id is its own ref). */
export function postOfRef(ref: string): string {
  const at = ref.indexOf('#');
  return at < 0 ? ref : ref.slice(0, at);
}

/** Whether a ref is a reply's (`<post id>#<n>.<m>`). */
export function isReplyRef(ref: string): boolean {
  return /#\d+\.\d+$/.test(ref);
}
