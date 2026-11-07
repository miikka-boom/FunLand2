// Thrill Hill people art: card portraits and small park figures, both drawn
// from a person's generated `look` (people.js, config LOOK). Pure string
// builders: no DOM, no ids, no randomness, so the same person always gives the
// same SVG, it works in node tests and any number of copies can share a page.
//
// Style: chunky toy cartoon. Thick warm outlines (INK), flat fills with one
// shade tone and one highlight, big heads. Shading uses one trick throughout
// (`toon`): the shape in its shade colour, the same shape scaled a little
// toward a light point in its base colour, then the outline on top.

import { CLASSES, LOOK } from './config.js';

const INK = '#2a1b12';
const CREAM = '#fffaf0';
const GOLD = '#ffc23a';
const MOUTH_IN = '#7a2a22';
const TONGUE = '#ff7d7a';
const SW = 2.4; // portrait outline width (viewBox 100)
const FW = 1.05; // figure outline width (viewBox 30 x 48)

// --- Small helpers ---------------------------------------------------------------------------

const r1 = (v) => {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
};
const r2 = (v) => {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
};

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hex(c) {
  return '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** Mix colour a toward b by t (0..1). */
function mix(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t));
}
const darker = (c, t = 0.25) => mix(c, INK, t);
const lighter = (c, t = 0.35) => mix(c, '#ffffff', t);

/** Ellipse as a path, so `toon` can treat every shape alike. */
const ell = (cx, cy, rx, ry = rx) => `M${r1(cx - rx)} ${r1(cy)}a${rx} ${ry} 0 1 0 ${r1(2 * rx)} 0a${rx} ${ry} 0 1 0 ${r1(-2 * rx)} 0Z`;

/** A shaded, outlined shape: shade fill, base fill shrunk toward the light point (px,py), outline. */
function toon(d, base, sh, px, py, s = 0.9, sw = SW) {
  const t = `matrix(${s} 0 0 ${s} ${r2(px * (1 - s))} ${r2(py * (1 - s))})`;
  return `<path d="${d}" fill="${sh}"/><path d="${d}" fill="${base}" transform="${t}"/><path d="${d}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}
/** A flat outlined shape. */
const flat = (d, fill, sw = SW, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"${extra}/>`;
/** An open stroke. */
const line = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
/** An outlined thick stroke (limbs, straps, cords). */
const limb = (d, color, w, ow) => line(d, INK, w + 2 * ow) + line(d, color, w);

/** Points on an ellipse from angle a0 to a1 (degrees, maths convention: y up). */
function arcPts(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)]);
  }
  return pts;
}
/** Bumpy outline through points: each step an outward arc (clockwise paths bulge outward). */
function bumps(pts, bulge = 1.2) {
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const r = r1((Math.hypot(x1 - x0, y1 - y0) / 2) * bulge);
    d += `A${r} ${r} 0 0 1 ${r1(x1)} ${r1(y1)}`;
  }
  return d;
}
const M = ([x, y]) => `M${r1(x)} ${r1(y)}`;
const Lto = ([x, y]) => `L${r1(x)} ${r1(y)}`;
/** A closed cloud of bumps around an ellipse. */
function cloud(cx, cy, rx, ry, n, start = 90, bulge = 1.25) {
  const pts = arcPts(cx, cy, rx, ry, start, start - 360, n);
  return M(pts[0]) + bumps(pts, bulge) + 'Z';
}
/** Four-point sparkle centred at (x, y). */
const sparkle = (x, y, s) => `M${r1(x)} ${r1(y - s)}Q${r1(x + s * 0.18)} ${r1(y - s * 0.18)} ${r1(x + s)} ${r1(y)}Q${r1(x + s * 0.18)} ${r1(y + s * 0.18)} ${r1(x)} ${r1(y + s)}Q${r1(x - s * 0.18)} ${r1(y + s * 0.18)} ${r1(x - s)} ${r1(y)}Q${r1(x - s * 0.18)} ${r1(y - s * 0.18)} ${r1(x)} ${r1(y - s)}Z`;
/** Five-point star centred at (x, y). */
function star(x, y, R, ri = R * 0.48) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * (Math.PI / 180);
    const rr = i % 2 ? ri : R;
    d += `${i ? 'L' : 'M'}${r1(x + rr * Math.cos(a))} ${r1(y + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}
const mirrorX = (d, cx) =>
  // Mirror a path made only of absolute M/L/C/Q/Z commands around x = cx.
  d.replace(/([MLCQ])([^MLCQZ]*)/g, (_, cmd, args) => {
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    for (let i = 0; i < nums.length; i += 2) nums[i] = r1(2 * cx - nums[i]);
    return cmd + nums.join(' ');
  });

// --- Palettes ---------------------------------------------------------------------------------

/** Six warm skin tones, light to deep: [base, shade]. */
const SKINS = [
  ['#ffe2cb', '#f2bb97'],
  ['#f8c79d', '#e09d6f'],
  ['#e5a473', '#c47f4d'],
  ['#c5814d', '#a0613a'],
  ['#985a39', '#764128'],
  ['#704329', '#55311e'],
];
/** 0..4 natural, 5 grey/white, 6..9 dyed (pink, blue, green, purple). */
const HAIR = ['#33241f', '#5e3a24', '#9c6233', '#d9692d', '#f5ca5e', '#e8e4dc', '#ff74b4', '#3fb0ff', '#47d27a', '#a466ff'];
/** Bright extras: hats, hair ties, sneakers. Never the class colour itself (see accent). */
const ACCENTS = ['#e8483f', '#3d8bf0', '#36c06a', '#f5b82e', '#b25cff', '#ff86c0', '#2fc7c0', '#fffaf0'];
const WOOD = '#c98a4b';
const WOOD_SH = '#9a6234';
const STEEL = '#bcc6d2';
const STEEL_SH = '#8b97a7';
const IRON = '#3a3f4b';

const idx = (list, v) => Math.max(0, list.indexOf(v));
const clampInt = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);

function lookOf(person) {
  const L = (person && person.look) || {};
  return {
    body: LOOK.bodies.includes(L.body) ? L.body : 'medium',
    skin: clampInt(L.skin, 0, SKINS.length - 1, 1),
    face: LOOK.faces.includes(L.face) ? L.face : 'round',
    hair: LOOK.hairStyles.includes(L.hair) ? L.hair : 'short',
    hairColor: clampInt(L.hairColor, 0, HAIR.length - 1, 1),
    hat: LOOK.hats.includes(L.hat) ? L.hat : 'none',
    mascot: clampInt(L.mascot, 0, LOOK.mascots - 1, 0),
    eyes: LOOK.eyes.includes(L.eyes) ? L.eyes : 'dots',
    mouth: LOOK.mouths.includes(L.mouth) ? L.mouth : 'smile',
    extra: LOOK.extras.includes(L.extra) ? L.extra : 'none',
    outfit: L.outfit ? 1 : 0,
    prop: clampInt(L.prop, 0, 2, 0),
    old: !!L.old,
  };
}

/** A stable little number from the look, for picking accent colours. */
function seedOf(L) {
  return (
    L.skin * 7 +
    L.hairColor * 13 +
    idx(LOOK.faces, L.face) * 5 +
    idx(LOOK.hairStyles, L.hair) * 17 +
    idx(LOOK.extras, L.extra) * 3 +
    idx(LOOK.eyes, L.eyes) * 23 +
    idx(LOOK.mouths, L.mouth) * 29 +
    L.prop * 11 +
    L.outfit * 19
  );
}
function accent(L, avoid, salt) {
  let i = (seedOf(L) + salt * 5) % ACCENTS.length;
  for (let n = 0; n < ACCENTS.length && (ACCENTS[i] === avoid[0] || ACCENTS[i] === avoid[1]); n++) i = (i + 1) % ACCENTS.length;
  return ACCENTS[i];
}

function tones(L) {
  const [sb, ss] = SKINS[L.skin];
  const h = HAIR[L.hairColor];
  const grey = L.hairColor === LOOK.grey;
  const hair = { b: h, s: grey ? '#bdb5aa' : darker(h, L.hairColor === 0 ? 0.35 : 0.28), h: lighter(h, L.hairColor === 0 ? 0.28 : 0.42) };
  let brow;
  if (grey) brow = '#a1988c';
  else if (L.hairColor === 4) brow = darker(h, 0.35);
  else if (L.hairColor === 0) brow = h;
  else brow = darker(h, L.hairColor > LOOK.grey ? 0.32 : 0.2);
  if (L.hair === 'bald' && !L.old) brow = darker(ss, 0.45);
  return { skin: { b: sb, s: ss, h: lighter(sb, 0.4), deep: L.skin >= 4 }, hair, brow };
}

function outfitTones(cls, L) {
  const main = L.outfit ? mix(cls.color, cls.dark, 0.32) : cls.color;
  return { b: main, s: darker(main, 0.22), h: lighter(main, 0.35) };
}

/** Moods override the look's own eyes and mouth (reveals, results). */
const MOODS = {
  happy: { eyes: 'happy', mouth: 'grin', brows: 'up' },
  cheer: { eyes: 'happy', mouth: 'laugh', brows: 'up' },
  sad: { eyes: 'sad', mouth: 'frown', brows: 'sad' },
  wow: { eyes: 'wide', mouth: 'o', brows: 'high' },
};

// ==============================================================================================
// PORTRAIT (viewBox 0 0 100 100)
// ==============================================================================================

const FACES = {
  round: { d: ell(50, 45, 22.5, 22), rx: 22.5, top: 23, chin: 67, k: 1.02, eyeY: 47.5, mouthY: 59.5 },
  oval: { d: ell(50, 45.5, 20, 23.5), rx: 20, top: 22, chin: 69, k: 0.91, eyeY: 48.2, mouthY: 61 },
  square: { d: 'M28 38C28 27.5 37 23.5 50 23.5C63 23.5 72 27.5 72 38L72 51C72 62 63 67.5 50 67.5C37 67.5 28 62 28 51Z', rx: 22, top: 23.5, chin: 67.5, k: 1, eyeY: 47.5, mouthY: 59.5 },
};
const BODY_P = {
  slim: { w: 26, T: 76.5, neck: 6.2, ang: 21 },
  medium: { w: 31, T: 76, neck: 7.2, ang: 15 },
  big: { w: 37, T: 74.5, neck: 9, ang: 8 },
};
/** Tops of each hairstyle (canonical head), for headphone bands and flower crowns. */
const HAIR_TOP = { short: 16.5, buzz: 19.5, curly: 14, long: 13.5, pony: 16.5, bun: 17.5, afro: 4.5, mohawk: 19.5, bald: 21, pigtails: 17 };
const CAPPING = ['cap', 'bucket', 'hardhat'];

// --- Background ---------------------------------------------------------------------------------

function bgP(col, golden) {
  const base = golden ? mix(mix(col, '#ffffff', 0.5), GOLD, 0.35) : mix(col, '#ffffff', 0.5);
  const ray = golden ? '#ffe9a0' : mix(col, '#ffffff', 0.64);
  const cx = 50;
  const cy = 44;
  const R = 95;
  const N = 16;
  let d = '';
  for (let i = 0; i < N; i += 2) {
    const a0 = (i / N) * Math.PI * 2 - 0.2;
    const a1 = ((i + 1) / N) * Math.PI * 2 - 0.2;
    d += `M${cx} ${cy}L${r1(cx + R * Math.cos(a0))} ${r1(cy + R * Math.sin(a0))}L${r1(cx + R * Math.cos(a1))} ${r1(cy + R * Math.sin(a1))}Z`;
  }
  return (
    `<rect width="100" height="100" fill="${base}"/>` +
    `<path d="${d}" fill="${ray}" opacity="${golden ? 0.85 : 0.7}"/>` +
    `<circle cx="50" cy="46" r="38" fill="${golden ? '#fff3c4' : mix(col, '#ffffff', 0.78)}" opacity="0.5"/>` +
    `<path d="M0 92Q50 84 100 92V100H0Z" fill="${mix(col, INK, golden ? 0.05 : 0.12)}" opacity="0.18"/>`
  );
}

// --- Hair -------------------------------------------------------------------------------------

const SHORT_TUFT = 'C46.6 14.6 49.2 12.4 53.4 12.2C51.8 14.2 51.8 16.3 52.8 18.4';
function shortFront(tuft) {
  return (
    'M28 46C25.6 31 34.6 18.6 46 18.2' +
    (tuft ? SHORT_TUFT : 'C48 18.1 50.5 18.1 52.8 18.4') +
    'C65.6 19 74.6 31 72 46C70.6 41.5 69 37.5 66.6 34.5C64 36.2 61.6 36.8 59 37C59.6 34.8 59.2 32.6 57.8 31C54.5 34.6 49.5 36.2 44.5 36.6C45.6 34.6 45.6 32.6 44.6 31C41 33.8 36 36.8 32.8 40.8C31 42.5 29.6 44 28 46Z'
  );
}
const BUZZ = 'M28.6 43C27.2 29 36 21.2 50 21.2C64 21.2 72.8 29 71.4 43C70 37.5 67 33.4 63 32.3C56 31.2 44 31.2 37 32.3C33 33.4 30 37.5 28.6 43Z';
const CURLY_FRONT = (() => {
  const outer = arcPts(50, 41.5, 25.5, 24.5, 207, -27, 10);
  const inner = [
    [70.4, 48],
    [69, 39.5],
    [64, 35.2],
    [57.4, 36.8],
    [50, 34.6],
    [42.6, 36.8],
    [36, 35.2],
    [31, 39.5],
    [29.6, 48],
  ];
  return M(outer[0]) + bumps(outer) + Lto(inner[0]) + bumps(inner) + 'Z';
})();
const LONG_BACK = 'M26.5 42C24.5 22 36 15.5 50 15.5C64 15.5 75.5 22 73.5 42C73 58 75.5 72 78.5 86C72 91 62 92 50 92C38 92 28 91 21.5 86C24.5 72 27 58 26.5 42Z';
const LONG_FRONT_L = 'M50 19C37 18.5 27 25 26 40C25 54 26.5 70 22.5 81C27 83.5 32 82.5 35.5 79C33 70 31.5 58 32.5 47C33.5 37 41 30 50 26.5Z';
const LONG_FRONT = LONG_FRONT_L + mirrorX(LONG_FRONT_L, 50);
const PONY_FRONT = 'M28 45C25.6 30 35 18.6 50 18.6C65 18.6 74.4 30 72 45C70.6 39.5 68 35.5 64.6 33C60 35.6 54 36 48 34.6C44 33.6 40 31.6 37.6 29.6C33 33 30 38.6 28 45Z';
const PONY_TAIL = 'M64 23C76 17 88.4 24 88 38C87.6 50 82 60 75 66.6C77.6 57.6 78.6 48 75.6 40C73.6 35 70 31.6 66 30Z';
const BUN_FRONT = 'M28.6 44C27.2 28.6 36.6 19.6 50 19.6C63.4 19.6 72.8 28.6 71.4 44C69.6 37 65.6 32 59.6 30.6C54.6 31.8 45.4 31.8 40.4 30.6C34.4 32 30.4 37 28.6 44Z';
const AFRO_BACK = cloud(50, 37, 30.5, 30, 16, 90, 1.3);
const AFRO_BACK_CAPPED = cloud(50, 43.5, 29.5, 27, 15, 90, 1.3);
const AFRO_FRONT = (() => {
  const outer = arcPts(50, 42, 24.5, 22.5, 203, -23, 9);
  const inner = [
    [70.6, 47],
    [69.6, 39.4],
    [65.4, 34.2],
    [58.6, 34.4],
    [50, 32.6],
    [41.4, 34.4],
    [34.6, 34.2],
    [30.4, 39.4],
    [29.4, 47],
  ];
  return M(outer[0]) + bumps(outer) + Lto(inner[0]) + bumps(inner) + 'Z';
})();
const MOHAWK_FIN = 'M44.2 33C43.2 27 42.6 21 43.6 15L46.6 18.6L47.2 8.6L50.6 15L53.4 5.6L55.6 15L58.6 10.6C58.8 18 58 26 56.4 33C52.2 34 48.2 34 44.2 33Z';
const PIG_FRONT = 'M28 45C25.6 30 35 19 50 19C65 19 74.4 30 72 45C70 38 66.6 33.6 61 31.8C56.6 31 52.6 28.6 50 25.6C47.4 28.6 43.4 31 39 31.8C33.4 33.6 30 38 28 45Z';
const PIG_L = 'M30.6 33.6C19.6 29 11 37 11.6 49C12 59 16 67 22.4 72C21.4 64 22.4 54.6 28.6 45Z';
const PIG_BUNCHES = PIG_L + mirrorX(PIG_L, 50);
const OLD_TUFT_L = cloud(28.2, 42, 3.8, 4.6, 5, 90, 1.25);
const OLD_TUFT_R = cloud(71.8, 42, 3.8, 4.6, 5, 90, 1.25);

function hairBackP(style, t, o) {
  const H = t.hair;
  switch (style) {
    case 'long':
      return toon(LONG_BACK, H.b, H.s, 34, 20, 0.9) + line('M38 70C37 76 37 82 38 88M62 70C63 76 63 82 62 88', H.s, 1.6);
    case 'pony':
      return toon(PONY_TAIL, H.b, H.s, 74, 24, 0.84) + line('M77 30C81.6 36 82.6 46 79.6 55', H.h, 2, ' opacity="0.8"');
    case 'bun':
      return o.capped ? '' : toon(ell(50, 13.6, 8.6, 8.2), H.b, H.s, 46, 9, 0.84) + line('M45.6 11.6Q48 8.4 51.6 8.2', H.h, 1.8);
    case 'afro':
      return toon(o.capped ? AFRO_BACK_CAPPED : AFRO_BACK, H.b, H.s, 36, 14, 0.9);
    case 'pigtails':
      return toon(PIG_BUNCHES, H.b, H.s, 50, 34, 0.9) + line('M15.4 44Q15 54 19 62M84.6 44Q85 54 81 62', H.h, 1.8, ' opacity="0.8"');
    default:
      return '';
  }
}

function hairFrontP(style, t, o) {
  const H = t.hair;
  const shaved = mix(H.b, t.skin.b, 0.42);
  const fuzz = (d) => `<path d="${d}" fill="${shaved}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` + `<g fill="${darker(shaved, 0.18)}"><circle cx="38" cy="27" r="0.7"/><circle cx="44" cy="24" r="0.7"/><circle cx="56" cy="24" r="0.7"/><circle cx="62" cy="27" r="0.7"/><circle cx="50" cy="26" r="0.7"/><circle cx="34" cy="32" r="0.7"/><circle cx="66" cy="32" r="0.7"/></g>`;
  const tie = (x, y, r = 2.8) => toon(ell(x, y, r, r * 0.92), o.tie, darker(o.tie, 0.22), x - r * 0.4, y - r * 0.5, 0.82, 1.8);
  switch (style) {
    case 'short':
      return toon(shortFront(!o.capped), H.b, H.s, 38, 20, 0.92) + line('M34.6 31C37 25.6 41.6 22 47 21', H.h, 2.6);
    case 'buzz':
      return fuzz(BUZZ);
    case 'curly':
      return toon(CURLY_FRONT, H.b, H.s, 40, 20, 0.92) + line('M36 26.6Q39 23 43.6 22', H.h, 2.4) + line('M55.6 23Q59 23.4 61.6 25.6', H.h, 2, ' opacity="0.7"');
    case 'long':
      return toon(LONG_FRONT, H.b, H.s, 40, 20, 0.92) + line('M35.6 28C38.4 24 42.6 21.6 47 21', H.h, 2.6) + line('M29.6 50C29 60 28.6 70 26.6 78M70.4 50C71 60 71.4 70 73.4 78', H.s, 1.4);
    case 'pony':
      return toon(PONY_FRONT, H.b, H.s, 40, 20, 0.92) + line('M37.6 26C41 22.6 45.6 21.4 50 21.4', H.h, 2.6) + tie(67.6, 26.6);
    case 'bun':
      return toon(BUN_FRONT, H.b, H.s, 40, 22, 0.92) + line('M41 30.6C42.6 25.6 46 22 50 20.6M59 30.6C57.4 25.6 54 22 50 20.6', H.s, 1.4) + line('M35 31Q38.4 25.4 44 23', H.h, 2.4) + (o.capped ? '' : toon('M43.6 18.6Q50 16.6 56.4 18.6L56 22.4Q50 20.6 44 22.4Z', o.tie, darker(o.tie, 0.22), 46, 18, 0.85, 1.8));
    case 'afro':
      return toon(AFRO_FRONT, H.b, H.s, 40, 22, 0.92) + line('M36.6 28Q40 24.6 44.6 23.6', H.h, 2.4);
    case 'mohawk':
      return fuzz(BUZZ) + (o.capped ? '' : toon(MOHAWK_FIN, H.b, H.s, 46, 12, 0.88) + line('M46.6 30Q46 24 47.2 18', H.h, 1.8));
    case 'bald':
      return (
        line('M36.6 30.6Q42 25.6 50 25.2', t.skin.h, 3, ' opacity="0.9"') +
        `<circle cx="56.4" cy="26" r="1.5" fill="${t.skin.h}" opacity="0.9"/>` +
        (o.old ? toon(OLD_TUFT_L, H.b, H.s, 27, 40, 0.85, 2) + toon(OLD_TUFT_R, H.b, H.s, 71, 40, 0.85, 2) : '')
      );
    case 'pigtails':
      return toon(PIG_FRONT, H.b, H.s, 40, 22, 0.92) + line('M36 29Q40 24.6 45 23', H.h, 2.4) + tie(29.4, 37.6) + tie(70.6, 37.6);
    default:
      return '';
  }
}

