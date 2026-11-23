// Streams the game's music files (assets/music) through WebAudio: seamless loops, crossfades
// between cues, short one-shot stingers on top, and a small decoded-buffer cache so a phone
// never holds every track in memory at once. Which cue plays when is decided elsewhere
// (src/game/music-director.js); this file only plays what it is told.

import { CUES } from '../assets/music/cues.js';

const BY_ID = new Map(CUES.map((c) => [c.id, c]));
// Decoded PCM is big (a 60 s stereo loop at 48 kHz is ~23 MB as float32): keep at most this much.
const CACHE_BYTES = 150 * 1024 * 1024;

export class MusicPlayer {
  /** @param {import('./audio.js').Audio} audio the game's sound engine (owns the AudioContext). */
  constructor(audio, base = 'assets/music/') {
    this.audio = audio;
    this.base = base;
    this.volume = 0.7; // music volume (0..1), on top of the master volume
    this.enabled = true;
    this.out = null; // music bus
    this.cache = new Map(); // id -> { buffer, bytes, used }
    this.loading = new Map(); // id -> Promise<AudioBuffer|null>
    this.current = null; // { id, src, gain }
    this.want = null; // the cue asked for (may still be loading)
    this.duck = 1;
    this.failed = new Set();
  }

  get ctx() {
    return this.audio.ctx;
  }

  _bus() {
    if (this.out || !this.ctx) return this.out;
    // The music skips the SFX compressor (it would pump with every shot) and goes straight out,
    // through the last safety limiter the effects share (audio.js), so the two can't clip together.
    // Stingers get their own bus so ducking the music under them doesn't duck them too.
    const dest = this.audio.mixOut || this.ctx.destination;
    this.out = this.ctx.createGain();
    this.out.gain.value = this._level();
    this.out.connect(dest);
    this.fx = this.ctx.createGain();
    this.fx.gain.value = this._level(false);
    this.fx.connect(dest);
    return this.out;
  }

  _level(ducked = true) {
    return this.enabled ? this.volume * this.audio.volume * (ducked ? this.duck : 1) : 0;
  }

  _applyLevel(time = 0.25) {
    if (!this.out) return;
    const t = this.ctx.currentTime;
    for (const [bus, ducked] of [[this.out, true], [this.fx, false]]) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(this._level(ducked), t + time);
    }
  }

  setVolume(v) {
    this.volume = v;
    this._applyLevel();
  }

  setEnabled(on) {
    this.enabled = on;
    this._applyLevel(0.4);
  }

  /** Called when the master volume changes. */
  refresh() {
    this._applyLevel(0.1);
  }

  /** Fetch + decode a cue (once); resolves to the AudioBuffer, or null if it can't be had. */
  load(id) {
    const hit = this.cache.get(id);
    if (hit) {
      hit.used = performance.now();
      return Promise.resolve(hit.buffer);
    }
    if (this.loading.has(id)) return this.loading.get(id);
    const cue = BY_ID.get(id);
    if (!cue || !this.ctx || this.failed.has(id)) return Promise.resolve(null);
    const p = fetch(this.base + cue.file)
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      })
      .then(
        (data) =>
          new Promise((ok, bad) => {
            // Old Safari only has the callback form.
            const pr = this.ctx.decodeAudioData(data, ok, bad);
            if (pr && pr.then) pr.then(ok, bad);
          }),
      )
      .then((buffer) => {
        this.loading.delete(id);
        this.cache.set(id, { buffer, bytes: buffer.length * buffer.numberOfChannels * 4, used: performance.now() });
        this._trim();
        return buffer;
      })
      .catch(() => {
        this.loading.delete(id);
        this.failed.add(id);
        return null;
      });
    this.loading.set(id, p);
    return p;
  }

  /** Warm the cache for cues that may be needed soon (in order of importance). */
  preload(ids) {
    if (!this.ctx) return;
    for (const id of ids) if (id && !this.cache.has(id)) this.load(id);
  }

  _trim() {
    let total = 0;
    for (const e of this.cache.values()) total += e.bytes;
    if (total <= CACHE_BYTES) return;
    const keep = new Set([this.current && this.current.id, this.want]);
    const old = [...this.cache.entries()].filter(([id]) => !keep.has(id)).sort((a, b) => a[1].used - b[1].used);
    for (const [id, e] of old) {
      if (total <= CACHE_BYTES) break;
      this.cache.delete(id);
      total -= e.bytes;
    }
  }

  /**
   * Make `id` the music (null = silence). Crossfades over `fade` seconds. A cue still loading
   * starts when it arrives, unless something else was asked for in the meantime.
   */
  play(id, fade = 2.5, level = 1) {
    if (!this.ctx) return;
    if (id === this.want) return;
    this.want = id;
    if (!id) {
      this._stopCurrent(fade);
      return;
    }
    const cached = this.cache.get(id);
    if (cached) {
      cached.used = performance.now();
      this._start(id, cached.buffer, fade, level);
      return;
    }
    // Still loading: the old cue plays on until the new one has arrived, then they crossfade.
    this.load(id).then((buffer) => {
      if (buffer && this.want === id) this._start(id, buffer, fade, level);
    });
  }

  _start(id, buffer, fade, level) {
    const c = this.ctx;
    const cue = BY_ID.get(id);
    const out = this._bus();
    if (!out) return;
    this._stopCurrent(fade);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(level, t + Math.max(0.05, fade));
    src.connect(gain);
    gain.connect(out);
    let offset = 0;
    if (cue.mode === 'loop') {
      src.loop = true;
      src.loopStart = cue.loopStart;
      src.loopEnd = cue.loopEnd;
      // Re-entering a loop cue starts at the top of the loop (or its intro), not mid-file.
      offset = cue.intro ? 0 : cue.loopStart;
    }
    src.start(t, offset);
    const cur = { id, src, gain };
    src.onended = () => {
      if (this.current === cur) this.current = null;
    };
    this.current = cur;
  }

  _stopCurrent(fade) {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    const t = this.ctx.currentTime;
    const g = cur.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    try {
      cur.src.stop(t + Math.max(0.05, fade) + 0.05);
    } catch {
      // already stopped
    }
  }

  /** A one-shot on top of the music (a special's cue): the music dips under it. */
  stinger(id, { level = 0.9, duckTo = 0.45 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const run = (buffer) => {
      if (!buffer) return;
      const c = this.ctx;
      if (!this._bus()) return;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const g = c.createGain();
      g.gain.value = level;
      src.connect(g);
      g.connect(this.fx);
      src.start();
      this.stingers = (this.stingers || 0) + 1;
      this.duck = duckTo;
      this._applyLevel(0.3);
      src.onended = () => {
        this.stingers--;
        if (this.stingers > 0) return;
        this.duck = 1;
        this._applyLevel(1.5);
      };
    };
    const hit = this.cache.get(id);
    if (hit) run(hit.buffer);
    else this.load(id).then(run);
  }

  /** What is playing (for debugging and tests in the browser). */
  status() {
    return {
      want: this.want,
      playing: this.current && this.current.id,
      cached: [...this.cache.keys()],
      loading: [...this.loading.keys()],
      failed: [...this.failed],
    };
  }
}

export { BY_ID as MUSIC_CUES };
