// Last Stop town UI icons: the BUILD drawer, placement, lot tags and the four decoration
// sets. Same chunky, outlined toy look as icons.js (which keeps the currencies, classes,
// vibes, perks and the general UI glyphs: none of those are repeated here). Every icon is a
// static SVG string on a 24×24 grid, wrapped as <svg class="ico" viewBox="0 0 24 24">,
// with no ids. Pure strings: safe to import in node tests.
//
//   import { townIcon, TOWN_ICONS } from './town-icons.js';
//   btn.innerHTML = `${townIcon('build')}<b>BUILD</b>`;
//
// Names: build, home, move, box, eraser, ok, cancel, path, rescue, cache, set, landmark,
// mystery, junk, wish, flag, undo, focus, rename, lot, and one per set: cozy, garden,
// party, lookout. setGlyph(set, { mono }) is the bare set glyph (decor-art's set badges
// draw it in white on the set colour).

const O = '#2a1b12';
const W = '#fffaf0';
const W_D = '#e3d6bf';
const RED = '#e8483f';
const RED_D = '#b52f2b';
const BLUE = '#3d8bf0';
const BLUE_D = '#2a6cc8';
const GREEN = '#36c06a';
const GREEN_D = '#23944f';
const LIME = '#5fd35a';
const LIME_D = '#2fa83a';
const GOLD = '#ffc23a';
const GOLD_D = '#e0960f';
const GOLD_L = '#ffe58a';
const PINK = '#ff7ab8';
const PINK_D = '#e0559a';
const MINT = '#7be0c3';
const LEMON = '#ffe066';
const WOOD = '#c98a4b';
const WOOD_D = '#9a6234';
const WOOD_L = '#e2ab6c';
const KRAFT = '#dba866';
const KRAFT_D = '#b9844a';
const STEEL = '#b4bcc6';
const STEEL_D = '#7d8691';
const TERRA = '#d9774a';
const TERRA_D = '#b35a35';
const SAND = '#f0d9a6';
const SAND_D = '#cfae74';
const GRASS = '#7ccf4a';
const GRASS_D = '#5fb03a';
const RUBBER = '#3d3540';

const SW = 2;

// --- tiny builders (24×24 user units), as in icons.js --------------------------------------------

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
const L = (d, color, w, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${o.butt ? 'butt' : 'round'}" stroke-linejoin="round"${o.op != null ? ` opacity="${o.op}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
/** An outlined stroke: a dark line under a coloured one. */
const K = (d, color, w, ow = SW) => L(d, O, w + ow * 2) + L(d, color, w);
const G = (inner, tf) => `<g transform="${tf}">${inner}</g>`;
const HI = (d, w = 1.5, op = 0.75) => L(d, '#ffffff', w, { op });
/** Fill + shade (no stroke) + outline on top: the house recipe for a flat shape. */
const S3 = (d, fill, shade, shadeD, op = 0.8) => P(d, fill, { sw: 0 }) + P(shadeD, shade, { sw: 0, op }) + P(d, 'none');

function twinkle(x, y, r, fill, o = {}) {
  const k = r * 0.22;
  const d = `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
  return P(d, fill, { sw: o.sw ?? 1.2 });
}
function starPath(cx, cy, ro, ri, pts = 5, rot = -90) {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const a = ((rot + (i * 180) / pts) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    d += `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
  }
  return d + 'Z';
}
/** A disc with a shaded lower-right rim (ok / cancel / badges). */
const disc = (fill, shade) => C(12, 12, 10, fill) + P('M2.6 13.6A9.6 9.6 0 0 0 21.4 13.6A9.4 9.4 0 0 1 2.6 13.6Z', shade, { sw: 0 }) + C(12, 12, 10, 'none') + HI('M5 8.6A8 8 0 0 1 8.4 4.8', 1.4, 0.7);

