// Persistence: the camp save and the dev tuning, in localStorage. Loading
// fills in anything a newer build added, so old saves keep working.

import { newState } from './economy.js';
import { TUNING_DEFAULTS } from './config.js';

const SAVE_KEY = 'funland2.camp.save.v1';
const TUNING_KEY = 'funland2.camp.tuning.v1';

export function loadState(now) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrate(JSON.parse(raw), now);
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

/** Bring a parsed save up to the current shape. */
export function migrate(saved, now) {
  const fresh = newState(now);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fresh;
  return fillMissing(saved, fresh);
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
