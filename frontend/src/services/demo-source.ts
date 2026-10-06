import { createStore, type Store } from './local-storage';

/** Where a preview's messages come from: made-up viewers, or a live room through DyHub. */
export const DEMO_SOURCES = ['fake', 'live'] as const;
export type DemoSource = (typeof DEMO_SOURCES)[number];

/** Bounds for the average time between fake messages, in ms. */
export type DemoIntervalRange = readonly [min: number, max: number];

/** The bounds danmaku uses; an app with slower messages passes its own. */
export const DEMO_INTERVAL_RANGE: DemoIntervalRange = [150, 3000];

export interface DemoConfig {
  source: DemoSource;
  /** Average time between fake messages. */
  intervalMs: number;
  /**
   * False with `?random=0`: fake messages play in list order at exactly `intervalMs`, the
   * same every time. Otherwise they're picked at random and arrive unevenly.
   */
  random?: boolean;
}

/** The interval clamped to `range`, or undefined if it isn't a number. */
export function clampDemoInterval(
  ms: number,
  range: DemoIntervalRange = DEMO_INTERVAL_RANGE,
): number | undefined {
  const [min, max] = range;
  return Number.isFinite(ms) ? Math.min(max, Math.max(min, ms)) : undefined;
}

/** `?demo=<ms>` in an OBS link: play fake messages at this interval. */
const DEMO_PARAM = 'demo';

/** The fake interval in a query string, or null if there's none. */
export function readDemoInterval(
  search: string,
  range: DemoIntervalRange = DEMO_INTERVAL_RANGE,
): number | null {
  const raw = new URLSearchParams(search).get(DEMO_PARAM);
  return raw === null ? null : (clampDemoInterval(Number(raw), range) ?? null);
}

/** `?random=0` in a link: fake messages in order, at a fixed interval. */
const RANDOM_PARAM = 'random';

/** False when the query string turns randomness off. */
export function readDemoRandom(search: string): boolean {
  return new URLSearchParams(search).get(RANDOM_PARAM) !== '0';
}

export function setDemoParams(params: URLSearchParams, intervalMs: number, random = true): void {
  params.set(DEMO_PARAM, String(intervalMs));
  if (!random) params.set(RANDOM_PARAM, '0');
}

/** An app's last demo source and interval, stored as `<app>.demoSource` and `<app>.demoIntervalMs`. */
export function createDemoStores(
  app: string,
  defaults: DemoConfig,
  range: DemoIntervalRange = DEMO_INTERVAL_RANGE,
): { source: Store<DemoSource>; intervalMs: Store<number> } {
  return {
    source: createStore<DemoSource>(`${app}.demoSource`, {
      fallback: defaults.source,
      parse: (raw) => DEMO_SOURCES.find((s) => s === raw),
    }),
    intervalMs: createStore(`${app}.demoIntervalMs`, {
      fallback: defaults.intervalMs,
      parse: (raw) => (typeof raw === 'number' ? clampDemoInterval(raw, range) : undefined),
    }),
  };
}
