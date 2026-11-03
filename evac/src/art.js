// Procedural SVG art for Road to Evac: five themed districts along one road,
// the squad's van, survivors (map figures + card portraits), guns, zombies
// and the evac chopper. Windows carry class "w" so CSS can light a district
// once it is reclaimed.

import { mulberry32 } from './util.js';

const L = '#14100c';
const ST = `stroke="${L}" stroke-width="2" stroke-linejoin="round"`;
const r = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${ST} ${extra}/>`;
const rr = (x, y, w, h, rx, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${ST} ${extra}/>`;
const poly = (pts, fill, extra = '') => `<polygon points="${pts}" fill="${fill}" ${ST} ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${ST} ${extra}/>`;
const ln = (x1, y1, x2, y2, c = L, w = 2, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const circ = (cx, cy, rad, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}" ${ST} ${extra}/>`;
const win = (x, y, w, h, cls = '') => `<rect class="w ${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

export const WORLD = { h: 360, horizon: 150, base: 230, roadTop: 238, roadBottom: 294 };
export const DIST_W = 900;
export const START_W = 240;
export const EVAC_W = 360;
export const STOPS_X = [130, 300, 470, 640, 810]; // within a district

export function stopX(i) {
  const ci = Math.floor(i / 5);
  return START_W + ci * DIST_W + STOPS_X[i % 5];
}

export function worldWidth(districts) {
  return START_W + districts * DIST_W + EVAC_W;
}

// --- Shared bits ------------------------------------------------------------------------------

function farSkyline(rnd, w, color = '#1a1828', top = 70) {
  let s = '';
  let x = -10;
  while (x < w + 10) {
    const bw = 24 + rnd() * 46;
    const bh = 20 + rnd() * (WORLD.horizon - top);
    s += `<rect x="${x.toFixed(1)}" y="${(WORLD.horizon - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}"/>`;
    if (rnd() < 0.3) s += `<rect class="w far" x="${(x + bw * 0.4).toFixed(1)}" y="${(WORLD.horizon - bh + 10).toFixed(1)}" width="3" height="4"/>`;
    x += bw + rnd() * 8;
  }
  return s;
}

function ground(w) {
  return `<rect x="0" y="${WORLD.horizon}" width="${w}" height="${WORLD.base - WORLD.horizon}" fill="#262420"/>`;
}

function lamp(x, base = WORLD.base) {
  return ln(x, base, x, base - 70, '#596068', 3) + ln(x, base - 70, x + 14, base - 72, '#596068', 3) + `<ellipse class="lampglow" cx="${x + 16}" cy="${base - 64}" rx="22" ry="12"/>` + rr(x + 10, base - 74, 12, 5, 2, '#9aa3ab');
}

function tree(x, base, s = 1, rnd = Math.random) {
  const c = rnd() < 0.5 ? '#2c4428' : '#36522e';
  return ln(x, base, x, base - 24 * s, '#4a3424', 4) + circ(x, base - 34 * s, 16 * s, c) + circ(x - 10 * s, base - 26 * s, 11 * s, c) + circ(x + 11 * s, base - 27 * s, 12 * s, c);
}

function wreck(x, y, color, flip = false) {
  const t = flip ? `transform="translate(${2 * x + 70} 0) scale(-1 1)"` : '';
  return `<g ${t}>${path(`M${x} ${y} v-14 l10 -10 h34 l10 10 h16 v14 z`, color)}${r(x + 14, y - 22, 14, 9, '#1d2228')}${r(x + 32, y - 22, 12, 9, '#1d2228')}${circ(x + 14, y, 6, '#202326')}${circ(x + 56, y, 6, '#202326')}</g>`;
}

function fire(x, y, s = 1) {
  return `<g class="fire" transform="translate(${x} ${y}) scale(${s})"><ellipse class="fireglow" cx="0" cy="-6" rx="34" ry="22"/><path class="flame" d="M-9 0 C -10 -14 -2 -16 -3 -28 C 6 -18 10 -10 9 0 Z" fill="#ff7a2e"/><path class="flame f2" d="M-4 0 C -5 -9 1 -11 1 -18 C 6 -11 7 -6 5 0 Z" fill="#ffd36b"/></g>`;
}

// --- Districts --------------------------------------------------------------------------------

function house(x, rnd) {
  const w = 70 + rnd() * 30;
  const h = 40 + rnd() * 14;
  const roofH = 24 + rnd() * 10;
  const b = WORLD.base;
  const wall = ['#5b6b7a', '#7a6a58', '#6a7a5a', '#7a5a5a', '#8a8070'][Math.floor(rnd() * 5)];
  let s = r(x, b - h, w, h, wall) + poly(`${x - 6},${b - h} ${x + w / 2},${b - h - roofH} ${x + w + 6},${b - h}`, '#3a2e2a');
  s += r(x + w / 2 - 7, b - 22, 14, 22, '#3a2a20');
  s += win(x + 8, b - h + 10, 14, 12) + win(x + w - 22, b - h + 10, 14, 12);
  if (rnd() < 0.6) for (let k = 0; k < Math.floor(w / 9); k++) s += r(x - 4 + k * 9, b - 10, 5, 10, '#d8d2c0', 'stroke-width="1"');
  return { s, w };
}

function suburbs(rnd) {
  let s = farSkyline(rnd, DIST_W, '#1a1a28', 95);
  s += `<g>${ln(560, 150, 560, 90, '#1a1a28', 4)}${ln(590, 150, 590, 90, '#1a1a28', 4)}<ellipse cx="575" cy="84" rx="26" ry="14" fill="#1a1a28"/></g>`;
  s += ground(DIST_W);
  let x = 20;
  while (x < 690) {
    if (rnd() < 0.35) {
      s += tree(x + 20, WORLD.base, 0.9 + rnd() * 0.4, rnd);
      x += 46;
      continue;
    }
    const h = house(x, rnd);
    s += h.s;
    x += h.w + 18 + rnd() * 20;
  }
  // Gas station (the finale).
  const gx = 720;
  const b = WORLD.base;
  s += r(gx + 70, b - 50, 90, 50, '#8a8478') + win(gx + 82, b - 38, 30, 18) + r(gx + 122, b - 34, 16, 34, '#3a2a20');
  s += ln(gx, b, gx, b - 62, '#c9cdd2', 5) + ln(gx + 60, b, gx + 60, b - 62, '#c9cdd2', 5) + r(gx - 14, b - 74, 88, 14, '#c8453a');
  s += `<text x="${gx + 30}" y="${b - 63}" text-anchor="middle" font-size="11" font-weight="900" fill="#fff3c4" font-family="system-ui,sans-serif">GAS</text>`;
  s += rr(gx + 18, b - 30, 10, 30, 2, '#d8d2c0') + rr(gx + 36, b - 30, 10, 30, 2, '#d8d2c0');
  s += lamp(250) + lamp(520);
  return s;
}

function tower(x, rnd, wMin = 60, wMax = 110, hMin = 90, hMax = 170) {
  const w = wMin + rnd() * (wMax - wMin);
  const h = hMin + rnd() * (hMax - hMin);
  const b = WORLD.base;
  const color = ['#3a3f4c', '#454050', '#353b45', '#3f4a52'][Math.floor(rnd() * 4)];
  let s = r(x, b - h, w, h, color);
  const cols = Math.max(2, Math.floor((w - 12) / 16));
  const rows = Math.floor((h - 20) / 16);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const off = rnd() < 0.18 ? 'off' : rnd() < 0.05 ? 'red' : '';
      s += win(x + 8 + i * ((w - 16) / cols) + 2, b - h + 10 + j * 16, 8, 8, off);
    }
  }
  if (rnd() < 0.4) s += ln(x + w * 0.7, b - h, x + w * 0.7, b - h - 18, '#8a929a', 2);
  if (rnd() < 0.3) s += r(x + 8, b - h - 12, 18, 12, '#2a2e36');
  return { s, w };
}

function downtown(rnd) {
  let s = farSkyline(rnd, DIST_W, '#1b1a2e', 40);
  s += ground(DIST_W);
  let x = 10;
  while (x < 700) {
    const t = tower(x, rnd);
    s += t.s;
    if (rnd() < 0.3) s += `<rect class="neon" x="${x + 6}" y="${WORLD.base - 70}" width="${Math.min(46, t.w - 12)}" height="16" rx="3" fill="${rnd() < 0.5 ? '#ff4fa0' : '#4fd8ff'}"/>`;
    x += t.w + 6 + rnd() * 10;
  }
  // The rooftop with the flare (finale).
  const fx = 730;
  const b = WORLD.base;
  s += r(fx, b - 190, 120, 190, '#3d4350');
  for (let i = 0; i < 5; i++) for (let j = 0; j < 10; j++) s += win(fx + 10 + i * 22, b - 178 + j * 17, 10, 9, (i + j) % 5 === 0 ? 'off' : '');
  s += r(fx + 20, b - 200, 80, 10, '#2a2e36') + `<circle class="flare" cx="${fx + 60}" cy="${b - 210}" r="7" fill="#ff5a3a"/>`;
  s += wreck(330, 236, '#7b3b2b') + fire(360, 226, 0.8);
  return s;
}

function industrial(rnd) {
  let s = farSkyline(rnd, DIST_W, '#1c1a26', 80);
  for (let k = 0; k < 4; k++) {
    const cx = 80 + k * 210 + rnd() * 40;
    s += `<g opacity=".9">${ln(cx, 150, cx, 60, '#1c1a26', 4)}${ln(cx, 62, cx + 70, 62, '#1c1a26', 4)}${ln(cx + 66, 62, cx + 66, 90, '#1c1a26', 2)}</g>`;
  }
  s += ground(DIST_W);
  let x = 10;
  const b = WORLD.base;
  while (x < 680) {
    const w = 110 + rnd() * 60;
    const h = 50 + rnd() * 30;
    const col = ['#5a4a42', '#4a4a50', '#6a5040', '#4e5a52'][Math.floor(rnd() * 4)];
    s += r(x, b - h, w, h, col);
    const teeth = Math.floor(w / 26);
    let pts = `${x},${b - h}`;
    for (let k = 0; k < teeth; k++) pts += ` ${x + k * 26 + 26},${b - h - 16} ${x + k * 26 + 26},${b - h}`;
    s += poly(pts, '#3a3a40');
    for (let k = 0; k < teeth; k++) s += win(x + 8 + k * 26, b - h + 12, 14, 10, rnd() < 0.3 ? 'off' : '');
    if (rnd() < 0.7) {
      const cx = x + w - 24;
      s += r(cx, b - h - 70, 14, 70, '#6b4434') + `<g class="smoke"><circle cx="${cx + 7}" cy="${b - h - 80}" r="8" fill="rgba(190,190,200,.25)"/><circle cx="${cx + 13}" cy="${b - h - 94}" r="10" fill="rgba(190,190,200,.16)"/></g>`;
    }
    if (rnd() < 0.5) s += r(x + w + 4, b - 22, 40, 22, ['#3f6e8c', '#8f3b2c', '#5f7a3e'][Math.floor(rnd() * 3)]);
    x += w + 50 + rnd() * 20;
  }
  // The bridge (finale).
  const bx = 720;
  s += r(bx, b - 120, 16, 120, '#5d6670') + r(bx + 140, b - 120, 16, 120, '#5d6670') + r(bx - 4, b - 128, 24, 10, '#4a525a') + r(bx + 136, b - 128, 24, 10, '#4a525a');
  s += path(`M${bx + 8} ${b - 120} Q ${bx + 78} ${b - 40} ${bx + 148} ${b - 120}`, 'none', 'stroke="#8a929a" stroke-width="3"');
  s += r(bx - 10, b - 36, 180, 10, '#6a727a') + win(bx + 4, b - 100, 8, 8) + win(bx + 144, b - 100, 8, 8);
  return s;
}

function hospital(rnd) {
  let s = farSkyline(rnd, DIST_W, '#1b1a2c', 70);
  s += ground(DIST_W);
  const b = WORLD.base;
  // Parking deck.
  s += r(20, b - 80, 200, 80, '#6a6a68');
  for (let k = 0; k < 4; k++) s += r(20, b - 80 + k * 20, 200, 4, '#4a4a48', 'stroke-width="1"');
  for (let k = 0; k < 8; k++) s += win(30 + k * 24, b - 72 + (k % 2) * 20, 14, 8, rnd() < 0.5 ? 'off' : '');
  // Main hospital.
  const hx = 260;
  s += r(hx, b - 150, 330, 150, '#c7d0d2');
  for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++) s += win(hx + 12 + i * 26, b - 138 + j * 19, 14, 10, rnd() < 0.15 ? 'off' : rnd() < 0.06 ? 'red' : '');
  s += r(hx + 140, b - 40, 50, 40, '#8a9a9e') + rr(hx + 130, b - 176, 70, 26, 4, '#e6e1d3');
  s += `<text x="${hx + 165}" y="${b - 158}" text-anchor="middle" font-size="14" font-weight="900" fill="#c8453a" font-family="system-ui,sans-serif">MERCY</text>`;
  s += r(hx + 290, b - 170, 30, 30, '#e6e1d3') + r(hx + 301, b - 166, 8, 22, '#c8453a', 'stroke="none"') + r(hx + 294, b - 159, 22, 8, '#c8453a', 'stroke="none"');
  // Ambulance.
  s += path(`M630 ${b} v-26 h50 v-10 h20 l12 14 v22 z`, '#e6e1d3') + r(650, b - 22, 20, 6, '#c8453a', 'stroke="none"') + circ(648, b, 6, '#202326') + circ(698, b, 6, '#202326');
  // Helipad tower (finale).
  const tx = 760;
  s += r(tx, b - 160, 110, 160, '#b8c2c4');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) s += win(tx + 10 + i * 25, b - 148 + j * 20, 14, 10);
  s += r(tx - 10, b - 170, 130, 10, '#6a727a') + `<text x="${tx + 55}" y="${b - 174}" text-anchor="middle" font-size="16" font-weight="900" fill="#ffd36b" font-family="system-ui,sans-serif">H</text>`;
  s += lamp(610);
  return s;
}

function military(rnd) {
  let s = farSkyline(rnd, DIST_W, '#1a1a26', 100);
  s += ground(DIST_W);
  const b = WORLD.base;
  // Fence with barbed wire along the back.
  for (let x = 0; x < DIST_W; x += 40) s += ln(x, b - 4, x, b - 44, '#6a6f74', 2);
  s += ln(0, b - 40, DIST_W, b - 40, '#6a6f74', 1.5) + ln(0, b - 20, DIST_W, b - 20, '#6a6f74', 1.5);
  for (let x = 6; x < DIST_W; x += 14) s += `<circle cx="${x}" cy="${b - 46}" r="5" fill="none" stroke="#7a7f84" stroke-width="1.2"/>`;
  // Hangars.
  for (const hx of [40, 300]) {
    s += path(`M${hx} ${b} V ${b - 50} Q ${hx + 100} ${b - 130} ${hx + 200} ${b - 50} V ${b} Z`, '#56604a');
    s += r(hx + 60, b - 56, 80, 56, '#2a2e2a') + win(hx + 20, b - 60, 14, 10) + win(hx + 166, b - 60, 14, 10);
  }
  // Watchtower.
  s += ln(560, b, 572, b - 90, '#6a5a44', 3) + ln(604, b, 592, b - 90, '#6a5a44', 3) + r(560, b - 112, 44, 24, '#5a4a38') + win(568, b - 106, 28, 10) + poly(`556,${b - 112} 582,${b - 128} 608,${b - 112}`, '#3a3a34');
  // Control tower (finale).
  const tx = 760;
  s += r(tx + 30, b - 120, 44, 120, '#7a7a70') + r(tx + 14, b - 150, 76, 30, '#3a4a50') + win(tx + 20, b - 144, 64, 18);
  s += ln(tx + 52, b - 150, tx + 52, b - 176, '#c9cdd2', 2) + `<circle class="blink" cx="${tx + 52}" cy="${b - 178}" r="3" fill="#ff4b3a"/>`;
  for (let k = 0; k < 6; k++) s += rr(640 + k * 15, b - 9, 16, 9, 4, '#a89874', 'stroke-width="1.4"');
  return s;
}

const THEMES = [suburbs, downtown, industrial, hospital, military];

export function districtSvg(ci) {
  const rnd = mulberry32(1000 + ci * 77);
  const body = THEMES[ci](rnd);
  return `<svg class="dist-svg" viewBox="0 0 ${DIST_W} ${WORLD.h}" width="${DIST_W}" height="${WORLD.h}">${body}</svg>`;
}

/** Where it starts: the house you woke up in. */
export function startSvg() {
  const rnd = mulberry32(5);
  const b = WORLD.base;
  let s = farSkyline(rnd, START_W, '#1a1a28', 100) + ground(START_W);
  s += r(30, b - 56, 110, 56, '#6a5a50') + poly(`22,${b - 56} 85,${b - 92} 148,${b - 56}`, '#2e2622') + r(78, b - 26, 16, 26, '#20180f');
  s += win(42, b - 44, 18, 14, 'off') + win(108, b - 44, 18, 14);
  s += fire(120, b - 56, 0.7) + tree(190, b, 1.1, rnd);
  return `<svg class="dist-svg" viewBox="0 0 ${START_W} ${WORLD.h}" width="${START_W}" height="${WORLD.h}">${s}</svg>`;
}

/** The helipad at the end of the road. */
export function evacSvg() {
  const b = WORLD.base;
  let s = ground(EVAC_W);
  s += r(60, b - 14, 240, 14, '#4a4c50') + `<text x="180" y="${b - 3}" text-anchor="middle" font-size="12" font-weight="900" fill="#ffd36b" font-family="system-ui,sans-serif">H</text>`;
  for (let k = 0; k < 7; k++) s += `<circle class="padlight" cx="${70 + k * 36}" cy="${b - 16}" r="3" fill="#7dffa1"/>`;
  return `<svg class="dist-svg" viewBox="0 0 ${EVAC_W} ${WORLD.h}" width="${EVAC_W}" height="${WORLD.h}">${s}</svg>`;
}

export function heliSvg() {
  return (
    `<svg viewBox="0 0 180 80" width="180" height="80" overflow="visible">` +
    `<g class="rotor"><rect x="10" y="4" width="160" height="4" rx="2" fill="#2a2e34"/></g>` +
    ln(90, 8, 90, 18, '#2a2e34', 4) +
    path('M40 30 Q 50 18 90 18 Q 130 18 140 34 L 140 54 Q 120 60 70 60 Q 44 58 40 46 Z', '#4f5f3c') +
    path('M120 26 L 172 30 L 172 38 L 132 44 Z', '#4f5f3c') +
    path('M50 28 Q 58 22 76 22 L 76 40 L 50 40 Z', '#9fd8f0') +
    ln(56, 60, 56, 70, L, 2) + ln(120, 60, 120, 70, L, 2) + ln(46, 70, 132, 70, L, 3) +
    `<circle class="blink" cx="140" cy="36" r="2.5" fill="#ff4b3a"/></svg>`
  );
}

/** The whole road: asphalt, lane, curbs, sidewalks, verge, some wrecks. */
export function roadSvg(w, seed = 9) {
  const rnd = mulberry32(seed);
  const { roadTop: top, roadBottom: bot } = WORLD;
  let s = `<rect x="0" y="${WORLD.base}" width="${w}" height="${top - WORLD.base}" fill="#3a3c40"/>`;
  s += `<rect x="0" y="${top}" width="${w}" height="${bot - top}" fill="#24262a"/>`;
  s += `<rect x="0" y="${top - 3}" width="${w}" height="4" fill="#55575c"/><rect x="0" y="${bot}" width="${w}" height="4" fill="#55575c"/>`;
  s += `<rect x="0" y="${bot + 4}" width="${w}" height="16" fill="#34363a"/><rect x="0" y="${bot + 20}" width="${w}" height="${WORLD.h - bot - 20}" fill="#221f1b"/>`;
  const mid = (top + bot) / 2;
  for (let x = 10; x < w; x += 46) s += `<rect x="${x}" y="${mid - 2}" width="24" height="4" fill="#c9b458" opacity=".75"/>`;
  for (let k = 0; k < w / 140; k++) {
    const x = rnd() * w;
    s += `<path d="M${x} ${top + 8 + rnd() * 30} l${8 + rnd() * 10} ${4 + rnd() * 6} l${6 + rnd() * 8} ${-3 - rnd() * 6}" stroke="#18191c" stroke-width="1.5" fill="none"/>`;
  }
  for (let k = 0; k < w / 260; k++) {
    const x = 60 + rnd() * (w - 120);
    s += wreck(x, bot + 18, ['#6a3a2a', '#3a4a5a', '#5a5a4a', '#7a6a3a'][Math.floor(rnd() * 4)], rnd() < 0.5);
  }
  for (let k = 0; k < w / 90; k++) {
    const x = rnd() * w;
    const y = bot + 24 + rnd() * 40;
    s += `<path d="M${x} ${y} l-3 -6 M${x} ${y} l0 -8 M${x} ${y} l3 -6" stroke="#3f5a2c" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return `<svg class="road-svg" viewBox="0 0 ${w} ${WORLD.h}" width="${w}" height="${WORLD.h}">${s}</svg>`;
}