// --- Hats -------------------------------------------------------------------------------------

const CAP_DOME = 'M28.6 36C27.6 21.6 37 13.6 50 13.6C63 13.6 72.4 21.6 71.4 36C60 33 40 33 28.6 36Z';
const CAP_BRIM = 'M27 35.6C40 31.6 62 31.6 74 35.6C80 37.6 83.6 40 83 42.6C74 39 61 37.8 50 37.8C40 37.8 30 38.8 24 41.6C22.6 39.6 23.6 37 27 35.6Z';
const BUCKET_DOME = 'M30 33C29.6 20 38.6 14.6 50 14.6C61.4 14.6 70.4 20 70 33C60 31 40 31 30 33Z';
const BUCKET_BAND = 'M30.2 28.6C40 26.8 60 26.8 69.8 28.6L70 33C60 31 40 31 30 33Z';
const BUCKET_BRIM = 'M29.6 31C23 32.6 17.6 36.6 15 41.6C25 38.6 38 37.6 50 37.6C62 37.6 75 38.6 85 41.6C82.4 36.6 77 32.6 70.4 31C60 29.4 40 29.4 29.6 31Z';
const HARD_DOME = 'M27.6 35C27 19 37 11.6 50 11.6C63 11.6 73 19 72.4 35Z';
const HARD_RIDGE = 'M45.6 12.4C45 20 45 28 45.6 35L54.4 35C55 28 55 20 54.4 12.4C51.4 11.6 48.6 11.6 45.6 12.4Z';
const HARD_BRIM = 'M21 34.4L79 34.4C82 34.4 83.4 36 83.4 37.4C83.4 39 82 40.2 79 40.2L21 40.2C18 40.2 16.6 39 16.6 37.4C16.6 36 18 34.4 21 34.4Z';
const BANDANA_BAND = 'M27.4 34C40 27 60 27 72.6 34L72.6 39.6C60 33 40 33 27.4 39.6Z';
const BANDANA_TAIL1 = 'M71 35C77 30.6 82 29 87.4 29.6C85 33 79.4 36.6 73.6 37.6Z';
const BANDANA_TAIL2 = 'M72 37.6C78 39.6 82.6 43 85.4 48.4C80 47.8 75.6 44.4 71.6 40.6Z';

function flowerP(x, y, r, color) {
  const petals = cloud(x, y, r, r, 5, 90, 1.5);
  return toon(petals, color, darker(color, 0.15), x - r * 0.3, y - r * 0.4, 0.86, 1.7) + `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 0.36)}" fill="${color === '#f5b82e' ? '#ff8a3a' : '#f5b82e'}" stroke="${INK}" stroke-width="1.2"/>`;
}

function hatP(hat, L, t, col) {
  const hc = accent(L, [col, t.hair.b], 1);
  const hs = darker(hc, 0.22);
  switch (hat) {
    case 'cap':
      return (
        toon(CAP_DOME, hc, hs, 40, 18, 0.9) +
        line('M50 14C47.6 20 47 27 47.6 33.4', hs, 1.4) +
        `<circle cx="50" cy="13.8" r="2" fill="${hs}" stroke="${INK}" stroke-width="1.4"/>` +
        `<circle cx="58" cy="25" r="4.6" fill="${hc === CREAM ? col : CREAM}" stroke="${INK}" stroke-width="1.5"/>` +
        `<path d="${star(58, 25.3, 3)}" fill="${hc === '#f5b82e' ? '#e8483f' : '#f5b82e'}"/>` +
        line('M34.6 24Q38 18.6 44 16.6', lighter(hc, 0.4), 2.2) +
        toon(CAP_BRIM, darker(hc, 0.1), darker(hc, 0.32), 40, 34, 0.9)
      );
    case 'headphones': {
      const bt = Math.max(5, HAIR_TOP[L.hair] - 3.6);
      const band = `M23.4 44C23.4 ${r1(bt + 12)} 34 ${r1(bt)} 50 ${r1(bt)}C66 ${r1(bt)} 76.6 ${r1(bt + 12)} 76.6 44`;
      const cupL = 'M18 41.4C18 38.6 20 37.2 23 37.2C26 37.2 28 38.6 28 41.4L28 52.6C28 55.4 26 56.8 23 56.8C20 56.8 18 55.4 18 52.6Z';
      const cupR = mirrorX(cupL, 50);
      return (
        limb(band, hc, 3.6, 1.4) +
        line(band.replace(/^M23.4 44/, 'M25 40'), lighter(hc, 0.45), 1.2, ' opacity="0.8"') +
        toon(cupL, hc, hs, 20, 39, 0.86) +
        toon(cupR, hc, hs, 74, 39, 0.86) +
        `<rect x="26" y="39.6" width="4.6" height="14.8" rx="2.2" fill="${IRON}" stroke="${INK}" stroke-width="1.6"/>` +
        `<rect x="69.4" y="39.6" width="4.6" height="14.8" rx="2.2" fill="${IRON}" stroke="${INK}" stroke-width="1.6"/>` +
        line('M20.6 42V47M76.4 42V47', lighter(hc, 0.5), 1.6)
      );
    }
    case 'bucket': {
      const bc = hc === CREAM ? '#f3d9a4' : hc;
      return (
        toon(BUCKET_DOME, bc, darker(bc, 0.2), 40, 18, 0.9) +
        toon(BUCKET_BAND, darker(bc, 0.3), darker(bc, 0.42), 40, 28, 0.9, 1.8) +
        toon(BUCKET_BRIM, lighter(bc, 0.08), darker(bc, 0.2), 40, 30, 0.92) +
        line('M21 38.6C33 35.4 67 35.4 79 38.6', darker(bc, 0.3), 1.1, ' stroke-dasharray="2 2"') +
        line('M36 22Q40 17.6 46 16.6', lighter(bc, 0.45), 2.2)
      );
    }
    case 'flowers': {
      const top = Math.max(17, HAIR_TOP[L.hair] + 3.5);
      const cy = 2 * top - 36;
      const at = (s) => [(1 - s) * (1 - s) * 28.6 + 2 * s * (1 - s) * 50 + s * s * 71.4, (1 - s) * (1 - s) * 36 + 2 * s * (1 - s) * cy + s * s * 36];
      const cols = ['#ff86c0', CREAM, '#f5b82e', '#b25cff', '#ff86c0', CREAM];
      let leaves = '';
      let fl = '';
      for (let i = 0; i < 6; i++) {
        const s = i / 5;
        const [x, y] = at(s);
        if (i < 5) {
          const [lx, ly] = at(s + 0.1);
          leaves += `<path d="${ell(lx, ly - 1.6, 3.4, 1.8)}" fill="#36c06a" stroke="${INK}" stroke-width="1.4" transform="rotate(${i % 2 ? 30 : -30} ${r1(lx)} ${r1(ly - 1.6)})"/>`;
        }
        fl += flowerP(x, y - 0.6, i === 2 || i === 3 ? 4.8 : 4.1, cols[i]);
      }
      return leaves + fl;
    }
    case 'hardhat': {
      const yc = '#ffcc2e';
      return (
        toon(HARD_DOME, yc, '#e09d14', 40, 16, 0.9) +
        toon(HARD_RIDGE, '#ffdf6e', '#eab02a', 48, 14, 0.9, 1.8) +
        line('M33.6 26Q36.6 18.6 43 15.6', '#fff1b0', 2.2) +
        `<circle cx="63.4" cy="26" r="3.4" fill="#36c06a" stroke="${INK}" stroke-width="1.4"/><path d="M63.4 24.2v3.6M61.6 26h3.6" stroke="${CREAM}" stroke-width="1.4" stroke-linecap="round"/>` +
        toon(HARD_BRIM, '#ffd84a', '#e09d14', 40, 35, 0.94)
      );
    }
    case 'bandana': {
      const dots = [34, 41, 48, 55, 62, 68].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 33.6 : 32.4}" r="0.95"/>`).join('');
      return (
        toon(BANDANA_TAIL2, darker(hc, 0.08), darker(hc, 0.3), 74, 39, 0.88, 2) +
        toon(BANDANA_TAIL1, hc, hs, 74, 33, 0.88, 2) +
        toon(BANDANA_BAND, hc, hs, 40, 30, 0.92, 2.2) +
        `<g fill="${hc === CREAM ? '#e8483f' : CREAM}" opacity="0.9">${dots}</g>` +
        toon(ell(72.8, 37, 3.4, 3.2), hc, hs, 71.6, 35.6, 0.8, 2)
      );
    }
    default:
      return '';
  }
}

// --- Face -------------------------------------------------------------------------------------

function eyeP(kind, x, y, skin) {
  switch (kind) {
    case 'happy':
      return line(`M${r1(x - 3.7)} ${r1(y + 1.2)}Q${r1(x)} ${r1(y - 4.6)} ${r1(x + 3.7)} ${r1(y + 1.2)}`, INK, 2.6);
    case 'wide':
      return (
        `<path d="${ell(x, y, 4.6, 5.1)}" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>` +
        `<circle cx="${r1(x)}" cy="${r1(y + 0.5)}" r="2.7" fill="${INK}"/><circle cx="${r1(x + 1)}" cy="${r1(y - 0.6)}" r="1.1" fill="#ffffff"/>`
      );
    case 'sleepy':
      return (
        `<path d="M${r1(x - 3.4)} ${r1(y)}A3.4 3.4 0 0 0 ${r1(x + 3.4)} ${r1(y)}Z" fill="${INK}"/>` +
        line(`M${r1(x - 3.4)} ${r1(y - 2.2)}Q${r1(x)} ${r1(y - 3.4)} ${r1(x + 3.4)} ${r1(y - 2.2)}`, skin.s, 1.6) +
        line(`M${r1(x - 4.2)} ${r1(y)}L${r1(x + 4.2)} ${r1(y)}`, INK, 2.3) +
        `<circle cx="${r1(x + 1)}" cy="${r1(y + 1.2)}" r="0.8" fill="#ffffff"/>`
      );
    case 'closed':
      return line(`M${r1(x - 3.6)} ${r1(y)}Q${r1(x)} ${r1(y + 3.6)} ${r1(x + 3.6)} ${r1(y)}`, INK, 2.4);
    case 'sad':
      return `<path d="${ell(x, y + 0.6, 2.5, 3.2)}" fill="${INK}"/><circle cx="${r1(x + 0.9)}" cy="${r1(y - 0.6)}" r="1" fill="#ffffff"/>`;
    default: // dots
      return `<path d="${ell(x, y, 2.8, 3.7)}" fill="${INK}"/><circle cx="${r1(x + 1)}" cy="${r1(y - 1.3)}" r="1.15" fill="#ffffff"/>`;
  }
}

