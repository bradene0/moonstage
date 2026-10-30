"""Generates crystal.png: a 4-frame, 16x16 pixel-art spinning crystal (64x16 sheet).

Run with `python3 assets/make-crystal.py` from examples/moon-hopper. Standard library only.
"""
import struct
import zlib
from pathlib import Path

SIZE, FRAMES = 16, 4
OUTLINE, LIGHT, SHADE, SHINE = (224, 255, 255, 255), (125, 249, 255, 255), (58, 183, 201, 255), (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
HALF_WIDTHS = [6.5, 4.5, 1.5, 4.5]  # apparent width as the crystal turns
LIGHT_ON_LEFT = [True, True, True, False]


def pixel(frame, x, y):
    cx, cy = 7.5, 7.5
    hw = HALF_WIDTHS[frame] * (1 - abs(y - cy) / 8)
    dx = x - cx
    if abs(dx) > hw or abs(y - cy) > 7.5:
        return CLEAR
    if abs(dx) > hw - 1 or abs(y - cy) > 6.5:
        return OUTLINE
    if frame == 0 and (x, y) in {(5, 5), (6, 4), (5, 6)}:
        return SHINE
    left = dx < 0
    return LIGHT if left == LIGHT_ON_LEFT[frame] else SHADE


def png(width, height, rows):
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


rows = [[pixel(x // SIZE, x % SIZE, y) for x in range(SIZE * FRAMES)] for y in range(SIZE)]
Path(__file__).with_name("crystal.png").write_bytes(png(SIZE * FRAMES, SIZE, rows))
