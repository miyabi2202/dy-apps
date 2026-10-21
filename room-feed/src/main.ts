/**
 * room-feed: one Douyin live room's chat, gifts and likes, read from the room page in Chrome and sent
 * to local clients (the site's overlays, the chat bot) over WebSocket. Wiring for the real thing.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './chrome';
import { parseCliOptions, USAGE } from './cli-options';
import { login } from './login';
import { LoginFile } from './login-file';
import { Room } from './room';
import { ChromeRooms } from './room-page';
import { createRoomFeedServer } from './server';

/** room-feed/data/: the saved login, the login window's Chrome profile and screenshots (not in git). */
const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

async function main(): Promise<number> {
  const options = parseCliOptions(process.argv.slice(2));
  if ('error' in options) {
    console.error(`${options.error}\n\n${USAGE}`);
    return 1;
  }
  const chrome = options.chrome ?? findChrome();
  if (!chrome) {
    console.error(
      '[room-feed] 找不到 Chrome。请先安装 Google Chrome，或用 --chrome 指定 chrome.exe 的位置',
    );
    return 1;
  }
  const loginFile = new LoginFile(join(DATA_DIR, 'cookie.json'));

  if (options.command === 'login') {
    const ok = await login({
      executablePath: chrome,
      profileDir: join(DATA_DIR, 'login-profile'),
      file: loginFile,
    });
    return ok ? 0 : 1;
  }

  const saved = loginFile.read();
  if (saved) {
    const until = saved.expiresAt ? `，有效期到 ${new Date(saved.expiresAt).toLocaleString()}` : '';
    console.log(`[room-feed] 已登录${until}`);
  } else {
    console.warn('[room-feed] 还没有登录：收不到礼物，也不能发弹幕。先运行 pnpm room-feed login');
  }

  const chromeRooms = new ChromeRooms({
    executablePath: chrome,
    headless: !options.headed,
    cookie: () => loginFile.read()?.cookie ?? null,
    shotsDir: join(DATA_DIR, 'screenshots'),
  });
  const room = new Room({ roomId: options.roomId, open: chromeRooms.open });
  const feed = createRoomFeedServer(room, { login: () => loginFile.read() });

  try {
    await new Promise<void>((resolve, reject) => {
      feed.server.once('error', reject);
      feed.server.listen(options.port, resolve);
    });
  } catch (e) {
    const inUse = (e as NodeJS.ErrnoException).code === 'EADDRINUSE';
    console.error(
      inUse
        ? `[room-feed] 端口 ${options.port} 已被占用：room-feed 可能已经在别的窗口运行了，或者用 --port 换一个端口`
        : `[room-feed] 启动失败：${String(e)}`,
    );
    return 1;
  }
  console.log(`[room-feed] 已启动：直播间 ${options.roomId}，端口 ${options.port}`);
  console.log(`[room-feed] 事件流：ws://localhost:${options.port}/ws?roomId=${options.roomId}`);
  room.start();

  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  console.log('\n[room-feed] 正在关闭…');
  await feed.close();
  await room.stop();
  await chromeRooms.close();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error('[room-feed] 出错了：', e);
    process.exit(1);
  },
);
