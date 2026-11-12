// Long Haul sound effects, synthesised with WebAudio: no audio files.
//
//   const sfx = new Sfx();
//   sfx.setVolume(0.6);
//   button.onclick = () => { sfx.unlock(); sfx.play('tap'); };
//
// Nothing global is touched until unlock(), which has to come from a tap or a
// key press (browsers keep sound off until then; it is cheap, call it on every
// one). Before that, and wherever WebAudio is missing (node, the tests), every
// call quietly does nothing. The same sound again within 30 ms is dropped, new
// sounds are dropped while too many voices are alive, a compressor in front of
// the volume keeps stacked sounds from clipping, and every node is stopped and
// disconnected when its voice ends. Nothing loops.
//
// play(name, opts): the names are SOUND_NAMES. The ones that take options:
//   shot       { kind: 'pistol' | 'rifle' | 'staple' | 'thump' }
//   hit        { heavy: bool }
//   star       { n: 1 | 2 | 3 }            higher for each star
//   crateOpen  { tier: 'wood' | 'steel' | 'gold' }
//   supplies   { pitch: 0..1 }             one can; a run of them climbs
//   token      { pitch: 0..1 }
//   voice      { pitch: 0..1 }             one syllable of a voice on the radio
//   reveal     { rarity: 'common' | 'rare' | 'epic' | 'legendary' }
//   power      { pitch: 0..1 }             one tick of a number counting up
// The rest take none: tap, open, close, deny, toast, engine, bonk, down, fail,
// crateTap, radioFound, static, callAnswered, join, ready, levelUp, swap, area,
// ferry, gift, eyes.
//
// Levels: a voice's `g` is its peak before the master chain. Everyday sounds
// stay under about 0.16 in total, where the compressor leaves them alone; only
// the big moments (a gold crate, a level-up, a fanfare) lean into it.

const MIN_GAP = 0.03; // seconds: the same sound again sooner than this is dropped
const MAX_VOICES = 120; // sources alive or scheduled; past this, new sounds are dropped
const NOISE_SECONDS = 2;

const m2f = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp01 = (v) => (v >= 1 ? 1 : v > 0 ? v : 0);
/** A major pentatonic ladder: runs that climb with `pitch` stay in tune with each other. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const rung = (pitch) => LADDER[Math.round(clamp01(pitch) * (LADDER.length - 1))];
/** The slider is 0..1; the ear wants a curve. */
const gainOf = (volume) => volume ** 1.5 * 1.2;

/** Writes the voices of one sound, each `at` seconds after its start. */
class Pen {
  constructor(sfx, t) {
    this.sfx = sfx;
    this.t = t;
  }

  tone(at, o) {
    this.sfx._tone(this.t + at, o);
  }

  noise(at, o) {
    this.sfx._noise(this.t + at, o);
  }

  /** A sine that drops: thuds, thumps and kicks. */
  thud(at, f, to, dur, g) {
    this.tone(at, { f, to, dur, g });
  }

  /** A bell: the note and two quieter, shorter partials (the top one a little sharp). */
  bell(at, midi, dur, g) {
    const f = m2f(midi);
    this.tone(at, { f, dur, g });
    this.tone(at, { f: f * 2, dur: dur * 0.6, g: g * 0.28 });
    this.tone(at, { f: f * 3.01, dur: dur * 0.35, g: g * 0.12 });
  }

  /** A fanfare note: a triangle with a square's edge on it. `hold` sustains it. */
  lead(at, midi, dur, g, hold = false) {
    const f = m2f(midi);
    const env = hold ? { hold: true, release: Math.min(0.25, dur * 0.45) } : {};
    this.tone(at, { type: 'triangle', f, dur, g, ...env });
    this.tone(at, { type: 'square', f, dur, g: g * 0.3, filter: { f: 2600 }, ...env });
  }

