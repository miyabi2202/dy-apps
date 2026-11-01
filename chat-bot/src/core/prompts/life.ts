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

/** How many of the videos the persona watched the prompt shows. */
export const WATCHED_SHOWN = 5;

/** How many of the persona's thoughts from browsing Douyin the prompt shows. */
export const BROWSE_THOUGHTS_SHOWN = 4;

/** The day before `date` (`YYYY-MM-DD`). */
export function dayBefore(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! - 1)).toISOString().slice(0, 10);
}

/** `lines` as the prompt lists them, a `- ` each. */
export function watchedList(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join('\n');
}
