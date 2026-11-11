// Long Haul: the camp at dusk. One wide SVG scene: the sky and the far city,
// the junk fence with its string of lights, the radio tent and its mast on the
// left, the fire in the middle, the tents behind it, the truck and the gate on
// the right. Pure string builders (no DOM).
//
// The scene is drawn for SCENE (1200 x 540) but the sky, the ground and the
// fence run on far past it, so camp.js can show any window of it that fits
// the screen. SPOTS says where things stand; camp.js fills the empty groups
// (#c-tents, #c-rack, #c-people-back, #c-people, #c-gift) and sets .calling on
// the <svg> while a radio is calling (the waves at the top of the mast).

import { OL, tone, miniCrate } from './figures.js';
import { mulberry32 } from './util.js';
import { BEN_COLOR } from './config.js';

export const SCENE = { w: 1200, h: 540, safe: { x0: 30, x1: 1170, top: 110 } };

/** Where things stand (scene units; a person's spot is between their feet). */
export const SPOTS = {
  squad: [
    { x: 706, y: 404, s: 0.9, flip: false },
    { x: 764, y: 388, s: 0.88, flip: false },
    { x: 822, y: 406, s: 0.9, flip: false },
  ],
  bench: [
    { x: 500, y: 398, s: 0.82, flip: false },
    { x: 636, y: 398, s: 0.82, flip: true },
    { x: 228, y: 378, s: 0.82, flip: true },
    { x: 404, y: 374, s: 0.8, flip: false },
    { x: 568, y: 350, s: 0.78, flip: false, back: true },
    { x: 344, y: 408, s: 0.84, flip: false },
    { x: 446, y: 416, s: 0.84, flip: false },
    { x: 142, y: 408, s: 0.84, flip: false },
    { x: 290, y: 362, s: 0.78, flip: true },
  ],
  /** One tent for every two people in the camp. */
  tents: [372, 464, 556, 648, 740, 832].map((x, i) => ({ x, y: 316 - (i % 2) * 6, s: 1.12 })),
  fire: { x: 568, y: 390 },
  radio: { x: 190, y: 250, w: 250, h: 150 }, // the tent, for taps and bubbles
  rack: { x: 276, y: 318 },
  mast: { x: 132, y: 150 },
  truck: { x: 986, y: 330 },
  gate: { x: 1172, y: 300 },
  gift: { x: 1096, y: 428 },
};

