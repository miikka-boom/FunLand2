// Thrill Hill sound effects, synthesised with WebAudio (no files).
//
//   const sfx = new Sfx();
//   sfx.setVolume(0.7);
//   button.onclick = () => { sfx.unlock(); sfx.play('tap'); };
//
// Nothing here touches `window` until unlock() is called, and every call fails
// silently where WebAudio is missing (node tests, old browsers). The context is
// created on the first unlock() (call it from a user gesture; it is cheap to call
// often). play() before that is a no-op. Identical sounds closer than 30 ms are
// dropped, and a master compressor keeps stacked sounds from clipping.
//
// play(name, opts): see SOUND_NAMES. Options used:
//   knock {n: 1..3}   glow {grade: 1..3}   coin {pitch: 0..1}   gem {pitch: 0..1}
//   flip {rarity: 'rookie'|'veteran'|'hero'|'legend'}   badge {big: bool}   cheer {level: 1..3}

const MIN_GAP = 0.03; // seconds between two plays of the same sound
const MAX_VOICES = 180; // oscillators/noise sources alive at once

const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => (v > 1 ? 1 : v < 0 || !(v >= 0) ? 0 : v);
/** A major pentatonic run from `base` (midi), i-th step. */
const PENTA = [0, 2, 4, 7, 9];
const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];

// --- A tiny voice kit bound to one context and one output ------------------------------------

class Kit {
  constructor(sfx) {
    this.sfx = sfx;
    this.ctx = sfx.ctx;
    this.out = sfx.bus;
  }

  _track(node, stopAt) {
    const sfx = this.sfx;
    sfx.voices++;
    node.onended = () => {
      sfx.voices--;
      try {
        node.disconnect();
      } catch (e) {
        /* already gone */
      }
    };
    node.stop(stopAt);
  }

  /** Gain envelope: linear attack, then either an exponential decay or a hold and release. */
  _env(t, dur, g, o) {
    const ctx = this.ctx;
    const amp = ctx.createGain();
    const p = amp.gain;
    const a = o.attack ?? 0.004;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(g, t + a);
    if (o.hold != null) {
      const r = o.release ?? 0.08;
      const end = Math.max(t + a + 0.005, t + dur - r);
      p.setValueAtTime(g, end);
      p.exponentialRampToValueAtTime(0.0001, t + dur);
    } else p.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
    return amp;
  }

  _filter(fo, t, dur) {
    const fl = this.ctx.createBiquadFilter();
    fl.type = fo.type || 'lowpass';
    fl.frequency.setValueAtTime(fo.freq, t);
    if (fo.to) fl.frequency.exponentialRampToValueAtTime(fo.to, t + (fo.time ?? dur));
    if (fo.back) fl.frequency.exponentialRampToValueAtTime(fo.back, t + dur);
    fl.Q.value = fo.q ?? 0.8;
    return fl;
  }

