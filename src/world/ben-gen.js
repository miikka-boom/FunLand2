// Ben's traces (We Left Ben): someone the squad left behind keeps leaving signs.
// A placement pass like lore-gen: visual only (decor, readables, one candle
// glow, one medkit), seeded from the map, run last so it keeps clear of the
// finds, features and graffiti. Words live in ben-content.js; the run-time
// side (his bed, the whistle, the glimpse, the papers) is game/ben.js.
//
//  - the first room: "day 3. you left." under the squad's last line, and a
//    stuffed rabbit with sewn-on eyes
//  - his bed, off the route: a cardboard fort, a candle still burning, the
//    same rabbit, a nights-slept tally, a hand-drawn map of this level (with
//    one place nobody has found) and a drawing of the squad, plus one more
//  - two little eyes scratched near vents, boarded rooms and the secret, and
//    a few leading to his bed; the pupils look at what they're about
//  - "ben was here" where nobody could reach: roofs, shelf tops, the top of
//    the quarantine wall, crane booms, container stacks, a raft out on the
//    water, inside rooms nailed shut from outside
//  - "don't follow the noise", with arrows that point at the noise
//  - small footprints that walk up to a wall and stop at an open vent
//  - the squad's lines about Ben, and his replies under them
//  - one lamp blinking the same three letters, over and over
//  - where the glimpse happens (two eyes in your flashlight, then gone)

import { World, FlowField, NAV_CELL } from './world.js';
import { mulberry32, shuffle, pointInRect, rectsOverlap, clamp } from '../util.js';
import { analyse, detour } from './scavenge-gen.js';
import { BEN_WAS_HERE, BEN_START, SQUAD_ON_BEN, BEN_NOTES, BEN_NEST, BEN_KNOWS, BEN_CAPTIONS } from './ben-content.js';
import { SPRAY, MARKER } from './lore-content.js';

const INF = 0x3fffffff;
const U = NAV_CELL / 10; // flow-field units -> world units
// Ground clutter that may sit under a trace (everything else is kept clear of).
const CLUTTER = new Set(['puddle', 'crack', 'trash', 'manhole', 'leaves', 'papers', 'oil', 'blood', 'rope', 'fishbox', 'nets', 'chair']);

const TUNE = {
  city: { nestDetour: 650, nestStart: 1200, squad: 3 },
  interior: { nestDetour: 420, nestStart: 900, squad: 2 },
  docks: { nestDetour: 600, nestStart: 1100, squad: 3 },
};

/**
 * opts.memory: what this device remembers of earlier runs (game/ben.js) — a
 * couple of lines only turn up after you've been here before.
 * opts.level: 'city' | 'interior' | 'docks' (defaults from the map).
 */
