/**
 * Labels the real-room moments with Claude as the judge (`claude -p`, no tools): per call, one
 * room's whole pool, numbered, and a batch of that room's moments; per moment, the 0–3 items worth
 * keeping in mind right now. Then a random 10% of moments again, in fresh calls, to measure how
 * much the judge agrees with itself.
 *
 * From chat-bot/: npx tsx embedding-eval/real-judge.ts [--batch 10] [--jobs 4] [--rejudge 0.1]
 * Reads and writes data/embedding-eval/real/ (set.json → labels.json, rejudge.json). Resumable:
 * a batch already answered is not asked again.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Moment, RoomSet } from './real-build-set';

const { values } = parseArgs({
  options: {
    batch: { type: 'string', default: '10' },
    jobs: { type: 'string', default: '4' },
    rejudge: { type: 'string', default: '0.1' },
    seed: { type: 'string', default: '2' },
    data: { type: 'string', default: 'data' },
    /** Print the first batch's prompt and stop. */
    dry: { type: 'boolean', default: false },
  },
});
const DIR = join(values.data, 'embedding-eval', 'real');
const PROMPT = readFileSync(join(import.meta.dirname, 'real-judge-prompt.md'), 'utf8');
const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          relevant: { type: 'array', items: { type: 'integer' }, maxItems: 3 },
        },
        required: ['id', 'relevant'],
      },
    },
  },
  required: ['moments'],
});

interface Labels {
  /** moment id → the pool item ids the judge marked relevant, most useful first. */
  labels: Record<string, string[]>;
  calls: { batch: string[]; costUsd: number; ms: number }[];
}

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

/** The moment as the query saw it: its speech lines, then its chat lines (those the query kept). */
function showMoment(m: Moment, n: number): string {
  const norm = (lines: string[]) => lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const speech = norm(m.speech);
  const all = [...speech, ...norm(m.chat)];
  const kept = m.query.split('\n').length;
  const from = all.length - kept;
  const shown = all.slice(from);
  const speechShown = shown.slice(0, Math.max(0, speech.length - from));
  const chatShown = shown.slice(speechShown.length);
  return [
    `### moment ${n}`,
    '',
    '主播说的（语音转写）：',
    ...(speechShown.length ? speechShown.map((l) => `> ${l}`) : ['> （无）']),
    '',
    '弹幕：',
    ...(chatShown.length ? chatShown.map((l) => `- ${l}`) : ['- （无）']),
  ].join('\n');
}

function ask(prompt: string): Promise<{ out: { id: string; relevant: number[] }[]; cost: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--output-format',
        'json',
        '--tools',
        '',
        '--no-session-persistence',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--system-prompt',
        'You are a careful, strict annotator for a retrieval test set. Answer only with the requested structured output.',
        '--json-schema',
        SCHEMA,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      try {
        const res = JSON.parse(stdout) as {
          is_error?: boolean;
          result?: string;
          total_cost_usd?: number;
          structured_output?: { moments: { id: string; relevant: number[] }[] };
        };
        if (res.is_error || !res.structured_output) throw new Error(res.result ?? 'no output');
        resolve({ out: res.structured_output.moments, cost: res.total_cost_usd ?? 0 });
      } catch (err) {
        reject(new Error(`claude exited ${code}: ${String(err)} ${stderr.slice(0, 500)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

async function judge(rooms: RoomSet[], batches: Moment[][], file: string): Promise<Labels> {
  const path = join(DIR, file);
  const state = (
    existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { labels: {}, calls: [] }
  ) as Labels;
  const todo = batches.filter((b) => b.some((m) => !(m.id in state.labels)));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const batch = todo[next++]!;
      const room = rooms.find((r) => r.room === batch[0]!.room)!;
      const pool = room.pool
        .map((p, i) => `${i + 1}. ${p.text.replace(/\n+/g, ' ／ ')}`)
        .join('\n');
      const moments = batch.map((m, i) => showMoment(m, i + 1)).join('\n\n');
      const ids = batch.map((_, i) => `moment ${i + 1}`);
      const prompt = PROMPT.replace('{{pool}}', pool)
        .replace('{{moments}}', moments)
        .concat(`\nThe ids are: ${ids.map((id) => `"${id}"`).join(', ')}.\n`);
      if (values.dry) {
        console.log(prompt);
        process.exit(0);
      }
      const started = Date.now();
      for (let tries = 0; ; tries++) {
        try {
          const { out, cost } = await ask(prompt);
          batch.forEach((m, i) => {
            const answer = out.find((o) => o.id.replace(/\D/g, '') === String(i + 1));
            if (!answer) throw new Error(`no answer for ${ids[i]}`);
            state.labels[m.id] = [...new Set(answer.relevant)]
              .filter((n) => n >= 1 && n <= room.pool.length)
              .slice(0, 3)
              .map((n) => room.pool[n - 1]!.id);
          });
          state.calls.push({
            batch: batch.map((m) => m.id),
            costUsd: cost,
            ms: Date.now() - started,
          });
          writeFileSync(path, JSON.stringify(state, null, 1));
          console.log(file, `${state.calls.length}`, room.room, `$${cost.toFixed(3)}`);
          break;
        } catch (err) {
          console.warn('retry', String(err).slice(0, 300));
          if (tries >= 2) throw err;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Number(values.jobs) }, worker));
  return state;
}

function batchesOf(moments: Moment[], size: number): Moment[][] {
  const out: Moment[][] = [];
  for (const room of [...new Set(moments.map((m) => m.room))]) {
    const ms = moments.filter((m) => m.room === room);
    const n = Math.ceil(ms.length / size);
    // Even batches: 53 moments go as 10,11,… rather than 10×5 + 3.
    for (let i = 0; i < n; i++)
      out.push(ms.slice(Math.round((i * ms.length) / n), Math.round(((i + 1) * ms.length) / n)));
  }
  return out;
}

async function main() {
  const { rooms, moments } = JSON.parse(readFileSync(join(DIR, 'set.json'), 'utf8')) as {
    rooms: RoomSet[];
    moments: Moment[];
  };
  const size = Number(values.batch);
  await judge(rooms, batchesOf(moments, size), 'labels.json');

  // A random 10% again, in fresh calls and new batches (other neighbours, other order).
  const random = rng(Number(values.seed));
  const shuffled = moments
    .map((m) => ({ m, r: random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ m }) => m);
  const picked = new Set(shuffled.slice(0, Math.round(moments.length * Number(values.rejudge))));
  const again = moments.filter((m) => picked.has(m)).reverse();
  await judge(rooms, batchesOf(again, size), 'rejudge.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
