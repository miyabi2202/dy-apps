"""Live transcription worker for the chat bot.

ffmpeg pulls a live stream's audio, fsmn-vad finds where each sentence starts and ends,
FireRedLID tells which language it's in, FireRedASR2-AED transcribes it (Mandarin, Chinese
dialects, English and the rest) or SenseVoiceSmall does (Japanese and Korean, which
FireRedASR2-AED doesn't know: it hears a Japanese song as romaji, <unk>s or loops), AST (an
AudioSet classifier) scores how much it sounds like speech and like music, since a song gets
transcribed as if the streamer said it (AudioSet labels most songs Music and few of them Singing,
so a song scores high on Music, not on Singing), and CAM++ voiceprints tell the streamer from
whoever they're linked up with (连线). Each sentence is printed to stdout as one JSON line:

    {"start": 1792131000.1, "end": 1792131004.6, "text": "…", "lang": "zh", "speech": 0.93,
     "music": 0.02, "speaker": 0, "host": true, "voice": 0.71}

`start` and `end` are Unix times in seconds; `lang` is FireRedLID's language code ("zh", "en",
"ja", "ko", …), null for a sentence under 2 s, which skips it and is taken for Mandarin (only a
sentence LID is at least 0.8 sure is Japanese or Korean goes to SenseVoiceSmall); `speech` and `music` are AST's 0–1 scores. `speaker` numbers the voices heard so
far, `host` says whether it's the streamer's (see Voices), and `voice` is how close it was to that
voice (null for a new one); all three are null for a sentence too short or sung, whose voiceprint
can't be trusted. FireRedASR2-AED's text has no punctuation; SenseVoiceSmall's has. Logs go to
stderr. Audio never touches the disk: only the sentence being spoken is held in memory. The
worker exits when the stream ends; the bot restarts it with a fresh stream URL.

    uv run transcribe.py <stream url> [--device auto|cpu|mps|cuda] [--realtime] [--model-dir DIR]
        [--lid-dir DIR] [--same-voice 0.6]

FireRedASR2-AED (4.7 GB) is downloaded into --model-dir and FireRedLID (3.5 GB) into --lid-dir on
the first run, SenseVoiceSmall (0.9 GB) into FunASR's cache. They need a GPU (Apple's or CUDA) to
keep up with a stream: on a CPU a sentence takes longer to transcribe than to say.
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
from fireredasr2s.fireredlid.data.feat import FeatExtractor as LidFeatExtractor
from fireredasr2s.fireredlid.lid import load_fireredlid_model
from fireredasr2s.fireredlid.tokenizer.lid_tokenizer import LidTokenizer
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
# A sentence this close (cosine) to a voice heard before is that voice; otherwise a new one
# (--same-voice). Synthetic voices scored 0.83–0.90 against themselves and up to 0.62 against
# others (two Apple voices of the same sex); real voices over music may score lower against
# themselves, so this is to be tuned from the logged `voice`.
SAME_VOICE = 0.6
# Shorter sentences give voiceprints too rough to sort.
MIN_VOICE_SECONDS = 1.5
# Below this speech score a line is sung (as in the bot's transcript.ts); singing changes a voice
# too much for its voiceprint to match the same person talking.
SUNG_BELOW_SPEECH = 0.2
# On music the decoder can get stuck repeating a character; a sentence can't hold more than this
# many tokens a second (Mandarin is about 4–6 characters a second, quick singing a bit more).
MAX_TOKENS_PER_SECOND = 8
# Six or more of the same character or phrase (up to 12 characters, as in "HELLO HELLO …") in a
# row, spaces between them or not, are cut down to three.
REPEAT = re.compile(r"(\S.{0,11}?)(?:\s*\1){5,}")
LID_MODEL = "FireRedTeam/FireRedLID"
# Languages FireRedASR2-AED doesn't know (it hears Japanese as romaji, <unk>s or loops), which go
# to SenseVoiceSmall instead.
SENSEVOICE_LANGS = {"ja", "ko"}
# Language ID is unreliable on short sentences (under ~1.5 s it guessed ko, pt, fa… for Japanese
# and Mandarin alike), so shorter ones skip it and go to FireRedASR2-AED, as Mandarin.
MIN_LID_SECONDS = 2.0
# And a sentence only goes to SenseVoice when LID is this sure (sung Japanese of 2 s or more
# scored 0.85–1.0); otherwise FireRedASR2-AED.
MIN_LID_CONFIDENCE = 0.8
AST_MODEL = "MIT/ast-finetuned-audioset-10-10-0.4593"
# AudioSet classes that count as each kind of voice.
SPEECH_LABELS = {"Speech", "Male speech, man speaking", "Female speech, woman speaking",
                 "Child speech, kid speaking", "Conversation", "Narration, monologue"}
MUSIC_LABELS = {"Music", "Song", "Background music", "Singing", "Choir", "Male singing",
                "Female singing", "Child singing", "Synthetic singing", "Rapping", "Humming"}


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
        max_len = 4 + int(len(audio) / RATE * MAX_TOKENS_PER_SECOND)
        with torch.no_grad():
            hyps = self.model.transcribe(
                feats.to(self.device), lengths.to(self.device), beam_size=3, nbest=1,
                decode_max_len=max_len, softmax_smoothing=1.25, length_penalty=0.6, eos_penalty=1.0)
        ids = [int(i) for i in hyps[0][0]["yseq"].cpu()]
        return collapse_repeats(re.sub(r"<blank>|<sil>", "", self.tokenizer.detokenize(ids)).strip())


def collapse_repeats(text: str) -> str:
    """Cuts each REPEAT run down to its first three, keeping the spaces between them."""

    def first_three(match: re.Match) -> str:
        unit, run, end = match[1], match[0], 0
        for _ in range(3):
            end = run.index(unit, end) + len(unit)
        return run[:end]

    return REPEAT.sub(first_three, text)


class LanguageId:
    """FireRedLID: which language a sentence is in, as its code ("zh", "en", "ja", …), and how sure."""

    def __init__(self, model_dir: str, device: str):
        if not os.path.exists(os.path.join(model_dir, "model.pth.tar")):
            log(f"downloading {LID_MODEL} into {model_dir}")
            snapshot_download(LID_MODEL, local_dir=model_dir)
        self.device = device
        self.features = LidFeatExtractor(os.path.join(model_dir, "cmvn.ark"))
        # Loaded by hand: its FireRedLid class only runs on CUDA or the CPU.
        self.model = load_fireredlid_model(os.path.join(model_dir, "model.pth.tar")).to(device).eval()
        self.tokenizer = LidTokenizer(os.path.join(model_dir, "dict.txt"))

    def __call__(self, audio: np.ndarray) -> tuple[str | None, float]:
        pcm = (audio * 32768).clip(-32768, 32767).astype(np.int16)
        feats, lengths, *_ = self.features([(RATE, pcm)], ["sentence"])
        if feats is None:
            return None, 0.0
        with torch.no_grad():
            hyps = self.model.process(
                feats.to(self.device), lengths.to(self.device), beam_size=3, nbest=1, decode_max_len=2,
                softmax_smoothing=1.25, length_penalty=0.6, eos_penalty=1.0)
        # A language and maybe its dialect or accent, like "zh mandarin"; the language is enough.
        hyp = hyps[0][0]
        words = self.tokenizer.detokenize([int(i) for i in hyp["yseq"].cpu()]).split()
        return (words[0] if words else None), float(hyp["confidence"].cpu().item())


class SenseVoice:
    """SenseVoiceSmall, for the languages FireRedASR2-AED doesn't know (SENSEVOICE_LANGS)."""

    def __init__(self, device: str):
        # On an Apple GPU a sentence took 40 ms, on the CPU 800 ms.
        self.model = AutoModel(model="iic/SenseVoiceSmall", device=device, disable_update=True, log_level="ERROR")

    def __call__(self, audio: np.ndarray, lang: str) -> str:
        result = self.model.generate(input=audio, language=lang, use_itn=True, disable_pbar=True)
        # Its text starts with tags like <|ja|><|NEUTRAL|><|Speech|><|withitn|>.
        text = re.sub(r"<\|[^|]*\|>", "", result[0]["text"] if result else "").strip()
        if lang == "ja":
            # It sometimes spaces Japanese out word by word ("次 の 曲 は"); Japanese has no spaces.
            text = re.sub(r"(?<=[^\x00-\x7f])\s+(?=[^\x00-\x7f])", "", text)
        return collapse_repeats(text)