// --- Vehicles, people, zombies --------------------------------------------------------------------

export function vanSvg() {
  return (
    `<svg viewBox="0 0 120 64" width="120" height="64" overflow="visible">` +
    `<ellipse cx="60" cy="60" rx="54" ry="5" fill="rgba(0,0,0,.4)"/>` +
    path('M6 52 V 22 Q 6 14 14 14 H 78 L 100 30 H 112 Q 116 30 116 36 V 52 Z', '#c9cfc6') +
    r(8, 40, 108, 6, '#c8453a', 'stroke="none"') +
    path('M80 18 L 97 31 H 80 Z', '#9fd8f0') +
    r(16, 20, 26, 14, '#9fd8f0') + r(48, 20, 26, 14, '#9fd8f0') +
    r(12, 6, 70, 8, '#5a4a3a') + rr(18, 0, 20, 8, 2, '#6f8a4a') + rr(42, 1, 16, 7, 2, '#8a6a3a') +
    `<circle class="headlight" cx="114" cy="38" r="3" fill="#fff3c4"/>` +
    `<g class="wheel">${circ(28, 52, 10, '#1e2124')}<circle cx="28" cy="52" r="4" fill="#9aa3ab"/></g>` +
    `<g class="wheel">${circ(94, 52, 10, '#1e2124')}<circle cx="94" cy="52" r="4" fill="#9aa3ab"/></g>` +
    `</svg>`
  );
}

