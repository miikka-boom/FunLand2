// Hope Street art: inline SVG strings. One street, side view: buildings stand on
// the sidewalk, the yard in front is yours, the barricade keeps the street out.
// Every building has a dark "unclaimed" look and a lit, lived-in look; each
// facility level adds something you can see (sandbags, lights, rooftop gear,
// a banner, a flag) and a sturdier stretch of wall.

import { mulberry32 } from './util.js';

export const WORLD = { h: 360, ground: 200, yardTop: 212, yardBottom: 258, wallY: 266, street: 284 };
export const LEFT = 150;
export const SLOT = 240;
export const BW = 210; // building width inside its slot
export const COUNT = 8;
export const W = LEFT + COUNT * SLOT + 170;

export const slotX = (i) => LEFT + i * SLOT;
export const buildingX = (i) => slotX(i) + (SLOT - BW) / 2;
export const centerX = (i) => slotX(i) + SLOT / 2;

const L = '#15100c';

function rng(seed) {
  return mulberry32(seed);
}

// --- Backdrop ------------------------------------------------------------------------

export function skylineSvg() {
  const r = rng(77);
  let s = '';
  let x = -20;
  while (x < W + 40) {
    const w = 40 + Math.floor(r() * 70);
    const h = 60 + Math.floor(r() * 110);
    const y = WORLD.ground - 30 - h;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h + 40}" fill="#1a1d33"/>`;
    for (let k = 0; k < 4; k++) {
      if (r() < 0.25) s += `<rect x="${x + 6 + Math.floor(r() * (w - 14))}" y="${y + 8 + Math.floor(r() * (h - 20))}" width="4" height="5" fill="#f7c66b" opacity="0.5"/>`;
    }
    if (r() < 0.2) s += `<rect x="${x + w / 2 - 1}" y="${y - 18}" width="2" height="18" fill="#1a1d33"/><circle cx="${x + w / 2}" cy="${y - 19}" r="2" fill="#ff5a4a" opacity="0.7"/>`;
    x += w + Math.floor(r() * 18);
  }
  return `<svg class="skyline" viewBox="0 0 ${W} ${WORLD.h}" width="${W}" height="${WORLD.h}" preserveAspectRatio="none">${s}</svg>`;
}

/** Sidewalk, the yard and the street outside. */
export function groundSvg() {
  const G = WORLD.ground;
  const r = rng(5);
  let s =
    `<rect x="0" y="${G}" width="${W}" height="10" fill="#4a4d55"/>` +
    `<rect x="0" y="${G + 10}" width="${W}" height="${WORLD.h - G - 10}" fill="#2a2c33"/>` +
    `<rect x="0" y="${G + 9}" width="${W}" height="2" fill="#5d616a"/>` +
    `<rect x="0" y="${WORLD.street}" width="${W}" height="${WORLD.h - WORLD.street}" fill="#23252b"/>`;
  for (let x = 20; x < W; x += 70) s += `<rect x="${x}" y="${WORLD.street + 40}" width="34" height="3" fill="#c9a640" opacity="0.55"/>`;
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(r() * W);
    const y = G + 14 + Math.floor(r() * (WORLD.h - G - 20));
    s += r() < 0.5 ? `<path d="M${x} ${y}l${6 + r() * 10} ${2 - r() * 4}l${4 + r() * 6} ${r() * 4}" stroke="#16171b" stroke-width="1" fill="none"/>` : `<ellipse cx="${x}" cy="${y}" rx="${6 + r() * 10}" ry="2" fill="#1b1d22" opacity="0.7"/>`;
  }
  // Left dead end: a brick wall and a tree.
  s += `<rect x="0" y="${G - 70}" width="${LEFT - 30}" height="${WORLD.h - G + 70}" fill="#3a2a26"/><path d="M0 ${G - 70}h${LEFT - 30}" stroke="#57403a" stroke-width="4"/>`;
  for (let y = G - 62; y < WORLD.h; y += 12) for (let x = (y / 12) % 2 ? 0 : 10; x < LEFT - 30; x += 22) s += `<rect x="${x}" y="${y}" width="18" height="8" fill="#47322c"/>`;
  s += `<rect x="${LEFT - 70}" y="${G - 50}" width="6" height="58" fill="#3b2a20"/><circle cx="${LEFT - 67}" cy="${G - 62}" r="26" fill="#1f3a2a"/><circle cx="${LEFT - 82}" cy="${G - 52}" r="16" fill="#24452f"/>`;
  return `<svg class="ground" viewBox="0 0 ${W} ${WORLD.h}" width="${W}" height="${WORLD.h}" preserveAspectRatio="none">${s}</svg>`;
}

// --- Buildings -----------------------------------------------------------------------