/** A tiny house (roof colour c) centred at (x, y), about 9 wide: used by focus. */
const tinyHouse = (x, y, c = RED) =>
  R(x - 3.2, y - 1, 6.4, 5, 0.6, W, { sw: 1.4 }) + P(`M${n(x - 4.8)} ${n(y - 0.6)}L${n(x)} ${n(y - 5)}L${n(x + 4.8)} ${n(y - 0.6)}Z`, c, { sw: 1.4 }) + R(x - 1, y + 1.2, 2, 2.8, 0.4, WOOD_D, { sw: 0 });

// --- set glyphs --------------------------------------------------------------------------------

/**
 * The bare glyph of a decoration set on the 24 grid: cozy = a mug of cocoa with steam,
 * garden = a sprout in a terracotta pot, party = a party hat with confetti, lookout =
 * binoculars. mono: white with dark detail lines (for a badge on the set colour).
 */
export function setGlyph(set, { mono = false } = {}) {
  const c = (col) => (mono ? W : col);
  const d = (col) => (mono ? W_D : col);
  switch (set) {
    case 'cozy': {
      const mug = 'M4.4 10.2H15.6V17.4Q15.6 21 12 21H8Q4.4 21 4.4 17.4Z';
      return (
        K('M7.4 7.4Q6.2 5.8 7.4 4.2Q8.6 2.6 7.4 1.6M11.6 7.4Q10.4 5.8 11.6 4.2Q12.8 2.6 11.6 1.6', W, 1.2, 1.1) +
        K('M15.4 12.2H17.2Q19.8 12.2 19.8 15Q19.8 17.8 17.2 17.8H15.2', c(WOOD), 1.8, 1.8) +
        S3(mug, c(RED), d(RED_D), 'M12.4 10.2H15.6V17.4Q15.6 21 12 21H9.6Q12.4 20 12.4 17Z') +
        (mono ? L('M6 13.6H14', O, 1.1, { op: 0.6 }) : R(4.6, 13, 10.8, 2.4, 0, W, { sw: 0 }) + L('M7 13V15.4M10 13V15.4M13 13V15.4', RED, 1)) +
        E(10, 10.2, 5.6, 1.5, mono ? W_D : '#8a4f2a', { sw: 1.4 }) +
        HI('M6.2 16V18.4', 1.2, 0.7)
      );
    }
    case 'garden': {
      const pot = 'M5.4 14.4H18.6L17 21.2Q16.8 22 16 22H8Q7.2 22 7 21.2Z';
      return (
        K('M12 15V8.6', c(GREEN_D), 1.8, 1.6) +
        P('M12 9.6C12 5.4 8.4 3 3.6 3.6C3.4 7.8 6.6 10.4 12 9.6Z', c(LIME)) +
        L('M11 9L6.4 5.8', mono ? O : LIME_D, 1, { op: 0.6 }) +
        P('M12 8.4C12.2 4.6 15.4 2 20.4 2.4C20.6 6.6 17.4 9 12 8.4Z', c(GREEN)) +
        L('M13 7.8L17.6 4.4', mono ? O : GREEN_D, 1, { op: 0.6 }) +
        S3(pot, c(TERRA), d(TERRA_D), 'M14.4 14.4H18.6L17 21.2Q16.8 22 16 22H13.6Q15 20.4 14.4 14.4Z') +
        R(4.4, 13, 15.2, 3.4, 1, c(TERRA), {}) +
        HI('M6.6 14.6H10', 1.1, 0.7)
      );
    }
    case 'party': {
      const hat = 'M12 2.8L19.2 19.4Q12 22.6 4.8 19.4Z';
      return (
        S3(hat, c(PINK), d(PINK_D), 'M12 2.8L19.2 19.4Q16.4 20.6 13.4 21Z') +
        (mono ? L('M8.6 13.2Q12 14.6 15.4 13.2M6.8 17.2Q12 19 17.2 17.2', O, 1.1, { op: 0.6 }) : P('M9.8 8L14.2 8Q12 9 9.8 8ZM7.9 12.4Q12 14.2 16.1 12.4L17.4 15.4Q12 17.6 6.6 15.4Z', LEMON, { sw: 0 }) + C(10.4, 18.2, 1, MINT, { sw: 0 }) + C(14.2, 17.6, 1, BLUE, { sw: 0 })) +
        P(hat, 'none') +
        C(12, 2.8, 2.4, c(GOLD), { sw: 1.6 }) +
        (mono ? '' : R(1.8, 5.6, 2.2, 3.6, 0.6, MINT, { sw: 1.1, tf: 'rotate(-25 2.9 7.4)' }) + R(19.8, 8.4, 2.2, 3.6, 0.6, LEMON, { sw: 1.1, tf: 'rotate(30 20.9 10.2)' }) + C(20.4, 3.6, 1.2, BLUE, { sw: 1 }) + C(3.4, 14.4, 1.1, GOLD, { sw: 1 })) +
        HI('M10.6 7.4L8.4 13', 1.1, 0.7)
      );
    }
    case 'lookout': {
      const barrel = (x) => R(x, 8.4, 7.6, 12.4, 3.2, c(BLUE)) + R(x + 1.2, 16.6, 5.2, 3.2, 1.4, d(BLUE_D), { sw: 0 }) + E(x + 3.8, 20.4, 3.4, 1.4, mono ? '#cfe4ff' : '#bfe6ff', { sw: 1.4 });
      return (
        R(4.8, 4.2, 4.6, 6.4, 1.4, c(STEEL)) +
        R(14.6, 4.2, 4.6, 6.4, 1.4, c(STEEL)) +
        barrel(3.2) +
        barrel(13.2) +
        R(9.6, 9.4, 4.8, 5, 1.2, c(STEEL_D)) +
        C(12, 6.6, 1.8, c(STEEL), { sw: 1.4 }) +
        HI('M5 10.4V15', 1.2, 0.7) +
        HI('M15 10.4V15', 1.2, 0.7)
      );
    }
    default:
      return C(12, 12, 6, mono ? W : '#c9b48f');
  }
}

