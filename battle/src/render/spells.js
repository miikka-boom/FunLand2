// Spells on the field (the Boulder, the Cheese Wheel), castle cannonballs, and
// the aiming helpers the battle UI draws while a card is being dragged: the
// spell circle, the deploy-zone tint and see-through "ghost" beans.
//
//   drawSpellsBack(ctx, battle, t);   // ground marks: boulder shadow + target, wheel shadow (before the units)
//   drawSpells(ctx, battle, t);       // boulders and wheels (after the units)
//   drawShots(ctx, battle);           // cannonballs in flight (after the units)
//   drawZone(ctx, x0, x1, ok, { team, t });
//   drawSpellAim(ctx, x, radius, team, ok, t);
//   const ghosts = new DeployGhosts(unitRenderer);
//   ghosts.draw(ctx, cardId, x, team, { ok, t, zone, hats, level });
//
// ctx is in world space (camera applied). Arrow Rain needs no drawing of its
// own: its arrows are real arrows (UnitRenderer draws them).

import { WORLD, TEAMS } from '../config.js';
import { CARDS } from '../sim/cards.js';
import { Battle, DT } from '../sim/battle.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (Number.isFinite(v) ? v : d);
const GROUND = WORLD.groundY + WORLD.laneDepth * 0.5; // where rocks land and wheels roll
const INK = '#2a1d14';

