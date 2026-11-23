#!/usr/bin/env python3
"""Cut the 2-player co-op trailer for We Left Ben from the filmed shots.

    node tools/trailer/capture.cjs          # films out/shots/*.mp4 + *.wav first
    python3 tools/trailer/edit.py           # -> out/we-left-ben-coop-trailer.mp4
    python3 tools/trailer/edit.py --sheet   # just a contact sheet of the cut (out/sheet.jpg)
    python3 tools/trailer/edit.py --from 40 --to 60   # render part of it (for checking)

The picture is the game itself (stage.js / shots.js); every sound under it is
the game's own: each shot's sound was rendered by the game's audio engine in
step with its frames, the score is the game's main theme (assets/music/menu.mp3,
which carries Ben's tune) cut on its own bars, with the Hunter's sting, and the
hits are built from the game's recorded effects (assets/sfx).

The cut is written against the theme: 75 bpm, so a bar every 3.2 s from 0.
"""

import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
SHOTS = os.path.join(OUT, 'shots')
FONTS = os.path.join(OUT, 'fonts')
FINAL = os.path.join(OUT, 'we-left-ben-coop-trailer.mp4')

FPS = 30
W, H = 1920, 1080
SR = 48000

INTER = '/usr/share/fonts/opentype/inter/'
F_ANTON = os.path.join(FONTS, 'Anton.ttf')
F_LINE = INTER + 'InterDisplay-Bold.otf'
F_PILL = INTER + 'InterDisplay-Black.otf'

BLUE = (110, 220, 255)  # player one, as in the game (PLAYER_LOOK ring)
GREEN = (140, 255, 160)  # player two, as in the game (ALLY_LOOK ring)
CREAM = (246, 236, 220)  # the logo's "WE LEFT"
ORANGE = (240, 128, 32)  # the logo's BEN

# --- the cut -------------------------------------------------------------------------------
# t0/t1: where it sits in the trailer (s). clip: a shot from out/shots, from `at` s in.
# gain: its sound. zoom: (start, end) scale for a slow push. Bars fall on multiples of 3.2.

EDIT = [
    dict(t0=0.0, t1=4.4, card='black'),
    # Cold open: a Hunter pins you; your friend sprints back and shoves it off.
    dict(t0=4.4, t1=9.4, clip='hunter_save', at=1.7, zoom=(1.0, 1.06), gain=0.85),
    dict(t0=9.4, t1=9.6, card='black'),
    dict(t0=9.6, t1=12.8, card='logo'),
    # The first safe room: DAY 1 HERE. DAY 2 LEAVING. / day 3. you left.
    dict(t0=12.8, t1=19.6, clip='saferoom', at=0.0, zoom=(1.0, 1.04), gain=0.7),
    # Two phones, one night: the same moment through each survivor's camera.
    dict(t0=19.6, t1=25.6, phones=('phones', 'phones_p2'), at=0.0, gain=0.55),
    dict(t0=25.6, t1=28.8, clip='horde', at=1.2, gain=0.7),
    dict(t0=28.8, t1=34.0, clip='revive', at=1.4, zoom=(1.0, 1.05), gain=0.7),
    # The theme drops out under the sneak; she screams on the bar the theme comes back.
    dict(t0=34.0, t1=41.6, clip='witch', at=0.4, zoom=(1.0, 1.05), gain=0.8),
    dict(t0=41.6, t1=44.8, clip='tank', at=0.2, gain=0.75),
    dict(t0=44.8, t1=46.4, clip='alarm', at=0.6, gain=0.75),
    dict(t0=46.4, t1=51.2, clip='gas_station', at=0.8, gain=0.9),  # the pump goes up on the bar at 48.0
    dict(t0=51.2, t1=52.8, clip='flare', at=1.2, gain=0.8),
    dict(t0=52.8, t1=54.4, clip='ferry_arrive', at=2.4, gain=0.7),
    dict(t0=54.4, t1=57.6, clip='ferry', at=5.6, zoom=(1.0, 1.04), gain=0.75),
    # No trophies. No ranked. No randoms.
    dict(t0=57.6, t1=59.8, clip='walk_graveyard', at=1.0, gain=0.55),
    dict(t0=59.8, t1=62.0, clip='walk_suburbia', at=1.0, gain=0.55),
    dict(t0=62.0, t1=64.0, clip='walk_junkyard', at=1.2, gain=0.55),
    dict(t0=64.0, t1=66.4, clip='walk_building', at=1.0, gain=0.55, fade_out=0.5),
    dict(t0=66.4, t1=67.2, card='black'),
    # Ben's chalk: "my squad", and one more standing apart.
    dict(t0=67.2, t1=73.6, clip='chalk', at=1.0, zoom=(1.0, 1.05), gain=0.5, fade_in=0.4, fade_out=0.6),
    dict(t0=73.6, t1=76.8, card='black'),
    dict(t0=76.8, t1=83.2, card='endlogo'),
    # The button: in orange crayon, outside the first safe room.
    dict(t0=83.2, t1=88.8, clip='come_too', at=0.6, gain=0.6, fade_in=0.3, fade_out=1.2),
]
END = EDIT[-1]['t1']