const SWD = 3;
const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${SWD}" stroke-linejoin="round" stroke-linecap="round"${extra}/>`;
const F = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const L = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const R = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${OL}" stroke-width="${SWD}" stroke-linejoin="round"${extra}/>`;
const C = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${OL}" stroke-width="${SWD}"${extra}/>`;
const D = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${extra}/>`;
const n1 = (v) => Math.round(v * 10) / 10;

const LIGHT = '#ffd36b';
const CANVAS = ['#748149', '#8a7550', '#56737a', '#93604f', '#6a6a8a', '#7f8a3f'];

// --- Sky and the far city --------------------------------------------------------------------

function sky() {
  const rnd = mulberry32(9);
  let stars = '';
  for (let i = 0; i < 46; i++) {
    const x = Math.round(-380 + rnd() * 1960);
    const y = Math.round(-250 + rnd() * 400);
    const r = n1(0.8 + rnd() * 1.5);
    stars += `<circle class="c-star" cx="${x}" cy="${y}" r="${r}" fill="#fff6d8" style="animation-delay:${n1(-rnd() * 5)}s"/>`;
  }
  const cloud = (x, y, s, o) => `<g class="c-cloud" transform="translate(${x},${y}) scale(${s})" opacity="${o}"><path d="M0,0 q10,-22 36,-14 q14,-22 42,-8 q26,-8 34,14 q22,2 20,16 h-150 q-8,-10 18,-8z" fill="#8a4a7c"/><path d="M4,6 q60,-10 128,0" stroke="#ffb768" stroke-width="3" fill="none" opacity="0.5" stroke-linecap="round"/></g>`;
  return (
    `<rect x="-900" y="-900" width="3000" height="1200" fill="url(#c-sky)"/>` +
    stars +
    `<circle cx="770" cy="96" r="150" fill="url(#c-moonglow)"/>` +
    `<circle cx="770" cy="96" r="30" fill="#fff1c9"/><circle cx="781" cy="88" r="27" fill="#f7dfa6" opacity="0.5"/><circle cx="760" cy="104" r="5" fill="#e9cf96" opacity="0.7"/><circle cx="778" cy="84" r="3.5" fill="#e9cf96" opacity="0.7"/>` +
    cloud(180, 150, 1.15, 0.75) +
    cloud(560, 122, 0.9, 0.6) +
    cloud(1040, 172, 1.25, 0.7) +
    cloud(-240, 120, 1.3, 0.6) +
    cloud(1420, 130, 1.1, 0.6)
  );
}

function city() {
  // Towers, then row-house roofs, then trees: three dark bands against the glow.
  const rnd = mulberry32(21);
  let far = '';
  let x = -420;
  while (x < 1640) {
    const w = 26 + Math.round(rnd() * 34);
    const h = 30 + Math.round(rnd() * 70);
    const top = 232 - h;
    far += `<rect x="${x}" y="${top}" width="${w}" height="${h + 20}" fill="#3b2c5e"/>`;
    if (rnd() < 0.35) far += `<path d="M${x + w / 2 - 5},${top} l5,-${12 + Math.round(rnd() * 16)} l5,${12}z" fill="#3b2c5e"/>`;
    for (let wy = top + 8; wy < 226; wy += 11) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (rnd() < 0.16) far += `<rect x="${wx}" y="${wy}" width="4" height="5" fill="${LIGHT}" opacity="${n1(0.5 + rnd() * 0.5)}"/>`;
    x += w + Math.round(rnd() * 14);
  }
  // Gantry cranes on the river: where the road ends. One red light, blinking.
  const crane = (cx, s) =>
    `<g transform="translate(${cx},232) scale(${s})" fill="none" stroke="#2c2350" stroke-width="5" stroke-linejoin="round"><path d="M-22,0 L-14,-70 L14,-70 L22,0 M-18,-36 H18 M-40,-70 H58 M-14,-70 L8,-94 L58,-70 M8,-94 V-70"/><path d="M40,-70 V-46" stroke-width="2.5"/></g>` +
    `<circle class="c-blink" cx="${cx + 8 * s}" cy="${232 - 97 * s}" r="3.4" fill="#ff5a4a"/>`;
  let near = '';
  x = -420;
  while (x < 1640) {
    const w = 44 + Math.round(rnd() * 30);
    const h = 26 + Math.round(rnd() * 22);
    near += `<path d="M${x},262 V${240 - h + 16} l${w / 2},-16 l${w / 2},16 V262z" fill="#2a2148"/>`;
    if (rnd() < 0.5) near += `<rect x="${x + w / 2 - 4}" y="${244 - h + 22}" width="8" height="9" fill="${LIGHT}" opacity="0.75"/>`;
    if (rnd() < 0.4) near += `<rect x="${x + w - 14}" y="${240 - h + 2}" width="7" height="14" fill="#2a2148"/>`;
    x += w + 3;
  }
  let trees = '';
  for (let i = 0; i < 20; i++) {
    const tx = Math.round(-400 + rnd() * 2000);
    const r = 16 + Math.round(rnd() * 14);
    trees += `<circle cx="${tx}" cy="${236 - r * 0.4}" r="${r}" fill="#241c40"/><circle cx="${tx + r * 0.7}" cy="${240 - r * 0.2}" r="${r * 0.7}" fill="#241c40"/>`;
  }
  const tower = `<g fill="#241c40"><path d="M452,170 h44 v34 h-44z"/><path d="M448,170 l26,-14 l26,14z"/><path d="M456,204 l-6,58 M492,204 l6,58 M474,204 v58" stroke="#241c40" stroke-width="4" fill="none"/></g>`;
  return `<rect x="-900" y="196" width="3000" height="70" fill="url(#c-haze)"/>` + far + crane(1010, 0.9) + crane(1086, 0.72) + near + tower + trees;
}

// --- The fence and its lights ----------------------------------------------------------------

function fence() {
  const rnd = mulberry32(5);
  const colors = ['#56607f', '#6c5b80', '#4c6c7c', '#7a5560', '#5c6a55'];
  let out = '';
  let x = -420;
  while (x < 1640) {
    const kind = rnd();
    if (kind < 0.55) {
      // A sheet of corrugated tin.
      const w = 58 + Math.round(rnd() * 26);
      const top = 208 + Math.round(rnd() * 12);
      const c = colors[Math.floor(rnd() * colors.length)];
      out += R(x, top, w, 272 - top, 3, c);
      for (let k = x + 9; k < x + w - 4; k += 9) out += L(`M${k},${top + 4} V268`, tone(c, -0.22), 2.2);
      out += F(`M${x + 2},${top + 2} h${w - 4} v5 h-${w - 4}z`, tone(c, 0.25), ' opacity="0.6"');
      if (rnd() < 0.3) out += F(`M${x + w * 0.3},${top + 24} q8,-6 14,2 q4,10 -6,12 q-10,-2 -8,-14z`, '#a8603a', ' opacity="0.7"');
      x += w + 1;
    } else if (kind < 0.8) {
      // Pallet planks.
      const w = 44 + Math.round(rnd() * 16);
      for (let k = 0; k < 4; k++) out += R(n1(x + (k * w) / 4), 214 + (k % 2) * 5, w / 4 - 1, 58 - (k % 2) * 5, 2, k % 2 ? '#94663c' : '#a8774a');
      out += L(`M${x + 1},236 h${w - 3} M${x + 1},254 h${w - 3}`, '#6e4526', 4);
      x += w + 1;
    } else {
      // Chain-link with a coil of wire on top.
      const w = 70;
      out += `<rect x="${x}" y="216" width="${w}" height="56" fill="#2a2148" opacity="0.35"/>`;
      for (let k = 0; k <= w; k += 10) out += `<path d="M${x + k},216 l-14,56 M${x + k},216 l14,56" stroke="#9aa5bb" stroke-width="1.3" opacity="0.5" fill="none"/>`;
      out += R(x - 1, 210, 5, 62, 2, '#6b748c') + R(x + w - 4, 210, 5, 62, 2, '#6b748c');
      out += L(`M${x},212 ${Array.from({ length: 7 }, (_, k) => `q5,-10 10,0`).join(' ')}`, '#9aa5bb', 1.8, ' opacity="0.8"');
      x += w + 1;
    }
  }
  return out;
}

/** A sagging string of bulbs from a to b. */
function bulbs(ax, ay, bx, by, sag, n, seed) {
  const rnd = mulberry32(seed);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2 + sag;
  let out = L(`M${ax},${ay} Q${mx},${my + sag} ${bx},${by}`, '#15121f', 2);
  const cols = [LIGHT, '#ff8f6b', LIGHT, '#8fe3d0', LIGHT];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
    const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * (my + sag) + t * t * by;
    const c = cols[i % cols.length];
    out += `<g class="c-bulb" style="animation-delay:${n1(-rnd() * 4)}s"><circle cx="${n1(x)}" cy="${n1(y + 5)}" r="11" fill="${c}" opacity="0.2"/><circle cx="${n1(x)}" cy="${n1(y + 5)}" r="4.2" fill="${c}" stroke="${OL}" stroke-width="1.6"/></g>`;
  }
  return out;
}

function lights() {
  const post = (x, top) => R(x - 3, top, 6, 272 - top, 2, '#6e4526');
  return (
    post(330, 178) +
    post(600, 170) +
    post(872, 176) +
    bulbs(132, 190, 330, 180, 14, 8, 1) +
    bulbs(330, 180, 600, 172, 18, 10, 2) +
    bulbs(600, 172, 872, 178, 18, 10, 3) +
    bulbs(872, 178, 1146, 206, 16, 9, 4)
  );
}

// --- The ground ------------------------------------------------------------------------------

function ground() {
  const rnd = mulberry32(77);
  let bits = '';
  for (let i = 0; i < 34; i++) {
    const x = Math.round(-300 + rnd() * 1800);
    const y = Math.round(284 + rnd() * 250);
    bits += rnd() < 0.5 ? `<ellipse cx="${x}" cy="${y}" rx="${8 + Math.round(rnd() * 20)}" ry="${2 + Math.round(rnd() * 3)}" fill="#2f2948" opacity="0.5"/>` : `<path d="M${x},${y} l-3,-9 l3,4 l1,-8 l2,8 l4,-5 l-2,10z" fill="#4f6a4a"/>`;
  }
  // The old parking bays show through.
  let bays = '';
  for (let i = 0; i < 9; i++) bays += `<path d="M${240 + i * 96},276 l-34,150" stroke="#f4f1ea" stroke-width="4" opacity="0.1" stroke-linecap="round"/>`;
  return (
    `<rect x="-900" y="262" width="3000" height="900" fill="url(#c-ground)"/>` +
    `<path d="M-900,262 h3000" stroke="${OL}" stroke-width="3"/>` +
    bays +
    bits +
    `<ellipse cx="568" cy="392" rx="330" ry="92" fill="url(#c-firelight)"/>` +
    `<ellipse cx="190" cy="372" rx="170" ry="46" fill="url(#c-lamplight)"/>` +
    `<path d="M1110,372 q60,-10 130,6 v60 q-70,-22 -130,-14z" fill="url(#c-headlight)"/>`
  );
}

// --- The radio tent --------------------------------------------------------------------------

function mast() {
  const { x, y } = SPOTS.mast;
  let braces = '';
  for (let k = 0; k < 6; k++) {
    const y0 = 300 - k * 25;
    const y1 = y0 - 25;
    const w0 = 15 - k * 1.9;
    const w1 = 15 - (k + 1) * 1.9;
    braces += `M${x - w0},${y0} L${x + w1},${y1} M${x + w0},${y0} L${x - w1},${y1} M${x - w1},${y1} H${x + w1} `;
  }
  return (
    L(`M${x},${y + 6} L${x - 84},300 M${x},${y + 6} L${x + 150},262`, '#15121f', 1.6, ' opacity="0.7"') +
    L(`M${x - 15},300 L${x - 3.6},${y} M${x + 15},300 L${x + 3.6},${y} ${braces}`, OL, 5.5) +
    L(`M${x - 15},300 L${x - 3.6},${y} M${x + 15},300 L${x + 3.6},${y} ${braces}`, '#b9c2d6', 2.2) +
    L(`M${x},${y} v-22`, OL, 4.5) +
    L(`M${x},${y} v-22`, '#b9c2d6', 1.8) +
    L(`M${x - 12},${y + 14} h24 M${x - 9},${y + 26} h18`, OL, 4) +
    L(`M${x - 12},${y + 14} h24 M${x - 9},${y + 26} h18`, '#b9c2d6', 1.6) +
    `<circle class="c-blink" cx="${x}" cy="${y - 25}" r="11" fill="#ff5a4a" opacity="0.3"/>` +
    `<circle class="c-blink" cx="${x}" cy="${y - 25}" r="4.6" fill="#ff5a4a" stroke="${OL}" stroke-width="2"/>` +
    // Waves, shown while a radio is calling.
    `<g class="c-waves" fill="none" stroke="#8fe3d0" stroke-width="3.2" stroke-linecap="round">` +
    [16, 28, 40].map((r, i) => `<path class="c-wave c-wave-${i}" d="M${x + r * 0.72},${y - 25 - r * 0.7} A${r},${r} 0 0 1 ${x + r * 0.72},${y - 25 + r * 0.7} M${x - r * 0.72},${y - 25 - r * 0.7} A${r},${r} 0 0 0 ${x - r * 0.72},${y - 25 + r * 0.7}"/>`).join('') +
    `</g>`
  );
}

function radioTent() {
  const c = '#748149';
  return (
    // Back wall and the shade under the canopy.
    P('M74,262 L84,330 L300,330 L306,262 Z', tone(c, -0.42)) +
    // The table and the set.
    R(104, 322, 112, 10, 3, '#a8774a') +
    L('M112,332 v40 M208,332 v40', OL, 8) +
    L('M112,332 v40 M208,332 v40', '#8a5a34', 3.5) +
    R(118, 286, 64, 36, 6, '#4a5a78') +
    F('M121,289 h58 v7 h-58z', tone('#4a5a78', 0.25), ' opacity="0.7"') +
    R(124, 296, 24, 14, 3, '#15121f', ' stroke-width="2"') +
    `<path class="c-scope" d="M127,303 l4,-4 l4,7 l4,-6 l4,5 l3,-2" fill="none" stroke="#8fe3d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    C(160, 300, 5, '#f0b429', ' stroke-width="2"') +
    C(172, 300, 5, '#e8483f', ' stroke-width="2"') +
    L('M154,314 h24', '#15121f', 3) +
    `<circle class="c-dial" cx="134" cy="315" r="2.6" fill="#8fe3d0"/>` +
    L('M182,292 q12,-16 20,-2', OL, 3) +
    R(194, 300, 14, 22, 5, '#f4f1ea') +
    L('M208,306 q8,2 0,10', OL, 2.6) +
    // Poles and the canopy.
    L('M70,262 V374 M310,262 V374', OL, 9) +
    L('M70,262 V374 M310,262 V374', '#a8774a', 4) +
    P('M48,266 L84,214 L296,214 L332,266 Q296,278 262,266 Q226,278 190,266 Q154,278 118,266 Q84,278 48,266 Z', c) +
    F('M84,217 h212 l8,12 h-228z', tone(c, 0.25), ' opacity="0.75"') +
    L('M118,266 L128,216 M190,266 V216 M262,266 L252,216', tone(c, -0.3), 2.4) +
    // The sign.
    R(150, 198, 80, 24, 5, '#f1e6c8') +
    `<text x="190" y="216" text-anchor="middle" font-size="16" font-weight="900" letter-spacing="2" fill="${OL}" font-family="ui-rounded, 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif">RADIO</text>` +
    // A lantern on the pole.
    `<circle cx="310" cy="286" r="26" fill="${LIGHT}" opacity="0.22"/>` +
    R(303, 276, 14, 18, 4, LIGHT, ' stroke-width="2.4"') +
    L('M310,276 v-8', OL, 2.4)
  );
}

