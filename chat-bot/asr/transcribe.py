"""Live transcription worker for the chat bot.

ffmpeg pulls a live stream's audio, fsmn-vad finds where each sentence starts and ends,
FireRedASR2-AED transcribes it, and AST (an AudioSet classifier) scores how much it sounds like
speech and like singing, since a song in the background gets transcribed as if the streamer said
it. Each sentence is printed to stdout as one JSON line:

    {"start": 1792131000.1, "end": 1792131004.6, "text": "…", "speech": 0.93, "singing": 0.02}

`start` and `end` are Unix times in seconds; `speech` and `singing` are AST's 0–1 scores. The text
has no punctuation: FireRedASR2-AED doesn't add any. Logs go to stderr. Audio never touches the disk:
only the sentence being spoken is held in memory. The worker exits when the stream ends; the
bot restarts it with a fresh stream URL.

    uv run transcribe.py <stream url> [--device auto|cpu|mps|cuda] [--realtime] [--model-dir DIR]

FireRedASR2-AED (4.7 GB) is downloaded into --model-dir on the first run. It needs a GPU (Apple's
or CUDA) to keep up with a stream: on a CPU a sentence takes longer to transcribe than to say.
"""

import argparse
import contextlib
import json
import logging
import os
import re
import subprocess
import sys
import time

import numpy as np
import torch
from fireredasr2s.fireredasr2.asr import load_fireredasr_aed_model
from fireredasr2s.fireredasr2.data.asr_feat import ASRFeatExtractor
from fireredasr2s.fireredasr2.tokenizer.aed_tokenizer import ChineseCharEnglishSpmTokenizer
from funasr import AutoModel
from huggingface_hub import snapshot_download
from transformers import ASTFeatureExtractor, ASTForAudioClassification

RATE = 16000
CHUNK_MS = 200
CHUNK_BYTES = RATE * CHUNK_MS // 1000 * 2  # s16le
# A sentence longer than this is cut, so one never grows without bound.
MAX_SENTENCE_MS = 15000
# Restart the VAD's state this often, between sentences, so its buffers stay small.
VAD_RESET_MS = 5 * 60 * 1000
ASR_MODEL = "FireRedTeam/FireRedASR2-AED"
AST_MODEL = "MIT/ast-finetuned-audioset-10-10-0.4593"
# AudioSet classes that count as each kind of voice.
SPEECH_LABELS = {"Speech", "Male speech, man speaking", "Female speech, woman speaking",
                 "Child speech, kid speaking", "Conversation", "Narration, monologue"}
SINGING_LABELS = {"Singing", "Choir", "Male singing", "Female singing", "Child singing",
                  "Synthetic singing", "Rapping", "Humming"}


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


class Recognizer:
    """FireRedASR2-AED: a sentence's audio to its text, decoded as its own inference script does."""

    def __init__(self, model_dir: str, device: str):
        if not os.path.exists(os.path.join(model_dir, "model.pth.tar")):
            log(f"downloading {ASR_MODEL} into {model_dir}")
            snapshot_download(ASR_MODEL, local_dir=model_dir)
        self.device = device
        self.features = ASRFeatExtractor(os.path.join(model_dir, "cmvn.ark"))
        self.model = load_fireredasr_aed_model(os.path.join(model_dir, "model.pth.tar")).to(device).eval()
        self.tokenizer = ChineseCharEnglishSpmTokenizer(
            os.path.join(model_dir, "dict.txt"), os.path.join(model_dir, "train_bpe1000.model"))

    def __call__(self, audio: np.ndarray) -> str:
        # Its features expect 16-bit sample values.
        pcm = (audio * 32768).clip(-32768, 32767).astype(np.int16)
        feats, lengths, *_ = self.features([(RATE, pcm)], ["sentence"])
        if feats is None:
            return ""
        with torch.no_grad():
            hyps = self.model.transcribe(
                feats.to(self.device), lengths.to(self.device), beam_size=3, nbest=1,
                decode_max_len=0, softmax_smoothing=1.25, length_penalty=0.6, eos_penalty=1.0)
        ids = [int(i) for i in hyps[0][0]["yseq"].cpu()]
        return re.sub(r"<blank>|<sil>", "", self.tokenizer.detokenize(ids)).strip()


class VoiceClassifier:
    """Scores a sentence's audio for speech and for singing, each the top of its AudioSet classes."""

    def __init__(self, device: str):
        self.device = device
        self.features = ASTFeatureExtractor.from_pretrained(AST_MODEL)
        self.model = ASTForAudioClassification.from_pretrained(AST_MODEL).to(device).eval()
        ids = self.model.config.label2id
        self.speech = [ids[label] for label in SPEECH_LABELS]
        self.singing = [ids[label] for label in SINGING_LABELS]

    def __call__(self, audio: np.ndarray) -> tuple[float, float]:
        inputs = self.features(audio, sampling_rate=RATE, return_tensors="pt")["input_values"]
        with torch.no_grad():
            scores = self.model(inputs.to(self.device)).logits[0].sigmoid().cpu()
        return round(float(scores[self.speech].max()), 2), round(float(scores[self.singing].max()), 2)


def load_models(device: str, model_dir: str) -> tuple[AutoModel, Recognizer, VoiceClassifier]:
    vad = AutoModel(
        model="fsmn-vad",
        max_single_segment_time=MAX_SENTENCE_MS,
        disable_update=True,
        log_level="ERROR",
    )
    asr = Recognizer(model_dir, device)
    voice = VoiceClassifier(device)
    # The first run on a GPU compiles kernels; do it before the stream starts.
    silence = np.zeros(RATE, dtype=np.float32)
    asr(silence)
    voice(silence)
    return vad, asr, voice


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--realtime", action="store_true", help="read input at its own speed (for testing with a file)")
    parser.add_argument("--model-dir", default=os.path.expanduser("~/.cache/fireredasr2/FireRedASR2-AED"))
    args = parser.parse_args()

    device = pick_device(args.device)
    log(f"loading models on {device}")
    if device == "cpu":
        log("no GPU: transcription will fall behind the stream")
    # FunASR prints while loading; stdout is only for transcript lines.
    with contextlib.redirect_stdout(sys.stderr):
        vad, asr, voice = load_models(device, args.model_dir)
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
        text = asr(audio)
        if not re.search(r"\w", text):
            return
        speech, singing = voice(audio)
        now = time.time()
        duration = (end - beg) / 1000
        line = {
            "start": round(now - duration, 2),
            "end": round(now, 2),
            "text": text,
            "speech": speech,
            "singing": singing,
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
