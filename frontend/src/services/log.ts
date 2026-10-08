/** How much the app logs, quietest last. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** A level a message can be logged at. */
export type MessageLevel = Exclude<LogLevel, 'silent'>;

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

// Defined by Vite (`config/vite.config.ts`): `debug` on the dev server, `warn` in a build, or the
// `LOG_LEVEL` environment variable. Undefined where nothing defines it (Jest), which is silent.
declare const __LOG_LEVEL__: string | undefined;

/** The level this build logs at: messages below it are dropped. */
export const LOG_LEVEL: LogLevel =
  typeof __LOG_LEVEL__ === 'string' && (LEVELS as readonly string[]).includes(__LOG_LEVEL__)
    ? (__LOG_LEVEL__ as LogLevel)
    : 'silent';

/** Where messages go: the console's methods of the same names. */
export type LogSink = Pick<Console, MessageLevel>;

export interface LoggerOptions {
  /** Messages below this are dropped; the build's `LOG_LEVEL` by default. */
  level?: LogLevel;
  /** Where messages go; the console by default. */
  sink?: LogSink;
}

/**
 * Logs one part of an app, each message tagged `[tag]` so it is easy to filter (and for scripts
 * watching the console to find). Make one per tag and share it:
 *
 *     const log = new Logger('gl');
 *     log.debug('first frame drawn');
 *
 * Debug is for timings and traces not worth shipping: only the dev server logs it by default.
 */
export class Logger {
  private readonly level: LogLevel;
  private readonly sink: LogSink;

  constructor(
    readonly tag: string,
    { level = LOG_LEVEL, sink = console }: LoggerOptions = {},
  ) {
    this.level = level;
    this.sink = sink;
  }

  /** Whether a message at `level` would be logged, to skip building one that won't be. */
  enabled(level: MessageLevel): boolean {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
  }

  debug(message: string): void {
    this.write('debug', message);
  }

  info(message: string): void {
    this.write('info', message);
  }

  warn(message: string): void {
    this.write('warn', message);
  }

  error(message: string): void {
    this.write('error', message);
  }

  private write(level: MessageLevel, message: string): void {
    if (this.enabled(level)) this.sink[level](`[${this.tag}] ${message}`);
  }
}
