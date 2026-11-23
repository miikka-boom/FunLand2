// Loads the recorded sound effects (assets/sfx, built by tools/sfx/build_sfx.py) and hands out
// variants. Many sounds share one file ("sprite"); assets/sfx/bank.js says where each one sits.
// Every file starts with a short sync blip at a known time: browsers differ in how much silence
// their MP3 decoder leaves in front (the encoder delay), so the bank finds the blip and shifts
// every offset in that file by the difference. Files marked with a rate (voices, rumbles,
// ambience: nothing up high) are decoded at that rate, which halves their memory.

import { SPRITES, SOUNDS, LOOPS } from '../assets/sfx/bank.js';

export { SPRITES as SFX_SPRITES, SOUNDS as SFX_SOUNDS, LOOPS as SFX_LOOPS };

/**
 * Where the sync blip peaks in decoded samples (s); null if it isn't there. The first sound in a
 * file starts 0.3 s after the blip, so the search stops well before it (a decoder's delay is tens
 * of milliseconds at most).
 */
export function findMarker(data, sampleRate, nominal) {
  const n = Math.min(data.length, Math.floor(sampleRate * (nominal + 0.2)));
  let best = 0;
  let at = -1;
  for (let i = 0; i < n; i++) {
    const a = data[i] < 0 ? -data[i] : data[i];
    if (a > best) {
      best = a;
      at = i;
    }
  }
  return best >= 0.05 ? at / sampleRate : null;
}

/** A random variant out of n, never the one played last (when there is a choice). */
export function pickVariant(n, last, rnd = Math.random) {
  if (n <= 1) return 0;
  let i = Math.floor(rnd() * (n - 1));
  if (last >= 0 && i >= last) i++;
  return i;
}

/** Which file a sound or loop lives in. */
export function spriteOf(id) {
  const s = SOUNDS[id] || LOOPS[id];
  return s ? s.s : null;
}

export class SfxBank {
  /** @param {() => AudioContext|null} getCtx */
  constructor(getCtx, base = 'assets/sfx/') {
    this.getCtx = getCtx;
    this.base = base;
    this.sprites = new Map(); // key -> { buffer, shift }
    this.loading = new Map(); // key -> Promise
    this.failed = new Set();
    this.last = new Map(); // sound id -> last variant
  }

  /** Fetch and decode a file (once). Resolves true when it is ready, false if it can't be had. */
  load(key) {
    if (this.sprites.has(key)) return Promise.resolve(true);
    if (this.loading.has(key)) return this.loading.get(key);
    const meta = SPRITES[key];
    const ctx = this.getCtx();
    if (!meta || !ctx || this.failed.has(key)) return Promise.resolve(false);
    const p = fetch(this.base + meta.file + (meta.hash ? `?v=${meta.hash}` : ''))
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      })
      .then((data) => this._decode(ctx, data, meta.rate))
      .then((buffer) => {
        const at = findMarker(buffer.getChannelData(0), buffer.sampleRate, meta.marker);
        this.sprites.set(key, { buffer, shift: at === null ? 0 : at - meta.marker });
        this.loading.delete(key);
        return true;
      })
      .catch(() => {
        this.loading.delete(key);
        this.failed.add(key);
        return false;
      });
    this.loading.set(key, p);
    return p;
  }

  /** Decode, at `rate` if asked (through an offline context), else at the context's own rate. */
  _decode(ctx, data, rate) {
    const decode = (c, d) =>
      new Promise((ok, bad) => {
        // Old Safari only has the callback form.
        const pr = c.decodeAudioData(d, ok, bad);
        if (pr && pr.then) pr.then(ok, bad);
      });
    const O = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!rate || !O || rate === ctx.sampleRate) return decode(ctx, data);
    let off;
    try {
      off = new O(1, 1, rate);
    } catch {
      return decode(ctx, data);
    }
    const copy = data.slice(0); // decoding detaches the buffer: keep one for the fallback
    return decode(off, data).catch(() => decode(ctx, copy));
  }

  /** Is everything these sounds need decoded? */
  ready(...ids) {
    for (const id of ids) {
      const key = spriteOf(id);
      if (!key || !this.sprites.has(key)) return false;
    }
    return true;
  }

  /** A variant of a one-shot: { buffer, offset, dur }, or null if not loaded. `i` picks one. */
  get(id, i = -1) {
    const s = SOUNDS[id];
    const sp = s && this.sprites.get(s.s);
    if (!sp) return null;
    const n = s.v.length;
    const k = i >= 0 ? i % n : pickVariant(n, this.last.has(id) ? this.last.get(id) : -1);
    this.last.set(id, k);
    const [t, dur] = s.v[k];
    return { buffer: sp.buffer, offset: Math.max(0, t + sp.shift), dur };
  }

  /** How many variants a sound has (0 if unknown). */
  count(id) {
    const s = SOUNDS[id];
    return s ? s.v.length : 0;
  }

  /** A loop: { buffer, a, b } (a..b is the seamless part), or null if not loaded. */
  loop(id) {
    const l = LOOPS[id];
    const sp = l && this.sprites.get(l.s);
    if (!sp) return null;
    return { buffer: sp.buffer, a: Math.max(0, l.a + sp.shift), b: l.b + sp.shift };
  }

  /** What is loaded (for debugging in the browser). */
  status() {
    const out = {};
    for (const [k, v] of this.sprites) out[k] = { shiftMs: Math.round(v.shift * 1000 * 10) / 10, rate: v.buffer.sampleRate, seconds: Math.round(v.buffer.duration * 10) / 10 };
    return { ready: out, loading: [...this.loading.keys()], failed: [...this.failed] };
  }
}
