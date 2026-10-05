#!/usr/bin/env python3
"""Resample the emvalue wordmark at the sizes pages show it.

    py tools/wordmark.py    # writes site/assets/brand/emvalue-wordmark-<width>.png

The master (site/assets/brand/emvalue-wordmark.png, 2172x724) is about 13x wider than the
logo on the page, and browsers shrink it with jagged edges. Pages use these copies instead,
through srcset: cropped to the 166:34 box the CSS shows it in (object-fit: cover, 50% 49%)
and resampled with Lanczos, so the browser never shrinks one by more than about 1.5x.
Needs Pillow; build.py only reads the files.
"""
from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parent.parent / "site" / "assets" / "brand"
WIDTHS = (120, 166, 249, 332, 498, 664)  # keep in step with WORDMARK_WIDTHS in build.py
RATIO = 166 / 34


def main():
    master = Image.open(BRAND / "emvalue-wordmark.png").convert("RGBA")
    height = round(master.width / RATIO)
    top = round((master.height - height) * 0.49)
    # premultiplied alpha, so the transparent padding doesn't darken the antialiased edges
    crop = master.crop((0, top, master.width, top + height)).convert("RGBa")
    for width in WIDTHS:
        out = crop.resize((width, round(width / RATIO)), Image.LANCZOS).convert("RGBA")
        out.save(BRAND / f"emvalue-wordmark-{width}.png", optimize=True)
        print(f"emvalue-wordmark-{width}.png", out.size)


if __name__ == "__main__":
    main()
