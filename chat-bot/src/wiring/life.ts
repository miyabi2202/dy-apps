import { join, resolve } from 'node:path';
import { lifeFiles } from '../adapters/files/life-files';
import { browseThoughtsFiles, watchedFiles } from '../adapters/files/watched-files';
import {
  livePersonaBase,
  liveText,
  liveWording,
  sharedLifeFile,
  sharedPersonaFile,
} from '../adapters/files/prompt-files';
import { LifeWriter } from '../app/life/life-writer';
import type { Container } from './container';
import type { FeatureRegistry } from './features';
import {
  ASK_CLAUDE,
  BOT_NAMES,
  BROWSE_THOUGHTS,
  LIFE,
  LIFE_WRITER,
  WATCHED,
  LOG,
  OPTIONS,
  PROMPT,
  PROMPTS_DIR,
  ROOM_CONFIG,
  ROOM_DIR,
} from './tokens';

/**
 * The personas' own days: a shared persona with a life.md in chat-bot/prompts/personas/<name>/ gets a
 * day written each day she's played (data/lives/<name>/<date>.md), and every room playing her shows
 * the latest at the end of her persona. Her account's own browsing of Douyin (data/browse/watched/) goes
 * into her day's prompt as `{{watched}}`, and her thoughts from it (data/browse/thoughts/) as
 * `{{browseThoughts}}`.
 */
export function registerLife(container: Container, features: FeatureRegistry): void {
  features.add('life', (c) => {
    const writer = c.resolve(LIFE_WRITER);
    return {
      name: 'life',
      start: () => void writer.loop(),
      stop: () => writer.stop(),
    };
  });
  container
    .register(LIFE, (c) => lifeFiles(join(resolve(c.resolve(OPTIONS).dataDir), 'lives')))
    // What the browsing account watched (`pnpm browse --feed`), read on every use.
    .register(WATCHED, (c) =>
      watchedFiles(join(resolve(c.resolve(OPTIONS).dataDir), 'browse', 'watched')),
    )
    // Her thoughts after a browse run, read on every use.
    .register(BROWSE_THOUGHTS, (c) =>
      browseThoughtsFiles(join(resolve(c.resolve(OPTIONS).dataDir), 'browse', 'thoughts')),
    )
    .register(LIFE_WRITER, (c) => {
      const sharedDir = join(c.resolve(PROMPTS_DIR), 'personas');
      const roomConfig = c.resolve(ROOM_CONFIG);
      const names = c.resolve(BOT_NAMES);
      return new LifeWriter({
        ask: c.resolve(ASK_CLAUDE)('life'),
        promptTemplate: c.resolve(PROMPT)('life'),
        life: c.resolve(LIFE),
        watched: c.resolve(WATCHED),
        browseThoughts: c.resolve(BROWSE_THOUGHTS),
        wording: liveWording(join(c.resolve(PROMPTS_DIR), 'wording.md')),
        persona: livePersonaBase({
          roomDir: c.resolve(ROOM_DIR),
          file: () => roomConfig().persona,
        }),
        personaText: (name) => liveText(sharedPersonaFile(sharedDir, name))(),
        guide: (name) => liveText(sharedLifeFile(sharedDir, name))() || null,
        timeZone: () => names.timeZone(),
        log: c.resolve(LOG),
      });
    });
}
