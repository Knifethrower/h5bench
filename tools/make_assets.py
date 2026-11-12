#!/usr/bin/env python3
"""Make h5bench's assets (deterministic): sprites_256.png, sheet_1024.png, big_2048.png (sprite-sheet-like: cells
with shapes, gradients and transparent borders, so PNG sizes are realistic) and tone_10s.ogg (ffmpeg, if found).
usage: python3 make_assets.py [assets dir]   (needs Pillow; WSL python3 has it)"""
import os, random, shutil, subprocess, sys
from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
os.makedirs(out, exist_ok=True)

def sheet(size, cell, seed):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for cy in range(0, size, cell):
        for cx in range(0, size, cell):
            c = (rnd.randrange(40, 255), rnd.randrange(40, 255), rnd.randrange(40, 255), 255)
            m = cell // 8
            d.ellipse([cx + m, cy + m, cx + cell - m, cy + cell - m], fill=c, outline=(20, 20, 30, 255), width=max(1, cell // 32))
            for k in range(cell // 6):
                y = cy + m + k * 3
                d.line([cx + m * 2, y, cx + cell - m * 2, y], fill=(c[0] // 2, c[1] // 2, c[2] // 2, 255))
    return im

for name, size, cell, seed in [("sprites_256.png", 256, 32, 1), ("sheet_1024.png", 1024, 48, 2), ("big_2048.png", 2048, 64, 3)]:
    p = os.path.join(out, name)
    sheet(size, cell, seed).save(p, optimize=True)
    print(name, os.path.getsize(p), "bytes")

ogg = os.path.join(out, "tone_10s.ogg")
if shutil.which("ffmpeg"):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10:sample_rate=44100",
                    "-ac", "2", "-c:a", "libvorbis", "-q:a", "4", ogg], check=True)
    print("tone_10s.ogg", os.path.getsize(ogg), "bytes")
else:
    print("no ffmpeg: tone_10s.ogg not made (the media page reports decode_ogg_vorbis as asset missing)")
