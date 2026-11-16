// Strays: the save. One JSON blob in localStorage, and a migrate() that
// repairs anything odd in it rather than throwing: a bad save must never
// leave the block unplayable.

import {
  ROOMS,
  COLS,
  ROWS,
  FIRST_ROOM,
  BAG,
  SOMEBODY,
  HERO,
  KIND_BY_ID,
  NAMES,
  SKINS,
  HAIRS,
  STYLES,
  QUIRKS,
  DEFAULT_TUNING,
} from './config.js';
import { freshState } from './rules.js';

export const SAVE_KEY = 'funland2.strays.v1';
export const TUNING_KEY = 'funland2.strays.tuning.v1';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const int = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return n < lo ? lo : n > hi ? hi : n;
};
const time = (v, dflt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e15 ? n : dflt;
};

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Make any saved thing into a playable state (or null: start a new block).
 * Unknown people are dropped, rooms are re-linked, numbers are clamped.
 */
export function migrate(saved, now) {
  if (!saved || typeof saved !== 'object' || saved.v !== 1) return null;
  const s = freshState(int(saved.seed, 0, 0xffffffff, 1), time(saved.born, now));
  s.cans = int(saved.cans, 0, 99999, 0);
  s.clockOffset = Number.isFinite(Number(saved.clockOffset)) ? Number(saved.clockOffset) : 0;

  // People first: only ones the art knows how to draw.
  const people = saved.people && typeof saved.people === 'object' ? saved.people : {};
  const kinds = new Set();
  for (const id of Object.keys(people)) {
    const q = people[id];
    if (!q || typeof q !== 'object' || !own(KIND_BY_ID, q.kind) || kinds.has(q.kind)) continue;
    if (Object.keys(s.people).length >= ROOMS) break;
    kinds.add(q.kind);
    const stage = int(q.stage, BAG, HERO, BAG);
    s.people[id] = {
      id,
      kind: q.kind,
      name: typeof q.name === 'string' && /^[A-Z]{1,8}$/.test(q.name) ? q.name : NAMES[Object.keys(s.people).length % NAMES.length],
      skin: int(q.skin, 0, SKINS - 1, 0),
      hair: int(q.hair, 0, HAIRS - 1, 0),
      style: int(q.style, 0, STYLES - 1, 0),
      quirk: QUIRKS.includes(q.quirk) ? q.quirk : QUIRKS[0],
      born: time(q.born, now),
      stage,
      hearts: int(q.hearts, 0, 999, 0),
      wakeAt: time(q.wakeAt),
      hungryAt: time(q.hungryAt),
      hugAt: time(q.hugAt),
      hurt: !!q.hurt && stage >= SOMEBODY,
      restUntil: time(q.restUntil),
      trips: int(q.trips, 0, 1e6, 0),
    };
    if (q.shownAt != null) s.people[id].shownAt = time(q.shownAt, now);
    if (q.heroAt != null) s.people[id].heroAt = time(q.heroAt, now);
  }

  // Rooms: open or not, and who lives there (each person in one room at most).
  const rooms = Array.isArray(saved.rooms) ? saved.rooms : [];
  const housed = new Set();
  for (let i = 0; i < ROOMS; i++) {
    const r = rooms[i];
    if (!r || typeof r !== 'object') continue;
    s.rooms[i].open = !!r.open;
    if (r.open && typeof r.who === 'string' && own(s.people, r.who) && !housed.has(r.who)) {
      s.rooms[i].who = r.who;
      housed.add(r.who);
    }
  }
  s.rooms[FIRST_ROOM].open = true;
  // A room only opens next to an open one: close any that float on their own.
  const linked = new Set([FIRST_ROOM]);
  const queue = [FIRST_ROOM];
  while (queue.length) {
    const i = queue.pop();
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    for (const j of [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, r > 0 ? i - COLS : -1, r < ROWS - 1 ? i + COLS : -1]) {
      if (j >= 0 && s.rooms[j].open && !linked.has(j)) {
        linked.add(j);
        queue.push(j);
      }
    }
  }
  for (let i = 0; i < ROOMS; i++) {
    if (s.rooms[i].open && !linked.has(i)) {
      if (s.rooms[i].who) housed.delete(s.rooms[i].who);
      s.rooms[i] = { open: false, who: null };
    }
  }

  // Whoever has no room waits at the door (one at most; the rest never came).
  const homeless = Object.keys(s.people).filter((id) => !housed.has(id));
  const door = typeof saved.door === 'string' && homeless.includes(saved.door) ? saved.door : homeless[0] || null;
  for (const id of homeless) if (id !== door) delete s.people[id];
  s.door = door;
  if (door) {
    const free = s.rooms.findIndex((r) => r.open && !r.who);
    if (free >= 0) {
      s.rooms[free].who = door;
      s.door = null;
    } else {
      s.people[door].stage = BAG;
      s.people[door].hearts = 0;
    }
  }

  // An empty block can't start itself: without anybody, begin again.
  if (!Object.keys(s.people).length) return null;

  const maxId = Math.max(0, ...Object.keys(s.people).map((id) => int(String(id).slice(1), 0, 1e9, 0)));
  s.nextId = Math.max(int(saved.nextId, 1, 1e9, 1), maxId + 1);
  s.arrivals = Math.max(int(saved.arrivals, 0, 1e9, 0), Object.keys(s.people).length);
  s.moveIns = Math.max(int(saved.moveIns, 0, 1e9, 0), housed.size);
  s.trips = int(saved.trips, 0, 1e9, 0);
  s.bonks = int(saved.bonks, 0, 1e9, 0);
  s.followMiss = int(saved.followMiss, 0, 99, 0);
  s.bonkMiss = int(saved.bonkMiss, 0, 99, 0);
  s.zombies = int(saved.zombies, 0, 9, 0);
  s.zombieAt = time(saved.zombieAt);

  // The Book: every kind somebody here has shown, and whatever was met before.
  const met = Array.isArray(saved.met) ? saved.met.filter((k) => own(KIND_BY_ID, k)) : [];
  const heroes = Array.isArray(saved.heroes) ? saved.heroes.filter((k) => own(KIND_BY_ID, k)) : [];
  for (const p of Object.values(s.people)) {
    if (p.stage >= SOMEBODY && !met.includes(p.kind)) met.push(p.kind);
    if (p.stage >= HERO && !heroes.includes(p.kind)) heroes.push(p.kind);
  }
  s.met = [...new Set(met)];
  s.heroes = [...new Set(heroes)].filter((k) => s.met.includes(k));
  if (s.met.length && !s.zombieAt) s.zombieAt = now;

  if (saved.seen && typeof saved.seen === 'object') {
    for (const k of Object.keys(saved.seen)) if (/^[a-zA-Z0-9]{1,24}$/.test(k) && saved.seen[k]) s.seen[k] = true;
  }
  const st = saved.stats && typeof saved.stats === 'object' ? saved.stats : {};
  for (const k of Object.keys(s.stats)) s.stats[k] = int(st[k], 0, 1e9, 0);
  return s;
}

