"""Rank the test set's memories for each query with one ranker, or all of them.

    uv run run-eval.py                 # every ranker, each in its own process, then the report
    uv run run-eval.py --ranker bm25   # one ranker; writes ../data/embedding-eval/results/<ranker>.json
    uv run run-eval.py --report        # rebuild the report there from the results

Each embedding ranker runs in a fresh process so its load time and peak memory
are its own. Scores are cosine similarity for the embedding models, BM25 and
Jaccard over character bigrams for the baselines.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
# The test set and the results quote real rooms (anonymised), so they live in the bot's data/,
# which is not in git: chat-bot/data/embedding-eval/.
DATA = HERE.parent / "data" / "embedding-eval"
TEST_SET = DATA / "test-set.json"
RESULTS = DATA / "results"

# The instruction we give Qwen3-Embedding for this task (its model card says to
# write the instruction in English and fit it to the task).
TASK_INSTRUCT = (
    "Given what is being said in a Chinese live-stream room (viewers' chat and the "
    "streamer's speech-to-text, which has typos), retrieve the bot's memory notes "
    "that are relevant to it"
)

# name -> how to build it. "prompt" is how queries are encoded: None = no prompt,
# "query" = the prompt_name shipped with the model, anything else = Instruct text.
RANKERS: dict[str, dict] = {
    "bm25": {"kind": "bm25"},
    "jaccard": {"kind": "jaccard"},
    "pinyin": {"kind": "pinyin", "fuzzy": False},
    "pinyin-fuzzy": {"kind": "pinyin", "fuzzy": True},
    "qwen3-0.6b": {"kind": "st", "model": "Qwen/Qwen3-Embedding-0.6B", "prompt": TASK_INSTRUCT},
    "qwen3-0.6b-default-prompt": {"kind": "st", "model": "Qwen/Qwen3-Embedding-0.6B", "prompt": "query"},
    "qwen3-0.6b-no-prompt": {"kind": "st", "model": "Qwen/Qwen3-Embedding-0.6B", "prompt": None},
    "qwen3-4b": {"kind": "st", "model": "Qwen/Qwen3-Embedding-4B", "prompt": TASK_INSTRUCT},
    "qwen3-4b-default-prompt": {"kind": "st", "model": "Qwen/Qwen3-Embedding-4B", "prompt": "query"},
    "qwen3-4b-no-prompt": {"kind": "st", "model": "Qwen/Qwen3-Embedding-4B", "prompt": None},
    "bge-m3": {"kind": "st", "model": "BAAI/bge-m3", "prompt": None},
}
# An embedding's score combined with the fuzzy-pinyin score, per item (runs after both).
for _base in ("qwen3-0.6b", "qwen3-4b", "bge-m3"):
    RANKERS[f"{_base}+pinyin-max"] = {"kind": "hybrid", "base": _base, "pinyin": "pinyin-fuzzy", "mode": "max"}
    RANKERS[f"{_base}+pinyin-sum"] = {"kind": "hybrid", "base": _base, "pinyin": "pinyin-fuzzy", "mode": "sum"}
HYBRID_WEIGHT = 0.3  # sum mode: (1 - w) * cosine + w * pinyin

# A ~300-character context, the size of what the bot sees when it replies, for timing.
SPEED_QUERY = (
    "谢谢大家的点赞啊欢迎新来的宝宝们晚上好我们今天先唱几首开嗓的然后再聊天嗯刚刚那首是不是有点高了"
    "我感觉我今天嗓子还行还行诶有人问我周年要干嘛周年的话我还在想要不要学首新歌你们有没有推荐的\n"
    "主播今天唱不唱如果有你在呀\n快到纪念日了吧有啥活动没\nfairy 你今天在六分街干嘛了\n"
    "等一下我面补又掉了我不能站起来一站起来就没了哈哈哈哈谢谢观众A的点赞好快一下子就六千赞了"
    "大家没抽亲密度的记得抽一下亲密度吧收菜了收菜了我们等会儿打一把PK好不好最后几秒别偷我屁股啊"
    "好那我们下一首唱什么呢有没有想听的点一下我看看歌单里有没有没有的话我就随便唱了啊等一下我喝口水你们先聊"
    "谢谢观众B的小心心谢谢观众C的点赞"
)


# ---------- test set ----------

TAG_PREFIX = re.compile(r"^\[[^\]]*\]\((?:speech|chat|song)\)\s*")


def load_test_set():
    data = json.loads(TEST_SET.read_text())
    memories = data["memories"]
    queries = data["queries"]
    for q in queries:
        # The bracketed speaker label is for people reading the file; rankers get the words.
        q["clean"] = "\n".join(TAG_PREFIX.sub("", line) for line in q["text"].split("\n"))
    return memories, queries


def room_pool(memories, room):
    """The ids the bot would search in that room: its memory, notes and thoughts, plus Fairy's days."""
    return [i for i, m in enumerate(memories) if m["room"] in (room, "life")]


