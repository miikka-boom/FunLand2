// Persistence in localStorage. Loading fills in anything a newer build
// added, so old saves keep working. (The earlier, bigger Safehouse used a
// different key; its saves are simply ignored.)

import { newState } from './economy.js';

const SAVE_KEY = 'funland2.safehouse.v2';
const TUNING_KEY = 'funland2.safehouse.tuning.v2';
export const TUNING_DEFAULTS = Object.freeze({ outcome: 'auto', missionTime: true, volume: 0.7 });

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
  } catch {
    // ignore
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
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return newState(now ?? Date.now());
  return fillMissing(saved, newState(now ?? Date.now() + (Number(saved.clockOffset) || 0)));
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function fillMissing(target, template) {
  for (const k of Object.keys(template)) {
    const tv = template[k];
    const cur = target[k];
    if (cur === undefined) target[k] = clone(tv);
    else if (tv === null) continue; // nullable: keep whatever the save has
    else if (cur === null || typeof cur !== typeof tv || Array.isArray(cur) !== Array.isArray(tv)) target[k] = clone(tv);
    else if (isObj(tv)) fillMissing(cur, tv);
  }
  return target;
}

function clone(v) {
  return v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));
}

export function loadTuning() {
  const t = { ...TUNING_DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(TUNING_KEY) || '{}');
    for (const k of Object.keys(TUNING_DEFAULTS)) if (typeof saved[k] === typeof TUNING_DEFAULTS[k]) t[k] = saved[k];
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
