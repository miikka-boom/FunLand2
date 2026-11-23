#!/usr/bin/env python3
"""A 20-second spot for We Left Ben in 2-player co-op: the 30-second spot's idea (a zombie movie
starring you and your best friend, sold the way Left 4 Dead was in 2008), cut down and made clear.

    node tools/trailer/capture.cjs            # films out/shots/ (this uses the *_clear takes)
    python3 tools/trailer/spot20.py           # -> out/we-left-ben-coop-spot20.mp4
    python3 tools/trailer/spot20.py --frames 1.5,5.0   # full-size stills of the cut

What changed from the 30-second spot, for clarity:
- The moments are filmed again (shots.js: clear()): lighter nights, the camera closer, bigger
  name tags. The 30-second spot sat at a median brightness of about 15/255; this one is graded up.
- Full frame, no letterbox and no film grain; a gentle vignette and a cool tint keep the mood.
- Fewer, longer shots, each one co-op beat you can read at a glance: the horde, Sam pulling a
  Hunter off you, you picking Sam up, the Tank, the gas station, both of you making the ferry.
- The names on the cards are in the colours of the tags over the survivors' heads: YOU is blue,
  your best friend (Sam) is green.
- No logo and no title, as before: it ends on the tagline and one last scare.

The cuts sit on the bars of the game's Pier 9 escape cue (170 bpm), from its drop at 0:00 to a
dead stop before the tagline.
"""

import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edit as E  # noqa: E402

W, H, FPS, SR = E.W, E.H, E.FPS, E.SR
OUT = E.OUT
FINAL = os.path.join(OUT, 'we-left-ben-coop-spot20.mp4')
F_SERIF = os.path.join(E.FONTS, 'Cinzel-Bold.ttf')
END = 20.0

# The escape cue (finale_escape.mp3, 170 bpm) from its drop, 10.382 s in, at 0:00: a bar every 1.412 s.
CUE_AT = 10.382
BAR = 60 / 170 * 4
B = [round(k * BAR * FPS) / FPS for k in range(15)]  # 0, 1.4, 2.83, 4.23, 5.63, 7.07, 8.47, 9.87, 11.3, 12.7, 14.1, 15.53...
TAG = (17.9, 19.75)  # the tagline card, then the scare

# --- the cut -----------------------------------------------------------------------------------

EDIT = [
    # The drop: a wall of infected coming down the street at the two of you.
    dict(t0=B[0], t1=B[2], clip='horde_big_clear', at=0.45, gain=0.85),
    dict(t0=B[2], t1=B[3], card='starring'),
    # A Hunter pins you; Sam sprints back and shoves it off.
    dict(t0=B[3], t1=B[5], clip='hunter_save_clear', at=2.6, gain=0.9),
    dict(t0=B[5], t1=B[6], card='friend'),
    # Sam goes down; you pick Sam up.
    dict(t0=B[6], t1=B[7], clip='revive_clear', at=3.0, gain=0.85),
    dict(t0=B[7], t1=B[8], clip='tank_clear', at=4.25, gain=0.85),
    dict(t0=B[8], t1=B[9], clip='gas_station_clear', at=2.35, gain=1.0, flash=True),
    # The ferry: ALL ABOARD!, and both of you make it up the gangway.
    dict(t0=B[9], t1=B[11], clip='ferry_clear', at=5.95, gain=0.85),
    # The cue stops dead on the bar; the tagline in the quiet.
    dict(t0=B[11], t1=15.8, card=None),
    dict(t0=15.8, t1=TAG[0], card='tagline'),
    # Walking the rows in the dark, a heartbeat, you turn round...
    dict(t0=TAG[0], t1=TAG[1], clip='terror_scare_clear', at=1.05, gain=1.0, punch=(2.633, 659, 749)),
    dict(t0=TAG[1], t1=END, card=None),
]
REVEAL = TAG[0] + (2.633 - 1.05)

WHITE = (240, 240, 234)
BLUE = (110, 220, 255)  # the YOU tag
GREEN = (140, 255, 160)  # the SAM tag

# Title cards: (small line above, big line, colour of the big line, small line below).
CARDS = {
    'starring': ('STARRING', 'YOU', BLUE, None),
    'friend': ('AND', 'YOUR BEST FRIEND', GREEN, None),
    'tagline': (None, 'NOBODY GETS LEFT BEHIND.', WHITE, '2-PLAYER CO-OP'),
}

# --- the look ------------------------------------------------------------------------------------


