import type { SpriteSource } from '../board';

// The balloon's picture for the cut-in banner, painted once, 64 × 64, with Canvas2D.

/** The colours of a balloon, as the portrait needs them. */
interface Palette {
  stripes: readonly string[];
  skirt: string;
  outline: string;
  pattern?: 'plain' | 'bands' | 'chevrons' | 'stars';
}

const PORTRAIT = 64;

/** The balloon's portrait in a palette's colours. */
export function balloonPortrait(palette: Palette): SpriteSource {
  return {
    key: `portrait/balloon/${palette.stripes.join('')}/${palette.skirt}/${palette.outline}/${palette.pattern ?? ''}`,
    width: PORTRAIT,
    height: PORTRAIT,
    paint: (ctx) => paintPortrait(ctx, palette),
  };
}

/** The balloon for the banner: a silk envelope of gores, lit warm from inside, over its ropes and a woven basket. */
function paintPortrait(ctx: CanvasRenderingContext2D, palette: Palette): void {
  const { stripes, skirt, outline, pattern } = palette;
  const cx = PORTRAIT / 2;
  const cy = 24;
  const r = 20;
  const throatY = cy + r * 1.4;
  // The skirt first, so the envelope covers its top.
  ctx.fillStyle = skirt;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy + r * 0.8);
  ctx.lineTo(cx + r * 0.6, cy + r * 0.8);
  ctx.lineTo(cx + r * 0.2, throatY);
  ctx.lineTo(cx - r * 0.2, throatY);
  ctx.closePath();
  ctx.fill();
  // The gores, narrowing towards the sides as on a sphere, in a warm glow.
  ctx.save();
  ctx.shadowColor = 'rgba(251, 146, 60, 0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = skirt;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  const gores = 8;
  for (let i = 0; i < gores; i++) {
    const x0 = cx - r * Math.cos((i * Math.PI) / gores);
    const x1 = cx - r * Math.cos(((i + 1) * Math.PI) / gores);
    ctx.fillStyle = stripes[i % stripes.length]!;
    ctx.fillRect(x0, cy - r, x1 - x0, 2 * r);
  }
  // What is painted on them.
  ctx.fillStyle = 'rgba(255, 247, 224, 0.9)';
  if (pattern === 'bands') {
    ctx.fillRect(cx - r, cy - r * 0.05, 2 * r, r * 0.15);
  } else if (pattern === 'chevrons') {
    ctx.strokeStyle = 'rgba(255, 247, 224, 0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < gores; i++) {
      const xa = cx - r * Math.cos((i * Math.PI) / gores);
      const xb = cx - r * Math.cos(((i + 1) * Math.PI) / gores);
      ctx.beginPath();
      ctx.moveTo(xa, cy + r * 0.1);
      ctx.lineTo((xa + xb) / 2, cy + r * 0.28);
      ctx.lineTo(xb, cy + r * 0.1);
      ctx.stroke();
    }
  } else if (pattern === 'stars') {
    for (let i = 0; i < gores; i += 2) {
      const xa = cx - r * Math.cos(((i + 0.5) * Math.PI) / gores);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? 3.6 : 1.5;
        ctx.lineTo(xa + Math.cos(a) * rr, cy - r * 0.15 + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  // Seams, the light inside, and a silk highlight up on the left.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < gores; i++) {
    const x = cx - r * Math.cos((i * Math.PI) / gores);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(x + (x - cx) * 0.25, cy, cx + (x - cx) * 0.5, cy + r * 1.1);
    ctx.stroke();
  }
  const glow = ctx.createRadialGradient(cx, cy + r * 0.8, 1, cx, cy + r * 0.5, r * 1.1);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.8)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r, cy - r, 2 * r, 3 * r);
  const shine = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx, cy, r);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
  ctx.fillStyle = shine;
  ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  ctx.restore();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // The ropes and the basket, woven.
  const basketY = throatY + 7;
  const half = 7;
  ctx.strokeStyle = '#fde9c0';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.2, throatY);
  ctx.lineTo(cx - half + 1, basketY);
  ctx.moveTo(cx + r * 0.2, throatY);
  ctx.lineTo(cx + half - 1, basketY);
  ctx.stroke();
  ctx.fillStyle = '#c2813a';
  ctx.strokeStyle = '#5b3410';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(cx - half, basketY, 2 * half, 8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(91, 52, 16, 0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = 1; k < 3; k++) {
    ctx.moveTo(cx - half + 1, basketY + k * 2.6);
    ctx.lineTo(cx + half - 1, basketY + k * 2.6);
  }
  ctx.stroke();
  ctx.fillStyle = '#5b3410';
  ctx.fillRect(cx - half, basketY, 2 * half, 1.8);
  // The flame.
  ctx.shadowColor = '#fb923c';
  ctx.shadowBlur = 8;
  const flame = ctx.createLinearGradient(0, throatY, 0, throatY - 11);
  flame.addColorStop(0, '#60a5fa');
  flame.addColorStop(0.3, '#fff7ed');
  flame.addColorStop(1, '#f97316');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(cx - 2.2, throatY + 1);
  ctx.quadraticCurveTo(cx - 3, throatY - 6, cx, throatY - 11);
  ctx.quadraticCurveTo(cx + 3, throatY - 6, cx + 2.2, throatY + 1);
  ctx.closePath();
  ctx.fill();
}
