// Comic WebAudio synth for BATTLE. Every sound is generated on the fly from a
// few oscillators and filtered noise: wooden bonks, squeaky bean voices, a war
// horn and a sad trombone. Nothing to download.
//
// play(name, o) is fire-and-forget. Options (all optional):
//   pan    -1..1   stereo position
//   vol    0..1    extra attenuation (distance from the camera)
//   power  0..1+   hit strength / swing speed / impact speed
//   pitch  0..1    per-unit voice pitch, so every bean sounds a bit different
//   rate   .25..2  game time scale; slow motion lowers and stretches sounds
//   rarity 'common' | 'rare' | 'epic' | 'legendary'   cardReveal: rarer = brighter, longer
//   foe    bool    crown: the other side scored (a softer, lower "dong")
//   big    bool    chestShake / chestOpen: the Big Chest (heavier, longer)
//   flip   bool    umbrella: blown inside out
//   down   bool    whirr: the propeller cuts out instead of spinning up
//   metal  bool    planks: the crane (iron bars, not planks)
//
// Each sound gets its own little bus (gain + panner), so it can be faded out
// early when the battle gets too busy.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const quiet = (p) => p && p.catch && p.catch(() => {});

const MAX_VOICES = 24;

// Vowel formants (Hz) for a grown-up; bean voices scale them up a little.
const VOWELS = {
  a: [800, 1200, 2600],
  e: [520, 1850, 2600],
  i: [310, 2300, 3000],
  o: [500, 880, 2500],
  u: [340, 720, 2400],
};
const FORMANT_AMP = [1, 0.55, 0.22];
const FORMANT_Q = [4, 6, 8];
const VOICE_TILT = 1.2; // harmonic k has amplitude 1 / k^VOICE_TILT

/** Value of a breakpoint path at time x (straight lines between points). */
function pathAt(pts, x, val = (p) => p[1]) {
  if (x <= pts[0][0]) return val(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0] = pts[i - 1];
      const u = (x - x0) / Math.max(1e-6, pts[i][0] - x0);
      return val(pts[i - 1]) + (val(pts[i]) - val(pts[i - 1])) * u;
    }
  }
  return val(pts[pts.length - 1]);
}

/**
 * How loud the buzz comes out of the mouth at pitch f with formants F: sum of
 * harmonics through the band-passes. High squeaky voices have few harmonics,
 * so without this some pitch/vowel combos would be far louder than others.
 */
function mouthGain(f, F) {
  let s = 0;
  for (let k = 1; k < 40 && k * f < 9000; k++) {
    let h = 0;
    for (let j = 0; j < 3; j++) {
      const r = (k * f) / F[j];
      const q = FORMANT_Q[j];
      h += (FORMANT_AMP[j] * (r / q)) / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
    }
    s += (h / Math.pow(k, VOICE_TILT)) ** 2;
  }
  return Math.sqrt(s);
}

// --- shared per-context resources -------------------------------------------

const noiseCache = new WeakMap();
const waveCache = new WeakMap();

/** Two seconds of white noise, shared by every noisy sound. */
function noiseFor(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** A soft buzzy "vocal cord" wave: a saw with gently falling harmonics. */
function voiceWave(ctx) {
  let w = waveCache.get(ctx);
  if (!w) {
    const n = 40;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = 1 / Math.pow(k, VOICE_TILT);
    w = ctx.createPeriodicWave(re, im);
    waveCache.set(ctx, w);
  }
  return w;
}

/** Linear up to 0.7, then eases into 1.0. Input is pre-scaled by 0.5. */
function softClipCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3);
    c[i] = Math.sign(u) * y;
  }
  return c;
}

// --- sound builder ------------------------------------------------------------

// Builds one sound into `out`. Times are seconds from the sound's start and
// frequencies are in Hz; in slow motion both are scaled together, so a slowed
// game sounds like a slowed-down tape.
class Builder {
  constructor(ctx, out, t0, o, jitter) {
    this.c = ctx;
    this.out = out;
    this.t0 = t0;
    const rate = clamp(num(o.rate, 1), 0.25, 2);
    const speed = rate < 1 ? Math.sqrt(rate) : Math.pow(rate, 0.3);
    this.ts = 1 / speed;
    this.pm = speed * (1 + (Math.random() * 2 - 1) * jitter);
    this.power = clamp(num(o.power, 0.7), 0, 1.5);
    this.pitch = clamp(num(o.pitch, rand(0.3, 0.7)), 0, 1);
    this.o = o; // sound-specific options (rarity, foe, big)
    this.end = t0;
    this.nodes = [];
    this.srcs = [];
  }

  at(x) {
    return this.t0 + Math.max(0, x) * this.ts;
  }

  hz(f) {
    return Math.max(1, f * this.pm);
  }

  keep(node, dest) {
    this.nodes.push(node);
    if (dest) node.connect(dest);
    return node;
  }

  gain(v = 1, dest = this.out) {
    const g = this.c.createGain();
    g.gain.value = v;
    return this.keep(g, dest);
  }

  filter(type, f, q = 1, dest = this.out) {
    const n = this.c.createBiquadFilter();
    n.type = type;
    n.frequency.value = this.hz(f);
    n.Q.value = q;
    return this.keep(n, dest);
  }

  osc(type = 'sine') {
    const o = this.keep(this.c.createOscillator());
    if (type === 'voice') o.setPeriodicWave(voiceWave(this.c));
    else o.type = type;
    return o;
  }

  noiseSrc(rate = 1) {
    const s = this.keep(this.c.createBufferSource());
    s.buffer = noiseFor(this.c);
    s.loop = true;
    s.playbackRate.value = rate * rand(0.9, 1.1);
    return s;
  }

  /** Schedule a source between two relative times. */
  run(src, from, to) {
    const t1 = this.at(to) + 0.02;
    if (src.loop) src.start(this.at(from), Math.random() * 1.5); // noise: random spot
    else src.start(this.at(from));
    src.stop(t1);
    this.srcs.push(src);
    if (t1 > this.end) this.end = t1;
    return src;
  }

  /** Percussive envelope: rise in `a`, hold `h`, exponential fall over `d`. */
  perc(param, at, a, h, d, peak) {
    const t = this.at(at);
    const ts = this.ts;
    peak = Math.max(peak, 0.0002);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a * ts);
    if (h > 0) param.setValueAtTime(peak, t + (a + h) * ts);
    param.exponentialRampToValueAtTime(0.0001, t + (a + h + d) * ts);
    return at + a + h + d;
  }

  /** Envelope through [[time, value], ...] with straight ramps. */
  line(param, pts, scale = 1) {
    pts.forEach(([x, v], i) => {
      if (i === 0) param.setValueAtTime(v * scale, this.at(x));
      else param.linearRampToValueAtTime(v * scale, this.at(x));
    });
    return pts[pts.length - 1][0];
  }

  /** Frequency path through [[time, Hz], ...] with smooth (exponential) glides. */
  glide(param, pts) {
    pts.forEach(([x, f], i) => {
      if (i === 0) param.setValueAtTime(this.hz(f), this.at(x));
      else param.exponentialRampToValueAtTime(this.hz(f), this.at(x));
    });
  }

  /** Vibrato on one or more frequency params; depth points are fractions of baseHz. */
  wobble(params, baseHz, rate, pts, from, to) {
    const lfo = this.osc('sine');
    lfo.frequency.value = rate / this.ts;
    const g = this.gain(0, null);
    lfo.connect(g);
    for (const p of [].concat(params)) g.connect(p);
    this.line(g.gain, pts, this.hz(baseHz));
    this.run(lfo, from, to);
  }

  /** Oscillator with an optional pitch glide and a percussive envelope. */
  tone({ type = 'sine', f, to, glide, at = 0, a = 0.003, h = 0, d = 0.1, g = 0.3, dest = this.out }) {
    const o = this.osc(type);
    if (to) this.glide(o.frequency, [[at, f], [at + (glide || a + h + d), to]]);
    else o.frequency.value = this.hz(f);
    const e = this.gain(0, dest);
    o.connect(e);
    this.run(o, at, this.perc(e.gain, at, a, h, d, g));
    return o;
  }

  /** Filtered noise burst; `to` sweeps the filter over `sweep` seconds. */
  noise({ type = 'bandpass', f = 1000, to, sweep, q = 1, at = 0, a = 0.002, h = 0, d = 0.1, g = 0.3, rate = 1, dest = this.out }) {
    const src = this.noiseSrc(rate);
    const fl = this.filter(type, f, q, null);
    if (to) this.glide(fl.frequency, [[at, f], [at + (sweep || a + h + d), to]]);
    const e = this.gain(0, dest);
    src.connect(fl);
    fl.connect(e);
    this.run(src, at, this.perc(e.gain, at, a, h, d, g));
    return e;
  }

  /** Three formant band-passes in parallel (a mouth); returns its input. */
  mouth(vowels, form, dest) {
    const input = this.gain(1, null);
    FORMANT_AMP.forEach((amp, k) => {
      const bp = this.filter('bandpass', 1000, FORMANT_Q[k], null);
      input.connect(bp);
      bp.connect(this.gain(amp, dest));
      vowels.forEach(([x, v], i) => {
        const hz = this.hz(VOWELS[v][k] * form);
        if (i === 0) bp.frequency.setValueAtTime(hz, this.at(x));
        else bp.frequency.linearRampToValueAtTime(hz, this.at(x));
      });
    });
    return input;
  }

  /**
   * A squeaky bean voice: buzz -> mouth -> envelope.
   * f0 [[t, Hz]], vowels [[t, 'a']], env [[t, gain]], vib = vibrato depth points.
   */
  speak({ f0, vowels, env, vib, vibRate = 6, breath = 0.05, form = 1.15, dest = this.out }) {
    const out = this.gain(0, dest);
    const mouth = this.mouth(vowels, form, out);
    const src = this.osc('voice');
    this.glide(src.frequency, f0);
    src.connect(mouth);
    // Even out the loudness along the pitch / vowel path (sampled every 40 ms).
    const times = env.map((p) => p[0]);
    for (let x = env[0][0]; x < times[times.length - 1]; x += 0.04) times.push(x);
    times.sort((a, b) => a - b);
    const formAt = (x) => [0, 1, 2].map((k) => pathAt(vowels, x, (p) => VOWELS[p[1]][k] * form));
    const level = times.map((x) => {
      const fix = clamp(0.32 / mouthGain(pathAt(f0, x), formAt(x)), 0.3, 3);
      return [x, pathAt(env, x) * fix];
    });
    const end = this.line(out.gain, level);
    if (vib) this.wobble(src.frequency, f0[0][1], vibRate, vib, f0[0][0], end);
    if (breath) {
      const n = this.noiseSrc(1);
      n.connect(this.gain(breath, mouth));
      this.run(n, env[0][0], end);
    }
    this.run(src, f0[0][0], end);
    return { src, out };
  }
}

/** Base voice pitch of a bean: small and squeaky. */
const beanHz = (b) => 290 + b.pitch * 250;

// --- weapons and bodies -----------------------------------------------------------

// Wooden club on a bean: a hollow pitched THOCK that drops a little, two
// inharmonic overtones, then a soft squishy thump. Harder = lower and fatter.
function bonk(b) {
  const p = Math.min(b.power, 1.2);
  const w = 0.35 + 0.65 * p;
  const f = rand(560, 680) * (1.12 - 0.22 * p);
  b.noise({ type: 'bandpass', f: 2800, q: 0.9, d: 0.014, g: 0.35 * w });
  b.tone({ f: f * 1.25, to: f, glide: 0.035, d: 0.12 + 0.06 * p, g: 0.5 * w });
  b.tone({ type: 'triangle', f: f * 1.53, to: f * 1.4, glide: 0.04, d: 0.07, g: 0.16 * w });
  b.tone({ f: f * 2.71, d: 0.045, g: 0.12 * w });
  b.tone({ f: 150 - 30 * p, to: 52, glide: 0.12, a: 0.004, d: 0.14 + 0.1 * p, g: 0.55 * w });
  b.noise({ type: 'bandpass', f: 1300, to: 260, q: 2.2, a: 0.004, d: 0.1 + 0.06 * p, g: 0.4 * w });
}

// Sword on a bean: a quick rising swish, a "shk" cut, a light thud.
function slash(b) {
  const p = Math.min(b.power, 1.2);
  const w = 0.45 + 0.55 * p;
  b.noise({ type: 'bandpass', f: 1400, to: 5200, sweep: 0.05, q: 1.6, a: 0.03, d: 0.05, g: 0.35 * w });
  b.noise({ type: 'highpass', f: 3500, q: 0.7, at: 0.035, d: 0.035, g: 0.3 * w });
  b.tone({ f: rand(4100, 4500), at: 0.035, d: 0.12, g: 0.035 * w });
  b.tone({ f: 170, to: 75, at: 0.035, d: 0.08, g: 0.42 * w });
  b.noise({ type: 'lowpass', f: 700, at: 0.035, d: 0.06, g: 0.25 * w });
}