/**
 * The rack by the tent: three hooks, a radio on each one that's in use.
 * `rack` is Game.rack(): [{ state: 'calling' | 'queued' | 'answered' }].
 */
export function rackSvg(rack = []) {
  const { x, y } = SPOTS.rack;
  let out = R(x - 34, y - 28, 68, 50, 5, '#a8774a') + F(`M${x - 31},${y - 25} h62 v6 h-62z`, tone('#a8774a', 0.25), ' opacity="0.7"') + L(`M${x - 26},${y + 22} v26 M${x + 26},${y + 22} v26`, OL, 8) + L(`M${x - 26},${y + 22} v26 M${x + 26},${y + 22} v26`, '#8a5a34', 3.5);
  for (let i = 0; i < 3; i++) {
    const cx = x - 21 + i * 21;
    const r = rack[i];
    out += D(cx, y - 16, 2.4, OL);
    if (!r) {
      out += `<rect x="${cx - 7}" y="${y - 10}" width="14" height="24" rx="4" fill="none" stroke="${OL}" stroke-width="2" stroke-dasharray="3 4" opacity="0.45"/>`;
      continue;
    }
    const led = r.state === 'answered' ? '#ffd36b' : r.state === 'calling' ? '#8fe3d0' : '#5d6680';
    out +=
      `<g class="c-radio-unit st-${r.state}">` +
      L(`M${cx + 4},${y - 10} v-13`, OL, 3.4) +
      R(cx - 7.5, y - 10, 15, 25, 4, r.state === 'queued' ? '#5d6680' : '#3f8f6f', ' stroke-width="2.4"') +
      `<rect x="${cx - 4.5}" y="${y - 6}" width="9" height="6" rx="1.5" fill="#15121f"/>` +
      L(`M${cx - 4},${y + 5} h8 M${cx - 4},${y + 9} h8`, '#15121f', 1.6) +
      `<circle class="c-led" cx="${cx}" cy="${y - 3}" r="2" fill="${led}"/>` +
      `</g>`;
  }
  return out;
}

