// Room illustrations for the Safehouse base view, a building cross-section of
// eight rooms. Each room is one SVG (viewBox 200x120, sliced to fill its
// card). The top ~20 units sit under the UI's label strip and the bottom ~22
// under its status bar, so those bands stay calm (ceiling, wall, floor) and the
// props live in the middle band. Level 0 is the bare, unbuilt room; levels 1-2,
// 3-4 and 5 add more and better props. Shared gradients, patterns and a few
// ambient animations live in artDefs(); every reference to them has a
// fallback, so a room still reads without them.

const L = '#15110d';
const NS = ' stroke="none"';
const W1 = ' stroke-width="1"';

export const ART_VIEW = { w: 200, h: 120 };

/** Portrait anchors (viewBox units, pillow positions) for bunks 1..5 in the Barracks art. */
export const BUNK_SLOTS = [
  [46, 78],
  [100, 78],
  [154, 78],
  [46, 42],
  [100, 42],
];

// --- Primitives ----------------------------------------------------------------------------------

const n1 = (v) => Math.round(v * 10) / 10;
// R(x, y, w, h, fill, rx?, extra?); a string in place of rx is the extra
// attributes. Square-cornered rectangles come out as short paths.
const R = (x, y, w, h, fill, rx = 0, ex = '') =>
  typeof rx === 'string'
    ? R(x, y, w, h, fill, 0, rx)
    : rx
      ? `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${rx}" fill="${fill}"${ex}/>`
      : `<path d="M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z" fill="${fill}"${ex}/>`;