// --- the icons ---------------------------------------------------------------------------------

const B = {};

// Hammer over a plank: BUILD.
B.build =
  G(R(2, 15.2, 20, 5.6, 1.4, WOOD_L) + R(2, 18.6, 20, 2.2, 0.8, WOOD, { sw: 0 }) + R(2, 15.2, 20, 5.6, 1.4, 'none') + L('M5 17.4H10M13 18.2H18', WOOD_D, 0.9, { op: 0.8 }) + C(16.6, 17.6, 0.9, STEEL_D, { sw: 0 }), 'rotate(-10 12 18)') +
  K('M5.2 14.2L13.6 5.8', WOOD, 2.8) +
  L('M5.8 13L12.6 6.2', '#f0c48e', 0.9, { op: 0.8 }) +
  G(R(10, 1.4, 11.6, 5.8, 1.6, STEEL) + R(10, 5.2, 11.6, 2, 0.8, STEEL_D, { sw: 0 }) + R(10, 1.4, 11.6, 5.8, 1.6, 'none') + R(18.8, 0.8, 3.2, 7, 1.2, '#8e97a2') + HI('M11.8 3H16.6', 1.1, 0.8), 'rotate(45 15.8 4.3)');

// A little house.
B.home =
  R(15.2, 3.4, 3.2, 5.4, 0.6, '#a9b0ba') +
  R(5, 10.4, 14, 10.8, 1.2, W) +
  R(12.8, 10.4, 6.2, 10.8, 0, W_D, { sw: 0 }) +
  R(5, 10.4, 14, 10.8, 1.2, 'none') +
  R(10, 14, 4.2, 7.2, 1, WOOD) +
  C(13.2, 17.8, 0.6, O, { sw: 0 }) +
  R(6.4, 12.6, 2.6, 2.6, 0.4, '#9fd8ff', { sw: 1.3 }) +
  P('M1.8 12L12 3L22.2 12L20.4 13.8L12 6.6L3.6 13.8Z', RED) +
  P('M12 3L22.2 12L20.4 13.8L12 6.6Z', RED_D, { sw: 0, op: 0.6 }) +
  P('M1.8 12L12 3L22.2 12L20.4 13.8L12 6.6L3.6 13.8Z', 'none') +
  HI('M4.2 11.4L11 5.4', 1.1, 0.7);

