// Last Stop town art: the seven buildings (three look stages each), survivor homes (six
// tiers with the owner's touches), the six landmarks (ruined and restored, with their
// bosses' spots and costume props) and the fence runs. Pure functions that return SVG
// strings: no DOM, no image files, safe to import in node tests.
//
// Look: Thrill Hill's toy box, in 2:1 isometric. Thick warm outlines (#2a1b12), flat fills
// with one shade and one highlight, cheerful daylight. Lit from the top-left: LEFT faces
// (the ones facing down-left) carry the base colour, RIGHT faces are darker, tops lightest.
//
// Iso box convention (what isoview.js expects): an object on a w × h footprint is drawn in
// a box (w + h) × 32 wide whose BOTTOM edge is the footprint's bottom corner; artH is the
// box height. In the viewBox 0 0 W artH the footprint diamond sits at the bottom:
//   top (h·32, artH − (w+h)·16), right (W, artH − h·16), bottom (w·32, artH), left (0, artH − w·16).
// Tile-local (u along i, v along j, z up in px) → viewBox: x = h·32 + (u − v)·32,
// y = artH − (w+h)·16 + (u + v)·16 − z (see frame()).
//
// Every art function returns { svg, artH, bodyH }: bodyH is the height of the main body
// above the footprint (for the hit hexagon). Buildings, homes and landmarks also return top:
// the viewBox y of the art's highest point (put bubbles and tags there, not at the box top).
// Options: night (lit windows, lamps, the Drive-in's B-movie beam, the long lighthouse beam),
// homes' wish (mailbox flag up) and name, the wheel's zones (lit gondolas), fences' start and
// edge (one pillar rhythm along an edge cut into pieces). Anchors the game needs (roof
// campers, the bus bay, the shop door, where the supply crate sits, walker spots that sort
// in front, bosses) are in ANCHORS / BOSS_SPOT.
//
// Animation hooks (pivots set inline). ART_CSS holds all the keyframes; map objects are <img>
// data URLs that page CSS cannot reach, so withAnimation(svg) embeds the ones an SVG uses:
//   .ls-blink   radio mast lights (opacity blink)
//   .ls-beacon  the Drop Pad beacon's glow, the clinic's cherry (pulse)
//   .ls-beam    the lighthouse beam (rotate/sweep about the lamp)
//   .ls-swing   the Tin Can Range targets (small rotate about the hanger)
//   .ls-ball    the wrecking ball (small rotate about the jib end)
//   .ls-rim     the Fairground Wheel rim, spokes and gondolas (spin about the hub, restored only)
//   .ls-gondola each gondola (spin the other way at the same speed, so it hangs upright)
// No ids are used.

import { CLASSES, STAGES } from './config.js';

// --- Palette and tiny helpers ----------------------------------------------------------------

const O = '#2a1b12';
const WHITE = '#fffaf0';
const CREAM = '#f6ead2';
const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const PLANK = '#bf8a55';
const RED = '#e8483f';
const BLUE = '#3d8bf0';
const GREEN = '#36c06a';
const YELLOW = '#f5b82e';
const PURPLE = '#b25cff';
const PINK = '#ff7ab8';
const ORANGE = '#ff9a3c';
const GOLD = '#ffc23a';
const STEEL = '#a9b0ba';
const STEEL_D = '#7a828c';
const RUBBER = '#3d3540';
const GLASS = '#9fd8ff';
const LIT = '#ffe58a';
const CONC = '#d9d3c5';
const BRICK = '#c8553d';
const GRASS = '#7ccf4a';
const GRASS_D = '#5fb03a';
const OLIVE = '#8d9160';
const NIGHT = '#2b2140';
const CONFETTI = [RED, BLUE, GREEN, YELLOW, PURPLE, PINK];
// Candy paint for the Patched stage: junk, but cheerfully painted (the start lot must pop
// against the olive wild).
const TEAL = '#4cc9c0';
const BUBBLE = '#ff8fc0';
const LEMON = '#ffd84d';
const SKY = '#7cc8f5';

/** Night art (lit windows, lamps, the B-movie, the beam): set for the length of one call. */
let NITE = false;
const withNight = (night, fn) => {
  NITE = !!night;
  try {
    return fn();
  } finally {
    NITE = false;
  }
};

/**
 * The highest drawn point (viewBox y) of each art variant, measured in a browser with getBBox
 * (the gallery's ?s=measure section prints this table). Bubbles and tags go here, not at the
 * box top (artH is fixed per id; low variants sit well below it).
 */
const TOPS = {
  'b:bigtop:1': 24, 'b:bigtop:2': 24, 'b:bigtop:3': 22,
  'b:crate:1': 17, 'b:crate:2': 11, 'b:crate:3': 11,
  'b:vault:1': 27, 'b:vault:2': 1, 'b:vault:3': 1,
  'b:striker:1': 63, 'b:striker:2': 63, 'b:striker:3': 6,
  'b:gallery:1': 47, 'b:gallery:2': 35, 'b:gallery:3': 4,
  'b:tent:1': 49, 'b:tent:2': 45, 'b:tent:3': 18,
  'b:garage:1': 79, 'b:garage:2': 44, 'b:garage:3': 44,
  'h:tent': 29, 'h:shack': 18, 'h:cabin': 13, 'h:cottage': 14, 'h:tower': 21, 'h:gold': 22,
  'l:tower:0': 24, 'l:tower:1': -3, 'l:drivein:0': 31, 'l:drivein:1': 26, 'l:radio:0': 18, 'l:radio:1': 14, 'l:fire:0': 60, 'l:fire:1': 36, 'l:wheel:0': 15, 'l:wheel:1': 14, 'l:light:0': 33, 'l:light:1': 17,
};
const topOf = (k, H) => TOPS[k] ?? Math.round(H * 0.1);

/** Half-pixel rounding keeps the strings short (and turns -0 into 0). */
const N = (n) => {
  const v = Math.round(n * 2) / 2;
  return v === 0 ? 0 : v;
};

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
const lt = (c, t = 0.4) => mix(c, '#ffffff', t);

const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Elements inherit stroke #2a1b12, width 1.2 (the commonest), round joins and caps, fill none
// and the sign font from the root group: every filled shape names its fill, and a shape with
// no width given gets the chunky 2.
const SW0 = 1.2;
function at(o, grp = false) {
  if (!o) return grp ? '' : ' stroke-width="2"';
  let s = '';
  if (o.ns) s += ' stroke="none"';
  else {
    if (o.stroke) s += ` stroke="${o.stroke}"`;
    const sw = o.sw ?? (grp ? null : 2);
    if (sw != null && sw !== SW0) s += ` stroke-width="${sw}"`;
  }
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.dash) s += ` stroke-dasharray="${o.dash}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  if (o.style) s += ` style="${o.style}"`;
  if (o.eo) s += ' fill-rule="evenodd"';
  return s;
}
const path = (d, fill, o) => `<path d="${d}" fill="${fill}"${at(o)}/>`;
const circ = (x, y, r, fill, o) => `<circle cx="${N(x)}" cy="${N(y)}" r="${N(r)}" fill="${fill}"${at(o)}/>`;
const ell = (x, y, rx, ry, fill, o) => `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(rx)}" ry="${N(ry)}" fill="${fill}"${at(o)}/>`;
const rect = (x, y, w, h, fill, o = {}) => (o.rx ? `<rect x="${N(x)}" y="${N(y)}" width="${N(w)}" height="${N(h)}" rx="${o.rx}" fill="${fill}"${at(o)}/>` : `<path d="M${N(x)} ${N(y)}h${N(w)}v${N(h)}h${N(-w)}z" fill="${fill}"${at(o)}/>`);
const line = (d, color, w, o = {}) => `<path d="${d}"${color === O ? '' : ` stroke="${color}"`}${w === SW0 ? '' : ` stroke-width="${w}"`}${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}/>`;
const g = (inner, o) => `<g${at(o, true)}>${inner}</g>`;
/** An outlined stroke: a fat dark line under a coloured one. */
const stick = (d, color, w, ow = 2.2) => line(d, O, w + ow) + line(d, color, w);
const M = (x, y) => `M${N(x)} ${N(y)}`;
const L = (x, y) => `L${N(x)} ${N(y)}`;

/** Many circles as one path (one element). */
const cpath = (list) => list.map(([x, y, r]) => `M${N(x - r)} ${N(y)}a${N(r)} ${N(r)} 0 1 0 ${N(2 * r)} 0a${N(r)} ${N(r)} 0 1 0 ${N(-2 * r)} 0`).join('');
/** Many ellipses as one path. */
const epath = (list) => list.map(([x, y, rx, ry]) => `M${N(x - rx)} ${N(y)}a${N(rx)} ${N(ry)} 0 1 0 ${N(2 * rx)} 0a${N(rx)} ${N(ry)} 0 1 0 ${N(-2 * rx)} 0`).join('');

function txt(x, y, s, fs, fill, o = {}) {
  const tl = o.tl ? ` textLength="${N(o.tl)}" lengthAdjust="spacingAndGlyphs"` : '';
  const sk = o.ol ? ` stroke="${o.ol}" stroke-width="${o.olw || 2.4}" paint-order="stroke"` : ' stroke="none"';
  return `<text x="${N(x)}" y="${N(y)}" font-size="${N(fs)}" fill="${fill}"${sk}${tl}${o.op != null ? ` opacity="${o.op}"` : ''}>${esc(s)}</text>`;
}
/** Text centred in a w × h box at (x, y): picks a size and squeezes long words. */
function fitText(x, y, w, h, s, fill, o = {}) {
  const n = Math.max(1, s.length);
  const fs = Math.min(h * (o.k ?? 0.72), (w - 4) / (n * 0.66));
  const est = n * 0.66 * fs;
  const tl = n >= 5 && est > (w - 4) * 0.85 ? Math.min(est, w - 4) : null;
  return txt(x + w / 2, y + h / 2 + fs * 0.36, s, fs, fill, { ...o, tl });
}

function qpt(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}
/** Points along a string sagging between two screen points. */
function sagPts(a, b, sag, n, t0 = 0.08, t1 = 0.92) {
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag * 2];
  const out = [];
  for (let i = 0; i < n; i++) out.push(qpt(a, c, b, n === 1 ? 0.5 : t0 + ((t1 - t0) * i) / (n - 1)));
  return out;
}
const sagD = (a, b, sag) => `${M(a[0], a[1])}Q${N((a[0] + b[0]) / 2)} ${N((a[1] + b[1]) / 2 + sag * 2)} ${N(b[0])} ${N(b[1])}`;

/** Round dots (zero-length round-capped strokes): one short path for any number. */
const dots = (pts, color, width, o = {}) => (pts.length ? `<path d="${pts.map(([x, y]) => `M${N(x)} ${N(y)}h0`).join('')}"${color === O ? '' : ` stroke="${color}"`} stroke-width="${N(width)}"${o.op != null ? ` opacity="${o.op}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}/>` : '');

/** Light bulbs: glow, outline and bulb, three short paths however many. */
function bulbs(pts, on = true, r = 1.9, col = '#fff4b8') {
  if (!pts.length) return '';
  return (on ? dots(pts, '#ffe27a', r * 4.4, { op: 0.38 }) : '') + dots(pts, O, r * 2 + 1.8) + dots(pts, on ? col : '#d9cba6', r * 2);
}
/** A string of lights between two screen points. */
const lights = (a, b, sag, n, on = true) => line(sagD(a, b, sag), O, 1.1) + bulbs(sagPts(a, b, sag, n), on);

/** Pennants on a string: n = the building's level. */
function pennants(a, b, n, cols, sag = 4) {
  if (n <= 0) return '';
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag * 2];
  const d = {};
  for (let i = 0; i < n; i++) {
    const [px, py] = qpt(a, c, b, (i + 0.5) / n);
    const col = cols[i % cols.length];
    d[col] = (d[col] || '') + `${M(px - 3.4, py - 0.6)}${L(px + 3.4, py - 0.6)}${L(px, py + 6.4)}Z`;
  }
  let s = line(sagD(a, b, sag), O, 1.1);
  for (const col in d) s += path(d[col], col, { sw: 1 });
  return s;
}

/** A flag on a pole; base of the pole at (x, y). dir −1 flies left. */
function flag(x, y, h, color, dir = 1, small = false) {
  const t = y - h;
  const fw = (small ? 10 : 14) * dir;
  const fh = small ? 7 : 10;
  return stick(`${M(x, y)}V${N(t)}`, '#e8e2d6', 1.5, 2) + path(`${M(x, t + 1)}Q${N(x + fw * 0.5)} ${N(t - 2)} ${N(x + fw)} ${N(t + 2)}L${N(x + fw * 0.88)} ${N(t + fh * 0.6)}L${N(x + fw)} ${N(t + fh)}Q${N(x + fw * 0.5)} ${N(t + fh - 3)} ${N(x)} ${N(t + fh - 1)}Z`, color, { sw: 1.6 }) + circ(x, t - 1.4, 2, GOLD, { sw: 1.1 });
}

function star(cx, cy, r, fill, o = {}) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += (i ? 'L' : 'M') + N(cx + Math.cos(a) * rr) + ' ' + N(cy + Math.sin(a) * rr);
  }
  return path(d + 'Z', fill, { sw: o.sw ?? 1.3, ...o });
}
function sparkle(cx, cy, r, fill = '#fff6c8') {
  const k = r * 0.2;
  return path(`${M(cx, cy - r)}Q${N(cx + k)} ${N(cy - k)} ${N(cx + r)} ${N(cy)}Q${N(cx + k)} ${N(cy + k)} ${N(cx)} ${N(cy + r)}Q${N(cx - k)} ${N(cy + k)} ${N(cx - r)} ${N(cy)}Q${N(cx - k)} ${N(cy - k)} ${N(cx)} ${N(cy - r)}Z`, fill, { sw: 0.9 });
}
/** Heart centred at (cx, cy), half-width s (path data only). */
const heartD = (cx, cy, s) => `${M(cx, cy + s * 0.9)}C${N(cx - s * 1.25)} ${N(cy + s * 0.05)} ${N(cx - s * 0.75)} ${N(cy - s * 1)} ${N(cx)} ${N(cy - s * 0.35)}C${N(cx + s * 0.75)} ${N(cy - s * 1)} ${N(cx + s * 1.25)} ${N(cy + s * 0.05)} ${N(cx)} ${N(cy + s * 0.9)}Z`;

/** Grass or weed tufts at screen points. */
function tufts(pts, col = GRASS_D, k = 1) {
  if (!pts.length) return '';
  const d = pts.map(([x, y]) => `${M(x - 4 * k, y)}L${N(x - 3 * k)} ${N(y - 6 * k)}L${N(x - 1 * k)} ${N(y - 2 * k)}L${N(x)} ${N(y - 8 * k)}L${N(x + 1.5 * k)} ${N(y - 2 * k)}L${N(x + 3.5 * k)} ${N(y - 6 * k)}L${N(x + 4 * k)} ${N(y)}Z`).join('');
  return path(d, col, { sw: 1 });
}

/** A stack of tyres standing at screen point (x, y). */
function tyres(x, y, n = 3, rx = 8) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const yy = y - 3 - i * 5.5;
    s += ell(x, yy, rx, rx * 0.45 + 1.5, RUBBER, { sw: 1.6 });
  }
  return s + ell(x, y - 3 - (n - 1) * 5.5 - 0.8, rx * 0.45, rx * 0.2, '#1f1a20', { ns: 1 });
}
/** An upright drum (barrel) standing at (x, y). */
function drum(x, y, col, h = 11, r = 5.5) {
  return path(`${M(x - r, y - h)}V${N(y)}A${N(r)} ${N(r * 0.45)} 0 0 0 ${N(x + r)} ${N(y)}V${N(y - h)}Z`, col, { sw: 1.5 }) + line(`${M(x - r, y - h * 0.4)}A${N(r)} ${N(r * 0.45)} 0 0 0 ${N(x + r)} ${N(y - h * 0.4)}`, dk(col, 0.3), 1) + ell(x, y - h, r, r * 0.45, lt(col, 0.25), { sw: 1.5 });
}
/** A traffic cone at (x, y). */
const cone = (x, y) => path(`${M(x - 6, y)}L${N(x - 2)} ${N(y - 13)}L${N(x + 2)} ${N(y - 13)}L${N(x + 6)} ${N(y)}Z`, ORANGE, { sw: 1.4 }) + path(`${M(x - 3.6, y - 6)}L${N(x + 3.6)} ${N(y - 6)}L${N(x + 3)} ${N(y - 8.6)}L${N(x - 3)} ${N(y - 8.6)}Z`, WHITE, { ns: 1 }) + rect(x - 7, y - 1.5, 14, 3, ORANGE, { sw: 1.2, rx: 1 });

/** Sandbags: pillows drawn back to front, each its own shape (list of screen [x, y]). */
function sandbags(pts, w = 6.2, h = 3.4) {
  return pts
    .map(([x, y]) => path(`${M(x - w, y)}Q${N(x - w)} ${N(y - h)} ${N(x - w + 2)} ${N(y - h)}H${N(x + w - 2)}Q${N(x + w)} ${N(y - h)} ${N(x + w)} ${N(y)}Q${N(x + w)} ${N(y + h)} ${N(x + w - 2)} ${N(y + h)}H${N(x - w + 2)}Q${N(x - w)} ${N(y + h)} ${N(x - w)} ${N(y)}Z`, '#d9c48e', { sw: 1.2 }))
    .join('');
}

// --- Iso frame ---------------------------------------------------------------------------------

/** A w × h footprint drawn in a box of height H: p(u, v, z) → viewBox point. */
function frame(w, h, H) {
  const W = (w + h) * 32;
  const ox = h * 32;
  const oy = H - (w + h) * 16;
  return { w, h, W, H, p: (u, v, z = 0) => [ox + (u - v) * 32, oy + (u + v) * 16 - z] };
}
const xy = (F, u, v, z = 0) => {
  const [x, y] = F.p(u, v, z);
  return `${N(x)} ${N(y)}`;
};
/** Path data through tile-local points [u, v, z]. */
const pd = (F, pts, close = true) => pts.map((q, i) => (i ? 'L' : 'M') + xy(F, q[0], q[1], q[2] || 0)).join('') + (close ? 'Z' : '');
const face = (F, pts, fill, o) => path(pd(F, pts), fill, o);

const mat = (a, b, c, d, x, y, inner) => `<g transform="matrix(${a} ${b} ${c} ${d} ${N(x)} ${N(y)})">${inner}</g>`;
/** Draw on a plane v = const (facing down-left): local x along +u (32 = one tile), y down = −z. */
function onL(F, u, v, z, inner) {
  const [x, y] = F.p(u, v, z);
  return mat(1, 0.5, 0, 1, x, y, inner);
}
/** Draw on a plane u = const (facing down-right): local x along −v (screen right), y down = −z. */
function onR(F, u, v, z, inner) {
  const [x, y] = F.p(u, v, z);
  return mat(1, -0.5, 0, 1, x, y, inner);
}
/** Draw on a plane z = const: local x along +u, y along +v. */
function onT(F, u, v, z, inner) {
  const [x, y] = F.p(u, v, z);
  return mat(1, 0.5, -1, 0.5, x, y, inner);
}
/** Screen point of a top-plane local point (for round things on the ground). */
function tpt(F, u, v, z, lx, ly) {
  const [x, y] = F.p(u, v, z);
  return [x + lx - ly, y + (lx + ly) * 0.5];
}

/**
 * A box on (u0, v0)–(u1, v1), from z0 up ht. c = the left face's colour; the right face
 * gets c under a shade, the top a lighter tint. Details: o.lf on the left face (origin
 * its top-left corner, x along +u), o.rf on the right face (origin its top-left corner,
 * x toward the right corner), o.tf on the top (origin the back corner), o.rf2 after the shade.
 */
function box(F, u0, v0, u1, v1, z0, ht, c, o = {}) {
  const z1 = z0 + ht;
  const isw = o.isw ?? 1.2;
  let s = face(F, [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], c, { sw: isw });
  if (o.lf) s += onL(F, u0, v1, z1, o.lf);
  const R = [[u1, v1, z0], [u1, v0, z0], [u1, v0, z1], [u1, v1, z1]];
  // The right face is shaded: a darker fill, or (when it carries details) an overlay on top of them.
  const overlay = !o.r && (o.rf || o.rf2);
  s += face(F, R, o.r || (overlay ? c : dk(c, o.rs ?? 0.2)), { sw: isw });
  if (o.rf) s += onR(F, u1, v1, z1, o.rf);
  if (overlay) s += face(F, R, O, { ns: 1, op: o.rs ?? 0.2 });
  if (o.rf2) s += onR(F, u1, v1, z1, o.rf2);
  if (o.top !== 'none') {
    s += face(F, [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], o.top || lt(c, 0.3), { sw: isw });
    if (o.tf) s += onT(F, u0, v0, z1, o.tf);
  }
  if (o.sw !== 0) s += path(pd(F, [[u0, v0, z1], [u1, v0, z1], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0], [u0, v1, z1]]), 'none', o.sw ? { sw: o.sw } : undefined);
  return s;
}

/** A soft contact shadow to the front-right of a box. */
const shadowBox = (F, u0, v0, u1, v1, k = 0.2) => face(F, [[u0, v1], [u1, v1], [u1, v0], [u1 + k, v0 + k * 0.5], [u1 + k, v1 + k], [u0 + k * 0.5, v1 + k]], O, { ns: 1, op: 0.15 });

/**
 * Gable roof, ridge along v: the gable triangle faces down-left (on the v1 wall plane),
 * the visible slope faces down-right. o: wall (gable fill), ov, ext (roof reaches v1 + ext),
 * trim, gf (gable details, onL origin (u0, v1, z)), tex 'shingle' | 'tin'.
 */
function roofV(F, u0, v0, u1, v1, z, rh, c, o = {}) {
  const ov = o.ov ?? 0.1;
  const um = (u0 + u1) / 2;
  const a = u0 - ov;
  const b = u1 + ov;
  const p = v0 - ov;
  const q = v1 + (o.ext ?? 0) + ov;
  const k = rh / (um - u0);
  const ze = z - ov * k;
  const zt = z + rh;
  const t = o.th ?? 3;
  let s = face(F, [[u0, v1, z], [u1, v1, z], [um, v1, zt]], o.wall || CREAM, { sw: 1.2 });
  if (o.gf) s += onL(F, u0, v1, z, o.gf);
  s += face(F, [[um, p, zt], [b, p, ze], [b, q, ze], [um, q, zt]], c, { sw: 1.2 });
  if (o.tex) {
    let d = '';
    if (o.tex === 'tin') {
      for (let v = p + 0.12; v < q - 0.05; v += 0.13) d += M(...F.p(um, v, zt)) + L(...F.p(b, v, ze));
    } else {
      for (let f = 0.3; f < 0.95; f += 0.3) d += M(...F.p(um + (b - um) * f, p, zt + (ze - zt) * f)) + L(...F.p(um + (b - um) * f, q, zt + (ze - zt) * f));
    }
    s += line(d, dk(c, 0.35), 1, { op: 0.6 });
  }
  if (o.rf) s += o.rf;
  const tr = o.trim || dk(c, 0.25);
  s += face(F, [[a, q, ze], [um, q, zt], [um, q, zt - t], [a, q, ze - t]], tr, { sw: 1.2 });
  s += face(F, [[um, q, zt], [b, q, ze], [b, q, ze - t], [um, q, zt - t]], dk(tr, 0.12), { sw: 1.2 });
  s += face(F, [[b, q, ze], [b, p, ze], [b, p, ze - t], [b, q, ze - t]], dk(c, 0.35), { sw: 1.2 });
  s += path(pd(F, [[a, q, ze - t], [a, q, ze], [um, q, zt], [um, p, zt], [b, p, ze], [b, p, ze - t], [b, q, ze - t], [um, q, zt - t]]), 'none');
  return s;
}
/** Geometry of a roofV (for things that sit on it). */
function roofVGeo(u0, v0, u1, v1, z, rh, o = {}) {
  const ov = o.ov ?? 0.1;
  const um = (u0 + u1) / 2;
  return { um, zt: z + rh, p: v0 - ov, q: v1 + (o.ext ?? 0) + ov, b: u1 + ov, ze: z - (ov * rh) / (um - u0), a: u0 - ov };
}

/** Hip (pyramid) roof over a box top at z. */
function roofHip(F, u0, v0, u1, v1, z, rh, c, o = {}) {
  const ov = o.ov ?? 0.1;
  const a = u0 - ov;
  const b = u1 + ov;
  const p = v0 - ov;
  const q = v1 + ov;
  const um = (u0 + u1) / 2;
  const vm = (v0 + v1) / 2;
  const ze = z - 2;
  const zt = z + rh;
  const t = o.th ?? 3;
  const A = [um, vm, zt];
  let s = face(F, [[a, q, ze], [b, q, ze], A], o.l || lt(c, 0.12), { sw: 1.2 });
  s += face(F, [[b, q, ze], [b, p, ze], A], o.r || dk(c, 0.12), { sw: 1.2 });
  s += face(F, [[a, q, ze], [b, q, ze], [b, q, ze - t], [a, q, ze - t]], dk(c, 0.25), { sw: 1.2 });
  s += face(F, [[b, q, ze], [b, p, ze], [b, p, ze - t], [b, q, ze - t]], dk(c, 0.38), { sw: 1.2 });
  s += path(pd(F, [[a, q, ze - t], [a, q, ze], A, [b, p, ze], [b, p, ze - t], [b, q, ze - t]]), 'none');
  return s;
}

