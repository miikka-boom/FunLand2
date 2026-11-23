#!/usr/bin/env python3
"""A 30-second spot for We Left Ben in 2-player co-op, cut the way horror-movie trailers and
game TV spots were cut in 2008: sold as a zombie movie you star in, with a friend.

    node tools/trailer/capture.cjs            # films out/shots/ first (this uses horde_big, terror_scare too)
    python3 tools/trailer/spot30.py           # -> out/we-left-ben-coop-spot30.mp4
    python3 tools/trailer/spot30.py --frames 3.5,9.2   # full-size stills of the cut

No logo and no title, on purpose: it ends on the tagline. The look: 2.35:1 letterbox, a cold,
drained grade, film grain and a vignette; title cards in a Trajan-style serif, alone on black,
each landing on a boom. The rhythm: a quiet cold open, two cards, then the Pier 9 escape cue
drops and the cuts fall on its bars (170 bpm), two "starring" cards, the escape, the tagline in
silence, and one last scare.

Built on edit.py (the long trailer): same shots, same sound engine output, same helpers.
"""

import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edit as E  # noqa: E402

W, H, FPS, SR = E.W, E.H, E.FPS, E.SR
OUT = E.OUT
FINAL = os.path.join(OUT, 'we-left-ben-coop-spot30.mp4')
F_SERIF = os.path.join(E.FONTS, 'Cinzel-Bold.ttf')
END = 30.0

# The escape cue's bars (finale_escape.mp3, 170 bpm: a bar every 1.41176 s from 0.5 s in). Its drop,
# 10.382 s in, lands on the cut to the horde at 8.6; the cards and cuts after it sit on its bars.
CUE_OFFSET = 10.382 - 8.6
BAR = 60 / 170 * 4


def bar(k):
    """Trailer time of the k-th bar after the drop (0 = the drop)."""
    return round((8.6 + k * BAR) * FPS) / FPS


B = [bar(k) for k in range(12)]  # 8.6, 10.0, 11.43, 12.83, 14.23, 15.67, 17.07, 18.47, 19.9, 21.3, 22.73, 24.13
CARD2 = round((8.6 - BAR) * FPS) / FPS  # the bar before the drop: 7.2

# --- the cut -----------------------------------------------------------------------------------
# clip: a filmed shot from `at` s in. card: a title card (see CARDS). flash: white frames on the cut.

EDIT = [
    dict(t0=0.0, t1=0.4, card=None),
    # Cold open: something is crying in the dark, and the two of you creep past.
    dict(t0=0.4, t1=3.3, clip='witch', at=1.1, gain=1.0, fade_in=0.4, crop=-40),
    dict(t0=3.3, t1=4.7, card='city'),
    # A Hunter pins you; Sam sprints back and shoves it off.
    dict(t0=4.7, t1=CARD2, clip='hunter_save', at=2.45, gain=0.9),
    dict(t0=CARD2, t1=B[0], card='nights'),
    # The drop: the horde, then a cut on every bar.
    dict(t0=B[0], t1=B[1], clip='horde_big', at=0.6, gain=0.85, flash=True),
    dict(t0=B[1], t1=B[2], clip='tank', at=4.2, gain=0.85),
    dict(t0=B[2], t1=B[3], clip='witch', at=4.55, gain=0.9, crop=-40),
    dict(t0=B[3], t1=B[4], clip='revive', at=2.9, gain=0.8),
    dict(t0=B[4], t1=B[5], clip='alarm', at=0.55, gain=0.85),
    dict(t0=B[5], t1=B[6], clip='gas_station', at=2.4, gain=1.0, flash=True),
    dict(t0=B[6], t1=B[7], card='starring'),
    dict(t0=B[7], t1=B[8], clip='flare', at=1.35, gain=0.85),
    dict(t0=B[8], t1=B[9], card='friend'),
    dict(t0=B[9], t1=B[11], clip='ferry', at=5.75, gain=0.85),
    # The cue stops dead on the bar; the tagline in the quiet.
    dict(t0=B[11], t1=B[11] + 0.3, card=None),
    dict(t0=B[11] + 0.3, t1=27.3, card='tagline'),
    # One more thing: walking the rows in the dark, a heartbeat, you turn round...
    dict(t0=27.3, t1=29.5, clip='terror_scare', at=0.85, gain=1.0, punch=(2.633, 677, 737)),
    dict(t0=29.5, t1=END, card=None),
]

# Title cards: (small line above, big line, small line below).
CARDS = {
    'city': (None, 'THE CITY STOPPED SLEEPING.', None),
    'nights': (None, 'NO TWO NIGHTS ARE THE SAME.', None),
    'starring': ('STARRING', 'YOU', None),
    'friend': ('AND', 'YOUR BEST FRIEND', None),
    'tagline': (None, 'NOBODY GETS LEFT BEHIND.', '2-PLAYER CO-OP'),
}

# --- the look ------------------------------------------------------------------------------------

BOX = 132  # letterbox bars: 1920 x 816 picture, 2.35:1
PH = H - 2 * BOX