const P = (d, fill, ex = '') => `<path d="${d}" fill="${fill}"${ex}/>`;
const C = (cx, cy, r, fill, ex = '') => `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${fill}"${ex}/>`;
const E = (cx, cy, rx, ry, fill, ex = '') => `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${fill}"${ex}/>`;
const S = (d, color, w = 1.6, ex = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"${ex}/>`;
const OS = (d, color, w) => S(d, L, w + 2.6) + S(d, color, w);
const T = (x, y, inner, ex = '') => `<g transform="translate(${n1(x)} ${n1(y)})"${ex}>${inner}</g>`;
const U = (id, fb = 'none') => `url(#sh-${id}) ${fb}`;
// Light / dark detail strokes; the alpha goes into a 4-digit hex colour.
const a16 = (o) => Math.max(1, Math.min(15, Math.round(o * 15))).toString(16);
const HL = (d, w = 1.2, o = 0.35) => S(d, `#fff${a16(o)}`, w);
const DK = (d, w = 1, o = 0.25) => S(d, `#000${a16(o)}`, w);
// Many round dots in one path: zero-length segments with round caps.
const dots = (pts, color, size, ex = '') => `<path d="${pts.map(([x, y]) => `M${n1(x)} ${n1(y)}h0`).join('')}" stroke="${color}" stroke-width="${size}"${ex}/>`;
// Several same-coloured rectangles as one path.
const rects = (list, fill, ex = '') => P(list.map(([x, y, w, h]) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}z`).join(''), fill, ex);
const glow = (cx, cy, r, id = 'lamp', ex = '') => C(cx, cy, r, U(id), NS + ex);
const shade = (o) => R(0, 0, 200, 120, '#05070a', ` opacity="${o}"${NS}`);
const tier = (lv) => (lv >= 5 ? 3 : lv >= 3 ? 2 : 1);

const K = {
  wood: '#8a5a33',
  woodD: '#6e4526',
  woodL: '#b07a45',
  steel: '#8c99a6',
  steelD: '#5f6b77',
  steelL: '#c5ced6',
  dark: '#3a3f47',
  darker: '#2b2f36',
  hazard: '#f2c14e',
  med: '#e2504b',
  safe: '#49c06a',
  olive: '#5d6b3a',
};

const svg = (body) =>
  (
    `<svg class="room-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<g stroke="${L}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${body}${R(0, 0, 200, 120, U('vig'), NS)}</g></svg>`
  ).replace(/([^\d.])0\.(?=\d)/g, '$1.');

/** Back wall (with an optional texture), ceiling band, skirting and floor. */
function shell(wall, tex, floor, trim, ceil) {
  return (
    `<g stroke="none">` +
    R(0, 0, 200, 120, wall) +
    (tex ? R(0, 0, 200, 93, U(tex)) : '') +
    R(0, 0, 200, 7, ceil) +
    R(0, 93, 200, 27, floor) +
    R(0, 91.5, 200, 3, trim) +
    R(0, 94.5, 200, 1.2, '#fff', ' opacity=".07"') +
    R(0, 0, 200, 120, U('shade')) +
    `</g>`
  );
}

// --- Shared props ---------------------------------------------------------------------------------

function bulb(x, y, on, r = 42) {
  return (
    (on ? glow(x, y + 3, r, 'lamp', ' class="sh-flicker"') : '') +
    S(`M${x} 0V${y - 3}`, L, 1.1) +
    R(x - 2.2, y - 4, 4.4, 4, K.dark, 0.6) +
    C(x, y + 2.6, 3.4, on ? '#ffe9b0' : '#5d646e') +
    (on ? '' : S(`M${x - 1.6} ${y + 1.4}l1.6 1.2.4 1.6`, '#9aa3ad', 0.7))
  );
}

/** Industrial cone lamp hanging from the ceiling; when on, a cone of warm light. */
function shadeLamp(x, y, on, cone = 64, tint = '#4c6a5c') {
  return (
    (on ? glow(x, y + 8, 48, 'lamp', ' class="sh-flicker"') + P(`M${x - 6} ${y + 6}L${x - cone / 2} 93H${x + cone / 2}L${x + 6} ${y + 6}z`, U('beam'), NS) : '') +
    S(`M${x} 0V${y - 2}`, L, 1.1) +
    P(`M${x - 2.6} ${y - 3}h5.2l6.4 8.6H${x - 9}z`, tint) +
    E(x, y + 5.8, 8.4, 1.9, on ? '#fff1c4' : K.dark, ' stroke-width="1.2"')
  );
}

const web = (x, y, flip) =>
  `<path transform="translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}" d="M0 0l20 15M0 0l7 21M0 0l22 5M3.5 2.6c2.4 2 2.4 4.2 1 6.6M8.6 6.4c3.4 1.6 3.6 5.6 1.4 9.4M14.6 10.9c2.8-.2 3.4-3.2 2.2-7" fill="none" stroke="#d6dde3" stroke-opacity=".3" stroke-width=".7"/>`;

/** A nailed plank from (x1, y1) to (x2, y2). */
function plank(x1, y1, x2, y2, w = 8, fill = '#9a6a3e', grain = true) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = (-uy * w) / 2;
  const ny = (ux * w) / 2;
  const pt = (x, y) => `${n1(x)} ${n1(y)}`;
  return (
    P(`M${pt(x1 + nx, y1 + ny)}L${pt(x2 + nx, y2 + ny)}L${pt(x2 - nx, y2 - ny)}L${pt(x1 - nx, y1 - ny)}z`, fill) +
    (grain ? DK(`M${pt(x1 + ux * 6 - nx * 0.4, y1 + uy * 6 - ny * 0.4)}L${pt(x1 + ux * len * 0.6 - nx * 0.4, y1 + uy * len * 0.6 - ny * 0.4)}`, 0.8, 0.22) : '') +
    dots([[x1 + ux * 3.6, y1 + uy * 3.6], [x2 - ux * 3.6, y2 - uy * 3.6]], L, 2.2)
  );
}

/** Rows of sandbags, [[x, y, count], ...], as two colour groups and one seam path. */
function sandbags(rows, w = 15, h = 8) {
  let a = '';
  let b = '';
  let seam = '';
  let k = 0;
  for (const [x, y, n] of rows) {
    for (let i = 0; i < n; i++, k++) {
      const bx = n1(x + i * (w - 1));
      const r = `<rect x="${bx}" y="${y}" width="${w}" height="${h}" rx="3.6"/>`;
      if (k % 2) b += r;
      else a += r;
      seam += `M${n1(bx + 3)} ${n1(y + h / 2)}h${w - 6}`;
    }
  }
  return `<g fill="#bba676">${a}</g>` + (b ? `<g fill="#a8925f">${b}</g>` : '') + DK(seam, 0.8, 0.2);
}

function crate(x, y, w, h, fill = '#9a6a3e') {
  return R(x, y, w, h, fill, 1) + DK(`M${x + 2} ${n1(y + h / 2)}h${w - 4}M${x + 2.5} ${y + 2.5}L${x + w - 2.5} ${y + h - 2.5}`, 1.2, 0.3);
}

function jerry(x, y = 94) {
  return T(
    x,
    y,
    P('M1.6-14.9v-2.4c0-.5.4-.9.9-.9h4.4c.5 0 .9.4.9.9v2.4', 'none', ' stroke-width="1.4"') +
      P('M0 0v-13.5c0-.8.6-1.4 1.4-1.4H9l3.2 3.2V0z', '#c9432e') +
      S('M2.6-11l7 8.8M9.6-11l-7 8.8', '#8e2c1f', 1.2) +
      P('M9.2-14.9l1.4-2.6h2l-.4 3.2z', K.hazard, ' stroke-width="1.1"'),
  );
}

function ammoCan(x, y, w = 18, h = 11) {
  return R(x, y, w, h, K.olive, 1.2) + R(x + 3, y + 3.6, w - 6, 3, K.hazard, W1) + S(`M${x + 5} ${y}v-2h${w - 10}v2`, L, 1.4);
}

function tyre(x, y, r = 7) {
  return C(x, y, r, '#24272c') + C(x, y, r * 0.45, K.steelD, ' stroke-width="1.2"');
}

const SPECKS = [[30, 40], [62, 58], [88, 34], [118, 64], [140, 42], [166, 70], [52, 80], [176, 36], [104, 50]];

/** Unbuilt-room dressing: rubble, a broken plank, dust, a cobweb, a dead bulb, no light. */
function bare(bulbX = 100) {
  return (
    P('M16 94.6l6-5.6 6.6-2.4 8.4 2.4 9 5.6zM146 94.6l6.8-4.2 7.4-1.8 9.6 1.8 10.2 4.2zM72 94.6l2.8-2.8 3-1.2 4 1.2 4.2 2.8z', '#4f555c') +
    plank(120, 93, 148, 88, 5, '#7a5233') +
    dots(SPECKS, '#e9e4d6', 1.3, ' stroke-opacity=".35"') +
    DK('M150 20l-4 6 3 4-5 7M40 50l5 4-2 5', 1, 0.3) +
    web(0, 7) +
    bulb(bulbX, 32, false) +
    shade(0.3)
  );
}

// --- Barricade: the front entrance ------------------------------------------------------------

function street(lv) {
  const zx = lv === 0 ? 112 : 120;
  const zombie =
    lv > 2
      ? ''
      : T(
          zx,
          0,
          P('M-2.6 75c-.2-1.3.6-2.2 1.9-2.3h2.4c1.3 0 2.1.9 2.2 2.1l.6 7.6 1.6 9.4H3.6L1.6 84.6.2 91.8h-2.6l.9-9.3zM-2 75.6l-8.4 1-.2 1.8 8.8.6zM-1.6 79l-7.6 2.2.2 1.6 7.6-1z', '#0a0e16', NS) +
            C(0, 70, 3.4, '#0a0e16', NS) +
            dots([[-1.6, 69.6], [0.8, 69.6]], '#c9e36a', 1.1),
        );
  const sky = R(69, 27, 62, 68, U('sky', '#16203a'), NS);
  if (lv >= 3) return sky + P('M69 60v-8h11v6h9v-9h12v8h8v-6h12v9z', '#0c111d', NS);
  return (
    sky +
    dots([[76, 33], [98, 31], [124, 37], [104, 40]], '#cfd8ff', 1.3, ' stroke-opacity=".7"') +
    C(116, 39, 5, '#e9e4d0', NS) +
    C(118.6, 37.6, 4.4, '#16203a', NS) +
    P('M69 82V62h6v-6h10v8h5V52h11v12h6v-5h9v8h6v-9h9v24z', '#0c111d', NS) +
    dots([[94, 57], [115, 64], [76, 66]], '#ffcf7a', 2, ' stroke-linecap="square" stroke-opacity=".55"') +
    R(69, 82, 62, 13, '#171b23', NS) +
    glow(88, 54, 12) +
    S('M82 95V56c0-2 1-3 3-3h4', '#202838', 2) +
    dots([[89.6, 54.4]], '#ffe9b0', 3.2) +
    zombie
  );
}

function barbedWire(x0, x1, y) {
  let d = `M${x0 - 4} ${y}`;
  for (let x = x0; x < x1; x += 5) d += 'a4.4 3.4 0 1 0 8.8 0a4.4 3.4 0 1 0-8.8 0m5 0';
  return S(d, '#b8c2cb', 0.8) + S(`M${x0 - 4} ${y}H${x1}`, L, 1.6, ' stroke-dasharray=".1 4.4"');
}

function barricade(lv) {
  let s = shell('#6b3f32', 'brick', '#3a302b', '#4a2a20', '#43271f');
  s += R(63, 21, 74, 74, K.woodD, 1) + street(lv) + R(69, 27, 62, 68, 'none') + DK('M63 24h74', 1.4, 0.35);
  if (lv === 0) {
    s += `<g transform="rotate(9 140 95)">` + R(140, 34, 24, 61, '#7a5233', 1) + `<path d="M144 40h16v20h-16zM144 66h16v22h-16z" fill="none" stroke="#4f3320" stroke-width="1.2"/>` + C(143.6, 64, 1.3, '#c9a24f', W1) + `</g>`;
    return s + plank(64, 50, 100, 64, 7, '#8a5a33') + bare(36);
  }
  const t = tier(lv);
  // Spare planks leaning on the wall and a lantern above them.
  s += plank(40, 94, 50, 56, 6, '#a0703f', false) + plank(48, 94, 56, 60, 6, '#8a5a33', false);
  if (lv >= 2) s += glow(48, 44, 24) + S('M48 34v3', L, 1.2) + R(44.6, 37, 6.8, 9, '#ffd98a', 2) + S('M44.6 37h6.8M44.6 46h6.8', L, 1.6);
  if (t === 1) {
    if (lv >= 2) s += plank(63, 31, 137, 35, 8, '#a0703f');
    s += plank(63, 42, 137, 49, 9) + plank(63, 63, 137, 54, 9, '#8a5a33') + plank(63, 74, 137, 80, 9, '#a0703f');
    return s + sandbags(lv >= 2 ? [[70, 87, 4], [77, 80, 3]] : [[70, 87, 4]]);
  }
  // Sheet metal over the lower half, a steel plate with a peephole slot.
  s += R(69, 50, 62, 45, '#7d8893') + S('M74 51v43M84 51v43M94 51v43M104 51v43M114 51v43M124 51v43', '#fff', 2, ' stroke-opacity=".16"');
  s += R(80, 31, 40, 15, K.steelD, 1.5) + R(87, 36.6, 26, 3.6, '#07090d', 1.2) + R(87, 33, 10, 3, K.steel, 0.8, W1) + dots([[83, 34], [117, 34], [83, 43], [117, 43]], L, 1.8);
  if (lv >= 4) s += R(69, 50, 62, 26, '#59636e') + HL('M71 52h58', 1, 0.2) + dots([74, 88, 102, 116, 126].flatMap((x) => [[x, 53], [x, 73]]), L, 1.8);
  else s += P('M110 60c4-2 8 0 9 4-3 2-7 2-9-4z', '#a0583a', ' opacity=".7"' + NS) + plank(63, 54, 137, 82, 8) + plank(63, 82, 137, 54, 8, '#8a5a33');
  s += sandbags([[36, 87, 2], [66, 87, 5], [138, 87, 2], [42, 79.6, 1], [73, 79.6, 4], [142, 79.6, 1]]);
  if (lv >= 4) s += barbedWire(70, 132, 75.6);
  if (lv >= 5) {
    // Hazard-striped steel bar and a floodlight on the wall above the door.
    s += R(61, 58, 78, 7, U('hazard', K.hazard), 1) + dots([[66, 61.5], [134, 61.5]], L, 2);
    s += P('M98 94L127 37l11 5-6 52z', U('beam'), NS) + glow(132, 36, 28);
    s += R(141, 22, 9, 4, K.steelD, 0.8) + S('M145 26l-4 6', K.steelD, 2.4) + `<g transform="rotate(-62 134 36)">` + R(127, 31, 14, 10, K.dark, 2) + R(125.6, 32.4, 3, 7.2, '#fff6d6', 1) + `</g>`;
  }
  return s;
}

// --- Generator: basement plant room ----------------------------------------------------------

function generator(lv, { active }) {
  let s = shell('#3a3f47', 'block', '#2a2e33', '#22262b', '#2a2e34');
  s += R(0, 9, 200, 5, K.steelD, ' stroke-width="1.2"') + rects([[30, 7, 4, 9], [90, 7, 4, 9], [150, 7, 4, 9]], K.dark, W1);
  s += E(98, 95, 50, 3.6, '#000', ' opacity=".35"' + NS);
  if (lv === 0) return s + R(116, 14, 6, 12, K.steelD) + S('M116 26l2 2 2-2 2 2', L, 1) + E(92, 98, 16, 2.4, '#000', ' opacity=".4"' + NS) + bare(46);
  const t = tier(lv);
  const on = active ? K.safe : '#4a5058';
  s += bulb(46, 30, active);
  if (active) s += glow(98, 70, 62, 'lamp', ' opacity=".8"');
  // Breaker panel with indicator lights.
  s += R(146, 28, 24, 32, K.steel, 1.5) + DK('M158 30v28', 1, 0.3) + rects([[149, 40, 7, 4], [160, 40, 7, 4], [149, 47, 7, 4], [160, 47, 7, 4]], K.darker, W1) + P('M163 53.4l2.4 4.2h-4.8z', K.hazard, ' stroke-width=".8"');
  if (active) s += glow(157, 34, 12, 'green', ' class="sh-pulse"');
  s += dots([[151, 34], [157, 34], [163, 34]], L, 4.4) + dots(active ? [[151, 34], [157, 34], [163, 34]] : [[151, 34], [157, 34]], on, 2.8) + (active ? '' : dots([[163, 34]], '#7a2f2a', 2.8));
  if (t === 1) {
    // Small open-frame genset.
    s += R(110, 26, 6, 32, K.steelD, ' stroke-width="1.4"') + P('M104 7h18l-3 14h-12z', '#4a515b') + R(108, 50, 14, 9, K.darker, 1.5);
    s += R(72, 64, 26, 26, K.dark, 2) + DK('M75 70h20M75 75h20M75 80h20M75 85h20', 1.2, 0.35);
    s += R(98, 66, 22, 24, '#4a515b', 3) + rects([[102, 70, 7, 5], [111, 70, 6, 5]], K.darker, W1) + C(106, 82, 2, active ? K.safe : '#7a2f2a', W1);
    s += R(70, 50, 34, 12, '#d0452f', 5) + C(80, 50.4, 2, K.darker, W1) + HL('M74 54h24', 1.2, 0.4);
    s += OS('M68 93V60c0-2.4 1.2-3.6 3.6-3.6h50.8c2.4 0 3.6 1.2 3.6 3.6v33M66 93h62', K.hazard, 3);
  } else {
    // Enclosed diesel genset on a skid.
    s += R(118, 24, 7, 22, K.steelD, ' stroke-width="1.4"') + R(116.6, 22, 9.8, 3.4, K.dark, 1, ' stroke-width="1.2"') + P('M110 7h22l-4 13h-14z', '#4a515b');
    s += R(52, 89, 92, 5, K.steelD, 1) + R(56, 44, 84, 46, K.olive, 3) + DK('M98 46v42M76 54h18M76 58h18M76 62h18M76 66h18', 1.3, 0.3);
    s += R(58, 50, 12, 34, K.dark, 1) + DK('M60 56h8M60 62h8M60 68h8M60 74h8', 1.2, 0.4);
    s += R(104, 52, 28, 20, K.darker, 1.5) + C(111, 59, 3.6, '#e9edf1', ' stroke-width="1.1"') + S('M111 59l2-2', L, 1) + R(118, 55, 10, 4, active ? '#ffcf7a' : '#4a4430', 0.6, W1);
    s += dots([[121, 66], [126, 66]], L, 4) + dots([[121, 66]], on, 2.6) + dots([[126, 66]], active ? K.hazard : '#4a5058', 2.6);
    s += P('M112 76l3.6 6.4h-7.2z', K.hazard, ' stroke-width=".9"') + HL('M58 46h80', 1.2, 0.25);
    // Battery bank.
    const ys = t === 3 ? [80, 62] : [80];
    const bx = [142, 154, 166];
    if (t === 3) s += R(140, 76, 40, 3, K.steelD);
    s += rects(ys.flatMap((y) => bx.map((x) => [x, y, 10.4, 14])), K.darker) + rects(bx.map((x) => [x + 1.4, 84, 7.6, 2.4]), K.hazard, NS) + rects(bx.map((x) => [x + 1.6, 78, 2.4, 2.4]), K.med, ' stroke-width=".8"');
    if (t === 3) {
      s += R(16, 7, 6, 46, K.steelD, ' stroke-width="1.4"') + R(4, 52, 44, 38, '#4f5d33', 3) + R(2, 89, 48, 5, K.steelD, 1) + R(32, 58, 12, 10, K.darker, 1) + dots([[38, 63]], on, 3);
    }
  }
  // Cable to the panel, fuel cans in front.
  s += S(t === 1 ? 'M120 76c10 18 30 14 38-16' : 'M140 70c10 12 16 6 18-10', '#1b1e22', 2.6);
  s += t === 3 ? jerry(30) + jerry(43) : jerry(34) + (lv >= 2 ? jerry(48) : '');
  if (!active) return s + shade(0.28);
  const top = t === 1 ? 26 : 22;
  const px = t === 1 ? 113 : 121.5;
  s += `<g fill="#c9ced4"${NS}>` + C(px - 6, top + 4, 3.8, '#c9ced4', ' class="sh-puff" opacity=".75"') + C(px + 7, top + 1, 4.8, '#c9ced4', ' class="sh-puff" opacity=".6"') + C(px, top - 2, 3.4, '#c9ced4', ' class="sh-puff" opacity=".5"') + `</g>`;
  return s + S(t === 1 ? 'M64 70c-3 3-3 9 0 12M60 68c-4 4-4 12 0 16' : 'M52 58c-3 3-3 9 0 12M48 56c-4 4-4 12 0 16', '#e9edf1', 1, ' stroke-opacity=".45"');
}

// --- Barracks: dormitory -------------------------------------------------------------------------

const BUNK_X = [36, 90, 144];
const BLANKETS = ['#4a78c8', '#6f8f43', '#b5523b', '#8a6bb8', '#c9a23f'];

function bed(x, y, blanket, quilt) {
  return (
    R(x + 3, y, 41, 5, '#d8d2c2', 1.5) +
    P(`M${x + 15} ${y - 1.6}c8-1.6 20-1.6 29.2 0V${y + 5}H${x + 15}z`, blanket) +
    (quilt ? DK(`M${x + 24} ${y - 2.4}v7.4M${x + 33} ${y - 2.4}v7.4`, 1.2, 0.22) : '') +
    R(x + 4.5, y - 4.6, 11, 6, '#f4efe2', 3) +
    R(x + 1, y + 5, 45, 3, K.woodD, 0.6)
  );
}

function barracks(lv) {
  let s = shell('#5a4434', 'plank', '#3e2c21', '#2e2018', '#3a2a20');
  if (lv === 0) {
    s += T(76, 86, R(0, 0, 48, 9, '#56703a', 4) + DK('M12 1v7M24 1v7M36 1v7', 1, 0.3) + R(-4, 0.6, 12, 8, '#8a5a3c', 4));
    return s + bare(100);
  }
  const t = tier(lv);
  s += glow(100, 34, 90, 'lamp', ' opacity=".55"');
  if (lv >= 3) s += R(4, 36, 13.5, 58, '#5d6b5a', 1) + R(18.5, 36, 13.5, 58, '#55634f', 1) + DK('M7 41h7M7 43.4h7M7 45.8h7M21.5 41h7M21.5 43.4h7M21.5 45.8h7', 1, 0.45) + rects([[13.6, 62, 2, 6], [28.1, 62, 2, 6]], K.steelL, ' stroke-width=".8"');
  if (lv >= 4) {
    // Cork board of photos.
    s += R(150, 30, 36, 24, '#a07a50', 1.5) + rects([[153, 33, 10, 8], [156, 43, 12, 8]], '#e9edf1', W1) + rects([[165, 34, 9, 11]], '#9fc4e8', W1) + rects([[176, 32, 8, 9]], K.hazard, W1) + dots([[158, 33], [169.5, 34], [180, 32], [162, 43]], K.med, 1.8);
  } else s += R(156, 34, 18, 18, '#e9e4d6', 0.5, W1) + R(156, 34, 18, 4, K.med, NS) + DK('M159 42l3 3m0-3l-3 3M165 42l3 3m0-3l-3 3M159 48h12', 1, 0.5);
  if (lv >= 5) s += R(146, 58, 44, 3, K.woodD) + R(150, 50, 10, 8, '#4a515b', 1) + C(155, 54, 2, K.steelL, ' stroke-width=".8"') + rects([[164, 52, 4, 6]], K.med, W1) + rects([[168.4, 51, 4, 7]], '#3f74c4', W1) + P('M178 58v-4h8v4zM180 54c-1-5 2-7 4-8-1 3 1 5 0 8z', '#6f8f43', W1);
  // Beds: the lower row fills first, then the upper bunks over beds 1 and 2.
  for (let i = 0; i < 3; i++) {
    const x = BUNK_X[i];
    if (lv <= i) {
      if (i === 2) s += crate(150, 80, 18, 14) + glow(159, 74, 22) + R(156, 70, 6, 9, '#ffd98a', 1.5) + S('M156 70h6', L, 1.6);
      continue;
    }
    const upper = lv > i + 3;
    s += bed(x, 84, BLANKETS[i], t === 3);
    if (upper) s += bed(x, 48, BLANKETS[i + 3], t === 3) + S(`M${x + 2} 42h42`, K.woodD, 2.2);
    s += rects([[x, upper ? 34 : 73, 3.6, upper ? 61 : 22], [x + 43, upper ? 34 : 79, 3.6, upper ? 61 : 16]], K.wood);
    if (t >= 2) s += P(`M${x + 20} 94.5v-3h5l2 3zM${x + 27} 94.5v-3h5l2 3z`, '#3a2a20', W1);
  }
  if (lv >= 2) {
    // A string of fairy lights sagging between four hooks.
    const cols = ['#ffcf7a', '#ff6b5e', '#7fd3ff', '#9be27a'];
    const by = [[], [], [], []];
    for (let seg = 0; seg < 4; seg++) {
      for (const [k, tt] of [0.2, 0.5, 0.8].entries()) by[(seg + k) % 4].push([seg * 50 + tt * 50, 26.8 + 20 * tt * (1 - tt)]);
    }
    s += S('M0 25Q25 35 50 25Q75 35 100 25Q125 35 150 25Q175 35 200 25', L, 0.9) + dots(by.flat(), L, 4.4);
    s += dots(by.flat(), '#ffcf7a', 7, ' stroke-opacity=".22"') + `<g class="sh-twinkle">` + by.map((pts, i) => dots(pts, cols[i], 2.8)).join('') + `</g>`;
  }
  return s;
}

// --- Workshop ----------------------------------------------------------------------------------

function workshop(lv, { active }) {
  let s = shell('#474a41', 'block', '#2f312c', '#262823', '#2c2f2a');
  if (lv === 0) return s + bare(100);
  const t = tier(lv);
  // Pegboard with tools.
  s += R(40, 26, 78, 34, '#9a7650', 1.5) + R(41, 27, 76, 32, U('peg'), NS);
  s += P('M48 30h6l-1.2 4.4V52a1.8 1.8 0 0 1-3.6 0V34.4z', K.steelL) + C(51, 30.8, 2.6, '#9a7650', W1);
  s += R(61.4, 34, 3.2, 20, K.woodL, 1) + P('M57 30h9.6l3 3.4-3 1.6H57z', K.steel);
  s += P('M74 33h20l-3 10H74z', K.steelL) + DK('M76 43l1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4 1-1.4 1 1.4', 0.8, 0.5) + R(94, 32, 7, 12, '#c0392b', 2);
  if (t >= 2) s += rects([[104, 31, 3, 14]], K.med) + rects([[110, 31, 3, 14]], '#3f74c4') + S('M105.5 45v6M111.5 45v6', K.steelL, 1.6) + P('M80 47h3v9l-1.5 2-1.5-2zM86 47h3v9l-1.5 2-1.5-2z', K.steel, ' stroke-width="1.1"');
  if (t === 3) s += P('M122 30h14v10c0 4-3 6-7 6s-7-2-7-6z', K.darker) + R(124.6, 34, 8.8, 3.4, K.safe, 0.8, W1);
  // Shelves of parts.
  if (t >= 2) s += rects([[156, 28, 3, 66], [156, 50, 44, 3], [156, 72, 44, 3]], K.wood) + rects([[162, 40, 12, 10]], '#3f74c4') + rects([[176, 42, 10, 8]], K.med) + rects([[188, 39, 12, 11]], K.hazard) + rects([[162, 62, 14, 10]], K.olive) + C(184, 66, 5, K.steel) + C(184, 66, 2, K.dark, NS);
  // Welding bottles.
  if (t === 3) s += R(8, 46, 9, 48, K.med, 4) + R(19, 50, 9, 44, '#5b7f9e', 4) + rects([[10, 41, 5, 6], [21, 45, 5, 6]], K.dark) + S('M12.5 41c0-6 8-10 16-4M23.5 45c4-4 10-4 12 2', L, 1.4);
  // Workbench: legs, shelf, toolbox, top.
  s += rects([[32, 71, 5, 23], [146, 71, 5, 23], [34, 84, 115, 3]], K.woodD) + R(40, 76, 20, 8, '#c0392b', 1.4) + S('M46 76v-1.6h8V76', L, 1.4) + S('M66 83.4h28M68 80.6h22', K.steelD, 2.4);
  s += R(28, 64, 126, 7, K.woodL, 1) + HL('M30 65.6h122', 1, 0.3);
  // Vice, pipes and tape.
  s += rects([[30, 57, 16, 7], [29, 50, 6, 9], [41, 50, 6, 9]], '#4a6a8a') + S('M47 54h6', K.steelL, 1.6);
  s += R(54, 59, 20, 4.6, K.steel, 2) + R(58, 54.6, 14, 4.4, K.steelD, 2) + C(82, 59.8, 4.2, '#c9cfd4') + C(82, 59.8, 1.8, '#474a41', NS);
  // Drill press.
  if (t >= 2) s += R(102, 61.6, 12, 2.6, K.steelD, 0.6) + R(106.6, 34, 3, 27, K.steel) + R(100, 30, 16, 10, K.med, 2) + R(106.6, 40, 3, 7, K.dark) + P('M107 47h2l-1 3z', K.steelL, W1) + S('M116 37l6 3', K.steelL, 1.6);
  // Desk lamp.
  s += R(136, 61, 12, 3, K.dark, 1) + S('M142 61l-6-20-14 4', K.dark, 2.2) + `<g transform="rotate(-24 122 46)">` + P('M114 44h10l3 6h-16z', '#d07a2e') + E(119, 50, 8, 1.6, active ? '#fff1c4' : K.dark, W1) + `</g>`;
  if (!active) return s + shade(0.12);
  // Lamp on, a pipe bomb on the bench and sparks.
  s += P('M110 53L86 64h44z', U('beam'), NS) + glow(118, 52, 30, 'lamp', ' class="sh-flicker"');
  s += T(88, 56, R(0, 0, 14, 6, K.steel, 1.5) + R(5, -0.4, 4, 6.8, '#c9cfd4', 0.4, W1) + C(7, -2, 1.4, '#ff4b3a', ' stroke-width=".8"'));
  return s + `<g class="sh-spark">` + P('M98 52l1.2 2.4 2.6.2-2 1.6.8 2.6-2.4-1.4-2.4 1.4.8-2.6-2-1.6 2.6-.2z', '#ffe08a', ' stroke-width=".7"') + dots([[104, 50], [95, 49], [102, 57]], '#ffcf7a', 1.7) + `</g>`;
}

// --- Infirmary ---------------------------------------------------------------------------------

function cot(x, w, blanket = '#9cc0d8') {
  return (
    S(`M${x + 4} 77v15M${x + w - 4} 77v15`, K.steelL, 2) +
    dots([[x + 4, 92.6], [x + w - 4, 92.6]], L, 4.4) +
    R(x, 76, w, 3, K.steelL, 1) +
    R(x + 2, 70, w - 4, 6, '#e9edf1', 2) +
    P(`M${x + 2} 72l5-13h9l-3 13z`, '#dfe5e8') +
    `<ellipse cx="${x + 10}" cy="62" rx="5.4" ry="3.2" fill="#f7f4ec" transform="rotate(-62 ${x + 10} 62)"/>` +
    P(`M${x + 20} 69c${n1((w - 22) * 0.4)}-2 ${n1((w - 22) * 0.8)}-2 ${w - 22} 0v7H${x + 20}z`, blanket) +
    HL(`M${x + 23} 70.6h${w - 30}`, 1, 0.35)
  );
}

function infirmary(lv, { active }) {
  let s = shell('#5b7672', 'tile', '#37433f', '#2c3633', '#3e504c');
  s += R(0, 68, 200, 24, '#4c6662', NS) + DK('M0 68h200', 1.4, 0.25);
  if (lv === 0) return s + S('M6 24h50', K.steelL, 1.6) + bare(90);
  const t = tier(lv);
  const two = t === 3;
  // Privacy curtain.
  s += S(two ? 'M0 24h24' : 'M4 24h40', K.steelL, 1.6);
  s += P(two ? 'M0 25h20c-1 20 1 44 0 67H0z' : 'M6 25h30c-2 20 2 44 0 67H6z', '#8fb3a0') + DK(two ? 'M6 26c1 20-1 44 0 64M13 26c-1 20 1 44 0 64' : 'M14 26c1 20-1 44 0 64M22 26c-1 20 1 44 0 64M30 26c1 20-1 44 0 64', 1.2, 0.18);
  // Cabinet with a red cross, tray cart below.
  const cx = two ? 150 : 140;
  s += R(cx, 28, 30, 28, '#e3e7ea', 2) + DK(`M${cx + 15} 30v24`, 1, 0.3) + P(`M${cx + 12.4} 33h5.2v4.4H${cx + 22}v5.2h-4.4V47h-5.2v-4.4H${cx + 8}v-5.2h4.4z`, K.med, W1);
  s += S(`M${cx + 2} 70v22M${cx + 30} 70v22M${cx + 2} 84h28`, K.steelL, 1.8) + R(cx - 1, 68, 34, 3, K.steelL, 1) + dots([[cx + 2, 92.6], [cx + 30, 92.6]], L, 4);
  if (active) {
    // A first-aid kit open on the tray, the lid standing behind it.
    s += P(`M${cx + 7} 62l2-9h17l-1 9z`, '#e9e4d6') + P(`M${cx + 9} 53h17l-1 2.4H${cx + 8.5}z`, '#c8443e', W1) + R(cx + 11, 57, 6, 5, '#f4efe2', 1, W1) + R(cx + 18, 56, 4.4, 6, '#e8913a', 0.8, W1);
    s += R(cx + 6, 61, 20, 7, K.med, 1.5) + P(`M${cx + 14.6} 62.4h2.8v1.6H${cx + 19}v2.6h-1.6v1.2h-2.8v-1.2H${cx + 13}V64h1.6z`, '#f4efe2', ' stroke-width=".8"');
  } else s += R(cx + 6, 64, 20, 4, '#cfe0ee', 1.5, ' stroke-width="1.2"');
  // Cots, IV stand.
  const iv = two ? 86 : 124;
  s += two ? cot(26, 52) + cot(94, 52, '#b6a0d0') : cot(44, 70);
  s += S(`M${iv} 30v61M${iv - 6} 93l6-3 6 3M${iv - 4} 30h8`, K.steelL, 1.8);
  s += R(iv + 1, 32, 9, 13, '#cfe8f0', 2.5) + R(iv + 1.8, 38, 7.4, 6, '#9fd2e6', 1.5, NS) + S(two ? 'M91.5 45c0 8 2 14 6 20' : 'M129.5 45c0 10-6 16-15 25', '#cfe8f0', 1.1);
  if (t >= 2) s += S('M44 30v6h14', K.steelD, 2) + R(52, 30, 24, 16, K.darker, 2) + S('M55 39h5l2-4 3 8 2-4h6', K.safe, 1.2);
  if (lv >= 4) {
    const dx = two ? 120 : 98;
    s += R(dx, 32, 16, 14, K.hazard, 2) + P(`M${dx + 5} 38c0-1.6 2.6-1.8 3-.4.4-1.4 3-1.2 3 .4 0 1.6-3 3.4-3 3.4s-3-1.8-3-3.4z`, K.med, ' stroke-width=".8"') + rects([[dx + 2, 46, 4, 6], [dx + 10, 46, 4, 6]], K.dark, W1);
  }
  for (const x of two ? [52, 120] : [84]) s += shadeLamp(x, 20, active, two ? 48 : 70, '#d5dbe0');
  return active ? s : s + shade(0.12);
}

// --- Armory ------------------------------------------------------------------------------------

// Guns in local coordinates (origin = left end, y 0 = top line). A missing gun
// is its dark painted silhouette on the board, like a tool shadow board.
function gun(kind, ghost) {
  const f = (c) => (ghost ? '#3b2717' : c);
  let s = '';
  let d = '';
  if (kind === 'smg') {
    s += (ghost ? R(1, 2.4, 9, 8, f()) : OS('M9 3H1.5v7H9', K.steel, 1.8)) + R(8, 0, 23, 9, f(K.steelD), 1.5) + R(11, -2.4, 13, 2.6, f(K.dark), 0.6) + R(31, 2, 9, 5, f(K.dark), 1) + P('M19 9h5.5l.6 8h-5.5zM10.5 9H16l-1.4 8H9z', f(K.dark));
    d = HL('M10 2.4h18', 1);
  } else if (kind === 'shotgun') {
    s += P('M0 3.5L17 1v8.6l-4.4 1L0 15z', f(K.wood)) + R(17, 0, 10, 8.6, f(K.steelD), 1) + R(27, 0.6, 35, 3, f('#6f7b87'), 1) + R(27, 3.6, 30, 2.8, f(K.dark), 1) + R(32, 2, 13, 6, f(K.woodL), 2);
    d = DK('M36 3.6v3M39.4 3.6v3', 1, 0.4) + S('M19.5 8.6c0 3.2 2.2 4.2 5 4.2', L, 1.3) + HL('M2 4.4l13-2', 1);
  } else if (kind === 'rifle') {
    s += (ghost ? R(15, -3.4, 12, 3.4, f()) : OS('M15 0v-3.4h12V0', K.steelD, 1.2)) + P('M0 1h12v9H6.6L0 13.4z', f(K.dark)) + R(12, 0, 19, 9, f(K.steelD), 1) + R(31, 1, 14, 7, f(K.dark), 2) + R(45, 3, 9.5, 2.6, f('#6f7b87'), 0.8) + R(54, 2.2, 4.4, 4.2, f(K.dark), 0.8);
    s += P('M20.5 9h6c.3 3 1.2 5.4 2.6 7.2l-4.4 2.2c-1.8-2.6-3.2-5.8-4.2-9.4z', f(K.darker)) + P('M14 9h5.4l-2 8h-4.8z', f(K.dark));
    d = S('M43.5 1v-4.6', L, 1.8) + HL('M13.6 2.4h15', 1);
  } else {
    s += P('M0 4L15 2.4h27v6.4H20.4l-4.6 3-4 5.6L0 18z', f(K.wood)) + R(40, 2.6, 24, 2.8, f(K.steelD), 0.8) + R(18, 1.2, 12, 4.4, f(K.steelD), 1);
    s += P('M15-5.6h4.6l2.2-1.6h11l2.2 1.6H40v5h-4.8l-2.2 1.4H22L19.6-.6H15z', f(K.darker));
    d = rects([[21, -0.8, 2.4, 2.2], [31, -0.8, 2.4, 2.2]], L, NS) + C(26, 8.6, 1.8, K.steel, W1) + S('M23-5h9', '#8fd3ff', 1) + HL('M2 6l12-1.6', 1);
  }
  return ghost ? `<g stroke="none">${s}</g>` : s + d;
}

// [x, y, length] of each gun on the rack, in reading order: smg, shotgun / rifle, hunting.
const GUN_SPOTS = {
  smg: [44, 31, 40],
  shotgun: [105, 32, 62],
  rifle: [35, 55, 58],
  hunting: [104, 56, 64],
};

function armory(lv, { weapons }) {
  let s = shell('#3f4639', 'block', '#2b2e27', '#22251f', '#30362b');
  s += R(0, 70, 200, 22, '#36402f', NS) + DK('M0 70h200', 1.4, 0.25);
  if (lv === 0) return s + bare(100);
  const t = tier(lv);
  s += glow(100, 46, 80, 'lamp', ' opacity=".5"');
  if (t >= 2) s += R(178, 30, 20, 62, '#5f6b5a', 1) + DK('M181 34h14M181 37h14M181 40h14', 1, 0.45) + S('M194 58v7', K.steelL, 1.6);
  if (t === 3) s += C(14, 44, 11, '#efe9d8') + C(14, 44, 7, K.med, ' stroke-width="1.2"') + C(14, 44, 3, '#efe9d8', ' stroke-width="1.2"');
  // The rack: a wooden board with two hooks under every gun.
  s += R(26, 22, 148, 60, '#5e4029', 2);
  const have = new Set(weapons);
  const hooks = [];
  for (const [kind, [x, y, len]] of Object.entries(GUN_SPOTS)) {
    s += T(x, y, gun(kind, !have.has(kind)));
    const hy = y + (kind === 'smg' ? 9.6 : 9.2);
    hooks.push([x + len * 0.3, hy], [x + len * 0.72, hy]);
  }
  s += rects(hooks.map(([x, y]) => [x - 1.4, y, 2.8, 3.6]), K.steelL, ' stroke-width=".9"');
  // Workbench with ammo.
  s += rects([[30, 86, 5, 8], [165, 86, 5, 8]], K.woodD) + R(26, 82, 148, 5, K.woodL, 1);
  s += ammoCan(30, 73, 18, 9) + (lv >= 2 ? ammoCan(152, 73, 18, 9) : '');
  if (t === 3) {
    // A vice holding a receiver being fitted with a scope.
    s += rects([[80, 76, 10, 6], [78, 71, 4, 6], [88, 71, 4, 6]], '#4a6a8a') + R(70, 70.6, 20, 4.4, K.steelD, 1) + R(90, 71.6, 8, 2, '#6f7b87', 0.6) + R(74, 67.4, 9, 3.2, K.darker, 1);
    s += `<g class="sh-spark">` + dots([[97, 67], [100, 64.6], [94.6, 64]], '#ffe08a', 1.8) + `</g>`;
  }
  return s;
}

// --- Radio room --------------------------------------------------------------------------------

function radio(lv, { alert }) {
  let s = shell('#2b3c5a', 'stripe', '#3a2c22', '#22314a', '#22314a');
  s += P('M150 7h50v26z', '#1d2a40', NS) + S('M146 7l54 28', '#5a3d27', 4);
  // Window to the night; a lattice mast out there at level 5.
  s +=
    R(146, 30, 38, 36, '#5a3d27', 1.5) +
    R(149, 33, 32, 30, U('sky', '#16203a'), NS) +
    dots([[154, 37], [170, 36], [176, 44], [158, 46]], '#dfe6ff', 1.3) +
    P('M149 63v-8h6v-4h7v6h5v-9h8v6h6v9z', '#0c111d', NS) +
    (lv >= 5 ? S('M163 63l5-25 5 25M164 59l8-6-6-4 5-4', '#4b5d80', 1.1) + C(168, 37, 1.7, '#ff4b3a', ' class="sh-blink"' + NS) : '') +
    S('M165 33v30M149 48h32', '#5a3d27', 2.2) +
    R(144, 64, 42, 3.6, '#6e4526', 1);
  if (lv === 0) return s + bare(100);
  const t = tier(lv);
  // Map on the wall with pins and red string.
  s += `<g transform="rotate(-2 52 46)">` + R(24, 28, 54, 36, '#d9cba0', 1) + S('M38 28v36M24 44h54', '#c4b385', 1.4) + S('M24 58c10-4 16 2 26-4s16-2 28-8', '#6fa8d8', 2.2, ' stroke-opacity=".8"');
  s += S(t >= 2 ? 'M34 36L50 46l12-10 8 18M50 46l-14 12' : 'M34 36L50 46l12-10 8 18', K.med, 0.9) + dots([[34, 36], [50, 46], [62, 36], [70, 54]], L, 4.4) + dots([[34, 36], [50, 46], [62, 36], [70, 54]], K.med, 2.6);
  if (t >= 2) s += dots([[36, 58]], L, 4.4) + dots([[36, 58]], K.hazard, 2.6) + R(62, 22, 12, 9, '#f2e08a', 0.4, W1);
  s += `</g>`;
  // Antenna cable up to the roof.
  s += S('M114 48c4-6 6-12 6-20V0', '#1b1e22', 2);
  // Desk.
  s += R(42, 76, 26, 18, K.woodD, 1) + DK('M45 85h20', 1, 0.35) + rects([[51, 80, 8, 2], [51, 88.6, 8, 2]], K.steelL, ' stroke-width=".8"') + R(138, 76, 5, 18, K.woodD);
  s += R(38, 70, 110, 6, K.wood, 1) + HL('M40 71.6h106', 1, 0.3);
  // Radio set (a scanner stacked on top from level 3).
  if (t >= 2) s += R(74, 38, 40, 11, '#4a515b', 1.5) + R(78, 41, 18, 5, alert ? '#ff8a6a' : '#7fd3a0', 0.6, W1) + C(105, 43.5, 2.6, K.steelL, W1);
  s += R(70, 48, 48, 22, K.olive, 2) + R(76, 52, 22, 6, '#ffcf7a', 0.8, ' stroke-width="1.1"') + S('M80 55h2m3 0h4m3 0h2', '#7a5a1a', 1.1) + DK('M76 62.6h20M76 66h20', 1.2, 0.4);
  s += C(106, 61, 4.4, K.steelL) + S('M106 61l2.4-2.4', L, 1.2) + C(106, 53, 2, K.steelL, W1) + C(113, 66, 1.6, K.steelL, W1);
  s += alert ? glow(113, 53, 10, 'red', ' class="sh-blink"') + C(113, 53, 2.2, '#ff4b3a', ' class="sh-blink"' + W1) : C(113, 53, 2.2, '#5a2a26', W1);
  // Desk mic.
  s += E(128, 70, 6, 1.6, K.dark, ' stroke-width="1.2"') + S('M128 69v-8l3-4', K.dark, 1.8) + `<g transform="rotate(30 132 54)">${R(129, 50, 6, 9, K.darker, 3)}</g>` + S('M122 70c-4 0-4-6-4-8', '#1b1e22', 1.2);
  if (t >= 2) s += R(40, 52, 24, 18, '#4a515b', 2) + R(43, 55, 18, 12, '#0f1d17', 1) + S('M44 61c2-4 3 4 5 0s3 4 5 0 3 4 5 0', K.safe, 1.1) + glow(52, 61, 14, 'green', ' opacity=".6"');
  else s += glow(50, 60, 26) + S('M46 70l4-12 6-2', K.dark, 2) + P('M52 52l8 2-1 6-9-3z', '#d07a2e') + S('M58 70c0-8 10-8 10 0', K.darker, 1.8);
  if (t === 3) s += R(122, 48, 16, 22, K.darker, 2) + C(130, 56, 4.4, '#4a515b', ' stroke-width="1.2"') + C(130, 56, 1.6, K.dark, NS) + C(130, 65.4, 2, '#4a515b', W1);
  if (lv >= 2) s += R(90, 74, 22, 12, K.dark, 3) + R(88, 84, 26, 3.6, K.darker, 1.5) + S('M101 87.6v5M94 94h14', '#1b1e22', 2);
  if (!alert) return s;
  const y = t >= 2 ? 30 : 38;
  return s + `<g class="sh-wave" fill="none" stroke="#ff6b5e" stroke-width="1.6">` + dots([[94, y]], '#ff6b5e', 3.2) + `<path d="M89.4 ${y - 4.6}a6.5 6.5 0 0 0 0 9.2M98.6 ${y - 4.6}a6.5 6.5 0 0 1 0 9.2M85.6 ${y - 8.4}a12 12 0 0 0 0 16.8M102.4 ${y - 8.4}a12 12 0 0 1 0 16.8"/></g>`;
}

// --- Scrap Yard: the fenced lot out back -------------------------------------------------------

const JUNK = [
  // [u: across the heap, v: up the slope, kind, shown from this fill]
  [-0.3, 0.3, 'sheet', 0],
  [0.22, 0.35, 'rim', 0],
  [0.02, 0.55, 'barrel', 0.2],
  [-0.14, 0.75, 'pipe', 0.3],
  [0.3, 0.6, 'rust', 0.45],
  [-0.38, 0.5, 'tyre', 0.55],
  [0.1, 0.88, 'door', 0.65],
  [-0.05, 0.25, 'spring', 0.8],
];

function junk(kind, x, y, k) {
  const g = (inner, rot = 0) => `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${rot}) scale(${n1(k)})">${inner}</g>`;
  switch (kind) {
    case 'sheet':
      return g(P('M-9-3l16-3 3 7-16 3z', K.steelL), -8);
    case 'rim':
      return g(C(0, 0, 6, K.steelD) + C(0, 0, 2.4, K.dark) + DK('M0-6v12M-6 0h12', 1, 0.4));
    case 'barrel':
      return g(R(-6, -8, 12, 15, '#a0583a', 2) + DK('M-6-3h12M-6 2h12', 1.2, 0.35), 14);
    case 'pipe':
      return g(R(-12, -2.4, 24, 4.8, K.steel, 2) + E(12, 0, 1.4, 2.4, K.darker, W1), -18);
    case 'rust':
      return g(P('M-8-4l14-2 2 8-14 3z', '#b0663a'), 10);
    case 'tyre':
      return g(tyre(0, 0, 6.4));
    case 'door':
      return g(R(-7, -6, 14, 11, '#4a6f8f', 1) + R(-5, -4, 5, 4, '#9fc4e8', 0.5, W1), -6);
    default:
      return g(S('M-6 0l2-3 2 3 2-3 2 3 2-3 2 3', K.steelL, 1.2), 20);
  }
}

