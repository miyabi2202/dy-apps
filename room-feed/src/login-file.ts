import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The Douyin login `pnpm room-feed login` saves: its cookies as one `k=v; k=v` string. */
export interface SavedLogin {
  cookie: string;
  /** When the login cookie runs out, in ms; null if Douyin didn't say. */
  expiresAt: number | null;
  savedAt: number;
}

/** A cookie for the browser to load, on every douyin.com host. */
export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

/** `data/cookie.json`: the saved login, kept until it expires or a new login replaces it. */
export class LoginFile {
  constructor(
    readonly path: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** The saved login, or null when there's none, it can't be read or it has expired. */
  read(): SavedLogin | null {
    let saved: Partial<SavedLogin>;
    try {
      saved = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<SavedLogin>;
    } catch {
      return null;
    }
    if (!saved.cookie?.trim()) return null;
    const expiresAt = saved.expiresAt ?? null;
    if (expiresAt !== null && expiresAt < this.now()) return null;
    return { cookie: saved.cookie, expiresAt, savedAt: saved.savedAt ?? 0 };
  }

  write(cookie: string, expiresAt: number | null): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const saved: SavedLogin = { cookie, expiresAt, savedAt: this.now() };
    writeFileSync(this.path, JSON.stringify(saved, null, 2));
  }
}

/** `k=v; k=v` as cookies for the browser. */
export function browserCookies(cookie: string): BrowserCookie[] {
  return cookie.split(';').flatMap((part) => {
    const i = part.indexOf('=');
    if (i <= 0) return [];
    return [
      {
        name: part.slice(0, i).trim(),
        value: part.slice(i + 1).trim(),
        domain: '.douyin.com',
        path: '/',
      },
    ];
  });
}