const WARM = '#ffcf6e';
const DARK_WIN = '#1c2433';

function win(x, y, w, h, lit, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${lit ? WARM : DARK_WIN}" stroke="${L}" stroke-width="1.5"/>` + (lit ? `<rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${Math.max(2, h * 0.25)}" fill="#fff3c4" opacity="0.5"/>` + extra : `<path d="M${x} ${y + h * 0.3}l${w} ${h * 0.25}M${x} ${y + h * 0.65}l${w} -${h * 0.2}" stroke="#7a5a3a" stroke-width="3"/>`);
}

function sign(x, y, w, h, text, { bg = '#20242c', fg = '#f4efe2', lit, glow = '#ff5aa0', size = 14 } = {}) {
  const color = lit ? fg : '#59606b';
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${bg}" stroke="${L}" stroke-width="1.5"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="900" letter-spacing="1" fill="${color}" ${lit ? `style="filter:drop-shadow(0 0 3px ${glow})"` : ''}>${text}</text>`
  );
}

/** Each building: { h, roof: [x1, x2, y] for rooftop gear, svg(lit) } in a BW-wide box. */
const ART = {
  firehouse: {
    h: 168,
    roof: [70, 190, 40],
    svg: (lit) =>
      `<rect x="12" y="40" width="186" height="128" fill="#9c3b2e" stroke="${L}" stroke-width="2"/>` +
      `<rect x="8" y="34" width="194" height="10" fill="#7a2c22" stroke="${L}" stroke-width="2"/>` +
      `<rect x="14" y="4" width="46" height="40" fill="#8a3427" stroke="${L}" stroke-width="2"/><path d="M10 6l27-6 27 6z" fill="#5a2a22" stroke="${L}" stroke-width="2"/>` +
      `<rect x="27" y="12" width="20" height="18" rx="9" fill="${lit ? '#3a2a1a' : DARK_WIN}" stroke="${L}" stroke-width="1.5"/><path d="M37 16v7" stroke="#d9a63a" stroke-width="5" stroke-linecap="round"/>` +
      win(76, 52, 26, 24, lit) + win(116, 52, 26, 24, lit) + win(156, 52, 26, 24, lit) +
      sign(70, 82, 116, 16, 'STATION 9', { bg: '#efe3c4', fg: '#7a2c22', lit: true, glow: '#ffcf6e', size: 11 }) +
      `<path d="M26 168v-50a26 26 0 0 1 52 0v50z" fill="${lit ? '#ffd27e' : '#4a2420'}" stroke="${L}" stroke-width="2"/>` +
      (lit ? `<rect x="34" y="128" width="36" height="34" rx="4" fill="#c0392b" stroke="${L}" stroke-width="1.5"/><rect x="38" y="134" width="28" height="10" fill="#bfe4f0" stroke="${L}" stroke-width="1"/><rect x="40" y="150" width="24" height="6" fill="#c9d0d6"/><circle cx="40" cy="160" r="2.5" fill="#fff7c0"/><circle cx="64" cy="160" r="2.5" fill="#fff7c0"/>` : '') +
      `<path d="M120 168v-50a26 26 0 0 1 52 0v50z" fill="#b8392c" stroke="${L}" stroke-width="2"/><path d="M122 128h48M121 140h50M121 152h50" stroke="${L}" stroke-width="1.2" opacity="0.6"/>` +
      `<rect x="86" y="118" width="22" height="50" fill="${lit ? '#6a3a22' : '#3a2420'}" stroke="${L}" stroke-width="1.5"/>`,
  },
  diner: {
    h: 150,
    roof: [16, 196, 62],
    svg: (lit) =>
      `<rect x="4" y="62" width="202" height="88" rx="16" fill="#e8dcc0" stroke="${L}" stroke-width="2"/>` +
      `<rect x="4" y="100" width="202" height="9" fill="#2f8f8a" stroke="${L}" stroke-width="1.5"/>` +
      `<rect x="4" y="138" width="202" height="12" rx="4" fill="#c9d0d6" stroke="${L}" stroke-width="1.5"/>` +
      [16, 52, 88, 124].map((x) => win(x, 70, 30, 26, lit, `<path d="M${x + 4} 96v-9h8v9M${x + 18} 96v-9h8v9" fill="#b33a3a" opacity="0.8"/>`)).join('') +
      `<rect x="164" y="104" width="30" height="46" fill="${lit ? '#ffd27e' : DARK_WIN}" stroke="${L}" stroke-width="2"/><rect x="170" y="110" width="18" height="16" fill="${lit ? '#fff0c0' : '#2a3242'}"/>` +
      `<path d="M40 60V30M170 60V30" stroke="#59606b" stroke-width="3"/>` +
      `<rect x="26" y="8" width="158" height="34" rx="6" fill="#2a1e2a" stroke="${L}" stroke-width="2"/>` +
      `<text x="105" y="34" text-anchor="middle" font-size="24" font-style="italic" font-weight="900" fill="${lit ? '#ff6b9a' : '#4a4052'}" ${lit ? 'style="filter:drop-shadow(0 0 4px #ff3a7a)"' : ''}>Rosie's</text>` +
      `<path d="M188 14h12v12c0 5-3 8-6 8s-6-3-6-8z" fill="${lit ? '#fff2d6' : '#59606b'}" stroke="${L}" stroke-width="1.5"/>`,
  },
  hardware: {
    h: 146,
    roof: [14, 196, 34],
    svg: (lit) =>
      `<rect x="6" y="34" width="198" height="112" fill="#b08a5a" stroke="${L}" stroke-width="2"/>` +
      `<rect x="2" y="28" width="206" height="9" fill="#8a6a44" stroke="${L}" stroke-width="2"/>` +
      sign(18, 44, 174, 24, 'HARDWARE', { bg: '#b8352f', fg: '#fff6e6', lit, glow: '#ffb070', size: 18 }) +
      win(14, 80, 70, 42, lit, `<path d="M24 112l12-14 4 4-12 14z" fill="#8c979f"/><path d="M50 116h26M54 108h20" stroke="#6a4a2a" stroke-width="4"/>`) +
      win(126, 80, 70, 42, lit, `<circle cx="150" cy="104" r="9" fill="#c9cdd2" stroke="${L}" stroke-width="1"/><rect x="164" y="96" width="14" height="20" fill="#3f7ac0"/>`) +
      `<rect x="90" y="80" width="30" height="66" fill="${lit ? '#ffd27e' : '#3a3f48'}" stroke="${L}" stroke-width="2"/>` +
      (lit ? '' : `<path d="M90 86h30M90 94h30M90 102h30M90 110h30M90 118h30" stroke="#59606b" stroke-width="2"/>`) +
      `<path d="M190 146l14-60" stroke="#c9a640" stroke-width="3"/><path d="M196 140l6-2M198 128l6-2M200 116l6-2M202 104l5-2" stroke="#c9a640" stroke-width="2"/>`,
  },
  gym: {
    h: 156,
    roof: [14, 196, 40],
    svg: (lit) =>
      `<rect x="6" y="40" width="198" height="116" fill="#6e7378" stroke="${L}" stroke-width="2"/>` +
      `<rect x="2" y="34" width="206" height="9" fill="#555a60" stroke="${L}" stroke-width="2"/>` +
      `<rect x="40" y="48" width="130" height="26" rx="4" fill="#1c1f24" stroke="${L}" stroke-width="2"/>` +
      `<text x="118" y="68" text-anchor="middle" font-size="18" font-weight="900" letter-spacing="2" fill="${lit ? '#ffd23a' : '#4a4d52'}" ${lit ? 'style="filter:drop-shadow(0 0 3px #ffb000)"' : ''}>IRON GYM</text>` +
      `<path d="M50 61h12M47 55v12M65 55v12" stroke="${lit ? '#ffd23a' : '#4a4d52'}" stroke-width="3.5" stroke-linecap="round"/>` +
      win(14, 84, 82, 40, lit, `<path d="M30 124v-18M30 106a7 7 0 1 1 0-.1" stroke="#7a2a2a" stroke-width="6" fill="#b33a3a"/><path d="M50 116h34M54 110v12M80 110v12" stroke="#3a3f48" stroke-width="3"/>`) +
      win(114, 84, 82, 40, lit, `<path d="M124 118h62M130 112v12M180 112v12" stroke="#3a3f48" stroke-width="3"/>`) +
      `<rect x="88" y="128" width="34" height="28" fill="${lit ? '#ffd27e' : '#2a2f38'}" stroke="${L}" stroke-width="2"/><path d="M105 128v28" stroke="${L}" stroke-width="1.5"/>`,
  },
  clinic: {
    h: 160,
    roof: [14, 196, 34],
    svg: (lit) =>
      `<rect x="6" y="34" width="198" height="126" fill="#d9dde0" stroke="${L}" stroke-width="2"/>` +
      `<rect x="6" y="96" width="198" height="7" fill="#3f9a8c"/>` +
      `<rect x="2" y="28" width="206" height="9" fill="#b8bec4" stroke="${L}" stroke-width="2"/>` +
      `<rect x="88" y="2" width="34" height="34" rx="4" fill="${lit ? '#2fbf6a' : '#3a4a42'}" stroke="${L}" stroke-width="2" ${lit ? 'style="filter:drop-shadow(0 0 6px #2fbf6a)"' : ''}/><path d="M105 8v22M94 19h22" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="${lit ? 1 : 0.4}"/>` +
      [16, 58, 140, 182].map((x) => win(x, 46, 22, 20, lit)).join('') +
      [16, 58, 140, 182].map((x) => win(x, 70, 22, 20, lit)).join('') +
      sign(84, 50, 42, 16, 'MERCY', { bg: '#1f3a4a', fg: '#e8f6ff', lit, glow: '#7fd8ff', size: 9 }) +
      `<rect x="62" y="110" width="86" height="8" fill="#9aa4ad" stroke="${L}" stroke-width="1.5"/>` +
      `<rect x="72" y="118" width="66" height="42" fill="${lit ? '#bfe9f5' : '#1f2a36'}" stroke="${L}" stroke-width="2"/><path d="M105 118v42" stroke="${L}" stroke-width="2"/>` +
      `<rect x="150" y="128" width="54" height="32" rx="4" fill="#eef1f4" stroke="${L}" stroke-width="1.5"/><rect x="150" y="138" width="54" height="5" fill="#d6403a"/><circle cx="160" cy="160" r="5" fill="#2a2a2a"/><circle cx="194" cy="160" r="5" fill="#2a2a2a"/><rect x="154" y="130" width="14" height="8" fill="#bfe4f0"/>`,
  },
  motel: {
    h: 160,
    roof: [10, 160, 56],
    svg: (lit) =>
      `<rect x="2" y="56" width="164" height="104" fill="#d98c7a" stroke="${L}" stroke-width="2"/>` +
      `<rect x="0" y="50" width="168" height="8" fill="#a8604f" stroke="${L}" stroke-width="2"/>` +
      `<rect x="2" y="104" width="164" height="6" fill="#8a4f42" stroke="${L}" stroke-width="1.5"/><path d="M2 104v-10h164v10" fill="none" stroke="#e8e3d8" stroke-width="1.5"/>` +
      `<path d="M10 94v10M30 94v10M50 94v10M70 94v10M90 94v10M110 94v10M130 94v10M150 94v10" stroke="#e8e3d8" stroke-width="1.5"/>` +
      [10, 62, 114].map((x, k) => `<rect x="${x}" y="64" width="22" height="30" fill="${lit && k !== 1 ? '#ffd27e' : '#5a3a34'}" stroke="${L}" stroke-width="1.5"/><text x="${x + 11}" y="74" text-anchor="middle" font-size="7" font-weight="900" fill="#f4e6cf">1${k * 2 + 5}</text>` + win(x + 28, 66, 18, 14, lit)).join('') +
      [10, 62, 114].map((x, k) => `<rect x="${x}" y="118" width="22" height="42" fill="${lit && k !== 2 ? '#ffd27e' : '#5a3a34'}" stroke="${L}" stroke-width="1.5"/>` + win(x + 28, 122, 18, 14, lit)).join('') +
      `<path d="M188 160V20" stroke="#59606b" stroke-width="5"/>` +
      `<path d="M188 2l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill="${lit ? '#ffd23a' : '#4a4d52'}" stroke="${L}" stroke-width="1.5" ${lit ? 'style="filter:drop-shadow(0 0 5px #ffb000)"' : ''}/>` +
      `<rect x="170" y="44" width="38" height="58" rx="3" fill="#2a1e2a" stroke="${L}" stroke-width="1.5"/>` +
      `<text x="189" y="58" text-anchor="middle" font-size="7.5" font-weight="900" fill="${lit ? '#ff7ab0' : '#4a4052'}">STAR</text><text x="189" y="68" text-anchor="middle" font-size="7.5" font-weight="900" fill="${lit ? '#ff7ab0' : '#4a4052'}">LITE</text>` +
      `<text x="189" y="82" text-anchor="middle" font-size="6.5" font-weight="900" fill="${lit ? '#7dffa1' : '#3a4a3a'}">MOTEL</text><text x="189" y="95" text-anchor="middle" font-size="5.5" font-weight="900" fill="${lit ? '#ffcf6e' : '#4a4d52'}">VACANCY</text>`,
  },
  radio: {
    h: 176,
    roof: [20, 110, 76],
    svg: (lit) =>
      `<rect x="16" y="76" width="178" height="100" fill="#7a4a3a" stroke="${L}" stroke-width="2"/>` +
      `<rect x="12" y="70" width="186" height="9" fill="#5a3428" stroke="${L}" stroke-width="2"/>` +
      `<path d="M136 72L148 4l12 68" fill="none" stroke="#9aa4ad" stroke-width="3"/><path d="M138 60h20M140 46h16M142 32h12M144 18h8M137 66l20-10M139 52l18-10M141 38l14-10M143 24l10-8" stroke="#9aa4ad" stroke-width="1.5"/>` +
      `<circle cx="148" cy="4" r="3.5" fill="${lit ? '#ff4a3a' : '#5a3a3a'}" ${lit ? 'class="blink" style="filter:drop-shadow(0 0 4px #ff2a1a)"' : ''}/><circle cx="148" cy="38" r="2.5" fill="${lit ? '#ff4a3a' : '#5a3a3a'}"/>` +
      `<path d="M40 70a18 18 0 0 1 28-16" fill="#c9cdd2" stroke="${L}" stroke-width="1.5"/><path d="M54 62l8-10" stroke="${L}" stroke-width="2"/>` +
      sign(30, 84, 110, 20, 'K-HOPE 97.3', { bg: '#1a1a2a', fg: '#9fe6ff', lit, glow: '#3fc8ff', size: 12 }) +
      `<rect x="148" y="86" width="38" height="14" rx="2" fill="${lit ? '#d6403a' : '#3a2a2a'}" stroke="${L}" stroke-width="1.5" ${lit ? 'style="filter:drop-shadow(0 0 4px #ff2a1a)"' : ''}/><text x="167" y="96" text-anchor="middle" font-size="8" font-weight="900" fill="${lit ? '#fff' : '#6a5a5a'}">ON AIR</text>` +
      win(26, 112, 34, 26, lit) + win(70, 112, 34, 26, lit) + win(150, 112, 34, 26, lit) +
      `<rect x="112" y="128" width="30" height="48" fill="${lit ? '#ffd27e' : '#2a2f38'}" stroke="${L}" stroke-width="2"/>`,
  },
  overpass: {
    h: 176,
    roof: [10, 200, 30],
    svg: (lit) =>
      `<rect x="-20" y="26" width="250" height="30" fill="#8a8f96" stroke="${L}" stroke-width="2"/><rect x="-20" y="20" width="250" height="7" fill="#6e737a" stroke="${L}" stroke-width="1.5"/>` +
      `<path d="M-20 20v-8M10 20v-8M40 20v-8M70 20v-8M100 20v-8M130 20v-8M160 20v-8M190 20v-8M220 20v-8M-20 12h250" stroke="#6e737a" stroke-width="2"/>` +
      `<rect x="30" y="2" width="40" height="18" rx="5" fill="#5a6f8a" stroke="${L}" stroke-width="1.5"/><rect x="120" y="4" width="46" height="16" rx="5" fill="#8a3a3a" stroke="${L}" stroke-width="1.5"/>` +
      `<rect x="22" y="56" width="22" height="120" fill="#7a7f86" stroke="${L}" stroke-width="2"/><rect x="166" y="56" width="22" height="120" fill="#7a7f86" stroke="${L}" stroke-width="2"/>` +
      `<rect x="44" y="56" width="122" height="120" fill="#16181d"/>` +
      (lit
        ? `<path d="M46 176v-34l12-6h20l8 6h14l10-8h24l10 8h20v34z" fill="#59606b" stroke="${L}" stroke-width="2"/><rect x="58" y="96" width="94" height="22" rx="3" fill="#efe3c4" stroke="${L}" stroke-width="1.5"/><text x="105" y="111" text-anchor="middle" font-size="10" font-weight="900" fill="#7a2c22">HOPE STREET</text><circle cx="60" cy="70" r="4" fill="${WARM}" style="filter:drop-shadow(0 0 6px #ffcf6e)"/><circle cx="150" cy="70" r="4" fill="${WARM}" style="filter:drop-shadow(0 0 6px #ffcf6e)"/>`
        : `<rect x="56" y="140" width="44" height="22" rx="5" fill="#3a4a5a" stroke="${L}" stroke-width="1.5"/><rect x="110" y="146" width="40" height="18" rx="5" fill="#5a3a2a" stroke="${L}" stroke-width="1.5" transform="rotate(-8 130 155)"/>`),
  },
};

