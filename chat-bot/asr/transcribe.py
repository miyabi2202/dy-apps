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
voice (null for a new one); all three are null for a sentence too short for a voiceprint. Sung
sentences are sorted among the voices heard singing, apart from those heard talking (a singing
voice doesn't match the same person's talking one), numbered with them. FireRedASR2-AED's text has no punctuation; SenseVoiceSmall's has. Logs go to
stderr. Audio never touches the disk: only the sentence being spoken, and the last 15 s for
naming the music, are held in memory.

The models load once, at start (about half a minute), then the worker prints `{"ready": true}` and
waits for the bot to write `{"url": "…"}` as a line to stdin. It listens to that stream until it
ends, prints `{"stream_ended": true, "code": <ffmpeg's exit code>}` and waits for the next URL, so a
stream that ends or whose URL expires is back in seconds; a new URL while one is playing replaces
it. The worker exits when stdin closes. Given a URL on the command line instead, it listens to just
that one and exits when it ends.

With `--serve PORT` it doesn't exit: it listens on 127.0.0.1:PORT and speaks the same lines (the
`{"ready": true}` and the rest, one JSON object a line, UTF-8) to whoever connects, one bot at a
time (another bot that connects meanwhile is told `{"busy": true}` and disconnected); it starts
listening before the models load, and a bot that connects meanwhile gets `ready` once
they have. When the bot disconnects its stream is stopped (ffmpeg killed), but the models and the
voiceprints it learned stay loaded, and the next connection is told `{"ready": true}` at once. That
way restarting the bot doesn't reload the models. It's started by hand, before the bot, which only
connects to it (src/adapters/asr-worker.ts); stop it with Ctrl+C or `pkill -f "transcribe.py --serve"`.
The bot can stop it too, by writing `{"quit": true}`: it does when room-feed has gone (the stream
ended), as it exits itself.

The bot can also ask what music is playing, by writing `{"music_id": 1}` (any id) as a line to
stdin: the worker looks up the last 15 s with Shazam (shazamio: the fingerprint is worked out
here, and only it is sent) and prints `{"music_id": 1, "title": "…", "artist": "…"}`, with both
null when nothing matched, or `{"music_id": 1, "error": "…"}`. A song playing under the streamer's
talk is usually still found; the streamer singing it themselves usually isn't.

