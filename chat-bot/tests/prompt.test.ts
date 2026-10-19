import { buildPrompt } from '../src/core/prompt';

const input = { history: [], transcript: [], now: 0, singleLength: 40, maxLength: 200 };

test('{{intro}} is what the bot says about itself, under a heading, and empty without it', () => {
  const filled = buildPrompt('{{intro}}', { ...input, intro: '我是「默认关闭」\n' });
  expect(filled).toContain('关于你自己');
  expect(filled.endsWith('我是「默认关闭」')).toBe(true);
  expect(buildPrompt('{{intro}}', { ...input, intro: ' \n' })).toBe('');
  expect(buildPrompt('{{intro}}', input)).toBe('');
});
