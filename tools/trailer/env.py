"""Loudness envelope of music cues: python3 -I env.py <step_s> <file.mp3> [...]"""
import subprocess
import sys

import numpy as np

step = float(sys.argv[1])
for path in sys.argv[2:]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = int(16000 * step)
    db = []
    for k in range(0, len(x) - n + 1, n):
        rms = float(np.sqrt(np.mean(x[k:k + n] ** 2)) + 1e-9)
        db.append(20 * np.log10(rms))
    peak = 20 * np.log10(float(np.max(np.abs(x))) + 1e-9)
    name = path.split('/')[-1]
    print(f'{name:18s} {len(x) / 16000:5.1f}s peak {peak:5.1f} dB | ' + ' '.join(f'{v:3.0f}' for v in db))
