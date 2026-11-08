// Last Stop decorations: the 20 set pieces (Cozy, Garden, Party, Lookout), the 8 keepsakes,
// the souvenir plinth, the Founders' Statue and the set badges. Pure functions that return
// SVG strings: no DOM, no image files, safe to import in node tests.
//
// Look: Thrill Hill's toy box in 2:1 isometric (same rules as town-art.js). Thick warm
// outlines (#2a1b12), flat fills with one shade and one highlight. Lit from the top-left:
// LEFT faces (facing down-left) carry the base colour, RIGHT faces are darker, tops lightest.
// Each set shares a material so it reads as a family:
//   Cozy     warm wood + a red-and-cream plaid blanket somewhere on every piece
//   Garden   terracotta pots and boxes + leafy greens
//   Party    pink and candy stripes (lemon, mint, white)
//   Lookout  blue-painted steel + white, with a blue star pennant
// Keepsakes are a notch fancier: richer materials, gold trim and a small gold name plate.
//
// Iso box convention (isoview.js): an object on an n × n footprint is drawn in a box n·64
// wide whose BOTTOM edge is the footprint's bottom corner; artH is the box height. In the
// viewBox 0 0 W artH the footprint diamond sits at the bottom: top (32n, artH − 32n), right
// (64n, artH − 16n), bottom (32n, artH), left (0, artH − 16n). Tile-local (u along i, v along
// j, z up in px) → viewBox: x = 32n + (u − v)·32, y = artH − 32n + (u + v)·16 − z.
//
// API (every result also carries bodyH, the main body's height above the footprint, for
// the hit hexagon):
//   decorArt(kind, { night, anim })          → { svg, artH, bodyH, size, spot, door, glow, front? }
//   keepsakeArt(kind, { name, night, anim }) → the same; name ("SAL") is engraved on the gold plate
//   plinthArt(innerSvg, { count })           → { svg, artH, bodyH, size: 2, spot, door, glow: [] }
//                                              a souvenirSvg(id) on a plinth; count: the Skull
//                                              count baked into the scoreboard's blank panel
//   statueArt(founders)                      → { svg, artH, bodyH, size: 2, spot, door, glow: [] }
//                                              founders: up to 3 people (figureSvg in gold)
//   setBadgeSvg(set)                         → '<svg class="ico set-badge" viewBox="0 0 24 24">…'
//   withAnimation(svg), DECOR_CSS            → the .dc-* keyframes (see below)
//   ANCHORS                                  → { <kind>: { spot: [u, v], act, seat?: [u, v, z], front? } }
//                                              (town-art's ANCHORS shape; kinds also 'souvenir', 'statue')
// Options: night (lit windows and portholes, lanterns, the brighter searchlight beam, glowing
// bulbs, the glowing hot tub and greenhouse; class ls-night);
// anim (default true: the .dc-* keyframes are embedded, so the art animates as an <img>).
// size: the square footprint (1 or 2, as config).
//
// Walker spots. door: [u, v], tile-local to the footprint's (i, j): where a walker stands to
// use the piece, always just outside the footprint and with u + v >= 2·size − 0.35, so the
// engine's walker depth ((fi + fj)·10 + 5) draws the figure in front of the object
// ((i + j + 2·size)·10), as town-art's ANCHORS do. spot: { u, v, z, act, over? }: where the
// walker's feet go while using it, lifted z px. Without over, spot = door. With over: true the
// feet are ON the piece (bench, hammock, hot tub, trampoline, stage, windmill green, lookout
// deck, rocker, carousel, slide mat): walk to door, hop to (u, v), and give the walker
// z = the object's z-index + 1 (IsoView.walker(..., { z })). front (hammock, hot tub, lookout):
// { svg, artH, size, z: 2 } is a partial redraw of the parts in front of that walker (the
// sling's lip, the tub's rim and water, the deck rails): upsert it as a second object on the
// same footprint with z: 2 so the figure sits IN the piece. act: sit, warm, nap, soak, climb,
// tend, admire, pose, bounce, perform, dance, putt, salute, watch, look, slide, play, cook, ride.
// glow: evening lamp glows, [{ u, v, z, r, color }] in the same tile-local terms (r in px).
// Every svg has xmlns, stays inside its own viewBox (so it can be an <img> data URL: the root
// clips there; animations included) and is under 10 KB, except the founders' statue (three
// figureSvg in gold, about 26 KB). decorArt/keepsakeArt results are cached per kind and
// options; each call returns a fresh copy.
//
// Animation hooks (classes; pivots inline): .dc-fire (flames flicker about the base),
// .dc-spark (embers rise), .dc-steam / .dc-smoke (puffs rise and fade), .dc-sails (windmill
// sails turn, fill-box centre), .dc-disco (mirror-ball facets shimmer), .dc-flag (flag waves
// about the pole), .dc-beam (searchlight sweeps), .dc-bulb (bulbs twinkle). DECOR_CSS holds the
// keyframes; withAnimation(svg) embeds the ones an svg uses (decorArt/keepsakeArt do it unless
// anim: false). All are transform or opacity only. Root classes: ls-dec ls-set-<set> [ls-rare |
// ls-signature], ls-keepsake [ls-legend], ls-plinth, ls-statue, plus ls-night. No ids are used.

import { DECOR, KEEPSAKES, SETS } from './config.js';
import { setGlyph } from './town-icons.js';
import { figureSvg } from './portrait.js';

// --- Palette ---------------------------------------------------------------------------------

const O = '#2a1b12';
const WHITE = '#fffaf0';
const CREAM = '#f6ead2';
const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const BARK = '#a8703f';
const PLAID = '#d9473f';
const PLAID_L = '#f6e2c0';
const MUSTARD = '#f5b82e';
const RED = '#e8483f';
const ORANGE = '#ff9a3c';
const LEMON = '#ffe066';
const LEAF = '#4cbf56';
const LEAF_D = '#2f9a45';
const LEAF_L = '#8fe070';
const TERRA = '#d9774a';
const TERRA_L = '#f0a070';
const SOIL = '#7a4a2a';
const SOIL_L = '#946039';
const PINK = '#ff7ab8';
const PINK_L = '#ffc2df';
const PINK_D = '#e0559a';
const MINT = '#7be0c3';
const LILAC = '#c9a0ff';
const BLUE = '#3d8bf0';
const BLUE_D = '#2357a6';
const BLUE_L = '#8cc0ff';
const SKY = '#bfe6ff';
const STEEL = '#a9b0ba';
const STEEL_D = '#7a828c';
const STEEL_L = '#d5dae0';
const GOLD = '#ffc23a';
const GOLD_D = '#e0960f';
const GOLD_DD = '#b8730c';
const GOLD_L = '#ffe58a';
const SHINE = '#fff6c8';
const STONE = '#d9d3c5';
const STONE_L = '#ece7dc';
const RUBBER = '#3d3540';
const ZSKIN = '#9fd46a';
const ZSHADE = '#6fa646';
const LIT = '#fff2a8';
const GLASS = '#9fd8ff';
const CONFETTI = [PINK, LEMON, MINT, BLUE, LILAC, ORANGE];

// --- Tiny helpers ----------------------------------------------------------------------------

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
/** Stroke widths: two decimals (no 3.4000000000000004). */
const W2 = (n) => Math.round(n * 100) / 100;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Night art (lit windows, lanterns, the long beam): set for the length of one call. */
let NITE = false;

// Elements inherit stroke #2a1b12, width 2, round joins and caps from the root group.
function at(o) {
  if (!o) return '';
  let s = '';
  if (o.ns) s += ' stroke="none"';
  else {
    if (o.stroke) s += ` stroke="${o.stroke}"`;
    if (o.sw != null) s += ` stroke-width="${W2(o.sw)}"`;
  }
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  if (o.style) s += ` style="${o.style}"`;
  return s;
}
const path = (d, fill, o) => `<path d="${d}" fill="${fill}"${at(o)}/>`;
const circ = (x, y, r, fill, o) => `<circle cx="${N(x)}" cy="${N(y)}" r="${N(r)}" fill="${fill}"${at(o)}/>`;
const ell = (x, y, rx, ry, fill, o) => `<ellipse cx="${N(x)}" cy="${N(y)}" rx="${N(rx)}" ry="${N(ry)}" fill="${fill}"${at(o)}/>`;
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${N(x)}" y="${N(y)}" width="${N(w)}" height="${N(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${at(o)}/>`;
const line = (d, color, w, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${W2(w)}"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}/>`;
const g = (inner, o) => `<g${at(o)}>${inner}</g>`;
/** An outlined stroke: a fat dark line under a coloured one. */
const stick = (d, color, w, ow = 2.2) => line(d, O, w + ow) + line(d, color, w);
const M = (x, y) => `M${N(x)} ${N(y)}`;
const L = (x, y) => `L${N(x)} ${N(y)}`;
const Q = (cx, cy, x, y) => `Q${N(cx)} ${N(cy)} ${N(x)} ${N(y)}`;
/** Path through screen points. */
const poly = (pts, close = true) => pts.map((q, i) => (i ? 'L' : 'M') + `${N(q[0])} ${N(q[1])}`).join('') + (close ? 'Z' : '');
/** Many circles as one path (one element). */
const cpath = (list) => list.map(([x, y, r]) => `M${N(x - r)} ${N(y)}a${N(r)} ${N(r)} 0 1 0 ${N(2 * r)} 0a${N(r)} ${N(r)} 0 1 0 ${N(-2 * r)} 0`).join('');
/** A pivot for CSS animations on a group (transform-box: view-box). */
const pivot = (x, y) => `transform-origin:${N(x)}px ${N(y)}px;transform-box:view-box`;

/** Union of circles with one merged outline, a shade rim to the lower right and a highlight. */
function blob(list, fill, o = {}) {
  const sw = o.sw ?? 2;
  let s = path(cpath(list.map(([x, y, r]) => [x, y, r + sw / 2])), O, { ns: 1 });
  s += path(cpath(list), o.shade || dk(fill, 0.18), { ns: 1 });
  s += path(cpath(list.map(([x, y, r]) => [x - r * 0.14, y - r * 0.16, r * 0.84])), fill, { ns: 1 });
  if (o.hi !== false) s += path(cpath(list.filter((_, i) => i % 2 === 0).map(([x, y, r]) => [x - r * 0.38, y - r * 0.4, r * 0.26])), o.hi || lt(fill, 0.45), { ns: 1, op: 0.8 });
  return s;
}

function star(cx, cy, r, fill, o = {}) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += (i ? 'L' : 'M') + N(cx + Math.cos(a) * rr) + ' ' + N(cy + Math.sin(a) * rr);
  }
  return path(d + 'Z', fill, { sw: o.sw ?? 1.4, ...o });
}
function sparkle(cx, cy, r, fill = SHINE) {
  const k = r * 0.2;
  return path(`${M(cx, cy - r)}${Q(cx + k, cy - k, cx + r, cy)}${Q(cx + k, cy + k, cx, cy + r)}${Q(cx - k, cy + k, cx - r, cy)}${Q(cx - k, cy - k, cx, cy - r)}Z`, fill, { sw: 1.1 });
}
/** A bulb: lemon by day; at night it glows (a soft halo). */
const bulb = (x, y, r = 1.8, col = '#fff4b8', k = 0) => (NITE ? circ(x, y, r * 2.4, '#ffe27a', { ns: 1, op: 0.45 }) : '') + circ(x, y, r, NITE ? col : '#ffe9a0', { sw: 1, cls: 'dc-bulb', style: k % 2 ? 'animation-delay:-.8s' : undefined });
/** A soft night halo (only drawn at night). */
const halo = (x, y, r, col = '#ffe27a', op = 0.35) => (NITE ? circ(x, y, r, col, { ns: 1, op }) : '');
/** A soft ground shadow ellipse. */
const shadowE = (x, y, rx, ry) => ell(x, y, rx, ry, O, { ns: 1, op: 0.15 });

/** A red-and-cream plaid on a local w × h patch (no outline). */
function plaid(w, h, base = PLAID, stripe = PLAID_L) {
  const xs = [w * 0.28, w * 0.7];
  const ys = [h * 0.3, h * 0.72];
  return rect(0, 0, w, h, base, { ns: 1 }) + line(xs.map((x) => `M${N(x)} 0V${N(h)}`).join(''), stripe, Math.max(1.4, w * 0.12), { op: 0.85 }) + line(ys.map((y) => `M0 ${N(y)}H${N(w)}`).join(''), stripe, Math.max(1.2, h * 0.1), { op: 0.6 }) + line(xs.map((x) => `M${N(x)} 0V${N(h)}`).join('') + ys.map((y) => `M0 ${N(y)}H${N(w)}`).join(''), dk(base, 0.35), 0.6, { op: 0.6 });
}

/** The keepsake owner's name for the plate (set for the length of one keepsakeArt call). */
let PLATE_NAME = '';

/**
 * A small gold name plate (local coords, top-left x, y): two screws, and the owner's name
 * engraved (PLATE_NAME, system-ui 900, squeezed to fit) or blank engraving lines.
 */
function plate(x, y, w = 16, h = 6) {
  let s = rect(x, y, w, h, GOLD, { sw: 1.2, rx: 1.4 }) + line(`M${N(x + 1.6)} ${N(y + 1)}H${N(x + w - 1.6)}`, '#fff3b0', 0.8, { op: 0.9 });
  const t = PLATE_NAME;
  if (t) {
    const room = w - 4.4;
    const fs = Math.min(h * 0.86, room / (t.length * 0.64));
    const est = t.length * 0.64 * fs;
    const tl = est > room ? ` textLength="${N(room)}" lengthAdjust="spacingAndGlyphs"` : '';
    s += `<text x="${N(x + w / 2)}" y="${W2(y + h / 2 + fs * 0.36)}" font-size="${W2(fs)}" font-family="system-ui,sans-serif" font-weight="900" text-anchor="middle" fill="#5a3a08" stroke="none"${tl}>${esc(t)}</text>`;
  } else s += line(`M${N(x + 3.6)} ${N(y + h * 0.5)}H${N(x + w - 3.6)}M${N(x + 4.6)} ${N(y + h * 0.78)}H${N(x + w - 6)}`, GOLD_DD, 0.7);
  if (w >= 12) s += circ(x + 1.6, y + h / 2, 0.6, GOLD_DD, { ns: 1 }) + circ(x + w - 1.6, y + h / 2, 0.6, GOLD_DD, { ns: 1 });
  return s;
}

// --- Iso frame -------------------------------------------------------------------------------

/** An n × n footprint in a box of height H: p(u, v, z) → viewBox point. */
function frame(n, H) {
  const W = n * 64;
  const oy = H - n * 32;
  return { n, W, H, p: (u, v, z = 0) => [n * 32 + (u - v) * 32, oy + (u + v) * 16 - z] };
}
const xy = (F, u, v, z = 0) => {
  const [x, y] = F.p(u, v, z);
  return `${N(x)} ${N(y)}`;
};
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
/** Draw on a plane z = const: local x along +u, y along +v (32 = one tile). */
function onT(F, u, v, z, inner) {
  const [x, y] = F.p(u, v, z);
  return mat(1, 0.5, -1, 0.5, x, y, inner);
}
/** A ground circle of radius r tiles is an ellipse rx × ry on screen. */
const RX = 45.25;
const RY = 22.63;

/**
 * A box on (u0, v0)–(u1, v1), from z0 up ht. c = the left face's colour; the right face
 * gets c under a shade, the top a lighter tint. Details: o.lf on the left face (origin its
 * top-left corner, x along +u), o.rf on the right face (origin its top-left corner, x toward
 * the right corner), o.tf on the top (origin the back corner).
 */
function box(F, u0, v0, u1, v1, z0, ht, c, o = {}) {
  const z1 = z0 + ht;
  const isw = o.isw ?? 1.2;
  let s = face(F, [[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], c, { sw: isw });
  if (o.lf) s += onL(F, u0, v1, z1, o.lf);
  const R = [[u1, v1, z0], [u1, v0, z0], [u1, v0, z1], [u1, v1, z1]];
  s += face(F, R, o.r || c, { sw: isw });
  if (o.rf) s += onR(F, u1, v1, z1, o.rf);
  if (!o.r) s += face(F, R, O, { ns: 1, op: o.rs ?? 0.2 });
  if (o.top !== 'none') {
    s += face(F, [[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], o.top || lt(c, 0.3), { sw: isw });
    if (o.tf) s += onT(F, u0, v0, z1, o.tf);
  }
  if (o.sw !== 0) s += path(pd(F, [[u0, v0, z1], [u1, v0, z1], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0], [u0, v1, z1]]), 'none', o.sw ? { sw: o.sw } : undefined);
  return s;
}

/** A vertical cylinder at (u, v), radius r tiles, from z0 up ht. o.top: top colour or 'none'. */
function cyl(F, u, v, r, z0, ht, c, o = {}) {
  const [cx, yb] = F.p(u, v, z0);
  const yt = yb - ht;
  const rx = r * RX;
  const ry = r * RY;
  let s = path(`${M(cx - rx, yt)}V${N(yb)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(yb)}V${N(yt)}Z`, c, { sw: o.sw ?? 1.8 });
  s += path(`${M(cx, yt + ry)}V${N(yb + ry)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(yb)}V${N(yt)}A${N(rx)} ${N(ry)} 0 0 1 ${N(cx)} ${N(yt + ry)}Z`, O, { ns: 1, op: o.rs ?? 0.2 });
  if (o.top !== 'none') s += ell(cx, yt, rx, ry, o.top || lt(c, 0.3), { sw: o.sw ?? 1.8 });
  return s;
}

/** Points round a rounded rectangle in (u, v). */
function rrPts(u0, v0, u1, v1, r, seg = 4) {
  const out = [];
  const cs = [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]];
  for (const [cu, cv, a0] of cs)
    for (let k = 0; k <= seg; k++) {
      const a = ((a0 + (90 * k) / seg) * Math.PI) / 180;
      out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]);
    }
  return out;
}

/**
 * A convex (u, v) outline extruded straight up from z0 by ht: the side in c, its right-facing
 * part shaded, the top in o.top. Returns the svg.
 */
function ext(F, pts, z0, ht, c, o = {}) {
  const n = pts.length;
  const B = pts.map(([u, v]) => F.p(u, v, z0));
  const T = pts.map(([u, v]) => F.p(u, v, z0 + ht));
  let iL = 0;
  let iR = 0;
  let iF = 0;
  B.forEach((q, i) => {
    if (q[0] < B[iL][0]) iL = i;
    if (q[0] > B[iR][0]) iR = i;
    if (q[1] > B[iF][1]) iF = i;
  });
  const walk = (a, b, d) => {
    const out = [a];
    for (let i = a; i !== b; ) {
      i = (i + d + n) % n;
      out.push(i);
    }
    return out;
  };
  let ch = walk(iL, iR, 1);
  if (!ch.includes(iF)) ch = walk(iL, iR, -1);
  const sw = o.sw ?? 1.8;
  let s = path(poly(ch.map((i) => B[i]).concat(ch.slice().reverse().map((i) => T[i]))), c, { sw });
  const rc = ch.slice(ch.indexOf(iF));
  s += path(poly(rc.map((i) => B[i]).concat(rc.slice().reverse().map((i) => T[i]))), O, { ns: 1, op: o.rs ?? 0.2 });
  if (o.top !== 'none') s += path(poly(T), o.top || lt(c, 0.3), { sw });
  return s;
}

/** Convex hull of screen points (monotone chain). */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (const q of p.slice().reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/**
 * A prism: a profile extruded along one axis.
 *   axis 'v': prof = [[u, z], …] on the front plane v = b (the left face, colour c), swept back to v = a.
 *   axis 'u': prof = [[v, z], …] on the right plane u = b (shaded c), swept back to u = a.
 * Visible swept faces get the top tint (facing up) or the side colour. o.facets outlines every
 * face (for profiles with a dent); otherwise one outline goes round the convex silhouette.
 */
function prism(F, axis, prof, a, b, c, o = {}) {
  const P3 = axis === 'v' ? (q, w) => F.p(q[0], w, q[1]) : (q, w) => F.p(w, q[0], q[1]);
  const n = prof.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = prof[i];
    const r = prof[(i + 1) % n];
    area += p[0] * 32 * r[1] - r[0] * 32 * p[1];
  }
  const sg = area > 0 ? 1 : -1;
  const top = o.top || lt(c, 0.3);
  const shade = o.shade || dk(c, 0.2);
  const faces = [];
  for (let i = 0; i < n; i++) {
    const p = prof[i];
    const r = prof[(i + 1) % n];
    const ds = (r[0] - p[0]) * 32;
    const dz = r[1] - p[1];
    const ns = dz * sg;
    const nz = -ds * sg;
    if (ns + nz <= 0.01) continue;
    const col = nz >= ns ? top : axis === 'v' ? shade : c;
    const depth = ((p[0] + r[0]) / 2) * 32 + (p[1] + r[1]) / 2;
    faces.push({ d: poly([P3(p, b), P3(r, b), P3(r, a), P3(p, a)]), col, depth });
  }
  faces.sort((x, y) => x.depth - y.depth);
  let s = faces.map((f) => path(f.d, f.col, o.facets ? { sw: o.isw ?? 1.2 } : { stroke: f.col, sw: 0.6 })).join('');
  if (!o.facets) s += path(poly(hull(prof.map((q) => P3(q, a)).concat(prof.map((q) => P3(q, b))))), 'none', { sw: o.sw ?? 2 });
  s += path(poly(prof.map((q) => P3(q, b))), axis === 'v' ? c : o.cap || shade, { sw: o.isw ?? 1.4 });
  return s;
}