/** Rooftop gear and decorations that come with facility levels. */
function levelDeco(id, level, h) {
  const a = ART[id];
  if (!a || level < 2) return '';
  const [x1, x2, ry] = a.roof;
  let s = '';
  // L2: string lights along the facade and sandbags at the door.
  if (level >= 2) {
    const y = ry + 4;
    s += `<path d="M${x1} ${y}Q${(x1 + x2) / 2} ${y + 14} ${x2} ${y}" fill="none" stroke="#3a3a3a" stroke-width="1"/>`;
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      const x = x1 + (x2 - x1) * t;
      const yy = y + 14 * 4 * t * (1 - t) * 0.5 + 2;
      s += `<circle cx="${x}" cy="${yy}" r="2" fill="${['#ffcf6e', '#ff7a9a', '#7dffa1', '#7fd8ff'][k % 4]}" class="bulb"/>`;
    }
    s += `<g>${[0, 1, 2, 3, 4].map((k) => `<ellipse cx="${18 + k * 16}" cy="${h - 4}" rx="9" ry="5" fill="#a8935e" stroke="${L}" stroke-width="1.2"/>`).join('')}${[0, 1, 2, 3].map((k) => `<ellipse cx="${26 + k * 16}" cy="${h - 11}" rx="9" ry="5" fill="#b8a36e" stroke="${L}" stroke-width="1.2"/>`).join('')}</g>`;
  }
  // L3: rooftop gear.
  if (level >= 3) {
    const gx = x2 - 46;
    if (id === 'clinic' || id === 'radio') s += `<g transform="translate(${x1 + 4} ${ry - 14})"><path d="M0 14l8-12h26l-8 12z" fill="#2f4a7a" stroke="${L}" stroke-width="1.2"/><path d="M4 8h26M12 2l-4 12M22 2l-4 12" stroke="#7fa8e0" stroke-width="0.8"/></g>`;
    else if (id === 'diner' || id === 'motel') s += `<g transform="translate(${x1 + 6} ${ry - 12})"><rect width="40" height="10" fill="#7a5a3a" stroke="${L}" stroke-width="1.2"/><path d="M5 0q3-8 6 0M16 0q3-9 6 0M27 0q3-8 6 0" fill="#4fae7a" stroke="${L}" stroke-width="1"/></g>`;
    else s += `<g transform="translate(${gx} ${ry - 30})"><rect x="6" y="0" width="28" height="22" rx="5" fill="#8a6a44" stroke="${L}" stroke-width="1.4"/><path d="M8 22l-4 8M32 22l4 8M20 22v8" stroke="${L}" stroke-width="2"/><path d="M6 7h28" stroke="${L}" stroke-width="1"/></g>`;
  }
  // L4: a floodlight on the roof, sweeping the street.
  if (level >= 4) {
    const fx = x2 - 14;
    s += `<g><path d="M${fx} ${ry}v-20" stroke="#59606b" stroke-width="2.5"/><rect x="${fx - 6}" y="${ry - 26}" width="12" height="8" rx="2" fill="#d9dde0" stroke="${L}" stroke-width="1.2"/><path class="beam" d="M${fx} ${ry - 22}L${fx + 70} ${ry - 60}L${fx + 80} ${ry - 40}z" fill="#fff4c4" opacity="0.12"/></g>`;
  }
  // L5: a flag on the roof.
  if (level >= 5) s += `<g class="flag"><path d="M${x1 + 50} ${ry}v-30" stroke="#59606b" stroke-width="2.5"/><path d="M${x1 + 51} ${ry - 30}h22l-5 6 5 6h-22z" fill="#ffcf6e" stroke="${L}" stroke-width="1.2"/></g>`;
  return s;
}

