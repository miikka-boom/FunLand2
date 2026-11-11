// Long Haul: the people. Every survivor of the cast, the drowsers and the dog,
// drawn as SVG fragments from the `look` in config.js. Pure string builders
// (no DOM), so the art test can check them in node.
//
// A figure's origin is between its feet, y goes up into the negatives, and it
// faces right; a person is about 100 units tall. Parts carry class names so
// the stylesheet can move them: .f-up bobs, .f-leg-a/.f-leg-b step, .f-arm-f
// (the arm with the weapon) and .f-arm-b turn around the shoulder, .f-tail
// wags. An arm is drawn hanging straight down and turned around the shoulder,
// so a pose is just two angles: 0 hangs, -90 points ahead, -165 is up in the
// air. Views change pose by drawing the figure again.

import { CAST, RARITIES } from './config.js';

export const OL = '#1b1730'; // the outline of everything
const SW = 3;

// --- Colour ----------------------------------------------------------------------------------

/** Mix a #rrggbb colour toward white (amt > 0) or toward the night (amt < 0). */
export function tone(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const to = amt >= 0 ? [255, 255, 255] : [27, 23, 48];
  const k = Math.min(1, Math.abs(amt));
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => Math.round(c + (to[i] - c) * k));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const r1 = (v) => Math.round(v * 10) / 10;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
const plain = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const line = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const circ = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${SW}"${extra}/>`;
const dot = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${OL}" stroke-width="${SW}"${extra}/>`;
const rect = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${OL}" stroke-width="${SW}" stroke-linejoin="round"${extra}/>`;

// --- Poses -----------------------------------------------------------------------------------

/** front / back arm angles, the face, and whether the weapon is in hand. */
const POSES = {
  idle: { f: -16, b: 12, mood: 'normal', prop: true },
  walk: { f: -24, b: 20, mood: 'normal', prop: true },
  aim: { f: -90, b: -62, mood: 'grit', prop: true },
  windup: { f: -158, b: 24, mood: 'grit', prop: true },
  strike: { f: 14, b: 34, mood: 'grit', prop: true },
  cheer: { f: -164, b: 164, mood: 'happy', prop: true },
  carry: { f: -172, b: 172, mood: 'happy', prop: false },
  down: { f: -40, b: 50, mood: 'ko', prop: true },
  card: { f: -16, b: 12, mood: 'normal', prop: false },
  wave: { f: -16, b: 150, mood: 'happy', prop: true },
};

// --- Weapons ---------------------------------------------------------------------------------
// Drawn in the arm's own space: the shoulder is (0,0), the hand (0,20), the arm
// hangs along +y. Guns point the way the arm points. Things you swing stick out
// of the fist at 45 degrees, so a raised arm winds them up behind the head.

const WOOD = '#b9824e';
const STEEL = '#9aa5bb';
const DARK = '#3a3550';

const swung = (inner) => `<g transform="translate(0,20) rotate(-45)">${inner}</g>`;