/** Point at (s, t) ∈ [0, 1]² on a screen quad [p00, p10, p11, p01]. */
function qpt(q, s, t) {
  const a = [q[0][0] + (q[1][0] - q[0][0]) * s, q[0][1] + (q[1][1] - q[0][1]) * s];
  const b = [q[3][0] + (q[2][0] - q[3][0]) * s, q[3][1] + (q[2][1] - q[3][1]) * s];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/** A sub-quad (s0..s1 × t0..t1) of a screen quad, as path data. */
const subq = (q, s0, t0, s1, t1) => poly([qpt(q, s0, t0), qpt(q, s1, t0), qpt(q, s1, t1), qpt(q, s0, t1)]);

/** A flame (outer orange, inner lemon) standing on (x, y), height ≈ 24·k. */
function flame(x, y, k = 1, cls = 'dc-fire') {
  const P = (pts) => pts.map((t) => (typeof t === 'string' ? t : `${N(x + t[0] * k)} ${N(y + t[1] * k)}`)).join(' ');
  const outer = `M${P([[-8, -1]])}Q${P([[-10, -12], [-3, -17]])}Q${P([[-2, -11], [0, -10]])}Q${P([[0, -21], [6, -25]])}Q${P([[4, -14], [9, -9]])}Q${P([[11, -3], [7, -1]])}Z`;
  const mid = `M${P([[-5, -1]])}Q${P([[-6, -9], [-1, -12]])}Q${P([[0, -8], [2, -8]])}Q${P([[3, -14], [5, -16]])}Q${P([[4, -8], [6, -5]])}Q${P([[7, -1], [4, -1]])}Z`;
  const inner = `M${P([[-2.5, -1]])}Q${P([[-3, -6], [0, -8]])}Q${P([[1, -5], [3, -4]])}Q${P([[4, -1], [2, -1]])}Z`;
  return g(path(outer, ORANGE, { sw: 1.8 }) + path(mid, '#ffb53a', { ns: 1 }) + path(inner, LEMON, { ns: 1 }), { cls, style: pivot(x, y) });
}

/** A puff of steam / smoke: outlined soft circles. delay: its animation's offset (s). */
function puff(x, y, k = 1, fill = WHITE, cls = 'dc-steam', op = 0.92, delay = 0) {
  return g(blob([[x, y, 3.8 * k], [x + 4.4 * k, y - 1.6 * k, 3.4 * k], [x + 1.6 * k, y - 4.6 * k, 3 * k], [x - 3.4 * k, y - 2 * k, 2.8 * k]], fill, { sw: 1.4, shade: '#dfe5ec', hi: false }), { cls, op, style: delay ? `animation-delay:${delay}s` : undefined });
}

/** Path data for a leaf (a lens) from its base (x, y), length l, angle a (deg). */
function leafD(x, y, l, a) {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const sn = Math.sin(r);
  const m = [x + c * l * 0.5, y + sn * l * 0.5];
  const px = -sn * l * 0.32;
  const py = c * l * 0.32;
  return `${M(x, y)}${Q(m[0] + px, m[1] + py, x + c * l, y + sn * l)}${Q(m[0] - px, m[1] - py, x, y)}Z`;
}
/** Several leaves [[x, y, l, a], …] as one path, with their veins as another. */
function leaves(list, fill = LEAF) {
  const vein = list.map(([x, y, l, a]) => {
    const r = (a * Math.PI) / 180;
    return `${M(x + Math.cos(r) * l * 0.15, y + Math.sin(r) * l * 0.15)}L${N(x + Math.cos(r) * l * 0.8)} ${N(y + Math.sin(r) * l * 0.8)}`;
  });
  return path(list.map((q) => leafD(...q)).join(''), fill, { sw: 1.3 }) + line(vein.join(''), dk(fill, 0.3), 0.8, { op: 0.7 });
}
const leaf = (x, y, l, a, fill = LEAF) => leaves([[x, y, l, a]], fill);

/** A triangular pennant on a short pole, base at (x, y). */
function pennant(x, y, h, col, dir = 1, starCol = WHITE) {
  const t = y - h;
  const fw = 14 * dir;
  return stick(`${M(x, y)}V${N(t - 1)}`, STEEL_L, 1.6, 2) + path(`${M(x, t)}L${N(x + fw)} ${N(t + 4.5)}L${N(x)} ${N(t + 9)}Z`, col, { sw: 1.5 }) + star(x + fw * 0.36, t + 4.5, 2.2, starCol, { sw: 0.8 }) + circ(x, t - 1.6, 1.8, GOLD, { sw: 1.1 });
}

/** The root svg: stroke defaults on one group; `extra` goes after it (outside the defaults). */
function wrap(F, inner, cls, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F.W} ${F.H}" overflow="visible" class="ls-dec ${cls}${NITE ? ' ls-night' : ''}"><g stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${inner}</g>${extra}</svg>`;
}

// --- Walker spots ------------------------------------------------------------------------------
// door: where a walker stands (outside, u + v >= 2·size − 0.35, so it sorts in front). Pieces
// used from ON them (over) also give the spot their feet go to, and the lift z.
const D1 = [0.5, 1.3]; // just in front of a 1×1's front-left side
const D2 = [1.0, 2.7]; // just in front of a 2×2's front-left side
const at1 = (act, door = D1) => ({ u: door[0], v: door[1], z: 0, act });
const SPOTS = {
  bench: { u: 0.5, v: 0.55, z: 15, act: 'sit', over: true, door: D1 },
  campfire: at1('warm'),
  hammock: { u: 0.5, v: 0.5, z: 14, act: 'nap', over: true, door: D1 },
  hottub: { u: 1.0, v: 1.0, z: 24, act: 'soak', over: true, door: [1.65, 2.1] },
  treehouse: at1('climb', [1.3, 2.4]),
  planter: at1('tend'),
  sunflowers: at1('tend'),
  veggie: at1('tend', D2),
  gnome: at1('admire'),
  pumpkins: at1('admire', D2),
  flamingo: at1('pose'),
  trampoline: { u: 0.5, v: 0.5, z: 12, act: 'bounce', over: true, door: D1 },
  stage: { u: 1.0, v: 0.85, z: 14, act: 'perform', over: true, door: D2 },
  disco: at1('dance'),
  windmill: { u: 1.2, v: 1.72, z: 6, act: 'putt', over: true, door: [0.95, 2.75] },
  flagpole: at1('salute'),
  searchlight: at1('watch'),
  ladder: { u: 0.5, v: 0.5, z: 83, act: 'climb', over: true, door: D1 },
  scarecrow: at1('look'),
  rocketslide: { u: 0.45, v: 1.8, z: 3, act: 'slide', over: true, door: [0.95, 2.75] },
  jukebox: at1('dance', [0.5, 1.25]),
  arcade: at1('play', [0.5, 1.25]),
  grill: at1('cook', [0.5, 1.25]),
  rocker: { u: 0.5, v: 0.6, z: 17, act: 'sit', over: true, door: D1 },
  telescope: at1('look', [0.3, 1.4]),
  gnomes: at1('admire', [0.5, 1.25]),
  carousel: { u: 1.5, v: 1.5, z: 10, act: 'ride', over: true, door: [1.2, 2.5] },
  greenhouse: at1('tend', [2.25, 1.45]),
  souvenir: at1('admire', D2),
  statue: at1('admire', D2),
};
/** Pieces with a front overlay (the walker sits IN them). */
const FRONTS = ['hammock', 'hottub', 'ladder'];

/**
 * A result. spot: a SPOTS entry (or kind name); o.front: the inner svg of the front overlay;
 * o.extra: markup after the stroke-default group.
 */
function out(F, s, cls, bodyH, spot, glow = [], o = {}) {
  const sp = typeof spot === 'string' ? SPOTS[spot] : spot;
  const { door, ...use } = sp;
  const r = { svg: wrap(F, s, cls, o.extra || ''), artH: F.H, bodyH, size: F.n, spot: use, door: (door || [use.u, use.v]).slice(), glow };
  if (o.front) r.front = { svg: wrap(F, o.front, `${cls} ls-front`), artH: F.H, size: F.n, z: 2 };
  return r;
}

// =============================================================================================
// COZY: warm wood and a plaid blanket.
// =============================================================================================

function bench() {
  const F = frame(1, 62);
  let s = face(F, [[0.1, 0.3], [0.92, 0.3], [0.92, 0.8], [0.1, 0.8]], O, { ns: 1, op: 0.13 });
  const post = (u) => box(F, u, 0.32, u + 0.08, 0.39, 0, 34, WOOD_D, { top: WOOD, sw: 1.4 });
  s += post(0.12) + post(0.8);
  const slat = (z) => box(F, 0.05, 0.33, 0.95, 0.38, z, 6, WOOD, { top: WOOD_L, sw: 1.6 });
  s += slat(19) + slat(28);
  const leg = (u, v) => box(F, u, v, u + 0.07, v + 0.07, 0, 11, WOOD_D, { top: 'none', sw: 1.3 });
  s += leg(0.12, 0.44) + leg(0.81, 0.44) + leg(0.12, 0.63) + leg(0.81, 0.63);
  const tw = 0.9 * 32;
  const th = 0.3 * 32;
  s += box(F, 0.05, 0.41, 0.95, 0.71, 11, 5, WOOD, { top: WOOD_L, tf: line(`M0 3.2H${tw}M0 6.4H${tw}`, WOOD_D, 0.8, { op: 0.7 }), sw: 1.8 });
  // A mustard cushion against the back, left end.
  const [cx, cy] = F.p(0.26, 0.46, 23);
  s += g(rect(-6.5, -5, 13, 10, MUSTARD, { rx: 4, sw: 1.5 }) + rect(-5, 1.5, 10, 2.6, dk(MUSTARD, 0.2), { rx: 1.2, ns: 1, op: 0.7 }) + circ(0, 0, 1, dk(MUSTARD, 0.4), { ns: 1 }), { tf: `translate(${N(cx)} ${N(cy)}) rotate(-12)` });
  // The plaid blanket over the right end: on the seat, then down the front.
  const bw = 0.32 * 32;
  s += onT(F, 0.56, 0.41, 16.2, plaid(bw, th) + rect(0, 0, bw, th, 'none', { sw: 1.2 }));
  s += onL(F, 0.56, 0.71, 16.2, plaid(bw, 11) + path(`M0 0H${N(bw)}V9L${N(bw - 2)} 11.5L${N(bw - 4)} 9.5L${N(bw - 6)} 12L${N(bw - 8)} 9.5L0 11Z`, 'none', { sw: 1.2 }));
  return out(F, s, 'ls-set-cozy', 34, 'bench');
}

function campfire() {
  const F = frame(1, 70);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = ell(cx, cy, 27, 13.5, ORANGE, { ns: 1, op: NITE ? 0.3 : 0.16 });
  s += ell(cx, cy, 15, 7.4, '#5a4438', { sw: 1.4 });
  const stones = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    stones.push([cx + Math.cos(a) * 19, cy + Math.sin(a) * 9.4, Math.sin(a)]);
  }
  const stone = ([x, y], i) => ell(x, y, 4.8, 3.4, i % 2 ? '#b9b0a4' : '#c9c1b5', { sw: 1.5 }) + ell(x - 1.2, y - 1.2, 2, 1, '#ffffff', { ns: 1, op: 0.45 });
  s += stones.filter((q) => q[2] < 0).map(stone).join('');
  // Two crossed logs with end grain, then the fire, then the front stones.
  s += stick(`${M(cx - 13, cy + 2)}L${N(cx + 11)} ${N(cy - 6)}`, WOOD_D, 5, 2.2) + stick(`${M(cx + 13, cy + 2)}L${N(cx - 11)} ${N(cy - 6)}`, WOOD, 5, 2.2);
  s += ell(cx - 13, cy + 2, 2.6, 2.6, WOOD_L, { sw: 1.3 }) + ell(cx + 13, cy + 2, 2.6, 2.6, WOOD_L, { sw: 1.3 });
  s += flame(cx, cy, 1.25);
  s += g(circ(cx - 8, cy - 34, 1.6, LEMON, { sw: 1 }) + circ(cx + 7, cy - 40, 1.3, ORANGE, { sw: 1 }), { cls: 'dc-spark' }) + g(circ(cx + 1, cy - 43, 1.3, LEMON, { sw: 0.9 }) + circ(cx - 4, cy - 29, 1.1, ORANGE, { sw: 0.9 }), { cls: 'dc-spark', style: 'animation-delay:-.8s' });
  s += stones.filter((q) => q[2] >= 0).map(stone).join('');
  // A plaid-wrapped log seat would not fit 1×1: a toasting stick with a marshmallow instead.
  s += stick(`${M(cx + 22, cy + 6)}L${N(cx + 6)} ${N(cy - 14)}`, WOOD_D, 1.6, 1.8) + rect(cx + 2.5, cy - 19, 6, 5, WHITE, { rx: 2, sw: 1.2, tf: `rotate(-50 ${N(cx + 5.5)} ${N(cy - 16.5)})` });
  return out(F, s, 'ls-set-cozy', 30, 'campfire', [{ u: 0.5, v: 0.5, z: 12, r: 46, color: '#ffb347' }]);
}

function hammock() {
  const F = frame(1, 65);
  const [ax, ay] = F.p(0.08, 0.92);
  const [bx] = F.p(0.92, 0.08);
  const top = ay - 44;
  let s = shadowE((ax + bx) / 2, ay + 1, 21, 6.5);
  // Rustic posts.
  for (const x of [ax, bx]) s += stick(`${M(x, ay)}V${N(top)}`, BARK, 5.6, 2.2) + line(`${M(x - 1.2, ay - 4)}V${N(top + 5)}`, WOOD_L, 1.2, { op: 0.6 }) + ell(x, top, 2.8, 1.5, WOOD_L, { sw: 1.2 });
  // Ropes to two spreader bars, and the sling between them (inside seen from above).
  const lx = ax + 8;
  const rx = bx - 8;
  const y0 = top + 15;
  const bh = 9;
  const sag = 12;
  const mx = (lx + rx) / 2;
  s += stick(`${M(ax, top + 5)}L${N(lx)} ${N(y0)}M${N(ax)} ${N(top + 5)}L${N(lx)} ${N(y0 + bh)}M${N(bx)} ${N(top + 5)}L${N(rx)} ${N(y0)}M${N(bx)} ${N(top + 5)}L${N(rx)} ${N(y0 + bh)}`, '#f0dcb0', 1.5, 1.6);
  const edge = (t, extra = 0) => `${Q(mx, y0 + bh * t + sag + 4 * t + extra, rx, y0 + bh * t + extra * 0.2)}`;
  const band = path(`${M(lx, y0 + bh)}${Q(mx, y0 + bh + sag + 4, rx, y0 + bh)}L${N(rx)} ${N(y0 + bh + 2.5)}${Q(mx, y0 + bh + sag + 9, lx, y0 + bh + 2.5)}Z`, dk(PLAID, 0.35), { sw: 1.4 });
  s += band;
  s += path(`${M(lx, y0)}${edge(0)}L${N(rx)} ${N(y0 + bh)}${Q(mx, y0 + bh + sag + 4, lx, y0 + bh)}Z`, PLAID, { sw: 1.8 });
  for (const t of [0.3, 0.68]) s += line(`${M(lx, y0 + bh * t)}${edge(t)}`, PLAID_L, 2.4, { op: 0.85 });
  s += line(`${M(mx - 8, y0 + 5)}${Q(mx - 7.5, y0 + 13, mx - 8, y0 + 19)}M${N(mx + 8)} ${N(y0 + 5)}${Q(mx + 8.5, y0 + 13, mx + 8, y0 + 19)}`, PLAID_L, 1.8, { op: 0.7 });
  // A pillow, and a mustard blanket on the far end.
  s += ell(lx + 7, y0 + 8, 5.6, 3.8, CREAM, { sw: 1.4, tf: `rotate(14 ${N(lx + 7)} ${N(y0 + 8)})` });
  s += path(`${M(rx - 15, y0 + 9)}${Q(rx - 9, y0 + 6, rx - 2, y0 + 4)}L${N(rx - 2)} ${N(y0 + 11)}${Q(rx - 9, y0 + 13, rx - 14, y0 + 16)}Z`, MUSTARD, { sw: 1.4 });
  // Spreader bars.
  const bars = stick(`${M(lx, y0 - 1.5)}V${N(y0 + bh + 2)}M${N(rx)} ${N(y0 - 1.5)}V${N(y0 + bh + 2)}`, WOOD_D, 2.6, 2);
  s += bars;
  // Front overlay: the sling's front lip, so a napper lies IN the hammock.
  const lip = `${M(lx, y0 + bh)}${Q(mx, y0 + bh + sag + 4, rx, y0 + bh)}L${N(rx)} ${N(y0 + bh - 3)}${Q(mx, y0 + bh + sag - 8, lx, y0 + bh - 3)}Z`;
  const front = band + path(lip, PLAID, { sw: 1.6 }) + line(`${M(lx + 2, y0 + bh - 0.6)}${Q(mx, y0 + bh + sag - 1.6, rx - 2, y0 + bh - 0.6)}`, PLAID_L, 2, { op: 0.85 }) + bars;
  return out(F, s, 'ls-set-cozy', 46, 'hammock', [], { front });
}

/** The part of a convex (u, v) polygon in front of the line u + v = c (nearer the viewer). */
function frontOf(pts, c) {
  const res = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const da = a[0] + a[1] - c;
    const db = b[0] + b[1] - c;
    if (da >= 0) res.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return res;
}

function hottub() {
  const F = frame(2, 116);
  const dw = 1.84 * 32;
  let s = box(F, 0.08, 0.08, 1.92, 1.92, 0, 6, WOOD, { top: WOOD_L, tf: line([1, 2, 3, 4, 5, 6, 7].map((k) => `M0 ${N(k * 7.36)}H${N(dw)}`).join(''), WOOD_D, 0.8, { op: 0.55 }), sw: 1.8 });
  // Gold claw feet.
  const foot = (u, v) => {
    const [x, y] = F.p(u, v, 6);
    return path(`${M(x - 2.6, y - 9)}${Q(x - 3, y - 3, x - 4.6, y)}H${N(x + 4.6)}${Q(x + 3, y - 3, x + 2.6, y - 9)}Z`, GOLD, { sw: 1.4 }) + line(`${M(x - 1.5, y - 0.5)}v-2M${N(x + 1.5)} ${N(y - 0.5)}v-2`, GOLD_DD, 0.8);
  };
  s += foot(0.5, 0.72) + foot(1.5, 0.72) + foot(0.5, 1.3) + foot(1.5, 1.3);
  const tub = rrPts(0.3, 0.6, 1.7, 1.42, 0.41, 5);
  const wall = ext(F, tub, 13, 24, WHITE, { top: 'none', sw: 2 }) + ext(F, tub, 33, 4, '#e9f6ff', { top: 'none', sw: 0 }).replace(/<path[^>]*opacity="0\.2"\/>/, '');
  s += ext(F, tub, 13, 24, WHITE, { top: WHITE, sw: 2 }) + ext(F, tub, 33, 4, '#e9f6ff', { top: 'none', sw: 0 }).replace(/<path[^>]*opacity="0\.2"\/>/, '');
  // Water (glowing at night), bubbles.
  const WATER = NITE ? '#a6ecff' : '#7fd3f5';
  const wpts = rrPts(0.38, 0.67, 1.62, 1.35, 0.34, 5);
  s += path(poly(wpts.map(([u, v]) => F.p(u, v, 36))), WATER, { sw: 1.4 });
  const [wx, wy] = F.p(1, 1, 36);
  s += halo(wx, wy, 30, '#bff4ff', 0.3);
  s += ell(wx - 8, wy - 2, 12, 3.4, '#bdeeff', { ns: 1, op: 0.9 });
  s += path(cpath([[wx - 16, wy + 2, 1.6], [wx - 10, wy + 5, 1.2], [wx + 12, wy - 4, 1.4], [wx + 4, wy + 6, 1.1], [wx - 2, wy - 6, 1.2]]), WHITE, { sw: 0.9 });
  // Gold tap at the back end.
  const [fx, fy] = F.p(0.42, 1.0, 37);
  s += stick(`${M(fx, fy)}V${N(fy - 10)}${Q(fx, fy - 15, fx + 6, fy - 14)}`, GOLD, 2.6, 2) + circ(fx - 3, fy - 7, 1.8, GOLD, { sw: 1.1 }) + circ(fx + 3, fy - 7, 1.8, GOLD, { sw: 1.1 });
  // A rubber duck (front right) and a plaid towel over the front rim.
  const [dx, dy] = F.p(1.42, 1.0, 37);
  const duck = ell(dx, dy, 6.4, 4.2, LEMON, { sw: 1.4 }) + circ(dx - 4.2, dy - 5.2, 3.6, LEMON, { sw: 1.4 }) + path(`${M(dx - 7.4, dy - 5.4)}l-3.4 1.2l3.2 1.4Z`, ORANGE, { sw: 1 }) + circ(dx - 5, dy - 6.2, 0.8, O, { ns: 1 }) + path(`${M(dx + 1, dy - 2)}q3 -1.5 4.5 1`, 'none', { sw: 1, stroke: dk(LEMON, 0.35) });
  const towel = onL(F, 0.72, 1.42, 37.5, plaid(13, 15) + path('M0 0H13V13L11 15.5L9 13.5L7 16L5 13.5L3 15.5L0 13Z', 'none', { sw: 1.3 }));
  s += duck + towel;
  // A wooden step at the front right, two candles at the left.
  s += box(F, 1.56, 1.46, 1.86, 1.78, 6, 8, WOOD, { top: WOOD_L, sw: 1.5 });
  for (const [u, v, h] of [[0.2, 1.62, 8], [0.3, 1.76, 6]]) {
    const [x, y] = F.p(u, v, 6);
    s += halo(x, y - h - 3, 6, '#ffcf70', 0.5) + rect(x - 2, y - h, 4, h, CREAM, { sw: 1.1 }) + path(`${M(x, y - h - 1)}q-2 -2.5 0 -5q2 2.5 0 5Z`, ORANGE, { sw: 0.8 });
  }
  // Steam.
  s += puff(wx - 12, wy - 14, 1.15) + puff(wx + 6, wy - 21, 1, WHITE, 'dc-steam', 0.92, -1.1) + puff(wx - 2, wy - 29, 0.85, WHITE, 'dc-steam', 0.92, -2.2);
  s += sparkle(F.p(1.8, 0.4, 30)[0], F.p(1.8, 0.4, 30)[1], 4.5) + sparkle(F.p(0.2, 1.3, 40)[0], F.p(0.2, 1.3, 40)[1], 3.6);
  // Front overlay (a soaker sits IN the water): the wall, the rim and water in front of the
  // line through the tub's middle (u + v = 2), the duck and the towel.
  const cut = 2;
  const wf = frontOf(wpts, cut);
  const arc = wpts.filter(([u, v]) => u + v >= cut);
  const front =
    wall +
    path(poly(frontOf(tub, cut).map(([u, v]) => F.p(u, v, 37))), WHITE, { ns: 1 }) +
    path(poly(wf.map(([u, v]) => F.p(u, v, 36))), WATER, { ns: 1 }) +
    path(poly(arc.map(([u, v]) => F.p(u, v, 36)), false), 'none', { sw: 1.4 }) +
    line(`${M(wx - 14, wy + 1.5)}q3.5 -1.6 7 0t7 0t7 0t7 0`, '#ffffff', 1.2, { op: 0.85 }) +
    duck +
    towel;
  return out(F, s, 'ls-set-cozy ls-rare', 40, 'hottub', [{ u: 0.25, v: 1.7, z: 14, r: 20, color: '#ffcf70' }, { u: 1, v: 1, z: 36, r: 34, color: '#9fe8ff' }], { front });
}

