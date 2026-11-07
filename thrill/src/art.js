// Thrill Hill art: the park scene, its rides, the Ferris wheel, souvenirs, the
// bus, zombies, raid backdrops and threat badges. Pure functions that return
// SVG strings: no DOM, no image files, safe to import in node tests.
//
// Look: a sunny toy-box park. Thick warm outlines (#2a1b12), flat fills with one
// shade and one highlight, round chunky shapes, goofy green zombies.
//
// The park is a fixed logical scene of 960×300 (PARK). The UI scales it with
// scale = min(W / 960, H / 300), anchored bottom-centre. parkBackSvg() bleeds
// sky above and the plateau, hedge and bumper wall ~340 units to each side
// (overflow: visible), so any extra area is already painted; PARK.sky /
// PARK.ground are the matching CSS fallbacks.
//
// Draw order (back to front):
//   parkBackSvg → souvenirs with z 'back' (donut, scoreboard, jet) → wheelSvg → buildings (by y) →
//   [souvenirs with z 'front' (fountain, anchor) + bus + people, sorted together by bottom/feet y] → fence zombies
// 'back' souvenirs must not get a z-index above the buildings (their legs and bases are meant to
// hide behind the rides). Every sprite is 1 viewBox unit = 1 scene unit. Zombies differ in size on
// purpose: give each its own viewBox size × ~0.82 in the park (walker ≈ 46 tall), not one fixed box.
//
// Animation hooks (CSS the UI may add; pivots are set inline with transform-box: view-box):
//   .wheel-rot   rotate 0→360deg, linear, slow (origin = hub)
//   .gondola     the same animation in reverse, same duration (origin = its hanger), so it hangs
//   .gondola.lit glow pulse if wanted
//   .z-arm       small rotate wobble (origin = the shoulder)
//   .z-dizzy     the stars over a knocked-out zombie (ko: true), spin or bob
//   .z-sparkle   twinkle on the golden zombie's sparkles
//   .park-fire   flicker (scaleY) on the campfire flames (origin = the fire's base)
//   .confetti    twinkle / fade on the neon-stage confetti bits
//   .st-puck     the High Striker puck (can be flung up the rail by a show-off)
//   .duck        each Shooting Gallery duck (origin = its stand), .duck.down is the knocked one
// e.g. @keyframes spin { to { transform: rotate(360deg) } }
//      .wheel-rot { animation: spin 80s linear infinite }
//      .gondola   { animation: spin 80s linear infinite reverse }
//
// ids: only gradients, the tarp clipPaths and the stadium crowd pattern use ids, each made
// unique per call by a module counter, so any number of copies can share a page.

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
    s += i === fallen ? g(duck, { cls: 'duck down', tf: `rotate(-80 ${f(x)} ${f(y + 2)})` }) : g(duck, { cls: 'duck', style: `transform-origin:${f(x)}px ${f(y + 3)}px;transform-box:view-box` });
  }
  return s;
}

function target(cx, cy, r, ring = RED) {
  return circ(cx, cy, r, WHITE, { sw: 1.8 }) + circ(cx, cy, r * 0.66, ring) + circ(cx, cy, r * 0.36, WHITE) + circ(cx, cy, r * 0.15, ring);
}

/** Level → look stage: 0 patched junk (1-2), 1 fresh paint (3-4), 2 neon (5-7). */
const stageOf = (level) => (level >= 5 ? 2 : level >= 3 ? 1 : 0);

/** A prize rosette with two ribbon tails. */
function rosette(x, y, r = 7, c = RED) {
  let s = path(`M${f(x - 2)} ${f(y)}L${f(x - 6)} ${f(y + r + 6)}L${f(x - 3.5)} ${f(y + r + 4)}L${f(x - 1.5)} ${f(y + r + 7)}L${f(x + 1)} ${f(y)}Z`, c, { sw: 1.4 });
  s += path(`M${f(x + 1)} ${f(y)}L${f(x + 3)} ${f(y + r + 7)}L${f(x + 5)} ${f(y + r + 4)}L${f(x + 7.5)} ${f(y + r + 6)}L${f(x + 3)} ${f(y)}Z`, dk(c, 0.15), { sw: 1.4 });
  const pet = [];
  for (let i = 0; i < 10; i++) pet.push([x + Math.cos((i * Math.PI) / 5) * r * 0.78, y + Math.sin((i * Math.PI) / 5) * r * 0.78, r * 0.36]);
  s += blob(pet, GOLD, { sw: 1.6 });
  return s + circ(x, y, r * 0.58, c, { sw: 1.5 }) + star(x, y, r * 0.42, GOLD, { sw: 0.9 });
}

/**
 * Lv 6 and 7 flourishes on top of the neon look: Lv 6 adds a pair of flags,
 * Lv 7 also pins a prize rosette. flags: [[x, y, h, color, dir], ...]; ros: [x, y, r].
 */
function flourish(level, flags, ros) {
  let s = '';
  if (level >= 6) for (const [x, y, h, c, d] of flags) s += flag(x, y, h, c, d);
  if (level >= 7 && ros) s += rosette(ros[0], ros[1], ros[2] || 7, ros[3] || RED);
  return s;
}

/** The High Striker's bicep emblem, centred on (x, y). */
function bicep(x, y, k, fill, sw = 1.8) {
  const d = 'M12 62V55Q16 48 23 51Q24 48 24 45V42Q24 38 28 38Q32 38 32 42V56Q32 62 26 62Z';
  return g(path(d, fill, { sw: sw / k }) + path('M15 56Q18 52 22 54', 'none', { sw: 1.2 / k, op: 0.5 }), { tf: `translate(${f(x - 22 * k)} ${f(y - 50 * k)}) scale(${k})` });
}

// --- The scene layout ----------------------------------------------------------------------

/** The gate (in parkBackSvg): post bases at x ± 26, the arch's crown at y − 86. */
const GATE = { x: 34, y: 206 };

