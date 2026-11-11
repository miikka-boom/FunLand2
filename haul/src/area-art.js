// Long Haul: the six backdrops of the run you watch, one for each stop on the
// road (the six places of We Left Ben). Hand-written SVG strings; no DOM in
// here, so it imports in node too.
//
// A backdrop is two fragments for one <svg viewBox="0 0 1000 420">: `back`
// (the sky, the far things, whatever stands behind the fighters, the ground)
// and `front` (a few dark shapes along the bottom edge). The fighters are
// drawn between the two, feet on STAGE.lanes, survivors on the left and
// drowsers walking in from the right. So everything behind them is kept
// darker and duller than they are, and the ground they stand on is calm.
//
// Sky and ground run far past the scene as plain fills, for views that show
// more than the 1000 × 420 (letterboxing). Three class names are there for CSS
// to animate: bd-blink (small lights), bd-flicker (neon, a bad tube) and
// bd-drift (mist, steam, smoke, clouds).

/** The scene size every backdrop is drawn for. `lanes` is the y where feet stand, back to front. */
export const STAGE = { w: 1000, h: 420, lanes: [318, 346, 374] };
/** The stops, in road order. */
export const AREA_IDS = ['suburbia', 'graveyard', 'junkyard', 'streets', 'office', 'docks'];

// --- The kit ---------------------------------------------------------------------------------

const OUT = '#1b1730';
const JOIN = 'stroke-linejoin="round" stroke-linecap="round"';
const ST = `stroke="${OUT}" stroke-width="3" ${JOIN}`;
const ST2 = `stroke="${OUT}" stroke-width="2" ${JOIN}`;
const FONT = `font-family="ui-rounded, 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif" font-weight="900"`;
/** Sky and ground reach this far left and right. */
const X0 = -600;
const X1 = 1600;
const W = X1 - X0;

/** Numbers as they go into the SVG: two decimals at most. */
const n = (v) => Math.round(v * 100) / 100;

