// Persistence: the save and the testing tuning, in localStorage. Loading fills
// in anything a newer build added, so old saves keep working. (The earlier,
// bigger Last Stop kept its save under another key; it starts fresh.)

import { newTownState, newStats } from './town.js';
import { TUNING_DEFAULTS, RARITIES } from './config.js';

export const SAVE_KEY = 'funland2.outpost.simple.v1';
const TUNING_KEY = 'funland2.outpost.simple.tuning.v1';

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

const PERSON_DEFAULTS = { level: 1, raids: 0, wins: 0, golden: false, nick: null, elder: null, perk: null };
const KINDS = ['station', 'home', 'decor', 'landmark'];

/** Bring a parsed save up to the current shape. Anything that isn't a save becomes a fresh town. */
export function migrate(saved, now) {
  const ok = saved && typeof saved === 'object' && !Array.isArray(saved) && Array.isArray(saved.people) && saved.people.length && Array.isArray(saved.objects) && saved.lots && typeof saved.lots === 'object';
  if (!ok) return newTownState(now ?? Date.now());
  const fresh = newTownState(now ?? Date.now(), saved.seed);
  const s = fillMissing(saved, fresh);
  s.stats = fillMissing(s.stats || {}, newStats());
  s.people = s.people.filter((p) => p && Number.isFinite(p.id) && RARITIES[p.rarity]);
  if (!s.people.length) return fresh;
  for (const p of s.people) for (const [k, v] of Object.entries(PERSON_DEFAULTS)) if (p[k] === undefined) p[k] = v;
  s.objects = s.objects.filter((o) => o && KINDS.includes(o.kind) && Number.isFinite(o.i) && Number.isFinite(o.j) && o.size > 0 && (o.kind !== 'home' || s.people.some((p) => p.id === o.ref)));
  if (!s.objects.some((o) => o.kind === 'station')) s.objects.unshift({ ...fresh.objects.find((o) => o.kind === 'station'), id: Math.max(0, ...s.objects.map((o) => o.id)) + 1 });
  s.nextObj = Math.max(s.nextObj || 1, ...s.objects.map((o) => o.id + 1));
  s.nextId = Math.max(s.nextId || 1, ...s.people.map((p) => p.id + 1));
  if (!s.people.some((p) => p.id === s.pick)) s.pick = s.people[0].id;
  s.night = Math.max(1, Math.floor(s.night) || 1);
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
