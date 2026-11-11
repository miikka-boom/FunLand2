// Thrill Hill UI icons: chunky, outlined, toy-like. Every icon is a static SVG
// string on a 24×24 grid, wrapped as <svg class="ico" viewBox="0 0 24 24">, with
// no ids (so any number of copies can sit on one page). Pure strings: safe to
// import in node tests.
//
//   import { icon, ICONS } from './icons.js';
//   el.innerHTML = `${icon('coin')}<b>120</b>`;
//
// classGlyph(cls, colours) draws the class marks.
// Names: the currencies and UI glyphs, the four classes, the vibes and perks, plus
// skip (fast-forward), back, soundOn, soundOff and tiny crate / vault chests.

const O = '#2a1b12';
const W = '#fffaf0';
const RED = '#e8483f';
const RED_D = '#b52f2b';
const BLUE = '#3d8bf0';
const BLUE_D = '#2a6cc8';
const GREEN = '#36c06a';
const GREEN_D = '#23944f';
const LIME = '#5fd35a';
const LIME_D = '#2fa83a';
const YELLOW = '#f5b82e';
const YELLOW_D = '#d18f00';
const GOLD = '#ffc23a';
const GOLD_D = '#e0960f';
const GOLD_L = '#ffe58a';
const PURPLE = '#b25cff';
const PINK = '#ff7ab8';
const ORANGE = '#ff8a3c';
const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const STEEL = '#b4bcc6';
const STEEL_D = '#7d8691';
const SKIN = '#f2c49a';
const SKIN_D = '#d99a6c';
const GEM = '#3fd0f5';
const GEM_D = '#1a98c2';
const GEM_L = '#a6f0ff';
const BONE = '#fffaf0';
const BONE_D = '#e3d5bb';

const SW = 2; // the outline on the 24 grid

// --- tiny builders (24×24 user units) ---------------------------------------------------------