// Weapon on a shield: hard contact, wooden knock, short metallic ring.
function clank(b) {
  const p = Math.min(b.power, 1.2);
  const w = 0.4 + 0.6 * p;
  const f = rand(700, 820);
  b.noise({ type: 'bandpass', f: 3200, q: 0.8, d: 0.012, g: 0.5 * w });
  b.tone({ f: 240, to: 190, d: 0.07, g: 0.45 * w });
  b.noise({ type: 'lowpass', f: 900, d: 0.05, g: 0.3 * w });
  for (const [r, g, d] of [[1, 0.2, 0.3], [2.76, 0.14, 0.2], [5.4, 0.08, 0.12], [8.93, 0.04, 0.07]]) {
    b.tone({ f: f * r, d: d * (0.7 + 0.5 * p), g: g * w });
  }
}

// Weapon through the air: a band-pass sweep that swells and fades.
function whoosh(b) {
  const s = clamp(b.power, 0.1, 1.5);
  const d = 0.3 - 0.09 * s;
  const src = b.noiseSrc(1);
  const fl = b.filter('bandpass', 380, 1.4, null);
  const e = b.gain(0);
  src.connect(fl);
  fl.connect(e);
  b.glide(fl.frequency, [[0, 380], [d * 0.55, 700 + 1500 * s], [d, 420]]);
  b.line(e.gain, [[0, 0], [d * 0.55, 0.35 + 0.65 * Math.min(s, 1)], [d, 0]]);
  b.run(src, 0, d);
}

// Bow being drawn: a slow saw "ratchet" through a woody resonance = creak.
function bowDraw(b) {
  const d = rand(0.38, 0.5);
  const o = b.osc('sawtooth');
  b.glide(o.frequency, [[0, 22], [d, 48]]);
  const bp = b.filter('bandpass', 1150, 6, null);
  b.glide(bp.frequency, [[0, 1150], [d, 850]]);
  const e = b.gain(0);
  o.connect(bp);
  bp.connect(e);
  b.line(e.gain, [[0, 0], [0.06, 0.8], [d - 0.08, 1], [d, 0]]);
  b.run(o, 0, d);
}

// Bowstring twang (a bright pluck that bends and wobbles) + arrow whizz.
function bowRelease(b) {
  const f = rand(150, 185);
  const o = b.osc('sawtooth');
  b.glide(o.frequency, [[0, f * 1.35], [0.03, f], [0.3, f * 0.97]]);
  b.wobble(o.frequency, f, 24, [[0, 0.06], [0.25, 0]], 0, 0.3);
  const lp = b.filter('lowpass', 4200, 3, null);
  b.glide(lp.frequency, [[0, 4200], [0.22, 450]]);
  const e = b.gain(0);
  o.connect(lp);
  lp.connect(e);
  b.run(o, 0, b.perc(e.gain, 0, 0.002, 0, 0.3, 0.45));
  b.noise({ type: 'bandpass', f: 3400, to: 1600, q: 5, at: 0.015, a: 0.04, d: 0.16, g: 0.3 });
}

function arrowBody(b) {
  const w = 0.6 + 0.4 * Math.min(b.power, 1);
  b.noise({ type: 'lowpass', f: 1400, to: 300, q: 1.5, d: 0.06, g: 0.45 * w });
  b.tone({ f: 200, to: 85, d: 0.08, g: 0.45 * w });
  b.noise({ type: 'bandpass', f: 800, to: 400, q: 3, at: 0.01, d: 0.06, g: 0.2 * w });
}

// Dry wooden tock, then the stuck shaft vibrates: two close tones beat "brrrng".
function arrowShield(b) {
  const f = rand(950, 1150);
  b.noise({ type: 'bandpass', f: 4200, q: 1, d: 0.008, g: 0.35 });
  b.tone({ f: f * 1.1, to: f, glide: 0.01, d: 0.05, g: 0.38 });
  b.tone({ f: f * 2.37, d: 0.025, g: 0.12 });
  const s = rand(120, 150);
  b.tone({ type: 'triangle', f: s, at: 0.01, a: 0.01, d: 0.3, g: 0.08 });
  b.tone({ type: 'triangle', f: s + 24, at: 0.01, a: 0.01, d: 0.3, g: 0.08 });
}

function arrowGround(b) {
  b.noise({ type: 'lowpass', f: 500, q: 1, d: 0.07, g: 0.6 });
  b.tone({ f: 120, to: 62, d: 0.07, g: 0.35 });
  b.noise({ type: 'bandpass', f: 2600, q: 1.2, at: 0.012, d: 0.05, g: 0.06 });
}

// Tiny soft footstep; sometimes with a grass rustle.
function step(b) {
  b.noise({ type: 'lowpass', f: rand(380, 900), q: 0.8, d: rand(0.025, 0.05), g: rand(0.6, 1) });
  if (Math.random() < 0.5) b.noise({ type: 'highpass', f: 3000, at: 0.005, d: 0.02, g: 0.12 });
}

// Bean slams into the ground: thud + dirt; hard landings bounce and rattle.
function land(b) {
  const p = clamp(b.power, 0, 1.5);
  const w = 0.3 + 0.7 * Math.min(p, 1.2);
  b.tone({ f: 115 - 35 * Math.min(p, 1), to: 42, glide: 0.1 + 0.08 * p, d: 0.12 + 0.14 * p, g: 0.6 * w });
  b.noise({ type: 'lowpass', f: 700, to: 180, q: 1, d: 0.1 + 0.12 * p, g: 0.5 * w });
  b.noise({ type: 'bandpass', f: 1600, q: 1, d: 0.03, g: 0.18 * w });
  if (p < 0.55) return;
  b.tone({ f: 105, to: 55, at: 0.11 + 0.05 * p, d: 0.08, g: 0.3 * w });
  // Gravel rattle: one noise source with a few quick spikes.
  const src = b.noiseSrc(1);
  const bp = b.filter('bandpass', 2600, 1.5, null);
  const e = b.gain(0);
  src.connect(bp);
  bp.connect(e);
  const n = 3 + Math.round(3 * Math.min(p, 1));
  let x = 0.03;
  for (let i = 0; i < n; i++) {
    x += rand(0.02, 0.06);
    e.gain.setValueAtTime(0, b.at(x));
    e.gain.linearRampToValueAtTime(0.3 * w * (1 - i / (n + 1)), b.at(x + 0.002));
    e.gain.exponentialRampToValueAtTime(0.0001, b.at(x + 0.02));
  }
  b.run(src, 0, x + 0.03);
}

// Bomb: a sharp crack, a deep boom that rolls off, and debris rattling down.
function boom(b) {
  const p = clamp(b.power, 0.3, 1.5);
  b.noise({ type: 'highpass', f: 2500, d: 0.03, g: 0.45 * p });
  b.tone({ f: 95, to: 28, glide: 0.5, a: 0.004, d: 0.55, g: 0.85 * p });
  b.tone({ type: 'triangle', f: 160, to: 45, glide: 0.25, d: 0.25, g: 0.3 * p });
  b.noise({ type: 'lowpass', f: 2200, to: 140, sweep: 0.9, q: 0.7, a: 0.004, d: 0.9, g: 0.75 * p });
  b.noise({ type: 'bandpass', f: 900, to: 300, sweep: 0.6, q: 0.8, at: 0.05, d: 0.6, g: 0.25 * p, rate: 0.6 });
  // Debris pattering down
  for (let i = 0; i < 5; i++) b.noise({ type: 'bandpass', f: rand(1800, 3200), q: 2, at: rand(0.25, 0.7), d: 0.03, g: 0.12 * p });
}

// Brick hammer hitting the ground: a heavy thump that rumbles.
function quake(b) {
  const p = clamp(b.power, 0.3, 1.5);
  b.tone({ f: 72, to: 26, glide: 0.35, a: 0.003, d: 0.45, g: 0.9 * p });
  b.noise({ type: 'lowpass', f: 600, to: 90, sweep: 0.5, q: 1, d: 0.5, g: 0.6 * p });
  b.noise({ type: 'bandpass', f: 1400, q: 1, d: 0.05, g: 0.25 * p });
  b.tone({ type: 'triangle', f: 46, to: 38, at: 0.08, a: 0.05, d: 0.6, g: 0.25 * p });
}

// Lit fuse: a fizzing hiss with a flutter.
function fuse(b) {
  const src = b.noiseSrc(1);
  const bp = b.filter('bandpass', 5200, 3, null);
  const e = b.gain(0);
  src.connect(bp);
  bp.connect(e);
  const d = 0.65;
  b.line(e.gain, [[0, 0], [0.03, 0.16], [d * 0.8, 0.2], [d, 0]]);
  b.wobble([bp.frequency], 5200, 23, [[0, 0.15], [d, 0.3]], 0, d);
  b.run(src, 0, d);
}

// --- bean voices -------------------------------------------------------------------

// Launched through the air: "waaaah!" rising then falling, wobbling more as it
// goes. Sometimes the voice cracks up an extra notch.
function scream(b) {
  const f = beanHz(b) * 1.15;
  const d = rand(0.55, 0.85);
  let f0 = [[0, f * 0.85], [0.07, f * 1.5], [d * 0.45, f * 1.38], [d, f * 0.9]];
  if (Math.random() < 0.4) {
    const x = d * rand(0.4, 0.55);
    f0 = [[0, f * 0.85], [0.07, f * 1.5], [x, f * 1.4], [x + 0.025, f * 1.85], [x + 0.1, f * 1.7], [d, f]];
  }
  b.speak({
    f0,
    vowels: [[0, 'u'], [0.09, 'a'], [d * 0.7, 'a'], [d, 'o']],
    env: [[0, 0], [0.04, 1], [d * 0.75, 0.8], [d, 0]],
    vib: [[0, 0.01], [d * 0.4, 0.02], [d, 0.08]],
    vibRate: 7,
    form: 1.2,
  });
}

// Attack effort: "hup!", "hah!" or "hyah!".
function grunt(b) {
  const f = beanHz(b) * 0.72;
  const d = rand(0.11, 0.16);
  const kind = pick(['hup', 'hah', 'hyah']);
  const vowels = {
    hup: [[0, 'o'], [d * 0.6, 'u'], [d, 'u']],
    hah: [[0, 'a'], [d, 'a']],
    hyah: [[0, 'i'], [d * 0.4, 'a'], [d, 'a']],
  }[kind];
  b.noise({ type: 'bandpass', f: 1500, q: 0.8, a: 0.008, d: 0.04, g: 0.2 });
  b.speak({
    f0: [[0.02, f * 1.05], [0.05, f * 1.12], [d, f * 0.85]],
    vowels,
    env: kind === 'hup' ? [[0.02, 0], [0.035, 1], [d - 0.015, 0.85], [d, 0]] : [[0.02, 0], [0.035, 1], [d, 0]],
    breath: 0.06,
  });
  if (kind === 'hup') b.noise({ type: 'lowpass', f: 600, at: d - 0.01, d: 0.02, g: 0.15 });
}

// Took a big hit: air knocked out, "oof!" falling, a little "f" at the end.
function hitVoice(b) {
  const f = beanHz(b);
  const d = rand(0.18, 0.25);
  b.noise({ type: 'bandpass', f: 1100, q: 0.7, d: 0.05, g: 0.22 });
  b.speak({
    f0: [[0.01, f * 1.25], [0.04, f * 1.3], [d, f * 0.72]],
    vowels: [[0, 'o'], [d * 0.5, 'u'], [d, 'u']],
    env: [[0.01, 0], [0.03, 1], [d * 0.6, 0.7], [d, 0]],
    breath: 0.08,
  });
  b.noise({ type: 'bandpass', f: 2600, q: 0.6, at: d - 0.03, a: 0.01, d: 0.05, g: 0.05 });
}

