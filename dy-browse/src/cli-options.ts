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
  /** `--review [folder]`: null when not asked; folder null for every pending folder. */
  review: { folder: string | null } | null;
  /** `--undo-review <date>`: the day whose automatic review is taken back. */
  undoReview: string | null;
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
            [--review [folder]] [--undo-review <YYYY-MM-DD>]
            [--minutes 15] [--max-videos 30] [--depth 1] [--max-searches 6] [--max-topics 5] [--older-posts 3]
            [--into topics] [--no-asr] [--no-ocr] [--model <名>] [--headed] [--chrome <路径>] [--data <目录>]

At least one of --feed, --streamer, --topic, --knowledge, --review or --undo-review is needed. Never runs during a stream.`;

/** The flags that take an optional folder. */
const OPTIONAL_FOLDER = ['knowledge', 'review'] as const;
type OptionalFolder = (typeof OPTIONAL_FOLDER)[number];

/**
 * `--knowledge` and `--review` take an optional folder, which parseArgs can't do: a following word
 * that doesn't start with `-` is the folder; it's taken out of the arguments before parseArgs sees
 * them.
 */
function takeOptionalFolders(argv: readonly string[]): {
  rest: string[];
  taken: Record<OptionalFolder, { folder: string | null } | null>;
} {
  const rest: string[] = [];
  const taken: Record<OptionalFolder, { folder: string | null } | null> = {
    knowledge: null,
    review: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const name = OPTIONAL_FOLDER.find((n) => arg === `--${n}` || arg.startsWith(`--${n}=`));
    if (!name) {
      rest.push(arg);
    } else if (arg === `--${name}`) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        taken[name] = { folder: next };
        i++;
      } else taken[name] = { folder: null };
    } else {
      taken[name] = { folder: arg.slice(`--${name}=`.length) || null };
    }
  }
  return { rest, taken };
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
  const {
    rest,
    taken: { knowledge, review },
  } = takeOptionalFolders(argv);
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
        'undo-review': { type: 'string' },
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
  const undoReview = values['undo-review'] ?? null;
  if (undoReview !== null && !/^\d{4}-\d{2}-\d{2}$/.test(undoReview)) {
    throw new UsageError(`--undo-review 要是日期（YYYY-MM-DD）：${undoReview}`);
  }
  const topics = (values.topic ?? []).map((t) => t.trim()).filter(Boolean);
  const options: BrowseOptions = {
    feed: values.feed ?? false,
    streamer,
    secUid,
    topics,
    knowledge,
    review,
    undoReview,
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
  const nothing = !options.feed && !streamer && !topics.length && !knowledge;
  if (!options.help && nothing && !review && !undoReview) {
    throw new UsageError(
      '没有要做的事：用 --feed、--streamer、--topic、--knowledge、--review 或 --undo-review 之一。',
    );
  }
  return options;
}
