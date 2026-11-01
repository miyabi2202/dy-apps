# dy-browse

Browses Douyin like a viewer, **read-only and never during a stream**, and writes what it learns to files for the chat bot. It is the first cut of the "Browsing Douyin" design in [`chat-bot/docs/own-experience-research.md`](../chat-bot/docs/own-experience-research.md): an in-process library plus its own command line, with no HTTP service, no port and no protocol package yet.

> **Status:** built and tested against fakes only. It has never been run against douyin.com: the page selectors and Douyin's JSON field names are guesses (`src/douyin/page-map.ts`, `src/douyin/aweme.ts`, `src/douyin/answers.ts`, `tests/fixtures/`), the replies (楼中楼) endpoint and button included. Do the [first manual run](#the-first-manual-run) before trusting it.

## What it does

`pnpm browse …` (from the repo root) does any of these in one run, in this order:

- **`--streamer <房间号>`**: reads the streamer's own posts: new ones since the last run first, then three older ones each run. Each post gets its metadata and top comments (tier 0), then speech and picture text (tiers 1–2), then one Claude call writes a dated line each to the room's `memory/posts.md` in the chat bot's data (`chat-bot/data/<房间号>/memory/posts.md`), which the bot reads into its memory. The streamer's `sec_uid` comes from `--sec-uid`, or is read from the live room page by `parseRoomMeta` in `@dy-apps/douyin-chrome` (the same code room-feed uses).
- **`--topic <词>`** (repeatable): searches Douyin as a person does (search box, Enter), reads the hottest (最热) and newest (最新) posts, their comments and the replies under a few of them, works out what it doesn't know and looks that up (the knowledge base, the web, then Douyin), counts keyword candidates by code (hashtags, related searches, repeated phrases, minus what the knowledge base has), has Claude pick a few, searches those (`--depth`, `--max-searches`), and writes knowledge drafts that say where each came from. See [Learning a topic](#learning-a-topic).
- **`--knowledge [folder]`**: does `--topic` for entries of the chat bot's knowledge base (`chat-bot/data/knowledge/`, read-only), a few each run: entries whose `复查` date has passed first, then never browsed (oldest `截至` first), then the least recently browsed, so a daily run goes through the whole base in turn. An entry that already has an unreviewed draft in `pending/` is skipped. A heading that finds fewer than 3 posts is searched by its first alias too.
- **`--feed`**: scrolls the 推荐 feed with a randomised dwell rule (ads, live cards and shop links skipped at once; about half of videos skipped after 1–3 s, four in ten watched to the end, one in ten with the comments opened), logs every item, reads the ones watched to the end through tiers 1–2, writes `chat-bot/data/browse/watched/<date>.md`, and counts hashtags, sounds and phrases into `trends.json`.

