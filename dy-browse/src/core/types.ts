/** What a video or post is, as far as the browse run cares: read from Douyin's JSON. */
export type ItemKind = 'video' | 'images' | 'live' | 'ad' | 'shop';

/** One video, image post or feed card, from the JSON the page fetched (tier 0: no download). */
export interface BrowseItem {
  id: string;
  url: string;
  desc: string;
  hashtags: string[];
  music: { title: string; author: string } | null;
  /** The poster, who is public; never a commenter. */
  author: { nickname: string; secUid: string };
  stats: { likes: number; comments: number; shares: number };
  durationMs: number;
  kind: ItemKind;
  /** When it was posted, in ms; null if the JSON didn't say. */
  postedAt: number | null;
  /** The video's play URL, for tier 1; null for an image post. */
  playUrl: string | null;
  imageUrls: string[];
}

/** A comment: its text, likes and date, and nothing about who wrote it, so nothing downstream can store a name. */
export interface Comment {
  text: string;
  likes: number;
  postedAt: number | null;
}

/** What a reader found in one captured response. */
export interface ReadResult<T> {
  items: T[];
  hasMore: boolean;
}

/** What Claude, ASR and OCR made of one item's media (tiers 1 and 2). */
export interface Material {
  transcript: string[];
  song: { title: string; artist: string } | null;
  ocr: string[];
}

/** An item with what was learned about it: the comments read, and its tier 1–2 material. */
export interface ReadItem {
  item: BrowseItem;
  comments: Comment[];
  material: Material | null;
}
