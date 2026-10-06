import type { Rarity } from '../core/curses';

/** Text colour for a curse's name, by rarity: white, blue, purple. */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#f8fafc',
  uncommon: '#60a5fa',
  rare: '#c084fc',
};
