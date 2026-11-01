import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, LoginFile, Pace } from '@dy-apps/douyin-chrome';
import { claudeCli } from './adapters/claude-cli';
import { spawnBatchTranscriber } from './adapters/asr-batch';
import type { Page } from 'playwright-core';
import { BrowseChrome, type BrowseSession } from './adapters/browse-chrome';
import {
  FileDataStore,
  FileKnowledgeSource,
  FileLockStore,
  pidAlive,
} from './adapters/file-adapters';
import { MediaStore } from './adapters/media-store';
import { spawnOcr } from './adapters/ocr-worker';
import { isPortListening } from './adapters/port-check';
import { BrowseRun, type Step } from './app/browse-run';
import { DraftStore } from './app/draft-store';
import { FeedLog, Trends, WatchedLog } from './app/feed-logs';
import { FeedRun } from './app/feed-run';
import { FeedScroller } from './app/feed-scroller';
import { jsonStateStore } from './app/json-state-store';
import { KnowledgeRun } from './app/knowledge-run';
import { LazyItemReader } from './app/lazy-reader';
import { RunLock } from './app/run-lock';
import { resolveSecUid } from './app/sec-uid';
import { StreamerPosts } from './app/streamer-posts';
import { StreamGuard } from './app/stream-guard';
import { TopicLearner } from './app/topic-learner';
import { TopicSearch } from './app/topic-search';
import { UserPosts } from './app/user-posts';
import { VideoReader } from './app/video-reader';
import { parseOptions, USAGE } from './cli-options';
import { randomDwell } from './core/dwell';
import { RunStopped, UsageError } from './core/errors';
import { KnowledgeIndex, parseKnowledge } from './core/knowledge';
import { RunState } from './core/run-state';
import { dateOf } from './core/text';
import { PageFeedSurface } from './page/feed-surface';
import { contextDownload } from './page/download';
import { PageResponseTap } from './page/response-tap';
import { pageRoomHtml } from './page/room-html';
import { PageSearchSurface } from './page/search-surface';
import { PageUserSurface } from './page/user-surface';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = dirname(PACKAGE_DIR);

const log = (message: string) => console.log(`[dy-browse] ${message}`);

/**
 * The entry: the real objects are built and wired here, and only here (hand-wired, as
 * room-feed's main.ts is). Nothing starts until the guard has said no stream is on and the lock is
 * held, so Chrome and the workers are built lazily, by the steps that need them.
 */