const LOOK = {
  rook: { skin: '#e0b08a', hair: '#2a1d14', top: '#e07a3a', legs: '#3b4a6a', hat: '#262626' },
  doc: { skin: '#c68e64', hair: '#1a1210', top: '#e8e8e0', legs: '#4f8a6a', hat: null },
  mags: { skin: '#8d5a3b', hair: '#1a1a1a', top: '#5f6b3a', legs: '#3a3a30', hat: '#b0383a' },
  sparks: { skin: '#f0c8a0', hair: '#a8743a', top: '#4a6a8a', legs: '#4a6a8a', hat: '#ffd34a' },
  juno: { skin: '#a8714b', hair: '#5a3a1e', top: '#6a3a2a', legs: '#2f2f3a', hat: null },
};

/** Small full-body survivor for the map (about 18x34). */
export function figureSvg(id) {
  const c = LOOK[id];
  let s = `<ellipse cx="10" cy="35" rx="8" ry="2" fill="rgba(0,0,0,.35)"/>`;
  s += `<rect class="leg l1" x="5" y="22" width="4" height="12" rx="1.5" fill="${c.legs}"/><rect class="leg l2" x="11" y="22" width="4" height="12" rx="1.5" fill="${c.legs}"/>`;
  s += `<rect x="3" y="11" width="14" height="13" rx="4" fill="${c.top}" stroke="${L}" stroke-width="1"/>`;
  if (id === 'doc') s += `<rect x="9" y="12" width="2" height="11" fill="#4f8a6a"/>`;
  if (id === 'juno') s += `<rect x="13" y="12" width="6" height="9" rx="2" fill="#6f8a4a" stroke="${L}" stroke-width="1"/>`;
  s += `<circle cx="10" cy="7" r="5" fill="${c.skin}" stroke="${L}" stroke-width="1"/>`;
  if (c.hat === '#ffd34a') s += `<path d="M4 6 a6 6 0 0 1 12 0 z" fill="${c.hat}" stroke="${L}" stroke-width="1"/>`;
  else if (c.hat) s += `<path d="M5 5 a5 5 0 0 1 10 0 h2 v1.5 h-12 z" fill="${c.hat}"/>`;
  else s += `<path d="M5 6 a5 5 0 0 1 10 0 q-5 -3 -10 0z" fill="${c.hair}"/>`;
  return `<svg class="fig" viewBox="0 0 20 38" width="20" height="38" overflow="visible">${s}</svg>`;
}

