// Spells on the field (the Boulder, the Cheese Wheel, Banana Peels, Big
// Sneeze, Shaken Soda, the Anvil, Bubble Wrap), castle cannonballs and Juggler
// bombs, and the aiming helpers the battle UI draws while a card is being
// dragged: the spell circle, the deploy-zone tint, see-through "ghost" beans,
// a building's footprint ghost and the drop markers of a deploy-anywhere card.
//
//   drawSpellsBack(ctx, battle, t);   // ground marks: shadows, target and warning circles (before the units)
//   drawSpells(ctx, battle, t);       // the spells themselves (after the units)
//   spellErrors                       // { last, count }: what they caught (a spell never breaks a frame)
//   drawShots(ctx, battle);           // cannonballs and Juggler bombs in flight (after the units)
//   drawZone(ctx, x0, x1, ok, { team, t, zoom });
//   drawSpellAim(ctx, x, radius, team, ok, t);
//   drawAnywhereMarkers(ctx, xs, team, ok, t, { zoom });
//   const ghosts = new DeployGhosts(unitRenderer);
//   ghosts.draw(ctx, cardId, x, team, { ok, t, zone, hats, level, xs, zoom });
//   const c = aimCheck(match, team, i, x);  // can hand card i go there? (the ghost, the tip
//   aimTip(c);                              //  and the play all read this one answer)
//
// Shared with the card art and the unit renderer: drawBoulderShape,
// drawCheeseWheel, drawCannonball, drawPeel / drawPeelItem (the 'peel' item),
// drawSneezeCloud, drawSodaBottle, drawAnvilShape, drawWrapBubbles, drawJBomb.
//
// ctx is in world space (camera applied). Arrow Rain needs no drawing of its
// own: its arrows are real arrows (UnitRenderer draws them). The peels of
// Banana Peels are items (battle.items, kind 'peel'), drawn with drawPeelItem.

import { WORLD, TEAMS } from '../config.js';
import { CARDS, cardById } from '../sim/cards.js';
import { Battle, DT } from '../sim/battle.js';
import { ANYWHERE } from '../sim/match.js';
import { SPELLS } from '../sim/spells.js';
import { BUILDINGS } from '../sim/buildings.js';
import { drawBuildingGhost } from './buildings.js';

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

/**
 * Shots in flight (battle.shots): cannonballs with a short streak so they read
 * at phone zoom, Juggler bombs ('jbomb') with their fuse spark. t: seconds
 * (spark flicker; defaults to battle.time).
 */
