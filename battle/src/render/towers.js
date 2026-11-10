// Arena towers: the Guard Tower (a round stone tower with a crossbow on top
// and a team banner) and the Castle (the castle art from background.js plus a
// cannon turret). Damage shows as cracks (below 66%), chipped stone, holes and
// smoke (below 33%); hits flash and shake the tower; a destroyed tower sinks
// into a rubble pile that stays for the rest of the match.
//
//   const towers = createTowerRenderer({ seed: 7 });
//   towers.palettes.blue = armyPalette;  // optional team palette overrides
//   towers.draw(ctx, battle, view);      // world space: after bg.drawBack, before the units
//   towers.drawBars(ctx, battle, view);  // world space: last, over everything (HP bars, z's)
//
// view = { t, dpr }: t = seconds for the idle animation (flags, smoke, z's),
// dpr = the canvas pixel ratio (default min(devicePixelRatio, 2) like main.js). ctx arrives with
// the camera applied; the zoom is read from its transform. Only plain tower
// fields are read (sim/towers.js): kind, team, x, w, h, f, hp, maxHp, alive,
// active, level, aim, shotT, hitT, downT. Missing ones fall back to defaults.
//
// Static art lives in offscreen caches (one per kind/team/colour/damage stage,
// shared by every match), so a tower costs a drawImage plus its weapon and flag.
//
// Buildings (kind 'building': Boing Box, Bean Patch, Wrecking Crane) live in
// battle.towers too; draw() hands them to render/buildings.js, and drawBars()
// gives them a smaller HP bar with a clock pie for the life they have left.

import { TEAMS } from '../config.js';
import { muzzle as simMuzzle } from '../sim/towers.js';
import { createBuildingRenderer, LAND_T } from './buildings.js';
import {
  Cached,
  CASTLE_BOX,
  CASTLE_LAYOUT,
  STONE,
  WOOD,
  arrowSlit,
  banner,
  bush,
  drawCastle,
  drawFlag,
  flagPole,
  merlons,
  mulberry32,
  rgba,
  roundShade,
  stoneBlocks,
} from './background.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (Number.isFinite(v) ? v : d);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

const COLLAPSE = { guard: 0.95, castle: 1.4 }; // seconds to sink into the rubble
const FLASH_T = 0.14; // white hit flash
const SHAKE_T = 0.22;
const SMOKE_BELOW = 0.34; // hp share below which a tower smokes
const INK = '#2a1d14';
const FONT = '"Arial Black", "Segoe UI Black", system-ui, sans-serif';
const BUILD_BW = 42; // a building's HP bar width (bar units; a guard tower's is 56)

const face = (t) => (t.f ? Math.sign(t.f) : t.team === 'red' ? -1 : 1);

/** Where the crossbow / cannon sits (world px): the sim's own muzzle, so bolts leave the weapon. */
function muzzleOf(t) {
  try {
    const m = simMuzzle(t);
    if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) return m;
  } catch (e) {
    // fall back to the layout below
  }
  return t.kind === 'castle' ? { x: t.x + face(t) * 34, y: -t.h - 10 } : { x: t.x, y: -t.h - 12 };
}

// --- small path helpers -------------------------------------------------------------

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function archPath(g, cx, base, hw, h) {
  g.moveTo(cx - hw, base);
  g.lineTo(cx - hw, base - h + hw);
  g.arc(cx, base - h + hw, hw, Math.PI, 0);
  g.lineTo(cx + hw, base);
  g.closePath();
}

/** A jagged blob (rubble block, bite, hole). */
function jagged(g, x, y, r, rnd, n = 7, k = 0.35) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd() - 0.5) * 0.5;
    const rr = r * (1 - k + rnd() * k * 1.6);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

// --- damage marks (painted into the caches) ---------------------------------------

function genCracks(rnd, n, x0, x1, y0, y1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let x = lerp(x0, x1, rnd());
    let y = lerp(y0, y1, rnd());
    let a = Math.PI / 2 + (rnd() - 0.5) * 2.4; // mostly running down the wall
    const pts = [[x, y]];
    const segs = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < segs; k++) {
      a += (rnd() - 0.5) * 1.4;
      const l = 5 + rnd() * 9;
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      pts.push([x, y]);
    }
    const br = rnd() < 0.65 ? 1 + Math.floor(rnd() * (pts.length - 2)) : -1;
    out.push({ pts, br, ba: a + (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.6), bl: 4 + rnd() * 6, w: 1.1 + rnd() * 0.7 });
  }
  return out;
}

/** Cracks only land on stone already painted (source-atop): tapering dark lines with a lit lower lip. */
function paintCracks(g, cracks) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = pass ? 'rgba(62,48,40,0.85)' : 'rgba(255,248,230,0.45)';
    const o = pass ? 0 : 0.8;
    for (const c of cracks) {
      const n = c.pts.length - 1;
      for (let i = 0; i < n; i++) {
        // Widest where it starts, thinning to a hairline at the far end
        g.lineWidth = Math.max(0.5, c.w * (1 - i / (n + 0.5))) + (pass ? 0 : 0.2);
        g.beginPath();
        g.moveTo(c.pts[i][0] + o, c.pts[i][1] + o);
        g.lineTo(c.pts[i + 1][0] + o, c.pts[i + 1][1] + o);
        g.stroke();
      }
      if (c.br >= 0) {
        const [bx, by] = c.pts[c.br];
        g.lineWidth = Math.max(0.5, c.w * 0.5);
        g.beginPath();
        g.moveTo(bx + o, by + o);
        g.lineTo(bx + Math.cos(c.ba) * c.bl + o, by + Math.sin(c.ba) * c.bl + o);
        g.stroke();
      }
    }
  }
  g.restore();
}

/** Missing blocks: dark recesses with a shadowed top and a lit bottom edge. */
function paintHoles(g, holes, rnd) {
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (const [x, y, r] of holes) {
    g.fillStyle = 'rgba(255,248,230,0.45)';
    g.beginPath();
    jagged(g, x + 0.8, y + 1.2, r, mulberry32(Math.floor(x * 31 + y * 7) >>> 0), 7, 0.3);
    g.fill();
    g.fillStyle = '#463d36';
    g.beginPath();
    jagged(g, x, y, r, mulberry32(Math.floor(x * 31 + y * 7) >>> 0), 7, 0.3);
    g.fill();
    g.fillStyle = '#2b2420';
    g.beginPath();
    g.ellipse(x, y - r * 0.3, r * 0.75, r * 0.45, 0, 0, TAU);
    g.fill();
    // a loose stone or two hanging in it
    if (rnd() < 0.6) {
      g.fillStyle = STONE.blocks[Math.floor(rnd() * STONE.blocks.length)];
      g.fillRect(x - r * 0.5, y + r * 0.15, r * 0.7, r * 0.45);
    }
  }
  g.restore();
}

