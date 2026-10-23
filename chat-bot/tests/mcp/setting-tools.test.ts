import { numberTool, onOffTool } from '../../src/mcp/setting-tools';
import { silentLog } from '../support/fakes';

const context = { asker: '雅', question: '', admin: true };

function logged() {
  const lines: [string, object | undefined][] = [];
  return {
    lines,
    log: {
      ...silentLog,
      info: (message: string, meta?: object) => void lines.push([message, meta]),
    },
  };
}

describe('onOffTool', () => {
  function setup() {
    const state = { on: false };
    const { lines, log } = logged();
    const tool = onOffTool({
      name: 'set_screenshots',
      command: '截图',
      description: '开关截图',
      get: () => state.on,
      set: (on) => (state.on = on),
      log,
    });
    return { tool, state, lines };
  }

  test('sets the feature, says what it was and is, and logs the change; admin-only', async () => {
    const { tool, state, lines } = setup();
    expect(tool.adminOnly).toBe(true);
    expect(JSON.parse((await tool.call({ on: true }, context)).text)).toEqual({
      before: false,
      after: true,
    });
    expect(state.on).toBe(true);
    expect(lines).toEqual([['setting', { command: '截图', before: false, after: true }]]);
  });

  test('anything but true or false is an error, and changes nothing', async () => {
    const { tool, state } = setup();
    for (const on of ['1', 1, undefined]) {
      expect(await tool.call({ on }, context)).toMatchObject({ isError: true });
    }
    expect(state.on).toBe(false);
  });

  test('/截图 takes 0 or 1, and says it was handled', () => {
    const [command] = setup().tool.commands!;
    expect(command!.name).toBe('截图');
    expect(command!.parse('1')).toEqual({ args: { on: true } });
    expect(command!.parse('0')).toEqual({ args: { on: false } });
    expect(command!.parse('开')).toEqual({ usage: '要写 0（关闭）或 1（打开），用法：/截图 1' });
    expect(command!.say({ text: '{}' }, { on: true })).toBe('已处理截图请求');
  });
});

describe('numberTool', () => {
  function setup(options: { integer?: boolean; min?: number; max?: number } = {}) {
    const state = { value: 5 };
    const { lines, log } = logged();
    const tool = numberTool({
      name: 'set_max_reply_parts',
      command: '最大回复条数',
      description: '改条数',
      arg: { name: 'parts', description: '条数' },
      usage: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3',
      get: () => state.value,
      set: (value) => (state.value = value),
      log,
      ...options,
    });
    return { tool, state, lines };
  }

  test('sets the number, says what it was and is, and logs the change; admin-only', async () => {
    const { tool, state, lines } = setup({ integer: true, min: 1, max: 10 });
    expect(tool.adminOnly).toBe(true);
    expect(JSON.parse((await tool.call({ parts: 2 }, context)).text)).toEqual({
      before: 5,
      after: 2,
    });
    expect(state.value).toBe(2);
    expect(lines).toEqual([['setting', { command: '最大回复条数', before: 5, after: 2 }]]);
  });

  test('a value of the wrong kind or out of range is an error, and changes nothing', async () => {
    const { tool, state } = setup({ integer: true, min: 1, max: 10 });
    for (const parts of ['2', 0, 11, 1.5, undefined]) {
      expect(await tool.call({ parts }, context)).toMatchObject({ isError: true });
    }
    expect(state.value).toBe(5);
  });

  test('describes its argument in the schema, with the limits', () => {
    expect(setup({ integer: true, min: 1, max: 10 }).tool.inputSchema).toEqual({
      type: 'object',
      properties: { parts: { type: 'integer', minimum: 1, maximum: 10, description: '条数' } },
      required: ['parts'],
    });
    expect(setup().tool.inputSchema).toMatchObject({
      properties: { parts: { type: 'number' } },
    });
  });

  test('/最大回复条数 takes a number within the limits, else says how to use it', () => {
    const [command] = setup({ integer: true, min: 1, max: 10 }).tool.commands!;
    const usage = { usage: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3' };
    expect(command!.name).toBe('最大回复条数');
    expect(command!.parse('3')).toEqual({ args: { parts: 3 } });
    for (const typed of ['0', '11', '两', '2.5', '']) expect(command!.parse(typed)).toEqual(usage);
    expect(command!.say({ text: '{}' }, { parts: 3 })).toBe('已处理最大回复条数请求');
  });

  test('without `integer` a decimal is fine', async () => {
    const { tool } = setup({ min: 0 });
    expect(tool.commands![0]!.parse('0.6')).toEqual({ args: { parts: 0.6 } });
    expect(JSON.parse((await tool.call({ parts: 0.6 }, context)).text)).toEqual({
      before: 5,
      after: 0.6,
    });
  });
});
