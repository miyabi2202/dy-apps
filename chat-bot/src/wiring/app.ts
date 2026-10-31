import { whenRoomFeedGone } from '../app/room/room-feed';
import type { Container } from './container';
import {
  ADMINS,
  APP,
  AUTO_MESSAGE,
  AUTO_REPLY,
  BOT,
  BOT_CONFIG,
  DOWNLOADS,
  FEATURES,
  LOG,
  MCP_SERVER,
  OPTIONS,
  ROOM,
  ROOM_EVENTS,
  SETTINGS,
  TRANSCRIBER,
} from './tokens';

/** The bot as a whole. */
export interface App {
  /**
   * Starts it: the speech models load first (about half a minute), so the bot enters the room
   * hearing the streamer from the start. Resolves once the bot is in the room.
   */
  start(): Promise<void>;
  /**
   * Stops it, from a signal; a start that's still waiting for the models then doesn't go on.
   * With `quitSpeech`, the speech service is told to exit too.
   */
  stop(options?: { quitSpeech?: boolean }): void;
  /** Called once when room-feed goes away after the bot was connected to it. */
  onRoomFeedGone(handler: (detail?: string) => void): void;
}

/** Everything the bot is made of, made now, and started and stopped in order. */
export function registerApp(container: Container): void {
  container.register(APP, (c) => {
    const log = c.resolve(LOG);
    const bot = c.resolve(BOT);
    const autoReply = c.resolve(AUTO_REPLY);
    const autoMessage = c.resolve(AUTO_MESSAGE);
    const transcriber = c.resolve(TRANSCRIBER);
    const mcp = c.resolve(MCP_SERVER);
    const admins = c.resolve(ADMINS);
    const room = c.resolve(ROOM);
    const options = c.resolve(OPTIONS);
    const config = c.resolve(BOT_CONFIG);
    const downloads = c.resolve(DOWNLOADS);
    const features = c.resolve(FEATURES);
    let stopping = false;
    return {
      async start() {
        admins.start();
        downloads();
        // Listening to the room before the speech worker can say anything, and before the bot
        // enters it.
        for (const feature of features) feature.start();
        // The room's settings now: from its room_config.json, else the options that filled it in.
        const settings = c.resolve(SETTINGS).get();
        log.info('starting', {
          roomId: options.roomId,
          port: options.port,
          botName: options.botName,
          asr: options.asr,
          screenshot: settings.screenshots,
          admins: config.admins,
          persona: room.persona,
          autoReplyThreshold: settings.autoReplyThreshold,
          autoReplyIntervalMs: settings.autoReplyIntervalSeconds * 1000,
          autoMessageIntervalSeconds: settings.autoMessageIntervalSeconds,
          thanksThreshold: settings.thanksThreshold,
          autoSongId: settings.autoSongId,
        });
        void transcriber?.run();
        // A port that's taken is a reason not to start: Claude could not act on what's said in words.
        await mcp.start();
        await transcriber?.ready();
        if (!stopping) {
          bot.start();
          void autoReply.run();
          void autoMessage.loop();
        }
      },
      stop({ quitSpeech = false } = {}) {
        stopping = true;
        log.info('stopping', quitSpeech ? { quitSpeech } : {});
        bot.stop();
        for (const feature of features) feature.stop();
        transcriber?.stop({ quitService: quitSpeech });
        autoReply.stop();
        autoMessage.stop();
        void mcp.stop();
      },
      onRoomFeedGone(handler) {
        whenRoomFeedGone(c.resolve(ROOM_EVENTS), handler);
      },
    };
  });
}
