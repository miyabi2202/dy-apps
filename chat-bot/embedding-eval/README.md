# Embedding eval: which local model recalls the right memory

The question: when the bot is about to reply in a live room, can a local embedding model pick, from the room's memory, the few items that should come to mind for what's being said right now? And does it beat a model-free baseline by enough to be worth running a local service?

Rankers compared, on the same test set:

| ranker                                      | what it is                                                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bm25`, `jaccard`                           | no model: BM25 / Jaccard over Chinese character bigrams (a lone character stays a unigram), plus whole ASCII words                                                                                                          |
| `pinyin`, `pinyin-fuzzy`                    | no model: BM25 over toneless pinyin **syllable bigrams** (pypinyin). `-fuzzy` merges the sounds the bot's `src/core/viewers/sounds-like.ts` already merges (zh/z, ch/c, sh/s, l/n, -ng/-n) plus z/c/s + uan → an (suan/san) |
| `qwen3-0.6b`                                | Qwen/Qwen3-Embedding-0.6B, queries with **our task instruction** (below), items with none                                                                                                                                   |
| `qwen3-0.6b-default-prompt`                 | same, queries with the model's shipped `prompt_name="query"` (a generic web-search instruction)                                                                                                                             |
| `qwen3-0.6b-no-prompt`                      | same, no instruction on either side                                                                                                                                                                                         |
| `qwen3-4b`, `-default-prompt`, `-no-prompt` | Qwen/Qwen3-Embedding-4B, the same three ways                                                                                                                                                                                |
| `bge-m3`                                    | BAAI/bge-m3, dense vectors (CLS, normalised), no instruction (it takes none)                                                                                                                                                |
| `<model>+pinyin-sum`                        | per item, `0.7 × cosine + 0.3 × pinyin`, where pinyin is `pinyin-fuzzy`'s BM25 divided by one fixed scale (its 99th percentile over all query × item scores, 6.44 here) and capped at 1                                     |
| `<model>+pinyin-max`                        | per item, `max(cosine, pinyin)` with the same scaling                                                                                                                                                                       |

The task instruction (Qwen3's card says to write one per task, in English): `Instruct: Given what is being said in a Chinese live-stream room (viewers' chat and the streamer's speech-to-text, which has typos), retrieve the bot's memory notes that are relevant to it\nQuery:`. It was written once, before any results, and not tuned.

All models ran on the M5 Max's **MPS GPU in float16** (no MPS failure, no CPU fallback), via sentence-transformers 5, cosine similarity on normalised vectors.

## Rerun

From `chat-bot/embedding-eval/`:

```sh
uv run run-eval.py                         # every ranker, each in its own process, then results/report.md
uv run run-eval.py --only bm25 qwen3-0.6b  # some of them (a hybrid needs its base and pinyin-fuzzy run first)
uv run run-eval.py --ranker bge-m3         # one, writes results/bge-m3.json
uv run run-eval.py --report                # rebuild results/report.md from results/*.json, no models needed
```

The first run downloads the models from Hugging Face into the HF cache (about 1.2 GB, 2.3 GB and 8 GB); `HF_HUB_OFFLINE=1` after that skips the Hub check.

The test set and the results are **not in git**: they quote real rooms' memory (anonymised, but a reader who knows the rooms could tell whose), and the repo is public. They live in the bot's `chat-bot/data/embedding-eval/` (`test-set.json`, `results/*.json`), which the scripts read and write; `results/report.md` there has every table here for every ranker variant, the score lists, a weight sweep for the hybrid, and every query where the main rankers' first pick differs.

## The test set

`test-set.json`: **138 memory items, 62 queries**.

