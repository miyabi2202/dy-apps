/** What went wrong, as text for the log: an Error's message, or whatever else was thrown. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
