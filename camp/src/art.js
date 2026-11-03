// Procedural SVG art for the camp: every building has three looks (tiers) and
// small props that change with each level, so every upgrade is visible.
// Each art function returns { w, h, svg } in world units; the ground line is
// at y = h - 8 and the plot is anchored at its bottom centre.

import { BUILDINGS } from './config.js';
import { mulberry32 } from './util.js';

const L = '#1b140f';
const C = {
  woodD: '#5a3a22',
  wood: '#7d5232',
  woodL: '#a06c42',
  plank: '#8a5c38',
  canvas: '#8f8466',
  canvasL: '#a99d7a',
  canvasD: '#6c634d',
  metal: '#5f6a73',
  metalL: '#808c96',
  metalD: '#434b52',
  rust: '#8b4a2b',
  roof: '#4d555d',
  roofL: '#66717a',
  green: '#5d8f3a',
  greenL: '#84b84f',
  greenD: '#3d6526',
  soil: '#3f2c1f',
  light: '#ffd27a',
  red: '#c8453a',
  white: '#e6e1d3',
  sand: '#a89874',
  sandD: '#857654',
  concrete: '#7f7c75',
  concreteD: '#5e5b55',
  olive: '#5f6b3a',
  blue: '#3f6e8c',
  accent: '#ff6b4a',
};

// --- Primitives ------------------------------------------------------------------------------

