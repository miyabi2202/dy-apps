/** Whether this is a dev build (Vite's `import.meta.env.DEV`), for timings that are not worth shipping. */
export const DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;

/** Log `message` to the console in a dev build, with a `[gl]` tag the smoke runs can find. */
export function devLog(message: string): void {
  if (DEV) console.info(`[gl] ${message}`);
}
