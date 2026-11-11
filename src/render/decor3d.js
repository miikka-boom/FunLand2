// Small things that were painted flat on the ground and now stand up: chairs,
// a fridge, the lemonade stand, signs, suitcases, whiteboards, the survivors'
// stoves and radios, Ben's cardboard fort and his rabbit, moored boats...
//
// They aren't obstacles (nothing collides with them), so they are "props":
// {x, y, r, h, draw(R, p)} given a slot in the painter's order once. Each
// marks its decor entry `_3d`, which tells the ground pass to leave the flat
// version out while the camera is tilted (straight down, the flat one is
// right and these aren't drawn).

import { box, cylinder, ball, limb, line3, quad3, prism, polygon, turnedRect, tone } from './prims.js';
import { FONT, hash01 } from './draw-utils.js';
import { TAU, clamp } from '../util.js';
import { drawFort, FORT_WALLS, drawEyes } from './ben-render.js';
import { whiteboardLen } from '../world/lore-content.js';
import { WATER_Z } from './docks-render.js';

const MARKER_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", system-ui, sans-serif';
const PRINT_FONT = '"Helvetica Neue", Arial, system-ui, sans-serif';
const CRAYON = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", "Bradley Hand", "Marker Felt", cursive';
const quad = new Float64Array(8);
const hullPts = new Float64Array(12);

const lit = (R, p) => R.L.lit(p.x, p.y);
const pbox = (R, x0, y0, x1, y1, z0, z1, color, b) => box(R.ctx, R.v, x0, y0, x1, y1, z0, z1, tone(color, b), tone(color, b * R.fX), tone(color, b * R.fY));
const sideOf = (R, color, b) => (nx, ny) => tone(color, b * (0.6 + 0.32 * Math.max(0, nx * R.lx + ny * R.ly)));

function chair(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const { x, y } = p;
  // An office chair: a post, the seat, the back toward wherever it was pushed.
  ctx.strokeStyle = tone('#1a1b1e', b);
  ctx.lineWidth = Math.max(1, 2 * v.scale);
  ctx.beginPath();
  line3(ctx, v, x, y, 0, x, y, 10);
  ctx.stroke();
  pbox(R, x - 6, y - 6, x + 6, y + 6, 10, 13, '#34373d', b);
  if (p.side) pbox(R, x - 6, y - 7, x - 4, y + 7, 13, 26, '#464a51', b);
  else pbox(R, x - 7, y - 6, x + 7, y - 4, 13, 26, '#464a51', b);
}

function fridge(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { x, y } = p;
  pbox(R, x - 14, y - 11, x + 14, y + 11, 0, 46, '#e7e7e2', b);
  const { ctx, v } = R;
  if (v.flat || !v.faceY) return;
  // The door line, the handle, the note.
  const yf = v.faceY > 0 ? y + 11 : y - 11;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  line3(ctx, v, x - 14, yf, 30, x + 14, yf, 30);
  ctx.stroke();
  ctx.fillStyle = tone('#f2d94c', b);
  ctx.beginPath();
  quad3(ctx, v, x + 3, yf, 16, x + 10, yf, 16, x + 10, yf, 24, x + 3, yf, 24);
  ctx.fill();
}