  /** Brass: two saws a few cents apart, the low-pass opening as the note speaks. */
  brass(at, midi, dur, g, hold = false) {
    const o = { type: 'sawtooth', f: m2f(midi), dur, g, attack: 0.015, hold: true, release: hold ? 0.22 : Math.min(0.05, dur * 0.4), filter: { f: 700, to: 2600, time: 0.07, q: 1.2 } };
    this.tone(at, { ...o, detune: -7 });
    this.tone(at, { ...o, detune: 7 });
  }

  /** A plucked string: bright at first, closing as it rings. */
  pluck(at, midi, dur, g) {
    const f = m2f(midi);
    this.tone(at, { type: 'sawtooth', f, dur, g: g * 0.6, filter: { f: 2600, to: 500, q: 1 } });
    this.tone(at, { type: 'triangle', f, dur, g });
  }
}

// --- The sounds ------------------------------------------------------------------------------

const SOUNDS = {
  tap(p) {
    p.tone(0, { type: 'triangle', f: 1100, to: 720, dur: 0.045, g: 0.1 });
    p.noise(0, { dur: 0.012, g: 0.04, filter: { type: 'highpass', f: 3500 } });
  },
  open(p) {
    p.noise(0, { dur: 0.17, g: 0.16, attack: 0.05, filter: { type: 'bandpass', f: 500, to: 2600, q: 1.2 } });
    p.tone(0.1, { type: 'triangle', f: 640, to: 900, dur: 0.07, g: 0.1 });
  },
  close(p) {
    p.noise(0, { dur: 0.15, g: 0.14, attack: 0.02, filter: { type: 'bandpass', f: 2200, to: 380, q: 1.2 } });
    p.tone(0.07, { type: 'triangle', f: 520, to: 340, dur: 0.07, g: 0.09 });
  },
  deny(p) {
    for (const at of [0, 0.12]) {
      p.thud(at, 150, 85, 0.1, 0.16);
      p.noise(at, { dur: 0.05, g: 0.06, filter: { f: 500 } });
    }
  },
  toast(p) {
    p.tone(0, { type: 'triangle', f: m2f(79), dur: 0.08, g: 0.1 });
    p.tone(0.075, { type: 'triangle', f: m2f(84), dur: 0.13, g: 0.1 });
  },
  engine(p) {
    // The starter turns over three times, then the motor catches and pulls away.
    for (let i = 0; i < 3; i++) p.tone(i * 0.065, { type: 'sawtooth', f: 62 + i * 4, dur: 0.05, g: 0.16, filter: { f: 420 } });
    const run = { dur: 0.72, attack: 0.04, hold: true, release: 0.3 };
    p.tone(0.2, { ...run, type: 'sawtooth', f: 50, to: 112, g: 0.17, filter: { f: 240, to: 760 }, trem: { rate: 24, depth: 0.4 } });
    p.tone(0.2, { ...run, type: 'square', f: 25, to: 56, g: 0.08, filter: { f: 180, to: 400 } });
    p.noise(0.2, { ...run, attack: 0.1, g: 0.07, filter: { type: 'bandpass', f: 500, to: 1400, q: 0.7 } });
  },
  shot(p, o) {
    switch (o.kind) {
      case 'rifle': // a deeper crack, and it rolls off down the street
        p.noise(0, { dur: 0.17, g: 0.16, filter: { type: 'bandpass', f: 1100, to: 500, q: 0.7 } });
        p.tone(0, { type: 'triangle', f: 190, to: 50, dur: 0.15, g: 0.1 });
        p.noise(0.05, { dur: 0.3, g: 0.035, filter: { f: 700, to: 250 } });
        break;
      case 'staple': // click-snap
        for (const at of [0, 0.034]) {
          p.noise(at, { dur: 0.012, g: 0.065, filter: { type: 'highpass', f: 3200 } });
          p.tone(at, { type: 'square', f: 1900, to: 950, dur: 0.016, g: 0.025 });
        }
        break;
      case 'thump': // an air cannon: foomp
        p.tone(0, { f: 250, to: 68, dur: 0.17, g: 0.15 });
        p.noise(0, { dur: 0.13, g: 0.085, attack: 0.01, filter: { f: 620, to: 180 } });
        break;
      default: // pistol
        p.noise(0, { dur: 0.06, g: 0.1, filter: { type: 'highpass', f: 1300 } });
        p.tone(0, { type: 'square', f: 330, to: 90, dur: 0.05, g: 0.04 });
    }
  },
  hit(p, o) {
    const k = o.heavy ? 0.58 : 1; // heavy: lower, longer, and the floor feels it
    p.tone(0, { f: 520 * k, to: 250 * k, dur: 0.07 / k, g: o.heavy ? 0.17 : 0.13 });
    p.tone(0, { type: 'triangle', f: 800 * k, to: 400 * k, dur: 0.04 / k, g: 0.055 });
    p.noise(0, { dur: 0.022 / k, g: o.heavy ? 0.11 : 0.09, filter: { type: 'bandpass', f: 1800 * k, q: 1.5 } });
    if (o.heavy) p.thud(0.005, 115, 55, 0.16, 0.13);
  },
  bonk(p) {
    // A drowser flops over: pop, "wuh", and the ground.
    p.tone(0, { f: 720, to: 300, dur: 0.055, g: 0.15 });
    p.tone(0.03, { type: 'triangle', f: 310, to: 140, dur: 0.22, g: 0.1, filter: { f: 1000 }, vib: { rate: 17, depth: 14 } });
    p.thud(0.21, 120, 68, 0.09, 0.13);
  },
  down(p) {
    p.tone(0, { type: 'triangle', f: m2f(66), to: m2f(64), dur: 0.16, g: 0.14, hold: true, release: 0.05, filter: { f: 1800 } });
    p.tone(0.155, { type: 'triangle', f: m2f(61), to: m2f(57), dur: 0.24, g: 0.14, hold: true, release: 0.12, filter: { f: 1500 } });
    p.thud(0.36, 130, 58, 0.13, 0.17);
    p.noise(0.36, { dur: 0.06, g: 0.07, filter: { f: 320 } });
  },
  star(p, o) {
    const n = Math.min(3, Math.max(1, Math.round(o.n) || 1));
    const midi = [84, 88, 91][n - 1]; // C, E, G: three stars spell the chord
    p.thud(0, 190, 78, 0.1, 0.15);
    p.noise(0, { dur: 0.03, g: 0.05, filter: { type: 'highpass', f: 4200 } });
    p.tone(0, { type: 'triangle', f: m2f(midi), dur: 0.12, g: 0.07 });
    p.bell(0, midi, 0.55, 0.14);
    if (n === 3) p.bell(0.07, midi + 12, 0.4, 0.045);
  },
  fail(p) {
    [67, 63, 58].forEach((m, i) => {
      const last = i === 2;
      p.tone(i * 0.21, { type: 'triangle', f: m2f(m), to: m2f(m - (last ? 1 : 0.4)), dur: last ? 0.5 : 0.2, g: 0.11, attack: 0.015, hold: true, release: last ? 0.3 : 0.06, filter: { f: 1300 } });
    });
  },
  crateTap(p) {
    p.tone(0, { f: 245, to: 170, dur: 0.055, g: 0.14 });
    p.tone(0, { type: 'triangle', f: 530, to: 380, dur: 0.03, g: 0.06 });
    p.noise(0, { dur: 0.02, g: 0.075, filter: { type: 'bandpass', f: 1400, q: 2 } });
  },
  crateOpen(p, o) {
    const tier = o.tier === 'gold' || o.tier === 'steel' ? o.tier : 'wood';
    const big = tier === 'gold';
    // The lid: a creak, a crack, a pop.
    p.tone(0, { type: 'sawtooth', f: 130, to: 270, dur: 0.12, g: 0.22, filter: { type: 'bandpass', f: 900, to: 1500, q: 4 } });
    p.noise(0.1, { dur: 0.05, g: big ? 0.18 : 0.13, filter: { type: 'highpass', f: 1500 } });
    p.thud(0.1, 165, 85, 0.09, big ? 0.3 : 0.12);
    p.tone(0.12, { f: 420, to: 900, dur: 0.08, g: big ? 0.15 : 0.11 });
    if (tier === 'wood') return;
    // Steel and gold: the clank of a catch.
    p.tone(0.1, { type: 'square', f: 1320, dur: 0.2, g: 0.05, filter: { type: 'bandpass', f: 1320, q: 8 } });
    p.tone(0.1, { f: 1987, dur: 0.24, g: 0.05 });
    if (tier === 'steel') {
      p.bell(0.17, 79, 0.28, 0.11);
      p.bell(0.27, 86, 0.4, 0.11);
      return;
    }
    // Gold: the jackpot.
    p.noise(0.1, { dur: 0.2, g: 0.16, filter: { type: 'highpass', f: 900, to: 5000 } });
    [72, 76, 79, 84, 88, 91].forEach((m, i) => p.bell(0.15 + i * 0.06, m, 0.34, 0.1));
    for (let i = 0; i < 7; i++) p.tone(0.42 + i * 0.045, { f: m2f(96 + LADDER[(i * 3) % 6]), dur: 0.09, g: 0.035 });
  },
  supplies(p, o) {
    // A tin can lands on the pile: a tok, and partials that don't quite agree.
    const f = m2f(76 + rung(clamp01(o.pitch) * 0.7)); // E5 up to G#6: any higher and a can turns into a whistle
    p.tone(0, { f: 310, to: 200, dur: 0.03, g: 0.07 });
    p.tone(0, { type: 'square', f, dur: 0.06, g: 0.07, filter: { type: 'bandpass', f: f * 1.5, q: 6 } });
    p.tone(0, { f: f * 2.76, dur: 0.05, g: 0.04 });
    p.tone(0, { f: f * 5.4, dur: 0.03, g: 0.015 });
  },
  token(p, o) {
    const midi = 76 + rung(clamp01(o.pitch) * 0.8); // E5 up to B6
    p.tone(0, { type: 'triangle', f: m2f(midi), dur: 0.02, g: 0.045 });
    p.bell(0, midi, 0.36, 0.125);
  },
  radioFound(p) {
    // Static that turns into three happy notes.
    p.noise(0, { dur: 0.28, g: 0.3, attack: 0.02, filter: { type: 'bandpass', f: 1200, via: 2700, to: 1500, q: 1.4 } });
    [79, 83, 86].forEach((m, i) => {
      const dur = i === 2 ? 0.24 : 0.09;
      p.tone(0.26 + i * 0.085, { type: 'square', f: m2f(m), dur, g: 0.09, filter: { f: 3000 } });
      p.tone(0.26 + i * 0.085, { f: m2f(m), dur, g: 0.1 });
    });
  },
  static(p) {
    // Tuning in: noise through a band that wanders, and the whine of the dial.
    p.noise(0, { dur: 0.5, g: 0.24, attack: 0.03, hold: true, release: 0.12, filter: { type: 'bandpass', f: 800, via: 2800, to: 1500, q: 1.6 } });
    p.tone(0, { f: 1300, to: 2500, dur: 0.5, g: 0.012, attack: 0.05, hold: true, release: 0.1, vib: { rate: 9, depth: 120 } });
  },
  callAnswered(p) {
    p.noise(0, { dur: 0.03, g: 0.06, filter: { type: 'highpass', f: 2200 } });
    for (const at of [0.02, 0.13]) p.tone(at, { type: 'square', f: 1240, dur: 0.075, g: 0.08, hold: true, release: 0.015, filter: { f: 2600 } });
    p.tone(0.26, { f: 720, to: 1560, dur: 0.15, g: 0.15 });
  },
  voice(p, o) {
    // One syllable through a small speaker: a buzz and two formants.
    const k = clamp01(o.pitch);
    const f = 115 + k * 130;
    const buzz = { type: 'sawtooth', f: f * 1.06, to: f * 0.94, dur: 0.095, attack: 0.012, hold: true, release: 0.035 };
    p.tone(0, { ...buzz, g: 0.5, filter: { type: 'bandpass', f: 650 + k * 800, q: 5 } });
    p.tone(0, { ...buzz, g: 0.22, filter: { type: 'bandpass', f: 2100 + k * 500, q: 7 } });
    p.noise(0, { dur: 0.05, g: 0.04, filter: { type: 'bandpass', f: 1800, q: 1 } });
  },
  reveal(p, o) {
    const r = o.rarity;
    if (r === 'legendary') {
      // A boom underneath, a climb, a chord that stays, and sparkles on top.
      p.thud(0, 92, 36, 0.9, 0.4);
      p.noise(0, { dur: 0.4, g: 0.14, filter: { f: 220 } });
      [60, 64, 67, 72, 76, 79].forEach((m, i) => p.brass(0.05 + i * 0.09, m, 0.13, 0.07));
      for (const m of [72, 76, 79, 84]) p.lead(0.62, m, 0.78, 0.075, true);
      for (let i = 0; i < 10; i++) p.tone(0.62 + i * 0.07, { f: m2f(96 + LADDER[(i * 2) % 7]), dur: 0.1, g: 0.035 });
    } else if (r === 'epic') {
      [72, 76, 79, 84].forEach((m, i) => p.lead(i * 0.085, m, 0.11, 0.11));
      for (const m of [84, 88, 91]) p.lead(0.36, m, 0.6, 0.08, true);
      for (let i = 0; i < 6; i++) p.tone(0.38 + i * 0.04, { f: m2f([96, 100, 103, 108][i % 4]), dur: 0.08, g: 0.035 });
    } else if (r === 'rare') {
      p.lead(0, 72, 0.1, 0.13);
      p.lead(0.09, 79, 0.1, 0.13);
      p.lead(0.18, 84, 0.45, 0.14, true);
      p.tone(0.18, { f: m2f(96), dur: 0.35, g: 0.045 });
    } else {
      p.lead(0, 72, 0.1, 0.12);
      p.lead(0.1, 79, 0.36, 0.12, true);
    }
  },
  join(p) {
    [55, 62, 67, 71].forEach((m, i) => p.pluck(i * 0.035, m, 0.55, 0.09));
  },
  ready(p) {
    p.tone(0, { f: m2f(81), dur: 0.06, g: 0.08 });
    p.tone(0.05, { type: 'triangle', f: m2f(93), dur: 0.05, g: 0.055 });
    p.bell(0.05, 93, 0.5, 0.13);
  },
  levelUp(p) {
    p.thud(0, 165, 52, 0.22, 0.4);
    p.noise(0, { dur: 0.1, g: 0.12, filter: { f: 320 } });
    [60, 64, 67, 72, 76].forEach((m, i) => p.lead(0.02 + i * 0.07, m, 0.12, 0.11));
    for (const m of [72, 76, 79, 84]) p.lead(0.38, m, 0.55, 0.075, true);
    p.tone(0.4, { f: m2f(96), dur: 0.32, g: 0.05 });
  },
  power(p, o) {
    p.tone(0, { type: 'triangle', f: m2f(72 + Math.round(clamp01(o.pitch) * 24)), dur: 0.035, g: 0.08 });
  },
  swap(p) {
    p.tone(0, { f: 720, to: 350, dur: 0.09, g: 0.12, hold: true, release: 0.02 });
    p.tone(0.09, { f: 350, to: 820, dur: 0.12, g: 0.12 });
  },
  area(p) {
    for (const at of [0, 0.56]) p.thud(at, 112, 54, 0.26, 0.28);
    p.brass(0, 67, 0.13, 0.1);
    p.brass(0.14, 67, 0.09, 0.1);
    p.brass(0.25, 72, 0.14, 0.1);
    p.brass(0.4, 76, 0.14, 0.1);
    for (const m of [72, 76, 79, 84]) p.brass(0.56, m, 0.66, 0.065, true);
  },
  ferry(p) {
    // The horn first: two low saws a few cents apart, and the fifth above them.
    const horn = { type: 'sawtooth', dur: 1.2, attack: 0.12, hold: true, release: 0.3, filter: { f: 300, via: 460, to: 380, q: 0.8 } };
    p.tone(0, { ...horn, f: 87.3, g: 0.3 });
    p.tone(0, { ...horn, f: 87.3, detune: 14, g: 0.3 });
    p.tone(0, { ...horn, f: 130.8, g: 0.12 });
    // Then everybody cheers up.
    [72, 76, 79, 84].forEach((m, i) => p.lead(1.2 + i * 0.09, m, 0.11, 0.11));
    for (const m of [79, 84, 88]) p.lead(1.56, m, 0.62, 0.085, true);
    p.thud(1.56, 112, 54, 0.26, 0.26);
  },
  gift(p) {
    // Somebody whistling, out of sight. Four notes, in no hurry.
    [81, 77, 79, 74].forEach((m, i) => {
      const f = m2f(m);
      const last = i === 3;
      const env = { dur: last ? 0.55 : 0.34, attack: 0.05, hold: true, release: last ? 0.3 : 0.12 };
      p.tone(i * 0.4, { ...env, f: f * 0.975, to: f, glide: 0.07, g: 0.085, vib: { rate: 5.6, depth: f * 0.008, delay: 0.14 } });
      p.tone(i * 0.4, { ...env, f: f * 2, g: 0.008 });
      p.noise(i * 0.4, { ...env, g: 0.05, filter: { type: 'bandpass', f: f * 1.02, q: 3 } });
    });
  },
  eyes(p) {
    // Two notes a semitone apart: something seen out of the corner of your eye.
    p.tone(0, { f: m2f(88), dur: 0.32, g: 0.05 });
    p.tone(0, { f: m2f(100), dur: 0.14, g: 0.012 });
    p.tone(0.12, { f: m2f(89), dur: 0.48, g: 0.05 });
    p.tone(0.12, { f: m2f(101), dur: 0.2, g: 0.012 });
  },
};