const PROPS = {
  rifle: () =>
    path('M-3,2 L4,2 L4,26 L-4,28 Z', WOOD) + rect(-2.5, 24, 5, 38, 2, DARK) + rect(-5.5, 30, 4, 12, 2, STEEL) + plain('M-2.5,58 h5 v4 h-5z', '#15121f'),
  revolver: () => path('M-4,14 L5,14 L5,24 L-4,24 Z', '#6b4a35') + rect(-4, 22, 9, 22, 3, STEEL) + rect(-6, 25, 13, 9, 4, tone(STEEL, -0.25)) + plain('M-1.5,44 h4 v2 h-4z', '#15121f'),
  stapler: () => rect(-6, 13, 13, 12, 3, '#3a3550') + rect(-5, 22, 11, 20, 3, '#e8483f') + rect(-3, 38, 7, 7, 2, STEEL) + line('M-5,30 h11', tone('#e8483f', -0.3), 2),
  tcannon: () =>
    rect(-8, 4, 16, 14, 5, '#4a8fe8') +
    rect(-7, 14, 14, 40, 5, '#f4f1ea') +
    line('M-7,24 h14 M-7,34 h14 M-7,44 h14', '#e8483f', 3.5) +
    rect(-9, 50, 18, 7, 3, '#4a8fe8') +
    rect(-12, 16, 6, 16, 3, STEEL),
  nailgun: () =>
    line('M6,10 q12,6 4,16 q-8,8 6,14', '#2fb7a6', 3) +
    rect(-7, 10, 14, 16, 4, '#5a4a78') +
    rect(-5, 24, 10, 24, 3, STEEL) +
    rect(-8, 30, 16, 8, 3, '#f0b429') +
    dot(0, 17, 3, '#62f0dc') +
    plain('M-1.5,48 h3 v6 h-3z', '#15121f'),
  harpoon: () =>
    line('M0,12 V70', '#15121f', 6) +
    line('M0,12 V70', STEEL, 3) +
    path('M0,78 L-6,66 L0,69 L6,66 Z', STEEL) +
    rect(-5, 10, 10, 24, 3, '#2f4a6b') +
    rect(-7, 20, 14, 7, 3, '#f2c230') +
    line('M5,34 q8,10 0,20', '#e9e4d6', 2),
  crowbar: () => swung(line('M-8,0 H40 q8,0 8,-9', OL, 9) + line('M-8,0 H40 q8,0 8,-9', '#e8483f', 4) + line('M-8,0 H4', '#3a4a7a', 4)),
  hockey: () => swung(line('M-8,0 H52 l10,-10', OL, 9) + line('M-8,0 H52', '#f1e6c8', 4) + line('M52,0 l10,-10', '#22202e', 5) + line('M-8,0 H2', '#22202e', 4) + line('M30,0 H38', '#e8483f', 4)),
  golfclub: () => swung(line('M-8,0 H52', OL, 7) + line('M-8,0 H52', STEEL, 3) + path('M50,-3 h8 q5,0 5,5 v6 h-9 q-4,0 -4,-4 z', tone(STEEL, 0.3)) + line('M-8,0 H6', '#22202e', 4)),
  shovel: () => swung(line('M-10,0 H44', OL, 9) + line('M-10,0 H44', WOOD, 4) + path('M42,-9 h12 q10,2 12,9 q-2,7 -12,9 h-12 z', STEEL) + line('M46,0 h12', tone(STEEL, -0.25), 2) + path('M-16,-5 h7 v10 h-7 z', WOOD)),
  wrench: () => swung(line('M-8,0 H36', OL, 11) + line('M-8,0 H36', '#c9722b', 6) + path('M34,-8 h10 l6,4 v-6 h6 v20 h-6 v-6 l-6,4 h-10 z', STEEL)),
};

// --- Heads -----------------------------------------------------------------------------------
// The head is an ellipse at (0,-78), 21 wide and 20 high. Hair comes in a part
// behind the head and a part on top of it.

const HEAD = { x: 0, y: -78, rx: 21, ry: 20 };
const CAP = 'M-21,-80 Q-22,-100 0,-100 Q22,-100 21,-80'; // the top of the skull, ear to ear

const HAIR = {
  puff: (c) => ({
    back: circ(-2, -103, 13, c),
    front: path(`${CAP} Q12,-91 0,-91 Q-12,-91 -21,-80 Z`, c) + dot(-6, -108, 3, tone(c, 0.18)),
  }),
  messy: (c) => ({
    front: path('M-21,-79 Q-25,-92 -17,-98 L-19,-107 L-9,-101 L-5,-111 L3,-102 L11,-110 L14,-100 L23,-101 L20,-91 Q23,-86 21,-79 Q14,-91 4,-88 Q-8,-92 -21,-79 Z', c),
  }),
  pony: (c) => ({
    back: path('M-17,-92 Q-36,-98 -38,-80 Q-39,-66 -30,-60 Q-33,-74 -22,-80 Z', c) + rect(-24, -93, 8, 6, 2.5, '#2fb7a6'),
    front: path(`${CAP} Q16,-88 6,-91 Q-8,-93 -21,-80 Z`, c),
  }),
  combover: (c) => ({
    front: path('M-20,-86 Q-12,-101 8,-99 Q18,-97 20,-88 Q8,-95 -6,-92 Q-14,-90 -20,-86 Z', c) + line('M-10,-94 Q2,-98 14,-93', tone(c, -0.25), 1.6),
  }),
  bob: (c) => ({
    back: path('M-24,-84 Q-26,-102 0,-102 Q26,-102 24,-84 L25,-62 Q14,-58 12,-66 L-12,-66 Q-14,-58 -25,-62 Z', c),
    front: path(`${CAP} Q10,-88 -2,-90 Q-12,-90 -21,-80 Z`, c),
  }),
  bald: () => ({ front: line('M-9,-95 Q-3,-98 3,-96', '#ffffff', 2, ' opacity="0.45"') }),
  long: (c) => ({
    back: path('M-23,-84 Q-26,-102 0,-102 Q26,-102 23,-84 L26,-50 Q18,-46 14,-52 L-14,-52 Q-18,-46 -26,-50 Z', c),
    front: path(`${CAP} Q12,-90 0,-91 Q-12,-90 -21,-80 Z`, c),
  }),
  buzz: (c) => ({ front: path(`${CAP} Q12,-93 0,-94 Q-12,-93 -21,-80 Z`, c, ' opacity="0.9"') }),
  afro: (c) => ({
    back: circ(0, -88, 30, c) + dot(-12, -106, 4, tone(c, 0.14)) + dot(10, -110, 3, tone(c, 0.14)),
    front: path(`${CAP} Q12,-89 0,-90 Q-12,-89 -21,-80 Z`, c),
  }),
  hood: (c) => ({
    back: path('M-26,-72 Q-30,-106 0,-106 Q30,-106 26,-72 Q26,-58 16,-56 L-16,-56 Q-26,-58 -26,-72 Z', c),
    front: path('M-22,-78 Q-24,-102 0,-102 Q24,-102 22,-78 Q16,-93 0,-93 Q-16,-93 -22,-78 Z', tone(c, 0.12)),
  }),
  short: (c) => ({ front: path(`${CAP} Q14,-90 0,-92 Q-14,-90 -21,-80 Z`, c) }),
};

