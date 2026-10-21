import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  EVENT_TYPES,
  type ChatAnswer,
  type ErrorAnswer,
  type EventType,
  type RoomInfoAnswer,
  type RoomStatus,
  type StatusFrame,
  type StreamAnswer,
} from '@dy-apps/room-feed-protocol';
import type { SavedLogin } from './login-file';
import { RoomError, type Room } from './room';

export type ServedRoom = Pick<
  Room,
  'roomId' | 'info' | 'onEvent' | 'onStatus' | 'sendChat' | 'streamUrl' | 'screenshot'
>;

export interface ServerOptions {
  /** The saved login, for the room info; null when not logged in. */
  login: () => SavedLogin | null;
  now?: () => number;
  /** How often clients are pinged, so idle connections stay open. */
  pingMs?: number;
}

export interface RoomFeedServer {
  server: Server;
  close(): Promise<void>;
}

/** The JSON body of a POST, or {} when there's none or it isn't JSON. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type Answer = RoomInfoAnswer | ChatAnswer | StreamAnswer | ErrorAnswer;

function sendJson(res: ServerResponse, status: number, body: Answer): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * room-feed's HTTP and WebSocket server, for one room:
 * - `ws://…/ws?roomId=<id>&types=chat,gift`: the room's events and status frames
 * - `GET /api/rooms/<id>`: the room's status, its streamer and the login's expiry
 * - `POST /api/rooms/<id>/chat` `{ text }`: send a chat as the logged-in account
 * - `GET /api/rooms/<id>/stream`: the URL of the stream the page plays
 * - `GET /api/rooms/<id>/screenshot`: the player as a JPEG
 * Asking for another room is an error that names the room this room-feed serves.
 */
export function createRoomFeedServer(room: ServedRoom, options: ServerOptions): RoomFeedServer {
  const now = options.now ?? Date.now;
  const otherRoom = (roomId: string) =>
    `这个 room-feed 接收的是直播间 ${room.roomId}，不是 ${roomId}。要接收 ${roomId}，用 --room ${roomId} 再开一个 room-feed（换一个 --port）`;

  const server = createServer((req, res) => {
    void handle(req, res).catch((e: unknown) => {
      if (!res.headersSent) sendJson(res, 500, { error: errorMessage(e) });
      else res.end();
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = /^\/api\/rooms\/(\d+)(\/chat|\/stream|\/screenshot)?\/?$/.exec(url.pathname);
    if (!match) return sendJson(res, 404, { error: '没有这个接口' });
    const [, roomId = '', action = ''] = match;
    if (roomId !== room.roomId) return sendJson(res, 404, { error: otherRoom(roomId) });

    const route = `${req.method} ${action}`;
    try {
      switch (route) {
        case 'GET ': {
          const login = options.login();
          const answer: RoomInfoAnswer = {
            room: { ...room.info(), login: login && { expiresAt: login.expiresAt } },
          };
          return sendJson(res, 200, answer);
        }
        case 'POST /chat': {
          const { text } = await readJson(req);
          const trimmed = typeof text === 'string' ? text.trim() : '';
          if (!trimmed) return sendJson(res, 400, { error: 'text 不能为空' });
          const { echoed } = await room.sendChat(trimmed);
          const answer: ChatAnswer = { ok: true, echoed };
          return sendJson(res, 200, answer);
        }
        case 'GET /stream': {
          const streamUrl = room.streamUrl();
          if (!streamUrl)
            return sendJson(res, 409, { error: '播放器还没开始拉流（可能还没开播）' });
          return sendJson(res, 200, { url: streamUrl });
        }
        case 'GET /screenshot': {
          const jpeg = await room.screenshot();
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
          res.end(jpeg);
          return;
        }
        default:
          return sendJson(res, 405, { error: `不支持 ${req.method} ${url.pathname}` });
      }
    } catch (e) {
      const status = e instanceof RoomError ? e.statusCode : 500;
      return sendJson(res, status, { error: errorMessage(e) });
    }
  }

  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Map<WebSocket, ReadonlySet<EventType>>();
  const send = (ws: WebSocket, frame: StatusFrame) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  };
  const statusFrame = (status: RoomStatus): StatusFrame =>
    status === 'live'
      ? { type: '__connected', roomId: room.roomId, ts: now() }
      : { type: '__connecting', roomId: room.roomId, ts: now() };

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const roomId = params.get('roomId');
    if (roomId && roomId !== room.roomId) {
      send(ws, { type: '__error', roomId, error: otherRoom(roomId), ts: now() });
      ws.close();
      return;
    }
    const asked = (params.get('types') ?? '').split(',');
    const types = EVENT_TYPES.filter((type) => asked.includes(type));
    clients.set(ws, new Set(types.length ? types : EVENT_TYPES));
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    send(ws, { type: '__hello', roomId: room.roomId, types, ts: now() });
    send(ws, statusFrame(room.info().status));
  });

  const offEvent = room.onEvent((event) => {
    const text = JSON.stringify(event);
    for (const [ws, types] of clients) {
      if (types.has(event.type) && ws.readyState === WebSocket.OPEN) ws.send(text);
    }
  });
  const offStatus = room.onStatus((status) => {
    for (const ws of clients.keys()) send(ws, statusFrame(status));
  });
  const ping = setInterval(() => {
    for (const ws of clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, options.pingMs ?? 20_000);

  return {
    server,
    close: async () => {
      clearInterval(ping);
      offEvent();
      offStatus();
      for (const ws of clients.keys()) ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
