import {
  createDemoStores,
  DEMO_INTERVAL_RANGE,
  readDemoInterval,
  readDemoRandom,
  setDemoParams,
  type DemoConfig,
  type DemoIntervalRange,
  type DemoSource,
} from './demo-source';
import {
  createConnectionStore,
  liveRoomFrom,
  readLiveRoom,
  setLiveRoomParams,
  type Connection,
} from './live-room';
import type { Store } from './local-storage';

/** The part of every app's config that is the same: the room as typed, and the demo (fake messages, or that room). */
export interface SourceConfig extends Connection {
  demo: DemoConfig;
}

/** What an app saved last time: the room as typed, and the demo's source and interval. */
export interface SourceStores {
  connection: Store<Connection>;
  demo: { source: Store<DemoSource>; intervalMs: Store<number> };
  /** The bounds for the fake interval, in the URL and in storage. */
  range: DemoIntervalRange;
}

/** The stores for `<app>.connection`, `<app>.demoSource` and `<app>.demoIntervalMs`. */
export function createSourceStores(
  app: string,
  defaults: DemoConfig,
  range: DemoIntervalRange = DEMO_INTERVAL_RANGE,
): SourceStores {
  return {
    connection: createConnectionStore(app),
    demo: createDemoStores(app, defaults, range),
    range,
  };
}

/** 'live' when the URL names a room, 'fake' when it names an interval, else null. */
export function urlSource(
  search: string,
  range: DemoIntervalRange = DEMO_INTERVAL_RANGE,
): DemoSource | null {
  if (readLiveRoom(search)) return 'live';
  return readDemoInterval(search, range) !== null ? 'fake' : null;
}

/**
 * From the URL where it says, otherwise what was saved last time. `?port=…&room=…` means a
 * live room, `?demo=<ms>` fake messages, and `?random=0` fake messages in a fixed order at a
 * fixed interval.
 */
export function readSourceConfig(search: string, stores: SourceStores): SourceConfig {
  const room = readLiveRoom(search);
  const demo = readDemoInterval(search, stores.range);
  return {
    ...(room ? { port: String(room.port), roomId: room.roomId } : stores.connection.read()),
    demo: {
      source: room ? 'live' : demo !== null ? 'fake' : stores.demo.source.read(),
      intervalMs: demo ?? stores.demo.intervalMs.read(),
      random: readDemoRandom(search),
    },
  };
}

export function saveSourceConfig(stores: SourceStores, config: SourceConfig): void {
  stores.connection.write({ port: config.port, roomId: config.roomId });
  stores.demo.source.write(config.demo.source);
  stores.demo.intervalMs.write(config.demo.intervalMs);
}

/** OBS link parameters: the room for a live source with a valid room, the interval and `random=0` for a fake one. */
export function setSourceParams(params: URLSearchParams, config: SourceConfig): void {
  const room = liveRoomFrom(config);
  if (config.demo.source === 'live' && room) setLiveRoomParams(params, room);
  if (config.demo.source === 'fake') {
    setDemoParams(params, config.demo.intervalMs, config.demo.random !== false);
  }
}