export function addBen(map, seed, opts = {}) {
  const rnd = mulberry32((Math.imul(seed | 0, 0x2c1b3c6d) ^ 0x0b3e7a11) >>> 0);
  const r = (a, b) => a + rnd() * (b - a);
  const theme = map.theme === 'interior' ? 'interior' : map.theme === 'docks' ? 'docks' : 'city';
  const T = TUNE[theme];
  const mem = opts.memory || {};
  const level = opts.level || theme;
  map.readables = map.readables || [];
  map.glows = map.glows || [];
  map.benRoof = [];
  const B = (map.ben = { theme, nest: null, branch: null, glimpse: null, papers: [], eyes: [], sketch: null, morse: null, knows: null, nestLine: null });

  // Same analysis as the lore pass (reused if it just ran on this exact map).
  const cache = map._flavor && map._flavor.n === map.obstacles.length ? map._flavor : null;
  const world = cache ? cache.world : new World({ ...map, obstacles: map.obstacles.filter((o) => !o.opens && !o.boards), sealed: [] }, { strict: true });
  const A = cache ? cache.A : analyse(world, map);
  const er = map.endRoom.interior;
  const goal = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
  const secret = (map.stashes || []).find((s) => s.tier === 'secret') || null;

  // Keep clear of what's already there.
  const busy = [];
  for (const d of map.decor) {
    if (CLUTTER.has(d.type) || d.x === undefined || d.y === undefined) continue;
    const w = d.type === 'graffiti' ? (d.text || '').length * (d.size || 12) * 0.32 : 0;
    busy.push({ x: d.x, y: d.y, r: Math.max(26, w + 14) });
  }
  for (const s of map.stashes || []) busy.push({ x: s.x, y: s.y, r: 60 });
  for (const k of map.pickups) busy.push({ x: k.x, y: k.y, r: 34 });
  for (const l of map.landmarks || []) busy.push({ x: l.x, y: l.y, r: 240 });
  for (const den of map.dens || []) busy.push({ x: den.x, y: den.y, r: 210 });
  for (const p of map.posters || []) busy.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, r: 46 });
  if (map.holdout) busy.push({ x: map.holdout.x, y: map.holdout.y, r: 200 });
  if (map.breach) busy.push({ x: map.breach.x, y: map.breach.y, r: 240 });
  const clearOf = (x, y, pad = 0) => busy.every((b) => Math.hypot(b.x - x, b.y - y) >= b.r + pad);
  const inSafe = (x, y, pad = 30) => pointInRect(x, y, map.startRoom.outer, pad) || pointInRect(x, y, map.endRoom.outer, pad);
  const inSealed = (x, y) => (map.sealed || []).some((s) => pointInRect(x, y, s.interior, 16));
  const lampNear = (x, y, k = 0.9) => map.lamps.some((l) => Math.hypot(l.x - x, l.y - y) < (l.r || 165) * k);
  const read = (x, y, label, text, rx = x, ry = y) => map.readables.push({ x, y, rx, ry, label, text, ben: true });
  const crayon = (x, y, text, size = 11, a = 0) => map.decor.push({ type: 'bentext', x, y, text, size, a });
  const eyes = (x, y, look, s = 1, caption = BEN_CAPTIONS.eyes[Math.min(B.eyes.length, BEN_CAPTIONS.eyes.length - 1)]) => {
    map.decor.push({ type: 'beneyes', x, y, look, s });
    B.eyes.push({ x, y, look });
    if (caption) read(x, y, 'SCRATCHED', caption);
    busy.push({ x, y, r: 40 });
  };
  /** A line of text this wide fits on open ground here. */
  const fits = (x, y, w, rr = 8) => [-0.5, -0.25, 0, 0.25, 0.5].every((f) => world.isFree(x + f * w, y, rr));

  // Free cells: detour (on the way vs off in a corner), enclosure, progress along the run.
  const cells = [];
  const c = { x: 0, y: 0 };
  for (let i = 0; i < world.blocked.length; i++) {
    if (world.blocked[i] || A.fs.dist[i] >= INF || A.fg.dist[i] >= INF) continue;
    world.cellCenter(i, c);
    if (inSafe(c.x, c.y) || inSealed(c.x, c.y)) continue;
    cells.push({ i, x: c.x, y: c.y, det: detour(A, i), enc: enclosure(world, i), prog: A.fs.dist[i] / Math.max(1, A.fs.dist[i] + A.fg.dist[i]) });
  }
  shuffle(cells, rnd);

  // --- The first room ------------------------------------------------------------------------
  {
    const I = map.startRoom.interior;
    const boxes = textBoxes(map.decor, map.startRoom.outer);
    // Right under the squad's last line if there's room, else anywhere free.
    const first = map.decor.find((d) => d.type === 'graffiti' && d.text === 'DAY 1 HERE. DAY 2 LEAVING.' && pointInRect(d.x, d.y, I, 4));
    const rows = [];
    for (let y = I.y + 26; y < I.y + I.h - 12; y += 9) rows.push(y);
    const spots = [
      ...(first ? [{ x: first.x, y: first.y + 14 }, { x: first.x + 20, y: first.y + 14 }, { x: first.x - 20, y: first.y + 14 }] : []),
      ...rows.flatMap((y) => [{ x: I.x + I.w * 0.5, y }, { x: I.x + I.w * 0.68, y }, { x: I.x + I.w * 0.32, y }]),
    ];
    const tryText = (list, text, size) => {
      const w = text.length * size * 0.56 + 6;
      for (const p of list) {
        const x = clamp(p.x, I.x + w / 2 + 6, I.x + I.w - w / 2 - 6);
        const box = { x: x - w / 2, y: p.y - size / 2, w, h: size };
        if (boxes.some((b) => rectsOverlap(b, box, 1))) continue;
        if (Math.hypot(map.start.x - x, map.start.y - p.y) < 22) continue;
        boxes.push(box);
        crayon(x, p.y, text, size, (rnd() - 0.5) * 0.08);
        read(x, p.y, BEN_CAPTIONS.label, text);
        return true;
      }
      return false;
    };
    tryText(spots, BEN_START, 10);
    // What he knows about your earlier runs (one line at most), on the ground just outside the door.
    const knows = mem.pendingBack === level ? BEN_KNOWS.back : (mem.deaths || 0) >= 3 && mem.deaths % 3 === 0 ? BEN_KNOWS.died(mem.deaths) : null;
    if (knows) {
      const d = map.startRoom.door;
      const dx = d.x + d.w / 2;
      const dy = d.y + d.h / 2;
      const L = Math.hypot(dx - (I.x + I.w / 2), dy - (I.y + I.h / 2)) || 1;
      const nx = (dx - (I.x + I.w / 2)) / L;
      const ny = (dy - (I.y + I.h / 2)) / L;
      const w = knows.length * 10 * 0.56;
      for (let out = 60; out <= 300; out += 20) {
        for (const side of [0, 30, -30, 60, -60, 95, -95]) {
          const x = dx + nx * out - ny * side;
          const y = dy + ny * out + nx * side;
          if (!fits(x, y, w, 6) || !clearOf(x, y, w / 2)) continue;
          crayon(x, y, knows, 10, (rnd() - 0.5) * 0.08);
          read(x, y, BEN_CAPTIONS.label, knows);
          busy.push({ x, y, r: w / 2 + 20 });
          B.knows = knows;
          break;
        }
        if (B.knows) break;
      }
    }
    // The rabbit, as near a corner as there's room (off the medkit, the start spot and the writing).
    const spotsR = [];
    for (let y = I.y + 16; y <= I.y + I.h - 14; y += 8) {
      for (let x = I.x + 12; x <= I.x + I.w - 12; x += 8) {
        if (map.pickups.some((k) => Math.hypot(k.x - x, k.y - y) < 26)) continue;
        if (Math.hypot(map.start.x - x, map.start.y - y) < 34) continue;
        if (boxes.some((b) => rectsOverlap(b, { x: x - 8, y: y - 19, w: 16, h: 30 }, 1))) continue;
        const corner = Math.min(x - I.x, I.x + I.w - x) + Math.min(y - I.y, I.y + I.h - y);
        spotsR.push({ x, y, corner });
      }
    }
    spotsR.sort((p, q) => p.corner - q.corner);
    const rb = spotsR[0];
    if (rb) {
      map.decor.push({ type: 'rabbit', x: rb.x, y: rb.y, a: r(-0.6, 0.6) });
      read(rb.x, rb.y, BEN_CAPTIONS.rabbit.label, BEN_CAPTIONS.rabbit.text);
      boxes.push({ x: rb.x - 8, y: rb.y - 19, w: 16, h: 30 });
    }
  }

  // --- His bed --------------------------------------------------------------------------------
  {
    const pool = (minDet, minEnc) =>
      cells.filter(
        (q) =>
          q.det >= minDet && q.enc >= minEnc && q.prog > 0.12 && q.prog < 0.9 &&
          Math.hypot(q.x - map.start.x, q.y - map.start.y) >= T.nestStart && Math.hypot(q.x - goal.x, q.y - goal.y) >= 650 &&
          (!secret || Math.hypot(q.x - secret.x, q.y - secret.y) >= 500) && world.isFree(q.x, q.y, 30) && clearOf(q.x, q.y, 70),
      );
    let cand = pool(T.nestDetour, 10);
    if (!cand.length) cand = pool(T.nestDetour * 0.5, 7);
    if (!cand.length) cand = pool(150, 3);
    let best = null;
    let bs = -Infinity;
    for (const q of cand) {
      const s = Math.min(q.det, 2200) / 2200 + q.enc / 24 + (lampNear(q.x, q.y) ? 0 : 0.6) + rnd() * 0.5;
      if (s > bs) {
        bs = s;
        best = q;
      }
    }
    if (best) {
      const { x, y } = best;
      // The fort's open side faces the open ground.
      let a = 0;
      let open = -1;
      for (let k = 0; k < 4; k++) {
        const ang = (k * Math.PI) / 2;
        let n = 0;
        for (const d of [40, 70, 100]) if (world.isFree(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 12)) n++;
        if (n > open) {
          open = n;
          a = ang;
        }
      }
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      const at = (along, side) => ({ x: x + ox * along - oy * side, y: y + oy * along + ox * side });
      map.decor.push({ type: 'benfort', x, y, a, slept: 17 + Math.floor(rnd() * 19) });
      read(x, y, BEN_NEST.fort.label, BEN_NEST.fort.text);
      const rab = at(-12, 8); // sitting on the bed
      map.decor.push({ type: 'rabbit', x: rab.x, y: rab.y, a: a + 0.5, nest: true });
      read(rab.x, rab.y, BEN_CAPTIONS.rabbitNest.label, BEN_CAPTIONS.rabbitNest.text);
      const lt = at(34, -32);
      crayon(lt.x, lt.y, BEN_NEST.light, 9, (rnd() - 0.5) * 0.1);
      read(lt.x, lt.y, BEN_CAPTIONS.label, BEN_NEST.light);
      const pm = at(46, -17);
      const pd = at(46, 17);
      map.decor.push({ type: 'benpaper', kind: 'map', x: pm.x, y: pm.y, a: a + r(-0.4, 0.4) });
      map.decor.push({ type: 'benpaper', kind: 'drawing', x: pd.x, y: pd.y, a: a + r(-0.4, 0.4) });
      B.papers.push({ kind: 'map', x: pm.x, y: pm.y }, { kind: 'drawing', x: pd.x, y: pd.y });
      // Been here before? He noticed.
      const seen = (mem.nests && mem.nests[level]) || 0;
      if (seen) {
        const line = seen >= 3 ? BEN_NEST.rabbit : BEN_NEST.again;
        const lp = at(76, 0);
        if (world.isFree(lp.x, lp.y, 8)) {
          crayon(lp.x, lp.y, line, 9, (rnd() - 0.5) * 0.08);
          read(lp.x, lp.y, BEN_CAPTIONS.label, line);
          B.nestLine = line;
        }
      }
      map.glows.push({ x, y, r: 150, k: 0.5, tint: 'rgba(255,170,90,0.10)', ben: true });
      const kit = at(30, 0); // by the way in
      map.pickups.push({ kind: 'medkit', x: kit.x, y: kit.y });
      B.nest = { x, y, a, mouth: at(64, 0), can: at(-6, 16), candle: at(-18, -16) };
      busy.push({ x, y, r: 170 });
    }
  }

  // --- Two little eyes ---------------------------------------------------------------------------
  // By the secret, looking at it.
  if (secret) {
    for (let k = 0; k < 24; k++) {
      const ang = rnd() * Math.PI * 2;
      const dist = r(80, 140);
      const x = secret.x + Math.cos(ang) * dist;
      const y = secret.y + Math.sin(ang) * dist;
      if (!world.isFree(x, y, 10) || !world.segmentClear(x, y, secret.x, secret.y) || !clearOf(x, y)) continue;
      eyes(x, y, Math.atan2(secret.y - y, secret.x - x));
      break;
    }
  }
  // From the walk to his bed: a few, every ~260 u, looking the way to go.
  if (B.nest) {
    const nf = new FlowField(world);
    nf.compute(B.nest.x, B.nest.y);
    let bi = -1;
    let bd = INF;
    for (const q of cells) {
      if (q.det > 70) continue;
      const d = nf.dist[q.i];
      if (d < bd) {
        bd = d;
        bi = q.i;
      }
    }
    if (bi >= 0) {
      const path = walkDown(world, nf, bi);
      const p0 = center(world, bi);
      B.branch = p0;
      let acc = 0;
      let placed = 0;
      for (let k = 1; k < path.length - 2 && placed < 3; k++) {
        const pa = center(world, path[k - 1]);
        const p = center(world, path[k]);
        acc += Math.hypot(p.x - pa.x, p.y - pa.y);
        if (acc < 110 + placed * 260) continue;
        if (Math.hypot(p.x - B.nest.x, p.y - B.nest.y) < 150) break;
        const n = center(world, path[Math.min(path.length - 1, k + 3)]);
        const look = Math.atan2(n.y - p.y, n.x - p.x);
        const s = toWall(world, p.x, p.y, look);
        if (!clearOf(s.x, s.y, -12)) continue;
        eyes(s.x, s.y, look, 0.9);
        placed++;
      }
    }
  }
  // Outside the boarded rooms, looking at the boards; inside the first one, him.
  (map.sealed || []).forEach((room, k) => {
    const bx = room.boards.x + room.boards.w / 2;
    const by = room.boards.y + room.boards.h / 2;
    const o = room.outside;
    for (const side of [1, -1]) {
      const nx = -room.normal.y * side;
      const ny = room.normal.x * side;
      const x = o.x + nx * 40;
      const y = o.y + ny * 40;
      if (!world.isFree(x, y, 8) || !clearOf(x, y, -10)) continue;
      eyes(x, y, Math.atan2(by - y, bx - x), 0.85);
      break;
    }
    if (k === 0) {
      const I = room.interior;
      for (let t = 0; t < 30; t++) {
        const x = I.x + 30 + rnd() * (I.w - 60);
        const y = I.y + 30 + rnd() * (I.h - 60);
        if (Math.hypot(x - room.stash.x, y - room.stash.y) < 50) continue;
        if (room.sleepers.some((s) => Math.hypot(s.x - x, s.y - y) < 30)) continue;
        if (!world.isFree(x - 40, y, 6) || !world.isFree(x + 40, y, 6)) continue;
        crayon(x, y, BEN_WAS_HERE.sealed, 11, (rnd() - 0.5) * 0.12);
        read(x, y, BEN_CAPTIONS.label, `${BEN_WAS_HERE.sealed}. (The boards were nailed from the outside.)`);
        break;
      }
    }
  });

  // --- Vents: one with footprints walking up to it, one with the eyes -------------------------------
  {
    let vents = 0;
    let trail = false;
    for (const q of cells) {
      if (vents >= 2) break;
      if (q.det < 120 || q.det > 1100 || q.enc < 6) continue;
      if (!clearOf(q.x, q.y, 30) || (B.nest && Math.hypot(q.x - B.nest.x, q.y - B.nest.y) < 300)) continue;
      if (map.decor.some((d) => d.type === 'vent' && Math.hypot(d.x - q.x, d.y - q.y) < 900)) continue;
      const f = wallFace(world, map, q.x, q.y, 64);
      if (!f) continue;
      const vx = f.x;
      const vy = f.y;
      if (!clearOf(vx, vy, 10)) continue;
      if (!trail) {
        // Small shoes, from open ground straight to the wall.
        const pts = [];
        const along = Math.atan2(-f.ny, -f.nx); // walking toward the wall
        for (let k = 0; k < 9; k++) {
          const d = 26 + k * 21;
          const side = k % 2 ? 4.5 : -4.5;
          const wob = Math.sin(k * 1.7) * 3;
          const px = vx + f.nx * d - f.ny * (side + wob);
          const py = vy + f.ny * d + f.nx * (side + wob);
          if (!world.isFree(px, py, 7)) break;
          pts.push([Math.round(px * 10) / 10, Math.round(py * 10) / 10, along]);
        }
        if (pts.length >= 7) {
          trail = true;
          map.decor.push({ type: 'vent', x: vx, y: vy, a: Math.atan2(f.ny, f.nx), open: true });
          read(vx + f.nx * 16, vy + f.ny * 16, BEN_CAPTIONS.vent.label, BEN_CAPTIONS.vent.text);
          map.decor.push({ type: 'footprints', x: pts[4][0], y: pts[4][1], pts });
          read(pts[5][0], pts[5][1], BEN_CAPTIONS.footprints.label, BEN_CAPTIONS.footprints.text);
          busy.push({ x: vx + f.nx * 100, y: vy + f.ny * 100, r: 120 });
          vents++;
          continue;
        }
      }
      if (trail) {
        map.decor.push({ type: 'vent', x: vx, y: vy, a: Math.atan2(f.ny, f.nx), open: false });
        busy.push({ x: vx, y: vy, r: 40 });
        const ex = vx + f.nx * 18 + f.ny * 26;
        const ey = vy + f.ny * 18 - f.nx * 26;
        if (world.isFree(ex, ey, 6)) eyes(ex, ey, Math.atan2(vy - ey, vx - ex), 0.8);
        vents++;
      }
    }
  }

  // --- "ben was here", where nobody could reach --------------------------------------------------
  const nearWalk = (rect, maxDet = 420) => {
    for (let k = 0; k < 16; k++) {
      const x = rect.x - 50 + (k % 4) * ((rect.w + 100) / 3);
      const y = rect.y - 50 + Math.floor(k / 4) * ((rect.h + 100) / 3);
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const i = world.navIndex(x, y);
      if (!world.blocked[i] && A.fs.dist[i] < INF && A.fg.dist[i] < INF && detour(A, i) <= maxDet) return true;
    }
    return false;
  };
  const roofFree = (o) => !(map.roofArt || []).some((ra) => pointInRect(ra.x, ra.y, o, 10)) && !map.benRoof.some((b) => pointInRect(b.x, b.y, o, 10));
  if (theme === 'city') {
    const roofs = shuffle(map.obstacles.filter((o) => o.kind === 'building' && !o.safe && o.w >= 150 && o.h >= 110), rnd);
    for (const o of roofs) {
      if (!roofFree(o) || !nearWalk(o) || Math.hypot(o.x + o.w / 2 - map.start.x, o.y + o.h / 2 - map.start.y) < 700) continue;
      map.benRoof.push({ type: 'text', x: o.x + o.w * r(0.35, 0.65), y: o.y + o.h * r(0.3, 0.7), text: BEN_WAS_HERE.roof, size: clamp(Math.min(o.w, o.h) * 0.11, 12, 17), a: r(-0.25, 0.25) });
      break;
    }
  } else if (theme === 'interior') {
    const tops = shuffle(map.obstacles.filter((o) => (o.kind === 'shelf' && Math.max(o.w, o.h) >= 100) || (o.kind === 'pillar' && o.w >= 34)), rnd);
    tops.sort((p, q) => (q.kind === 'shelf') - (p.kind === 'shelf'));
    const near = tops.filter((o) => nearWalk(o, 420));
    for (const o of near.length ? near : tops) {
      const vert = o.h > o.w;
      const thin = Math.min(o.w, o.h);
      map.benRoof.push({ type: 'text', x: o.x + o.w / 2, y: o.y + o.h / 2, text: BEN_WAS_HERE.shelf, size: o.kind === 'pillar' ? 5.5 : clamp(thin * 0.42, 7, 11), a: vert ? Math.PI / 2 : 0, small: true });
      break;
    }
  } else {
    // Crane 3's boom, out over the water; a stack two containers high; a raft no one could reach.
    if (map.cranes && map.cranes.length >= 3) map.benRoof.push({ type: 'boom', crane: 2, text: BEN_WAS_HERE.boom });
    const stacks = shuffle(map.obstacles.filter((o) => o.kind === 'container' && o.tall), rnd);
    const nearStacks = stacks.filter((o) => nearWalk(o, 300));
    for (const o of nearStacks.length ? nearStacks : stacks) {
      map.benRoof.push({ type: 'text', x: o.x + o.w / 2, y: o.y + o.h / 2, text: BEN_WAS_HERE.container, size: clamp(Math.min(o.w, o.h) * 0.16, 9, 13), a: o.w >= o.h ? 0 : Math.PI / 2, small: true });
      break;
    }
    const side = map.piers.filter((p) => !p.main);
    if (side.length) {
      const p = side[Math.floor(rnd() * side.length)];
      const north = rnd() < 0.5;
      const x = p.x + p.w * r(0.55, 0.85);
      const y = north ? p.y - 70 : p.y + p.h + 70;
      if (!map.piers.some((q) => pointInRect(x, y, q, 30))) {
        map.decor.push({ type: 'raft', x, y, text: BEN_WAS_HERE.buoy });
        read(x, y, 'ON A RAFT, OUT ON THE WATER', BEN_WAS_HERE.buoy, x, north ? p.y + 14 : p.y + p.h - 14);
      }
    }
  }
  // On top of the quarantine wall (if there is one).
  if (map.holdout) {
    const walls = map.obstacles.filter((o) => o.kind === 'qwall' && Math.max(o.w, o.h) >= 160);
    walls.sort((p, q) => Math.hypot(p.x + p.w / 2 - map.holdout.x, p.y + p.h / 2 - map.holdout.y) - Math.hypot(q.x + q.w / 2 - map.holdout.x, q.y + q.h / 2 - map.holdout.y));
    const o = walls[0];
    if (o) {
      const vert = o.h > o.w;
      map.benRoof.push({ type: 'text', x: o.x + o.w / 2, y: vert ? o.y + Math.min(o.h * 0.5, 120) : o.y + o.h / 2, text: BEN_WAS_HERE.roof, size: clamp(Math.min(o.w, o.h) * 0.5, 7, 11), a: vert ? Math.PI / 2 : 0, small: true });
    }
  }

  // --- "don't follow the noise" (the arrows point at it) -------------------------------------------
  {
    const alarms = shuffle(map.obstacles.filter((o) => o.alarm), rnd);
    let done = false;
    for (const o of alarms) {
      if (done) break;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      for (let k = 0; k < 48 && !done; k++) {
        const ang = (k / 16) * Math.PI * 2 + r(0, 0.3);
        const dist = [270, 210, 330][Math.floor(k / 16)];
        const sx = cx + Math.cos(ang) * dist;
        const sy = cy + Math.sin(ang) * dist;
        if (sx < 40 || sy < 40 || sx > map.w - 40 || sy > map.h - 40) continue;
        if (!world.isFree(sx, sy, 14) || !clearOf(sx, sy, 20)) continue;
        const i = world.navIndex(sx, sy);
        if (world.blocked[i] || A.fs.dist[i] >= INF || detour(A, i) > 520) continue;
        const reach = Math.max(o.w, o.h) / 2 + 26;
        const ex = cx + Math.cos(ang) * reach; // just short of the noise, on this side
        const ey = cy + Math.sin(ang) * reach;
        if (!world.segmentClear(sx, sy, ex, ey, world.moveBlockers)) continue;
        const w = BEN_CAPTIONS.noise.length * 11 * 0.56;
        if (!fits(sx, sy - 22, w, 6)) continue;
        const toward = Math.atan2(cy - sy, cx - sx);
        for (const f of [0.28, 0.52, 0.76]) map.decor.push({ type: 'benarrow', x: sx + (ex - sx) * f, y: sy + (ey - sy) * f, a: toward + (rnd() - 0.5) * 0.12 });
        crayon(sx, sy - 22, BEN_CAPTIONS.noise, 11, (rnd() - 0.5) * 0.1);
        read(sx, sy - 22, BEN_CAPTIONS.label, `${BEN_CAPTIONS.noise}. (The arrows point at the noise.)`);
        busy.push({ x: (sx + ex) / 2, y: (sy + ey) / 2, r: 170 });
        done = true;
      }
    }
    // Pier 9: no alarm by the walk? Then the noise is the one you're about to make.
    if (!done && map.finale) {
      const P = map.finale.pier;
      const sy = P.y + P.h * 0.32;
      const sx = P.x + 250;
      if (fits(sx, sy - 22, BEN_CAPTIONS.noise.length * 11 * 0.56, 6)) {
        for (const k of [0, 1, 2]) map.decor.push({ type: 'benarrow', x: sx + 50 + k * 60, y: sy, a: (rnd() - 0.5) * 0.1 });
        crayon(sx, sy - 22, BEN_CAPTIONS.noise, 11, (rnd() - 0.5) * 0.1);
        read(sx, sy - 22, BEN_CAPTIONS.label, `${BEN_CAPTIONS.noise}. (The arrows point down Pier 9.)`);
      }
    }
  }

  // --- The squad about Ben, and what he wrote underneath ----------------------------------------------
  {
    const lines = shuffle(SQUAD_ON_BEN.slice(), rnd).slice(0, T.squad);
    const placed = [];
    lines.forEach((L, k) => {
      const size = theme === 'interior' ? r(11, 13) : r(14, 18);
      const w = L.text.length * size * (theme === 'interior' ? 0.68 : 0.64);
      for (const q of cells) {
        if (q.det > 220 || q.prog < 0.08 || q.prog > 0.95) continue;
        if (placed.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 700)) continue;
        if (!clearOf(q.x, q.y, w / 2) || !fits(q.x, q.y, w) || !fits(q.x, q.y + size * 0.5 + 12, 70, 6)) continue;
        const color = theme === 'interior' ? MARKER[k % MARKER.length] : SPRAY[(k * 2 + 1) % SPRAY.length];
        map.decor.push({ type: 'graffiti', x: q.x, y: q.y, text: L.text, color, size, a: (rnd() - 0.5) * 0.12, drip: theme !== 'interior' && rnd() < 0.4, marker: theme === 'interior' });
        read(q.x, q.y, theme === 'interior' ? 'SCRAWLED' : 'GRAFFITI', L.text);
        if (L.reply) {
          const ry = q.y + size * 0.5 + 12;
          const rx = q.x + r(-w * 0.18, w * 0.18);
          crayon(rx, ry, L.reply, 10, (rnd() - 0.5) * 0.08);
          read(rx, ry + 4, BEN_CAPTIONS.reply, L.reply);
        }
        placed.push(q);
        busy.push({ x: q.x, y: q.y, r: w / 2 + 40 });
        break;
      }
    });
  }

  // --- One page of what happened (early on the run) ---------------------------------------------------
  {
    const note = BEN_NOTES[theme];
    for (const q of cells) {
      if (q.prog < 0.08 || q.prog > 0.5 || q.det < 100 || q.det > 700 || q.enc < 6) continue;
      if (!clearOf(q.x, q.y, 20) || !world.isFree(q.x, q.y, 14)) continue;
      map.decor.push({ type: 'note', x: q.x, y: q.y, a: r(-0.3, 0.3) });
      read(q.x, q.y, note.label, note.text);
      busy.push({ x: q.x, y: q.y, r: 60 });
      break;
    }
  }

  // --- The lamp that spells something ---------------------------------------------------------------
  {
    const ref = B.branch || B.nest || map.start;
    let best = null;
    let bd = 900;
    for (const l of map.lamps) {
      const d = Math.hypot(l.x - ref.x, l.y - ref.y);
      if (d < bd && !pointInRect(l.x, l.y, map.startRoom.outer, 60) && !pointInRect(l.x, l.y, map.endRoom.outer, 60)) {
        bd = d;
        best = l;
      }
    }
    if (best) {
      best.morse = true;
      best.broken = true;
      B.morse = { x: best.x, y: best.y };
    }
  }

  // --- The Tinkerer's mark has a second eye now; the roll call has one more name ------------------------
  for (const den of (map.dens || []).slice(0, 1)) {
    const gear = map.decor.find((d) => d.type === 'doodle' && d.art === 'gear' && Math.hypot(d.x - den.x, d.y - den.y) < 90);
    if (gear) {
      map.decor.push({ type: 'beneyes', x: gear.x + 22 * (gear.s || 1), y: gear.y - 2, look: Math.PI, s: 0.6 });
      read(gear.x + 22, gear.y, 'SCRATCHED', 'The gear-and-eye mark. Someone added a second eye, in orange.');
    }
    for (let t = 0; t < 20; t++) {
      const ang = rnd() * Math.PI * 2;
      const x = den.x + Math.cos(ang) * r(70, 110);
      const y = den.y + Math.sin(ang) * r(70, 110);
      if (!world.isFree(x, y, 8) || map.decor.some((d) => d.type === 'note' && Math.hypot(d.x - x, d.y - y) < 30)) continue;
      map.decor.push({ type: 'note', x, y, a: r(-0.4, 0.4) });
      read(x, y, 'NOTE', BEN_CAPTIONS.tinkerer);
      break;
    }
  }
  const roll = map.decor.find((d) => d.type === 'whiteboard' && /ROLL CALL/.test(d.text || ''));
  if (roll) {
    crayon(roll.x + (roll.horiz === false ? 30 : 0), roll.y + (roll.horiz === false ? 0 : 22), 'ben ✓', 9, -0.08);
    read(roll.x, roll.y + 22, BEN_CAPTIONS.label, BEN_CAPTIONS.rollcall);
  }

  // --- The way out: eyes inside the last room, looking back the way you came ------------------------------
  if (!map.endRoom.gangway) {
    const d = map.endRoom.door;
    const I = map.endRoom.interior;
    const dx = d.x + d.w / 2;
    const dy = d.y + d.h / 2;
    const ix = I.x + I.w / 2;
    const iy = I.y + I.h / 2;
    const L = Math.hypot(ix - dx, iy - dy) || 1;
    const ex = dx + ((ix - dx) / L) * 30 + ((iy - dy) / L) * 34;
    const ey = dy + ((iy - dy) / L) * 30 - ((ix - dx) / L) * 34;
    if (pointInRect(ex, ey, I, -6)) eyes(ex, ey, Math.atan2(dy - ey, dx - ex), 0.7, 'Two little eyes by the door, looking back the way you came.');
  }

  // --- Where you might catch him looking (run time decides if it happens) ------------------------------------
  for (const q of cells) {
    if (q.prog < 0.3 || q.prog > 0.8 || q.det < 120 || q.det > 520 || q.enc < 8) continue;
    if (!clearOf(q.x, q.y, 40) || lampNear(q.x, q.y, 1.1)) continue;
    if (B.nest && Math.hypot(q.x - B.nest.x, q.y - B.nest.y) < 700) continue;
    B.glimpse = { x: q.x, y: q.y };
    break;
  }

  // --- His map of this place ------------------------------------------------------------------------------
  const rects = theme === 'interior'
    ? (map.rooms || []).map((q) => [q.x, q.y, q.w, q.h])
    : theme === 'docks'
      ? [...map.blocks.map((b) => [b.x, b.y, b.w, b.h]), [map.yard.x, map.yard.y, map.yard.w, map.yard.h], ...map.piers.map((p) => [p.x, p.y, p.w, p.h])]
      : map.blocks.map((b) => [b.x, b.y, b.w, b.h]);
  B.sketch = {
    w: map.w,
    h: map.h,
    rects: rects.map((q) => q.map((v) => Math.round(v))),
    quay: theme === 'docks' ? map.piers[0].x : null,
    start: { x: map.start.x, y: map.start.y },
    goal,
    nest: B.nest ? { x: B.nest.x, y: B.nest.y } : null,
    secret: secret ? { x: secret.x, y: secret.y } : null,
    eyes: B.eyes.slice(0, 4).map((e) => ({ x: e.x, y: e.y })),
    // The one place nobody has found: off the edge of this map.
    away: theme === 'docks' ? { x: map.w * 1.05, y: map.h * 0.32, kind: 'island' } : theme === 'interior' ? { x: map.w * 0.5, y: map.h * 1.06, kind: 'stairs' } : { x: -map.w * 0.04, y: map.h * 0.08, kind: 'house' },
  };
  return map;
}