/** Shed roof sloping down toward +u: high zHi over u0, low zLo over u1. */
function roofMono(F, u0, v0, u1, v1, zLo, zHi, c, o = {}) {
  const ov = o.ov ?? 0.1;
  const k = (zHi - zLo) / (u1 - u0);
  const a = u0 - ov;
  const b = u1 + ov;
  const p = v0 - ov;
  const q = v1 + ov;
  const zA = zHi + ov * k;
  const zB = zLo - ov * k;
  const t = o.th ?? 3;
  let s = face(F, [[a, p, zA], [b, p, zB], [b, q, zB], [a, q, zA]], c, { sw: 1.2 });
  if (o.tex === 'tin') {
    let d = '';
    for (let v = p + 0.12; v < q - 0.05; v += 0.12) d += M(...F.p(a, v, zA)) + L(...F.p(b, v, zB));
    s += line(d, dk(c, 0.3), 1, { op: 0.65 });
  }
  s += face(F, [[a, q, zA], [b, q, zB], [b, q, zB - t], [a, q, zA - t]], dk(c, 0.18), { sw: 1.2 });
  s += face(F, [[b, q, zB], [b, p, zB], [b, p, zB - t], [b, q, zB - t]], dk(c, 0.35), { sw: 1.2 });
  s += path(pd(F, [[a, q, zA - t], [a, q, zA], [a, p, zA], [b, p, zB], [b, p, zB - t], [b, q, zB - t]]), 'none');
  return s;
}

// --- Face details (drawn in a face's local coordinates) -----------------------------------------

const hlines = (w, h, step, col = O, op = 0.3, x0 = 0, y0 = 0, sw = 1) => {
  let d = '';
  for (let y = y0 + step; y < h - 0.5; y += step) d += `M${N(x0)} ${N(y)}H${N(w)}`;
  return d ? line(d, col, sw, { op }) : '';
};
const vlines = (w, h, step, col = O, op = 0.3, y0 = 0, sw = 1, x0 = 0) => {
  let d = '';
  for (let x = x0 + step; x < w - 0.5; x += step) d += `M${N(x)} ${N(y0)}V${N(h)}`;
  return d ? line(d, col, sw, { op }) : '';
};
/** Brick courses on a w × h face. */
function bricks(w, h, col = '#7a2e1e', op = 0.4) {
  let d = '';
  let r = 0;
  for (let y = 5; y < h - 0.5; y += 5, r++) {
    d += `M0 ${N(y)}H${N(w)}`;
    for (let x = r % 2 ? 5 : 11; x < w - 1; x += 12) d += `M${N(x)} ${N(y)}v-5`;
  }
  return line(d, col, 0.9, { op });
}

function win(x, y, w, h, o = {}) {
  const fr = o.frame || WHITE;
  const lit = o.lit || (NITE && !o.glass);
  let s = rect(x, y, w, h, fr, { sw: 1.3 });
  s += rect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, lit ? LIT : o.glass || GLASS, { sw: 0.9 });
  if (!lit) s += line(`${M(x + 3, y + h - 3)}L${N(x + w * 0.5)} ${N(y + 3)}`, '#ffffff', 1.3, { op: 0.7 });
  if (o.bars !== false) s += line(`${M(x + w / 2, y + 1.6)}V${N(y + h - 1.6)}M${N(x + 1.6)} ${N(y + h / 2)}H${N(x + w - 1.6)}`, fr, 1.2);
  return s;
}
function boarded(x, y, w, h) {
  const cx = x + w / 2;
  return rect(x, y, w, h, '#3b2c24', { sw: 1.3 }) + rect(x - 1.5, y + h * 0.22, w + 3, 3.6, WOOD_L, { sw: 1, tf: `rotate(-16 ${N(cx)} ${N(y + h * 0.22)})` }) + rect(x - 1.5, y + h * 0.6, w + 3, 3.6, WOOD, { sw: 1, tf: `rotate(13 ${N(cx)} ${N(y + h * 0.6)})` });
}
/** Upright planks across a w × h face (local coords), painted from cols in turn (one path per colour). */
function plankWall(w, h, cols, pw = 6.4, x0 = 0, y0 = 0) {
  const d = {};
  let k = 0;
  for (let x = x0; x < x0 + w - 0.1; x += pw, k++) {
    const c = cols[k % cols.length];
    const ww = Math.min(pw, x0 + w - x);
    d[c] = (d[c] || '') + `M${N(x)} ${N(y0 + (k % 3 === 1 ? 1 : 0))}h${N(ww)}v${N(h - (k % 3 === 1 ? 1 : 0))}h${N(-ww)}z`;
  }
  let s = '';
  for (const c in d) s += path(d[c], c, { ns: 1 });
  return s + vlines(x0 + w, y0 + h, pw, O, 0.32, y0, 1, x0);
}
/** Candy colours for patched planks, the town colour first. */
const candyCols = (color) => [color, color, LEMON, LEMON, TEAL, TEAL, BUBBLE, BUBBLE, SKY, SKY, color, color];
/** Stripes for a tarp or awning: path data of bands across a w × h box (local coords). */
function stripesD(w, h, step = 8) {
  let d = '';
  for (let x = 0; x < w - 0.5; x += step * 2) d += `M${N(x)} 0H${N(Math.min(w, x + step))}V${N(h)}H${N(x)}Z`;
  return d;
}
function door(x, y, w, h, col, o = {}) {
  let s = o.arch ? path(`${M(x, y + h)}V${N(y + w / 2)}A${N(w / 2)} ${N(w / 2)} 0 0 1 ${N(x + w)} ${N(y + w / 2)}V${N(y + h)}Z`, col, { sw: 1.4 }) : rect(x, y, w, h, col, { sw: 1.4 });
  if (o.glass) s += rect(x + w * 0.25, y + (o.arch ? w * 0.45 : 3), w * 0.5, h * 0.28, o.lit || NITE ? LIT : GLASS, { sw: 0.9 });
  return s + circ(x + w - 2.4, y + h * 0.58, 1.1, o.knob || GOLD, { sw: 0.7 });
}

// --- Small owner bits (homes) ------------------------------------------------------------------

/**
 * A mailbox on a post standing at screen (x, y): golden for golden survivors, the red flag up
 * while the owner has a wish open, the owner's name on a little board under it.
 */
function mailbox(x, y, golden, wish, name) {
  const c = golden ? GOLD : '#d6dbe3';
  let s = stick(`${M(x, y)}V${N(y - 14)}`, WOOD, 2.4, 1.8);
  s += path(`${M(x - 7, y - 13)}V${N(y - 19)}Q${N(x - 7)} ${N(y - 24.5)} ${N(x - 2)} ${N(y - 24.5)}H${N(x + 2)}Q${N(x + 7)} ${N(y - 24.5)} ${N(x + 7)} ${N(y - 19)}V${N(y - 13)}Z`, c, { sw: 1.4 });
  s += line(`${M(x - 5, y - 20)}Q${N(x - 4)} ${N(y - 23)} ${N(x - 1)} ${N(y - 23)}`, '#ffffff', 1.3, { op: 0.8 });
  s += wish ? path(`${M(x + 6, y - 14)}V${N(y - 32)}H${N(x + 13)}V${N(y - 26.5)}H${N(x + 8.6)}V${N(y - 14)}Z`, RED, { sw: 1.1 }) : path(`${M(x + 6, y - 14)}H${N(x + 14)}V${N(y - 17.4)}H${N(x + 6)}Z`, RED, { sw: 1.1 });
  if (name) s += rect(x - 12, y - 11.5, 24, 7.5, CREAM, { sw: 1, rx: 1.5 }) + fitText(x - 11.5, y - 11.5, 23, 7.5, name, O, { k: 0.9 });
  if (golden) s += sparkle(x - 9.5, y - 27, 3.6);
  return s;
}

/** Hat silhouettes for the roof weathervane, bottom-centre at (0, 0) (drawn scaled up). */
function hatVane(hat, col) {
  switch (hat) {
    case 'cap':
      return path('M-5.5 0Q-5.5 -8 0 -8Q5.5 -8 5.5 0Z', col, { sw: 1.2 }) + path('M3 -1L10 -0.5Q10.5 1.8 8 1.8L2 1.4Z', dk(col, 0.15), { sw: 1.1 }) + circ(1, -5, 1.3, WHITE, { ns: 1 });
    case 'headphones':
      return line('M-6 -1Q-6 -10 0 -10Q6 -10 6 -1', O, 2.8) + line('M-6 -1Q-6 -10 0 -10Q6 -10 6 -1', '#5a5f6e', 1.2) + rect(-8.5, -5, 5, 7, col, { sw: 1.1, rx: 1.5 }) + rect(3.5, -5, 5, 7, col, { sw: 1.1, rx: 1.5 });
    case 'bucket':
      return path('M-4.5 -1Q-4.5 -8.5 0 -8.5Q4.5 -8.5 4.5 -1Z', '#d8c48a', { sw: 1.2 }) + path('M-8.5 1.5Q0 -3.5 8.5 1.5Q0 -0.5 -8.5 1.5Z', '#c2ad70', { sw: 1.1 }) + line('M-4.3 -3H4.3', '#8a7440', 1.4);
    case 'flowers':
      return path(cpath([[-5, -3, 3], [5, -3, 3]]), PINK, { sw: 1 }) + circ(0, -6, 3.3, YELLOW, { sw: 1 }) + path(cpath([[-5, -3, 1], [5, -3, 1], [0, -6, 1.1]]), '#ff8a3a', { ns: 1 }) + path('M-2 0.5Q0 -2 2 0.5Z', GREEN, { sw: 0.9 });
    case 'hardhat':
      return path('M-6 0Q-6 -9 0 -9Q6 -9 6 0Z', '#ffcc2e', { sw: 1.2 }) + rect(-8.5, -1, 17, 2.8, '#ffd84a', { sw: 1.1, rx: 1.2 }) + line('M0 -8.5V-1.5', '#e09d14', 1.6);
    case 'bandana':
      return path('M-6.5 -5Q0 -9.5 6.5 -5L0 2Z', col, { sw: 1.2 }) + path(cpath([[-2, -4.5, 0.9], [2.4, -5, 0.9], [0, -1.6, 0.9]]), WHITE, { ns: 1 }) + path('M6 -5l4 -2l-1 3l2 2z', col, { sw: 1 });
    default:
      return circ(0, -4, 2.8, GOLD, { sw: 1.1 });
  }
}

/** The roof weathervane: a pole, the arrow and the owner's hat, big enough to read. Base at (x, y). */
function weathervane(x, y, hat, col) {
  let s = stick(`${M(x, y)}V${N(y - 13)}`, '#5a5f6e', 1.3, 1.8);
  s += line(`${M(x - 9, y - 8)}H${N(x + 8)}`, O, 1.5) + path(`${M(x + 10.5, y - 8)}L${N(x + 5.5)} ${N(y - 11)}V${N(y - 5)}Z`, '#5a5f6e', { sw: 1 }) + path(`${M(x - 9, y - 8)}l-3 -3h3.5l2 3l-2 3h-3.5z`, '#5a5f6e', { sw: 1 });
  return s + g(hatVane(hat, col), { tf: `translate(${N(x)} ${N(y - 13)}) scale(1.45)` });
}

/** Mascot ears (bear 0, bunny 1, duck 2) standing on a roof at two screen points. */
function ears(kind, a, b) {
  if (kind === 1) {
    return [a, b].map(([x, y], i) => g(ell(0, -9.5, 4.2, 10.5, '#f5f0e6', { sw: 1.5 }) + ell(0, -9.5, 1.9, 6.5, '#ffb3c8', { ns: 1 }), { tf: `translate(${N(x)} ${N(y)}) rotate(${i ? 14 : -14})` })).join('');
  }
  if (kind === 2) {
    const [x, y] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return g(path('M-3 0Q-6 -9 -1 -12Q-2 -6 1 -3Q2 -10 7 -10Q3 -5 3 0Z', '#ffd43b', { sw: 1.2 }), { tf: `translate(${N(x)} ${N(y)}) scale(1.4)` });
  }
  return [a, b].map(([x, y]) => circ(x, y - 5.5, 6.2, '#b07444', { sw: 1.5 }) + circ(x, y - 5.5, 3, '#e2ad82', { ns: 1 })).join('');
}

/** A class prop leaning against a wall, base at (x, y), about 20 px tall. */
function propLean(name, x, y, col, k = 1.35) {
  let s;
  switch (name) {
    case 'bat':
      s = path('M-1.2 0L-1.6 -6Q-3 -12 -3 -15Q-3 -17 0 -17Q3 -17 3 -15Q3 -12 1.6 -6L1.2 0Z', WOOD, { sw: 1.1 }) + line('M-1.3 -1.5H1.3', '#4a3326', 1.6);
      break;
    case 'pan':
      s = rect(-1, -8, 2, 8, '#5a3a2a', { sw: 0.9 }) + circ(0, -12, 5.5, '#4a4f5c', { sw: 1.2 }) + circ(0, -12, 3.8, '#5a606e', { ns: 1 });
      break;
    case 'foamhand':
      s = path('M-4 0V-7Q-4 -9 -2 -9.5V-16Q-2 -17.5 -0.5 -17.5Q1 -17.5 1 -16V-9.5Q4 -9.5 4.5 -7.5V0Z', YELLOW, { sw: 1.1 }) + rect(-4.5, -2.5, 9, 3, RED, { sw: 0.9 });
      break;
    case 'rifle':
      s = rect(-1, -18, 2, 10, '#6a7384', { sw: 0.9 }) + path('M-1.6 -9H1.6L2.6 0H-2.6Z', WOOD, { sw: 1 }) + circ(0, -18.5, 1.3, ORANGE, { ns: 1 });
      break;
    case 'slingshot':
      s = path('M-1 0V-8L-4 -14M1 0V-8L4 -14', 'none', { stroke: O, sw: 3.4 }) + path('M-1 0V-8L-4 -14M1 0V-8L4 -14', 'none', { stroke: WOOD, sw: 1.8 }) + line('M-4 -13.5Q0 -10 4 -13.5', RED, 1.1);
      break;
    case 'blaster':
      s = path('M-5 -11H4Q5 -11 5 -10V-6Q5 -5 4 -5H-1V0H-4V-5H-5Z', ORANGE, { sw: 1.1 }) + circ(-3, -13.5, 3, '#8fd8ff', { sw: 1 }) + rect(4.5, -9.5, 3, 2.5, YELLOW, { sw: 0.8 });
      break;
    case 'medkit':
      s = rect(-5.5, -9, 11, 9, CREAM, { sw: 1.1, rx: 1.5 }) + path('M-1 -7.5H1V-5.5H3V-3.5H1V-1.5H-1V-3.5H-3V-5.5H-1Z', RED, { ns: 1 }) + line('M-2 -9V-10.5H2V-9', O, 1);
      break;
    case 'spray':
      s = rect(-3, -11, 6, 11, '#cdeeff', { sw: 1.1, rx: 1.5 }) + rect(-3, -6, 6, 6, '#7be08a', { ns: 1, op: 0.8 }) + path('M-2 -11V-14H4V-12H1V-11Z', GREEN, { sw: 0.9 });
      break;
    case 'defib':
      s = rect(-5.5, -9, 11, 9, RED, { sw: 1.1, rx: 1.5 }) + path('M0.5 -7.5L-2 -4H0L-1 -1.5L2 -5H0Z', '#ffe14a', { ns: 1 }) + line('M-2 -9V-10.5H2V-9', O, 1);
      break;
    case 'bomb':
      s = circ(0, -5.5, 5.5, '#3a3f52', { sw: 1.1 }) + line('M2 -10Q3 -13 5.5 -13.5', '#c7a26a', 1.2) + star(6, -14, 2.4, '#ffd23a', { sw: 0.7 });
      break;
    case 'wrench':
      s = rect(-1.3, -12, 2.6, 12, STEEL, { sw: 1, rx: 1 }) + path('M-1.6 -11.5Q-5 -13 -3.5 -17L-1.5 -15H1.5L3.5 -17Q5 -13 1.6 -11.5Z', STEEL, { sw: 1 }) + rect(-1.6, -4, 3.2, 4, RED, { ns: 1 });
      break;
    case 'trap':
      s = rect(-6, -2.5, 12, 2.5, '#6a5040', { sw: 1 }) + path('M-5 -2.5Q-5 -9 0 -9Q5 -9 5 -2.5', 'none', { stroke: O, sw: 2.6 }) + path('M-5 -2.5Q-5 -9 0 -9Q5 -9 5 -2.5', 'none', { stroke: STEEL, sw: 1.2 }) + circ(0, -2.5, 1.5, YELLOW, { sw: 0.8 });
      break;
    default:
      return '';
  }
  void col;
  const upright = ['medkit', 'defib', 'trap', 'bomb', 'spray'].includes(name);
  return g(s, { tf: `translate(${N(x)} ${N(y)}) rotate(${upright ? 0 : -16}) scale(${k})` });
}

// --- Town name ---------------------------------------------------------------------------------

/** The name shown on signs: uppercase, at most 10 characters (whole words, else 9 and an ellipsis). */
function townLabel(town, fallback = 'LAST STOP') {
  const s = String(town || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!s) return fallback;
  if (s.length <= 10) return s;
  const words = s.split(' ');
  while (words.length > 1 && words.join(' ').length > 10) words.pop();
  const j = words.join(' ');
  return j.length <= 10 ? j : `${j.slice(0, 9)}…`;
}
const paint = (color) => (isHex(color) ? color : RED);
/** Pennant colours: the town colour first, then cheerful neighbours. */
const pennantCols = (color) => [color, WHITE, YELLOW, BLUE === color ? GREEN : BLUE].filter((c, i, a) => a.indexOf(c) === i);
/** A gold trim edge along screen path d (level 7). */
const goldTrim = (d) => line(d, O, 4.4) + line(d, GOLD, 2.4) + line(d, '#fff3b0', 0.8, { op: 0.9 });

/** Path data in its shortest form: each segment absolute or relative, whichever is shorter. */
const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const fmt = (n) => {
  let s = String(Math.round(n * 100) / 100);
  if (s === '-0') s = '0';
  return s.replace(/^(-?)0\./, '$1.');
};
function join(nums) {
  let out = '';
  for (const n of nums) {
    const t = fmt(n);
    if (!out || t[0] === '-' || (t[0] === '.' && /\.\d*$/.test(out.split(/[ -]/).pop()))) out += t;
    else out += ' ' + t;
  }
  return out;
}
function minPath(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
  if (!toks) return d;
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let out = '';
  let last = '';
  let cmd = '';
  let first = true;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const lc = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const n = ARGS[lc];
    if (n === undefined) return d;
    if (lc === 'z') {
      out += 'z';
      last = 'z';
      cx = sx;
      cy = sy;
      continue;
    }
    const a = toks.slice(i, i + n).map(Number);
    if (a.length < n || a.some((x) => Number.isNaN(x))) return d;
    i += n;
    // Absolute and relative forms of this segment.
    let abs;
    let rl;
    let nx;
    let ny;
    if (lc === 'h') {
      nx = rel ? cx + a[0] : a[0];
      ny = cy;
      abs = [nx];
      rl = [nx - cx];
    } else if (lc === 'v') {
      nx = cx;
      ny = rel ? cy + a[0] : a[0];
      abs = [ny];
      rl = [ny - cy];
    } else if (lc === 'a') {
      nx = rel ? cx + a[5] : a[5];
      ny = rel ? cy + a[6] : a[6];
      abs = [a[0], a[1], a[2], a[3], a[4], nx, ny];
      rl = [a[0], a[1], a[2], a[3], a[4], nx - cx, ny - cy];
    } else {
      const pts = [];
      for (let k = 0; k < n; k += 2) pts.push([rel ? cx + a[k] : a[k], rel ? cy + a[k + 1] : a[k + 1]]);
      abs = pts.flat();
      rl = pts.flatMap(([x, y]) => [x - cx, y - cy]);
      [nx, ny] = pts[pts.length - 1];
    }
    const U = lc.toUpperCase();
    // A flag pair in arcs must stay as separate tokens: write them with spaces.
    const ser = (c, nums) => (lc === 'a' ? `${c}${nums.map(fmt).join(' ')}` : c + join(nums));
    let A = ser(U, abs);
    let R = ser(lc, rl);
    if (first) R = A; // the first moveto is always absolute
    // Drop a repeated command letter (implicit repeat), when it is safe.
    const strip = (str, c) => (last === c && c !== 'm' && c !== 'M' && lc !== 'a' ? (/^-/.test(str.slice(1)) ? str.slice(1) : ' ' + str.slice(1)) : str);
    A = strip(A, U);
    R = strip(R, lc);
    const useA = A.length <= R.length;
    out += useA ? A : R;
    last = useA ? U : lc;
    if (lc === 'm') {
      sx = nx;
      sy = ny;
      // after a moveto, an implicit repeat would mean lineto: never strip the next letter
      last = '';
    }
    cx = nx;
    cy = ny;
    first = false;
  }
  return out;
}

/** Shorter markup: inherited outline colour, short hex, shortest path data, no float noise. */
function mini(s) {
  return s
    .replace(/-?\d+\.\d{3,}/g, (m) => String(Math.round(Number(m) * 100) / 100))
    .replace(/ stroke="#2a1b12"/g, '')
    .replace(/ fill="none"/g, '')
    .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3(?=")/gi, '#$1$2$3')
    .replace(/ d="([^"]*)"/g, (m, d) => ` d="${minPath(d)}"`)
    .replace(/="0\./g, '=".')
    .replace(/ 0\.(\d)/g, ' .$1');
}

/** The root group's inherited presentation (outline, joins, the sign font). */
const ROOT = `fill="none" stroke="${O}" stroke-width="${SW0}" stroke-linejoin="round" stroke-linecap="round" font-family="system-ui,sans-serif" font-weight="900" text-anchor="middle"`;
function svgWrap(W, H, inner, cls) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" overflow="visible" class="${cls}"><g ${ROOT}>${mini(inner)}</g></svg>`;
}

// --- Buildings ---------------------------------------------------------------------------------

const BH = { bigtop: 200, crate: 120, vault: 122, striker: 164, gallery: 152, tent: 124, garage: 154 };

/**
 * The Gas Station (3×3): the shop along the back (its door on the right side), a canopy over
 * the pumps front-left, the bus bay front-right (the parked bus hides neither pumps nor door).
 * Roof campers stand in a row on the shop roof in front of the sign (ANCHORS.bigtop.roof).
 */
