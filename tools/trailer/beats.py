"""Beat and energy analysis for the trailer's soundtrack, in plain numpy (no librosa).

    python3 tools/trailer/beats.py track.mp3 [--plot out.png] [--json out.json] [--bpm 140]

Prints a loudness map (one row per second), the tempo, the beat grid and the moments that matter
to an edit: hits (big transients), drops (loud after quiet) and gaps (near silence). With --json it
writes them for edit.py. The tracker is Ellis's dynamic programme over a spectral-flux onset curve.
"""

import argparse
import json
import subprocess
import sys

import numpy as np

SR = 22050
HOP = 256  # 86 frames per second
NFFT = 2048


def load(path, sr=SR):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def stft_mag(y):
    win = np.hanning(NFFT).astype(np.float32)
    n = 1 + (len(y) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    frames = y[idx] * win
    return np.abs(np.fft.rfft(frames, axis=1)).astype(np.float32)  # (frames, bins)


def onset_curve(mag, lo_hz=0, hi_hz=None):
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    sel = (freqs >= lo_hz) & (freqs <= (hi_hz or SR / 2))
    logm = np.log1p(100 * mag[:, sel])
    flux = np.maximum(0, np.diff(logm, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    # Remove the slow trend so loud sections don't swamp the peaks.
    k = int(0.5 * SR / HOP)
    trend = np.convolve(flux, np.ones(k) / k, mode="same")
    o = np.maximum(0, flux - trend)
    return o / (o.max() + 1e-9)


def tempo(onset, lo=70, hi=200, prior=140):
    fps = SR / HOP
    o = onset - onset.mean()
    ac = np.correlate(o, o, mode="full")[len(o) - 1:]
    best = []
    for bpm in np.arange(lo, hi, 0.25):
        lag = 60 * fps / bpm
        i = int(lag)
        f = lag - i
        if i + 1 >= len(ac):
            continue
        v = ac[i] * (1 - f) + ac[i + 1] * f
        # Octave helpers: a real tempo also has energy at 2x and 1/2 lag.
        w = np.exp(-0.5 * (np.log2(bpm / prior) / 0.9) ** 2)
        best.append((v * w, bpm))
    best.sort(reverse=True)
    return best[0][1], [b for _, b in best[:8]]


def track(onset, bpm, tightness=120.0):
    fps = SR / HOP
    period = 60 * fps / bpm
    n = len(onset)
    score = onset.astype(np.float64).copy()
    back = np.full(n, -1)
    lo, hi = int(period / 2), int(period * 2)
    taus = np.arange(lo, hi + 1)
    pen = -tightness * (np.log(taus / period)) ** 2
    for t in range(hi, n):
        cand = score[t - taus] + pen
        j = np.argmax(cand)
        score[t] += cand[j]
        back[t] = t - taus[j]
    # Start from the best score in the last period, walk back.
    t = n - hi + int(np.argmax(score[n - hi:]))
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    beats = np.array(beats[::-1]) / fps
    return beats


def rms_db(y, step=0.1):
    n = int(step * SR)
    m = len(y) // n
    r = np.sqrt((y[: m * n].reshape(m, n) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(r + 1e-9)


def centroid(mag, step_frames):
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    c = (mag * freqs).sum(axis=1) / (mag.sum(axis=1) + 1e-9)
    m = len(c) // step_frames
    return c[: m * step_frames].reshape(m, step_frames).mean(axis=1)


def analyse(path, bpm_hint=140):
    y = load(path)
    mag = stft_mag(y)
    on = onset_curve(mag)
    on_lo = onset_curve(mag, 30, 180)  # kicks, taikos, booms
    bpm, cands = tempo(on, prior=bpm_hint)
    beats = track(on, bpm)
    db = rms_db(y)
    fps = SR / HOP
    # Hits: the strongest low-end transients, at least half a second apart.
    hits = []
    order = np.argsort(on_lo)[::-1]
    for i in order:
        if on_lo[i] < 0.25 or len(hits) >= 60:
            break
        t = i / fps
        if all(abs(t - h[0]) > 0.5 for h in hits):
            hits.append((round(float(t), 3), round(float(on_lo[i]), 3)))
    hits.sort()
    # Gaps: 0.1 s windows far below the local level.
    gaps = []
    for i in range(len(db)):
        lo = max(0, i - 30)
        ref = np.percentile(db[lo:i + 1], 90) if i > 0 else db[i]
        if db[i] < ref - 18 and db[i] < -30:
            gaps.append(round(i * 0.1, 1))
    return {
        "path": path,
        "seconds": round(len(y) / SR, 3),
        "bpm": round(float(bpm), 2),
        "bpm_candidates": [float(b) for b in cands],
        "beats": [round(float(b), 3) for b in beats],
        "db": [round(float(d), 2) for d in db],
        "centroid": [round(float(c)) for c in centroid(mag, int(fps))],
        "hits": hits,
        "gaps": gaps,
        "onset": [round(float(v), 3) for v in on[:: 2]],  # 43 per second
    }


def plot(an, out, sections=None):
    from PIL import Image, ImageDraw

    W, H = 1800, 420
    im = Image.new("RGB", (W, H), (14, 15, 18))
    d = ImageDraw.Draw(im)
    secs = an["seconds"]
    X = lambda t: int(t / secs * (W - 20)) + 10  # noqa: E731
    if sections:
        t = 0
        for name, dur in sections:
            d.line([(X(t), 0), (X(t), H)], fill=(70, 70, 90))
            d.text((X(t) + 4, 4), f"{name}", fill=(150, 150, 180))
            t += dur
    db = an["db"]
    pts = [(X(i * 0.1), int(H - 30 - (max(-60, v) + 60) / 60 * (H - 60))) for i, v in enumerate(db)]
    d.line(pts, fill=(230, 90, 60), width=2)
    on = an["onset"]
    for i, v in enumerate(on):
        x = X(i / (SR / HOP / 2))
        d.line([(x, H - 10), (x, H - 10 - int(v * 60))], fill=(90, 160, 230))
    for b in an["beats"]:
        d.line([(X(b), H - 8), (X(b), H - 2)], fill=(240, 240, 240))
    for t, s in an["hits"]:
        d.ellipse([X(t) - 4, 14, X(t) + 4, 22], fill=(255, 210, 60))
    for s in range(0, int(secs) + 1, 5):
        d.text((X(s), H - 24), str(s), fill=(120, 120, 120))
    im.save(out)


SECTIONS = [("intro", 14), ("build", 18), ("riser", 4), ("drop", 26), ("break", 8), ("climax", 26), ("outro", 10)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("track")
    ap.add_argument("--bpm", type=float, default=140)
    ap.add_argument("--plot")
    ap.add_argument("--json")
    a = ap.parse_args()
    an = analyse(a.track, a.bpm)
    print(f"{a.track}: {an['seconds']} s, tempo {an['bpm']} bpm (candidates {an['bpm_candidates'][:5]})")
    db = np.array(an["db"])
    cen = an["centroid"]
    print("sec  dB(mean/max)  brightness  ")
    for s in range(int(an["seconds"])):
        w = db[s * 10:(s + 1) * 10]
        if len(w) == 0:
            break
        bar = "#" * int(max(0, w.mean() + 45))
        print(f"{s:3d}  {w.mean():6.1f} {w.max():6.1f}  {cen[s] if s < len(cen) else 0:5d}  {bar}")
    t = 0
    for name, dur in SECTIONS:
        w = db[int(t * 10):int((t + dur) * 10)]
        print(f"section {name:7s} {t:5.1f}-{t + dur:5.1f}: mean {w.mean():6.1f} dB, p90 {np.percentile(w, 90):6.1f}")
        t += dur
    b = np.array(an["beats"])
    ib = np.diff(b)
    print(f"beats: {len(b)}, median interval {np.median(ib):.3f} s ({60 / np.median(ib):.1f} bpm), spread {np.std(ib):.3f}")
    print("hits:", " ".join(f"{t:.2f}" for t, _ in an["hits"]))
    gaps = an["gaps"]
    if gaps:
        runs = []
        for g in gaps:
            if runs and g - runs[-1][1] <= 0.11:
                runs[-1][1] = g
            else:
                runs.append([g, g])
        print("gaps:", " ".join(f"{s:.1f}-{e:.1f}" for s, e in runs))
    if a.plot:
        plot(an, a.plot, SECTIONS)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(an, f)


if __name__ == "__main__":
    sys.exit(main())
