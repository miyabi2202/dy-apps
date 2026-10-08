/**
 * The 嘉年华 gift icon from Douyin as it is, 168×168 with its transparent background, from
 * p3-webcast.douyinpic.com/img/webcast/a7d3b86b11df780f084d06723ad70b30.png~tplv-obj.png;
 * the renderer scales it down to an icon's size once, for its sprite.
 */
export const GIFT_ICON_URL = '/gifts/jianianhua.png';

/** Fetches an image; null if it fails to load, so the page still works with a drawn stand-in. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Stand-in while the image loads or if it can't: a warm glowing disc with a sparkle. */
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
