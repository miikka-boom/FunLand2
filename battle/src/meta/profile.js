// The player's profile: everything that persists between sessions.
// Plain data, saved to localStorage as JSON. Pure functions (the storage is
// passed in) so the whole meta game is testable headless.

export const PROFILE_KEY = 'wobblewar.profile.v1';
export const UNIT_IDS = ['clubber', 'squire', 'archer', 'spiker', 'bomb', 'brick'];

export function newProfile() {
  return {
    v: 1,
    beans: 0, // Jellybeans: the one currency, earned by playing
    earned: 0, // lifetime Jellybeans
    stars: {}, // level index -> best stars (0..3)
    cleared: {}, // level index -> true once won
    owned: { hats: ['none'], colors: ['blue'] },
    equipped: { color: 'blue', hats: Object.fromEntries(UNIT_IDS.map((id) => [id, 'none'])) },
    trophies: {}, // id -> { claimed: true }
    stats: {
      battles: 0,
      wins: 0,
      knockdowns: 0,
      kills: 0,
      highFlights: 0,
      pincushions: 0,
      chains: 0,
      boings: 0,
      bricksDefeated: 0,
      flawless: 0,
      dailies: 0,
      hatsEquipped: 0,
      yeets: 0,
      booms: 0,
    },
    daily: { done: {} }, // date key -> stars
    tutorial: 0, // tutorial steps finished (0 = never played)
    settings: { sound: true, volume: 0.8, haptics: true, shake: true },
    supporter: false,
  };
}

/** Fill in anything missing (older saves, new fields) without losing progress. */
export function migrate(p) {
  const base = newProfile();
  if (!p || typeof p !== 'object') return base;
  const out = { ...base, ...p };
  for (const k of ['owned', 'equipped', 'stats', 'daily', 'settings']) out[k] = { ...base[k], ...(p[k] || {}) };
  out.equipped.hats = { ...base.equipped.hats, ...((p.equipped && p.equipped.hats) || {}) };
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  out.owned.hats = Array.from(new Set(['none', ...list(p.owned && p.owned.hats)]));
  out.owned.colors = Array.from(new Set(['blue', ...list(p.owned && p.owned.colors)]));
  for (const k of ['stars', 'cleared', 'trophies']) out[k] = { ...(p[k] || {}) };
  out.daily.done = { ...((p.daily && p.daily.done) || {}) };
  out.beans = Math.max(0, Math.floor(Number(p.beans) || 0));
  out.earned = Math.max(out.beans, Math.floor(Number(p.earned) || 0));
  out.v = 1;
  return out;
}

export function loadProfile(storage) {
  try {
    const raw = storage && storage.getItem(PROFILE_KEY);
    return migrate(raw ? JSON.parse(raw) : null);
  } catch {
    return newProfile();
  }
}

export function saveProfile(p, storage) {
  try {
    if (storage) storage.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false; // private mode / full: the game keeps working, it just won't remember
  }
}

export function addBeans(p, n) {
  const k = Math.max(0, Math.floor(n));
  p.beans += k;
  p.earned += k;
  return k;
}

/** Spend if affordable. Returns true on success. */
export function spendBeans(p, n) {
  if (!(n >= 0) || p.beans < n) return false;
  p.beans -= n;
  return true;
}

export function totalStars(p) {
  let s = 0;
  for (const v of Object.values(p.stars)) s += v;
  return s;
}
