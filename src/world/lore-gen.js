// World flavor pass: graffiti, doodles, rooftop messages, posters, survivor
// dens, little scenes and the safe-room walls (content: lore-content.js).
// Visual only: decor, readable captions and a few candle glows, never an
// obstacle, so it can't change a route. Runs last (after features and
// scavenging) so it can keep clear of them. Seeded from the map.

import { World } from './world.js';
import { mulberry32, shuffle, pointInRect, rectsOverlap } from '../util.js';
import { analyse, detour } from './scavenge-gen.js';
import {
  CITY_GRAFFITI, BUILDING_GRAFFITI, DOCKS_GRAFFITI, ROOF_MESSAGES, SAFE_ROOM, POSTERS, NOTES, DEN_SCRIBBLES, DEN_JOKES, VIGNETTES, SPRAY, MARKER,
} from './lore-content.js';

const INF = 0x3fffffff;
const DOODLES = ['smiley', 'deadsmiley', 'drowser', 'crown', 'ttt', 'runner', 'cat', 'sun', 'gear'];

export function addLore(map, seed) {
  const rnd = mulberry32((Math.imul(seed | 0, 0x27d4eb2f) ^ 0x165667b1) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const interior = map.theme === 'interior';
  const docks = map.theme === 'docks';
  map.readables = [];
  map.posters = [];
  map.roofArt = [];
  map.glows = map.glows || [];

  const world = new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
  const A = analyse(world, map);
  // Ben's pass (ben-gen.js) reuses this analysis (hidden from JSON / comparisons).
  Object.defineProperty(map, '_flavor', { value: { world, A, n: map.obstacles.length }, configurable: true, writable: true, enumerable: false });
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };

  // Things to keep clear of: finds, chalk, spray, gates, landmarks, safe rooms.
  const busy = [];
  for (const s of map.stashes || []) busy.push({ x: s.x, y: s.y, r: 70 });
  for (const d of map.decor) if (d.type === 'chalk' || d.type === 'spray') busy.push({ x: d.x, y: d.y, r: 90 });
  for (const k of map.pickups) busy.push({ x: k.x, y: k.y, r: 40 });
  for (const l of map.landmarks || []) busy.push({ x: l.x, y: l.y, r: 260 });
  if (map.holdout) busy.push({ x: map.holdout.x, y: map.holdout.y, r: 220 });
  if (map.breach) busy.push({ x: map.breach.x, y: map.breach.y, r: 260 });
  for (const c of map.checkpoints || []) busy.push({ x: c.x, y: c.y, r: 180 });
  const clearOf = (x, y, pad = 0) => busy.every((b) => Math.hypot(b.x - x, b.y - y) >= b.r + pad);
  const inSafe = (x, y, pad = 30) => pointInRect(x, y, map.startRoom.outer, pad) || pointInRect(x, y, map.endRoom.outer, pad);
  const inSealed = (x, y) => (map.sealed || []).some((s) => pointInRect(x, y, s.interior, 20));
  /** A text of this width fits on open ground here. */
  const fits = (x, y, w, h = 20) => {
    for (const f of [-0.5, -0.25, 0, 0.25, 0.5]) if (!world.isFree(x + f * w, y, Math.max(8, h / 2))) return false;
    return true;
  };
  const read = (x, y, label, text, rx = x, ry = y) => map.readables.push({ x, y, rx, ry, label, text });

  // Free cells with their detour (for "on the way" vs "off in a corner").
  const cells = [];
  const c = { x: 0, y: 0 };
  for (let i = 0; i < world.blocked.length; i++) {
    if (world.blocked[i] || A.fs.dist[i] >= INF || A.fg.dist[i] >= INF) continue;
    world.cellCenter(i, c);
    if (inSafe(c.x, c.y) || inSealed(c.x, c.y)) continue;
    cells.push({ i, x: c.x, y: c.y, det: detour(A, i), enc: enclosure(world, i) });
  }
  shuffle(cells, rnd);

  // --- Safe rooms: the first wall you read, and the welcome at the end ---------------------
  safeRoomWall(map, map.startRoom, SAFE_ROOM.start, rnd, interior, true);
  if (map.endRoom.gangway) docksEnd(map, rnd, busy);
  else safeRoomWall(map, map.endRoom, SAFE_ROOM.end, rnd, interior, false);

  // --- Ground graffiti -------------------------------------------------------------------
  // The docks: harbour lines first, then a few from town.
  const lines = docks ? [...shuffle(DOCKS_GRAFFITI.slice(), rnd), ...shuffle(CITY_GRAFFITI.slice(), rnd)] : shuffle((interior ? BUILDING_GRAFFITI : CITY_GRAFFITI).slice(), rnd);
  const want = interior ? 15 : 19;
  const placed = [];
  const spacing = interior ? 150 : 190;
  const tryLine = (g, pool) => {
    const size = interior ? r(11, 15) : r(15, 23);
    const w = g.text.length * size * (interior ? 0.68 : 0.64);
    for (const q of pool) {
      if (!clearOf(q.x, q.y, 20) || placed.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < spacing)) continue;
      if (!fits(q.x, q.y, w, size + 6)) continue;
      const color = interior ? pick(MARKER) : pick(SPRAY);
      const a = (rnd() - 0.5) * (rnd() < 0.2 ? 0.6 : 0.22);
      map.decor.push({ type: 'graffiti', x: q.x, y: q.y, text: g.text, color, size, a, drip: !interior && rnd() < 0.55, marker: interior });
      read(q.x, q.y, interior ? 'SCRAWLED' : 'GRAFFITI', g.text);
      placed.push(q);
      busy.push({ x: q.x, y: q.y, r: w / 2 + 30 });
      if (g.pair) {
        // Somebody argued back, right underneath.
        const ny = q.y + size + 14;
        if (fits(q.x + 20, ny, g.pair.length * size * 0.55, size)) {
          map.decor.push({ type: 'graffiti', x: q.x + 20, y: ny, text: g.pair, color: color === SPRAY[0] ? SPRAY[1] : SPRAY[0], size: size * 0.85, a: -a, drip: false, marker: interior });
        }
      }
      if (g.art === 'dot') map.decor.push({ type: 'doodle', art: 'youarehere', x: q.x + w / 2 + 22, y: q.y, color, s: 1 });
      if (g.art === 'arrow') map.decor.push({ type: 'doodle', art: 'arrow', x: q.x + w / 2 + 26, y: q.y, color, s: 1, a: r(-0.6, 0.6) });
      return true;
    }
    return false;
  };
  // Half on the way (everybody reads those), half wherever you wander.
  const onWay = cells.filter((q) => q.det < 260);
  const offWay = cells.filter((q) => q.det >= 260);
  let n = 0;
  for (const g of lines) {
    if (n >= want) break;
    if (tryLine(g, n % 2 ? offWay : onWay)) n++;
  }
  // "PIER 9 →" on the way, pointing along the walk to the safe room.
  for (let k = 0, made = 0; k < onWay.length && made < (interior ? 1 : 2); k++) {
    const q = onWay[k];
    if (!clearOf(q.x, q.y, 20) || placed.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < spacing) || !fits(q.x, q.y, 120, 26)) continue;
    const a = alongPath(world, A.fg, q.i);
    if (a === null) continue;
    const color = interior ? MARKER[1] : SPRAY[1];
    map.decor.push({ type: 'graffiti', x: q.x - 18, y: q.y, text: interior ? 'EXIT' : 'PIER 9', color, size: interior ? 15 : 22, a: 0, drip: !interior, marker: interior });
    map.decor.push({ type: 'doodle', art: 'arrow', x: q.x + (interior ? 34 : 56), y: q.y, color, s: 1.2, a });
    read(q.x, q.y, interior ? 'SCRAWLED' : 'GRAFFITI', interior ? 'EXIT →' : 'PIER 9 →');
    placed.push(q);
    busy.push({ x: q.x, y: q.y, r: 100 });
    made++;
  }
  // Doodles on their own.
  const doodleCells = cells.filter((q) => q.det < 900);
  for (let k = 0, made = 0; k < doodleCells.length && made < (interior ? 6 : 9); k++) {
    const q = doodleCells[k];
    if (!clearOf(q.x, q.y, 10) || placed.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 120) || !world.isFree(q.x, q.y, 22)) continue;
    map.decor.push({ type: 'doodle', art: pick(DOODLES), x: q.x, y: q.y, color: interior ? pick(MARKER) : pick(SPRAY), s: r(0.9, 1.5), a: r(-0.3, 0.3) });
    placed.push(q);
    busy.push({ x: q.x, y: q.y, r: 40 });
    made++;
  }

  // --- Rooftop messages (streets) -------------------------------------------------------------
  if (!interior) roofMessages(map, world, A, rnd, goal);

  // --- Posters ----------------------------------------------------------------------------------
  posterWalls(map, world, A, rnd, interior, clearOf, read);

  // --- Survivor dens (hidden, candle-lit) ---------------------------------------------------------
  dens(map, world, A, rnd, interior, cells, clearOf, busy, read);

  // --- Little scenes --------------------------------------------------------------------------------
  vignettes(map, world, A, rnd, interior, cells, clearOf, busy, read);
  return map;
}

