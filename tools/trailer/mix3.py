"""'Where is Ben?' sound: near silence, Ben's whistle (rebuilt from the game's own synth: G-E-G-A-G,
6 Hz vibrato, a breathy edge), the title theme under the search, his footsteps running off at the glimpse.

python3 -I mix3.py <out.wav>
"""
import math
import os
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 30.0
MUSIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'music') + os.sep
OUT = sys.argv[1]
rng = np.random.default_rng(3)


def db(v):
    return 10 ** (v / 20)


def load(name, start, length):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{start}', '-t', f'{length}', '-i', MUSIC + name,
                          '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def fades(x, fin=0.0, fout=0.0):
    n = len(x)
    if fin > 0:
        k = min(n, int(fin * SR))
        x[:k] *= np.linspace(0, 1, k)[:, None]
    if fout > 0:
        k = min(n, int(fout * SR))
        x[n - k:] *= np.linspace(1, 0, k)[:, None]
    return x


def biquad(x, b0, b1, b2, a1, a2):
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x[i], y1, v
        y[i] = v
    return y


def bandpass(x, f, q):
    w = 2 * math.pi * f / SR
    al = math.sin(w) / (2 * q)
    a0 = 1 + al
    return biquad(x, al / a0, 0.0, -al / a0, -2 * math.cos(w) / a0, (1 - al) / a0)


def lowpass(x, f, q=0.707):
    w = 2 * math.pi * f / SR
    al = math.sin(w) / (2 * q)
    c = math.cos(w)
    a0 = 1 + al
    return biquad(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, -2 * c / a0, (1 - al) / a0)


def exp_env(n, attack, dur, peak):
    t = np.arange(n) / SR
    e = np.zeros(n)
    a = t < attack
    e[a] = 0.0001 * (peak / 0.0001) ** (t[a] / attack)
    d = (t >= attack) & (t < dur)
    e[d] = peak * (0.0001 / peak) ** ((t[d] - attack) / max(1e-3, dur - attack))
    return e


def whistle():
    """Ben's tune, as audio.js benWhistle plays it."""
    tune = [(784, 0.22), (659, 0.22), (784, 0.2), (880, 0.34), (784, 0.5)]
    total = sum(d + 0.05 for _, d in tune) + 0.1
    out = np.zeros(int(total * SR))
    at = 0.0
    for f, dur in tune:
        n = int((dur + 0.05) * SR)
        t = np.arange(n) / SR
        inst = f * (1 + 0.012 * np.sin(2 * math.pi * 6 * t))
        tone = np.sin(2 * math.pi * np.cumsum(inst) / SR) * exp_env(n, 0.04, dur, 0.07)
        breath = bandpass(rng.standard_normal(n), f * 2, 12) * exp_env(n, 0.05, dur, 0.012) * 3.0
        i = int(at * SR)
        out[i:i + n] += tone + breath
        at += dur + 0.05
    return out


def room(x, wet=0.35):
    """A small room: a few feedback combs, mixed in under the dry sound."""
    tail = np.zeros(len(x) + int(1.2 * SR))
    tail[:len(x)] = x
    acc = np.zeros_like(tail)
    for ms, fb in [(29.7, 0.55), (37.1, 0.52), (41.1, 0.5), (43.7, 0.48)]:
        d = int(ms / 1000 * SR)
        y = tail.copy()
        for i in range(d, len(y)):
            y[i] += fb * y[i - d]
        acc += y
    acc = lowpass(acc, 3500) / 4
    return tail * (1 - wet) + acc * wet


def scuff():
    """Small quick footsteps, running off (audio.js benScuff)."""
    out = np.zeros(int(0.6 * SR))
    for k in range(5):
        n = int(0.05 * SR)
        burst = lowpass(rng.standard_normal(n), 900 - k * 80) * exp_env(n, 0.004, 0.05, 0.3 * (1 - k * 0.16)) * 3.0
        i = int(k * 0.085 * SR)
        out[i:i + n] += burst
    return out


def thump():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    f = 42 + 30 * np.exp(-t / 0.12)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.45)


mix = np.zeros((int(DUR * SR), 2), dtype=np.float64)


def put(x, at, gain_db=0.0, pan=0.0):
    if x.ndim == 1:
        x = np.stack([x * math.sqrt(0.5 * (1 - pan)), x * math.sqrt(0.5 * (1 + pan))], axis=1)
    i = int(round(at * SR))
    n = min(len(x), len(mix) - i)
    mix[i:i + n] += x[:n] * db(gain_db)


w = room(whistle())
w = w / np.max(np.abs(w))
# 0.5: somebody whistling in the empty safe room, out of sight.
put(w, 0.55, -9.0, pan=-0.25)
# 3.45 - 25.85: the title theme (its quiet opening, the swell lands on "places nobody could reach").
put(fades(load('menu.mp3', 0.0, 22.4), fin=1.2, fout=0.6), 3.45, +2.0)
# 12.833: the eyes blink; small footsteps run off.
s = room(scuff(), wet=0.25)
put(s / np.max(np.abs(s)), 12.85, -8.0, pan=0.35)
# 26.9: BEN lands around the eyes. 28.0: he answers, and whistles.
put(thump() / 1.0, 26.9, -11.0)
put(w, 28.05, -10.0, pan=0.2)

mix = mix * (db(-1.0) / float(np.max(np.abs(mix))))
for a, b in [(0, 3.6), (3.6, 11), (11, 14), (14, 17.8), (17.8, 23), (23, 25.6), (25.6, 30)]:
    seg = mix[int(a * SR):int(b * SR)]
    print(f'{a:5.2f}-{b:5.2f} s  rms {20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9):6.1f} dBFS')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', OUT],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', OUT)
