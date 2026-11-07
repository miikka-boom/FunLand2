// Thrill Hill art: the park scene, its rides, the Ferris wheel, souvenirs, the
// bus, zombies, raid backdrops and threat badges. Pure functions that return
// SVG strings: no DOM, no image files, safe to import in node tests.
//
// Look: a sunny toy-box park. Thick warm outlines (#2a1b12), flat fills with one
// shade and one highlight, round chunky shapes, goofy green zombies.
//
// The park is a fixed logical scene of 960×300 (PARK). The UI scales it with
// scale = min(W / 960, H / 300), anchored bottom-centre. parkBackSvg() bleeds
// sky above and hills to the sides (overflow: visible), so any extra area is
// already painted; PARK.sky / PARK.ground are the matching CSS fallbacks.
//
// Draw order (back to front):
//   parkBackSvg → souvenirs with z 'back' → wheelSvg → buildings (by y) →
//   [souvenirs with z 'front' + bus + people, sorted together by bottom/feet y] → fence zombies
// Every sprite is 1 viewBox unit = 1 scene unit. Zombies differ in size on purpose:
// give each its own viewBox size × ~0.82 in the park (walker ≈ 46 tall) rather than one fixed box.
//
// Animation hooks (CSS the UI may add):
//   .wheel-rot   rotate 0→360deg, linear, slow (origin is set inline)
//   .gondola     the same animation in reverse, same duration (origin set inline)
//   .z-arm       small rotate wobble (origin is the shoulder, set inline)
//   .park-fire   flicker (scaleY) on the campfire flames (origin set inline)
//   .confetti    twinkle / fade on neon-stage confetti bits
//   .z-sparkle   twinkle on the golden zombie's sparkles
//   .gondola.lit glow pulse if wanted
// e.g. @keyframes spin { to { transform: rotate(360deg) } }
//      .wheel-rot { animation: spin 80s linear infinite }
//      .gondola   { animation: spin 80s linear infinite reverse }

// --- Palette and tiny helpers ----------------------------------------------------------------

const O = '#2a1b12';
const SKY = '#8fd8ff';
const SKY2 = '#c9f0ff';
const GRASS = '#7ccf4a';
const GRASS_D = '#5fb03a';
const GRASS_L = '#a3e26e';
const SAND = '#f3d9a4';
const SAND_D = '#dcb879';
const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const WHITE = '#fffaf0';
const RED = '#e8483f';
const BLUE = '#3d8bf0';
const GREEN = '#36c06a';
const YELLOW = '#f5b82e';
const PURPLE = '#b25cff';
const GOLD = '#ffc23a';
const PINK = '#ff7ab8';
const ORANGE = '#ff9a3c';
const ZSKIN = '#9fd46a';
const ZSHADE = '#6fa646';
const ZLIGHT = '#c4ec8e';
const RUBBER = '#3d3540';
const STEEL = '#a9b0ba';
const CONFETTI = [RED, BLUE, GREEN, YELLOW, PURPLE, PINK];

let UID = 0;
const uid = (p) => `th-${p}-${++UID}`;

const f = (n) => Math.round(n * 10) / 10;

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const dk = (c, t = 0.22) => mix(c, '#2a1b12', t);
const lt = (c, t = 0.4) => mix(c, '#ffffff', t);

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