// Four arrows: move.
B.move = (() => {
  const d = 'M12 1.6L16.4 6.2H13.6V10.4H17.8V7.6L22.4 12L17.8 16.4V13.6H13.6V17.8H16.4L12 22.4L7.6 17.8H10.4V13.6H6.2V16.4L1.6 12L6.2 7.6V10.4H10.4V6.2H7.6Z';
  return P(d, W, { sw: 0 }) + P('M13.6 13.6H17.8V16.4L22.4 12L22 11.6L18.6 15V12.8H12.8V18.6H15L11.6 22L12 22.4L16.4 17.8H13.6Z', W_D, { sw: 0 }) + P(d, 'none');
})();

// A cardboard box with tape: the storage box.
B.box =
  P('M2.8 9.4H21.2V19.6Q21.2 21 19.8 21H4.2Q2.8 21 2.8 19.6Z', KRAFT) +
  P('M14.6 9.4H21.2V19.6Q21.2 21 19.8 21H14.6Z', KRAFT_D, { sw: 0, op: 0.75 }) +
  P('M2.8 9.4H21.2V19.6Q21.2 21 19.8 21H4.2Q2.8 21 2.8 19.6Z', 'none') +
  P('M2.8 9.4L5.4 4.4H18.6L21.2 9.4Z', '#f0c27f') +
  R(10, 9.4, 4, 5.8, 0, '#e9dcbf', { sw: 1.3 }) +
  P('M10.6 4.4H13.4L14 9.4H10Z', '#e9dcbf', { sw: 1.3 }) +
  R(5, 15.6, 4.4, 3, 0.4, W, { sw: 1.2 }) +
  L('M5.8 16.6H8.6M5.8 17.8H7.6', '#9a8a74', 0.7) +
  HI('M4.4 11.4V14.6', 1.2, 0.6);

// An eraser rubbing out, with crumbs.
B.eraser =
  G(R(2.4, 8.2, 19.2, 8.4, 2.2, PINK, { sw: 0 }) + R(12.4, 8.2, 9.2, 8.4, 0, BLUE, { sw: 0 }) + R(2.4, 13.8, 19.2, 2.8, 0, O, { sw: 0, op: 0.18 }) + R(2.4, 8.2, 19.2, 8.4, 2.2, 'none') + L('M12.4 8.2V16.6', O, 1.4) + HI('M4.4 10.4H10', 1.2, 0.75), 'rotate(-35 12 12.4)') +
  C(4.6, 20.4, 1.1, PINK, { sw: 1 }) +
  C(8.2, 21.6, 0.9, PINK, { sw: 1 }) +
  L('M11.4 21.4H20.4', '#bfb4a4', 1.4, { op: 0.9 });

// OK: a big check in a green disc. Cancel: a cross in a red disc.
B.ok = disc(LIME, LIME_D) + K('M6.6 12.4L10.4 16.2L17.6 8.2', W, 3, 1.4);
B.cancel = disc(RED, RED_D) + K('M8 8L16 16M16 8L8 16', W, 3, 1.4);

// A winding dirt path through grass.
B.path =
  P('M3 21.4Q1.6 17 4 14.6Q2.4 10 6.6 7.8Q7.4 3.4 12 2.6Q17.6 2 20.8 5Q22.6 9.6 20.6 13.6Q22.6 18.6 18.4 21.4Z', GRASS, { sw: 1.6 }) +
  K('M8.6 21.6C8.6 16.4 16.6 16.6 16.6 12.2C16.6 8.2 9.6 8.6 9.6 5.2C9.6 3.8 11 3 12.4 2.8', SAND, 3.6, 1.5) +
  L('M8.6 21.6C8.6 16.4 16.6 16.6 16.6 12.2C16.6 8.2 9.6 8.6 9.6 5.2', SAND_D, 0.9, { dash: '1.4 2.6' }) +
  L('M4.6 12.4l0.6 -1.4M5.6 12.4l-0.2 -1.6M19 18l0.6 -1.4M20 18l-0.2 -1.6', GRASS_D, 0.9);

