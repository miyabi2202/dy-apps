import { BAKE_SCALE, bakeSprite } from '../bake';
import type { ParticleData, SpriteSource } from '../gfx';
import { paintGiftIcon } from '../sprite';
import { createTexture, createWhiteTexture, updateTexture } from './textures';

/** The stand-in icon is baked this many texels across, until (or without) the real image. */
const STAND_IN_PX = 128;
/** The built-in shapes are this many texels across. */
const SHAPE_PX = 64;

type ShapeName = ParticleData['shape'];

/** Paint a built-in shape's soft-edged white art into a square canvas. */
function paintShape(shape: ShapeName, ctx: CanvasRenderingContext2D, size: number): void {
  const h = size / 2;
  ctx.translate(h, h);
  const radial = (inner: number, outer: number) => {
    const g = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
    return g;
  };
  switch (shape) {
    case 'disc': {
      const g = radial(0, h);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.45, 'rgba(255, 255, 255, 0.8)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, size, size);
      break;
    }
    case 'spark': {
      // A streak along x.
      ctx.scale(1, 0.22);
      const g = radial(0, h);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, 0.6)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h / 0.22, size, size / 0.22);
      break;
    }
    case 'ring': {
      const g = radial(0, h);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.82, 'rgba(255, 255, 255, 1)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, size, size);
      break;
    }
    case 'star': {
      // A four-point sparkle: two thin streaks and a hot centre.
      for (const turn of [0, Math.PI / 2]) {
        ctx.save();
        ctx.rotate(turn);
        ctx.scale(1, 0.12);
        const g = radial(0, h);
        g.addColorStop(0, 'rgba(255, 255, 255, 1)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(-h, -h / 0.12, size, size / 0.12);
        ctx.restore();
      }
      const g = radial(0, h * 0.4);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-h, -h, size, size);
      break;
    }
  }
}

/**
 * The textures sprites draw with, made on first use: art baked from a `SpriteSource` (by its
 * key, once, or again each time if it is dynamic), the gift icon, a white pixel, and the
 * built-in shapes particles are drawn with. All of it is lost with the GL context, so the
 * cache is made anew when the context comes back; the sources themselves live on in the removers.
 */
export class SpriteCache {
  readonly white: WebGLTexture;
  private readonly entries = new Map<string, WebGLTexture>();
  private readonly shapes = new Map<ShapeName, WebGLTexture>();
  private iconTexture: WebGLTexture | null = null;
  private iconImage: HTMLImageElement | null = null;
  private iconStale = true;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const white = createWhiteTexture(gl);
    if (!white) throw new Error('could not create a texture');
    this.white = white;
  }

  /** The gift image to draw the icon with from now on (null for the drawn stand-in). */
  setIconImage(image: HTMLImageElement | null): void {
    if (image === this.iconImage) return;
    this.iconImage = image;
    this.iconStale = true;
  }

  /** The gift icon's texture: its image once there is one, otherwise a stand-in. */
  icon(): WebGLTexture {
    const { gl } = this;
    if (this.iconTexture && !this.iconStale) return this.iconTexture;
    let source: TexImageSource = this.iconImage ?? this.standIn();
    if (this.iconImage && !this.iconImage.complete) source = this.standIn();
    if (this.iconTexture) gl.deleteTexture(this.iconTexture);
    this.iconTexture = createTexture(gl, source);
    this.iconStale = false;
    return this.iconTexture ?? this.white;
  }

  /** The texture for `src`, or null if there is nothing to draw yet (an image still loading). */
  get(src: SpriteSource): WebGLTexture | null {
    const { gl } = this;
    const known = this.entries.get(src.key);
    if (known && !src.dynamic) return known;
    if (!src.paint && !src.image) return null;
    const scale = src.paint ? BAKE_SCALE : 1;
    const source: TexImageSource | null = src.paint
      ? bakeSprite(src, scale)
      : (src.image as TexImageSource);
    if (!source) return null;
    if (known && src.dynamic) {
      updateTexture(gl, known, source);
      return known;
    }
    const texture = createTexture(gl, source);
    if (!texture) return null;
    this.entries.set(src.key, texture);
    return texture;
  }

  /** The built-in soft shape `name`, white on transparent. */
  shape(name: ShapeName): WebGLTexture {
    let texture = this.shapes.get(name);
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = SHAPE_PX;
      canvas.height = SHAPE_PX;
      const ctx = canvas.getContext('2d');
      if (ctx) paintShape(name, ctx, SHAPE_PX);
      texture = createTexture(this.gl, canvas) ?? this.white;
      this.shapes.set(name, texture);
    }
    return texture;
  }

  private standIn(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = STAND_IN_PX;
    canvas.height = STAND_IN_PX;
    const ctx = canvas.getContext('2d');
    if (ctx) paintGiftIcon(ctx, STAND_IN_PX);
    return canvas;
  }
}
