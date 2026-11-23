// What goes on top of the game: the trailer's words and its film look.
//
//   cards (shots.js CARDS), by kind:
//     type    a typewriter line (datelines, places)
//     title   big cream capitals, a slow push (the trailer's voice)
//     kicker  small spaced capitals (CO-OP, platforms)
//     crayon  Ben's orange crayon, written on a letter at a time (his replies)
//     tag     a name pinned to a survivor on screen (the squad's introductions)
//     logo    the We Left Ben logo
//   fx (shots.js FX): letterbox bars, fades to black, flashes
//   always: a vignette and a little grain
//
// Sizes are fractions of the frame's short side (its height in 16:9, its width in a 9:16 cut),
// positions fractions of the frame, so the film looks the same at any size; a line too wide for
// the frame is set smaller.

import { CARDS, FX, FILM } from './shots.js';
import { BEN_COLOR } from '../../src/world/ben-content.js';

export const CREAM = '#f3ead7';
export const ORANGE = BEN_COLOR;
const DISPLAY = '"Trailer Display", Impact, "Arial Narrow", sans-serif';
const TYPE = '"Trailer Type", "Courier New", monospace';
const CRAYON = '"Trailer Crayon", "Comic Sans MS", cursive';
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) ** 3;
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 0..1..0 over a card's life with fades in and out (seconds). */
function envelope(T, at, dur, fin = 0.3, fout = 0.3) {
  const t = T - at;
  if (t < 0 || t > dur) return 0;
  const a = fin > 0 ? clamp01(t / fin) : 1;
  const b = fout > 0 ? clamp01((dur - t) / fout) : 1;
  return smooth(Math.min(a, b));
}

/** Piecewise-linear keyframes [[t, v], ...] at T. */
function keys(list, T, fallback = 0) {
  if (!list || !list.length) return fallback;
  if (T <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1] = list[i];
    if (T <= t1) {
      const [t0, v0] = list[i - 1];
      const u = t1 > t0 ? (T - t0) / (t1 - t0) : 1;
      return v0 + (v1 - v0) * smooth(clamp01(u));
    }
  }
  return list[list.length - 1][1];
}

export class Titles {
  constructor() {
    this.logo = null;
    this.grain = null;
    this.vig = null;
    this.vigKey = '';
  }