// --- The fire --------------------------------------------------------------------------------

function fire() {
  const { x, y } = SPOTS.fire;
  const log = (dx, dy, a) => `<g transform="translate(${x + dx},${y + dy}) rotate(${a})">${R(-24, -6, 48, 12, 6, '#8a5a34')}<ellipse cx="22" cy="0" rx="5" ry="6" fill="#d9a56c" stroke="${OL}" stroke-width="2.4"/></g>`;
  const stones = [-34, -22, -8, 8, 22, 34].map((dx, i) => `<ellipse cx="${x + dx}" cy="${y + 6 + (i % 2) * 3}" rx="9" ry="6" fill="${i % 2 ? '#6b6a80' : '#7c7b92'}" stroke="${OL}" stroke-width="2.6"/>`).join('');
  const seat = (dx) => `<g transform="translate(${x + dx},${y + 2})">${R(-26, -14, 52, 16, 8, '#94663c')}<ellipse cx="-22" cy="-6" rx="5" ry="8" fill="#d9a56c" stroke="${OL}" stroke-width="2.4"/></g>`;
  let sparks = '';
  for (let i = 0; i < 6; i++) sparks += `<circle class="c-spark" cx="${x - 14 + i * 6}" cy="${y - 40}" r="2" fill="#ffd36b" style="animation-delay:${n1(-i * 0.5)}s"/>`;
  return (
    `<circle cx="${x}" cy="${y - 26}" r="74" fill="url(#c-fireglow)"/>` +
    log(-6, -3, 18) +
    log(8, -2, -16) +
    `<g class="c-flames" transform="translate(${x},${y - 6})">` +
    `<path class="c-flame c-flame-a" d="M0,-66 Q24,-36 22,-14 Q18,6 0,6 Q-18,6 -22,-14 Q-24,-30 -8,-42 Q-2,-52 0,-66 Z" fill="#ff7a3a" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path class="c-flame c-flame-b" d="M2,-44 Q16,-26 14,-10 Q10,4 0,4 Q-12,4 -14,-10 Q-14,-22 -4,-30 Q0,-36 2,-44 Z" fill="#ffb93a"/>` +
    `<path class="c-flame c-flame-c" d="M0,-24 Q8,-14 7,-6 Q5,2 0,2 Q-6,2 -7,-6 Q-7,-13 0,-24 Z" fill="#fff1b8"/>` +
    `</g>` +
    stones +
    sparks +
    seat(-98) +
    seat(98) +
    // The pot hanging over it.
    L(`M${x - 44},${y - 4} L${x - 4},${y - 76} M${x + 44},${y - 4} L${x + 4},${y - 76}`, OL, 5) +
    L(`M${x - 44},${y - 4} L${x - 4},${y - 76} M${x + 44},${y - 4} L${x + 4},${y - 76}`, '#8d97ab', 2)
  );
}