# style: line = sentence on black, line_low = sentence over picture, cap = lower third,
# cap_top = top of frame, big = large, mid-low.
CAPTIONS = [
    dict(t0=0.35, t1=2.55, text="You've beaten your friends a thousand times.", style='line'),
    dict(t0=2.8, t1=4.3, text='Ever saved one?', style='line'),
    dict(t0=14.0, t1=18.9, text="YOUR TEAMMATE ISN'T A BOT ANYMORE.", style='cap'),
    dict(t0=20.1, t1=25.3, text='TWO PHONES. ONE NIGHT.', style='cap_top'),
    dict(t0=26.1, t1=28.6, text="WATCH EACH OTHER'S BACKS.", style='cap'),
    dict(t0=29.4, t1=32.7, text='PICK EACH OTHER UP.', style='cap'),
    dict(t0=35.0, t1=38.2, text="DON'T WAKE HER.", style='cap'),
    dict(t0=38.75, t1=41.3, text='SAM WOKE HER.', style='cap', color=GREEN),
    dict(t0=55.1, t1=57.45, text='GET EACH OTHER HOME.', style='cap'),
    dict(t0=57.85, t1=59.65, text='NO TROPHIES.', style='big'),
    dict(t0=60.05, t1=61.85, text='NO RANKED.', style='big'),
    dict(t0=62.2, t1=63.9, text='NO RANDOMS.', style='big'),
    dict(t0=64.25, t1=66.3, text='JUST YOU AND YOUR BEST FRIEND.', style='big'),
    dict(t0=68.9, t1=73.3, text='We left Ben.', style='line_low'),
    dict(t0=74.0, t1=76.55, text="Don't leave your friend.", style='line'),
]

# --- helpers ---------------------------------------------------------------------------------


def ease_out(k):
    k = min(1.0, max(0.0, k))
    return 1 - (1 - k) ** 3


def smooth(k):
    k = min(1.0, max(0.0, k))
    return k * k * (3 - 2 * k)


def font(path, size):
    return ImageFont.truetype(path, size)


def text_image(text, fnt, color=(255, 255, 255), tracking=0, shadow=10, shadow_alpha=170):
    """Text on a transparent image with a soft dark shadow (readable on the game's night)."""
    asc, desc = fnt.getmetrics()
    widths = [fnt.getlength(c) for c in text]
    w = int(sum(widths) + tracking * max(0, len(text) - 1)) + 4
    h = asc + desc
    pad = shadow * 3 + 4
    size = (w + pad * 2, h + pad * 2)
    mask = Image.new('L', size, 0)
    d = ImageDraw.Draw(mask)
    x = pad
    for c, cw in zip(text, widths):
        d.text((x, pad), c, font=fnt, fill=255)
        x += cw + tracking
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    if shadow:
        out.putalpha(mask.filter(ImageFilter.GaussianBlur(shadow)).point(lambda v: int(v * shadow_alpha / 255)))
    return Image.composite(Image.new('RGBA', size, tuple(color) + (255,)), out, mask)


