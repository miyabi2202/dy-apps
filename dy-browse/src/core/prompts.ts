import { dateOf, clip } from './text';
import type { BrowseItem, ReadItem } from './types';

/** An item as a few lines of text for a prompt: what the JSON said, and what tiers 1–2 heard and read. */
export function itemText({ item, comments, material }: ReadItem): string {
  const lines = [
    `id=${item.id}` +
      (item.postedAt ? ` 发布于 ${dateOf(item.postedAt)}` : '') +
      ` 点赞${item.stats.likes} 评论${item.stats.comments}`,
    `描述：${clip(item.desc, 300) || '（无）'}`,
  ];
  if (item.hashtags.length) lines.push(`话题：${item.hashtags.map((t) => `#${t}`).join(' ')}`);
  if (item.music) lines.push(`音乐：${item.music.title}（${item.music.author}）`);
  if (material?.song) lines.push(`识别出的歌：${material.song.title} - ${material.song.artist}`);
  if (material?.transcript.length) lines.push(`语音：${clip(material.transcript.join(''), 400)}`);
  if (material?.ocr.length) lines.push(`画面文字：${clip(material.ocr.join(' '), 200)}`);
  if (comments.length) {
    lines.push('热门评论（只用来总结大家怎么说，不要引用原话）：');
    for (const comment of comments.slice(0, 12))
      lines.push(`- ${clip(comment.text, 80)}（赞${comment.likes}）`);
  }
  return lines.join('\n');
}

/** The prompt for one line per post of the streamer's, for the room's `memory/posts.md` in the chat bot's data. */
export function postsPrompt(items: readonly ReadItem[]): string {
  return [
    '下面是一位直播主播自己发的几条抖音作品（描述、话题、音乐，有的还有语音转写、画面文字和热门评论）。',
    '给每条写一行简短的中文记录，像人回忆「她那天发了什么」：发了什么、关于什么、大家反应如何。',
    '规则：',
    '- 每行不超过 60 个字，只写作品和评论里确实有的，不要编。',
    '- 评论只总结大意，绝不写任何人的名字或 id，也不要引用原话。',
    '- 语音转写可能有错字，画面文字可能不全，拿不准就别写。',
    '只输出一个 JSON 数组，每条一个对象：[{"id": "作品的 id", "line": "一行记录"}]。',
    '',
    ...items.map((read, i) => `作品 ${i + 1}：\n${itemText(read)}`),
  ].join('\n\n');
}

/** A fallback line when the model gave none for a post: its description, cut short. */
export function fallbackLine(item: BrowseItem): string {
  return clip(item.desc, 60) || '（没有文字描述）';
}

export interface PromptNode {
  term: string;
  /** The search it was found from; null for the topic itself. */
  parent: string | null;
  items: readonly ReadItem[];
}

/** The prompt for choosing which keywords to follow, among the candidates code counted. */
export function keywordsPrompt(
  topic: string,
  candidates: readonly { term: string; source: string; posts: number }[],
  maxKeywords: number,
  items: readonly ReadItem[],
): string {
  return [
    `我们在抖音上搜索了「${topic}」，想顺着它学到旁边的东西：看的人接下来可能会说到什么。`,
    `下面是搜索结果里的一些作品，和程序数出来的候选关键词（来源：hashtag 话题、related 相关搜索、phrase 反复出现的短语；数字是出现在几个作品里）。`,
    `从候选里挑最多 ${maxKeywords} 个值得继续搜的，每个说明理由。只能从候选里挑，不要自己造词；没有值得的就返回空数组。`,
    '只输出一个 JSON 数组：[{"keyword": "候选里的词", "reason": "理由"}]。',
    '',
    '候选：',
    ...candidates.map((c) => `- ${c.term}（${c.source}，${c.posts}）`),
    '',
    '作品：',
    ...items.slice(0, 8).map((read) => itemText(read)),
  ].join('\n');
}

/** The prompt for the knowledge drafts, from everything the walk read. */
export function draftsPrompt(
  topic: string,
  nodes: readonly PromptNode[],
  existing: readonly { title: string; text: string }[],
  today: string,
): string {
  return [
    `我们在抖音上学「${topic}」：搜索它，读了最热和最新的作品，又顺着相关关键词搜了几步。今天是 ${today}。`,
    '请根据下面的材料，为聊天机器人的知识库写草稿。知识库的条目是「某个词是什么、现在怎么说」，要写事实，不要写观点腔；拿不准的别写。',
    '三种结果：',
    '- 新条目（kind: "new"）：值得知道、知识库里还没有的词。',
    '- 修改已有条目（kind: "change"，title 必须是下面已有条目的标题）：说明变了什么（change）和新的正文（body）。',
    '- 仍然正确（放进 stillRight）：已有条目，材料里的作品显示它现在还是对的。',
    '规则：材料里没有的不要编；评论只总结大意，不写任何人的名字或 id；每条草稿的 sources 填支持它的作品 id（最多 3 个），from 填它是在哪个搜索词下看到的。',
    '类型只能是：事实、惯例、规则、社区观点（大家怎么说）。截至写版本或年月，如 2026-11。',
    '只输出一个 JSON 对象：{"entries": [{"kind", "title", "aliases": [], "type", "asOf", "body", "change", "from", "sources": []}], "stillRight": ["已有条目的标题"]}。',
    '',
    existing.length ? '已有条目：' : '已有条目：（没有）',
    ...existing.map((e) => e.text),
    '',
    ...nodes.flatMap((node) => [
      `搜索「${node.term}」${node.parent ? `（从「${node.parent}」来）` : ''}的作品：`,
      ...node.items.slice(0, 8).map((read) => itemText(read)),
      '',
    ]),
  ].join('\n');
}