// Rescue: a lifebuoy with its rope.
B.rescue = (() => {
  let s = L('M3.6 6.2Q1.4 12 3.8 17.6M20.4 6.2Q22.6 12 20.2 17.6', '#d8b878', 1.6, { dash: '2 1.6' });
  s += C(12, 12, 9.4, W, { sw: 0 });
  for (let i = 0; i < 4; i++) {
    const a0 = (i * Math.PI) / 2 + Math.PI / 4 - 0.42;
    const a1 = a0 + 0.84;
    const p = (a, r) => `${n(12 + Math.cos(a) * r)} ${n(12 + Math.sin(a) * r)}`;
    s += P(`M${p(a0, 9.4)}A9.4 9.4 0 0 1 ${p(a1, 9.4)}L${p(a1, 4.6)}A4.6 4.6 0 0 0 ${p(a0, 4.6)}Z`, RED, { sw: 0 });
  }
  s += P('M3.2 14A9 9 0 0 0 20.8 14A9.4 9.4 0 0 1 3.2 14Z', O, { sw: 0, op: 0.15 });
  s += C(12, 12, 9.4, 'none') + C(12, 12, 4.6, '#9fd8ff', { sw: 1.8 });
  s += HI('M5 9A7.6 7.6 0 0 1 8.4 5', 1.4, 0.8);
  return s;
})();

// Cache: a green cash box with a coin going in and a note peeking out.
B.cache =
  P('M15.4 7.6L19.6 5.2L21.4 8.8L17.4 10.6Z', '#9fe0a0', { sw: 1.3 }) +
  R(2.8, 9.4, 18.4, 11.6, 1.6, GREEN) +
  R(2.8, 17.4, 18.4, 3.6, 1.2, GREEN_D, { sw: 0 }) +
  R(2.8, 9.4, 18.4, 11.6, 1.6, 'none') +
  R(2.2, 8.6, 19.6, 3.6, 1.2, '#5fd38a') +
  R(8.6, 4.6, 6.8, 3.4, 1.4, 'none', { sw: 1.6 }) +
  R(9.8, 15, 4.4, 3.8, 0.8, GOLD, { sw: 1.4 }) +
  C(12, 16.6, 0.7, O, { sw: 0 }) +
  C(8, 5.6, 3.4, GOLD, { sw: 1.6 }) +
  C(8, 5.6, 1.9, 'none', { stroke: GOLD_D, sw: 0.9 }) +
  HI('M4.4 13V16', 1.2, 0.6);

// Set: a gift tag on a string with a star.
B.set =
  K('M5.6 6Q2.4 3.2 4.6 1.8Q6.6 0.8 7.8 4', '#e8483f', 1.2, 1.1) +
  G(P('M9 5.2H19.4Q20.8 5.2 20.8 6.6V17.4Q20.8 18.8 19.4 18.8H9L3.8 12Z', '#fff2cf') + P('M15.8 5.2H19.4Q20.8 5.2 20.8 6.6V17.4Q20.8 18.8 19.4 18.8H15.8Z', '#efd9a4', { sw: 0 }) + P('M9 5.2H19.4Q20.8 5.2 20.8 6.6V17.4Q20.8 18.8 19.4 18.8H9L3.8 12Z', 'none') + C(7.8, 12, 1.4, W, { sw: 1.3 }) + P(starPath(14.6, 12.2, 4, 1.8), PINK, { sw: 1.3 }), 'rotate(-40 12 12)');

