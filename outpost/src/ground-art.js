// Last Stop: the ground under the town and the wild around it. Pure functions
// that return SVG strings (no DOM; importable in Node).
//
//   lotGroundSvg(a, b, opts)   one lot's 7×7 ground: owned grass with painted paths
//                              (joined across lots), or the scruffy olive wild with
//                              flat clutter and low baked wrecks; haze fades a far lot
//   bloomTiles(a, b)           the 49 owned-green diamonds the clear's bloom animates
//   ruinArt(archetype, opts)   a 3×3 ruined building with a crooked name sign
//   mysteryArt(opts)           a 3×3 heap under a tarp with a big painted "?"
//   junkArt(variant)           a 1×1 junk pile (3 variants) with a twinkling sparkle
//   sceneryBackdrop()          the static land around the 35×35 map, in world px
//   sceneryParts()             the same land cut into 4 smaller images (cheaper to raster)
//
// Iso conventions (iso.js): 2:1, one tile = 64 × 32. Object art is { svg, artH, bodyH }:
// the viewBox is (w + h) * 32 wide and artH tall, with the footprint's diamond at its
// bottom; bodyH is the main body's height above the footprint (for the hit hexagon).
// Light comes from the top-left: left faces are the base colour, right faces darker,
// tops lightest.
//
// Ids: object art (ruins, mystery, junk) uses none, so one cached string can sit on the
// page many times. Lot grounds and the scenery name theirs after a hash of their own
// content: the same output always has the same ids, different outputs never share one.
// Junk and the heap embed a tiny <style> for their sparkle's twinkle (map objects are
// <img>s, which page CSS cannot reach); hooks: .junk-sparkle, .mystery-sparkle.

import { LOT, LOTS_ACROSS } from './config.js';

const MAPN = LOT * LOTS_ACROSS;

// --- Palette and tiny helpers ------------------------------------------------------------------

const O = '#2a1b12';
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';
/** Root presentation defaults: no fill, no stroke width; elements name what they use. */
const ROOT = `${XMLNS} overflow="visible" fill="none" stroke="${O}" stroke-width="0" stroke-linejoin="round" stroke-linecap="round"`;
const FONT = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="900"';

/** Owned grass (soft checker by global tile parity) and the wild olive. */
const GRASS = ['#80d24f', '#76c847'];
const WILD = '#a3a55f';
/** What far things fade toward (haze lots, faded ruins). */
const FOG = '#e4e8d3';
const HAZE_K = 0.42;
const FADE_K = 0.36;

const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const RUBBER = '#3d3540';
const TYRE = '#4d4550';
const BOARD = '#d6b27a';
const BOARD2 = '#cfa76c';
const DARK = '#3b3438';
const CONC = '#bbb4a0';
const WEED = '#80993f';
const WEED_L = '#a9c45c';