Two add-ons help the bot tell where one song ends and the next begins (see AddOns), each on unless
turned off, and with both off the lines are as they were without them. BackingTitles
(`--no-backing-title`): in Recordings' cycle the whole mix is looked up first, as Shazam names the
backing track a streamer sings over, and a sung sentence carries what it found,
`"backing": {"title": "…", "artist": "…", "at": <when it looked, Unix s>}` (null for none), held
like `played`; the vocals are then
looked up only when the mix matched a title they weren't looked up for yet. BackingGaps
(`--no-backing-gaps`): while a sentence was sung in the last minute, every 15 s it prints how loud
the backing (the mix minus Demucs' vocals) was each second,
`{"backing_level": {"from": 1792131000.1, "to": 1792131015.1, "db": [-26.1, …]}}`, as a backing
track stops between songs and plays on through the talk inside one; its split of the audio is shared
with Recordings', so nothing is split twice.

    uv run transcribe.py [<stream url> | --serve PORT] [--device auto|cpu|mps|cuda] [--realtime] [--model-dir DIR]
        [--lid-dir DIR] [--same-voice 0.6] [--no-backing-title] [--no-backing-gaps]

FireRedASR2-AED (4.7 GB) is downloaded into --model-dir and FireRedLID (3.5 GB) into --lid-dir on
the first run, SenseVoiceSmall (0.9 GB) into FunASR's cache. They need a GPU (Apple's or CUDA) to
keep up with a stream: on a CPU a sentence takes longer to transcribe than to say.
"""

import argparse
import asyncio
import collections
import contextlib
import dataclasses
import io
import itertools
import json
import logging
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
import wave

import numpy as np
import torch
import torchaudio.functional as AF
from demucs.apply import apply_model
from demucs.pretrained import get_model as get_demucs
from fireredasr2s.fireredasr2.asr import load_fireredasr_aed_model
from fireredasr2s.fireredasr2.data.asr_feat import ASRFeatExtractor
from fireredasr2s.fireredasr2.tokenizer.aed_tokenizer import ChineseCharEnglishSpmTokenizer
from fireredasr2s.fireredlid.data.feat import FeatExtractor as LidFeatExtractor
from fireredasr2s.fireredlid.lid import load_fireredlid_model
from fireredasr2s.fireredlid.tokenizer.lid_tokenizer import LidTokenizer
from funasr import AutoModel
from huggingface_hub import snapshot_download
from shazamio import Shazam
from transformers import ASTFeatureExtractor, ASTForAudioClassification

RATE = 16000
CHUNK_MS = 200
CHUNK_BYTES = RATE * CHUNK_MS // 1000 * 2  # s16le
# A sentence longer than this is cut, so one never grows without bound.
MAX_SENTENCE_MS = 15000
# How much of the latest audio a music lookup gets, and the least it needs.
MUSIC_SECONDS = 15
MIN_MUSIC_SECONDS = 5
# While sentences are sung, the vocals of the latest audio are looked up with Shazam this often to
# tell a recording playing from someone singing (see Recordings); what it found holds until then, or
# until nothing has been sung for PLAYED_GAP_SECONDS.
PLAYED_CHECK_SECONDS = 20
PLAYED_GAP_SECONDS = 10
# A lookup that takes longer is given up on, as it holds up the transcript (separating the vocals
# takes about 1 s more on an Apple GPU, 6 s on the CPU).
PLAYED_TIMEOUT_SECONDS = 5
# A match titled like this is a backing track: someone is singing over it, not playing a recording.
BACKING_TRACK = re.compile(r"伴奏|纯音乐|instrumental|off[ -]?vocal|karaoke|カラオケ|\binst\b", re.I)
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
# too much for its voiceprint to match the same person talking (on a link-up, the streamer's
# singing scored 0.33 against her talking and 0.28 against the guest's), so the two are sorted
# apart. Sung lines of one singer scored 0.66–0.93 against that singer and 0.28–0.42 against
# another, so the same SAME_VOICE sorts them.
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
# Splits the voice from the music (Demucs v4), so a lookup hears only who is singing.
SEPARATOR_MODEL = "htdemucs"
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


class Separator:
    """Demucs: the vocals of some audio, without the music under them (16 kHz mono in and out)."""

    def __init__(self, device: str):
        self.device = device
        self.model = get_demucs(SEPARATOR_MODEL).eval()
        self.vocals = self.model.sources.index("vocals")

    def __call__(self, audio: np.ndarray) -> np.ndarray:
        rate = self.model.samplerate
        stereo = AF.resample(torch.from_numpy(audio)[None], RATE, rate).repeat(2, 1)
        with torch.no_grad():
            sources = apply_model(self.model, stereo[None], device=self.device, progress=False)
        vocals = sources[0, self.vocals].mean(0, keepdim=True).cpu()
        return AF.resample(vocals, rate, RATE)[0].numpy()


class VoiceSet:
    """
    Voices told apart as they come: each voiceprint joins the closest voice heard so far if it's
    close enough (moving that voice's average towards it), or starts a new voice. The streamer is
    the first voice heard, until another has been heard for more than twice as long: a guest heard
    first is soon corrected, but an even back-and-forth doesn't keep swapping who's who.
    """

    def __init__(self, same_voice: float, new_id):
        self.same_voice = same_voice
        self.new_id = new_id
        self.centroids: list[np.ndarray] = []
        self.seconds: list[float] = []
        self.ids: list[int] = []
        self.host: int | None = None

    def add(self, voiceprint: np.ndarray, seconds: float) -> tuple[int, bool, float | None]:
        """Which voice `voiceprint` is (its number), whether it's the streamer's, and how close."""
        similarities = [float(c @ voiceprint) for c in self.centroids]
        best = int(np.argmax(similarities)) if similarities else -1
        if best < 0 or similarities[best] < self.same_voice:
            self.centroids.append(voiceprint)
            self.seconds.append(seconds)
            self.ids.append(self.new_id())
            voice, similarity = len(self.centroids) - 1, None
        else:
            weight = self.seconds[best]
            centroid = self.centroids[best] * weight + voiceprint * seconds
            self.centroids[best] = centroid / np.linalg.norm(centroid)
            self.seconds[best] += seconds
            voice, similarity = best, round(similarities[best], 2)
        if self.host is None or self.seconds[voice] > 2 * self.seconds[self.host]:
            self.host = voice
        return self.ids[voice], voice == self.host, similarity


class Voices:
    """
    Tells voices apart by their CAM++ voiceprints (see VoiceSet), the streamer's from whoever
    they're linked up with: the voices heard talking, and apart from them those heard singing.
    """

    def __init__(self, same_voice: float, model: AutoModel | None = None):
        # Small enough for the CPU, which leaves the GPU to the recognizer.
        self.model = model or AutoModel(model="cam++", device="cpu", disable_update=True, log_level="ERROR")
        ids = itertools.count()
        self.talking = VoiceSet(same_voice, lambda: next(ids))
        self.singing = VoiceSet(same_voice, lambda: next(ids))

    def __call__(
        self, audio: np.ndarray, speech: float, lang: str | None
    ) -> tuple[int | None, bool | None, float | None]:
        seconds = len(audio) / RATE
        if seconds < MIN_VOICE_SECONDS:
            return None, None, None
        embedding = self.model.generate(input=audio, disable_pbar=True)[0]["spk_embedding"]
        voiceprint = embedding.reshape(-1).float().cpu().numpy()
        voiceprint /= np.linalg.norm(voiceprint)
        return (self.singing if is_sung(speech, lang) else self.talking).add(voiceprint, seconds)


def is_sung(speech: float, lang: str | None) -> bool:
    # Japanese and Korean here are almost always lyrics, sung over music that can score as
    # speech: one such line once became "the streamer" talking, and her talking the guest's.
    return speech < SUNG_BELOW_SPEECH or lang in SENSEVOICE_LANGS


def load_models(
    device: str, model_dir: str, lid_dir: str, same_voice: float
) -> tuple[AutoModel, Recognizer, LanguageId, SenseVoice, VoiceClassifier, Voices, Separator]:
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
    separator = Separator(device)
    # The first run on a GPU compiles kernels; do it before the stream starts.
    silence = np.zeros(RATE, dtype=np.float32)
    asr(silence)
    lid(silence)
    sensevoice(silence, "ja")
    voice(silence)
    separator(silence)
    return vad, asr, lid, sensevoice, voice, Voices(same_voice), separator


# Where the transcript and music answers go (stdout, or the bot's connection with --serve), one
# whole JSON line at a time.
print_lock = threading.Lock()
sink = lambda text: print(text, flush=True)  # noqa: E731


def print_line(line: dict) -> None:
    with print_lock:
        try:
            sink(json.dumps(line, ensure_ascii=False))
        except OSError:
            pass  # the bot is gone: it's told nothing, and the session is ending anyway


def as_wav(chunks: list[bytes]) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(chunks))
    return out.getvalue()


def answer_music(music_id, recent: collections.deque, shazam: Shazam) -> None:
    """Answers a `{"music_id": id}` request from the latest audio in `recent`."""
    chunks = list(recent)
    if len(chunks) * CHUNK_MS < MIN_MUSIC_SECONDS * 1000:
        print_line({"music_id": music_id, "error": "not enough audio yet"})
        return
    try:
        track = asyncio.run(shazam.recognize(as_wav(chunks))).get("track")
    except Exception as err:  # noqa: BLE001 - a lookup that fails is answered, not fatal
        print_line({"music_id": music_id, "error": str(err) or type(err).__name__})
        return
    print_line({"music_id": music_id,
                "title": track and track.get("title"),
                "artist": track and track.get("subtitle")})
    log(f"music: {track and track.get('title')} / {track and track.get('subtitle')}")


class Recordings:
    """
    Whether a sung sentence is a recording playing (a song with its singer, as the streamer plays
    it to the room) rather than someone singing live, from Shazam on the vocals alone (Separator).
    On the whole mix it can't tell: a streamer singing over a backing track gets the track's song,
    often as the original (in a 75-minute morning show it matched 11 of 15 windows of her singing
    live). On the vocals it matched none of those 15 and 3 of 5 windows of the BGM playlist (a
    recording's vocals are its singer's, hers aren't). A match named as a backing track
    (BACKING_TRACK) still counts as singing. Looked up at most every PLAYED_CHECK_SECONDS while
    sentences are sung, from the latest audio. With `backing` (the BackingTitles add-on) the whole
    mix is looked up first, and the vocals only for a title they weren't looked up for yet.
    """

    def __init__(self, shazam: Shazam, separate, now=time.monotonic, backing: "BackingTitles | None" = None):
        self.shazam = shazam
        self.separate = separate
        self.now = now
        self.checked_at: float | None = None
        self.sung_at: float | None = None
        self.playing: dict | None = None
        # With BackingTitles (an add-on): the mix is looked up first, and the vocals only for a new title.
        self.backing = backing
        self.vocals_for: tuple[str, dict | None] | None = None  # (the mix's title, what its vocals were)

    def __call__(self, chunks: list[bytes]) -> dict | None:
        """The recording playing as a sentence was sung, `{"title", "artist"}`, or None."""
        now = self.now()
        fresh = (
            self.checked_at is not None and now - self.checked_at < PLAYED_CHECK_SECONDS
            and self.sung_at is not None and now - self.sung_at < PLAYED_GAP_SECONDS
        )
        self.sung_at = now
        if not fresh:
            self.checked_at = now
            self.playing = self.lookup(chunks)
        return self.playing

    def lookup(self, chunks: list[bytes]) -> dict | None:
        if len(chunks) * CHUNK_MS < MIN_MUSIC_SECONDS * 1000:
            return None
        if self.backing is not None:
            mix = self.backing.lookup(as_wav(chunks))
            if mix is None or BACKING_TRACK.search(mix["title"]):
                return None  # nothing on the mix, so nothing on its vocals; or sung over a backing track
            if self.vocals_for is not None and self.vocals_for[0] == bare_title(mix["title"]):
                return self.vocals_for[1]  # this title's vocals were looked up already
            played = self.lookup_vocals(chunks)
            self.vocals_for = (bare_title(mix["title"]), played)
            return played
        return self.lookup_vocals(chunks)

    def lookup_vocals(self, chunks: list[bytes]) -> dict | None:
        audio = np.frombuffer(b"".join(chunks), dtype=np.int16).astype(np.float32) / 32768
        vocals = (self.separate(audio) * 32768).clip(-32768, 32767).astype(np.int16).tobytes()
        try:
            found = asyncio.run(asyncio.wait_for(self.shazam.recognize(as_wav([vocals])), PLAYED_TIMEOUT_SECONDS))
        except Exception as err:  # noqa: BLE001 - unknown is taken as sung, not fatal
            log(f"played: lookup failed: {str(err) or type(err).__name__}")
            return None
        return played_track(found.get("track"))


def played_track(track: dict | None) -> dict | None:
    """Shazam's match as a recording playing, or None for no match or a backing track."""
    if not track or not track.get("title"):
        return None
    title, artist = track["title"], track.get("subtitle") or ""
    if BACKING_TRACK.search(title):
        log(f"played: backing track {title} / {artist}, sung live")
        return None
    log(f"played: {title} / {artist}")
    return {"title": title, "artist": artist}


# --- Add-ons for telling songs apart (see AddOns); each is off with its flag, and then the worker
# --- works as it did without them.

# Shazam's version tags, dropped to tell whether two lookups named the same song (as displayTitle in
# lyrics-search/: 「璀璨冒险人 (和声伴奏)」 is 「璀璨冒险人」).
VERSION_TAG = re.compile(r"[（(\[【「《].*?[）)\]】」》]|\s*[-–—].*$")
# Backing gaps: the backing's loudness is measured over blocks of this many seconds, while a
# sentence was sung in the last BACKING_AROUND_SINGING_SECONDS (a longer pause in the singing ends
# a song anyway, see currentSong in the bot).
BACKING_BLOCK_SECONDS = 15
BACKING_AROUND_SINGING_SECONDS = 60


def bare_title(title: str) -> str:
    return VERSION_TAG.sub("", title).strip() or title


class BackingTitles:
    """
    The backing track a streamer sings over, as Shazam names it on the whole mix, an add-on to
    Recordings' cycle (`--no-backing-title` turns it off). On a 75-minute show it named the backing
    in 11 of 15 windows of live singing (and the recording, when one played); the bot takes its
    title changing between lookups for a new song, and the same title across lookups for one song
    (src/app/songs/shazam-breaks.ts). Recordings looks the mix up first, and the vocals only when
    the mix matched a title it hasn't looked the vocals up for: if the mix doesn't match, its
    vocals won't. What it found (`track`) holds until the next lookup, like `played`.
    """

    def __init__(self, shazam: Shazam, now=time.time):
        self.shazam = shazam
        self.now = now
        self.track: dict | None = None

    def lookup(self, wav: bytes) -> dict | None:
        """Looks the mix up: `{"title", "artist", "at"}` (when, in Unix seconds), or None."""
        at = round(self.now(), 2)
        try:
            found = asyncio.run(asyncio.wait_for(self.shazam.recognize(wav), PLAYED_TIMEOUT_SECONDS))
            track = found.get("track")
        except Exception as err:  # noqa: BLE001 - unknown is no backing, not fatal
            log(f"backing: lookup failed: {str(err) or type(err).__name__}")
            track = None
        self.track = ({"title": track["title"], "artist": track.get("subtitle") or "", "at": at}
                      if track and track.get("title") else None)
        log(f"backing: {self.track and self.track['title']} / {self.track and self.track['artist']}")
        return self.track


class SeparatedStream:
    """
    The latest audio, and its vocals as Demucs splits them, each stretch split once however many
    ask for it (BackingGaps' blocks, Recordings' vocals): what was split already is kept, and only
    the rest is split, in one go. Holds as much as `recent` (MUSIC_SECONDS).
    """

    def __init__(self, separate, keep_chunks: int = MUSIC_SECONDS * 1000 // CHUNK_MS):
        self.separate = separate
        self.mix: collections.deque = collections.deque(maxlen=keep_chunks)
        self.vocals: collections.deque = collections.deque(maxlen=keep_chunks)

    def feed(self, raw: bytes) -> None:
        self.mix.append(np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768)
        self.vocals.append(None)

    def latest(self, chunks: int) -> tuple[np.ndarray, np.ndarray]:
        """The mix and the vocals of the latest `chunks` chunks."""
        first = max(0, len(self.mix) - chunks)
        i = first
        while i < len(self.mix):
            if self.vocals[i] is not None:
                i += 1
                continue
            j = i
            while j < len(self.mix) and self.vocals[j] is None:
                j += 1
            audio = np.concatenate([self.mix[k] for k in range(i, j)])
            vocals = np.resize(self.separate(audio), len(audio)) if len(audio) else audio
            at = 0
            for k in range(i, j):
                self.vocals[k] = vocals[at:at + len(self.mix[k])]
                at += len(self.mix[k])
            i = j
        if first == len(self.mix):
            return np.zeros(0, dtype=np.float32), np.zeros(0, dtype=np.float32)
        return (np.concatenate([self.mix[k] for k in range(first, len(self.mix))]),
                np.concatenate([self.vocals[k] for k in range(first, len(self.mix))]))

    def vocals_of(self, audio: np.ndarray) -> np.ndarray:
        """Recordings' `separate`: the vocals of `audio`, the latest audio (`recent`, fed alongside)."""
        chunks = -(-len(audio) // (CHUNK_BYTES // 2))
        return self.latest(chunks)[1][-len(audio):]


class BackingGaps:
    """
    How loud the backing (the mix minus Demucs' vocals) is, second by second, around singing, an
    add-on (`--no-backing-gaps`): a streamer's backing track stops between songs (for 3 s or more
    on every song change of a 34-minute stretch but one) and plays on through the talk inside one,
    which the bot reads as breaks and as one song (src/app/songs/backing-gap-breaks.ts). Every
    BACKING_BLOCK_SECONDS of audio, while a sentence was sung in the last
    BACKING_AROUND_SINGING_SECONDS, it prints
    `{"backing_level": {"from": <unix s>, "to": <unix s>, "db": [<dBFS of each second>, …]}}`.
    The split is SeparatedStream's, shared with Recordings. About 80 ms of an Apple GPU a second of
    audio.
    """

    def __init__(self, stream: SeparatedStream, emit=print_line, now=time.time):
        self.stream = stream
        self.emit = emit
        self.now = now
        self.fed = 0
        self.sung_at: float | None = None

    def sung(self) -> None:
        self.sung_at = self.now()

    def feed(self) -> None:
        """After each chunk the stream was fed."""
        self.fed += 1
        if self.fed * CHUNK_MS < BACKING_BLOCK_SECONDS * 1000:
            return
        self.fed = 0
        now = self.now()
        if self.sung_at is None or now - self.sung_at > BACKING_AROUND_SINGING_SECONDS:
            return
        mix, vocals = self.stream.latest(BACKING_BLOCK_SECONDS * 1000 // CHUNK_MS)
        backing = mix - vocals
        seconds = len(backing) // RATE
        rms = np.sqrt((backing[: seconds * RATE].reshape(seconds, RATE) ** 2).mean(1))
        db = [round(float(x), 1) for x in 20 * np.log10(rms + 1e-6)]
        self.emit({"backing_level": {"from": round(now - seconds, 2), "to": round(now, 2), "db": db}})


@dataclasses.dataclass(frozen=True)
class AddOnFlags:
    """Which add-ons run (see AddOns): all, unless turned off on the command line."""

    backing_title: bool = True
    backing_gaps: bool = True


class AddOns:
    """
    The add-ons that help the bot tell where one song ends and the next begins, each on unless its
    flag turns it off (`--no-backing-title`, `--no-backing-gaps`); with both off, the worker's lines
    are as they were without them. listen() calls `feed` with each chunk read, and `on_line` with
    each sentence before it's printed.
    """

    def __init__(self, backing_title: bool, backing_gaps: bool, shazam: Shazam, separator, emit=print_line):
        self.titles = BackingTitles(shazam) if backing_title else None
        self.stream = SeparatedStream(separator) if backing_gaps else None
        self.gaps = BackingGaps(self.stream, emit) if self.stream else None

    def separate(self, separator):
        """What Recordings splits the vocals with: the shared split when BackingGaps keeps one."""
        return self.stream.vocals_of if self.stream else separator

    def feed(self, raw: bytes) -> None:
        if self.stream:
            self.stream.feed(raw)
            self.gaps.feed()

    def on_line(self, line: dict, sung: bool) -> None:
        if self.titles:
            line["backing"] = self.titles.track if sung else None
        if self.gaps and sung:
            self.gaps.sung()


class Stream:
    """The ffmpeg pulling the stream being listened to, so a new URL can stop it."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.ffmpeg: subprocess.Popen | None = None

    def stop(self) -> None:
        with self.lock:
            if self.ffmpeg and self.ffmpeg.poll() is None:
                self.ffmpeg.terminate()
                # On a live stream ffmpeg can sit out the first SIGTERM, still pulling the stream
                # for a bot that's gone; then it's killed.
                try:
                    self.ffmpeg.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.ffmpeg.kill()


def read_requests(lines, urls: queue.Queue, music: queue.Queue, stream: Stream) -> None:
    """
    Reads the bot's `lines` (stdin, or its connection): `{"url": …}` (stop the stream being
    listened to, if any, and listen to this one) goes to `urls`, `{"music_id": …}` to `music`;
    `{"quit": true}` ends the whole process, `--serve` or not. When
    they end (the bot is gone), puts None on both and stops the stream, so the session ends.
    """
    try:
        for request in lines:
            try:
                message = json.loads(request)
                if "url" in message:
                    urls.put(str(message["url"]))
                    stream.stop()
                elif message.get("quit"):
                    # The room's stream is over and the bot is leaving: the service goes too.
                    log("the bot asked the service to quit")
                    stream.stop()
                    os._exit(0)
                else:
                    music.put(message["music_id"])
            except (ValueError, KeyError, TypeError, AttributeError):
                log(f"not a request: {request.strip()!r}")
    except (OSError, ValueError) as err:  # the connection broke, or its bytes weren't text
        log(f"stopped reading requests: {err}")
    finally:
        # Whatever ended the reading, the session must end, or the service stays stuck in it.
        urls.put(None)
        music.put(None)
        stream.stop()


def answer_music_requests(music: queue.Queue, recent: collections.deque) -> None:
    # In Chinese: Chinese singers by their Chinese names (张靓颖, not Jane Zhang); others as they are.
    shazam = Shazam(language="zh-CN", endpoint_country="CN")
    while (music_id := music.get()) is not None:
        answer_music(music_id, recent, shazam)


def listen(url: str, models: tuple, recent: collections.deque, stream: Stream, realtime: bool,
           add_ons: AddOnFlags = AddOnFlags()) -> int:
    """Transcribes the stream at `url` until it ends or is stopped; returns ffmpeg's exit code."""
    vad, asr, lid, sensevoice, voice, voices, separator = models
    with stream.lock:
        stream.ffmpeg = ffmpeg = subprocess.Popen(
            # A CDN can stop sending without closing the connection; give up after 15s of
            # silence so the bot fetches the stream again instead of hanging.
            # stdin is the bot's requests, not ffmpeg's keyboard.
            # By default ffmpeg studied a live FLV for about 33 s before giving any audio, so the bot
            # missed the streamer welcoming it; a second's look is enough to find the audio, and the
            # first audio then comes after about 1 s.
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", *(["-re"] if realtime else []),
             "-rw_timeout", "15000000", "-analyzeduration", "1000000", "-i", url, "-vn", "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
        )
    log("listening")
    recent.clear()
    shazam = Shazam(language="zh-CN", endpoint_country="CN")
    extras = AddOns(add_ons.backing_title, add_ons.backing_gaps, shazam, separator)
    recordings = Recordings(shazam, extras.separate(separator), backing=extras.titles)

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
        speaker, host, similarity = voices(audio, speech, lang)
        played = recordings(list(recent)) if is_sung(speech, lang) else None
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
            "played": played,
        }
        extras.on_line(line, is_sung(speech, lang))
        print_line(line)

    while True:
        raw = ffmpeg.stdout.read(CHUNK_BYTES)
        if not raw:
            break
        recent.append(raw)
        extras.feed(raw)
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
    return code


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("url", nargs="?", help="listen to this stream and exit when it ends, "
                        "instead of waiting for URLs on stdin")
    parser.add_argument("--serve", type=int, metavar="PORT",
                        help="stay running as a service on 127.0.0.1:PORT, speaking the stdin/stdout lines "
                        "to one bot at a time over a TCP connection, keeping the models loaded between bots")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--realtime", action="store_true", help="read input at its own speed (for testing with a file)")
    parser.add_argument("--same-voice", type=float, default=SAME_VOICE,
                        help="how close (0–1) a sentence's voiceprint must be to a voice heard before to count as it")
    parser.add_argument("--model-dir", default=os.path.expanduser("~/.cache/fireredasr2/FireRedASR2-AED"))
    parser.add_argument("--lid-dir", default=os.path.expanduser("~/.cache/fireredasr2/FireRedLID"))
    parser.add_argument("--no-backing-title", action="store_true",
                        help="don't name the backing track on the whole mix (BackingTitles)")
    parser.add_argument("--no-backing-gaps", action="store_true",
                        help="don't measure how loud the backing is around singing (BackingGaps)")
    args = parser.parse_args()
    add_ons = AddOnFlags(backing_title=not args.no_backing_title, backing_gaps=not args.no_backing_gaps)

    # Listening before the models load: a bot that connects meanwhile waits in the backlog for
    # `ready`, and one that finds the port taken knows a service is there and doesn't start another.
    server = socket.create_server(("127.0.0.1", args.serve)) if args.serve else None
    device = pick_device(args.device)
    log(f"loading models on {device}")
    if device == "cpu":
        log("no GPU: transcription will fall behind the stream")
    # FunASR prints while loading; stdout is only for transcript lines.
    with contextlib.redirect_stdout(sys.stderr):
        models = load_models(device, args.model_dir, args.lid_dir, args.same_voice)
    logging.getLogger().setLevel(logging.WARNING)

    # The latest MUSIC_SECONDS of audio, for naming the music when the bot asks.
    recent: collections.deque = collections.deque(maxlen=MUSIC_SECONDS * 1000 // CHUNK_MS)

    if args.url:
        listen(args.url, models, recent, Stream(), args.realtime, add_ons)
    elif server:
        log(f"serving on 127.0.0.1:{args.serve}")
        serve(server, models, recent, args.realtime, add_ons)
    else:
        session(sys.stdin, models, recent, args.realtime, add_ons)


def session(lines, models: tuple, recent: collections.deque, realtime: bool,
            add_ons: AddOnFlags = AddOnFlags()) -> None:
    """
    One bot's session: says it's ready, then listens to each URL it sends (a newer one replaces
    the one playing) and says when a stream ended, and answers its music requests, until `lines`
    end.
    """
    urls: queue.Queue = queue.Queue()
    music: queue.Queue = queue.Queue()
    stream = Stream()
    threading.Thread(target=read_requests, args=(lines, urls, music, stream), daemon=True).start()
    threading.Thread(target=answer_music_requests, args=(music, recent), daemon=True).start()
    print_line({"ready": True})
    while (url := urls.get()) is not None:
        # A newer URL waiting means this one was replaced before it started.
        if not urls.empty():
            continue
        code = listen(url, models, recent, stream, realtime, add_ons)
        print_line({"stream_ended": True, "code": code})


def serve(server: socket.socket, models: tuple, recent: collections.deque, realtime: bool,
          add_ons: AddOnFlags = AddOnFlags()) -> None:
    """
    Serves the same JSON lines over `server`, a local TCP socket, to one bot at a time, for good:
    the models and voiceprints stay loaded between bots, so a restarted bot is back in a moment.
    When a bot disconnects its stream is stopped and the next connection gets a fresh
    `{"ready": true}`. A bot that connects while another is connected is told `{"busy": true}` and
    disconnected, rather than left waiting.
    """
    busy = threading.Lock()

    def run_session(conn: socket.socket) -> None:
        global sink
        try:
            with conn, conn.makefile("r", encoding="utf-8", errors="replace") as lines:
                sink = lambda text: conn.sendall(f"{text}\n".encode())  # noqa: E731
                try:
                    session(lines, models, recent, realtime, add_ons)
                except OSError:
                    pass
        finally:
            sink = lambda text: None  # noqa: E731
            log("bot disconnected, waiting for the next one")
            busy.release()

    while True:
        conn, _ = server.accept()
        if not busy.acquire(blocking=False):
            log("another bot is connected; turning this one away")
            with conn:
                with contextlib.suppress(OSError):
                    conn.sendall(b'{"busy": true}\n')
            continue
        log("bot connected")
        threading.Thread(target=run_session, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
