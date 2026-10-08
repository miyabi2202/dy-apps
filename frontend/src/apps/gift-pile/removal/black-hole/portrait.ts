import type { SpriteSource } from '../board';

// The black hole's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

const SIZE = 64;
const MID = SIZE / 2;

/** A black hole after Gargantua: a black disc with a thin bright ring, its accretion disk bent over and under it. */
export function blackHolePortrait(glow: string, disk: string): SpriteSource {
  return {
    key: `portrait/black-hole/${glow}/${disk}`,
    width: SIZE,
    height: SIZE,
    paint(ctx) {
      const halo = ctx.createRadialGradient(MID, MID, 8, MID, MID, 31);
      halo.addColorStop(0, glow);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;
      ctx.translate(MID, MID);
      ctx.rotate(-0.1);
      // The disk: white-hot on the side coming towards us, dimmer on the other.
      const lit = ctx.createLinearGradient(-30, 0, 30, 0);
      lit.addColorStop(0, '#ffffff');
      lit.addColorStop(0.35, disk);
      lit.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.shadowColor = disk;
      ctx.shadowBlur = 9;
      ctx.strokeStyle = lit;
      ctx.lineCap = 'round';
      // Its far side, bent over the top and under the bottom of the hole.
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, Math.PI * 1.04, Math.PI * 1.96);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      // The horizon, with the photon ring round it.
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // The near side of the disk, flat across the front.
      ctx.shadowColor = disk;
      ctx.shadowBlur = 4;
      ctx.strokeStyle = lit;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 29, 5, 0, 0.12, Math.PI - 0.12);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 29, 5, 0, Math.PI + 0.3, Math.PI * 2 - 0.3);
      ctx.stroke();
    },
  };
}