export const PARK = {
  w: 960,
  h: 300,
  /** CSS for any area above the scene (the scene's sky reaches #8fd8ff at y = 0). */
  sky: 'linear-gradient(180deg, #5fbdf8 0%, #8fd8ff 100%)',
  /** CSS colour of the scene's bottom edge (the slope below the wall), for fill below or beside it. */
  ground: '#549d33',
  /** Buildings: (x, y) = bottom-centre anchor in scene units; w/h = drawn size (= viewBox). */
  slots: {
    striker: { x: 118, y: 218, w: 120, h: 170 },
    bigtop: { x: 264, y: 198, w: 200, h: 152 },
    tent: { x: 396, y: 220, w: 136, h: 114 },
    gallery: { x: 664, y: 220, w: 160, h: 124 },
    garage: { x: 804, y: 202, w: 150, h: 120 },
  },
  /** Ferris wheel hub and outer radius. wheelSvg() is 200×214 with its hub at (100, 100): box left x − 1.25r, top y − 1.25r, 2.5r × (2.5r + wheelStandH). */
  wheel: { x: 520, y: 94, r: 80 },
  wheelStandH: 14,
  /** Newcomers appear here (feet), just inside the arch, then walk down into the walk band. */
  gate: { x: GATE.x, y: 212 },
  /** The squad's bus: bottom-centre. busSvg() is 110×64. */
  bus: { x: 902, y: 252, w: 110, h: 64 },
  /**
   * Souvenirs: bottom-centre, w/h = viewBox. z: 'back' = paint before the wheel and the
   * buildings (no z-index above them); 'front' = depth-sort with people by y.
   * The donut sits on top of the gate arch; the jet rests behind the bus.
   */
  souvenirs: {
    donut: { x: GATE.x, y: GATE.y - 84, w: 64, h: 70, z: 'back' },
    fountain: { x: 520, y: 236, w: 108, h: 56, z: 'front' },
    anchor: { x: 338, y: 242, w: 56, h: 66, z: 'front' },
    scoreboard: { x: 734, y: 178, w: 64, h: 168, z: 'back', panel: { x: 8, y: 30, w: 48, h: 28 } },
    jet: { x: 912, y: 178, w: 88, h: 60, z: 'back' },
  },
  /** Feet band where residents wander (sand path). */
  walk: { x0: 80, x1: 836, y0: 230, y1: 256 },
  spots: {
    /** Big Top steps (sleepy residents nap here). */
    steps: { x: 264, y: 204 },
    /** Campfire pit; sit around it at x ± 24..44. */
    fire: { x: 196, y: 228 },
    /** Where the jumpy watch the fence. */
    fence: { x: 300, y: 256 },
    /** In front of the wheel booth (tap the wheel for the Ladder). */
    wheel: { x: 452, y: 234 },
    /** Where a ride's class trains / show-offs perform (feet). */
    rides: {
      striker: { x: 124, y: 232 },
      bigtop: { x: 264, y: 214 },
      tent: { x: 396, y: 234 },
      gallery: { x: 664, y: 234 },
      garage: { x: 790, y: 232 },
    },
    /** The three squad places beside the bus (feet). */
    squad: [
      { x: 806, y: 246 },
      { x: 830, y: 238 },
      { x: 834, y: 255 },
    ],
  },
  /** Top of the bumper-car wall along the front of the park (the wall itself runs on into the side bleed). */
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

/** Distant landmarks (zone 1..6), placed where they peek out between the rides. */
const LANDMARK_X = [155, 330, 612, 930, 728, 874];

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
 * bumper-car wall. The plateau, hedge and wall run on about 340 units into the
 * side bleed, so a wide window shows more park, never an edge. zone 1..6 puts a
 * little gold flag on each reached zone's landmark in the distant town; zone 4+
 * hangs bunting under the gate arch, zone 6 adds pennants on the gate posts.
 */
export function parkBackSvg(zone = 1) {
  const sky = uid('sky');
  const r = rng(7);
  const XL = -340;
  const XR = 1300;
  let s = `<defs><linearGradient id="${sky}" gradientUnits="userSpaceOnUse" x1="0" y1="-320" x2="0" y2="150"><stop offset="0" stop-color="#5fbdf8"/><stop offset="0.68" stop-color="${SKY}"/><stop offset="1" stop-color="${SKY2}"/></linearGradient></defs>`;
  s += rect(-900, -420, 2760, 590, `url(#${sky})`);
  s += sun(388, 34);
  for (const [x, y, k] of [[-300, 40, 1.1], [-90, 66, 0.8], [178, 24, 0.82], [474, 56, 0.78], [664, 26, 1], [874, 40, 0.85], [1090, 34, 1], [1290, 64, 0.9]]) s += cloud(x, y, k);
  // Far hills.
  s += path(smooth([[-900, 132], [-700, 100], [-480, 118], [-260, 96], [-60, 114], [120, 96], [300, 110], [470, 90], [640, 108], [820, 94], [1000, 112], [1200, 98], [1450, 116], [1700, 102], [1860, 128]]) + 'L1860 180L-900 180Z', '#b9e6cf', { sw: 2, stroke: '#93cdb7' });
  s += path(smooth([[-900, 132], [-640, 118], [-380, 128], [-120, 114], [140, 122], [380, 112], [620, 124], [860, 112], [1100, 124], [1380, 114], [1860, 126]]) + 'L1860 180L-900 180Z', '#a3d98b', { sw: 2, stroke: '#82c06e' });
  // Town in the valley.
  const walls = ['#f7d7a6', '#f4b8a8', '#c9dcf5', '#f5ecc4', '#d8c6f0', '#c6e8b8'];
  const roofs = ['#d86a5a', '#7a74b8', '#5f9fd8', '#c98a4b', '#e08ab0'];
  for (let x = XL - 60; x < XR + 60; ) {
    const w = 7 + Math.floor(r() * 8);
    const by = 140 + Math.floor(r() * 10);
    const nearL = LANDMARK_X.some((lx) => Math.abs(lx - x) < 40);
    if (!nearL || r() < 0.3) s += house(x, by, w, 5 + Math.floor(r() * 7), walls[Math.floor(r() * walls.length)], roofs[Math.floor(r() * roofs.length)], r);
    if (r() < 0.12) s += tinyZombie(x + w + 4, by + 2);
    x += w + 4 + Math.floor(r() * 12);
  }
  LANDMARK_X.forEach((x, i) => (s += landmark(i + 1, x, 146, zone >= i + 1)));
  // The hilltop: one flat plateau across the whole bleed.
  s += rect(-900, 150, 2760, 160, GRASS) + line('M-900 150.5H1860', '#5a9e3a', 2);
  // Back edge: picket fence, hedge and mini bumper cars.
  s += fence(XL, XR, 156, 3);
  const bush = [];
  for (let x = XL; x < XR; x += 26 + ((Math.abs(x) * 7) % 11)) bush.push([x, 154 + ((Math.abs(x) * 13) % 5), 9 + ((Math.abs(x) * 3) % 5)]);
  s += blob(bush, '#5aab3e', { sw: 2.4, shade: '#4a9634', light: '#79c654' });
  const cars = [RED, BLUE, GREEN, YELLOW, PURPLE];
  for (let i = 0, x = XL + 10; x < XR; x += 46, i++) if (i % 2 === 0 && x > -120 && x < 1080) s += wallCar(x, 164, 28, cars[(i + 40) % 5], ((i + 30) % 3) - 1, r, (i + 40) % 4 ? 1 : -1);
  // Grass texture and flowers.
  for (let i = 0; i < 96; i++) {
    const x = XL + r() * (XR - XL);
    const y = 168 + r() * 94;
    s += line(`M${f(x - 3)} ${f(y)}l1.5 -4M${f(x)} ${f(y)}l0 -5M${f(x + 3)} ${f(y)}l-1.5 -4`, GRASS_D, 1.4);
  }
  for (let i = 0; i < 56; i++) {
    const x = XL + r() * (XR - XL);
    const y = 168 + r() * 90;
    const c = [WHITE, '#ffe066', '#ff9ccf', '#c9a8ff'][i % 4];
    s += circ(x, y, 2.2, c, { sw: 0.9 }) + circ(x, y, 0.8, i % 4 === 1 ? ORANGE : '#ffd23f');
  }
  // Sand paths: main band + branches to every door, the plaza and the gate.
  const P = [];
  P.push(['r', 14, 214, 932, 46, 23]);
  P.push(['e', 520, 230, 124, 22]);
  for (const k of ['striker', 'bigtop', 'tent', 'gallery', 'garage']) {
    const sl = PARK.slots[k];
    P.push(['r', sl.x - 20, sl.y - 12, 40, 240 - sl.y, 10]);
  }
  P.push(['r', GATE.x - 24, 196, 48, 40, 14]);
  const shapes = (fill, grow, dy = 0) =>
    P.map((p) => (p[0] === 'r' ? rect(p[1] - grow, p[2] - grow + dy, p[3] + grow * 2, p[4] + grow * 2, fill, { rx: p[5] + grow }) : ell(p[1], p[2] + dy, p[3] + grow, p[4] + grow, fill))).join('');
  s += shapes(SAND_D, 3) + shapes(SAND, 0) + shapes('#f8e6bf', -6, -3);
  for (let i = 0; i < 46; i++) {
    const x = 40 + r() * 890;
    const y = 220 + r() * 36;
    s += ell(x, y, 2 + r() * 2, 1.2 + r(), SAND_D, { op: 0.7 });
  }
  // Plaza tiles ring around the fountain.
  s += ell(520, 232, 78, 13, 'none', { sw: 2, stroke: '#e6c68a' });
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
  const G = GATE;
  s += line(`M${G.x - 26} ${G.y - 2}L${G.x - 44} ${G.y + 8}M${G.x + 26} ${G.y - 2}L${G.x + 30} ${G.y + 6}`, SAND_D, 2);
  for (const px of [G.x - 26, G.x + 26]) {
    s += rect(px - 6, G.y - 88, 12, 90, WHITE, { sw: 2.6, rx: 2 });
    for (let y = G.y - 80; y < G.y; y += 16) s += path(`M${px - 6} ${y}l12 -6v8l-12 6z`, RED);
    s += rect(px - 6, G.y - 88, 12, 90, 'none', { sw: 2.6, rx: 2 }) + rect(px - 8, G.y - 4, 16, 6, WOOD_D, { sw: 2, rx: 1 }) + circ(px, G.y - 94, 5, GOLD, { sw: 2 });
  }
  if (zone >= 4) s += bunting(G.x - 20, G.y - 60, G.x + 20, G.y - 60, 4, 5);
  s += path(`M${G.x - 34} ${G.y - 70}Q${G.x} ${G.y - 102} ${G.x + 34} ${G.y - 70}L${G.x + 34} ${G.y - 58}Q${G.x} ${G.y - 88} ${G.x - 34} ${G.y - 58}Z`, YELLOW, { sw: 2.6 });
  s += bulbsOnQ([G.x - 30, G.y - 66], [G.x, G.y - 96], [G.x + 30, G.y - 66], 7, 0.05, 0.95, 2);
  s += star(G.x, G.y - 92, 6, RED, { sw: 2 });
  if (zone >= 6) s += flag(G.x - 26, G.y - 98, 16, PURPLE, -1) + flag(G.x + 26, G.y - 98, 16, BLUE, 1);
  // Front slope below the wall, and the dirt track the zombies have worn into it.
  s += rect(-900, 270, 2760, 40, GRASS_D);
  s += path('M-900 286Q-300 280 0 284T960 282T1860 286L1860 310L-900 310Z', '#549d33');
  s += path('M-900 292Q-420 288 0 291T960 290T1860 292L1860 310L-900 310Z', '#b48a58') + line('M-900 292Q-420 288 0 291T960 290T1860 292', '#8f6a40', 1.6);
  for (let i = 0; i < 40; i++) {
    const x = XL + r() * (XR - XL);
    s += ell(x, 295 + r() * 4, 2 + r() * 3, 1.2, '#8f6a40', { op: 0.6 });
  }
  // The bumper-car wall (muted a little so the fence zombies in front stand out).
  const wc = [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE].map((c) => mix(c, '#4e4a58', 0.3));
  let i = 0;
  for (let x = XL; x < XR + 20; x += 50, i++) {
    if ((i + 12) % 4 === 2) {
      s += tireStack(x, 288, 3, 12);
      continue;
    }
    s += wallCar(x, 290, 54, wc[(i + 12) % wc.length], (r() - 0.5) * 7, r, (i + 12) % 3 === 1 ? -1 : 1);
    if ((i + 12) % 7 === 5) s += cone(x + 26, 290);
  }
  return svg(960, 300, s, { cls: 'park-back', par: 'xMidYMax meet', over: true });
}

// --- Ferris wheel ----------------------------------------------------------------------------

const GONDOLA = [RED, BLUE, GREEN, YELLOW, PURPLE, ORANGE];

/**
 * The Ferris wheel, viewBox 0 0 200 214, hub at (100, 100), rim radius 78 (80 with bulbs).
 * Gondola i (zone i + 1) rests at angle −60° + i·60° (clockwise from 3 o'clock), so none sits at 6 o'clock.
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
    // Start 30° round so no gondola rests at 6 o'clock behind the booth or the fountain.
    const a = -Math.PI / 2 + Math.PI / 6 + (i * Math.PI) / 3;
    const ax = f(cx + Math.cos(a) * R);
    const ay = f(cy + Math.sin(a) * R);
    const on = i < lit;
    // Unlit: plain grey car with a dark window. Lit: its zone colour, a warm gold glow and riders.
    const col = on ? GONDOLA[i] : '#b9b3aa';
    const roof = on ? lt(GONDOLA[i], 0.15) : '#d3cec6';
    let gd = '';
    if (on) gd += circ(ax, ay + 16, 21, '#ffc23a', { op: 0.32 }) + circ(ax, ay + 16, 15.5, '#ffe27a', { op: 0.55 });
    gd += stick(`M${ax} ${ay}V${ay + 8}`, STEEL, 1.6, 2);
    gd += path(`M${ax - 12} ${ay + 10}H${ax + 12}L${ax + 11} ${ay + 21}Q${ax} ${ay + 28} ${ax - 11} ${ay + 21}Z`, col, { sw: 2.4 });
    gd += path(`M${ax - 9} ${ay + 22}Q${ax} ${ay + 26.5} ${ax + 9} ${ay + 22}`, 'none', { sw: 2, stroke: dk(col, 0.25), cap: true });
    gd += rect(ax - 7.5, ay + 12.5, 15, 6.5, on ? '#fff2a8' : '#4f4842', { rx: 2, sw: 1.6 });
    if (on) gd += circ(ax - 3, ay + 17.5, 2.1, O) + circ(ax + 3, ay + 17.8, 2.1, O);
    gd += path(`M${ax - 13.5} ${ay + 11}Q${ax} ${ay + 1} ${ax + 13.5} ${ay + 11}Z`, roof, { sw: 2.2 });
    gd += path(`M${ax - 4} ${ay + 10.6}Q${ax} ${ay + 3.4} ${ax + 4} ${ay + 10.6}`, on ? WHITE : '#ebe7e0', { op: 0.9 });
    if (on) gd += circ(ax, ay + 1, 2.6, GOLD, { sw: 1.2 }) + sparkle(ax + 14, ay + 6, 4);
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
  } else {
    for (let k = 0; k < K; k++) s += bulb(14 + (172 * (k + 0.5)) / K, 110, true, 2.2);
  }
  // Moon-and-star bed sign over the door.
  if (st0 === 0) s += g(path('M104 76a10 10 0 1 1 -2 -14a8 8 0 1 0 2 14z', '#d8cfa0', { sw: 2 }), { tf: 'rotate(-12 100 70)' });
  else if (st0 === 1) s += circ(cx, 76, 13, '#2d4e9a', { sw: 2.4 }) + path('M104 82a8 8 0 1 1 0 -12a6.4 6.4 0 1 0 0 12z', GOLD, { sw: 1.4 }) + star(107, 71, 3, WHITE, { sw: 0.9 });
  else s += circ(cx, 76, 14, '#3a3fa8', { sw: 2.4 }) + neon('M104 83a8.5 8.5 0 1 1 0 -13a6.6 6.6 0 1 0 0 13z', '#ffe066', 2) + star(108, 70, 3.2, '#ffe066', { sw: 0.9 });
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
  s += flourish(level, [[22, 100, 20, GOLD, -1], [178, 100, 20, PINK, 1]], [146, 126, 7.5, BLUE]);
  return svg(W, H, s, { cls: 'bld bld-bigtop', over: true });
}

function strikerSvg(level) {
  const s0 = stageOf(level);
  const W = 120;
  const H = 170;
  const cx = 60;
  let s = shadow(cx, 165, 52, 5);
  // Stage 2: a chunky two-tone sunburst behind the bell.
  if (s0 === 2) {
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 + Math.PI / 12;
      const rr = i % 2 ? 26 : 32;
      s += path(`M${cx} 22L${f(cx + Math.cos(a - 0.17) * rr)} ${f(22 + Math.sin(a - 0.17) * rr)}L${f(cx + Math.cos(a + 0.17) * rr)} ${f(22 + Math.sin(a + 0.17) * rr)}Z`, i % 2 ? '#fff3b0' : GOLD, { sw: 1.6 });
    }
  }
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
    tower += g(rect(tx - 4, 92, tw + 8, 7, WOOD_L, { sw: 2 }) + nail(tx - 1, 95.5) + nail(tx + tw + 1, 95.5), { tf: `rotate(-14 ${cx} 96)` });
    tower += patch(tx + 12, 114, 10, 10, '#8fa0b4', 8);
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
  // Rail and puck (class st-puck: CSS may fling it up the rail).
  s += line(`M${cx} ${ty0 + 4}V${ty1 - 2}`, O, 1.6);
  s += g(rect(cx - 7, 100, 14, 9, s0 === 0 ? '#b8b0a0' : GOLD, { sw: 2, rx: 2.5 }) + rect(cx - 5, 101.5, 6, 2.4, '#ffffff', { op: 0.5, rx: 1 }), { cls: 'st-puck' });
  if (s0 >= 1) s += line(`M${cx - 4} 114h8M${cx - 3} 119h6`, O, 1.4, { op: 0.5 });
  // Bulbs up both sides.
  if (s0 >= 1) for (let y = ty0 + 6; y < ty1; y += 11) s += bulb(tx - 4, y, true, 2.1) + bulb(tx + tw + 4, y, true, 2.1);
  if (s0 === 2) s += neon(`M${tx - 8} ${ty1}V${ty0 - 2}M${tx + tw + 8} ${ty1}V${ty0 - 2}`, '#ff4a5a', 2.2);
  // The Brawler emblem, fixed on the tower under the bell.
  const my = 62;
  if (s0 === 0) {
    s += g(circ(cx, my, 13, WOOD_L, { sw: 2.4 }) + circ(cx, my, 10, 'none', { sw: 1, op: 0.35 }) + bicep(cx, my, 0.7, '#efe6d2', 1.6) + nail(cx, my - 10.5), { tf: `rotate(-8 ${cx} ${my})` });
  } else if (s0 === 1) {
    s += circ(cx, my, 13.5, RED, { sw: 2.4 }) + bicep(cx, my, 0.72, WHITE, 1.7);
    for (let i = 0; i < 8; i++) s += bulb(cx + Math.cos((i * Math.PI) / 4 + 0.39) * 13.5, my + Math.sin((i * Math.PI) / 4 + 0.39) * 13.5, true, 1.6);
  } else {
    s += circ(cx, my, 13.5, RED, { sw: 2.4 }) + bicep(cx, my, 0.72, WHITE, 1.7) + neon(`M${cx} ${my - 16}a16 16 0 1 1 -0.1 0`, '#ff5aa0', 1.8);
  }
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
  s += g(rect(68, 90, 32, 17, head, { rx: 5, sw: 2.8 }) + rect(74, 90, 5, 17, s0 === 1 ? WHITE : RED, { sw: 1.6 }) + rect(89, 90, 5, 17, s0 === 1 ? WHITE : RED, { sw: 1.6 }) + rect(70, 92, 28, 4, '#ffffff', { op: 0.35, rx: 2 }), { tf: 'rotate(-12 84 98)' });
  if (s0 === 0) s += tireStack(108, 166, 2, 9) + rect(4, 150, 12, 14, '#c8b48a', { sw: 2, rx: 2 });
  if (s0 === 2) s += cannon(12, 166, -1, PURPLE) + cannon(108, 166, 1, BLUE);
  s += flourish(level, [[18, 140, 18, BLUE, -1], [102, 140, 18, GOLD, 1]], [cx, 152, 7]);
  return svg(W, H, s, { cls: 'bld bld-striker', over: true });
}

function gallerySvg(level) {
  const s0 = stageOf(level);
  const W = 160;
  const H = 124;
  let s = shadow(80, 120, 76, 5);
  // Body.
  const body = [WOOD, '#2f6fd0', BLUE][s0];
  s += rect(10, 42, 140, 78, body, { sw: 2.8, rx: 3 });
  if (s0 === 0) for (let x = 24; x < 150; x += 14) s += line(`M${x} 44V118`, WOOD_D, 1.4);
  else s += rect(10, 42, 140, 78, 'none', { sw: 0 }) + rect(132, 44, 16, 74, O, { op: 0.12 });
  // Window with targets.
  const back = ['#4a3020', '#1f3d7a', '#26357e'][s0];
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
  const front = [WOOD_D, WHITE, RED][s0];
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
    s += circ(80, 14, 17, '#ffe680', { op: 0.3 }) + circ(80, 14, 13, '#26357e', { sw: 2.6 });
    s += neon('M80 4a10 10 0 1 1 -0.1 0', '#5ac8ff', 1.8) + neon('M80 9a5 5 0 1 1 -0.1 0', '#ff4a5a', 1.6) + circ(80, 14, 1.8, '#ffffff');
    s += star(52, 16, 6, GOLD, { sw: 1.5 }) + star(108, 16, 6, GOLD, { sw: 1.5 });
    s += flag(6, 30, 20, RED, -1) + flag(154, 30, 20, GOLD, 1);
    s += bunting(6, 12, 62, 8, 3, 4) + bunting(98, 8, 154, 12, 3, 4, [BLUE, GOLD, PINK, GREEN]);
    s += cannon(8, 122, -1, RED) + cannon(152, 122, 1, GREEN);
  }
  if (s0 === 0) s += rect(140, 106, 14, 14, '#9aa0a8', { sw: 2, rx: 1 }) + ell(147, 106, 7, 2, '#7a8088', { sw: 1.4 });
  if (level >= 6) {
    // A second prize: a pink bunny on the left of the counter.
    const bx = 24;
    s += path(`M${bx - 4} 72Q${bx - 7} 60 ${bx - 4} 58Q${bx - 1} 60 ${bx - 1.5} 72Z`, PINK, { sw: 1.4 }) + path(`M${bx + 4} 72Q${bx + 7} 60 ${bx + 4} 58Q${bx + 1} 60 ${bx + 1.5} 72Z`, PINK, { sw: 1.4 });
    s += circ(bx, 85, 6.5, PINK, { sw: 1.8 }) + circ(bx, 75, 6, PINK, { sw: 1.8 }) + ell(bx, 77, 2.4, 1.8, '#ffe0ee') + circ(bx - 2, 74, 0.9, O) + circ(bx + 2, 74, 0.9, O);
  }
  s += flourish(level, [], [80, 106, 8, BLUE]);
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
    s += circ(cx, 44, 20, '#7fffb0', { op: 0.3 }) + circ(cx, 44, 15, '#1f7f43', { sw: 2.6 });
    s += neon('M64.5 35.5h7v6h6v7h-6v6h-7v-6h-6v-7h6z', '#8dffc0', 1.8);
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
  if (level >= 6) s += line('M120 92Q126 74 120 60', O, 1.2) + path('M120 60c-6 -6 -12 -1 -8 5l8 7l8 -7c4 -6 -2 -11 -8 -5z', BLUE, { sw: 1.8 }) + path('M114 57q2 -2 4 0', 'none', { sw: 1, stroke: '#ffffff' });
  s += flourish(level, [], [32, 88, 7, GREEN]);
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
  const W = 150;
  const H = 120;
  const cx = 75;
  let s = shadow(cx, 116, 72, 5);
  const wall = ['#a9adb4', YELLOW, YELLOW][s0];
  const roof = ['#8f949c', RED, PURPLE][s0];
  // Roof: an arched, corrugated shell (quadratic from (6, 52) over (75, -4) to (144, 52)).
  const ry = (t) => 52 - 112 * t * (1 - t);
  const rx = (t) => 6 + 138 * t;
  s += path(`M6 52Q${cx} -4 144 52Z`, roof, { sw: 2.8 });
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    s += line(`M${f(rx(t))} ${f(ry(t) + 2.5)}V50`, dk(roof, 0.22), 1.4);
  }
  s += path(smooth([0.13, 0.24, 0.36, 0.48].map((t) => [rx(t) + 1, ry(t) + 6])), 'none', { sw: 3, stroke: '#ffffff', op: 0.32, cap: true });
  // Eave band (gold trim at the neon stage).
  s += rect(4, 46, 142, 6, [ '#7a7e86', WHITE, GOLD][s0], { sw: 2.2, rx: 2 });
  if (s0 === 2) s += bulbsOnLine(12, 49, 138, 49, 9, 1.7);
  // Walls.
  s += rect(10, 52, 130, 64, wall, { sw: 2.8 });
  s += rect(123, 54, 16, 61, O, { op: 0.1 }) + rect(12, 54, 4, 60, '#ffffff', { op: 0.25 });
  if (s0 === 0) {
    for (let x = 18; x < 140; x += 8) s += line(`M${x} 54V114`, '#8a8e96', 1.2);
    s += patch(13, 60, 13, 12, '#b86b3a', -6) + patch(124, 88, 12, 14, '#b86b3a', 8) + patch(127, 58, 9, 9, '#9bb86a', 4);
    s += path('M16 78L23 78L19.5 85L25 85L16 98L18.5 88L13 88Z', mix(YELLOW, '#a9adb4', 0.25), { sw: 1.5 });
  } else {
    // Hazard chevrons along the bottom.
    let ch = '';
    for (let x = 10; x < 140; x += 12) ch += `M${x} 116L${x + 6} 107L${x + 12} 107L${x + 6} 116Z`;
    s += rect(10, 107, 130, 9, YELLOW) + path(ch, O, { op: 0.85 }) + line('M10 107H140', O, 2.2);
  }
  // Door frame and roll-up door.
  s += rect(30, 62, 90, 54, s0 === 2 ? '#4a3858' : '#3a3038', { sw: 2.8, rx: 2 });
  if (s0 >= 1) s += ell(cx, 102, 38, 13, '#fff2a8', { op: 0.2 });
  const doorH = [24, 18, 16][s0];
  const door = [STEEL, WHITE, '#f2f4f8'][s0];
  s += rect(32, 64, 86, doorH, door, { sw: 2 });
  for (let y = 64 + 5; y < 64 + doorH; y += 5) s += line(`M32 ${y}H118`, dk(door, 0.2), 1.2);
  if (s0 === 0) s += path('M62 80Q68 85 74 80', 'none', { sw: 1.6 }) + path(`M32 ${64 + doorH}L118 ${64 + doorH - 3}`, 'none', { sw: 2 });
  // Bumper car peeking out.
  s += bumperCarFront(cx, 116, s0 === 0 ? mix(YELLOW, '#a9adb4', 0.35) : YELLOW, s0 === 2);
  if (s0 >= 1) for (let i = 0; i < 7; i++) s += bulb(34 + i * 13.7, 59, true, 2);
  if (s0 >= 1) for (let i = 0; i < 4; i++) s += bulb(25.5, 68 + i * 13, true, 2) + bulb(124.5, 68 + i * 13, true, 2);
  if (s0 === 2) s += neon('M21 116V55H129V116', '#ffe14a', 1.8);
  // Tyres and a barrel at the corners.
  s += tireStack(137, 116, s0 === 0 ? 3 : 2, 10);
  if (s0 === 0) s += rect(12, 94, 15, 22, '#b86b3a', { sw: 2, rx: 2 }) + line('M12 101H27M12 109H27', '#8a4a2a', 1.6);
  else s += rect(12, 96, 16, 20, s0 === 1 ? RED : PURPLE, { sw: 2, rx: 2 }) + rect(14, 94, 12, 4, STEEL, { sw: 1.4, rx: 1 }) + line('M16 102l5 0', '#ffffff', 1.4, { op: 0.6 });
  // Roof sign.
  if (s0 === 0) {
    s += stick('M60 30V24M90 30V24', WOOD_D, 2.2);
    s += g(rect(50, 10, 50, 17, WOOD_L, { sw: 2.4, rx: 2 }) + line('M56 18.5l20 0', '#7a8088', 4) + circ(57, 18.5, 4, 'none', { sw: 2.6, stroke: '#7a8088' }) + path('M80 14l6 4.5l-6 4.5', 'none', { sw: 2.2, stroke: '#7a8088' }) + nail(53, 13) + nail(97, 13), { tf: 'rotate(4 75 18)' });
  } else if (s0 === 1) {
    s += stick('M60 30V24M90 30V24', STEEL, 2.2);
    s += rect(48, 6, 54, 21, '#2a2a3a', { sw: 2.6, rx: 4 });
    s += g(rect(57, 14, 36, 5, GOLD, { sw: 1.4, rx: 2 }) + path('M55 9a6 6 0 1 0 6 8l-4 -2v-4l4 -2a6 6 0 0 0 -6 0z', GOLD, { sw: 1.4 }) + path('M95 9a6 6 0 1 1 -6 8l4 -2v-4l-4 -2a6 6 0 0 1 6 0z', GOLD, { sw: 1.4 }), { tf: 'rotate(-10 75 16)' });
    s += bulbsOnLine(50, 6, 100, 6, 6, 1.8);
  } else {
    s += circ(cx, 18, 22, '#fff3a0', { op: 0.3 });
    s += rect(58, 4, 34, 28, '#5a2a8a', { sw: 2.6, rx: 8 }) + rect(61, 7, 28, 4, '#ffffff', { op: 0.18, rx: 2 });
    s += neon('M79 -1L63 21H75L69 37L89 11H77L83 -1Z', '#ffe14a', 2);
    // Checkered flags on the eaves.
    for (const [x, d] of [[10, -1], [140, 1]]) {
      s += stick(`M${x} 50V20`, '#e8e2d6', 1.6, 2);
      let ck = '';
      for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) if ((j + k) % 2 === 0) ck += rect(d > 0 ? x + j * 5 : x - (j + 1) * 5, 21 + k * 5, 5, 5, O);
      s += rect(d > 0 ? x : x - 15, 21, 15, 10, WHITE, { sw: 1.6 }) + ck + rect(d > 0 ? x : x - 15, 21, 15, 10, 'none', { sw: 1.6 });
    }
    s += cannon(6, 118, -1, BLUE) + cannon(144, 118, 1, RED);
    s += star(36, 36, 4.2, GOLD, { sw: 1.2 }) + star(114, 36, 4.2, GOLD, { sw: 1.2 });
  }
  s += flourish(level, [[46, 32, 15, RED, -1], [104, 32, 15, BLUE, 1]], [127, 78, 7, BLUE]);
  return svg(W, H, s, { cls: 'bld bld-garage', over: true });
}

/**
 * The tarp over each locked building: contour, ropes, padlock (top of its body),
 * the stripe colour (the ride's class colour) and what pokes out of it.
 */
const TARP = {
  bigtop: { pts: [[14, 150], [18, 118], [28, 100], [62, 66], [92, 34], [108, 34], [138, 66], [172, 100], [182, 118], [186, 150]], ropes: [[30, 98, 170, 98], [22, 126, 178, 126]], lock: [100, 112], col: RED },
  striker: { pts: [[8, 166], [10, 150], [20, 136], [40, 127], [60, 125], [80, 127], [100, 136], [110, 150], [112, 166]], ropes: [[14, 152, 106, 152]], lock: [60, 138], col: RED, fan: 0.3 },
  gallery: { pts: [[6, 120], [6, 64], [6, 62], [1, 57], [3, 51], [14, 38], [40, 31], [120, 31], [146, 38], [157, 51], [159, 57], [154, 62], [154, 64], [154, 120]], ropes: [[8, 66, 152, 66], [8, 98, 152, 98]], lock: [80, 86], col: BLUE, fan: 0.9 },
  tent: { pts: [[8, 110], [10, 76], [4, 70], [38, 46], [68, 20], [98, 46], [132, 70], [126, 76], [128, 110]], ropes: [[24, 62, 112, 62], [12, 92, 124, 92]], lock: [68, 80], col: GREEN },
  garage: { pts: [[10, 116], [10, 64], [10, 62], [3, 58], [5, 52], [24, 38], [50, 29], [75, 27], [100, 29], [126, 38], [145, 52], [147, 58], [140, 62], [140, 64], [140, 116]], ropes: [[12, 68, 138, 68]], lock: [75, 72], col: YELLOW, fan: 0.9 },
};

/** A striped road sawhorse; (x, by) = bottom-left. */
function sawhorse(x, by, w = 30) {
  let s = stick(`M${x + 3} ${by}L${x + 8} ${by - 13}L${x + 13} ${by}M${x + w - 13} ${by}L${x + w - 8} ${by - 13}L${x + w - 3} ${by}`, WOOD, 2.2, 2);
  let st = '';
  for (let a = x + 2; a + 8 < x + w; a += 9) st += path(`M${a} ${by - 11}l4 -7h4l-4 7z`, RED);
  return s + rect(x, by - 18, w, 7, WHITE, { sw: 1.8, rx: 1.5 }) + st + rect(x, by - 18, w, 7, 'none', { sw: 1.8, rx: 1.5 });
}

function lockedSvg(id, W, H) {
  const T = TARP[id];
  const cid = uid('tarp');
  const light = T.col === YELLOW ? '#fff6dc' : '#f6f1e6';
  const band = mix(T.col, '#9a948a', 0.18);
  let s = shadow(W / 2, H - 4, W * 0.46, 5);
  const pts = T.pts;
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const top = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0]);
  const cx = (x0 + x1) / 2;
  // What pokes out above the tarp (drawn first, so the tarp covers its foot).
  if (id === 'bigtop') s += stick(`M100 38L100 12`, WOOD_D, 2.4) + path('M100 13L114 16L100 21Z', band, { sw: 1.6 }) + circ(100, 11, 2.6, GOLD, { sw: 1.3 });
  else if (id === 'tent') s += stick('M68 24L68 4', WOOD_D, 2.2) + path('M68 5L82 9L68 13Z', GREEN, { sw: 1.6 }) + rect(72, 7.6, 3, 2.6, WHITE) + circ(68, 3, 2.4, GOLD, { sw: 1.2 });
  else if (id === 'gallery') s += stick('M80 34V16', WOOD_D, 2.4) + target(80, 13, 9, mix(RED, '#b49a80', 0.3));
  else if (id === 'striker') {
    // The bare tower stands boarded up; only the base is under the tarp.
    s += rect(48, 34, 24, 100, '#b9a58c', { sw: 2.6 });
    for (let y = 48; y < 134; y += 14) s += line(`M49 ${y}H71`, '#8f7a62', 1.4);
    s += rect(43, 28, 34, 7, '#8f7a62', { sw: 2.2, rx: 2 }) + path('M46 28Q45 8 60 8Q75 8 74 28Z', '#b8b4a8', { sw: 2.6 }) + circ(60, 6, 3.2, '#b8b4a8', { sw: 1.8 }) + path('M52 25Q51 14 57 12', 'none', { sw: 2.4, stroke: '#ffffff', op: 0.4, cap: true });
    s += g(rect(36, 72, 48, 8, WOOD_L, { sw: 2 }) + nail(40, 76) + nail(80, 76), { tf: 'rotate(-30 60 76)' }) + g(rect(36, 72, 48, 8, WOOD_L, { sw: 2 }) + nail(40, 76) + nail(80, 76), { tf: 'rotate(30 60 76)' });
  }
  // Contour with a wavy hem.
  let d = smooth(pts);
  const n = Math.max(4, Math.round((x1 - x0) / 22));
  for (let i = n - 1; i >= 0; i--) {
    const xa = x0 + ((x1 - x0) * i) / n;
    const xb = x0 + ((x1 - x0) * (i + 1)) / n;
    d += `Q${f((xa + xb) / 2)} ${H - 1} ${f(xa)} ${H - 6}`;
  }
  d = d.replace(/^M([\d.]+) ([\d.]+)/, (m, a) => `M${a} ${H - 6}L${a} ${pts[0][1]}`) + 'Z';
  // Canvas: cream base, stripes fanning down from the top, shade, highlight, folds.
  let c = rect(0, 0, W, H, light);
  const k = Math.max(6, Math.round((x1 - x0) / 13));
  for (let i = 0; i < k; i += 2) {
    const a = x0 - 10 + ((x1 - x0 + 20) * i) / k;
    const b = x0 - 10 + ((x1 - x0 + 20) * (i + 1)) / k;
    const fan = T.fan ?? 0.18;
    const ta = top[0] + (a - top[0]) * fan;
    const tb = top[0] + (b - top[0]) * fan;
    c += path(`M${f(ta)} ${top[1] - 4}L${f(tb)} ${top[1] - 4}L${f(b)} ${H}L${f(a)} ${H}Z`, band);
  }
  c += path(`M${f(cx + (x1 - cx) * 0.3)} 0H${W}V${H}H${f(cx + (x1 - cx) * 0.3)}Z`, O, { op: 0.13 });
  c += line(`M${f(top[0] - 8)} ${f(top[1] + 10)}Q${f(x0 + (top[0] - x0) * 0.3)} ${f((top[1] + H) / 2)} ${f(x0 + 10)} ${f(H - 18)}`, '#ffffff', 4, { op: 0.45 });
  for (const t of [0.3, 0.55, 0.75]) {
    const fx = x0 + (x1 - x0) * t;
    c += line(`M${f(top[0] + (fx - top[0]) * 0.3)} ${f(top[1] + 14)}Q${f(fx + 4)} ${f((top[1] + H) / 2)} ${f(fx)} ${f(H - 8)}`, O, 1.6, { op: 0.3 });
  }
  s += `<defs><clipPath id="${cid}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${cid})">${c}</g>` + path(d, 'none', { sw: 2.8 });
  // The garage: a bumper car bulges the tarp at the front, its pole poking through.
  if (id === 'garage') {
    s += stick('M90 100L94 78', STEEL, 1.5, 2) + circ(94.5, 76, 2.6, RED, { sw: 1.2 });
    s += path('M46 116Q46 94 75 92Q104 94 104 116Z', light, { sw: 2.6 });
    s += path('M58 116Q58 98 70 96L80 96Q92 98 92 116Z', band) + path('M46 116Q46 94 75 92Q104 94 104 116Z', 'none', { sw: 2.6 });
    s += path('M52 110Q54 98 66 95', 'none', { sw: 2.4, stroke: '#ffffff', op: 0.5, cap: true });
  }
  // Ropes.
  for (const [ax, ay, bx, by] of T.ropes) {
    const rd = `M${ax} ${ay}Q${(ax + bx) / 2} ${ay + 6} ${bx} ${by}`;
    s += line(rd, O, 4.2) + line(rd, '#e3c48c', 2.4) + line(rd, '#b8955a', 2.4, { dash: '2 4' });
  }
  // Pegs and sandbags.
  s += rect(x0 - 4, H - 10, 4, 9, WOOD_D, { sw: 1.4 }) + rect(x1, H - 10, 4, 9, WOOD_D, { sw: 1.4 });
  // Chain and padlock.
  const [lx, ly] = T.lock;
  const half = Math.min(36, (x1 - x0) * 0.38);
  let ch = '';
  let q = 0;
  for (let x = lx - half; x <= lx + half; x += 6, q++) {
    const y = ly - 6 - Math.abs(x - lx) * 0.08;
    ch += q % 2 ? rect(x - 1.6, y - 3.4, 3.2, 6.8, '#c9ced6', { sw: 1.4, rx: 1.6 }) : ell(x, y, 4.2, 2.8, 'none', { sw: 3.8 }) + ell(x, y, 4.2, 2.8, 'none', { sw: 1.8, stroke: '#c9ced6' });
  }
  s += ch;
  s += path(`M${lx - 7} ${ly}V${ly - 7}a7 7 0 0 1 14 0V${ly}`, 'none', { sw: 6.4 }) + path(`M${lx - 7} ${ly}V${ly - 7}a7 7 0 0 1 14 0V${ly}`, 'none', { sw: 3.2, stroke: '#c9ced6' });
  s += rect(lx - 12, ly - 1, 24, 20, GOLD, { sw: 2.6, rx: 4 }) + rect(lx - 12, ly + 12, 24, 7, '#d99a1a', { rx: 3 }) + rect(lx - 12, ly - 1, 24, 20, 'none', { sw: 2.6, rx: 4 });
  s += circ(lx, ly + 6, 2.8, O) + path(`M${lx - 1.4} ${ly + 7}h2.8l1 6h-4.8z`, O) + rect(lx - 9, ly + 1, 4, 8, '#fff1b0', { op: 0.7, rx: 2 });
  // Roadworks in front: a striped sawhorse and a cone.
  s += sawhorse(x0 + 2, H - 1, Math.min(34, (x1 - x0) * 0.28)) + cone(x1 - 10, H - 1);
  return svg(W, H, s, { cls: `bld bld-${id} bld-locked`, over: true });
}

