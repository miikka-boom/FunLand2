// UI sounds, synthesised with WebAudio (nothing to download), plus a quiet
// fire crackle bed. unlock() must run from a user gesture (iOS).

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.last = new Map();
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._crackle();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
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

  _ok(key, gap = 0.03) {
    if (!this.ctx || this.ctx.state !== 'running' || this.volume <= 0) return false;
    const t = this.ctx.currentTime;
    if (t - (this.last.get(key) || -1) < gap) return false;
    this.last.set(key, t);
    return true;
  }

  _tone(f0, f1, dur, { type = 'sine', gain = 0.3, at = 0, attack = 0.005 } = {}) {
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
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.3, at = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _crackle() {
    // Quiet fire bed: filtered noise plus random pops.
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = c.createGain();
    g.gain.value = 0.025;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    const pop = () => {
      if (this.ctx && this.ctx.state === 'running' && this.volume > 0) this._noise(0.03, { freq: 2500 + Math.random() * 2500, q: 2, gain: 0.02 + Math.random() * 0.03 });
      setTimeout(pop, 120 + Math.random() * 600);
    };
    pop();
  }

  play(name) {
    if (!this._ok(name, name === 'coin' ? 0.035 : 0.05)) return;
    const T = (...a) => this._tone(...a);
    switch (name) {
      case 'tap':
        T(900, 700, 0.05, { type: 'triangle', gain: 0.12 });
        break;
      case 'open':
        this._noise(0.12, { freq: 900, q: 0.8, gain: 0.08 });
        T(420, 640, 0.09, { type: 'triangle', gain: 0.07 });
        break;
      case 'error':
        T(160, 120, 0.16, { type: 'square', gain: 0.07 });
        break;
      case 'coin':
        T(1320 + Math.random() * 120, 1760, 0.07, { type: 'triangle', gain: 0.09 });
        break;
      case 'collect':
        T(660, null, 0.08, { type: 'triangle', gain: 0.16 });
        T(990, null, 0.12, { type: 'triangle', gain: 0.14, at: 0.06 });
        break;
      case 'gems':
        for (let i = 0; i < 4; i++) T(1500 + i * 260, null, 0.12, { type: 'sine', gain: 0.07, at: i * 0.045 });
        break;
      case 'build':
        for (let i = 0; i < 3; i++) this._noise(0.05, { freq: 1700, q: 3, gain: 0.25, at: i * 0.13 });
        break;
      case 'done':
        [523, 659, 784, 1047].forEach((f, i) => T(f, null, 0.18, { type: 'triangle', gain: 0.12, at: i * 0.07 }));
        break;
      case 'levelup':
        [392, 523, 659, 784].forEach((f, i) => T(f, null, 0.35, { type: 'sawtooth', gain: 0.06, at: i * 0.1 }));
        [784, 1047, 1319].forEach((f, i) => T(f, null, 0.6, { type: 'triangle', gain: 0.1, at: 0.42 + i * 0.05 }));
        break;
      case 'crate':
        this._noise(0.18, { freq: 500, q: 0.7, gain: 0.25 });
        T(300, 900, 0.18, { type: 'triangle', gain: 0.12, at: 0.05 });
        for (let i = 0; i < 3; i++) T(1400 + i * 300, null, 0.1, { gain: 0.07, at: 0.2 + i * 0.05 });
        break;
      case 'runStart':
        T(90, 260, 0.6, { type: 'sawtooth', gain: 0.06 });
        this._noise(0.5, { freq: 400, gain: 0.05 });
        break;
      case 'tick':
        T(1200, 900, 0.04, { type: 'square', gain: 0.04 });
        break;
      case 'thud':
        T(120, 50, 0.2, { gain: 0.3 });
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, null, 0.25, { type: 'triangle', gain: 0.11, at: i * 0.08 }));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => T(f, f * 0.97, 0.3, { type: 'sawtooth', gain: 0.05, at: i * 0.14 }));
        break;
      case 'quest':
        [659, 880, 1175].forEach((f, i) => T(f, null, 0.2, { type: 'triangle', gain: 0.12, at: i * 0.08 }));
        break;
      case 'star1':
      case 'star2':
      case 'star3': {
        const n = Number(name.slice(4));
        T(660 * Math.pow(1.26, n - 1), null, 0.28, { type: 'triangle', gain: 0.16 });
        T(1320 * Math.pow(1.26, n - 1), null, 0.18, { type: 'sine', gain: 0.06, at: 0.02 });
        break;
      }
      case 'upgrade':
        T(330, 990, 0.22, { type: 'sawtooth', gain: 0.05 });
        [784, 988, 1319].forEach((f, i) => T(f, null, 0.16, { type: 'triangle', gain: 0.1, at: 0.06 + i * 0.05 }));
        break;
      case 'unlock':
        [523, 659, 784, 1047].forEach((f, i) => T(f, null, 0.4, { type: 'triangle', gain: 0.1, at: i * 0.09 }));
        [1568, 2093].forEach((f, i) => T(f, null, 0.5, { type: 'sine', gain: 0.05, at: 0.4 + i * 0.06 }));
        break;
      case 'drive':
        T(70, 140, 1.2, { type: 'sawtooth', gain: 0.05 });
        this._noise(1.2, { freq: 300, q: 0.6, gain: 0.04 });
        break;
      case 'reclaim':
        [392, 494, 587, 784].forEach((f) => T(f, null, 1.4, { type: 'triangle', gain: 0.06, attack: 0.08 }));
        break;
      case 'knock':
        for (let i = 0; i < 3; i++) this._noise(0.06, { freq: 260, q: 1.4, gain: 0.35, at: i * 0.16 });
        break;
      case 'join':
        [392, 523, 659].forEach((f, i) => T(f, null, 0.5, { type: 'triangle', gain: 0.1, at: i * 0.08 }));
        T(1047, null, 0.6, { type: 'sine', gain: 0.05, at: 0.26 });
        break;
      case 'bye':
        [523, 440, 349].forEach((f, i) => T(f, null, 0.4, { type: 'triangle', gain: 0.07, at: i * 0.14 }));
        break;
      case 'heal':
        [659, 784, 988].forEach((f, i) => T(f, f * 1.01, 0.3, { type: 'sine', gain: 0.08, at: i * 0.06 }));
        break;
      default:
        break;
    }
  }
}