// Comic death: "bleh" (with a growing tongue flutter) or "oof", then a
// deflating hiss and a little slide whistle going down.
function death(b) {
  const f = beanHz(b) * 0.85;
  const d = rand(0.38, 0.48);
  const bleh = Math.random() < 0.6;
  const flutter = b.gain(bleh ? 0.65 : 1);
  b.speak({
    f0: [[0, f * 1.1], [0.06, f * 1.15], [d, f * 0.6]],
    vowels: bleh ? [[0, 'u'], [0.03, 'e'], [d, 'e']] : [[0, 'o'], [d * 0.5, 'o'], [d, 'u']],
    env: [[0, 0], [0.025, 1], [d * 0.7, 0.8], [d, 0]],
    vib: [[0, 0.02], [d, 0.04]],
    vibRate: 9,
    dest: flutter,
  });
  if (bleh) {
    const lfo = b.osc('sine');
    lfo.frequency.value = 23 / b.ts;
    const depth = b.gain(0, flutter.gain);
    lfo.connect(depth);
    b.line(depth.gain, [[0, 0], [d * 0.3, 0], [d, 0.35]]);
    b.run(lfo, 0, d);
  }
  const t = d * 0.8;
  const o = b.tone({ f: 1250, to: 330, glide: 0.55, at: t, a: 0.03, h: 0.32, d: 0.22, g: 0.11 });
  b.wobble(o.frequency, 700, 6, [[t, 0], [t + 0.6, 0.025]], t, t + 0.6);
  b.noise({ type: 'bandpass', f: 1800, to: 500, q: 0.8, at: t, a: 0.05, h: 0.2, d: 0.3, g: 0.05 });
}

// One happy bean: "yay!" (sometimes "woo!").
function cheer(b) {
  const f = beanHz(b) * 1.3;
  const d = rand(0.22, 0.32);
  const woo = Math.random() < 0.3;
  b.speak({
    f0: woo ? [[0, f * 0.9], [d * 0.6, f * 1.35], [d, f * 1.2]] : [[0, f], [d * 0.35, f * 1.3], [d, f * 1.15]],
    vowels: woo ? [[0, 'u'], [d * 0.5, 'o'], [d, 'u']] : [[0, 'i'], [d * 0.3, 'a'], [d * 0.75, 'e'], [d, 'i']],
    env: [[0, 0], [0.03, 1], [d * 0.7, 0.85], [d, 0]],
    vib: [[0, 0.025], [d, 0.025]],
    vibRate: 8,
    form: 1.25,
    breath: 0.04,
  });
}

// --- big moments -----------------------------------------------------------------

// War horn (two notes, brassy: the low-pass opens with the breath), then the
// whole army shouts "HUAAAH!": detuned voices through one shared mouth.
function battleStart(b) {
  const lp = b.filter('lowpass', 300, 1.8, null);
  const horn = b.gain(0);
  lp.connect(horn);
  const n1 = 98;
  const n2 = 146.8;
  const path = [[0, n1 * 0.9], [0.08, n1], [0.42, n1], [0.5, n2 * 0.96], [0.6, n2], [1.6, n2 * 0.99]];
  const freqs = [];
  for (const [type, m, g] of [['sawtooth', 1, 0.45], ['sawtooth', 1.006, 0.45], ['square', 0.5, 0.3]]) {
    const o = b.osc(type);
    b.glide(o.frequency, path.map(([x, f]) => [x, f * m]));
    o.connect(b.gain(g, lp));
    freqs.push(o.frequency);
    b.run(o, 0, 1.75);
  }
  b.wobble(freqs, n2, 4.5, [[0, 0], [0.8, 0], [1.6, 0.012]], 0, 1.75);
  b.glide(lp.frequency, [[0, 250], [0.1, 1400], [0.4, 900], [0.48, 400], [0.62, 1900], [0.9, 1300], [1.6, 1000], [1.75, 300]]);
  b.line(horn.gain, [[0, 0], [0.08, 0.8], [0.4, 0.7], [0.47, 0.35], [0.56, 1], [1.4, 0.85], [1.75, 0]]);

  const t = 1.2;
  const crowd = b.gain(0);
  const mouth = b.mouth([[t, 'u'], [t + 0.12, 'a'], [t + 0.8, 'a'], [t + 1.15, 'o']], 1.1, crowd);
  for (let i = 0; i < 6; i++) {
    const f = rand(150, 340);
    const s = t + rand(0, 0.09);
    const o = b.osc('voice');
    b.glide(o.frequency, [[s, f * 0.85], [s + 0.15, f * 1.12], [t + 1.15, f * 0.92]]);
    const g = b.gain(0, mouth);
    o.connect(g);
    b.line(g.gain, [[s, 0], [s + 0.06, 1], [t + rand(0.8, 0.95), 0.8], [t + 1.15, 0]]);
    b.run(o, s, t + 1.15);
  }
  const breath = b.noiseSrc(1);
  breath.connect(b.gain(0.5, mouth));
  b.run(breath, t, t + 1.2);
  b.line(crowd.gain, [[t, 0], [t + 0.08, 1], [t + 0.85, 0.9], [t + 1.2, 0]]);
  b.noise({ type: 'highpass', f: 1500, q: 0.7, at: t - 0.02, a: 0.03, d: 0.12, g: 0.15 });
}

// Short cheerful brass fanfare with a chord, a timpani hit and some sparkle.
function victory(b) {
  const lp = b.filter('lowpass', 1800, 1.2, null);
  const e = b.gain(0);
  lp.connect(e);
  const oscs = [['sawtooth', 1, 0.5], ['square', 1.004, 0.3]].map(([type, m, g]) => {
    const o = b.osc(type);
    o.connect(b.gain(g, lp));
    b.run(o, 0, 1.6);
    return [o, m];
  });
  const notes = [[0, 392, 0.1], [0.12, 523.3, 0.1], [0.24, 659.3, 0.1], [0.36, 784, 0.27], [0.66, 659.3, 0.1], [0.78, 784, 0.8]];
  const env = [];
  const cut = [];
  for (const [x, f, len] of notes) {
    for (const [o, m] of oscs) {
      o.frequency.setValueAtTime(b.hz(f * m * 0.98), b.at(x));
      o.frequency.exponentialRampToValueAtTime(b.hz(f * m), b.at(x + 0.025));
    }
    env.push([x, 0], [x + 0.012, 1], [x + len * 0.6, 0.72], [x + len, 0]);
    cut.push([x, 900], [x + 0.03, 3200], [x + len, 1400]);
  }
  b.line(e.gain, env);
  b.glide(lp.frequency, cut);
  b.wobble(oscs.map(([o]) => o.frequency), 784, 6, [[0, 0], [1, 0], [1.5, 0.012]], 0, 1.6);
  for (const f of [262, 330, 392]) b.tone({ type: 'triangle', f, at: 0.78, a: 0.03, h: 0.4, d: 0.4, g: 0.12 });
  b.tone({ f: 130, to: 65, at: 0.78, d: 0.3, g: 0.35 });
  b.tone({ f: 2093, at: 0.8, d: 0.4, g: 0.05 });
  b.tone({ f: 2637, at: 0.86, d: 0.4, g: 0.04 });
  b.tone({ f: 3136, at: 0.92, d: 0.45, g: 0.04 });
}

// A gentle sad trombone: "wah wah wah waaah" on a rounder, softer horn (one
// saw + one triangle, a mild wah), the last note resting on a quiet warm chord.
// Losing should feel like a pat on the back, not a jeer.
function defeat(b) {
  const lp = b.filter('lowpass', 300, 1.6, null);
  const e = b.gain(0);
  lp.connect(e);
  const oscs = [b.osc('sawtooth'), b.osc('triangle')];
  oscs[0].connect(b.gain(0.4, lp));
  oscs[1].connect(b.gain(0.7, lp));
  const notes = [[0, 233.1, 0.26], [0.28, 220, 0.26], [0.56, 207.7, 0.26], [0.84, 196, 0.8]];
  const env = [];
  const wah = [];
  for (const [x, f, len] of notes) {
    oscs.forEach((o, i) => {
      const m = i ? 1.005 : 1;
      o.frequency.setValueAtTime(b.hz(f * m * 1.02), b.at(x));
      o.frequency.exponentialRampToValueAtTime(b.hz(f * m), b.at(x + 0.05));
    });
    env.push([x, 0], [x + 0.04, 0.85], [x + len - 0.06, 0.65], [x + len, 0]);
    wah.push([x, 280], [x + Math.min(0.12, len * 0.45), 850], [x + len, 380]);
  }
  b.line(e.gain, env);
  b.glide(lp.frequency, wah);
  b.wobble(oscs.map((o) => o.frequency), 196, 5, [[0, 0], [0.95, 0], [1.2, 0.01], [1.64, 0.025]], 0, 1.64);
  for (const o of oscs) b.run(o, 0, 1.64);
  // G minor, low and soft, under the last note.
  for (const f of [98, 146.8, 233.1]) b.tone({ type: 'triangle', f, at: 0.84, a: 0.12, h: 0.3, d: 0.45, g: 0.07 });
}

// A draw: a shrug. Two soft brass notes and a third that hangs on an open,
// unresolved chord, with a small "boing" at the end.
function draw(b) {
  const lp = b.filter('lowpass', 900, 1.2, null);
  const e = b.gain(0);
  lp.connect(e);
  const oscs = [['sawtooth', 1, 0.35], ['triangle', 1.004, 0.6]].map(([type, m, g]) => {
    const o = b.osc(type);
    o.connect(b.gain(g, lp));
    b.run(o, 0, 1.1);
    return [o, m];
  });
  const notes = [[0, 392, 0.18], [0.2, 349.2, 0.18], [0.4, 392, 0.65]];
  const env = [];
  for (const [x, f, len] of notes) {
    for (const [o, m] of oscs) {
      o.frequency.setValueAtTime(b.hz(f * m * 0.985), b.at(x));
      o.frequency.exponentialRampToValueAtTime(b.hz(f * m), b.at(x + 0.03));
    }
    env.push([x, 0], [x + 0.02, 0.9], [x + len * 0.7, 0.7], [x + len, 0]);
  }
  b.line(e.gain, env);
  b.glide(lp.frequency, [[0, 700], [0.4, 700], [0.45, 1500], [1.05, 600]]);
  // G sus4 (G C D): neither happy nor sad.
  for (const f of [196, 261.6, 293.7]) b.tone({ type: 'triangle', f, at: 0.4, a: 0.03, h: 0.25, d: 0.4, g: 0.08 });
  const o = b.tone({ f: 330, to: 440, glide: 0.05, at: 0.82, a: 0.004, d: 0.25, g: 0.12 });
  b.wobble(o.frequency, 440, 14, [[0.82, 0.12], [1.08, 0]], 0.82, 1.1);
}

// --- placing and UI -------------------------------------------------------------------

// Unit placed: a pop, then a springy "boing" (pitch follows o.pitch).
function place(b) {
  const f = 280 + b.pitch * 220;
  b.tone({ f: 1500, to: 380, glide: 0.03, d: 0.04, g: 0.3 });
  const o = b.tone({ f: f * 0.8, to: f, glide: 0.05, a: 0.004, d: 0.32, g: 0.32 });
  b.wobble(o.frequency, f, 15, [[0, 0.35], [0.33, 0]], 0, 0.34);
  b.noise({ type: 'lowpass', f: 450, d: 0.05, g: 0.2 });
}

// Unit removed: a reverse pop that gets sucked away.
function remove(b) {
  const f = 200 + b.pitch * 120;
  const o = b.osc('sine');
  b.glide(o.frequency, [[0, f], [0.15, f * 5]]);
  const e = b.gain(0);
  o.connect(e);
  b.line(e.gain, [[0, 0], [0.14, 0.35], [0.155, 0]]);
  b.run(o, 0, 0.16);
  b.noise({ type: 'bandpass', f: 600, to: 4000, q: 1.2, a: 0.13, d: 0.02, g: 0.15 });
  b.tone({ f: 1800, at: 0.15, a: 0.001, d: 0.02, g: 0.12 });
}

function grab(b) {
  const f = 420 + b.pitch * 160;
  b.tone({ f, to: f * 2.4, glide: 0.07, a: 0.004, d: 0.09, g: 0.3 });
  b.tone({ type: 'triangle', f: f * 2, to: f * 4.2, glide: 0.06, a: 0.004, d: 0.06, g: 0.08 });
}

function drop(b) {
  const f = 300 + b.pitch * 100;
  b.tone({ f: f * 1.8, to: f * 0.75, glide: 0.09, a: 0.004, d: 0.11, g: 0.32 });
  b.noise({ type: 'lowpass', f: 400, at: 0.02, d: 0.05, g: 0.15 });
}

// Jellybean pling: two quick bright notes
function coin(b) {
  const f = 1320 * (0.95 + b.pitch * 0.1);
  b.tone({ type: 'triangle', f, a: 0.002, d: 0.06, g: 0.28 });
  b.tone({ type: 'triangle', f: f * 1.5, at: 0.055, a: 0.002, d: 0.16, g: 0.3 });
  b.tone({ f: f * 3, at: 0.055, a: 0.002, d: 0.08, g: 0.06 });
}

