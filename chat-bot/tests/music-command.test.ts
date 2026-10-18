import { musicCommand } from '../src/app/music-command';
import { silentLog } from './fakes';

const run = (identify: Parameters<typeof musicCommand>[0]) =>
  musicCommand(identify, silentLog).run?.('');

test('says what is playing, and fails (to be refunded) when nothing is found or it cannot look', async () => {
  await expect(
    run(() => Promise.resolve({ title: 'Aimaimoko', artist: 'Inori Minase' })),
  ).resolves.toEqual({
    ok: true,
    reply: '现在放的是Inori Minase的《Aimaimoko》',
  });
  await expect(run(() => Promise.resolve(null))).resolves.toEqual({
    ok: false,
    reply: '没认出背景音乐，可能现在没在放歌，或者音乐被说话声盖住了，过一会儿再试试',
  });
  await expect(run(() => Promise.reject(new Error('not listening')))).resolves.toEqual({
    ok: false,
    reply: '现在识别不了背景音乐，请稍后再试',
  });
});