function heap(fill) {
  const cx = 104;
  const w = 34 + 66 * fill;
  const h = 3 + 46 * fill;
  const xs = [-0.5, -0.36, -0.2, -0.05, 0.1, 0.26, 0.4, 0.5];
  const ys = [0, 0.4, 0.74, 0.97, 1, 0.78, 0.42, 0];
  const pts = xs.map((u, i) => `${n1(cx + u * w)} ${n1(94 - ys[i] * h)}`);
  let s = fill > 0.02 ? P(`M${pts.join('L')}z`, '#5a5f66') : '';
  for (const [u, v, kind, min] of JUNK) {
    if (fill < min) continue;
    const top = 94 - (1 - 4 * u * u) * h;
    s += fill < 0.05 ? junk(kind, cx + u * w * 1.3, 92, 0.6) : junk(kind, cx + u * w * 0.9, 94 - (94 - top) * v, 0.7 + 0.3 * fill);
  }
  return s;
}

function scrapyard(lv, { active, fill }) {
  let s = `<g stroke="none">` + R(0, 0, 200, 120, U('sky', '#121a2b'));
  s += dots([[14, 28], [72, 31], [128, 29], [58, 40], [96, 25], [150, 22]], '#dfe6ff', 1.5, ' stroke-opacity=".75"');
  s += C(172, 34, 6, '#e9e4d0') + C(175, 32, 5.2, '#16203a');
  s += P('M0 82V58h10v-8h14v12h8V46h16v20h10v-8h14v24h12V54h12v10h16v-6h14v16h10V48h12v14h14v-8h12v28z', '#0c111d');
  s += R(0, 82, 200, 38, '#2a2620') + P('M0 100c40-6 80-4 120-8s60 0 80-4v32H0z', '#25211c') + `</g>`;
  // Chain-link fence (broken before the yard is built).
  const broken = lv === 0;
  s += R(0, 44, 200, 38, U('mesh'), broken ? ' opacity=".55"' + NS : NS) + S(broken ? 'M0 44h90M120 46l80-2' : 'M0 44h200', K.steel, 1.4);
  s += rects([8, 56, 152, 196].map((x) => [x - 1.5, 41, 3, 43]), K.steelD) + (broken ? `<g transform="rotate(14 104 84)">${R(102.5, 42, 3, 42, K.steelD)}</g>` : R(102.5, 41, 3, 43, K.steelD));
  if (lv >= 2) s += S('M0 39.6h200', '#a9b4be', 0.8) + S('M2 39.6h200', '#a9b4be', 3.2, ' stroke-dasharray=".4 7.6" stroke-linecap="butt"');
  // A wrecked car on blocks, tyres lying in front of it.
  s += T(4, 0, P('M2 84V70l8-2 10-10h30l10 10 6 2v14z', '#7a4a32') + P('M22 60h12v8H14zM38 60h10l8 8H38zM9 84a6 6 0 0 1 12 0zM47 84a6 6 0 0 1 12 0z', '#141820') + DK('M36 70v12M24 62l6 5', 1.2, 0.35) + rects([[11, 84, 8, 4], [49, 84, 8, 4]], '#4a515b') + P('M44 72c3-1 6 1 7 4-3 1-6 0-7-4z', '#a0583a', NS));
  s += E(68, 91, 9, 3.4, '#24272c') + E(68, 86.4, 9, 3.4, '#2b2f36') + E(68, 86.4, 3.6, 1.2, K.steelD, W1);
  if (lv === 0) return s + heap(0) + P('M140 94l2-7 2 7M146 94l1-5 2 5M86 94l2-6 2 6', '#4f6a34', W1) + shade(0.2);
  const t = tier(lv);
  // Work lamp on a pole, behind the heap.
  s += R(80, 30, 3, 64, K.steelD, 0.5) + `<g transform="rotate(28 86 30)">${R(78, 25, 16, 9, K.dark, 2)}${R(92.4, 26.4, 2.6, 6.4, active ? '#fff6d6' : '#59606a', 1)}</g>`;
  if (active) s += P('M90 36L150 94H96z', U('beam'), NS) + glow(92, 34, 28, 'lamp', ' class="sh-flicker"');
  if (t >= 2) {
    // A small yard crane with an electromagnet.
    s += R(184, 26, 6, 68, K.hazard) + R(134, 26, 56, 6, K.hazard) + S('M184 36l6 8M184 52l6 8M184 68l6 8M140 26l8 6 8-6 8 6 8-6 8 6', L, 1) + R(180, 90, 14, 4, K.steelD);
    s += S('M138 32v14', '#1b1e22', 1.2) + E(138, 50, 10, 4.2, K.dark) + R(128, 50, 20, 3, U('hazard', K.hazard), W1);
  }
  if (t === 3) s += `<g transform="rotate(-20 150 92)">` + R(150, 84, 50, 6, K.darker, 3) + dots([[153, 87], [197, 87]], K.steelD, 3) + R(160, 80, 6, 4, K.steelL, ' stroke-width=".8"') + R(176, 80.6, 7, 3.4, '#b0663a', ' stroke-width=".8"') + `</g>` + S('M160 88v6M186 78v16', K.steelD, 2);
  s += heap(fill);
  // Hand cart.
  s += T(t === 3 ? 18 : 140, 0, P('M0 74h26l-4 11H4z', '#3f74c4') + S('M24 76l12-4', K.dark, 2.2) + S('M8 85l-2 9M20 85l2 9', K.dark, 1.6) + tyre(14, 89, 5) + DK('M3 77h21', 1, 0.3) + P('M6 74l3-4 4 2 4-3 3 5z', K.steel, ' stroke-width="1.1"'));
  return s;
}