// Landmark: a water tower with a star on top.
B.landmark =
  K('M7.4 22L9 14M16.6 22L15 14M8.2 18H15.8', STEEL, 1.4, 1.2) +
  R(5.2, 8.4, 13.6, 7, 3, BLUE) +
  R(12.6, 8.4, 6.2, 7, 0, BLUE_D, { sw: 0, op: 0.6 }) +
  R(5.2, 8.4, 13.6, 7, 3, 'none') +
  L('M6.4 11.6H17.6', '#8cc0ff', 1, { op: 0.8 }) +
  P('M4.6 8.8Q12 4.4 19.4 8.8Z', '#e8e2d6', { sw: 1.6 }) +
  P(starPath(12, 4.6, 4.2, 1.9), GOLD, { sw: 1.4 }) +
  twinkle(20.4, 3, 1.8, W, { sw: 1 });

// Mystery: a wooden sign with a big question mark.
B.mystery =
  K('M12 15.6V22', WOOD_D, 2.2, 1.6) +
  R(3.2, 2.6, 17.6, 13.8, 2.2, WOOD_L) +
  R(3.2, 12.4, 17.6, 4, 1.6, WOOD, { sw: 0 }) +
  R(3.2, 2.6, 17.6, 13.8, 2.2, 'none') +
  K('M9.2 7.6Q9.2 4.8 12 4.8Q14.8 4.8 14.8 7.4Q14.8 9 13.2 9.8Q12 10.4 12 11.8', W, 2, 1.3) +
  C(12, 14.2, 1.3, W, { sw: 1.2 });

// Junk: a heap with a tyre, a plank and a can.
B.junk =
  K('M5.4 13.2L17.6 4.6', WOOD, 2.4, 1.6) +
  R(13.8, 6.6, 5, 7, 1, '#9fd8ff', { sw: 1.5, tf: 'rotate(18 16.3 10.1)' }) +
  P('M1.8 21.4Q2.4 14.4 8 12.6Q12 10.6 16.6 12.8Q21.6 14.6 22.2 21.4Z', '#b98a5a') +
  P('M14 12.2Q21.6 14.6 22.2 21.4H16.4Q17.6 16 14 12.2Z', '#8f6640', { sw: 0, op: 0.8 }) +
  P('M1.8 21.4Q2.4 14.4 8 12.6Q12 10.6 16.6 12.8Q21.6 14.6 22.2 21.4Z', 'none') +
  E(8.4, 17.4, 4.6, 3.4, RUBBER, { sw: 1.6 }) +
  E(8.4, 17.4, 1.9, 1.2, '#7a707e', { sw: 1 }) +
  C(17.4, 18, 1.4, '#9fd8ff', { sw: 1.1 }) +
  L('M5 14.6Q6.4 13.6 8 13.6', '#ffffff', 1, { op: 0.5 });

// Wish: a heart in a speech bubble.
B.wish =
  P('M4.8 3H19.2Q21.6 3 21.6 5.4V14.2Q21.6 16.6 19.2 16.6H11.4L6.4 21.2V16.6H4.8Q2.4 16.6 2.4 14.2V5.4Q2.4 3 4.8 3Z', W) +
  P('M19.2 3Q21.6 3 21.6 5.4V14.2Q21.6 16.6 19.2 16.6H11.4L10.6 17.4V15.6H18.4Q20.4 15.6 20.4 13.6V4Z', W_D, { sw: 0 }) +
  P('M4.8 3H19.2Q21.6 3 21.6 5.4V14.2Q21.6 16.6 19.2 16.6H11.4L6.4 21.2V16.6H4.8Q2.4 16.6 2.4 14.2V5.4Q2.4 3 4.8 3Z', 'none') +
  P('M12 14.2C8.4 11.8 6.8 10 6.8 8.2C6.8 6.8 7.9 5.8 9.2 5.8C10.4 5.8 11.4 6.6 12 7.6C12.6 6.6 13.6 5.8 14.8 5.8C16.1 5.8 17.2 6.8 17.2 8.2C17.2 10 15.6 11.8 12 14.2Z', RED, { sw: 1.5 }) +
  E(9.2, 8.2, 1, 0.7, '#ffffff', { sw: 0, op: 0.8, tf: 'rotate(-35 9.2 8.2)' });