/** Knock chunks off the silhouette (destination-out). */
function paintBites(g, bites, rnd) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (const [x, y, r] of bites) {
    g.beginPath();
    jagged(g, x, y, r, rnd, 8, 0.4);
    g.fill();
  }
  g.restore();
}

// --- Guard Tower art ------------------------------------------------------------------

function smallDoor(g, cx, base, w, h) {
  const hw = w / 2;
  g.fillStyle = STONE.light;
  g.beginPath();
  archPath(g, cx, base, hw + 3, h + 3);
  g.fill();
  g.fillStyle = '#3b2b20';
  g.beginPath();
  archPath(g, cx, base, hw, h);
  g.fill();
  g.save();
  g.beginPath();
  archPath(g, cx, base, hw - 1.4, h - 1.4);
  g.clip();
  for (let i = 0; i < 3; i++) {
    const px = cx - hw + 1.4 + (i * (w - 2.8)) / 3;
    g.fillStyle = i % 2 ? WOOD.light : WOOD.base;
    g.fillRect(px, base - h, (w - 2.8) / 3, h);
    g.fillStyle = WOOD.dark;
    g.fillRect(px, base - h, 0.8, h);
  }
  g.fillStyle = WOOD.iron;
  g.fillRect(cx - hw, base - h * 0.32, w, 2.2);
  g.fillRect(cx - hw, base - h * 0.7, w, 2.2);
  const sh = g.createLinearGradient(0, base - h, 0, base - h + hw + 5);
  sh.addColorStop(0, 'rgba(30,18,10,0.45)');
  sh.addColorStop(1, 'rgba(30,18,10,0)');
  g.fillStyle = sh;
  g.fillRect(cx - hw, base - h, w, hw + 5);
  g.restore();
}