/** Half-pixel rounding keeps strings short (and turns -0 into 0); ruins use whole pixels. */
let GRID = 2;
const N = (v) => {
  const r = Math.round(v * GRID) / GRID;
  return r === 0 ? 0 : r;
};
const pt = (a) => `${N(a[0])} ${N(a[1])}`;

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
/** Every #rrggbb in an svg string pulled toward the fog: far things, still opaque. */
const fade = (svg, k) => svg.replace(/#[0-9a-fA-F]{6}\b/g, (c) => mix(c, FOG, k));

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
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const int = (v, d = 0) => (Number.isFinite(+v) ? Math.trunc(+v) : d);
/** Ids named after the content's hash: replace the placeholder once the svg is built. */
const ID = '@@';
const withIds = (svg, p) => svg.split(ID).join(`${p}${hash(svg).toString(36)}`);

function at(o) {
  if (!o) return '';
  let s = '';
  if (o.sw != null) s += `${o.stroke && o.stroke !== O ? ` stroke="${o.stroke}"` : ''} stroke-width="${o.sw}"`;
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  return s;
}
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${N(x)}" y="${N(y)}" width="${N(w)}" height="${N(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${at(o)}/>`;
const path = (d, fill, o) => `<path d="${d}" fill="${fill}"${at(o)}/>`;
const circ = (cx, cy, r, fill, o) => `<circle cx="${N(cx)}" cy="${N(cy)}" r="${N(r)}" fill="${fill}"${at(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o) => `<ellipse cx="${N(cx)}" cy="${N(cy)}" rx="${N(rx)}" ry="${N(ry)}" fill="${fill}"${at(o)}/>`;
const line = (d, color, w, o = {}) => `<path d="${d}"${color !== O ? ` stroke="${color}"` : ''} stroke-width="${w}"${o.butt ? ' stroke-linecap="butt"' : ''}${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
const g = (inner, o = {}) => `<g${at(o)}>${inner}</g>`;
/** An outlined stroke: a fat dark line under a coloured one. */
const stick = (d, color, w, ow = 2.2) => line(d, O, w + ow) + line(d, color, w);
const poly = (a, fill, o) => `<path d="M${a.map(pt).join('L')}Z" fill="${fill}"${at(o)}/>`;
const seg = (a, b) => `M${pt(a)}L${pt(b)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Many ellipses as one path. */
const epath = (list) => list.map(([x, y, rx, ry]) => `M${N(x - rx)} ${N(y)}a${N(rx)} ${N(ry)} 0 1 0 ${N(2 * rx)} 0a${N(rx)} ${N(ry)} 0 1 0 ${N(-2 * rx)} 0`).join('');

function sparkleD(cx, cy, r) {
  const k = r * 0.2;
  return `M${N(cx)} ${N(cy - r)}Q${N(cx + k)} ${N(cy - k)} ${N(cx + r)} ${N(cy)}Q${N(cx + k)} ${N(cy + k)} ${N(cx)} ${N(cy + r)}Q${N(cx - k)} ${N(cy + k)} ${N(cx - r)} ${N(cy)}Q${N(cx - k)} ${N(cy - k)} ${N(cx)} ${N(cy - r)}Z`;
}

/** Smooth path through points (Catmull-Rom). */
function smooth(pts, closed = true, r = N) {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    d += `C${r(p1[0] + (p2[0] - p0[0]) / 6)} ${r(p1[1] + (p2[1] - p0[1]) / 6)} ${r(p2[0] - (p3[0] - p1[0]) / 6)} ${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])} ${r(p2[1])}`;
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

/** A plank nailed across a face: from a0 to a1 along it, centred at height zc, one end tilted. */
function plank(Q, a0, a1, zc, tilt, c = BOARD, w = 2.4) {
  return poly([Q(a0, zc - tilt - w), Q(a1, zc + tilt - w), Q(a1, zc + tilt + w), Q(a0, zc - tilt + w)], c, { sw: 1.5 });
}

/** A boarded-up window on a face ('L' plane q = k, or 'R' plane p = k), a0..a1 along it, z0..z1 high. */
function boarded(P, face, k, a0, a1, z0, z1, o = {}) {
  const Q = face === 'L' ? (a, z) => P(a, k, z) : (a, z) => P(k, a, z);
  const fr = 0.06;
  let s = poly([Q(a0 - fr, z0 - 2), Q(a1 + fr, z0 - 2), Q(a1 + fr, z1 + 2), Q(a0 - fr, z1 + 2)], o.frame || '#c9bf9e', { sw: 1.6 });
  s += poly([Q(a0, z0), Q(a1, z0), Q(a1, z1), Q(a0, z1)], DARK);
  s += poly([Q(a0, z1), Q(a0 + (a1 - a0) * 0.35, z1), Q(a0, z1 - (z1 - z0) * 0.55)], '#6c6670');
  const n = o.n ?? 2;
  for (let i = 0; i < n; i++) s += plank(Q, a0 - 0.1, a1 + 0.1, z0 + ((i + 0.5) / n) * (z1 - z0), (i % 2 ? 1 : -1) * Math.min(5, (z1 - z0) * 0.16), i % 2 ? BOARD : BOARD2);
  return s;
}

const TUFT_BIG = [[-6, 0], [-9, -9], [-4, -5], [-3, -15], [0, -6], [2, -13], [3.5, -5], [8, -10], [6, 0]];
const TUFT = [[-5, 0], [-7, -8], [-3, -4], [-2, -12], [0.5, -4], [3, -10], [3.5, -3], [7, -7], [5, 0]];
const tuftD = (x, y, k, shape = TUFT_BIG) => 'M' + shape.map(([a, b]) => `${N(x + a * k)} ${N(y + b * k)}`).join('L') + 'Z';
/** Weed tufts standing at ground points [p, q, scale]. */
function weeds(P, list) {
  let d = '';
  let hl = '';
  for (const [p, q, k = 1] of list) {
    const [x, y] = P(p, q);
    d += tuftD(x, y, k);
    hl += `M${N(x - 2.5 * k)} ${N(y - 1)}L${N(x - 3 * k)} ${N(y - 10 * k)}`;
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
    leaves += `M${N(x)} ${N(y)}l${3 * d} -3l${3 * d} 1.5l${-2.5 * d} 3z`;
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
  const fit = est > maxW ? ` textLength="${N(maxW)}" lengthAdjust="spacingAndGlyphs"` : '';
  const ink = o.ink || '#b3463b';
  let s = rect(-w / 2, -h / 2, w, h, o.bg || '#eee2bf', { sw: 2.2, rx: 2.5 });
  // Weathering: a peeled corner and a darker bottom band.
  s += path(`M${N(w / 2 - 12)} ${N(-h / 2)}H${N(w / 2)}V${N(-h / 2 + 8)}Z`, o.peel || '#b9ab86', { op: 0.9 });
  s += rect(-w / 2 + 1.5, h / 2 - 4, w - 3, 2.5, O, { op: 0.08 });
  if (o.bulbs) {
    // Dead marquee bulbs along the top and bottom edges (a few missing).
    let d = '';
    for (let x = -w / 2 + 6, k = 0; x <= w / 2 - 5; x += 9, k++) {
      if (k !== 3) d += `M${N(x)} ${N(-h / 2 - 0.5)}h.01`;
      if (k % 4 !== 1) d += `M${N(x + 4)} ${N(h / 2 + 0.5)}h.01`;
    }
    s += line(d, O, 5.2) + line(d, '#e2d8b8', 3);
  }
  s += `<text x="0" y="${N(fs * 0.36)}" ${FONT} font-size="${N(fs)}" text-anchor="middle" fill="${ink}"${fit}>${esc(t)}</text>`;
  s += circ(-w / 2 + 4, -h / 2 + 4, 1.1, '#5b4636') + circ(w / 2 - 4, h / 2 - 4, 1.1, '#5b4636');
  return g(s, { tf: `translate(${N(cx)} ${N(cy)}) rotate(${o.rot ?? -5}) skewY(${sk})` });
}

/** A few chunks of rubble and stray bricks around ground points [p, q, n]. */
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

/** A tyre lying flat at screen point (x, y) (its bottom), rx wide. */
const tyreFlat = (x, y, rx = 10, hole = WILD) => ell(x, y - 2, rx, rx / 2, RUBBER, { sw: 1.4 }) + ell(x, y - 4.5, rx, rx / 2, TYRE, { sw: 1.4 }) + ell(x, y - 4.5, rx * 0.44, rx * 0.21, hole, { sw: 1.1 });

// --- Lot ground ---------------------------------------------------------------------------------

const LOT_D = 'M224 0L448 112L224 224L0 112Z';
/** Lot-local point of tile coords (p along i, q along j), z px up. */
const LP = (p, q, z = 0) => [(p - q) * 32 + 224, (p + q) * 16 - z];
const tileD = (u, v) => `M${(u - v) * 32 + 224} ${(u + v) * 16}l32 16l-32 16l-32 -16z`;
const DIR4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** The lot diamond grown by `e` px across each edge (a clip that lets edges overdraw a hair). */
const lotGrown = (e) => {
  const v = e * 1.118; // vertical growth of a 2:1 edge moved e px out
  return `M224 ${N(-v)}L${N(448 + 2 * v)} 112L224 ${N(224 + v)}L${N(-2 * v)} 112Z`;
};

/**
 * One lot's ground, viewBox 0 0 448 224: local tile (u, v) has its top corner at
 * ((u − v)·32 + 224, (u + v)·16). owned: two greens in a soft checker, a few
 * flowers, and painted paths that join toward path neighbours (pathAt takes
 * GLOBAL tile coords and may look into neighbouring lots). Otherwise the wild:
 * scruffy olive with tall-grass tufts, flat clutter and low baked wrecks (on the
 * front tiles, clear of the ruin, the zombies' fence lines and the back edges),
 * all picked by seed. haze: the whole lot fades toward a pale fog (still opaque).
 */
export function lotGroundSvg(a, b, opts) {
  const { owned = false, haze = false, pathAt = null, seed } = opts || {};
  a = int(a);
  b = int(b);
  const r = rng(seed == null || !Number.isFinite(+seed) ? a * 31 + b * 7 + 1 : +seed);
  const i0 = a * LOT;
  const j0 = b * LOT;
  const par = (((i0 + j0) % 2) + 2) % 2;
  let s;
  if (owned) {
    const [A, B] = GRASS;
    let d = '';
    for (let u = 0; u < LOT; u++) for (let v = 0; v < LOT; v++) if ((u + v + par) % 2) d += tileD(u, v);
    // A hair of overdraw (same colour) hides the seams between neighbouring lot images.
    s = `<path d="${LOT_D}" fill="${A}" stroke="${A}" stroke-width="1.4"/><path d="${d}" fill="${B}" stroke="${B}" stroke-width="1.4"/>`;
    const at = (i, j) => {
      if (typeof pathAt !== 'function' || i < 0 || j < 0 || i >= MAPN || j >= MAPN) return null;
      const t = pathAt(i, j);
      return PATH_TYPES.has(t) ? t : null;
    };
    s += ownedDressing(r, (u, v) => at(i0 + u, j0 + v));
    s += pathsSvg(i0, j0, at, r);
  } else {
    s = `<path d="${LOT_D}" fill="${WILD}" stroke="${WILD}" stroke-width="1.4"/>` + wildDressing(r);
  }
  let out = `<svg ${ROOT} viewBox="0 0 448 224">${s}</svg>`;
  if (haze && !owned) out = fade(out, HAZE_K);
  return withIds(out, 'lg');
}

/**
 * The bloom overlay: 49 separate owned-green diamonds (same viewBox as the ground),
 * each <polygon class="bloom" style="--d:N"> with N = |u − 3| + |v − 3| (0..6), the
 * tile's distance from the lot centre, for a CSS animation-delay.
 */
export function bloomTiles(a, b) {
  const par = (((int(a) * LOT + int(b) * LOT) % 2) + 2) % 2;
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
    if (k < 14) blades += `M${N(x - 3)} ${N(y)}l1.5 -4M${N(x)} ${N(y + 0.5)}l0 -5M${N(x + 3)} ${N(y)}l-1.5 -4`;
    else fl += circ(x, y, 2.2, FLOWERS[k % 4], { sw: 0.8 }) + circ(x, y, 0.8, k % 4 === 1 ? '#ff9a3c' : '#ffc23a');
  }
  return (blades ? line(blades, '#5aa83a', 1.3) : '') + fl;
}

// The wild. Tiles: the ruin stands on 2..4 × 2..4; wild zombies walk the lines u = 1.6
// and v = 1.6 (just in front of a fence); fence objects run along u = 0 and v = 0. Low
// wrecks therefore only go on the front band (u or v ≥ 5, the other ≥ 3), where nothing
// standing can be behind them; flat decals go anywhere off the ruin.
const FRONT_TILES = [[5, 3], [5, 4], [5, 5], [5, 6], [6, 3], [6, 4], [6, 5], [6, 6], [3, 5], [4, 5], [3, 6], [4, 6]];

const DECALS = {
  oil(u, v, r) {
    const [x, y] = LP(u + 0.5, v + 0.5);
    const k = 0.8 + r() * 0.4;
    return path(epath([[x, y, 13 * k, 6 * k], [x - 10 * k, y + 4, 4.5, 2.1]]), '#3b3430', { op: 0.28 }) + ell(x + 3, y - 1, 6 * k, 2.4 * k, '#8f7fc0', { op: 0.22 });
  },
  tarmac(u, v, r) {
    // A cracked slab of old road: a ragged outline, a seeded crack or two, no holes.
    const pts = [];
    const n = 6 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const an = (k / n) * Math.PI * 2 + r() * 0.4;
      const rr = 0.3 + r() * 0.14;
      pts.push(LP(u + 0.5 + Math.cos(an) * rr, v + 0.5 + Math.sin(an) * rr));
    }
    let s = poly(pts, '#8f8c82', { sw: 1.2, stroke: '#6c695f' });
    const c0 = LP(u + 0.25 + r() * 0.2, v + 0.3 + r() * 0.4);
    const c1 = LP(u + 0.5, v + 0.45 + r() * 0.15);
    const c2 = LP(u + 0.72 + r() * 0.1, v + 0.3 + r() * 0.3);
    s += crack([c0, c1, c2]) + (r() < 0.5 ? crack([c1, LP(u + 0.45 + r() * 0.2, v + 0.75)]) : '');
    return s + line(seg(LP(u + 0.3, v + 0.35), LP(u + 0.6, v + 0.3)), '#a9a69b', 1.6);
  },
  leaves(u, v, r) {
    let s = '';
    const cols = ['#d98a3a', '#c9a33a', '#b0652e', '#bdb348'];
    for (let k = 0; k < 6; k++) {
      const [x, y] = LP(u + 0.15 + r() * 0.7, v + 0.15 + r() * 0.7);
      s += ell(x, y, 2.9, 1.4, cols[k % 4], { sw: 0.6, tf: `rotate(${Math.round(r() * 180)} ${N(x)} ${N(y)})` });
    }
    return s;
  },
  sign(u, v) {
    // A fallen STOP sign lying flat, its post beside it.
    const c = [u + 0.42, v + 0.5];
    const oct = [];
    for (let k = 0; k < 8; k++) {
      const an = ((k * 45 + 22.5) * Math.PI) / 180;
      oct.push(LP(c[0] + Math.cos(an) * 0.3, c[1] + Math.sin(an) * 0.3));
    }
    const [x0, y0] = LP(u, v);
    let s = stick(seg(LP(u + 0.7, v + 0.52), LP(u + 1.0, v + 0.58)), '#a7adb2', 2.4, 1.6);
    s += poly(oct, '#c95a4c', { sw: 1.3 });
    s += `<text transform="matrix(.32 .16 -.32 .16 ${x0} ${y0})" x="42" y="57" ${FONT} font-size="17" text-anchor="middle" fill="#f6eee2">STOP</text>`;
    return s;
  },
  marks(u, v) {
    const tr = (dq) => `M${pt(LP(u, v + 0.25 + dq))}Q${pt(LP(u + 1, v + 0.05 + dq))} ${pt(LP(u + 2, v + 0.55 + dq))}`;
    return line(tr(0) + tr(0.3), '#4a4038', 4, { op: 0.16 });
  },
  rubble(u, v, r) {
    const list = [];
    for (let k = 0; k < 5; k++) {
      const [x, y] = LP(u + 0.2 + r() * 0.6, v + 0.2 + r() * 0.6);
      list.push([x, y, 2.4 + r() * 1.6, 1.5 + r()]);
    }
    return path(epath(list.slice(0, 3)), '#a19c90', { sw: 0.9 }) + path(epath(list.slice(3)), '#b8b2a2', { sw: 0.9 });
  },
  puddle(u, v, r) {
    const [x, y] = LP(u + 0.5, v + 0.5);
    const k = 0.8 + r() * 0.4;
    return path(`M${N(x - 14 * k)} ${N(y)}q2 -6 12 -6q6 -3 13 1q6 3 1 7q-4 4 -14 3q-11 1 -12 -5z`, '#8fb0b8', { sw: 1.2, stroke: '#6f8a86' }) + line(`M${N(x - 6)} ${N(y - 2)}q4 -2 9 -1.5`, '#d6e6e6', 1.5);
  },
  manhole(u, v) {
    const [x, y] = LP(u + 0.5, v + 0.5);
    return ell(x, y, 11, 5.5, '#77736a', { sw: 1.4 }) + line(`M${x - 7} ${y - 1.5}h14M${x - 8} ${y + 1.5}h16`, '#5c5850', 1.2);
  },
};
/** How often each decal comes up (weights); the fallen sign is a rare treat. */
const DECAL_W = { oil: 3, tarmac: 1.6, leaves: 3, rubble: 3, marks: 2, puddle: 2, manhole: 1, sign: 0.3 };
const WRECK_PAINT = ['#c97a6c', '#7a9cc4', '#d8c27a', '#93b38a', '#b7a9cf', '#e2ddd2', '#d79a6a', '#8fb6b8'];

/** Low wrecks baked into the wild (≤ 17 px tall), drawn with lot-local iso points. */
const WRECKS = {
  /** A rusty car on flat tyres: 2 tiles along p (from (u, v)) or along q. */
  car(u, v, r, alongP) {
    const P = LP;
    const paint = mix(pick(r, WRECK_PAINT), '#9c9b7c', 0.35);
    const [p0, q0, p1, q1] = alongP ? [u + 0.25, v + 0.16, u + 1.72, v + 0.84] : [u + 0.16, v + 0.25, u + 0.84, v + 1.72];
    let s = poly(flat(P, p0, q0, p1 + 0.2, q1 + 0.12), O, { op: 0.15 });
    // Body, then the cabin set back from the bonnet.
    s += box(P, p0, q0, p1, q1, 2, 9, paint, { sw: 1.5 });
    const [c0, c1, d0, d1] = alongP ? [p0 + 0.42, q0 + 0.06, p1 - 0.5, q1 - 0.06] : [p0 + 0.06, q0 + 0.42, p1 - 0.06, q1 - 0.5];
    s += box(P, c0, c1, d0, d1, 9, 15, paint, { sw: 1.5, top: lt(paint, 0.12) });
    // Windows: dark, the windscreen smashed.
    if (alongP) {
      s += poly(onL(P, d1, c0 + 0.07, d0 - 0.07, 10, 14), '#4a4650') + poly(onR(P, d0, c1 + 0.08, d1 - 0.08, 10, 14), '#5a5660');
      s += line(`M${pt(P(d0, (c1 + d1) / 2, 12))}l-3 -1.5m3 1.5l2 -2.5m-2 2.5l3 0.5`, '#cfd6da', 1);
    } else {
      s += poly(onR(P, d0, c1 + 0.07, d1 - 0.07, 10, 14), '#4a4650') + poly(onL(P, d1, c0 + 0.08, d0 - 0.08, 10, 14), '#5a5660');
      s += line(`M${pt(P((c0 + d0) / 2, d1, 12))}l-3 1.5m3 -1.5l2 -2.5m-2 2.5l3 -0.5`, '#cfd6da', 1);
    }
    // Rust, flat tyres on the near side, a weed through the bonnet.
    const rp = alongP ? P(p0 + 0.3, q1, 6) : P(p1, q0 + 0.3, 6);
    s += ell(rp[0], rp[1], 4.5, 2.4, '#a8673e', { op: 0.75 });
    const wheels = alongP ? [P(p0 + 0.28, q1, 2), P(p1 - 0.28, q1, 2)] : [P(p1, q0 + 0.28, 2), P(p1, q1 - 0.28, 2)];
    s += path(epath(wheels.map(([x, y]) => [x, y + 1, 4.8, 3.2])), RUBBER, { sw: 1.3 });
    const wp = alongP ? P(p1 - 0.2, (q0 + q1) / 2, 9) : P((p0 + p1) / 2, q1 - 0.2, 9);
    s += path(tuftD(wp[0], wp[1], 0.5, TUFT), '#8c9b46', { sw: 0.9 });
    return s;
  },
  tyres(u, v, r) {
    const [x, y] = LP(u + 0.5, v + 0.55);
    let s = ell(x + 3, y + 1, 15, 6, O, { op: 0.13 }) + tyreFlat(x - 2, y, 10) + tyreFlat(x - 1, y - 5.5, 9.5);
    if (r() < 0.6) s += tyreFlat(x + 13, y + 6, 8.5);
    // One leaning on the pile.
    return s + ell(x - 13, y - 3, 4, 8, RUBBER, { sw: 1.4, tf: `rotate(-14 ${N(x - 13)} ${N(y - 3)})` }) + ell(x - 13, y - 3, 1.6, 3.6, WILD, { tf: `rotate(-14 ${N(x - 13)} ${N(y - 3)})` });
  },
  crates(u, v, r) {
    const P = LP;
    const p = u + 0.18;
    const q = v + 0.2;
    let s = poly(flat(P, p, q, p + 0.75, q + 0.6), O, { op: 0.13 });
    s += box(P, p, q, p + 0.38, q + 0.38, 0, 11, mix(WOOD, '#9c9b7c', 0.3), { sw: 1.4 });
    s += line(seg(P(p, q + 0.38, 5.5), P(p + 0.38, q + 0.38, 5.5)) + seg(P(p + 0.38, q + 0.38, 5.5), P(p + 0.38, q, 5.5)), WOOD_D, 1);
    // A second crate, smashed open, slats fanned out.
    const c = mix(pick(r, ['#7fae9a', '#c98a8a', '#c9b56a']), '#9c9b7c', 0.35);
    s += box(P, p + 0.42, q + 0.3, p + 0.76, q + 0.64, 0, 7, c, { sw: 1.4, noTop: true }) + poly(flat(P, p + 0.42, q + 0.3, p + 0.76, q + 0.64, 7), DARK, { sw: 1.4 });
    s += stick(seg(P(p + 0.8, q + 0.72), P(p + 1.05, q + 0.5)), mix(BOARD, '#9c9b7c', 0.3), 2.6, 1.6) + stick(seg(P(p + 0.3, q + 0.75), P(p + 0.6, q + 0.82)), mix(BOARD2, '#9c9b7c', 0.3), 2.6, 1.6);
    return s;
  },
  fence(u, v, r) {
    // A broken picket run along the tile's diagonal: some pickets lean, two are down.
    const P = LP;
    const along = r() < 0.5;
    const A = (t, z) => (along ? P(u + 0.1 + t * 0.85, v + 0.55, z) : P(u + 0.55, v + 0.1 + t * 0.85, z));
    const wood = '#b9a582';
    let s = stick(seg(A(0, 6), A(0.8, 8)), wood, 2.4, 1.6);
    let pk = '';
    let down = '';
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      if (k === 2 || k === 4) {
        const [x, y] = A(t, 0);
        down += `M${N(x - 2)} ${N(y + 3)}l9 ${along ? 3 : -3}`;
        continue;
      }
      const lean = k === 5 ? 4 : k === 1 ? -2 : 0;
      const [x, y] = A(t, 0);
      pk += `M${N(x)} ${N(y)}l${lean} -14`;
    }
    s += line(pk, O, 4.6) + line(pk, wood, 2.6);
    s += line(down, O, 4.4) + line(down, mix(wood, '#9c9b7c', 0.3), 2.4);
    return s;
  },
  cart(u, v) {
    // A shopping cart on its side.
    const [x, y] = LP(u + 0.5, v + 0.55);
    let s = ell(x + 2, y + 1, 15, 5, O, { op: 0.13 });
    const fr = `M${x - 14} ${y - 2}l14 6l12 -6l0 -11l-12 6l-14 -6z`;
    s += path(fr, '#dfe4ea', { op: 0.3 });
    let gr = '';
    for (let k = 1; k < 4; k++) gr += `M${x - 14 + k * 3.5} ${y - 13 + k * 1.5}v11M${x + k * 3} ${y - 7 - k * 1.5}v11`;
    s += line(gr, '#8f98a3', 1) + path(fr, 'none', { sw: 1.6, stroke: '#6f7883' }) + line(`M${x} ${y - 7}v11`, '#6f7883', 1.6);
    s += stick(`M${x + 12} ${y - 17}l5 -2`, '#c96a5f', 2, 1.4) + path(epath([[x - 15, y - 1, 2.2, 2.2], [x - 15, y - 12, 2.2, 2.2]]), '#3a3a40', { sw: 1 });
    return s;
  },
  drums(u, v, r) {
    const [x, y] = LP(u + 0.45, v + 0.5);
    const c = mix(pick(r, ['#6f8fae', '#b06a52', '#8fa06a']), '#9c9b7c', 0.3);
    // One standing, one on its side.
    let s = ell(x + 4, y + 1, 16, 5.5, O, { op: 0.13 });
    s += path(`M${x - 13} ${y - 15}V${y - 2}A6 3 0 0 0 ${x - 1} ${y - 2}V${y - 15}Z`, c, { sw: 1.4 }) + ell(x - 7, y - 15, 6, 3, lt(c, 0.2), { sw: 1.4 }) + line(`M${x - 13} ${y - 8}A6 3 0 0 0 ${x - 1} ${y - 8}`, dk(c, 0.3), 1.1);
    const c2 = mix(c, '#a8673e', 0.4);
    s += path(`M${x + 1} ${y - 3}l12 6l0 -2a4 6 0 0 0 -2 -11l-12 -6z`, c2, { sw: 1.4 }) + ell(x + 1, y - 9, 4, 6, lt(c2, 0.15), { sw: 1.4 }) + ell(x + 1, y - 9, 1.3, 1.8, DARK);
    return s;
  },
};

function wildDressing(r) {
  let s = '';
  // Overgrowth and dry dirt patches, clipped to the diamond.
  let darkP = '';
  let dryP = '';
  for (let k = 0; k < 7; k++) {
    const [x, y] = LP(0.6 + r() * 5.8, 0.6 + r() * 5.8);
    const rx = 18 + r() * 22;
    if (k % 2) darkP += epath([[x, y, rx, rx * 0.5]]);
    else dryP += epath([[x, y, rx * 0.8, rx * 0.4]]);
  }
  let grit = '';
  for (let k = 0; k < 16; k++) {
    const [x, y] = LP(0.3 + r() * 6.4, 0.3 + r() * 6.4);
    grit += `M${N(x)} ${N(y)}l2 -3M${N(x + 3)} ${N(y)}l-1 -3.5`;
  }
  s += `<clipPath id="${ID}c"><path d="${lotGrown(0.6)}"/></clipPath><g clip-path="url(#${ID}c)">${path(darkP, '#93984f', { op: 0.5 })}${path(dryP, '#b5a874', { op: 0.45 })}</g>`;
  s += line(grit, '#7f8a41', 1.2, { op: 0.8 });
  // Low wrecks on the front band: 2 or 3 of them, at most one car.
  const used = new Set();
  const wrecks = [];
  const free = (u, v) => u >= 0 && v >= 0 && u < LOT && v < LOT && !used.has(`${u},${v}`) && FRONT_TILES.some(([a, b]) => a === u && b === v);
  if (r() < 0.65) {
    for (let k = 0; k < 8; k++) {
      const [u, v] = pick(r, FRONT_TILES);
      const alongP = u === 5 && r() < 0.6;
      const [u2, v2] = alongP ? [u + 1, v] : [u, v + 1];
      if (!free(u, v) || !free(u2, v2)) continue;
      used.add(`${u},${v}`).add(`${u2},${v2}`);
      wrecks.push([LP(u + 1, v + 1)[1], WRECKS.car(u, v, r, alongP), u, v, alongP ? 2 : 1, alongP ? 1 : 2]);
      break;
    }
  }
  const kinds = ['tyres', 'crates', 'fence', 'cart', 'drums'];
  for (let n = wrecks.length ? 1 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.5 ? 1 : 0); n > 0; ) {
    const [u, v] = pick(r, FRONT_TILES);
    if (!free(u, v)) {
      if (used.size >= FRONT_TILES.length) break;
      continue;
    }
    used.add(`${u},${v}`);
    const kind = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
    wrecks.push([LP(u + 1, v + 1)[1], WRECKS[kind](u, v, r), u, v, 1, 1]);
    n--;
  }
  wrecks.sort((x, y) => x[0] - y[0]);
  // Flat clutter: 3 or 4 decals, never the same twice, off the ruin and the wrecks.
  const pool = Object.entries(DECAL_W);
  for (let n = 3 + (r() < 0.6 ? 1 : 0); n > 0 && pool.length; n--) {
    let x = r() * pool.reduce((t, e) => t + e[1], 0);
    const k = pool.findIndex((e) => (x -= e[1]) < 0);
    const kind = pool.splice(k < 0 ? 0 : k, 1)[0][0];
    for (let tries = 0; tries < 30; tries++) {
      const u = Math.floor(r() * (kind === 'marks' ? 5 : kind === 'sign' ? 6 : 7));
      const v = Math.floor(r() * (kind === 'marks' ? 7 : 6));
      if (u >= 1 && u <= 4 && v >= 1 && v <= 4) continue;
      if (used.has(`${u},${v}`) || (kind === 'marks' && (used.has(`${u + 1},${v}`) || (u + 1 >= 2 && u + 1 <= 4 && v >= 2 && v <= 4)))) continue;
      s += DECALS[kind](u, v, r);
      used.add(`${u},${v}`);
      break;
    }
  }
  // Tall-grass tufts: the ones behind a wreck go under it, the rest on top.
  let back = '';
  let front = '';
  for (let k = 0; k < 22; k++) {
    const p = 0.3 + r() * 6.4;
    const q = 0.3 + r() * 6.4;
    if (p > 2.1 && p < 4.9 && q > 2.1 && q < 4.9) continue;
    const [x, y] = LP(p, q);
    const d = tuftD(x, y, 0.7 + r() * 0.55, TUFT);
    const behind = wrecks.some(([, , u, v, w, h]) => p > u - 0.6 && q > v - 0.6 && p < u + w + 0.2 && q < v + h + 0.2 && p + q < u + v + w + h - 0.3);
    if (behind) back += d;
    else front += d;
  }
  const tufts = (d) => (d ? `<path d="${d}" fill="#8c9b46" stroke-width=".9"/>` : '');
  s += tufts(back) + wrecks.map((w) => w[1]).join('') + tufts(front);
  return s;
}

// --- Paths --------------------------------------------------------------------------------------

const PATH_TYPES = new Set(['dirt', 'planks', 'brick']);
/** Every path type is 1 − 2·PM of a tile wide (≈ 21 px across at zoom 1). */
const PM = 0.13;
/**
 * Per type: the front edge's thickness and colour (decks), the curb (brick), the flat fill,
 * rim and edge wobble (dirt: a worn track flush with the grass, its edge a little ragged).
 */
const DECK = {
  dirt: { side: 0, fill: '#d2a66e', rim: '#8f673f', wob: 0.07 },
  planks: { side: 3, sideFill: '#8b5a2f' },
  brick: { side: 2.5, sideFill: '#9a5a40', curb: '#ece0c4' },
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
  const T = 'patternUnits="userSpaceOnUse" width="1" height="1" patternTransform="matrix(32 16 -32 16 224 0)"';
  // Paths overdraw 2 px past the lot's edge, so the next lot's grass hair never cuts them.
  let defs = `<clipPath id="${ID}p"><path d="${lotGrown(2)}"/></clipPath>`;
  let s = '';
  if (by.dirt.length) {
    // A worn track: the same band as the decks (so widths and joins match), flush with the
    // grass, a dark rim, a darker trodden middle, a few pebbles. Nothing lit, nothing raised.
    s += deckSvg('dirt', by.dirt, i0, j0, at);
    const { d, peb } = dirtD(by.dirt, i0, j0, at, r);
    s += line(d, '#bd8f5a', 7, { op: 0.6 }) + line(peb, '#94704a', 2.6);
  }
  if (by.planks.length) {
    // Planks lie across the way you walk: seams at constant s (A) or constant t (B).
    defs +=
      `<pattern id="${ID}a" ${T}><rect width="1" height="1" fill="#dda669"/><path d="M.2 0h.2v1h-.2zM.6 0h.2v1h-.2z" fill="#cd9459"/>` +
      `<path d="M0 0V1M.2 0V1M.4 0V1M.6 0V1M.8 0V1M1 0V1" stroke="#7d5330" stroke-width=".035"/>` +
      `<path d="M.1 .24h.001M.3 .24h.001M.5 .24h.001M.7 .24h.001M.9 .24h.001M.1 .76h.001M.3 .76h.001M.5 .76h.001M.7 .76h.001M.9 .76h.001" stroke="#6b4a2c" stroke-width=".05"/></pattern>` +
      `<pattern id="${ID}b" ${T}><rect width="1" height="1" fill="#dda669"/><path d="M0 .2v.2h1v-.2zM0 .6v.2h1v-.2z" fill="#cd9459"/>` +
      `<path d="M0 0H1M0 .2H1M0 .4H1M0 .6H1M0 .8H1M0 1H1" stroke="#7d5330" stroke-width=".035"/>` +
      `<path d="M.24 .1h.001M.24 .3h.001M.24 .5h.001M.24 .7h.001M.24 .9h.001M.76 .1h.001M.76 .3h.001M.76 .5h.001M.76 .7h.001M.76 .9h.001" stroke="#6b4a2c" stroke-width=".05"/></pattern>`;
    s += deckSvg('planks', by.planks, i0, j0, at);
  }
  if (by.brick.length) {
    // Basketweave pavers: four 2-brick blocks per tile, turned alternately.
    defs +=
      `<pattern id="${ID}k" ${T}><rect width="1" height="1" fill="#d97b55"/>` +
      `<path d="M0 .25h.5v.25h-.5zM.75 0h.25v.5h-.25zM.25 .5h.25v.5h-.25zM.5 .75h.5v.25h-.5z" fill="#c76a4a"/>` +
      `<path d="M.04 .07h.38M.79 .06v.36M.29 .57v.36M.56 .82h.38" stroke="#ec9b74" stroke-width=".03"/>` +
      `<path d="M0 0H1M0 .5H1M0 1H1M0 0V1M.5 0V1M1 0V1M0 .25H.5M.75 0V.5M.25 .5V1M.5 .75H1" stroke="#8f4630" stroke-width=".03"/></pattern>`;
    s += deckSvg('brick', by.brick, i0, j0, at);
  }
  return `<defs>${defs}</defs><g clip-path="url(#${ID}p)">${s}</g>`;
}

/** Dirt's trodden middle: one centre-to-centre line per joined pair, plus a few pebbles. */
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
      if (t === 'dirt' && inLot && (du < 0 || dv < 0)) continue;
      d += `M${pt(c)}L${pt(t === 'dirt' ? C(nu, nv) : LP(u + 0.5 + du * 0.5, v + 0.5 + dv * 0.5))}`;
    }
    if (!n) d += `M${N(c[0] - 5)} ${N(c[1] - 1)}L${N(c[0] + 5)} ${N(c[1] + 1)}`;
    for (let k = 0; k < 2; k++) {
      const p = LP(u + 0.3 + r() * 0.4, v + 0.3 + r() * 0.4);
      peb += `M${pt(p)}h1.2`;
    }
  }
  return { d, peb };
}