/** Eyes and mouth for a mood, at the face's centre (0,-78). */
function face(mood, skin) {
  const ex = [-7, 9];
  const ey = -78;
  let eyes = '';
  let mouth = '';
  let brows = '';
  if (mood === 'ko') {
    eyes = ex.map((x) => line(`M${x - 3},${ey - 3} l6,6 M${x + 3},${ey - 3} l-6,6`, OL, 2.4)).join('');
    mouth = line('M-5,-67 q3,-3 6,0 q3,3 6,0', OL, 2.2);
  } else if (mood === 'happy') {
    eyes = ex.map((x) => line(`M${x - 3.5},${ey} q3.5,-5 7,0`, OL, 2.6)).join('');
    mouth = path('M-6,-70 Q1,-60 9,-70 Z', '#7a2233', ' stroke-width="2.2"') + plain('M-2,-66 q3,2.5 7,0 q-3,3 -7,0z', '#ff8a8a');
  } else {
    eyes = ex.map((x) => dot(x, ey, 2.9, OL) + dot(x + 1, ey - 1.1, 0.95, '#fff')).join('');
    if (mood === 'grit') {
      brows = line(`M${ex[0] - 5},${ey - 8} l8,3 M${ex[1] + 5},${ey - 8} l-8,3`, OL, 2.6);
      mouth = path('M-4,-70 h10 q1,5 -5,5 q-6,0 -5,-5 z', '#7a2233', ' stroke-width="2.2"') + plain('M-3,-70 h8 v1.6 h-8z', '#fff');
    } else mouth = line('M-4,-69 q5,4.5 10,0', OL, 2.4);
  }
  const blush = mood === 'ko' ? '' : dot(-13, -72, 3.4, '#ff6b7a', ' opacity="0.32"') + dot(15, -72, 3.4, '#ff6b7a', ' opacity="0.32"');
  return blush + brows + eyes + mouth + plain('M-15,-91 q5,-6 13,-6', 'none', ` stroke="${tone(skin, 0.35)}" stroke-width="2.5" stroke-linecap="round" opacity="0.7"`);
}

/** Things worn on the head or face, drawn after the hair. */
const HEADGEAR = {
  glasses: () => circ(-7, -78, 6.5, '#dff3ff', ' stroke-width="2.2" fill-opacity="0.35"') + circ(9, -78, 6.5, '#dff3ff', ' stroke-width="2.2" fill-opacity="0.35"') + line('M-0.5,-78 h3', OL, 2.2),
  freckles: () => [-14, -11, -12.5, 13, 16, 14.5].map((x, i) => dot(x, -73 + (i % 3 === 2 ? 2.2 : 0), 0.9, '#b0603a')).join(''),
  moustache: (l) => path('M1,-71 Q-6,-75 -12,-70 Q-8,-64 1,-67 Q10,-64 14,-70 Q8,-75 1,-71 Z', l.hairColor, ' stroke-width="2.2"'),
  brimhat: () => ell(0, -95, 31, 7, '#2c2a3a') + path('M-17,-96 Q-18,-116 0,-116 Q18,-116 17,-96 Z', '#3a3748') + line('M-16.5,-99 Q0,-95 16.5,-99', '#8a5a34', 3),
  weldmask: () => path('M-17,-93 Q-19,-118 0,-118 Q19,-118 17,-93 Q0,-88 -17,-93 Z', '#5d6680') + rect(-10, -110, 20, 8, 3, '#1b1730', ' stroke-width="2"') + plain('M-8,-108 h8 v2 h-8z', '#62f0dc', ' opacity="0.8"') + dot(-17, -94, 2.6, STEEL) + dot(17, -94, 2.6, STEEL),
  headphones: () => line('M-27,-80 Q-30,-118 0,-118 Q30,-118 27,-80', OL, 8) + line('M-27,-80 Q-30,-118 0,-118 Q30,-118 27,-80', '#e8483f', 3.5) + rect(-33, -89, 11, 19, 5, '#e8483f') + rect(22, -89, 11, 19, 5, '#e8483f'),
  goggles: () =>
    line('M-21,-80 h42', '#3a3048', 6) +
    circ(-8, -80, 8, '#3a3048') +
    circ(10, -80, 8, '#3a3048') +
    dot(-8, -80, 4.8, '#62f0dc') +
    dot(10, -80, 4.8, '#62f0dc') +
    dot(-6.4, -81.6, 1.4, '#eafffb') +
    dot(11.6, -81.6, 1.4, '#eafffb') +
    path('M-17,-71 Q1,-60 19,-71 Q19,-58 1,-57 Q-17,-58 -17,-71 Z', '#e8643f'),
  captain: (l) =>
    path('M-15,-66 Q1,-52 17,-66 Q16,-72 1,-70 Q-14,-72 -15,-66 Z', l.hairColor, ' stroke-width="2.2"') +
    path('M-19,-93 Q-22,-110 0,-112 Q22,-110 19,-93 Z', '#f4f1ea') +
    path('M-20,-93 Q0,-99 20,-93 L24,-88 Q0,-95 -24,-88 Z', '#22304a') +
    dot(0, -103, 3.4, '#f2c230') +
    line('M0,-106 v6 M-2.4,-102 h4.8', '#22304a', 1.4),
};

