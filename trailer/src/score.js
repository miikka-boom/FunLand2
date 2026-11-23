// The trailer's sound: the music edit (shots.js MUSIC), the mix moves (MIX), and the game's
// own sound engine (src/audio.js) playing whatever happens on screen.
//
// The game's Audio reads ctx.currentTime for "now". Here it gets a stand-in context whose
// currentTime is the film clock and whose destination is the trailer's game bus:
//   - live: the real AudioContext's time (sounds play as the shots run)
//   - capture: an OfflineAudioContext as long as the film. Each sound is scheduled at the
//     film time of the step that made it, and the whole track is rendered at the end, in
//     sync with the frames however long they took to film.
//
// Licence note: the score is the prototype's music (assets/music, docs/MUSIC.md: CC BY-NC).
// Fine for pitches and playtests; swap MUSIC for a licensed track before a commercial release.

import { clock } from './clock.js';
import { Audio } from '../../src/audio.js';
import { SPRITES } from '../../assets/sfx/bank.js';
import { MUSIC, MIX } from './shots.js';

const RATE = 48000;

/** The game's view of a context: film time for "now", the game bus for "out". */
function standIn(ctx, now, out) {
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'currentTime') return now();
      if (key === 'state') return 'running';
      if (key === 'destination') return out;
      if (key === 'resume' || key === 'suspend') return () => Promise.resolve();
      const v = target[key];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

async function decode(ctx, url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const data = await r.arrayBuffer();
  return new Promise((ok, bad) => {
    const p = ctx.decodeAudioData(data, ok, bad);
    if (p && p.then) p.then(ok, bad);
  });
}

/** Float channels -> 16-bit PCM WAV bytes. */
function wav(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new Uint8Array(44 + n * ch * 2);
  const dv = new DataView(out.buffer);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, buffer.sampleRate, true);
  dv.setUint32(28, buffer.sampleRate * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

/**
 * Build the sound for a film of `duration` seconds. mode: 'capture' | 'live'.
 * Returns { ctx, audio, schedule(t0), render() }.
 */
export async function makeSound(mode, duration) {
  const offline = mode === 'capture';
  const ctx = offline ? new OfflineAudioContext(2, Math.ceil((duration + 0.5) * RATE), RATE) : new (window.AudioContext || window.webkitAudioContext)();

  // master -> a gentle glue -> a hard ceiling.
  const master = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.knee.value = 8;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.01;
  glue.release.value = 0.25;
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -1.2;
  ceiling.knee.value = 0;
  ceiling.ratio.value = 20;
  ceiling.attack.value = 0.001;
  ceiling.release.value = 0.12;
  master.connect(glue);
  glue.connect(ceiling);
  ceiling.connect(ctx.destination);
  const musicBus = ctx.createGain();
  const gameBus = ctx.createGain();
  musicBus.connect(master);
  gameBus.connect(master);

  // The game's sound, on the film clock.
  let t0 = 0;
  const now = offline ? () => clock.t : () => ctx.currentTime;
  const audio = new Audio();
  audio.bank.base = '../assets/sfx/'; // (the bank's paths are relative to the game's page)
  audio.ctx = standIn(ctx, now, gameBus);
  audio.fileMusic = true; // the synth Tank theme stays out (the score is ours)
  audio.volume = 0.9;
  audio._graph();
  const len = Math.floor(ctx.sampleRate * 1.5);
  audio.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const nd = audio.noise.getChannelData(0);
  let s = 777;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    nd[i] = (s / 0x7fffffff) * 2 - 1;
  }
  audio._ambience();
  await Promise.all(Object.keys(SPRITES).map((k) => audio.bank.load(k)));

  // The music.
  const cues = [...new Set(MUSIC.map((m) => m.cue))];
  const buffers = {};
  await Promise.all(cues.map(async (c) => (buffers[c] = await decode(ctx, `../assets/music/${c}.mp3`))));

  let playing = [];
  /** Lay the music and the mix out on the timeline, starting at context time `start`. */
  function schedule(start) {
    t0 = start;
    for (const src of playing) {
      try {
        src.stop();
      } catch {
        // never started
      }
    }
    playing = [];
    for (const m of MUSIC) {
      const buf = buffers[m.cue];
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const at = start + m.at;
      const dur = m.dur;
      const peak = m.gain === undefined ? 1 : m.gain;
      const fin = m.fadeIn || 0;
      const fout = m.fadeOut || 0;
      g.gain.setValueAtTime(fin ? 0 : peak, at);
      if (fin) g.gain.linearRampToValueAtTime(peak, at + fin);
      g.gain.setValueAtTime(peak, at + Math.max(fin, dur - fout));
      g.gain.linearRampToValueAtTime(0, at + dur);
      src.connect(g);
      g.connect(musicBus);
      src.start(at, m.from || 0, dur + 0.05);
      playing.push(src);
    }
    // The mix: music and game levels, ramped between keyframes.
    for (const [bus, key] of [[musicBus, 'music'], [gameBus, 'game']]) {
      const p = bus.gain;
      p.cancelScheduledValues(0);
      const pts = MIX.filter((k) => k[key] !== undefined);
      p.setValueAtTime(pts.length ? pts[0][key] : 1, start);
      for (const k of pts) p.linearRampToValueAtTime(k[key], start + k.at);
    }
  }

  async function render() {
    if (!offline) return null;
    const buf = await ctx.startRendering();
    return wav(buf);
  }

  return { ctx, audio, schedule, render, filmTime: () => (offline ? clock.t : ctx.currentTime - t0) };
}