export function buildingHeight(id) {
  return ART[id].h;
}

/** The building at a facility level (0 = not reclaimed yet). */
export function buildingSvg(id, level) {
  const a = ART[id];
  const lit = level > 0;
  const h = a.h + 4;
  const glow = lit ? `<ellipse cx="${BW / 2}" cy="${h - 2}" rx="${BW / 2}" ry="10" fill="#ffcf6e" opacity="0.12"/>` : '';
  const grime = lit ? '' : `<path d="M20 ${h - 30}l12-14 6 10 10-16" fill="none" stroke="#3b6a3b" stroke-width="3" opacity="0.6"/><text x="${BW - 40}" y="${h - 40}" font-size="22" font-weight="900" fill="#c9403a" opacity="0.55" transform="rotate(-8 ${BW - 40} ${h - 40})">X</text>`;
  return `<svg viewBox="0 -2 ${BW} ${h}" width="${BW}" height="${h}" overflow="visible">${glow}${a.svg(lit)}${grime}${levelDeco(id, level, a.h)}</svg>`;
}

// --- The wall ------------------------------------------------------------------------

/** One slot's stretch of barricade in front of a building, sturdier with each level. */
export function wallSvg(level, { gate = false, open = false } = {}) {
  const w = SLOT;
  const r = rng(level * 13 + (gate ? 7 : 1));
  let s = '';
  const top = 6;
  const base = 30;
  const segs = gate ? [[0, 82], [158, w]] : [[0, w]];
  for (const [a, b] of segs) {
    if (level <= 1) {
      // Junk: crates, pallets, a car door.
      for (let x = a; x < b - 6; x += 22) {
        const hh = 12 + Math.floor(r() * 10);
        s += r() < 0.5 ? `<rect x="${x}" y="${base - hh}" width="20" height="${hh}" fill="#8a6038" stroke="${L}" stroke-width="1.3"/><path d="M${x} ${base - hh / 2}h20" stroke="${L}" stroke-width="1"/>` : `<rect x="${x}" y="${base - hh}" width="21" height="${hh}" rx="2" fill="#5a6f8a" stroke="${L}" stroke-width="1.3"/>`;
      }
    } else if (level === 2) {
      for (let x = a; x < b; x += 9) s += `<path d="M${x} ${base}v-22l4.5-5 4.5 5v22z" fill="#9a6a3a" stroke="${L}" stroke-width="1.1"/>`;
      s += `<path d="M${a} ${base - 8}H${b}M${a} ${base - 17}H${b}" stroke="#6a4626" stroke-width="2"/>`;
    } else if (level <= 4) {
      s += `<rect x="${a}" y="${top}" width="${b - a}" height="${base - top}" fill="${level === 3 ? '#8a9096' : '#7a8088'}" stroke="${L}" stroke-width="1.5"/>`;
      for (let x = a + 6; x < b; x += 12) s += `<path d="M${x} ${top}v${base - top}" stroke="#5a6068" stroke-width="1.5"/>`;
      if (level === 4) for (let x = a + 4; x < b; x += 10) s += `<path d="M${x} ${top}l3-6 3 6" fill="#c9cdd2" stroke="${L}" stroke-width="0.8"/>`;
      for (let x = a + 8; x < b - 10; x += 34) s += `<ellipse cx="${x}" cy="${base - 2}" rx="9" ry="5" fill="#a8935e" stroke="${L}" stroke-width="1.1"/>`;
    } else {
      s += `<rect x="${a}" y="${top - 4}" width="${b - a}" height="${base - top + 4}" fill="#b8bcc0" stroke="${L}" stroke-width="1.6"/>`;
      for (let x = a; x < b; x += 30) s += `<path d="M${x} ${top - 4}v${base - top + 4}" stroke="#8a9096" stroke-width="1.5"/>`;
      s += `<path d="M${a} ${top + 6}H${b}" stroke="#d6403a" stroke-width="3" stroke-dasharray="10 10"/>`;
    }
  }
  if (gate) {
    const g = open ? `<path d="M84 ${base}v-26l-14 -8v26zM156 ${base}v-26l14 -8v26z" fill="#9a6a3a" stroke="${L}" stroke-width="1.4"/>` : `<rect x="84" y="${top}" width="36" height="${base - top}" fill="#9a6a3a" stroke="${L}" stroke-width="1.5"/><rect x="120" y="${top}" width="36" height="${base - top}" fill="#9a6a3a" stroke="${L}" stroke-width="1.5"/><path d="M84 ${base - 6}l36-18M156 ${base - 6}l-36-18" stroke="#6a4626" stroke-width="2"/>`;
    s += `<rect x="78" y="${top - 12}" width="8" height="${base - top + 12}" fill="#59606b" stroke="${L}" stroke-width="1.3"/><rect x="154" y="${top - 12}" width="8" height="${base - top + 12}" fill="#59606b" stroke="${L}" stroke-width="1.3"/><circle cx="82" cy="${top - 14}" r="3" fill="#ffcf6e" class="bulb"/><circle cx="158" cy="${top - 14}" r="3" fill="#ffcf6e" class="bulb"/>` + g;
  }
  return `<svg viewBox="0 0 ${w} 32" width="${w}" height="32" overflow="visible">${s}</svg>`;
}

