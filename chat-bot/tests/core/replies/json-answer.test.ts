import { parseJsonObject } from '../../../src/core/replies/json-answer';

test('an object is returned; anything else is null', () => {
  expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  for (const text of ['hello', '[1]', 'null', '5', '"a"', '']) {
    expect(parseJsonObject(text)).toBeNull();
  }
});
