// Scavenging at run time: searching stashes, what's in them, and boarded-up
// doors (shove or shoot them open). Placement lives in world/scavenge-gen.js.

import { clamp, pointInRect, rand, TAU, wrapAngle } from '../util.js';
import { Zombie, alertZombie } from './zombies.js';

export const ARMOR_MAX = 100;
export const ADRENALINE_TIME = 20; // s: faster, no slow-down from hits, quicker reloads and shoves
export const HOT_DMG = 1.5; // hot rounds: x1.5 damage, +1 pierce
export const MAG_MULT = 1.5; // extended mags

export const LOOT = {
  medkit: { name: 'MEDKIT', color: '#ff8a7a' },
  armor: { name: 'ARMOR +50', color: '#86c8ff' },
  armorbig: { name: 'FULL ARMOR', color: '#86c8ff' },
  hot: { name: 'HOT ROUNDS ×60', color: '#ffa451' },
  hotbig: { name: 'HOT ROUNDS ×150', color: '#ffa451' },
  adrenaline: { name: 'ADRENALINE', color: '#ffe066' },
  extmags: { name: 'EXTENDED MAGS', color: '#9df0ff' },
  vitality: { name: '+25 MAX HP', color: '#8cffa0' },
};

/** Seconds of standing at a stash to search it. */
export const SEARCH_TIME = { stash: 0.7, room: 0.9, secret: 1.3 };
export const STASH_REACH = 34;
const SHOVE_BOARD_DMG = 40; // 3 shoves
const BULLET_BOARD_K = 0.4; // share of a bullet's damage the boards take
const WOOD = ['#7a5a36', '#8a6a40', '#5e4428', '#9a7a4c'];
const TIER_LABEL = { stash: 'SUPPLIES', room: 'BOARDED ROOM', secret: 'SECRET' };

export function initLoot(game, map) {
  const stashes = (map.stashes || []).map((s) => ({ ...s, opened: false, search: 0, openT: 0, got: null }));
  const totals = { stash: 0, room: 0, secret: 0 };
  for (const s of stashes) totals[s.tier]++;
  game.loot = { stashes, sealed: map.sealed || [], totals, planks: [], rustleT: 0 };
}

/** Whatever was nailed in with the stash (idle until the boards come down). */
export function spawnSleepers(game) {
  for (const room of game.loot.sealed) {
    for (const s of room.sleepers) if (game.world.isFree(s.x, s.y, 11)) game.zombies.push(new Zombie(s.x, s.y, false));
  }
}

export function updateLoot(game, dt) {
  const L = game.loot;
  if (!L) return;
  const p = game.player;
  const can = p.alive && !p.pinnedBy && !game.won && !game.lost;
  let searching = false;
  for (const s of L.stashes) {
    if (s.opened) {
      s.openT += dt;
      continue;
    }
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    if (can && dx * dx + dy * dy < STASH_REACH * STASH_REACH) {
      searching = true;
      s.search += dt / SEARCH_TIME[s.tier];
      if (s.search >= 1) openStash(game, s);
    } else if (s.search > 0) {
      s.search = Math.max(0, s.search - dt * 1.5);
    }
  }
  if (searching) {
    L.rustleT -= dt;
    if (L.rustleT <= 0) {
      L.rustleT = 0.2;
      game.audio.rummage();
    }
  } else L.rustleT = 0;
  for (const k of L.planks) k.t += dt;
  for (const room of L.sealed) if (room.boards.hitT > 0) room.boards.hitT -= dt;
}

function openStash(game, s) {
  const L = game.loot;
  s.opened = true;
  s.search = 1;
  s.openT = 0;
  s.got = s.loot.map((id) => applyLoot(game, id, s));
  const key = s.tier === 'stash' ? 'stashes' : s.tier === 'room' ? 'rooms' : 'secrets';
  game.stats[key]++;
  const found = game.stats[key];
  const names = s.got.map((id) => LOOT[id].name).join('  ·  ');
  if (s.tier === 'secret') {
    game.announce('SECRET STASH!', '#d9b3ff', 2.6);
    game.announce(names, '#ffe9b0', 2.6, 'small');
  } else {
    game.announce(names, LOOT[s.got[0]].color, 2.2);
    game.announce(`${TIER_LABEL[s.tier]} ${found}/${L.totals[s.tier]}`, 'rgba(255,240,200,0.85)', 2.2, 'small');
  }
  game.audio.stashOpen(s.tier);
  game.haptic(s.tier === 'stash' ? 20 : 40);
  game.effects.light(s.x, s.y, s.tier === 'secret' ? 220 : 150, 0.7, 0.9);
  game.effects.sparkle(s.x, s.y, s.tier === 'secret' ? 22 : 12);
}

