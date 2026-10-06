import {
  createConnectionStore,
  createDemoStores,
  createStore,
  liveRoomFrom,
  readDemoInterval,
  readDemoRandom,
  readLiveRoom,
  setDemoParams,
  setLiveRoomParams,
  type Connection,
  type DemoConfig,
} from '@dy-apps/services';
import { CONFIG } from './core/config';

/** Everything 方块干预实验室 is set up with: where gifts come from and the trigger chance. */
export interface TetrisConfig extends Connection {
  /** Chance that one diamond triggers a curse, a whole percent in CONFIG.gifts.probabilityRange. */
  probability: number;
  /** Fake gifts (the default), or the live room in `port` and `roomId`. */
  demo: DemoConfig;
}

/** URL parameter for the trigger chance, in whole percent (`?chance=15`). */
const CHANCE_PARAM = 'chance';

/** A whole percent within CONFIG.gifts.probabilityRange, or undefined if `raw` isn't a number. */
function probabilityFrom(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const [min, max] = CONFIG.gifts.probabilityRange;
  return Math.round(Math.min(max, Math.max(min, raw)) * 100) / 100;
}

/** What the config page's form last held, valid or not, so a reload keeps the typing. */
export const connectionStore = createConnectionStore('tetris');

const probabilityStore = createStore('tetris.probability', {
  fallback: CONFIG.gifts.defaultProbability,
  parse: probabilityFrom,
});

/** Fake gifts come every 10 s on average: gifts are rarer than chat, and each one counts. */
export const DEMO_INTERVAL = { range: [2000, 30_000], step: 500 } as const;

const demoStores = createDemoStores(
  'tetris',
  { source: 'fake', intervalMs: 10_000 },
  DEMO_INTERVAL.range,
);

/**
 * From the URL where it says, otherwise what was saved last time. `?port=…&room=…` means
 * live gifts from that room, `?demo=<ms>` fake ones, and `?random=0` fake gifts in a fixed
 * order at a fixed interval.
 */
export function readConfig(search: string): TetrisConfig {
  const room = readLiveRoom(search);
  const demo = readDemoInterval(search, DEMO_INTERVAL.range);
  const chance = new URLSearchParams(search).get(CHANCE_PARAM);
  return {
    ...(room ? { port: String(room.port), roomId: room.roomId } : connectionStore.read()),
    probability:
      (chance?.trim() && probabilityFrom(Number(chance) / 100)) || probabilityStore.read(),
    demo: {
      source: room ? 'live' : demo !== null ? 'fake' : demoStores.source.read(),
      intervalMs: demo ?? demoStores.intervalMs.read(),
      random: readDemoRandom(search),
    },
  };
}

export function saveConfig(config: TetrisConfig): void {
  connectionStore.write({ port: config.port, roomId: config.roomId });
  probabilityStore.write(config.probability);
  demoStores.source.write(config.demo.source);
  demoStores.intervalMs.write(config.demo.intervalMs);
}

/** Parameters for the OBS link: the chance, and the room or the fake interval. */
export function configToParams(config: TetrisConfig): URLSearchParams {
  const params = new URLSearchParams({
    [CHANCE_PARAM]: String(Math.round(config.probability * 100)),
  });
  const room = liveRoomFrom(config);
  if (config.demo.source === 'live' && room) setLiveRoomParams(params, room);
  if (config.demo.source === 'fake') {
    setDemoParams(params, config.demo.intervalMs, config.demo.random !== false);
  }
  return params;
}
