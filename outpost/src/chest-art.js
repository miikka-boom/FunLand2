// Thrill Hill chest art: the Supply Crate and the Ticket Vault in four Glow-Up
// grades, closed or burst open, with light leaking from the seams; plus the
// little loot pieces that fly about (Badge tokens, coins, gems). Pure functions
// returning SVG strings: no DOM, safe to import in node tests.
//
// chestSvg(kind, { grade, open, glow, anim })  viewBox 0 0 120 100, bottom-centre anchor:
//   the chest stands on y = 95 at x = 60 (its ground shadow is drawn there).
//   Scale it to any width with CSS (56 px in the bottom row, 240 px when opening).
//   The root svg has overflow="visible": the glow halo (glow > 0) spills softly up to
//   ~20 units past the box, so give the chest's container room (or let it clip).
//
// The art animates itself with a few light SMIL loops (sparkles twinkle, seam light
// flickers, the halo pulses, open rays sway, the blown-off lid bobs). Pass
// anim: false for a static picture, e.g. if you animate the hooks below with CSS.
//
// Animation hooks (CSS the UI may add; each carries its own transform-origin and
// none has a transform attribute):
//   svg.chest            class list: chest chest-<kind> g-<grade> [open]
//   .ch-halo             the soft glow behind the chest (pulse its opacity)
//   .ch-rays             the burst rays when open (sway or pulse; the fan only points up, so don't spin it)
//   .ch-leak             the light leaking from the seams (flicker)
//   .ch-spark            each sparkle (twinkle: scale 0.4 → 1; its origin is its own centre)
//   .ch-lid              the crate's blown-off lid when open (a little float)
//   .ch-wheel            the vault's ticket-wheel lock (spin it on a knock)

import { classGlyph, coinBody, gemBody } from './icons.js';

const O = '#2a1b12';
const WHITE = '#fffaf0';

let UID = 0;
const uid = (p) => `tch-${p}${(++UID).toString(36)}`;
const f = (v) => Math.round(v * 100) / 100;

function hexRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mix(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// --- builders ---------------------------------------------------------------------------------

function st(o) {
  let s = '';
  if (o.sw) s += ` stroke="${o.stroke || O}" stroke-width="${o.sw}" stroke-linejoin="round"`;
  if (o.cap) s += ' stroke-linecap="round"';
  if (o.op != null) s += ` opacity="${f(o.op)}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  if (o.style) s += ` style="${o.style}"`;
  return s;
}
const path = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${st(o)}/>`;
const circ = (cx, cy, r, fill, o = {}) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${st(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${st(o)}/>`;
const line = (d, color, w, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="${o.butt ? 'butt' : 'round'}" stroke-linejoin="round"${o.op != null ? ` opacity="${f(o.op)}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
const g = (inner, o = {}) => `<g${st(o)}>${inner}</g>`;
const stick = (d, color, w, ow = 2.4) => line(d, O, w + ow * 2) + line(d, color, w);

/** Rounded-rect path with per-corner radii [tl, tr, br, bl]. */
function rr(x, y, w, h, r) {
  const [a, b, c, d] = Array.isArray(r) ? r : [r, r, r, r];
  const X = x + w;
  const Y = y + h;
  return (
    `M${f(x + a)} ${f(y)}H${f(X - b)}${b ? `Q${f(X)} ${f(y)} ${f(X)} ${f(y + b)}` : ''}` +
    `V${f(Y - c)}${c ? `Q${f(X)} ${f(Y)} ${f(X - c)} ${f(Y)}` : ''}` +
    `H${f(x + d)}${d ? `Q${f(x)} ${f(Y)} ${f(x)} ${f(Y - d)}` : ''}` +
    `V${f(y + a)}${a ? `Q${f(x)} ${f(y)} ${f(x + a)} ${f(y)}` : ''}Z`
  );
}
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';

// --- self-animation (SMIL) ---------------------------------------------------------------------

/** Animation is on per chestSvg call; the builders read this while one chest is drawn. */
let ANIM = true;
const loop = (attr, values, dur, begin = 0) => (ANIM ? `<animate attributeName="${attr}" values="${values}" dur="${dur}s" begin="${f(-begin)}s" repeatCount="indefinite"/>` : '');
const loopTf = (type, values, dur, begin = 0) => (ANIM ? `<animateTransform attributeName="transform" type="${type}" values="${values}" dur="${dur}s" begin="${f(-begin)}s" repeatCount="indefinite"/>` : '');

/** 4-point twinkle, drawn about its own centre so a scale animation stays put. */
function sparkle(x, y, r, fill = '#ffffff', o = {}) {
  const k = r * 0.2;
  const d = `M0 ${f(-r)}Q${f(k)} ${f(-k)} ${f(r)} 0Q${f(k)} ${f(k)} 0 ${f(r)}Q${f(-k)} ${f(k)} ${f(-r)} 0Q${f(-k)} ${f(-k)} 0 ${f(-r)}Z`;
  const delay = o.delay ?? 0;
  const sw = o.sw ?? Math.max(0.9, r * 0.16);
  return `<g transform="translate(${f(x)} ${f(y)})"><path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${f(sw)}" stroke-linejoin="round" class="ch-spark" style="transform-origin:0px 0px;animation-delay:${f(delay)}s"${o.op != null ? ` opacity="${f(o.op)}"` : ''}>${loopTf('scale', '1;0.45;1', 1.5, delay)}</path></g>`;
}

function starPath(cx, cy, ro, ri, pts = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = ((rot + (i * 180) / pts) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    d += `${i ? 'L' : 'M'}${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

/** Wedge (pie slice) path. Angles in degrees, 0 = up, clockwise. */
function wedge(cx, cy, r, a0, a1) {
  const p = (a) => [cx + Math.sin((a * Math.PI) / 180) * r, cy - Math.cos((a * Math.PI) / 180) * r];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${f(cx)} ${f(cy)}L${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}Z`;
}
/** A circle as a path (for stroked light rings). */
const ringD = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0`;

// --- grades -----------------------------------------------------------------------------------

const RAINBOW = ['#ff5b5b', '#ff9a3c', '#ffd23a', '#5be07a', '#4aa3ff', '#b25cff'];

const WHEEL = ['#e8483f', '#fff3d6', '#3d8bf0', '#fff3d6', '#ffc23a', '#fff3d6', '#36c06a', '#fff3d6'];
const WOOD = { c: '#c98a4b', d: '#9a6234', l: '#e6b276' };
const IRON = { c: '#8d96a1', d: '#5f6772', l: '#c9d0d8' };
// Silver: a real steel body (darker than the bright trim) so it never reads as an unpainted outline.
const SILVER = { c: '#a9bdd2', d: '#6e86a2', l: '#dce8f4' };
const SILVER_T = { c: '#eef4fa', d: '#9fb2c6', l: '#ffffff' };
// Gold: a bright gold body with deep amber straps, so it doesn't melt into one yellow mass.
const GOLD = { c: '#ffc93a', d: '#e2930f', l: '#fff0a0' };
const GOLD_T = { c: '#e8961a', d: '#ad6100', l: '#ffd25e' };
const GOLD_TRIM = { c: '#ffc23a', d: '#d18f00', l: '#ffe78f' };
const RED = { c: '#e8483f', d: '#b52f2b', l: '#ff8174' };
const CANDY = { c: '#fffaf0', d: '#d8c9e8', l: '#ffffff' };

/**
 * Per kind and grade: body {c,d,l}, trim {c,d,l}, light (the hot core of the glow),
 * glow (its saturated outer colour; rainbow cycles RAINBOW instead), stencil, rope,
 * inside (the open crate's shadowy interior), dial (wheel segment colours), lining
 * (inside the vault lid), bulbs (unlit marquee bulbs), stripes (rainbow), sparks
 * (how many sparkles sit on it).
 */
const LOOKS = {
  crate: [
    { body: WOOD, trim: IRON, light: '#fff6c8', glow: '#ffb01f', stencil: '#6e3a17', rope: '#e8cb8e', inside: '#4a2a12', sparks: 0, worn: true },
    { body: SILVER, trim: SILVER_T, light: '#eafcff', glow: '#38cbff', stencil: '#42577a', rope: '#eef4fa', inside: '#2c3b52', sparks: 2, shine: true },
    { body: GOLD, trim: GOLD_T, light: '#fffbe0', glow: '#ff8a1a', stencil: '#a85f00', rope: '#e8483f', inside: '#6e3800', sparks: 3, shine: true },
    { body: CANDY, trim: GOLD_TRIM, light: '#ffffff', glow: '#ff4fc8', stencil: '#ffffff', rope: '#ff7ab8', inside: '#3f1d70', sparks: 5, stripes: true },
  ],
  vault: [
    { body: RED, trim: GOLD_TRIM, light: '#fff6c8', glow: '#ffb01f', dial: WHEEL, lining: '#6a1730', sparks: 0, bulbs: '#f6dfa0' },
    { body: SILVER, trim: SILVER_T, light: '#eafcff', glow: '#38cbff', dial: WHEEL, lining: '#33456a', sparks: 2, shine: true, bulbs: '#d3e2ee' },
    { body: GOLD, trim: GOLD_T, light: '#fffbe0', glow: '#ff8a1a', dial: WHEEL, lining: '#8a1f3a', sparks: 3, shine: true, bulbs: '#ffe9a8' },
    { body: CANDY, trim: GOLD_TRIM, light: '#ffffff', glow: '#ff4fc8', dial: ['#ff5b5b', '#ff9a3c', '#ffd23a', '#5be07a', '#4aa3ff', '#b25cff', '#ff7ab8', '#62e6ff'], lining: '#4a2380', sparks: 5, stripes: true, bulbs: '#f1e6ff' },
  ],
};

/**
 * The paints for one chest's light: seam (stroke paint for seam glows: the glow colour,
 * or a rainbow gradient across the chest), ray(i) (fill for the i-th light ray) and
 * any <defs> they need.
 */
function lightKit(P) {
  if (!P.stripes) return { defs: '', seam: P.glow, ray: () => P.glow, bulb: () => P.glow };
  const id = uid('rb');
  const stops = RAINBOW.map((c, i) => `<stop offset="${f(i / (RAINBOW.length - 1))}" stop-color="${c}"/>`).join('');
  return {
    defs: `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="110" y2="0">${stops}</linearGradient></defs>`,
    seam: `url(#${id})`,
    ray: (i) => RAINBOW[((i % 6) + 6) % 6],
    bulb: (i) => RAINBOW[((i % 6) + 6) % 6],
  };
}

/** A fill for a shape: solid body colour, or candy-stripe rainbow clipped to it. */
function surface(d, P, { tilt = -30, band = 7 } = {}) {
  if (!P.stripes) return path(d, P.body.c);
  const id = uid('clip');
  let s = '';
  // Diagonal bands across a generous box; the clip trims them to the shape.
  const step = band * 1.6;
  let i = 0;
  for (let x = -140; x < 260; x += step, i++) {
    s += path(poly([[x, -20], [x + band, -20], [x + band + 120 * Math.tan((-tilt * Math.PI) / 180), 120], [x + 120 * Math.tan((-tilt * Math.PI) / 180), 120]]), RAINBOW[((i % 6) + 6) % 6]);
  }
  return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>` + path(d, P.body.c) + `<g clip-path="url(#${id})">${s}</g>`;
}
/** The shade tone for a surface: a solid shade, or a dark wash over stripes. */
const shadeFill = (P) => (P.stripes ? { fill: O, op: 0.2 } : { fill: P.body.d, op: null });
const shade = (d, P) => {
  const s = shadeFill(P);
  return path(d, s.fill, { op: s.op });
};

/** A soft radial halo behind the chest. It may spill a little past the viewBox (the root svg has overflow visible) and fades to nothing at its rim. */
function halo(cx, cy, rx, ry, P, op) {
  if (op <= 0) return '';
  const id = uid('halo');
  // Strong right out to the chest's silhouette (~0.8 of the radius), so the rim that shows round the chest is bright.
  const mid = P.stripes ? `<stop offset="0.4" stop-color="#ff8ae0" stop-opacity="0.95"/><stop offset="0.78" stop-color="#b25cff" stop-opacity="0.6"/>` : `<stop offset="0.4" stop-color="${P.glow}" stop-opacity="0.95"/><stop offset="0.78" stop-color="${P.glow}" stop-opacity="0.6"/>`;
  return (
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/>${mid}<stop offset="1" stop-color="${P.stripes ? '#b25cff' : P.glow}" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#${id})" opacity="${f(op)}" class="ch-halo" style="transform-origin:${f(cx)}px ${f(cy)}px">${loop('opacity', `${f(op)};${f(op * 0.7)};${f(op)}`, 1.6)}</ellipse>`
  );
}

/** Light along a seam: a wide soft band in the glow colour, a bright line, and a white-hot core. */
function seamLight(d, P, LK, k) {
  if (k <= 0) return '';
  k = Math.min(1, k);
  return line(d, LK.seam, 3.5 + 7 * k, { op: 0.18 + 0.22 * k }) + line(d, LK.seam, 2.2 + 3 * k, { op: 0.6 + 0.4 * k }) + line(d, P.light, 1.2 + 1.6 * k, { op: 0.95 }) + line(d, '#ffffff', 0.6 + 0.9 * k, { op: 0.7 + 0.3 * k });
}

/**
 * Light beams shining out of the cracks: each beam is [x, y, angle, length] (angle in
 * degrees, 0 = up, clockwise), a narrow-based wedge that fades out in two steps, with a
 * white-hot core.
 */
function beams(list, LK, k, i0 = 0) {
  if (k < 0.3) return '';
  const op = Math.min(1, 0.55 + 0.6 * (k - 0.3));
  const grow = 0.6 + 0.55 * k;
  let s = '';
  list.forEach(([x, y, a, len], i) => {
    const r = (a * Math.PI) / 180;
    const L = len * grow;
    const ux = Math.sin(r);
    const uy = -Math.cos(r);
    const pt = (along, side) => [x + ux * along - uy * side, y + uy * along + ux * side];
    const wedge = (l, w0, w1) => poly([pt(1.2, -w0), pt(l, -w1), pt(l, w1), pt(1.2, w0)]);
    const col = LK.ray(i0 + i);
    s += path(wedge(L, 1.1, 3.6), col, { op: op * 0.35 }) + path(wedge(L * 0.7, 1.1, 2.6), col, { op: op * 0.85 }) + path(wedge(L * 0.55, 0.4, 0.9), '#ffffff', { op: op * 0.9 });
  });
  return s;
}

/** The burst of light out of an open chest: an upward fan of rays that fade out well inside the box. */
function burst(cx, cy, P, grade, r = 66, haloK = 1) {
  const grads = {};
  let defs = '';
  const grad = (col) => {
    if (grads[col]) return grads[col];
    const id = uid('ray');
    defs += `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"><stop offset="0" stop-color="${col}" stop-opacity="1"/><stop offset="0.35" stop-color="${col}" stop-opacity="0.85"/><stop offset="0.72" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
    return (grads[col] = `url(#${id})`);
  };
  let rays = '';
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = -160 + (i / (n - 1)) * 140; // up-left, through up, to up-right: no flat rays along the rim
    const ang = (a * Math.PI) / 180;
    const w = i % 2 ? 4.4 : 7.2;
    const da = (w * Math.PI) / 180;
    const col = P.stripes ? RAINBOW[i % 6] : i % 2 ? '#ffffff' : P.glow;
    rays += path(poly([[cx, cy], [cx + Math.cos(ang - da) * r, cy + Math.sin(ang - da) * r], [cx + Math.cos(ang + da) * r, cy + Math.sin(ang + da) * r]]), grad(col), { op: 0.9 });
  }
  const core = uid('core');
  defs += `<radialGradient id="${core}"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.4" stop-color="${P.stripes ? '#ffd6f4' : P.light}" stop-opacity="0.9"/><stop offset="0.7" stop-color="${P.stripes ? '#ff8ae0' : P.glow}" stop-opacity="0.35"/><stop offset="1" stop-color="${P.stripes ? '#b25cff' : P.glow}" stop-opacity="0"/></radialGradient>`;
  return (
    `<defs>${defs}</defs>` +
    `<ellipse cx="${f(cx)}" cy="${f(cy - 4)}" rx="${f(46 * haloK)}" ry="${f(34 * haloK)}" fill="url(#${core})" opacity="0.9" class="ch-halo" style="transform-origin:${f(cx)}px ${f(cy)}px">${loop('opacity', '0.9;0.7;0.9', 1.4)}</ellipse>` +
    g(`<g>${loopTf('rotate', `-5 ${f(cx)} ${f(cy)};5 ${f(cx)} ${f(cy)};-5 ${f(cx)} ${f(cy)}`, 5)}${rays}</g>`, { cls: 'ch-rays', style: `transform-origin:${f(cx)}px ${f(cy)}px` }) +
    (grade >= 2 ? ell(cx, cy - 2, 26, 16, `url(#${core})`, { op: 0.9 }) : '')
  );
}

/** Sparkles scattered over a chest's box. */
function sparkles(P, spots) {
  let s = '';
  for (let i = 0; i < Math.min(P.sparks, spots.length); i++) {
    const [x, y, r] = spots[i];
    const col = P.stripes ? ['#ffffff', '#fff3a0', '#ffd6f0', '#ffffff', '#c8f4ff'][i % 5] : '#ffffff';
    s += sparkle(x, y, r, col, { delay: f(i * 0.27) });
  }
  return s;
}

/** A diagonal shine streak inside a box (no clip: it is kept within the box). */
function shine(x0, y0, x1, y1, op = 0.4) {
  const h = y1 - y0;
  const a = x0 + (x1 - x0) * 0.62;
  return path(poly([[a, y0], [a + 9, y0], [a + 9 - h * 0.5, y1], [a - h * 0.5, y1]]), '#ffffff', { op }) + path(poly([[a + 13, y0], [a + 16, y0], [a + 16 - h * 0.5, y1], [a + 13 - h * 0.5, y1]]), '#ffffff', { op: op * 0.8 });
}

const rivet = (x, y, T, r = 1.5) => circ(x, y, r, T.d, { sw: 0 }) + circ(x - r * 0.25, y - r * 0.3, r * 0.55, T.l, { sw: 0 });

/** A carnival ticket stub, centred at (x, y), w × h, rotated by rot degrees. */
function ticket(x, y, w, h, rot, color) {
  const n = Math.min(w, h) * 0.22;
  const x0 = -w / 2;
  const y0 = -h / 2;
  // Notched corners (concave bites).
  const d = `M${f(x0 + n)} ${f(y0)}H${f(-x0 - n)}A${f(n)} ${f(n)} 0 0 0 ${f(-x0)} ${f(y0 + n)}V${f(-y0 - n)}A${f(n)} ${f(n)} 0 0 0 ${f(-x0 - n)} ${f(-y0)}H${f(x0 + n)}A${f(n)} ${f(n)} 0 0 0 ${f(x0)} ${f(-y0 - n)}V${f(y0 + n)}A${f(n)} ${f(n)} 0 0 0 ${f(x0 + n)} ${f(y0)}Z`;
  const long = h > w;
  const perf = long ? `M${f(x0 + 1.4)} ${f(y0 + h * 0.3)}H${f(-x0 - 1.4)}` : `M${f(x0 + w * 0.3)} ${f(y0 + 1.4)}V${f(-y0 - 1.4)}`;
  const star = long ? starPath(0, h * 0.12, Math.min(w, h) * 0.24, Math.min(w, h) * 0.1) : starPath(w * 0.12, 0, Math.min(w, h) * 0.24, Math.min(w, h) * 0.1);
  return g(path(d, color, { sw: 1.8 }) + line(perf, O, 0.9, { dash: '1.2 1.2', op: 0.6 }) + path(star, '#ffffff', { op: 0.85 }), { tf: `translate(${f(x)} ${f(y)}) rotate(${f(rot)})` });
}
const TICKETS = ['#ff9a3c', '#ffd23a', '#ff7ab8', '#62e6ff'];

/** A little gold coin seen face-on (for loot peeking out of an open chest). */
const lootCoin = (x, y, r, rot = 0) => g(circ(0, 0, r, '#e2930f', { sw: 1.6 }) + circ(0, -r * 0.12, r * 0.8, '#ffc93a') + path(starPath(0, -r * 0.1, r * 0.42, r * 0.18), '#fff0a0'), { tf: `translate(${f(x)} ${f(y)}) rotate(${rot}) scale(1 ${rot ? 0.85 : 1})` });

/** A little Badge (blue patch, gold star) peeking out of the loot heap. */
const lootBadge = (x, y, r, rot = 0) =>
  g(circ(0, 0, r, '#3d8bf0', { sw: 1.6 }) + `<circle cx="0" cy="0" r="${f(r * 0.72)}" fill="none" stroke="#ffffff" stroke-width="${f(r * 0.12)}" stroke-dasharray="${f(r * 0.28)} ${f(r * 0.22)}" opacity="0.85"/>` + path(starPath(0, r * 0.04, r * 0.5, r * 0.22), '#ffc23a', { sw: 1 }), { tf: `translate(${f(x)} ${f(y)}) rotate(${rot})` });

/** A little gem peeking out of the loot heap. */
const lootGem = (x, y, s, rot = 0) => g(gemBody(), { tf: `translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${f(s)}) translate(-12 -12)` });

// --- The Supply Crate -------------------------------------------------------------------------

/**
 * The crate is drawn in a 120 × 100 design space and scaled up about its foot (60, 95),
 * so the closed crate fills the box nearly as well as the Vault does (it read ~30 % smaller
 * at HUD size), while the open crate still has headroom for its blown-off lid.
 */
const CS = 1.12;
const CRATE_TF = `translate(${f(60 * (1 - CS))} ${f(95 * (1 - CS))}) scale(${CS})`;

/** The crate's stencilled park mark: one bold star in a broken ring (reads at 56 px). */
function stencilMark(cx, cy, r, P) {
  const col = P.stencil;
  const C = 2 * Math.PI * r;
  const gap = r * 0.42;
  const outline = P.stripes ? { sw: 1.5 } : {};
  const ring = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${col}" stroke-width="${f(r * 0.26)}" stroke-dasharray="${f(C / 4 - gap)} ${f(gap)}" transform="rotate(-45 ${f(cx)} ${f(cy)})"/>`;
  const star = path(starPath(cx, cy + r * 0.04, r * 0.66, r * 0.3), col, outline);
  if (P.stripes) {
    // On the stripes: a white star with a dark outline and a dark-backed ring.
    const back = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${O}" stroke-width="${f(r * 0.26 + 2.6)}" stroke-dasharray="${f(C / 4 - gap + 1.2)} ${f(gap - 1.2)}" transform="rotate(-45 ${f(cx)} ${f(cy)})" stroke-dashoffset="0.6"/>`;
    return back + ring + star;
  }
  return g(ring + star, { op: 0.7 });
}

/** The crate's lid (top face + front band), drawn in place; the open crate lifts it. */
function crateLid(P, worn) {
  const top = poly([[25, 30.5], [95, 30.5], [102, 39.5], [18, 39.5]]);
  const front = rr(18, 39, 84, 14.5, [2, 2, 3, 3]);
  let s = '';
  s += surface(top, P, { band: 6 }) + (P.stripes ? path(top, '#ffffff', { op: 0.35 }) : path(top, P.body.l));
  // Top boards (they run front to back).
  s += line('M42.5 31L40.6 39.3M60 31V39.3M77.5 31L79.4 39.3', P.stripes ? O : P.body.d, 1.3, { op: P.stripes ? 0.3 : 0.9 });
  s += path(top, 'none', { sw: 2.8 });
  s += surface(front, P);
  s += shade(rr(18, 48.5, 84, 5, [0, 0, 3, 3]), P);
  s += path(rr(20.5, 41, 79, 2.2, 1), P.stripes ? '#ffffff' : P.body.l, { op: P.stripes ? 0.55 : 1 });
  s += path(front, 'none', { sw: 3 });
  // Metal caps on the lid's front corners.
  const T = P.trim;
  for (const m of [1, -1]) {
    const x = m > 0 ? 18 : 102;
    const cap = poly([[x, 39], [x + 13 * m, 39], [x + 13 * m, 41.5], [x + 4 * m, 53.5], [x, 53.5]]);
    s += path(cap, T.c, { sw: 2.2 }) + path(poly([[x + 2 * m, 41], [x + 10.5 * m, 41], [x + 2 * m, 50.5]]), T.l, { op: 0.7 }) + rivet(x + 4.4 * m, 43.6, T);
    // The cap wraps onto the top face.
    s += path(poly([[x, 39.5], [x + 13 * m, 39.5], [x + 10 * m, 35], [x + 5 * m, 33.3]]), T.c, { sw: 2 });
  }
  // The latch hasp hangs over the seam.
  s += path(rr(53.5, 45, 13, 13.5, 2.5), T.c, { sw: 2.4 }) + path(rr(55.5, 46.8, 3, 9, 1.4), T.l, { op: 0.8 }) + path(rr(58, 52, 4, 4, 1), O);
  if (worn) {
    // A chipped corner, a splinter and a bent nail.
    s += path('M84 39.2L89.5 39.2L86.4 43.4Z', P.body.d, { sw: 1.4 });
    s += line('M30.6 46.4L36.4 47.8', P.body.d, 1.3);
    s += line('M73 43.2l1.4 -2.2l2 0.4', O, 1.3);
  }
  return s;
}

function crateBody(P, worn) {
  const T = P.trim;
  const box = rr(21, 52.5, 78, 41, [2, 2, 3.5, 3.5]);
  let s = '';
  // Rope handles (behind the box).
  for (const m of [1, -1]) {
    const x = m > 0 ? 23 : 97;
    const d = `M${x} 60.5C${x - 13 * m} 58.5 ${x - 13.5 * m} 78 ${x} 76`;
    s += stick(d, P.rope, 3.6, 2.2) + line(d, mix(P.rope, O, 0.35), 3.6, { dash: '1.4 2.2', op: 0.6 });
  }
  s += surface(box, P);
  // Three planks: a highlight under each seam, the bottom one in shade.
  s += shade(rr(21, 85, 78, 8.5, [0, 0, 3.5, 3.5]), P);
  const hl = P.stripes ? '#ffffff' : P.body.l;
  const hop = P.stripes ? 0.45 : 1;
  s += path(rr(23, 54.4, 74, 2, 1), hl, { op: hop }) + path(rr(23, 67.6, 74, 1.8, 0.9), hl, { op: hop }) + path(rr(23, 80.8, 74, 1.8, 0.9), hl, { op: hop * 0.8 });
  s += line('M22 66.2H98M22 79.4H98', P.stripes ? O : mix(P.body.d, O, 0.25), 1.6, { op: P.stripes ? 0.45 : 1 });
  if (worn) {
    // A crack in the bottom plank and a patch nailed over a broken bit.
    s += line('M38 80.5l2.4 3l-1.4 2.6l2.6 2.4', mix(P.body.d, O, 0.3), 1.3);
    s += g(path(rr(68, 82.6, 15, 6.4, 1.2), '#b47a40', { sw: 1.8 }) + circ(70.4, 85.8, 0.9, O) + circ(80.6, 85.8, 0.9, O) + line('M72.4 84.2H78.6', '#d9a466', 1, { op: 0.9 }), { tf: 'rotate(-7 75.5 85.8)' });
  }
  // The park mark, stencilled on (over the patch's corner is fine: it was painted later).
  s += stencilMark(60, 72.6, 8.4, P);
  if (P.shine) s += shine(31, 55, 89, 92, 0.38);
  // Side battens.
  for (const x of [21, 89]) {
    const bat = rr(x, 52.5, 10, 41, x < 50 ? [2, 0, 0, 3.5] : [0, 2, 3.5, 0]);
    const BP = P.stripes ? { body: P.trim } : P; // rainbow: gold battens frame the stripes
    s += surface(bat, BP, { band: 6 }) + shade(rr(x, 85, 10, 8.5, x < 50 ? [0, 0, 0, 3.5] : [0, 0, 3.5, 0]), BP);
    s += path(rr(x + 1.6, 54.5, 2, 29, 1), BP.body.l, { op: P.stripes ? 1 : hop }) + line(`M${x + 5} 56.5V57M${x + 5} 89V89.5`, O, 1.6);
    s += path(bat, 'none', { sw: 2.2 });
  }
  s += path(box, 'none', { sw: 3 });
  // Metal corner caps at the bottom.
  for (const m of [1, -1]) {
    const x = m > 0 ? 21 : 99;
    const cap = `M${x} 80.5L${x + 12.5 * m} 93.5H${x + 3.5 * m}Q${x} 93.5 ${x} 90Z`;
    s += path(cap, T.c, { sw: 2.2 }) + path(poly([[x + 1.8 * m, 84.5], [x + 6.5 * m, 89.6], [x + 1.8 * m, 89.6]]), T.l, { op: 0.75 }) + rivet(x + 3.6 * m, 89.6, T);
    s += path(`M${x} 52.5H${x + 11 * m}L${x} 61Z`, T.c, { sw: 2 }) + rivet(x + 3.2 * m, 55.6, T, 1.2);
  }
  return s;
}

/** The open crate's top: the walls' rim, a dark interior, a heap of loot, the front lip over it. */
function crateTop(P) {
  const rimFill = (d) => surface(d, P, { band: 5 }) + path(d, P.stripes ? '#ffffff' : P.body.l, { op: P.stripes ? 0.35 : 1 });
  const rim = poly([[25, 44], [95, 44], [99.5, 53], [20.5, 53]]);
  const hole = poly([[29.5, 46.2], [90.5, 46.2], [93.6, 51.2], [26.4, 51.2]]);
  let s = rimFill(rim) + path(rim, 'none', { sw: 2.6 });
  s += path(hole, P.inside, { sw: 1.8 });
  // The back wall's inner face catches the light from the heap.
  s += path(poly([[30.2, 47], [89.8, 47], [90.6, 48.6], [29.4, 48.6]]), P.light, { op: 0.35 });
  // The heap: a mound of coins with a Badge and a gem on top.
  const mound = 'M29.6 51.2C32.6 45 44.6 41.4 60 41.4C75.4 41.4 87.4 45 90.4 51.2Z';
  s += path(mound, '#ffc93a', { sw: 2.2 }) + line('M35.6 48.4C39.6 44.9 47.6 43.4 56 43.2', '#fff0a0', 1.8, { op: 0.95 }) + line('M70 47.4C76 47.2 82 48.4 86 50.4', '#e2930f', 1.6, { op: 0.8 });
  s += lootCoin(39, 47.4, 3.8, -12) + lootCoin(81.4, 47.6, 3.6, 12) + lootCoin(67.4, 43.6, 4.2);
  s += lootBadge(51.4, 41.2, 5, -12) + lootGem(73.6, 41.2, 0.42, 14);
  // The front lip, over the heap.
  const lip = poly([[26.4, 51.2], [93.6, 51.2], [99.5, 53], [20.5, 53]]);
  s += rimFill(lip) + path(lip, 'none', { sw: 2.2 });
  return s;
}

function crateSvg(grade, open, glow) {
  const P = LOOKS.crate[grade];
  const LK = lightKit(P);
  const worn = !!P.worn;
  let s = LK.defs + ell(60, 95, 44 * CS, 4.4, O, { op: 0.2 });
  const k = Math.max(0, Math.min(1, glow));
  if (open) {
    s += burst(60, 41, P, grade);
    s += g(crateBody(P, worn) + crateTop(P) + sparkles(P, [[28, 62, 3.4], [92, 68, 3], [54, 87, 2.6], [76, 60, 2.4], [40, 76, 2.2]]), { tf: CRATE_TF });
    // Loot jumping out, and the lid blown up off the box.
    s += lootCoin(34, 27, 4.4, -20) + lootCoin(56, 22, 4.6) + lootCoin(44, 12, 3.6, 16);
    s += sparkle(24, 18, 4.2, '#ffffff') + sparkle(66, 8, 3, '#ffffff', { delay: 0.3 }) + sparkle(104, 34, 3.2, '#ffffff', { delay: 0.6 });
    s += `<g class="ch-lid" style="transform-origin:86px 14px">${loopTf('translate', '0 0;0 -2.2;0 0', 1.8)}${g(crateLid(P, worn), { tf: 'translate(86 6.4) rotate(14) scale(0.56) translate(-60 -30)' })}</g>`;
    return s;
  }
  s += halo(60, 60, 80, 58, P, Math.min(1, k * 1.2));
  let c = crateBody(P, worn) + crateLid(P, worn);
  if (k > 0) {
    // The light builds in three stages as the knocks land: the lid seam, then the top edge
    // (from 0.3), then the plank seams (from 0.45).
    const leak = seamLight('M22.5 53.4H53.5M66.5 53.4H97.5', P, LK, 0.35 + 0.65 * k) + seamLight('M31 66.2H89M31 79.4H89', P, LK, Math.max(0, k - 0.45) * 1.6) + seamLight('M26 30.8H94', P, LK, Math.max(0, k - 0.3) * 1.3);
    const rays = beams([[32, 30.4, -26, 11], [46, 30.2, -11, 14], [60, 30.2, 0, 16], [74, 30.2, 11, 14], [88, 30.4, 26, 11]], LK, k) + beams([[19.5, 53.4, -78, 10], [19.5, 53.4, -104, 8], [100.5, 53.4, 78, 10], [100.5, 53.4, 104, 8]], LK, k, 5);
    c += `<g class="ch-leak">${loop('opacity', '1;0.72;1', 0.9)}${rays + leak}</g>`;
  }
  c += sparkles(P, [[94, 34, 4], [27, 62, 3.4], [80, 75, 3], [44, 36, 2.6], [64, 89, 2.4]]);
  return s + g(c, { tf: CRATE_TF });
}

// --- The Ticket Vault -------------------------------------------------------------------------

const DOME = 'M10 54V39C10 25 27 15.5 60 15.5C93 15.5 110 25 110 39V54Z';

/** The vault's ticket-wheel lock: a little prize wheel set in a round plate. */
function ticketWheel(cx, cy, P) {
  const T = P.trim;
  let s = circ(cx, cy, 13.4, T.d, { sw: 2.6 }) + circ(cx, cy - 0.8, 12.4, T.c) + path(`M${cx - 10.6} ${cy - 5.6}A12 12 0 0 1 ${cx + 2} ${cy - 12.2}`, 'none', { stroke: T.l, sw: 1.8, cap: true });
  const cols = P.dial;
  const segs = cols.length;
  let w = '';
  for (let i = 0; i < segs; i++) w += path(wedge(cx, cy, 9.2, (i * 360) / segs - 180 / segs, ((i + 1) * 360) / segs - 180 / segs), cols[i % cols.length]);
  s += g(w, { cls: 'ch-wheel', style: `transform-origin:${f(cx)}px ${f(cy)}px` });
  s += circ(cx, cy, 9.2, 'none', { sw: 2 });
  for (let i = 0; i < segs; i++) {
    const a = ((i * 360) / segs - 180 / segs) * (Math.PI / 180);
    s += circ(cx + Math.sin(a) * 10.9, cy - Math.cos(a) * 10.9, 0.8, T.l);
  }
  s += circ(cx, cy, 3.2, T.c, { sw: 1.8 }) + circ(cx - 0.9, cy - 0.9, 1.1, T.l);
  // Pointer at the top.
  s += path(`M${cx - 3.2} ${cy - 14.6}H${cx + 3.2}L${cx} ${cy - 8.8}Z`, '#e8483f', { sw: 1.8 });
  return s;
}

function vaultBody(P) {
  const T = P.trim;
  const box = rr(12, 52, 96, 39.5, [2, 2, 5, 5]);
  let s = '';
  // Ball feet.
  for (const x of [22, 98]) s += ell(x, 92, 6, 4.6, T.d, { sw: 2.4 }) + ell(x - 1, 91, 3.4, 2.2, T.c);
  s += surface(box, P, { band: 8 });
  s += shade(rr(12, 82.5, 96, 9, [0, 0, 5, 5]), P);
  s += path(rr(15, 55.5, 90, 2.2, 1), P.stripes ? '#ffffff' : P.body.l, { op: P.stripes ? 0.5 : 1 });
  if (P.shine) s += shine(40, 56, 104, 90, 0.36);
  // Straps and studs.
  for (const x of [25, 85]) {
    s += path(rr(x, 52, 10, 39.5, 0), T.c, { sw: 2.2 }) + path(rr(x + 1.6, 53.5, 2, 36, 1), T.l, { op: 0.8 }) + path(rr(x + 6.6, 53.5, 2.2, 36.5, 1), T.d, { op: 0.6 });
    s += rivet(x + 5, 60, T, 1.7) + rivet(x + 5, 71.5, T, 1.7) + rivet(x + 5, 83, T, 1.7);
  }
  s += path(box, 'none', { sw: 3 });
  // Corner caps.
  for (const m of [1, -1]) {
    const x = m > 0 ? 12 : 108;
    s += path(`M${x} 79L${x + 11 * m} 91.5H${x + 5 * m}Q${x} 91.5 ${x} 86.5Z`, T.c, { sw: 2.2 }) + rivet(x + 3.4 * m, 87.4, T, 1.3);
  }
  s += ticketWheel(60, 70.5, P);
  return s;
}

/** Ticket stubs poking out from under the lid, on the front (drawn before the lid). */
function seamTickets() {
  return ticket(41.2, 58.5, 8.6, 20, 9, TICKETS[0]) + ticket(78.6, 57.5, 8.6, 18, -8, TICKETS[1]);
}

const BULBS = [[42, 44], [42, 37.5], [44.2, 30.8], [49.6, 26.2], [56, 24.4], [64, 24.4], [70.4, 26.2], [75.8, 30.8], [78, 37.5], [78, 44]];

/** The vault's domed lid. k (the glow) lights the marquee: half the bulbs from 0.3, all of them and the star from 0.6. */
function vaultLid(P, LK, k = 0) {
  const T = P.trim;
  const id = uid('lid');
  let s = surface(DOME, P, { band: 8 });
  // Shade low on the dome, highlight across the top.
  s += path('M10 43C10 41 10 39 10 39V54H110V39C110 41 110 43 110 43Z', shadeFill(P).fill, { op: shadeFill(P).op });
  s += line('M20 30C28 22.5 42 19.5 60 19.5C78 19.5 92 22.5 100 30', P.stripes ? '#ffffff' : P.body.l, 3, { op: P.stripes ? 0.6 : 1 });
  // Straps over the dome (clipped to it).
  const strap = (x) => path(rr(x, 10, 10, 40, 0), T.c) + path(rr(x + 1.6, 10, 2, 38, 1), T.l, { op: 0.8 }) + path(rr(x + 6.6, 10, 2.2, 38, 1), T.d, { op: 0.6 }) + line(`M${x} 10V50M${x + 10} 10V50`, O, 2.2);
  s += `<defs><clipPath id="${id}"><path d="${DOME}"/></clipPath></defs><g clip-path="url(#${id})">${strap(25)}${strap(85)}</g>`;
  s += rivet(30, 26, T, 1.7) + rivet(90, 26, T, 1.7) + rivet(30, 38, T, 1.7) + rivet(90, 38, T, 1.7);
  // The marquee panel: a framed sign with a star and a ring of bulbs.
  const panel = 'M40 46V33C40 26 48 22.5 60 22.5C72 22.5 80 26 80 33V46Z';
  s += path(panel, T.c, { sw: 2.4 }) + path('M44 45V34C44 29.5 50 26.5 60 26.5C70 26.5 76 29.5 76 34V45Z', P.stripes ? '#4a2380' : mix(P.body.d, O, 0.35), { sw: 1.6 });
  const starLit = k >= 0.6;
  if (starLit) {
    const sg = uid('star');
    const col = P.stripes ? '#ff8ae0' : P.glow;
    s += `<defs><radialGradient id="${sg}"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="0.35" stop-color="${col}" stop-opacity="0.9"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>`;
    s += `<ellipse cx="60" cy="36.6" rx="14" ry="9.6" fill="url(#${sg})" class="ch-leak">${loop('opacity', '1;0.75;1', 0.9)}</ellipse>`;
    s += path(starPath(60, 36.5, 7, 3.1), P.light, { sw: 1.6 }) + path(starPath(59.2, 35.6, 2.8, 1.2), '#ffffff');
  } else {
    s += path(starPath(60, 36.5, 6.4, 2.8), P.stripes ? '#ffd23a' : T.c, { sw: 1.6 }) + path(starPath(59.2, 35.6, 2.6, 1.1), T.l, { op: 0.85 });
  }
  BULBS.forEach(([x, y], i) => {
    const lit = k >= 0.6 || (k >= 0.3 && i % 2 === 0);
    if (lit) s += circ(x, y, 3.3, LK.bulb(i), { op: 0.55 }) + circ(x, y, 1.9, P.light, { sw: 1 }) + circ(x - 0.45, y - 0.45, 0.7, '#ffffff');
    else s += circ(x, y, 1.6, P.bulbs, { sw: 1 });
  });
  s += path(DOME, 'none', { sw: 3 });
  // The lid's front band, with the hasp that drops onto the wheel.
  s += path(rr(8.5, 45.5, 103, 9.5, 2.5), T.c, { sw: 2.6 }) + path(rr(11, 47, 98, 2, 1), T.l, { op: 0.85 }) + path(rr(10, 51.6, 100, 2.4, 1), T.d, { op: 0.55 });
  for (const x of [17, 103]) s += rivet(x, 50.3, T, 1.5);
  s += path(rr(55, 49, 10, 10, 2.5), T.c, { sw: 2.2 }) + path(rr(56.6, 50.4, 2.2, 6, 1), T.l, { op: 0.8 });
  return s;
}

function vaultSvg(grade, open, glow) {
  const P = LOOKS.vault[grade];
  const LK = lightKit(P);
  let s = LK.defs + ell(60, 95.5, 50, 4.4, O, { op: 0.2 });
  const k = Math.max(0, Math.min(1, glow));
  if (open) {
    // The lid swings back: we see its lining above the box.
    const T = P.trim;
    const lidOut = 'M11 50L7.5 17C7 9.5 27 4 60 4C93 4 113 9.5 112.5 17L109 50Z';
    const lidIn = 'M17 49L14.4 19.4C14.2 14 32 10 60 10C88 10 105.8 14 105.6 19.4L103 49Z';
    s += path(lidOut, T.c, { sw: 3 }) + path(lidIn, P.lining, { sw: 2 });
    // Quilted lining: a diamond tuft pattern with little buttons.
    const cid = uid('lin');
    let tuft = '';
    for (let x = -40; x <= 160; x += 13) tuft += `M${x} 0L${x + 50} 50M${x} 0L${x - 50} 50`;
    let buttons = '';
    for (let row = 0; row < 3; row++) for (let x = 8 + (row % 2) * 6.5; x < 112; x += 13) buttons += circ(x, 17.5 + row * 13, 1.1, mix(P.lining, '#ffffff', 0.3));
    s += `<defs><clipPath id="${cid}"><path d="${lidIn}"/></clipPath></defs><g clip-path="url(#${cid})">${line(tuft, mix(P.lining, O, 0.45), 1.2)}${buttons}${path('M17 49L14.4 19.4C14.2 14 32 10 60 10C40 13 22 16 24 24L26 49Z', '#ffffff', { op: 0.12 })}</g>`;
    s += line('M14 13.5C28 8.2 92 8.2 106 13.5', T.l, 1.6, { op: 0.9 });
    // Marquee bulbs round the lid's rim, all lit now.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const x = 12 + t * 96;
      const y = 7.6 + Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 6.4;
      s += circ(x, y, 1.7, P.light, { sw: 1 });
    }
    s += burst(60, 47, P, grade, 66, 0.8);
    s += vaultBody(P);
    // The open top, heaped with loot.
    const rim = poly([[15, 43], [105, 43], [109.5, 52.5], [10.5, 52.5]]);
    s += path(rim, T.c, { sw: 2.6 }) + path(poly([[19.5, 45], [100.5, 45], [103.6, 51], [16.4, 51]]), '#fff8d8', { sw: 1.8 });
    s += path('M24 51C30 41 44 38.5 60 38.5C76 38.5 90 41 96 51Z', '#ffc93a', { sw: 2.2 }) + path('M30 49C36 43 46 41.5 56 41.5', '#fff0a0', { op: 0.9 });
    s += lootCoin(38, 45.5, 4.4) + lootCoin(52, 41.5, 4.6) + lootCoin(68, 42, 4.6) + lootCoin(83, 46, 4.2);
    s += ticket(33, 30, 13, 7.5, -28, TICKETS[0]) + ticket(87, 26, 13, 7.5, 24, TICKETS[2]) + ticket(61, 17, 7.5, 13, 8, TICKETS[1]) + ticket(47, 25, 7, 12, -14, TICKETS[3]);
    s += lootCoin(74, 28, 4.4, 20) + lootCoin(22, 37, 3.8, -15) + lootCoin(99, 37, 3.8, 15);
    s += sparkle(40, 13, 4.2) + sparkle(80, 11, 3.4, '#ffffff', { delay: 0.3 }) + sparkle(104, 28, 3, '#ffffff', { delay: 0.6 }) + sparkle(17, 27, 3, '#ffffff', { delay: 0.45 });
    s += sparkles(P, [[19, 64, 3.4], [103, 70, 3], [48, 86, 2.6], [73, 84, 2.4], [96, 58, 2.2]]);
    return s;
  }
  s += halo(60, 59, 82, 58, P, Math.min(1, k * 1.2));
  s += vaultBody(P);
  s += seamTickets();
  s += vaultLid(P, LK, k);
  if (k > 0) {
    // Three stages, like the crate: the lid seam; then (from 0.3) half the bulbs, the dome
    // seam and a ring round the wheel; then (from 0.6) every bulb, the star and rays off the dome.
    const k2 = Math.max(0, k - 0.3) / 0.7;
    const k3 = Math.max(0, k - 0.6) / 0.4;
    const leak =
      seamLight('M11 55.6H54M66 55.6H109', P, LK, 0.35 + 0.65 * k) +
      seamLight('M49 72.5A11.2 11.2 0 0 0 71 72.5', P, LK, k * 0.6) +
      seamLight('M12 45.4H38.6M81.4 45.4H108', P, LK, k2 * 0.9) +
      (k >= 0.45 ? seamLight(ringD(60, 70.5, 14.6), P, LK, 0.25 + 0.5 * k2) : '');
    const rays = beams([[8, 55.6, -76, 10], [8, 55.6, -102, 8], [112, 55.6, 76, 10], [112, 55.6, 102, 8]], LK, k) + (k3 > 0 ? beams([[29, 21.4, -32, 9], [44, 16.8, -13, 11], [60, 15, 0, 12], [76, 16.8, 13, 11], [91, 21.4, 32, 9]], LK, 0.3 + 0.7 * k3, 4) : '');
    s += `<g class="ch-leak">${loop('opacity', '1;0.72;1', 0.9)}${rays + leak}</g>`;
  }
  s += sparkles(P, [[104, 30, 4], [16, 66, 3.4], [96, 80, 3], [22, 33, 2.6], [50, 86, 2.4]]);
  return s;
}

// --- exports ----------------------------------------------------------------------------------

/**
 * A chest. kind 'crate' | 'vault'; grade 0..3 (plain, silver, gold, rainbow);
 * open: lid off with light bursting out; glow 0..1: light from the seams;
 * anim (default true): built-in SMIL loops (false = a static picture).
 * viewBox 0 0 120 100, stands on (60, 95).
 */
export function chestSvg(kind, { grade = 0, open = false, glow = 0, anim = true } = {}) {
  const gr = Math.max(0, Math.min(3, Math.round(grade) || 0));
  const k = kind === 'vault' ? 'vault' : 'crate';
  ANIM = anim !== false;
  try {
    const inner = k === 'vault' ? vaultSvg(gr, !!open, +glow || 0) : crateSvg(gr, !!open, +glow || 0);
    return `<svg class="chest chest-${k} g-${gr}${open ? ' open' : ''}" viewBox="0 0 120 100" overflow="visible" aria-hidden="true">${inner}</svg>`;
  } finally {
    ANIM = true;
  }
}

/** A soft ground shadow for a chest, viewBox 0 0 120 20 (centre at 60, 10). */
export function chestShadowSvg() {
  return `<svg class="chest-shadow" viewBox="0 0 120 20" aria-hidden="true"><ellipse cx="60" cy="10" rx="54" ry="7" fill="${O}" opacity="0.22"/><ellipse cx="60" cy="10" rx="36" ry="4.4" fill="${O}" opacity="0.16"/></svg>`;
}

const CLASS_COL = {
  brawler: ['#e8483f', '#b52f2b'],
  shooter: ['#3d8bf0', '#2a6cc8'],
  medic: ['#36c06a', '#23944f'],
  tinker: ['#f0a81e', '#c27f00'],
};

/** A Badge: a round stitched patch in the class colour with its symbol. viewBox 0 0 24 24. */
export function badgeTokenSvg(cls) {
  const known = Object.hasOwn(CLASS_COL, cls);
  const [c, d] = known ? CLASS_COL[cls] : ['#c9b48f', '#9a8664'];
  const glyph = known ? classGlyph(cls, { c: WHITE, d: '#dccfbd', mono: true }) : path(starPath(12, 12.4, 6.6, 3), WHITE, { sw: 2 });
  return (
    `<svg class="badge-token b-${known ? cls : 'any'}" viewBox="0 0 24 24" aria-hidden="true">` +
    circ(12, 12, 10.6, c, { sw: 2 }) +
    path('M2.6 13.4A9.6 9.6 0 0 0 21.4 13.4A9.4 9.4 0 0 1 2.6 13.4Z', d) +
    `<circle cx="12" cy="12" r="8.2" fill="none" stroke="#ffffff" stroke-width="1" stroke-dasharray="1.5 1.3" opacity="0.8"/>` +
    g(glyph, { tf: 'translate(12 12.2) scale(0.66) translate(-12 -12)' }) +
    path('M4.6 9.2A8.2 8.2 0 0 1 8.4 4.6', 'none', { stroke: '#ffffff', sw: 1.4, cap: true, op: 0.6 }) +
    `</svg>`
  );
}

/** A coin, viewBox 0 0 24 24. */
export const coinSvg = () => `<svg class="loot-coin" viewBox="0 0 24 24" aria-hidden="true">${coinBody()}</svg>`;

/** A gem, viewBox 0 0 24 24. */
export const gemSvg = () => `<svg class="loot-gem" viewBox="0 0 24 24" aria-hidden="true">${gemBody()}</svg>`;
