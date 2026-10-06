"""Render one Collie install's icon set from an emoji and a colour.

Writes the four files bridge/app-identity.ts reads from COLLIE_APP_ICON_DIR:

    icon-192.png, icon-512.png  the manifest icons, "any maskable": the colour fills the square
                                and the emoji sits inside the maskable safe zone, the circle of
                                80% the side, so Android's mask never cuts it
    apple-touch-icon.png        180px, opaque (iOS rounds the corners itself)
    favicon-96.png              96px, for the browser tab

The emoji comes from a colour emoji font with bitmap strikes (Noto Color Emoji is the one the Nix
wrapper passes). Its glyphs are drawn at the font's own strike size and scaled, which is how a
bitmap emoji font is meant to be used.

Usage: app-icons.py --emoji 🪨 --colour '#6b7280' --font NotoColorEmoji.ttf --out DIR
"""

import argparse
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont, features

# Noto Color Emoji's only bitmap strike. Any other size fails to load a CBDT font.
STRIKE = 109

# Fraction of the side the emoji's larger dimension takes. A square of side s fits the maskable
# safe circle (diameter 0.8) when s * sqrt(2) <= 0.8, so s <= 0.566.
MASKABLE_SCALE = 0.56
TOUCH_SCALE = 0.66
FAVICON_SCALE = 0.78


def parse_colour(text):
    m = re.fullmatch(r"#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", text.strip())
    if m is None:
        sys.exit(f"app-icons: colour must be #rgb or #rrggbb, got {text!r}")
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (255,)


def render_emoji(emoji, font_path):
    """The emoji alone, cropped to its ink, at the font's strike size."""
    engine = ImageFont.Layout.RAQM if features.check("raqm") else ImageFont.Layout.BASIC
    font = ImageFont.truetype(font_path, STRIKE, layout_engine=engine)
    canvas = Image.new("RGBA", (STRIKE * 4, STRIKE * 2), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).text((STRIKE // 2, STRIKE // 4), emoji, font=font, embedded_color=True)
    box = canvas.getbbox()
    if box is None:
        sys.exit(f"app-icons: the font drew nothing for {emoji!r}")
    glyph = canvas.crop(box)
    # Without a shaping engine a ZWJ sequence draws as its parts side by side, which is wider than
    # any single emoji. Refuse rather than ship a strip of glyphs as an app icon.
    if glyph.width > STRIKE * 1.6:
        sys.exit(f"app-icons: {emoji!r} drew as several glyphs; this Pillow has no RAQM to join them")
    return glyph


def tile(glyph, size, colour, scale, radius=0):
    background = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(background).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=colour)
    target = round(size * scale)
    factor = target / max(glyph.width, glyph.height)
    scaled = glyph.resize(
        (max(1, round(glyph.width * factor)), max(1, round(glyph.height * factor))), Image.LANCZOS
    )
    background.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return background


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--emoji", required=True)
    p.add_argument("--colour", required=True)
    p.add_argument("--font", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()

    colour = parse_colour(a.colour)
    glyph = render_emoji(a.emoji, a.font)
    os.makedirs(a.out, exist_ok=True)

    for size in (192, 512):
        tile(glyph, size, colour, MASKABLE_SCALE).save(os.path.join(a.out, f"icon-{size}.png"))
    # Opaque: iOS fills transparency with black.
    tile(glyph, 180, colour, TOUCH_SCALE).convert("RGB").save(os.path.join(a.out, "apple-touch-icon.png"))
    tile(glyph, 96, colour, FAVICON_SCALE, radius=20).save(os.path.join(a.out, "favicon-96.png"))


if __name__ == "__main__":
    main()
