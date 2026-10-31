# A knowledge base for Douyin, memes and games

## The problem

The bot answers with what's in the room, its memory and what the model already knows. The model knows little about how Douyin streaming works (fan lamps, PK, 连麦, gift etiquette, the room's slang), nothing about memes newer than its training data, and little about the games a room plays. When a viewer says `家人们谁懂啊` or `鲨狼苍还能打吗`, the bot guesses, often wrongly and with confidence.

We want two things:

1. **Lookup:** when a term comes up in the room, the bot already knows what it means, without slowing down the reply.
2. **Keeping up:** new gifts, memes and game versions reach the bot without anyone typing them in.

## What goes in the knowledge base, and what doesn't

Not everything the bot needs to know belongs in a file. What changes by itself, with no clear moment when it changed (which team is popular, what's on a banner this week), is better looked up when someone asks. The knowledge base keeps what a lookup can't do:

- **Recognising a term nobody asked about.** The model only searches when it knows it doesn't know. If chat says `鲨狼苍` or speech-to-text hears `决区零`, it guesses. A list of names, aliases and codes matched by substring is the only thing that catches them, and it is also what makes a search work: you can't search for `鲨狼苍` until you know it means 艾莲 + 莱卡恩 + 苍角.
- **Being fast.** A search and a fetch add seconds to every reply. What's needed in passing, all the time, must already be in the prompt.
- **What isn't online.** The streamer, the room, what these viewers call things.
- **Not repeating a mistake.** Whatever is in the prompt usually wins (see [Research](#research)), so a claim that turned out wrong is kept, with the reason, so it isn't learned again.

## One strategy per topic

| Topic            | Where it comes from                                                | How it stays current                                                            | Looked up when asked?                        |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------- |
| Douyin platform  | Written by hand, plus what room-feed observes                      | Gifts and levels refresh from room-feed by code; the rest is reviewed by hand   | No: needed all the time, little of it online |
| The rooms        | Room transcripts and room-feed                                     | By code, per room                                                               | No                                           |
| Memes and slang  | Meme dictionaries, Douyin, the transcripts                         | A lease: kept while people keep using it, dropped when they stop                | Only as a fallback                           |
| Games (绝区零 …) | A glossary from the game's wiki: names, aliases, team codes, facts | Refreshed when a new version comes out                                          | Yes: teams, banners, events, codes, news     |
| News             | Official sources                                                   | Not stored, except one line with the game's current version and its date, daily | Yes                                          |

### Douyin: detailed and hand-written at its core

The Douyin core is built: `data/knowledge/douyin/` (fan club, PK, the room's features; it began as `prompts/common-knowledge.md`, and is in `prompt.md` as `{{commonKnowledge}}`), read live, all of it in every prompt while it's small and the entries that fit what's said once it isn't (`KnowledgeRecall`), with how to thank gifts in `gift-thanks.md` and what the bot must never say in `forbidden.md`. It grows there, not in new files, and a new entry adds only what those don't already cover.

The bot lives on Douyin and acts on it (it likes rooms, sends 灯牌 and 小心心, thanks gifts), so getting Douyin wrong means doing the wrong thing, not just saying it. Douyin's rules are scattered across help pages and its etiquette is mostly unwritten, so there's little to look up. But room-feed already reports every gift's name and diamond value and viewers' fan-club and wealth levels (`room-feed-protocol/src/events.ts`), so much of it comes from the bot's own data:

- **Gifts:** not entries. The bot is told each gift's name and value as it comes, `/自动谢礼` decides in code when to thank, and `gift-thanks.md` how. A catalogue from the transcripts' `(gift)` lines (unit price, first and last seen; room-feed reports a send's total, `×6（54钻）`, so the unit price is the total divided by the count) is data for code, such as spotting new or seasonal gifts, not prompt text. Only gifts that aren't ordinary gifts get an entry, like the 0钻 PK cards.
- **Fan clubs and wealth levels:** the levels from the chat lines (`灯牌3`, `财富6`); what they mean, by hand.
- **Live features and etiquette,** by hand: PK and its props, 连麦, 福袋, 红包, 榜单, 人气票, 房管, thanking gifts, what's rude (刷屏, 引流).
- **Platform rules the bot must follow,** from Douyin's official rule pages, re-read now and then: no outside links or contact details, nothing that pressures people to gift, minors and gifting, and anything on AI or automated accounts. Breaking these costs the account.
- **Each room's own rules and habits,** which may overlap with the bot's memory and `room_config.json`.

### Games: a thin glossary, everything else looked up

A game's names and facts are fixed phrases that a matcher catches well. Its opinions drift: which team is popular, who's strong. They change with no clear moment, weeks after the agent that replaces them comes out, and keeping them current would mean re-measuring them all the time. So the knowledge base keeps:

- every agent, faction and term, with Chinese and English names, nicknames, team codes (`鲨狼苍`, the one-character codes like `琉` `妮`) and speech-to-text typos as aliases;
- one line of facts each (faction, element, role), which change only with a rework;
- the current version and its date, so the bot knows what "now" is and dates what it looks up.

A room chooses which games it loads with a `knowledge` field in its `room_config.json`, such as `["douyin", "memes", "games/zzz"]`, read again when it changes like the other fields.

Teams, banners, events, codes and news are answered by a `search_game` tool when someone asks. It reads the sources that work (below), returns what it found with the source and its date, and the bot says "B站最近的视频里常见的是…", not "最强的是…". Each query is cached for a day, so ten viewers asking the same thing cost one search. First check whether the answering model can already search the web: if it can, the tool may be only a prompt naming the sources.

## The entries

Short Markdown entries, one `##` per term, in the same format as the personas, `life.md` and `thoughts.md`:

```md
## 艾莲·乔

aliases: 艾莲, 艾莲乔, 鲨鱼妹, Ellen, 爱莲
类型: 事实
截至: 3.3
复查: 2027-01-31
来源: https://wiki.biligame.com/zzz/艾莲 (2026-10-31 学到)
维多利亚家政的女仆，鲨鱼希人。S 级冰属性强攻，斩击伤害。
```

- `aliases`: other ways people write or say it, including speech-to-text typos.
- `类型`: `事实` (how something is), `惯例` (etiquette), `规则` (a rule the bot must follow), `社区观点` (what players say, only for the few kept).
- `截至`: the version or month the entry is true as of. The prompt shows it, so the bot says "截至 3.1", never "目前".
- `复查`: when to check it again. An overdue list shows what's due; if it's still right, the date just moves on.
- `来源`: where it came from and when it was learned. An entry with no source is `模型知识，未核实` until checked.
- An entry replaced by a newer one with the same heading moves to an archive file, not deleted. An entry that was wrong gets `废弃: <reason>` and stays, so it isn't learned again.

Files: `data/knowledge/douyin/` (fan-club.md, pk.md, live-room.md), later `data/knowledge/memes/` and `data/knowledge/games/<game>/` (agents, world, mechanics, slang). Not in git, like the rest of `data/`.

## Lookup

### Matching on words, put into the prompt

A term is a fixed phrase, so matching is a plain substring check of each term and its aliases against the room's recent chat and the streamer's speech. It needs no model and adds no delay; embeddings blur fixed phrases into similar but wrong matches.

It works the way `MemoryRecall` does: when the room says something, check the terms and put the 1–3 entries that matched into the next prompt, each with its `截至`, newest last. While all of a room's knowledge stays under ~10–20k characters, the simplest option is to put the whole of it into the persona prompt and skip matching. The Douyin core may stay that small; a game's glossary won't.

### A `search_knowledge` tool

For questions that don't say the term ("那个冰属性的女仆叫什么", "粉丝灯牌怎么点亮"). An MCP tool on the bot's server, next to `update_memory`: `{ query, max? }`, the substring check first, then the Qwen3 embedding service (`embedding/serve.py`) through `vectorFiles` and `recalled()` from `core/memory/recall.ts`, with its own task instruction and cutoff measured with `embedding-eval`. Without the service, keyword search only. Games make it worth building sooner than memes would.

### Knowledge wins over memory, in code

Expiring an entry doesn't remove what the bot already wrote into `thoughts.md`, and memory recall ranks on relevance alone (`docs/forgetting-plan.md` adds recency, not built). Models are poor at settling a conflict in their prompt, and lean towards whatever is said more often, so "trust the knowledge base" can't be a prompt instruction: when a recalled memory is about the same term as a matched entry, the memory is left out of the prompt.

## Keeping up: `pnpm learn`

A batch job like `pnpm remember`, never during a live room. Code does the reading; a model only judges and writes:

- **Douyin gift catalogue and levels:** a script over the transcripts, no model.
- **Game glossaries:** the wiki through its MediaWiki API (`api.php`), with the infobox's fields read by code; the model writes only the one-line description. Pages are kept in `data/knowledge/sources/` with their revision id, and a refresh re-reads only the pages that changed.
- **Nicknames and memes:** code collects comments and counts the short phrases that repeat next to a name, across independent sources (ten reposts of one guide count once); the model sees the top candidates with a few examples and decides. A cheap model (Haiku, `--model`) pulls material out; a bigger one writes.
- **Phrases the rooms didn't understand:** ones that keep coming up in the transcripts with no entry. This is the most useful source, because it's what our viewers actually say.
- **Current game version:** one official news list, daily.

Modes: `pnpm learn` (the daily run), `pnpm learn <term> …` (named terms), `pnpm learn --topic games/zzz --update` (after a new version), `pnpm learn --from-transcripts`.

It runs `claude -p` with `WebSearch` and `WebFetch` allowed and a small MCP server of its own (`known(term)`, `propose(entry)`), with no `Write` or `Edit`, so `propose` is the only way anything reaches disk, and it refuses an entry with no source. Drafts go to `data/knowledge/pending/<topic>/<date>.md`. A person reviews them and moves them into `data/knowledge/<topic>/`; the bot states things confidently, so a wrong meaning is worse than none.

### Sources that work

Tried on 2026-10-31, through WebFetch, for 绝区零:

| Works                                                    | Blocked                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| B站's game wiki (`wiki.biligame.com/zzz/…`), full pages  | Fandom (402), Prydwen and Icy Veins (403)                    |
| B站's API: video search, details and comments, no login  | 米游社 (JS-only page; the API call failed), NGA (guest wall) |
| HoYoLAB's official news API (`bbs-api-os.hoyolab.com/…`) | Reddit, and the official sites' news lists (loaded by JS)    |

That covers facts, community usage and the current version. 米游社 and NGA would need a real browser: `playwright-core` with room-feed's pacing (`room-feed/AGENTS.md`), read-only, on a separate logged-out profile, so the streaming account never takes the anti-bot risk. Only if B站 isn't enough.

### Cost

Chinese is roughly a token a character, and one agent's wiki page is about 185k characters. Reading pages with a model, one agent's sources took a trial run about 68k tokens of its own, plus what the fetch tool spent reading them: dozens of agents that way is several million. With the wiki read by code and the counting done by code, the first import of a game is a few thousand tokens an agent, and a refresh reads only what changed.

## Research

What the literature says about stale and conflicting knowledge, and what we take from it:

- **Outdated text in the prompt hurts more than none.** With an outdated passage beside the current one, accuracy drops by 20% or more, and an outdated passage alone is worse than nothing ([HoH, ACL 2025](https://arxiv.org/html/2503.04800v1)). So what's expired leaves the prompt entirely; it isn't shown marked "old".
- **Whatever is in the prompt usually wins.** Models adopt wrong retrieved content over their own correct knowledge more than 60% of the time ([ClashEval](https://arxiv.org/abs/2404.10198)), favour what's said more often, and are poor at spotting contradictions ([Xu et al. 2024](https://arxiv.org/html/2403.08319v2)). So review and expiry are what keep the bot right, and conflicts are settled in code.
- **Replace, don't delete.** Zep/Graphiti keeps when a fact was true apart from when it was learned and marks old facts invalid instead of removing them ([2501.13956](https://arxiv.org/html/2501.13956v1)); Mem0 does the same in its graph variant and skips near-duplicates ([2504.19413](https://arxiv.org/html/2504.19413)). Wikidata keeps outdated values with end dates and marks values that were never right "deprecated", with a reason, so nobody re-adds them ([Help:Ranking](https://www.wikidata.org/wiki/Help:Ranking)).
- **Date what you show.** FreshLLMs splits questions into never-, slowly- and fast-changing, and dates its evidence with the newest last ([2310.03214](https://arxiv.org/html/2310.03214v2)). Wikipedia writes "as of", never "currently" ([Template:As of](https://en.wikipedia.org/wiki/Template:As_of)). A heavy "check for false premises" instruction made no difference on one model and cost another about 21 points, so hedging instructions are tested before they're added.
- **Review dates.** GOV.UK content has a review date and an overdue list; if it's still right, the date moves on ([GOV.UK](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/manage-existing-govuk-content/)).
- **Opinion drifts without a change point.** Spotting that is drift detection (ADWIN compares a recent window with an older one). It's why opinions are looked up, not stored: what's left in the files is either a fixed phrase or observed by code.

## Where the code goes

Following the repo's AGENTS.md (dependencies passed in, wired in the container, no `jest.mock`):

- `core/knowledge/`: parsing entries and matching terms, pure functions.
- `app/knowledge/knowledge-recall.ts` (built): takes the entries reader, an `Embedder` and a `VectorCache` as constructor options, listens to the room and keeps the entries that fit for the next prompt, like `MemoryRecall` (whose query and document vectors it shares, `app/memory/recall-vectors.ts`). Still to do: leaving out memories that a matched entry covers.
- `adapters/files/knowledge-files.ts`: reads every `.md` in a knowledge folder (built); later the room's `knowledge` field.
- `app/tools/search-knowledge.ts`, `app/tools/search-game.ts`, plus tokens and factories in `wiring/`.
- `src/learn.ts` (`pnpm learn`): the transcript scripts, the wiki reader, and browser tools (if ever) in `adapters/douyin/` behind a surface interface, so tests use a fake page.

## Order of work

1. The Douyin core (built): `data/knowledge/douyin/`, with the features draft merged in (the rules draft was left out: `forbidden.md` covers it; the gift catalogue was a one-off, to be rebuilt by `pnpm learn` when code needs it), `parseKnowledge`/`mentioned` in `core/knowledge/`, and `KnowledgeRecall` putting what fits into the prompt.
2. One game's glossary (绝区零), the room `knowledge` field, and leaving out memories that a matched entry covers.
3. `search_game`, after checking whether the answering model can search already.
4. `pnpm learn`: the transcript scripts first (no web), then the wiki reader, then named terms.
5. `search_knowledge`, if matching isn't enough.

## Risks

- Douyin's captcha and login walls will sometimes stop browser tools. `pnpm learn` should then stop for the day, not retry.
- Scraping may break a site's terms of service, so keep it low-volume and slow, and prefer official APIs.
- Wiki text has its own licence: entries are short and in our own words.
- Memes go stale and change meaning; the lease and `复查` dates catch them.
