// Arena buildings (a Tower with kind 'building', drawn through towers.js):
// the Boing Box (a gift box with a boxing glove on a spring), the Bean Patch
// (a planter box that pops Sprouts) and the Wrecking Crane (a lattice mast, a
// jib, a chain and an iron ball). Each drops in as a crate (the patch as a
// clod of dirt), wilts as it ages and collapses into planks when it goes down.
//
//   const bld = createBuildingRenderer({ seed });      // towers.js owns one
//   bld.draw(ctx, building, t, T, need, frame, battle); // world space, base on y = 0 (battle: optional)
//   bld.artTop(building);                               // world y of the top of its art
//   drawBuildingArt(ctx, bid, x, y, s, team, pose);     // card faces: the full-health pose
//   drawBuildingGhost(ctx, bid, x, team, ok, t, opts);  // aiming: footprint, reach, see-through art
//   drawCraneBall(ctx, x, y, r, rot);                   // the ball (also the 'craneBall' item)
//   drawGlove(ctx, x, y, dir, s);                       // the boxing glove
//
// Only plain building fields are read (contract 3.3 / 6.3): bid, def, team, x,
// w, h, f, hp, maxHp, alive, age, landT, hitT, downT, punch { phase, t, ext,
// dir }, spawn { next, kids }, ball { ang, x, y, vx, vy }. Missing ones fall
// back to BUILDING_LOOK (the sim's numbers).
//
// The bodies live in offscreen caches (per building kind, team colour, wilt
// stage and damage stage); the moving parts (lid, glove, spring, tufts,
// chain, ball) are a few vector shapes a frame.

import { TEAMS, WORLD } from '../config.js';
import { Cached, WOOD, mix, mulberry32, rgba } from './background.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (Number.isFinite(v) ? v : d);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const INK = '#2a1d14';

/** Seconds of the crate drop (contract 3.3: landT 0 -> 0.35, then buildingLand). */
export const LAND_T = 0.35;
const DROP_H = 300; // it falls from this high
const FLASH_T = 0.14;
const SHAKE_T = 0.2;
const DOWN_FADE = [1.8, 3]; // the wreck fades out between these downT (reap() at 3 s)

/** Wilt stage for a share of life used: fresh, tired (bow sags, rust spots), wilted. */
const wiltStage = (w) => (w < 0.42 ? 0 : w < 0.74 ? 1 : 2);

/**
 * Fallback looks, used when a building carries no `def` (fake states, card
 * art): the sim's numbers (sim/buildings.js BUILDINGS; a test keeps them the
 * same). The aim ghost passes the sim's def. `top`: art above h.
 */
export const BUILDING_LOOK = {
  boingBox: { w: 46, h: 46, life: 28, arm: 1, top: 16, punch: { reach: 90 } },
  beanPatch: { w: 64, h: 40, life: 24, arm: 1, top: 14, spawn: { every: 3, max: 3 } },
  wreckingCrane: {
    w: 36, h: 170, life: 36, arm: 1, top: 30,
    pendulum: { pivotUp: 170, pivotFwd: 34, L: 125, r: 20, sense: 230, maxAng: 1.2, minHit: 260 },
  },
};

const GLOVE = { base: '#e0352b', light: '#ff7a6c', shade: '#a8231b', cuff: '#f7f3ea' };
const SPRING = { base: '#c9d1d9', dark: '#5a626c', light: '#f4f7fa' };
const LEAF = { base: '#5fbf3a', dark: '#2f7a1e', light: '#9be06a', wilt: '#c9b53c', dead: '#a37a3a' };
const SOIL = { base: '#5a3a22', light: '#7a5232', dark: '#3e2615' };
const PLANTER = { base: '#8a5a2e', light: '#a8723f', dark: '#5e3a1b' };
const CRANE = { base: '#f2b632', light: '#ffd76e', dark: '#b07d14', ball: '#3b3f46', rust: '#9a5a2a' };
const CRATE = { base: '#c48d4c', light: '#dcab6c', dark: '#8e5c2c', gap: '#6b4121' };

// --- small helpers ---------------------------------------------------------------------

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A filled rounded box with an ink rim (k: rim width). */
function inkBox(g, x, y, w, h, r, fill, k = 1.3) {
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x - k, y - k, w + 2 * k, h + 2 * k, r + k * 0.6);
  g.fill();
  g.fillStyle = fill;
  g.beginPath();
  rrect(g, x, y, w, h, r);
  g.fill();
}

/** Resolve a team name or a palette object to a palette. */
function palOf(team) {
  if (team && typeof team === 'object' && team.body) return team;
  return TEAMS[team] || TEAMS.blue;
}

// A building's look is the same all its life: worked out once (it is asked for
// several times a frame: the art, the HP bar's clock, where the bar goes)
const looks = new WeakMap(); // building -> { bid, def, w, h, G }

/** The look of one building: its def (from the sim) over the fallback numbers. */
function lookOf(b) {
  if (!b || typeof b !== 'object') return makeLook(b);
  const c = looks.get(b);
  if (c && c.bid === b.bid && c.def === b.def && c.w === b.w && c.h === b.h) return c.G;
  const G = makeLook(b);
  looks.set(b, { bid: b.bid, def: b.def, w: b.w, h: b.h, G });
  return G;
}
function makeLook(b) {
  const bid = b && BUILDING_LOOK[b.bid] ? b.bid : 'boingBox';
  const L = BUILDING_LOOK[bid];
  const D = (b && b.def) || {};
  const P = { ...(L.pendulum || {}), ...(D.pendulum || {}) };
  return {
    bid,
    w: num(b && b.w, num(D.w, L.w)),
    h: num(b && b.h, num(D.h, L.h)),
    life: num(D.life, L.life),
    arm: num(D.arm, L.arm),
    top: L.top,
    reach: num(D.punch && D.punch.reach, L.punch ? L.punch.reach : 90),
    every: num(D.spawn && D.spawn.every, L.spawn ? L.spawn.every : 3),
    max: num(D.spawn && D.spawn.max, L.spawn ? L.spawn.max : 3),
    P,
  };
}

const faceOf = (b) => (b && b.f ? Math.sign(b.f) : b && b.team === 'red' ? -1 : 1);

// --- Boing Box -------------------------------------------------------------------------

const BOX = { w: 46, body: 37, lidW: 51, lidH: 10, gloveY: -21 };

