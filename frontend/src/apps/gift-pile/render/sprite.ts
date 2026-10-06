/**
 * The 嘉年华 icon, drawn by hand for now: a warm glowing disc with a sparkle, which reads at
 * 16 px. Swap `paintGiftIcon` for a `drawImage` of the real gift image once there is one.
 */
export function paintGiftIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const r = size / 2;
  const glow = ctx.createRadialGradient(r * 0.7, r * 0.65, r * 0.1, r, r, r);
  glow.addColorStop(0, '#fff1a8');
  glow.addColorStop(0.45, '#fb923c');
  glow.addColorStop(0.8, '#e11d74');
  glow.addColorStop(1, '#7e22ce');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();

  // A four-point sparkle, off centre.
  const cx = r * 0.72;
  const cy = r * 0.68;
  const arm = r * 0.42;
  const waist = arm * 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx + waist, cy - waist);
  ctx.lineTo(cx + arm, cy);
  ctx.lineTo(cx + waist, cy + waist);
  ctx.lineTo(cx, cy + arm);
  ctx.lineTo(cx - waist, cy + waist);
  ctx.lineTo(cx - arm, cy);
  ctx.lineTo(cx - waist, cy - waist);
  ctx.closePath();
  ctx.fill();
}

/** The icon as an image `size` CSS px across at `pixelRatio` device px per CSS px, to stamp with `drawImage`. */
export function createGiftSprite(size: number, pixelRatio: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(size * pixelRatio));
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(pixelRatio, pixelRatio);
    paintGiftIcon(ctx, size);
  }
  return canvas;
}