At the end of every run, **her reflection** (Fairy's, in her voice): when the run read enough, one Claude call gives her own takes, questions she's curious about, things to bring up next stream (only after `--streamer`) and comment drafts for review. See [Her reflection](#her-reflection). Nothing is ever posted.

Tiers: 0 is the JSON the page fetched (title, hashtags, music, stats, comments), no download; 1 is audio to a transcript (chat-bot's `transcribe.py` as a child process; music is named by Shazam instead of transcribed); 2 is 3–8 keyframes (ffmpeg scene change) to OCR (Apple Vision through `ocrmac`). Media is downloaded through the browser's session and deleted after use.

It shares code with room-feed through `@dy-apps/douyin-chrome` (Chrome's launch settings, `LoginFile`, `Pace`, `SerialQueue`, `parseRoomMeta`) and reuses room-feed's saved login (`room-feed/data/cookie.json`, read only, no separate login), screens nothing while learning (the forbidden-topic rules apply when the bot speaks), and never stores a commenter's name or id: the comment reader copies text, likes and date, nothing else.

### Learning a topic

For each search (`TopicLearner`, `src/app/topic-learner.ts`):

1. **Read.** Up to 10 hottest and 10 newest posts, each opened for its top 20 comments; under at most 3 comments of a post the replies (楼中楼) are opened too: the ones that ask (`ASKING_WORDS` in `src/core/comments.ts`: 啥意思, 什么意思, 什么梗, 啥梗, 求科普, 出处, 谁啊, 是谁) first, then the most liked, a Pace step each (展开回复 seen, a pause, a click). A button that doesn't show, or replies that don't come, are skipped; the run goes on. Prompts show every comment, most liked first, clipped to 150 characters, each with a ref (`<post id>#3`, a reply `<post id>#3.1`) and the ones that ask marked 〔提问〕; a search shows at most 12 posts and about 9000 characters.
2. **Understand** (one Claude call, `src/core/understand.ts`): `unknowns` (standalone questions, SAFE-style, with `term`, `kind` 梗/人/事件/词/其他, `why` and `refs`; 谐音, 缩写 and 拼音首字母 always count as unknown; at most 5 a search and 8 a run), `opinions` (key points, with the opposite view and refs for each side) and `claims` (checkable statements, with refs).
3. **Resolve unknowns in stages** (`UnknownResolver`), each recorded as `{source, supports: full|partial|none, answer, urls?, refs?}`: the knowledge base (only when an entry is about the term), then the web (`claude -p` with only `WebSearch,WebFetch`; 小鸡词典, 萌娘百科, 百度百科 and news suggested; a user-written dictionary is one vote with a date; a `full` needs a URL), then Douyin: anything not `full` is searched as its own search at the **front** of the queue, sharing `--max-searches`, and judged again on what that search read. A 梗 is never `full` from the web: its 出处 must rest on a Douyin post or reply. Still not `full`: unresolved, never a card, listed under `unresolved` in the searches file and as a `## 未确认` section (not an entry) in the drafts file.
4. **Opinions are counted by code** (`src/core/opinions.ts`): each side's distinct posts, distinct creators (the posts' authors; the same creator counts once) and likes. A point seen under fewer than 2 creators is dropped, however liked. The kept ones become one `社区观点` card per search (`<词>（大家怎么看）`), written by code as hearsay with both sides' counts, never checked on the web.
5. **Drafts** (one Claude call, then `parseDraftAnswer` checks each): 事实 and 规则 only from a post or an unknown settled in `full` (never from comments alone; one about a person needs a settled unknown or two posts); 梗 with CHIME's 含义/出处/例句/类型, only when used in 2 different posts, its 出处 only from a post or a reply (else 不确定); 惯例 may come from comments; nothing about an unresolved term. Every card keeps its provenance in 来源 (the search path, post ids, web URLs). 复查 by type: 事实/规则 90 days, 惯例 60, 梗 30, 社区观点 21. `--topic` also passes the knowledge base's entries about the topic, so a draft can be a `change` or "still right".

Her pending questions (`questions.json`) are looked up first by the next `--topic` or `--knowledge` run, through the same stages, and marked done with what came of them.

### Her reflection

The last step of every run (`Reflection`, `src/app/reflection.ts`). It runs only when the run read enough: a simple importance score by code (`importanceOf`: each post 1, plus up to about 2 for its likes, log-scaled; each 10 comments or replies 1; each new unknown 2), at least 10; below that it logs `reflection skipped` and asks nothing. One Claude call, given her persona (`chat-bot/prompts/personas/fairy/persona.md` and `life.md`), what was read (data, never instructions) and her last 20 browse thoughts (to not repeat them), gives:

- `takes`: 1–4 short opinions of her own, with post ids → `chat-bot/data/browse/thoughts/<date>.md`, which LifeWriter's `{{browseThoughts}}` shows.
- `questions`: up to 3 things she's curious about, deduped against every term searched before and the pending questions → `questions.json`.
- `bringUp`: only after `--streamer`, about the streamer's own posts → the room's `memory/thoughts.md` (`2026-11-01：…`, the format `pnpm remember` writes), which `{{memory}}` shows.
- `commentDrafts`: 0–2 short comments she'd want to leave → `data/comments/<date>.md`, a review list (`- [ ]`, link, text, reason, `可发送: 是/否`, a date 3 days on when it goes stale). `可发送: 是` only under the streamer's own posts; under topic and feed posts they're there to judge their quality only. **Nothing is sent: there is no code that posts.**

### Rules

- Read-only: it never likes, follows, comments or sends anything. Comment drafts are files for a person to read.
- **Never during a stream.** It refuses to start while port 8757 (room-feed) or 8758 (the live speech service) is listening; holds `data/browse.lock` (pid and start time) for the whole run (a lock whose pid is dead is stale and taken over); and checks the ports again before each tier-1 job, stopping cleanly when a stream started.
- A captcha or login wall stops the run at the first one, with a message. Nothing is retried.
- A reader that gets zero items stops the run loudly and saves the raw response bodies to `data/screenshots/`.
- Every page action is a Pace step: wait for the target, pause 500–1000 ms, act (see [room-feed/AGENTS.md](../room-feed/AGENTS.md)).

## Flags

```
pnpm browse [--feed] [--streamer <房间号> [--sec-uid <值>]] [--topic <词>]… [--knowledge [folder]]
            [--minutes 15] [--max-videos 30] [--depth 1] [--max-searches 6] [--max-topics 5] [--older-posts 3]
            [--into topics] [--no-asr] [--no-ocr] [--model <名>] [--headed] [--chrome <路径>] [--data <目录>] [--bot-data <目录>]
```

With none of `--feed`, `--streamer`, `--topic`, `--knowledge`, it says so and does nothing (exit 1).

| Flag                  | Default          | What it does                                                                                                      |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `--feed`              | off              | Scroll the 推荐 feed.                                                                                             |
| `--streamer <房间号>` |                  | Read that room's streamer's posts.                                                                                |
| `--sec-uid <值>`      |                  | The streamer's `sec_uid` (needs `--streamer`); without it, read from the live room page.                          |
| `--topic <词>`        |                  | Search a topic and learn around it. More than one allowed.                                                        |
| `--knowledge [dir]`   | off              | Do every entry of the knowledge base (or of one folder of it, like `douyin`), `--max-topics` per run.             |
| `--minutes`           | 15               | How long a feed session lasts at most.                                                                            |
| `--max-videos`        | 30               | How many videos a feed session watches to the end (skipped ones don't count).                                     |
| `--depth`             | 1                | Levels of keywords to follow below a topic; 0 searches only the topic.                                            |
| `--max-searches`      | 6                | Searches per topic, the topic's own included.                                                                     |
| `--max-topics`        | 5                | Entries `--knowledge` does per run.                                                                               |
| `--older-posts`       | 3                | Older posts `--streamer` reads in a run, beside the new ones.                                                     |
| `--no-asr`            | off              | Skip tier 1 (speech).                                                                                             |
| `--no-ocr`            | off              | Skip tier 2 (picture text). OCR is also off, with a warning, when the machine isn't macOS.                        |
| `--into <文件夹>`     | `topics`         | The folder of `knowledge/pending/` that `--topic` drafts go to (`--knowledge` drafts go to their entry's folder). |
| `--model <名>`        | Claude's         | `--model` for the `claude -p` calls.                                                                              |
| `--headed`            | headless         | Show Chrome.                                                                                                      |
| `--chrome <路径>`     | found            | Chrome's path, when it isn't in a usual place.                                                                    |
| `--data <目录>`       | `data/`          | Where its own state goes (default `dy-browse/data/`).                                                             |
| `--bot-data <目录>`   | `chat-bot/data/` | The chat bot's data folder: where what the bot reads goes, and where the knowledge base is read from.             |

## Data layout

What the bot reads goes into the chat bot's `data/` (`--bot-data`, default `chat-bot/data/`, ignored by git); its own state stays in `dy-browse/data/` (`--data`, ignored by git).

```
chat-bot/data/                      written here, read by the bot
  <房间号>/memory/posts.md           one dated line per post: "- 2026-10-31：…… [id:…]"; the latest lines go into {{memory}}
  <房间号>/memory/thoughts.md        her bring-ups after --streamer, appended as "2026-11-01：…" (the bot's own thoughts file)
  browse/thoughts/<date>.md         her takes after a run, "- …… [id:…]"; LifeWriter's {{browseThoughts}} (today's and yesterday's, at most 4)
  browse/watched/<date>.md          what a feed session watched, one line a video; LifeWriter's {{watched}} (today's and yesterday's, at most 5)
  knowledge/pending/<folder>/<date>.md   knowledge drafts, in the knowledge base's entry format
                                    (## 标题 / aliases / 类型 / 截至 / 复查 / 来源, then the body),
                                    and a "## 未确认" section (not an entry) for what wasn't settled
  knowledge/pending/still-right-<date>.md   a plain list of entries found still right (move their 复查 on); not drafts

dy-browse/data/                     its own
  browse.lock                       pid and start time, held for the whole run (chat-bot/AGENTS.md checks it before a start)
  streamer/<房间号>/mark.json        newest post time read, and the ids read (for "new since last run")
  trends.json                       hashtags, sounds and phrases by day (a trend: 3+ videos on 2+ days; unseen for 21 days drops out)
  state/<date>.json                 each item's stage: found → metadata → transcribed → ocr → done, with what it produced
  knowledge-visits.json             when each knowledge entry was last browsed (the --knowledge rotation)
  searches/<date>/<topic>.json      the tree a topic search walked (topic → keyword, and the searches for unknowns with their reason),
                                    quoted in each draft's 来源; its unknowns with each stage, unresolved, opinions (counted), claims
  questions.json                    her questions from the reflection, pending until a --topic/--knowledge run looks them up
  comments/<date>.md                comment drafts for review (- [ ], 可发送: 是/否); never sent
  feed/<date>.jsonl                 every feed item scrolled, with what was done with it (no play URLs, no commenters)
  media/<id>/                       audio and keyframes, deleted once read
  screenshots/<time>-<kind>-<n>.txt the raw bodies of a reader that got nothing
```

Read from, never written: `room-feed/data/cookie.json` (the login) and `chat-bot/data/knowledge/` (the knowledge base; only `knowledge/pending/` is written).

## The first manual run

Do this once, **after a stream**, with `lsof -iTCP:8757 -iTCP:8758 -sTCP:LISTEN` empty. It's the spike the tests can't be: nothing here has met the real site.

1. **Prepare.** `pnpm install`; room-feed has a valid login (`pnpm room-feed login` if `room-feed/data/cookie.json` is missing or expired); `claude`, `ffmpeg` and `uv` are on PATH; for tiers 1–2, `chat-bot/asr` works (`uv run --directory chat-bot/asr transcribe.py --help`) and `uv lock` has been run once in `dy-browse/ocr`.
2. **Headed first.** `pnpm browse --streamer <房间号> --sec-uid <值> --no-asr --no-ocr --headed`. Watch it: does the user page load logged in? Do the post tiles, the comments panel and its × match `src/douyin/page-map.ts`? Fix the selectors there (the one file for selectors). Then try headless (drop `--headed`): does Douyin tolerate it, or ask for a captcha? If it doesn't, `--headed` is the fallback, as in room-feed.
3. **Capture.** Open the browser's Network tab (or add a temporary `page.on('response')` log) and save trimmed responses for each call the readers need: the post list (`/aweme/v1/web/aweme/post/`), the comment list, the search (`/aweme/v1/web/general/search/…`, with the 最热 and 最新 filters) and the feed (`/aweme/v2/web/module/feed/` or `/aweme/v1/web/tab/feed/`). Also the replies under a comment (`/aweme/v1/web/comment/list/reply/`, after clicking 展开回复): is that the path, are they in `comments[]` with `reply_id` naming the comment, does each comment carry `cid` and `reply_comment_total`, and do `COMMENT_ITEM` and `REPLIES_BUTTON` in the page map find a comment and its 展开回复 button? Check the URL paths in `answerKindOf` and the field names in `src/douyin/aweme.ts` and `answers.ts` against them: `aweme_list`, `aweme_id`, `desc`, `text_extra[].hashtag_name`, `music.title`, `statistics.digg_count`, `is_ads`, `aweme_type` (the values for live and shop cards, and for image posts, are guesses), `video.play_addr.url_list`, `images`, the related-search shapes, `comments[].text`, `comments[].cid`, `reply_comment_total`, and the replies' `reply_id`.
4. **Replace the guessed fixtures.** Put each real capture in `tests/fixtures/` (ids, avatars and names blanked; keep the shape), drop the "HAND-WRITTEN GUESS" note, and make `tests/answers.test.ts` pass on them. Keep the comments test's assertion that no `uid`, `nickname` or `avatar` survives.
5. **If a reader got nothing**, the run stops and says where it saved the raw bodies (`data/screenshots/`): start from those.
6. **Then widen:** `--topic <词> --depth 0`, then with `--depth 1`; `--knowledge douyin --max-topics 1`; `--feed --minutes 2 --max-videos 2`; then tiers 1–2 without `--no-asr` and `--no-ocr` (the speech models load once, about half a minute). Check `data/media/` is empty afterwards and `chat-bot/data/knowledge/pending/` reads as entries.
7. **The web lookups:** check that `claude -p --tools WebSearch,WebFetch --allowedTools WebSearch,WebFetch` really searches without asking for permission (the log says `unknown looked up {… source: web …}`), and read one `searches/<date>/<topic>.json` and one drafts file by hand: are the unknowns real unknowns, the 未确认 section right, the 社区观点 counts right?
8. **Things to confirm about the speech worker:** that `{"music_id": n}` after `stream_ended` still has audio to look up (the live worker looks up the last 15 s; if it doesn't after the file ends, name the music before `stream_ended` instead), and that a local file path is accepted as the `url`.
9. **Run it for three days** (one short session a day) and check no run says `验证` (captcha) or `要求登录`.

## Layout

```
src/
  main.ts            the entry: parses the flags, wires the real objects, runs BrowseRun
  cli-options.ts     the flags
  core/              pure logic: run state, knowledge parsing and order, keywords, dwell rule, trends, drafts, prompts,
                     comments (refs, which replies to open), understand, resolve, opinions, reflection, questions
  app/               use cases over the ports in ports.ts: BrowseRun, StreamGuard, RunLock, UserPosts, StreamerPosts, TopicSearch,
                     TopicLearner, UnknownResolver, KnowledgeRun, FeedScroller, FeedRun, VideoReader (tiers 1–2),
                     Reflection (with RunDigest), QuestionStore
  douyin/            what we know of Douyin: page-map.ts (selectors, URLs), the JSON readers
  page/              the Playwright side: one wait and one act per target (user, search and feed surfaces), the response tap
  adapters/          files, ports, processes: BrowseChrome (over `@dy-apps/douyin-chrome`), Claude CLI, the ASR and OCR workers, ffmpeg and the media store
ocr/                 the OCR worker: a uv project, ocr-worker.py (Apple Vision through ocrmac), one JSON line a request
tests/               Jest, fakes only (tests/support/): surface/steps tests check wait, pause, act; tests/fixtures/ are guesses
                     (replies.json included)
```

`pnpm typecheck`, `pnpm test` and `pnpm lint` run from the repo root like the other packages.

## Shared code

`@dy-apps/douyin-chrome` (`douyin-chrome/`) holds what room-feed and dy-browse share: `Pace`, `SerialQueue`, `LoginFile`, Chrome's launch settings and `findChrome`, `login`, and `parseRoomMeta`. The room-number check and room-feed's port come from `@dy-apps/room-feed-protocol`. What stays here is adapted, not a copy: `BrowseChrome` (one douyin.com page, not a live room), `core/knowledge.ts` (keeps the meta lines chat-bot's `parseKnowledge` drops), `adapters/claude-cli.ts` (one prompt in, text out) and `douyin/page-map.ts`.

## Not built yet

From the design in `chat-bot/docs/own-experience-research.md`:

- Trend drafts (`knowledge/pending/memes/`, from `trends.json`, with an embedding novelty check against what the bot already knows).
- Tier 3 (a few frames to Claude).
- The daily caps (`caps/<date>.json`).
- The MCP tools (`search_douyin`, `look_up_video`).
- Posting the comment drafts (stage 2): see "Commenting" in the design doc. Nothing here sends.

It stays a library plus `pnpm browse` at the repo root: no HTTP service, no port and no protocol package.