def pill(text, fnt, fg, bg, padx=26, pady=12):
    """A rounded label (the name tags, the CO-OP badge) with a soft shadow under it."""
    asc, desc = fnt.getmetrics()
    tw = int(fnt.getlength(text))
    h = asc + desc + pady * 2
    w = tw + padx * 2
    size = (w + 40, h + 44)
    sh = Image.new('L', size, 0)
    ImageDraw.Draw(sh).rounded_rectangle((20, 26, 20 + w, 26 + h), radius=h // 2, fill=150)
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    img.putalpha(sh.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((20, 20, 20 + w, 20 + h), radius=h // 2, fill=tuple(bg) + (255,))
    d.text((20 + padx, 20 + pady), text, font=fnt, fill=tuple(fg) + (255,))
    return img


def scaled(img, s):
    if abs(s - 1) < 1e-3:
        return img
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.BILINEAR)


def paste_alpha(dst, src, cx, cy, alpha=1.0, scale=1.0):
    """Paste an RGBA image centred on (cx, cy) with extra opacity, onto an RGB frame."""
    if alpha <= 0.003:
        return
    im = scaled(src, scale)
    x = int(round(cx - im.width / 2))
    y = int(round(cy - im.height / 2))
    a = im.getchannel('A')
    if alpha < 0.999:
        a = a.point(lambda v: int(v * alpha))
    dst.paste(im.convert('RGB'), (x, y), a)


def darken(img, k):
    return Image.eval(img, lambda v: int(v * k))


# --- reading the shots -----------------------------------------------------------------------


class Clip:
    """Frames of a filmed shot, decoded in order from `at` seconds."""

    def __init__(self, name, at):
        self.path = os.path.join(SHOTS, f'{name}.mp4')
        if not os.path.exists(self.path):
            sys.exit(f'missing {self.path}: run node tools/trailer/capture.cjs first')
        self.p = subprocess.Popen(
            ['ffmpeg', '-loglevel', 'quiet', '-ss', f'{at:.4f}', '-i', self.path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
            stdout=subprocess.PIPE,
        )
        self.last = None

    def next(self):
        buf = self.p.stdout.read(W * H * 3)
        if len(buf) == W * H * 3:
            self.last = Image.frombuffer('RGB', (W, H), buf, 'raw', 'RGB', 0, 1)
        return self.last.copy() if self.last else Image.new('RGB', (W, H))

    def close(self):
        self.p.kill()
        self.p.wait()
        self.p.stdout.close()


def still(name, t):
    out = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', os.path.join(SHOTS, f'{name}.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
    return Image.frombuffer('RGB', (W, H), out.stdout, 'raw', 'RGB', 0, 1).copy()


def zoomed(img, z):
    if abs(z - 1) < 1e-4:
        return img
    cw, ch = W / z, H / z
    x0, y0 = (W - cw) / 2, (H - ch) / 2
    return img.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))


# --- the pieces that aren't gameplay -------------------------------------------------------


class Look:
    """Everything drawn once: captions, the logo cards, the phones."""

    def __init__(self):
        self.anton = {s: font(F_ANTON, s) for s in (84, 96, 132)}
        self.line = font(F_LINE, 76)
        self.caps = []
        for c in CAPTIONS:
            st = c['style']
            color = c.get('color', (255, 255, 255))
            if st in ('line', 'line_low'):
                img = text_image(c['text'], self.line, color, tracking=0, shadow=12)
            elif st == 'big':
                img = text_image(c['text'], self.anton[132], color, tracking=3, shadow=16, shadow_alpha=200)
            elif st == 'cap_top':
                img = text_image(c['text'], self.anton[84], color, tracking=3, shadow=12)
            else:
                img = text_image(c['text'], self.anton[96], color, tracking=3, shadow=14, shadow_alpha=200)
            self.caps.append(img)
        # A dark band rising from the bottom, behind lower-third captions.
        g = np.linspace(0, 1, 420) ** 1.6
        band = np.zeros((420, W, 4), np.uint8)
        band[..., 3] = (g * 175)[:, None].astype(np.uint8)
        self.band = Image.fromarray(band, 'RGBA')
        # The logo and its lockups.
        logo = Image.open(os.path.join(ROOT, 'assets', 'we-left-ben.webp')).convert('RGBA')
        self.logo = logo.resize((1040, int(logo.height * 1040 / logo.width)), Image.LANCZOS)
        glow = Image.new('L', (W, H), 0)
        ImageDraw.Draw(glow).ellipse((W / 2 - 700, 140, W / 2 + 700, 900), fill=90)
        self.glow = glow.filter(ImageFilter.GaussianBlur(160))
        pf = font(F_PILL, 58)
        self.badge_now = pill('NOW IN 2-PLAYER CO-OP', pf, (38, 24, 14), CREAM, padx=34, pady=12)
        self.badge = pill('2-PLAYER CO-OP', pf, (38, 24, 14), CREAM, padx=34, pady=12)
        self.cta = text_image('GRAB A FRIEND.', self.anton[84], (255, 255, 255), tracking=4, shadow=12)
        dots = font(F_PILL, 34)
        self.tag_you = pill('YOU', dots, (11, 42, 51), BLUE, padx=22, pady=8)
        self.tag_sam = pill('SAM', dots, (15, 42, 18), GREEN, padx=22, pady=8)
        # What's behind the logo: the crossroads horde, dark and soft.
        bg = still('horde', 6.5)
        self.logo_bg = darken(bg.filter(ImageFilter.GaussianBlur(14)), 0.28)
        bg2 = still('ferry', 8.6)
        self.end_bg = darken(bg2.filter(ImageFilter.GaussianBlur(14)), 0.26)
        # Phones: a 16:9 screen in a dark bezel with rounded corners.
        self.sw, self.sh = 828, 466
        bez = 18
        self.pw, self.ph = self.sw + bez * 2, self.sh + bez * 2
        mask = Image.new('L', (self.sw, self.sh), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, self.sw - 1, self.sh - 1), radius=34, fill=255)
        self.screen_mask = mask
        body = Image.new('RGBA', (self.pw + 80, self.ph + 80), (0, 0, 0, 0))
        sh = Image.new('L', body.size, 0)
        ImageDraw.Draw(sh).rounded_rectangle((40, 52, 40 + self.pw, 52 + self.ph), radius=54, fill=200)
        body.putalpha(sh.filter(ImageFilter.GaussianBlur(22)))
        d = ImageDraw.Draw(body)
        d.rounded_rectangle((40, 40, 40 + self.pw, 40 + self.ph), radius=54, fill=(16, 17, 20, 255), outline=(70, 72, 80, 255), width=3)
        d.rounded_rectangle((40 + 7, 40 + 7, 40 + self.pw - 7, 40 + self.ph - 7), radius=48, outline=(34, 35, 40, 255), width=2)
        self.phone = body

    def card(self, kind, t, frame_t):
        """A logo card at `t` seconds into it."""
        if kind == 'black':
            return Image.new('RGB', (W, H))
        end = kind == 'endlogo'
        base = (self.end_bg if end else self.logo_bg).copy()
        orange = Image.new('RGB', (W, H), (90, 40, 10))
        base = Image.composite(orange, base, self.glow.point(lambda v: int(v * min(1, t / 0.4))))
        k = ease_out(t / 0.45)
        s = 1.14 - 0.14 * k + 0.02 * smooth(t / 6.0)
        paste_alpha(base, self.logo, W / 2, 430 if end else 470, alpha=min(1, t / 0.12), scale=s)
        bt = t - (0.55 if end else 0.4)
        if bt > 0:
            b = ease_out(bt / 0.35)
            paste_alpha(base, self.badge if end else self.badge_now, W / 2, 830 if end else 875, alpha=b, scale=1.15 - 0.15 * b)
        if end and t > 1.4:
            c = ease_out((t - 1.4) / 0.5)
            paste_alpha(base, self.cta, W / 2, 968 - 14 * c, alpha=c)
        # The slam: a quick flash as it lands.
        if t < 0.1:
            base = Image.blend(base, Image.new('RGB', (W, H), (255, 236, 210)), 0.35 * (1 - t / 0.1))
        return base

    def phones(self, a, b, t):
        """Player one's screen and player two's, side by side, over the night."""
        bg = a.resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3)).resize((W, H), Image.BILINEAR)
        frame = darken(bg, 0.32)
        k = ease_out(t / 0.5)
        y = 590 + (1 - k) * 60
        for img, cx, tag in ((a, W / 2 - 460, self.tag_you), (b, W / 2 + 460, self.tag_sam)):
            body = self.phone
            paste_alpha(frame, body, cx, y, alpha=k)
            scr = img.resize((self.sw, self.sh), Image.LANCZOS)
            m = self.screen_mask if k >= 0.999 else self.screen_mask.point(lambda v: int(v * k))
            frame.paste(scr, (int(cx - self.sw / 2), int(y - self.sh / 2)), m)
            paste_alpha(frame, tag, cx, y + self.ph / 2 + 58, alpha=ease_out((t - 0.5) / 0.4))
        return frame


