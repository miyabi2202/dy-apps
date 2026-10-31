"""Turn chat-bot/data/embedding-eval/results/*.json into results/report.md there: the tables the README quotes, and every query where the main rankers disagree."""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Beside the test set in the bot's data/ (not in git; see run-eval.py).
DATA = HERE.parent / "data" / "embedding-eval"
RESULTS = DATA / "results"
ORDER = [
    "bm25", "jaccard", "pinyin", "pinyin-fuzzy",
    "qwen3-0.6b", "qwen3-0.6b-default-prompt", "qwen3-0.6b-no-prompt",
    "qwen3-4b", "qwen3-4b-default-prompt", "qwen3-4b-no-prompt",
    "bge-m3",
    "qwen3-0.6b+pinyin-max", "qwen3-0.6b+pinyin-sum",
    "qwen3-4b+pinyin-max", "qwen3-4b+pinyin-sum",
    "bge-m3+pinyin-max", "bge-m3+pinyin-sum",
]
MAIN = ["bm25", "pinyin-fuzzy", "qwen3-0.6b", "qwen3-4b", "bge-m3", "qwen3-4b+pinyin-sum"]
TAGS = ["lexical", "paraphrase", "related", "slang", "game", "asr-typo", "homophone", "typo-sound", "typo-shape"]


def pct(x):
    return f"{x * 100:.0f}%" if x is not None else "–"


def metrics(rows):
    if not rows:
        return None
    return {
        "n": len(rows),
        "hit1": sum(1 for p in rows if p["rank"] == 1) / len(rows),
        "hit3": sum(1 for p in rows if p["rank"] and p["rank"] <= 3) / len(rows),
        "mrr": sum(1 / p["rank"] for p in rows if p["rank"]) / len(rows),
    }


def is_new(p):
    return p["id"][0] in "hsx"


def weight_sweep():
    """The sum hybrid at other pinyin weights, in-room, from the saved scores (no model needed)."""
    import importlib.util

    import numpy as np

    spec = importlib.util.spec_from_file_location("run_eval", HERE / "run-eval.py")
    ev = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ev)
    memories, queries = ev.load_test_set()
    pin = np.array(json.loads((RESULTS / "pinyin-fuzzy.json").read_text())["scores"])
    pn = np.minimum(pin / np.percentile(pin, 99), 1.0)
    out = ["## Sum hybrid at other weights, in-room ((1 - w) × cosine + w × pinyin)\n",
           "| base | w | hit@1 | MRR | first 38: hit@1 | homophone + typo (18): hit@1 | paraphrase + related (22): hit@1 | fewest cutoff errors |",
           "|---|---|---|---|---|---|---|---|"]
    for base in ("qwen3-0.6b", "qwen3-4b", "bge-m3"):
        if not (RESULTS / f"{base}.json").exists():
            continue
        e = np.array(json.loads((RESULTS / f"{base}.json").read_text())["scores"])
        for w in (0.0, 0.1, 0.15, 0.2, 0.3):
            pq = ev.evaluate(memories, queries, ((1 - w) * e + w * pn).tolist(), "room")
            pos = [p for p in pq if "none" not in p["tags"]]
            a = metrics(pos)
            old = metrics([p for p in pos if not is_new(p)])
            new = metrics([p for p in pos if is_new(p)])
            pr = metrics([p for p in pos if {"paraphrase", "related"} & set(p["tags"])])
            c = ev.cutoff(pq)
            out.append(f"| {base} | {w} | {pct(a['hit1'])} | {a['mrr']:.3f} | {pct(old['hit1'])} | {pct(new['hit1'])} | "
                       f"{pct(pr['hit1'])} | {c['best_errors']} (t={c['best_threshold']:.3f}) |")
    out.append("")
    return out