function stand(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const { x, y } = p;
  // The lemonade stand: a table, a jug, the sign over it.
  pbox(R, x - 22, y - 10, x + 20, y + 8, 0, 22, '#d9c27a', b);
  pbox(R, x - 18, y - 6, x - 10, y + 2, 22, 31, '#e8d84a', b);
  if (v.flat) return;
  ctx.strokeStyle = tone('#8a7a4a', b);
  ctx.lineWidth = Math.max(1, 1.6 * v.scale);
  ctx.beginPath();
  line3(ctx, v, x - 21, y - 9, 22, x - 21, y - 9, 48);
  line3(ctx, v, x + 19, y - 9, 22, x + 19, y - 9, 48);
  ctx.stroke();
  ctx.fillStyle = tone('#f1ead8', b);
  ctx.beginPath();
  quad3(ctx, v, x - 22, y - 9, 38, x + 20, y - 9, 38, x + 20, y - 9, 49, x - 22, y - 9, 49);
  ctx.fill();
  const fwd = v.runsRight(1, 0);
  R.face(fwd ? x - 22 : x + 20, y - 9, fwd ? 1 : -1, 0, 0);
  ctx.fillStyle = tone('#c94a4a', Math.max(b, 0.2));
  ctx.font = `900 7px ${PRINT_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LEMONADE', 21, -43.5);
  R.reset();
}

/** A sign on a post, turned to the camera so it can be read. */
function sign(R, p) {
  const b = Math.max(0.12, lit(R, p));
  const { ctx, v } = R;
  const { x, y } = p;
  if (v.flat) return;
  const w = p.w;
  const z0 = p.z0;
  const z1 = z0 + p.ph;
  ctx.strokeStyle = tone('#2a2a2a', b);
  ctx.lineWidth = Math.max(1, 2.2 * v.scale);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  line3(ctx, v, x, y, 0, x, y, z0);
  ctx.stroke();
  ctx.lineCap = 'round';
  // The board faces the camera: it runs across the screen.
  const dx = v.cy;
  const dy = v.sy;
  ctx.fillStyle = tone(p.bg, b);
  ctx.beginPath();
  quad3(ctx, v, x - dx * w / 2, y - dy * w / 2, z0, x + dx * w / 2, y + dy * w / 2, z0, x + dx * w / 2, y + dy * w / 2, z1, x - dx * w / 2, y - dy * w / 2, z1);
  ctx.fill();
  R.face(x - dx * w / 2, y - dy * w / 2, dx, dy, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (p.price) {
    ctx.fillStyle = tone('#ffffff', Math.max(b, 0.3));
    ctx.font = `900 9px ${FONT}`;
    ctx.fillText('GAS', w / 2, -z1 + 8);
    ctx.fillStyle = tone('#ffd36a', Math.max(b, 0.3));
    ctx.fillText('3.99', w / 2, -z1 + 18);
  } else {
    ctx.fillStyle = tone('#1b1b1b', Math.max(b, 0.2));
    ctx.font = `800 ${p.fs}px ${PRINT_FONT}`;
    ctx.fillText(p.text, w / 2, -(z0 + z1) / 2 + 0.5);
  }
  R.reset();
}

function suitcase(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const s = p.d.s || 1;
  const { x, y } = p;
  pbox(R, x - 9 * s, y - 7 * s, x + 9 * s, y + 6 * s, 0, 8 * s, p.d.c || '#7a4a2a', b);
  pbox(R, x - 3 * s, y - 1 * s, x + 3 * s, y + 1 * s, 8 * s, 10 * s, '#1c1c1c', b);
}

/** A whiteboard on its stand: the words are on the side you can see. */
function whiteboard(R, p) {
  const b = Math.max(0.1, lit(R, p));
  const { ctx, v } = R;
  if (v.flat) return;
  const d = p.d;
  const len = p.len;
  const horiz = d.horiz;
  const x0 = horiz ? d.x - len / 2 : d.x - 1;
  const x1 = horiz ? d.x + len / 2 : d.x + 1;
  const y0 = horiz ? d.y - 1 : d.y - len / 2;
  const y1 = horiz ? d.y + 1 : d.y + len / 2;
  ctx.strokeStyle = tone('#6d7278', b);
  ctx.lineWidth = Math.max(1, 1.8 * v.scale);
  ctx.beginPath();
  if (horiz) {
    line3(ctx, v, x0 + 6, d.y, 0, x0 + 6, d.y, 14);
    line3(ctx, v, x1 - 6, d.y, 0, x1 - 6, d.y, 14);
  } else {
    line3(ctx, v, d.x, y0 + 6, 0, d.x, y0 + 6, 14);
    line3(ctx, v, d.x, y1 - 6, 0, d.x, y1 - 6, 14);
  }
  ctx.stroke();
  box(ctx, v, x0, y0, x1, y1, 12, 42, tone('#9aa0a6', b), tone('#f4f4f0', b * (horiz ? 0.6 : 0.92)), tone('#f4f4f0', b * (horiz ? 0.92 : 0.6)));
  // Write on the long face (it always looks at the camera on one side or the other).
  const fwd = horiz ? v.runsRight(1, 0) : v.runsRight(0, 1);
  if (horiz) R.face(fwd ? x0 : x1, v.faceY > 0 ? y1 : y0, fwd ? 1 : -1, 0, 0);
  else R.face(v.faceX < 0 ? x0 : x1, fwd ? y0 : y1, 0, fwd ? 1 : -1, 0);
  ctx.fillStyle = `rgba(30,60,160,${clamp(0.25 + b, 0, 0.92)})`;
  ctx.font = `700 10px ${MARKER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.text || '', len / 2, -27);
  R.reset();
}

