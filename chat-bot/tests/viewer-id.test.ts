import {
  isDouyinUserId,
  isHiddenViewer,
  viewerIdOf as idIn,
  type Viewer,
} from '../src/core/viewer-id';

test('in a 私密 room, viewers, who all share one id, are told apart by nickname and wealth level', () => {
  const hidden = (nickname: string, payLevel?: number) => ({ id: '111111', nickname, payLevel });
  const userIdOf = (user: Viewer) => idIn(user, true);

  expect(userIdOf(hidden('苦***', 31))).toBe('111111-苦***-31');
  expect(userIdOf(hidden('🌈***', 21))).toBe('111111-🌈***-21');
  expect(userIdOf(hidden('🌈***', 23))).not.toBe(userIdOf(hidden('🌈***', 21)));
  expect(userIdOf(hidden('香***', 31))).not.toBe(userIdOf(hidden('苦***', 31)));
  expect(userIdOf(hidden('用***'))).toBe('111111-用***-0');
  expect(userIdOf({ id: 'u-阿明', nickname: '阿明', payLevel: 21 })).toBe('u-阿明');
});

test('outside a 私密 room, ids are kept as they are', () => {
  expect(idIn({ id: '111111', nickname: '苦***', payLevel: 31 }, false)).toBe('111111');
});

test('tells a 私密 viewer id from a Douyin one', () => {
  expect(isHiddenViewer('111111-苦***-31')).toBe(true);
  expect(isHiddenViewer('111111')).toBe(false);
  expect(isHiddenViewer('7664182420958889017')).toBe(false);
  expect(isDouyinUserId('7664182420958889017')).toBe(true);
  expect(isDouyinUserId('111111-苦***-31')).toBe(false);
});