// --- Tents -----------------------------------------------------------------------------------

/** A survivor's tent. `n` picks the canvas; the flag is their rarity colour. */
export function tentSvg(n = 0, flag = '#9aa7b8') {
  const c = CANVAS[n % CANVAS.length];
  return (
    P('M-36,0 L0,-48 L36,0 Z', c) +
    F('M0,-45 L33,-2 h-12 z', tone(c, -0.25), ' opacity="0.7"') +
    F('M-3,-42 L-30,-3 h8 z', tone(c, 0.3), ' opacity="0.6"') +
    P('M-9,0 L0,-26 L9,0 Z', tone(c, -0.5)) +
    L('M0,-48 V-64', OL, 3) +
    P('M0,-64 h16 l-5,5 l5,5 h-16 z', flag, ' stroke-width="2.2"') +
    L('M-36,0 l-9,3 M36,0 l9,3', OL, 2.2)
  );
}

// --- The truck and the gate ------------------------------------------------------------------

function truck() {
  const body = '#2f8f83';
  const wheel = (x) => C(x, 0, 22, '#231f35') + C(x, 0, 10, '#8d97ab', ' stroke-width="2.6"') + D(x, 0, 3, OL);
  // Drawn around the back axle's ground point; it faces right, toward the gate.
  return (
    `<g id="c-truck" class="c-truck" transform="translate(900,404)">` +
    `<ellipse cx="72" cy="6" rx="150" ry="11" fill="#0c0a1c" opacity="0.4"/>` +
    // The bed, its rails, and what's on it.
    R(-58, -62, 150, 34, 5, tone(body, -0.28)) +
    `<g transform="translate(-22,-80) scale(0.52)">${miniCrate()}</g>` +
    `<g transform="translate(28,-80) scale(0.52)">${miniCrate()}</g>` +
    `<g transform="translate(2,-114) scale(0.5) rotate(-4)">${miniCrate()}</g>` +
    P('M54,-66 q18,-34 34,-2 l2,6 h-38z', '#93604f') +
    L('M-58,-72 H92 M-58,-88 H50', OL, 8) +
    L('M-58,-72 H92 M-58,-88 H50', '#a8774a', 3.5) +
    L('M-54,-62 V-94 M-10,-62 V-94 M38,-62 V-94 M88,-62 V-78', OL, 8) +
    L('M-54,-62 V-94 M-10,-62 V-94 M38,-62 V-94 M88,-62 V-78', '#a8774a', 3.5) +
    // The cab.
    P('M92,-26 V-96 Q92,-108 104,-108 H150 Q164,-108 170,-94 L182,-66 H206 Q218,-66 218,-54 V-26 Z', body) +
    F('M95,-58 h120 v8 h-120z', '#f1e6c8', ' opacity="0.9"') +
    F('M96,-100 q2,-5 9,-5 h42 q9,0 13,7z', tone(body, 0.3), ' opacity="0.7"') +
    P('M110,-98 H148 Q158,-98 162,-90 L172,-68 H110 Z', '#bfe9ff') +
    F('M118,-94 h14 l-8,22 h-10z', '#ffffff', ' opacity="0.45"') +
    L('M134,-98 V-68', OL, 3) +
    R(118, -48, 16, 5, 2, OL, ' stroke-width="0"') +
    `<text x="156" y="-34" text-anchor="middle" font-size="11" font-weight="900" fill="#f1e6c8" font-family="ui-rounded, 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif" letter-spacing="1">LONG HAUL</text>` +
    // The frame, bumper and lamp.
    R(-62, -30, 284, 14, 5, '#3a3550') +
    R(212, -40, 16, 18, 4, '#8d97ab') +
    `<circle cx="222" cy="-52" r="34" fill="${LIGHT}" opacity="0.28"/>` +
    R(208, -60, 12, 14, 4, LIGHT, ' stroke-width="2.4"') +
    R(-64, -52, 8, 12, 3, '#e8483f', ' stroke-width="2.4"') +
    // Wheel arches and wheels.
    P('M-34,-18 q0,-28 28,-28 q28,0 28,28z', tone(body, -0.45)) +
    P('M134,-18 q0,-28 28,-28 q28,0 28,28z', tone(body, -0.45)) +
    wheel(-6) +
    wheel(162) +
    `</g>`
  );
}