const GS = { u0: 0.15, v0: 0.15, u1: 2.55, v1: 1.2, zH: 50, cz: 44, sv: 0.3, campV: 0.95, campU: [0.5, 1.1, 1.7, 2.3] };
function gasStation(level, color, town, nflags) {
  const st = STAGES[level];
  const F = frame(3, 3, BH.bigtop);
  const name = st === 1 ? 'LAST STOP' : townLabel(town);
  const { u0, v0, u1, v1, zH, cz, sv } = GS;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const lit = st === 3;
  let s = '';
  // Forecourt, cracks or paint, and the bus bay (front-right).
  s += face(F, [[0.06, 0.06], [2.94, 0.06], [2.94, 2.94], [0.06, 2.94]], st === 1 ? '#ddd5c2' : CONC, { sw: 1.3 });
  if (st === 1) s += line(`${M(...F.p(1.7, 1.5))}l9 5l-3 4l8 4M${xy(F, 2.6, 1.5)}l-8 3l2 4`, O, 1, { op: 0.35 }) + onT(F, 1.6, 1.4, 0, ell(10, 8, 8, 5, '#5a5248', { ns: 1, op: 0.25 }));
  s += onT(F, 1.95, 1.95, 0, st === 1 ? line('M3 3H29V29H3Z', '#ffffff', 1.8, { dash: '4 3', op: 0.9 }) : line('M3 3H29V29H3Z', LEMON, 2.4) + txt(16, 20, 'BUS', 10, LEMON));
  // The shop.
  let lf;
  let rf;
  if (st === 1) {
    lf = plankWall(LW, zH, candyCols(color)) + boarded(4, 14, 16, 16) + boarded(38, 13, 34, 20) + star(29, 22, 5, WHITE, { sw: 1 });
    rf = plankWall(RW, zH, [BUBBLE, BUBBLE, SKY, LEMON, LEMON, TEAL]) + door(4, 21, 12, zH - 21, color) + line(`M5.5 23L14.5 ${zH - 2}`, WOOD_D, 1.2) + boarded(20, 14, 11, 13);
  } else {
    const band = (w) => rect(0, 0, w, 8, color, { ns: 1 }) + line(`M0 8.5H${N(w)}`, O, 1.2) + line(`M0 4H${N(w)}`, '#ffffff', 1.2, { op: 0.55 });
    lf = band(LW) + win(4, 15, 16, 16, { lit }) + win(38, 14, 34, 20, { lit });
    if (lit) lf += line('M42 18H68V30H42Z', PINK, 1.2) + txt(55, 27.5, 'OPEN', 7.5, PINK);
    rf = band(RW) + door(4, 20, 12, zH - 20, color, { glass: true, lit }) + win(20, 15, 11, 13, { lit });
  }
  const roofC = st === 1 ? '#c9c2b2' : '#ebe4d6';
  let tf = '';
  if (st === 1) tf = path('M8 6L40 3L44 22L12 27Z', ORANGE, { sw: 1.2 }) + line('M14 5.5L17 26M24 4.5L27 25M34 3.5L37 23.5', WHITE, 2, { op: 0.8 });
  else tf = rect(6, 6, 9, 9, '#cfc8ba', { sw: 1.1 });
  s += shadowBox(F, u0, v0, u1, v1, 0.18);
  s += box(F, u0, v0, u1, v1, 0, zH, st === 1 ? WOOD : CREAM, { lf, rf, top: roofC, tf });
  if (st > 1 && level < 7) s += stick(`M${xy(F, u0, v1, zH)}L${xy(F, u1, v1, zH)}L${xy(F, u1, v0, zH)}`, color, 2.2, 2.2);
  // The sign on posts along the roof's back edge (high enough to clear the roof campers).
  const SW = 2.2 * 32;
  const sh = 22;
  const sz = zH + 12;
  s += stick([0.55, 2.05].map((u) => `M${xy(F, u, sv, zH)}V${N(F.p(u, sv, sz + 4)[1])}`).join(''), st === 1 ? WOOD_D : STEEL_D, 2.4, 2);
  let b = '';
  if (st === 1) {
    // A plank sign, each plank a different candy colour, the letters painted white.
    const pc = [color, LEMON, TEAL];
    b += path(`M0 0H${N(SW * 0.36)}V8H0Z`, pc[0], { sw: 1.3 }) + path(`M${N(SW * 0.36)} -1H${N(SW * 0.7)}V8H${N(SW * 0.36)}Z`, pc[1], { sw: 1.3 }) + path(`M${N(SW * 0.7)} 0.5H${N(SW)}V8H${N(SW * 0.7)}Z`, pc[2], { sw: 1.3 });
    b += path(`M1 8H${N(SW - 2)}V${sh}H1Z`, BUBBLE, { sw: 1.3 }) + path(cpath([[4, 4, 0.9], [SW - 4, 4, 0.9], [4, 15, 0.9], [SW - 5, 15, 0.9]]), '#5b4636', { ns: 1 });
    b = g(b + fitText(2, 1, SW - 4, sh - 2, name, '#ffffff', { ol: O, olw: 2.4 }), { tf: `rotate(-2.5 ${N(SW / 2)} 10)` });
  } else if (st === 2) {
    b += rect(0, 0, SW, sh, color, { sw: 1.8, rx: 2 }) + rect(2.5, 2.5, SW - 5, sh - 5, 'none', { stroke: '#ffffff', sw: 1, op: 0.85 });
    b += fitText(4, 1, SW - 8, sh - 2, name, '#ffffff', { ol: O, olw: 2.4 });
    b += bulbs(Array.from({ length: 9 }, (_, i) => [5 + i * ((SW - 10) / 8), -3]), true, 1.7);
  } else {
    b += rect(-3, -3, SW + 6, sh + 6, color, { ns: 1, op: 0.3 }) + rect(0, 0, SW, sh, NIGHT, { sw: 1.8, rx: 3 });
    b += rect(2.5, 2.5, SW - 5, sh - 5, 'none', { stroke: color, sw: 2.6, op: 0.45 }) + rect(2.5, 2.5, SW - 5, sh - 5, 'none', { stroke: lt(color, 0.55), sw: 1.1 });
    b += fitText(4, 1, SW - 8, sh - 2, name, '#ffffff', { ol: color, olw: 3 });
    b += bulbs(Array.from({ length: 9 }, (_, i) => [5 + i * ((SW - 10) / 8), -3]), true, 1.7);
  }
  s += onL(F, 0.22, sv, sz + sh, b);
  if (level >= 7) {
    const [x, y] = F.p(0.22 + 1.1, sv, sz + sh);
    s += star(x, y - 9, 7.5, GOLD, { sw: 1.4 });
  }
  // The flag pole on the back-right corner: one flag per zone.
  {
    const [x, y] = F.p(2.42, 0.32, zH);
    const n = Math.max(1, Math.min(6, nflags | 0 || 1));
    const top = y - 56 - n * 2;
    s += stick(`${M(x, y)}V${N(top)}`, '#e8e2d6', 1.6, 2) + circ(x, top - 1, 2.2, GOLD, { sw: 1 });
    for (let i = 0; i < n; i++) {
      const fy = top + 2 + i * 8;
      s += path(`${M(x, fy)}L${N(x + 14)} ${N(fy + 3)}L${N(x)} ${N(fy + 7)}Z`, i === 0 ? color : CONFETTI[(i + 2) % 6], { sw: 1.2 });
    }
  }
  // Pennants along the shop's front roof edge.
  s += pennants(F.p(0.22, v1, zH), F.p(u1 - 0.06, v1, zH), level, pennantCols(color), 3);
  // Patched: tyres and a drum, candy-painted, by the shop's right corner.
  if (st === 1) s += tyres(...F.p(2.78, 1.45), 3, 7) + line(`${M(...F.p(2.78, 1.45, 8))}h-5`, WHITE, 1.4) + drum(...F.p(2.86, 1.95), TEAL, 12, 5.5);
  else {
    const [ax, ay] = F.p(2.82, 1.55);
    if (st === 2) s += stick(`${M(ax, ay)}V${N(ay - 14)}`, STEEL_D, 2, 1.8) + rect(ax - 4.5, ay - 24, 9, 11, RED, { sw: 1.3, rx: 2 }) + circ(ax, ay - 19.5, 2.4, WHITE, { sw: 0.9 });
    s += tyres(...F.p(2.85, 1.95), 2, 6.5);
  }
  // The canopy: back posts, the pump island and pumps, front posts, the slab.
  const postC = st === 1 ? WOOD_D : WHITE;
  const post = (...uv) => stick(uv.map(([u, v]) => `M${xy(F, u, v)}V${N(F.p(u, v, cz)[1])}`).join(''), postC, 3.4, 2.2);
  s += post([0.3, 1.65], [1.35, 1.65]);
  s += box(F, 0.3, 2.02, 1.22, 2.32, 0, 3, st === 1 ? '#e6dcc6' : '#e7e1d3', { sw: 1.4 });
  const pump = (u, v, c) => {
    let p = box(F, u, v, u + 0.26, v + 0.22, 3, 18, c, { lf: rect(1.3, 2.5, 5.8, 6.5, '#eaf7ff', { sw: 0.9 }) + rect(2, 12.5, 4.4, 2.6, O, { ns: 1, op: 0.35 }), top: lt(c, 0.35) });
    const [hx, hy] = F.p(u + 0.26, v + 0.1, 13);
    p += line(`${M(hx, hy)}q6 3 3 10q-2 3 -6 3`, O, 1.8);
    const [gx, gy] = F.p(u + 0.13, v + 0.11, 21);
    p += circ(gx, gy - 2.5, 3.4, lit ? '#fff4b8' : WHITE, { sw: 1.2 });
    if (NITE) p += circ(gx, gy - 2.5, 6.5, '#ffe27a', { ns: 1, op: 0.35 });
    return p;
  };
  if (st === 1) s += drum(...F.p(0.55, 2.17, 3), BUBBLE, 11, 5) + pump(0.83, 2.07, color) + star(...F.p(0.96, 2.29, 14), 3, WHITE, { sw: 0.8 });
  else s += pump(0.4, 2.07, color) + pump(0.83, 2.07, color);
  s += post([0.3, 2.7], [1.35, 2.7]);
  {
    const fw = 1.25 * 32;
    const fr = 1.25 * 32;
    let clf;
    let crf;
    let ctf = '';
    if (st === 1) {
      // A striped tarp stretched over the posts.
      clf = path(stripesD(fw, 6, 5), WHITE, { ns: 1 });
      crf = path(stripesD(fr, 6, 5), WHITE, { ns: 1 });
      ctf = path(stripesD(fw, fr, 5), WHITE, { ns: 1 }) + line('M4 6L36 34', O, 0.8, { op: 0.25 });
    } else {
      clf = line(`M0 3H${N(fw)}`, '#ffffff', 1.6);
      crf = line(`M0 3H${N(fr)}`, '#ffffff', 1.6);
    }
    s += box(F, 0.2, 1.55, 1.45, 2.8, cz, 6, color, { lf: clf, rf: crf, top: st === 1 ? color : WHITE, tf: ctf });
  }
  // On the canopy roof: a barrel garden (Fixed up), the lookout and a planter (Proud).
  const cTop = cz + 6;
  const planter = (u, v, c) => {
    const [x, y] = F.p(u, v, cTop);
    return drum(x, y, c, 8, 5) + path(cpath([[x - 3, y - 10, 3.4], [x + 2, y - 11.5, 3.6], [x + 4, y - 9, 2.6]]), GRASS, { sw: 1.1 }) + path(cpath([[x - 2, y - 12, 1.3], [x + 3, y - 13, 1.3]]), PINK, { ns: 1 });
  };
  if (st === 2) s += planter(0.45, 1.8, BLUE === color ? RED : BLUE) + planter(1.25, 2.55, GREEN === color ? ORANGE : GREEN);
  if (st === 3) {
    const lz = cTop;
    const lp = [[0.45, 2.0], [1.3, 2.0], [0.45, 2.65], [1.3, 2.65]];
    const rail = (pts) => line(pts.map(([u, v], i) => (i ? 'L' : 'M') + xy(F, u, v, lz + 9)).join(''), O, 2.2);
    s += rail([[0.3, 2.75], [0.3, 1.85], [1.4, 1.85]]);
    s += stick(lp.map(([u, v]) => `M${xy(F, u, v, lz)}V${N(F.p(u, v, lz + 24)[1])}`).join(''), WOOD, 2, 1.8);
    s += rail([[0.3, 2.75], [1.4, 2.75], [1.4, 1.85]]);
    s += roofHip(F, 0.45, 2.0, 1.3, 2.65, lz + 24, 14, color, { ov: 0.12 });
    const [fx, fy] = F.p(0.875, 2.325, lz + 38);
    s += flag(fx, fy + 1, 14, YELLOW, 1, true);
    s += lights(F.p(1.45, 2.8, cTop), F.p(u1, v1, zH), 7, 7);
  }
  if (NITE) s += face(F, [[0.3, 1.7], [1.35, 1.7], [1.35, 2.7], [0.3, 2.7]], LIT, { ns: 1, op: 0.22 });
  if (level >= 7) s += goldTrim(`M${xy(F, u0, v1, zH)}L${xy(F, u1, v1, zH)}L${xy(F, u1, v0, zH)}M${xy(F, 0.2, 2.8, cTop)}L${xy(F, 1.45, 2.8, cTop)}L${xy(F, 1.45, 1.55, cTop)}`);
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-bigtop ls-st${st}`), artH: F.H, bodyH: 80 };
}

/** The Drop Pad (2×2): pallets with a chalk X → a painted H and windsock → a light ring and beacon. */
function dropPad(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.crate);
  let s = '';
  const pz = st === 1 ? 5 : 4;
  if (st === 1) {
    // Back corner junk: a rag flag on a stick and two crates.
    const [sx, sy] = F.p(0.12, 0.12);
    s += stick(`${M(sx, sy)}V${N(sy - 40)}`, WOOD_D, 2, 1.8) + path(`${M(sx, sy - 40)}q8 -2 14 2q-4 4 0 8q-7 -3 -14 -1z`, color, { sw: 1.3 }) + path(`${M(sx + 5, sy - 40.6)}q3 0 4 1v8q-2 -1 -4 -1z`, WHITE, { ns: 1 });
    // Pallets, two of them candy-painted; the spray-painted X runs along the tile axes so it
    // reads as an X on screen (not a + sparkle).
    const pal = (a, b, c, d, col) => box(F, a, c, b, d, 0, pz, col, { lf: path('M1 1.5h3v2.5h-3zM10.5 1.5h3v2.5h-3zM20 1.5h3v2.5h-3z', '#5b3f28', { ns: 1, op: 0.7 }), top: lt(col, 0.25), tf: vlines((b - a) * 32, (d - c) * 32, 5, dk(col, 0.3), 0.5), sw: 1.6 });
    s += pal(0.2, 0.97, 0.2, 0.97, WOOD_L) + pal(1.03, 1.8, 0.2, 0.97, TEAL) + pal(0.2, 0.97, 1.03, 1.8, BUBBLE) + pal(1.03, 1.8, 1.03, 1.8, WOOD_L);
    s += onT(F, 0.2, 0.2, pz, line('M6 25.6H45.2M25.6 6V45.2', '#ffffff', 9, { op: 0.9 }) + line('M6 25.6H45.2M25.6 6V45.2', color, 6));
    // Two spare crates on the back pallet.
    s += box(F, 0.24, 0.24, 0.56, 0.56, pz, 11, LEMON, { lf: line('M2 2L8 9M8 2L2 9', WOOD_D, 1.2), rf: line('M2 2L8 9M8 2L2 9', WOOD_D, 1.2), sw: 1.6 });
    s += box(F, 0.3, 0.3, 0.52, 0.52, pz + 11, 8, SKY, { sw: 1.5 });
    s += cone(...F.p(1.88, 0.2)) + cone(...F.p(0.2, 1.88));
    s += pennants(F.p(0.12, 0.12, 36), F.p(1.86, 0.22, 13), level, pennantCols(color), 3);
  } else {
    const lf = rect(0, 0, 54.4, 4, YELLOW, { ns: 1 }) + line('M2 4L6 0M10 4L14 0M18 4L22 0M26 4L30 0M34 4L38 0M42 4L46 0M50 4L54 0', O, 2.2);
    const tf = circ(27.2, 27.2, 21, 'none', { stroke: color, sw: 5 }) + g(path('M-7 -9V9M7 -9V9M-7 0H7', 'none', { stroke: '#ffffff', sw: 4.4 }), { tf: 'translate(27.2 27.2) rotate(-45)' });
    s += shadowBox(F, 0.15, 0.15, 1.85, 1.85, 0.12);
    s += box(F, 0.15, 0.15, 1.85, 1.85, 0, pz, '#b9b3a6', { lf, rf: lf, top: '#cfc9bc', tf });
    // Windsock at the back corner.
    const [wx, wy] = F.p(0.25, 0.25, pz);
    s += stick(`${M(wx, wy)}V${N(wy - 46)}`, WHITE, 2, 2) + line(`${M(wx, wy - 12)}V${N(wy - 18)}M${N(wx)} ${N(wy - 26)}V${N(wy - 32)}`, RED, 2);
    s += path(`${M(wx + 1, wy - 47)}L${N(wx + 20)} ${N(wy - 44)}L${N(wx + 20)} ${N(wy - 39)}L${N(wx + 1)} ${N(wy - 39)}Z`, ORANGE, { sw: 1.3 }) + path(`${M(wx + 7.5, wy - 45.8)}L${N(wx + 13.5)} ${N(wy - 44.8)}V${N(wy - 39)}H${N(wx + 7.5)}Z`, WHITE, { ns: 1 }) + line(`${M(wx + 1, wy - 47)}L${N(wx + 20)} ${N(wy - 44)}L${N(wx + 20)} ${N(wy - 39)}L${N(wx + 1)} ${N(wy - 39)}`, O, 1.3);
    // Corner lights.
    const corners = [[0.22, 1.78], [1.78, 1.78], [1.78, 0.22]].map(([u, v]) => F.p(u, v, pz + 1.5));
    s += bulbs(corners, st === 3, 1.8, '#9ff0ff');
    if (st === 3) {
      // A ring of lights round the H.
      const ring = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ring.push(tpt(F, 0.15, 0.15, pz, 27.2 + Math.cos(a) * 25.5, 27.2 + Math.sin(a) * 25.5));
      }
      s += bulbs(ring, true, 1.5);
      // The beacon mast at the right corner.
      const [bx, by] = F.p(1.8, 0.2, pz);
      s += line(`${M(bx - 3, by)}L${N(bx)} ${N(by - 40)}L${N(bx + 3)} ${N(by)}M${N(bx - 2.2)} ${N(by - 10)}L${N(bx + 1.6)} ${N(by - 20)}L${N(bx - 1)} ${N(by - 30)}`, O, 1.4);
      s += circ(bx, by - 46, 10, RED, { ns: 1, op: 0.3, cls: 'ls-beacon' }) + path(`${M(bx - 4.5, by - 41)}Q${N(bx - 4.5)} ${N(by - 50)} ${N(bx)} ${N(by - 50)}Q${N(bx + 4.5)} ${N(by - 50)} ${N(bx + 4.5)} ${N(by - 41)}Z`, '#ff6a5a', { sw: 1.3 }) + rect(bx - 6, by - 42, 12, 3, STEEL_D, { sw: 1.2 }) + circ(bx - 1.5, by - 46.5, 1.3, '#ffffff', { ns: 1 });
      s += pennants(F.p(0.25, 0.25, pz + 44), F.p(1.8, 0.2, pz + 38), level, pennantCols(color), 3);
    } else {
      // A low post at the right corner.
      const [bx, by] = F.p(1.8, 0.2, pz);
      s += stick(`${M(bx, by)}V${N(by - 16)}`, WHITE, 2, 2) + circ(bx, by - 17, 2, color, { sw: 1 });
      s += pennants(F.p(0.25, 0.25, pz + 44), F.p(1.8, 0.2, pz + 16), level, pennantCols(color), 3);
    }
    if (level >= 7) s += goldTrim(`M${xy(F, 0.15, 1.85, pz)}L${xy(F, 1.85, 1.85, pz)}L${xy(F, 1.85, 0.15, pz)}`);
  }
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-crate ls-st${st}`), artH: F.H, bodyH: st === 1 ? 14 : 8 };
}

/** The round vault door, drawn on a face (local coords), centre (cx, cy), radius r. */
function vaultDoor(cx, cy, r, st) {
  const ring = st === 3 ? '#e09a18' : st === 1 ? '#8f8a80' : '#b8bec8';
  const disc = st === 3 ? GOLD : st === 1 ? '#a39c8c' : '#cfd4dc';
  let s = circ(cx, cy, r + 2.5, dk(ring, 0.2), { sw: 1.4 }) + circ(cx, cy, r, disc, { sw: 1.6 });
  const bolts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bolts.push([cx + Math.cos(a) * (r - 2.8), cy + Math.sin(a) * (r - 2.8), 1]);
  }
  s += path(cpath(bolts), ring, { sw: 0.7 });
  s += circ(cx, cy, r * 0.42, ring, { sw: 1.2 }) + line(`${M(cx - r * 0.6, cy)}H${N(cx + r * 0.6)}M${N(cx)} ${N(cy - r * 0.6)}V${N(cy + r * 0.6)}`, O, 1.6) + circ(cx, cy, 1.6, O, { ns: 1 });
  s += rect(cx - r - 4, cy - 4, 3, 8, STEEL_D, { sw: 1 });
  if (st !== 1) s += path(`${M(cx - r * 0.6, cy - r * 0.55)}Q${N(cx - r * 0.2)} ${N(cy - r * 0.9)} ${N(cx + r * 0.3)} ${N(cy - r * 0.8)}`, 'none', { stroke: '#ffffff', sw: 1.4, op: 0.7 });
  return s;
}

/** The Bank Vault (2×2): a vault door in sandbags → a squat bank front → gold door and bulbs. */
function bankVault(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.vault);
  let s = '';
  if (st === 1) {
    const u0 = 0.3;
    const v0 = 0.3;
    const u1 = 1.7;
    const v1 = 1.35;
    const LW = (u1 - u0) * 32;
    const RW = (v1 - v0) * 32;
    // A salvaged vault, its concrete painted teal with a town-colour band and hand-painted stars.
    const band = (w) => rect(0, 0, w, 5, color, { ns: 1 }) + line(`M0 5.5H${N(w)}`, O, 1);
    const lf = band(LW) + line('M4 9l5 7l-2 6M40 8l-4 8l3 4', O, 1, { op: 0.3 }) + star(6, 26, 3.2, LEMON, { sw: 0.8 }) + star(LW - 6, 12, 3.2, WHITE, { sw: 0.8 }) + vaultDoor(LW / 2, 18, 12, 1) + line(`M${N(LW / 2 - 15)} 13L${N(LW / 2 + 15)} 23`, '#6b6a66', 2, { dash: '2 1.5' }) + rect(LW / 2 + 4, 17, 6, 6, GOLD, { sw: 1, rx: 1 });
    const rf = band(RW) + boarded(10, 10, 14, 12) + star(5, 26, 2.8, BUBBLE, { sw: 0.8 });
    s += shadowBox(F, u0, v0, u1, v1);
    s += box(F, u0, v0, u1, v1, 0, 32, TEAL, { lf, rf, top: lt(TEAL, 0.35), tf: path('M4 4L36 2L40 18L30 30L6 26Z', color, { sw: 1.2 }) + line('M12 3.4L16 27.4M24 2.7L28 28.6M33 2.1L36 24', WHITE, 2.2, { op: 0.85 }) });
    // Rubble on top.
    const [rx, ry] = F.p(0.55, 0.5, 32);
    s += drum(rx, ry, BUBBLE, 8, 4.5) + path(cpath([[rx - 2.5, ry - 10, 3], [rx + 2, ry - 11, 3.2]]), GRASS, { sw: 1 }) + circ(rx, ry - 12.5, 1.3, YELLOW, { ns: 1 });
    // Sandbag walls flanking the door (two rows, back to front).
    const bags = [];
    for (let row = 0; row < 2; row++) {
      for (const [ua, ub] of [[0.3, 0.72], [1.28, 1.7]]) {
        for (let k = 0; k < 3; k++) bags.push(F.p(ua + ((ub - ua) * (k + 0.5 + (row ? 0.25 : 0))) / 3.25, 1.62, 3 + row * 5.5));
      }
    }
    s += sandbags(bags);
    s += pennants(F.p(1.7, 1.35, 32), F.p(1.7, 0.3, 32), level, pennantCols(color), 3);
    s += tufts([F.p(0.25, 1.85), F.p(1.85, 0.6)], GRASS_D);
  } else {
    const u0 = 0.22;
    const v0 = 0.25;
    const u1 = 1.78;
    const v1 = 1.42;
    const zH = 36;
    const LW = (u1 - u0) * 32;
    const RW = (v1 - v0) * 32;
    const stone = '#efe2c4';
    const col = (x) => rect(x, 7, 5.5, zH - 7, WHITE, { sw: 1.2 }) + rect(x - 1, 6, 7.5, 2.4, WHITE, { sw: 1 }) + line(`M${N(x + 2.7)} 10V${N(zH - 1)}`, '#d8ccb0', 1);
    let lf = hlines(LW, zH, 6, '#c7b48c', 0.6) + rect(0, 0, LW, 6, st === 3 ? color : lt(color, 0.15), { ns: 1 }) + line(`M0 6H${N(LW)}`, O, 1.1);
    lf += col(3) + col(LW - 8.5) + vaultDoor(LW / 2, 21, 12, st);
    if (st === 3) {
      const ring = [];
      for (let i = 0; i < 11; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        ring.push([LW / 2 + Math.cos(a) * 17.5, 22 + Math.sin(a) * 17.5]);
      }
      lf += bulbs(ring, true, 1.4);
    }
    const rf = hlines(RW, zH, 6, '#c7b48c', 0.6) + rect(0, 0, RW, 6, st === 3 ? color : lt(color, 0.15), { ns: 1 }) + line(`M0 6H${N(RW)}`, O, 1.1) + win(11, 12, 15, 15, { frame: STEEL_D, lit: st === 3, bars: false }) + vlines(25, 26, 3.5, STEEL_D, 0.9, 13.5, 1.2, 11);
    s += shadowBox(F, u0, v0, u1, v1);
    // Steps.
    s += box(F, 0.6, 1.42, 1.4, 1.66, 0, 3, '#e6dcc6', { sw: 1.4 }) + box(F, 0.7, 1.42, 1.3, 1.55, 3, 3, '#e6dcc6', { sw: 1.4 });
    s += box(F, u0, v0, u1, v1, 0, zH, stone, { lf, rf, top: '#f6eedb' });
    // A temple-front gable: the pediment says BANK.
    const rh = 20;
    let ped = fitText(LW / 2 - 10, -8.5, 20, 7.5, 'BANK', '#ffffff', { ol: O, olw: 1.6 });
    if (st === 3) ped += bulbs([0.12, 0.28, 0.44, 0.56, 0.72, 0.88].map((t) => [LW * t, -2 * rh * (t < 0.5 ? t : 1 - t) + 1.5]), true, 1.3);
    s += roofV(F, u0, v0, u1, v1, zH, rh, '#c9c2b2', { wall: st === 3 ? color : lt(color, 0.2), gf: ped, trim: WHITE, ov: 0.06 });
    const rg = roofVGeo(u0, v0, u1, v1, zH, rh, { ov: 0.06 });
    s += pennants(F.p(rg.b, rg.q, rg.ze), F.p(rg.b, rg.p, rg.ze), level, pennantCols(color), 4);
    // A flag on the ridge.
    const [fx, fy] = F.p(rg.um, v0 + 0.15, rg.zt);
    s += flag(fx, fy, 18, color, 1, true);
    if (st === 3) {
      const [cx, cy] = F.p(1.62, 1.7);
      s += path(epath([[cx, cy - 1, 5, 2], [cx + 4, cy - 3.5, 4.5, 1.8], [cx - 2, cy - 4.5, 4.5, 1.8]]), GOLD, { sw: 1.1 });
    }
    if (level >= 7) s += goldTrim(`M${xy(F, rg.a, rg.q, rg.ze)}L${xy(F, rg.um, rg.q, rg.zt)}L${xy(F, rg.b, rg.q, rg.ze)}L${xy(F, rg.b, rg.p, rg.ze)}`);
  }
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-vault ls-st${st}`), artH: F.H, bodyH: st === 1 ? 34 : 44 };
}

/** A chain-link / net mesh over a w × h face (local coords): diagonal lines both ways. */
function mesh(w, h, step, color, op, sw = 0.8) {
  let d = '';
  for (let k = -h; k < w; k += step) {
    // Lines going down-right from (k, 0) and down-left from (k + h, 0), clipped to the rect.
    const x0 = Math.max(k, 0);
    const y0 = x0 - k;
    const x1 = Math.min(k + h, w);
    const y1 = x1 - k;
    if (x1 > x0) d += `M${N(x0)} ${N(y0)}L${N(x1)} ${N(y1)}`;
    const a0 = Math.min(k + h, w);
    const b0 = k + h - a0;
    const a1 = Math.max(k, 0);
    const b1 = k + h - a1;
    if (a0 > a1) d += `M${N(a0)} ${N(b0)}L${N(a1)} ${N(b1)}`;
  }
  return line(d, color, sw, { op });
}

/** The Batting Cage (2×2, Brawlers): chain-link → pitching machine → stadium lights. */
function battingCage(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.striker);
  const cls = CLASSES.brawler.color;
  const a = 0.2;
  const b = 1.8;
  const zH = 42;
  const postC = st === 1 ? LEMON : cls;
  const netC = st === 1 ? '#6f6e68' : '#3d3540';
  let s = '';
  // Floor.
  s += face(F, [[a, a], [b, a], [b, b], [a, b]], st === 1 ? '#e6c07e' : '#5fb54a', { sw: 1.4 });
  if (st >= 2) s += onT(F, a, a, 0, line('M4 12H48M4 24H48M4 36H48', '#4ea63c', 3, { op: 0.6 }));
  s += onT(F, a, a, 0, circ(13, 13, 9, st === 1 ? '#d4a462' : '#c9955a', { ns: 1 }) + rect(32, 32, 14, 14, 'none', { stroke: '#ffffff', sw: 1.4, op: 0.8 }) + path('M36 36H42V40L39 43L36 40Z', '#ffffff', { sw: 1 }));
  // Back posts and back nets.
  const postAt = (u, v, h = zH) => {
    const [x, y] = F.p(u, v);
    return stick(`${M(x, y)}V${N(y - h)}`, postC, 2.8, 2);
  };
  s += postAt(a, a);
  s += onL(F, a, a, zH, mesh(51.2, zH, 5, netC, st === 1 ? 0.7 : 0.55));
  s += onR(F, a, b, zH, mesh(51.2, zH, 5, netC, st === 1 ? 0.7 : 0.55));
  s += postAt(b, a) + postAt(a, b);
  // Inside: the pitcher.
  if (st === 1) {
    const [x, y] = F.p(0.5, 0.5);
    s += box(F, 0.38, 0.38, 0.66, 0.66, 0, 9, color, { lf: vlines(9, 9, 3, O, 0.4), sw: 1.6 });
    s += drum(...F.p(0.85, 0.42), TEAL, 8, 4.5) + path(cpath([[x + 9, y - 13, 1.6], [x + 12, y - 12.5, 1.6]]), WHITE, { sw: 0.8 });
  } else {
    const [x, y] = F.p(0.55, 0.55);
    s += line(`${M(x - 6, y + 2)}L${N(x)} ${N(y - 12)}L${N(x + 6)} ${N(y + 2)}M${N(x)} ${N(y - 12)}V${N(y + 4)}`, O, 1.6);
    s += box(F, 0.42, 0.45, 0.72, 0.68, 12, 9, cls, { top: lt(cls, 0.35), sw: 1.6 });
    const [wx, wy] = F.p(0.57, 0.68, 16);
    s += circ(wx, wy, 5.5, RUBBER, { sw: 1.3 }) + circ(wx, wy, 2, STEEL, { ns: 1 });
    const [cx, cy] = F.p(0.72, 0.6, 18);
    s += path(`${M(cx - 1, cy - 2)}l8 5l-2 3l-8 -4z`, STEEL, { sw: 1.2 });
  }
  // A ball in flight.
  {
    const [x, y] = F.p(1.05, 1.0, 22);
    s += line(`${M(x - 12, y - 6)}l7 3.5M${N(x - 11)} ${N(y - 1)}l6 2`, O, 1, { op: 0.4 }) + circ(x, y, 2.6, WHITE, { sw: 1.1 });
  }
  // Bat and bucket by the plate.
  s += propLean('bat', ...F.p(b - 0.06, b - 0.1), color, 1.1);
  s += drum(...F.p(1.45, 1.65), '#5a7fb0', 7, 4) + path(cpath([[F.p(1.45, 1.65)[0] - 1.5, F.p(1.45, 1.65)[1] - 7.5, 1.4], [F.p(1.45, 1.65)[0] + 1.6, F.p(1.45, 1.65)[1] - 8, 1.4]]), WHITE, { sw: 0.7 });
  // Front nets: the right side (u = b), and a band along the top of the left side (v = b).
  s += onR(F, b, b, zH, mesh(51.2, zH, 5, netC, st === 1 ? 0.45 : 0.32));
  if (st === 1) s += onR(F, b, b, zH, rect(12, 10, 14, 11, BUBBLE, { sw: 1.1 }) + line('M14 12L24 19', WHITE, 1.2, { op: 0.8 }));
  s += onL(F, a, b, zH, mesh(51.2, 12, 5, netC, st === 1 ? 0.45 : 0.32));
  s += postAt(b, b);
  // Top rails.
  const top = (pts) => pts.map(([u, v], i) => (i ? 'L' : 'M') + xy(F, u, v, zH)).join('');
  s += stick(top([[a, b], [a, a], [b, a]]), postC, 2.2, 1.8) + stick(top([[a, b], [b, b], [b, a]]), postC, 2.4, 1.8);
  if (st >= 2) {
    // A banner with a baseball on the front top band.
    s += onL(F, 0.6, b, zH - 1, rect(0, 0, 26, 11, cls, { sw: 1.3 }) + circ(13, 5.5, 4, WHITE, { sw: 1 }) + line('M10.6 2.6Q12 5.5 10.6 8.4M15.4 2.6Q14 5.5 15.4 8.4', RED, 0.8));
  }
  s += pennants(F.p(a, b, zH), F.p(b, b, zH), level, pennantCols(color), 4);
  if (st === 3) {
    // Stadium lights: a tall pole on the back corner with two lamp banks.
    const [x, y] = F.p(a, a);
    const ty = y - zH - 44;
    s += stick(`${M(x, y - zH)}V${N(ty)}M${N(x - 16)} ${N(ty)}H${N(x + 16)}`, STEEL, 2.4, 2);
    s += rect(x - 27, ty - 13, 20, 12, '#4a4f5c', { sw: 1.5, rx: 2 }) + rect(x + 7, ty - 13, 20, 12, '#4a4f5c', { sw: 1.5, rx: 2 });
    s += bulbs([-22, -17, -12, 12, 17, 22].flatMap((dx) => [[x + dx, ty - 10], [x + dx, ty - 4.5]]), true, 1.6, '#ffffff');
  }
  if (level >= 7) s += goldTrim(top([[a, b], [b, b], [b, a]]));
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-striker ls-st${st}`), artH: F.H, bodyH: zH };
}

