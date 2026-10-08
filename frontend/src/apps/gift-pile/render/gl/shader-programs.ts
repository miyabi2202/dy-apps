import type { ShaderSource } from '../gfx';
import { createProgram, parallelCompile, type Program } from './program';
import { SHADE_VS, shadeFragment } from './shaders/shade';
import { settle, type WarmUp } from './warm-up';
import { log } from './log';

interface Entry {
  readonly program: Program;
  state: 'pending' | 'ok' | 'failed';
  readonly started: number;
}

/**
 * The programs of the `ShaderSource`s removers hand `Gfx`, by key: each is compiled once, from
 * the shade vertex shader, the prelude and the source's own GLSL (see `shaders/shade.ts`).
 * `precompile` starts the ones known up front (the renderer does one remover's at a time, see
 * `GlRenderer`); any other starts on its first `get`. Made again
 * with the context, so the cache lives in the per-context resources.
 *
 * A source that fails to compile is logged once (its key and the driver's log), kept as
 * failed, and draws nothing from then on; it never takes the renderer down.
 */
export class ShaderPrograms {
  private readonly entries = new Map<string, Entry>();
  private readonly parallel: boolean;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly warm: WarmUp,
  ) {
    this.parallel = parallelCompile(gl) !== null;
  }

  /**
   * Start every program of `sources` that is not already known, to be finished by `warm` (this
   * cache's own by default). Returns the programs it started: one already compiled, say on use,
   * is left out.
   */
  precompile(sources: readonly ShaderSource[], warm: WarmUp = this.warm): Program[] {
    const started: Program[] = [];
    for (const src of sources) {
      if (this.entries.has(src.key)) continue;
      started.push(this.entry(src, warm).program);
    }
    return started;
  }

  /** Those of `programs` that compiled, for the warm-up draw. */
  linkedAmong(programs: readonly Program[]): Program[] {
    const out: Program[] = [];
    for (const e of this.entries.values()) {
      if (e.state === 'ok' && programs.includes(e.program)) out.push(e.program);
    }
    return out;
  }

  /**
   * The program for `src`, or null if there is none to draw with: it failed, or it is still
   * compiling (the caller draws nothing this frame). Without parallel compile a source that
   * was not precompiled is compiled here, on the spot.
   */
  get(src: ShaderSource): Program | null {
    const e = this.entry(src);
    if (e.state === 'ok') return e.program;
    if (e.state === 'failed') return null;
    if (this.parallel && !e.program.ready()) return null;
    settle({ program: e.program, settle: (failure) => this.finish(src, e, failure) }, e.started);
    return isState(e, 'ok') ? e.program : null;
  }

  private entry(src: ShaderSource, warm: WarmUp = this.warm): Entry {
    const known = this.entries.get(src.key);
    if (known) return known;
    const program = createProgram(this.gl, SHADE_VS, shadeFragment(src.glsl), `shade ${src.key}`);
    const e: Entry = { program, state: 'pending', started: performance.now() };
    this.entries.set(src.key, e);
    warm.add({ program, settle: (failure) => this.finish(src, e, failure) });
    return e;
  }

  private finish(src: ShaderSource, e: Entry, failure: Error | null): void {
    if (e.state !== 'pending') return;
    if (!failure) {
      e.state = 'ok';
      return;
    }
    e.state = 'failed';
    console.error(
      `[gl] shader "${src.key}" failed to compile, so it draws nothing:\n${failure.message}`,
    );
    log.debug(`shader ${src.key} disabled`);
  }
}

/** `e.state` is `state`: a call apart from the narrowing, as `settle` changes it. */
function isState(e: Entry, state: Entry['state']): boolean {
  return e.state === state;
}