def caption_pos(style):
    return {'line': (W / 2, H / 2), 'line_low': (W / 2, 915), 'cap': (W / 2, 948), 'cap_top': (W / 2, 140), 'big': (W / 2, 880)}[style]


def draw_captions(frame, t, look):
    for c, img in zip(CAPTIONS, look.caps):
        if not (c['t0'] - 0.01 <= t <= c['t1'] + 0.01):
            continue
        st = c['style']
        a_in = 0.28 if st.startswith('line') else 0.16
        a_out = 0.3 if st.startswith('line') else 0.14
        ki = ease_out((t - c['t0']) / a_in)
        ko = 1 - smooth((t - (c['t1'] - a_out)) / a_out) if t > c['t1'] - a_out else 1
        alpha = min(ki, ko)
        cx, cy = caption_pos(st)
        if st in ('cap', 'big', 'line_low'):
            frame.paste(Image.new('RGB', (W, 420)), (0, H - 420), look.band.getchannel('A').point(lambda v: int(v * alpha)))
        if st.startswith('line'):
            paste_alpha(frame, img, cx, cy + (1 - ki) * 10, alpha=alpha)
        else:
            paste_alpha(frame, img, cx, cy, alpha=alpha, scale=1.1 - 0.1 * ki)


# --- picture -------------------------------------------------------------------------------


