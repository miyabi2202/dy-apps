/**
 * Scores the real-room recall test with the bot's own functions (recall.ts) and its embedding
 * client: per moment, each item of its room's pool scored as MemoryRecall does, then rank metrics
 * per ranker and, for the bot's rule (≤3 items scoring ≥ cutoff), a cutoff × weight sweep on
 * "tune", the best F1 setting checked on "test" with bootstrap intervals, and the judge's agreement
 * with itself.
 *
 * From chat-bot/, with the embedding service running: npx tsx embedding-eval/score-recall.ts
 * Reads data/embedding-eval/real/{set,labels,rejudge}.json, writes vectors.json (cache),
 * results.json and report.md there.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { embeddingClient } from '../src/adapters/embedding/embedding-client';
import {
  combinedScore,
  pinyinScores,
  recalled,
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
const DIR = join(values.data, 'embedding-eval', 'real');
const WEIGHTS = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
const CUTOFFS = Array.from({ length: 36 }, (_, i) => Math.round((0.3 + i * 0.01) * 100) / 100);
const MAX = 3;

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

interface Scored {
  id: string;
  room: string;
  split: 'tune' | 'test';
  relevant: Set<number>;
  cosine: number[];
  pinyin: number[];
}

// ---- embedding, cached per model and kind ----

async function vectors(texts: string[], kind: 'query' | 'document') {
  const client = embeddingClient({ port: Number(values.port), timeoutMs: 120_000 });
  const { model } = await client.info();
  const path = join(DIR, 'vectors.json');
  const cache = (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) as Record<
    string,
    number[]
  >;
  const key = (t: string) => `${model}\u0000${kind}\u0000${t}`;
  const missing = [...new Set(texts.filter((t) => !cache[key(t)]))];
  for (let i = 0; i < missing.length; i += 64) {
    const chunk = missing.slice(i, i + 64);
    const made = await client.embed(chunk, kind);
    chunk.forEach((t, j) => (cache[key(t)] = made[j]!));
  }
  if (missing.length) writeFileSync(path, JSON.stringify(cache));
  return { model, get: (t: string) => cache[key(t)]! };
}

// ---- metrics ----

const scoresFor = (m: Scored, w: number) =>
  m.cosine.map((c, i) => combinedScore(c, m.pinyin[i]!, { weight: w }));

function rankMetrics(ms: Scored[], score: (m: Scored) => number[]) {
  const pos = ms.filter((m) => m.relevant.size);
  let h1 = 0;
  let h3 = 0;
  let rr = 0;
  for (const m of pos) {
    const s = score(m);
    const order = s.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const rank = order.findIndex(([, i]) => m.relevant.has(i));
    if (rank === 0) h1++;
    if (rank < 3) h3++;
    rr += 1 / (rank + 1);
  }
  const n = pos.length || 1;
  return { n: pos.length, hit1: h1 / n, hit3: h3 / n, mrr: rr / n };
}

interface RuleCounts {
  recalled: number;
  hits: number;
  relevant: number;
  noneMoments: number;
  noneRecalling: number;
  moments: number;
}

function ruleCounts(ms: Scored[], w: number, cutoff: number): RuleCounts {
  const c: RuleCounts = {
    recalled: 0,
    hits: 0,
    relevant: 0,
    noneMoments: 0,
    noneRecalling: 0,
    moments: 0,
  };
  for (const m of ms) {
    const got = recalled(scoresFor(m, w), { cutoff, max: MAX });
    c.moments++;
    c.recalled += got.length;
    c.hits += got.filter((i) => m.relevant.has(i)).length;
    c.relevant += m.relevant.size;
    if (!m.relevant.size) {
      c.noneMoments++;
      if (got.length) c.noneRecalling++;
    }
  }
  return c;
}

function ruleMetrics(c: RuleCounts) {
  const precision = c.recalled ? c.hits / c.recalled : 1;
  const recall = c.relevant ? c.hits / c.relevant : 1;
  const f = (beta: number) =>
    precision + recall
      ? ((1 + beta * beta) * precision * recall) / (beta * beta * precision + recall)
      : 0;
  return {
    precision,
    recall,
    f1: f(1),
    f2: f(2),
    noneRecalls: c.noneMoments ? c.noneRecalling / c.noneMoments : 0,
    perMoment: c.recalled / (c.moments || 1),
  };
}

const rule = (ms: Scored[], w: number, cutoff: number) => ruleMetrics(ruleCounts(ms, w, cutoff));

/** Each metric's 95% bootstrap interval over moments (resampled within each room). */
function bootstrap<T extends Record<string, number>>(
  ms: Scored[],
  f: (ms: Scored[]) => T,
  reps: number,
) {
  const random = rng(7);
  const byRoom = new Map<string, Scored[]>();
  for (const m of ms) byRoom.set(m.room, [...(byRoom.get(m.room) ?? []), m]);
  const samples: T[] = [];
  for (let r = 0; r < reps; r++) {
    const sample: Scored[] = [];
    for (const group of byRoom.values())
      for (let i = 0; i < group.length; i++)
        sample.push(group[Math.floor(random() * group.length)]!);
    samples.push(f(sample));
  }
  const out: Record<string, [number, number]> = {};
  for (const key of Object.keys(samples[0]!)) {
    const v = samples.map((s) => s[key]!).sort((a, b) => a - b);
    out[key] = [v[Math.floor(reps * 0.025)]!, v[Math.floor(reps * 0.975)]!];
  }
  return out as Record<keyof T, [number, number]>;
}

