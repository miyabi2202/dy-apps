"""Recordings: a sung sentence is a recording playing when Shazam finds a song that isn't a backing track."""

import contextlib
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
with contextlib.redirect_stdout(sys.stderr):
    from transcribe import CHUNK_BYTES, Recordings, played_track

AUDIO = [b"\0" * CHUNK_BYTES] * 75  # 15 s


class FakeShazam:
    def __init__(self, *tracks):
        self.tracks = list(tracks)
        self.lookups = 0

    async def recognize(self, wav):
        self.lookups += 1
        return {"track": self.tracks.pop(0)} if self.tracks else {}


def test_a_backing_track_is_singing_live():
    assert played_track({"title": "花", "subtitle": "夏川りみ"}) == {"title": "花", "artist": "夏川りみ"}
    assert played_track({"title": "璀璨冒险人 (和声伴奏)", "subtitle": "周深"}) is None
    assert played_track({"title": "Easy On Me (Instrumental)", "subtitle": "Adele"}) is None
    assert played_track({"title": "Sign (Off Vocal)", "subtitle": "Aya Uchida"}) is None
    assert played_track(None) is None


def test_looks_up_again_after_a_while_or_a_pause():
    clock = [0.0]
    shazam = FakeShazam({"title": "花", "subtitle": "夏川りみ"}, None, {"title": "Sign"})
    recordings = Recordings(shazam, now=lambda: clock[0])
    assert recordings(AUDIO) == {"title": "花", "artist": "夏川りみ"}
    clock[0] = 5
    assert recordings(AUDIO)["title"] == "花"  # still the same lookup
    assert shazam.lookups == 1
    clock[0] = 21
    assert recordings(AUDIO) is None  # looked up again: nothing found, sung live
    clock[0] = 35  # nothing sung for 14 s: the next sentence is looked up again
    assert recordings(AUDIO) == {"title": "Sign", "artist": ""}
    assert shazam.lookups == 3


def test_too_little_audio_is_sung():
    shazam = FakeShazam({"title": "花"})
    assert Recordings(shazam)(AUDIO[:10]) is None
    assert shazam.lookups == 0