function st(o) {
  let s = '';
  if (o.sw) s += ` stroke="${o.stroke || O}" stroke-width="${o.sw}" stroke-linejoin="round"`;
  if (o.cap) s += ' stroke-linecap="round"';
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.cls) s += ` class="${o.cls}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  if (o.rule) s += ` fill-rule="${o.rule}"`;
  if (o.style) s += ` style="${o.style}"`;
  return s;
}
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${st(o)}/>`;
const path = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${st(o)}/>`;
const circ = (cx, cy, r, fill, o = {}) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${st(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${st(o)}/>`;
const line = (d, color, w, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${o.butt ? 'butt' : 'round'}" stroke-linejoin="round"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
const g = (inner, o = {}) => `<g${st(o)}>${inner}</g>`;
/** An outlined stroke: a fat dark line under a coloured one. */
const stick = (d, color, w, ow = 2.4) => line(d, O, w + ow) + line(d, color, w);

function svg(w, h, inner, o = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${o.cls ? ` class="${o.cls}"` : ''}${o.par ? ` preserveAspectRatio="${o.par}"` : ''}${o.over ? ' overflow="visible"' : ''}>${inner}</svg>`;
}

/** Smooth path through points (Catmull-Rom). */
function smooth(pts, closed = false, k = 1) {
  const n = pts.length;
  const get = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) * k) / 6, p1[1] + ((p2[1] - p0[1]) * k) / 6];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * k) / 6, p2[1] - ((p3[1] - p1[1]) * k) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/** Point on a quadratic curve. */
function qpt(a, c, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

/** Union of circles with one merged outline (+ optional shade rim and highlight). */
function blob(circles, fill, o = {}) {
  const sw = o.sw ?? 3;
  const ol = o.stroke || O;
  let s = circles.map(([x, y, r]) => circ(x, y, r + sw / 2, ol)).join('');
  if (o.shade) {
    s += circles.map(([x, y, r]) => circ(x, y, r, o.shade)).join('');
    s += circles.map(([x, y, r]) => circ(x - r * 0.06, y - r * 0.14, r * 0.86, fill)).join('');
  } else s += circles.map(([x, y, r]) => circ(x, y, r, fill)).join('');
  if (o.light) s += circles.map(([x, y, r]) => (r > 5 ? circ(x - r * 0.25, y - r * 0.38, r * 0.42, o.light) : '')).join('');
  return s;
}

const shadow = (cx, cy, rx, ry = 5) => ell(cx, cy, rx, ry, O, { op: 0.16 });

function bulb(x, y, on = true, r = 2.3) {
  return (on ? circ(x, y, r * 2.3, '#ffe27a', { op: 0.35 }) : '') + circ(x, y, r, on ? '#fff4b8' : '#d9cba6', { sw: 1.2 });
}
function bulbsOnQ(a, c, b, n, t0 = 0.08, t1 = 0.92, r = 2.3) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = qpt(a, c, b, t0 + ((t1 - t0) * i) / Math.max(1, n - 1));
    s += bulb(x, y, true, r);
  }
  return s;
}
function bulbsOnLine(x1, y1, x2, y2, n, r = 2.3) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    s += bulb(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, true, r);
  }
  return s;
}

/** A pennant on a pole; base of pole at (x, y). */
function flag(x, y, h, color, dir = 1, wave = true) {
  const t = y - h;
  const fw = 15 * dir;
  const fl = wave ? `M${f(x)} ${f(t + 1)}Q${f(x + fw * 0.5)} ${f(t - 2)} ${f(x + fw)} ${f(t + 3)}L${f(x + fw * 0.9)} ${f(t + 7)}L${f(x + fw)} ${f(t + 11)}Q${f(x + fw * 0.5)} ${f(t + 8)} ${f(x)} ${f(t + 10)}Z` : `M${f(x)} ${f(t + 1)}L${f(x + fw)} ${f(t + 6)}L${f(x)} ${f(t + 11)}Z`;
  return stick(`M${f(x)} ${f(y)}V${f(t)}`, '#e8e2d6', 1.6, 2) + path(fl, color, { sw: 1.8 }) + circ(x, t - 1.5, 2.2, GOLD, { sw: 1.3 });
}

/** A string of triangular pennants hanging between two points. */
function bunting(x1, y1, x2, y2, sag, n, cols = CONFETTI) {
  const c = [(x1 + x2) / 2, (y1 + y2) / 2 + sag * 2];
  let s = line(`M${f(x1)} ${f(y1)}Q${f(c[0])} ${f(c[1])} ${f(x2)} ${f(y2)}`, O, 1.3);
  for (let i = 0; i < n; i++) {
    const [px, py] = qpt([x1, y1], c, [x2, y2], (i + 0.5) / n);
    s += path(`M${f(px - 4)} ${f(py)}L${f(px + 4)} ${f(py)}L${f(px)} ${f(py + 8)}Z`, cols[i % cols.length], { sw: 1.2 });
  }
  return s;
}

/** A neon tube: glow, coloured core, white hot centre. */
function neon(d, color, w = 3) {
  return line(d, color, w * 3.4, { op: 0.25 }) + line(d, O, w + 2.2) + line(d, color, w) + line(d, '#ffffff', w * 0.38, { op: 0.8 });
}

/** A small confetti cannon on the ground at (x, y), aiming up and outward (dir ±1). */
function cannon(x, y, dir = 1, col = RED) {
  const ang = dir > 0 ? -70 : -110;
  const rad = (ang * Math.PI) / 180;
  const by = y - 5;
  let s = g(rect(x - 3, by - 5, 18, 10, col, { rx: 3, sw: 2 }) + rect(x + 12, by - 6.5, 4.5, 13, GOLD, { rx: 1.5, sw: 1.6 }) + rect(x, by - 3, 9, 2.5, lt(col, 0.4), { rx: 1 }), { tf: `rotate(${ang} ${f(x)} ${f(by)})` });
  s += circ(x, y - 4, 4.6, WOOD_D, { sw: 2 }) + circ(x, y - 4, 1.4, GOLD);
  const mx = x + Math.cos(rad) * 19;
  const my = by + Math.sin(rad) * 19;
  let c = '';
  for (let i = 0; i < 11; i++) {
    const a = rad + (i - 5) * 0.17;
    const d = 5 + ((i * 7) % 4) * 3.4 + (i % 2) * 2;
    const px = mx + Math.cos(a) * d;
    const py = my + Math.sin(a) * d;
    c += i % 3 === 0 ? circ(px, py, 1.7, CONFETTI[i % 6]) : rect(px - 1.4, py - 2.6, 2.8, 5.2, CONFETTI[i % 6], { tf: `rotate(${(i * 53) % 180} ${f(px)} ${f(py)})` });
  }
  s += g(c, { cls: 'confetti' });
  return s;
}

/** Patch with stitches. */
function patch(x, y, w, h, fill, rot = 0) {
  return g(rect(x, y, w, h, fill, { sw: 1.6, rx: 1 }) + rect(x + 2, y + 2, w - 4, h - 4, 'none', { sw: 0.9, op: 0.55 }).replace('/>', ' stroke-dasharray="2 1.6"/>'), { tf: `rotate(${rot} ${f(x + w / 2)} ${f(y + h / 2)})` });
}

function star(cx, cy, r, fill, o = {}) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
  }
  return path(d + 'Z', fill, { sw: o.sw ?? 1.6, ...o });
}

function sparkle(cx, cy, r, fill = '#fff6c8') {
  return path(`M${f(cx)} ${f(cy - r)}Q${f(cx + r * 0.18)} ${f(cy - r * 0.18)} ${f(cx + r)} ${f(cy)}Q${f(cx + r * 0.18)} ${f(cy + r * 0.18)} ${f(cx)} ${f(cy + r)}Q${f(cx - r * 0.18)} ${f(cy + r * 0.18)} ${f(cx - r)} ${f(cy)}Q${f(cx - r * 0.18)} ${f(cy - r * 0.18)} ${f(cx)} ${f(cy - r)}Z`, fill, { sw: 1 });
}

const nail = (x, y) => circ(x, y, 1.1, '#5b4636');

function tire(cx, cy, rx = 10, ry = 4.5) {
  return ell(cx, cy, rx, ry, RUBBER, { sw: 2 }) + ell(cx, cy - 0.6, rx * 0.5, ry * 0.42, '#1f1a20');
}

function tireStack(cx, by, n = 3, rx = 10) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = by - 4 - i * 7;
    s += rect(cx - rx, y - 4, rx * 2, 8, RUBBER, { rx: 3, sw: 2 }) + line(`M${f(cx - rx + 3)} ${f(y - 1.5)}H${f(cx + rx - 3)}`, '#5a525e', 1.6);
  }
  return s;
}

function ducks(x0, x1, y, n, cols = ['#ffd23f'], fallen = -1) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1);
    const c = cols[i % cols.length];
    const duck = ell(x, y - 4.5, 6.5, 4.6, c, { sw: 1.7 }) + circ(x + 4, y - 10.5, 3.6, c, { sw: 1.7 }) + path(`M${f(x + 7)} ${f(y - 11)}l4 1.2l-4 1.4z`, ORANGE, { sw: 1.2 }) + circ(x + 4.9, y - 11.4, 0.9, O) + path(`M${f(x - 6)} ${f(y - 6)}q-2 -3 1 -4`, 'none', { sw: 1.4 }) + rect(x - 1, y, 2, 3, STEEL, { sw: 1 });
    s += i === fallen ? g(duck, { tf: `rotate(-80 ${f(x)} ${f(y + 2)})` }) : duck;
  }
  return s;
}

function target(cx, cy, r, ring = RED) {
  return circ(cx, cy, r, WHITE, { sw: 1.8 }) + circ(cx, cy, r * 0.66, ring) + circ(cx, cy, r * 0.36, WHITE) + circ(cx, cy, r * 0.15, ring);
}

/** Level → look stage: 0 patched junk (1-2), 1 fresh paint (3-4), 2 neon (5-7). */
const stageOf = (level) => (level >= 5 ? 2 : level >= 3 ? 1 : 0);

// --- The scene layout ----------------------------------------------------------------------

export const PARK = {
  w: 960,
  h: 300,
  /** CSS for any area above the scene (the scene's sky reaches #8fd8ff at y = 0). */
  sky: 'linear-gradient(180deg, #5fbdf8 0%, #8fd8ff 100%)',
  /** CSS colour for any side fill (the hill below the horizon). */
  ground: '#6cc044',
  /** Buildings: (x, y) = bottom-centre anchor in scene units; w/h = drawn size (= viewBox). */
  slots: {
    striker: { x: 112, y: 218, w: 120, h: 170 },
    bigtop: { x: 262, y: 198, w: 200, h: 152 },
    tent: { x: 392, y: 220, w: 136, h: 114 },
    gallery: { x: 668, y: 220, w: 160, h: 124 },
    garage: { x: 812, y: 200, w: 168, h: 132 },
  },
  /** Ferris wheel hub and outer radius. wheelSvg() is 200×214 with its hub at (100, 100): box left x − 1.25r, top y − 1.25r, 2.5r × (2.5r + wheelStandH). */
  wheel: { x: 520, y: 94, r: 80 },
  wheelStandH: 14,
  /** Newcomers appear here (feet), just inside the arch, then walk down into the walk band. */
  gate: { x: 38, y: 212 },
  /** The squad's bus: bottom-centre. busSvg() is 124×70. */
  bus: { x: 894, y: 222, w: 124, h: 70 },
  /** Souvenirs: bottom-centre, w/h = viewBox. z: 'back' (draw before the wheel/buildings) or 'front' (after). */
  souvenirs: {
    donut: { x: 172, y: 172, w: 64, h: 150, z: 'back' },
    fountain: { x: 520, y: 228, w: 108, h: 56, z: 'front' },
    anchor: { x: 40, y: 264, w: 56, h: 66, z: 'front' },
    scoreboard: { x: 744, y: 172, w: 84, h: 140, z: 'back' },
    jet: { x: 942, y: 160, w: 60, h: 92, z: 'back' },
  },
  /** Feet band where residents wander (sand path). */
  walk: { x0: 80, x1: 848, y0: 230, y1: 256 },
  spots: {
    /** Big Top steps (sleepy residents nap here). */
    steps: { x: 262, y: 204 },
    /** Campfire pit; sit around it at x ± 20. */
    fire: { x: 196, y: 228 },
    /** Where the jumpy watch the fence. */
    fence: { x: 320, y: 256 },
    /** In front of the wheel booth (tap the wheel for the Ladder). */
    wheel: { x: 452, y: 234 },
    /** Where a ride's class trains / show-offs perform (feet). */
    rides: {
      striker: { x: 132, y: 232 },
      bigtop: { x: 262, y: 214 },
      tent: { x: 392, y: 234 },
      gallery: { x: 668, y: 234 },
      garage: { x: 812, y: 230 },
    },
    /** The three squad places beside the bus (feet). */
    squad: [
      { x: 852, y: 238 },
      { x: 878, y: 246 },
      { x: 904, y: 240 },
    ],
  },
  /** Top of the bumper-car wall along the front of the park. */
  fence: { y: 262, x0: 0, x1: 960 },
  /** Fence zombies shuffle here (feet y), outside the wall, in front of it. */
  zombieZone: { x0: 16, x1: 944, y: 298 },
};

// --- Park background -------------------------------------------------------------------------

function cloud(x, y, s) {
  const c = [
    [x - 22 * s, y - 4 * s, 11 * s],
    [x - 8 * s, y - 12 * s, 15 * s],
    [x + 10 * s, y - 9 * s, 13 * s],
    [x + 24 * s, y - 2 * s, 9 * s],
    [x, y, 12 * s],
  ];
  return blob(c, '#ffffff', { sw: 2.4, stroke: '#9fd0ee', shade: '#dff3ff' });
}

function sun(x, y) {
  let s = circ(x, y, 34, '#fff3b0', { op: 0.35 }) + circ(x, y, 26, '#fff3b0', { op: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    s += line(`M${f(x + Math.cos(a) * 24)} ${f(y + Math.sin(a) * 24)}L${f(x + Math.cos(a) * 31)} ${f(y + Math.sin(a) * 31)}`, '#ffd23f', 3.4);
  }
  return s + circ(x, y, 19, '#ffd23f', { sw: 2.4, stroke: '#f0a020' }) + circ(x - 6, y - 6, 6, '#fff3b0', { op: 0.8 });
}

/** Tiny distant house (town far below). */
function house(x, by, w, h, wall, roof, r) {
  let s = rect(x, by - h, w, h, wall, { sw: 1.2, stroke: '#7a8f86' });
  s += path(`M${f(x - 1.5)} ${f(by - h)}L${f(x + w / 2)} ${f(by - h - w * 0.45)}L${f(x + w + 1.5)} ${f(by - h)}Z`, roof, { sw: 1.2, stroke: '#7a8f86' });
  if (r() < 0.8) s += rect(x + w * 0.25, by - h * 0.7, w * 0.22, h * 0.3, r() < 0.3 ? '#8a7a6a' : '#fff6c8');
  return s;
}

function tinyZombie(x, by) {
  return rect(x - 1.2, by - 4, 2.4, 4, '#7c6aa8') + circ(x, by - 5.5, 1.9, ZSKIN, { sw: 0.7, stroke: '#4d7a3a' }) + line(`M${f(x)} ${f(by - 3.5)}h3`, ZSKIN, 0.9);
}

const LANDMARK_X = [48, 214, 404, 600, 770, 1010];

function landmark(n, x, by, reached) {
  let s = '';
  const soft = { sw: 1.3, stroke: '#6f8a80' };
  let top = by - 30;
  if (n === 1) {
    // Picnic Grove: tall round trees and a striped umbrella.
    s += rect(x - 1, by - 14, 2, 14, '#8a6a4a') + rect(x + 13, by - 10, 2, 10, '#8a6a4a') + rect(x - 15, by - 9, 2, 9, '#8a6a4a');
    s += blob([[x, by - 22, 10], [x + 14, by - 15, 7], [x - 14, by - 13, 6.5]], '#5fae4e', { sw: 1.3, stroke: '#3f7d3a' });
    s += path(`M${x + 24} ${by - 9}q6 -7 12 0z`, RED, soft) + rect(x + 29.5, by - 9, 1, 9, '#6f8a80');
    top = by - 32;
  } else if (n === 2) {
    // Suburbs: a water tower over little houses.
    s += line(`M${x - 6} ${by}L${x - 3} ${by - 26}M${x + 6} ${by}L${x + 3} ${by - 26}`, '#8796a0', 1.6);
    s += ell(x, by - 32, 9, 7, '#c8d8e6', soft) + rect(x - 9, by - 34, 18, 4, '#9cb4c8') + path(`M${x - 9} ${by - 37}Q${x} ${by - 46} ${x + 9} ${by - 37}Z`, '#e98a7a', soft);
    top = by - 46;
  } else if (n === 3) {
    // Shopping Mall: long box, stripe and a sign tower.
    s += rect(x - 28, by - 18, 56, 18, '#f3e2cf', soft) + rect(x - 28, by - 18, 56, 4, '#5fc7c0') + rect(x - 22, by - 11, 44, 6, '#bfe6f5', { sw: 1, stroke: '#6f8a80' });
    s += rect(x + 14, by - 40, 9, 22, '#f3e2cf', soft) + circ(x + 18.5, by - 34, 3.2, PINK, { sw: 1, stroke: '#6f8a80' });
    top = by - 42;
  } else if (n === 4) {
    // Harbor: sea, a crane and a boat.
    s += rect(x - 34, by - 8, 68, 8, '#5cc0ea', { sw: 1, stroke: '#4a9cc0' });
    s += line(`M${x - 8} ${by - 6}V${by - 40}M${x - 14} ${by - 38}H${x + 22}M${x + 16} ${by - 38}V${by - 26}`, '#e2584e', 2.2);
    s += path(`M${x + 6} ${by - 7}h22l-3 5h-16z`, '#fffaf0', soft) + rect(x + 10, by - 12, 6, 5, '#3d8bf0') + rect(x + 17, by - 12, 6, 5, '#f5b82e');
    top = by - 44;
  } else if (n === 5) {
    // Stadium: an oval bowl and light towers.
    s += line(`M${x - 26} ${by - 4}V${by - 38}M${x + 26} ${by - 4}V${by - 38}`, '#8796a0', 1.6);
    s += rect(x - 31, by - 44, 10, 6, '#fff6c8', soft) + rect(x + 21, by - 44, 10, 6, '#fff6c8', soft);
    s += path(`M${x - 24} ${by}L${x - 22} ${by - 16}Q${x} ${by - 22} ${x + 22} ${by - 16}L${x + 24} ${by}Z`, '#e8eef4', soft) + path(`M${x - 22} ${by - 16}Q${x} ${by - 22} ${x + 22} ${by - 16}`, 'none', { sw: 2.2, stroke: '#3d8bf0' });
    top = by - 46;
  } else {
    // Airport: control tower and a little plane.
    s += rect(x - 3, by - 34, 6, 34, '#e8eef4', soft) + path(`M${x - 8} ${by - 34}h16l-2 -8h-12z`, '#7fc4e8', soft) + rect(x - 9, by - 44, 18, 3, '#e8eef4', soft);
    s += path(`M${x + 12} ${by - 4}h22q4 0 5 2h-27zM${x + 20} ${by - 4}l4 -6h3l-1 6zM${x + 34} ${by - 4}l2 -6h2l0 6z`, '#fffaf0', soft);
    top = by - 46;
  }
  if (reached) s += flag(x, top + 2, 14, GOLD, 1, false).replace(/stroke-width="2"/, 'stroke-width="1.6"');
  return s;
}

/** A bumper car, side view (part of the wall). dir 1 = nose to the right. */
function wallCar(x, by, w, color, rot, r, dir = 1) {
  const h = w * 0.44;
  const L = -w / 2;
  const R = w / 2;
  let s = '';
  // Seat back with headrest at the rear.
  s += rect(L + 5, by - h * 1.3, w * 0.26, h * 0.62, '#4a3a4a', { rx: 4, sw: 2.2 }) + rect(L + 8, by - h * 1.24, w * 0.08, h * 0.4, '#6a5a6a', { rx: 2 });
  // Steering column and wheel.
  s += stick(`M${f(w * 0.12)} ${f(by - h * 0.85)}L${f(w * 0.2)} ${f(by - h * 1.12)}`, '#5a525e', 1.6, 1.8) + ell(w * 0.2, by - h * 1.14, 4.6, 1.9, '#5a525e', { sw: 1.6 });
  // Hull.
  s += path(`M${f(L + 1)} ${f(by - h * 0.42)}L${f(L + 3)} ${f(by - h * 0.78)}Q${f(L + 4)} ${f(by - h * 0.92)} ${f(L + 13)} ${f(by - h * 0.92)}L${f(R - 18)} ${f(by - h * 0.92)}Q${f(R - 2)} ${f(by - h * 0.9)} ${f(R + 1)} ${f(by - h * 0.42)}Z`, color, { sw: 2.6 });
  s += path(`M${f(L + 6)} ${f(by - h * 0.8)}L${f(R - 18)} ${f(by - h * 0.8)}`, 'none', { sw: 2.6, stroke: lt(color, 0.45), cap: true });
  s += path(`M${f(R - 14)} ${f(by - h * 0.86)}Q${f(R - 4)} ${f(by - h * 0.8)} ${f(R - 2)} ${f(by - h * 0.5)}L${f(R - 8)} ${f(by - h * 0.5)}Z`, O, { op: 0.12 });
  // Rubber skirt.
  s += rect(L - 3, by - h * 0.5, w + 6, h * 0.5, RUBBER, { rx: h * 0.24, sw: 2.6 }) + line(`M${f(L + 3)} ${f(by - h * 0.32)}H${f(R - 3)}`, '#5a525e', 2);
  // Decal.
  const deco = r();
  if (deco < 0.45) s += circ(-w * 0.06, by - h * 0.7, 5, WHITE, { sw: 1.4 }) + star(-w * 0.06, by - h * 0.7, 3.6, color, { sw: 0.9 });
  else if (deco < 0.7) s += star(-w * 0.06, by - h * 0.7, 4.6, GOLD, { sw: 1.3 });
  else if (deco < 0.85) s += patch(-w * 0.18, by - h * 0.86, 10, 7, WOOD_L, -8) + nail(-w * 0.18 + 2, by - h * 0.84);
  return g(s, { tf: `translate(${f(x)} 0) rotate(${f(rot)} 0 ${f(by)})${dir < 0 ? ' scale(-1 1)' : ''}` });
}

function cone(x, by) {
  return path(`M${x - 7} ${by}h14l-5 -16h-4z`, ORANGE, { sw: 2 }) + rect(x - 4.6, by - 9, 9.2, 3, WHITE) + rect(x - 9, by - 2, 18, 3, ORANGE, { sw: 1.6, rx: 1 });
}

function fence(x0, x1, by, ph) {
  // Little wooden picket strip along the back edge (behind everything).
  let s = line(`M${x0} ${by - 7}H${x1}`, '#a87a52', 2.2) + line(`M${x0} ${by - 3}H${x1}`, '#a87a52', 2.2);
  for (let x = x0 + ph; x < x1; x += 9) s += path(`M${x - 2} ${by}v-10l2 -3l2 3v10z`, '#e9c99a', { sw: 1.1, stroke: '#8c6644' });
  return s;
}

/**
 * The static park background for the 960×300 scene: sky, distant hills, the
 * zombie town in the valley, the hilltop, paths, campfire, gate and the
 * bumper-car wall. zone 1..6 puts a little gold flag on each reached zone's
 * landmark in the distant town and adds bunting from zone 4.
 */
export function parkBackSvg(zone = 1) {
  const sky = uid('sky');
  const r = rng(7);
  let s = `<defs><linearGradient id="${sky}" gradientUnits="userSpaceOnUse" x1="0" y1="-320" x2="0" y2="150"><stop offset="0" stop-color="#5fbdf8"/><stop offset="0.68" stop-color="${SKY}"/><stop offset="1" stop-color="${SKY2}"/></linearGradient></defs>`;
  s += rect(-900, -420, 2760, 590, `url(#${sky})`);
  s += sun(70, 38);
  for (const [x, y, k] of [[-260, 40, 1.1], [-40, 70, 0.8], [214, 30, 1], [372, 64, 0.75], [640, 24, 1.15], [830, 58, 0.8], [1080, 36, 1], [1300, 66, 0.9]]) s += cloud(x, y, k);
  // Far hills.
  s += path(smooth([[-900, 132], [-700, 100], [-480, 118], [-260, 96], [-60, 114], [120, 96], [300, 110], [470, 90], [640, 108], [820, 94], [1000, 112], [1200, 98], [1450, 116], [1700, 102], [1860, 128]]) + 'L1860 180L-900 180Z', '#b9e6cf', { sw: 2, stroke: '#93cdb7' });
  s += path(smooth([[-900, 132], [-640, 118], [-380, 128], [-120, 114], [140, 122], [380, 112], [620, 124], [860, 112], [1100, 124], [1380, 114], [1860, 126]]) + 'L1860 180L-900 180Z', '#a3d98b', { sw: 2, stroke: '#82c06e' });
  // Town in the valley.
  const walls = ['#f7d7a6', '#f4b8a8', '#c9dcf5', '#f5ecc4', '#d8c6f0', '#c6e8b8'];
  const roofs = ['#d86a5a', '#7a74b8', '#5f9fd8', '#c98a4b', '#e08ab0'];
  for (let x = -460; x < 1420; ) {
    const w = 7 + Math.floor(r() * 8);
    const by = 140 + Math.floor(r() * 10);
    const nearL = LANDMARK_X.some((lx) => Math.abs(lx - x) < 40);
    if (!nearL || r() < 0.3) s += house(x, by, w, 5 + Math.floor(r() * 7), walls[Math.floor(r() * walls.length)], roofs[Math.floor(r() * roofs.length)], r);
    if (r() < 0.12) s += tinyZombie(x + w + 4, by + 2);
    x += w + 4 + Math.floor(r() * 12);
  }
  LANDMARK_X.forEach((x, i) => (s += landmark(i + 1, x, 146, zone >= i + 1)));
  // The hill.
  s += path('M-900 300L-900 236Q-520 220 -230 188Q-90 170 -10 152L970 152Q1050 170 1190 188Q1480 220 1860 236L1860 300Z', '#6cc044', { sw: 3 });
  s += path('M-900 300L-900 262Q-520 246 -240 214Q-120 200 -40 196L-40 300ZM1860 300L1860 262Q1480 246 1200 214Q1080 200 1000 196L1000 300Z', GRASS_D, { op: 0.6 });
  // Plateau top.
  s += path('M-24 160Q-4 150 40 150L920 150Q964 150 984 160L1010 266L-50 266Z', GRASS);
  // Back edge: hedge, picket fence and mini bumper cars.
  s += fence(-20, 980, 156, 3);
  const bush = [];
  for (let x = -30; x < 1000; x += 26 + ((x * 7) % 11)) bush.push([x, 154 + ((x * 13) % 5), 9 + ((x * 3) % 5)]);
  s += blob(bush, '#5aab3e', { sw: 2.4, shade: '#4a9634', light: '#79c654' });
  const cars = [RED, BLUE, GREEN, YELLOW, PURPLE];
  for (let i = 0, x = -10; x < 990; x += 46, i++) if (i % 2 === 0) s += wallCar(x, 164, 28, cars[i % 5], (i % 3) - 1, r, i % 4 ? 1 : -1);
  // Grass texture.
  for (let i = 0; i < 70; i++) {
    const x = -20 + r() * 1000;
    const y = 166 + r() * 94;
    s += line(`M${f(x - 3)} ${f(y)}l1.5 -4M${f(x)} ${f(y)}l0 -5M${f(x + 3)} ${f(y)}l-1.5 -4`, GRASS_D, 1.4);
  }
  for (let i = 0; i < 40; i++) {
    const x = -20 + r() * 1000;
    const y = 168 + r() * 90;
    const c = [WHITE, '#ffe066', '#ff9ccf', '#c9a8ff'][i % 4];
    s += circ(x, y, 2.2, c, { sw: 0.9 }) + circ(x, y, 0.8, i % 4 === 1 ? ORANGE : '#ffd23f');
  }
  // Sand paths: main band + branches to every door, the plaza and the gate.
  const P = [];
  P.push(['r', 20, 214, 930, 46, 23]);
  P.push(['e', 520, 222, 122, 20]);
  for (const k of ['striker', 'bigtop', 'tent', 'gallery', 'garage']) {
    const sl = PARK.slots[k];
    P.push(['r', sl.x - 20, sl.y - 12, 40, 240 - sl.y, 10]);
  }
  P.push(['r', 16, 196, 46, 40, 14]);
  P.push(['r', 862, 204, 84, 30, 14]);
  const shapes = (fill, grow, dy = 0) =>
    P.map((p) => (p[0] === 'r' ? rect(p[1] - grow, p[2] - grow + dy, p[3] + grow * 2, p[4] + grow * 2, fill, { rx: p[5] + grow }) : ell(p[1], p[2] + dy, p[3] + grow, p[4] + grow, fill))).join('');
  s += shapes(SAND_D, 3) + shapes(SAND, 0) + shapes('#f8e6bf', -6, -3);
  for (let i = 0; i < 46; i++) {
    const x = 40 + r() * 890;
    const y = 220 + r() * 36;
    s += ell(x, y, 2 + r() * 2, 1.2 + r(), SAND_D, { op: 0.7 });
  }
  // Plaza tiles ring around the fountain.
  s += ell(520, 224, 76, 12, 'none', { sw: 2, stroke: '#e6c68a' });
  // Campfire.
  const F = PARK.spots.fire;
  s += ell(F.x, F.y + 1, 18, 6, '#8a7a6a', { sw: 2 }) + ell(F.x, F.y, 13, 4, '#4a3a30');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    s += ell(F.x + Math.cos(a) * 15, F.y + 1 + Math.sin(a) * 5, 4.4, 3, '#b9b0a4', { sw: 1.5 });
  }
  s += stick(`M${F.x - 9} ${F.y + 1}L${F.x + 7} ${F.y - 4}`, WOOD_D, 3.6, 2) + stick(`M${F.x + 9} ${F.y + 1}L${F.x - 7} ${F.y - 4}`, WOOD, 3.6, 2);
  s += g(path(`M${F.x - 8} ${F.y - 2}Q${F.x - 9} ${F.y - 12} ${F.x - 3} ${F.y - 17}Q${F.x - 2} ${F.y - 11} ${F.x} ${F.y - 10}Q${F.x + 1} ${F.y - 20} ${F.x + 6} ${F.y - 24}Q${F.x + 5} ${F.y - 14} ${F.x + 9} ${F.y - 9}Q${F.x + 10} ${F.y - 4} ${F.x + 7} ${F.y - 2}Z`, ORANGE, { sw: 2 }) + path(`M${F.x - 4} ${F.y - 2}Q${F.x - 4} ${F.y - 8} ${F.x} ${F.y - 11}Q${F.x + 1} ${F.y - 7} ${F.x + 3} ${F.y - 7}Q${F.x + 5} ${F.y - 5} ${F.x + 3} ${F.y - 2}Z`, '#ffe066'), { cls: 'park-fire', style: `transform-origin:${F.x}px ${F.y}px;transform-box:view-box` });
  // Gate (back-left): striped posts, an arch with bulbs.
  const G = { x: 38, y: 206 };
  s += line(`M${G.x - 26} ${G.y - 2}L${G.x - 44} ${G.y + 8}M${G.x + 26} ${G.y - 2}L${G.x + 30} ${G.y + 6}`, SAND_D, 2);
  for (const px of [G.x - 26, G.x + 26]) {
    s += rect(px - 6, G.y - 88, 12, 90, WHITE, { sw: 2.6, rx: 2 });
    for (let y = G.y - 80; y < G.y; y += 16) s += path(`M${px - 6} ${y}l12 -6v8l-12 6z`, RED);
    s += rect(px - 6, G.y - 88, 12, 90, 'none', { sw: 2.6, rx: 2 }) + rect(px - 8, G.y - 4, 16, 6, WOOD_D, { sw: 2, rx: 1 }) + circ(px, G.y - 94, 5, GOLD, { sw: 2 });
  }
  s += path(`M${G.x - 34} ${G.y - 70}Q${G.x} ${G.y - 102} ${G.x + 34} ${G.y - 70}L${G.x + 34} ${G.y - 58}Q${G.x} ${G.y - 88} ${G.x - 34} ${G.y - 58}Z`, YELLOW, { sw: 2.6 });
  s += bulbsOnQ([G.x - 30, G.y - 66], [G.x, G.y - 96], [G.x + 30, G.y - 66], 7, 0.05, 0.95, 2);
  s += star(G.x, G.y - 96, 7, RED, { sw: 2 });
  // Bunting (zone 4+) high over the band, strung between the gate and the striker bell.
  if (zone >= 4) s += bunting(G.x + 30, G.y - 84, 102, 60, 6, 6);
  // Front slope below the wall.
  s += rect(-900, 270, 2760, 40, GRASS_D);
  s += path('M-900 284Q-300 278 0 282T960 280T1860 284L1860 310L-900 310Z', '#549d33');
  for (let i = 0; i < 24; i++) {
    const x = -30 + r() * 1020;
    s += ell(x, 290 + r() * 8, 6 + r() * 6, 2, '#b98a5a', { op: 0.5 });
  }
  // The bumper-car wall.
  const wc = [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE];
  let i = 0;
  for (let x = -40; x < 1010; x += 50, i++) {
    if (i % 4 === 2) {
      s += tireStack(x, 288, 3, 12);
      continue;
    }
    s += wallCar(x, 290, 54, wc[i % wc.length], (r() - 0.5) * 7, r, i % 3 === 1 ? -1 : 1);
    if (i % 7 === 5) s += cone(x + 26, 290);
  }
  return svg(960, 300, s, { cls: 'park-back', par: 'xMidYMax meet', over: true });
}

// --- Ferris wheel ----------------------------------------------------------------------------

const GONDOLA = [RED, BLUE, GREEN, YELLOW, PURPLE, ORANGE];

/**
 * The Ferris wheel, viewBox 0 0 200 214, hub at (100, 100), rim radius 78 (80 with bulbs).
 * Place it with its hub on PARK.wheel: left = x − 100, top = y − 100, size 200×214
 * (= 2.5r × (2.5r + PARK.wheelStandH)), 1 unit = 1 scene unit.
 * lit = 0..6 gondolas glowing (zones reached).
 * <g class="wheel-rot"> turns around the hub; each <g class="gondola"> has its
 * pivot (the hanger point) set inline, so the same animation in reverse keeps it hanging.
 */
export function wheelSvg(lit = 0) {
  const cx = 100;
  const cy = 100;
  const R = 78;
  let s = '';
  // Stand: back legs, boarding deck.
  s += shadow(cx, 210, 70, 4);
  const leg = (x0, x1) => stick(`M${cx + x0 * 0.12} ${cy}L${x0 + cx} 208`, WHITE, 6.5, 2.6) + stick(`M${cx + x1 * 0.12} ${cy}L${x1 + cx} 208`, WHITE, 6.5, 2.6);
  s += leg(-50, -36) + leg(50, 36);
  s += stick(`M${cx - 37} 174L${cx + 37} 174`, RED, 4, 2.4) + stick(`M${cx - 44} 190L${cx + 44} 190`, RED, 4, 2.4);
  s += line(`M${cx - 44} 190L${cx - 10} 124M${cx + 44} 190L${cx + 10} 124`, RED, 2.4);
  // Rotating part.
  let w = '';
  w += circ(cx, cy, R + 4, 'none', { sw: 3 });
  w += circ(cx, cy, R, 'none', { sw: 6, stroke: RED });
  w += circ(cx, cy, R - 4, 'none', { sw: 2.4 });
  w += circ(cx, cy, R + 1.5, 'none', { sw: 1.4, stroke: lt(RED, 0.5) });
  w += circ(cx, cy, 44, 'none', { sw: 5.5 }) + circ(cx, cy, 44, 'none', { sw: 2.6, stroke: YELLOW });
  let sp = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    sp += `M${f(cx + Math.cos(a) * 12)} ${f(cy + Math.sin(a) * 12)}L${f(cx + Math.cos(a) * (R - 4))} ${f(cy + Math.sin(a) * (R - 4))}`;
  }
  w += line(sp, O, 5) + line(sp, WHITE, 2.4);
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12 + Math.PI / 24;
    w += circ(cx + Math.cos(a) * (R + 0.5), cy + Math.sin(a) * (R + 0.5), 2.1, i % 2 ? '#fff4b8' : GOLD, { sw: 1.1 });
  }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const ax = f(cx + Math.cos(a) * R);
    const ay = f(cy + Math.sin(a) * R);
    const on = i < lit;
    const col = on ? GONDOLA[i] : mix(GONDOLA[i], '#e4ddd2', 0.68);
    const roof = on ? lt(GONDOLA[i], 0.15) : mix(GONDOLA[i], '#efe9e0', 0.75);
    let gd = '';
    if (on) gd += circ(ax, ay + 16, 20, '#ffe680', { op: 0.32 }) + circ(ax, ay + 16, 14, '#fff3a0', { op: 0.4 });
    gd += stick(`M${ax} ${ay}V${ay + 8}`, STEEL, 1.6, 2);
    gd += path(`M${ax - 12} ${ay + 10}H${ax + 12}L${ax + 11} ${ay + 21}Q${ax} ${ay + 28} ${ax - 11} ${ay + 21}Z`, col, { sw: 2.4 });
    gd += path(`M${ax - 9} ${ay + 22}Q${ax} ${ay + 26.5} ${ax + 9} ${ay + 22}`, 'none', { sw: 2, stroke: dk(col, 0.25), cap: true });
    gd += rect(ax - 7.5, ay + 12.5, 15, 6.5, on ? '#fff2a8' : '#8a7e74', { rx: 2, sw: 1.6 });
    if (on) gd += circ(ax - 3, ay + 17.5, 2.1, O) + circ(ax + 3, ay + 17.8, 2.1, O);
    gd += path(`M${ax - 13.5} ${ay + 11}Q${ax} ${ay + 1} ${ax + 13.5} ${ay + 11}Z`, roof, { sw: 2.2 });
    gd += path(`M${ax - 4} ${ay + 10.6}Q${ax} ${ay + 3.4} ${ax + 4} ${ay + 10.6}`, on ? WHITE : '#e8e2d8', { op: 0.9 });
    if (on) gd += sparkle(ax + 14, ay + 6, 4);
    w += `<g class="gondola${on ? ' lit' : ''}" style="transform-origin:${ax}px ${ay}px;transform-box:view-box">${gd}</g>`;
  }
  s += `<g class="wheel-rot" style="transform-origin:${cx}px ${cy}px;transform-box:view-box">${w}</g>`;
  // Hub on top (static).
  s += circ(cx, cy, 13, YELLOW, { sw: 3 }) + circ(cx, cy, 7, RED, { sw: 2 }) + circ(cx - 3, cy - 3, 2.4, WHITE, { op: 0.8 });
  // Boarding deck and a little ticket booth.
  s += rect(cx - 60, 200, 120, 12, WOOD, { sw: 2.6, rx: 3 }) + line(`M${cx - 56} 206H${cx + 56}`, WOOD_D, 1.6);
  s += rect(cx - 12, 186, 24, 16, BLUE, { sw: 2.4, rx: 2 }) + rect(cx - 7, 190, 14, 6, '#fff2a8', { sw: 1.4 });
  s += path(`M${cx - 15} 187L${cx} 178L${cx + 15} 187Z`, RED, { sw: 2.2 });
  return svg(200, 214, s, { cls: 'wheel', over: true });
}

