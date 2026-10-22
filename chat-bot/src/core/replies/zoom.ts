/** A region of an image, in its pixels from the top-left corner. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The width and height of a JPEG, from its first start-of-frame marker; null when it isn't one. */
export function jpegSize(data: Uint8Array): { width: number; height: number } | null {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < data.length) {
    if (data[at] !== 0xff) return null;
    const marker = data[at + 1]!;
    const length = (data[at + 2]! << 8) | data[at + 3]!;
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (data[at + 5]! << 8) | data[at + 6]!,
        width: (data[at + 7]! << 8) | data[at + 8]!,
      };
    }
    at += 2 + length;
  }
  return null;
}

/** The part of `region` inside an image of `size`, in whole pixels; null when none of it is. */
export function clampRegion(
  region: Region,
  size: { width: number; height: number },
): Region | null {
  const left = Math.max(0, Math.round(region.x));
  const top = Math.max(0, Math.round(region.y));
  const right = Math.min(size.width, Math.round(region.x + region.width));
  const bottom = Math.min(size.height, Math.round(region.y + region.height));
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null;
}

/** The longest side a zoomed image may have, so it isn't scaled down again before the model sees it. */
const MAX_SIDE = 1500;

/** How much to enlarge `region`: as asked (2 by default, 1–4), but no bigger than MAX_SIDE allows. */
export function zoomScale(region: Region, asked = 2): number {
  const wanted = Math.max(1, Math.min(asked, 4));
  return Math.max(1, Math.min(wanted, MAX_SIDE / Math.max(region.width, region.height)));
}

/** ffmpeg's arguments to cut `region` out of the JPEG at `file`, enlarged `scale` times, as a JPEG on stdout. */
export function zoomArgs(file: string, region: Region, scale: number): string[] {
  const { x, y, width, height } = region;
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return [
    '-loglevel',
    'error',
    '-i',
    file,
    '-vf',
    `crop=${width}:${height}:${x}:${y},scale=${w}:${h}:flags=lanczos`,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    '-f',
    'image2',
    '-c:v',
    'mjpeg',
    'pipe:1',
  ];
}