/**
 * A band per tile (centre + arms + filled corners), outlined on its exposed sides: planks,
 * brick, or dirt (cell by cell, every grid point nudged by a hash of its GLOBAL position, so
 * the ragged edge is the same in both lots that draw a border tile).
 */
function deckSvg(type, list, i0, j0, at) {
  const m = PM;
  const { side, sideFill, curb, wob, fill, rim } = DECK[type];
  const S = [0, m, 1 - m, 1];
  const J = (p, q) => {
    if (!wob) return LP(p, q);
    const h = hash(`${Math.round((i0 + p) * 1000)},${Math.round((j0 + q) * 1000)}`);
    return LP(p + ((h & 1023) / 1023 - 0.5) * wob, q + (((h >>> 10) & 1023) / 1023 - 0.5) * wob);
  };
  // Quads that reach a tile edge overhang it a hair (E), so neighbouring quads (and lots) overlap.
  const E = 0.05;
  const xe = (t, u) => (t === u ? t - E : t === u + 1 ? t + E : t);
  const quad = (p0, q0, p1, q1, u, v, F = LP) => {
    if (u != null) [p0, p1, q0, q1] = [xe(p0, u), xe(p1, u), xe(q0, v), xe(q1, v)];
    return `M${pt(F(p0, q0))}L${pt(F(p1, q0))}L${pt(F(p1, q1))}L${pt(F(p0, q1))}Z`;
  };
  let dE = '';
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
    if (type === 'dirt') {
      // The body as straight quads; the cells on its edge again, nudged, for the ragged rim.
      dA += row;
      if (!full && (c0 < 1 || c1 > 1)) dA += col;
      for (let cy = 0; cy < 3; cy++)
        for (let cx = 0; cx < 3; cx++)
          if (c[cy * 3 + cx] && (!nb(i, j, cx + 1, cy) || !nb(i, j, cx - 1, cy) || !nb(i, j, cx, cy + 1) || !nb(i, j, cx, cy - 1))) dE += quad(u + S[cx], v + S[cy], u + S[cx + 1], v + S[cy + 1], u, v, J);
    } else if (type === 'planks') {
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
    for (let [a, b] of wob ? e.list : merged) {
      // A side that runs on into the next lot overshoots the lot's edge: the clip trims it
      // 2 px out, so its caps never land on the neighbour's identical line (no notch).
      if (!wob && a < 1e-6) a = -0.3;
      if (!wob && b > LOT - 1e-6) b = LOT + 0.3;
      const A = e.axis === 'p' ? J(e.fixed, a) : J(a, e.fixed);
      const B = e.axis === 'p' ? J(e.fixed, b) : J(b, e.fixed);
      outl += seg(A, B);
      // Dirt's ragged rim runs on one cell into the next lot, through the very points that
      // lot uses (the nudge hashes global positions), so the border never shows a gap.
      if (wob && a < 1e-6) outl += seg(e.axis === 'p' ? J(e.fixed, -PM) : J(-PM, e.fixed), A);
      if (wob && b > LOT - 1e-6) outl += seg(B, e.axis === 'p' ? J(e.fixed, LOT + PM) : J(LOT + PM, e.fixed));
      if (e.front && side) strips += `M${pt(A)}L${pt(B)}l0 ${side}L${N(A[0])} ${N(A[1] + side)}Z`;
    }
  }
  if (type === 'dirt') return path(dA, fill, { sw: 1.2, stroke: fill }) + (dE ? path(dE, fill) : '') + (outl ? line(outl, rim, 2.2) : '');
  const fillA = `url(#${ID}${type === 'brick' ? 'k' : 'a'})`;
  let s = strips ? path(strips, sideFill, { sw: 1.4 }) : '';
  // Brick: a dark outline outside a cream curb. Planks: the same dark outline.
  if (curb && outl) s += line(outl, O, 6.6);
  // A flat fill under the pattern, a hair fatter: the half-pixel slivers where rounded quad
  // edges meet (and pattern-tile seams) show brick or plank colour, never the grass.
  const base = type === 'brick' ? '#d97b55' : '#dda669';
  const under = (d) => path(d, base, { sw: 1.2, stroke: base });
  if (dA) s += under(dA) + path(dA, fillA);
  if (dB) s += under(dB) + path(dB, `url(#${ID}b)`);
  if (outl) s += curb ? line(outl, curb, 3) : line(outl, O, 2.2);
  return s;
}

// --- Ruins --------------------------------------------------------------------------------------

const RUIN_H = { shopfront: 148, house: 154, stand: 150, stage: 150, silo: 204, garage: 150 };
const RUIN_BODY = { shopfront: 70, house: 60, stand: 60, stage: 60, silo: 110, garage: 50 };
const RUIN_NAME = { shopfront: 'DINER', house: 'MOTEL', stand: 'BURGERS', stage: 'CAMP', silo: 'LUMBER', garage: 'GARAGE' };

// Muted paints (pulled toward the wild's olive-grey): every lot that shares an archetype
// still gets its own wall, roof, trim and sign colours from its seed.
const RUIN_PAINT = ['#b4b190', '#9fb8a4', '#c6a89a', '#a3b2c2', '#c8b47e', '#b1a6bc', '#b9937e', '#aab98c'];
const RUIN_ROOF = ['#9d6b5d', '#7c8b88', '#8b7558', '#6f8a72', '#7b7d98', '#a07a4e'];
const RUIN_TRIM = ['#c47a6a', '#6f9ab8', '#87a866', '#d0a457', '#a989b8', '#d58a74'];
const RUIN_SIGN = [['#eee2bf', '#b3463b'], ['#e9dcae', '#3f6a8a'], ['#f0dfa8', '#4f7a3a'], ['#e6e2d0', '#8a4a7a'], ['#f2e3c4', '#c0602a']];
const tired = (c, k = 0.3) => mix(c, '#a3a385', k);

function ruinPalette(r) {
  const [bg, ink] = pick(r, RUIN_SIGN);
  return { wall: tired(pick(r, RUIN_PAINT)), roof: tired(pick(r, RUIN_ROOF), 0.2), trim: tired(pick(r, RUIN_TRIM), 0.22), bg, ink, alt: r() < 0.5 };
}

/** Dirt and rubble underfoot, so the ruin sits in its own scruffy yard. */
function yard(P, r) {
  let s = poly([P(0.1, 0.3), P(1.5, 0.08), P(2.9, 0.3), P(2.92, 1.5), P(2.75, 2.92), P(1.5, 2.95), P(0.25, 2.8), P(0.08, 1.5)], '#958d68', { op: 0.42 });
  const list = [];
  for (let k = 0; k < 6; k++) {
    const [x, y] = P(0.25 + r() * 2.5, 2.6 + r() * 0.3);
    list.push([x, y, 1.8 + r(), 1.1]);
  }
  return s + path(epath(list), '#857d5c', { op: 0.6 });
}

// Rooftop giants (screen-space icons standing on (x, y)), so the four stands and the
// two shopfronts tell themselves apart at a glance. Tired paint, still cheerful.
const TOP = {
  burger(x, y) {
    let s = path(`M${x - 16} ${y - 6}q0 6 16 6q16 0 16 -6z`, tired('#e0a35a', 0.2), { sw: 1.8 });
    s += ell(x, y - 8, 17, 4.5, tired('#8a4a32', 0.15), { sw: 1.8 });
    s += path(`M${x - 18} ${y - 11}q4 4 8 0q4 4 8 0q4 4 8 0q4 4 8 0q4 4 6 0`, tired('#7fc04f', 0.2), { sw: 1.5 });
    s += path(`M${x - 6} ${y - 12}l4 6l4 -6z`, tired('#ffd23f', 0.2), { sw: 1.2 });
    s += path(`M${x - 17} ${y - 12}q1 -15 17 -15q16 0 17 15z`, tired('#e8a85e', 0.2), { sw: 1.8 });
    s += line(`M${x - 9} ${y - 20}h.1M${x - 2} ${y - 23}h.1M${x + 5} ${y - 21}h.1M${x + 10} ${y - 17}h.1`, '#fff6dc', 2.2);
    return s + path(`M${x - 11} ${y - 18}q3 -5 8 -6`, 'none', { sw: 2, stroke: '#f6d9a6' });
  },
  golf(x, y) {
    let s = stick(`M${x + 12} ${y}V${y - 40}`, '#d9d4c6', 1.6, 1.8) + path(`M${x + 13} ${y - 40}l12 4l-12 5z`, tired('#e8483f', 0.25), { sw: 1.4 });
    s += path(`M${x - 5} ${y}l2 -7h6l2 7z`, tired('#ffd23f', 0.25), { sw: 1.4 }) + circ(x, y - 18, 12, '#f1eee4', { sw: 2 });
    s += line(`M${x - 5} ${y - 22}h.1M${x + 1} ${y - 24}h.1M${x + 6} ${y - 19}h.1M${x - 3} ${y - 15}h.1M${x + 3} ${y - 13}h.1M${x - 8} ${y - 17}h.1`, '#b9b4a6', 2.4);
    return s + path(`M${x - 7} ${y - 24}q3 -4 8 -5`, 'none', { sw: 2, stroke: '#ffffff' });
  },
  pumpkin(x, y) {
    const c = tired('#ff9a3c', 0.22);
    let s = stick(`M${x} ${y - 21}q1 -6 5 -8`, '#6f8a3a', 2.6, 1.8) + path(`M${x + 2} ${y - 26}q7 -6 11 0q-6 3 -11 0z`, tired('#7fc04f', 0.2), { sw: 1.2 });
    s += path(`M${x} ${y - 21}q-18 -2 -18 9q0 12 18 12q18 0 18 -12q0 -11 -18 -9z`, c, { sw: 2 });
    s += line(`M${x - 7} ${y - 20}q-4 9 0 19M${x + 7} ${y - 20}q4 9 0 19M${x} ${y - 21}v21`, dk(c, 0.25), 1.4);
    return s + path(`M${x - 13} ${y - 13}q1 -4 5 -6`, 'none', { sw: 2, stroke: '#ffd3a0' });
  },
  ring(x, y) {
    let s = stick(`M${x - 17} ${y}l12 -34`, tired(WOOD_L, 0.2), 2.4, 2) + path(`M${x - 6} ${y - 34}l3 -8l4 1.5l-2 8z`, tired(WOOD_L, 0.2), { sw: 1.4 });
    s += circ(x + 2, y - 15, 14, '#f1eee4', { sw: 2 }) + circ(x + 2, y - 15, 6, 'none', { sw: 2 });
    const red = tired('#e8483f', 0.25);
    s += path(`M${x + 2} ${y - 29}a14 14 0 0 1 14 14h-8a6 6 0 0 0 -6 -6zM${x + 2} ${y - 1}a14 14 0 0 1 -14 -14h8a6 6 0 0 0 6 6z`, red);
    return s + circ(x + 2, y - 15, 14, 'none', { sw: 2 });
  },
  cone(x, y) {
    let s = path(`M${x - 9} ${y - 20}l9 20l9 -20z`, tired('#e2ab6c', 0.2), { sw: 1.8 }) + line(`M${x - 5} ${y - 19}l7 12M${x + 1} ${y - 20}l5 9M${x + 5} ${y - 19}l-8 14`, '#b8823f', 1.1);
    s += circ(x, y - 25, 9, tired('#ff9ccf', 0.25), { sw: 1.8 }) + circ(x + 2, y - 36, 7.5, tired('#9fe0c0', 0.25), { sw: 1.8 });
    return s + path(`M${x - 5} ${y - 28}q1 -4 5 -4`, 'none', { sw: 1.8, stroke: '#ffffff' });
  },
  cup(x, y) {
    const c = '#efe6d2';
    let s = ell(x + 2, y - 1, 19, 5, '#d9cfb8', { sw: 1.8 }) + path(`M${x + 10} ${y - 20}q12 -1 10 8q-2 6 -11 4`, 'none', { sw: 6 }) + path(`M${x + 10} ${y - 20}q12 -1 10 8q-2 6 -11 4`, 'none', { sw: 3, stroke: c });
    s += path(`M${x - 13} ${y - 24}h26l-3 20q-10 5 -20 0z`, c, { sw: 2 }) + path(`M${x - 12} ${y - 17}h24l-1 5h-22z`, tired('#e8483f', 0.25));
    s += ell(x, y - 24, 13, 3.5, '#6b4a33', { sw: 1.8 });
    return s + line(`M${x - 4} ${y - 31}q-3 -4 0 -7q3 -3 0 -6M${x + 4} ${y - 30}q-3 -4 0 -7`, '#d9d2c2', 2, { op: 0.8 });
  },
  cross(x, y) {
    const c = tired('#36c06a', 0.3);
    let s = stick(`M${x} ${y}V${y - 12}`, '#8f969a', 2.4, 2);
    s += path(`M${x - 5} ${y - 12}h10v-9h9v-10h-9v-9h-10v9h-9v10h9z`, c, { sw: 2.2 });
    s += line(`M${x - 2} ${y - 37}h.1M${x - 11} ${y - 28}h.1M${x + 11} ${y - 28}h.1M${x + 2} ${y - 15}h.1`, '#e8f4dc', 2.6);
    return s + path(`M${x - 3} ${y - 36}v8h-8`, 'none', { sw: 1.6, stroke: lt(c, 0.4) });
  },
};