/** Guard Tower in local coords: base centre at (0, 0), forward = +x when f = 1. */
function paintGuard(g, W, H, f, T, seed, stage) {
  const rnd = mulberry32(seed);
  const hw = W / 2;
  const pTop = -H; // the fighting platform (the crossbow stands on it)
  const pBot = -H + 14;
  g.fillStyle = 'rgba(40,70,20,0.28)';
  g.beginPath();
  g.ellipse(3, 1.5, hw + 18, 6.5, 0, 0, TAU);
  g.fill();
  // Shaft
  stoneBlocks(g, -hw, pBot, hw, -12, rnd, 10);
  roundShade(g, -hw, pBot, hw, -12);
  const ao = g.createLinearGradient(0, -46, 0, -12);
  ao.addColorStop(0, 'rgba(40,32,26,0)');
  ao.addColorStop(1, 'rgba(40,32,26,0.2)');
  g.fillStyle = ao;
  g.fillRect(-hw, -46, W, 34);
  // Plinth
  stoneBlocks(g, -hw - 5, -13, hw + 5, 0, rnd, 6.5);
  roundShade(g, -hw - 5, -13, hw + 5, 0);
  g.fillStyle = 'rgba(255,250,235,0.3)';
  g.fillRect(-hw - 5, -13, W + 10, 1.2);
  g.fillStyle = 'rgba(40,32,26,0.25)';
  g.fillRect(-hw, -13.6, W, 1.2);
  // Corbels under the parapet
  g.fillStyle = STONE.dark;
  for (let cx = -hw + 3; cx < hw - 2; cx += 7) {
    g.beginPath();
    g.moveTo(cx - 2.6, pBot);
    g.lineTo(cx + 2.6, pBot);
    g.lineTo(cx, pBot + 5.5);
    g.closePath();
    g.fill();
  }
  // Parapet and battlements
  stoneBlocks(g, -hw - 6, pTop, hw + 6, pBot, rnd, 7);
  roundShade(g, -hw - 6, pTop, hw + 6, pBot);
  g.fillStyle = 'rgba(40,32,26,0.38)';
  g.fillRect(-hw - 6, pBot - 1.4, W + 12, 1.6);
  merlons(g, -hw - 6, hw + 6, pTop, 11, rnd);
  // Damage first (the same seeded marks at every stage, more the lower it gets), so the banner hangs over it
  const dr = mulberry32(seed ^ 0x51ed27);
  const cracks = genCracks(dr, 8, -hw * 0.85, hw * 0.85, pTop + 4, -16);
  if (stage >= 1) paintCracks(g, cracks.slice(0, stage >= 2 ? 8 : 3));
  if (stage >= 2) paintHoles(g, [[-hw * 0.5, pBot + 50, 6], [hw * 0.52, pBot + 94, 5.5], [-hw * 0.3, -40, 5]], dr);
  // Team banner, an arrow slit and a little door
  banner(g, 0, pBot + 9, 22, 40, T);
  arrowSlit(g, 0, pBot + 66, 13);
  smallDoor(g, 0, 0, 16, 27);
  // Moss and bushes at the foot
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(90,140,50,${0.18 + rnd() * 0.2})`;
    g.beginPath();
    g.ellipse(lerp(-hw - 3, hw + 3, rnd()), -rnd() * 18, 2.5 + rnd() * 5, 1.4 + rnd() * 2, 0, 0, TAU);
    g.fill();
  }
  bush(g, -hw - 9 * f, 1, 6.5, rnd);
  bush(g, hw * f + 8 * f, 1, 5, rnd);
  if (stage >= 2) paintBites(g, [[hw + 5 * f, pTop - 9, 8], [-hw - 5 * f, pBot - 2, 6.5]], dr);
}

// --- Castle art (+ the cannon turret) ----------------------------------------------------

/**
 * The background castle plus a round gun turret on the wall walk under the
 * cannon (painted first, so the curtain wall and the front tower stand in front of it).
 */
function paintCastle(g, team, seed, T, lx, ly, stage) {
  const rnd = mulberry32(seed + 3);
  const wallTop = CASTLE_LAYOUT.wall.top;
  const yF = ly + 12; // turret floor: the cannon carriage stands on it
  if (yF < wallTop - 14) {
    const x0 = lx - 20;
    const x1 = lx + 20;
    stoneBlocks(g, x0, yF + 8, x1, wallTop + 8, rnd, 9);
    roundShade(g, x0, yF + 8, x1, wallTop + 8);
    g.fillStyle = STONE.dark;
    for (let cx = x0 + 3; cx < x1 - 2; cx += 7) {
      g.beginPath();
      g.moveTo(cx - 2.4, yF + 8);
      g.lineTo(cx + 2.4, yF + 8);
      g.lineTo(cx, yF + 13);
      g.closePath();
      g.fill();
    }
    stoneBlocks(g, x0 - 3, yF, x1 + 3, yF + 8, rnd, 4);
    roundShade(g, x0 - 3, yF, x1 + 3, yF + 8);
    g.fillStyle = 'rgba(40,32,26,0.35)';
    g.fillRect(x0 - 3, yF + 7, x1 - x0 + 6, 1.4);
    merlons(g, x0 - 3, x1 + 3, yF, 7, rnd);
    // Team shield on the turret
    const sy = yF + 22;
    g.fillStyle = T.dark;
    g.beginPath();
    g.arc(lx, sy, 7.4, 0, TAU);
    g.fill();
    g.fillStyle = T.body;
    g.beginPath();
    g.arc(lx, sy, 5.8, 0, TAU);
    g.fill();
    g.fillStyle = '#f7f5ef';
    g.beginPath();
    g.moveTo(lx, sy - 3.4);
    g.lineTo(lx + 2.6, sy);
    g.lineTo(lx, sy + 3.4);
    g.lineTo(lx - 2.6, sy);
    g.closePath();
    g.fill();
  }
  drawCastle(g, team, seed, T);
  const dr = mulberry32(seed ^ 0x2c1b3c);
  const cracks = genCracks(dr, 12, -100, 100, -150, -14);
  if (stage >= 1) paintCracks(g, cracks.slice(0, stage >= 2 ? 12 : 5));
  if (stage >= 2) {
    const dir = TEAMS[team].dir;
    paintHoles(g, [[-40 * dir, -60, 7], [55 * dir, -40, 6], [-88 * dir, -100, 6], [8 * dir, -128, 5]], dr);
    const fr = CASTLE_LAYOUT.front;
    const fx = ((fr.a + fr.b) / 2) * dir;
    paintBites(g, [[fx + 8 * dir, fr.top - fr.roof * 0.55, 9], [-60 * dir, CASTLE_LAYOUT.wall.top - 6, 7], [-96 * dir, CASTLE_LAYOUT.rear.top + 4, 7]], dr);
  }
}

// --- Rubble ----------------------------------------------------------------------------

/** A broken stump of wall with a jagged top. */
function stump(g, x0, x1, hMin, hMax, rnd) {
  const top = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i <= n; i++) top.push([lerp(x0, x1, i / n), -lerp(hMin, hMax, rnd())]);
  g.save();
  g.beginPath();
  g.moveTo(x0, 1);
  for (const [x, y] of top) g.lineTo(x, y);
  g.lineTo(x1, 1);
  g.closePath();
  g.clip();
  stoneBlocks(g, x0, -hMax - 2, x1, 0, rnd, 10);
  roundShade(g, x0, -hMax - 2, x1, 0);
  g.restore();
  g.strokeStyle = 'rgba(70,58,50,0.75)';
  g.lineWidth = 1.6;
  g.lineJoin = 'round';
  g.beginPath();
  top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function rubbleBlock(g, x, y, w, h, rot, col) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = STONE.dark;
  g.beginPath();
  rrect(g, -w / 2 - 0.9, -h / 2 - 0.9, w + 1.8, h + 1.8, 2);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  rrect(g, -w / 2, -h / 2, w, h, 1.6);
  g.fill();
  g.fillStyle = 'rgba(255,252,240,0.4)';
  g.fillRect(-w / 2 + 0.8, -h / 2 + 0.6, w - 1.6, Math.max(1, h * 0.22));
  g.fillStyle = 'rgba(40,32,26,0.22)';
  g.fillRect(-w / 2 + 0.8, h / 2 - h * 0.25, w - 1.6, h * 0.22);
  g.restore();
}

/** A toppled cone roof lying on the heap (castle rubble). */
function fallenRoof(g, x, y, s, rot, T) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = T.shade;
  g.beginPath();
  g.moveTo(-s, s * 0.45);
  g.lineTo(s * 1.1, 0);
  g.lineTo(-s, -s * 0.45);
  g.quadraticCurveTo(-s * 1.25, 0, -s, s * 0.45);
  g.fill();
  g.fillStyle = T.body;
  g.beginPath();
  g.moveTo(-s, -s * 0.45);
  g.lineTo(s * 1.1, 0);
  g.lineTo(-s * 0.9, s * 0.1);
  g.closePath();
  g.fill();
  g.strokeStyle = rgba(T.dark, 0.5);
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i <= 3; i++) {
    const u = i / 4;
    g.moveTo(-s + u * s * 2.1, -s * 0.45 * (1 - u));
    g.lineTo(-s + u * s * 2.1, s * 0.45 * (1 - u));
  }
  g.stroke();
  g.fillStyle = '#e9c65a';
  g.beginPath();
  g.arc(s * 1.12, 0, 2, 0, TAU);
  g.fill();
  g.restore();
}

/** A torn scrap of the team banner draped over the stones. */
function bannerScrap(g, x, y, w, h, rot, T) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = T.dark;
  g.beginPath();
  g.moveTo(-w / 2, -h / 2);
  g.lineTo(w / 2, -h / 2 + 1);
  g.lineTo(w / 2 - 1, h / 2 - 2);
  g.lineTo(w * 0.2, h / 2 + 1);
  g.lineTo(-w * 0.05, h / 2 - 2.5);
  g.lineTo(-w * 0.3, h / 2 + 1);
  g.lineTo(-w / 2, h / 2 - 1);
  g.closePath();
  g.fill();
  g.fillStyle = T.body;
  g.beginPath();
  g.moveTo(-w / 2 + 1.4, -h / 2 + 1.4);
  g.lineTo(w / 2 - 1.4, -h / 2 + 2.2);
  g.lineTo(w / 2 - 2.4, h / 2 - 3.4);
  g.lineTo(-w / 2 + 1.4, h / 2 - 2.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#f7f5ef';
  g.beginPath();
  g.moveTo(0, -h * 0.22);
  g.lineTo(w * 0.16, 0);
  g.lineTo(0, h * 0.22);
  g.lineTo(-w * 0.16, 0);
  g.closePath();
  g.fill();
  g.restore();
}

function beam(g, x, y, l, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = WOOD.dark;
  g.fillRect(-l / 2 - 0.8, -2.8, l + 1.6, 5.6);
  g.fillStyle = WOOD.base;
  g.fillRect(-l / 2, -2, l, 4);
  g.fillStyle = WOOD.light;
  g.fillRect(-l / 2, -2, l, 1.2);
  // splintered end
  g.fillStyle = WOOD.base;
  g.beginPath();
  g.moveTo(l / 2, -2);
  g.lineTo(l / 2 + 3, -1);
  g.lineTo(l / 2 + 1, 0);
  g.lineTo(l / 2 + 4, 1.4);
  g.lineTo(l / 2, 2);
  g.closePath();
  g.fill();
  g.restore();
}

/** What's left of a tower: broken stumps and a heap of blocks, beams and banner scraps. */
function paintRubble(g, kind, team, W, T, seed) {
  const rnd = mulberry32(seed ^ 0x7f4a7c15);
  const big = kind === 'castle';
  const dir = TEAMS[team].dir;
  const R = big ? 120 : W * 0.5 + 24; // heap half width
  const HH = big ? 40 : 24; // heap height
  g.fillStyle = 'rgba(40,70,20,0.3)';
  g.beginPath();
  g.ellipse(2, 1.5, R + 12, 7, 0, 0, TAU);
  g.fill();
  if (big) {
    const L = CASTLE_LAYOUT;
    const span = (a, b) => (dir > 0 ? [a, b] : [-b, -a]);
    const [r0, r1] = span(L.rear.a, L.rear.b);
    const [k0, k1] = span(L.keep.a, L.keep.b);
    const [f0, f1] = span(L.front.a, L.front.b);
    stump(g, k0, k1, 44, 78, rnd);
    stump(g, r0, r1, 30, 58, rnd);
    stump(g, f0, f1, 22, 46, rnd);
  } else {
    stump(g, -W / 2, W / 2, 22, 46, rnd);
  }
  // The heap: a dusty mound, then blocks from the top of the pile down to its foot
  const heap = (x) => HH * Math.max(0, 1 - (x / R) ** 2) ** 0.8;
  const mound = g.createLinearGradient(0, -HH, 0, 0);
  mound.addColorStop(0, '#b4ab9f');
  mound.addColorStop(1, '#8a8176');
  g.fillStyle = mound;
  g.beginPath();
  g.moveTo(-R - 6, 2);
  for (let x = -R; x <= R; x += 8) g.lineTo(x, -heap(x) * (0.8 + rnd() * 0.3));
  g.lineTo(R + 6, 2);
  g.closePath();
  g.fill();
  const blocks = [];
  const n = big ? 46 : 22;
  for (let i = 0; i < n; i++) {
    const x = (rnd() + rnd() - 1) * R * 0.95;
    const y = -rnd() * heap(x) * 0.95 - 1;
    const w = (big ? 8 : 6) + rnd() * (big ? 12 : 8);
    blocks.push([x, y, w, w * (0.5 + rnd() * 0.3), (rnd() - 0.5) * 1.4, STONE.blocks[Math.floor(rnd() * STONE.blocks.length)]]);
  }
  blocks.sort((a, b) => a[1] - b[1]);
  const scrapAt = Math.floor(blocks.length * 0.45);
  blocks.forEach((b, i) => {
    rubbleBlock(g, ...b);
    if (i === scrapAt) {
      beam(g, b[0] - 10 * dir, b[1] - 3, big ? 34 : 24, -0.35 * dir);
      bannerScrap(g, b[0] + 6, b[1] - 2, 18, 15, 0.25 * dir, T);
      if (big) fallenRoof(g, -30 * dir, -HH * 0.75, 20, 0.2 * dir, T);
    }
  });
  if (big) bannerScrap(g, 70 * dir, -14, 16, 13, -0.4, T);
  // Grit
  g.fillStyle = 'rgba(70,58,50,0.5)';
  for (let i = 0; i < (big ? 60 : 26); i++) {
    const x = (rnd() * 2 - 1) * R;
    g.fillRect(x, -rnd() * heap(x), 1.4, 1.1);
  }
}

// --- Weapons (vector, every frame) ----------------------------------------------------

/** Crossbow on its post. Local +x along the aim; the string is drawn back as it reloads. */
function drawCrossbow(ctx, mx, my, aim, T, shotT) {
  const kick = 4 * Math.exp(-shotT * 16);
  const pull = clamp((shotT - 0.1) / 0.35, 0, 1);
  ctx.save();
  ctx.translate(mx, my);
  ctx.fillStyle = WOOD.dark;
  ctx.fillRect(-2.6, 0, 5.2, 12.5);
  ctx.fillStyle = WOOD.base;
  ctx.fillRect(-2.6, 0, 2, 12.5);
  ctx.rotate(aim);
  if (Math.cos(aim) < 0) ctx.scale(1, -1);
  ctx.translate(-kick, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Prod (the bow limbs), bending back further as it's drawn
  const bend = 3 + pull * 3.5;
  const tipX = 9 - bend;
  ctx.strokeStyle = '#3f444c';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(tipX, -15);
  ctx.quadraticCurveTo(12.5, -7, 11, 0);
  ctx.quadraticCurveTo(12.5, 7, tipX, 15);
  ctx.stroke();
  ctx.strokeStyle = '#a3acb6';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  // String
  const nut = lerp(9, -6, pull);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tipX, -15);
  ctx.lineTo(nut, 0);
  ctx.lineTo(tipX, 15);
  ctx.stroke();
  // Stock
  ctx.fillStyle = INK;
  ctx.beginPath();
  rrect(ctx, -17.5, -3.9, 31, 7.8, 2.6);
  ctx.fill();
  ctx.fillStyle = WOOD.base;
  ctx.beginPath();
  rrect(ctx, -16.5, -2.9, 29, 5.8, 2);
  ctx.fill();
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(-15.5, -2.9, 27, 1.6);
  ctx.fillStyle = T.body;
  ctx.fillRect(-9, -3.2, 4, 6.4);
  ctx.fillStyle = T.dark;
  ctx.fillRect(-9, 2, 4, 1.2);
  // Bolt, nocked once the string is back
  if (pull > 0.85) {
    ctx.strokeStyle = '#c9a06a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(nut, -2.4);
    ctx.lineTo(nut + 24, -2.4);
    ctx.stroke();
    ctx.fillStyle = '#4b4f57';
    ctx.beginPath();
    ctx.moveTo(nut + 28, -2.4);
    ctx.lineTo(nut + 22, -5);
    ctx.lineTo(nut + 22, 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = T.light;
    ctx.beginPath();
    ctx.moveTo(nut + 6, -2.4);
    ctx.lineTo(nut, -5.6);
    ctx.lineTo(nut + 1.5, -2.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Cannon on a little carriage. Recoils back along the barrel and flashes when it fires. */
function drawCannon(ctx, mx, my, aim, T, shotT, f) {
  const kick = 7 * Math.exp(-shotT * 9);
  ctx.save();
  ctx.translate(mx, my);
  // Carriage and wheel (they don't turn)
  ctx.fillStyle = INK;
  ctx.beginPath();
  rrect(ctx, -11, 1.5, 22, 10, 2.5);
  ctx.fill();
  ctx.fillStyle = WOOD.base;
  ctx.beginPath();
  rrect(ctx, -10, 2.5, 20, 8, 2);
  ctx.fill();
  ctx.fillStyle = WOOD.light;
  ctx.fillRect(-9, 2.5, 18, 1.6);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-f * 5, 9.5, 5.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = WOOD.dark;
  ctx.beginPath();
  ctx.arc(-f * 5, 9.5, 4.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9aa2ab';
  ctx.beginPath();
  ctx.arc(-f * 5, 9.5, 1.5, 0, TAU);
  ctx.fill();
  ctx.rotate(aim);
  if (Math.cos(aim) < 0) ctx.scale(1, -1);
  ctx.translate(-kick, 0);
  // Barrel: a fat tapered tube with a swollen muzzle and a knob on the breech
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-14.5, 0, 3.6, 0, TAU);
  ctx.fill();
  const body = (o) => {
    ctx.beginPath();
    ctx.moveTo(-12 - o, -6.6 - o);
    ctx.lineTo(14, -4.6 - o);
    ctx.lineTo(14, -5.8 - o);
    ctx.lineTo(19.5 + o, -5.8 - o);
    ctx.lineTo(19.5 + o, 5.8 + o);
    ctx.lineTo(14, 5.8 + o);
    ctx.lineTo(14, 4.6 + o);
    ctx.lineTo(-12 - o, 6.6 + o);
    ctx.quadraticCurveTo(-17 - o, 0, -12 - o, -6.6 - o);
    ctx.closePath();
  };
  body(1.1);
  ctx.fill();
  body(0);
  ctx.fillStyle = '#434852';
  ctx.fill();
  ctx.fillStyle = '#626a76';
  ctx.beginPath();
  ctx.moveTo(-11, -5.4);
  ctx.lineTo(18.5, -4.6);
  ctx.lineTo(18.5, -2.4);
  ctx.lineTo(-11, -2.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(-9, -4.4, 26, 1.1);
  ctx.fillStyle = T.body;
  ctx.fillRect(-8, -6.3, 4, 12.6);
  ctx.fillStyle = T.light;
  ctx.fillRect(-8, -6.3, 4, 2.4);
  ctx.fillStyle = '#2a2e35';
  ctx.fillRect(4, -5.3, 1.8, 10.6);
  ctx.fillStyle = '#121216';
  ctx.beginPath();
  ctx.ellipse(19.5, 0, 1.3, 3.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9aa2ab';
  ctx.beginPath();
  ctx.arc(0, 1, 2.4, 0, TAU);
  ctx.fill();
  // Muzzle flash
  if (shotT < 0.09) {
    const k = 1 - shotT / 0.09;
    const R = 7 + 9 * k;
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? '#fffbe2' : '#ffb02e';
      const r = layer ? R * 0.55 : R;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        const rr = i % 2 ? r * 0.45 : r * (1 + 0.5 * Math.max(0, Math.cos(a)));
        const px = 22 + r * 0.6 + Math.cos(a) * rr;
        const py = Math.sin(a) * rr * 0.75;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// --- Smoke, flames, z's -------------------------------------------------------------------

/** A looping smoke plume (no particles: a few puffs on a clock, drifting downwind). */
function drawSmoke(ctx, x, y, t, k, seed, n = 6) {
  for (let i = 0; i < n; i++) {
    const ph = (((t * 0.42 + i / n + seed * 0.137) % 1) + 1) % 1;
    const px = x + Math.sin(ph * 5 + i * 2.1 + seed) * 5 * ph + ph * 30;
    const py = y - ph * 84;
    const r = (5 + ph * 15) * (0.7 + 0.3 * k);
    const a = (ph < 0.15 ? ph / 0.15 : 1 - (ph - 0.15) / 0.85) * 0.6 * k;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#5a5552';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8a847e';
    ctx.beginPath();
    ctx.arc(px - r * 0.08, py - r * 0.17, r * 0.84, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFlame(ctx, x, y, s, t, seed) {
  const fl = 0.85 + 0.15 * Math.sin(t * 23 + seed) + 0.08 * Math.sin(t * 37 + seed * 2);
  for (let layer = 0; layer < 3; layer++) {
    const k = [1, 0.66, 0.36][layer];
    ctx.fillStyle = ['#e8541b', '#ffa22e', '#fff1a8'][layer];
    const h = s * 2.1 * fl * k;
    const w = s * 0.75 * k;
    const lean = Math.sin(t * 9 + seed) * s * 0.25;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 1.1, y - h * 0.55, x + lean, y - h);
    ctx.quadraticCurveTo(x + w * 1.1, y - h * 0.55, x + w, y);
    ctx.quadraticCurveTo(x, y + w * 0.5, x - w, y);
    ctx.fill();
  }
}

function drawZ(ctx, x, y, size, rot, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.28;
  ctx.strokeStyle = '#2e3a5c';
  ctx.strokeText('z', 0, 0);
  ctx.fillStyle = '#eef4ff';
  ctx.fillText('z', 0, 0);
  ctx.restore();
}

/** A tiny crown for the castle's level badge. */
function crownPath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.lineTo(x - w / 2, y - h * 0.15);
  ctx.lineTo(x - w * 0.27, y + h * 0.12);
  ctx.lineTo(x, y - h / 2);
  ctx.lineTo(x + w * 0.27, y + h * 0.12);
  ctx.lineTo(x + w / 2, y - h * 0.15);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.closePath();
}

// --- The renderer ----------------------------------------------------------------------

/**
 * createTowerRenderer({ seed }) -> {
 *   palettes,                        // { blue?, red? } team palette overrides (like UnitRenderer.palettes)
 *   draw(ctx, battle, view),         // tower bodies, weapons, flags, smoke, collapse and rubble
 *   drawBars(ctx, battle, view),     // HP bars with level badges, sleeping castle z's
 *   artTop(tower),                   // world y of the top of a tower's art (to place UI above it)
 *   lastError,                       // the last error swallowed while drawing (null if none)
 * }
 */
export function createTowerRenderer(opts = {}) {
  const seed = (opts.seed == null ? 7 : opts.seed) >>> 0;
  const sprites = new Map(); // `${kind}|${team}|${colour}|${w}x${h}|${stage}|muzzle` -> Cached
  const rubbles = new Map();
  const shown = new WeakMap(); // tower -> hp share shown by the trailing damage chip
  const barCache = new WeakMap(); // tower -> { cv, key }: its HP bar, repainted only on change
  const zCache = new Map(); // px size -> 'z' sprite
  const builds = createBuildingRenderer({ seed });
  let lastT = null;

  const R = {
    palettes: {},
    lastError: null,
    draw,
    drawBars,
    artTop,
  };

  const pal = (team) => R.palettes[team] || TEAMS[team] || TEAMS.blue;
  const seedFor = (kind, team) => seed + (kind === 'castle' ? 31 : 11) + (team === 'red' ? 26 : 0);

  function sprite(tw, stage, T, lx, ly) {
    const castle = tw.kind === 'castle';
    const W = num(tw.w, 64);
    const H = num(tw.h, 150);
    const key = `${tw.kind}|${tw.team}|${T.body}|${W}x${H}|${stage}|${Math.round(lx)},${Math.round(ly)}`;
    let c = sprites.get(key);
    if (c) return c;
    const s = seedFor(tw.kind, tw.team);
    const f = face(tw);
    if (castle) {
      const B = CASTLE_BOX;
      const y0 = Math.min(B.y, ly - 30);
      c = new Cached({ x: B.x, y: y0, w: B.w, h: B.y + B.h - y0, maxPx: 1.6e6, slack: 0.85, paint: (g) => paintCastle(g, tw.team, s, T, lx, ly, stage) });
    } else {
      c = new Cached({ x: -W / 2 - 34, y: -H - 16, w: W + 68, h: H + 26, maxPx: 6e5, slack: 0.85, paint: (g) => paintGuard(g, W, H, f, T, s, stage) });
    }
    sprites.set(key, c);
    return c;
  }

  function rubble(tw, T) {
    const castle = tw.kind === 'castle';
    const W = num(tw.w, 64);
    const key = `${tw.kind}|${tw.team}|${T.body}|${W}`;
    let c = rubbles.get(key);
    if (c) return c;
    const box = castle ? { x: -150, y: -96, w: 300, h: 106 } : { x: -W / 2 - 40, y: -60, w: W + 80, h: 70 };
    c = new Cached({ ...box, maxPx: 1e6, slack: 0.85, paint: (g) => paintRubble(g, tw.kind, tw.team, W, T, seedFor(tw.kind, tw.team)) });
    rubbles.set(key, c);
    return c;
  }

  /** A white silhouette of a sprite, for the hit flash (rebuilt when the sprite is). */
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

  function blit(ctx, c, img = c.canvas) {
    ctx.drawImage(img, c.x, c.y, c.w, c.h);
  }

  /** Sprite + flag + weapon in local coords (origin = tower base centre). */
  function standing(ctx, tw, c, T, t, lx, ly, f, flash) {
    blit(ctx, c);
    const castle = tw.kind === 'castle';
    const H = num(tw.h, 150);
    if (castle) {
      const fp = flagPole(tw.team);
      drawFlag(ctx, fp.x, fp.y1 + 1, T, t, tw.team === 'red' ? 2.1 : 0);
    } else {
      // Pennant on a pole at the back of the platform
      const px = -f * (num(tw.w, 64) / 2 + 3);
      const top = -H - 46;
      ctx.fillStyle = '#5b4a3a';
      ctx.fillRect(px - 1.1, top, 2.2, 36);
      ctx.save();
      ctx.translate(px, top + 2);
      ctx.scale(0.62, 0.62);
      drawFlag(ctx, 0, 0, T, t, tw.team === 'red' ? 3.3 : 1.2);
      ctx.restore();
      ctx.fillStyle = '#e9c65a';
      ctx.beginPath();
      ctx.arc(px, top - 1, 2.3, 0, TAU);
      ctx.fill();
    }
    const aim = num(tw.aim, f > 0 ? 0.12 : Math.PI - 0.12);
    const shotT = num(tw.shotT, 99);
    if (castle) drawCannon(ctx, lx, ly, aim, T, shotT, f);
    else drawCrossbow(ctx, lx, ly, aim, T, shotT);
    if (flash > 0.01) {
      ctx.globalAlpha = flash;
      blit(ctx, c, flashOf(c));
      ctx.globalAlpha = 1;
    }
  }

  function drawTower(ctx, tw, t, need, fr) {
    const castle = tw.kind === 'castle';
    const T = pal(tw.team);
    const f = face(tw);
    const x = num(tw.x, 0);
    const H = num(tw.h, 150);
    const frac = tw.maxHp > 0 ? clamp(num(tw.hp, 0) / tw.maxHp, 0, 1) : 1;
    const destroyed = tw.alive === false;
    const stage = destroyed ? 2 : frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    const M = muzzleOf(tw);
    const lx = M.x - x;
    const ly = M.y;
    const c = sprite(tw, stage, T, lx, ly);
    const sd = (seedFor(tw.kind, tw.team) % 97) / 9.7;
    if (!destroyed) {
      c.update(need, fr);
      const ht = num(tw.hitT, 99);
      const shake = ht < SHAKE_T ? Math.sin(ht * 95) * 2.4 * (1 - ht / SHAKE_T) : 0;
      ctx.save();
      ctx.translate(x + shake, 0);
      standing(ctx, tw, c, T, t, lx, ly, f, ht < FLASH_T ? (1 - ht / FLASH_T) * 0.75 : 0);
      ctx.restore();
      if (frac < SMOKE_BELOW) {
        const k = 0.45 + 0.55 * (1 - frac / SMOKE_BELOW);
        if (castle) {
          const fp = flagPole(tw.team);
          drawSmoke(ctx, x + fp.x + 6, -172, t, k, sd);
          drawSmoke(ctx, x - fp.x * 2.6, -110, t + 0.37, k * 0.8, sd + 3, 5);
        } else drawSmoke(ctx, x + 10, -H - 6, t, k, sd);
        if (frac < 0.18) {
          if (castle) {
            drawFlame(ctx, x - 40 * f, -58, 6, t, sd);
            drawFlame(ctx, x + 8 * f, -126, 5, t, sd + 1);
          } else drawFlame(ctx, x - num(tw.w, 64) * 0.22, -H + 70, 5.5, t, sd);
        }
      }
      return;
    }
    // Destroyed: sink into the ground behind a growing heap of rubble
    const downT = Math.max(0, num(tw.downT, 99));
    const dur = COLLAPSE[castle ? 'castle' : 'guard'];
    const p = clamp((downT - 0.06) / dur, 0, 1);
    const rb = rubble(tw, T);
    rb.update(need, fr);
    if (p < 1) {
      c.update(need, fr);
      const sink = p * p * (castle ? 270 : H + 30);
      const tilt = (castle ? 0.05 : 0.12) * p * p * -f;
      const shake = Math.sin(downT * 47) * 2.6 * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 400, -1200, 800, 1203);
      ctx.clip();
      ctx.translate(x + shake, sink);
      ctx.rotate(tilt);
      standing(ctx, tw, c, T, t, lx, ly, f, downT < 0.12 ? 0.8 * (1 - downT / 0.12) : 0);
      ctx.restore();
    }
    const grow = easeOut(clamp(p * 1.5 + 0.05, 0, 1));
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(lerp(0.85, 1, grow), grow);
    blit(ctx, rb);
    ctx.restore();
    if (downT < 9) drawSmoke(ctx, x + 6, castle ? -50 : -26, t, 0.55 * (1 - downT / 9), sd + 5, 5);
  }

  function draw(ctx, battle, view = {}) {
    const towers = battle && battle.towers;
    if (!ctx || !towers || !towers.length) return;
    const t = num(typeof view === 'number' ? view : view && view.t, 0);
    const m = ctx.getTransform();
    const need = Math.hypot(m.a, m.b) || 1; // device px per world px
    const fr = { rebuilds: 2 }; // at most two cache re-paints per frame once they exist
    for (const tw of towers) {
      ctx.save();
      try {
        if (tw.kind === 'building') builds.draw(ctx, tw, t, pal(tw.team), need, fr);
        else drawTower(ctx, tw, t, need, fr);
      } catch (e) {
        R.lastError = e; // scenery must never break a frame (kept for debugging)
      }
      ctx.restore();
    }
  }

  /** World y of the top of a tower's art (flag / pennant tip). */
  function artTop(tw) {
    if (tw.kind === 'building') return builds.artTop(tw);
    return tw.kind === 'castle' ? CASTLE_BOX.y - 2 : -num(tw.h, 150) - 48;
  }

  /** Paint one HP bar in bar units, origin at the bar group's centre. */
  function paintBar(g, castle, T, frac, s, hit, txt, lv) {
    const BW = castle ? 74 : 56;
    const BH = 11;
    const gx = -(BW + 15) / 2; // badge + bar, centred on the tower
    const bx = gx + 15;
    g.fillStyle = 'rgba(26,20,38,0.82)';
    g.beginPath();
    rrect(g, bx - 2, -BH / 2 - 2, BW + 4, BH + 4, 5);
    g.fill();
    g.fillStyle = '#3d3752';
    g.beginPath();
    rrect(g, bx, -BH / 2, BW, BH, 3.5);
    g.fill();
    g.save();
    g.beginPath();
    rrect(g, bx, -BH / 2, BW, BH, 3.5);
    g.clip();
    if (s > frac) {
      g.fillStyle = '#ffe7b0'; // the chunk just lost, draining away
      g.fillRect(bx, -BH / 2, BW * s, BH);
    }
    g.fillStyle = hit ? '#ffffff' : T.body;
    g.fillRect(bx, -BH / 2, BW * frac, BH);
    if (!hit) {
      g.fillStyle = rgba(T.light, 0.75);
      g.fillRect(bx, -BH / 2, BW * frac, BH * 0.38);
      g.fillStyle = rgba(T.dark, 0.35);
      g.fillRect(bx, BH / 2 - 2, BW * frac, 2);
    }
    g.restore();
    g.font = `900 9px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 2.6;
    g.strokeStyle = 'rgba(20,14,30,0.9)';
    g.strokeText(txt, bx + BW / 2, 0.6);
    g.fillStyle = '#ffffff';
    g.fillText(txt, bx + BW / 2, 0.6);
    // Level badge (with a crown on the castle's)
    const cx = gx + 7;
    if (castle) {
      crownPath(g, cx, -BH / 2 - 6.5, 15, 10);
      g.lineWidth = 2.4;
      g.strokeStyle = INK;
      g.stroke();
      g.fillStyle = '#ffd34d';
      g.fill();
      g.fillStyle = '#fff3b8';
      g.fillRect(cx - 5.5, -BH / 2 - 4.5, 11, 1.4);
    }
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx, 0, 9.4, 0, TAU);
    g.fill();
    g.fillStyle = castle ? '#ffd34d' : '#f2efe6';
    g.beginPath();
    g.arc(cx, 0, 8.3, 0, TAU);
    g.fill();
    g.fillStyle = T.dark;
    g.beginPath();
    g.arc(cx, 0, 6.6, 0, TAU);
    g.fill();
    g.fillStyle = T.body;
    g.beginPath();
    g.arc(cx, -0.8, 5.6, 0, TAU);
    g.fill();
    g.lineWidth = 2.4;
    g.strokeStyle = rgba(T.dark, 0.9);
    g.strokeText(lv, cx, 0.7);
    g.fillStyle = '#ffffff';
    g.fillText(lv, cx, 0.7);
  }

  /**
   * A building's HP bar, smaller than a tower's, with a clock pie where the
   * level badge would be: the team-colour wedge is the life it has left.
   */
  function paintBuildingBar(g, T, frac, s, hit, txt, life) {
    const BW = BUILD_BW;
    const BH = 9;
    const gx = -(BW + 13) / 2;
    const bx = gx + 13;
    g.fillStyle = 'rgba(26,20,38,0.82)';
    g.beginPath();
    rrect(g, bx - 2, -BH / 2 - 2, BW + 4, BH + 4, 4.5);
    g.fill();
    g.fillStyle = '#3d3752';
    g.beginPath();
    rrect(g, bx, -BH / 2, BW, BH, 3);
    g.fill();
    g.save();
    g.beginPath();
    rrect(g, bx, -BH / 2, BW, BH, 3);
    g.clip();
    if (s > frac) {
      g.fillStyle = '#ffe7b0';
      g.fillRect(bx, -BH / 2, BW * s, BH);
    }
    g.fillStyle = hit ? '#ffffff' : T.body;
    g.fillRect(bx, -BH / 2, BW * frac, BH);
    if (!hit) {
      g.fillStyle = rgba(T.light, 0.75);
      g.fillRect(bx, -BH / 2, BW * frac, BH * 0.38);
    }
    g.restore();
    g.font = `900 8px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 2.4;
    g.strokeStyle = 'rgba(20,14,30,0.9)';
    g.strokeText(txt, bx + BW / 2, 0.6);
    g.fillStyle = '#ffffff';
    g.fillText(txt, bx + BW / 2, 0.6);
    // The clock: elapsed life stays pale, what is left is the team wedge, a hand between them
    const cx = gx + 5.5;
    const r = 7.2;
    const a0 = -Math.PI / 2 + clamp(life, 0, 1) * TAU;
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx, 0, r + 1.4, 0, TAU);
    g.fill();
    g.fillStyle = '#f2efe6';
    g.beginPath();
    g.arc(cx, 0, r, 0, TAU);
    g.fill();
    if (life < 0.999) {
      g.fillStyle = T.body;
      g.beginPath();
      g.moveTo(cx, 0);
      g.arc(cx, 0, r - 0.6, a0, -Math.PI / 2 + TAU);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx, 0);
    g.lineTo(cx + Math.cos(a0) * (r - 1), Math.sin(a0) * (r - 1));
    g.moveTo(cx, -r + 0.4);
    g.lineTo(cx, -r + 2.2);
    g.stroke();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx, 0, 1.3, 0, TAU);
    g.fill();
  }

  /** A building's bar waits for its crate to land, then pops in (0..1). */
  function landedK(tw) {
    const age = num(tw.age, 99);
    if (num(tw.landT, age) < LAND_T) return 0;
    return clamp((age - LAND_T) / 0.15, 0, 1);
  }

  /** Local box of a bar group (badge or clock, crown, bar) in bar units, origin at its anchor. */
  function barBox(tw) {
    if (tw.kind === 'building') return { x0: -(BUILD_BW + 13) / 2 - 4, y0: -12, w: BUILD_BW + 21, h: 22 };
    const BW = tw.kind === 'castle' ? 74 : 56;
    return { x0: -(BW + 15) / 2 - 4, y0: -20, w: BW + 23, h: 30 };
  }

  /** One tower's HP bar: repainted into its own little canvas only when it changes. */
  function bar(ctx, tw, u, X, Y, dt) {
    const castle = tw.kind === 'castle';
    const T = pal(tw.team);
    const frac = tw.maxHp > 0 ? clamp(num(tw.hp, 0) / tw.maxHp, 0, 1) : 0;
    let s = shown.get(tw);
    if (s == null || frac > s) s = frac;
    else s = Math.max(frac, s - dt * 0.55);
    shown.set(tw, s);
    let alpha = 1;
    if (tw.alive === false) {
      alpha = 1 - clamp(num(tw.downT, 9) / 0.5, 0, 1);
      if (alpha <= 0) return;
    }
    const building = tw.kind === 'building';
    if (building) {
      alpha *= landedK(tw);
      if (alpha <= 0) return;
    }
    const BW = castle ? 74 : building ? BUILD_BW : 56;
    const hit = num(tw.hitT, 99) < 0.08;
    const txt = String(Math.max(0, Math.ceil(num(tw.hp, 0))));
    const lv = String(Math.max(1, num(tw.level, 1) | 0));
    // A building's clock: the share of its life used, in 1/48 steps
    const life = building ? Math.round(builds.lifeShare(tw) * 48) / 48 : 0;
    const { x0, y0, w, h } = barBox(tw);
    const key = `${u.toFixed(3)}|${T.body}|${castle}|${building}|${txt}|${lv}|${life}|${Math.round(frac * BW * 3)}|${Math.round(s * BW * 3)}|${hit}`;
    let c = barCache.get(tw);
    if (!c || c.key !== key) {
      if (!c) c = { cv: document.createElement('canvas'), key: '' };
      const W = Math.ceil(w * u);
      const H = Math.ceil(h * u);
      if (c.cv.width !== W || c.cv.height !== H) {
        c.cv.width = W;
        c.cv.height = H;
      }
      const g = c.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.setTransform(u, 0, 0, u, -x0 * u, -y0 * u);
      if (building) paintBuildingBar(g, T, frac, s, hit, txt, life);
      else paintBar(g, castle, T, frac, s, hit, txt, lv);
      c.key = key;
      barCache.set(tw, c);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(c.cv, Math.round(X + x0 * u), Math.round(Y + y0 * u));
    ctx.globalAlpha = 1;
  }

  /** The sleeping "z", pre-rendered once per size step. */
  function zSprite(px) {
    const k = Math.max(8, Math.round(px / 4) * 4);
    let c = zCache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(k * 1.6);
    const g = c.getContext('2d');
    drawZ(g, c.width / 2, c.height / 2, k, 0, 1);
    zCache.set(k, c);
    return c;
  }

  function drawBars(ctx, battle, view = {}) {
    const towers = battle && battle.towers;
    if (!ctx || !towers || !towers.length) return;
    const t = num(typeof view === 'number' ? view : view && view.t, 0);
    const dpr = num(view && view.dpr, Math.min(globalThis.devicePixelRatio || 1, 2)); // main.js caps dpr at 2
    const dt = lastT == null ? 0 : clamp(t - lastT, 0, 0.1);
    lastT = t;
    const m = ctx.getTransform();
    const need = Math.hypot(m.a, m.b) || 1; // device px per world px
    const zoom = need / dpr;
    ctx.save();
    try {
      // Sleeping castles: z's drifting up from the keep (world space, kept readable when far out)
      const boost = clamp((0.9 / zoom) ** 0.6, 1, 1.8);
      for (const tw of towers) {
        if (tw.kind !== 'castle' || tw.alive === false || tw.active) continue;
        const fp = flagPole(tw.team);
        const f = face(tw);
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.45 + i / 3) % 1;
          const a = ph < 0.2 ? ph / 0.2 : 1 - (ph - 0.2) / 0.8;
          const x = num(tw.x, 0) + fp.x + f * (8 + ph * 26) + Math.sin(ph * 6 + i) * 4;
          const y = -150 - ph * 70;
          const size = (10 + ph * 9) * boost;
          const img = zSprite(size * need);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-0.25 * f + Math.sin(t * 2 + i) * 0.15);
          ctx.globalAlpha = a;
          const d = size * 1.6; // the sprite is 1.6x the glyph size
          ctx.drawImage(img, -d / 2, -d / 2, d, d);
          ctx.restore();
        }
      }
      // HP bars in screen space, a fixed-ish size so they read at any zoom
      const u = clamp(zoom / 0.55, 0.9, 1.6) * dpr; // device px per bar unit
      const placed = [];
      // Towers first, where they always are; then buildings, each nudged down
      // below any bar it would cover (a crane next to a guard tower)
      for (const pass of [0, 1]) {
        for (const tw of towers) {
          if ((tw.kind === 'building') !== (pass === 1)) continue;
          const wx = num(tw.x, 0);
          const wy = artTop(tw);
          const X = m.a * wx + m.c * wy + m.e;
          let Y = m.b * wx + m.d * wy + m.f - 10 * u;
          const B = barBox(tw);
          const r = { x0: X + B.x0 * u, x1: X + (B.x0 + B.w) * u, y0: Y + B.y0 * u, y1: Y + (B.y0 + B.h) * u };
          for (let k = 0; pass && k < 4; k++) {
            const hit = placed.find((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
            if (!hit) break;
            const dy = hit.y1 + 2 * u - r.y0;
            Y += dy;
            r.y0 += dy;
            r.y1 += dy;
          }
          if (tw.alive !== false && (!pass || landedK(tw) > 0)) placed.push(r);
          bar(ctx, tw, u, X, Y, dt);
        }
      }
    } catch (e) {
      R.lastError = e; // UI chrome must never break a frame
    }
    ctx.restore();
  }

  return R;
}

export { muzzleOf as towerMuzzle, drawCannon, drawCrossbow };
