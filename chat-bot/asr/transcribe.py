"""Live transcription worker for the chat bot.

ffmpeg pulls a live stream's audio, fsmn-vad finds where each sentence starts and ends, and
SenseVoice transcribes it. Each sentence is printed to stdout as one JSON line:

    {"start": 1792131000.1, "end": 1792131004.6, "text": "…", "bgm": false, "emotion": "HAPPY"}

`start` and `end` are Unix times in seconds. Logs go to stderr. Audio never touches the disk:
only the sentence being spoken is held in memory. The worker exits when the stream ends; the
bot restarts it with a fresh stream URL.

    uv run transcribe.py <stream url> [--device auto|cpu|mps|cuda] [--realtime]
"""

import argparse
import contextlib
import json
import logging
import re
import subprocess
import sys
import time

import numpy as np
import torch
from funasr import AutoModel

RATE = 16000
CHUNK_MS = 200
CHUNK_BYTES = RATE * CHUNK_MS // 1000 * 2  # s16le
# A sentence longer than this is cut, so one never grows without bound.
MAX_SENTENCE_MS = 15000
# Restart the VAD's state this often, between sentences, so its buffers stay small.
VAD_RESET_MS = 5 * 60 * 1000
TAG = re.compile(r"<\|([^|]*)\|>")
EMOTIONS = {"HAPPY", "SAD", "ANGRY", "NEUTRAL", "FEARFUL", "DISGUSTED", "SURPRISED"}


def log(message: str) -> None:
    print(f"[asr] {message}", file=sys.stderr, flush=True)


def pick_device(name: str) -> str:
    if name != "auto":
        return name
    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_models(device: str) -> tuple[AutoModel, AutoModel]:
    vad = AutoModel(
        model="fsmn-vad",
        max_single_segment_time=MAX_SENTENCE_MS,
        disable_update=True,
        log_level="ERROR",
    )
    asr = AutoModel(model="iic/SenseVoiceSmall", device=device, disable_update=True, log_level="ERROR")
    # The first run on a GPU compiles kernels; do it before the stream starts.
    asr.generate(input=np.zeros(RATE, dtype=np.float32), language="zh", use_itn=True, disable_pbar=True)
    return vad, asr


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--realtime", action="store_true", help="read input at its own speed (for testing with a file)")
    args = parser.parse_args()

    device = pick_device(args.device)
    log(f"loading models on {device}")
    # FunASR prints while loading; stdout is only for transcript lines.
    with contextlib.redirect_stdout(sys.stderr):
        vad, asr = load_models(device)
    logging.getLogger().setLevel(logging.WARNING)

    ffmpeg = subprocess.Popen(
        # A CDN can stop sending without closing the connection; give up after 15s of silence
        # so the bot fetches the stream again instead of hanging.
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *(["-re"] if args.realtime else []),
         "-rw_timeout", "15000000", "-i", args.url, "-vn", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        stdout=subprocess.PIPE,
    )
    log("listening")

    cache: dict = {}
    vad_ms = 0  # audio the VAD has seen since its last reset
    buf = np.zeros(0, dtype=np.float32)  # audio from buf_ms on, in VAD time
    buf_ms = 0
    sentence_start: int | None = None

    def emit(beg: int, end: int) -> None:
        audio = buf[(beg - buf_ms) * RATE // 1000 : (end - buf_ms) * RATE // 1000]
        if len(audio) < RATE // 4:
            return
        raw = asr.generate(input=audio, language="zh", use_itn=True, disable_pbar=True)[0]["text"]
        tags = set(TAG.findall(raw))
        text = TAG.sub("", raw).strip()
        if not re.search(r"\w", text):
            return
        now = time.time()
        duration = (end - beg) / 1000
        line = {
            "start": round(now - duration, 2),
            "end": round(now, 2),
            "text": text,
            "bgm": "BGM" in tags,
            "emotion": next((t for t in tags if t in EMOTIONS), None),
        }
        print(json.dumps(line, ensure_ascii=False), flush=True)

    while True:
        raw = ffmpeg.stdout.read(CHUNK_BYTES)
        if not raw:
            break
        chunk = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
        buf = np.concatenate([buf, chunk])
        vad_ms += len(chunk) * 1000 // RATE
        segments = vad.generate(input=chunk, cache=cache, is_final=False, chunk_size=CHUNK_MS, disable_pbar=True)
        for beg, end in segments[0]["value"] if segments else []:
            if beg != -1:
                sentence_start = beg
            if end != -1 and sentence_start is not None:
                emit(sentence_start, end)
                sentence_start = None
        if sentence_start is None:
            # Between sentences: keep only the last second, for a sentence about to start.
            keep = RATE
            if len(buf) > keep:
                buf_ms += (len(buf) - keep) * 1000 // RATE
                buf = buf[-keep:]
            if vad_ms >= VAD_RESET_MS:
                cache, vad_ms, buf, buf_ms = {}, 0, np.zeros(0, dtype=np.float32), 0
        else:
            # Drop audio from before the open sentence.
            drop = (sentence_start - buf_ms) * RATE // 1000
            if drop > 0:
                buf, buf_ms = buf[drop:], sentence_start

    if sentence_start is not None:
        emit(sentence_start, vad_ms)  # the stream ended mid-sentence
    code = ffmpeg.wait()
    log(f"stream ended (ffmpeg exit {code})")


if __name__ == "__main__":
    main()
