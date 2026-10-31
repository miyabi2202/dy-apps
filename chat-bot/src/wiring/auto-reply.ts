import { AutoMessage } from '../app/replies/auto-message';
import { AutoReply } from '../app/replies/auto-reply';
import { GiftThanker } from '../app/replies/gift-thanker';
import { busFeature } from '../app/feature';
import type { AskModel } from '../app/ports';
import type { Container } from './container';
import type { FeatureRegistry } from './features';
import {
  BOT_NAMES,
  ASK_CLAUDE,
  ASK_CODEX,
  AUTO_MESSAGE,
  AUTO_REPLY,
  BOT,
  BUS,
  JUDGE,
  LOG,
  OPTIONS,
  OUTBOX,
  PROMPT,
  ROOM,
  ROOM_CONFIG,
  SETTINGS,
  STREAMER,
  THANKER,
  TOOLS,
  USER_TALK,
} from './tokens';

/**
 * What the bot says without being @ed: joining in when talked about, thanking big givers, and the
 * room something of its own every so often (auto message).
 */
export function registerAutoReply(container: Container, features: FeatureRegistry): void {
  features
    .add('auto-reply', (c) => {
      const autoReply = c.resolve(AUTO_REPLY);
      return busFeature('auto-reply', c.resolve(BUS), {
        // A chat matching a tool's listen trigger has auto-reply look now, not at its next check.
        chat: (chat) => autoReply.hear(chat),
        heard: (line) => autoReply.hearSpeech(line),
        // What someone says next, after the bot answered them, goes straight to the picker for a
        // minute: it's likely a reply.
        answered: ({ userId }) => autoReply.answered(userId),
      });
    })
    .add('gift-thanks', (c) => {
      const thanker = c.resolve(THANKER);
      return busFeature('gift-thanks', c.resolve(BUS), { gift: (gift) => thanker.onGift(gift) });
    });
  container
    // Joins in when Jev scores something said in the room as about the bot at
    // --auto-reply-threshold or more (/自动回复阈值 changes it), or when someone it just answered
    // says something. Once Jev finds something about the bot, Codex (the cheap model, no web
    // search) picks whom to answer, and each is answered like a mention (with their own talk.txt;
    // the streamer's too, by their uid). Without Codex there's no judge either, so the
    // picker is never asked.
    .register(AUTO_REPLY, (c) => {
      const options = c.resolve(OPTIONS);
      const room = c.resolve(ROOM);
      const streamer = c.resolve(STREAMER);
      const roomConfig = c.resolve(ROOM_CONFIG);
      const bot = c.resolve(BOT);
      const tools = c.resolve(TOOLS);
      const noPicker: AskModel = () => Promise.reject(new Error('--codex is empty'));
      const autoReply = new AutoReply({
        outbox: c.resolve(OUTBOX),
        judge: c.resolve(JUDGE)('about-the-bot'),
        settings: c.resolve(SETTINGS),
        room,
        names: c.resolve(BOT_NAMES),
        log: c.resolve(LOG),
        picker: options.codex
          ? c.resolve(ASK_CODEX)('reply-pick', {
              // Low sometimes picked nobody when someone clearly wanted an answer; medium is ~4 s slower.
              effort: 'medium',
              webSearch: false,
            })
          : noPicker,
        pickTemplate: c.resolve(PROMPT)('replyPick'),
        reply: (target) => bot.replyUnprompted(target),
        streamer: () => streamer.current(),
        focus: () => roomConfig().focus,
        // What the tools listen for, as the tools are now (the room's switch on and off).
        topics: () =>
          tools().flatMap((tool) =>
            tool.listen ? [{ name: tool.name, adminOnly: tool.adminOnly, ...tool.listen }] : [],
          ),
      });
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
        settings: c.resolve(SETTINGS),
        room,
        userTalk: c.resolve(USER_TALK),
        maxLength: options.maxReplyLength,
        log: c.resolve(LOG),
      });
      return thanker;
    })
    // Claude says something to the room, from what's going on in it, every
    // autoMessageIntervalSeconds (/自动消息间隔); off at 0.
    .register(AUTO_MESSAGE, (c) => {
      return new AutoMessage({
        ask: c.resolve(ASK_CLAUDE)('auto-message'),
        outbox: c.resolve(OUTBOX),
        promptTemplate: c.resolve(PROMPT)('autoMessage'),
        room: c.resolve(ROOM),
        settings: c.resolve(SETTINGS),
        maxLength: c.resolve(OPTIONS).maxReplyLength,
        log: c.resolve(LOG),
      });
    });
}