// --- Buildings -------------------------------------------------------------------------------

function bigTopSvg(level) {
  const st0 = stageOf(level);
  const W = 200;
  const H = 152;
  const cx = 100;
  const A = [mix(RED, '#c9a78a', 0.42), RED, RED][st0];
  const B = ['#eadcbf', WHITE, WHITE][st0];
  const wallA = [mix(RED, '#b49a80', 0.5), RED, PURPLE][st0];
  const wallB = ['#e2d2b2', WHITE, '#e7cfff'][st0];
  const val = ['#d4b05e', YELLOW, GOLD][st0];
  let s = shadow(cx, 147, 92, 6);
  // Stage 2 extras behind.
  if (st0 === 2) s += bunting(cx, 30, 6, 92, 4, 6) + bunting(cx, 30, 194, 92, 4, 6, [BLUE, GOLD, PINK, GREEN, RED, PURPLE]);
  // Drum (walls).
  const N = 9;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(cx - 72 * Math.cos((Math.PI * i) / N));
  const yb = (x) => 140 + 8 * (1 - ((x - cx) / 72) ** 2);
  for (let i = 0; i < N; i++) {
    const c = i % 2 ? wallB : wallA;
    const t = (i + 0.5) / N;
    const fill = t > 0.7 ? dk(c, 0.14) : t < 0.25 ? lt(c, 0.12) : c;
    s += path(`M${f(xs[i])} 98L${f(xs[i + 1])} 98L${f(xs[i + 1])} ${f(yb(xs[i + 1]))}L${f(xs[i])} ${f(yb(xs[i]))}Z`, fill);
  }
  s += path(`M28 98L28 140Q${cx} 156 172 140L172 98Z`, 'none', { sw: 3 });
  if (st0 === 2) for (let i = 0; i < 4; i++) s += star(44 + i * 37 + (i > 1 ? 34 : 0), 124 - (i % 2) * 6, 4.5, GOLD, { sw: 1.3 });
  // Entrance with tied curtains, a bunk peeking out.
  const inside = ['#4a2a1e', '#6a2e22', '#3a1f5a'][st0];
  s += path(`M80 148L80 116Q${cx} 102 120 116L120 148Z`, inside, { sw: 2.6 });
  if (st0 > 0) s += ell(cx, 128, 16, 12, '#ffcf6e', { op: 0.35 });
  s += rect(86, 132, 28, 8, '#7fb2e8', { sw: 1.6, rx: 2 }) + rect(87, 129, 10, 5, WHITE, { sw: 1.4, rx: 2 }) + rect(86, 139.5, 28, 3, WOOD_D, { sw: 1.2 });
  s += path(`M80 116Q88 108 98 110Q88 124 88 148L80 148Z`, wallA, { sw: 2.2 }) + path(`M120 116Q112 108 102 110Q112 124 112 148L120 148Z`, wallA, { sw: 2.2 });
  s += circ(85, 126, 2.4, GOLD, { sw: 1.2 }) + circ(115, 126, 2.4, GOLD, { sw: 1.2 });
  // Roof stripes.
  const M = 10;
  const apex = [cx, 30];
  const bx = [];
  for (let i = 0; i <= M; i++) bx.push(cx - 84 * Math.cos((Math.PI * i) / M));
  const ctrl = (x) => [cx + (x - cx) * 0.34, 78];
  for (let i = 0; i < M; i++) {
    const c = i % 2 ? B : A;
    const t = (i + 0.5) / M;
    const fill = t > 0.66 ? dk(c, 0.13) : t < 0.3 ? lt(c, 0.1) : c;
    const c1 = ctrl(bx[i]);
    const c2 = ctrl(bx[i + 1]);
    s += path(`M${apex[0]} ${apex[1]}Q${f(c1[0])} ${f(c1[1])} ${f(bx[i])} 100L${f(bx[i + 1])} 100Q${f(c2[0])} ${f(c2[1])} ${apex[0]} ${apex[1]}Z`, fill);
  }
  s += path(`M16 100Q71.4 78 ${cx} 30Q128.6 78 184 100Z`, 'none', { sw: 3 });
  // Highlight streak.
  s += path(`M${cx - 6} 40Q${cx - 26} 74 ${cx - 52} 92`, 'none', { sw: 3, stroke: '#ffffff', op: 0.35, cap: true });
  // Valance scallops.
  const K = 10;
  let vd = `M14 96L186 96L186 100`;
  for (let k = K - 1; k >= 0; k--) {
    const xa = 14 + (172 * k) / K;
    const xb = 14 + (172 * (k + 1)) / K;
    vd += `Q${f((xa + xb) / 2)} 117 ${f(xa)} 100`;
  }
  s += path(vd + 'Z', val, { sw: 2.6 }) + line('M17 99H183', lt(val, 0.45), 2);
  if (st0 === 0) {
    // A torn scallop and patches.
    s += path('M117 100L126 100L122 109Z', '#eadcbf', { sw: 1.6 });
    s += patch(48, 70, 15, 11, '#7fa6c9', -14) + patch(128, 58, 12, 13, '#9bb86a', 12) + patch(140, 110, 14, 13, '#c9a26a', 6) + patch(40, 118, 12, 10, '#8fa0b4', -5);
    s += line('M66 52l6 4M70 50l-2 8', O, 1.2);
  } else {
    for (let k = 0; k < K; k++) s += bulb(14 + (172 * (k + 0.5)) / K, 110, true, 2.2);
  }
  // Moon-and-star bed sign over the door.
  if (st0 === 0) s += g(path('M104 76a10 10 0 1 1 -2 -14a8 8 0 1 0 2 14z', '#d8cfa0', { sw: 2 }), { tf: 'rotate(-12 100 70)' });
  else if (st0 === 1) s += circ(cx, 76, 13, '#2d4e9a', { sw: 2.4 }) + path('M104 82a8 8 0 1 1 0 -12a6.4 6.4 0 1 0 0 12z', GOLD, { sw: 1.4 }) + star(107, 71, 3, WHITE, { sw: 0.9 });
  else s += circ(cx, 76, 14, '#24104a', { sw: 2.4 }) + neon('M104 83a8.5 8.5 0 1 1 0 -13a6.6 6.6 0 1 0 0 13z', '#ffe066', 2) + star(108, 70, 3.2, '#ffe066', { sw: 0.9 });
  // Bulb strings along the seams.
  if (st0 >= 1) {
    s += bulbsOnQ([cx, 34], [71.4, 78], [18, 99], 7, 0.12, 0.96);
    s += bulbsOnQ([cx, 34], [128.6, 78], [182, 99], 7, 0.12, 0.96);
    s += bulbsOnQ([cx, 34], [cx - 20, 78], [cx - 40, 99], 4, 0.25, 0.8, 2);
    s += bulbsOnQ([cx, 34], [cx + 20, 78], [cx + 40, 99], 4, 0.25, 0.8, 2);
  }
  if (st0 === 2) s += neon(`M16 100Q71.4 78 ${cx} 30Q128.6 78 184 100`, PINK, 2.4);
  // Top pole.
  if (st0 === 0) {
    s += stick(`M${cx} 32L${cx - 3} 8`, WOOD, 2.4);
    s += path(`M${cx - 3} 10L${cx - 18} 12L${cx - 13} 16L${cx - 19} 20L${cx - 2} 18Z`, '#b8b0a0', { sw: 1.8 });
  } else if (st0 === 1) {
    s += flag(cx, 32, 26, RED, 1);
  } else {
    s += stick(`M${cx} 32L${cx} 12`, '#e8e2d6', 2.2);
    s += flag(cx - 40, 64, 22, BLUE, -1) + flag(cx + 40, 64, 22, GREEN, 1);
    s += circ(cx, 10, 12, '#ffe680', { op: 0.35 }) + star(cx, 10, 10, GOLD, { sw: 2 });
  }
  // Ground clutter / cannons.
  if (st0 === 0) {
    s += tireStack(18, 150, 2, 11);
    s += g(rect(160, 104, 9, 46, WOOD_L, { sw: 2 }) + nail(164.5, 110) + nail(164.5, 142), { tf: 'rotate(8 165 150)' });
  } else if (st0 === 1) {
    s += rect(12, 132, 16, 16, WOOD, { sw: 2, rx: 2 }) + line('M12 140H28', WOOD_D, 1.5);
  } else {
    s += cannon(16, 150, -1, BLUE) + cannon(184, 150, 1, RED);
  }
  // Steps.
  s += rect(82, 140, 36, 6, st0 === 0 ? WOOD_D : WOOD, { sw: 2, rx: 1 }) + rect(77, 146, 46, 6, st0 === 0 ? WOOD : WOOD_L, { sw: 2, rx: 1 });
  if (st0 === 0) s += nail(86, 149) + nail(114, 149);
  return svg(W, H, s, { cls: 'bld bld-bigtop', over: true });
}

function strikerSvg(level) {
  const s0 = stageOf(level);
  const W = 120;
  const H = 170;
  const cx = 60;
  let s = shadow(cx, 165, 52, 5);
  // Stage 2 starburst behind the bell.
  if (s0 === 2) {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      rays += `M${cx} 22L${f(cx + Math.cos(a - 0.12) * 34)} ${f(22 + Math.sin(a - 0.12) * 34)}L${f(cx + Math.cos(a + 0.12) * 34)} ${f(22 + Math.sin(a + 0.12) * 34)}Z`;
    }
    s += path(rays, '#ffe680', { op: 0.65 });
  }
  // Side sign on a bracket.
  const signC = [mix(RED, '#b49a80', 0.5), RED, '#2a1052'][s0];
  s += stick('M22 54H46', WOOD_D, 2.4) + circ(22, 54, 14, signC, { sw: 2.6 });
  // A flexing arm.
  const armC = [WHITE, WHITE, '#ff8a80'][s0];
  const armD = 'M12 62V55Q16 48 23 51Q24 48 24 45V42Q24 38 28 38Q32 38 32 42V56Q32 62 26 62Z';
  s += s0 === 2 ? neon(armD, '#ff6a5a', 1.6) : path(armD, armC, { sw: 1.8 });
  if (s0 === 1) for (let i = 0; i < 8; i++) s += bulb(22 + Math.cos((i * Math.PI) / 4) * 14, 54 + Math.sin((i * Math.PI) / 4) * 14, true, 1.8);
  // Tower.
  const tw = 24;
  const tx = cx - tw / 2;
  const ty0 = 34;
  const ty1 = 144;
  let tower = '';
  if (s0 === 0) {
    tower += rect(tx, ty0, tw, ty1 - ty0, WOOD, { sw: 2.8 });
    for (let y = ty0 + 14; y < ty1; y += 14) tower += line(`M${tx + 1} ${y}H${tx + tw - 1}`, WOOD_D, 1.5);
    for (let y = ty0 + 8; y < ty1 - 4; y += 14) tower += rect(tx + 3, y, 7, 3, mix(RED, '#b49a80', 0.45), { rx: 1 });
    tower += g(rect(tx - 4, 88, tw + 8, 7, WOOD_L, { sw: 2 }) + nail(tx - 1, 91.5) + nail(tx + tw + 1, 91.5), { tf: `rotate(-14 ${cx} 92)` });
    tower += patch(tx + 12, 112, 10, 10, '#8fa0b4', 8);
  } else {
    const bands = 10;
    const bh = (ty1 - ty0) / bands;
    const rain = ['#ff4a5a', '#ff6a3a', '#ff9a2a', '#ffc23a', '#ffe14a', '#c8e84a', '#7ad65a', '#3ec8a0', '#3db0f0', '#5b8cf0'];
    for (let i = 0; i < bands; i++) {
      const c = s0 === 1 ? (i % 2 ? WHITE : RED) : rain[i];
      tower += rect(tx, ty0 + i * bh, tw, bh, c);
      if (s0 === 1) tower += rect(tx + tw - 5, ty0 + i * bh, 5, bh, O, { op: 0.12 });
    }
    tower += rect(tx, ty0, tw, ty1 - ty0, 'none', { sw: 2.8 });
    tower += rect(tx + 3, ty0 + 2, 3, ty1 - ty0 - 4, '#ffffff', { op: 0.35 });
  }
  s += tower;
  // Rail and puck.
  s += line(`M${cx} ${ty0 + 4}V${ty1 - 2}`, O, 1.6);
  s += rect(cx - 7, 100, 14, 9, s0 === 0 ? '#b8b0a0' : GOLD, { sw: 2, rx: 2.5 });
  if (s0 >= 1) s += line(`M${cx - 4} 114h8M${cx - 3} 119h6`, O, 1.4, { op: 0.5 });
  // Bulbs up both sides.
  if (s0 >= 1) for (let y = ty0 + 6; y < ty1; y += 11) s += bulb(tx - 4, y, true, 2.1) + bulb(tx + tw + 4, y, true, 2.1);
  if (s0 === 2) s += neon(`M${tx - 8} ${ty1}V${ty0 - 2}M${tx + tw + 8} ${ty1}V${ty0 - 2}`, '#ff4a5a', 2.2);
  // Cap and bell.
  s += rect(tx - 5, ty0 - 6, tw + 10, 7, s0 === 0 ? WOOD_D : s0 === 1 ? GOLD : '#ff4a5a', { sw: 2.4, rx: 2 });
  const bellC = s0 === 0 ? '#b8b4a8' : GOLD;
  s += path(`M${cx - 14} ${ty0 - 6}Q${cx - 15} 8 ${cx} 8Q${cx + 15} 8 ${cx + 14} ${ty0 - 6}Z`, bellC, { sw: 2.8 });
  s += path(`M${cx - 8} ${ty0 - 9}Q${cx - 9} 14 ${cx - 2} 12`, 'none', { sw: 2.6, stroke: '#ffffff', op: s0 === 0 ? 0.35 : 0.7, cap: true });
  s += ell(cx, ty0 - 6, 16, 3.4, dk(bellC, 0.2), { sw: 2.2 });
  s += circ(cx, 6, 3.4, bellC, { sw: 2 });
  if (s0 === 0) s += line(`M${cx + 6} 14l3 4l-2 3`, O, 1.3);
  if (s0 >= 1) s += sparkle(cx + 18, 10, 4.5);
  if (s0 === 2) s += flag(tx - 5, ty0 - 6, 22, GOLD, -1) + flag(tx + tw + 5, ty0 - 6, 22, RED, 1);
  // Base platform and the pad.
  const baseC = [WOOD, RED, RED][s0];
  s += rect(14, 140, 92, 24, baseC, { sw: 2.8, rx: 4 });
  s += rect(14, 140, 92, 6, lt(baseC, 0.3), { sw: 2.2, rx: 3 });
  if (s0 === 0) s += line('M16 154H104', WOOD_D, 1.5) + nail(20, 150) + nail(100, 150) + nail(20, 158) + nail(100, 158);
  else {
    s += star(cx, 154, 6, s0 === 1 ? WHITE : GOLD, { sw: 1.5 });
    s += star(32, 154, 3.4, GOLD, { sw: 1.1 }) + star(88, 154, 3.4, GOLD, { sw: 1.1 });
  }
  s += rect(26, 128, 18, 13, s0 === 0 ? '#8fa0b4' : '#4a4058', { sw: 2.2, rx: 2 });
  s += ell(35, 128, 11, 4, s0 === 0 ? mix(RED, '#b49a80', 0.4) : RED, { sw: 2.2 }) + ell(33, 127, 4.5, 1.4, '#ffffff', { op: 0.5 });
  // The mallet leaning on the right.
  const head = s0 === 0 ? '#9aa0a8' : s0 === 1 ? RED : GOLD;
  s += stick('M96 163L84 104', s0 === 0 ? WOOD_L : WOOD, 4.2, 2.6);
  if (s0 === 0) s += line('M90 136l5 -1M89 131l5 -1', '#e0d6c0', 3);
  s += g(rect(68, 90, 32, 17, head, { rx: 5, sw: 2.8 }) + rect(74, 90, 5, 17, s0 === 0 ? RED : s0 === 1 ? WHITE : RED, { sw: 1.6 }) + rect(89, 90, 5, 17, s0 === 0 ? RED : s0 === 1 ? WHITE : RED, { sw: 1.6 }) + rect(70, 92, 28, 4, '#ffffff', { op: 0.35, rx: 2 }), { tf: 'rotate(-12 84 98)' });
  if (s0 === 0) s += tireStack(108, 166, 2, 9) + rect(4, 150, 12, 14, '#c8b48a', { sw: 2, rx: 2 });
  if (s0 === 2) s += cannon(12, 166, -1, PURPLE) + cannon(108, 166, 1, BLUE);
  return svg(W, H, s, { cls: 'bld bld-striker', over: true });
}