// A star lands: sparkly rising chime with a soft thump
function star(b) {
  const f = 660 * (1 + (b.pitch - 0.5) * 0.5);
  for (let i = 0; i < 3; i++) b.tone({ type: 'triangle', f: f * [1, 1.25, 1.5][i], at: i * 0.045, a: 0.003, d: 0.22, g: 0.22 });
  b.tone({ f: f * 4, to: f * 6, glide: 0.2, at: 0.1, a: 0.01, d: 0.25, g: 0.05 });
  b.noise({ type: 'lowpass', f: 300, a: 0.002, d: 0.06, g: 0.25 });
}

// A hat pops off: cork-like pop
function pop(b) {
  const f = 520 + b.pitch * 200;
  b.tone({ f: f * 0.5, to: f * 1.6, glide: 0.035, a: 0.001, d: 0.06, g: 0.4 });
  b.noise({ type: 'bandpass', f: 2200, q: 2, a: 0.001, d: 0.025, g: 0.25 });
}

function ui(b) {
  b.tone({ f: 1900, to: 1300, glide: 0.02, a: 0.001, d: 0.03, g: 0.25 });
  b.noise({ type: 'bandpass', f: 4000, q: 1, a: 0.001, d: 0.01, g: 0.1 });
}

// Bottom tabs: softer and lower than `ui`, a little "tup".
function tabSwitch(b) {
  b.tone({ f: 900, to: 640, glide: 0.025, a: 0.001, d: 0.04, g: 0.26 });
  b.noise({ type: 'lowpass', f: 1600, a: 0.001, d: 0.012, g: 0.14 });
}

// --- shared bits for the arena and the menus ---------------------------------------------

/** A small bell: sine partials that die away faster the higher they are. */
function bell(b, f, at, g, d = 0.5, type = 'sine') {
  b.tone({ type, f, at, a: 0.002, d, g });
  b.tone({ f: f * 2, at, a: 0.002, d: d * 0.5, g: g * 0.3 });
  b.tone({ f: f * 3.01, at, a: 0.002, d: d * 0.25, g: g * 0.1 });
}

/** Fairy dust: n tiny soft pings spread over `len` seconds from `at`. */
function sparkle(b, at, len, n, g, lo = 2000, hi = 3800) {
  for (let i = 0; i < n; i++) {
    const x = at + (len * i) / n + rand(0, len / n);
    b.tone({ f: rand(lo, hi), at: x, a: 0.002, d: rand(0.06, 0.14), g: g * rand(0.6, 1) * (1 - (0.5 * i) / n) });
  }
}

/**
 * Brassy horn (the war horn's recipe): two detuned saws and a square an octave
 * down through a low-pass that opens with the breath. path = [[t, Hz]],
 * cut = [[t, Hz]] filter path, env = [[t, gain]]. Returns the pitch params.
 */
function horn(b, path, cut, env) {
  const lp = b.filter('lowpass', 300, 1.8, null);
  const out = b.gain(0);
  lp.connect(out);
  const end = env[env.length - 1][0];
  const freqs = [];
  for (const [type, m, g] of [['sawtooth', 1, 0.45], ['sawtooth', 1.006, 0.45], ['square', 0.5, 0.3]]) {
    const o = b.osc(type);
    b.glide(o.frequency, path.map(([x, f]) => [x, f * m]));
    o.connect(b.gain(g, lp));
    freqs.push(o.frequency);
    b.run(o, path[0][0], end);
  }
  b.glide(lp.frequency, cut);
  b.line(out.gain, env);
  return freqs;
}

// --- arena: cards ------------------------------------------------------------------------

// A card picked from the hand: a soft paper tick and a little rising "pip".
function cardPick(b) {
  const f = 700 + b.pitch * 160;
  b.noise({ type: 'bandpass', f: 2600, q: 1.5, a: 0.001, d: 0.012, g: 0.16 });
  b.tone({ type: 'triangle', f, to: f * 1.5, glide: 0.045, a: 0.003, d: 0.08, g: 0.3 });
  b.tone({ f: f * 3, to: f * 4.5, glide: 0.045, a: 0.003, d: 0.04, g: 0.035 });
}

// Can't play that (not enough mana, or not there): two muffled low "bmp bmp"s
// going down. Clear but not nagging.
function cardDenied(b) {
  for (const [x, f] of [[0, 196], [0.12, 156]]) {
    const o = b.osc('square');
    o.frequency.value = b.hz(f);
    const lp = b.filter('lowpass', 850, 1.2, null);
    const e = b.gain(0);
    o.connect(lp);
    lp.connect(e);
    b.run(o, x, b.perc(e.gain, x, 0.006, 0.05, 0.06, 0.34));
  }
}

// Beans dropped onto the field: a soft whoosh down out of the sky, then a plop.
// power = how many beans / how heavy (the landing itself uses `land`).
function deploy(b) {
  const p = clamp(b.power, 0.2, 1.5);
  const w = 0.55 + 0.45 * Math.min(p, 1.2);
  b.noise({ type: 'bandpass', f: 2200, to: 450, sweep: 0.28, q: 1.3, a: 0.17, d: 0.11, g: 0.32 * w });
  const f = 280 + b.pitch * 120;
  b.tone({ f: f * 2, to: f * 0.7, glide: 0.06, at: 0.25, a: 0.003, d: 0.1, g: 0.32 * w });
  b.tone({ f: 130, to: 62, at: 0.25, a: 0.003, d: 0.12, g: 0.4 * w });
  b.noise({ type: 'lowpass', f: 550, at: 0.25, d: 0.07, g: 0.35 * w });
}

// --- arena: towers -----------------------------------------------------------------------

// Guard Tower crossbow: the trigger clicks, a heavy, tight twang (lower and
// shorter than a bow), and the bolt hisses away.
function towerShot(b) {
  const f = rand(96, 112);
  b.noise({ type: 'bandpass', f: 3000, q: 1.2, d: 0.01, g: 0.28 });
  const o = b.osc('sawtooth');
  b.glide(o.frequency, [[0, f * 1.6], [0.02, f], [0.22, f * 0.97]]);
  b.wobble(o.frequency, f, 30, [[0, 0.05], [0.18, 0]], 0, 0.22);
  const lp = b.filter('lowpass', 3000, 4, null);
  b.glide(lp.frequency, [[0, 3000], [0.15, 320]]);
  const e = b.gain(0);
  o.connect(lp);
  lp.connect(e);
  b.run(o, 0, b.perc(e.gain, 0, 0.002, 0, 0.22, 0.45));
  b.tone({ f: 175, to: 82, d: 0.06, g: 0.3 });
  b.noise({ type: 'bandpass', f: 2800, to: 1100, q: 3, at: 0.02, a: 0.03, d: 0.14, g: 0.38 });
}

// Castle cannon: a sharp crack, a deep round boom and a puff of smoke. Shorter
// and rounder than a bomb so it doesn't drown the fight.
function cannon(b) {
  b.noise({ type: 'highpass', f: 1800, d: 0.025, g: 0.4 });
  b.tone({ f: 110, to: 38, glide: 0.3, a: 0.003, d: 0.4, g: 0.85 });
  b.tone({ type: 'triangle', f: 220, to: 70, glide: 0.12, d: 0.14, g: 0.25 });
  b.noise({ type: 'lowpass', f: 1600, to: 160, sweep: 0.5, q: 0.8, a: 0.003, d: 0.45, g: 0.55 });
  b.noise({ type: 'bandpass', f: 700, to: 350, q: 0.7, at: 0.04, a: 0.05, d: 0.32, g: 0.12, rate: 0.6 });
}

// Something hits a stone tower: a dull stone thunk with a little grit. Less
// ring than wood; harder hits are deeper.
function towerHit(b) {
  const p = Math.min(b.power, 1.2);
  const w = 0.4 + 0.6 * p;
  const f = rand(170, 205) * (1.1 - 0.2 * p);
  b.noise({ type: 'bandpass', f: 1800, q: 1, d: 0.012, g: 0.35 * w });
  b.tone({ f: f * 1.4, to: f, glide: 0.02, d: 0.09, g: 0.55 * w });
  b.tone({ type: 'triangle', f: f * 2.3, d: 0.035, g: 0.1 * w });
  b.noise({ type: 'bandpass', f: 700, to: 350, q: 1.8, d: 0.08, g: 0.35 * w });
  b.noise({ type: 'highpass', f: 3500, at: 0.015, d: 0.04, g: 0.07 * w });
}

// A tower falls: a crack and a crash, a rumble of tumbling stone (fluttering),
// single blocks knocking as they land, and one last pebble.
function towerDown(b) {
  const d = 1.9;
  b.noise({ type: 'highpass', f: 1500, d: 0.05, g: 0.4 });
  b.tone({ f: 85, to: 30, glide: 0.6, a: 0.005, d: 0.7, g: 0.8 });
  b.noise({ type: 'lowpass', f: 2000, to: 200, sweep: 0.6, q: 0.7, a: 0.005, d: 0.5, g: 0.55 });
  const rumble = b.gain(0.7);
  const src = b.noiseSrc(0.6);
  const lp = b.filter('lowpass', 600, 1, null);
  const e = b.gain(0, rumble);
  src.connect(lp);
  lp.connect(e);
  b.glide(lp.frequency, [[0, 700], [d, 160]]);
  b.line(e.gain, [[0, 0], [0.12, 0.75], [0.8, 0.55], [d, 0]]);
  const lfo = b.osc('sine');
  lfo.frequency.value = 9 / b.ts;
  lfo.connect(b.gain(0.35, rumble.gain));
  b.run(lfo, 0, d);
  b.run(src, 0, d);
  for (let i = 0; i < 8; i++) {
    const x = 0.14 + i * 0.16 + rand(0, 0.1);
    const k = 1 - i / 9;
    b.tone({ f: rand(140, 240), to: rand(78, 100), at: x, d: 0.07, g: 0.3 * k });
    b.noise({ type: 'bandpass', f: rand(600, 1400), q: 1.6, at: x, d: 0.05, g: 0.25 * k });
  }
  b.noise({ type: 'bandpass', f: 2600, q: 1.5, at: 1.65, d: 0.03, g: 0.07 });
}

// A castle wakes up: one big horn blast that swells and bends up into place.
function castleAwake(b) {
  const f = 110;
  const freqs = horn(
    b,
    [[0, f * 0.92], [0.1, f], [1, f * 0.995]],
    [[0, 220], [0.12, 1700], [0.5, 1200], [0.95, 800], [1.1, 260]],
    [[0, 0], [0.1, 0.9], [0.3, 1], [0.85, 0.8], [1.1, 0]],
  );
  b.wobble(freqs, f, 5, [[0, 0], [0.5, 0], [1, 0.01]], 0, 1.1);
}

// A crown won: a quick rising arpeggio landing on a ringing bell, with sparkle.
// o.foe (the other side scored): a softer, lower two-note "dong".
function crown(b) {
  if (b.o.foe) {
    bell(b, 523.3, 0, 0.2, 0.45, 'triangle');
    bell(b, 392, 0.17, 0.24, 0.8, 'triangle');
    b.tone({ f: 98, to: 78, at: 0.17, a: 0.01, d: 0.35, g: 0.18 });
    return;
  }
  [523.3, 659.3, 784].forEach((f, i) => b.tone({ type: 'triangle', f, at: i * 0.07, a: 0.003, d: 0.16, g: 0.22 }));
  bell(b, 1046.5, 0.21, 0.26, 0.9);
  for (const f of [261.6, 523.3, 659.3, 784]) b.tone({ type: 'triangle', f, at: 0.21, a: 0.02, h: 0.15, d: 0.5, g: 0.08 });
  sparkle(b, 0.26, 0.5, 6, 0.035);
}

// --- arena: spells -----------------------------------------------------------------------

// A boulder falling out of the sky (about 0.85 s): a whistle sliding down and a
// growing rush of air.
function boulderFall(b) {
  const d = 0.85;
  const o = b.osc('sine');
  b.glide(o.frequency, [[0, 1400], [d, 480]]);
  b.wobble(o.frequency, 900, 7, [[0, 0.004], [d, 0.012]], 0, d);
  const e = b.gain(0);
  o.connect(e);
  b.line(e.gain, [[0, 0], [0.12, 0.08], [d - 0.05, 0.15], [d, 0]]);
  b.run(o, 0, d);
  const src = b.noiseSrc(1);
  const bp = b.filter('bandpass', 1200, 0.9, null);
  const ea = b.gain(0);
  src.connect(bp);
  bp.connect(ea);
  b.glide(bp.frequency, [[0, 1300], [d, 420]]);
  b.line(ea.gain, [[0, 0], [d - 0.08, 0.38], [d, 0]]);
  b.run(src, 0, d);
}