/** Things worn on the body, drawn over the torso. `w` is the torso's half width. */
const BODYGEAR = {
  journal: () => rect(-12, -50, 11, 14, 2, '#8a3f3f', ' stroke-width="2"') + line('M-9,-46 h5 M-9,-42 h5', '#f1e6c8', 1.4) + line('M3,-56 L11,-26', '#3a3550', 3),
  hood: (l) => line('M-4,-54 v10 M5,-54 v10', '#f4f1ea', 2) + path('M-7,-40 h14 v9 q-7,3 -14,0 z', tone(l.top, -0.18), ' stroke-width="2"'),
  freckles: (l) => path('M-16,-56 L-7,-56 L-9,-26 L-16,-26 Z', tone(l.top, 0.28), ' stroke-width="2"') + path('M16,-56 L7,-56 L9,-26 L16,-26 Z', tone(l.top, 0.28), ' stroke-width="2"') + dot(-11, -46, 1.6, '#f2c230'),
  tie: () => path('M-1.5,-56 h5 l2,5 l-3.5,22 l-4,-4 l1.5,-18 z', '#e8483f', ' stroke-width="2"') + line('M-9,-56 L-4,-40 M11,-56 L6,-40', '#4a8fe8', 1.8) + rect(-9, -42, 9, 7, 1.5, '#f2c230', ' stroke-width="1.6"'),
  glasses: (l) => line('M1,-56 V-26', tone(l.top, -0.25), 2) + dot(1, -48, 1.5, '#f4f1ea') + dot(1, -40, 1.5, '#f4f1ea') + dot(1, -32, 1.5, '#f4f1ea'),
  moustache: (l) => path('M-6,-50 l5,-5 l5,5 l5,-5 l5,5', 'none', ` stroke="${tone(l.top, 0.4)}" stroke-width="2.4"`) + dot(-10, -38, 2.2, tone(l.top, 0.4)) + dot(10, -34, 2.2, tone(l.top, 0.4)) + dot(1, -30, 2.2, tone(l.top, 0.4)),
  brimhat: () => line('M-12,-56 L11,-27', '#8a5a34', 3) + rect(-13, -36, 9, 10, 2, '#f2c230', ' stroke-width="2"') + dot(-8.5, -31, 2.2, '#fff6c8'),
  weldmask: (l) => path('M-12,-58 v20 q12,7 24,0 v-20', 'none', ` stroke="${tone(l.top, -0.35)}" stroke-width="4"`) + rect(-8, -44, 16, 12, 2, tone(l.top, -0.3), ' stroke-width="2"'),
  headphones: () => path('M-11,-56 L1,-43 L13,-56', 'none', ' stroke="#2f2a4a" stroke-width="3"') + plain('M-9,-40 h20 v5 h-20z', '#2f2a4a') + `<text x="1" y="-35.6" text-anchor="middle" font-size="5.2" font-weight="900" font-family="ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif" fill="#f0b429">98.4</text>`,
  goggles: () => circ(1, -42, 7.5, '#f0b429', ' stroke-width="2"') + dot(1, -42, 3.2, '#1b1730') + dot(1, -42, 1.3, '#62f0dc') + [0, 60, 120, 180, 240, 300].map((a) => `<rect x="-1.6" y="-11.5" width="3.2" height="4" fill="#f0b429" stroke="${OL}" stroke-width="1" transform="translate(1,-42) rotate(${a})"/>`).join(''),
  captain: () => line('M1,-56 V-26', '#b8901a', 2) + dot(-6, -48, 1.8, '#22304a') + dot(-6, -38, 1.8, '#22304a') + path('M-16,-58 q8,7 17,2 q9,5 15,-2', 'none', ' stroke="#22304a" stroke-width="3"'),
};

