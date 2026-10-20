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
        log.info('starting', {
          roomId: options.roomId,
          port: options.port,
          botName: options.botName,
          asr: options.asr,
          screenshot: options.screenshot,
          cost: options.cost,
          admins: config.admins,
          persona: room.persona,
          autoReplyThreshold: options.autoReplyThreshold,
          autoReplyIntervalMs: options.autoReplyIntervalMs,
          thanksThreshold: options.thanksThreshold,
          autoSongId: options.autoSongId,
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