function browsP(kind, xl, xr, by, color) {
  const w = 2.7;
  switch (kind) {
    case 'up':
      return line(`M${r1(xl - 4)} ${r1(by - 0.6)}Q${r1(xl)} ${r1(by - 4)} ${r1(xl + 4)} ${r1(by - 1)}M${r1(xr - 4)} ${r1(by - 1)}Q${r1(xr)} ${r1(by - 4)} ${r1(xr + 4)} ${r1(by - 0.6)}`, color, w);
    case 'high':
      return line(`M${r1(xl - 4)} ${r1(by - 1.6)}Q${r1(xl)} ${r1(by - 5.4)} ${r1(xl + 4)} ${r1(by - 2.2)}M${r1(xr - 4)} ${r1(by - 2.2)}Q${r1(xr)} ${r1(by - 5.4)} ${r1(xr + 4)} ${r1(by - 1.6)}`, color, w);
    case 'sad':
      return line(`M${r1(xl - 4)} ${r1(by + 0.8)}Q${r1(xl)} ${r1(by)} ${r1(xl + 3.6)} ${r1(by - 2.6)}M${r1(xr - 3.6)} ${r1(by - 2.6)}Q${r1(xr)} ${r1(by)} ${r1(xr + 4)} ${r1(by + 0.8)}`, color, w);
    case 'low':
      return line(`M${r1(xl - 4)} ${r1(by + 1.2)}Q${r1(xl)} ${r1(by)} ${r1(xl + 4)} ${r1(by + 1)}M${r1(xr - 4)} ${r1(by + 1)}Q${r1(xr)} ${r1(by)} ${r1(xr + 4)} ${r1(by + 1.2)}`, color, w);
    case 'smug':
      return line(`M${r1(xl - 4)} ${r1(by + 0.6)}Q${r1(xl)} ${r1(by - 0.8)} ${r1(xl + 4)} ${r1(by + 0.6)}M${r1(xr - 4)} ${r1(by - 1.2)}Q${r1(xr)} ${r1(by - 4.4)} ${r1(xr + 4)} ${r1(by - 1.6)}`, color, w);
    default:
      return line(`M${r1(xl - 4)} ${r1(by + 0.4)}Q${r1(xl)} ${r1(by - 2)} ${r1(xl + 4)} ${r1(by)}M${r1(xr - 4)} ${r1(by)}Q${r1(xr)} ${r1(by - 2)} ${r1(xr + 4)} ${r1(by + 0.4)}`, color, w);
  }
}