// --- Helpers ----------------------------------------------------------------------------------------

function center(world, i) {
  const c = { x: 0, y: 0 };
  world.cellCenter(i, c);
  return c;
}

/** Cell path from i downhill along a flow field to its target. */
function walkDown(world, f, i) {
  const nw = world.navW;
  const path = [i];
  for (let s = 0; s < 500 && f.dist[i] > 0; s++) {
    const cx = i % nw;
    const cy = (i - cx) / nw;
    let best = -1;
    let bd = f.dist[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= nw || y >= world.navH) continue;
        const j = y * nw + x;
        if (world.blocked[j] || f.dist[j] >= bd) continue;
        bd = f.dist[j];
        best = j;
      }
    }
    if (best < 0) break;
    i = best;
    path.push(i);
  }
  return path;
}

/** Nudge a point toward a wall beside the path (scratched at the base of it), if one is close. */
function toWall(world, x, y, look) {
  const nx = -Math.sin(look);
  const ny = Math.cos(look);
  for (const side of [1, -1]) {
    for (let d = 8; d <= 40; d += 4) {
      if (!world.isFree(x + nx * side * d, y + ny * side * d, 6)) {
        const k = Math.max(0, d - 12);
        return { x: x + nx * side * k, y: y + ny * side * k };
      }
    }
  }
  return { x, y };
}