// The boulder lands: a heavy thud that shakes the ground, then debris pattering down.
function boulderImpact(b) {
  const p = clamp(b.power, 0.3, 1.5);
  const w = 0.5 + 0.4 * Math.min(p, 1.4);
  b.noise({ type: 'bandpass', f: 1200, q: 0.8, d: 0.03, g: 0.4 * w });
  b.tone({ f: 80, to: 28, glide: 0.4, a: 0.003, d: 0.5, g: 0.9 * w });
  b.tone({ type: 'triangle', f: 140, to: 50, glide: 0.15, d: 0.18, g: 0.3 * w });
  b.noise({ type: 'lowpass', f: 900, to: 120, sweep: 0.6, q: 0.9, a: 0.003, d: 0.6, g: 0.65 * w });
  for (let i = 0; i < 7; i++) {
    const x = 0.08 + i * 0.07 + rand(0, 0.06);
    b.noise({ type: 'bandpass', f: rand(900, 2600), q: 2, at: x, d: rand(0.02, 0.04), g: 0.18 * w * (1 - x) });
    if (i < 3) b.tone({ f: rand(160, 240), to: 90, at: x, d: 0.05, g: 0.16 * w });
  }
}

// One volley of the arrow rain: a flurry of short thin "fft"s, out of step and
// sweeping down as the arrows drop (about 0.6 s), over one soft "cloud" swoosh.
function rainVolley(b) {
  for (let i = 0; i < 10; i++) {
    const f = rand(2000, 3400);
    const at = i * 0.035 + rand(0, 0.03);
    b.noise({ type: 'bandpass', f, to: f * 0.55, sweep: 0.15, q: 4, at, a: rand(0.03, 0.06), d: rand(0.07, 0.11), g: rand(0.12, 0.2) });
  }
  b.noise({ type: 'bandpass', f: 1400, to: 600, sweep: 0.5, q: 1.2, a: 0.18, d: 0.3, g: 0.14 });
}

// Cheese Wheel: a cheesy "boing" as it drops in, then a bumpy rolling rumble
// for the length of its roll (about 1.3 s).
function wheel(b) {
  const f = 300;
  const o = b.tone({ f: f * 0.7, to: f, glide: 0.06, a: 0.004, h: 0.08, d: 0.35, g: 0.32 });
  b.tone({ type: 'triangle', f: f * 2, at: 0.01, a: 0.004, h: 0.04, d: 0.2, g: 0.06 });
  b.wobble(o.frequency, f, 13, [[0, 0.3], [0.45, 0]], 0, 0.45);
  const d = 1.35;
  const bump = b.gain(0.6);
  const src = b.noiseSrc(0.5);
  const lp = b.filter('lowpass', 260, 2, null);
  const e = b.gain(0, bump);
  src.connect(lp);
  lp.connect(e);
  b.line(e.gain, [[0.1, 0], [0.3, 0.9], [d - 0.3, 0.8], [d, 0]]);
  const lfo = b.osc('triangle');
  lfo.frequency.value = 6 / b.ts; // the rind bumping round
  lfo.connect(b.gain(0.4, bump.gain));
  b.run(lfo, 0.1, d);
  b.run(src, 0.1, d);
  b.tone({ type: 'triangle', f: 55, at: 0.1, a: 0.12, h: 0.75, d: 0.4, g: 0.2 });
}

// --- arena: match moments ------------------------------------------------------------------

// Double mana: a sparkly chime running up two octaves, a bell on top, fairy dust.
function doubleMana(b) {
  [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => b.tone({ type: 'triangle', f, at: i * 0.075, a: 0.003, d: 0.3 + i * 0.05, g: 0.17 }));
  b.noise({ type: 'bandpass', f: 1500, to: 5000, sweep: 0.4, q: 2, a: 0.25, d: 0.2, g: 0.06 });
  bell(b, 1568, 0.38, 0.12, 0.6);
  sparkle(b, 0.1, 0.7, 8, 0.03);
}

// Overtime: a dramatic two-note horn (up a minor third, held with a growing
// shake) over a soft timpani roll.
function overtime(b) {
  const f1 = 130.8;
  const f2 = 155.6;
  const freqs = horn(
    b,
    [[0, f1 * 0.94], [0.06, f1], [0.3, f1], [0.36, f2 * 0.97], [0.45, f2], [1.35, f2 * 0.99]],
    [[0, 220], [0.08, 1300], [0.28, 800], [0.34, 350], [0.48, 1800], [0.9, 1200], [1.3, 900], [1.45, 260]],
    [[0, 0], [0.06, 0.8], [0.28, 0.65], [0.34, 0.3], [0.44, 1], [1.2, 0.85], [1.45, 0]],
  );
  b.wobble(freqs, f2, 5.5, [[0, 0], [0.6, 0], [1.4, 0.016]], 0, 1.45);
  for (let i = 0; i < 12; i++) {
    const x = 0.36 + i * 0.065;
    b.tone({ f: 78, to: 62, at: x, a: 0.003, d: 0.09, g: 0.07 + 0.02 * i });
  }
  b.tone({ f: 90, to: 48, at: 1.15, a: 0.003, d: 0.3, g: 0.45 });
}

// Clock tick for the last seconds: a dry woody tick. power >= 1 (the final
// few seconds) adds a low "tock" under it.
function tick(b) {
  b.noise({ type: 'bandpass', f: 3200, q: 3, a: 0.001, d: 0.012, g: 0.4 });
  b.tone({ f: 1250, a: 0.001, d: 0.035, g: 0.16 });
  b.tone({ type: 'triangle', f: 2510, a: 0.001, d: 0.015, g: 0.04 });
  if (b.power >= 1) b.tone({ f: 420, to: 330, a: 0.002, d: 0.09, g: 0.2 });
}

// --- menus: chests, cards, trophies --------------------------------------------------------

// A chest wobbles on the spot: the lid knocks on the box a few times, coins
// jingle inside, the box thumps down. o.big: heavier and a knock longer.
function chestShake(b) {
  const big = !!b.o.big;
  const n = big ? 5 : 4;
  const base = big ? 330 : 430;
  for (let i = 0; i < n; i++) {
    const x = i * 0.065 + rand(0, 0.015);
    const f = base * rand(0.95, 1.05) * (i % 2 ? 1.12 : 1);
    b.tone({ f: f * 1.2, to: f, glide: 0.01, at: x, d: 0.05, g: 0.32 });
    b.noise({ type: 'bandpass', f: 1600, q: 1.2, at: x, d: 0.015, g: 0.18 });
  }
  for (let i = 0; i < 3; i++) b.tone({ type: 'triangle', f: rand(2400, 3200), at: rand(0.02, n * 0.065), a: 0.001, d: 0.05, g: 0.04 });
  b.tone({ f: big ? 100 : 125, to: 65, at: n * 0.065, d: 0.1, g: 0.3 });
}

// A chest opens: the lid pops (cork pop + wooden clack), then a magical burst:
// a rising swoosh, a bright chord, a bell and sparkles. o.big rings longer.
function chestOpen(b) {
  const big = !!b.o.big;
  const s = big ? 1.3 : 1;
  b.tone({ f: 300, to: 900, glide: 0.03, a: 0.001, d: 0.05, g: 0.4 });
  b.noise({ type: 'bandpass', f: 2000, q: 1.5, d: 0.02, g: 0.3 });
  b.tone({ f: 520, to: 400, at: 0.04, d: 0.06, g: 0.3 });
  b.tone({ f: 130, to: 65, at: 0.05, d: 0.25, g: 0.3 });
  b.noise({ type: 'bandpass', f: 800, to: 5000, sweep: 0.35, q: 1, at: 0.05, a: 0.2, d: 0.25, g: 0.18 });
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => b.tone({ type: 'triangle', f, at: 0.12 + i * 0.04, a: 0.01, h: 0.15, d: 0.5 * s, g: 0.11 }));
  if (big) b.tone({ type: 'triangle', f: 130.8, at: 0.12, a: 0.03, h: 0.2, d: 0.6, g: 0.14 });
  bell(b, 2093, 0.28, 0.07, 0.6 * s);
  sparkle(b, 0.2, 0.7 * s, big ? 12 : 9, 0.032);
}

// A card flies out of the chest: a pop, then a chime that grows with rarity
// (o.rarity): common = one note, rare = two rising notes and a little sparkle,
// epic = a swell, a three-note chord, a high bell and a long sparkle,
// legendary = all of the epic one, then a brassy fanfare up to a high bell.
function cardReveal(b) {
  const r = b.o.rarity === 'legendary' ? 3 : b.o.rarity === 'epic' ? 2 : b.o.rarity === 'rare' ? 1 : 0;
  b.tone({ f: 380, to: 1100, glide: 0.035, a: 0.001, d: 0.05, g: 0.32 });
  b.noise({ type: 'bandpass', f: 2400, q: 2, d: 0.02, g: 0.2 });
  if (r === 0) {
    bell(b, 880, 0.04, 0.17, 0.3, 'triangle');
    return;
  }
  if (r === 1) {
    bell(b, 659.3, 0.04, 0.17, 0.25, 'triangle');
    bell(b, 987.8, 0.12, 0.2, 0.5, 'triangle');
    sparkle(b, 0.14, 0.3, 4, 0.03);
    return;
  }
  b.noise({ type: 'bandpass', f: 600, to: 3500, sweep: 0.3, q: 1.2, a: 0.22, d: 0.08, g: 0.1 });
  b.tone({ type: 'triangle', f: 130.8, at: 0.04, a: 0.05, h: 0.25, d: 0.5, g: 0.13 });
  [523.3, 659.3, 784].forEach((f, i) => bell(b, f, 0.04 + i * 0.06, 0.13, 0.7, 'triangle'));
  bell(b, 1568, 0.24, 0.12, 0.8);
  sparkle(b, 0.24, 0.7, 10, 0.035);
  if (r < 3) return;
  horn(
    b,
    [[0.3, 392], [0.42, 392], [0.46, 523.3], [0.58, 523.3], [0.62, 784], [1.3, 784]],
    [[0.3, 400], [0.36, 2200], [0.6, 1600], [0.7, 2600], [1.3, 900]],
    [[0.3, 0], [0.33, 0.22], [0.42, 0.18], [0.47, 0.25], [0.58, 0.2], [0.63, 0.32], [1.1, 0.22], [1.35, 0]],
  );
  bell(b, 2093, 0.64, 0.07, 0.9);
  sparkle(b, 0.62, 0.9, 12, 0.035, 2600, 4800);
}

// Card upgraded: a rising "whoomp", a fast arpeggio up an octave and a half and
// a sparkly cascade over the final chord.
function upgrade(b) {
  b.tone({ f: 90, to: 180, glide: 0.2, a: 0.02, d: 0.25, g: 0.3 });
  b.noise({ type: 'bandpass', f: 600, to: 4000, sweep: 0.4, q: 1.2, a: 0.25, d: 0.15, g: 0.12 });
  [392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => b.tone({ type: 'triangle', f, at: 0.05 + i * 0.06, a: 0.003, d: 0.2, g: 0.17 }));
  for (const f of [261.6, 523.3, 659.3, 784]) b.tone({ type: 'triangle', f, at: 0.36, a: 0.01, h: 0.2, d: 0.5, g: 0.08 });
  bell(b, 2093, 0.36, 0.07, 0.7);
  sparkle(b, 0.38, 0.6, 9, 0.032);
}

// Gold counting up: a tiny metallic "tink". o.pitch (0..1) climbs with the count.
function coins(b) {
  const f = 1050 * Math.pow(2, b.pitch * 0.6);
  b.tone({ type: 'triangle', f, a: 0.001, d: 0.05, g: 0.24 });
  b.tone({ f: f * 2.4, a: 0.001, d: 0.025, g: 0.045 });
  b.noise({ type: 'highpass', f: 5000, d: 0.008, g: 0.05 });
}

// Trophies gained: a bright "ta-daa", two rising notes and a glint.
function trophyUp(b) {
  b.tone({ type: 'triangle', f: 587.3, a: 0.003, d: 0.12, g: 0.22 });
  b.tone({ type: 'triangle', f: 880, at: 0.1, a: 0.005, h: 0.08, d: 0.4, g: 0.24 });
  b.tone({ type: 'triangle', f: 440, at: 0.1, a: 0.01, h: 0.08, d: 0.35, g: 0.08 });
  b.tone({ f: 1760, at: 0.1, a: 0.003, d: 0.25, g: 0.035 });
  sparkle(b, 0.15, 0.3, 4, 0.028);
}

