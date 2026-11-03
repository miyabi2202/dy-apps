import { KnowledgeIndex, parseKnowledge, type KnowledgeEntry } from '../core/knowledge';
import { addDays, REVIEW_DAYS } from '../core/drafts';
import {
  acceptedBlock,
  acceptedIn,
  decide,
  FOLDER_PURPOSES,
  joinSections,
  mergedBlock,
  mergedIn,
  parseReview,
  readSection,
  reviewPrompt,
  splitSections,
  stillRightEntries,
  validFileName,
  withReviewDate,
  withReviewedSource,
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
  /** The reviewer's prompt template (chat-bot's `prompts/knowledge-review.md`), read on every use. */
  template: () => string | null;
  log: Log;
  now?: () => number;
  /** What each folder is for. */
  purposes?: Record<string, string>;
}

export type Outcome = 'accepted' | 'merged' | 'rejected' | 'dropped' | 'retry';

export type ReviewSummary = Record<Outcome, number> & {
  /** Entries of the still-right lists whose 复查 moved on. */
  stillRight: number;
};

/**
 * The automatic review of knowledge drafts (`knowledge/pending/<folder>/*.md`), with no person
 * after it: each `## ` section is accepted into the knowledge base as a new entry, merged into the
 * existing entry it repeats or changes, or dropped. 未确认 notes are dropped by code; every other
 * section goes to one web-enabled Claude call (the prompt is chat-bot's
 * `prompts/knowledge-review.md`, read on every run), and code follows its answer (`decide`). A
 * section with no answer to follow stays pending for the next run. The still-right lists move
 * their entries' 复查 on. Everything done is logged in `review/<date>.md`, with each accepted
 * section's text and each merged entry before and after, so `undo` can take it back.
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
        (folder === null || parts[depth] === folder)
      );
    });
  }

  /** The still-right lists: `pending/still-right-<date>.md`. */
  private stillRightFiles(): string[] {
    const depth = PENDING_DIR.split('/').length;
    return this.options.bot.list(PENDING_DIR).filter((path) => {
      const parts = path.split('/');
      return parts.length === depth + 1 && parts[depth]!.startsWith('still-right-');
    });
  }

  async run(folder: string | null): Promise<ReviewSummary> {
    const { log } = this.options;
    const summary: ReviewSummary = {
      accepted: 0,
      merged: 0,
      rejected: 0,
      dropped: 0,
      retry: 0,
      stillRight: 0,
    };
    const files = this.pendingFiles(folder);
    if (!files.length) log(`没有待审的草稿${folder ? `（文件夹 ${folder}）` : ''}。`);
    for (const path of files) {
      const draftFolder = path.split('/')[PENDING_DIR.split('/').length]!;
      const { head, sections } = splitSections(this.options.bot.read(path) ?? '');
      const kept: string[] = [];
      for (let i = 0; i < sections.length; i++) {
        this.startLog();
        const section = readSection(sections[i]!);
        const { outcome, reason, target, block } = await this.review(draftFolder, section);
        summary[outcome]++;
        if (outcome === 'retry') kept.push(section.text);
        log(`reviewed {title: ${section.title}, outcome: ${outcome}, reason: ${reason}}`);
        this.logLine(
          `- ${section.title}（${draftFolder}）：${outcome}，${reason}${target ? ` → ${target}` : ''}`,
        );
        if (block) this.logLine(`\n${block}`);
        // Written after each section, so a run that stops halfway doesn't accept anything twice.
        this.writePending(path, head, [...kept, ...sections.slice(i + 1)]);
      }
    }
    summary.stillRight = this.moveStillRight(folder);
    log(
      `review done {accepted: ${summary.accepted}, merged: ${summary.merged}, rejected: ${summary.rejected}, dropped: ${summary.dropped}, retry: ${summary.retry}, stillRight: ${summary.stillRight}}`,
    );
    return summary;
  }

  /** One section: what's done with it, where it went, and its review-log block. */
  private async review(
    folder: string,
    section: DraftSection,
  ): Promise<{ outcome: Outcome; reason: string; target: string | null; block: string | null }> {
    const today = this.today();
    if (section.type === '未确认') {
      return {
        outcome: 'dropped',
        reason: '未确认的笔记，不是条目（已记在 searches/ 里）',
        target: null,
        block: null,
      };
    }
    let review: Review | null;
    let why = '';
    try {
      review = parseReview(await this.options.ask(this.prompt(folder, section)));
      if (!review) why = '审核没有给出能读的回答，下次再审';
    } catch (e) {
      review = null;
      why = `审核调用失败：${clip(e instanceof Error ? e.message : String(e), 80)}，下次再审`;
    }
    let decision = decide(review);
    if (review && decision === 'retry' && !why) why = '收了但没给出能用的文件或合并结果，下次再审';
    if (review && decision === 'merge') {
      const merged = this.merge(
        folder,
        review.merge!.title,
        withReviewedSource(review.merge!.text, today),
      );
      if (merged) {
        return {
          outcome: 'merged',
          reason: review.reason || '（没说理由）',
          target: merged.path,
          block: mergedBlock(merged.path, merged.before, merged.after),
        };
      }
      // The entry it names isn't there: it goes in as a new one, if it has a file.
      decision = validFileName(review.file) ? 'accept' : 'retry';
      why = `没找到要合并的「${review.merge!.title}」${decision === 'accept' ? '，当新条目收' : '，下次再审'}`;
    }
    const reason = [review?.reason, why].filter(Boolean).join('；') || '（没说理由）';
    if (decision === 'accept' && review) {
      const target = `${KNOWLEDGE_DIR}/${folder}/${review.file}`;
      const text = withReviewedSource(section.text, today);
      const existing = this.options.bot.read(target);
      this.options.bot.write(
        target,
        existing?.trim() ? `${existing.trimEnd()}\n\n${text}\n` : `${text}\n`,
      );
      return { outcome: 'accepted', reason, target, block: acceptedBlock(target, text) };
    }
    if (decision === 'reject') return { outcome: 'rejected', reason, target: null, block: null };
    return { outcome: 'retry', reason, target: null, block: null };
  }

  /** Puts `after` in place of the folder's entry titled `title`: the file and the entry before, or null when there's none. */
  private merge(
    folder: string,
    title: string,
    after: string,
  ): { path: string; before: string; after: string } | null {
    const { bot } = this.options;
    for (const { file } of this.entries(folder)) {
      const path = `${KNOWLEDGE_DIR}/${folder}/${file}`;
      const { head, sections } = splitSections(bot.read(path) ?? '');
      const at = sections.findIndex((s) => readSection(s).title === title);
      if (at < 0) continue;
      const before = sections[at]!;
      bot.write(
        path,
        joinSections(
          head,
          sections.map((s, i) => (i === at ? after : s)),
        ),
      );
      return { path, before, after };
    }
    return null;
  }

  /**
   * Moves on the 复查 of each entry in the still-right lists (of one folder, or all) by its type's
   * REVIEW_DAYS from today, never earlier than it was. A list is deleted once nothing in it is
   * left; an entry that isn't in the knowledge base is only logged.
   */
  private moveStillRight(folder: string | null): number {
    const { bot, log } = this.options;
    const today = this.today();
    let moved = 0;
    for (const path of this.stillRightFiles()) {
      const text = bot.read(path) ?? '';
      const listed = stillRightEntries(text);
      const mine = listed.filter((e) => folder === null || e.folder === folder);
      for (const { folder: f, title } of mine) {
        this.startLog();
        const found = this.findEntry(f, title);
        if (!found) {
          log(`still right, not found {folder: ${f}, title: ${title}}`);
          this.logLine(`- ${title}（${f}）：仍然正确，但知识库里没有这一条，没动`);
          continue;
        }
        const entry = readSection(found.text);
        const current = /^复查\s*[:：]\s*(\S+)/m.exec(found.text)?.[1] ?? '';
        const next = addDays(today, REVIEW_DAYS[entry.type] ?? 30);
        if (next > current)
          this.replaceEntry(found.path, found.text, withReviewDate(found.text, next));
        log(
          `still right {folder: ${f}, title: ${title}, review: ${next > current ? next : current}}`,
        );
        this.logLine(
          `- ${title}（${f}）：仍然正确，复查 ${current || '（没有）'} → ${next > current ? next : current}`,
        );
        moved++;
      }
      const left = listed.filter((e) => !mine.includes(e));
      if (left.length) {
        const head = text.split('\n').find((line) => line.startsWith('#')) ?? '';
        bot.write(
          path,
          `${[head, '', ...left.map((e) => `- ${e.folder}/${e.title}`)].join('\n')}\n`,
        );
      } else {
        bot.remove(path);
      }
    }
    return moved;
  }

  /** The folder's entry titled `title`: its file and its text as written, or null. */
  private findEntry(folder: string, title: string): { path: string; text: string } | null {
    for (const { file } of this.entries(folder)) {
      const path = `${KNOWLEDGE_DIR}/${folder}/${file}`;
      const text = splitSections(this.options.bot.read(path) ?? '').sections.find(
        (s) => readSection(s).title === title,
      );
      if (text) return { path, text };
    }
    return null;
  }

  /** Replaces the section `from` in `path` with `to`; false when it isn't there. */
  private replaceEntry(path: string, from: string, to: string): boolean {
    const { bot } = this.options;
    const { head, sections } = splitSections(bot.read(path) ?? '');
    const at = sections.indexOf(from);
    if (at < 0) return false;
    bot.write(
      path,
      joinSections(
        head,
        sections.map((s, i) => (i === at ? to : s)),
      ),
    );
    return true;
  }

  private prompt(folder: string, section: DraftSection): string {
    const entries = this.entries(folder);
    const index = new KnowledgeIndex(entries.flatMap((f) => f.entries));
    const related: KnowledgeEntry[] = [];
    for (const name of [section.title, ...section.aliases]) {
      for (const entry of index.lookup(name, 3)) if (!related.includes(entry)) related.push(entry);
    }
    const template = this.options.template();
    if (!template?.trim())
      throw new Error('没有审核的 prompt（chat-bot/prompts/knowledge-review.md）');
    return reviewPrompt(template, {
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
   * Takes back what the review of `date` did: each accepted section (matched by its exact text) is
   * removed from the file it went into, and each merged entry is put back as it was. The drafts
   * aren't put back in pending (the next review would only judge them again); their text stays in
   * the review log. What's no longer there is only logged.
   */
  undo(date: string): { undone: number; missing: number } {
    const { bot, data, log } = this.options;
    const logPath = `${REVIEW_DIR}/${date}.md`;
    const reviewLog = data.read(logPath) ?? '';
    const accepted = acceptedIn(reviewLog);
    const merged = mergedIn(reviewLog);
    if (!accepted.length && !merged.length) log(`review/${date}.md 里没有收进或合并的条目。`);
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
      lines.push(`- 撤回 ${title}（从 ${path} 删掉）`);
      log(`undone {title: ${title}, from: ${path}}`);
      undone++;
    }
    for (const { path, before, after } of merged) {
      const title = readSection(after).title;
      if (!this.replaceEntry(path, after, before)) {
        lines.push(`- 没找到合并后的 ${title}（${path}），没动`);
        log(`undo missing {title: ${title}, file: ${path}}`);
        continue;
      }
      lines.push(`- 撤回合并 ${title}（${path} 里换回原来的）`);
      log(`undone merge {title: ${title}, file: ${path}}`);
      undone++;
    }
    if (accepted.length || merged.length) {
      data.append(
        logPath,
        `\n## 撤回 ${new Date(this.now()).toISOString()}\n\n${lines.join('\n')}\n`,
      );
    }
    return { undone, missing: accepted.length + merged.length - undone };
  }

  private today(): string {
    return dateOf(this.now());
  }

  /** Starts this run's part of the review log, once. */
  private startLog(): void {
    if (this.started) return;
    this.started = true;
    this.logLine(`\n## 审核 ${new Date(this.now()).toISOString()}\n`);
  }

  private started = false;

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
