/** One day of a persona's own life: its date (`YYYY-MM-DD`) and what happened, a `- ` line each. */
export interface LifeDay {
  date: string;
  text: string;
}

/** The heading the persona's latest days go under, at its end (see livePersona). */
export const LIFE_HEADING = '最近的日子';

/** How many of her latest days every prompt shows: enough to have something new to tell, few enough to stay short. */
export const LIFE_DAYS_SHOWN = 5;

/** `days` as the prompts show them: a `### date` heading each, then its lines; empty without any. */
export function lifeText(days: readonly LifeDay[]): string {
  return days.map(({ date, text }) => `### ${date}\n\n${text}`).join('\n\n');
}

/** A model's answer (`{"entries": [...]}`) as a day's lines, `- ` each; empty when there are none. */
export function lifeLines(entries: readonly string[]): string {
  return entries
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((entry) => `- ${entry}`)
    .join('\n');
}
