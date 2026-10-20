import { AutoReply } from '../app/auto-reply';
import { GiftThanker } from '../app/gift-thanker';
import type { AskModel } from '../app/ports';
import type { Container } from './container';
import {
  ADDITIONAL_COMMANDS,
  ADMINS,
  ASK_CLAUDE,
  ASK_CODEX,
  AUTO_REPLY,
  BOT,
  BUS,
  JUDGE,
  LOG,
  OPTIONS,
  OUTBOX,
  PROMPT,
  ROOM,
  SETTINGS,
  THANKER,
  USER_TALK,
} from './tokens';

/** What the bot says without being @ed: joining in when talked about, and thanking big givers. */
export function registerAutoReply(container: Container): void {
  container
    // Joins in when Jev scores something said in the room as about the bot at
    // --auto-reply-threshold or more (/自动回复阈值 changes it), or when someone it just answered
    // says something. Once Jev finds something about the bot, Codex (the cheap model, no web
    // search) picks whom to answer, and each is answered like a mention (charged, with their own
    // talk.txt; the streamer's too, by their uid). Without Codex there's no judge either, so the
    // picker is never asked.
    .register(AUTO_REPLY, (c) => {
      const options = c.resolve(OPTIONS);
      const room = c.resolve(ROOM);
      const admins = c.resolve(ADMINS);
      const bus = c.resolve(BUS);
      const noPicker: AskModel = () => Promise.reject(new Error('--codex is empty'));
      const autoReply = new AutoReply({
        outbox: c.resolve(OUTBOX),
        judge: c.resolve(JUDGE)('about-the-bot'),
        threshold: options.autoReplyThreshold,
        quietMs: options.autoReplyIntervalMs,
        settings: c.resolve(SETTINGS),
        room,
        log: c.resolve(LOG),
        picker: options.codex
          ? c.resolve(ASK_CODEX)('reply-pick', {
              // Low sometimes picked nobody when someone clearly wanted an answer; medium is ~4 s slower.
              effort: 'medium',
              webSearch: false,
            })
          : noPicker,
        pickTemplate: c.resolve(PROMPT)('replyPick'),
        // The bot is made after this, and asks for it only when there's someone to answer.
        reply: (target) => c.resolve(BOT).replyUnprompted(target),
        streamer: () => admins.current(),
        additionalCommands: c.resolve(ADDITIONAL_COMMANDS),
      });
      room.addSettings(() => autoReply.settings());
      // A chat matching a room command's trigger has auto-reply look now, not at its next check.
      bus.on('chat', (chat) => autoReply.hear(chat));
      bus.on('heard', (line) => autoReply.hearSpeech(line));
      // What someone says next, after the bot answered them, goes straight to the picker for a
      // minute: it's likely a reply.
      bus.on('answered', ({ userId }) => autoReply.answered(userId));
      return autoReply;
    })
    // Thanks a viewer whose gifts in 5 minutes pass --thanks-threshold (changed with /自动谢礼).
    .register(THANKER, (c) => {
      const options = c.resolve(OPTIONS);
      const room = c.resolve(ROOM);
      const thanker = new GiftThanker({
        ask: c.resolve(ASK_CLAUDE)('gift-thanks'),
        outbox: c.resolve(OUTBOX),
        promptTemplate: c.resolve(PROMPT)('giftThanks'),
        threshold: options.thanksThreshold,
        settings: c.resolve(SETTINGS),
        room,
        userTalk: c.resolve(USER_TALK),
        maxLength: options.maxReplyLength,
        log: c.resolve(LOG),
      });
      room.addSettings(() => thanker.settings());
      c.resolve(BUS).on('gift', (gift) => thanker.onGift(gift));
      return thanker;
    });
}
