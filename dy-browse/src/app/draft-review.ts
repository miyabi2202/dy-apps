import { KnowledgeIndex, parseKnowledge, type KnowledgeEntry } from '../core/knowledge';
import {
  acceptedBlock,
  acceptedIn,
  decide,
  FOLDER_PURPOSES,
  joinSections,
  noteFor,
  parseReview,
  readSection,
  reviewPrompt,
  splitSections,
  withNote,
  withoutReviewedSource,
  withReviewedSource,
  type Decision,
  type DraftSection,
  type Review,
} from '../core/review';
import { clip, dateOf } from '../core/text';
import { PENDING_DIR } from './draft-store';
import type { AskClaude, DataStore, Log } from './ports';

/** Where the chat bot's knowledge base is, under its `data/`. */
export const KNOWLEDGE_DIR = 'knowledge';
/** Where the review logs go, under dy-browse's `data/`: `review/<date>.md`. */
export const REVIEW_DIR = 'review';

export interface DraftReviewOptions {
  /** The chat bot's `data/`: the knowledge base and its pending drafts. */
  bot: DataStore;
  /** dy-browse's `data/`: the review log. */
  data: DataStore;
  /** The reviewer: Claude with the web (WebSearch, WebFetch), not the call that drafted. */
  ask: AskClaude;
  log: Log;
  now?: () => number;
  /** What each folder is for. */
  purposes?: Record<string, string>;
}

export type Outcome = 'accepted' | 'rejected' | 'asked' | 'dropped' | 'skipped';

export interface ReviewSummary {
  accepted: number;
  rejected: number;
  asked: number;
  dropped: number;
  /** Already carried a note: left for the person, not asked again. */
  skipped: number;
}

/**
 * The automatic review of knowledge drafts (`knowledge/pending/<folder>/*.md`): each `## ` section
 * is accepted into the knowledge base, dropped, or left for a person with the reviewer's note. Code
 * decides first (未确认 notes dropped, changes to existing entries and noted sections left), then one
 * web-enabled Claude call per section proposes, and code decides (`decide`). Everything done is
 * logged in `review/<date>.md`, with each accepted section's text, so `undo` can take it back.
 */
export class DraftReview {
  private readonly now: () => number;

  constructor(private readonly options: DraftReviewOptions) {
    this.now = options.now ?? Date.now;
  }

  /** The pending drafts files, of one folder or all; not the still-right lists. */
  pendingFiles(folder: string | null): string[] {
    const depth = PENDING_DIR.split('/').length;
    return this.options.bot.list(PENDING_DIR).filter((path) => {
      const parts = path.split('/');
      return (
        parts.length === depth + 2 &&
        path.endsWith('.md') &&
        !parts[depth + 1]!.startsWith('still-right-') &&
        (folder === null || parts[depth] === folder)
      );
    });
  }

  async run(folder: string | null): Promise<ReviewSummary> {
    const { log } = this.options;
    const summary: ReviewSummary = { accepted: 0, rejected: 0, asked: 0, dropped: 0, skipped: 0 };
    const files = this.pendingFiles(folder);
    if (!files.length) log(`没有待审的草稿${folder ? `（文件夹 ${folder}）` : ''}。`);
    let started = false;
    for (const path of files) {
      const draftFolder = path.split('/')[PENDING_DIR.split('/').length]!;
      const { head, sections } = splitSections(this.options.bot.read(path) ?? '');
      const kept: string[] = [];
      for (let i = 0; i < sections.length; i++) {
        if (!started) {
          this.logLine(`\n## 审核 ${new Date(this.now()).toISOString()}\n`);
          started = true;
        }
        const section = readSection(sections[i]!);
        const { outcome, reason, target, text } = await this.review(draftFolder, section);
        summary[outcome]++;
        if (text !== null && (outcome === 'asked' || outcome === 'skipped')) kept.push(text);
        log(`reviewed {title: ${section.title}, outcome: ${outcome}, reason: ${reason}}`);
        this.logLine(
          `- ${section.title}（${draftFolder}）：${outcome}，${reason}${target ? ` → ${target}` : ''}`,
        );
        if (outcome === 'accepted' && target && text)
          this.logLine(`\n${acceptedBlock(target, text)}`);
        // Written after each section, so a run that stops halfway doesn't accept anything twice.
        this.writePending(path, head, [...kept, ...sections.slice(i + 1)]);
      }
    }
    log(
      `review done {accepted: ${summary.accepted}, rejected: ${summary.rejected}, asked: ${summary.asked}, dropped: ${summary.dropped}, skipped: ${summary.skipped}}`,
    );
    return summary;
  }

