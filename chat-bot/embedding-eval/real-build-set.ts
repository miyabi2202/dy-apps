/**
 * Builds the real-room recall test from the bot's own data: per room, the pool recall would search
 * (memory.md entries, viewers' notes, thoughts, streams, Fairy's days if any) and ~400 moments
 * sampled inside streams, each turned into the query the bot would make with its own `recallQuery`.
 *
 * From chat-bot/: npx tsx embedding-eval/real-build-set.ts [--moments 400] [--seed 1]
 * Writes data/embedding-eval/real/set.json (local, never committed: it quotes real rooms).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { recallQuery } from '../src/core/memory/recall';

const { values } = parseArgs({
  options: {
    moments: { type: 'string', default: '400' },
    seed: { type: 'string', default: '1' },
    data: { type: 'string', default: 'data' },
  },
});
const DATA = values.data;
const OUT = join(DATA, 'embedding-eval', 'real');
const TOTAL = Number(values.moments);
const MIN_PER_ROOM = 40;
/** What this reads of a room's room_config.json. */
interface RoomConfigJson {
  aliases?: { name: string }[];
  streamer?: { uid?: string; nickname?: string };
  persona?: string;
}

/** The bot's own nickname (README / AGENTS.md); the rooms' aliases are added per room. */
const BOT_NICKNAMES = ['默认关闭'];
/** The bot's transcript window (DEFAULT_TRANSCRIPT_WINDOW_MS). */
const SPEECH_WINDOW_MS = 5 * 60_000;
/** A gap this long in a room's record ends a stream. */
const STREAM_GAP_MS = 30 * 60_000;
/** An entry longer than this, made of several lines, is split into its lines (bullets). */
const LONG_ENTRY = 300;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Line {
  t: number;
  sender: string;
  uid: string;
  type: string;
  text: string;
}

const LINE = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(\+\d\d:\d\d)? \[([^\]]*)\]\((\w+)\) ?(.*)$/;

function parseLine(raw: string): Line | null {
  const m = LINE.exec(raw);
  if (!m) return null;
  const [, time, offset, who, type, text] = m;
  const t = Date.parse(`${time!.replace(' ', 'T')}${offset ?? '+08:00'}`);
  const hash = who!.lastIndexOf('#');
  return {
    t,
    sender: hash >= 0 ? who!.slice(0, hash) : who!,
    uid: hash >= 0 ? who!.slice(hash + 1) : '',
    type: type!,
    text: text!.trim(),
  };
}

const stripTrailers = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*<!--.*-->\s*$/.test(line))
    .join('\n')
    .trim();

/** memory.md's entries: split by lines that are only §; a long many-line entry into its lines. */
function memoryEntries(text: string): string[] {
  const out: string[] = [];
  for (const raw of stripTrailers(text).split(/^§$/m)) {
    const entry = raw.trim();
    if (!entry) continue;
    const lines = entry.split('\n').filter((l) => l.trim());
    if (entry.length <= LONG_ENTRY || lines.length < 2) {
      out.push(entry);
      continue;
    }
    for (const line of lines) {
      if (/^\s*#/.test(line)) continue;
      const text = line.replace(/^\s*[-*]\s+/, '').trim();
      // A lead-in line like 「常来的观众：」 says nothing on its own.
      if (/[：:]$/.test(text) && text.length < 40) continue;
      if (text.replace(/[^\p{L}\p{N}]/gu, '').length >= 4) out.push(text);
    }
  }
  return out;
}

export interface PoolItem {
  id: string;
  kind: 'memory' | 'note' | 'thought' | 'stream' | 'life';
  text: string;
}

export interface Moment {
  id: string;
  room: string;
  at: string;
  speech: string[];
  chat: string[];
  query: string;
}

export interface RoomSet {
  room: string;
  botNames: string[];
  pool: PoolItem[];
}

const meaningful = (line: string) => line.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '').length >= 2;