// --- Boarded (locked) room ---------------------------------------------------------------------

export function boardedArt() {
  let s = shell('#2a2e34', 'block', '#1e2125', '#17191c', '#202328');
  s += R(58, 20, 84, 75, '#34393f', 1.5) + R(64, 26, 72, 69, '#0a0c0f');
  s += dots([[72, 40], [124, 34], [90, 70], [116, 82], [80, 58], [132, 62]], '#e9e4d6', 1.4, ' stroke-opacity=".25"');
  s += web(64, 26);
  s += plank(58, 34, 142, 56, 10, '#8a5a33') + plank(58, 62, 142, 40, 10, '#a0703f') + plank(58, 70, 142, 86, 9, '#7a5233') + plank(58, 88, 142, 70, 9, '#966638');
  s += P('M64 95c6-5 14-6 22-3 6-2 12-1 16 3zM112 95c4-3 10-4 18-1l6 1z', '#4a4f56');
  return svg(s);
}

// --- Public API -------------------------------------------------------------------------------

const ROOMS = { barricade, generator, barracks, workshop, infirmary, armory, radio, scrapyard };

/** One room illustration; opts: { level 0..5, active, fill 0..1, weapons, alert }. */
export function roomArt(id, opts = {}) {
  const o = opts || {};
  const level = Math.max(0, Math.min(5, Math.round(Number(o.level) || 0)));
  const fill = Math.max(0, Math.min(1, Number(o.fill) || 0));
  const draw = ROOMS[id];
  if (!draw) return svg(shell('#3a3f47', 'block', '#2a2e33', '#22262b', '#2a2e34') + bare(100));
  return svg(draw(level, { active: !!o.active, fill, weapons: Array.isArray(o.weapons) ? o.weapons : [], alert: !!o.alert }));
}

