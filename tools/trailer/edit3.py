"""'Where is Ben?': the cut (900 frames at 30 fps), its few titles, and the end card where two eyes
open in the dark, blink, and become the E of BEN.

python3 -I edit3.py <outDir> [every]
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
CRAYON = os.path.join(HERE, 'fontpkg', 'package', 'files', 'comic-neue-latin-700-normal.woff2')
LOGO = os.path.join(HERE, '..', '..', 'assets', 'we-left-ben.webp')

TIMELINE = [
    ('shot', 'ben_wall', 0, 108),     # 0.000  DAY 2 LEAVING / day 3. you left. ... the rabbit
    ('shot', 'ben_lou', 0, 114),      # 3.600  NOBODY TALKS ABOUT BEN / lou does. at night.
    ('shot', 'ben_prints', 0, 108),   # 7.400  footprints to the vent
    ('shot', 'ben_glimpse', 30, 90),  # 11.000 eyes lit 12.667, blink 12.833, gone 13.333
    ('shot', 'ben_reach', 0, 114),    # 14.000 crane 3's boom, then the raft
    ('shot', 'ben_bed', 0, 156),      # 17.800 his bed: i left the light on.
    ('shot', 'ben_squad', 0, 78),     # 23.000 my squad
    ('card', 'end', 0, 132),          # 25.600
]
assert sum(seg[3] for seg in TIMELINE) == 900

TITLES = [
    ('SINCE THEN, SIGNS.', 7.85, 10.75, 150),
    ('IN PLACES NOBODY COULD REACH.', 14.4, 17.5, 140),
    ('NOBODY SLEEPS ANYMORE.', 18.25, 20.6, 1000),
    ('SOMEONE DOES.', 20.9, 22.8, 1000),
]
DIP = 5  # frames of black on each side of a cut


def tracked(text, font, track, fill, stroke=0, stroke_fill=None, shadow=True):
    widths = [font.getlength(ch) for ch in text]
    tw = int(sum(widths) + track * (len(text) - 1))
    asc, desc = font.getmetrics()
    pad = 48
    img = Image.new('RGBA', (tw + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))

    def draw(target, col, dy=0, st=0):
        d = ImageDraw.Draw(target)
        x = pad
        for ch, w in zip(text, widths):
            d.text((x, pad + dy), ch, font=font, fill=col, stroke_width=st, stroke_fill=stroke_fill if st else None)
            x += w + track

    if shadow:
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        draw(sh, (0, 0, 0, 235), dy=6 if stroke else 0, st=stroke)
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        img = Image.alpha_composite(img, sh)
        img = Image.alpha_composite(img, sh)
    top = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw(top, fill, st=stroke)
    return Image.alpha_composite(img, top)


def place(frame, layer, cx, cy, alpha, dy=0):
    if alpha <= 0:
        return
    lay = layer
    if alpha < 1:
        lay = layer.copy()
        lay.putalpha(lay.getchannel('A').point(lambda v: int(v * alpha)))
    frame.alpha_composite(lay, (int(round(cx - lay.width / 2)), int(round(cy - lay.height / 2 + dy))))


def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def ramp(t, t0, t1, fade=0.3):
    if t < t0 or t > t1:
        return 0.0
    return max(0.0, min(1.0, (t - t0) / fade, (t1 - t) / fade))


title_font = ImageFont.truetype(INTER + 'Inter-ExtraBold.otf', 62)
layers = {text: tracked(text, title_font, 6, (244, 241, 236, 255)) for text, _, _, _ in TITLES}

# --- The end card's pieces -------------------------------------------------------------------
logo = Image.open(LOGO).convert('RGBA')
CUT = 108                                  # WE LEFT ends above this row; BEN starts below it
S = 0.8                                    # BEN's scale on the card
ben = logo.crop((0, CUT, logo.width, logo.height))
ben = ben.resize((round(ben.width * S), round(ben.height * S)), Image.LANCZOS)
q_font = ImageFont.truetype(CRAYON, 400)
qmark = tracked('?', q_font, 0, (255, 138, 30, 255), stroke=10, stroke_fill=(38, 24, 18, 255), shadow=True)
qmark = qmark.rotate(-8, resample=Image.BICUBIC, expand=True)
q_w = qmark.width - 96                     # the glyph without its padding, for the layout
GROUP_W = ben.width + 10 + q_w
BEN_X = (W - GROUP_W) / 2
BEN_Y = 338
where = tracked('WHERE IS', ImageFont.truetype(INTER + 'InterDisplay-Black.otf', 116), 8, (242, 232, 216, 255), stroke=9, stroke_fill=(38, 24, 18, 255))
here_font = ImageFont.truetype(CRAYON, 80)
HERE_WORD = 'here'
here_steps = [tracked(HERE_WORD[:k], here_font, 2, (255, 138, 30, 255), shadow=False).rotate(-3, resample=Image.BICUBIC, expand=True) if k else None for k in range(len(HERE_WORD) + 1)]

# The two googly eyes, cut out of the logo as circles, at their place in BEN on the card.
EYES = [(424, 259, 58), (537, 262, 56)]
eye_layers = []
for ex, ey, r in EYES:
    box = (ex - r - 2, ey - r - 2, ex + r + 2, ey + r + 2)
    patch = logo.crop(box)
    mask = Image.new('L', patch.size, 0)
    ImageDraw.Draw(mask).ellipse((2, 2, 2 + 2 * r, 2 + 2 * r), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    patch.putalpha(Image.composite(patch.getchannel('A'), Image.new('L', patch.size, 0), mask))
    patch = patch.resize((round(patch.width * S), round(patch.height * S)), Image.LANCZOS)
    cx = BEN_X + ex * S
    cy = BEN_Y + (ey - CUT) * S
    glow = patch.copy()
    glow.putalpha(glow.getchannel('A').point(lambda v: int(v * 0.85)))
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    eye_layers.append((patch, glow, cx, cy))


def eyes(frame, alpha, openness=1.0, glow=0.0):
    for patch, gl, cx, cy in eye_layers:
        if glow > 0:
            place(frame, gl, cx, cy, alpha * glow)
        p = patch
        if openness < 0.999:
            p = patch.resize((patch.width, max(2, round(patch.height * openness))), Image.LANCZOS)
        place(frame, p, cx, cy, alpha)


END_LEN = 132 / FPS


def end_card(t):
    f = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    # 1) Two eyes in the dark, glowing a little; 2) a blink; 3) BEN forms around them.
    a_eyes = smooth((t - 0.3) / 0.5)
    blink = 1.0
    if 0.95 <= t < 1.16:
        u = (t - 0.95) / 0.21
        blink = max(0.06, abs(1 - 2 * u))
    a_ben = smooth((t - 1.3) / 0.6)
    if a_ben > 0:
        place(f, ben, BEN_X + ben.width / 2, BEN_Y + ben.height / 2, a_ben)
    eyes(f, a_eyes, blink, glow=0.6 * (1 - a_ben))
    place(f, where, BEN_X + ben.width / 2, BEN_Y - 62, smooth((t - 1.55) / 0.5))
    if t >= 2.1:
        k = smooth((t - 2.1) / 0.25)
        s = 1.35 - 0.35 * k
        q = qmark.resize((round(qmark.width * s), round(qmark.height * s)), Image.LANCZOS)
        place(f, q, BEN_X + ben.width + 10 + q_w / 2, BEN_Y + ben.height * 0.52, k)
    # Ben answers.
    n = min(len(HERE_WORD), int((t - 2.7) / 0.11) + 1) if t >= 2.7 else 0
    if n:
        full = here_steps[-1]
        lay = here_steps[n]
        place(f, lay, BEN_X + ben.width / 2 - (full.width - lay.width) / 2, BEN_Y + ben.height + 72, 1.0)
    out = 1 - smooth((t - (END_LEN - 0.45)) / 0.45)
    if out < 1:
        f = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), f, max(0.0, out))
    return f


os.makedirs(OUT, exist_ok=True)
n = 0
for si, (kind, src, first, count) in enumerate(TIMELINE):
    for j in range(count):
        t = n / FPS
        if n % EVERY == 0:
            if kind == 'card':
                frame = end_card(j / FPS)
            else:
                frame = Image.open(os.path.join(HERE, 'frames', src, f'f{first + j:04d}.jpg')).convert('RGBA')
                if src == 'ben_reach' and j >= 56:
                    # A digital push-in on the raft (the camera ends centred on it) so its writing reads.
                    z = 1 + 0.75 * smooth((j - 56) / 52)
                    cw, ch = W / z, H / z
                    frame = frame.crop((round((W - cw) / 2), round((H - ch) / 2), round((W + cw) / 2), round((H + ch) / 2))).resize((W, H), Image.LANCZOS)
                for text, t0, t1, y in TITLES:
                    a = ramp(t, t0, t1)
                    if a > 0:
                        place(frame, layers[text], W / 2, y, a, dy=8 * (1 - smooth((t - t0) / 0.5)))
                # A short dip to black on each side of a cut (and up from black at the start).
                fade_in = min(1.0, (j + 1) / (DIP + 1)) if si > 0 else min(1.0, (j + 1) / 16)
                fade_out = min(1.0, (count - j) / (DIP + 1)) if TIMELINE[si + 1][0] == 'shot' else 1.0
                k = min(fade_in, fade_out)
                if k < 1:
                    frame = Image.blend(Image.new('RGBA', (W, H), (0, 0, 0, 255)), frame, k)
            frame.convert('RGB').save(os.path.join(OUT, f'f{n:04d}.jpg'), quality=95)
        n += 1
print('frames', n)
