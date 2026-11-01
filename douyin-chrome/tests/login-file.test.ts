import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserCookies, LoginFile } from '../src/login-file';

describe('LoginFile', () => {
  it('reads what was written, until it expires', () => {
    const dir = mkdtempSync(join(tmpdir(), 'douyin-chrome-login-'));
    try {
      let now = 1000;
      const file = new LoginFile(join(dir, 'cookie.json'), () => now);
      expect(file.read()).toBeNull();
      file.write('a=1; b=2', 5000);
      expect(file.read()).toEqual({ cookie: 'a=1; b=2', expiresAt: 5000, savedAt: 1000 });
      now = 6000;
      expect(file.read()).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('turns `k=v; k=v` into cookies for douyin.com', () => {
    expect(browserCookies('a=1; b=x=y; junk')).toEqual([
      { name: 'a', value: '1', domain: '.douyin.com', path: '/' },
      { name: 'b', value: 'x=y', domain: '.douyin.com', path: '/' },
    ]);
  });
});