function shopfront(P, name, r, pal) {
  const wall = pal.wall;
  const front = dk(wall, 0.05);
  let s = shadowQ(P, 0.3, 0.45, 2.7, 2.35) + weeds(P, [[0.2, 1.3, 0.8], [1.4, 0.3, 0.9]]);
  // The sidewalk.
  s += box(P, 0.12, 2.35, 2.88, 2.88, 0, 2.5, CONC, { sw: 1.5 });
  s += crack([P(0.7, 2.37, 2.5), P(0.78, 2.6, 2.5), P(0.72, 2.86, 2.5)]) + crack([P(2.2, 2.37, 2.5), P(2.3, 2.86, 2.5)]);
  // The store, its roof: a tar patch, the old AC unit, a vent.
  s += box(P, 0.3, 0.45, 2.7, 2.35, 0, 46, wall);
  s += poly(flat(P, 0.6, 0.75, 1.25, 1.35, 46), dk(lt(wall, 0.24), 0.14), { op: 0.9 });
  s += box(P, 1.7, 0.7, 2.3, 1.25, 46, 56, '#aeb4b0', { sw: 1.6 }) + line(`M${pt(P(1.78, 1.25, 49))}L${pt(P(2.22, 1.25, 49))}M${pt(P(1.78, 1.25, 52.5))}L${pt(P(2.22, 1.25, 52.5))}`, '#6d7470', 1.2);
  // The rooftop giant peeks over the false front.
  const tp = P(1.05, 1.15, 46);
  if (/PHARM|DRUG|CLINIC|DOC/.test(name)) s += TOP.cross(tp[0], tp[1]);
  else if (/DINER|CAF|COFFEE|EAT/.test(name)) s += TOP.cup(tp[0], tp[1]);
  else s += stick(seg(P(1.15, 1.9, 46), P(1.15, 1.9, 56)), '#9aa09c', 3, 2) + ell(...P(1.15, 1.9, 57), 3, 1.5, '#7d837f', { sw: 1.2 });
  // The false front: the full width, a raised middle, a dark band under it.
  s += box(P, 0.3, 2.2, 2.7, 2.35, 46, 66, front) + box(P, 0.78, 2.2, 2.22, 2.35, 66, 80, front);
  s += poly(onL(P, 2.35, 0.3, 2.7, 42, 46), dk(wall, 0.3), { sw: 1.4 });
  const sc = P(1.5, 2.35, 64);
  s += faceSign(sc[0], sc[1], 86, 24, name, { rot: -4, size: 14, bg: pal.bg, ink: pal.ink });
  // The shop windows and the door, boarded.
  s += boarded(P, 'L', 2.35, 0.46, 1.18, 6, 28, { n: 3 });
  s += boarded(P, 'L', 2.35, 1.84, 2.55, 6, 28);
  s += poly(onL(P, 2.35, 1.3, 1.72, 0, 31), '#80684f', { sw: 1.8 }) + poly(onL(P, 2.35, 1.38, 1.64, 17, 27), DARK, { sw: 1.2 });
  s += stick(seg(P(1.3, 2.37, 3), P(1.72, 2.37, 26)), BOARD, 3.4, 2.2) + stick(seg(P(1.3, 2.37, 24), P(1.72, 2.37, 6)), BOARD2, 3.4, 2.2);
  // The striped awning across the whole front, one stripe torn away.
  const torn = 3 + Math.floor(r() * 6);
  let st1 = '';
  let st2 = '';
  for (let k = 0; k < 12; k++) {
    const pa = 0.36 + k * 0.19;
    const pb = pa + 0.19;
    if (k === torn) continue;
    const d = `M${pt(P(pa, 2.35, 38))}L${pt(P(pb, 2.35, 38))}L${pt(P(pb, 2.76, 30))}L${pt(P(pb, 2.76, 27))}Q${pt(P((pa + pb) / 2, 2.76, 23))} ${pt(P(pa, 2.76, 27))}Z`;
    if (k % 2) st2 += d;
    else st1 += d;
  }
  s += path(st1, pal.trim, { sw: 1.4 }) + path(st2, '#ece2c8', { sw: 1.4 });
  const tp0 = 0.36 + torn * 0.19;
  s += poly([P(tp0 + 0.02, 2.37, 38), P(tp0 + 0.17, 2.37, 38), P(tp0 + 0.15, 2.4, 22), P(tp0 + 0.08, 2.4, 25), P(tp0 + 0.03, 2.4, 19)], torn % 2 ? '#ece2c8' : pal.trim, { sw: 1.4 });
  s += line(seg(P(tp0, 2.76, 30), P(tp0 + 0.19, 2.76, 30)), '#8f969a', 1.6);
  // The side: a little window, the drainpipe, cracks.
  s += boarded(P, 'R', 2.7, 0.95, 1.75, 15, 32, { n: 2 });
  s += stick(seg(P(2.7, 2.28, 43), P(2.7, 2.28, 8)), '#9aa3a6', 2.4, 1.8);
  s += crack([P(0.3, 2.35, 30), P(0.4, 2.35, 26), P(0.38, 2.35, 20), P(0.5, 2.35, 16)]) + crack([P(2.7, 1.9, 40), P(2.7, 2.0, 34), P(2.7, 1.92, 28)]);
  // A street prop on the sidewalk: a bench or a newspaper box.
  if (pal.alt) s += box(P, 2.25, 2.5, 2.55, 2.8, 2.5, 18, tired('#5f8fbf', 0.25), { sw: 1.6 }) + poly(onL(P, 2.8, 2.3, 2.5, 10, 15), '#d9d2c2', { sw: 1.1 });
  else s += box(P, 0.2, 2.58, 0.95, 2.72, 2.5, 4.5, WOOD_D, { sw: 1.2 }) + stick(seg(P(0.25, 2.66, 3), P(0.25, 2.66, 9)) + seg(P(0.9, 2.66, 3), P(0.9, 2.66, 9)), '#6e6a66', 1.4, 1.4) + box(P, 0.18, 2.55, 0.98, 2.75, 9, 11.5, WOOD, { sw: 1.3 }) + box(P, 0.18, 2.52, 0.98, 2.58, 11.5, 19, WOOD, { sw: 1.3 });
  // Overgrowth.
  s += vine(P, pal.alt ? 'L' : 'R', pal.alt ? 2.35 : 2.7, pal.alt ? 0.36 : 0.55, 0, pal.alt ? 40 : 30);
  s += weeds(P, [[0.35, 2.55, 1.1], [1.5, 2.6, 0.8], [2.62, 2.52], [2.8, 1.5, 0.9], [2.82, 0.6, 1.1]]);
  return s + rubble(P, [[1.2, 2.78, 3]]);
}

function house(P, name, r, pal) {
  const logs = /PINE|CABIN|LODGE|LOG/.test(name);
  const wall = logs ? tired('#b98a5a', 0.3) : pal.wall;
  const roof = logs ? tired('#6f8a72', 0.2) : pal.roof;
  const right = pal.alt;
  let s = shadowQ(P, 0.55, 0.6, 2.45, 2.2, 0.45) + weeds(P, [[0.35, 1.5, 0.9], [0.5, 0.45, 0.8]]);
  // Back roof slope, then the chimney (on one end or the other).
  s += poly([P(0.42, 1.4, 62), P(2.58, 1.4, 62), P(2.58, 0.42, 31), P(0.42, 0.42, 31)], dk(roof, 0.18), { sw: 2 });
  const cp = right ? 1.95 : 0.85;
  s += box(P, cp, 0.85, cp + 0.3, 1.15, 42, 76, tired('#a8705a', 0.2), { sw: 1.8 }) + box(P, cp - 0.05, 0.8, cp + 0.35, 1.2, 76, 79, '#8a8478', { sw: 1.6 });
  // Walls: the gable end on the right, the long side on the left.
  s += poly([P(2.45, 2.2, 0), P(2.45, 0.6, 0), P(2.45, 0.6, 34), P(2.45, 1.4, 61), P(2.45, 2.2, 34)], dk(wall, 0.24), { sw: 2 });
  s += poly(onL(P, 2.2, 0.55, 2.45, 0, 34), wall, { sw: 2 });
  if (logs) {
    let lg = '';
    for (let z = 6; z < 34; z += 5.5) lg += seg(P(0.57, 2.2, z), P(2.43, 2.2, z)) + seg(P(2.45, 2.18, z), P(2.45, 0.62, z));
    s += line(lg, dk(wall, 0.3), 1.2);
  }
  s += poly(onL(P, 2.2, 0.55, 2.45, 0, 6), dk(wall, 0.12), { sw: 1.4 });
  // Front roof slope: shingle rows, a hole with broken rafters, moss.
  const RS = (p, k) => P(p, 1.4 + k * 1.02, 62 - k * 32);
  s += poly([RS(0.42, 0), RS(2.58, 0), RS(2.58, 1), RS(0.42, 1)], roof, { sw: 2 });
  let sh = '';
  for (const k of [0.25, 0.5, 0.75]) sh += seg(RS(0.45, k), RS(2.55, k));
  s += line(sh, dk(roof, 0.2), 1.3);
  const hx = right ? 0.7 : 1.7;
  s += poly([RS(hx + 0.02, 0.28), RS(hx + 0.28, 0.22), RS(hx + 0.52, 0.38), RS(hx + 0.46, 0.62), RS(hx + 0.2, 0.7), RS(hx, 0.55)], DARK, { sw: 1.6 });
  s += stick(seg(RS(hx + 0.1, 0.18), RS(hx + 0.16, 0.74)), WOOD_D, 2.2, 1.6) + stick(seg(RS(hx + 0.36, 0.2), RS(hx + 0.3, 0.6)), WOOD_D, 2.2, 1.6);
  s += path(epath([[...RS(right ? 2.0 : 0.8, 0.82), 9, 3.5], [...RS(right ? 2.4 : 1.3, 0.9), 6, 2.5]]), '#7f9a46', { op: 0.75 });
  s += line(seg(RS(0.42, 0), RS(2.58, 0)), dk(roof, 0.3), 2.6);
  // Fascia boards at the gable end.
  s += poly([P(2.58, 1.4, 62), P(2.58, 2.42, 30), P(2.58, 2.42, 26.5), P(2.58, 1.4, 58.5)], '#c7b48c', { sw: 1.6 });
  s += poly([P(2.58, 1.4, 62), P(2.58, 0.42, 31), P(2.58, 0.42, 27.5), P(2.58, 1.4, 58.5)], '#b3a07a', { sw: 1.6 });
  // A school bell in a little cupola on the ridge.
  if (/SCHOOL|CHAPEL|CHURCH/.test(name)) {
    s += box(P, 1.3, 1.25, 1.7, 1.55, 55, 74, tired('#e9dcc0', 0.2), { sw: 1.6 }) + poly(onL(P, 1.55, 1.38, 1.62, 61, 71), DARK) + circ(...P(1.5, 1.55, 64), 3, tired('#ffc23a', 0.2), { sw: 1.2 });
    s += poly([P(1.22, 1.62, 74), P(1.78, 1.62, 74), P(1.5, 1.4, 90)], roof, { sw: 1.8 }) + poly([P(1.78, 1.62, 74), P(1.78, 1.18, 74), P(1.5, 1.4, 90)], dk(roof, 0.25), { sw: 1.8 });
  }
  // Windows, the attic window, the door and a dangling shutter.
  s += boarded(P, 'L', 2.2, 0.72, 1.14, 12, 27);
  s += boarded(P, 'L', 2.2, 1.86, 2.28, 12, 27);
  s += poly([P(2.3, 2.2, 9), P(2.5, 2.2, 13), P(2.5, 2.2, 28), P(2.3, 2.2, 24)], pal.trim, { sw: 1.5 });
  s += boarded(P, 'R', 2.45, 1.22, 1.58, 36, 46, { n: 1 });
  s += boarded(P, 'R', 2.45, 0.85, 1.35, 12, 26);
  s += poly(onL(P, 2.2, 1.3, 1.68, 0, 26), '#7d6650', { sw: 1.8 }) + stick(seg(P(1.27, 2.22, 4), P(1.71, 2.22, 22)), BOARD, 3.4, 2.2);
  // The porch step, one plank snapped.
  s += box(P, 1.2, 2.2, 1.78, 2.55, 0, 5, '#b89c72', { sw: 1.6 }) + poly(flat(P, 1.42, 2.25, 1.56, 2.52, 5), DARK, { op: 0.8 });
  s += crack([P(0.55, 2.2, 28), P(0.7, 2.2, 24), P(0.66, 2.2, 18)]);
  s += vine(P, 'R', 2.45, 2.0, 0, 30);
  // A dead neon arrow by a motel; otherwise an old mailbox.
  if (/MOTEL|INN|HOTEL/.test(name)) {
    const a = P(2.78, 2.72);
    s += stick(`M${pt(a)}V${N(a[1] - 50)}`, '#8f969a', 2.4, 2);
    s += path(`M${N(a[0] - 14)} ${N(a[1] - 66)}h18v-5l11 10l-11 10v-5h-18z`, tired('#ff7ab8', 0.35), { sw: 2 }) + line(`M${N(a[0] - 10)} ${N(a[1] - 61)}h.1M${N(a[0] - 4)} ${N(a[1] - 61)}h.1M${N(a[0] + 2)} ${N(a[1] - 61)}h.1M${N(a[0] + 9)} ${N(a[1] - 61)}h.1`, '#f3e9d6', 2.4);
  } else {
    const a = P(2.7, 2.62);
    s += stick(`M${pt(a)}V${N(a[1] - 18)}`, WOOD_D, 2.2, 1.8) + box(P, 2.58, 2.55, 2.82, 2.7, 18, 26, tired('#6f9ab8', 0.3), { sw: 1.4 });
  }
  // A signpost in the yard, its board hanging from one nail.
  const post = P(0.35, 2.78);
  s += stick(`M${pt(post)}L${N(post[0])} ${N(post[1] - 40)}`, WOOD_D, 3.4, 2.2);
  const bc = P(1.33, 2.78, 28);
  s += faceSign(bc[0], bc[1], 62, 18, name, { rot: 8, size: 12, bg: pal.bg, ink: pal.ink });
  s += weeds(P, [[0.5, 2.9, 1.1], [2.62, 2.4], [2.75, 1.0, 1.1], [1.9, 2.55, 0.8]]);
  return s + rubble(P, [[2.2, 2.75, 3]]);
}

function stand(P, name, r, pal) {
  const wall = pal.wall;
  let s = shadowQ(P, 0.62, 0.75, 2.38, 2.4) + weeds(P, [[0.4, 0.8, 1], [2.1, 0.55, 0.8]]);
  // Crates of something long gone off, behind the kiosk's left end.
  s += box(P, 0.2, 1.55, 0.6, 1.95, 0, 12, WOOD, { sw: 1.6 }) + box(P, 0.25, 1.6, 0.55, 1.9, 12, 21, '#b8a070', { sw: 1.6 });
  s += ell(...P(0.4, 1.75, 21.5), 6, 2.4, '#8a7a3a', { sw: 1 });
  // The big roadside sign on two poles at the back, its dead bulbs.
  s += stick(seg(P(1.05, 1.0, 30), P(1.05, 1.0, 58)), '#8f969a', 2.6, 2) + stick(seg(P(1.95, 1.0, 30), P(1.95, 1.0, 52)), '#8f969a', 2.6, 2);
  const sc = P(1.5, 1.0, 68);
  s += faceSign(sc[0], sc[1], 94, 28, name, { rot: -6, size: 15, bulbs: true, bg: pal.bg, ink: pal.ink, peel: '#c9b27a' });
  // The kiosk.
  s += box(P, 0.75, 0.9, 2.25, 2.2, 0, 30, wall);
  s += poly(onL(P, 2.2, 0.95, 2.05, 12, 25), DARK, { sw: 1.5 }) + stick(seg(P(0.9, 2.22, 15), P(2.1, 2.22, 22)), BOARD, 3.6, 2.2);
  s += box(P, 0.88, 2.2, 2.12, 2.42, 10, 12.5, BOARD, { sw: 1.4 });
  // A faded menu on the side, the side door nailed shut.
  s += poly(onR(P, 2.25, 1.0, 1.45, 10, 26), '#e2d6b4', { sw: 1.4 });
  s += line(seg(P(2.25, 1.08, 14), P(2.25, 1.37, 14)) + seg(P(2.25, 1.08, 18), P(2.25, 1.37, 18)) + seg(P(2.25, 1.08, 22), P(2.25, 1.37, 22)), '#a99b7c', 1.2);
  s += poly(onR(P, 2.25, 1.6, 2.05, 0, 24), '#86705a', { sw: 1.6 }) + stick(seg(P(2.27, 1.55, 5), P(2.27, 2.1, 19)), BOARD, 3.2, 2);
  // The flat roof, and the propped serving flap with faded stripes.
  s += box(P, 0.62, 0.75, 2.38, 2.4, 30, 35, tired(pal.roof, 0.1), { sw: 1.8 });
  let fa = '';
  let fb = '';
  for (let k = 0; k < 5; k++) {
    const pa = 0.95 + k * 0.22;
    const d = `M${pt(P(pa, 2.2, 26.5))}L${pt(P(pa + 0.22, 2.2, 26.5))}L${pt(P(pa + 0.22, 2.58, 31 - (k === 3 ? 4 : 0)))}L${pt(P(pa, 2.58, 31 - (k === 3 ? 4 : 0)))}Z`;
    if (k % 2) fb += d;
    else fa += d;
  }
  s += path(fa, pal.trim, { sw: 1.3 }) + path(fb, '#e6dcc2', { sw: 1.3 });
  s += stick(seg(P(1.0, 2.42, 12.5), P(1.0, 2.56, 30)), WOOD_D, 1.4, 1.6);
  // The rooftop giant that says what was sold here.
  const tp = P(1.95, 1.95, 35);
  const kind = /BURGER|GRILL|DOG/.test(name) ? 'burger' : /GOLF/.test(name) ? 'golf' : /FARM|PUMPKIN|FRUIT|VEG|GARDEN/.test(name) ? 'pumpkin' : /BOAT|CANOE|LAKE|PIER|BAIT/.test(name) ? 'ring' : 'cone';
  s += TOP[kind](tp[0], tp[1]);
  // A patio umbrella, leaning, one panel torn off; a tipped stool.
  s += umbrella(pal.alt ? P(2.62, 2.6) : P(0.45, 2.62), pal.alt ? 13 : -10, pal.trim);
  s += stick(seg(P(pal.alt ? 0.55 : 2.0, 2.65, 1), P(pal.alt ? 0.95 : 2.4, 2.72, 7)), '#b0b4b8', 1.6, 1.6);
  const sp = P(pal.alt ? 1.0 : 2.45, 2.72, 8);
  s += ell(sp[0], sp[1], 5, 3, '#c9584c', { sw: 1.4, tf: `rotate(-30 ${pt(sp)})` });
  s += vine(P, 'L', 2.2, 0.82, 0, 28);
  s += weeds(P, [[0.62, 2.35, 1.1], [1.6, 2.6, 0.8], [2.35, 2.25, 1], [2.5, 1.2, 0.9]]);
  return s + rubble(P, [[2.1, 2.8, 3]]);
}

/** A patio umbrella standing at screen point (x, y), leaning by tilt degrees, one panel missing. */
function umbrella([x, y], tilt, col) {
  const top = y - 34;
  const rx = 19;
  const ry = 8.5;
  let back = ['', ''];
  let front = ['', ''];
  for (let k = 0; k < 8; k++) {
    if (k === 6) continue;
    const a0 = (k * Math.PI) / 4;
    const a1 = ((k + 1) * Math.PI) / 4;
    const d = `M${N(x)} ${N(top - 7)}L${N(x + Math.cos(a0) * rx)} ${N(top + Math.sin(a0) * ry)}L${N(x + Math.cos(a1) * rx)} ${N(top + Math.sin(a1) * ry)}Z`;
    const into = Math.sin((a0 + a1) / 2) < 0 ? back : front;
    into[k % 2] += d;
  }
  const pole = stick(`M${N(x)} ${N(y)}V${N(top - 9)}`, '#b9b4a6', 1.8, 1.8);
  const fill = (pair) => path(pair[0], col, { sw: 1.5 }) + path(pair[1], '#efe5cf', { sw: 1.5 });
  return ell(x + 4, y, 10, 4, O, { op: 0.12 }) + g(fill(back) + pole + fill(front) + circ(x, top - 8, 2, col, { sw: 1.2 }), { tf: `rotate(${tilt} ${N(x)} ${N(y)})` });
}