// Flag: a long pennant on a pole.
B.flag =
  K('M5 22V2.6', '#e8e2d6', 1.6, 1.4) +
  P('M6.2 3.4L21.4 8.6L6.2 13.8Z', BLUE) +
  P('M6.2 9.2L21.4 8.6L6.2 13.8Z', BLUE_D, { sw: 0, op: 0.6 }) +
  P('M6.2 6.6L13.8 8.6L6.2 10.6Z', W, { sw: 0 }) +
  P('M6.2 3.4L21.4 8.6L6.2 13.8Z', 'none') +
  C(5, 2.4, 1.8, GOLD, { sw: 1.3 });

// Undo: a curved arrow back.
B.undo =
  K('M8.4 8.4H14.2A5.6 5.6 0 0 1 14.2 19.6H8.6', W, 3, 1.6) +
  P('M2.8 8.4L9.6 2.8V14Z', W, { sw: 1.6 }) +
  P('M2.8 8.4L9.6 14V11.4Z', W_D, { sw: 0 });

// Focus: viewfinder corners round a little house (centre on home).
B.focus =
  K('M3 8.4V5Q3 3 5 3H8.4M15.6 3H19Q21 3 21 5V8.4M21 15.6V19Q21 21 19 21H15.6M8.4 21H5Q3 21 3 19V15.6', W, 2, 1.4) +
  tinyHouse(12, 12.2, RED);

// Rename: a pencil.
B.rename = G(
  R(3.6, 9, 4.4, 6, 1.4, PINK) +
    R(6.6, 9, 2.4, 6, 0, STEEL, { sw: 1.4 }) +
    R(8.8, 9, 9.4, 6, 0, GOLD, { sw: 0 }) +
    R(8.8, 12.4, 9.4, 2.6, 0, GOLD_D, { sw: 0 }) +
    R(8.8, 9, 9.4, 6, 0, 'none') +
    P('M18.2 9L22.6 12L18.2 15Z', '#f3d2a2') +
    P('M21 10.9L22.6 12L21 13.1Z', O, { sw: 0 }) +
    HI('M10 10.6H16.4', 1.1, 0.8),
  'rotate(-45 12 12)',
);

// Lot: a fenced square of grass.
B.lot = (() => {
  const top = 'M12 6.6L22 11.8L12 17L2 11.8Z';
  let s = P(top, GRASS) + P('M12 17L22 11.8V13.4L12 18.6Z', '#4f9a33') + P('M12 17L2 11.8V13.4L12 18.6Z', GRASS_D) + P('M2 11.8L12 17L22 11.8V13.4L12 18.6L2 13.4Z', 'none');
  // Back rails, then posts all round, then the front rails.
  s += L('M2.4 9.4L12 4.4L21.6 9.4', O, 2.4) + L('M2.4 9.4L12 4.4L21.6 9.4', W, 1);
  const posts = [
    [2.4, 11.8],
    [7.2, 9.3],
    [12, 6.8],
    [16.8, 9.3],
    [21.6, 11.8],
  ];
  s += posts.map(([x, y]) => R(x - 1, y - 4.4, 2, 4.6, 0.6, W, { sw: 1.2 })).join('');
  s += L('M2.4 14.4L12 19.4L21.6 14.4', O, 2.4) + L('M2.4 14.4L12 19.4L21.6 14.4', W, 1);
  s += [[7.2, 19.3], [12, 21.8], [16.8, 19.3]].map(([x, y]) => R(x - 1, y - 4.4, 2, 4.6, 0.6, W, { sw: 1.2 })).join('');
  return s;
})();

// The four sets (full colour).
B.cozy = setGlyph('cozy');
B.garden = setGlyph('garden');
B.party = setGlyph('party');
B.lookout = setGlyph('lookout');

const wrap = (body) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

/** Every town icon as a ready <svg class="ico">. */
export const TOWN_ICONS = Object.fromEntries(Object.entries(B).map(([k, v]) => [k, wrap(v)]));

/** The icon's markup, or '' for an unknown name. */
export const townIcon = (name) => (typeof name === 'string' && Object.hasOwn(TOWN_ICONS, name) ? TOWN_ICONS[name] : '');
