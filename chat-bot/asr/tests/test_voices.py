"""
Voices on a recorded link-up (linkmic-singing.json): the guest's singing and the streamer's are
told apart. The recording isn't in git (it's a room's audio, in chat-bot/data/); without it,
or with VOICE_RECORDINGS pointing elsewhere, these are skipped.
"""

import contextlib
import json
import os
import subprocess
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
with contextlib.redirect_stdout(sys.stderr):
    from funasr import AutoModel
    from transcribe import RATE, SAME_VOICE, SUNG_BELOW_SPEECH, VoiceClassifier, Voices

HERE = os.path.dirname(__file__)
LABELS = json.load(open(os.path.join(HERE, "linkmic-singing.json"), encoding="utf-8"))
RECORDINGS = os.environ.get("VOICE_RECORDINGS", os.path.join(HERE, "..", "..", "data"))
RECORDING = os.path.join(RECORDINGS, LABELS["recording"])

pytestmark = pytest.mark.skipif(not os.path.exists(RECORDING), reason=f"no recording at {RECORDING}")


def who_sang(beg: float) -> str | None:
    return next((s["who"] for s in LABELS["sung"] if s["from"] <= beg < s["to"]), None)


@pytest.fixture(scope="module")
def sentences():
    """The recording's sentences as the worker cuts them: (start s, audio, speech score)."""
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", RECORDING, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
        check=True, capture_output=True).stdout
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    with contextlib.redirect_stdout(sys.stderr):
        vad = AutoModel(model="fsmn-vad", max_single_segment_time=15000, disable_update=True, log_level="ERROR")
        segments = vad.generate(input=audio, disable_pbar=True)[0]["value"]
    classify = VoiceClassifier("cpu")
    out = []
    for beg, end in segments:
        clip = audio[beg * RATE // 1000 : end * RATE // 1000]
        speech, _ = classify(clip)
        out.append((beg / 1000, clip, speech))
    return out


@pytest.fixture(scope="module")
def cam():
    with contextlib.redirect_stdout(sys.stderr):
        return AutoModel(model="cam++", device="cpu", disable_update=True, log_level="ERROR")


def heard(voices: Voices, sentences) -> dict[str, list[tuple[int, bool]]]:
    """Each labelled singer's sung sentences, as `voices` took them: (voice, whether the streamer's)."""
    out: dict[str, list[tuple[int, bool]]] = {"guest": [], "host": []}
    for beg, clip, speech in sentences:
        speaker, host, _ = voices(clip, speech, None)
        who = who_sang(beg)
        if who and speech < SUNG_BELOW_SPEECH and speaker is not None:
            out[who].append((speaker, host))
    return out


def test_each_singer_is_one_voice_of_their_own(sentences, cam):
    got = heard(Voices(SAME_VOICE, cam), sentences)
    guest, host = {v for v, _ in got["guest"]}, {v for v, _ in got["host"]}
    assert len(got["guest"]) >= 4 and len(got["host"]) >= 6
    assert len(guest) == 1 and len(host) == 1 and guest != host
    # Heard from cold, the guest sang first; the streamer's longer song makes hers the streamer's.
    assert got["host"][-1][1] is True


def test_once_the_streamer_has_sung_a_guest_singing_is_the_guest(sentences, cam):
    voices = Voices(SAME_VOICE, cam)
    # As on the stream, where she had sung for half an hour before the link-up.
    heard(voices, [s for s in sentences if who_sang(s[0]) == "host"])
    got = heard(voices, sentences)
    assert all(host is False for _, host in got["guest"])
    assert all(host is True for _, host in got["host"])
