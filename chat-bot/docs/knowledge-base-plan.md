# A knowledge base for Douyin and memes

## The problem

The bot answers with what's in the room, its memory and what the model already knows. The model knows little about how Douyin streaming works (fan lamps, PK, 连麦, gift etiquette, the room's slang) and nothing about memes newer than its training data. When a viewer says `家人们谁懂啊` or asks what a trending phrase means, the bot guesses, often wrongly and with confidence.

We want two things:

1. **Lookup:** when a meme or Douyin term comes up in the room, the bot already knows what it means, without slowing down the reply.
2. **Learning:** a separate agent browses Douyin by itself and drafts new entries, so the knowledge keeps up with new memes.

The knowledge is small: a few hundred short entries, not a document library. That rules out a vector database and most of a standard RAG setup.

## The entries

Short Markdown entries in the repo, one `##` per term:

```md
## 家人们谁懂啊

aliases: 谁懂啊, 家人们
来源: https://www.douyin.com/video/… (2026-10-31 学到)
用来吐槽离谱的事，语气夸张。直播间里常接在一段离谱经历后面。别用在正经安慰人的时候。
```

- `prompts/knowledge/douyin.md`: how Douyin streaming works (fan lamps, gifts, PK, 连麦, room rules).
- `prompts/knowledge/memes.md`: memes and slang.
- `aliases` lists other ways people write the same thing, including common speech-to-text typos.
- Learned entries keep their sources and the date they were learned, so stale ones can be found and removed.

They're edited by hand, reviewed in git, and in the same format as the personas, `life.md` and `thoughts.md`.

## Lookup

### Matching on words, put into the prompt

A meme is a fixed phrase, so matching is a plain substring check of each term and its aliases against the room's recent chat and the streamer's speech. It needs no model and adds no delay. Embeddings are worse at this: they blur fixed phrases into similar but wrong matches.

It works the way `MemoryRecall` does for memories: when the room says something, check the terms, and put the 1–3 entries that matched into the next prompt. The model then knows what a meme means without having to think of looking it up. This covers most of what we need.

If all the knowledge together stays under ~10–20k characters, the simplest option is to put the whole file into the persona prompt and skip matching. Matching is for once it grows past that.

### A `search_knowledge` tool

This is for questions that don't say the term word for word, such as "那个……的梗是什么意思" or "粉丝灯牌怎么点亮". It's an MCP tool on the bot's existing server, next to `update_memory`:

- It takes `{ query, max? }` and returns entries with their file and heading.
- It does the substring check first, then falls back to the Qwen3 embedding service (`embedding/serve.py`) for fuzzy matches, reusing `vectorFiles` and `recalled()` from `core/memory/recall.ts`.
- The embedding fallback needs its own task instruction ("find the knowledge entry that answers this question") and its own cutoff, measured with `embedding-eval`.
- Without the embedding service it falls back to keyword search only, as memory recall does.

Add this only if matching into the prompt turns out not to be enough.

### Where embeddings are and aren't used

| Where                                | Embeddings? | Why                                                                 |
| ------------------------------------ | ----------- | ------------------------------------------------------------------- |
| Matching heard text into the prompt  | No          | Memes are fixed phrases, and a substring check is exact and instant |
| `search_knowledge` fallback          | Yes         | Viewers describe a meme instead of quoting it                       |
| The learning agent's duplicate check | Yes         | Whether a meme is already known under another wording               |

## Learning: `pnpm learn`

A batch job like `pnpm remember`, run once a day and never during a live room. It runs `claude -p` with a small MCP server of its own.

### Narrow read-only tools, not a general browser

Handing Claude a general browser (Playwright MCP or Chrome) on Douyin uses a lot of tokens, breaks easily and might click things it shouldn't. It gets a few tools instead:

| Tool             | Returns                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `hot_list()`     | Douyin's trending list (热榜): titles and heat                              |
| `search(query)`  | Top videos for a term: title, description, hashtags                         |
| `video(id)`      | Description, hashtags and the top ~50 comments                              |
| `known(term)`    | Whether the knowledge base already has it (substring, then embedding check) |
| `propose(entry)` | Saves a draft entry, with the video links it came from                      |

Behind them:

- `playwright-core`, which room-feed already depends on, with room-feed's wait, pause, act pacing (`room-feed/AGENTS.md`). The tools only read and never click like, follow or comment.
- A **separate browser profile, logged out or on a throwaway account,** so the streaming account never takes the anti-bot risk.
- Text only to start. Comments are where meme meanings show up. Speech-to-text of the videos (`asr-worker`) can come later.

### What it looks up

1. **Phrases the rooms didn't understand:** ones that keep coming up in the room transcripts with no matching entry. This is the most useful source, because it targets what our viewers actually say.
2. **The trending list,** for new memes.

### Where its output goes

- Drafts go to `data/knowledge/pending/<date>.md`, each with its sources and the date it was learned.
- An entry has to cite the videos or comments it came from, so a meaning the model made up has nothing to point to.
- At first, a person reviews the drafts and moves them into `prompts/knowledge/`. The bot states things confidently in the room, so a wrong meaning is worse than none. Once the drafts prove reliable, entries with enough agreeing sources could be accepted automatically.

## Where the code goes

Following the repo's AGENTS.md (dependencies passed in, wired in the container, no `jest.mock`):

- `core/knowledge/`: parsing entries and matching terms. These are pure functions.
- `app/knowledge/knowledge-base.ts`: takes the entries reader, an `Embedder` and a `VectorCache` as constructor options.
- `app/knowledge/knowledge-recall.ts`: listens to the room and keeps the matched entries for the next prompt, like `MemoryRecall`.
- `adapters/files/knowledge-files.ts`: reads `prompts/knowledge/` and the pending drafts.
- `app/tools/search-knowledge.ts`, plus a token and factory in `wiring/`.
- `src/learn.ts` (`pnpm learn`), with its browser tools in `adapters/douyin/` behind a surface interface, so tests use a fake page.

## Order of work

1. Entries file with a first set of hand-written entries, the term matcher, and putting matches into the prompt.
2. `search_knowledge`, if step 1 isn't enough.
3. `pnpm learn`: the transcript miner first (no browser needed), then the Douyin tools.

## Risks

- Douyin's captcha and login walls will sometimes stop the browser tools. `pnpm learn` should then stop for the day, not retry.
- Scraping Douyin may break its terms of service, so keep it low-volume and slow.
- Memes go stale and change meaning. The learned date on each entry lets old ones be reviewed.