const ST = `stroke="${L}" stroke-width="2" stroke-linejoin="round"`;
const r = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${ST} ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts}" fill="${fill}" ${ST} ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${ST} ${extra}/>`;
const ln = (x1, y1, x2, y2, color = L, w = 2, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const circ = (cx, cy, rad, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}" ${ST} ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const g = (inner, extra = '') => `<g ${extra}>${inner}</g>`;

function planksV(x, y, w, h, fill, step = 9) {
  let s = r(x, y, w, h, fill);
  for (let px = x + step; px < x + w - 2; px += step) s += ln(px, y + 1, px, y + h - 1, 'rgba(0,0,0,0.28)', 1.4);
  return s;
}

function corrugated(pts, fill, x0, x1, y0, y1, step = 6) {
  let s = poly(pts, fill);
  for (let x = x0 + step; x < x1; x += step) s += ln(x, y0, x, y1, 'rgba(255,255,255,0.12)', 1.2);
  return s;
}

function crate(x, y, s = 18, fill = C.woodL) {
  return r(x, y, s, s, fill, 1) + ln(x + 2, y + 2, x + s - 2, y + s - 2, C.woodD, 1.6) + ln(x + s - 2, y + 2, x + 2, y + s - 2, C.woodD, 1.6);
}

function ammo(x, y) {
  return r(x, y, 22, 13, C.olive, 1) + ln(x + 4, y + 6.5, x + 18, y + 6.5, '#d8c05a', 2);
}

function barrel(x, y, w = 14, h = 18, fill = C.rust) {
  return r(x, y, w, h, fill, 3) + ln(x + 1, y + h * 0.3, x + w - 1, y + h * 0.3, 'rgba(0,0,0,0.35)', 1.5) + ln(x + 1, y + h * 0.7, x + w - 1, y + h * 0.7, 'rgba(0,0,0,0.35)', 1.5);
}

function sandbags(x, y, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += r(x + i * 15, y, 16, 8, C.sand, 4);
  for (let i = 0; i < n - 1; i++) s += r(x + 7 + i * 15, y - 7, 16, 8, C.sandD, 4);
  return s;
}

function lantern(x, y) {
  return (
    `<circle class="glow" cx="${x}" cy="${y + 4}" r="15" fill="url(#lampGlow)"/>` +
    ln(x, y - 6, x, y - 1, L, 1.5) +
    r(x - 3.5, y - 1, 7, 9, C.light, 2) +
    ln(x - 3.5, y - 1, x + 3.5, y - 1, L, 2)
  );
}

function windowLit(x, y, w, h) {
  return r(x, y, w, h, C.light, 1, 'class="lit"') + ln(x + w / 2, y + 1, x + w / 2, y + h - 1, 'rgba(90,50,20,0.55)', 1.5) + ln(x + 1, y + h / 2, x + w - 1, y + h / 2, 'rgba(90,50,20,0.55)', 1.5);
}

function flag(x, base, h, color = C.accent) {
  return ln(x, base, x, base - h, '#d8d2c0', 2) + path(`M${x} ${base - h} q 9 -4 18 1 q -3 5 0 11 q -9 -5 -18 -1 z`, color, 'class="flag"');
}

function tire(x, y, rad = 7) {
  return circ(x, y, rad, '#24272b') + `<circle cx="${x}" cy="${y}" r="${rad * 0.42}" fill="#4a4f55"/>`;
}

function blinker(x, y) {
  return `<circle class="blink" cx="${x}" cy="${y}" r="3" fill="#ff4b3a"/>`;
}

function smoke(x, y) {
  return g(`<circle cx="${x}" cy="${y}" r="5" fill="rgba(200,200,205,0.35)"/><circle cx="${x + 4}" cy="${y - 7}" r="6" fill="rgba(200,200,205,0.25)"/><circle cx="${x - 2}" cy="${y - 15}" r="7" fill="rgba(200,200,205,0.16)"/>`, 'class="smoke"');
}

function shadow(w, h, sx = 0.42) {
  return ell(w / 2, h - 7, w * sx, 6, 'rgba(0,0,0,0.35)');
}

function tierOf(level, max) {
  return Math.min(3, 1 + Math.floor(((Math.max(1, level) - 1) * 3) / max));
}

// --- Buildings ------------------------------------------------------------------------------

function hqArt(lvl) {
  const w = 200;
  const h = 165;
  const G = h - 8;
  const t = tierOf(lvl, 8);
  let s = shadow(w, h, 0.44);
  if (t === 1) {
    s += ln(46, G - 52, 18, G, '#cfc6a8', 1.2) + ln(154, G - 52, 182, G, '#cfc6a8', 1.2);
    s += poly(`36,${G} 46,${G - 52} 100,${G - 90} 154,${G - 52} 164,${G}`, C.canvas);
    s += poly(`100,${G - 90} 154,${G - 52} 164,${G} 100,${G}`, 'rgba(0,0,0,0.18)', 'stroke="none"');
    s += ln(100, G - 90, 100, G - 54, 'rgba(0,0,0,0.3)', 1.5);
    s += poly(`82,${G} 100,${G - 50} 118,${G}`, '#2a241e');
    s += poly(`82,${G} 100,${G - 50} 90,${G}`, C.canvasL);
    s += crate(10, G - 20, 20) + crate(14, G - 38, 16, C.wood);
    if (lvl >= 2) s += flag(178, G, 78) + lantern(100, G - 60);
    if (lvl >= 3) s += sandbags(40, G - 8, 3) + sandbags(116, G - 8, 3);
  } else if (t === 2) {
    s += planksV(28, G - 64, 144, 64, C.wood);
    s += corrugated(`18,${G - 62} 100,${G - 100} 182,${G - 62}`, C.roof, 22, 178, G - 96, G - 63);
    s += r(86, G - 44, 28, 44, C.woodD) + circ(108, G - 22, 1.8, C.light);
    s += windowLit(42, G - 48, 26, 18) + windowLit(132, G - 48, 26, 18);
    s += ln(146, G - 76, 146, G - 128, '#b8bec4', 2) + ln(140, G - 118, 152, G - 118, '#b8bec4', 1.6) + ln(141, G - 106, 151, G - 106, '#b8bec4', 1.6) + blinker(146, G - 129);
    s += flag(100, G - 99, 30);
    s += lantern(100, G - 52);
    if (lvl >= 5) s += sandbags(18, G - 8, 4) + sandbags(124, G - 8, 4);
    if (lvl >= 6) s += ln(12, G, 12, G - 70, '#9aa3ab', 2.5) + poly(`4,${G - 78} 20,${G - 78} 16,${G - 68} 8,${G - 68}`, C.metalL) + `<polygon class="beam" points="8,${G - 72} -40,${G - 160} 20,${G - 168} 16,${G - 72}" fill="rgba(255,240,190,0.12)"/>`;
  } else {
    s += r(22, G - 58, 156, 58, C.concrete);
    for (let x = 30; x < 172; x += 24) s += ln(x, G - 57, x, G - 1, 'rgba(0,0,0,0.18)', 1.2);
    s += r(86, G - 44, 28, 44, C.metal) + ln(86, G - 30, 114, G - 30, C.metalD, 1.5) + ln(86, G - 16, 114, G - 16, C.metalD, 1.5);
    s += path(`M86 ${G - 44}h28`, 'none', 'stroke="#e0b830" stroke-width="4" stroke-dasharray="4 4"');
    s += planksV(36, G - 104, 128, 46, C.wood);
    s += windowLit(46, G - 94, 22, 16) + windowLit(89, G - 94, 22, 16) + windowLit(132, G - 94, 22, 16);
    s += r(30, G - 112, 140, 9, C.concreteD);
    s += ell(56, G - 124, 13, 7, C.metalL, `${ST} transform="rotate(-25 56 ${G - 124})"`) + ln(56, G - 118, 60, G - 112, L, 2);
    s += ln(150, G - 112, 150, G - 150, '#b8bec4', 2) + ln(143, G - 140, 157, G - 140, '#b8bec4', 1.6) + blinker(150, G - 151);
    s += flag(100, G - 112, 34);
    s += sandbags(14, G - 8, 4) + sandbags(126, G - 8, 4);
    s += lantern(100, G - 52);
    if (lvl >= 8) s += `<polygon class="beam" points="164,${G - 114} 230,${G - 190} 260,${G - 170} 170,${G - 110}" fill="rgba(255,240,190,0.13)"/>` + r(70, G - 56, 60, 10, C.accent, 1);
  }
  return { w, h, svg: s };
}

function gardenArt(lvl) {
  const w = 180;
  const h = 112;
  const G = h - 8;
  const t = tierOf(lvl, 8);
  let s = shadow(w, h, 0.46);
  if (t === 3) {
    s += path(`M14 ${G - 18} V${G - 62} Q90 ${G - 104} 166 ${G - 62} V${G - 18} Z`, 'rgba(170,220,255,0.16)', `stroke="#cfe6f2" stroke-width="2"`);
    for (const x of [40, 65, 90, 115, 140]) s += ln(x, G - 18, x, G - 64 - (x === 90 ? 20 : x === 65 || x === 115 ? 14 : 6), 'rgba(207,230,242,0.7)', 1.5);
  }
  if (t >= 2) {
    s += ln(16, G - 16, 16, G - 58, C.woodL, 2.5) + ln(164, G - 16, 164, G - 58, C.woodL, 2.5) + ln(16, G - 56, 164, G - 56, C.woodL, 2);
    for (let x = 24; x < 160; x += 14) s += `<circle cx="${x}" cy="${G - 52 + ((x * 7) % 6)}" r="5" fill="${C.greenD}"/>`;
    for (let x = 30; x < 160; x += 28) s += `<circle cx="${x}" cy="${G - 46}" r="3" fill="#d9443a"/>`;
    s += barrel(160, G - 26, 15, 22, '#3f5e7a');
  }
  const n = lvl >= 5 ? 4 : lvl >= 2 ? 3 : 2;
  const xs = n === 2 ? [42, 100] : n === 3 ? [16, 64, 112] : [6, 46, 86, 126];
  const bw = n === 4 ? 38 : 44;
  const ph = 4 + lvl * 1.6;
  for (const x of xs) {
    s += r(x, G - 16, bw, 16, C.woodD, 1) + r(x + 3, G - 19, bw - 6, 5, C.soil, 1);
    for (let i = 0; i < 4; i++) {
      const px = x + 7 + i * ((bw - 12) / 3);
      s += ln(px, G - 19, px, G - 19 - ph, C.greenD, 2);
      s += `<circle class="leaf" cx="${px}" cy="${G - 20 - ph}" r="${4 + lvl * 0.35}" fill="${i % 2 ? C.green : C.greenL}" ${ST}/>`;
      if (lvl >= 4 && i % 2 === 0) s += `<circle cx="${px + 2}" cy="${G - 18 - ph}" r="1.8" fill="#f2b84b"/>`;
    }
  }
  if (lvl >= 6) s += ln(170, G, 170, G - 46, C.woodL, 2) + ln(160, G - 36, 180, G - 36, C.woodL, 2) + circ(170, G - 50, 6, '#c9a36a') + poly(`162,${G - 54} 178,${G - 54} 170,${G - 64}`, '#6a5130');
  return { w, h, svg: s };
}

function lumberArt(lvl) {
  const w = 180;
  const h = 118;
  const G = h - 8;
  const t = tierOf(lvl, 8);
  let s = shadow(w, h, 0.46);
  if (t >= 2) {
    s += ln(8, G, 8, G - 62, C.woodD, 3) + ln(100, G, 100, G - 50, C.woodD, 3);
    s += corrugated(`0,${G - 60} 108,${G - 48} 108,${G - 54} 0,${G - 68}`, C.roofL, 4, 104, G - 66, G - 50);
  }
  const rows = 2 + Math.min(2, Math.floor(lvl / 3));
  const rad = 7.5;
  for (let row = 0; row < rows; row++) {
    const count = 6 - row;
    for (let i = 0; i < count; i++) {
      const cx = 18 + row * rad + i * rad * 2 + 0.5;
      const cy = G - rad - row * rad * 1.75;
      s += circ(cx, cy, rad, '#e2b47a') + `<circle cx="${cx}" cy="${cy}" r="${rad * 0.45}" fill="none" stroke="#a87442" stroke-width="1.2"/>`;
    }
  }
  s += r(118, G - 16, 20, 16, C.woodD, 2) + ln(124, G - 16, 136, G - 34, C.woodL, 3) + poly(`132,${G - 38} 142,${G - 32} 138,${G - 28} 129,${G - 33}`, '#b8bec4');
  if (t >= 2) {
    s += ln(146, G, 152, G - 22, C.woodD, 2.5) + ln(172, G, 166, G - 22, C.woodD, 2.5) + r(140, G - 28, 38, 6, C.woodL, 1);
  }
  if (t === 3) {
    s += r(110, G - 52, 50, 10, C.metal, 1) + ln(116, G - 42, 114, G - 18, C.metalD, 2) + ln(154, G - 42, 156, G - 18, C.metalD, 2);
    s += circ(135, G - 56, 10, '#c9cdd2') + `<circle cx="135" cy="${G - 56}" r="2.4" fill="${L}"/>`;
    s += r(160, G - 50, 16, 12, '#a13e2e', 2) + ln(172, G - 50, 172, G - 62, L, 2.5) + smoke(172, G - 68);
  }
  if (lvl >= 2) s += r(146, G - 6, 30, 5, C.woodL, 1);
  return { w, h, svg: s };
}

function scrapArt(lvl) {
  const w = 180;
  const h = 118;
  const G = h - 8;
  const t = tierOf(lvl, 7);
  let s = shadow(w, h, 0.46);
  const k = 0.8 + lvl * 0.06;
  if (t >= 2) {
    s += ln(158, G, 158, G - 92, '#d9a836', 3) + ln(158, G - 88, 96, G - 80, '#d9a836', 3) + ln(150, G - 92, 166, G - 92, '#d9a836', 2);
    s += ln(100, G - 80, 100, G - 54, L, 1.5) + ell(100, G - 50, 10, 4, C.metalD, ST);
  }
  const pile = [
    [10, G],
    [22, G - 22 * k],
    [40, G - 36 * k],
    [58, G - 44 * k],
    [80, G - 34 * k],
    [96, G - 18 * k],
    [108, G],
  ];
  s += poly(pile.map((p) => p.join(',')).join(' '), C.metalD);
  s += r(34, G - 34 * k, 18, 24 * k, '#c9cdd2', 2) + ln(36, G - 22 * k, 50, G - 22 * k, L, 1.5);
  s += tire(70, G - 16 * k, 8) + tire(24, G - 10, 6);
  s += ln(52, G - 40 * k, 90, G - 22 * k, C.metalL, 3) + r(60, G - 12, 16, 10, C.rust, 1);
  s += path(`M112 ${G} v-18 l10 -12 h28 l10 12 h14 v18 z`, C.rust) + r(124, G - 28, 12, 10, '#2b2f33') + r(140, G - 28, 10, 10, '#2b2f33') + tire(126, G, 7) + tire(160, G, 7);
  if (t === 3) {
    s += r(118, G - 64, 40, 34, '#6b7f4f', 2);
    for (let x = 120; x < 156; x += 8) s += ln(x, G - 34, x + 6, G - 40, '#e0b830', 2.5);
    s += blinker(150, G - 68);
  }
  return { w, h, svg: s };
}

function warehouseArt(lvl) {
  const w = 160;
  const h = 118;
  const G = h - 8;
  const t = tierOf(lvl, 7);
  let s = shadow(w, h, 0.46);
  if (t === 1) {
    s += crate(30, G - 24, 24) + crate(56, G - 24, 24) + crate(43, G - 48, 24);
    s += path(`M26 ${G - 30} Q 52 ${G - 62} 84 ${G - 30} L 86 ${G - 14} L 80 ${G - 30} Q 54 ${G - 48} 30 ${G - 30} L 24 ${G - 12} Z`, C.canvasD);
    if (lvl >= 2) s += crate(86, G - 20, 20) + crate(108, G - 20, 20, C.wood) + crate(96, G - 40, 20);
  } else {
    s += r(14, G - 46, 112, 46, C.blue, 1);
    for (let x = 20; x < 122; x += 6) s += ln(x, G - 44, x, G - 2, 'rgba(255,255,255,0.12)', 1.2);
    s += ln(104, G - 46, 104, G, L, 1.5) + ln(110, G - 30, 110, G - 16, L, 2) + ln(118, G - 30, 118, G - 16, L, 2);
    if (t === 3) {
      s += r(24, G - 90, 112, 44, '#8f3b2c', 1);
      for (let x = 30; x < 132; x += 6) s += ln(x, G - 88, x, G - 48, 'rgba(255,255,255,0.1)', 1.2);
      s += ln(150, G, 150, G - 96, '#9aa3ab', 2.5) + poly(`142,${G - 104} 158,${G - 104} 154,${G - 94} 146,${G - 94}`, C.metalL) + `<circle class="glow" cx="150" cy="${G - 96}" r="16" fill="url(#lampGlow)"/>`;
    }
    s += crate(128, G - 22, 22);
    if (lvl % 2 === 0) s += barrel(4, G - 18, 12, 18);
  }
  return { w, h, svg: s };
}

function armoryArt(lvl) {
  const w = 160;
  const h = 118;
  const G = h - 8;
  const t = tierOf(lvl, 8);
  let s = shadow(w, h, 0.46);
  const guns = Math.min(5, 1 + Math.ceil(lvl / 2));
  const rack = (x, y) => {
    let q = r(x, y, 6 + guns * 8, 4, C.woodD) + r(x, y + 34, 6 + guns * 8, 4, C.woodD);
    for (let i = 0; i < guns; i++) q += r(x + 4 + i * 8, y - 4, 4, 40, i % 2 ? C.metalD : '#2f3438', 1);
    return q;
  };
  if (t === 1) {
    s += ln(16, G, 16, G - 60, C.woodD, 3) + ln(144, G, 144, G - 60, C.woodD, 3);
    s += path(`M6 ${G - 58} L80 ${G - 74} L154 ${G - 58} L150 ${G - 52} L80 ${G - 66} L10 ${G - 52} Z`, C.olive);
    s += r(26, G - 24, 66, 6, C.woodL, 1) + ln(32, G - 18, 32, G, C.woodD, 2.5) + ln(86, G - 18, 86, G, C.woodD, 2.5);
    s += rack(98, G - 46) + ammo(30, G - 37) + ammo(56, G - 37) + ammo(40, G - 13);
  } else if (t === 2) {
    s += planksV(20, G - 60, 100, 60, C.woodD, 10);
    s += corrugated(`12,${G - 58} 70,${G - 82} 128,${G - 58}`, C.roof, 16, 124, G - 80, G - 59);
    s += r(56, G - 40, 28, 40, C.wood) + circ(70, G - 51, 9, C.white) + `<circle cx="70" cy="${G - 51}" r="6" fill="${C.red}"/><circle cx="70" cy="${G - 51}" r="3.4" fill="${C.white}"/><circle cx="70" cy="${G - 51}" r="1.5" fill="${C.red}"/>`;
    s += rack(118, G - 46) + ammo(26, G - 14);
  } else {
    s += path(`M14 ${G} V${G - 44} Q 74 ${G - 74} 134 ${G - 44} V${G} Z`, C.concrete);
    s += sandbags(26, G - 58, 5);
    s += r(58, G - 40, 32, 40, C.metal) + path(`M58 ${G - 40}h32`, 'none', 'stroke="#e0b830" stroke-width="4" stroke-dasharray="4 4"');
    s += r(98, G - 30, 26, 14, C.olive, 1) + ln(102, G - 23, 120, G - 23, '#d8c05a', 2);
    s += rack(156 - (6 + guns * 8), G - 46);
    s += ln(8, G, 8, G - 76, '#9aa3ab', 2.5) + `<circle class="glow" cx="8" cy="${G - 78}" r="16" fill="url(#lampGlow)"/>` + poly(`0,${G - 84} 16,${G - 84} 12,${G - 74} 4,${G - 74}`, C.metalL);
  }
  return { w, h, svg: s };
}

function radioArt(lvl) {
  const w = 100;
  const h = 168;
  const G = h - 8;
  const t = tierOf(lvl, 5);
  const H = 74 + lvl * 14;
  let s = shadow(w, h, 0.4);
  if (t >= 2) {
    s += planksV(2, G - 32, 36, 32, C.wood, 8) + poly(`-2,${G - 30} 20,${G - 42} 42,${G - 30}`, C.roofL) + windowLit(10, G - 24, 12, 10);
  }
  const lx0 = 42;
  const rx0 = 82;
  const top = G - H;
  const lxT = 58;
  const rxT = 66;
  s += ln(lx0, G, lxT, top, '#a9b6c1', 3) + ln(rx0, G, rxT, top, '#a9b6c1', 3);
  const steps = Math.floor(H / 16);
  for (let i = 0; i < steps; i++) {
    const a = i / steps;
    const b = (i + 1) / steps;
    const y1 = G - H * a;
    const y2 = G - H * b;
    const xl1 = lx0 + (lxT - lx0) * a;
    const xr1 = rx0 + (rxT - rx0) * a;
    const xl2 = lx0 + (lxT - lx0) * b;
    const xr2 = rx0 + (rxT - rx0) * b;
    s += ln(xl1, y1, xr2, y2, '#8996a1', 1.5) + ln(xr1, y1, xl2, y2, '#8996a1', 1.5) + ln(xl2, y2, xr2, y2, '#8996a1', 1.5);
  }
  s += ln(62, top, 62, top - 14, '#d8d2c0', 2) + blinker(62, top - 15);
  s += g(
    `<path d="M50 ${top - 18} a 14 14 0 0 0 0 16" fill="none" stroke="#ffd36b" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M74 ${top - 18} a 14 14 0 0 1 0 16" fill="none" stroke="#ffd36b" stroke-width="2" stroke-linecap="round"/>`,
    'class="waves"',
  );
  if (t === 3) s += ell(84, G - H * 0.55, 12, 7, C.metalL, `${ST} transform="rotate(30 84 ${G - H * 0.55})"`) + ln(76, G - H * 0.55, 70, G - H * 0.52, L, 2);
  if (lvl >= 2) s += ln(70, G - H * 0.35, 96, G, '#6c7680', 1) + ln(54, G - H * 0.35, 28, G, '#6c7680', 1);
  return { w, h, svg: s };
}

function bunkArt(lvl) {
  const w = 160;
  const h = 125;
  const G = h - 8;
  const t = tierOf(lvl, 6);
  let s = shadow(w, h, 0.46);
  const clothes = () => ln(10, G - 50, 150, G - 46, '#cfc6a8', 1) + r(30, G - 50, 10, 14, '#6e8fb0', 1) + r(58, G - 49, 12, 12, '#b0584a', 1) + r(112, G - 47, 10, 14, '#d8c05a', 1);
  if (t === 1) {
    s += ln(10, G, 10, G - 54, C.woodD, 2.5) + ln(150, G, 150, G - 50, C.woodD, 2.5) + clothes();
    s += poly(`14,${G} 44,${G - 40} 74,${G}`, '#6f7d58') + poly(`36,${G} 44,${G - 28} 52,${G}`, '#2a241e');
    s += poly(`84,${G} 114,${G - 40} 144,${G}`, '#7a6a4e') + poly(`106,${G} 114,${G - 28} 122,${G}`, '#2a241e');
    if (lvl >= 2) s += r(54, G - 7, 26, 7, '#4f6a8a', 3) + lantern(80, G - 34);
  } else if (t === 2) {
    s += planksV(12, G - 48, 136, 48, C.wood, 10) + corrugated(`4,${G - 46} 80,${G - 72} 156,${G - 46}`, C.roof, 8, 152, G - 70, G - 47);
    s += windowLit(22, G - 36, 18, 14) + windowLit(52, G - 36, 18, 14) + r(74, G - 38, 22, 38, C.woodD) + windowLit(114, G - 36, 18, 14);
    if (lvl >= 4) s += lantern(85, G - 46);
  } else {
    s += planksV(12, G - 46, 136, 46, C.wood, 10) + planksV(22, G - 88, 116, 42, C.woodL, 10);
    s += corrugated(`14,${G - 86} 80,${G - 108} 146,${G - 86}`, C.roof, 18, 142, G - 106, G - 87);
    s += windowLit(20, G - 36, 16, 13) + windowLit(46, G - 36, 16, 13) + r(70, G - 38, 20, 38, C.woodD) + windowLit(100, G - 36, 16, 13) + windowLit(124, G - 36, 16, 13);
    s += windowLit(34, G - 78, 16, 13) + windowLit(72, G - 78, 16, 13) + windowLit(110, G - 78, 16, 13);
    s += ln(148, G, 160, G - 46, C.woodD, 2) + ln(140, G, 152, G - 46, C.woodD, 2);
    for (let i = 1; i < 5; i++) s += ln(140 + i * 2.4, G - i * 9.2, 148 + i * 2.4, G - i * 9.2, C.woodD, 1.6);
  }
  return { w, h, svg: s };
}

function infirmaryArt(lvl) {
  const w = 160;
  const h = 120;
  const G = h - 8;
  const t = tierOf(lvl, 6);
  let s = shadow(w, h, 0.46);
  const cross = (x, y, k = 1) => r(x - 4 * k, y - 11 * k, 8 * k, 22 * k, C.red, 1) + r(x - 11 * k, y - 4 * k, 22 * k, 8 * k, C.red, 1);
  if (t === 1) {
    s += poly(`20,${G} 28,${G - 42} 76,${G - 70} 124,${G - 42} 132,${G}`, C.white);
    s += poly(`76,${G - 70} 124,${G - 42} 132,${G} 76,${G}`, 'rgba(0,0,0,0.12)', 'stroke="none"');
    s += poly(`62,${G} 76,${G - 38} 90,${G}`, '#3a3530') + cross(102, G - 34, 0.8);
    s += r(134, G - 16, 24, 5, '#cfd4d6', 2) + ln(138, G - 11, 138, G, L, 1.8) + ln(154, G - 11, 154, G, L, 1.8);
    if (lvl >= 2) s += lantern(76, G - 46);
  } else if (t === 2) {
    s += planksV(14, G - 56, 118, 56, '#cfc8b6', 10) + corrugated(`6,${G - 54} 73,${G - 80} 140,${G - 54}`, C.roofL, 10, 136, G - 78, G - 55);
    s += r(56, G - 40, 28, 40, '#8f9a9f') + windowLit(22, G - 42, 22, 16) + windowLit(98, G - 42, 22, 16);
    s += cross(73, G - 64, 0.6);
    s += ln(146, G, 146, G - 46, '#cfd4d6', 2) + r(140, G - 48, 12, 14, 'rgba(200,230,255,0.7)', 3) + ln(146, G - 34, 138, G - 20, '#cfd4d6', 1.2);
  } else {
    s += r(8, G - 60, 144, 50, '#dcd7c9', 6) + r(8, G - 28, 144, 8, C.red, 0);
    s += windowLit(20, G - 52, 20, 14) + windowLit(48, G - 52, 20, 14) + windowLit(112, G - 52, 20, 14);
    s += r(76, G - 54, 26, 44, '#8f9a9f') + tire(36, G - 8, 8) + tire(124, G - 8, 8);
    s += `<circle class="glow" cx="128" cy="${G - 76}" r="20" fill="url(#redGlow)"/>` + r(116, G - 88, 24, 24, C.white, 3) + cross(128, G - 76, 0.7);
    s += r(76, G - 10, 26, 4, C.metal) + r(80, G - 6, 18, 4, C.metal);
  }
  return { w, h, svg: s };
}

function truck(x, G, armored = false) {
  const body = armored ? '#4f5f3c' : '#c85f34';
  let s = path(`M${x} ${G - 8} v-18 h40 v-12 h26 l12 14 v16 z`, body);
  s += r(x + 44, G - 35, 18, 11, '#bfe4f2', 2);
  if (armored) s += poly(`${x + 80},${G - 22} ${x + 92},${G - 30} ${x + 94},${G - 4} ${x + 80},${G - 8}`, C.metalL) + r(x + 4, G - 34, 34, 8, C.metalD);
  s += tire(x + 16, G - 6, 8) + tire(x + 64, G - 6, 8);
  return s;
}

function garageArt(lvl) {
  const w = 190;
  const h = 118;
  const G = h - 8;
  const t = tierOf(lvl, 5);
  let s = shadow(w, h, 0.46);
  if (t === 1) {
    s += ln(14, G, 14, G - 56, C.woodD, 3) + ln(118, G, 118, G - 56, C.woodD, 3);
    s += corrugated(`4,${G - 58} 128,${G - 66} 128,${G - 58} 4,${G - 50}`, C.roofL, 8, 124, G - 64, G - 52);
    s += truck(22, G);
    s += barrel(140, G - 18, 12, 18, '#a33a2a') + barrel(156, G - 18, 12, 18, '#3f6e8c');
  } else {
    s += r(6, G - 64, 116, 64, C.metal);
    for (let x = 12; x < 118; x += 6) s += ln(x, G - 62, x, G - 2, 'rgba(255,255,255,0.1)', 1.2);
    s += r(20, G - 48, 88, 48, '#1e2226') + r(20, G - 48, 88, 20, C.metalL);
    for (let y = G - 44; y < G - 28; y += 5) s += ln(22, y, 106, y, 'rgba(0,0,0,0.25)', 1.2);
    if (t === 3) s += r(30, G - 78, 68, 14, C.accent, 2) + lantern(64, G - 56);
    s += truck(100, G, t === 3);
    if (lvl >= 3) s += tire(10, G - 8, 7) + tire(10, G - 20, 7);
  }
  return { w, h, svg: s };
}

function workshopArt(lvl) {
  const w = 170;
  const h = 125;
  const G = h - 8;
  const t = tierOf(lvl, 4);
  let s = shadow(w, h, 0.46);
  const bench = (x) =>
    r(x, G - 26, 84, 8, C.woodL, 1) + ln(x + 6, G - 18, x + 6, G, C.woodD, 3) + ln(x + 78, G - 18, x + 78, G, C.woodD, 3) + r(x + 60, G - 34, 12, 8, C.metal) + ln(x + 20, G - 30, x + 40, G - 30, '#b8bec4', 3);
  if (t === 1) {
    s += ln(10, G, 10, G - 70, C.woodD, 3) + ln(124, G, 124, G - 66, C.woodD, 3);
    s += corrugated(`2,${G - 70} 132,${G - 62} 132,${G - 56} 2,${G - 64}`, C.roofL, 6, 128, G - 68, G - 58);
    s += r(28, G - 58, 80, 26, C.woodD, 1);
    s += ln(40, G - 54, 40, G - 38, '#b8bec4', 2.5) + ln(56, G - 54, 52, G - 38, '#b8bec4', 2.5) + circ(72, G - 46, 5, 'none') + ln(90, G - 54, 96, G - 40, '#b8bec4', 2.5);
    s += bench(26) + crate(132, G - 20, 20);
  } else if (t === 2) {
    s += planksV(10, G - 72, 130, 72, C.wood, 10) + corrugated(`2,${G - 70} 75,${G - 92} 148,${G - 70}`, C.roof, 6, 144, G - 90, G - 71);
    s += r(22, G - 60, 106, 60, '#2a2420') + bench(34);
    s += g(`<circle cx="98" cy="${G - 36}" r="2" fill="#ffe08a"/><circle cx="104" cy="${G - 42}" r="1.5" fill="#ffb347"/><circle cx="94" cy="${G - 44}" r="1.5" fill="#fff3c4"/>`, 'class="sparks"');
    s += crate(144, G - 20, 20);
  } else {
    s += r(10, G - 70, 130, 70, '#7a4b3a');
    for (let y = G - 62; y < G; y += 10) s += ln(11, y, 139, y, 'rgba(0,0,0,0.2)', 1);
    s += poly(`10,${G - 70} 10,${G - 88} 42,${G - 70} 42,${G - 88} 74,${G - 70} 74,${G - 88} 106,${G - 70} 106,${G - 88} 140,${G - 70}`, C.roofL);
    s += r(146, G - 112, 16, 112, '#6b4434') + smoke(154, G - 120);
    s += windowLit(20, G - 56, 22, 16) + windowLit(54, G - 56, 22, 16) + windowLit(88, G - 56, 22, 16) + r(112, G - 40, 22, 40, C.metal);
    if (lvl >= 4) s += sandbags(16, G - 8, 3);
  }
  return { w, h, svg: s };
}

export const ART = {
  hq: hqArt,
  garden: gardenArt,
  lumber: lumberArt,
  scrapyard: scrapArt,
  warehouse: warehouseArt,
  armory: armoryArt,
  radio: radioArt,
  bunkhouse: bunkArt,
  infirmary: infirmaryArt,
  garage: garageArt,
  workshop: workshopArt,
};

const DEFS =
  '<defs>' +
  '<radialGradient id="lampGlow"><stop offset="0" stop-color="rgba(255,200,110,0.55)"/><stop offset="1" stop-color="rgba(255,200,110,0)"/></radialGradient>' +
  '<radialGradient id="redGlow"><stop offset="0" stop-color="rgba(255,80,60,0.5)"/><stop offset="1" stop-color="rgba(255,80,60,0)"/></radialGradient>' +
  '<radialGradient id="fireGlow"><stop offset="0" stop-color="rgba(255,150,60,0.55)"/><stop offset=".5" stop-color="rgba(255,110,40,0.18)"/><stop offset="1" stop-color="rgba(255,110,40,0)"/></radialGradient>' +
  '</defs>';

/** One shared <defs> block, placed once in the page. */
export function artDefs() {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${DEFS}</svg>`;
}

/** Building art at a level (0 = draw level 1, styled as a ghost by CSS). */
export function buildingSvg(id, level, cls = '') {
  const max = BUILDINGS[id].levels.length;
  const a = ART[id](Math.max(1, Math.min(max, level)));
  return { w: a.w, h: a.h, html: `<svg class="art ${cls}" viewBox="0 0 ${a.w} ${a.h}" width="${a.w}" height="${a.h}" overflow="visible">${a.svg}</svg>` };
}

/** Small icon-sized art for panels. */
export function buildingThumb(id, level) {
  const max = BUILDINGS[id].levels.length;
  const a = ART[id](Math.max(1, Math.min(max, level)));
  return `<svg class="thumb" viewBox="-6 -6 ${a.w + 12} ${a.h + 6}" preserveAspectRatio="xMidYMax meet" overflow="visible">${a.svg}</svg>`;
}

// --- Scenery -------------------------------------------------------------------------------

export function campfireSvg() {
  const w = 130;
  const h = 92;
  const G = h - 12;
  let s = `<ellipse class="fireglow" cx="65" cy="${G - 10}" rx="90" ry="60" fill="url(#fireGlow)"/>`;
  s += r(4, G - 6, 36, 9, C.wood, 4, `transform="rotate(-6 22 ${G})"`) + r(90, G - 6, 36, 9, C.wood, 4, `transform="rotate(6 108 ${G})"`);
  s += ln(48, G - 2, 82, G - 14, C.woodD, 6) + ln(48, G - 14, 82, G - 2, C.woodD, 6);
  s += g(
    `<path class="flame f1" d="M52 ${G - 8} C 50 ${G - 26} 60 ${G - 30} 58 ${G - 44} C 70 ${G - 32} 76 ${G - 22} 74 ${G - 8} Z" fill="#ff7a2e"/>` +
      `<path class="flame f2" d="M58 ${G - 8} C 56 ${G - 22} 66 ${G - 26} 66 ${G - 36} C 74 ${G - 26} 76 ${G - 16} 72 ${G - 8} Z" fill="#ffb347"/>` +
      `<path class="flame f3" d="M61 ${G - 8} C 61 ${G - 16} 66 ${G - 18} 66 ${G - 24} C 70 ${G - 18} 70 ${G - 12} 69 ${G - 8} Z" fill="#fff0b0"/>`,
  );
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    s += `<ellipse cx="${65 + Math.cos(a) * 22}" cy="${G - 6 + Math.sin(a) * 6}" rx="5" ry="3.5" fill="#6e6a64" ${ST} stroke-width="1.5"/>`;
  }
  s += ln(40, G + 2, 52, G - 40, '#4a3424', 2) + ln(64, G - 2, 52, G - 40, '#4a3424', 2) + path(`M44 ${G - 30} h16 v6 a8 6 0 0 1 -16 0 z`, '#2d3135');
  return { w, h, html: `<svg class="art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${s}</svg>` };
}

export function rubbleSvg(area) {
  if (area === 'east') {
    const w = 300;
    const h = 150;
    const G = h - 10;
    let s = shadow(w, h, 0.48);
    s += poly(`10,${G} 40,${G - 30} 90,${G - 40} 150,${G - 34} 210,${G - 46} 260,${G - 28} 292,${G}`, '#4a443c');
    s += g(path(`M40 ${G - 30} v-22 l14 -16 h40 l14 16 h22 v22 z`, '#7b3b2b') + r(58, G - 64, 16, 12, '#20242a') + r(80, G - 64, 14, 12, '#20242a'), `transform="rotate(-10 90 ${G - 40})"`);
    s += g(path(`M150 ${G - 40} v-26 l12 -14 h46 l12 14 h18 v26 z`, '#4f6a83') + r(166, G - 78, 18, 12, '#20242a') + r(190, G - 78, 16, 12, '#20242a'), `transform="rotate(8 200 ${G - 50})"`);
    s += tire(30, G - 8, 9) + tire(124, G - 12, 9) + tire(250, G - 10, 10) + tire(268, G - 24, 8);
    s += ln(100, G - 20, 150, G - 8, C.metalL, 3) + r(220, G - 30, 24, 16, C.rust, 2) + r(110, G - 50, 22, 14, '#8a8f94', 2);
    for (let i = 0; i < 9; i++) s += `<circle cx="${30 + i * 28}" cy="${G - 2}" r="7" fill="none" stroke="#8a9096" stroke-width="1.4"/>`;
    return { w, h, html: `<svg class="art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${s}</svg>` };
  }
  const w = 250;
  const h = 150;
  const G = h - 10;
  let s = shadow(w, h, 0.48);
  s += poly(`8,${G} 30,${G - 24} 120,${G - 30} 200,${G - 22} 242,${G}`, '#4a443c');
  s += g(planksV(30, G - 80, 90, 70, C.woodD, 10), `transform="rotate(-14 75 ${G - 40})"`);
  s += g(corrugated(`90,${G - 10} 120,${G - 92} 200,${G - 70} 186,${G - 8}`, C.roofL, 100, 190, G - 86, G - 12), '');
  for (let i = 0; i < 7; i++) s += r(150 + (i % 4) * 14, G - 12 - Math.floor(i / 4) * 9, 13, 8, '#9a5a42', 1);
  s += ln(20, G - 6, 70, G - 30, C.woodL, 4) + ln(60, G - 4, 104, G - 18, C.woodL, 4) + r(196, G - 40, 26, 20, 'rgba(160,200,220,0.3)', 1);
  return { w, h, html: `<svg class="art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${s}</svg>` };
}

/** Distant ruined skyline for the parallax layer. */
export function skylineSvg(width, height, seed = 7) {
  const rnd = mulberry32(seed);
  let far = '';
  let near = '';
  let x = -20;
  while (x < width + 40) {
    const bw = 26 + rnd() * 50;
    const bh = 30 + rnd() * 70;
    const top = height - bh;
    const broken = rnd() < 0.45;
    const pts = broken
      ? `${x},${height} ${x},${top + 8} ${x + bw * 0.3},${top} ${x + bw * 0.55},${top + 14} ${x + bw * 0.8},${top + 4} ${x + bw},${top + 18} ${x + bw},${height}`
      : `${x},${height} ${x},${top} ${x + bw},${top} ${x + bw},${height}`;
    far += `<polygon points="${pts}" fill="#1c1a2c"/>`;
    if (rnd() < 0.25) far += `<rect x="${x + bw * 0.3}" y="${top + 12}" width="3" height="4" fill="rgba(255,190,110,0.5)"/>`;
    x += bw + rnd() * 6;
  }
  x = 0;
  while (x < width + 40) {
    const bw = 40 + rnd() * 80;
    const bh = 14 + rnd() * 34;
    near += `<rect x="${x}" y="${height - bh}" width="${bw}" height="${bh}" fill="#151420"/>`;
    if (rnd() < 0.2) near += `<rect x="${x + bw / 2 - 2}" y="${height - bh - 26}" width="4" height="26" fill="#151420"/><rect x="${x + bw / 2 - 12}" y="${height - bh - 40}" width="24" height="16" rx="3" fill="#151420"/>`;
    x += bw + 30 + rnd() * 120;
  }
  const glow = `<ellipse cx="${width * 0.68}" cy="${height}" rx="120" ry="40" fill="rgba(255,120,60,0.18)"/>`;
  return `<svg class="skyline-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none">${glow}${far}${near}</svg>`;
}

/** Ground, paths, the back fence (up to `edge`) and the gate. */
export function groundSvg(W, H, horizon, edge, seed = 3) {
  const rnd = mulberry32(seed);
  let s = `<defs><linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2620"/><stop offset=".35" stop-color="#3a2f26"/><stop offset="1" stop-color="#272019"/></linearGradient></defs>`;
  s += `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#dirt)"/>`;
  // Worn paths between the rows and toward the gate.
  s += `<path d="M0 240 C 120 228 220 240 330 230 S 560 228 700 234 S 980 240 ${W} 230 L ${W} 254 C 980 262 760 256 640 258 S 300 260 160 264 S 40 258 0 268 Z" fill="#46392d" opacity=".85"/>`;
  s += `<path d="M380 232 C 400 242 440 250 470 266" stroke="#46392d" stroke-width="26" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = horizon + 14 + rnd() * (H - horizon - 20);
    const k = 0.6 + rnd() * 0.8;
    s += `<path d="M${x} ${y} l${-3 * k} ${-6 * k} M${x} ${y} l0 ${-8 * k} M${x} ${y} l${3 * k} ${-6 * k}" stroke="${rnd() < 0.5 ? '#3f5a2c' : '#4f6a34'}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W;
    const y = horizon + 20 + rnd() * (H - horizon - 26);
    s += `<ellipse cx="${x}" cy="${y}" rx="${3 + rnd() * 5}" ry="${2 + rnd() * 2}" fill="#544a40"/>`;
  }
  // Palisade along the back, up to the current camp edge; a broken run beyond it.
  const fenceTop = horizon - 26;
  const fenceBase = horizon + 12;
  s += `<line x1="84" y1="${fenceBase - 22}" x2="${edge}" y2="${fenceBase - 22}" stroke="${C.woodD}" stroke-width="5"/>`;
  for (let x = 84; x < W; x += 10) {
    const inside = x < edge;
    if (!inside && rnd() < 0.55) continue;
    const top = inside ? fenceTop + rnd() * 6 : fenceTop + 10 + rnd() * 18;
    const tilt = inside ? 0 : (rnd() - 0.5) * 16;
    s += `<polygon points="${x},${fenceBase} ${x},${top + 6} ${x + 4},${top} ${x + 8},${top + 6} ${x + 8},${fenceBase}" fill="${rnd() < 0.5 ? C.wood : C.woodD}" stroke="${L}" stroke-width="1.5" transform="rotate(${tilt} ${x + 4} ${fenceBase})"/>`;
  }
  // String lights on the fence.
  let bulbs = '';
  for (let x = 96, i = 0; x < edge - 10; x += 26, i++) {
    const y = fenceTop + 10 + Math.sin(i * 1.3) * 3;
    bulbs += `<circle cx="${x}" cy="${y}" r="2.6" fill="${['#ffd27a', '#ff9a6a', '#bfe8ff'][i % 3]}"/>`;
  }
  s += `<path d="M96 ${fenceTop + 10} ${Array.from({ length: Math.max(1, Math.floor((edge - 106) / 26)) }, (_, i) => `L ${96 + (i + 1) * 26} ${fenceTop + 10 + Math.sin((i + 1) * 1.3) * 3}`).join(' ')}" stroke="#2a2520" stroke-width="1" fill="none"/>`;
  s += `<g class="bulbs">${bulbs}</g>`;
  // Gate on the left, with the road leaving the camp.
  s += `<path d="M0 240 C 20 236 40 234 62 234 L 62 258 C 40 260 20 262 0 268 Z" fill="#46392d" opacity=".85"/>`;
  s += `<rect x="14" y="${horizon - 48}" width="9" height="118" fill="${C.woodD}" stroke="${L}" stroke-width="2"/>`;
  s += `<rect x="70" y="${horizon - 48}" width="9" height="118" fill="${C.woodD}" stroke="${L}" stroke-width="2"/>`;
  s += `<rect x="6" y="${horizon - 58}" width="82" height="20" rx="3" fill="${C.wood}" stroke="${L}" stroke-width="2"/>`;
  s += `<text x="47" y="${horizon - 43.5}" text-anchor="middle" font-size="12" font-weight="800" letter-spacing="2" fill="#f1dfb5" font-family="system-ui, sans-serif">CAMP</text>`;
  return `<svg class="ground-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`;
}