/** The box below the lid: team-colour gift paper with white dots and a ribbon. */
function paintBoxBody(g, T, ws, dmg, rnd) {
  const W = BOX.w;
  const H = BOX.body;
  const x0 = -W / 2;
  const y0 = -H;
  g.fillStyle = 'rgba(40,70,20,0.3)';
  g.beginPath();
  g.ellipse(2, 1, W * 0.68, 4.6, 0, 0, TAU);
  g.fill();
  const paper = ws ? mix(T.body, '#a39a8e', ws * 0.12) : T.body;
  inkBox(g, x0, y0, W, H + 0.5, 2.2, paper, 1.5);
  g.save();
  g.beginPath();
  rrect(g, x0, y0, W, H + 0.5, 2.2);
  g.clip();
  // Gift paper dots
  g.fillStyle = rgba('#ffffff', ws === 2 ? 0.22 : 0.34);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      g.beginPath();
      g.arc(x0 + 4 + c * 8.6 + (r % 2) * 4.3, y0 + 5 + r * 8, 1.6, 0, TAU);
      g.fill();
    }
  }
  // Lit left edge, shaded right side, the lid's shadow along the top
  g.fillStyle = rgba('#ffffff', 0.2);
  g.fillRect(x0, y0, 4.5, H);
  g.fillStyle = rgba(T.dark, 0.3);
  g.fillRect(x0 + W * 0.7, y0, W * 0.3, H + 1);
  g.fillStyle = rgba(T.dark, 0.45);
  g.fillRect(x0, y0, W, 3.2);
  // Ribbon: a band down the middle and one around the waist (the glove comes out through it)
  const rib = ws === 2 ? '#ece3cf' : '#fbf8f0';
  g.fillStyle = rib;
  g.fillRect(-4.6, y0, 9.2, H + 1);
  g.fillRect(x0, BOX.gloveY - 4, W, 8);
  g.fillStyle = 'rgba(150,135,110,0.38)';
  g.fillRect(2.4, y0, 2.2, H + 1);
  g.fillRect(x0, BOX.gloveY + 2.2, W, 1.8);
  g.fillStyle = rgba(T.dark, 0.25);
  g.fillRect(-4.6, y0, 9.2, 3.2);
  // Creases once it's past its best
  if (ws >= 1) {
    g.strokeStyle = rgba(T.dark, 0.45);
    g.lineWidth = 0.9;
    g.beginPath();
    for (let i = 0; i < 3 + ws * 2; i++) {
      const x = lerp(x0 + 3, -W * 0.15 + W * 0.6, rnd());
      const y = lerp(y0 + 5, -4, rnd());
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 9, y + 3 + rnd() * 6);
    }
    g.stroke();
  }
  if (dmg) {
    // A torn corner (the wood shows through) and a strip of tape
    g.fillStyle = PLANTER.base;
    g.beginPath();
    g.moveTo(x0, -10);
    g.lineTo(x0 + 9, -3);
    g.lineTo(x0 + 4, 0.6);
    g.lineTo(x0, 0.6);
    g.closePath();
    g.fill();
    g.strokeStyle = PLANTER.dark;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x0, -6);
    g.lineTo(x0 + 6, -3);
    g.stroke();
    g.save();
    g.translate(W * 0.28, -30);
    g.rotate(0.6);
    g.fillStyle = 'rgba(240,225,170,0.85)';
    g.fillRect(-6, -1.6, 12, 3.2);
    g.restore();
  }
  g.restore();
}

/** One loop of the bow, anchored at the knot, pointing along angle a. */
function bowLoop(g, a, len, fat) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const nx = -s;
  const ny = c;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(c * len * 0.55 + nx * fat, s * len * 0.55 + ny * fat, c * len + nx * fat * 0.9, s * len + ny * fat * 0.9, c * len, s * len);
  g.bezierCurveTo(c * len - nx * fat * 0.9, s * len - ny * fat * 0.9, c * len * 0.55 - nx * fat, s * len * 0.55 - ny * fat, 0, 0);
  g.closePath();
}

