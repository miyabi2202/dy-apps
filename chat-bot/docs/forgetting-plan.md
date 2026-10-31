# Forgetting: recency and importance in memory recall

Not built yet, on purpose. This is the plan for when it's needed, and how to tell when that is.

## Where things stand

The bot's own memories, its thoughts after each stream (`data/<房间号>/memory/thoughts.md`) and the days of the persona it plays (`data/lives/<persona>/`), are logs that only grow. Every prompt gets the latest of them (6 thoughts, 5 days), and `MemoryRecall` adds up to 3 older ones of each that fit what's being said (`src/app/memory/memory-recall.ts`, `src/core/memory/recall.ts`).

Generative Agents (Park et al., 2023) ranks a memory for recall by three things. We have one:

| Part                                                                   | Status                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Relevance**: an old memory comes back when it fits what's being said | Built: `0.85 × cosine + 0.15 × pinyin`, at least the cutoff (0.5) |
| **Recency**: older memories score lower, so they fade over time        | Not built                                                         |
| **Importance**: big things fade slower than small ones                 | Not built                                                         |

So today:

- The latest 6 thoughts and 5 days are always shown, relevant or not, important or not.
- An older one comes back only on relevance, and its age doesn't matter: a thought from yesterday and one from a year ago are treated the same if they score the same.
- Nothing is deleted from either log.

`memory.md` and the viewers' notes forget differently, and that stays as it is: they have size limits, and when one is full `pnpm remember` merges or removes outdated entries, keeping the old versions in an archive.

## Why not yet

- **The logs are short.** No room has many thoughts yet, and Fairy's days started on 2026-10-31. With a few dozen items, the recent window plus relevance covers them.
- **There is nothing to tune it on.** The real-room calibration (`embedding-eval/README.md`) searched `memory.md` and notes, which have no importance and are not what recall searches. A decay rate or an importance weight chosen now would be a guess, the way the first cutoff (0.45) and pinyin weight (0.1) were.
- **Ranking matters more first.** The calibration found the bot's recall at F1 about 0.28 against the judge's 0.81 with itself, mostly because general items crowd out specific ones. Fix that before adding more terms to the score.

## When to build it

Any of these:

- The logs have a few months of history: a room with 100+ thoughts, or Fairy with 60+ days.
- The `memory recall` log lines (debug, in the bot's log) show old trivial items winning over recent ones, or important ones from a few weeks back never coming up when they should.
- Someone notices Fairy bringing up something small and old as if it were news, or missing something big (an anniversary, a promise) the room is talking about.

## The plan

### 1. Importance, rated when a memory is written

The prompts that write thoughts (`prompts/remember-thoughts.md`) and days (`prompts/life.md`) also rate each item 1–10: how much it would matter to bring up again (an anniversary, a promise to the streamer: high; a small daily mishap: low). It's the same Claude call, so it costs nothing.

It's stored on the item without changing what a prompt shows, the way `memory.md` keeps its dates:

```text
2026-10-31：主人下周一就是抖音一周年 <!-- 8 -->
```

and in a day's file, one per line. The `<!-- … -->` part is taken off before the text is shown or embedded. An item without one (everything written before this) counts as middling, 5.

This step is worth doing first, and could be done before the rest: every item written from then on carries a rating, so there's history to tune on when the decay is added.

### 2. Recency decay

An older item's score shrinks with its age in days, more slowly the more important it is:

```text
recency = 0.5 ^ (age / halfLife(importance))
halfLife(importance) = base × (importance / 5)     # e.g. base 21 days: importance 5 halves in 3 weeks, 10 in 6
```

### 3. The combined score

For older items, the score recall gates and ranks on becomes:

```text
score = relevance × (1 − d + d × recency)
```

`d` (how much age counts, 0–1) keeps relevance in charge: an old item that fits well still beats a recent one that doesn't. The cutoff stays on this score.

### 4. Maybe the recent window too

Instead of always the newest 6 thoughts and 5 days, show the newest few plus the most important recent ones, so a big thing from last week outlasts a small thing from today.

### Where the code goes

- `src/core/memory/recall.ts`: `recency()` and the combined score, pure functions, with the half-life and `d` as options with defaults.
- `src/adapters/files/thoughts-file.ts` and `life-files.ts`: read and write the importance trailer.
- `src/app/memory/remember-chat.ts` and `src/app/life/life-writer.ts`: ask for the rating (each answer's schema gets an `importance` per item).
- `src/app/memory/memory-recall.ts`: pass each item's age and importance into the score; `now` comes in as an option, as elsewhere.

### Tuning

Rerun the real-room calibration (`embedding-eval/`) with the thoughts and days as the pool, now that they exist, and sweep the half-life and `d` on the tune half as the cutoff and weight were. The judge is told each memory's date so "useful right now" can take age into account.

## Risks

- **Importance from the writer may be inflated**: everything rated 7–8. If so, rank-normalise per log (or ask for it relative to the last week's items).
- **Old but relevant things fading too fast** would make the bot forget promises. Keep `d` small and the half-life long at first, and check the `memory recall` log lines.
