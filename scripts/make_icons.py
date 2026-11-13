"""Build simple centered typographic icons (font files are not distributed).

Dependencies: Pillow and a local Inter-ExtraBold font, installed on this build machine.
The glyph ink bounding box is measured before centering, rather than treating
text baseline or typographic advance width as the visual center.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_PATH = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
S = 1024
BLUE = (37, 99, 235, 255)

font = ImageFont.truetype(FONT_PATH, 900)
working = Image.new('L', (1200, 1200), 0)
d = ImageDraw.Draw(working)
d.text((110, 0), '?', font=font, fill=255)
bounds = working.getbbox()
assert bounds
ink = working.crop(bounds)
# Fit the literal glyph to 60% of the icon's height, keeping its native width.
target_height = round(S * 0.60)
ink = ink.resize((round(ink.width * target_height / ink.height), target_height), Image.Resampling.LANCZOS)

base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(base)
draw.rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * .225), fill=BLUE)
white = Image.new('RGBA', ink.size, (255, 255, 255, 255))
position = ((S - ink.width) // 2, (S - ink.height) // 2)
base.paste(white, position, ink)

for size in (48, 96, 128):
    output = ROOT / 'icons' / f'icon-{size}.png'
    base.resize((size, size), Image.Resampling.LANCZOS).save(output, optimize=True)
    print(output)
