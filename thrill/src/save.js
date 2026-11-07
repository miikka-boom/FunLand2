// Persistence: the save and the testing tuning, in localStorage. Loading fills
// in anything a newer build added, so old saves keep working.

import { newState, newStats } from './meta.js';
import { TUNING_DEFAULTS, PERKS, RARITIES } from './config.js';

export const SAVE_KEY = 'funland2.thrill.save.v1';
const TUNING_KEY = 'funland2.thrill.tuning.v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  return null;
}

export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

const PERSON_DEFAULTS = { level: 1, badges: 0, raids: 0, wins: 0, golden: false, siblingOf: null, family: null, nick: null, elder: null, perk: null };

/** Bring a parsed save up to the current shape (at the save's own park time). */
export function migrate(saved, now) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Array.isArray(saved.people) || !saved.people.length) return newState(now ?? Date.now());
  const offset = Number(saved.clockOffset) || 0;
  const fresh = newState(now ?? Date.now() + offset, saved.seed);
  const s = fillMissing(saved, fresh);
  if (!Array.isArray(s.squad)) s.squad = [];
  if (!Array.isArray(s.threats) || !s.threats.length) s.threats = fresh.threats;
  if (!Array.isArray(s.log)) s.log = [];
  s.stats = fillMissing(s.stats || {}, newStats());
  for (const p of s.people) {
    for (const [k, v] of Object.entries(PERSON_DEFAULTS)) if (p[k] === undefined) p[k] = v;
    // A perk a newer build removed becomes one that exists (or none for a Rookie).
    if (p.perk && !PERKS[p.perk]) p.perk = RARITIES[p.rarity] && RARITIES[p.rarity].perk > 0 ? 'gemnose' : null;
  }
  s.squad = s.squad.filter((id) => s.people.some((p) => p.id === id));
  if (!s.squad.length) s.squad = s.people.slice(0, 3).map((p) => p.id);
  return s;
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fillMissing(target, template) {
  for (const k of Object.keys(template)) {
    const tv = template[k];
    const cur = target[k];
    if (cur === undefined || (cur === null && tv !== null) || typeof cur !== typeof tv) {
      if (!(cur === null && tv === null) && !(cur !== undefined && tv === null)) target[k] = clone(tv);
    } else if (isObj(tv) && isObj(cur)) fillMissing(cur, tv);
  }
  return target;
}

const clone = (v) => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

export function clearTuning() {
  try {
    localStorage.removeItem(TUNING_KEY);
  } catch {
    // ignore
  }
}

export function loadTuning() {
  const t = { ...TUNING_DEFAULTS };
  try {
    const raw = localStorage.getItem(TUNING_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of Object.keys(TUNING_DEFAULTS)) if (k in saved && typeof saved[k] === typeof TUNING_DEFAULTS[k]) t[k] = saved[k];
    }
  } catch {
    // defaults
  }
  return t;
}

export function saveTuning(t) {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(t));
  } catch {
    // ignore
  }
}