// --- People ----------------------------------------------------------------------------------

function arm(side, angle, sleeve, skin, propSvg = '', w) {
  const x = side === 'f' ? w - 3 : -(w - 3);
  const sl = side === 'f' ? sleeve : tone(sleeve, -0.22);
  return (
    `<g transform="translate(${x},-50)"><g class="f-arm f-arm-${side}" transform="rotate(${angle})">` +
    (side === 'f' ? '' : propSvg) +
    line('M0,1 V19', OL, 14) +
    line('M0,1 V19', sl, 8.5) +
    (side === 'f' ? propSvg : '') +
    circ(0, 21, 5.6, side === 'f' ? skin : tone(skin, -0.14), ' stroke-width="2.6"') +
    `</g></g>`
  );
}

function leg(side, color, w) {
  const x = side === 'a' ? w * 0.48 : -w * 0.48;
  const c = side === 'a' ? color : tone(color, -0.2);
  return `<g transform="translate(${r1(x)},-27)"><g class="f-leg f-leg-${side}">${rect(-5.6, 0, 11.2, 23, 5, c)}${ell(2, 25, 8.2, 4.6, side === 'a' ? '#2c2740' : '#231f35', ' stroke-width="2.6"')}</g></g>`;
}

/**
 * A person from a look: { skin, hair, hairColor, top, bottom, prop, extra, build }.
 * `pose` is a key of POSES; `carry` draws a crate held overhead.
 */
function person(l, pose, opts = {}) {
  const p = POSES[pose] || POSES.idle;
  const w = l.build === 'big' ? 20 : 16;
  const mood = opts.mood || p.mood;
  const hair = (HAIR[l.hair] || HAIR.short)(l.hairColor || '#2b1d1a');
  const prop = p.prop && l.prop && PROPS[l.prop] ? PROPS[l.prop]() : '';
  const torso =
    rect(-w, -58, w * 2, 35, 11, l.top) +
    plain(`M${-w + 1.5},-48 q0,-8 8,-8.5 h-3 q-6,2 -5,26 q-1.5,-9 0,-17.5z`, tone(l.top, -0.2), ' opacity="0.55"') +
    plain(`M${w - 6},-54 q4,2 4,10 q-1,-7 -4,-10z`, tone(l.top, 0.3), ' opacity="0.8"') +
    (BODYGEAR[l.extra] ? BODYGEAR[l.extra](l) : '');
  const head =
    `<g class="f-head">` +
    (hair.back || '') +
    ell(HEAD.x, HEAD.y, HEAD.rx, HEAD.ry, l.skin) +
    plain('M-19,-72 q4,12 19,14 q-14,2 -19,-14z', tone(l.skin, -0.16), ' opacity="0.6"') +
    face(mood, l.skin) +
    (hair.front || '') +
    (HEADGEAR[l.extra] ? HEADGEAR[l.extra](l) : '') +
    `</g>`;
  const tall = l.extra === 'brimhat' || l.hair === 'afro' || l.extra === 'weldmask' || l.hair === 'puff';
  const crate = pose === 'carry' ? `<g class="f-crate" transform="translate(1,${tall ? -134 : -119}) scale(0.5)">${miniCrate()}</g>` : '';
  const up = `<g class="f-up">${arm('b', p.b, l.top, l.skin, '', w)}${torso}${head}${arm('f', p.f, l.top, l.skin, prop, w)}${crate}</g>`;
  const all = leg('b', l.bottom, w) + leg('a', l.bottom, w) + up;
  if (pose === 'down') return shadow(40, 7) + `<g class="f-all" transform="translate(40,-13) rotate(-82)">${all}</g>${dizzy(-38, -52)}`;
  return shadow(w + 9, 6.5) + `<g class="f-all">${all}</g>`;
}

const shadow = (rx, ry) => `<ellipse class="f-shadow" cx="0" cy="2" rx="${rx}" ry="${ry}" fill="#0c0a1c" opacity="0.38"/>`;

