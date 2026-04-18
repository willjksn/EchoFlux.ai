"""
One-off / repeatable: rebuild public/witme-favicon.png with blue plate + larger W.
Requires: pip install pillow numpy
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
# Black-plate master (do not overwrite). Output is the shipped tab icon.
SRC = ROOT / "public" / "witme-favicon-plate-black.png"
OUT = ROOT / "public" / "witme-favicon.png"

# EchoFlux primary-adjacent blue (readable next to light “W”)
BLUE_RGB = (37, 99, 235)
# Target: W’s max(width,height) as fraction of canvas (black-plate asset was ~0.85)
FILL_RATIO = 0.97
# iOS-like squircle corner radius as fraction of side
CORNER_RADIUS_FRAC = 0.223


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    a = np.array(im, dtype=np.float32)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    mx = np.maximum(np.maximum(r, g), b)
    fg = (luma > 28) | (mx > 32)

    ys, xs = np.where(fg)
    ymin, ymax = int(ys.min()), int(ys.max())
    xmin, xmax = int(xs.min()), int(xs.max())

    crop = a[ymin : ymax + 1, xmin : xmax + 1].copy()
    cm = fg[ymin : ymax + 1, xmin : xmax + 1]

    rgba = np.zeros((crop.shape[0], crop.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = crop.astype(np.uint8)
    rgba[:, :, 3] = (cm.astype(np.uint8) * 255)

    letter = Image.fromarray(rgba)
    cw, ch = letter.size
    side = min(im.size)
    target_max = int(round(side * FILL_RATIO))
    scale = target_max / max(cw, ch)
    nw, nh = int(round(cw * scale)), int(round(ch * scale))
    letter = letter.resize((nw, nh), Image.Resampling.LANCZOS)

    plate = Image.new("RGBA", im.size, (*BLUE_RGB, 255))
    x0 = (im.size[0] - nw) // 2
    y0 = (im.size[1] - nh) // 2
    plate.paste(letter, (x0, y0), letter)

    rpx = int(round(side * CORNER_RADIUS_FRAC))
    mask = Image.new("L", im.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, im.size[0], im.size[1]), radius=rpx, fill=255)

    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(plate, (0, 0), mask)
    out.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT} ({out.size[0]}x{out.size[1]}) fill={FILL_RATIO}")


if __name__ == "__main__":
    main()