# ---------- baselines ----------

CJK = re.compile(r"[一-鿿぀-ヿ]+")
ASCII_WORD = re.compile(r"[A-Za-z0-9]+")


def tokens(text: str) -> list[str]:
    """Character bigrams of each run of CJK/kana (a lone character stays a unigram), plus whole ASCII words."""
    out: list[str] = []
    for run in CJK.findall(text):
        if len(run) == 1:
            out.append(run)
        else:
            out.extend(run[i : i + 2] for i in range(len(run) - 1))
    out.extend(w.lower() for w in ASCII_WORD.findall(text))
    return out


def fuzzy_syllable(syl: str) -> str:
    """Merge the sounds people and the recognizer mix up, as the bot's sounds-like.ts does
    (zh/z, ch/c, sh/s, l/n, -ng/-n), plus z/c/s + uan as an (suan/san)."""
    syl = re.sub(r"^([zcs])h", r"\1", syl)
    syl = re.sub(r"^l", "n", syl)
    syl = re.sub(r"ng$", "n", syl)
    syl = re.sub(r"^([zcs])uan$", r"\1an", syl)
    return syl


def pinyin_tokens(text: str, fuzzy: bool = False) -> list[str]:
    """Toneless pinyin syllable bigrams of each CJK run (a lone character stays one syllable), plus whole ASCII words."""
    from pypinyin import lazy_pinyin

    out: list[str] = []
    for run in CJK.findall(text):
        syls = lazy_pinyin(run)
        if fuzzy:
            syls = [fuzzy_syllable(x) for x in syls]
        if len(syls) == 1:
            out.append(syls[0])
        else:
            out.extend(f"{syls[i]} {syls[i + 1]}" for i in range(len(syls) - 1))
    out.extend(w.lower() for w in ASCII_WORD.findall(text))
    return out


class BM25:
    def __init__(self, docs: list[str], k1: float = 1.2, b: float = 0.75, tokenize=tokens):
        self.tokenize = tokenize
        self.docs = [Counter(tokenize(d)) for d in docs]
        self.lens = [sum(d.values()) for d in self.docs]
        self.avg = sum(self.lens) / len(self.lens)
        df = Counter(t for d in self.docs for t in d)
        n = len(docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}
        self.k1, self.b = k1, b

    def scores(self, query: str) -> list[float]:
        q = set(self.tokenize(query))
        out = []
        for d, ln in zip(self.docs, self.lens):
            s = 0.0
            for t in q:
                f = d.get(t)
                if f:
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * ln / self.avg))
            out.append(s)
        return out


def jaccard_scores(docs: list[str], query: str) -> list[float]:
    q = set(tokens(query))
    out = []
    for d in docs:
        t = set(tokens(d))
        out.append(len(q & t) / len(q | t) if q | t else 0.0)
    return out


# ---------- embedding models ----------

def pick_device():
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def peak_memory_mb():
    import psutil
    import torch

    rss = psutil.Process().memory_info().rss / 2**20
    mps = torch.mps.driver_allocated_memory() / 2**20 if torch.backends.mps.is_available() else 0.0
    return rss, mps


def load_st(model_name: str, device: str):
    import torch
    from sentence_transformers import SentenceTransformer

    dtype = torch.float16 if device == "mps" else torch.float32
    return SentenceTransformer(model_name, device=device, model_kwargs={"torch_dtype": dtype})


def encode_query(model, texts, prompt):
    if prompt is None:
        return model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    if prompt == "query":
        return model.encode(texts, prompt_name="query", normalize_embeddings=True, convert_to_numpy=True)
    return model.encode(texts, prompt=f"Instruct: {prompt}\nQuery:", normalize_embeddings=True, convert_to_numpy=True)


