import type { BrowseItem, Comment, ReadResult } from '../core/types';
import { arr, isObject, num, parseBody, readAweme, str } from './aweme';

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

/** Search results: `data[].aweme_info`, or the items of a mix (`aweme_mix_info.mix_items`). */
export function readSearch(body: string): ReadResult<BrowseItem> {
  const json = parseBody(body);
  if (!json) return empty();
  const list = arr(json.data).flatMap((entry) => {
    if (!isObject(entry)) return [];
    if (entry.aweme_info) return [entry.aweme_info];
    return isObject(entry.aweme_mix_info) ? arr(entry.aweme_mix_info.mix_items) : [];
  });
  return { items: awemes(list), hasMore: num(json.has_more) === 1 };
}

/**
 * The searches Douyin suggests next to a result list (相关搜索 / 大家都在搜): guessed shapes,
 * `suggest_words.suggest_words[].words[].word` and `data[].word_list[].word`.
 */
export function readRelated(body: string): string[] {
  const json = parseBody(body);
  if (!json) return [];
  const words: string[] = [];
  const suggest = isObject(json.suggest_words) ? arr(json.suggest_words.suggest_words) : [];
  for (const group of suggest) {
    for (const w of arr(isObject(group) ? group.words : null)) {
      if (isObject(w)) words.push(str(w.word));
    }
  }
  for (const entry of arr(json.data)) {
    for (const w of arr(isObject(entry) ? entry.word_list : null)) {
      if (isObject(w)) words.push(str(w.word));
    }
  }
  return [...new Set(words.map((w) => w.trim()).filter(Boolean))];
}

/**
 * Comments: three fields copied (text, likes, date) and nothing else, so no name, uid or avatar
 * can reach anything downstream.
 */
export function readComments(body: string): ReadResult<Comment> {
  const json = parseBody(body);
  if (!json) return empty();
  const items = arr(json.comments).flatMap((raw): Comment[] => {
    if (!isObject(raw)) return [];
    const text = str(raw.text).trim();
    if (!text) return [];
    const created = num(raw.create_time);
    return [{ text, likes: num(raw.digg_count), postedAt: created > 0 ? created * 1000 : null }];
  });
  return { items, hasMore: num(json.has_more) === 1 };
}