function stage(P, name, r, pal) {
  const plankC = '#b59e78';
  const wall = pal.wall;
  let s = shadowQ(P, 0.3, 0.35, 2.7, 2.65, 0.25) + weeds(P, [[0.2, 1.4, 1.1], [1.6, 0.22, 0.9]]);
  // The platform: plank floor with a hole, steps at the front.
  s += box(P, 0.3, 0.35, 2.7, 2.65, 0, 12, plankC, { top: '#c9b48e' });
  let fl = '';
  for (let k = 1; k < 8; k++) fl += seg(P(0.32, 0.35 + k * 0.29, 12), P(2.68, 0.35 + k * 0.29, 12));
  s += line(fl, dk(plankC, 0.15), 1.1) + poly(flat(P, 1.85, 1.95, 2.25, 2.24, 12), DARK, { sw: 1.3 });
  s += box(P, 1.15, 2.65, 1.85, 2.9, 0, 6, '#a88f68', { sw: 1.5 });
  // The bandshell: a wall at the back with an arched top, curtain below, the name across the arch.
  const n = 12;
  const arc = (q) => Array.from({ length: n + 1 }, (_, k) => P(0.3 + (2.4 * k) / n, q, 50 + 22 * Math.sin((Math.PI * k) / n)));
  s += poly(arc(0.55).concat(arc(0.35).reverse()), lt(wall, 0.2), { sw: 1.8 });
  s += poly([P(2.7, 0.55, 12), P(2.7, 0.35, 12), P(2.7, 0.35, 50), P(2.7, 0.55, 50)], dk(wall, 0.24), { sw: 1.8 });
  s += poly([P(0.3, 0.55, 12), P(2.7, 0.55, 12)].concat(arc(0.55).reverse()), wall, { sw: 2 });
  s += line('M' + arc(0.55).slice(1, n).map((q) => pt([q[0], q[1] + 5])).join('L'), dk(wall, 0.18), 3);
  const CQ = 0.56;
  const zb = [16, 14, 22, 15, 13, 26, 16, 14, 18, 15];
  let cd = '';
  for (let k = 0; k <= 9; k++) cd += (k ? 'L' : 'M') + pt(P(0.55 + (k * 1.9) / 9, CQ, zb[k]));
  cd += `L${pt(P(2.45, CQ, 46))}L${pt(P(0.55, CQ, 46))}Z`;
  const cur = tired(pal.alt ? '#b46a62' : pick(r, ['#6f8fb8', '#8a6fb0', '#5f9a7a']), 0.1);
  s += path(cd, cur, { sw: 1.8 });
  let folds = '';
  for (let k = 1; k < 9; k++) folds += seg(P(0.55 + (k * 1.9) / 9, CQ, 44), P(0.55 + (k * 1.9) / 9, CQ, zb[k] + 2));
  s += line(folds, dk(cur, 0.22), 1.3) + poly(onL(P, CQ, 0.5, 2.5, 44, 49), dk(cur, 0.22), { sw: 1.5 });
  // Torn bunting between the speakers, hung low so the name stays clear.
  const b0 = P(0.56, 2.38, 35);
  const b1 = P(2.44, 1.02, 33);
  s += line(`M${pt(b0)}Q${N((b0[0] + b1[0]) / 2)} ${N((b0[1] + b1[1]) / 2 + 14)} ${pt(b1)}`, O, 1.1);
  const bcol = [pal.trim, '#d9c27a', '#8fb0c9', '#b4a0c8'];
  for (let k = 0; k < 6; k++) {
    if (k === 3) continue;
    const t = (k + 0.5) / 6;
    const x = b0[0] + (b1[0] - b0[0]) * t;
    const y = b0[1] + (b1[1] - b0[1]) * t + 28 * t * (1 - t) - 1;
    s += path(`M${N(x - 3)} ${N(y)}L${N(x + 3)} ${N(y + 1.5)}L${N(x - 0.5)} ${N(y + 7)}Z`, bcol[k % 4], { sw: 1 });
  }
  const sc = P(1.5, CQ, 60);
  s += faceSign(sc[0], sc[1], 80, 19, name, { rot: -4, size: 12, bg: pal.bg, ink: pal.ink });
  // On the stage: a pup tent (camp), a spring rider (playground) or a drum; then speakers, a mic.
  s += box(P, 2.24, 0.62, 2.64, 1.02, 12, 32, '#5f5c62', { sw: 1.8 }) + path(epath([[...P(2.44, 1.02, 27), 3.6, 3.6], [...P(2.44, 1.02, 19), 5, 5]]), '#3a373c', { sw: 1.3 });
  if (/CAMP|SCOUT|TENT/.test(name)) {
    const tc = tired('#e9a23b', 0.2);
    s += poly([P(0.9, 1.25, 12), P(0.9, 1.85, 12), P(1.25, 1.55, 34)], dk(tc, 0.2), { sw: 1.8 }) + poly([P(0.9, 1.85, 12), P(1.6, 1.85, 12), P(1.6, 1.55, 34), P(1.25, 1.55, 34)], tc, { sw: 1.8 });
    s += poly([P(1.6, 1.85, 12), P(1.6, 1.25, 12), P(1.6, 1.55, 34)], dk(tc, 0.3), { sw: 1.8 }) + poly([P(1.6, 1.75, 12), P(1.6, 1.55, 30), P(1.6, 1.62, 12)], DARK);
  } else if (/PLAY|PARK|KIDS/.test(name)) {
    const dc = tired('#ffd23f', 0.2);
    const [x, y] = P(1.25, 1.55, 12);
    s += line(`M${x} ${y}q-6 -4 0 -7q6 -3 0 -7`, '#8f969a', 2.6) + path(`M${x - 13} ${y - 18}q2 -9 12 -8q3 -9 10 -5q6 4 0 8l3 3q-3 3 -6 1q-2 8 -17 3z`, dc, { sw: 1.8 }) + circ(x + 2, y - 26, 1.4, O) + path(`M${x + 8} ${y - 24}l6 1l-5 3z`, tired('#ff9a3c', 0.2), { sw: 1.2 });
    s += circ(...P(1.95, 2.3, 18), 6, tired('#3d8bf0', 0.3), { sw: 1.6 }) + line(`M${pt(P(1.95, 2.3, 24))}q4 6 0 12`, '#f3eadb', 1.6);
  } else {
    const dc = P(1.25, 1.45, 18);
    s += ell(dc[0], dc[1], 9, 6, tired('#d8584c', 0.2), { sw: 1.8 }) + ell(dc[0] + 2, dc[1] - 0.5, 6, 4, '#efe6d6', { sw: 1.3 });
  }
  s += stick(seg(P(1.6, 1.95, 12.5), P(2.35, 2.45, 13)), '#9aa0a6', 1.6, 1.6) + circ(...P(2.38, 2.47, 14), 2.6, '#4a464c', { sw: 1.2 });
  s += box(P, 0.36, 1.98, 0.76, 2.38, 12, 34, '#5f5c62', { sw: 1.8 }) + path(epath([[...P(0.56, 2.38, 28), 3.6, 3.6], [...P(0.56, 2.38, 20), 5, 5]]), '#3a373c', { sw: 1.3 });
  s += vine(P, 'L', 0.55, 2.5, 12, 40, 0.1);
  return s + weeds(P, [[0.4, 2.85, 1], [2.85, 2.3, 0.9], [2.85, 1.1, 1.1], [1.0, 2.88, 0.8], [2.4, 2.88, 0.9]]);
}

function silo(P, name, r, pal) {
  let s = shadowQ(P, 0.9, 0.3, 2.6, 2.0, 0.4) + weeds(P, [[0.6, 1.3, 1.1], [2.3, 0.2, 0.8], [1.2, 0.5, 0.9]]);
  // The silo: a corrugated cylinder, rust bands, a domed cap and a ladder.
  const [cx, cy] = P(1.85, 1.05);
  const rx = 0.74 * 45.25;
  const ry = 0.74 * 22.63;
  const Hs = 112;
  const ty = cy - Hs;
  const N0 = 10;
  const sil = tired(pal.alt ? '#c3c1ab' : '#b9c4c6', 0.15);
  for (let k = 0; k < N0; k++) {
    const a0 = Math.PI - (k * Math.PI) / N0;
    const a1 = Math.PI - ((k + 1) * Math.PI) / N0;
    const x0 = cx + Math.cos(a0) * rx;
    const x1 = cx + Math.cos(a1) * rx;
    s += poly([[x0, ty + Math.sin(a0) * ry], [x1, ty + Math.sin(a1) * ry], [x1, cy + Math.sin(a1) * ry], [x0, cy + Math.sin(a0) * ry]], mix(sil, dk(sil, 0.4), k / (N0 - 1)));
  }
  let rib = '';
  for (let k = 1; k < N0; k++) {
    const a = Math.PI - (k * Math.PI) / N0;
    const x = cx + Math.cos(a) * rx;
    rib += `M${N(x)} ${N(ty + Math.sin(a) * ry)}V${N(cy + Math.sin(a) * ry)}`;
  }
  s += line(rib, O, 0.8, { op: 0.25 });
  const arc = (y) => `M${N(cx - rx)} ${N(y)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(y)}`;
  s += line(arc(cy - 26) + arc(cy - 58) + arc(cy - 90), tired(pal.trim, 0.3), 2.4, { op: 0.85 });
  s += line(`M${N(cx + rx * 0.25)} ${N(cy - 58 + ry)}l-1 20M${N(cx - rx * 0.55)} ${N(cy - 90 + ry * 0.8)}l1 14`, '#b0663a', 1.6, { op: 0.6 });
  s += path(`M${N(cx - rx)} ${N(ty)}V${N(cy)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(cy)}V${N(ty)}`, 'none', { sw: 2.2 });
  s += path(`M${N(cx + 6)} ${N(cy - 40)}l7 -3l3 6l-2 7l-7 1l-3 -6z`, '#5b3a2a', { sw: 1.3 });
  // The cap.
  const cap = tired(pal.roof, 0.15);
  s += path(`M${N(cx)} ${N(ty - 30)}Q${N(cx - rx * 0.62)} ${N(ty - 24)} ${N(cx - rx - 2)} ${N(ty)}A${N(rx + 2)} ${N(ry + 1)} 0 0 0 ${N(cx)} ${N(ty + ry + 1)}Z`, lt(cap, 0.15));
  s += path(`M${N(cx)} ${N(ty - 30)}Q${N(cx + rx * 0.62)} ${N(ty - 24)} ${N(cx + rx + 2)} ${N(ty)}A${N(rx + 2)} ${N(ry + 1)} 0 0 1 ${N(cx)} ${N(ty + ry + 1)}Z`, dk(cap, 0.12));
  s += path(`M${N(cx - rx - 2)} ${N(ty)}Q${N(cx - rx * 0.62)} ${N(ty - 24)} ${N(cx)} ${N(ty - 30)}Q${N(cx + rx * 0.62)} ${N(ty - 24)} ${N(cx + rx + 2)} ${N(ty)}A${N(rx + 2)} ${N(ry + 1)} 0 0 1 ${N(cx - rx - 2)} ${N(ty)}Z`, 'none', { sw: 2.2 });
  s += line(`M${N(cx - rx * 0.5)} ${N(ty - 14)}Q${N(cx - rx * 0.3)} ${N(ty - 24)} ${N(cx - 4)} ${N(ty - 27)}`, '#ffffff', 2.4, { op: 0.35 });
  s += rect(cx - 4, ty - 37, 8, 8, '#9a8c7c', { sw: 1.6, rx: 1.5 });
  // The ladder, a few rungs missing.
  const lx = cx - rx * 0.55;
  const l0 = cy + ry * 0.8;
  let rungs = `M${N(lx - 4)} ${N(l0)}V${N(ty + 10)}M${N(lx + 4)} ${N(l0 - 1)}V${N(ty + 9)}`;
  for (let y = l0 - 6, k = 0; y > ty + 12; y -= 8, k++) if (k !== 5 && k !== 6) rungs += `M${N(lx - 4)} ${N(y)}h8`;
  s += line(rungs, '#6e6a66', 1.6);
  // The shed with its sloped roof, a barn door, and the name board on top.
  s += box(P, 0.3, 1.55, 1.55, 2.7, 0, 28, pal.wall);
  s += poly(onL(P, 2.7, 0.5, 1.3, 0, 22), '#8a6f56', { sw: 1.8 });
  s += stick(seg(P(0.52, 2.72, 2), P(1.28, 2.72, 20)), BOARD, 3, 2) + stick(seg(P(0.52, 2.72, 20), P(1.28, 2.72, 2)), BOARD2, 3, 2);
  s += boarded(P, 'R', 1.55, 1.85, 2.3, 10, 22, { n: 1 });
  const sr = tired(pal.roof, 0.1);
  s += poly([P(0.22, 1.47, 36), P(1.63, 1.47, 36), P(1.63, 2.78, 27), P(0.22, 2.78, 27)], sr, { sw: 2 });
  s += poly([P(1.63, 1.47, 36), P(1.63, 2.78, 27), P(1.63, 2.78, 24), P(1.63, 1.47, 33)], dk(sr, 0.25), { sw: 1.6 });
  s += poly(onL(P, 2.78, 0.22, 1.63, 24, 27), dk(sr, 0.1), { sw: 1.6 });
  s += stick(seg(P(0.55, 2.4, 30), P(0.55, 2.4, 44)) + seg(P(1.3, 2.4, 30), P(1.3, 2.4, 40)), WOOD_D, 2.2, 1.8);
  const sc = P(0.95, 2.45, 46);
  s += faceSign(sc[0], sc[1], 68, 18, name, { rot: -7, size: 12, bg: pal.bg, ink: pal.ink });
  // A pile of logs, front right.
  const log = (q, z, len = 0.75) => {
    const A = P(2.05, q, z);
    const B = P(2.05 + len, q, z);
    return stick(seg(A, B), '#8f6a48', 8.5, 2.2) + line(seg([A[0] + 1, A[1] - 3], [B[0] - 4, B[1] - 4.5]), '#a98260', 1.4) + ell(B[0], B[1], 4, 4.8, '#e2c58f', { sw: 1.6 }) + ell(B[0], B[1], 1.8, 2.2, 'none', { sw: 0.9, stroke: '#a98260' });
  };
  s += log(2.25, 4.5) + log(2.6, 4.5) + log(2.42, 12, 0.7);
  return s + weeds(P, [[0.25, 2.85, 1], [1.7, 2.75, 0.9], [2.85, 0.6, 1]]);
}

