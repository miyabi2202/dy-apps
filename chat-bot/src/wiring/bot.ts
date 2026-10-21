import { resolve } from 'node:path';
import { livePrompt } from '../adapters/room-files';
import { ChatBot } from '../app/chat-bot';
import { MentionAnswerer } from '../app/mention-answerer';
import { musicCommand } from '../app/music-command';
import { screenshotCommand } from '../app/room-state';
import { solveCommand } from '../app/solve-command';
import type { Container } from './container';
import {
  ADDITIONAL_COMMANDS,
  ADMINS,
  ANSWERER,
  ASK_CLAUDE,
  ASK_SOLVE,
  AUTO_REPLY,
  AUTO_SONG_ID,
  BILLING,
  BOT,
  BOT_CONFIG,
  BUS,
  COMMANDS,
  FEED,
  LOG,
  MALICE_WATCH,
  OPTIONS,
  OUTBOX,
  PACKAGE_DIR,
  PROMPT,
  ROOM,
  SETTINGS,
  SONG_ID,
  THANKER,
  TRANSCRIBER,
  USER_TALK,
} from './tokens';

/** The mentions' answerer (Claude, one question at a time), the commands, and the ChatBot. */
export function registerBot(container: Container): void {
  container
    .register(ANSWERER, (c) => {
      const options = c.resolve(OPTIONS);
      // The mention prompt is the one with no room override; --prompt may point elsewhere.
      const mentionTemplate = livePrompt('mention', {
        packageDir: c.resolve(PACKAGE_DIR),
        sharedPath: resolve(options.promptFile),
      });
      return new MentionAnswerer({
        ask: c.resolve(ASK_CLAUDE)('mention'),
        outbox: c.resolve(OUTBOX),
        room: c.resolve(ROOM),
        log: c.resolve(LOG),
        promptTemplate: mentionTemplate,
        billing: c.resolve(BILLING),
        userTalk: c.resolve(USER_TALK),
        maxPending: options.maxPending,
        maxReplyLength: options.maxReplyLength,
        maxReplyParts: options.maxReplyParts,
        // /最大回复条数 changes it, kept in room_config.json.
        settings: c.resolve(SETTINGS),
        bus: c.resolve(BUS),
        // 「以后 100 钻以下的礼物不用谢了」 and the like: run the command if they may. The bot is made after
        // this, and asked only when an answer has come.
        onCommandRequest: (mention, name, args) =>
          c.resolve(BOT).requestCommand(mention, name, args),
      });
    })
    // What a mention starting with `/` can run: each feature offers its own, in the order the help
    // list shows them (see commands.md).
    .register(COMMANDS, (c) => {
      const room = c.resolve(ROOM);
      const prompt = c.resolve(PROMPT);
      const ask = c.resolve(ASK_SOLVE);
      const transcriber = c.resolve(TRANSCRIBER);
      return [
        ...c.resolve(BILLING).commands(),
        ...c.resolve(AUTO_REPLY).commands(),
        ...c.resolve(ANSWERER).commands(),
        ...c.resolve(THANKER).commands(),
        screenshotCommand(room),
        ...(c.resolve(SONG_ID)?.commands() ?? []),
        solveCommand({
          name: '解题',
          prompt: prompt('solve'),
          ask: ask('solve', 'medium', 360_000),
        }),
        solveCommand({
          name: '拼命解题',
          prompt: prompt('solve'),
          ask: ask('solve-hard', 'high', 600_000),
        }),
        ...(c.resolve(AUTO_SONG_ID)?.commands() ?? []),
        ...(c.resolve(MALICE_WATCH)?.commands() ?? []),
        // Only when listening to the stream.
        ...(transcriber ? [musicCommand(() => transcriber.identifyMusic(), c.resolve(LOG))] : []),
      ];
    })
    // Decides what a mention is (a question, or a command) and charges for it.
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
          billing: c.resolve(BILLING),
          admins: c.resolve(ADMINS),
          streamer: () => c.resolve(ADMINS).current(),
          adminNames: c.resolve(BOT_CONFIG).adminNames,
          additionalCommands: c.resolve(ADDITIONAL_COMMANDS),
          commands: c.resolve(COMMANDS),
          maxReplyLength: c.resolve(OPTIONS).maxReplyLength,
        }),
    );
}
