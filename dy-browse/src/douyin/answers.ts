import type { BrowseItem, Comment, ReadResult } from '../core/types';
import { arr, isObject, num, parseBodies, parseBody, readAweme, str } from './aweme';

/** Items from a list of `aweme` objects, the ones with no id left out. */
function awemes(list: readonly unknown[]): BrowseItem[] {
  return list.flatMap((raw) => {
    const item = readAweme(raw);
    return item ? [item] : [];
  });
}

const empty = <T>(): ReadResult<T> => ({ items: [], hasMore: false });

/** The 推荐 feed's answer: `aweme_list`. */
export function readFeed(body: string): ReadResult<BrowseItem> {
  const json = parseBody(body);
  if (!json) return empty();
  return { items: awemes(arr(json.aweme_list)), hasMore: num(json.has_more) === 1 };
}

/** A user's post list: `aweme_list`, with `has_more` and `max_cursor` for the next page. */
export function readUserPosts(body: string): ReadResult<BrowseItem> {
  const json = parseBody(body);
  if (!json) return empty();
  return { items: awemes(arr(json.aweme_list)), hasMore: num(json.has_more) === 1 };
}

/**
 * Search results: `data[].aweme_info`, or the items of a mix (`aweme_mix_info.mix_items`), from
 * every chunk of a streamed body.
 */
export function readSearch(body: string): ReadResult<BrowseItem> {
  const chunks = parseBodies(body);
  if (!chunks.length) return empty();
  const list = chunks.flatMap((json) =>
    arr(json.data).flatMap((entry) => {
      if (!isObject(entry)) return [];
      if (entry.aweme_info) return [entry.aweme_info];
      return isObject(entry.aweme_mix_info) ? arr(entry.aweme_mix_info.mix_items) : [];
    }),
  );
  return { items: awemes(list), hasMore: chunks.some((json) => num(json.has_more) === 1) };
}

/**
 * The searches Douyin suggests next to a result list (相关搜索 / 大家都在搜):
 * `suggest_words.suggest_words[].words[].word`, on the body or (seen on the first topic run,
 * 2026-11-01) on each result's `aweme_info`, and the guessed `data[].word_list[].word`.
 */
export function readRelated(body: string): string[] {
  return [...new Set(parseBodies(body).flatMap(relatedIn))];
}

function relatedIn(json: Record<string, unknown>): string[] {
  const words: string[] = [];
  const suggested = (holder: unknown) => {
    const suggest =
      isObject(holder) && isObject(holder.suggest_words) ? holder.suggest_words : null;
    for (const group of arr(suggest?.suggest_words)) {
      for (const w of arr(isObject(group) ? group.words : null)) {
        if (isObject(w)) words.push(str(w.word));
      }
    }
  };
  suggested(json);
  for (const entry of arr(json.data)) {
    if (!isObject(entry)) continue;
    suggested(entry.aweme_info);
    for (const w of arr(entry.word_list)) {
      if (isObject(w)) words.push(str(w.word));
    }
  }
  return words.map((w) => w.trim()).filter(Boolean);
}

/** One comment object as a Comment: text, likes, date, its own id and reply count; null when blank. */
function readComment(raw: unknown): Comment | null {
  if (!isObject(raw)) return null;
  const text = str(raw.text).trim();
  if (!text) return null;
  const created = num(raw.create_time);
  const id = str(raw.cid);
  const replyCount = raw.reply_comment_total;
  return {
    text,
    likes: num(raw.digg_count),
    postedAt: created > 0 ? created * 1000 : null,
    ...(id ? { id } : {}),
    ...(typeof replyCount === 'number' ? { replyCount: num(replyCount) } : {}),
  };
}

/**
 * Comments: the text, likes and date, and the comment's own id and reply count (to open its
 * replies), and nothing else, so no name, uid or avatar can reach anything downstream.
 */
export function readComments(body: string): ReadResult<Comment> {
  const json = parseBody(body);
  if (!json) return empty();
  const items = arr(json.comments).flatMap((raw) => {
    const comment = readComment(raw);
    return comment ? [comment] : [];
  });
  return { items, hasMore: num(json.has_more) === 1 };
}

/** A reply (楼中楼) and the id of the comment it's under. */
export interface ReadReply {
  /** The comment it's under (`reply_id`); '' when the JSON didn't say. */
  parentId: string;
  reply: Comment;
}

/**
 * The replies under one comment (`/aweme/v1/web/comment/list/reply/`): a GUESS that they come as
 * the comment list does, `comments[]`, each with `reply_id` naming the comment they're under.
 * Read like comments: nothing of who wrote them.
 */
export function readReplies(body: string): ReadResult<ReadReply> {
  const json = parseBody(body);
  if (!json) return empty();
  const items = arr(json.comments).flatMap((raw): ReadReply[] => {
    const reply = readComment(raw);
    if (!reply || !isObject(raw)) return [];
    const parentId = str(raw.reply_id);
    return [{ parentId: parentId === '0' ? '' : parentId, reply }];
  });
  return { items, hasMore: num(json.has_more) === 1 };
}