// Options shared by the shapes: s (0 no outline, 2 thin; default the 3 px outline), op, cls, rx.
const sk = (o) => (o.s === 0 ? '' : ` ${o.s === 2 ? ST2 : ST}`);
const at = (o) => (o.op != null ? ` opacity="${o.op}"` : '') + (o.cls ? ` class="${o.cls}"` : '');
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${fill}"${sk(o)}${at(o)}/>`;
const path = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${sk(o)}${at(o)}/>`;
const circ = (cx, cy, r, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${sk(o)}${at(o)}/>`;
const ell = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${sk(o)}${at(o)}/>`;
/** A stroke with no fill. */
const line = (d, color = OUT, w = 3, o = {}) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${o.butt ? 'stroke-linejoin="round"' : JOIN}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${at(o)}/>`;
/** Many round dots as one element. */
const dots = (pts, color, w = 3, o = {}) => line(pts.map(([x, y]) => `M${x} ${y}h.01`).join(''), color, w, o);
/** Lettering, centred on x. `len` pins its width, whatever font the device has. */
const text = (x, y, size, str, fill, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" ${FONT} fill="${fill}" text-anchor="middle"${o.len ? ` textLength="${o.len}" lengthAdjust="spacingAndGlyphs"` : ''}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ''}${at(o)}>${str}</text>`;
const group = (inner, o = {}) => `<g${o.t ? ` transform="${o.t}"` : ''}${at(o)}>${inner}</g>`;

const stops = (list) => list.map(([off, color, op]) => `<stop offset="${off}" stop-color="${color}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
/** A top-to-bottom gradient between y0 and y1 (scene units); above and below it the end colours go on. */
const fadeDef = (id, name, list, y0 = 0, y1 = 296) => `<linearGradient id="${id}-${name}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">${stops(list)}</linearGradient>`;
const glowDef = (id, name, color, op = 0.7) => `<radialGradient id="${id}-${name}">${stops([[0, color, op], [0.5, color, n(op * 0.35)], [1, color, 0]])}</radialGradient>`;
const skyRect = (id) => `<rect x="${X0}" y="-600" width="${W}" height="920" fill="url(#${id}-sky)"/>`;
/** A fill across the whole width from y down (to the bottom by default). */
const band = (y, fill, h = 900 - y, o = {}) => `<rect x="${X0}" y="${y}" width="${W}" height="${h}" fill="${fill}"${at(o)}/>`;
const glow = (id, name, cx, cy, rx, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${o.ry || rx}" fill="url(#${id}-${name})"${at(o)}/>`;

/** A lumpy cloud with a flat bottom, `w` wide, its left end at (x, y). Also mist, steam and smoke. */
const cloud = (x, y, w, fill, o = {}) =>
  path(`M${x} ${y}a${n(w * 0.16)} ${n(w * 0.11)} 0 0 1 ${n(w * 0.2)} ${n(-w * 0.1)}a${n(w * 0.2)} ${n(w * 0.16)} 0 0 1 ${n(w * 0.36)} ${n(-w * 0.04)}a${n(w * 0.16)} ${n(w * 0.12)} 0 0 1 ${n(w * 0.3)} ${n(w * 0.08)}a${n(w * 0.1)} ${n(w * 0.07)} 0 0 1 ${n(w * 0.14)} ${n(w * 0.06)}Z`, fill, { s: 0, ...o });
/** A window with its cross. */
const win = (x, y, w, h, fill) => rect(x, y, w, h, fill, { s: 2, rx: 2 }) + line(`M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}`, OUT, 2);
/** A few blades of grass with their feet at (x, y). */
const tuft = (x, y, fill) => path(`M${x} ${y}l3 -8 3 8 3 -11 4 11 3 -7 3 7Z`, fill, { s: 0 });
/** A parked car from the side, 148 long; (x, base) is where its body meets the road. */
const car = (x, base, body, glass) =>
  group(
    path('M0 -4V-18Q0 -28 12 -30L32 -32Q42 -52 62 -52H96Q112 -52 124 -32L140 -28Q148 -26 148 -16V-4Q148 0 144 0H4Q0 0 0 -4Z', body) +
      path('M40 -32Q47 -46 62 -46H76V-32ZM82 -46H96Q108 -46 117 -32H82Z', glass, { s: 2 }) +
      line('M6 -15H142', OUT, 2, { op: 0.25 }) +
      circ(32, 0, 11, '#221b30') +
      circ(118, 0, 11, '#221b30') +
      dots([[32, 0], [118, 0]], '#8a8098', 7),
    { t: `translate(${x} ${base})` },
  );
/** A fire hydrant as a dark shape, its cap at (x, y). */
const hydrant = (x, y, fill) => path(`M${x - 12} ${y + 46}V${y + 14}h-4v-6h6q0 -8 10 -8t10 8h6v6h-4V${y + 46}ZM${x - 18} ${y + 20}h-6v8h6Z`, fill, { s: 0 });
/** Flat-topped buildings as one path: [width, top] pairs from x0, standing on `base`. */
const skyline = (x0, base, list) => `M${x0} ${base}${list.map(([w, top]) => `V${top}h${w}`).join('')}V${base}Z`;
/** Their lit windows, as dot coordinates between xa and xb (a fixed pattern, nothing random). */
function litWindows(x0, base, list, xa = -1e9, xb = 1e9) {
  const pts = [];
  let x = x0;
  list.forEach(([w, top], k) => {
    for (let j = 0, yy = top + 9; yy < base - 5; yy += 12, j++) for (let i = 0, xx = x + 6; xx < x + w - 4; xx += 9, i++) if ((i * 7 + j * 13 + k * 5) % 4 === 0 && xx > xa && xx < xb) pts.push([xx, yy]);
    x += w;
  });
  return pts;
}

// --- 1. Suburbia: the lawns of Delco, at sunset ------------------------------------------------

function suburbia() {
  const id = 'suburbia';
  const WARM = '#ffd978';
  const DARK = '#3d3156';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#46306f'], [0.4, '#b9527b'], [0.76, '#f58d4e'], [1, '#ffd38e']])}${glowDef(id, 'sun', '#ffe9ad', 0.9)}${glowDef(id, 'warm', '#ffd27a', 0.7)}</defs>`;
  const warm = (x, y, r) => glow(id, 'warm', x, y, r);

  // A house: chimney, wall, pitched roof, windows [x, y, lit] and doors [x, colour, porch light on].
  const house = (x, w, top, wall, roof, wins, doors) => {
    let s = rect(x + Math.round(w * 0.62), top - 72, 18, 34, '#7a5560') + rect(x, top, w, 292 - top, wall);
    s += path(`M${x - 12} ${top + 2}L${x + 24} ${top - 54}H${x + w - 24}L${x + w + 12} ${top + 2}Z`, roof);
    s += line(`M${x + 32} ${top - 44}H${x + w - 32}`, '#ffffff', 3, { op: 0.14 });
    for (const [wx, wy, lit] of wins) s += (lit ? warm(x + wx + 14, wy + 14, 38) : '') + win(x + wx, wy, 28, 28, lit ? WARM : DARK);
    for (const [dx, color, lit] of doors) {
      s += rect(x + dx, 246, 24, 46, color, { rx: 2 }) + path(`M${x + dx - 8} 244l6 -10h28l6 10Z`, roof, { s: 2 });
      s += (lit ? warm(x + dx + 36, 240, 30) : '') + circ(x + dx + 36, 240, 3.5, lit ? '#fff3c4' : '#8a7f95', { s: 2 });
    }
    return s;
  };

  // Far away: the sun going down behind the tree line, wires, and an ice-cream truck still playing.
  let far = '';
  for (let x = X0, k = 0; x < X1; x += 88, k++) far += `q44 ${-[26, 44, 30, 52, 22, 40][k % 6]} 88 0`;
  let near = '';
  for (let x = X0, k = 0; x < X1; x += 64, k++) near += `q32 ${-[18, 30, 14, 26, 34][k % 5]} 64 0`;
  const sky =
    skyRect(id) +
    glow(id, 'sun', 836, 268, 190) +
    circ(836, 268, 54, '#ffeab0', { s: 0 }) +
    cloud(110, 96, 210, '#e07a8c', { op: 0.55, cls: 'bd-drift' }) +
    cloud(520, 62, 170, '#d86a8a', { op: 0.5, cls: 'bd-drift' }) +
    cloud(700, 150, 130, '#f7a07a', { op: 0.5, cls: 'bd-drift' }) +
    path(`M${X0} 300V262${far}V300Z`, '#8c4f6e', { s: 0 }) +
    path(`M${X0} 300V280${near}V300Z`, '#74425f', { s: 0 }) +
    line('M-162 296V98M306 296V98M774 296V98M1242 296V98M-175 112h26M293 112h26M761 112h26M1229 112h26', '#4a3350', 5) +
    line('M-630 112Q-396 152 -162 112Q72 152 306 112Q540 152 774 112Q1008 152 1242 112Q1476 152 1710 112', '#4a3350', 2, { op: 0.75 }) +
    dots([[516, 128], [530, 129], [560, 129]], '#3a2748', 7);
  const truck =
    rect(806, 264, 48, 22, '#dccdd2', { s: 2, rx: 3 }) +
    path('M854 270h10q6 0 6 8v8h-16Z', '#dccdd2', { s: 2 }) +
    rect(812, 268, 22, 9, '#3d3156', { s: 2 }) +
    rect(806, 279, 64, 4, '#d86a8a', { s: 0 }) +
    path('M826 264l5 -12 5 12Z', '#e9c08a', { s: 2 }) +
    circ(831, 250, 5, '#f7a0b8', { s: 2 }) +
    circ(848, 261, 2.5, '#ff5a4a', { s: 0, cls: 'bd-blink' }) +
    line('M874 252v-10l8 -2v9M790 250v-9', '#4a3350', 2, { op: 0.6 }) +
    dots([[872, 252], [880, 249], [788, 250]], '#4a3350', 5, { op: 0.6 });

  // The street: a strip of lawn, the kerb, the road. A driveway crosses the lawn.
  let pickets = '';
  for (let x = 50; x <= 298; x += 13) pickets += `M${x} 298V275l4.5 -5 4.5 5V298Z`;
  const street =
    band(286, '#5f7d4c') +
    band(286, '#7c9a5c', 3) +
    path('M540 286H708L716 306H532Z', '#b3a2a8', { s: 0 }) +
    band(304, '#c1b0ad', 7) +
    band(310, '#5c4a62') +
    band(310, OUT, 3, { op: 0.35 }) +
    rect(396, 305, 30, 6, '#2a2238', { s: 2, rx: 2 });
  const homes =
    house(56, 240, 178, '#9a7e7c', '#5b3f5c', [[22, 196, 1], [70, 196, 0], [142, 196, 0], [190, 196, 1], [62, 242, 0], [150, 242, 1]], [[22, '#6a3f4a', 1], [194, '#3f5a6a', 0]]) +
    line('M176 180V292', OUT, 2, { op: 0.5 }) +
    house(316, 180, 168, '#818f89', '#4c4563', [[26, 186, 0], [76, 186, 1], [126, 186, 0], [118, 242, 1]], [[20, '#6a4a3f', 1]]) +
    house(528, 240, 184, '#978da7', '#5b3f5c', [[40, 194, 0], [106, 194, 1], [196, 194, 0]], [[202, '#4a5a7a', 1]]) +
    rect(548, 228, 152, 64, '#b5abb8', { rx: 2 }) +
    line('M548 244h152M548 260h152M548 276h152', OUT, 2, { op: 0.4 });
  const yard =
    rect(48, 281, 262, 4, '#a08e8d', { s: 0 }) +
    rect(48, 291, 262, 4, '#a08e8d', { s: 0 }) +
    path(pickets, '#bdaba8', { s: 2 }) +
    rect(928, 236, 12, 62, '#5a3f4a') +
    path('M900 240q-22 -8 -14 -32q-8 -26 20 -30q10 -24 36 -12q26 -6 28 20q18 14 2 36q-2 22 -30 18q-20 12 -42 0Z', '#566f4c') +
    path('M908 196q4 -18 26 -14q-14 6 -16 22Z', '#6f8a5c', { s: 0 }) +
    path('M876 298q-6 -22 14 -24q10 -12 26 -6q18 -8 30 4q22 2 20 26Z', '#4f6a4a') +
    car(548, 292, '#6f7f9c', DARK) +
    line('M504 300V274', '#5a3f4a', 4) +
    rect(492, 260, 26, 14, '#55648c', { rx: 6 }) +
    path('M514 260v-9h7v5h-7', '#d9483b', { s: 2 }) +
    line('M384 300V280M426 300V280', OUT, 2) +
    rect(376, 246, 58, 36, '#eadfca', { rx: 3 }) +
    text(405, 260, 9, 'CLASS OF', DARK, { len: 44 }) +
    text(405, 277, 16, '2020', '#b0304a', { len: 40 });
  const decals = line(`M${X0} 399H${X1}`, '#e0cba8', 4, { dash: '44 36', op: 0.28, butt: true }) + line('M214 330l16 6 10 -4 14 8M640 352l-12 8 6 10', OUT, 2, { op: 0.16 });

  const front =
    band(404, '#2a1f3d') +
    band(404, '#51406a', 3) +
    hydrant(100, 394, '#1c1430') +
    tuft(180, 406, '#1c1430') +
    tuft(470, 406, '#1c1430') +
    tuft(700, 406, '#1c1430') +
    rect(860, 398, 44, 40, '#1c1430', { s: 0, rx: 4 }) +
    rect(854, 394, 56, 7, '#1c1430', { s: 0, rx: 3 });
  return { back: defs + sky + truck + street + homes + yard + decals, front };
}

// --- 2. The Graveyard: Wissahickon Hill, under a big moon --------------------------------------

function graveyard() {
  const id = 'graveyard';
  const STONE = '#5e7f82';
  const SHADE = '#47666b';
  const LITE = '#7fa3a2';
  const IRON = '#0d1f29';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#0b2030'], [0.55, '#15404f'], [1, '#2e6e72']])}${glowDef(id, 'moon', '#d6f2e4', 0.5)}${glowDef(id, 'warm', '#ffc566', 0.75)}</defs>`;

  // Headstones: (x, base) is the bottom-left corner.
  const stone = (kind, x, base, w, h, fill = STONE) => {
    const t = w / 3;
    const arm = n(base - h * 0.62); // where the arms of a cross sit
    if (kind === 'cross') return path(`M${x + t} ${base}V${arm}H${x}v${-t}h${t}V${base - h}h${t}V${arm - t}h${t}v${t}h${-t}V${base}Z`, fill);
    if (kind === 'obelisk') return path(`M${n(x + w * 0.16)} ${base}L${n(x + w * 0.3)} ${base - h + 12}L${x + w / 2} ${base - h}L${n(x + w * 0.7)} ${base - h + 12}L${n(x + w * 0.84)} ${base}Z`, fill) + rect(x, base - 8, w, 8, fill, { s: 2 });
    const body = kind === 'slab' ? rect(x, base - h, w, h, fill, { rx: 6 }) : path(`M${x} ${base}V${base - h + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${base}Z`, fill);
    return body + line(`M${x + 7} ${n(base - h * 0.52)}h${w - 14}M${x + 9} ${n(base - h * 0.34)}h${w - 18}`, OUT, 2, { op: 0.35 });
  };

  const sky =
    skyRect(id) +
    dots([[80, 40], [150, 92], [240, 30], [330, 72], [420, 24], [520, 62], [600, 34], [880, 40], [940, 120], [60, 134], [470, 124], [650, 150]], '#e4f7ee', 2.4, { op: 0.75 }) +
    glow(id, 'moon', 742, 96, 170) +
    circ(742, 96, 50, '#f1f4dc', { s: 0 }) +
    dots([[726, 84], [756, 114]], '#dde5c6', 15) +
    dots([[764, 80], [730, 116]], '#dde5c6', 7) +
    cloud(610, 134, 230, '#1a4654', { op: 0.6, cls: 'bd-drift' }) +
    // The chapel on the hill, one window lit.
    path('M266 250V172L258 172L300 142L342 172L334 172V250ZM288 150V118L284 118L300 82L316 118L312 118V150Z', '#0e2c38', { s: 0 }) +
    line('M300 82V66M294 73h12', '#0e2c38', 3) +
    rect(296, 182, 8, 15, '#ffc566', { s: 0, rx: 4, op: 0.85 }) +
    path(`M${X0} 300V236Q-200 190 60 214T420 196T800 222T${X1} 204V300Z`, '#123a45', { s: 0 }) +
    path(`M${X0} 300V262Q200 236 480 256T1000 246T${X1} 262V300Z`, '#19474f', { s: 0 }) +
    dots([[220, 252], [250, 250], [282, 251], [520, 256], [556, 257], [590, 256], [700, 254], [760, 251], [820, 250], [934, 248]], '#2f666a', 6);

  // A gravel path between the grass.
  const ground =
    band(292, '#1d4a45') +
    band(306, '#5d7e7a', 82) +
    band(306, '#40615e', 3) +
    band(386, '#40615e', 3) +
    dots([[70, 322], [150, 360], [236, 332], [322, 372], [410, 326], [480, 358], [566, 338], [640, 376], [720, 322], [800, 356], [884, 330], [950, 368], [30, 378], [760, 380]], '#86a8a2', 3, { op: 0.4 });

  const gate =
    line('M776 216Q816 166 856 216', IRON, 4) +
    line('M788 296V208M800 296V198M812 296V192M824 296V192M836 296V198M848 296V206M778 252h76M778 284h76', IRON, 3) +
    [752, 856].map((x) => rect(x, 196, 24, 102, STONE) + rect(x + 15, 198, 7, 98, SHADE, { s: 0 }) + rect(x - 4, 188, 32, 10, LITE, { rx: 2 }) + circ(x + 12, 181, 7, LITE)).join('');
  const rows =
    stone('round', 70, 290, 20, 26, SHADE) +
    stone('cross', 112, 290, 18, 32, SHADE) +
    stone('round', 150, 290, 20, 24, SHADE) +
    stone('round', 196, 290, 20, 26, SHADE) +
    stone('cross', 234, 290, 18, 34, SHADE) +
    stone('slab', 306, 290, 26, 20, SHADE) +
    stone('round', 346, 290, 20, 28, SHADE) +
    stone('cross', 388, 290, 18, 32, SHADE) +
    stone('round', 426, 290, 22, 24, SHADE) +
    stone('obelisk', 462, 290, 22, 46, SHADE) +
    stone('round', 190, 298, 30, 42) +
    stone('cross', 244, 298, 27, 52) +
    stone('slab', 294, 298, 36, 30) +
    stone('round', 352, 298, 28, 46) +
    stone('obelisk', 410, 298, 28, 62) +
    stone('round', 468, 298, 30, 38) +
    stone('slab', 50, 298, 36, 28) +
    stone('round', 102, 298, 30, 44) +
    stone('cross', 148, 298, 27, 50);
  const tomb =
    rect(560, 286, 172, 12, SHADE) +
    rect(572, 208, 148, 80, STONE) +
    [580, 608, 672, 700].map((x) => rect(x, 214, 12, 72, LITE, { s: 2 })).join('') +
    path('M632 286V246a14 14 0 0 1 28 0V286Z', '#0d2630') +
    line('M641 286V240M651 286V240', IRON, 2) +
    path('M562 208L646 164L730 208Z', STONE) +
    line('M582 202L646 170L710 202', LITE, 3, { op: 0.6 }) +
    circ(646, 192, 7, SHADE, { s: 2 });
  const lantern =
    ell(540, 302, 50, 7, '#ffc566', { s: 0, op: 0.16 }) +
    line('M518 298V226q0 -14 12 -14t12 12', IRON, 4) +
    glow(id, 'warm', 542, 236, 62) +
    rect(535, 226, 14, 18, '#ffd27a', { rx: 2 }) +
    line('M533 226h18', OUT, 3);
  const tree =
    line('M892 298C888 262 898 236 890 200', '#102530', 16) +
    line('M891 234C870 216 860 200 846 170M892 216C910 192 926 180 944 150M890 204C886 178 892 158 884 130', '#102530', 7) +
    line('M846 170l-16 -10M850 182l-4 -24M930 172l22 -4M916 190l-2 -26M886 150l-18 -14M888 166l16 -18', '#102530', 3);
  const mist =
    ell(190, 292, 230, 12, '#c6ebe0', { s: 0, op: 0.16, cls: 'bd-drift' }) +
    ell(650, 296, 260, 13, '#c6ebe0', { s: 0, op: 0.14, cls: 'bd-drift' }) +
    ell(900, 284, 170, 10, '#c6ebe0', { s: 0, op: 0.12, cls: 'bd-drift' }) +
    [118, 384, 704, 930].map((x) => tuft(x, 308, '#143a38')).join('') +
    [60, 300, 610, 846].map((x) => tuft(x, 390, '#143a38')).join('');

  const front =
    band(398, '#0f2d30') +
    [220, 420, 660].map((x) => tuft(x, 400, '#0a2126')).join('') +
    path('M96 440V412a27 18 0 0 1 54 0V440ZM857 440V394h14V440ZM843 404h42v12h-42Z', '#0a2126', { s: 0 }) +
    ell(520, 414, 330, 13, '#c6ebe0', { s: 0, op: 0.12, cls: 'bd-drift' });
  return { back: defs + sky + ground + gate + rows + tomb + lantern + tree + mist, front };
}

// --- 3. The Junkyard: Cracked Bell Auto Salvage, at a rusty dusk -------------------------------

function junkyard() {
  const id = 'junkyard';
  const DIRT = '#5b3f35';
  const FENCE = '#6e5146';
  const STEEL = '#4a4450';
  const YELLOW = '#b88a2e';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#31203b'], [0.45, '#8a4535'], [0.8, '#da7a3c'], [1, '#f4b768']])}${glowDef(id, 'haze', '#ffd58a', 0.55)}${glowDef(id, 'sodium', '#ffb040', 0.8)}${glowDef(id, 'red', '#ff5040', 0.85)}</defs>`;

  // A wreck, squashed flat enough to stack: 118 long, 36 tall, (x, y) its bottom-left corner.
  const wreck = (x, y, color, flip) =>
    group(
      path('M2 0V-14Q2 -20 10 -21L30 -23Q38 -36 52 -36H78Q90 -36 98 -24L110 -22Q116 -20 116 -14V0Z', color) +
        path('M36 -23Q42 -31 52 -31H62V-23ZM67 -31H77Q86 -31 92 -23H67Z', '#2a2233', { s: 2 }) +
        dots([[26, -3], [92, -3]], '#241c2a', 17) +
        line('M8 -12h20M68 -10l14 -4 12 5', OUT, 2, { op: 0.3 }),
      { t: `translate(${flip ? x + 118 : x} ${y})${flip ? ' scale(-1 1)' : ''}` },
    );
  const stack = (x, colors) => colors.map((c, k) => wreck(x, 296 - k * 34, c, k % 2 === 1)).join('');

  let ribs = '';
  for (let x = -592; x < X1; x += 14) ribs += `M${x} 243V296`;
  const sky =
    skyRect(id) +
    glow(id, 'haze', 480, 300, 330, { ry: 190 }) +
    cloud(60, 118, 240, '#2a1a2e', { op: 0.28, cls: 'bd-drift' }) +
    cloud(610, 64, 270, '#2a1a2e', { op: 0.2, cls: 'bd-drift' }) +
    path(`M${X0} 300V250L-420 236L-300 252L-180 226L-60 250L20 222L70 240L130 206L200 244L280 228L340 250L420 214L500 246L600 226L660 250L760 212L840 240L900 220L980 248L1100 226L1300 250L${X1} 236V300Z`, '#7c4433', { s: 0 }) +
    // The fence: corrugated sheets, no two the same brown.
    band(238, FENCE, 62) +
    rect(120, 238, 92, 60, '#7a5a48', { s: 0 }) +
    rect(516, 238, 112, 60, '#66493f', { s: 0 }) +
    rect(760, 238, 84, 60, '#7d6050', { s: 0 }) +
    line(ribs, OUT, 2, { op: 0.13 }) +
    line(`M${X0} 238H${X1}`, OUT, 3);
  const sign =
    line('M262 240V160M398 240V160', '#4a3530', 6) +
    group(
      rect(232, 150, 196, 64, '#dcc79c', { rx: 4 }) +
        path('M246 196q5 -4 5 -15q0 -12 8 -12t8 12q0 11 5 15Z', YELLOW, { s: 2 }) +
        line('M259 171l-3 8 4 5 -3 9', OUT, 2) +
        circ(259, 199, 2.5, OUT, { s: 0 }) +
        text(346, 180, 19, 'CRACKED BELL', '#8f2f26', { len: 132 }) +
        text(346, 202, 14, 'AUTO SALVAGE', '#33203a', { len: 124 }),
      { t: 'rotate(-2 330 182)' },
    );
  const tyres = [[212, 282], [244, 282], [276, 282], [228, 256], [260, 256], [244, 230]].map(([x, y]) => circ(x, y, 15, '#2c2431') + circ(x, y, 6.5, FENCE, { s: 2 })).join('');
  const crane =
    rect(428, 250, 16, 32, '#8f6a22') +
    path('M456 240L622 58L634 66L474 248Z', YELLOW) +
    line('M468 238L484 212L492 222L508 190L516 198L532 166L540 174L556 140L564 150L580 116L588 126L604 92L612 100L626 68', OUT, 2, { op: 0.45 }) +
    rect(440, 236, 60, 46, YELLOW) +
    rect(470, 243, 24, 20, '#2a2233', { s: 2, rx: 2 }) +
    rect(430, 280, 90, 17, '#2a2230', { rx: 8 }) +
    dots([[444, 289], [462, 289], [480, 289], [498, 289]], '#5a5060', 6) +
    line('M628 62V108', OUT, 2) +
    rect(618, 102, 20, 10, STEEL, { s: 2 }) +
    rect(604, 110, 48, 12, STEEL, { rx: 3 }) +
    group(wreck(568, 158, '#7a6a78', false), { t: 'rotate(3 628 140)' });
  const light =
    path('M700 88L636 300H804L738 88Z', '#ffb040', { s: 0, op: 0.08 }) +
    line('M718 298V78', '#3a2a30', 6) +
    glow(id, 'sodium', 718, 90, 120) +
    rect(696, 64, 46, 16, STEEL, { rx: 3 }) +
    dots([[707, 82], [731, 82]], '#ffe2a0', 10);
  const crusher =
    rect(748, 190, 112, 108, '#5c5e56') +
    rect(748, 190, 112, 13, '#d6a52e') +
    line('M758 202l8 -11M776 202l8 -11M794 202l8 -11M812 202l8 -11M830 202l8 -11M848 202l8 -11', OUT, 4, { butt: true }) +
    rect(778, 203, 10, 16, '#b9b9a8', { s: 2 }) +
    rect(820, 203, 10, 16, '#b9b9a8', { s: 2 }) +
    rect(760, 228, 88, 56, '#2a2430', { s: 2 }) +
    rect(760, 216, 88, 13, '#8a8c80', { s: 2 }) +
    rect(768, 252, 72, 30, '#8f4a3a', { s: 2, rx: 3 }) +
    line('M776 262l12 6 10 -8 14 8 12 -6M780 274h50', OUT, 2, { op: 0.4 }) +
    rect(730, 240, 16, 28, STEEL, { s: 2 }) +
    glow(id, 'red', 738, 248, 13, { cls: 'bd-blink' }) +
    circ(738, 248, 3, '#ff5040', { s: 0, cls: 'bd-blink' });
  const ground =
    band(298, DIRT) +
    band(298, OUT, 6, { op: 0.2 }) +
    ell(360, 306, 64, 5, '#2f2228', { s: 0, op: 0.45 }) +
    ell(820, 398, 86, 7, '#2f2228', { s: 0, op: 0.4 }) +
    dots([[90, 330], [190, 368], [300, 340], [420, 376], [520, 326], [610, 360], [720, 338], [810, 372], [900, 332], [960, 362]], '#7a5a4c', 3, { op: 0.45 });

  const front =
    circ(86, 430, 34, '#22161f', { s: 0 }) +
    circ(86, 430, 14, DIRT, { s: 0 }) +
    line('M290 424q34 -24 78 -10', '#22161f', 9) +
    path('M800 440L812 404L836 410L850 395L880 406L902 396L926 412L960 400L1000 420V440Z', '#22161f', { s: 0 });
  return {
    back: defs + sky + ground + sign + stack(56, ['#8a5a3c', '#5f7a78', '#a8873f', '#7a6a78']) + tyres + crane + stack(568, ['#8f4a3a', '#5a6a86', '#a8873f']) + light + crusher + stack(872, ['#5f7a78', '#8a5a3c']),
    front,
  };
}

// --- 4. Center City, after dark ----------------------------------------------------------------

function streets() {
  const id = 'streets';
  const WARM = '#ffd978';
  const GLASS = '#262a50';
  const IRON = '#1c1a36';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#090e2a'], [0.6, '#172057'], [1, '#2c3a82']])}${glowDef(id, 'lamp', '#ffd88a', 0.7)}${glowDef(id, 'neon', '#ff6fb5', 0.6)}${glowDef(id, 'red', '#ff4a3a', 0.9)}${glowDef(id, 'city', '#6a7ae0', 0.35)}</defs>`;
  const lit = (x, y) => glow(id, 'lamp', x + 17, y + 17, 40) + win(x, y, 34, 34, WARM);
  const dark = (x, y) => win(x, y, 34, 34, GLASS);

  const far = [];
  for (let k = 0; k < 32; k++) far.push([[70, 54, 90, 60, 80, 48, 96, 64][k % 8], [44, 92, 18, 70, 112, 30, 86, 58][(k * 3) % 8]]);
  const sky =
    skyRect(id) +
    glow(id, 'city', 500, 300, 520, { ry: 300 }) +
    path(skyline(X0, 300, far), '#121a46', { s: 0 }) +
    path('M536 44l23 -32 23 32Z', '#121a46', { s: 0 }) +
    line('M492 30V13', '#121a46', 3) +
    circ(492, 11, 3, '#ff4a3a', { s: 0, cls: 'bd-blink' }) +
    dots(litWindows(X0, 150, far, -80, 1080), WARM, 2.6, { op: 0.6 });

  // The row: a dark block on the left, then four buildings with shops at street level.
  const hoagies =
    rect(X0, 130, 710, 170, '#2a2748') +
    dark(58, 158) + dark(58, 214) +
    rect(110, 118, 200, 180, '#4b3b5c') +
    rect(106, 110, 208, 12, '#5d4b70', { rx: 2 }) +
    rect(132, 216, 112, 62, '#4a3f4a') +
    rect(168, 230, 40, 16, '#eadfca', { s: 2, rx: 2 }) +
    text(188, 242, 9, 'CLOSED', '#8f2f26', { len: 30 }) +
    rect(256, 214, 44, 84, '#2f2a48') +
    rect(262, 220, 32, 40, GLASS, { s: 2 }) +
    path('M122 212L132 190H298L308 212Z', '#8f3f4a') +
    path('M154 190h22l-2 22h-24ZM204 190h22l2 22h-24ZM254 190h22l6 22h-24Z', '#d9c4b0', { s: 0 }) +
    line('M122 212L132 190H298L308 212Z', OUT, 3) +
    rect(130, 136, 160, 46, '#1d1a36', { rx: 6 }) +
    group(glow(id, 'neon', 210, 160, 120, { ry: 60 }) + line('M140 144h140v30h-140Z', '#6ff0ff', 2) + text(210, 170, 26, 'HOAGIES', '#ffb3da', { len: 122 }), { cls: 'bd-flicker' });
  const laundry =
    rect(310, 60, 190, 238, '#3b4868') +
    rect(306, 54, 198, 12, '#4d5c80', { rx: 2 }) +
    lit(328, 84) + dark(388, 84) + dark(448, 84) + dark(328, 132) + lit(388, 132) + dark(448, 132) +
    rect(322, 180, 166, 22, '#d9c4a0', { s: 2, rx: 3 }) +
    text(405, 196, 13, 'LAUNDROMAT', '#3b4868', { len: 138 }) +
    rect(326, 208, 112, 90, '#565a78') +
    line('M326 220h112M326 232h112M326 244h112M326 256h112M326 268h112M326 280h112', OUT, 2, { op: 0.3 }) +
    text(382, 262, 16, 'GO BIRDS', '#4fd08a', { len: 84, rot: -6, op: 0.9 }) +
    rect(450, 214, 38, 84, '#2a2748') +
    rect(456, 220, 26, 30, GLASS, { s: 2 });
  const corner =
    rect(500, 96, 190, 202, '#54445a') +
    rect(496, 90, 198, 12, '#66546c', { rx: 2 }) +
    dark(518, 122) + lit(578, 122) + dark(638, 122) +
    rect(516, 206, 158, 74, GLASS) +
    rect(528, 214, 40, 54, '#3a2f6b', { s: 2 }) +
    path('M554 228a9 9 0 1 1 -10 -10a7 7 0 0 0 10 10Z', '#efe6ff', { s: 0 }) +
    text(548, 260, 7, 'SLUMBRA', '#efe6ff', { len: 32 });
  const brick =
    rect(690, 74, 910, 224, '#3f3f63') +
    rect(686, 68, 914, 12, '#525282', { rx: 2 }) +
    [712, 784, 856, 928].map((x, k) => (k === 2 ? lit(x, 96) : dark(x, 96)) + (k === 0 ? lit(x, 146) : dark(x, 146))).join('') +
    line('M702 134H976M702 184H976M702 134v-12M976 134v-12M702 184v-12M976 184v-12M760 184L820 134', IRON, 2, { op: 0.7 }) +
    rect(770, 210, 162, 88, '#2f3050') +
    line('M770 224h162M770 238h162M770 252h162M770 266h162', OUT, 2, { op: 0.3 }) +
    rect(708, 214, 38, 84, '#2a2748') +
    circ(738, 258, 2, WARM, { s: 0 });

  // Street lamps, the bus stop nobody is coming to, and the car you don't want to shoot.
  const lamp = (x, dir) =>
    ell(x + dir * 38, 304, 84, 8, '#ffd88a', { s: 0, op: 0.12 }) +
    line(`M${x} 298V118q0 -12 ${dir * 22} -12h${dir * 12}`, IRON, 6) +
    glow(id, 'lamp', x + dir * 38, 122, 104) +
    rect(dir > 0 ? x + 24 : x - 52, 101, 28, 10, '#2a2748', { rx: 4 }) +
    ell(x + dir * 38, 113, 9, 4, '#fff0c0', { s: 2 });
  const busStop =
    rect(524, 208, 122, 62, '#7fb0e0', { s: 0, op: 0.15 }) +
    line('M520 206V296M650 206V296', IRON, 5) +
    rect(512, 196, 146, 10, '#2f3a66', { rx: 3 }) +
    rect(530, 270, 110, 6, '#3d4270', { s: 2, rx: 2 }) +
    line('M668 298V190', IRON, 4) +
    circ(668, 180, 12, '#3f6fd0') +
    text(668, 183, 8, 'BUS', '#ffffff', { len: 16 }) +
    rect(534, 266, 34, 30, '#8a4a40', { rx: 4 }) +
    rect(570, 258, 28, 38, '#3f6f78', { rx: 4 }) +
    rect(600, 270, 38, 26, '#a8873f', { rx: 4 }) +
    group(rect(540, 246, 40, 20, '#6a4a80', { rx: 4 }), { t: 'rotate(-4 560 256)' }) +
    rect(592, 244, 30, 14, '#8f6a5a', { rx: 3 }) +
    line('M546 266v-6h10v6M578 258v-6h12v6M551 266v30M584 258v38M612 270v26M626 270v26', OUT, 2, { op: 0.6 });
  const alarmCar = car(722, 294, '#2f5560', '#1a1e3a') + glow(id, 'red', 812, 256, 15, { cls: 'bd-blink' }) + circ(812, 256, 3, '#ff4a3a', { s: 0, cls: 'bd-blink' });
  const steam =
    ell(446, 314, 20, 5, '#14162e', { s: 2 }) +
    circ(446, 296, 14, '#dfe6ff', { s: 0, op: 0.2, cls: 'bd-drift' }) +
    circ(456, 270, 18, '#dfe6ff', { s: 0, op: 0.15, cls: 'bd-drift' }) +
    circ(440, 240, 22, '#dfe6ff', { s: 0, op: 0.1, cls: 'bd-drift' });
  const ground =
    band(292, '#3e4368') +
    band(306, '#585d86', 5) +
    band(311, '#252947') +
    band(311, OUT, 3, { op: 0.4 }) +
    line(`M${X0} 398H${X1}`, '#cdb65a', 4, { dash: '46 34', op: 0.4, butt: true });

  const front =
    band(408, '#12152e') +
    band(408, '#2c3158', 3) +
    hydrant(92, 396, '#0b0e22') +
    path('M176 440q-6 -30 14 -34q4 -10 16 -8q18 -4 22 12q16 2 14 30Z', '#0b0e22', { s: 0 }) +
    path('M752 440l10 -44h8l10 44Z', '#0b0e22', { s: 0 }) +
    rect(868, 394, 46, 46, '#0b0e22', { s: 0, rx: 4 }) +
    rect(874, 400, 34, 13, '#2c3158', { s: 0, rx: 2 });
  return { back: defs + sky + ground + hoagies + laundry + corner + brick + lamp(310, 1) + lamp(700, 1) + busStop + alarmCar + steam, front };
}

// --- 5. Market Street: the 14th floor, lights still on -----------------------------------------

function office() {
  const id = 'office';
  const FRAME = '#1c2534';
  const TEAL = '#7fe6d8';
  const PAPER = '#cfd9de';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#0d1436'], [0.6, '#27306a'], [1, '#c7783f']], 72, 240)}${glowDef(id, 'tube', '#dff4ff', 0.45)}${glowDef(id, 'screen', TEAL, 0.5)}${glowDef(id, 'warm', '#ffc566', 0.6)}${glowDef(id, 'exit', '#6fe8a0', 0.45)}</defs>`;

  // The wall, the ceiling and its tubes (the third one is on its way out).
  const tube = (x) => path(`M${x} 36L${x - 50} 298H${x + 170}L${x + 120} 36Z`, '#dff4ff', { s: 0, op: 0.05 }) + glow(id, 'tube', x + 60, 40, 120, { ry: 34 }) + rect(x, 22, 120, 14, '#e8f7ff', { rx: 3 });
  const room =
    `<rect x="${X0}" y="-600" width="${W}" height="900" fill="#42546a"/>` +
    band(-600, '#252e3d', 646) +
    line(`M${X0} 46H${X1}`, OUT, 3, { op: 0.6 }) +
    tube(110) + tube(350) + group(tube(590), { cls: 'bd-flicker' }) + tube(830) +
    band(286, '#303d4c', 14);

  // The window wall: the skyline, warm against the night.
  const city = [[30, 170], [26, 150], [22, 186], [34, 128], [20, 168], [28, 98], [26, 194], [32, 150], [30, 128], [24, 178], [36, 98], [28, 154], [30, 124], [22, 172], [48, 186]];
  const view =
    rect(56, 66, 448, 174, FRAME, { rx: 3 }) +
    rect(62, 72, 436, 162, `url(#${id}-sky)`, { s: 0 }) +
    path(skyline(62, 234, city), '#161d3e', { s: 0 }) +
    dots(litWindows(62, 234, city), '#ffcc66', 2.6, { op: 0.8 }) +
    line('M208 98V80', '#161d3e', 3) +
    circ(208, 79, 3, '#ff5a4a', { s: 0, cls: 'bd-blink' }) +
    path('M96 72H150L96 234H62V170Z', '#ffffff', { s: 0, op: 0.05 }) +
    line('M172 72V234M282 72V234M392 72V234', FRAME, 6) +
    line('M62 112H498', FRAME, 4) +
    rect(54, 236, 452, 8, '#2b3646', { rx: 2 });

  // Cubicles, with what is still switched on showing over the top.
  const monitor = (x, on) => (on ? glow(id, 'screen', x, 218, 40) : '') + rect(x - 22, 204, 44, 30, FRAME, { rx: 3 }) + rect(x - 18, 208, 36, 22, on ? TEAL : '#2b3646', { s: 0 });
  const cubicles =
    monitor(110, true) +
    line('M98 214h24M98 220h16M98 226h20', '#1c5a58', 2, { op: 0.7 }) +
    monitor(270, false) +
    rect(276, 210, 9, 9, '#f2d266', { s: 0 }) +
    monitor(420, true) +
    circ(420, 219, 6, '#1c5a58', { s: 0, op: 0.7 }) +
    glow(id, 'warm', 338, 222, 34) +
    line('M352 236L344 218L334 224', FRAME, 3) +
    path('M328 220l12 -8 6 9Z', '#ffd27a', { s: 2 }) +
    [40, 194, 348].map((x) => rect(x, 238, 150, 60, '#55697a') + rect(x - 2, 234, 154, 8, '#6f8494', { rx: 3 }) + line(`M${x + 75} 244V296`, OUT, 2, { op: 0.25 })).join('') +
    rect(214, 250, 22, 26, '#e8eef2', { s: 2 }) +
    line('M214 258h22M219 264h12M219 270h12', '#d9483b', 2, { op: 0.8 }) +
    rect(124, 252, 14, 14, '#f2d266', { s: 2 });

  // The wall on the right: a poster somebody wrote on, the count on the whiteboard, the printer.
  const wall =
    rect(532, 84, 80, 96, FRAME, { rx: 2 }) +
    rect(538, 90, 68, 56, '#2f6268', { s: 0 }) +
    circ(572, 116, 11, '#f2c66a', { s: 0 }) +
    path('M538 146V130l18 -16 14 12 12 -8 24 22V146Z', '#1d4046', { s: 0 }) +
    text(572, 162, 10, 'TEAMWORK', '#e8eef2', { len: 60 }) +
    line('M542 172l8 -4 6 5 8 -5 7 5 9 -6 8 5 8 -4', '#ff5a4a', 2) +
    rect(640, 88, 160, 96, '#dbe5ec', { rx: 3 }) +
    text(720, 112, 12, 'DAYS AWAKE', '#27405a', { len: 96 }) +
    text(720, 160, 42, '41', '#d9483b', { len: 54 }) +
    line('M686 170q34 8 68 -2', '#d9483b', 3) +
    rect(650, 184, 140, 6, '#8fa0ad', { s: 2, rx: 2 }) +
    dots([[664, 182], [676, 182]], '#d9483b', 5) +
    circ(838, 112, 18, '#e8eef2') +
    line('M838 112V101M838 112l9 4', OUT, 2) +
    rect(896, 190, 64, 108, '#33414f', { rx: 2 }) +
    rect(908, 204, 18, 40, FRAME, { s: 2 }) +
    circ(950, 250, 2.5, '#8fa0ad', { s: 0 }) +
    glow(id, 'exit', 928, 174, 34) +
    rect(906, 166, 44, 16, '#17503a', { s: 2, rx: 3 }) +
    text(928, 178, 10, 'EXIT', '#8ff0b8', { len: 28 });
  const floorStuff =
    rect(536, 244, 34, 54, '#c5cfd6', { rx: 3 }) +
    path('M540 244V214q0 -8 13 -8t13 8V244Z', '#8fc7e3') +
    line('M546 238V218', '#ffffff', 3, { op: 0.5 }) +
    dots([[547, 262], [559, 262]], '#3f6fd0', 5) +
    path('M598 298l-4 -26h36l-4 26Z', '#9a6449') +
    path('M612 274Q596 250 588 226Q608 238 616 272ZM614 274Q630 250 644 232Q640 258 620 276ZM610 274Q590 264 578 250Q598 252 614 270ZM616 274Q636 268 650 256Q638 274 618 278Z', '#2c6650', { s: 2 }) +
    path('M612 274Q610 240 618 212Q628 244 618 274Z', '#3b7d62', { s: 2 }) +
    [664, 704, 744].map((x) => rect(x, 252, 40, 46, '#56636f') + line(`M${x + 12} 264h16M${x + 12} 282h16`, OUT, 2, { op: 0.5 })).join('') +
    rect(686, 232, 40, 20, '#b08a5c', { s: 2 }) +
    line('M686 240h40', OUT, 2, { op: 0.4 }) +
    rect(770, 240, 12, 12, '#e8eef2', { s: 2, rx: 2 }) +
    rect(800, 252, 84, 46, '#56636f') +
    line('M810 268h64M810 284h64', OUT, 2, { op: 0.4 }) +
    rect(810, 208, 50, 14, '#e8eef2', { s: 2 }) +
    rect(796, 220, 92, 32, '#b7c1c8', { rx: 4 }) +
    rect(816, 240, 46, 6, '#e8eef2', { s: 2 }) +
    circ(878, 230, 2.5, '#ff5a4a', { s: 0, cls: 'bd-blink' });

  // Carpet, and the paperwork nobody filed.
  const sheet = (x, y, op) => path(`M${x} ${y}l16 -3 4 9 -16 3Z`, PAPER, { s: 2, op });
  const ground =
    band(298, '#35525b') +
    band(298, OUT, 4, { op: 0.25 }) +
    line(`M${X0} 334H${X1}M${X0} 372H${X1}`, FRAME, 2, { op: 0.1 }) +
    sheet(606, 308, 0.8) + sheet(826, 306, 0.8) + sheet(866, 312, 0.8) + sheet(700, 342, 0.4) + sheet(64, 356, 0.4);

  const front =
    sheet(470, 404, 0.7) +
    rect(40, 408, 220, 40, '#141b25', { s: 0, rx: 4 }) +
    path('M70 410V396h16v14ZM86 399h5v7h-5ZM150 410V400q0 -6 30 -6t30 6v10Z', '#141b25', { s: 0 }) +
    rect(804, 394, 70, 60, '#141b25', { s: 0, rx: 16 }) +
    path('M1000 440Q960 420 950 396Q980 404 1000 430ZM1000 440Q984 414 992 394Q1010 410 1010 440Z', '#141b25', { s: 0 });
  return { back: defs + room + view + wall + ground + cubicles + floorStuff, front };
}

// --- 6. Pier 9: the docks, a flare up, the ferry on her way ------------------------------------

function docks() {
  const id = 'docks';
  const QUAY = '#394457';
  const IRON = '#16223a';
  const defs = `<defs>${fadeDef(id, 'sky', [[0, '#081022'], [0.6, '#122848'], [1, '#26445e']])}${glowDef(id, 'flare', '#ff4a3a', 0.6)}${glowDef(id, 'lamp', '#ffe0a0', 0.7)}${glowDef(id, 'red', '#ff4a3a', 0.9)}${glowDef(id, 'ferry', '#ffd27a', 0.6)}</defs>`;
  const fog = (x, y, rx, ry, op) => ell(x, y, rx, ry, '#a9c6d8', { s: 0, op, cls: 'bd-drift' });
  const red = (x, y) => glow(id, 'red', x, y, 13, { cls: 'bd-blink' }) + circ(x, y, 3.5, '#ff4a3a', { s: 0, cls: 'bd-blink' });

  // The flare overhead, the far shore, and the LIBERTY BELLE far out on the water.
  const sky =
    skyRect(id) +
    dots([[90, 30], [200, 70], [470, 40], [560, 96], [700, 30], [780, 84], [900, 50], [960, 130]], '#dfeaff', 2.2, { op: 0.5 }) +
    glow(id, 'flare', 330, 84, 210) +
    line('M330 84q30 40 10 80t22 74', '#d9a9a0', 5, { op: 0.2 }) +
    circ(330, 84, 6, '#ffe3c8', { s: 0, cls: 'bd-flicker' }) +
    band(246, '#0c1a30', 8) +
    dots([[620, 248], [660, 249], [700, 248], [744, 249], [930, 248], [968, 249]], '#ffd27a', 2.4, { op: 0.7 }) +
    band(252, '#15324b', 50) +
    line('M610 262h40M690 270h50M640 282h50M700 290h44M900 266h50M930 284h40', '#3f6a86', 2, { op: 0.5 }) +
    glow(id, 'ferry', 818, 252, 50) +
    path('M770 258h96l-8 10h-80ZM786 258V247h60v11ZM802 247v-8h30v8Z', '#0b1626', { s: 0 }) +
    line('M817 239v-9', '#0b1626', 2) +
    dots([[792, 253], [800, 253], [808, 253], [816, 253], [824, 253], [832, 253], [840, 253], [817, 229]], '#ffd27a', 3) +
    line('M790 274h56M800 280h36M808 286h20', '#ffd27a', 2, { op: 0.3 });

  // Two gantry cranes, far enough back to be shapes.
  const cranes =
    line('M486 296L500 150M590 296L576 150M450 142H660M500 150L538 104L576 150M538 104L660 138M538 104L450 138', '#172a44', 7) +
    red(538, 100) +
    line('M150 296L176 106M330 296L304 106', '#1d3350', 11) +
    line('M120 100H470', '#1d3350', 15) +
    line('M163 200H317M176 106L240 50L304 106M163 200L304 106M317 200L176 106', '#1d3350', 5) +
    line('M240 50L470 94M240 50L120 94M376 122V168M392 122V168', '#1d3350', 3) +
    rect(370, 106, 28, 16, '#1d3350', { s: 0 }) +
    rect(352, 166, 64, 26, '#2a4a5a', { s: 0 }) +
    red(240, 46) +
    red(470, 90);

  // Containers, two high. (x, y) is the top-left corner; some still carry a name.
  const box = (x, y, color, label) => {
    let ribs = '';
    for (let rx = x + 9; rx < x + 104; rx += 9) ribs += `M${rx} ${y + 6}V${y + 40}`;
    return rect(x, y, 108, 46, color) + line(ribs, OUT, 2, { op: 0.16 }) + (label ? text(x + 54, y + 28, 11, label, '#ffffff', { len: label.length * 8, op: 0.55 }) : '');
  };
  const stacks =
    box(64, 204, '#35527b') + box(184, 204, '#7b453d') + box(334, 204, '#2f5e64', 'LULLAN LABS') + box(464, 204, '#8b7537') +
    box(44, 250, '#7b453d') + box(154, 250, '#2f5e64') + box(264, 250, '#4a3f6b', 'SLUMBRA') + box(374, 250, '#35527b') + box(484, 250, '#6d3c44');

  // The open quay: a lamp with the pier's name on it, bollards and their chain.
  const bollard = (x) => path(`M${x - 9} 304v-15q-5 -2 -5 -7t14 -5t14 5t-5 7v15Z`, '#2b3546') + line(`M${x - 5} 284v16`, '#55606e', 2);
  const quay =
    band(298, '#c2a23c', 7) +
    band(298, OUT, 2, { op: 0.5 }) +
    band(304, QUAY) +
    band(304, OUT, 3, { op: 0.3 }) +
    line('M100 308V900M300 308V900M500 308V900M700 308V900M900 308V900', OUT, 2, { op: 0.09 }) +
    ell(430, 332, 44, 4, OUT, { s: 0, op: 0.08 }) +
    ell(770, 364, 50, 4, OUT, { s: 0, op: 0.08 }) +
    ell(668, 308, 80, 7, '#ffe0a0', { s: 0, op: 0.12 }) +
    line('M640 300V112q0 -10 14 -10h10', IRON, 6) +
    glow(id, 'lamp', 668, 116, 104) +
    rect(654, 97, 28, 10, '#22304a', { rx: 4 }) +
    ell(668, 109, 9, 4, '#fff0c0', { s: 2 }) +
    rect(648, 168, 64, 24, '#27508a', { rx: 3 }) +
    text(680, 185, 14, 'PIER 9', '#e8f1ff', { len: 46 }) +
    line('M734 290q38 16 72 0M814 290q38 16 72 0M894 290q38 16 72 0', '#5a6676', 3) +
    [730, 810, 890, 970].map(bollard).join('');
  const mist = fog(240, 238, 330, 10, 0.09) + fog(720, 272, 300, 8, 0.1) + fog(520, 178, 290, 9, 0.06);

  const front =
    path('M88 440V418q-10 -3 -10 -12q0 -10 32 -10t32 10q0 9 -10 12V440Z', '#0a1120', { s: 0 }) +
    ell(196, 428, 42, 10, '#0a1120', { s: 0 }) +
    ell(196, 418, 34, 8, '#0a1120', { s: 0 }) +
    rect(848, 396, 62, 50, '#0a1120', { s: 0, rx: 3 }) +
    rect(906, 406, 54, 40, '#0a1120', { s: 0, rx: 3 }) +
    line('M856 408h46M856 420h46M914 418h38', '#18233a', 3) +
    fog(480, 416, 360, 10, 0.08);
  return { back: defs + sky + cranes + stacks + mist + quay, front };
}

// --- The door --------------------------------------------------------------------------------

const SCENES = { suburbia, graveyard, junkyard, streets, office, docks };
const cache = {};

/**
 * A backdrop as two SVG fragments (no outer <svg>): `back` is drawn first
 * (sky, far things, the things standing behind the fighters, the ground),
 * the fighters are drawn on top of it, then `front` (a few foreground shapes
 * along the bottom edge, for depth). Unknown ids get the first scene.
 */
export function backdropSvg(areaId) {
  const id = SCENES[areaId] ? areaId : AREA_IDS[0];
  if (!cache[id]) cache[id] = SCENES[id]();
  return cache[id];
}