/** A tin can standing at (x, y). */
const can = (x, y, c) => rect(x - 2.6, y - 6.5, 5.2, 6.5, c, { sw: 1 }) + ell(x, y - 6.5, 2.6, 1, lt(c, 0.4), { sw: 0.8 });
function canPyramid(x, y, cols) {
  return can(x - 2.8, y, cols[0]) + can(x + 2.8, y, cols[1]) + can(x, y - 6.5, cols[2]);
}
/** A round target face (screen), centre (x, y), radius r. */
function bullseye(x, y, r) {
  return circ(x, y, r, WHITE, { sw: 1.3 }) + circ(x, y, r * 0.68, RED, { ns: 1 }) + circ(x, y, r * 0.4, WHITE, { ns: 1 }) + circ(x, y, r * 0.18, RED, { ns: 1 });
}

/** The Tin Can Range (2×2, Shooters): cans on a plank → swinging targets → a bullseye billboard. */
function tinCanRange(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.gallery);
  const cls = CLASSES.shooter.color;
  const u0 = 0.2;
  const u1 = 1.8;
  const wz = 46;
  let s = '';
  // The backdrop wall.
  const LW = (u1 - u0) * 32;
  let lf;
  // The wall's own colour is its lit (left) face; the box shades its right face darker.
  const wallC = st === 1 ? WOOD : st === 3 ? '#3550a8' : cls;
  if (st === 1) {
    lf = plankWall(LW, wz, [SKY, SKY, LEMON, LEMON, color, color, TEAL, TEAL], 6.4) + circ(LW / 2, 17, 11, WHITE, { sw: 1.4 }) + circ(LW / 2, 17, 7.5, RED, { ns: 1 }) + circ(LW / 2, 17, 4, WHITE, { ns: 1 }) + circ(LW / 2, 17, 1.8, RED, { ns: 1 });
  } else {
    lf = hlines(LW, wz, 7, O, 0.15);
    const stars = [[8, 9], [44, 7], [26, 5], [12, 34], [40, 32]];
    lf += stars.map(([x, y]) => star(x, y, 3.2, st === 3 ? '#fff4b8' : WHITE, { sw: 0.8 })).join('');
  }
  s += box(F, u0, 0.2, u1, 0.36, 0, wz, wallC, { lf, top: st === 1 ? WOOD_L : lt(wallC, 0.3) });
  // Stage 3: the bullseye billboard on top of the wall.
  if (st === 3) {
    for (const u of [0.6, 1.4]) {
      const [x, y] = F.p(u, 0.28, wz);
      s += stick(`${M(x, y)}V${N(y - 16)}`, STEEL_D, 2.2, 2);
    }
    let bb = circ(0, 0, 18, color, { ns: 1, op: 0.28 }) + bullseye(0, 0, 15);
    const ring = [];
    for (let i = 0; i < 12; i++) ring.push([Math.cos((i / 12) * Math.PI * 2) * 17.5, Math.sin((i / 12) * Math.PI * 2) * 17.5]);
    bb += bulbs(ring, true, 1.4);
    s += onL(F, 1.0, 0.28, wz + 30, bb);
  }
  // The shelf / plank with cans.
  if (st === 1) {
    for (const u of [0.45, 1.55]) {
      const [x, y] = F.p(u, 0.58);
      s += line(`${M(x - 4, y)}L${N(x)} ${N(y - 15)}L${N(x + 4)} ${N(y)}`, O, 3) + line(`${M(x - 4, y)}L${N(x)} ${N(y - 15)}L${N(x + 4)} ${N(y)}`, WOOD, 1.4);
    }
    s += box(F, 0.32, 0.52, 1.68, 0.64, 14, 3, LEMON, { sw: 1.4 });
    for (const [u, cs] of [[0.6, [STEEL, RED, STEEL]], [1.05, [BLUE, STEEL, YELLOW]], [1.45, [STEEL, GREEN, STEEL]]]) s += canPyramid(...F.p(u, 0.58, 17), cs);
  } else {
    s += box(F, 0.3, 0.36, 1.7, 0.48, 14, 3, WOOD_L, { sw: 1.4 });
    for (const [u, cs] of [[0.55, [STEEL, RED, STEEL]], [1.45, [STEEL, YELLOW, STEEL]]]) s += canPyramid(...F.p(u, 0.42, 17), cs);
    // Swinging targets from a top bar.
    const bar = [F.p(0.25, 0.62, 44), F.p(1.75, 0.62, 44)];
    s += stick(`${M(...bar[0])}L${N(bar[1][0])} ${N(bar[1][1])}`, STEEL, 1.6, 1.8);
    for (const u of [0.62, 1.0, 1.38]) {
      const [x, y] = F.p(u, 0.62, 44);
      s += g(line(`${M(x, y)}V${N(y + 9)}`, O, 1.2) + bullseye(x, y + 14, 5.5), { cls: 'ls-swing', style: `transform-origin:${N(x)}px ${N(y)}px;transform-box:view-box` });
    }
    // The awning.
    const az0 = 56;
    const az1 = 48;
    const ap = 0.72;
    const n = 8;
    s += face(F, [[0.12, 0.18, az0], [1.88, 0.18, az0], [1.88, ap, az1], [0.12, ap, az1]], WHITE, { ns: 1 });
    let st2 = '';
    const sc = ['', ''];
    for (let i = 0; i < n; i++) {
      const ua = 0.12 + (1.76 * i) / n;
      const ub = 0.12 + (1.76 * (i + 1)) / n;
      if (!(i % 2)) st2 += pd(F, [[ua, 0.18, az0], [ub, 0.18, az0], [ub, ap, az1], [ua, ap, az1]]);
      const [x1, y1] = F.p(ua, ap, az1);
      const [x2, y2] = F.p(ub, ap, az1);
      sc[i % 2] += `${M(x1, y1)}Q${N((x1 + x2) / 2)} ${N((y1 + y2) / 2 + 7)} ${N(x2)} ${N(y2)}Z`;
    }
    s += path(st2, cls, { ns: 1 }) + face(F, [[0.12, 0.18, az0], [1.88, 0.18, az0], [1.88, ap, az1], [0.12, ap, az1]], 'none', { sw: 1.4 });
    s += path(sc[0], cls, { sw: 1.2 }) + path(sc[1], WHITE, { sw: 1.2 });
    const [ex, ey] = F.p(1.88, 0.18, az0);
    const [fx, fy] = F.p(1.88, ap, az1);
    s += line(`${M(ex, ey)}L${N(fx)} ${N(fy)}`, O, 2);
    if (st === 3) s += bulbs([0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map((t) => F.p(0.12 + 1.76 * t, ap, az1 - 4)), true, 1.5);
  }
  // The counter.
  if (st === 1) {
    const bags = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < (row % 2 ? 4 : 5); k++) bags.push(F.p(0.32 + k * 0.34 + (row % 2) * 0.17, 1.5, 3 + row * 5));
    s += sandbags(bags);
    s += box(F, 0.3, 1.42, 1.75, 1.58, 15, 2.5, color, { sw: 1.4 });
    s += propLean('slingshot', ...F.p(1.2, 1.5, 17.5), color, 1.1);
  } else {
    const CW = 1.5 * 32;
    s += box(F, 0.25, 1.35, 1.75, 1.6, 0, 14, cls, { lf: vlines(CW, 14, 6, '#ffffff', 0.9, 0, 3), top: WOOD_L });
    s += box(F, 0.2, 1.32, 1.8, 1.64, 14, 3, WOOD, { top: WOOD_L, sw: 1.6 });
    s += propLean('blaster', ...F.p(0.9, 1.48, 17), color, 1.1);
    if (st === 3) s += bulbs([0.15, 0.4, 0.65, 0.9, 1.15, 1.4].map((t) => F.p(0.25 + t, 1.6, 6)), true, 1.4);
  }
  // Pennants along the roof line.
  if (st === 1) s += pennants(F.p(u0, 0.36, wz), F.p(u1, 0.36, wz), level, pennantCols(color), 4);
  else s += pennants(F.p(0.12, 0.72, 48), F.p(1.88, 0.72, 48), level, pennantCols(color), 3);
  if (level >= 7) s += goldTrim(`M${xy(F, 0.12, 0.72, 48)}L${xy(F, 1.88, 0.72, 48)}L${xy(F, 1.88, 0.18, 56)}`);
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-gallery ls-st${st}`), artH: F.H, bodyH: st === 1 ? 46 : 56 };
}

/** Convex hull of screen points (monotone chain). */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  const up = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const polyD = (pts, close = true) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${N(x)} ${N(y)}`).join('') + (close ? 'Z' : '');

/**
 * The Ice Cream Clinic (2×2, Medics): a giant cone toppled on its side (tip back-left, mouth
 * right) with its mint scoop still stuck in the mouth. Patched: a striped tarp lean-to on the
 * cone, the scoop half melted → Fixed up: a door and port-hole cut in the cone, a red cross on
 * the scoop, a flag → Proud: bulbs along the cone and round the scoop, a glowing cherry.
 * Decals (door, windows) are drawn in the cone's own surface coordinates, so they wrap.
 */