const BUILDERS = { bigtop: bigTopSvg, striker: strikerSvg, gallery: gallerySvg, tent: tentSvg, garage: garageSvg };

/**
 * A park building. id: bigtop | striker | gallery | tent | garage. level 1..7:
 * 1-2 patched junk, 3-4 fresh paint and bulbs, 5-7 neon, flags and confetti cannons
 * (Lv 6 adds a flourish such as an extra pair of flags, Lv 7 also a prize rosette).
 * locked (or level < 1): under a tarp with a padlock. viewBox 0 0 w h = PARK.slots[id].
 */
export function buildingSvg(id, level = 1, { locked = false } = {}) {
  const sl = PARK.slots[id];
  if (!sl) return '';
  if (locked || level < 1) return lockedSvg(id, sl.w, sl.h);
  return BUILDERS[id](level);
}

// --- Souvenirs -------------------------------------------------------------------------------

/** The giant donut sign, mounted on top of the gate arch (svg bottom = the arch crown). */
function donutSvg() {
  const W = 64;
  const H = 70;
  const cx = 32;
  const cy = 30;
  let s = '';
  // Struts and the base plate that sits on the arch.
  s += stick(`M${cx - 9} 50L${cx - 7} 66M${cx + 9} 50L${cx + 7} 66`, STEEL, 3, 2.4) + line(`M${cx - 8} 60H${cx + 8}`, O, 1.6);
  s += rect(cx - 14, 64, 28, 6, WOOD_D, { sw: 2.2, rx: 2 });
  // Donut ring (evenodd hole).
  const R = 26;
  const r = 9;
  const ring = (rr, ri) => `M${cx - rr} ${cy}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0ZM${cx - ri} ${cy}a${ri} ${ri} 0 1 1 ${ri * 2} 0a${ri} ${ri} 0 1 1 ${-ri * 2} 0Z`;
  s += path(ring(R, r), '#e3a55c', { sw: 3, rule: 'evenodd' });
  s += path(`M${cx - 20} ${cy + 12}Q${cx} ${cy + 26} ${cx + 20} ${cy + 12}`, 'none', { sw: 3, stroke: '#c07d38', cap: true, op: 0.8 });
  // Icing: wobbly outer edge.
  let ic = '';
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const rr = R - 4 + Math.sin(a * 7) * 2 + (Math.sin(a) > 0.2 ? Math.sin(a * 7) * 1.4 + 1 : 0);
    ic += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy - 2 + Math.sin(a) * rr);
  }
  ic += `ZM${cx - r - 3} ${cy - 2}a${r + 3} ${r + 3} 0 1 1 ${(r + 3) * 2} 0a${r + 3} ${r + 3} 0 1 1 ${-(r + 3) * 2} 0Z`;
  s += path(ic, PINK, { sw: 2.2, rule: 'evenodd' });
  s += path(`M${cx - 16} ${cy - 13}Q${cx - 5} ${cy - 22} ${cx + 8} ${cy - 19}`, 'none', { sw: 3.2, stroke: '#ffd0e8', cap: true });
  const sp = [[-15, -6, 30], [-7, -16, -20], [6, -17, 60], [16, -9, 10], [17, 4, -40], [-17, 6, 70], [-9, 13, 20], [9, 13, -60], [0, -13, 0], [13, -16, 45]];
  sp.forEach(([x, y, a], i) => (s += rect(cx + x - 1.4, cy - 2 + y - 3, 2.8, 6, [WHITE, YELLOW, BLUE, GREEN, PURPLE][i % 5], { rx: 1.2, tf: `rotate(${a} ${cx + x} ${cy - 2 + y})` })));
  s += path(ring(R, r), 'none', { sw: 3, rule: 'evenodd' });
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
  s += jet(`M${cx - 4} 12Q${cx - 26} -2 ${cx - 36} 30`) + jet(`M${cx + 4} 12Q${cx + 26} -2 ${cx + 36} 30`) + jet(`M${cx} 10Q${cx} 0 ${cx} 6`);
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
  s += sparkle(cx - 16, 5, 3.6) + sparkle(cx + 22, 9, 3);
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
  // Lifebuoy (orange and white) leaning on the shank.
  const lx = 16;
  const ly = 44;
  s += circ(lx, ly, 13, WHITE, { sw: 2.6 });
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + 0.4;
    const a1 = a0 + 0.8;
    s += path(`M${f(lx + Math.cos(a0) * 13)} ${f(ly + Math.sin(a0) * 13)}A13 13 0 0 1 ${f(lx + Math.cos(a1) * 13)} ${f(ly + Math.sin(a1) * 13)}L${f(lx + Math.cos(a1) * 6.5)} ${f(ly + Math.sin(a1) * 6.5)}A6.5 6.5 0 0 0 ${f(lx + Math.cos(a0) * 6.5)} ${f(ly + Math.sin(a0) * 6.5)}Z`, '#ff7a2a');
  }
  s += circ(lx, ly, 13, 'none', { sw: 2.6 }) + circ(lx, ly, 6.5, '#b98a5a', { sw: 2.2 });
  s += path(`M${lx - 9} ${ly - 7}Q${lx - 4} ${ly - 13} ${lx + 4} ${ly - 12}`, 'none', { sw: 2.4, stroke: '#ffffff', op: 0.7, cap: true });
  // Rope.
  s += line(`M${cx + 5} 12Q${cx + 22} 26 ${cx + 14} 50Q${cx + 10} 58 ${cx + 20} 60`, '#d8b878', 2.4, { dash: '3 2' });
  return svg(W, H, s, { cls: 'souv souv-anchor', over: true });
}

