import {
  createSourceStores,
  createStore,
  readSourceConfig,
  saveSourceConfig,
  setSourceParams,
  type SourceConfig,
} from '@dy-apps/services';
import { CONFIG } from './core/config';

/** Everything 方块干预实验室 is set up with: where gifts come from and the trigger chance. */
export interface TetrisConfig extends SourceConfig {
  /** Chance that one diamond triggers a curse, a whole percent in CONFIG.gifts.probabilityRange. */
  probability: number;
}

/** URL parameter for the trigger chance, in whole percent (`?chance=15`). */
const CHANCE_PARAM = 'chance';

/** A whole percent within CONFIG.gifts.probabilityRange, or undefined if `raw` isn't a number. */
function probabilityFrom(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const [min, max] = CONFIG.gifts.probabilityRange;
  return Math.round(Math.min(max, Math.max(min, raw)) * 100) / 100;
}

const probabilityStore = createStore('tetris.probability', {
  fallback: CONFIG.gifts.defaultProbability,
  parse: probabilityFrom,
});

/** Fake gifts come every 10 s on average: gifts are rarer than chat, and each one counts. */
export const DEMO_INTERVAL = { range: [2000, 30_000], step: 500 } as const;

const stores = createSourceStores(
  'tetris',
  { source: 'fake', intervalMs: 10_000 },
  DEMO_INTERVAL.range,
);

/** The source from the URL or what was saved (see readSourceConfig), plus the chance (`?chance=`). */
export function readConfig(search: string): TetrisConfig {
  const chance = new URLSearchParams(search).get(CHANCE_PARAM);
  return {
    ...readSourceConfig(search, stores),
    probability:
      (chance?.trim() && probabilityFrom(Number(chance) / 100)) || probabilityStore.read(),
  };
}

export function saveConfig(config: TetrisConfig): void {
  saveSourceConfig(stores, config);
  probabilityStore.write(config.probability);
}

/** Parameters for the OBS link: the chance, and the room or the fake interval. */
export function configToParams(config: TetrisConfig): URLSearchParams {
  const params = new URLSearchParams({
    [CHANCE_PARAM]: String(Math.round(config.probability * 100)),
  });
  setSourceParams(params, config);
  return params;
}
