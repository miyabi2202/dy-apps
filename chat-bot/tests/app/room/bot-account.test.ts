import { waitForAccount } from '../../../src/app/room/bot-account';
import type { BotAccount } from '../../../src/app/ports';

test('waits for room-feed to say which account it is logged in as, saying once why it waits', async () => {
  const answers: (BotAccount | 'loggedOut' | null | Error)[] = [
    new Error('room-feed is not up yet'),
    null,
    'loggedOut',
    'loggedOut',
    { uid: '769', nickname: '默认关闭' },
  ];
  const logged: string[] = [];
  const log = {
    debug() {},
    info: (message: string) => void logged.push(message),
    warn: (message: string) => void logged.push(message),
    error() {},
  };
  let slept = 0;
  const account = await waitForAccount({
    account: () => {
      const answer = answers.shift() ?? null;
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    log,
    sleep: () => Promise.resolve(void slept++),
  });

  expect(account).toEqual({ uid: '769', nickname: '默认关闭' });
  expect(slept).toBe(4);
  expect(logged).toEqual([
    'waiting for room-feed to say which account it is logged in as',
    'room-feed is not logged in to Douyin: run pnpm room-feed login, then start room-feed again',
    'logged in as',
  ]);
});