function gallerySvg(level) {
  const s0 = stageOf(level);
  const W = 160;
  const H = 124;
  let s = shadow(80, 120, 76, 5);
  // Body.
  const body = [WOOD, '#2f6fd0', '#244fae'][s0];
  s += rect(10, 42, 140, 78, body, { sw: 2.8, rx: 3 });
  if (s0 === 0) for (let x = 24; x < 150; x += 14) s += line(`M${x} 44V118`, WOOD_D, 1.4);
  else s += rect(10, 42, 140, 78, 'none', { sw: 0 }) + rect(132, 44, 16, 74, O, { op: 0.12 });
  // Window with targets.
  const back = ['#4a3020', '#1f3d7a', '#1a1f5a'][s0];
  s += rect(20, 54, 120, 40, back, { sw: 2.6, rx: 2 });
  if (s0 >= 1) for (let i = 0; i < 9; i++) s += star(28 + i * 13.5, 60 + (i % 2) * 6, 1.8, '#ffffff', { sw: 0, op: 0.5 });
  if (s0 === 0) {
    s += g(circ(118, 66, 7, '#d8b88a', { sw: 1.6 }) + circ(118, 66, 4.4, mix(RED, '#b49a80', 0.4)) + circ(118, 66, 1.6, '#d8b88a'), { tf: 'rotate(10 118 66)' });
    s += line('M22 86H138', '#8a7a6a', 2);
    s += ducks(46, 74, 86, 2, ['#e6c25a'], 1);
  } else {
    s += target(44, 66, 7) + target(80, 64, 8, BLUE) + target(116, 66, 7);
    s += line('M22 86H138', STEEL, 2.4);
    s += ducks(32, 128, 86, 5, ['#ffd23f', '#ffd23f', WHITE]);
  }
  if (s0 === 2) s += neon('M18 52H142V96H18Z', '#5ac8ff', 2.2);
  // Counter.
  s += rect(4, 92, 152, 10, s0 === 0 ? WOOD_L : WHITE, { sw: 2.6, rx: 3 });
  const front = [WOOD_D, WHITE, '#1a1f5a'][s0];
  s += rect(10, 102, 140, 18, front, { sw: 2.6 });
  if (s0 === 0) s += line('M10 111H150', O, 1.2, { op: 0.4 }) + patch(30, 104, 16, 12, '#8fa0b4', -4) + patch(110, 105, 14, 11, '#b9a06a', 6);
  else if (s0 === 1) for (let i = 0; i < 6; i++) s += star(22 + i * 23.2, 111, 4.4, i % 2 ? BLUE : RED, { sw: 1.3 });
  else for (let i = 0; i < 6; i++) s += star(22 + i * 23.2, 111, 4.6, GOLD, { sw: 1.3 });
  // A blue toy rifle on the counter.
  s += g(path('M20 92L22 86L36 86L38 84L60 84L60 88L40 88L38 92Z', BLUE, { sw: 2 }) + rect(54, 82.5, 3, 2, O), { tf: 'rotate(-4 40 88)' });
  // Prize teddy on the counter (fresh paint and up).
  if (s0 >= 1) {
    const tc = '#c98a4b';
    s += circ(134, 84, 6.5, tc, { sw: 1.8 }) + circ(134, 74, 6, tc, { sw: 1.8 }) + circ(129.5, 69.5, 2.4, tc, { sw: 1.4 }) + circ(138.5, 69.5, 2.4, tc, { sw: 1.4 }) + ell(134, 76, 2.6, 2, '#f0d0a0') + circ(132, 73, 0.9, O) + circ(136, 73, 0.9, O);
    s += path('M130 80l4 2l4 -2l-1 4h-6z', PINK, { sw: 1 });
  }
  if (s0 === 2) s += line('M146 92Q150 70 144 54', O, 1.2) + circ(144, 50, 6, PINK, { sw: 1.8 }) + path('M142 47q2 -2 4 0', 'none', { sw: 1, stroke: '#ffffff' });
  // Awning.
  const K = 8;
  const aA = [mix('#8fa6bf', '#ffffff', 0.1), BLUE, BLUE][s0];
  const aB = [mix('#8fa6bf', '#c9b896', 0.5), WHITE, GOLD][s0];
  for (let i = 0; i < K; i++) {
    const xt0 = 8 + i * 18;
    const xt1 = xt0 + 18;
    const xb0 = 2 + i * 19.5;
    const xb1 = xb0 + 19.5;
    const sag = s0 === 0 ? [0, 3, 5, 6, 6, 5, 2, 0][i] : 0;
    const c = i % 2 ? aB : aA;
    s += path(`M${xt0} 28L${xt1} 28L${f(xb1)} ${44 + sag}Q${f((xb0 + xb1) / 2)} ${53 + sag} ${f(xb0)} ${44 + (s0 === 0 ? [0, 3, 5, 6, 6, 5, 2, 0][Math.max(0, i - 1)] : 0)}Z`, i > 5 ? dk(c, 0.1) : c, { sw: 2.2 });
  }
  s += line('M8 28H152', O, 2.8);
  if (s0 === 0) s += patch(40, 32, 12, 9, '#c9a26a', -6) + patch(112, 34, 12, 10, '#9bb86a', 8) + line('M8 30L2 42M152 30L158 42', '#d8c49a', 1.8);
  else for (let i = 0; i < K; i++) s += bulb(2 + i * 19.5 + 9.75, 50, true, 2.1);
  if (s0 === 2) s += line('M6 28H154', GOLD, 2.4);
  // Top sign.
  if (s0 === 0) {
    s += g(rect(46, 8, 66, 20, WOOD_L, { sw: 2.6, rx: 2 }) + line('M48 18H110', WOOD_D, 1.2) + target(79, 18, 7, mix(RED, '#b49a80', 0.4)) + nail(50, 12) + nail(108, 12), { tf: 'rotate(-5 79 18)' });
    s += stick('M56 28V24M102 28V22', WOOD_D, 2.4);
  } else if (s0 === 1) {
    s += stick('M56 28V24M104 28V24', STEEL, 2.4);
    s += rect(42, 4, 76, 24, WHITE, { sw: 2.6, rx: 6 }) + target(80, 16, 9, RED);
    s += star(56, 16, 5, BLUE, { sw: 1.4 }) + star(104, 16, 5, BLUE, { sw: 1.4 });
    s += bulbsOnLine(46, 4, 114, 4, 6, 1.9);
  } else {
    s += stick('M60 28V24M100 28V24', STEEL, 2.4);
    s += circ(80, 14, 17, '#ffe680', { op: 0.3 }) + circ(80, 14, 13, '#1a1f5a', { sw: 2.6 });
    s += neon('M80 4a10 10 0 1 1 -0.1 0', '#5ac8ff', 1.8) + neon('M80 9a5 5 0 1 1 -0.1 0', '#ff4a5a', 1.6) + circ(80, 14, 1.8, '#ffffff');
    s += star(52, 16, 6, GOLD, { sw: 1.5 }) + star(108, 16, 6, GOLD, { sw: 1.5 });
    s += flag(6, 30, 20, RED, -1) + flag(154, 30, 20, GOLD, 1);
    s += bunting(6, 12, 62, 8, 3, 4) + bunting(98, 8, 154, 12, 3, 4, [BLUE, GOLD, PINK, GREEN]);
    s += cannon(8, 122, -1, RED) + cannon(152, 122, 1, GREEN);
  }
  if (s0 === 0) s += rect(140, 106, 14, 14, '#9aa0a8', { sw: 2, rx: 1 }) + ell(147, 106, 7, 2, '#7a8088', { sw: 1.4 });
  return svg(W, H, s, { cls: 'bld bld-gallery', over: true });
}

function tentSvg(level) {
  const s0 = stageOf(level);
  const W = 136;
  const H = 114;
  const cx = 68;
  let s = shadow(cx, 110, 64, 5);
  const A = ['#d8ccb0', WHITE, WHITE][s0];
  const Bc = ['#c4b694', GREEN, '#7fe0a8'][s0];
  // Guy ropes and pegs.
  s += line('M10 70L2 110M126 70L134 110', s0 === 0 ? '#b8a07a' : '#d8c49a', 1.6) + rect(0, 106, 4, 6, WOOD_D, { sw: 1 }) + rect(132, 106, 4, 6, WOOD_D, { sw: 1 });
  // Walls.
  s += rect(16, 64, 104, 46, A, { sw: 2.8 });
  s += rect(100, 66, 19, 43, O, { op: 0.08 });
  if (s0 >= 1) s += rect(16, 100, 104, 10, Bc, { sw: 2.2 });
  // Door with a cot inside.
  s += path(`M50 110L50 84Q${cx} 72 86 84L86 110Z`, s0 === 0 ? '#5a4a38' : '#2f5a44', { sw: 2.4 });
  if (s0 >= 1) s += ell(cx, 96, 14, 10, '#fff2a8', { op: 0.3 });
  s += rect(54, 100, 28, 6, WHITE, { sw: 1.4, rx: 2 }) + rect(62, 99, 20, 5, s0 === 0 ? '#9bb86a' : GREEN, { sw: 1.2, rx: 1.5 }) + rect(54, 105, 28, 2.4, STEEL, { sw: 1 });
  s += path(`M50 84Q56 78 64 78Q56 92 56 110L50 110Z`, A, { sw: 2 }) + path(`M86 84Q80 78 72 78Q80 92 80 110L86 110Z`, A, { sw: 2 });
  // Roof panels.
  const M = 6;
  const apex = [cx, 20];
  for (let i = 0; i < M; i++) {
    const xa = 6 + (124 * i) / M;
    const xb = 6 + (124 * (i + 1)) / M;
    const c = i % 2 ? Bc : A;
    const ca = [cx + (xa - cx) * 0.4, 50];
    const cb = [cx + (xb - cx) * 0.4, 50];
    s += path(`M${cx} 20Q${f(ca[0])} ${f(ca[1])} ${f(xa)} 66L${f(xb)} 66Q${f(cb[0])} ${f(cb[1])} ${cx} 20Z`, i >= 4 ? dk(c, 0.1) : c);
  }
  s += path(`M6 66Q43 50 ${cx} 20Q93 50 130 66Z`, 'none', { sw: 2.8 });
  // Valance.
  let vd = 'M4 63L132 63L132 66';
  for (let k = 7; k >= 0; k--) {
    const xa = 4 + 16 * k;
    vd += `Q${xa + 8} 78 ${xa} 66`;
  }
  s += path(vd + 'Z', s0 === 0 ? '#b9a988' : s0 === 1 ? GREEN : GOLD, { sw: 2.2 });
  if (s0 >= 1) for (let k = 0; k < 8; k++) s += bulb(12 + 16 * k, 73, true, 2);
  // The cross.
  if (s0 === 0) {
    s += path('M63 34L72 33L72 41L80 41L80 49L72 50L73 58L63 58L64 50L56 50L55 42L63 41Z', mix(GREEN, '#a89a78', 0.25), { sw: 2 });
    s += patch(24, 50, 12, 10, '#8fa0b4', -10) + patch(96, 80, 12, 12, '#c9a26a', 6) + patch(26, 80, 10, 9, '#9bb86a', 4);
  } else if (s0 === 1) {
    s += circ(cx, 44, 13, WHITE, { sw: 2.4 });
    s += path('M64 34h8v6h6v8h-6v6h-8v-6h-6v-8h6z', GREEN, { sw: 1.8 });
  } else {
    s += circ(cx, 44, 20, '#7fffb0', { op: 0.3 }) + circ(cx, 44, 15, '#173a2a', { sw: 2.6 });
    s += neon('M64.5 35.5h7v6h6v7h-6v6h-7v-6h-6v-7h6z', '#3af08a', 1.8);
    for (let i = 0; i < 10; i++) s += bulb(cx + Math.cos((i * Math.PI) / 5) * 15, 44 + Math.sin((i * Math.PI) / 5) * 15, true, 1.6);
  }
  // Top: crooked pole / pennant / neon cross.
  if (s0 === 0) s += stick(`M${cx} 22L${cx + 3} 8`, WOOD, 2.2) + path(`M${cx + 3} 9L${cx + 15} 12L${cx + 3} 16Z`, '#c4b694', { sw: 1.6 });
  else if (s0 === 1) s += flag(cx, 22, 18, GREEN, 1);
  else {
    s += stick(`M${cx} 22V12`, '#e8e2d6', 2);
    s += circ(cx, 9, 10, '#ffe680', { op: 0.35 }) + star(cx, 9, 8, GOLD, { sw: 1.8 });
    s += flag(8, 66, 18, GREEN, -1) + flag(128, 66, 18, GOLD, 1);
    s += neon(`M6 66Q43 50 ${cx} 20Q93 50 130 66`, '#3af08a', 1.8);
  }
  // Supplies.
  if (s0 === 0) s += rect(104, 94, 20, 16, '#c8a878', { sw: 2, rx: 1 }) + line('M110 98l8 8M118 98l-8 8', mix(GREEN, '#a89a78', 0.3), 2);
  else {
    s += rect(102, 92, 22, 18, WHITE, { sw: 2.2, rx: 2 }) + path('M111 95h4v4h4v4h-4v4h-4v-4h-4v-4h4z', GREEN, { sw: 1 }) + rect(108, 89, 10, 3.5, STEEL, { sw: 1.4, rx: 1 });
  }
  if (s0 === 2) {
    s += line('M28 104Q22 80 26 62', O, 1.2) + path('M26 62c-6 -6 -12 -1 -8 5l8 7l8 -7c4 -6 -2 -11 -8 -5z', RED, { sw: 1.8 }) + path('M20 59q2 -2 4 0', 'none', { sw: 1, stroke: '#ffffff' });
    s += cannon(8, 112, -1, GREEN) + cannon(128, 112, 1, PURPLE);
  }
  return svg(W, H, s, { cls: 'bld bld-tent', over: true });
}

function bumperCarFront(cx, by, color, glow) {
  let s = '';
  if (glow) s += path(`M${cx - 12} ${by - 8}L${cx - 30} ${by + 2}L${cx - 4} ${by + 2}Z M${cx + 12} ${by - 8}L${cx + 30} ${by + 2}L${cx + 4} ${by + 2}Z`, '#fff3a0', { op: 0.5 });
  s += stick(`M${cx + 8} ${by - 18}V${by - 34}`, STEEL, 1.4, 2) + circ(cx + 8, by - 35, 2, glow ? '#fff3a0' : RED, { sw: 1.1 });
  s += rect(cx - 22, by - 9, 44, 9, RUBBER, { rx: 4, sw: 2.4 });
  s += path(`M${cx - 20} ${by - 8}L${cx - 17} ${by - 20}Q${cx - 16} ${by - 24} ${cx - 10} ${by - 24}L${cx + 10} ${by - 24}Q${cx + 16} ${by - 24} ${cx + 17} ${by - 20}L${cx + 20} ${by - 8}Z`, color, { sw: 2.4 });
  s += circ(cx - 12, by - 14, 3, glow ? '#fff8d0' : '#fff2a8', { sw: 1.4 }) + circ(cx + 12, by - 14, 3, glow ? '#fff8d0' : '#fff2a8', { sw: 1.4 });
  s += rect(cx - 6, by - 17, 12, 5, dk(color, 0.3), { rx: 2, sw: 1.2 });
  s += path(`M${cx - 14} ${by - 21}H${cx + 4}`, 'none', { sw: 2, stroke: lt(color, 0.5), cap: true });
  return s;
}

