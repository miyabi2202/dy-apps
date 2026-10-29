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


class FakeVad:
    """Cuts every clip into one 3 s sentence."""

    def generate(self, input, disable_pbar=True):
        return [{"value": [[0, 3000]]}]


def write_clip(path, seconds: float = 3.0) -> None:
    import wave

    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes((np.sin(np.arange(int(16000 * seconds)) / 10) * 8000).astype(np.int16).tobytes())


def test_a_voice_saved_from_clips_is_the_streamers_singing_voice_when_loaded(tmp_path):
    from transcribe import SAVED_VOICE_FILE, Voices, load_singing_voice, save_singing_voice

    write_clip(tmp_path / "zh-song.wav")
    path = save_singing_voice(str(tmp_path), FakeVad(), lambda audio: (0.05, 0.9), lambda audio: HER)
    assert path == str(tmp_path / SAVED_VOICE_FILE)

    voices = Voices(0.6, 0.5, voiceprint=lambda audio: HER)
    load_singing_voice(path, voices)
    assert voices.singing.pinned and np.allclose(voices.singing.centroids[0], HER)


def test_clips_without_singing_save_nothing_and_a_missing_voice_leaves_the_first_to_sing(tmp_path):
    from transcribe import SAVED_VOICE_FILE, Voices, load_singing_voice, save_singing_voice

    write_clip(tmp_path / "talk.wav")
    talking = lambda audio: (0.9, 0.1)  # noqa: E731
    assert save_singing_voice(str(tmp_path), FakeVad(), talking, lambda audio: HER) is None
    assert not (tmp_path / SAVED_VOICE_FILE).exists()

    voices = Voices(0.6, 0.5, voiceprint=lambda audio: HER)
    load_singing_voice(str(tmp_path / SAVED_VOICE_FILE), voices)
    assert not voices.singing.pinned