class VoiceClassifier:
    """Scores a sentence's audio for speech and for music, each the top of its AudioSet classes."""

    def __init__(self, device: str):
        self.device = device
        self.features = ASTFeatureExtractor.from_pretrained(AST_MODEL)
        self.model = ASTForAudioClassification.from_pretrained(AST_MODEL).to(device).eval()
        ids = self.model.config.label2id
        self.speech = [ids[label] for label in SPEECH_LABELS]
        self.music = [ids[label] for label in MUSIC_LABELS]

    def __call__(self, audio: np.ndarray) -> tuple[float, float]:
        inputs = self.features(audio, sampling_rate=RATE, return_tensors="pt")["input_values"]
        with torch.no_grad():
            scores = self.model(inputs.to(self.device)).logits[0].sigmoid().cpu()
        return round(float(scores[self.speech].max()), 2), round(float(scores[self.music].max()), 2)


class Voices:
    """
    Tells voices apart as they come: each sentence's CAM++ voiceprint joins the closest voice heard
    so far if it's close enough (moving that voice's average towards it), or starts a new voice.
    The streamer is the first voice heard, until another has been heard for more than twice as
    long: a guest speaking first is soon corrected, but an even back-and-forth doesn't keep
    swapping who's who.
    """

    def __init__(self, same_voice: float):
        self.same_voice = same_voice
        # Small enough for the CPU, which leaves the GPU to the recognizer.
        self.model = AutoModel(model="cam++", device="cpu", disable_update=True, log_level="ERROR")
        self.centroids: list[np.ndarray] = []
        self.seconds: list[float] = []
        self.host: int | None = None

    def __call__(self, audio: np.ndarray, speech: float) -> tuple[int | None, bool | None, float | None]:
        seconds = len(audio) / RATE
        if seconds < MIN_VOICE_SECONDS or speech < SUNG_BELOW_SPEECH:
            return None, None, None
        embedding = self.model.generate(input=audio, disable_pbar=True)[0]["spk_embedding"]
        voiceprint = embedding.reshape(-1).float().cpu().numpy()
        voiceprint /= np.linalg.norm(voiceprint)
        similarities = [float(c @ voiceprint) for c in self.centroids]
        best = int(np.argmax(similarities)) if similarities else -1
        if best < 0 or similarities[best] < self.same_voice:
            self.centroids.append(voiceprint)
            self.seconds.append(seconds)
            speaker, similarity = len(self.centroids) - 1, None
        else:
            weight = self.seconds[best]
            centroid = self.centroids[best] * weight + voiceprint * seconds
            self.centroids[best] = centroid / np.linalg.norm(centroid)
            self.seconds[best] += seconds
            speaker, similarity = best, round(similarities[best], 2)
        if self.host is None or self.seconds[speaker] > 2 * self.seconds[self.host]:
            self.host = speaker
        return speaker, speaker == self.host, similarity


