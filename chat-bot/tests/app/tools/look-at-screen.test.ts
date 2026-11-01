import { lookAtScreenTool } from '../../../src/app/tools/look-at-screen';
import type { Region } from '../../../src/core/replies/zoom';
import { silentLog } from '../../support/fakes';

/** A JPEG's first bytes, enough for its size (640×360): SOI, then a SOF0 marker. */
const FRAME = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x68, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00,
]);
const ZOOMED = new Uint8Array([0xff, 0xd8, 0x01]);

function setup(shots: (Uint8Array | undefined)[] = [FRAME], fails?: Error) {
  let taken = 0;
  const crops: { image: Uint8Array; region: Region; scale: number }[] = [];
  const warned: string[] = [];
  const tool = lookAtScreenTool({
    screenshots: { take: () => Promise.resolve(shots[taken++]) },
    crop: (image, region, scale) => {
      crops.push({ image, region, scale });
      return fails ? Promise.reject(fails) : Promise.resolve(ZOOMED);
    },
    log: { ...silentLog, warn: (message) => void warned.push(message) },
  });
  const question = () => ({ asker: '阿明', question: '看看这题' });
  return { tool, question, crops, warned, taken: () => taken };
}

test('is offered to anyone, and runs on every call (each may zoom somewhere else)', () => {
  const { tool } = setup();
  expect(tool.adminOnly).toBeUndefined();
  expect(tool.offered).toBeUndefined();
  expect(tool.repeatable).toBe(true);
});

test('with no region it gives the live video and its size', async () => {
  const { tool, question } = setup();
  expect(await tool.call({}, question())).toEqual({
    text: '直播截图，640×360 像素',
    image: FRAME,
  });
});

test('a region zooms into the screenshot the question already took, not a new one', async () => {
  const { tool, question, crops, taken } = setup([FRAME, new Uint8Array([0xff, 0xd8])]);
  const context = question();
  await tool.call({}, context);
  const zoomed = await tool.call({ x: 600, y: 300, width: 100, height: 100, scale: 3 }, context);
  expect(zoomed).toEqual({
    text: '截图 (600, 300) 起 40×60 的部分，放大 3.0 倍',
    image: ZOOMED,
  });
  expect(crops).toEqual([
    { image: FRAME, region: { x: 600, y: 300, width: 40, height: 60 }, scale: 3 },
  ]);
  expect(taken()).toBe(1);
  // Another question gets a screenshot of its own.
  await tool.call({}, question());
  expect(taken()).toBe(2);
});

test('a zoom first thing takes the screenshot itself', async () => {
  const { tool, question, crops } = setup();
  await tool.call({ x: 0, y: 0, width: 10, height: 10 }, question());
  expect(crops).toMatchObject([{ image: FRAME, scale: 2 }]);
});

test('half a region, or one outside the picture, is an error', async () => {
  const { tool, question } = setup();
  expect(await tool.call({ x: 1, y: 2 }, question())).toMatchObject({ isError: true });
  expect(await tool.call({ x: 700, y: 0, width: 10, height: 10 }, question())).toEqual({
    text: '这个区域不在截图里（直播截图，640×360 像素）',
    isError: true,
  });
});

test('no screenshot is an error, and the next call asks again', async () => {
  const { tool, question, taken } = setup([undefined, FRAME]);
  const context = question();
  expect(await tool.call({}, context)).toEqual({ text: '现在截不到直播画面', isError: true });
  expect(await tool.call({}, context)).toMatchObject({ image: FRAME });
  expect(taken()).toBe(2);
});

test('a crop that fails says why, and is logged', async () => {
  const { tool, question, warned } = setup([FRAME], new Error('no ffmpeg'));
  expect(await tool.call({ x: 0, y: 0, width: 10, height: 10 }, question())).toEqual({
    text: '放大失败：no ffmpeg',
    isError: true,
  });
  expect(warned).toEqual(['could not zoom into the screenshot']);
});
