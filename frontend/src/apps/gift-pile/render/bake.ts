import type { SpriteSource } from './gfx';

/** Sprites are painted at this many texels per world pixel, for crisp art on a dense screen. */
export const BAKE_SCALE = 2;

/**
 * Paint `src` into a new canvas, `scale` texels per world pixel: its `paint` (in world
 * pixels, origin top left) or its image, stretched to fill. Null if there is no canvas
 * context to paint on.
 */
export function bakeSprite(src: SpriteSource, scale = BAKE_SCALE): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(src.width * scale));
  canvas.height = Math.max(1, Math.ceil(src.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(canvas.width / src.width, canvas.height / src.height);
  if (src.paint) src.paint(ctx);
  else if (src.image) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.image, 0, 0, src.width, src.height);
  }
  return canvas;
}
