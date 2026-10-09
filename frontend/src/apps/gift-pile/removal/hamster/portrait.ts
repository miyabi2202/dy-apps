import type { SpriteSource } from '../board';
import type { Coat } from './critter';

// The hamster's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** Its outline: the head, the two pouches stuffed out either side of it, and its belly. */
function silhouette(ctx: CanvasRenderingContext2D, each: () => void): void {
  for (const [x, y, rx, ry] of [
    [32, 29, 17, 16],
    [15, 40, 14, 14],
    [49, 40, 14, 14],
    [32, 46, 15, 13],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    each();
  }
}

/** The hamster's face from the front, round as a mochi, its cheeks stuffed huge, eyes screwed shut > < and sweating. */
export function hamsterPortrait(coat: Coat): SpriteSource {
  return {
    key: `portrait/hamster/${coat.fur}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      // Its round ears, pink inside.
      for (const x of [19, 45]) {
        ctx.fillStyle = coat.fur;
        ctx.strokeStyle = coat.line;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, 14, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffadb9';
        ctx.beginPath();
        ctx.arc(x, 14.5, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // One soft outline round it all: every part stroked, then every part filled over the
      // strokes, so only the outer edge is left.
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 2.4;
      silhouette(ctx, () => ctx.stroke());
      const fur = ctx.createLinearGradient(0, 12, 0, 58);
      fur.addColorStop(0, coat.fur);
      fur.addColorStop(0.45, coat.fur);
      fur.addColorStop(0.72, '#fff4e4');
      fur.addColorStop(1, '#fff4e4');
      ctx.fillStyle = fur;
      silhouette(ctx, () => ctx.fill());
      // A creamy muzzle, a shine on each stretched pouch, and rosy blush.
      ctx.fillStyle = '#fff4e4';
      ctx.beginPath();
      ctx.ellipse(32, 37, 7.5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      for (const x of [11, 45]) {
        ctx.beginPath();
        ctx.ellipse(x, 31, 3.6, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 128, 150, 0.5)';
      for (const x of [15, 49]) {
        ctx.beginPath();
        ctx.ellipse(x, 40, 6, 3.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Eyes screwed shut, > <.
      ctx.strokeStyle = '#2a1a17';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 24);
      ctx.lineTo(27, 27);
      ctx.lineTo(22, 30);
      ctx.moveTo(42, 24);
      ctx.lineTo(37, 27);
      ctx.lineTo(42, 30);
      ctx.stroke();
      // A tiny pink nose, and its mouth pressed tight on the last mouthful, an icon's corner
      // poking out.
      ctx.fillStyle = coat.pink;
      ctx.beginPath();
      ctx.ellipse(32, 32.5, 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(29, 36.5);
      ctx.quadraticCurveTo(30.5, 35.3, 32, 36.5);
      ctx.quadraticCurveTo(33.5, 35.3, 35, 36.5);
      ctx.stroke();
      ctx.fillStyle = '#ff5d8f';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(32.5, 37, 5, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(34.5, 37, 1, 4);
      // Its tiny paws held in front.
      ctx.fillStyle = coat.pink;
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 0.9;
      for (const x of [26.5, 37.5]) {
        ctx.beginPath();
        ctx.ellipse(x, 46, 3, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // A drop of sweat.
      ctx.fillStyle = '#a8dcff';
      ctx.strokeStyle = '#5c9fd6';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(53, 6);
      ctx.quadraticCurveTo(57.5, 13, 56, 16);
      ctx.arc(53, 14.5, 3.3, 0.3, Math.PI - 0.1);
      ctx.quadraticCurveTo(49.5, 12.5, 53, 6);
      ctx.fill();
      ctx.stroke();
    },
  };
}