  /** One section: what's done with it, and its text as kept (asked) or as written (accepted). */
  private async review(
    folder: string,
    section: DraftSection,
  ): Promise<{ outcome: Outcome; reason: string; target: string | null; text: string | null }> {
    const today = this.today();
    if (section.type === '未确认') {
      return {
        outcome: 'dropped',
        reason: '未确认的笔记，不是条目（已记在 searches/ 里）',
        target: null,
        text: null,
      };
    }
    if (section.noted) {
      return {
        outcome: 'skipped',
        reason: '已有审核意见，等人来看',
        target: null,
        text: section.text,
      };
    }
    if (section.change) {
      const note = 'ask/code，修改已有条目，要人对照原条目来改';
      return {
        outcome: 'asked',
        reason: '修改已有条目',
        target: null,
        text: withNote(section.text, today, note),
      };
    }
    let review: Review | null;
    let decision: Decision;
    try {
      review = parseReview(await this.options.ask(this.prompt(folder, section)));
      decision = decide(review, section);
    } catch (e) {
      review = null;
      decision = {
        outcome: 'ask',
        why: `审核调用失败：${clip(e instanceof Error ? e.message : String(e), 80)}`,
      };
    }
    const reason = [review?.reason, decision.why].filter(Boolean).join('；') || '（没说理由）';
    if (decision.outcome === 'accept' && review) {
      const target = `${KNOWLEDGE_DIR}/${folder}/${review.file}`;
      const text = withReviewedSource(section.text, today);
      const existing = this.options.bot.read(target);
      this.options.bot.write(
        target,
        existing?.trim() ? `${existing.trimEnd()}\n\n${text}\n` : `${text}\n`,
      );
      return { outcome: 'accepted', reason, target, text };
    }
    if (decision.outcome === 'reject')
      return { outcome: 'rejected', reason, target: null, text: null };
    return {
      outcome: 'asked',
      reason,
      target: null,
      text: withNote(section.text, today, noteFor(review, decision)),
    };
  }

  private prompt(folder: string, section: DraftSection): string {
    const entries = this.entries(folder);
    const index = new KnowledgeIndex(entries.flatMap((f) => f.entries));
    const related: KnowledgeEntry[] = [];
    for (const name of [section.title, ...section.aliases]) {
      for (const entry of index.lookup(name, 3)) if (!related.includes(entry)) related.push(entry);
    }
    return reviewPrompt({
      folder,
      purpose: (this.options.purposes ?? FOLDER_PURPOSES)[folder] ?? '',
      files: entries.map((f) => ({ file: f.file, titles: f.entries.map((e) => e.title) })),
      related: related.slice(0, 5),
      section: section.text,
    });
  }

  /** The folder's knowledge files (not its subfolders), read fresh, so what was accepted counts. */
  private entries(folder: string): { file: string; entries: KnowledgeEntry[] }[] {
    const { bot } = this.options;
    const dir = `${KNOWLEDGE_DIR}/${folder}`;
    return bot
      .list(dir)
      .filter((path) => path.endsWith('.md') && path.split('/').length === 3)
      .map((path) => ({
        file: path.slice(dir.length + 1),
        entries: parseKnowledge(bot.read(path) ?? '', folder),
      }));
  }

  /**
   * Takes back what the review of `date` accepted: each section (matched by its exact text) is
   * removed from the file it went into and put back in `pending/<folder>/<date>-undone.md`, with a
   * note so the next review leaves it for a person. A section no longer there is only logged.
   */
  undo(date: string): { undone: number; missing: number } {
    const { bot, data, log } = this.options;
    const logPath = `${REVIEW_DIR}/${date}.md`;
    const accepted = acceptedIn(data.read(logPath) ?? '');
    if (!accepted.length) log(`review/${date}.md 里没有收进的条目。`);
    const lines: string[] = [];
    let undone = 0;
    for (const { path, text } of accepted) {
      const file = bot.read(path);
      const { head, sections } = splitSections(file ?? '');
      const left = sections.filter((s) => s !== text);
      const title = readSection(text).title;
      if (file === null || left.length === sections.length) {
        lines.push(`- 没找到 ${title}（${path}），没动`);
        log(`undo missing {title: ${title}, file: ${path}}`);
        continue;
      }
      const rest = joinSections(head, left);
      if (rest) bot.write(path, rest);
      else bot.remove(path);
      const folder = path.split('/')[1]!;
      const back = withNote(
        withoutReviewedSource(text, date),
        this.today(),
        `undone，${date} 自动审核收进后被撤回，等人来看`,
      );
      const pending = `${PENDING_DIR}/${folder}/${date}-undone.md`;
      const existing = bot.read(pending);
      bot.write(pending, existing?.trim() ? `${existing.trimEnd()}\n\n${back}\n` : `${back}\n`);
      lines.push(`- 撤回 ${title}（${path} → ${pending}）`);
      log(`undone {title: ${title}, from: ${path}, to: ${pending}}`);
      undone++;
    }
    if (accepted.length) {
      data.append(
        logPath,
        `\n## 撤回 ${new Date(this.now()).toISOString()}\n\n${lines.join('\n')}\n`,
      );
    }
    return { undone, missing: accepted.length - undone };
  }

  private today(): string {
    return dateOf(this.now());
  }

  private logLine(line: string): void {
    const path = `${REVIEW_DIR}/${this.today()}.md`;
    const { data } = this.options;
    if (data.read(path) === null) data.write(path, `# 自动审核 ${this.today()}\n`);
    data.append(path, `${line}\n`);
  }

  private writePending(path: string, head: string, sections: readonly string[]): void {
    const text = joinSections(head, sections);
    if (text) this.options.bot.write(path, text);
    else this.options.bot.remove(path);
  }
}
