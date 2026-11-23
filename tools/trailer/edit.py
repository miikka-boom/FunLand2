"""Cut the We Left Ben trailer: footage from shots.mjs, cut to the soundtrack's bars.

    python3 tools/trailer/edit.py [--cut full|30] [--shots trailer-shots] [--music tools/trailer/soundtrack.mp3]
                                  [--out trailer.mp4] [--from S --to S] [--stills DIR]
    npm run trailer:edit    the full trailer (1:46)
    npm run trailer:spot    the 30-second spot (--cut 30): the same music, cut down on its downbeats

Every frame is composed here: the shot's frame (with a slow push-in and shake), the grade, flashes,
a little RGB split on the big hits, the letterbox, the titles and the logo. The sound is the music
plus a few of the game's own recorded effects (assets/sfx), placed on the hits. The edit decision
list below is written against the soundtrack picked for the trailer: ElevenLabs Music Advanced v2.5,
seed 1103, 139.75 bpm, its bars landing on 18.52 + k * 1.7175 s.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FPS = 30
W, H = 1920, 1080
BARS = 104  # letterbox: about 2.2:1
SR = 48000
FONT_BLACK = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf"
FONT_BOLD = "/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf"
FONT_MED = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

# --- The music's grid -------------------------------------------------------------------------
BEAT = 60 / 139.75
DROP = 39.09  # the drop
BREAK = 66.53  # the breakdown
UP = 69.94  # back up
CLIMAX = 73.38
END = 100.82  # the last hit
LENGTH = 106.0

# --- The full trailer -------------------------------------------------------------------------
# (start, end, shot or None for black, in-point in the shot's film seconds, rate, options)
CLIPS = [
    (0.00, 0.21, None, 0, 1, {}),
    (0.21, 3.91, "establish_city", 0.3, 1, {}),
    (3.91, 7.57, "saferoom", 0.4, 1, {}),
    (7.57, 11.25, "ben_drawing", 0.4, 1, {}),
    (11.25, 14.70, "step_out", 0.3, 1, {}),
    (14.70, 18.06, None, 0, 1, {}),
    # Build: here they come
    (18.06, 21.94, "horde_reveal", 0.18, 1, {}),
    (21.94, 23.66, "run_streets", 2.4, 1, {}),
    (23.66, 25.38, "run_graveyard", 1.2, 1, {}),
    (25.38, 27.09, "run_suburbia", 2.2, 1, {"dim": 0.5}),
    (27.09, 28.80, "building_horde", 3.0, 1, {}),
    (28.80, 30.52, "run_junkyard", 1.0, 1, {"dim": 0.5}),
    (30.52, 32.24, "run_streets", 5.6, 1, {}),
    (32.24, 33.95, "alarm_car", 0.70, 1, {}),
    (33.95, 35.67, "run_streets", 3.8, 1, {"dim": 0.5}),
    (35.67, 38.66, "tank_reveal", 0.0, 1, {"push": 0.08}),
    (38.66, DROP, None, 0, 1, {}),
    # Drop: two against everything
    (39.09, 40.81, "gas_station", 2.08, 1, {}),
    (40.81, 42.53, "tank_fight", 0.4, 1, {}),
    (42.53, 44.23, "orbit", 0.2, 1, {}),
    (44.23, 45.95, "witch", 1.85, 1, {}),
    (45.95, 47.66, "horde_reveal", 3.4, 1, {"dim": 0.55}),
    (47.66, 49.38, "overhead", 2.0, 1, {"dim": 0.6}),
    (49.38, 51.08, "run_graveyard", 4.8, 1, {}),
    (51.08, 52.80, "tank_fight", 3.7, 1, {}),
    (52.80, 54.52, "run_junkyard", 4.5, 1, {}),
    (54.52, 55.38, "alarm_car", 5.0, 1, {}),
    (55.38, 56.24, "building_horde", 6.0, 1, {}),
    (56.24, 57.95, "orbit", 2.6, 1, {}),
    (57.95, 59.66, "run_suburbia", 5.2, 1, {}),
    (59.66, 61.38, "horde_reveal", 5.2, 1, {}),
    (61.38, 63.10, "tank_fight", 6.8, 1, {}),
    (63.10, 64.81, "run_streets", 7.2, 1, {}),
    (64.81, 66.53, "orbit", 5.6, 1, {}),
    # Breakdown: not again
    (66.53, 69.94, "ally_down", 1.30, 1.525, {"push": 0.06}),
    (69.94, 72.09, "ally_down", 6.50, 1, {}),
    (72.09, 73.38, "pier_flare", 0.0, 1, {}),
    # Climax: Pier 9
    (73.38, 76.81, "pier_flare", 1.25, 1, {}),
    (76.81, 78.53, "pier_hold", 1.2, 1, {}),
    (78.53, 80.24, "pier_hold", 3.1, 1, {}),
    (80.24, 81.95, "pier_hold", 6.2, 1, {"dim": 0.5}),
    (81.95, 83.66, "orbit", 1.0, 1, {}),
    (83.66, 85.38, "pier_ferry_wide", 0.5, 1, {}),
    (85.38, 86.24, "tank_fight", 8.3, 1, {}),
    (86.24, 87.10, "witch", 3.3, 1, {}),
    (87.10, 88.82, "pier_hold", 9.0, 1, {}),
    (88.82, 89.67, "overhead", 4.6, 1, {}),
    (89.67, 90.52, "gas_station", 4.2, 1, {}),
    (90.52, 92.24, "pier_hold", 12.0, 1, {}),
    (92.24, 93.95, "pier_ferry_wide", 4.5, 1, {"dim": 0.5}),
    (93.95, 95.67, "pier_aboard", 1.60, 1, {}),
    (95.67, 97.38, "pier_aboard", 3.32, 1, {}),
    (97.38, 97.38 + BEAT, "run_graveyard", 7.6, 1, {}),
    (97.38 + BEAT, 97.38 + 2 * BEAT, "alarm_car", 7.2, 1, {}),
    (97.38 + 2 * BEAT, 97.38 + 3 * BEAT, "orbit", 8.4, 1, {}),
    (97.38 + 3 * BEAT, 99.10, "pier_hold", 14.2, 1, {}),
    (99.10, END, "pier_ferry_wide", 8.6, 1, {"push": 0.06}),
    (END, LENGTH, None, 0, 1, {}),
]

# (start, end, text, style, y as a fraction of the height)
TITLES = [
    (0.40, 3.70, "PHILADELPHIA, 2020.", "card", 0.5),
    (7.80, 11.05, "WE LEFT HIM BEHIND.", "card", 0.78),
    (11.45, 14.50, "TWO OF US MADE IT OUT.", "card", 0.78),
    (14.95, 17.60, "THE LAST FERRY LEAVES FROM PIER 9.", "card", 0.5),
    (25.45, 27.05, "THEY DON'T SLEEP.", "slam", 0.5),
    (28.87, 30.48, "THEY DON'T STOP.", "slam", 0.5),
    (34.02, 35.62, "NEITHER DO WE.", "slamred", 0.5),
    (46.00, 47.62, "TWO AGAINST", "slam", 0.5),
    (47.70, 49.34, "EVERYTHING.", "slamred", 0.5),
    (67.30, 69.80, "NOT AGAIN.", "slamred", 0.74),
    (80.30, 81.90, "HOLD THE LINE.", "slam", 0.5),
    (92.30, 93.90, "NOBODY GETS LEFT BEHIND.", "slam", 0.5),
    (101.70, 104.25, "HE KEEPS LEAVING SIGNS.", "tag", 0.80),
    (104.55, 105.95, "ben was here", "crayon", 0.5),
]
LOGO = (END, 104.25)

# Flashes: (time, strength, decay s, colour)
FLASHES = [
    (18.06, 0.85, 0.30, (255, 255, 255)),
    (DROP, 1.0, 0.45, (255, 255, 255)),
    (UP, 0.7, 0.35, (255, 255, 255)),
    (CLIMAX, 1.0, 0.55, (255, 120, 90)),
    (END, 0.9, 0.22, (255, 255, 255)),
] + [(c[0], 0.22, 0.12, (255, 255, 255)) for c in CLIPS if DROP < c[0] < BREAK or CLIMAX < c[0] < END]

# Shake: (time, amplitude in px, decay s)
SHAKES = [(18.06, 22, 0.5), (DROP, 34, 0.7), (41.31, 14, 0.3), (44.38, 18, 0.4), (51.41, 14, 0.3), (61.71, 14, 0.3),
          (UP, 16, 0.4), (CLIMAX, 30, 0.7), (END, 20, 0.6)]
# RGB split: (time, px, decay s)
SPLITS = [(18.06, 10, 0.25), (DROP, 16, 0.35), (47.66, 8, 0.25), (UP, 8, 0.25), (CLIMAX, 14, 0.35), (END, 10, 0.3)]

# Sound: (time, sound id, gain dB, rate, variant)
SFX = [
    (17.98, "z.scream", -7, 1.0, 0),
    (18.20, "z.scream", -9, 0.92, 2),
    (18.06, "rumble", -4, 1.0, 0),
    (35.70, "tank.roar", -3, 0.78, 0),
    (DROP, "explosion", -2, 1.0, 1),
    (DROP + 0.35, "debris", -8, 1.0, 0),
    (41.31, "body.punch", -6, 1.0, 1),
    (44.38, "witch.scream", -4, 1.0, 0),
    (51.41, "body.punch", -6, 1.0, 2),
    (61.71, "body.punch", -6, 1.0, 0),
    (66.66, "body.fall", -5, 1.0, 1),
    (CLIMAX, "flare.sparks", -4, 1.0, 0),
    (CLIMAX, "fire.whoomp", -4, 1.0, 0),
    (81.95, "shotgun.shot", -8, 1.0, 0),
    (85.38, "shotgun.shot", -8, 1.0, 1),
    (89.67, "explosion.small", -6, 1.0, 0),
    (END, "thunder", -3, 1.0, 0),
]


FULL = {"clips": CLIPS, "titles": TITLES, "logo": LOGO, "flashes": FLASHES, "shakes": SHAKES, "splits": SPLITS,
        "sfx": SFX, "length": LENGTH, "music": [(0.0, 0.0, LENGTH)]}

# --- The 30-second spot ------------------------------------------------------------------------
# The music, cut down on its downbeats: (where it starts in the spot, from, to in the soundtrack).
# The build's first boom, the bar before the drop and six bars of the drop, the climax's first
# four bars, and its last two bars with the final hit and the ring-out.
S30_MUSIC = [(0.0, 17.92, 21.943), (4.023, 37.384, 49.377), (16.016, 73.375, 80.237), (22.878, 97.384, 104.506)]
D30 = 5.730  # the drop
C30 = 16.016  # the climax
E30 = 26.315  # the last hit
B30 = 0.14  # the first boom
S30_CLIPS = [
    (0.00, B30, None, 0, 1, {}),
    (B30, 2.316, "horde_reveal", 0.18, 1, {}),
    (2.316, 4.023, "run_graveyard", 1.2, 1, {}),
    (4.023, 5.30, "tank_reveal", 0.5, 1, {"push": 0.06}),
    (5.30, D30, None, 0, 1, {}),
    (D30, 7.449, "gas_station", 2.08, 1, {}),
    (7.449, 9.169, "tank_fight", 0.4, 1, {}),
    (9.169, 10.869, "orbit", 0.2, 1, {}),
    (10.869, 12.589, "witch", 1.85, 1, {}),
    (12.589, 14.299, "horde_reveal", 3.4, 1, {"dim": 0.55}),
    (14.299, C30, "overhead", 2.0, 1, {"dim": 0.6}),
    (C30, 17.731, "pier_flare", 1.36, 1, {}),
    (17.731, 19.451, "pier_hold", 3.1, 1, {}),
    (19.451, 21.171, "pier_ferry_wide", 4.5, 1, {"dim": 0.5}),
    (21.171, 22.878, "pier_aboard", 1.60, 1, {}),
    (22.878, 22.878 + BEAT, "run_graveyard", 7.6, 1, {}),
    (22.878 + BEAT, 22.878 + 2 * BEAT, "alarm_car", 7.2, 1, {}),
    (22.878 + 2 * BEAT, 22.878 + 3 * BEAT, "orbit", 8.4, 1, {}),
    (22.878 + 3 * BEAT, 24.597, "pier_hold", 14.2, 1, {}),
    (24.597, E30, "pier_aboard", 2.75, 1, {"push": 0.05}),
    (E30, 30.0, None, 0, 1, {}),
]
SPOT30 = {
    "clips": S30_CLIPS,
    "titles": [
        (12.64, 14.26, "TWO AGAINST", "slam", 0.5),
        (14.34, 15.98, "EVERYTHING.", "slamred", 0.5),
        (19.50, 21.13, "NOBODY GETS LEFT BEHIND.", "slam", 0.5),
        (27.05, 29.70, "HE KEEPS LEAVING SIGNS.", "tag", 0.80),
    ],
    "logo": (E30, 29.70),
    "flashes": [
        (B30, 0.85, 0.30, (255, 255, 255)),
        (D30, 1.0, 0.45, (255, 255, 255)),
        (C30, 1.0, 0.55, (255, 120, 90)),
        (E30, 0.9, 0.22, (255, 255, 255)),
    ] + [(c[0], 0.22, 0.12, (255, 255, 255)) for c in S30_CLIPS if D30 < c[0] < C30 or C30 < c[0] < E30],
    "shakes": [(B30, 22, 0.5), (D30, 34, 0.7), (7.95, 14, 0.3), (11.02, 18, 0.4), (C30, 30, 0.7), (E30, 20, 0.6)],
    "splits": [(B30, 10, 0.25), (D30, 16, 0.35), (14.299, 8, 0.25), (C30, 14, 0.35), (E30, 10, 0.3)],
    "sfx": [
        (0.06, "z.scream", -7, 1.0, 0),
        (0.28, "z.scream", -9, 0.92, 2),
        (B30, "rumble", -4, 1.0, 0),
        (4.05, "tank.roar", -3, 0.78, 0),
        (D30, "explosion", -2, 1.0, 1),
        (D30 + 0.35, "debris", -8, 1.0, 0),
        (7.95, "body.punch", -6, 1.0, 1),
        (11.02, "witch.scream", -4, 1.0, 0),
        (C30, "flare.sparks", -4, 1.0, 0),
        (C30, "fire.whoomp", -4, 1.0, 0),
        (22.878, "shotgun.shot", -8, 1.0, 0),
        (E30, "thunder", -3, 1.0, 0),
    ],
    "length": 30.0,
    "music": S30_MUSIC,
}
CUTS = {"full": FULL, "30": SPOT30}
CUT = FULL


def use_cut(name):
    global CUT
    CUT = CUTS[name]
    return CUT


# --- Sources ----------------------------------------------------------------------------------
def clip_at(t):
    for c in CUT["clips"]:
        if c[0] <= t < c[1]:
            return c
    return CUT["clips"][-1]


@lru_cache(maxsize=None)
def shot_len(shots, name):
    return len([f for f in os.listdir(os.path.join(shots, name)) if f.endswith(".jpg")])


def source_frame(shots, clip, t):
    start, end, name, tin, rate, opt = clip
    if name is None:
        return None
    n = shot_len(shots, name)
    i = int(round((tin + (t - start) * rate) * FPS))
    i = max(0, min(n - 1, i))
    return Image.open(os.path.join(shots, name, f"{i:05d}.jpg")).convert("RGB")


# --- Look -------------------------------------------------------------------------------------
def make_lut():
    x = np.linspace(0, 1, 256)
    y = x ** 0.86  # lift the night a little
    s = y * y * (3 - 2 * y)
    y = y + (s - y) * 0.45  # contrast
    r = np.clip(y + 0.035 * y * y - 0.015 * (1 - y) ** 2, 0, 1)
    g = np.clip(y + 0.004 * (1 - y) ** 2, 0, 1)
    b = np.clip(y - 0.03 * y * y + 0.03 * (1 - y) ** 2, 0, 1)
    return [np.round(c * 255).astype(np.uint8) for c in (r, g, b)]


LUT = None
VIGNETTE = None
GRAIN = None
GRAIN_AMT = float(os.environ.get("TRAILER_GRAIN", "0"))  # film grain is pretty, and triples the file size


def init_worker(cut="full"):
    global LUT, VIGNETTE, GRAIN
    use_cut(cut)
    LUT = make_lut()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
    VIGNETTE = (1 - 0.28 * np.clip(d - 0.15, 0, None) ** 1.2)[..., None].astype(np.float32)
    rng = np.random.default_rng(7)
    GRAIN = [rng.normal(0, 1.0, (H // 2, W // 2)).astype(np.float32) for _ in range(6)]


def envelope(t, t0, decay):
    if t < t0 - 1 / FPS or t > t0 + decay * 6:
        return 0.0
    if t < t0:
        return 0.5
    return math.exp(-(t - t0) / decay)


def shake_offset(t):
    x = y = 0.0
    for t0, amp, decay in CUT["shakes"]:
        e = envelope(t, t0, decay)
        if e > 0.01:
            k = (t - t0) * 40
            x += amp * e * (math.sin(k * 1.7) + 0.5 * math.sin(k * 3.1))
            y += amp * e * (math.cos(k * 1.3) + 0.5 * math.sin(k * 2.3))
    return x, y


# --- Titles -----------------------------------------------------------------------------------
STYLES = {
    "card": {"font": FONT_BOLD, "size": 64, "track": 0.16, "color": (238, 236, 230), "glow": (255, 255, 255), "glowA": 0.25},
    "slam": {"font": FONT_BLACK, "size": 132, "track": 0.04, "color": (245, 243, 238), "glow": (255, 255, 255), "glowA": 0.35},
    "slamred": {"font": FONT_BLACK, "size": 140, "track": 0.04, "color": (255, 58, 40), "glow": (255, 40, 20), "glowA": 0.6},
    "tag": {"font": FONT_BOLD, "size": 44, "track": 0.3, "color": (236, 232, 224), "glow": (255, 200, 150), "glowA": 0.25},
    "crayon": {"font": FONT_MED, "size": 58, "track": 0.02, "color": (240, 128, 32), "glow": (255, 130, 30), "glowA": 0.55},
}


@lru_cache(maxsize=None)
def title_image(text, style):
    st = dict(STYLES[style])
    font = ImageFont.truetype(st["font"], st["size"])
    track = st["size"] * st["track"]
    adv = [font.getlength(ch) for ch in text]
    total = sum(adv) + track * (len(text) - 1)
    if total > W * 0.86:  # too wide for the frame: set it smaller
        st["size"] = int(st["size"] * W * 0.86 / total)
        font = ImageFont.truetype(st["font"], st["size"])
        track = st["size"] * st["track"]
        adv = [font.getlength(ch) for ch in text]
        total = sum(adv) + track * (len(text) - 1)
    pad = int(st["size"] * 0.6)
    asc, desc = font.getmetrics()
    w = int(total + pad * 2)
    h = int(asc + desc + pad * 2)
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    x = pad
    for ch, a in zip(text, adv):
        d.text((x, pad), ch, font=font, fill=255)
        x += a + track
    glow = mask.filter(ImageFilter.GaussianBlur(st["size"] * 0.22))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g = Image.new("RGBA", (w, h), st["glow"] + (0,))
    g.putalpha(glow.point(lambda v: int(v * st["glowA"])))
    out = Image.alpha_composite(out, g)
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.6)))
    out = Image.alpha_composite(out, shadow)
    fill = Image.new("RGBA", (w, h), st["color"] + (0,))
    fill.putalpha(mask)
    out = Image.alpha_composite(out, fill)
    if style == "crayon":
        out = out.rotate(-3, resample=Image.BICUBIC, expand=True)
    return out


@lru_cache(maxsize=None)
def logo_image():
    im = Image.open(os.path.join(ROOT, "assets", "we-left-ben.webp")).convert("RGBA")
    k = 820 / im.width
    return im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)


def paste_center(frame, img, cx, cy, scale, alpha):
    if alpha <= 0.003:
        return
    if abs(scale - 1) > 1e-3:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.BILINEAR)
    if alpha < 0.999:
        a = img.getchannel("A").point(lambda v: int(v * alpha))
        img = img.copy()
        img.putalpha(a)
    frame.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def draw_titles(frame, t):
    for t0, t1, text, style, yf in CUT["titles"]:
        if not (t0 - 0.05 <= t <= t1 + 0.05):
            continue
        img = title_image(text, style)
        u = t - t0
        left = t1 - t
        if style in ("slam", "slamred"):
            a = min(1, u / 0.06) * min(1, left / 0.12)
            s = 1 + 0.35 * math.exp(-u / 0.07) + 0.03 * u  # slams in, then creeps
        elif style == "crayon":
            a = min(1, u / 0.5) * min(1, left / 0.6)
            s = 1 + 0.01 * u
        else:
            a = min(1, u / 0.35) * min(1, left / 0.4)
            s = 1.04 - 0.04 * (1 - math.exp(-u / 0.6)) + 0.012 * u
        paste_center(frame, img, W / 2, H * yf, s, max(0, a))
    logo = CUT["logo"]
    if logo[0] <= t <= logo[1]:
        u = t - logo[0]
        a = min(1, u / 0.08) * min(1, (logo[1] - t) / 0.45)
        s = 1 + 0.1 * math.exp(-u / 0.1) + 0.012 * u  # lands with the hit, then creeps
        paste_center(frame, logo_image(), W / 2, H * 0.46, s, max(0, a))


# --- One frame --------------------------------------------------------------------------------
def render(args):
    shots, k = args
    t = k / FPS
    clip = clip_at(t)
    src = source_frame(shots, clip, t)
    opt = clip[5]
    if src is None:
        arr = np.zeros((H, W, 3), np.float32)
    else:
        # Slow push-in over the clip, plus shake.
        span = max(1e-3, clip[1] - clip[0])
        z = 1.03 + opt.get("push", 0.025) * (t - clip[0]) / span
        sx, sy = shake_offset(t)
        cw, ch = W / z, H / z
        x0 = (W - cw) / 2 - sx / z
        y0 = (H - ch) / 2 - sy / z
        x0 = min(max(0, x0), W - cw)
        y0 = min(max(0, y0), H - ch)
        src = src.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)
        a = np.asarray(src)
        a = np.stack([LUT[0][a[..., 0]], LUT[1][a[..., 1]], LUT[2][a[..., 2]]], axis=-1).astype(np.float32)
        gray = a.mean(axis=-1, keepdims=True)
        arr = gray + (a - gray) * 1.12
        arr *= VIGNETTE
        if "dim" in opt:
            arr *= opt["dim"]
        if GRAIN_AMT > 0:
            g = GRAIN[k % len(GRAIN)] * GRAIN_AMT
            arr += np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)[..., None]
    for t0, strength, decay, col in CUT["flashes"]:
        e = envelope(t, t0, decay) * strength
        if e > 0.01:
            arr = arr * (1 - 0.35 * e) + np.array(col, np.float32) * e * 0.65
    for t0, px, decay in CUT["splits"]:
        e = envelope(t, t0, decay)
        s = int(round(px * e))
        if s > 0:
            arr[..., 0] = np.roll(arr[..., 0], s, axis=1)
            arr[..., 2] = np.roll(arr[..., 2], -s, axis=1)
    arr[:BARS] = 0
    arr[H - BARS:] = 0
    frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    draw_titles(frame, t)
    return np.asarray(frame.convert("RGB")).tobytes()


# --- Sound ------------------------------------------------------------------------------------
def decode(path, sr=SR, ch=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def load_bank():
    txt = open(os.path.join(ROOT, "assets", "sfx", "bank.js")).read()
    sprites = json.loads(re.search(r"export const SPRITES = (\{.*?\n\});", txt, re.S).group(1))
    sounds = json.loads(re.search(r"export const SOUNDS = (\{.*?\});", txt, re.S).group(1))
    return sprites, sounds


def sound(sprites, sounds, cache, sid, variant):
    s = sounds[sid]
    key = s["s"]
    if key not in cache:
        sp = sprites[key]
        data = decode(os.path.join(ROOT, "assets", "sfx", sp["file"]))
        # The sync blip: where the decoder put it, against where the bank says it peaks.
        head = np.abs(data[: SR // 4]).max(axis=1)
        shift = int(np.argmax(head)) / SR - sp["marker"]
        cache[key] = (data, shift)
    data, shift = cache[key]
    start, dur = s["v"][variant % len(s["v"])]
    i0 = int((start + shift) * SR)
    return data[i0:i0 + int(dur * SR)]


def music_bed(music, segments, length, lead=0.010, xf=0.010):
    """The soundtrack laid out by segments (start in the cut, from, to). At each join the next
    segment starts `lead` early and fades in over `xf` while the last one fades out, so the join's
    downbeat itself lands whole."""
    n = int(round(length * SR))
    out = np.zeros((n, 2), np.float32)
    last = len(segments) - 1
    for i, (o, ts, te) in enumerate(segments):
        pre = lead if i > 0 else 0.0
        post = (xf - lead) if i < last else 0.0  # overlap past this segment's end, into the next one's fade
        a = int(round((ts - pre) * SR))
        b = int(round((te + post) * SR)) if i < last else int(round((ts + length - o) * SR))
        x = music[max(0, a):b].copy()
        if i > 0:
            k = int(round(xf * SR))
            x[:k] *= np.sin(np.linspace(0, np.pi / 2, k))[:, None]
        if i < last:
            k = int(round(xf * SR))
            x[-k:] *= np.cos(np.linspace(0, np.pi / 2, k))[:, None]
        p = int(round((o - pre) * SR))
        m = min(len(x), n - p)
        out[p:p + m] += x[:m]
    return out


def mix(music_path, out_wav, t_from, t_to):
    music = decode(music_path) * 10 ** (-2.5 / 20)
    bed = music_bed(music, CUT["music"], CUT["length"])
    n = int((t_to - t_from) * SR)
    out = np.zeros((n, 2), np.float32)
    m0 = int(t_from * SR)
    seg = bed[m0:m0 + n]
    out[: len(seg)] += seg
    sprites, sounds = load_bank()
    cache = {}
    for t, sid, gdb, rate, var in CUT["sfx"]:
        if not (t_from - 3 <= t < t_to):
            continue
        x = sound(sprites, sounds, cache, sid, var)
        if rate != 1:
            idx = np.arange(0, len(x) - 1, rate)
            x = np.stack([np.interp(idx, np.arange(len(x)), x[:, c]) for c in range(2)], axis=1).astype(np.float32)
        x = x * 10 ** (gdb / 20)
        i = int((t - t_from) * SR)
        j0 = max(0, -i)
        i = max(0, i)
        k = min(len(x) - j0, n - i)
        if k > 0:
            out[i:i + k] += x[j0:j0 + k]
    # A short fade at the very end.
    f = int(0.04 * SR)
    out[-f:] *= np.linspace(1, 0, f)[:, None]
    out.astype("<f4").tofile(out_wav)
    return out_wav


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cut", choices=sorted(CUTS), default="full", help="full: the trailer (1:46); 30: the 30-second spot")
    ap.add_argument("--shots", default="trailer-shots", help="the frames filmed by shots.mjs")
    ap.add_argument("--music", default=os.path.join(ROOT, "tools", "trailer", "soundtrack.mp3"))
    ap.add_argument("--out", help="default: trailer.mp4 (full) or trailer-30s.mp4")
    ap.add_argument("--from", dest="t_from", type=float, default=0)
    ap.add_argument("--to", dest="t_to", type=float, help="default: the end of the cut")
    ap.add_argument("--stills", help="write a JPEG every half second here instead of a video")
    ap.add_argument("--video-only", action="store_true", help="no sound: for rendering in parts")
    ap.add_argument("--audio-only", action="store_true", help="just the sound (AAC in .m4a)")
    ap.add_argument("--crf", default="20")
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    use_cut(a.cut)
    if a.t_to is None:
        a.t_to = CUT["length"]
    if a.out is None:
        a.out = "trailer.mp4" if a.cut == "full" else f"trailer-{a.cut}s.mp4"
    k0, k1 = int(round(a.t_from * FPS)), int(round(a.t_to * FPS))
    if a.stills:
        os.makedirs(a.stills, exist_ok=True)
        init_worker(a.cut)
        for k in range(k0, k1, FPS // 2):
            Image.frombytes("RGB", (W, H), render((a.shots, k))).save(os.path.join(a.stills, f"{k / FPS:07.2f}.jpg"), quality=85)
        return
    limiter = ["-af", "alimiter=limit=0.89:attack=4:release=60:level=disabled", "-c:a", "aac", "-b:a", "256k"]
    if a.audio_only:
        wav = a.out + ".f32"
        mix(a.music, wav, a.t_from, a.t_to)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", wav, *limiter, a.out], check=True)
        os.remove(wav)
        print(a.out)
        return
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    wav = None
    if not a.video_only:
        wav = a.out + ".f32"
        mix(a.music, wav, a.t_from, a.t_to)
        cmd += ["-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", wav, *limiter, "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", a.crf, "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.out]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(a.jobs, initializer=init_worker, initargs=(a.cut,)) as pool:
        for i, buf in enumerate(pool.imap(render, [(a.shots, k) for k in range(k0, k1)], chunksize=6)):
            enc.stdin.write(buf)
            if i % 300 == 0:
                print(f"  frame {k0 + i}/{k1}", file=sys.stderr, flush=True)
    enc.stdin.close()
    enc.wait()
    if wav:
        os.remove(wav)
    print(a.out)


if __name__ == "__main__":
    main()