// --- Helpers --------------------------------------------------------------------------------------

function enclosure(world, i) {
  const nw = world.navW;
  const cx = i % nw;
  const cy = (i - cx) / nw;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= nw || y >= world.navH || world.blocked[y * nw + x]) n++;
    }
  }
  return n;
}

/** Direction of the walk toward the goal from cell i (a few cells ahead), or null. */
function alongPath(world, f, i) {
  const nw = world.navW;
  let k = i;
  for (let s = 0; s < 4; s++) {
    const cx = k % nw;
    const cy = (k - cx) / nw;
    let best = -1;
    let bd = f.dist[k];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= nw || y >= world.navH) continue;
        const j = y * nw + x;
        if (!world.blocked[j] && f.dist[j] < bd) {
          bd = f.dist[j];
          best = j;
        }
      }
    }
    if (best < 0) break;
    k = best;
  }
  if (k === i) return null;
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  world.cellCenter(i, a);
  world.cellCenter(k, b);
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function safeRoomWall(map, room, items, rnd, interior, isStart) {
  const I = room.interior;
  // Spots around the edge of the floor (the middle stays clear: player start / SAFE ROOM sign).
  const spots = [
    { x: I.x + I.w * 0.5, y: I.y + 16 },
    { x: I.x + I.w * 0.5, y: I.y + I.h - 16 },
    { x: I.x + I.w * 0.27, y: I.y + I.h * 0.3 },
    { x: I.x + I.w * 0.74, y: I.y + I.h * 0.72 },
    { x: I.x + I.w * 0.24, y: I.y + I.h * 0.74 },
  ];
  items.forEach((it, k) => {
    const s = { ...spots[k % spots.length] };
    const color = interior ? MARKER[k % MARKER.length] : SPRAY[(k * 3 + 1) % SPRAY.length];
    if (it.text) {
      // Keep the whole line on the floor (not running under the walls).
      const size = it.size || 12;
      const half = Math.min(I.w / 2 - 8, (it.text.length * size * 0.6) / 2);
      s.x = Math.max(I.x + half + 6, Math.min(I.x + I.w - half - 6, s.x));
      map.decor.push({ type: 'graffiti', x: s.x, y: s.y, text: it.text, color, size, a: (rnd() - 0.5) * 0.12, drip: false, marker: true });
      map.readables.push({ x: s.x, y: s.y, rx: s.x, ry: s.y, label: isStart ? 'ON THE SAFE ROOM WALL' : 'IN THE SAFE ROOM', text: it.text });
    }
    if (it.art === 'heart') map.decor.push({ type: 'doodle', art: 'heart', x: s.x + it.text.length * 4 + 16, y: s.y, color: SPRAY[4], s: 0.8 });
    else if (it.art) map.decor.push({ type: 'doodle', art: it.art, x: s.x, y: s.y, color, s: 0.9 });
  });
  if (isStart) {
    // Which way the door is: the way out.
    const d = room.door;
    const toward = d.x > I.x + I.w / 2 ? 0 : Math.PI;
    const x = toward === 0 ? I.x + I.w - 46 : I.x + 46;
    const y = d.y + d.h / 2 - 24;
    map.decor.push({ type: 'graffiti', x, y, text: interior ? 'EXIT' : 'PIER 9', color: SPRAY[1], size: 13, a: 0, drip: false, marker: true });
    map.decor.push({ type: 'doodle', art: 'arrow', x: x + (toward === 0 ? 34 : -34), y, color: SPRAY[1], s: 0.8, a: toward });
  }
}

