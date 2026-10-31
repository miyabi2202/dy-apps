import { fileMemory } from '@dy-apps/room-memory';
import { mkdirSync } from 'node:fs';
import {
  forbiddenTopicsOf,
  forbiddenWordsOf,
  type ForbiddenWords,
} from '../core/prompts/forbidden';
import { join, resolve } from 'node:path';
import { ChatLog, RecordFile } from '../adapters/files/chat-log-files';
import { liveAdmins, readConfig } from '../adapters/files/config-file';
import { livePersona, livePrompt, liveText, liveWording } from '../adapters/files/prompt-files';
import {
  fillRoomConfig,
  roomConfigFile,
  roomFiles,
  saveStreamer,
} from '../adapters/files/room-files';
import { memoryReadMark, readRecordSince } from '../adapters/files/remember-files';
import { thoughtsFile } from '../adapters/files/thoughts-file';
import { busFeature } from '../app/feature';
import { RememberChat } from '../app/memory/remember-chat';
import { botTalkFile, folderOf, userTalkFiles } from '../adapters/files/room-talk-files';
import { EventBus } from '../app/event-bus';
import { Outbox } from '../app/replies/outbox';
import { RoomFeed } from '../app/room/room-feed';
import { BotNames } from '../app/room/bot-names';
import { RoomState } from '../app/room/room-state';
import { Screenshots } from '../app/room/screenshots';
import { StreamerAdmin } from '../app/commands/streamer-admin';
import { ChatHistory } from '../core/chat/chat-history';
import { RecentGifts } from '../core/chat/recent-gifts';
import { errorMessage } from '../core/errors';
import { LIFE_DAYS_SHOWN, lifeText } from '../core/prompts/life';
import { localDate } from '../core/prompts/local-time';
import { Transcript } from '../core/songs/transcript';
import type { Container } from './container';
import type { FeatureRegistry } from './features';
import {
  ADMINS,
  BOT_NAMES,
  BOT_CONFIG,
  BOT_TALK,
  BUS,
  CHAT_DIR,
  FEED,
  GIFTS,
  HISTORY,
  LIFE,
  LOG,
  MEMORY,
  REMEMBER_CHAT,
  ASK_CLAUDE,
  OPTIONS,
  OUTBOX,
  PROMPTS_DIR,
  FORBIDDEN_TOPICS,
  FORBIDDEN_WORDS,
  PROMPT,
  RECORD,
  SINGING,
  ROOM,
  ROOM_API,
  ROOM_CONFIG,
  ROOM_CONFIG_FILE,
  ROOM_DIR,
  ROOM_EVENTS,
  ROOM_FILES,
  SCREENSHOTS,
  SETTINGS,
  STREAMER,
  THOUGHTS,
  TRANSCRIPT,
  USER_TALK,
} from './tokens';

/**
 * The room: its folder (`data/<房间号>/`, where everything about it lives, see roomFiles), the
 * chat, gifts and speech it remembers, the admins, who pays for what, the prompts every feature
 * fills in, and the way the bot talks (the outbox) and listens (the feed).
 */
