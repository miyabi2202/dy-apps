/** Where a candidate came from. */
export type CandidateSource = 'hashtag' | 'related' | 'phrase';

export interface Candidate {
  term: string;
  source: CandidateSource;
  /** How many posts it showed up in (a term counts once per post). */
  posts: number;
}

/** What one post offers keywords: its hashtags and the texts around it (title, comments, speech). */
export interface PostTerms {
  hashtags: readonly string[];
  texts: readonly string[];
}

export interface CandidateOptions {
  topic: string;
  posts: readonly PostTerms[];
  /** The page's own related searches (相关搜索 / 大家都在搜). */
  related: readonly string[];
  /** Whether the knowledge base already has the term. */
  known: (term: string) => boolean;
  /** A phrase has to repeat in this many posts to count. */
  minPosts?: number;
  max?: number;
}

/** Words too common to be a keyword. */
const STOP = new Set([
  '抖音',
  '视频',
  '哈哈',
  '哈哈哈',
  '真的',
  '这个',
  '那个',
  '什么',
  '怎么',
  '可以',
  '没有',
  '就是',
  '不是',
  '我们',
  '你们',
  '他们',
  '一个',
  '大家',
  '关注',
  '点赞',
  '评论',
  '转发',
  '收藏',
  '谢谢',
  '今天',
]);

/** Which source wins when a term comes from several. */
const ORDER: Record<CandidateSource, number> = { hashtag: 0, related: 1, phrase: 2 };

const RUN = /[\p{Script=Han}A-Za-z0-9]+/gu;
const MIN_GRAM = 2;
const MAX_GRAM = 6;

/** Every 2–6 character piece of the Chinese or alphanumeric runs in `text`, once. */
function grams(text: string): Set<string> {
  const out = new Set<string>();
  for (const run of text.match(RUN) ?? []) {
    const chars = [...run];
    for (let from = 0; from < chars.length; from++) {
      for (let len = MIN_GRAM; len <= MAX_GRAM && from + len <= chars.length; len++) {
        out.add(
          chars
            .slice(from, from + len)
            .join('')
            .toLowerCase(),
        );
      }
    }
  }
  return out;
}

/**
 * The keywords worth following from a topic's posts, counted by code (a model only chooses among
 * them): the hashtags, the page's related searches, and the short phrases that repeat across the
 * posts' texts, each counting once per post. The topic itself, stop words and what the knowledge
 * base has are dropped; a phrase inside a longer one that shows up as often is dropped too.
 */
export function keywordCandidates({
  topic,
  posts,
  related,
  known,
  minPosts = 3,
  max = 20,
}: CandidateOptions): Candidate[] {
  const topicKey = topic.trim().toLowerCase();
  const found = new Map<string, Candidate>();
  const add = (term: string, source: CandidateSource, posts: number) => {
    const key = term.trim().toLowerCase();
    if (!key || key === topicKey || STOP.has(key)) return;
    const have = found.get(key);
    if (!have) {
      found.set(key, { term: term.trim(), source, posts });
      return;
    }
    // A hashtag or a related search outranks the same term as a phrase.
    found.set(key, {
      term: have.term,
      source: ORDER[source] < ORDER[have.source] ? source : have.source,
      posts: Math.max(have.posts, posts),
    });
  };

  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of new Set(post.hashtags.map((t) => t.trim()).filter(Boolean))) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const [tag, count] of tagCounts) add(tag, 'hashtag', count);
  for (const word of related) add(word, 'related', 0);

  const phraseCounts = new Map<string, number>();
  for (const post of posts) {
    const seen = new Set<string>();
    for (const text of post.texts) for (const gram of grams(text)) seen.add(gram);
    for (const gram of seen) phraseCounts.set(gram, (phraseCounts.get(gram) ?? 0) + 1);
  }
  const repeated = [...phraseCounts].filter(([, count]) => count >= minPosts);
  for (const [gram, count] of repeated) {
    const insideLonger = repeated.some(
      ([other, c]) => other !== gram && other.includes(gram) && c >= count,
    );
    // The topic's own pieces ("鸣潮" in "鸣潮今汐") say nothing new.
    if (!insideLonger && !topicKey.includes(gram)) add(gram, 'phrase', count);
  }

  return [...found.values()]
    .filter((c) => !known(c.term) && !topicKey.includes(c.term.toLowerCase()))
    .sort(
      (a, b) =>
        b.posts - a.posts || ORDER[a.source] - ORDER[b.source] || a.term.localeCompare(b.term),
    )
    .slice(0, max);
}