function lineSet(query: string): Set<string> {
  return new Set(query.split('\n').map((l) => l.trim()));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

function main() {
  const random = rng(Number(values.seed));
  const rooms = readdirSync(DATA).filter(
    (d) => /^\d+$/.test(d) && existsSync(join(DATA, d, 'chat')),
  );
  const sets: RoomSet[] = [];
  // Nicknames by user id from every room's record, and memory.md's 「name#id」, for a note whose
  // viewer never chatted in its own room's record.
  const allNicks = new Map<string, string>();
  for (const room of rooms) {
    const memory = join(DATA, room, 'memory.md');
    if (existsSync(memory))
      for (const m of readFileSync(memory, 'utf8').matchAll(/([^\s：:、，（(]+)#(\d{6,})/g))
        allNicks.set(m[2]!, m[1]!);
  }
  for (const room of rooms)
    for (const file of readdirSync(join(DATA, room, 'chat')))
      for (const raw of readFileSync(join(DATA, room, 'chat', file), 'utf8').split('\n')) {
        const line = parseLine(raw);
        if (line?.uid) allNicks.set(line.uid, line.sender);
      }
  const roomLines = new Map<string, Line[]>();
  for (const room of rooms) {
    const dir = join(DATA, room);
    const lines: Line[] = [];
    for (const file of readdirSync(join(dir, 'chat'))
      .filter((f) => f.endsWith('.txt'))
      .sort()) {
      for (const raw of readFileSync(join(dir, 'chat', file), 'utf8').split('\n')) {
        const line = parseLine(raw);
        if (line) lines.push(line);
      }
    }
    lines.sort((a, b) => a.t - b.t);
    roomLines.set(room, lines);
    const nick = new Map(allNicks);
    for (const line of lines) if (line.uid) nick.set(line.uid, line.sender);

    const config = (
      existsSync(join(dir, 'room_config.json'))
        ? JSON.parse(readFileSync(join(dir, 'room_config.json'), 'utf8'))
        : {}
    ) as RoomConfigJson;
    const botNames = [...new Set([...BOT_NICKNAMES, ...(config.aliases ?? []).map((a) => a.name)])];

    const pool: PoolItem[] = [];
    const add = (kind: PoolItem['kind'], text: string) =>
      pool.push({ id: `${room}:${pool.length}`, kind, text });
    if (existsSync(join(dir, 'memory.md')))
      for (const e of memoryEntries(readFileSync(join(dir, 'memory.md'), 'utf8'))) add('memory', e);
    for (const uid of readdirSync(dir).sort()) {
      const note = join(dir, uid, 'note.md');
      if (!statSync(join(dir, uid)).isDirectory() || !existsSync(note)) continue;
      // A note holds entries split by § like memory.md; each is shown with whom it's about.
      const who =
        uid === config.streamer?.uid
          ? `关于主播「${config.streamer.nickname ?? uid}」`
          : `关于观众「${nick.get(uid) ?? uid}」`;
      for (const entry of stripTrailers(readFileSync(note, 'utf8')).split(/^§$/m)) {
        const text = entry.trim().replace(/^[-*]\s+/gm, '');
        if (text) add('note', `${who}：${text}`);
      }
    }
    for (const [file, kind] of [
      ['thoughts.md', 'thought'],
      ['streams.md', 'stream'],
    ] as const) {
      const path = join(dir, 'memory', file);
      if (!existsSync(path)) continue;
      for (const line of stripTrailers(readFileSync(path, 'utf8')).split('\n'))
        if (line.trim() && !line.startsWith('#')) add(kind, line.trim());
    }
    const personaFile = config.persona ? join('prompts', config.persona) : '';
    const personaText =
      personaFile && existsSync(personaFile) ? readFileSync(personaFile, 'utf8') : '';
    const lives = join(DATA, 'lives', 'fairy');
    if (/^base:\s*fairy\s*$/m.test(personaText) && existsSync(lives))
      for (const f of readdirSync(lives)
        .filter((f) => f.endsWith('.md'))
        .sort())
        for (const line of readFileSync(join(lives, f), 'utf8').split('\n'))
          if (line.trim() && !line.startsWith('#')) add('life', line.trim());
    sets.push({ room, botNames, pool });
  }

  // Moments per room: at least MIN_PER_ROOM, the rest by how much speech and chat each has.
  const content = (room: string) =>
    roomLines.get(room)!.filter((l) => l.type === 'speech' || l.type === 'chat').length;
  const quotas = new Map(rooms.map((r) => [r, MIN_PER_ROOM]));
  const left = TOTAL - MIN_PER_ROOM * rooms.length;
  const totalContent = rooms.reduce((a, r) => a + content(r), 0);
  for (const r of rooms)
    quotas.set(r, MIN_PER_ROOM + Math.round((left * content(r)) / totalContent));

  const moments: Moment[] = [];
  for (const room of rooms) {
    const lines = roomLines.get(room)!;
    const streams: Line[][] = [];
    for (const line of lines) {
      const last = streams.at(-1)?.at(-1);
      if (!last || line.t - last.t > STREAM_GAP_MS) streams.push([line]);
      else streams.at(-1)!.push(line);
    }
    const usable = streams.filter((s) => s.at(-1)!.t - s[0]!.t > 10 * 60_000);
    const weights = usable.map((s) => s.at(-1)!.t - s[0]!.t);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const kept: Moment[] = [];
    const quota = quotas.get(room)!;
    for (let attempt = 0; kept.length < quota && attempt < quota * 50; attempt++) {
      let pick = random() * weightSum;
      let s = 0;
      while (pick > weights[s]! && s < usable.length - 1) pick -= weights[s++]!;
      const stream = usable[s]!;
      const start = stream[0]!.t + 3 * 60_000;
      const t = start + random() * (stream.at(-1)!.t - start);
      const before = stream.filter((l) => l.t <= t);
      // The transcript holds speech and sung lines (played ones are recorded twice; song is the bot's).
      const speech = before
        .filter((l) => (l.type === 'speech' || l.type === 'sing') && l.t > t - SPEECH_WINDOW_MS)
        .map((l) => l.text);
      const chat = before.filter((l) => l.type === 'chat').map((l) => l.text);
      const query = recallQuery(speech, chat);
      if (query.split('\n').filter(meaningful).length < 3) continue;
      const set = lineSet(query);
      if (kept.some((m) => jaccard(lineSet(m.query), set) >= 0.5)) continue;
      kept.push({
        id: `${room}:m${kept.length}`,
        room,
        at: new Date(t).toISOString(),
        speech: speech.slice(-6),
        chat: chat.slice(-8),
        query,
      });
    }
    moments.push(...kept);
  }

  // Half tune, half test, by moment, stratified by room.
  const split: Record<string, 'tune' | 'test'> = {};
  for (const room of rooms) {
    const ids = moments.filter((m) => m.room === room).map((m) => m.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    }
    ids.forEach((id, i) => (split[id] = i < ids.length / 2 ? 'tune' : 'test'));
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'set.json'), JSON.stringify({ rooms: sets, moments, split }, null, 1));
  for (const s of sets) {
    const n = moments.filter((m) => m.room === s.room).length;
    const kinds = s.pool.reduce<Record<string, number>>(
      (a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a),
      {},
    );
    console.log(
      s.room,
      'pool',
      s.pool.length,
      JSON.stringify(kinds),
      'moments',
      n,
      'quota',
      quotas.get(s.room),
    );
  }
  console.log('moments', moments.length);
}

main();
