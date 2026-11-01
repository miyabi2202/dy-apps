import { BlockedError, EmptyReadError } from '../core/errors';
import type { ReadResult } from '../core/types';

/** What shows when Douyin wants a captcha or a login before going on. */
export interface BlockSurface {
  /** Which wall is showing, if any. */
  blocked(): Promise<'captcha' | 'login' | null>;
}

/**
 * Runs `run`, then (also when it threw: a wall is why a target never shows) looks for a captcha or
 * a login wall and stops the run at the first one, with a clear message.
 */
export async function orBlocked<T>(surface: BlockSurface, run: () => Promise<T>): Promise<T> {
  const check = async () => {
    const wall = await surface.blocked().catch(() => null);
    if (wall) throw new BlockedError(wall);
  };
  let value: T;
  try {
    value = await run();
  } catch (e) {
    await check();
    throw e;
  }
  await check();
  return value;
}

/** Every body read by `read`, the items joined and `hasMore` as the last body said. */
export function readAll<T>(
  bodies: readonly string[],
  read: (body: string) => ReadResult<T>,
): ReadResult<T> {
  let hasMore = false;
  const items: T[] = [];
  for (const body of bodies) {
    const result = read(body);
    items.push(...result.items);
    hasMore = result.hasMore;
  }
  return { items, hasMore };
}

/**
 * Items from a reader that must find some: none (and the bodies are kept for the error) means
 * Douyin's JSON changed or the page didn't load, so the run stops, loudly, with the raw bodies
 * for the run to save.
 */
export function requireItems<T>(
  what: string,
  bodies: readonly string[],
  items: readonly T[],
): void {
  if (items.length === 0) throw new EmptyReadError(what, bodies);
}

/** `items` once each by id, in the order first seen. */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
}