class Look:
    def __init__(self):
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
        self.vig = (1 - 0.22 * np.clip(r, 0, 1) ** 2.4).astype(np.float32)
        self.cards = {k: self.card(*v) for k, v in CARDS.items()}

    def card(self, small, big, color, under):
        big_f = ImageFont.truetype(F_SERIF, 150 if len(big) < 6 else 112 if len(big) < 20 else 96)
        sm_f = ImageFont.truetype(F_SERIF, 50)
        un_f = ImageFont.truetype(F_SERIF, 46)
        parts = []
        if small:
            parts.append((E.text_image(small, sm_f, (215, 215, 210), tracking=16, shadow=0), 22))
        parts.append((E.text_image(big, big_f, color, tracking=6, shadow=0), 0))
        if under:
            parts.append((E.text_image(under, un_f, (190, 192, 188), tracking=18, shadow=0), 30))
        w = max(p.width for p, _ in parts)
        h = sum(p.height for p, _ in parts) + sum(g for _, g in parts)
        img = Image.new('RGBA', (w + 80, h + 80), (0, 0, 0, 0))
        yy = 40
        for p, gap in parts:
            img.alpha_composite(p, ((img.width - p.width) // 2, yy))
            yy += p.height + gap
        glow = img.getchannel('A').filter(ImageFilter.GaussianBlur(16)).point(lambda v: int(v * 0.3))
        out = Image.new('RGBA', img.size, (255, 250, 240, 0))
        out.putalpha(glow)
        out.alpha_composite(img)
        return out

    def grade(self, pic):
        """Readable night: midtones lifted, colour kept, a touch cool, a light vignette."""
        f = np.asarray(pic, np.float32) / 255
        f = f ** 0.8
        lum = f @ np.array([0.299, 0.587, 0.114], np.float32)
        f = lum[..., None] + (f - lum[..., None]) * 0.88
        f = f * np.array([0.97, 1.0, 1.02], np.float32)
        f = (f - 0.45) * 1.05 + 0.45
        f *= self.vig[..., None]
        return np.clip(f * 255, 0, 255).astype(np.uint8)


def render_video(path, stills=None):
    look = Look()
    frames = range(int(END * FPS)) if not stills else sorted({int(round(t * FPS)) for t in stills})
    enc = None
    if not stills:
        enc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
             '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-tune', 'animation', path],
            stdin=subprocess.PIPE,
        )
    clips = {}
    for n in frames:
        t = n / FPS
        seg = next(s for s in EDIT if s['t0'] - 1e-6 <= t < s['t1'] - 1e-6)
        lt = t - seg['t0']
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
            g = look.grade(frame)
            if seg.get('flash') and lt < 3 / FPS:
                a = [0.7, 0.35, 0.12][int(lt * FPS)]
                g = (g.astype(np.float32) * (1 - a) + 255 * a).astype(np.uint8)
        else:
            pic = Image.new('RGB', (W, H))
            if seg['card']:
                c = look.cards[seg['card']]
                dur = seg['t1'] - seg['t0']
                a = min(E.ease_out(lt / 0.1), 1 - E.smooth((lt - (dur - 0.12)) / 0.12) if lt > dur - 0.12 else 1)
                E.paste_alpha(pic, c, W / 2, H / 2, alpha=a, scale=1.0 + 0.04 * (lt / dur))
            g = np.asarray(pic, np.uint8)
        if stills:
            Image.fromarray(g).save(os.path.join(OUT, f'spot20_{t:05.2f}.jpg'), quality=90)
        else:
            enc.stdin.write(np.ascontiguousarray(g).tobytes())
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

    # Each shot's own sound: the horde, the screech and the shove, the revive, the roar, the blast,
    # the ferry's horn, the heartbeat.
    for s in EDIT:
        if 'clip' in s:
            x = E.decode(os.path.join(E.SHOTS, f"{s['clip']}.wav"), s['at'], s['t1'] - s['t0'])
            E.place(game, x, s['t0'], gain=s.get('gain', 0.8), fade_in=0.01, fade_out=0.02)

    # The escape cue from its drop, ducked under the two name cards, dead stop on the bar.
    x = E.decode(os.path.join(M, 'finale_escape.mp3'), CUE_AT, B[11])
    duck = [(0.0, 0)]
    for c0, c1 in ((B[2], B[3]), (B[5], B[6])):
        duck += [(c0 - 0.03, 0), (c0 + 0.02, -9), (c1 - 0.06, -9), (c1, 0)]
    duck += [(B[11], 0)]
    x = x * E.automation(len(x), duck)[:, None]
    E.place(music, x, 0.0, gain=0.95, fade_in=0.005, fade_out=0.03)

    # The Night Terror's sting lands on the frame the light finds it (its hit is 0.27 s in),
    # with a shriek that's loud at once and a low hit under it.
    E.place(music, E.decode(os.path.join(M, 'sting_terror.mp3'), 0, 1.6), REVEAL - 0.27, gain=1.0, fade_out=0.8)
    E.place(fx, sfx.get('terror.shriek', 0), REVEAL, gain=0.8, fade_out=0.3)

    # Under the tagline: the night.
    night = sfx.loop('amb.night', 3.0)
    E.place(fx, night, B[11] + 0.1, gain=0.3, fade_in=0.5, fade_out=0.3)

    # Hits: the drop, a boom on each name card, a bigger one on the dead stop, the scare.
    boom = E.sub_boom()
    thunder = sfx.get('thunder')
    for at, g in ((0.0, 0.7), (B[2], 1.0), (B[5], 1.0), (B[11], 1.25), (15.8, 0.5)):
        E.place(fx, boom, at, gain=0.75 * g, fade_out=0.4)
        E.place(fx, thunder[: int(2.4 * SR)], at, gain=0.42 * g, fade_out=1.0)
    E.place(fx, sfx.get('explosion', 1), B[11], gain=0.35, fade_out=0.8)
    E.place(fx, boom, REVEAL, gain=0.55, fade_out=0.4)

    game *= E.automation(len(game), [(0.0, 1), (B[11], 1), (TAG[0], 2), (END, 2)])[:, None]
    mix = music * 0.9 + game * 0.8 + fx * 0.8
    raw = os.path.join(OUT, 'spot20_raw.wav')
    E.write_wav(raw, mix[: int(END * SR)] * 0.5)

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
    video = os.path.join(OUT, 'spot20_video.mp4')
    audio = os.path.join(OUT, 'spot20_mix.wav')
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
