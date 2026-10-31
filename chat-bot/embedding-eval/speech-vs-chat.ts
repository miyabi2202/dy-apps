/**
 * How recall does on the streamer's speech against viewers' chat, on the real-room test
 * (real-build-set.ts, the judge's labels, no new judging): each moment's query bucketed by how much
 * of it is speech and how much sung, the bot's scoring (recall.ts) per bucket, and other queries
 * built from the same moment: sung lines left out, speech and chat as two queries, each line its
 * own query.
 *
 * From chat-bot/, with the embedding service running: npx tsx embedding-eval/speech-vs-chat.ts
 * Reads data/embedding-eval/real/{set,labels,vectors}.json and the rooms' chat records (to get
 * back which speech lines were sung), writes speech-vectors.json (cache), speech-results.json and
 * speech-report.md there.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { embeddingClient } from '../src/adapters/embedding/embedding-client';
import {
  combinedScore,
  pinyinScores,
  recalled,
  recallQuery,
  similarity,
  withoutNames,
} from '../src/core/memory/recall';
import type { Moment, RoomSet } from './real-build-set';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    port: { type: 'string', default: '8759' },
    boot: { type: 'string', default: '2000' },
  },
});
const DATA = values.data;
const DIR = join(DATA, 'embedding-eval', 'real');
const REPS = Number(values.boot);
/** The bot's setting (recall.ts PINYIN_WEIGHT, the service's cutoff). */
const WEIGHT = 0.15;
const CUTOFF = 0.5;
const MAX = 3;
const CUTOFFS = Array.from({ length: 36 }, (_, i) => Math.round((0.3 + i * 0.01) * 100) / 100);
/** As real-build-set.ts: the bot's transcript window, and the gap that ends a stream. */
const SPEECH_WINDOW_MS = 5 * 60_000;
const STREAM_GAP_MS = 30 * 60_000;
/** recallQuery's defaults. */
const SPEECH_LINES = 6;
const CHAT_LINES = 8;
const MAX_CHARS = 600;
/** Buckets: share of the query's characters from speech (sung lines included), and from singing. */
const MOSTLY = 0.7;
const MUCH_SINGING = 0.4;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the chat records, read as real-build-set.ts reads them ----

interface Line {
  t: number;
  type: string;
  text: string;
}

const LINE = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(\+\d\d:\d\d)? \[([^\]]*)\]\((\w+)\) ?(.*)$/;

function parseLine(raw: string): Line | null {
  const m = LINE.exec(raw);
  if (!m) return null;
  const [, time, offset, , type, text] = m;
  return {
    t: Date.parse(`${time!.replace(' ', 'T')}${offset ?? '+08:00'}`),
    type: type!,
    text: text!.trim(),
  };
}

function streamsOf(room: string): Line[][] {
  const dir = join(DATA, room, 'chat');
  const lines: Line[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .sort())
    for (const raw of readFileSync(join(dir, file), 'utf8').split('\n')) {
      const line = parseLine(raw);
      if (line) lines.push(line);
    }
  lines.sort((a, b) => a.t - b.t);
  const streams: Line[][] = [];
  for (const line of lines) {
    const last = streams.at(-1)?.at(-1);
    if (!last || line.t - last.t > STREAM_GAP_MS) streams.push([line]);
    else streams.at(-1)!.push(line);
  }
  return streams;
}

type Kind = 'speech' | 'sing' | 'chat';
interface Typed {
  kind: Kind;
  text: string;
}

/** recallQuery's lines, each with where it came from: the same lines, trimmed the same way. */
function queryLines(speech: Typed[], chat: Typed[]): Typed[] {
  const lines = [...speech.slice(-SPEECH_LINES), ...chat.slice(-CHAT_LINES)]
    .map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
  while (lines.length > 1 && lines.map((l) => l.text).join('\n').length > MAX_CHARS) lines.shift();
  return lines;
}

// ---- embedding, cached per model and kind (the score-recall cache is read, not written) ----