/** The frontier barricade across the yard, where your street ends. */
export function frontierSvg() {
  const h = WORLD.wallY - WORLD.ground + 30;
  let s = '';
  for (let y = 4; y < h; y += 14) s += `<rect x="${(y / 14) % 2 ? 0 : 4}" y="${y}" width="22" height="13" rx="2" fill="${(y / 14) % 3 ? '#5a6f8a' : '#8a6038'}" stroke="${L}" stroke-width="1.2"/>`;
  return `<svg viewBox="0 0 28 ${h}" width="28" height="${h}">${s}</svg>`;
}

// --- Yard props ----------------------------------------------------------------------

export function campfireSvg() {
  return (
    `<svg viewBox="0 0 40 36" width="40" height="36" overflow="visible">` +
    `<ellipse cx="20" cy="30" rx="26" ry="8" fill="#ffb347" opacity="0.18" class="fireglow"/>` +
    `<path d="M6 32l28-8M6 24l28 8" stroke="#5a3a22" stroke-width="5" stroke-linecap="round"/>` +
    `<path class="flame" d="M20 4c6 8 10 12 10 18a10 10 0 0 1-20 0c0-6 4-8 6-14 2 4 2 6 4 8 0-4-2-8 0-12z" fill="#ff8a3a"/>` +
    `<path class="flame f2" d="M20 12c3 5 5 7 5 11a5 5 0 0 1-10 0c0-3 2-5 3-8 1 2 1 3 2 4 0-2-1-4 0-7z" fill="#ffd36b"/>` +
    `</svg>`
  );
}