/** Pier 9: painted on the planks toward the end, spread out (no safe room there). */
function docksEnd(map, rnd, busy) {
  const F = map.finale;
  const P = F.pier;
  const end = P.x + P.w;
  const spots = [
    { x: end - 150, y: P.y + P.h - 30 }, // by the flare post
    { x: F.gangX, y: P.y + 98 }, // just past the gangway's foot
    { x: F.gangX - 70, y: P.y + P.h - 92 },
    { x: end - 640, y: P.y + 44 },
    { x: end - 820, y: P.y + P.h - 44 },
  ];
  SAFE_ROOM.docks.forEach((it, k) => {
    const s = spots[k % spots.length];
    const color = SPRAY[(k * 3 + 1) % SPRAY.length];
    map.decor.push({ type: 'graffiti', x: s.x, y: s.y, text: it.text, color, size: it.size || 12, a: (rnd() - 0.5) * 0.1, drip: false, marker: true });
    map.readables.push({ x: s.x, y: s.y, rx: s.x, ry: s.y, label: 'PAINTED ON THE PIER', text: it.text });
    busy.push({ x: s.x, y: s.y, r: 110 });
  });
}

function roofMessages(map, world, A, rnd, goal) {
  const roofs = map.obstacles.filter((o) => o.kind === 'building' && o.w >= 170 && o.h >= 120 && !o.safe);
  const near = [];
  for (const b of roofs) {
    // How close the walk passes by (cells just around the roof).
    let best = INF;
    const ring = { x: b.x - 60, y: b.y - 60, w: b.w + 120, h: b.h + 120 };
    for (let k = 0; k < 24; k++) {
      const x = ring.x + (k % 6) * (ring.w / 5);
      const y = ring.y + Math.floor(k / 6) * (ring.h / 3);
      const i = world.navIndex(x, y);
      if (world.blocked[i] || A.fs.dist[i] >= INF || A.fg.dist[i] >= INF) continue;
      best = Math.min(best, detour(A, i));
    }
    if (best < 500) near.push(b);
  }
  const msgs = shuffle(ROOF_MESSAGES.slice(), rnd);
  const chosen = [];
  for (const b of shuffle(near, rnd)) {
    if (chosen.length >= 4) break;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (chosen.some((q) => Math.hypot(q.x - cx, q.y - cy) < 900)) continue;
    if (Math.hypot(cx - map.start.x, cy - map.start.y) < 500) continue;
    const pier = chosen.length === 1;
    chosen.push({ x: cx, y: cy, w: b.w, h: b.h, text: pier ? 'PIER 9' : msgs[chosen.length % msgs.length], arrow: pier ? Math.atan2(goal.y - cy, goal.x - cx) : null, a: (rnd() - 0.5) * 0.12 });
  }
  map.roofArt.push(...chosen);
}