const n = (v) => Math.round(v * 100) / 100;
function st(o) {
  let s = '';
  if (o.sw !== 0) s += ` stroke="${o.stroke || O}" stroke-width="${o.sw ?? SW}" stroke-linejoin="round"`;
  if (o.cap) s += ' stroke-linecap="round"';
  if (o.op != null) s += ` opacity="${o.op}"`;
  if (o.tf) s += ` transform="${o.tf}"`;
  return s;
}
const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${st(o)}/>`;
const C = (cx, cy, r, fill, o = {}) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${st(o)}/>`;
const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${st(o)}/>`;
const R = (x, y, w, h, rx, fill, o = {}) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" fill="${fill}"${st(o)}/>`;
/** A plain stroke (no outline). */
const L = (d, color, w, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${o.butt ? 'butt' : 'round'}" stroke-linejoin="round"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
/** An outlined stroke: a dark line under a coloured one. */
const K = (d, color, w, ow = SW) => L(d, O, w + ow * 2) + L(d, color, w);
const G = (inner, tf) => `<g transform="${tf}">${inner}</g>`;
/** A soft white highlight stroke. */
const HI = (d, w = 1.5, op = 0.75) => L(d, '#ffffff', w, { op });

/** 4-point twinkle centred at (x, y). */
function twinkle(x, y, r, fill, o = {}) {
  const k = r * 0.22;
  const d = `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
  return P(d, fill, { sw: o.sw ?? 1.2 });
}

/** A star polygon path. */
function starPath(cx, cy, ro, ri, pts = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = ((rot + (i * 180) / pts) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

/** A cog path: `teeth` flat-topped teeth between radius ri and ro. */
function gearPath(cx, cy, ro, ri, teeth = 8, tw = 0.42) {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const a0 = a - step * tw * 0.62;
    const a1 = a - step * tw * 0.42;
    const a2 = a + step * tw * 0.42;
    const a3 = a + step * tw * 0.62;
    const pt = (ang, r) => `${n(cx + Math.cos(ang) * r)} ${n(cy + Math.sin(ang) * r)}`;
    d += `${i ? 'L' : 'M'}${pt(a0, ri)}L${pt(a1, ro)}L${pt(a2, ro)}L${pt(a3, ri)}`;
    const mid = a + step / 2;
    d += `Q${pt(mid, ri * 1.04)} ${pt(a + step - step * tw * 0.62, ri)}`;
  }
  return d + 'Z';
}

/** A hexagon (flat top and bottom) path. */
function hexPath(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}

const wrap = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

// --- shared shapes ---------------------------------------------------------------------------

/** The coin face on a 24 grid (also used by kit.js coinSvg). */
export function coinBody() {
  return (
    C(12, 12.6, 9.6, GOLD_D, { sw: 0 }) +
    C(12, 11.6, 8.6, GOLD, { sw: 0 }) +
    C(12, 11.8, 6.1, 'none', { stroke: GOLD_D, sw: 1.3 }) +
    P(starPath(12, 12.1, 4.3, 1.9), GOLD_L, { stroke: GOLD_D, sw: 1.1 }) +
    HI('M5.6 9.4A7 7 0 0 1 9.4 5.3', 1.6, 0.8) +
    C(12, 12, 9.7, 'none')
  );
}

/** The gem on a 24 grid. */
export function gemBody() {
  return (
    P('M7 4.5H17L21.5 9.5L12 21L2.5 9.5Z', GEM, { sw: 0 }) +
    P('M7 4.5L9.2 9.5H2.5Z', GEM_L, { sw: 0 }) +
    P('M7 4.5H17L14.8 9.5H9.2Z', '#d4f8ff', { sw: 0 }) +
    P('M17 4.5L21.5 9.5H14.8Z', GEM, { sw: 0 }) +
    P('M2.5 9.5H9.2L12 21Z', '#62dcf7', { sw: 0 }) +
    P('M14.8 9.5H21.5L12 21Z', GEM_D, { sw: 0 }) +
    L('M2.5 9.5H21.5M9.2 9.5L7 4.5M14.8 9.5L17 4.5M9.2 9.5L12 21L14.8 9.5', GEM_D, 0.9) +
    P('M7 4.5H17L21.5 9.5L12 21L2.5 9.5Z', 'none') +
    twinkle(8.6, 6.9, 2.1, '#ffffff', { sw: 0 })
  );
}

/**
 * A class symbol on the 24 grid: fist (brawler), crosshair (shooter), cross
 * (medic), wrench-on-gear (tinker). `c` is the fill, `d` its shade.
 */
export function classGlyph(cls, { c, d, mono = false } = {}) {
  switch (cls) {
    case 'brawler': {
      c = c || RED;
      d = d || RED_D;
      // A chunky fist, knuckles to the viewer, thumb across the front.
      return (
        R(7, 14.2, 10, 7, 2.4, c) +
        L('M8.5 16.6H15.5', d, 1.4) +
        P('M5 7.6C5 5.9 6.2 4.8 7.6 4.8C8.4 4.8 9 5.1 9.4 5.6C9.9 4.8 10.6 4.4 11.6 4.4C12.6 4.4 13.4 4.9 13.8 5.6C14.3 5 15 4.7 15.8 4.7C17.2 4.7 18.4 5.8 18.4 7.4C19.2 7.6 19.8 8.4 19.8 9.5V12.2C19.8 14.4 18.2 15.8 16 15.8H8.4C6.4 15.8 5 14.4 5 12.4Z', c) +
        L('M9.4 5.8V9.4M13.8 5.8V9.4M18.2 7.6V10', d, 1.3) +
        P('M5.6 11.4C5.6 10.1 6.6 9.5 7.6 9.7L13.4 10.9C14.7 11.2 14.7 13.4 13.2 13.4H7.6C6.4 13.4 5.6 12.6 5.6 11.4Z', c, { sw: 1.5 }) +
        (mono ? '' : HI('M6.8 7.2C7 6.4 7.6 6.1 8.1 6.2', 1.2))
      );
    }
    case 'shooter': {
      c = c || BLUE;
      const ring = K('M12 5.4A6.6 6.6 0 1 1 11.99 5.4', c, 2.4);
      const ticks = K('M12 1.8V7.2M12 16.8V22.2M1.8 12H7.2M16.8 12H22.2', c, 2.4);
      return ticks + ring + C(12, 12, 2.3, mono ? c : RED, { sw: 1.6 });
    }
    case 'medic': {
      c = c || GREEN;
      d = d || GREEN_D;
      const cross = 'M9.6 3.2H14.4Q15.4 3.2 15.4 4.2V8.6H19.8Q20.8 8.6 20.8 9.6V14.4Q20.8 15.4 19.8 15.4H15.4V19.8Q15.4 20.8 14.4 20.8H9.6Q8.6 20.8 8.6 19.8V15.4H4.2Q3.2 15.4 3.2 14.4V9.6Q3.2 8.6 4.2 8.6H8.6V4.2Q8.6 3.2 9.6 3.2Z';
      return P(cross, c, { sw: 0 }) + P('M15.4 15.4H20.8V14.4Q20.8 15.4 19.8 15.4H15.4V19.8Q15.4 20.8 14.4 20.8H9.6Q8.6 20.8 8.6 19.8V18.6H15.4Z', d, { sw: 0 }) + P(cross, 'none') + (mono ? '' : HI('M10.2 5V9.6M5 10.2H8', 1.3, 0.85));
    }
    case 'tinker': {
      c = c || YELLOW;
      d = d || YELLOW_D;
      // A big diagonal wrench over a hex nut (a spiky gear would read like the sun or the settings cog).
      const nut = P(hexPath(16.4, 17, 5.2), mono ? c : STEEL) + (mono ? '' : P('M11.2 17L13.8 21.5H19L21.6 17Z', STEEL_D, { sw: 0, op: 0.7 }) + P(hexPath(16.4, 17, 5.2), 'none')) + C(16.4, 17, 1.9, mono ? d : '#5d6570', { sw: 1.4 });
      const handle = 'M4.8 19.2L13.7 10.3';
      const jaw = 'M19.95 8.23A3.6 3.6 0 1 1 15.77 4.05';
      const wrench = L(handle, O, 3.6 + SW * 2) + L(jaw, O, 3.2 + SW * 2) + L(handle, c, 3.6) + L(jaw, c, 3.2) + (mono ? '' : L('M5.6 17.6L12.6 10.6', '#ffffff', 1, { op: 0.7 }) + L('M14 6.2A2.4 2.4 0 0 1 15.2 4.6', '#ffffff', 0.9, { op: 0.7 }));
      return nut + wrench;
    }
    default:
      return C(12, 12, 6, c || '#c9b48f');
  }
}

// --- the icons -------------------------------------------------------------------------------

const B = {};

B.coin = coinBody();
B.gem = gemBody();

B.skull =
  P('M12 2.8C6.6 2.8 3.4 6.6 3.4 11C3.4 13.5 4.5 15.4 6.4 16.6V19.2C6.4 20.3 7.2 21.1 8.3 21.1H15.7C16.8 21.1 17.6 20.3 17.6 19.2V16.6C19.5 15.4 20.6 13.5 20.6 11C20.6 6.6 17.4 2.8 12 2.8Z', BONE, { sw: 0 }) +
  P('M17.6 16.6C19.5 15.4 20.6 13.5 20.6 11C20.6 8.6 19.6 6.4 17.8 4.9C18.6 6.4 18.9 8 18.8 9.6C18.6 13.4 16.6 15.6 14 16.8L14 21.1H15.7C16.8 21.1 17.6 20.3 17.6 19.2Z', BONE_D, { sw: 0 }) +
  P('M12 2.8C6.6 2.8 3.4 6.6 3.4 11C3.4 13.5 4.5 15.4 6.4 16.6V19.2C6.4 20.3 7.2 21.1 8.3 21.1H15.7C16.8 21.1 17.6 20.3 17.6 19.2V16.6C19.5 15.4 20.6 13.5 20.6 11C20.6 6.6 17.4 2.8 12 2.8Z', 'none') +
  E(8.4, 11.4, 2.6, 2.9, O, { sw: 0 }) +
  E(15.6, 11.4, 2.6, 2.9, O, { sw: 0 }) +
  C(9.1, 10.5, 0.9, '#ffffff', { sw: 0 }) +
  C(16.3, 10.5, 0.9, '#ffffff', { sw: 0 }) +
  P('M12 14.4L13.2 16.3H10.8Z', O, { sw: 0.6 }) +
  L('M10 18.6V21M12 18.6V21M14 18.6V21', O, 1.2) +
  HI('M6.2 8.2C6.8 6.4 8.2 5.2 9.8 4.8', 1.4, 0.9);

B.badge =
  C(12, 12, 9.6, BLUE) +
  P('M3.4 13.4A8.7 8.7 0 0 0 20.6 13.4A8.7 8.7 0 0 1 3.4 13.4Z', BLUE_D, { sw: 0 }) +
  C(12, 12, 7.3, 'none', { sw: 0 }) +
  L('M12 4.7A7.3 7.3 0 1 1 11.99 4.7', '#ffffff', 1.1, { dash: '1.6 1.35', op: 0.85 }) +
  P(starPath(12, 12.4, 4.9, 2.2), GOLD, { sw: 1.3 }) +
  HI('M5 9.4A7.6 7.6 0 0 1 8.4 5.2', 1.4, 0.7);

B.bed =
  R(2.6, 5, 4.2, 16, 1.6, WOOD) +
  R(19.6, 10.8, 2.8, 10.2, 1.2, WOOD) +
  R(2.6, 15.2, 19.8, 3.6, 1.2, WOOD_D) +
  R(5.6, 11.4, 15.4, 4.6, 1.6, W) +
  P('M10.4 10.6H19.6Q21 10.6 21 12V16H10.4Q9.4 13.2 10.4 10.6Z', BLUE) +
  L('M13.6 11V15.6', '#ffffff', 1.1, { op: 0.6 }) +
  R(5.6, 8.2, 5.4, 3.8, 1.8, W) +
  HI('M4.2 7V12', 1.1, 0.6);

B.play =
  P('M8.2 4.6C6.9 3.8 5.4 4.7 5.4 6.2V17.8C5.4 19.3 6.9 20.2 8.2 19.4L18.6 13.3C19.9 12.6 19.9 11.4 18.6 10.7Z', W) +
  P('M5.4 15.2V17.8C5.4 19.3 6.9 20.2 8.2 19.4L18.6 13.3C19.4 12.8 19.7 12.2 19.5 11.6L7.4 18.2C6.4 18.7 5.6 17.9 5.4 15.2Z', '#e8dcc6', { sw: 0 }) +
  P('M8.2 4.6C6.9 3.8 5.4 4.7 5.4 6.2V17.8C5.4 19.3 6.9 20.2 8.2 19.4L18.6 13.3C19.9 12.6 19.9 11.4 18.6 10.7Z', 'none');

B.gear = P(gearPath(12, 12, 10, 7.4, 8), STEEL) + P('M5 15.4A7.6 7.6 0 0 0 19 15.4', 'none', { stroke: STEEL_D, sw: 1.6, cap: true }) + C(12, 12, 3.3, '#5d6570') + HI('M7.4 7.8A6.4 6.4 0 0 1 10.6 5.8', 1.3, 0.8);

B.lock =
  K('M7.8 10.8V8.2A4.2 4.2 0 0 1 16.2 8.2V10.8', STEEL, 2.4) +
  R(4.6, 10.2, 14.8, 11, 2.6, GOLD) +
  P('M4.6 17.4H19.4V18.6Q19.4 21.2 16.8 21.2H7.2Q4.6 21.2 4.6 18.6Z', GOLD_D, { sw: 0 }) +
  R(4.6, 10.2, 14.8, 11, 2.6, 'none') +
  C(12, 14.4, 1.8, O, { sw: 0 }) +
  P('M11.1 15H12.9L13.3 18.4H10.7Z', O, { sw: 0 }) +
  HI('M7 12.6V15', 1.4, 0.8);

B.up =
  // White with a green shade: it sits on green (READY dots and tags, LEVEL UP buttons), so a green fill would vanish.
  P('M12 2.6L20.8 11.6H15.6V19.8Q15.6 21 14.4 21H9.6Q8.4 21 8.4 19.8V11.6H3.2Z', '#ffffff') +
  P('M12 2.6L20.8 11.6H15.6V19.8Q15.6 21 14.4 21H12Z', LIME_D, { sw: 0, op: 0.4 }) +
  P('M8.4 17.4H15.6V19.8Q15.6 21 14.4 21H9.6Q8.4 21 8.4 19.8Z', LIME_D, { sw: 0, op: 0.55 }) +
  P('M12 2.6L20.8 11.6H15.6V19.8Q15.6 21 14.4 21H9.6Q8.4 21 8.4 19.8V11.6H3.2Z', 'none');

B.check = K('M4.4 12.6L9.6 17.6L19.6 6.4', LIME, 4) + HI('M5.4 12.8L9.4 16.6', 1.1, 0.7);

B.star =
  P(starPath(12, 12.8, 10.4, 4.8), GOLD) +
  P('M12 18.2L17.6 21.4L16.4 15.4L20.8 11.2L19.6 11L15.2 15L16 19.4Z', GOLD_D, { sw: 0, op: 0.8 }) +
  P(starPath(12, 12.8, 10.4, 4.8), 'none') +
  HI('M9.4 9.4L11.6 4.8', 1.4, 0.85);

B.heart =
  P('M12 20.6C5 15.6 2.6 12.1 2.6 8.8C2.6 6 4.8 3.8 7.6 3.8C9.6 3.8 11.1 5 12 6.7C12.9 5 14.4 3.8 16.4 3.8C19.2 3.8 21.4 6 21.4 8.8C21.4 12.1 19 15.6 12 20.6Z', RED) +
  P('M12 20.6C19 15.6 21.4 12.1 21.4 8.8C21.4 7.4 20.9 6.2 20.1 5.3C20.3 9.6 17 14 11 18.4Z', RED_D, { sw: 0, op: 0.7 }) +
  P('M12 20.6C5 15.6 2.6 12.1 2.6 8.8C2.6 6 4.8 3.8 7.6 3.8C9.6 3.8 11.1 5 12 6.7C12.9 5 14.4 3.8 16.4 3.8C19.2 3.8 21.4 6 21.4 8.8C21.4 12.1 19 15.6 12 20.6Z', 'none') +
  E(7.2, 8.2, 1.8, 1.2, '#ffffff', { sw: 0, op: 0.8, tf: 'rotate(-35 7.2 8.2)' });

B.hammer =
  K('M4.6 20.4L13.2 11.8', WOOD, 3) +
  L('M5 19.4L12.4 12', '#e8b47c', 1, { op: 0.8 }) +
  G(R(9.2, 6.4, 12.6, 6.4, 1.6, STEEL) + R(9.2, 10.6, 12.6, 2.2, 0.8, STEEL_D, { sw: 0 }) + R(9.2, 6.4, 12.6, 6.4, 1.6, 'none') + R(18.6, 5.6, 3.4, 8, 1.2, '#8e97a2') + HI('M11 8H17', 1.1, 0.8), 'rotate(45 15.5 9.6)');

B.clock =
  C(12, 12.6, 9.4, BLUE) +
  C(12, 12.6, 6.8, W, { sw: 1.4 }) +
  L('M12 7.7V8.6M12 16.6V17.5M7.1 12.6H8M16 12.6H16.9', '#9a8a74', 1.2) +
  L('M12 12.6V8.9M12 12.6L14.9 14.3', O, 1.8) +
  C(12, 12.6, 1.1, RED, { sw: 0 }) +
  HI('M4.6 10A8 8 0 0 1 8.2 5.4', 1.4, 0.7);

B.crown =
  P('M3.6 8.8L8 12.6L12 5.6L16 12.6L20.4 8.8L18.8 18.6H5.2Z', GOLD) +
  R(5, 16, 14, 4.4, 1.4, GOLD_D) +
  C(3.6, 8.2, 1.8, GOLD, { sw: 1.6 }) +
  C(12, 4.6, 2, GOLD, { sw: 1.6 }) +
  C(20.4, 8.2, 1.8, GOLD, { sw: 1.6 }) +
  C(12, 18.2, 1.3, RED, { sw: 1 }) +
  C(8, 18.2, 0.9, GOLD_L, { sw: 0 }) +
  C(16, 18.2, 0.9, GOLD_L, { sw: 0 }) +
  HI('M6.4 11.8L7 14.6', 1.2, 0.8);

B.gift =
  R(4, 11, 16, 10.2, 1.6, RED) +
  R(4, 17.6, 16, 3.6, 1.2, RED_D, { sw: 0 }) +
  R(4, 11, 16, 10.2, 1.6, 'none') +
  R(10.3, 11, 3.4, 10.2, 0.4, GOLD, { sw: 1.4 }) +
  R(2.8, 7.8, 18.4, 4.4, 1.6, '#ff6e60') +
  R(10.3, 7.8, 3.4, 4.4, 0.4, GOLD, { sw: 1.4 }) +
  P('M12 7.6C10.6 4.2 6.6 3.4 6.6 5.8C6.6 7.4 9.6 7.8 12 7.6Z', GOLD, { sw: 1.5 }) +
  P('M12 7.6C13.4 4.2 17.4 3.4 17.4 5.8C17.4 7.4 14.4 7.8 12 7.6Z', GOLD, { sw: 1.5 }) +
  C(12, 7.4, 1.4, GOLD_D, { sw: 1.3 }) +
  HI('M5.6 13V16', 1.2, 0.6);

B.info = C(12, 12, 9.6, BLUE) + P('M3.4 13.4A8.7 8.7 0 0 0 20.6 13.4A8.7 8.7 0 0 1 3.4 13.4Z', BLUE_D, { sw: 0 }) + C(12, 12, 9.6, 'none') + C(12, 7.3, 1.75, '#ffffff', { sw: 0 }) + R(10.5, 10.2, 3, 8.4, 1.3, '#ffffff', { sw: 0 });

B.close = K('M6.4 6.4L17.6 17.6M17.6 6.4L6.4 17.6', W, 3.6);

B.swap =
  P('M3.4 6H13.2V3.2L20.6 8L13.2 12.8V10H3.4Z', GOLD) +
  P('M20.6 14H10.8V11.2L3.4 16L10.8 20.8V18H20.6Z', W) +
  HI('M4.8 7.4H11', 1.1, 0.8);

B.best =
  K('M3.6 20.6L13 11.2', '#5a4a6a', 2.4) +
  L('M3.6 20.6L5.6 18.6', '#ffffff', 2.4) +
  P(starPath(15.6, 8.2, 6.6, 3), GOLD, { sw: 1.8 }) +
  twinkle(5.4, 6, 3, W) +
  twinkle(20.2, 16.8, 2.4, W) +
  HI('M14 6.4L15.2 4.2', 1.1, 0.85);

B.people =
  P('M10.6 20.8C10.6 16.2 12.6 13.4 16 13.4C19.4 13.4 21.4 16.2 21.4 20.8Z', BLUE) +
  C(16, 8.6, 3.6, SKIN) +
  P('M12.4 8.2C12.4 5.8 14 4.8 16 4.8C18 4.8 19.6 5.8 19.6 8C18.4 6.8 15 6.6 12.4 8.2Z', '#6a4430', { sw: 1.2 }) +
  P('M2.6 21.4C2.6 16.6 5 13.8 8.6 13.8C12.2 13.8 14.6 16.6 14.6 21.4Z', RED) +
  C(8.6, 9.2, 4, SKIN) +
  P('M4.6 8.6C4.6 6 6.4 5 8.6 5C10.8 5 12.6 6.2 12.6 8.4C10.6 7.6 7.4 7 4.6 8.6Z', '#e0a43a', { sw: 1.2 }) +
  C(7.3, 9.8, 0.6, O, { sw: 0 }) +
  C(10, 9.8, 0.6, O, { sw: 0 });

B.zone =
  K('M5.4 21.4V4', '#e8e2d6', 1.6) +
  P('M6.6 4.4C10.2 2.8 13.4 6.4 19.8 4.6L17.4 9.4L19.8 14C13.4 15.8 10.2 12.2 6.6 13.8Z', RED) +
  P('M6.6 10.6C10.2 9 13.4 12.6 18.6 11.6L19.8 14C13.4 15.8 10.2 12.2 6.6 13.8Z', RED_D, { sw: 0, op: 0.7 }) +
  P('M6.6 4.4C10.2 2.8 13.4 6.4 19.8 4.6L17.4 9.4L19.8 14C13.4 15.8 10.2 12.2 6.6 13.8Z', 'none') +
  C(5.4, 3.2, 1.8, GOLD, { sw: 1.4 }) +
  HI('M8.4 6.2C10 5.4 11.6 6 12.8 6.8', 1.2, 0.75);

B.trophy =
  K('M7.2 6.2H4.4C4.4 10 5.6 11.8 8 12.2M16.8 6.2H19.6C19.6 10 18.4 11.8 16 12.2', GOLD, 1.6) +
  R(10.4, 13.6, 3.2, 4.6, 0.8, GOLD_D, { sw: 1.6 }) +
  R(6.6, 17.6, 10.8, 3.6, 1.2, WOOD) +
  P('M6.6 3.4H17.4V8.8C17.4 12.6 15.2 14.8 12 14.8C8.8 14.8 6.6 12.6 6.6 8.8Z', GOLD) +
  P('M14.6 3.4H17.4V8.8C17.4 12.6 15.2 14.8 12 14.8C14.4 13.4 14.6 11 14.6 8.8Z', GOLD_D, { sw: 0, op: 0.8 }) +
  P('M6.6 3.4H17.4V8.8C17.4 12.6 15.2 14.8 12 14.8C8.8 14.8 6.6 12.6 6.6 8.8Z', 'none') +
  P(starPath(11.6, 8.4, 2.8, 1.2), GOLD_L, { stroke: GOLD_D, sw: 0.9 }) +
  HI('M8.4 5.4V9', 1.2, 0.85);

B.arrowRight = P('M3.4 9.2H11.6V4.6Q11.6 3.8 12.4 4.4L20.8 11.4Q21.4 12 20.8 12.6L12.4 19.6Q11.6 20.2 11.6 19.4V14.8H3.4Q2.6 14.8 2.6 14V10Q2.6 9.2 3.4 9.2Z', W) + P('M3 13.2H11.6V17.8L20.4 12.8L12.4 19.6Q11.6 20.2 11.6 19.4V14.8H3.4Q2.6 14.8 2.6 14Z', '#e3d6bf', { sw: 0 }) + P('M3.4 9.2H11.6V4.6Q11.6 3.8 12.4 4.4L20.8 11.4Q21.4 12 20.8 12.6L12.4 19.6Q11.6 20.2 11.6 19.4V14.8H3.4Q2.6 14.8 2.6 14V10Q2.6 9.2 3.4 9.2Z', 'none');

// Classes.
B.brawler = classGlyph('brawler');
B.shooter = classGlyph('shooter');
B.medic = classGlyph('medic');
B.tinker = classGlyph('tinker');

// Vibes.
B.sunny = (() => {
  let s = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    s += `M${n(12 + Math.cos(a) * 8)} ${n(12 + Math.sin(a) * 8)}L${n(12 + Math.cos(a) * 10.2)} ${n(12 + Math.sin(a) * 10.2)}`;
  }
  return K(s, GOLD, 2.2, 1.6) + C(12, 12, 5.8, GOLD) + P('M7.4 13.6A5 5 0 0 0 16.6 13.6A5.8 5.8 0 0 1 7.4 13.6Z', GOLD_D, { sw: 0, op: 0.8 }) + C(12, 12, 5.8, 'none') + L('M9.8 13.2Q12 15 14.2 13.2', O, 1.1) + C(10, 11, 0.7, O, { sw: 0 }) + C(14, 11, 0.7, O, { sw: 0 }) + HI('M8.4 10A4 4 0 0 1 10.4 7.8', 1.1, 0.8);
})();

B.sleepy = K('M2.8 11.6H11.2L2.8 20.8H11.2', '#a98bff', 2.4, 1.7) + K('M13.8 3.2H20.8L13.8 10.4H20.8', '#a98bff', 2.1, 1.6);

B.showoff =
  P('M12 1.8Q13.4 9 20.8 11.6Q13.4 14.2 12 21.6Q10.6 14.2 3.2 11.6Q10.6 9 12 1.8Z', PINK) +
  P('M12 11.6Q13.4 14.2 20.8 11.6Q13.4 14.2 12 21.6Z', '#e0559a', { sw: 0, op: 0.8 }) +
  P('M12 1.8Q13.4 9 20.8 11.6Q13.4 14.2 12 21.6Q10.6 14.2 3.2 11.6Q10.6 9 12 1.8Z', 'none') +
  twinkle(19.4, 4.4, 2.6, GOLD) +
  twinkle(4.6, 19.2, 2, GOLD) +
  HI('M10.8 7.4Q11.4 5.6 11.8 4.4', 1.1, 0.85);

B.jumpy =
  // Motion lines are outlined light strokes, so they survive dark backgrounds too.
  K('M5 5.8Q3.2 8.6 5 11.4M19 5.8Q20.8 8.6 19 11.4', '#ffd9a8', 1.3, 1.1) +
  P('M9.4 3.6Q9.4 2.4 10.6 2.4H13.4Q14.6 2.4 14.6 3.6L13.6 14.4Q13.5 15.4 12.5 15.4H11.5Q10.5 15.4 10.4 14.4Z', ORANGE) +
  C(12, 19.4, 2.4, ORANGE) +
  HI('M11.2 4.6L11.8 11.4', 1.1, 0.8);

// Perks.
B.lucky = (() => {
  const leaves = [
    [8.2, 7.8],
    [15.8, 7.8],
    [8.2, 15.2],
    [15.8, 15.2],
  ];
  let s = K('M12 12Q14.2 17.6 18.6 21.4', '#2f9a52', 1.6);
  s += leaves.map(([x, y]) => C(x, y, 4.6, O, { sw: 0 })).join('');
  s += leaves.map(([x, y]) => C(x, y, 3.6, GREEN, { sw: 0 })).join('');
  s += leaves.map(([x, y]) => C(x - 1, y - 1.1, 1.2, '#8be6a6', { sw: 0 })).join('');
  s += L('M12 12L9.6 9.4M12 12L14.4 9.4M12 12L9.6 13.8M12 12L14.4 13.8', GREEN_D, 1);
  return s;
})();

B.cheer =
  K('M18.8 8.4Q20.6 11.6 18.8 14.8M21 6.4Q23.4 11.6 21 16.8', W, 1.2, 1) +
  R(5.6, 14.2, 3.2, 6, 1.2, '#5d6570') +
  P('M6.4 9.6L16.4 4.2Q17.4 3.8 17.4 4.8V18.4Q17.4 19.4 16.4 19L6.4 14Z', RED) +
  P('M10.6 7.4L13.2 6V17.4L10.6 16.1Z', W, { sw: 0 }) +
  P('M6.4 9.6L16.4 4.2Q17.4 3.8 17.4 4.8V18.4Q17.4 19.4 16.4 19L6.4 14Z', 'none') +
  R(2.6, 9.2, 4.4, 5.4, 1.4, '#e8e2d6') +
  E(17.4, 11.6, 1.6, 7, '#ff8f84', { sw: 1.6 });

B.scavenger =
  K('M14.4 14.4L20.4 20.4', WOOD, 3.4) +
  C(10, 10, 6.6, '#c9f0ff', { sw: 0 }) +
  K('M10 3.4A6.6 6.6 0 1 1 9.99 3.4', STEEL, 2) +
  P('M6.6 9.4A3.6 3.6 0 0 1 9.4 6.6', 'none', { stroke: '#ffffff', sw: 1.6, cap: true });

B.gemnose = (() => {
  // A round cartoon nose, front on (bridge, bulb, two wings), sniffing a gem through scent wiggles.
  const parts = (fill, o) => R(6.8, 2.8, 4.4, 10.4, 2.2, fill, o) + C(9, 14, 4.4, fill, o) + C(4.9, 16.6, 2.8, fill, o) + C(13.1, 16.6, 2.8, fill, o);
  return (
    K('M14.2 11.2Q15.2 10 16.2 11.2T18.2 11.2T20.2 11.2M16.4 14.2Q17.4 13 18.4 14.2T20.4 14.2T22.4 14.2', W, 1.2, 1) +
    parts(SKIN, { sw: SW * 2 }) +
    parts(SKIN, { sw: 0 }) +
    P('M11.2 5V12.6', 'none', { stroke: SKIN_D, sw: 1.2, cap: true }) +
    C(9.5, 13.1, 2.3, '#ff9eb5', { sw: 0, op: 0.9 }) +
    C(8.5, 12.2, 0.9, '#ffffff', { sw: 0 }) +
    E(7, 17.9, 1.25, 0.85, O, { sw: 0, tf: 'rotate(20 7 17.9)' }) +
    E(11, 17.9, 1.25, 0.85, O, { sw: 0, tf: 'rotate(-20 11 17.9)' }) +
    G(gemBody(), 'translate(13.6 0.2) scale(0.44)')
  );
})();

B.clutch =
  P('M14 2.2L4.6 13.6H11L9.4 21.8L19.6 9.6H13.2Z', GOLD) +
  P('M11 13.6L9.4 21.8L19.6 9.6H17.4L11.6 16.6Z', GOLD_D, { sw: 0, op: 0.75 }) +
  P('M14 2.2L4.6 13.6H11L9.4 21.8L19.6 9.6H13.2Z', 'none') +
  HI('M12.4 4.8L7.6 11.4', 1.2, 0.85);

// UI extras: skip (fast-forward), back, sound on / off, and tiny chests (chestSvg is too detailed under 30 px).
const tri = (x, y, w, h) => `M${n(x)} ${n(y + 1.4)}V${n(y + h - 1.4)}Q${n(x)} ${n(y + h)} ${n(x + 1.3)} ${n(y + h - 0.7)}L${n(x + w - 0.6)} ${n(y + h / 2 + 0.8)}Q${n(x + w + 0.6)} ${n(y + h / 2)} ${n(x + w - 0.6)} ${n(y + h / 2 - 0.8)}L${n(x + 1.3)} ${n(y + 0.7)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + 1.4)}Z`;
B.skip = [2.2, 11.6].map((x) => P(tri(x, 4.6, 10.2, 14.8), W) + P(`M${x} 15.4V${n(19.4 - 1.4)}Q${x} 19.4 ${n(x + 1.3)} 18.7L${n(x + 9.6)} 13.2L${n(x + 9)} 12.4Z`, '#e8dcc6', { sw: 0 }) + P(tri(x, 4.6, 10.2, 14.8), 'none')).join('');

B.back = G(B.arrowRight, 'translate(24 0) scale(-1 1)');

const speaker = R(2.6, 8.8, 5.2, 6.4, 1.4, '#e8e2d6') + P('M7.2 8.8L12.6 4.4Q13.8 3.6 13.8 5V19Q13.8 20.4 12.6 19.6L7.2 15.2Z', W) + P('M7.2 13.4L13.8 17V19Q13.8 20.4 12.6 19.6L7.2 15.2Z', '#e3d6bf', { sw: 0 }) + P('M7.2 8.8L12.6 4.4Q13.8 3.6 13.8 5V19Q13.8 20.4 12.6 19.6L7.2 15.2Z', 'none');
B.soundOn = K('M16.6 9Q18.2 12 16.6 15M19.4 6.4Q22.4 12 19.4 17.6', W, 1.5, 1.1) + speaker;
B.soundOff = speaker + K('M16.4 9.4L21.4 14.6M21.4 9.4L16.4 14.6', RED, 2.2, 1.5);

B.crate =
  R(3.8, 10, 16.4, 10.8, 1.4, WOOD) +
  R(3.8, 17.2, 16.4, 3.6, 1.2, WOOD_D, { sw: 0 }) +
  L('M4.8 14.4H19.2', WOOD_D, 1.2) +
  R(3.8, 10, 16.4, 10.8, 1.4, 'none') +
  P('M3.8 16.4L8.2 20.8H5.2Q3.8 20.8 3.8 19.4Z', STEEL, { sw: 1.3 }) +
  P('M20.2 16.4L15.8 20.8H18.8Q20.2 20.8 20.2 19.4Z', STEEL, { sw: 1.3 }) +
  R(2.6, 4.8, 18.8, 6, 1.6, '#e6b276') +
  R(2.6, 8.6, 18.8, 2.2, 0.6, WOOD, { sw: 0 }) +
  R(2.6, 4.8, 18.8, 6, 1.6, 'none') +
  R(10, 8, 4, 5, 1, STEEL, { sw: 1.4 }) +
  C(12, 10.8, 0.7, O, { sw: 0 });

B.vault =
  P('M2.8 10.6V9.4C2.8 5.4 6.6 3 12 3C17.4 3 21.2 5.4 21.2 9.4V10.6Z', RED) +
  L('M6 6.6Q8.4 4.8 12 4.6', '#ff8174', 1.4, { op: 0.9 }) +
  R(3.4, 11.4, 17.2, 9.4, 1.8, RED) +
  R(3.4, 17.6, 17.2, 3.2, 1.4, RED_D, { sw: 0 }) +
  R(3.4, 11.4, 17.2, 9.4, 1.8, 'none') +
  R(6.4, 3.8, 2.8, 17, 0, GOLD, { sw: 1.3 }) +
  R(14.8, 3.8, 2.8, 17, 0, GOLD, { sw: 1.3 }) +
  R(1.8, 9.4, 20.4, 3.4, 1.2, GOLD, { sw: 1.8 }) +
  C(12, 16.2, 3, GOLD, { sw: 1.6 }) +
  P('M12 16.2L12 13.8A2.4 2.4 0 0 1 14.4 16.2Z', RED, { sw: 0 }) +
  P('M12 16.2L12 18.6A2.4 2.4 0 0 1 9.6 16.2Z', BLUE, { sw: 0 }) +
  C(12, 16.2, 0.9, O, { sw: 0 });

/** Every icon as a ready <svg class="ico">. */
export const ICONS = Object.fromEntries(Object.entries(B).map(([k, v]) => [k, wrap(v)]));

/** The icon's markup, or '' for an unknown name. */
export const icon = (name) => (typeof name === 'string' && Object.hasOwn(ICONS, name) ? ICONS[name] : '');