function treehouse() {
  const F = frame(2, 170);
  const [tx, ty] = F.p(1.05, 1.05);
  const zd = 46; // the deck
  let s = shadowE(tx, ty + 2, 40, 18);
  // The crown behind the house.
  const cy0 = ty - 118;
  s += blob([[36, cy0 + 22, 22], [62, cy0 + 4, 24], [92, cy0 + 16, 23], [22, cy0 + 48, 16], [108, cy0 + 42, 16], [64, cy0 + 30, 22]], LEAF, { shade: LEAF_D });
  // Trunk with flared roots and bark lines.
  s += path(`${M(tx - 22, ty + 4)}${Q(tx - 14, ty - 2, tx - 12, ty - 14)}H${N(tx + 12)}${Q(tx + 14, ty - 2, tx + 22, ty + 4)}${Q(tx, ty + 12, tx - 22, ty + 4)}Z`, BARK, { sw: 1.8 });
  s += cyl(F, 1.05, 1.05, 0.28, 2, zd + 4, BARK, { top: 'none' });
  s += line(`${M(tx - 6, ty - 8)}V${N(ty - 38)}M${N(tx + 4)} ${N(ty - 4)}V${N(ty - 24)}M${N(tx + 2)} ${N(ty - 32)}V${N(ty - 46)}M${N(tx - 9)} ${N(ty - 42)}V${N(ty - 48)}`, dk(BARK, 0.3), 1.2, { op: 0.7 });
  s += ell(tx - 4, ty - 24, 2.6, 3.4, dk(BARK, 0.45), { sw: 1.1 });
  // Braces up to the deck.
  const [b0x, b0y] = F.p(1.05, 1.05, 22);
  s += stick(`${M(b0x - 8, b0y)}L${xy(F, 0.95, 1.72, zd)}M${N(b0x + 8)} ${N(b0y)}L${xy(F, 1.72, 0.95, zd)}`, WOOD_D, 3, 2);
  // Deck.
  const dw = 1.4 * 32;
  s += box(F, 0.3, 0.3, 1.74, 1.74, zd, 6, WOOD, { top: WOOD_L, tf: line([1, 2, 3, 4, 5].map((k) => `M${N(k * 7.7)} 0V${N(dw + 1)}`).join(''), WOOD_D, 0.8, { op: 0.55 }), sw: 1.8 });
  // The little house: plank walls, a window with a plaid curtain (lit at night), a round-top door.
  const zh = zd + 6;
  const hh = 31;
  const hw = 0.92 * 32;
  const pane = NITE ? LIT : '#bfe6ff';
  const planks = (w) => line([6, 12, 18, 24].map((y) => `M0 ${y}H${N(w)}`).join(''), WOOD_D, 0.8, { op: 0.45 });
  const win = (NITE ? rect(3, 4, 19, 17, '#ffe27a', { ns: 1, op: 0.45 }) : '') + rect(6, 7, 13, 11, pane, { sw: 1.4 }) + (NITE ? '' : line('M8 16L16 8', '#ffffff', 1.4, { op: 0.8 })) + line('M12.5 7V18M6 12.5H19', WOOD_D, 1.2) + g(plaid(6, 12) + rect(0, 0, 6, 12, 'none', { sw: 1 }), { tf: 'translate(5 6)' }) + rect(4, 17.5, 17, 2.6, WOOD_D, { sw: 1.1 });
  const door = path(`M9 ${hh}V17Q9 11.5 14.5 11.5Q20 11.5 20 17V${hh}Z`, WOOD_D, { sw: 1.4 }) + circ(18, 22, 1, GOLD, { ns: 1 }) + line(`M14.5 12V${hh}`, dk(WOOD_D, 0.3), 0.8);
  s += box(F, 0.46, 0.46, 1.38, 1.38, zh, hh, WOOD_L, { lf: planks(hw) + win, rf: planks(hw) + door, top: 'none', sw: 2 });
  // Gable roof, ridge along u: front slope faces down-left, gable end on the right face.
  const z = zh + hh;
  const rh = 19;
  const vm = 0.92;
  s += face(F, [[1.38, 0.46, z], [1.38, 1.38, z], [1.38, vm, z + rh]], WOOD_L, { sw: 1.6 }) + face(F, [[1.38, 0.46, z], [1.38, 1.38, z], [1.38, vm, z + rh]], O, { ns: 1, op: 0.2 });
  s += onR(F, 1.38, vm - 0.1, z + 6, circ(3.8, 0, 3.2, NITE ? LIT : '#bfe6ff', { sw: 1.2 }));
  const roof = [[0.36, vm, z + rh + 1], [1.5, vm, z + rh + 1], [1.5, 1.5, z - 4], [0.36, 1.5, z - 4]];
  s += face(F, roof, '#d0583c', { sw: 2 }) + face(F, [[1.5, vm, z + rh + 1], [1.5, 1.5, z - 4], [1.5, 1.5, z - 7], [1.5, vm, z + rh - 2]], dk('#d0583c', 0.3), { sw: 1.4 });
  s += path(pd(F, [[0.6, 1.12, z + 12], [1.4, 1.12, z + 12]], false) + pd(F, [[0.6, 1.32, z + 3], [1.4, 1.32, z + 3]], false), 'none', { sw: 1, stroke: dk('#d0583c', 0.3) });
  // A pennant on the ridge, a lantern under the deck.
  const [px, py] = F.p(1.42, vm, z + rh + 1);
  s += pennant(px, py, 14, PLAID, 1, PLAID_L);
  const [lx, ly] = F.p(1.72, 1.2, zd);
  s += halo(lx, ly + 9.5, 9, '#ffcf70', 0.5) + line(`${M(lx, ly)}v6`, O, 1) + rect(lx - 3, ly + 6, 6, 7, NITE ? '#fff4b8' : LIT, { sw: 1.2, rx: 1 }) + rect(lx - 3.5, ly + 5, 7, 2, WOOD_D, { sw: 1 });
  // Front leaves, then the rope ladder.
  s += blob([[114, ty - 50, 11], [103, ty - 40, 9]], LEAF, { shade: LEAF_D });
  const [r0x, r0y] = F.p(1.18, 1.74, zd);
  const [r1x, r1y] = F.p(1.3, 1.9, 0);
  const rail = (dx) => `${M(r0x + dx, r0y)}${Q(r0x + dx - 3, (r0y + r1y) / 2, r1x + dx, r1y)}`;
  s += line(rail(-5) + rail(5), O, 3.4) + line(rail(-5) + rail(5), '#e8d3a8', 1.6);
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    const x = r0x + (r1x - r0x) * t - Math.sin(t * Math.PI) * 2;
    const y = r0y + (r1y - r0y) * t;
    s += stick(`${M(x - 5, y)}H${N(x + 5)}`, WOOD, 2, 1.6);
  }
  return out(F, s, 'ls-set-cozy ls-signature', 108, 'treehouse', [{ u: 1.72, v: 1.2, z: zd - 10, r: 18, color: '#ffcf70' }, { u: 0.9, v: 1.4, z: zh + 16, r: 22, color: '#ffe9a8' }]);
}

// =============================================================================================
// GARDEN: terracotta and greens.
// =============================================================================================

/** A round pom flower. */
const flower = (x, y, c, r = 3.4) => circ(x, y, r, c, { sw: 1.2 }) + circ(x, y, r * 0.42, c === LEMON ? ORANGE : LEMON, { ns: 1 });

function planter() {
  const F = frame(1, 55);
  let s = face(F, [[0.14, 0.14], [0.9, 0.14], [0.9, 0.9], [0.14, 0.9]], O, { ns: 1, op: 0.12 });
  const lw = 0.6 * 32;
  const band = line(`M1 11.5H${N(lw - 1)}`, TERRA_L, 1.6, { op: 0.9 }) + path([0, 1, 2, 3].map((k) => `M${N(2 + k * 4.6)} 5l2.3 -2.3l2.3 2.3`).join(''), 'none', { sw: 1, stroke: dk(TERRA, 0.3) });
  s += box(F, 0.2, 0.2, 0.8, 0.8, 0, 15, TERRA, { top: 'none', lf: band, rf: band, sw: 1.8 });
  s += box(F, 0.16, 0.16, 0.84, 0.84, 13, 4, TERRA_L, { top: TERRA_L, sw: 1.8 });
  s += face(F, [[0.23, 0.23, 17], [0.77, 0.23, 17], [0.77, 0.77, 17], [0.23, 0.77, 17]], SOIL, { sw: 1.2 });
  const [cx, cy] = F.p(0.5, 0.5, 17);
  s += blob([[cx - 10, cy - 4, 7.5], [cx, cy - 9, 8.5], [cx + 10, cy - 4, 7.5], [cx - 5, cy + 1, 6], [cx + 5, cy + 1, 6]], LEAF, { shade: LEAF_D });
  s += leaf(cx - 14, cy - 1, 9, 200) + leaf(cx + 14, cy - 1, 9, -20);
  s += flower(cx - 9, cy - 8, RED) + flower(cx + 1, cy - 14, PINK) + flower(cx + 10, cy - 8, LEMON) + flower(cx - 3, cy - 3, WHITE, 3) + flower(cx + 6, cy - 1, RED, 3);
  return out(F, s, 'ls-set-garden', 22, 'planter');
}