def main():
    test = json.loads((DATA / "test-set.json").read_text())
    mem = {m["id"]: m["text"] for m in test["memories"]}
    qtext = {q["id"]: q["text"] for q in test["queries"]}
    res = {n: json.loads((RESULTS / f"{n}.json").read_text()) for n in ORDER if (RESULTS / f"{n}.json").exists()}
    out = []

    for scope, title in (("room", "In-room pool (the room's items + Fairy's days)"), ("global", f"Whole pool (all {len(mem)} items)")):
        out.append(f"## {title}\n")
        out.append("| ranker | hit@1 | hit@3 | MRR | first 38 (q01-q44): hit@1 / MRR | homophone + typo (18): hit@1 / MRR | `none` top-1 max | positive top-1 min | one cutoff separates? | fewest errors at one cutoff |")
        out.append("|---|---|---|---|---|---|---|---|---|---|")
        for n, r in res.items():
            s, c = r[scope]["summary"]["overall"], r[scope]["cutoff"]
            pq = [p for p in r[scope]["per_query"] if "none" not in p["tags"]]
            old, new = metrics([p for p in pq if not is_new(p)]), metrics([p for p in pq if is_new(p)])
            out.append(
                f"| {n} | {pct(s['hit1'])} | {pct(s['hit3'])} | {s['mrr']:.3f} | {pct(old['hit1'])} / {old['mrr']:.3f} | "
                f"{pct(new['hit1'])} / {new['mrr']:.3f} | {c['none_max']:.3f} | {c['pos_min']:.3f} | "
                f"{'yes' if c['separable'] else 'no'} | {c['best_errors']} of {c['n_none'] + c['n_pos']} (t={c['best_threshold']:.3f}: "
                f"{c['none_above_best']} none above, {c['pos_below_best']} positive below) |"
            )
        out.append("")

    out.append("## Per tag, in-room (hit@1 / MRR)\n")
    n_by_tag = next(iter(res.values()))["room"]["summary"]["by_tag"]
    out.append("| ranker | " + " | ".join(f"{t} (n={n_by_tag[t]['n']})" for t in TAGS) + " |")
    out.append("|---|" + "---|" * len(TAGS))
    for n, r in res.items():
        bt = r["room"]["summary"]["by_tag"]
        out.append(f"| {n} | " + " | ".join(f"{pct(bt[t]['hit1'])} / {bt[t]['mrr']:.2f}" for t in TAGS) + " |")
    out.append("")

    out.append("## Top-1 scores of the `none` queries vs the positives, in-room\n")
    for n, r in res.items():
        c = r["room"]["cutoff"]
        out.append(
            f"- {n}: none {', '.join(f'{x:.3f}' for x in c['none_top1'])}; positives min {c['pos_min']:.3f}, "
            f"median {c['pos_median']:.3f}; positives ranked right but scoring ≤ the highest none: {c['pos_hit1_below_none_max']}"
        )
    out.append("")

    out.append("## Speed (one ~300-character query)\n")
    out.append("| ranker | device | load (s) | embed the pool (s) | median per query (ms) | process max RSS (MB) | MPS driver (MB) |")
    out.append("|---|---|---|---|---|---|---|")
    for n, r in res.items():
        if r["spec"]["kind"] == "hybrid":
            continue
        sp = r["speed"]
        out.append(
            f"| {n} | {sp['device']}{' (' + sp['note'] + ')' if sp.get('note') else ''} | {sp['load_s']:.1f} | {sp['pool_embed_s']:.2f} | "
            f"{sp['query_median_ms']:.1f} | {sp.get('max_rss_mb', 0):.0f} | {sp.get('mps_driver_mb', 0):.0f} |"
        )
    out.append("")

    out.append("## Where the main rankers' first pick differs (in-room)\n")
    main = [n for n in MAIN if n in res]
    pq = {n: {p["id"]: p for p in res[n]["room"]["per_query"]} for n in main}
    for qid in pq[main[0]]:
        tops = {n: pq[n][qid]["top"][0] for n in main}
        if len(set(tops.values())) == 1:
            continue
        p0 = pq[main[0]][qid]
        out.append(f"### {qid} ({', '.join(p0['tags'])})\n")
        out.append("> " + qtext[qid].replace("\n", "  \n> ") + "\n")
        out.append(f"expected: {', '.join(p0['expected']) or 'nothing'}\n")
        for n in main:
            p = pq[n][qid]
            mark = "✓" if p["rank"] == 1 else ("–" if not p["expected"] else f"✗ (right one at {p['rank']})")
            t = p["top"][0]
            out.append(f"- {n} {mark} {t} {p['top_scores'][0]:.3f}: {mem[t][:60]}")
        out.append("")

    out.extend(weight_sweep())
    (RESULTS / "report.md").write_text("\n".join(out))
    print("\n".join(out[: out.index("## Where the main rankers' first pick differs (in-room)\n")]))


if __name__ == "__main__":
    main()
