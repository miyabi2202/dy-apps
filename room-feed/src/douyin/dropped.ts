import protobuf from 'protobufjs';
import type { RawProtoMessage } from './proto';

/** A message room-feed doesn't decode, as kept for working out what it is later. */
export interface DroppedMessage {
  /** When it came, in ms. */
  ts: number;
  method: string;
  msgId: string;
  /** The text in it, found without its schema (see textIn), so a log of them can be grepped. */
  text: string[];
  /** Its body, base64, to decode properly once its schema is known. */
  payload: string;
}

export function droppedMessage(msg: RawProtoMessage, ts: number): DroppedMessage {
  return {
    ts,
    method: msg.method,
    msgId: msg.msgId,
    text: textIn(msg.payload),
    payload: Buffer.from(msg.payload).toString('base64'),
  };
}

/** Messages nest this deep at most; deeper is taken for bytes that only look like one. */
const MAX_DEPTH = 12;

/**
 * The text in a protobuf message without its schema: every length-delimited field that is
 * readable UTF-8 (`开通了直播间会员`), and those in the messages nested in it, in order, once each,
 * URLs left out. A field that is neither text nor a message is skipped.
 */
export function textIn(payload: Uint8Array): string[] {
  const found = new Set<string>();
  walk(payload, 0, found);
  return [...found];
}

function walk(bytes: Uint8Array, depth: number, found: Set<string>): boolean {
  const reader = protobuf.Reader.create(bytes);
  const fields: Uint8Array[] = [];
  try {
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      if (tag >>> 3 === 0) return false;
      if ((tag & 7) === 2) fields.push(reader.bytes());
      else reader.skipType(tag & 7);
    }
  } catch {
    return false;
  }
  for (const field of fields) {
    const text = readable(field);
    if (text !== null) {
      if (!/^https?:\/\//.test(text)) found.add(text);
    } else if (depth < MAX_DEPTH) {
      walk(field, depth + 1, found);
    }
  }
  return true;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** `bytes` as text when they're UTF-8 with no control characters but whitespace; else null. */
function readable(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ? null : text;
}
