import { composePersona, mergePersona } from '../src/core/persona';

const SHARED = [
  '直播间的小助手。',
  '',
  '## 说话方式',
  '',
  '- 一本正经。',
  '',
  '## 毒舌',
  '',
  '- 只损自己。',
  '',
  '## 禁止',
  '',
  '- 不说脏话。',
].join('\n');

test("a room's sections replace, remove or add to the shared persona's, and its intro replaces the shared one", () => {
  const room = [
    '新来的小助手。',
    '',
    '## 毒舌',
    '',
    '- 也损主播一点点。',
    '',
    '## 禁止',
    '',
    '## 接梗',
    '',
    '- 顺着接。',
  ].join('\n');

  expect(mergePersona(SHARED, room)).toBe(
    [
      '新来的小助手。',
      '',
      '## 说话方式',
      '',
      '- 一本正经。',
      '',
      '## 毒舌',
      '',
      '- 也损主播一点点。',
      '',
      '## 接梗',
      '',
      '- 顺着接。',
    ].join('\n'),
  );
});

test('a room with no changes keeps the shared persona, and an empty new section adds nothing', () => {
  expect(mergePersona(SHARED, '')).toBe(SHARED);
  expect(mergePersona(SHARED, '## 没写\n')).toBe(SHARED);
});

test("without a shared persona the room's persona is the whole persona", () => {
  expect(composePersona({ shared: null, room: '\n数学课代表\n' })).toEqual({
    text: '数学课代表',
    missing: [],
  });
});

test('fills in the values the room gives, and lists the names it has none for', () => {
  const shared = '把主播{{主播}}当主人，平时叫{{ 主播 }}就行；{{口头禅}}';

  expect(composePersona({ shared, room: '', vars: { 主播: '茜茜' } })).toEqual({
    text: '把主播茜茜当主人，平时叫茜茜就行；{{口头禅}}',
    missing: ['口头禅'],
  });
});
