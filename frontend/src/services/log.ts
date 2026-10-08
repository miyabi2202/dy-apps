/** How much the app logs, quietest last. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

// Defined by Vite (`config/vite.config.ts`): `debug` on the dev server, `warn` in a build, or the
// `LOG_LEVEL` environment variable. Undefined where nothing defines it (Jest), which is silent.
declare const __LOG_LEVEL__: string | undefined;

/** The level this build logs at: messages below it are dropped. */
export const LOG_LEVEL: LogLevel =
  typeof __LOG_LEVEL__ === 'string' && (LEVELS as readonly string[]).includes(__LOG_LEVEL__)
    ? (__LOG_LEVEL__ as LogLevel)
    : 'silent';

/** Whether a message at `level` is logged. */
export function logs(level: Exclude<LogLevel, 'silent'>): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(LOG_LEVEL);
}

/**
 * Log `message` at debug level, tagged `[tag]` so it is easy to filter (and for scripts watching
 * the console to find), e.g. `debugLog('gl', 'first frame drawn')`. For timings and traces that
 * are not worth shipping: only the dev server logs at debug level by default.
 */
export function debugLog(tag: string, message: string): void {
  if (logs('debug')) console.info(`[${tag}] ${message}`);
}