def render_video(path, t_from=0.0, t_to=None, sheet=False, stills=None):
    look = Look()
    t_to = END if t_to is None else t_to
    n0, n1 = int(round(t_from * FPS)), int(round(t_to * FPS))
    if stills:
        sheet = True
        want = {int(round(x * FPS)) for x in stills}
        n0, n1 = min(want), max(want) + 1
    enc = None
    if not sheet:
        enc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-tune', 'film', path],
            stdin=subprocess.PIPE,
        )
    open_clips = {}
    thumbs = []
    for n in range(n0, n1):
        t = n / FPS
        seg = next(s for s in EDIT if s['t0'] - 1e-6 <= t < s['t1'] - 1e-6) if t < END else EDIT[-1]
        lt = t - seg['t0']
        key = id(seg)
        if 'clip' in seg or 'phones' in seg:
            if key not in open_clips:
                for k in list(open_clips):
                    for c in open_clips[k]:
                        c.close()
                    del open_clips[k]
                at = seg['at'] + lt
                names = seg['phones'] if 'phones' in seg else (seg['clip'],)
                open_clips[key] = [Clip(nm, at) for nm in names]
            frames = [c.next() for c in open_clips[key]]
            if 'phones' in seg:
                frame = look.phones(frames[0], frames[1], lt)
            else:
                frame = frames[0]
                z0, z1 = seg.get('zoom', (1.0, 1.0))
                frame = zoomed(frame, z0 + (z1 - z0) * smooth(lt / (seg['t1'] - seg['t0'])))
        else:
            frame = look.card(seg['card'], lt, t)
        # Fades to and from black inside a segment.
        fi, fo = seg.get('fade_in', 0), seg.get('fade_out', 0)
        k = 1.0
        if fi and lt < fi:
            k = min(k, smooth(lt / fi))
        if fo and lt > seg['t1'] - seg['t0'] - fo:
            k = min(k, smooth((seg['t1'] - seg['t0'] - lt) / fo))
        if k < 0.999:
            frame = darken(frame, k)
        draw_captions(frame, t, look)
        if stills:
            if n in want:
                frame.save(os.path.join(OUT, f'still_{t:06.2f}.jpg'), quality=90)
        elif sheet:
            if n % 15 == 0:
                thumbs.append((t, frame.resize((384, 216), Image.BILINEAR)))
        else:
            enc.stdin.write(frame.tobytes())
        if n % 150 == 0:
            print(f'  picture {t:5.1f} s', flush=True)
    for k in list(open_clips):
        for c in open_clips[k]:
            c.close()
    if enc:
        enc.stdin.close()
        enc.wait()
    if sheet and not stills:
        cols = 10
        rows = (len(thumbs) + cols - 1) // cols
        im = Image.new('RGB', (cols * 384, rows * 236), (16, 16, 16))
        d = ImageDraw.Draw(im)
        for i, (t, th) in enumerate(thumbs):
            x, y = (i % cols) * 384, (i // cols) * 236
            im.paste(th, (x, y + 20))
            d.text((x + 4, y + 3), f'{t:.1f}s', fill=(255, 255, 0))
        im.save(path, quality=85)


# --- sound -------------------------------------------------------------------------------------


def decode(path, start=0.0, dur=None):
    cmd = ['ffmpeg', '-loglevel', 'error', '-ss', f'{start:.4f}', '-i', path]
    if dur:
        cmd += ['-t', f'{dur:.4f}']
    cmd += ['-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32).reshape(-1, 2).copy()


def place(buf, x, at, gain=1.0, fade_in=0.01, fade_out=0.01):
    x = x * gain
    n = len(x)
    if n == 0:
        return
    fi = max(1, int(fade_in * SR))
    fo = max(1, int(fade_out * SR))
    env = np.ones(n, np.float32)
    env[:fi] = np.linspace(0, 1, min(fi, n))[: len(env[:fi])]
    env[-fo:] = np.minimum(env[-fo:], np.linspace(1, 0, min(fo, n)))
    x = x * env[:, None]
    i0 = int(round(at * SR))
    i1 = min(len(buf), i0 + n)
    if i1 > i0:
        buf[i0:i1] += x[: i1 - i0]


class Sfx:
    """The game's recorded effects (assets/sfx), cut the way src/sfx-bank.js cuts them."""

    def __init__(self):
        src = open(os.path.join(ROOT, 'assets', 'sfx', 'bank.js')).read()
        self.sprites = json.loads(re.search(r'export const SPRITES = (\{.*?\});\n', src, re.S).group(1))
        self.sounds = json.loads(re.search(r'export const SOUNDS = (\{.*?\});\n', src, re.S).group(1))
        self.loops = json.loads(re.search(r'export const LOOPS = (\{.*?\});', src, re.S).group(1))
        self.cache = {}

    def sprite(self, key):
        if key not in self.cache:
            meta = self.sprites[key]
            x = decode(os.path.join(ROOT, 'assets', 'sfx', meta['file']))
            n = int(SR * (meta['marker'] + 0.2))
            i = int(np.argmax(np.abs(x[:n, 0])))
            shift = i / SR - meta['marker'] if abs(x[i, 0]) >= 0.05 else 0.0
            self.cache[key] = (x, shift)
        return self.cache[key]

    def get(self, sid, v=0):
        s = self.sounds[sid]
        x, shift = self.sprite(s['s'])
        t, dur = s['v'][v % len(s['v'])]
        i0 = int((t + shift) * SR)
        return x[i0 : i0 + int(dur * SR)]

    def loop(self, lid, seconds):
        L = self.loops[lid]
        x, shift = self.sprite(L['s'])
        a, b = int((L['a'] + shift) * SR), int((L['b'] + shift) * SR)
        seg = x[a:b]
        reps = int(math.ceil(seconds * SR / len(seg)))
        return np.concatenate([seg] * reps)[: int(seconds * SR)]


def sub_boom(dur=1.6, f0=70, f1=32):
    t = np.arange(int(dur * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 3.5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t * 2.6) * np.minimum(1, t / 0.004)
    s = np.sin(ph) * env * 0.9
    return np.stack([s, s], 1).astype(np.float32)


# The theme's level (dB) over the trailer: (time, dB) points, straight lines between them.
THEME_DB = [
    (0.0, -2), (4.2, -2), (4.6, -3), (9.3, -3), (9.6, 0),  # dark open, the save, the logo
    (25.4, 0), (25.8, -2), (33.8, -2),  # the horde and the revive: let the guns through
    (34.2, 0), (38.3, 0), (38.5, -2), (57.4, -2),  # the sneak; then the scream, the run for the ferry
    (57.8, 4), (66.4, 4),  # no trophies, no ranked, no randoms
    (67.2, 3), (76.9, 3),  # Ben's chalk, "Don't leave your friend."
]
# The game's own sound, by the same rule: up in the action, down under the lines.
GAME_DB = [(0.0, 0), (38.3, 0), (38.5, 3), (57.4, 3), (57.8, -4), (66.4, -4), (67.2, -3), (END, -1)]


def automation(n, points):
    t = np.arange(n) / SR
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (10 ** (np.interp(t, xs, ys) / 20)).astype(np.float32)


def render_audio(path):
    total = int(math.ceil(END * SR)) + SR
    music = np.zeros((total, 2), np.float32)
    fx = np.zeros((total, 2), np.float32)
    game = np.zeros((total, 2), np.float32)
    sfx = Sfx()
    M = os.path.join(ROOT, 'assets', 'music')

    # The theme, from its first downbeat (bars every 3.2 s from here), to the end, ridden by hand:
    # low under the cold open, room for the game where it speaks, down again for the button.
    menu = os.path.join(M, 'menu.mp3')
    theme = decode(menu, 0.096, 77.0)
    theme = theme * automation(len(theme), THEME_DB)[:, None]
    place(music, theme, 0.0, gain=0.95, fade_in=0.4, fade_out=0.3)
    # On the end card the theme comes back in full: its first big bar again (38.5 s in), two bars of it.
    place(music, decode(menu, 38.496, 7.2), 76.8, gain=0.8, fade_in=0.005, fade_out=1.6)
    # And the button gets its quiet opening, the way the trailer started.
    place(music, decode(menu, 0.096, END - 83.2 + 0.2), 83.2, gain=0.95 * 10 ** (-2 / 20), fade_in=0.6, fade_out=2.2)
    # The Hunter's sting, on its screech.
    place(music, decode(os.path.join(M, 'sting_hunter.mp3')), 5.35, gain=0.75, fade_out=0.6)

    # Each shot's own sound, cut with its picture.
    for s in EDIT:
        if 'clip' in s or 'phones' in s:
            name = s['phones'][0] if 'phones' in s else s['clip']
            dur = s['t1'] - s['t0']
            x = decode(os.path.join(SHOTS, f'{name}.wav'), s['at'], dur)
            place(game, x, s['t0'], gain=s.get('gain', 0.7), fade_in=max(0.012, s.get('fade_in', 0)), fade_out=max(0.02, s.get('fade_out', 0)))

    # The night under the cold open, and under the last black card.
    night = sfx.loop('amb.night', 5.0)
    place(fx, night[: int(4.6 * SR)], 0.0, gain=0.55, fade_in=0.8, fade_out=0.4)
    place(fx, night[: int(3.4 * SR)], 73.5, gain=0.4, fade_in=0.5, fade_out=0.5)

    # Hits: the cut to black after the save, the logo slams, the scream bar, the finale.
    boom = sub_boom()
    thunder = sfx.get('thunder')
    expl = sfx.get('explosion', 1)
    slam = sfx.get('door.slam')
    place(fx, slam, 9.38, gain=0.35, fade_out=0.3)
    for at, g in ((9.6, 1.0), (76.8, 1.0)):
        place(fx, boom, at, gain=0.75 * g, fade_out=0.4)
        place(fx, thunder[: int(3.5 * SR)], at, gain=0.45 * g, fade_out=1.2)
        place(fx, expl, at, gain=0.25 * g, fade_out=0.6)
    place(fx, sfx.get('riser'), 37.0, gain=0.35, fade_out=0.05)
    place(fx, boom, 38.4, gain=0.55, fade_out=0.4)
    place(fx, boom, 48.05, gain=0.5, fade_out=0.4)
    place(fx, boom, 66.4, gain=0.35, fade_out=0.4)

    game *= automation(len(game), GAME_DB)[:, None]
    mix = music * 0.9 + game * 0.75 + fx * 0.8
    if os.environ.get('STEMS'):
        for nm, x in (('music', music * 0.9), ('game', game * 0.75), ('fx', fx * 0.8)):
            write_wav(os.path.join(OUT, f'stem_{nm}.wav'), x[: int(END * SR)])
    # Keep the theme under the game where the game should speak: the screech, the scream, the blast.
    raw = os.path.join(OUT, 'mix_raw.wav')
    write_wav(raw, mix[: int(END * SR)] * 0.5)
    # Loudness for streaming: one gain for the whole trailer to -14 LUFS (so the quiet parts stay
    # quiet), then a limiter keeps the peaks under -1.5 dBFS. (loudnorm would switch to its
    # dynamic mode here and flatten the cold open.)
    def integrated(f):
        err = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
    gain_db = -14.0 - integrated(raw)
    for _ in range(2):
        af = f'volume={gain_db:.2f}dB,alimiter=limit={10 ** (-1.5 / 20):.4f}:attack=3:release=60:level=disabled'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', af, '-ar', str(SR), '-c:a', 'pcm_s16le', path], check=True)
        got = integrated(path)
        gain_db += -14.0 - got
    print(f'  sound: {got:.1f} LUFS')


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype('<i2').tobytes()
    with open(path, 'wb') as f:
        f.write(b'RIFF' + (36 + len(pcm)).to_bytes(4, 'little') + b'WAVEfmt ')
        f.write((16).to_bytes(4, 'little') + (1).to_bytes(2, 'little') + (2).to_bytes(2, 'little'))
        f.write(SR.to_bytes(4, 'little') + (SR * 4).to_bytes(4, 'little') + (4).to_bytes(2, 'little') + (16).to_bytes(2, 'little'))
        f.write(b'data' + len(pcm).to_bytes(4, 'little') + pcm)


def main():
    args = sys.argv[1:]
    os.makedirs(OUT, exist_ok=True)
    if '--frames' in args:
        ts = [float(x) for x in args[args.index('--frames') + 1].split(',')]
        for t in ts:
            render_video(None, stills=[t])
        print('stills in', OUT)
        return
    if '--sheet' in args:
        render_video(os.path.join(OUT, 'sheet.jpg'), sheet=True)
        print(os.path.join(OUT, 'sheet.jpg'))
        return
    t_from = float(args[args.index('--from') + 1]) if '--from' in args else 0.0
    t_to = float(args[args.index('--to') + 1]) if '--to' in args else None
    video = os.path.join(OUT, 'video.mp4')
    audio = os.path.join(OUT, 'mix.wav')
    if '--sound-only' not in args or not os.path.exists(video):
        print('picture...')
        render_video(video, t_from, t_to)
    print('sound...')
    render_audio(audio)
    out = FINAL if (t_from == 0 and t_to is None) else os.path.join(OUT, f'part_{t_from:g}_{t_to:g}.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-ss', f'{t_from:.3f}', '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], check=True)
    print(out)


if __name__ == '__main__':
    main()