/** Applies one item; returns the id actually given (a second EXTENDED MAGS becomes hot rounds). */
export function applyLoot(game, id, s) {
  const p = game.player;
  switch (id) {
    case 'medkit':
      spillMedkit(game, s.x, s.y);
      return id;
    case 'armor':
      p.armor = Math.min(ARMOR_MAX, p.armor + 50);
      return id;
    case 'armorbig':
      p.armor = ARMOR_MAX;
      return id;
    case 'hot':
      p.hot += 60;
      return id;
    case 'hotbig':
      p.hot += 150;
      return id;
    case 'adrenaline':
      p.adrenT = Math.max(p.adrenT, ADRENALINE_TIME);
      return id;
    case 'extmags':
      if (p.magMult > 1) {
        p.hot += 150;
        return 'hotbig';
      }
      p.magMult = MAG_MULT;
      for (const w of p.weapons) {
        w.cap = Math.round(w.def.mag * MAG_MULT);
        w.mag = w.cap;
        w.reloading = false;
      }
      return id;
    case 'vitality':
      p.maxHp += 25;
      p.hp = Math.min(p.maxHp, p.hp + 25);
      return id;
    default:
      return id;
  }
}

/** A medkit pops out next to the stash (the normal pickup rules apply: taken when you're hurt). */
function spillMedkit(game, x, y) {
  const W = game.world;
  const a0 = rand(0, TAU);
  for (let k = 0; k < 12; k++) {
    const a = a0 + (k / 12) * TAU;
    const px = x + Math.cos(a) * 30;
    const py = y + Math.sin(a) * 30;
    if (!W.isFree(px, py, 10) || !W.segmentClear(x, y, px, py, W.moveBlockers)) continue;
    game.pickups.push({ kind: 'medkit', x: px, y: py, taken: false, bob: rand(0, 6), pop: 0 });
    return;
  }
  game.pickups.push({ kind: 'medkit', x, y, taken: false, bob: rand(0, 6), pop: 0 });
}

// --- Hot rounds ------------------------------------------------------------------------

const hotDefs = new Map();
/** The weapon as fired with hot rounds loaded. */
export function hotDef(def) {
  let h = hotDefs.get(def);
  if (!h) {
    h = { ...def, dmg: def.dmg * HOT_DMG, pierce: def.pierce + 1, knock: def.knock * 1.25, tracer: [255, 116, 54], hot: true };
    hotDefs.set(def, h);
  }
  return h;
}

// --- Boards ------------------------------------------------------------------------------

/** Bullets that stop on boards chip them (only the player's: the teammate never breaks in). */
export function shootBoards(game, o, def, dx, dy, x, y) {
  damageBoards(game, o, def.dmg * BULLET_BOARD_K, dx, dy, x, y);
}

/** Shove hits boards in front of you within reach. Returns how many were hit. */
export function shoveBoards(game, p, ang, reach, halfAngle) {
  const L = game.loot;
  if (!L) return 0;
  let hits = 0;
  for (const room of L.sealed) {
    const o = room.boards;
    if (o.broken) continue;
    const cx = clamp(p.x, o.x, o.x + o.w);
    const cy = clamp(p.y, o.y, o.y + o.h);
    const dx = cx - p.x;
    const dy = cy - p.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + p.r) continue;
    if (d > p.r + 6 && Math.abs(wrapAngle(Math.atan2(dy, dx) - ang)) > halfAngle) continue;
    damageBoards(game, o, SHOVE_BOARD_DMG, dx / (d || 1), dy / (d || 1), cx, cy);
    hits++;
  }
  return hits;
}

export function damageBoards(game, o, dmg, dx, dy, x = o.x + o.w / 2, y = o.y + o.h / 2) {
  if (o.broken) return;
  o.hp -= dmg;
  o.hitT = 0.18;
  game.effects.debris(x, y, 3, WOOD);
  game.audio.boardHit(x, y);
  game.noise(x, y, 240); // banging on boards carries a little
  if (o.hp <= 0) breakBoards(game, o, dx, dy);
}

function breakBoards(game, o, dx, dy) {
  o.broken = true;
  o.hp = 0;
  game.world.removeObstacle(o);
  const room = o.sealed;
  if (room) room.open = true;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  game.effects.debris(cx, cy, 16, WOOD);
  // Planks land on the floor, mostly the way they were knocked.
  for (let k = 0; k < 4; k++) {
    const a = Math.atan2(dy, dx) + rand(-1.1, 1.1);
    const dist = rand(10, 46);
    game.loot.planks.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, a: rand(0, Math.PI), len: rand(30, 52), t: 0 });
  }
  game.audio.boardBreak(cx, cy);
  game.addTrauma(0.22);
  game.haptic(30);
  game.noise(cx, cy, 700); // loud: the street hears it
  game.director.addIntensity(0.15);
  game.stats.boards++;
  if (room) {
    for (const z of game.zombies) {
      if (z.alive && z.state === 'idle' && pointInRect(z.x, z.y, room.interior, 12)) alertZombie(game, z, rand(0.15, 0.6), false);
    }
  }
}