/** Little stars going round a head that has had enough. */
function dizzy(x, y) {
  const star = (dx, dy) => `<path transform="translate(${dx},${dy}) scale(0.5)" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.4 L5.6,8 L0,4.2 L-5.6,8 L-3.8,1.4 L-9,-2.8 L-2.6,-2.8 Z" fill="#ffd36b" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
  return `<g class="f-dizzy" transform="translate(${x},${y}) scale(1,0.5)"><g class="f-dizzy-spin">${star(-15, 0)}${star(15, 0)}${star(0, -15)}${star(0, 15)}</g></g>`;
}

/** The crate someone carries home (also the base of crate-art's closed crate). */
export function miniCrate() {
  return (
    rect(-40, -34, 80, 68, 8, '#7d8a4f') +
    plain('M-37,-31 h74 v10 h-74z', tone('#7d8a4f', 0.22), ' opacity="0.8"') +
    plain('M-37,22 h74 v9 h-74z', tone('#7d8a4f', -0.3), ' opacity="0.7"') +
    line('M-40,-12 H40 M-40,12 H40', tone('#7d8a4f', -0.35), 3) +
    rect(-46, -6, 12, 12, 3, '#2c2740', ' stroke-width="2.6"') +
    rect(34, -6, 12, 12, 3, '#2c2740', ' stroke-width="2.6"') +
    `<path d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.4 L5.6,8 L0,4.2 L-5.6,8 L-3.8,1.4 L-9,-2.8 L-2.6,-2.8 Z" transform="scale(1.5)" fill="#f4f1ea" opacity="0.9"/>`
  );
}

// --- Biscuit ---------------------------------------------------------------------------------

function dog(l, pose, opts = {}) {
  const fur = l.fur;
  const dk = l.furDark;
  const lt = tone(fur, 0.45);
  const mood = opts.mood || (POSES[pose] || POSES.idle).mood;
  const legAt = (x, cls, c) => `<g transform="translate(${x},-15)"><g class="f-leg ${cls}">${rect(-4.6, 0, 9.2, 14, 4, c)}</g></g>`;
  const eye = mood === 'ko' ? line('M22,-49 l5,5 M27,-49 l-5,5', OL, 2.2) : mood === 'happy' ? line('M21,-45 q3,-4.5 6,0', OL, 2.4) : dot(24.5, -46, 2.7, OL) + dot(25.4, -47, 0.9, '#fff');
  const tongue = mood === 'happy' || pose === 'walk' ? path('M33,-33 q1,8 5,7 q3,-1 1,-8 z', '#ff7d8f', ' stroke-width="2"') : '';
  const body =
    `<g transform="translate(-22,-29)"><g class="f-tail">${line('M0,0 q-12,-4 -10,-18', OL, 9)}${line('M0,0 q-12,-4 -10,-18', fur, 4.5)}${line('M-9.6,-14 q-0.6,-2 -0.4,-4', lt, 4.5)}</g></g>` +
    legAt(-15, 'f-leg-b', dk) +
    legAt(13, 'f-leg-b', dk) +
    ell(0, -25, 25, 14, fur) +
    plain('M-18,-17 q18,10 36,0 q-18,5 -36,0z', lt, ' opacity="0.9"') +
    plain('M-12,-36 q8,-5 16,-1 q-8,-1 -16,1z', dk, ' opacity="0.6"') +
    legAt(-8, 'f-leg-a', fur) +
    legAt(20, 'f-leg-a', fur);
  const head =
    `<g class="f-head">` +
    path('M9,-52 Q2,-58 4,-40 Q8,-34 14,-40 Z', dk) +
    circ(22, -43, 15, fur) +
    ell(34, -38, 9.5, 7.5, lt, ' stroke-width="2.6"') +
    ell(41, -41, 3.6, 2.8, OL, ' stroke-width="1"') +
    eye +
    line('M34,-35 q3,3 6,0', OL, 2) +
    tongue +
    path('M27,-57 Q38,-60 33,-44 Q28,-42 24,-50 Z', dk) +
    `</g>`;
  const bandana = path('M8,-32 Q16,-26 26,-30 L18,-17 Z', l.top, ' stroke-width="2.4"');
  const crate = pose === 'carry' ? `<g class="f-crate" transform="translate(-2,-58) scale(0.36)">${miniCrate()}</g>` : '';
  const all = `<g class="f-up">${body}${bandana}${head}${crate}</g>`;
  if (pose === 'down') return shadow(30, 6) + `<g class="f-all" transform="translate(0,-6) rotate(180 0 -22)">${all}</g>${dizzy(-22, -38)}`;
  return shadow(30, 6) + `<g class="f-all">${all}</g>`;
}

// --- The cast --------------------------------------------------------------------------------

/**
 * A survivor as an SVG fragment (origin between the feet, facing right).
 * pose: idle | walk | aim | windup | strike | cheer | carry | down | wave | card
 */
export function figureSvg(id, pose = 'idle', opts = {}) {
  const c = CAST[id];
  if (!c) return '';
  const inner = c.look.dog ? dog(c.look, pose, opts) : person(c.look, pose, opts);
  return `<g class="fig fig-${id} pose-${pose}${c.look.dog ? ' fig-dog' : ''}">${inner}</g>`;
}

/** How tall a figure stands (for name tags and speech bubbles). */
export const figureHeight = (id) => (CAST[id] && CAST[id].look.dog ? 62 : CAST[id] && (CAST[id].look.extra === 'brimhat' || CAST[id].look.hair === 'afro') ? 122 : 104);

