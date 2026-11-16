// Strays: the beeper. A pocket toy has one little speaker: square waves,
// a bit of hiss, and short tunes. Everything is synthesised; no files.

const NOTE = { C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568, A6: 1760, C7: 2093 };

export class Sfx {
  constructor(tuning) {
    this.tuning = tuning;
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.played = []; // names, for the tests and the debug hook
  }

  /** Browsers only allow sound after a touch: call this from one. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < len; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (seed / 0x3fffffff - 1) * 0.9;
        }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  get on() {
    return !!(this.ctx && this.tuning.sound);
  }

  /** One beep. `at` is seconds from now; `to` slides the pitch. */
  tone(freq, dur, { type = 'square', vol = 0.16, to = null, at = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.005, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  /** A burst of hiss, through a filter. */
  hiss(dur, { vol = 0.14, at = 0, freq = 1800, to = null, q = 0.8, type = 'bandpass' } = {}) {
    if (!this.on) return;
    const c = this.ctx;
    const t0 = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** A little tune: [[note, beats], ...] at `bpm`. */
  tune(notes, { bpm = 480, type = 'square', vol = 0.13, at = 0 } = {}) {
    let t = at;
    const beat = 60 / bpm;
    for (const [n, beats] of notes) {
      if (n) this.tone(typeof n === 'number' ? n : NOTE[n], beats * beat * 0.92, { type, vol, at: t });
      t += beats * beat;
    }
    return t;
  }

  play(name, o = {}) {
    this.played.push(name);
    if (this.played.length > 60) this.played.shift();
    if (!this.on) return;
    switch (name) {
      case 'tap':
        this.tone(990, 0.03, { vol: 0.06 });
        break;
      case 'key':
        this.hiss(0.03, { vol: 0.12, freq: 900 });
        this.tone(196, 0.05, { vol: 0.1 });
        break;
      case 'type':
        this.tone(1480, 0.012, { vol: 0.025 });
        break;
      case 'chirp': // somebody wants something
        this.tune([['A6', 1], [0, 0.5], ['A6', 1], [0, 0.5], ['C7', 1.5]], { bpm: 900, vol: 0.07 });
        break;
      case 'chomp':
        this.hiss(0.05, { vol: 0.16, freq: 700 });
        this.tone(170, 0.05, { vol: 0.09, to: 110 });
        break;
      case 'heart': {
        const steps = [784, 880, 988, 1047, 1175, 1319, 1480, 1568];
        this.tone(steps[Math.min(o.i || 0, steps.length - 1)], 0.09, { type: 'triangle', vol: 0.2 });
        this.tone(steps[Math.min(o.i || 0, steps.length - 1)] * 2, 0.05, { vol: 0.04, at: 0.02 });
        break;
      }
      case 'hug':
        this.tune([['E5', 1], ['G5', 1], ['C6', 2]], { bpm: 600, type: 'triangle', vol: 0.2 });
        break;
      case 'patch':
        this.tune([['E5', 1], ['A5', 1], ['E6', 1.5]], { bpm: 720, vol: 0.1 });
        break;
      case 'zip':
        this.hiss(0.26, { vol: 0.13, freq: 500, to: 4200, q: 3 });
        for (let i = 0; i < 6; i++) this.tone(300 + i * 90, 0.02, { vol: 0.05, at: i * 0.04 });
        break;
      case 'pop':
        this.tone(380, 0.07, { vol: 0.14, to: 980 });
        break;
      case 'ready': // the heart bar is full
        this.tune([['C6', 1], ['E6', 1], ['G6', 1], ['C7', 2]], { bpm: 840, vol: 0.09 });
        break;
      case 'flash':
        this.tone(440 * Math.pow(1.19, o.i || 0), 0.07, { vol: 0.1 });
        break;
      case 'reveal': {
        const tunes = {
          common: [['C5', 1], ['E5', 1], ['G5', 1], ['C6', 3]],
          rare: [['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['E6', 1], ['G6', 3]],
          epic: [['C5', 1], ['G5', 1], ['C6', 1], ['E6', 1], ['G6', 1], ['E6', 1], ['G6', 1], ['C7', 4]],
          secret: [['E5', 1], ['B4', 1], ['E5', 1], ['G5', 1], ['B5', 1], ['E6', 1], ['B5', 1], ['E6', 1], ['G6', 4]],
        };
        const end = this.tune(tunes[o.rarity] || tunes.common, { bpm: 520, vol: 0.13 });
        this.tune([['C4', 2], ['G4', 2], ['C5', 4]], { bpm: 520, type: 'triangle', vol: 0.16 });
        if (o.rarity && o.rarity !== 'common') this.hiss(0.5, { vol: 0.05, freq: 6000, at: end - 0.3, q: 2 });
        break;
      }
      case 'hero':
        this.tune([['G4', 1], ['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 4]], { bpm: 460, vol: 0.13 });
        this.tune([['C4', 3], ['E4', 3], ['G4', 4]], { bpm: 460, type: 'triangle', vol: 0.18 });
        break;
      case 'open':
        this.hiss(0.09, { vol: 0.2, freq: 500 });
        this.hiss(0.09, { vol: 0.2, freq: 380, at: 0.13 });
        this.tone(120, 0.08, { vol: 0.12, to: 70 });
        this.tune([['G5', 1], ['C6', 1], ['E6', 2]], { bpm: 720, vol: 0.1, at: 0.3 });
        break;
      case 'ask':
        this.tune([['E5', 1], ['A5', 1.5]], { bpm: 720, vol: 0.09 });
        break;
      case 'nope':
        this.tone(150, 0.09, { vol: 0.12 });
        this.tone(120, 0.12, { vol: 0.12, at: 0.11 });
        break;
      case 'bonk':
        this.tone(240, 0.1, { vol: 0.18, to: 70 });
        this.hiss(0.06, { vol: 0.16, freq: 1200 });
        this.tone(700, 0.06, { vol: 0.08, at: 0.07, to: 1400 });
        break;
      case 'can':
        this.tone(1568, 0.035, { vol: 0.09 });
        this.tone(2093, 0.06, { vol: 0.09, at: 0.04 });
        break;
      case 'canOut':
        this.tone(1175, 0.03, { vol: 0.07 });
        break;
      case 'step':
        this.tone(140, 0.02, { vol: 0.05 });
        break;
      case 'hop':
        this.tone(520, 0.05, { vol: 0.06, to: 780 });
        break;
      case 'go':
        this.tune([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['G5', 1], ['C6', 2]], { bpm: 640, vol: 0.11 });
        break;
      case 'great':
        this.tune([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['E6', 1], ['C6', 1], ['E6', 3]], { bpm: 560, vol: 0.12 });
        break;
      case 'good':
        this.tune([['C5', 1], ['E5', 1], ['G5', 2], ['E5', 1], ['G5', 3]], { bpm: 560, vol: 0.11 });
        break;
      case 'rough':
        this.tune([['E5', 1.5], ['D5', 1.5], ['C5', 1.5], ['A4', 3]], { bpm: 420, vol: 0.11 });
        break;
      case 'ouch':
        this.tone(330, 0.12, { vol: 0.14, to: 160 });
        this.hiss(0.08, { vol: 0.12, freq: 900 });
        break;
      case 'wipe':
        this.hiss(0.22, { vol: 0.06, freq: 800, to: 3200, q: 2 });
        break;
      case 'zombie':
        this.tone(96, 0.34, { type: 'sawtooth', vol: 0.07, to: 74 });
        break;
      case 'follow':
        this.tune([['G5', 1], ['B5', 1], ['D6', 1], ['G6', 2]], { bpm: 600, type: 'triangle', vol: 0.18 });
        break;
      case 'page':
        this.hiss(0.08, { vol: 0.1, freq: 2600, to: 1200 });
        break;
      case 'boot':
        this.tune([['C6', 1], ['C7', 2]], { bpm: 480, vol: 0.1 });
        break;
      case 'snore':
        this.tone(110, 0.2, { type: 'triangle', vol: 0.06, to: 82 });
        break;
      case 'full': // twelve somebodies, twelve heroes
        this.tune(
          [['C5', 1], ['C5', 1], ['G5', 2], ['E5', 1], ['G5', 1], ['C6', 2], ['G5', 1], ['C6', 1], ['E6', 2], ['C6', 1], ['E6', 1], ['G6', 4]],
          { bpm: 440, vol: 0.12 },
        );
        this.tune([['C4', 4], ['E4', 4], ['G4', 4], ['C5', 6]], { bpm: 440, type: 'triangle', vol: 0.18 });
        break;
      default:
        break;
    }
  }
}

/** A short buzz, where the phone can. */
export function buzz(pattern, on = true) {
  if (!on) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* no motor: fine */
  }
}
