"""VoiceSet on made-up voiceprints: who's taken for the streamer, with and without a saved voice."""

import contextlib
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
with contextlib.redirect_stdout(sys.stderr):
    from transcribe import VoiceSet


def unit(*values: float) -> np.ndarray:
    v = np.array(values, dtype=np.float64)
    return v / np.linalg.norm(v)


HER, RECORDING = unit(1, 0, 0), unit(0, 1, 0)


def voice_set() -> VoiceSet:
    ids = iter(range(100))
    return VoiceSet(0.5, lambda: next(ids))


def test_the_first_voice_is_the_streamers_until_another_is_heard_twice_as_long():
    voices = voice_set()
    assert voices.add(RECORDING, 10)[1] is True
    assert voices.add(HER, 15)[1] is False
    assert voices.add(HER, 10)[1] is True


def test_a_saved_voice_stays_the_streamers_however_long_another_is_heard():
    voices = voice_set()
    voices.add(RECORDING, 30)
    voices.pin(HER, 60)
    assert voices.add(RECORDING, 600)[1] is False
    assert voices.add(unit(1, 0.2, 0), 5)[1] is True


def test_lines_matching_a_saved_voice_dont_move_it():
    voices = voice_set()
    voices.pin(HER, 60)
    voices.add(unit(1, 0.9, 0), 600)
    assert np.allclose(voices.centroids[0], HER)
