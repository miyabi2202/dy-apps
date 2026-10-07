/**
 * The 嘉年华 gift icon from Douyin, trimmed and scaled to 16×16 with its transparent
 * background (the original is p3-webcast.douyinpic.com/img/webcast/a7d3b86b11df780f084d06723ad70b30.png).
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

/**
 * The icon as an image `size` CSS px across at `pixelRatio` device px per CSS px, to stamp
 * with `drawImage`: the gift image when there is one, otherwise the drawn stand-in.
 */
export function createGiftSprite(
  size: number,
  pixelRatio: number,
  image: HTMLImageElement | null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(size * pixelRatio));
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(pixelRatio, pixelRatio);
    if (image) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, size, size);
    } else {
      paintGiftIcon(ctx, size);
    }
  }
  return canvas;
}