/** Every name play() knows. */
export const SOUND_NAMES = Object.keys(SOUNDS);

// --- The player ------------------------------------------------------------------------------

export class Sfx {
  constructor() {
    this.ctx = null;
    this.bus = null; // every voice plays into this
    this.master = null; // the volume, after the compressor
    this.volume = 0.6;
    this.voices = 0;
    this.lastError = null; // whatever last went wrong while writing a sound (for debugging)
    this._last = new Map();
    this._noiseBuffer = null;
  }

  /** Call from a tap or a key press: makes the AudioContext, or wakes it. Returns whether there is one. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const bus = ctx.createGain();
        const squash = ctx.createDynamicsCompressor();
        squash.threshold.value = -16;
        squash.knee.value = 10;
        squash.ratio.value = 10;
        squash.attack.value = 0.002;
        squash.release.value = 0.18;
        const master = ctx.createGain();
        master.gain.value = gainOf(this.volume);
        bus.connect(squash);
        squash.connect(master);
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.bus = bus;
        this.master = master;
        // Older iOS only lets sound through once something has played inside a gesture.
        const blip = ctx.createBufferSource();
        blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        blip.connect(ctx.destination);
        blip.onended = () => blip.disconnect();
        blip.start(0);
      }
      if (this.ctx.state !== 'running') {
        const waking = this.ctx.resume();
        if (waking && waking.catch) waking.catch(() => {});
      }
      return true;
    } catch (e) {
      this.lastError = e;
      return !!this.ctx;
    }
  }

  /** Master volume, 0..1 (0 is silent). */
  setVolume(v) {
    if (!Number.isFinite(Number(v))) return;
    this.volume = clamp01(Number(v));
    if (!this.master) return;
    try {
      this.master.gain.setTargetAtTime(gainOf(this.volume), this.ctx.currentTime, 0.02);
    } catch (e) {
      this.lastError = e;
    }
  }