  async load() {
    const img = new Image();
    img.src = '../assets/we-left-ben.webp';
    try {
      await img.decode();
      this.logo = img;
    } catch {
      this.logo = null;
    }
    // Grain: a tile of soft grey noise (its own dice, so it never touches the game's).
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const d = g.createImageData(256, 256);
    let s = 12345;
    for (let i = 0; i < d.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = 128 + ((s / 0x7fffffff) - 0.5) * 120;
      d.data[i] = v;
      d.data[i + 1] = v;
      d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    this.grain = c;
  }

  draw(ctx, w, h, T, take) {
    this.u = Math.min(w, h);
    ctx.save();
    this.grade(ctx, w, h, T);
    // Per-shot fades (a shot can open from black or go out to it).
    const shot = take ? take.shot : FILM.find((s) => T >= s.at && T < s.at + s.dur);
    if (shot) {
      const lt = T - shot.at;
      let k = 0;
      if (shot.fadeIn) k = Math.max(k, 1 - smooth(clamp01(lt / shot.fadeIn)));
      if (shot.fadeOut) k = Math.max(k, smooth(clamp01((lt - (shot.dur - shot.fadeOut)) / shot.fadeOut)));
      if (k > 0) {
        ctx.fillStyle = `rgba(0,0,0,${k})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    const black = keys(FX.black, T, 0);
    if (black > 0.001) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, w, h);
    }
    // Letterbox.
    const bar = keys(FX.letterbox, T, 0) * this.u;
    if (bar > 0.5) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }
    for (const c of CARDS) {
      if (T < c.at || T > c.at + c.dur) continue;
      switch (c.kind) {
        case 'type':
          this.type(ctx, w, h, T, c);
          break;
        case 'title':
          this.title(ctx, w, h, T, c);
          break;
        case 'kicker':
          this.kicker(ctx, w, h, T, c);
          break;
        case 'crayon':
          this.crayon(ctx, w, h, T, c);
          break;
        case 'tag':
          if (take) this.tag(ctx, w, h, T, c, take);
          break;
        case 'logo':
          this.drawLogo(ctx, w, h, T, c);
          break;
        case 'eyes':
          this.eyes(ctx, w, h, T, c);
          break;
        default:
          break;
      }
    }
    for (const f of FX.flash || []) {
      const t = T - f.at;
      if (t < 0 || t > f.dur) continue;
      const k = (1 - t / f.dur) ** 2 * (f.k || 1);
      ctx.fillStyle = f.color ? f.color.replace('A', k.toFixed(3)) : `rgba(255,246,230,${k})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.film(ctx, w, h, T);
    ctx.restore();
  }

  /** A font size at which every line fits `maxW` (no bigger than `size`). */
  fit(ctx, lines, size, font, track, maxW, weight = '') {
    ctx.font = `${weight ? weight + ' ' : ''}${size}px ${font}`;
    ctx.letterSpacing = `${track * size}px`;
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
    ctx.letterSpacing = '0px';
    return widest > maxW ? size * (maxW / widest) : size;
  }

  /** The look under the words: a vignette that closes in a little in the dark scenes. */
  grade(ctx, w, h, T) {
    const key = `${w}x${h}`;
    if (this.vigKey !== key) {
      this.vigKey = key;
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.56);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      this.vig = g;
    }
    ctx.fillStyle = this.vig;
    ctx.fillRect(0, 0, w, h);
  }

  /** Grain, last: on everything, words included. */
  film(ctx, w, h, T) {
    if (!this.grain) return;
    const f = Math.floor(T * 24);
    const ox = Math.floor(hash(f) * 256);
    const oy = Math.floor(hash(f + 7.3) * 256);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.08;
    const pat = ctx.createPattern(this.grain, 'repeat');
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w + 256, h + 256);
    ctx.restore();
  }

  type(ctx, w, h, T, c) {
    const a = envelope(T, c.at, c.dur, 0.05, c.fout === undefined ? 0.5 : c.fout);
    if (a <= 0) return;
    const size = (c.size || 0.034) * this.u;
    const cps = c.cps || 16;
    const n = Math.min(c.text.length, Math.floor((T - c.at) * cps));
    const shown = c.text.slice(0, n);
    ctx.font = `${size}px ${TYPE}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = c.align || 'left';
    ctx.letterSpacing = `${(c.tracking === undefined ? 0.04 : c.tracking) * size}px`;
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = c.color || CREAM;
    const x = (c.x === undefined ? 0.5 : c.x) * w;
    const y = (c.y === undefined ? 0.5 : c.y) * h;
    ctx.fillText(shown, x, y);
    // The cursor: on while typing, blinking after.
    if (c.cursor !== false && (n < c.text.length || Math.floor((T - c.at) * 2.2) % 2 === 0)) {
      const full = ctx.measureText(c.text).width;
      const part = ctx.measureText(shown).width;
      const left = c.align === 'center' ? x - full / 2 : c.align === 'right' ? x - full : x;
      ctx.fillRect(left + part + size * 0.12, y - size * 0.78, size * 0.5, size * 0.9);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }

  title(ctx, w, h, T, c) {
    const a = envelope(T, c.at, c.dur, c.fin === undefined ? 0.35 : c.fin, c.fout === undefined ? 0.4 : c.fout);
    if (a <= 0) return;
    const u = clamp01((T - c.at) / c.dur);
    let size = (c.size || 0.12) * this.u * (1.05 - 0.05 * easeOut(u)) * (c.pop ? 1 + 0.25 * (1 - easeOut(clamp01((T - c.at) / 0.25))) : 1);
    const lines = c.text.split('\n');
    const font = c.font === 'sans' ? SANS : DISPLAY;
    const track = c.tracking === undefined ? 0.06 : c.tracking;
    size = this.fit(ctx, lines, size, font, track, w * 0.9);
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${track * size}px`;
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = c.color || CREAM;
    const x = (c.x === undefined ? 0.5 : c.x) * w;
    const y0 = (c.y === undefined ? 0.5 : c.y) * h - ((lines.length - 1) * size * 0.98) / 2;
    lines.forEach((line, i) => ctx.fillText(line, x, y0 + i * size * 0.98));
    if (c.sub) {
      const ss = size * (c.subSize || 0.26);
      ctx.font = `600 ${ss}px ${SANS}`;
      ctx.letterSpacing = `${0.32 * ss}px`;
      ctx.fillStyle = c.subColor || 'rgba(243,234,215,0.78)';
      ctx.fillText(c.sub, x, y0 + (lines.length - 1) * size * 0.98 + size * 0.78);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }

  kicker(ctx, w, h, T, c) {
    const a = envelope(T, c.at, c.dur, c.fin === undefined ? 0.3 : c.fin, c.fout === undefined ? 0.35 : c.fout);
    if (a <= 0) return;
    const track = c.tracking === undefined ? 0.42 : c.tracking;
    const size = this.fit(ctx, [c.text], (c.size || 0.032) * this.u, SANS, track, w * (c.rules ? 0.7 : 0.9), c.weight || 700);
    ctx.font = `${c.weight || 700} ${size}px ${SANS}`;
    ctx.textAlign = c.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${track * size}px`;
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = c.color || CREAM;
    const x = (c.x === undefined ? 0.5 : c.x) * w;
    const y = (c.y === undefined ? 0.5 : c.y) * h;
    ctx.fillText(c.text, x, y);
    if (c.rules) {
      // Thin rules either side.
      const tw = ctx.measureText(c.text).width;
      ctx.shadowBlur = 0;
      ctx.fillRect(x - tw / 2 - size * 3.2, y - 0.6, size * 2.4, 1.2);
      ctx.fillRect(x + tw / 2 + size * 0.8, y - 0.6, size * 2.4, 1.2);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
  }

  /** Ben's crayon: lowercase, orange, a letter at a time, never quite straight. */
  crayon(ctx, w, h, T, c) {
    const a = envelope(T, c.at, c.dur, 0.01, c.fout === undefined ? 0.6 : c.fout);
    if (a <= 0) return;
    const size = this.fit(ctx, [c.text], (c.size || 0.08) * this.u, CRAYON, 0, w * 0.88);
    const cps = c.cps || 9;
    const t = T - c.at;
    ctx.font = `${size}px ${CRAYON}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const text = c.text;
    const total = ctx.measureText(text).width;
    const x0 = (c.x === undefined ? 0.5 : c.x) * w - (c.align === 'left' ? 0 : total / 2);
    const y0 = (c.y === undefined ? 0.5 : c.y) * h;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(c.rot || -0.03);
    let x = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const cw = ctx.measureText(ch).width;
      const appear = clamp01((t * cps - i) / 1.4);
      if (appear > 0 && ch !== ' ') {
        const jx = (hash(i * 3.1 + text.length) - 0.5) * size * 0.05;
        const jy = (hash(i * 7.7 + 1) - 0.5) * size * 0.1;
        const rot = (hash(i * 1.9 + 4) - 0.5) * 0.12;
        ctx.save();
        ctx.translate(x + cw / 2 + jx, jy);
        ctx.rotate(rot);
        const s = 0.8 + 0.2 * easeOut(appear);
        ctx.scale(s, s);
        ctx.globalAlpha = a * appear;
        ctx.shadowColor = 'rgba(255,138,30,0.45)';
        ctx.shadowBlur = size * 0.35;
        ctx.fillStyle = c.color || ORANGE;
        ctx.fillText(ch, -cw / 2, 0);
        ctx.shadowBlur = 0;
        // Crayon grain: the same stroke, a hair off, fainter.
        ctx.globalAlpha = a * appear * 0.35;
        ctx.fillText(ch, -cw / 2 + size * 0.02, size * 0.015);
        ctx.restore();
      }
      x += cw;
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A name pinned to a survivor: a leader line from over its head, the name, a line of who they are. */
  tag(ctx, w, h, T, c, take) {
    const s = take.who(c.who);
    if (!s) return;
    const a = envelope(T, c.at, c.dur, 0.22, 0.3);
    if (a <= 0) return;
    const v = take.game.view;
    const p = v.project(s.x, s.y, 46);
    const U = this.u;
    const len = (c.len || 0.07) * U;
    const ns = (c.size || 0.062) * U;
    // Lean the other way if the name would run off the frame.
    const dir = [...(c.dir || [1, -1])];
    ctx.font = `${ns}px ${DISPLAY}`;
    ctx.letterSpacing = `${0.08 * ns}px`;
    let text = ctx.measureText(c.name || s.name).width;
    if (c.line) {
      ctx.font = `${ns * 0.3}px ${TYPE}`;
      ctx.letterSpacing = `${0.009 * ns}px`;
      text = Math.max(text, ctx.measureText(c.line).width);
    }
    const room = text + len + ns * 1.4;
    if (dir[0] > 0 && p.x + room > w - U * 0.03) dir[0] = -1;
    else if (dir[0] < 0 && p.x - room < U * 0.03) dir[0] = 1;
    const grow = easeOut(clamp01((T - c.at) / 0.3));
    const ex = p.x + dir[0] * len * grow;
    const ey = p.y + dir[1] * len * 0.8 * grow;
    ctx.globalAlpha = a;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = Math.max(1, U / 540);
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex + dir[0] * ns * 0.5, ey);
    ctx.stroke();
    ctx.fillStyle = CREAM;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, U / 360), 0, Math.PI * 2);
    ctx.fill();
    const tx = ex + dir[0] * ns * 0.62;
    ctx.textAlign = dir[0] < 0 ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${ns}px ${DISPLAY}`;
    ctx.letterSpacing = `${0.08 * ns}px`;
    ctx.shadowBlur = ns * 0.4;
    const slide = (1 - grow) * ns * 0.4 * dir[0];
    ctx.fillStyle = (s.look && s.look.ring && c.tint) || CREAM;
    ctx.fillText(c.name || s.name, tx - slide, ey + ns * 0.32);
    if (c.line) {
      const ls = ns * 0.3;
      ctx.font = `${ls}px ${TYPE}`;
      ctx.letterSpacing = `${0.03 * ls}px`;
      ctx.fillStyle = 'rgba(243,234,215,0.85)';
      const n = Math.min(c.line.length, Math.floor(Math.max(0, T - c.at - 0.2) * 30));
      ctx.fillText(c.line.slice(0, n), tx - slide, ey + ns * 0.32 + ls * 1.5);
    }
    ctx.shadowBlur = 0;
    ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;
  }

  /** Ben's two little googly eyes (the logo's), opening in the dark: a look round, a blink, at you. */
  eyes(ctx, w, h, T, c) {
    const t = T - c.at;
    if (t < 0 || t > c.dur) return;
    const R = (c.size || 0.03) * this.u;
    const x = (c.x === undefined ? 0.5 : c.x) * w;
    const y = (c.y === undefined ? 0.8 : c.y) * h;
    // Open, blink once, close at the very end.
    let open = smooth(clamp01(t / 0.25)) * smooth(clamp01((c.dur - t) / 0.12));
    const b = t - (c.blink || 1);
    if (b > 0 && b < 0.2) open *= b < 0.07 ? 1 - b / 0.07 : (b - 0.07) / 0.13;
    if (open <= 0.01) return;
    // Pupils: a look left, a look right, then straight at you.
    const px = t < 0.55 ? -0.6 : t < 1.1 ? 0.6 : 0;
    const py = t < 1.1 ? 0.12 : 0.04;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, open);
    for (const side of [-1, 1]) {
      const ex = side * R * 1.15;
      ctx.shadowColor = 'rgba(255,138,30,0.5)';
      ctx.shadowBlur = R * 0.8;
      ctx.fillStyle = 'rgba(240,234,220,0.96)';
      ctx.beginPath();
      ctx.arc(ex, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = R * 0.22;
      ctx.stroke();
      ctx.fillStyle = '#0e0e10';
      ctx.beginPath();
      ctx.arc(ex + px * R * 0.42, py * R * 0.42, R * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(ex + px * R * 0.42 - R * 0.14, py * R * 0.42 - R * 0.16, R * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLogo(ctx, w, h, T, c) {
    const a = envelope(T, c.at, c.dur, c.fin === undefined ? 0.12 : c.fin, c.fout === undefined ? 0.6 : c.fout);
    if (a <= 0 || !this.logo) return;
    const t = T - c.at;
    const lh = (c.size || 0.46) * this.u;
    const lw = (lh * this.logo.width) / this.logo.height;
    const s = 1 + 0.14 * (1 - easeOut(clamp01(t / 0.5))) + 0.03 * clamp01(t / c.dur);
    const cx = w / 2;
    const cy = (c.y === undefined ? 0.43 : c.y) * h;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.shadowColor = 'rgba(255,138,30,0.35)';
    ctx.shadowBlur = lh * 0.18 * (1 - clamp01(t / 2) * 0.6);
    ctx.drawImage(this.logo, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
