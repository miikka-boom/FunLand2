// Persistence: the save and the dev tuning, in localStorage. Loading
// fills in anything a newer build added, so old saves keep working.

import { newState } from './meta.js';
import { TUNING_DEFAULTS } from './config.js';

const SAVE_KEY = 'funland2.evac.save.v1';
const TUNING_KEY = 'funland2.evac.tuning.v1';

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
 * Bring a parsed save up to the current shape. Missing fields are filled in
 * at the save's own camp time (real time + its warp offset), so a field a
 * newer build adds doesn't start out days in the past.
 */
export function migrate(saved, now) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return newState(now ?? Date.now());
  const offset = Number(saved.clockOffset) || 0;
  const fresh = newState(now ?? Date.now() + offset);
  const s = fillMissing(saved, fresh);
  // A newer build may have added stops to the road.
  if (!Array.isArray(s.stars)) s.stars = fresh.stars;
  while (s.stars.length < fresh.stars.length) s.stars.push(0);
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
      // Keep explicit nulls where the template allows them (e.g. `up: null`).
      if (!(cur === null && tv === null)) target[k] = structuredCloneSafe(tv);
    } else if (isObj(tv) && isObj(cur)) fillMissing(cur, tv);
  }
  return target;
}

function structuredCloneSafe(v) {
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
