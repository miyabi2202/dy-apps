/** Every key is stored under this prefix, so apps on the one origin don't collide with other sites' keys. */
export const KEY_PREFIX = 'dy-apps:';

export interface Store<T> {
  /** Full localStorage key, prefix included. */
  readonly key: string;
  /** The stored value, or `fallback` if it's missing, invalid or storage is unavailable. */
  read(): T;
  /** Saves the value. Silently does nothing if storage is unavailable or full. */
  write(value: T): void;
  clear(): void;
}

export interface StoreOptions<T> {
  fallback: T;
  /**
   * Checks the parsed JSON, which may be stale or hand-edited. Return `undefined`
   * to reject it and use `fallback`.
   */
  parse: (raw: unknown) => T | undefined;
}

/**
 * A JSON value in localStorage under `dy-apps:<key>`. Name keys `<app>.<thing>`,
 * e.g. `danmaku.settings`.
 */
export function createStore<T>(key: string, { fallback, parse }: StoreOptions<T>): Store<T> {
  const fullKey = KEY_PREFIX + key;
  return {
    key: fullKey,
    read() {
      try {
        const raw = storage()?.getItem(fullKey);
        if (raw == null) return fallback;
        return parse(JSON.parse(raw)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    write(value) {
      try {
        storage()?.setItem(fullKey, JSON.stringify(value));
      } catch {
        // Quota exceeded or storage blocked: persistence is best-effort.
      }
    },
    clear() {
      try {
        storage()?.removeItem(fullKey);
      } catch {
        // Storage blocked.
      }
    },
  };
}

/** Reading `localStorage` itself throws when site data is blocked. */
function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