function mouthP(kind, y) {
  const m = 50;
  const dark = (d) => `<path d="${d}" fill="${MOUTH_IN}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  switch (kind) {
    case 'grin': {
      const d = `M${m - 7} ${r1(y - 2)}Q${m} ${r1(y - 0.6)} ${m + 7} ${r1(y - 2)}Q${m + 6.2} ${r1(y + 6.4)} ${m} ${r1(y + 6.4)}Q${m - 6.2} ${r1(y + 6.4)} ${m - 7} ${r1(y - 2)}Z`;
      return dark(d) + `<path d="${ell(m + 0.6, y + 4.3, 3.4, 1.7)}" fill="${TONGUE}"/>` + `<path d="M${m - 6.2} ${r1(y - 1.4)}Q${m} ${r1(y - 0.2)} ${m + 6.2} ${r1(y - 1.4)}L${m + 5.6} ${r1(y + 0.9)}Q${m} ${r1(y + 1.9)} ${m - 5.6} ${r1(y + 0.9)}Z" fill="#ffffff"/>` + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    case 'laugh': {
      const d = `M${m - 8} ${r1(y - 2.6)}Q${m} ${r1(y - 1)} ${m + 8} ${r1(y - 2.6)}Q${m + 7.4} ${r1(y + 8.4)} ${m} ${r1(y + 8.4)}Q${m - 7.4} ${r1(y + 8.4)} ${m - 8} ${r1(y - 2.6)}Z`;
      return dark(d) + `<path d="${ell(m, y + 5.6, 4.4, 2.4)}" fill="${TONGUE}"/>` + `<path d="M${m - 7.2} ${r1(y - 2)}Q${m} ${r1(y - 0.6)} ${m + 7.2} ${r1(y - 2)}L${m + 6.6} ${r1(y + 0.4)}Q${m} ${r1(y + 1.4)} ${m - 6.6} ${r1(y + 0.4)}Z" fill="#ffffff"/>` + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    case 'open':
      return dark(ell(m, y + 1.6, 3.4, 3.9)) + `<path d="M${m - 2.4} ${r1(y + 4)}Q${m} ${r1(y + 2)} ${m + 2.4} ${r1(y + 4)}Q${m} ${r1(y + 5.6)} ${m - 2.4} ${r1(y + 4)}Z" fill="${TONGUE}"/>`;
    case 'o':
      return dark(ell(m, y + 2, 3.6, 4.8)) + `<path d="${ell(m, y + 4.6, 2.2, 1.3)}" fill="${TONGUE}"/>`;
    case 'smirk':
      return line(`M${m - 5.6} ${r1(y + 1)}Q${m + 1} ${r1(y + 2.8)} ${m + 6} ${r1(y - 2.2)}`, INK, 2.4) + line(`M${m + 6.4} ${r1(y - 3.8)}Q${m + 7.6} ${r1(y - 2)} ${m + 6.8} ${r1(y - 0.4)}`, INK, 1.5);
    case 'flat':
      return line(`M${m - 4.6} ${r1(y + 0.8)}Q${m} ${r1(y + 1.4)} ${m + 4.6} ${r1(y + 0.8)}`, INK, 2.4);
    case 'frown':
      return line(`M${m - 5} ${r1(y + 3)}Q${m} ${r1(y - 2.2)} ${m + 5} ${r1(y + 3)}`, INK, 2.4);
    default: // smile
      return line(`M${m - 6} ${r1(y - 1)}Q${m} ${r1(y + 5.6)} ${m + 6} ${r1(y - 1)}`, INK, 2.4);
  }
}

function faceP(L, F, t, mood, opts) {
  const k = F.k;
  const ey = F.eyeY;
  const my = F.mouthY;
  const xl = r1(50 - 9.6 * k);
  const xr = r1(50 + 9.6 * k);
  const ny = r1((ey + my) / 2 + 0.6);
  const mm = MOODS[mood];
  const eyes = mm ? mm.eyes : L.eyes;
  let mouth = mm ? mm.mouth : L.mouth;
  let brows = mm ? mm.brows : { sleepy: 'low', wide: 'high', happy: 'up', dots: 'normal' }[L.eyes];
  if (!mm && L.mouth === 'smirk') brows = 'smug';
  const S = t.skin;
  const out = [];
  // cheeks
  out.push(`<g fill="${S.deep ? '#e2503e' : '#ff6f61'}" opacity="${S.deep ? 0.35 : 0.3}"><path d="${ell(50 - 13.4 * k, my - 4.4, 3.9, 2.4)}"/><path d="${ell(50 + 13.4 * k, my - 4.4, 3.9, 2.4)}"/></g>`);
  if (L.old) {
    const wc = darker(S.s, 0.12);
    out.push(line(`M${r1(xl - 5.4)} ${r1(ey - 2)}l-2.4 -1.2M${r1(xl - 5.6)} ${r1(ey + 0.6)}l-2.6 0.6M${r1(xr + 5.4)} ${r1(ey - 2)}l2.4 -1.2M${r1(xr + 5.6)} ${r1(ey + 0.6)}l2.6 0.6`, wc, 1.4));
    out.push(line(`M${r1(50 - 8.6 * k)} ${r1(my - 5)}Q${r1(50 - 10.2 * k)} ${r1(my - 1.6)} ${r1(50 - 8.4 * k)} ${r1(my + 1.4)}M${r1(50 + 8.6 * k)} ${r1(my - 5)}Q${r1(50 + 10.2 * k)} ${r1(my - 1.6)} ${r1(50 + 8.4 * k)} ${r1(my + 1.4)}`, wc, 1.4));
    if (opts.forehead) out.push(line('M43 34.6Q50 33 57 34.6M45.4 31.2Q50 30.2 54.6 31.2', wc, 1.3));
  }
  if (L.extra === 'freckles') {
    const fc = darker(S.s, 0.22);
    const pts = [
      [-10.4, -5.6],
      [-13, -6.6],
      [-12, -3.6],
      [-15.4, -4.6],
      [-8, -7],
    ];
    out.push(`<g fill="${fc}">` + pts.map(([dx, dy]) => `<circle cx="${r1(50 + dx * k)}" cy="${r1(my + dy)}" r="0.8"/><circle cx="${r1(50 - dx * k)}" cy="${r1(my + dy)}" r="0.8"/>`).join('') + `</g>`);
  }
  // beard sits under the mouth
  if (L.extra === 'beard') {
    const bx = 21.4 * k;
    const ch = F.chin;
    const d = `M${r1(50 - bx)} 46C${r1(50 - bx)} 60 ${r1(50 - 14 * k)} ${r1(ch + 3.4)} 50 ${r1(ch + 3.8)}C${r1(50 + 14 * k)} ${r1(ch + 3.4)} ${r1(50 + bx)} 60 ${r1(50 + bx)} 46C${r1(50 + 19 * k)} 52 ${r1(50 + 14 * k)} ${r1(my - 3.6)} 57 ${r1(my - 3.6)}C53.4 ${r1(my - 3.6)} 50 ${r1(my - 5.6)} 50 ${r1(my - 5.6)}C50 ${r1(my - 5.6)} 46.6 ${r1(my - 3.6)} 43 ${r1(my - 3.6)}C${r1(50 - 14 * k)} ${r1(my - 3.6)} ${r1(50 - 19 * k)} 52 ${r1(50 - bx)} 46Z`;
    out.push(toon(d, t.hair.b, t.hair.s, 40, 50, 0.92));
    out.push(line(`M${r1(50 - 12 * k)} ${r1(ch - 1)}Q${r1(50 - 9 * k)} ${r1(ch + 1.4)} ${r1(50 - 5 * k)} ${r1(ch + 2)}`, t.hair.h, 1.6, ' opacity="0.8"'));
    out.push(`<path d="${ell(50, my + 1.6, mouth === 'laugh' || mouth === 'grin' ? 8.6 : 7, 4.6)}" fill="${S.b}"/>`);
  }
  out.push(mouthP(mouth, my));
  if (L.extra === 'mustache') {
    const y = my;
    const d = `M50 ${r1(y - 4.8)}C46 ${r1(y - 6.8)} 41 ${r1(y - 6.2)} 38.4 ${r1(y - 2.8)}C37.6 ${r1(y - 1.4)} 38.6 ${r1(y - 0.4)} 39.8 ${r1(y - 1.2)}C42.6 ${r1(y - 3.2)} 46.6 ${r1(y - 2.2)} 50 ${r1(y - 2.6)}C53.4 ${r1(y - 2.2)} 57.4 ${r1(y - 3.2)} 60.2 ${r1(y - 1.2)}C61.4 ${r1(y - 0.4)} 62.4 ${r1(y - 1.4)} 61.6 ${r1(y - 2.8)}C59 ${r1(y - 6.2)} 54 ${r1(y - 6.8)} 50 ${r1(y - 4.8)}Z`;
    out.push(toon(d, t.hair.b, t.hair.s, 44, y - 6, 0.9, 1.9));
  }
  if (L.extra === 'beard') {
    out.push(toon(`M50 ${r1(my - 4.6)}C46 ${r1(my - 6.4)} 42 ${r1(my - 5.4)} 40.4 ${r1(my - 2.6)}C44 ${r1(my - 3.2)} 47 ${r1(my - 2.4)} 50 ${r1(my - 3)}C53 ${r1(my - 2.4)} 56 ${r1(my - 3.2)} 59.6 ${r1(my - 2.6)}C58 ${r1(my - 5.4)} 54 ${r1(my - 6.4)} 50 ${r1(my - 4.6)}Z`, t.hair.b, t.hair.s, 46, my - 6, 0.9, 1.8));
  }
  // nose
  out.push(`<path d="${ell(50, ny, 2.9, 2.2)}" fill="${S.s}"/><circle cx="${r1(49.2)}" cy="${r1(ny - 0.8)}" r="0.9" fill="${S.h}"/>`);
  // eyes, brows
  const hideEyes = L.extra === 'shades';
  if (!hideEyes) {
    out.push(eyeP(eyes, xl, ey, S));
    if (L.extra !== 'eyepatch') out.push(eyeP(eyes, xr, ey, S));
  }
  if (eyes === 'sad' && !hideEyes) out.push(flat(`M${r1(xl - 2.6)} ${r1(ey + 3.4)}Q${r1(xl - 4.6)} ${r1(ey + 6.6)} ${r1(xl - 2.6)} ${r1(ey + 7.6)}Q${r1(xl - 0.6)} ${r1(ey + 6.6)} ${r1(xl - 2.6)} ${r1(ey + 3.4)}Z`, '#8fd8ff', 1.4));
  out.push(browsP(brows, xl, xr, ey - 8.4, t.brow));
  // extras on top of the eyes
  switch (L.extra) {
    case 'glasses': {
      const gc = INK;
      out.push(`<g fill="#ffffff" fill-opacity="0.22" stroke="${gc}" stroke-width="2.2"><circle cx="${xl}" cy="${ey}" r="5.8"/><circle cx="${xr}" cy="${ey}" r="5.8"/></g>`);
      out.push(line(`M${r1(xl + 5.6)} ${r1(ey - 1.2)}Q50 ${r1(ey - 3.4)} ${r1(xr - 5.6)} ${r1(ey - 1.2)}M${r1(xl - 5.7)} ${r1(ey - 1.2)}L${r1(50 - 21.6 * k)} ${r1(ey - 2.8)}M${r1(xr + 5.7)} ${r1(ey - 1.2)}L${r1(50 + 21.6 * k)} ${r1(ey - 2.8)}`, gc, 2));
      out.push(line(`M${r1(xl - 3.4)} ${r1(ey - 2)}Q${r1(xl - 2.6)} ${r1(ey - 3.6)} ${r1(xl - 0.8)} ${r1(ey - 4)}M${r1(xr - 3.4)} ${r1(ey - 2)}Q${r1(xr - 2.6)} ${r1(ey - 3.6)} ${r1(xr - 0.8)} ${r1(ey - 4)}`, '#ffffff', 1.3, ' opacity="0.85"'));
      break;
    }
    case 'shades': {
      const lens = (x) => `M${r1(x - 6.6)} ${r1(ey - 3.6)}L${r1(x + 6.4)} ${r1(ey - 3.6)}C${r1(x + 6.4)} ${r1(ey + 2.6)} ${r1(x + 4)} ${r1(ey + 4.8)} ${r1(x)} ${r1(ey + 4.8)}C${r1(x - 4.2)} ${r1(ey + 4.8)} ${r1(x - 6.6)} ${r1(ey + 2.6)} ${r1(x - 6.6)} ${r1(ey - 3.6)}Z`;
      out.push(line(`M${r1(xl - 7)} ${r1(ey - 3)}L${r1(50 - 21.6 * k)} ${r1(ey - 3.6)}M${r1(xr + 7)} ${r1(ey - 3)}L${r1(50 + 21.6 * k)} ${r1(ey - 3.6)}`, INK, 2));
      out.push(flat(lens(xl) + lens(xr), '#232634', 2));
      out.push(line(`M${r1(xl - 7.2)} ${r1(ey - 3.6)}L${r1(xr + 7.2)} ${r1(ey - 3.6)}`, INK, 2.8));
      out.push(line(`M${r1(xl - 3.6)} ${r1(ey - 1.4)}L${r1(xl - 1)} ${r1(ey + 2.6)}M${r1(xr - 3.6)} ${r1(ey - 1.4)}L${r1(xr - 1)} ${r1(ey + 2.6)}`, '#8fd8ff', 1.5, ' opacity="0.8"'));
      break;
    }
    case 'eyepatch':
      out.push(line(`M${r1(50 - 21 * k)} ${r1(ey - 11)}L${r1(xr - 3)} ${r1(ey - 3.4)}M${r1(xr + 4.6)} ${r1(ey - 1.4)}L${r1(50 + 22 * k)} ${r1(ey + 0.8)}`, INK, 2.2));
      out.push(toon(`M${r1(xr - 5.4)} ${r1(ey - 3)}Q${r1(xr)} ${r1(ey - 5.4)} ${r1(xr + 5.4)} ${r1(ey - 3)}Q${r1(xr + 5.6)} ${r1(ey + 4)} ${r1(xr)} ${r1(ey + 5)}Q${r1(xr - 5.6)} ${r1(ey + 4)} ${r1(xr - 5.4)} ${r1(ey - 3)}Z`, '#2c2a33', '#1c1a21', xr - 2, ey - 3, 0.85, 2));
      break;
    case 'bandaid': {
      const bc = lighter(accent(L, ['#fffaf0', '#fffaf0'], 3), 0.42);
      out.push(`<g transform="translate(${r1(50 - 13.2 * k)} ${r1(my - 6)}) rotate(-28)"><rect x="-6.4" y="-2.5" width="12.8" height="5" rx="2.4" fill="${bc}" stroke="${INK}" stroke-width="1.6"/><rect x="-2.2" y="-2.5" width="4.4" height="5" fill="${darker(bc, 0.12)}"/><g fill="${darker(bc, 0.3)}"><circle cx="-4.2" cy="-0.8" r="0.5"/><circle cx="-4.2" cy="0.9" r="0.5"/><circle cx="4.2" cy="-0.8" r="0.5"/><circle cx="4.2" cy="0.9" r="0.5"/></g><rect x="-6.4" y="-2.5" width="12.8" height="5" rx="2.4" fill="none" stroke="${INK}" stroke-width="1.6"/></g>`);
      break;
    }
    default:
      break;
  }
  return out.join('');
}

// --- Body and outfits ----------------------------------------------------------------------

function torsoD(w, T) {
  const a = 50 - w;
  const b = 50 + w;
  return `M${a} 101L${a} ${T + 14}C${a} ${T + 5} ${a + 5} ${T + 0.5} ${a + 14} ${T}L${b - 14} ${T}C${b - 5} ${T + 0.5} ${b} ${T + 5} ${b} ${T + 14}L${b} 101Z`;
}

function outfitP(clsKey, cls, L, t, B) {
  const { w, T } = B;
  const o = outfitTones(cls, L);
  const torso = torsoD(w, T);
  const body = (fill, sh) => toon(torso, fill, sh, 50 - w + 6, T + 2, 0.93);
  const S = t.skin;
  const a = 50 - w;
  const out = [];
  const panelL = `M${a} 101L${a} ${T + 14}C${a} ${T + 5} ${a + 5} ${T + 0.5} ${a + 14} ${T}L41 ${T - 0.4}L48 101Z`;
  const panelR = mirrorX(panelL, 50);
  const vx = (y) => 41 + (7 * (y - T)) / (101 - T); // inner vest edge
  const crewNeck = line(`M${50 - B.neck - 1.6} ${T - 0.3}C${50 - B.neck} ${T + 5.4} ${50 + B.neck} ${T + 5.4} ${50 + B.neck + 1.6} ${T - 0.3}`, INK, 1.8);
  if (clsKey === 'brawler' && !L.outfit) {
    // tank top
    out.push(body(S.b, S.s));
    out.push(line(`M${a + 4.6} ${T + 9}Q${a + 7.6} ${T + 6} ${a + 10.6} ${T + 8}M${100 - a - 4.6} ${T + 9}Q${100 - a - 7.6} ${T + 6} ${100 - a - 10.6} ${T + 8}`, S.s, 1.6));
    const tank = `M${a + 9} 101L${a + 9} ${T + 15}C${a + 9} ${T + 8} 35 ${T + 5} 36.4 ${T - 0.6}L41.6 ${T - 0.6}C43 ${T + 8} 57 ${T + 8} 58.4 ${T - 0.6}L63.6 ${T - 0.6}C65 ${T + 5} ${100 - a - 9} ${T + 8} ${100 - a - 9} ${T + 15}L${100 - a - 9} 101Z`;
    out.push(toon(tank, o.b, o.s, a + 12, T + 4, 0.93));
    out.push(line(`M42.4 ${T + 0.6}C44 ${T + 7.4} 56 ${T + 7.4} 57.6 ${T + 0.6}`, CREAM, 1.6));
    out.push(flat(star(58.6, T + 16, 4.4), CREAM, 1.6));
  } else if (clsKey === 'brawler') {
    // fry cook: white tee, red apron, a mustard splat
    out.push(body(CREAM, '#e9dcc4'));
    out.push(crewNeck);
    const bib = `M38 101L38 ${T + 9}C38 ${T + 7.6} 39 ${T + 7} 40.4 ${T + 7}L59.6 ${T + 7}C61 ${T + 7} 62 ${T + 7.6} 62 ${T + 9}L62 101Z`;
    out.push(limb(`M40 ${T + 7.6}L${50 - B.neck - 1.2} ${T - 0.4}M60 ${T + 7.6}L${50 + B.neck + 1.2} ${T - 0.4}`, o.b, 2.6, 1.2));
    out.push(toon(bib, o.b, o.s, 42, T + 8, 0.93));
    out.push(flat(`M44 ${T + 14}H56V${T + 19.6}Q56 ${T + 21.6} 54 ${T + 21.6}H46Q44 ${T + 21.6} 44 ${T + 19.6}Z`, o.s, 1.6));
    out.push(`<path d="${cloud(56.6, T + 11.2, 2, 1.7, 5, 90, 1.4)}" fill="#f5b82e"/>`);
  } else if (clsKey === 'shooter') {
    const shirt = L.outfit ? '#d7ebff' : CREAM;
    out.push(body(shirt, darker(shirt, 0.1)));
    if (L.outfit) out.push(line(`M45 ${T + 3}L46.6 101M50 ${T + 4}V101M55 ${T + 3}L53.4 101`, '#7fb4f0', 1.8));
    else out.push(crewNeck);
    out.push(toon(panelL, o.b, o.s, a + 6, T + 2, 0.93));
    out.push(toon(panelR, o.b, o.s, 100 - a - 14, T + 2, 0.93));
    const px = r1(50 - w * 0.55 - 4.6);
    out.push(flat(`M${px} ${T + 13}h9.4v7.6q0 1.6 -1.6 1.6h-6.2q-1.6 0 -1.6 -1.6Z`, o.s, 1.6));
    out.push(flat(`M${px - 0.4} ${T + 12.4}h10.2v3.4h-10.2Z`, o.h, 1.5));
    out.push(`<g fill="#f5b82e"><circle cx="${r1(vx(T + 10) - 2)}" cy="${T + 10}" r="1.1"/><circle cx="${r1(vx(T + 17) - 2)}" cy="${T + 17}" r="1.1"/></g>`);
    out.push(toon(star(r1(50 + w * 0.5), T + 10.4, 4.6), GOLD, '#e09d14', 50 + w * 0.5 - 1, T + 8, 0.85, 1.6));
    if (L.outfit) out.push(toon(`M50 ${T + 1.6}L44.4 ${T - 1.4}L44.4 ${T + 5}Z` + `M50 ${T + 1.6}L55.6 ${T - 1.4}L55.6 ${T + 5}Z`, '#e8483f', '#b8302a', 47, T, 0.85, 1.6) + `<circle cx="50" cy="${T + 1.8}" r="1.7" fill="#e8483f" stroke="${INK}" stroke-width="1.4"/>`);
  } else if (clsKey === 'medic') {
    out.push(body(o.b, o.s));
    out.push(flat(`M${50 - B.neck - 1.6} ${T - 0.5}L50 ${T + 11}L${50 + B.neck + 1.6} ${T - 0.5}Z`, S.b, 1.8));
    out.push(line(`M${50 - B.neck - 1.2} ${T + 1}L50 ${T + 12.4}L${50 + B.neck + 1.2} ${T + 1}`, o.h, 1.4));
    const cx = r1(50 + w * 0.5);
    const cy = T + 13;
    if (L.outfit) {
      out.push(limb(`M${50 - B.neck} ${T - 0.4}C${50 - B.neck - 3} ${T + 10} 46 ${T + 16} 49 ${T + 16}M${50 + B.neck} ${T - 0.4}C${50 + B.neck + 2} ${T + 7} 53 ${T + 13} 49.6 ${T + 16}`, '#4a5060', 1.8, 1));
      out.push(toon(ell(49.4, T + 18.4, 2.8), STEEL, STEEL_SH, 48.4, T + 17.4, 0.8, 1.6));
      out.push(`<circle cx="${cx}" cy="${cy}" r="5.6" fill="${CREAM}" stroke="${INK}" stroke-width="1.6"/><path d="M${cx - 1.3} ${cy - 3.6}h2.6v2.3h2.3v2.6h-2.3v2.3h-2.6v-2.3h-2.3v-2.6h2.3Z" fill="${cls.color}"/>`);
    } else {
      out.push(flat(`M${cx - 1.8} ${cy - 5}h3.6v3.2h3.2v3.6h-3.2v3.2h-3.6v-3.2h-3.2v-3.6h3.2Z`, CREAM, 1.5));
      const pk = r1(50 - w * 0.5 - 4);
      out.push(line(`M${pk + 2} ${T + 12}V${T + 9}M${pk + 5} ${T + 12}V${T + 8}`, '#3d8bf0', 1.6) + flat(`M${pk} ${T + 11.6}h8v6.4h-8Z`, o.s, 1.5));
    }
  } else {
    // tinker
    if (!L.outfit) {
      const tee = '#5d6e91';
      out.push(body(tee, darker(tee, 0.2)));
      out.push(crewNeck);
      out.push(limb(`M41 ${T + 11}L${a + 13.6} ${T + 0.2}M59 ${T + 11}L${100 - a - 13.6} ${T + 0.2}`, o.b, 3.4, 1.2));
      out.push(toon(`M38.6 101L38.6 ${T + 12.6}Q38.6 ${T + 10} 41 ${T + 10}L59 ${T + 10}Q61.4 ${T + 10} 61.4 ${T + 12.6}L61.4 101Z`, o.b, o.s, 41, T + 10, 0.93));
      out.push(`<g fill="${STEEL}" stroke="${INK}" stroke-width="1.3"><circle cx="41.6" cy="${T + 12.8}" r="1.6"/><circle cx="58.4" cy="${T + 12.8}" r="1.6"/></g>`);
      out.push(line(`M53.6 ${T + 15}L54.8 ${T + 10.6}`, '#e8483f', 2.2) + flat(`M44.6 ${T + 15}h10.8v6.2q0 1.6 -1.6 1.6h-7.6q-1.6 0 -1.6 -1.6Z`, o.s, 1.5));
    } else {
      // hi-vis vest
      const tee = '#3f4656';
      out.push(body(tee, darker(tee, 0.25)));
      out.push(crewNeck);
      out.push(toon(panelL, o.b, o.s, a + 6, T + 2, 0.93));
      out.push(toon(panelR, o.b, o.s, 100 - a - 14, T + 2, 0.93));
      const y0 = T + 14;
      const y1 = T + 18.6;
      const strip = `M${a + 0.6} ${y0}L${r1(vx(y0))} ${y0}L${r1(vx(y1))} ${y1}L${a + 0.6} ${y1}Z`;
      out.push(flat(strip + mirrorX(strip, 50), '#e9eef5', 1.4));
      out.push(flat(`M${a + 9.6} ${T + 0.8}L${a + 13.6} ${T + 0.2}L${a + 13.6} ${y0}L${a + 9.6} ${y0}Z` + mirrorX(`M${a + 9.6} ${T + 0.8}L${a + 13.6} ${T + 0.2}L${a + 13.6} ${y0}L${a + 9.6} ${y0}Z`, 50), '#e9eef5', 1.4));
    }
  }
  return out.join('');
}

// --- Props (shared by portrait and figure) -------------------------------------------------------

/**
 * A class prop in its own frame: the grip is at (0, 0) and "up" is −y, about
 * 40-50 units long. sw = outline width in these units (the figure draws props
 * small, so it passes a thicker one). `kind` says how a figure holds it.
 */
const PROP_KIND = { bat: 'long', pan: 'long', foamhand: 'long', rifle: 'long', slingshot: 'long', blaster: 'long', medkit: 'hang', spray: 'hang', defib: 'long', bomb: 'palm', wrench: 'long', trap: 'hang' };
const PROP_FIG_SCALE = { rifle: 0.24, trap: 0.25, bomb: 0.27, medkit: 0.3, spray: 0.3, defib: 0.34, slingshot: 0.32, foamhand: 0.29, blaster: 0.28, pan: 0.29, bat: 0.29, wrench: 0.28 };

function propArt(name, sw, small = false) {
  const dw = sw * 0.62; // detail line width
  switch (name) {
    case 'bat':
      return (
        toon('M-2.4 4L-2.8 -8C-3.2 -18 -6.4 -26 -6.4 -35C-6.4 -40 -3.6 -42.6 0 -42.6C3.6 -42.6 6.4 -40 6.4 -35C6.4 -26 3.2 -18 2.8 -8L2.4 4Z', WOOD, WOOD_SH, -3, -40, 0.86, sw) +
        (small ? '' : line('M-3.8 -32C-3.8 -26 -2.2 -18 -1.6 -10', lighter(WOOD, 0.45), dw)) +
        flat('M-2.6 4.6L-2.9 -6L2.9 -6L2.6 4.6Z', '#4a3326', sw * 0.8) +
        (small ? '' : line('M-2.6 -3.4L2.6 -1.6M-2.6 0.4L2.6 2.2', '#8a6a52', dw * 0.8)) +
        flat(ell(0, 5.4, 4.2, 2.2), WOOD_SH, sw * 0.8)
      );
    case 'pan':
      return (
        flat('M-2.8 6L-2.8 -14L2.8 -14L2.8 6Q2.8 8.4 0 8.4Q-2.8 8.4 -2.8 6Z', '#5a3a2a', sw) +
        flat('M-3.6 -12L3.6 -12L3 -17L-3 -17Z', IRON, sw * 0.8) +
        toon(ell(0, -28.6, 13, 12.4), '#4a4f5c', '#2f333d', -4, -34, 0.88, sw) +
        `<path d="${ell(0, -28.6, 9.6, 9)}" fill="#5a606e" stroke="${INK}" stroke-width="${dw}"/>` +
        `<path d="${cloud(-0.6, -28.4, 5.6, 5, 6, 90, 1.3)}" fill="${CREAM}" stroke="${INK}" stroke-width="${dw}"/>` +
        toon(ell(0.4, -28, 2.6, 2.4), '#ffc23a', '#f08a1c', -0.4, -29, 0.8, dw) +
        (small ? '' : line('M-9 -33Q-7.6 -38 -2.6 -39.6', '#ffffff', dw * 1.2, ' opacity="0.6"'))
      );
    case 'foamhand': {
      const fc = '#f5b82e';
      return (
        toon('M-9 2L-9 -18C-9 -22 -7 -24 -5 -24.6L-5 -40C-5 -43 -3 -44.6 -0.6 -44.6C2 -44.6 4 -43 4 -40L4 -24.6C6.6 -24 8 -22.6 8.4 -20.6C11.6 -21 13.6 -18.6 13 -15C12.6 -12 10.6 -9.6 9 -9L9 2Z', fc, '#d9921a', -6, -40, 0.9, sw) +
        (small ? '' : line('M-6.6 -16Q-4.6 -13.6 -2.6 -16M-1.6 -16Q0.4 -13.6 2.4 -16M-1.6 -36.6Q-0.6 -40 1.6 -40', '#c47c12', dw)) +
        flat('M-10 0L10 0L10 7L-10 7Z', '#e8483f', sw * 0.9) +
        (small ? '' : line('M-10 3.6L10 3.6', CREAM, dw * 1.4))
      );
    }
    case 'rifle':
      return (
        toon('M-3.2 -6L-6 9C-6.4 11 -5 12.4 -3 12.4L3.4 12.4C5.4 12.4 6.4 11 6 9L3.4 -6Z', WOOD, WOOD_SH, -3, -4, 0.86, sw) +
        toon('M-2.4 -48L2.4 -48L2.4 -20L-2.4 -20Z', '#6a7384', '#4a5262', -1.6, -46, 0.8, sw) +
        flat('M-1.4 -52L1.4 -52L1.4 -47.6L-1.4 -47.6Z', IRON, sw * 0.8) +
        toon('M-3.6 -24L3.6 -24L3.6 -4L-3.6 -4Z', WOOD, WOOD_SH, -3, -22, 0.86, sw) +
        flat('M-3.8 -14L3.8 -14L3.8 -10.6L-3.8 -10.6Z', IRON, sw * 0.8) +
        line('M3.6 -8Q7.6 -7 6.6 -3', INK, dw * 1.3) +
        (small ? '' : `<path d="${ell(0, -52.6, 2.6, 1.8)}" fill="#e2b77a" stroke="${INK}" stroke-width="${dw}"/>`)
      );
    case 'slingshot':
      return (
        toon('M-2.8 6L-2.8 -14C-2.8 -18 -5 -22 -8 -27L-11 -31.6C-11.8 -33 -10.8 -34.6 -9 -34C-8 -33.8 -7.4 -33 -6.8 -32L-2 -24C-1 -22.6 1 -22.6 2 -24L6.8 -32C7.4 -33 8 -33.8 9 -34C10.8 -34.6 11.8 -33 11 -31.6L8 -27C5 -22 2.8 -18 2.8 -14L2.8 6Z', WOOD, WOOD_SH, -4, -26, 0.88, sw) +
        limb('M-9.4 -31.6Q0 -24 9.4 -31.6', '#e8483f', dw * 1.2, dw * 0.55) +
        flat(ell(0, -27.4, 3.6, 2.6), '#7a4a2a', dw * 1.1) +
        `<circle cx="0" cy="-28.4" r="1.8" fill="#9aa3ae" stroke="${INK}" stroke-width="${dw * 0.8}"/>` +
        flat('M-3 -6L3 -6L3 2L-3 2Z', '#3d8bf0', sw * 0.8)
      );
    case 'blaster': {
      const oc = '#ff8a2b';
      return (
        toon('M-2.6 8L-3.6 -3L3.6 -3L2.8 8Q2.8 10 0 10Q-2.6 10 -2.6 8Z', darker(oc, 0.12), darker(oc, 0.3), -2, -2, 0.85, sw) +
        toon('M0.4 -36L6 -36L6 -18L0.4 -18Z', lighter(oc, 0.2), oc, 1, -34, 0.86, sw) +
        flat('M-0.6 -41L7 -41L7 -35.4L-0.6 -35.4Z', '#f5b82e', sw * 0.9) +
        toon('M-5.6 -20.6L9 -20.6Q9.6 -20.6 9.6 -20L9.6 -4Q9.6 -2 7.6 -2L-3.6 -2Q-5.6 -2 -5.6 -4Z', oc, darker(oc, 0.2), -4, -19, 0.88, sw) +
        toon(ell(-7.4, -13, 6.6, 6.8), '#8fd8ff', '#56b6ee', -9, -16, 0.84, sw) +
        `<path d="M-13.4 -11.6Q-7.4 -9 -1.4 -11.6A6.4 6.4 0 0 1 -13.4 -11.6Z" fill="#3d8bf0" opacity="0.7"/>` +
        (small ? '' : line('M-10 -16.6Q-9 -18.6 -7 -19', '#ffffff', dw * 1.1) + flat('M3.2 -48Q6.4 -44.4 3.2 -43Q0 -44.4 3.2 -48Z', '#8fd8ff', dw))
      );
    }
    case 'medkit':
      return (
        flat('M-5.6 4.4L-5.6 0.6Q-5.6 -1.6 -3.4 -1.6L3.4 -1.6Q5.6 -1.6 5.6 0.6L5.6 4.4L3.2 4.4L3.2 1.4L-3.2 1.4L-3.2 4.4Z', '#c9ccd2', sw * 0.8) +
        toon('M-12 6.6Q-12 4 -9.4 4L9.4 4Q12 4 12 6.6L12 20Q12 22.6 9.4 22.6L-9.4 22.6Q-12 22.6 -12 20Z', CREAM, '#ded4c2', -10, 5, 0.9, sw) +
        flat('M-2.2 7.6L2.2 7.6L2.2 11.2L5.8 11.2L5.8 15.6L2.2 15.6L2.2 19.2L-2.2 19.2L-2.2 15.6L-5.8 15.6L-5.8 11.2L-2.2 11.2Z', '#e8483f', dw * 1.1) +
        (small ? '' : line('M-12 9H-9M9 9H12', '#ded4c2', dw))
      );
    case 'spray':
      return (
        toon('M-6.6 6.6Q-6.6 4 -4 4L4 4Q6.6 4 6.6 6.6L7.6 26Q7.6 29 4.6 29L-4.6 29Q-7.6 29 -7.6 26Z', '#cdeeff', '#9fd2ee', -4, 6, 0.88, sw) +
        `<path d="M-7.2 14Q0 12.4 7.1 14L7.5 26Q7.5 28.6 4.6 28.6L-4.6 28.6Q-7.5 28.6 -7.5 26Z" fill="#7be08a" opacity="0.85"/>` +
        flat('M-4.4 17.6L4.4 17.6L4.4 24L-4.4 24Z', CREAM, dw) +
        line('M0 18.8V22.8M-2 20.8H2', '#36c06a', dw * 1.1) +
        flat('M-3.4 4L-3.4 -1.4L3.4 -1.4L3.4 4Z', CREAM, sw * 0.8) +
        toon('M-5 -1.4L-5 -9Q-5 -11.4 -2.6 -11.4L9 -11.4Q11.4 -11.4 11.4 -9L11.4 -7Q11.4 -5.6 9.6 -5.6L4 -5.6L4 -1.4Z', '#36c06a', '#1f7f43', -3, -10, 0.86, sw) +
        flat('M3 -4.6Q7.6 -4 8.4 1.6Q6 1.6 4.6 -1Z', '#36c06a', dw * 1.1) +
        (small ? '' : `<g fill="#bfe8ff" stroke="${INK}" stroke-width="${dw * 0.7}"><circle cx="14.6" cy="-9.6" r="1.4"/><circle cx="17.6" cy="-12" r="1.1"/><circle cx="17.6" cy="-7" r="1"/></g>`)
      );
    case 'defib': {
      // T-shaped paddles: yellow handle, steel plate on top, a spark between them
      const one = (dx, dy, rot) =>
        `<g transform="translate(${dx} ${dy}) rotate(${rot})">` +
        toon('M-3.4 6L-3.4 -12L3.4 -12L3.4 6Q3.4 8.6 0 8.6Q-3.4 8.6 -3.4 6Z', '#f5b82e', '#c98a14', -2, -10, 0.85, sw) +
        `<circle cx="0" cy="-6" r="1.6" fill="#e8483f" stroke="${INK}" stroke-width="${dw}"/>` +
        toon('M-11 -11.6L11 -11.6L11 -17Q11 -19.6 8.4 -19.6L-8.4 -19.6Q-11 -19.6 -11 -17Z', STEEL, STEEL_SH, -8, -18, 0.86, sw) +
        line('M-8.6 -17.2H6', '#ffffff', dw, ' opacity="0.7"') +
        `</g>`;
      if (small) return one(0, 0, 0) + flat('M5 -26L1.6 -21L4.4 -21L1.4 -15.6L8.4 -22.6L5.2 -22.6L7.8 -26Z', '#ffe14a', dw);
      // a pair leaning together, charging: cords curl down, a spark jumps between the plates
      return (
        line('M-2.6 7.6C-6 11 -1 13 -4.4 16C-7.6 19 -2.6 21 -5.6 24M27.6 7.6C31 11 26 13 29.4 16C32.6 19 27.6 21 30.6 24', '#4a5060', dw * 1.4) +
        one(-1, 0, 16) +
        one(26, 0, -16) +
        flat('M14.6 -36L9.6 -28.4L13.2 -28.4L9.2 -20.6L19 -30.6L15 -30.6L18.6 -36Z', '#ffe14a', dw * 1.2) +
        line('M7 -26.6L4.6 -28.4M20 -24.4L22.6 -25.8', '#ffe14a', dw * 1.3)
      );
    }
    case 'bomb':
      return (
        line('M0 -22Q1.6 -28 5.6 -29.6', '#c7a26a', dw * 1.6) +
        flat('M-3.6 -18.6L-3.6 -22.6L3.6 -22.6L3.6 -18.6Z', '#6a7180', sw * 0.85) +
        toon(ell(0, -9.6, 10.6, 10.2), '#3a3f52', '#262a38', -4, -14, 0.86, sw) +
        line('M-6 -14.6Q-4.6 -17.4 -1.4 -18', '#ffffff', dw * 1.6, ' opacity="0.65"') +
        `<path d="${star(6.4, -30.6, 4.6, 2)}" fill="#ffd23a" stroke="${INK}" stroke-width="${dw}" stroke-linejoin="round"/>` +
        `<circle cx="6.4" cy="-30.6" r="1.4" fill="#ff7a2b"/>`
      );
    case 'wrench':
      return (
        toon('M-3.2 6L-3.2 -26L3.2 -26L3.2 6Q3.2 9.2 0 9.2Q-3.2 9.2 -3.2 6Z', STEEL, STEEL_SH, -2, -24, 0.86, sw) +
        flat('M-3.6 7L-3.6 -8L3.6 -8L3.6 7Q3.6 10 0 10Q-3.6 10 -3.6 7Z', '#e8483f', sw * 0.9) +
        toon('M-3.6 -25C-9.6 -27 -11.6 -34 -8 -40.6L-4 -36.6L-3.4 -34.6L3.4 -34.6L4 -36.6L8 -40.6C11.6 -34 9.6 -27 3.6 -25Z', STEEL, STEEL_SH, -6, -34, 0.88, sw) +
        (small ? '' : line('M-1.6 -22V-12', '#ffffff', dw, ' opacity="0.7"') + `<circle cx="0" cy="5.4" r="1.6" fill="${INK}"/>`)
      );
    case 'trap': {
      // an open bear trap seen from above: a steel ring, blunt teeth pointing in, a plate
      const cx = 0;
      const cy = 17;
      const ring = ell(cx, cy, 16, 10.6);
      const hole = ell(cx, cy, 11.4, 6.8);
      let teeth = '';
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a0 = ((i + 0.12) / n) * Math.PI * 2;
        const a1 = ((i + 0.88) / n) * Math.PI * 2;
        const am = ((i + 0.5) / n) * Math.PI * 2;
        const p0 = [cx + 11.6 * Math.cos(a0), cy + 7 * Math.sin(a0)];
        const p1 = [cx + 11.6 * Math.cos(a1), cy + 7 * Math.sin(a1)];
        const pt = [cx + 8.2 * Math.cos(am), cy + 4.4 * Math.sin(am)];
        teeth += `M${r1(p0[0])} ${r1(p0[1])}L${r1(pt[0])} ${r1(pt[1])}L${r1(p1[0])} ${r1(p1[1])}Z`;
      }
      return (
        limb('M0 -1L0 7.4', '#8b97a7', dw * 1.2, dw * 0.6) +
        `<circle cx="0" cy="-1.6" r="2.6" fill="none" stroke="${INK}" stroke-width="${dw * 2.2}"/><circle cx="0" cy="-1.6" r="2.6" fill="none" stroke="#8b97a7" stroke-width="${dw}"/>` +
        `<g fill="${STEEL_SH}" stroke="${INK}" stroke-width="${dw}"><path d="${ell(-17.6, cy, 3, 4.2)}"/><path d="${ell(17.6, cy, 3, 4.2)}"/></g>` +
        toon(ring, STEEL, STEEL_SH, -8, 10, 0.88, sw) +
        `<path d="${hole}" fill="#5b4a3c" stroke="${INK}" stroke-width="${dw}"/>` +
        `<path d="${teeth}" fill="${CREAM}" stroke="${INK}" stroke-width="${dw * 0.7}" stroke-linejoin="round"/>` +
        toon(ell(cx, cy + 0.6, 4.6, 2.8), '#f5b82e', '#c98a14', -1.6, cy - 0.6, 0.8, dw) +
        (small ? '' : line('M-11 9.4Q-6 7 -1 6.8', '#ffffff', dw * 1.1, ' opacity="0.6"'))
      );
    }
    default:
      return '';
  }
}

/** Portrait prop placement: behind the shoulder (most) or held in front (small ones). */
const PROP_FRONT = new Set(['medkit', 'spray', 'bomb', 'trap', 'defib']);
function propPortraitP(name, B, skin) {
  const x0 = 50 + B.w;
  const fist = (x, y) => toon(ell(x, y, 5.6, 4.8), skin.b, skin.s, x - 2, y - 2, 0.86, 2.2) + line(`M${r1(x - 1.6)} ${r1(y - 3.6)}V${r1(y - 0.6)}M${r1(x + 1.6)} ${r1(y - 3.6)}V${r1(y - 0.6)}`, skin.s, 1.4);
  switch (name) {
    case 'medkit':
      return `<g transform="translate(${r1(x0 - 9)} 72) rotate(-8)">${propArt(name, 2.2)}</g>` + fist(x0 - 9.2, 71.6);
    case 'spray':
      return `<g transform="translate(${r1(x0 - 6)} 66) rotate(-6)">${propArt(name, 2.2)}</g>` + fist(x0 - 6.2, 66.6);
    case 'bomb':
      return `<g transform="translate(${r1(x0 - 9)} 99.6) rotate(-6)">${propArt(name, 2.2)}</g>`;
    case 'trap':
      return `<g transform="translate(${r1(x0 - 9)} 66) rotate(-4)">${propArt(name, 2.2)}</g>` + fist(x0 - 9, 65);
    case 'defib':
      return `<g transform="translate(${r1(x0 - 19)} 96) scale(0.92)">${propArt(name, 2.5)}</g>`;
    case 'rifle':
      return `<g transform="translate(${r1(x0 - 3)} 92) rotate(${B.ang + 3}) scale(1.08)">${propArt(name, 2.3)}</g>`;
    case 'blaster':
      return `<g transform="translate(${r1(x0 - 1)} 79) rotate(${B.ang + 6})">${propArt(name, 2.4)}</g>`;
    case 'slingshot':
      return `<g transform="translate(${r1(x0 - 4)} 92) rotate(${B.ang + 4}) scale(1.15)">${propArt(name, 2.1)}</g>`;
    case 'pan':
      return `<g transform="translate(${r1(x0 - 4)} 95) rotate(${B.ang + 4})">${propArt(name, 2.4)}</g>`;
    default:
      return `<g transform="translate(${r1(x0 - 5)} 99) rotate(${B.ang})">${propArt(name, 2.4)}</g>`;
  }
}

// --- Mascot heads -----------------------------------------------------------------------------

/** The wearer peeking out of the mascot's mouth mesh; their eyes follow the mood. */
function peekEyes(x1, x2, y, mood, eyes) {
  const kind = MOODS[mood] ? MOODS[mood].eyes : eyes;
  if (kind === 'happy') return line(`M${x1 - 1.3} ${y + 0.5}Q${x1} ${y - 1.3} ${x1 + 1.3} ${y + 0.5}M${x2 - 1.3} ${y + 0.5}Q${x2} ${y - 1.3} ${x2 + 1.3} ${y + 0.5}`, '#ffffff', 1.1);
  if (kind === 'sleepy') return line(`M${x1 - 1.2} ${y}H${x1 + 1.2}M${x2 - 1.2} ${y}H${x2 + 1.2}`, '#ffffff', 1.1);
  if (kind === 'sad') return line(`M${x1 - 1.2} ${y - 0.6}L${x1 + 1.2} ${y + 0.4}M${x2 + 1.2} ${y - 0.6}L${x2 - 1.2} ${y + 0.4}`, '#ffffff', 1.1);
  const r = kind === 'wide' ? 1.3 : 0.95;
  return `<g fill="#ffffff"><circle cx="${x1}" cy="${y}" r="${r}"/><circle cx="${x2}" cy="${y}" r="${r}"/></g>`;
}
const MESH = (d) => `<path d="${d}" fill="#2b211d"/>`;
const PLASTIC_EYE = (x, y, rx, ry, px, py, pr) =>
  `<path d="${ell(x, y, rx, ry)}" fill="#ffffff" stroke="${INK}" stroke-width="2.2"/><circle cx="${px}" cy="${py}" r="${pr}" fill="${INK}"/><circle cx="${r1(px + pr * 0.35)}" cy="${r1(py - pr * 0.4)}" r="${r1(pr * 0.38)}" fill="#ffffff"/>`;

const collar = (b, s) => toon(cloud(50, 75.6, 15.6, 5, 11, 90, 1.3), b, s, 44, 72, 0.9, 2.2);

function mascotP(kind, mood, eyes) {
  const sad = mood === 'sad';
  const tear = (x, y) => (sad ? flat(`M${x} ${y}Q${x - 2.4} ${y + 3.6} ${x} ${y + 4.6}Q${x + 2.4} ${y + 3.6} ${x} ${y}Z`, '#8fd8ff', 1.4) : '');
  if (kind === 1) {
    // bunny: one ear bent and stitched, buck teeth
    const b = '#f5f0e6';
    const s = '#d8cebd';
    const pink = '#ffb3c8';
    return (
      collar(b, s) +
      toon('M36 34C31 22 31 8 37 3.6C43 7 45 20 43.6 33Z', b, s, 35, 8, 0.86) +
      `<path d="M37.6 30C35.2 21 35.2 11 37.6 7.6C40.2 11 41.2 21 40.2 30Z" fill="${pink}"/>` +
      toon('M57 33C56 22 59 12 65 9C70 7 76 9 80 14.6C75 14.6 70 15.6 67 19C65 23 64 28 63.6 34Z', b, s, 60, 12, 0.86) +
      `<path d="M60.2 30C60 22 62 15 66 12.6C69 11 72.6 11.2 75 12.6C71 13 67.6 15 65 18.6C63.6 22 63 26 62.8 30Z" fill="${pink}"/>` +
      line('M63.4 17.4L67.4 19.6M64.6 15.6L68.4 17.4', INK, 1.2) +
      toon(ell(50, 52, 25, 22.6), b, s, 40, 40, 0.9) +
      line('M30 41Q36 34 44 32', '#ffffff', 2.4) +
      `<g fill="#ff7aa0" opacity="0.4"><path d="${ell(34.6, 58, 4, 2.6)}"/><path d="${ell(65.4, 58, 4, 2.6)}"/></g>` +
      PLASTIC_EYE(40, 47, 4.8, 5.8, 40.6, 47.8, 3.2) +
      PLASTIC_EYE(60, 47, 4.8, 5.8, 60.6, 48.4, 3.2) +
      flat('M54.8 44C56.6 41.6 63.4 41.6 65.2 44.4L65.2 46.4L54.8 46.4Z', b, 1.6) +
      tear(42.6, 52) +
      (mood === 'cheer' || mood === 'happy'
        ? flat('M43.6 60.4Q50 61.6 56.4 60.4Q55.6 68.4 50 68.4Q44.4 68.4 43.6 60.4Z', MOUTH_IN, 1.8) + `<path d="${ell(50, 66.2, 2.8, 1.4)}" fill="${TONGUE}"/>`
        : mood === 'wow'
          ? flat(ell(50, 66.4, 2.4, 2.6), MOUTH_IN, 1.6)
          : line(sad ? 'M44.4 62Q47 59.4 50 60.6Q53 59.4 55.6 62' : 'M44 60.2Q47 63 50 60.6Q53 63 56 60.2', INK, 2)) +
      flat('M47.6 60.8L52.4 60.8L52.4 64Q52.4 65 51.4 65L48.6 65Q47.6 65 47.6 64Z', '#ffffff', 1.5) +
      line('M50 61V64.6', INK, 1) +
      flat('M46.4 54.6Q50 53.4 53.6 54.6Q52.6 58 50 58.6Q47.4 58 46.4 54.6Z', '#ff8fb1', 1.6) +
      line('M50 58.6V60.6M39 57.4L29.6 55.6M39 60L29.6 61M61 57.4L70.4 55.6M61 60L70.4 61', INK, 1.2)
    );
  }
  if (kind === 2) {
    // duck: crooked bill, cross-eyed, a patch on the cheek
    const b = '#ffd43b';
    const s = '#e3a51e';
    const bill = '#ff9a2e';
    return (
      collar(b, s) +
      toon('M46.6 24C43 15.6 47 10 52 11C49 13 48.6 17 50.6 22Z', b, s, 47, 14, 0.85, 2) +
      toon('M50 23C51 15.6 56 12.6 60.6 15C56.6 16 54.4 19 53.6 23.6Z', b, s, 54, 15, 0.85, 2) +
      toon(ell(50, 46, 25.6, 25), b, s, 40, 34, 0.9) +
      line('M30.6 36Q35.6 27 44 24.6', '#fff3a8', 2.6) +
      line('M27 50Q30 58 36 62', s, 1.4, ' stroke-dasharray="2 2"') +
      `<g transform="rotate(-10 66 59)"><rect x="61.6" y="55" width="8.6" height="7.6" rx="1.2" fill="#f2bf3a" stroke="${INK}" stroke-width="1.4"/><rect x="62.6" y="56" width="6.6" height="5.6" rx="0.8" fill="none" stroke="#b07a10" stroke-width="0.9" stroke-dasharray="1.4 1.2"/></g>` +
      PLASTIC_EYE(39.4, 39.6, 6.2, 7, 41.6, 41.2, 3.4) +
      PLASTIC_EYE(60.6, 39.6, 6.2, 7, 58.6, 41.6, 3.4) +
      flat('M33.2 37.6Q33.6 32.4 39.4 32.4Q45.2 32.4 45.6 37.6Q39.4 35.6 33.2 37.6Z', b, 1.8) +
      tear(36.6, 46) +
      toon('M34 58C36.6 67 44 71 50 71C56 71 63.4 67 66 58Z', darker(bill, 0.06), darker(bill, 0.28), 40, 60, 0.9) +
      MESH('M37.4 58.4C40 64.4 45.4 67 50 67C54.6 67 60 64.4 62.6 58.4Z') +
      peekEyes(46, 54, 62.6, mood, eyes) +
      toon('M28.6 55C28.6 49.4 39 49.6 50 50.6C61 49.4 71.6 49.4 71.6 54.6C71.6 58.6 63 60 50 60.2C37 60.4 28.6 59 28.6 55Z', bill, darker(bill, 0.22), 40, 50, 0.9) +
      line('M34 52.6Q40 51 46 52', lighter(bill, 0.5), 1.8) +
      `<g fill="${darker(bill, 0.45)}"><path d="${ell(45, 53.8, 1.4, 0.9)}"/><path d="${ell(55, 53.8, 1.4, 0.9)}"/></g>`
    );
  }
  // bear (default): patched ear, stitched seam, a tuft of stuffing
  const b = '#b07444';
  const s = '#8a5530';
  const muz = '#f0d2a2';
  return (
    collar(b, s) +
    toon(ell(28.4, 23.6, 9.2), b, s, 25, 20, 0.86) +
    `<path d="${ell(28.6, 24.2, 5.2)}" fill="#e2ad82"/>` +
    toon(ell(71.6, 23.6, 9.2), b, s, 68, 20, 0.86) +
    `<g transform="rotate(14 71.6 23.6)"><rect x="67.2" y="19.2" width="8.8" height="8.8" rx="1" fill="#6fa0d8" stroke="${INK}" stroke-width="1.5"/><path d="M68.4 20.4h6.4v6.4h-6.4Z" fill="none" stroke="#fffaf0" stroke-width="0.9" stroke-dasharray="1.4 1.1"/></g>` +
    toon(ell(50, 47, 27, 25), b, s, 38, 34, 0.9) +
    `<path d="M44 24L46.6 18.6L49 22.4L51.6 17.6L53.6 22.4L56.4 19L56.6 24Z" fill="${b}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    line('M44.6 24.6L56 24.6', b, 2.6) +
    line('M27.6 38Q50 25 72.4 38', s, 1.4, ' stroke-dasharray="2.4 2"') +
    line('M30 37Q34 29.6 42 27', lighter(b, 0.35), 2.6) +
    line('M27.4 50.6L31.6 57', s, 1.4) + line('M28 52.6L30.2 51.4M29.2 54.6L31.4 53.4', s, 1.1) +
    `<g fill="#ff8a7a" opacity="0.45"><path d="${ell(32, 56, 4, 2.4)}"/><path d="${ell(68, 56, 4, 2.4)}"/></g>` +
    PLASTIC_EYE(38.6, 42.6, 6.2, 6.6, 39.4, 43.6, 3.4) +
    PLASTIC_EYE(61.4, 42.6, 6.6, 6.8, 62.4, 41.6, 3.4) +
    tear(36.6, 49.6) +
    toon(ell(50, 59.4, 13.4, 9.6), muz, '#d9b47e', 44, 54, 0.9) +
    MESH('M43 61.4Q50 63.4 57 61.4Q56.4 68.2 50 68.2Q43.6 68.2 43 61.4Z') +
    peekEyes(47.4, 52.6, 64.8, mood, eyes) +
    `<path d="M43 61.4Q50 63.4 57 61.4Q56.4 68.2 50 68.2Q43.6 68.2 43 61.4Z" fill="none" stroke="${INK}" stroke-width="1.8"/>` +
    flat('M44.6 53.4Q50 51.4 55.4 53.4Q55.4 57.4 50 58.6Q44.6 57.4 44.6 53.4Z', '#3a2620', 1.8) +
    `<path d="${ell(48.4, 53.8, 1.6, 0.9)}" fill="#ffffff" opacity="0.7"/>` +
    line('M50 58.6V61.6', INK, 1.6)
  );
}