  play(name, opts = {}) {
    const ctx = this.ctx;
    const write = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
    if (!ctx || !write || this.volume <= 0 || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const o = opts || {};
    const t = ctx.currentTime;
    const key = `${name}:${o.kind ?? o.tier ?? o.rarity ?? ''}`;
    if (t - (this._last.get(key) ?? -1) < MIN_GAP) return;
    this._last.set(key, t);
    try {
      write(new Pen(this, t + 0.005), o);
    } catch (e) {
      this.lastError = e;
    }
  }

  // --- Voices ----------------------------------------------------------------------------------

  /** Stop `src` at `stopAt`, and take the whole chain apart when it has. */
  _end(src, stopAt, nodes) {
    this.voices += 1;
    src.onended = () => {
      this.voices -= 1;
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // already gone
        }
      }
    };
    src.stop(stopAt);
  }

  /** The loudness of one voice: a quick attack, then a decay (or, with `hold`, a sustain and a release). */
  _amp(t, dur, g, o) {
    const amp = this.ctx.createGain();
    const p = amp.gain;
    const attack = Math.min(o.attack ?? 0.004, dur * 0.5);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(g, t + attack);
    if (o.hold) p.setValueAtTime(g, t + dur - Math.max(0, Math.min(o.release ?? 0.08, dur - attack - 0.004)));
    p.exponentialRampToValueAtTime(0.0001, t + dur);
    return amp;
  }

  /** { type, f, to, via (passed halfway), time (how long the sweep takes), q } */
  _filter(fo, t, dur) {
    const fl = this.ctx.createBiquadFilter();
    const time = fo.time ?? dur;
    fl.type = fo.type || 'lowpass';
    fl.frequency.setValueAtTime(fo.f, t);
    if (fo.via) fl.frequency.exponentialRampToValueAtTime(fo.via, t + time * 0.5);
    if (fo.to) fl.frequency.exponentialRampToValueAtTime(fo.to, t + time);
    if (fo.q != null) fl.Q.setValueAtTime(fo.q, t);
    return fl;
  }

  /** A slow oscillator that wobbles `param` by `depth`, from `delay` seconds in. */
  _lfo(t, stopAt, rate, depth, delay, param, nodes) {
    const lfo = this.ctx.createOscillator();
    const by = this.ctx.createGain();
    lfo.frequency.setValueAtTime(rate, t);
    by.gain.setValueAtTime(delay ? 0 : depth, t);
    if (delay) by.gain.linearRampToValueAtTime(depth, t + delay);
    lfo.connect(by);
    by.connect(param);
    lfo.start(t);
    lfo.stop(stopAt);
    nodes.push(lfo, by);
  }

  /** The rest of a voice after its source: [filter] -> amp -> bus. Returns every node made. */
  _chain(src, t, o) {
    const nodes = [src];
    let tail = src;
    if (o.filter) {
      tail = this._filter(o.filter, t, o.dur);
      src.connect(tail);
      nodes.push(tail);
    }
    const amp = this._amp(t, o.dur, o.g ?? 0.1, o);
    tail.connect(amp);
    amp.connect(this.bus);
    nodes.push(amp);
    return { nodes, amp };
  }

  /**
   * One oscillator: osc -> [filter] -> amp -> bus.
   * { type, f, to, glide (seconds to reach `to`), detune (cents), dur, g, attack, hold, release,
   *   filter, vib: { rate, depth (Hz), delay }, trem: { rate, depth (0..1) } }
   */
  _tone(t, o) {
    if (this.voices >= MAX_VOICES * 2) return;
    const stopAt = t + o.dur + 0.03;
    const osc = this.ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.dur));
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const { nodes, amp } = this._chain(osc, t, o);
    if (o.vib) this._lfo(t, stopAt, o.vib.rate, o.vib.depth, o.vib.delay, osc.frequency, nodes);
    if (o.trem) this._lfo(t, stopAt, o.trem.rate, o.trem.depth * (o.g ?? 0.1), 0, amp.gain, nodes);
    osc.start(t);
    this._end(osc, stopAt, nodes);
  }

  /** A slice of white noise: noise -> [filter] -> amp -> bus. { dur, g, attack, hold, release, filter } */
  _noise(t, o) {
    if (this.voices >= MAX_VOICES * 2) return;
    const ctx = this.ctx;
    if (!this._noiseBuffer) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const { nodes } = this._chain(src, t, o);
    src.start(t, Math.random() * Math.max(0, NOISE_SECONDS - o.dur - 0.1));
    this._end(src, t + o.dur + 0.03, nodes);
  }
}