// Trophies lost: two soft notes stepping down. No drama.
function trophyDown(b) {
  b.tone({ type: 'triangle', f: 440, a: 0.003, d: 0.14, g: 0.2 });
  b.tone({ type: 'triangle', f: 349.2, at: 0.14, a: 0.005, h: 0.05, d: 0.35, g: 0.2 });
  b.tone({ f: 174.6, at: 0.14, a: 0.01, d: 0.3, g: 0.08 });
}

// --- arena: the newer cards ----------------------------------------------------------------

// Pogo Bean hop: a springy "boyoing" that bends up and wobbles, the coil's
// twang on top and the stick tapping the dirt.
function boing(b) {
  const p = clamp(b.power, 0.3, 1.3);
  const w = 0.6 + 0.4 * Math.min(p, 1);
  const f = 210 + b.pitch * 90;
  b.noise({ type: 'lowpass', f: 520, a: 0.001, d: 0.03, g: 0.22 * w });
  const o = b.tone({ f: f * 0.7, to: f * 1.6, glide: 0.09, a: 0.004, h: 0.03, d: 0.2, g: 0.3 * w });
  b.wobble(o.frequency, f * 1.3, 22, [[0, 0.16], [0.3, 0.02]], 0, 0.3);
  b.tone({ type: 'triangle', f: f * 3.1, to: f * 4, glide: 0.05, d: 0.06, g: 0.05 * w });
}

// Boing Box glove: a leather snap and a long metal-spring "boyoyoyoing".
function glove(b) {
  b.noise({ type: 'bandpass', f: 1200, q: 1, a: 0.001, d: 0.02, g: 0.4 });
  b.tone({ f: 200, to: 90, d: 0.05, g: 0.3 });
  const f = 330;
  const o = b.tone({ type: 'triangle', f: f * 0.7, to: f * 1.25, glide: 0.06, a: 0.003, h: 0.06, d: 0.4, g: 0.26 });
  b.wobble(o.frequency, f, 28, [[0, 0.25], [0.5, 0.01]], 0, 0.5);
  const s = b.tone({ f: f * 2.1, d: 0.3, g: 0.05 });
  b.wobble(s.frequency, f * 2.1, 28, [[0, 0.2], [0.3, 0]], 0, 0.3);
}

// The Boing Box lid rattling just before the punch: four quick wooden knocks.
function rattle(b) {
  for (let i = 0; i < 4; i++) {
    const x = i * 0.045 + rand(0, 0.01);
    const f = rand(600, 750) * (i % 2 ? 1.1 : 1);
    b.tone({ f: f * 1.2, to: f, glide: 0.008, at: x, d: 0.035, g: 0.22 });
    b.noise({ type: 'bandpass', f: 2000, q: 1.5, at: x, d: 0.01, g: 0.12 });
  }
}

// A Sprout pops out of the Bean Patch: a cork pop, a puff of dirt, a tiny
// "yip" and a sprinkle of crumbs.
function sproutPop(b) {
  const f = 600 + b.pitch * 250;
  b.tone({ f: f * 0.4, to: f * 1.4, glide: 0.04, a: 0.001, d: 0.06, g: 0.4 });
  b.noise({ type: 'lowpass', f: 900, d: 0.05, g: 0.3 });
  b.tone({ type: 'triangle', f: f * 2, to: f * 2.6, glide: 0.05, at: 0.06, a: 0.005, d: 0.06, g: 0.12 });
  for (let i = 0; i < 3; i++) b.noise({ type: 'bandpass', f: rand(2000, 3500), q: 2, at: 0.07 + i * 0.03, d: 0.015, g: 0.08 });
}

// A building's crate lands: a heavy wooden thud, the hollow box, boards rattling.
function crateLand(b) {
  const p = clamp(b.power, 0.4, 1.4);
  b.tone({ f: 95, to: 40, glide: 0.2, a: 0.003, d: 0.3, g: 0.75 * p });
  b.noise({ type: 'lowpass', f: 800, to: 200, sweep: 0.3, d: 0.3, g: 0.5 * p });
  b.tone({ f: 260, to: 210, d: 0.1, g: 0.3 * p });
  for (let i = 0; i < 4; i++) b.tone({ f: rand(380, 520), at: 0.06 + i * 0.05 + rand(0, 0.02), d: 0.03, g: 0.12 * p * (1 - i / 5) });
}

// Something hits a wooden building: a hollow plank knock (brighter than stone).
function woodHit(b) {
  const p = Math.min(b.power, 1.2);
  const w = 0.4 + 0.6 * p;
  const f = rand(300, 360) * (1.1 - 0.2 * p);
  b.noise({ type: 'bandpass', f: 2200, q: 1, d: 0.01, g: 0.3 * w });
  b.tone({ f: f * 1.3, to: f, glide: 0.015, d: 0.12, g: 0.5 * w });
  b.tone({ type: 'triangle', f: f * 2.6, d: 0.05, g: 0.12 * w });
  b.noise({ type: 'bandpass', f: 900, to: 450, q: 2, d: 0.09, g: 0.3 * w });
}

// A building falls apart: a crack, a crash and planks clattering down.
// o.metal (the crane): iron bars clanging instead of planks.
function planks(b) {
  const metal = !!b.o.metal;
  const p = clamp(b.power, 0.4, 1.3);
  b.noise({ type: 'highpass', f: 1800, d: 0.04, g: 0.35 * p });
  b.tone({ f: 90, to: 35, glide: 0.4, a: 0.005, d: 0.5, g: 0.6 * p });
  b.noise({ type: 'lowpass', f: 1500, to: 200, sweep: 0.5, d: 0.5, g: 0.4 * p });
  for (let i = 0; i < 7; i++) {
    const x = 0.08 + i * 0.09 + rand(0, 0.05);
    const k = (1 - i / 8) * p;
    if (metal) b.tone({ f: rand(500, 900), at: x, d: 0.15, g: 0.1 * k });
    else b.tone({ f: rand(280, 420), to: rand(200, 260), glide: 0.02, at: x, d: 0.05, g: 0.28 * k });
    b.noise({ type: 'bandpass', f: rand(900, 2000), q: 1.5, at: x, d: 0.03, g: 0.15 * k });
  }
}

// The crane's cable and jib straining: a slow metal "eeeerk" (a saw ratchet
// through two narrow resonances).
function creak(b) {
  const d = rand(0.4, 0.55);
  const o = b.osc('sawtooth');
  b.glide(o.frequency, [[0, 30], [d * 0.5, 55], [d, 38]]);
  const e = b.gain(0);
  const bp1 = b.filter('bandpass', 1800, 12, e);
  const bp2 = b.filter('bandpass', 3100, 14, e);
  b.glide(bp1.frequency, [[0, 1800], [d, 1500]]);
  o.connect(bp1);
  o.connect(bp2);
  b.line(e.gain, [[0, 0], [0.08, 0.9], [d - 0.1, 1], [d, 0]]);
  b.run(o, 0, d);
}

// Banana peel: a shoe squeak, a slide whistle up as the feet go up, and a
// bump on the back.
function slip(b) {
  const s = b.osc('sawtooth');
  b.glide(s.frequency, [[0, 900], [0.06, 1700]]);
  const bp = b.filter('bandpass', 2400, 6, null);
  const e = b.gain(0);
  s.connect(bp);
  bp.connect(e);
  b.run(s, 0, b.perc(e.gain, 0, 0.004, 0.03, 0.05, 0.14));
  const o = b.tone({ f: 520, to: 1500, glide: 0.3, at: 0.05, a: 0.03, h: 0.2, d: 0.12, g: 0.13 });
  b.wobble(o.frequency, 1000, 7, [[0.05, 0], [0.4, 0.015]], 0.05, 0.4);
  b.tone({ f: 120, to: 50, at: 0.42, d: 0.12, g: 0.4 });
  b.noise({ type: 'lowpass', f: 600, at: 0.42, d: 0.08, g: 0.3 });
}

// A heavy skids on a peel instead: a low rubbery scrape.
function skid(b) {
  const s = b.osc('sawtooth');
  b.glide(s.frequency, [[0, 70], [0.3, 55]]);
  const bp = b.filter('bandpass', 900, 3, null);
  const e = b.gain(0);
  s.connect(bp);
  bp.connect(e);
  b.line(e.gain, [[0, 0], [0.03, 0.3], [0.25, 0.25], [0.32, 0]]);
  b.run(s, 0, 0.32);
  b.noise({ type: 'bandpass', f: 800, to: 400, sweep: 0.3, q: 1.2, a: 0.02, h: 0.15, d: 0.12, g: 0.25 });
}

// Big Sneeze, part one: "ah... ah..." (two breathy rising gasps).
function inhale(b) {
  const f = 240 + b.pitch * 60;
  for (const [at, k] of [[0, 1], [0.2, 1.15]]) {
    b.speak({
      f0: [[at, f * k * 0.95], [at + 0.14, f * k * 1.2]],
      vowels: [[at, 'a'], [at + 0.14, 'a']],
      env: [[at, 0], [at + 0.04, 0.6], [at + 0.12, 0.55], [at + 0.15, 0]],
      breath: 0.3,
    });
  }
  b.noise({ type: 'bandpass', f: 900, to: 1800, sweep: 0.35, q: 1, a: 0.3, d: 0.06, g: 0.1 });
}

// Big Sneeze, part two: "CHOO!", a hiss, a voiced "oo" and the blast of air.
function achoo(b) {
  const f = 300 + b.pitch * 80;
  b.noise({ type: 'highpass', f: 2500, a: 0.004, d: 0.09, g: 0.5 });
  b.speak({
    f0: [[0.03, f * 1.3], [0.08, f * 1.45], [0.35, f * 0.8]],
    vowels: [[0.03, 'u'], [0.35, 'u']],
    env: [[0.03, 0], [0.06, 1], [0.22, 0.7], [0.36, 0]],
    breath: 0.25,
  });
  b.noise({ type: 'bandpass', f: 600, to: 2600, sweep: 0.2, q: 0.7, at: 0.02, a: 0.03, h: 0.1, d: 0.4, g: 0.4 });
  b.noise({ type: 'lowpass', f: 400, at: 0.02, d: 0.25, g: 0.3 });
}

// Shaken Soda: 1.2 s of fizz getting angrier, sloshing as the bottle shakes,
// with little crackling bubbles.
function fizz(b) {
  const d = 1.2;
  const src = b.noiseSrc(1);
  const hp = b.filter('highpass', 3500, 0.7, null);
  const e = b.gain(0);
  src.connect(hp);
  hp.connect(e);
  b.line(e.gain, [[0, 0], [0.1, 0.05], [d - 0.1, 0.2], [d, 0.04]]);
  b.run(src, 0, d);
  for (let i = 0; i < 16; i++) {
    const x = rand(0, d);
    b.tone({ f: rand(2500, 5000), at: x, a: 0.001, d: 0.012, g: 0.04 + (0.06 * x) / d });
  }
  for (let i = 0; i < 5; i++) b.noise({ type: 'bandpass', f: 500, q: 2, at: 0.08 + i * 0.22, a: 0.02, d: 0.08, g: 0.1 + 0.03 * i });
}

// ...and POP: the cap flies, the geyser roars up (a whoosh) and sprays down.
function sodaPop(b) {
  b.tone({ f: 380, to: 1400, glide: 0.03, a: 0.001, d: 0.05, g: 0.45 });
  b.noise({ type: 'bandpass', f: 2200, q: 1.5, d: 0.02, g: 0.35 });
  b.tone({ f: 90, to: 45, d: 0.25, g: 0.4 });
  const d = 0.75;
  const src = b.noiseSrc(1);
  const bp = b.filter('bandpass', 500, 0.9, null);
  const e = b.gain(0);
  src.connect(bp);
  bp.connect(e);
  b.glide(bp.frequency, [[0, 500], [0.12, 2400], [d, 900]]);
  b.line(e.gain, [[0, 0], [0.08, 0.7], [0.35, 0.55], [d, 0]]);
  b.run(src, 0, d);
  b.noise({ type: 'highpass', f: 4000, at: 0.05, a: 0.05, h: 0.3, d: 0.35, g: 0.12 });
}

