import { resolve } from 'node:path';
import { livePrompt } from '../adapters/files/prompt-files';
import { ChatBot, isAdmin } from '../app/replies/chat-bot';
import { ToolRunner } from '../app/tools/tool-runner';
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
  SCREENSHOTS,
  STREAMER,
  TOOL_RUNNER,
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
        screenshots: c.resolve(SCREENSHOTS),
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
        streamer: c.resolve(STREAMER),
      });
    })
    // Runs the tools a mention names with a `/`.
    .register(TOOL_RUNNER, (c) => {
      const admins = c.resolve(ADMINS);
      return new ToolRunner({
        tools: c.resolve(TOOLS),
        outbox: c.resolve(OUTBOX),
        room: c.resolve(ROOM),
        log: c.resolve(LOG),
        isAdmin: (userId) => isAdmin(admins, userId),
        adminNames: c.resolve(BOT_CONFIG).adminNames,
        maxReplyLength: c.resolve(OPTIONS).maxReplyLength,
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
          toolRunner: c.resolve(TOOL_RUNNER),
        }),
    );
}