/** A survivor figure, ~14x28. */
export function survivorSvg(shirt, pants, skin, hair) {
  return (
    `<svg class="surv-svg" viewBox="0 0 16 30" width="16" height="30" overflow="visible">` +
    `<ellipse cx="8" cy="29" rx="6" ry="1.8" fill="rgba(0,0,0,0.35)"/>` +
    `<rect class="leg l1" x="4.5" y="18" width="3" height="10" rx="1.2" fill="${pants}"/>` +
    `<rect class="leg l2" x="8.5" y="18" width="3" height="10" rx="1.2" fill="${pants}"/>` +
    `<rect x="3" y="9" width="10" height="11" rx="3" fill="${shirt}" stroke="${L}" stroke-width="1"/>` +
    `<circle cx="8" cy="5.5" r="4" fill="${skin}" stroke="${L}" stroke-width="1"/>` +
    `<path d="M4 5 a4 4 0 0 1 8 0 q-4 -2 -8 0z" fill="${hair}"/>` +
    `</svg>`
  );
}

/** Reward drops that wait in the camp: a scavenger crate, a parachuted airdrop. */
export function dropSvg(kind) {
  if (kind === 'short') {
    const s =
      `<ellipse cx="22" cy="40" rx="18" ry="4" fill="rgba(0,0,0,0.35)"/>` +
      r(6, 16, 32, 24, C.woodL, 2) + ln(6, 24, 38, 24, C.woodD, 1.6) + ln(6, 32, 38, 32, C.woodD, 1.6) + r(18, 16, 8, 24, '#e0a83a', 1) +
      `<circle class="drop-shine" cx="34" cy="14" r="3" fill="#fff6c8"/>`;
    return `<svg viewBox="0 0 44 44" width="44" height="44" overflow="visible">${s}</svg>`;
  }
  const s =
    `<ellipse cx="34" cy="108" rx="22" ry="5" fill="rgba(0,0,0,0.35)"/>` +
    `<g class="chute">` +
    path('M4 34 a30 26 0 0 1 60 0 c-5 -4 -10 -4 -15 0 c-5 -4 -10 -4 -15 0 c-5 -4 -10 -4 -15 0 c-5 -4 -10 -4 -15 0 z', '#e65a3f') +
    path('M19 34 c5 -4 10 -4 15 0 c0 -16 -3 -26 -8 -30 c-4 6 -7 16 -7 30 z', '#f2efe6', 'stroke-width="1.5"') +
    path('M49 34 c-5 -4 -10 -4 -15 0 c0 -16 3 -26 8 -30 c4 6 7 16 7 30 z', '#f2efe6', 'stroke-width="1.5"') +
    ln(5, 34, 24, 80, '#d8d2c0', 1) + ln(63, 34, 44, 80, '#d8d2c0', 1) + ln(34, 34, 34, 80, '#d8d2c0', 1) +
    `</g>` +
    r(18, 78, 32, 28, '#5f7a3e', 3) + ln(18, 92, 50, 92, '#3f5528', 2) + r(30, 78, 8, 28, '#3f5528', 1) +
    `<circle class="drop-shine" cx="47" cy="76" r="3.5" fill="#dffbff"/>`;
  return `<svg viewBox="0 0 68 112" width="68" height="112" overflow="visible">${s}</svg>`;
}

