// Persistence: the save and the testing tuning, in localStorage. Loading fills
// in whatever a newer build added and drops whatever it can't make sense of,
// so an old or hand-edited save still starts.

import { newState, newStats, areaIndexFor } from './rules.js';
import { CAST, MAX_LEVEL, SQUAD_SIZE, RACK_SIZE, GRID, START, TUNING_DEFAULTS } from './config.js';

export const SAVE_KEY = 'funland2.haul.v1';
const TUNING_KEY = 'funland2.haul.tuning.v1';

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

const int = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);

/** Bring a parsed save up to the current shape. Anything that isn't a save becomes a fresh one. */
export function migrate(saved, now = Date.now()) {
  const fresh = newState(now, saved && Number.isFinite(saved.seed) ? saved.seed : undefined);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !saved.cast || typeof saved.cast !== 'object') return fresh;
  const s = fresh;
  // People: only ones the cast knows, with sane numbers.
  s.cast = {};
  for (const [id, m] of Object.entries(saved.cast)) {
    if (!CAST[id] || !m || typeof m !== 'object') continue;
    s.cast[id] = { level: int(m.level, 1, MAX_LEVEL, 1), tokens: int(m.tokens, 0, 1e6, 0), runs: int(m.runs, 0, 1e9, 0), stood: int(m.stood, 0, 1e9, 0) };
  }
  for (const id of START.squad) if (!s.cast[id]) s.cast[id] = { level: 1, tokens: 0, runs: 0, stood: 0 };
  // The squad: three different people who are in the camp.
  const squad = [];
  for (const id of Array.isArray(saved.squad) ? saved.squad : []) if (s.cast[id] && !squad.includes(id) && squad.length < SQUAD_SIZE) squad.push(id);
  for (const id of [...START.squad, ...Object.keys(s.cast)]) if (squad.length < SQUAD_SIZE && !squad.includes(id)) squad.push(id);
  s.squad = squad;
  s.supplies = int(saved.supplies, 0, 1e12, 0);
  s.stars = int(saved.stars, 0, 1e9, 0);
  s.runs = int(saved.runs, 0, 1e9, 0);
  s.radios = int(saved.radios, 0, 1e9, 0);
  s.calls = int(saved.calls, 0, 1e9, 0);
  s.fresh = int(saved.fresh, 0, 99, 0);
  s.legendWait = int(saved.legendWait, 0, 1e6, 0);
  s.gifts = int(saved.gifts, 0, 1e9, 0);
  s.areaSeen = int(saved.areaSeen, 0, areaIndexFor(s.stars), 0);
  s.ferry = saved.ferry === true;
  s.welcomed = saved.welcomed === true;
  s.born = Number.isFinite(saved.born) ? saved.born : now;
  s.lastNow = Number.isFinite(saved.lastNow) ? saved.lastNow : now;
  s.clockOffset = Number.isFinite(saved.clockOffset) ? saved.clockOffset : 0;
  s.rack = (Array.isArray(saved.rack) ? saved.rack : [])
    .filter((r) => r && Number.isFinite(r.readyAt) && Number.isFinite(r.dur) && r.dur > 0)
    .slice(0, RACK_SIZE)
    .map((r) => ({ n: int(r.n, 0, 1e9, 0), dur: r.dur, readyAt: r.readyAt }));
  s.gift = saved.gift && Number.isFinite(saved.gift.amount) && typeof saved.gift.line === 'string' ? { amount: int(saved.gift.amount, 1, 1e9, 1), line: saved.gift.line.slice(0, 60) } : null;
  s.haul = migrateHaul(saved.haul, s);
  s.stats = fill(saved.stats, newStats());
  return s;
}

function migrateHaul(h, s) {
  if (!h || typeof h !== 'object' || !Array.isArray(h.crates) || h.crates.length !== GRID || !Array.isArray(h.picked)) return null;
  const ok = h.crates.every(
    (c) => c && ((c.kind === 'supplies' && c.amount > 0) || (c.kind === 'tokens' && s.cast[c.who] && c.amount > 0) || c.kind === 'radio') && ['wood', 'steel', 'gold'].includes(c.tier),
  );
  if (!ok) return null;
  const picked = h.picked.filter((i, k, a) => Number.isInteger(i) && i >= 0 && i < GRID && a.indexOf(i) === k);
  const picks = int(h.picks, 1, SQUAD_SIZE, 1);
  if (picked.length > picks) return null;
  return {
    run: int(h.run, 0, 1e9, 0),
    area: int(h.area, 0, areaIndexFor(s.stars), 0),
    picks,
    picked,
    crates: h.crates,
    eyes: Number.isInteger(h.eyes) && h.eyes >= 0 && h.eyes < GRID ? h.eyes : null,
    script: Array.isArray(h.script) ? h.script.filter((i) => Number.isInteger(i) && i >= 0 && i < GRID) : null,
  };
}

/** Copy numbers (and nested number objects/arrays) from `from` onto the shape of `template`. */
function fill(from, template) {
  if (!from || typeof from !== 'object') return template;
  for (const k of Object.keys(template)) {
    const tv = template[k];
    const fv = from[k];
    if (typeof tv === 'number') {
      if (Number.isFinite(fv)) template[k] = fv;
    } else if (Array.isArray(tv)) {
      if (Array.isArray(fv)) for (let i = 0; i < tv.length; i++) if (Number.isFinite(fv[i])) tv[i] = fv[i];
    } else if (tv && typeof tv === 'object') fill(fv, tv);
  }
  return template;
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

export function clearTuning() {
  try {
    localStorage.removeItem(TUNING_KEY);
  } catch {
    // ignore
  }
}
