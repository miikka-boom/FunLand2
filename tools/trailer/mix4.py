"""Trailer 4's sound (20 s): a 2 s hook (the horde cue and the pumps going up, the music ducked under the
blast, all of it cut dead), a nearly silent street (wind, two people's footsteps, a groan off in the dark),
then the game's score placed to the cut and a hard stop.

python3 -I mix4.py <out.wav>
"""
import math
import os
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 20.0
MUSIC = os.environ.get('MUSIC_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'music')) + os.sep
OUT = sys.argv[1]
rng = np.random.default_rng(11)


def db(v):
    return 10 ** (v / 20)


def load(name, start, length):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{start}', '-t', f'{length}', '-i', MUSIC + name,
                          '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def fades(x, fin=0.0, fout=0.0):
    n = len(x)
    if fin > 0:
        k = min(n, int(fin * SR))
        x[:k] *= np.linspace(0, 1, k)[:, None]
    if fout > 0:
        k = min(n, int(fout * SR))
        x[n - k:] *= np.linspace(1, 0, k)[:, None]
    return x


def lowpass(x, fc):
    a = math.exp(-2 * math.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def bandpass(x, f, q):
    w = 2 * math.pi * f / SR
    al = math.sin(w) / (2 * q)
    a0 = 1 + al
    b0, b2, a1, a2 = al / a0, -al / a0, -2 * math.cos(w) / a0, (1 - al) / a0
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x[i], y1, v
        y[i] = v
    return y


mix = np.zeros((int(DUR * SR), 2), dtype=np.float64)


def put(x, at, gain_db=0.0, pan=0.0):
    if x.ndim == 1:
        x = np.stack([x * math.sqrt(0.5 * (1 - pan)), x * math.sqrt(0.5 * (1 + pan))], axis=1)
    i = int(round(at * SR))
    n = min(len(x), len(mix) - i)
    mix[i:i + n] += x[:n] * db(gain_db)


# --- 0 - 5.0: the street, nearly silent ------------------------------------------------------
def wind(seconds):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    chans = []
    for ph in (0.0, 1.7):
        w = lowpass(lowpass(rng.standard_normal(n), 240), 240)
        w *= (0.62 + 0.38 * np.sin(2 * math.pi * 0.21 * t + ph)) * (0.85 + 0.15 * np.sin(2 * math.pi * 0.07 * t))
        chans.append(w / np.max(np.abs(w)))
    return np.stack(chans, axis=1)


def step():
    n = int(0.1 * SR)
    b = lowpass(rng.standard_normal(n), 380) * np.exp(-np.arange(n) / SR / 0.022)
    return b / np.max(np.abs(b))


def groan():
    """audio.js groan(): a falling sawtooth with a wobble, through a bandpass."""
    dur = 1.15
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    base = 104.0
    f = base * (0.8 ** np.minimum(t / dur, 1)) + 6 * np.sin(2 * math.pi * 6.2 * t)
    ph = np.cumsum(f) / SR
    saw = 2 * (ph - np.floor(ph + 0.5))
    env = np.where(t < 0.15, 0.0001 * (0.25 / 0.0001) ** (t / 0.15), 0.25 * (0.0001 / 0.25) ** np.clip((t - 0.15) / (dur - 0.15), 0, 1))
    g = bandpass(saw * env, 610, 4)
    g = lowpass(g, 1800)
    return g / np.max(np.abs(g))


# 2.0 - 6.5: the street, nearly silent (wind, the two of them walking, a groan up ahead).
street = np.zeros_like(mix)
fade = np.ones(int(4.6 * SR))
fade[:int(0.25 * SR)] = np.linspace(0, 1, int(0.25 * SR))
fade[-int(0.3 * SR):] = np.linspace(1, 0, int(0.3 * SR))
w = wind(4.6) * fade[:, None] * db(-27.0)
street[int(2.0 * SR):int(2.0 * SR) + len(w)] += w
mix_ref = mix
mix = street
for k in range(7):
    put(step() * (0.8 + 0.2 * rng.random()), 2.2 + k * 0.6, -22.0, pan=-0.25)
    put(step() * (0.8 + 0.2 * rng.random()), 2.48 + k * 0.58, -23.0, pan=0.25)
put(groan(), 3.8, -12.0, pan=0.3)
street = mix
mix = mix_ref

# 6.5 - 9.8: the title theme under the Witch (its swell arrives just before MOST DON'T.).
put(fades(load('menu.mp3', 8.4, 3.3), fin=0.4, fout=0.05), 6.5, +3.0)
put(fades(load('sting_terror.mp3', 0.0, 2.6), fout=1.2), 9.8, -1.0)
# 10.5 - 19.35: the fight and the escape, one cue. It comes in on a beat (src 0.879), its pre-drop lull falls
# on the last of the hold, its drop (src 4.946) on the cut to the escape (frame 437), and it stops dead
# just before the downbeat that the cut to black (frame 581) lands on.
put(fades(load('horde_chase.mp3', 0.879, 8.85), fin=0.01, fout=0.02), 10.5, 0.0)

def blast(seed):
    r = np.random.default_rng(seed)
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    attack = 1 - np.exp(-t / 0.003)
    f = 34 + 76 * np.exp(-t / 0.22)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * attack * np.exp(-t / 0.55)
    body = lowpass(lowpass(r.standard_normal(n), 520), 520) * attack * np.exp(-t / 0.33) * 9.0
    hi = r.standard_normal(n)
    crack = (hi - lowpass(hi, 2600)) * np.exp(-t / 0.028) * 0.55
    rumble = lowpass(lowpass(r.standard_normal(n), 95), 95) * np.exp(-t / 1.35) * 38.0
    x = sub + body + crack + rumble
    return x / np.max(np.abs(x))


# 0 - 2.0, the hook: the horde cue, the pumps going up on its frame 17 (music ducked under the blast),
# and all of it cut dead at 2.0 for the quiet street.
hook = np.zeros_like(mix)
mix_ref = mix
mix = hook
put(fades(load('horde_b.mp3', 0.0, 2.05), fin=0.005), 0.0, 0.0)
TB = 17 / 30
t = np.arange(len(mix)) / SR
env = np.ones(len(mix))
d = db(-14.0)
env[(t >= TB - 0.01) & (t < TB + 0.28)] = d
back = (t >= TB + 0.28) & (t < TB + 1.1)
k = (t[back] - (TB + 0.28)) / 0.82
env[back] = d + (1 - d) * (k * k * (3 - 2 * k))
mix *= env[:, None]
put(np.stack([blast(7), blast(8)], axis=1), TB, +6.0)
gate = np.clip((2.0 - t) / 0.03, 0, 1)
hook = mix * gate[:, None]
mix = mix_ref + hook + street

mix = mix * (db(-1.0) / float(np.max(np.abs(mix))))
for a, b in [(0.0, 2.0), (2.0, 6.5), (6.5, 9.8), (9.8, 10.5), (10.5, 14.567), (14.567, 19.35), (19.35, 20.0)]:
    seg = mix[int(a * SR):int(b * SR)]
    print(f'{a:5.2f}-{b:5.2f} s  rms {20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9):6.1f} dBFS')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', OUT],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', OUT)
