/**
 * room-feed's addresses and its HTTP API's answers. Every endpoint is for one room, the one
 * room-feed serves; asking about another answers 404 with an ErrorAnswer naming it.
 */

import type { EventType } from './events';

/** The port room-feed listens on unless started with --port. */
export const DEFAULT_PORT = 8757;

/** `connecting` until Douyin's push frames arrive, `live` while they do. */
export type RoomStatus = 'connecting' | 'live';

/** Who the streamer is, read from the room page. */
export interface RoomMeta {
  nickname: string;
  /** The streamer's uid (anchor.id_str); empty when not found. */
  uid: string;
  /** The streamer's sec_uid; empty when not found. */
  secUid: string;
  avatar: string;
  /** The stream's title. */
  title: string;
}

/** `GET /api/rooms/<id>`. */
export interface RoomInfoAnswer {
  room: {
    roomId: string;
    status: RoomStatus;
    /** Null until the room page has been read. */
    meta: RoomMeta | null;
    /** The saved Douyin login; null when not logged in (no gifts, no sending chat). */
    login: { expiresAt: number | null } | null;
  };
}

/** `POST /api/rooms/<id>/chat`'s body. */
export interface ChatRequest {
  text: string;
}

/** `POST /api/rooms/<id>/chat`: `echoed` once the chat came back in the push stream. */
export interface ChatAnswer {
  ok: true;
  echoed: boolean;
}

/** The most likes one like may ask for. */
export const MAX_LIKES = 200;

/** `POST /api/rooms/<id>/like`'s body: how many likes to give by holding Douyin's like key (z), up to MAX_LIKES. */
export interface LikeRequest {
  likes: number;
}

/**
 * `POST /api/rooms/<id>/like`: about how many likes it gave (from Douyin's counter by the heart,
 * so give or take a few), how long the key was held, and whether Douyin's 手速太快了 cut it short.
 */
export interface LikeAnswer {
  ok: true;
  liked: number;
  heldMs: number;
  tooFast: boolean;
}

/** A gift it didn't send because the account has fewer `diamonds` than its `price`: nothing was clicked. */
export interface NotEnoughDiamonds {
  result: 'notEnough';
  diamonds: number;
  price: number;
}

/**
 * How sending today's 粉丝团灯牌 (2 diamonds) went: `sent`, `already` when today's was sent
 * before, or `notEnough`.
 */
export type FansLampResult = { result: 'sent' } | { result: 'already' } | NotEnoughDiamonds;

/** `POST /api/rooms/<id>/fans-lamp`: how it went. */
export type FansLampAnswer = { ok: true } & FansLampResult;

/**
 * How sending one 小心心 (1 diamond) went: `sent`, with the diamonds left (null when the page
 * didn't show the balance), or `notEnough`.
 */
export type HeartResult = { result: 'sent'; diamondsLeft: number | null } | NotEnoughDiamonds;

/** `POST /api/rooms/<id>/heart`: how it went. */
export type HeartAnswer = { ok: true } & HeartResult;

/** `GET /api/rooms/<id>/balance`: the account's diamonds, as the room page shows them by 充值; null when it doesn't. */
export interface BalanceAnswer {
  diamonds: number | null;
}

/** `GET /api/rooms/<id>/stream`: the FLV or HLS URL the room page's player pulls. */
export interface StreamAnswer {
  url: string;
}

/** Any endpoint, when it fails (4xx or 5xx). `GET …/screenshot` answers a JPEG otherwise. */
export interface ErrorAnswer {
  error: string;
}

/** A TCP port, 1–65535, or null. */
export function parsePort(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : null;
}

/** A Douyin room number: digits only (the tail of a live.douyin.com link). */
export function isRoomId(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * The room number in what was typed: the digits, or the tail of a live.douyin.com link. Full-width
 * digits (from a Chinese input method) count too. Null when there's no room number in it.
 */
export function roomIdFrom(input: string): string | null {
  const ascii = input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const fromUrl = /live\.douyin\.com\/(\d+)/.exec(ascii)?.[1];
  if (fromUrl) return fromUrl;
  const digits = ascii.trim();
  return isRoomId(digits) ? digits : null;
}

/** The WebSocket for a room's events of these types (all of them when none are given). */
export function eventsUrl(port: number, roomId: string, types: readonly EventType[] = []): string {
  return `ws://localhost:${port}/ws?roomId=${roomId}&types=${types.join(',')}`;
}

/** The actions a room has below its own address: `/api/rooms/<id>/<action>`. */
export const ROOM_ACTIONS = [
  'chat',
  'like',
  'fans-lamp',
  'heart',
  'balance',
  'stream',
  'screenshot',
] as const;

export type RoomAction = (typeof ROOM_ACTIONS)[number];

/** A room endpoint: the room itself, or its chat, likes, fans lamp, 小心心, balance, stream or screenshot. */
export function roomUrl(port: number, roomId: string, action?: RoomAction): string {
  return `http://localhost:${port}/api/rooms/${roomId}${action ? `/${action}` : ''}`;
}
