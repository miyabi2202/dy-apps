import type { KnowledgeIndex } from '../core/knowledge';
import {
  douyinJudgePrompt,
  kbJudgePrompt,
  parseResolution,
  settled,
  webPrompt,
  type Resolution,
} from '../core/resolve';
import type { ReadItem } from '../core/types';
import { refsOf, type Unknown } from '../core/understand';
import type { AskClaude, Log } from './ports';

export interface UnknownResolverOptions {
  /** Claude with no tools: judges what the knowledge base and Douyin say. */
  ask: AskClaude;
  /** Claude with only WebSearch and WebFetch; none to skip the web. */
  askWeb?: AskClaude | null;
  index: KnowledgeIndex;
  log: Log;
  /** Today, YYYY-MM-DD, for the web prompt. */
  today: () => string;
}

/**
 * Looks an unknown up in stages, each recorded with how far it supports the answer (Self-RAG's
 * labels): the knowledge base first (only when it has an entry about the term), then the web. What
 * neither settles in full is searched on Douyin by the topic learner, and judged here on what that
 * search read. A stage that fails is recorded as `none`, never a failed run.
 */
export class UnknownResolver {
  constructor(private readonly options: UnknownResolverOptions) {}

  /** The knowledge base, then the web, stopping at the first that settles it. */
  async offline(unknown: Unknown): Promise<Resolution[]> {
    const { ask, askWeb, index, today } = this.options;
    const resolutions: Resolution[] = [];
    const entries = index.lookup(unknown.term);
    resolutions.push(
      entries.length
        ? await this.stage('kb', unknown, () => ask(kbJudgePrompt(unknown, entries)))
        : { source: 'kb', supports: 'none', answer: '知识库里没有' },
    );
    if (settled(resolutions) || !askWeb) return resolutions;
    resolutions.push(await this.stage('web', unknown, () => askWeb(webPrompt(unknown, today()))));
    return resolutions;
  }

  /** Judged on what a Douyin search for it read. */
  onDouyin(unknown: Unknown, items: readonly ReadItem[]): Promise<Resolution> {
    if (!items.length) {
      return Promise.resolve({
        source: 'douyin',
        supports: 'none',
        answer: '抖音上没搜到作品',
        refs: [],
      });
    }
    return this.stage(
      'douyin',
      unknown,
      () => this.options.ask(douyinJudgePrompt(unknown, items)),
      refsOf(items),
    );
  }

  private async stage(
    source: Resolution['source'],
    unknown: Unknown,
    asking: () => Promise<string>,
    known?: ReadonlySet<string>,
  ): Promise<Resolution> {
    try {
      const resolution = parseResolution(await asking(), source, unknown, known);
      this.options.log(
        `unknown looked up {term: ${unknown.term}, source: ${source}, supports: ${resolution.supports}}`,
      );
      return resolution;
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      this.options.log(
        `unknown lookup failed {term: ${unknown.term}, source: ${source}, why: ${why}}`,
      );
      return { source, supports: 'none', answer: `没查成：${why}` };
    }
  }
}
