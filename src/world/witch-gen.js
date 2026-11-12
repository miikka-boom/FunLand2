// Where the Witch sits. One spot per map, from the map's seed:
//
//  - near the way, in the middle stretch of the run: you hear her, you see
//    the light of her phone, and more often than not she is where you meant
//    to walk;
//  - on open ground with room around her, clear of the finds, the fires, the
//    alarms and everything that explodes;
//  - never where the game makes you stand and fight (the holdout switch, the
//    breach, the checkpoints, the pier at the end of the docks);
//  - always avoidable: with the whole of her space closed off, the goal can
//    still be walked to, and the way round costs little.
//
// Runs after the features and the scavenging pass (it keeps clear of what
// they placed) and before the writing on the walls (which keeps clear of
// her, and warns you on the way).

import { World, FlowField, NAV_CELL } from './world.js';
import { mulberry32, shuffle, pointInRect } from '../util.js';
import { analyse, detour } from './scavenge-gen.js';

/** Her space: inside this she minds you (game/witch.js: WITCH.far). */
export const WITCH_SPACE = 170;
// A body's width beyond it: a path that keeps this far never touches her space.
const KEEP_OUT = WITCH_SPACE + 18;
const INF = 0x3fffffff;
const U = NAV_CELL / 10; // flow-field cost -> world units

const TUNE = {
  fromStart: 950, // walking distance from the start, at least
  fromGoal: 750, // and to the goal
  nearWay: 110, // "in your way": within this detour
  offWay: 340, // otherwise at most this far off it
  around: 430, // the way round her may cost this much extra walking, at most
  tries: 160,
  aside: 0.2, // one map in five she sits off to one side instead
};

/**
 * Seat the Witch: map.witches = [{ x, y, face, detour, around }] (empty if the
 * map has no fair place for her).
 */
export function addWitch(map, seed) {
  const rnd = mulberry32((Math.imul(seed | 0, 0x3c6ef372) ^ 0x7f4a7c15) >>> 0);
  map.witches = [];
  const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
  const A = analyse(world, map);
  if (!(A.route < INF)) return map;

  // What she keeps clear of: [x, y, radius].
  const keep = [];
  for (const s of map.stashes || []) keep.push([s.x, s.y, s.tier === 'secret' ? 260 : 230]);
  for (const k of map.pickups) keep.push([k.x, k.y, 90]);
  for (const f of map.fires) keep.push([f.x, f.y, 280]);
  for (const o of map.obstacles) {
    if (o.alarm) keep.push([o.x + o.w / 2, o.y + o.h / 2, 180]);
    else if (o.explosive) keep.push([o.x + o.w / 2, o.y + o.h / 2, 300]);
  }
  for (const l of map.landmarks || []) keep.push([l.x, l.y, 340]);
  for (const c of map.checkpoints || []) keep.push([c.x, c.y, 320]);
  if (map.holdout) keep.push([map.holdout.x, map.holdout.y, 620]);
  if (map.breach) keep.push([map.breach.x, map.breach.y, 440]);
  const pier = map.finale && map.finale.pier;
  const inRooms = (x, y) => pointInRect(x, y, map.startRoom.outer, 280) || pointInRect(x, y, map.endRoom.outer, 280)
    || (map.sealed || []).some((s) => pointInRect(x, y, s.interior, 60));

  const cells = [];
  const c = { x: 0, y: 0 };
  const minS = TUNE.fromStart / U;
  const minG = TUNE.fromGoal / U;
  for (let i = 0; i < world.blocked.length; i++) {
    if (world.blocked[i]) continue;
    const ds = A.fs.dist[i];
    const dg = A.fg.dist[i];
    if (ds >= INF || dg >= INF || ds < minS || dg < minG) continue;
    const det = detour(A, i);
    if (det > TUNE.offWay) continue;
    world.cellCenter(i, c);
    if (!world.isFree(c.x, c.y, 26) || inRooms(c.x, c.y)) continue;
    if (pier && pointInRect(c.x, c.y, pier, 220)) continue;
    if (keep.some((k) => (k[0] - c.x) ** 2 + (k[1] - c.y) ** 2 < k[2] * k[2])) continue;
    cells.push({ i, x: c.x, y: c.y, det });
  }
  if (!cells.length) return map;
  shuffle(cells, rnd);
  // In your way, as a rule (off to one side now and then, or when nowhere in the way is fair).
  const inWay = cells.filter((q) => q.det <= TUNE.nearWay);
  const aside = cells.filter((q) => q.det > TUNE.nearWay);
  const order = rnd() < TUNE.aside ? [...aside, ...inWay] : [...inWay, ...aside];

  // The same world with her space walled off: is there still a way, and how much longer?
  const masked = new Uint8Array(world.blocked.length);
  const closed = Object.create(world);
  closed.blocked = masked;
  const field = new FlowField(closed);
  const er = map.endRoom.interior;
  const startI = world.nearestFree(world.navIndex(map.start.x, map.start.y));
  const nw = world.navW;
  const span = Math.ceil(KEEP_OUT / NAV_CELL) + 1;
  const wayRound = (q) => {
    masked.set(world.blocked);
    const cx = q.i % nw;
    const cy = (q.i - cx) / nw;
    for (let y = Math.max(0, cy - span); y <= Math.min(world.navH - 1, cy + span); y++) {
      for (let x = Math.max(0, cx - span); x <= Math.min(nw - 1, cx + span); x++) {
        const px = (x + 0.5) * NAV_CELL - q.x;
        const py = (y + 0.5) * NAV_CELL - q.y;
        if (px * px + py * py < KEEP_OUT * KEEP_OUT) masked[y * nw + x] = 1;
      }
    }
    field.compute(er.x + er.w / 2, er.y + er.h / 2);
    const d = field.dist[startI];
    return d >= INF ? Infinity : Math.max(0, (d - A.route) * U);
  };

  for (let k = 0; k < order.length && k < TUNE.tries; k++) {
    const q = order[k];
    const around = wayRound(q);
    if (around > TUNE.around) continue;
    map.witches.push({ x: q.x, y: q.y, face: Math.round(rnd() * 628) / 100, detour: Math.round(q.det), around: Math.round(around) });
    break;
  }
  return map;
}