function posterWalls(map, world, A, rnd, interior, clearOf, read) {
  const designs = Object.entries(POSTERS).filter(([, d]) => (interior ? d.building : d.city));
  const order = shuffle(designs.slice(), rnd);
  let di = 0;
  const nextDesign = () => order[di++ % order.length];
  const walls = interior
    ? map.obstacles.filter((o) => o.kind === 'wall' && !o.safe && !o.stall && Math.max(o.w, o.h) >= 150)
    : map.obstacles.filter((o) => o.kind === 'building' && !o.safe && Math.max(o.w, o.h) >= 120);
  const clusters = [];
  const wantClusters = interior ? 6 : 5;
  for (const o of shuffle(walls.slice(), rnd)) {
    if (clusters.length >= wantClusters) break;
    const horiz = o.w >= o.h;
    for (const side of shuffle(horiz ? ['n', 's'] : ['w', 'e'], rnd)) {
      const count = interior ? 1 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
      const pw = horiz ? 44 : 30;
      const ph = horiz ? 30 : 42;
      const span = count * (horiz ? pw + 4 : ph + 4);
      const len = horiz ? o.w : o.h;
      if (len < span + 40) continue;
      const a0 = (horiz ? o.x : o.y) + 20 + rnd() * (len - span - 40);
      // The poster lies against the wall face, on the open side.
      const out = side === 'n' || side === 'w' ? -1 : 1;
      const face = side === 'n' ? o.y : side === 's' ? o.y + o.h : side === 'w' ? o.x : o.x + o.w;
      const midA = a0 + span / 2;
      const px = horiz ? midA : face + out * 30;
      const py = horiz ? face + out * 30 : midA;
      const i = world.navIndex(px, py);
      if (world.blocked[i] || A.fs.dist[i] >= INF) continue;
      if (detour(A, i) > (interior ? 700 : 500)) continue;
      if (!clearOf(px, py, 10) || clusters.some((q) => Math.hypot(q.x - px, q.y - py) < 600)) continue;
      // The strip in front of the wall must be clear of props for the posters to show.
      const strip = horiz
        ? { x: a0, y: out < 0 ? face - ph - 2 : face + 2, w: span, h: ph }
        : { x: out < 0 ? face - pw - 2 : face + 2, y: a0, w: pw, h: span };
      if (map.obstacles.some((q) => q !== o && q.kind !== 'border' && rectsOverlap(q, strip, 2))) continue;
      clusters.push({ x: px, y: py });
      for (let k = 0; k < count; k++) {
        const [id, d] = nextDesign();
        const along = a0 + k * (horiz ? pw + 4 : ph + 4);
        const rect = horiz
          ? { x: along, y: out < 0 ? face - ph : face, w: pw, h: ph }
          : { x: out < 0 ? face - pw : face, y: along, w: pw, h: ph };
        map.posters.push({ ...rect, design: id, side, rot: (rnd() - 0.5) * 0.12, torn: rnd() < 0.3 ? rnd() : 0 });
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        const rx = horiz ? cx : face + out * 30;
        const ry = horiz ? face + out * 30 : cy;
        const scrawl = d.scrawl ? `  Someone wrote over it: "${d.scrawl}"` : '';
        read(cx, cy, 'POSTER', `${d.head}${d.sub ? ` — "${d.sub}"` : ''}${scrawl}`, rx, ry);
      }
      break;
    }
  }
}