async function main(): Promise<number> {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`${e.message}\n\n${USAGE}`);
      return 1;
    }
    throw e;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const dataDir = options.dataDir ?? join(PACKAGE_DIR, 'data');
  const data = new FileDataStore(dataDir);
  // The chat bot's data/: what the bot reads (the streamer's posts, what was watched, knowledge
  // drafts) goes there, and the knowledge base is read from it.
  const botDataDir = options.botDataDir ?? join(REPO_DIR, 'chat-bot', 'data');
  const bot = new FileDataStore(botDataDir);
  const now = () => Date.now();
  const guard = new StreamGuard(isPortListening);
  const lock = new RunLock(new FileLockStore(join(dataDir, 'browse.lock')), { isAlive: pidAlive });

  // The login room-feed saved: read only, and never written here.
  const login = new LoginFile(join(REPO_DIR, 'room-feed', 'data', 'cookie.json'));
  const knowledgeSource = new FileKnowledgeSource(join(botDataDir, 'knowledge'));
  const ask = claudeCli({ model: options.model });

  // Built on first use, after the run has started.
  let opened: BrowseSession | null = null;
  let shared: { session: BrowseSession; page: Page; pace: Pace; tap: PageResponseTap } | null =
    null;
  const chrome = new BrowseChrome({
    executablePath: options.chrome ?? findChrome() ?? '',
    headless: !options.headed,
    cookie: () => login.read()?.cookie ?? null,
  });
  const browser = async () => {
    if (!options.chrome && !findChrome())
      throw new RunStopped('找不到 Chrome：用 --chrome <路径> 指定。');
    if (!login.read()) {
      throw new RunStopped('没有保存的登录（或已过期）：先运行 pnpm room-feed login。');
    }
    if (!opened) {
      opened = await chrome.open();
      const { page } = opened;
      // One page, one pace and one tap for the whole run.
      shared = {
        session: opened,
        page,
        pace: new Pace({ wait: (ms) => page.waitForTimeout(ms) }),
        tap: new PageResponseTap(page),
      };
    }
    return shared!;
  };

  // Tiers 1–2: the speech and OCR workers start when the first item needs them.
  const reader = new LazyItemReader(async () => {
    const { session } = await browser();
    const transcriber = options.asr
      ? await spawnBatchTranscriber({ asrDir: join(REPO_DIR, 'chat-bot', 'asr'), log })
      : null;
    const ocr = await spawnOcr({ ocrDir: join(PACKAGE_DIR, 'ocr'), enabled: options.ocr, log });
    return {
      reader: new VideoReader({
        media: new MediaStore({
          root: join(dataDir, 'media'),
          download: contextDownload(session.context),
        }),
        transcriber,
        ocr,
        state: new RunState(jsonStateStore(data), dateOf(now())),
        guard,
        log,
      }),
      close: async () => {
        await transcriber?.close();
        await ocr?.close();
      },
    };
  });

  const index = new KnowledgeIndex(
    knowledgeSource.files().flatMap((file) => parseKnowledge(file.text, file.folder)),
  );
  const drafts = new DraftStore(bot);
  const learner = async () => {
    const { page, pace, tap } = await browser();
    return new TopicLearner({
      search: new TopicSearch(new PageSearchSurface(page), tap, pace),
      ask,
      data,
      drafts,
      index,
      log,
      reader,
      depth: options.depth,
      maxSearches: options.maxSearches,
    });
  };

  const steps: Step[] = [];
  if (options.streamer) {
    const roomId = options.streamer;
    steps.push({
      name: `主播 ${roomId} 的作品`,
      run: async () => {
        const { page, pace, tap } = await browser();
        const secUid = await resolveSecUid(roomId, options.secUid, pageRoomHtml(page, pace));
        const posts = new UserPosts(new PageUserSurface(page), tap, pace);
        const result = await new StreamerPosts({ posts, data, bot, ask, log, reader }).run(
          roomId,
          secUid,
        );
        log(`posts.md：${result.file}`);
      },
    });
  }
  for (const topic of options.topics) {
    steps.push({
      name: `搜索 ${topic}`,
      run: async () => void (await (await learner()).learn(topic, { folder: options.into })),
    });
  }
  if (options.knowledge) {
    const folder = options.knowledge.folder;
    steps.push({
      name: `知识库${folder ? ` ${folder}` : ''}`,
      run: async () => {
        const run = new KnowledgeRun({
          source: knowledgeSource,
          data,
          drafts,
          learner: await learner(),
          log,
        });
        await run.run({ folder, maxTopics: options.maxTopics });
      },
    });
  }
  if (options.feed) {
    steps.push({
      name: '推荐页',
      run: async () => {
        const { page, pace, tap } = await browser();
        const scroller = new FeedScroller(new PageFeedSurface(page), tap, {
          pace,
          dwell: randomDwell(),
        });
        await new FeedRun({
          scroller,
          feedLog: new FeedLog(data),
          watchedLog: new WatchedLog(bot),
          trends: new Trends(data),
          log,
          reader,
        }).run({ minutes: options.minutes, maxVideos: options.maxVideos });
      },
    });
  }

  const cleanup = async () => {
    await reader.close();
    await opened?.close();
    await chrome.close();
  };
  process.once('SIGINT', () => {
    void cleanup()
      .catch(() => {})
      .finally(() => {
        lock.release();
        process.exit(130);
      });
  });

  const outcome = await new BrowseRun({ guard, lock, data, log, steps, cleanup, now }).run();
  return outcome.code;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