  /**
   * One oscillator note. o: type, gain, attack, hold (any value = sustained),
   * release, to (end frequency), slide (seconds for the glide), filter {type,
   * freq, to, time, back, q}, vib {rate, depth (Hz)}, detune (cents).
   */
  tone(freq, t, dur, o = {}) {
    if (this.sfx.voices >= MAX_VOICES) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.slide ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const amp = this._env(t, dur, o.gain ?? 0.2, o);
    let head = osc;
    if (o.filter) {
      const fl = this._filter(o.filter, t, dur);
      osc.connect(fl);
      head = fl;
    }
    head.connect(amp);
    amp.connect(this.out);
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vib.rate ?? 6;
      depth.gain.value = o.vib.depth ?? 6;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      this._track(lfo, t + dur + 0.05);
    }
    osc.start(t);
    this._track(osc, t + dur + 0.05);
  }

  /** Filtered white noise. o: gain, attack, hold, release, filter (as tone; default bandpass 1200). */
  noise(t, dur, o = {}) {
    if (this.sfx.voices >= MAX_VOICES || !this.sfx.noiseBuf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.sfx.noiseBuf;
    src.loop = true;
    const fl = this._filter(o.filter || { type: 'bandpass', freq: 1200, q: 1 }, t, dur);
    const amp = o.hits ? ctx.createGain() : this._env(t, dur, o.gain ?? 0.2, o);
    src.connect(fl);
    fl.connect(amp);
    amp.connect(this.out);
    if (o.hits) {
      // A train of hits on one source: [[time, gain, decay], ...].
      const p = amp.gain;
      p.setValueAtTime(0.0001, t);
      for (const [ht, hg, hd] of o.hits) {
        p.setValueAtTime(0.0001, ht);
        p.linearRampToValueAtTime(hg, ht + 0.003);
        p.exponentialRampToValueAtTime(0.0001, ht + hd);
      }
    }
    src.start(t, Math.random() * 1.5);
    this._track(src, t + dur + 0.05);
    return src;
  }

  /** A small bell: a sine with two quiet inharmonic partials. */
  bell(freq, t, dur = 0.6, g = 0.12) {
    this.tone(freq, t, dur, { gain: g, attack: 0.002 });
    this.tone(freq * 2.76, t, dur * 0.45, { gain: g * 0.28, attack: 0.002 });
    this.tone(freq * 5.4, t, dur * 0.22, { gain: g * 0.12, attack: 0.002 });
  }

  /** A soft brass-ish note: two detuned saws through a lowpass that opens. */
  brass(freq, t, dur, g = 0.08) {
    const filter = { type: 'lowpass', freq: freq * 1.2, to: freq * 5, time: Math.min(0.08, dur * 0.4), back: freq * 2.5, q: 1.2 };
    this.tone(freq, t, dur, { type: 'sawtooth', gain: g, attack: 0.02, hold: 1, release: Math.min(0.15, dur * 0.4), filter, detune: -6 });
    this.tone(freq, t, dur, { type: 'sawtooth', gain: g * 0.7, attack: 0.025, hold: 1, release: Math.min(0.15, dur * 0.4), filter, detune: 7 });
    this.tone(freq, t, dur, { type: 'triangle', gain: g * 0.9, attack: 0.015, hold: 1, release: Math.min(0.15, dur * 0.4) });
  }

  /** A plucky chime note (triangle + a quiet octave). */
  pluck(freq, t, dur = 0.25, g = 0.12) {
    this.tone(freq, t, dur, { type: 'triangle', gain: g, attack: 0.003 });
    this.tone(freq * 2, t, dur * 0.5, { gain: g * 0.3, attack: 0.002 });
  }

  /** Twinkly high pings scattered over a window. */
  sparkle(t, span, count, g = 0.04, base = 91) {
    for (let i = 0; i < count; i++) {
      const at = t + (span * i) / Math.max(1, count - 1) + Math.random() * 0.02;
      this.tone(m2f(penta(base, Math.floor(Math.random() * 8))), at, 0.12 + Math.random() * 0.08, { gain: g * (0.6 + Math.random() * 0.4), attack: 0.002 });
    }
  }

  /** A low drum: a sine that drops in pitch, plus a little noise. */
  thump(t, f0 = 120, f1 = 45, dur = 0.22, g = 0.45, click = 0.18) {
    this.tone(f0, t, dur, { gain: g, to: f1, slide: dur * 0.6, attack: 0.002 });
    if (click) this.noise(t, 0.05, { gain: click, filter: { type: 'lowpass', freq: 2200 } });
  }

  /** A cymbal-ish splash. */
  crash(t, dur = 0.9, g = 0.08) {
    this.noise(t, dur, { gain: g, attack: 0.003, filter: { type: 'highpass', freq: 5200, q: 0.5 } });
  }

  /** A noise sweep (whoosh): bandpass from f0 to f1. */
  sweep(t, dur, f0, f1, g = 0.18, q = 1.4) {
    this.noise(t, dur, { gain: g, attack: dur * 0.4, filter: { type: 'bandpass', freq: f0, to: f1, time: dur, q } });
  }
}

// --- The sounds ------------------------------------------------------------------------------

