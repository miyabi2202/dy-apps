import type { SpriteSource } from '../board';

// The comic-book "砰！" that goes up when the doors slam shut, painted once with Canvas2D.

const WIDTH = 96;
const HEIGHT = 72;

/** A jagged yellow burst with a red rim and the word in thick black-edged letters. */
export const BANG: SpriteSource = {
  key: 'subway/bang',
  width: WIDTH,
  height: HEIGHT,
  paint(ctx) {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const spikes = 14;
    ctx.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k / (spikes * 2)) * Math.PI * 2;
      const r = k % 2 === 0 ? 1 : 0.62 + 0.08 * Math.sin(k * 2.7);
      const x = cx + Math.cos(a) * r * (WIDTH / 2 - 3);
      const y = cy + Math.sin(a) * r * (HEIGHT / 2 - 3);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffe14d';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#e8352b';
    ctx.stroke();
    ctx.font = `900 34px "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1a1a1a';
    ctx.strokeText('砰！', cx + 2, cy + 2);
    ctx.fillStyle = '#e8352b';
    ctx.fillText('砰！', cx + 2, cy + 2);
  },
};