/** Head-and-shoulders portrait for cards and the squad row. */
export function portraitSvg(id) {
  const c = LOOK[id];
  let s = `<circle cx="50" cy="50" r="48" fill="url(#pbg-${id})"/>`;
  s += `<defs><radialGradient id="pbg-${id}" cx=".5" cy=".35"><stop offset="0" stop-color="#3a4250"/><stop offset="1" stop-color="#1a1e26"/></radialGradient><clipPath id="pc-${id}"><circle cx="50" cy="50" r="48"/></clipPath></defs>`;
  let body = `<path d="M14 104 Q 16 70 50 66 Q 84 70 86 104 Z" fill="${c.top}" stroke="${L}" stroke-width="2"/>`;
  if (id === 'doc') body += `<path d="M44 68 L 50 84 L 56 68" fill="#4f8a6a" stroke="${L}" stroke-width="1.5"/><rect x="62" y="78" width="12" height="12" rx="2" fill="#f1f1ea" stroke="${L}" stroke-width="1.5"/><path d="M68 80 v8 M64 84 h8" stroke="#e0463c" stroke-width="2.4"/>`;
  if (id === 'mags') body += `<path d="M30 78 L 70 92" stroke="#3a3020" stroke-width="5"/>`;
  if (id === 'sparks') body += `<rect x="40" y="74" width="20" height="14" rx="2" fill="#3a5a7a" stroke="${L}" stroke-width="1.5"/>`;
  if (id === 'juno') body += `<path d="M34 70 Q 50 80 66 70 L 64 78 Q 50 86 36 78 Z" fill="#b0584a" stroke="${L}" stroke-width="1.5"/>`;
  if (id === 'rook') body += `<path d="M38 68 Q 50 76 62 68" fill="none" stroke="#b85a2a" stroke-width="4"/>`;
  let head = `<rect x="44" y="52" width="12" height="14" fill="${c.skin}"/><ellipse cx="50" cy="42" rx="17" ry="20" fill="${c.skin}" stroke="${L}" stroke-width="2"/>`;
  head += `<circle cx="43" cy="42" r="2.2" fill="${L}"/><circle cx="57" cy="42" r="2.2" fill="${L}"/><path d="M45 52 Q 50 55 55 52" fill="none" stroke="${L}" stroke-width="1.8" stroke-linecap="round"/>`;
  if (id === 'mags') head += `<path d="M36 46 Q 50 70 64 46 Q 60 60 50 62 Q 40 60 36 46 Z" fill="#1a1a1a"/>`;
  if (id === 'sparks') head += `<rect x="35" y="36" width="30" height="9" rx="4" fill="#9fd8f0" opacity=".85" stroke="${L}" stroke-width="1.5"/>`;
  // Hair / hats.
  if (id === 'rook') head += `<path d="M32 36 Q 34 20 50 20 Q 68 20 68 36 L 76 38 L 64 30 Z" fill="${c.hat}" stroke="${L}" stroke-width="2"/>`;
  if (id === 'doc') head += `<path d="M33 40 Q 32 20 50 20 Q 68 20 67 40 Q 60 28 50 28 Q 40 28 33 40 Z" fill="${c.hair}"/><circle cx="50" cy="18" r="7" fill="${c.hair}"/>`;
  if (id === 'mags') head += `<path d="M33 34 Q 36 20 50 20 Q 64 20 67 34 Z" fill="${c.hat}" stroke="${L}" stroke-width="2"/><path d="M64 30 l10 4 l-9 3" fill="${c.hat}"/>`;
  if (id === 'sparks') head += `<path d="M31 34 Q 32 16 50 16 Q 68 16 69 34 Z" fill="${c.hat}" stroke="${L}" stroke-width="2"/><rect x="28" y="32" width="44" height="5" rx="2" fill="${c.hat}" stroke="${L}" stroke-width="1.5"/>`;
  if (id === 'juno') head += `<path d="M32 44 Q 28 18 50 18 Q 72 18 68 44 Q 70 64 74 72 L 62 64 Q 66 40 50 30 Q 36 40 38 64 L 26 72 Q 30 64 32 44 Z" fill="${c.hair}"/>`;
  s += `<g clip-path="url(#pc-${id})">${body}${head}</g>`;
  return `<svg class="portrait" viewBox="0 0 100 100" overflow="visible">${s}</svg>`;
}