export function drawShots(ctx, battle, t) {
  const shots = battle && battle.shots;
  if (!shots || !shots.length) return;
  const tt = num(t, num(battle.time, 0));
  for (const s of shots) {
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    if (s.kind === 'jbomb') {
      jbombShot(ctx, s, tt);
      continue;
    }
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

// --- New spell timings (sim/spells.js SPELLS, with the contract's starting numbers as fallback) ---

const SPELL = (k) => (SPELLS && SPELLS[k]) || {};
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const lerp = (a, b, t) => a + (b - a) * t;

/** A soft team-colour ellipse on the grass with a turning dashed rim (where a spell lands). */
function groundMark(ctx, x, R, col, fillA, rimA, t, dash = [10, 8], speed = 30) {
  if (fillA <= 0.005 && rimA <= 0.005) return;
  ctx.globalAlpha = fillA;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(x, GROUND, R, clamp(R * 0.2, 8, 24), 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = rimA;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.setLineDash(dash);
  ctx.lineDashOffset = -t * speed;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

// --- Banana Peels ----------------------------------------------------------------------------

const PEEL = { base: '#f5d33b', shade: '#d9ad22', inner: '#fff1a6', tip: '#8a5a1e', used: '#b88a2e', usedShade: '#94681e' };

/** One floppy lobe from its root (bx, by) to its tip (tx, ty), w wide. */
function lobePath(ctx, bx, by, tx, ty, w, bend) {
  const dx = tx - bx;
  const dy = ty - by;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const mx = bx + dx * 0.5 + nx * bend;
  const my = by + dy * 0.5 + ny * bend;
  ctx.moveTo(bx + nx * w * 0.5, by + ny * w * 0.5);
  ctx.quadraticCurveTo(mx + nx * w * 0.6, my + ny * w * 0.6, tx, ty);
  ctx.quadraticCurveTo(mx - nx * w * 0.6, my - ny * w * 0.6, bx - nx * w * 0.5, by - ny * w * 0.5);
  ctx.closePath();
}

const PEEL_SPOTS = [-5, -3, 4, -4.5, 1, -2, -1.2, -9]; // brown spots on a used peel (x, y pairs)
const LOBES = [
  [-1.8, -9, -11, 0.4, 4.6, -3.4], // back left
  [1.8, -9, 11, -0.2, 4.6, 3.4], // back right
  [0.3, -8.5, 2.6, 1.2, 5.6, 1.4], // front, flopped toward us
];

/**
 * A banana peel lying on the ground, its base centre at (x, y): three floppy
 * lobes and a stem nub, chunky with a dark rim (it is ~7 px on a phone).
 * used: the browned, already-slipped-on look. Shared with the card art.
 */
export function drawPeel(ctx, x, y, s = 1, rot = 0, used = false) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const base = used ? PEEL.used : PEEL.base;
  const shade = used ? PEEL.usedShade : PEEL.shade;
  // Ink rim under everything
  ctx.beginPath();
  for (const [bx, by, tx, ty, w, b] of LOBES) lobePath(ctx, bx, by, tx, ty, w, b);
  ctx.moveTo(2.9, -10.5);
  ctx.ellipse(0, -10.5, 2.9, 5.4, 0.12, 0, TAU);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Back lobes (shaded insides showing), the stem, then the front lobe
  for (let i = 0; i < 2; i++) {
    const [bx, by, tx, ty, w, b] = LOBES[i];
    ctx.beginPath();
    lobePath(ctx, bx, by, tx, ty, w, b);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.beginPath();
    lobePath(ctx, bx, by, lerp(bx, tx, 0.75), lerp(by, ty, 0.75), w * 0.45, b * 0.6);
    ctx.fillStyle = used ? '#d8b878' : PEEL.inner;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, -10.5, 2.9, 5.4, 0.12, 0, TAU);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.fillStyle = PEEL.tip;
  ctx.beginPath();
  ctx.ellipse(0.6, -15.2, 1.6, 1.7, 0.12, 0, TAU);
  ctx.fill();
  const [bx, by, tx, ty, w, b] = LOBES[2];
  ctx.beginPath();
  lobePath(ctx, bx, by, tx, ty, w, b);
  ctx.fillStyle = base;
  ctx.fill();
  // Brown tips and a highlight
  ctx.fillStyle = PEEL.tip;
  for (const [, , tx2, ty2] of LOBES) {
    ctx.beginPath();
    ctx.arc(tx2, ty2 - 0.4, 1.5, 0, TAU);
    ctx.fill();
  }
  if (used) {
    ctx.fillStyle = 'rgba(90,56,20,0.55)';
    for (let i = 0; i < PEEL_SPOTS.length; i += 2) {
      ctx.beginPath();
      ctx.arc(PEEL_SPOTS[i], PEEL_SPOTS[i + 1], 0.9, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-0.9, -13);
    ctx.lineTo(-1.3, -8.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A 'peel' item (battle.items): drawn upright on the ground between its two
 * particles, tumbling with them while it flies. The caller applies the item's
 * fade (like the other items); the browned look comes from `it.used`.
 */
export function drawPeelItem(ctx, it) {
  const a = it && it.a;
  const b = it && it.b;
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + num(a.r, 2);
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  if (Math.cos(ang) < 0) ctx.scale(-1, -1);
  drawPeel(ctx, 0, 0, 1.15, 0, !!it.used);
  ctx.restore();
}

/** The toss: where the peels are coming down (a quick ground mark while they fall). */
function peelsBack(ctx, s, t) {
  const k = clamp(1 - (num(s.t, 0) - 0.35) / 0.5, 0, 1);
  if (k <= 0) return;
  const T = TEAMS[s.team] || TEAMS.blue;
  groundMark(ctx, s.x, num(s.radius, 90), T.light, 0.16 * k, 0.75 * k, t, [6, 8]);
}

/** While they fall: little whoosh streaks above the area. */
function peelsFront(ctx, s) {
  const tt = num(s.t, 0);
  const toss = num(SPELL('bananaPeels').toss, 0.4);
  if (tt >= toss) return;
  const R = num(s.radius, 90);
  const k = tt / toss;
  ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const x = s.x - R + (i + 0.5) * (2 * R / 5);
    const y = -260 + 260 * k * k - 20;
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y - 46);
    ctx.stroke();
  }
}

// --- Big Sneeze ------------------------------------------------------------------------------

const SNEEZE = { cloud: '#d8e8c8', shade: '#b4cc9e', rim: '#6f8a5e', nose: '#f29c9c', noseDark: '#d66f74', noseLight: '#ffd3cf' };
const PUFFS = [
  [-22, 4, 14],
  [-8, -8, 17],
  [10, -6, 16],
  [22, 5, 13],
  [2, 9, 15],
  [-14, 12, 11],
  [16, 13, 10],
];

/**
 * The pepper-nose cloud, centre (x, y), facing f (its nose and the blast
 * point that way). inhale (0..1) swells it and squeezes its eyes, blow
 * (0..1) lunges it forward with its eyes screwed shut. Shared with the card art.
 */
export function drawSneezeCloud(ctx, x, y, s = 1, f = 1, inhale = 1, blow = 0) {
  const sw = lerp(0.72, 1.08, clamp(inhale, 0, 1));
  const lunge = blow > 0 ? Math.sin(Math.min(1, blow * 2.2) * Math.PI * 0.5) : 0;
  ctx.save();
  ctx.translate(x + f * (lunge * 7 - inhale * 4) * s, y);
  ctx.scale(f * s * sw * (1 + lunge * 0.12), s * sw * (1 - lunge * 0.1));
  // Rim, then the puffs, then a lit top on each
  ctx.fillStyle = SNEEZE.rim;
  ctx.beginPath();
  for (const [px, py, r] of PUFFS) {
    ctx.moveTo(px + r + 2.2, py);
    ctx.arc(px, py, r + 2.2, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = SNEEZE.shade;
  ctx.beginPath();
  for (const [px, py, r] of PUFFS) {
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = SNEEZE.cloud;
  ctx.beginPath();
  for (const [px, py, r] of PUFFS) {
    ctx.moveTo(px - r * 0.08 + r * 0.84, py - r * 0.18);
    ctx.arc(px - r * 0.08, py - r * 0.18, r * 0.84, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-10, -16, 7, 3.4, -0.3, 0, TAU);
  ctx.fill();
  // Eyes: squinting on the inhale, screwed shut (> <) on the blow
  ctx.strokeStyle = '#3c4a34';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (blow > 0) {
    for (const ex of [4, 14]) {
      ctx.moveTo(ex - 3, -7);
      ctx.lineTo(ex + 1, -4.5);
      ctx.lineTo(ex - 3, -2);
    }
  } else {
    const sq = clamp(inhale, 0, 1);
    for (const ex of [3, 13]) {
      ctx.moveTo(ex - 3.2, -4.5 + sq);
      ctx.quadraticCurveTo(ex, -8 + sq * 2.5, ex + 3.2, -4.5 + sq);
    }
  }
  ctx.stroke();
  // The nose: a big pink bulb sticking out the front, nostril flared on the blow
  const nx = 27 + lunge * 3;
  const ny = 3;
  const nr = 9 + inhale * 1.5;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(nx, ny, nr + 1.8, nr * 0.86 + 1.8, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SNEEZE.nose;
  ctx.beginPath();
  ctx.ellipse(nx, ny, nr, nr * 0.86, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SNEEZE.noseDark;
  ctx.beginPath();
  ctx.ellipse(nx + 1, ny + nr * 0.35, nr * 0.75, nr * 0.38, -0.2, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#5a2a2e';
  ctx.beginPath();
  ctx.ellipse(nx + nr * 0.45, ny + nr * 0.35, 2 + blow * 1.6, 1.3 + blow * 1.2, 0.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SNEEZE.noseLight;
  ctx.beginPath();
  ctx.ellipse(nx - nr * 0.3, ny - nr * 0.38, nr * 0.32, nr * 0.2, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Sneeze timeline from the entity: { inhale, blow, fade } shares. */
function sneezePhase(s) {
  const S = SPELL('bigSneeze');
  const ti = num(S.inhale, 0.4);
  const tt = num(s.t, 0);
  // The blast takes ~0.3 s, then the cloud blows itself away by inhale + 0.5 s (the entity's
  // 'fade'): it never lingers past the entity and never vanishes mid-blow
  const inhale = clamp(tt / ti, 0, 1);
  const blow = tt >= ti ? clamp((tt - ti) / 0.3, 0, 1) : 0;
  const fade = clamp((tt - ti - 0.28) / 0.22, 0, 1);
  return { inhale, blow, fade, ti };
}

function sneezeBack(ctx, s, t) {
  const { inhale, blow, fade } = sneezePhase(s);
  if (fade >= 1) return;
  const T = TEAMS[s.team] || TEAMS.blue;
  const k = (blow > 0 ? 1 : 0.5 + 0.5 * inhale) * (1 - fade);
  groundMark(ctx, s.x, num(s.radius, 140), T.light, 0.12 * k, 0.6 * k, t, [6, 9], 25);
}

function sneezeFront(ctx, s) {
  const { inhale, blow, fade } = sneezePhase(s);
  if (fade >= 1) return;
  const R = num(s.radius, 140);
  const f = s.f < 0 ? -1 : 1;
  const cx = s.x - f * R * 0.78;
  const cy = -84;
  // The blast: wind streaks racing across the circle at every height, and a spray from the nose
  if (blow > 0) {
    const k = 1 - fade;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const y = 6 - i * 17 - hash(5, i) * 8;
      const head = lerp(-0.2, 1.25, clamp(blow * 1.4 - hash(7, i) * 0.3, 0, 1));
      const tail = head - 0.35 - hash(9, i) * 0.25;
      const xa = s.x - f * R + f * 2 * R * clamp(tail, 0, 1);
      const xb = s.x - f * R + f * 2 * R * clamp(head, 0, 1);
      if (Math.abs(xb - xa) < 2) continue;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * k})`;
      ctx.lineWidth = i % 3 ? 3.2 : 5;
      ctx.beginPath();
      ctx.moveTo(xa, y);
      ctx.lineTo(xb, y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(220,240,255,${0.9 * k})`;
    const nx = cx + f * 30;
    for (let i = 0; i < 14; i++) {
      const a = (hash(11, i) - 0.5) * 0.9 + 0.12;
      const d = 10 + blow * (90 + hash(13, i) * 150);
      const r = 1.6 + hash(17, i) * 2.2;
      ctx.beginPath();
      ctx.arc(nx + f * Math.cos(a) * d, cy + 4 + Math.sin(a) * d * 0.8 + blow * blow * 30, r * (1 - fade * 0.6), 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1 - fade;
  drawSneezeCloud(ctx, cx, cy - fade * 20, 1 + fade * 0.25, f, inhale, blow);
  ctx.globalAlpha = 1;
}

// --- Shaken Soda ------------------------------------------------------------------------------

const SODA = { glass: '#3fae5a', dark: '#24773a', light: '#9ee3a6', label: '#e0352b', cap: '#c9d1d9', foam: '#f4ecd8', foamDark: '#d8c3a0' };
const SODA_FIZZ = [-3, -16, 2.6, 2.4, -19, 1.8, 3, -14.6, 1.3]; // the label's three fizz bubbles (x, y, r)

function bottlePath(ctx) {
  ctx.moveTo(-8, -28);
  ctx.quadraticCurveTo(-8, -33, -4, -37);
  ctx.lineTo(-3.4, -43);
  ctx.lineTo(3.4, -43);
  ctx.lineTo(4, -37);
  ctx.quadraticCurveTo(8, -33, 8, -28);
  ctx.lineTo(8, -3);
  ctx.quadraticCurveTo(8, 0, 5, 0);
  ctx.lineTo(-5, 0);
  ctx.quadraticCurveTo(-8, 0, -8, -3);
  ctx.closePath();
}

/**
 * The soda bottle standing on its base centre (x, y): green glass, a red
 * label, a crimped silver cap (capOn), fizz rising inside as it is shaken
 * (shake 0..1, t in seconds). Shared with the card art.
 */
export function drawSodaBottle(ctx, x, y, s = 1, shake = 0, t = 0, capOn = true) {
  const k = clamp(shake, 0, 1);
  ctx.save();
  ctx.translate(x + Math.sin(t * 47) * 2.2 * k * s, y);
  ctx.rotate(Math.sin(t * 39) * 0.13 * k);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  bottlePath(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = SODA.glass;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  bottlePath(ctx);
  ctx.clip();
  // Foam climbing the neck, bubbles rising faster the harder it shakes
  if (k > 0.05) {
    ctx.fillStyle = 'rgba(244,236,216,0.9)';
    ctx.fillRect(-8, -43, 16, 6 + k * 14);
  }
  ctx.fillStyle = 'rgba(230,255,235,0.8)';
  for (let i = 0; i < 9; i++) {
    const ph = (t * (0.6 + 2.4 * k) + hash(21, i)) % 1;
    ctx.beginPath();
    ctx.arc(-5 + hash(23, i) * 10, -2 - ph * 38, 0.8 + hash(29, i) * (0.8 + k), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = SODA.dark;
  ctx.fillRect(4, -40, 4.5, 41);
  ctx.fillStyle = SODA.light;
  ctx.fillRect(-6, -30, 2.2, 27);
  ctx.fillRect(-2.6, -40, 1.4, 6);
  // Label: three white fizz bubbles on red
  ctx.fillStyle = INK;
  ctx.fillRect(-8, -24, 16, 13);
  ctx.fillStyle = SODA.label;
  ctx.fillRect(-8, -23, 16, 11);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < SODA_FIZZ.length; i += 3) {
    ctx.moveTo(SODA_FIZZ[i] + SODA_FIZZ[i + 2], SODA_FIZZ[i + 1]);
    ctx.arc(SODA_FIZZ[i], SODA_FIZZ[i + 1], SODA_FIZZ[i + 2], 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = SODA.label;
  ctx.beginPath();
  ctx.arc(-3.6, -16.6, 0.9, 0, TAU);
  ctx.fill();
  ctx.restore();
  if (capOn) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    rr(ctx, -5.6, -48.5, 11.2, 6.5, 1.5);
    ctx.fill();
    ctx.fillStyle = SODA.cap;
    ctx.beginPath();
    rr(ctx, -4.4, -47.4, 8.8, 4.4, 1);
    ctx.fill();
    ctx.fillStyle = '#8b939c';
    for (let i = -3; i <= 3; i += 2) ctx.fillRect(i - 0.3, -47.4, 0.8, 4.4);
  }
  ctx.restore();
}

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Soda timeline from the entity. */
function sodaPhase(s) {
  const S = SPELL('shakenSoda');
  const fuse = num(S.fuse, 1.2);
  const erupt = num(S.erupt, 0.6);
  const tt = num(s.t, 0);
  const drop = clamp(tt / 0.15, 0, 1);
  const shake = s.state === 'fizz' || tt < fuse ? clamp(num(s.shake, tt / fuse), 0, 1) : 1;
  const et = tt - fuse; // seconds since the pop (< 0 while fizzing)
  return { fuse, erupt, tt, drop, shake, et };
}

function sodaBack(ctx, s, t) {
  const { shake, et, erupt } = sodaPhase(s);
  if (et > erupt + 0.6) return;
  // (the splash mark below soaks away over the same 0.6 s)
  const T = TEAMS[s.team] || TEAMS.blue;
  const R = num(s.radius, 75);
  if (et < 0) {
    // The warning: a circle that pulses harder as the bottle shakes
    const p = 0.35 + 0.65 * shake * (0.6 + 0.4 * Math.abs(Math.sin(t * 14)));
    groundMark(ctx, s.x, R, T.light, 0.12 + 0.14 * p, 0.5 + 0.45 * p, t, [7, 6], 40);
  } else {
    // A wet splash mark that soaks away
    const k = 1 - clamp(et / (erupt + 0.6), 0, 1);
    ctx.globalAlpha = 0.45 * k;
    ctx.fillStyle = SODA.foamDark;
    ctx.beginPath();
    ctx.ellipse(s.x, GROUND, R * 0.8, clamp(R * 0.16, 8, 16), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

const FOAM_N = 21; // the geyser's foam balls: 9 in the crown, 12 spilling
const FOAM = new Float64Array(FOAM_N * 3); // their x, y, r, refilled every frame
/** The geyser column's half width at u (0 = the bottle, 1 = the top). */
const geyserHalf = (w, u) => w * (0.22 + 0.7 * u ** 1.3);
/** x of the column's wobbling edge on `side` (-1 left, 1 right) at u. */
function geyserEdge(x, w, t, side, u) {
  const wob = Math.sin(u * 11 - t * 28 + side * 1.7) * 2.4 * (0.3 + u) + Math.sin(u * 5 + t * 19) * 1.4;
  return x + side * (geyserHalf(w, u) + wob);
}

/**
 * The foam geyser, h tall from the bottle's mouth (x, y): a wobbly column
 * flaring out like a fountain, a frothy crown and foam spilling down both sides.
 */
function drawGeyser(ctx, x, y, h, w, t, k) {
  if (h < 2) return;
  const top = y - h;
  const N = 12;
  // Crown: a low arch of foam balls; spill: blobs arcing out and down both sides
  // (x, y, r triples in a reused buffer: no arrays per frame)
  const F = FOAM;
  for (let i = 0; i < 9; i++) {
    const u = i / 8 - 0.5;
    const r = w * (0.42 + 0.18 * (1 - Math.abs(u) * 2) + 0.1 * hash(31, i)) * (0.92 + 0.08 * Math.sin(t * 17 + i * 1.3));
    F[i * 3] = x + u * w * 2.1 + Math.sin(t * 9 + i) * 1.2;
    F[i * 3 + 1] = top + (u * 2) ** 2 * w * 0.45 - hash(43, i) * w * 0.2;
    F[i * 3 + 2] = r;
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const ph = (t * 1.5 + hash(73, i)) % 1;
    const j = (9 + i) * 3;
    F[j] = x + side * (w * 0.9 + ph * w * (1.8 + hash(79, i)));
    F[j + 1] = top - w * 0.3 + ph * ph * Math.min(h, 220) * 0.55 - ph * (1 - ph) * w * 1.6;
    F[j + 2] = w * (0.3 - 0.16 * ph) * (0.8 + 0.4 * hash(83, i));
  }
  for (let layer = 0; layer < 3; layer++) {
    const o = layer === 0 ? 2.2 : 0;
    ctx.fillStyle = layer === 0 ? INK : layer === 1 ? SODA.foamDark : SODA.foam;
    const dx = layer === 2 ? -1.4 : 0;
    const dy = layer === 2 ? -1.6 : 0;
    const sk = layer === 2 ? 0.84 : 1;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) ctx.lineTo(geyserEdge(x, w, t, -1, i / N) - o + dx, lerp(y, top, i / N));
    for (let i = N; i >= 0; i--) ctx.lineTo(x + (geyserEdge(x, w, t, 1, i / N) - x) * sk + o + dx, lerp(y, top, i / N));
    ctx.closePath();
    for (let j = 0; j < FOAM_N * 3; j += 3) {
      const r = F[j + 2];
      ctx.moveTo(F[j] + dx + r * sk + o, F[j + 1] + dy);
      ctx.arc(F[j] + dx, F[j + 1] + dy, r * sk + o, 0, TAU);
    }
    ctx.fill();
  }
  // Bubbles rising through the foam, and a highlight on the crown
  ctx.globalAlpha = 0.9 * k;
  ctx.strokeStyle = SODA.foamDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const u = (t * 2.2 + hash(47, i)) % 1;
    const bx = x + (hash(53, i) - 0.5) * geyserHalf(w, u) * 1.3;
    const by = lerp(y, top, u);
    const r = 1.2 + hash(59, i) * 2;
    ctx.moveTo(bx + r, by);
    ctx.arc(bx, by, r, 0, TAU);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let j = 2 * 3; j < 7 * 3; j += 3) {
    const hx = F[j];
    const hy = F[j + 1];
    const r = F[j + 2];
    ctx.moveTo(hx - r * 0.3 + r * 0.25, hy - r * 0.35);
    ctx.arc(hx - r * 0.3, hy - r * 0.35, r * 0.25, 0, TAU);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function sodaFront(ctx, s, t) {
  const { erupt, drop, shake, et, tt } = sodaPhase(s);
  if (et > erupt + 0.6) return;
  const by = GROUND + 6; // planted a little into the dirt
  const fall = (1 - drop) * (1 - drop);
  // The empty bottle fades out over the entity's 'fade' (it is gone 0.6 s after the geyser at most)
  const fade = clamp((et - erupt + 0.1) / 0.5, 0, 1);
  const R = num(s.radius, 75);
  if (et >= 0 && et < erupt) {
    // WHOOSH: the column shoots up, holds, then drops back into the bottle before the eruption ends
    const grow = easeOut(clamp(et / 0.12, 0, 1));
    const fallBack = clamp((et - (erupt - 0.22)) / 0.22, 0, 1);
    const h = 300 * grow * (1 - fallBack * fallBack);
    drawGeyser(ctx, s.x, by - 42, h, clamp(R * 0.3, 14, 30), t, 1 - fallBack);
    // (the cap flies off as an effect: fx 'sodaErupt')
  }
  ctx.globalAlpha = 1 - fade;
  drawSodaBottle(ctx, s.x, by - fall * 140, 1, et < 0 ? shake : 0, tt, et < 0);
  ctx.globalAlpha = 1;
  // Fizz spitting out round the cap just before the pop
  if (et < 0 && shake > 0.45) {
    ctx.fillStyle = 'rgba(244,236,216,0.95)';
    for (let i = 0; i < 6; i++) {
      const ph = (tt * 3.2 + hash(37, i)) % 1;
      const a = -Math.PI / 2 + (hash(41, i) - 0.5) * 1.6;
      const d = 6 + ph * 22 * shake;
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(a) * d, by - 50 + Math.sin(a) * d, 1.6 * (1 - ph) + 0.6, 0, TAU);
      ctx.fill();
    }
  }
}

// --- The Anvil --------------------------------------------------------------------------------

const ANVIL = { iron: '#4a4f57', light: '#8a919b', dark: '#30343a' };

function anvilPath(ctx) {
  // Horn to the right (+x), heel to the left; centre at (0, 0), feet on y = 17
  ctx.moveTo(-17, -17);
  ctx.lineTo(12, -17);
  ctx.quadraticCurveTo(22, -16.5, 26, -13);
  ctx.quadraticCurveTo(19, -9, 11, -8.5);
  ctx.lineTo(8, -8);
  ctx.quadraticCurveTo(6, -1, 7, 4);
  ctx.lineTo(15, 8);
  ctx.lineTo(17, 17);
  ctx.lineTo(3, 17);
  ctx.lineTo(1.5, 14);
  ctx.lineTo(-1.5, 14);
  ctx.lineTo(-3, 17);
  ctx.lineTo(-17, 17);
  ctx.lineTo(-15, 8);
  ctx.lineTo(-7, 4);
  ctx.quadraticCurveTo(-6, -1, -9, -8);
  ctx.lineTo(-17, -9);
  ctx.closePath();
}

/**
 * The classic anvil, centre (x, y), horn toward f; s = 1 is r 18 (about 43 px
 * horn to heel, 34 px tall). Dark iron with a lit face. Shared with the card art.
 */
export function drawAnvilShape(ctx, x, y, s = 1, f = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((f < 0 ? -1 : 1) * s, s);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  anvilPath(ctx);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = ANVIL.iron;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  anvilPath(ctx);
  ctx.clip();
  // Lit top face, shaded underside of the horn and the waist
  ctx.fillStyle = ANVIL.light;
  ctx.fillRect(-18, -17.5, 46, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-15, -16.6, 22, 1.2);
  ctx.fillStyle = ANVIL.dark;
  ctx.fillRect(-18, -9.5, 46, 2);
  ctx.fillRect(-18, 8, 36, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-17, -8, 5, 24);
  ctx.restore();
  ctx.restore();
}

/** Anvil timeline from the entity. */
function anvilPhase(s) {
  const S = SPELL('anvil');
  const fall = num(S.fall, 0.9);
  const tt = num(s.t, 0);
  return { fall, tt, k: clamp(tt / fall, 0, 1), since: tt - fall };
}

function anvilBack(ctx, s, t) {
  const { k, since } = anvilPhase(s);
  const a = clamp(num(s.alpha, 1), 0, 1);
  if (a <= 0.01) return;
  const r = num(s.r, 18);
  if (s.state !== 'rest' && since < 0) {
    // The shadow grows and darkens the whole way down; a danger ring marks the column
    const R = num(s.radius, 34);
    const T = TEAMS[s.team] || TEAMS.blue;
    ctx.globalAlpha = 0.25 + 0.6 * k;
    ctx.strokeStyle = T.light;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.ellipse(s.x, GROUND, R + 10, 6 + R * 0.12, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.15 + 0.5 * k * k;
    ctx.fillStyle = '#16200c';
    ctx.beginPath();
    ctx.ellipse(s.x, GROUND + 1, r * (0.4 + 1.1 * k), 2 + 4.5 * k, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.globalAlpha = 0.4 * a;
  ctx.fillStyle = '#16200c';
  ctx.beginPath();
  ctx.ellipse(s.x + 2, GROUND + 1.5, r * 1.45, 5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function anvilFront(ctx, s) {
  const { since } = anvilPhase(s);
  const a = clamp(num(s.alpha, 1), 0, 1);
  if (a <= 0.01) return;
  const r = num(s.r, 18);
  const sc = r / 18;
  const f = s.f < 0 ? -1 : 1;
  if (s.state !== 'rest' && since < 0) {
    // Falling: speed lines streaming above it
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.lineWidth = 3 - Math.abs(i);
      ctx.beginPath();
      ctx.moveTo(s.x + i * r * 0.7, s.y - r * 1.2);
      ctx.lineTo(s.x + i * r * 0.7, s.y - r * (3.2 + (1 - Math.abs(i))));
      ctx.stroke();
    }
    drawAnvilShape(ctx, s.x, s.y, sc, f);
    return;
  }
  // Landed: a squash on impact, then it just sits there, smug, until it fades
  const q = since >= 0 && since < 0.22 ? Math.sin((since / 0.22) * Math.PI) * 0.18 : 0;
  ctx.globalAlpha = a;
  ctx.save();
  ctx.translate(s.x, s.y + 17 * sc);
  ctx.scale(1 + q, 1 - q);
  drawAnvilShape(ctx, 0, -17 * sc, sc, f);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --- Bubble Wrap ----------------------------------------------------------------------------------

const WRAP = { sheet: '#dff4ff', rim: '#ffffff', bubble: '#a9d8f2' };

/** Paint a bubble-wrap sheet centred at (0, 0) at full strength (cached by drawWrapBubbles). */
function paintWrap(ctx, rx, ry, frac, seed) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = WRAP.sheet;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = WRAP.rim;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.clip();
  // Bubbles on a staggered grid, each kept while its hash is under frac
  const d = 8.5;
  const br = 3.3;
  const pts = [];
  let i = 0;
  for (let gy = -ry + d * 0.5; gy < ry; gy += d * 0.87) {
    const row = Math.round((gy + ry) / (d * 0.87));
    for (let gx = -rx + (row % 2 ? d * 0.5 : 0); gx < rx + d * 0.5; gx += d) {
      const keep = hash(seed, i++) < frac;
      if (!keep || (gx / rx) ** 2 + (gy / ry) ** 2 > 1.05) continue;
      pts.push(gx, gy);
    }
  }
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 2) {
    ctx.moveTo(pts[k] + br, pts[k + 1]);
    ctx.arc(pts[k], pts[k + 1], br, 0, TAU);
  }
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = WRAP.bubble;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let k = 0; k < pts.length; k += 2) {
    ctx.moveTo(pts[k] - br * 0.35 + 1.1, pts[k + 1] - br * 0.4);
    ctx.arc(pts[k] - br * 0.35, pts[k + 1] - br * 0.4, 1.1, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}

const wrapCache = new Map(); // size|share|seed|scale -> canvas

/**
 * A bubble-wrap sheet over an ellipse (centre x, y; radii rx, ry; turned by
 * rot): a translucent film with a grid of round bubbles. frac (0..1) is the
 * share still unpopped (wrapHp / wrapMax): bubbles vanish as it drops. The
 * sheet is cached per size, share (tenths) and zoom step, so a wrapped crowd
 * costs a drawImage a bean. Shared with the unit renderer (the wrap overlay)
 * and the card art.
 */
export function drawWrapBubbles(ctx, x, y, rx, ry, frac = 1, rot = 0, seed = 1, alpha = 1) {
  if (!(rx > 0) || !(ry > 0) || alpha <= 0.01 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const qx = Math.max(3, Math.round(rx));
  const qy = Math.max(3, Math.round(ry));
  const qf = Math.round(clamp(num(frac, 1), 0, 1) * 10) / 10;
  const m = ctx.getTransform ? ctx.getTransform() : null;
  const need = clamp((m && Math.hypot(m.a, m.b)) || 1, 0.25, 6);
  const qs = Math.SQRT2 ** Math.ceil(Math.log(need) / Math.log(Math.SQRT2) - 1e-6);
  const sd = Math.abs(seed | 0) % 6;
  const key = `${qx}|${qy}|${qf}|${sd}|${qs.toFixed(3)}`;
  let cv = wrapCache.get(key);
  if (!cv && typeof document !== 'undefined') {
    cv = document.createElement('canvas');
    cv.width = Math.ceil((2 * qx + 6) * qs);
    cv.height = Math.ceil((2 * qy + 6) * qs);
    const g = cv.getContext('2d');
    g.setTransform(qs, 0, 0, qs, (qx + 3) * qs, (qy + 3) * qs);
    paintWrap(g, qx, qy, qf, sd + 1);
    if (wrapCache.size > 160) wrapCache.clear();
    wrapCache.set(key, cv);
  }
  const base = ctx.globalAlpha;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.globalAlpha = base * alpha;
  if (cv) ctx.drawImage(cv, -qx - 3, -qy - 3, 2 * qx + 6, 2 * qy + 6);
  else paintWrap(ctx, qx, qy, qf, sd + 1);
  ctx.restore();
  ctx.globalAlpha = base;
}

/** The ellipse a wrap hugs on a bean: centre, radii and tilt from hip to head. */
export function wrapFrame(u) {
  const hx = u.hip.x;
  const hy = u.hip.y;
  const ax = u.head.x - hx;
  const ay = u.head.y - hy;
  const L = Math.hypot(ax, ay) || 1;
  const R = num(u.R, 14);
  return { x: hx + ax * 0.5, y: hy + ay * 0.5 + 4, rx: R * 1.45, ry: L * 0.5 + R * 1.25, rot: Math.atan2(ax, -ay) };
}

function wrapBack(ctx, s) {
  const tt = num(s.t, 0);
  const k = clamp(tt / 0.5, 0, 1);
  if (k >= 1) return;
  const T = TEAMS[s.team] || TEAMS.blue;
  const R = num(s.radius, 120) * (0.4 + 0.6 * easeOut(k));
  ctx.globalAlpha = 0.5 * (1 - k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(s.x, GROUND, R, clamp(R * 0.2, 8, 24), 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.25 * (1 - k);
  ctx.fillStyle = T.light;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The puff: every own bean in the circle gets a sheet that pops on (0.5 s). */
function wrapFront(ctx, s, battle) {
  const tt = num(s.t, 0);
  if (tt >= 0.5) return;
  const R = num(s.radius, 120);
  const pop = easeBack(clamp(tt / 0.2, 0, 1));
  const a = 1 - clamp((tt - 0.3) / 0.2, 0, 1) * 0.6;
  for (const u of (battle && battle.units) || []) {
    if (!u || !u.alive || u.gone || u.team !== s.team || !u.hip || !u.head) continue;
    if (Math.abs(u.hip.x - s.x) > R + num(u.R, 14) * 0.5) continue;
    if (typeof u.wrapHp === 'number' && u.wrapHp <= 0 && tt > 0.05) continue;
    const w = wrapFrame(u);
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(pop, pop);
    drawWrapBubbles(ctx, 0, 0, w.rx, w.ry, 1, w.rot, (num(u.id, 1) * 7) | 0, a);
    ctx.restore();
  }
}

// --- Juggler bombs --------------------------------------------------------------------------------

/**
 * A small black bomb (Juggler), centre (x, y), radius r, spun by rot, with a
 * fuse and a spark. lit (0..1): the last moments before it bursts (a red
 * glow pulsing faster). Shared with the unit renderer (the juggling loop).
 */
export function drawJBomb(ctx, x, y, r = 6, rot = 0, lit = 0, t = 0) {
  if (lit > 0) {
    const p = 0.5 + 0.5 * Math.sin(t * (14 + 30 * lit));
    ctx.fillStyle = `rgba(255,80,40,${(0.25 + 0.4 * lit) * p})`;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.7 + 0.4 * p), 0, TAU);
    ctx.fill();
  }
  const fx = x + Math.sin(rot) * r * 1.55;
  const fy = y - Math.cos(rot) * r * 1.55;
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = Math.max(1, r * 0.25);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + Math.sin(rot) * r * 0.8, y - Math.cos(rot) * r * 0.8);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = lit > 0.6 && Math.sin(t * 40) > 0 ? '#5a2a26' : '#26262b';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#8a919b';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU);
  ctx.fill();
  // Spark: a flickering orange star on the fuse
  const fl = 0.75 + 0.25 * Math.sin(t * 50 + x);
  const sr = r * 0.75 * fl;
  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t * 9;
    const rr2 = i % 2 ? sr * 0.4 : sr;
    if (i === 0) ctx.moveTo(fx + Math.cos(a) * rr2, fy + Math.sin(a) * rr2);
    else ctx.lineTo(fx + Math.cos(a) * rr2, fy + Math.sin(a) * rr2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  ctx.arc(fx, fy, sr * 0.35, 0, TAU);
  ctx.fill();
}

function jbombShot(ctx, s, t) {
  const r = num(s.r, 6);
  const sp = Math.hypot(num(s.vx, 0), num(s.vy, 0));
  if (sp > 150) {
    const ux = s.vx / sp;
    const uy = s.vy / sp;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = r * 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x - ux * r * 1.3, s.y - uy * r * 1.3);
    ctx.lineTo(s.x - ux * r * 3.4, s.y - uy * r * 3.4);
    ctx.stroke();
  }
  const fuse = num(s.X && s.X.fuse, 0.6);
  const ft = num(s.fuseT, -1);
  const lit = ft >= 0 ? clamp(1 - ft / Math.max(0.05, fuse), 0.05, 1) : 0;
  drawJBomb(ctx, s.x, s.y, r, num(s.age, 0) * 11 * (Math.sign(num(s.vx, 1)) || 1), lit, t);
}

// --- Deploy-anywhere markers -------------------------------------------------------------------------

/** A tiny striped umbrella (the marker icon, not the unit's prop). */
function umbrellaIcon(ctx, x, y, w, T) {
  const r = w / 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + r * 1.1);
  ctx.arc(x - r * 0.18, y + r * 1.1, r * 0.18, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.arc(x, y, r, Math.PI, TAU);
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : T.body;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.02);
    ctx.arc(x, y, r, Math.PI + (i / 4) * Math.PI, Math.PI + ((i + 1) / 4) * Math.PI);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Where a deploy-anywhere card's beans will come down: a target on the grass
 * at each x, a dashed drop line and a little umbrella high above it.
 * opts: { zoom, T (palette), height (world px the drop starts from) }.
 */
export function drawAnywhereMarkers(ctx, xs, team = 'blue', ok = true, t = 0, opts = {}) {
  if (!Array.isArray(xs) || !xs.length) return;
  const T = opts.T || TEAMS[team] || TEAMS.blue;
  const col = ok ? T.body : NO;
  const px = 1 / clamp(num(opts.zoom, 1), 0.2, 4);
  const top = -num(opts.height, 330);
  ctx.save();
  xs.forEach((x, i) => {
    if (!Number.isFinite(x)) return;
    // Target on the grass
    ctx.globalAlpha = ok ? 0.5 : 0.35;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, GROUND, 20, 6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = ok ? 0.95 : 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, 1.6 * px);
    ctx.beginPath();
    ctx.ellipse(x, GROUND, 20, 6, 0, 0, TAU);
    ctx.moveTo(x + 9, GROUND);
    ctx.ellipse(x, GROUND, 9, 2.8, 0, 0, TAU);
    ctx.stroke();
    // Drop line, dashes falling toward the target
    ctx.globalAlpha = ok ? 0.8 : 0.45;
    ctx.lineWidth = Math.max(1.8, 1.5 * px);
    ctx.setLineDash([8 * px + 3, 7 * px + 3]);
    ctx.lineDashOffset = -t * 60;
    ctx.beginPath();
    ctx.moveTo(x, top + 26);
    ctx.lineTo(x, GROUND - 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x - 6, GROUND - 22);
    ctx.lineTo(x, GROUND - 13);
    ctx.lineTo(x + 6, GROUND - 22);
    ctx.stroke();
    // The umbrella it floats down under, swaying
    ctx.globalAlpha = ok ? 0.9 : 0.5;
    ctx.save();
    ctx.translate(x + Math.sin(t * 1.7 + i) * 4, top + Math.sin(t * 2.3 + i * 1.3) * 3);
    ctx.rotate(Math.sin(t * 1.7 + i) * 0.12);
    umbrellaIcon(ctx, 0, 0, 30, ok ? T : { body: NO });
    ctx.restore();
  });
  ctx.restore();
}

// --- Spell entities ------------------------------------------------------------------------

/**
 * What the spells' drawing threw: { last, count }. Each error is caught (a spell's look
 * must never break a frame) and kept here, for debugging and for the tests.
 */
export const spellErrors = { last: null, count: 0 };
function spellFailed(e) {
  spellErrors.last = e;
  spellErrors.count++;
}

/**
 * Ground marks under the spells: boulder and anvil shadows, target and warning
 * circles, the wheel's shadow, the soda's splash. Before the units.
 */
export function drawSpellsBack(ctx, battle, t = 0) {
  const list = battle && battle.spells;
  if (!list || !list.length) return;
  ctx.save();
  for (const s of list) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    try {
      if (s.kind === 'boulder') boulderBack(ctx, s, t);
      else if (s.kind === 'wheel') wheelBack(ctx, s);
      else if (s.kind === 'arrowRain') rainBack(ctx, s, t);
      else if (s.kind === 'peels') peelsBack(ctx, s, t);
      else if (s.kind === 'sneeze') sneezeBack(ctx, s, t);
      else if (s.kind === 'soda') sodaBack(ctx, s, t);
      else if (s.kind === 'anvil') anvilBack(ctx, s, t);
      else if (s.kind === 'wrap') wrapBack(ctx, s);
    } catch (e) {
      spellFailed(e); // (a spell's look must never break a frame)
    }
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

/** The spells themselves. After the units (they land on, roll through and blow over them). */
export function drawSpells(ctx, battle, t = 0) {
  const list = battle && battle.spells;
  if (!list || !list.length) return;
  ctx.save();
  for (const s of list) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    try {
      if (s.kind === 'boulder') boulderFront(ctx, s);
      else if (s.kind === 'wheel') wheelFront(ctx, s, t);
      else if (s.kind === 'peels') peelsFront(ctx, s);
      else if (s.kind === 'sneeze') sneezeFront(ctx, s);
      else if (s.kind === 'soda') sodaFront(ctx, s, t);
      else if (s.kind === 'anvil') anvilFront(ctx, s);
      else if (s.kind === 'wrap') wrapFront(ctx, s, battle);
    } catch (e) {
      spellFailed(e); // (a spell's look must never break a frame)
    }
    ctx.globalAlpha = 1;
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
  // Lines keep their width on screen (a phone frames the whole field at ~0.45 zoom)
  const px = 1 / clamp(num(opts.zoom, 1), 0.2, 4);
  ctx.save();
  ctx.globalAlpha = (ok ? 0.4 : 0.2) * k;
  ctx.fillStyle = col;
  ctx.fillRect(x0, top, x1 - x0, front - top);
  const g = ctx.createLinearGradient(0, top - H, 0, top);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, (ok ? 0.3 : 0.14) * k));
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
  if (ok) {
    // Your side: a bright outline along the grass and solid edges (with a dark under-stroke to read on light grass)
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x1, top);
    for (const x of [x0, x1]) {
      ctx.moveTo(x, front);
      ctx.lineTo(x, top - H * 0.55);
    }
    ctx.globalAlpha = 0.3 * k;
    ctx.strokeStyle = '#10243f';
    ctx.lineWidth = 5 * px;
    ctx.stroke();
    ctx.globalAlpha = 0.95 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * px;
    ctx.stroke();
  }
  ctx.globalAlpha = (ok ? 0.85 : 0.5) * k;
  ctx.strokeStyle = ok ? '#ffffff' : NO;
  ctx.lineWidth = Math.max(2.5, 2 * px);
  ctx.setLineDash([9 * px, 8 * px]);
  ctx.lineDashOffset = -t * 14 * px;
  ctx.beginPath();
  for (const x of [x0, x1]) {
    ctx.moveTo(x, top - H * 0.55);
    ctx.lineTo(x, top - H * 0.85);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Banana Peels' aim: five peel icons spread across the circle. */
function peelIcons(ctx, x, R, ok, t) {
  ctx.save();
  ctx.globalAlpha = ok ? 0.9 : 0.45;
  for (let i = 0; i < 5; i++) {
    const px = x - R + (i + 0.5) * ((2 * R) / 5);
    drawPeel(ctx, px, GROUND + 2 - Math.abs(Math.sin(t * 3 + i)) * 3, 1.3, 0, !ok);
  }
  ctx.restore();
}

/**
 * The Anvil's aim: its circle is small at phone zoom, so a see-through anvil
 * hangs over it with a dashed drop line running down to the ring.
 */
function anvilMark(ctx, x, ok, t) {
  const y = GROUND - 150 - Math.sin(t * 3) * 4;
  ctx.save();
  ctx.globalAlpha = ok ? 0.8 : 0.45;
  ctx.strokeStyle = ok ? '#ffffff' : NO;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([8, 8]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  ctx.moveTo(x, y + 22);
  ctx.lineTo(x, GROUND - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = ok ? 0.6 : 0.3;
  drawAnvilShape(ctx, x, y, 1.1, 1);
  ctx.restore();
}

/** Shaken Soda's aim: the see-through bottle that will stand in the middle. */
function sodaMark(ctx, x, ok, t) {
  ctx.save();
  ctx.globalAlpha = ok ? 0.6 : 0.3;
  drawSodaBottle(ctx, x, GROUND - 1, 0.9, 0.35, t, true);
  ctx.restore();
}

// --- the aim: where a dragged card goes, and whether it can --------------------------------

export const ZONE_SNAP = 40; // world px: a unit card or building released this close outside its zone snaps in

/**
 * Can `team` play hand card i of Match m at world x? { id, card, x (snapped), ok, why, inZone, missing }.
 * Unit cards drop in the unit zone, buildings go up in your own half (never the pocket),
 * deploy-anywhere cards float down anywhere in ANYWHERE, spells go anywhere. ok is exactly
 * m.canPlay at x (so m.play(team, i, x) works when it is true); inZone says x is in the card's
 * zone, or for a building that it fits there (fitBuilding slides it in from up to BUILD_SNAP away).
 */
export function aimCheck(m, team, i, wx) {
  const side = m.sides[team];
  const id = side.hand[i];
  const card = cardById(id);
  const missing = card ? Math.max(0, card.mana - side.mana) : 0;
  if (!card || !Number.isFinite(wx)) return { id, card, x: wx, ok: false, why: card ? 'zone' : 'card', inZone: false, missing };
  let x = wx;
  let inZone = true;
  if ((card.kind === 'unit' && !card.anywhere) || card.kind === 'building') {
    const [z0, z1] = card.kind === 'building' ? m.buildZone(team) : m.zone(team);
    if (x < z0 && x > z0 - ZONE_SNAP) x = z0 + 1;
    if (x > z1 && x < z1 + ZONE_SNAP) x = z1 - 1;
    inZone = x >= z0 && x <= z1;
  } else if (card.anywhere) x = Math.min(ANYWHERE[1], Math.max(ANYWHERE[0], x));
  else x = Math.min(WORLD.width, Math.max(0, x));
  const why = m.canPlay(team, i, x);
  if (card.kind === 'building' && why === '') inZone = true; // (it goes up where it fits: on your side)
  return { id, card, x, ok: why === '', why, inZone, missing };
}

/** Why an aim can't be played, in words for the tip ('' when it can: never a red tip on a card that plays). */
export function aimTip(c) {
  if (!c.card || c.ok) return '';
  const building = c.card.kind === 'building';
  if (!c.inZone) return building ? 'Build on your side' : 'Play units on your side';
  if (c.why === 'mana') return `Not enough mana: need ${Math.ceil(c.missing - 1e-6)} more 💧`;
  if (building && c.why === 'zone') return 'No room to build here';
  return '';
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
    this.sprites = new Map(); // building ghost sprites
  }

  /** A settled unit to trace: { b, u } (cached per type, team, hat, slot). */
  settled(typeId, team, hat, slot, level = 1) {
    const key = `${typeId}|${team}|${hat || ''}|${slot}|${level}`;
    let g = this.cache.get(key);
    if (g) return g;
    const b = new Battle(3 + slot);
    if (hat && hat !== 'none') b.hats[team] = { [typeId]: hat };
    let u = null;
    try {
      u = b.addUnit(typeId, team, 0, 0.5, 99 + slot * 17, { level });
    } catch (e) {
      u = null; // a unit type the sim doesn't know (yet): no ghost bean, just the marks
    }
    if (!u) return null;
    for (let i = 0; i < 90; i++) b.step(DT);
    g = { b, u };
    if (this.cache.size > 60) this.cache.clear();
    this.cache.set(key, g);
    return g;
  }

  /**
   * opts: { ok (playable here, default true), t (seconds), zone: [x0, x1] to
   * keep the beans inside, hats: { unitTypeId: hatId }, alpha, zoom, xs }.
   * xs: the x of each bean as Match.formation() gives them (anywhere cards are
   * nudged out of towers), or [fitX] / [] for a building card ([] = no legal
   * spot, drawn red at x).
   */
  draw(ctx, cardId, x, team = 'blue', opts = {}) {
    const card = CARDS[cardId];
    if (!card || !Number.isFinite(x)) return;
    const ok = opts.ok !== false;
    const t = num(opts.t, 0);
    const pal = this.units && this.units.pal ? this.units.pal(team) : TEAMS[team] || TEAMS.blue;
    if (card.kind === 'spell') {
      drawSpellAim(ctx, x, card.radius, team, ok, t);
      if (card.spell === 'bananaPeels') peelIcons(ctx, x, num(card.radius, 90), ok, t);
      else if (card.spell === 'anvil') anvilMark(ctx, x, ok, t);
      else if (card.spell === 'shakenSoda') sodaMark(ctx, x, ok, t);
      return;
    }
    if (card.kind === 'building') {
      const xs = Array.isArray(opts.xs) ? opts.xs : null;
      const legal = ok && (!xs || (xs.length > 0 && Number.isFinite(xs[0])));
      // (the sim's numbers: the crane's wake-up ticks, the glove's reach)
      drawBuildingGhost(ctx, card.building, legal && xs ? xs[0] : x, team, legal, t, { T: pal, def: BUILDINGS[card.building], zoom: opts.zoom, cache: this.sprites });
      return;
    }
    const n = card.count || 1;
    const offs = card.spread && card.spread.length >= n ? card.spread : Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * 24);
    const dir = team === 'red' ? -1 : 1;
    const [z0, z1] = Array.isArray(opts.zone) ? opts.zone : [-Infinity, Infinity];
    const hat = opts.hats && opts.hats[card.unit];
    const alpha = num(opts.alpha, ok ? 0.6 : 0.3);
    const col = ok ? pal.body : NO;
    const given = Array.isArray(opts.xs) && opts.xs.length === n ? opts.xs : null;
    const spots = [];
    for (let k = 0; k < n; k++) {
      const lane = n > 1 ? (k % 2 ? 0.75 : 0.25) : 0.5;
      const sx = given ? given[k] : card.anywhere ? clamp(x + offs[k] * dir, 40, 1460) : clamp(x + offs[k] * dir, z0, z1);
      spots.push({ k, x: sx, gy: WORLD.groundY + lane * WORLD.laneDepth, lane });
    }
    spots.sort((a, b) => a.lane - b.lane);
    ctx.save();
    if (card.anywhere) drawAnywhereMarkers(ctx, spots.map((s) => s.x), team, ok, t, { zoom: opts.zoom, T: pal });
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
