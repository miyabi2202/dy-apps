import type { KnowledgeEntry } from './knowledge';
import { DATA_NOT_INSTRUCTIONS } from './prompts';
import { clip, jsonFrom } from './text';

/**
 * What each folder of the knowledge base is for, a line each: the reviewer judges a draft by it.
 * A folder not here is judged by its name and the entries it has.
 */
export const FOLDER_PURPOSES: Record<string, string> = {
  douyin: '抖音直播间聊天机器人要懂的：抖音直播的玩法、礼物、粉丝团、等级、主播和观众的说法和梗',
};

/** A reviewer's note left on a section by older runs, which waited for a person; stripped before review. */
const NOTE = /\n*^> 审核意见（.*$/gm;

const META = /^(aliases|类型|截至|复查|来源|废弃)\s*[:：]\s*(.*)$/;

/** One `## ` section of a pending file, as written, with what the review needs from it. */
export interface DraftSection {
  /** The section as written, trimmed: the heading, the meta lines, the body. */
  text: string;
  title: string;
  aliases: string[];
  /** 类型: 事实 | 惯例 | 规则 | 梗 | 社区观点 | 未确认 ('' when not said). */
  type: string;
  source: string;
  /** Its body starts with `（修改已有条目）`: a change to an existing entry. */
  change: boolean;
}

/** A Markdown file of `## ` sections: the text before the first one, and each section, trimmed. */
export function splitSections(markdown: string): { head: string; sections: string[] } {
  const parts = markdown.split(/^(?=## )/m);
  const head = parts[0]!.startsWith('## ') ? '' : parts.shift()!.trim();
  return { head, sections: parts.map((part) => part.trim()).filter(Boolean) };
}

/** The sections back as a file: a blank line between them; '' when there are none. */
export function joinSections(head: string, sections: readonly string[]): string {
  const parts = [head, ...sections].filter(Boolean);
  return parts.length ? `${parts.join('\n\n')}\n` : '';
}

/** A section's heading, meta lines and body, read as parseKnowledge reads them. */
export function readSection(text: string): DraftSection {
  text = text.replace(NOTE, '').trim();
  const [heading = '', ...rest] = text.split(/\r?\n/);
  const meta: Record<string, string> = {};
  let at = 0;
  for (; at < rest.length; at++) {
    const line = rest[at]!.trim();
    if (!line) continue;
    const found = META.exec(line);
    if (!found) break;
    meta[found[1]!] = found[2]!.trim();
  }
  const body = rest.slice(at).join('\n').trim();
  return {
    text: text.trim(),
    title: heading.replace(/^##\s*/, '').trim(),
    aliases: (meta.aliases ?? '')
      .split(/[,，、]/)
      .map((alias) => alias.trim())
      .filter(Boolean),
    type: meta['类型'] ?? '',
    source: meta['来源'] ?? '',
    change: body.startsWith('（修改已有条目）'),
  };
}

export type Verdict = 'accept' | 'reject';

/** What the reviewer decides for one draft. */
export interface Review {
  verdict: Verdict;
  reason: string;
  /** The file of the folder it belongs in (an existing one, or a new name). */
  file: string;
  /** The web pages the reviewer used. */
  checked: string[];
  /**
   * When the draft repeats or changes an existing entry: that entry's title, and the whole entry
   * as it should now read (its heading, meta lines and body, with what the draft adds worked in).
   */
  merge: { title: string; text: string } | null;
}

const WEB_PAGE = /^https?:\/\/\S+$/;

/** The reviewer's answer, checked; null when it isn't one (a wrong verdict, no JSON). */
export function parseReview(text: string): Review | null {
  const json = jsonFrom(text) as Record<string, unknown> | undefined;
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const verdict = json.verdict;
  if (verdict !== 'accept' && verdict !== 'reject') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const merge = json.merge as Record<string, unknown> | null | undefined;
  const mergeTitle = merge && typeof merge === 'object' ? str(merge.title) : '';
  const mergeText = merge && typeof merge === 'object' ? str(merge.text) : '';
  return {
    verdict,
    reason: str(json.reason),
    file: str(json.file),
    checked: Array.isArray(json.checked)
      ? json.checked
          .filter((u): u is string => typeof u === 'string')
          .map((u) => u.trim())
          .filter((u) => WEB_PAGE.test(u))
      : [],
    merge: mergeTitle && mergeText ? { title: mergeTitle, text: mergeText } : null,
  };
}

/** A file name the review may write in a folder: lowercase words joined by `-`, `.md`. */
export function validFileName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name);
}

/**
 * What's done with a draft, by code, following the reviewer: `merge` into an existing entry when
 * it says so (the merged text a `## ` section of the same title), `accept` as a new entry when it
 * names a file to go in, `reject` when it says so. `retry` (left in pending, asked again next run)
 * when there's no answer to follow: a failed call, an answer that doesn't parse, an accepted draft
 * with nowhere to go.
 */
export type Decision = 'accept' | 'merge' | 'reject' | 'retry';

export function decide(review: Review | null): Decision {
  if (!review) return 'retry';
  if (review.verdict === 'reject') return 'reject';
  if (review.merge) {
    return readSection(review.merge.text).title === review.merge.title &&
      review.merge.text.startsWith('## ')
      ? 'merge'
      : 'retry';
  }
  return validFileName(review.file) ? 'accept' : 'retry';
}

/** The suffix an accepted section's 来源 gets. */
export function reviewedSuffix(date: string): string {
  return `；自动审核 ${date}`;
}

/** The section with `；自动审核 <date>` at the end of its 来源 line (a 来源 line added when it has none). */
export function withReviewedSource(text: string, date: string): string {
  const lines = text.split('\n');
  let lastMeta = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (!META.test(line)) break;
    if (/^来源\s*[:：]/.test(line)) {
      lines[i] = `${lines[i]!.trimEnd()}${reviewedSuffix(date)}`;
      return lines.join('\n');
    }
    lastMeta = i;
  }
  lines.splice(lastMeta + 1, 0, `来源: 自动审核 ${date}`);
  return lines.join('\n');
}

