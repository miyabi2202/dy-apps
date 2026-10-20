import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ChatLog } from '../adapters/chat-log-files';
import { liveAdmins, readConfig } from '../adapters/config-file';
import { loadAdditionalCommands } from '../adapters/additional-command-files';
import {
  liveRoomConfig,
  livePrompt,
  liveSection,
  liveText,
  roomFiles,
  saveStreamer,
} from '../adapters/room-files';
import { botTalkFile, userTalkFiles } from '../adapters/room-talk-files';
import { Billing } from '../app/billing';
import { EventBus } from '../app/event-bus';
import { Outbox } from '../app/outbox';
import { RoomFeed } from '../app/room-feed';
import { RoomState } from '../app/room-state';
import { StreamerAdmin } from '../app/streamer-admin';
import { ChatHistory } from '../core/chat-history';
import { RecentGifts } from '../core/recent-gifts';
import { Transcript } from '../core/transcript';
import { Wallet } from '../core/wallet';
import type { Container } from './container';
import {
  ADDITIONAL_COMMANDS,
  ADMINS,
  BILLING,
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
  PACKAGE_DIR,
  PROMPT,
  RECORD,
  ROOM,
  ROOM_API,
  ROOM_CONFIG,
  ROOM_DIR,
  ROOM_EVENTS,
  ROOM_FILES,
  TRANSCRIPT,
  USER_TALK,
  WALLET,
  WALLET_STORAGE,
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
    .register(RECORD, (c) => new ChatLog(c.resolve(CHAT_DIR)))
    .register(ROOM_FILES, (c) => roomFiles(c.resolve(ROOM_DIR)))
    // The room's room_config.json, read again when it changes: whether it's a 私密 room, and what
    // the bot says when the streamer starts a song.
    .register(ROOM_CONFIG, (c) =>
      liveRoomConfig(c.resolve(ROOM_FILES).config, { log: c.resolve(LOG) }),
    )
    .register(BOT_CONFIG, (c) => readConfig(resolve(c.resolve(OPTIONS).configFile)))
    // The admins from config.json (read again when it changes, so admins can be added or removed
    // while it runs), and the room's streamer once DyHub has read the room page (saved in
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
    // Balances outlast a restart: they're cleared on start only when last saved over a day ago.
    .register(WALLET, (c) => {
      const wallet = new Wallet(c.resolve(WALLET_STORAGE));
      wallet.clearIfOlderThan(24 * 60 * 60_000);
      return wallet;
    })
    .register(BILLING, (c) => {
      const billing = new Billing({ wallet: c.resolve(WALLET), cost: c.resolve(OPTIONS).cost });
      c.resolve(ROOM).addSettings(() => billing.settings());
      return billing;
    })
    // What the bot said, overall and to each viewer, so it doesn't repeat itself.
    .register(BOT_TALK, (c) => botTalkFile(c.resolve(ROOM_FILES).botTalk))
    .register(USER_TALK, (c) => userTalkFiles(c.resolve(ROOM_FILES).users))
    // The room's own commands, listed in data/<房间号>/additional_commands/index.json (主播会唱xxx吗):
    // answered when a mention asks for one, or auto-reply finds what someone said is for one.
    .register(ADDITIONAL_COMMANDS, (c) =>
      loadAdditionalCommands(c.resolve(ROOM_DIR), { log: c.resolve(LOG) }),
    )
    // The prompts are shared by every room, a room's own file overrides one (see PROMPT_FILES);
    // all read on every use so edits apply while it runs.
    .register(PROMPT, (c) => {
      const [packageDir, roomDir] = [c.resolve(PACKAGE_DIR), c.resolve(ROOM_DIR)];
      return (name) => livePrompt(name, { packageDir, roomDir });
    })
    // What the room looks like now, for every prompt. The bot plays the room's persona.md, read on
    // every use like context.md and written by /修改人设. The prompts also get the settings admins
    // can change (each feature gives its own part), and the list of commands from commands.md, so
    // the bot can tell viewers what it can do.
    .register(ROOM, (c) => {
      const options = c.resolve(OPTIONS);
      const files = c.resolve(ROOM_FILES);
      const additionalCommands = c.resolve(ADDITIONAL_COMMANDS);
      const commandsSection = liveSection(
        join(c.resolve(PACKAGE_DIR), 'commands.md'),
        'The commands',
      );
      const gifts = c.resolve(GIFTS);
      const room = new RoomState({
        history: c.resolve(HISTORY),
        gifts,
        transcript: c.resolve(TRANSCRIPT),
        transcriptMs: options.transcriptMs,
        persona: liveText(files.persona),
        savePersona: (persona) => writeFileSync(files.persona, `${persona}\n`),
        context: liveText(files.context),
        // What the bot says about itself when asked, shared by every room.
        intro: liveText(join(c.resolve(PACKAGE_DIR), 'intro.md')),
        botTalk: c.resolve(BOT_TALK),
        // Off unless --screenshot; /截图 switches it while the bot runs.
        screenshot: c.resolve(ROOM_API).screenshot,
        screenshotsOn: options.screenshot,
        chatDir: c.resolve(CHAT_DIR),
        botName: options.botName,
        // commands.md's list, and the room's own commands, which Claude asks for by name.
        commands: () =>
          additionalCommands.length
            ? [
                commandsSection(),
                '',
                '### 这个直播间自己的指令（不用打 /：观众问到这类问题，就在 command_request 写指令名，command_args 留空，程序会用它专门的资料回答）',
                '',
                ...additionalCommands.map(({ id, name, when }) => `- ${id}（${name}）：${when}`),
              ].join('\n')
            : commandsSection(),
        log: c.resolve(LOG),
      });
      c.resolve(BUS).on('gift', (gift) => gifts.add(room.now(), gift));
      return room;
    })
    // Every message the bot sends waits here, and goes out at least --send-interval seconds apart.
    .register(OUTBOX, (c) => {
      const billing = c.resolve(BILLING);
      const botTalk = c.resolve(BOT_TALK);
      return new Outbox({
        send: c.resolve(ROOM_API).sendChat,
        log: c.resolve(LOG),
        intervalMs: c.resolve(OPTIONS).sendIntervalMs,
        onSent: ({ text }) => botTalk.add(text),
        // More than 3 「要先给主播送礼」 in a minute looks like spam: the room is told once,
        // without an @, and no more for 5 minutes (those who gift are still answered).
        noticeFlood: {
          max: 3,
          windowMs: 60_000,
          muteMs: 5 * 60_000,
          text: () =>
            `想让我回你的，要先给主播送礼：每次${billing.cost}钻，从你送的里扣（不另外扣钱），送了马上回你`,
        },
      });
    })
    // Listens to the room: records chat and gifts, credits gifts, and tells the bus of mentions,
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
          billing: c.resolve(BILLING),
        }),
    );
}
