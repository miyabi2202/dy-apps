import type { Course, Craft, Pose } from './craft';
import { climbAway } from './flyover';

/** The Douyin 纸飞机 chat emoji (see `services/douyin-emoji.ts`). */
export const PLANE_URL = '/emoji/paper-plane.webp';

const SIZE = 72;
/**
 * The image is mirrored, so its long wedge leads and the keel's fold trails like a tail fin;
 * mirrored it points up and to the right, and turned this far its nose is a little up.
 */
const IMAGE_ANGLE = 0.19;

/** A paper plane: flies over level with a quick little bob, then climbs away nose up. */
export class PaperPlane implements Craft {
  readonly name = 'plane';
  readonly crossMs = 4800;
  readonly tie = { dx: -5, dy: 13 };
  private image: HTMLImageElement | null = null;

  /** The plane image; a drawn dart flies until it arrives. */
  setImage(image: HTMLImageElement | null): void {
    this.image = image;
  }

  minY(): number {
    return 44;
  }

  sag(): number {
    return 0;
  }

  pathAt(course: Course, px: number, t: number): Pose {
    const { climb, tilt } = climbAway(course, px);
    return { py: course.altitude - climb + Math.sin(t / 160) * 2, tilt };
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number): void {
    const s = SIZE;
    ctx.save();
    ctx.translate(x, y);
    if (this.image) {
      ctx.rotate(tilt + IMAGE_ANGLE);
      ctx.scale(-1, 1);
      ctx.drawImage(this.image, -s / 2, -s / 2, s, s);
    } else {
      // A paper dart pointing right, until the image is here.
      ctx.rotate(tilt);
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(s / 2, 0);
      ctx.lineTo(-s / 2, -s / 4);
      ctx.lineTo(-s / 4, 0);
      ctx.lineTo(-s / 2, s / 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
