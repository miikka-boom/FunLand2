// The game's sound. Recorded effects (assets/sfx, cut from the sound libraries by
// tools/sfx/build_sfx.py) play through a small mixer: every sound placed in the world gets
// distance (quieter, duller), walls in the way (muffled), a pan by where it is on screen and a
// send to a reverb shaped like the level (streets, a room, open ground, the yard). On top of
// that: voice limits per kind of sound, ducking, each level's ambience beds and far-off sounds,
// loops that sit in the world (fires, floodlight generators, the flare, the ferry's engine) and
// the horde as a crowd bed. src/game/soundscape.js says what is where; this plays it.
//
// Anything whose file hasn't loaded yet (or can't be had) falls back to the synth this builds on
// (audio-synth.js), and a few sounds stay synthesized on purpose: the alarms, Ben's whistle, the
// Witch's crying and humming, the ferry's horn and the heartbeat.

import { SynthAudio } from './audio-synth.js';
import { SfxBank, spriteOf } from './sfx-bank.js';
import { AMBIENCE, VERB } from './game/soundscape.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const NONE = {};
const tmp = { x: 0, y: 0 };

// What loads as soon as there is sound: the guns and the world's one-shots, then the voices.
// Ambience beds load per level.
const PRELOAD = ['stereo', 'mono', 'lo'];

// Voice limits per group: past the limit a new sound only plays if it is louder than the
// quietest one playing (which then gives way). MAX_VOICES caps them all.
const CAPS = {
  gun: 8, tail: 2, gun2: 4, tail2: 1, mech: 3, impact: 6, flesh: 5, gore: 6, body: 5, zv: 7, zdie: 3,
  special: 6, step: 2, step2: 4, foley: 3, world: 10, boom: 3, sweet: 3, ui: 2, hurt: 3,
};
const MAX_VOICES = 64;

// The player's guns. The automatic ones are a first shot, short bodies, and a tail restarted with
// every shot that rings out after the last one.
const GUNS = {
  smg: { first: 'smg.first', shot: 'smg.shot', tail: 'smg.tail', gain: 0.6, tailGain: 0.9, auto: true },
  rifle: { first: 'rifle.first', shot: 'rifle.shot', tail: 'rifle.tail', gain: 0.68, tailGain: 0.9, auto: true },
  shotgun: { shot: 'shotgun.shot', gain: 0.95 },
  hunting: { shot: 'hunting.shot', gain: 0.9 },
};
const MAG_GUNS = new Set(['smg', 'rifle', 'hunting']);

// Footsteps by surface (soundscape.js: surfaceAt): [running, walking].
const STEPS = {
  concrete: ['step.concrete.run', 'step.concrete.walk'],
  grass: ['step.grass.run', 'step.grass.walk'],
  gravel: ['step.gravel.run', 'step.gravel.walk'],
  dirt: ['step.dirt', 'step.dirt'],
  wood: ['step.wood.run', 'step.wood.walk'],
  metal: ['step.metal', 'step.metal'],
};
// Some surfaces come out quieter than others for the same step (wood planks are mostly low thud).
const STEP_TRIM = { wood: 1.45, metal: 1.15, grass: 1.1 };

// Bullet impacts by material (soundscape.js: materialOf).
const IMPACTS = { concrete: 'imp.concrete', metal: 'imp.metal', metallight: 'imp.metallight', wood: 'imp.wood', dirt: 'imp.dirt', rock: 'imp.rock' };

// Far-off sounds that drift in now and then (soundscape.js: AMBIENCE[level].sweet). Gain and
// playback rate are [low, high]; lp darkens them with distance; repeat plays a few in a row.
const SWEETENERS = {
  'far.scream': { id: 'z.scream', gain: [0.07, 0.14], rate: [0.78, 0.98], lp: 1300 },
  'far.glass': { id: 'imp.glass', gain: [0.05, 0.09], rate: [0.7, 0.9], lp: 3200 },
  'far.thunder': { id: 'thunder', gain: [0.12, 0.22], rate: [0.85, 1.0], lp: 900 },
  'far.boom': { id: 'explosion', gain: [0.06, 0.11], rate: [0.6, 0.75], lp: 600 },
  'far.clank': { id: 'metal.clank', gain: [0.05, 0.1], rate: [0.55, 0.85], lp: 2600 },
  'far.bang': { id: 'body.punch', gain: [0.14, 0.22], rate: [0.7, 0.9], lp: 900, repeat: [2, 4] }, // someone pounding on a door
  'far.groan': { id: 'z.groan', gain: [0.08, 0.14], rate: [0.82, 0.98], lp: 900 },
  'far.creak': { id: 'wood.creak', gain: [0.05, 0.1], rate: [0.6, 0.8], lp: 2500 },
  'far.door': { id: 'door.creak', gain: [0.05, 0.09], rate: [0.7, 0.9], lp: 2000 },
  'far.hull': { id: 'metal.lid', gain: [0.06, 0.1], rate: [0.35, 0.5], lp: 1200 }, // a hull or a crane groaning
  'far.swing': { id: 'door.creak', gain: [0.04, 0.07], rate: [1.0, 1.2], lp: 3000, repeat: [2, 3] }, // a swing set in the wind
  'far.crow': { id: 'crow', gain: [0.07, 0.12], rate: [0.95, 1.05], lp: 5000 },
};

export class Audio extends SynthAudio {
  constructor() {
    super();
    this.bank = new SfxBank(() => this.ctx);
    this.view = null; // the camera: sounds pan by where they are on screen
    this.occluder = null; // (x0, y0, x1, y1) => true when a wall is in the way
    this.ambVolume = 1;
    this.voices = [];
    this.lastShot = { player: -9, ally: -9 };
    this.tails = { player: null, ally: null };
    this.reloadVoices = [];
    this.run = null;
    this.level = null;
    this.wantBeds = [];
    this.beds = new Map(); // id -> loop voice
    this.emitters = new Map(); // emitter key -> loop voice
    this.crowd = { voices: null, feet: null }; // the horde bed's two loops
    this.sweetT = 6;
    this.sceneT = 0;
  }

  // --- the mixer -------------------------------------------------------------------------------

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this._graph();
        const len = this.ctx.sampleRate * 1.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._ambience();
        for (const key of PRELOAD) this.bank.load(key);
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

  /**
   * master (volume) -> muffle (death, blasts) -> glue compressor -> limiter, and the buses into it.
   * The limiter and the music (src/music-player.js, which skips the compressor so it doesn't pump
   * with every shot) meet in one last safety limiter, so a gunshot on a loud bar can't clip.
   */
  _graph() {
    const c = this.ctx;
    this.mixOut = c.createDynamicsCompressor();
    this.mixOut.threshold.value = -1;
    this.mixOut.knee.value = 0;
    this.mixOut.ratio.value = 20;
    this.mixOut.attack.value = 0.001;
    this.mixOut.release.value = 0.08;
    this.mixOut.connect(c.destination);
    this.master = this._gain(this.volume);
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.5;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.22;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -2.5;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.12;
    this.master.connect(this.muffle);
    this.muffle.connect(glue);
    glue.connect(limit);
    limit.connect(this.mixOut);
    this.out = limit; // the effects' output (for metering)
    this.sfxBus = this._gain(1, this.master); // your guns, your body, what you handle
    this.worldBus = this._gain(1, this.master); // everything placed in the world
    this.ambDuck = this._gain(1, this.master);
    this.ambBus = this._gain(this.ambVolume, this.ambDuck); // beds, far-off sounds, loops in the world
    this.uiBus = this._gain(0.6, this.master);
    try {
      this.verb = c.createConvolver();
      this.verbIn = this._gain(1, this.verb);
      this.verbOut = this._gain(0.3, this.master);
      this.verb.connect(this.verbOut);
      this._setVerb('street');
    } catch {
      this.verb = null;
      this.verbIn = null;
    }
  }