function gate() {
  // An open chain-link gate, and the way to the river sprayed on a plank.
  let mesh = '';
  for (let k = 0; k <= 90; k += 10) mesh += `M${1184 + k},300 l-18,112 M${1184 + k},300 l18,112 `;
  return (
    `<path d="${mesh}" stroke="#9aa5bb" stroke-width="1.3" opacity="0.45" fill="none"/>` +
    R(1172, 240, 10, 176, 3, '#6b748c') +
    L('M1182,300 H1310 M1182,412 H1310', OL, 6) +
    L('M1182,300 H1310 M1182,412 H1310', '#8d97ab', 2.4) +
    `<g transform="translate(1092,238) rotate(-4)">${R(-52, -17, 104, 34, 5, '#a8774a')}<path d="M-48,-6 h96 M-48,7 h96" stroke="#8a5a34" stroke-width="2" opacity="0.7"/><text x="-8" y="7" text-anchor="middle" font-size="19" font-weight="900" fill="#f4f1ea" font-family="ui-rounded, 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif" letter-spacing="1">PIER 9</text><path d="M30,0 h14 m-6,-6 l6,6 l-6,6" stroke="#f4f1ea" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>` +
    L('M1092,256 V272', OL, 3)
  );
}

/** Two drowsers out past the fence: shapes and tired eyes, nothing more. */
function lurkers() {
  const one = (x, y, s, d) =>
    `<g class="c-lurker" transform="translate(${x},${y}) scale(${s})" style="animation-delay:${d}s"><path d="M-10,0 V-30 Q-12,-52 0,-52 Q12,-52 10,-30 V0 Z M4,-30 h20 v6 h-20z" fill="#1f1838"/><circle cx="-4" cy="-40" r="2.2" fill="#d8f0a0"/><circle cx="5" cy="-40" r="2.2" fill="#d8f0a0"/></g>`;
  return one(1250, 356, 1.25, 0) + one(1310, 392, 1.5, -3) + one(-60, 300, 1.0, -5);
}

