import type { Container } from './container';
import {
  ADMINS,
  APP,
  AUTO_REPLY,
  BOT,
  BOT_CONFIG,
  DOWNLOADS,
  LOG,
  ON_SING,
  OPTIONS,
  ROOM,
  SETTINGS,
  SONG_INTRO,
  TRANSCRIBER,
  WALLET,
} from './tokens';

/** The bot as a whole. */
export interface App {
  /**
   * Starts it: the speech models load first (about half a minute), so the bot enters the room
   * hearing the streamer from the start. Resolves once the bot is in the room.
   */
  start(): Promise<void>;
  /** Stops it, from a signal; a start that's still waiting for the models then doesn't go on. */
  stop(): void;
}

/** Everything the bot is made of, made now, and started and stopped in order. */
export function registerApp(container: Container): void {
  container.register(APP, (c) => {
    const log = c.resolve(LOG);
    const bot = c.resolve(BOT);
    const autoReply = c.resolve(AUTO_REPLY);
    const transcriber = c.resolve(TRANSCRIBER);
    const wallet = c.resolve(WALLET);
    const admins = c.resolve(ADMINS);
    const room = c.resolve(ROOM);
    const options = c.resolve(OPTIONS);
    const config = c.resolve(BOT_CONFIG);
    const downloads = c.resolve(DOWNLOADS);
    // Made now, though nothing asks for them: one is told when a song is named, the other hears
    // the streamer sing. A missing prompt file stops the bot here, at start.
    c.resolve(SONG_INTRO);
    c.resolve(ON_SING);
    let stopping = false;
    return {
      async start() {
        admins.start();
        downloads();
        // The room's settings now: from its room_config.json, else the options that filled it in.
        const settings = c.resolve(SETTINGS).get();
        log.info('starting', {
          roomId: options.roomId,
          port: options.port,
          botName: options.botName,
          asr: options.asr,
          screenshot: settings.screenshots,
          cost: settings.mentionCost,
          admins: config.admins,
          persona: room.persona,
          autoReplyThreshold: settings.autoReplyThreshold,
          autoReplyIntervalMs: settings.autoReplyIntervalSeconds * 1000,
          thanksThreshold: settings.thanksThreshold,
          autoSongId: settings.autoSongId,
        });
        void transcriber?.run();
        await transcriber?.ready();
        if (!stopping) {
          bot.start();
          void autoReply.run();
        }
      },
      stop() {
        stopping = true;
        log.info('stopping');
        bot.stop();
        transcriber?.stop();
        autoReply.stop();
        wallet.touch();
      },
    };
  });
}
