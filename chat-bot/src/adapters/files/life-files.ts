import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LifeDay, LifeLog } from '../../app/ports';

const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * The personas' own days in `dir` (data/lives/): `<persona>/<YYYY-MM-DD>.md`, one file a day.
 * A day's file is made only if it isn't there yet, so two bots writing the same day keep the first.
 */
export function lifeFiles(dir: string): LifeLog {
  const folder = (persona: string) => join(dir, persona);
  const dates = (persona: string): string[] => {
    try {
      return readdirSync(folder(persona))
        .flatMap((name) => DAY_FILE.exec(name)?.[1] ?? [])
        .sort();
    } catch {
      return [];
    }
  };
  return {
    recent(persona, days) {
      return dates(persona)
        .slice(-days)
        .flatMap((date): LifeDay[] => {
          try {
            return [
              { date, text: readFileSync(join(folder(persona), `${date}.md`), 'utf8').trim() },
            ];
          } catch {
            return [];
          }
        });
    },
    has(persona, date) {
      return dates(persona).includes(date);
    },
    add(persona, date, text) {
      mkdirSync(folder(persona), { recursive: true });
      try {
        writeFileSync(join(folder(persona), `${date}.md`), `${text.trim()}\n`, { flag: 'wx' });
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw err;
      }
    },
  };
}
