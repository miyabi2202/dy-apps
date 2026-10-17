import { exchangeLines, lastLines, talkLine } from '../src/core/talk-record';

const MS = Date.UTC(2026, 9, 17, 15, 0, 0);

test('a talk line is one line with the date and time, line breaks flattened', () => {
  expect(talkLine(MS, '二\n\r换行')).toBe('2026-10-17 15:00:00 二 换行\n');
});

test('an exchange is the question and the answer, a line each', () => {
  expect(exchangeLines(MS, { nickname: '阿明', question: '在吗', answer: '@阿明 在呢' })).toBe(
    '2026-10-17 15:00:00 阿明问：在吗\n2026-10-17 15:00:00 你答：@阿明 在呢\n',
  );
});

test('keeps the last lines, without the trailing newline', () => {
  expect(lastLines('一\n二\n三\n', 2)).toBe('二\n三');
  expect(lastLines('一\n', 5)).toBe('一');
  expect(lastLines('', 5)).toBe('');
});
