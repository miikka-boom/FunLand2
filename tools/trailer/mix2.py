"""The co-op trailer's sound, cut from the game's score to the edit.

python3 -I mix2.py <out.wav>
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


# 0 - 8.5: the safe-room theme (warm, slow): two of them, leaving together.
put(fades(load('saferoom.mp3', 0.5, 8.8), fin=0.4, fout=0.35), 0.0, -1.0)
# 8.5 - 16.3: steady tension under the Night Terror and the Hunter.
put(fades(load('tension_b.mp3', 0.0, 7.8), fin=0.35, fout=0.3), 8.5, 0.0)
# The Terror caught in the partner's light (lit at 10.267), and the Hunter's pounce (pin at 13.4).
put(fades(load('sting_terror.mp3', 0.0, 2.8), fout=1.2), 10.05, -1.0)
put(fades(load('sting_hunter.mp3', 0.0, 2.8), fout=1.2), 12.95, -1.0)
# 16 - 20.15: the holdout cue's hits while the partner is down and the horde comes.
put(fades(load('holdout.mp3', 0.0, 4.15), fin=0.3, fout=0.15), 16.0, +2.5)
# 20 - 23.65: back to back.
put(fades(load('horde_b.mp3', 0.0, 3.65), fin=0.05, fout=0.3), 20.0, +4.0)
# 23.35 - 30: the rescue theme's last bars resolve under the ferry and the logo (it ends on its own).
put(fades(load('end_rescued.mp3', 72.85, 6.65), fin=0.3, fout=0.25), 23.35, -0.5)

peak = float(np.max(np.abs(mix)))
mix = np.tanh(mix * 1.1) / np.tanh(1.1) if peak > 1 else mix
mix = mix * (db(-1.0) / float(np.max(np.abs(mix))))
for a, b in [(0, 4), (4, 8.5), (8.5, 12.5), (12.5, 16), (16, 20), (20, 23.5), (23.5, 26.5), (26.5, 30)]:
    seg = mix[int(a * SR):int(b * SR)]
    rms = 20 * math.log10(float(np.sqrt(np.mean(seg ** 2))) + 1e-9)
    print(f'{a:5.2f}-{b:5.2f} s  rms {rms:6.1f} dBFS')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', OUT],
               input=mix.astype(np.float32).tobytes(), check=True)
print('wrote', OUT)