function garageSvg(level) {
  const s0 = stageOf(level);
  const W = 168;
  const H = 132;
  const cx = 84;
  let s = shadow(cx, 128, 80, 5);
  const wall = ['#a9adb4', YELLOW, YELLOW][s0];
  const roof = ['#8f949c', RED, '#2a2a3a'][s0];
  // Roof (arched, corrugated).
  s += path(`M6 58Q${cx} -4 162 58Z`, roof, { sw: 2.8 });
  for (let i = 1; i < 9; i++) {
    const x = 6 + (156 * i) / 9;
    const yTop = 58 - (1 - ((x - cx) / 78) ** 2) * 31;
    s += line(`M${f(x)} ${f(yTop + 2)}V56`, dk(roof, 0.25), 1.4);
  }
  s += path(`M20 46Q${cx} 6 120 22`, 'none', { sw: 3, stroke: '#ffffff', op: 0.3, cap: true });
  // Walls.
  s += rect(12, 54, 144, 74, wall, { sw: 2.8 });
  s += rect(138, 56, 17, 71, O, { op: 0.1 });
  if (s0 === 0) {
    for (let x = 20; x < 156; x += 8) s += line(`M${x} 56V126`, '#8a8e96', 1.2);
    s += patch(16, 64, 16, 14, '#b86b3a', -6) + patch(134, 96, 14, 16, '#b86b3a', 8) + patch(140, 62, 10, 10, '#9bb86a', 4);
    s += path('M22 84L30 84L26 92L32 92L22 106L25 95L19 95Z', mix(YELLOW, '#a9adb4', 0.25), { sw: 1.6 });
  } else {
    // Hazard chevrons along the bottom.
    let ch = '';
    for (let x = 12; x < 156; x += 12) ch += `M${x} 128L${x + 6} 118L${x + 12} 118L${x + 6} 128Z`;
    s += rect(12, 118, 144, 10, YELLOW) + path(ch, O, { op: 0.85 }) + line('M12 118H156', O, 2.2);
  }
  // Door frame and roll-up door.
  s += rect(36, 70, 96, 58, s0 === 2 ? '#1a1a2a' : '#3a3038', { sw: 2.8, rx: 2 });
  if (s0 >= 1) s += ell(cx, 112, 40, 14, '#fff2a8', { op: 0.18 });
  const doorH = [26, 20, 18][s0];
  const door = [STEEL, WHITE, '#e0e4ec'][s0];
  s += rect(38, 72, 92, doorH, door, { sw: 2 });
  for (let y = 72 + 5; y < 72 + doorH; y += 5) s += line(`M38 ${y}H130`, dk(door, 0.2), 1.2);
  if (s0 === 0) s += path('M70 90Q76 96 82 90', 'none', { sw: 1.6 }) + path(`M38 ${72 + doorH}L130 ${72 + doorH - 3}`, 'none', { sw: 2 });
  // Bumper car peeking out.
  s += bumperCarFront(cx, 128, s0 === 0 ? mix(YELLOW, '#a9adb4', 0.35) : YELLOW, s0 === 2);
  if (s0 >= 1) for (let i = 0; i < 7; i++) s += bulb(40 + i * 14.6, 67, true, 2);
  if (s0 >= 1) for (let i = 0; i < 4; i++) s += bulb(33, 76 + i * 14, true, 2) + bulb(135, 76 + i * 14, true, 2);
  if (s0 === 2) s += neon('M30 128V64H138V128', '#ffe14a', 2);
  // Tires and barrel.
  s += tireStack(152, 128, s0 === 0 ? 3 : 2, 11);
  if (s0 === 0) s += rect(14, 104, 16, 24, '#b86b3a', { sw: 2, rx: 2 }) + line('M14 112H30M14 120H30', '#8a4a2a', 1.6);
  else s += rect(14, 106, 18, 22, s0 === 1 ? RED : PURPLE, { sw: 2, rx: 2 }) + rect(16, 104, 14, 4, STEEL, { sw: 1.4, rx: 1 }) + line('M18 112l6 0', '#ffffff', 1.4, { op: 0.6 });
  // Roof sign.
  if (s0 === 0) {
    s += g(rect(58, 28, 52, 18, WOOD_L, { sw: 2.4, rx: 2 }) + line('M62 37l20 0', '#7a8088', 4) + circ(64, 37, 4, 'none', { sw: 2.6, stroke: '#7a8088' }) + nail(61, 31) + nail(107, 31), { tf: 'rotate(4 84 37)' });
  } else if (s0 === 1) {
    s += rect(56, 24, 56, 22, '#2a2a3a', { sw: 2.6, rx: 4 });
    s += g(rect(64, 33, 36, 5, GOLD, { sw: 1.4, rx: 2 }) + path('M62 28a6 6 0 1 0 6 8l-4 -2v-4l4 -2a6 6 0 0 0 -6 0z', GOLD, { sw: 1.4 }) + path('M106 28a6 6 0 1 1 -6 8l4 -2v-4l-4 -2a6 6 0 0 1 6 0z', GOLD, { sw: 1.4 }), { tf: 'rotate(-10 84 35)' });
    s += bulbsOnLine(58, 24, 110, 24, 6, 1.8);
  } else {
    s += circ(cx, 22, 22, '#fff3a0', { op: 0.25 });
    s += neon('M88 4L72 26H84L78 42L98 16H86L92 4Z', '#ffe14a', 2.2);
    // Checkered flags.
    for (const [x, d] of [[10, -1], [158, 1]]) {
      s += stick(`M${x} 58V26`, '#e8e2d6', 1.6, 2);
      let ck = '';
      for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) if ((j + k) % 2 === 0) ck += rect(d > 0 ? x + j * 5 : x - (j + 1) * 5, 27 + k * 5, 5, 5, O);
      s += rect(d > 0 ? x : x - 15, 27, 15, 10, WHITE, { sw: 1.6 }) + ck + rect(d > 0 ? x : x - 15, 27, 15, 10, 'none', { sw: 1.6 });
    }
    s += cannon(8, 130, -1, BLUE) + cannon(160, 130, 1, RED);
    s += star(30, 50, 4, GOLD, { sw: 1.2 }) + star(138, 50, 4, GOLD, { sw: 1.2 });
  }
  return svg(W, H, s, { cls: 'bld bld-garage', over: true });
}

/** Contours for the tarp over each locked building. */
const TARP = {
  bigtop: { pts: [[14, 150], [18, 118], [28, 98], [62, 64], [92, 30], [108, 30], [138, 64], [172, 98], [182, 118], [186, 150]], ropes: [[30, 96, 170, 96], [22, 124, 178, 124]], lock: [100, 112], poke: [100, 30, 100, 10] },
  striker: { pts: [[10, 166], [14, 140], [34, 128], [44, 110], [44, 40], [48, 22], [60, 12], [72, 22], [76, 40], [76, 110], [86, 128], [106, 140], [110, 166]], ropes: [[44, 60, 76, 60], [20, 142, 100, 142]], lock: [60, 126], poke: null },
  gallery: { pts: [[6, 120], [6, 70], [10, 40], [30, 22], [80, 14], [130, 22], [150, 40], [154, 70], [154, 120]], ropes: [[12, 50, 148, 50], [8, 92, 152, 92]], lock: [80, 84], poke: null },
  tent: { pts: [[8, 110], [10, 80], [22, 62], [50, 34], [68, 18], [86, 34], [114, 62], [126, 80], [128, 110]], ropes: [[30, 56, 106, 56], [12, 88, 124, 88]], lock: [68, 82], poke: [68, 18, 68, 6] },
  garage: { pts: [[8, 128], [8, 70], [20, 44], [50, 22], [84, 16], [118, 22], [148, 44], [160, 70], [160, 128]], ropes: [[16, 54, 152, 54], [10, 96, 158, 96]], lock: [84, 92], poke: null },
};

function lockedSvg(id, W, H) {
  const T = TARP[id];
  const tarp = '#7f93ad';
  let s = shadow(W / 2, H - 4, W * 0.46, 5);
  if (T.poke) s += stick(`M${T.poke[0]} ${T.poke[1] + 4}L${T.poke[2]} ${T.poke[3]}`, WOOD_D, 2.4) + circ(T.poke[2], T.poke[3], 2.6, '#9aa0a8', { sw: 1.4 });
  // Wavy hem: replace the straight bottom with scallops.
  const pts = T.pts;
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  let d = smooth(pts);
  const n = Math.max(4, Math.round((x1 - x0) / 22));
  for (let i = n - 1; i >= 0; i--) {
    const xa = x0 + ((x1 - x0) * i) / n;
    const xb = x0 + ((x1 - x0) * (i + 1)) / n;
    d += `Q${f((xa + xb) / 2)} ${H - 1} ${f(xa)} ${H - 6}`;
  }
  d = d.replace(/^M([\d.]+) ([\d.]+)/, (m, a) => `M${a} ${H - 6}L${a} ${pts[0][1] - 0}`);
  s += path(d + 'Z', tarp, { sw: 2.8 });
  // Shade on the right third, highlight on the left.
  const cx = W / 2;
  s += path(smooth(pts.filter((p) => p[0] >= cx)) + `L${x1} ${H - 6}L${cx + (x1 - cx) * 0.35} ${H - 6}Z`, O, { op: 0.13 });
  const top = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0]);
  s += line(`M${f(top[0] - 8)} ${f(top[1] + 10)}Q${f(x0 + (top[0] - x0) * 0.3)} ${f((top[1] + H) / 2)} ${f(x0 + 10)} ${f(H - 18)}`, '#a9bcd4', 4, { op: 0.9 });
  // Fold lines from the top down.
  for (const t of [0.3, 0.55, 0.75]) {
    const fx = x0 + (x1 - x0) * t;
    s += line(`M${f(top[0] + (fx - top[0]) * 0.3)} ${f(top[1] + 14)}Q${f(fx + 4)} ${f((top[1] + H) / 2)} ${f(fx)} ${f(H - 8)}`, '#5f7594', 1.8);
  }
  // Ropes.
  for (const [ax, ay, bx, by] of T.ropes) {
    s += line(`M${ax} ${ay}Q${(ax + bx) / 2} ${ay + 6} ${bx} ${by}`, O, 4.2) + line(`M${ax} ${ay}Q${(ax + bx) / 2} ${ay + 6} ${bx} ${by}`, '#e3c48c', 2.4) + line(`M${ax} ${ay}Q${(ax + bx) / 2} ${ay + 6} ${bx} ${by}`, '#b8955a', 2.4, { dash: '2 4' });
  }
  // Pegs and sandbags.
  s += rect(x0 - 4, H - 10, 4, 9, WOOD_D, { sw: 1.4 }) + rect(x1, H - 10, 4, 9, WOOD_D, { sw: 1.4 });
  s += ell(x0 + 12, H - 6, 9, 5, '#cdb68a', { sw: 2 }) + ell(x1 - 12, H - 6, 9, 5, '#cdb68a', { sw: 2 }) + line(`M${x0 + 9} ${H - 9}l2 2M${x1 - 15} ${H - 9}l2 2`, O, 1);
  // Chain and padlock.
  const [lx, ly] = T.lock;
  const half = Math.min(36, (x1 - x0) * 0.38);
  let ch = '';
  let k = 0;
  for (let x = lx - half; x <= lx + half; x += 6, k++) {
    const y = ly - 6 - Math.abs(x - lx) * 0.08;
    ch += k % 2 ? rect(x - 1.6, y - 3.4, 3.2, 6.8, '#c9ced6', { sw: 1.4, rx: 1.6 }) : ell(x, y, 4.2, 2.8, 'none', { sw: 3.8 }) + ell(x, y, 4.2, 2.8, 'none', { sw: 1.8, stroke: '#c9ced6' });
  }
  s += ch;
  s += path(`M${lx - 7} ${ly}V${ly - 7}a7 7 0 0 1 14 0V${ly}`, 'none', { sw: 6.4 }) + path(`M${lx - 7} ${ly}V${ly - 7}a7 7 0 0 1 14 0V${ly}`, 'none', { sw: 3.2, stroke: '#c9ced6' });
  s += rect(lx - 12, ly - 1, 24, 20, GOLD, { sw: 2.6, rx: 4 }) + rect(lx - 12, ly + 12, 24, 7, '#d99a1a', { rx: 3 }) + rect(lx - 12, ly - 1, 24, 20, 'none', { sw: 2.6, rx: 4 });
  s += circ(lx, ly + 6, 2.8, O) + path(`M${lx - 1.4} ${ly + 7}h2.8l1 6h-4.8z`, O) + rect(lx - 9, ly + 1, 4, 8, '#fff1b0', { op: 0.7, rx: 2 });
  return svg(W, H, s, { cls: `bld bld-${id} bld-locked`, over: true });
}

const BUILDERS = { bigtop: bigTopSvg, striker: strikerSvg, gallery: gallerySvg, tent: tentSvg, garage: garageSvg };

/**
 * A park building. id: bigtop | striker | gallery | tent | garage. level 1..7:
 * 1-2 patched junk, 3-4 fresh paint and bulbs, 5-7 neon, flags and confetti cannons.
 * locked (or level < 1): under a tarp with a padlock. viewBox 0 0 w h = PARK.slots[id].
 */
export function buildingSvg(id, level = 1, { locked = false } = {}) {
  const sl = PARK.slots[id];
  if (!sl) return '';
  if (locked || level < 1) return lockedSvg(id, sl.w, sl.h);
  return BUILDERS[id](level);
}

// --- Souvenirs -------------------------------------------------------------------------------

function donutSvg() {
  const W = 64;
  const H = 150;
  const cx = 32;
  const cy = 36;
  let s = shadow(cx, 147, 16, 3);
  // Striped pole.
  s += rect(cx - 4, 60, 8, 84, WHITE, { sw: 2.4 });
  for (let y = 66; y < 140; y += 12) s += path(`M${cx - 4} ${y}l8 -4v6l-8 4z`, RED);
  s += rect(cx - 4, 60, 8, 84, 'none', { sw: 2.4 }) + rect(cx - 10, 138, 20, 10, '#c8c2b8', { sw: 2.2, rx: 2 });
  // Donut ring (evenodd hole).
  const R = 28;
  const r = 10;
  const ring = (rr, ri, ox = 0, oy = 0) => `M${cx + ox - rr} ${cy + oy}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0ZM${cx + ox - ri} ${cy + oy}a${ri} ${ri} 0 1 1 ${ri * 2} 0a${ri} ${ri} 0 1 1 ${-ri * 2} 0Z`;
  s += path(ring(R, r), '#e3a55c', { sw: 3, rule: 'evenodd' });
  // Icing: wobbly outer edge.
  let ic = '';
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const rr = R - 4 + Math.sin(a * 7) * 2.2 + (Math.sin(a) > 0.2 ? Math.sin(a * 7) * 1.5 + 1 : 0);
    ic += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy - 2 + Math.sin(a) * rr);
  }
  ic += `ZM${cx - r - 3} ${cy - 2}a${r + 3} ${r + 3} 0 1 1 ${(r + 3) * 2} 0a${r + 3} ${r + 3} 0 1 1 ${-(r + 3) * 2} 0Z`;
  s += path(ic, PINK, { sw: 2.2, rule: 'evenodd' });
  s += path(`M${cx - 18} ${cy - 14}Q${cx - 6} ${cy - 24} ${cx + 8} ${cy - 21}`, 'none', { sw: 3.4, stroke: '#ffd0e8', cap: true });
  const sp = [[-16, -6, 30], [-8, -18, -20], [6, -19, 60], [17, -10, 10], [19, 4, -40], [-19, 6, 70], [-10, 14, 20], [9, 14, -60], [0, -14, 0], [14, -18, 45]];
  sp.forEach(([x, y, a], i) => (s += rect(cx + x - 1.4, cy - 2 + y - 3, 2.8, 6, [WHITE, YELLOW, BLUE, GREEN, PURPLE][i % 5], { rx: 1.2, tf: `rotate(${a} ${cx + x} ${cy - 2 + y})` })));
  s += path(ring(R, r), 'none', { sw: 3, rule: 'evenodd' });
  // Bulbs around the sign.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    s += bulb(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3), true, 1.8);
  }
  return svg(W, H, s, { cls: 'souv souv-donut', over: true });
}

function fountainSvg() {
  const W = 108;
  const H = 56;
  const cx = 54;
  let s = shadow(cx, 53, 50, 4);
  // Water jets behind the bowl.
  const jet = (d) => line(d, '#3aa8e8', 5.4) + line(d, '#9fe4ff', 3.2) + line(d, '#ffffff', 1.2, { op: 0.8 });
  s += jet(`M${cx - 4} 12Q${cx - 26} -4 ${cx - 36} 30`) + jet(`M${cx + 4} 12Q${cx + 26} -4 ${cx + 36} 30`) + jet(`M${cx} 10Q${cx} -2 ${cx} 6`);
  // Basin.
  s += path(`M6 34L102 34L96 50Q${cx} 56 12 50Z`, '#5fc7c0', { sw: 2.6 });
  for (let i = 0; i < 9; i++) s += rect(12 + i * 9.6, 39, 6, 6, '#8fe0d8', { rx: 1 });
  s += path(`M86 34L102 34L96 50Q90 52 84 52Z`, O, { op: 0.12 });
  s += rect(3, 29, 102, 8, WHITE, { sw: 2.6, rx: 4 });
  s += ell(cx, 31, 46, 2.4, '#6fd0ff');
  for (const x of [26, 46, 70, 82]) s += circ(x, 31.5, 1.6, GOLD, { sw: 0.8 });
  // Column and top bowl.
  s += rect(cx - 6, 14, 12, 18, WHITE, { sw: 2.4 }) + rect(cx - 6, 14, 4, 18, '#ffffff', { op: 0.6 });
  s += path(`M${cx - 18} 12H${cx + 18}L${cx + 12} 20H${cx - 12}Z`, '#5fc7c0', { sw: 2.4 }) + ell(cx, 12, 18, 2.2, '#9fe4ff', { sw: 2 });
  // Splashes.
  for (const [x, y] of [[cx - 36, 28], [cx + 36, 28], [cx - 30, 24], [cx + 31, 23]]) s += circ(x, y, 1.8, '#c8f2ff', { sw: 1 });
  s += sparkle(cx - 16, 4, 3.6) + sparkle(cx + 22, 8, 3);
  return svg(W, H, s, { cls: 'souv souv-fountain', over: true });
}

