import type { EventBus } from '../app/event-bus';
import type { Outbox } from '../app/replies/outbox';
import { Pending } from '../app/pending';
import type { AskModel, BotTool, Log, SettingsStore, UserTalk } from '../app/ports';
import type { RoomState } from '../app/room/room-state';
import type { SolveEffort } from '../core/commands/settings';
import { errorMessage } from '../core/errors';
import { MESSAGE_SCHEMA, parseMentionAnswer } from '../core/replies/mention-answer';
import { answerBudget, replyMessages, singleBudget } from '../core/replies/reply';

export interface AskAboutPuzzleOptions {
  /** Codex's gpt-6-astra with the zoom tool, for the effort the room is set to (see ASK_SOLVE): medium with 6 minutes, high with 10. */
  ask: (effort: SolveEffort) => AskModel;
  /** The room's settings, where `solveEffort` is kept; read on each call, so a hand edit counts at once. */
  settings: Pick<SettingsStore, 'get'>;
  /** solve.md (see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  room: Pick<
    RoomState,
    | 'prompt'
    | 'screenshot'
    | 'recentTranscript'
    | 'recentChat'
    | 'replyLimits'
    | 'atNameOf'
    | 'now'
    | 'wording'
  >;
  /** Where the answer goes once Codex has it, as a reply to the asker. */
  outbox: Pick<Outbox, 'push'>;
  /** The asker's talk record gets the exchange, as a mention's does. */
  userTalk?: UserTalk;
  /** Told the asker was answered, once the answer is sent (see MentionAnswerer). */
  bus?: Pick<EventBus, 'emit'>;
  /** Douyin's chat length limit. */
  maxLength: number;
  log: Log;
}

/**
 * `ask_about_puzzle`: answers a question about the 题 on screen (the answer, a hint, where an
 * attempt went wrong), with a fresh screenshot and the streamer's recent words, from solve.md, by
 * Codex. It only starts that: Codex takes 15 s to minutes and Claude answers one mention at a time,
 * so the tool returns at once and the bot sends Codex's answer to the asker itself when it comes.
 * Admin-only. `/解题 问题` calls it directly.
 */
export function askAboutPuzzleTool(
  options: AskAboutPuzzleOptions,
): BotTool & { idle(): Promise<void> } {
  const { settings, room, outbox, userTalk, bus, log } = options;
  const work = new Pending();

  /** Asks Codex and sends what it answers, or that it couldn't, to the asker. */
  async function solve(
    asker: string,
    userId: string | undefined,
    question: string,
    prompt: string,
    image: Uint8Array | undefined,
    effort: SolveEffort,
  ): Promise<void> {
    const limits = room.replyLimits(options.maxLength);
    const send = (text: string) => {
      const messages = replyMessages(room.atNameOf(userId, asker), text, limits);
      messages.forEach((message, i) => {
        const last = i === messages.length - 1;
        outbox.push({
          kind: 'reply',
          text: message,
          onSent:
            last && userId !== undefined ? () => bus?.emit('answered', { userId }) : undefined,
        });
      });
      return messages;
    };
    const started = room.now();
    try {
      const raw = await options.ask(effort)({ prompt, image, schema: MESSAGE_SCHEMA });
      const messages = send(parseMentionAnswer(raw).message);
      if (!messages.length) {
        log.warn('codex had no answer about the puzzle', { asker });
        send(room.wording('puzzle-no-answer'));
        return;
      }
      if (userId) userTalk?.add(userId, { nickname: asker, question, answer: messages.join(' ') });
      log.info('puzzle answered', {
        asker,
        userId,
        effort,
        ms: room.now() - started,
        image: !!image,
      });
    } catch (err) {
      log.error('could not answer about the puzzle', { asker, error: errorMessage(err) });
      send(room.wording('puzzle-failed'));
    }
  }

  return {
    name: 'ask_about_puzzle',
    description:
      '回答关于直播画面上那道题（数学、逻辑、图形推理题）的任何具体问题：答案是什么、有什么思路、提示一下但别剧透、「我这么做哪里错了」、某一步怎么算。别自己做题，调用它；它会自己截图、看主播刚说的话，做完以后由程序把答案发给提问的人，你只要回一句稍等。不是在问怎么解题的别调用：聊天、评价题目难不难、嫌题简单、让你念出屏幕上的字。',
    adminOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '对方关于这道题的问题，照原话；只是要答案就写「答案是什么」',
        },
      },
      required: ['question'],
    },
    commands: [
      {
        name: '解题',
        parse: (args) => ({ args: { question: args } }),
        // The answer comes later, from the tool itself.
        say: () => '',
      },
    ],
    async call(args, { asker, userId }) {
      const { question } = args;
      if (typeof question !== 'string') {
        return { text: 'question 要写成字符串', isError: true };
      }
      // Always, as the puzzle is on the screen even while screenshots are off.
      const image = await room.screenshot(true);
      const limits = room.replyLimits(options.maxLength);
      const at = room.atNameOf(userId, asker);
      const prompt = room.prompt(options.prompt(), {
        transcript: room.recentTranscript(),
        history: room.recentChat(),
        asker,
        question,
        singleLength: singleBudget(at, limits),
        maxLength: answerBudget(at, limits),
      });
      const { solveEffort: effort } = settings.get();
      work.track(solve(asker, userId, question, prompt, image, effort));
      return { text: JSON.stringify({ started: true, effort, screenshot: !!image }) };
    },
    idle: () => work.idle(),
  };
}