function dens(map, world, A, rnd, interior, cells, clearOf, busy, read) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const spots = [];
  if (interior) {
    for (const rm of shuffle(map.rooms.filter((q) => !q.sealed && ['storage', 'closet', 'office', 'lab', 'conference'].includes(q.type) && q.w * q.h >= 30000), rnd)) {
      const cx = rm.x + rm.w / 2;
      const cy = rm.y + rm.h / 2;
      const i = world.navIndex(cx, cy);
      if (world.blocked[i] || A.fs.dist[i] >= INF || detour(A, i) < 250) continue;
      if (!clearOf(cx, cy, 60) || !world.isFree(cx, cy, 30)) continue;
      spots.push({ x: cx, y: cy, room: rm });
      if (spots.length >= 1) break;
    }
  } else {
    for (const q of cells) {
      if (spots.length >= 2) break;
      if (q.det < 450 || q.enc < 9 || !world.isFree(q.x, q.y, 34)) continue;
      if (!clearOf(q.x, q.y, 120)) continue;
      if (spots.some((s) => Math.hypot(s.x - q.x, s.y - q.y) < 1500)) continue;
      if (spots.length === 1 && rnd() < 0.4) break; // a second den only sometimes
      spots.push({ x: q.x, y: q.y });
    }
  }
  const noteSets = interior ? [NOTES.building, NOTES.tinkerer] : map.theme === 'docks' ? [NOTES.docks, NOTES.tinkerer] : [NOTES.city, NOTES.tinkerer];
  spots.forEach((s, k) => {
    const { x, y } = s;
    // The camp: bedding, candles, a stove, cans, a radio, and the Tinkerer's mark.
    const freeAt = (dx, dy, rr = 10) => world.isFree(x + dx, y + dy, rr);
    const put = (d, dx, dy, rr = 10) => {
      if (freeAt(dx, dy, rr)) map.decor.push({ ...d, x: x + dx, y: y + dy });
    };
    put({ type: 'mattress', a: rnd() < 0.5 ? 0 : Math.PI / 2 }, -24, 0, 18);
    put({ type: 'candle' }, 18, -18, 4);
    put({ type: 'candle' }, -44, 26, 4);
    put({ type: 'candle' }, 30, 22, 4);
    put({ type: 'stove' }, 26, 0, 8);
    put({ type: 'cans', s: 1 }, -6, 30, 8);
    put({ type: 'radio' }, -50, -20, 6);
    put({ type: 'doodle', art: 'gear', color: interior ? MARKER[0] : '#ece9df', s: 1.7, a: 0 }, 0, -52, 18);
    map.glows.push({ x, y, r: 190, k: 0.6, tint: 'rgba(255,186,110,0.12)', den: true });
    // Journal page on the floor.
    const set = noteSets[k % noteSets.length];
    const note = pick(set);
    put({ type: 'note', a: rnd() * 0.6 - 0.3 }, 6, 16, 6);
    read(x + 6, y + 16, set === NOTES.tinkerer ? 'NOTE' : interior ? 'NOTE' : 'JOURNAL PAGE', note);
    // Scribbles all around, and the joke wall.
    const scribbles = shuffle(DEN_SCRIBBLES.slice(), rnd).slice(0, 6);
    const jokes = shuffle(DEN_JOKES.slice(), rnd).slice(0, 2);
    const ring = [...scribbles.map((t) => ({ t, joke: false })), ...jokes.map((t) => ({ t, joke: true }))];
    // Text boxes already used (the camp itself first), so nothing is written over anything else.
    const boxes = [{ x: x - 62, y: y - 70, w: 124, h: 112 }];
    ring.forEach((it, j) => {
      for (let tries = 0; tries < 24; tries++) {
        const ang = (j / ring.length) * Math.PI * 2 + rnd() * 0.9;
        const dist = 72 + rnd() * 90;
        const tx = x + Math.cos(ang) * dist;
        const ty = y + Math.sin(ang) * dist;
        const size = it.joke ? 9 : 10 + rnd() * 3;
        const w = it.t.length * size * 0.68;
        const box = { x: tx - w / 2, y: ty - size / 2 - 2, w, h: size + 4 };
        if (boxes.some((b) => rectsOverlap(b, box, 4))) continue;
        if (!world.isFree(tx, ty, 8) || !world.isFree(tx - w / 2, ty, 6) || !world.isFree(tx + w / 2, ty, 6)) continue;
        boxes.push(box);
        map.decor.push({ type: 'graffiti', x: tx, y: ty, text: it.t, color: interior ? pick(MARKER) : it.joke ? '#f2c94c' : '#ece9df', size, a: (rnd() - 0.5) * 0.16, drip: false, marker: true });
        if (it.joke) read(tx, ty, 'ON THE JOKE WALL', it.t);
        break;
      }
    });
    busy.push({ x, y, r: 200 });
  });
  map.dens = spots.map((s) => ({ x: s.x, y: s.y }));
}