function anchorSvg() {
  const W = 56;
  const H = 66;
  const cx = 30;
  let s = shadow(cx, 63, 24, 3);
  // Dirt mound.
  s += path(`M8 64Q${cx} 52 52 64Z`, '#b98a5a', { sw: 2.2 });
  const iron = '#3b5c8c';
  const A = `M${cx} 16V54M${cx - 12} 22H${cx + 12}M${cx - 20} 40Q${cx - 18} 56 ${cx} 56Q${cx + 18} 56 ${cx + 20} 40`;
  s += line(A, O, 9) + line(A, iron, 5.4) + line(`M${cx - 1.5} 18V50`, '#7aa0d0', 1.8);
  s += path(`M${cx - 25} 42L${cx - 20} 34L${cx - 15} 43Z`, iron, { sw: 2.2 }) + path(`M${cx + 25} 42L${cx + 20} 34L${cx + 15} 43Z`, iron, { sw: 2.2 });
  s += circ(cx, 10, 6, 'none', { sw: 6 }) + circ(cx, 10, 6, 'none', { sw: 3, stroke: iron });
  // Lifebuoy leaning on the shank.
  const lx = 16;
  const ly = 44;
  s += circ(lx, ly, 13, WHITE, { sw: 2.6 });
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + 0.4;
    const a1 = a0 + 0.8;
    s += path(`M${f(lx + Math.cos(a0) * 13)} ${f(ly + Math.sin(a0) * 13)}A13 13 0 0 1 ${f(lx + Math.cos(a1) * 13)} ${f(ly + Math.sin(a1) * 13)}L${f(lx + Math.cos(a1) * 6.5)} ${f(ly + Math.sin(a1) * 6.5)}A6.5 6.5 0 0 0 ${f(lx + Math.cos(a0) * 6.5)} ${f(ly + Math.sin(a0) * 6.5)}Z`, RED);
  }
  s += circ(lx, ly, 13, 'none', { sw: 2.6 }) + circ(lx, ly, 6.5, '#b98a5a', { sw: 2.2 });
  s += path(`M${lx - 9} ${ly - 7}Q${lx - 4} ${ly - 13} ${lx + 4} ${ly - 12}`, 'none', { sw: 2.4, stroke: '#ffffff', op: 0.7, cap: true });
  // Rope.
  s += line(`M${cx + 5} 12Q${cx + 22} 26 ${cx + 14} 50Q${cx + 10} 58 ${cx + 20} 60`, '#d8b878', 2.4, { dash: '3 2' });
  return svg(W, H, s, { cls: 'souv souv-anchor', over: true });
}

/** The scoreboard's blank panel (viewBox units) for the UI to overlay the Skull count. */
const SCORE_PANEL = { x: 12, y: 22, w: 60, h: 30 };

function scoreboardSvg() {
  const W = 84;
  const H = 140;
  const T = 8; // board top offset
  let s = shadow(42, 137, 30, 3);
  for (const x of [22, 62]) {
    s += rect(x - 3.5, 68, 7, 70, STEEL, { sw: 2.2 });
    for (let y = 76; y < 134; y += 14) s += line(`M${x - 3} ${y}l6 7`, '#7a8088', 1.2);
  }
  s += line('M22 98L62 114M62 98L22 114', '#7a8088', 2) + rect(14, 132, 56, 6, '#c8c2b8', { sw: 2, rx: 2 });
  // Lamps on top.
  s += stick(`M16 ${T + 4}V${T - 1}M68 ${T + 4}V${T - 1}`, STEEL, 1.6, 2);
  s += rect(8, 1, 16, 6, '#fff6c8', { sw: 2, rx: 2 }) + rect(60, 1, 16, 6, '#fff6c8', { sw: 2, rx: 2 });
  // Board.
  s += rect(2, T + 4, 80, 64, BLUE, { sw: 3, rx: 7 });
  s += rect(5, T + 7, 74, 5, lt(BLUE, 0.35), { rx: 3 });
  for (let i = 0; i < 9; i++) s += bulb(8 + i * 8.5, T + 9.5, true, 1.7);
  const P = SCORE_PANEL;
  s += rect(P.x, P.y, P.w, P.h, '#1d1a22', { sw: 2.2, rx: 3 });
  s += rect(P.x + 3, P.y + 3, P.w - 6, 3, '#ffffff', { op: 0.1 });
  // Skull icon and lights under the panel.
  const sx = 42;
  const sy = T + 55;
  s += path(`M${sx - 7} ${sy}Q${sx - 7} ${sy - 8} ${sx} ${sy - 8}Q${sx + 7} ${sy - 8} ${sx + 7} ${sy}Q${sx + 7} ${sy + 3} ${sx + 4} ${sy + 4}V${sy + 7}H${sx - 4}V${sy + 4}Q${sx - 7} ${sy + 3} ${sx - 7} ${sy}Z`, WHITE, { sw: 1.8 });
  s += circ(sx - 3, sy - 1, 2, O) + circ(sx + 3, sy - 1, 2, O) + path(`M${sx} ${sy + 1}l-1 2h2z`, O);
  s += circ(18, sy + 1, 4, RED, { sw: 1.6 }) + circ(66, sy + 1, 4, GREEN, { sw: 1.6 }) + circ(17, sy - 0.5, 1.2, '#ffffff', { op: 0.7 }) + circ(65, sy - 0.5, 1.2, '#ffffff', { op: 0.7 });
  return svg(W, H, s, { cls: 'souv souv-scoreboard', over: true });
}

function jetSvg() {
  const W = 60;
  const H = 92;
  let s = shadow(30, 89, 26, 3);
  let b = '';
  // Fuselage nose pointing up (drawn upright, then tilted).
  b += path('M10 92L10 46Q10 8 30 2Q50 8 50 46L50 92Z', WHITE, { sw: 2.8 });
  b += path('M42 20Q50 30 50 46L50 92L40 92L40 40Q40 28 36 18Z', O, { op: 0.08 });
  b += path('M10 66L50 66L50 74L10 74Z', BLUE) + path('M10 76L50 76L50 79L10 79Z', RED);
  b += path('M18 14Q30 4 42 14L41 20Q30 14 19 20Z', '#3a4a6a', { sw: 1.8 });
  b += path('M21 18L24 16L25 19ZM35 16L39 18L35 19Z', '#9fd8ff');
  b += path('M24 8Q30 2 36 8Q30 6 24 8Z', '#5a6070');
  for (let y = 34; y < 62; y += 8) b += circ(20, y, 2.4, '#9fd8ff', { sw: 1.3 }) + circ(40, y, 2.4, '#9fd8ff', { sw: 1.3 });
  b += path('M10 92L10 46Q10 8 30 2Q50 8 50 46L50 92', 'none', { sw: 2.8 });
  b += path('M15 44Q15 20 26 9', 'none', { sw: 3, stroke: '#ffffff', op: 0.8, cap: true });
  s += g(b, { tf: 'rotate(-12 30 84)' });
  // Dirt mound and a little flag.
  s += path('M0 92Q30 72 60 92Z', '#b98a5a', { sw: 2.4 }) + path('M8 88Q20 80 30 82', 'none', { sw: 2, stroke: '#d8aa78', cap: true });
  s += ell(10, 90, 5, 2, GRASS_D) + ell(50, 90, 6, 2, GRASS_D);
  s += flag(52, 84, 28, GOLD, 1);
  return svg(W, H, s, { cls: 'souv souv-jet', over: true });
}

const SOUVENIRS = { donut: donutSvg, fountain: fountainSvg, anchor: anchorSvg, scoreboard: scoreboardSvg, jet: jetSvg };

/**
 * A zone souvenir: donut | fountain | anchor | scoreboard | jet. viewBox 0 0 w h
 * = PARK.souvenirs[id]. The scoreboard's blank panel is at SCORE_PANEL
 * {x 12, y 22, w 60, h 30} in its viewBox (also on the returned svg as data-panel).
 */
export function souvenirSvg(id) {
  const fn = SOUVENIRS[id];
  if (!fn) return '';
  const out = fn();
  if (id === 'scoreboard') return out.replace('<svg ', `<svg data-panel="${SCORE_PANEL.x} ${SCORE_PANEL.y} ${SCORE_PANEL.w} ${SCORE_PANEL.h}" `);
  return out;
}

// --- The bus ---------------------------------------------------------------------------------

/** The squad's bus: a repurposed park tram. viewBox 0 0 124 70, bottom-centre (62, 70), faces right. */
export function busSvg() {
  const W = 124;
  const H = 70;
  let s = shadow(62, 67, 56, 3.5);
  // Rear flag and spare tire.
  s += flag(7, 20, 18, RED, -1);
  s += circ(5, 40, 8, RUBBER, { sw: 2.4 }) + circ(5, 40, 3.4, STEEL, { sw: 1.4 });
  // Canopy poles and seats.
  for (const x of [12, 40, 68, 94]) s += stick(`M${x} 20V31`, WHITE, 2, 2.2);
  for (const x of [17, 45, 72]) s += rect(x, 22, 18, 10, BLUE, { sw: 2, rx: 3 }) + rect(x + 2, 24, 14, 2.5, lt(BLUE, 0.4), { rx: 1 });
  // Passenger body.
  s += rect(6, 30, 94, 20, YELLOW, { sw: 2.8 });
  s += rect(6, 37, 94, 5, RED) + line('M6 37H100M6 42H100', O, 1.2, { op: 0.5 }) + path('M9 33H97', 'none', { sw: 2.2, stroke: '#ffe28a', cap: true });
  s += star(52, 46, 3.6, WHITE, { sw: 1.1 });
  s += patch(22, 43, 12, 6, STEEL, -4) + nail(24, 45) + nail(32, 45);
  // Cab with a round nose.
  s += path('M94 50V24Q94 16 102 16H106Q121 18 121 38V50Z', YELLOW, { sw: 2.8 });
  s += path('M101 21H106Q115 22 117 33H101Z', '#bfeaff', { sw: 2.2 }) + line('M104 30l5 -7', '#ffffff', 1.6, { op: 0.8 });
  s += rect(94, 37, 27, 5, RED) + line('M94 37H121M94 42H121', O, 1.2, { op: 0.5 });
  s += path('M94 50V24Q94 16 102 16H106Q121 18 121 38V50Z', 'none', { sw: 2.8 });
  s += circ(117, 46, 3.4, '#fff6c2', { sw: 1.6 }) + circ(117, 46, 8, '#fff3a0', { op: 0.3 });
  // Canopy roof: stripes and scallops.
  let cd = '';
  for (let i = 0; i < 9; i++) cd += path(`M${4 + i * 12} 9H${16 + i * 12}V15Q${10 + i * 12} 21 ${4 + i * 12} 15Z`, i % 2 ? WHITE : RED);
  s += rect(2, 7, 112, 4, YELLOW, { sw: 2.2, rx: 2 }) + cd + path('M4 9H112V15' + Array.from({ length: 9 }, (_, i) => `Q${112 - i * 12 - 6} 21 ${112 - (i + 1) * 12} 15`).join('') + 'Z', 'none', { sw: 2.2 });
  for (let i = 0; i < 9; i++) s += bulb(10 + i * 12, 19, true, 1.6);
  // Bumper-car rubber all round.
  s += rect(1, 48, 122, 9, RUBBER, { rx: 4.5, sw: 2.6 }) + line('M7 51.5H117', '#5a525e', 1.6);
  for (const x of [28, 96]) s += circ(x, 58, 10.5, RUBBER, { sw: 2.6 }) + circ(x, 58, 5, YELLOW, { sw: 2 }) + circ(x, 58, 1.6, O);
  return svg(W, H, s, { cls: 'bus', over: true });
}

// --- Zombies ---------------------------------------------------------------------------------

const ZPAL = {
  walker: { skin: ZSKIN, shade: ZSHADE, light: ZLIGHT, shirt: '#8a76c8', pants: '#4a5a8a', hair: '#5a4a3a' },
  runner: { skin: ZSKIN, shade: ZSHADE, light: ZLIGHT, shirt: ORANGE, pants: '#3d5a9a', hair: '#7a4a2a' },
  brute: { skin: '#8fcb5c', shade: '#64983c', light: '#b9e584', shirt: '#e8e2d6', pants: '#6a4a3a', hair: '#3a2a20' },
  spitter: { skin: '#a8da6c', shade: '#73aa48', light: '#d0f096', shirt: '#ff8fb8', pants: '#5a4a7a', hair: '#9a5a3a' },
  horde: { skin: ZSKIN, shade: ZSHADE, light: ZLIGHT, shirt: '#5fb8e8', pants: '#5a4a7a', hair: '#5a3a2a' },
  golden: { skin: GOLD, shade: '#e09a18', light: '#fff1b0', shirt: '#fff6d8', pants: '#c98a12', hair: '#c97a10' },
};
const HORDE_SHIRTS = ['#5fb8e8', '#ff8a5a', '#f5d24a', '#c68aff'];

const arm = (d, color, w, sx, sy, hand) => `<g class="z-arm" style="transform-origin:${sx}px ${sy}px;transform-box:view-box">${stick(d, color, w, 2.2)}${hand}</g>`;
const hand = (x, y, r, c) => circ(x, y, r, c, { sw: 1.8 });

function zHead(cx, cy, r, p, o = {}) {
  let s = circ(cx, cy, r + 1, O) + circ(cx, cy, r, p.shade) + circ(cx + r * 0.08, cy - r * 0.12, r * 0.88, p.skin) + ell(cx + r * 0.3, cy - r * 0.48, r * 0.32, r * 0.2, p.light);
  // Ear on the back side.
  if (!o.noEar) s += circ(cx - r * 0.92, cy + r * 0.1, r * 0.24, p.shade, { sw: 1.4 });
  return s;
}

function zFace(cx, cy, r, o = {}) {
  // Faces right: big front eye, small back eye, crooked open mouth with one tooth.
  const ex = cx + r * 0.38;
  const ey = cy - r * 0.08;
  let s = circ(ex, ey, r * 0.34, WHITE, { sw: 1.4 }) + circ(ex + r * 0.1, ey + r * 0.06, r * 0.13, O);
  s += circ(cx - r * 0.12, cy - r * 0.02, r * 0.22, WHITE, { sw: 1.3 }) + circ(cx - r * 0.1, cy + r * 0.06, r * 0.08, O);
  if (o.brow) s += line(`M${f(cx - r * 0.35)} ${f(cy - r * 0.36)}L${f(cx + r * 0.75)} ${f(cy - r * 0.46)}`, O, r * 0.16);
  if (o.mouth !== false) {
    const mx = cx + r * 0.3;
    const my = cy + r * 0.48;
    s += path(`M${f(mx - r * 0.42)} ${f(my - r * 0.06)}Q${f(mx)} ${f(my + r * 0.4)} ${f(mx + r * 0.44)} ${f(my - r * 0.14)}Q${f(mx)} ${f(my + r * 0.08)} ${f(mx - r * 0.42)} ${f(my - r * 0.06)}Z`, '#6a2a3a', { sw: 1.3 });
    s += rect(mx - r * 0.06, my - r * 0.02, r * 0.16, r * 0.15, WHITE, { sw: 0.8 });
  }
  return s;
}