export interface ReviewPromptInput {
  folder: string;
  /** What the folder is for; from FOLDER_PURPOSES, or '' when not known. */
  purpose: string;
  /** The folder's files with their headings. */
  files: readonly { file: string; titles: readonly string[] }[];
  /** Existing entries of the folder that look related. */
  related: readonly KnowledgeEntry[];
  section: string;
}

/**
 * The reviewer's prompt for one draft section: the template (chat-bot's
 * `prompts/knowledge-review.md`, which a person may edit) with `{{folder}}`, `{{purpose}}`,
 * `{{files}}`, `{{related}}`, `{{section}}` and `{{dataNotInstructions}}` filled in.
 */
export function reviewPrompt(
  template: string,
  { folder, purpose, files, related, section }: ReviewPromptInput,
): string {
  const values: Record<string, string> = {
    folder,
    purpose: purpose || '（没有说明：按文件夹名和里面已有的条目判断它是干什么用的）',
    files: files.length
      ? files.map((f) => `- ${f.file}：${clip(f.titles.join('、'), 300) || '（空）'}`).join('\n')
      : '（这个文件夹还没有文件）',
    related: related.length
      ? related.map((e) => clip(e.text, 600)).join('\n')
      : '（没有看起来相关的条目）',
    section,
    dataNotInstructions: DATA_NOT_INSTRUCTIONS,
  };
  return template.trim().replace(/\{\{(\w+)\}\}/g, (all, name: string) => values[name] ?? all);
}

/** A review log's block for one accepted section: where it went and its text as written. */
export function acceptedBlock(path: string, text: string): string {
  return `### 收进 ${path}\n\n\`\`\`\`markdown\n${text}\n\`\`\`\`\n`;
}

/** The accepted sections in a review log, with where each went. */
export function acceptedIn(log: string): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const block = /^### 收进 (\S+)\n\n````markdown\n([\s\S]*?)\n````$/gm;
  for (let m = block.exec(log); m; m = block.exec(log)) found.push({ path: m[1]!, text: m[2]! });
  return found;
}

/** A review log's block for one merge: the file, the entry as it was, and as it became. */
export function mergedBlock(path: string, before: string, after: string): string {
  return `### 合并进 ${path}\n\n原来：\n\n\`\`\`\`markdown\n${before}\n\`\`\`\`\n\n合并后：\n\n\`\`\`\`markdown\n${after}\n\`\`\`\`\n`;
}

/** The merges in a review log, with each entry before and after. */
export function mergedIn(log: string): { path: string; before: string; after: string }[] {
  const found: { path: string; before: string; after: string }[] = [];
  const block =
    /^### 合并进 (\S+)\n\n原来：\n\n````markdown\n([\s\S]*?)\n````\n\n合并后：\n\n````markdown\n([\s\S]*?)\n````$/gm;
  for (let m = block.exec(log); m; m = block.exec(log)) {
    found.push({ path: m[1]!, before: m[2]!, after: m[3]! });
  }
  return found;
}

/** The `- <folder>/<title>` lines of a still-right list. */
export function stillRightEntries(markdown: string): { folder: string; title: string }[] {
  return markdown
    .split('\n')
    .map((line) => /^-\s+([^/\s]+)\/(.+)$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ folder: m[1]!, title: m[2]!.trim() }));
}

/** The section with its 复查 date set to `date` (a 复查 line added after the meta lines when it has none). */
export function withReviewDate(text: string, date: string): string {
  const lines = text.split('\n');
  let lastMeta = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (!META.test(line)) break;
    if (/^复查\s*[:：]/.test(line)) {
      lines[i] = `复查: ${date}`;
      return lines.join('\n');
    }
    lastMeta = i;
  }
  lines.splice(lastMeta + 1, 0, `复查: ${date}`);
  return lines.join('\n');
}
