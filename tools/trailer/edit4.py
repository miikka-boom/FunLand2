"""Cut the captured shots into the 30 s trailer (900 frames at 30 fps) with titles and the end card.

python3 -I edit.py <outDir> [every]   (every > 1 renders only every Nth frame, for a quick look)
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
EVERY = int(sys.argv[2]) if len(sys.argv) > 2 else 1
FPS = 30
W, H = 1920, 1080
INTER = os.environ.get('INTER_DIR', '/usr/share/fonts/opentype/inter/')
LOGO = os.path.join(HERE, '..', '..', 'assets', 'we-left-ben.webp')

# (kind, source shot, first source frame, frame count)
TIMELINE = [
    ('shot', 't4_open', 0, 120),      # 0.000  two of them step out of the first safe room
    ('shot', 't4_dark', 12, 120),     # 4.000  two lights across the cemetery rows
    ('shot', 't4_witch', 15, 132),    # 8.000  the Witch
    ('card', 'most', 0, 24),          # 12.400 MOST DON'T.
    ('shot', 't4_horde', 6, 138),     # 13.200 HERE THEY COME! ... the pumps go up at 14.833 (frame 445)
    ('shot', 't4_escape', 10, 246),   # 17.800 the last escape: running, shooting back
    ('card', 'end', 0, 120),          # 26.000
]
assert sum(seg[3] for seg in TIMELINE) == 900

# Title lines: (text, start s, end s, style, y)
TITLES = [
    ('PHILADELPHIA, 2020.', 0.5, 3.6, 'caption', 1000),
    ('PEOPLE STOPPED SLEEPING.', 4.35, 7.75, 'title', 150),
    ('SOME WANT TO BE LEFT ALONE.', 8.45, 12.25, 'title', 952),
    ('BRING A FRIEND.', 21.7, 25.7, 'title', 150),
]
STYLES = {
    'title': dict(font='Inter-ExtraBold.otf', size=64, track=6, fill=(244, 241, 236)),
    'caption': dict(font='Inter-SemiBold.otf', size=38, track=12, fill=(222, 218, 210)),
    'most': dict(font='Inter-Black.otf', size=124, track=8, fill=(255, 107, 90)),
    'ben': dict(font='Inter-Bold.otf', size=58, track=2, fill=(255, 138, 30)),
    'fine': dict(font='Inter-SemiBold.otf', size=24, track=3, fill=(150, 146, 138)),
}


def text_layer(text, style, shadow=True):
    """The text as an RGBA image (tight box plus room for a soft shadow), tracked letter by letter."""
    st = STYLES[style]
    font = ImageFont.truetype(INTER + st['font'], st['size'])
    widths = [font.getlength(ch) for ch in text]
    tw = int(sum(widths) + st['track'] * (len(text) - 1))
    asc, desc = font.getmetrics()
    pad = 40
    img = Image.new('RGBA', (tw + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))

    def draw(target, fill):
        d = ImageDraw.Draw(target)
        x = pad
        for ch, w in zip(text, widths):
            d.text((x, pad), ch, font=font, fill=fill)
            x += w + st['track']

    if shadow:
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        draw(sh, (0, 0, 0, 235))
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        img = Image.alpha_composite(img, sh)
        img = Image.alpha_composite(img, sh)
    top = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw(top, st['fill'] + (255,))
    return Image.alpha_composite(img, top)


def place(frame, layer, cx, cy, alpha, dy=0):
    if alpha <= 0:
        return
    lay = layer
    if alpha < 1:
        lay = layer.copy()
        lay.putalpha(lay.getchannel('A').point(lambda v: int(v * alpha)))
    frame.alpha_composite(lay, (int(cx - lay.width / 2), int(cy - lay.height / 2 + dy)))


def ramp(t, t0, t1, fade=0.28):
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, (t - t0) / fade, (t1 - t) / fade))


def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


layers = {text: text_layer(text, style) for text, _, _, style, _ in TITLES}
most = text_layer("MOST DON'T.", 'most', shadow=False)
logo = Image.open(LOGO).convert('RGBA')
LOGO_W = 780
logo = logo.resize((LOGO_W, round(logo.height * LOGO_W / logo.width)), Image.LANCZOS)
BEN = 'ben was here.'
fine = text_layer('PROTOTYPE FOOTAGE  ·  PARTNER PLAYED BY THE AI TEAMMATE', 'fine', shadow=False)
ben_steps = [text_layer(BEN[:k], 'ben', shadow=False) if k else None for k in range(len(BEN) + 1)]


def end_card(t):
    """t: seconds into the end card."""
    f = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    a = smooth(t / 0.55)
    s = 0.94 + 0.06 * smooth(t / 1.4)
    lg = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
    place(f, lg, W / 2, 470, a)
    # Ben writes his line, a letter at a time, from 1.15 s.
    k = int((t - 1.15) / 0.075) + 1 if t >= 1.15 else 0
    k = min(len(BEN), k)
    if k:
        lay = ben_steps[k].rotate(-2.5, resample=Image.BICUBIC, expand=True)
        full = ben_steps[-1].rotate(-2.5, resample=Image.BICUBIC, expand=True)
        place(f, lay, W / 2 - (full.width - lay.width) / 2, 846, 1.0)
    place(f, fine, W / 2, 1012, smooth((t - 0.8) / 0.4))
    out = 1 - smooth((t - (120 / FPS - 0.45)) / 0.45)
    if out < 1:
        f = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), f, max(0.0, out))
    return f


def most_card(t):
    f = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    s = 1.06 - 0.06 * smooth(t / 0.8)
    lay = most.resize((round(most.width * s), round(most.height * s)), Image.LANCZOS)
    place(f, lay, W / 2, H / 2, smooth(t / 0.12))
    return f


os.makedirs(OUT, exist_ok=True)
n = 0
for kind, src, first, count in TIMELINE:
    for j in range(count):
        t = n / FPS
        if n % EVERY == 0:
            if kind == 'card':
                frame = most_card(j / FPS) if src == 'most' else end_card(j / FPS)
            else:
                frame = Image.open(os.path.join(HERE, 'frames', src, f'f{first + j:04d}.jpg')).convert('RGBA')
                if frame.size != (W, H):
                    frame = frame.resize((W, H), Image.LANCZOS)
            for text, t0, t1, style, y in TITLES:
                a = ramp(t, t0, t1)
                if a > 0:
                    place(frame, layers[text], W / 2, y, a, dy=8 * (1 - smooth((t - t0) / 0.5)))
            if n < 9:  # fade up from black
                frame = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), frame, n / 9)
            frame.convert('RGB').save(os.path.join(OUT, f'f{n:04d}.jpg'), quality=95)
        n += 1
print('frames', n)