/** Small integer hash -> [0, 1) for stable per-shape details. */
function hash(s, i) {
  let h = Math.imul(s ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- The Boulder -----------------------------------------------------------------------

const ROCK_N = 11;
const rockR = (seed, i) => 0.86 + 0.2 * hash(seed, i);

function rockPath(ctx, x, y, r, rot, seed, k = 1) {
  ctx.beginPath();
  for (let i = 0; i < ROCK_N; i++) {
    const a = rot + (i / ROCK_N) * TAU + (hash(seed, i + 30) - 0.5) * 0.35;
    const rr = r * rockR(seed, i) * k;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/**
 * A big lumpy rock. The light stays put (upper left) while the cracks, moss and
 * specks turn with `rot`, so it reads as rolling. Shared with the card art.
 */
export function drawBoulderShape(ctx, x, y, r, rot = 0, seed = 7) {
  ctx.save();
  rockPath(ctx, x, y, r, rot, seed, 1.07);
  ctx.fillStyle = '#463c34';
  ctx.fill();
  rockPath(ctx, x, y, r, rot, seed);
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x - r * 0.1, y - r * 0.1, r * 1.25);
  g.addColorStop(0, '#cfc6ba');
  g.addColorStop(0.45, '#9d9388');
  g.addColorStop(1, '#6a6058');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  // Shaded crescent on the lower right
  ctx.fillStyle = 'rgba(52,40,32,0.28)';
  ctx.beginPath();
  ctx.arc(x + r * 0.18, y + r * 0.22, r * 0.95, 0, TAU);
  ctx.arc(x - r * 0.12, y - r * 0.12, r * 0.92, 0, TAU, true);
  ctx.fill('evenodd');
  // Turning details: moss, cracks, specks
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (u, v) => [x + (u * c - v * s) * r, y + (u * s + v * c) * r];
  ctx.fillStyle = 'rgba(104,150,62,0.55)';
  ctx.beginPath();
  let [mx, my] = P(-0.35, -0.55);
  ctx.ellipse(mx, my, r * 0.3, r * 0.16, rot - 0.4, 0, TAU);
  [mx, my] = P(0.5, 0.35);
  ctx.moveTo(mx + r * 0.14, my);
  ctx.ellipse(mx, my, r * 0.14, r * 0.08, rot + 0.6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(54,42,34,0.8)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let p = P(0.15, -0.2);
  ctx.moveTo(p[0], p[1]);
  for (const [u, v] of [[0.35, 0.05], [0.3, 0.3], [0.5, 0.5]]) {
    p = P(u, v);
    ctx.lineTo(p[0], p[1]);
  }
  p = P(-0.55, 0.1);
  ctx.moveTo(p[0], p[1]);
  p = P(-0.3, 0.25);
  ctx.lineTo(p[0], p[1]);
  p = P(-0.35, 0.5);
  ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,236,0.35)';
  ctx.lineWidth = Math.max(0.8, r * 0.035);
  ctx.beginPath();
  p = P(0.19, -0.23);
  ctx.moveTo(p[0], p[1]);
  p = P(0.39, 0.02);
  ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  ctx.fillStyle = 'rgba(60,48,40,0.55)';
  for (let i = 0; i < 5; i++) {
    const [sx, sy] = P((hash(seed, i + 60) - 0.5) * 1.3, (hash(seed, i + 70) - 0.5) * 1.3);
    ctx.beginPath();
    ctx.arc(sx, sy, r * (0.04 + 0.03 * hash(seed, i + 80)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // Rim light on the lit edge
  ctx.strokeStyle = 'rgba(255,250,236,0.45)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x - r * 0.04, y - r * 0.04, r * 0.84, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();
}

function boulderBack(ctx, s, t) {
  const r = num(s.r, 30);
  const tx = num(s.tx, s.x);
  if (s.state === 'fall') {
    // Where it lands: a shadow that grows and darkens as the rock comes down, and the danger circle
    const h = clamp((GROUND - r - s.y) / 700, 0, 1);
    const k = 1 - h;
    const R = num(s.radius, 105);
    const T = TEAMS[s.team] || TEAMS.blue;
    ctx.globalAlpha = 0.1 + 0.16 * k;
    ctx.fillStyle = T.light;
    ctx.beginPath();
    ctx.ellipse(tx, GROUND, R, clamp(R * 0.2, 10, 24), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.45 + 0.5 * k;
    ctx.strokeStyle = T.body;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 30;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.15 + 0.4 * k;
    ctx.fillStyle = '#1c2a10';
    ctx.beginPath();
    ctx.ellipse(tx, GROUND + 1, r * (0.5 + 0.9 * k), r * (0.12 + 0.2 * k), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const a = clamp(num(s.alpha, 1), 0, 1);
  const lift = clamp((GROUND - r - s.y) / 120, 0, 1);
  ctx.globalAlpha = 0.35 * a;
  ctx.fillStyle = '#1c2a10';
  ctx.beginPath();
  ctx.ellipse(s.x + 4, GROUND + 2, r * (1.15 - 0.3 * lift), r * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function boulderFront(ctx, s) {
  const r = num(s.r, 30);
  const a = clamp(num(s.alpha, 1), 0, 1);
  if (a <= 0.01) return;
  if (s.state === 'fall') {
    // Speed lines streaming behind it
    const sp = Math.hypot(num(s.vx, 0), num(s.vy, 0)) || 1;
    const ux = -s.vx / sp;
    const uy = -s.vy / sp;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const ox = -uy * i * r * 0.6;
      const oy = ux * i * r * 0.6;
      const L = r * (1.6 + 0.5 * (1 - Math.abs(i)));
      ctx.lineWidth = 3 - Math.abs(i);
      ctx.beginPath();
      ctx.moveTo(s.x + ux * r * 1.1 + ox, s.y + uy * r * 1.1 + oy);
      ctx.lineTo(s.x + ux * (r * 1.1 + L) + ox, s.y + uy * (r * 1.1 + L) + oy);
      ctx.stroke();
    }
  }
  if (a < 1) ctx.globalAlpha = a;
  drawBoulderShape(ctx, s.x, s.y, r, num(s.rot, 0), 7);
  ctx.globalAlpha = 1;
}

// --- The Cheese Wheel --------------------------------------------------------------------

const HOLES = [
  [0.48, 0.2, 0.15],
  [-0.2, 0.5, 0.12],
  [-0.5, -0.25, 0.14],
  [0.12, -0.55, 0.09],
  [0.05, 0.05, 0.1],
  [0.55, -0.35, 0.07],
];
const WEDGE = [-0.42, 0.42]; // the missing slice (radians, in the wheel's turning frame)

/**
 * A wheel of cheese seen side on: orange rind, holes, a wedge cut out of it.
 * It turns with `rot`; the light stays upper left. Shared with the card art.
 */
export function drawCheeseWheel(ctx, x, y, r, rot = 0) {
  ctx.save();
  const a0 = rot + WEDGE[1];
  const a1 = rot + WEDGE[0] + TAU;
  const pie = (rr) => {
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rot) * rr * 0.12, y + Math.sin(rot) * rr * 0.12);
    ctx.arc(x, y, rr, a0, a1);
    ctx.closePath();
  };
  // The wheel's thickness: its back face peeks out up and to the right, and the
  // notch shows the cut cheese inside it
  const bx = x + r * 0.16;
  const by = y - r * 0.08;
  ctx.fillStyle = '#8a5418';
  ctx.beginPath();
  ctx.arc(bx, by, r + 1.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e39a2c';
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffe28a';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r * 0.86, rot + WEDGE[0], rot + WEDGE[1]);
  ctx.lineTo(bx + Math.cos(rot + WEDGE[1]) * r * 0.86, by + Math.sin(rot + WEDGE[1]) * r * 0.86);
  ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2c24e';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(rot + WEDGE[0]) * r * 0.86, y + Math.sin(rot + WEDGE[0]) * r * 0.86);
  ctx.lineTo(bx + Math.cos(rot + WEDGE[0]) * r * 0.86, by + Math.sin(rot + WEDGE[0]) * r * 0.86);
  ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fill();
  pie(r + 1.8);
  ctx.fillStyle = '#8a5418';
  ctx.fill();
  pie(r);
  ctx.fillStyle = '#f0a332';
  ctx.fill();
  pie(r * 0.86);
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.55, '#ffd860');
  g.addColorStop(1, '#f2bc3c');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  // Holes: a darker bowl with a lit lower lip
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const [u, v, hr] of HOLES) {
    const hx = x + (u * c - v * s) * r;
    const hy = y + (u * s + v * c) * r;
    ctx.fillStyle = '#e09a2a';
    ctx.beginPath();
    ctx.arc(hx, hy, hr * r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c47d1c';
    ctx.beginPath();
    ctx.arc(hx + hr * r * 0.18, hy - hr * r * 0.22, hr * r * 0.72, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // Rind highlight on the lit side, and the cut edge of the notch
  ctx.strokeStyle = 'rgba(255,236,170,0.75)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.93, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = '#fff1b5';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a0) * r * 0.86, y + Math.sin(a0) * r * 0.86);
  ctx.lineTo(x + Math.cos(rot) * r * 0.14, y + Math.sin(rot) * r * 0.14);
  ctx.lineTo(x + Math.cos(a1) * r * 0.86, y + Math.sin(a1) * r * 0.86);
  ctx.stroke();
  ctx.restore();
}

function wheelBack(ctx, s) {
  const r = num(s.r, 40);
  ctx.fillStyle = 'rgba(28,52,12,0.3)';
  ctx.beginPath();
  ctx.ellipse(s.x, GROUND + r * 0.12 + 2, r * 0.95, r * 0.18, 0, 0, TAU);
  ctx.fill();
}

function wheelFront(ctx, s, t) {
  const r = num(s.r, 40);
  const dir = Math.sign(num(s.vx, 1)) || 1;
  // Motion lines behind the wheel
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const yy = s.y - r * 0.5 + i * r * 0.5;
    const L = r * (0.6 + 0.25 * Math.sin(t * 20 + i * 2));
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.x - dir * r * 1.1, yy);
    ctx.lineTo(s.x - dir * (r * 1.1 + L), yy);
    ctx.stroke();
  }
  // A little bounce as it rolls over the grass
  const bob = Math.abs(Math.sin(num(s.dist, 0) * 0.045)) * 2;
  drawCheeseWheel(ctx, s.x, s.y - bob, r, num(s.rot, 0));
}

// --- Cannonballs ---------------------------------------------------------------------------

export function drawCannonball(ctx, x, y, r = 7) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3a3e46';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7c8490';
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d6dbe2';
  ctx.beginPath();
  ctx.arc(x - r * 0.4, y - r * 0.42, r * 0.16, 0, TAU);
  ctx.fill();
}

/** Cannonballs in flight (battle.shots), with a short streak so they read at phone zoom. */
export function drawShots(ctx, battle) {
  const shots = battle && battle.shots;
  if (!shots || !shots.length) return;
  for (const s of shots) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    const r = num(s.r, 7);
    const sp = Math.hypot(num(s.vx, 0), num(s.vy, 0)) || 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = r * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x - (s.vx / sp) * r * 1.2, s.y - (s.vy / sp) * r * 1.2);
    ctx.lineTo(s.x - (s.vx / sp) * r * 4, s.y - (s.vy / sp) * r * 4);
    ctx.stroke();
    drawCannonball(ctx, s.x, s.y, r);
  }
}

// --- Spell entities ------------------------------------------------------------------------

/** Ground marks under the spells: boulder shadow and target circle, wheel shadow. Before the units. */
export function drawSpellsBack(ctx, battle, t = 0) {
  const list = battle && battle.spells;
  if (!list || !list.length) return;
  ctx.save();
  for (const s of list) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    if (s.kind === 'boulder') boulderBack(ctx, s, t);
    else if (s.kind === 'wheel') wheelBack(ctx, s);
    else if (s.kind === 'arrowRain') rainBack(ctx, s, t);
  }
  ctx.restore();
}

/** Arrow Rain: where the volleys come down, while they're in the air. */
function rainBack(ctx, s, t) {
  const R = num(s.radius, 130);
  const k = clamp(1 - num(s.t, 0) / 1.4, 0, 1);
  if (k <= 0) return;
  const T = TEAMS[s.team] || TEAMS.blue;
  ctx.globalAlpha = 0.12 * k;
  ctx.fillStyle = T.light;
  ctx.beginPath();
  ctx.ellipse(s.x, GROUND, R, clamp(R * 0.2, 10, 24), 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.7 * k;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 9]);
  ctx.lineDashOffset = t * 25;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Boulders and Cheese Wheels. After the units (they land on / roll through them). */
export function drawSpells(ctx, battle, t = 0) {
  const list = battle && battle.spells;
  if (!list || !list.length) return;
  ctx.save();
  for (const s of list) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    if (s.kind === 'boulder') boulderFront(ctx, s);
    else if (s.kind === 'wheel') wheelFront(ctx, s, t);
  }
  ctx.restore();
}

// --- Aiming helpers (battle UI) -----------------------------------------------------------

const NO = '#ff4d3d';

/**
 * The spell circle while aiming: a ground ellipse covering [x - radius, x + radius]
 * with a turning dashed rim, and a soft dome showing the reach in the air.
 * ok = false (can't cast here / not enough mana): red and dimmer.
 */
export function drawSpellAim(ctx, x, radius, team = 'blue', ok = true, t = 0, opts = {}) {
  if (!Number.isFinite(x)) return;
  const R = clamp(num(radius, 60), 10, 600);
  const col = !ok ? NO : opts.color || (TEAMS[team] || TEAMS.blue).body;
  const ry = clamp(R * 0.22, 12, 26);
  ctx.save();
  // Dome
  const g = ctx.createLinearGradient(0, GROUND - R * 0.95, 0, GROUND);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, ok ? 0.22 : 0.14));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, GROUND, R, R * 0.95, 0, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', ok ? 0.45 : 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, GROUND, R, R * 0.95, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  // Ground disc
  ctx.fillStyle = rgba(col, ok ? 0.32 : 0.2);
  ctx.beginPath();
  ctx.ellipse(x, GROUND, R, ry, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = ok ? '#ffffff' : '#ffd0cb';
  ctx.globalAlpha = ok ? 0.95 : 0.6;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.lineDashOffset = -t * 40;
  ctx.stroke();
  ctx.setLineDash([]);
  // Centre mark
  ctx.globalAlpha = ok ? 0.9 : 0.5;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 9, GROUND);
  ctx.lineTo(x + 9, GROUND);
  ctx.moveTo(x, GROUND - 5);
  ctx.lineTo(x, GROUND + 5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Tint a stretch of the field: where units may be dropped (ok) or a blocked
 * stretch (ok = false, red). opts: { team (colour of an ok zone), t (dash
 * animation, seconds), strength (0..1, default 1), height (column height) }.
 */
export function drawZone(ctx, x0, x1, ok = true, opts = {}) {
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return;
  const col = ok ? (opts.color || (TEAMS[opts.team] || { body: '#ffffff' }).body) : NO;
  const k = clamp(num(opts.strength, 1), 0, 1);
  const H = num(opts.height, 190);
  const t = num(opts.t, 0);
  const top = WORLD.grassTop + 1;
  const front = WORLD.grassFront - 2;
  ctx.save();
  ctx.globalAlpha = (ok ? 0.26 : 0.18) * k;
  ctx.fillStyle = col;
  ctx.fillRect(x0, top, x1 - x0, front - top);
  const g = ctx.createLinearGradient(0, top - H, 0, top);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, (ok ? 0.2 : 0.14) * k));
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(x0, top - H, x1 - x0, H);
  if (!ok) {
    // Diagonal hatching on the grass reads as "not here" even without colour
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, x1 - x0, front - top);
    ctx.clip();
    ctx.strokeStyle = rgba(NO, 0.35 * k);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = x0 - 60; x < x1 + 60; x += 18) {
      ctx.moveTo(x, front);
      ctx.lineTo(x + 40, top);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = (ok ? 0.85 : 0.5) * k;
  ctx.strokeStyle = ok ? '#ffffff' : NO;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([9, 8]);
  ctx.lineDashOffset = -t * 14;
  ctx.beginPath();
  for (const x of [x0, x1]) {
    ctx.moveTo(x, front);
    ctx.lineTo(x, top - H * 0.7);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * See-through beans showing where a unit card will land: the card's formation
 * (mirrored for red, like Match.deploy), each bean settled once and cached.
 * Spell cards draw the spell circle instead.
 */
export class DeployGhosts {
  /** units: the UnitRenderer (palettes and hats follow it). */
  constructor(units) {
    this.units = units;
    this.cache = new Map();
  }

  /** A settled unit to trace: { b, u } (cached per type, team, hat, slot). */
  settled(typeId, team, hat, slot, level = 1) {
    const key = `${typeId}|${team}|${hat || ''}|${slot}|${level}`;
    let g = this.cache.get(key);
    if (g) return g;
    const b = new Battle(3 + slot);
    if (hat && hat !== 'none') b.hats[team] = { [typeId]: hat };
    const u = b.addUnit(typeId, team, 0, 0.5, 99 + slot * 17, { level });
    if (!u) return null;
    for (let i = 0; i < 90; i++) b.step(DT);
    g = { b, u };
    if (this.cache.size > 60) this.cache.clear();
    this.cache.set(key, g);
    return g;
  }

  /**
   * opts: { ok (playable here, default true), t (seconds), zone: [x0, x1] to
   * keep the beans inside, hats: { unitTypeId: hatId }, alpha }.
   */
  draw(ctx, cardId, x, team = 'blue', opts = {}) {
    const card = CARDS[cardId];
    if (!card || !Number.isFinite(x)) return;
    const ok = opts.ok !== false;
    const t = num(opts.t, 0);
    if (card.kind === 'spell') {
      drawSpellAim(ctx, x, card.radius, team, ok, t);
      return;
    }
    const n = card.count || 1;
    const offs = card.spread && card.spread.length >= n ? card.spread : Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * 24);
    const dir = team === 'red' ? -1 : 1;
    const [z0, z1] = Array.isArray(opts.zone) ? opts.zone : [-Infinity, Infinity];
    const hat = opts.hats && opts.hats[card.unit];
    const alpha = num(opts.alpha, ok ? 0.6 : 0.3);
    const col = ok ? (this.units.pal ? this.units.pal(team) : TEAMS[team]).body : NO;
    const spots = [];
    for (let k = 0; k < n; k++) {
      const lane = n > 1 ? (k % 2 ? 0.75 : 0.25) : 0.5;
      spots.push({ k, x: clamp(x + offs[k] * dir, z0, z1), gy: WORLD.groundY + lane * WORLD.laneDepth, lane });
    }
    spots.sort((a, b) => a.lane - b.lane);
    ctx.save();
    // Landing marks first
    for (const s of spots) {
      ctx.globalAlpha = ok ? 0.55 : 0.4;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(s.x, s.gy + 1, 15, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = ok ? 0.9 : 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of spots) {
      const g = this.settled(card.unit, team, hat, s.k % 3);
      if (!g) continue;
      const { b, u } = g;
      ctx.save();
      // Hover a little above the grass, bobbing: it hasn't dropped yet
      ctx.translate(s.x - u.hip.x, s.gy - u.ground - 6 - Math.sin(t * 4 + s.k) * 3);
      this.units.drawUnitAlpha(ctx, u, b, t, alpha);
      ctx.restore();
    }
    ctx.restore();
  }
}
