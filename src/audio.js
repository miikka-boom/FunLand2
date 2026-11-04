// Tiny WebAudio synth: every sound is generated, nothing to download.
// Positional sounds are panned/attenuated relative to the survivor.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.listener = { x: 0, y: 0 };
    this.last = new Map();
    this.alarmNodes = null;
  }

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._ambience();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // Old iOS: a silent buffer finishes the unlock.
      const b = this.ctx.createBufferSource();
      b.buffer = this.ctx.createBuffer(1, 1, 22050);
      b.connect(this.ctx.destination);
      b.start(0);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // --- building blocks -------------------------------------------------------------

  _ok(key, minGap) {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (minGap && now - (this.last.get(key) || -1) < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  _out(pan = 0, gain = 1) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  _spatial(x, y, range = 900) {
    const dx = x - this.listener.x;
    const dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    return { pan: clamp(dx / 520, -0.9, 0.9), gain: Math.pow(clamp(1 - d / range, 0, 1), 1.5) };
  }

  _noise({ dur, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, at = 0, rate = 1, sweepTo, out }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // long sounds (horde) outlast the buffer
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone({ type = 'sine', f0, f1, dur, gain = 0.4, attack = 0.004, at = 0, out, filter }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      f.Q.value = filter.q || 1;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  _ambience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = c.createGain();
    g.gain.value = 0.035;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  // --- weapons ---------------------------------------------------------------------

  shot(kind) {
    if (!this._ok('shot', 0.02)) return;
    const r = 0.92 + Math.random() * 0.16;
    if (kind === 'shotgun') {
      this._noise({ dur: 0.32, type: 'lowpass', freq: 2600, gain: 0.95, rate: r * 0.8 });
      this._tone({ f0: 95, f1: 38, dur: 0.22, gain: 0.9 });
      this._noise({ dur: 0.05, type: 'highpass', freq: 2500, gain: 0.12, at: 0.42 });
      this._noise({ dur: 0.06, type: 'highpass', freq: 1800, gain: 0.14, at: 0.52 });
    } else if (kind === 'hunting') {
      this._noise({ dur: 0.05, type: 'highpass', freq: 3000, gain: 0.5 });
      this._noise({ dur: 0.24, type: 'bandpass', freq: 1300, q: 0.6, gain: 0.8, rate: r });
      this._tone({ f0: 130, f1: 45, dur: 0.18, gain: 0.75 });
      this._noise({ dur: 0.3, type: 'lowpass', freq: 700, gain: 0.18, at: 0.14 });
    } else if (kind === 'rifle') {
      this._noise({ dur: 0.12, type: 'bandpass', freq: 1500, q: 0.7, gain: 0.6, rate: r });
      this._tone({ f0: 125, f1: 50, dur: 0.1, gain: 0.55 });
    } else {
      this._noise({ dur: 0.085, type: 'bandpass', freq: 2000, q: 0.8, gain: 0.45, rate: r });
      this._tone({ f0: 150, f1: 62, dur: 0.07, gain: 0.4 });
    }
  }

  dryFire() {
    if (this._ok('dry', 0.3)) this._noise({ dur: 0.025, type: 'highpass', freq: 3500, gain: 0.25 });
  }

  reloadStart() {
    if (!this._ok('rl', 0.05)) return;
    this._noise({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.3 });
    this._noise({ dur: 0.12, type: 'bandpass', freq: 1400, q: 2, gain: 0.15, at: 0.08 });
  }

  reloadDone() {
    if (!this._ok('rd', 0.05)) return;
    this._noise({ dur: 0.03, type: 'highpass', freq: 2600, gain: 0.35 });
    this._noise({ dur: 0.04, type: 'highpass', freq: 2000, gain: 0.3, at: 0.09 });
  }

  shell() {
    if (this._ok('shell', 0.05)) this._noise({ dur: 0.05, type: 'bandpass', freq: 1900, q: 3, gain: 0.3 });
  }

  pump() {
    if (!this._ok('pump', 0.1)) return;
    this._noise({ dur: 0.06, type: 'highpass', freq: 1800, gain: 0.3 });
    this._noise({ dur: 0.07, type: 'highpass', freq: 1400, gain: 0.3, at: 0.12 });
  }

  swap() {
    if (this._ok('swap', 0.05)) this._noise({ dur: 0.1, type: 'bandpass', freq: 900, q: 1.5, gain: 0.25 });
  }

  shove(hit) {
    if (!this._ok('shove', 0.05)) return;
    this._noise({ dur: 0.13, type: 'bandpass', freq: 500, sweepTo: 2600, q: 1.2, gain: 0.35 });
    if (hit) {
      this._noise({ dur: 0.09, type: 'lowpass', freq: 380, gain: 0.8, at: 0.03 });
      this._tone({ f0: 110, f1: 60, dur: 0.08, gain: 0.4, at: 0.03 });
    }
  }

  // --- bodies -------------------------------------------------------------------------

  splat(x, y) {
    if (!this._ok('splat', 0.035)) return;
    const s = this._spatial(x, y);
    if (s.gain < 0.02) return;
    const out = this._out(s.pan, s.gain);
    this._noise({ dur: 0.12, type: 'bandpass', freq: 420 + Math.random() * 200, q: 1.2, gain: 0.45, rate: 0.7 + Math.random() * 0.3, out });
  }

  hurt() {
    if (!this._ok('hurt', 0.12)) return;
    this._noise({ dur: 0.14, type: 'lowpass', freq: 420, gain: 0.7 });
    this._tone({ type: 'sawtooth', f0: 200, f1: 120, dur: 0.14, gain: 0.12, filter: { freq: 700 } });
  }

  death() {
    if (!this._ok('death')) return;
    this._tone({ type: 'sawtooth', f0: 180, f1: 50, dur: 1.4, gain: 0.25, filter: { freq: 600 } });
    this._noise({ dur: 1.2, type: 'lowpass', freq: 300, gain: 0.4 });
  }

  pickup() {
    if (!this._ok('pickup', 0.1)) return;
    this._tone({ f0: 660, dur: 0.08, gain: 0.2 });
    this._tone({ f0: 990, dur: 0.12, gain: 0.2, at: 0.07 });
  }

  win() {
    if (!this._ok('win')) return;
    [523, 659, 784, 1046].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.35, gain: 0.22, at: i * 0.11 }));
  }

  groan(x, y) {
    if (!this._ok('groan', 0.6)) return;
    const s = this._spatial(x, y, 650);
    if (s.gain < 0.03) return;
    const c = this.ctx;
    const out = this._out(s.pan, s.gain * 0.6);
    const base = 85 + Math.random() * 50;
    const dur = 0.7 + Math.random() * 0.6;
    const o = this._tone({ type: 'sawtooth', f0: base, f1: base * 0.8, dur, gain: 0.25, attack: 0.15, out, filter: { type: 'bandpass', freq: 520 + Math.random() * 220, q: 4 } });
    const lfo = c.createOscillator();
    lfo.frequency.value = 5 + Math.random() * 3;
    const lg = c.createGain();
    lg.gain.value = 6;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start();
    lfo.stop(c.currentTime + dur + 0.1);
  }

  snarl(x, y) {
    if (!this._ok('snarl', 0.25)) return;
    const s = this._spatial(x, y, 700);
    if (s.gain < 0.03) return;
    const out = this._out(s.pan, s.gain * 0.55);
    const f = 150 + Math.random() * 90;
    this._tone({ type: 'sawtooth', f0: f, f1: f * 0.7, dur: 0.32, gain: 0.25, attack: 0.03, out, filter: { type: 'bandpass', freq: 900, q: 3 } });
    this._noise({ dur: 0.28, type: 'bandpass', freq: 1300, q: 2, gain: 0.12, out });
  }

  /** The mob is coming: a distant scream chorus + low sting. */
  horde(x, y) {
    if (!this._ok('horde', 1)) return;
    const s = this._spatial(x, y, 4000);
    const out = this._out(s.pan * 0.8, 0.5 + s.gain * 0.5);
    for (let i = 0; i < 6; i++) {
      const f = 260 + Math.random() * 260;
      this._tone({ type: 'sawtooth', f0: f, f1: f * 0.62, dur: 1.6 + Math.random() * 0.8, gain: 0.07, attack: 0.25 + Math.random() * 0.2, at: Math.random() * 0.35, out, filter: { type: 'bandpass', freq: 900 + Math.random() * 500, q: 1.5 } });
    }
    this._noise({ dur: 2.2, type: 'bandpass', freq: 1100, q: 0.8, gain: 0.16, attack: 0.4, out });
    this._tone({ type: 'sawtooth', f0: 55, dur: 3.2, gain: 0.16, attack: 0.6, filter: { freq: 260 } });
    this._tone({ type: 'sawtooth', f0: 55.8, dur: 3.2, gain: 0.16, attack: 0.6, filter: { freq: 260 } });
  }

  alarm(x, y, dur, kind = 'car') {
    if (!this._ok('alarm', 1)) return;
    this.alarmStop();
    const c = this.ctx;
    const s = this._spatial(x, y, 2200);
    const out = this._out(s.pan, 0.25 + s.gain * 0.6);
    const o = c.createOscillator();
    o.type = 'square';
    const t0 = c.currentTime;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    if (kind === 'fire') {
      // Fire alarm: a flat horn, gated on/off.
      o.frequency.setValueAtTime(960, t0);
      for (let t = 0; t < dur - 0.3; t += 0.3) {
        g.gain.setValueAtTime(0.11, t0 + t);
        g.gain.setValueAtTime(0.0001, t0 + t + 0.18);
      }
    } else {
      for (let t = 0, k = 0; t < dur; t += 0.2, k++) o.frequency.setValueAtTime(k % 2 ? 1250 : 950, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
      g.gain.setValueAtTime(0.12, t0 + dur - 0.3);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    this.alarmNodes = { o, g };
  }

  // --- special infected ------------------------------------------------------------

  hunterGrowl(x, y) {
    if (!this._ok('hgrowl', 0.8)) return;
    const s = this._spatial(x, y, 800);
    if (s.gain < 0.03) return;
    const out = this._out(s.pan, s.gain * 0.7);
    for (let i = 0; i < 3; i++) {
      this._noise({ dur: 0.09, type: 'lowpass', freq: 420, gain: 0.35, at: i * 0.13, rate: 0.6, out });
      this._tone({ type: 'sawtooth', f0: 75 + i * 6, f1: 60, dur: 0.1, gain: 0.12, at: i * 0.13, out, filter: { freq: 380 } });
    }
  }

  /** The pounce telegraph: a rising shriek you learn to react to. */
  hunterScreech(x, y) {
    if (!this._ok('hscreech', 0.3)) return;
    const s = this._spatial(x, y, 1100);
    const out = this._out(s.pan, 0.35 + s.gain * 0.65);
    this._tone({ type: 'sawtooth', f0: 520, f1: 1500, dur: 0.6, gain: 0.22, attack: 0.05, out, filter: { type: 'bandpass', freq: 1700, q: 2 } });
    this._tone({ type: 'sawtooth', f0: 540, f1: 1580, dur: 0.6, gain: 0.14, attack: 0.05, out, filter: { type: 'bandpass', freq: 2200, q: 3 } });
    this._noise({ dur: 0.55, type: 'bandpass', freq: 2600, q: 1.5, gain: 0.12, attack: 0.08, out });
  }

  hunterPounce(x, y) {
    if (!this._ok('hpounce', 0.2)) return;
    const s = this._spatial(x, y, 1000);
    const out = this._out(s.pan, 0.4 + s.gain * 0.6);
    this._tone({ type: 'sawtooth', f0: 1100, f1: 520, dur: 0.45, gain: 0.2, out, filter: { type: 'bandpass', freq: 1400, q: 1.5 } });
    this._noise({ dur: 0.35, type: 'bandpass', freq: 700, sweepTo: 2400, q: 1, gain: 0.25, out });
  }

  hunterPin() {
    if (!this._ok('hpin', 0.2)) return;
    this._noise({ dur: 0.2, type: 'lowpass', freq: 320, gain: 0.9 });
    this._tone({ f0: 90, f1: 40, dur: 0.22, gain: 0.7 });
    this._tone({ type: 'sawtooth', f0: 900, f1: 400, dur: 0.5, gain: 0.18, filter: { type: 'bandpass', freq: 1200, q: 2 } });
  }

  hunterDie(x, y) {
    if (!this._ok('hdie', 0.2)) return;
    const s = this._spatial(x, y, 900);
    const out = this._out(s.pan, 0.3 + s.gain * 0.7);
    this._tone({ type: 'sawtooth', f0: 700, f1: 160, dur: 0.6, gain: 0.18, out, filter: { type: 'bandpass', freq: 900, q: 1.5 } });
  }

  claw() {
    if (!this._ok('claw', 0.08)) return;
    this._noise({ dur: 0.07, type: 'highpass', freq: 1600, gain: 0.3, rate: 0.8 + Math.random() * 0.4 });
    this._noise({ dur: 0.08, type: 'lowpass', freq: 500, gain: 0.35, at: 0.02 });
  }

  struggle() {
    if (!this._ok('struggle', 0.04)) return;
    this._noise({ dur: 0.08, type: 'lowpass', freq: 380, gain: 0.5 });
    this._tone({ f0: 140, f1: 80, dur: 0.07, gain: 0.25 });
  }

  deadstop() {
    if (!this._ok('deadstop', 0.1)) return;
    this._noise({ dur: 0.12, type: 'lowpass', freq: 520, gain: 0.95 });
    this._tone({ f0: 160, f1: 55, dur: 0.14, gain: 0.6 });
    this._noise({ dur: 0.05, type: 'highpass', freq: 3000, gain: 0.25 });
  }

  thud(x, y) {
    if (!this._ok('thud', 0.1)) return;
    const s = this._spatial(x, y, 800);
    if (s.gain < 0.03) return;
    this._noise({ dur: 0.14, type: 'lowpass', freq: 300, gain: 0.7, out: this._out(s.pan, s.gain) });
  }

  tankRoar(x, y, size = 1) {
    if (!this._ok('troar', 0.5)) return;
    const s = this._spatial(x, y, 2600);
    const out = this._out(s.pan * 0.7, (0.45 + s.gain * 0.55) * size);
    const dur = 0.9 + size * 0.6;
    this._tone({ type: 'sawtooth', f0: 110, f1: 48, dur, gain: 0.5, attack: 0.08, out, filter: { freq: 520, q: 2 } });
    this._tone({ type: 'sawtooth', f0: 116, f1: 51, dur, gain: 0.35, attack: 0.1, out, filter: { freq: 700, q: 1 } });
    this._noise({ dur, type: 'lowpass', freq: 600, gain: 0.45, attack: 0.1, rate: 0.5, out });
  }

  tankGrunt(x, y) {
    if (!this._ok('tgrunt', 0.3)) return;
    const s = this._spatial(x, y, 1200);
    this._tone({ type: 'sawtooth', f0: 95, f1: 70, dur: 0.3, gain: 0.4, out: this._out(s.pan, 0.3 + s.gain * 0.7), filter: { freq: 450 } });
  }

  tankStep(x, y) {
    if (!this._ok('tstep', 0.15)) return;
    const s = this._spatial(x, y, 900);
    if (s.gain < 0.02) return;
    const out = this._out(s.pan, s.gain);
    this._tone({ f0: 58, f1: 32, dur: 0.16, gain: 0.85, out });
    this._noise({ dur: 0.09, type: 'lowpass', freq: 200, gain: 0.4, out });
  }

  tankPunch(hit) {
    if (!this._ok('tpunch', 0.1)) return;
    this._noise({ dur: 0.18, type: 'bandpass', freq: 400, sweepTo: 1600, q: 1, gain: 0.3 });
    if (hit) {
      this._noise({ dur: 0.25, type: 'lowpass', freq: 260, gain: 1 });
      this._tone({ f0: 85, f1: 28, dur: 0.3, gain: 0.9 });
    }
  }

  tankDie(x, y) {
    if (!this._ok('tdie', 1)) return;
    const s = this._spatial(x, y, 2000);
    const out = this._out(s.pan * 0.6, 0.6 + s.gain * 0.4);
    this._tone({ type: 'sawtooth', f0: 90, f1: 30, dur: 2, gain: 0.5, attack: 0.05, out, filter: { freq: 400 } });
    this._noise({ dur: 1.4, type: 'lowpass', freq: 350, gain: 0.5, out });
  }

  rockThrow(x, y) {
    if (!this._ok('rthrow', 0.2)) return;
    const s = this._spatial(x, y, 1400);
    this._noise({ dur: 0.45, type: 'bandpass', freq: 260, sweepTo: 900, q: 1.2, gain: 0.5, out: this._out(s.pan, 0.35 + s.gain * 0.65) });
  }

  rockShatter(x, y) {
    if (!this._ok('rshatter', 0.06)) return;
    const s = this._spatial(x, y, 1200);
    const out = this._out(s.pan, 0.25 + s.gain * 0.75);
    this._noise({ dur: 0.3, type: 'lowpass', freq: 1400, gain: 0.8, rate: 0.7, out });
    this._tone({ f0: 120, f1: 45, dur: 0.18, gain: 0.5, out });
  }

  /** Tank theme: a driving low ostinato + kick for as long as it lives. */
  tankMusic(on) {
    if (!this.ctx) return;
    if (on) {
      if (this.music) return;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.55, this.ctx.currentTime + 1.2);
      g.connect(this.master);
      this.music = { out: g, next: this.ctx.currentTime + 0.1, step: 0 };
      this.music.timer = setInterval(() => this._musicTick(), 60);
    } else if (this.music) {
      const m = this.music;
      this.music = null;
      clearInterval(m.timer);
      const t = this.ctx.currentTime;
      m.out.gain.cancelScheduledValues(t);
      m.out.gain.setValueAtTime(Math.max(0.0001, m.out.gain.value), t);
      m.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      setTimeout(() => m.out.disconnect(), 1800);
    }
  }

  _musicTick() {
    const m = this.music;
    if (!m || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (m.next < now - 0.1) m.next = now + 0.05; // tab was throttled: skip, don't burst
    const step = 60 / 150 / 2; // eighth notes at 150 bpm
    const bass = [41.2, 41.2, 49, 41.2, 55, 41.2, 49, 36.7]; // E E G E A E G D
    while (m.next < now + 0.25) {
      const i = m.step % 8;
      const at = Math.max(0, m.next - now);
      this._tone({ type: 'sawtooth', f0: bass[i], dur: step * 0.9, gain: 0.32, attack: 0.01, at, out: m.out, filter: { freq: 240, q: 4 } });
      if (i === 0 || i === 3 || i === 4 || i === 6) this._tone({ f0: 95, f1: 38, dur: 0.16, gain: 0.7, at, out: m.out });
      if (i === 2 || i === 6) this._noise({ dur: 0.1, type: 'bandpass', freq: 1800, q: 0.8, gain: 0.18, at, out: m.out });
      if (m.step % 32 === 0) this._tone({ type: 'sawtooth', f0: 82.4, dur: step * 7, gain: 0.12, attack: 0.3, at, out: m.out, filter: { freq: 900 } });
      m.next += step;
      m.step++;
    }
  }

  alarmStop() {
    if (!this.alarmNodes || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.alarmNodes.g.gain.cancelScheduledValues(t);
      this.alarmNodes.g.gain.setValueAtTime(0.0001, t + 0.02);
      this.alarmNodes.o.stop(t + 0.05);
    } catch {
      // already stopped
    }
    this.alarmNodes = null;
  }
}
