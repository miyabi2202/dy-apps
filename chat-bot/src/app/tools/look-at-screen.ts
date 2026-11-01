import { errorMessage } from '../../core/errors';
import { clampRegion, jpegSize, zoomScale, type Region } from '../../core/replies/zoom';
import type { BotTool, ToolContext } from '../../core/tools/bot-tool';
import type { CropImage, Log } from '../ports';
import type { Screenshots } from '../room/screenshots';

export interface LookAtScreenOptions {
  screenshots: Pick<Screenshots, 'take'>;
  /** Enlarges part of the screenshot (ffmpeg, see CROP_IMAGE). */
  crop: CropImage;
  log: Log;
}

const REGION_FIELDS = ['x', 'y', 'width', 'height'] as const;

/**
 * `look_at_screen`: the live video, for Claude to see when it decides it needs to (a board, a
 * question on screen, someone asking what's showing); it sees none otherwise. With a region it
 * enlarges part of the question's screenshot, so it can read small figures and text: one
 * screenshot per question, taken on the first call, so every zoom is of the picture it saw.
 */
export function lookAtScreenTool({ screenshots, crop, log }: LookAtScreenOptions): BotTool {
  // Each question's screenshot, by its session's context (the same object for all its calls).
  const taken = new WeakMap<ToolContext, Promise<Uint8Array | undefined>>();
  const screenshotFor = (context: ToolContext) => {
    let shot = taken.get(context);
    if (!shot) {
      // One that failed is asked for again on the next call.
      shot = screenshots.take().then((image) => {
        if (!image) taken.delete(context);
        return image;
      });
      taken.set(context, shot);
    }
    return shot;
  };
  return {
    name: 'look_at_screen',
    description:
      '看直播画面：返回一张现在的直播截图。你平时看不到画面，只有调用它才看得到。需要看画面才答得好时调用：有人要你看画面、看题、看板书、看游戏，问屏幕上有什么、写了什么，或主播在说「看这个」「这里」。用不着画面的（聊天、问歌、点赞）别调用，它会让回答慢一些。一个问题只截一次图；看不清图形、小字、选项时，再调用并给出 x、y、width、height（像素，从截图左上角算起），放大那一块看，可以放大好几处。',
    repeatable: true,
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '放大时：区域左边离截图左边多少像素' },
        y: { type: 'number', description: '放大时：区域上边离截图上边多少像素' },
        width: { type: 'number', description: '放大时：区域宽多少像素' },
        height: { type: 'number', description: '放大时：区域高多少像素' },
        scale: { type: 'number', description: '放大倍数，1 到 4，默认 2' },
      },
    },
    async call(args, context) {
      const given = REGION_FIELDS.filter((field) => args[field] !== undefined);
      if (given.length && !REGION_FIELDS.every((field) => typeof args[field] === 'number')) {
        return {
          text: '放大要给出 x、y、width、height 四个数字；只看整个画面就都不写',
          isError: true,
        };
      }
      const image = await screenshotFor(context);
      if (!image) return { text: '现在截不到直播画面', isError: true };
      const size = jpegSize(image) ?? { width: 0, height: 0 };
      const whole = `直播截图，${size.width}×${size.height} 像素`;
      if (!given.length) return { text: whole, image };
      const region = clampRegion(args as unknown as Region, size);
      if (!region) return { text: `这个区域不在截图里（${whole}）`, isError: true };
      const scale = zoomScale(region, typeof args.scale === 'number' ? args.scale : undefined);
      try {
        const zoomed = await crop(image, region, scale);
        return {
          text: `截图 (${region.x}, ${region.y}) 起 ${region.width}×${region.height} 的部分，放大 ${scale.toFixed(1)} 倍`,
          image: zoomed,
        };
      } catch (err) {
        log.warn('could not zoom into the screenshot', { region, error: errorMessage(err) });
        return { text: `放大失败：${errorMessage(err)}`, isError: true };
      }
    },
  };
}
