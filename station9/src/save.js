// Persistence: the save and the dev tuning, in localStorage. Loading fills in
// anything a newer build added, so old saves keep working.

import { newState } from './meta.js';
import { TUNING_DEFAULTS } from './config.js';

const SAVE_KEY = 'funland2.station9.save.v1';
const TUNING_KEY = 'funland2.station9.tuning.v1';

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

/**
 * Bring a parsed save up to the current shape. Missing fields are filled in at the
 * save's own street time (real time + its warp offset).
 */
export function migrate(saved, now) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return newState(now ?? Date.now());
  const offset = Number(saved.clockOffset) || 0;
  const fresh = newState(now ?? Date.now() + offset);
  const s = fillMissing(saved, fresh);
  if (!Array.isArray(s.stars)) s.stars = fresh.stars;
  while (s.stars.length < fresh.stars.length) s.stars.push(0);
  if (!Array.isArray(s.people)) s.people = [];
  if (!Array.isArray(s.crew)) s.crew = [];
  if (!Array.isArray(s.candidates)) s.candidates = [];
  if (!Array.isArray(s.gate.visitors)) s.gate.visitors = [];
  // No "you" yet and nobody to pick from: offer fresh candidates.
  if (s.you === null && !s.candidates.length) s.candidates = fresh.candidates;
  for (const p of [...s.people, ...s.gate.visitors, ...s.candidates]) fixPerson(p);
  return s;
}

const PERSON_DEFAULTS = { level: 1, xp: 0, rest: 0, runs: 0, nick: null };

function fixPerson(p) {
  for (const [k, v] of Object.entries(PERSON_DEFAULTS)) if (p[k] === undefined) p[k] = v;
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fillMissing(target, template) {
  for (const k of Object.keys(template)) {
    const tv = template[k];
    const cur = target[k];
    if (cur === undefined || (cur === null && tv !== null && typeof tv === 'object') || (cur !== null && typeof cur !== typeof tv && tv !== null)) {
      target[k] = clone(tv);
    } else if (isObj(tv) && isObj(cur)) fillMissing(cur, tv);
  }
  return target;
}

function clone(v) {
  return v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));
}

export function loadTuning() {
  const t = { ...TUNING_DEFAULTS };
  try {
    const raw = localStorage.getItem(TUNING_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of Object.keys(TUNING_DEFAULTS)) {
        if (k in saved && typeof saved[k] === typeof TUNING_DEFAULTS[k]) t[k] = saved[k];
      }
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