- **Pool.** Six real rooms' `memory.md` entries (long ones split into their bullets, `<!-- … -->` metadata dropped) and `note.md` notes: VTubers and singers of different kinds, one with a 高数 class, one doing PK link-ups. Plus 13 of Fairy's own days in 六分街 (`life`, from `prompts/personas/fairy/life.md`: 小黑, 141 的找零, 电费单, 乔普师傅的拉面, 绳网…) and 10 of the bot's after-stream thoughts (`thought`), written for this test in the style of the bot's new memories. One item was added for a homophone case.
- **Privacy.** No real user id or nickname: streamers are 主播, viewers 观众A–Z or an invented nickname, personal details paraphrased. Still kept out of git (see Rerun).
- **Queries** are what the bot sees when it replies: a chat line, the streamer's ASR speech with its typos, or a 2–3 line mix (the `[观众](chat)` / `[主播](speech)` labels are stripped before ranking). Each lists the item ids that should come to mind; a hit is any of them. Tags: `lexical` 8, `paraphrase` 16, `related` 6, `slang` 7, `game` 6, `asr-typo` 7, `none` 6 (nothing relevant), and, added in a second round, `homophone` 10, `typo-sound` 4 (same-pinyin IME slips: 再/在, 谈/弹, 彩/菜, 废/费), `typo-shape` 4 (look-alike characters: 末/未, 犁/梨, 干/千, 囗/口). A query can carry two tags. The first round is q01–q44 (38 with an answer); the second, h01–h10, s01–s04, x01–x04, is the "homophone + typo (18)" column.
- **Scoring.** The main numbers are **in-room**: each query ranks only its own room's items plus Fairy's days (22–51 items), which is what the bot would search. `report.md` also has the whole pool of 138 (harder, and a bit pessimistic, since another room's 开播时间 or 点歌 rule counts as wrong unless listed).

The set is small: one query is 1.6–2.6 points of hit@1, and a tag with 4–8 queries moves 12–25 points per query. Read differences under ~5 points overall as a tie.

## Results (in-room)

| ranker                            | hit@1   | hit@3 | MRR       | first round (38): hit@1 | homophone + typo (18): hit@1 | `none` top-1 max | lowest positive top-1 | fewest errors at one cutoff (of 62) |
| --------------------------------- | ------- | ----- | --------- | ----------------------- | ---------------------------- | ---------------- | --------------------- | ----------------------------------- |
| bm25 (chars)                      | 66%     | 80%   | 0.744     | 68%                     | 61%                          | 3.91             | 0.00                  | 5                                   |
| jaccard (chars)                   | 66%     | 73%   | 0.721     | 68%                     | 61%                          | 0.030            | 0.000                 | 6                                   |
| pinyin                            | 77%     | 88%   | 0.832     | 74%                     | 83%                          | 8.07             | 1.54                  | 6                                   |
| pinyin-fuzzy                      | 77%     | 89%   | 0.835     | 74%                     | 83%                          | 8.07             | 1.54                  | 6                                   |
| **qwen3-0.6b** (task instruction) | **88%** | 93%   | **0.914** | **89%**                 | 83%                          | 0.460            | 0.438                 | **2**                               |
| qwen3-0.6b, default prompt        | 82%     | 93%   | 0.887     | 82%                     | 83%                          | 0.446            | 0.357                 | 2                                   |
| qwen3-0.6b, no prompt             | 79%     | 89%   | 0.849     | 76%                     | 83%                          | 0.469            | 0.434                 | 1                                   |
| qwen3-4b (task instruction)       | 80%     | 91%   | 0.869     | 76%                     | 89%                          | 0.541            | 0.416                 | 3                                   |
| qwen3-4b, default prompt          | 82%     | 95%   | 0.895     | 84%                     | 78%                          | 0.435            | 0.326                 | 5                                   |
| qwen3-4b, no prompt               | 73%     | 88%   | 0.810     | 68%                     | 83%                          | 0.521            | 0.427                 | 2                                   |
| bge-m3                            | 80%     | 96%   | 0.885     | 87%                     | 67%                          | 0.544            | 0.472                 | 4                                   |
| qwen3-0.6b + pinyin, max          | 77%     | 96%   | 0.863     | 71%                     | 89%                          | 1.000            | 0.558                 | 5                                   |
| qwen3-0.6b + pinyin, 0.7/0.3      | 86%     | 95%   | 0.905     | 82%                     | 94%                          | 0.526            | 0.401                 | 2                                   |
| qwen3-4b + pinyin, 0.7/0.3        | 88%     | 98%   | 0.926     | 82%                     | 100%                         | 0.619            | 0.414                 | 3                                   |
| bge-m3 + pinyin, max              | 77%     | 96%   | 0.869     | 71%                     | 89%                          | 1.000            | 0.655                 | 4                                   |
| bge-m3 + pinyin, 0.7/0.3          | 89%     | 96%   | 0.928     | 84%                     | 100%                         | 0.618            | 0.505                 | 3                                   |

Whole pool of 138, hit@1 / MRR: bm25 57% / 0.665, pinyin-fuzzy 68% / 0.761, qwen3-0.6b 73% / 0.806, qwen3-4b 75% / 0.809, bge-m3 68% / 0.762, bge-m3 + pinyin 0.7/0.3 84% / 0.878, qwen3-0.6b + pinyin 0.7/0.3 82% / 0.872.

### The hybrid's weight

0.3 was the starting guess. The weight sweep in `report.md` (in-room, hit@1):

| base                                                      | w = 0        | 0.1               | 0.15          | 0.2           | 0.3           |
| --------------------------------------------------------- | ------------ | ----------------- | ------------- | ------------- | ------------- |
| qwen3-0.6b, all / homophone + typo / paraphrase + related | 88 / 83 / 86 | **89 / 94 / 82**  | 88 / 94 / 77  | 89 / 94 / 82  | 86 / 94 / 68  |
| qwen3-4b                                                  | 80 / 89 / 73 | **93 / 100 / 86** | 93 / 100 / 86 | 91 / 100 / 82 | 88 / 100 / 73 |
| bge-m3                                                    | 80 / 67 / 86 | **93 / 100 / 82** | 89 / 100 / 73 | 89 / 100 / 73 | 89 / 100 / 73 |

At **w = 0.1** pinyin fixes nearly all homophone and typo cases and costs at most one paraphrase/related query. At 0.3 it starts outvoting the meaning: qwen3-0.6b's related hit@1 drops from 83% to 50%. Cutoff errors at w = 0.1: qwen3-0.6b 1, bge-m3 2, qwen3-4b 2. w was picked on this same small test set, so treat 0.1 as "small", not as a tuned constant.

### Per tag (in-room, hit@1 / MRR)

| ranker                      | lexical (8) | paraphrase (16) | related (6) | slang (7)   | game (6)   | asr-typo (7) | homophone (10) | typo-sound (4) | typo-shape (4) |
| --------------------------- | ----------- | --------------- | ----------- | ----------- | ---------- | ------------ | -------------- | -------------- | -------------- |
| bm25                        | 88% / 0.94  | 69% / 0.77      | 33% / 0.51  | 71% / 0.80  | 50% / 0.62 | 71% / 0.83   | 60% / 0.64     | 75% / 0.83     | 50% / 0.53     |
| pinyin-fuzzy                | 88% / 0.94  | 69% / 0.78      | 33% / 0.49  | 86% / 0.88  | 50% / 0.63 | 100% / 1.00  | 90% / 0.95     | 100% / 1.00    | 50% / 0.61     |
| qwen3-0.6b                  | 88% / 0.90  | 88% / 0.90      | 83% / 0.85  | 100% / 1.00 | 67% / 0.73 | 100% / 1.00  | 80% / 0.90     | 75% / 0.88     | 100% / 1.00    |
| qwen3-0.6b, no prompt       | 88% / 0.89  | 69% / 0.77      | 67% / 0.77  | 86% / 0.88  | 17% / 0.39 | 100% / 1.00  | 90% / 0.91     | 75% / 0.88     | 75% / 0.88     |
| qwen3-4b                    | 100% / 1.00 | 81% / 0.87      | 50% / 0.67  | 86% / 0.90  | 67% / 0.77 | 71% / 0.80   | 80% / 0.86     | 100% / 1.00    | 100% / 1.00    |
| bge-m3                      | 88% / 0.92  | 88% / 0.94      | 83% / 0.86  | 71% / 0.83  | 67% / 0.83 | 86% / 0.93   | 60% / 0.78     | 50% / 0.68     | 100% / 1.00    |
| qwen3-0.6b + pinyin 0.7/0.3 | 100% / 1.00 | 75% / 0.83      | 50% / 0.68  | 86% / 0.89  | 67% / 0.75 | 100% / 1.00  | 100% / 1.00    | 100% / 1.00    | 75% / 0.83     |
| qwen3-4b + pinyin 0.7/0.3   | 100% / 1.00 | 81% / 0.90      | 50% / 0.67  | 86% / 0.93  | 67% / 0.83 | 100% / 1.00  | 100% / 1.00    | 100% / 1.00    | 100% / 1.00    |
| bge-m3 + pinyin 0.7/0.3     | 100% / 1.00 | 75% / 0.83      | 67% / 0.77  | 86% / 0.90  | 50% / 0.67 | 100% / 1.00  | 100% / 1.00    | 100% / 1.00    | 100% / 1.00    |

What the tags show:

- **Character bigrams fail where the words differ.** On `related` (33%), `paraphrase`, slang and game names, a query that shares no characters with the right item scores zero for it. Sometimes a query shares no bigram with anything in the room (h05, h10), so its top-1 score is 0.
- **Pinyin is strictly better than character bigrams** (77% vs 66%, the same or higher hit@1 on every tag). It fixes the sound-alike cases: homophone 60 → 90%, typo-sound 75 → 100%, asr-typo 71 → 100%. It does nothing for meaning, and nothing for look-alike typos whose sound differs (干层, 囗琴). Fuzzy merging changed no rank here: most homophones in this set have exactly the same toneless pinyin, and in the near ones one syllable pair still matched exactly (酸角粥 / 三角洲 share "jiao zhou", 建网山 / 剑网三 share "jian wang"). It only raises their scores. It should matter more for short names where every syllable is slightly off.
- **Embeddings handle meaning, slang and look-alike typos.** typo-shape is 100% for all three models: they tokenise into subwords and the rest of the sentence carries it. Homophones are their weak spot, bge-m3's most of all (60%).
- **The hybrid gets both**, at least at a small weight.

### Speed and memory (MPS, float16, one ~300-character query)

|                     | load (s, warm cache) | embed 138 items (s) | median per query (ms) | process peak RSS | MPS memory |
| ------------------- | -------------------- | ------------------- | --------------------- | ---------------- | ---------- |
| bm25 / pinyin-fuzzy | 0                    | 0.005 / 0.08        | 1.0 / 1.9             | –                | –          |
| qwen3-0.6b          | 0.8                  | 0.29                | 20                    | 2.7 GB           | 2.2 GB     |
| qwen3-4b            | 3–5                  | 1.0                 | 57–60                 | 9.8–15.8 GB      | 9.0 GB     |
| bge-m3              | 1.7                  | 0.16                | 13                    | 3.7 GB           | 2.2 GB     |

Load times are with the weights already in the OS file cache. The very first load of qwen3-0.6b after download, cold and including the torch import, took 25 s. Per query is one ~300-character context, embedded and scored against the pool. The pinyin rankers include pypinyin's conversion, which is the slow part.

## The `none` cutoff

The question: can one threshold on the top-1 score tell "nothing here is relevant" (6 `none` queries: rain in Shanghai, 成都火锅, a crackling mic, 基金又绿了, a dog that chewed a slipper, a medical check-up tomorrow) from "something is"?

- **Character and pinyin BM25: no.** Their scores depend on query length, and some right answers score 0 while a `none` query's top item scores 3.9 (chars) or 8.1 (pinyin: 麦怎么有电流声 → 刮刮卡). No usable threshold.
- **qwen3-0.6b with the task instruction is the cleanest.** `none` top-1 scores run 0.34–0.46; the right item scores at least 0.426 on every positive query, and above 0.45 on all but four. On the first round alone (q01–q44) one threshold separates them perfectly (none max 0.460 < positive min 0.468). With the second round, two errors remain, so the margin is only about 0.02. The worst `none` is always q22 (主播: "这个麦怎么有电流声…调一下声卡") → c04, the note about ASR mixing up 主播/连线, which is loosely about audio. The default prompt spreads `none` scores lower (0.30–0.45) but positives too.
- **bge-m3** has a higher, tighter range (`none` 0.46–0.54, positives from 0.47), so 4 errors at best. **qwen3-4b**: 3 at best.
- **Hybrids.** `max` ruins the cutoff: any shared syllable pair maxes pinyin out at 1.0, so `none` queries reach 1.0 too. The weighted sum keeps the embedding's ordering. At w = 0.1 it still has 1 error (qwen3-0.6b, t ≈ 0.43) or 2 (bge-m3, t ≈ 0.52). At 0.3 the `none` max rises to 0.53–0.62, because pinyin adds a floor.

For the bot: with qwen3-0.6b (+ 0.1 pinyin), recall the top 3 whose score is ≥ about **0.45**. Don't treat the cutoff as a hard gate: the gap is a few hundredths, and a slightly-off memory in the prompt costs little. Recalibrate it on real logs, since cosine levels shift with query length and pool.

## What the disagreements show

The queries where the rankers' first picks differ are in `results/report.md` (local; see Rerun). The patterns:

- **Different words, same meaning** (上舰 ↔ the room's 会员礼, 那只猫 ↔ 小黑): character BM25 latches onto a shared but irrelevant word (「这个月」 → the 电费单 day); every embedding gets these.
- **Homophones** (the request's case: 三角洲 heard as 酸角粥, a game or song title heard as other real words): character bigrams miss them, often with a score of 0. Pinyin finds them through the shared syllable pair (酸角粥 / 三角洲 share "jiao zhou"; suan ≠ san, which the fuzzy rule merges too). Qwen3-0.6B gets some, Qwen3-4B and bge-m3 fewer: they drift to other notes.
- **Look-alike typos that don't sound alike** (千层 written 干层: qian ≠ gan): pinyin can't help, while every embedding gets them from the rest of the sentence.
- **The bot's own name** in a query (「fairy 你家那只猫…」) matches a note that only mentions the name (「管机器人叫 FERRY／fairy」) lexically, and with pinyin added that note climbs. **Strip the bot's names and aliases from the query before the pinyin (or any lexical) score.** The bot already knows them (`aliases` in room_config).

## Recommendation

1. **Use Qwen3-Embedding-0.6B, with a task instruction on queries (none on stored items), plus a small fuzzy-pinyin term (≈ 0.1).** On its own it is the best single ranker here: 88% hit@1 and MRR 0.914 in-room, against 66% for the bigram baseline. It is also the only one whose `none` scores mostly sit below the positives. With 0.1 × pinyin-fuzzy it reaches 89% overall, 94% on homophones and typos, with 1 cutoff error. It needs ~2.7 GB, loads in under a second once cached, and takes ~20 ms per reply-time query on MPS, which is negligible next to the Claude call.
   - **The instruction matters.** The same model with no instruction drops to 79% (game 67% → 17%), and with the shipped web-search prompt to 82%. Qwen3-4B shows the same pattern.
   - **bge-m3 is an equal alternative** if a model without instructions is preferred: 80% alone, 93% at w = 0.1, 13 ms. But it is the worst model on homophones (60%) and has a muddier cutoff (none max 0.54).
   - **Qwen3-4B isn't worth it.** It is no better than 0.6B here (80% alone, 93% with pinyin, a tie with the others), at 3× the latency and 9–16 GB of memory.
2. **Embeddings beat the bigram baseline by enough to be worth a local service.** The gain is 22 points hit@1, and it lands exactly where recall matters: related 33% → 83%, paraphrase 69% → 88%, slang 71% → 100%, game 50% → 67%. The baseline also can't support a "nothing relevant" cutoff at all. The service is small: one 0.6B model on MPS, the pool embedded once per change (138 items take 0.3 s), one embedding per reply.
3. **If the service isn't up yet, or as a fallback, use fuzzy-pinyin BM25 rather than character bigrams.** It needs no model, beats character bigrams on every tag (77% vs 66%), and is easy to port: the bot already has pinyin-pro and the same sound merging in `sounds-like.ts`, so it is syllable bigrams + BM25 on top of `syllables()`. It can't give a cutoff, so cap it at top-k.
4. **Hybrid score**: `(1 − w) × cosine + w × min(1, pinyinBM25 / scale)` with w ≈ 0.1 and one fixed scale per pool (here the 99th percentile of pinyin scores, 6.4). Don't use `max`: it wrecks the ranking and the cutoff. Strip the bot's own names from the query first.

Caveats: 62 queries, 6 `none`, one author (who also wrote the instruction and picked w on this set). The ranking of the top three options is not settled by this set. "Embeddings + a little pinyin ≫ bigrams" is.
