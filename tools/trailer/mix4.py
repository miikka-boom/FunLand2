"""The trailer's sound: cues from the game's score placed to the cut, plus a synthesized blast.

python3 -I mix.py <out.wav>
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


def db(v):
    return 10 ** (v / 20)


mix = np.zeros((int(DUR * SR), 2), dtype=np.float32)


def put(x, at, gain_db=0.0):
    i = int(round(at * SR))
    n = min(len(x), len(mix) - i)
    mix[i:i + n] += x[:n] * db(gain_db)


def lowpass(x, fc):
    a = math.exp(-2 * math.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def blast(seed):
    rng = np.random.default_rng(seed)
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    attack = 1 - np.exp(-t / 0.003)
    f = 34 + 76 * np.exp(-t / 0.22)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * attack * np.exp(-t / 0.55)
    body = lowpass(lowpass(rng.standard_normal(n), 520), 520) * attack * np.exp(-t / 0.33) * 9.0
    hi = rng.standard_normal(n)
    crack = (hi - lowpass(hi, 2600)) * np.exp(-t / 0.028) * 0.55
    rumble = lowpass(lowpass(rng.standard_normal(n), 95), 95) * np.exp(-t / 1.35) * 38.0
    x = sub + body + crack + rumble
    return x / np.max(np.abs(x))


# 0.0 - 12.6: the title theme's opening (the whistle, Ben's tune), swelling into the Witch.
put(fades(load('menu.mp3', 0.0, 12.4), fin=0.5, fout=0.05), 0.0, +3.0)
# 12.6: a stinger on the black card.
put(fades(load('sting_terror.mp3', 0.0, 2.6), fout=1.2), 12.4, -1.0)
# 13.4 - 18.25: the horde.
put(fades(load('horde_b.mp3', 0.0, 4.85), fin=0.01, fout=0.25), 13.2, 0.0)
# 15.033: the pumps go up (horde frame 55 lands on output frame 451).
boom = np.stack([blast(7), blast(8)], axis=1).astype(np.float32)
TB = 445 / 30
# 18.0 - 25.93: Pier 9, the finale's sustained run.
put(fades(load('finale_escape.mp3', 10.0, 8.2), fin=0.25, fout=0.06), 17.8, +0.5)
# 26.3 - 30.0: hard silence, then the theme picks up again under the logo.
put(fades(load('menu.mp3', 12.6, 3.7), fin=0.15, fout=1.1), 26.3, -2.0)

# Duck the music under the blast (-9 dB, held a beat, back over 0.8 s), then the blast itself.
t = np.arange(len(mix)) / SR
env = np.ones(len(mix), dtype=np.float32)
d = db(-14.0)
held = (t >= TB - 0.01) & (t < TB + 0.28)
env[held] = d
back = (t >= TB + 0.28) & (t < TB + 1.1)
k = (t[back] - (TB + 0.28)) / 0.82
env[back] = d + (1 - d) * (k * k * (3 - 2 * k))
mix *= env[:, None]
put(boom, TB, +6.0)

# Gentle soft-clip so the blast can't overrun, then out as 24-bit.
peak = float(np.max(np.abs(mix)))
mix = np.tanh(mix * 1.1) / np.tanh(1.1) if peak > 1 else mix
mix = mix * (db(-1.0) / float(np.max(np.abs(mix))))
for a, b in [(0.0, 4.0), (4.0, 12.4), (12.4, 13.2), (13.2, 17.8), (17.8, 26.0), (26.0, 26.3), (26.3, 30.0)]:
    seg = mix[int(a * SR):int(b * SR)]
    rms = 20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9)
    print(f'{a:5.2f}-{b:5.2f} s  rms {rms:6.1f} dBFS  peak {20 * math.log10(float(np.max(np.abs(seg))) + 1e-9):5.1f}')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', OUT],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', OUT)