export function loadState(now) {
  const ls = store();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SAVE_KEY);
    return raw ? migrate(JSON.parse(raw), now) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  const ls = store();
  if (!ls) return false;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  const ls = store();
  try {
    if (ls) ls.removeItem(SAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The tuning lives in its own key, so resetting the block keeps the sliders. */
export function loadTuning() {
  const t = structuredClone(DEFAULT_TUNING);
  const ls = store();
  if (!ls) return t;
  try {
    const saved = JSON.parse(ls.getItem(TUNING_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(t)) {
        if (!own(saved, k)) continue;
        if (typeof t[k] === 'number' && Number.isFinite(Number(saved[k]))) t[k] = Number(saved[k]);
        else if (typeof t[k] === 'boolean') t[k] = !!saved[k];
      }
    }
  } catch {
    /* keep the defaults */
  }
  return t;
}

export function saveTuning(tuning) {
  const ls = store();
  if (!ls) return;
  try {
    const out = {};
    for (const k of Object.keys(DEFAULT_TUNING)) {
      if (typeof DEFAULT_TUNING[k] !== 'object' && tuning[k] !== DEFAULT_TUNING[k]) out[k] = tuning[k];
    }
    ls.setItem(TUNING_KEY, JSON.stringify(out));
  } catch {
    /* not saved: fine */
  }
}
