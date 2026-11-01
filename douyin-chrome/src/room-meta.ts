import type { RoomMeta } from '@dy-apps/room-feed-protocol';

/**
 * The page embeds its data HTML-escaped (&quot;, &amp;), and the anchor block JSON-escaped once
 * more (\"anchor\":{\"id_str\":…), so both are undone before searching. Null when nothing is found.
 */
export function parseRoomMeta(html: string): RoomMeta | null {
  const clean = html
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const nickname = clean.match(/"nickname":"([^"]{1,80})"/)?.[1] ?? '';
  const avatar = clean.match(/"avatar":"(https:[^"]+?)"/)?.[1] ?? '';
  const title = clean.match(/"title":"([^"]{1,200})"/)?.[1] ?? '';
  const anchor = clean.replace(/\\"/g, '"').match(/"anchor":\{[^{}]{0,600}/)?.[0] ?? '';
  const uid = anchor.match(/"id_str":"(\d+)"/)?.[1] ?? '';
  const secUid = anchor.match(/"sec_uid":"([^"]+)"/)?.[1] ?? '';
  if (!nickname && !title && !uid) return null;
  return { nickname, uid, secUid, avatar, title };
}