/** The big white bow on the lid (knot at 0, 0). ws droops it. */
function paintBow(g, ws) {
  const droop = [0, 0.55, 1.15][ws] || 0;
  const white = ws === 2 ? '#ece3cf' : '#fbf8f0';
  const cream = '#d9cdb4';
  // Two short ribbon tails splayed over the lid, with notched ends
  for (const s of [-1, 1]) {
    const tx = s * (9 + droop * 2);
    const ty = 5 + ws * 2;
    g.beginPath();
    g.moveTo(-2 * s, -1);
    g.quadraticCurveTo(s * 5, 1, tx + s * 2, ty - 2.6);
    g.lineTo(tx - s * 0.6, ty - 0.4);
    g.lineTo(tx + s * 0.4, ty + 2.6);
    g.quadraticCurveTo(s * 3, ty + 1, 2 * s, 2.5);
    g.closePath();
    g.lineWidth = 2.6;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = cream;
    g.fill();
  }
  // Loops: up and out when fresh, hanging down the sides when wilted
  for (const s of [-1, 1]) {
    const a = s > 0 ? -0.42 + droop : Math.PI + 0.42 - droop;
    const len = 18 - ws * 1.5;
    const fat = 8 - ws * 1.3;
    bowLoop(g, a, len, fat);
    g.lineWidth = 2.8;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = white;
    g.fill();
    // The loop's opening and a shaded lower half
    g.save();
    bowLoop(g, a, len, fat);
    g.clip();
    g.fillStyle = 'rgba(150,135,110,0.25)';
    g.beginPath();
    g.ellipse(Math.cos(a) * len * 0.62, Math.sin(a) * len * 0.62 + fat * 0.7, len * 0.5, fat * 0.5, a, 0, TAU);
    g.fill();
    g.fillStyle = '#9c8e74';
    g.beginPath();
    g.ellipse(Math.cos(a) * len * 0.62, Math.sin(a) * len * 0.62, len * 0.2, fat * 0.28, a, 0, TAU);
    g.fill();
    g.restore();
  }
  // Knot
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(0, 0, 5.8, 5, 0, 0, TAU);
  g.fill();
  g.fillStyle = white;
  g.beginPath();
  g.ellipse(0, 0, 4.3, 3.6, 0, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(150,135,110,0.45)';
  g.fillRect(-0.4, -3, 1.2, 6);
}

/** The lid (its bottom centre at 0, 0) with the bow on top. */
function paintBoxLid(g, T, ws) {
  const W = BOX.lidW;
  const H = BOX.lidH;
  const col = ws ? mix(T.body, '#a39a8e', ws * 0.12) : T.body;
  inkBox(g, -W / 2, -H, W, H, 2.4, col, 1.5);
  g.save();
  g.beginPath();
  rrect(g, -W / 2, -H, W, H, 2.4);
  g.clip();
  g.fillStyle = rgba(T.light, 0.75);
  g.fillRect(-W / 2, -H, W, 2.6);
  g.fillStyle = rgba(T.dark, 0.35);
  g.fillRect(-W / 2, -2.4, W, 2.4);
  g.fillStyle = rgba(T.dark, 0.22);
  g.fillRect(W * 0.22, -H, W * 0.28, H);
  g.fillStyle = ws === 2 ? '#ece3cf' : '#fbf8f0';
  g.fillRect(-4.6, -H, 9.2, H);
  g.fillStyle = 'rgba(150,135,110,0.38)';
  g.fillRect(2.4, -H, 2.2, H);
  g.restore();
  g.save();
  g.translate(0, -H - 2.5);
  paintBow(g, ws);
  g.restore();
}

/** The glove's fist and thumb, grown by k (the ink rim). */
function fistPath(ctx, k) {
  ctx.beginPath();
  ctx.ellipse(1.4, 0.6, 10.6 + k, 9.6 + k, 0, 0, TAU);
  ctx.moveTo(-1 + 5 + k, -7.2);
  ctx.ellipse(-1, -7.2, 5 + k, 4.2 + k, -0.35, 0, TAU);
}

/** The boxing glove, centre (x, y), punching toward dir (+1 / -1). Shared with the card art. */
export function drawGlove(ctx, x, y, dir = 1, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((dir < 0 ? -1 : 1) * s, s);
  ctx.lineJoin = 'round';
  // Cuff at the wrist
  ctx.fillStyle = INK;
  ctx.beginPath();
  rrect(ctx, -13.5, -6.6, 7.5, 13.2, 2.2);
  ctx.fill();
  ctx.fillStyle = GLOVE.cuff;
  ctx.beginPath();
  rrect(ctx, -12.4, -5.5, 5.4, 11, 1.5);
  ctx.fill();
  ctx.fillStyle = '#cfc3ad';
  ctx.fillRect(-9.8, -5.5, 1.2, 11);
  // Fist and thumb (an ink rim first, then the red)
  fistPath(ctx, 1.5);
  ctx.fillStyle = INK;
  ctx.fill();
  fistPath(ctx, 0);
  ctx.fillStyle = GLOVE.base;
  ctx.fill();
  ctx.fillStyle = GLOVE.shade;
  ctx.beginPath();
  ctx.ellipse(2.6, 4.6, 8.6, 5, 0, 0, Math.PI);
  ctx.fill();
  // Knuckle seam and laces
  ctx.strokeStyle = GLOVE.shade;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-2.4, -3.4);
  ctx.quadraticCurveTo(3, -1.2, 7.6, -4.6);
  ctx.stroke();
  ctx.fillStyle = GLOVE.light;
  ctx.beginPath();
  ctx.ellipse(4.8, -4.4, 3.6, 2.2, -0.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(6, -5.2, 1.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A zig-zag coil spring from (x0, y0) to (x1, y1). */
function drawSpring(ctx, x0, y0, x1, y1, amp = 4.6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  if (L < 1) return;
  const ux = dx / L;
  const uy = dy / L;
  const n = Math.max(3, Math.round(L / 7));
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const s = (i % 2 ? 1 : -1) * amp;
    const d = (i / n) * L;
    ctx.lineTo(x0 + ux * d - uy * s, y0 + uy * d + ux * s);
  }
  ctx.lineTo(x1, y1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = SPRING.base;
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = SPRING.light;
  ctx.stroke();
}

// The pair glovePos, lidPose and ballAt hand back: reused (read it at once), no array per frame
const XY = [0, 0];
const xy = (x, y) => {
  XY[0] = x;
  XY[1] = y;
  return XY;
};

/** Where the glove is (local x, y) for an extension ext (0..1). */
function glovePos(ext, dir, reach, phase, pt) {
  const face = BOX.w / 2;
  let x = dir * (face + 6 + ext * Math.max(0, reach - 16));
  let y = BOX.gloveY;
  if (phase === 'back') {
    // Wobbling home on its spring: "boiyoioing"
    const k = Math.exp(-pt * 5);
    y += Math.sin(pt * 34) * 7 * k;
    x += dir * Math.sin(pt * 21) * 4 * k;
  }
  return xy(x, y);
}

/** The lid's lift (px) and tilt (rad) for the punch phase. */
function lidPose(punch, dir) {
  const ph = punch && punch.phase;
  const pt = num(punch && punch.t, 0);
  if (ph === 'windup') return xy(2 + 2.4 * Math.abs(Math.sin(pt * 55)), Math.sin(pt * 47) * 0.09);
  if (ph === 'out' || ph === 'hold') return xy(8, -dir * 0.16);
  if (ph === 'back') {
    const k = Math.exp(-pt * 7);
    return xy(8 * k * Math.abs(Math.cos(pt * 18)), -dir * 0.16 * k);
  }
  return xy(0, 0);
}

// --- Bean Patch ------------------------------------------------------------------------

const PATCH = { w: 64, box: 24, soil: 30, tufts: [-9, 6, 21], signX: -23 };

/** Planter box, soil and the little sign (the tufts are drawn live). */
function paintPatchBody(g, T, f, dmg, rnd) {
  const W = PATCH.w;
  const H = PATCH.box;
  const x0 = -W / 2;
  g.fillStyle = 'rgba(40,70,20,0.3)';
  g.beginPath();
  g.ellipse(2, 1, W * 0.62, 5, 0, 0, TAU);
  g.fill();
  // Soil heaped above the rim
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(x0 + 1, -H + 1);
  g.quadraticCurveTo(0, -PATCH.soil - 7.5, W / 2 - 1, -H + 1);
  g.closePath();
  g.fill();
  g.fillStyle = SOIL.base;
  g.beginPath();
  g.moveTo(x0 + 3, -H + 1);
  g.quadraticCurveTo(0, -PATCH.soil - 6, W / 2 - 3, -H + 1);
  g.closePath();
  g.fill();
  g.fillStyle = SOIL.light;
  for (let i = 0; i < 14; i++) {
    const x = lerp(x0 + 6, W / 2 - 6, rnd());
    const top = -H - (PATCH.soil - H + 4) * (1 - ((x / (W / 2)) ** 2)) * 0.9;
    g.beginPath();
    g.arc(x, lerp(top + 1.5, -H, rnd()), 0.9 + rnd() * 1.1, 0, TAU);
    g.fill();
  }
  // The sign, stuck in the soil at the back corner: a bean doodle in the team colour
  const sx = f * PATCH.signX;
  g.fillStyle = INK;
  g.fillRect(sx - 1.8, -51, 3.6, 30);
  g.fillStyle = '#c99a5e';
  g.fillRect(sx - 0.9, -50, 1.8, 28);
  g.save();
  g.translate(sx, -47);
  g.rotate(-f * 0.08);
  inkBox(g, -9, -6.5, 18, 13, 1.6, '#f7f3e8', 1.3);
  g.fillStyle = T.dark;
  g.beginPath();
  g.ellipse(0.4, 0.5, 4.4, 5.3, 0.25 * f, 0, TAU);
  g.fill();
  g.fillStyle = T.body;
  g.beginPath();
  g.ellipse(0.2, 0.3, 3.4, 4.3, 0.25 * f, 0, TAU);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(-0.6 + f * 0.8, -1.4, 1.3, 0, TAU);
  g.arc(1.6 + f * 0.8, -1.2, 1.3, 0, TAU);
  g.fill();
  g.fillStyle = '#111018';
  g.fillRect(-0.5 + f * 1.2, -1.6, 0.8, 0.8);
  g.fillRect(1.7 + f * 1.2, -1.4, 0.8, 0.8);
  g.fillStyle = LEAF.base;
  g.beginPath();
  g.ellipse(1.2, -5.6, 2.2, 1.1, -0.5, 0, TAU);
  g.fill();
  g.restore();
  // The planter: two boards, corner posts, a team-colour rim
  inkBox(g, x0, -H, W, H + 0.6, 1.6, PLANTER.base, 1.5);
  for (let i = 0; i < 2; i++) {
    const y = -H + 4 + i * 10;
    g.fillStyle = i ? PLANTER.base : PLANTER.light;
    g.fillRect(x0 + 5, y, W - 10, 9.4);
    g.fillStyle = PLANTER.dark;
    g.fillRect(x0 + 5, y + 9.4, W - 10, 0.9);
    g.strokeStyle = rgba(PLANTER.dark, 0.6);
    g.lineWidth = 0.7;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const gx = lerp(x0 + 9, W / 2 - 14, rnd());
      g.moveTo(gx, y + 2 + k * 2.6);
      g.quadraticCurveTo(gx + 6, y + 1 + k * 2.6, gx + 12 + rnd() * 6, y + 2.6 + k * 2.6);
    }
    g.stroke();
  }
  for (const s of [-1, 1]) {
    g.fillStyle = PLANTER.dark;
    g.fillRect(s > 0 ? W / 2 - 5 : x0, -H, 5, H + 0.6);
    g.fillStyle = rgba('#ffffff', 0.18);
    g.fillRect(s > 0 ? W / 2 - 5 : x0, -H, 1.4, H);
    g.fillStyle = '#3b3b3f';
    g.beginPath();
    g.arc(s * (W / 2 - 2.5), -H + 7, 0.9, 0, TAU);
    g.arc(s * (W / 2 - 2.5), -6, 0.9, 0, TAU);
    g.fill();
  }
  // Team-colour rim board on top
  inkBox(g, x0 - 1.5, -H - 3.6, W + 3, 4.6, 1.2, T.body, 1.2);
  g.fillStyle = rgba(T.light, 0.8);
  g.fillRect(x0 - 1.5, -H - 3.6, W + 3, 1.4);
  if (dmg) {
    // A split board and a chipped corner
    g.strokeStyle = INK;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-f * 6, -H + 4);
    g.lineTo(-f * 2, -H + 9);
    g.lineTo(-f * 7, -H + 13);
    g.lineTo(-f * 3, -H + 18);
    g.stroke();
    g.fillStyle = SOIL.dark;
    g.beginPath();
    g.moveTo(f * (W / 2 - 4), -H - 3.6);
    g.lineTo(f * (W / 2 + 1.5), -H - 3.6);
    g.lineTo(f * (W / 2 + 1.5), -H + 5);
    g.closePath();
    g.fill();
  }
}

/** A leaf from (0, 0) along angle a: a fat teardrop with a midrib. */
function leafPath(g, a, len, fat) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const nx = -s;
  const ny = c;
  g.moveTo(0, 0);
  g.bezierCurveTo(c * len * 0.3 + nx * fat, s * len * 0.3 + ny * fat, c * len * 0.85 + nx * fat * 0.6, s * len * 0.85 + ny * fat * 0.6, c * len, s * len);
  g.bezierCurveTo(c * len * 0.85 - nx * fat * 0.6, s * len * 0.85 - ny * fat * 0.6, c * len * 0.3 - nx * fat, s * len * 0.3 - ny * fat, 0, 0);
}

