import { isRoomId, parsePort } from './dyhub';
import { createStore, type Store } from './local-storage';

/** The port and room number as typed, valid or not (a ConnectionForm's value). */
export interface RoomFields {
  port: string;
  roomId: string;
}

export interface LiveRoom {
  port: number;
  roomId: string;
}

/** The room to connect to, or null if the port or room number isn't valid. */
export function liveRoomFrom(fields: RoomFields): LiveRoom | null {
  const port = parsePort(fields.port.trim());
  const roomId = fields.roomId.trim();
  return port !== null && isRoomId(roomId) ? { port, roomId } : null;
}

/** URL parameters for an OBS link, so the overlay connects to the same room. */
const PARAMS = { port: 'port', roomId: 'room' } as const;

/** The room in a query string, or null if it's missing or invalid. */
export function readLiveRoom(search: string): LiveRoom | null {
  const q = new URLSearchParams(search);
  return liveRoomFrom({ port: q.get(PARAMS.port) ?? '', roomId: q.get(PARAMS.roomId) ?? '' });
}

export function setLiveRoomParams(params: URLSearchParams, room: LiveRoom): void {
  params.set(PARAMS.port, String(room.port));
  params.set(PARAMS.roomId, room.roomId);
}

/**
 * What an app's connection form last held, valid or not, so a reload keeps the typing.
 * Stored as `<app>.connection`.
 */
export function createConnectionStore(app: string): Store<RoomFields> {
  return createStore<RoomFields>(`${app}.connection`, {
    fallback: { port: '', roomId: '' },
    parse: (raw) => {
      if (typeof raw !== 'object' || raw === null) return undefined;
      const { port, roomId } = raw as Record<string, unknown>;
      return typeof port === 'string' && typeof roomId === 'string' ? { port, roomId } : undefined;
    },
  });
}