/** Small props in front of a facility, so the yard looks used. */
export function yardPropSvg(id) {
  switch (id) {
    case 'diner':
      return `<svg viewBox="0 0 60 30" width="60" height="30"><rect x="6" y="10" width="40" height="5" fill="#9a6a3a" stroke="${L}" stroke-width="1.2"/><path d="M10 15v12M42 15v12M4 20h48" stroke="#6a4626" stroke-width="3"/><path d="M52 4v8" stroke="#555" stroke-width="2"/><rect x="48" y="12" width="10" height="10" rx="2" fill="#2a2a2a"/><path class="smoke" d="M53 2q-3-4 0-8" stroke="#aaa" stroke-width="2" fill="none" opacity="0.5"/></svg>`;
    case 'hardware':
      return `<svg viewBox="0 0 60 30" width="60" height="30"><rect x="4" y="10" width="44" height="6" fill="#8a6038" stroke="${L}" stroke-width="1.2"/><path d="M8 16v12M44 16v12" stroke="#6a4626" stroke-width="3"/><rect x="12" y="4" width="10" height="6" fill="#d6403a"/><circle cx="34" cy="7" r="3" fill="#ffd36b" class="spark"/></svg>`;
    case 'gym':
      return `<svg viewBox="0 0 60 34" width="60" height="34"><path d="M14 0v8" stroke="#555" stroke-width="2"/><rect x="8" y="8" width="12" height="22" rx="5" fill="#b33a3a" stroke="${L}" stroke-width="1.2"/><path d="M30 26h26M32 21v10M54 21v10" stroke="#3a3f48" stroke-width="3"/></svg>`;
    case 'clinic':
      return `<svg viewBox="0 0 60 30" width="60" height="30"><rect x="2" y="16" width="34" height="6" rx="2" fill="#eef1f4" stroke="${L}" stroke-width="1.2"/><path d="M6 22v6M32 22v6" stroke="#9aa4ad" stroke-width="2"/><path d="M48 2v26M44 28h8" stroke="#9aa4ad" stroke-width="2"/><rect x="44" y="4" width="8" height="10" rx="2" fill="#bfe9f5" stroke="${L}" stroke-width="1"/></svg>`;
    case 'motel':
      return `<svg viewBox="0 0 70 30" width="70" height="30"><path d="M4 28V4M66 28V4M4 6q31 8 62 0" stroke="#59606b" stroke-width="2" fill="none"/><rect x="14" y="8" width="10" height="12" fill="#ff7a9a"/><rect x="30" y="9" width="10" height="14" fill="#7fd8ff"/><rect x="46" y="8" width="10" height="11" fill="#ffd36b"/></svg>`;
    case 'radio':
      return `<svg viewBox="0 0 40 34" width="40" height="34"><path d="M20 34V10" stroke="#59606b" stroke-width="3"/><path d="M10 4h20l-4 8h-12z" fill="#3a3f48" stroke="${L}" stroke-width="1.2"/><path d="M33 4q4 4 0 8M36 1q7 7 0 14" fill="none" stroke="#7fd8ff" stroke-width="1.5" class="waves"/></svg>`;
    default:
      return '';
  }
}