/**
 * A face for a card: a whole <svg>, cropped to head and shoulders. The frame
 * and the rarity colour behind it come from the stylesheet (.face).
 */
export function portraitSvg(id, { mood = 'normal', cls = '' } = {}) {
  const c = CAST[id];
  if (!c) return '';
  const box = c.look.dog ? '-13 -78 70 70' : '-37 -122 76 76';
  const inner = c.look.dog ? dog(c.look, 'card', { mood }) : person(c.look, 'card', { mood });
  return `<svg class="portrait ${cls}" viewBox="${box}" aria-hidden="true"><g class="fig fig-${id} pose-card">${inner}</g></svg>`;
}

/** The same face as a dark shape: someone out there you haven't met. */
export function silhouetteSvg(id) {
  return portraitSvg(id, { cls: 'silhouette' });
}

export const rarityColor = (id) => RARITIES[CAST[id].rarity].color;

// --- Drowsers --------------------------------------------------------------------------------
// People who stopped sleeping, then stopped being people. Still in whatever
// they were wearing when they should have gone to bed.

const DROWSER_SKIN = ['#a9c9a0', '#b9bfe0', '#c3cf9a'];

const OUTFITS = {
  pajamas: { top: '#7fb0e0', bottom: '#7fb0e0', stripes: '#f4f1ea', hat: 'nightcap' },
  robe: { top: '#e39ab8', bottom: '#f1e6c8', belt: '#c9628f', hat: 'mask' },
  mourner: { top: '#3a3748', bottom: '#2c2a3a', stripes: null, hat: 'veil' },
  worker: { top: '#e8a33a', bottom: '#4a5a78', bib: '#4a5a78', hat: 'hardhat' },
  suit: { top: '#e9edf2', bottom: '#4a4a66', tie: '#e8483f', hat: 'none' },
  clerk: { top: '#9fd0c9', bottom: '#59606e', tie: '#3a3550', hat: 'headset' },
  docker: { top: '#f2e23a', bottom: '#3a4a66', vest: '#e8643f', hat: 'beanie' },
};

/** Which drowsers turn up at each stop of the road. */
export const DROWSERS_BY_AREA = {
  suburbia: ['pajamas', 'robe'],
  graveyard: ['mourner', 'pajamas'],
  junkyard: ['worker', 'robe'],
  streets: ['suit', 'pajamas'],
  office: ['clerk', 'suit'],
  docks: ['docker', 'worker'],
};

