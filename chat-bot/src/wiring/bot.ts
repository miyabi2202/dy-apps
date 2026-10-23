import { resolve } from 'node:path';
import { livePrompt } from '../adapters/files/room-files';
import { ChatBot } from '../app/replies/chat-bot';
import { MentionAnswerer } from '../app/replies/mention-answerer';
import type { Container } from './container';
import {
  ADMINS,
  ANSWERER,
  ASK_CLAUDE,
  BOT,
  BOT_CONFIG,
  BUS,
  FEED,
  LOG,
  MCP_SERVER,
  OPTIONS,
  OUTBOX,
  PROMPTS_DIR,
  ROOM,
  TOOLS,
  USER_TALK,
} from './tokens';

/** The mentions' answerer (Claude, one question at a time) and the ChatBot. */
export function registerBot(container: Container): void {
  container
    .register(ANSWERER, (c) => {
      const options = c.resolve(OPTIONS);
      // The mention prompt is the one with no room override; --prompt may point elsewhere.
      const mentionTemplate = livePrompt('mention', {
        promptsDir: c.resolve(PROMPTS_DIR),
        sharedPath: resolve(options.promptFile),
      });
      return new MentionAnswerer({
        ask: c.resolve(ASK_CLAUDE)('mention'),
        outbox: c.resolve(OUTBOX),
        room: c.resolve(ROOM),
        log: c.resolve(LOG),
        promptTemplate: mentionTemplate,
        userTalk: c.resolve(USER_TALK),
        maxPending: options.maxPending,
        maxReplyLength: options.maxReplyLength,
        bus: c.resolve(BUS),
        // Its tools reach the answerer only when one is used (a fixed reply goes through it), not
        // while they are made: no cycle.
        tools: c.resolve(MCP_SERVER),
        admins: c.resolve(ADMINS),
      });
    })
    // Decides what a mention is (a question, or a tool's `/` command).
    .register(
      BOT,
      (c) =>
        new ChatBot({
          feed: c.resolve(FEED),
          bus: c.resolve(BUS),
          answerer: c.resolve(ANSWERER),
          room: c.resolve(ROOM),
          outbox: c.resolve(OUTBOX),
          log: c.resolve(LOG),
          admins: c.resolve(ADMINS),
          adminNames: c.resolve(BOT_CONFIG).adminNames,
          tools: c.resolve(TOOLS),
          maxReplyLength: c.resolve(OPTIONS).maxReplyLength,
        }),
    );
}