class Look:
    def __init__(self):
        rng = np.random.default_rng(2008)
        # Film grain: a loop of noise frames at a third of the resolution (clumpy, like 16 mm, and
        # cheap to encode), cycled at random.
        self.grain = []
        for _ in range(24):
            n = rng.normal(0, 1, (PH // 3, W // 3)).astype(np.float32)
            im = Image.fromarray(np.clip(n * 40 + 128, 0, 255).astype(np.uint8), 'L').resize((W, PH), Image.BILINEAR)
            self.grain.append((np.asarray(im, np.float32) - 128) / 40)
        self.order = rng.integers(0, len(self.grain), 2000)
        y, x = np.mgrid[0:PH, 0:W].astype(np.float32)
        r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - PH / 2) / (PH / 2)) ** 2) / np.sqrt(2)
        self.vig = (1 - 0.55 * np.clip(r, 0, 1) ** 2.2).astype(np.float32)
        self.flicker = 1 + 0.018 * rng.standard_normal(2000).astype(np.float32)
        # Title cards, drawn once.
        self.cards = {k: self.card(*v) for k, v in CARDS.items()}

    def card(self, small, big, under):
        big_f = ImageFont.truetype(F_SERIF, 104 if len(big) < 12 else 84)
        sm_f = ImageFont.truetype(F_SERIF, 40)
        un_f = ImageFont.truetype(F_SERIF, 36)
        parts = []
        if small:
            parts.append((E.text_image(small, sm_f, (205, 205, 200), tracking=14, shadow=0), 26))
        parts.append((E.text_image(big, big_f, (236, 236, 230), tracking=6, shadow=0), 0))
        if under:
            parts.append((E.text_image(under, un_f, (170, 172, 168), tracking=16, shadow=0), 34))
        w = max(p.width for p, _ in parts)
        h = sum(p.height for p, _ in parts) + sum(g for _, g in parts)
        img = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0))
        y = 40
        for p, gap in parts:
            img.alpha_composite(p, ((img.width - p.width) // 2, y))
            y += p.height + gap
        # A faint bloom around the letters, like light bleeding on film.
        glow = img.getchannel('A').filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.35))
        out = Image.new('RGBA', img.size, (255, 250, 240, 0))
        out.putalpha(glow)
        out.alpha_composite(img)
        return out

    def grade(self, pic, n):
        """The 2008 look on the picture area: drained colour, cold shadows, contrast, vignette, grain."""
        f = np.asarray(pic, np.float32) / 255
        lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
        f = lum[..., None] + (f - lum[..., None]) * 0.5
        f = f * np.array([0.93, 1.0, 0.97], np.float32) + np.array([0.0, 0.012, 0.018], np.float32) * (1 - lum[..., None]) ** 3
        f = (f - 0.42) * 1.16 + 0.42
        f *= (self.vig * self.flicker[n % len(self.flicker)])[..., None]
        f += (self.grain[self.order[n % len(self.order)]] * 0.024)[..., None]
        return np.clip(f * 255, 0, 255).astype(np.uint8)


def render_video(path, stills=None):
    look = Look()
    frames = range(int(END * FPS)) if not stills else sorted({int(round(t * FPS)) for t in stills})
    enc = None
    if not stills:
        enc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-tune', 'grain', path],
            stdin=subprocess.PIPE,
        )
    clips = {}
    for n in frames:
        t = n / FPS
        seg = next(s for s in EDIT if s['t0'] - 1e-6 <= t < s['t1'] - 1e-6)
        lt = t - seg['t0']
        canvas = np.zeros((H, W, 3), np.uint8)
        if 'clip' in seg:
            key = id(seg)
            if key not in clips or stills:
                for c in clips.values():
                    c.close()
                clips = {key: E.Clip(seg['clip'], seg['at'] + lt)}
            frame = clips[key].next()
            # The scare: a hard punch-in on it as the light finds it.
            if seg.get('punch') is not None:
                at, ax, ay = seg['punch']
                k = (seg['at'] + lt) - at
                if k > 0:
                    z = 1.0 + 0.2 * E.ease_out(k / 0.12)
                    frame = frame.resize((W, H), Image.BICUBIC, box=(ax - ax / z, ay - ay / z, ax + (W - ax) / z, ay + (H - ay) / z))
            top = BOX + seg.get('crop', 0)
            pic = frame.crop((0, top, W, top + PH))
            g = look.grade(pic, n)
            k = 1.0
            fi = seg.get('fade_in', 0)
            if fi and lt < fi:
                k = E.smooth(lt / fi)
            if k < 0.999:
                g = (g.astype(np.float32) * k).astype(np.uint8)
            if seg.get('flash') and lt < 3 / FPS:
                a = [0.75, 0.4, 0.15][int(lt * FPS)]
                g = (g.astype(np.float32) * (1 - a) + 255 * a).astype(np.uint8)
            canvas[BOX : BOX + PH] = g
        else:
            pic = Image.new('RGB', (W, PH))
            if seg['card']:
                c = look.cards[seg['card']]
                dur = seg['t1'] - seg['t0']
                a = min(E.ease_out(lt / 0.12), 1 - E.smooth((lt - (dur - 0.14)) / 0.14) if lt > dur - 0.14 else 1)
                E.paste_alpha(pic, c, W / 2, PH / 2, alpha=a, scale=1.0 + 0.045 * (lt / dur))
            canvas[BOX : BOX + PH] = look.grade(pic, n)
        img = Image.fromarray(canvas)
        if stills:
            img.save(os.path.join(OUT, f'spot_{t:05.2f}.jpg'), quality=90)
        else:
            enc.stdin.write(canvas.tobytes())
        if n % 150 == 0:
            print(f'  picture {t:5.1f} s', flush=True)
    for c in clips.values():
        c.close()
    if enc:
        enc.stdin.close()
        enc.wait()