def run_st(spec, memories, queries):
    import numpy as np
    import sentence_transformers  # noqa: F401  (imported before the clock starts)
    import torch

    device = pick_device()
    note = ""
    t0 = time.perf_counter()
    try:
        model = load_st(spec["model"], device)
        model.encode(["测试"], convert_to_numpy=True)
    except Exception as e:  # MPS can fail on some ops; say so and go on.
        note = f"MPS failed ({type(e).__name__}: {e}); fell back to CPU"
        device = "cpu"
        t0 = time.perf_counter()
        model = load_st(spec["model"], device)
        model.encode(["测试"], convert_to_numpy=True)
    load_s = time.perf_counter() - t0

    def sync():
        if device == "mps":
            torch.mps.synchronize()

    docs = [m["text"] for m in memories]
    sync()
    t0 = time.perf_counter()
    doc_emb = model.encode(docs, batch_size=32, normalize_embeddings=True, convert_to_numpy=True)
    sync()
    pool_s = time.perf_counter() - t0

    q_emb = encode_query(model, [q["clean"] for q in queries], spec["prompt"])
    scores = (q_emb @ doc_emb.T).astype(float).tolist()

    # One ~300-char query at a time, as the bot would at reply time.
    for _ in range(3):
        encode_query(model, [SPEED_QUERY], spec["prompt"])
    times = []
    for _ in range(20):
        sync()
        t0 = time.perf_counter()
        e = encode_query(model, [SPEED_QUERY], spec["prompt"])
        _ = np.asarray(e) @ doc_emb.T
        sync()
        times.append(time.perf_counter() - t0)

    rss, mps = peak_memory_mb()
    import resource

    max_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20  # bytes on macOS
    return scores, {
        "device": device,
        "dtype": "float16" if device == "mps" else "float32",
        "note": note,
        "dim": int(doc_emb.shape[1]),
        "load_s": load_s,
        "pool_embed_s": pool_s,
        "pool_items": len(docs),
        "query_median_ms": statistics.median(times) * 1000,
        "query_chars": len(SPEED_QUERY),
        "rss_mb": rss,
        "max_rss_mb": max_rss,
        "mps_driver_mb": mps,
    }


def run_baseline(kind, memories, queries, spec):
    docs = [m["text"] for m in memories]
    t0 = time.perf_counter()
    if kind == "pinyin":
        fuzzy = spec["fuzzy"]
        bm = BM25(docs, tokenize=lambda t: pinyin_tokens(t, fuzzy))
        kind = "bm25"
        scores = [bm.scores(q["clean"]) for q in queries]
    elif kind == "bm25":
        bm = BM25(docs)
        scores = [bm.scores(q["clean"]) for q in queries]
    else:
        scores = [jaccard_scores(docs, q["clean"]) for q in queries]
    elapsed = time.perf_counter() - t0
    times = []
    for _ in range(20):
        t1 = time.perf_counter()
        bm.scores(SPEED_QUERY) if kind == "bm25" else jaccard_scores(docs, SPEED_QUERY)
        times.append(time.perf_counter() - t1)
    return scores, {"device": "cpu", "load_s": 0.0, "pool_embed_s": elapsed, "pool_items": len(docs),
                    "query_median_ms": statistics.median(times) * 1000, "query_chars": len(SPEED_QUERY)}


# ---------- scoring ----------

def rank_in(scores_row, pool):
    return sorted(pool, key=lambda i: -scores_row[i])


def evaluate(memories, queries, scores, scope):
    """Per query: rank of the first expected item, the top-1 item and score."""
    ids = [m["id"] for m in memories]
    out = []
    for q, row in zip(queries, scores):
        pool = room_pool(memories, q["room"]) if scope == "room" else list(range(len(memories)))
        pool_ids = {ids[i] for i in pool}
        expected = [e for e in q["expected"] if e in pool_ids]
        if scope == "room" and q["expected"] and not expected:
            raise SystemExit(f"{q['id']}: none of its expected items are in room {q['room']}")
        ranked = rank_in(row, pool)
        rank = next((r + 1 for r, i in enumerate(ranked) if ids[i] in expected), None)
        out.append({
            "id": q["id"],
            "tags": q["tags"],
            "expected": expected,
            "rank": rank,
            "top": [ids[i] for i in ranked[:3]],
            "top_scores": [row[i] for i in ranked[:3]],
            "expected_score": max((row[ids.index(e)] for e in expected), default=None),
        })
    return out


