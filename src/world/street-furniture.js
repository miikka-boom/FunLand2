// Street furniture on the city's sidewalks, after the level's concept art: bare trees in stone
// planters along the curbs, pairs of newspaper boxes near the corners, bus shelters on the longer
// stretches, each facing the street.
//
// The last thing done to a map (game.js newRun, after the features, the finds, the Witch, the
// lore and Ben), from a random stream of its own, so nothing else is anywhere other than it would
// have been. Nothing goes near a crossing, a street lamp, a medkit, a doorway, a boarded room, a
// stash, the safe rooms' blocks, words or signs on the ground, or anything already standing.

import { mulberry32, rectsOverlap } from '../util.js';

/** The furniture's obstacle flags: you walk round it, shots and sight pass. */
const FLAGS = { move: true, shot: false, sight: false };
const obstacle = (kind, x, y, w, h, extra) => ({ kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), ...FLAGS, ...extra });

// Ground clutter the furniture may stand on (anything else on the ground, it keeps away from).
const PLAIN = new Set(['puddle', 'crack', 'trash', 'manhole', 'leaves', 'papers', 'blood']);

/** Furnish city map's sidewalks (sw wide); a no-op for other maps. Returns what was added. */
export function furnishStreets(map, seed, sw = 22) {
  if (map.theme || !map.blocks || !map.intersections) return [];
  return placeStreetFurniture(map, seed, obstacle, sw);
}

export const TREE_PLANTER = 16; // a street tree's planter, square (world units)
export const NEWSBOX = [11, 9]; // a newspaper box: along the sidewalk, across it
export const SHELTER = [54, 22]; // a bus shelter: along the sidewalk, across it
export const NEWS_COLORS = ['#2d5aa8', '#b8312f', '#d9a521', '#2f7d46', '#e8e4da', '#3d7fae'];

/**
 * Add the furniture to city map (its blocks, sidewalks sw wide, lamps, intersections, pickups;
 * obstacles grow). ob(kind, x, y, w, h, extra): the map's obstacle maker. Returns what was added.
 */
export function placeStreetFurniture(map, seed, ob, sw) {
  const rnd = mulberry32((seed ^ 0x2545f491) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const added = [];
  const near = (x, y, rect, d) => x > rect.x - d && x < rect.x + rect.w + d && y > rect.y - d && y < rect.y + rect.h + d;
  // Where nothing may stand: doorways and what's in front of them, finds, words on the ground.
  const keep = [];
  for (const o of map.obstacles) if (o.opens || o.boards || o.gate || o.door) keep.push([o, 60]);
  for (const f of map.floors || []) keep.push([f, 60]);
  for (const rm of map.sealed || []) {
    keep.push([rm.boards || rm.door, 70]);
    keep.push([{ x: rm.outside.x, y: rm.outside.y, w: 0, h: 0 }, 50]);
  }
  for (const s of map.stashes || []) keep.push([{ x: s.x, y: s.y, w: 0, h: 0 }, 40]);
  for (const d of map.decor || []) if (!PLAIN.has(d.type)) keep.push([{ x: d.x, y: d.y, w: 0, h: 0 }, d.text ? 50 + d.text.length * 4 : 36]);
  const clear = (rect) =>
    !map.obstacles.some((o) => rectsOverlap(o, rect, 4)) &&
    !map.intersections.some((it) => rectsOverlap(it, rect, 34)) &&
    !map.lamps.some((l) => near(l.x, l.y, rect, 22)) &&
    !(map.pickups || []).some((p) => near(p.x, p.y, rect, 26)) &&
    !keep.some(([k, pad]) => rectsOverlap(k, rect, pad));
  const put = (kind, rect, extra) => {
    if (!clear(rect)) return null;
    const o = ob(kind, rect.x, rect.y, rect.w, rect.h, extra);
    map.obstacles.push(o);
    added.push(o);
    return o;
  };
  // The rect of something `along` x `across` at distance t along a sidewalk side, `inset` from
  // its curb (to its middle), and the way it faces (toward the street).
  const at = (side, t, along, across, inset) => {
    const c = side.curb + side.out * -inset; // its middle, across the sidewalk
    if (side.dir === 'h') return { x: Math.round(side.a0 + t - along / 2), y: Math.round(c - across / 2), w: along, h: across };
    return { x: Math.round(c - across / 2), y: Math.round(side.a0 + t - along / 2), w: across, h: along };
  };
  for (const b of map.blocks) {
    if (b.type === 'start' || b.type === 'end') continue;
    const I = b.inner;
    // Each side of the block with a sidewalk: where its curb is, which way the street lies.
    const sides = [];
    if (I.y > b.y) sides.push({ dir: 'h', a0: b.x, len: b.w, curb: b.y, out: -1, heading: -Math.PI / 2 });
    if (I.y + I.h < b.y + b.h) sides.push({ dir: 'h', a0: b.x, len: b.w, curb: b.y + b.h, out: 1, heading: Math.PI / 2 });
    if (I.x > b.x) sides.push({ dir: 'v', a0: b.y, len: b.h, curb: b.x, out: -1, heading: Math.PI });
    if (I.x + I.w < b.x + b.w) sides.push({ dir: 'v', a0: b.y, len: b.h, curb: b.x + b.w, out: 1, heading: 0 });
    for (const side of sides) {
      // A bus shelter on some of the longer stretches, a pair of newspaper boxes beside it now
      // and then; the shelter stands back on the sidewalk, open to the street.
      if (side.len > 480 && rnd() < 0.35) {
        const t = r(150, side.len - 150);
        const s = put('shelter', at(side, t, SHELTER[0], SHELTER[1], sw / 2), { heading: side.heading });
        if (s && rnd() < 0.6) {
          const t2 = t + (rnd() < 0.5 ? -1 : 1) * (SHELTER[0] / 2 + 16);
          newsPair(side, t2);
        }
      }
      // Newspaper boxes near a corner, at the back of the sidewalk.
      if (rnd() < 0.3) newsPair(side, rnd() < 0.5 ? r(70, 120) : side.len - r(70, 120));
      // Trees along the curb, now and then (a few to a block: they stand up on screen, and more
      // read as clutter).
      for (let t = r(100, 200); t < side.len - 90; t += r(280, 400)) {
        if (rnd() < 0.4) continue;
        put('tree', at(side, t, TREE_PLANTER, TREE_PLANTER, 10), { bare: true, planter: true, seed: Math.floor(rnd() * 1e6) });
      }
    }
  }
  function newsPair(side, t) {
    const n = rnd() < 0.7 ? 2 : 1;
    const colors = [...NEWS_COLORS].sort(() => rnd() - 0.5);
    for (let k = 0; k < n; k++) {
      put('newsbox', at(side, t + (k - (n - 1) / 2) * (NEWSBOX[0] + 3), NEWSBOX[0], NEWSBOX[1], sw - NEWSBOX[1] / 2 - 5), { heading: side.heading, color: colors[k] });
    }
  }
  return added;
}