# --- sound -------------------------------------------------------------------------------------


def render_audio(path):
    total = int(END * SR) + SR
    music = np.zeros((total, 2), np.float32)
    game = np.zeros((total, 2), np.float32)
    fx = np.zeros((total, 2), np.float32)
    sfx = E.Sfx()
    M = os.path.join(E.ROOT, 'assets', 'music')

    # Each shot's own sound (the crying, the screech, the horde, the roar, the blast, the heartbeat).
    for s in EDIT:
        if 'clip' in s:
            x = E.decode(os.path.join(E.SHOTS, f"{s['clip']}.wav"), s['at'], s['t1'] - s['t0'])
            E.place(game, x, s['t0'], gain=s.get('gain', 0.8), fade_in=max(0.01, s.get('fade_in', 0)), fade_out=0.02)

    # The Hunter's sting on its screech. The Night Terror's lands on the frame the light finds it:
    # the sting's hit is 0.27 s into its file (a breath before it), so it starts that much early,
    # with a shriek that's loud at once and a low hit under it.
    E.place(music, E.decode(os.path.join(M, 'sting_hunter.mp3')), 4.95, gain=0.8, fade_out=0.5)
    reveal = 27.3 + (2.633 - 0.85)
    E.place(music, E.decode(os.path.join(M, 'sting_terror.mp3'), 0, 1.6), reveal - 0.27, gain=1.0, fade_out=0.9)
    E.place(fx, sfx.get('terror.shriek', 0), reveal, gain=0.8, fade_out=0.3)
    E.place(fx, E.sub_boom(), reveal, gain=0.55, fade_out=0.4)

    # The escape cue: in under the second card (its breath), drops on the horde, dead stop on the bar.
    start = CARD2
    x = E.decode(os.path.join(M, 'finale_escape.mp3'), start + CUE_OFFSET, B[11] - start)
    duck = [(0.0, -3), (B[0] - start - 0.05, -3), (B[0] - start, 0)]
    for c0, c1 in ((B[6], B[7]), (B[8], B[9])):  # under the "starring" cards
        duck += [(c0 - start - 0.03, 0), (c0 - start + 0.02, -9), (c1 - start - 0.06, -9), (c1 - start, 0)]
    duck += [(B[11] - start, 0)]
    x = x * E.automation(len(x), duck)[:, None]
    E.place(music, x, start, gain=0.95, fade_in=0.05, fade_out=0.03)

    # Under the cold open and the tagline: the night.
    night = sfx.loop('amb.night', 4.0)
    E.place(fx, night, 0.0, gain=0.35, fade_in=0.6, fade_out=0.4)
    E.place(fx, night[: int(3.0 * SR)], B[11] + 0.1, gain=0.3, fade_in=0.6, fade_out=0.3)

    # A boom on every card, a bigger one on the dead stop.
    boom = E.sub_boom()
    thunder = sfx.get('thunder')
    for at, g in ((3.3, 0.8), (CARD2, 0.9), (B[6], 1.0), (B[8], 1.0), (B[11], 1.25), (B[11] + 0.3, 0.5)):
        E.place(fx, boom, at, gain=0.75 * g, fade_out=0.4)
        E.place(fx, thunder[: int(2.6 * SR)], at, gain=0.42 * g, fade_out=1.0)
    E.place(fx, sfx.get('explosion', 1), B[11], gain=0.35, fade_out=0.8)

    game_db = [(0.0, 0), (B[0] - 0.01, 0), (B[0], 1), (B[11], 1), (27.3, 2), (END, 2)]
    game *= E.automation(len(game), game_db)[:, None]
    mix = music * 0.9 + game * 0.8 + fx * 0.8
    raw = os.path.join(OUT, 'spot30_raw.wav')
    E.write_wav(raw, mix[: int(END * SR)] * 0.5)
    import re

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


def main():
    args = sys.argv[1:]
    if '--frames' in args:
        render_video(None, stills=[float(x) for x in args[args.index('--frames') + 1].split(',')])
        print('stills in', OUT)
        return
    video = os.path.join(OUT, 'spot30_video.mp4')
    audio = os.path.join(OUT, 'spot30_mix.wav')
    if '--sound-only' not in args or not os.path.exists(video):
        print('picture...')
        render_video(video)
    print('sound...')
    render_audio(audio)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', FINAL], check=True)
    print(FINAL)


if __name__ == '__main__':
    main()