export function zombieSvg(k = 0) {
  const tone = ['#2f3d2c', '#33402e', '#2a352a'][k % 3];
  return (
    `<svg class="zed" viewBox="0 0 20 36" width="20" height="36" overflow="visible">` +
    `<ellipse cx="10" cy="35" rx="7" ry="2" fill="rgba(0,0,0,.35)"/>` +
    `<rect class="leg l1" x="5" y="22" width="4" height="12" rx="1.5" fill="${tone}"/><rect class="leg l2" x="11" y="22" width="4" height="12" rx="1.5" fill="${tone}"/>` +
    `<path d="M4 12 Q 10 8 16 12 L 16 24 L 4 24 Z" fill="${tone}"/><path d="M15 13 L 23 15 M15 16 L 22 19" stroke="${tone}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<circle cx="12" cy="8" r="4.6" fill="#55684a"/><circle cx="14" cy="7.5" r="1" fill="#ff5a3a"/>` +
    `</svg>`
  );
}

// --- Guns (side view, for cards) ------------------------------------------------------------------------

const GUN = {
  smg: () => path('M20 26 H 104 L 112 32 H 128 V 40 H 100 L 92 48 H 74 L 70 66 H 58 L 62 48 H 40 L 34 56 H 20 Z', '#8c979f') + r(76, 46, 10, 22, '#3b4248') + r(128, 32, 18, 6, '#5d6873'),
  shotgun: () => path('M6 30 H 126 V 38 H 70 L 64 44 H 44 L 32 64 H 14 L 24 42 H 6 Z', '#a07448') + r(126, 30, 34, 6, '#8c979f') + rr(84, 38, 30, 9, 3, '#5a4030'),
  rifle: () => path('M8 28 H 98 L 106 24 H 150 V 32 H 112 L 104 38 H 84 L 80 62 H 66 L 70 38 H 44 L 34 54 H 16 L 24 36 H 8 Z', '#6f7a82') + r(66, 38, 12, 24, '#3b4248') + r(60, 16, 34, 8, '#4d575e'),
  hunting: () => path('M4 34 H 116 L 160 30 V 36 L 116 40 H 60 L 46 58 H 26 L 36 40 H 4 Z', '#8a5d36') + rr(54, 18, 46, 10, 4, '#2f353a') + ln(64, 28, 64, 34, L, 2) + ln(90, 28, 90, 34, L, 2),
  auto: () => path('M6 30 H 124 V 38 H 72 L 66 44 H 46 L 34 64 H 16 L 26 42 H 6 Z', '#4a4f55') + r(124, 30, 34, 6, '#8c979f') + circ(82, 50, 14, '#3a3f44') + circ(82, 50, 5, '#8c979f'),
  lmg: () => path('M2 28 H 120 V 38 H 74 L 66 44 H 44 L 32 60 H 14 L 24 40 H 2 Z', '#56606a') + r(120, 30, 40, 6, '#8c979f') + r(70, 36, 26, 22, '#5f6b3a') + ln(140, 36, 132, 62, L, 2) + ln(146, 36, 154, 62, L, 2),
};

export function gunSvg(id) {
  return `<svg class="gun" viewBox="0 0 164 72" overflow="visible">${GUN[id]()}</svg>`;
}
