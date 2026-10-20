import { MaliceWatch } from '../app/malice-watch';
import type { Container } from './container';
import {
  ADMINS,
  ASK_CODEX,
  BUS,
  JUDGE,
  LOG,
  MALICE_WATCH,
  OPTIONS,
  OUTBOX,
  PROMPT,
  ROOM,
} from './tokens';

/**
 * @s a viewer whose chat is found malicious, once --malice-watch or /识别恶意言论 1 turns it on: Jev
 * scores each chat, and Codex decides on the few it lets through, with the chat around them. Off
 * (null) without Jev.
 */
export function registerMalice(container: Container): void {
  container.register(MALICE_WATCH, (c) => {
    const judge = c.resolve(JUDGE)('malice');
    if (!judge) return null;
    const admins = c.resolve(ADMINS);
    const maliceWatch = new MaliceWatch({
      judge,
      ask: c.resolve(ASK_CODEX)('malice', { webSearch: false }),
      promptTemplate: c.resolve(PROMPT)('malice'),
      outbox: c.resolve(OUTBOX),
      room: c.resolve(ROOM),
      exempt: (userId) => admins.has(userId),
      on: c.resolve(OPTIONS).maliceWatch,
      log: c.resolve(LOG),
    });
    c.resolve(BUS).on('chat', (chat) => maliceWatch.hear(chat));
    return maliceWatch;
  });
}
