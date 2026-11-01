import { zoomServer } from '../../../src/adapters/models/zoom-mcp';

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