function stove(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const { x, y } = p;
  pbox(R, x - 8, y - 8, x + 8, y + 8, 0, 6, '#2a2a2a', b);
  cylinder(ctx, v, x, y, 5.5, 6, 13, tone('#3a3d42', b), tone('#6b6b6b', b * 0.8));
  pbox(R, x + 9, y - 4, x + 16, y + 4, 0, 9, '#6b6b6b', b);
}

function radio(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const { x, y } = p;
  pbox(R, x - 10, y - 6, x + 10, y + 6, 0, 11, '#3b3f45', b);
  ctx.strokeStyle = tone('#9a9a9a', b);
  ctx.lineWidth = 1;
  ctx.beginPath();
  line3(ctx, v, x + 7, y - 4, 11, x + 12, y - 8, 30);
  ctx.stroke();
  ctx.fillStyle = tone('#c9a227', b);
  ctx.beginPath();
  ball(ctx, v, x - 4, y + (v.faceY > 0 ? 6 : -6), 6, 2.6);
  ctx.fill();
}

function cans(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const d = p.d;
  const n = d.trail ? 6 : 7;
  for (let k = 0; k < n; k++) {
    const hx = d.trail ? (k - n / 2) * 7 : (hash01(d.x + k * 1.3) - 0.5) * 22 * (d.s || 1);
    const hy = d.trail ? Math.sin(k * 1.7) * 6 : (hash01(d.y + k * 2.1) - 0.5) * 16 * (d.s || 1);
    const c = k % 3 ? '#a9adb1' : '#c0392b';
    cylinder(ctx, v, d.x + hx, d.y + hy, 3, 0, 6.5, tone(c, b * 1.1), tone(c, b * 0.8));
  }
  if (d.trail) {
    // The string they hang on: an alarm for the dark.
    ctx.strokeStyle = `rgba(220,220,220,${0.5 * b})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    line3(ctx, v, d.x - 24, d.y, 3, d.x + 20, d.y, 3);
    ctx.stroke();
  }
}

function candle(R, p) {
  const b = Math.max(0.3, lit(R, p));
  cylinder(R.ctx, R.v, p.x, p.y, 2.4, 0, 6, tone('#fff6d8', b), tone('#e8e2cc', b * 0.85));
}

function ticket(R, p) {
  const b = Math.max(0.1, lit(R, p));
  const { ctx, v } = R;
  const { x, y } = p;
  ctx.strokeStyle = tone('#4a4d52', b);
  ctx.lineWidth = Math.max(1, 2.4 * v.scale);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  line3(ctx, v, x, y, 0, x, y, 28);
  ctx.stroke();
  ctx.lineCap = 'round';
  pbox(R, x - 5, y - 5, x + 5, y + 5, 28, 40, '#b3261e', b);
}

/** The stuffed rabbit, sitting up: one ear chewed short, sewn-on googly eyes. */
function rabbit(R, p) {
  const b = lit(R, p);
  if (b < 0.032) return;
  const { ctx, v } = R;
  const { x, y } = p;
  if (v.flat) return;
  const fur = tone('#bcb1a3', b);
  ctx.fillStyle = fur;
  ctx.beginPath();
  ball(ctx, v, x, y, 6, 6.6);
  ctx.fill();
  // Ears: the good one, the chewed one.
  ctx.strokeStyle = fur;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4 * v.scale;
  ctx.beginPath();
  limb(ctx, v, x - v.cy * 2.6, y - v.sy * 2.6, 19, x - v.cy * 4, y - v.sy * 4, 31);
  limb(ctx, v, x + v.cy * 2.6, y + v.sy * 2.6, 19, x + v.cy * 3.4, y + v.sy * 3.4, 24);
  ctx.stroke();
  ctx.strokeStyle = tone('#e5a9b0', b);
  ctx.lineWidth = 1.6 * v.scale;
  ctx.beginPath();
  limb(ctx, v, x - v.cy * 2.8, y - v.sy * 2.8, 21, x - v.cy * 3.8, y - v.sy * 3.8, 29);
  ctx.stroke();
  ctx.fillStyle = fur;
  ctx.beginPath();
  ball(ctx, v, x, y, 15.5, 5.2);
  ctx.fill();
  // It looks at the camera. It always does.
  const sx = v.px(x, y);
  const sy = v.py(x, y, 16);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(v.scale, v.scale);
  drawEyes(ctx, 0, 0, Math.PI / 2, 0.42, Math.min(1, 0.35 + b), false);
  ctx.fillStyle = tone('#d98c96', b);
  ctx.beginPath();
  ctx.arc(0, 2.6, 0.9, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Ben's bed: the cardboard walls of his fort stand up; what's on them is painted on their tops. */
function fort(R, p) {
  const b = Math.max(0.1, lit(R, p));
  const { ctx, v } = R;
  const d = p.d;
  if (v.flat) return;
  const a = d.a || 0;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const H = 21;
  const side = sideOf(R, '#9c7650', b);
  // Far walls first.
  const walls = FORT_WALLS.map(([x, y, w, h]) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const wx = d.x + ca * cx - sa * cy;
    const wy = d.y + sa * cx + ca * cy;
    return { wx, wy, w, h, depth: v.depth(wx, wy) };
  });
  walls.sort((p1, p2) => p1.depth - p2.depth);
  for (const w of walls) {
    turnedRect(w.wx, w.wy, w.w, w.h, a, quad);
    prism(ctx, v, quad, 0, H, tone('#9c7650', b), side);
  }
  R.ground(H);
  drawFort(ctx, d, 'walls');
  if (b < 0.97) {
    // Shade what was just painted at full brightness.
    ctx.fillStyle = `rgba(0,0,0,${(1 - b).toFixed(2)})`;
    ctx.beginPath();
    for (const w of walls) {
      turnedRect(w.wx, w.wy, w.w, w.h, a, quad);
      ctx.moveTo(quad[0], quad[1]);
      ctx.lineTo(quad[2], quad[3]);
      ctx.lineTo(quad[4], quad[5]);
      ctx.lineTo(quad[6], quad[7]);
      ctx.closePath();
    }
    ctx.fill();
  }
  R.reset();
}

/** A vent at the foot of a wall: on the wall when that wall looks at the camera. */
function vent(R, p) {
  const b = Math.max(0.12, R.struct(R.L.lit(p.x + p.nx * 6, p.y + p.ny * 6)) * 0.9);
  const { ctx, v } = R;
  const d = p.d;
  // Along the wall: across the normal.
  const tx = -p.ny;
  const ty = p.nx;
  const wx = d.x - p.nx * 3.5;
  const wy = d.y - p.ny * 3.5;
  ctx.fillStyle = tone('#5a5e63', b);
  ctx.beginPath();
  quad3(ctx, v, wx - tx * 13, wy - ty * 13, 2, wx + tx * 13, wy + ty * 13, 2, wx + tx * 13, wy + ty * 13, 19, wx - tx * 13, wy - ty * 13, 19);
  ctx.fill();
  ctx.fillStyle = '#0b0c0e';
  ctx.beginPath();
  quad3(ctx, v, wx - tx * 11, wy - ty * 11, 4, wx + tx * 11, wy + ty * 11, 4, wx + tx * 11, wy + ty * 11, 17, wx - tx * 11, wy - ty * 11, 17);
  ctx.fill();
  if (!d.open) {
    ctx.strokeStyle = tone('#7a7f85', b);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let z = 6; z < 17; z += 2.6) line3(ctx, v, wx - tx * 10, wy - ty * 10, z, wx + tx * 10, wy + ty * 10, z);
    ctx.stroke();
  }
}

/** A small moored workboat, bobbing. */
function boat(R, p) {
  const b = Math.max(0.1, R.L.sample(p.x, p.y));
  const { ctx, v } = R;
  const d = p.d;
  if (v.flat) return;
  const s = d.s;
  const bob = Math.sin(R.t * 1.3 + d.x) * 1.2;
  const z0 = WATER_Z + bob - 1;
  const z1 = WATER_Z + bob + 9;
  const x = d.x;
  const y = d.y;
  hullPts[0] = x - 62 * s; hullPts[1] = y;
  hullPts[2] = x - 34 * s; hullPts[3] = y - 17 * s;
  hullPts[4] = x + 30 * s; hullPts[5] = y - 18 * s;
  hullPts[6] = x + 56 * s; hullPts[7] = y - 6 * s;
  hullPts[8] = x + 56 * s; hullPts[9] = y + 6 * s;
  hullPts[10] = x + 30 * s; hullPts[11] = y + 18 * s;
  // (the last corner mirrors the second)
  const pts = [hullPts[0], hullPts[1], hullPts[2], hullPts[3], hullPts[4], hullPts[5], hullPts[6], hullPts[7], hullPts[8], hullPts[9], hullPts[10], hullPts[11], x - 34 * s, y + 17 * s];
  prism(ctx, v, pts, z0, z1, tone(d.color, b), sideOf(R, d.color, b * 0.85));
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  polygon(ctx, v, [x - 46 * s, y - 9 * s, x + 42 * s, y - 11 * s, x + 42 * s, y + 11 * s, x - 46 * s, y + 9 * s], z1);
  ctx.fill();
  pbox(R, x - 6 * s, y - 8 * s, x + 14 * s, y + 8 * s, z1 - 2, z1 + 15, '#d8d3c6', b);
  pbox(R, x - 7 * s, y - 9 * s, x + 15 * s, y + 9 * s, z1 + 15, z1 + 17, '#8f8b80', b);
}

/** A raft out on the water, with a few words on it. */
function raft(R, p) {
  const b = Math.max(0.12, R.L.sample(p.x, p.y));
  const { ctx, v } = R;
  const d = p.d;
  if (v.flat) return;
  const bob = Math.sin(R.t * 1.4 + d.x * 0.01) * 1.4;
  const z = WATER_Z + bob;
  pbox(R, d.x - 24, d.y - 15, d.x + 24, d.y + 15, z - 1, z + 4, '#7a5f40', b);
  cylinder(ctx, v, d.x + 27, d.y - 9, 5, z - 1, z + 6, tone('#d24a3c', b), tone('#b8352a', b * 0.85));
  R.ground(z + 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let yy = d.y - 7.5; yy < d.y + 15; yy += 7.5) {
    ctx.moveTo(d.x - 24, yy);
    ctx.lineTo(d.x + 24, yy);
  }
  ctx.stroke();
  ctx.font = `700 7.5px ${CRAYON}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,138,30,${clamp(0.3 + b, 0, 0.95)})`;
  ctx.fillText(d.text, d.x, d.y + 1);
  R.reset();
}

/** Props for the decor that has a 3D version. Marks each decor entry `_3d`. */
export function buildDecorProps(scene, view) {
  const map = scene.map;
  const out = [];
  const add = (d, r, h, draw, extra, keepFlat = false) => {
    d._3d = !keepFlat;
    out.push({ x: d.x, y: d.y, r, h, d, draw, decor: true, ...extra });
  };
  for (const d of map.decor) {
    d._3d = false;
    switch (d.type) {
      case 'chair':
        add(d, 6, 26, chair, { side: hash01(d.x * 0.7 + d.y) < 0.5 });
        break;
      case 'fridge':
        add(d, 12, 46, fridge);
        break;
      case 'stand':
        add(d, 16, 50, stand);
        break;
      case 'sign':
        add(d, 4, 40, sign, { w: 40, z0: 26, ph: 11, bg: '#d6d2c4', text: d.text, fs: 7 });
        break;
      case 'pricesign':
        add(d, 4, 76, sign, { w: 32, z0: 50, ph: 26, bg: '#b8322a', price: true });
        break;
      case 'suitcase':
        add(d, 8, 10, suitcase);
        break;
      case 'whiteboard': {
        // Same measure the flat one uses (lore-content), so the words fit.
        const len = Math.max(70, whiteboardLen(d.text));
        add(d, 10, 42, whiteboard, { len });
        break;
      }
      case 'stove':
        add(d, 8, 13, stove);
        break;
      case 'radio':
        add(d, 8, 30, radio);
        break;
      case 'cans':
        add(d, 10, 7, cans);
        break;
      case 'candle':
        add(d, 3, 8, candle);
        break;
      case 'ticket':
        add(d, 5, 40, ticket);
        break;
      case 'rabbit':
        add(d, 6, 32, rabbit);
        break;
      case 'benfort':
        add(d, 30, 21, fort);
        break;
      case 'vent': {
        // Only if its wall looks at the camera; otherwise it stays drawn on the floor.
        const nx = Math.cos(d.a);
        const ny = Math.sin(d.a);
        // (The flat one stays too: the grate and its screws lie on the floor.)
        if (nx * view.gx + ny * view.gy > 0.35 && !view.flat) add(d, 6, 19, vent, { nx, ny }, true);
        break;
      }
      case 'boat':
        add(d, 40, 20, boat);
        break;
      case 'raft':
        add(d, 20, 6, raft);
        break;
      default:
        break;
    }
  }
  return out;
}