type Cache = Record<string, number[]>;
const readCache = (path: string) =>
  (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) as Cache;

async function embedder() {
  const client = embeddingClient({ port: Number(values.port), timeoutMs: 120_000 });
  const { model } = await client.info();
  const shared = readCache(join(DIR, 'vectors.json'));
  const ownPath = join(DIR, 'speech-vectors.json');
  const own = readCache(ownPath);
  const key = (kind: string, t: string) => `${model}\u0000${kind}\u0000${t}`;
  const get = (kind: string, t: string) => shared[key(kind, t)] ?? own[key(kind, t)];
  return {
    model,
    async fill(texts: string[], kind: 'query' | 'document') {
      const missing = [...new Set(texts.filter((t) => !get(kind, t)))];
      for (let i = 0; i < missing.length; i += 64) {
        const chunk = missing.slice(i, i + 64);
        const made = await client.embed(chunk, kind);
        chunk.forEach(
          (t, j) => (own[key(kind, t)] = made[j]!.map((x) => Math.round(x * 1e5) / 1e5)),
        );
      }
      if (missing.length) writeFileSync(ownPath, JSON.stringify(own));
      return missing.length;
    },
    get: (kind: 'query' | 'document', t: string) => get(kind, t)!,
  };
}

// ---- metrics ----

/** Per item scores for a moment, or null when the variant has no query (nothing recalled). */
type Scores = number[] | null;

interface Scored {
  id: string;
  room: string;
  split: 'tune' | 'test';
  relevant: Set<number>;
  speechShare: number;
  singShare: number;
  lines: Typed[];
  variants: Record<string, Scores>;
}

/** Each moment's score arrays are its own, so a rank is worked out once per array. */
const ranks = new WeakMap<number[], number>();

function rankOf(scores: Scores, relevant: Set<number>): number {
  if (!scores) return Infinity;
  const known = ranks.get(scores);
  if (known !== undefined) return known;
  const order = scores.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const rank = order.findIndex(([, i]) => relevant.has(i));
  ranks.set(scores, rank);
  return rank;
}

function rankMetrics(ms: Scored[], v: string) {
  const pos = ms.filter((m) => m.relevant.size);
  let h1 = 0;
  let h3 = 0;
  let rr = 0;
  for (const m of pos) {
    const rank = rankOf(m.variants[v]!, m.relevant);
    if (rank === 0) h1++;
    if (rank < 3) h3++;
    rr += 1 / (rank + 1);
  }
  const n = pos.length || 1;
  return { n: pos.length, hit1: h1 / n, hit3: h3 / n, mrr: rr / n };
}

function rule(ms: Scored[], v: string, cutoff: number) {
  let got = 0;
  let hits = 0;
  let relevant = 0;
  let none = 0;
  let noneRecalling = 0;
  for (const m of ms) {
    const s = m.variants[v]!;
    const r = s ? recalled(s, { cutoff, max: MAX }) : [];
    got += r.length;
    hits += r.filter((i) => m.relevant.has(i)).length;
    relevant += m.relevant.size;
    if (!m.relevant.size) {
      none++;
      if (r.length) noneRecalling++;
    }
  }
  const precision = got ? hits / got : 1;
  const recall = relevant ? hits / relevant : 1;
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    noneRecalls: none ? noneRecalling / none : 0,
    perMoment: got / (ms.length || 1),
  };
}

/** Each metric's 95% bootstrap interval over moments (resampled within each room, seed 7). */
function bootstrap(ms: Scored[], f: (ms: Scored[]) => Record<string, number>) {
  const random = rng(7);
  const byRoom = new Map<string, Scored[]>();
  for (const m of ms) byRoom.set(m.room, [...(byRoom.get(m.room) ?? []), m]);
  const samples: Record<string, number>[] = [];
  for (let r = 0; r < REPS; r++) {
    const sample: Scored[] = [];
    for (const group of byRoom.values())
      for (let i = 0; i < group.length; i++)
        sample.push(group[Math.floor(random() * group.length)]!);
    samples.push(f(sample));
  }
  const out: Record<string, [number, number]> = {};
  for (const key of Object.keys(samples[0] ?? {})) {
    const v = samples.map((s) => s[key]!).sort((a, b) => a - b);
    out[key] = [v[Math.floor(REPS * 0.025)]!, v[Math.floor(REPS * 0.975)]!];
  }
  return out;
}

