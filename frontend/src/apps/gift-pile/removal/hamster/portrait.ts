import type { SpriteSource } from '../board';
import type { Coat } from './critter';

// The hamster's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;

/** The hamster's face from the front, its cheeks stuffed into a huge ball, eyes screwed shut and sweating. */
export function hamsterPortrait(coat: Coat): SpriteSource {
  return {
    key: `portrait/hamster/${coat.fur}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = coat.line;
      ctx.lineWidth = 1.8;
      // Its ears.
      for (const x of [17, 47]) {
        ctx.fillStyle = coat.fur;
        ctx.beginPath();
        ctx.arc(x, 12, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = coat.pink;
        ctx.beginPath();
        ctx.arc(x, 12.5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // The face: the head over two cheeks stuffed wider than it, golden over creamy.
      ctx.beginPath();
      ctx.ellipse(32, 26, 15, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(16, 40, 15.5, 17, 0.2, 0, Math.PI * 2);
      ctx.ellipse(48, 40, 15.5, 17, -0.2, 0, Math.PI * 2);
      const fur = ctx.createLinearGradient(0, 10, 0, 60);
      fur.addColorStop(0, coat.fur);
      fur.addColorStop(0.45, coat.fur);
      fur.addColorStop(0.7, '#fff6ea');
      fur.addColorStop(1, '#fff6ea');
      ctx.fillStyle = fur;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Shine on the cheeks, stretched tight.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (const x of [10, 42]) {
        ctx.beginPath();
        ctx.ellipse(x, 33, 4, 2.4, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255, 130, 150, 0.45)';
      for (const x of [15, 49]) {
        ctx.beginPath();
        ctx.ellipse(x, 44, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(16, 40, 15.5, 17, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(48, 40, 15.5, 17, -0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(32, 26, 15, 13, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      // Eyes screwed shut, > <.
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(22, 21);
      ctx.lineTo(27, 24);
      ctx.lineTo(22, 27);
      ctx.moveTo(42, 21);
      ctx.lineTo(37, 24);
      ctx.lineTo(42, 27);
      ctx.stroke();
      // The nose, and the mouth pressed tight on the last mouthful, an icon's corner poking out.
      ctx.fillStyle = coat.pink;
      ctx.beginPath();
      ctx.ellipse(32, 30.5, 2.6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(28, 36);
      ctx.quadraticCurveTo(30, 34.5, 32, 36);
      ctx.quadraticCurveTo(34, 34.5, 36, 36);
      ctx.stroke();
      ctx.fillStyle = '#ff5d8f';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(30, 36, 6, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(32.4, 36, 1.2, 5);
      // A drop of sweat.
      ctx.fillStyle = '#9fd8ff';
      ctx.strokeStyle = '#3d86c6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(53, 6);
      ctx.quadraticCurveTo(58, 14, 56, 17);
      ctx.arc(53, 15, 3.6, 0.3, Math.PI - 0.1);
      ctx.quadraticCurveTo(49, 13, 53, 6);
      ctx.fill();
      ctx.stroke();
    },
  };
}