/** Scaffolding + a hammering builder over a plot being built. */
export function scaffoldSvg(w, h) {
  const G = h - 8;
  const top = Math.max(14, h * 0.35);
  let s = '';
  for (const x of [w * 0.12, w * 0.88]) s += ln(x, G, x, top, '#c99a5a', 3);
  for (let y = G - 18; y > top + 6; y -= 26) s += ln(w * 0.1, y, w * 0.9, y, '#b5874c', 3) + ln(w * 0.12, y, w * 0.3, y - 22, '#b5874c', 1.6);
  const bx = w * 0.72;
  s += `<g class="builder"><rect x="${bx - 5}" y="${G - 22}" width="10" height="12" rx="3" fill="#e08a2e" stroke="${L}" stroke-width="1"/>` +
    `<rect x="${bx - 4}" y="${G - 10}" width="3" height="10" fill="#3b4a5a"/><rect x="${bx + 1}" y="${G - 10}" width="3" height="10" fill="#3b4a5a"/>` +
    `<circle cx="${bx}" cy="${G - 26}" r="4" fill="#e0b08a" stroke="${L}" stroke-width="1"/><path d="M${bx - 5} ${G - 27} a5 5 0 0 1 10 0 z" fill="#ffd34a" stroke="${L}" stroke-width="1"/>` +
    `<g class="hammer-arm" style="transform-origin:${bx + 4}px ${G - 18}px"><line x1="${bx + 4}" y1="${G - 18}" x2="${bx + 13}" y2="${G - 24}" stroke="${L}" stroke-width="2"/><rect x="${bx + 11}" y="${G - 28}" width="5" height="7" fill="#8c979f" stroke="${L}" stroke-width="1"/></g></g>`;
  return `<svg class="scaffold-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">${s}</svg>`;
}