/** A sunflower head at (x, y), radius r: a scalloped ring of petals; face: a little smile. */
function sunflower(x, y, r, face) {
  const n = 11;
  const pt = (a, k) => `${N(x + Math.cos(a) * r * k)} ${N(y + Math.sin(a) * r * k)}`;
  let d = `M${pt(0, 0.95)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    d += `Q${pt((a0 + a1) / 2, 1.62)} ${pt(a1, 0.95)}`;
  }
  let s = path(d + 'Z', '#ffcf26', { sw: 1.5 });
  let v = '';
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    v += `M${pt(a, 0.7)}L${pt(a, 1.12)}`;
  }
  s += line(v, '#f0a400', 1, { op: 0.8 });
  s += circ(x, y, r * 0.62, '#8a5226', { sw: 1.4 }) + circ(x - r * 0.14, y - r * 0.16, r * 0.32, '#a8693a', { ns: 1 });
  if (face) s += circ(x - r * 0.22, y - r * 0.1, 0.9, O, { ns: 1 }) + circ(x + r * 0.22, y - r * 0.1, 0.9, O, { ns: 1 }) + line(`${M(x - r * 0.22, y + r * 0.16)}${Q(x, y + r * 0.38, x + r * 0.22, y + r * 0.16)}`, O, 1) + circ(x - r * 0.4, y + r * 0.12, 1.1, '#ff8a7a', { ns: 1, op: 0.8 }) + circ(x + r * 0.4, y + r * 0.12, 1.1, '#ff8a7a', { ns: 1, op: 0.8 });
  else s += path(cpath([[x - 1.6, y - 1, 0.7], [x + 1.4, y - 1.6, 0.7], [x, y + 1.4, 0.7], [x + 2, y + 1.2, 0.6], [x - 2, y + 1.6, 0.6]]), '#5e3518', { ns: 1 });
  return s;
}

function sunflowers() {
  const F = frame(1, 113);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = shadowE(cx, cy, 15, 7.5);
  const potTop = cy - 17;
  const heads = [
    [cx - 13, cy - 62, 8, false],
    [cx + 3, cy - 82, 9.5, true],
    [cx + 15, cy - 54, 7.6, false],
  ];
  // Stalks and leaves behind the pot rim.
  for (const [x, y] of heads) s += stick(`${M(cx + (x - cx) * 0.2, potTop + 4)}${Q(cx + (x - cx) * 0.4, (potTop + y) / 2, x, y + 6)}`, LEAF_D, 2.6, 2);
  s += leaf(cx - 2, potTop - 18, 11, 205) + leaf(cx + 3, potTop - 30, 11, -30) + leaf(cx + 6, potTop - 12, 10, -10) + leaf(cx - 4, potTop - 40, 9, 215);
  s += cyl(F, 0.5, 0.5, 0.26, 0, 13, TERRA, { top: 'none' });
  s += cyl(F, 0.5, 0.5, 0.3, 11, 5, TERRA_L, { top: SOIL });
  for (const [x, y, r, f] of heads) s += sunflower(x, y, r, f);
  return out(F, s, 'ls-set-garden', 80, 'sunflowers');
}

function veggie() {
  const F = frame(2, 98);
  const iw = 1.6 * 32;
  // Raised bed: plank frame, soil inside with furrows.
  let s = box(F, 0.1, 0.1, 1.9, 1.9, 0, 9, WOOD, { top: WOOD_L, lf: line(`M0 4.5H${N(1.8 * 32)}`, WOOD_D, 0.8, { op: 0.6 }), rf: line(`M0 4.5H${N(1.8 * 32)}`, WOOD_D, 0.8, { op: 0.6 }), sw: 1.8 });
  s += face(F, [[0.2, 0.2, 9], [1.8, 0.2, 9], [1.8, 1.8, 9], [0.2, 1.8, 9]], SOIL, { sw: 1.2 });
  s += onT(F, 0.2, 0.2, 9, line([0.24, 0.5, 0.74].map((t) => `M2 ${N(t * iw)}H${N(iw - 2)}`).join(''), SOIL_L, 3, { op: 0.9 }));
  const P = (u, v) => F.p(u, v, 9);
  // Back row: tomatoes on stakes.
  const T = [0.5, 1.0, 1.5].map((u) => P(u, 0.42));
  s += stick(T.map(([x, y]) => `${M(x, y)}V${N(y - 34)}`).join(''), WOOD_L, 1.8, 1.6);
  s += blob(T.flatMap(([x, y]) => [[x - 5, y - 20, 6], [x + 5, y - 24, 6], [x, y - 30, 5.5], [x - 3, y - 12, 5]]), LEAF, { shade: LEAF_D });
  s += path(cpath(T.flatMap(([x, y]) => [[x - 6, y - 17, 2.6], [x + 4, y - 20, 2.8], [x + 1, y - 29, 2.4]])), RED, { sw: 1.2 }) + path(cpath(T.flatMap(([x, y]) => [[x - 6.8, y - 18, 0.8], [x + 3.2, y - 21, 0.8]])), '#ffffff', { ns: 1, op: 0.8 });
  // Cabbages.
  const C = [0.45, 0.95, 1.45].map((u) => P(u, 0.86));
  s += blob(C.flatMap(([x, y]) => [[x - 4, y - 4, 5], [x + 4, y - 4, 5], [x, y - 7, 5.5]]), '#9be06a', { shade: '#6fbf48' }) + line(C.map(([x, y]) => `${M(x, y - 2)}V${N(y - 10)}M${N(x)} ${N(y - 4)}l-3 -3M${N(x)} ${N(y - 4)}l3 -3`).join(''), '#5aa83c', 1, { op: 0.8 });
  // Carrots: orange shoulders and feathery tops.
  const K = [0.32, 0.66, 1.0, 1.34, 1.68].map((u) => P(u, 1.26));
  const fr = K.map(([x, y]) => `${M(x, y - 3)}l-4 -9M${N(x)} ${N(y - 3)}l0 -11M${N(x)} ${N(y - 3)}l4 -9`).join('');
  s += line(fr, O, 3.6) + line(fr, LEAF, 1.8) + path(K.map(([x, y]) => `${M(x - 4, y - 1)}a4 3 0 1 0 8 0a4 3 0 1 0 -8 0`).join(''), ORANGE, { sw: 1.3 });
  // Front row: radishes.
  const R = [0.4, 0.8, 1.2, 1.6].map((u) => P(u, 1.64));
  s += leaves(R.flatMap(([x, y]) => [[x - 1, y - 3, 7, 235], [x + 1, y - 3, 7, 305]]), LEAF_L) + path(cpath(R.map(([x, y]) => [x, y, 3.2])), '#e8486e', { sw: 1.3 });
  // A seed-packet sign at the left corner and a watering can at the right.
  const [sx, sy] = F.p(0.18, 1.9, 0);
  s += stick(`${M(sx + 2, sy)}V${N(sy - 22)}`, WOOD_D, 1.6, 1.6) + rect(sx - 5, sy - 31, 14, 12, WHITE, { sw: 1.3, rx: 1 }) + path(`${M(sx - 1, sy - 22)}l4 -6l4 6Z`, ORANGE, { sw: 0.9 }) + line(`${M(sx + 3, sy - 28)}l0 -2`, LEAF, 1.4);
  const [wx, wy] = F.p(1.95, 0.6, 0);
  s += path(`${M(wx - 12, wy - 3)}L${N(wx - 17)} ${N(wy - 13)}`, 'none', { sw: 4 }) + path(`${M(wx - 12, wy - 3)}L${N(wx - 17)} ${N(wy - 13)}`, 'none', { sw: 2, stroke: TERRA_L });
  s += rect(wx - 13, wy - 12, 12, 12, TERRA, { sw: 1.5, rx: 2 }) + path(`${M(wx - 11, wy - 12)}${Q(wx - 7, wy - 19, wx - 3, wy - 12)}`, 'none', { sw: 1.6 }) + rect(wx - 12, wy - 9, 10, 2, TERRA_L, { ns: 1 });
  return out(F, s, 'ls-set-garden', 32, 'veggie');
}

function gnome() {
  const F = frame(1, 80);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = shadowE(cx, cy, 14, 7);
  s += cyl(F, 0.5, 0.5, 0.28, 0, 8, TERRA, { top: '#8fcf5a' });
  const y = cy - 9;
  const x = cx;
  // Boots, coat, belt.
  s += ell(x - 5, y, 4.6, 2.6, GOLD_DD, { sw: 1.4 }) + ell(x + 5, y, 4.6, 2.6, GOLD_DD, { sw: 1.4 });
  s += path(`${M(x - 10, y - 1)}${Q(x - 11, y - 18, x, y - 19)}${Q(x + 11, y - 18, x + 10, y - 1)}Z`, GOLD, { sw: 1.8 });
  s += path(`${M(x + 2, y - 19)}${Q(x + 11, y - 18, x + 10, y - 1)}H${N(x + 3)}Z`, GOLD_D, { ns: 1, op: 0.75 });
  s += rect(x - 10, y - 8, 20, 3.4, GOLD_DD, { sw: 1.2 }) + rect(x - 2, y - 8.8, 4, 5, GOLD_L, { sw: 1.1 });
  // Hands on the belly, holding a tiny gold shovel.
  s += stick(`${M(x + 9, y - 2)}L${N(x + 15)} ${N(y - 22)}`, GOLD_D, 1.6, 1.6) + path(`${M(x + 7, y + 1)}l2 -5l4 1.2l-1 5Z`, GOLD, { sw: 1.2 });
  s += circ(x - 8, y - 9, 2.6, GOLD_L, { sw: 1.3 }) + circ(x + 13, y - 15, 2.6, GOLD_L, { sw: 1.3 });
  // Beard, face, nose.
  s += path(`${M(x - 8, y - 22)}${Q(x - 9, y - 10, x, y - 6)}${Q(x + 9, y - 10, x + 8, y - 22)}${Q(x, y - 18, x - 8, y - 22)}Z`, GOLD_L, { sw: 1.6 }) + line(`${M(x - 3, y - 15)}q1 4 3 6M${N(x + 3)} ${N(y - 15)}q-1 4 -3 6`, GOLD_D, 0.9);
  s += circ(x, y - 25, 6.4, GOLD_L, { sw: 1.6 });
  s += line(`${M(x - 4, y - 26)}q1.2 -1.4 2.4 0M${N(x + 1.6)} ${N(y - 26)}q1.2 -1.4 2.4 0`, GOLD_DD, 1);
  s += circ(x, y - 22.5, 2.8, GOLD, { sw: 1.3 }) + circ(x - 0.8, y - 23.4, 0.9, SHINE, { ns: 1 });
  // The hat, curling at the tip.
  s += path(`${M(x - 9, y - 27)}${Q(x - 4, y - 46, x + 6, y - 52)}${Q(x + 12, y - 50, x + 11, y - 45)}${Q(x + 7, y - 46, x + 6, y - 40)}${Q(x + 6, y - 32, x + 9, y - 27)}${Q(x, y - 30, x - 9, y - 27)}Z`, GOLD, { sw: 1.8 });
  s += path(`${M(x + 1, y - 29.4)}${Q(x + 4, y - 40, x + 6, y - 40)}${Q(x + 6, y - 32, x + 9, y - 27)}Z`, GOLD_D, { ns: 1, op: 0.7 });
  s += line(`${M(x - 5, y - 32)}${Q(x - 2, y - 42, x + 3, y - 47)}`, SHINE, 1.4, { op: 0.9 });
  s += line(`${M(x - 7, y - 15)}${Q(x - 7, y - 6, x - 4, y - 3)}`, SHINE, 1.2, { op: 0.8 });
  s += sparkle(x - 15, y - 38, 4.2) + sparkle(x + 17, y - 30, 3.2) + sparkle(x - 13, y - 8, 2.6);
  return out(F, s, 'ls-set-garden ls-rare', 48, 'gnome', [{ u: 0.5, v: 0.5, z: 30, r: 16, color: '#ffe58a' }]);
}

/** A ribbed pumpkin centred (x, y), half-width w, height h. */
function pumpkin(x, y, w, h, col = '#ff8f2e') {
  const sh = dk(col, 0.2);
  const ribs = [-0.62, 0.62, -0.32, 0.32, 0];
  let s = '';
  for (const k of ribs) {
    const rx = w * (k === 0 ? 0.42 : Math.abs(k) > 0.5 ? 0.38 : 0.4);
    s += ell(x + k * w, y, rx, h / 2, k > 0.1 ? mix(col, sh, 0.7) : col, { sw: 1.6 });
  }
  s += ell(x - w * 0.42, y - h * 0.16, w * 0.12, h * 0.22, lt(col, 0.45), { ns: 1, op: 0.8 });
  s += stick(`${M(x, y - h / 2 + 2)}${Q(x + 1, y - h / 2 - 5, x + 4, y - h / 2 - 7)}`, '#7a8a3a', Math.max(2.2, w * 0.1), 2);
  return s;
}

function pumpkins() {
  const F = frame(2, 84);
  const [cx, cy] = F.p(1, 1);
  // A dug patch of soil (a low rounded mound inside the footprint) with straw, vines and leaves.
  let s = face(F, rrPts(0.08, 0.08, 1.92, 1.92, 0.5, 4), O, { ns: 1, op: 0.12 });
  s += ext(F, rrPts(0.12, 0.12, 1.88, 1.88, 0.48, 5), 0, 3, SOIL, { top: SOIL_L, sw: 1.6 });
  s += line(`${M(cx - 36, cy + 8)}l6 -2M${N(cx + 22)} ${N(cy + 14)}l6 1M${N(cx - 20)} ${N(cy + 16)}l5 -3M${N(cx + 40)} ${N(cy - 2)}l4 3M${N(cx - 40)} ${N(cy - 6)}l5 2`, '#e8c860', 1.4);
  s += line(`${M(cx - 44, cy + 2)}${Q(cx - 20, cy - 16, cx, cy - 6)}${Q(cx + 22, cy + 6, cx + 46, cy - 4)}M${N(cx - 10)} ${N(cy + 18)}${Q(cx + 2, cy + 6, cx + 16, cy + 18)}`, LEAF_D, 2.2);
  for (const [x, y, l, a] of [[cx - 40, cy - 2, 13, 200], [cx - 18, cy - 14, 12, 250], [cx + 30, cy - 10, 13, -40], [cx + 40, cy + 4, 12, 20], [cx - 27, cy + 7, 11, 172], [cx + 14, cy + 15, 10, 10]]) s += leaf(x, y, l, a, LEAF);
  s += line(`${M(cx - 8, cy - 18)}q-4 -3 -1 -6q3 -2 4 1M${N(cx + 36)} ${N(cy - 4)}q4 -4 1 -7q-3 -1 -3 2`, LEAF_D, 1.3);
  // The giant (with a blue first-prize rosette), then the smaller ones in front.
  s += pumpkin(cx + 2, cy - 22, 30, 40);
  const rx = cx - 14;
  const ry = cy - 22;
  s += path(`${M(rx - 3, ry + 3)}l-3 11l3 -2l2 3l1 -11ZM${N(rx + 1)} ${N(ry + 3)}l2 11l2 -3l3 1l-3 -10Z`, BLUE, { sw: 1.1 }) + circ(rx, ry, 5.6, BLUE, { sw: 1.4 }) + circ(rx, ry, 3, GOLD, { sw: 1 }) + star(rx, ry, 1.8, GOLD_L, { sw: 0 });
  s += pumpkin(cx - 30, cy + 2, 14, 18) + pumpkin(cx + 29, cy + 2, 13, 17, '#ffa53c');
  s += pumpkin(cx + 6, cy + 14, 8, 11, '#f1e4c4') + pumpkin(cx - 10, cy + 18, 7, 9, '#ffa53c');
  return out(F, s, 'ls-set-garden ls-signature', 22, 'pumpkins');
}

// =============================================================================================
// PARTY: pink and candy colours.
// =============================================================================================

/** A lawn flamingo standing on (x, y); k scales it; hat: a party hat. */
function flamingoFig(x, y, k, hat, dir = 1) {
  const P = (dx, dy) => `${N(x + dx * k * dir)} ${N(y + dy * k)}`;
  let s = shadowE(x, y, 7 * k, 2.4 * k);
  s += stick(`M${P(-1.5, 0)}L${P(-1, -19)}M${P(2, 0)}L${P(1.6, -19)}`, '#e0559a', 1.5 * k, 1.6);
  s += path(`M${P(9, -27)}L${P(17, -32)}L${P(15, -24)}Z`, PINK_D, { sw: 1.3 });
  s += path(`M${P(-8, -26)}C${P(-8, -34)} ${P(6, -35)} ${P(11, -28)}C${P(13, -22)} ${P(4, -17)} ${P(-2, -18)}C${P(-6, -19)} ${P(-8, -22)} ${P(-8, -26)}Z`, PINK, { sw: 1.8 });
  s += path(`M${P(-2, -27)}C${P(2, -31)} ${P(8, -30)} ${P(9, -26)}C${P(6, -23)} ${P(1, -23)} ${P(-2, -27)}Z`, PINK_L, { sw: 1.1 });
  const neck = `M${P(-6, -27)}C${P(-12, -33)} ${P(-1, -39)} ${P(-5, -46)}`;
  s += line(neck, O, 5.4 * k) + line(neck, PINK, 3.2 * k);
  s += circ(x - 5 * k * dir, y - 47 * k, 3.6 * k, PINK, { sw: 1.5 });
  s += path(`M${P(-8, -48)}L${P(-12, -44)}L${P(-11, -41)}L${P(-7.5, -45)}Z`, WHITE, { sw: 1.1 }) + path(`M${P(-12, -44)}L${P(-11, -41)}L${P(-10, -42.6)}Z`, O, { ns: 1 });
  s += circ(x - 5.6 * k * dir, y - 48 * k, 0.9, O, { ns: 1 });
  if (hat) s += path(`M${P(-8.5, -49.5)}L${P(-3, -61)}L${P(0.5, -48.5)}Z`, LEMON, { sw: 1.3 }) + line(`M${P(-7, -52)}L${P(-0.6, -51)}M${P(-5.4, -56)}L${P(-1.8, -55.4)}`, PINK, 1.4) + circ(x - 3 * k * dir, y - 62 * k, 1.8, MINT, { sw: 1 });
  return s;
}

function flamingo() {
  const F = frame(1, 97);
  let s = '';
  const [ax, ay] = F.p(0.28, 0.46);
  const [bx, by] = F.p(0.8, 0.62);
  s += flamingoFig(ax - 6, ay, 1.15, true) + flamingoFig(bx + 7, by, 0.9, false, -1);
  s += path(`${M(ax - 17, ay - 34)}l2 -3l2 3z${M(bx + 12, by - 52)}l2 -3l2 3z`, LEMON, { sw: 1 }) + circ(ax - 18, ay - 20, 1.3, MINT, { sw: 0.9 }) + circ(bx + 16, by - 40, 1.3, BLUE, { sw: 0.9 });
  return out(F, s, 'ls-set-party', 68, 'flamingo');
}

function trampoline() {
  const F = frame(1, 53);
  const [cx, cy] = F.p(0.5, 0.5);
  const r = 0.43;
  const rx = r * RX;
  const ry = r * RY;
  const zr = 11;
  const ty = cy - zr;
  let s = shadowE(cx, cy, rx + 1, ry + 0.5);
  const legAt = (a) => {
    const x = cx + Math.cos(a) * rx * 0.8;
    const y = cy + Math.sin(a) * ry * 0.8;
    return stick(`${M(x, y - zr + 2)}L${N(x)} ${N(y - 3)}L${N(x + (Math.cos(a) > 0 ? 2.4 : -2.4))} ${N(y)}`, STEEL, 2, 1.8);
  };
  s += legAt(-2.4) + legAt(-0.7);
  s += path(`${M(cx - rx, ty)}V${N(ty + 3.5)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(ty + 3.5)}V${N(ty)}Z`, PINK_D, { sw: 1.6 });
  s += legAt(2.4) + legAt(0.7);
  // The padded rim in candy wedges, then the mat.
  const ir = 0.76;
  const segs = 14;
  const cols = [PINK, WHITE, PINK, LEMON, PINK, MINT, PINK, WHITE, PINK, LEMON, PINK, MINT, PINK, WHITE];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const p = (a, k) => `${N(cx + Math.cos(a) * rx * k)} ${N(ty + Math.sin(a) * ry * k)}`;
    s += path(`M${p(a0, 1)}A${N(rx)} ${N(ry)} 0 0 1 ${p(a1, 1)}L${p(a1, ir)}A${N(rx * ir)} ${N(ry * ir)} 0 0 0 ${p(a0, ir)}Z`, cols[i], { ns: 1 });
  }
  s += ell(cx, ty, rx, ry, 'none', { sw: 1.8 });
  const MAT = '#3f56c8';
  s += ell(cx, ty + 0.4, rx * ir, ry * ir, MAT, { sw: 1.4 }) + ell(cx, ty + 0.4, rx * ir * 0.62, ry * ir * 0.62, 'none', { sw: 1.6, stroke: '#8cc0ff' }) + ell(cx, ty + 0.4, rx * ir * 0.3, ry * ir * 0.3, PINK, { sw: 1.1 }) + ell(cx - 6, ty - 2, rx * 0.22, ry * 0.16, '#ffffff', { ns: 1, op: 0.45 });
  s += sparkle(cx - 12, ty - 14, 3.2, LEMON) + sparkle(cx + 10, ty - 20, 2.6, PINK_L) + circ(cx + 2, ty - 12, 1.3, MINT, { sw: 0.9 });
  return out(F, s, 'ls-set-party', 20, 'trampoline');
}

/** A pallet's slats on a face (local w × h): boards with dark gaps and blocks. */
function palletFace(w, h) {
  let s = rect(0, 0, w, h, WOOD_L, { ns: 1 });
  const layers = Math.round(h / 7);
  for (let k = 0; k < layers; k++) {
    const y = k * 7 + 2.4;
    s += rect(0, y, w, 3.2, '#5b3f28', { ns: 1 });
    for (let x = 1; x < w - 3; x += w / Math.max(2, Math.round(w / 13))) s += rect(x, y, 4, 3.2, WOOD, { ns: 1 });
  }
  return s;
}

function stage() {
  const F = frame(2, 118);
  let s = '';
  const zt = 14;
  const v1 = 1.56;
  // Bunting posts at the platform's left and right corners (drawn first, behind everything).
  const [pa, pb] = [F.p(0.16, v1 - 0.08, 0), F.p(1.84, 0.16, 0)];
  s += stick(`${M(pa[0], pa[1])}V${N(pa[1] - 76)}`, WOOD_D, 2.8, 2) + stick(`${M(pb[0], pb[1])}V${N(pb[1] - 76)}`, WOOD_D, 2.8, 2);
  // Pallet platform with a pink star rug, and the step at the front.
  const lw = 1.8 * 32;
  const rw = (v1 - 0.1) * 32;
  s += box(F, 0.1, 0.1, 1.9, v1, 0, zt, WOOD_L, { lf: palletFace(lw, zt), rf: palletFace(rw, zt), top: '#edc48c', tf: line([1, 2, 3, 4, 5, 6].map((k) => `M0 ${N(k * 6.6)}H${N(lw)}`).join(''), WOOD_D, 0.8, { op: 0.5 }), sw: 2 });
  s += onT(F, 0.5, 0.42, zt, ell(24, 14, 22, 10, PINK, { sw: 1.4 }) + ell(24, 14, 16, 6.6, PINK_L, { ns: 1 }) + star(24, 14, 4.4, WHITE, { sw: 0.8 }));
  s += box(F, 0.72, v1, 1.28, 1.9, 0, 7, WOOD_L, { lf: palletFace(0.56 * 32, 7), rf: palletFace((1.9 - v1) * 32, 7), top: '#edc48c', sw: 1.6 });
  // The big speaker at the back right, a monitor wedge at the front left.
  const cone = (x, y, r) => circ(x, y, r, '#5a5160', { sw: 1.4 }) + circ(x, y, r * 0.55, RUBBER, { sw: 1 }) + circ(x - r * 0.2, y - r * 0.25, r * 0.18, '#8a8090', { ns: 1 });
  s += box(F, 1.3, 0.18, 1.82, 0.66, zt, 42, '#4a4250', { lf: cone(8.3, 29, 6.6) + cone(8.3, 12, 4.2) + rect(1.5, 2, 13.6, 1.6, PINK, { ns: 1 }), top: PINK, sw: 2 });
  s += onR(F, 1.82, 0.66, zt + 42, star(7.6, 21, 4.6, PINK, { sw: 1 }));
  s += box(F, 0.26, 1.02, 0.62, 1.38, zt, 9, '#4a4250', { lf: cone(5.8, 4.6, 3), top: '#5a5160', sw: 1.6 });
  // A mic stand at the performer's side.
  const [mx, my] = F.p(1.36, 1.02, zt);
  s += ell(mx, my, 4, 2, STEEL_D, { sw: 1.2 }) + stick(`${M(mx, my)}V${N(my - 26)}l-5 -4`, STEEL, 1.4, 1.6) + rect(mx - 9.5, my - 35, 4, 6.5, '#5a5160', { rx: 2, sw: 1.2, tf: `rotate(-35 ${N(mx - 7.5)} ${N(my - 32)})` });
  // Bunting and bulbs between the posts.
  const a = [pa[0], pa[1] - 74];
  const b = [pb[0], pb[1] - 74];
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 26];
  s += line(`${M(a[0], a[1])}${Q(c[0], c[1], b[0], b[1])}`, O, 1.3);
  const qp = (t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  for (let i = 0; i < 10; i++) {
    const [px, py] = qp((i + 0.5) / 10);
    s += path(`${M(px - 4.5, py)}h9l-4.5 9Z`, CONFETTI[i % 6], { sw: 1.2 });
  }
  for (let i = 1; i < 10; i++) {
    const [px, py] = qp(i / 10);
    s += bulb(px, py - 1, 1.6, '#fff4b8', i);
  }
  return out(F, s, 'ls-set-party', 70, 'stage', [{ u: 1.0, v: 0.8, z: 50, r: 36, color: '#ff9ad0' }]);
}

/** A mirror ball centred (x, y), radius r: facets in rows, candy reflections. */
function mirrorBall(x, y, r) {
  const cols = ['#eef2f6', '#c6ced8', '#ffffff', '#9fadbd', '#ffb3d9', '#a8f0dc', '#fff0a0', '#bfe0ff'];
  const by = cols.map(() => '');
  const st = 4;
  let k = 0;
  for (let yy = -r + st / 2; yy < r - 1; yy += st) {
    const w = Math.sqrt(Math.max(0, r * r - (yy + st / 2) * (yy + st / 2)));
    for (let xx = -w + 0.6; xx < w - 2.2; xx += st) {
      const ci = (k * 5 + Math.round(yy) * 3) % 13;
      by[ci < 8 ? ci % 4 : 4 + (ci % 4)] += `M${N(x + xx)} ${N(y + yy)}h3.4v3.4h-3.4z`;
      k++;
    }
  }
  let s = circ(x, y, r, '#8a97a8', { sw: 2 });
  s += by.slice(0, 4).map((d, i) => (d ? path(d, cols[i], { ns: 1 }) : '')).join('') + g(by.slice(4).map((d, i) => (d ? path(d, cols[i + 4], { ns: 1 }) : '')).join(''), { cls: 'dc-disco' });
  s += path(`${M(x, y - r)}A${N(r)} ${N(r)} 0 0 1 ${N(x)} ${N(y + r)}A${N(r * 0.55)} ${N(r)} 0 0 0 ${N(x)} ${N(y - r)}Z`, O, { ns: 1, op: 0.16 });
  s += circ(x - r * 0.4, y - r * 0.4, r * 0.22, '#ffffff', { ns: 1, op: 0.9 }) + circ(x, y, r, 'none', { sw: 2 });
  return s;
}

function disco() {
  const F = frame(1, 156);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = '';
  // Light spots on the grass.
  for (const [dx, dy, c] of [[-20, -2, PINK], [16, -6, MINT], [-8, 7, LEMON], [20, 5, BLUE_L], [4, -9, LILAC]]) s += ell(cx + dx, cy + dy, NITE ? 4.6 : 3.4, NITE ? 2.3 : 1.7, c, { ns: 1, op: NITE ? 0.95 : 0.8 });
  s += cyl(F, 0.5, 0.5, 0.2, 0, 6, PINK, { top: PINK_L });
  const top = cy - 92;
  const py = cy - 6;
  // Candy-striped pole and a little gold hook.
  s += rect(cx - 2.8, top, 5.6, py - top, WHITE, { sw: 1.8 });
  let st = '';
  for (let y = top + 3; y < py - 2; y += 8) st += `M${N(cx - 2.8)} ${N(y + 4)}L${N(cx + 2.8)} ${N(y)}v3.4L${N(cx - 2.8)} ${N(y + 7.4)}Z`;
  s += path(st, PINK, { ns: 1 }) + rect(cx - 2.8, top, 5.6, py - top, 'none', { sw: 1.8 }) + rect(cx + 0.6, top, 2.2, py - top, O, { ns: 1, op: 0.12 });
  s += circ(cx, top - 1, 3, GOLD, { sw: 1.3 }) + line(`${M(cx, top - 4)}V${N(top - 8)}`, O, 1.4);
  const by = top - 22;
  s += rect(cx - 3, by - 16.5, 6, 3.4, STEEL, { sw: 1.2 });
  s += halo(cx, by, 24, '#ffd6f4', 0.4) + mirrorBall(cx, by, 14);
  // Rays and sparkles.
  s += line(`${M(cx - 18, by + 4)}l-8 4M${N(cx + 18)} ${N(by - 2)}l8 -3M${N(cx - 15)} ${N(by - 12)}l-6 -5M${N(cx + 14)} ${N(by + 12)}l6 4`, LEMON, 1.6, { op: 0.9 });
  s += sparkle(cx - 20, by - 14, 4.4) + sparkle(cx + 21, by + 10, 3.6, PINK_L) + sparkle(cx + 18, by - 20, 2.6, MINT);
  return out(F, s, 'ls-set-party ls-rare', 126, 'disco', [{ u: 0.5, v: 0.5, z: 112, r: 30, color: '#ffc2f0' }]);
}

function windmill() {
  const F = frame(2, 164);
  const FELT = '#5fd35a';
  const bw = 1.88 * 32;
  const stripes = (w, h) => {
    let d = '';
    for (let x = 2; x < w; x += 8) d += `M${N(x)} 0h4l-3 ${h}h-4Z`;
    return path(d, WHITE, { ns: 1 });
  };
  let s = box(F, 0.06, 0.06, 1.94, 1.94, 0, 6, PINK, { lf: stripes(bw, 6), rf: stripes(bw, 6), top: FELT, sw: 2 });
  s += onT(F, 0.06, 0.06, 6, path(`M8 30Q8 8 30 8H52Q56 8 56 14V30Q56 38 48 40Q36 44 36 54V56H12Q8 56 8 50Z`, '#7fe07a', { ns: 1, op: 0.7 }));
  // Tapered tower, back-right of centre.
  const u0 = 0.62;
  const v0 = 0.36;
  const u1 = 1.34;
  const v1 = 1.08;
  const z0 = 6;
  const z1 = 74;
  const k = 0.12;
  const Lf = [[u0, v1, z0], [u1, v1, z0], [u1 - k, v1 - k, z1], [u0 + k, v1 - k, z1]];
  const Rf = [[u1, v1, z0], [u1, v0, z0], [u1 - k, v0 + k, z1], [u1 - k, v1 - k, z1]];
  s += face(F, Lf, WHITE, { sw: 1.8 }) + face(F, Rf, PINK_L, { sw: 1.8 }) + face(F, Rf, O, { ns: 1, op: 0.12 });
  // Pink corner trims and boards.
  s += path(pd(F, [[u1, v1, z0], [u1 - k, v1 - k, z1]], false), 'none', { sw: 4, stroke: O }) + path(pd(F, [[u1, v1, z0], [u1 - k, v1 - k, z1]], false), 'none', { sw: 2.2, stroke: PINK });
  // Tunnel arch for the ball, and a round window, on the left face.
  s += onL(F, u0, v1, z0, path('M7 0V-9Q7 -16 12.5 -16Q18 -16 18 -9V0Z', RUBBER, { sw: 1.6 }) + path('M5 0V-9Q5 -18 12.5 -18Q20 -18 20 -9V0', 'none', { sw: 3, stroke: PINK }));
  s += onR(F, u1 - 0.05, v1 - 0.06, 46, (NITE ? circ(11, 0, 7, '#ffe27a', { ns: 1, op: 0.45 }) : '') + circ(11, 0, 4, NITE ? LIT : GLASS, { sw: 1.4 }) + line('M7 0H15M11 -4V4', WHITE, 1));
  // Roof: a mint pyramid with a small overhang.
  const o = 0.06;
  const R0 = [[u0 + k - o, v0 + k - o, z1 - 2], [u1 - k + o, v0 + k - o, z1 - 2], [u1 - k + o, v1 - k + o, z1 - 2], [u0 + k - o, v1 - k + o, z1 - 2]];
  const apex = [(u0 + u1) / 2, (v0 + v1) / 2, z1 + 30];
  s += face(F, [R0[3], R0[2], apex], MINT, { sw: 1.8 }) + face(F, [R0[2], R0[1], apex], dk(MINT, 0.22), { sw: 1.8 });
  s += path(pd(F, [R0[3], R0[2], R0[1]], false), 'none', { sw: 3.2, stroke: O }) + path(pd(F, [R0[3], R0[2], R0[1]], false), 'none', { sw: 1.4, stroke: WHITE });
  const [ax, ay] = F.p(apex[0], apex[1], apex[2]);
  s += pennant(ax, ay, 16, PINK, 1, LEMON);
  // Sails on the left face (rotate about their centre).
  const blade = (rot, c) => g(rect(-3.6, -31, 7.2, 25, c, { sw: 1.4 }) + line('M-3.6 -25H3.6M-3.6 -19H3.6M-3.6 -13H3.6M0 -31V-6', '#ffffff', 0.9, { op: 0.8 }) + line('M0 -6V0', O, 2.2), { tf: `rotate(${rot})` });
  const sails = g(blade(45, PINK) + blade(135, LEMON) + blade(225, PINK) + blade(315, LEMON), { cls: 'dc-sails', style: 'transform-box:fill-box;transform-origin:center' });
  s += onL(F, (u0 + u1) / 2, v1 + 0.04, 52, sails + circ(0, 0, 3.6, GOLD, { sw: 1.4 }));
  // The hole, its flag, and a ball on the green.
  const [hx, hy] = F.p(0.5, 1.52, 6);
  s += ell(hx, hy, 5, 2.5, RUBBER, { sw: 1.4 }) + stick(`${M(hx, hy)}V${N(hy - 32)}`, WHITE, 1.4, 1.6) + path(`${M(hx + 1, hy - 32)}l13 4.5l-13 4.5Z`, LEMON, { sw: 1.3 }) + circ(hx + 5, hy - 27.5, 1.4, PINK, { ns: 1 });
  const [gx, gy] = F.p(1.32, 1.42, 6);
  s += circ(gx, gy - 2, 2.4, WHITE, { sw: 1.2 }) + ell(gx + 1, gy, 2.4, 0.8, O, { ns: 1, op: 0.15 });
  const [cxp, cyp] = F.p(1.62, 1.72, 6);
  s += stick(`${M(cxp, cyp)}L${N(cxp + 14)} ${N(cyp - 22)}`, STEEL, 1.6, 1.6) + path(`${M(cxp - 4, cyp + 1)}l5 -3l1 3l-5 1Z`, PINK, { sw: 1.1 });
  return out(F, s, 'ls-set-party ls-signature', 100, 'windmill');
}

// =============================================================================================
// LOOKOUT: blue-painted steel and white.
// =============================================================================================

function flagpole() {
  const F = frame(1, 141);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = shadowE(cx, cy, 13, 6.5);
  s += box(F, 0.28, 0.28, 0.72, 0.72, 0, 5, STEEL, { top: STEEL_L, sw: 1.6 });
  s += box(F, 0.36, 0.36, 0.64, 0.64, 5, 6, BLUE, { top: BLUE_L, sw: 1.6 });
  const top = cy - 116;
  s += stick(`${M(cx, cy - 11)}V${N(top)}`, STEEL_L, 3, 2.2) + line(`${M(cx + 0.8, cy - 12)}V${N(top + 2)}`, STEEL_D, 0.9, { op: 0.5 });
  s += line(`${M(cx + 2.4, top + 3)}V${N(cy - 30)}`, '#e8e2d6', 0.9) + rect(cx + 1.4, cy - 32, 3, 4, STEEL_D, { sw: 0.9 });
  s += circ(cx, top - 2, 3.4, GOLD, { sw: 1.4 });
  // The flag: blue with a white star and stripe, waving right.
  const fx = cx + 2;
  const fy = top + 3;
  const fl = `${M(fx, fy)}${Q(fx + 8, fy - 4, fx + 15, fy)}${Q(fx + 22, fy + 4, fx + 29, fy)}L${N(fx + 29)} ${N(fy + 21)}${Q(fx + 22, fy + 25, fx + 15, fy + 21)}${Q(fx + 8, fy + 17, fx, fy + 21)}Z`;
  s += g(path(fl, BLUE, { sw: 1.8 }) + path(`${M(fx + 15, fy)}${Q(fx + 22, fy + 4, fx + 29, fy)}L${N(fx + 29)} ${N(fy + 21)}${Q(fx + 22, fy + 25, fx + 15, fy + 21)}Z`, BLUE_D, { ns: 1, op: 0.5 }) + path(`${M(fx, fy + 15)}${Q(fx + 8, fy + 11, fx + 15, fy + 15)}${Q(fx + 22, fy + 19, fx + 29, fy + 15)}v2.6${Q(fx + 22, fy + 21.6, fx + 15, fy + 17.6)}${Q(fx + 8, fy + 13.6, fx, fy + 17.6)}Z`, WHITE, { ns: 1 }) + star(fx + 12, fy + 7.5, 5, WHITE, { sw: 1.1 }) + path(fl, 'none', { sw: 1.8 }), { cls: 'dc-flag', style: pivot(fx, fy + 10) });
  return out(F, s, 'ls-set-lookout', 112, 'flagpole');
}

function searchlight() {
  // Aimed up and left; by day a faint beam, at night a bright one with a white core.
  const F = frame(1, 101);
  const [cx, cy] = F.p(0.5, 0.5);
  const yellow = '#ffd23a';
  let s = shadowE(cx, cy, 18, 9);
  const hz = line([1, 2, 3, 4].map((k) => `M${N(k * 4.4 - 2)} 0l-3 6`).join(''), O, 1.4, { op: 0.8 });
  s += box(F, 0.22, 0.22, 0.78, 0.78, 0, 8, BLUE, { top: STEEL_L, lf: rect(0, 0, 17.9, 2.4, yellow, { ns: 1 }) + hz, rf: rect(0, 0, 17.9, 2.4, yellow, { ns: 1 }) + hz, sw: 1.8 });
  s += cyl(F, 0.5, 0.5, 0.2, 8, 4, STEEL, { top: STEEL_L });
  const px = cx + 7;
  const py = cy - 34;
  // The yoke.
  s += stick(`${M(px - 13, py)}V${N(cy - 18)}${Q(px - 13, cy - 13, px - 8, cy - 13)}H${N(px + 8)}${Q(px + 13, cy - 13, px + 13, cy - 18)}V${N(py)}`, BLUE, 3.2, 2.2);
  // The beam (it sweeps; pivot on the lens), then the drum.
  const rot = 58;
  const ra = (rot * Math.PI) / 180;
  const T = (x, y) => [px + x * Math.cos(ra) - y * Math.sin(ra), py + x * Math.sin(ra) + y * Math.cos(ra)];
  const bl = NITE ? 47 : 43;
  const bw = NITE ? 14 : 12;
  s += path(poly([T(-13, -10), T(-bl, -bw), T(-bl, bw), T(-13, 10)]), NITE ? '#fff6c8' : LIT, { ns: 1, op: NITE ? 0.5 : 0.3, cls: 'dc-beam', style: pivot(...T(-12, 0)) });
  if (NITE) s += path(poly([T(-13, -6), T(-bl, -bw * 0.45), T(-bl, bw * 0.45), T(-13, 6)]), '#ffffff', { ns: 1, op: 0.45, cls: 'dc-beam', style: pivot(...T(-12, 0)) });
  s += g(path('M-12 -10H10A4.4 10 0 0 1 10 10H-12Z', BLUE, { sw: 1.8 }) + path('M-12 4H10A4.4 10 0 0 1 10 10H-12Z', BLUE_D, { ns: 1, op: 0.55 }) + rect(-4, -10.8, 3.4, 21.6, STEEL_L, { sw: 1.2 }) + rect(4, -10.8, 2.4, 21.6, STEEL_L, { sw: 1.2 }) + line('M-10 -6.5H8', '#ffffff', 1.2, { op: 0.6 }) + ell(-12, 0, 4.4, 11, STEEL, { sw: 1.6 }) + ell(-12, 0, 3.2, 8.6, NITE ? '#fffbe0' : LIT, { sw: 1.2 }) + ell(-12.6, -2.6, 1.2, 3, '#ffffff', { ns: 1 }), { tf: `translate(${N(px)} ${N(py)}) rotate(${rot})` });
  s += circ(px - 13, py, 2.6, STEEL_L, { sw: 1.3 }) + circ(px + 13, py, 2.6, STEEL_L, { sw: 1.3 });
  return out(F, s, 'ls-set-lookout', 40, 'searchlight', [{ u: 0.3, v: 0.5, z: 54, r: 28, color: '#fff2a8' }]);
}

function ladder() {
  const F = frame(1, 155);
  const zp = 78;
  let s = face(F, [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]], O, { ns: 1, op: 0.12 });
  const leg = (ug, vg, up, vp) => stick(`M${xy(F, ug, vg)}L${xy(F, up, vp, zp)}`, BLUE, 3, 2);
  s += leg(0.14, 0.14, 0.28, 0.28) + leg(0.86, 0.14, 0.72, 0.28);
  // Cross bracing on the right side.
  s += line(`M${xy(F, 0.84, 0.18, 6)}L${xy(F, 0.74, 0.7, zp - 30)}M${xy(F, 0.84, 0.82, 6)}L${xy(F, 0.74, 0.3, zp - 30)}M${xy(F, 0.79, 0.25, zp - 30)}L${xy(F, 0.79, 0.75, zp - 30)}`, STEEL_D, 1.6);
  s += leg(0.14, 0.86, 0.28, 0.72) + leg(0.86, 0.86, 0.72, 0.72);
  // Deck with a grate, and back rails.
  s += box(F, 0.22, 0.22, 0.78, 0.78, zp, 5, BLUE, { top: STEEL_L, tf: line('M3 4.5H15M3 9H15M3 13.5H15', STEEL_D, 0.8, { op: 0.7 }), sw: 1.8 });
  const zr = zp + 5;
  const rail = (pts) => stick(pts.map((q, i) => (i ? 'L' : 'M') + xy(F, q[0], q[1], q[2])).join(''), WHITE, 1.6, 1.8);
  s += rail([[0.24, 0.76, zr], [0.24, 0.76, zr + 15], [0.24, 0.24, zr + 15], [0.76, 0.24, zr + 15], [0.76, 0.24, zr]]) + rail([[0.24, 0.24, zr], [0.24, 0.24, zr + 15]]);
  // A pennant at the back corner.
  const [fx, fy] = F.p(0.24, 0.24, zr + 15);
  s += pennant(fx, fy, 26, BLUE, 1, WHITE);
  // Front and right rails, binoculars on the right rail (also the front overlay: a lookout
  // standing on the deck is behind them).
  const [bx, by] = F.p(0.76, 0.42, zr + 17);
  const front = rail([[0.76, 0.24, zr + 15], [0.76, 0.76, zr + 15], [0.76, 0.76, zr]]) + rail([[0.76, 0.76, zr + 15], [0.52, 0.76, zr + 15], [0.52, 0.76, zr]]) + rail([[0.76, 0.5, zr], [0.76, 0.5, zr + 15]]) + rect(bx - 6, by - 6, 5, 7, BLUE_D, { rx: 2, sw: 1.2 }) + rect(bx, by - 7, 5, 7, BLUE_D, { rx: 2, sw: 1.2 }) + circ(bx - 3.5, by - 6, 1.6, SKY, { sw: 0.8 }) + circ(bx + 2.5, by - 7, 1.6, SKY, { sw: 0.8 });
  s += front;
  // The ladder up the front.
  const l0 = F.p(0.36, 0.95, 0);
  const l1 = F.p(0.36, 0.76, zp);
  const r0 = F.p(0.64, 0.95, 0);
  const r1 = F.p(0.64, 0.76, zp);
  s += stick(`${M(l0[0], l0[1])}L${N(l1[0])} ${N(l1[1])}M${N(r0[0])} ${N(r0[1])}L${N(r1[0])} ${N(r1[1])}`, STEEL_L, 2, 1.8);
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    const a = [l0[0] + (l1[0] - l0[0]) * t, l0[1] + (l1[1] - l0[1]) * t];
    const b = [r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t];
    s += stick(`${M(a[0], a[1])}L${N(b[0])} ${N(b[1])}`, STEEL_L, 1.6, 1.6);
  }
  return out(F, s, 'ls-set-lookout', 120, 'ladder', [], { front });
}

function scarecrow() {
  const F = frame(1, 113);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = shadowE(cx, cy, 12, 5);
  const arms = cy - 58;
  // Post and crossbar.
  s += stick(`${M(cx, cy)}V${N(cy - 70)}`, WOOD_D, 3.6, 2.2) + stick(`${M(cx - 23, arms)}H${N(cx + 23)}`, WOOD_D, 3, 2);
  // Dangling zombie legs in mismatched socks.
  const ly = cy - 36;
  s += stick(`${M(cx - 4, ly)}L${N(cx - 6)} ${N(ly + 16)}`, ZSKIN, 2.6, 2) + stick(`${M(cx + 4, ly)}L${N(cx + 6)} ${N(ly + 15)}`, ZSKIN, 2.6, 2);
  s += rect(cx - 8.5, ly + 9, 5, 6, RED, { sw: 1.2 }) + line(`${M(cx - 8.5, ly + 11.5)}h5`, WHITE, 1.2) + rect(cx + 3.5, ly + 8, 5, 6, BLUE_L, { sw: 1.2 });
  s += ell(cx - 7.5, ly + 16.5, 3.6, 2, RUBBER, { sw: 1.1 }) + ell(cx + 7, ly + 15.5, 3.6, 2, RUBBER, { sw: 1.1 });
  // Blue shirt with sleeves along the bar, green hands.
  s += path(`${M(cx - 22, arms - 5)}H${N(cx + 22)}V${N(arms + 5)}H${N(cx + 9)}L${N(cx + 9)} ${N(ly - 2)}H${N(cx - 9)}L${N(cx - 9)} ${N(arms + 5)}H${N(cx - 22)}Z`, BLUE, { sw: 1.8 });
  s += path(`${M(cx + 1, arms - 5)}H${N(cx + 22)}V${N(arms + 5)}H${N(cx + 9)}L${N(cx + 9)} ${N(ly - 2)}H${N(cx + 1)}Z`, BLUE_D, { ns: 1, op: 0.45 });
  s += line(`${M(cx - 16, arms - 5)}V${N(arms + 5)}M${N(cx + 16)} ${N(arms - 5)}V${N(arms + 5)}M${N(cx - 9)} ${N(arms + 1)}H${N(cx + 9)}`, BLUE_L, 1.2, { op: 0.8 }) + rect(cx - 6, arms + 4, 6, 5, MUSTARD, { sw: 1, tf: `rotate(-8 ${N(cx - 3)} ${N(arms + 6.5)})` });
  for (const d of [-1, 1]) {
    const hx = cx + d * 25;
    s += line(`${M(hx - d * 2, arms - 2)}l${d * 4} -3M${N(hx - d * 2)} ${N(arms + 2)}l${d * 4} 3`, '#e8c860', 1.6) + circ(hx, arms, 3.6, ZSKIN, { sw: 1.4 }) + line(`${M(hx + d * 2.5, arms - 2)}l${d * 2.4} -1M${N(hx + d * 2.8)} ${N(arms + 0.5)}l${d * 2.4} 0`, ZSKIN, 1.6);
  }
  // The tutu: two frilly pink layers.
  const ty = ly - 1;
  const frill = (w, y, c, n) => {
    let d = `${M(cx - w, y)}`;
    for (let i = 0; i < n; i++) d += `Q${N(cx - w + ((i + 0.5) * 2 * w) / n)} ${N(y + 6)} ${N(cx - w + ((i + 1) * 2 * w) / n)} ${N(y)}`;
    return path(`${d}${Q(cx, y - 7, cx - w, y)}Z`, c, { sw: 1.5 });
  };
  s += frill(17, ty + 1, PINK_L, 7) + frill(13, ty - 1, PINK, 6) + circ(cx - 6, ty, 0.9, WHITE, { ns: 1 }) + circ(cx + 5, ty + 1, 0.9, WHITE, { ns: 1 }) + circ(cx, ty - 2, 0.9, LEMON, { ns: 1 });
  // The sack head: zombie green, stitched, button eyes of two sizes, straw hair, a straw hat.
  const hy = arms - 15;
  s += line(`${M(cx - 9, hy - 7)}l-4 -2M${N(cx + 9)} ${N(hy - 7)}l4 -2M${N(cx - 10)} ${N(hy - 3)}l-4 0`, '#e8c860', 1.6);
  s += circ(cx, hy, 11, ZSKIN, { sw: 2 }) + path(`${M(cx + 3, hy - 10.5)}A11 11 0 0 1 ${N(cx + 3)} ${N(hy + 10.5)}A9 11 0 0 0 ${N(cx + 3)} ${N(hy - 10.5)}Z`, ZSHADE, { ns: 1, op: 0.6 });
  s += line(`${M(cx - 9, hy + 9)}${Q(cx, hy + 12, cx + 9, hy + 9)}`, '#c9b27a', 3) + line(`${M(cx - 7, hy + 9.6)}l1 2M${N(cx - 3)} ${N(hy + 10.6)}l1 2M${N(cx + 1)} ${N(hy + 10.8)}l1 2M${N(cx + 5)} ${N(hy + 10)}l1 2`, O, 0.9);
  s += circ(cx - 4, hy - 1.5, 4, WHITE, { sw: 1.4 }) + circ(cx - 3.4, hy - 1, 1.8, O, { ns: 1 }) + circ(cx + 5, hy - 0.5, 2.6, WHITE, { sw: 1.3 }) + circ(cx + 5.4, hy, 1.2, O, { ns: 1 });
  s += path(`${M(cx - 5, hy + 5)}l2.2 1.4l2.2 -1.4l2.2 1.4l2.2 -1.4l2 1.2`, 'none', { sw: 1.2 });
  s += path(`${M(cx - 16, hy - 8)}${Q(cx, hy - 14, cx + 16, hy - 8)}${Q(cx, hy - 4, cx - 16, hy - 8)}Z`, '#e8c860', { sw: 1.6 }) + path(`${M(cx - 8, hy - 10)}${Q(cx - 8, hy - 21, cx, hy - 21)}${Q(cx + 8, hy - 21, cx + 8, hy - 10)}${Q(cx, hy - 8, cx - 8, hy - 10)}Z`, '#e8c860', { sw: 1.6 }) + path(`${M(cx - 8, hy - 12)}${Q(cx, hy - 10, cx + 8, hy - 12)}v-2.6${Q(cx, hy - 12.6, cx - 8, hy - 14.6)}Z`, BLUE, { ns: 1 });
  // A crow on the left arm.
  const bx = cx + 17;
  const by = arms - 5;
  s += path(`${M(bx + 6, by)}${Q(bx + 6, by - 8, bx, by - 8)}${Q(bx - 6, by - 8, bx - 7, by - 1)}L${N(bx - 12)} ${N(by + 1)}L${N(bx - 5)} ${N(by + 1)}Z`, '#4a4250', { sw: 1.4 }) + path(`${M(bx + 3, by - 4)}${Q(bx - 1, by - 5, bx - 4, by - 1)}`, 'none', { sw: 1, stroke: '#7a7080' }) + circ(bx + 4.4, by - 8.4, 3.6, '#4a4250', { sw: 1.4 }) + path(`${M(bx + 7.6, by - 9.4)}l4 1.4l-3.8 1.4Z`, ORANGE, { sw: 1 }) + circ(bx + 5, by - 9.4, 1.3, WHITE, { ns: 1 }) + circ(bx + 5.3, by - 9.3, 0.6, O, { ns: 1 }) + line(`${M(bx - 1, by + 1)}v3M${N(bx + 2)} ${N(by + 1)}v3`, ORANGE, 1);
  s += sparkle(cx + 20, hy - 14, 3.6) + sparkle(cx - 22, hy - 4, 2.8, PINK_L);
  return out(F, s, 'ls-set-lookout ls-rare', 84, 'scarecrow');
}

function rocketslide() {
  const F = frame(2, 170);
  const ru = 0.76;
  const rv = 0.6;
  const r = 0.36;
  const zb = 10;
  const zt = 74;
  const [cx, cy] = F.p(ru, rv);
  let s = shadowE(cx - 4, cy + 6, 44, 20);
  const fin = (dir) => path(dir > 0 ? 'M0 -36L17 -8L19 10L7 10L0 2Z' : 'M0 -36L-17 -8L-19 10L-7 10L0 2Z', BLUE, { sw: 1.8 });
  // Back fins (−u and −v), body, nose, front fins.
  s += onL(F, ru - r * 0.95, rv, zb, fin(-1)) + onR(F, ru, rv - r * 0.95, zb, fin(-1));
  s += cyl(F, ru, rv, r, zb, zt - zb, WHITE, { top: 'none', sw: 2 });
  const rx = r * RX;
  const ry = r * RY;
  const yt = cy - zt;
  const band = (z, h, c) => path(`${M(cx - rx, cy - z)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(cy - z)}V${N(cy - z - h)}A${N(rx)} ${N(ry)} 0 0 1 ${N(cx - rx)} ${N(cy - z - h)}Z`, c, { sw: 1.4 });
  s += band(zb, 9, BLUE) + band(zt - 4, 4, STEEL_L);
  s += path(`${M(cx, yt + ry)}V${N(cy - zb + ry)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(cy - zb)}V${N(yt)}A${N(rx)} ${N(ry)} 0 0 1 ${N(cx)} ${N(yt + ry)}Z`, O, { ns: 1, op: 0.13 });
  s += line(`${M(cx - rx + 4, cy - zb - 12)}V${N(yt + 6)}`, '#ffffff', 2, { op: 0.8 });
  // Nose cone.
  const nh = 32;
  const nose = `${M(cx - rx, yt)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(yt)}${Q(cx + rx * 0.7, yt - nh * 0.72, cx, yt - nh)}${Q(cx - rx * 0.7, yt - nh * 0.72, cx - rx, yt)}Z`;
  s += path(nose, BLUE, { sw: 2 }) + path(`${M(cx, yt + ry)}A${N(rx)} ${N(ry)} 0 0 0 ${N(cx + rx)} ${N(yt)}${Q(cx + rx * 0.7, yt - nh * 0.72, cx, yt - nh)}Z`, BLUE_D, { ns: 1, op: 0.5 }) + line(`${M(cx - rx + 5, yt - 4)}${Q(cx - rx * 0.5, yt - nh * 0.62, cx - 2, yt - nh * 0.85)}`, BLUE_L, 1.6, { op: 0.9 });
  s += line(`${M(cx, yt - nh)}V${N(yt - nh - 8)}`, O, 1.6) + circ(cx, yt - nh - 9, 2.4, '#ff6a5a', { sw: 1.1 });
  // A porthole (lit at night) and a star.
  const pz = zt - 18;
  s += circ(cx + 5, cy - pz, 8, STEEL_L, { sw: 1.6 }) + circ(cx + 5, cy - pz, 6, NITE ? LIT : '#7fc8ff', { sw: 1.2 }) + circ(cx + 3.2, cy - pz - 2, 1.8, '#ffffff', { ns: 1 });
  s += star(cx + 9, cy - 30, 5, GOLD, { sw: 1.2 });
  s += onL(F, ru + r * 0.95, rv, zb, fin(1));
  // Ladder up the right side.
  const zl = 50;
  const a0 = F.p(ru + r + 0.3, rv - 0.12, 0);
  const a1 = F.p(ru + r + 0.02, rv - 0.12, zl);
  const b0 = F.p(ru + r + 0.3, rv + 0.12, 0);
  const b1 = F.p(ru + r + 0.02, rv + 0.12, zl);
  s += stick(`${M(a0[0], a0[1])}L${N(a1[0])} ${N(a1[1])}M${N(b0[0])} ${N(b0[1])}L${N(b1[0])} ${N(b1[1])}`, STEEL_L, 2, 1.8);
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    s += stick(`${M(a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t)}L${N(b0[0] + (b1[0] - b0[0]) * t)} ${N(b0[1] + (b1[1] - b0[1]) * t)}`, STEEL_L, 1.6, 1.6);
  }
  // The front fin (toward the viewer).
  s += onR(F, ru, rv + r * 0.95, zb, fin(-1));
  // The slide: out of a hatch on the front-left, curving down toward the front-left side.
  const dl = Math.hypot(0.26, 1);
  const d = [-0.26 / dl, 1 / dl];
  const pv = [d[1], -d[0]];
  const h0 = [ru + d[0] * (r + 0.02), rv + d[1] * (r + 0.02)];
  const len = 0.8;
  const zh = 40;
  const sw = 0.2;
  const at = (t, side) => [h0[0] + d[0] * len * t + pv[0] * sw * side, h0[1] + d[1] * len * t + pv[1] * sw * side];
  const edge = (side) => {
    const o = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const [u, v] = at(t, side);
      o.push(F.p(u, v, 3 + zh * Math.pow(1 - t, 2.2)));
    }
    return o;
  };
  const A = edge(-1);
  const B = edge(1);
  const [hx, hy] = F.p(h0[0], h0[1], zh + 12);
  s += path(`${M(hx - 10, hy + 6)}V${N(hy - 5)}${Q(hx - 10, hy - 15, hx, hy - 15)}${Q(hx + 10, hy - 15, hx + 10, hy - 5)}V${N(hy + 6)}Z`, STEEL_L, { sw: 1.6 }) + path(`${M(hx - 7, hy + 6)}V${N(hy - 4)}${Q(hx - 7, hy - 12, hx, hy - 12)}${Q(hx + 7, hy - 12, hx + 7, hy - 4)}V${N(hy + 6)}Z`, NITE ? '#c98a2a' : '#2f3a55', { sw: 1.2 });
  // A landing mat, legs, then the chute: back rail, bed, front rail.
  const m0 = at(0.96, -1.5);
  const m1 = at(0.96, 1.5);
  s += face(F, [[m0[0], m0[1]], [m1[0], m1[1]], [m1[0] + d[0] * 0.2, m1[1] + d[1] * 0.2], [m0[0] + d[0] * 0.2, m0[1] + d[1] * 0.2]], '#ff7a2a', { sw: 1.4 });
  for (const i of [3, 6]) {
    const g0 = at(i / 10, -1);
    const g1 = at(i / 10, 1);
    s += stick(`${M(A[i][0], A[i][1])}V${N(F.p(g0[0], g0[1])[1])}M${N(B[i][0])} ${N(B[i][1])}V${N(F.p(g1[0], g1[1])[1])}`, STEEL, 1.6, 1.6);
  }
  s += stick(poly(A, false), BLUE, 2.6, 2);
  s += path(poly(A.concat(B.slice().reverse())), STEEL_L, { sw: 1.4 });
  s += line(poly(A.map(([x, y], i) => [x + (B[i][0] - x) * 0.3, y + (B[i][1] - y) * 0.3]), false), '#ffffff', 1.8, { op: 0.85 }) + path(poly(A.map(([x, y], i) => [x + (B[i][0] - x) * 0.65, y + (B[i][1] - y) * 0.65]).concat(B.slice().reverse())), STEEL, { ns: 1, op: 0.45 });
  s += stick(poly(B, false), BLUE, 2.6, 2);
  // Launch puffs at the base.
  s += puff(cx + 28, cy + 6, 1.3, WHITE, 'dc-smoke') + puff(cx + 40, cy - 6, 1, WHITE, 'dc-smoke', 0.92, -0.9) + puff(cx - 32, cy - 2, 1.05, WHITE, 'dc-smoke', 0.92, -1.7);
  return out(F, s, 'ls-set-lookout ls-signature', 94, 'rocketslide');
}

// =============================================================================================
// KEEPSAKES: a notch fancier, each with a small gold name plate.
// =============================================================================================

function jukebox() {
  const F = frame(1, 72);
  const u0 = 0.15;
  const u1 = 0.85;
  const v0 = 0.38;
  const v1 = 0.7;
  const w = (u1 - u0) * 32;
  const hb = 34;
  const rr = w / 2;
  const prof = [[u0, 0], [u1, 0], [u1, hb]];
  for (let i = 1; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    prof.push([(u0 + u1) / 2 + (Math.cos(a) * rr) / 32, hb + Math.sin(a) * rr]);
  }
  prof.push([u0, hb]);
  let s = face(F, [[0.12, 0.3], [0.9, 0.3], [0.9, 0.82], [0.12, 0.82]], O, { ns: 1, op: 0.13 });
  s += prism(F, 'v', prof, v0, v1, '#c8403a', { top: '#e8705f', shade: '#8f2b28' });
  // Front: rainbow neon arch, record window, gold grille, chrome base, name plate.
  const cxl = w / 2;
  const cyl0 = -hb;
  const arch = (r, c, wd) => line(`M${N(cxl - r)} ${N(-8)}V${N(cyl0)}A${N(r)} ${N(r)} 0 0 1 ${N(cxl + r)} ${N(cyl0)}V-8`, c, wd);
  let f = (NITE ? arch(rr - 1.6, '#fff0a0', 9).replace('fill="none"', 'fill="none" opacity="0.35"') : '') + arch(rr - 1.6, O, 4.6) + arch(rr - 1.6, NITE ? '#fff7c0' : LEMON, 2.4) + arch(rr - 4.4, '#ff6a5a', 1.8) + arch(rr - 6.4, MINT, 1.6);
  f += rect(cxl - 5.6, -42, 11.2, 9, '#2f3a55', { sw: 1.2, rx: 2 }) + ell(cxl, -37.5, 4, 2.4, RUBBER, { sw: 0.8 }) + circ(cxl, -37.5, 1, '#ff6a5a', { ns: 1 });
  f += rect(cxl - 5.6, -31, 11.2, 11, GOLD, { sw: 1.2, rx: 1 }) + line(`M${N(cxl - 3.8)} -28.5V-22.5M${N(cxl - 1.3)} -28.5V-22.5M${N(cxl + 1.3)} -28.5V-22.5M${N(cxl + 3.8)} -28.5V-22.5`, GOLD_DD, 1);
  f += rect(0, -5, w, 5, STEEL_L, { sw: 1.2 }) + plate(cxl - 9.6, -15.5, 19.2, 7.6);
  s += onL(F, u0, v1, 0, f);
  s += sparkle(...F.p(0.86, 0.3, 52), 3.4);
  return out(F, s, 'ls-keepsake', 44, 'jukebox', [{ u: 0.5, v: 0.72, z: 34, r: 22, color: '#ffb0d8' }]);
}

function arcade() {
  const F = frame(1, 92);
  const u0 = 0.26;
  const u1 = 0.74;
  const vb = 0.32;
  const vf = 0.72;
  const prof = [[vb, 0], [vf, 0], [vf, 27], [vf + 0.08, 30], [vf - 0.02, 33], [vf - 0.14, 52], [vf + 0.02, 54], [vf + 0.02, 66], [vb, 66]];
  const body = '#5b3fc4';
  let s = face(F, [[0.16, 0.24], [0.84, 0.24], [0.84, 0.84], [0.16, 0.84]], O, { ns: 1, op: 0.13 });
  s += prism(F, 'u', prof, u0, u1, body, { top: '#8a6ff0', cap: dk(body, 0.25), facets: true, isw: 1.4 });
  // Side art on the right panel: a pink lightning stripe.
  s += onR(F, u1, vf, 0, path('M2 -20L9 -36L7 -28L13 -30L6 -12L8 -20Z', PINK, { sw: 1.1 }) + line('M1 -4H12.8', LEMON, 2));
  // Screen on the slanted face, marquee, controls, plate.
  const scr = [F.p(u0, vf - 0.02, 33), F.p(u1, vf - 0.02, 33), F.p(u1, vf - 0.14, 52), F.p(u0, vf - 0.14, 52)];
  s += path(subq(scr, 0.1, 0.08, 0.9, 0.9), '#1d2a4a', { sw: 1.2 }) + path(subq(scr, 0.2, 0.2, 0.8, 0.8), NITE ? '#7fb0ff' : '#3a6ff0', { ns: 1, op: NITE ? 0.85 : 0.55 });
  const [zx, zy] = qpt(scr, 0.5, 0.5);
  s += circ(zx, zy, 2.6, ZSKIN, { ns: 1 }) + circ(zx - 0.8, zy - 0.4, 0.7, WHITE, { ns: 1 }) + circ(zx + 4, zy + 3, 0.8, LEMON, { ns: 1 }) + circ(zx - 4.4, zy + 2.6, 0.8, PINK, { ns: 1 });
  const mq = [F.p(u0, vf + 0.02, 66), F.p(u1, vf + 0.02, 66), F.p(u1, vf + 0.02, 54), F.p(u0, vf + 0.02, 54)];
  s += path(subq(mq, 0.08, 0.15, 0.92, 0.85), LIT, { sw: 1 }) + path(subq(mq, 0.2, 0.42, 0.42, 0.62), PINK, { ns: 1 }) + path(subq(mq, 0.5, 0.42, 0.8, 0.62), BLUE, { ns: 1 });
  const [jx, jy] = F.p(0.4, vf + 0.02, 31);
  s += stick(`${M(jx, jy)}V${N(jy - 5)}`, STEEL_D, 1.2, 1.4) + circ(jx, jy - 6, 2.2, RED, { sw: 1.1 });
  const [kx, ky] = F.p(0.58, vf + 0.03, 31);
  s += ell(kx, ky, 1.8, 1, LEMON, { sw: 0.9 }) + ell(kx + 4, ky + 2, 1.8, 1, MINT, { sw: 0.9 });
  s += onL(F, u0, vf, 17, plate(0.6, 0, 14.2, 7) + rect(5, 10, 5.4, 3, RUBBER, { ns: 1 }));
  return out(F, s, 'ls-keepsake', 58, 'arcade', [{ u: 0.5, v: 0.7, z: 44, r: 18, color: '#a8c8ff' }]);
}

function grill() {
  const F = frame(1, 82);
  const [cx, cy] = F.p(0.5, 0.5);
  const bz = 30;
  const by = cy - bz;
  const rx = 16;
  const ry = 8;
  let s = shadowE(cx, cy, 16, 8);
  // Legs (back, then front pair with wheels).
  s += stick(`${M(cx + 1, by + 8)}L${N(cx + 3)} ${N(cy - 5)}`, RUBBER, 1.8, 1.6);
  s += stick(`${M(cx - 7, by + 10)}L${N(cx - 13)} ${N(cy + 2)}M${N(cx + 7)} ${N(by + 10)}L${N(cx + 13)} ${N(cy + 2)}`, RUBBER, 2, 1.6) + line(`${M(cx - 11, cy - 6)}H${N(cx + 11)}`, RUBBER, 1.4);
  s += circ(cx - 13, cy + 2, 2.8, '#5a5160', { sw: 1.2 }) + circ(cx + 13, cy + 2, 2.8, '#5a5160', { sw: 1.2 });
  // The lid hangs on the right side.
  s += ell(cx + rx + 3, by + 2, 5.6, 12.5, RED, { sw: 1.8 }) + ell(cx + rx + 4.6, by + 3, 3.4, 10, dk(RED, 0.25), { ns: 1 }) + stick(`${M(cx + rx + 9, by - 2)}v8`, RUBBER, 1.8, 1.4);
  // The kettle bowl.
  s += path(`${M(cx - rx, by)}A${rx} ${rx * 0.9} 0 0 0 ${N(cx + rx)} ${N(by)}Z`, RED, { sw: 2 }) + path(`${M(cx + 2, by + 14)}A${rx} ${rx * 0.9} 0 0 0 ${N(cx + rx)} ${N(by)}H${N(cx + 6)}Z`, dk(RED, 0.25), { ns: 1, op: 0.8 }) + line(`${M(cx - rx + 4, by + 5)}${Q(cx - rx + 6, by + 10, cx - 6, by + 12)}`, '#ff8f84', 1.6, { op: 0.9 });
  s += ell(cx, by, rx, ry, '#4a4250', { sw: 1.8 }) + ell(cx, by + 1, rx - 2, ry - 1.6, '#2e2a33', { ns: 1 }) + ell(cx, by + 1, rx - 3, ry - 2.2, ORANGE, { ns: 1, op: NITE ? 0.75 : 0.35 });
  s += line(`${M(cx - 12, by - 2)}L${N(cx + 6)} ${N(by + 6)}M${N(cx - 8)} ${N(by - 5)}L${N(cx + 11)} ${N(by + 3)}M${N(cx - 3)} ${N(by - 7)}L${N(cx + 14)} ${N(by)}`, STEEL_L, 0.9);
  // Food: two sausages and a burger.
  s += rect(cx - 10, by - 3, 10, 3.6, '#c0573a', { rx: 1.8, sw: 1.1, tf: `rotate(26 ${N(cx - 5)} ${N(by - 1.2)})` }) + rect(cx - 6, by - 6, 10, 3.6, '#c0573a', { rx: 1.8, sw: 1.1, tf: `rotate(26 ${N(cx - 1)} ${N(by - 4.2)})` });
  s += ell(cx + 6, by + 1, 5, 2.6, '#7a4228', { sw: 1.1 }) + line(`${M(cx + 3, by)}h5`, '#5a2e18', 0.8);
  // Side shelf with a spatula; the gold plate on the shelf.
  s += box(F, 0.05, 0.42, 0.28, 0.64, bz - 4, 2.4, WOOD, { top: WOOD_L, sw: 1.3 });
  s += plate(cx - 9, by + 4, 18, 7);
  // Smoke.
  s += puff(cx - 4, by - 13, 1, '#ece8e2', 'dc-smoke', 0.85) + puff(cx + 4, by - 21, 0.8, '#ece8e2', 'dc-smoke', 0.75, -1.3);
  return out(F, s, 'ls-keepsake', 37, 'grill', [{ u: 0.5, v: 0.5, z: 30, r: 16, color: '#ffb347' }]);
}

function rocker() {
  const F = frame(1, 80);
  const wood = '#a3592e';
  const wl = '#c9783f';
  let s = face(F, [[0.18, 0.16], [0.86, 0.16], [0.86, 0.9], [0.18, 0.9]], O, { ns: 1, op: 0.12 });
  // Rockers (curved runners along v), back one first.
  const run = (u) => onR(F, u, 0.88, 0, stick('M0 -4Q11 5 22.4 -5', wood, 2.6, 2));
  s += run(0.3);
  // Back legs and the back with slats.
  const zs = 15;
  const post = (u) => stick(`M${xy(F, u, 0.4, 2)}L${xy(F, u, 0.34, zs + 32)}`, wood, 2.4, 2);
  s += post(0.3) + post(0.7);
  s += face(F, [[0.3, 0.37, zs + 6], [0.7, 0.37, zs + 6], [0.7, 0.34, zs + 31], [0.3, 0.34, zs + 31]], wl, { sw: 1.4 });
  s += onL(F, 0.3, 0.37, zs + 31, line('M4 2V24M8.8 2V24M13.6 2V24', wood, 1.6) + path('M-1 -1Q6.4 -6 13.8 -1', 'none', { sw: 3.4, stroke: wood }));
  s += onL(F, 0.3, 0.37, zs + 37, plate(-0.6, -3.4, 13.8, 6));
  // A plaid blanket over the back.
  s += onL(F, 0.33, 0.39, zs + 26, plaid(10, 20) + path('M0 0H10V18L8 20L6 18L4 20L2 18L0 20Z', 'none', { sw: 1.2 }));
  // Seat, front legs, arms.
  s += stick(`M${xy(F, 0.3, 0.74, 2)}L${xy(F, 0.3, 0.72, zs)}M${xy(F, 0.7, 0.74, 2)}L${xy(F, 0.7, 0.72, zs)}`, wood, 2.4, 2);
  s += box(F, 0.28, 0.38, 0.72, 0.74, zs, 3, wl, { top: '#dd9455', sw: 1.6 });
  s += onT(F, 0.32, 0.42, zs + 3, rect(1, 1, 11, 9, MUSTARD, { rx: 3, sw: 1.2 }));
  for (const u of [0.28, 0.7]) s += box(F, u, 0.4, u + 0.04, 0.76, zs + 11, 2.4, wl, { top: '#dd9455', sw: 1.2 }) + stick(`M${xy(F, u + 0.02, 0.72, zs + 1)}L${xy(F, u + 0.02, 0.72, zs + 11)}`, wood, 1.4, 1.6);
  s += run(0.7);
  // A ball of yarn with needles.
  const [yx, yy] = F.p(0.88, 0.78, 0);
  s += circ(yx - 2, yy - 4, 4.2, PINK, { sw: 1.3 }) + line(`${M(yx - 5, yy - 6)}q3 2 6 0M${N(yx - 5.6)} ${N(yy - 3)}q3 2 6.4 -0.4`, PINK_D, 0.8) + line(`${M(yx - 6, yy - 12)}l7 9M${N(yx - 1)} ${N(yy - 13)}l1 10`, STEEL_D, 1);
  return out(F, s, 'ls-keepsake', 46, 'rocker');
}

function telescope() {
  const F = frame(1, 104);
  const [cx, cy] = F.p(0.5, 0.5);
  const hz = 40;
  const hy = cy - hz;
  const MAH = '#a8482c';
  let s = shadowE(cx, cy, 16, 8);
  const feet = [F.p(0.28, 0.28), F.p(0.3, 0.86), F.p(0.86, 0.3)];
  s += stick(`${M(cx, hy)}L${N(feet[0][0])} ${N(feet[0][1])}`, WOOD_D, 2.8, 2);
  // The tube: polished mahogany with brass rings and a brass name plate, aimed up and right.
  const tube =
    path('M-18 -4.4L26 -6.8L26 6.8L-18 4.4Z', MAH, { sw: 1.8 }) +
    path('M-18 1.6L26 2.6L26 6.8L-18 4.4Z', dk(MAH, 0.3), { ns: 1, op: 0.75 }) +
    line('M-15 -2.6L22 -4.6', '#e08a66', 1.3, { op: 0.8 }) +
    rect(-22, -3.6, 4.4, 7.2, GOLD, { sw: 1.2 }) +
    rect(-10, -5.4, 3.6, 10.8, GOLD, { sw: 1.2 }) +
    rect(18, -7.6, 5.4, 15.2, GOLD, { sw: 1.3 }) +
    ell(26.4, 0, 2.8, 7.6, GOLD, { sw: 1.3 }) +
    ell(26.8, 0, 1.7, 5.8, '#bfe6ff', { sw: 0.9 }) +
    plate(-5, -3.6, 21, 7.2);
  s += g(tube, { tf: `translate(${N(cx)} ${N(hy - 4)}) rotate(-28)` });
  s += circ(cx, hy - 2, 3.6, GOLD, { sw: 1.3 }) + circ(cx - 1, hy - 3, 1, SHINE, { ns: 1 });
  s += stick(`${M(cx, hy)}L${N(feet[1][0])} ${N(feet[1][1])}M${N(cx)} ${N(hy)}L${N(feet[2][0])} ${N(feet[2][1])}`, WOOD_D, 2.8, 2);
  s += stick(`${M(cx - 7, hy + 14)}L${N(cx + 7)} ${N(hy + 14)}`, GOLD_D, 1.4, 1.6);
  s += sparkle(cx + 26, hy - 32, 4, LEMON) + sparkle(cx + 14, hy - 42, 2.6);
  return out(F, s, 'ls-keepsake', 74, 'telescope');
}

/** A garden gnome standing on (x, y), coat colour c; tool: 'rake' | 'flag' | 'shovel'. */
function armyGnome(x, y, c, hat, k, tool) {
  const P = (dx, dy) => `${N(x + dx * k)} ${N(y + dy * k)}`;
  let s = ell(x, y, 6.4 * k, 2.2 * k, O, { ns: 1, op: 0.16 });
  // The tool, held upright on the right like a soldier's rifle.
  if (tool === 'banner') s += stick(`M${P(6, 0)}L${P(6, -31)}`, WOOD_D, 1.3, 1.6) + circ(x + 6 * k, y - 31.6 * k, 1.4, GOLD, { sw: 0.9 });
  else if (tool === 'rake') s += stick(`M${P(5.4, 0)}L${P(5.4, -23)}`, WOOD_D, 1.3, 1.6) + stick(`M${P(2.6, -23)}H${N(x + 8.2 * k)}`, STEEL_D, 1.2, 1.4);
  else s += stick(`M${P(5.4, -6)}L${P(5.4, -24)}`, WOOD_D, 1.3, 1.6) + path(`M${P(3.4, -6)}L${P(7.4, -6)}L${P(7, -1.6)}Q${P(5.4, 0.4)} ${P(3.8, -1.6)}Z`, STEEL_L, { sw: 1.1 });
  // Boots, coat, belt, beard, face, nose.
  s += path(cpath([[x - 2.6 * k, y - 0.6 * k, 2.2 * k], [x + 2.6 * k, y - 0.6 * k, 2.2 * k]]), '#5a3a22', { sw: 1.1 });
  s += path(`M${P(-5, -1)}Q${P(-5.6, -10)} ${P(0, -11)}Q${P(5.6, -10)} ${P(5, -1)}Z`, c, { sw: 1.4 }) + path(`M${P(1, -11)}Q${P(5.6, -10)} ${P(5, -1)}H${N(x + 1.4 * k)}Z`, dk(c, 0.25), { ns: 1, op: 0.6 });
  s += rect(x - 5 * k, y - 5 * k, 10 * k, 1.8 * k, '#4a3020', { ns: 1 }) + rect(x - 1 * k, y - 5.4 * k, 2 * k, 2.6 * k, GOLD, { sw: 0.8 });
  s += path(`M${P(-4.2, -11)}Q${P(-4.6, -5)} ${P(0, -3.6)}Q${P(4.6, -5)} ${P(4.2, -11)}Z`, WHITE, { sw: 1.2 });
  s += circ(x, y - 12.4 * k, 3.6 * k, '#f2c49a', { sw: 1.2 }) + circ(x - 2.2 * k, y - 11.6 * k, 0.9 * k, '#ff9a8a', { ns: 1, op: 0.8 }) + circ(x + 2.2 * k, y - 11.6 * k, 0.9 * k, '#ff9a8a', { ns: 1, op: 0.8 }) + circ(x - 1.4 * k, y - 13.8 * k, 0.6 * k, O, { ns: 1 }) + circ(x + 1.4 * k, y - 13.8 * k, 0.6 * k, O, { ns: 1 }) + circ(x, y - 12 * k, 1.5 * k, '#f0a07a', { sw: 0.9 }) + circ(x - 0.4 * k, y - 12.5 * k, 0.5 * k, '#ffffff', { ns: 1, op: 0.8 });
  // The pointy hat.
  s += path(`M${P(-5, -13.6)}L${P(0.6, -27)}L${P(5, -13.6)}Q${P(0, -15)} ${P(-5, -13.6)}Z`, hat, { sw: 1.4 }) + path(`M${P(0.6, -26)}L${P(5, -13.6)}L${P(2.4, -14)}Z`, dk(hat, 0.25), { ns: 1, op: 0.7 });
  return s;
}

function gnomes() {
  const F = frame(1, 64);
  const [cx, cy] = F.p(0.5, 0.5);
  let s = ell(cx, cy, 27, 12.5, '#8fcf5a', { ns: 1, op: 0.55 });
  // Three gnomes on parade: two behind, and the standard-bearer in front with the owner's name
  // on the gold banner.
  s += armyGnome(cx - 16, cy - 5, BLUE, RED, 1.42, 'rake') + armyGnome(cx + 16, cy - 5, MUSTARD, BLUE, 1.42, 'shovel');
  s += armyGnome(cx - 2, cy + 6, RED, MINT, 1.5, 'banner');
  const bx = cx - 2 + 6 * 1.5;
  const by = cy + 6 - 30 * 1.5;
  s += path(`${M(bx + 1, by)}H${N(bx + 21)}V${N(by + 8.6)}L${N(bx + 17)} ${N(by + 11)}L${N(bx + 13)} ${N(by + 8.6)}H${N(bx + 1)}Z`, GOLD_D, { sw: 1.2 });
  s += plate(bx + 1, by, 20, 8.6);
  return out(F, s, 'ls-keepsake', 37, 'gnomes');
}

/** A carousel horse (side view) at (x, y) = the pole point at its back; dir ±1. */
function horse(x, y, dir, col, saddle, k = 1) {
  const P = (dx, dy) => `${N(x + dx * dir * k)} ${N(y + dy * k)}`;
  let s = path(`M${P(-9, 2)}Q${P(-10, -5)} ${P(-3, -6)}L${P(5, -6)}Q${P(9, -6)} ${P(10, -12)}L${P(12, -16)}Q${P(16, -16)} ${P(17, -13)}L${P(16, -10)}Q${P(13, -10)} ${P(11, -7)}Q${P(10, 0)} ${P(6, 2)}Z`, col, { sw: 1.5 });
  s += line(`M${P(-6, 1)}L${P(-11, 7)}M${P(-2, 2)}L${P(-3, 9)}M${P(3, 2)}L${P(8, 6)}M${P(6, 1)}L${P(9, 9)}`, O, 3.4) + line(`M${P(-6, 1)}L${P(-11, 7)}M${P(-2, 2)}L${P(-3, 9)}M${P(3, 2)}L${P(8, 6)}M${P(6, 1)}L${P(9, 9)}`, col, 1.8);
  s += path(`M${P(9, -14)}Q${P(5, -14)} ${P(6, -8)}`, 'none', { sw: 2.6, stroke: PINK });
  s += path(`M${P(-9, -3)}Q${P(-14, -2)} ${P(-13, 4)}`, 'none', { sw: 2.4, stroke: PINK });
  s += path(`M${P(-3, -6)}Q${P(0, -9)} ${P(3, -6)}L${P(3, -2)}L${P(-3, -2)}Z`, saddle, { sw: 1.1 });
  s += circ(x + 13.5 * dir * k, y - 13.6 * k, 0.9, O, { ns: 1 });
  return s;
}

function carousel() {
  const F = frame(2, 164);
  const [cx, cy] = F.p(1, 1);
  const pr = 0.94;
  const zp = 10;
  const zc = 72;
  // Two candy-striped lamp posts in the side corners.
  let s = '';
  for (const [u, v] of [[0.2, 1.8], [1.8, 0.2]]) {
    const [x, y] = F.p(u, v);
    s += shadowE(x, y, 5, 2.4) + rect(x - 2.4, y - 36, 4.8, 36, WHITE, { sw: 1.6 }) + path([0, 1, 2, 3].map((k) => `M${N(x - 2.4)} ${N(y - 6 - k * 8)}l4.8 -3v3.4l-4.8 3Z`).join(''), RED, { ns: 1 }) + rect(x - 2.4, y - 36, 4.8, 36, 'none', { sw: 1.6 });
    s += rect(x - 4, y - 39, 8, 3.4, GOLD, { sw: 1.2, rx: 1 }) + halo(x, y - 44, 9, '#ffe27a', 0.5) + circ(x, y - 44, 4.6, NITE ? '#fff4b8' : '#fff1c2', { sw: 1.4 }) + circ(x - 1.4, y - 45.6, 1.3, '#ffffff', { ns: 1 });
  }
  s += shadowE(cx, cy + 2, pr * RX + 2, pr * RY + 1);
  // Platform.
  s += cyl(F, 1, 1, pr, 0, zp, RED, { top: '#f6e2c0' });
  const prx = pr * RX;
  const pry = pr * RY;
  for (let i = 1; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    s += circ(cx + Math.cos(a) * prx, cy - zp / 2 + Math.sin(a) * pry, 1.1, GOLD, { ns: 1 });
  }
  s += ell(cx, cy - zp, prx * 0.72, pry * 0.72, 'none', { sw: 1, stroke: '#d9c39c' });
  // Horses on gold poles: back pair, then the centre column, then the front pair.
  const pole = (a) => [cx + Math.cos(a) * prx * 0.62, cy - zp + Math.sin(a) * pry * 0.62];
  const H = [
    [-2.2, 1, WHITE, BLUE],
    [-0.9, -1, '#ffe0ef', MINT],
    [2.2, 1, '#e8f4ff', PINK],
    [0.9, -1, WHITE, LEMON],
  ];
  const hz = (a, dz) => {
    const [x, y] = pole(a);
    const h = H.find((q) => q[0] === a);
    return stick(`${M(x, y)}V${N(y - (zc - zp))}`, GOLD, 1.8, 1.6) + horse(x, y - dz, h[1], h[2], h[3], 1.4);
  };
  s += hz(-2.2, 20) + hz(-0.9, 14);
  s += cyl(F, 1, 1, 0.13, zp, zc - zp, GOLD, { top: 'none', sw: 1.6 });
  s += line(`${M(cx - 3, cy - zp - 10)}V${N(cy - zc + 8)}`, SHINE, 1.4, { op: 0.8 });
  s += hz(0.9, 24) + hz(2.2, 16);
  // Canopy: valance with scallops and bulbs, a striped cone, a gold finial.
  const cr = 0.98;
  const crx = cr * RX;
  const cry = cr * RY;
  const yv = cy - zc;
  s += path(`${M(cx - crx, yv - 8)}V${N(yv)}A${N(crx)} ${N(cry)} 0 0 0 ${N(cx + crx)} ${N(yv)}V${N(yv - 8)}Z`, RED, { sw: 1.8 });
  let sc = '';
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI;
    const a1 = ((i + 1) / 10) * Math.PI;
    const p0 = [cx + Math.cos(a0) * crx, yv + Math.sin(a0) * cry];
    const p1 = [cx + Math.cos(a1) * crx, yv + Math.sin(a1) * cry];
    sc += `${M(p0[0], p0[1])}Q${N((p0[0] + p1[0]) / 2)} ${N((p0[1] + p1[1]) / 2 + 7)} ${N(p1[0])} ${N(p1[1])}Z`;
  }
  s += path(sc, WHITE, { sw: 1.3 });
  for (let i = 1; i < 10; i += 2) {
    const a = (i / 10) * Math.PI;
    s += bulb(cx + Math.cos(a) * crx, yv - 4 + Math.sin(a) * cry, 1.7, '#fff4b8', (i - 1) / 2);
  }
  const ya = yv - 8 - 26;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI;
    const a1 = ((i + 1) / 8) * Math.PI;
    s += path(`${M(cx, ya)}L${N(cx + Math.cos(a0) * crx)} ${N(yv - 8 + Math.sin(a0) * cry)}A${N(crx)} ${N(cry)} 0 0 1 ${N(cx + Math.cos(a1) * crx)} ${N(yv - 8 + Math.sin(a1) * cry)}Z`, i % 2 ? WHITE : RED, { ns: 1 });
  }
  s += path(`${M(cx, ya)}L${N(cx + crx)} ${N(yv - 8)}A${N(crx)} ${N(cry)} 0 0 1 ${N(cx)} ${N(yv - 8 + cry)}Z`, O, { ns: 1, op: 0.14 });
  s += path(`${M(cx - crx, yv - 8)}L${N(cx)} ${N(ya)}L${N(cx + crx)} ${N(yv - 8)}A${N(crx)} ${N(cry)} 0 0 1 ${N(cx - crx)} ${N(yv - 8)}`, 'none', { sw: 2 });
  s += circ(cx, ya - 2, 4, GOLD, { sw: 1.4 }) + pennant(cx, ya - 5, 12, BLUE, 1, LEMON);
  // The name plate on the platform's front.
  s += plate(cx - 13, cy + pry - zp / 2 - 4, 26, 8);
  return out(F, s, 'ls-keepsake ls-legend', 92, 'carousel', [{ u: 1, v: 1, z: 70, r: 44, color: '#ffe27a' }, { u: 0.2, v: 1.8, z: 44, r: 14, color: '#fff1b0' }, { u: 1.8, v: 0.2, z: 44, r: 14, color: '#fff1b0' }]);
}

function greenhouse() {
  const F = frame(2, 129);
  const u0 = 0.16;
  const u1 = 1.84;
  const v0 = 0.3;
  const v1 = 1.7;
  const zf = 8;
  const zw = 52;
  const zr = 80;
  const vm = (v0 + v1) / 2;
  const GL = NITE ? '#ffe9a6' : '#c9f1ff';
  const FR = WHITE;
  let s = face(F, [[u0 - 0.06, v0 - 0.06], [u1 + 0.08, v0 - 0.06], [u1 + 0.08, v1 + 0.08], [u0 - 0.06, v1 + 0.08]], O, { ns: 1, op: 0.12 });
  // Foundation (brick) with a tiled floor.
  const brick = '#c8553d';
  s += box(F, u0, v0, u1, v1, 0, zf, brick, { top: '#e6dccb', lf: line('M0 4H8M36 4H53.5M4 0V4M48 0V4M6 4V8M44 4V8', dk(brick, 0.3), 0.8, { op: 0.6 }) + plate(10.5, 0.6, 25, 6.8), rf: line('M0 4H44.5M14 0V4M34 4V8', dk(brick, 0.3), 0.8, { op: 0.6 }), sw: 1.8 });
  // Back walls (seen through the glass).
  s += face(F, [[u0, v0, zf], [u1, v0, zf], [u1, v0, zw], [u0, v0, zw]], GL, { sw: 1, op: 0.6 }) + face(F, [[u0, v0, zf], [u0, v1, zf], [u0, v1, zw], [u0, v0, zw]], GL, { sw: 1, op: 0.6 });
  s += face(F, [[u0, v0, zw], [u0, vm, zr], [u1, vm, zr], [u1, v0, zw]], GL, { sw: 1, op: 0.5 });
  // Inside (lamp-lit at night): a lemon tree, tomato vines, pots and flowers.
  s += halo(...F.p(1, 1, 30), 44, '#fff3b0', 0.4);
  const P = (u, v) => F.p(u, v, zf);
  const [lx, ly] = P(0.6, 0.7);
  s += stick(`${M(lx, ly)}V${N(ly - 22)}`, BARK, 2.4, 1.8) + blob([[lx - 8, ly - 28, 8], [lx + 7, ly - 30, 8], [lx, ly - 38, 8]], LEAF, { shade: LEAF_D }) + path(cpath([[lx - 6, ly - 30, 2.4], [lx + 6, ly - 34, 2.4], [lx + 1, ly - 25, 2.2]]), LEMON, { sw: 1 });
  const [tx, ty] = P(1.4, 0.6);
  s += blob([[tx - 6, ty - 12, 7], [tx + 5, ty - 18, 7], [tx - 1, ty - 28, 6.5], [tx + 7, ty - 32, 5.5]], LEAF, { shade: LEAF_D }) + path(cpath([[tx - 5, ty - 14, 2.4], [tx + 6, ty - 20, 2.4], [tx, ty - 29, 2.2]]), RED, { sw: 1 });
  for (const [u, v, c] of [[0.6, 1.4, PINK], [1.0, 1.2, LEMON], [1.5, 1.35, RED]]) {
    const [x, y] = P(u, v);
    s += path(`${M(x - 5, y - 8)}H${N(x + 5)}L${N(x + 4)} ${N(y)}H${N(x - 4)}Z`, TERRA, { sw: 1.3 }) + blob([[x - 3, y - 11, 4], [x + 3, y - 12, 4]], LEAF, { shade: LEAF_D, hi: false }) + circ(x, y - 14, 2.6, c, { sw: 1 });
  }
  // Front glass: left face (long side) and the right gable end with a door.
  const panes = (w, h, n) => {
    let d = '';
    for (let k = 1; k < n; k++) d += `M${N((k * w) / n)} 0V${N(h)}`;
    return d;
  };
  const lw = (u1 - u0) * 32;
  const rw = (v1 - v0) * 32;
  const hw = zw - zf;
  s += face(F, [[u0, v1, zf], [u1, v1, zf], [u1, v1, zw], [u0, v1, zw]], GL, { ns: 1, op: 0.45 });
  s += onL(F, u0, v1, zw, line('M4 5L12 30M20 6L26 22M40 8L46 26', '#ffffff', 2, { op: 0.6 }) + line(panes(lw, hw, 5) + `M0 ${hw / 2}H${N(lw)}`, FR, 3.4) + rect(0, 0, lw, hw, 'none', { sw: 1.4 }));
  s += face(F, [[u1, v1, zf], [u1, v0, zf], [u1, v0, zw], [u1, vm, zr], [u1, v1, zw]], GL, { ns: 1, op: 0.5 }) + face(F, [[u1, v1, zf], [u1, v0, zf], [u1, v0, zw], [u1, vm, zr], [u1, v1, zw]], O, { ns: 1, op: 0.08 });
  s += onR(F, u1, v1, zw, line(`M${N(rw / 3)} 0V${N(hw)}M${N((2 * rw) / 3)} 0V${N(hw)}M0 0H${N(rw)}M${N(rw / 2)} 0V${N(-(zr - zw))}`, FR, 3) + rect(rw / 3 + 2, 6, rw / 3 - 4, hw - 6, 'none', { sw: 1.2 }) + circ(rw / 2 + 4, hw / 2 + 4, 1.2, GOLD, { ns: 1 }));
  s += path(pd(F, [[u1, v1, zf], [u1, v1, zw], [u1, vm, zr], [u1, v0, zw], [u1, v0, zf]], false), 'none', { sw: 2 });
  // Front roof slope (glass) with its frame.
  const roof = [[u0 - 0.04, vm, zr], [u1 + 0.04, vm, zr], [u1 + 0.04, v1 + 0.06, zw - 2], [u0 - 0.04, v1 + 0.06, zw - 2]];
  s += face(F, roof, GL, { ns: 1, op: 0.55 });
  const rf = [];
  for (let k = 0; k <= 5; k++) rf.push([[u0 + ((u1 - u0) * k) / 5, vm, zr], [u0 + ((u1 - u0) * k) / 5, v1 + 0.06, zw - 2]]);
  s += path(rf.map((q) => pd(F, q, false)).join(''), 'none', { sw: 2.8, stroke: FR });
  s += path(pd(F, roof), 'none', { sw: 1.8 }) + path(pd(F, [[u0 - 0.04, vm, zr], [u1 + 0.04, vm, zr]], false), 'none', { sw: 3.6, stroke: O }) + path(pd(F, [[u0 - 0.04, vm, zr], [u1 + 0.04, vm, zr]], false), 'none', { sw: 1.8, stroke: FR });
  s += onL(F, u0 + 0.3, v1 + 0.04, zw + 10, line('M2 0L14 -8M30 2L40 -6', '#ffffff', 2, { op: 0.65 }));
  // A terracotta pot by the door.
  const [px, py] = F.p(1.95, 1.3, 0);
  s += path(`${M(px - 5, py - 9)}H${N(px + 5)}L${N(px + 4)} ${N(py)}H${N(px - 4)}Z`, TERRA, { sw: 1.3 }) + blob([[px - 3, py - 12, 4], [px + 3, py - 13, 4]], LEAF, { shade: LEAF_D, hi: false });
  return out(F, s, 'ls-keepsake ls-legend', 74, 'greenhouse', [{ u: 1, v: 1, z: 40, r: 40, color: '#d8ffcf' }]);
}

// =============================================================================================
// Plinth, statue, badges.
// =============================================================================================

const PL_TOP = 33;

/** The 2×2 stone plinth with a brass plate; returns the svg body for frame F. */
function plinthBody(F) {
  let s = face(F, [[0.08, 0.08], [1.96, 0.08], [1.96, 1.96], [0.08, 1.96]], O, { ns: 1, op: 0.12 });
  const ledge = line(`M0 1.5H${N(1.76 * 32)}`, '#ffffff', 1, { op: 0.5 });
  s += box(F, 0.12, 0.12, 1.88, 1.88, 0, 6, STONE, { top: STONE_L, lf: ledge, rf: ledge, sw: 1.8 });
  const mw = 1.36 * 32;
  const blocks = (w) => line(`M0 11H${N(w)}M${N(w * 0.36)} 0V11M${N(w * 0.7)} 11V22`, dk(STONE, 0.18), 0.9, { op: 0.8 });
  s += box(F, 0.32, 0.32, 1.68, 1.68, 6, 22, STONE, { lf: blocks(mw) + rect(mw / 2 - 12, 5, 24, 10, '#c79a3a', { sw: 1.3, rx: 1.4 }) + rect(mw / 2 - 10.5, 6.5, 21, 7, GOLD, { ns: 1 }) + line(`M${N(mw / 2 - 7)} 9H${N(mw / 2 + 7)}M${N(mw / 2 - 5)} 11.5H${N(mw / 2 + 5)}`, GOLD_DD, 0.9) + line(`M${N(mw / 2 - 10)} 7H${N(mw / 2 + 10)}`, '#fff3b0', 0.8), rf: blocks(mw), top: 'none', sw: 1.8 });
  s += box(F, 0.24, 0.24, 1.76, 1.76, 28, 5, STONE_L, { top: '#f4f0e8', sw: 1.8 });
  return s;
}

/** A Skull count as it fits the scoreboard ("1234", "12k"). */
const countText = (n) => {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v < 10000 ? String(v) : `${Math.min(999, Math.floor(v / 1000))}k`;
};

/**
 * A souvenir on a 2×2 stone plinth. innerSvg: a souvenirSvg(id) string (any <svg> with a
 * viewBox, or width and height, works); it is scaled to fit (≤ 92 wide, ≤ 104 tall, ≤ 1.1×) and
 * stood on the top. o.count: a number baked into a blank data-panel (the scoreboard's Skulls).
 */
export function plinthArt(innerSvg = '', o = {}) {
  const src = typeof innerSvg === 'string' ? innerSvg : '';
  const open = /<svg\b[^>]*>/.exec(src);
  const close = src.lastIndexOf('</svg>');
  const vb = open && /viewBox="\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(open[0]);
  const wh = open && !vb && /\swidth="([\d.]+)"/.exec(open[0]) && /\sheight="([\d.]+)"/.exec(open[0]) ? [+/\swidth="([\d.]+)"/.exec(open[0])[1], +/\sheight="([\d.]+)"/.exec(open[0])[1]] : null;
  let box = null;
  if (open && close > open.index) box = vb ? [+vb[1], +vb[2], +vb[3], +vb[4]] : wh ? [0, 0, wh[0], wh[1]] : null;
  let w = 0;
  let h = 0;
  let k = 1;
  if (box && box[2] > 0 && box[3] > 0) {
    w = box[2];
    h = box[3];
    k = Math.min(1.1, 92 / w, 104 / h);
  }
  const sh = h * k;
  const H = Math.ceil(61 + sh + 5);
  const F = frame(2, H);
  let s = plinthBody(F);
  let extra = '';
  if (w && h) {
    const [cx, cy] = F.p(1, 1, PL_TOP);
    const cls = /class="([^"]*)"/.exec(open[0]);
    let inner = src.slice(open.index + open[0].length, close);
    const panel = /data-panel="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(open[0]);
    if (panel && o.count != null) {
      const [px, py, pw, ph] = panel.slice(1).map(Number);
      const t = countText(o.count);
      const fs = Math.min(ph * 0.78, (pw - 6) / (t.length * 0.62));
      inner += `<text x="${W2(px + pw / 2)}" y="${W2(py + ph / 2 + fs * 0.36)}" font-size="${W2(fs)}" font-family="system-ui,sans-serif" font-weight="900" text-anchor="middle" fill="#ffd84d" stroke="#ff8a3a" stroke-width="0.8" paint-order="stroke">${t}</text>`;
    }
    extra = `<svg x="${N(cx - (w * k) / 2)}" y="${N(cy + 4 - sh)}" width="${N(w * k)}" height="${N(sh)}" viewBox="${box.join(' ')}" overflow="visible"${cls ? ` class="${cls[1]}"` : ''}>${inner}</svg>`;
  } else s += sparkle(...F.p(1, 1, PL_TOP + 14), 5);
  return { svg: wrap(F, s, 'ls-plinth', extra), artH: H, bodyH: Math.round(PL_TOP + sh - 30 + Math.max(0, (w * k - 64) / 4)), size: 2, spot: { ...SPOTS.souvenir }, door: [SPOTS.souvenir.u, SPOTS.souvenir.v], glow: [] };
}

/** A chunky golden survivor standing on (x, y) (statue figure). pose: flag | point | cheer. */
function goldFig(x, y, pose, hair) {
  const G1 = GOLD;
  const G2 = GOLD_D;
  const G3 = GOLD_DD;
  let s = '';
  // Arms behind the body first when raised.
  const arm = (d) => line(d, O, 7.4) + line(d, G1, 5);
  if (pose === 'flag') s += stick(`${M(x + 13, y - 24)}V${N(y - 76)}`, G2, 2, 2) + path(`${M(x + 14, y - 76)}${Q(x + 22, y - 80, x + 30, y - 75)}L${N(x + 28)} ${N(y - 68)}L${N(x + 30)} ${N(y - 62)}${Q(x + 22, y - 66, x + 14, y - 63)}Z`, G1, { sw: 1.6 }) + path(`${M(x + 22, y - 78)}${Q(x + 26, y - 77.5, x + 30, y - 75)}L${N(x + 28)} ${N(y - 68)}L${N(x + 30)} ${N(y - 62)}${Q(x + 26, y - 64, x + 22, y - 64.5)}Z`, G2, { ns: 1, op: 0.7 }) + star(x + 21, y - 70, 3, G3, { sw: 0 });
  if (pose === 'flag') s += arm(`${M(x + 6, y - 28)}L${N(x + 12)} ${N(y - 40)}L${N(x + 13)} ${N(y - 50)}`);
  if (pose === 'cheer') s += arm(`${M(x - 6, y - 28)}L${N(x - 11)} ${N(y - 40)}L${N(x - 9)} ${N(y - 50)}M${N(x + 6)} ${N(y - 28)}L${N(x + 11)} ${N(y - 40)}L${N(x + 9)} ${N(y - 50)}`);
  // Legs and shoes.
  s += line(`${M(x - 3.4, y - 14)}V${N(y - 3)}M${N(x + 3.4)} ${N(y - 14)}V${N(y - 3)}`, O, 7.6) + line(`${M(x - 3.4, y - 14)}V${N(y - 3)}M${N(x + 3.4)} ${N(y - 14)}V${N(y - 3)}`, G2, 5.2);
  s += ell(x - 4.4, y - 1.6, 4.4, 2.6, G3, { sw: 1.4 }) + ell(x + 4.4, y - 1.6, 4.4, 2.6, G3, { sw: 1.4 });
  // Body.
  s += rect(x - 9, y - 34, 18, 22, G1, { rx: 6, sw: 2 }) + path(`${M(x + 2, y - 34)}H${N(x + 3)}Q${N(x + 9)} ${N(y - 34)} ${N(x + 9)} ${N(y - 28)}V${N(y - 18)}Q${N(x + 9)} ${N(y - 12)} ${N(x + 3)} ${N(y - 12)}H${N(x + 2)}Z`, G2, { ns: 1, op: 0.75 });
  s += line(`${M(x - 6, y - 30)}V${N(y - 18)}`, SHINE, 1.6, { op: 0.9 });
  // Front arms.
  if (pose === 'flag') s += arm(`${M(x - 7, y - 29)}L${N(x - 11)} ${N(y - 20)}L${N(x - 6)} ${N(y - 15)}`);
  if (pose === 'point') s += arm(`${M(x - 7, y - 29)}L${N(x - 18)} ${N(y - 36)}`) + circ(x - 19, y - 37, 2.8, G1, { sw: 1.4 }) + arm(`${M(x + 7, y - 29)}L${N(x + 10)} ${N(y - 19)}`) + circ(x + 10, y - 18, 2.8, G1, { sw: 1.4 });
  if (pose === 'flag') s += circ(x + 13, y - 51, 3, G1, { sw: 1.4 });
  if (pose === 'cheer') s += circ(x - 9, y - 51, 3, G1, { sw: 1.4 }) + circ(x + 9, y - 51, 3, G1, { sw: 1.4 });
  // Head and hair.
  const hy = y - 45;
  if (hair === 'pony') s += ell(x - 12, hy + 2, 3.6, 6, G2, { sw: 1.6, tf: `rotate(20 ${N(x - 12)} ${N(hy + 2)})` });
  s += circ(x, hy, 10, G1, { sw: 2 }) + path(`${M(x + 3, hy - 9.5)}A10 10 0 0 1 ${N(x + 3)} ${N(hy + 9.5)}A8 10 0 0 0 ${N(x + 3)} ${N(hy - 9.5)}Z`, G2, { ns: 1, op: 0.7 });
  if (hair === 'cap') s += path(`${M(x - 10, hy - 2)}${Q(x - 10, hy - 12, x, hy - 12)}${Q(x + 10, hy - 12, x + 10, hy - 2)}Z`, G2, { sw: 1.6 }) + path(`${M(x - 12, hy - 2)}H${N(x + 4)}`, 'none', { sw: 3 });
  else if (hair === 'pony') s += path(`${M(x - 10, hy - 1)}${Q(x - 9, hy - 12, x + 1, hy - 11)}${Q(x + 10, hy - 10, x + 10, hy - 2)}${Q(x + 2, hy - 7, x - 10, hy - 1)}Z`, G2, { sw: 1.6 });
  else s += path(`${M(x - 9, hy - 3)}l1 -7l4 3l3 -6l3 5l4 -4l2 6l2 3Z`, G2, { sw: 1.6 });
  s += circ(x - 3.4, hy + 1, 1.2, G3, { ns: 1 }) + circ(x + 3.4, hy + 1, 1.2, G3, { ns: 1 }) + line(`${M(x - 3, hy + 4.6)}${Q(x, hy + 7, x + 3, hy + 4.6)}`, G3, 1.2);
  s += line(`${M(x - 7, hy - 3)}${Q(x - 6, hy - 7, x - 3, hy - 8)}`, SHINE, 1.6, { op: 0.9 });
  return s;
}

// A gold ramp by brightness: a person's colours become polished gold (outlines stay ink).
const GOLD_RAMP = [[0, '#8a5208'], [0.28, '#b8730c'], [0.48, '#e0960f'], [0.66, '#ffc23a'], [0.84, '#ffe58a'], [1, '#fff6c8']];
function goldOf(hex) {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, gg, b] = hexRgb(h).map((v) => v / 255);
  const L = Math.min(1, 0.16 + 0.76 * (0.2126 * r + 0.7152 * gg + 0.0722 * b));
  for (let i = 1; i < GOLD_RAMP.length; i++) {
    const [t1, c1] = GOLD_RAMP[i];
    const [t0, c0] = GOLD_RAMP[i - 1];
    if (L <= t1) return mix(c0, c1, (L - t0) / (t1 - t0));
  }
  return GOLD_RAMP[GOLD_RAMP.length - 1][1];
}

/**
 * A founder as a gold statue figure: their own figureSvg (hair, hat, build, class prop) recoloured
 * gold, without the glow, sparkles, shadow or animation hooks. Feet on (x, y), scale k.
 */
function goldFounder(person, pose, x, y, k) {
  // One gold for everyone: the same skin and hair tone (a statue is one material), their own shapes.
  const look = { ...(person.look || {}), skin: 1, hairColor: 2, old: false };
  let f = figureSvg({ ...person, golden: false, look }, { pose });
  f = f.replace(/<g class="f-(glow|spark|z)"[^>]*>[\s\S]*?<\/g>/g, '').replace(/<ellipse class="f-shadow"[^>]*\/>/g, '');
  f = f.replace(/ class="[^"]*"/g, '').replace(/ aria-hidden="true"/g, '').replace(/ style="[^"]*"/g, '');
  f = f.replace(/(fill|stroke)="(#[0-9a-fA-F]{3,6})"/g, (m, a, c) => (c.toLowerCase() === O ? m : `${a}="${goldOf(c.toLowerCase())}"`)).replace(/(\d\.\d)\d+/g, '$1');
  const vb = /viewBox="([^"]+)"/.exec(f);
  const [, , vw, vh] = (vb ? vb[1] : '0 0 30 48').split(/[\s,]+/).map(Number);
  return f.replace(/<svg\b[^>]*>/, `<svg x="${W2(x - 15 * k)}" y="${W2(y - 47 * k)}" width="${W2(vw * k)}" height="${W2(vh * k)}" viewBox="0 0 ${vw} ${vh}" overflow="visible" stroke-linejoin="round" stroke-linecap="round">`);
}

/**
 * The Founders' Statue: three golden founders striking a pose on the stone plinth. founders: up to
 * three people (generatePerson objects; each is drawn from figureSvg in gold: their hair, hat,
 * build and class prop); without them, three generic golden survivors stand in.
 */
export function statueArt(founders = []) {
  const list = Array.isArray(founders) ? founders.filter((p) => p && typeof p === 'object').slice(0, 3) : [];
  const F = frame(2, 149);
  let s = plinthBody(F);
  const [cx, cy] = F.p(1, 1, PL_TOP);
  s += ell(cx, cy + 2, 40, 12, O, { ns: 1, op: 0.1 });
  let extra = '';
  if (list.length) {
    // Left (waves), right (holds their prop), centre and in front (cheers), a notch bigger.
    const slot = [
      [cx, cy + 7, 'cheer', 1.46],
      [cx - 29, cy + 1, 'wave', 1.32],
      [cx + 29, cy + 1, 'idle', 1.32],
    ];
    const back = [1, 2].map((i) => (list[i] ? goldFounder(list[i], slot[i][2], slot[i][0], slot[i][1], slot[i][3]) : '')).join('');
    const gen = (i) => (list[i] ? '' : i === 1 ? goldFig(cx - 29, cy + 1, 'point', 'pony') : goldFig(cx + 29, cy + 1, 'cheer', 'spiky'));
    s += gen(1) + gen(2);
    extra = back + goldFounder(list[0], slot[0][2], slot[0][0], slot[0][1], slot[0][3]) + `<g stroke="${O}" stroke-linejoin="round" stroke-linecap="round">${sparkle(cx - 46, cy - 52, 5) + sparkle(cx + 44, cy - 66, 4) + sparkle(cx - 40, cy - 14, 3.2)}</g>`;
  } else {
    s += goldFig(cx - 29, cy + 1, 'point', 'pony') + goldFig(cx + 29, cy + 1, 'cheer', 'spiky');
    s += g(goldFig(cx, cy + 7, 'flag', 'cap'), { tf: `translate(${N(cx)} ${N(cy + 7)}) scale(1.12) translate(${N(-cx)} ${N(-cy - 7)})` });
    s += sparkle(cx - 46, cy - 52, 5) + sparkle(cx + 44, cy - 66, 4) + sparkle(cx - 40, cy - 14, 3.2);
  }
  return { svg: wrap(F, s, 'ls-statue', extra), artH: F.H, bodyH: 92, size: 2, spot: { ...SPOTS.statue }, door: [SPOTS.statue.u, SPOTS.statue.v], glow: [] };
}

/** A 24×24 badge per set: a disc in the set colour with the set glyph in white. */
export function setBadgeSvg(set) {
  const c = SETS[set] ? SETS[set].color : '#c9b48f';
  const body =
    `<circle cx="12" cy="12" r="10.6" fill="${c}" stroke="${O}" stroke-width="1.8"/>` +
    `<path d="M2.2 13.4A9.8 9.8 0 0 0 21.8 13.4A9.6 9.6 0 0 1 2.2 13.4Z" fill="${dk(c, 0.25)}"/>` +
    `<circle cx="12" cy="12" r="8.2" fill="none" stroke="#ffffff" stroke-width="0.9" stroke-dasharray="1.4 1.2" opacity="0.6"/>` +
    `<g transform="translate(4.2 4.2) scale(0.65)">${setGlyph(set, { mono: true })}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ico set-badge set-${SETS[set] ? set : 'none'}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// =============================================================================================
// Animation
// =============================================================================================

// Map objects are <img> data URLs, out of the page CSS's reach: the keyframes go inside the svg.
// Transform and opacity only.
const KF = {
  flick: '@keyframes dc-flick{0%,100%{transform:scale(1,1)}50%{transform:scale(.9,1.12)}}',
  rise: '@keyframes dc-rise{0%{transform:translate(0,4px);opacity:0}30%{opacity:1}100%{transform:translate(0,-8px);opacity:0}}',
  puff: '@keyframes dc-puff{0%{transform:translate(0,3px);opacity:0}30%{opacity:.95}100%{transform:translate(0,-9px);opacity:0}}',
  spin: '@keyframes dc-spin{to{transform:rotate(360deg)}}',
  shim: '@keyframes dc-shim{50%{opacity:.3}}',
  wave: '@keyframes dc-wave{0%,100%{transform:skewY(0deg) scaleX(1)}50%{transform:skewY(5deg) scaleX(.93)}}',
  sweep: '@keyframes dc-sweep{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}',
  twinkle: '@keyframes dc-twinkle{50%{opacity:.45}}',
};
const HOOKS = {
  'dc-fire': ['flick', 'animation:dc-flick .7s ease-in-out infinite'],
  'dc-spark': ['rise', 'animation:dc-rise 1.6s ease-out infinite'],
  'dc-steam': ['puff', 'animation:dc-puff 3.3s ease-out infinite'],
  'dc-smoke': ['puff', 'animation:dc-puff 2.7s ease-out infinite'],
  'dc-sails': ['spin', 'animation:dc-spin 9s linear infinite'],
  'dc-disco': ['shim', 'animation:dc-shim 1.1s steps(2) infinite'],
  'dc-flag': ['wave', 'animation:dc-wave 1.8s ease-in-out infinite'],
  'dc-beam': ['sweep', 'animation:dc-sweep 5s ease-in-out infinite'],
  'dc-bulb': ['twinkle', 'animation:dc-twinkle 1.6s steps(1) infinite'],
};
const STILL = `@media (prefers-reduced-motion:reduce){${Object.keys(HOOKS).map((k) => `.${k}`).join(',')}{animation:none}}`;

/** Every decor keyframe and hook rule (for a page that inlines the art). */
export const DECOR_CSS = Object.values(KF).join('') + Object.entries(HOOKS).map(([k, [, a]]) => `.${k}{${a}}`).join('') + STILL;

/**
 * The same svg with just the keyframes its .dc-* hooks use embedded in a <style> (so it animates
 * as an <img>). Art without a hook, or already animated, comes back unchanged.
 */
export function withAnimation(svg) {
  const s = String(svg);
  if (/<style>[^<]*dc-/.test(s)) return s;
  const used = Object.keys(HOOKS).filter((k) => s.includes(`class="${k}"`));
  if (!used.length) return s;
  const kf = [...new Set(used.map((k) => HOOKS[k][0]))].map((k) => KF[k]).join('');
  const css = kf + used.map((k) => `.${k}{${HOOKS[k][1]}}`).join('') + `@media (prefers-reduced-motion:reduce){${used.map((k) => `.${k}`).join(',')}{animation:none}}`;
  return s.replace(/(<svg[^>]*>)/, `$1<style>${css}</style>`);
}

// =============================================================================================
// Public API
// =============================================================================================

const DECOR_ART = { bench, campfire, hammock, hottub, treehouse, planter, sunflowers, veggie, gnome, pumpkins, flamingo, trampoline, stage, disco, windmill, flagpole, searchlight, ladder, scarecrow, rocketslide };
const KEEPSAKE_ART = { jukebox, arcade, grill, rocker, telescope, gnomes, carousel, greenhouse };

/**
 * Where walkers go, by kind (decorations, keepsakes, 'souvenir', 'statue'), in town-art's
 * ANCHORS shape: spot [u, v] = where to stand (outside, sorts in front); seat [u, v, z] = where
 * the feet go for pieces used from on top (walker z = the object's + 1); front: true = the art
 * carries a front overlay; act: what they do there.
 */
export const ANCHORS = Object.fromEntries(
  Object.entries(SPOTS).map(([k, sp]) => {
    const a = { spot: (sp.door || [sp.u, sp.v]).slice(), act: sp.act };
    if (sp.over) a.seat = [sp.u, sp.v, sp.z];
    if (FRONTS.includes(k)) a.front = true;
    return [k, a];
  })
);

/** A plain crate for an unknown kind (never blank, never 'undefined'). */
function unknownArt(n) {
  const F = frame(n, n * 32 + 30);
  const s = box(F, 0.2, 0.2, n - 0.2, n - 0.2, 0, 22, WOOD, { top: WOOD_L, lf: line('M2 2L14 20M14 2L2 20', WOOD_D, 1.4), sw: 1.8 });
  return out(F, s, 'ls-unknown', 22, at1('look', [n / 2, n + 0.7]));
}

const cache = new Map();
const copy = (r) => {
  const c = { ...r, spot: { ...r.spot }, door: r.door.slice(), glow: r.glow.map((q) => ({ ...q })) };
  if (r.front) c.front = { ...r.front };
  return c;
};

/** Build once per key (night and the plate name set for the call), embed the animation. */
function make(key, fn, night, anim, name = '') {
  if (!cache.has(key)) {
    NITE = !!night;
    PLATE_NAME = name;
    let r;
    try {
      r = fn();
    } finally {
      NITE = false;
      PLATE_NAME = '';
    }
    if (anim) {
      r.svg = withAnimation(r.svg);
      if (r.front) r.front.svg = withAnimation(r.front.svg);
    }
    cache.set(key, r);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  return copy(cache.get(key));
}

/**
 * A decoration's art: { svg, artH, bodyH, size, spot, door, glow, front? } (see the header).
 * o.night: the evening variant; o.anim (default true): embed the .dc-* keyframes.
 */
export function decorArt(kind, { night = false, anim = true } = {}) {
  const fn = Object.hasOwn(DECOR_ART, kind) ? DECOR_ART[kind] : () => unknownArt(DECOR[kind] ? DECOR[kind].size : 1);
  return make(`d|${kind}|${night ? 1 : 0}|${anim ? 1 : 0}`, fn, night, anim);
}

/**
 * A keepsake's art: { svg, artH, bodyH, size, spot, door, glow } (see the header). o.name: the
 * owner's name for the gold plate (upper-cased, up to 8 letters, squeezed to fit); o.night,
 * o.anim as decorArt.
 */
export function keepsakeArt(kind, { name = '', night = false, anim = true } = {}) {
  const fn = Object.hasOwn(KEEPSAKE_ART, kind) ? KEEPSAKE_ART[kind] : () => unknownArt(KEEPSAKES[kind] ? KEEPSAKES[kind].size : 1);
  const nm = String(name || '')
    .trim()
    .toUpperCase()
    .slice(0, 8);
  return make(`k|${kind}|${nm}|${night ? 1 : 0}|${anim ? 1 : 0}`, fn, night, anim, nm);
}
