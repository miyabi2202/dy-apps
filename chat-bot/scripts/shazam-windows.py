"""Asks Shazam what's playing in a recording, window by window, for the song-break replay's truth.

    uv run --directory chat-bot/asr python -I chat-bot/scripts/shazam-windows.py \\
        <file.wav> <start of the file, ISO UTC> <from, ISO UTC> <to, ISO UTC> [step s] [window s]

Prints one JSON line per window: its UTC start, and the title and artist Shazam named (null for
none). A 16-bit mono WAV, as the recordings in data/<房间号>/recordings/ are. Waits half a second
between requests, so a 34-minute stretch is about 200 of them.
"""

import asyncio
import io
import json
import sys
import wave
from datetime import datetime, timedelta

from shazamio import Shazam


def window_wav(source: wave.Wave_read, start_s: float, length_s: float) -> bytes:
    rate = source.getframerate()
    source.setpos(int(start_s * rate))
    frames = source.readframes(int(length_s * rate))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(source.getnchannels())
        w.setsampwidth(source.getsampwidth())
        w.setframerate(rate)
        w.writeframes(frames)
    return out.getvalue()


async def main() -> None:
    path, file_start, start, end = sys.argv[1:5]
    step = float(sys.argv[5]) if len(sys.argv) > 5 else 10.0
    length = float(sys.argv[6]) if len(sys.argv) > 6 else 15.0
    t0 = datetime.fromisoformat(file_start)
    shazam = Shazam(language="zh-CN", endpoint_country="CN")
    with wave.open(path, "rb") as source:
        duration = source.getnframes() / source.getframerate()
        at = (datetime.fromisoformat(start) - t0).total_seconds()
        stop = min((datetime.fromisoformat(end) - t0).total_seconds(), duration - length)
        while at <= stop:
            when = (t0 + timedelta(seconds=at)).strftime("%H:%M:%S")
            try:
                track = (await shazam.recognize(window_wav(source, at, length))).get("track")
                line = {"at": when, "title": track and track.get("title"),
                        "artist": track and track.get("subtitle")}
            except Exception as err:  # noqa: BLE001 - a failed window is reported, not fatal
                line = {"at": when, "error": str(err) or type(err).__name__}
            print(json.dumps(line, ensure_ascii=False), flush=True)
            at += step
            await asyncio.sleep(0.5)


asyncio.run(main())
