import { clampRegion, jpegSize, zoomArgs, zoomScale } from '../src/core/zoom';
import { zoomServer } from '../src/adapters/zoom-mcp';

/** The start of a JPEG of `width` × `height`: SOI, an APP0 segment, then SOF0. */
function jpegHeader(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof0 = [
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0, 0, 0, 0]);
}

test('reads a JPEG size, and nothing from what is not one', () => {
  expect(jpegSize(jpegHeader(1120, 762))).toEqual({ width: 1120, height: 762 });
  expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
});

test('keeps a region inside the screenshot, and enlarges it within limits', () => {
  const size = { width: 1120, height: 762 };
  expect(clampRegion({ x: 1000, y: -20, width: 300, height: 100.4 }, size)).toEqual({
    x: 1000,
    y: 0,
    width: 120,
    height: 80,
  });
  expect(clampRegion({ x: 5000, y: 0, width: 10, height: 10 }, size)).toBeNull();
  expect(clampRegion({ x: 10, y: 10, width: 0, height: 50 }, size)).toBeNull();
  expect(zoomScale({ x: 0, y: 0, width: 380, height: 280 }, 3)).toBe(3);
  expect(zoomScale({ x: 0, y: 0, width: 380, height: 280 })).toBe(2);
  expect(zoomScale({ x: 0, y: 0, width: 1000, height: 600 }, 4)).toBe(1.5);
  expect(zoomScale({ x: 0, y: 0, width: 100, height: 100 }, 9)).toBe(4);
  expect(zoomArgs('/s.jpg', { x: 80, y: 170, width: 380, height: 280 }, 3)).toContain(
    'crop=380:280:80:170,scale=1140:840:flags=lanczos',
  );
});

test('serves the zoom tool over MCP: lists it with the screenshot size, and returns the region', () => {
  const crops: unknown[] = [];
  const handle = zoomServer({
    size: { width: 1120, height: 762 },
    crop: (region, scale) => {
      crops.push({ region, scale });
      return new Uint8Array([1, 2, 3]);
    },
  });
  expect(handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  expect(handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).toMatchObject({
    result: { capabilities: { tools: {} } },
  });
  const listed = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) as {
    result: { tools: { name: string; description: string }[] };
  };
  expect(listed.result.tools[0]!.name).toBe('zoom');
  expect(listed.result.tools[0]!.description).toContain('1120×762');

  const call = (args: object) =>
    handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'zoom', arguments: args },
    });
  expect(call({ x: 80, y: 170, width: 380, height: 280 })).toEqual({
    jsonrpc: '2.0',
    id: 3,
    result: { content: [{ type: 'image', data: 'AQID', mimeType: 'image/jpeg' }] },
  });
  expect(crops).toEqual([{ region: { x: 80, y: 170, width: 380, height: 280 }, scale: 2 }]);
  expect(call({ x: 80 })).toMatchObject({ result: { isError: true } });
  expect(call({ x: 5000, y: 0, width: 10, height: 10 })).toMatchObject({
    result: { isError: true },
  });
});