function vignettes(map, world, A, rnd, interior, cells, clearOf, busy, read) {
  const list = shuffle((interior ? VIGNETTES.building : map.theme === 'docks' ? VIGNETTES.docks : VIGNETTES.city).slice(), rnd);
  let made = 0;
  const want = interior ? 3 : 3;
  for (const v of list) {
    if (made >= want) break;
    if (scene(v)) made++;
  }

  function nearCell(maxDet, minDet = 0, pred = () => true) {
    for (const q of cells) {
      if (q.det > maxDet || q.det < minDet || !clearOf(q.x, q.y, 40) || !pred(q)) continue;
      return q;
    }
    return null;
  }

  function scene(v) {
    const add = (d) => map.decor.push(d);
    if (!interior && (v.id === 'honk' || v.id === 'wedding')) {
      const cars = shuffle(map.obstacles.filter((o) => o.kind === 'car' && !o.alarm && !o.wreck && !o.scrawl), rnd);
      for (const car of cars) {
        const cx = car.x + car.w / 2;
        const cy = car.y + car.h / 2;
        const i = world.navIndex(cx + (car.w > car.h ? 0 : 40), cy + (car.w > car.h ? 40 : 0));
        if (A.fs.dist[i] >= INF || detour(A, i) > 400 || !clearOf(cx, cy, 20)) continue;
        if (v.id === 'honk') {
          car.scrawl = 'HONK IF ALIVE';
          car.scrawl2 = "(DON'T)";
          read(cx, cy, 'SCRAWLED ON A CAR', "HONK IF ALIVE (DON'T)");
        } else {
          car.color = '#efeeea';
          car.scrawl = 'JUST MARRIED';
          const back = car.w > car.h ? { x: (car.front || 1) > 0 ? car.x - 18 : car.x + car.w + 18, y: cy } : { x: cx, y: (car.front || 1) > 0 ? car.y - 18 : car.y + car.h + 18 };
          add({ type: 'cans', x: back.x, y: back.y, s: 1.2, trail: true });
          read(cx, cy, 'ON A CAR', 'JUST MARRIED — and somebody added underneath: "STILL TOGETHER."');
        }
        busy.push({ x: cx, y: cy, r: 160 });
        return true;
      }
      return false;
    }
    if (!interior) {
      const q = v.id === 'busstop'
        ? nearCell(220, 0, (c) => c.enc >= 4 && world.isFree(c.x, c.y, 26))
        : v.id === 'lemonade'
          ? nearCell(500, 0, (c) => world.isFree(c.x, c.y, 34))
          : nearCell(1400, 250, (c) => c.enc >= 9 && world.isFree(c.x, c.y, 26));
      if (!q) return false;
      if (v.id === 'busstop') {
        add({ type: 'suitcase', x: q.x - 22, y: q.y + 4, c: '#7a4a2a', s: 1 });
        add({ type: 'suitcase', x: q.x - 2, y: q.y + 8, c: '#2e4a6d', s: 0.8 });
        add({ type: 'suitcase', x: q.x + 18, y: q.y + 2, c: '#6b6b6b', s: 0.9 });
        add({ type: 'sign', x: q.x, y: q.y - 28, text: 'BUS STOP' });
      } else if (v.id === 'lemonade') {
        add({ type: 'stand', x: q.x, y: q.y });
      } else {
        add({ type: 'casings', x: q.x - 10, y: q.y + 10, s: 1.2 });
        add({ type: 'casings', x: q.x + 14, y: q.y - 6, s: 0.8 });
        add({ type: 'chair', x: q.x + 26, y: q.y + 16, s: 1, a: 0 });
        add({ type: 'junk', x: q.x - 30, y: q.y - 20, s: 1 });
      }
      add({ type: 'graffiti', x: q.x, y: q.y + (v.id === 'busstop' ? 40 : -40), text: v.text, color: SPRAY[1], size: 11, a: 0, drip: false, marker: true });
      read(q.x, q.y, v.id === 'busstop' ? 'AT THE BUS STOP' : v.id === 'lemonade' ? 'A SIGN' : 'SCRAWLED', v.text);
      busy.push({ x: q.x, y: q.y, r: 220 });
      return true;
    }
    // Building scenes: against a room wall.
    const types = v.id === 'fridge' ? ['cafeteria', 'lab', 'office', 'openoffice'] : v.id === 'reception' ? ['lobby'] : ['office', 'conference', 'openoffice', 'lab'];
    for (const rm of shuffle(map.rooms.filter((q) => types.includes(q.type) && !q.sealed), rnd)) {
      const horiz = rm.w >= rm.h;
      const x = horiz ? rm.x + rm.w * (0.3 + rnd() * 0.4) : rm.x + 10;
      const y = horiz ? rm.y + 10 : rm.y + rm.h * (0.3 + rnd() * 0.4);
      const area = { x: x - 30, y: y - 8, w: 60, h: 30 };
      if (map.obstacles.some((o) => o.kind !== 'wall' && o.kind !== 'border' && rectsOverlap(o, area, 4))) continue;
      if (!clearOf(x, y, 40)) continue;
      if (v.id === 'fridge') add({ type: 'fridge', x, y: y + 10 });
      else if (v.id === 'reception') add({ type: 'ticket', x, y: y + 10 });
      else add({ type: 'whiteboard', x, y: y + 4, text: v.text, horiz });
      read(x, y + 14, v.id === 'fridge' ? 'NOTE ON THE FRIDGE' : v.id === 'reception' ? 'A SIGN' : 'WHITEBOARD', v.text, x + (horiz ? 0 : 24), y + (horiz ? 26 : 0));
      busy.push({ x, y, r: 220 });
      return true;
    }
    return false;
  }
}
