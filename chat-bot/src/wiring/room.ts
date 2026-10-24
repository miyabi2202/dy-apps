import { mkdirSync } from 'node:fs';
import { forbiddenWordsOf } from '../core/prompts/forbidden';
import { join, resolve } from 'node:path';
import { ChatLog, RecordFile } from '../adapters/files/chat-log-files';
import { liveAdmins, readConfig } from '../adapters/files/config-file';
import {
  fillRoomConfig,
  roomConfigFile,
  livePersona,
  livePrompt,
  liveText,
  liveWording,
  roomFiles,
  saveStreamer,
} from '../adapters/files/room-files';
import { botTalkFile, userTalkFiles } from '../adapters/files/room-talk-files';
import { EventBus } from '../app/event-bus';
import { Outbox } from '../app/replies/outbox';
import { RoomFeed } from '../app/room/room-feed';
import { RoomState } from '../app/room/room-state';
import { StreamerAdmin } from '../app/commands/streamer-admin';
import { ChatHistory } from '../core/chat/chat-history';
import { RecentGifts } from '../core/chat/recent-gifts';
import { Transcript } from '../core/songs/transcript';
import type { Container } from './container';
import {
  ADMINS,
  BOT_CONFIG,
  BOT_TALK,
  BUS,
  CHAT_DIR,
  FEED,
  GIFTS,
  HISTORY,
  LOG,
  OPTIONS,
  OUTBOX,
  PROMPTS_DIR,
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
  SETTINGS,
  TRANSCRIPT,
  USER_TALK,
} from './tokens';

/**
 * The room: its folder (`data/<房间号>/`, where everything about it lives, see roomFiles), the
 * chat, gifts and speech it remembers, the admins, who pays for what, the prompts every feature
 * fills in, and the way the bot talks (the outbox) and listens (the feed).
 */
export function registerRoom(container: Container): void {
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
    // Words Douyin holds back a message for: every prompt that writes chat is told them, and the
    // outbox won't send one with them. Read on every use, so an edit applies at once.
    .register(FORBIDDEN_WORDS, (c) => {
      const read = liveText(join(c.resolve(PROMPTS_DIR), 'forbidden-words.md'));
      return () => forbiddenWordsOf(read());
    })
    // The prompts are shared by every room, a room's own file overrides one (see PROMPT_FILES);
    // all read on every use so edits apply while it runs.
    .register(PROMPT, (c) => {
      const [promptsDir, roomDir] = [c.resolve(PROMPTS_DIR), c.resolve(ROOM_DIR)];
      return (name) => livePrompt(name, { promptsDir, roomDir });
    })
    // What the room looks like now, for every prompt. The bot plays the persona file room_config.json
    // names (one of the room's personas/, on its own or as changes to a shared persona in
    // chat-bot/prompts/personas/, see livePersona), read on every use like context.md. The prompts also get the settings admins
    // can change (each feature gives its own part), so the bot can tell viewers how it is set.
    .register(ROOM, (c) => {
      const options = c.resolve(OPTIONS);
      const files = c.resolve(ROOM_FILES);
      const gifts = c.resolve(GIFTS);
      const roomConfig = c.resolve(ROOM_CONFIG);
      const room = new RoomState({
        history: c.resolve(HISTORY),
        forbiddenWords: c.resolve(FORBIDDEN_WORDS),
        gifts,
        transcript: c.resolve(TRANSCRIPT),
        transcriptMs: options.transcriptMs,
        persona: livePersona({
          roomDir: c.resolve(ROOM_DIR),
          sharedDir: join(c.resolve(PROMPTS_DIR), 'personas'),
          file: () => roomConfig().persona,
          log: c.resolve(LOG),
        }),
        context: liveText(files.context),
        // What viewers ask about Douyin itself (灯牌…), shared by every room.
        commonKnowledge: liveText(join(c.resolve(PROMPTS_DIR), 'common-knowledge.md')),
        // What the bot says about itself when asked, shared by every room.
        intro: liveText(join(c.resolve(PROMPTS_DIR), 'intro.md')),
        // What it can't do and why, for when viewers notice (limitations.md, shared by every room).
        limitations: liveText(join(c.resolve(PROMPTS_DIR), 'limitations.md')),
        botTalk: c.resolve(BOT_TALK),
        // Off unless --screenshot; /截图 switches it while the bot runs.
        screenshot: c.resolve(ROOM_API).screenshot,
        screenshotsOn: options.screenshot,
        // How many messages what the bot says may take; /最大回复条数 changes it.
        maxReplyParts: options.maxReplyParts,
        settings: c.resolve(SETTINGS),
        chatDir: c.resolve(CHAT_DIR),
        botName: options.botName,
        aliases: () => roomConfig().aliases,
        // The song break sources the room has on (room_config.json's songBreaks; all when absent).
        songBreaks: () => roomConfig().songBreaks,
        // 单推符号 taken off a nickname before the bot @s them.
        atTrimStart: () => roomConfig().atTrimStart,
        // What to @ some viewers as instead of their nickname, by user id.
        atNames: () => roomConfig().atNames,
        // Where the streamer is: every time in the prompts is in it (Beijing time when not known).
        timeZone: () => roomConfig().timeZone,
        // What prompts say around what they fill in, shared by every room.
        wording: liveWording(join(c.resolve(PROMPTS_DIR), 'wording.md')),
        log: c.resolve(LOG),
      });
      c.resolve(BUS).on('gift', (gift) => gifts.add(room.now(), gift));
      return room;
    })
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
