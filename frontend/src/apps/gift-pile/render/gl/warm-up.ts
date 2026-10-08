import { parallelCompile, type Program } from './program';
import { log } from './log';

/** A program waiting to be finished, and what to do when it is (`failure` is null if it linked). */
export interface Pending {
  readonly program: Program;
  /** Called with why it failed, or null. */
  settle(failure: Error | null): void;
}

const ms = (n: number) => `${n.toFixed(1)} ms`;

/** Resolve one program, tell its owner, and log how long that took in a dev build. */
export function settle(job: Pending, since: number): void {
  const t0 = performance.now();
  try {
    job.program.resolve();
    log.debug(
      `program ${job.program.name}: ready ${ms(performance.now() - since)} after start, waited ${ms(performance.now() - t0)}`,
    );
    job.settle(null);
  } catch (error) {
    job.settle(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Finishes the compiles that were started up front without ever freezing the page. Where the
 * browser can compile in parallel (`KHR_parallel_shader_compile`) every program is already
 * compiling and each `step` takes the ones that have finished, never waiting; otherwise a
 * `step` compiles and links one program, so the cost is spread over frames.
 */
export class WarmUp {
  private pending: Pending[] = [];
  private readonly parallel: boolean;
  private readonly started = performance.now();

  constructor(gl: WebGL2RenderingContext) {
    this.parallel = parallelCompile(gl) !== null;
  }

  /** Whether compiles run in parallel. */
  get isParallel(): boolean {
    return this.parallel;
  }

  /** Start `job`'s program compiling, and finish it in a later `step`. */
  add(job: Pending): void {
    job.program.start();
    this.pending.push(job);
  }

  /** Nothing is left to finish. */
  get done(): boolean {
    return this.pending.length === 0;
  }

  /** Finish what can be finished without waiting (without parallel compile, one program). */
  step(): void {
    if (this.pending.length === 0) return;
    const rest: Pending[] = [];
    let budget = this.parallel ? Infinity : 1;
    for (const job of this.pending) {
      if (budget > 0 && (!this.parallel || job.program.ready())) {
        budget--;
        settle(job, this.started);
      } else {
        rest.push(job);
      }
    }
    this.pending = rest;
    if (rest.length === 0)
      log.debug(`all programs ready ${ms(performance.now() - this.started)} after start`);
  }
}
