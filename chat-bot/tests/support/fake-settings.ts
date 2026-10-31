import type { SettingsStore } from '../../src/app/ports';
import { SETTING_DEFAULTS, type Settings } from '../../src/core/commands/settings';

/** The settings in memory: `initial` over the defaults, changed by `set`, as a room_config.json is. */
export function fakeSettings(initial: Partial<Settings> = {}): SettingsStore {
  let current: Settings = { ...SETTING_DEFAULTS, ...initial };
  return {
    get: () => current,
    set: (patch) => {
      current = { ...current, ...patch };
    },
  };
}
