"""Scores two add-on sources of song breaks against a recording's answer key, before they're wired in.

    uv run --directory chat-bot/asr python -I chat-bot/scripts/song-break-sources.py \\
        --heard <heard.jsonl> --grid <shazam.jsonl> --cache <lookups.jsonl> [--wav <file.wav>] \\
        [--features <features.npz>] [--call]

- pauses: today's rule (currentSong in src/core/songs/transcript.ts): a sung line after more than
  60 s without one, or more than 15 s with two lines of talk, starts a song.
- shazam (A): the worker's lookup cycle (Recordings: on a sung sentence, at most every 20 s, or
  again after 10 s without one) looks up the whole mix of the last 15 s. The backing track's title
  (version tags dropped) changing between lookups is a break, at the longest pause in the singing
  between the two; the same title across lookups is one song (a `same` span) from its first lookup
  to its last.
- novelty (B): Foote's checkerboard novelty on per-second chroma + MFCC of the backing (the mix
  minus Demucs' vocals, from backing-features.py), its peaks breaks, kept only near singing. It
  found nothing: song starts scored under peaks inside songs.
- backing gaps (B'): the same backing's loudness, a second at a time, measured within a minute of
  a sung line: quiet (some dB under its median over the minute before) for 3 s or more between two
  sung lines is a break at the second; no such gap between them makes them one song (`same`).

Combined as song-breaks.ts ranks them: shazam > novelty > pauses, a break counting unless a
higher-ranked `same` span covers it. Each is scored on the stretch of live singing: a song start
found within ±15 s (right), later (late), not at all (missed), and breaks inside a song (false).

--heard is the bot log's `heard` lines as JSON lines `{end (unix s), text, speech, lang, host}`;
--grid a shazam-windows.py run (15 s windows every 10 s, `at` their UTC start) reused where a
lookup's window is within 5 s of one; --cache keeps the lookups made here (with --call, on --wav).
"""

import argparse
import asyncio
import io
import json
import re
import wave
from datetime import datetime, timezone

import numpy as np

DAY = "2026-10-22"


def utc(hms: str) -> float:
    return datetime.fromisoformat(f"{DAY}T{hms}+00:00").timestamp()