  _gain(v, to) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (to) g.connect(to);
    return g;
  }

  /** The air under everything (the synth's low noise), now on the ambience bus at the level's level. */
  _ambience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    this.air = this._gain(0.02, this.ambBus);
    src.connect(f);
    f.connect(this.air);
    src.start();
  }

  /** Synth sounds placed in the world get a little of the room too. */
  _out(pan = 0, gain = 1) {
    const g = super._out(pan, gain);
    if (this.verbIn) g.connect(this._gain(0.16, this.verbIn));
    return g;
  }

  setAmbience(v) {
    this.ambVolume = v;
    if (this.ambBus) this.ambBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** A reverb shaped like the level: noise that decays (darker as it goes) after a few early reflections. */
  _setVerb(type) {
    if (!this.verb || this.verbType === type) return;
    this.verbType = type;
    const P = VERB[type] || VERB.street;
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.floor(sr * Math.min(3, P.decay * 1.15 + 0.1));
    const ir = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const a = clamp(P.damp * (0.3 + t / P.decay), 0, 0.96);
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = lp * Math.exp((-6.9 * t) / P.decay) * (t < 0.01 ? t / 0.01 : 1);
      }
      for (const [dt, g] of P.early) {
        const i = Math.floor(dt * (ch ? 1.07 : 0.93) * sr);
        if (i < len) d[i] += g * 0.25 * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    try {
      this.verb.buffer = ir;
      this.verbOut.gain.setTargetAtTime(P.level, c.currentTime, 0.3);
    } catch {
      // a convolver that won't take it keeps the old room
    }
  }

  /**
   * Where a sound at (x, y) sits for the listener: level, pan, dullness, reverb, and walls in the
   * way. `occlude`: true runs the wall test, false skips it, 'yes' applies a wall known from before.
   */
  _place(x, y, range = 900, occlude = true) {
    const L = this.listener;
    const dx = x - L.x;
    const dy = y - L.y;
    const d = Math.hypot(dx, dy);
    const near = 110;
    let gain = d <= near ? 1 : Math.pow(clamp(1 - (d - near) / Math.max(1, range - near), 0, 1), 1.6);
    const s = this.view ? this.view.dirToScreen(dx, dy, tmp) : { x: dx };
    const pan = clamp(s.x / 520, -0.85, 0.85);
    const f = clamp(d / range, 0, 1);
    let lp = 16000 * Math.pow(0.09, f); // 16 kHz up close, about 1.4 kHz at the edge of hearing
    let send = 0.06 + 0.3 * f;
    const walled = occlude === 'yes' || (occlude === true && d > 70 && gain > 0.01 && !!this.occluder && this.occluder(L.x, L.y, x, y));
    if (walled) {
      gain *= 0.55;
      lp = Math.min(lp, 1100);
      send *= 1.4;
    }
    return { gain, pan, lp, send, d, walled };
  }

  /** Room for one more voice in this group? (Makes room by stopping the quietest if this one is louder.) */
  _admit(group, gain, cap, force) {
    const now = this.ctx.currentTime;
    const vs = this.voices;
    let j = 0;
    for (let i = 0; i < vs.length; i++) if (vs[i].end > now) vs[j++] = vs[i];
    vs.length = j;
    const max = cap || CAPS[group] || 4;
    let n = 0;
    let weakest = null; // the one to give way: the oldest for a forced sound, else the quietest
    for (const v of vs) {
      if (v.group !== group) continue;
      n++;
      if (!weakest || (force ? v.t0 < weakest.t0 : v.gain < weakest.gain)) weakest = v;
    }
    if (n >= max) {
      if (!weakest || (!force && weakest.gain >= gain * 1.15)) return false;
      this._fade(weakest, 0.04);
    } else if (vs.length >= MAX_VOICES) {
      let w = null;
      for (const v of vs) if (!w || v.gain < w.gain) w = v;
      if (!w || (!force && w.gain >= gain)) return false;
      this._fade(w, 0.04);
    }
    return true;
  }

  /** Fade a playing voice out and stop it. */
  _fade(v, time = 0.06) {
    if (!v || !v.g) return;
    v.end = 0;
    try {
      const t = this.ctx.currentTime;
      const g = v.g.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + time);
      v.src.stop(t + time + 0.02);
    } catch {
      // already stopped
    }
  }

  /**
   * Play a recorded sound. Returns the voice, or null if it can't (not loaded, too far, no room).
   * o.x/o.y place it in the world (o.range: where it fades out; o.occlude: false skips the wall
   * test); o.pan places it by hand. o.gain; o.rate (playback rate = pitch) and o.vary (+- on it);
   * o.gvary (+- on the gain); o.at: delay (s); o.bus; o.send / o.verb: reverb send / scale on the
   * placed one; o.lp / o.hp (Hz); o.group / o.cap: voice limit; o.force; o.i: a given variant.
   */
  _play(id, o = NONE) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return null;
    const v = this.bank.get(id, o.i === undefined ? -1 : o.i);
    if (!v) return null;
    let gain = o.gain === undefined ? 1 : o.gain;
    let pan = o.pan || 0;
    let lp = o.lp || 0;
    let send = o.send || 0;
    if (o.x !== undefined) {
      const sp = this._place(o.x, o.y, o.range, o.occlude !== false);
      gain *= sp.gain;
      if (gain < 0.003) return null;
      pan = sp.pan;
      lp = lp ? Math.min(lp, sp.lp) : sp.lp;
      send += sp.send * (o.verb === undefined ? 1 : o.verb);
    }
    const group = o.group || 'world';
    if (!this._admit(group, gain, o.cap, o.force)) return null;
    const rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.vary === undefined ? 0.04 : o.vary));
    const t = c.currentTime + (o.at || 0);
    const src = c.createBufferSource();
    src.buffer = v.buffer;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain * (1 + (Math.random() * 2 - 1) * (o.gvary === undefined ? 0.1 : o.gvary));
    let head = src;
    if (o.hp) {
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      head.connect(f);
      head = f;
    }
    if (lp && lp < 17000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = 0.6;
      head.connect(f);
      head = f;
    }
    head.connect(g);
    let out = g;
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    out.connect(o.bus || this.worldBus);
    if (send > 0.002 && this.verbIn) out.connect(this._gain(Math.min(1, send), this.verbIn));
    const dur = o.dur ? Math.min(o.dur, v.dur) : v.dur;
    src.start(t, v.offset, dur);
    const voice = { src, g, group, gain, t0: t, end: t + dur / rate + 0.05 };
    src.onended = () => {
      try {
        out.disconnect();
      } catch {
        // gone
      }
    };
    this.voices.push(voice);
    return voice;
  }

  /** Duck the ambience (beds, far-off sounds) by `amount` (0..1), hold, then let it back over `release` s. */
  _duck(amount, hold = 0.2, release = 1.5) {
    if (!this.ambDuck) return;
    const g = this.ambDuck.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(Math.max(0.05, 1 - amount), t, 0.02);
    g.setTargetAtTime(1, t + hold, release / 3);
  }

  /** Muffle everything (not the music) down to `freq`, over `time` s; back with 20000. */
  _muffle(freq, time = 0.5) {
    if (!this.muffle) return;
    const f = this.muffle.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(freq, t + Math.max(0.02, time));
  }

  /** A blast close by: the world goes dull for a moment and the ears ring (k: 0..1, how close). */
  _shellshock(k) {
    if (!this.muffle || k <= 0) return;
    const f = this.muffle.frequency;
    const t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(600 + 2400 * (1 - k), t + 0.05);
    f.setTargetAtTime(20000, t + 0.4 + 0.6 * k, 0.9);
    this._tone({ f0: 3700, f1: 3500, dur: 2.2 + 1.5 * k, gain: 0.025 + 0.035 * k, attack: 0.05, at: 0.05, out: this.uiBus });
  }

  // --- the soundscape (once a frame from main.js) -----------------------------------------------

  /** The listener, the level's ambience, the loops in the world and the horde: see soundscape.js readScene. */
  update(dt, scene) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !scene) return;
    if (scene.run !== this.run) {
      this.run = scene.run;
      this._newRun();
    }
    if (scene.level !== this.level) this._setLevel(scene.level);
    this._sweeten(dt, scene);
    this.sceneT -= dt;
    if (this.sceneT > 0) return;
    this.sceneT = 0.1; // the loops follow at 10 Hz (smoothed), which is plenty
    this._updateBeds(scene.screen);
    this._updateEmitters(scene.emitters);
    this._updateHorde(scene.horde, scene.screen);
  }

  _newRun() {
    this._muffle(20000, 0.6);
    for (const w of ['player', 'ally']) {
      this._fade(this.tails[w], 0.2);
      this.tails[w] = null;
    }
    this._cancelReload();
  }

  _setLevel(level) {
    this.level = level;
    const A = AMBIENCE[level] || AMBIENCE.city;
    this._setVerb(A.verb);
    if (this.air) this.air.gain.setTargetAtTime(A.air, this.ctx.currentTime, 1);
    for (const [id] of A.beds) this.bank.load(spriteOf(id));
    this.wantBeds = A.beds;
    this.sweetT = rnd(4, 9);
  }

  /** A looping voice over a loop's seamless part, started at a random point in it, fading in. */
  _loopVoice(id, bus, rate = 1, placed = false) {
    const L = this.bank.loop(id);
    if (!L) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = L.buffer;
    src.loop = true;
    src.loopStart = L.a;
    src.loopEnd = L.b;
    src.playbackRate.value = rate;
    const g = this._gain(0.0001);
    const v = { id, src, g, cur: 0 };
    let head = src;
    if (placed) {
      v.f = c.createBiquadFilter();
      v.f.type = 'lowpass';
      v.f.frequency.value = 8000;
      src.connect(v.f);
      head = v.f;
    }
    head.connect(g);
    let out = g;
    if (c.createStereoPanner) {
      v.p = c.createStereoPanner();
      g.connect(v.p);
      out = v.p;
    }
    out.connect(bus);
    if (placed && this.verbIn) {
      v.s = this._gain(0.1, this.verbIn);
      out.connect(v.s);
    }
    src.start(c.currentTime, L.a + Math.random() * (L.b - L.a));
    return v;
  }

  _stopLoop(v, fade = 1.5) {
    if (!v) return;
    try {
      const t = this.ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.setTargetAtTime(0.0001, t, fade / 3);
      v.src.stop(t + fade * 1.6);
    } catch {
      // already stopped
    }
  }

  _updateBeds(screen) {
    const t = this.ctx.currentTime;
    const want = new Map(this.wantBeds);
    for (const [id, v] of this.beds) {
      if (want.has(id)) continue;
      this._stopLoop(v, 2.5);
      this.beds.delete(id);
    }
    const k = screen === 'play' ? 1 : 0.6;
    for (const [id, gain] of want) {
      let v = this.beds.get(id);
      if (!v) {
        v = this._loopVoice(id, this.ambBus);
        if (!v) continue; // still loading
        this.beds.set(id, v);
      }
      const target = gain * k;
      if (Math.abs(target - v.cur) > 0.001) {
        v.g.gain.setTargetAtTime(target, t, 0.8);
        v.cur = target;
      }
    }
  }

  _updateEmitters(list) {
    const t = this.ctx.currentTime;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (const e of list) {
      let v = this.emitters.get(e.key);
      // The wall test is the expensive part: every few updates is enough for something standing still.
      const test = !v || (v.n = (v.n || 0) + 1) % 4 === 0;
      const sp = this._place(e.x, e.y, e.range, test ? true : v.walled ? 'yes' : false);
      const gain = e.gain * sp.gain;
      if (!v) {
        if (gain < 0.003) continue;
        v = this._loopVoice(e.id, this.ambBus, e.rate * (1 + rnd(-0.03, 0.03)), true);
        if (!v) continue;
        this.emitters.set(e.key, v);
      }
      if (test) v.walled = sp.walled;
      seen.add(e.key);
      this._steer(v, gain, sp.pan, sp.lp, sp.send * 0.7);
    }
    for (const [k, v] of this.emitters) {
      if (seen.has(k)) continue;
      this._stopLoop(v, 0.9);
      this.emitters.delete(k);
    }
  }

  /**
   * Move a placed loop's level, pan, dullness and reverb send toward new values (smoothed), only
   * sending the ones that really changed: the automation timelines stay short.
   */
  _steer(v, gain, pan, lp, send, rise = 0.15, fall = 0.15) {
    const t = this.ctx.currentTime;
    if (Math.abs(gain - v.cur) > Math.max(0.002, v.cur * 0.03)) {
      v.g.gain.setTargetAtTime(gain, t, gain > v.cur ? rise : fall);
      v.cur = gain;
    }
    if (v.p && Math.abs(pan - (v.pan || 0)) > 0.02) {
      v.p.pan.setTargetAtTime(pan, t, 0.12);
      v.pan = pan;
    }
    if (v.f && Math.abs(lp - (v.lp || 0)) > (v.lp || 1) * 0.05) {
      v.f.frequency.setTargetAtTime(lp, t, 0.2);
      v.lp = lp;
    }
    if (v.s && Math.abs(send - (v.send || 0)) > 0.01) {
      v.s.gain.setTargetAtTime(send, t, 0.3);
      v.send = send;
    }
  }

  _updateHorde(H, screen) {
    if (!H) return;
    const sp = this._place(H.x, H.y, 2000, false);
    for (const [key, id, level, top, lp] of [['voices', 'loop.horde', H.voices, 0.5, 7000], ['feet', 'loop.feet', H.feet, 0.42, 5000]]) {
      const target = screen === 'play' ? level * top : 0;
      let v = this.crowd[key];
      if (!v) {
        if (target < 0.01) continue;
        v = this._loopVoice(id, this.worldBus, 1, true);
        if (!v) continue;
        this.crowd[key] = v;
      }
      // Comes up quickly as they close in, lets go slowly as they thin out.
      this._steer(v, target, sp.pan * 0.7, lp, 0.18, 0.5, 1.4);
    }
  }

  _sweeten(dt, scene) {
    if (scene.screen !== 'play') return;
    this.sweetT -= dt;
    if (this.sweetT > 0) return;
    this.sweetT = rnd(8, 18);
    const A = AMBIENCE[this.level];
    if (!A) return;
    const S = SWEETENERS[A.sweet[Math.floor(Math.random() * A.sweet.length)]];
    if (!S || !this.bank.ready(S.id)) return;
    const pan = rnd(-0.8, 0.8);
    const n = S.repeat ? Math.round(rnd(S.repeat[0], S.repeat[1])) : 1;
    for (let i = 0; i < n; i++) {
      this._play(S.id, { pan, bus: this.ambBus, gain: rnd(S.gain[0], S.gain[1]), rate: rnd(S.rate[0], S.rate[1]), lp: S.lp, send: 0.55, group: 'sweet', at: i * rnd(0.35, 0.6) });
    }
  }

  // --- weapons ---------------------------------------------------------------------------------

  shot(kind) {
    const G = GUNS[kind];
    if (!G || !this.bank.ready(G.shot)) return super.shot(kind);
    if (!this._ok('s:shot', 0.02)) return;
    this._gunshot(G, 'player');
    this._duck(0.3, 0.12, 1.2);
  }

  allyShot(kind, x, y) {
    const G = GUNS[kind];
    if (!G || !this.bank.ready(G.shot)) return super.allyShot(kind, x, y);
    if (!this._ok('s:allyShot', 0.035)) return;
    this._gunshot(G, 'ally', x, y);
  }

  _gunshot(G, who, x, y) {
    const now = this.ctx.currentTime;
    const burst = now - this.lastShot[who] < 0.2;
    this.lastShot[who] = now;
    const o = who === 'ally'
      ? { x, y, range: 1300, gain: G.gain * 0.6, lp: 9000, group: 'gun2', vary: 0.03 }
      : { bus: this.sfxBus, gain: G.gain, group: 'gun', send: 0.04, force: true, vary: 0.025, gvary: 0.06 };
    if (!G.auto) {
      this._play(G.shot, o);
      return;
    }
    this._play(burst ? G.shot : G.first, o);
    this._fade(this.tails[who], 0.07);
    this.tails[who] = this._play(G.tail, { ...o, gain: o.gain * G.tailGain, group: who === 'ally' ? 'tail2' : 'tail', send: (o.send || 0) + 0.08, gvary: 0.04 });
  }

  dryFire(kind) {
    if (!this.bank.ready('gun.dry')) return super.dryFire(kind);
    if (this._ok('s:dry', 0.3)) this._play('gun.dry', { bus: this.sfxBus, gain: 0.4, group: 'mech' });
  }

  /** Mag out now, mag in a little past halfway (the bolt or charging handle comes with reloadDone). */
  reloadStart(kind, dur = 1.6) {
    if (!this.bank.ready('smg.magout')) return super.reloadStart(kind, dur);
    if (!this._ok('s:rl', 0.05)) return;
    this._cancelReload();
    const o = { bus: this.sfxBus, group: 'mech', gain: 0.38 };
    if (!MAG_GUNS.has(kind)) {
      this._play('foley.cloth', { ...o, gain: 0.35, group: 'foley' }); // the shotgun: tip it to load
      return;
    }
    this.reloadVoices.push(
      this._play(`${kind}.magout`, o),
      this._play('foley.cloth', { ...o, gain: 0.22, group: 'foley', at: 0.05 }),
      this._play(`${kind}.magin`, { ...o, at: Math.max(0.3, dur * 0.55) }),
    );
  }

  reloadDone(kind) {
    if (!this.bank.ready('smg.cock')) return super.reloadDone(kind);
    if (!this._ok('s:rd', 0.05)) return;
    this.reloadVoices.length = 0;
    if (MAG_GUNS.has(kind)) this._play(`${kind}.cock`, { bus: this.sfxBus, group: 'mech', gain: 0.4 });
  }

  _cancelReload() {
    for (const v of this.reloadVoices) if (v && v.end > this.ctx.currentTime) this._fade(v, 0.05);
    this.reloadVoices.length = 0;
  }

  shell() {
    if (!this.bank.ready('shotgun.shell')) return super.shell();
    if (this._ok('s:shell', 0.05)) this._play('shotgun.shell', { bus: this.sfxBus, gain: 0.38, group: 'mech' });
  }

  pump() {
    if (!this.bank.ready('shotgun.pump')) return super.pump();
    if (this._ok('s:pump', 0.1)) this._play('shotgun.pump', { bus: this.sfxBus, gain: 0.42, group: 'mech' });
  }

  /** Swapped to `kind`: a grab, then that gun's own sound. */
  swap(kind) {
    if (!this.bank.ready('foley.grab')) return super.swap(kind);
    if (!this._ok('s:swap', 0.05)) return;
    this._cancelReload();
    this._play('foley.grab', { bus: this.sfxBus, gain: 0.35, group: 'foley' });
    if (GUNS[kind]) this._play(`swap.${kind}`, { bus: this.sfxBus, gain: 0.36, group: 'mech', at: 0.08 });
  }

  shove(hit) {
    if (!this.bank.ready('whoosh')) return super.shove(hit);
    if (!this._ok('s:shove', 0.05)) return;
    const o = { bus: this.sfxBus, group: 'body' };
    this._play('whoosh', { ...o, gain: 0.32, rate: 0.95 });
    this._play('foley.cloth', { ...o, gain: 0.3, group: 'foley' });
    if (hit) {
      this._play('body.punch', { ...o, gain: 0.62, at: 0.035 });
      this._play('body.wet', { ...o, gain: 0.3, at: 0.04 });
    }
  }

  /** A bullet stopped on something (material: soundscape.js materialOf). */
  impact(x, y, material) {
    const id = IMPACTS[material] || IMPACTS.concrete;
    if (!this.bank.ready(id) || !this._ok('s:imp:' + material, 0.04)) return;
    this._play(id, { x, y, range: 1000, gain: material === 'metal' ? 0.5 : 0.42, group: 'impact', vary: 0.08 });
    if ((material === 'concrete' || material === 'rock') && Math.random() < 0.3) this._play('debris', { x, y, range: 700, gain: 0.2, group: 'impact', at: 0.03 });
  }

  /** A bullet went into one of the infected (heavy: the Tank or the Witch). */
  bulletHit(x, y, heavy = false) {
    if (!this.bank.ready('imp.flesh') || !this._ok('s:flesh', 0.03)) return;
    this._play(heavy ? 'imp.thump' : 'imp.flesh', { x, y, range: 900, gain: heavy ? 0.5 : 0.4, group: 'flesh', vary: 0.1 });
  }

  // --- you ---------------------------------------------------------------------------------------

  /** A footstep on `surface` (soundscape.js surfaceAt); k: 0..1 how fast; who: 'player' or 'ally'. */
  footstep(x, y, surface, k = 1, who = 'player') {
    const ids = STEPS[surface] || STEPS.concrete;
    const id = ids[k > 0.6 ? 0 : 1];
    if (!this.bank.ready(id)) return;
    const trim = (STEP_TRIM[surface] || 1) * (0.55 + 0.45 * k);
    if (who === 'player') {
      this.stepSide = -(this.stepSide || 1);
      this._play(id, { bus: this.sfxBus, gain: 0.26 * trim, pan: this.stepSide * 0.06, send: 0.03, group: 'step', force: true, vary: 0.06 });
      if (k > 0.6 && Math.random() < 0.3) this._play('foley.rattle', { bus: this.sfxBus, gain: 0.1, group: 'foley' });
    } else {
      this._play(id, { x, y, range: 650, gain: 0.22 * trim, group: 'step2', vary: 0.06 });
    }
  }

  hurt() {
    if (!this.bank.ready('body.punch')) return super.hurt();
    if (!this._ok('s:hurt', 0.12)) return;
    const o = { bus: this.sfxBus, group: 'hurt' };
    this._play('body.punch', { ...o, gain: 0.6, rate: 1.05 });
    this._play('imp.flesh', { ...o, gain: 0.26, rate: 0.85 });
    if (Math.random() < 0.4) this._play('foley.cloth', { ...o, gain: 0.25, group: 'foley' });
  }

  death() {
    if (!this.bank.ready('body.fall')) return super.death();
    if (!this._ok('s:death')) return;
    const o = { bus: this.sfxBus, group: 'hurt', force: true };
    this._play('gore.bone', { ...o, gain: 0.45 });
    this._play('body.fall', { ...o, gain: 0.8, rate: 0.85, at: 0.25 });
    this._play('rumble', { ...o, gain: 0.55, group: 'boom' });
    this._muffle(450, 1.8); // the world goes far away
  }

  armorHit() {
    if (!this.bank.ready('imp.metallight')) return super.armorHit();
    if (!this._ok('s:armor', 0.1)) return;
    this._play('imp.metallight', { bus: this.sfxBus, gain: 0.3, rate: 1.25, group: 'hurt' });
    this._play('body.punch', { bus: this.sfxBus, gain: 0.35, rate: 1.2, group: 'hurt' });
  }

  /** Picked something up: a medkit (bag, zip) or ammo ('ammo': a magazine), and a small tick that it counted. */
  pickup(kind) {
    if (!this.bank.ready('foley.bag')) return super.pickup(kind);
    if (!this._ok('s:pickup', 0.1)) return;
    const o = { bus: this.sfxBus, group: 'foley' };
    if (kind === 'ammo') {
      this._play('rifle.magin', { ...o, gain: 0.5, group: 'mech' });
      this._play('foley.grab', { ...o, gain: 0.4, at: 0.1 });
    } else {
      this._play('foley.bag', { ...o, gain: 0.5 });
      this._play('foley.zip', { ...o, gain: 0.32, at: 0.12 });
    }
    this._tone({ type: 'triangle', f0: 1320, dur: 0.14, gain: 0.05, at: 0.06, out: this.uiBus });
  }

  /** The safe room door shuts behind you (or the ferry's). */
  win() {
    if (!this.bank.ready('door.slam')) return super.win();
    if (!this._ok('s:win')) return;
    this._play('door.slam', { bus: this.sfxBus, gain: 0.8, send: 0.25, force: true, group: 'world' });
    this._play('door.lock', { bus: this.sfxBus, gain: 0.55, at: 0.75, group: 'world' });
    this._duck(0.6, 1, 3);
  }

  /** UI: a click (the title card's buttons) or 'start'. */
  ui(kind = 'click') {
    if (!this.ctx || !this.bank.ready('ui.click') || !this._ok('s:ui', 0.05)) return;
    this._play('ui.click', { bus: this.uiBus, gain: kind === 'start' ? 0.7 : 0.45, i: kind === 'start' ? 0 : 1, group: 'ui', vary: 0.02 });
  }

  // --- scavenging and the world -------------------------------------------------------------------

  rummage() {
    if (!this.bank.ready('foley.search')) return super.rummage();
    if (this._ok('s:rummage', 0.45)) this._play('foley.search', { bus: this.sfxBus, gain: 0.4, rate: rnd(0.9, 1.15), group: 'foley' });
  }

  stashOpen(tier) {
    if (!this.bank.ready('metal.lid')) return super.stashOpen(tier);
    if (!this._ok('s:stash', 0.2)) return;
    const o = { bus: this.sfxBus, group: 'foley' };
    if (tier === 'secret') {
      this._play('metal.lid', { ...o, gain: 0.6, rate: 0.7 });
      this._play('door.creak', { ...o, gain: 0.35, rate: 0.8, at: 0.05 });
    } else {
      this._play('metal.lid', { ...o, gain: 0.45 });
      this._play('foley.zip', { ...o, gain: 0.3, at: 0.15 });
    }
    // The find: a soft chime, longer for a better one.
    const notes = tier === 'secret' ? [523, 659, 784, 1046, 1318, 1568] : tier === 'room' ? [523, 784, 1046, 1568] : [660, 880, 1320];
    notes.forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.07, at: 0.2 + i * 0.075, out: this.uiBus }));
  }

  boardHit(x, y) {
    if (!this.bank.ready('imp.wood')) return super.boardHit(x, y);
    if (!this._ok('s:boardHit', 0.06)) return;
    this._play('imp.wood', { x, y, range: 1200, gain: 0.7, rate: 0.85, group: 'impact' });
    if (Math.random() < 0.5) this._play('wood.creak', { x, y, range: 900, gain: 0.3, rate: 1.2, group: 'world', at: 0.05 });
  }

  boardBreak(x, y) {
    if (!this.bank.ready('imp.wood')) return super.boardBreak(x, y);
    if (!this._ok('s:boardBreak', 0.2)) return;
    const o = { x, y, range: 1700, group: 'world' };
    this._play('imp.wood', { ...o, gain: 0.85, rate: 0.75 });
    this._play('imp.wood', { ...o, gain: 0.6, rate: 1.1, at: 0.05 });
    this._play('gore.bone', { ...o, gain: 0.4, rate: 1.25, at: 0.02 }); // the splinter
    this._play('wood.creak', { ...o, gain: 0.4, at: 0.06 });
    this._play('debris', { ...o, gain: 0.3, at: 0.12 });
    this._play('body.fall', { ...o, gain: 0.45, rate: 1.15, at: 0.2 }); // the planks hit the floor
  }

  /** The holdout control box clunks on: a breaker, a spark, the machine coming up. */
  switchOn() {
    if (!this.bank.ready('switch')) return super.switchOn();
    if (!this._ok('s:switch', 0.3)) return;
    this._play('switch', { bus: this.sfxBus, gain: 0.7, group: 'world' });
    this._play('zap', { bus: this.sfxBus, gain: 0.3, at: 0.06, group: 'world' });
    this._tone({ type: 'square', f0: 660, dur: 0.12, gain: 0.05, at: 0.18, out: this.uiBus });
    this._tone({ type: 'square', f0: 990, dur: 0.16, gain: 0.05, at: 0.32, out: this.uiBus });
  }

  /** The holdout gate (or the ferry's gangway) slams fully open. */
  gateOpen(x, y) {
    if (!this.bank.ready('door.slam')) return super.gateOpen(x, y);
    if (!this._ok('s:gateOpen', 0.5)) return;
    const o = { x, y, range: 2400, occlude: false, group: 'world', verb: 1.4 };
    this._play('door.creak', { ...o, gain: 0.5, rate: 0.6 });
    this._play('door.slam', { ...o, gain: 0.9, rate: 0.8, at: 0.25 });
    this._play('metal.clank', { ...o, gain: 0.5, rate: 0.7, at: 0.3 });
    [523, 659, 784].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.3, gain: 0.1, at: 0.45 + i * 0.09, out: this.uiBus }));
  }

  explosion(x, y) {
    if (!this.bank.ready('explosion')) return super.explosion(x, y);
    if (!this._ok('s:boom', 0.15)) return;
    const sp = this._place(x, y, 3200, false);
    const o = { x, y, range: 3200, occlude: false, group: 'boom', force: true };
    this._play('explosion', { ...o, gain: 0.9, vary: 0.06, verb: 1.3 });
    this._play('fire.whoomp', { ...o, gain: 0.42, at: 0.02 });
    for (let i = 0; i < 3; i++) this._play('debris', { x, y, range: 1400, gain: rnd(0.25, 0.4), rate: rnd(0.8, 1.2), at: rnd(0.15, 0.6), group: 'impact' });
    this._play('metal.clank', { x, y, range: 1400, gain: 0.3, rate: 0.7, at: rnd(0.3, 0.8), group: 'impact' });
    this._duck(0.7, 0.8, 2.5);
    if (sp.d < 420) this._shellshock(1 - sp.d / 420);
  }

  // --- the infected ------------------------------------------------------------------------------

  groan(x, y) {
    if (!this.bank.ready('z.groan')) return super.groan(x, y);
    if (this._ok('s:groan', 0.3)) this._play('z.groan', { x, y, range: 700, gain: 0.5, group: 'zv', vary: 0.12, verb: 1.2 });
  }

  snarl(x, y) {
    if (!this.bank.ready('z.snarl')) return super.snarl(x, y);
    if (this._ok('s:snarl', 0.18)) this._play('z.snarl', { x, y, range: 750, gain: 0.6, group: 'zv', vary: 0.1 });
  }

  /** One of them winds up a swipe at you. */
  zombieAttack(x, y) {
    if (!this.bank.ready('z.attack') || !this._ok('s:zatk', 0.12)) return;
    this._play('z.attack', { x, y, range: 600, gain: 0.6, group: 'zv', vary: 0.1 });
  }

  /** One of them dies: a splat, sometimes a bone and a last sound, then the body drops. */
  splat(x, y) {
    if (!this.bank.ready('gore.splat')) return super.splat(x, y);
    if (!this._ok('s:splat', 0.03)) return;
    const o = { x, y, range: 900, group: 'gore' };
    this._play('gore.splat', { ...o, gain: 0.45, vary: 0.1 });
    if (Math.random() < 0.3) this._play('gore.bone', { ...o, gain: 0.3, at: 0.02 });
    if (Math.random() < 0.45 && this._ok('s:zdie', 0.15)) this._play('z.death', { x, y, range: 800, gain: 0.5, group: 'zdie', vary: 0.12 });
    if (this._ok('s:fall', 0.06)) this._play('body.fall', { x, y, range: 700, gain: 0.4, group: 'body', at: rnd(0.25, 0.45), vary: 0.1 });
  }

  /** The mob is coming: a rise, then screams from where they'll come from, and a low hit under them. */
  horde(x, y) {
    if (!this.bank.ready('z.scream')) return super.horde(x, y);
    if (!this._ok('s:horde', 1)) return;
    const sp = this._place(x, y, 4000, false);
    this._play('riser', { pan: sp.pan * 0.6, gain: 0.38, group: 'world' });
    for (let i = 0; i < 5; i++) {
      this._play('z.scream', { x, y, range: 4200, occlude: false, gain: rnd(0.55, 0.85), rate: rnd(0.82, 1.12), at: 1.45 + rnd(0, 1.1), group: 'world', lp: 2800, verb: 2.2, cap: 12 });
    }
    this._play('rumble', { pan: sp.pan * 0.5, gain: 0.4, at: 1.6, group: 'boom' });
  }

  alarm(x, y, dur, kind = 'car') {
    if (kind === 'icecream') return this._icecream(x, y, dur);
    super.alarm(x, y, dur, kind);
  }

  /** The ice-cream truck's jingle, a little warped, for as long as the alarm runs (stops with alarmStop). */
  _icecream(x, y, dur) {
    if (!this._ok('alarm', 1)) return;
    this.alarmStop();
    const c = this.ctx;
    const s = this._spatial(x, y, 2200);
    const out = this._out(s.pan, 0.3 + s.gain * 0.6);
    const o = c.createOscillator();
    o.type = 'triangle';
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.value = 7; // a speaker on its last legs
    lfo.connect(lg);
    lg.connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2800;
    const g = c.createGain();
    const t0 = c.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    const tune = [523, 659, 784, 659, 698, 587, 494, 392, 523, 659, 784, 1046, 988, 784, 659, 523];
    const step = 0.22;
    for (let t = 0, i = 0; t < dur - 0.3; t += step, i++) {
      o.frequency.setValueAtTime(tune[i % tune.length] * 0.985, t0 + t);
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.02, t0 + t + step * 0.95);
      if (i % tune.length === tune.length - 1) t += step * 2; // a breath between rounds
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f);
    f.connect(g);
    g.connect(out);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
    this.alarmNodes = { o, g };
  }

  hunterGrowl(x, y) {
    if (!this.bank.ready('hunter.growl')) return super.hunterGrowl(x, y);
    if (this._ok('s:hgrowl', 0.8)) this._play('hunter.growl', { x, y, range: 850, gain: 0.6, group: 'special', vary: 0.06 });
  }

  /** The pounce telegraph: the scream you learn to react to. */
  hunterScreech(x, y) {
    if (!this.bank.ready('hunter.screech')) return super.hunterScreech(x, y);
    if (this._ok('s:hscreech', 0.3)) this._play('hunter.screech', { x, y, range: 1300, gain: 1, rate: 1.08, vary: 0.05, group: 'special', force: true });
  }

  hunterPounce(x, y) {
    if (!this.bank.ready('hunter.pounce')) return super.hunterPounce(x, y);
    if (!this._ok('s:hpounce', 0.2)) return;
    this._play('whoosh', { x, y, range: 1000, gain: 0.55, rate: 0.8, group: 'special' });
    this._play('hunter.pounce', { x, y, range: 1050, gain: 0.8, group: 'special', force: true });
  }

  hunterPin() {
    if (!this.bank.ready('body.punch')) return super.hunterPin();
    if (!this._ok('s:hpin', 0.2)) return;
    const o = { bus: this.sfxBus, group: 'hurt', force: true };
    this._play('body.punch', { ...o, gain: 0.9 });
    this._play('body.fall', { ...o, gain: 0.6, at: 0.04 });
    this._play('gore.squish', { ...o, gain: 0.4, at: 0.1, group: 'gore' });
    this._play('z.attack', { ...o, gain: 0.6, rate: 1.15, group: 'zv' });
  }

  hunterDie(x, y) {
    if (!this.bank.ready('hunter.die')) return super.hunterDie(x, y);
    if (!this._ok('s:hdie', 0.2)) return;
    this._play('hunter.die', { x, y, range: 950, gain: 0.7, group: 'special' });
    this._play('body.fall', { x, y, range: 700, gain: 0.45, at: 0.35, group: 'body' });
  }

  /** The Hunter's claws while it has you. */
  claw() {
    if (!this.bank.ready('gore.slash')) return super.claw();
    if (!this._ok('s:claw', 0.08)) return;
    this._play('gore.slash', { bus: this.sfxBus, gain: 0.42, vary: 0.12, group: 'gore' });
    this._play('imp.flesh', { bus: this.sfxBus, gain: 0.25, rate: 1.1, group: 'flesh' });
  }

  struggle() {
    if (!this.bank.ready('foley.cloth')) return super.struggle();
    if (!this._ok('s:struggle', 0.04)) return;
    this._play('foley.cloth', { bus: this.sfxBus, gain: 0.4, group: 'foley', vary: 0.1 });
    this._play('body.punch', { bus: this.sfxBus, gain: 0.32, rate: 1.2, group: 'body' });
  }

  /** A shove that knocks something out of the air. */
  deadstop() {
    if (!this.bank.ready('body.punch')) return super.deadstop();
    if (!this._ok('s:deadstop', 0.1)) return;
    const o = { bus: this.sfxBus, group: 'body', force: true };
    this._play('body.punch', { ...o, gain: 0.9 });
    this._play('body.wet', { ...o, gain: 0.55, at: 0.01 });
    this._play('whoosh', { ...o, gain: 0.35, rate: 0.9 });
  }

  /** Something hits the ground (a pounce that missed, a body). */
  thud(x, y) {
    if (!this.bank.ready('body.fall')) return super.thud(x, y);
    if (this._ok('s:thud', 0.1)) this._play('body.fall', { x, y, range: 800, gain: 0.55, group: 'body' });
  }

  tankRoar(x, y, size = 1) {
    if (!this.bank.ready('tank.roar')) return super.tankRoar(x, y, size);
    if (!this._ok('s:troar', 0.5)) return;
    this._play('tank.roar', { x, y, range: 2800, gain: 0.95 * Math.min(1.2, size + 0.15), rate: rnd(0.78, 0.88), vary: 0, verb: 1.3, group: 'special', force: true });
    if (size >= 1) {
      this._play('rumble', { gain: 0.5, group: 'boom' });
      this._duck(0.5, 1.2, 2);
    }
  }

  tankGrunt(x, y) {
    if (!this.bank.ready('tank.grunt')) return super.tankGrunt(x, y);
    if (this._ok('s:tgrunt', 0.3)) this._play('tank.grunt', { x, y, range: 1300, gain: 0.7, rate: 0.85, group: 'special' });
  }

  tankStep(x, y) {
    if (!this.bank.ready('step.heavy')) return super.tankStep(x, y);
    if (!this._ok('s:tstep', 0.15)) return;
    this._play('step.heavy', { x, y, range: 1000, gain: 0.9, rate: rnd(0.58, 0.7), vary: 0, group: 'step2' });
    this._play('body.punch', { x, y, range: 900, gain: 0.5, rate: 0.55, group: 'body' });
  }

  tankPunch(hit) {
    if (!this.bank.ready('body.punch')) return super.tankPunch(hit);
    if (!this._ok('s:tpunch', 0.1)) return;
    const o = { bus: this.sfxBus, group: 'hurt', force: true };
    this._play('whoosh', { ...o, gain: 0.55, rate: 0.6, group: 'body' });
    if (!hit) return;
    this._play('body.punch', { ...o, gain: 1, rate: 0.8, at: 0.03 });
    this._play('body.wet', { ...o, gain: 0.7, at: 0.03 });
    this._play('gore.bone', { ...o, gain: 0.35, at: 0.05, group: 'gore' });
    this._play('rumble', { ...o, gain: 0.45, group: 'boom' });
    this._shellshock(0.35);
  }

  tankDie(x, y) {
    if (!this.bank.ready('tank.die')) return super.tankDie(x, y);
    if (!this._ok('s:tdie', 1)) return;
    this._play('tank.die', { x, y, range: 2200, gain: 1, rate: 0.85, vary: 0, verb: 1.3, group: 'special', force: true });
    this._play('body.fall', { x, y, range: 1500, gain: 0.9, rate: 0.5, at: 1.3, group: 'body' });
    this._play('rumble', { gain: 0.45, at: 1.3, group: 'boom' });
  }

  rockThrow(x, y) {
    if (!this.bank.ready('tank.grunt')) return super.rockThrow(x, y);
    if (!this._ok('s:rthrow', 0.2)) return;
    this._play('tank.grunt', { x, y, range: 1500, gain: 0.7, rate: 0.8, group: 'special' });
    this._play('whoosh', { x, y, range: 1400, gain: 0.7, rate: 0.5, at: 0.1, group: 'world' });
  }

  rockShatter(x, y) {
    if (!this.bank.ready('imp.rock')) return super.rockShatter(x, y);
    if (!this._ok('s:rshatter', 0.06)) return;
    const o = { x, y, range: 1300, group: 'impact' };
    this._play('explosion.small', { ...o, gain: 0.45, rate: 1.3, group: 'boom' });
    this._play('imp.rock', { ...o, gain: 0.7 });
    this._play('debris', { ...o, gain: 0.5, at: 0.05 });
    this._play('debris', { ...o, gain: 0.35, rate: 0.8, at: 0.18 });
  }

  // --- Ben, Pier 9 -------------------------------------------------------------------------------

  /** Small quick footsteps, running off. */
  benScuff(x, y) {
    if (!this.bank.ready('step.concrete.run')) return super.benScuff(x, y);
    if (!this._ok('s:bscuff', 0.5)) return;
    for (let k = 0; k < 5; k++) this._play('step.concrete.run', { x, y, range: 800, gain: 0.32 * (1 - k * 0.15), rate: 1.4, vary: 0.05, at: k * 0.085, group: 'step2', cap: 6 });
  }

  /** The flare: sparks, the rocket going up, the pop. (It burns as a loop in the world: soundscape.js.) */
  flare(x, y) {
    if (!this.bank.ready('flare.sparks')) return super.flare(x, y);
    if (!this._ok('s:flare', 0.5)) return;
    const o = { x, y, range: 1500, group: 'world' };
    this._play('flare.sparks', { ...o, gain: 0.6 });
    this._play('whoosh', { ...o, gain: 0.55, rate: 0.42, at: 0.05 });
    this._play('fire.ignite', { ...o, gain: 0.6, at: 0.9, verb: 1.5 });
    this._tone({ type: 'triangle', f0: 380, f1: 1700, dur: 0.85, gain: 0.035, out: this._out(0, 1) });
  }

  /** The ferry's horn: deep and long, far = muffled and out at sea (synth, with the room under it). */
  ferryHorn(far) {
    if (!this._ok('horn', 1)) return;
    const g = far ? 0.16 : 0.32;
    const dur = far ? 2.4 : 2.0;
    const filter = { freq: far ? 380 : 900, q: 0.8 };
    const out = this._gain(1, this.master);
    if (this.verbIn) out.connect(this._gain(far ? 0.9 : 0.45, this.verbIn));
    this._tone({ type: 'sawtooth', f0: 98, dur, gain: g, attack: 0.25, filter, out });
    this._tone({ type: 'sawtooth', f0: 147, dur, gain: g * 0.6, attack: 0.25, filter, out });
    this._tone({ type: 'square', f0: 49, dur, gain: g * 0.4, attack: 0.3, filter: { freq: 200 }, out });
  }

  /** The ferry on the radio: a burst of static before and after the message. */
  radio() {
    if (!this.bank.ready('radio') || !this._ok('s:radio', 0.5)) return;
    this._play('radio', { bus: this.uiBus, gain: 0.35, group: 'ui' });
    this._play('radio', { bus: this.uiBus, gain: 0.22, at: rnd(0.7, 1.1), group: 'ui', cap: 3 });
  }

  // --- the Night Terror --------------------------------------------------------------------------

  terrorWhisper(x, y) {
    if (!this.bank.ready('terror.whisper')) return super.terrorWhisper(x, y);
    if (this._ok('s:twhisper', 0.8)) this._play('terror.whisper', { x, y, range: 800, gain: 0.55, rate: rnd(1.1, 1.3), vary: 0, lp: 7000, verb: 1.6, group: 'special' });
  }

  /** The tell: a sharp in-breath right before it lunges. */
  terrorInhale(x, y) {
    if (!this.bank.ready('terror.inhale')) return super.terrorInhale(x, y);
    if (this._ok('s:tinhale', 0.3)) this._play('terror.inhale', { x, y, range: 950, gain: 0.85, group: 'special', force: true });
  }

  terrorShriek(x, y, size = 1) {
    if (!this.bank.ready('terror.shriek')) return super.terrorShriek(x, y, size);
    if (this._ok('s:tshriek', 0.45)) this._play('terror.shriek', { x, y, range: 1100, gain: 0.7 * Math.min(1.3, size), rate: 1.25, vary: 0.06, group: 'special' });
  }

  terrorLunge(x, y) {
    if (!this.bank.ready('whoosh')) return super.terrorLunge(x, y);
    if (!this._ok('s:tlunge', 0.2)) return;
    this._play('whoosh', { x, y, range: 900, gain: 0.6, rate: 0.7, group: 'special' });
    this._play('z.attack', { x, y, range: 900, gain: 0.35, rate: 1.35, group: 'special' });
  }

  terrorStrike() {
    if (!this.bank.ready('body.punch')) return super.terrorStrike();
    if (!this._ok('s:tstrike', 0.2)) return;
    const o = { bus: this.sfxBus, group: 'hurt', force: true };
    this._play('body.punch', { ...o, gain: 0.8 });
    this._play('gore.slash', { ...o, gain: 0.5, group: 'gore' });
    this._play('imp.flesh', { ...o, gain: 0.35, group: 'flesh' });
  }

  terrorDie(x, y) {
    if (!this.bank.ready('terror.die')) return super.terrorDie(x, y);
    if (this._ok('s:tdie', 0.2)) this._play('terror.die', { x, y, range: 1100, gain: 0.75, rate: 1.15, vary: 0, verb: 1.4, group: 'special' });
  }

  // --- the Witch (her crying and humming stay synthesized: audio-synth.js) ---------------------

  /** She has stopped crying and started listening: a rattle in the throat, rising with k (0..1). */
  witchGrowl(x, y, k) {
    if (!this.bank.ready('witch.growl')) return super.witchGrowl(x, y, k);
    if (this._ok('s:wgrowl', 0.3)) this._play('witch.growl', { x, y, range: 820, gain: 0.35 + 0.45 * k, rate: 0.9 + 0.25 * k, vary: 0.03, group: 'special' });
  }

  witchScream(x, y, size = 1) {
    if (!this.bank.ready('witch.scream')) return super.witchScream(x, y, size);
    if (!this._ok('s:wscream', 0.4)) return;
    this._play('witch.scream', { x, y, range: 1600, gain: 0.9 * Math.min(1, size + 0.2), vary: 0.03, verb: 1.4, group: 'special', force: true, dur: size < 1 ? 1.2 : 0 });
    if (size >= 1) {
      this._play('rumble', { gain: 0.5, group: 'boom' });
      this._duck(0.6, 1, 2.5);
    }
  }

  /** Her nails (the first one lands like a blow). */
  witchSlash(first) {
    if (!this.bank.ready('gore.slash')) return super.witchSlash(first);
    if (!this._ok('s:wslash', 0.08)) return;
    const o = { bus: this.sfxBus, group: 'hurt', force: true };
    this._play('whoosh', { ...o, gain: 0.45, rate: 1.25, group: 'body' });
    this._play('gore.slash', { ...o, gain: 0.65, group: 'gore' });
    if (first) {
      this._play('body.punch', { ...o, gain: 0.9 });
      this._play('imp.flesh', { ...o, gain: 0.5, group: 'flesh' });
    }
  }

  witchDie(x, y) {
    if (!this.bank.ready('witch.die')) return super.witchDie(x, y);
    if (!this._ok('s:wdie', 0.2)) return;
    this._play('witch.die', { x, y, range: 1300, gain: 0.85, vary: 0, verb: 1.4, group: 'special', force: true });
    this._play('body.fall', { x, y, range: 900, gain: 0.5, at: 1.1, group: 'body' });
  }

  // --- the teammate --------------------------------------------------------------------------------

  /** The teammate goes down: it hits the floor where it is. */
  allyDown(x, y) {
    if (!this.bank.ready('body.fall')) return super.allyDown(x, y);
    if (!this._ok('s:allyDown', 0.5)) return;
    this._play('body.fall', { x, y, range: 1600, gain: 0.75, rate: 0.9, group: 'body', force: true });
    this._play('foley.cloth', { x, y, range: 1200, gain: 0.4, group: 'foley' });
    this._play('gore.splat', { x, y, range: 1200, gain: 0.3, at: 0.05, group: 'gore' });
  }

  /** What is loaded and playing (for debugging in the browser console: __p0.audio.status()). */
  status() {
    return { ...this.bank.status(), voices: this.voices.length, beds: [...this.beds.keys()], emitters: this.emitters.size, level: this.level, verb: this.verbType };
  }
}