def summarize(per_query):
    pos = [p for p in per_query if "none" not in p["tags"]]

    def metrics(rows):
        if not rows:
            return None
        return {
            "n": len(rows),
            "hit1": sum(1 for p in rows if p["rank"] == 1) / len(rows),
            "hit3": sum(1 for p in rows if p["rank"] and p["rank"] <= 3) / len(rows),
            "mrr": sum(1 / p["rank"] for p in rows if p["rank"]) / len(rows),
        }

    tags = sorted({t for p in pos for t in p["tags"]})
    return {"overall": metrics(pos), "by_tag": {t: metrics([p for p in pos if t in p["tags"]]) for t in tags}}


def cutoff(per_query):
    """Can one threshold on the top-1 score tell 'nothing relevant' from 'something relevant'?"""
    none = sorted(p["top_scores"][0] for p in per_query if "none" in p["tags"])
    pos = sorted(p["top_scores"][0] for p in per_query if "none" not in p["tags"])
    # Positives where the right item is first: what a cutoff must keep.
    pos_hit = sorted(p["top_scores"][0] for p in per_query if "none" not in p["tags"] and p["rank"] == 1)
    candidates = sorted(set(none + pos))
    best = None
    for t in candidates + [max(candidates) + 1e-9]:
        errors = sum(1 for s in none if s >= t) + sum(1 for s in pos if s < t)
        if best is None or errors < best[1]:
            best = (t, errors)
    return {
        "none_top1": none,
        "none_max": max(none),
        "pos_min": min(pos),
        "pos_median": statistics.median(pos),
        "pos_hit1_min": min(pos_hit) if pos_hit else None,
        "separable": max(none) < min(pos),
        "best_threshold": best[0],
        "best_errors": best[1],
        "none_above_best": sum(1 for s in none if s >= best[0]),
        "pos_below_best": sum(1 for s in pos if s < best[0]),
        "pos_hit1_below_none_max": sum(1 for s in pos_hit if s <= max(none)),
        "n_none": len(none),
        "n_pos": len(pos),
    }


def run_hybrid(spec):
    """Per item: the embedding's cosine and the pinyin BM25 scaled to 0-1, combined by max or a weighted sum.

    The pinyin score is divided by one fixed scale, the 99th percentile of all its
    query x item scores, so a strong pinyin match is about 1 and the result stays
    an absolute score a cutoff can use (no normalising per query).
    """
    import numpy as np

    emb = json.loads((RESULTS / f"{spec['base']}.json").read_text())
    pin = json.loads((RESULTS / f"{spec['pinyin']}.json").read_text())
    e = np.array(emb["scores"])
    p = np.array(pin["scores"])
    scale = float(np.percentile(p, 99))
    pn = np.minimum(p / scale, 1.0)
    h = np.maximum(e, pn) if spec["mode"] == "max" else (1 - HYBRID_WEIGHT) * e + HYBRID_WEIGHT * pn
    speed = dict(emb["speed"])
    speed["note"] = f"pinyin scale {scale:.2f}"
    return h.tolist(), speed


def run_one(name):
    spec = RANKERS[name]
    memories, queries = load_test_set()
    if spec["kind"] == "st":
        scores, speed = run_st(spec, memories, queries)
    elif spec["kind"] == "hybrid":
        scores, speed = run_hybrid(spec)
    else:
        scores, speed = run_baseline(spec["kind"], memories, queries, spec)
    scores = [[round(x, 5) for x in row] for row in scores]
    result = {"ranker": name, "spec": spec, "speed": speed, "scores": scores}
    for scope in ("room", "global"):
        pq = evaluate(memories, queries, scores, scope)
        result[scope] = {"summary": summarize(pq), "cutoff": cutoff(pq), "per_query": pq}
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(json.dumps(result, ensure_ascii=False))
    s = result["room"]["summary"]["overall"]
    print(f"{name}: in-room hit@1 {s['hit1']:.2f} hit@3 {s['hit3']:.2f} MRR {s['mrr']:.3f}  {speed}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ranker", choices=list(RANKERS))
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--only", nargs="*", help="with no --ranker: run just these")
    args = ap.parse_args()
    if args.ranker:
        run_one(args.ranker)
        return
    if not args.report:
        for name in args.only or RANKERS:
            subprocess.run([sys.executable, __file__, "--ranker", name], check=True)
    subprocess.run([sys.executable, str(HERE / "make-report.py")], check=True)


if __name__ == "__main__":
    main()
