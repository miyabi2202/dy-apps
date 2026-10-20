import type { Settings } from '../core/settings';
import type { SettingsStore } from './ports';

/**
 * One of a feature's settings: kept in `store` (the room's room_config.json) when there is one, so
 * a change by command and one by hand are the same, and else in the feature, from `initial`.
 */
export function setting<K extends keyof Settings>(
  store: SettingsStore | undefined,
  name: K,
  initial: Settings[K],
): { get(): Settings[K]; set(value: Settings[K]): void } {
  let own = initial;
  return {
    get: () => (store ? store.get()[name] : own),
    set: (value) => {
      if (store) store.set({ [name]: value });
      else own = value;
    },
  };
}
