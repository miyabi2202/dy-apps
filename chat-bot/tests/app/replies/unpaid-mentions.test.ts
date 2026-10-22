import { UnpaidMentions } from '../../../src/app/replies/unpaid-mentions';
import { chat } from '../../support/fakes';

const mention = (nickname: string) => ({ chat: chat(nickname, '@小助手 在吗'), question: '在吗' });

test('keeps the last mention of a viewer for a gift, and hands it over once', () => {
  const unpaid = new UnpaidMentions({ now: () => 1000 });
  unpaid.keep('u-阿明', mention('阿明'));
  unpaid.keep('u-阿明', { ...mention('阿明'), question: '在吗？', unprompted: 'chat' });

  expect(unpaid.claim('u-小红')).toBeUndefined();
  expect(unpaid.claim('u-阿明')).toMatchObject({
    question: '在吗？',
    unprompted: 'chat',
    at: 1000,
  });
  expect(unpaid.claim('u-阿明')).toBeUndefined();
});

test('a mention nobody came back for is dropped once it is 5 minutes old, and one claimed too late is no use', () => {
  let now = 0;
  const unpaid = new UnpaidMentions({ now: () => now });
  unpaid.keep('u-阿明', mention('阿明'));
  unpaid.keep('u-小红', mention('小红'));

  now = 5 * 60_000;
  // Exactly 5 minutes is still in time.
  expect(unpaid.claim('u-小红')).toBeDefined();
  now = 5 * 60_000 + 1;
  unpaid.keep('u-小蓝', mention('小蓝'));
  expect(unpaid.claim('u-阿明')).toBeUndefined();
  expect(unpaid.claim('u-小蓝')).toBeDefined();

  unpaid.keep('u-小黄', mention('小黄'));
  now += 5 * 60_000 + 1;
  expect(unpaid.claim('u-小黄')).toBeUndefined();
});

test('waits as long as it is told to', () => {
  let now = 0;
  const unpaid = new UnpaidMentions({ now: () => now, waitMs: 1000 });
  unpaid.keep('u-阿明', mention('阿明'));
  now = 1001;
  expect(unpaid.claim('u-阿明')).toBeUndefined();
});