// --- Golden -----------------------------------------------------------------------------------

function goldenP() {
  return (
    `<g class="p-spark" fill="#fffbe6" stroke="${GOLD}" stroke-width="1.3" stroke-linejoin="round">` +
    `<path d="${sparkle(15, 18, 6.4)}"/><path d="${sparkle(86, 28, 4.6)}"/><path d="${sparkle(82, 9, 3)}"/><path d="${sparkle(11, 66, 3.2)}"/>` +
    `</g>`
  );
}

// --- portraitSvg ------------------------------------------------------------------------------

/**
 * A square head-and-shoulders portrait (viewBox 0 0 100 100, class "portrait",
 * plus "golden" for golden people). opts.mood: 'happy' | 'cheer' | 'sad' | 'wow'
 * overrides the eyes and mouth.
 */
export function portraitSvg(person, { mood } = {}) {
  const L = lookOf(person);
  const clsKey = CLASSES[person && person.cls] ? person.cls : 'brawler';
  const cls = CLASSES[clsKey];
  const golden = !!(person && person.golden);
  const t = tones(L);
  const B = BODY_P[L.body];
  const F = FACES[L.face];
  const prop = cls.props[L.prop] || cls.props[0];
  const mascot = L.hat === 'mascot';
  const capped = CAPPING.includes(L.hat);
  const tie = accent(L, [cls.color, t.hair.b], 2);
  const o = { capped, old: L.old, tie };
  const k = F.k;
  const hairT = `matrix(${k} 0 0 1 ${r2(50 * (1 - k))} ${r2(F.top - 23)})`;
  const parts = [bgP(cls.color, golden)];
  if (!PROP_FRONT.has(prop)) parts.push(propPortraitP(prop, B, t.skin));
  if (!mascot) parts.push(`<g transform="${hairT}">${hairBackP(L.hair, t, o)}</g>`);
  // neck
  if (!mascot) {
    const nw = B.neck;
    parts.push(`<path d="M${50 - nw} 56L${50 - nw} ${B.T + 4}L${50 + nw} ${B.T + 4}L${50 + nw} 56Z" fill="${t.skin.b}" stroke="${INK}" stroke-width="${SW}"/>`);
    parts.push(`<path d="M${50 - nw + 1.2} 62Q50 ${F.chin + 6} ${50 + nw - 1.2} 62L${50 + nw - 1.2} 66Q50 ${F.chin + 9} ${50 - nw + 1.2} 66Z" fill="${t.skin.s}"/>`);
  }
  parts.push(outfitP(clsKey, cls, L, t, B));
  if (mascot) {
    parts.push(mascotP(L.mascot, mood, L.eyes));
  } else {
    const ex = 22 * k;
    const ear = (x, flip) => toon(ell(x, 48.6, 4.4, 5.6), t.skin.b, t.skin.s, x - 1, 46, 0.84) + line(`M${r1(x + flip * 1.4)} 46.4Q${r1(x - flip * 1)} 48.6 ${r1(x + flip * 1)} 51.4`, t.skin.s, 1.6);
    parts.push(ear(50 - ex, 1) + ear(50 + ex, -1));
    parts.push(toon(F.d, t.skin.b, t.skin.s, 50 - 9, 37, 0.9));
    const forehead = ['bald', 'buzz', 'mohawk'].includes(L.hair) && (L.hat === 'none' || L.hat === 'headphones');
    parts.push(faceP(L, F, t, mood, { forehead }));
    parts.push(`<g transform="${hairT}">${hairFrontP(L.hair, t, o)}${hatP(L.hat, L, t, cls.color)}</g>`);
    if (L.extra === 'earring') {
      const x = r1(50 - ex - 0.6);
      parts.push(`<circle cx="${x}" cy="57.2" r="3" fill="none" stroke="${INK}" stroke-width="3.8"/><circle cx="${x}" cy="57.2" r="3" fill="none" stroke="${GOLD}" stroke-width="1.8"/><path d="M${r1(x - 1.6)} 55.2a2.4 2.4 0 0 1 2 -0.8" stroke="#fff3c4" stroke-width="0.9" fill="none" stroke-linecap="round"/>`);
    }
  }
  if (PROP_FRONT.has(prop)) parts.push(propPortraitP(prop, B, t.skin));
  if (golden) parts.push(goldenP());
  return `<svg class="portrait${golden ? ' golden' : ''}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
}

// ==============================================================================================
// FIGURE (viewBox 0 0 30 48, feet at (15, 47))
// ==============================================================================================

const POSES = ['idle', 'wave', 'sleep', 'cheer'];
const BODY_F = { slim: 4.8, medium: 5.8, big: 7.4 };
/** Heads are drawn at r≈7.5 around (15, 12.6), then scaled up onto the neck at (15, 21.3). */
const HEAD_T = 'matrix(1.12 0 0 1.12 -1.8 -1.66)';
const FACES_F = {
  round: { d: ell(15, 12.6, 7.6, 7.3), rx: 7.6, top: 5.3, k: 1.01 },
  oval: { d: ell(15, 12.8, 6.9, 7.9), rx: 6.9, top: 4.9, k: 0.92 },
  square: { d: 'M7.6 9.8C7.6 6.8 10.4 5.4 15 5.4C19.6 5.4 22.4 6.8 22.4 9.8L22.4 15.4C22.4 18.4 19.6 19.9 15 19.9C10.4 19.9 7.6 18.4 7.6 15.4Z', rx: 7.4, top: 5.4, k: 0.99 },
};
const HAIR_TOP_F = { short: 2.9, buzz: 3.7, curly: 1.9, long: 2.7, pony: 3.1, bun: 3.5, afro: 1.8, mohawk: 3.7, bald: 4.3, pigtails: 3.3 };

const F_SHORT = 'M7.3 14C6.4 7.6 10 4.1 15 4.1C20 4.1 23.6 7.6 22.7 14C22 11.8 21.2 10.4 19.9 9.4C17.6 10.6 14.4 10.8 11.6 9.8C10 10.8 8.4 12 7.3 14Z';
const F_BUZZ = 'M7.7 12C7.4 7.4 10.6 4.8 15 4.8C19.4 4.8 22.6 7.4 22.3 12C21.4 9.8 18.8 8.8 15 8.8C11.2 8.8 8.6 9.8 7.7 12Z';
const F_CURLY = (() => {
  const outer = arcPts(15, 11.6, 8.7, 8.3, 205, -25, 7);
  const inner = [
    [22.4, 14.6],
    [21.6, 10.6],
    [19, 9.2],
    [15, 9.9],
    [11, 9.2],
    [8.4, 10.6],
    [7.6, 14.6],
  ];
  return M(outer[0]) + bumps(outer) + Lto(inner[0]) + bumps(inner) + 'Z';
})();
const F_LONG_BACK = 'M7 11C6.6 5.6 10.4 3.8 15 3.8C19.6 3.8 23.4 5.6 23 11L23.8 25.6C20 27 10 27 6.2 25.6Z';
const F_LONG_FRONT = 'M15 4.3C10.4 4.1 6.6 6.8 6.7 12.6L6.6 20C7.6 20.6 8.6 20.4 9.2 19.6L9.4 13C10 10.2 12.4 8.4 15 7.6C17.6 8.4 20 10.2 20.6 13L20.8 19.6C21.4 20.4 22.4 20.6 23.4 20L23.3 12.6C23.4 6.8 19.6 4.1 15 4.3Z';
const F_PONY = 'M7.3 13.6C6.5 7.4 10 4.2 15 4.2C20 4.2 23.5 7.4 22.7 13.6C22 11 20.8 9.6 19.2 8.8C16.8 10 13 10 10.6 8.6C9 10 8 11.6 7.3 13.6Z';
const F_PONY_TAIL = 'M20.4 5.6C24.6 4 27.8 7 27.4 11.6C27 15.6 25.2 18.6 23.2 20.4C23.8 17 23.6 13.6 22.2 11Z';
const F_BUN = 'M7.6 13C7 7.2 10.6 4.6 15 4.6C19.4 4.6 23 7.2 22.4 13C21.6 10.4 19.6 9 17.6 8.6C16 9.2 14 9.2 12.4 8.6C10.4 9 8.4 10.4 7.6 13Z';
const F_AFRO_BACK = cloud(15, 11.4, 9.8, 8.8, 12, 90, 1.3);
const F_AFRO_BACK_CAPPED = cloud(15, 12.6, 9.8, 8.6, 12, 90, 1.3);
const F_AFRO_FRONT = (() => {
  const outer = arcPts(15, 11.8, 8.1, 7.5, 200, -20, 6);
  const inner = [
    [22.2, 14],
    [21.4, 10.4],
    [18.6, 9],
    [15, 9.6],
    [11.4, 9],
    [8.6, 10.4],
    [7.8, 14],
  ];
  return M(outer[0]) + bumps(outer) + Lto(inner[0]) + bumps(inner) + 'Z';
})();
const F_MOHAWK = 'M12.9 7.6C12.6 5.4 12.6 3.8 13 2.4L14.3 3.6L15 1.6L16.1 3.4L17.2 2.4C17.6 4 17.4 5.8 17.1 7.6Z';
const F_PIG = 'M7.3 13.8C6.5 7.6 10 4.4 15 4.4C20 4.4 23.5 7.6 22.7 13.8C21.9 11 20.6 9.6 18.8 9C17 8.6 15.8 7.8 15 6.8C14.2 7.8 13 8.6 11.2 9C9.4 9.6 8.1 11 7.3 13.8Z';
const F_PIG_L = 'M8.6 9.2C4.6 7.4 1.4 10.4 1.8 14.8C2.1 17.8 4.4 19.6 6.8 18.4C6.2 16.2 6.4 13.6 8 12.2Z';

function figHairBack(style, H, capped) {
  const f = (d, px, py) => toon(d, H.b, H.s, px, py, 0.88, FW);
  switch (style) {
    case 'long':
      return f(F_LONG_BACK, 10, 6);
    case 'pony':
      return f(F_PONY_TAIL, 23, 7);
    case 'bun':
      return capped ? '' : f(ell(15, 2.7, 2.9, 2.7), 14, 1.6);
    case 'afro':
      return f(capped ? F_AFRO_BACK_CAPPED : F_AFRO_BACK, 11, 4);
    case 'pigtails':
      return f(F_PIG_L + mirrorX(F_PIG_L, 15), 15, 9);
    default:
      return '';
  }
}

function figHairFront(style, H, skin, capped, tie) {
  const f = (d) => toon(d, H.b, H.s, 11, 6, 0.9, FW);
  const shaved = `<path d="${F_BUZZ}" fill="${mix(H.b, skin, 0.42)}" stroke="${INK}" stroke-width="${FW * 0.85}" stroke-linejoin="round"/>`;
  const tieDot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.15" fill="${tie}" stroke="${INK}" stroke-width="0.8"/>`;
  switch (style) {
    case 'short':
      return f(F_SHORT) + (capped ? '' : `<path d="M13.4 4.6Q14.4 1.8 17.2 1.6Q16 2.8 16.6 4.4Z" fill="${H.b}" stroke="${INK}" stroke-width="${FW * 0.85}" stroke-linejoin="round"/>`) + line('M10 7.6Q11.6 5.8 13.8 5.4', H.h, 0.9);
    case 'buzz':
      return shaved;
    case 'curly':
      return f(F_CURLY) + line('M10 7.4Q11.4 5.6 13.4 5.2', H.h, 0.9);
    case 'long':
      return f(F_LONG_FRONT) + line('M9.6 8Q11.4 5.8 13.6 5.4', H.h, 0.9);
    case 'pony':
      return f(F_PONY) + line('M10 7.6Q11.6 5.8 13.8 5.4', H.h, 0.9) + tieDot(21.2, 6.6);
    case 'bun':
      return f(F_BUN) + (capped ? '' : `<rect x="13.2" y="4.4" width="3.6" height="1.5" rx="0.7" fill="${tie}" stroke="${INK}" stroke-width="0.7"/>`);
    case 'afro':
      return f(F_AFRO_FRONT);
    case 'mohawk':
      return shaved + (capped ? '' : f(F_MOHAWK));
    case 'bald':
      return line('M10.4 8Q12.4 6.2 15 6.1', lighter(skin, 0.45), 1.1);
    case 'pigtails':
      return f(F_PIG) + tieDot(7.9, 10.4) + tieDot(22.1, 10.4);
    default:
      return '';
  }
}

