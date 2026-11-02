import { CONFIG } from '../config';
import type { Matrix } from '../types';
import { defineCurse } from './types';

/** Each cell of `matrix` as a `scale` × `scale` block. */
export function scaleMatrix(matrix: Matrix, scale: number): Matrix {
  return matrix.flatMap((row) => {
    const wide = row.flatMap((cell) => Array<number>(scale).fill(cell));
    return Array.from({ length: scale }, () => [...wide]);
  });
}

/**
 * 巨大化: the next piece spawns `giantScale` times as big, each cell a block of cells, centred
 * at the top. It can't be held, so there's no getting rid of it.
 */
export const giant = defineCurse({
  type: 'giant',
  name: '巨大化',
  description: (config) =>
    `下一块放大成 ${config.effects.giantScale} 倍，不能暂存，持续 ${config.effects.giantLocks} 块`,
  rarity: 'rare',
  queue: 'e',
  cutscene: true,
  tagline: '大就是正义',
  durationLocks: CONFIG.effects.giantLocks,
  blocks: ['hold'],
  onSpawn(_ctx, piece) {
    const matrix = scaleMatrix(piece.shape.matrix, CONFIG.effects.giantScale);
    const width = matrix[0]!.length;
    return {
      type: piece.type,
      shape: { type: piece.type, matrix },
      matrix: matrix.map((row) => [...row]),
      x: Math.floor((CONFIG.board.cols - width) / 2),
      y: 0,
    };
  },
});
