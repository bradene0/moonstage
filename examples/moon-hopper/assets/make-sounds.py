"""Generates chime.wav: a short rising two-tone chime (22.05 kHz, 16-bit mono).

Run with `python3 assets/make-sounds.py` from examples/moon-hopper. Standard library only.
"""
import math
import struct
import wave
from pathlib import Path

RATE = 22050
DURATION = 0.22


def sample(t):
    freq = 880 if t < 0.07 else 1320
    attack = min(1.0, t / 0.005)
    decay = math.exp(-t * 14)
    return 0.45 * attack * decay * (math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(4 * math.pi * freq * t))


frames = b"".join(struct.pack("<h", int(max(-1, min(1, sample(i / RATE))) * 32767)) for i in range(int(RATE * DURATION)))
with wave.open(str(Path(__file__).with_name("chime.wav")), "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(RATE)
    out.writeframes(frames)