/** The scoreboard's blank panel (viewBox units) for the UI to overlay the Skull count. */
const SCORE_PANEL = PARK.souvenirs.scoreboard.panel;

function scoreboardSvg() {
  const W = 64;
  const H = 168;
  let s = shadow(32, 165, 24, 3);
  for (const x of [18, 46]) {
    s += rect(x - 3.5, 72, 7, 92, STEEL, { sw: 2.2 });
    for (let y = 80; y < 160; y += 14) s += line(`M${x - 3} ${y}l6 7`, '#7a8088', 1.2);
  }
  s += line('M18 104L46 120M46 104L18 120', '#7a8088', 2) + rect(10, 160, 44, 6, '#c8c2b8', { sw: 2, rx: 2 });
  // Floodlights on top.
  s += stick('M14 16V8M50 16V8', STEEL, 1.6, 2);
  s += rect(6, 1, 16, 7, '#fff6c8', { sw: 2, rx: 2 }) + rect(42, 1, 16, 7, '#fff6c8', { sw: 2, rx: 2 });
  // Board.
  s += rect(2, 16, 60, 58, BLUE, { sw: 3, rx: 7 });
  s += rect(5, 19, 54, 4, lt(BLUE, 0.35), { rx: 2 }) + rect(52, 22, 7, 49, O, { op: 0.12, rx: 3 });
  for (let i = 0; i < 7; i++) s += bulb(8 + i * 8, 25.5, true, 1.6);
  const P = SCORE_PANEL;
  s += rect(P.x, P.y, P.w, P.h, '#1d1a22', { sw: 2.2, rx: 3 });
  s += rect(P.x + 3, P.y + 3, P.w - 6, 3, '#ffffff', { op: 0.1 });
  // Skull icon and lights under the panel.
  const sx = 32;
  const sy = 66;
  s += path(`M${sx - 5.5} ${sy}Q${sx - 5.5} ${sy - 6.5} ${sx} ${sy - 6.5}Q${sx + 5.5} ${sy - 6.5} ${sx + 5.5} ${sy}Q${sx + 5.5} ${sy + 2.4} ${sx + 3.2} ${sy + 3.2}V${sy + 5.6}H${sx - 3.2}V${sy + 3.2}Q${sx - 5.5} ${sy + 2.4} ${sx - 5.5} ${sy}Z`, WHITE, { sw: 1.6 });
  s += circ(sx - 2.4, sy - 1, 1.6, O) + circ(sx + 2.4, sy - 1, 1.6, O);
  s += circ(13, sy, 3.4, RED, { sw: 1.5 }) + circ(51, sy, 3.4, GREEN, { sw: 1.5 }) + circ(12.2, sy - 1, 1, '#ffffff', { op: 0.7 }) + circ(50.2, sy - 1, 1, '#ffffff', { op: 0.7 });
  return svg(W, H, s, { cls: 'souv souv-scoreboard', over: true });
}

/** A jet's nose section lying on wooden blocks, nose to the left, slightly nose-up. */
function jetSvg() {
  const W = 88;
  const H = 60;
  let s = ell(46, 56, 40, 3.6, '#b98a5a', { sw: 2 }) + ell(12, 56, 5, 1.8, GRASS_D) + ell(80, 56, 6, 1.8, GRASS_D);
  // Blocks.
  s += rect(24, 44, 16, 12, WOOD, { sw: 2.2, rx: 1.5 }) + line('M24 50H40', WOOD_D, 1.4) + rect(56, 44, 16, 12, WOOD, { sw: 2.2, rx: 1.5 }) + line('M56 50H72', WOOD_D, 1.4);
  const body = 'M78 14H38C20 14 9 23 9 32C9 41 18 48 34 48H78Z';
  let b = path(body, WHITE);
  b += path('M10.5 38C13 44 22 48 34 48H78V42H32C22 42 15 40.5 10.5 38Z', '#d9dfe8');
  b += path('M10.2 28H78V34H9.6Z', BLUE) + path('M9.7 35.6H78V37.6H10.1Z', RED);
  b += path('M17 24.5Q22 18 34 16.5L36.5 23Q26 23.4 19.4 27.4Z', '#2f3a55', { sw: 1.6 }) + line('M24.5 21L26 25.6M30.5 18.6L31.6 23.4', '#8fb8e0', 1.4) + line('M20 24.6Q25 20.4 31 19.2', '#ffffff', 1, { op: 0.6 });
  for (const x of [46, 54, 62, 70]) b += circ(x, 23.5, 2.3, '#9fd8ff', { sw: 1.3 });
  b += rect(39, 18, 5, 10, 'none', { sw: 1.1, rx: 1.5, op: 0.45 });
  b += path(body, 'none', { sw: 2.8 });
  b += line('M38 17.4H72', '#ffffff', 2.6, { op: 0.7 });
  // The cut-off end: a rim and the dark inside.
  b += ell(78, 31, 5.5, 17, '#4a4450', { sw: 2.6 }) + ell(78.6, 31, 3.2, 13.5, '#2e2a33') + line('M74.6 22.5h7M74 31h8.4M74.6 39.5h7', '#6a6470', 1.1);
  b += flag(64, 15, 13, GOLD, 1);
  s += g(b, { tf: 'rotate(5 60 48)' });
  return svg(W, H, s, { cls: 'souv souv-jet', over: true });
}

const SOUVENIRS = { donut: donutSvg, fountain: fountainSvg, anchor: anchorSvg, scoreboard: scoreboardSvg, jet: jetSvg };

/**
 * A zone souvenir: donut | fountain | anchor | scoreboard | jet. viewBox 0 0 w h
 * = PARK.souvenirs[id]. The scoreboard's blank panel is PARK.souvenirs.scoreboard.panel
 * {x 8, y 30, w 48, h 28} in its 64×168 viewBox (also on the returned svg as data-panel).
 */
export function souvenirSvg(id) {
  const fn = SOUVENIRS[id];
  if (!fn) return '';
  const out = fn();
  if (id === 'scoreboard') return out.replace('<svg ', `<svg data-panel="${SCORE_PANEL.x} ${SCORE_PANEL.y} ${SCORE_PANEL.w} ${SCORE_PANEL.h}" `);
  return out;
}

// --- The bus ---------------------------------------------------------------------------------

/** The squad's bus: a repurposed park tram. viewBox 0 0 110 64, bottom-centre (55, 64), faces right. */
export function busSvg() {
  const W = 110;
  const H = 64;
  let s = shadow(55, 61, 50, 3.2);
  // Rear flag and spare tire.
  s += flag(6, 18, 16, RED, -1);
  s += circ(5, 36, 7, RUBBER, { sw: 2.2 }) + circ(5, 36, 3, STEEL, { sw: 1.3 });
  // Canopy poles and seats.
  for (const x of [11, 36, 60, 83]) s += stick(`M${x} 18V28`, WHITE, 2, 2.2);
  for (const x of [15, 40, 64]) s += rect(x, 20, 16, 9, BLUE, { sw: 2, rx: 3 }) + rect(x + 2, 22, 12, 2.4, lt(BLUE, 0.4), { rx: 1 });
  // Passenger body.
  s += rect(5, 27, 84, 18, YELLOW, { sw: 2.8 });
  s += rect(5, 33, 84, 5, RED) + line('M5 33H89M5 38H89', O, 1.2, { op: 0.5 }) + path('M8 30H86', 'none', { sw: 2.2, stroke: '#ffe28a', cap: true });
  s += star(47, 41.5, 3.2, WHITE, { sw: 1.1 });
  s += patch(19, 38.5, 11, 5.5, STEEL, -4) + nail(21, 40.5) + nail(28, 40.5);
  // Cab with a round nose.
  const cab = 'M83 45V22Q83 14 90 14H94Q107 16 107 34V45Z';
  s += path(cab, YELLOW, { sw: 2.8 });
  s += path('M89 19H94Q102 20 104 30H89Z', '#bfeaff', { sw: 2.2 }) + line('M91.5 27l4.5 -6', '#ffffff', 1.6, { op: 0.8 });
  s += rect(83, 33, 24, 5, RED) + line('M83 33H107M83 38H107', O, 1.2, { op: 0.5 });
  s += path(cab, 'none', { sw: 2.8 });
  s += circ(102.6, 41.4, 3.4, '#fff3a0', { op: 0.6 }) + circ(102.6, 41.4, 2.4, '#fffbe0', { sw: 1.5 });
  // Canopy roof: stripes and scallops.
  let cd = '';
  for (let i = 0; i < 9; i++) cd += path(`M${4 + i * 11} 8H${15 + i * 11}V13Q${9.5 + i * 11} 18 ${4 + i * 11} 13Z`, i % 2 ? WHITE : RED);
  s += rect(2, 6, 100, 4, YELLOW, { sw: 2.2, rx: 2 }) + cd + path('M4 8H103V13' + Array.from({ length: 9 }, (_, i) => `Q${f(103 - i * 11 - 5.5)} 18 ${103 - (i + 1) * 11}  13`).join('') + 'Z', 'none', { sw: 2.2 });
  for (let i = 0; i < 9; i++) s += bulb(9.5 + i * 11, 17, true, 1.5);
  // Bumper-car rubber all round.
  s += rect(1, 43, 108, 8, RUBBER, { rx: 4, sw: 2.6 }) + line('M7 46.5H103', '#5a525e', 1.6);
  for (const x of [25, 86]) s += circ(x, 52.5, 9.5, RUBBER, { sw: 2.6 }) + circ(x, 52.5, 4.5, YELLOW, { sw: 2 }) + circ(x, 52.5, 1.5, O);
  return svg(W, H, s, { cls: 'bus', over: true });
}

