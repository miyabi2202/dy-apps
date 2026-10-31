import { join, resolve } from 'node:path';
import { lifeFiles } from '../adapters/files/life-files';
import {
  livePersonaBase,
  liveText,
  sharedLifeFile,
  sharedPersonaFile,
} from '../adapters/files/prompt-files';
import { LifeWriter } from '../app/life/life-writer';
import type { Container } from './container';
import type { FeatureRegistry } from './features';
import {
  ASK_CLAUDE,
  BOT_NAMES,
  LIFE,
  LIFE_WRITER,
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
 * the latest at the end of her persona.
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
    .register(LIFE_WRITER, (c) => {
      const sharedDir = join(c.resolve(PROMPTS_DIR), 'personas');
      const roomConfig = c.resolve(ROOM_CONFIG);
      const names = c.resolve(BOT_NAMES);
      return new LifeWriter({
        ask: c.resolve(ASK_CLAUDE)('life'),
        promptTemplate: c.resolve(PROMPT)('life'),
        life: c.resolve(LIFE),
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
