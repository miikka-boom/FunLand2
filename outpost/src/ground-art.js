// Last Stop: the ground under the town and the wild around it. Pure functions
// that return SVG strings (no DOM; importable in Node).
//
//   lotGroundSvg(a, b, opts)  one lot's 7×7 ground: owned grass with painted
//                             paths (joined across lots), or the scruffy olive
//                             wild with flat clutter, optionally under a haze
//   bloomTiles(a, b)          the 49 owned-green diamonds the clear's bloom animates
//   ruinArt(archetype, opts)  a 3×3 ruined building with a crooked name sign
//   mysteryArt()              a 3×3 heap under a tarp with a big painted "?"
//   junkArt(variant)          a 1×1 junk pile (3 variants) with a sparkle
//   sceneryBackdrop()         the static land around the 35×35 map, in world px
//
// Iso conventions (iso.js): 2:1, one tile = 64 × 32. Object art is { svg, artH }:
// the viewBox is (w + h) * 32 wide and artH tall, with the footprint's diamond at
// its bottom. Light comes from the top-left: left faces are the base colour,
// right faces darker, tops lightest.
//
// Ids: object art (ruins, mystery, junk) uses none, so one cached string can sit
// on the page many times. Lot grounds (clipPath, patterns) and the scenery
// (gradient, symbols) number theirs with a module counter, so every call is unique.

import { LOT, LOTS_ACROSS } from './config.js';

const MAPN = LOT * LOTS_ACROSS;

// --- Palette and tiny helpers ------------------------------------------------------------------

const O = '#2a1b12';
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
/** Root presentation defaults: elements only name a stroke width (and a colour when it isn't O). */
const ROOT = `${XMLNS} overflow="visible" stroke="${'#2a1b12'}" stroke-width="0" stroke-linejoin="round" stroke-linecap="round"`;
const FONT = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="900"';

/** Owned grass (soft checker by global tile parity) and the wild olive. */
const GRASS = ['#80d24f', '#76c847'];
const WILD = ['#a8a862', '#9fa05a'];

const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const RUBBER = '#3d3540';
const BOARD = '#d6b27a';
const BOARD_D = '#a57d49';
const DARK = '#3b3438';
const WALL = '#aca98e'; // olive-grey paint
const WALL2 = '#a2a68c';
const WEED = '#80993f';
const WEED_L = '#a9c45c';
const SIGN_BG = '#eee2bf';
const SIGN_INK = '#b3463b';

let UID = 0;
const uid = (p) => `lsg${p}${++UID}`;

