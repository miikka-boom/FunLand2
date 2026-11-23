"""The co-op trailer's cut: 900 frames at 30 fps, titles, and the end card.

python3 -I edit2.py <outDir> [every]
"""
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

TIMELINE = [
    ('shot', 'duo_open', 0, 120),     # 0.000  two of them in the first safe room, out of the door
    ('shot', 'duo_lights', 10, 135),  # 4.000  two lights in the cemetery rows
    ('shot', 'duo_terror', 18, 120),  # 8.500  the partner's light finds what's behind you (10.267)
    ('shot', 'duo_hunter', 62, 105),  # 12.500 pounce, pinned (13.4), knocked off (15.067)
    ('shot', 'duo_revive', 4, 120),   # 16.000 down; revived as the horde arrives (19.0)
    ('shot', 'duo_hold', 20, 105),    # 20.000 back to back
    ('shot', 'duo_ferry', 939, 90),   # 23.500 ALL ABOARD!, both at the gangway
    ('card', 'end', 0, 105),          # 26.500
]
assert sum(seg[3] for seg in TIMELINE) == 900

TITLES = [
    ('NO TEAMS TO BEAT.', 0.35, 1.95, 'title', 1000),
    ('NO TROPHIES TO LOSE.', 2.15, 3.85, 'title', 1000),
    ('JUST YOU, A FRIEND, AND THE NIGHT.', 4.4, 8.3, 'title', 150),
    ('WATCH THEIR BACK.', 9.0, 12.3, 'title', 330),
    ('PULL THEM OUT.', 12.8, 15.85, 'title', 150),
    ('PICK THEM UP.', 16.3, 19.8, 'title', 150),
    ('HOLD THE LINE.', 20.3, 23.3, 'title', 150),
    ('GET HOME TOGETHER.', 23.8, 26.35, 'title', 1000),
]
STYLES = {
    'title': dict(font='Inter-ExtraBold.otf', size=64, track=6, fill=(244, 241, 236)),
    'coop': dict(font='Inter-Black.otf', size=78, track=10, fill=(244, 241, 236)),
    'ben': dict(font='Inter-Bold.otf', size=52, track=2, fill=(255, 138, 30)),
    'fine': dict(font='Inter-SemiBold.otf', size=24, track=3, fill=(150, 146, 138)),
}


def text_layer(text, style, shadow=True):
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


def ramp(t, t0, t1, fade=0.25):
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, (t - t0) / fade, (t1 - t) / fade))


def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


layers = {text: text_layer(text, style) for text, _, _, style, _ in TITLES}
logo = Image.open(LOGO).convert('RGBA')
LOGO_W = 690
logo = logo.resize((LOGO_W, round(logo.height * LOGO_W / logo.width)), Image.LANCZOS)
coop = text_layer('2-PLAYER CO-OP', 'coop', shadow=False)
fine = text_layer('PROTOTYPE FOOTAGE  ·  PARTNER PLAYED BY THE AI TEAMMATE  ·  CO-OP IN DEVELOPMENT', 'fine', shadow=False)
BEN = "don't leave them behind."
ben_steps = [text_layer(BEN[:k], 'ben', shadow=False).rotate(-2.0, resample=Image.BICUBIC, expand=True) if k else None for k in range(len(BEN) + 1)]
END_LEN = 105 / FPS


def end_card(t):
    f = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    s = 0.95 + 0.05 * smooth(t / 1.2)
    lg = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
    place(f, lg, W / 2, 365, smooth(t / 0.45))
    place(f, coop, W / 2, 690, smooth((t - 0.45) / 0.3))
    place(f, fine, W / 2, 1012, smooth((t - 0.7) / 0.4))
    k = min(len(BEN), int((t - 1.0) / 0.045) + 1) if t >= 1.0 else 0
    if k:
        full = ben_steps[-1]
        lay = ben_steps[k]
        place(f, lay, W / 2 - (full.width - lay.width) / 2, 790, 1.0)
    out = 1 - smooth((t - (END_LEN - 0.35)) / 0.35)
    if out < 1:
        f = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), f, max(0.0, out))
    return f


os.makedirs(OUT, exist_ok=True)
n = 0
for kind, src, first, count in TIMELINE:
    for j in range(count):
        t = n / FPS
        if n % EVERY == 0:
            if kind == 'card':
                frame = end_card(j / FPS)
            else:
                frame = Image.open(os.path.join(HERE, 'frames', src, f'f{first + j:04d}.jpg')).convert('RGBA')
                if frame.size != (W, H):
                    frame = frame.resize((W, H), Image.LANCZOS)
            for text, t0, t1, style, y in TITLES:
                a = ramp(t, t0, t1)
                if a > 0:
                    place(frame, layers[text], W / 2, y, a, dy=8 * (1 - smooth((t - t0) / 0.45)))
            if n < 9:
                frame = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), frame, n / 9)
            frame.convert('RGB').save(os.path.join(OUT, f'f{n:04d}.jpg'), quality=95)
        n += 1
print('frames', n)