const SOUNDS = {
  tap(k, t) {
    k.tone(1150, t, 0.05, { gain: 0.24, to: 700, attack: 0.002 });
    k.noise(t, 0.015, { gain: 0.07, filter: { type: 'highpass', freq: 4000 } });
  },
  open(k, t) {
    k.sweep(t, 0.22, 380, 2400, 0.2, 1.2);
    k.tone(330, t, 0.2, { gain: 0.1, to: 660, attack: 0.03 });
  },
  close(k, t) {
    k.sweep(t, 0.18, 2200, 420, 0.17, 1.2);
    k.tone(620, t, 0.16, { gain: 0.09, to: 300, attack: 0.02 });
  },
  error(k, t) {
    for (const d of [0, 0.13]) k.tone(150, t + d, 0.1, { type: 'square', gain: 0.1, to: 132, attack: 0.004, hold: 1, release: 0.03, filter: { type: 'lowpass', freq: 900 } });
  },
  knock(k, t, o) {
    const n = Math.max(1, Math.min(3, o.n | 0 || 1));
    const f = 150 * Math.pow(2, (3 * (n - 1)) / 12); // up a minor third per knock
    const v = Math.pow(10, (1.8 * (n - 1)) / 20) * 0.82; // and about 1.8 dB louder per knock
    k.tone(f, t, 0.2 + 0.04 * n, { gain: 0.5 * v, to: f * 0.55, slide: 0.12, attack: 0.002 });
    k.tone(f * 2.3, t, 0.07, { type: 'triangle', gain: 0.14 * v, attack: 0.001 });
    k.noise(t, 0.06, { gain: 0.28 * v, filter: { type: 'bandpass', freq: 800 + 300 * n, q: 1.2 } });
    // A metal ring from the corner caps, brighter on each knock.
    k.tone(1180 * (1 + 0.12 * (n - 1)), t + 0.005, 0.28 + 0.06 * n, { gain: (0.035 + 0.01 * n) * v, attack: 0.001 });
    k.tone(1180 * 1.53 * (1 + 0.12 * (n - 1)), t + 0.005, 0.18, { gain: 0.02 * v, attack: 0.001 });
    if (n === 3) {
      // The last knock lands with a bigger body: a low boom under it and a longer rattle.
      k.thump(t, 95, 42, 0.32, 0.4, 0);
      k.noise(t + 0.02, 0.16, { gain: 0.07, filter: { type: 'bandpass', freq: 520, q: 1.4 } });
    }
  },
  glow(k, t, o) {
    const grade = Math.max(1, Math.min(3, o.grade | 0 || 1));
    if (grade === 1) {
      [72, 76, 79].forEach((m, i) => k.pluck(m2f(m), t + i * 0.05, 0.7, 0.1));
      k.tone(m2f(84), t + 0.15, 0.6, { gain: 0.05, attack: 0.05 });
      k.sparkle(t + 0.12, 0.35, 5, 0.04);
      k.sweep(t, 0.45, 3000, 9000, 0.04, 0.7);
    } else if (grade === 2) {
      [74, 78, 81, 86].forEach((m, i) => k.pluck(m2f(m), t + i * 0.045, 0.9, 0.1));
      [62, 69].forEach((m) => k.tone(m2f(m), t, 0.9, { type: 'triangle', gain: 0.06, attack: 0.05, hold: 1, release: 0.4 }));
      k.bell(m2f(98), t + 0.2, 0.7, 0.06);
      k.sparkle(t + 0.1, 0.55, 8, 0.045);
      k.sweep(t, 0.6, 2500, 10000, 0.05, 0.7);
    } else {
      // Rainbow: an arpeggio fanfare up two octaves, then a held brass chord.
      [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => k.pluck(m2f(m), t + i * 0.055, 0.35, 0.09));
      const c = t + 0.42;
      [60, 64, 67, 72, 76].forEach((m) => k.brass(m2f(m), c, 0.95, 0.045));
      k.thump(c, 110, 50, 0.3, 0.35, 0.12);
      k.crash(c, 1.1, 0.06);
      k.sparkle(c + 0.05, 0.8, 12, 0.045, 96);
    }
  },
  burst(k, t) {
    k.thump(t, 150, 45, 0.28, 0.5, 0.2);
    k.sweep(t, 0.38, 500, 4500, 0.22, 1);
    k.tone(m2f(79), t + 0.05, 0.5, { type: 'triangle', gain: 0.06, attack: 0.02 });
    k.sparkle(t + 0.08, 0.45, 9, 0.045);
  },
  coin(k, t, o) {
    const p = clamp01(o.pitch ?? 0.35);
    const f = m2f(penta(79, Math.round(p * 9))); // G5 up two octaves, pentatonic
    k.tone(f, t, 0.15, { type: 'triangle', gain: 0.46, attack: 0.002 });
    k.tone(f * 2, t + 0.004, 0.09, { gain: 0.17, attack: 0.002 });
    k.tone(f * 3.01, t + 0.004, 0.04, { gain: 0.05, attack: 0.001 });
  },
  gem(k, t, o) {
    const p = clamp01(o.pitch ?? 0.3);
    const f = m2f(93 + Math.round(p * 7));
    k.tone(f, t, 0.4, { gain: 0.24, attack: 0.001 });
    k.tone(f * 1.506, t + 0.012, 0.3, { gain: 0.12, attack: 0.001 });
    k.tone(f * 2.42, t + 0.006, 0.18, { gain: 0.06, attack: 0.001 });
    k.tone(f * 0.5, t, 0.12, { type: 'triangle', gain: 0.09, attack: 0.001 });
    k.noise(t, 0.02, { gain: 0.08, filter: { type: 'highpass', freq: 6000 } });
  },
  badge(k, t, o) {
    const g = o.big ? 1.6 : 1;
    k.noise(t, 0.03, { gain: 0.1 * g, filter: { type: 'bandpass', freq: 3400, q: 1.5 } });
    k.noise(t + 0.05, 0.03, { gain: 0.08 * g, filter: { type: 'bandpass', freq: 3900, q: 1.5 } });
    k.tone(520, t + 0.06, 0.1, { gain: 0.13 * g, to: 900, slide: 0.05, attack: 0.002 });
    if (o.big) k.bell(m2f(88), t + 0.1, 0.4, 0.07);
  },
  ready(k, t) {
    k.thump(t, 115, 48, 0.16, 0.45, 0.25);
    k.bell(m2f(91), t + 0.07, 0.75, 0.12);
    k.bell(m2f(98), t + 0.07, 0.5, 0.05);
  },
  flip(k, t, o) {
    const r = o.rarity || 'rookie';
    if (r === 'rookie') {
      k.tone(380, t, 0.12, { gain: 0.36, to: 760, slide: 0.06, attack: 0.002 });
      k.pluck(m2f(79), t + 0.04, 0.2, 0.08);
      k.noise(t, 0.02, { gain: 0.09, filter: { type: 'highpass', freq: 3000 } });
    } else if (r === 'veteran') {
      k.tone(420, t, 0.08, { gain: 0.16, to: 840, slide: 0.05 });
      k.bell(m2f(88), t + 0.03, 0.6, 0.12);
      k.bell(m2f(95), t + 0.09, 0.55, 0.09);
      k.sweep(t, 0.2, 1500, 5000, 0.06);
    } else if (r === 'hero') {
      k.sweep(t, 0.25, 600, 4000, 0.1);
      [72, 76, 79, 83].forEach((m, i) => k.pluck(m2f(m), t + 0.03 + i * 0.03, 1.0, 0.09));
      [60, 67].forEach((m) => k.tone(m2f(m), t + 0.03, 1.0, { type: 'triangle', gain: 0.06, attack: 0.03, hold: 1, release: 0.4 }));
      k.bell(m2f(96), t + 0.15, 0.7, 0.07);
      k.sparkle(t + 0.1, 0.5, 7, 0.04);
    } else {
      // Legend: a triumphant fanfare with timpani and a cymbal.
      [[67, 0, 0.11], [72, 0.12, 0.11], [76, 0.24, 0.11]].forEach(([m, d, l]) => k.brass(m2f(m), t + d, l, 0.07));
      const c = t + 0.37;
      [60, 67, 72, 76, 79].forEach((m) => k.brass(m2f(m), c, 1.1, 0.05));
      k.thump(t, 98, 60, 0.25, 0.35, 0.1);
      k.thump(c, 98, 50, 0.4, 0.5, 0.15);
      k.crash(c, 1.3, 0.09);
      k.sparkle(c + 0.1, 0.9, 12, 0.045, 96);
    }
  },
  drumroll(k, t) {
    // One noise source, struck faster and louder for 1.2 s, over a low tom swell.
    const hits = [];
    let at = t;
    let i = 0;
    while (at < t + 1.2) {
      const p = (at - t) / 1.2;
      hits.push([at, 0.09 + 0.3 * p * p + (i % 2 ? 0 : 0.035), 0.055]);
      at += 0.062 - 0.03 * p;
      i++;
    }
    k.noise(t, 1.3, { hits, filter: { type: 'bandpass', freq: 2100, q: 0.7 } });
    k.tone(196, t, 1.25, { type: 'triangle', gain: 0.06, attack: 1.0, hold: 1, release: 0.1 });
    k.tone(98, t, 1.25, { gain: 0.08, attack: 1.1, hold: 1, release: 0.1 });
  },
  golden(k, t) {
    // A harp gliss up, then a hushed shimmering chord: "…wait".
    for (let i = 0; i < 10; i++) k.pluck(m2f(penta(81, i)), t + i * 0.032, 0.35, 0.05);
    const c = t + 0.3;
    [81, 88, 95].forEach((m, i) => k.tone(m2f(m), c, 1.1, { gain: 0.05 - i * 0.012, attack: 0.25, hold: 1, release: 0.5, vib: { rate: 7, depth: 4 } }));
    k.sweep(c, 0.9, 4000, 11000, 0.035, 0.8);
    k.sparkle(c + 0.15, 0.7, 8, 0.035, 96);
  },
  moveIn(k, t) {
    [[72, 0], [76, 0.09], [79, 0.18], [84, 0.3]].forEach(([m, d], i) => k.pluck(m2f(m), t + d, i === 3 ? 0.5 : 0.16, 0.12));
    k.bell(m2f(96), t + 0.3, 0.5, 0.05);
  },
  farewell(k, t) {
    k.tone(m2f(79), t, 0.32, { type: 'triangle', gain: 0.12, attack: 0.01 });
    k.tone(m2f(72), t + 0.22, 0.5, { type: 'triangle', gain: 0.12, attack: 0.01 });
    k.tone(m2f(72) * 2, t + 0.22, 0.3, { gain: 0.03 });
  },
  upgrade(k, t) {
    // Two hammer clangs (bright partials, a soft knock under them), then a confetti pop.
    for (const d of [0, 0.17]) {
      const s = d ? 1.06 : 1;
      [[620, 0.07, 0.3], [1580, 0.045, 0.22], [2540, 0.03, 0.16], [3710, 0.018, 0.1]].forEach(([fq, g, l]) => k.tone(fq * s, t + d, l, { gain: g, attack: 0.002 }));
      k.noise(t + d, 0.035, { gain: 0.06, filter: { type: 'highpass', freq: 2500 } });
      k.tone(160 * s, t + d, 0.07, { gain: 0.07, to: 90, attack: 0.002 });
    }
    const p = t + 0.36;
    k.noise(p, 0.12, { gain: 0.12, filter: { type: 'bandpass', freq: 1500, to: 5000, q: 1 } });
    k.tone(320, p, 0.08, { gain: 0.12, to: 960, slide: 0.05 });
    k.sparkle(p + 0.04, 0.3, 5, 0.04);
  },
  levelUp(k, t) {
    [72, 76, 79, 84, 88].forEach((m, i) => {
      k.pluck(m2f(m), t + i * 0.055, 0.24, 0.11);
      k.tone(m2f(m), t + i * 0.055, 0.12, { type: 'square', gain: 0.025, filter: { type: 'lowpass', freq: 2500 } });
    });
    const p = t + 0.3;
    k.tone(400, p, 0.08, { gain: 0.16, to: 1100, slide: 0.05 });
    k.bell(m2f(96), p + 0.02, 0.6, 0.08);
    k.sparkle(p + 0.05, 0.3, 4, 0.035);
  },
  raidStart(k, t) {
    [[67, 0, 0.08], [72, 0.09, 0.08], [76, 0.18, 0.08], [79, 0.27, 0.3]].forEach(([m, d, l]) => {
      k.brass(m2f(m), t + d, l + 0.02, 0.06);
      k.noise(t + d, 0.05, { gain: 0.12, filter: { type: 'bandpass', freq: 2200, q: 0.8 } });
    });
    k.sweep(t, 0.4, 400, 3000, 0.07);
    k.thump(t + 0.27, 110, 55, 0.2, 0.3, 0.08);
  },
  hit(k, t) {
    k.noise(t, 0.08, { gain: 0.35, filter: { type: 'lowpass', freq: 3000 } });
    k.tone(190, t, 0.11, { gain: 0.45, to: 60, slide: 0.08, attack: 0.001 });
    k.noise(t, 0.012, { gain: 0.12, filter: { type: 'highpass', freq: 5000 } });
  },
  poof(k, t) {
    k.noise(t, 0.28, { gain: 0.5, attack: 0.01, filter: { type: 'bandpass', freq: 1500, to: 280, time: 0.24, q: 1 } });
    k.tone(300, t, 0.14, { gain: 0.14, to: 140, attack: 0.005 });
  },
  win(k, t) {
    [[72, 0], [76, 0.1], [79, 0.2]].forEach(([m, d]) => k.brass(m2f(m), t + d, 0.1, 0.07));
    const c = t + 0.32;
    [72, 76, 79, 84].forEach((m) => k.brass(m2f(m), c, 0.6, 0.05));
    k.thump(c, 110, 55, 0.25, 0.3, 0.1);
    k.bell(m2f(96), c + 0.05, 0.6, 0.06);
    k.sparkle(c + 0.1, 0.4, 6, 0.035);
  },
  lose(k, t) {
    // The sad trombone: wah, wah, wah, waaah.
    [[67, 0, 0.26], [66, 0.3, 0.26], [65, 0.6, 0.26], [64, 0.9, 0.62]].forEach(([m, d, l], i) => {
      const f = m2f(m - 12);
      const filter = { type: 'lowpass', freq: f * 1.5, to: f * 6, time: l * 0.35, back: f * 1.4, q: 3 };
      const last = i === 3;
      k.tone(f, t + d, l, { type: 'sawtooth', gain: 0.1, attack: 0.03, hold: 1, release: last ? 0.25 : 0.06, filter, vib: last ? { rate: 6, depth: 5 } : null, to: last ? f * 0.94 : null });
    });
  },
  clutch(k, t) {
    k.noise(t, 0.6, { gain: 0.22, attack: 0.15, filter: { type: 'bandpass', freq: 2600, to: 220, time: 0.58, q: 2 } });
    k.tone(240, t, 0.58, { type: 'triangle', gain: 0.1, to: 70, slide: 0.55, attack: 0.05 });
    const h = t + 0.58;
    k.thump(h, 140, 38, 0.45, 0.6, 0.3);
    k.noise(h, 0.2, { gain: 0.3, filter: { type: 'lowpass', freq: 2800 } });
    k.crash(h, 0.9, 0.09);
  },
  zone(k, t) {
    const chords = [
      [[60, 64, 67, 72], 0, 0.34],
      [[65, 69, 72, 77], 0.38, 0.3],
      [[67, 71, 74, 79], 0.72, 0.3],
      [[72, 76, 79, 84], 1.08, 1.0],
    ];
    for (const [ns, d, l] of chords) ns.forEach((m) => k.brass(m2f(m), t + d, l, 0.04));
    [[84, 0, 0.3], [84, 0.38, 0.14], [86, 0.54, 0.14], [86, 0.72, 0.3], [88, 1.08, 0.95]].forEach(([m, d, l]) => k.pluck(m2f(m), t + d, l + 0.15, 0.08));
    k.thump(t, 98, 55, 0.3, 0.4, 0.1);
    k.thump(t + 1.08, 98, 45, 0.5, 0.55, 0.15);
    k.crash(t + 1.08, 1.4, 0.1);
    k.sparkle(t + 1.15, 1.0, 14, 0.04, 96);
  },
  cheer(k, t, o) {
    // A crowd: three formant-ish noise bands swelling, plus "woo"s and claps.
    // opts.level 1..3: louder, longer and busier at each Glow-Up grade.
    const lv = Math.max(1, Math.min(3, o.level | 0 || 1));
    const g = [1, 1.35, 1.8][lv - 1];
    const len = 0.9 + 0.25 * lv;
    [[480, 1.2, 0.24], [1150, 1.5, 0.18], [2500, 2, 0.09]].forEach(([fq, q, gn]) => k.noise(t, len, { gain: gn * g, attack: 0.16, hold: 1, release: 0.45, filter: { type: 'bandpass', freq: fq, q } }));
    for (let i = 0; i < 3 + 2 * lv; i++) {
      const f = 480 + Math.random() * 380;
      k.tone(f, t + 0.05 + Math.random() * 0.25 * lv, 0.5 + Math.random() * 0.2, { type: 'triangle', gain: 0.02 * g, to: f * 1.35, slide: 0.3, attack: 0.08, vib: { rate: 5 + Math.random() * 3, depth: 8 } });
    }
    const claps = 4 + 4 * lv;
    for (let i = 0; i < claps; i++) k.noise(t + 0.1 + (i * (len - 0.35)) / claps + Math.random() * 0.04, 0.03, { gain: 0.06 * g, filter: { type: 'bandpass', freq: 2000 + Math.random() * 1500, q: 2 } });
  },
  bonk(k, t) {
    k.tone(640, t, 0.14, { gain: 0.45, to: 170, slide: 0.12, attack: 0.001 });
    k.tone(1280, t, 0.06, { type: 'square', gain: 0.04, to: 400, filter: { type: 'lowpass', freq: 2500 } });
    k.noise(t, 0.02, { gain: 0.12, filter: { type: 'bandpass', freq: 1800, q: 2 } });
  },
  milestone(k, t) {
    k.bell(m2f(88), t, 0.5, 0.13);
    k.bell(m2f(93), t + 0.13, 0.7, 0.13);
  },
  whoosh(k, t) {
    k.sweep(t, 0.26, 600, 2800, 0.3, 1.5);
  },
  // Last Stop: placing and the town.
  thud(k, t) {
    k.thump(t, 150, 50, 0.2, 0.42, 0.12);
    k.noise(t, 0.08, { gain: 0.08, filter: { type: 'lowpass', freq: 900 } });
    k.bell(m2f(84), t + 0.06, 0.35, 0.06);
  },
  lift(k, t) {
    k.tone(420, t, 0.12, { gain: 0.14, to: 820, attack: 0.004 });
  },
  tick(k, t, o) {
    k.tone(1800, t, 0.025, { gain: o && o.quiet ? 0.05 : 0.1, attack: 0.001 });
  },
  pop(k, t) {
    k.tone(520, t, 0.08, { gain: 0.3, to: 1400, attack: 0.002 });
    k.noise(t, 0.05, { gain: 0.1, filter: { type: 'bandpass', freq: 2500, q: 1.5 } });
  },
  bloom(k, t) {
    for (let i = 0; i < 7; i++) k.pluck(m2f(penta(72, i)), t + i * 0.12, 0.3, 0.07);
  },
  wish(k, t) {
    k.bell(m2f(84), t, 0.4, 0.1);
    k.bell(m2f(88), t + 0.1, 0.4, 0.1);
    k.bell(m2f(91), t + 0.2, 0.7, 0.12);
  },
};