function garage(P, name, r, pal) {
  // An arched (barrel-roof) auto shop: the arch faces you, a roll-up door half open, a pole
  // sign out front and a car up on blocks beside it. Nothing like the flat-roofed shopfront.
  const wall = pal.wall;
  const tin = mix(pal.roof, '#a3a9a6', 0.45);
  const p0 = 0.3;
  const p1 = 2.25;
  const q0 = 0.4;
  const q1 = 2.2;
  const zw = 16;
  const zA = (p) => zw + 32 * Math.sin((Math.PI * (p - p0)) / (p1 - p0));
  let s = shadowQ(P, p0, q0, p1, q1, 0.3) + weeds(P, [[0.15, 1.2, 1.1], [2.0, 0.3, 0.9], [0.5, 0.35, 1]]);
  // The cracked apron with an oil stain.
  s += box(P, 0.15, q1, 2.4, 2.88, 0, 2, '#b3afa1', { sw: 1.4 });
  s += ell(...P(1.3, 2.55, 2), 10, 4, '#3b3430', { op: 0.3 }) + crack([P(1.9, 2.22, 2), P(2.0, 2.5, 2), P(1.92, 2.86, 2)]);
  // The right wall, then the roof in corrugated strips, back to front.
  s += poly(onR(P, p1, q0, q1, 0, zw), dk(wall, 0.24), { sw: 2 });
  s += boarded(P, 'R', p1, 0.8, 1.5, 4, 12, { n: 1 });
  const n = 10;
  const ps = Array.from({ length: n + 1 }, (_, k) => p0 + ((p1 - p0) * k) / n);
  for (let k = 0; k < n; k++) {
    const slope = zA(ps[k + 1]) - zA(ps[k]);
    const c = slope > 4 ? lt(tin, 0.22) : slope > -4 ? lt(tin, 0.08) : dk(tin, 0.08 + Math.min(0.2, -slope / 60));
    s += poly([P(ps[k], q0, zA(ps[k])), P(ps[k + 1], q0, zA(ps[k + 1])), P(ps[k + 1], q1, zA(ps[k + 1])), P(ps[k], q1, zA(ps[k]))], k === 6 ? DARK : c, { sw: 1.4 });
  }
  s += stick(seg(P(ps[6] + 0.1, q0 + 0.3, zA(ps[6]) + 1), P(ps[6] + 0.08, q1 - 0.3, zA(ps[6]) + 1)), WOOD_D, 2, 1.6);
  s += poly([P(1.0, 0.9, zA(1.0) + 0.5), P(1.3, 0.85, zA(1.3) + 0.5), P(1.32, 1.4, zA(1.32) + 0.5), P(1.02, 1.5, zA(1.02) + 0.5)], '#a8673e', { op: 0.6 });
  // The arch you face.
  const arch = ps.map((p) => P(p, q1, zA(p)));
  s += poly([P(p0, q1, 0), P(p1, q1, 0)].concat(arch.reverse()), wall, { sw: 2.2 });
  s += line('M' + ps.slice(1, n).map((p) => pt(P(p, q1, zA(p) - 4))).join('L'), dk(wall, 0.15), 2.4);
  s += ell(...P(1.275, q1, 39), 5.5, 6, DARK, { sw: 1.6 }) + line(`M${pt(P(1.12, q1, 39))}L${pt(P(1.43, q1, 39))}`, '#8f8a80', 1.2);
  // The roll-up door, jammed half open. Inside: the old bus (a depot) or a stack of tyres.
  s += poly(onL(P, q1, 0.6, 1.95, 0, 32), dk(wall, 0.3), { sw: 1.8 }) + poly(onL(P, q1, 0.66, 1.89, 0, 17), '#2f2a2e', { sw: 1.4 });
  if (/BUS|DEPOT|COACH/.test(name)) {
    const y = tired('#f5b82e', 0.25);
    s += poly(onL(P, q1 - 0.02, 0.74, 1.81, 0, 15), y) + poly(onL(P, q1 - 0.02, 0.82, 1.73, 8, 15), '#5d6a72') + path(epath([[...P(0.88, q1, 4), 2.4, 2], [...P(1.67, q1, 4), 2.4, 2]]), '#f3ecd0', { sw: 1 });
  } else {
    s += ell(...P(0.95, q1, 5), 6.5, 6, RUBBER, { sw: 1.4 }) + ell(...P(0.95, q1, 5), 2.5, 2.4, '#8f969a') + stick(seg(P(1.5, q1 - 0.2, 17), P(1.5, q1 - 0.2, 6)), '#8f969a', 1, 1.2);
  }
  s += poly(onL(P, q1, 0.66, 1.89, 17, 31), '#c9c1a4', { sw: 1.5 });
  let corr = '';
  for (let z = 20; z < 31; z += 3) corr += seg(P(0.68, q1, z), P(1.87, q1, z));
  s += line(corr, '#9d957a', 1);
  s += poly(onL(P, q1, 0.66, 1.89, 17, 19.5), O, { op: 0.6 });
  s += vine(P, 'L', q1, 0.42, 0, 28) + vine(P, 'R', p1, 1.9, 0, 15);
  // A car up on blocks beside the shop, wheels long gone.
  const cc = tired(pick(r, WRECK_PAINT), 0.3);
  s += box(P, 2.45, 0.6, 2.6, 0.75, 0, 6, '#9e9a8e', { sw: 1.2 }) + box(P, 2.45, 1.55, 2.6, 1.7, 0, 6, '#9e9a8e', { sw: 1.2 });
  s += box(P, 2.38, 0.45, 2.92, 1.85, 6, 14, cc, { sw: 1.6 }) + box(P, 2.43, 0.85, 2.87, 1.5, 14, 21, cc, { sw: 1.6, top: lt(cc, 0.12) });
  s += poly(onR(P, 2.87, 0.92, 1.43, 15, 20), '#4a4650') + poly(onL(P, 1.5, 2.48, 2.82, 15, 20), '#5a5660');
  s += path(epath([[...P(2.92, 0.72, 5), 2.2, 4], [...P(2.92, 1.58, 5), 2.2, 4]]), '#2f2a2e');
  // A stack of tyres and a drum by the door.
  for (let k = 0; k < 3; k++) {
    const [x, y] = P(2.62, 2.5, k * 6.5);
    s += ell(x, y + 1, 9, 4.5, RUBBER, { sw: 1.5 }) + ell(x, y - 2, 9, 4.5, TYRE, { sw: 1.5 }) + ell(x, y - 2, 3.6, 1.7, '#1f1a20');
  }
  // The pole sign out front (the board hangs right of its pole), pennants on a car lot.
  const pole = P(0.3, 2.62);
  s += stick(`M${pt(pole)}V${N(pole[1] - 78)}`, '#8f969a', 3, 2.2);
  const sc = [pole[0] + 26, pole[1] - 82];
  s += faceSign(sc[0], sc[1], 64, 24, name, { rot: -4, size: 13, bg: pal.bg, ink: pal.ink, bulbs: true });
  if (/CAR|AUTO|MOTOR|USED/.test(name)) {
    const a = [pole[0], pole[1] - 60];
    const b = P(1.6, q1, zA(1.6) - 2);
    s += line(`M${pt(a)}Q${N((a[0] + b[0]) / 2)} ${N((a[1] + b[1]) / 2 + 12)} ${pt(b)}`, O, 1.1);
    const pc = [pal.trim, '#d9c27a', '#8fb0c9'];
    for (let k = 0; k < 5; k++) {
      const t = (k + 0.6) / 5.6;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t + 24 * t * (1 - t);
      s += path(`M${N(x - 3)} ${N(y)}L${N(x + 3)} ${N(y + 1.5)}L${N(x)} ${N(y + 8)}Z`, pc[k % 3], { sw: 1 });
    }
  }
  s += weeds(P, [[0.2, 2.5, 1], [2.85, 2.0, 0.9], [1.45, 2.9, 0.8], [2.8, 0.3, 1]]);
  return s + rubble(P, [[0.5, 2.78, 2]]);
}

const RUIN_ART = { shopfront, house, stand, stage, silo, garage };

/**
 * A ruined 3×3 building in a wild lot. archetype: shopfront | house | stand | stage |
 * silo | garage (anything else draws a house). Options:
 *   name    the short text on its crooked sign (e.g. "DINER"); upper-cased, at most 16
 *           characters, squeezed to fit. Keywords add a rooftop giant or a touch
 *           (BURGER, GOLF, FARM, BOAT, DINER, PHARMACY, SCHOOL, PINE, MOTEL, BUS, CAR, CAMP, PLAY).
 *   seed    picks the wall, roof, trim and sign paint and swaps a few props; defaults to
 *           a hash of the archetype and name, so every lot looks its own.
 *   faded   bake a pale, opaque far-away version (use instead of CSS opacity).
 * Returns { svg, artH, bodyH } (viewBox 192 × artH).
 */
export function ruinArt(archetype = 'house', opts) {
  const { name, seed, faded = false } = opts || {};
  const k = Object.prototype.hasOwnProperty.call(RUIN_ART, archetype) ? archetype : 'house';
  const H = RUIN_H[k];
  const P = iso(3, 3, H);
  const label = String(name == null ? '' : name).toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 16) || RUIN_NAME[k];
  const sd = seed == null || seed === '' ? hash(`${k}|${label}`) : Number.isFinite(+seed) ? +seed : hash(String(seed));
  const r = rng(sd);
  const pal = ruinPalette(r);
  GRID = 1;
  let body;
  try {
    body = yard(P, r) + RUIN_ART[k](P, label, r, pal);
  } finally {
    GRID = 2;
  }
  let svg = `<svg ${ROOT} viewBox="0 0 192 ${H}" class="ruin ruin-${k}">${body}</svg>`;
  if (faded) svg = fade(svg, FADE_K);
  return { svg, artH: H, bodyH: RUIN_BODY[k] };
}

// --- Mystery heap -------------------------------------------------------------------------------

/**
 * A 3×3 lumpy heap under a dusty violet tarp with a big painted "?", tied down with rope.
 * It covers about 85% of the footprint and its hem stays inside the diamond, so whatever
 * stands on the tiles beside it is never cut. Options: faded (a pale far-away version).
 * Returns { svg, artH: 150, bodyH: 70 }.
 */
export function mysteryArt(opts) {
  const faded = !!(opts && opts.faded);
  const H = 150;
  const B = H - 48; // y of the footprint's left/right corners; the diamond is (96, B ± 48), (0 | 192, B)
  let s = path(`M18 ${B + 3}Q96 ${B - 30} 176 ${B + 3}L96 ${B + 42}Z`, O, { op: 0.14 });
  // What pokes out from under the tarp (drawn first): a bike wheel, a lamp, a chair leg, a crate.
  s += circ(150, B - 66, 15, 'none', { sw: 4.6 }) + circ(150, B - 66, 15, 'none', { sw: 2.4, stroke: '#b9bfc6' }) + line(`M150 ${B - 81}v30M135 ${B - 66}h30M140 ${B - 77}l20 22`, '#8f969a', 1.2);
  s += stick(`M58 ${B - 76}L44 ${B - 104}`, '#9aa0a6', 2.4, 2) + path(`M34 ${B - 104}q10 -12 21 -2l-3 5h-15z`, '#7fb8a8', { sw: 1.8 });
  s += stick(`M168 ${B - 22}l11 -10`, WOOD, 3, 2) + box(iso(3, 3, H), 2.15, 0.75, 2.62, 1.2, 0, 20, '#d88a4a', { sw: 1.8 });
  // The tarp: a lumpy silhouette over a fridge (left), a round thing (middle) and a box (right).
  const top = [[18, B + 2], [16, B - 22], [24, B - 58], [36, B - 72], [56, B - 74], [70, B - 68], [84, B - 84], [104, B - 90], [124, B - 82], [138, B - 64], [156, B - 52], [170, B - 34], [178, B - 8], [176, B + 4]];
  let d = smooth(top, false);
  // The hem: a wavy line that keeps inside y < B + 48 − |x − 96| / 2 (the front edges).
  const hem = [[160, B + 14], [140, B + 25], [118, B + 34], [96, B + 37], [74, B + 32], [52, B + 22], [32, B + 12]];
  let prev = top[top.length - 1];
  for (const h of hem) {
    d += `Q${N((prev[0] + h[0]) / 2)} ${N((prev[1] + h[1]) / 2 + 3)} ${h[0]} ${h[1]}`;
    prev = h;
  }
  d += `Q${N((prev[0] + 18) / 2)} ${N((prev[1] + B + 2) / 2 + 2)} 18 ${B + 2}Z`;
  const base = '#8a79bf';
  s += path(d, base);
  // Shading (right side darker), a highlight, folds and a seam.
  s += path(`M104 ${B - 90}Q124 ${B - 82} 138 ${B - 64}Q156 ${B - 52} 170 ${B - 34}Q178 ${B - 8} 176 ${B + 4}Q168 ${B + 9} 160 ${B + 14}Q140 ${B + 25} 118 ${B + 34}Q124 ${B - 4} 116 ${B - 40}Q110 ${B - 70} 104 ${B - 90}Z`, '#6c5ca3');
  s += path(`M28 ${B - 50}Q36 ${B - 70} 56 ${B - 70}Q42 ${B - 58} 36 ${B - 34}Z`, '#ab9ee0', { op: 0.8 }) + path(`M80 ${B - 76}Q92 ${B - 88} 104 ${B - 86}Q90 ${B - 80} 86 ${B - 70}Z`, '#ab9ee0', { op: 0.7 });
  s += line(`M70 ${B - 68}Q74 ${B - 30} 70 ${B + 31}M138 ${B - 62}Q146 ${B - 24} 142 ${B + 22}M36 ${B - 70}Q40 ${B - 30} 34 ${B + 12}`, '#4c3f80', 1.6, { op: 0.45 });
  s += path(d, 'none', { sw: 2.8 });
  // The big painted question mark.
  s += `<text x="98" y="${B + 8}" ${FONT} font-size="62" text-anchor="middle" fill="#ffd23f" stroke-width="3.4" paint-order="stroke" transform="rotate(-6 98 ${B - 16})">?</text>`;
  // Ropes over the top, pegged inside the hem; two little sandbags.
  for (const rd of [`M26 ${B + 4}Q66 ${B - 96} 140 ${B - 62}`, `M70 ${B + 30}Q120 ${B - 34} 170 ${B - 30}`]) s += line(rd, O, 4.4) + line(rd, '#e3c48c', 2.6) + line(rd, '#b8955a', 2.6, { dash: '2 4' });
  s += path(`M104 ${B + 27}q2 -8 12 -8q10 0 11 8q-1 5 -12 5q-10 0 -11 -5zM40 ${B + 12}q2 -7 10 -7q9 0 10 7q-1 5 -10 5q-9 0 -10 -5z`, '#c9b98c', { sw: 1.8 });
  // Something glints.
  s += g(path(sparkleD(118, B - 96, 6) + sparkleD(30, B - 74, 4), '#fff6c8', { sw: 1.2 }), { cls: 'mystery-sparkle' });
  let svg = `<svg ${ROOT} viewBox="0 0 192 ${H}" class="mystery"><style>${TWINKLE}</style>${s}</svg>`;
  if (faded) svg = fade(svg, FADE_K);
  return { svg, artH: H, bodyH: 70 };
}

/** The sparkle's twinkle, embedded (map objects are <img>s, out of the page CSS's reach). */
const TWINKLE = '@keyframes lsTw{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.45)}}.junk-sparkle path,.mystery-sparkle path{transform-box:fill-box;transform-origin:center;animation:lsTw 1.7s ease-in-out infinite}.junk-sparkle path+path,.mystery-sparkle path+path{animation-delay:-.8s}';

// --- Junk piles ---------------------------------------------------------------------------------

/**
 * A 1×1 junk pile on a dirt mound: 0 crates + a tyre + a cone, 1 planks + a hubcap + a paint
 * can, 2 a shopping cart + bags. One candy-bright accent each, and a twinkling sparkle so it
 * reads as tappable. Returns { svg, artH: 64, bodyH: 30 }.
 */
export function junkArt(variant = 0) {
  const v = ((int(Math.round(+variant || 0)) % 3) + 3) % 3;
  const H = 64;
  const P = iso(1, 1, H);
  // A wide dirt mound hugging the diamond (corners (2, 48), (32, 63), (62, 48)).
  let s = path(`M4 ${H - 16}Q5 ${H - 21} 14 ${H - 23}Q32 ${H - 29} 50 ${H - 23}Q60 ${H - 21} 60 ${H - 16}Q50 ${H - 7} 32 ${H - 3}Q14 ${H - 7} 4 ${H - 16}Z`, '#a88a5e', { sw: 1.8 });
  s += path(`M9 ${H - 14}Q19 ${H - 8} 32 ${H - 6}Q45 ${H - 8} 55 ${H - 14}Q45 ${H - 10} 32 ${H - 8}Q19 ${H - 10} 9 ${H - 14}Z`, '#8d7149') + path(epath([[14, H - 14, 2.4, 1.4], [49, H - 13, 2, 1.2], [26, H - 8, 1.8, 1]]), '#c9b28a', { sw: 0.9 });
  if (v === 0) {
    // Crates (one mint-painted, on top), a tyre leaning on them, a red-and-white cone.
    s += box(P, 0.12, 0.22, 0.62, 0.72, 2, 19, WOOD, { sw: 1.8, top: WOOD_L });
    s += line(seg(P(0.12, 0.72, 10), P(0.62, 0.72, 10)) + seg(P(0.62, 0.72, 10), P(0.62, 0.22, 10)), WOOD_D, 1.3);
    s += box(P, 0.2, 0.3, 0.55, 0.62, 19, 31, '#4fd1b5', { sw: 1.8 }) + poly(onL(P, 0.62, 0.28, 0.48, 22, 28), '#fff1a6', { sw: 1.1 });
    const [x, y] = P(0.82, 0.62, 2);
    s += ell(x - 1, y - 6, 7.5, 11, RUBBER, { sw: 1.8, tf: `rotate(-18 ${x - 1} ${y - 6})` }) + ell(x - 1, y - 6, 3, 5, '#1f1a20', { tf: `rotate(-18 ${x - 1} ${y - 6})` });
    const [cx, cy] = P(0.3, 0.92, 1);
    s += path(`M${cx - 7} ${cy}h14l-5 -18h-4z`, '#ff6a3c', { sw: 1.7 }) + path(`M${cx - 4.2} ${cy - 7}h8.4l-1 -4h-6.4z`, '#ffffff') + ell(cx, cy, 8, 2.4, '#e2552e', { sw: 1.4 });
  } else if (v === 1) {
    // A heap of planks crossed every which way, a shiny hubcap, a tipped yellow paint can.
    const pl = (a, b, c, w = 4.6) => stick(seg(a, b), c, w, 2.4) + line(seg([a[0] + 1, a[1] - 1.2], [b[0] - 1, b[1] - 1.2]), lt(c, 0.25), 1.2);
    s += pl(P(0.15, 0.55, 3), P(0.85, 0.35, 5), '#c48a52') + pl(P(0.25, 0.2, 4), P(0.6, 0.85, 4), '#d9a86a');
    s += pl(P(0.1, 0.8, 4), P(0.62, 0.18, 20), '#e2b97c', 5) + pl(P(0.72, 0.85, 3), P(0.38, 0.22, 17), '#b98247', 5);
    s += circ(...P(0.52, 0.28, 18), 1.1, '#5b4636');
    const [x, y] = P(0.78, 0.82, 10);
    s += ell(x, y, 9.5, 9.5, '#c9ced6', { sw: 1.8 }) + ell(x, y, 6.2, 6.2, '#e9edf2', { sw: 1.1 }) + circ(x, y, 2.2, '#9aa3ad', { sw: 1 });
    let sp = '';
    for (let k = 0; k < 5; k++) {
      const an = (k * 2 * Math.PI) / 5;
      sp += `M${N(x + Math.cos(an) * 2.6)} ${N(y + Math.sin(an) * 2.6)}L${N(x + Math.cos(an) * 5.8)} ${N(y + Math.sin(an) * 5.8)}`;
    }
    s += line(sp, '#9aa3ad', 1.1) + path(`M${N(x - 5)} ${N(y - 5)}q3 -3 7 -2.6`, 'none', { sw: 1.5, stroke: '#ffffff' });
    const [px, py] = P(0.2, 0.9, 2);
    s += path(`M${px - 2} ${py - 3}q6 4 13 1l-1 5q-6 3 -12 0z`, '#ffd23f', { op: 0.9 });
    s += path(`M${px - 10} ${py - 4}l12 -6l3 7l-12 6z`, '#ffd23f', { sw: 1.7 }) + ell(px + 3.5, py - 6.5, 2.4, 4, '#f5b82e', { sw: 1.4, tf: `rotate(-26 ${px + 3.5} ${py - 6.5})` }) + line(`M${px - 8} ${py - 6}l8 -4`, '#e8483f', 2);
  } else {
    // A tipped shopping cart with a bag in it, a candy-pink bag and a blue one beside, a box.
    const cart = (p0, q0, p1, q1, z0, z1) => {
      let c = poly(onR(P, p1, q0, q1, z0, z1), '#dfe4ea', { op: 0.35 }) + poly(onL(P, q1, p0, p1, z0, z1), '#dfe4ea', { op: 0.45 });
      let grid = '';
      for (let k = 1; k < 4; k++) grid += seg(P(p0 + ((p1 - p0) * k) / 4, q1, z0), P(p0 + ((p1 - p0) * k) / 4, q1, z1)) + seg(P(p1, q0 + ((q1 - q0) * k) / 4, z0), P(p1, q0 + ((q1 - q0) * k) / 4, z1));
      c += line(grid, '#8f98a3', 1);
      c += path(`M${pt(P(p0, q0, z1))}L${pt(P(p1, q0, z1))}L${pt(P(p1, q1, z1))}L${pt(P(p0, q1, z1))}ZM${pt(P(p0, q1, z0))}L${pt(P(p1, q1, z0))}L${pt(P(p1, q0, z0))}`, 'none', { sw: 1.8, stroke: '#5f6873' });
      c += line(seg(P(p0, q1, z0), P(p0, q1, z1)) + seg(P(p1, q1, z0), P(p1, q1, z1)) + seg(P(p1, q0, z0), P(p1, q0, z1)), '#5f6873', 1.8);
      c += stick(seg(P(p0 - 0.08, q0, z1 + 3), P(p0 - 0.08, q1, z1 + 3)), '#e8483f', 2.4, 1.8);
      for (const [p, q] of [[p0 + 0.05, q1], [p1, q1], [p1, q0 + 0.05]]) c += line(seg(P(p, q, z0), P(p, q, 3)), '#5f6873', 1.4) + circ(...P(p, q, 2.5), 2.4, '#3a3a40', { sw: 1 });
      return c;
    };
    const bag = (x, y, c, k = 1) => path(`M${N(x - 7 * k)} ${N(y)}q-2 -11 2 -15q5 -2 10 0q4 4 2 15q-7 3 -14 0z`, c, { sw: 1.7 }) + path(`M${N(x - 3 * k)} ${N(y - 15 * k)}q1 -5 3 -1M${N(x + 1 * k)} ${N(y - 15 * k)}q2 -5 3 0`, 'none', { sw: 1.4 }) + path(`M${N(x - 4 * k)} ${N(y - 11 * k)}q1 -2 3 -2.5`, 'none', { sw: 1.2, stroke: '#ffffff' });
    s += box(P, 0.62, 0.52, 0.94, 0.84, 1, 11, '#c9a06a', { sw: 1.6, top: '#e0bd86' }) + line(seg(P(0.78, 0.52, 11), P(0.78, 0.84, 11)), '#9a7444', 1.2);
    s += g(cart(0.1, 0.15, 0.62, 0.62, 10, 25) + bag(30, 29, '#f6f2ea'), { tf: `rotate(-9 32 ${H - 30})` });
    s += bag(15, H - 14, '#ff8fc0') + bag(46, H - 12, '#6fb8ff', 0.9);
  }
  s += g(path(sparkleD(53, 9, 6.5), '#fff6c8', { sw: 1.3 }) + path(sparkleD(42, 4, 3), '#fff6c8', { sw: 1 }), { cls: 'junk-sparkle' });
  return { svg: `<svg ${ROOT} viewBox="0 0 64 ${H}" class="junk junk-${v}"><style>${TWINKLE}</style>${s}</svg>`, artH: H, bodyH: 30 };
}

