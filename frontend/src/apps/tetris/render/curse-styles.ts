import type { EffectType } from '../core/curses';

/**
 * How the falling piece is drawn while a curse that changes its behaviour is active, so the
 * player sees it is the curse and not a bug. The first active type with an entry wins.
 * Only for a curse without a cutscene: one with a cutscene has already been announced, so its
 * piece stays plain and this is the only mark on the board.
 */
export interface PieceTint {
  color: string;
  /**
   * A marching dashed outline (something is moving on its own), static hatching (something is
   * locked) or a fast flare around each cell (something is in a hurry).
   */
  mark: 'marching' | 'hatched' | 'flare';
}

export const PIECE_TINTS: Partial<Record<EffectType, PieceTint>> = {
  hasty: { color: '#ff2d95', mark: 'flare' },
};

/**
 * The sign that pops over the falling piece when a curse moves it by itself, so viewers see the
 * streamer didn't press anything. A curse without one still gets the afterimage and speed lines.
 */
export const NUDGE_ICONS: Partial<Record<EffectType, string>> = {
  drunk: '🍺',
  slip: '🧊',
};