function stitch(x1, y1, x2, y2) {
  let s = line(`M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, O, 1);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    s += line(`M${f(x - 1)} ${f(y - 1.6)}L${f(x + 1)} ${f(y + 1.6)}`, O, 0.9);
  }
  return s;
}

const shoe = (x, y, w = 5) => ell(x + 1, y, w, 2.6, '#4a3b34', { sw: 1.6 });

function walkerZ(p, gold = false) {
  let s = shadow(20, 54.5, 11, 2);
  s += stick('M17 40L14 51', p.pants, 5.4, 2.2) + shoe(14, 52.5);
  s += arm('M17 28Q25 26 32.5 28', p.skin, 4.2, 17, 28, hand(34, 28, 3, p.skin));
  s += path('M11 26Q11 22 17 22H24Q29 22 29 27V41L26.5 43.5L24 41L21 44L18 41L15 43.5L11 41Z', p.shirt, { sw: 2 });
  s += path('M11 30Q11 26 14 26V41L11 41Z', O, { op: 0.12 }) + rect(22, 30, 5, 4, dk(p.shirt, 0.15), { rx: 1, sw: 1 });
  s += stick('M23 40L26 51', p.pants, 5.4, 2.2) + shoe(26.5, 52.5);
  s += zHead(22, 14, 11, p);
  s += path('M14 6Q17 0 22 3Q25 -1 28 4', 'none', { sw: 2.2, stroke: p.hair, cap: true });
  s += zFace(22, 14, 11);
  s += stitch(13.5, 9, 17, 4);
  s += arm('M21 29Q28 30 34.5 32', p.skin, 4.4, 21, 29, hand(35.8, 32.5, 3.2, p.skin));
  return s;
}

function runnerZ(p) {
  let s = shadow(20, 62.5, 12, 2);
  // Back leg kicked back, front leg striding.
  s += stick('M17 42L10 50L6 58', p.pants, 4.6, 2.2) + shoe(5, 59, 4.6);
  s += arm('M19 26Q12 32 8 38', p.skin, 3.6, 19, 26, hand(7, 39.5, 2.6, p.skin));
  s += g(path('M14 24Q16 20 22 20H26Q30 21 29 26L26 43L22 45L16 43Z', p.shirt, { sw: 2 }) + path('M16 28L27 30', 'none', { sw: 2, stroke: WHITE }), { tf: 'rotate(14 22 32)' });
  s += stick('M22 43L30 50L28 60', p.pants, 4.6, 2.2) + shoe(30, 60.5, 4.6);
  s += zHead(28, 13, 10, p);
  // Sweatband with flying ends.
  s += path('M18.5 9Q28 4 37.5 9L37 12.5Q28 8 19 12.5Z', RED, { sw: 1.4 }) + path('M19 10L11 6L14 11L10 14Z', RED, { sw: 1.3 });
  s += zFace(28, 13, 10);
  // Tongue flapping.
  s += path('M33.5 18.5Q35 23 32 23.5Q30 22 31 18.8Z', '#ff7a9a', { sw: 1.1 });
  s += arm('M24 26Q32 22 38 16', p.skin, 3.8, 24, 26, hand(38.5, 15, 2.8, p.skin));
  s += line('M2 20h6M0 27h7M3 34h5', '#ffffff', 1.8, { op: 0.8 });
  return s;
}

function bruteZ(p) {
  let s = shadow(32, 70.5, 22, 2.6);
  s += stick('M24 56L22 67', p.pants, 9, 2.4) + shoe(21, 68, 7);
  s += arm('M22 30Q34 34 46 44', p.skin, 9, 22, 30, hand(48, 46, 6.5, p.skin));
  // Barrel body with a torn tank top.
  s += path('M10 34Q8 18 24 16H40Q56 18 54 36L52 58H12Z', p.skin, { sw: 2.4 });
  s += path('M14 34Q14 26 20 24L24 34H40L44 24Q50 26 50 34L49 56L44 59L40 55L34 60L28 55L22 59L15 56Z', p.shirt, { sw: 2 });
  s += path('M14 36Q14 28 18 25L16 56H15Z', O, { op: 0.1 }) + circ(38, 44, 4, dk(p.shirt, 0.08)) + stitch(20, 40, 26, 46);
  s += stick('M40 56L42 67', p.pants, 9, 2.4) + shoe(43, 68, 7);
  // Little head sunk into shoulders.
  s += zHead(36, 14, 10, p, { noEar: true });
  s += path('M28 6Q32 2 36 5Q40 1 44 6', 'none', { sw: 2.4, stroke: p.hair, cap: true });
  s += zFace(36, 14, 10, { brow: true, mouth: false });
  s += path('M35 19Q40 22 45 18', 'none', { sw: 1.8, cap: true }) + path('M37 19.6l1 -3l1 3z', WHITE, { sw: 0.8 }) + path('M42 19.4l1 -3l1 2.8z', WHITE, { sw: 0.8 });
  // Bandage.
  s += rect(26, 9, 7, 4, '#f4ead4', { sw: 1.2, rx: 1, tf: 'rotate(-20 29 11)' });
  s += arm('M44 28Q53 34 55 46', p.skin, 9.4, 44, 28, hand(55.5, 50, 7, p.skin));
  return s;
}

function spitterZ(p) {
  let s = shadow(21, 54.5, 13, 2);
  s += stick('M17 44L15 51', p.pants, 5, 2.2) + shoe(15, 52.5);
  s += arm('M14 30Q8 36 9 42', p.skin, 3.6, 14, 30, hand(9, 43.5, 2.6, p.skin));
  // Bloated belly.
  s += ell(20, 36, 12, 11, p.shirt, { sw: 2 }) + ell(16, 34, 4, 3, '#ffffff', { op: 0.3 }) + path('M8 38Q12 46 20 47', 'none', { sw: 2, stroke: dk(p.shirt, 0.2), op: 0.6, cap: true });
  s += ell(22, 40, 4.4, 3.4, p.skin, { sw: 1.2 });
  s += stick('M24 45L27 51', p.pants, 5, 2.2) + shoe(27.5, 52.5);
  s += zHead(23, 15, 11, p);
  s += path('M15 6Q20 1 25 4', 'none', { sw: 2.2, stroke: p.hair, cap: true });
  // Spots.
  s += circ(15, 11, 1.4, p.shade) + circ(19, 7, 1, p.shade);
  // Puffed cheeks.
  s += circ(31, 19, 4.6, p.light, { sw: 1.4 }) + circ(21, 20, 3.8, p.light, { sw: 1.3 });
  s += circ(27, 11.5, 3.4, WHITE, { sw: 1.3 }) + circ(28, 12, 1.3, O) + circ(20, 12, 2.4, WHITE, { sw: 1.2 }) + circ(20.4, 12.6, 0.9, O);
  // Pursed lips and drool.
  s += ell(27, 21.5, 2.6, 1.8, '#6a2a3a', { sw: 1.2 });
  s += path('M27 23Q28.6 28 27.4 31Q26.2 32.6 25.6 30.6Q26.4 27 25.8 23.4Z', '#c6f04a', { sw: 1.2 }) + circ(26.4, 33.4, 1.3, '#c6f04a', { sw: 0.9 });
  s += circ(35, 13, 2.2, '#c6f04a', { sw: 1 }) + circ(36.5, 11.6, 0.7, '#ffffff');
  s += arm('M26 30Q32 32 34 38', p.skin, 3.8, 26, 30, hand(34.5, 39.5, 2.8, p.skin));
  return s;
}

function hordeZ(p, v) {
  const shirt = HORDE_SHIRTS[v % HORDE_SHIRTS.length];
  let s = shadow(14, 37, 8, 1.6);
  s += stick('M11 30L10 34', p.pants, 3.6, 2) + ell(10.5, 35, 3.4, 1.8, '#4a3b34', { sw: 1.3 });
  s += arm('M11 22Q17 21 22 22', p.skin, 3, 11, 22, hand(23, 22, 2.2, p.skin));
  s += path('M7 22Q7 18 12 18H17Q21 18 21 22V31H7Z', shirt, { sw: 1.8 });
  s += stick('M17 30L18 34', p.pants, 3.6, 2) + ell(18.5, 35, 3.4, 1.8, '#4a3b34', { sw: 1.3 });
  s += zHead(15, 11, 9, p);
  if (v % 4 === 1) s += path('M8 6Q15 -1 22 6Q15 3 8 6Z', RED, { sw: 1.3 }) + line('M22 6l4 1', O, 1.6);
  else if (v % 4 === 2) s += circ(15, 2, 2.4, GOLD, { sw: 1.2 }) + path('M9 6Q15 0 21 6', 'none', { sw: 1.8, stroke: p.hair, cap: true });
  else s += path('M10 4Q13 0 16 3Q18 0 21 4', 'none', { sw: 1.8, stroke: p.hair, cap: true });
  s += zFace(15, 11, 9);
  s += arm('M14 23Q20 24 24 26', p.skin, 3.2, 14, 23, hand(25, 26.5, 2.3, p.skin));
  return s;
}

const ZVB = { walker: [40, 56], runner: [40, 64], brute: [64, 72], spitter: [44, 56], horde: [28, 38], golden: [40, 56] };

/**
 * A zombie, feet at bottom-centre, facing right (flip: facing left).
 * kinds: walker 40×56, runner 40×64, brute 64×72, spitter 44×56, horde 28×38, golden 40×56.
 * Arms are <g class="z-arm"> with the shoulder as transform-origin. Golden adds
 * <g class="z-sparkle">. variant (0..3, horde only) swaps shirt and hat.
 */
export function zombieSvg(kind = 'walker', { flip = false, variant = 0 } = {}) {
  const k = ZVB[kind] ? kind : 'walker';
  const [W, H] = ZVB[k];
  const p = ZPAL[k];
  let s;
  if (k === 'runner') s = runnerZ(p);
  else if (k === 'brute') s = bruteZ(p);
  else if (k === 'spitter') s = spitterZ(p);
  else if (k === 'horde') s = hordeZ(p, variant);
  else s = walkerZ(p, k === 'golden');
  if (k === 'golden') {
    s = ell(20, 30, 19.5, 25.5, '#fff3b0', { op: 0.28 }) + ell(20, 28, 14, 19, '#fff8d8', { op: 0.45 }) + s;
    s += path('M17 6Q20 4 24 5', 'none', { sw: 2, stroke: '#ffffff', op: 0.9, cap: true });
    s += g(sparkle(5, 10, 4) + sparkle(35, 5, 3.4) + sparkle(5, 38, 3) + sparkle(36, 46, 2.6), { cls: 'z-sparkle' });
  }
  if (flip) s = g(s, { tf: `translate(${W} 0) scale(-1 1)` });
  return svg(W, H, s, { cls: `zombie z-${k}`, over: true });
}

// --- Threat badges ---------------------------------------------------------------------------

const THREAT_BG = { runner: '#ff9d5c', brute: '#a98bff', spitter: '#ffd84d', horde: '#ff86a8' };

/** Round 24×24 badge of a threat's zombie head: runner | brute | spitter | horde. */
export function threatIconSvg(threat) {
  const bg = THREAT_BG[threat] || '#cccccc';
  let s = circ(12, 12, 11, bg, { sw: 1.6 }) + path('M4.5 8A9 9 0 0 1 16 3.6', 'none', { sw: 1.6, stroke: '#ffffff', op: 0.45, cap: true });
  const p = ZPAL.walker;
  const head = (cx, cy, r) => circ(cx, cy, r + 0.8, O) + circ(cx, cy, r, p.shade) + circ(cx + r * 0.08, cy - r * 0.12, r * 0.86, p.skin);
  const eyes = (cx, cy, r) => circ(cx - r * 0.38, cy - r * 0.1, r * 0.3, WHITE, { sw: 0.8 }) + circ(cx - r * 0.34, cy - r * 0.06, r * 0.12, O) + circ(cx + r * 0.36, cy - r * 0.14, r * 0.22, WHITE, { sw: 0.8 }) + circ(cx + r * 0.38, cy - r * 0.1, r * 0.09, O);
  if (threat === 'runner') {
    s += line('M2.5 9h3M2 13h3.5M3 17h3', '#ffffff', 1.3, { op: 0.9 });
    s += head(13, 13, 7) + path('M6.2 9.6Q13 5.8 19.8 9.6L19.6 12Q13 8.2 6.4 12Z', RED, { sw: 0.9 }) + path('M6.6 10.4L3.6 8.6L4.6 11.6Z', RED, { sw: 0.8 });
    s += eyes(13, 14, 7) + path('M10.5 17.2Q13 19.4 15.6 17Q13 17.8 10.5 17.2Z', '#6a2a3a', { sw: 0.8 }) + path('M14 17.8q1 2.6 -0.6 2.8q-0.8 -1 -0.4 -2.6z', '#ff7a9a', { sw: 0.6 });
  } else if (threat === 'brute') {
    s += path('M4.5 21Q4 14 8 12H16Q20 14 19.5 21Z', '#8fcb5c', { sw: 1.2 });
    s += head(12, 10.5, 6.6) + line('M7.6 8.2L16.4 7.6', O, 1.5) + eyes(12, 11, 6.6);
    s += path('M9.4 14.4Q12 16 14.8 14.2', 'none', { sw: 1.1, cap: true }) + path('M10.4 14.9l0.7 -1.8l0.7 1.9zM13.2 14.8l0.7 -1.8l0.7 1.7z', WHITE, { sw: 0.5 });
  } else if (threat === 'spitter') {
    s += head(12, 12, 7.6) + circ(17, 15, 3, ZLIGHT, { sw: 0.9 }) + circ(7.4, 15, 2.6, ZLIGHT, { sw: 0.9 });
    s += eyes(12, 11, 7.6) + ell(12.4, 16, 1.7, 1.2, '#6a2a3a', { sw: 0.8 });
    s += path('M12.4 17Q13.4 20.4 12.6 22Q11.6 22.4 11.6 21Q12 19 11.6 17.2Z', '#c6f04a', { sw: 0.8 });
  } else {
    s += head(6.8, 13.4, 4.4) + eyes(6.8, 13.6, 4.4) + head(17.2, 13.4, 4.4) + eyes(17.2, 13.6, 4.4);
    s += head(12, 10, 5.2) + eyes(12, 10.2, 5.2) + path('M10 13.2Q12 14.8 14.2 13Z', '#6a2a3a', { sw: 0.7 });
    s += path('M2.2 18.5Q12 23 21.8 18.5', 'none', { sw: 0 });
  }
  return svg(24, 24, s, { cls: `threat-icon t-${threat}` });
}

// --- Raid backdrops --------------------------------------------------------------------------

function skyBand(top = '#7fd0ff', bottom = SKY2) {
  const id = uid('bsky');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` + rect(-40, -40, 1040, 260, `url(#${id})`);
}

function clouds(r, n, y0, y1) {
  let s = '';
  for (let i = 0; i < n; i++) s += cloud(60 + (i * 900) / n + r() * 60, y0 + r() * (y1 - y0), 0.7 + r() * 0.5);
  return s;
}

function tree(x, by, s = 1, c = '#4fae45') {
  return stick(`M${x} ${by}V${by - 22 * s}`, WOOD_D, 5 * s, 2.4) + blob([[x, by - 34 * s, 16 * s], [x - 13 * s, by - 24 * s, 11 * s], [x + 13 * s, by - 25 * s, 12 * s]], c, { sw: 2.6, shade: dk(c, 0.18), light: lt(c, 0.25) });
}

function bush(x, by, s = 1) {
  return blob([[x - 9 * s, by - 6 * s, 8 * s], [x, by - 10 * s, 10 * s], [x + 10 * s, by - 6 * s, 8 * s]], '#5aab3e', { sw: 2.4, shade: '#4a9634', light: '#79c654' });
}

function ground(top, fill, edge) {
  return rect(-40, 180, 1040, 60, fill) + rect(-40, 178, 1040, 6, top, { sw: 0 }) + line('M-40 178H1000', edge || O, 2.6);
}

function picnicTable(x, by) {
  let s = stick(`M${x - 20} ${by}L${x - 14} ${by - 16}M${x + 20} ${by}L${x + 14} ${by - 16}`, WOOD_D, 3.4, 2.2);
  s += rect(x - 30, by - 8, 60, 4, WOOD, { sw: 1.8, rx: 1 });
  s += rect(x - 26, by - 20, 52, 5, WOOD, { sw: 2 });
  let ck = '';
  for (let i = 0; i < 9; i++) ck += rect(x - 26 + i * 6, by - 20 + (i % 2) * 2.5, 3, 2.5, RED) + rect(x - 23 + i * 6, by - 20 + ((i + 1) % 2) * 2.5, 3, 2.5, RED);
  s += rect(x - 27, by - 21, 54, 6, WHITE, { sw: 1.8 }) + ck + path(`M${x - 27} ${by - 15}l3 4l3 -4M${x + 21} ${by - 15}l3 4l3 -4`, WHITE, { sw: 1.4 });
  s += rect(x - 6, by - 28, 12, 8, '#d8a860', { sw: 1.8, rx: 2 }) + path(`M${x - 5} ${by - 28}Q${x} ${by - 36} ${x + 5} ${by - 28}`, 'none', { sw: 1.8 });
  return s;
}

function umbrella(x, by, c1 = RED, c2 = WHITE) {
  let s = stick(`M${x} ${by}V${by - 40}`, '#e8e2d6', 2, 2);
  for (let i = 0; i < 4; i++) s += path(`M${x} ${by - 46}L${x - 28 + i * 14} ${by - 34}Q${x - 21 + i * 14} ${by - 38} ${x - 14 + i * 14} ${by - 34}Z`, i % 2 ? c2 : c1, { sw: 1.8 });
  return s + circ(x, by - 47, 2.4, GOLD, { sw: 1.2 });
}

function suburbHouse(x, by, w, h, wall, roof, r) {
  let s = rect(x, by - h, w, h, wall, { sw: 2.6 }) + rect(x + w - 10, by - h, 10, h, O, { op: 0.08 });
  s += path(`M${x - 8} ${by - h + 2}L${x + w / 2} ${by - h - w * 0.42}L${x + w + 8} ${by - h + 2}Z`, roof, { sw: 2.6 });
  s += line(`M${x - 4} ${by - h - 1}L${x + w / 2} ${by - h - w * 0.38}`, lt(roof, 0.35), 2.4);
  if (r() < 0.6) s += rect(x + w * 0.7, by - h - w * 0.32, 8, 16, '#b86b5a', { sw: 2 });
  const dw = 14;
  s += rect(x + w / 2 - dw / 2, by - 26, dw, 26, dk(roof, 0.1), { sw: 2.2, rx: 1 }) + circ(x + w / 2 + 3.5, by - 13, 1.4, GOLD);
  for (const wx of [x + 8, x + w - 26]) {
    s += rect(wx, by - h + 14, 18, 16, '#bfeaff', { sw: 2.2 }) + line(`M${wx + 9} ${by - h + 14}V${by - h + 30}M${wx} ${by - h + 22}H${wx + 18}`, WHITE, 1.6);
    if (r() < 0.35) s += g(rect(wx - 3, by - h + 19, 24, 5, WOOD, { sw: 1.6 }) + nail(wx, by - h + 21.5) + nail(wx + 18, by - h + 21.5), { tf: `rotate(${f((r() - 0.5) * 30)} ${wx + 9} ${by - h + 21})` });
  }
  return s;
}

function picket(x0, x1, by) {
  let s = line(`M${x0} ${by - 10}H${x1}M${x0} ${by - 4}H${x1}`, '#d8d0c4', 2.2);
  for (let x = x0; x <= x1; x += 13) s += path(`M${x - 3.5} ${by}V${by - 14}L${x} ${by - 18}L${x + 3.5} ${by - 14}V${by}Z`, WHITE, { sw: 1.6 });
  return s;
}

function cart(x, by, tipped) {
  const c = `M${x - 14} ${by - 22}H${x + 14}L${x + 10} ${by - 8}H${x - 10}Z`;
  let s = path(c, 'none', { sw: 2.2, stroke: '#7a8088' });
  for (let i = 1; i < 5; i++) s += line(`M${x - 14 + i * 5.6} ${by - 22}L${x - 10 + i * 4} ${by - 8}`, '#9aa0a8', 1.2);
  s += line(`M${x - 13} ${by - 15}H${x + 12}`, '#9aa0a8', 1.2) + stick(`M${x + 14} ${by - 22}L${x + 19} ${by - 27}`, RED, 2, 1.8);
  s += line(`M${x - 10} ${by - 8}V${by - 3}M${x + 10} ${by - 8}V${by - 3}`, '#7a8088', 1.6) + circ(x - 9, by - 2.5, 2.5, RUBBER, { sw: 1.2 }) + circ(x + 9, by - 2.5, 2.5, RUBBER, { sw: 1.2 });
  return tipped ? g(s, { tf: `rotate(-70 ${x + 12} ${by - 2})` }) : s;
}

function lamp(x, by, h = 60) {
  return stick(`M${x} ${by}V${by - h}`, '#5a6070', 2.4, 2) + stick(`M${x} ${by - h}Q${x + 2} ${by - h - 8} ${x + 10} ${by - h - 6}`, '#5a6070', 2, 2) + path(`M${x + 6} ${by - h - 6}h9l-2 5h-5z`, '#fff6c8', { sw: 1.6 });
}

function palm(x, by) {
  let s = rect(x - 9, by - 12, 18, 12, '#d86a5a', { sw: 2, rx: 2 }) + stick(`M${x} ${by - 12}Q${x + 3} ${by - 30} ${x} ${by - 46}`, WOOD, 3.6, 2.2);
  for (const [dx, dy] of [[-18, 4], [18, 4], [-14, -6], [14, -6], [0, -10]]) s += path(`M${x} ${by - 46}Q${x + dx * 0.6} ${by - 56 + dy} ${x + dx} ${by - 44 + dy}Q${x + dx * 0.5} ${by - 48 + dy} ${x} ${by - 46}Z`, GREEN, { sw: 1.8 });
  return s;
}

function container(x, by, w, c) {
  let s = rect(x, by - 22, w, 22, c, { sw: 2.2 });
  for (let i = x + 5; i < x + w - 2; i += 5) s += line(`M${i} ${by - 20}V${by - 2}`, dk(c, 0.2), 1.2);
  return s + rect(x + w - 8, by - 20, 6, 18, O, { op: 0.1 });
}

function crane(x, by, c) {
  let s = stick(`M${x - 16} ${by}L${x - 12} ${by - 120}M${x + 16} ${by}L${x + 12} ${by - 120}`, c, 5, 2.4);
  for (let y = by - 20; y > by - 120; y -= 22) s += line(`M${x - 15} ${y}L${x + 15} ${y - 18}M${x + 15} ${y}L${x - 15} ${y - 18}`, dk(c, 0.15), 1.6);
  s += stick(`M${x - 70} ${by - 120}H${x + 80}`, c, 6, 2.4) + rect(x - 18, by - 136, 36, 16, c, { sw: 2.4, rx: 2 }) + rect(x - 12, by - 132, 10, 7, '#bfeaff', { sw: 1.4 });
  s += line(`M${x + 58} ${by - 117}V${by - 70}`, O, 1.4) + rect(x + 52, by - 70, 12, 6, '#5a6070', { sw: 1.4 });
  s += line(`M${x - 12} ${by - 136}L${x - 66} ${by - 122}M${x + 12} ${by - 136}L${x + 76} ${by - 122}`, O, 1.2);
  return s;
}

function jetPlane(x, by, s = 1) {
  const k = (n) => f(n * s);
  let p = '';
  p += path(`M${x - k(60)} ${by - k(16)}H${x + k(48)}Q${x + k(66)} ${by - k(16)} ${x + k(70)} ${by - k(8)}Q${x + k(66)} ${by} ${x + k(48)} ${by}H${x - k(52)}Q${x - k(60)} ${by} ${x - k(64)} ${by - k(6)}Z`, WHITE, { sw: 2.4 });
  p += path(`M${x - k(52)} ${by - k(16)}L${x - k(66)} ${by - k(44)}H${x - k(54)}L${x - k(34)} ${by - k(16)}Z`, BLUE, { sw: 2.4 });
  p += rect(x - k(58), by - k(9), k(118), k(3), BLUE);
  for (let i = 0; i < 8; i++) p += circ(x - k(36) + i * k(10), by - k(10.5), k(1.8), '#5a8ac0');
  p += path(`M${x + k(54)} ${by - k(14)}l${k(8)} 0l${k(4)} ${k(4)}h${k(-12)}z`, '#3a4a6a');
  p += path(`M${x - k(14)} ${by - k(4)}L${x + k(18)} ${by - k(4)}L${x - k(4)} ${by + k(10)}L${x - k(20)} ${by + k(10)}Z`, '#e8eef4', { sw: 2 });
  p += rect(x - k(8), by + k(4), k(16), k(7), STEEL, { sw: 1.6, rx: 3 });
  p += line(`M${x - k(40)} ${by}V${by + k(10)}M${x + k(40)} ${by}V${by + k(10)}`, O, 1.6) + circ(x - k(40), by + k(11), k(3), RUBBER, { sw: 1.2 }) + circ(x + k(40), by + k(11), k(3), RUBBER, { sw: 1.2 });
  return p;
}

const BACKDROPS = {
  1(r) {
    // Picnic Grove.
    let s = skyBand() + sun(860, 40) + clouds(r, 5, 34, 80);
    s += path(smooth([[-40, 150], [120, 112], [300, 136], [480, 104], [660, 132], [840, 108], [1000, 140]]) + 'L1000 190L-40 190Z', '#a9e08c', { sw: 2.2, stroke: '#86c46e' });
    s += ell(560, 168, 90, 10, '#6fd0ff', { sw: 2.2, stroke: '#4aa8d8' }) + path('M500 166h30M580 170h40', 'none', { sw: 2, stroke: '#ffffff', op: 0.7, cap: true });
    s += ell(560, 162, 6, 4, WHITE, { sw: 1.6 }) + circ(565, 158, 3, WHITE, { sw: 1.4 }) + path('M567.5 158l3 1l-3 1z', ORANGE);
    for (const [x, sc] of [[60, 1.2], [210, 0.9], [420, 1.3], [700, 1], [900, 1.25]]) s += tree(x, 180, sc, r() < 0.5 ? '#4fae45' : '#5fbb4e');
    s += bush(140, 180) + bush(330, 180, 0.8) + bush(790, 180, 0.9) + bush(980, 180);
    s += picnicTable(300, 180) + umbrella(300, 158) + picnicTable(640, 180);
    s += path('M690 180L720 172L740 180Z', '#d8a860', { sw: 1.8 }) + circ(728, 176, 3, RED, { sw: 1.2 });
    s += ground('#8bd65a', GRASS, '#4f9a32') + path('M-40 196Q240 188 480 196T1000 194L1000 210Q720 202 480 210T-40 208Z', '#e8c48a', { op: 0.85 });
    for (let i = 0; i < 26; i++) {
      const x = r() * 960;
      s += circ(x, 186 + r() * 30, 2, [WHITE, '#ffe066', '#ff9ccf'][i % 3], { sw: 0.8 });
    }
    return s;
  },
  2(r) {
    // Suburbs.
    let s = skyBand() + clouds(r, 6, 26, 56);
    s += path(smooth([[-40, 140], [160, 118], [380, 130], [600, 112], [820, 128], [1000, 120]]) + 'L1000 190L-40 190Z', '#a9e08c', { sw: 2, stroke: '#86c46e' });
    const walls = ['#f7d38a', '#9ec9f5', '#f4a8a0', '#c3e39a', '#e3c3f5'];
    const roofs = [RED, '#5b6fb0', '#7a5a9a', '#d86a5a', '#4a8a7a'];
    let x = 20;
    for (let i = 0; i < 5; i++) {
      const w = 110 + Math.floor(r() * 30);
      s += suburbHouse(x, 168, w, 54 + Math.floor(r() * 20), walls[i], roofs[i], r);
      if (i % 2 === 0) s += tree(x + w + 22, 168, 0.8);
      x += w + 70;
    }
    s += picket(-40, 1000, 172);
    s += stick('M250 180V160', '#7a8088', 2.4) + rect(242, 150, 18, 12, BLUE, { sw: 2, rx: 4 }) + rect(258, 146, 2, 8, RED);
    s += rect(-40, 172, 1040, 8, '#8bd65a') + ground('#e9e3d6', '#7a7d88', '#9a958a');
    s += rect(-40, 178, 1040, 10, '#e9e3d6') + line('M-40 188H1000', '#b8b2a6', 2.4);
    for (let x2 = 0; x2 < 980; x2 += 60) s += line(`M${x2} 178V188`, '#c8c2b6', 1.4) + rect(x2 + 10, 203, 30, 4, '#ffd84d', { rx: 2 });
    return s;
  },
  3(r) {
    // Shopping Mall.
    let s = skyBand() + sun(880, 36) + clouds(r, 4, 26, 60);
    for (let i = 0; i < 8; i++) s += rect(i * 130 - 20, 90 + (i % 3) * 14, 90, 90, '#cfe2ee', { sw: 2, stroke: '#a8c4d4' });
    s += rect(80, 66, 800, 112, '#f3e6d2', { sw: 2.8 }) + rect(80, 66, 800, 14, '#5fc7c0', { sw: 2.4 }) + rect(80, 80, 800, 6, PINK);
    for (let i = 0; i < 10; i++) {
      const wx = 100 + i * 78;
      if (i === 4 || i === 5) continue;
      s += rect(wx, 98, 60, 62, '#bfeaff', { sw: 2.4 }) + path(`M${wx + 8} 158L${wx + 34} 100M${wx + 26} 158L${wx + 52} 100`, 'none', { sw: 4, stroke: '#ffffff', op: 0.45 });
      s += path(`M${wx - 4} 98H${wx + 64}L${wx + 60} 108H${wx}Z`, i % 2 ? RED : '#5fc7c0', { sw: 2 });
    }
    s += rect(408, 92, 144, 86, '#2a3a4a', { sw: 2.6 }) + rect(414, 98, 64, 80, '#bfeaff', { sw: 2 }) + rect(482, 98, 64, 80, '#bfeaff', { sw: 2 }) + line('M480 98V178', O, 2);
    s += rect(380, 26, 200, 44, '#5fc7c0', { sw: 2.8, rx: 10 }) + circ(480, 48, 15, '#e3a55c', { sw: 2.4 }) + circ(480, 47, 11, PINK) + circ(480, 48, 5, '#5fc7c0', { sw: 2 });
    s += bulbsOnLine(392, 26, 568, 26, 9, 2.2);
    s += flag(100, 66, 30, RED) + flag(860, 66, 30, BLUE);
    s += palm(60, 180) + palm(380, 180) + palm(580, 180) + palm(910, 180);
    s += lamp(200, 180) + lamp(740, 180);
    s += ground('#e8d9c2', '#7b7f8a', '#a89a88');
    s += rect(-40, 178, 1040, 8, '#e8d9c2') + line('M-40 186H1000', '#a89a88', 2.2);
    for (let x = 0; x < 980; x += 56) s += line(`M${x} 194L${x + 14} 220`, '#ffffff', 2.4, { op: 0.8 });
    s += cart(300, 180) + cart(660, 180, true) + cart(690, 180);
    return s;
  },
  4(r) {
    // Harbor.
    let s = skyBand('#7fd0ff', '#d6f4ff') + sun(120, 40) + clouds(r, 4, 28, 60);
    s += rect(-40, 112, 1040, 70, '#4fb8e8') + line('M-40 112H1000', '#3a98c8', 2.4);
    for (let i = 0; i < 18; i++) s += path(`M${r() * 960} ${120 + r() * 50}q5 -3 10 0q5 3 10 0`, 'none', { sw: 2, stroke: '#ffffff', op: 0.55, cap: true });
    s += path('M640 110L700 96L760 110Z', '#9fd890', { sw: 2, stroke: '#7ab86e' });
    // Cargo ship on the horizon.
    s += path('M380 112H520L508 124H392Z', '#e8483f', { sw: 2.2 }) + container(396, 112, 26, BLUE) + container(424, 112, 26, YELLOW) + container(452, 112, 26, GREEN) + rect(484, 92, 20, 20, WHITE, { sw: 2 });
    s += path('M260 150L262 126L286 148Z', WHITE, { sw: 1.8 }) + path('M246 150H292L286 158H252Z', '#c98a4b', { sw: 1.8 });
    s += crane(170, 180, RED) + crane(760, 180, BLUE);
    s += container(300, 180, 46, ORANGE) + container(350, 180, 46, BLUE) + container(324, 158, 46, GREEN) + container(560, 180, 50, PURPLE) + container(614, 180, 46, YELLOW);
    // Lighthouse.
    s += path('M896 180L904 70H928L936 180Z', WHITE, { sw: 2.6 }) + path('M898 150H934L935 166H897ZM901 110H931L932 126H900Z', RED) + path('M896 180L904 70H928L936 180Z', 'none', { sw: 2.6 });
    s += rect(902, 52, 28, 18, '#fff6c8', { sw: 2.4 }) + path('M898 52L916 38L934 52Z', RED, { sw: 2.4 }) + circ(916, 61, 12, '#fff3a0', { op: 0.4 });
    for (const [x, y] of [[520, 50], [560, 64], [610, 44]]) s += path(`M${x - 7} ${y}q4 -5 7 0q3 -5 7 0`, 'none', { sw: 2, stroke: '#5a6070', cap: true });
    s += ground(WOOD_L, WOOD, '#7a4a24');
    for (let x = -40; x < 1000; x += 34) s += line(`M${x} 180V220`, WOOD_D, 1.6);
    s += line('M-40 198H1000', WOOD_D, 1.6);
    for (const x of [80, 480, 860]) s += rect(x - 6, 168, 12, 12, '#5a6070', { sw: 2, rx: 3 }) + ell(x, 168, 8, 3, '#5a6070', { sw: 2 });
    s += circ(250, 166, 10, WHITE, { sw: 2.2 }) + circ(250, 166, 5, WOOD, { sw: 1.8 }) + path('M241 162l4 3M259 162l-4 3M244 174l3 -3M256 174l-3 -3', 'none', { sw: 3.4, stroke: RED });
    return s;
  },
  5(r) {
    // Stadium.
    let s = skyBand() + clouds(r, 4, 24, 50);
    // Stands: a big bowl.
    s += path('M-40 160L-40 64Q480 20 1000 64L1000 160Z', '#dfe7ee', { sw: 2.8 });
    const seatC = [RED, BLUE, YELLOW, '#5fc7c0'];
    const bow = (x, row) => -20 * (1 - ((x - 480) / 620) ** 2) * (1 - row * 0.16);
    for (let row = 0; row < 5; row++) {
      const y0 = 74 + row * 17;
      for (let sx = -40, k = 0; sx < 1000; sx += 120, k++) {
        const c = lt(seatC[(row + k) % 4], 0.12);
        const x1 = sx + 115;
        s += path(`M${sx} ${f(y0 + bow(sx, row))}L${x1} ${f(y0 + bow(x1, row))}L${x1} ${f(y0 + 14 + bow(x1, row))}L${sx} ${f(y0 + 14 + bow(sx, row))}Z`, c, { sw: 1.4, stroke: dk(c, 0.3) });
        s += line(`M${sx + 3} ${f(y0 + 7 + bow(sx, row))}L${x1 - 3} ${f(y0 + 7 + bow(x1, row))}`, dk(c, 0.18), 1.4, { dash: '5 3' });
      }
    }
    s += path('M-40 64Q480 20 1000 64L1000 52Q480 6 -40 52Z', '#5a6070', { sw: 2.4 });
    for (const x of [90, 870]) {
      s += stick(`M${x} 160V18`, '#7a8088', 5, 2.4);
      s += rect(x - 24, 0, 48, 22, '#5a6070', { sw: 2.4, rx: 3 });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) s += circ(x - 16 + i * 10.6, 6 + j * 9, 3.6, '#fff6c8', { sw: 1.2 });
      s += circ(x, 11, 30, '#fff6c8', { op: 0.2 });
    }
    s += rect(400, 20, 160, 52, '#2a2a3a', { sw: 2.8, rx: 6 }) + rect(410, 28, 140, 30, '#1a1714', { sw: 1.6 }) + bulbsOnLine(410, 66, 550, 66, 8, 2);
    // Advert boards.
    const ad = [RED, YELLOW, BLUE, GREEN, PURPLE, ORANGE];
    for (let i = 0; i < 10; i++) s += rect(-40 + i * 106, 156, 102, 22, ad[i % 6], { sw: 2.4 }) + rect(-30 + i * 106, 162, 40, 10, WHITE, { rx: 3, op: 0.8 });
    s += ground('#6fc04a', GRASS_D, '#4f9a32');
    for (let x = -40; x < 1000; x += 80) s += rect(x, 180, 40, 40, '#6cc044', { op: 0.7 });
    s += line('M-40 200H1000', WHITE, 2.4, { op: 0.9 }) + ell(480, 210, 70, 12, 'none', { sw: 2.4, stroke: '#ffffff' });
    s += circ(700, 176, 6, WHITE, { sw: 2 }) + path('M697 173l3 -1l3 2l-1 3h-4z', O);
    s += cone(260, 180) + cone(280, 180);
    return s;
  },
  6(r) {
    // Airport.
    let s = skyBand('#7fd0ff', '#d6f4ff') + sun(120, 36) + clouds(r, 5, 24, 70);
    s += path(smooth([[-40, 140], [200, 124], [460, 134], [720, 120], [1000, 132]]) + 'L1000 190L-40 190Z', '#b9e6cf', { sw: 2, stroke: '#93cdb7' });
    // Terminal.
    s += rect(40, 104, 500, 74, '#e8eef4', { sw: 2.8 }) + path('M30 104Q290 76 550 104Z', '#5fc7c0', { sw: 2.6 });
    for (let i = 0; i < 12; i++) s += rect(52 + i * 40, 116, 32, 40, '#bfeaff', { sw: 2 }) + line(`M${58 + i * 40} 152L${74 + i * 40} 120`, '#ffffff', 3, { op: 0.5 });
    s += rect(520, 132, 70, 16, '#cfd8e2', { sw: 2.2 }) + rect(584, 128, 20, 26, '#cfd8e2', { sw: 2.2 });
    // Hangar.
    s += path('M640 178V120Q720 80 800 120V178Z', '#c8d0da', { sw: 2.8 }) + rect(664, 132, 112, 46, '#5a6070', { sw: 2.2 });
    for (let x = 670; x < 776; x += 12) s += line(`M${x} 134V176`, '#7a8088', 1.4);
    // Control tower.
    s += path('M860 178L868 60H892L900 178Z', '#e8eef4', { sw: 2.8 }) + rect(850, 36, 60, 24, '#7fc4e8', { sw: 2.6 }) + path('M846 36L856 26H904L914 36Z', '#5a6070', { sw: 2.4 }) + stick('M880 26V10', '#7a8088', 1.6, 2) + circ(880, 9, 3, RED, { sw: 1.2 });
    // Windsock.
    s += stick('M932 180V120', '#e8e2d6', 2, 2) + path('M932 122L958 126L956 134L932 136Z', ORANGE, { sw: 2 }) + path('M941 123.4V135M950 124.8V134.6', 'none', { sw: 3, stroke: WHITE });
    s += jetPlane(300, 168, 1.1);
    s += ground('#8a8e98', '#6b6e78', '#4a4d55');
    s += rect(-40, 178, 1040, 6, '#9a9ea8');
    for (let x = 0; x < 980; x += 70) s += rect(x, 199, 40, 4, WHITE, { rx: 2, op: 0.9 });
    s += line('M-40 190H1000', '#ffd84d', 2.4);
    for (let x = 20; x < 980; x += 120) s += circ(x, 186, 2.4, '#fff3a0', { sw: 1 });
    s += cone(620, 180) + rect(700, 166, 40, 10, BLUE, { sw: 2, rx: 2 }) + rect(704, 158, 14, 8, YELLOW, { sw: 1.6 }) + rect(720, 160, 14, 6, RED, { sw: 1.6 }) + circ(708, 178, 3, RUBBER, { sw: 1.2 }) + circ(734, 178, 3, RUBBER, { sw: 1.2 });
    return s;
  },
};

/** A raid backdrop strip, viewBox 0 0 960 220, ground line at y = 180. zone 1..6. */
export function zoneBackdropSvg(zone = 1) {
  const z = Math.max(1, Math.min(6, zone | 0));
  const r = rng(100 + z);
  return svg(960, 220, BACKDROPS[z](r), { cls: `backdrop zone-${z}`, par: 'xMidYMax slice' });
}
