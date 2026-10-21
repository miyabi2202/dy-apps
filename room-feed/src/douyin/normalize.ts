/**
 * Douyin's messages turned into room-feed's events. When Douyin changes its protocol, only this
 * file and proto.ts change; clients see the same events.
 */

import type { ChatPart, EventUser, RoomEvent } from '@dy-apps/room-feed-protocol';
import { decodeMessageBody, longToStr, type RawProtoMessage } from './proto';

/** The imageType of the 直播间会员 badge; its text is just 勋章, the image name tells month from year. */
const SUBSCRIBE_BADGE = 59;

function toUser(body: any): EventUser | undefined {
  const u = body?.user;
  if (!u) return undefined;
  const id = u.idStr || longToStr(u.id);
  if (!id) return undefined;
  return {
    id,
    nickname: u.nickName || '',
    avatar:
      firstUrl(u.avatarThumb?.urlList) ??
      firstUrl(u.avatarMedium?.urlList) ??
      firstUrl(u.avatarLarge?.urlList),
    payLevel: u.payGrade ? Number(longToStr(u.payGrade.level) || 0) : undefined,
    fansClub: toFansClub(u.fansClub?.data),
    badges: toBadges(u.newBadgeImageList?.length ? u.newBadgeImageList : u.badgeImageList),
  };
}

/**
 * The badges by the name: 直播间会员 as V or V年, the rest by their text (content.alternativeText),
 * leaving out those with no text or just 勋章. Undefined when none is left.
 */
function toBadges(images: any[] | undefined): string[] | undefined {
  const badges: string[] = [];
  for (const image of images ?? []) {
    const url = firstUrl(image?.urlList) ?? String(image?.uri ?? '');
    if (Number(image?.imageType) === SUBSCRIBE_BADGE || /\/subscribe_/.test(url)) {
      badges.push(/yearly/.test(url) ? 'V年' : 'V');
      continue;
    }
    const text = String(image?.content?.alternativeText ?? '').trim();
    if (text && text !== '勋章') badges.push(text);
  }
  const unique = [...new Set(badges)];
  return unique.length ? unique : undefined;
}

/** The fan club; no name and level 0 means not a member. */
function toFansClub(d: any): EventUser['fansClub'] {
  if (!d) return undefined;
  const name = String(d.clubName ?? '');
  const level = Number(d.level ?? 0);
  if (!name && !level) return undefined;
  return {
    name,
    level,
    status: d.userFansClubStatus ? Number(d.userFansClubStatus) : undefined,
    anchorId: longToStr(d.anchorId) || undefined,
  };
}

/** The first http(s) URL in a list. */
function firstUrl(urls: unknown): string | undefined {
  if (!Array.isArray(urls)) return undefined;
  return urls.find((u): u is string => typeof u === 'string' && u.startsWith('http'));
}

/**
 * Rich text (webcast.data.Text) as parts: an image piece is an emote (named by Image.content),
 * a user piece a mention, the rest text. Undefined when nothing usable is in it.
 */
function toParts(text: any): ChatPart[] | undefined {
  const parts: ChatPart[] = [];
  for (const piece of text?.pieces ?? []) {
    const image = piece.imageValue?.image;
    const url = firstUrl(image?.urlList);
    if (url) {
      parts.push({
        type: 'emote',
        url,
        name: image.content?.name || image.content?.alternativeText || undefined,
        width: Number(longToStr(image.width) || 0) || undefined,
        height: Number(longToStr(image.height) || 0) || undefined,
      });
      continue;
    }
    const user = piece.userValue?.user;
    if (user) {
      parts.push({
        type: 'mention',
        text: `@${user.nickName || ''}`,
        userId: user.idStr || longToStr(user.id) || undefined,
      });
      continue;
    }
    if (piece.stringValue) parts.push({ type: 'text', text: String(piece.stringValue) });
  }
  return parts.length ? parts : undefined;
}

/** createTime in ms: Douyin sends seconds or ms (two messages of one gift can differ); now if missing. */
function createTime(body: any, now: number): number {
  const t = body?.common?.createTime;
  const n = Number(typeof t === 'bigint' ? t : longToStr(t) || 0);
  if (!Number.isFinite(n) || n <= 0) return now;
  return n < 1e12 ? n * 1000 : n;
}

/**
 * One Douyin message as an event of room `roomId`, or null for a message we don't send on
 * (members, follows, room stats and the rest) or one that doesn't decode.
 */
export function normalize(
  msg: RawProtoMessage,
  roomId: string,
  now = Date.now(),
): RoomEvent | null {
  const decoded = decodeMessageBody(msg);
  if (!decoded) return null;
  const body = decoded.body;
  const base = {
    id: msg.msgId || decoded.msgId,
    roomId,
    ts: createTime(body, now),
    user: toUser(body),
  };

  switch (decoded.method) {
    case 'WebcastChatMessage':
      return {
        ...base,
        type: 'chat',
        data: {
          content: String(body.content ?? ''),
          parts: toParts(body.rtfContentV2) ?? toParts(body.rtfContent),
        },
      };
    case 'WebcastEmojiChatMessage': {
      // Sent as a chat whose only part is the image, with Douyin's text stand-in as content.
      const parts = toParts(body.emojiContent);
      const name = parts?.find((p) => p.type === 'emote')?.name;
      return {
        ...base,
        type: 'chat',
        data: { content: String(body.defaultContent || name || ''), parts, sticker: true },
      };
    }
    case 'WebcastGiftMessage': {
      const gift = body.gift;
      return {
        ...base,
        type: 'gift',
        data: {
          giftId: longToStr(body.giftId || gift?.id),
          giftName: gift?.name || '',
          giftIcon: firstUrl(gift?.icon?.urlList) ?? firstUrl(gift?.image?.urlList),
          diamondCount: Number(gift?.diamondCount ?? 0),
          repeatCount: Number(longToStr(body.repeatCount) || 0),
          repeatEnd: Boolean(body.repeatEnd),
          groupId: longToStr(body.groupId) || undefined,
        },
      };
    }
    case 'WebcastLikeMessage':
      return {
        ...base,
        type: 'like',
        data: {
          count: Number(longToStr(body.count) || 0),
          total: Number(longToStr(body.total) || 0),
        },
      };
    default:
      return null;
  }
}