// --- Zombies ---------------------------------------------------------------------------------

const ZPAL = {
  walker: { skin: ZSKIN, shade: ZSHADE, light: ZLIGHT, shirt: '#8a76c8', pants: '#4a5a8a', hair: '#5a4a3a' },
  runner: { skin: ZSKIN, shade: ZSHADE, light: ZLIGHT, shirt: ORANGE, pants: '#3d5a9a', hair: '#7a4a2a' },
  brute: { skin: '#8fcb5c', shade: '#64983c', light: '#b9e584', shirt: '#d9483b', pants: '#4a5a8a', hair: '#3a2a20' },
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

/** Knocked-out eyes: two little X's. */
function xEye(x, y, k) {
  return line(`M${f(x - k)} ${f(y - k)}L${f(x + k)} ${f(y + k)}M${f(x + k)} ${f(y - k)}L${f(x - k)} ${f(y + k)}`, O, Math.max(1.2, k * 0.6));
}

/** Dizzy stars over a knocked-out head. */
function dizzy(cx, top, r) {
  return g(star(cx - r * 0.7, top - 2, r * 0.32, '#ffe066', { sw: 1 }) + star(cx + r * 0.2, top - 5, r * 0.26, '#ffe066', { sw: 1 }) + star(cx + r * 0.9, top - 1, r * 0.3, '#ffe066', { sw: 1 }), { cls: 'z-dizzy' });
}

function zFace(cx, cy, r, o = {}) {
  // Faces right: big front eye, small back eye, crooked open mouth with one tooth.
  const ex = cx + r * 0.38;
  const ey = cy - r * 0.08;
  if (o.ko) {
    let k = xEye(ex, ey, r * 0.22) + xEye(cx - r * 0.12, cy - r * 0.02, r * 0.15);
    k += ell(cx + r * 0.32, cy + r * 0.5, r * 0.22, r * 0.17, '#6a2a3a', { sw: 1.2 }) + path(`M${f(cx + r * 0.38)} ${f(cy + r * 0.58)}q${f(r * 0.12)} ${f(r * 0.34)} ${f(-r * 0.1)} ${f(r * 0.36)}q${f(-r * 0.12)} ${f(-r * 0.1)} ${f(-r * 0.04)} ${f(-r * 0.3)}z`, '#ff7a9a', { sw: 1 });
    return k;
  }
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

function walkerZ(p, ko = false) {
  let s = shadow(20, 54.5, 11, 2);
  s += stick('M17 40L14 51', p.pants, 5.4, 2.2) + shoe(14, 52.5);
  s += arm('M17 28Q25 26 32.5 28', p.skin, 4.2, 17, 28, hand(34, 28, 3, p.skin));
  s += path('M11 26Q11 22 17 22H24Q29 22 29 27V41L26.5 43.5L24 41L21 44L18 41L15 43.5L11 41Z', p.shirt, { sw: 2 });
  s += path('M11 30Q11 26 14 26V41L11 41Z', O, { op: 0.12 }) + rect(22, 30, 5, 4, dk(p.shirt, 0.15), { rx: 1, sw: 1 });
  s += stick('M23 40L26 51', p.pants, 5.4, 2.2) + shoe(26.5, 52.5);
  s += zHead(22, 14, 11, p);
  s += path('M14 6Q17 0 22 3Q25 -1 28 4', 'none', { sw: 2.2, stroke: p.hair, cap: true });
  s += zFace(22, 14, 11, { ko });
  s += stitch(13.5, 9, 17, 4);
  if (ko) s += dizzy(22, 2, 11);
  s += arm('M21 29Q28 30 34.5 32', p.skin, 4.4, 21, 29, hand(35.8, 32.5, 3.2, p.skin));
  return s;
}

function runnerZ(p, ko = false) {
  let s = shadow(20, 62.5, 12, 2);
  // Back leg kicked back, front leg striding.
  s += stick('M17 42L10 50L6 58', p.pants, 4.6, 2.2) + shoe(5, 59, 4.6);
  s += arm('M19 26Q12 32 8 38', p.skin, 3.6, 19, 26, hand(7, 39.5, 2.6, p.skin));
  s += g(path('M14 24Q16 20 22 20H26Q30 21 29 26L26 43L22 45L16 43Z', p.shirt, { sw: 2 }) + path('M16 28L27 30', 'none', { sw: 2, stroke: WHITE }), { tf: 'rotate(14 22 32)' });
  s += stick('M22 43L30 50L28 60', p.pants, 4.6, 2.2) + shoe(30, 60.5, 4.6);
  s += zHead(28, 13, 10, p);
  // Sweatband with flying ends.
  s += path('M18.5 9Q28 4 37.5 9L37 12.5Q28 8 19 12.5Z', RED, { sw: 1.4 }) + path('M19 10L11 6L14 11L10 14Z', RED, { sw: 1.3 });
  s += zFace(28, 13, 10, { ko });
  // Tongue flapping.
  if (!ko) s += path('M33.5 18.5Q35 23 32 23.5Q30 22 31 18.8Z', '#ff7a9a', { sw: 1.1 });
  else s += dizzy(28, 2, 10);
  s += arm('M24 26Q32 22 38 16', p.skin, 3.8, 24, 26, hand(38.5, 15, 2.8, p.skin));
  s += line('M2 20h6M0 27h7M3 34h5', '#ffffff', 1.8, { op: 0.8 });
  return s;
}

function bruteZ(p, ko = false) {
  let s = shadow(32, 70.5, 22, 2.6);
  s += stick('M24 56L22 67', p.pants, 9, 2.4) + shoe(21, 68, 7);
  s += arm('M22 30Q34 34 46 44', p.skin, 9, 22, 30, hand(48, 46, 6.5, p.skin));
  // Barrel body with a torn tank top.
  s += path('M10 34Q8 18 24 16H40Q56 18 54 36L52 58H12Z', p.skin, { sw: 2.4 });
  s += path('M14 34Q14 26 20 24L24 34H40L44 24Q50 26 50 34L49 56L44 59L40 55L34 60L28 55L22 59L15 56Z', p.shirt, { sw: 2 });
  // Lumberjack plaid.
  s += line('M20 30V56M30 36V57M40 36V55M46 30V56', dk(p.shirt, 0.3), 1.8, { op: 0.55 }) + line('M16 42H48M15.5 50H48.5', dk(p.shirt, 0.3), 1.8, { op: 0.55 });
  s += line('M25 36V57M35 36V57M16 46H48', '#ffd2a8', 0.9, { op: 0.45 });
  s += path('M14 36Q14 28 18 25L16 56H15Z', O, { op: 0.1 }) + stitch(20, 40, 26, 46);
  s += stick('M40 56L42 67', p.pants, 9, 2.4) + shoe(43, 68, 7);
  // Little head sunk into shoulders.
  s += zHead(36, 14, 10, p, { noEar: true });
  s += path('M28 6Q32 2 36 5Q40 1 44 6', 'none', { sw: 2.4, stroke: p.hair, cap: true });
  if (ko) s += zFace(36, 14, 10, { ko }) + dizzy(36, 3, 10);
  else {
    s += zFace(36, 14, 10, { brow: true, mouth: false });
    s += path('M35 19Q40 22 45 18', 'none', { sw: 1.8, cap: true }) + path('M37 19.6l1 -3l1 3z', WHITE, { sw: 0.8 }) + path('M42 19.4l1 -3l1 2.8z', WHITE, { sw: 0.8 });
  }
  // Bandage.
  s += rect(26, 9, 7, 4, '#f4ead4', { sw: 1.2, rx: 1, tf: 'rotate(-20 29 11)' });
  s += arm('M44 28Q53 34 55 46', p.skin, 9.4, 44, 28, hand(55.5, 50, 7, p.skin));
  return s;
}

function spitterZ(p, ko = false) {
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
  if (ko) s += xEye(27.5, 12, 2.6) + xEye(20.2, 12.4, 1.9) + dizzy(23, 3, 11);
  else s += circ(27, 11.5, 3.4, WHITE, { sw: 1.3 }) + circ(28, 12, 1.3, O) + circ(20, 12, 2.4, WHITE, { sw: 1.2 }) + circ(20.4, 12.6, 0.9, O);
  // Pursed lips and drool.
  s += ell(27, 21.5, 2.6, 1.8, '#6a2a3a', { sw: 1.2 });
  s += path('M27 23Q28.6 28 27.4 31Q26.2 32.6 25.6 30.6Q26.4 27 25.8 23.4Z', '#c6f04a', { sw: 1.2 }) + circ(26.4, 33.4, 1.3, '#c6f04a', { sw: 0.9 });
  s += circ(35, 13, 2.2, '#c6f04a', { sw: 1 }) + circ(36.5, 11.6, 0.7, '#ffffff');
  s += arm('M26 30Q32 32 34 38', p.skin, 3.8, 26, 30, hand(34.5, 39.5, 2.8, p.skin));
  return s;
}

function hordeZ(p, v, ko = false) {
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
  s += zFace(15, 11, 9, { ko });
  if (ko) s += dizzy(15, 1, 9);
  s += arm('M14 23Q20 24 24 26', p.skin, 3.2, 14, 23, hand(25, 26.5, 2.3, p.skin));
  return s;
}

const ZVB = { walker: [40, 56], runner: [40, 64], brute: [64, 72], spitter: [44, 56], horde: [28, 38], golden: [40, 56] };

/**
 * A zombie, feet at bottom-centre, facing right (flip: facing left).
 * kinds: walker 40×56, runner 40×64, brute 64×72, spitter 44×56, horde 28×38, golden 40×56.
 * Arms are <g class="z-arm"> with the shoulder as transform-origin. Golden adds
 * <g class="z-sparkle">. variant (0..3, horde only) swaps shirt and hat.
 * ko: knocked out (X eyes, tongue out, <g class="z-dizzy"> stars over the head) for the bonk fall.
 */
export function zombieSvg(kind = 'walker', { flip = false, variant = 0, ko = false } = {}) {
  const k = ZVB[kind] ? kind : 'walker';
  const [W, H] = ZVB[k];
  const p = ZPAL[k];
  let s;
  if (k === 'runner') s = runnerZ(p, ko);
  else if (k === 'brute') s = bruteZ(p, ko);
  else if (k === 'spitter') s = spitterZ(p, ko);
  else if (k === 'horde') s = hordeZ(p, variant, ko);
  else s = walkerZ(p, ko);
  if (k === 'golden') {
    s = ell(20, 30, 19.5, 25.5, '#ffc23a', { op: 0.24 }) + ell(20, 28, 14, 19, '#ffe27a', { op: 0.4 }) + s;
    s += path('M17 6Q20 4 24 5', 'none', { sw: 2, stroke: '#ffffff', op: 0.9, cap: true });
    s += g(sparkle(5, 10, 4) + sparkle(35, 5, 3.4) + sparkle(5, 38, 3) + sparkle(36, 46, 2.6), { cls: 'z-sparkle' });
  }
  if (flip) s = g(s, { tf: `translate(${W} 0) scale(-1 1)` });
  return svg(W, H, s, { cls: `zombie z-${k}`, over: true });
}

// --- Threat badges ---------------------------------------------------------------------------

/** Each threat badge is ringed in the colour of the class that counters it (CLASSES[THREATS[t].by].color). */
const THREAT_RING = { runner: RED, brute: BLUE, spitter: GREEN, horde: YELLOW };

/**
 * Round 24×24 badge of a threat's zombie head: runner | brute | spitter | horde.
 * The bright ring (countering class colour) keeps it readable on dark UI too.
 */
export function threatIconSvg(threat) {
  const ring = THREAT_RING[threat] || '#a3acb6';
  let s = circ(12, 12, 11.2, ring, { sw: 1.3 }) + circ(12, 12, 8.3, mix(ring, '#ffffff', 0.72), { sw: 1 });
  s += path('M5.2 7.4A8.6 8.6 0 0 1 14.6 3.4', 'none', { sw: 1.5, stroke: '#ffffff', op: 0.55, cap: true });
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
  }
  return svg(24, 24, s, { cls: `threat-icon t-${threat}` });
}

// --- Raid backdrops --------------------------------------------------------------------------
//
// Each strip is 960×220 with the ground line at y = 180, drawn for xMidYMax slice:
// a phone shows only about x 260..700 (667 wide) to 215..745 (844 wide), a desktop
// window less still (about 290..670). So each zone's landmark stands in x ≈ 300..660,
// tall enough to read above the characters (feet ≈ y 196, heads ≈ y 150), and the
// outer thirds only add more of the same place.

function skyBand(top = '#72cafb', bottom = '#d4f4ff') {
  const id = uid('bsky');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` + rect(-40, -40, 1040, 260, `url(#${id})`);
}

const cloudsAt = (list) => list.map(([x, y, k]) => cloud(x, y, k)).join('');

function tree(x, by, s = 1, c = '#4fae45') {
  return stick(`M${x} ${by}V${by - 22 * s}`, WOOD_D, 5 * s, 2.4) + blob([[x, by - 34 * s, 16 * s], [x - 13 * s, by - 24 * s, 11 * s], [x + 13 * s, by - 25 * s, 12 * s]], c, { sw: 2.6, shade: dk(c, 0.18), light: lt(c, 0.25) });
}

function bush(x, by, s = 1) {
  return blob([[x - 9 * s, by - 6 * s, 8 * s], [x, by - 10 * s, 10 * s], [x + 10 * s, by - 6 * s, 8 * s]], '#5aab3e', { sw: 2.4, shade: '#4a9634', light: '#79c654' });
}

/** A wall block: lit top edge, shaded right side, optional darker plinth (height). */
function block(x, y, w, h, c, plinth = 0, sw = 2.6) {
  let s = rect(x, y, w, h, c);
  s += rect(x + 1.3, y + 1.3, w - 2.6, 3.4, lt(c, 0.45));
  s += rect(x + w - Math.min(14, w * 0.14) - 1.3, y + 1.3, Math.min(14, w * 0.14), h - 2.6, O, { op: 0.09 });
  if (plinth) s += rect(x + 1.3, y + h - plinth, w - 2.6, plinth - 1.3, dk(c, 0.16));
  return s + rect(x, y, w, h, 'none', { sw });
}

/** The ground strip below y = 178: a lit lip, the fill, a darker foot, and a crisp edge line. */
function groundBase(lip, fill, foot, edge) {
  return rect(-40, 178, 1040, 50, fill) + rect(-40, 178, 1040, 5, lip) + rect(-40, 212, 1040, 12, foot) + line('M-40 178H1000', edge, 2.4);
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

/** The Picnic Grove bandstand: striped roof, white posts, a bulb-lit valance. */
function gazebo(cx, by) {
  let s = shadow(cx, by, 92, 5);
  const top = by - 142;
  const eave = by - 86;
  // Floor shadow seen between the posts, then the platform and steps.
  s += rect(cx - 74, by - 86, 148, 72, '#5f9e4c', { op: 0.35 });
  s += rect(cx - 84, by - 16, 168, 13, WOOD, { sw: 2.6, rx: 3 }) + rect(cx - 82, by - 14.4, 164, 3.6, WOOD_L, { rx: 1.5 }) + line(`M${cx - 80} ${by - 7}H${cx + 80}`, WOOD_D, 1.4);
  s += rect(cx - 22, by - 5, 44, 6, WOOD_L, { sw: 2, rx: 1.5 });
  const xs = [cx - 74, cx - 44, cx - 15, cx + 15, cx + 44, cx + 74];
  for (let i = 0; i < xs.length - 1; i++) {
    if (i === 2) continue;
    const a = xs[i] + 3.5;
    const b = xs[i + 1] - 3.5;
    for (let x = a + 4; x < b - 1; x += 6) s += rect(x - 1.1, by - 36, 2.2, 21, WHITE, { sw: 1 });
    s += rect(a, by - 39, b - a, 5, WHITE, { sw: 1.8 });
  }
  for (const x of xs) s += rect(x - 3.5, by - 88, 7, 73, WHITE, { sw: 2.2 }) + rect(x + 0.8, by - 86.5, 2, 70, O, { op: 0.1 });
  // Roof: stripes from the apex to the eave.
  const M = 10;
  for (let i = 0; i < M; i++) {
    const xa = cx - 98 + (196 * i) / M;
    const xb = cx - 98 + (196 * (i + 1)) / M;
    const c = i % 2 ? WHITE : RED;
    const fill = i >= 7 ? dk(c, 0.12) : i < 2 ? lt(c, 0.1) : c;
    s += path(`M${cx} ${top}Q${f(cx + (xa - cx) * 0.36)} ${eave - 20} ${f(xa)} ${eave}L${f(xb)} ${eave}Q${f(cx + (xb - cx) * 0.36)} ${eave - 20} ${cx} ${top}Z`, fill);
  }
  s += path(`M${cx - 98} ${eave}Q${f(cx - 35.3)} ${eave - 20} ${cx} ${top}Q${f(cx + 35.3)} ${eave - 20} ${cx + 98} ${eave}Z`, 'none', { sw: 3 });
  s += path(`M${cx - 6} ${top + 12}Q${cx - 22} ${eave - 20} ${cx - 56} ${eave - 6}`, 'none', { sw: 3, stroke: '#ffffff', op: 0.4, cap: true });
  // Valance scallops and bulbs.
  let vd = `M${cx - 100} ${eave - 3}L${cx + 100} ${eave - 3}L${cx + 100} ${eave}`;
  for (let k = 11; k >= 0; k--) {
    const xa = cx - 100 + (200 * k) / 12;
    const xb = cx - 100 + (200 * (k + 1)) / 12;
    vd += `Q${f((xa + xb) / 2)} ${eave + 13} ${f(xa)} ${eave}`;
  }
  s += path(vd + 'Z', GOLD, { sw: 2.4 });
  for (let k = 0; k < 12; k++) s += bulb(cx - 100 + (200 * (k + 0.5)) / 12, eave + 6, true, 2);
  s += flag(cx, top + 2, 22, GREEN, 1);
  return s;
}

function suburbHouse(x, by, w, h, wall, roof, r) {
  let s = block(x, by - h, w, h, wall, 6);
  s += path(`M${x - 8} ${by - h + 2}L${x + w / 2} ${by - h - w * 0.42}L${x + w + 8} ${by - h + 2}Z`, roof, { sw: 2.6 });
  s += path(`M${x + w / 2} ${by - h - w * 0.42}L${x + w + 8} ${by - h + 2}L${x + w * 0.5 + 6} ${by - h + 2}Z`, O, { op: 0.12 });
  s += line(`M${x - 4} ${by - h - 1}L${x + w / 2} ${by - h - w * 0.38}`, lt(roof, 0.35), 2.4);
  if (r() < 0.6) s += rect(x + w * 0.7, by - h - w * 0.32, 8, 16, '#b86b5a', { sw: 2 });
  const dw = 14;
  s += rect(x + w / 2 - dw / 2, by - 26, dw, 26, dk(roof, 0.1), { sw: 2.2, rx: 1 }) + circ(x + w / 2 + 3.5, by - 13, 1.4, GOLD);
  for (const wx of [x + 8, x + w - 26]) {
    s += rect(wx, by - h + 14, 18, 16, '#bfeaff', { sw: 2.2 }) + line(`M${wx + 9} ${by - h + 14}V${by - h + 30}M${wx} ${by - h + 22}H${wx + 18}`, WHITE, 1.6);
    s += rect(wx - 3, by - h + 30, 24, 4, WHITE, { sw: 1.6 }) + ell(wx + 9, by - h + 29, 9, 2.6, '#ff8fb8', { sw: 1.2 });
    if (r() < 0.35) s += g(rect(wx - 3, by - h + 19, 24, 5, WOOD, { sw: 1.6 }) + nail(wx, by - h + 21.5) + nail(wx + 18, by - h + 21.5), { tf: `rotate(${f((r() - 0.5) * 30)} ${wx + 9} ${by - h + 21})` });
  }
  return s;
}

function picket(x0, x1, by) {
  let s = line(`M${x0} ${by - 10}H${x1}M${x0} ${by - 4}H${x1}`, '#d8d0c4', 2.2);
  for (let x = x0; x <= x1; x += 13) s += path(`M${x - 3.5} ${by}V${by - 14}L${x} ${by - 18}L${x + 3.5} ${by - 14}V${by}Z`, WHITE, { sw: 1.6 });
  return s;
}

/** The Suburbs water tower: four legs, a round tank with a heart, a red cap. */
function waterTower(cx, by) {
  let s = '';
  s += stick(`M${cx - 30} ${by}L${cx - 22} ${by - 92}M${cx + 30} ${by}L${cx + 22} ${by - 92}M${cx - 11} ${by}L${cx - 8} ${by - 92}M${cx + 11} ${by}L${cx + 8} ${by - 92}`, '#8a96a8', 4, 2.4);
  s += line(`M${cx - 28} ${by - 20}L${cx + 26} ${by - 52}M${cx + 28} ${by - 20}L${cx - 26} ${by - 52}M${cx - 25} ${by - 58}L${cx + 24} ${by - 86}M${cx + 25} ${by - 58}L${cx - 24} ${by - 86}`, '#8a96a8', 2);
  s += line(`M${cx - 26} ${by - 54}H${cx + 26}`, O, 4.4) + line(`M${cx - 26} ${by - 54}H${cx + 26}`, '#a9b4c4', 2.4);
  const t = by - 150;
  s += path(`M${cx - 44} ${t + 18}H${cx + 44}V${t + 54}Q${cx + 44} ${t + 66} ${cx} ${t + 68}Q${cx - 44} ${t + 66} ${cx - 44} ${t + 54}Z`, '#8ecff2', { sw: 2.8 });
  s += path(`M${cx + 24} ${t + 20}H${cx + 42}V${t + 54}Q${cx + 40} ${t + 64} ${cx + 22} ${t + 67}Z`, O, { op: 0.1 }) + rect(cx - 40, t + 21, 8, 36, '#ffffff', { op: 0.35, rx: 3 });
  s += line(`M${cx - 44} ${t + 36}H${cx + 44}`, '#5aa6d6', 1.6);
  s += path(`M${cx} ${t + 54}c-11 -9 -18 -16 -14 -24c3 -6 11 -6 14 0c3 -6 11 -6 14 0c4 8 -3 15 -14 24z`, PINK, { sw: 2 }) + path(`M${cx - 9} ${t + 33}q2 -3 5 -2`, 'none', { sw: 1.6, stroke: '#ffffff', op: 0.8, cap: true });
  s += path(`M${cx - 50} ${t + 20}L${cx} ${t - 6}L${cx + 50} ${t + 20}Z`, RED, { sw: 2.8 }) + path(`M${cx} ${t - 6}L${cx + 50} ${t + 20}H${cx + 18}Z`, O, { op: 0.12 });
  s += stick(`M${cx} ${t - 6}V${t - 16}`, '#8a96a8', 1.6, 2) + circ(cx, t - 17, 2.6, GOLD, { sw: 1.2 });
  s += line(`M${cx - 48} ${t + 70}H${cx + 48}`, O, 4.6) + line(`M${cx - 48} ${t + 70}H${cx + 48}`, '#a9b4c4', 2.6);
  for (let x = cx - 44; x <= cx + 44; x += 8) s += line(`M${x} ${t + 70}V${t + 76}`, '#8a96a8', 1.2);
  return s;
}

/** A shopping cart lying on its side (wheels toward the viewer's right). */
function cartTipped(x, by) {
  let s = path(`M${x - 22} ${by}L${x - 18} ${by - 26}H${x + 4}L${x + 8} ${by}Z`, '#c9ced6', { sw: 2.4 });
  for (let i = 1; i < 4; i++) s += line(`M${x - 22 + i * 7.5} ${by - 1}L${x - 18 + i * 5.5} ${by - 25}`, '#8a909a', 1.3);
  s += line(`M${x - 20} ${by - 13}H${x + 6}`, '#8a909a', 1.3);
  s += stick(`M${x - 18} ${by - 26}L${x - 24} ${by - 34}`, RED, 2.4, 2);
  s += stick(`M${x + 8} ${by - 4}H${x + 16}M${x + 6} ${by - 20}H${x + 14}`, '#8a909a', 2, 2);
  s += circ(x + 18, by - 4, 3.6, RUBBER, { sw: 1.6 }) + circ(x + 16, by - 20, 3.6, RUBBER, { sw: 1.6 });
  return s;
}

function lamp(x, by, h = 60) {
  return stick(`M${x} ${by}V${by - h}`, '#5a6070', 2.4, 2) + stick(`M${x} ${by - h}Q${x + 2} ${by - h - 8} ${x + 10} ${by - h - 6}`, '#5a6070', 2, 2) + path(`M${x + 6} ${by - h - 6}h9l-2 5h-5z`, '#fff6c8', { sw: 1.6 });
}

function palm(x, by) {
  let s = rect(x - 10, by - 14, 20, 14, '#d86a5a', { sw: 2, rx: 2 }) + rect(x - 8, by - 12, 4, 10, '#ffffff', { op: 0.25 }) + stick(`M${x} ${by - 14}Q${x + 3} ${by - 34} ${x} ${by - 52}`, WOOD, 3.8, 2.2);
  for (const [dx, dy] of [[-22, 6], [22, 6], [-17, -6], [17, -6], [0, -12]]) s += path(`M${x} ${by - 52}Q${x + dx * 0.6} ${by - 64 + dy} ${x + dx} ${by - 50 + dy}Q${x + dx * 0.5} ${by - 55 + dy} ${x} ${by - 52}Z`, GREEN, { sw: 1.8 });
  return s;
}

function container(x, by, w, c) {
  let s = rect(x, by - 22, w, 22, c, { sw: 2.2 });
  for (let i = x + 5; i < x + w - 2; i += 5) s += line(`M${i} ${by - 20}V${by - 2}`, dk(c, 0.2), 1.2);
  return s + rect(x + 1, by - 21, w - 2, 3, lt(c, 0.35)) + rect(x + w - 8, by - 20, 6, 18, O, { op: 0.1 }) + rect(x, by - 22, w, 22, 'none', { sw: 2.2 });
}

/** A big harbour gantry crane with a container on its hook. */
function crane(x, by, c) {
  let s = stick(`M${x - 30} ${by}L${x - 22} ${by - 128}M${x + 30} ${by}L${x + 22} ${by - 128}`, c, 6, 2.4);
  for (let y = by - 20; y > by - 124; y -= 26) s += line(`M${x - 28} ${y}L${x + 27} ${y - 22}M${x + 28} ${y}L${x - 27} ${y - 22}`, dk(c, 0.18), 2);
  s += stick(`M${x - 84} ${by - 132}H${x + 112}`, c, 8, 2.6) + line(`M${x - 80} ${by - 133.5}H${x + 108}`, lt(c, 0.35), 2);
  s += line(`M${x - 6} ${by - 166}L${x - 80} ${by - 136}M${x + 6} ${by - 166}L${x + 108} ${by - 136}`, O, 1.6) + stick(`M${x} ${by - 128}V${by - 166}`, c, 4, 2.2);
  s += block(x - 20, by - 150, 40, 18, c, 0, 2.4) + rect(x - 14, by - 146, 12, 8, '#bfeaff', { sw: 1.4 });
  s += line(`M${x + 86} ${by - 128}V${by - 92}`, O, 1.6) + path(`M${x + 82} ${by - 92}h8l-2 6h-4z`, '#5a6070', { sw: 1.4 });
  s += container(x + 62, by - 64, 48, BLUE) + line(`M${x + 86} ${by - 86}L${x + 66} ${by - 84}M${x + 86} ${by - 86}L${x + 106} ${by - 84}`, O, 1.2);
  return s;
}

/** The harbour lighthouse on its rocks. */
function lighthouse(cx, by) {
  let s = blob([[cx - 30, by - 8, 12], [cx - 10, by - 12, 16], [cx + 14, by - 10, 14], [cx + 34, by - 6, 10]], '#a9a39a', { sw: 2.4, shade: '#8a847b', light: '#c8c2b8' });
  const t = by - 136;
  const body = `M${cx - 20} ${by - 14}L${cx - 13} ${t + 20}H${cx + 13}L${cx + 20} ${by - 14}Z`;
  s += path(body, WHITE);
  for (const [a, b] of [[0.12, 0.3], [0.48, 0.66]]) {
    const ya = t + 20 + (by - 34 - t) * a;
    const yb = t + 20 + (by - 34 - t) * b;
    const wa = 13 + 7 * a;
    const wb = 13 + 7 * b;
    s += path(`M${f(cx - wa)} ${f(ya)}H${f(cx + wa)}L${f(cx + wb)} ${f(yb)}H${f(cx - wb)}Z`, RED);
  }
  s += path(`M${cx + 5} ${t + 20}H${cx + 13}L${cx + 20} ${by - 14}H${cx + 8}Z`, O, { op: 0.1 }) + path(body, 'none', { sw: 2.6 });
  s += rect(cx - 3, by - 40, 6, 12, '#5a6070', { sw: 1.6, rx: 2 });
  s += rect(cx - 19, t + 16, 38, 5, '#5a6070', { sw: 2 });
  s += circ(cx, t + 6, 22, '#fff3a0', { op: 0.35 }) + rect(cx - 11, t - 2, 22, 18, '#fff6c8', { sw: 2.4 }) + line(`M${cx - 4} ${t - 1}V${t + 15}M${cx + 4} ${t - 1}V${t + 15}`, O, 1.2, { op: 0.5 });
  s += path(`M${cx - 15} ${t - 2}Q${cx} ${t - 18} ${cx + 15} ${t - 2}Z`, RED, { sw: 2.4 }) + stick(`M${cx} ${t - 12}V${t - 20}`, '#5a6070', 1.4, 1.8) + circ(cx, t - 21, 2, GOLD, { sw: 1 });
  return s;
}

function sailboat(x, by) {
  let s = path(`M${x - 22} ${by - 8}H${x + 24}L${x + 16} ${by}H${x - 16}Z`, WHITE, { sw: 2.2 }) + rect(x - 18, by - 7, 36, 2.5, RED);
  s += stick(`M${x} ${by - 8}V${by - 46}`, WOOD_D, 1.8, 1.8);
  s += path(`M${x + 2} ${by - 44}L${x + 22} ${by - 12}H${x + 2}Z`, '#fffaf0', { sw: 2 }) + path(`M${x - 2} ${by - 38}L${x - 16} ${by - 12}H${x - 2}Z`, YELLOW, { sw: 2 });
  return s;
}

function gull(x, y) {
  return path(`M${x - 7} ${y}q4 -5 7 0q3 -5 7 0`, 'none', { sw: 2, stroke: '#5a6070', cap: true });
}

/** A big airliner in side view, nose to the right; (x, by) = the middle of the body's bottom. */
function airliner(x, by) {
  const L = x - 164;
  const R = x + 164;
  const T = by - 40;
  let s = shadow(x, by + 22, 150, 4);
  // Tail fin and stabiliser.
  s += path(`M${L + 22} ${T + 4}L${L + 4} ${T - 56}H${L + 24}L${L + 66} ${T + 4}Z`, BLUE, { sw: 2.6 }) + path(`M${L + 12} ${T - 40}H${L + 26}L${L + 40} ${T - 18}H${L + 22}Z`, RED) + star(L + 22, T - 24, 5, GOLD, { sw: 1.2 });
  s += path(`M${L + 22} ${T + 4}L${L + 4} ${T - 56}H${L + 24}L${L + 66} ${T + 4}Z`, 'none', { sw: 2.6 });
  // Body.
  const body = `M${L} ${T + 6}Q${L + 2} ${T} ${L + 24} ${T}H${R - 30}Q${R - 4} ${T} ${R + 6} ${T + 22}Q${R + 6} ${by} ${R - 24} ${by}H${L + 40}Q${L + 10} ${by} ${L} ${T + 16}Z`;
  s += path(body, WHITE);
  s += path(`M${L + 30} ${by - 9}H${R - 20}Q${R - 6} ${by - 9} ${R + 2} ${by - 14}Q${R} ${by} ${R - 24} ${by}H${L + 40}Q${L + 24} ${by} ${L + 16} ${by - 6}Z`, '#d9dfe8');
  s += rect(L + 14, T + 18, R - L - 14, 5, BLUE) + rect(L + 20, T + 24, R - L - 26, 2.4, RED);
  for (let wx = L + 44; wx < R - 44; wx += 11) s += rect(wx, T + 8, 5, 7, '#5a8ac0', { rx: 2.4 });
  s += rect(L + 34, T + 6, 9, 19, 'none', { sw: 1.2, rx: 2, op: 0.5 }) + rect(R - 52, T + 6, 9, 19, 'none', { sw: 1.2, rx: 2, op: 0.5 });
  s += path(`M${R - 24} ${T + 6}H${R - 12}Q${R - 4} ${T + 8} ${R} ${T + 14}H${R - 24}Z`, '#2f3a55', { sw: 1.4 });
  s += path(body, 'none', { sw: 2.8 }) + line(`M${L + 24} ${T + 3.6}H${R - 36}`, '#ffffff', 2.6, { op: 0.8 });
  // Wing, engine and gear.
  s += path(`M${x - 28} ${by - 8}L${x + 40} ${by - 8}L${x - 30} ${by + 14}L${x - 56} ${by + 14}Z`, '#e8eef4', { sw: 2.4 });
  s += rect(x - 6, by + 2, 52, 18, '#e8eef4', { sw: 2.4, rx: 9 }) + ell(x + 44, by + 11, 4, 8, '#3a4050', { sw: 1.8 }) + rect(x - 2, by + 4, 34, 3, '#ffffff', { op: 0.7, rx: 1.5 }) + rect(x + 6, by + 13, 26, 3, BLUE, { rx: 1.5 });
  s += line(`M${x - 44} ${by}V${by + 18}M${R - 34} ${by}V${by + 18}`, O, 2.4) + circ(x - 48, by + 20, 4, RUBBER, { sw: 1.6 }) + circ(x - 40, by + 20, 4, RUBBER, { sw: 1.6 }) + circ(R - 34, by + 20, 4, RUBBER, { sw: 1.6 });
  return s;
}

function controlTower(cx, by) {
  let s = path(`M${cx - 12} ${by}L${cx - 8} ${by - 118}H${cx + 8}L${cx + 12} ${by}Z`, '#e8eef4', { sw: 2.6 }) + path(`M${cx + 2} ${by - 118}H${cx + 8}L${cx + 12} ${by}H${cx + 4}Z`, O, { op: 0.1 });
  for (let y = by - 100; y < by - 8; y += 22) s += rect(cx - 3, y, 6, 8, '#bfeaff', { sw: 1.3 });
  s += path(`M${cx - 26} ${by - 118}H${cx + 26}L${cx + 22} ${by - 126}H${cx - 22}Z`, '#cfd8e2', { sw: 2.2 });
  s += path(`M${cx - 30} ${by - 150}H${cx + 30}L${cx + 24} ${by - 126}H${cx - 24}Z`, '#7fc4e8', { sw: 2.6 }) + line(`M${cx - 14} ${by - 149}L${cx - 12} ${by - 127}M${cx} ${by - 149}V${by - 127}M${cx + 14} ${by - 149}L${cx + 12} ${by - 127}`, '#2f5a7a', 1.6) + path(`M${cx - 26} ${by - 146}L${cx - 6} ${by - 146}L${cx - 14} ${by - 132}Z`, '#ffffff', { op: 0.35 });
  s += path(`M${cx - 34} ${by - 150}L${cx - 24} ${by - 160}H${cx + 24}L${cx + 34} ${by - 150}Z`, '#5a6070', { sw: 2.4 });
  s += stick(`M${cx} ${by - 160}V${by - 176}`, '#7a8088', 1.6, 2) + circ(cx, by - 177, 3, RED, { sw: 1.2 });
  return s;
}

const BACKDROPS = {
  1(r) {
    // Picnic Grove: a bandstand in the middle of a sunny meadow.
    let s = skyBand() + sun(318, 48) + cloudsAt([[150, 40, 0.9], [452, 26, 0.7], [624, 52, 0.85], [800, 32, 0.9], [960, 56, 0.8]]);
    s += path(smooth([[-40, 128], [120, 106], [300, 122], [470, 100], [650, 120], [820, 102], [1000, 124]]) + 'L1000 190L-40 190Z', '#c4ead0', { sw: 2, stroke: '#a2d6b6' });
    const far = [];
    for (let x = -30; x < 1000; x += 22) far.push([x, 132 + Math.sin(x * 0.05) * 4, 10 + ((x * 7) % 5)]);
    s += blob(far, '#9ad884', { sw: 2, stroke: '#78b866' });
    s += path(smooth([[-40, 150], [160, 140], [360, 150], [560, 138], [760, 148], [1000, 140]]) + 'L1000 190L-40 190Z', '#9adb72', { sw: 2.2, stroke: '#6fb24e' });
    for (const [x, sc, c] of [[60, 1.2, '#4fae45'], [196, 1.0, '#5fbb4e'], [326, 1.35, '#4fae45'], [680, 1.25, '#5fbb4e'], [790, 1.0, '#4fae45'], [920, 1.2, '#5fbb4e']]) s += tree(x, 172, sc, c);
    s += bush(130, 176) + bush(258, 176, 0.8) + bush(744, 176, 0.9) + bush(870, 176);
    // A picnic blanket with a basket behind the squad.
    s += path('M232 176L250 166H306L296 176Z', RED, { sw: 2 }) + path('M241 171H301M246 168.5L238 176M262 166L256 176M278 166L274 176', 'none', { sw: 1.6, stroke: WHITE, op: 0.9 }) + rect(276, 160, 14, 9, '#d8a860', { sw: 1.8, rx: 2 }) + path('M277 160Q283 152 289 160', 'none', { sw: 1.8 });
    s += gazebo(480, 178);
    s += umbrella(612, 176, BLUE, WHITE) + picnicTable(612, 178);
    // Pond with a duck.
    s += ell(842, 172, 60, 8, '#6fd0ff', { sw: 2.2, stroke: '#4aa8d8' }) + path('M806 171h22M852 174h26', 'none', { sw: 2, stroke: '#ffffff', op: 0.7, cap: true }) + ell(846, 167, 6, 4, WHITE, { sw: 1.6 }) + circ(851, 163, 3, WHITE, { sw: 1.4 }) + path('M853.5 163l3 1l-3 1z', ORANGE);
    // Ground: grass lip, a dirt path the squad runs on, flowery verge.
    s += groundBase('#93dc62', GRASS, '#6cbe44', '#4f9a32');
    s += path('M-40 188Q240 184 480 188T1000 186L1000 206Q720 202 480 206T-40 204Z', '#ecca8e') + path('M-40 188Q240 184 480 188T1000 186', 'none', { sw: 2, stroke: '#c9a26a' }) + path('M-40 204Q240 208 480 206T1000 206', 'none', { sw: 2, stroke: '#c9a26a' });
    for (let i = 0; i < 40; i++) s += ell(r() * 960, 191 + r() * 12, 2 + r() * 2, 1.1, '#c9a26a', { op: 0.7 });
    for (let i = 0; i < 30; i++) {
      const x = r() * 960;
      const y = i % 2 ? 182 + r() * 3 : 209 + r() * 8;
      s += circ(x, y, 2, [WHITE, '#ffe066', '#ff9ccf'][i % 3], { sw: 0.8 });
    }
    return s;
  },
  2(r) {
    // Suburbs: a street of little houses under the town water tower.
    let s = skyBand() + cloudsAt([[140, 36, 0.9], [360, 24, 0.7], [650, 40, 0.8], [880, 30, 0.95]]);
    const pale = ['#d9ecf5', '#e6e0f2', '#f2e3d8'];
    for (let x = -30, i = 0; x < 990; x += 44, i++) {
      const h = 14 + ((i * 7) % 3) * 6;
      s += rect(x, 150 - h, 34, h, pale[i % 3], { sw: 1.6, stroke: '#a9c4d0' }) + path(`M${x - 3} ${150 - h}L${x + 17} ${136 - h}L${x + 37} ${150 - h}Z`, '#c9d6e6', { sw: 1.6, stroke: '#a9c4d0' });
    }
    s += path(smooth([[-40, 150], [200, 144], [420, 150], [640, 142], [860, 150], [1000, 146]]) + 'L1000 190L-40 190Z', '#a9e08c', { sw: 2, stroke: '#86c46e' });
    s += waterTower(556, 170);
    const walls = ['#f7d38a', '#9ec9f5', '#f4a8a0', '#c3e39a', '#e3c3f5'];
    const roofs = [RED, '#5b6fb0', '#7a5a9a', '#d86a5a', '#4a8a7a'];
    [[50, 120, 62], [228, 118, 58], [384, 132, 66], [622, 120, 60], [800, 126, 64]].forEach(([x, w, h], i) => (s += suburbHouse(x, 172, w, h, walls[i], roofs[i], r)));
    s += tree(368, 172, 0.85) + tree(762, 172, 0.95, '#5fbb4e') + tree(196, 172, 0.7);
    s += picket(-40, 1000, 178);
    // Mailbox, a tipped bin and a tricycle.
    s += stick('M360 180V160', '#7a8088', 2.4) + rect(351, 150, 20, 12, BLUE, { sw: 2, rx: 5 }) + rect(369, 145, 2.4, 9, RED, { sw: 0.8 });
    s += g(rect(526, 160, 16, 20, '#6a9a7a', { sw: 2, rx: 2 }) + rect(524, 158, 20, 4, '#5a8a6a', { sw: 1.8, rx: 1.5 }), { tf: 'rotate(-80 534 180)' }) + ell(506, 177, 6, 2.6, '#c8b48a', { sw: 1.4 }) + circ(514, 175, 2.2, '#e8483f', { sw: 1 });
    s += circ(706, 172, 6, RUBBER, { sw: 1.8 }) + circ(730, 174, 4, RUBBER, { sw: 1.6 }) + stick('M706 172L716 162L730 174M716 162L722 160', RED, 2, 1.8) + rect(712, 158, 8, 3, '#5a5a6a', { rx: 1.5 });
    // Ground: sidewalk, curb, a grass verge and the edge of the road.
    s += groundBase('#f6f0e4', '#ece4d4', '#7a7884', '#a89f90');
    for (let x = 0; x < 980; x += 40) s += line(`M${x} 181V200`, '#d4cab8', 1.4);
    s += rect(-40, 200, 1040, 4, '#d4ccbe') + line('M-40 200H1000', '#a89f90', 1.6) + rect(-40, 204, 1040, 8, '#7cc74e') + line('M-40 212H1000', '#4f9a32', 1.6);
    for (let i = 0; i < 18; i++) s += circ(r() * 960, 207 + r() * 3, 1.8, [WHITE, '#ffe066', '#ff9ccf'][i % 3], { sw: 0.7 });
    for (let x = 10; x < 980; x += 70) s += rect(x, 217, 34, 3, '#ffd84d', { rx: 1.5 });
    return s;
  },
  3(r) {
    // Shopping Mall: the glass atrium with its fountain, shops either side.
    let s = skyBand('#76ccfb', '#d8f5ff') + sun(860, 38) + cloudsAt([[120, 30, 0.85], [300, 22, 0.7], [700, 34, 0.8]]);
    const tow = ['#d7e7f2', '#e4def0', '#f0e2d6'];
    for (const [x, w, h, i] of [[40, 50, 80, 0], [150, 40, 100, 1], [250, 54, 70, 2], [700, 48, 94, 1], [790, 60, 76, 0], [900, 44, 102, 2]]) {
      s += rect(x, 150 - h, w, h, tow[i], { sw: 1.6, stroke: '#a9c4d4' });
      for (let y = 160 - h; y < 140; y += 12) s += rect(x + 6, y, w - 12, 5, '#c4dcec', { rx: 1 });
    }
    // Facade with shops.
    s += block(90, 76, 780, 102, '#f3e2cc', 10);
    s += rect(80, 66, 800, 12, '#fff4e2', { sw: 2.6, rx: 3 }) + rect(80, 76, 800, 4, '#e2cfb2');
    const aw = [RED, '#5fc7c0', YELLOW, PINK];
    const shop = (x, i) => {
      let t = rect(x, 104, 64, 62, '#bfeaff', { sw: 2.4 }) + path(`M${x + 8} 164L${x + 34} 106M${x + 26} 164L${x + 52} 106`, 'none', { sw: 4, stroke: '#ffffff', op: 0.45 });
      t += rect(x + 22, 132, 20, 34, '#9fd8f0', { sw: 2 }) + line(`M${x + 32} 132V166`, O, 1.4);
      t += path(`M${x - 4} 86H${x + 68}V96Q${x + 59} 104 ${x + 50} 96Q${x + 41} 104 ${x + 32} 96Q${x + 23} 104 ${x + 14} 96Q${x + 5} 104 ${x - 4} 96Z`, aw[i % 4], { sw: 2.2 });
      t += path(`M${x + 14} 86V96M${x + 32} 86V96M${x + 50} 86V96`, 'none', { sw: 4, stroke: '#ffffff', op: 0.5 });
      return t;
    };
    [100, 186, 272, 612, 698, 784].forEach((x, i) => (s += shop(x, i)));
    for (const x of [92, 178, 264, 350, 604, 690, 776, 862]) s += rect(x - 4, 80, 8, 98, '#ead6bb', { sw: 1.6 }) + rect(x - 3, 81, 2, 96, '#ffffff', { op: 0.5 });
    // The atrium: tall glass under an arch, a big round sign with a shopping bag.
    s += path('M392 178V84Q480 34 568 84V178Z', '#5fc7c0', { sw: 2.8 });
    s += path('M404 178V90Q480 50 556 90V178Z', '#bfeaff', { sw: 2.2 });
    for (const x of [430, 455, 480, 505, 530]) s += line(`M${x} ${x === 480 ? 54 : 70 - Math.abs(480 - x) * 0.2}V178`, '#5fa8c8', 1.8);
    s += line('M404 120H556M404 146H556', '#5fa8c8', 1.8) + path('M412 170L446 92M436 170L470 84', 'none', { sw: 6, stroke: '#ffffff', op: 0.4 });
    s += rect(446, 140, 68, 38, '#9fd8f0', { sw: 2.2 }) + line('M480 140V178', O, 1.8);
    s += circ(480, 52, 30, '#fff3a0', { op: 0.35 }) + circ(480, 52, 24, PINK, { sw: 2.8 }) + circ(480, 52, 19, '#ff9ccf');
    s += rect(469, 47, 22, 18, WHITE, { sw: 2, rx: 2 }) + path('M474 48Q474 38 480 38Q486 38 486 48', 'none', { sw: 2.2 }) + rect(469, 47, 22, 4, YELLOW, { sw: 1.6 });
    for (let i = 0; i < 12; i++) s += bulb(480 + Math.cos((i * Math.PI) / 6) * 27, 52 + Math.sin((i * Math.PI) / 6) * 27, true, 1.8);
    s += flag(392, 84, 26, RED, -1) + flag(568, 84, 26, BLUE, 1);
    s += palm(372, 178) + palm(588, 178) + lamp(170, 178) + lamp(780, 178);
    // The fountain in front of the doors (the zone's souvenir).
    const jet = (d) => line(d, '#3aa8e8', 5) + line(d, '#9fe4ff', 3) + line(d, '#ffffff', 1.1, { op: 0.8 });
    s += jet('M474 158Q452 140 444 168') + jet('M486 158Q508 140 516 168') + jet('M480 156Q480 140 480 150');
    s += path('M436 166H524L518 178H442Z', '#5fc7c0', { sw: 2.4 }) + rect(432, 162, 96, 6, WHITE, { sw: 2.2, rx: 3 }) + ell(480, 164, 42, 1.6, '#6fd0ff') + rect(475, 152, 10, 12, WHITE, { sw: 2 }) + path('M466 152H494L489 158H471Z', '#5fc7c0', { sw: 2 });
    // Ground: warm plaza tiles.
    s += groundBase('#fbecd2', '#efd9b8', '#e2c79e', '#b89a72');
    for (let x = -20; x < 990; x += 30) s += line(`M${x} 183L${x - 14} 220`, '#dcc29a', 1.4);
    s += line('M-40 196H1000M-40 208H1000', '#dcc29a', 1.4);
    for (let x = 0; x < 960; x += 120) s += rect(x + 40, 197, 30, 10, '#f6e6c8', { op: 0.9 });
    s += cartTipped(706, 182) + g(rect(256, 172, 14, 12, PINK, { sw: 1.8, rx: 1 }) + path('M259 172Q263 165 267 172', 'none', { sw: 1.6 }), { tf: 'rotate(-14 263 184)' });
    return s;
  },
  4(r) {
    // Harbor: the big crane, the lighthouse on its rocks, the open sea.
    let s = skyBand('#72cafb', '#e0f7ff') + sun(150, 40) + cloudsAt([[290, 28, 0.75], [560, 22, 0.7], [820, 40, 0.9]]);
    s += rect(-40, 110, 1040, 72, '#4fb8e8') + rect(-40, 110, 1040, 9, '#7fd0f0') + line('M-40 110H1000', '#3a98c8', 2.2);
    s += path('M690 112Q720 96 752 104Q780 94 820 112Z', '#9fd890', { sw: 2, stroke: '#7ab86e' });
    for (let i = 0; i < 22; i++) s += path(`M${f(r() * 960)} ${f(124 + r() * 48)}q5 -3 10 0q5 3 10 0`, 'none', { sw: 2, stroke: '#ffffff', op: 0.55, cap: true });
    // Cargo ship on the horizon.
    s += path('M412 112H520L510 122H420Z', RED, { sw: 2 }) + container(424, 112, 22, BLUE) + container(448, 112, 22, YELLOW) + container(472, 112, 22, GREEN) + block(498, 94, 16, 18, WHITE, 0, 2) + rect(503, 86, 5, 8, '#5a6070', { sw: 1.4 });
    s += sailboat(520, 158) + circ(780, 160, 6, RED, { sw: 2 }) + rect(778, 148, 4, 8, RED, { sw: 1.4 }) + path('M770 162q10 4 20 0', 'none', { sw: 1.6, stroke: '#ffffff', op: 0.7 });
    s += container(60, 180, 48, ORANGE) + container(110, 180, 48, BLUE) + container(84, 158, 48, GREEN) + container(820, 180, 50, PURPLE) + container(874, 180, 46, YELLOW) + container(846, 158, 48, RED);
    s += crane(344, 180, RED);
    s += lighthouse(634, 180);
    s += gull(430, 52) + gull(560, 70) + gull(740, 36) + gull(240, 64);
    // Ground: the dock.
    s += groundBase(WOOD_L, WOOD, WOOD_D, '#7a4a24');
    for (let x = -40; x < 1000; x += 34) s += line(`M${x} 183V220`, WOOD_D, 1.6) + nail(x + 5, 187) + nail(x + 29, 187);
    s += line('M-40 199H1000', WOOD_D, 1.6);
    for (const x of [262, 720]) s += rect(x - 7, 166, 14, 14, '#5a6070', { sw: 2, rx: 3 }) + ell(x, 166, 9, 3.4, '#5a6070', { sw: 2 }) + rect(x - 5, 168, 3, 10, '#ffffff', { op: 0.25 });
    s += ell(418, 176, 12, 4, '#d8b878', { sw: 2 }) + ell(418, 174, 8, 2.6, 'none', { sw: 1.4, stroke: '#a88a50' });
    s += stick('M556 180V156', WOOD_D, 3, 2) + circ(556, 158, 9, WHITE, { sw: 2 }) + circ(556, 158, 4.4, WOOD, { sw: 1.6 }) + path('M548 154l4 3M564 154l-4 3M551 165l3 -3M561 165l-3 -3', 'none', { sw: 3, stroke: '#ff7a2a' });
    return s;
  },
  5(r) {
    // Stadium: stands (pushed back, with a tiny crowd), a big scoreboard, floodlights.
    let s = skyBand() + cloudsAt([[110, 30, 0.8], [850, 26, 0.85]]);
    const pid = uid('crowd');
    const skin = ['#f2c9a0', '#d9a27a', '#a8714a', '#7a4a2e', '#f8dcc0'];
    const top = ['#e8483f', '#3d8bf0', '#f5b82e', '#36c06a', '#b25cff', '#ffffff'];
    let tile = '';
    for (let i = 0; i < 4; i++) {
      const x = 4 + i * 7;
      const y = 6 + ((i * 3) % 4);
      tile += rect(x - 3, y + 2, 6, 6, mix(top[(i * 5) % 6], '#c8ecfc', 0.5), { rx: 2.5 }) + circ(x, y, 2.5, mix(skin[(i * 3) % 5], '#c8ecfc', 0.4));
    }
    s += `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="28" height="17">${tile}</pattern></defs>`;
    s += path('M-40 160L-40 62Q480 22 1000 62L1000 160Z', mix('#dfe7ee', '#bfe6fa', 0.3), { sw: 2.4, stroke: '#9fb8c8' });
    const seatC = [RED, BLUE, YELLOW, '#5fc7c0'];
    const bow = (x, row) => -20 * (1 - ((x - 480) / 620) ** 2) * (1 - row * 0.16);
    for (let row = 0; row < 5; row++) {
      const y0 = 70 + row * 17;
      for (let sx = -40, k = 0; sx < 1000; sx += 120, k++) {
        const c = mix(seatC[(row + k) % 4], '#c8ecfc', 0.45);
        const x1 = sx + 117;
        const d = `M${sx} ${f(y0 + bow(sx, row))}L${x1} ${f(y0 + bow(x1, row))}L${x1} ${f(y0 + 15 + bow(x1, row))}L${sx} ${f(y0 + 15 + bow(sx, row))}Z`;
        s += path(d, c) + path(d, `url(#${pid})`);
      }
    }
    s += path('M-40 62Q480 22 1000 62L1000 50Q480 8 -40 50Z', '#8a96a8', { sw: 2.2, stroke: '#6a7688' });
    // Scoreboard: squad face vs zombie face.
    s += stick('M440 84V110M520 84V110', '#7a8088', 4, 2.4);
    s += block(392, 30, 176, 58, BLUE, 0, 2.8) + rect(402, 42, 156, 36, '#1d1a22', { sw: 2, rx: 3 });
    for (let i = 0; i < 10; i++) s += bulb(402 + i * 17.3, 36, true, 1.8);
    s += circ(436, 60, 12, '#f2c9a0', { sw: 2 }) + circ(432, 58, 1.6, O) + circ(440, 58, 1.6, O) + path('M431 63q5 4 10 0', 'none', { sw: 1.6, cap: true }) + path('M424 56q12 -14 24 0q-12 -6 -24 0z', RED, { sw: 1.6 });
    s += circ(524, 60, 12, ZSKIN, { sw: 2 }) + circ(528, 58, 3, WHITE, { sw: 1.2 }) + circ(528.6, 58.4, 1.2, O) + circ(519, 58, 2, WHITE, { sw: 1 }) + path('M518 65q6 3 11 -1', 'none', { sw: 1.6, cap: true });
    s += circ(480, 54, 2.6, '#ffe066') + circ(480, 66, 2.6, '#ffe066');
    for (const x of [288, 672]) {
      s += stick(`M${x} 160V30`, '#7a8088', 5, 2.4);
      s += block(x - 26, 6, 52, 26, '#5a6070', 0, 2.4);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) s += circ(x - 17 + i * 11.3, 13 + j * 11, 4, '#fff6c8', { sw: 1.2 });
      s += circ(x, 19, 34, '#fff6c8', { op: 0.22 });
    }
    // Advert boards, soft colours so the runners stand out in front.
    const ad = [RED, YELLOW, BLUE, GREEN, PURPLE, ORANGE];
    for (let i = 0; i < 10; i++) {
      const c = mix(ad[i % 6], '#ffffff', 0.5);
      s += rect(-40 + i * 106, 154, 102, 24, c, { sw: 2.2 }) + rect(-40 + i * 106 + 2, 155.5, 98, 3, '#ffffff', { op: 0.5 });
      s += i % 2 ? star(-40 + i * 106 + 26, 166, 6, '#ffffff', { sw: 1.2 }) + rect(-40 + i * 106 + 40, 162, 48, 8, '#ffffff', { rx: 4, op: 0.8 }) : circ(-40 + i * 106 + 24, 166, 6, '#ffffff', { sw: 1.2 }) + rect(-40 + i * 106 + 38, 160, 34, 5, '#ffffff', { rx: 2.5, op: 0.8 }) + rect(-40 + i * 106 + 38, 168, 50, 4, '#ffffff', { rx: 2, op: 0.6 });
    }
    // The pitch: mowing stripes, a touchline.
    s += groundBase('#86d45a', '#6cc044', '#5aae38', '#4f9a32');
    for (let x = -40; x < 1000; x += 80) s += rect(x, 183, 40, 30, '#7acc4e', { op: 0.8 });
    s += line('M-40 192H1000', WHITE, 2.6, { op: 0.95 }) + path('M400 220Q480 200 560 220', 'none', { sw: 2.4, stroke: '#ffffff', op: 0.9 });
    s += circ(760, 176, 6, WHITE, { sw: 2 }) + path('M757 173l3 -1l3 2l-1 3h-4z', O) + cone(214, 182) + cone(234, 182);
    return s;
  },
  6(r) {
    // Airport: a big jet at the terminal, the control tower behind.
    let s = skyBand('#72cafb', '#e0f7ff') + sun(150, 34) + cloudsAt([[330, 24, 0.7], [560, 40, 0.75], [860, 30, 0.9]]);
    s += path(smooth([[-40, 132], [200, 118], [460, 128], [720, 114], [1000, 126]]) + 'L1000 190L-40 190Z', '#c4ead0', { sw: 2, stroke: '#a2d6b6' });
    // Terminal: long glass building with a wave roof.
    s += block(70, 110, 820, 62, '#e8eef4', 8);
    for (let x = 84; x < 880; x += 34) s += rect(x, 122, 26, 34, '#bfeaff', { sw: 1.8 }) + line(`M${x + 5} 152L${x + 19} 126`, '#ffffff', 3, { op: 0.5 });
    s += path('M58 112Q180 92 300 106T540 104T780 102T902 112L902 118L58 118Z', '#5fc7c0', { sw: 2.6 }) + path('M70 110Q180 94 300 106', 'none', { sw: 2.4, stroke: '#ffffff', op: 0.5, cap: true });
    s += controlTower(664, 176);
    // Apron grass strip with lights.
    s += rect(-40, 170, 1040, 10, '#8bd65a') + line('M-40 170H1000', '#6fb24e', 1.6);
    for (let x = 16; x < 980; x += 48) s += circ(x, 175, 2.2, x % 96 < 48 ? '#7fc4ff' : '#ffe066', { sw: 1 });
    s += airliner(446, 150);
    // Ground: the apron, with taxi lines and chevrons.
    s += groundBase('#b2afbd', '#8e8b9a', '#7e7b8a', '#5a5868');
    s += line('M-40 199H1000', '#ffd84d', 3) + line('M-40 204H1000', '#ffd84d', 1.4, { dash: '10 8' });
    for (let x = 30; x < 980; x += 110) s += path(`M${x} 186l10 5l-10 5h-6l10 -5l-10 -5z`, '#ffffff', { op: 0.8 });
    for (let i = 0; i < 30; i++) s += ell(r() * 960, 184 + r() * 32, 3 + r() * 4, 1.2, '#7e7b8a', { op: 0.6 });
    s += cone(312, 182) + cone(760, 182);
    s += rect(842, 166, 40, 10, BLUE, { sw: 2, rx: 2 }) + rect(846, 158, 14, 8, YELLOW, { sw: 1.6 }) + rect(862, 160, 14, 6, RED, { sw: 1.6 }) + circ(850, 178, 3, RUBBER, { sw: 1.2 }) + circ(876, 178, 3, RUBBER, { sw: 1.2 });
    return s;
  },
};

/** A raid backdrop strip, viewBox 0 0 960 220, ground line at y = 180. zone 1..6. */
export function zoneBackdropSvg(zone = 1) {
  const z = Math.max(1, Math.min(6, zone | 0));
  const r = rng(100 + z);
  return svg(960, 220, BACKDROPS[z](r), { cls: `backdrop zone-${z}`, par: 'xMidYMax slice' });
}
