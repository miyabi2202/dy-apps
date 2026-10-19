/**
 * `text` as a JSON object, or null when it isn't one (not JSON, or JSON of another kind). Each
 * answer parser checks the fields it needs itself.
 */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
