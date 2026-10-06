import type { EffectType } from '../core/curses';

/**
 * How the falling piece is drawn while a curse that changes its behaviour is active, so the
 * player sees it is the curse and not a bug. The first active type with an entry wins.
 */
export interface PieceTint {
  color: string;
  /** A marching dashed outline (something is moving on its own) or static hatching (something is locked). */
  mark: 'marching' | 'hatched';
}

export const PIECE_TINTS: Partial<Record<EffectType, PieceTint>> = {
  noRotate: { color: '#f1f5f9', mark: 'hatched' },
  spin: { color: '#e879f9', mark: 'marching' },
};