/** Every sound name play() knows. */
export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));

export class Sfx {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.noiseBuf = null;
    this.vol = 0.7;
    this.voices = 0;
    this.held = false; // suspend() was called: stay quiet until resume()
    this.last = Object.create(null);
  }

  /** Create (first call) or wake the audio context. Call from a user gesture; safe to call often. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
        if (!AC) return;
        const ctx = new AC();
        this._attach(ctx);
        // iOS wants a sound started inside the gesture: a silent blip.
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      }
      if (!this.held && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      /* no audio: stay silent */
    }
  }

  /**
   * Build the master chain (volume bus → compressor → destination) and the noise buffer
   * on a context. unlock() uses it; tests and the level meter can pass an OfflineAudioContext.
   */
  _attach(ctx) {
    const bus = ctx.createGain();
    bus.gain.value = this._gain(this.vol);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    bus.connect(comp);
    comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.bus = bus;
    this.noiseBuf = buf;
    this.voices = 0;
    this.last = Object.create(null);
  }

  _gain(v) {
    return Math.pow(clamp01(v), 1.5) * 0.9;
  }

  /** Master volume, 0..1. */
  setVolume(v) {
    this.vol = clamp01(+v);
    try {
      if (this.bus) this.bus.gain.setTargetAtTime(this._gain(this.vol), this.ctx.currentTime, 0.02);
    } catch (e) {
      /* ignore */
    }
  }

  /** Play a sound by name (see SOUND_NAMES). Unknown names and a locked context are ignored. */
  play(name, opts = {}) {
    try {
      const fn = SOUNDS[name];
      const ctx = this.ctx;
      if (!fn || !ctx || this.held || this.vol <= 0 || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (this.last[name] != null && now - this.last[name] < MIN_GAP) return;
      if (this.voices >= MAX_VOICES) return;
      this.last[name] = now;
      fn(new Kit(this), now + 0.005, opts || {});
    } catch (e) {
      /* never let a sound break the game */
    }
  }

  /** Pause all audio (app hidden). */
  suspend() {
    this.held = true;
    try {
      if (this.ctx && this.ctx.state === 'running') {
        const p = this.ctx.suspend();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      /* ignore */
    }
  }

  /** Undo suspend(). */
  resume() {
    this.held = false;
    try {
      if (this.ctx && this.ctx.state === 'suspended') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      /* ignore */
    }
  }
}