export function zombieSvg(k = 0) {
  const skins = ['#7a9a6a', '#8aa07a', '#6f8a5f', '#9aa88a'];
  const shirts = ['#4a4f5a', '#5a3a3a', '#3a4a5a', '#4a3a2a'];
  const s = skins[k % 4];
  const c = shirts[(k >> 1) % 4];
  return (
    `<svg class="zed" viewBox="0 0 24 44" aria-hidden="true">` +
    `<ellipse cx="12" cy="42.5" rx="6" ry="1.4" fill="#000" opacity="0.35"/>` +
    `<g class="leg l"><path d="M9.5 29v11" stroke="#2c2f36" stroke-width="3.2" stroke-linecap="round"/></g><g class="leg r"><path d="M14.5 29v11" stroke="#2c2f36" stroke-width="3.2" stroke-linecap="round"/></g>` +
    `<path d="M6.5 15.5c0-2 2-3.5 5.5-3.5s5.5 1.5 5.5 3.5V30h-11z" fill="${c}" stroke="${L}" stroke-width="0.8"/>` +
    `<path d="M7 16l9 3M17 16l6 3" stroke="${s}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="13" cy="9" r="4.6" fill="${s}" stroke="${L}" stroke-width="0.8"/><circle cx="14.8" cy="8.4" r="0.9" fill="#ffefa0"/>` +
    `</svg>`
  );
}