def hms(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%H:%M:%S")


T0, END = utc("02:02:29"), utc("03:17:18")  # the recording's first and last sample
SINGING = (utc("02:43:00"), utc("03:17:00"))
TRUTH = [(utc(t), title) for t, title in [
    ("02:43:39", "璀璨冒险人"), ("02:48:11", "达拉崩吧"), ("02:52:45", "若她只是谣言"),
    ("02:56:32", "为你我受冷风吹"), ("03:00:50", "征服"), ("03:06:02", "最熟悉的陌生人"),
    ("03:10:50", "南屏晚钟"), ("03:15:33", "年轮说")]]
RIGHT_S = 15

# The worker's lookup cycle (transcribe.py).
CHECK_S, GAP_S, WINDOW_S = 20, 10, 15
# Today's pause rule.
PAUSE_S, TALK_PAUSE_S, TALK_LINES = 60, 15, 2

BRACKETED = re.compile(r"[（(\[【「《].*?[）)\]】」》]")
DASHED = re.compile(r"\s*[-–—].*$")


def display_title(title: str) -> str:
    return DASHED.sub("", BRACKETED.sub("", title)).strip()


def worker_sung(line: dict) -> bool:
    return (line["speech"] is not None and line["speech"] < 0.2) or line["lang"] in ("ja", "ko")


def bot_sung(line: dict) -> bool:
    return line["speech"] is not None and line["speech"] < 0.2


def line_start(line: dict) -> float:
    # The log has when a line came in, about when it ended; Mandarin is sung at about 4 characters a second.
    return line["end"] - min(15, max(1, len(line["text"]) / 4))


# --- lookups -------------------------------------------------------------------------------------

def lookup_times(lines: list[dict]) -> list[float]:
    """When the worker's cycle looks up (Recordings.__call__), from the sung lines."""
    times, checked, sung = [], None, None
    for line in lines:
        if not worker_sung(line):
            continue
        now = line["end"]
        fresh = checked is not None and now - checked < CHECK_S and sung is not None and now - sung < GAP_S
        sung = now
        if not fresh and now - T0 >= 5:
            checked = now
            times.append(now)
    return times


def load_grid(path: str) -> dict[float, dict]:
    grid = {}
    for text in open(path):
        row = json.loads(text)
        if "error" not in row:
            grid[utc(row["at"])] = row
    return grid


def titles_at(times, grid, cache_path, wav_path, call) -> dict[float, dict]:
    cache = {}
    try:
        for text in open(cache_path):
            row = json.loads(text)
            cache[row["t"]] = row
    except FileNotFoundError:
        pass
    found, missing = {}, []
    for t in times:
        key = round(t, 1)
        start = t - WINDOW_S
        near = min(grid, key=lambda g: abs(g - start)) if grid else None
        if key in cache:
            found[t] = cache[key]
        elif near is not None and abs(near - start) <= 5:
            found[t] = {"t": key, "title": grid[near]["title"], "artist": grid[near]["artist"], "from": "grid"}
        else:
            missing.append(t)
    if missing and call:
        asyncio.run(call_shazam(missing, wav_path, cache_path, found))
    elif missing:
        print(f"{len(missing)} lookups have no answer yet (--call to make them)")
    return found


async def call_shazam(times, wav_path, cache_path, found) -> None:
    from shazamio import Shazam

    shazam = Shazam(language="zh-CN", endpoint_country="CN")
    with wave.open(wav_path, "rb") as source, open(cache_path, "a") as cache:
        rate = source.getframerate()
        for t in times:
            start = max(T0, t - WINDOW_S)  # the worker only has audio from when it started
            source.setpos(int((start - T0) * rate))
            frames = source.readframes(int((t - start) * rate))
            out = io.BytesIO()
            with wave.open(out, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes(frames)
            try:
                track = (await shazam.recognize(out.getvalue())).get("track")
                row = {"t": round(t, 1), "title": track and track.get("title"),
                       "artist": track and track.get("subtitle"), "from": "call"}
            except Exception as err:  # noqa: BLE001
                row = {"t": round(t, 1), "title": None, "artist": None, "error": str(err)}
            cache.write(json.dumps(row, ensure_ascii=False) + "\n")
            cache.flush()
            found[t] = row
            print(f"  {hms(t)} {row['title']} / {row['artist']}", flush=True)
            await asyncio.sleep(0.5)


# --- sources -------------------------------------------------------------------------------------

def pause_breaks(lines: list[dict]) -> list[float]:
    """currentSong's breaks: the start of each sung line after a long pause, or a shorter one with talk."""
    breaks, last, talk = [], None, 0
    for line in lines:
        if not bot_sung(line):
            if line["host"] is not False:
                talk += 1
            continue
        pause = float("inf") if last is None else line["end"] - last
        if pause > PAUSE_S or (pause > TALK_PAUSE_S and talk >= TALK_LINES):
            breaks.append(line_start(line))
        last, talk = line["end"], 0
    return breaks


def song_start(lines: list[dict], since: float, until: float) -> float:
    """The start of the sung line in (since, until] after the longest pause in the singing."""
    sung = [line for line in lines if worker_sung(line)]
    best, gap, prev = since, -1.0, None
    for line in sung:
        if line["end"] > until:
            break
        if line["end"] > since:
            pause = line_start(line) - (prev if prev is not None else since)
            if pause > gap:
                gap, best = pause, line_start(line)
        prev = line["end"]
    return best


def shazam_spans(lookups: list[tuple[float, str | None]], lines: list[dict], confirm: int = 1) -> list[dict]:
    """
    Breaks where the backing's title changes, `same` spans over each run of one title. A title
    counts once `confirm` lookups in a row (no other title between) matched it; the break goes at
    the longest pause in the singing around its first lookup (since the lookup before it's window).
    """
    spans, current, run = [], None, None  # run: [title, first t, last t, count, lookup before]
    before = None
    for t, title in lookups:
        if title is not None:
            if run and run[0] == title:
                run[2], run[3] = t, run[3] + 1
            else:
                run = [title, t, t, 1, before]
            if run[3] >= confirm and run[0] != current:
                since = (run[4] if run[4] is not None else run[1]) - WINDOW_S
                spans.append({"kind": "break", "from": song_start(lines, since, run[1]), "by": "shazam", "title": title})
                current = title
            if run[0] == current:
                # The same title across lookups: one song from its first lookup to its last.
                if spans and spans[-1]["kind"] == "same" and spans[-1]["title"] == title:
                    spans[-1]["to"] = t
                elif run[3] >= max(2, confirm):
                    spans.append({"kind": "same", "from": run[1], "to": t, "by": "shazam", "title": title})
        before = t
    return spans


def novelty_curve(feats: np.ndarray, half: int) -> np.ndarray:
    """Foote novelty: a Gaussian-tapered checkerboard kernel along the self-similarity matrix's diagonal."""
    x = feats - feats.mean(0)
    x = x / (x.std(0) + 1e-9)
    x = x / (np.linalg.norm(x, axis=1, keepdims=True) + 1e-9)
    n = len(x)
    idx = np.arange(-half, half)
    gauss = np.exp(-0.5 * ((idx + 0.5) / (half / 2)) ** 2)
    sign = np.where(idx < 0, -1.0, 1.0)
    kernel = np.outer(sign, sign) * np.outer(gauss, gauss)
    out = np.zeros(n)
    for t in range(half, n - half):
        block = x[t - half:t + half]
        out[t] = (kernel * (block @ block.T)).sum()
    return out / (kernel > 0).sum()


def peaks(curve: np.ndarray, half: int, threshold: float) -> list[int]:
    found = []
    for t in range(half, len(curve) - half):
        window = curve[t - half:t + half + 1]
        if curve[t] == window.max() and curve[t] >= threshold:
            found.append(t)
    return found


def novelty_spans(feats, lines, half, threshold, near_s=30) -> list[dict]:
    curve = novelty_curve(feats, half)
    sung = [line["end"] for line in lines if worker_sung(line)]
    spans = []
    for p in peaks(curve, half, threshold):
        at = T0 + p
        if any(abs(at - s) <= near_s for s in sung):
            spans.append({"kind": "break", "from": at, "by": "novelty", "score": round(float(curve[p]), 3)})
    return spans


def measured(lines: list[dict], around_s: int = 60) -> np.ndarray:
    """The seconds the worker measures the backing: within `around_s` after a sung line."""
    out = np.zeros(int(END - T0) + 1, bool)
    for line in lines:
        if worker_sung(line):
            a = int(line["end"] - T0)
            out[a:a + around_s] = True
    return out


def relative_quiet(back_db: np.ndarray, seen: np.ndarray, under_db: float, over_s: int = 60) -> np.ndarray:
    """Each second's quiet level: `under_db` under the median of the measured seconds in the minute before."""
    out = np.full(len(back_db), -np.inf)
    for i in range(len(back_db)):
        if seen[i]:
            before = back_db[max(0, i - over_s):i][seen[max(0, i - over_s):i]]
            if len(before) >= 10:
                out[i] = np.median(before) - under_db
    return out


def quiet_runs(back_db: np.ndarray, quiet_db, min_s: int) -> list[tuple[float, float]]:
    """Where the backing went quiet (under `quiet_db`, one level or one a second) for `min_s` seconds or more."""
    runs, start = [], None
    levels = np.broadcast_to(quiet_db, back_db.shape)
    for i, db in enumerate([*back_db, 0.0]):
        quiet = i < len(back_db) and db < levels[i]
        if quiet and start is None:
            start = i
        elif not quiet and start is not None:
            if i - start >= min_s:
                runs.append((T0 + start, T0 + i))
            start = None
    return runs


def gap_spans(back_db, lines, quiet_db, min_s, slack_s=3) -> list[dict]:
    """
    The backing track stopping between two sung lines is a break at the second; playing on through
    (no quiet run) makes them one song, so talk over it is no break.
    """
    runs = quiet_runs(back_db, quiet_db, min_s)
    sung = [line for line in lines if worker_sung(line)]
    spans = []
    for prev, cur in zip(sung, sung[1:]):
        lo, hi = prev["end"] - slack_s, line_start(cur) + slack_s
        if any(lo < a and b < hi for a, b in runs):
            spans.append({"kind": "break", "from": line_start(cur), "by": "gaps"})
        elif cur["end"] - prev["end"] < 120:
            if spans and spans[-1]["kind"] == "same" and spans[-1]["to"] >= prev["end"]:
                spans[-1]["to"] = cur["end"]
            else:
                spans.append({"kind": "same", "from": line_start(prev), "to": cur["end"], "by": "gaps"})
    return spans


# --- combining and scoring -----------------------------------------------------------------------

def combine(ranked: list[list[dict]]) -> list[dict]:
    """song-breaks.ts' combineSpans."""
    combined, higher = [], []
    for spans in ranked:
        for span in spans:
            if span["kind"] == "same" or not any(s["from"] < span["from"] <= s["to"] for s in higher):
                combined.append(span)
        higher += [s for s in spans if s["kind"] == "same"]
    return combined


def score(breaks: list[float]) -> dict:
    """Right within ±15 s, late, missed, and false breaks inside songs, on the stretch of live singing."""
    breaks = sorted({round(b, 1) for b in breaks if SINGING[0] <= b <= SINGING[1]})
    used, right, late, missed = set(), [], [], []
    for i, (start, title) in enumerate(TRUTH):
        nxt = TRUTH[i + 1][0] if i + 1 < len(TRUTH) else SINGING[1]
        near = [b for b in breaks if abs(b - start) <= RIGHT_S]
        if near:
            right.append(title)
            used.add(min(near, key=lambda b: abs(b - start)))
            continue
        after = [b for b in breaks if start + RIGHT_S < b < nxt - RIGHT_S]
        if after:
            late.append(f"{title}+{after[0] - start:.0f}s")
            used.add(after[0])
        else:
            missed.append(title)
    false = [hms(b) for b in breaks if b not in used]
    return {"right": len(right), "late": late, "missed": missed, "false": false}


def show(name: str, result: dict) -> None:
    print(f"{name:28} right {result['right']}/{len(TRUTH)}  late {len(result['late'])} {result['late']}  "
          f"missed {len(result['missed'])} {result['missed']}  false {len(result['false'])} {result['false']}")


def breaks_of(spans):
    return [s["from"] for s in spans if s["kind"] == "break"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heard", required=True)
    parser.add_argument("--grid", required=True)
    parser.add_argument("--cache", required=True)
    parser.add_argument("--wav")
    parser.add_argument("--features")
    parser.add_argument("--call", action="store_true")
    parser.add_argument("--confirm", type=int, default=1, help="lookups in a row a title needs to count")
    parser.add_argument("--feature-set", default="back_chroma,back_mfcc")
    args = parser.parse_args()

    lines = [json.loads(t) for t in open(args.heard)]
    lines = [line for line in lines if T0 <= line["end"] <= END]
    end = lines[-1]["end"]
    times = lookup_times(lines)
    hours = (end - T0) / 3600
    print(f"lookups: {len(times)} in {hours * 60:.0f} min = {len(times) / hours:.0f}/hour (today: one Shazam call each)")
    found = titles_at(times, load_grid(args.grid), args.cache, args.wav, args.call)
    lookups = [(t, display_title(found[t]["title"]) if found.get(t, {}).get("title") else None) for t in times]

    # Calls with the mix first: a vocals lookup too only when the mix matched a title not looked up before.
    vocals, last = 0, None
    for _, title in lookups:
        if title and title != last:
            vocals += 1
            last = title
    print(f"mix first: {len(times)} mix + {vocals} vocals = {(len(times) + vocals) / hours:.0f}/hour; "
          f"vocals on every match: {(len(times) + sum(1 for _, t in lookups if t)) / hours:.0f}/hour")

    print("\nlookups (mix):")
    for t, title in lookups:
        print(f"  {hms(t)} {title or '-'}")

    pauses = [{"kind": "break", "from": b, "by": "pauses"} for b in pause_breaks(lines)]
    shazam = shazam_spans(lookups, lines, args.confirm)
    print("\nshazam spans:")
    for s in shazam:
        print(f"  {s['kind']:5} {hms(s['from'])}{' – ' + hms(s['to']) if s['kind'] == 'same' else ''} {s['title']}")

    print(f"\nanswer key, {hms(SINGING[0])}–{hms(SINGING[1])}:")
    show("pauses", score(breaks_of(pauses)))
    show("shazam", score(breaks_of(shazam)))
    show("shazam + pauses", score(breaks_of(combine([shazam, pauses]))))

    bgm = lambda spans: [hms(b) for b in breaks_of(spans) if b < SINGING[0]]  # noqa: E731
    print(f"\nbefore {hms(SINGING[0])} (talk, BGM, tries): pauses {bgm(pauses)}")
    print(f"  shazam {bgm(shazam)}")
    print(f"  shazam + pauses {bgm(combine([shazam, pauses]))}")

    if args.features:
        data = np.load(args.features)
        feats = np.concatenate([data[name] for name in args.feature_set.split(",")], axis=1)
        print(f"\nnovelty on {args.feature_set} (demucs {float(data['demucs_ms_per_s']):.0f} ms per second of audio):")
        for half in (8, 12, 16):
            for threshold in (0.15, 0.2, 0.25, 0.3, 0.35):
                novelty = novelty_spans(feats, lines, half, threshold)
                tag = f"±{half}s ≥{threshold}"
                show(f"novelty {tag}", score(breaks_of(novelty)))
                show(f"novelty + pauses {tag}", score(breaks_of(combine([novelty, pauses]))))
                show(f"all three {tag}", score(breaks_of(combine([shazam, novelty, pauses]))))
                print(f"{'':28} before {hms(SINGING[0])}: {len(bgm(novelty))} novelty breaks near singing")
        back_db = 20 * np.log10(data["back_rms"] + 1e-6)
        print("\nbacking gaps (the backing track stopping between sung lines):")
        seen = measured(lines)[:len(back_db)]
        for under in (20, 25, 30):
            relative = relative_quiet(back_db, seen, under)
            for min_s in (3, 5):
                gaps = gap_spans(back_db, lines, relative, min_s)
                tag = f"{under}dB under median ≥{min_s}s"
                show(f"gaps {tag}", score(breaks_of(gaps)))
                show(f"shazam + gaps + pauses {tag}", score(breaks_of(combine([shazam, gaps, pauses]))))
                print(f"{'':28} before {hms(SINGING[0])}: {len(bgm(gaps))} gap breaks")
        for quiet_db in (-40, -45, -50):
            for min_s in (3, 5, 8):
                gaps = gap_spans(back_db, lines, quiet_db, min_s)
                tag = f"<{quiet_db}dB ≥{min_s}s"
                show(f"gaps {tag}", score(breaks_of(gaps)))
                show(f"gaps + pauses {tag}", score(breaks_of(combine([gaps, pauses]))))
                show(f"shazam + gaps + pauses {tag}", score(breaks_of(combine([shazam, gaps, pauses]))))
                print(f"{'':28} before {hms(SINGING[0])}: {len(bgm(gaps))} gap breaks")


main()
