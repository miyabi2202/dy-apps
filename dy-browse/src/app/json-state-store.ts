import type { StateFile, StateStore } from '../core/run-state';
import type { DataStore } from './ports';

/** The run state as `state/<date>.json` in the data store. */
export function jsonStateStore(data: DataStore): StateStore {
  return {
    read(date) {
      const text = data.read(`state/${date}.json`);
      if (!text) return null;
      try {
        return JSON.parse(text) as StateFile;
      } catch {
        return null;
      }
    },
    write(date, state) {
      data.write(`state/${date}.json`, JSON.stringify(state, null, 2));
    },
  };
}