function figHat(hat, L, hairBase, col) {
  const hc = accent(L, [col, hairBase], 1);
  const hs = darker(hc, 0.22);
  const w = FW;
  switch (hat) {
    case 'cap':
      return toon('M7.4 10.6C7 5.6 10.4 3 15 3C19.6 3 23 5.6 22.6 10.6C19 9.6 11 9.6 7.4 10.6Z', hc, hs, 11, 5, 0.88, w) + toon('M12 10C16 9.4 21 9.4 24.6 10C26.6 10.4 27.4 11.6 26.4 12.2C22.6 11.6 17 11.4 12 11.8Z', darker(hc, 0.1), darker(hc, 0.3), 14, 10, 0.9, w * 0.9) + `<circle cx="15" cy="3.1" r="0.7" fill="${hs}"/>`;
    case 'headphones': {
      const bt = HAIR_TOP_F[L.hair] - 1;
      return limb(`M6.8 13C6.6 ${r1(bt + 4)} 9.6 ${r1(bt)} 15 ${r1(bt)}C20.4 ${r1(bt)} 23.4 ${r1(bt + 4)} 23.2 13`, hc, 1.2, 0.55) + toon('M4.8 11.6Q4.8 10.2 6.4 10.2Q8.2 10.2 8.2 11.6L8.2 15.4Q8.2 16.8 6.4 16.8Q4.8 16.8 4.8 15.4Z', hc, hs, 5.4, 10.6, 0.85, w * 0.9) + toon('M21.8 11.6Q21.8 10.2 23.6 10.2Q25.2 10.2 25.2 11.6L25.2 15.4Q25.2 16.8 23.6 16.8Q21.8 16.8 21.8 15.4Z', hc, hs, 22.4, 10.6, 0.85, w * 0.9);
    }
    case 'bucket': {
      const bc = hc === CREAM ? '#f3d9a4' : hc;
      return toon('M8.5 10C8.3 5.2 11 3.2 15 3.2C19 3.2 21.7 5.2 21.5 10Z', bc, darker(bc, 0.2), 11, 5, 0.88, w) + toon('M4.6 11C6.6 8.6 23.4 8.6 25.4 11C23.4 12.4 6.6 12.4 4.6 11Z', lighter(bc, 0.08), darker(bc, 0.22), 10, 9.4, 0.92, w);
    }
    case 'flowers': {
      const top = Math.max(4.6, HAIR_TOP_F[L.hair] + 1.6);
      const cy = 2 * top - 9.6;
      const cols = ['#ff86c0', CREAM, '#f5b82e', '#b25cff'];
      let s = '';
      for (let i = 0; i < 4; i++) {
        const u = i / 3;
        const x = (1 - u) * (1 - u) * 8.2 + 2 * u * (1 - u) * 15 + u * u * 21.8;
        const y = (1 - u) * (1 - u) * 9.6 + 2 * u * (1 - u) * cy + u * u * 9.6;
        s += `<path d="${cloud(x, y, 1.9, 1.9, 5, 90, 1.5)}" fill="${cols[i]}" stroke="${INK}" stroke-width="0.7"/><circle cx="${r1(x)}" cy="${r1(y)}" r="0.6" fill="${cols[i] === '#f5b82e' ? '#ff8a3a' : '#f5b82e'}"/>`;
      }
      return s;
    }
    case 'hardhat':
      return toon('M7.6 10C7.4 4.6 10.6 2.2 15 2.2C19.4 2.2 22.6 4.6 22.4 10Z', '#ffcc2e', '#e09d14', 11, 4, 0.88, w) + `<path d="M13.6 2.5C13.4 5 13.4 7.6 13.6 10L16.4 10C16.6 7.6 16.6 5 16.4 2.5Z" fill="#ffe27a" stroke="${INK}" stroke-width="0.7"/>` + toon('M6.6 9.4L23.4 9.4Q24.6 9.4 24.6 10.5Q24.6 11.6 23.4 11.6L6.6 11.6Q5.4 11.6 5.4 10.5Q5.4 9.4 6.6 9.4Z', '#ffd84a', '#e09d14', 10, 9.6, 0.92, w);
    case 'bandana':
      return toon('M22.4 10.8C24.6 9.4 26.4 9.2 28 9.6C27 10.8 25.4 11.6 23.4 12Z', hc, hs, 23, 10, 0.85, w * 0.85) + toon('M22.6 12C24.4 12.8 25.8 14 26.6 15.8C25 15.6 23.8 14.8 22.6 13.4Z', darker(hc, 0.08), hs, 23, 12.4, 0.85, w * 0.85) + toon('M7.2 10.6C10 8.6 20 8.6 22.8 10.6L22.8 12.4C20 10.6 10 10.6 7.2 12.4Z', hc, hs, 11, 9.4, 0.9, w) + `<circle cx="22.8" cy="11.6" r="1.1" fill="${hc}" stroke="${INK}" stroke-width="0.8"/>`;
    default:
      return '';
  }
}

