import type { Log } from '../ports';

/**
 * A feature whose flow is the same each time something happens: build a prompt, ask a model,
 * read its answer, deliver it (into the outbox, say), and log a failure at any step instead of
 * throwing. Each feature gives the steps, and how its failure is logged; `run` puts them in
 * order. `Answer` is what's delivered: `ask` gives `undefined` when the model had nothing to
 * deliver (and has logged why).
 */
export abstract class ModelFeature<Subject, Answer> {
  constructor(protected readonly log: Log) {}

  /** The prompt for `subject`, from the prompt file and the room as it is now. */
  protected abstract buildPrompt(subject: Subject): string;

  /** Asks the model `prompt` and reads its answer; undefined for nothing to deliver. */
  protected abstract ask(subject: Subject, prompt: string): Promise<Answer | undefined>;

  /** Puts the answer where it goes, such as the outbox. */
  protected abstract deliver(subject: Subject, answer: Answer): void;

  /** Logs that a step for `subject` failed, as this feature always has. */
  protected abstract failed(subject: Subject, err: unknown): void;

  /** Runs the flow for `subject`; never rejects. */
  protected async run(subject: Subject): Promise<void> {
    try {
      const answer = await this.ask(subject, this.buildPrompt(subject));
      if (answer !== undefined) this.deliver(subject, answer);
    } catch (err) {
      this.failed(subject, err);
    }
  }
}