// Anvil: CLANG. A heavy thud and the long, beating ring of thick iron.
function clang(b) {
  const p = clamp(b.power, 0.5, 1.5);
  const w = 0.5 + 0.4 * Math.min(p, 1.4);
  const f = rand(420, 470);
  b.noise({ type: 'highpass', f: 3000, d: 0.02, g: 0.5 * w });
  b.tone({ f: 75, to: 32, glide: 0.3, a: 0.003, d: 0.4, g: 0.8 * w });
  b.noise({ type: 'lowpass', f: 900, to: 150, sweep: 0.4, d: 0.4, g: 0.45 * w });
  for (const [r, g, d] of [[1, 0.28, 1.1], [2.32, 0.2, 0.8], [3.98, 0.12, 0.55], [5.6, 0.08, 0.35], [7.9, 0.05, 0.2]]) b.tone({ f: f * r, d, g: g * 0.8 * w });
  b.tone({ f: f * 1.006, d: 1.1, g: 0.12 * w });
}

// Nutcracker bite: the wooden jaw clacks shut and the shell cracks to bits.
function crunch(b) {
  const p = Math.min(b.power, 1.3);
  const w = 0.5 + 0.5 * p;
  b.tone({ f: 900, to: 650, glide: 0.015, d: 0.04, g: 0.4 * w });
  b.tone({ type: 'triangle', f: 1450, d: 0.025, g: 0.12 * w });
  for (let i = 0; i < 6; i++) {
    const x = 0.01 + i * 0.018 + rand(0, 0.012);
    b.noise({ type: 'bandpass', f: rand(1400, 3600), q: 1.5, at: x, a: 0.001, d: rand(0.015, 0.03), g: 0.35 * w * (1 - i / 8) });
  }
  b.tone({ f: 140, to: 60, d: 0.1, g: 0.4 * w });
}

// Tummy Drummer: one BOOM on the bass drum (a felt mallet on a slack skin).
function drum(b) {
  const f = 105 + b.pitch * 20;
  b.tone({ f: f * 1.6, to: f, glide: 0.03, a: 0.002, d: 0.32, g: 0.7 });
  b.tone({ type: 'triangle', f: f * 2.4, to: f * 1.8, glide: 0.03, d: 0.08, g: 0.12 });
  b.noise({ type: 'lowpass', f: 1200, to: 300, a: 0.001, d: 0.05, g: 0.3 });
}

// Propeller Pals: blades chopping the air as they spin up. o.down: the lift
// cuts out and the propeller sputters down.
function whirr(b) {
  const down = !!b.o.down;
  const d = down ? 0.7 : 0.55;
  const src = b.noiseSrc(1);
  const bp = b.filter('bandpass', 1400, 1.2, null);
  const e = b.gain(0);
  src.connect(bp);
  bp.connect(e);
  b.glide(bp.frequency, down ? [[0, 1600], [d, 500]] : [[0, 700], [d * 0.5, 1700], [d, 1500]]);
  b.line(e.gain, down ? [[0, 0.28], [d, 0]] : [[0, 0], [0.1, 0.24], [d * 0.7, 0.24], [d, 0]]);
  const chop = b.osc('square');
  b.glide(chop.frequency, down ? [[0, 36], [d, 6]] : [[0, 12], [d, 38]]);
  chop.connect(b.gain(0.18, e.gain));
  b.run(chop, 0, d);
  b.run(src, 0, d);
  const o = b.osc('sawtooth');
  b.glide(o.frequency, down ? [[0, 170], [d, 60]] : [[0, 90], [d, 180]]);
  const lp = b.filter('lowpass', 600, 1, null);
  const h = b.gain(0);
  o.connect(lp);
  lp.connect(h);
  b.line(h.gain, down ? [[0, 0.08], [d, 0]] : [[0, 0], [0.1, 0.07], [d, 0]]);
  b.run(o, 0, d);
}

// Pelican: a honking "SKRAAWK" (a harsh, flapping bird voice).
function squawk(b) {
  const f = 360 + b.pitch * 80;
  const d = rand(0.28, 0.36);
  b.noise({ type: 'bandpass', f: 2200, q: 2, d: 0.05, g: 0.15 });
  b.speak({
    f0: [[0, f * 0.8], [0.05, f * 1.2], [d * 0.5, f * 1.1], [d, f * 0.7]],
    vowels: [[0, 'e'], [0.06, 'a'], [d, 'o']],
    env: [[0, 0], [0.02, 1], [d * 0.7, 0.8], [d, 0]],
    vib: [[0, 0.06], [d, 0.1]],
    vibRate: 28,
    breath: 0.2,
    form: 0.95,
  });
}

// Big Jelly swallows a bean: a wet "bloop" bending up, then back down.
function bloop(b) {
  const p = clamp(b.power, 0.3, 1.3);
  const w = 0.6 + 0.4 * Math.min(p, 1);
  const f = 180 + b.pitch * 60;
  b.tone({ f: f * 0.6, to: f * 2.2, glide: 0.07, a: 0.004, d: 0.12, g: 0.45 * w });
  b.tone({ f: f * 1.8, to: f * 0.9, glide: 0.08, at: 0.07, a: 0.004, d: 0.12, g: 0.25 * w });
  b.noise({ type: 'lowpass', f: 500, q: 3, d: 0.12, g: 0.2 * w });
}

// ...and spits it out: "p-TOO!" and a wet whoosh.
function ptoo(b) {
  b.noise({ type: 'lowpass', f: 700, a: 0.001, d: 0.02, g: 0.5 });
  b.tone({ f: 260, to: 120, d: 0.04, g: 0.35 });
  b.noise({ type: 'highpass', f: 3000, at: 0.03, d: 0.03, g: 0.35 });
  const f = 200 + b.pitch * 60;
  b.speak({
    f0: [[0.05, f * 1.3], [0.25, f * 0.8]],
    vowels: [[0.05, 'u'], [0.25, 'u']],
    env: [[0.05, 0], [0.07, 1], [0.18, 0.6], [0.26, 0]],
    breath: 0.15,
    form: 1,
  });
  b.noise({ type: 'bandpass', f: 1200, to: 400, sweep: 0.3, q: 1, at: 0.06, a: 0.03, d: 0.25, g: 0.2 });
}

// Bubble Wrap absorbing a hit: pop-pop-pop (more pops for a harder hit).
function bubblePop(b) {
  const n = 2 + Math.round(2 * Math.min(b.power, 1.2));
  let x = 0;
  for (let i = 0; i < n; i++) {
    x += rand(0.025, 0.06);
    b.noise({ type: 'bandpass', f: rand(1800, 3200), q: 2.5, at: x, a: 0.0008, d: 0.012, g: 0.4 });
    b.tone({ f: rand(900, 1300), to: rand(400, 600), glide: 0.01, at: x, a: 0.0008, d: 0.018, g: 0.15 });
  }
}

// Bubble Wrap cast: crinkly plastic, a stretchy squeak and a little shimmer.
function wrapOn(b) {
  for (let i = 0; i < 10; i++) b.noise({ type: 'highpass', f: rand(3000, 6000), at: rand(0, 0.35), a: 0.001, d: rand(0.008, 0.02), g: rand(0.08, 0.18) });
  b.tone({ type: 'triangle', f: 700, to: 1100, glide: 0.25, a: 0.05, h: 0.1, d: 0.15, g: 0.06 });
  sparkle(b, 0.1, 0.3, 4, 0.03);
}

// Brolly: the umbrella snaps open with a cloth "fwump" and its catch clicks.
// o.flip: blown inside out (a second flap and the spokes twanging).
function umbrella(b) {
  b.noise({ type: 'bandpass', f: 500, to: 1400, sweep: 0.08, q: 0.8, a: 0.01, d: 0.12, g: 0.5 });
  b.noise({ type: 'lowpass', f: 300, a: 0.005, d: 0.1, g: 0.35 });
  b.tone({ f: 1400, at: 0.06, a: 0.001, d: 0.02, g: 0.08 });
  if (!b.o.flip) return;
  b.noise({ type: 'bandpass', f: 700, to: 1800, sweep: 0.06, q: 0.8, at: 0.1, a: 0.01, d: 0.1, g: 0.4 });
  const o = b.tone({ type: 'triangle', f: 520, to: 380, glide: 0.2, at: 0.08, d: 0.3, g: 0.12 });
  b.wobble(o.frequency, 450, 18, [[0.08, 0.06], [0.4, 0]], 0.08, 0.4);
}

// Butterfly Netter catch: a quick swish, the mesh closing, a soft thump.
function netSwish(b) {
  b.noise({ type: 'bandpass', f: 900, to: 3800, sweep: 0.08, q: 1.4, a: 0.04, d: 0.06, g: 0.4 });
  b.noise({ type: 'highpass', f: 4500, at: 0.08, d: 0.04, g: 0.15 });
  b.tone({ f: 220, to: 120, at: 0.08, d: 0.06, g: 0.2 });
}

// --- sound table ---------------------------------------------------------------------