// --- Scenery ------------------------------------------------------------------------------------

/** The scenery's world rect: wide enough for the camera's whole roam at zoom 0.35 on big screens. */
const SC = { L: -2800, T: -1300, R: 2800, B: 2250 };
/** The meadow under everything; every edge of the rect fades to it (use it as the page colour). */
const GR = '#93ba67';
const I = Math.round;
const IP = (a) => `${I(a[0])} ${I(a[1])}`;
/** World point of tile (i, j) (fractional allowed), as iso.js tileToWorld. */
const W2 = (i, j) => [(i - j) * 32, (i + j) * 16];
const epathI = (list) => list.map(([x, y, rx, ry]) => `M${I(x - rx)} ${I(y)}a${I(rx)} ${I(ry)} 0 1 0 ${I(2 * rx)} 0a${I(rx)} ${I(ry)} 0 1 0 ${I(-2 * rx)} 0`).join('');

/** A pine: trunk and three tiers, about 84 px tall at scale 1, its foot at (0, 0). */
function pineSym(main, shade, ol) {
  let a = '';
  let b = '';
  for (const [y0, y1, w] of [[-50, -8, 21], [-66, -30, 16], [-82, -50, 11]]) {
    a += `M0 ${y0}L${-w} ${y1}Q0 ${y1 + 6} ${w} ${y1}Z`;
    b += `M0 ${y0}L${w} ${y1}Q${w * 0.5} ${y1 + 4.5} 0 ${y1 + 6}Z`;
  }
  // Tiers back to front, so each outline sits over the tier above it.
  const tiers = a.split('Z').filter(Boolean).reverse();
  let p = rect(-2.6, -12, 5.2, 12, '#7a5a3e', { sw: 1.2, stroke: ol });
  const shades = b.split('Z').filter(Boolean).reverse();
  tiers.forEach((t, k) => (p += path(t + 'Z', main, { sw: 1.6, stroke: ol }) + path(shades[k] + 'Z', shade)));
  return p;
}

/** A car, its long axis along j (or along i): body, cabin, lights; colour from currentColor. */
function carSym(main, ol, alongI) {
  const C = alongI ? (p, q, z) => [(q - p) * 32 * -1, (p + q) * 16 - z] : (p, q, z) => [(p - q) * 32, (p + q) * 16 - z];
  const b = (p0, q0, p1, q1, z0, z1, cL, cT) => {
    const Lf = [C(p0, q1, z0), C(p1, q1, z0), C(p1, q1, z1), C(p0, q1, z1)];
    const Rf = [C(p1, q1, z0), C(p1, q0, z0), C(p1, q0, z1), C(p1, q1, z1)];
    const Tf = [C(p0, q0, z1), C(p1, q0, z1), C(p1, q1, z1), C(p0, q1, z1)];
    return poly(Lf, cL, { sw: 1.3, stroke: ol }) + poly(Rf, cL, { sw: 1.3, stroke: ol }) + poly(Rf, '#000000', { op: 0.22 }) + poly(Tf, cT, { sw: 1.3, stroke: ol }) + poly(Tf, '#ffffff', { op: 0.22 });
  };
  let c = ell(4, 2, 30, 13, O, { op: 0.14 });
  for (const q of [-0.42, 0.42]) c += ell(...C(0.33, q, 3), 3.4, 4, '#2f2b30');
  c += b(-0.32, -0.7, 0.32, 0.7, 2.5, 11, main, main);
  c += b(-0.27, -0.36, 0.27, 0.3, 11, 19, '#cfdde2', main);
  c += poly([C(-0.27, 0.3, 11), C(0.27, 0.3, 11), C(0.27, 0.3, 13), C(-0.27, 0.3, 13)], main);
  c += poly([C(-0.25, 0.7, 6), C(-0.1, 0.7, 6), C(-0.1, 0.7, 8.5), C(-0.25, 0.7, 8.5)], '#f3e6b0') + poly([C(0.1, 0.7, 6), C(0.25, 0.7, 6), C(0.25, 0.7, 8.5), C(0.1, 0.7, 8.5)], '#f3e6b0');
  return c;
}