/** Reciprocal rank of each positive moment minus its room's mean (over `all`): room-adjusted MRR. */
function roomAdjustedMrr(ms: Scored[], all: Scored[], v: string) {
  const rr = (m: Scored) => 1 / (rankOf(m.variants[v]!, m.relevant) + 1);
  const mean = new Map<string, number>();
  for (const room of new Set(all.map((m) => m.room))) {
    const pos = all.filter((m) => m.room === room && m.relevant.size);
    mean.set(room, pos.reduce((a, m) => a + rr(m), 0) / (pos.length || 1));
  }
  const pos = ms.filter((m) => m.relevant.size);
  return pos.reduce((a, m) => a + rr(m) - mean.get(m.room)!, 0) / (pos.length || 1);
}

// ---- main ----

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f3 = (x: number) => x.toFixed(3);
const ci = (x: number, iv: [number, number] | undefined, f = f3) =>
  iv ? `${f(x)} [${f(iv[0])}–${f(iv[1])}]` : f(x);

async function main() {
  const set = JSON.parse(readFileSync(join(DIR, 'set.json'), 'utf8')) as {
    rooms: RoomSet[];
    moments: Moment[];
    split: Record<string, 'tune' | 'test'>;
  };
  const { labels } = JSON.parse(readFileSync(join(DIR, 'labels.json'), 'utf8')) as {
    labels: Record<string, string[]>;
  };
  const rooms = new Map(set.rooms.map((r) => [r.room, r]));
  const streams = new Map(set.rooms.map((r) => [r.room, streamsOf(r.room)]));
  const moments = set.moments.filter((m) => m.id in labels);

  // Each moment's speech and chat again, now with which speech lines were sung.
  let mismatched = 0;
  const built = moments.map((m) => {
    const t = Date.parse(m.at);
    const stream = streams.get(m.room)!.find((s) => s[0]!.t <= t && t <= s.at(-1)!.t + 1)!;
    const before = stream.filter((l) => l.t <= t);
    const speech: Typed[] = before
      .filter((l) => (l.type === 'speech' || l.type === 'sing') && l.t > t - SPEECH_WINDOW_MS)
      .map((l) => ({ kind: l.type as Kind, text: l.text }));
    const chat: Typed[] = before
      .filter((l) => l.type === 'chat')
      .map((l) => ({ kind: 'chat', text: l.text }));
    const texts = (ls: Typed[]) => ls.map((l) => l.text);
    const same =
      recallQuery(texts(speech), texts(chat)) === m.query &&
      JSON.stringify(texts(speech).slice(-SPEECH_LINES)) === JSON.stringify(m.speech) &&
      JSON.stringify(texts(chat).slice(-CHAT_LINES)) === JSON.stringify(m.chat);
    if (!same) mismatched++;
    const lines = queryLines(speech, chat);
    const chars = (k: (l: Typed) => boolean) =>
      lines.filter(k).reduce((a, l) => a + l.text.length, 0);
    const total = chars(() => true) || 1;
    const sungOut = speech.filter((l) => l.kind !== 'sing');
    const noSingQuery = recallQuery(texts(sungOut), texts(chat));
    const noSingLines = queryLines(sungOut, chat);
    const part = (ls: Typed[], k: (l: Typed) => boolean) =>
      ls
        .filter(k)
        .map((l) => l.text)
        .join('\n');
    const isSpeech = (l: Typed) => l.kind !== 'chat';
    return {
      m,
      lines,
      speechShare: chars(isSpeech) / total,
      singShare: chars((l) => l.kind === 'sing') / total,
      queries: {
        whole: [m.query],
        noSing: noSingQuery ? [noSingQuery] : [],
        speechPart: [part(lines, isSpeech)].filter(Boolean),
        chatPart: [part(lines, (l) => !isSpeech(l))].filter(Boolean),
        noSingSpeechPart: [part(noSingLines, isSpeech)].filter(Boolean),
        noSingChatPart: [part(noSingLines, (l) => !isSpeech(l))].filter(Boolean),
        perLine: lines.map((l) => l.text),
        noSingPerLine: noSingLines.map((l) => l.text),
      },
    };
  });
  if (mismatched) console.warn(`${mismatched} moments did not rebuild to the same query`);

  const emb = await embedder();
  const docTexts = [...new Set(set.rooms.flatMap((r) => r.pool.map((p) => p.text)))];
  const queryTexts = [...new Set(built.flatMap((b) => Object.values(b.queries).flat()))];
  console.log('embedded', await emb.fill(docTexts, 'document'), 'documents');
  console.log('embedded', await emb.fill(queryTexts, 'query'), 'queries');

  const scored: Scored[] = built.map((b) => {
    const room = rooms.get(b.m.room)!;
    const texts = room.pool.map((p) => p.text);
    const docs = texts.map((t) => emb.get('document', t));
    const index = new Map(room.pool.map((p, i) => [p.id, i]));
    /** Cosine and pinyin of each item against one query, as MemoryRecall scores them. */
    const parts = (q: string) => {
      const v = emb.get('query', q);
      return {
        cosine: docs.map((d) => similarity(v, d)),
        pinyin: pinyinScores(texts, withoutNames(q, room.botNames)),
      };
    };
    const combined = (q: string) => {
      const { cosine, pinyin } = parts(q);
      return cosine.map((c, i) => combinedScore(c, pinyin[i]!, { weight: WEIGHT }));
    };
    const fold = (qs: string[], f: (xs: number[]) => number): Scores => {
      if (!qs.length) return null;
      const each = qs.map(combined);
      return texts.map((_, i) => f(each.map((s) => s[i]!)));
    };
    const max = (xs: number[]) => Math.max(...xs);
    const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
    const q = b.queries;
    const whole = parts(b.m.query);
    const speechAlone = q.speechPart.length ? parts(q.speechPart[0]!) : null;
    const chatAlone = q.chatPart.length ? parts(q.chatPart[0]!) : null;
    return {
      id: b.m.id,
      room: b.m.room,
      split: set.split[b.m.id]!,
      relevant: new Set(labels[b.m.id]!.map((id) => index.get(id)!)),
      speechShare: b.speechShare,
      singShare: b.singShare,
      lines: b.lines,
      variants: {
        whole: whole.cosine.map((c, i) => combinedScore(c, whole.pinyin[i]!, { weight: WEIGHT })),
        cosine: whole.cosine,
        pinyin: whole.pinyin,
        noSing: q.noSing.length ? combined(q.noSing[0]!) : null,
        splitMax: fold([...q.speechPart, ...q.chatPart], max),
        splitMean: fold([...q.speechPart, ...q.chatPart], mean),
        perLineMax: fold(q.perLine, max),
        noSingSplitMax: fold([...q.noSingSpeechPart, ...q.noSingChatPart], max),
        noSingPerLineMax: fold(q.noSingPerLine, max),
        // Each part alone, for meaning vs sound on speech text and on chat text.
        speechCosine: speechAlone?.cosine ?? null,
        speechPinyin: speechAlone?.pinyin ?? null,
        speechCombined: q.speechPart.length ? combined(q.speechPart[0]!) : null,
        chatCosine: chatAlone?.cosine ?? null,
        chatPinyin: chatAlone?.pinyin ?? null,
        chatCombined: q.chatPart.length ? combined(q.chatPart[0]!) : null,
      },
    };
  });

  const VARIANTS: [string, string][] = [
    ['whole', 'current: whole window, one query'],
    ['noSing', 'sung lines left out'],
    ['splitMax', 'speech and chat as two queries, max'],
    ['splitMean', 'speech and chat as two queries, mean'],
    ['perLineMax', 'each line its own query, max'],
    ['noSingSplitMax', 'sung lines out, then two queries, max'],
    ['noSingPerLineMax', 'sung lines out, then each line its own query, max'],
  ];
  const tune = scored.filter((m) => m.split === 'tune');
  const test = scored.filter((m) => m.split === 'test');

  const buckets: [string, (m: Scored) => boolean][] = [
    ['all', () => true],
    [`mostly speech (≥ ${MOSTLY * 100}%)`, (m) => m.speechShare >= MOSTLY],
    ['mixed', (m) => m.speechShare < MOSTLY && m.speechShare > 1 - MOSTLY],
    [`mostly chat (≥ ${MOSTLY * 100}%)`, (m) => m.speechShare <= 1 - MOSTLY],
    ['chat-leaning (speech < 50%)', (m) => m.speechShare < 0.5],
    [`much singing (sung ≥ ${MUCH_SINGING * 100}%)`, (m) => m.singShare >= MUCH_SINGING],
    ['sung ≥ 20%', (m) => m.singShare >= 0.2],
    ['some singing (0 < sung < 40%)', (m) => m.singShare > 0 && m.singShare < MUCH_SINGING],
    ['no singing', (m) => m.singShare === 0],
  ];

  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  const results: Record<string, unknown> = {};
  out(`# Speech vs chat in recall`);
  out();
  out(
    `Model ${emb.model}. ${scored.length} moments (tune ${tune.length}, test ${test.length}); ${mismatched} did not rebuild to the stored query. Scoring: w = ${WEIGHT}, cutoff ${CUTOFF}, at most ${MAX}. Bootstrap: ${REPS} resamples of moments within rooms, 95%. "speech" counts the streamer's and a guest's speech and sung lines; a query's share is of its characters.`,
  );
  out();

  // Distribution of shares.
  const shares = scored.map((m) => m.speechShare).sort((a, b) => a - b);
  const sings = scored.map((m) => m.singShare).sort((a, b) => a - b);
  const qn = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
  out(
    `Speech share: p10 ${pct(qn(shares, 0.1))}, p25 ${pct(qn(shares, 0.25))}, median ${pct(qn(shares, 0.5))}, p75 ${pct(qn(shares, 0.75))}, p90 ${pct(qn(shares, 0.9))}; ${scored.filter((m) => m.speechShare === 0).length} moments with no speech, ${scored.filter((m) => m.speechShare === 1).length} with no chat. Sung share: ${scored.filter((m) => m.singShare > 0).length} moments have a sung line; p75 ${pct(qn(sings, 0.75))}, p90 ${pct(qn(sings, 0.9))}.`,
  );
  out();

  // 1 and 4: per bucket, the current query, and cosine / pinyin alone.
  const roomLetter = new Map([...rooms.keys()].map((r, i) => [r, String.fromCharCode(65 + i)]));
  out(`## 1. The current query per bucket (all ${scored.length} moments)`);
  out();
  out(
    `| bucket | moments | with a marked item | rooms (A–F) | hit@1 | hit@3 | MRR | room-adjusted MRR | P | R | F1 | none recalling |`,
  );
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  const perBucket: Record<string, unknown>[] = [];
  for (const [name, pick] of buckets) {
    const ms = scored.filter(pick);
    const r = rankMetrics(ms, 'whole');
    const u = rule(ms, 'whole', CUTOFF);
    const adj = roomAdjustedMrr(ms, scored, 'whole');
    const iv = bootstrap(ms, (s) => ({
      ...rankMetrics(s, 'whole'),
      ...rule(s, 'whole', CUTOFF),
      adj: roomAdjustedMrr(s, scored, 'whole'),
    }));
    const byRoom = [...rooms.keys()].map((room) => ms.filter((m) => m.room === room).length);
    perBucket.push({ name, moments: ms.length, rank: r, rule: u, adj, iv, byRoom });
    out(
      `| ${name} | ${ms.length} | ${r.n} (${pct(r.n / (ms.length || 1))}) | ${byRoom.join('/')} | ${ci(r.hit1, iv.hit1, pct)} | ${ci(r.hit3, iv.hit3, pct)} | ${ci(r.mrr, iv.mrr)} | ${ci(adj, iv.adj)} | ${ci(u.precision, iv.precision)} | ${ci(u.recall, iv.recall)} | ${ci(u.f1, iv.f1)} | ${ci(u.noneRecalls, iv.noneRecalls, pct)} |`,
    );
  }
  results.perBucket = perBucket;
  out();
  out(
    `Room-adjusted MRR: each positive moment's reciprocal rank minus its room's mean over all moments, averaged; 0 is "as good as its room's average", so a bucket isn't worse only because its moments come from rooms with big pools. Rooms ${[...roomLetter.values()].join(', ')} have pools of ${set.rooms.map((r) => r.pool.length).join(', ')} items.`,
  );
  out();
  for (const half of ['test'] as const) {
    const hs = half === 'test' ? test : tune;
    out(`Test half only (${hs.length} moments):`);
    out();
    out(`| bucket | moments | with a marked item | hit@1 | MRR | F1 | none recalling |`);
    out(`| --- | --- | --- | --- | --- | --- | --- |`);
    for (const [name, pick] of buckets) {
      const ms = hs.filter(pick);
      const r = rankMetrics(ms, 'whole');
      const u = rule(ms, 'whole', CUTOFF);
      const iv = bootstrap(ms, (s) => ({
        ...rankMetrics(s, 'whole'),
        ...rule(s, 'whole', CUTOFF),
      }));
      out(
        `| ${name} | ${ms.length} | ${r.n} | ${ci(r.hit1, iv.hit1, pct)} | ${ci(r.mrr, iv.mrr)} | ${ci(u.f1, iv.f1)} | ${ci(u.noneRecalls, iv.noneRecalls, pct)} |`,
      );
    }
    out();
  }

  out(`## 4. Meaning vs sound per bucket (all moments with a marked item)`);
  out();
  out(
    `| bucket | n | cosine hit@1 | MRR | pinyin hit@1 | MRR | combined hit@1 | MRR | pinyin − cosine MRR |`,
  );
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  const meaning: Record<string, unknown>[] = [];
  for (const [name, pick] of buckets) {
    const ms = scored.filter(pick);
    const [c, p, w] = (['cosine', 'pinyin', 'whole'] as const).map((v) => rankMetrics(ms, v));
    const iv = bootstrap(ms, (s) => ({
      d: rankMetrics(s, 'pinyin').mrr - rankMetrics(s, 'cosine').mrr,
      c: rankMetrics(s, 'cosine').mrr,
      p: rankMetrics(s, 'pinyin').mrr,
    }));
    meaning.push({ name, cosine: c, pinyin: p, combined: w, iv });
    out(
      `| ${name} | ${c!.n} | ${pct(c!.hit1)} | ${ci(c!.mrr, iv.c)} | ${pct(p!.hit1)} | ${ci(p!.mrr, iv.p)} | ${pct(w!.hit1)} | ${f3(w!.mrr)} | ${ci(p!.mrr - c!.mrr, iv.d)} |`,
    );
  }
  results.meaning = meaning;
  out();
  out(
    `Each part as its own query (moments with a marked item and both speech and chat; the marked item is the same, only the query differs):`,
  );
  out();
  out(
    `| query | half | n | cosine hit@1 | MRR | pinyin hit@1 | MRR | combined hit@1 | MRR | pinyin − cosine MRR |`,
  );
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  const both = scored.filter((m) => m.variants.speechCosine && m.variants.chatCosine);
  for (const [part, label] of [
    ['speech', 'speech lines only'],
    ['chat', 'chat lines only'],
  ] as const)
    for (const [half, ms] of [
      ['all', both],
      ['test', both.filter((m) => m.split === 'test')],
    ] as const) {
      const [c, p, w] = (['Cosine', 'Pinyin', 'Combined'] as const).map((k) =>
        rankMetrics(ms, `${part}${k}`),
      );
      const iv = bootstrap(ms, (s) => ({
        d: rankMetrics(s, `${part}Pinyin`).mrr - rankMetrics(s, `${part}Cosine`).mrr,
      }));
      out(
        `| ${label} | ${half} | ${c!.n} | ${pct(c!.hit1)} | ${f3(c!.mrr)} | ${pct(p!.hit1)} | ${f3(p!.mrr)} | ${pct(w!.hit1)} | ${f3(w!.mrr)} | ${ci(p!.mrr - c!.mrr, iv.d)} |`,
      );
    }
  out();
  out(`Per bucket, test half only:`);
  out();
  out(`| bucket | n | cosine hit@1 | MRR | pinyin hit@1 | MRR | combined hit@1 | MRR |`);
  out(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const [name, pick] of buckets) {
    const ms = test.filter(pick);
    const [c, p, w] = (['cosine', 'pinyin', 'whole'] as const).map((v) => rankMetrics(ms, v));
    out(
      `| ${name} | ${c!.n} | ${pct(c!.hit1)} | ${f3(c!.mrr)} | ${pct(p!.hit1)} | ${f3(p!.mrr)} | ${pct(w!.hit1)} | ${f3(w!.mrr)} |`,
    );
  }
  out();

  // 2 and 3: the variants, ranking (paired against the current query) and the rule.
  const variantRank = (ms: Scored[], label: string) => {
    out(`| variant | n | hit@1 | hit@3 | MRR | Δ hit@1 vs current | Δ MRR vs current |`);
    out(`| --- | --- | --- | --- | --- | --- | --- |`);
    const rows: Record<string, unknown>[] = [];
    for (const [v, name] of VARIANTS) {
      const r = rankMetrics(ms, v);
      const base = rankMetrics(ms, 'whole');
      const iv = bootstrap(ms, (s) => {
        const a = rankMetrics(s, v);
        const b = rankMetrics(s, 'whole');
        return { hit1: a.hit1, hit3: a.hit3, mrr: a.mrr, dh: a.hit1 - b.hit1, dm: a.mrr - b.mrr };
      });
      rows.push({ v, rank: r, iv });
      out(
        `| ${name} | ${r.n} | ${ci(r.hit1, iv.hit1, pct)} | ${ci(r.hit3, iv.hit3, pct)} | ${ci(r.mrr, iv.mrr)} | ${v === 'whole' ? '' : ci(r.hit1 - base.hit1, iv.dh, pct)} | ${v === 'whole' ? '' : ci(r.mrr - base.mrr, iv.dm)} |`,
      );
    }
    out();
    results[`rank ${label}`] = rows;
  };
  out(`## 2–3. Other queries: ranking (moments with a marked item; Δ paired, same resamples)`);
  out();
  out(`All ${scored.length} moments:`);
  out();
  variantRank(scored, 'all');
  out(`Test half:`);
  out();
  variantRank(test, 'test');
  out(`Per bucket (all moments), MRR:`);
  out();
  out(`| bucket | n | ${VARIANTS.map(([, n]) => n).join(' | ')} |`);
  out(`| --- | --- | ${VARIANTS.map(() => '---').join(' | ')} |`);
  for (const [name, pick] of buckets) {
    const ms = scored.filter(pick);
    const cells = VARIANTS.map(([v]) => {
      const r = rankMetrics(ms, v);
      if (v === 'whole') return f3(r.mrr);
      const iv = bootstrap(ms, (s) => ({ d: rankMetrics(s, v).mrr - rankMetrics(s, 'whole').mrr }));
      return `${f3(r.mrr)} (Δ ${ci(r.mrr - rankMetrics(ms, 'whole').mrr, iv.d)})`;
    });
    out(`| ${name} | ${rankMetrics(ms, 'whole').n} | ${cells.join(' | ')} |`);
  }
  out();
  out(
    `"much singing" without its sung lines: ${scored.filter((m) => m.singShare >= MUCH_SINGING && !m.variants.noSing).length} of ${scored.filter((m) => m.singShare >= MUCH_SINGING).length} moments have no query left (all sung, no chat), counted as a miss and as recalling nothing.`,
  );
  out();

  // 5: the rule, each variant's cutoff tuned on tune, checked on test.
  out(
    `## 5. The rule (≤ ${MAX} items ≥ cutoff): cutoff tuned on tune per variant, checked on test`,
  );
  out();
  out(
    `| variant | tune best cutoff | tune F1 | test P | test R | test F1 | test none recalling | test per moment | test F1 at ${CUTOFF} |`,
  );
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  const ruleRows: Record<string, unknown>[] = [];
  for (const [v, name] of VARIANTS) {
    const sweep = CUTOFFS.map((cutoff) => ({ cutoff, ...rule(tune, v, cutoff) }));
    const best = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));
    const t = rule(test, v, best.cutoff);
    const iv = bootstrap(test, (s) => {
      const a = rule(s, v, best.cutoff);
      const b = rule(s, 'whole', CUTOFF);
      return { ...a, df1: a.f1 - b.f1, dnone: a.noneRecalls - b.noneRecalls };
    });
    const at = rule(test, v, CUTOFF);
    ruleRows.push({ v, best, test: t, iv, at, sweep });
    out(
      `| ${name} | ${best.cutoff} | ${f3(best.f1)} | ${ci(t.precision, iv.precision)} | ${ci(t.recall, iv.recall)} | ${ci(t.f1, iv.f1)} | ${ci(t.noneRecalls, iv.noneRecalls, pct)} | ${ci(t.perMoment, iv.perMoment, (x) => x.toFixed(2))} | ${f3(at.f1)} |`,
    );
  }
  out();
  out(`Against the bot's setting (current query, cutoff ${CUTOFF}) on test, paired:`);
  out();
  for (const row of ruleRows) {
    const r = row as {
      v: string;
      best: { cutoff: number };
      test: { f1: number; noneRecalls: number };
      iv: Record<string, [number, number]>;
    };
    if (r.v === 'whole') continue;
    const base = rule(test, 'whole', CUTOFF);
    out(
      `- ${VARIANTS.find(([v]) => v === r.v)![1]} at ${r.best.cutoff}: Δ F1 ${ci(r.test.f1 - base.f1, r.iv.df1)}, Δ none recalling ${ci(r.test.noneRecalls - base.noneRecalls, r.iv.dnone, pct)}`,
    );
  }
  out();
  results.rule = ruleRows.map((r) => ({ ...r, sweep: undefined }));
  results.sweeps = Object.fromEntries(ruleRows.map((r) => [r.v as string, r.sweep]));

  // Sweep table for each variant on tune (every other cutoff).
  out(`Tune sweep, F1 / none recalling:`);
  out();
  out(`| cutoff | ${VARIANTS.map(([, n]) => n).join(' | ')} |`);
  out(`| --- | ${VARIANTS.map(() => '---').join(' | ')} |`);
  for (const cutoff of CUTOFFS.filter((c) => Math.round(c * 100) % 2 === 0))
    out(
      `| ${cutoff} | ${VARIANTS.map(([v]) => {
        const r = rule(tune, v, cutoff);
        return `${f3(r.f1)} / ${pct(r.noneRecalls)}`;
      }).join(' | ')} |`,
    );
  out();

  writeFileSync(join(DIR, 'speech-results.json'), JSON.stringify(results, null, 1));
  writeFileSync(join(DIR, 'speech-report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
