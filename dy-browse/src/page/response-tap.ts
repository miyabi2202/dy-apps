import type { Page } from 'playwright-core';
import type { ResponseTap } from '../app/ports';
import { answerKindOf, type AnswerKind } from '../douyin/page-map';

/**
 * The JSON calls the page makes as it browses, kept as raw text by what they are (see
 * `answerKindOf`). The steps drain them after a pause, by which time the body has come in.
 */
export class PageResponseTap implements ResponseTap {
  private readonly bodies = new Map<AnswerKind, string[]>();

  constructor(page: Page) {
    page.on('response', (response) => {
      const kind = answerKindOf(response.url());
      if (!kind) return;
      void response.text().then(
        (text) => {
          const list = this.bodies.get(kind) ?? [];
          list.push(text);
          this.bodies.set(kind, list);
        },
        () => {
          // A body that can't be read (the page moved on) is no answer.
        },
      );
    });
  }

  drain(kind: AnswerKind): string[] {
    const list = this.bodies.get(kind) ?? [];
    this.bodies.delete(kind);
    return list;
  }
}