// --- Things in front -------------------------------------------------------------------------

function front() {
  const barrel = (x, y) => R(x - 20, y - 54, 40, 56, 8, '#56737a') + L(`M${x - 20},${y - 36} h40 M${x - 20},${y - 16} h40`, tone('#56737a', -0.3), 3) + `<ellipse cx="${x}" cy="${y - 52}" rx="20" ry="6" fill="${tone('#56737a', 0.2)}" stroke="${OL}" stroke-width="3"/>`;
  const tuft = (x, y, s) => `<path transform="translate(${x},${y}) scale(${s})" d="M0,0 l-8,-22 l6,10 l2,-20 l5,19 l8,-13 l-4,26z" fill="#3f5a44" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>`;
  return (
    barrel(46, 520) +
    `<g transform="translate(108,506) scale(0.7)">${miniCrate()}</g>` +
    `<g transform="translate(96,460) scale(0.6) rotate(6)">${miniCrate()}</g>` +
    tuft(18, 540, 1.6) +
    tuft(168, 540, 1.3) +
    tuft(1180, 534, 1.6) +
    tuft(700, 548, 1.1) +
    tuft(-140, 520, 1.8) +
    tuft(1360, 530, 1.8)
  );
}

/** A crate somebody left at the gate, a few words on it in orange crayon. */
export function giftSvg(line) {
  const { x, y } = SPOTS.gift;
  const words = String(line).replace(/[<>&]/g, '');
  // Two lines when it's long, split at the space nearest the middle.
  let lines = [words];
  if (words.length > 13) {
    const mid = words.length / 2;
    const spaces = [...words].map((ch, i) => (ch === ' ' ? i : -1)).filter((i) => i >= 0);
    if (spaces.length) {
      const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0]);
      lines = [words.slice(0, at), words.slice(at + 1)];
    }
  }
  const text = lines.map((t, i) => `<text x="0" y="${lines.length === 1 ? -25 : -31 + i * 13}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${BEN_COLOR}" font-family="'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive">${t}</text>`).join('');
  return (
    `<g class="c-gift" transform="translate(${x},${y})">` +
    `<ellipse cx="0" cy="3" rx="40" ry="7" fill="#0c0a1c" opacity="0.4"/>` +
    `<g class="c-gift-box"><g transform="translate(0,-28) scale(0.8)">${miniCrate()}</g>` +
    `<g transform="rotate(-4 0 -28)"><rect x="-27" y="-43" width="54" height="${lines.length === 1 ? 26 : 30}" rx="3" fill="#f1e6c8" stroke="${OL}" stroke-width="2"/>${text}</g></g>` +
    `</g>`
  );
}