/** The face of a tall wall (building / room wall / container) within maxD of (x, y): {x, y, nx, ny} (normal points out). */
function wallFace(world, map, x, y, maxD) {
  let best = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let s = 4; s <= maxD; s += 2) {
      const px = x + dx * s;
      const py = y + dy * s;
      if (world.isFree(px, py, 1)) continue;
      const o = map.obstacles.find((q) => pointInRect(px + dx * 3, py + dy * 3, q));
      if (o && o.sight && o.kind !== 'border' && o.kind !== 'qwall' && !o.boards && Math.max(o.w, o.h) >= 60 && (!best || s < best.s)) {
        best = { s, x: px - dx * 3, y: py - dy * 3, nx: -dx, ny: -dy };
      }
      break;
    }
  }
  if (!best) return null;
  // The face must run on both sides of the vent (a real wall, not a corner).
  for (const t of [-14, 14]) {
    if (world.isFree(best.x - best.nx * 6 + best.ny * t, best.y - best.ny * 6 - best.nx * t, 1)) return null;
  }
  return best;
}

/** Text boxes of the writing already in a rect (for not writing over it). */
function textBoxes(decor, rect) {
  const out = [];
  for (const d of decor) {
    if (!pointInRect(d.x, d.y, rect, 4)) continue;
    if (d.type === 'graffiti' || d.type === 'bentext') {
      const s = d.size || 12;
      const w = (d.text || '').length * s * 0.58;
      out.push({ x: d.x - w / 2, y: d.y - s / 2, w, h: s });
    } else if (d.type === 'doodle') out.push({ x: d.x - 13, y: d.y - 12, w: 26, h: 24 });
  }
  return out;
}

/** Blocked cells in the 5x5 around i (0 = open plaza, 24 = sealed in). */
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