function figFace(L, F, skin, eyes, mouth) {
  const k = F.k;
  const xl = r1(15 - 2.7 * k);
  const xr = r1(15 + 2.7 * k);
  const ey = 13.3;
  const my = 16.6;
  const S = skin;
  const out = [];
  out.push(`<g fill="${L.skin >= 4 ? '#e2503e' : '#ff6f61'}" opacity="0.32"><path d="${ell(15 - 4.4 * k, 15.6, 1.4, 0.85)}"/><path d="${ell(15 + 4.4 * k, 15.6, 1.4, 0.85)}"/></g>`);
  if (L.extra === 'beard') out.push(toon(`M${r1(15 - 7.2 * k)} 13.4C${r1(15 - 7.2 * k)} 18 ${r1(15 - 4 * k)} 21 15 21.2C${r1(15 + 4 * k)} 21 ${r1(15 + 7.2 * k)} 18 ${r1(15 + 7.2 * k)} 13.4C${r1(15 + 6 * k)} 15.6 17.6 15.4 15 15.2C12.4 15.4 ${r1(15 - 6 * k)} 15.6 ${r1(15 - 7.2 * k)} 13.4Z`, S.hairB, S.hairS, 12, 15, 0.9, FW * 0.9) + `<path d="${ell(15, 16.9, 2, 1.2)}" fill="${S.b}"/>`);
  // mouth
  const dk = (d) => `<path d="${d}" fill="${MOUTH_IN}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>`;
  switch (mouth) {
    case 'grin':
      out.push(dk('M13.2 16Q15 16.4 16.8 16Q16.6 18.2 15 18.2Q13.4 18.2 13.2 16Z') + `<path d="M13.5 16.15Q15 16.5 16.5 16.15L16.4 16.8Q15 17.1 13.6 16.8Z" fill="#ffffff"/>`);
      break;
    case 'laugh':
      out.push(dk('M12.8 15.8Q15 16.3 17.2 15.8Q17 18.8 15 18.8Q13 18.8 12.8 15.8Z') + `<path d="${ell(15, 18, 1.2, 0.6)}" fill="${TONGUE}"/>`);
      break;
    case 'open':
    case 'o':
      out.push(dk(ell(15, 17, 0.9, 1.1)));
      break;
    case 'smirk':
      out.push(line('M13.4 16.9Q15.2 17.5 16.7 16.1', INK, 0.75));
      break;
    case 'flat':
      out.push(line('M13.8 16.9H16.2', INK, 0.75));
      break;
    case 'frown':
      out.push(line('M13.6 17.4Q15 16.2 16.4 17.4', INK, 0.75));
      break;
    default:
      out.push(line('M13.4 16.3Q15 17.9 16.6 16.3', INK, 0.75));
  }
  if (L.extra === 'mustache') out.push(`<path d="M15 15.3C13.6 14.6 12 14.9 11.6 16C12.6 15.7 13.8 16 15 15.9C16.2 16 17.4 15.7 18.4 16C18 14.9 16.4 14.6 15 15.3Z" fill="${S.hairB}" stroke="${INK}" stroke-width="0.5"/>`);
  // eyes
  const eye = (x) => {
    switch (eyes) {
      case 'happy':
        return line(`M${r1(x - 1.2)} ${ey + 0.4}Q${x} ${ey - 1.4} ${r1(x + 1.2)} ${ey + 0.4}`, INK, 0.8);
      case 'closed':
        return line(`M${r1(x - 1.2)} ${ey}Q${x} ${ey + 1.2} ${r1(x + 1.2)} ${ey}`, INK, 0.8);
      case 'wide':
        return `<circle cx="${x}" cy="${ey}" r="1.45" fill="#ffffff" stroke="${INK}" stroke-width="0.55"/><circle cx="${x}" cy="${r1(ey + 0.2)}" r="0.8" fill="${INK}"/>`;
      case 'sleepy':
        return `<path d="M${r1(x - 1.1)} ${ey}A1.1 1.1 0 0 0 ${r1(x + 1.1)} ${ey}Z" fill="${INK}"/>` + line(`M${r1(x - 1.4)} ${ey}H${r1(x + 1.4)}`, INK, 0.7);
      default:
        return `<path d="${ell(x, ey, 0.9, 1.2)}" fill="${INK}"/><circle cx="${r1(x + 0.35)}" cy="${r1(ey - 0.45)}" r="0.38" fill="#ffffff"/>`;
    }
  };
  if (L.extra !== 'shades') {
    out.push(eye(xl));
    if (L.extra !== 'eyepatch') out.push(eye(xr));
  }
  switch (L.extra) {
    case 'glasses':
      out.push(`<g fill="#ffffff" fill-opacity="0.25" stroke="${INK}" stroke-width="0.6"><circle cx="${xl}" cy="${ey}" r="1.9"/><circle cx="${xr}" cy="${ey}" r="1.9"/></g>` + line(`M${r1(xl + 1.9)} ${ey}H${r1(xr - 1.9)}`, INK, 0.55));
      break;
    case 'shades':
      out.push(`<path d="M${r1(xl - 2.2)} ${ey - 1.2}H${r1(xr + 2.2)}L${r1(xr + 2)} ${ey + 0.4}Q${r1(xr + 1.6)} ${ey + 1.7} ${xr} ${ey + 1.7}Q${r1(xr - 1.6)} ${ey + 1.7} ${r1(xr - 1.9)} ${ey}H${r1(xl + 1.9)}Q${r1(xl + 1.6)} ${ey + 1.7} ${xl} ${ey + 1.7}Q${r1(xl - 1.6)} ${ey + 1.7} ${r1(xl - 2)} ${ey + 0.4}Z" fill="#232634" stroke="${INK}" stroke-width="0.55" stroke-linejoin="round"/>`);
      break;
    case 'eyepatch':
      out.push(line(`M${r1(15 - 7 * k)} 9.6L${r1(15 + 7.2 * k)} 14.6`, INK, 0.6) + `<path d="${ell(xr, ey + 0.1, 1.7, 1.5)}" fill="#2c2a33" stroke="${INK}" stroke-width="0.5"/>`);
      break;
    case 'freckles':
      out.push(`<g fill="${darker(S.s, 0.25)}"><circle cx="${r1(15 - 4 * k)}" cy="14.9" r="0.35"/><circle cx="${r1(15 - 3 * k)}" cy="15.5" r="0.35"/><circle cx="${r1(15 + 4 * k)}" cy="14.9" r="0.35"/><circle cx="${r1(15 + 3 * k)}" cy="15.5" r="0.35"/></g>`);
      break;
    case 'bandaid':
      out.push(`<rect x="-1.7" y="-0.7" width="3.4" height="1.4" rx="0.6" fill="${S.band}" stroke="${INK}" stroke-width="0.45" transform="translate(${r1(15 - 4.4 * k)} 15.4) rotate(-28)"/>`);
      break;
    case 'earring':
      out.push(`<circle cx="${r1(15 - F.rx - 0.2)}" cy="15.6" r="0.75" fill="none" stroke="${GOLD}" stroke-width="0.6"/>`);
      break;
    default:
      break;
  }
  if (L.old) out.push(line(`M${r1(xl - 1.8)} ${ey - 0.6}l-0.8 -0.4M${r1(xr + 1.8)} ${ey - 0.6}l0.8 -0.4`, darker(S.s, 0.1), 0.45));
  return out.join('');
}

