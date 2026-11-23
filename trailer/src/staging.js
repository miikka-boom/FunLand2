// Staging helpers for the shots: find things on a map, put people where the camera is.

import { Zombie } from '../../src/game/zombies.js';
import { spawnHunter, spawnTank } from '../../src/game/specials.js';
import { spawnWitch } from '../../src/game/witch.js';

const TAU = Math.PI * 2;

/** The nearest open patch of ground (nothing within r) to (x, y), on a 40-unit scan. */
export function openNear(game, x, y, r = 160, reach = 1600) {
  const W = game.world;
  let best = null;
  let bd = Infinity;
  for (let yy = y - reach; yy <= y + reach; yy += 40) {
    for (let xx = x - reach; xx <= x + reach; xx += 40) {
      if (xx < 100 || yy < 100 || xx > W.w - 100 || yy > W.h - 100) continue;
      const d = Math.hypot(xx - x, yy - y);
      if (d >= bd || !W.isFree(xx, yy, r) || !Number.isFinite(game.goalField.pathDist(xx, yy))) continue;
      bd = d;
      best = { x: xx, y: yy };
    }
  }
  return best || { x, y };
}

/** Decor (graffiti, Ben's words, chalk...) whose text or kind matches. */
export function decor(game, match) {
  const m = match.toLowerCase();
  return game.world.map.decor.find((d) => (d.text && d.text.toLowerCase().includes(m)) || d.type === match || d.kind === match) || null;
}

/** A poster by design (slumbra, mask, sixfeet...). */
export function poster(game, design) {
  const p = (game.world.map.posters || []).find((q) => q.design === design);
  return p ? { ...p, cx: p.x + p.w / 2, cy: p.y + p.h / 2 } : null;
}

/** The alarm car (or truck) nearest (x, y). */
export function alarmNear(game, x, y, icecream = false) {
  let best = null;
  let bd = Infinity;
  for (const o of game.world.obstacles) {
    if (!o.alarm || (icecream && !o.icecream)) continue;
    const d = Math.hypot(o.x + o.w / 2 - x, o.y + o.h / 2 - y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Where a car's body is (its middle, a little up). */
export const middle = (o) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2, r: Math.min(o.w, o.h) / 2, alive: true });

/** A free spot near (x, y): spirals out until something fits r. */
export function freeSpot(game, x, y, r = 14) {
  const W = game.world;
  for (let k = 0; k < 200; k++) {
    const a = k * 2.399;
    const d = Math.sqrt(k) * 9;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (W.isFree(px, py, r) && !W.sealedAt(px, py)) return { x: px, y: py };
  }
  return null;
}

/** Drowsers: people standing in the street, swaying, not yet interested (idle commons). */
export function drowsers(ctx, x, y, n, spread = 220, opts = {}) {
  const g = ctx.game;
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const a = Math.random() * TAU;
    const d = Math.sqrt(Math.random()) * spread;
    const s = freeSpot(g, x + Math.cos(a) * d, y + Math.sin(a) * d * (opts.squash || 1), 12);
    if (!s) continue;
    const z = new Zombie(s.x, s.y, false);
    z.wanderStop = opts.walk ? Math.random() < 0.3 : true;
    z.wanderT = 2 + Math.random() * 6;
    z.heading = opts.face !== undefined ? opts.face + (Math.random() - 0.5) * 1.2 : Math.random() * TAU;
    z.face = z.heading;
    g.zombies.push(z);
    out.push(z);
  }
  return out;
}

/**
 * A horde on its way: n commons at reachable spots between rMin and rMax (path distance) from
 * (x, y), in `streams` clumps, already running. `delay` spreads their start (s).
 */
export function horde(ctx, x, y, n, rMin = 420, rMax = 900, streams = 4, delay = 1.5) {
  const g = ctx.game;
  const W = g.world;
  const f = W.flow;
  f.compute(x, y);
  const spots = [];
  for (let k = 0; k < 4000 && spots.length < streams; k++) {
    const a = Math.random() * TAU;
    const d = rMin + Math.random() * (rMax - rMin);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (!W.isFree(px, py, 24) || W.sealedAt(px, py)) continue;
    const pd = f.pathDist(px, py);
    if (!Number.isFinite(pd) || pd < rMin || pd > rMax * 1.6) continue;
    if (spots.some((s) => Math.hypot(s.x - px, s.y - py) < 240)) continue;
    spots.push({ x: px, y: py });
  }
  const out = [];
  for (let i = 0; i < n && spots.length; i++) {
    const s = spots[i % spots.length];
    const p = freeSpot(g, s.x + (Math.random() - 0.5) * 120, s.y + (Math.random() - 0.5) * 120, 11);
    if (!p) continue;
    const z = new Zombie(p.x, p.y, true);
    z.alertDelay = Math.random() * delay;
    g.zombies.push(z);
    out.push(z);
  }
  W.flow.compute(g.player.x, g.player.y);
  return out;
}

export function tankAt(ctx, x, y) {
  const g = ctx.game;
  const s = freeSpot(g, x, y, 30) || { x, y };
  const t = spawnTank(g, s.x, s.y);
  g.director.tank = t;
  g.director.tankSpawned = true;
  return t;
}

export function hunterAt(ctx, x, y) {
  const s = freeSpot(ctx.game, x, y, 14) || { x, y };
  return spawnHunter(ctx.game, s.x, s.y);
}

export function witchAt(ctx, x, y, face) {
  const s = freeSpot(ctx.game, x, y, 26) || { x, y };
  return spawnWitch(ctx.game, { x: s.x, y: s.y, face });
}

/**
 * A free spot `dist` from (x, y) with a clear straight run to it (nothing to trip over),
 * trying directions from `prefer` outwards.
 */
export function clearShot(game, x, y, dist, prefer = 0, r = 14) {
  const W = game.world;
  for (let k = 0; k < 48; k++) {
    const a = prefer + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
    const px = x + Math.cos(a) * dist;
    const py = y + Math.sin(a) * dist;
    if (W.isFree(px, py, r + 4) && W.segmentClear(x, y, px, py, W.moveBlockers) && W.segmentClear(x, y, px, py)) return { x: px, y: py };
  }
  return { x: x + Math.cos(prefer) * dist, y: y + Math.sin(prefer) * dist };
}

/** What counts as a mural: words and drawings on the ground, walls, roofs and cars. */
const MURALS = new Set(['graffiti', 'doodle', 'paint', 'chalkart', 'chalk', 'bentext', 'benchalk', 'beneyes', 'benarrow']);

/**
 * A map without its murals: no graffiti, painted words, chalk, Ben's crayon and drawings, posters,
 * rooftop messages or writing on cars. Signs, headstones and the props stay. Only drawing reads any
 * of it, so a shot plays the same with or without (call it before the shot's first frame).
 */
export function stripMurals(game) {
  const map = game.world.map;
  map.decor = map.decor.filter((d) => !MURALS.has(d.type));
  for (const d of map.decor) if (d.type === 'raft') d.text = '';
  map.posters = [];
  map.roofArt = [];
  map.benRoof = [];
  map.ben = null; // (the game read it when the map was built; drawing it puts his tag on the ferry's deck)
  for (const o of game.world.obstacles) if (o.scrawl) delete o.scrawl;
}

/** Put a survivor somewhere (and stop it). */
export function put(s, x, y, facing) {
  s.x = x;
  s.y = y;
  s.vx = 0;
  s.vy = 0;
  if (facing !== undefined) {
    s.facing = facing;
    s.aimAngle = facing;
    if (s.fireAngle !== undefined) s.fireAngle = facing;
  }
}
