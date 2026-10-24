"""Splits a room recording with Demucs and writes per-second features of the mix and of the backing.

    uv run --directory chat-bot/asr --with librosa python -I chat-bot/scripts/backing-features.py \\
        <file.wav> <out.npz> [chunk s]

The backing is the mix minus Demucs' vocals (htdemucs, as transcribe.py's Separator). For each
second of audio it keeps the chroma (12, mean of the second) and MFCC (20) of the mix and of the
backing, and the loudness (RMS) of the vocals and of the backing, for backing-novelty.py to try
novelty curves on without splitting again. Also times Demucs, per second of audio, on the device it
runs on (mps on an Apple GPU). A 16-bit mono 16 kHz WAV, as the recordings in data/<房间号>/recordings/.
"""

import sys
import time
import wave

import librosa
import numpy as np
import torch
import torchaudio.functional as AF
from demucs.apply import apply_model
from demucs.pretrained import get_model

RATE = 16000
HOP = 512  # frames of 32 ms; a second is RATE / HOP of them


def features(audio: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Chroma (12) and MFCC (20) of each whole second of `audio`, averaged over the second."""
    chroma = librosa.feature.chroma_stft(y=audio, sr=RATE, n_fft=4096, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=audio, sr=RATE, n_mfcc=20, n_fft=2048, hop_length=HOP)
    seconds = len(audio) // RATE
    per = RATE / HOP

    def by_second(x: np.ndarray) -> np.ndarray:
        return np.stack([x[:, int(s * per):int((s + 1) * per)].mean(1) for s in range(seconds)])

    return by_second(chroma), by_second(mfcc)


def rms(audio: np.ndarray) -> np.ndarray:
    seconds = len(audio) // RATE
    return np.sqrt((audio[: seconds * RATE].reshape(seconds, RATE) ** 2).mean(1))


def main() -> None:
    path, out = sys.argv[1], sys.argv[2]
    chunk_s = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    model = get_model("htdemucs").eval()
    vocals_at = model.sources.index("vocals")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    # Warm up (the first run compiles kernels).
    apply_model(model, torch.zeros(1, 2, model.samplerate), device=device, progress=False)

    parts, spent = [], 0.0
    seconds = len(audio) // RATE
    for start in range(0, seconds, chunk_s):
        mix = audio[start * RATE:min(seconds, start + chunk_s) * RATE]
        t0 = time.perf_counter()
        stereo = AF.resample(torch.from_numpy(mix)[None], RATE, model.samplerate).repeat(2, 1)
        with torch.no_grad():
            sources = apply_model(model, stereo[None], device=device, progress=False)
        vocals = AF.resample(sources[0, vocals_at].mean(0, keepdim=True).cpu(), model.samplerate, RATE)[0].numpy()
        spent += time.perf_counter() - t0
        vocals = vocals[: len(mix)]
        backing = mix - vocals
        mc, mm = features(mix)
        bc, bm = features(backing)
        parts.append((mc, mm, bc, bm, rms(vocals), rms(backing)))
        print(f"{start}s/{seconds}s, demucs {spent / (start + len(mix) / RATE) * 1000:.0f} ms per second of audio",
              file=sys.stderr, flush=True)
    np.savez(out, **{name: np.concatenate([p[i] for p in parts])
                     for i, name in enumerate(["mix_chroma", "mix_mfcc", "back_chroma", "back_mfcc",
                                               "vocals_rms", "back_rms"])},
             demucs_ms_per_s=spent / seconds * 1000, chunk_s=chunk_s)


main()
