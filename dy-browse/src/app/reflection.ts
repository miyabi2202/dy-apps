import {
  commentDraftsText,
  importanceOf,
  MAX_QUESTIONS,
  MIN_IMPORTANCE,
  parseReflection,
  reflectionPrompt,
  takeLine,
  type BrowseMode,
  type ReflectionAnswer,
  type ReadTopic,
} from '../core/reflection';
import { dateOf } from '../core/text';
import type { ReadItem } from '../core/types';
import type { AskClaude, DataStore, Log } from './ports';
import type { QuestionStore } from './question-store';

/** Where her thoughts from browsing go, under the chat bot's `data/`. */
export const THOUGHTS_DIR = 'browse/thoughts';
/** Where the comment drafts go, under dy-browse's `data/`. */
export const COMMENTS_DIR = 'comments';
/** How many of her latest browse thoughts the reflection is shown, to not repeat them. */
const RECENT_THOUGHTS = 20;

/**
 * What the steps of a run read, gathered for the reflection at its end: each step adds its reads,
 * the unknowns it raised, and (the streamer's step) the room and its posts.
 */
export class RunDigest {
  readonly modes = new Set<BrowseMode>();
  private readonly read: ReadItem[] = [];
  newUnknowns = 0;
  streamer: { roomId: string; postIds: Set<string> } | null = null;
  /** The topics searched, each with what its own search read. */
  readonly topics: ReadTopic[] = [];

  add(mode: BrowseMode, reads: readonly ReadItem[], newUnknowns = 0, topic?: ReadTopic): void {
    this.modes.add(mode);
    this.read.push(...reads);
    this.newUnknowns += newUnknowns;
    if (topic) this.topics.push(topic);
  }

  addStreamer(roomId: string, reads: readonly ReadItem[]): void {
    this.add('streamer', reads);
    this.streamer = { roomId, postIds: new Set(reads.map((r) => r.item.id)) };
  }

  /** Each item once, the first reading of it kept. */
  reads(): ReadItem[] {
    const seen = new Set<string>();
    return this.read.filter((r) => !seen.has(r.item.id) && !!seen.add(r.item.id));
  }
}

export interface ReflectionOptions {
  ask: AskClaude;
  /** Her persona (persona.md, then life.md), read when she reflects. */
  persona: () => string;
  /** dy-browse's `data/`: the comment drafts and `questions.json` (through `questions`). */
  data: DataStore;
  /** The chat bot's `data/`: her browse thoughts, and the room's `memory/thoughts.md`. */
  bot: DataStore;
  questions: QuestionStore;
  log: Log;
  now?: () => number;
  /** The least a run must have read (importanceOf) to be reflected on. */
  minImportance?: number;
}

export interface ReflectionResult {
  takes: number;
  questions: number;
  bringUp: number;
  commentDrafts: number;
}

/**
 * Her reflection at the end of a run, in her own voice, once the run read enough (Generative
 * Agents' threshold, with a simple importance score by code; below it, nothing is asked). One
 * Claude call gives her takes (to `browse/thoughts/<date>.md`, which her days are written from),
 * her questions (to `questions.json`, looked up by the next `--topic` or `--knowledge` run), what to
 * bring up next stream (only on a run that read the streamer's posts: the room's
 * `memory/thoughts.md`, which `{{memory}}` shows), and comment drafts (to `comments/<date>.md`, a
 * review list). Nothing is ever posted: there is no code that sends.
 */
export class Reflection {
  constructor(private readonly options: ReflectionOptions) {}

  async reflect(digest: RunDigest): Promise<ReflectionResult | null> {
    const { ask, persona, log, minImportance = MIN_IMPORTANCE, now = Date.now } = this.options;
    const reads = digest.reads();
    const score = importanceOf(reads, digest.newUnknowns);
    // The streamer's own new posts are always worth a thought (and something to bring up).
    if (score < minImportance && !digest.streamer?.postIds.size) {
      log(`reflection skipped {score: ${score}, min: ${minImportance}}`);
      return null;
    }
    const today = dateOf(now());
    const streamerPosts = digest.streamer?.postIds ?? new Set<string>();
    const answer = parseReflection(
      await ask(
        reflectionPrompt({
          persona: persona(),
          modes: [...digest.modes],
          reads,
          topics: digest.topics,
          recentThoughts: this.recentThoughts(),
          streamerPosts,
          today,
        }),
      ),
      {
        postIds: new Set(reads.map((r) => r.item.id)),
        streamerPosts,
        allowBringUp: !!digest.streamer,
        today,
      },
    );
    const result = this.keep(answer, today, digest.streamer?.roomId ?? null);
    log(
      `reflected {score: ${score}, takes: ${result.takes}, questions: ${result.questions}, bringUp: ${result.bringUp}, commentDrafts: ${result.commentDrafts}}`,
    );
    return result;
  }

  private keep(answer: ReflectionAnswer, today: string, roomId: string | null): ReflectionResult {
    const { bot, data, questions } = this.options;
    if (answer.takes.length) {
      const path = `${THOUGHTS_DIR}/${today}.md`;
      if (bot.read(path) === null) bot.write(path, `# ${today} 刷抖音时的想法\n\n`);
      bot.append(path, answer.takes.map((t) => `${takeLine(t)}\n`).join(''));
    }
    const added = questions.add(answer.questions, today, MAX_QUESTIONS);
    if (roomId && answer.bringUp.length) {
      // The room's memory/thoughts.md, in its own format: `2026-10-31：…`, a line each.
      bot.append(
        `${roomId}/memory/thoughts.md`,
        answer.bringUp.map((b) => `${today}：看主人的作品时想到，下次可以提：${b.text}\n`).join(''),
      );
    }
    if (answer.commentDrafts.length) {
      const path = `${COMMENTS_DIR}/${today}.md`;
      if (data.read(path) === null) {
        data.write(
          path,
          `# ${today} 想留的评论（草稿，只供审阅；什么都没有发送，也没有发送的代码）\n\n`,
        );
      }
      data.append(path, `${commentDraftsText(answer.commentDrafts)}\n`);
    }
    return {
      takes: answer.takes.length,
      questions: added.length,
      bringUp: roomId ? answer.bringUp.length : 0,
      commentDrafts: answer.commentDrafts.length,
    };
  }

  /** Her latest browse thoughts, the newest last, without the dash and the ids. */
  private recentThoughts(): string[] {
    const { bot } = this.options;
    return bot
      .list(THOUGHTS_DIR)
      .filter((path) => path.endsWith('.md'))
      .sort()
      .flatMap((path) =>
        (bot.read(path) ?? '')
          .split('\n')
          .flatMap((line) => /^- (.+)$/.exec(line.trim())?.[1] ?? [])
          .map((line) => line.replace(/\s*\[id:[^\]]*\]\s*$/, '')),
      )
      .slice(-RECENT_THOUGHTS);
  }
}