/** The shared gradients, patterns and ambient animations, inserted once into the page. */
export function artDefs() {
  const stop = (o, c, a) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`;
  const radial = (id, c, a) => `<radialGradient id="sh-${id}">${stop(0, c, a)}${stop(0.45, c, n1(a * 0.35 * 100) / 100)}${stop(1, c, 0)}</radialGradient>`;
  const pat = (id, w, h, body) => `<pattern id="sh-${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern>`;
  const lines = (d, c = '#000', a = 0.28, w = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${a}" stroke-width="${w}"/>`;
  return (
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>` +
    radial('lamp', '#ffcf7a', 0.55) +
    radial('red', '#ff4b3a', 0.7) +
    radial('green', '#49c06a', 0.8) +
    `<linearGradient id="sh-beam" x1="0" y1="0" x2="0" y2="1">${stop(0, '#ffe7a8', 0.42)}${stop(1, '#ffe7a8', 0)}</linearGradient>` +
    `<linearGradient id="sh-sky" x1="0" y1="0" x2="0" y2="1">${stop(0, '#0a0f1e', 1)}${stop(0.6, '#16203a', 1)}${stop(1, '#2b3c5a', 1)}</linearGradient>` +
    `<linearGradient id="sh-shade" x1="0" y1="0" x2="0" y2="1">${stop(0, '#000', 0.45)}${stop(0.32, '#000', 0)}${stop(0.76, '#000', 0)}${stop(0.8, '#000', 0.25)}${stop(1, '#000', 0.1)}</linearGradient>` +
    `<radialGradient id="sh-vig" cx=".5" cy=".5" r=".72">${stop(0.62, '#000', 0)}${stop(1, '#000', 0.42)}</radialGradient>` +
    pat('brick', 20, 10, lines('M0 9.5h20M0 4.5h20M5 0v4.5M15 5v4.5')) +
    pat('block', 24, 12, lines('M0 11.5h24M12 0v11.5', '#000', 0.24)) +
    pat('tile', 10, 10, lines('M0 9.5h10M9.5 0v10', '#fff', 0.14)) +
    pat('plank', 12, 12, lines('M11.5 0v12', '#000', 0.26) + lines('M5 0v12', '#fff', 0.04, 3)) +
    pat('stripe', 10, 10, lines('M2 0v10', '#fff', 0.06, 3) + lines('M7 0v10', '#000', 0.12, 0.6)) +
    pat('peg', 6, 6, `<circle cx="3" cy="3" r=".9" fill="#000" fill-opacity=".38"/>`) +
    pat('mesh', 6, 6, lines('M0 0l6 6M6 0L0 6', '#8c99a6', 0.55, 0.6)) +
    pat('hazard', 8, 8, `<rect width="8" height="8" fill="#f2c14e"/><path d="M0 8L8 0H4L0 4zM8 4v4H4z" fill="#15110d"/>`) +
    `</defs><style>` +
    '@keyframes sh-blink{50%{opacity:.15}}' +
    '@keyframes sh-pulse{to{opacity:.45}}' +
    '@keyframes sh-flicker{0%,100%{opacity:1}45%{opacity:.86}50%{opacity:.7}55%{opacity:.9}}' +
    '@keyframes sh-puff{0%{opacity:0;transform:translate(0,4px) scale(.6)}30%{opacity:.8}100%{opacity:0;transform:translate(5px,-12px) scale(1.5)}}' +
    '@keyframes sh-wave{0%{opacity:1;transform:scale(.8)}100%{opacity:.2;transform:scale(1.15)}}' +
    '.sh-blink{animation:sh-blink 1.2s steps(1) infinite}' +
    '.sh-pulse{animation:sh-pulse 1.4s ease-in-out infinite alternate}' +
    '.sh-flicker{animation:sh-flicker 4s ease-in-out infinite}' +
    '.sh-puff{animation:sh-puff 2.4s ease-out infinite;transform-box:fill-box;transform-origin:center}' +
    '.sh-puff:nth-child(2){animation-delay:.8s}.sh-puff:nth-child(3){animation-delay:1.6s}' +
    '.sh-spark{animation:sh-blink .3s steps(1) infinite}' +
    '.sh-wave{animation:sh-wave 1.1s ease-out infinite;transform-box:fill-box;transform-origin:center}' +
    '.sh-twinkle path:nth-child(odd){animation:sh-pulse 1.6s ease-in-out infinite alternate}' +
    '@media (prefers-reduced-motion:reduce){.sh-blink,.sh-pulse,.sh-flicker,.sh-puff,.sh-spark,.sh-wave,.sh-twinkle path{animation:none!important}}' +
    `</style></svg>`
  );
}