export function registerRoom(container: Container, features: FeatureRegistry): void {
  features.add('recent-gifts', (c) => {
    const [gifts, room] = [c.resolve(GIFTS), c.resolve(ROOM)];
    return busFeature('recent-gifts', c.resolve(BUS), {
      gift: (gift) => gifts.add(room.now(), gift),
    });
  });
  container
    .register(ROOM_DIR, (c) => {
      const options = c.resolve(OPTIONS);
      return join(resolve(options.dataDir), options.roomId);
    })
    // Everything said, chatted and gifted, 100 records a file; Claude may read this folder.
    .register(CHAT_DIR, (c) => {
      const chatDir = join(c.resolve(ROOM_DIR), 'chat');
      mkdirSync(chatDir, { recursive: true });
      return chatDir;
    })
    .register(RECORD, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      // Its times in the streamer's time zone, with the offset, so a model reading it needn't convert.
      return new ChatLog(c.resolve(CHAT_DIR), { timeZone: () => roomConfig().timeZone });
    })
    // Every sung line, as whose the speech service took it for (sing.txt): only kept, to see how
    // well it tells singers apart; the chat record and the prompts have them all as the streamer's.
    .register(SINGING, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      return new RecordFile(join(c.resolve(ROOM_DIR), 'sing.txt'), {
        timeZone: () => roomConfig().timeZone,
      });
    })
    .register(ROOM_FILES, (c) => roomFiles(c.resolve(ROOM_DIR)))
    // The room's room_config.json, read again when it changes: whether it's a 私密 room, and what
    // the bot says when the streamer starts a song.
    .register(ROOM_CONFIG_FILE, (c) => {
      const { config } = c.resolve(ROOM_FILES);
      const log = c.resolve(LOG);
      // Every field is there from now on: a missing one is the command-line option for it, else
      // its default. The file is the room's memory: what's in it wins over an option.
      fillRoomConfig(config, c.resolve(OPTIONS).given, { log });
      return roomConfigFile(config, { log });
    })
    .register(ROOM_CONFIG, (c) => {
      const file = c.resolve(ROOM_CONFIG_FILE);
      return () => file.get();
    })
    // What admins change with commands is written to room_config.json, and a hand edit there is
    // picked up at once.
    .register(SETTINGS, (c) => {
      const file = c.resolve(ROOM_CONFIG_FILE);
      return {
        get: () => file.get(),
        set: (patch) => file.update(patch),
      };
    })
    .register(BOT_CONFIG, (c) => readConfig(resolve(c.resolve(OPTIONS).configFile)))
    // The admins from config.json (read again when it changes, so admins can be added or removed
    // while it runs), and the room's streamer once room-feed has read the room page (saved in
    // room_config.json).
    .register(ADMINS, (c) => {
      const log = c.resolve(LOG);
      return new StreamerAdmin({
        admins: liveAdmins(resolve(c.resolve(OPTIONS).configFile), { log }),
        find: c.resolve(ROOM_API).streamer,
        onFound: (streamer) => saveStreamer(c.resolve(ROOM_FILES).config, streamer, { log }),
        log,
      });
    })
    // Who the streamer is, for the memory, the prompts and the answers: room-feed's word on it, else
    // what room_config.json kept from last time.
    .register(STREAMER, (c) => {
      const [admins, roomConfig] = [c.resolve(ADMINS), c.resolve(ROOM_CONFIG)];
      return {
        id: () => admins.current()?.uid ?? roomConfig().streamer?.uid,
        current: () => admins.current(),
      };
    })
    .register(BUS, (c) => new EventBus(c.resolve(LOG)))
    .register(HISTORY, (c) => new ChatHistory(c.resolve(OPTIONS).historySize))
    // The last few minutes' gifts, among the chat in every prompt (so 「谢一下这个礼物」 knows which).
    .register(GIFTS, () => new RecentGifts())
    .register(TRANSCRIPT, () => new Transcript())
    // What the bot said, overall and to each viewer, so it doesn't repeat itself.
    .register(BOT_TALK, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      return botTalkFile(c.resolve(ROOM_FILES).botTalk, { timeZone: () => roomConfig().timeZone });
    })
    .register(USER_TALK, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      return userTalkFiles(c.resolve(ROOM_FILES).users, { timeZone: () => roomConfig().timeZone });
    })
    // What the bot remembers (memory.md, each person's note.md), which it writes with update_memory
    // and anyone may edit by hand: read on every use.
    .register(MEMORY, (c) => {
      const [roomConfig, streamer] = [c.resolve(ROOM_CONFIG), c.resolve(STREAMER)];
      return fileMemory(c.resolve(ROOM_DIR), {
        folderOf,
        streamerId: () => streamer.id(),
        isPrivate: () => roomConfig().private,
        // The day an entry is written on is the streamer's, not the machine's.
        today: () => localDate(Date.now(), roomConfig().timeZone).slice(0, 10),
      });
    })
    .register(THOUGHTS, (c) => thoughtsFile(join(c.resolve(ROOM_DIR), 'memory', 'thoughts.md')))
    // `pnpm remember`: the chat record since last time, read into the notes and memory.md by Claude,
    // and then what the bot itself made of it, in its persona (memory/thoughts.md).
    .register(REMEMBER_CHAT, (c) => {
      const [options, roomConfig, prompt] = [
        c.resolve(OPTIONS),
        c.resolve(ROOM_CONFIG),
        c.resolve(PROMPT),
      ];
      const chatDir = c.resolve(CHAT_DIR);
      return new RememberChat({
        ask: c.resolve(ASK_CLAUDE)('remember'),
        memory: c.resolve(MEMORY),
        readSince: (sinceMs) => readRecordSince(chatDir, sinceMs),
        mark: memoryReadMark(c.resolve(ROOM_DIR)),
        notesPrompt: prompt('rememberNotes'),
        roomPrompt: prompt('rememberRoom'),
        thoughts: {
          prompt: prompt('rememberThoughts'),
          persona: () => c.resolve(ROOM).persona,
          store: c.resolve(THOUGHTS),
        },
        streamer: c.resolve(STREAMER),
        bot: { name: options.botName, id: options.botId },
        isPrivate: () => roomConfig().private,
        dayOf: (ms) => localDate(ms, roomConfig().timeZone).slice(0, 10),
        log: c.resolve(LOG),
      });
    })
    // forbidden-words.json and forbidden.md, read on every use so an edit applies at once. The
    // words Douyin holds back a message for are swapped in everything sent; forbidden.md's topics
    // go into the prompt that answers people. A forbidden-words.json that isn't right is warned
    // about, and the last good one stays.
    .register(FORBIDDEN_WORDS, (c) => {
      const read = liveText(join(c.resolve(PROMPTS_DIR), 'forbidden-words.json'), () => '{}');
      const log = c.resolve(LOG);
      let last = { text: '{}', words: {} as ForbiddenWords };
      return () => {
        const text = read();
        if (text === last.text) return last.words;
        try {
          last = { text, words: forbiddenWordsOf(text) };
        } catch (err) {
          log.warn('forbidden-words.json is not right, keeping the last one', {
            error: errorMessage(err),
          });
          last = { text, words: last.words };
        }
        return last.words;
      };
    })
    .register(FORBIDDEN_TOPICS, (c) => {
      const read = liveText(join(c.resolve(PROMPTS_DIR), 'forbidden.md'));
      return () => forbiddenTopicsOf(read());
    })
    // The prompts are shared by every room, a room's own file overrides one (see PROMPT_FILES);
    // all read on every use so edits apply while it runs.
    .register(PROMPT, (c) => {
      const [promptsDir, roomDir] = [c.resolve(PROMPTS_DIR), c.resolve(ROOM_DIR)];
      return (name) => livePrompt(name, { promptsDir, roomDir });
    })
    // What the room looks like now, for every prompt. The bot plays the persona file room_config.json
    // names (one of the room's personas/, on its own or as changes to a shared persona in
    // chat-bot/prompts/personas/, see livePersona), read on every use like memory.md. The prompts also get the settings admins
    // can change (each feature gives its own part), so the bot can tell viewers how it is set.
    .register(ROOM, (c) => {
      const options = c.resolve(OPTIONS);
      const gifts = c.resolve(GIFTS);
      const roomConfig = c.resolve(ROOM_CONFIG);
      const room = new RoomState({
        history: c.resolve(HISTORY),
        forbiddenWords: c.resolve(FORBIDDEN_WORDS),
        forbiddenTopics: c.resolve(FORBIDDEN_TOPICS),
        gifts,
        transcript: c.resolve(TRANSCRIPT),
        transcriptMs: options.transcriptMs,
        persona: livePersona({
          roomDir: c.resolve(ROOM_DIR),
          sharedDir: join(c.resolve(PROMPTS_DIR), 'personas'),
          file: () => roomConfig().persona,
          log: c.resolve(LOG),
          // Her own latest days (see life.ts), shared by every room that plays her.
          life: (base) => lifeText(c.resolve(LIFE).recent(base, LIFE_DAYS_SHOWN)),
        }),
        memory: c.resolve(MEMORY),
        thoughts: c.resolve(THOUGHTS),
        streamer: c.resolve(STREAMER),
        isPrivate: () => roomConfig().private,
        // What viewers ask about Douyin itself (灯牌…), shared by every room.
        commonKnowledge: liveText(join(c.resolve(PROMPTS_DIR), 'common-knowledge.md')),
        // What the bot says about itself when asked, shared by every room.
        intro: liveText(join(c.resolve(PROMPTS_DIR), 'intro.md')),
        // What it can't do and why, for when viewers notice (limitations.md, shared by every room).
        limitations: liveText(join(c.resolve(PROMPTS_DIR), 'limitations.md')),
        botTalk: c.resolve(BOT_TALK),
        // The settings: how many messages what the bot says may take (/最大回复条数), and the rest.
        settings: c.resolve(SETTINGS),
        chatDir: c.resolve(CHAT_DIR),
        names: c.resolve(BOT_NAMES),
        // What prompts say around what they fill in, shared by every room.
        wording: liveWording(join(c.resolve(PROMPTS_DIR), 'wording.md')),
      });
      return room;
    })
    // What the bot is called here (its nickname, the room's aliases), the 单推符号 taken off a
    // nickname before it @s them, and where the streamer is: every time in the prompts is in their
    // time zone (Beijing time when not known).
    .register(BOT_NAMES, (c) => {
      const [options, roomConfig] = [c.resolve(OPTIONS), c.resolve(ROOM_CONFIG)];
      return new BotNames({
        botName: options.botName,
        botId: options.botId,
        aliases: () => roomConfig().aliases,
        atTrimStart: () => roomConfig().atTrimStart,
        timeZone: () => roomConfig().timeZone,
      });
    })
    // Whether prompts get the live video is the setting `screenshots` (off unless --screenshot; /截图).
    .register(
      SCREENSHOTS,
      (c) =>
        new Screenshots({
          fetch: c.resolve(ROOM_API).screenshot,
          settings: c.resolve(SETTINGS),
          log: c.resolve(LOG),
        }),
    )
    // Every message the bot sends waits here, and goes out at least --send-interval seconds apart.
    .register(OUTBOX, (c) => {
      const botTalk = c.resolve(BOT_TALK);
      return new Outbox({
        send: c.resolve(ROOM_API).sendChat,
        log: c.resolve(LOG),
        intervalMs: c.resolve(OPTIONS).sendIntervalMs,
        forbiddenWords: c.resolve(FORBIDDEN_WORDS),
        onSent: ({ text }) => botTalk.add(text),
      });
    })
    // Listens to the room: records chat and gifts, and tells the bus of mentions,
    // chats and gifts.
    .register(
      FEED,
      (c) =>
        new RoomFeed({
          events: c.resolve(ROOM_EVENTS),
          bus: c.resolve(BUS),
          bot: { nickname: c.resolve(OPTIONS).botName, userId: c.resolve(OPTIONS).botId },
          history: c.resolve(HISTORY),
          log: c.resolve(LOG),
          record: c.resolve(RECORD),
        }),
    );
}