/** A drowser (facing right; flip it to walk left). `n` picks skin and hair. */
export function drowserSvg(kind = 'pajamas', n = 0, pose = 'walk') {
  const o = OUTFITS[kind] || OUTFITS.pajamas;
  const skin = DROWSER_SKIN[n % DROWSER_SKIN.length];
  const hairC = ['#5a4a5e', '#3a3348', '#8a7a6a'][n % 3];
  const w = 16;
  const ko = pose === 'down';
  let torso = rect(-w, -58, w * 2, 35, 11, o.top);
  if (o.stripes) torso += line('M-13,-50 h26 M-15,-42 h30 M-15,-34 h30', o.stripes, 2.6, ' opacity="0.85"');
  if (o.belt) torso += line('M-16,-36 h32', o.belt, 4) + line('M2,-36 q2,8 -2,12', o.belt, 3) + path('M-4,-58 L1,-40 L7,-58', tone(o.top, 0.35), ' stroke-width="2"');
  if (o.bib) torso += rect(-10, -48, 20, 24, 3, o.bib, ' stroke-width="2"') + dot(-7, -46, 1.6, '#f2c230') + dot(7, -46, 1.6, '#f2c230');
  if (o.tie) torso += path('M-1,-56 h4 l2,5 l-3,16 l-4,-4 l1,-12 z', o.tie, ' stroke-width="2" transform="rotate(8 1 -56)"');
  if (o.vest) torso += path('M-16,-56 h9 l2,32 h-11 z', o.vest, ' stroke-width="2"') + path('M16,-56 h-9 l-2,32 h11 z', o.vest, ' stroke-width="2"') + line('M-15,-38 h8 M15,-38 h-8', '#f4f1ea', 2.4);
  const eyes = ko
    ? [-7, 9].map((x) => line(`M${x - 3},-81 l6,6 M${x + 3},-81 l-6,6`, OL, 2.4)).join('')
    : [-7, 9]
        .map(
          (x) =>
            plain(`M${x - 6},-72 q6,5 12,0 q-6,2.4 -12,0z`, '#6a4a8a', ' opacity="0.7"') +
            `<ellipse cx="${x}" cy="-78" rx="5.2" ry="4.6" fill="#f6f2e2" stroke="${OL}" stroke-width="1.8"/>` +
            dot(x + 1.2, -77, 1.7, OL) +
            path(`M${x - 5.6},-79 q5.6,-6.5 11.2,0 q-5.6,-1.6 -11.2,0z`, tone(skin, -0.22), ' stroke-width="1.8"'),
        )
        .join('');
  const mouth = ko ? line('M-4,-66 q3,-3 6,0 q3,3 6,0', OL, 2.2) : ell(2, -66, 5, 4, '#3a2440', ' stroke-width="2"') + line('M5,-63 v5', '#9fe0ff', 2, ' opacity="0.8"');
  const hair = path('M-21,-80 Q-23,-98 -12,-99 L-14,-106 L-5,-100 L1,-108 L5,-100 L14,-104 L13,-97 Q22,-94 21,-80 Q12,-92 0,-90 Q-12,-92 -21,-80 Z', hairC);
  let hat = '';
  if (o.hat === 'nightcap') hat = path('M-19,-92 Q-6,-112 14,-102 Q30,-96 30,-78 Q20,-90 8,-92 Z', '#f4f1ea') + line('M-17,-94 Q-4,-104 10,-98', o.top, 3) + circ(30, -76, 4.6, '#f4f1ea', ' stroke-width="2.2"');
  else if (o.hat === 'mask') hat = path('M-19,-96 q19,-9 38,0 l-1,8 q-18,-7 -36,0 z', '#6a4a8a', ' stroke-width="2.2"') + line('M-12,-93 q5,-3 9,0 M4,-93 q5,-3 9,0', '#f4f1ea', 1.8);
  else if (o.hat === 'veil') hat = ell(0, -97, 22, 5.5, '#2c2a3a') + path('M-13,-98 Q-13,-110 0,-110 Q13,-110 13,-98 Z', '#3a3748') + plain('M-18,-94 h36 v12 q-18,5 -36,0z', '#2c2a3a', ' opacity="0.28"');
  else if (o.hat === 'hardhat') hat = path('M-21,-90 Q-21,-110 0,-110 Q21,-110 21,-90 Z', '#f2c230') + path('M-24,-90 h50 v4 h-50 z', '#f2c230') + line('M0,-109 v18', tone('#f2c230', -0.25), 2.4);
  else if (o.hat === 'headset') hat = line('M-21,-82 Q-22,-104 0,-104 Q22,-104 21,-82', '#2c2a3a', 3.4) + rect(-25, -86, 8, 12, 3.5, '#2c2a3a', ' stroke-width="2"') + line('M-21,-76 q2,10 12,10', '#2c2a3a', 2.4);
  else if (o.hat === 'beanie') hat = path('M-21,-86 Q-22,-106 0,-106 Q22,-106 21,-86 Z', '#3a6a8a') + path('M-22,-90 h44 v6 h-44 z', '#2f5570', ' stroke-width="2.4"');
  const head = `<g class="f-head">${ell(0, -78, 21, 20, skin)}${plain('M-19,-72 q4,12 19,14 q-14,2 -19,-14z', tone(skin, -0.2), ' opacity="0.6"')}${eyes}${mouth}${o.hat === 'hardhat' || o.hat === 'beanie' ? '' : hair}${hat}</g>`;
  const fa = ko ? -30 : -84;
  const ba = ko ? 40 : -68;
  const up = `<g class="f-up">${arm('b', ba, o.top, skin, '', w)}${torso}${head}${arm('f', fa, o.top, skin, '', w)}</g>`;
  const slipper = (side) => (side === 'a' ? '#e39ab8' : '#c9628f');
  const dl = (side) => {
    const x = side === 'a' ? w * 0.48 : -w * 0.48;
    const c = side === 'a' ? o.bottom : tone(o.bottom, -0.2);
    return `<g transform="translate(${r1(x)},-27)"><g class="f-leg f-leg-${side}">${rect(-5.6, 0, 11.2, 23, 5, c)}${o.stripes ? line('M-5,8 h10 M-5,16 h10', o.stripes, 2.2, ' opacity="0.8"') : ''}${ell(2, 25, 8.4, 4.6, kind === 'pajamas' || kind === 'robe' ? slipper(side) : '#2c2740', ' stroke-width="2.6"')}</g></g>`;
  };
  const all = dl('b') + dl('a') + up;
  if (ko) return `<g class="fig drowser pose-down">${shadow(40, 7)}<g class="f-all" transform="translate(-40,-13) rotate(82)">${all}</g></g>`;
  return `<g class="fig drowser pose-${pose}">${shadow(w + 9, 6.5)}<g class="f-all">${all}</g></g>`;
}

export const DROWSER_KINDS = Object.keys(OUTFITS);
export const POSE_NAMES = Object.keys(POSES);