// gap: min seconds between two of the same sound (a much harder hit may still
//      get through); max: how many may overlap; level: rough loudness used to
//      pick what to drop when it gets busy; trim: output gain; jit: random
//      pitch spread; hit: louder with o.power; now: starts without the few ms
//      of random delay (taps on buttons and cards should feel instant).
const SOUNDS = {
  bonk: { fn: bonk, gap: 0.03, max: 6, level: 1, trim: 0.8, hit: true },
  slash: { fn: slash, gap: 0.03, max: 5, level: 0.7, trim: 1, hit: true },
  clank: { fn: clank, gap: 0.035, max: 5, level: 0.85, trim: 0.95, hit: true },
  whoosh: { fn: whoosh, gap: 0.04, max: 4, level: 0.3, trim: 0.55, hit: true },
  bowDraw: { fn: bowDraw, gap: 0.1, max: 3, level: 0.15, trim: 0.45 },
  bowRelease: { fn: bowRelease, gap: 0.04, max: 4, level: 0.45, trim: 0.65 },
  arrowBody: { fn: arrowBody, gap: 0.03, max: 4, level: 0.55, trim: 0.9, hit: true },
  arrowShield: { fn: arrowShield, gap: 0.03, max: 4, level: 0.5, trim: 0.8 },
  arrowGround: { fn: arrowGround, gap: 0.03, max: 4, level: 0.35, trim: 0.8 },
  step: { fn: step, gap: 0.035, max: 3, level: 0.1, trim: 0.5 },
  land: { fn: land, gap: 0.04, max: 5, level: 0.9, trim: 0.95, hit: true },
  scream: { fn: scream, gap: 0.12, max: 3, level: 0.75, trim: 1.2, jit: 0.02 },
  grunt: { fn: grunt, gap: 0.07, max: 3, level: 0.5, trim: 1.1, jit: 0.02 },
  death: { fn: death, gap: 0.1, max: 3, level: 0.8, trim: 1.3, jit: 0.02 },
  hitVoice: { fn: hitVoice, gap: 0.09, max: 3, level: 0.65, trim: 1.5, jit: 0.02 },
  battleStart: { fn: battleStart, gap: 1, max: 1, level: 3, trim: 0.36, jit: 0 },
  victory: { fn: victory, gap: 1, max: 1, level: 3, trim: 0.6, jit: 0 },
  defeat: { fn: defeat, gap: 1, max: 1, level: 3, trim: 0.42, jit: 0 },
  draw: { fn: draw, gap: 1, max: 1, level: 3, trim: 0.47, jit: 0 },
  place: { fn: place, gap: 0.03, max: 4, level: 1.5, trim: 0.75, jit: 0.03 },
  remove: { fn: remove, gap: 0.03, max: 3, level: 1.5, trim: 0.9 },
  grab: { fn: grab, gap: 0.05, max: 2, level: 1.5, trim: 1.1 },
  drop: { fn: drop, gap: 0.05, max: 2, level: 1.5, trim: 1.1 },
  ui: { fn: ui, gap: 0.04, max: 2, level: 1.5, trim: 0.6, jit: 0.01, now: true },
  cheer: { fn: cheer, gap: 0.06, max: 4, level: 0.45, trim: 1, jit: 0.02 },
  boom: { fn: boom, gap: 0.04, max: 4, level: 1.4, trim: 0.9, hit: true },
  quake: { fn: quake, gap: 0.06, max: 3, level: 1.2, trim: 0.95, hit: true },
  fuse: { fn: fuse, gap: 0.08, max: 3, level: 0.5, trim: 0.9 },
  coin: { fn: coin, gap: 0.05, max: 3, level: 1.5, trim: 0.7, jit: 0.02 },
  star: { fn: star, gap: 0.1, max: 3, level: 2, trim: 0.8, jit: 0 },
  pop: { fn: pop, gap: 0.05, max: 3, level: 0.8, trim: 0.9, jit: 0.04 },
  // Arena: cards
  cardPick: { fn: cardPick, gap: 0.04, max: 2, level: 1.5, trim: 0.7, jit: 0.01, now: true },
  cardDenied: { fn: cardDenied, gap: 0.15, max: 1, level: 1.5, trim: 0.3, jit: 0, now: true },
  deploy: { fn: deploy, gap: 0.05, max: 3, level: 1.2, trim: 0.8, jit: 0.03 },
  // Arena: towers
  towerShot: { fn: towerShot, gap: 0.05, max: 4, level: 0.5, trim: 0.6, jit: 0.03 },
  cannon: { fn: cannon, gap: 0.08, max: 2, level: 1.1, trim: 0.55, jit: 0.03 },
  towerHit: { fn: towerHit, gap: 0.05, max: 4, level: 0.6, trim: 0.75, hit: true, jit: 0.05 },
  towerDown: { fn: towerDown, gap: 0.3, max: 2, level: 2.5, trim: 0.7, jit: 0.03 },
  castleAwake: { fn: castleAwake, gap: 0.5, max: 2, level: 2, trim: 0.5, jit: 0 },
  crown: { fn: crown, gap: 0.3, max: 2, level: 2.5, trim: 1.1, jit: 0 },
  // Arena: spells
  boulderFall: { fn: boulderFall, gap: 0.1, max: 2, level: 0.8, trim: 0.65, jit: 0.04 },
  boulderImpact: { fn: boulderImpact, gap: 0.08, max: 2, level: 1.6, trim: 0.65, hit: true, jit: 0.03 },
  rainVolley: { fn: rainVolley, gap: 0.12, max: 3, level: 0.7, trim: 3.2, jit: 0.04 },
  wheel: { fn: wheel, gap: 0.2, max: 2, level: 1, trim: 0.6, jit: 0.03 },
  // Arena: match moments
  doubleMana: { fn: doubleMana, gap: 1, max: 1, level: 2.5, trim: 1.8, jit: 0 },
  overtime: { fn: overtime, gap: 1, max: 1, level: 3, trim: 0.5, jit: 0 },
  tick: { fn: tick, gap: 0.3, max: 2, level: 1.5, trim: 1.2, jit: 0, now: true },
  // Menus
  tabSwitch: { fn: tabSwitch, gap: 0.04, max: 2, level: 1.5, trim: 0.6, jit: 0.01, now: true },
  chestShake: { fn: chestShake, gap: 0.15, max: 2, level: 1.5, trim: 1.4, jit: 0.02 },
  chestOpen: { fn: chestOpen, gap: 0.3, max: 2, level: 2.5, trim: 1.5, jit: 0 },
  cardReveal: { fn: cardReveal, gap: 0.08, max: 3, level: 2, trim: 1.5, jit: 0 },
  upgrade: { fn: upgrade, gap: 0.3, max: 2, level: 2.5, trim: 1.5, jit: 0 },
  coins: { fn: coins, gap: 0.03, max: 3, level: 1.5, trim: 1, jit: 0.01, now: true },
  trophyUp: { fn: trophyUp, gap: 0.3, max: 2, level: 2, trim: 1, jit: 0 },
  trophyDown: { fn: trophyDown, gap: 0.3, max: 2, level: 2, trim: 0.85, jit: 0 },
  // Arena: the newer cards
  boing: { fn: boing, gap: 0.06, max: 3, level: 0.6, trim: 0.8, hit: true },
  glove: { fn: glove, gap: 0.1, max: 2, level: 1, trim: 0.9, jit: 0.03 },
  rattle: { fn: rattle, gap: 0.15, max: 2, level: 0.4, trim: 0.8, jit: 0.04 },
  sproutPop: { fn: sproutPop, gap: 0.08, max: 2, level: 0.6, trim: 0.8 },
  crateLand: { fn: crateLand, gap: 0.1, max: 2, level: 1.3, trim: 0.75, hit: true, jit: 0.03 },
  woodHit: { fn: woodHit, gap: 0.05, max: 4, level: 0.6, trim: 0.75, hit: true, jit: 0.05 },
  planks: { fn: planks, gap: 0.2, max: 2, level: 1.8, trim: 0.7, hit: true, jit: 0.03 },
  creak: { fn: creak, gap: 0.3, max: 2, level: 0.5, trim: 1.1, jit: 0.05 },
  slip: { fn: slip, gap: 0.08, max: 3, level: 0.8, trim: 0.9, jit: 0.04 },
  skid: { fn: skid, gap: 0.12, max: 2, level: 0.6, trim: 0.8, jit: 0.04 },
  inhale: { fn: inhale, gap: 0.3, max: 2, level: 0.8, trim: 1, jit: 0.02 },
  achoo: { fn: achoo, gap: 0.3, max: 2, level: 1.5, trim: 1.1, jit: 0.02 },
  fizz: { fn: fizz, gap: 0.3, max: 2, level: 0.7, trim: 1, jit: 0.03 },
  sodaPop: { fn: sodaPop, gap: 0.2, max: 2, level: 1.5, trim: 0.9, jit: 0.03 },
  clang: { fn: clang, gap: 0.15, max: 2, level: 1.8, trim: 0.7, hit: true, jit: 0.02 },
  crunch: { fn: crunch, gap: 0.05, max: 3, level: 1, trim: 0.9, hit: true, jit: 0.05 },
  drum: { fn: drum, gap: 0.12, max: 3, level: 0.7, trim: 0.75, jit: 0.02 },
  whirr: { fn: whirr, gap: 0.15, max: 3, level: 0.4, trim: 0.9, jit: 0.05 },
  squawk: { fn: squawk, gap: 0.4, max: 2, level: 0.9, trim: 1.1, jit: 0.03 },
  bloop: { fn: bloop, gap: 0.08, max: 3, level: 0.8, trim: 0.9, hit: true, jit: 0.04 },
  ptoo: { fn: ptoo, gap: 0.15, max: 2, level: 0.9, trim: 1, jit: 0.03 },
  bubblePop: { fn: bubblePop, gap: 0.06, max: 3, level: 0.5, trim: 1.1, hit: true, jit: 0.05 },
  wrapOn: { fn: wrapOn, gap: 0.2, max: 2, level: 0.8, trim: 1, jit: 0.02 },
  umbrella: { fn: umbrella, gap: 0.07, max: 3, level: 0.6, trim: 1.3, jit: 0.05 },
  netSwish: { fn: netSwish, gap: 0.08, max: 2, level: 0.7, trim: 0.9, jit: 0.04 },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

const soundFor = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null);

// --- the synth -----------------------------------------------------------------------

export class BattleAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this._muted = false;
    this._paused = false;
    this._unlockAt = -1e9;
    this.voices = []; // every sound whose nodes are not freed yet
    this.last = new Map(); // name -> { t, level } of the last one played
  }

  /** Call from a user gesture (needed on iOS). Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        let ctx;
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          ctx = new AC();
        }
        this.master = this._chain(ctx, ctx.destination);
        this.master.gain.value = this._muted ? 0 : this.volume;
        this.ctx = ctx;
      }
      this._paused = false;
      this._unlockAt = nowMs();
      if (this.ctx.state !== 'running') quiet(this.ctx.resume());
      // Old iOS: playing a silent buffer inside the gesture finishes the unlock.
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
    } catch {
      // No audio on this device; stay silent.
    }
  }

  setMuted(m) {
    this._muted = !!m;
    this._applyGain();
  }

  get muted() {
    return this._muted;
  }

  setVolume(v) {
    this.volume = clamp(num(v, this.volume), 0, 1);
    this._applyGain();
  }

  /** Page hidden. */
  suspend() {
    this._paused = true;
    try {
      if (this.ctx && this.ctx.state === 'running') quiet(this.ctx.suspend());
    } catch {
      // ignore
    }
  }

  /** Page visible again. */
  resume() {
    this._paused = false;
    try {
      if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') quiet(this.ctx.resume());
    } catch {
      // ignore
    }
  }

  /** Fire-and-forget. Unknown names are ignored; never throws. */
  play(name, o = {}) {
    try {
      const ctx = this.ctx;
      if (!ctx || this._muted || this._paused) return;
      // Right after unlock() the context may still be starting up.
      if (ctx.state !== 'running' && !(ctx.state === 'suspended' && nowMs() - this._unlockAt < 500)) return;
      const rec = soundFor(name);
      if (!rec) return;
      o = o && typeof o === 'object' ? o : {};
      const t = ctx.currentTime;
      const level = this._level(rec, o);
      if (level < 0.004) return;
      const last = this.last.get(name);
      if (last && t - last.t < rec.gap && level < last.level * 1.6) return;
      this._prune(t);
      const live = this.voices.filter((v) => !v.killed && v.end > t);
      if (!this._makeRoom(live.filter((v) => v.name === name), rec.max, level, t)) return;
      if (!this._makeRoom(live.filter((v) => !v.killed), MAX_VOICES, level, t)) return;
      // A few ms of random delay so piled-up sounds don't phase into one click.
      const v = this._build(ctx, this.master, t + (rec.now ? 0 : Math.random() * 0.01), name, o);
      v.level = level;
      this.voices.push(v);
      this.last.set(name, { t, level });
      let left = v.srcs.length;
      const done = () => {
        if (--left <= 0) this._free(v);
      };
      for (const s of v.srcs) s.onended = done;
    } catch {
      // A sound must never break the game.
    }
  }

  /** How many sounds are playing right now. */
  get activeVoices() {
    if (!this.ctx) return 0;
    const t = this.ctx.currentTime;
    return this.voices.filter((v) => !v.killed && v.end > t).length;
  }

  // --- internals -----------------------------------------------------------------

  /** master gain -> compressor -> soft clip -> dest. Returns the master gain. */
  _chain(ctx, dest) {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    // Gentle: single sounds pass almost untouched, pile-ups get squeezed.
    comp.threshold.value = -8;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const pre = ctx.createGain();
    pre.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    master.connect(comp);
    comp.connect(pre);
    pre.connect(clip);
    clip.connect(dest);
    return master;
  }

  /**
   * Build one sound into `dest` at time t0 on any context (an
   * OfflineAudioContext works too, for tests). Returns its voice record.
   */
  _build(ctx, dest, t0, name, o = {}) {
    const rec = soundFor(name);
    if (!rec) return null;
    o = o && typeof o === 'object' ? o : {};
    const bus = ctx.createGain();
    bus.gain.value = rec.trim * clamp(num(o.vol, 1), 0, 1);
    let tail = bus;
    const pan = clamp(num(o.pan, 0), -1, 1);
    if (pan && ctx.createStereoPanner) {
      tail = ctx.createStereoPanner();
      tail.pan.value = pan;
      bus.connect(tail);
    }
    tail.connect(dest);
    const b = new Builder(ctx, bus, t0, o, rec.jit ?? 0.04);
    rec.fn(b);
    b.nodes.push(bus);
    if (tail !== bus) b.nodes.push(tail);
    return { name, bus, nodes: b.nodes, srcs: b.srcs, start: t0, end: b.end, level: rec.level, killed: false, freed: false };
  }

  _level(rec, o) {
    const vol = clamp(num(o.vol, 1), 0, 1);
    const hit = rec.hit ? 0.4 + 0.6 * Math.min(clamp(num(o.power, 0.7), 0, 1.5), 1.2) : 1;
    return rec.level * vol * hit;
  }

  /** Room for one more in `list`? Fades out the quietest if the new one is louder. */
  _makeRoom(list, max, level, t) {
    if (list.length < max) return true;
    let victim = null;
    let score = Infinity;
    for (const v of list) {
      const s = v.level * clamp((v.end - t) / Math.max(0.01, v.end - v.start), 0, 1);
      if (s < score) {
        score = s;
        victim = v;
      }
    }
    if (!victim || score > level) return false;
    this._kill(victim, t);
    return list.length - 1 < max;
  }

  _kill(v, t) {
    v.killed = true;
    try {
      const g = v.bus.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.03);
    } catch {
      // ignore
    }
    for (const s of v.srcs) {
      try {
        s.stop(t + 0.04);
      } catch {
        // not started or already stopped
      }
    }
    v.end = Math.min(v.end, t + 0.05);
  }

  /** Drop finished sounds whose "ended" event never came. */
  _prune(t) {
    for (const v of this.voices.slice()) if (t > v.end + 2) this._free(v);
  }

  _free(v) {
    if (v.freed) return;
    v.freed = true;
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        // already disconnected
      }
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  _applyGain() {
    if (!this.master || !this.ctx) return;
    const g = this._muted ? 0 : this.volume;
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
    } catch {
      this.master.gain.value = g;
    }
  }
}