const f = (n) => Math.round(n * 10) / 10;
const pt = (a) => `${f(a[0])} ${f(a[1])}`;

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const dk = (c, t = 0.22) => mix(c, O, t);
const lt = (c, t = 0.3) => mix(c, '#ffffff', t);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function st(o) {
  let s = '';
  if (o.sw) s += `${o.stroke && o.stroke !== O ? ` stroke="${o.stroke}"` : ''} stroke-width="${o.sw}"`;
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  if (o.style) s += ` style="${o.style}"`;
  return s;
}
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${st(o)}/>`;
const path = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${st(o)}/>`;
const circ = (cx, cy, r, fill, o = {}) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${st(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${st(o)}/>`;
const line = (d, color, w, o = {}) => `<path d="${d}" fill="none"${color !== O ? ` stroke="${color}"` : ''} stroke-width="${w}"${o.butt ? ' stroke-linecap="butt"' : ''}${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
const g = (inner, o = {}) => `<g${st(o)}>${inner}</g>`;
/** An outlined stroke: a fat dark line under a coloured one. */
const stick = (d, color, w, ow = 2.2) => line(d, O, w + ow) + line(d, color, w);
/** A polygon; whole-pixel points (shared corners round alike, so faces still meet). */
const poly = (a, fill, o = {}) => `<polygon points="${a.map((q) => `${Math.round(q[0])},${Math.round(q[1])}`).join(' ')}" fill="${fill}"${st(o)}/>`;
const seg = (a, b) => `M${pt(a)}L${pt(b)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function sparkle(cx, cy, r, fill = '#fff6c8') {
  const k = r * 0.2;
  return path(`M${f(cx)} ${f(cy - r)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + r)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + r)}Q${f(cx - k)} ${f(cy + k)} ${f(cx - r)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - r)}Z`, fill, { sw: 1.2 });
}

/** Smooth closed path through points (Catmull-Rom). */
function smooth(pts, closed = true) {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

// --- Iso object helpers ------------------------------------------------------------------------

/** Screen point of (p along i, q along j, height z) for a w × h footprint drawn artH tall. */
function iso(w, h, artH) {
  const ox = h * 32;
  const oy = artH - (w + h) * 16;
  return (p, q, z = 0) => [ox + (p - q) * 32, oy + (p + q) * 16 - z];
}

/** An iso box: left face (q = q1) base colour, right face (p = p1) darker, top lightest. */
function box(P, p0, q0, p1, q1, z0, z1, col, o = {}) {
  const sw = o.sw ?? 2;
  let s = '';
  if (!o.noLeft) s += poly([P(p0, q1, z0), P(p1, q1, z0), P(p1, q1, z1), P(p0, q1, z1)], o.left || col, { sw });
  if (!o.noRight) s += poly([P(p1, q1, z0), P(p1, q0, z0), P(p1, q0, z1), P(p1, q1, z1)], o.right || dk(col, 0.24), { sw });
  if (!o.noTop) s += poly([P(p0, q0, z1), P(p1, q0, z1), P(p1, q1, z1), P(p0, q1, z1)], o.top || lt(col, 0.24), { sw });
  return s;
}
/** A rectangle on the left-facing plane q, or the right-facing plane p. */
const onL = (P, q, pa, pb, za, zb) => [P(pa, q, za), P(pb, q, za), P(pb, q, zb), P(pa, q, zb)];
const onR = (P, p, qa, qb, za, zb) => [P(p, qa, za), P(p, qb, za), P(p, qb, zb), P(p, qa, zb)];
/** A flat quad on the ground (or at height z). */
const flat = (P, p0, q0, p1, q1, z = 0) => [P(p0, q0, z), P(p1, q0, z), P(p1, q1, z), P(p0, q1, z)];

/** A soft shadow falling down-right of a footprint. */
const shadowQ = (P, p0, q0, p1, q1, k = 0.35) => poly([P(p0, q0), P(p1 + k, q0), P(p1 + k, q1), P(p0, q1)], O, { op: 0.15 });

/** A boarded-up window on a face ('L' plane q = k, or 'R' plane p = k), a0..a1 along it, z0..z1 high. */
function boarded(P, face, k, a0, a1, z0, z1, o = {}) {
  const Q = face === 'L' ? (a, z) => P(a, k, z) : (a, z) => P(k, a, z);
  const fr = 0.06;
  let s = poly([Q(a0 - fr, z0 - 2), Q(a1 + fr, z0 - 2), Q(a1 + fr, z1 + 2), Q(a0 - fr, z1 + 2)], o.frame || '#c9bf9e', { sw: 1.6 });
  s += poly([Q(a0, z0), Q(a1, z0), Q(a1, z1), Q(a0, z1)], DARK);
  s += poly([Q(a0, z1), Q(a0 + (a1 - a0) * 0.35, z1), Q(a0, z1 - (z1 - z0) * 0.55)], '#6c6670');
  const n = o.n ?? 2;
  for (let i = 0; i < n; i++) s += plank(Q, a0 - 0.1, a1 + 0.1, z0 + ((i + 0.5) / n) * (z1 - z0), (i % 2 ? 1 : -1) * Math.min(5, (z1 - z0) * 0.16), i % 2 ? BOARD : '#cfa76c');
  return s;
}

/** A plank nailed across a face: from a0 to a1 along it, centred at height zc, one end tilt higher. */
function plank(Q, a0, a1, zc, tilt, c = BOARD, w = 2.3) {
  return poly([Q(a0, zc - tilt - w), Q(a1, zc + tilt - w), Q(a1, zc + tilt + w), Q(a0, zc - tilt + w)], c, { sw: 1.5 });
}

/** A tuft of weeds standing at screen point (x, y). */
function weed(x, y, k = 1, c = WEED) {
  return path(tuftD(x, y, k), c, { sw: 1.3 });
}
const TUFT_BIG = [[-6, 0], [-9, -9], [-4, -5], [-3, -15], [0, -6], [2, -13], [3.5, -5], [8, -10], [6, 0]];
const tuftD = (x, y, k, shape = TUFT_BIG) => 'M' + shape.map(([a, b]) => `${f(x + a * k)} ${f(y + b * k)}`).join('L') + 'Z';
function weeds(P, list) {
  let d = '';
  let hl = '';
  for (const [p, q, k = 1] of list) {
    const [x, y] = P(p, q);
    d += tuftD(x, y, k);
    hl += `M${f(x - 2.5 * k)} ${f(y - 1)}L${f(x - 3 * k)} ${f(y - 10 * k)}`;
  }
  return path(d, WEED, { sw: 1.3 }) + line(hl, WEED_L, 1.4, { op: 0.9 });
}

/** A creeping vine on a face: a wiggly stem with leaves, from z0 up to z1. */
function vine(P, face, k, a, z0, z1, wob = 0.08) {
  const Q = face === 'L' ? (aa, z) => P(aa, k, z) : (aa, z) => P(k, aa, z);
  const n = Math.max(3, Math.round((z1 - z0) / 7));
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(Q(a + (i % 2 ? wob : -wob) * (i / n + 0.4), z0 + ((z1 - z0) * i) / n));
  let leaves = '';
  for (let i = 1; i <= n; i++) {
    const [x, y] = pts[i];
    const d = i % 2 ? 1 : -1;
    leaves += `M${f(x)} ${f(y)}l${3 * d} -3l${3 * d} 1.5l${-2.5 * d} 3z`;
  }
  return line(smooth(pts, false), '#4f6e2c', 2.2) + path(leaves, '#8fb24a', { sw: 1 });
}

/** A crack: a jagged dark line on a face. */
const crack = (pts) => line('M' + pts.map(pt).join('L'), O, 1.2, { op: 0.55 });

/**
 * A crooked name sign on a face plane ('L' runs down-right, 'R' up-right), centred at (cx, cy).
 * Long names squeeze to fit.
 */
function faceSign(cx, cy, w, h, text, o = {}) {
  const sk = (o.face || 'L') === 'L' ? 26.565 : -26.565;
  const t = String(text || '').toUpperCase().trim().slice(0, 16);
  let fs = o.size || 12;
  if (t.length > 9) fs *= 0.86;
  const maxW = w - 10;
  const est = t.length * fs * 0.7;
  const fit = est > maxW ? ` textLength="${f(maxW)}" lengthAdjust="spacingAndGlyphs"` : '';
  const ink = o.ink || SIGN_INK;
  let s = rect(-w / 2, -h / 2, w, h, o.bg || SIGN_BG, { sw: 2.2, rx: 2.5 });
  // Weathering: a peeled corner and a darker bottom band.
  s += path(`M${f(w / 2 - 12)} ${f(-h / 2)}L${f(w / 2)} ${f(-h / 2)}L${f(w / 2)} ${f(-h / 2 + 8)}Z`, o.peel || '#b9ab86', { op: 0.9 });
  s += rect(-w / 2 + 1.5, h / 2 - 4, w - 3, 2.5, O, { op: 0.08 });
  if (o.bulbs) {
    // Dead marquee bulbs along the top and bottom edges (a few missing).
    let d = '';
    for (let x = -w / 2 + 6, k = 0; x <= w / 2 - 5; x += 9, k++) {
      if (k !== 3) d += `M${f(x)} ${f(-h / 2 - 0.5)}h.01`;
      if (k % 4 !== 1) d += `M${f(x + 4)} ${f(h / 2 + 0.5)}h.01`;
    }
    s += line(d, O, 5.2) + line(d, '#e2d8b8', 3);
  }
  s += `<text x="0" y="${f(fs * 0.36)}" ${FONT} font-size="${f(fs)}" text-anchor="middle" fill="${ink}"${fit}>${esc(t)}</text>`;
  s += circ(-w / 2 + 4, -h / 2 + 4, 1.1, '#5b4636') + circ(w / 2 - 4, h / 2 - 4, 1.1, '#5b4636');
  return g(s, { tf: `translate(${f(cx)} ${f(cy)}) rotate(${o.rot ?? -5}) skewY(${sk})` });
}

/** A chunk of rubble and a few stray bricks around a ground point list. */
function rubble(P, list) {
  let s = '';
  for (const [p, q, n = 3] of list) {
    for (let i = 0; i < n; i++) {
      const [x, y] = P(p + (i % 2 ? 0.08 : -0.06) * i, q + (i % 3 ? -0.05 : 0.06) * i);
      if (i % 2) s += poly([[x - 4, y - 2], [x + 2, y - 4], [x + 6, y - 1], [x + 1, y + 1.5]], ['#c0786a', '#b8b2a2', '#a69f8e'][i % 3], { sw: 1.1 });
      else s += ell(x, y - 1, 3.4, 2, ['#b5ae9c', '#c27b62', '#9c968a'][i % 3], { sw: 1.1 });
    }
  }
  return s;
}

// --- Lot ground ---------------------------------------------------------------------------------

const LOT_D = 'M224 0L448 112L224 224L0 112Z';
/** Lot-local point of tile coords (p along i, q along j). */
const LP = (p, q) => [(p - q) * 32 + 224, (p + q) * 16];
const tileD = (u, v) => `M${(u - v) * 32 + 224} ${(u + v) * 16}l32 16l-32 16l-32 -16z`;
const DIR4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * One lot's ground, viewBox 0 0 448 224: local tile (u, v) has its top corner at
 * ((u − v)·32 + 224, (u + v)·16). owned: two greens in a soft checker, a few
 * flowers, and painted paths that join toward path neighbours (pathAt takes
 * GLOBAL tile coords and may look into neighbouring lots). Otherwise the wild:
 * scruffy olive, tall-grass tufts and flat clutter picked by seed. haze: a pale
 * fog over a far lot.
 */
export function lotGroundSvg(a, b, { owned = false, haze = false, pathAt = null, seed } = {}) {
  const r = rng(seed ?? a * 31 + b * 7 + 1);
  const i0 = a * LOT;
  const j0 = b * LOT;
  const par = (i0 + j0) % 2;
  const [A, B] = owned ? GRASS : WILD;
  // A hair of overdraw hides the seams between neighbouring lot images.
  let s = `<path d="${LOT_D}" fill="${A}" stroke="${A}" stroke-width="1.4"/>`;
  let d = '';
  for (let u = 0; u < LOT; u++) for (let v = 0; v < LOT; v++) if ((u + v + par) % 2) d += tileD(u, v);
  s += `<path d="${d}" fill="${B}"/>`;
  const at = (i, j) => {
    if (!pathAt || i < 0 || j < 0 || i >= MAPN || j >= MAPN) return null;
    const t = pathAt(i, j);
    return PATH_TYPES.has(t) ? t : null;
  };
  if (owned) {
    s += ownedDressing(r, (u, v) => at(i0 + u, j0 + v));
    s += pathsSvg(i0, j0, at, r);
  } else s += wildDressing(r);
  if (haze) s += hazeSvg(r);
  return `<svg ${ROOT} viewBox="0 0 448 224">${s}</svg>`;
}

/**
 * The bloom overlay: 49 separate owned-green diamonds (same viewBox as the ground),
 * each <polygon class="bloom" style="--d:N"> with N = |u − 3| + |v − 3| (0..6), the
 * tile's distance from the lot centre, for a CSS animation-delay.
 */
export function bloomTiles(a, b) {
  const par = (a * LOT + b * LOT) % 2;
  let s = '';
  for (let u = 0; u < LOT; u++)
    for (let v = 0; v < LOT; v++) {
      const x = (u - v) * 32 + 224;
      const y = (u + v) * 16;
      const c = GRASS[(u + v + par) % 2];
      s += `<polygon class="bloom" style="--d:${Math.abs(u - 3) + Math.abs(v - 3)}" points="${x},${y} ${x + 32},${y + 16} ${x},${y + 32} ${x - 32},${y + 16}" fill="${c}" stroke="${c}" stroke-width="1"/>`;
    }
  return `<svg ${ROOT} viewBox="0 0 448 224">${s}</svg>`;
}

const FLOWERS = ['#fffaf0', '#ffe066', '#ff9ccf', '#c9a8ff'];

function ownedDressing(r, isPath) {
  let blades = '';
  let fl = '';
  for (let k = 0; k < 22; k++) {
    const u = Math.floor(r() * LOT);
    const v = Math.floor(r() * LOT);
    const [x, y] = LP(u + 0.2 + r() * 0.6, v + 0.25 + r() * 0.6);
    if (isPath(u, v)) continue;
    if (k < 14) blades += `M${f(x - 3)} ${f(y)}l1.5 -4M${f(x)} ${f(y + 0.5)}l0 -5M${f(x + 3)} ${f(y)}l-1.5 -4`;
    else fl += circ(x, y, 2.2, FLOWERS[k % 4], { sw: 0.8 }) + circ(x, y, 0.8, k % 4 === 1 ? '#ff9a3c' : '#ffc23a');
  }
  return (blades ? `<path d="${blades}" fill="none" stroke="#5aa83a" stroke-width="1.3"/>` : '') + fl;
}

/** A random tile away from the ruin in the lot's middle (u, v in 2..4). */
function ringTile(r, max = 6) {
  for (let k = 0; k < 40; k++) {
    const u = Math.floor(r() * (max + 1));
    const v = Math.floor(r() * (max + 1));
    if (u >= 2 && u <= 4 && v >= 2 && v <= 4) continue;
    return [u, v];
  }
  return [0, 6];
}

const TUFT = [[-5, 0], [-7, -8], [-3, -4], [-2, -12], [0.5, -4], [3, -10], [3.5, -3], [7, -7], [5, 0]];

const DECALS = {
  oil(u, v) {
    const [x, y] = LP(u + 0.5, v + 0.5);
    return ell(x, y, 13, 6.2, '#3b3430', { op: 0.3 }) + ell(x - 9, y + 4, 4.5, 2.1, '#3b3430', { op: 0.25 }) + ell(x + 3, y - 1, 6, 2.4, '#8f7fc0', { op: 0.25 });
  },
  tarmac(u, v, r) {
    const j = () => (r() - 0.5) * 0.1;
    const q = [LP(u + 0.08 + j(), v + 0.12), LP(u + 0.92, v + 0.08 + j()), LP(u + 0.95 + j(), v + 0.9), LP(u + 0.1, v + 0.92 + j())];
    let s = poly(q, '#908d82', { sw: 1.2, stroke: '#6c695f' });
    s += poly([LP(u + 0.55, v + 0.6), LP(u + 0.8, v + 0.62), LP(u + 0.7, v + 0.85)], WILD[1], { sw: 1, stroke: '#6c695f' });
    s += crack([LP(u + 0.15, v + 0.5), LP(u + 0.35, v + 0.42), LP(u + 0.45, v + 0.55), LP(u + 0.7, v + 0.38), LP(u + 0.85, v + 0.3)]);
    s += crack([LP(u + 0.45, v + 0.55), LP(u + 0.4, v + 0.8)]);
    return s;
  },
  leaves(u, v, r) {
    let s = '';
    const cols = ['#d98a3a', '#c9a33a', '#b0652e', '#bdb348'];
    for (let k = 0; k < 7; k++) {
      const [x, y] = LP(u + 0.15 + r() * 0.7, v + 0.15 + r() * 0.7);
      s += ell(x, y, 2.9, 1.4, cols[k % 4], { sw: 0.6, tf: `rotate(${Math.round(r() * 180)} ${f(x)} ${f(y)})` });
    }
    return s;
  },
  sign(u, v) {
    // A fallen STOP sign lying flat, its post beside it.
    const c = [u + 0.42, v + 0.5];
    const oct = [];
    const inner = [];
    for (let k = 0; k < 8; k++) {
      const an = ((k * 45 + 22.5) * Math.PI) / 180;
      oct.push(LP(c[0] + Math.cos(an) * 0.3, c[1] + Math.sin(an) * 0.3));
      inner.push(LP(c[0] + Math.cos(an) * 0.25, c[1] + Math.sin(an) * 0.25));
    }
    const [x0, y0] = LP(u, v);
    let s = stick(seg(LP(u + 0.7, v + 0.52), LP(u + 1.15, v + 0.6)), '#a7adb2', 2.4, 1.6);
    s += poly(oct, '#c95a4c', { sw: 1.3 }) + poly(inner, 'none', { sw: 1.1, stroke: '#f3e9dc' });
    s += `<text transform="matrix(.32 .16 -.32 .16 ${x0} ${y0})" x="42" y="57" ${FONT} font-size="17" text-anchor="middle" fill="#f6eee2">STOP</text>`;
    return s;
  },
  marks(u, v) {
    const tr = (dq) => `M${pt(LP(u, v + 0.25 + dq))}Q${pt(LP(u + 1, v + 0.05 + dq))} ${pt(LP(u + 2, v + 0.55 + dq))}`;
    return `<path d="${tr(0)}${tr(0.3)}" fill="none" stroke="#4a4038" stroke-width="4" opacity=".16"/>`;
  },
  rubble(u, v, r) {
    let s = '';
    for (let k = 0; k < 5; k++) {
      const [x, y] = LP(u + 0.2 + r() * 0.6, v + 0.2 + r() * 0.6);
      s += ell(x, y, 2.4 + r() * 1.6, 1.5 + r(), ['#a19c90', '#8e8a80', '#b8b2a2'][k % 3], { sw: 0.9 });
    }
    return s;
  },
  tyre(u, v) {
    const [x, y] = LP(u + 0.5, v + 0.5);
    return ell(x, y + 1.5, 10, 5, RUBBER, { sw: 1.4 }) + ell(x, y - 1, 10, 5, '#4d4550', { sw: 1.4 }) + ell(x, y - 1, 4.4, 2.1, WILD[0], { sw: 1.1 });
  },
};
/** How often each decal comes up (weights); the fallen sign is a rare treat. */
const DECAL_W = { oil: 3, tarmac: 3, leaves: 3, rubble: 3, marks: 2, tyre: 2, sign: 0.6 };

function wildDressing(r) {
  let s = '';
  // Darker overgrowth and dry dirt patches.
  for (let k = 0; k < 5; k++) {
    const [x, y] = LP(0.9 + r() * 5.2, 0.9 + r() * 5.2);
    const rx = 16 + r() * 18;
    s += ell(x, y, rx, rx / 2, k % 2 ? '#929552' : '#b6a873', { op: 0.55 });
  }
  // Flat clutter: 4 or 5 of the decals, never the same twice.
  const pool = Object.entries(DECAL_W);
  const kinds = [];
  for (let n = 3 + (r() < 0.6 ? 1 : 0); n > 0 && pool.length; n--) {
    let x = r() * pool.reduce((t, e) => t + e[1], 0);
    const k = pool.findIndex((e) => (x -= e[1]) < 0);
    kinds.push(pool.splice(k < 0 ? 0 : k, 1)[0][0]);
  }
  for (const kind of kinds) {
    const [u, v] = ringTile(r, kind === 'marks' ? 4 : kind === 'sign' ? 5 : 6);
    s += DECALS[kind](u, v, r);
  }
  // Tall-grass tufts.
  let d = '';
  for (let k = 0; k < 20; k++) {
    const [x, y] = LP(0.4 + r() * 6.2, 0.6 + r() * 6);
    const sc = 0.7 + r() * 0.55;
    d += 'M' + TUFT.map(([p, q]) => `${f(x + p * sc)} ${f(y + q * sc)}`).join('L') + 'Z';
  }
  s += `<path d="${d}" fill="#8c9b46" stroke="${O}" stroke-width=".9" stroke-linejoin="round"/>`;
  return s;
}

function hazeSvg(r) {
  const [x, y] = LP(3.2 + r() * 0.6, 3.2 + r() * 0.6);
  return `<path d="${LOT_D}" fill="#eef1e2" opacity=".45"/>` + ell(x, y, 120, 58, '#ffffff', { op: 0.12 });
}

// --- Paths --------------------------------------------------------------------------------------

const PATH_TYPES = new Set(['dirt', 'planks', 'brick']);
/** Deck paths: inset margin per tile side (band = 1 − 2m of a tile). */
const DECK = {
  planks: { m: 0.13, side: 3, sideFill: '#8b5a2f' },
  brick: { m: 0.09, side: 2, sideFill: '#a2947a' },
};

/** Is cell (cx, cy) (0..2 each: margin, middle, margin) of tile (i, j) paved? */
function occ(at, i, j, cx, cy) {
  if (!at(i, j)) return false;
  if (cx === 1 && cy === 1) return true;
  const di = cx - 1;
  const dj = cy - 1;
  if (dj === 0) return !!at(i + di, j);
  if (di === 0) return !!at(i, j + dj);
  return !!(at(i + di, j) && at(i, j + dj) && at(i + di, j + dj));
}

function pathsSvg(i0, j0, at, r) {
  const by = { dirt: [], planks: [], brick: [] };
  for (let u = 0; u < LOT; u++)
    for (let v = 0; v < LOT; v++) {
      const t = at(i0 + u, j0 + v);
      if (t) by[t].push([u, v]);
    }
  if (!by.dirt.length && !by.planks.length && !by.brick.length) return '';
  const id = uid('p');
  const T = 'patternUnits="userSpaceOnUse" width="1" height="1" patternTransform="matrix(32 16 -32 16 224 0)"';
  let defs = `<clipPath id="${id}c"><path d="M224 -2.2L452.4 112L224 226.2L-4.4 112Z"/></clipPath>`;
  let s = '';
  if (by.dirt.length) {
    const { d, peb, blocks } = dirtD(by.dirt, i0, j0, at, r);
    defs += `<path id="${id}d" d="${d}"/>`;
    const use = (w, c, op) => `<use href="#${id}d" fill="none" stroke="${c}" stroke-width="${w}"${op ? ` opacity="${op}"` : ''}/>`;
    s += use(23, '#a27b4e') + use(18.5, '#d5ae78') + (blocks ? `<path d="${blocks}" fill="#d5ae78"/>` : '') + use(7, '#e7ca95', 0.8);
    s += `<path d="${peb}" stroke="#9c774a" stroke-width="2.4"/>`;
  }
  if (by.planks.length) {
    // Planks lie across the way you walk: seams at constant s (A) or constant t (B).
    defs +=
      `<pattern id="${id}a" ${T}><rect width="1" height="1" fill="#dda669"/><path d="M.2 0h.2v1h-.2zM.6 0h.2v1h-.2z" fill="#cd9459"/>` +
      `<path d="M0 0V1M.2 0V1M.4 0V1M.6 0V1M.8 0V1M1 0V1" stroke="#7d5330" stroke-width=".035"/>` +
      `<path d="M.1 .24h.001M.3 .24h.001M.5 .24h.001M.7 .24h.001M.9 .24h.001M.1 .76h.001M.3 .76h.001M.5 .76h.001M.7 .76h.001M.9 .76h.001" stroke="#6b4a2c" stroke-width=".05"/></pattern>` +
      `<pattern id="${id}b" ${T}><rect width="1" height="1" fill="#dda669"/><path d="M0 .2v.2h1v-.2zM0 .6v.2h1v-.2z" fill="#cd9459"/>` +
      `<path d="M0 0H1M0 .2H1M0 .4H1M0 .6H1M0 .8H1M0 1H1" stroke="#7d5330" stroke-width=".035"/>` +
      `<path d="M.24 .1h.001M.24 .3h.001M.24 .5h.001M.24 .7h.001M.24 .9h.001M.76 .1h.001M.76 .3h.001M.76 .5h.001M.76 .7h.001M.76 .9h.001" stroke="#6b4a2c" stroke-width=".05"/></pattern>`;
    s += deckSvg('planks', by.planks, i0, j0, at, id);
  }
  if (by.brick.length) {
    // Basketweave pavers: four 2-brick blocks per tile, turned alternately.
    defs +=
      `<pattern id="${id}k" ${T}><rect width="1" height="1" fill="#d97b55"/>` +
      `<path d="M0 .25h.5v.25h-.5zM.75 0h.25v.5h-.25zM.25 .5h.25v.5h-.25zM.5 .75h.5v.25h-.5z" fill="#c76a4a"/>` +
      `<path d="M.04 .07h.38M.79 .06v.36M.29 .57v.36M.56 .82h.38" stroke="#ec9b74" stroke-width=".03"/>` +
      `<path d="M0 0H1M0 .5H1M0 1H1M0 0V1M.5 0V1M1 0V1M0 .25H.5M.75 0V.5M.25 .5V1M.5 .75H1" stroke="#8f4630" stroke-width=".03" fill="none"/></pattern>`;
    s += deckSvg('brick', by.brick, i0, j0, at, id);
  }
  return `<defs>${defs}</defs><g clip-path="url(#${id}c)">${s}</g>`;
}

/** Dirt: one centre-to-centre track per joined pair (clipped at the lot edge, so both lots draw their half). */
function dirtD(list, i0, j0, at, r) {
  let d = '';
  let peb = '';
  const C = (u, v) => LP(u + 0.5, v + 0.5);
  for (const [u, v] of list) {
    const c = C(u, v);
    let n = 0;
    for (const [du, dv] of DIR4) {
      const t = at(i0 + u + du, j0 + v + dv);
      if (!t) continue;
      n++;
      const nu = u + du;
      const nv = v + dv;
      const inLot = nu >= 0 && nv >= 0 && nu < LOT && nv < LOT;
      let e;
      if (t === 'dirt') {
        if (inLot && (du < 0 || dv < 0)) continue;
        e = C(nu, nv);
      } else e = LP(u + 0.5 + du * 0.62, v + 0.5 + dv * 0.62); // tuck under the paved neighbour
      d += `M${pt(c)}L${pt(e)}`;
    }
    if (!n) d += `M${f(c[0] - 6)} ${f(c[1] - 1)}L${f(c[0] + 6)} ${f(c[1] + 1)}`;
    for (let k = 0; k < 2; k++) {
      const p = LP(u + 0.3 + r() * 0.4, v + 0.3 + r() * 0.4);
      peb += `M${pt(p)}h1.2`;
    }
  }
  // A 2×2 block of dirt is a worn patch, not a ring: fill between the four centres.
  let blocks = '';
  const dirt = (i, j) => at(i, j) === 'dirt';
  for (let u = -1; u < LOT; u++)
    for (let v = -1; v < LOT; v++) {
      const i = i0 + u;
      const j = j0 + v;
      if (dirt(i, j) && dirt(i + 1, j) && dirt(i, j + 1) && dirt(i + 1, j + 1)) blocks += `M${pt(C(u, v))}L${pt(C(u + 1, v))}L${pt(C(u + 1, v + 1))}L${pt(C(u, v + 1))}Z`;
    }
  return { d, peb, blocks };
}

/** Planks or brick: a band per tile (centre + arms + filled corners), outlined on its exposed sides. */
function deckSvg(type, list, i0, j0, at, id) {
  const { m, side, sideFill } = DECK[type];
  const S = [0, m, 1 - m, 1];
  // Quads that reach a tile edge overhang it a hair (E), so a neighbouring lot's
  // overdraw never leaves a grass line across a path; the clip keeps it near.
  const E = 0.05;
  const xe = (t, u) => (t === u ? t - E : t === u + 1 ? t + E : t);
  const quad = (p0, q0, p1, q1, u, v) => {
    if (u != null) [p0, p1, q0, q1] = [xe(p0, u), xe(p1, u), xe(q0, v), xe(q1, v)];
    return `M${pt(LP(p0, q0))}L${pt(LP(p1, q0))}L${pt(LP(p1, q1))}L${pt(LP(p0, q1))}Z`;
  };
  let dA = '';
  let dB = '';
  const edges = new Map();
  const addEdge = (axis, fixed, a, b, front) => {
    const k = `${axis}${Math.round(fixed * 1000)}${front ? '+' : '-'}`;
    let e = edges.get(k);
    if (!e) edges.set(k, (e = { axis, fixed, front, list: [] }));
    e.list.push([a, b]);
  };
  const nb = (i, j, cx, cy) => {
    let ii = i;
    let jj = j;
    if (cx < 0) (cx = 2), ii--;
    else if (cx > 2) (cx = 0), ii++;
    if (cy < 0) (cy = 2), jj--;
    else if (cy > 2) (cy = 0), jj++;
    return occ(at, ii, jj, cx, cy);
  };
  for (const [u, v] of list) {
    const i = i0 + u;
    const j = j0 + v;
    const c = [];
    for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) c[cy * 3 + cx] = occ(at, i, j, cx, cy);
    const r0 = c[3] ? 0 : 1;
    const r1 = c[5] ? 2 : 1;
    const c0 = c[1] ? 0 : 1;
    const c1 = c[7] ? 2 : 1;
    const full = c.every(Boolean);
    const row = full ? quad(u, v, u + 1, v + 1, u, v) : quad(u + S[r0], v + m, u + S[r1 + 1], v + 1 - m, u, v);
    const col = quad(u + m, v + S[c0], u + 1 - m, v + S[c1 + 1], u, v);
    if (type === 'planks') {
      const alongI = c[3] || c[5] || !(c[1] || c[7]);
      if (alongI) {
        dA += row;
        if (c[1] && !full) dB += quad(u + m, v, u + 1 - m, v + m, u, v);
        if (c[7] && !full) dB += quad(u + m, v + 1 - m, u + 1 - m, v + 1, u, v);
      } else dB += col;
    } else {
      dA += row;
      if (!full && (c0 < 1 || c1 > 1)) dA += col;
    }
    if (!full) for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (c[cy * 3 + cx]) dA += quad(u + S[cx], v + S[cy], u + S[cx + 1], v + S[cy + 1], u, v);
    // Exposed sides (in lot-local tile coords, merged later).
    for (let cy = 0; cy < 3; cy++)
      for (let cx = 0; cx < 3; cx++) {
        if (!c[cy * 3 + cx]) continue;
        const pa = u + S[cx];
        const pb = u + S[cx + 1];
        const qa = v + S[cy];
        const qb = v + S[cy + 1];
        if (!nb(i, j, cx + 1, cy)) addEdge('p', pb, qa, qb, true);
        if (!nb(i, j, cx - 1, cy)) addEdge('p', pa, qa, qb, false);
        if (!nb(i, j, cx, cy + 1)) addEdge('q', qb, pa, pb, true);
        if (!nb(i, j, cx, cy - 1)) addEdge('q', qa, pa, pb, false);
      }
  }
  let outl = '';
  let strips = '';
  for (const e of edges.values()) {
    e.list.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const [a, b] of e.list) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    for (const [a, b] of merged) {
      const A = e.axis === 'p' ? LP(e.fixed, a) : LP(a, e.fixed);
      const B = e.axis === 'p' ? LP(e.fixed, b) : LP(b, e.fixed);
      outl += seg(A, B);
      if (e.front) strips += `M${pt(A)}L${pt(B)}l0 ${side}L${f(A[0])} ${f(A[1] + side)}Z`;
    }
  }
  let s = strips ? path(strips, sideFill, { sw: 1.2 }) : '';
  if (dA) s += `<path d="${dA}" fill="url(#${id}${type === 'brick' ? 'k' : 'a'})"/>`;
  if (dB) s += `<path d="${dB}" fill="url(#${id}b)"/>`;
  if (type === 'brick') s += line(outl, O, 4.6) + line(outl, '#efe4c9', 2.6);
  else s += line(outl, O, 1.8);
  return s;
}

// --- Ruins --------------------------------------------------------------------------------------

const RUIN_H = { shopfront: 136, house: 154, stand: 154, stage: 150, silo: 204, garage: 128 };
const RUIN_NAME = { shopfront: 'DINER', house: 'MOTEL', stand: 'BURGERS', stage: 'CAMP', silo: 'LUMBER', garage: 'GARAGE' };

/** Dirt and rubble underfoot, so the ruin sits in its own scruffy yard. */
function yard(P, r) {
  let s = poly([P(0.1, 0.3), P(1.5, 0.08), P(2.9, 0.3), P(2.92, 1.5), P(2.75, 2.92), P(1.5, 2.95), P(0.25, 2.8), P(0.08, 1.5)], '#958d68', { op: 0.42 });
  for (let k = 0; k < 6; k++) {
    const [x, y] = P(0.25 + r() * 2.5, 2.6 + r() * 0.3);
    s += ell(x, y, 1.8 + r(), 1.1, '#857d5c', { op: 0.6 });
  }
  return s;
}

function shopfront(P, name) {
  let s = shadowQ(P, 0.3, 0.45, 2.7, 2.45) + weeds(P, [[0.2, 1.3, 0.8], [1.4, 0.3, 0.9]]);
  // The sidewalk.
  s += box(P, 0.12, 2.45, 2.88, 2.86, 0, 2.5, '#bbb4a0', { sw: 1.5 });
  s += crack([P(0.7, 2.47, 2.5), P(0.78, 2.62, 2.5), P(0.72, 2.84, 2.5)]) + crack([P(2.2, 2.47, 2.5), P(2.3, 2.84, 2.5)]);
  // The store.
  s += box(P, 0.3, 0.45, 2.7, 2.45, 0, 44, WALL);
  s += poly(onL(P, 2.45, 2.32, 2.62, 30, 38), lt(WALL, 0.3), { op: 0.9 }) + poly(onR(P, 2.7, 0.6, 0.85, 6, 14), dk(WALL, 0.1));
  // Roof: a tar patch, the old AC unit, a vent.
  s += poly([P(0.7, 0.8, 44), P(1.3, 0.72, 44), P(1.38, 1.35, 44), P(0.78, 1.4, 44)], '#9fa08c', { op: 0.9 });
  s += box(P, 1.7, 0.72, 2.3, 1.28, 44, 54, '#aeb4b0', { sw: 1.6 }) + line(`M${pt(P(1.78, 1.28, 47))}L${pt(P(2.22, 1.28, 47))}M${pt(P(1.78, 1.28, 50))}L${pt(P(2.22, 1.28, 50))}`, '#6d7470', 1.2);
  s += stick(seg(P(1.2, 1.9, 44), P(1.2, 1.9, 53)), '#9aa09c', 3, 2) + ell(...P(1.2, 1.9, 54), 3, 1.5, '#7d837f', { sw: 1.2 });
  // The false front, stepped up in the middle.
  s += box(P, 0.3, 2.3, 2.7, 2.45, 44, 60, WALL2) + box(P, 0.8, 2.3, 2.2, 2.45, 60, 69, WALL2);
  s += poly(onL(P, 2.45, 0.3, 2.7, 40.5, 44), dk(WALL, 0.28), { sw: 1.4 });
  const sc = P(1.5, 2.45, 58);
  s += faceSign(sc[0], sc[1], 80, 21, name, { rot: -4, size: 13 });
  // The shop window and the door, boarded.
  s += boarded(P, 'L', 2.45, 0.46, 1.48, 7, 32, { n: 3 });
  s += poly(onL(P, 2.45, 1.74, 2.38, 0, 31), '#80684f', { sw: 1.8 }) + poly(onL(P, 2.45, 1.82, 2.3, 18, 28), DARK, { sw: 1.2 });
  s += stick(seg(P(1.72, 2.47, 3), P(2.4, 2.47, 27)), BOARD, 3.6, 2.2) + stick(seg(P(1.72, 2.47, 25), P(2.4, 2.47, 6)), '#cfa76c', 3.6, 2.2);
  // The torn awning over the window.
  for (let k = 0; k < 6; k++) {
    const pa = 0.38 + k * 0.2;
    if (k === 4) continue; // torn away
    s += poly([P(pa, 2.45, 38), P(pa + 0.2, 2.45, 38), P(pa + 0.2, 2.8, 30), P(pa, 2.8, 30)], k % 2 ? '#e9dfc6' : '#c47a6a', { sw: 1.4 });
  }
  // The torn stripe hangs straight down off the bare frame.
  s += line(seg(P(1.18, 2.8, 30), P(1.38, 2.8, 30)) + seg(P(1.38, 2.45, 38), P(1.38, 2.8, 30)), '#8f969a', 1.6);
  s += poly([P(1.19, 2.47, 38), P(1.37, 2.47, 38), P(1.35, 2.5, 22), P(1.28, 2.5, 25), P(1.21, 2.5, 19)], '#c47a6a', { sw: 1.4 });
  // The side: a little window, the drainpipe, cracks.
  s += boarded(P, 'R', 2.7, 0.95, 1.75, 15, 32, { n: 2 });
  s += stick(seg(P(2.7, 2.36, 43), P(2.7, 2.36, 12)), '#9aa3a6', 2.4, 1.8) + stick(seg(P(2.7, 2.36, 9), P(2.72, 2.6, 2)), '#9aa3a6', 2.4, 1.8);
  s += crack([P(0.3, 2.45, 30), P(0.4, 2.45, 26), P(0.38, 2.45, 20), P(0.5, 2.45, 16)]) + crack([P(2.7, 1.9, 40), P(2.7, 2.0, 34), P(2.7, 1.92, 28)]);
  // Overgrowth.
  s += vine(P, 'L', 2.45, 0.36, 0, 42) + vine(P, 'R', 2.7, 0.55, 0, 30);
  s += weeds(P, [[0.35, 2.55, 1.1], [1.5, 2.6, 0.8], [2.62, 2.52], [2.8, 1.5, 0.9], [2.82, 0.6, 1.1]]);
  s += rubble(P, [[0.6, 2.72, 3], [2.55, 2.75, 2]]);
  return s;
}

function house(P, name) {
  const wall = '#b1ad90';
  const roof = '#9d6b5d';
  let s = shadowQ(P, 0.55, 0.6, 2.45, 2.2, 0.45) + weeds(P, [[0.35, 1.5, 0.9], [0.5, 0.45, 0.8]]);
  // Back roof slope, then the chimney.
  s += poly([P(0.42, 1.4, 62), P(2.58, 1.4, 62), P(2.58, 0.42, 31), P(0.42, 0.42, 31)], dk(roof, 0.18), { sw: 2 });
  s += box(P, 0.85, 0.85, 1.15, 1.15, 42, 76, '#a8705a', { sw: 1.8 }) + line(`M${pt(P(0.85, 1.15, 66))}L${pt(P(1.15, 1.15, 66))}l0 0M${pt(P(1.15, 1.15, 56))}L${pt(P(1.15, 0.85, 56))}`, '#7a4c3c', 1.1);
  s += box(P, 0.8, 0.8, 1.2, 1.2, 76, 79, '#8a8478', { sw: 1.6 });
  // Walls: the gable end on the right, the long side on the left.
  s += poly([P(2.45, 2.2, 0), P(2.45, 0.6, 0), P(2.45, 0.6, 34), P(2.45, 1.4, 61), P(2.45, 2.2, 34)], dk(wall, 0.24), { sw: 2 });
  s += poly(onL(P, 2.2, 0.55, 2.45, 0, 34), wall, { sw: 2 });
  s += poly(onL(P, 2.2, 0.55, 2.45, 0, 6), dk(wall, 0.12), { sw: 1.4 });
  // Front roof slope: shingle rows, a hole with broken rafters, moss.
  const RS = (p, k) => P(p, 1.4 + k * 1.02, 62 - k * 32);
  s += poly([RS(0.42, 0), RS(2.58, 0), RS(2.58, 1), RS(0.42, 1)], roof, { sw: 2 });
  for (const k of [0.25, 0.5, 0.75]) s += line(seg(RS(0.45, k), RS(2.55, k)), dk(roof, 0.2), 1.3);
  s += poly([RS(1.72, 0.28), RS(1.98, 0.22), RS(2.22, 0.38), RS(2.16, 0.62), RS(1.9, 0.7), RS(1.7, 0.55)], DARK, { sw: 1.6 });
  s += stick(seg(RS(1.8, 0.18), RS(1.86, 0.74)), BOARD_D, 2.2, 1.6) + stick(seg(RS(2.06, 0.2), RS(2.0, 0.6)), BOARD_D, 2.2, 1.6);
  s += ell(...RS(0.8, 0.82), 9, 3.5, '#7f9a46', { op: 0.75 }) + ell(...RS(1.3, 0.9), 6, 2.5, '#7f9a46', { op: 0.7 });
  s += line(seg(RS(0.42, 0), RS(2.58, 0)), '#7d5546', 2.6);
  // Fascia boards at the gable end.
  s += poly([P(2.58, 1.4, 62), P(2.58, 2.42, 30), P(2.58, 2.42, 26.5), P(2.58, 1.4, 58.5)], '#c7b48c', { sw: 1.6 });
  s += poly([P(2.58, 1.4, 62), P(2.58, 0.42, 31), P(2.58, 0.42, 27.5), P(2.58, 1.4, 58.5)], '#b3a07a', { sw: 1.6 });
  // Windows, the attic window, the door and a dangling shutter.
  s += boarded(P, 'L', 2.2, 0.72, 1.14, 12, 27);
  s += boarded(P, 'L', 2.2, 1.86, 2.28, 12, 27);
  s += poly([P(2.3, 2.2, 9), P(2.5, 2.2, 13), P(2.5, 2.2, 28), P(2.3, 2.2, 24)], '#7f9c9a', { sw: 1.5 });
  s += boarded(P, 'R', 2.45, 1.22, 1.58, 36, 46, { n: 1 });
  s += boarded(P, 'R', 2.45, 0.85, 1.35, 12, 26);
  s += poly(onL(P, 2.2, 1.3, 1.68, 0, 26), '#7d6650', { sw: 1.8 }) + stick(seg(P(1.27, 2.22, 4), P(1.71, 2.22, 22)), BOARD, 3.4, 2.2);
  // The porch step, one plank snapped.
  s += box(P, 1.2, 2.2, 1.78, 2.55, 0, 5, '#b89c72', { sw: 1.6 }) + poly(flat(P, 1.42, 2.25, 1.56, 2.52, 5), DARK, { op: 0.8 });
  s += crack([P(0.55, 2.2, 28), P(0.7, 2.2, 24), P(0.66, 2.2, 18)]);
  s += vine(P, 'R', 2.45, 2.0, 0, 30);
  // A signpost in the yard, its board hanging from one nail.
  const post = P(0.35, 2.78);
  s += stick(`M${pt(post)}L${f(post[0])} ${f(post[1] - 40)}`, WOOD_D, 3.4, 2.2);
  const bc = P(1.33, 2.78, 28);
  s += faceSign(bc[0], bc[1], 60, 18, name, { rot: 8, size: 12 });
  s += weeds(P, [[0.5, 2.9, 1.1], [2.62, 2.4], [2.75, 1.0, 1.1], [1.9, 2.55, 0.8]]);
  s += rubble(P, [[2.2, 2.75, 3]]);
  return s;
}

function stand(P, name) {
  const wall = '#b3ad8e';
  let s = shadowQ(P, 0.62, 0.75, 2.38, 2.4) + weeds(P, [[0.4, 0.8, 1], [2.1, 0.55, 0.8]]);
  // Crates of something long gone off, behind the kiosk's left end.
  s += box(P, 0.2, 1.55, 0.6, 1.95, 0, 12, WOOD, { sw: 1.6 }) + box(P, 0.25, 1.6, 0.55, 1.9, 12, 21, '#b8a070', { sw: 1.6 });
  s += ell(...P(0.4, 1.75, 21.5), 6, 2.4, '#8a7a3a', { sw: 1 });
  // The kiosk.
  s += box(P, 0.75, 0.9, 2.25, 2.2, 0, 30, wall);
  s += poly(onL(P, 2.2, 0.95, 2.05, 12, 25), DARK, { sw: 1.5 }) + stick(seg(P(0.9, 2.22, 15), P(2.1, 2.22, 22)), BOARD, 3.6, 2.2);
  s += box(P, 0.88, 2.2, 2.12, 2.42, 10, 12.5, BOARD, { sw: 1.4 });
  // A faded menu on the side, the side door nailed shut.
  s += poly(onR(P, 2.25, 1.0, 1.45, 10, 26), '#e2d6b4', { sw: 1.4 });
  for (const z of [14, 18, 22]) s += line(seg(P(2.25, 1.08, z), P(2.25, 1.37, z)), '#a99b7c', 1.2);
  s += poly(onR(P, 2.25, 1.6, 2.05, 0, 24), '#86705a', { sw: 1.6 }) + stick(seg(P(2.27, 1.55, 5), P(2.27, 2.1, 19)), BOARD, 3.2, 2);
  // The flat roof, and the propped serving flap with faded stripes.
  s += box(P, 0.62, 0.75, 2.38, 2.4, 30, 35, '#7fa19a', { sw: 1.8 });
  for (let k = 0; k < 5; k++) {
    const pa = 0.95 + k * 0.22;
    s += poly([P(pa, 2.2, 26.5), P(pa + 0.22, 2.2, 26.5), P(pa + 0.22, 2.58, 31 - (k === 3 ? 4 : 0)), P(pa, 2.58, 31 - (k === 3 ? 4 : 0))], k % 2 ? '#e6dcc2' : '#c98a6a', { sw: 1.3 });
  }
  s += stick(seg(P(1.0, 2.42, 12.5), P(1.0, 2.56, 30)), WOOD_D, 1.4, 1.6);
  // The big roadside sign on two poles, its dead bulbs.
  s += stick(seg(P(1.05, 1.55, 35), P(1.05, 1.55, 60)), '#8f969a', 2.6, 2) + stick(seg(P(1.95, 1.55, 35), P(1.95, 1.55, 54)), '#8f969a', 2.6, 2);
  const sc = P(1.5, 1.55, 70);
  s += faceSign(sc[0], sc[1], 92, 28, name, { rot: -6, size: 15, bulbs: true, bg: '#f0dfa8', peel: '#c9b27a' });
  // A patio umbrella out front, leaning, one panel torn off.
  s += umbrella(P(2.62, 2.6), 13);
  // A tipped stool.
  s += stick(seg(P(0.55, 2.65, 1), P(0.95, 2.72, 7)), '#b0b4b8', 1.6, 1.6) + ell(...P(1.0, 2.72, 8), 5, 3, '#c9584c', { sw: 1.4, tf: `rotate(-30 ${pt(P(1.0, 2.72, 8)).replace(' ', ' ')})` });
  s += vine(P, 'L', 2.2, 0.82, 0, 28);
  s += weeds(P, [[0.62, 2.35, 1.1], [1.6, 2.6, 0.8], [2.35, 2.25, 1], [2.5, 1.2, 0.9]]);
  s += rubble(P, [[2.1, 2.8, 3]]);
  return s;
}

function stage(P, name) {
  const plank = '#b59e78';
  let s = shadowQ(P, 0.3, 0.35, 2.7, 2.65, 0.25) + weeds(P, [[0.2, 1.4, 1.1], [1.6, 0.22, 0.9]]);
  // The platform: plank floor with a hole, steps at the front.
  s += box(P, 0.3, 0.35, 2.7, 2.65, 0, 12, plank, { top: '#c9b48e' });
  let fl = '';
  for (let k = 1; k < 8; k++) fl += seg(P(0.32, 0.35 + k * 0.29, 12), P(2.68, 0.35 + k * 0.29, 12));
  s += line(fl, dk(plank, 0.15), 1.1) + poly(flat(P, 1.85, 1.95, 2.25, 2.24, 12), DARK, { sw: 1.3 });
  s += box(P, 1.15, 2.65, 1.85, 2.9, 0, 6, '#a88f68', { sw: 1.5 });
  // The bandshell: a wall at the back with an arched top, curtain below, name across the arch.
  const n = 12;
  const arc = (q) => Array.from({ length: n + 1 }, (_, k) => P(0.3 + (2.4 * k) / n, q, 50 + 22 * Math.sin((Math.PI * k) / n)));
  s += poly(arc(0.55).concat(arc(0.35).reverse()), lt(WALL, 0.2), { sw: 1.8 });
  s += poly([P(2.7, 0.55, 12), P(2.7, 0.35, 12), P(2.7, 0.35, 50), P(2.7, 0.55, 50)], dk(WALL, 0.24), { sw: 1.8 });
  s += poly([P(0.3, 0.55, 12), P(2.7, 0.55, 12)].concat(arc(0.55).reverse()), WALL, { sw: 2 });
  s += line('M' + arc(0.55).slice(1, n).map((q) => pt([q[0], q[1] + 5])).join('L'), dk(WALL, 0.18), 3);
  const CQ = 0.56;
  const zb = [16, 14, 22, 15, 13, 26, 16, 14, 18, 15];
  let cd = '';
  for (let k = 0; k <= 9; k++) cd += (k ? 'L' : 'M') + pt(P(0.55 + (k * 1.9) / 9, CQ, zb[k]));
  cd += `L${pt(P(2.45, CQ, 46))}L${pt(P(0.55, CQ, 46))}Z`;
  s += path(cd, '#b46a62', { sw: 1.8 });
  let folds = '';
  for (let k = 1; k < 9; k++) folds += seg(P(0.55 + (k * 1.9) / 9, CQ, 44), P(0.55 + (k * 1.9) / 9, CQ, zb[k] + 2));
  s += line(folds, '#8f4d47', 1.3) + poly(onL(P, CQ, 0.5, 2.5, 44, 49), '#8f4d47', { sw: 1.5 });
  const sc = P(1.5, CQ, 58);
  s += faceSign(sc[0], sc[1], 76, 18, name, { rot: -5, size: 12, bg: '#f0e2b4' });
  // Speakers at both ends, a drum, a fallen mic stand, a dead spotlight.
  s += box(P, 2.24, 0.62, 2.64, 1.02, 12, 32, '#5f5c62', { sw: 1.8 }) + circ(...P(2.44, 1.02, 27), 3.6, '#3a373c', { sw: 1.3 }) + circ(...P(2.44, 1.02, 19), 5, '#3a373c', { sw: 1.3 });
  const dc = P(1.25, 1.45, 18);
  s += ell(dc[0], dc[1], 9, 6, '#d8584c', { sw: 1.8 }) + ell(dc[0] + 2, dc[1] - 0.5, 6, 4, '#efe6d6', { sw: 1.3 });
  s += stick(seg(P(1.6, 1.95, 12.5), P(2.35, 2.45, 13)), '#9aa0a6', 1.6, 1.6) + circ(...P(2.38, 2.47, 14), 2.6, '#4a464c', { sw: 1.2 });
  s += box(P, 0.36, 1.98, 0.76, 2.38, 12, 34, '#5f5c62', { sw: 1.8 }) + circ(...P(0.56, 2.38, 28), 3.6, '#3a373c', { sw: 1.3 }) + circ(...P(0.56, 2.38, 20), 5, '#3a373c', { sw: 1.3 });
  s += box(P, 2.3, 1.5, 2.56, 1.76, 12, 17, '#4a464c', { sw: 1.4 }) + ell(...P(2.28, 1.63, 16), 3, 4, '#d9cba6', { sw: 1.2 });
  // Torn bunting from the arch to the right speaker.
  const b0 = P(1.0, 0.56, 64);
  const b1 = P(2.4, 0.84, 30);
  s += line(`M${pt(b0)}Q${f((b0[0] + b1[0]) / 2)} ${f((b0[1] + b1[1]) / 2 + 12)} ${pt(b1)}`, O, 1.1);
  const bcol = ['#c98a6a', '#d9c27a', '#8fb0c9', '#b4a0c8'];
  let bt = '';
  for (let k = 0; k < 5; k++) {
    if (k === 2) continue;
    const t = (k + 0.5) / 5;
    const x = b0[0] + (b1[0] - b0[0]) * t;
    const y = b0[1] + (b1[1] - b0[1]) * t + 24 * t * (1 - t) - 1;
    bt += path(`M${f(x - 3)} ${f(y)}L${f(x + 3)} ${f(y + 1.5)}L${f(x - 0.5)} ${f(y + 7)}Z`, bcol[k % 4], { sw: 1 });
  }
  s += bt + vine(P, 'L', 0.55, 2.5, 12, 40, 0.1);
  s += weeds(P, [[0.4, 2.85, 1], [2.85, 2.3, 0.9], [2.85, 1.1, 1.1], [1.0, 2.88, 0.8], [2.4, 2.88, 0.9]]);
  return s;
}

function silo(P, name) {
  let s = shadowQ(P, 0.9, 0.3, 2.6, 2.0, 0.4) + weeds(P, [[0.6, 1.3, 1.1], [2.3, 0.2, 0.8], [1.2, 0.5, 0.9]]);
  // The silo: a corrugated cylinder, rust bands, a domed cap and a ladder.
  const [cx, cy] = P(1.85, 1.05);
  const rx = 0.74 * 45.25;
  const ry = 0.74 * 22.63;
  const Hs = 112;
  const ty = cy - Hs;
  const N = 10;
  for (let k = 0; k < N; k++) {
    const a0 = Math.PI - (k * Math.PI) / N;
    const a1 = Math.PI - ((k + 1) * Math.PI) / N;
    const x0 = cx + Math.cos(a0) * rx;
    const x1 = cx + Math.cos(a1) * rx;
    const y0 = Math.sin(a0) * ry;
    const y1 = Math.sin(a1) * ry;
    s += poly([[x0, ty + y0], [x1, ty + y1], [x1, cy + y1], [x0, cy + y0]], mix('#c3c1ab', '#7f7e72', k / (N - 1)));
  }
  for (let k = 1; k < N; k++) {
    const a = Math.PI - (k * Math.PI) / N;
    const x = cx + Math.cos(a) * rx;
    s += line(`M${f(x)} ${f(ty + Math.sin(a) * ry)}V${f(cy + Math.sin(a) * ry)}`, O, 0.8, { op: 0.25 });
  }
  const arc = (y) => `M${f(cx - rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(y)}`;
  for (const z of [26, 58, 90]) s += line(arc(cy - z), '#8a6a52', 2.4, { op: 0.8 });
  s += line(`M${f(cx + rx * 0.25)} ${f(cy - 58 + ry)}l-1 20M${f(cx - rx * 0.55)} ${f(cy - 90 + ry * 0.8)}l1 14`, '#b0663a', 1.6, { op: 0.6 });
  s += path(`M${f(cx - rx)} ${f(ty)}V${f(cy)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${f(cy)}V${f(ty)}`, 'none', { sw: 2.2 });
  // A rust hole.
  s += path(`M${f(cx + 6)} ${f(cy - 40)}l7 -3l3 6l-2 7l-7 1l-3 -6z`, '#5b3a2a', { sw: 1.3 });
  // The cap.
  s += path(`M${f(cx)} ${f(ty - 30)}Q${f(cx - rx * 0.62)} ${f(ty - 24)} ${f(cx - rx - 2)} ${f(ty)}A${f(rx + 2)} ${f(ry + 1)} 0 0 0 ${f(cx)} ${f(ty + ry + 1)}Z`, '#b3a28e');
  s += path(`M${f(cx)} ${f(ty - 30)}Q${f(cx + rx * 0.62)} ${f(ty - 24)} ${f(cx + rx + 2)} ${f(ty)}A${f(rx + 2)} ${f(ry + 1)} 0 0 1 ${f(cx)} ${f(ty + ry + 1)}Z`, '#8c7c6a');
  s += path(`M${f(cx - rx - 2)} ${f(ty)}Q${f(cx - rx * 0.62)} ${f(ty - 24)} ${f(cx)} ${f(ty - 30)}Q${f(cx + rx * 0.62)} ${f(ty - 24)} ${f(cx + rx + 2)} ${f(ty)}A${f(rx + 2)} ${f(ry + 1)} 0 0 1 ${f(cx - rx - 2)} ${f(ty)}Z`, 'none', { sw: 2.2 });
  s += line(`M${f(cx - rx * 0.5)} ${f(ty - 14)}Q${f(cx - rx * 0.3)} ${f(ty - 24)} ${f(cx - 4)} ${f(ty - 27)}`, '#ffffff', 2.4, { op: 0.35 });
  s += rect(cx - 4, ty - 37, 8, 8, '#9a8c7c', { sw: 1.6, rx: 1.5 });
  // The ladder, a few rungs missing.
  const lx = cx - rx * 0.55;
  const l0 = cy + ry * 0.8;
  s += line(`M${f(lx - 4)} ${f(l0)}V${f(ty + 10)}M${f(lx + 4)} ${f(l0 - 1)}V${f(ty + 9)}`, '#6e6a66', 1.8);
  let rungs = '';
  for (let y = l0 - 6, k = 0; y > ty + 12; y -= 8, k++) if (k !== 5 && k !== 6) rungs += `M${f(lx - 4)} ${f(y)}h8`;
  s += line(rungs, '#6e6a66', 1.5);
  // The shed with its sloped roof, a barn door, and the name board on top.
  s += box(P, 0.3, 1.55, 1.55, 2.7, 0, 28, WALL);
  s += poly(onL(P, 2.7, 0.5, 1.3, 0, 22), '#8a6f56', { sw: 1.8 });
  s += stick(seg(P(0.52, 2.72, 2), P(1.28, 2.72, 20)), BOARD, 3, 2) + stick(seg(P(0.52, 2.72, 20), P(1.28, 2.72, 2)), '#cfa76c', 3, 2);
  s += boarded(P, 'R', 1.55, 1.85, 2.3, 10, 22, { n: 1 });
  s += poly([P(0.22, 1.47, 36), P(1.63, 1.47, 36), P(1.63, 2.78, 27), P(0.22, 2.78, 27)], '#7b8885', { sw: 2 });
  s += poly([P(1.63, 1.47, 36), P(1.63, 2.78, 27), P(1.63, 2.78, 24), P(1.63, 1.47, 33)], dk('#7b8885', 0.25), { sw: 1.6 });
  s += poly(onL(P, 2.78, 0.22, 1.63, 24, 27), dk('#7b8885', 0.1), { sw: 1.6 });
  s += stick(seg(P(0.55, 2.4, 30), P(0.55, 2.4, 44)), WOOD_D, 2.2, 1.8) + stick(seg(P(1.3, 2.4, 30), P(1.3, 2.4, 40)), WOOD_D, 2.2, 1.8);
  const sc = P(0.95, 2.45, 46);
  s += faceSign(sc[0], sc[1], 66, 18, name, { rot: -7, size: 12 });
  // A pile of logs, front right.
  const log = (q, z, len = 0.75) => {
    const A = P(2.05, q, z);
    const B = P(2.05 + len, q, z);
    return stick(seg(A, B), '#8f6a48', 8.5, 2.2) + line(seg([A[0] + 1, A[1] - 3], [B[0] - 4, B[1] - 4.5]), '#a98260', 1.4) + ell(B[0], B[1], 4, 4.8, '#e2c58f', { sw: 1.6 }) + ell(B[0], B[1], 1.8, 2.2, 'none', { sw: 0.9, stroke: '#a98260' });
  };
  s += log(2.25, 4.5) + log(2.6, 4.5) + log(2.42, 12, 0.7);
  s += weeds(P, [[0.25, 2.85, 1], [1.7, 2.75, 0.9], [2.85, 0.6, 1]]);
  return s;
}

function garage(P, name) {
  let s = shadowQ(P, 0.25, 0.45, 2.75, 2.2, 0.25) + weeds(P, [[0.15, 1.2, 1.1], [2.0, 0.3, 0.9], [0.5, 0.35, 1]]);
  // The cracked apron with an oil stain.
  s += box(P, 0.15, 2.2, 2.85, 2.86, 0, 2, '#b3afa1', { sw: 1.4 });
  s += ell(...P(1.0, 2.55, 2), 10, 4, '#3b3430', { op: 0.3 }) + crack([P(1.6, 2.22, 2), P(1.7, 2.5, 2), P(1.62, 2.84, 2)]);
  // The building.
  s += box(P, 0.25, 0.45, 2.75, 2.2, 0, 38, WALL);
  s += poly(onL(P, 2.2, 0.25, 2.75, 34, 38), dk(WALL, 0.22), { sw: 1.4 }) + poly(onR(P, 2.75, 0.45, 2.2, 34, 38), dk(WALL, 0.4), { sw: 1.4 });
  s += poly(flat(P, 0.6, 0.8, 1.2, 1.3, 38), '#8f9080', { op: 0.8 }) + box(P, 1.6, 0.8, 2.1, 1.3, 38, 42, '#9aa6a8', { sw: 1.5, top: '#4a4f58' });
  s += line(seg(P(1.65, 0.85, 42), P(2.05, 1.25, 42)), '#c9d6da', 1.4);
  // Door 1, jammed half open: dark inside, a tyre peeking out.
  s += poly(onL(P, 2.2, 0.42, 1.38, 0, 29), dk(WALL, 0.3), { sw: 1.6 });
  s += poly(onL(P, 2.2, 0.48, 1.32, 0, 14), '#2f2a2e', { sw: 1.3 });
  s += ell(...P(0.75, 2.2, 5), 6.5, 6, RUBBER, { sw: 1.4 }) + ell(...P(0.75, 2.2, 5), 2.5, 2.4, '#8f969a');
  s += poly(onL(P, 2.2, 0.48, 1.32, 14, 28), '#c9c1a4', { sw: 1.5 });
  let corr = '';
  for (let z = 17; z < 28; z += 3) corr += seg(P(0.5, 2.2, z), P(1.3, 2.2, z));
  s += line(corr, '#9d957a', 1);
  for (let k = 0; k < 4; k++) s += poly(onL(P, 2.2, 0.5 + k * 0.2, 0.6 + k * 0.2, 14, 16.5), O, { op: 0.75 });
  s += poly(onL(P, 2.2, 0.48, 1.32, 14, 16.5), 'none', { sw: 1.2 });
  // Door 2, shut and dented, a plank across.
  s += poly(onL(P, 2.2, 1.6, 2.56, 0, 29), dk(WALL, 0.3), { sw: 1.6 }) + poly(onL(P, 2.2, 1.66, 2.5, 0, 28), '#bfb79a', { sw: 1.5 });
  corr = '';
  for (let z = 3; z < 28; z += 3) corr += seg(P(1.68, 2.2, z), P(2.48, 2.2, z));
  s += line(corr, '#958d72', 1);
  s += ell(...P(2.2, 2.2, 13), 6, 4, O, { op: 0.15 }) + stick(seg(P(1.6, 2.22, 6), P(2.56, 2.22, 18)), BOARD, 3.6, 2.2);
  // The side: a window, a stack of tyres, two oil drums.
  s += boarded(P, 'R', 2.75, 0.85, 1.55, 14, 28);
  s += vine(P, 'R', 2.75, 1.95, 0, 32);
  for (let k = 0; k < 3; k++) {
    const [x, y] = P(2.86, 0.62, k * 6.5);
    s += ell(x, y + 1, 9, 4.5, RUBBER, { sw: 1.5 }) + ell(x, y - 2, 9, 4.5, '#4d4550', { sw: 1.5 }) + ell(x, y - 2, 3.6, 1.7, '#1f1a20');
  }
  const drum = (p, q, c) => {
    const [x, y] = P(p, q);
    return path(`M${f(x - 7)} ${f(y - 18)}V${f(y)}A7 3.5 0 0 0 ${f(x + 7)} ${f(y)}V${f(y - 18)}Z`, c, { sw: 1.6 }) + line(`M${f(x - 7)} ${f(y - 6)}A7 3.5 0 0 0 ${f(x + 7)} ${f(y - 6)}M${f(x - 7)} ${f(y - 12)}A7 3.5 0 0 0 ${f(x + 7)} ${f(y - 12)}`, dk(c, 0.3), 1.2) + ell(x, y - 18, 7, 3.5, lt(c, 0.2), { sw: 1.6 }) + rect(x + 2.5, y - 16, 2.5, 14, '#ffffff', { op: 0.18 });
  };
  s += drum(2.62, 2.62, '#6f8fae') + drum(2.85, 2.42, '#b06a52');
  // The sign up on the roof edge.
  s += stick(seg(P(0.75, 2.1, 38), P(0.75, 2.1, 50)), WOOD_D, 2.2, 1.8) + stick(seg(P(2.25, 2.1, 38), P(2.25, 2.1, 46)), WOOD_D, 2.2, 1.8);
  const sc = P(1.5, 2.18, 52);
  s += faceSign(sc[0], sc[1], 86, 20, name, { rot: -3, size: 13, bg: '#e9dcae', ink: '#3f6a8a' });
  s += weeds(P, [[0.2, 2.5, 1], [2.85, 1.6, 0.9], [1.45, 2.88, 0.8]]);
  s += rubble(P, [[0.4, 2.75, 2]]);
  return s;
}

/** A patio umbrella standing at screen point (x, y), leaning by tilt degrees, one panel missing. */
function umbrella([x, y], tilt = 0) {
  const top = y - 34;
  const rx = 19;
  const ry = 8.5;
  let back = '';
  let front = '';
  for (let k = 0; k < 8; k++) {
    if (k === 6) continue;
    const a0 = (k * Math.PI) / 4;
    const a1 = ((k + 1) * Math.PI) / 4;
    const d = `M${f(x)} ${f(top - 7)}L${f(x + Math.cos(a0) * rx)} ${f(top + Math.sin(a0) * ry)}L${f(x + Math.cos(a1) * rx)} ${f(top + Math.sin(a1) * ry)}Z`;
    const el = path(d, k % 2 ? '#efe5cf' : '#d4796a', { sw: 1.5 });
    if (Math.sin((a0 + a1) / 2) < 0) back += el;
    else front += el;
  }
  const pole = stick(`M${f(x)} ${f(y)}V${f(top - 9)}`, '#b9b4a6', 1.8, 1.8);
  return ell(x + 4, y, 10, 4, O, { op: 0.12 }) + g(back + pole + front + circ(x, top - 8, 2, '#d4796a', { sw: 1.2 }), { tf: `rotate(${tilt} ${f(x)} ${f(y)})` });
}

const RUIN_ART = { shopfront, house, stand, stage, silo, garage };

/**
 * A ruined 3×3 building in a wild lot. archetype: shopfront | house | stand | stage |
 * silo | garage. name: the short text on its crooked sign (e.g. "DINER"); long names
 * squeeze to fit. Returns { svg, artH } (viewBox 192 × artH).
 */
export function ruinArt(archetype = 'house', { name } = {}) {
  const k = RUIN_ART[archetype] ? archetype : 'house';
  const H = RUIN_H[k];
  const P = iso(3, 3, H);
  const r = rng(hash(k));
  const label = String(name == null || name === '' ? RUIN_NAME[k] : name);
  const s = yard(P, r) + RUIN_ART[k](P, label, r);
  return { svg: `<svg ${ROOT} viewBox="0 0 192 ${H}" class="ruin ruin-${k}">${s}</svg>`, artH: H };
}

// --- Mystery heap -------------------------------------------------------------------------------

/** A 3×3 lumpy heap under a big purple tarp with a painted "?", tied down with rope. */
export function mysteryArt() {
  const H = 158;
  const B = H - 48; // y of the footprint's left/right corners
  let s = ell(100, B + 4, 92, 40, O, { op: 0.15 });
  // What pokes out from under the tarp (drawn first).
  s += stick(`M140 ${B - 70}L166 ${B - 106}`, '#b9bfc6', 4, 2.2) + stick(`M158 ${B - 98}L172 ${B - 96}`, '#b9bfc6', 3, 2);
  s += ell(22, B - 6, 12, 13, RUBBER, { sw: 2.2 }) + ell(22, B - 6, 5, 5.5, '#9aa0a6', { sw: 1.4 });
  s += box(iso(3, 3, H), 2.3, 0.9, 2.85, 1.45, 0, 20, '#d88a4a', { sw: 1.8 });
  // The tarp: a lumpy silhouette with a wavy hem.
  const top = [[8, B + 2], [10, B - 22], [22, B - 50], [44, B - 74], [62, B - 84], [80, B - 86], [96, B - 94], [118, B - 92], [138, B - 80], [158, B - 62], [176, B - 38], [186, B - 8]];
  let d = smooth(top, false);
  const hem = [[178, B + 14], [160, B + 26], [140, B + 36], [118, B + 42], [96, B + 44], [74, B + 41], [52, B + 34], [32, B + 24], [16, B + 12]];
  let prev = top[top.length - 1];
  for (const h of hem) {
    d += `Q${f((prev[0] + h[0]) / 2 + 2)} ${f((prev[1] + h[1]) / 2 + 5)} ${f(h[0])} ${f(h[1])}`;
    prev = h;
  }
  d += `Q${f((prev[0] + 8) / 2 + 2)} ${f((prev[1] + B + 2) / 2 + 4)} 8 ${B + 2}Z`;
  const base = '#8b62d6';
  s += path(d, base);
  // Shading (right side darker), a highlight, folds and a seam.
  s += path(`M118 ${B - 92}Q138 ${B - 80} 158 ${B - 62}Q176 ${B - 38} 186 ${B - 8}Q182 ${B + 12} 160 ${B + 26}Q140 ${B + 36} 118 ${B + 42}Q128 ${B} 120 ${B - 40}Q118 ${B - 70} 118 ${B - 92}Z`, '#6a45b3');
  s += path(`M28 ${B - 42}Q46 ${B - 72} 78 ${B - 80}Q60 ${B - 64} 40 ${B - 34}Z`, '#b596ef', { op: 0.75 });
  s += line(`M62 ${B - 80}Q70 ${B - 40} 64 ${B + 34}M138 ${B - 78}Q150 ${B - 30} 146 ${B + 30}M98 ${B - 92}Q92 ${B - 60} 98 ${B - 46}`, '#4c2f8a', 1.6, { op: 0.45 });
  s += path(d, 'none', { sw: 2.8 });
  // Grommets along the hem.
  for (const [x, y] of [[30, B + 21], [74, B + 38], [118, B + 39], [160, B + 23]]) s += circ(x, y, 2.2, '#d9dde2', { sw: 1.2 });
  // The big painted question mark.
  s += `<text x="96" y="${B + 6}" ${FONT} font-size="66" text-anchor="middle" fill="#ffd23f" stroke-width="3.4" paint-order="stroke" transform="rotate(-7 96 ${B - 18})">?</text>`;
  s += path(`M107 ${B + 6}q1 6 -1 10q-2 -4 1 -10z`, '#ffd23f', { sw: 1.2 });
  // Ropes over the top.
  for (const rd of [`M14 ${B - 6}Q70 ${B - 104} 150 ${B - 70}`, `M58 ${B + 34}Q120 ${B - 30} 176 ${B - 34}`]) s += line(rd, O, 4.4) + line(rd, '#e3c48c', 2.6) + line(rd, '#b8955a', 2.6, { dash: '2 4' });
  // Weights on the hem: a sandbag and a tyre.
  s += path(`M150 ${B + 30}q2 -9 14 -9q12 0 13 9q-1 6 -14 6q-12 0 -13 -6z`, '#c9b98c', { sw: 2 }) + line(`M156 ${B + 24}q8 3 16 0`, '#9a8a60', 1.2);
  s += ell(40, B + 30, 11, 5, RUBBER, { sw: 1.8 }) + ell(40, B + 27, 11, 5, '#4d4550', { sw: 1.8 }) + ell(40, B + 27, 4.4, 2, '#1f1a20');
  // Something glints.
  s += g(sparkle(150, B - 92, 6) + sparkle(34, B - 64, 4), { cls: 'mystery-sparkle' });
  return { svg: `<svg ${ROOT} viewBox="0 0 192 ${H}" class="mystery">${s}</svg>`, artH: H };
}

// --- Junk piles ---------------------------------------------------------------------------------

/** A 1×1 junk pile: 0 crates + a tyre, 1 planks + a hubcap, 2 a shopping cart + bags. Has a sparkle. */
export function junkArt(variant = 0) {
  const v = ((Math.round(variant) % 3) + 3) % 3;
  const H = 62;
  const P = iso(1, 1, H);
  let s = ell(33, H - 15, 25, 10, O, { op: 0.16 });
  if (v === 0) {
    s += box(P, 0.15, 0.25, 0.62, 0.72, 0, 15, WOOD, { sw: 1.7, top: WOOD_L });
    s += line(seg(P(0.15, 0.72, 7.5), P(0.62, 0.72, 7.5)) + seg(P(0.62, 0.72, 7.5), P(0.62, 0.25, 7.5)), WOOD_D, 1.2);
    s += box(P, 0.22, 0.32, 0.55, 0.62, 15, 26, '#3fb3a6', { sw: 1.7 });
    s += poly(onL(P, 0.62, 0.3, 0.46, 18, 23), '#ffd23f', { sw: 1 });
    const [x, y] = P(0.82, 0.66);
    s += ell(x, y - 1, 11, 5.4, RUBBER, { sw: 1.7 }) + ell(x, y - 4.5, 11, 5.4, '#4d4550', { sw: 1.7 }) + ell(x, y - 4.5, 4.6, 2.2, '#1f1a20') + line(`M${f(x - 8)} ${f(y - 6)}q3 -2.6 7 -3`, '#7a7280', 1.2);
  } else if (v === 1) {
    s += box(P, 0.1, 0.42, 0.9, 0.58, 0, 3.5, '#d9a86a', { sw: 1.5 });
    s += box(P, 0.36, 0.08, 0.52, 0.88, 3.5, 7, '#c48a52', { sw: 1.5 });
    s += box(P, 0.16, 0.3, 0.84, 0.44, 7, 10.5, '#e2b97c', { sw: 1.5 });
    s += stick(seg(P(0.25, 0.85, 1), P(0.62, 0.28, 22)), '#d4a066', 4.2, 2.2) + stick(seg(P(0.68, 0.72, 1), P(0.45, 0.3, 18)), '#b98247', 3.8, 2.2);
    s += circ(...P(0.6, 0.33, 19), 1, '#5b4636');
    const [x, y] = P(0.82, 0.78, 9);
    s += ell(x, y, 9, 9.5, '#c9ced6', { sw: 1.8 }) + ell(x, y, 6, 6.5, '#e9edf2', { sw: 1.1 }) + circ(x, y, 2.2, '#9aa3ad', { sw: 1 });
    for (let k = 0; k < 5; k++) {
      const an = (k * 2 * Math.PI) / 5;
      s += line(`M${f(x + Math.cos(an) * 2.6)} ${f(y + Math.sin(an) * 2.7)}L${f(x + Math.cos(an) * 5.6)} ${f(y + Math.sin(an) * 6)}`, '#9aa3ad', 1.1);
    }
    s += path(`M${f(x - 5)} ${f(y - 5)}q3 -3 7 -2.6`, 'none', { sw: 1.5, stroke: '#ffffff', cap: true });
  } else {
    // A tipped shopping cart, a bag in its basket and two more beside it, a box.
    const cart = (p0, q0, p1, q1, z0, z1) => {
      let c = poly(onR(P, p1, q0, q1, z0, z1), '#dfe4ea', { op: 0.35 }) + poly(onL(P, q1, p0, p1, z0, z1), '#dfe4ea', { op: 0.45 });
      let grid = '';
      for (let k = 1; k < 4; k++) grid += seg(P(p0 + ((p1 - p0) * k) / 4, q1, z0), P(p0 + ((p1 - p0) * k) / 4, q1, z1)) + seg(P(p1, q0 + ((q1 - q0) * k) / 4, z0), P(p1, q0 + ((q1 - q0) * k) / 4, z1));
      grid += seg(P(p0, q1, (z0 + z1) / 2), P(p1, q1, (z0 + z1) / 2)) + seg(P(p1, q1, (z0 + z1) / 2), P(p1, q0, (z0 + z1) / 2));
      c += line(grid, '#8f98a3', 1);
      c += path(`M${pt(P(p0, q0, z1))}L${pt(P(p1, q0, z1))}L${pt(P(p1, q1, z1))}L${pt(P(p0, q1, z1))}Z M${pt(P(p0, q1, z0))}L${pt(P(p1, q1, z0))}L${pt(P(p1, q0, z0))}`, 'none', { sw: 1.7, stroke: '#5f6873' });
      c += line(seg(P(p0, q1, z0), P(p0, q1, z1)) + seg(P(p1, q1, z0), P(p1, q1, z1)) + seg(P(p1, q0, z0), P(p1, q0, z1)), '#5f6873', 1.7);
      c += stick(seg(P(p0 - 0.08, q0, z1 + 2), P(p0 - 0.08, q1, z1 + 2)), '#e8483f', 2.2, 1.6);
      for (const [p, q] of [[p0 + 0.05, q1], [p1, q1], [p1, q0 + 0.05]]) c += line(seg(P(p, q, z0), P(p, q, 3)), '#5f6873', 1.4) + circ(...P(p, q, 2), 2.3, '#3a3a40', { sw: 1 });
      return c;
    };
    const bag = (x, y, c, k = 1) => path(`M${f(x - 7 * k)} ${f(y)}q-2 -10 2 -14q5 -2 10 0q4 4 2 14q-7 3 -14 0z`, c, { sw: 1.7 }) + path(`M${f(x - 3 * k)} ${f(y - 14 * k)}q1 -5 3 -1M${f(x + 1 * k)} ${f(y - 14 * k)}q2 -5 3 0`, 'none', { sw: 1.4 }) + path(`M${f(x - 4 * k)} ${f(y - 10 * k)}q1 -2 3 -2.5`, 'none', { sw: 1.2, stroke: '#ffffff', op: 0.8, cap: true });
    s += box(P, 0.62, 0.55, 0.92, 0.85, 0, 9, '#c9a06a', { sw: 1.5, top: '#e0bd86' }) + line(seg(P(0.77, 0.55, 9), P(0.77, 0.85, 9)), '#9a7444', 1.2);
    s += g(cart(0.12, 0.18, 0.62, 0.62, 9, 22) + bag(30, 28, '#f6f2ea'), { tf: `rotate(-9 32 ${H - 30})` });
    s += bag(14, H - 15, '#f4b6c9') + bag(48, H - 10, '#fff1a6', 0.9);
  }
  s += g(sparkle(52, 10, 6) + circ(43, 6, 1.6, '#fff6c8', { sw: 0.8 }), { cls: 'junk-sparkle' });
  return { svg: `<svg ${ROOT} viewBox="0 0 64 ${H}" class="junk junk-${v}">${s}</svg>`, artH: H };
}

// --- Scenery ------------------------------------------------------------------------------------

/** World point of tile (i, j) (fractional allowed), as iso.js tileToWorld. */
const W2 = (i, j) => [(i - j) * 32, (i + j) * 16];

/**
 * The land around the 35×35 map, one static SVG in WORLD px: the diamond spans
 * (0,0) (1120,560) (0,1120) (−1120,560). Pines and a radio hill behind, a smoky
 * skyline far off, a lake with a dock front-left, a jammed highway front-right,
 * grass and a dirt verge right under the map's edges. Quieter than the map.
 * Returns { svg, left, top, width, height } (the svg's world rect).
 */
export function sceneryBackdrop() {
  const L = -1800;
  const T = -560;
  const W = 3600;
  const H = 2160;
  const R = L + W;
  const B = T + H;
  const r = rng(20261107);
  const id = uid('sc');
  const GR = '#93ba67';
  let defs = '';
  let s = '';
  // Base grass (also under the map, so seams between lot images never show a hole).
  s += rect(L, T, W, H, GR);
  // Sky and the far skyline.
  defs += `<linearGradient id="${id}s" x1="0" y1="${T}" x2="0" y2="140" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a9d3e8"/><stop offset="1" stop-color="#dcece6"/></linearGradient>`;
  s += rect(L, T, W, 760, `url(#${id}s)`);
  // Smoke plumes rising from the city.
  const plume = (x, y0, h, k) => {
    const c = [];
    for (let i = 0; i < 7; i++) c.push([x + i * i * 2.4 * k, y0 - (i * h) / 7, (10 + i * 4) * k]);
    return c.map(([cx, cy, rr], i) => circ(cx, cy, rr, i % 2 ? '#a9adaf' : '#9da2a5', { op: 0.5 - i * 0.04 })).join('');
  };
  let city = '';
  let win = '';
  for (const [x0, x1, base, col] of [[L, -360, 96, '#b7c3cb'], [360, R, 96, '#b7c3cb'], [L + 60, -470, 108, '#a8b6c0'], [470, R - 40, 108, '#a8b6c0']]) {
    for (let x = x0; x < x1; ) {
      const w = 26 + Math.floor(r() * 46);
      const h = 34 + Math.floor(r() * 90) + (Math.abs(x) > 900 && Math.abs(x) < 1300 ? 30 : 0);
      city += `M${f(x)} ${base}V${f(base - h)}h${w}V${base}Z`;
      if (r() < 0.25) city += `M${f(x + w / 2 - 2)} ${f(base - h)}v-${12 + Math.floor(r() * 18)}h4V${f(base - h)}Z`;
      for (let k = 0; k < 2; k++) if (r() < 0.45) win += `M${Math.round(x + 5 + r() * (w - 10))} ${Math.round(base - h + 8 + r() * (h - 16))}h3v4h-3Z`;
      x += w + Math.floor(r() * 10);
    }
    s += path(city, col);
    city = '';
  }
  s += path(win, '#dfe7ea', { op: 0.7 });
  for (const [x, y, h, k] of [[-1420, 40, 300, 1.2], [-960, 20, 240, 1], [-620, 60, 200, 0.8], [880, 30, 260, 1.1], [1380, 50, 220, 0.9]]) s += plume(x, y, h, k);
  // Hills: a far range, the radio hill behind the map's top corner, its mast.
  s += path(smooth([[L - 50, 120], [-1500, 92], [-1200, 118], [-900, 96], [-620, 70], [-420, -20], [-200, -110], [60, -150], [300, -112], [520, -30], [760, 56], [1050, 96], [1400, 80], [R + 50, 112], [R + 50, 400], [L - 50, 400]]), '#a6c497');
  const mx = 70;
  const my = -146;
  let mast = `M${mx - 16} ${my}L${mx} ${my - 190}L${mx + 16} ${my}`;
  for (let k = 1; k < 9; k++) {
    const y = my - k * 21;
    const hw = 16 * (1 - (k * 21) / 190);
    const hw2 = 16 * (1 - ((k - 1) * 21) / 190);
    mast += `M${f(mx - hw)} ${f(y)}H${f(mx + hw)}M${f(mx - hw2)} ${f(y + 21)}L${f(mx + hw)} ${f(y)}`;
  }
  s += line(mast, '#76857d', 2.2) + line(`M${mx - 30} ${my - 120}H${mx + 30}M${mx - 22} ${my - 150}H${mx + 22}`, '#76857d', 1.6);
  s += circ(mx, my - 194, 4.5, '#e8584c', { sw: 1.2, stroke: '#8a4a44' }) + circ(mx, my - 194, 10, '#ff8a7a', { op: 0.3 });
  s += path(smooth([[L - 50, 210], [-1400, 170], [-1000, 196], [-700, 150], [-480, 70], [-260, 0], [0, -40], [260, -10], [480, 70], [720, 150], [1000, 190], [1400, 168], [R + 50, 200], [R + 50, 500], [L - 50, 500]]), '#98ba86');
  // The forest: a dark mass up to the hills, then pines in rows down to near the map's back edges.
  const backY = (x) => {
    if (x < -1120) return 610 - (-1120 - x) * 0.12;
    if (x > 1120) return 1216 - x / 2 - 70;
    return Math.abs(x) / 2 - 46;
  };
  const tipTop = (x) => 150 + Math.min(80, Math.max(-100, (Math.abs(x) - 650) * 0.25));
  let mass = `M${L - 50} ${backY(L) - 120}`;
  for (let x = L - 50; x <= R + 50; x += 40) mass += `L${f(x)} ${f(backY(Math.max(L, Math.min(R, x))) - 110)}`;
  for (let x = R + 50, k = 0; x >= L - 50; x -= 18, k++) mass += `L${f(x)} ${f(tipTop(x) + (k % 2 ? 0 : -14))}`;
  s += path(mass + 'Z', '#6d9562');
  // Pine symbols: near (full colour) and far (paler).
  const pine = (main, shade, ol) => {
    let p = rect(-2.6, -12, 5.2, 12, '#7a5a3e', { sw: 1.2, stroke: ol });
    for (const [y0, y1, w] of [[-50, -8, 21], [-66, -30, 16], [-82, -50, 11]]) {
      p += path(`M0 ${y0}L${-w} ${y1}Q0 ${y1 + 6} ${w} ${y1}Z`, main);
      p += path(`M0 ${y0}L${w} ${y1}Q${w * 0.5} ${y1 + 4.5} 0 ${y1 + 6}Z`, shade);
      p += path(`M0 ${y0}L${-w} ${y1}Q0 ${y1 + 6} ${w} ${y1}Z`, 'none', { sw: 1.6, stroke: ol });
    }
    return p;
  };
  defs += `<g id="${id}p">${pine('#6c9a5a', '#527c47', '#34492f')}</g><g id="${id}q">${pine('#7aa56a', '#5f8a54', '#3e573a')}</g><g id="${id}f">${pine('#86a982', '#6f9470', '#557458')}</g>`;
  // Four sizes of each, so a tree is just <use x y>.
  const SIZES = [0.62, 0.74, 0.86, 0.98];
  for (const kind of 'pqf') SIZES.forEach((k, n) => (defs += `<use id="${id}${kind}${n}" href="#${id}${kind}" transform="scale(${k})"/>`));
  const sizeOf = (k) => SIZES.reduce((best, z, n) => (Math.abs(z - k) < Math.abs(SIZES[best] - k) ? n : best), 0);
  const trees = [];
  for (let y = 120; y < 760; y += 26) {
    for (let x = L - 20 + ((y / 26) % 2) * 22; x < R + 20; x += 44) {
      const tx = x + (r() - 0.5) * 22;
      const ty = y + (r() - 0.5) * 12;
      const by = backY(tx);
      if (ty > by || ty < tipTop(tx) + 10) continue;
      const near = by - ty;
      if (near > 150 && r() < 0.45) continue;
      if (near < 40 && r() < 0.55) continue;
      const far = ty < 240;
      const k = (far ? 0.6 : 0.78) + r() * 0.3;
      trees.push([ty, tx, k, far ? 'f' : r() < 0.5 ? 'p' : 'q']);
    }
  }
  // A few loose pines out on the grass by the edges.
  for (let n = 0; n < 16; n++) {
    const x = (r() - 0.5) * 2 * 1100;
    const y = backY(x) + 10 + r() * 20;
    if (y < Math.abs(x) / 2 - 30) trees.push([y, x, 0.7 + r() * 0.2, 'q']);
  }
  trees.sort((a, b) => a[0] - b[0]);
  for (const [ty, tx, k, kind] of trees) s += `<use href="#${id}${kind}${sizeOf(k)}" x="${Math.round(tx)}" y="${Math.round(ty)}"/>`;
  // The verge right under the map's edges: dirt and scruffy grass.
  let rim = '';
  const rimPts = [];
  for (let k = 0; k < 4; k++) {
    const [ai, aj, bi, bj] = [[-0.9, -0.9, 35.9, -0.9], [35.9, -0.9, 35.9, 35.9], [35.9, 35.9, -0.9, 35.9], [-0.9, 35.9, -0.9, -0.9]][k];
    for (let t = 0; t < 1; t += 1 / 12) {
      const [x, y] = W2(ai + (bi - ai) * t, aj + (bj - aj) * t);
      rimPts.push([x + (r() - 0.5) * 10, y + (r() - 0.5) * 6]);
    }
  }
  rim = smooth(rimPts);
  s += path(rim, '#a9a774') + path(smooth(rimPts.map(([x, y]) => [x * 0.985, 560 + (y - 560) * 0.985])), '#b8a77c', { op: 0.6 });
  // The lake, front-left.
  const shore = [];
  for (let x = L - 60; x <= -170; x += 60) {
    const edge = x < -1120 ? 560 + (-1120 - x) * 0.14 : 1120 + x / 2;
    shore.push([x, edge + 70 + Math.sin(x / 83) * 12]);
  }
  const lake = shore.concat([[-150, 1150], [-150, 1240], [-210, 1350], [-320, 1460], [-430, 1560], [-500, B + 60], [L - 60, B + 60]]);
  const lakeD = smooth(lake);
  s += path(lakeD, '#d6c99a', { sw: 30, stroke: '#cdbf8e' }) + path(lakeD, '#7db6cb', { sw: 3, stroke: '#5f98ad' });
  s += path(smooth(lake.map(([x, y]) => [x - 40 + (x + 900) * 0.04, y + 70 + (y - 1100) * 0.06])), '#6fa9bf');
  let rip = '';
  for (let k = 0; k < 26; k++) {
    const x = -1700 + r() * 1350;
    const y = (x < -1120 ? 700 : 1120 + x / 2 + 130) + r() * 360;
    if (y > B - 20 || x > -230 - (y - 1100) * 0.5) continue;
    rip += `M${f(x)} ${f(y)}q8 -4 16 0`;
  }
  s += line(rip, '#cfe7ee', 2, { op: 0.75 });
  // Lily pads.
  for (const [x, y] of [[-760, 1060], [-748, 1068], [-1180, 860], [-260, 1250], [-1450, 820]]) s += path(`M${x} ${y}a8 4 0 1 0 6 -3.5l-6 3.5z`, '#7fae6a', { sw: 1, stroke: '#4f7a4a' });
  // The dock and a rowboat.
  const dockS = [-430, 984];
  const dv = [-32 * 4.6, 16 * 4.6];
  const du = [28, 14];
  const dP = (a, b2, z = 0) => [dockS[0] + du[0] * a + dv[0] * b2, dockS[1] + du[1] * a + dv[1] * b2 - z];
  for (const b2 of [0.25, 0.5, 0.75, 1]) for (const a of [0, 1]) s += stick(seg(dP(a, b2, 3), dP(a, b2, -10)), '#7d6046', 3, 1.6);
  s += poly([dP(1, 0, 5), dP(1, 1, 5), dP(1, 1, 1), dP(1, 0, 1)], '#8f6c4c', { sw: 1.4, stroke: '#4d3a2a' }) + poly([dP(0, 1, 5), dP(1, 1, 5), dP(1, 1, 1), dP(0, 1, 1)], '#b08a62', { sw: 1.4, stroke: '#4d3a2a' });
  s += poly([dP(0, 0, 5), dP(1, 0, 5), dP(1, 1, 5), dP(0, 1, 5)], '#c9a477', { sw: 1.4, stroke: '#4d3a2a' });
  let pl = '';
  for (let k = 1; k < 14; k++) pl += seg(dP(0, k / 14, 5), dP(1, k / 14, 5));
  s += line(pl, '#9a7a56', 1);
  const bt = dP(1.7, 0.95);
  s += path(`M${f(bt[0] - 26)} ${f(bt[1] - 10)}Q${f(bt[0] - 6)} ${f(bt[1] - 2)} ${f(bt[0] + 18)} ${f(bt[1] + 12)}Q${f(bt[0] + 2)} ${f(bt[1] + 16)} ${f(bt[0] - 22)} ${f(bt[1] + 2)}Z`, '#d9e0dc', { sw: 1.6, stroke: '#4d4a48' });
  s += path(`M${f(bt[0] - 20)} ${f(bt[1] - 6)}Q${f(bt[0] - 4)} ${f(bt[1] + 1)} ${f(bt[0] + 12)} ${f(bt[1] + 10)}Q${f(bt[0])} ${f(bt[1] + 10)} ${f(bt[0] - 16)} ${f(bt[1] + 1)}Z`, '#b9876a') + line(`M${f(bt[0] - 8)} ${f(bt[1] - 2)}l10 8`, '#8a6a4a', 2.4);
  s += line(`M${pt(dP(1, 0.92, 4))}Q${f(bt[0] - 18)} ${f(bt[1] - 18)} ${f(bt[0] - 22)} ${f(bt[1] - 8)}`, '#c9b58a', 1.2);
  // Two ducks.
  for (const [x, y] of [[-900, 1010], [-876, 1022]]) s += ell(x, y, 6, 3.5, '#f1ede2', { sw: 1.1, stroke: '#6f6a60' }) + circ(x + 4, y - 4, 2.6, '#f1ede2', { sw: 1.1, stroke: '#6f6a60' }) + path(`M${x + 6} ${y - 4.5}l3 1l-3 1z`, '#e9a94a');
  // Reeds along the shore.
  let reeds = '';
  let tops = '';
  for (let k = 0; k < 13; k++) {
    const sp = shore[3 + Math.floor(r() * (shore.length - 5))];
    const x0 = sp[0] + (r() - 0.5) * 40;
    const y0 = sp[1] + 4 + r() * 8;
    for (let n = 0; n < 5; n++) {
      const x = x0 + n * 4 - 8;
      const h = 14 + r() * 12;
      reeds += `M${f(x)} ${f(y0)}q${f((n - 2) * 1.2)} ${f(-h / 2)} ${f((n - 2) * 2)} ${f(-h)}`;
      if (n % 2) tops += `M${f(x + (n - 2) * 2)} ${f(y0 - h - 1)}v-5`;
    }
  }
  s += line(reeds, '#6f8f45', 1.5) + line(tops, '#8a5a36', 3.2);
  // The highway, front-right: along j at i = 38..42, curving off below the map.
  const cl = [];
  for (let j = -30; j <= 30; j += 3) cl.push([40, j, 0]);
  for (let a = 0; a <= 90; a += 10) {
    const rad = (a * Math.PI) / 180;
    cl.push([46 - 6 * Math.cos(rad), 30 + 6 * Math.sin(rad), rad]);
  }
  for (let i = 50; i <= 84; i += 4) cl.push([i, 36, Math.PI / 2]);
  // Offset o along the road's width (tile units): +i on the straight, radial on the curve, +j after.
  const offPt = (c, o) => W2(c[0] + Math.cos(c[2]) * o, c[1] - Math.sin(c[2]) * o);
  const band = (o0, o1) => {
    const a = cl.map((c) => offPt(c, o0));
    const b = cl.map((c) => offPt(c, o1)).reverse();
    return 'M' + a.concat(b).map(pt).join('L') + 'Z';
  };
  const lane = (o) => 'M' + cl.map((c) => pt(offPt(c, o))).join('L');
  s += path(band(-2.5, 2.6), '#aaa58c') + path(band(-2.05, 2.1), '#8a8884', { sw: 2, stroke: '#6f6d69' });
  s += line(lane(-1), '#e9e6dc', 2.2, { dash: '16 18', op: 0.8 }) + line(lane(1), '#e9e6dc', 2.2, { dash: '16 18', op: 0.8 });
  s += line(lane(0), '#5f5d5a', 7) + line(lane(0), '#c9c6bc', 4.4);
  // Guard rail on the map side.
  s += line(lane(-2.3), '#5f5d5a', 4) + line(lane(-2.3), '#c4c0b4', 2.2);
  // Cars, jammed nose to tail; a few wrecks.
  const car = (main, ol) => {
    const C = (p, q, z) => [(p - q) * 32, (p + q) * 16 - z];
    const b = (p0, q0, p1, q1, z0, z1, cL, cT) => {
      const Lf = [C(p0, q1, z0), C(p1, q1, z0), C(p1, q1, z1), C(p0, q1, z1)];
      const Rf = [C(p1, q1, z0), C(p1, q0, z0), C(p1, q0, z1), C(p1, q1, z1)];
      const Tf = [C(p0, q0, z1), C(p1, q0, z1), C(p1, q1, z1), C(p0, q1, z1)];
      return poly(Lf, cL, { sw: 1.3, stroke: ol }) + poly(Rf, cL, { sw: 1.3, stroke: ol }) + poly(Rf, '#000000', { op: 0.22 }) + poly(Tf, cT, { sw: 1.3, stroke: ol }) + poly(Tf, '#ffffff', { op: 0.22 });
    };
    let c = ell(4, 2, 30, 13, '#2a1b12', { op: 0.14 });
    for (const q of [-0.42, 0.42]) c += ell(...C(0.33, q, 3), 3.4, 4, '#2f2b30');
    c += b(-0.32, -0.7, 0.32, 0.7, 2.5, 11, main, main);
    c += b(-0.27, -0.36, 0.27, 0.3, 11, 19, '#cfdde2', main);
    c += poly([C(-0.27, 0.3, 11), C(0.27, 0.3, 11), C(0.27, 0.3, 13), C(-0.27, 0.3, 13)], main) + line(seg(C(0.27, -0.05, 11), C(0.27, -0.05, 19)), ol, 1.2);
    c += poly([C(-0.25, 0.7, 6), C(-0.1, 0.7, 6), C(-0.1, 0.7, 8.5), C(-0.25, 0.7, 8.5)], '#f3e6b0') + poly([C(0.1, 0.7, 6), C(0.25, 0.7, 6), C(0.25, 0.7, 8.5), C(0.1, 0.7, 8.5)], '#f3e6b0');
    return c;
  };
  defs += `<g id="${id}c">${car('currentColor', '#4f4a48')}</g>`;
  // Flipped and burnt wrecks.
  {
    const C = (p, q, z) => [(p - q) * 32, (p + q) * 16 - z];
    let fl = ell(4, 2, 30, 13, '#2a1b12', { op: 0.14 });
    fl += poly([C(-0.32, 0.7, 2), C(0.32, 0.7, 2), C(0.32, 0.7, 11), C(-0.32, 0.7, 11)], '#b9877a', { sw: 1.3, stroke: '#4f4a48' });
    fl += poly([C(0.32, 0.7, 2), C(0.32, -0.7, 2), C(0.32, -0.7, 11), C(0.32, 0.7, 11)], '#94695e', { sw: 1.3, stroke: '#4f4a48' });
    fl += poly([C(-0.32, -0.7, 11), C(0.32, -0.7, 11), C(0.32, 0.7, 11), C(-0.32, 0.7, 11)], '#5b5654', { sw: 1.3, stroke: '#4f4a48' });
    for (const [p, q] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) fl += ell(...C(p, q, 13), 4.6, 2.6, '#2f2b30', { sw: 1, stroke: '#1f1b20' });
    defs += `<g id="${id}x">${fl}</g>`;
    defs += `<g id="${id}b">${car('#6c6764', '#3f3a38')}${ell(-6, -14, 10, 5, '#2f2b2a', { op: 0.35 })}${ell(6, -12, 12, 6, '#2f2b2a', { op: 0.3 })}</g>`;
  }
  const CARC = ['#c97a6c', '#7a9cc4', '#d8c27a', '#93b38a', '#b7a9cf', '#e2ddd2', '#d79a6a', '#8fb6b8'];
  const cars = [];
  for (const li of [38.5, 39.5, 40.5, 41.5]) {
    for (let j = -14 + r() * 2; j < 32; j += 1.75 + r() * 1.6) {
      if (r() < 0.22) continue;
      const roll = r();
      const kind = roll < 0.06 ? 'x' : roll < 0.12 ? 'b' : 'c';
      const tilt = roll > 0.86 ? (r() - 0.5) * 30 : 0;
      cars.push([li + j, li, j, kind, tilt, CARC[Math.floor(r() * CARC.length)]]);
    }
  }
  cars.sort((a, b) => a[0] - b[0]);
  let smoke = '';
  for (const [, ci, cj, kind, tilt, col] of cars) {
    const [x, y] = W2(ci, cj);
    const at = tilt ? ` transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${Math.round(tilt)})"` : ` x="${Math.round(x)}" y="${Math.round(y)}"`;
    s += `<use href="#${id}${kind}"${at}${kind === 'c' ? ` color="${col}"` : ''}/>`;
    if (kind === 'b') smoke += plume(x - 4, y - 24, 90, 0.5);
  }
  s += smoke;
  // Cones by the wrecks.
  for (const [ci, cj] of [[37.7, 8], [37.7, 9.4], [42.4, 20], [37.7, 22]]) {
    const [x, y] = W2(ci, cj);
    s += path(`M${f(x - 4)} ${f(y)}h8l-3 -11h-2z`, '#e8915a', { sw: 1.2, stroke: '#6a4a3a' }) + rect(x - 2.6, y - 6, 5.2, 2, '#f3ece0');
  }
  // Bushes and rocks scattered on the grass around (low, so the map's front edges stay clean).
  const bush = (x, y, k) => path(`M${f(x - 12 * k)} ${f(y)}q-2 -9 6 -11q3 -7 11 -4q8 -2 9 6q5 3 0 9z`, '#7fa65e', { sw: 1.4, stroke: '#4f6e3e' }) + path(`M${f(x - 7 * k)} ${f(y - 9 * k)}q3 -4 8 -3`, 'none', { sw: 1.4, stroke: '#a3c47e', cap: true });
  for (const [x, y, k] of [[-120, 1200, 1], [-60, 1260, 0.8], [110, 1240, 0.9], [200, 1420, 1], [40, 1480, 1.1], [-40, 1560, 0.9], [700, 1150, 1], [900, 1060, 0.9], [1100, 980, 1], [1400, 870, 1.1], [1600, 760, 0.9], [560, 1300, 1], [800, 1400, 1.1], [1250, 1250, 1], [1500, 1150, 0.9]]) s += bush(x, y, k);
  for (const [x, y] of [[-1240, 620], [-180, 1300], [260, 1500], [1200, 1400], [650, 1480]]) s += ell(x, y, 9, 5, '#b3ad9c', { sw: 1.3, stroke: '#77705f' }) + ell(x - 2, y - 2, 4, 2, '#cfc9b8');
  // World-scale shapes need no sub-pixel precision.
  s = s.replace(/ (d|points)="([^"]*)"/g, (m, a, v) => ` ${a}="${v.replace(/-?\d*\.\d+/g, (n) => String(Math.round(+n)))}"`);
  return { svg: `<svg ${ROOT} viewBox="${L} ${T} ${W} ${H}" class="scenery"><defs>${defs}</defs>${s}</svg>`, left: L, top: T, width: W, height: H };
}