def load_models(
    device: str, model_dir: str, lid_dir: str, same_voice: float
) -> tuple[AutoModel, Recognizer, LanguageId, SenseVoice, VoiceClassifier, Voices]:
    vad = AutoModel(
        model="fsmn-vad",
        max_single_segment_time=MAX_SENTENCE_MS,
        disable_update=True,
        log_level="ERROR",
    )
    asr = Recognizer(model_dir, device)
    lid = LanguageId(lid_dir, device)
    sensevoice = SenseVoice(device)
    voice = VoiceClassifier(device)
    # The first run on a GPU compiles kernels; do it before the stream starts.
    silence = np.zeros(RATE, dtype=np.float32)
    asr(silence)
    lid(silence)
    sensevoice(silence, "ja")
    voice(silence)
    return vad, asr, lid, sensevoice, voice, Voices(same_voice)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--realtime", action="store_true", help="read input at its own speed (for testing with a file)")
    parser.add_argument("--same-voice", type=float, default=SAME_VOICE,
                        help="how close (0–1) a sentence's voiceprint must be to a voice heard before to count as it")
    parser.add_argument("--model-dir", default=os.path.expanduser("~/.cache/fireredasr2/FireRedASR2-AED"))
    parser.add_argument("--lid-dir", default=os.path.expanduser("~/.cache/fireredasr2/FireRedLID"))
    args = parser.parse_args()

    device = pick_device(args.device)
    log(f"loading models on {device}")
    if device == "cpu":
        log("no GPU: transcription will fall behind the stream")
    # FunASR prints while loading; stdout is only for transcript lines.
    with contextlib.redirect_stdout(sys.stderr):
        vad, asr, lid, sensevoice, voice, voices = load_models(
            device, args.model_dir, args.lid_dir, args.same_voice)
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
        # Short sentences skip language ID (unknown `lang`) and are taken for Mandarin.
        lang, sure = lid(audio) if len(audio) >= MIN_LID_SECONDS * RATE else (None, 0.0)
        use_sensevoice = lang in SENSEVOICE_LANGS and sure >= MIN_LID_CONFIDENCE
        text = sensevoice(audio, lang) if use_sensevoice else asr(audio)
        if not re.search(r"\w", text):
            return
        speech, music = voice(audio)
        speaker, host, similarity = voices(audio, speech)
        now = time.time()
        duration = (end - beg) / 1000
        line = {
            "start": round(now - duration, 2),
            "end": round(now, 2),
            "text": text,
            "lang": lang,
            "speech": speech,
            "music": music,
            "speaker": speaker,
            "host": host,
            "voice": similarity,
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