// ---- judge agreement ----

function agreement(first: Record<string, string[]>, second: Record<string, string[]>) {
  const ids = Object.keys(second).filter((id) => id in first);
  let same = 0;
  let jac = 0;
  let a11 = 0,
    a10 = 0,
    a01 = 0,
    a00 = 0;
  let inter = 0,
    n1 = 0,
    n2 = 0;
  for (const id of ids) {
    const a = new Set(first[id]);
    const b = new Set(second[id]);
    const i = [...a].filter((x) => b.has(x)).length;
    const u = a.size + b.size - i;
    if (u === 0 || (i === a.size && i === b.size)) same++;
    jac += u ? i / u : 1;
    inter += i;
    n1 += a.size;
    n2 += b.size;
    if (a.size && b.size) a11++;
    else if (a.size) a10++;
    else if (b.size) a01++;
    else a00++;
  }
  const n = ids.length || 1;
  const po = (a11 + a00) / n;
  const pe = ((a11 + a10) * (a11 + a01) + (a00 + a01) * (a00 + a10)) / (n * n);
  return {
    moments: ids.length,
    identical: same / n,
    meanJaccard: jac / n,
    noneVsSomeAgreement: po,
    noneVsSomeKappa: pe < 1 ? (po - pe) / (1 - pe) : 1,
    /** The second judgment scored against the first: the F1 a perfect ranker could expect. */
    itemPrecision: n2 ? inter / n2 : 1,
    itemRecall: n1 ? inter / n1 : 1,
    itemF1: n1 + n2 ? (2 * inter) / (n1 + n2) : 1,
    table: { both: a11, firstOnly: a10, secondOnly: a01, neither: a00 },
  };
}

// ---- main ----

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f3 = (x: number) => x.toFixed(3);
const ci = (x: number, [lo, hi]: [number, number], f = f3) => `${f(x)} [${f(lo)}–${f(hi)}]`;

