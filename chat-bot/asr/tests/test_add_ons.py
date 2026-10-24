"""The add-ons for song breaks: BackingTitles (Shazam on the whole mix first) and BackingGaps (how
loud the backing is), with the Demucs split they share (SeparatedStream)."""

import contextlib
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
with contextlib.redirect_stdout(sys.stderr):
    from transcribe import (CHUNK_BYTES, AddOns, BackingGaps, BackingTitles, Recordings,
                            SeparatedStream, bare_title)

AUDIO = [b"\0" * CHUNK_BYTES] * 75  # 15 s


class FakeShazam:
    """Answers each lookup with the next of `tracks` (None: no match), and says which audio it got."""

    def __init__(self, *tracks):
        self.tracks = list(tracks)
        self.wavs: list[bytes] = []

    async def recognize(self, wav):
        self.wavs.append(wav)
        track = self.tracks.pop(0) if self.tracks else None
        return {"track": track} if track else {}


class CountingSeparator:
    """Demucs, faked: the vocals are half the audio; counts the samples it split."""

    def __init__(self):
        self.calls: list[int] = []

    def __call__(self, audio):
        self.calls.append(len(audio))
        return audio / 2


def recordings_with_backing(shazam, separate=lambda audio: audio):
    clock = [0.0]
    backing = BackingTitles(shazam, now=lambda: 1000 + clock[0])
    return Recordings(shazam, separate, now=lambda: clock[0], backing=backing), backing, clock


def test_no_match_on_the_mix_looks_up_no_vocals():
    shazam = FakeShazam(None)
    separator = CountingSeparator()
    recordings, backing, _ = recordings_with_backing(shazam, separator)
    assert recordings(AUDIO) is None
    assert backing.track is None
    assert len(shazam.wavs) == 1 and separator.calls == []


def test_the_mix_matches_then_the_vocals_tell_a_recording():
    shazam = FakeShazam({"title": "花", "subtitle": "夏川りみ"}, {"title": "花", "subtitle": "夏川りみ"},
                        {"title": "花 (Live)", "subtitle": "夏川りみ"})
    recordings, backing, clock = recordings_with_backing(shazam)
    assert recordings(AUDIO) == {"title": "花", "artist": "夏川りみ"}  # the mix, then the vocals
    assert backing.track == {"title": "花", "artist": "夏川りみ", "at": 1000}
    assert len(shazam.wavs) == 2
    clock[0] = 21
    # The same song on the mix (its version tag aside): the vocals aren't looked up again.
    assert recordings(AUDIO) == {"title": "花", "artist": "夏川りみ"}
    assert backing.track["title"] == "花 (Live)"
    assert len(shazam.wavs) == 3


def test_sung_over_a_backing_track():
    shazam = FakeShazam({"title": "璀璨冒险人", "subtitle": "周深"}, None,
                        {"title": "璀璨冒险人 (和声伴奏)", "subtitle": "周深"})
    recordings, backing, clock = recordings_with_backing(shazam)
    assert recordings(AUDIO) is None  # the mix matched, her vocals didn't: sung live
    assert backing.track == {"title": "璀璨冒险人", "artist": "周深", "at": 1000}
    clock[0] = 21
    assert recordings(AUDIO) is None  # titled as a backing track: no vocals lookup
    assert backing.track == {"title": "璀璨冒险人 (和声伴奏)", "artist": "周深", "at": 1021}
    assert len(shazam.wavs) == 3


def test_version_tags_are_dropped_to_compare():
    assert bare_title("璀璨冒险人 (和声伴奏)") == bare_title("璀璨冒险人") == "璀璨冒险人"
    assert bare_title("最熟悉的陌生人 - Luxy Remix") == "最熟悉的陌生人"
    assert bare_title("(伴奏)") == "(伴奏)"


def test_each_stretch_is_split_once():
    separator = CountingSeparator()
    stream = SeparatedStream(separator, keep_chunks=75)
    chunk = (np.full(CHUNK_BYTES // 2, 1000, dtype=np.int16)).tobytes()
    for _ in range(50):
        stream.feed(chunk)
    mix, vocals = stream.latest(25)
    assert separator.calls == [25 * CHUNK_BYTES // 2]
    np.testing.assert_allclose(vocals, mix / 2)
    for _ in range(10):
        stream.feed(chunk)
    mix, vocals = stream.latest(75)  # the 25 split already are kept; the 25 before them and the 10 after are split
    assert separator.calls[1:] == [25 * CHUNK_BYTES // 2, 10 * CHUNK_BYTES // 2]
    assert len(mix) == len(vocals) == 60 * CHUNK_BYTES // 2
    assert len(stream.vocals_of(np.zeros(5 * CHUNK_BYTES // 2))) == 5 * CHUNK_BYTES // 2
    assert len(separator.calls) == 3


def test_backing_levels_are_measured_only_around_singing():
    clock = [1000.0]
    lines: list[dict] = []
    stream = SeparatedStream(lambda audio: np.zeros_like(audio))  # no vocals: the backing is the mix
    gaps = BackingGaps(stream, lines.append, now=lambda: clock[0])
    loud = (np.full(CHUNK_BYTES // 2, 3277, dtype=np.int16)).tobytes()  # 0.1: -20 dBFS
    quiet = bytes(CHUNK_BYTES)

    def feed(raw, chunks):
        for _ in range(chunks):
            stream.feed(raw)
            gaps.feed()
            clock[0] += 0.2

    feed(loud, 75)
    assert lines == []  # nothing sung yet
    gaps.sung()
    feed(loud, 70)
    feed(quiet, 5)
    assert len(lines) == 1
    level = lines[0]["backing_level"]
    assert level["to"] - level["from"] == 15
    assert level["db"][:13] == [-20.0] * 13 and level["db"][14] < -100
    clock[0] += 61  # nothing sung for a minute
    feed(loud, 75)
    assert len(lines) == 1


def test_add_ons_off_leave_the_line_alone():
    line = {"text": "啦"}
    add_ons = AddOns(False, False, FakeShazam(), CountingSeparator(), emit=lambda line: None)
    separator = object()
    assert add_ons.separate(separator) is separator
    add_ons.feed(AUDIO[0])
    add_ons.on_line(line, True)
    assert line == {"text": "啦"}


def test_add_ons_on_mark_sung_lines():
    add_ons = AddOns(True, True, FakeShazam(), CountingSeparator(), emit=lambda line: None)
    add_ons.titles.track = {"title": "花", "artist": ""}
    sung, said = {"text": "啦"}, {"text": "好"}
    add_ons.on_line(sung, True)
    add_ons.on_line(said, False)
    assert sung["backing"] == {"title": "花", "artist": ""} and said["backing"] is None
    assert add_ons.separate(None) == add_ons.stream.vocals_of