/**
 * One sprout tuft at (x, y): two leaves and a curl. grow (0..1) after a pop,
 * wilt (0..1) droops and yellows it, shake jiggles it before a pop.
 */
function drawTuft(ctx, x, y, grow, wilt, shake, seed) {
  if (grow <= 0.02) return;
  const col = wilt < 0.5 ? mix(LEAF.base, LEAF.wilt, wilt * 2) : mix(LEAF.wilt, LEAF.dead, (wilt - 0.5) * 2);
  const dark = mix(LEAF.dark, '#6e5424', wilt);
  const droop = wilt * 0.9;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(shake);
  ctx.scale(grow, grow);
  const len = 15 + (seed % 3) * 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  leafPath(ctx, -Math.PI / 2 - 0.62 - droop, len, 6.4);
  leafPath(ctx, -Math.PI / 2 + 0.55 + droop, len * 0.92, 5.8);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const a of [-Math.PI / 2 - 0.62 - droop, -Math.PI / 2 + 0.55 + droop]) {
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len * 0.75, Math.sin(a) * len * 0.75);
  }
  ctx.stroke();
  if (wilt < 0.6) {
    ctx.fillStyle = rgba(LEAF.light, 0.7 * (1 - wilt));
    ctx.beginPath();
    const a = -Math.PI / 2 - 0.62 - droop;
    ctx.ellipse(Math.cos(a) * len * 0.5 - 1, Math.sin(a) * len * 0.5 - 1, 2.6, 1.3, a, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- Wrecking Crane ----------------------------------------------------------------------

/** Mast, jib, counterweight, cab and footing (local, pivot at (f * pf, -pu)). */
function paintCraneBody(g, T, f, ws, dmg, P, rnd) {
  const pu = num(P.pivotUp, 170);
  const pf = num(P.pivotFwd, 34);
  const mastTop = -pu + 20;
  const hw = 12.5;
  g.fillStyle = 'rgba(40,70,20,0.3)';
  g.beginPath();
  g.ellipse(2, 1, 30, 5, 0, 0, TAU);
  g.fill();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const yellow = ws ? mix(CRANE.base, '#c9a46a', ws * 0.25) : CRANE.base;
  const bar = (x0, y0, x1, y1, w) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineWidth = w + 2.2;
    g.strokeStyle = INK;
    g.stroke();
    g.lineWidth = w;
    g.strokeStyle = yellow;
    g.stroke();
  };
  // Mast lattice: braces first, then the two chords over them
  const segs = Math.max(4, Math.round((-12 - mastTop) / 17));
  const segH = (-12 - mastTop) / segs;
  for (let i = 0; i < segs; i++) {
    const ya = -12 - i * segH;
    const yb = ya - segH;
    bar(i % 2 ? -hw : hw, ya, i % 2 ? hw : -hw, yb, 1.6);
    bar(-hw, yb, hw, yb, 1.6);
  }
  for (const s of [-1, 1]) {
    bar(s * hw, -10, s * hw, mastTop, 3.4);
    g.strokeStyle = rgba(CRANE.light, 0.9);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(s * hw - 0.8, -12);
    g.lineTo(s * hw - 0.8, mastTop + 1);
    g.stroke();
  }
  // Jib (forward, to just past the pivot) and counter-jib (back), a truss under the top chord
  const tipX = f * (pf + 9);
  const backX = -f * 25;
  const jibTop = -pu - 8;
  bar(backX, -pu, tipX, -pu, 2.6);
  bar(backX, jibTop + 1, -f * 4, jibTop, 2.4);
  bar(-f * 4, jibTop, tipX, -pu - 3, 2.4);
  for (let i = 0; i < 7; i++) {
    const u = i / 7;
    const xa = lerp(backX, tipX, u);
    const xb = lerp(backX, tipX, u + 1 / 7);
    const top = (x) => (f * x <= -4 ? jibTop + 1 : lerp(jibTop, -pu - 3, (f * x + 4) / (pf + 13)));
    bar(xa, -pu, xb, top(xb), 1.3);
  }
  // A-frame and its tie rods
  g.strokeStyle = '#3e434b';
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(0, -pu - 27);
  g.lineTo(tipX, -pu - 3);
  g.moveTo(0, -pu - 27);
  g.lineTo(backX, jibTop + 1);
  g.stroke();
  bar(-7, jibTop, 0, -pu - 27, 2.4);
  bar(7, jibTop, 0, -pu - 27, 2.4);
  // Team pennant on the apex
  g.fillStyle = INK;
  g.fillRect(-1.1, -pu - 40, 2.2, 14);
  g.beginPath();
  g.moveTo(0, -pu - 40);
  g.lineTo(-f * 15, -pu - 36);
  g.lineTo(0, -pu - 31);
  g.closePath();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = T.body;
  g.fill();
  g.fillStyle = rgba(T.light, 0.8);
  g.beginPath();
  g.moveTo(0, -pu - 40);
  g.lineTo(-f * 15, -pu - 36);
  g.lineTo(0, -pu - 37.5);
  g.closePath();
  g.fill();
  // Counterweight block hanging off the counter-jib
  const cwx = Math.min(backX, backX + f * 12);
  inkBox(g, cwx, -pu + 1, 12, 12, 1.4, '#a39c91', 1.3);
  g.fillStyle = '#8b847a';
  g.fillRect(cwx, -pu + 8, 12, 5);
  g.fillStyle = rgba('#ffffff', 0.3);
  g.fillRect(cwx, -pu + 1, 12, 1.6);
  // Trolley and pulley at the pivot
  inkBox(g, f * pf - 5, -pu - 5, 10, 5, 1, '#4a4f57', 1);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(f * pf, -pu + 1.5, 3.6, 0, TAU);
  g.fill();
  g.fillStyle = '#9aa2ab';
  g.beginPath();
  g.arc(f * pf, -pu + 1.5, 2.4, 0, TAU);
  g.fill();
  // Turntable and the team-colour cab under the jib
  inkBox(g, -15, mastTop - 3, 30, 4, 1, '#4a4f57', 1);
  const cx0 = f > 0 ? -6 : -16;
  inkBox(g, cx0, -pu + 2, 22, mastTop - 4 - (-pu + 2), 2.2, T.body, 1.4);
  g.fillStyle = rgba(T.light, 0.7);
  g.fillRect(cx0, -pu + 2, 22, 2);
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, cx0 + (f > 0 ? 9 : 2), -pu + 5, 10, 7.5, 1.6);
  g.fill();
  g.fillStyle = '#bfe3f2';
  g.beginPath();
  rrect(g, cx0 + (f > 0 ? 10 : 3), -pu + 6, 8, 5.5, 1.2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(cx0 + (f > 0 ? 11 : 4), -pu + 6.6, 2, 4.4);
  // Footing: a concrete block with hazard stripes
  inkBox(g, -22, -12, 44, 12.6, 1.6, '#b4ada2', 1.4);
  g.save();
  g.beginPath();
  g.rect(-22, -11.5, 44, 6.5);
  g.clip();
  g.fillStyle = '#f2c230';
  g.fillRect(-22, -11.5, 44, 6.5);
  g.fillStyle = '#26262b';
  for (let x = -30; x < 26; x += 7) {
    g.beginPath();
    g.moveTo(x, -5);
    g.lineTo(x + 3.5, -5);
    g.lineTo(x + 10, -11.5);
    g.lineTo(x + 6.5, -11.5);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = rgba('#ffffff', 0.35);
  g.fillRect(-22, -12, 44, 1.2);
  g.fillStyle = 'rgba(60,52,44,0.3)';
  g.fillRect(-22, -3, 44, 3.4);
  // Rust (age) and a bent brace (damage)
  if (ws >= 1) {
    g.fillStyle = rgba(CRANE.rust, 0.55 + 0.2 * ws);
    for (let i = 0; i < 6 + ws * 6; i++) {
      const s = rnd() < 0.5 ? -1 : 1;
      g.beginPath();
      g.ellipse(s * hw + (rnd() - 0.5) * 2, lerp(mastTop + 6, -16, rnd()), 1.2 + rnd(), 2 + rnd() * 2.4, 0, 0, TAU);
      g.fill();
    }
  }
  if (dmg) {
    const y = lerp(mastTop, -20, 0.55);
    g.strokeStyle = INK;
    g.lineWidth = 3.4;
    g.beginPath();
    g.moveTo(-hw, y);
    g.lineTo(-2, y - 4);
    g.lineTo(hw, y - 1);
    g.stroke();
    g.strokeStyle = CRANE.dark;
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = 'rgba(40,36,34,0.35)';
    g.beginPath();
    g.ellipse(hw * 0.4, y + 12, 7, 10, 0, 0, TAU);
    g.fill();
  }
}

/**
 * The wrecking ball: dark iron with a shackle on top. rot turns the shackle
 * toward the chain (0 = straight up); the light stays upper left. Shared with
 * the 'craneBall' item.
 */
export function drawCraneBall(ctx, x, y, r = 20, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  // Shackle
  ctx.save();
  ctx.rotate(rot);
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, -r - 2.5, 3.6, Math.PI * 0.95, Math.PI * 2.05);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#7c8490';
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(-4.6, -r - 1.8, 9.2, 4.4);
  ctx.fillStyle = '#5d646e';
  ctx.fillRect(-3.6, -r - 1, 7.2, 2.6);
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = CRANE.ball;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2a2d33';
  ctx.beginPath();
  ctx.arc(r * 0.16, r * 0.2, r * 0.9, 0, TAU);
  ctx.arc(-r * 0.08, -r * 0.1, r * 0.86, 0, TAU, true);
  ctx.fill('evenodd');
  ctx.fillStyle = '#5d646e';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.32, r * 0.48, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-r * 0.42, -r * 0.44, r * 0.17, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.84, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
}

/** The chain from the pulley to the ball's shackle. */
function drawChain(ctx, x0, y0, x1, y1) {
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#7c8490';
  ctx.setLineDash([3, 2.2]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Where the ball hangs for a pendulum angle (local, pivot-relative maths). */
function ballAt(P, f, ang) {
  const pu = num(P.pivotUp, 170);
  const pf = num(P.pivotFwd, 34);
  const L = num(P.L, 125);
  return xy(f * pf + Math.sin(ang) * L, -pu + Math.cos(ang) * L);
}

/** Speed streaks behind a fast ball. */
function ballStreaks(ctx, x, y, vx, vy, r, k) {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = -vx / sp;
  const uy = -vy / sp;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(255,255,255,${0.7 * k})`;
  for (let i = -1; i <= 1; i++) {
    const ox = -uy * i * r * 0.62;
    const oy = ux * i * r * 0.62;
    const L = r * (1.3 + 0.7 * (1 - Math.abs(i))) * (0.6 + 0.6 * k);
    ctx.lineWidth = 3.2 - Math.abs(i);
    ctx.beginPath();
    ctx.moveTo(x + ux * r * 1.15 + ox, y + uy * r * 1.15 + oy);
    ctx.lineTo(x + ux * (r * 1.15 + L) + ox, y + uy * (r * 1.15 + L) + oy);
    ctx.stroke();
  }
}

// --- Drop-in: a crate (the patch: a clod of dirt) --------------------------------------

/** A slatted wooden crate, base centre at (0, 0). */
function paintCrate(g, w, h) {
  const x0 = -w / 2;
  inkBox(g, x0, -h, w, h, 2, CRATE.base, 1.5);
  g.save();
  g.beginPath();
  rrect(g, x0, -h, w, h, 2);
  g.clip();
  // Slats with dark gaps
  for (let y = -h + 7; y < 0; y += 9) {
    g.fillStyle = CRATE.gap;
    g.fillRect(x0, y, w, 1.4);
    g.fillStyle = rgba('#ffffff', 0.2);
    g.fillRect(x0, y + 1.4, w, 1.2);
  }
  // Frame and a diagonal brace per square-ish section
  const sec = Math.max(1, Math.round(h / w));
  const sh = h / sec;
  g.lineCap = 'butt';
  for (let i = 0; i < sec; i++) {
    const ya = -i * sh;
    const yb = ya - sh;
    g.strokeStyle = CRATE.dark;
    g.lineWidth = 6.4;
    g.beginPath();
    g.moveTo(x0 + 4, ya - 4);
    g.lineTo(w / 2 - 4, yb + 4);
    g.stroke();
    g.strokeStyle = CRATE.light;
    g.lineWidth = 4.2;
    g.stroke();
    g.fillStyle = CRATE.dark;
    g.fillRect(x0, yb, w, 4.4);
  }
  g.fillStyle = CRATE.dark;
  g.fillRect(x0, -h, 4.4, h);
  g.fillRect(w / 2 - 4.4, -h, 4.4, h);
  g.fillRect(x0, -4.4, w, 4.4);
  g.fillStyle = CRATE.light;
  g.fillRect(x0 + 0.8, -h, 1.4, h);
  g.fillStyle = '#3b3b3f';
  for (const [x, y] of [[x0 + 2.2, -h + 2.2], [w / 2 - 2.2, -h + 2.2], [x0 + 2.2, -2.2], [w / 2 - 2.2, -2.2]]) {
    g.beginPath();
    g.arc(x, y, 1, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** A clod of dirt with a tuft of grass on top (the Bean Patch arriving). */
function paintClod(g, w, rnd) {
  const pts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = 1 + (rnd() - 0.5) * 0.22;
    pts.push([Math.cos(a) * w * 0.5 * rr, -16 + Math.sin(a) * 16 * rr]);
  }
  const path = (k) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, -16 + (y + 16) * k) : g.moveTo(x * k, -16 + (y + 16) * k)));
    g.closePath();
  };
  path(1.06);
  g.fillStyle = INK;
  g.fill();
  path(1);
  g.fillStyle = '#6b4527';
  g.fill();
  g.save();
  path(1);
  g.clip();
  g.fillStyle = '#8a5a33';
  g.beginPath();
  g.ellipse(-w * 0.08, -24, w * 0.42, 10, 0, 0, TAU);
  g.fill();
  g.fillStyle = SOIL.dark;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc((rnd() - 0.5) * w * 0.8, -rnd() * 26, 1 + rnd() * 1.5, 0, TAU);
    g.fill();
  }
  g.restore();
  // Grass on top
  g.strokeStyle = '#4f9a2e';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = lerp(-w * 0.3, w * 0.3, i / 8);
    g.moveTo(x, -29);
    g.lineTo(x + (rnd() - 0.5) * 5, -36 - rnd() * 6);
  }
  g.stroke();
}

// --- Wreck (after buildingDown) ----------------------------------------------------------

function plank(g, x, y, l, w, rot, col = PLANTER.base) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  inkBox(g, -l / 2, -w / 2, l, w, 1, col, 1.1);
  g.fillStyle = rgba('#ffffff', 0.22);
  g.fillRect(-l / 2, -w / 2, l, 1.2);
  g.fillStyle = '#3b3b3f';
  g.beginPath();
  g.arc(-l / 2 + 2.5, 0, 0.8, 0, TAU);
  g.arc(l / 2 - 2.5, 0, 0.8, 0, TAU);
  g.fill();
  g.restore();
}

/** What's left: a heap of planks, plus a few bits that say what it was. */
function paintPile(g, bid, T, f, rnd) {
  g.fillStyle = 'rgba(40,70,20,0.3)';
  g.beginPath();
  g.ellipse(0, 1, 40, 5, 0, 0, TAU);
  g.fill();
  if (bid === 'beanPatch') {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(0, 0, 33, 11, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = SOIL.base;
    g.beginPath();
    g.ellipse(0, 0, 31, 9.5, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = SOIL.light;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.arc((rnd() - 0.5) * 50, -rnd() * 7, 1 + rnd(), 0, TAU);
      g.fill();
    }
  }
  const col = bid === 'wreckingCrane' ? CRANE.base : PLANTER.base;
  const n = bid === 'wreckingCrane' ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * 44;
    plank(g, x, -2 - rnd() * 8, 20 + rnd() * 12, bid === 'wreckingCrane' ? 3.6 : 5.2, (rnd() - 0.5) * 0.9, i % 2 && bid !== 'wreckingCrane' ? PLANTER.light : col);
  }
  if (bid === 'boingBox') {
    // Scraps of gift paper, the ribbon, and the glove lying limp on its spring
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate((rnd() - 0.5) * 36, -4 - rnd() * 6);
      g.rotate((rnd() - 0.5) * 1.2);
      inkBox(g, -6, -4, 12, 8, 1, T.body, 1);
      g.fillStyle = rgba('#ffffff', 0.4);
      g.beginPath();
      g.arc(-2, -1, 1.2, 0, TAU);
      g.arc(3, 2, 1.2, 0, TAU);
      g.fill();
      g.restore();
    }
    drawSpring(g, -f * 8, -6, f * 10, -10, 3);
    drawGlove(g, f * 18, -11, f, 0.8);
  } else if (bid === 'beanPatch') {
    // The sign tipped over and a wilted leaf
    g.save();
    g.translate(-f * 20, -8);
    g.rotate(-f * 1.1);
    g.fillStyle = INK;
    g.fillRect(-1.5, 0, 3, 16);
    inkBox(g, -8, -11, 16, 11, 1.4, '#f2ecdc', 1.2);
    g.fillStyle = T.body;
    g.beginPath();
    g.ellipse(0, -5.5, 3, 3.8, 0, 0, TAU);
    g.fill();
    g.restore();
    g.beginPath();
    leafPath(g, -0.3, 11, 4);
    g.lineWidth = 2.2;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = LEAF.dead;
    g.fill();
  } else {
    // Broken footing, a hazard-striped chunk
    inkBox(g, -16, -9, 18, 9, 1.4, '#b4ada2', 1.2);
    inkBox(g, 6, -7, 12, 7, 1.2, '#f2c230', 1.2);
    g.fillStyle = '#26262b';
    g.fillRect(9, -7, 3, 7);
  }
}

// --- Static art for card faces ---------------------------------------------------------------

/**
 * Draw a building in its full-health pose, base centre at (x, y), scale s, for
 * card faces and menus. pose: { f (facing, default +1), ext (Boing Box glove,
 * 0..1), ang (Wrecking Crane ball angle), wilt (0..1), grow (Bean Patch tufts) }.
 */
export function drawBuildingArt(ctx, bid, x, y, s = 1, team = 'blue', pose = {}) {
  if (!ctx || !BUILDING_LOOK[bid] || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const T = palOf(team);
  const f = pose.f < 0 ? -1 : 1;
  const wilt = clamp(num(pose.wilt, 0), 0, 1);
  const ws = wiltStage(wilt);
  const rnd = mulberry32(bid.length * 977 + 13);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (bid === 'boingBox') {
    const ext = clamp(num(pose.ext, 0), 0, 1);
    paintBoxBody(ctx, T, ws, 0, rnd);
    if (ext > 0.02) drawPunch(ctx, f, ext, BUILDING_LOOK.boingBox.punch.reach, 'hold', 0);
    ctx.save();
    ctx.translate(0, -BOX.body);
    if (ext > 0.02) {
      ctx.translate(0, -8);
      ctx.rotate(-f * 0.16);
    }
    paintBoxLid(ctx, T, ws);
    ctx.restore();
  } else if (bid === 'beanPatch') {
    paintPatchBody(ctx, T, f, 0, rnd);
    drawTufts(ctx, f, wilt, 0, 0, clamp(num(pose.grow, 1), 0, 1));
  } else {
    const P = BUILDING_LOOK.wreckingCrane.pendulum;
    paintCraneBody(ctx, T, f, ws, 0, P, rnd);
    const ang = num(pose.ang, 0.5 * f);
    const [bx, by] = ballAt(P, f, ang);
    drawChain(ctx, f * P.pivotFwd, -P.pivotUp + 3, bx - Math.sin(ang) * (P.r + 3), by - Math.cos(ang) * (P.r + 3));
    drawCraneBall(ctx, bx, by, P.r, -ang);
  }
  ctx.restore();
}


/** Glove on its spring coming out of the box face (local coords). */
function drawPunch(ctx, dir, ext, reach, phase, pt) {
  const [gx, gy] = glovePos(ext, dir, reach, phase, pt);
  const face = dir * (BOX.w / 2 - 1);
  // The slot it comes out of
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(face, BOX.gloveY, 2.6, 6, 0, 0, TAU);
  ctx.fill();
  drawSpring(ctx, face, BOX.gloveY, gx - dir * 10, gy);
  drawGlove(ctx, gx, gy, dir);
}

function drawTufts(ctx, f, wilt, shake, time, popGrow) {
  for (let i = 0; i < PATCH.tufts.length; i++) {
    const tx = PATCH.tufts[i];
    const front = i === PATCH.tufts.length - 1;
    const grow = front ? popGrow : 1;
    const sh = shake ? Math.sin(time * 41 + i * 2.1) * 0.32 * shake : 0;
    drawTuft(ctx, f * tx, -PATCH.soil + 1 + Math.abs(tx) * 0.12, grow, wilt, sh, i);
  }
}

// --- Aiming --------------------------------------------------------------------------------

const NO = '#ff4d3d';

/**
 * Aim helper for a building card: the footprint on the grass, the reach it
 * will cover (glove reach, crane swing), and the building itself see-through,
 * bobbing a little above the ground. ok = false (no legal spot): red and
 * hatched. opts: { T (palette), def, zoom, alpha, cache (a Map, see createBuildingRenderer) }.
 */
export function drawBuildingGhost(ctx, bid, x, team = 'blue', ok = true, t = 0, opts = {}) {
  if (!ctx || !BUILDING_LOOK[bid] || !Number.isFinite(x)) return;
  const T = palOf(opts.T || team);
  const G = lookOf({ bid, def: opts.def });
  const f = team === 'red' ? -1 : 1;
  const col = ok ? T.body : NO;
  const px = 1 / clamp(num(opts.zoom, 1), 0.2, 4);
  const top = WORLD.groundY - 2;
  const depth = WORLD.laneDepth + 4;
  const x0 = x - G.w / 2;
  ctx.save();
  // Footprint slab on the grass with corner brackets
  ctx.globalAlpha = ok ? 0.38 : 0.28;
  ctx.fillStyle = col;
  ctx.fillRect(x0, top, G.w, depth);
  if (!ok) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, G.w, depth);
    ctx.clip();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = NO;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = x0 - 30; k < x0 + G.w + 30; k += 12) {
      ctx.moveTo(k, top + depth);
      ctx.lineTo(k + 22, top);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = ok ? 0.95 : 0.7;
  ctx.strokeStyle = ok ? '#ffffff' : '#ffd0cb';
  ctx.lineWidth = Math.max(2.2, 2 * px);
  ctx.lineCap = 'round';
  const c = Math.min(10, G.w * 0.25);
  ctx.beginPath();
  for (const [cx, sx] of [[x0, 1], [x0 + G.w, -1]]) {
    for (const [cy, sy] of [[top, 1], [top + depth, -1]]) {
      ctx.moveTo(cx + sx * c, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * Math.min(c, depth * 0.45));
    }
  }
  ctx.stroke();
  // What it covers
  if (ok) drawReach(ctx, G, x, f, T, t, px);
  // The building, see-through
  const lift = 5 + Math.sin(t * 4) * 2.5;
  ctx.globalAlpha = num(opts.alpha, ok ? 0.62 : 0.4);
  const cache = opts.cache;
  const m = ctx.getTransform();
  const need = Math.hypot(m.a, m.b) || 1;
  if (cache) {
    const sp = ghostSprite(cache, bid, T, f, ok);
    sp.update(need, { rebuilds: 1 });
    ctx.drawImage(sp.canvas, x + sp.x, -lift + sp.y, sp.w, sp.h);
  } else {
    drawBuildingArt(ctx, bid, x, -lift, 1, T, { f });
    if (!ok) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = NO;
      ctx.fillRect(x0 - 4, -G.h - G.top - lift, G.w + 8, G.h + G.top);
    }
  }
  ctx.restore();
}

/** The reach of a building while aiming: glove brackets, the crane's swing arc. */
function drawReach(ctx, G, x, f, T, t, px) {
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(2, 1.8 * px);
  ctx.setLineDash([7 * px + 2, 6 * px + 2]);
  ctx.lineDashOffset = -t * 20;
  ctx.strokeStyle = '#ffffff';
  if (G.bid === 'boingBox') {
    const y = BOX.gloveY;
    for (const s of [-1, 1]) {
      const a = x + s * G.w / 2;
      const b = x + s * (G.w / 2 + G.reach);
      ctx.beginPath();
      ctx.moveTo(a, y);
      ctx.lineTo(b, y);
      ctx.moveTo(b, y - 12);
      ctx.lineTo(b, y + 12);
      ctx.stroke();
    }
  } else if (G.bid === 'wreckingCrane') {
    const P = G.P;
    const cx = x + f * num(P.pivotFwd, 34);
    const cy = -num(P.pivotUp, 170);
    const L = num(P.L, 125);
    const m = num(P.maxAng, 1.2);
    ctx.beginPath();
    ctx.arc(cx, cy, L, Math.PI / 2 - m, Math.PI / 2 + m);
    ctx.stroke();
    // Sense range: ticks on the grass where it starts to swing
    const sense = num(P.sense, 230);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = T.light;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(cx + s * sense, WORLD.groundY - 10);
      ctx.lineTo(cx + s * sense, WORLD.groundY + WORLD.laneDepth);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function ghostSprite(cache, bid, T, f, ok) {
  const key = `ghost|${bid}|${T.body}|${f}|${ok}`;
  let c = cache.get(key);
  if (c) return c;
  const G = BUILDING_LOOK[bid];
  const wide = bid === 'wreckingCrane' ? 280 : G.w + 40;
  c = new Cached({
    x: -wide / 2, y: -G.h - G.top - 14, w: wide, h: G.h + G.top + 20, maxPx: 6e5, slack: 0.85,
    paint: (g) => {
      drawBuildingArt(g, bid, 0, 0, 1, T, { f });
      if (!ok) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = rgba(NO, 0.6);
        g.fillRect(-wide / 2, -G.h - G.top - 14, wide, G.h + G.top + 20);
        g.globalCompositeOperation = 'source-over';
      }
    },
  });
  cache.set(key, c);
  return c;
}

// --- The renderer ------------------------------------------------------------------------------

/**
 * createBuildingRenderer({ seed }) -> { draw(ctx, b, t, T, need, frame), artTop(b), lifeShare(b), cache }.
 * need = device px per world px; frame = { rebuilds } (towers.js shares its budget).
 */
export function createBuildingRenderer(opts = {}) {
  const seed = (opts.seed == null ? 7 : opts.seed) >>> 0;
  const sprites = new Map();

  function cached(key, box, paint) {
    let c = sprites.get(key);
    if (!c) {
      c = new Cached({ ...box, maxPx: 6e5, slack: 0.85, paint });
      sprites.set(key, c);
    }
    return c;
  }

  const rndFor = (bid, team, k = 0) => mulberry32(seed * 131 + bid.length * 977 + (team === 'red' ? 41 : 0) + k);

  function body(G, team, T, f, ws, dmg) {
    const key = `body|${G.bid}|${team}|${T.body}|${f}|${ws}|${dmg}`;
    if (G.bid === 'boingBox') return cached(key, { x: -36, y: -42, w: 72, h: 48 }, (g) => paintBoxBody(g, T, ws, dmg, rndFor(G.bid, team)));
    if (G.bid === 'beanPatch') return cached(key, { x: -44, y: -60, w: 88, h: 66 }, (g) => paintPatchBody(g, T, f, dmg, rndFor(G.bid, team)));
    const P = G.P;
    const pu = num(P.pivotUp, 170);
    return cached(key, { x: -60, y: -pu - 46, w: 120, h: pu + 52 }, (g) => paintCraneBody(g, T, f, ws, dmg, P, rndFor(G.bid, team)));
  }

  const lid = (team, T, ws) => cached(`lid|${team}|${T.body}|${ws}`, { x: -32, y: -40, w: 64, h: 48 }, (g) => paintBoxLid(g, T, ws));

  function crate(G) {
    if (G.bid === 'beanPatch') return cached('clod', { x: -40, y: -46, w: 80, h: 50 }, (g) => paintClod(g, G.w, mulberry32(seed + 5)));
    const w = G.bid === 'wreckingCrane' ? 40 : G.w + 4;
    const h = G.h;
    return cached(`crate|${w}x${h}`, { x: -w / 2 - 3, y: -h - 3, w: w + 6, h: h + 6 }, (g) => paintCrate(g, w, h));
  }

  const pile = (G, team, T, f) => cached(`pile|${G.bid}|${team}|${T.body}|${f}`, { x: -50, y: -34, w: 100, h: 40 }, (g) => paintPile(g, G.bid, T, f, rndFor(G.bid, team, 3)));

  /** A white silhouette of a sprite, for the hit flash. */
  function flashOf(c) {
    const cv = c.canvas;
    if (c.flash && c.flashScale === c.scale && c.flash.width === cv.width && c.flash.height === cv.height) return c.flash;
    const fc = c.flash || document.createElement('canvas');
    fc.width = cv.width;
    fc.height = cv.height;
    const g = fc.getContext('2d');
    g.globalCompositeOperation = 'copy';
    g.drawImage(cv, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fffaf0';
    g.fillRect(0, 0, fc.width, fc.height);
    c.flash = fc;
    c.flashScale = c.scale;
    return fc;
  }

  const blit = (ctx, c, img = c.canvas) => ctx.drawImage(img, c.x, c.y, c.w, c.h);

  /** Share of its life a building has used (0..1): the clock on its HP bar. */
  function lifeShare(b) {
    const G = lookOf(b);
    return clamp(num(b.age, 0) / Math.max(0.1, G.life), 0, 1);
  }

  function artTop(b) {
    const G = lookOf(b);
    if (G.bid === 'wreckingCrane') return -num(G.P.pivotUp, 170) - G.top - 12;
    return -G.h - G.top;
  }

  /** The drop: a crate (a clod for the patch) falling onto its spot, its shadow growing. */
  function drawDrop(ctx, b, G, x, landT, need, fr) {
    const p = clamp(landT / LAND_T, 0, 1);
    const y = -DROP_H * (1 - p * p);
    const k = p * p;
    ctx.fillStyle = `rgba(28,52,12,${0.12 + 0.3 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, 2, G.w * (0.35 + 0.4 * k), 3 + 2.5 * k, 0, 0, TAU);
    ctx.fill();
    const c = crate(G);
    c.update(need, fr);
    const top = G.bid === 'beanPatch' ? 38 : G.h;
    // Speed lines above it
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.lineWidth = 3 - Math.abs(i);
      ctx.beginPath();
      ctx.moveTo(x + i * G.w * 0.3, y - top - 6);
      ctx.lineTo(x + i * G.w * 0.3, y - top - 6 - (40 + 25 * (1 - Math.abs(i))) * (0.4 + p));
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(landT * 9 + num(b.x, 0)) * 0.05 * (1 - p));
    blit(ctx, c);
    ctx.restore();
  }

  /** Down: it squashes into a heap of planks (the crane topples first), then fades. */
  function drawDown(ctx, b, G, x, T, f, need, fr) {
    const downT = Math.max(0, num(b.downT, 99));
    const fade = 1 - clamp((downT - DOWN_FADE[0]) / (DOWN_FADE[1] - DOWN_FADE[0]), 0, 1);
    if (fade <= 0) return;
    const pl = pile(G, b.team, T, f);
    pl.update(need, fr);
    const crane = G.bid === 'wreckingCrane';
    const dur = crane ? 0.85 : 0.4;
    const p = clamp(downT / dur, 0, 1);
    ctx.globalAlpha = fade;
    if (p < 1 || crane) {
      const c = body(G, b.team, T, f, 2, 1);
      c.update(need, fr);
      ctx.save();
      if (crane) {
        // The mast topples forward onto the field (under the beans) and lies there until the wreck fades
        const a = f * 1.5 * p * p;
        const bounce = p >= 1 ? -Math.sin(Math.min(1, (downT - dur) / 0.3) * Math.PI) * 0.06 * f : 0;
        ctx.translate(x + f * 8, -2);
        ctx.rotate(a + bounce);
        ctx.translate(-f * 8, 2);
        blit(ctx, c);
      } else {
        const sy = 1 - easeOut(p) * 0.85;
        ctx.translate(x + Math.sin(downT * 50) * 2 * (1 - p), 0);
        ctx.scale(1 + 0.25 * p, sy);
        blit(ctx, c);
      }
      ctx.restore();
    }
    const grow = easeOut(clamp(p * 1.4 - 0.15, 0, 1));
    if (grow > 0) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(lerp(0.8, 1, grow), grow);
      blit(ctx, pl);
      ctx.restore();
    }
    // The box's lid flies off as it bursts
    if (G.bid === 'boingBox' && downT < 1.1) {
      const lc = lid(b.team, T, 2);
      lc.update(need, fr);
      const tt = downT;
      ctx.save();
      ctx.translate(x - f * 70 * tt, -BOX.body - 260 * tt + 0.5 * 900 * tt * tt);
      ctx.rotate(-f * tt * 7);
      ctx.globalAlpha = fade * (1 - clamp((tt - 0.8) / 0.3, 0, 1));
      blit(ctx, lc);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx, b, t, T, need, fr, battle) {
    const G = lookOf(b);
    const f = faceOf(b);
    const x = num(b.x, 0);
    const age = num(b.age, 99);
    const landT = num(b.landT, age);
    if (b.alive === false) {
      drawDown(ctx, b, G, x, T, f, need, fr);
      return;
    }
    if (landT < LAND_T) {
      drawDrop(ctx, b, G, x, landT, need, fr);
      return;
    }
    const wilt = clamp(age / Math.max(0.1, G.life), 0, 1);
    const ws = wiltStage(wilt);
    const frac = b.maxHp > 0 ? clamp(num(b.hp, 0) / b.maxHp, 0, 1) : 1;
    const dmg = frac < 0.5 ? 1 : 0;
    const c = body(G, b.team, T, f, ws, dmg);
    c.update(need, fr);
    const ht = num(b.hitT, 99);
    const shake = ht < SHAKE_T ? Math.sin(ht * 95) * 2 * (1 - ht / SHAKE_T) : 0;
    const flash = ht < FLASH_T ? (1 - ht / FLASH_T) * 0.75 : 0;
    // Landing squash: it thumps down and wobbles back up
    const since = age - LAND_T;
    let sx = 1;
    let sy = 1;
    if (G.bid !== 'wreckingCrane' && since >= 0 && since < 0.5) {
      const k = since / 0.5;
      sy = 1 - 0.22 * Math.exp(-k * 5) * Math.cos(k * 15);
      sx = 1 / Math.sqrt(sy);
    }
    ctx.save();
    ctx.translate(x + shake, 0);
    ctx.scale(sx, sy);
    blit(ctx, c);
    if (flash > 0.01) {
      ctx.globalAlpha = flash;
      blit(ctx, c, flashOf(c));
      ctx.globalAlpha = 1;
    }
    if (G.bid === 'boingBox') drawBoxLive(ctx, b, G, T, ws, need, fr);
    else if (G.bid === 'beanPatch') drawPatchLive(ctx, b, G, f, wilt, age, t, battle);
    ctx.restore();
    if (G.bid === 'wreckingCrane') drawCraneLive(ctx, b, G, f, x + shake);
  }

  function drawBoxLive(ctx, b, G, T, ws, need, fr) {
    const P = b.punch || {};
    const dir = P.dir ? Math.sign(P.dir) : faceOf(b);
    const ext = clamp(num(P.ext, 0), 0, 1);
    const pt = num(P.t, 0);
    if (ext > 0.02) drawPunch(ctx, dir, ext, G.reach, P.phase, pt);
    const [lift, tilt] = lidPose(P, dir);
    const lc = lid(b.team, T, ws);
    lc.update(need, fr);
    ctx.save();
    ctx.translate(-dir * BOX.lidW * 0.45, -BOX.body - lift);
    ctx.rotate(tilt);
    ctx.translate(dir * BOX.lidW * 0.45, 0);
    blit(ctx, lc);
    ctx.restore();
  }

  function drawPatchLive(ctx, b, G, f, wilt, age, t, battle) {
    const S = b.spawn || {};
    // spawn.next: seconds to the next pop (a countdown, reset to `every` by a pop); an
    // absolute age works too (it is then later than `every`, so it reads as one)
    const raw = num(S.next, 99);
    const next = raw > G.every + 1e-6 && raw < 90 ? raw - age : raw;
    const kids = Array.isArray(S.kids) ? S.kids.length : 0;
    const armed = age >= G.arm - 0.45;
    // Shakes just before a pop; the front tuft is the one that pops, then regrows. A full
    // patch (max Sprouts alive) pops nothing when its countdown runs out, it only waits
    // another half second: no shake then. (Without the battle every kid counts as alive.)
    const full = liveKids(S, battle, kids) >= G.max;
    const shake = armed && !full && next > 0 && next < 0.45 ? 1 - next / 0.45 : 0;
    const since = G.every - next;
    const grow = kids > 0 && since >= 0 && since < 1 ? easeOut(since) : 1;
    drawTufts(ctx, f, wilt, shake, t, grow);
  }

  /** How many of a patch's Sprouts are alive, as the sim counts them (spawn.kids holds unit ids). */
  function liveKids(S, battle, kids) {
    const units = battle && battle.units;
    if (!kids || !Array.isArray(units)) return kids;
    let n = 0;
    for (const id of S.kids) {
      for (const u of units) {
        if (u.id !== id) continue;
        if (u.alive) n++;
        break;
      }
    }
    return n;
  }

  function drawCraneLive(ctx, b, G, f, x) {
    const P = G.P;
    const B = b.ball || {};
    const ang = num(B.ang, 0);
    const [lx, ly] = ballAt(P, f, ang);
    const bx = num(B.x, x + lx);
    const by = num(B.y, ly);
    const px = x + f * num(P.pivotFwd, 34);
    const py = -num(P.pivotUp, 170) + 1.5;
    const r = num(P.r, 20);
    const dx = bx - px;
    const dy = by - py;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.hypot(num(B.vx, 0), num(B.vy, 0));
    const minHit = num(P.minHit, 260);
    if (sp >= minHit * 0.8) ballStreaks(ctx, bx, by, num(B.vx, 0), num(B.vy, 0), r, clamp((sp - minHit * 0.8) / (minHit * 0.6), 0.2, 1));
    drawChain(ctx, px, py, bx - (dx / d) * (r + 4), by - (dy / d) * (r + 4));
    drawCraneBall(ctx, bx, by, r, Math.atan2(-dx, dy));
  }

  return { draw, artTop, lifeShare, cache: sprites, lastError: null };
}