async function main() {
  const set = JSON.parse(readFileSync(join(DIR, 'set.json'), 'utf8')) as {
    rooms: RoomSet[];
    moments: Moment[];
    split: Record<string, 'tune' | 'test'>;
  };
  const { labels } = JSON.parse(readFileSync(join(DIR, 'labels.json'), 'utf8')) as {
    labels: Record<string, string[]>;
  };
  const rejudge = existsSync(join(DIR, 'rejudge.json'))
    ? ((JSON.parse(readFileSync(join(DIR, 'rejudge.json'), 'utf8')) as { labels: unknown })
        .labels as Record<string, string[]>)
    : {};
  const moments = set.moments.filter((m) => m.id in labels);
  const rooms = new Map(set.rooms.map((r) => [r.room, r]));

  const docs = await vectors(
    [...new Set(set.rooms.flatMap((r) => r.pool.map((p) => p.text)))],
    'document',
  );
  const queries = await vectors(
    moments.map((m) => m.query),
    'query',
  );

  const scored: Scored[] = moments.map((m) => {
    const room = rooms.get(m.room)!;
    const texts = room.pool.map((p) => p.text);
    const q = queries.get(m.query);
    const index = new Map(room.pool.map((p, i) => [p.id, i]));
    return {
      id: m.id,
      room: m.room,
      split: set.split[m.id]!,
      relevant: new Set(labels[m.id]!.map((id) => index.get(id)!)),
      cosine: texts.map((t) => similarity(q, docs.get(t))),
      pinyin: pinyinScores(texts, withoutNames(m.query, room.botNames)),
    };
  });
  const tune = scored.filter((m) => m.split === 'tune');
  const test = scored.filter((m) => m.split === 'test');

  const rankers: [string, (m: Scored) => number[]][] = [
    ['cosine (w = 0)', (m) => m.cosine],
    ['pinyin only', (m) => m.pinyin],
    ...WEIGHTS.filter((w) => w > 0).map(
      (w) =>
        [`combined w = ${w}`, (m: Scored) => scoresFor(m, w)] as [string, (m: Scored) => number[]],
    ),
  ];
  const ranks = rankers.map(([name, f]) => ({
    name,
    tune: rankMetrics(tune, f),
    test: rankMetrics(test, f),
  }));

  const sweep = WEIGHTS.flatMap((w) =>
    CUTOFFS.map((cutoff) => ({ w, cutoff, ...rule(tune, w, cutoff) })),
  );
  const best = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));
  const bestF2 = sweep.reduce((a, b) => (b.f2 > a.f2 ? b : a));
  const flat = sweep.filter((s) => s.f1 >= best.f1 - 0.02);
  const current = { w: 0.1, cutoff: 0.45 };

  const reps = Number(values.boot);
  const testAt = (s: { w: number; cutoff: number }) => ({
    ...s,
    value: rule(test, s.w, s.cutoff),
    interval: bootstrap(test, (ms) => rule(ms, s.w, s.cutoff), reps),
  });
  const chosen = testAt(best);
  const chosenF2 = testAt(bestF2);
  const currentTest = testAt(current);
  const testRank = rankMetrics(test, (m) => scoresFor(m, best.w));
  const testRankCI = bootstrap(test, (ms) => rankMetrics(ms, (m) => scoresFor(m, best.w)), reps);
  const testSweep = WEIGHTS.flatMap((w) =>
    CUTOFFS.map((cutoff) => ({ w, cutoff, ...rule(test, w, cutoff) })),
  );
  const testBest = testSweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));

  // Per room, on all moments: the chosen setting, and each room's own best cutoff at its weight.
  const perRoom = [...rooms.keys()].map((room, i) => {
    const ms = scored.filter((m) => m.room === room);
    const own = CUTOFFS.map((cutoff) => ({ cutoff, ...rule(ms, best.w, cutoff) })).reduce((a, b) =>
      b.f1 > a.f1 ? b : a,
    );
    return {
      room: `room ${String.fromCharCode(65 + i)}`,
      pool: rooms.get(room)!.pool.length,
      moments: ms.length,
      withRelevant: ms.filter((m) => m.relevant.size).length,
      chosen: rule(ms, best.w, best.cutoff),
      rank: rankMetrics(ms, (m) => scoresFor(m, best.w)),
      ownBest: own,
    };
  });

  // Score distributions: the top-1 combined score on moments with and without a relevant item.
  const top1 = (ms: Scored[]) =>
    ms.map((m) => Math.max(...scoresFor(m, best.w))).sort((a, b) => a - b);
  const q = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
  const pos = top1(scored.filter((m) => m.relevant.size));
  const neg = top1(scored.filter((m) => !m.relevant.size));
  const relScores = scored
    .flatMap((m) => [...m.relevant].map((i) => scoresFor(m, best.w)[i]!))
    .sort((a, b) => a - b);

  const agree = agreement(labels, rejudge);
  const callsOf = (file: string) =>
    existsSync(join(DIR, file))
      ? (JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { calls: { costUsd: number }[] })
          .calls
      : [];
  const judgeCalls = [...callsOf('labels.json'), ...callsOf('rejudge.json')];

  const stats = {
    model: docs.model,
    rooms: set.rooms.length,
    poolSizes: set.rooms.map((r) => r.pool.length),
    moments: scored.length,
    tune: tune.length,
    test: test.length,
    withRelevant: scored.filter((m) => m.relevant.size).length,
    relevantPerPositive:
      scored.reduce((a, m) => a + m.relevant.size, 0) /
      (scored.filter((m) => m.relevant.size).length || 1),
    judgeCalls: judgeCalls.length,
    judgeCostUsd: judgeCalls.reduce((a, c) => a + c.costUsd, 0),
  };

  writeFileSync(
    join(DIR, 'results.json'),
    JSON.stringify(
      {
        stats,
        ranks,
        best,
        bestF2,
        flat,
        chosen,
        chosenF2,
        currentTest,
        testRank,
        testRankCI,
        testBest,
        perRoom,
        agree,
        sweep,
      },
      null,
      1,
    ),
  );

  const lines: string[] = [];
  const out = (s = '') => lines.push(s);
  out(`# Real-room recall calibration`);
  out();
  out(
    `Model ${stats.model}. ${stats.rooms} rooms, pools ${stats.poolSizes.join(', ')} items; ${stats.moments} moments (tune ${stats.tune}, test ${stats.test}); ${stats.withRelevant} (${pct(stats.withRelevant / stats.moments)}) with a relevant item, ${stats.relevantPerPositive.toFixed(2)} items each. Judge: ${stats.judgeCalls} calls, $${stats.judgeCostUsd.toFixed(2)}.`,
  );
  out();
  out(`## Judge agreement (${agree.moments} moments judged twice)`);
  out();
  out(
    `identical ${pct(agree.identical)}, mean Jaccard ${f3(agree.meanJaccard)}, none-vs-some agreement ${pct(agree.noneVsSomeAgreement)} (κ ${f3(agree.noneVsSomeKappa)}), second vs first: P ${f3(agree.itemPrecision)} R ${f3(agree.itemRecall)} F1 ${f3(agree.itemF1)}; ${JSON.stringify(agree.table)}`,
  );
  out();
  out(`## Rankers (moments with a relevant item)`);
  out();
  out(`| ranker | tune n | hit@1 | hit@3 | MRR | test n | hit@1 | hit@3 | MRR |`);
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const r of ranks)
    out(
      `| ${r.name} | ${r.tune.n} | ${pct(r.tune.hit1)} | ${pct(r.tune.hit3)} | ${f3(r.tune.mrr)} | ${r.test.n} | ${pct(r.test.hit1)} | ${pct(r.test.hit3)} | ${f3(r.test.mrr)} |`,
    );
  out();
  out(`## The rule on tune: best F1 per weight`);
  out();
  out(`| w | cutoff | P | R | F1 | F2 | none recalls | per moment | at 0.45: P / R / F1 |`);
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const w of WEIGHTS) {
    const rows = sweep.filter((s) => s.w === w);
    const b = rows.reduce((a, c) => (c.f1 > a.f1 ? c : a));
    const at = rows.find((s) => s.cutoff === 0.45)!;
    out(
      `| ${w} | ${b.cutoff} | ${f3(b.precision)} | ${f3(b.recall)} | ${f3(b.f1)} | ${f3(b.f2)} | ${pct(b.noneRecalls)} | ${b.perMoment.toFixed(2)} | ${f3(at.precision)} / ${f3(at.recall)} / ${f3(at.f1)} |`,
    );
  }
  out();
  out(
    `Best F1 on tune: w = ${best.w}, cutoff = ${best.cutoff} (F1 ${f3(best.f1)}). Best F2: w = ${bestF2.w}, cutoff = ${bestF2.cutoff} (F2 ${f3(bestF2.f2)}, P ${f3(bestF2.precision)}, R ${f3(bestF2.recall)}).`,
  );
  out();
  const flatW = [...new Set(flat.map((s) => s.w))];
  out(
    `Within 0.02 of the best F1 (${flat.length} settings): ${flatW
      .map((w) => {
        const cs = flat.filter((s) => s.w === w).map((s) => s.cutoff);
        return `w ${w}: ${Math.min(...cs)}–${Math.max(...cs)}`;
      })
      .join('; ')}`,
  );
  out();
  out(`## Cutoff sweep on tune at w = ${best.w}`);
  out();
  out(`| cutoff | P | R | F1 | F2 | none recalls | per moment |`);
  out(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const s of sweep.filter((s) => s.w === best.w && Math.round(s.cutoff * 100) % 2 === 0))
    out(
      `| ${s.cutoff} | ${f3(s.precision)} | ${f3(s.recall)} | ${f3(s.f1)} | ${f3(s.f2)} | ${pct(s.noneRecalls)} | ${s.perMoment.toFixed(2)} |`,
    );
  out();
  out(`## Test (bootstrap 95%, ${reps} resamples within rooms)`);
  out();
  for (const [name, t] of [
    ['chosen (best F1 on tune)', chosen],
    ['best F2 on tune', chosenF2],
    ['current (0.1, 0.45)', currentTest],
  ] as const) {
    out(
      `- ${name}, w = ${t.w}, cutoff = ${t.cutoff}: P ${ci(t.value.precision, t.interval.precision)}, R ${ci(t.value.recall, t.interval.recall)}, F1 ${ci(t.value.f1, t.interval.f1)}, F2 ${ci(t.value.f2, t.interval.f2)}, none recalls ${ci(t.value.noneRecalls, t.interval.noneRecalls, pct)}, per moment ${ci(t.value.perMoment, t.interval.perMoment, (x) => x.toFixed(2))}`,
    );
  }
  out(
    `- ranking at w = ${best.w}: hit@1 ${ci(testRank.hit1, testRankCI.hit1, pct)}, hit@3 ${ci(testRank.hit3, testRankCI.hit3, pct)}, MRR ${ci(testRank.mrr, testRankCI.mrr)}`,
  );
  out(
    `- the best setting on test itself (for reference, not chosen on it): w = ${testBest.w}, cutoff = ${testBest.cutoff}, F1 ${f3(testBest.f1)}`,
  );
  out();
  out(`## Scores at w = ${best.w}`);
  out();
  out(
    `top-1 score, moments with a relevant item: p10 ${f3(q(pos, 0.1))} median ${f3(q(pos, 0.5))} p90 ${f3(q(pos, 0.9))}; without: p10 ${f3(q(neg, 0.1))} median ${f3(q(neg, 0.5))} p90 ${f3(q(neg, 0.9))}. Relevant items' scores: p10 ${f3(q(relScores, 0.1))} median ${f3(q(relScores, 0.5))} p90 ${f3(q(relScores, 0.9))}.`,
  );
  out();
  out(`## Per room (all moments, w = ${best.w}, cutoff = ${best.cutoff})`);
  out();
  out(
    `| room | pool | moments | with relevant | P | R | F1 | none recalls | hit@1 | MRR | own best cutoff (F1) |`,
  );
  out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const r of perRoom)
    out(
      `| ${r.room} | ${r.pool} | ${r.moments} | ${r.withRelevant} | ${f3(r.chosen.precision)} | ${f3(r.chosen.recall)} | ${f3(r.chosen.f1)} | ${pct(r.chosen.noneRecalls)} | ${pct(r.rank.hit1)} | ${f3(r.rank.mrr)} | ${r.ownBest.cutoff} (${f3(r.ownBest.f1)}) |`,
    );
  // Which items the chosen setting recalls most, and how often the judge agreed (local only: quotes memory).
  out();
  out(`## Most recalled items (all moments, w = ${best.w}, cutoff = ${best.cutoff})`);
  out();
  const counts = new Map<string, { recalled: number; hits: number; judged: number }>();
  for (const m of scored) {
    const room = rooms.get(m.room)!;
    const got = recalled(scoresFor(m, best.w), { cutoff: best.cutoff, max: MAX });
    room.pool.forEach((p, i) => {
      const c = counts.get(p.id) ?? { recalled: 0, hits: 0, judged: 0 };
      if (got.includes(i)) c.recalled++;
      if (got.includes(i) && m.relevant.has(i)) c.hits++;
      if (m.relevant.has(i)) c.judged++;
      counts.set(p.id, c);
    });
  }
  const text = new Map(set.rooms.flatMap((r) => r.pool.map((p) => [p.id, p.text] as const)));
  const totalRecalled = [...counts.values()].reduce((a, c) => a + c.recalled, 0);
  out(`| recalled | of which judged relevant | judged relevant overall | item |`);
  out(`| --- | --- | --- | --- |`);
  for (const [id, c] of [...counts].sort((a, b) => b[1].recalled - a[1].recalled).slice(0, 15))
    out(
      `| ${c.recalled} | ${c.hits} | ${c.judged} | ${text.get(id)!.slice(0, 60).replace(/[\n|]/g, ' ')} |`,
    );
  out();
  out(`(${totalRecalled} recalls in all.)`);
  writeFileSync(join(DIR, 'report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
