// Comic WebAudio synth for BATTLE. Every sound is generated on the fly from a
// few oscillators and filtered noise: wooden bonks, squeaky bean voices, a war
// horn and a sad trombone. Nothing to download.
//
// play(name, o) is fire-and-forget. Options (all optional):
//   pan   -1..1   stereo position
//   vol   0..1    extra attenuation (distance from the camera)
//   power 0..1+   hit strength / swing speed / impact speed
//   pitch 0..1    per-unit voice pitch, so every bean sounds a bit different
//   rate  .25..2  game time scale; slow motion lowers and stretches sounds
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

// Sad trombone: "wah wah wah waaaah", each note opened and closed by a wah
// filter, the last one wobbling.
function defeat(b) {
  const lp = b.filter('lowpass', 300, 2.5, null);
  const e = b.gain(0);
  lp.connect(e);
  const oscs = [b.osc('sawtooth'), b.osc('sawtooth')];
  oscs[0].connect(b.gain(0.5, lp));
  oscs[1].connect(b.gain(0.5, lp));
  const notes = [[0, 233.1, 0.26], [0.28, 220, 0.26], [0.56, 207.7, 0.26], [0.84, 196, 0.8]];
  const env = [];
  const wah = [];
  for (const [x, f, len] of notes) {
    oscs.forEach((o, i) => {
      const m = i ? 1.005 : 1;
      o.frequency.setValueAtTime(b.hz(f * m * 1.02), b.at(x));
      o.frequency.exponentialRampToValueAtTime(b.hz(f * m), b.at(x + 0.04));
    });
    env.push([x, 0], [x + 0.03, 0.9], [x + len - 0.05, 0.7], [x + len, 0]);
    wah.push([x, 300], [x + Math.min(0.1, len * 0.4), 1300], [x + len, 450]);
  }
  b.line(e.gain, env);
  b.glide(lp.frequency, wah);
  b.wobble(oscs.map((o) => o.frequency), 196, 5.5, [[0, 0], [0.95, 0], [1.2, 0.015], [1.64, 0.045]], 0, 1.64);
  for (const o of oscs) b.run(o, 0, 1.64);
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

function ui(b) {
  b.tone({ f: 1900, to: 1300, glide: 0.02, a: 0.001, d: 0.03, g: 0.25 });
  b.noise({ type: 'bandpass', f: 4000, q: 1, a: 0.001, d: 0.01, g: 0.1 });
}

// --- sound table ---------------------------------------------------------------------

// gap: min seconds between two of the same sound (a much harder hit may still
//      get through); max: how many may overlap; level: rough loudness used to
//      pick what to drop when it gets busy; trim: output gain; jit: random
//      pitch spread; hit: louder with o.power.
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
  defeat: { fn: defeat, gap: 1, max: 1, level: 3, trim: 0.55, jit: 0 },
  place: { fn: place, gap: 0.03, max: 4, level: 1.5, trim: 0.75, jit: 0.03 },
  remove: { fn: remove, gap: 0.03, max: 3, level: 1.5, trim: 0.9 },
  grab: { fn: grab, gap: 0.05, max: 2, level: 1.5, trim: 1.1 },
  drop: { fn: drop, gap: 0.05, max: 2, level: 1.5, trim: 1.1 },
  ui: { fn: ui, gap: 0.04, max: 2, level: 1.5, trim: 0.6, jit: 0.01 },
  cheer: { fn: cheer, gap: 0.06, max: 4, level: 0.45, trim: 1, jit: 0.02 },
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
      const v = this._build(ctx, this.master, t + (name === 'ui' ? 0 : Math.random() * 0.01), name, o);
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