const CLINIC = { R: 22, L: 1.65, C: [1.62, 0.8], n: [0.89, -0.45] };
function iceCreamClinic(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.tent);
  const { R, L, C, n } = CLINIC;
  const p = [-n[1], n[0]]; // horizontal, across the axis (toward the viewer's left)
  const T = [C[0] - n[0] * L, C[1] - n[1] * L];
  const coneC = st === 1 ? '#f5b85c' : '#f2b65a';
  const D = Math.PI / 180;
  // A point on the cone: t from the tip (0) to the mouth (1), th round the axis (0 = toward p, 90° = up).
  const S = (t, th) => {
    const r = R * t;
    const u = T[0] + (C[0] - T[0]) * t + (p[0] * r * Math.cos(th)) / 32;
    const v = T[1] + (C[1] - T[1]) * t + (p[1] * r * Math.cos(th)) / 32;
    return F.p(u, v, 2 + (R - 2) * t + r * Math.sin(th));
  };
  const seen = (th) => 1.34 * Math.cos(th) + Math.sin(th) > 0.2;
  // Surface decal: points given as [t, th in degrees].
  const decal = (pts) => polyD(pts.map(([t, a]) => S(t, a * D)));
  let s = ell(...F.p(1.05, 1.05), 50, 16, O, { ns: 1, op: 0.13 });
  const rim = Array.from({ length: 28 }, (_, k) => S(1, (k / 28) * 360 * D));
  const body = polyD(hull([S(0, 0), ...rim]));
  s += path(body, coneC, { ns: 1 });
  const band = (a, b) => polyD([S(0, 0), ...Array.from({ length: 7 }, (_, k) => S(1, (a + ((b - a) * k) / 6) * D))]);
  s += path(band(58, 118), lt(coneC, 0.35), { ns: 1 }) + path(band(-47, -12), dk(coneC, 0.16), { ns: 1 });
  // Waffle: two families of lines winding round the cone (visible side only).
  let w = '';
  for (const dir of [1, -1]) {
    for (let a0 = -220; a0 <= 260; a0 += 30) {
      let prev = null;
      for (let k = 0; k <= 6; k++) {
        const t = 0.12 + (0.88 * k) / 6;
        const th = (a0 + dir * 130 * t) * D;
        const q = seen(th) ? S(t, th) : null;
        if (q && prev) w += `${M(...prev)}L${N(q[0])} ${N(q[1])}`;
        prev = q;
      }
    }
  }
  s += line(w, dk(coneC, 0.38), 1.1, { op: 0.7 });
  s += path(body, 'none', { sw: 2.2 });
  // The clinic's door and port-hole (Fixed up on), or a striped tarp lean-to (Patched).
  if (st === 1) {
    const g0 = (t) => {
      const c = [T[0] + (C[0] - T[0]) * t, T[1] + (C[1] - T[1]) * t];
      return F.p(c[0] + p[0] * (R * t / 32 + 0.42), c[1] + p[1] * (R * t / 32 + 0.42), 0);
    };
    const a = S(0.22, 75 * D);
    const b = S(0.66, 75 * D);
    const tarp = polyD([a, b, g0(0.66), g0(0.22)]);
    s += path(tarp, color, { ns: 1 });
    let str = '';
    for (const f of [0.18, 0.42, 0.66, 0.9]) {
      const q1 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const g1 = g0(0.22 + 0.44 * f);
      str += `${M(...q1)}L${N(g1[0])} ${N(g1[1])}`;
    }
    s += line(str, WHITE, 3.2, { op: 0.9 }) + path(tarp, 'none', { sw: 1.6 });
    const [sx, sy] = g0(0.66);
    s += stick(`${M(sx, sy)}L${N(b[0])} ${N(b[1])}`, WOOD_D, 1.8, 1.6);
    s += propLean('medkit', ...g0(0.4), color, 1.2);
  } else {
    s += path(decal([[0.47, -40], [0.66, -40], [0.66, 8], [0.62, 22], [0.565, 27], [0.51, 22], [0.47, 8]]), '#5fd39a', { sw: 1.5 });
    s += line(decal([[0.565, -40], [0.565, 25]]).replace('Z', ''), '#3a9a68', 1);
    s += circ(...S(0.62, -8 * D), 1.3, GOLD, { sw: 0.7 });
    const [wx, wy] = S(0.38, 25 * D);
    s += circ(wx, wy, 4, WHITE, { sw: 1.3 }) + circ(wx, wy, 2.4, NITE || st === 3 ? LIT : GLASS, { sw: 0.8 });
    if (st === 3) s += path(decal([[0.44, 30], [0.7, 30], [0.72, 40], [0.42, 40]]), WHITE, { sw: 1.2 }) + line(decal([[0.51, 30], [0.52, 40]]).replace('Z', '') + decal([[0.6, 30], [0.61, 40]]).replace('Z', ''), GREEN, 2.4);
  }
  // Pennants along the top of the cone; a flag on top.
  s += pennants(S(0.2, 92 * D), S(0.66, 92 * D), level, pennantCols(color), 1.5);
  if (st > 1) {
    const [fx, fy] = S(0.58, 90 * D);
    s += flag(fx, fy + 1, 18, color, -1, true);
  }
  if (st === 3) s += bulbs([0.18, 0.32, 0.46, 0.6].map((t) => S(t, 62 * D)), true, 1.5);
  // The scoop, still stuck in the mouth (melting while Patched).
  const [bx, by] = F.p(C[0] + n[0] * 0.24, C[1] + n[1] * 0.24, R);
  const rb = st === 1 ? 22 : 24;
  const scoopC = st === 1 ? '#b4efcf' : '#8fe6b4';
  const yb = by + (st === 1 ? 5 : 0);
  const ry = st === 1 ? rb * 0.82 : rb;
  // A puddle and drips on the ground, then the ball: one shade, one highlight.
  s += ell(bx + 4, by + R + 1, st === 1 ? 24 : 17, st === 1 ? 7 : 5, scoopC, { sw: 1.4 });
  s += path(`${M(bx - 9, yb + ry - 6)}V${N(by + R - 2)}a3 3 0 0 0 6 0V${N(yb + ry - 4)}ZM${N(bx + 9)} ${N(yb + ry - 8)}V${N(by + R - 4)}a3 3 0 0 0 6 0V${N(yb + ry - 10)}Z`, scoopC, { sw: 1.3 });
  s += ell(bx, yb, rb, ry, dk(scoopC, 0.14), { ns: 1 }) + ell(bx - rb * 0.1, yb - ry * 0.12, rb * 0.86, ry * 0.86, scoopC, { ns: 1 }) + ell(bx, yb, rb, ry, 'none', { sw: 2 });
  s += path(`${M(bx - rb * 0.62, yb - ry * 0.5)}Q${N(bx - rb * 0.3)} ${N(yb - ry * 0.86)} ${N(bx + rb * 0.12)} ${N(yb - ry * 0.8)}`, 'none', { stroke: '#ffffff', sw: 3, op: 0.65 });
  if (st > 1) {
    const sp = [[bx - 14, yb - 10, 30], [bx + 13, yb - 14, -20], [bx + 16, yb + 2, 60], [bx - 4, yb - 20, 10], [bx - 16, yb + 4, -40]];
    s += sp.map(([x, y, a], i) => rect(x - 1.2, y - 2.6, 2.4, 5.2, CONFETTI[i], { ns: 1, rx: 1, tf: `rotate(${a} ${N(x)} ${N(y)})` })).join('');
    if (st === 3) s += circ(bx - 1, yb + 1, 14, '#ff6a5a', { ns: 1, op: 0.3 });
    s += circ(bx - 1, yb + 1, 10, WHITE, { sw: 1.6 }) + path(`M${N(bx - 3.8)} ${N(yb - 6.4)}h5.6v4.6h4.6v5.6h-4.6v4.6h-5.6v-4.6h-4.6v-5.6h4.6z`, RED, { sw: 1 });
    if (st === 3) {
      const r2 = 15;
      const y2 = yb - rb - 6;
      s += ell(bx + 2, y2, r2, r2 * 0.92, dk('#ff9ccb', 0.12), { ns: 1 }) + ell(bx + 0.5, y2 - 1.5, r2 * 0.86, r2 * 0.8, '#ff9ccb', { ns: 1 }) + ell(bx + 2, y2, r2, r2 * 0.92, 'none', { sw: 2 }) + path(`${M(bx - 11, y2 + 9)}q4 5 8 1q4 5 9 0q4 4 8 -1`, 'none', { stroke: dk('#ff9ccb', 0.2), sw: 1.4 });
      const cy = y2 - r2 - 2;
      s += circ(bx + 3, cy, 10, '#ff6a5a', { ns: 1, op: 0.3, cls: 'ls-beacon' }) + line(`${M(bx + 3, cy - 4)}q2 -6 6 -8`, '#3f8a3a', 1.6) + circ(bx + 3, cy + 1, 5.5, RED, { sw: 1.4 }) + circ(bx + 1.5, cy - 0.5, 1.5, '#ffffff', { ns: 1 });
    }
  }
  if (level >= 7) {
    const top = Array.from({ length: 5 }, (_, k) => S(0.1 + k * 0.15, 95 * D));
    s += goldTrim(polyD(top, false)) + star(bx + 18, yb - rb - 2, 5, GOLD);
  }
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-tent ls-st${st}`), artH: F.H, bodyH: 50 };
}

/** The Junk Garage (2×2, Tinkers): car on blocks → shed with a crane → wrecking ball and neon wrench. */
function junkGarage(level, color) {
  const st = STAGES[level];
  const F = frame(2, 2, BH.garage);
  const cls = CLASSES.tinker.color;
  let s = '';
  if (st === 1) {
    s += tyres(...F.p(0.3, 0.3), 3, 7) + drum(...F.p(1.65, 0.35), BUBBLE, 12, 5.5);
    const [ox, oy] = F.p(1.0, 1.05);
    s += ell(ox, oy, 26, 10, '#3b3530', { ns: 1, op: 0.35 });
    const blk = (u, v) => box(F, u, v, u + 0.14, v + 0.12, 0, 7, '#a8a294', { sw: 1.3 });
    s += blk(0.5, 0.72) + blk(1.38, 0.72) + blk(0.5, 1.22) + blk(1.38, 1.22);
    const carC = TEAL;
    const clf = path('M5 12Q5 5 11 5Q17 5 17 12Z', '#2e2a28', { sw: 1 }) + path('M23 12Q23 5 29 5Q35 5 35 12Z', '#2e2a28', { sw: 1 }) + rect(18, 1, 5, 11, color, { sw: 0.9 }) + line('M20 1V12', O, 0.9, { op: 0.5 });
    const crf = circ(4, 5, 2.4, '#f3edc8', { sw: 1 }) + circ(16.5, 5, 2.4, '#f3edc8', { sw: 1 }) + rect(7.5, 4, 6, 4, STEEL, { sw: 0.8 });
    s += box(F, 0.4, 0.7, 1.6, 1.35, 7, 12, carC, { lf: clf, rf: crf, top: lt(carC, 0.25) });
    s += box(F, 0.62, 0.76, 1.12, 1.3, 19, 11, carC, { lf: rect(2, 1.5, 12, 8, GLASS, { sw: 1 }), rf: rect(2, 1.5, 13.5, 8, GLASS, { sw: 1 }), top: lt(carC, 0.3) });
    // The hood, propped open.
    s += face(F, [[1.22, 0.72, 19], [1.22, 1.33, 19], [1.3, 1.33, 36], [1.3, 0.72, 36]], LEMON, { sw: 1.4 });
    s += box(F, 1.5, 1.5, 1.82, 1.7, 0, 6, RED, { top: lt(RED, 0.3), sw: 1.4 });
    s += propLean('wrench', ...F.p(1.66, 1.62, 6), color, 1.1);
    s += pennants(F.p(0.62, 1.3, 30), F.p(1.3, 1.33, 36), level, pennantCols(color), 3);
    s += tufts([F.p(0.2, 1.8), F.p(1.85, 1.2)], GRASS_D);
  } else {
    const u0 = 0.2;
    const v0 = 0.2;
    const u1 = 1.22;
    const v1 = 1.55;
    const zH = 34;
    const LW = (u1 - u0) * 32;
    const RW = (v1 - v0) * 32;
    const lf = vlines(LW, zH, 3, O, 0.25) + rect(4, 9, LW - 8, zH - 9, '#c9ccd2', { sw: 1.3 }) + hlines(LW - 4, zH, 3.5, O, 0.35, 4, 9);
    const rf = vlines(RW, zH, 3, O, 0.25) + win(16, 9, 14, 11, { lit: st === 3 });
    s += shadowBox(F, u0, v0, u1, v1);
    s += box(F, u0, v0, u1, v1, 0, zH, cls, { lf, rf, top: 'none' });
    const gf = st === 3 ? '' : g(path('M-6 0L-1 -5L1 -3L-4 2ZM-2 -4Q-3 -8 1 -9L2 -7L4 -6L5 -8Q8 -6 5 -2Q3 -1 1 -3Z', STEEL, { sw: 1 }), { tf: `translate(${N(LW / 2)} -8) scale(1.2)` });
    s += roofV(F, u0, v0, u1, v1, zH, 16, color === cls ? RED : color, { wall: cls, gf, tex: 'tin' });
    // Crane: mast at the back-right, jib out over the yard.
    const [mx, my] = F.p(1.55, 0.42);
    const mt = my - 76;
    s += box(F, 1.42, 0.3, 1.72, 0.56, 0, 10, '#5a5f6e', { top: '#7a8090', sw: 1.6 });
    s += line(`${M(mx - 4, my - 10)}L${N(mx - 2)} ${N(mt)}M${N(mx + 4)} ${N(my - 10)}L${N(mx + 2)} ${N(mt)}`, O, 4) + line(`${M(mx - 4, my - 10)}L${N(mx - 2)} ${N(mt)}M${N(mx + 4)} ${N(my - 10)}L${N(mx + 2)} ${N(mt)}`, cls, 2);
    let zz = '';
    for (let k = 0; k < 6; k++) {
      const y1 = my - 10 - k * 11;
      zz += `${M(mx - 3.6 + k * 0.3, y1)}L${N(mx + 3.4 - k * 0.3)} ${N(y1 - 11)}`;
    }
    s += line(zz, O, 1.1);
    const [jx, jy] = F.p(1.55, 1.55, 70);
    s += stick(`${M(mx + 8, mt + 6)}L${N(mx)} ${N(mt)}L${N(jx)} ${N(jy)}`, cls, 2.2, 2);
    s += box(F, 1.58, 0.15, 1.78, 0.32, 60, 8, '#5a5f6e', { sw: 1.4 });
    if (st === 2) {
      s += line(`${M(jx, jy)}V${N(jy + 30)}`, O, 1.2);
      s += path(`${M(jx, jy + 30)}q-4 2 0 6q3 0 3 -3`, 'none', { stroke: STEEL_D, sw: 1.6 });
      s += box(F, 1.48, 1.45, 1.66, 1.62, 26, 9, '#6a7180', { top: '#8a92a0', sw: 1.4 });
      s += tyres(...F.p(1.6, 1.75), 2, 6.5);
    } else {
      s += g(line(`${M(jx, jy)}V${N(jy + 28)}`, '#5a5f6e', 1.6, { dash: '2 1.2' }) + circ(jx, jy + 37, 9.5, '#3a3f52', { sw: 1.8 }) + path(`${M(jx - 5, jy + 33)}Q${N(jx - 3)} ${N(jy + 30)} ${N(jx + 1)} ${N(jy + 30)}`, 'none', { stroke: '#8a92a8', sw: 1.6 }), { cls: 'ls-ball', style: `transform-origin:${N(jx)}px ${N(jy)}px;transform-box:view-box` });
      // A neon wrench on the gable.
      const [gx, gy] = F.p((u0 + u1) / 2, v1 + 0.1, zH + 8);
      const wd = 'M-9 3L3 -9M-11 1Q-14 4 -11 7Q-8 10 -5 7M1 -11Q4 -14 7 -11Q10 -8 7 -5';
      s += g(line(wd, YELLOW, 6, { op: 0.3 }) + line(wd, O, 4.4) + line(wd, YELLOW, 2.4) + line(wd, '#ffffff', 0.8), { tf: `translate(${N(gx)} ${N(gy)})` });
      s += lights([mx, mt + 4], F.p((u0 + u1) / 2, v0 + 0.3, zH + 15), 8, 6);
    }
    s += propLean('wrench', ...F.p(1.25, 1.75), color, 1.1);
    const rg = roofVGeo(u0, v0, u1, v1, zH, 16);
    s += pennants(F.p(rg.a, rg.q, rg.ze), F.p(rg.um, rg.q, rg.zt), level, pennantCols(color), 3);
    if (level >= 7) s += goldTrim(`M${xy(F, rg.a, rg.q, rg.ze)}L${xy(F, rg.um, rg.q, rg.zt)}L${xy(F, rg.b, rg.q, rg.ze)}`);
  }
  return { svg: svgWrap(F.W, F.H, s, `ls-bld ls-garage ls-st${st}`), artH: F.H, bodyH: st === 1 ? 34 : 50 };
}

/**
 * A building's art. id: bigtop (Gas Station, 3×3), crate (Drop Pad), vault (Bank Vault),
 * striker (Batting Cage), gallery (Tin Can Range), tent (Ice Cream Clinic), garage (Junk
 * Garage), all 2×2. level 1..7 picks the look stage (STAGES) and the pennant count; Lv 7
 * adds gold trim. color = the town colour (paint, pennants, the Patched candy planks); town =
 * the town name (the Gas Station sign: "LAST STOP" while Patched, the name from Fixed up on,
 * whole words up to 10 characters, else 9 and an ellipsis). Optional: flags (Gas Station: zone
 * flags on its pole), night (lit windows and lamps). Returns { svg, artH, bodyH, top }.
 */
export function buildingArt(id, level = 1, { town = '', color = RED, flags = 1, night = false } = {}) {
  const lv = Math.max(1, Math.min(7, Math.round(Number(level) || 1)));
  const c = paint(color);
  const r = withNight(night, () => building(id, lv, c, town, flags));
  return { ...r, top: topOf(`b:${BH[id] ? id : 'x'}:${STAGES[lv]}`, r.artH) };
}
function building(id, lv, c, town, flags) {
  switch (id) {
    case 'bigtop':
      return gasStation(lv, c, town, flags);
    case 'crate':
      return dropPad(lv, c);
    case 'vault':
      return bankVault(lv, c);
    case 'striker':
      return battingCage(lv, c);
    case 'gallery':
      return tinCanRange(lv, c);
    case 'tent':
      return iceCreamClinic(lv, c);
    case 'garage':
      return junkGarage(lv, c);
    default:
      return { svg: svgWrap(128, 64, '', 'ls-bld'), artH: 64, bodyH: 0 };
  }
}

// --- Homes ------------------------------------------------------------------------------------

const HOME_H = { tent: 104, shack: 118, cabin: 128, cottage: 140, tower: 166, gold: 184 };
/**
 * Where a walker stands at each tier's door (tile-local, outside the 2×2 footprint). u + v is
 * at least 3.65, so the engine's walker depth ((fi + fj)·10 + 5) sorts the figure in front of
 * the home ((i + j + 4)·10); a spot closer to the wall would draw behind it.
 */
const HOME_DOOR = { tent: [1.0, 2.66], shack: [1.22, 2.44], cabin: [1.05, 2.61], cottage: [1.3, 2.36], tower: [1.4, 2.26], gold: [1.4, 2.26] };

/** Heart plaques in a row on a little board (face-local), centred on cx at y. */
function heartRow(n, cx, y, k = 1.1) {
  if (n <= 0) return '';
  const gap = 6.4 * k;
  const x0 = cx - ((n - 1) * gap) / 2;
  let hearts = '';
  for (let i = 0; i < n; i++) hearts += heartD(x0 + i * gap, y + 0.2 * k, 2.3 * k);
  return rect(x0 - gap / 2 - 0.5, y - 3.6 * k, n * gap + 1, 7.2 * k, WOOD_L, { sw: 0.9, rx: 1 }) + path(hearts, '#ff3d64', { sw: 0.7 });
}

function homeOwner(person, o) {
  const cls = person && CLASSES[person.cls] ? person.cls : 'brawler';
  const C = CLASSES[cls];
  const look = (person && person.look) || {};
  const prop = C.props[look.prop] || C.props[0];
  const nm = o.name ?? (person && person.first) ?? '';
  return {
    cls,
    col: C.color,
    dark: C.dark,
    roof: isHex(o.roof) ? o.roof : C.color,
    hat: look.hat || 'none',
    mascot: look.hat === 'mascot' ? Math.max(0, Math.min(2, look.mascot | 0)) : -1,
    prop,
    hearts: Math.max(0, Math.min(5, Math.round(Number(o.hearts) || 0))),
    golden: o.golden ?? !!(person && person.golden),
    legend: o.legend ?? !!(person && person.rarity === 'legend'),
    wish: !!o.wish,
    name: String(nm).toUpperCase().slice(0, 7),
  };
}

/** The roof ornament: mascot ears (at a and b) or the hat weathervane (at a). */
function roofTop(W, a, b) {
  if (W.mascot >= 0) return ears(W.mascot, a, b);
  return weathervane(a[0], a[1], W.hat, W.col);
}
const box2 = (W, F, u, v) => mailbox(...F.p(u, v), W.golden, W.wish, W.name);

function tentHome(F, W) {
  const c = W.col;
  let s = ell(...F.p(1.05, 1.05), 40, 14, O, { ns: 1, op: 0.12 });
  const u0 = 0.42;
  const u1 = 1.58;
  const v0 = 0.5;
  const v1 = 1.5;
  const um = 1.0;
  const zt = 32;
  // Guy lines and pegs at the back.
  const [px, py] = F.p(1.0, 0.18);
  s += line(`M${xy(F, um, v0, zt)}L${N(px)} ${N(py)}`, '#e8e2d6', 1) + rect(px - 1, py - 3, 2, 4, WOOD_D, { ns: 1 });
  // The slope facing down-right, with a fly in the roof colour along the ridge.
  s += face(F, [[um, v0, zt], [u1, v0, 0], [u1, v1, 0], [um, v1, zt]], dk(c, 0.12), { sw: 1.4 });
  s += face(F, [[um, v0 - 0.04, zt + 1], [um + 0.3, v0 - 0.04, zt * 0.45], [um + 0.3, v1 + 0.04, zt * 0.45], [um, v1 + 0.04, zt + 1]], W.roof, { sw: 1.3 });
  s += face(F, [[u1 - 0.12, v0, 4.2], [u1, v0, 0], [u1, v1, 0], [u1 - 0.12, v1, 4.2]], dk(c, 0.35), { ns: 1 });
  // The front with its door flaps.
  s += face(F, [[u0, v1, 0], [u1, v1, 0], [um, v1, zt]], c, { sw: 1.4 });
  s += face(F, [[0.74, v1, 0], [1.26, v1, 0], [um, v1, 22]], NITE ? '#c9902a' : '#3b2c24', { sw: 1.1 });
  s += face(F, [[0.74, v1, 0], [0.84, v1, 0], [um, v1, 22], [0.62, v1, 6]], lt(c, 0.25), { sw: 1 });
  s += face(F, [[1.26, v1, 0], [1.16, v1, 0], [um, v1, 22], [1.38, v1, 6]], lt(c, 0.15), { sw: 1 });
  s += face(F, [[u0, v1 + 0.02, 0], [u1, v1 + 0.02, 0], [u1, v1 + 0.02, 3], [u0, v1 + 0.02, 3]], dk(c, 0.3), { ns: 1 });
  s += path(pd(F, [[u0, v1, 0], [um, v1, zt], [um, v0, zt], [u1, v0, 0], [u1, v1, 0]]), 'none');
  // Pole tip and front guy line.
  const [ax, ay] = F.p(um, v1, zt);
  s += stick(`${M(ax, ay)}V${N(ay - 5)}`, WOOD, 1.6, 1.6) + line(`${M(ax, ay - 2)}L${xy(F, 0.55, 1.9)}`, '#e8e2d6', 1);
  // Hearts on a stake sign, the prop, the mailbox.
  if (W.hearts) {
    const [hx, hy] = F.p(1.8, 1.66);
    s += stick(`${M(hx, hy)}V${N(hy - 13)}`, WOOD, 1.8, 1.6) + heartRow(W.hearts, hx, hy - 16, 1.05);
  }
  s += propLean(W.prop, ...F.p(1.5, 1.66), W.col);
  s += box2(W, F, 0.3, 1.82);
  if (W.legend) s += goldTrim(`M${xy(F, u0, v1, 0)}L${xy(F, um, v1, zt)}L${xy(F, u1, v1, 0)}`) + star(ax, ay - 9, 5, GOLD);
  return { s, bodyH: 32 };
}

function shackHome(F, W) {
  const u0 = 0.45;
  const v0 = 0.45;
  const u1 = 1.55;
  const v1 = 1.45;
  const zLo = 24;
  const zHi = 33;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  let s = shadowBox(F, u0, v0, u1, v1);
  const lf = hlines(LW, zLo, 6, O, 0.28) + rect(3, 8, 9, 9, STEEL, { sw: 1 }) + door(19, 9, 11, zLo - 9, '#a8763f') + line(`M20.5 11L28.5 ${zLo - 2}`, WOOD_D, 1.2) + heartRow(W.hearts, LW / 2, 4.2, 0.95);
  const rf = hlines(RW, zLo, 6, O, 0.28) + win(10, 6, 11, 10, { frame: WOOD_L }) + rect(21, 6, 4.5, 10, W.col, { sw: 1 });
  s += box(F, u0, v0, u1, v1, 0, zLo, PLANK, { lf, rf, top: 'none' });
  s += face(F, [[u0, v1, zLo], [u1, v1, zLo], [u0, v1, zHi]], PLANK, { sw: 1.2 });
  s += roofMono(F, u0, v0, u1, v1, zLo, zHi, W.roof, { tex: 'tin' });
  // Stovepipe with a puff.
  const [sx, sy] = F.p(0.75, 0.7, 31);
  s += rect(sx - 2.5, sy - 12, 5, 12, STEEL_D, { sw: 1.3 }) + rect(sx - 4, sy - 14, 8, 3, '#5a5f6e', { sw: 1.2 }) + path(cpath([[sx + 3, sy - 19, 2.6], [sx + 7, sy - 23, 3.2]]), '#ffffff', { sw: 1, op: 0.85 });
  s += roofTop(W, F.p(0.55, 1.15, 34), F.p(0.55, 0.78, 34));
  s += propLean(W.prop, ...F.p(u0 + 34 / 32 + 0.05, v1 + 0.08), W.col);
  s += box2(W, F, 0.3, 1.82);
  if (W.legend) s += goldTrim(`M${xy(F, u0 - 0.1, v1 + 0.1, zHi + 1)}L${xy(F, u1 + 0.1, v1 + 0.1, zLo - 1)}L${xy(F, u1 + 0.1, v0 - 0.1, zLo - 1)}`);
  return { s, bodyH: 34 };
}

function cabinHome(F, W) {
  const u0 = 0.35;
  const v0 = 0.3;
  const u1 = 1.6;
  const v1 = 1.22;
  const zH = 24;
  const rh = 21;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const LOG = '#b0703c';
  let s = shadowBox(F, u0, v0, u1, v1 + 0.45);
  const logs = (w) => hlines(w, zH, 4.8, '#6b3f1c', 0.75) + path(cpath(Array.from({ length: 5 }, (_, i) => [1.6, 2.4 + i * 4.8, 2])), '#d9a46a', { sw: 0.8 });
  const lf = logs(LW) + door(16, 8, 12, zH - 8, '#7a4a24', { glass: true }) + heartRow(W.hearts, 22, 3.6, 0.85) + win(31, 7, 9, 9, { frame: WOOD_L });
  const rf = logs(RW) + win(10, 6, 12, 10, { frame: WOOD_L });
  s += box(F, u0, v0, u1, v1, 0, zH, LOG, { lf, rf, top: 'none' });
  // Porch deck, prop, posts.
  s += box(F, u0, v1, u1, v1 + 0.48, 0, 4, WOOD_L, { top: '#e9bf86', tf: vlines(LW, 15, 5, WOOD_D, 0.5), sw: 1.6 });
  s += propLean(W.prop, ...F.p(u0 + 31 / 32, v1 + 0.14, 4), W.col);
  for (const u of [u0 + 0.07, u1 - 0.07]) {
    const [x, y] = F.p(u, v1 + 0.42, 4);
    s += stick(`${M(x, y)}V${N(y - zH + 3)}`, WOOD, 2.2, 1.8);
  }
  s += roofV(F, u0, v0, u1, v1, zH, rh, W.roof, { wall: LOG, ext: 0.45, tex: 'shingle', gf: hlines(LW, 0, 1) + line(`M${N(LW / 2 - 9)} -4.8H${N(LW / 2 + 9)}M${N(LW / 2 - 4.5)} -9.6H${N(LW / 2 + 4.5)}`, '#6b3f1c', 1, { op: 0.75 }) + win(LW / 2 - 3.5, -13, 7, 7, { frame: WOOD_L, bars: false }) });
  const rg = roofVGeo(u0, v0, u1, v1, zH, rh, { ext: 0.45 });
  // Stone chimney on the visible slope.
  const zc = rg.zt - (rh * (1.38 - rg.um)) / (u1 - rg.um);
  s += box(F, 1.3, 0.42, 1.46, 0.58, zc - 6, 18, '#a8a294', { lf: hlines(5, 18, 4.5, O, 0.3), top: '#6a6460', sw: 1.6 });
  s += roofTop(W, F.p(rg.um, 0.45, rg.zt), F.p(rg.um, 1.45, rg.zt));
  s += box2(W, F, 0.25, 1.86);
  if (W.legend) s += goldTrim(`M${xy(F, rg.a, rg.q, rg.ze)}L${xy(F, rg.um, rg.q, rg.zt)}L${xy(F, rg.b, rg.q, rg.ze)}L${xy(F, rg.b, rg.p, rg.ze)}`);
  return { s, bodyH: 46 };
}

function cottageHome(F, W) {
  const u0 = 0.3;
  const v0 = 0.3;
  const u1 = 1.62;
  const v1 = 1.38;
  const zH = 28;
  const rh = 27;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const timber = '#8a5a34';
  let s = shadowBox(F, u0, v0, u1, v1);
  const box1 = (x) => rect(x - 1, 19, 15, 4.5, WOOD, { sw: 1.1 }) + path(cpath([[x + 2, 18, 2], [x + 6.5, 17.4, 2.2], [x + 11, 18, 2]]), PINK, { sw: 0.8 }) + path(cpath([[x + 4.3, 17, 0.9], [x + 8.8, 17, 0.9]]), YELLOW, { ns: 1 });
  const lf = line(`M0 1V${zH}M${N(LW)} 1V${zH}`, timber, 3) + win(4, 7, 13, 12) + box1(4) + door(26, 6, 12, zH - 6, W.col, { arch: true, glass: true });
  const rf = line(`M0 1V${zH}M${N(RW)} 1V${zH}`, timber, 3) + win(6, 7, 10, 11) + rect(2.5, 7, 3.5, 11, W.col, { sw: 0.9 }) + rect(16, 7, 3.5, 11, W.col, { sw: 0.9 }) + win(23, 7, 9, 11);
  s += box(F, u0, v0, u1, v1, 0, zH, CREAM, { lf, rf, top: 'none' });
  s += roofV(F, u0, v0, u1, v1, zH, rh, W.roof, { wall: CREAM, tex: 'shingle', gf: line(`M3 -2H${N(LW - 3)}`, timber, 2) + heartRow(W.hearts, LW / 2, -7.5, 1) + circ(LW / 2, -17, 3.6, GLASS, { sw: 1.1 }) });
  const rg = roofVGeo(u0, v0, u1, v1, zH, rh);
  const zc = rg.zt - (rh * (1.35 - rg.um)) / (u1 - rg.um);
  s += box(F, 1.28, 0.45, 1.44, 0.6, zc - 6, 20, BRICK, { lf: hlines(5, 20, 4, '#7a2e1e', 0.5), top: '#5a3a30', sw: 1.6 });
  s += roofTop(W, F.p(rg.um, 0.45, rg.zt), F.p(rg.um, 1.38, rg.zt));
  // Class flag on a pole beside the house.
  const [fx, fy] = F.p(1.86, 0.42);
  s += flag(fx, fy, 42, W.col, 1);
  s += propLean(W.prop, ...F.p(u0 + 41 / 32, v1 + 0.1), W.col);
  s += box2(W, F, 0.24, 1.84);
  if (W.legend) s += goldTrim(`M${xy(F, rg.a, rg.q, rg.ze)}L${xy(F, rg.um, rg.q, rg.zt)}L${xy(F, rg.b, rg.q, rg.ze)}L${xy(F, rg.b, rg.p, rg.ze)}`);
  return { s, bodyH: 56 };
}

/** An onion dome over a screen ellipse (cx, cy, rx), rising h; one shade and one highlight. */
function dome(cx, cy, rx, h, c) {
  const d = `${M(cx - rx, cy)}C${N(cx - rx * 1.15)} ${N(cy - h * 0.55)} ${N(cx - rx * 0.25)} ${N(cy - h * 0.7)} ${N(cx)} ${N(cy - h)}C${N(cx + rx * 0.25)} ${N(cy - h * 0.7)} ${N(cx + rx * 1.15)} ${N(cy - h * 0.55)} ${N(cx + rx)} ${N(cy)}A${N(rx)} ${N(rx / 2)} 0 0 1 ${N(cx - rx)} ${N(cy)}Z`;
  const sh = `${M(cx + rx * 0.15, cy + rx * 0.5)}C${N(cx + rx * 0.35)} ${N(cy - h * 0.3)} ${N(cx + rx * 0.2)} ${N(cy - h * 0.62)} ${N(cx)} ${N(cy - h)}C${N(cx + rx * 0.25)} ${N(cy - h * 0.7)} ${N(cx + rx * 1.15)} ${N(cy - h * 0.55)} ${N(cx + rx)} ${N(cy)}A${N(rx)} ${N(rx / 2)} 0 0 1 ${N(cx + rx * 0.15)} ${N(cy + rx * 0.5)}Z`;
  return path(d, c, { ns: 1 }) + path(sh, dk(c, 0.18), { ns: 1 }) + line(`${M(cx - rx * 0.6, cy - h * 0.2)}Q${N(cx - rx * 0.55)} ${N(cy - h * 0.55)} ${N(cx - rx * 0.15)} ${N(cy - h * 0.78)}`, '#fff3b0', 2.4, { op: 0.85 }) + path(d, 'none', { sw: 2 });
}

function towerHome(F, W, gold) {
  const u0 = 0.3;
  const v0 = 0.3;
  const u1 = 1.7;
  const v1 = 1.5;
  const z1 = 26;
  const a0 = 0.48;
  const b0 = 0.45;
  const a1 = 1.48;
  const b1 = 1.3;
  const z2 = 52;
  const rh = 30;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const stone = gold ? WHITE : '#d8cfc0';
  const trimC = gold ? GOLD : '#8a5a34';
  let s = shadowBox(F, u0, v0, u1, v1);
  const stones = (w) => path(cpath([[6, 20, 2.4], [w - 8, 10, 2.2], [w * 0.5, 23, 2]]), dk(stone, 0.12), { sw: 0.8 });
  const lf = stones(LW) + win(4, 8, 12, 11, { lit: gold }) + door(29, 8, 12, z1 - 8, W.col, { arch: true, glass: true, lit: gold }) + heartRow(W.hearts, 22, 3.4, 0.85);
  const rf = stones(RW) + win(12, 8, 13, 11, { lit: gold });
  s += box(F, u0, v0, u1, v1, 0, z1, stone, { lf, rf, top: gold ? '#fff4c8' : '#e8e0d2' });
  // The terrace rail on the ground floor's roof.
  const rail = `M${xy(F, u0 + 0.04, v1 - 0.04, z1 + 7)}L${xy(F, u1 - 0.04, v1 - 0.04, z1 + 7)}L${xy(F, u1 - 0.04, v0 + 0.04, z1 + 7)}`;
  // Upper floor (gold: a banner in the class colour down its front).
  const L2 = (a1 - a0) * 32;
  const R2 = (b1 - b0) * 32;
  const upC = gold ? '#fff6dc' : CREAM;
  const lf2 = line(`M0 1V${z2 - z1}M${N(L2)} 1V${z2 - z1}`, trimC, 3) + win(6, 6, 10, 12, { lit: gold }) + win(19, 6, 10, 12, { lit: gold });
  const rf2 = line(`M0 1V${z2 - z1}M${N(R2)} 1V${z2 - z1}`, trimC, 3) + circ(R2 / 2, 11, 5, gold ? LIT : NITE ? LIT : GLASS, { sw: 1.3 });
  s += box(F, a0, b0, a1, b1, z1, z2 - z1, upC, { lf: lf2, rf: rf2, top: gold ? '#ffe9a0' : 'none' });
  s += line(rail, O, 2.8) + line(rail, gold ? GOLD : WOOD_L, 1.3);
  for (const [u, v] of [[u0 + 0.04, v1 - 0.04], [(u0 + u1) / 2, v1 - 0.04], [u1 - 0.04, v1 - 0.04], [u1 - 0.04, (v0 + v1) / 2], [u1 - 0.04, v0 + 0.04]]) s += line(`M${xy(F, u, v, z1)}L${xy(F, u, v, z1 + 7)}`, O, 1.4);
  const um = (a0 + a1) / 2;
  const vm = (b0 + b1) / 2;
  if (gold) {
    // The golden house: an onion dome and a spire with a star (a silhouette no other tier has).
    const [cx, cy] = F.p(um, vm, z2);
    s += dome(cx, cy + 1, 25, 40, GOLD);
    s += stick(`${M(cx, cy - 39)}V${N(cy - 44)}`, GOLD, 2, 1.8) + circ(cx, cy - 45, 2.6, '#fff3b0', { sw: 1.2 });
    // Banners in the class colour hanging from the terrace.
    for (const u of [a0 + 0.12, a1 - 0.12]) {
      const [bx, by] = F.p(u, v1 + 0.02, z1 + 6);
      s += path(`${M(bx - 4, by)}L${N(bx + 4)} ${N(by + 4)}V${N(by + 18)}L${N(bx)} ${N(by + 14)}L${N(bx - 4)} ${N(by + 14)}Z`, W.col, { sw: 1.2 }) + circ(bx, by + 6, 1.6, GOLD, { ns: 1 });
    }
    s += sparkle(cx - 34, cy - 18, 4) + sparkle(cx + 32, cy - 6, 3.4) + sparkle(cx - 40, cy + 30, 3);
    if (W.mascot >= 0) s += ears(W.mascot, F.p(um - 0.3, vm + 0.3, z2 + 3), F.p(um + 0.3, vm - 0.3, z2 + 3)) + star(cx, cy - 51, 6, '#fff3b0', { sw: 1.3 });
    else s += weathervane(cx, cy - 46, W.hat, W.col);
  } else {
    s += roofHip(F, a0, b0, a1, b1, z2, rh, W.roof, { ov: 0.12 });
    const [ax, ay] = F.p(um, vm, z2 + rh);
    s += W.mascot >= 0 ? ears(W.mascot, F.p(um - 0.04, vm + 0.2, z2 + rh - 11), F.p(um + 0.2, vm - 0.04, z2 + rh - 11)) : roofTop(W, [ax, ay + 1]);
    if (W.legend) s += star(ax, ay - 2, 5, GOLD);
  }
  // Class flag on the terrace corner.
  const [fx, fy] = F.p(u1 - 0.1, v1 - 0.1, z1);
  s += flag(fx, fy, 28, W.col, 1, true);
  s += propLean(W.prop, ...F.p(u0 + 45 / 32 + 0.05, v1 + 0.09), W.col);
  s += box2(W, F, 0.22, 1.86);
  if (W.legend || gold) s += goldTrim(`M${xy(F, u0, v1, z1)}L${xy(F, u1, v1, z1)}L${xy(F, u1, v0, z1)}`);
  return { s, bodyH: gold ? 100 : 80 };
}

/**
 * A survivor's home (2×2). tier: tent | shack | cabin | cottage | tower | gold (HOME_TIERS).
 * person: a generated survivor (class colour, hat, mascot, prop, first name). o: roof (a colour
 * shared by siblings; default the class colour), hearts (0..5 plaques by the door), golden
 * (golden mailbox; default person.golden), legend (gold trim; default person.rarity ===
 * 'legend'), wish (the mailbox flag goes up), name (on the mailbox; default person.first),
 * night (lit windows). Returns { svg, artH, bodyH, top, door: [u, v] } (door = tile-local spot
 * in front of the door; top = the art's highest point in its viewBox, for bubbles).
 */
export function homeArt(person, tier = 'tent', o = {}) {
  const t = HOME_H[tier] ? tier : 'tent';
  const W = homeOwner(person, o || {});
  const F = frame(2, 2, HOME_H[t]);
  const r = withNight(o && o.night, () => {
    if (t === 'tent') return tentHome(F, W);
    if (t === 'shack') return shackHome(F, W);
    if (t === 'cabin') return cabinHome(F, W);
    if (t === 'cottage') return cottageHome(F, W);
    return towerHome(F, W, t === 'gold');
  });
  return { svg: svgWrap(F.W, F.H, r.s, `ls-home ls-${t}${W.legend ? ' ls-legend' : ''}`), artH: F.H, bodyH: r.bodyH, top: topOf(`h:${t}`, F.H), door: HOME_DOOR[t].slice() };
}

// --- Landmarks --------------------------------------------------------------------------------

const LM_H = { tower: 300, drivein: 236, radio: 330, fire: 232, wheel: 262, light: 284 };

/** Pipe scaffolding round a box, with plank decks every `step` px. */
function scaffold(F, u0, v0, u1, v1, z1, step = 30) {
  const vert = (u, v) => {
    const [x, y] = F.p(u, v);
    return `${M(x, y)}V${N(y - z1)}`;
  };
  let d = vert(u0, v0) + vert(u1, v0) + vert(u0, v1);
  const front = vert(u1, v1);
  for (let z = step; z <= z1 + 0.5; z += step) {
    d += `M${xy(F, u0, v1, z)}L${xy(F, u1, v1, z)}L${xy(F, u1, v0, z)}M${xy(F, u0, v1, z)}L${xy(F, u0, v0, z)}L${xy(F, u1, v0, z)}`;
    d += `M${xy(F, u0, v1, z - step)}L${xy(F, u1, v1, z)}M${xy(F, u1, v1, z - step)}L${xy(F, u1, v0, z)}`;
  }
  let s = line(d, O, 3) + line(d, '#9aa0a8', 1.4);
  for (let z = step; z <= z1 + 0.5; z += step) s += face(F, [[u0, v1 - 0.14, z], [u1, v1 - 0.14, z], [u1, v1, z], [u0, v1, z]], WOOD_L, { sw: 1.2 }) + face(F, [[u0, v1, z], [u1, v1, z], [u1, v1, z - 2.5], [u0, v1, z - 2.5]], WOOD_D, { sw: 1 });
  return s + line(front, O, 3) + line(front, '#9aa0a8', 1.4);
}

/** A sign on a post knocked crooked, at screen (x, y). */
function tiltSign(x, y, word, rot = -14, col = '#c9b98a') {
  return stick(`${M(x, y)}V${N(y - 16)}`, WOOD_D, 2.2, 1.8) + g(rect(-17, -7, 34, 13, col, { sw: 1.5, rx: 1.5 }) + fitText(-15, -6, 30, 11, word, '#5a4a3a') + circ(-13.5, -3.5, 0.9, '#5b4636', { ns: 1 }) + circ(13.5, -3.5, 0.9, '#5b4636', { ns: 1 }), { tf: `translate(${N(x)} ${N(y - 19)}) rotate(${rot})` });
}

/** Planks nailed across (face-local), a quick boarded-up patch. */
const planksX = (x, y, w, h) => rect(x, y + h * 0.2, w, 3.6, WOOD_L, { sw: 1, tf: `rotate(-12 ${N(x + w / 2)} ${N(y + h * 0.2)})` }) + rect(x, y + h * 0.65, w, 3.6, WOOD, { sw: 1, tf: `rotate(10 ${N(x + w / 2)} ${N(y + h * 0.65)})` });

/** Weeds at the given tile-local points. */
const weeds = (F, pts) => tufts(pts.map(([u, v]) => F.p(u, v)), OLIVE, 1.2);

/** The Water Tower's tank (shared with BOSS_SPOT): centre x, bottom and top y above the ground point, radii. */
const TANK = { yb: 130, yt: 196, rx: 54, ry: 26 };

/**
 * Letters painted round a cylinder (a tank): spaced evenly by angle about the front, each
 * standing upright on the ellipse through (cx, yc) and squeezed by its foreshortening.
 */
function arcText(cx, yc, rx, ry, s, fs, fill, ol, span = 1.08) {
  const n = s.length;
  const k = Math.min(1, (rx * 2 * span) / n / (0.66 * fs));
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = -span + (2 * span * (i + 0.5)) / n;
    const x = cx + rx * Math.sin(a);
    const y = yc - ry * (1 - Math.cos(a));
    out += `<text transform="translate(${N(x)} ${N(y)}) scale(${Math.round(k * Math.cos(a) * 100) / 100} 1)">${esc(s[i])}</text>`;
  }
  return `<g font-size="${N(fs)}" fill="${fill}" stroke="${ol}" stroke-width="2.6" paint-order="stroke">${out}</g>`;
}

function waterTower(F, r, town, color) {
  let s = '';
  const legC = r ? WHITE : '#7d6a52';
  const base = [[0.7, 0.7], [2.3, 0.7], [2.3, 2.3], [0.7, 2.3]];
  const top = [[1.08, 1.08], [1.92, 1.08], [1.92, 1.92], [1.08, 1.92]];
  const zt = 126;
  const at3 = (k, t) => [base[k][0] + (top[k][0] - base[k][0]) * t, base[k][1] + (top[k][1] - base[k][1]) * t, zt * t];
  const leg = (k) => `M${xy(F, ...base[k])}L${xy(F, ...top[k], zt)}`;
  const brace = (a, b) => {
    let d = '';
    for (const [t0, t1] of [[0.05, 0.5], [0.5, 0.95]]) d += `M${xy(F, ...at3(a, t0))}L${xy(F, ...at3(b, t1))}M${xy(F, ...at3(b, t0))}L${xy(F, ...at3(a, t1))}`;
    return d;
  };
  s += ell(...F.p(1.5, 1.5), 70, 30, O, { ns: 1, op: 0.1 });
  s += line(brace(0, 1) + brace(0, 3), O, 2.4) + line(brace(0, 1) + brace(0, 3), legC, 1);
  s += stick(leg(0), legC, 4);
  s += stick(leg(1) + leg(3), legC, 4.4);
  s += line(brace(3, 2) + brace(1, 2), O, 2.6) + line(brace(3, 2) + brace(1, 2), legC, 1.2);
  // Ladder up the front.
  const [lx, ly] = F.p(2.05, 2.25);
  let rungs = '';
  for (let y = ly - 8; y > ly - 118; y -= 9) if (r || y > ly - 70 || y < ly - 90) rungs += `M${N(lx - 4)} ${N(y)}H${N(lx + 4)}`;
  s += line(`${M(lx - 4, ly)}V${N(ly - 122)}M${N(lx + 4)} ${N(ly)}V${N(ly - 122)}${rungs}`, O, 1.8);
  s += stick(leg(2), legC, 4.6);
  // The tank.
  const [cx, gy] = F.p(1.5, 1.5);
  const yb = gy - TANK.yb;
  const yt = gy - TANK.yt;
  const { rx, ry } = TANK;
  const tank = r ? '#8fd0f5' : '#8e8f6e';
  s += ell(cx, yb + 2, rx + 10, ry + 5, r ? '#d9d3c5' : '#8a8570', { sw: 1.6 });
  s += path(`${M(cx - rx, yt)}V${N(yb)}A${rx} ${ry} 0 0 0 ${N(cx + rx)} ${N(yb)}V${N(yt)}Z`, tank, { sw: 2.2 });
  s += path(`${M(cx + 18, yt)}V${N(yb + ry * 0.94)}A${rx} ${ry} 0 0 0 ${N(cx + rx)} ${N(yb)}V${N(yt)}Z`, O, { ns: 1, op: 0.14 });
  s += line(`${M(cx - 40, yt + 30)}V${N(yb + 14)}`, '#ffffff', 3, { op: r ? 0.55 : 0.25 });
  // The front of the tank shows from the roof's rim (yt + ry) down to the bottom (yb + ry).
  const yc = (yt + yb) / 2 + ry + 2;
  if (r) {
    const label = town ? townLabel(town) : '';
    if (label) {
      // The town's name, big, on a band in the town colour round the tank; a heart above it.
      const h = 15;
      const arc = (y, sweep) => `A${rx} ${ry} 0 0 ${sweep} `;
      s += path(`${M(cx - rx, yc - h - ry)}${arc(0, 0)}${N(cx + rx)} ${N(yc - h - ry)}V${N(yc + h - ry)}${arc(0, 1)}${N(cx - rx)} ${N(yc + h - ry)}Z`, color, { sw: 1.6 });
      s += line(`${M(cx - rx, yc - h + 3 - ry)}A${rx} ${ry} 0 0 0 ${N(cx + rx)} ${N(yc - h + 3 - ry)}`, '#ffffff', 1.2, { op: 0.6 });
      s += arcText(cx, yc + 7.5, rx, ry, label, 21, '#ffffff', O);
      s += path(heartD(cx, yc - h - 9, 7), '#ff4f6d', { sw: 1.6 }) + path(heartD(cx - 2.5, yc - h - 11.5, 2), '#ffffff', { ns: 1, op: 0.6 });
    } else s += path(heartD(cx - 3, yc - 4, 17), '#ff4f6d', { sw: 2 }) + path(heartD(cx - 9, yc - 9, 4), '#ffffff', { ns: 1, op: 0.6 });
  } else {
    s += rect(cx - 34, yt + 30, 14, 10, '#a0643a', { sw: 1.2, tf: `rotate(-8 ${N(cx - 27)} ${N(yt + 35)})` }) + rect(cx + 12, yt + 34, 12, 9, '#9a958a', { sw: 1.2 });
    s += line(`${M(cx - 8, yt + 30)}V${N(yt + 46)}M${N(cx + 28)} ${N(yt + 48)}V${N(yt + 62)}M${N(cx - 44)} ${N(yt + 44)}V${N(yt + 56)}`, '#6a5a3a', 2.2, { op: 0.6 });
  }
  // Front railing of the catwalk.
  const rail = `${M(cx - rx - 10, yb - 8)}A${rx + 10} ${ry + 5} 0 0 0 ${N(cx + rx + 10)} ${N(yb - 8)}`;
  s += line(rail, O, 3) + line(rail, r ? WHITE : '#9a958a', 1.4);
  let posts = '';
  for (const t of [-0.95, -0.6, -0.2, 0.2, 0.6, 0.95]) {
    const x = cx + t * (rx + 10);
    const y = yb + (ry + 5) * Math.sqrt(1 - t * t);
    posts += `${M(x, y + 2)}V${N(y - 8)}`;
  }
  s += line(posts, O, 1.6);
  // Roof cone and the hatch on top.
  s += path(`${M(cx - rx - 4, yt)}A${rx + 4} ${ry + 2} 0 0 0 ${N(cx + rx + 4)} ${N(yt)}L${N(cx)} ${N(yt - 28)}Z`, r ? '#e8483f' : '#7f6a52', { sw: 2.2 });
  s += path(`${M(cx + 8, yt - 23)}L${N(cx + rx + 4)} ${N(yt)}A${rx + 4} ${ry + 2} 0 0 1 ${N(cx + 22)} ${N(yt + ry + 1)}Z`, O, { ns: 1, op: 0.18 });
  s += ell(cx, yt - 27, 8, 3.5, r ? '#ff7a6a' : '#8f7a5a', { sw: 1.6 });
  if (r) s += flag(cx, yt - 28, 26, color);
  else {
    s += scaffold(F, 0.42, 1.98, 1.02, 2.62, 90, 30);
    s += weeds(F, [[0.62, 0.62], [2.4, 0.8], [0.6, 2.45], [2.42, 2.4], [1.6, 2.8]]) + tiltSign(...F.p(2.6, 2.75), 'WATER', 12);
  }
  if (NITE && r) s += path(`${M(cx - 6, yb + ry + 2)}L${N(cx - 40)} ${N(gy - 4)}H${N(cx + 30)}Z`, LIT, { ns: 1, op: 0.18 });
  return { s, bodyH: 216 };
}

function driveIn(F, r) {
  let s = '';
  // Gravel lot.
  s += face(F, [[0.05, 0.05], [2.95, 0.05], [2.95, 2.95], [0.05, 2.95]], r ? '#6a6472' : '#8f8d78', { sw: 1.3 });
  if (r) s += onT(F, 0.2, 1.2, 0, line('M0 4H50M0 30H50M60 4H70', '#ffffff', 1.6, { op: 0.6 }));
  else s += line(`M${xy(F, 1.0, 1.3)}l12 4l-4 6l10 3M${xy(F, 2.3, 1.5)}l-8 6l4 5`, O, 1, { op: 0.4 });
  // Screen supports.
  const sv = 0.5;
  const zb = 40;
  const zt = 118;
  const beam = r ? WOOD : '#7d6a52';
  let d = '';
  for (const u of [0.45, 1.5, 2.55]) d += `M${xy(F, u, sv)}L${xy(F, u, sv, zb)}M${xy(F, u, 0.15)}L${xy(F, u, sv, 30)}`;
  s += line(d, O, 4.4) + line(d, beam, 2.4);
  // The screen.
  const SW = 2.5 * 32;
  const SH = zt - zb;
  let sc = '';
  if (r) {
    if (NITE) sc += rect(-4, -4, SW + 8, SH + 8, '#fff6c8', { ns: 1, op: 0.45 });
    sc += rect(0, 0, SW, SH, '#2f3f86', { sw: 2.4 });
    sc += circ(SW - 14, 14, 7, '#ffe58a', { sw: 1.4 }) + path(cpath([[12, 10, 1.2], [26, 18, 1], [46, 8, 1.2], [36, 26, 0.9]]), '#ffffff', { ns: 1 });
    // A goofy cartoon zombie popping up: the B-movie.
    sc += path(`M14 ${SH}Q14 ${SH - 30} 34 ${SH - 34}Q56 ${SH - 30} 56 ${SH}Z`, '#9fd46a', { sw: 2 });
    sc += circ(28, SH - 22, 6, WHITE, { sw: 1.4 }) + circ(29.5, SH - 21, 2.4, O, { ns: 1 }) + circ(42, SH - 21, 4.5, WHITE, { sw: 1.3 }) + circ(43, SH - 20.5, 1.8, O, { ns: 1 });
    sc += path(`M26 ${SH - 10}Q35 ${SH - 3} 46 ${SH - 11}Q35 ${SH - 7} 26 ${SH - 10}Z`, '#6a2a3a', { sw: 1.2 }) + rect(33, SH - 9.5, 3, 2.6, WHITE, { ns: 1 });
    sc += path(`M10 ${SH - 18}l-5 -9M60 ${SH - 18}l5 -9`, 'none', { stroke: '#9fd46a', sw: 4 });
    sc += fitText(46, 30, 30, 12, 'BOO!', '#ffe58a', { ol: O, olw: 1.8 });
  } else {
    sc += rect(0, 0, SW, SH, '#a9a88e', { sw: 2.4 }) + vlines(SW, SH, 16, O, 0.18);
    sc += path(`M22 18L34 14L38 30L28 40L18 32Z`, '#3b3a30', { sw: 1.4 }) + line('M22 18L34 14L38 30L28 40L18 32Z'.replace(/Z/, ''), '#7d6a52', 1) + path(`M54 46L66 50L62 66L50 62Z`, '#3b3a30', { sw: 1.4 });
    sc += path(`M38 30L46 44L40 46Z`, '#c9c8ae', { sw: 1.2 }) + line('M8 50l6 18M70 10l-4 16', '#6a6a50', 1.4, { op: 0.6 });
  }
  s += box(F, 0.25, sv - 0.08, 2.75, sv, zb, SH, r ? '#4a4f5c' : '#6d6a58', { lf: sc, top: r ? '#6a7080' : '#86836e', sw: 2.2 });
  if (r) s += bulbs([0.1, 0.3, 0.5, 0.7, 0.9].map((t) => F.p(0.25 + 2.5 * t, sv, zt + 3)), true, 1.8);
  // Speaker posts.
  const posts = [[0.55, 1.55], [1.45, 1.55], [2.35, 1.5], [0.6, 2.45], [1.45, 2.45]];
  posts.forEach(([u, v], k) => {
    const [x, y] = F.p(u, v);
    const tilt = !r && k % 2 ? 18 : 0;
    s += g(stick(`${M(0, 0)}V-13`, STEEL_D, 1.8, 1.6) + rect(-4, -19, 8, 7, r ? '#5a5f6e' : '#7a7766', { sw: 1.3, rx: 1.5 }) + circ(0, -15.5, 1.8, r ? '#c9ccd2' : '#5a5848', { ns: 1 }), { tf: `translate(${N(x)} ${N(y)})${tilt ? ` rotate(${tilt})` : ''}` });
  });
  // A car watching (restored).
  if (r) {
    s += box(F, 0.85, 1.85, 1.3, 2.2, 3, 7, '#ff8a5a', { top: '#ffb08a', lf: circ(4, 8, 3, RUBBER, { sw: 1 }) + circ(11, 8, 3, RUBBER, { sw: 1 }) });
    s += box(F, 0.9, 1.9, 1.22, 2.15, 10, 6, '#ff8a5a', { lf: rect(1, 1, 8, 4, GLASS, { sw: 0.8 }), rf: rect(1, 1, 6, 4, GLASS, { sw: 0.8 }), top: '#ffb08a', sw: 1.6 });
  }
  // Projection booth / snack bar.
  const bu0 = 2.05;
  const bv0 = 1.95;
  const bu1 = 2.8;
  const bv1 = 2.8;
  const bLW = (bu1 - bu0) * 32;
  const bRW = (bv1 - bv0) * 32;
  const bc = r ? CREAM : '#a8a58c';
  const blf = r ? rect(0, 0, bLW, 5, RED, { ns: 1 }) + win(4, 9, 14, 9, { lit: true }) + fitText(2, 19, bLW - 4, 7, 'SNACKS', RED) : boarded(4, 9, 14, 10) + planksX(1, 1, 22, 20);
  const brf = r ? rect(0, 0, bRW, 5, RED, { ns: 1 }) + door(8, 8, 10, 18, RED) : boarded(8, 8, 10, 16);
  s += box(F, bu0, bv0, bu1, bv1, 0, 26, bc, { lf: blf, rf: brf, top: r ? '#ece4d2' : '#9a9880' });
  if (r && NITE) {
    // At dusk the B-movie plays: the projector's beam from the booth to the screen.
    const [px, py] = F.p(bu0 + 0.08, bv0 + 0.3, 20);
    const [qx, qy] = F.p(1.5, sv, (zb + zt) / 2);
    s += path(`${M(px, py)}L${N(qx - 30)} ${N(qy - 28)}L${N(qx + 22)} ${N(qy + 30)}Z`, '#fff6c8', { ns: 1, op: 0.22 });
  }
  // Marquee sign on a pole at the front-left.
  if (r) {
    const [mx, my] = F.p(0.35, 2.7);
    s += stick(`${M(mx, my)}V${N(my - 40)}`, STEEL_D, 2.4, 2) + onL(F, 0.05, 2.7, 58, rect(0, 0, 38, 15, RED, { sw: 1.8, rx: 2 }) + fitText(2, 1, 34, 13, 'DRIVE-IN', '#ffffff', { ol: O, olw: 1.8 }) + bulbs([4, 11, 18, 25, 32].map((x) => [x + 1, -2.5]), true, 1.4));
  } else {
    s += scaffold(F, 1.9, 0.62, 2.7, 0.95, 90, 30);
    s += weeds(F, [[0.3, 0.9], [1.1, 2.1], [2.0, 1.6], [0.9, 2.8], [2.8, 1.3]]) + tiltSign(...F.p(0.45, 2.65), 'DRIVE-IN', -16);
  }
  return { s, bodyH: 120 };
}

function radioMast(F, r) {
  let s = '';
  const mu = 1.4;
  const mv = 0.95;
  const [cx, gy] = F.p(mu, mv);
  const H = 236;
  const legC = r ? WHITE : '#8a6a4a';
  // Concrete pad under the mast.
  s += face(F, [[mu - 0.45, mv - 0.45], [mu + 0.45, mv - 0.45], [mu + 0.45, mv + 0.45], [mu - 0.45, mv + 0.45]], r ? '#cfc9bc' : '#9a9682', { sw: 1.3 });
  // Guy wires.
  const wTop = gy - 170;
  const anchors = [F.p(0.15, 0.2), F.p(2.75, 0.25), F.p(2.8, 2.0)];
  let wd = '';
  anchors.forEach(([x, y], k) => {
    const sx = cx + (x < cx ? -6 : 6);
    if (!r && k === 2) wd += `${M(sx, wTop)}Q${N(sx + 26)} ${N(wTop + 120)} ${N(sx + 32)} ${N(wTop + 92)}`;
    else wd += `${M(sx, wTop)}L${N(x)} ${N(y)}`;
  });
  s += line(wd, O, 1);
  s += path(cpath(anchors.map(([x, y]) => [x, y - 1, 2.6])), '#8a8570', { sw: 1 });
  // The lattice (drawn as a column, bent at the top when ruined).
  const lattice = (y0, y1, w0, w1) => {
    const d = `${M(cx - w0, y0)}L${N(cx - w1)} ${N(y1)}M${N(cx + w0)} ${N(y0)}L${N(cx + w1)} ${N(y1)}M${N(cx)} ${N(y0 + 3)}L${N(cx)} ${N(y1)}`;
    let z = '';
    const n = Math.round((y0 - y1) / 16);
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const wa = w0 + (w1 - w0) * t0;
      const wb = w0 + (w1 - w0) * t1;
      const ya = y0 + (y1 - y0) * t0;
      const yb2 = y0 + (y1 - y0) * t1;
      z += k % 2 ? `${M(cx + wa, ya)}L${N(cx - wb)} ${N(yb2)}` : `${M(cx - wa, ya)}L${N(cx + wb)} ${N(yb2)}`;
      z += `${M(cx - wb, yb2)}H${N(cx + wb)}`;
    }
    let bands = '';
    if (r) {
      for (let k = 0; k < n; k += 4) {
        const ta = k / n;
        const tb = Math.min(1, (k + 2) / n);
        for (const sg of [-1, 1]) bands += `${M(cx + sg * (w0 + (w1 - w0) * ta), y0 + (y1 - y0) * ta)}L${N(cx + sg * (w0 + (w1 - w0) * tb))} ${N(y0 + (y1 - y0) * tb)}`;
      }
    }
    return line(z, O, 2.2) + line(z, legC, 0.9) + line(d, O, 4.4) + line(d, legC, 2.2) + (bands ? line(bands, RED, 2.6) : '');
  };
  const yBend = gy - 176;
  s += lattice(gy, yBend, 18, 6);
  const topPart = lattice(yBend, gy - H, 6, 2.5) + line(`${M(cx, gy - H)}V${N(gy - H - 16)}`, O, 1.8) + circ(cx, gy - H - 17, 2.6, r ? RED : '#7a5a4a', { sw: 1.2 });
  s += r ? topPart : g(topPart, { tf: `rotate(24 ${N(cx)} ${N(yBend)})` });
  // Dishes.
  const dish = (x, y, dir, tilt = 0) => g(path(`M0 -9Q${N(dir * 9)} 0 0 9Q${N(dir * 3)} 0 0 -9Z`, r ? '#e8e4dc' : '#9a958a', { sw: 1.5 }) + line(`M0 0L${N(dir * 7)} 0`, O, 1.2), { tf: `translate(${N(x)} ${N(y)}) rotate(${tilt})` });
  s += dish(cx - 14, gy - 112, -1, r ? 0 : 30) + dish(cx + 11, gy - 140, 1);
  // Lights.
  if (r) s += g(bulbs([[cx, gy - H - 17], [cx - 7, gy - 120], [cx + 7, gy - 120], [cx - 11, gy - 64], [cx + 11, gy - 64]], true, 2.2, '#ff8a7a'), { cls: 'ls-blink' });
  else s += scaffold(F, mu - 0.42, mv - 0.42, mu + 0.38, mv + 0.38, 60, 30);
  // The studio hut, front-left.
  const u0 = 0.3;
  const v0 = 1.6;
  const u1 = 1.5;
  const v1 = 2.75;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const hc = r ? CREAM : '#a8a58c';
  let lf = r ? rect(0, 0, LW, 5, RED, { ns: 1 }) : '';
  lf += r ? door(6, 10, 11, 20, BLUE, { glass: true }) : boarded(6, 10, 11, 20);
  lf += r ? win(22, 10, 14, 10, { lit: true }) : planksX(20, 9, 18, 12) + win(22, 10, 14, 10, { glass: '#4a5050', bars: false });
  const sign = r ? rect(-2, -2, 22, 10, '#ff6a5a', { ns: 1, op: 0.35 }) + rect(0, 0, 18, 6, RED, { sw: 1.2, rx: 1.5 }) + fitText(1, 0, 16, 6, 'ON AIR', '#ffffff', { k: 0.9 }) : g(rect(0, 0, 18, 6, '#7a5a4a', { sw: 1.2, rx: 1.5 }) + fitText(1, 0, 16, 6, 'ON AIR', '#c9b9a0', { k: 0.9 }), { tf: 'rotate(10 9 3)' });
  lf += `<g transform="translate(5 1.5)">${sign}</g>`;
  const rf = r ? rect(0, 0, RW, 5, RED, { ns: 1 }) + win(12, 10, 14, 11) : boarded(12, 10, 14, 11);
  s += box(F, u0, v0, u1, v1, 0, 30, hc, { lf, rf, top: r ? '#ece4d2' : '#9a9880' });
  // Roof dish.
  const [dx, dy] = F.p(0.55, 1.8, 30);
  s += stick(`${M(dx, dy)}v-6`, STEEL_D, 1.5, 1.4) + g(path('M-7 0Q0 7 7 0Q0 3 -7 0Z', r ? WHITE : '#9a958a', { sw: 1.3 }), { tf: `translate(${N(dx)} ${N(dy - 7)}) rotate(-20)` });
  if (r) {
    // Music notes floating out.
    const [nx, ny] = F.p(1.55, 2.6, 40);
    s += path(`${M(nx, ny)}v-10l7 -2v10M${N(nx + 14)} ${N(ny - 16)}v-9l6 -2v9`, 'none', { sw: 1.6 }) + path(epath([[nx - 2, ny, 2.4, 1.8], [nx + 5, ny - 2, 2.4, 1.8], [nx + 12, ny - 16, 2.2, 1.7], [nx + 18, ny - 18, 2.2, 1.7]]), O, { ns: 1 });
  } else s += weeds(F, [[0.4, 0.4], [2.2, 0.6], [0.4, 1.4], [2.6, 2.6], [2.85, 1.4]]) + tiltSign(...F.p(2.3, 2.7), 'RADIO', -12);
  return { s, bodyH: 120 };
}

function fireStation(F, r) {
  let s = '';
  const u0 = 0.2;
  const v0 = 0.25;
  const u1 = 2.8;
  const v1 = 1.95;
  const zH = 56;
  const LW = (u1 - u0) * 32;
  const RW = (v1 - v0) * 32;
  const brick = r ? BRICK : '#8c7a5c';
  const trim = r ? WHITE : '#b5ad94';
  s += face(F, [[0.2, 1.95], [2.8, 1.95], [2.8, 2.85], [0.2, 2.85]], r ? '#d9d3c5' : '#a39f88', { sw: 1.3 });
  if (!r) s += line(`M${xy(F, 0.6, 2.3)}l14 5l-4 4M${xy(F, 2.0, 2.2)}l10 -2`, O, 1, { op: 0.4 });
  // Left face: the big door, sign, windows.
  let lf = bricks(LW, zH, r ? '#8a2e1e' : '#5a4e3a', 0.45) + rect(0, 0, LW, 4, trim, { ns: 1 }) + line(`M0 4H${N(LW)}`, O, 1);
  const dx = 7;
  const dw = 36;
  const dy = 20;
  lf += path(`M${dx - 2} ${zH}V${dy + 4}Q${dx - 2} ${dy - 3} ${dx + 8} ${dy - 3}H${dx + dw - 8}Q${dx + dw + 2} ${dy - 3} ${dx + dw + 2} ${dy + 4}V${zH}Z`, trim, { sw: 1.4 });
  if (r) {
    lf += rect(dx, dy, dw, zH - dy, '#2e2630', { sw: 1.2 }) + rect(dx, dy, dw, 5, '#c84a3a', { sw: 1 }) + hlines(dx + dw, dy + 5, 1.6, O, 0.5, dx, dy);
    // The red truck, nose out.
    lf += rect(dx + 5, dy + 9, dw - 10, zH - dy - 9, RED, { sw: 1.4, rx: 2 }) + rect(dx + 8, dy + 11, dw - 16, 9, GLASS, { sw: 1 }) + rect(dx + 10, dy + 23, dw - 20, 7, '#c9ccd2', { sw: 1 }) + vlines(dx + dw - 10, dy + 30, 3, O, 0.5, dy + 23, 1, dx + 10);
    lf += circ(dx + 9, dy + 27, 2.6, LIT, { sw: 1 }) + circ(dx + dw - 9, dy + 27, 2.6, LIT, { sw: 1 }) + rect(dx + 4, zH - 4, dw - 8, 3.5, STEEL, { sw: 1 }) + rect(dx + dw / 2 - 5, dy + 6, 4, 3, BLUE, { sw: 0.8 }) + rect(dx + dw / 2 + 1, dy + 6, 4, 3, RED, { sw: 0.8 });
  } else {
    lf += rect(dx, dy, dw, zH - dy, '#a86a5a', { sw: 1.2 }) + hlines(dx + dw, zH, 4.5, O, 0.35, dx, dy) + path(`M${dx + 10} ${dy + 14}q5 3 9 0`, 'none', { sw: 1.2, op: 0.5 }) + planksX(dx - 2, dy + 6, dw + 4, 24);
  }
  lf += r ? rect(dx + 4, 6, dw - 8, 11, WHITE, { sw: 1.3, rx: 1.5 }) + fitText(dx + 5, 6, dw - 10, 11, 'FIRE', RED) : g(rect(dx + 4, 6, dw - 8, 11, '#c9c2a8', { sw: 1.3, rx: 1.5 }) + fitText(dx + 5, 6, dw - 10, 11, 'FIRE', '#7a6a50'), { tf: `rotate(6 ${dx + dw / 2} 11)` });
  lf += r ? win(50, 9, 11, 12) + win(66, 9, 11, 12) + door(53, 32, 10, 24, RED, { glass: true }) : boarded(50, 9, 11, 12) + boarded(66, 9, 11, 12) + boarded(53, 32, 10, 22);
  if (r) lf += circ(71, 42, 6, RED, { sw: 1.3 }) + circ(71, 42, 2.4, '#c9ccd2', { sw: 0.8 }) + line('M71 48q-2 6 -8 8', '#d9c48e', 2);
  const rf = bricks(RW, zH, r ? '#8a2e1e' : '#5a4e3a', 0.45) + rect(0, 0, RW, 4, trim, { ns: 1 }) + line(`M0 4H${N(RW)}`, O, 1) + (r ? win(10, 10, 12, 13) + win(32, 10, 12, 13) + win(10, 32, 12, 13) + win(32, 32, 12, 13) : boarded(10, 10, 12, 13) + boarded(32, 10, 12, 13) + win(10, 32, 12, 13, { glass: '#4a5050' }) + boarded(32, 32, 12, 13));
  s += box(F, u0, v0, u1, v1, 0, zH, brick, { lf, rf, top: r ? '#b8b1a2' : '#8f8a76' });
  // Parapet lip.
  s += box(F, u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, zH, 3, trim, { top: trim, sw: 1.4 });
  // The hose tower and its bell.
  const t0 = 2.08;
  const t1 = 2.72;
  const w0 = 0.32;
  const w1 = 0.92;
  const tz = zH + 3;
  const tH = 46;
  const tl = bricks((t1 - t0) * 32, tH, r ? '#8a2e1e' : '#5a4e3a', 0.4) + path(`M5 ${tH - 6}V12Q5 4 ${N((t1 - t0) * 16)} 4Q${N((t1 - t0) * 32 - 5)} 4 ${N((t1 - t0) * 32 - 5)} 12V${tH - 6}Z`, '#2e2630', { sw: 1.2 }) + (r ? path(`M${N((t1 - t0) * 16 - 6)} 22Q${N((t1 - t0) * 16 - 6)} 10 ${N((t1 - t0) * 16)} 10Q${N((t1 - t0) * 16 + 6)} 10 ${N((t1 - t0) * 16 + 6)} 22Z`, GOLD, { sw: 1.3 }) : '');
  s += box(F, t0, w0, t1, w1, tz, tH, brick, { lf: tl, rf: bricks((w1 - w0) * 32, tH, r ? '#8a2e1e' : '#5a4e3a', 0.4) + win(5, 10, 9, 14, { glass: r ? GLASS : '#4a5050' }), top: 'none' });
  s += roofHip(F, t0, w0, t1, w1, tz + tH, 18, r ? '#5a4e5e' : '#6a604e', { ov: 0.08 });
  const [fx, fy] = F.p((t0 + t1) / 2, (w0 + w1) / 2, tz + tH + 18);
  if (r) s += flag(fx, fy, 20, RED);
  else {
    s += scaffold(F, 1.75, 1.97, 2.75, 2.3, 60, 30);
    s += weeds(F, [[0.25, 2.0], [1.4, 2.8], [2.8, 2.1], [2.85, 0.4]]) + tiltSign(...F.p(0.55, 2.7), 'FIRE', -15);
  }
  return { s, bodyH: 70 };
}

function wheelLm(F, r) {
  let s = '';
  const metal = r ? WHITE : '#8d8a76';
  s += box(F, 0.35, 0.95, 2.65, 2.05, 0, 5, r ? WOOD_L : '#9a8c6a', { top: r ? '#e9bf86' : '#a8987a', tf: vlines(73.6, 35, 6, WOOD_D, 0.4) });
  const hz = 100;
  const [hx, hy] = F.p(1.5, 1.5, hz);
  const R = 64;
  const legs = (v) => `M${xy(F, 0.72, v, 5)}L${xy(F, 1.5, v, hz)}L${xy(F, 2.28, v, 5)}M${xy(F, 1.0, v, 34)}L${xy(F, 2.0, v, 34)}`;
  s += line(legs(1.28), O, 5.6) + line(legs(1.28), metal, 3);
  // The wheel, in the plane v = 1.5 (local: hub at 0,0).
  let wh = '';
  const spokes = Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2;
    return `M0 0L${N(Math.cos(a) * R)} ${N(Math.sin(a) * R)}`;
  }).join('');
  wh += line(spokes, O, 2.6) + line(spokes, metal, 1.1);
  wh += circ(0, 0, R, 'none', { sw: 7 }) + circ(0, 0, R, 'none', { stroke: r ? RED : '#8a6a4a', sw: 4 }) + circ(0, 0, R - 9, 'none', { sw: 1.4 });
  wh += circ(0, 0, 8, r ? YELLOW : '#9a958a', { sw: 1.8 });
  if (r) {
    const rim = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + 0.2;
      rim.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    wh += bulbs(rim, true, 1.7);
  }
  // Gondolas hang from the rim and stay upright: each sits in the wheel's (sheared) plane at
  // its hanger, un-sheared, inside a counter-rotating group (.ls-gondola), so spinning
  // .ls-rim one way and .ls-gondola the other keeps them hanging straight.
  const gcols = r ? CONFETTI : ['#9a9a80', '#8a8570', '#a39f88'];
  let gd = '';
  for (let k = 0; k < 8; k++) {
    if (!r && (k === 2 || k === 5)) continue;
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const c = gcols[k % gcols.length];
    // A gondola lit per zone (Thrill Hill's wheel, come home).
    const lit = r && k < LM_ZONES;
    const gon = (lit ? circ(0, 10, 10, '#ffe27a', { ns: 1, op: 0.45 }) : '') + line('M0 0V6', O, 1.6) + path('M-7 6H7L6 12Q0 18 -6 12Z', c, { sw: 1.5 }) + path('M-8 6Q0 1 8 6Z', r ? WHITE : '#b5b09a', { sw: 1.3 }) + (lit ? circ(0, 9.5, 2, '#fff4b8', { sw: 0.9 }) : '');
    gd += `<g transform="translate(${N(Math.cos(a) * R)} ${N(Math.sin(a) * R)})">${r ? `<g class="ls-gondola" style="transform-origin:0 0">` : '<g>'}<g transform="matrix(1 -0.5 0 1 0 0)">${gon}</g></g></g>`;
  }
  wh += gd;
  s += `<g transform="matrix(1 0.5 0 1 ${N(hx)} ${N(hy)})">${r ? `<g class="ls-rim" style="transform-origin:0 0">${wh}</g>` : wh}</g>`;
  s += line(legs(1.72), O, 5.6) + line(legs(1.72), metal, 3);
  const [fx, fy] = F.p(1.5, 1.72, hz);
  s += circ(fx, fy, 5, r ? RED : '#8a6a4a', { sw: 1.6 });
  // Ticket booth.
  s += box(F, 0.22, 2.2, 0.78, 2.76, 0, 22, r ? CREAM : '#a8a58c', { lf: r ? win(3, 6, 11, 8, { lit: true }) + rect(0, 0, 18, 3, RED, { ns: 1 }) : boarded(3, 6, 11, 8), top: 'none' });
  s += roofHip(F, 0.22, 2.2, 0.78, 2.76, 22, 14, r ? RED : '#7f6a52', { ov: 0.08, l: r ? '#ff7a6a' : undefined });
  if (r) {
    const [ax, ay] = F.p(0.5, 2.48, 36);
    s += flag(ax, ay, 14, YELLOW, 1, true);
  } else {
    // A fallen gondola, scaffolding, weeds.
    const [gx, gy] = F.p(2.05, 2.5);
    s += g(path('M-7 -6H7L6 0Q0 6 -6 0Z', '#9a9a80', { sw: 1.5 }) + path('M-8 -6Q0 -11 8 -6Z', '#b5b09a', { sw: 1.3 }), { tf: `translate(${N(gx)} ${N(gy - 3)}) rotate(70)` });
    s += scaffold(F, 2.2, 1.15, 2.7, 1.55, 60, 30);
    s += weeds(F, [[0.3, 0.9], [2.7, 0.9], [1.0, 2.4], [2.6, 2.3], [1.6, 2.8]]) + tiltSign(...F.p(1.35, 2.75), 'RIDES', -14);
  }
  return { s, bodyH: 170 };
}

function lighthouse(F, r) {
  let s = '';
  const water = r ? '#5cb8e6' : '#6f9a8a';
  s += face(F, [[0, 1.1], [3, 1.1], [3, 1.45], [0, 1.45]], '#f3d9a4', { sw: 1.2 });
  s += face(F, [[0, 1.35], [3, 1.35], [3, 3], [0, 3]], water, { sw: 1.3 });
  s += line(`M${xy(F, 0.1, 1.35)}L${xy(F, 2.9, 1.35)}`, '#ffffff', 1.6, { op: 0.7 });
  let rp = '';
  for (const [u, v] of [[0.5, 2.0], [2.4, 1.8], [0.9, 2.7], [2.5, 2.6], [0.2, 2.4]]) {
    const [x, y] = F.p(u, v);
    rp += `${M(x - 6, y)}q3 -2 6 0q3 2 6 0`;
  }
  s += line(rp, '#ffffff', 1.2, { op: 0.6 });
  // The pier: piles, deck, rail.
  const pu0 = 1.25;
  const pu1 = 1.75;
  let piles = '';
  for (const v of [1.6, 2.15, 2.7]) for (const u of [pu0 + 0.05, pu1 - 0.05]) {
    const [x, y] = F.p(u, v);
    piles += `${M(x, y + 2)}V${N(y - 8)}`;
  }
  s += line(piles, O, 4.2) + line(piles, WOOD_D, 2.2);
  const deck = r ? WOOD_L : '#a8987a';
  let dtf = hlines(16, 60, 4, WOOD_D, 0.5);
  if (!r) dtf += rect(2, 28, 12, 7, '#3d5a5a', { ns: 1 }) + rect(4, 44, 10, 4, '#3d5a5a', { ns: 1 });
  s += box(F, pu0, 1.05, pu1, 2.95, 8, 3, deck, { top: r ? '#ecc48c' : '#b5a586', tf: dtf, sw: 1.8 });
  // Rowboat (restored).
  if (r) {
    const [bx, by] = F.p(2.25, 2.45);
    s += path(`${M(bx - 13, by - 6)}H${N(bx + 13)}Q${N(bx + 11)} ${N(by + 3)} ${N(bx)} ${N(by + 3)}Q${N(bx - 11)} ${N(by + 3)} ${N(bx - 13)} ${N(by - 6)}Z`, RED, { sw: 1.6 }) + rect(bx - 12, by - 7.5, 24, 3, WHITE, { sw: 1.1 }) + line(`${M(bx - 12, by - 6)}Q${N(bx - 22)} ${N(by - 8)} ${xy(F, pu1, 2.3, 11)}`, '#d8b878', 1.2);
  }
  // Rocks and the tower.
  const [cx, gy] = F.p(0.95, 0.72);
  s += path(cpath([[cx - 22, gy + 2, 9], [cx + 20, gy + 4, 10], [cx - 4, gy + 9, 11], [cx + 30, gy - 6, 7], [cx - 30, gy - 6, 7]]), '#a8a49a', { sw: 1.6 });
  const zr = 6;
  const zg = 128;
  const R0 = 23;
  const R1 = 15;
  const X = (z, sg) => cx + sg * (R0 + ((R1 - R0) * (z - zr)) / (zg - zr));
  const Y = (z) => gy - z;
  const rr = (z) => R0 + ((R1 - R0) * (z - zr)) / (zg - zr);
  const body = r ? WHITE : '#b5b19c';
  const band = r ? RED : '#8a8570';
  s += path(`${M(X(zr, -1), Y(zr))}L${N(X(zg, -1))} ${N(Y(zg))}L${N(X(zg, 1))} ${N(Y(zg))}L${N(X(zr, 1))} ${N(Y(zr))}A${R0} ${R0 / 2} 0 0 1 ${N(X(zr, -1))} ${N(Y(zr))}Z`, body, { sw: 2.2 });
  for (const [za, zb] of [[zr, 32], [64, 90], [116, zg]]) {
    const ra = rr(za);
    const rb = rr(zb);
    s += path(`${M(cx - ra, Y(za))}L${N(cx - rb)} ${N(Y(zb))}A${N(rb)} ${N(rb / 2)} 0 0 0 ${N(cx + rb)} ${N(Y(zb))}L${N(cx + ra)} ${N(Y(za))}A${N(ra)} ${N(ra / 2)} 0 0 1 ${N(cx - ra)} ${N(Y(za))}Z`, band, { sw: 1.2 });
  }
  s += path(`${M(cx + 6, Y(zr) + R0 / 2 - 1)}L${N(cx + 4)} ${N(Y(zg) + R1 / 2)}L${N(X(zg, 1))} ${N(Y(zg))}L${N(X(zr, 1))} ${N(Y(zr))}A${R0} ${R0 / 2} 0 0 1 ${N(cx + 6)} ${N(Y(zr) + R0 / 2 - 1)}Z`, O, { ns: 1, op: 0.15 });
  s += line(`${M(cx - 13, Y(zr + 14))}L${N(cx - 9)} ${N(Y(zg - 8))}`, '#ffffff', 2.4, { op: 0.5 });
  // Door and windows.
  s += r ? path(`${M(cx - 5, Y(zr) + 9)}V${N(Y(zr) - 6)}Q${N(cx - 5)} ${N(Y(zr) - 12)} ${N(cx + 1)} ${N(Y(zr) - 12)}Q${N(cx + 7)} ${N(Y(zr) - 12)} ${N(cx + 7)} ${N(Y(zr) - 6)}V${N(Y(zr) + 9)}Z`, BLUE, { sw: 1.4 }) : rect(cx - 5, Y(zr) - 10, 12, 19, '#3b2c24', { sw: 1.3 }) + planksX(cx - 7, Y(zr) - 8, 16, 14);
  s += rect(cx - 2, Y(54) - 5, 6, 9, r ? GLASS : '#4a5050', { sw: 1.2, rx: 2 }) + rect(cx - 1, Y(100) - 5, 5, 8, r ? GLASS : '#4a5050', { sw: 1.2, rx: 2 });
  // Gallery, lantern, dome.
  const gR = R1 + 9;
  s += ell(cx, Y(zg), gR, gR / 2, r ? '#4a4f5c' : '#6a6656', { sw: 1.8 });
  const lz1 = zg + 24;
  if (r) s += circ(cx, Y(zg + 12), 26, '#fff4b8', { ns: 1, op: 0.35 });
  s += rect(cx - 10, Y(lz1), 20, 24, r ? LIT : '#3b4a4a', { sw: 1.8 }) + line(`${M(cx - 3, Y(lz1))}V${N(Y(zg))}M${N(cx + 4)} ${N(Y(lz1))}V${N(Y(zg))}`, r ? '#c99a2a' : '#2a3434', 1.2);
  if (!r) s += line(`${M(cx - 8, Y(lz1) + 6)}l6 5l-2 6M${N(cx + 6)} ${N(Y(lz1) + 4)}l-3 7`, '#9fb8b8', 1);
  s += path(`${M(cx - 13, Y(lz1))}Q${N(cx - 13)} ${N(Y(lz1 + 16))} ${N(cx)} ${N(Y(lz1 + 17))}Q${N(cx + 13)} ${N(Y(lz1 + 16))} ${N(cx + 13)} ${N(Y(lz1))}Z`, r ? RED : '#7f6a52', { sw: 2 }) + line(`${M(cx, Y(lz1 + 17))}V${N(Y(lz1 + 26))}`, O, 1.6) + circ(cx, Y(lz1 + 26), 2.2, r ? GOLD : '#8a8570', { sw: 1 });
  // Gallery railing (front half).
  const rail = `${M(cx - gR, Y(zg) - 7)}A${gR} ${gR / 2} 0 0 0 ${N(cx + gR)} ${N(Y(zg) - 7)}`;
  let rp2 = '';
  for (const t of [-0.92, -0.5, 0, 0.5, 0.92]) rp2 += `${M(cx + t * gR, Y(zg) + (gR / 2) * Math.sqrt(1 - t * t))}v-7`;
  s += line(rp2, O, 1.5) + line(rail, O, 3) + line(rail, r ? WHITE : '#9a958a', 1.3);
  if (r) {
    const lx = cx;
    const ly = Y(zg + 12);
    // The beam: short and soft by day (it stays over the pier), long and bright at dusk.
    const bl = NITE ? 140 : 62;
    const bw = NITE ? 22 : 12;
    s += path(`${M(lx - 8, ly - 3)}L${N(lx - bl)} ${N(ly - 13 - bw)}L${N(lx - bl)} ${N(ly - 13 + bw)}L${N(lx - 8)} ${N(ly + 3)}Z`, '#fff4b8', { ns: 1, op: NITE ? 0.5 : 0.32, cls: 'ls-beam', style: `transform-origin:${N(lx)}px ${N(ly)}px;transform-box:view-box` });
    s += flag(cx, Y(lz1 + 26) - 1, 14, RED, 1, true);
    // Lamp post and lifebuoy on the pier.
    const [px, py] = F.p(1.66, 2.85, 11);
    s += stick(`${M(px, py)}V${N(py - 24)}`, '#4a4f5c', 1.8, 1.8) + circ(px, py - 27, 7, '#ffe27a', { ns: 1, op: 0.4 }) + circ(px, py - 27, 3.2, '#fff4b8', { sw: 1.3 });
    const [bx, by] = F.p(1.72, 1.6, 11);
    s += circ(bx + 2, by - 7, 6, WHITE, { sw: 1.6 }) + circ(bx + 2, by - 7, 6, 'none', { stroke: '#ff7a2a', sw: 2.6, dash: '4.7 4.7' }) + circ(bx + 2, by - 7, 2.6, deck, { sw: 1.2 });
  } else {
    s += scaffold(F, 0.5, 0.95, 1.2, 1.3, 60, 30);
    s += tufts([[cx - 30, gy - 2], [cx + 30, gy + 2], [cx - 10, gy + 14]], OLIVE, 1.1) + tiltSign(...F.p(1.95, 1.2), 'PIER', 14);
  }
  return { s, bodyH: 176 };
}

/**
 * A landmark (3×3, fixed): tower (Water Tower), drivein (Drive-in), radio (Radio Mast),
 * fire (Fire Station), wheel (Fairground Wheel), light (Lighthouse Pier). Ruined (restored
 * false): olive-grey, boarded, scaffolding, weeds and a crooked sign; restored: bright and
 * proud. Optional o: town and color (the Water Tower paints the town's name big round its
 * tank on a band in the town colour, with a heart and a flag), zones (the restored wheel lights
 * that many gondolas, 0..8, default 8), night (lit windows; the Drive-in's projector beam; the
 * lighthouse's long beam, which by day stays short over the pier). Returns { svg, artH, bodyH, top }.
 */
export function landmarkArt(id, restored = false, o = {}) {
  const k = LM_H[id] ? id : 'tower';
  const F = frame(3, 3, LM_H[k]);
  const r = !!restored;
  const opt = o || {};
  const color = paint(opt.color || RED);
  LM_ZONES = Math.max(0, Math.min(8, Math.round(Number(opt.zones ?? 8) || 0)));
  const out = withNight(opt.night, () => {
    if (k === 'tower') return waterTower(F, r, opt.town, color);
    if (k === 'drivein') return driveIn(F, r);
    if (k === 'radio') return radioMast(F, r);
    if (k === 'fire') return fireStation(F, r);
    if (k === 'wheel') return wheelLm(F, r);
    return lighthouse(F, r);
  });
  return { svg: svgWrap(F.W, F.H, out.s, `ls-lm ls-${k} ${r ? 'ls-restored' : 'ls-ruined'}`), artH: F.H, bodyH: out.bodyH, top: topOf(`l:${k}:${r ? 1 : 0}`, F.H) };
}
/** Lit gondolas on the restored wheel (landmarkArt's zones option), for the length of one call. */
let LM_ZONES = 8;

/** Where each landmark's boss zombie stands (feet), in the landmark's viewBox (ruined art). */
export const BOSS_SPOT = (() => {
  const P = (id, u, v, z) => {
    const [x, y] = frame(3, 3, LM_H[id]).p(u, v, z);
    return { x: Math.round(x), y: Math.round(y) };
  };
  const tw = frame(3, 3, LM_H.tower).p(1.5, 1.5);
  const wh = frame(3, 3, LM_H.wheel).p(1.5, 1.5, 100);
  const lh = frame(3, 3, LM_H.light).p(0.95, 0.72);
  return {
    tower: { x: Math.round(tw[0]), y: Math.round(tw[1] - TANK.yt - 27) },
    drivein: P('drivein', 1.5, 0.46, 118),
    radio: P('radio', 0.95, 2.2, 30),
    fire: P('fire', 1.0, 1.55, 59),
    wheel: { x: Math.round(wh[0] - 0.447 * 64), y: Math.round(wh[1] - 1.118 * 64 - 2) },
    light: { x: Math.round(lh[0] + 9), y: Math.round(lh[1] - 128 + 10) },
  };
})();

/**
 * A boss's costume prop, drawn in the 40×56 viewBox of Thrill's walker zombie (zombieSvg
 * 'walker': feet at bottom centre, head centre (22, 14) r 11, facing right, front hand at
 * about (36, 32)). Overlay it on the zombie at the same size.
 */
export function bossProp(id) {
  let s = '';
  switch (id) {
    case 'tower':
      // The Plumber: a work cap and a plunger.
      s += path('M11.5 9.5Q11 1 22 1Q33 1 32.5 9.5Q22 7 11.5 9.5Z', '#4a6fa5', { sw: 1.6 }) + path('M30 8.5L39 8.8Q40.5 11 37.5 11.6L29.5 11Z', '#3a5a8a', { sw: 1.4 }) + path('M20 3.2q2 -1 2 1.5q0 1.6 -2 1.6q-2 0 -2 -1.6q0 -2.5 2 -1.5z', '#9fdcff', { sw: 0.8 });
      s += stick('M36 38L38.5 17', WOOD, 2, 1.6) + path('M32.5 18Q38.5 7 44.5 18Z', RED, { sw: 1.5 }) + rect(32, 17, 13, 2.4, '#b8302a', { sw: 1, rx: 1 });
      break;
    case 'drivein':
      // The Projectionist: 3D glasses and a film reel.
      s += rect(14, 9.5, 18.5, 7, WHITE, { sw: 1.3, rx: 1.5 }) + rect(15.5, 10.8, 6.5, 4.5, '#ff5a5a', { sw: 0.8, rx: 1 }) + rect(24.5, 10.8, 6.5, 4.5, '#4ab0ff', { sw: 0.8, rx: 1 }) + line('M14 12L11 13', O, 1.4);
      s += line('M31 37Q24 46 30 52Q36 55 40 50', O, 3.4) + line('M31 37Q24 46 30 52Q36 55 40 50', '#3a3640', 1.8, { dash: '1.6 1' });
      s += circ(37, 31, 8, '#5a5f6e', { sw: 1.6 }) + path(cpath([[37, 27.5, 1.8], [34, 33, 1.8], [40, 33, 1.8]]), '#2a2630', { ns: 1 }) + circ(37, 31, 1.4, STEEL, { sw: 0.8 });
      break;
    case 'radio':
      // The DJ: headphones and a record.
      s += line('M11 15Q10 0 22 0Q34 0 33 13', O, 4) + line('M11 15Q10 0 22 0Q34 0 33 13', '#3a3f52', 2);
      s += rect(7.5, 11, 6.5, 9, PURPLE, { sw: 1.4, rx: 2.5 }) + rect(30.5, 9.5, 5.5, 8, PURPLE, { sw: 1.4, rx: 2.5 });
      s += circ(37.5, 31, 8.5, '#2a2630', { sw: 1.5 }) + circ(37.5, 31, 5.5, 'none', { stroke: '#4a4650', sw: 0.8 }) + circ(37.5, 31, 2.8, RED, { sw: 0.8 }) + circ(37.5, 31, 0.8, '#ffffff', { ns: 1 });
      break;
    case 'fire':
      // The Fire Chief: helmet with a long back brim, and a hose.
      s += path('M10.5 10Q10.5 -1 22 -1Q33.5 -1 33.5 10Z', RED, { sw: 1.6 }) + path('M5 12.5Q7 9.5 12 10H34Q38 10 37 12.5Q36 14 33 13.5H11Q7 14.5 5 12.5Z', '#c8352c', { sw: 1.4 }) + path('M19 1.5H25V7.5L22 9.5L19 7.5Z', GOLD, { sw: 1.1 }) + line('M15 2Q16 -0.5 19 -0.5', '#ffffff', 1.2, { op: 0.7 });
      s += line('M33 34Q22 40 26 50Q30 56 20 56', O, 5) + line('M33 34Q22 40 26 50Q30 56 20 56', '#d9c48e', 3);
      s += path('M33 31.5L41 30L42 34L34 35.5Z', GOLD, { sw: 1.3 }) + path(cpath([[45, 30, 1.4], [47.5, 33, 1.1], [45.5, 35.5, 1]]), '#9fdcff', { sw: 0.7 });
      break;
    case 'wheel':
      // The Carny: a striped boater and a candy cane.
      s += rect(13.5, -1, 17, 8, RED, { sw: 1.5 }) + rect(13.5, 2, 17, 3, WHITE, { ns: 1 }) + path('M13.5 -1h17v8h-17z', 'none', { sw: 1.5 }) + ell(22, 7, 13.5, 2.8, '#f3d9a4', { sw: 1.4 });
      s += line('M37 32L39 55M37 32Q36 25 41 25Q45 25 44.5 29.5', O, 4) + line('M37 32L39 55M37 32Q36 25 41 25Q45 25 44.5 29.5', WHITE, 2.2) + line('M37.4 36l2 1.4M37.8 42l2 1.4M38.2 48l2 1.4M37.2 28.6l2.2 -1', RED, 1.4);
      break;
    case 'light':
      // Old Salt: a captain's cap and a pipe blowing bubbles.
      s += path('M11 7Q11 0 22 0Q34 0 34 6L33 9H12Z', WHITE, { sw: 1.5 }) + rect(12, 6, 21, 3.6, '#2a3a5a', { sw: 1.2 }) + path('M28 9L38 9.5Q39 12 36 12.4L28 11.5Z', '#1f2430', { sw: 1.2 }) + circ(22, 4, 1.6, GOLD, { sw: 0.7 });
      s += line('M25 20.5L31 22', O, 2.6) + path('M30.5 18H36V24Q36 26 33.2 26Q30.5 26 30.5 24Z', '#8a5a34', { sw: 1.3 }) + path(cpath([[34, 14, 1.8], [37, 10, 1.4], [35, 6.5, 1]]), '#e8f6ff', { sw: 0.8 });
      break;
    default:
      return '';
  }
  return `<g ${ROOT} class="ls-boss-prop">${mini(s)}</g>`;
}

// --- Fences ---------------------------------------------------------------------------------

/** A tiny deterministic hash → [0, 1). */
const hash01 = (n) => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

/**
 * A straight fence run along one side of the owned land. tier: planks | tin | brick | lights
 * (FENCE_TIERS). side: i0 | i1 | j0 | j1. len: tiles. The footprint is a strip one tile deep
 * INSIDE the land: i0/i1 → w 1 × h len, j0/j1 → w len × h 1. The fence stands on the strip's
 * outer edge: i0 its low-i edge (top-left on screen), i1 its high-i edge (bottom-right), j0
 * its low-j edge (top-right), j1 its high-j edge (bottom-left). About 24 px tall (brick pillars
 * a little more). Posts stand on both ends, so runs and short pieces butt together.
 * o: color (the town colour: tin sheets, flags), seed (varies the junk per piece), start (the
 * run's first tile along the whole edge) and edge (the edge's length): brick pillars stand on
 * every second tile of the edge and at its ends, so pieces of one edge keep one rhythm.
 */
export function fenceArt(tier = 'planks', side = 'j1', len = 1, o = {}) {
  const T = ['planks', 'tin', 'brick', 'lights'].includes(tier) ? tier : 'planks';
  const sd = ['i0', 'i1', 'j0', 'j1'].includes(side) ? side : 'j1';
  const n = Math.max(1, Math.min(40, Math.round(Number(len) || 1)));
  const opt = o || {};
  const alongV = sd[0] === 'i';
  const w = alongV ? 1 : n;
  const h = alongV ? n : 1;
  const H = (w + h) * 16 + 44;
  const F = frame(w, h, H);
  const color = paint(opt.color);
  const seed = opt.seed | 0;
  const start = Math.max(0, opt.start | 0);
  const edgeLen = Number.isFinite(opt.edge) ? opt.edge : start + n;
  const edge = sd === 'i0' || sd === 'j0' ? 0 : 1;
  // Run-local: t tiles from the left end (on screen); point on the ground.
  const at = (t) => (alongV ? [edge, n - t] : [t, edge]);
  const P = (t, z = 0) => F.p(...at(t), z);
  // Along-edge position of run point t (alongV runs are drawn from their high-j end).
  const along = (t) => start + (alongV ? n - t : t);
  const [ox, oy] = P(0);
  const wrap = (inner) => (alongV ? mat(1, -0.5, 0, 1, ox, oy, inner) : mat(1, 0.5, 0, 1, ox, oy, inner));
  const RL = n * 32;
  const dark = alongV; // u-constant runs face down-right: the darker side
  let s = '';
  let f = '';
  if (T === 'planks') {
    const cols = [WOOD, PLANK, WOOD_L, '#b07a46'];
    const d = {};
    for (let k = 0; k < n; k++) {
      const x = k * 32;
      for (let b = 0; b < 3; b++) {
        const r = hash01(seed * 31 + k * 7 + b + (edge ? 101 : 0) + (alongV ? 57 : 0));
        if (r < 0.08 && b === 1) continue;
        const y = -21 + b * 7;
        const tilt = (r - 0.5) * 5;
        const c = cols[Math.floor(r * 4) % 4];
        f += rect(x + 1, y, 31, 5, c, { sw: 1.1, tf: `rotate(${N(tilt)} ${N(x + 16)} ${N(y + 3)})` });
      }
      if (hash01(seed * 13 + k + 3) < 0.25) d.t = (d.t || '') + `M${x + 9} -19h12v9h-12z`;
    }
    if (d.t) f += path(d.t, STEEL, { sw: 1 });
    let posts = '';
    for (let k = 0; k <= n; k++) posts += `M${k * 32 - 2} -24h4v24h-4z`;
    f += path(posts, WOOD_D, { sw: 1.2 });
    s += wrap(f + (dark ? rect(-2, -24, RL + 4, 24, O, { ns: 1, op: 0.14 }) : ''));
    // Tyres leaning on it here and there.
    for (let k = 0; k < n; k++) if (hash01(seed * 17 + k * 5 + (alongV ? 9 : 0) + edge) < 0.3) s += tyres(...P(k + 0.5), 2, 6);
  } else if (T === 'tin') {
    const d = {};
    for (let k = 0; k < n; k++) {
      const c = [color, dk(color, 0.12), lt(color, 0.12)][Math.floor(hash01(seed * 7 + k * 3 + (alongV ? 5 : 0)) * 3)];
      d[c] = (d[c] || '') + `M${k * 32 + 0.5} -22h31v21h-31z`;
    }
    for (const c in d) f += path(d[c], c, { sw: 1.3 });
    f += vlines(RL, -1, 3.2, O, 0.26, -21.5);
    f += line(`M0 -18.5H${RL}M0 -4.5H${RL}`, '#ffffff', 1, { op: 0.35 });
    const rv = [];
    for (let x = 4; x < RL; x += 8) rv.push([x, -19.5, 0.8], [x, -3.5, 0.8]);
    f += path(cpath(rv), '#e8e4dc', { ns: 1 });
    let posts = '';
    for (let k = 0; k <= n; k++) posts += `M${N(k * 32 - 1.6)} -25h3.2v25h-3.2z`;
    f += path(posts, '#5a5f6e', { sw: 1.1 });
    s += wrap(f + (dark ? rect(-2, -25, RL + 4, 25, O, { ns: 1, op: 0.14 }) : ''));
  } else {
    // Brick: a low wall with an iron railing; pillars with lamps on every second tile of the
    // edge; 'lights' adds string lights and little flags between the pillars.
    f += rect(0, -10, RL, 10, BRICK, { sw: 1.3 }) + bricks(RL, 10, '#7a2e1e', 0.45).replace('<path', '<path transform="translate(0 -10)"');
    f += rect(-1, -12.5, RL + 2, 3, '#e6dcc6', { sw: 1.1 });
    let bars = '';
    for (let x = 4; x < RL; x += 4.5) bars += `M${N(x)} -12.5V-20`;
    f += line(bars, '#3a3f52', 1.1) + line(`M0 -20H${RL}`, '#3a3f52', 1.6);
    s += wrap(f + (dark ? rect(0, -20, RL, 20, O, { ns: 1, op: 0.14 }) : ''));
    const lit = T === 'lights';
    const pk = [];
    for (let k = 0; k <= n; k++) if (along(k) % 2 === 0 || along(k) === edgeLen || along(k) === 0) pk.push(k);
    const order = alongV ? pk.slice().reverse() : pk;
    const ph = 21;
    const tops = [];
    let wallL = '';
    let wallR = '';
    let caps = '';
    let lamps = '';
    let lines2 = '';
    for (const k of order) {
      const [u, v] = at(k);
      const a0 = u - 0.09;
      const a1 = u + 0.09;
      const b0 = v - 0.09;
      const b1 = v + 0.09;
      wallL += pd(F, [[a0, b1, 0], [a1, b1, 0], [a1, b1, ph], [a0, b1, ph]]);
      wallR += pd(F, [[a1, b1, 0], [a1, b0, 0], [a1, b0, ph], [a1, b1, ph]]);
      lines2 += `M${xy(F, a0, b1, 10)}L${xy(F, a1, b1, 10)}L${xy(F, a1, b0, 10)}`;
      caps += pd(F, [[a0 - 0.03, b0 - 0.03, ph + 3], [a1 + 0.03, b0 - 0.03, ph + 3], [a1 + 0.03, b1 + 0.03, ph + 3], [a1 + 0.03, b1 + 0.03, ph], [a0 - 0.03, b1 + 0.03, ph], [a0 - 0.03, b1 + 0.03, ph + 3]]);
      const [lx, ly] = F.p(u, v, ph + 3);
      tops.push([k, lx, ly]);
      lamps += `${M(lx - 2.6, ly - 1)}V${N(ly - 7)}H${N(lx + 2.6)}V${N(ly - 1)}Z${M(lx - 3.4, ly - 7)}L${N(lx)} ${N(ly - 10)}L${N(lx + 3.4)} ${N(ly - 7)}Z`;
    }
    // One path per part (pillars stand apart, so drawing them together keeps depth right).
    s += path(wallL, BRICK, { sw: 1.3 }) + path(wallR, dk(BRICK, 0.22), { sw: 1.3 }) + line(lines2, '#7a2e1e', 0.9) + path(caps, '#e6dcc6', { sw: 1.2 });
    if (lit || NITE) s += dots(tops.map(([, x, y]) => [x, y - 4.5]), '#ffe27a', 11, { op: 0.32 });
    s += path(lamps, lit || NITE ? '#fff4b8' : '#ffe9a8', { sw: 1.1 });
    if (lit && tops.length > 1) {
      tops.sort((a2, b2) => a2[0] - b2[0]);
      let sd2 = '';
      const pts = [];
      const tri = {};
      const cols = [color, YELLOW, WHITE, BLUE === color ? GREEN : BLUE];
      for (let k = 0; k + 1 < tops.length; k++) {
        const A = [tops[k][1], tops[k][2] - 4];
        const B = [tops[k + 1][1], tops[k + 1][2] - 4];
        const span = tops[k + 1][0] - tops[k][0];
        sd2 += sagD(A, B, 3 + span);
        pts.push(...sagPts(A, B, 3 + span, 2 * span, 0.15, 0.85));
        for (let q = 0; q < span * 2; q++) {
          const t = (q + 0.5) / (span * 2);
          const [px, py] = qpt(A, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + (3 + span) * 2], B, t);
          const c = cols[(k * 3 + q + seed) % cols.length];
          tri[c] = (tri[c] || '') + `${M(px - 2.6, py)}L${N(px + 2.6)} ${N(py)}L${N(px)} ${N(py + 5)}Z`;
        }
      }
      s += line(sd2, O, 1.1);
      for (const c in tri) s += path(tri[c], c, { sw: 0.9 });
      s += bulbs(pts, true, 1.4);
    }
  }
  return { svg: svgWrap(F.W, F.H, s, `ls-fence ls-${T} ls-${sd}`), artH: F.H, w, h, bodyH: 26 };
}

// --- Animation ------------------------------------------------------------------------------

/**
 * Keyframes for the animation hooks. Map objects are <img> data URLs, which page CSS cannot
 * reach: withAnimation(svg) puts this inside the SVG itself (it runs in an <img> too).
 */
export const ART_CSS =
  '@keyframes ls-spin{to{transform:rotate(360deg)}}@keyframes ls-blink{50%{opacity:.2}}@keyframes ls-pulse{50%{opacity:.08}}@keyframes ls-swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}@keyframes ls-sweep{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(16deg)}}' +
  '.ls-rim{animation:ls-spin 60s linear infinite}.ls-gondola{animation:ls-spin 60s linear infinite reverse}.ls-blink{animation:ls-blink 1.4s steps(1) infinite}.ls-beacon{animation:ls-pulse 1.1s ease-in-out infinite}.ls-swing{animation:ls-swing 2.6s ease-in-out infinite}.ls-ball{animation:ls-swing 3.2s ease-in-out infinite}.ls-beam{animation:ls-sweep 6s ease-in-out infinite}';

const KF = {
  spin: '@keyframes ls-spin{to{transform:rotate(360deg)}}',
  blink: '@keyframes ls-blink{50%{opacity:.2}}',
  pulse: '@keyframes ls-pulse{50%{opacity:.08}}',
  swing: '@keyframes ls-swing{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}',
  sweep: '@keyframes ls-sweep{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(16deg)}}',
};
const HOOKS = {
  'ls-rim': ['spin', 'animation:ls-spin 60s linear infinite'],
  'ls-gondola': ['spin', 'animation:ls-spin 60s linear infinite reverse'],
  'ls-blink': ['blink', 'animation:ls-blink 1.4s steps(1) infinite'],
  'ls-beacon': ['pulse', 'animation:ls-pulse 1.1s ease-in-out infinite'],
  'ls-swing': ['swing', 'animation:ls-swing 2.6s ease-in-out infinite'],
  'ls-ball': ['swing', 'animation:ls-swing 3.2s ease-in-out infinite'],
  'ls-beam': ['sweep', 'animation:ls-sweep 6s ease-in-out infinite'],
};

/**
 * The same SVG with just the keyframes its hooks use embedded (map objects are <img>s, out of
 * the page CSS's reach). Art without an animation hook comes back unchanged.
 */
export function withAnimation(svg) {
  const s = String(svg);
  const used = Object.keys(HOOKS).filter((k) => s.includes(`class="${k}"`));
  if (!used.length) return s;
  const kf = [...new Set(used.map((k) => HOOKS[k][0]))].map((k) => KF[k]).join('');
  const css = kf + used.map((k) => `.${k}{${HOOKS[k][1]}}`).join('');
  return s.replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
}

// --- Anchors and small extras ------------------------------------------------------------------

/**
 * Where things attach. Points named x/y are in the art's viewBox (the object's box, 1 unit =
 * 1 world px at zoom 1). [u, v] spots are tile-local offsets from the object's (i, j), just
 * outside the footprint, where a walker stands to use the thing.
 *   bigtop.roof: four roof-camper spots in a row on the shop roof (tent feet), back to front;
 *     the sign stands high enough behind them to stay readable
 *   bigtop.bus: [u, v] on the bus bay, INSIDE the footprint: draw the parked bus just above the
 *     station (z + 1 or 2); it covers neither the pumps nor the shop door
 *   bigtop.door: the shop door (on the shop's right side; coins fly into it)
 *   crate.drop: where the Supply Crate sits on the pad (its bottom centre)
 *   <id>.spot, home.<tier>.spot (= homeArt().door): where a walker stands. Every spot has
 *     u + v >= w + h - 0.35, so the engine's walker depth ((fi + fj)·10 + 5) puts the figure in
 *     front of the object ((i + w + j + h)·10). A spot nearer a front wall would draw behind it.
 */
export const ANCHORS = (() => {
  const G = frame(3, 3, BH.bigtop);
  const D = frame(2, 2, BH.crate);
  const xyOf = ([x, y]) => ({ x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });
  return {
    bigtop: { roof: GS.campU.map((u) => xyOf(G.p(u, GS.campV, GS.zH))), bus: [2.7, 2.4], door: xyOf(G.p(GS.u1, GS.v1 - 10 / 32, 20)), spot: [3.65, 2.0] },
    crate: { drop: xyOf(D.p(1, 1, 5)), spot: [1.3, 2.36] },
    vault: { spot: [1.0, 2.66] },
    striker: { spot: [1.2, 2.46] },
    gallery: { spot: [1.0, 2.66] },
    tent: { spot: [1.5, 2.16] },
    garage: { spot: [1.05, 2.61] },
    home: Object.fromEntries(Object.entries(HOME_DOOR).map(([k, v]) => [k, { spot: v.slice() }])),
  };
})();

/**
 * A little pup tent for a roof camper (a billboard: viewBox 0 0 28 20, feet at the bottom
 * centre). color = the camper's class colour. Place its bottom centre on ANCHORS.bigtop.roof.
 */
export function campTentArt(color = RED) {
  const c = paint(color);
  const s = path('M2 18L14 3L26 18Z', c, { sw: 1.6 }) + path('M14 3L26 18H20L14 7Z', dk(c, 0.18), { ns: 1 }) + path('M10 18L14 9L18 18Z', '#3b2c24', { sw: 1.1 }) + path('M2 18L14 3L26 18Z', 'none', { sw: 1.6 }) + line('M14 3V0.5', WOOD_D, 1.4) + line('M1 18.5H27', O, 1.4);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20" overflow="visible" class="ls-camp"><g ${ROOT}>${mini(s)}</g></svg>`, w: 28, h: 20 };
}