function figMascot(kind) {
  const w = FW;
  if (kind === 1) {
    const b = '#f5f0e6';
    const s = '#d8cebd';
    return (
      toon('M11 7.6C9.6 5 9.8 2.6 11.6 1.8C13.4 2.6 13.8 5 13.4 7.6Z', b, s, 11, 3, 0.85, w) +
      `<path d="M11.2 7C10.7 5.4 10.9 3.6 11.6 2.8C12.3 3.6 12.7 5.4 12.4 7Z" fill="#ffb3c8"/>` +
      toon('M16.6 7.6C16.4 5.2 17.4 3 19.4 2.4C21 2 22.8 2.8 23.8 4.4C22.2 4.2 20.6 4.6 19.8 5.6C19.2 6.2 19 7 18.8 7.8Z', b, s, 17, 4, 0.85, w) +
      toon(ell(15, 13.4, 8.4, 7.6), b, s, 12, 9, 0.9, w) +
      `<g fill="${INK}"><path d="${ell(12, 12.2, 1.4, 1.7)}"/><path d="${ell(18, 12.2, 1.4, 1.7)}"/></g><g fill="#ffffff"><circle cx="12.4" cy="11.6" r="0.5"/><circle cx="18.4" cy="11.6" r="0.5"/></g>` +
      `<path d="M14 15.2Q15 14.8 16 15.2Q15.6 16.2 15 16.4Q14.4 16.2 14 15.2Z" fill="#ff8fb1" stroke="${INK}" stroke-width="0.4"/>` +
      `<path d="M14.1 16.8H15.9V18.2H14.1Z" fill="#ffffff" stroke="${INK}" stroke-width="0.45"/>`
    );
  }
  if (kind === 2) {
    const b = '#ffd43b';
    const s = '#e3a51e';
    return (
      toon('M14 4.6C13.2 2 14.6 0.6 16.4 1C15.4 1.8 15.4 3 16.2 4.4Z', b, s, 14, 2, 0.85, w * 0.9) +
      toon(ell(15, 12.4, 8.8, 8.6), b, s, 12, 8, 0.9, w) +
      `<g fill="#ffffff" stroke="${INK}" stroke-width="0.55"><circle cx="11.6" cy="10.6" r="2"/><circle cx="18.4" cy="10.6" r="2"/></g><g fill="${INK}"><circle cx="12.3" cy="11.1" r="1.05"/><circle cx="17.7" cy="11.2" r="1.05"/></g>` +
      toon('M9.6 17.2C11 19.4 13.2 20.2 15 20.2C16.8 20.2 19 19.4 20.4 17.2Z', '#f08a26', '#c96a14', 12, 17, 0.9, w * 0.8) +
      toon('M8.2 15.4C8.2 13.4 11.6 13.6 15 13.8C18.4 13.6 21.8 13.4 21.8 15.4C21.8 17 18.6 17.8 15 17.8C11.4 17.8 8.2 17 8.2 15.4Z', '#ff9a2e', '#d9701a', 12, 14, 0.9, w)
    );
  }
  const b = '#b07444';
  const s = '#8a5530';
  return (
    toon(ell(8.4, 5.4, 3), b, s, 7.6, 4.4, 0.85, w) +
    `<path d="${ell(8.5, 5.6, 1.6)}" fill="#e2ad82"/>` +
    toon(ell(21.6, 5.4, 3), b, s, 20.8, 4.4, 0.85, w) +
    `<rect x="20.2" y="4" width="2.6" height="2.6" fill="#6fa0d8" stroke="${INK}" stroke-width="0.5" transform="rotate(14 21.5 5.3)"/>` +
    toon(ell(15, 12.6, 9, 8.4), b, s, 11, 8, 0.9, w) +
    `<g fill="#ffffff" stroke="${INK}" stroke-width="0.55"><circle cx="11.4" cy="10.8" r="1.9"/><circle cx="18.6" cy="10.8" r="2"/></g><g fill="${INK}"><circle cx="11.7" cy="11.1" r="1.05"/><circle cx="18.9" cy="10.5" r="1.05"/></g>` +
    toon(ell(15, 15.6, 4.4, 3.2), '#f0d2a2', '#d9b47e', 13.6, 14, 0.9, w * 0.8) +
    `<path d="M13.6 14.2Q15 13.6 16.4 14.2Q16.4 15.4 15 15.8Q13.6 15.4 13.6 14.2Z" fill="${INK}"/>` +
    `<path d="M13.4 16.8Q15 17.4 16.6 16.8Q16.4 18.4 15 18.4Q13.6 18.4 13.4 16.8Z" fill="#2b211d"/>`
  );
}

/** Outfit pieces for the figure torso: { torso, sleeve (null = bare arms), pants }. */
function figOutfit(clsKey, cls, L, w, skin) {
  const o = outfitTones(cls, L);
  const top = 21;
  const bot = 35.6;
  const a = 15 - w;
  const b = 15 + w;
  const belly = L.body === 'big' ? 1.2 : 0;
  const d = `M${a} ${bot - 1.4}L${a - belly * 0.4} ${top + 5}C${a - belly * 0.4} ${top + 1.2} ${a + 1.4} ${top} ${a + 3} ${top}L${b - 3} ${top}C${b - 1.4} ${top} ${b + belly * 0.4} ${top + 1.2} ${b + belly * 0.4} ${top + 5}L${b} ${bot - 1.4}C${b} ${bot - 0.4} ${b - 1} ${bot} ${b - 2} ${bot}L${a + 2} ${bot}C${a + 1} ${bot} ${a} ${bot - 0.4} ${a} ${bot - 1.4}Z`;
  const body = (fill, sh) => toon(d, fill, sh, a + 2, top + 1, 0.9, FW);
  const parts = [];
  let sleeve = o.b;
  let pants = '#41507a';
  if (clsKey === 'brawler' && !L.outfit) {
    parts.push(body(o.b, o.s));
    parts.push(`<path d="M12.4 ${top}Q15 ${top + 3.4} 17.6 ${top}Z" fill="${skin}" stroke="${INK}" stroke-width="0.6"/>`);
    parts.push(`<path d="${star(15, top + 7.6, 1.8)}" fill="${CREAM}" stroke="${INK}" stroke-width="0.4"/>`);
    sleeve = null;
    pants = '#41507a';
  } else if (clsKey === 'brawler') {
    parts.push(body(CREAM, '#e5d6bd'));
    parts.push(line(`M12.4 ${top + 3.6}L12.6 ${top + 0.2}M17.6 ${top + 3.6}L17.4 ${top + 0.2}`, o.b, 0.9));
    parts.push(toon(`M11.6 ${bot}L11.6 ${top + 4.6}Q11.6 ${top + 3.4} 12.8 ${top + 3.4}L17.2 ${top + 3.4}Q18.4 ${top + 3.4} 18.4 ${top + 4.6}L18.4 ${bot}Z`, o.b, o.s, 12.4, top + 4, 0.9, FW * 0.85));
    sleeve = CREAM;
    pants = '#4a4f5a';
  } else if (clsKey === 'shooter') {
    const shirt = L.outfit ? '#d7ebff' : CREAM;
    parts.push(body(o.b, o.s));
    parts.push(`<path d="M12.6 ${top}L15 ${top + 6}L17.4 ${top}Z" fill="${shirt}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>`);
    parts.push(line(`M15 ${top + 6}V${bot - 0.4}`, o.s, 0.7));
    parts.push(`<path d="${star(r1(15 + w * 0.5), top + 4.4, 1.4)}" fill="${GOLD}" stroke="${INK}" stroke-width="0.35"/>`);
    if (L.outfit) parts.push(`<path d="M15 ${top + 0.8}L13.4 ${top}V${top + 1.8}ZM15 ${top + 0.8}L16.6 ${top}V${top + 1.8}Z" fill="#e8483f" stroke="${INK}" stroke-width="0.4"/>`);
    sleeve = shirt;
    pants = '#b98f5a';
  } else if (clsKey === 'medic') {
    parts.push(body(o.b, o.s));
    parts.push(`<path d="M12.8 ${top}L15 ${top + 3.6}L17.2 ${top}Z" fill="${skin}" stroke="${INK}" stroke-width="0.55" stroke-linejoin="round"/>`);
    const cx = r1(15 + w * 0.45);
    parts.push(`<path d="M${r1(cx - 0.6)} ${top + 3.6}h1.2v1.2h1.2v1.2h-1.2v1.2h-1.2v-1.2h-1.2v-1.2h1.2Z" fill="${CREAM}" stroke="${INK}" stroke-width="0.3"/>`);
    if (L.outfit) parts.push(line(`M12.8 ${top + 0.2}Q12.2 ${top + 4.6} 14.2 ${top + 5.4}M17.2 ${top + 0.2}Q17.4 ${top + 3.4} 15.2 ${top + 5.4}`, '#4a5060', 0.55) + `<circle cx="14.6" cy="${top + 5.8}" r="0.75" fill="${STEEL}" stroke="${INK}" stroke-width="0.35"/>`);
    pants = darker(o.b, 0.18);
  } else if (!L.outfit) {
    const tee = '#5d6e91';
    parts.push(body(tee, darker(tee, 0.2)));
    parts.push(toon(`M11.4 ${bot}L11.4 ${top + 4.8}Q11.4 ${top + 4} 12.2 ${top + 4}L17.8 ${top + 4}Q18.6 ${top + 4} 18.6 ${top + 4.8}L18.6 ${bot}Z`, o.b, o.s, 12, top + 4.4, 0.9, FW * 0.85));
    parts.push(line(`M12 ${top + 4.2}L${a + 1.6} ${top + 0.4}M18 ${top + 4.2}L${b - 1.6} ${top + 0.4}`, o.b, 0.9));
    sleeve = tee;
    pants = o.s;
  } else {
    const tee = '#3f4656';
    parts.push(body(o.b, o.s));
    parts.push(`<path d="M12.8 ${top}L15 ${top + 4}L17.2 ${top}Z" fill="${tee}" stroke="${INK}" stroke-width="0.55" stroke-linejoin="round"/>`);
    parts.push(`<path d="M${a + 0.5} ${top + 7.6}H${b - 0.5}V${top + 9.2}H${a + 0.5}Z" fill="#e9eef5" stroke="${INK}" stroke-width="0.4"/>`);
    parts.push(line(`M15 ${top + 4}V${bot - 0.4}`, o.s, 0.6));
    sleeve = tee;
    pants = '#4a4f5a';
  }
  return { torso: parts.join(''), sleeve, pants };
}

/**
 * A small full-body park figure (viewBox 0 0 30 48, feet at (15, 47), class
 * "figure f-<pose>", plus "golden"). pose: 'idle' | 'wave' | 'sleep' | 'cheer'.
 * Animation hooks: .f-body (everything above the legs, origin at the hips),
 * .f-leg.f-l / .f-leg.f-r (origin at each hip), .f-arm (the prop arm, origin
 * at its shoulder), .f-head (origin at the neck), .f-z (sleep Zs), .f-spark
 * (golden sparkles), .f-shadow. Each hook carries its own transform-origin.
 */
export function figureSvg(person, { pose = 'idle' } = {}) {
  if (!POSES.includes(pose)) pose = 'idle';
  const L = lookOf(person);
  const clsKey = CLASSES[person && person.cls] ? person.cls : 'brawler';
  const cls = CLASSES[clsKey];
  const golden = !!(person && person.golden);
  const t = tones(L);
  const S = t.skin;
  const F = FACES_F[L.face];
  const w = BODY_F[L.body];
  const prop = cls.props[L.prop] || cls.props[0];
  const mascot = L.hat === 'mascot';
  const capped = CAPPING.includes(L.hat);
  const tie = accent(L, [cls.color, t.hair.b], 2);
  const shoe = accent(L, [cls.color, '#3d8bf0'], 4);
  const out = figOutfit(clsKey, cls, L, w, S.b);

  // legs
  const hipY = 34.4;
  const legX = Math.max(2.3, w * 0.48);
  const legW = L.body === 'big' ? 3.3 : L.body === 'slim' ? 2.5 : 2.8;
  const leg = (x, side) => {
    const sx = side === 'f-l' ? -0.5 : 0.5;
    return (
      `<g class="f-leg ${side}" style="transform-origin:${r1(x)}px ${hipY}px">` +
      limb(`M${r1(x)} ${hipY}L${r1(x)} 44.4`, out.pants, legW, 0.6) +
      toon(`M${r1(x + sx - 2.3)} 46.1C${r1(x + sx - 2.3)} 44.6 ${r1(x + sx - 1.2)} 44 ${r1(x + sx)} 44C${r1(x + sx + 1.2)} 44 ${r1(x + sx + 2.3)} 44.6 ${r1(x + sx + 2.3)} 46.1C${r1(x + sx + 2.3)} 46.8 ${r1(x + sx + 1.6)} 47 ${r1(x + sx)} 47C${r1(x + sx - 1.6)} 47 ${r1(x + sx - 2.3)} 46.8 ${r1(x + sx - 2.3)} 46.1Z`, shoe, darker(shoe, 0.25), x + sx - 1, 44.6, 0.85, FW * 0.85) +
      `</g>`
    );
  };

  // arms: angle in degrees, 0 = hanging straight down, + swings toward −x
  const ang = {
    idle: [14, -14],
    wave: [12, -150],
    cheer: [152, -152],
    sleep: [5, -5],
  }[pose];
  const len = 8.2;
  const SL = [15 - w + 1, 22.9];
  const SR = [15 + w - 1, 22.9];
  const handAt = (Sp, deg) => {
    const a = (deg * Math.PI) / 180;
    return [Sp[0] - len * Math.sin(a), Sp[1] + len * Math.cos(a)];
  };
  const HL = handAt(SL, ang[0]);
  const HR = handAt(SR, ang[1]);
  const armW = L.body === 'big' ? 2.8 : 2.4;
  const arm = (Sp, H) => {
    const mid = [Sp[0] + (H[0] - Sp[0]) * 0.42, Sp[1] + (H[1] - Sp[1]) * 0.42];
    const dd = `M${r1(Sp[0])} ${r1(Sp[1])}L${r1(H[0])} ${r1(H[1])}`;
    return limb(dd, S.b, armW, 0.6) + (out.sleeve ? line(`M${r1(Sp[0])} ${r1(Sp[1])}L${r1(mid[0])} ${r1(mid[1])}`, out.sleeve, armW + 0.3) : '');
  };
  const hand = (H) => toon(ell(H[0], H[1], 1.5, 1.45), S.b, S.s, H[0] - 0.5, H[1] - 0.5, 0.82, FW * 0.85);

  // prop in the right hand
  const kind = PROP_KIND[prop] || 'long';
  const ps = PROP_FIG_SCALE[prop] || 0.29;
  const phi = kind === 'long' ? { idle: 26, wave: 8, cheer: 2, sleep: 118 }[pose] : 0;
  const propG = `<g transform="translate(${r1(HR[0])} ${r1(HR[1])}) rotate(${phi}) scale(${ps})">${propArt(prop, FW / ps, true)}</g>`;
  const armR = arm(SR, HR) + (kind === 'palm' ? hand(HR) + propG : propG + hand(HR));
  const armL = arm(SL, HL) + hand(HL);

  // head
  const eyes = pose === 'sleep' ? 'closed' : pose === 'cheer' ? 'happy' : L.eyes;
  const mouth = pose === 'sleep' ? 'o' : pose === 'cheer' ? 'laugh' : pose === 'wave' && ['flat', 'smirk'].includes(L.mouth) ? 'smile' : L.mouth;
  const k = F.k;
  const hairT = `matrix(${k} 0 0 1 ${r2(15 * (1 - k))} ${r2(F.top - 5.1)})`;
  const skinX = { ...S, hairB: t.hair.b, hairS: t.hair.s, band: lighter(accent(L, [CREAM, CREAM], 3), 0.42) };
  let head;
  if (mascot) {
    head = figMascot(L.mascot);
  } else {
    const ex = F.rx;
    head =
      toon(ell(15 - ex, 13.6, 1.5, 1.9), S.b, S.s, 15 - ex - 0.3, 13, 0.8, FW * 0.85) +
      toon(ell(15 + ex, 13.6, 1.5, 1.9), S.b, S.s, 15 + ex - 0.3, 13, 0.8, FW * 0.85) +
      toon(F.d, S.b, S.s, 12, 9.4, 0.9, FW) +
      figFace(L, F, skinX, eyes, mouth) +
      `<g transform="${hairT}">${figHairFront(L.hair, t.hair, S.b, capped, tie)}${figHat(L.hat, L, t.hair.b, cls.color)}</g>`;
  }
  const tilt = pose === 'sleep' ? 12 : 0;
  const tiltT = tilt ? `rotate(${tilt} 15 21.3) ` : '';
  const headG = `<g class="f-head" style="transform-origin:15px 21.3px"><g transform="${tiltT}${HEAD_T}">${head}</g></g>`;
  const back = mascot ? '' : figHairBack(L.hair, t.hair, capped);
  const backG = back ? `<g transform="${tiltT}${HEAD_T}"><g transform="${hairT}">${back}</g></g>` : '';

  const zs = pose === 'sleep' ? `<g class="f-z">${limb('M21.8 4.2H24.2L21.8 6.6H24.2', CREAM, 0.7, 0.45)}${limb('M25.6 0.6H27.2L25.6 2.2H27.2', CREAM, 0.6, 0.4)}</g>` : '';
  const spark = golden ? `<g class="f-spark" fill="#fffbe6" stroke="${GOLD}" stroke-width="0.55" stroke-linejoin="round"><path d="${sparkle(3.4, 9, 2.4)}"/><path d="${sparkle(26.6, 25, 1.8)}"/><path d="${sparkle(4.6, 30, 1.4)}"/></g>` : '';
  const shadow = `<ellipse class="f-shadow" cx="15" cy="46.6" rx="${r1(7 + w * 0.3)}" ry="1.6" fill="${golden ? GOLD : INK}" opacity="${golden ? 0.45 : 0.22}"/>`;

  const body =
    `<g class="f-body" style="transform-origin:15px ${hipY}px">` +
    backG +
    out.torso +
    (pose === 'cheer' ? '' : armL) +
    (pose === 'cheer' || pose === 'wave' ? '' : `<g class="f-arm" style="transform-origin:${r1(SR[0])}px ${r1(SR[1])}px">${armR}</g>`) +
    headG +
    (pose === 'cheer' ? armL : '') +
    (pose === 'cheer' || pose === 'wave' ? `<g class="f-arm" style="transform-origin:${r1(SR[0])}px ${r1(SR[1])}px">${armR}</g>` : '') +
    `</g>`;
  return `<svg class="figure f-${pose}${golden ? ' golden' : ''}" viewBox="0 0 30 48" overflow="visible" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shadow}${leg(15 - legX, 'f-l')}${leg(15 + legX, 'f-r')}${body}${zs}${spark}</svg>`;
}
