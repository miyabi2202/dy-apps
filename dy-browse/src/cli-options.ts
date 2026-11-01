import { parseArgs } from 'node:util';
import { isRoomId } from '@dy-apps/room-feed-protocol';
import { UsageError } from './core/errors';

export interface BrowseOptions {
  feed: boolean;
  /** The room number whose streamer's posts are read. */
  streamer: string | null;
  secUid: string | null;
  topics: string[];
  /** `--knowledge [folder]`: null when not asked; folder null for the whole knowledge base. */
  knowledge: { folder: string | null } | null;
  minutes: number;
  maxVideos: number;
  depth: number;
  maxSearches: number;
  maxTopics: number;
  /** Older posts `--streamer` reads in a run, beside the new ones. */
  olderPosts: number;
  asr: boolean;
  ocr: boolean;
  /** The pending folder `--topic` drafts go to. */
  into: string;
  model: string | null;
  headed: boolean;
  chrome: string | null;
  dataDir: string | null;
  /** The chat bot's `data/`, where what the bot reads goes. */
  botDataDir: string | null;
  help: boolean;
}

export const USAGE = `pnpm browse [--feed] [--streamer <房间号> [--sec-uid <值>]] [--topic <词>]… [--knowledge [folder]]
            [--minutes 15] [--max-videos 30] [--depth 1] [--max-searches 6] [--max-topics 5] [--older-posts 3]
            [--into topics] [--no-asr] [--no-ocr] [--model <名>] [--headed] [--chrome <路径>] [--data <目录>]

At least one of --feed, --streamer, --topic or --knowledge is needed. Never runs during a stream.`;

/**
 * `--knowledge` takes an optional folder, which parseArgs can't do: a following word that doesn't
 * start with `-` is the folder; it's taken out of the arguments before parseArgs sees them.
 */
function takeKnowledge(argv: readonly string[]): {
  rest: string[];
  knowledge: { folder: string | null } | null;
} {
  const rest: string[] = [];
  let knowledge: { folder: string | null } | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--knowledge') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        knowledge = { folder: next };
        i++;
      } else knowledge = { folder: null };
    } else if (arg.startsWith('--knowledge=')) {
      knowledge = { folder: arg.slice('--knowledge='.length) || null };
    } else rest.push(arg);
  }
  return { rest, knowledge };
}

function positive(name: string, value: string | undefined, fallback: number, min = 1): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min) {
    throw new UsageError(`--${name} 要是不小于 ${min} 的整数：${value}`);
  }
  return Number(value);
}

/** The command line as options; throws UsageError for what can't be run. */
export function parseOptions(argv: readonly string[]): BrowseOptions {
  const { rest, knowledge } = takeKnowledge(argv);
  let values;
  try {
    ({ values } = parseArgs({
      args: rest,
      strict: true,
      allowPositionals: false,
      options: {
        feed: { type: 'boolean' },
        streamer: { type: 'string' },
        'sec-uid': { type: 'string' },
        topic: { type: 'string', multiple: true },
        minutes: { type: 'string' },
        'max-videos': { type: 'string' },
        depth: { type: 'string' },
        'max-searches': { type: 'string' },
        'max-topics': { type: 'string' },
        'older-posts': { type: 'string' },
        'no-asr': { type: 'boolean' },
        'no-ocr': { type: 'boolean' },
        into: { type: 'string' },
        model: { type: 'string' },
        headed: { type: 'boolean' },
        chrome: { type: 'string' },
        data: { type: 'string' },
        'bot-data': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e), { cause: e });
  }
  const streamer = values.streamer ?? null;
  if (streamer !== null && !isRoomId(streamer)) {
    throw new UsageError(`--streamer 要是房间号（数字）：${streamer}`);
  }
  const secUid = values['sec-uid'] ?? null;
  if (secUid !== null && streamer === null)
    throw new UsageError('--sec-uid 要和 --streamer 一起用');
  const topics = (values.topic ?? []).map((t) => t.trim()).filter(Boolean);
  const options: BrowseOptions = {
    feed: values.feed ?? false,
    streamer,
    secUid,
    topics,
    knowledge,
    minutes: positive('minutes', values.minutes, 15),
    maxVideos: positive('max-videos', values['max-videos'], 30),
    depth: positive('depth', values.depth, 1, 0),
    maxSearches: positive('max-searches', values['max-searches'], 6),
    maxTopics: positive('max-topics', values['max-topics'], 5),
    olderPosts: positive('older-posts', values['older-posts'], 3),
    asr: !values['no-asr'],
    ocr: !values['no-ocr'],
    into: values.into ?? 'topics',
    model: values.model ?? null,
    headed: values.headed ?? false,
    chrome: values.chrome ?? null,
    dataDir: values.data ?? null,
    botDataDir: values['bot-data'] ?? null,
    help: values.help ?? false,
  };
  if (!options.help && !options.feed && !streamer && !topics.length && !knowledge) {
    throw new UsageError('没有要做的事：用 --feed、--streamer、--topic 或 --knowledge 之一。');
  }
  return options;
}