/** The scenery as an ordered list of [x0, y0, x1, y1, svg] items (world px) plus shared defs. */
function sceneryModel() {
  const { L, T, R, B } = SC;
  const r = rng(20261108);
  const items = [];
  const add = (x0, y0, x1, y1, str) => str && items.push([x0, y0, x1, y1, str]);
  const addPts = (pts, str, pad = 0) => {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    add(b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad, str);
  };
  let defs = '';
  const all = (str) => add(L, T, R, B, str);

  // 1. The meadow, with big soft patches of lighter and darker grass.
  all(`<rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="${GR}"/>`);
  let mL = '';
  let mD = '';
  for (let k = 0; k < 28; k++) {
    const x = L + 250 + r() * (R - L - 500);
    const y = T + 450 + r() * (B - T - 800);
    const rx = 110 + r() * 230;
    if (k % 2) mL += epathI([[x, y, rx, rx * 0.45]]);
    else mD += epathI([[x, y, rx * 0.8, rx * 0.36]]);
  }
  all(path(mL, '#a2c47a', { op: 0.35 }) + path(mD, '#86ad5e', { op: 0.3 }));

  // 2. Far away: a ridge, the big hill behind the town with its letters, two hazy cities.
  const ridge = [[L - 50, -300], [-2300, -470], [-1900, -420], [-1500, -560], [-1100, -480], [-800, -560], [-400, -600], [0, -640], [400, -610], [800, -540], [1150, -600], [1500, -500], [1900, -560], [2300, -450], [R + 50, -340], [R + 50, 60], [L - 50, 60]];
  // The ridge fades out at its foot, so no edge shows where the forest doesn't cover it.
  defs += `<linearGradient id="${ID}r" gradientUnits="userSpaceOnUse" x1="0" y1="-420" x2="0" y2="80"><stop offset="0" stop-color="#a7c495"/><stop offset="1" stop-color="#a7c495" stop-opacity="0"/></linearGradient>`;
  addPts(ridge, path(smooth(ridge, true, I), `url(#${ID}r)`));
  const hill = [[-640, -150], [-470, -300], [-280, -470], [-70, -560], [150, -548], [370, -450], [560, -290], [700, -150], [700, 40], [-640, 40]];
  addPts(hill, path(smooth(hill, true, I), '#9cbd85') + path(`M150 -548Q290 -500 370 -450Q500 -370 560 -290Q640 -210 700 -150L700 40L230 40Q350 -200 150 -548Z`, '#8db177') + path(`M-440 -320Q-300 -470 -130 -540Q-290 -420 -360 -300Z`, '#b2cf98', { op: 0.7 }));
  add(-330, -520, 330, -380, `<text x="0" y="-420" ${FONT} font-size="44" letter-spacing="6" text-anchor="middle" fill="#f4f1e6" stroke="#6f7c66" stroke-width="3" paint-order="stroke" transform="rotate(-3 0 -430)">PINECONE LAKE</text>` + line('M-300 -418h600', '#7d6a50', 2, { dash: '4 34' }));
  add(-200, -380, 300, -150, line('M-180 -170Q-60 -230 40 -260Q170 -300 120 -360Q90 -390 160 -400', '#c9c09a', 5, { op: 0.8 }));
  // The cities: little iso towers far off (scaled down), a paler row behind, smoke drifting right.
  const city = (cx, cy, n, seed) => {
    const rr = rng(seed);
    const k = 0.5;
    const blocks = [];
    for (let t = 0; t < n; t++) {
      const p = (rr() - 0.5) * 8;
      const q = (rr() - 0.5) * 3.5;
      const tall = Math.max(0, 1 - Math.hypot(p / 6, q / 3));
      blocks.push([p, q, 0.8 + rr() * 0.7, 0.8 + rr() * 0.7, 70 + tall * 330 * (0.45 + rr() * 0.55)]);
    }
    blocks.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    const P = (pp, qq, z = 0) => [cx + (pp - qq) * 32 * k, cy + (pp + qq) * 16 * k - z * k];
    let s = '';
    // The far row: one flat, pale silhouette.
    let far = '';
    for (let x = -230; x < 230; x += 14 + rr() * 12) far += `M${I(cx + x)} ${I(cy - 60)}v-${I((40 + rr() * 110) * (1 - Math.abs(x) / 400))}h${I(12 + rr() * 10)}V${I(cy - 60)}Z`;
    s += path(epathI([[cx + 10, cy + 8, 190, 60]]), '#b9bfae', { op: 0.6 }) + path(far, '#c3ccd0');
    const smokeAt = [];
    for (const [p, q, a, b, h] of blocks) {
      const col = pick(rr, ['#a9b6bf', '#b3bcc0', '#9fadb8', '#b8b4ae', '#a7b4ae']);
      s += poly([P(p, q + b), P(p + a, q + b), P(p + a, q + b, h), P(p, q + b, h)], col) + poly([P(p + a, q + b), P(p + a, q), P(p + a, q, h), P(p + a, q + b, h)], dk(col, 0.18)) + poly([P(p, q, h), P(p + a, q, h), P(p + a, q + b, h), P(p, q + b, h)], lt(col, 0.22));
      // Window columns: a dashed vertical line per column.
      if (h < 160) continue;
      let w = '';
      for (const t of [0.3, 0.7]) {
        const [x0, y0] = P(p + a * t, q + b, 12);
        const [x1, y1] = P(p + a, q + b * (1 - t), 12);
        w += `M${I(x0)} ${I(y0)}v${I(-(h - 22) * k)}M${I(x1)} ${I(y1)}v${I(-(h - 22) * k)}`;
      }
      s += line(w, '#7c8a94', 3, { dash: '3 4', op: 0.85, butt: true });
      if (h > 250 && rr() < 0.6) s += line(`M${IP(P(p + a / 2, q + b / 2, h))}v-${I(36 * k)}`, '#8a969e', 1.6);
      if (h > 200 && smokeAt.length < 3) smokeAt.push(P(p + a / 2, q + b / 2, h));
    }
    for (const [x, y] of smokeAt) {
      let puffs = '';
      for (let t = 0; t < 9; t++) puffs += epathI([[x + t * t * 4 + t * 6, y - 12 - t * 28, 10 + t * 5, 8 + t * 4]]);
      s += path(puffs, '#979da1', { op: 0.45 });
    }
    return s;
  };
  add(-1500, -760, -600, 0, city(-1050, -110, 17, 7));
  add(600, -800, 1550, -40, city(1080, -150, 15, 11));
  // Haze over everything far, so it sits back.
  defs += `<linearGradient id="${ID}h" gradientUnits="userSpaceOnUse" x1="0" y1="${T}" x2="0" y2="320"><stop offset="0" stop-color="${FOG}" stop-opacity="0"/><stop offset=".22" stop-color="${FOG}" stop-opacity=".5"/><stop offset=".62" stop-color="${FOG}" stop-opacity=".42"/><stop offset="1" stop-color="${FOG}" stop-opacity="0"/></linearGradient>`;
  add(L, T, R, 320, `<rect x="${L}" y="${T}" width="${R - L}" height="${320 - T}" fill="url(#${ID}h)"/>`);

  // 3. The pine forest along both back edges (round the left corner above the lake, round
  // the right corner above the highway). Its near edge stays a tile clear of the map.
  const yIn = (x) => (x < -1120 ? 526 - (-1120 - x) * 0.12 : x > 1120 ? Math.min(x / 2 - 34, 1090 - x / 2) : Math.abs(x) / 2 - 34);
  const yOut = (x) => yIn(x) - (290 + 50 * Math.sin(x / 210) + 36 * Math.sin(x / 97 + 1));
  defs += `<pattern id="${ID}w" patternUnits="userSpaceOnUse" width="56" height="40"><rect width="56" height="40" fill="#5b8752"/><path d="M14 2l-11 24h22zM42 22l-11 24h22zM42 -18l-11 24h22z" fill="#6c9a5d"/><path d="M14 2l11 24h-11zM42 22l11 24h-11zM42 -18l11 24h-11z" fill="#527b49"/></pattern>`;
  let mass = '';
  const xs = [];
  for (let x = L - 40; x <= R + 64; x += 64) xs.push(x);
  mass = 'M' + xs.map((x) => `${x} ${I(yIn(x) - 14)}`).join('L');
  for (let k = xs.length - 1; k >= 0; k--) mass += `L${xs[k]} ${I(yOut(xs[k]) + (k % 2 ? 6 : -8))}`;
  add(L, -700, R, 700, path(mass + "Z", `url(#${ID}w)`));
  const KINDS = { n: ['#6c9a5a', '#527c47', '#34492f'], m: ['#7aa56a', '#5f8a54', '#3e573a'], f: ['#8aab84', '#73967a', '#5a775c'] };
  const SIZES = [0.62, 0.74, 0.86, 0.98];
  for (const [kd, [a, b, c]] of Object.entries(KINDS)) {
    defs += `<g id="${ID}${kd}">${pineSym(a, b, c)}</g>`;
    SIZES.forEach((z, n) => (defs += `<use id="${ID}${kd}${n}" href="#${ID}${kd}" transform="scale(${z})"/>`));
  }
  const sizeOf = (k) => SIZES.reduce((best, z, n) => (Math.abs(z - k) < Math.abs(SIZES[best] - k) ? n : best), 0);
  const trees = [];
  const tree = (x, y, k, kd) => trees.push([y, x, sizeOf(k), kd]);
  // Trees fade out with everything else near the rect's edges, so none are drawn there.
  const X0 = L + 420;
  const X1 = R - 420;
  for (let x = X0; x < X1; x += 42 + r() * 18) tree(x, yOut(x) + 14 + r() * 10, 0.66 + r() * 0.2, 'f');
  for (let x = X0; x < X1; x += 40 + r() * 16) {
    tree(x, yIn(x) - 4 - r() * 8, 0.78 + r() * 0.22, r() < 0.5 ? 'n' : 'm');
    tree(x + 19, yIn(x + 19) - 40 - r() * 10, 0.74 + r() * 0.2, r() < 0.5 ? 'n' : 'm');
    if (r() < 0.35) tree(x + 8, yIn(x + 8) - 84 - r() * 30, 0.7 + r() * 0.2, 'm');
    if (r() < 0.12) tree(x + 30, yIn(x + 30) - 160 - r() * 60, 0.7 + r() * 0.2, 'f');
  }
  trees.sort((a, b) => a[0] - b[0]);
  for (const [y, x, n, kd] of trees) add(x - 22, y - 84, x + 22, y + 2, `<use href="#${ID}${kd}${n}" x="${I(x)}" y="${I(y)}"/>`);

  // 4. The verge right under the map's edges: dirt and scruffy grass.
  const rimPts = [];
  for (let k = 0; k < 4; k++) {
    const [ai, aj, bi, bj] = [[-0.9, -0.9, 35.9, -0.9], [35.9, -0.9, 35.9, 35.9], [35.9, 35.9, -0.9, 35.9], [-0.9, 35.9, -0.9, -0.9]][k];
    for (let t = 0; t < 1; t += 1 / 14) {
      const [x, y] = W2(ai + (bi - ai) * t, aj + (bj - aj) * t);
      rimPts.push([x + (r() - 0.5) * 10, y + (r() - 0.5) * 6]);
    }
  }
  addPts(rimPts, path(smooth(rimPts, true, I), '#a9a774', { sw: 6, stroke: '#b5ab7c' }));

  // 5. The lake, front-left: its near shore follows the map's front-left edge a couple of
  // tiles out; it closes well inside the rect. A dock, a rowboat, reeds, lilies, ducks, an islet.
  const lake = [[-1180, 650], [-900, 790], [-600, 940], [-330, 1075], [-110, 1185], [-70, 1290], [-190, 1440], [-470, 1610], [-950, 1700], [-1450, 1650], [-1880, 1470], [-2160, 1190], [-2150, 920], [-1920, 750], [-1520, 660]];
  const lakeD = smooth(lake, true, I);
  addPts(lake, path(lakeD, '#d4c798', { sw: 36, stroke: '#cbbd8c' }) + path(lakeD, '#7db3c8', { sw: 3, stroke: '#5f96ab' }), 20);
  const deep = lake.map(([x, y]) => [-1080 + (x + 1080) * 0.72, 1180 + (y - 1180) * 0.68]);
  addPts(deep, path(smooth(deep, true, I), '#6ea6bd'));
  let rip = '';
  for (let k = 0; k < 34; k++) {
    const x = -2050 + r() * 1900;
    const y = 700 + r() * 950;
    const cx = (x + 1080) / 0.72 - 1080;
    if (Math.hypot((x + 1100) / 1000, (y - 1190) / 470) > 0.92 || y < 560 + (x + 1120) / 2 + 120) continue;
    rip += `M${I(x)} ${I(y)}q8 -4 16 0`;
    void cx;
  }
  add(-2100, 650, -100, 1700, line(rip, '#cfe7ee', 2, { op: 0.75 }));
  add(-1500, 790, -230, 1290, path(`M-760 1060a8 4 0 1 0 6 -3.5zM-748 1068a7 3.5 0 1 0 5 -3zM-1180 900a8 4 0 1 0 6 -3.5zM-300 1200a8 4 0 1 0 6 -3.5zM-1450 820a8 4 0 1 0 6 -3.5zM-1010 1010a8 4 0 1 0 6 -3.5z`, '#7fae6a', { sw: 1, stroke: '#4f7a4a' }));
  // The islet with two pines.
  add(-1400, 1260, -1100, 1420, path(epathI([[-1250, 1360, 90, 40]]), '#d4c798', { sw: 3, stroke: '#b9ab7a' }) + path(epathI([[-1250, 1356, 70, 28]]), '#94b86c'));
  trees.length = 0;
  // The dock (a few tiles out along j from the near shore) and a rowboat.
  const dockS = [-470, 935];
  const dP = (a, b2, z = 0) => [dockS[0] + 27 * a - 32 * 4.4 * b2, dockS[1] + 13.5 * a + 16 * 4.4 * b2 - z];
  let dock = '';
  let posts = '';
  for (const b2 of [0.25, 0.5, 0.75, 1]) for (const a of [0, 1]) posts += seg(dP(a, b2, 3), dP(a, b2, -10));
  dock += line(posts, O, 4.6) + line(posts, '#7d6046', 3);
  dock += poly([dP(1, 0, 5), dP(1, 1, 5), dP(1, 1, 1), dP(1, 0, 1)], '#8f6c4c', { sw: 1.4, stroke: '#4d3a2a' }) + poly([dP(0, 1, 5), dP(1, 1, 5), dP(1, 1, 1), dP(0, 1, 1)], '#b08a62', { sw: 1.4, stroke: '#4d3a2a' });
  dock += poly([dP(0, 0, 5), dP(1, 0, 5), dP(1, 1, 5), dP(0, 1, 5)], '#c9a477', { sw: 1.4, stroke: '#4d3a2a' });
  let pl = '';
  for (let k = 1; k < 14; k++) pl += seg(dP(0, k / 14, 5), dP(1, k / 14, 5));
  dock += line(pl, '#9a7a56', 1);
  const bt = dP(1.8, 0.92);
  dock += path(`M${I(bt[0] - 26)} ${I(bt[1] - 10)}Q${I(bt[0] - 6)} ${I(bt[1] - 2)} ${I(bt[0] + 18)} ${I(bt[1] + 12)}Q${I(bt[0] + 2)} ${I(bt[1] + 16)} ${I(bt[0] - 22)} ${I(bt[1] + 2)}Z`, '#d9e0dc', { sw: 1.6, stroke: '#4d4a48' });
  dock += path(`M${I(bt[0] - 20)} ${I(bt[1] - 6)}Q${I(bt[0] - 4)} ${I(bt[1] + 1)} ${I(bt[0] + 12)} ${I(bt[1] + 10)}Q${I(bt[0])} ${I(bt[1] + 10)} ${I(bt[0] - 16)} ${I(bt[1] + 1)}Z`, '#b9876a') + line(`M${I(bt[0] - 8)} ${I(bt[1] - 2)}l10 8`, '#8a6a4a', 2.4);
  dock += line(`M${IP(dP(1, 0.92, 4))}Q${I(bt[0] - 18)} ${I(bt[1] - 18)} ${I(bt[0] - 22)} ${I(bt[1] - 8)}`, '#c9b58a', 1.2);
  add(-1100, 900, -400, 1280, dock);
  let ducks = '';
  for (const [x, y] of [[-900, 1060], [-876, 1072], [-1600, 1180]]) ducks += ell(x, y, 6, 3.5, '#f1ede2', { sw: 1.1, stroke: '#6f6a60' }) + circ(x + 4, y - 4, 2.6, '#f1ede2', { sw: 1.1, stroke: '#6f6a60' }) + path(`M${x + 6} ${y - 4.5}l3 1l-3 1z`, '#e9a94a');
  add(-1620, 1040, -860, 1200, ducks);
  // Reeds along the near shore and round the islet.
  let reeds = '';
  let tops = '';
  const reedAt = (x0, y0) => {
    for (let n = 0; n < 5; n++) {
      const x = x0 + n * 4 - 8;
      const h = 14 + r() * 12;
      reeds += `M${I(x)} ${I(y0)}q${I((n - 2) * 1.2)} ${I(-h / 2)} ${I((n - 2) * 2)} ${I(-h)}`;
      if (n % 2) tops += `M${I(x + (n - 2) * 2)} ${I(y0 - h - 1)}v-5`;
    }
  };
  for (let k = 0; k < 10; k++) {
    const t = r();
    const [x, y] = [-1150 + t * 1000, 668 + t * 500];
    reedAt(x + (r() - 0.5) * 30, y + 26 + r() * 10);
  }
  for (const [x, y] of [[-1330, 1372], [-1180, 1384], [-1900, 760], [-2050, 860], [-1700, 700]]) reedAt(x, y);
  add(-2100, 640, -100, 1420, line(reeds, '#6f8f45', 1.5) + line(tops, '#8a5a36', 3.2));

  // 6. The jammed highway, front-right: along j at i ≈ 40.5, bending away under the map.
  const cl = [[40.5, -52, 0], [40.5, 30, 0]];
  for (let a = 10; a < 90; a += 10) {
    const rad = (a * Math.PI) / 180;
    cl.push([46.5 - 6 * Math.cos(rad), 30 + 6 * Math.sin(rad), a]);
  }
  cl.push([46.5, 36, 90], [100, 36, 90]);
  const offPt = ([i, j, a], o) => {
    const rad = (a * Math.PI) / 180;
    return W2(i + Math.cos(rad) * o, j - Math.sin(rad) * o);
  };
  const band = (o0, o1) => {
    const A = cl.map((c) => offPt(c, o0));
    const Bk = cl.map((c) => offPt(c, o1)).reverse();
    return A.concat(Bk);
  };
  const lane = (o, from = 0) => 'M' + cl.slice(from).map((c) => IP(offPt(c, o))).join('L');
  const shoulder = band(-2.75, 2.75);
  addPts(shoulder, path('M' + shoulder.map(IP).join('L') + 'Z', '#aaa58c'));
  const asph = band(-2.3, 2.3);
  addPts(asph, path('M' + asph.map(IP).join('L') + 'Z', '#8a8884', { sw: 2, stroke: '#6f6d69' }) + line(lane(-1.15) + lane(1.15), '#e9e6dc', 2.2, { dash: '16 18', op: 0.8 }) + line(lane(0), '#5f5d5a', 7) + line(lane(0), '#c9c6bc', 4.4) + line(lane(-2.5), '#5f5d5a', 4) + line(lane(-2.5), '#c4c0b4', 2.2), 10);
  // Cars, nose to tail in all four lanes; a few flipped or burnt out.
  defs += `<g id="${ID}cj">${carSym('currentColor', '#4f4a48', false)}</g><g id="${ID}ci">${carSym('currentColor', '#4f4a48', true)}</g>`;
  {
    const C = (p, q, z) => [(p - q) * 32, (p + q) * 16 - z];
    let fl = ell(4, 2, 30, 13, O, { op: 0.14 });
    fl += poly([C(-0.32, 0.7, 2), C(0.32, 0.7, 2), C(0.32, 0.7, 11), C(-0.32, 0.7, 11)], '#b9877a', { sw: 1.3, stroke: '#4f4a48' });
    fl += poly([C(0.32, 0.7, 2), C(0.32, -0.7, 2), C(0.32, -0.7, 11), C(0.32, 0.7, 11)], '#94695e', { sw: 1.3, stroke: '#4f4a48' });
    fl += poly([C(-0.32, -0.7, 11), C(0.32, -0.7, 11), C(0.32, 0.7, 11), C(-0.32, 0.7, 11)], '#5b5654', { sw: 1.3, stroke: '#4f4a48' });
    for (const [p, q] of [[-0.2, -0.45], [0.2, -0.45], [-0.2, 0.45], [0.2, 0.45]]) fl += ell(...C(p, q, 13), 4.6, 2.6, '#2f2b30', { sw: 1, stroke: '#1f1b20' });
    defs += `<g id="${ID}x">${fl}</g><g id="${ID}b"><use href="#${ID}cj" color="#6c6764"/>${ell(-6, -14, 10, 5, '#2f2b2a', { op: 0.35 })}${ell(6, -12, 12, 6, '#2f2b2a', { op: 0.3 })}</g>`;
  }
  const CARC = ['#c97a6c', '#7a9cc4', '#d8c27a', '#93b38a', '#b7a9cf', '#e2ddd2', '#d79a6a', '#8fb6b8'];
  const cars = [];
  for (const o of [-1.7, -0.6, 0.6, 1.7]) {
    for (let j = -38 + r() * 2; j < 29; j += 1.75 + r() * 1.5) {
      if (r() < 0.2) continue;
      const roll = r();
      cars.push([40.5 + o + j, W2(40.5 + o, j), roll < 0.05 ? 'x' : roll < 0.1 ? 'b' : 'cj', CARC[Math.floor(r() * CARC.length)]]);
    }
    for (let i = 50 + r() * 2; i < 82; i += 1.75 + r() * 1.5) {
      if (r() < 0.25) continue;
      cars.push([i + 36 - o, W2(i, 36 - o), 'ci', CARC[Math.floor(r() * CARC.length)]]);
    }
  }
  cars.sort((a, b) => a[0] - b[0]);
  for (const [, [x, y], kind, col] of cars) {
    add(x - 34, y - 30, x + 34, y + 16, `<use href="#${ID}${kind}" x="${I(x)}" y="${I(y)}"${kind === 'cj' || kind === 'ci' ? ` color="${col}"` : ''}/>`);
    if (kind === 'b') {
      let puffs = '';
      for (let t = 0; t < 6; t++) puffs += epathI([[x - 4 + t * t * 2, y - 26 - t * 16, 7 + t * 3, 6 + t * 2.5]]);
      add(x - 30, y - 140, x + 90, y, path(puffs, '#8f9496', { op: 0.38 }));
    }
  }
  let cones = '';
  for (const [ci, cj] of [[37.7, 8], [37.7, 9.4], [43.4, 20], [37.7, 22], [37.7, -6]]) {
    const [x, y] = W2(ci, cj);
    cones += path(`M${I(x - 4)} ${I(y)}h8l-3 -11h-2z`, '#e8915a', { sw: 1.2, stroke: '#6a4a3a' }) + rect(x - 2.6, y - 6, 5.2, 2, '#f3ece0');
  }
  add(500, 400, 1700, 1100, cones);

  // 7. Bushes, rocks and loose pines on the open grass (low near the map's front edges).
  const bush = (x, y, k) => path(`M${I(x - 12 * k)} ${I(y)}q-2 -9 6 -11q3 -7 11 -4q8 -2 9 6q5 3 0 9z`, '#7fa65e', { sw: 1.4, stroke: '#4f6e3e' }) + path(`M${I(x - 7 * k)} ${I(y - 9 * k)}q3 -4 8 -3`, 'none', { sw: 1.4, stroke: '#a3c47e' });
  const spots = [[-120, 1235, 1], [-40, 1290, 0.8], [130, 1250, 0.9], [220, 1430, 1], [60, 1500, 1.1], [-20, 1600, 0.9], [760, 1120, 1], [900, 1060, 0.9], [1520, 760, 0.9], [580, 1300, 1], [820, 1420, 1.1], [1250, 1250, 1], [1560, 1150, 0.9], [-1700, 560, 1], [-1500, 590, 0.9], [-2100, 640, 1], [2050, 560, 1], [2300, 820, 1.1], [1800, 1000, 0.9], [-600, 1780, 1], [-1300, 1780, 1.1], [-1800, 1650, 0.9], [300, 1700, 1]];
  for (const [x, y, k] of spots) add(x - 14, y - 16, x + 16, y + 2, bush(x, y, k));
  let rocks = '';
  for (const [x, y] of [[-1240, 600], [-200, 1330], [300, 1560], [1250, 1400], [680, 1500], [-2300, 1000], [2100, 1200]]) rocks += ell(x, y, 9, 5, '#b3ad9c', { sw: 1.3, stroke: '#77705f' }) + ell(x - 2, y - 2, 4, 2, '#cfc9b8');
  all(rocks);
  for (const [x, y, k] of [[-1650, 1720, 0.9], [-1500, 1760, 0.8], [-2250, 1350, 0.9], [-2300, 760, 0.8], [400, 1820, 0.9], [2200, 1100, 0.85], [2350, 980, 0.8], [1900, 1350, 0.9], [-700, 1900, 0.9]]) tree(x, y, k, 'm');
  trees.sort((a, b) => a[0] - b[0]);
  for (const [y, x, n, kd] of trees) add(x - 22, y - 84, x + 22, y + 2, `<use href="#${ID}${kd}${n}" x="${I(x)}" y="${I(y)}"/>`);

  // 8. Every edge fades to the plain meadow colour, so the page around it never shows a seam.
  const F = 620;
  const fadeG = (id, x1, y1, x2, y2) => `<linearGradient id="${ID}${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${GR}"/><stop offset=".35" stop-color="${GR}" stop-opacity=".75"/><stop offset="1" stop-color="${GR}" stop-opacity="0"/></linearGradient>`;
  defs += fadeG('el', L, 0, L + F, 0) + fadeG('er', R, 0, R - F, 0) + fadeG('et', 0, T, 0, T + F) + fadeG('eb', 0, B, 0, B - F);
  add(L, T, L + F, B, `<rect x="${L}" y="${T}" width="${F}" height="${B - T}" fill="url(#${ID}el)"/>`);
  add(R - F, T, R, B, `<rect x="${R - F}" y="${T}" width="${F}" height="${B - T}" fill="url(#${ID}er)"/>`);
  add(L, T, R, T + F, `<rect x="${L}" y="${T}" width="${R - L}" height="${F}" fill="url(#${ID}et)"/>`);
  add(L, B - F, R, B, `<rect x="${L}" y="${B - F}" width="${R - L}" height="${F}" fill="url(#${ID}eb)"/>`);
  return { items, defs };
}

let SCENERY = null;
function scenery() {
  if (!SCENERY) {
    const m = sceneryModel();
    // Ids are named after the content's hash (short: the trees and cars name them a lot).
    const tag = 's' + hash(m.defs + m.items.length).toString(36).slice(0, 4);
    const fix = (s) => s.split(ID).join(tag);
    SCENERY = { defs: fix(m.defs), items: m.items.map((it) => [it[0], it[1], it[2], it[3], fix(it[4])]) };
  }
  return SCENERY;
}

function sceneryRect(x0, y0, x1, y1, cls) {
  const m = scenery();
  let body = '';
  for (const it of m.items) if (it[2] >= x0 && it[0] <= x1 && it[3] >= y0 && it[1] <= y1) body += it[4];
  return { svg: `<svg ${ROOT} viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" class="${cls}"><defs>${m.defs}</defs>${body}</svg>`, left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The land around the 35×35 map, one static SVG in WORLD px: the diamond spans
 * (0,0) (1120,560) (0,1120) (−1120,560). Pines behind (round both back corners), the
 * big hill with the town's letters and two smoky cities far off, a lake with a dock
 * front-left, a jammed highway front-right, grass and a dirt verge right under the map's
 * edges. Quieter than the map; every edge fades to the meadow colour #93ba67 (use it as
 * the page background). Returns { svg, left, top, width, height } (the svg's world rect).
 */
export function sceneryBackdrop() {
  return sceneryRect(SC.L, SC.T, SC.R, SC.B, 'scenery');
}

/**
 * The same land as four smaller images (cut at the map's centre, x = 0 and y = 560, each
 * overlapping its neighbours by 2 px), each holding only what touches it: cheaper to
 * rasterise than one huge image. [{ svg, left, top, width, height }, ...] in world px.
 */
export function sceneryParts() {
  const { L, T, R, B } = SC;
  const cx = 0;
  const cy = 560;
  return [
    sceneryRect(L, T, cx + 2, cy + 2, 'scenery scenery-tl'),
    sceneryRect(cx - 2, T, R, cy + 2, 'scenery scenery-tr'),
    sceneryRect(L, cy - 2, cx + 2, B, 'scenery scenery-bl'),
    sceneryRect(cx - 2, cy - 2, R, B, 'scenery scenery-br'),
  ];
}