// --- The whole scene -------------------------------------------------------------------------

const defs = () =>
  `<defs>` +
  `<linearGradient id="c-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121231"/><stop offset="0.62" stop-color="#231c4a"/><stop offset="0.8" stop-color="#4a2c66"/><stop offset="0.9" stop-color="#93406c"/><stop offset="0.965" stop-color="#e2694f"/><stop offset="1" stop-color="#ffb768"/></linearGradient>` +
  `<linearGradient id="c-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb768" stop-opacity="0"/><stop offset="1" stop-color="#ffb768" stop-opacity="0.55"/></linearGradient>` +
  `<linearGradient id="c-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4168"/><stop offset="0.25" stop-color="#3d3658"/><stop offset="1" stop-color="#262040"/></linearGradient>` +
  `<radialGradient id="c-moonglow"><stop offset="0" stop-color="#fff1c9" stop-opacity="0.35"/><stop offset="1" stop-color="#fff1c9" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="c-firelight"><stop offset="0" stop-color="#ffb45a" stop-opacity="0.5"/><stop offset="0.6" stop-color="#ff8a4a" stop-opacity="0.16"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="c-fireglow"><stop offset="0" stop-color="#ffd36b" stop-opacity="0.55"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="c-lamplight"><stop offset="0" stop-color="#ffd36b" stop-opacity="0.3"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>` +
  `<linearGradient id="c-headlight" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd36b" stop-opacity="0"/><stop offset="0.55" stop-color="#ffd36b" stop-opacity="0.2"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0.05"/></linearGradient>` +
  `</defs>`;

/** The camp. camp.js sets the viewBox and fills the empty groups. */
export function campSvg() {
  return (
    `<svg id="camp-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE.w} ${SCENE.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    defs() +
    // camp.js slides this group about, so the viewBox itself always starts at 0 0.
    `<g id="c-world">` +
    `<g id="c-sky">${sky()}</g>` +
    `<g id="c-city">${city()}</g>` +
    `<g id="c-lurkers">${lurkers()}</g>` +
    `<g id="c-fence">${fence()}</g>` +
    `<g id="c-ground">${ground()}</g>` +
    `<g id="c-lights">${lights()}</g>` +
    `<g id="c-gate">${gate()}</g>` +
    `<g id="c-mast">${mast()}</g>` +
    `<g id="c-tents"></g>` +
    `<g id="c-radio" data-act="radio">${radioTent()}<g id="c-rack"></g></g>` +
    `<g id="c-people-back"></g>` +
    `<g id="c-fire" data-act="fire">${fire()}</g>` +
    `<g data-act="truck">${truck()}</g>` +
    `<g id="c-people"></g>` +
    `<g id="c-gift" data-act="gift"></g>` +
    `<g id="c-front">${front()}</g>` +
    `</g>` +
    `</svg>`
  );
}
