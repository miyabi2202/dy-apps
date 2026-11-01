# Giving the bot its own experiences

> **Status (2026-11-01):** written before ideas 1 and 2 of "Ideas for our bot" were built, when the bot had only a fixed persona and no state of its own; kept as the research it was. Since then: idea 1 is built as `LifeWriter` (`src/app/life/life-writer.ts`), which writes the persona's day to `data/lives/<persona>/<date>.md` from `prompts/life.md` (Fairy's guide is `prompts/personas/fairy/life.md`), the latest days going into `{{persona}}` under `## 最近的日子`; idea 2 is `pnpm remember`'s thoughts after each stream (`memory/thoughts.md`, the latest 6 in `{{memory}}`). `prompts/auto-message.md` and the auto message are gone, so idea 3's premise is too; what's closest now is `randomReplyChance` (`/随机回复`, `asked-random` in `wording.md`), which hands a random chat to Claude to join in on or not. `prompts/personas/fairy.md` is now `prompts/personas/fairy/persona.md`. Idea 5, browsing Douyin (the 推荐 feed, the streamer's own posts and topic search), is a design with an implementation plan in "Browsing Douyin" below.

## The problem

When someone talks to the bot, it can only answer with what is already in the room: the streamer's words, the chat and its memory. A person brings their own life, opinions and curiosity into a conversation, so there is always something new to talk about. The bot has nothing of its own to bring up.

Two of our own prompts also push against new topics:

- `prompts/personas/fairy.md` (now `prompts/personas/fairy/persona.md`) says "答完问题不再补一句……抛个新话题".
- `prompts/auto-message.md` (since removed) ties every message to what the streamer or chat just said.

Those rules make sense against rambling and padding, but they also remove any chance of the bot bringing up something new.

## What the research says

Researchers handle this in about five ways, listed from easiest to hardest to add to our bot.

### 1. A simulated life: give the bot things that happened to it

- **LoCoMo** (Snap Research) gives each agent a timeline of life events, and the long conversations are written to stay grounded in those events.
- **PersonaLife** (open source) gives a persona a simulated day between conversations. It keeps a log that separates what was planned from what actually happened, and the model can't rewrite past entries. That stops it contradicting itself.
- **Generative Agents** (Park et al., 2023) is the usual starting point. Everything the agent sees or does goes into one memory store. It recalls items by how recent, important and relevant they are. Now and then it also writes short "reflections" (what it makes of things) back into the same store, and those can come up later as its own opinions.
- **LD-Agent** keeps past events in a memory bank and the speakers' personas in a separate one that updates, so the character stays consistent across sessions.

Takeaway: "experiences" must be stored and kept consistent. If you just ask the model to invent an anecdote each time, the story changes from one telling to the next.

### 2. "Inner thoughts": keep thinking and only speak when there's something worth saying

- _Proactive Conversational Agents with Inner Thoughts_ (Liu et al., CHI 2025) is the closest match to this problem. Alongside the conversation, the agent keeps writing private thoughts using its long-term and short-term memory. It scores each thought on how much it wants to say it, and speaks only when one scores high enough.
- It works in five stages: trigger, retrieval, thought formation, evaluation, participation.
- It beat a "persona + predict who speaks next" baseline on all 7 measures, and people preferred it in over 82% of comparisons.
- New topics come out of the agent's own train of thought instead of only reacting to the last message. It was built for group chat, which fits a live room.

### 3. Self-disclosure: the bot shares its own view or story, not just answers

- In one study, the more the chatbot disclosed about itself, the more people enjoyed the chat.
- A 2026 preprint with 170 participants found bots with a generated persona built better rapport than both a no-persona bot and one that only self-disclosed.

### 4. User-oriented proactivity: open topics by getting curious about the person

- An IJCAI 2025 paper argues that bots which plan topics steer toward their own target topics and ignore the user. It proposes exploring the user's background instead.
- An older line of work found that how much a bot learns about the user tracks with how engaging humans rate it.
- A CHI 2024 study warns that bringing up remembered personal details can feel like surveillance to some people (in that study, health information), so choose what to recall with care.

### 5. Bring in fresh outside material

- _Conversation Initiation by Diverse News Contents Introduction_ starts topics from current news. It's a cheap way to have "something new to say" without making up a life.

## Ideas for our bot

The bot currently has only a fixed persona plus the transcript, chat history and memory. It has no state of its own that changes over time. Ideas, from cheapest to most work:

1. **An "own life" log per persona** (from idea 1). A scheduled job writes a few small, in-character events or opinions each day: things Fairy "did" in the HDD system, a song it "got hooked on", a take on tonight's set. They're added to a file only, never rewritten, and a few recent ones go into the prompt as `{{ownLife}}`. The persona rule changes to something like "you may occasionally bring one up when it connects".
2. **Reflections after each stream** (Generative Agents). `pnpm remember` already summarises the room. It could also write the bot's own opinions ("主播今天高音比上周稳"), which it can mention in later streams.
3. **Inner thoughts in auto-message** (idea 2). Split it into two steps. First, write 3–5 candidate thoughts from memory and current context, some tied to the room and some from its own life. Then score each one for how much the bot wants to say it, and send the best one only if it scores high enough. This also replaces the current "always send one" rule with a real reason to stay quiet.
4. **Follow-ups on viewers** (idea 4). Store small facts about regular viewers and ask about them later ("你上次说要去考试，考完了吗？").
5. **Browsing Douyin** (ideas 1 and 5). The bot scrolls Douyin like a viewer, so what it "did" today is real: videos it actually watched, from its recommendations or from the streamer's own posts. See the next section.

Start with 1 and 3 together, because 3 needs 1 to have new material to choose from.

## Browsing Douyin

> **Status (2026-11-01):** a design with an implementation plan; nothing built yet. It fits beside `LifeWriter` (idea 1, built) and the knowledge base (`docs/knowledge-base-plan.md`), and doesn't replace either.

A life written by a model is made up, however consistent it is. Browsing gives the bot material it didn't invent: a video it watched, a sound it heard in five videos this week, what the streamer posted yesterday. Viewers can check it, and the bot can bring it up the way a person does: 「今天刷到一个…」, 「你昨天发的那条我看了」.

### Sources, chosen by arguments

`pnpm browse` (run from `chat-bot/`, like `pnpm remember`) does any of these in a run:

- `--feed`: scroll the 推荐 feed and take what Douyin recommends. This is for random things: what's going around, new memes and sounds, whatever the bot's taste leads to. What it gives is shared by every room.
- `--streamer <房间号>`: read that room's streamer's own posts, new ones since the last run first, then older ones a few at a time. Their posts are at `douyin.com/user/<sec_uid>`; room-feed reads the streamer's `sec_uid` from the room page (`room-feed/src/douyin/room-meta.ts`, `meta.secUid` in `GET /api/rooms/<房间号>`), and the bot will keep it in the room's `room_config.json` beside the streamer's `uid` (it keeps only `nickname` and `uid` today). What it gives belongs to that room.
- `--topic <词>` (more than one allowed): search Douyin for the topic, read its hottest and most recent posts, then search a few keywords those posts bring up, to learn around it (see "Topic search"). What it gives goes to the knowledge base, for review.
- `--knowledge [folder]`: do `--topic` for every entry in the local knowledge base (`data/knowledge/`, or one folder of it, like `douyin`), a few each run, the ones most due first.

`pnpm browse --feed --streamer 416362684969` does both; `pnpm browse --topic 鸣潮 --topic 至此间` searches two topics. With none, it says so and does nothing. `--minutes` caps how long a feed session lasts, and `--max-videos` how many videos it watches to the end.

### The browser

The browser is a service of its own, like room-feed, not something an MCP tool starts. Starting Chrome and loading the login for every `claude -p` question would be slow and look automated. One service also keeps every page action in one queue, with one pace. `pnpm browse` is its client: the service browses and downloads, the client (in the chat bot, where the models, the knowledge base, the days and the memories are) does the rest.

- **Packages:** a new workspace package, `dy-browse/`, for the service. Chrome, the saved login, `hideAutomation`, `Pace` and `SerialQueue` move out of room-feed into a shared package that both import, since packages never import from each other. The service's API types and client go in a small protocol package, as room-feed's do.
- **Pacing:** every click, keystroke and scroll follows `room-feed/AGENTS.md`: wait for the target, pause 500–1000 ms, act. The steps are classes over a surface interface; only the surfaces in `src/page/` touch Playwright.
- **Reading data:** it browses like a person and reads the JSON that Douyin's own page fetches as it scrolls (`page.on('response')` on the feed, post-list, search and comment calls). Douyin's scripts sign those requests, so we don't have to, and the data is cleaner than the page's HTML.
- **API:** a small local HTTP API (port 8760) serves `pnpm browse`, and later thin MCP tools for Claude (look up a video, search a topic).

### Which account

- **The feed account matters.** The 推荐 feed learns from how long the account lingers, so whatever the bot watches longest, it gets more of. The bot's own account (默认关闭) would grow a taste of its own that stays the same across streams. That's appealing, but it ties the account to the experiment and puts its anti-bot risk on the account that streams.
- **The knowledge-base plan already decided against that risk:** a browser there runs on a separate profile, "so the streaming account never takes the anti-bot risk".
- **Recommendation:** start on a separate logged-in account, with its own login file (`dy-browse/data/cookie.json`, written by `pnpm dy-browse login`) and Chrome profile. Logged out, the feed is generic. Move to the bot's own account only if the drift turns out to be worth it.
- **Streamer mode and topic search:** a streamer's posts and search results are public, so they need no particular account. Search does lean on the account's history, though, and Douyin may ask a logged-out browser to log in after a few searches, so they run on the same separate account as the feed.

### Watching

- **Before watching:** the feed's JSON says what each item is before the bot "watches" it: title, hashtags, music, author, stats and type.
- **Skipping:** ads (the feed flags them), live-room cards and shop links are skipped. Image posts (图文) are read with OCR on their images, or skipped.
- **The dwell rule:** skip some after 1–3 s, watch some to the end, open the comments on a few, with some randomness. Always lingering on the funniest or most-commented videos would steer the feed into a meme bubble.
- **Session length:** 10–20 minutes, once or twice a day.
- **Streamer mode:** watches every post, since there are few.

### Topic search

Given a topic, it learns what Douyin says about it now, and what's next to it:

1. **Search.** Open `douyin.com`, type the topic into the search box and press Enter, as a person would, each a paced step; that lands on `douyin.com/search/<topic>`. It reads the results from the search API's JSON, the same way the feed is read. It takes two lists, using the page's own filters: 最热 (most liked) and 最新 (this week). That's about 10 of each, without duplicates. Hottest says what the topic is known for; most recent says what it's turning into.
2. **Read.** Each of those posts goes through tiers 0–2, with comments, as below.
3. **Pick keywords to follow.** Code collects the candidates; a model only chooses among them:
   - the hashtags on those posts;
   - the page's own related searches (相关搜索 / 大家都在搜);
   - short phrases that repeat across their titles, comments and transcripts. Counting is done by code, as `docs/knowledge-base-plan.md` does for memes.

   Candidates the knowledge base already has (a substring check over every entry's heading and aliases, built on `parseKnowledge` in `src/core/knowledge/entries.ts`; it's what `pnpm learn`'s `known(term)` in the knowledge-base plan will be too), and the topic itself are dropped. A model picks up to 3–5 worth following, each with a reason.

4. **Extend.** Search each picked keyword the same way. `--depth` sets how many levels (default 1: the topic's keywords, not their keywords too). `--max-searches` caps searches per topic (default 6), so one topic can't spread over the whole run.
5. **Write drafts.** It keeps the tree it walked (topic → keyword → posts), so every draft says where it came from. Drafts go to `data/knowledge/pending/<folder>/<date>.md` in the entry format of `docs/knowledge-base-plan.md` (aliases, 类型, 截至, 复查, 来源), to be reviewed like every other draft there; nothing writes the live knowledge base. There are three kinds:
   - a new entry, for a keyword worth knowing;
   - a change to an existing entry, with what changed and the posts that show it;
   - "still right", which moves the entry's `复查` date on. That's the knowledge-base plan's GOV.UK rule: if it's still right, the date moves on.

**`--knowledge`: every topic in the knowledge base.**

- **What it searches:** every `## ` entry in `data/knowledge/` (or the folder given), not `废弃` ones, and not `pending/` or `sources/`. The query is the entry's heading; an alias is used when the heading finds little.
- **Order:** entries whose `复查` date has passed come first, then those with the oldest `截至`, then those it has never browsed.
- **Rotation:** `--max-topics` (default 5) caps how many it does in a run. A small state file keeps when each entry was last browsed, so a daily run goes through the whole knowledge base in turn, not the same five again.
- **What's new:** keywords found this way that the knowledge base lacks are how it grows. A topic's neighbours are what its viewers are likely to say next.

### Processing, cheapest first

Most of what's worth knowing is in the text around a video and what's said in it, not in the picture. So it stops as early as it can:

| Tier | What                                                                                         | Feed                                                 | Streamer's posts                                               | Topic search                       |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| 0    | Metadata from the JSON (title, hashtags, music, stats) and the top ~20 comments. No download | Every item it scrolls past                           | Every post                                                     | Every result on the page           |
| 1    | Audio to transcript                                                                          | Videos watched to the end                            | Every post                                                     | The ~20 posts it reads, per search |
| 2    | 3–8 keyframes (ffmpeg's scene change) to OCR, for captions burned into the picture           | Videos watched to the end                            | Every post                                                     | The ~20 posts it reads, per search |
| 3    | A few frames to Claude                                                                       | Rarely: only when the text doesn't explain the video | When the post is about the stream and the text says too little | Rarely                             |

- **Audio:** tier 1 reuses the speech service's models. `pnpm browse` runs `asr/transcribe.py` in its stdin mode as a second instance, with no `--serve`: it loads its models, prints `{"ready": true}`, and takes one `{"url": …}` after another, printing the sentences and then `{"stream_ended": true}`; the next URL goes only after that, since a new URL while one plays replaces it. Runs happen only when no stream is on (see the rules below), so the GPU is free; the instance is fresh and quits at the end of the run, so the voices it hears in strangers' videos never reach the live service, which remembers voices to tell the streamer from guests. When the sentences score as music (AST's `music` over `speech`), `{"music_id": 1}` asks Shazam for the title and the transcript is skipped.
- **Downloads:** the service downloads a video through the browser's own session (the play URL wants Douyin's cookies and referer), takes the audio and a few frames with ffmpeg, and deletes everything once the client has read it. No video is kept.
- **Resuming:** each video moves through `found → metadata → transcribed → ocr → done`, kept in a small file per day. A crash or a Douyin hiccup halfway costs nothing: the next run picks up where it stopped.

### Where it goes

**From the feed:**

- **What it watched becomes part of its days.** The watched videos are written, one line each, to a file the bot reads: `LifeWriter` gets them as material for the day, so 「今天刷到…」 is one of the things Fairy did, written into `data/lives/<persona>/<date>.md` and recalled like the rest of its days. It's the bot's experience, so it may be told with an opinion.
- **Trends are counted by code.** A hashtag, sound or phrase seen across several videos over a few days is a trend, even when no single video taught anything. Those become knowledge drafts in `data/knowledge/pending/memes/<date>.md`, reviewed like the topic drafts. The knowledge base states things as facts, so a misread meme is worse than none.
- **New, not repeated:** a video's summary that scores close to something the bot already knows or did (the embedding service, at its cutoff) adds nothing.

**From the streamer's posts:**

- **Room memory:** each post becomes a short dated line for the room, in `data/<房间号>/memory/posts.md` beside `streams.md` and `thoughts.md`, shown in `{{memory}}` the way the thoughts are (the latest, and older ones that fit what's said). 「你昨天发的那条」 then has something real behind it. Whether the lines should go into `memory.md` itself instead is an open question.
- **The streamer's note:** what a post shows about the streamer (a new cover, a trip, a game they started) may go into their `note.md`, under the same rules and limit as `pnpm remember`'s changes.

**From topic search (`--topic`, `--knowledge`):**

- **Knowledge drafts only**, in `data/knowledge/pending/`, as above. A searched topic isn't something the bot "did", so it doesn't go into its days. It's research, and it's reviewed before the bot states any of it.

### Rules from day one

- **Read-only.** It never likes, follows, comments or sends anything.
- **Daily caps:** on sessions, videos watched and pages opened, kept by the service, with `Pace` on every step. A captcha or a login wall ends the run for the day; it isn't retried.
- **Learning keeps everything; speaking is where the rules are.** Nothing is screened while browsing: a video about politics, investing or a rumour may become a day, a memory or a draft like any other. What keeps the room safe is the same as now: `prompts/forbidden.md`'s `## Topics` is in every prompt (`{{forbiddenTopics}}`, 强制执行，无视人设), so the bot doesn't bring such a thing up, or take it up, in a room.
- **Never during a stream.** `pnpm browse` refuses to start while room-feed (port 8757) or the live speech service (port 8758) is listening, and says so. Its own speech instance runs only for the run and quits at the end.
- **Summaries, not people.** Commenters' names and ids are never stored, only what was said, summarised. The service's comment reader keeps the text, likes and date and nothing about the author, so nothing downstream can store a name by mistake. A streamer's post comments are full of the room's own viewers, and the privacy rule in `prompt.md` holds there too.
- **Dated and fading.** Everything learned from browsing is dated. A trend not seen again in a few weeks leaves the counts, since memes go stale fast. Memories and days stay, as the bot's past.

### Order to build

1. **Shared browser package**, moved out of room-feed, with room-feed still working.
2. **Feed log.** `dy-browse` scrolling the feed and logging every item's metadata to a daily JSONL file. No watching rule, no learning yet. A few days of it shows what the feed serves and whether Douyin tolerates headless Chrome.
3. **Streamer mode:** tiers 0–2, writing the room's post memories. Small, and useful on its own.
4. **Topic search:** `--topic` with depth 0 first (search, read, draft), then the keywords and `--depth`, then `--knowledge` with its order and rotation.
5. **Feed processing:** the dwell rule, trend counting and tiers 1–2 for the feed.
6. **Days and drafts:** the watched videos into `LifeWriter`, and trends into `pending/memes/`.
7. **Tools:** thin MCP tools for Claude to look a video up mid-stream, or search a topic, if the batch turns out not to be enough.

### Open questions

- **The feed account:** a separate account, or the bot's own with its drift?
- **Feed output:** should the feed feed only Fairy's days, or every persona's? A persona's taste could shape its dwell rule.
- **Where post memories live:** in `memory.md` itself, or in `memory/posts.md` recalled only when it fits (the plan starts with the file).
- **Overlap with `pnpm learn`:** topic search is a new source for the knowledge base, beside B站 and the wiki in `docs/knowledge-base-plan.md`. It could be `pnpm learn --douyin` instead of part of `pnpm browse`; the browser would be the same either way.
- **Review load:** five topics a day, each with a few keywords, is a lot of drafts to review. Should "still right" drafts be applied without review, since they only move a date?

**Decided (2026-11-01):**

- **Fairy browses Douyin herself.** It's her hobby on this side, apart from 六分街. Her life guide (`prompts/personas/fairy/life.md`) and persona (`prompts/personas/fairy/persona.md`) now say so: she may write about videos she really watched, only those given to her, as they are, with her own view, and never moves Douyin's people into 新艾利都. With none given, she writes no Douyin at all.
- **No screening while learning.** Anything may be learned; the forbidden rules apply when the bot speaks, as they do now.
- **Never during a stream.** `pnpm browse` runs only when no stream is on, so its speech instance never shares the GPU with the live one.
- **OCR is Apple Vision**, through the `ocrmac` Python package (macOS's `VNRecognizeTextRequest`, `zh-Hans`, `zh-Hant` and `en`). It's free, fast on Apple Silicon and needs no model download. It's macOS only, which is where the bot runs; RapidOCR is the fallback if that ever changes.

### Implementation plan

The plan follows the order above. Nothing here is built. Every path is as the code has it on 2026-11-01; names for new files follow the repo's `lowercase-hyphen` rule.

#### The shape

Three new workspace packages and one new command:

| Piece                                       | Where          | What it does                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dy-apps/douyin-chrome` (`douyin-chrome/`) | shared package | Finding Chrome, `hideAutomation`, the user agent and flags, `login()`, `LoginFile`, `Pace`, `SerialQueue`. Imported by room-feed and dy-browse.                                                                                                                                             |
| `@dy-apps/dy-browse-protocol`               | shared package | The service's API: `DEFAULT_PORT` (8760), the item, comment, session, search and media types, and `DyBrowseHttp`, the client. Imported by dy-browse and the chat bot. No Node APIs, like `room-feed-protocol`.                                                                              |
| `@dy-apps/dy-browse` (`dy-browse/`)         | service        | Chrome on the separate account, one `SerialQueue` and one `Pace` for every page action, the JSON readers, the feed log, media downloads, daily caps, the HTTP API. Knows nothing of personas, knowledge or memory. Started with `pnpm dy-browse` from the repo root, like `pnpm room-feed`. |
| `pnpm browse`                               | `chat-bot/`    | `src/browse.ts`, the client: asks the service to browse, runs the speech and OCR workers, asks Claude, counts trends, writes drafts, days and post memories. Built by the chat bot's container, like `pnpm remember`.                                                                       |

Ports: 8757 room-feed, 8758 the speech service, 8759 the embedding service, **8760 dy-browse** (`--port` on the service, `--dy-browse-port` on the client). The batch transcriber has no port: it's a child process of `pnpm browse` on stdin and stdout.

**Workspace plumbing.** `pnpm-workspace.yaml` lists the three new folders. Each shared package has `"exports": "./src/index.ts"` and no build; each package that imports one lists it as a `"workspace:*"` dependency (`room-feed` and `dy-browse` → `douyin-chrome`; `dy-browse` and `chat-bot` → `dy-browse-protocol`). None of them is imported by the site, so `SHARED_LIBS` in `frontend/config/vite.config.ts`, `frontend/config/aliases.js` and `frontend/tsconfig.json` don't change. Each new package copies `room-feed/tsconfig.json` and `room-feed/jest.config.js`; `eslint.config.js` adds their `tests/**/*.ts` to the Jest globals list.

**Data layout** (none of it in git; `chat-bot/.gitignore` already ignores `data`, and the root `.gitignore` gets `dy-browse/data`):

```
dy-browse/data/
  cookie.json                 the separate account's login (pnpm dy-browse login)
  login-profile/              the login window's Chrome profile
  feed/<date>.jsonl           every feed item scrolled: tier-0 metadata, what was done with it
  caps/<date>.json            today's counts against the daily caps
  media/<id>/                 audio.m4a and frames/*.jpg, deleted once the client releases them
  screenshots/                the page when something went wrong

chat-bot/data/
  browse/
    state/<date>.json         each video's stage: found → metadata → transcribed → ocr → done
    watched/<date>.md         what the feed session watched, one line a video, for LifeWriter
    trends.json               hashtag, sound and phrase counts by day
    knowledge-visits.json     when each knowledge entry was last browsed (--knowledge rotation)
    searches/<date>/<topic>.json  the tree a topic search walked, for the drafts' 来源
  knowledge/pending/<folder>/<date>.md   drafts (topics/, memes/, douyin/, …)
  <房间号>/memory/posts.md     the streamer's posts as the room remembers them
  <房间号>/browse_posts.txt    the newest post id read, for --streamer's "new since last run"
```

**The command line** (`chat-bot/src/browse-options.ts`, with `node:util`'s `parseArgs` like `cli-options.ts`):

```
pnpm browse [--feed] [--streamer <房间号>] [--topic <词>]… [--knowledge [folder]]
            [--minutes 15] [--max-videos 30] [--depth 1] [--max-searches 6] [--max-topics 5]
            [--into topics] [--dy-browse-port 8760] [--embedding-port 8759] [--model opus]
            [--no-asr] [--no-ocr] [--data data/] [--logs logs/]
```

`--topic` is `multiple: true`. `--knowledge [folder]` is read before `parseArgs` (which has no optional values): a following word that doesn't start with `-` is the folder, else it's the whole knowledge base. `--into` names the pending folder `--topic` drafts go to (`--knowledge` drafts go to their entry's folder). With none of `--feed`, `--streamer`, `--topic`, `--knowledge`, it prints the usage and exits 1. `--streamer` takes a room number (`isRoomId` from `room-feed-protocol`), and the `sec_uid` comes from that room's `room_config.json`.

#### Phase 1: the shared browser package

**Create** `douyin-chrome/` with `package.json` (`@dy-apps/douyin-chrome`, `"exports": "./src/index.ts"`, dependency `playwright-core`, the dev dependencies of `room-feed/package.json`), `tsconfig.json`, `jest.config.js`, and `src/index.ts`.

**Move** with `git mv`, so history follows: `room-feed/src/chrome.ts`, `login.ts`, `login-file.ts`, `pace.ts`, `serial-queue.ts` → `douyin-chrome/src/`; `room-feed/tests/pace.test.ts`, `serial-queue.test.ts` → `douyin-chrome/tests/`. Nothing in them is room-feed-specific: `login()` already takes `profileDir` and a `LoginFile`, and `LoginFile` takes its path, so each service keeps its own `data/cookie.json`. The log lines in `login.ts` say `[room-feed]`; they take a `log` already, so the prefix moves to the caller.

**Change** room-feed: `"@dy-apps/douyin-chrome": "workspace:*"`; the imports in `chrome-rooms.ts`, `main.ts`, `page/live-page.ts`, `chat-box.ts`, `fans-lamp.ts`, `heart-gift.ts`, `like-hold.ts`, `right-panel.ts`, `room.ts` and `server.ts` (whichever import `./pace`, `./serial-queue`, `./chrome`, `./login`, `./login-file`) point at the package. `chrome-rooms.ts`, `page/` and `page-shots.ts` stay: they open the live room. In `eslint.config.js`, the room-feed "steps know nothing of Playwright" list drops `room-feed/src/pace.ts` and the same rule is added for `douyin-chrome/src/pace.ts` and `serial-queue.ts`.

**Tests:** the moved ones, unchanged. room-feed's `chat-box.test.ts` and the other step tests already build a `Pace` with a fake `wait`; only their import changes.

**Done when** `pnpm typecheck && pnpm lint && pnpm test` pass from the root, and `pnpm room-feed --room <房间号>` on a live room still logs `登录的抖音账号：…` and sends a chat.

**Risks:** small. `eslint-plugin-import-x`'s resolver needs the package's `exports` to resolve `src/index.ts`, as it does for `room-feed-protocol`.

#### Phase 2: the `dy-browse` service and the feed log

**Create** `dy-browse-protocol/` (`src/api.ts`, `src/http-client.ts`, `src/index.ts`) and `dy-browse/` (dependencies `@dy-apps/douyin-chrome`, `@dy-apps/dy-browse-protocol`, `playwright-core`, `tsx`; scripts `start`, `typecheck`, `test`), and the root script `"dy-browse": "pnpm --filter @dy-apps/dy-browse start"`.

The protocol's types, in `dy-browse-protocol/src/api.ts`:

- `BrowseItem`: `id`, `url`, `desc`, `hashtags`, `music: { title, author } | null`, `author: { nickname, secUid }`, `stats: { likes, comments, shares }`, `durationMs`, `kind: 'video' | 'images' | 'live' | 'ad' | 'shop'`, `postedAt`. The author is the poster, who is public; never a commenter.
- `Comment`: `text`, `likes`, `postedAt`. No author field exists, by design.
- `FeedSession`: `id`, `startedAt`, `done`, `items: (BrowseItem & { action: 'skipped' | 'watched' | 'watchedWithComments'; dwellMs; comments?: Comment[] })[]`.
- `StatusAnswer`: `loggedIn`, `account: { uid, nickname } | 'loggedOut' | null`, `session: FeedSession['id'] | null`, `caps: { sessions, videos, pages }` with today's counts and limits.
- `MediaAnswer`: `audio: string | null`, `frames: string[]` (local paths), `expiresAt`.
- `ErrorAnswer`, `DEFAULT_PORT = 8760`, `browseUrl(port, path)`.

`DyBrowseHttp` in `http-client.ts` takes `{ port, fetch = globalThis.fetch }` and has one method per route; the chat bot's adapter wraps it.

The service, in `dy-browse/src/`:

- `main.ts`: hand-wired, as `room-feed/src/main.ts` is (only the chat bot uses the container, per the repo's AGENTS.md). `DATA_DIR = dy-browse/data/`. `pnpm dy-browse login` calls `login()` from `douyin-chrome` with `data/login-profile/` and `new LoginFile(join(DATA_DIR, 'cookie.json'))`, then exits. Otherwise it builds `BrowseChrome`, `FeedLog`, `DailyCaps` and the server, listens on `--port`, logs `[dy-browse] 已启动：端口 8760`, and on SIGINT closes the page, the browser and the server.
- `cli-options.ts`: `login | serve`, `--port 8760`, `--chrome <path>`, `--headed`, as room-feed's.
- `browse-chrome.ts`: `BrowseChrome` like `ChromeRooms`: `{ executablePath, headless, cookie: () => string | null, shotsDir?, random? = Math.random }`; `open(): Promise<DouyinPage>` launches Chrome on first use (`BROWSER_ARGS`, `USER_AGENT`, `hideAutomation`, the cookies), one context, one page.
- `page/douyin-page.ts`: `DouyinPage`, like `LivePage`: builds one `Pace` from `page.waitForTimeout` and `random`, one `SerialQueue`, the surfaces and the `page.on('response')` readers (`isFeedAnswer(url)` → `readFeedAnswer`, `isCommentsAnswer(url)` → `readComments`). Also reads the page's own "who am I" call for `StatusAnswer.account`, as room-feed does with `webcast/user/me/` (the douyin.com call's name is confirmed in the Network tab on day one).
- `page/feed-surface.ts`: `PageFeedSurface implements FeedSurface`: `waitForPlayer()`, `goToNext()` (the key or wheel the page map says moves to the next video), `waitForCommentButton()`, `clickCommentButton()`, `commentsShown()`, `clickCloseComments()`, `scrollComments()`. One `waitFor…` and one `click…` per target, selectors from `douyin/page-map.ts`, no pauses, no decisions.
- `douyin/page-map.ts`: douyin.com's selectors, `VIEWPORT`, `PAGE_WAIT`, and the URL tests for the JSON calls. Separate from room-feed's map: a different site.
- `douyin/feed-answer.ts`, `douyin/comments-answer.ts`: pure readers from the JSON bodies to `BrowseItem[]` and `Comment[]`. `readComments` copies three fields and nothing else.
- `feed-scroller.ts`: `FeedScroller` (steps, no Playwright): `new FeedScroller(surface, { pace, dwell, now = Date.now })`, `run({ minutes, maxVideos }, onItem)`. For each item the reader announced: `dwell.decide(item)` → `skip | watch | watchWithComments` and a dwell time; it waits that long with `pace.wait`, opens the comments as a step (`pace.step(waitForCommentButton, clickCommentButton)`), closes them as a step, and moves on as a step. In this phase `dwell` is `fixedDwell(3000–6000)`: a steady scroll with no watching rule yet.
- `core/dwell.ts`: the `DwellRule` interface and `fixedDwell`; the real rule comes in phase 5.
- `core/caps.ts`: `DailyCaps` (`{ limits, today: () => string, store }`): `take('videos')` returns false once today's limit is reached; the store is `data/caps/<date>.json`.
- `feed-log.ts`: `FeedLog` appends one JSON line per item to `data/feed/<date>.jsonl` (`append` injected).
- `server.ts`: `createBrowseServer({ page, log, caps, ... })` with routes `GET /api/status`, `POST /api/feed/sessions { minutes, maxVideos }` → `{ id }` (409 while one runs), `GET /api/feed/sessions/<id>` → `FeedSession` so far, `GET /api/feed/items?date=` from the log. Every page action goes through the page's `SerialQueue`. A captcha or login wall (`page-map.ts` knows their selectors) ends the session, logs `[dy-browse] 抖音要求验证，今天到此为止`, and `StatusAnswer` says `blocked: true` until midnight.

**Tests** (`dy-browse/tests/`, Jest, fakes only): `feed-answer.test.ts` and `comments-answer.test.ts` over trimmed fixtures saved from a real session with ids and avatars blanked; the comments test asserts the output has no `uid`, `nickname` or `avatar` keys at any depth. `feed-scroller.test.ts` with a fake surface that logs what it's asked and a `Pace` with a fake `wait`, checking the order `wait for player`, `wait 500`, `click comments`, …, and that it stops at `maxVideos` and at `minutes`. `caps.test.ts` with a fake `today`. `server.test.ts` over a fake page, as room-feed's `server.test.ts` does. `cli-options.test.ts`.

**Done when** `pnpm dy-browse login` writes `dy-browse/data/cookie.json`; `pnpm dy-browse` logs `已启动` and `登录的抖音账号：…`; `curl -X POST localhost:8760/api/feed/sessions -d '{"minutes":2}'` runs two minutes and `data/feed/<date>.jsonl` has lines with `desc`, `music` and `stats`; and three days of one session each pass with `GET /api/status` never saying `blocked`.

**Risks:** the feed's endpoint and fields are what the Network tab shows that day, so the readers are written against saved samples and may need a fix when Douyin changes them; headless Chrome may be told apart from a headed one (then `--headed` is the fallback, as in room-feed); the web feed may need a click to start playing, a step like room-feed's player click.

#### Phase 3: streamer mode

**The `sec_uid`.** The bot learns the streamer from room-feed's `GET /api/rooms/<房间号>` (`meta`, a `RoomMeta` with `secUid`): `RoomFeedApi.streamer` (`src/adapters/room-feed/room-feed-api.ts`) returns `{ uid, nickname }` to `StreamerAdmin`, whose `onFound` in `wiring/room.ts` writes `streamer: { nickname, uid }` into the room's `room_config.json` with `saveAccount` (`src/adapters/files/room-files.ts`). `FindStreamer` (`src/app/ports.ts`), `saveAccount` and `RoomConfig.streamer` (`src/core/room/room-config.ts`) gain an optional `secUid`, written when room-feed gives one. `pnpm browse --streamer` reads it from there, and without it stops with `the streamer's sec_uid isn't known: start the bot in that room once`, as `buildContainer` does for the bot's account.

**Service** (`dy-browse/src/`): `page/user-surface.ts` (`waitForPosts()`, `scrollPosts()`, `clickPost(index)`, `waitForPlayer()`, `clickBack()`), `user-posts.ts` (`UserPosts`, steps: open `douyin.com/user/<secUid>`, read the post-list JSON as the grid loads, scroll until `max` posts or one at or before `since`, open each as a step to make the page fetch its comments, close it), `douyin/post-list-answer.ts`, `media.ts` (`MediaStore`: downloads the play URL through `context.request` with the page's cookies and referer into `data/media/<id>/`, runs ffmpeg for `audio.m4a` and up to 8 frames at scene changes, deletes a folder on release or after an hour; `ffmpeg` and `now` injected). Routes: `GET /api/users/<secUid>/posts?since=<id>&max=5`, `POST /api/media/<id>`, `DELETE /api/media/<id>`.

**Client** (`chat-bot/src/`):

- `browse.ts`, `browse-options.ts`, and `wiring/browse.ts` with `buildBrowseContainer({ options, packageDir, log, env })`. It registers the tokens below and reuses the factories that don't need a room (`LOG`, `PROMPTS_DIR`, `EMBEDDER`, `VECTORS`, `LIFE`); it registers its own `ASK_CLAUDE` (`claudeCli` without a room's read dirs, tasks `browse-posts`, `browse-topic`, `browse-memes`) because `registerAdapters`' `CLAUDE_CLI` resolves `CHAT_DIR` and `MEMORY`. For `--streamer` it builds that room's `fileMemory(...)` and `postsFile(...)` with the same calls `wiring/room.ts` uses. New tokens in `wiring/tokens.ts`: `BROWSE_OPTIONS`, `DY_BROWSE`, `BATCH_TRANSCRIBER`, `OCR`, `VIDEO_READER`, `POSTS`, `STREAMER_POSTS`, `TOPIC_SEARCH`, `KNOWLEDGE_RUN`, `FEED_LEARNER`, `TREND_DRAFTS`.
- `app/ports.ts`: `DouyinBrowse` (`status()`, `userPosts(secUid, { since, max })`, `media(id)`, `release(id)`; later `search`, `startFeed`, `feedSession`), `BatchTranscriber` (`transcribe(path): Promise<{ sentences: string[]; song: { title, artist } | null }>`, `close()`), `Ocr` (`read(images): Promise<string[]>`), `Posts` (like `Thoughts`: `recent(count)`, `all()`, `add(date, entries)`), `PostsMark` (`get()`, `set(id)`).
- `adapters/dy-browse/dy-browse-api.ts`: `DouyinBrowse` over `DyBrowseHttp`.
- `adapters/asr-batch.ts`: `spawnBatchTranscriber({ asrDir, spawn = child_process.spawn, log })`: `uv run --directory <asrDir> transcribe.py` with piped stdio, waits for `{"ready": true}`, serialises requests: writes `{"url": "<path>"}`, collects sentence lines until `{"stream_ended": true}`; when most sentences have `music` above `speech`, writes `{"music_id": n}` and takes the title; `close()` writes `{"quit": true}`. The live `--serve 8758` instance is never contacted.
- `adapters/ocr-worker.ts` and `chat-bot/ocr/` (a uv project running Apple Vision through `ocrmac`, languages `zh-Hans`, `zh-Hant`, `en`), same one-line JSON protocol: `{"image": "<path>"}` in, `{"lines": [{"text", "confidence"}]}` out; `null` with `--no-ocr`, and on a machine that isn't macOS, with a warning.
- `adapters/files/posts-file.ts` (`postsFile(path)`, a copy of `thoughtsFile`'s shape for `memory/posts.md`), `adapters/files/browse-files.ts` (`browseState(dir)` for `state/<date>.json`, `postsMark(roomDir)` for `browse_posts.txt`).
- `app/browse/video-reader.ts`: `VideoReader` (`{ browse, transcriber, ocr, state, log }`): tiers 1–2 for one item, each stage written to the state file as it completes, so a rerun skips what's done; releases the media in `finally`.
- `app/browse/streamer-posts.ts`: `StreamerPosts` (`{ browse, reader, ask, promptTemplate, memory, posts, mark, streamer: { secUid, nickname, uid }, isPrivate, log, olderPerRun = 3 }`), extending `ModelFeature` as `LifeWriter` does. It reads the new posts since the mark, then up to `olderPerRun` older ones, reads tiers 1–2, then asks Claude (`prompts/browse-posts.md`) for one line per post and any changes to the streamer's note, in the JSON shape `remember-room.md` uses. Lines go to `posts.add(date, lines)`; note changes through `memory.changeAll({ scope: 'note', userId: streamer.uid }, changes, writer)` with the same writer `RememberChat` uses, so the limit and the archive apply. Then `mark.set(newestId)`.
- Prompt side: `MemoryRecall` (`src/app/memory/memory-recall.ts`) gains a `posts` source like `thoughts` (latest 3, plus older ones that fit, at the model's cutoff), and `RoomState` (`src/app/room/room-state.ts`) puts them after the thoughts in `{{memory}}`, under a `wording.md` line that says they're the streamer's posts.

**Tests:** `tests/app/browse/streamer-posts.test.ts` with a fake `DouyinBrowse` (posts and comments in memory), a fake reader, a scripted Claude answer and `tests/support/fake-memory.ts`: new posts first, older ones capped, the mark set, no post read twice. A 私密 case: `isPrivate: () => true`, comments whose text contains `@苦***` and viewer-like names, and the assertions that only `posts.add` and the streamer's note were written, no viewer note, and no comment author appears anywhere (the fake's comments have none to begin with; the test feeds names in the text to make sure the prompt asks for summaries and the stored lines carry none back). `tests/adapters/asr-batch.test.ts` with a fake `spawn` that prints `ready`, sentences, `stream_ended`, and a `music_id` answer, checking requests go one at a time. `tests/adapters/files/posts-file.test.ts`. In dy-browse, `post-list-answer.test.ts` and `user-posts.test.ts` (steps order, `since` stopping the scroll).

**Done when** `pnpm browse --streamer 416362684969` logs `posts read {new, older}`, `memory updated {by: "browse"}` lines, and `data/416362684969/memory/posts.md` gains dated lines; a second run logs `posts read {new: 0, older: 3}`; `dy-browse/data/media/` is empty afterwards; and in the next stream `{{memory}}` shows the post lines (visible in the prompt in `logs/chat-bot.log`).

**Risks:** the play URL may refuse the download even with cookies (then tier 1 falls back to the page's own playback, recorded through the browser, which is slower); a streamer with hundreds of posts (the `olderPerRun` cap and the mark keep it to a few a day).

#### Phase 4: topic search

**4a, depth 0.** Service: `page/search-surface.ts` (`waitForSearchBox()`, `clickSearchBox()`, `typeAndSearch(topic)`, `waitForFilter(name)`, `clickFilter(name)`, `waitForResults()`, `relatedSearches()` when they're only in the HTML), `search.ts` (`TopicSearch`, steps: click the box, type, Enter, 最热 as a step, read the JSON, 最新 as a step, read, open each result as a step for its comments), `douyin/search-answer.ts`, route `GET /api/search?q=<topic>&max=10` → `{ hot: BrowseItem[], newest: BrowseItem[], related: string[], comments: Record<id, Comment[]> }`. Client: `app/browse/topic-search.ts` (`TopicSearcher`: `{ browse, reader, ask, promptTemplate, known, forbiddenTopics, drafts, searches, log, depth = 1, maxSearches = 6, maxKeywords = 4 }`), `core/knowledge/index.ts` (`KnowledgeIndex` with `known(term)`: a substring check over headings and aliases, built on `parseKnowledge`; `entriesDue()` for 4c), `adapters/files/knowledge-files.ts` gains `knowledgeTree(dir)` (every folder but `pending/` and `sources/`, each entry with its folder) and `parseKnowledge` gains the meta lines it drops today (`类型`, `截至`, `复查`) as an optional `meta` on `KnowledgeEntry`, left out of the prompt text as now. `app/browse/draft-writer.ts` appends entries in the knowledge-base plan's format to `pending/<folder>/<date>.md`: `aliases`, `类型`, `截至: 2026-11`, `复查` a month on, `来源: https://www.douyin.com/video/<id>（2026-11-01 刷到）` one line per post that showed it; a change draft quotes the current entry; a "still right" draft is `## 复查：<heading>` with the new date. `prompts/browse-topic.md` asks for `{ drafts, keywords: [{ term, why }] }` as JSON, through `askJson`.

**4b, keywords and depth.** `core/browse/keywords.ts`: candidates from hashtags, related searches and phrases repeating across titles, comments and transcripts (2–6 character n-grams counted by code, a term counting once per post), minus `known`, the topic, and stop words; Claude picks up to `maxKeywords`. `core/browse/search-tree.ts`: the walk (breadth first, `depth` levels, `maxSearches` per topic), kept in `searches/<date>/<topic>.json` and quoted in each draft's 来源.

**4c, `--knowledge`.** `app/browse/knowledge-run.ts`: `KnowledgeRun` (`{ index, searcher, visits, now, maxTopics = 5 }`) orders entries as the design says (`复查` passed, then oldest `截至`, then never visited), takes `maxTopics`, searches by heading, by the first alias when the heading returns under 3 results, and writes `knowledge-visits.json` (`"<folder>/<heading>": <ms>`).

**Wiring:** `TOPIC_SEARCH` and `KNOWLEDGE_RUN` in `wiring/browse.ts`; `browse.ts` runs them for each `--topic` and for `--knowledge`.

**Tests:** `tests/core/browse/keywords.test.ts` (counting once per post, dropping known and the topic), `search-tree.test.ts` (depth and caps), `tests/core/knowledge/index.test.ts`, `tests/app/browse/topic-search.test.ts` (fake browse, fake Claude; the draft file's text has the five meta lines and no commenter's name), `knowledge-run.test.ts` (order and rotation over a fake clock and visits file); dy-browse `search-answer.test.ts` and `search.test.ts` (steps order: `wait for search box`, `wait 500`, `click search box`, `type 鸣潮 and search`, `wait for filter 最热`, …).

**Done when** `pnpm browse --topic 鸣潮` logs `topic searched {topic, hot, newest, keywords}` and `drafts written {file, count}`, and `data/knowledge/pending/topics/<date>.md` reads as entries; `--depth 1 --max-searches 6` logs at most six `topic searched` lines for one topic; `pnpm browse --knowledge douyin --max-topics 2` logs two `knowledge topic {heading, why}` lines and the next run picks two others.

**Risks:** a login wall after a few searches on a fresh account (the service's `blocked` ends the run); the related searches living only in the HTML; the review load the open question names.

#### Phase 5: feed processing

**Service:** `core/dwell.ts` gets `randomDwell({ random })`: `ad`, `live` and `shop` skipped at once; otherwise about half skipped after 1–3 s, four in ten watched to the end (capped at 3 minutes), one in ten watched with the comments opened; `images` watched for 5–10 s. `FeedScroller` honours the session's `minutes` and `maxVideos` and `DailyCaps`. `DELETE`-on-release and the hourly sweep from phase 3 cover the feed's media too.

**Client:** `app/browse/feed-learner.ts`: `FeedLearner` (`{ browse, reader, ask, watched, trends, known, embedder, log }`): starts a session, polls it every few seconds, runs `VideoReader` on the items watched to the end, writes `watched/<date>.md` (one line a video: what it was, with its id and the sound's title), and feeds `core/browse/trends.ts` (`countTrends`: hashtags, sounds and repeated phrases by day in `trends.json`; a term seen in 3 or more videos on 2 or more days is a trend; terms unseen for 21 days drop out). The novelty check uses `Embedder` from `EMBEDDER` and `similarity` from `src/core/memory/recall.ts` against the existing knowledge texts and recent days.

**Tests:** `dwell.test.ts` (random 0, 0.5 and 0.99 take each branch; ads never watched), `tests/core/browse/trends.test.ts`, `tests/app/browse/feed-learner.test.ts` (fake browse with a scripted session, fake reader, and a run refused while port 8757 or 8758 is listening).

**Done when** `pnpm browse --feed --minutes 10` logs `feed session {watched, skipped, comments}` and writes `data/browse/watched/<date>.md` and `trends.json`; `dy-browse/data/media/` is empty after; a week of daily runs shows the feed's mix in `feed/<date>.jsonl` not collapsing to one kind.

**Risks:** the meme bubble; a run's length (tier 1 takes about a quarter of a video's length on the GPU, so 30 videos is a few minutes, not an hour); captchas mid-session.

#### Phase 6: LifeWriter and drafts

**LifeWriter:** `LifeWriterOptions` gains `watched?: (date: string) => string` (port `Watched` in `app/ports.ts`, adapter `adapters/files/watched-files.ts` over `data/browse/watched/`), and `prompts/life.md` a `{{watched}}` block: today's and yesterday's lines, with an instruction that they're real, may be one of the day's things with her view on it, and are skipped when empty (`（没有）`). `wiring/life.ts` passes the adapter. The timing is that of the bot: it writes the day on its first tick that day, so `pnpm browse --feed` runs before the stream (a cron or by hand), and a day already written doesn't change. Settle the "Fairy's world" open question first; whichever way, the change is a line in `prompts/personas/fairy/life.md` or a second heading in the day file, not code.

**Trend drafts:** `app/browse/trend-drafts.ts`: `TrendDrafts` (`{ trends, known, embedder, ask, promptTemplate, drafts, log }`) takes the trends not in the knowledge base, asks Claude (`prompts/browse-memes.md`) for one entry each from the videos' text (a meaning it can't give from the material is `不确定`, and such a draft is marked so), and writes `pending/memes/<date>.md` with `类型: 社区观点` or `事实`, `截至: 2026-11`, `复查` a month on, and three video ids as 来源. Run at the end of `--feed`.

**Tests:** `life-writer.test.ts` gains a case where `watched` returns lines (they appear in the prompt) and one where it returns nothing (the prompt says `（没有）`); `tests/app/browse/trend-drafts.test.ts` with a fake embedder whose vector for one trend is near an existing entry (that trend is skipped).

**Done when** after `pnpm browse --feed` the bot's `claude asking {task: 'life'}` prompt (debug in `logs/chat-bot.log`) carries the watched lines and `life: wrote today` logs a day that mentions one; after a week `data/knowledge/pending/memes/<date>.md` exists with sourced entries.

**Risks:** an opinion made up about a real video that a viewer then checks (the prompt asks for her view, not for facts the video didn't show); days that become a list of videos (cap `{{watched}}` at 5 lines, and `life.md` already asks for 2–3 things).

#### Phase 7: MCP tools

**Client only.** `app/tools/search-douyin.ts` (`search_douyin { query }`: the hot and newest titles with their sounds and stats, and the comments summarised by count and theme, tier 0 only, cached a day per query like the knowledge-base plan's `search_game`) and `app/tools/look-up-video.ts` (`look_up_video { url }`: one item's description, sound, stats and summarised comments). Both take the `DouyinBrowse` port and a `log`, and return `isError` with a plain sentence when the service doesn't answer. `wiring/tokens.ts` gains `DY_BROWSE` (`DouyinBrowse | null`, null with `--dy-browse-port 0` in `cli-options.ts`), `wiring/adapters.ts` registers it, and `wiring/mcp.ts` adds the two tools to `TOOLS` when it isn't null. `docs/commands.md`'s tools table gets their rows, and `prompt.md` nothing: the descriptions tell Claude when to call them.

**Service:** the search and lookup routes exist from phases 3 and 4; a tool's request takes its turn in the `SerialQueue` behind at most one step of a running feed session, so it isn't blocked for the session's length.

**Tests:** `tests/app/tools/search-douyin.test.ts` and `look-up-video.test.ts` with a fake `DouyinBrowse`: the text has no commenter names; a failing fake gives `isError`. `tests/wiring/wiring.test.ts` registers a fake `DY_BROWSE` and checks `TOOLS` lists both, and that `--dy-browse-port 0` lists neither.

**Done when** the log shows `mcp tool {tool: "search_douyin", ms}` under 15 s and a `claude answered` with `tools: [{tool: "search_douyin"}]` in a real room.

**Risks:** latency in a live answer (the tool is tier 0 by design, and the description tells Claude it's slow); the service being down during a stream (the tool answers `isError`, and Claude says it couldn't look).

## Sources

- [Proactive Conversational Agents with Inner Thoughts (CHI 2025)](https://arxiv.org/abs/2501.00383v2)
- [Generative Agents: Interactive Simulacra of Human Behavior](https://ar5iv.labs.arxiv.org/html/2304.03442)
- [Generative Agents memory stream pattern](https://agentpatterns.ai/patterns/agent-design/generative-agents-memory-stream/)
- [LoCoMo: Evaluating Very Long-Term Conversational Memory](https://snap-research.github.io/locomo/)
- [PersonaLife (GitHub)](https://github.com/GermanAutodidact/PersonaLife)
- [Hello Again! LD-Agent for long-term dialogue](https://arxiv.org/pdf/2406.05925)
- [AutoPersonas: open-ended persona evolution](https://arxiv.org/pdf/2607.08252)
- [Do AI Personas Grow? Life events benchmark](https://arxiv.org/html/2608.06485v1)
- [Enhancing User-Oriented Proactivity in Open-Domain Dialogues (IJCAI 2025)](https://www.ijcai.org/proceedings/2025/0919.pdf)
- [Dynamic In-Group Persona Generation for Human–AI Rapport](https://arxiv.org/html/2606.18256v1)
- [Effect of a Chatbot's Reciprocal Self-Disclosures](https://aodr.org/xml/38536/38536.pdf)
- [Long-Term Memory and Self-Disclosure (CHI 2024)](https://depstein.net/assets/pubs/ejo_chi24.pdf)
- [A Survey on Proactive Dialogue Systems (IJCAI 2023)](https://www.ijcai.org/proceedings/2023/0738.pdf)
- [Aiming to Know You Better… More Engaging Dialogue Partner](https://arxiv.org/pdf/1808.07104)
- [ConvAI2 challenge report](https://arxiv.org/pdf/1902.00098)
- [Conversation Initiation by Diverse News Contents Introduction](https://liner.com/review/conversation-initiation-by-diverse-news-contents-introduction)
