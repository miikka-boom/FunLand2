// Last Stop: the rules. No DOM; the clock is injected and every roll comes from
// a named stream (rngFor(seed, ...)), so the same code runs in the browser, the
// tests and the balance tool.
//
//   play()        the picked survivor goes out for tonight's night
//   upgrade(id)   level someone up (their home grows with them)
//   buildHome()   a new home: someone new moves in
//   buy()         a decoration
//   clear()       the lot next door
//   move()        anything, anywhere on your land, free
//
// Actions return { ok: true, ... } or { ok: false, reason }.

import {
  MAX_LEVEL,
  CLASS_ORDER,
  RARITIES,
  POWER,
  LEVEL_COST,
  THREAT,
  ODDS,
  ODDS_LABELS,
  PAY,
  HOME_SIZE,
  HOME_TIERS,
  HOME_PRICES,
  HOME_PRICE_STEP,
  NEWCOMER_ODDS,
  FIRST_NEWCOMER,
  LEGEND_BY,
  STATION_STEP,
  STATION_MAX,
  STAGES,
  DECOR,
  LOT,
  LOTS_ACROSS,
  MAP,
  START_LOT,
  LOTS,
  LAND_PRICES,
  LAND_PRICE_STEP,
  SURPRISE,
  LANDMARKS,
  LANDMARK_AT,
  START,
  TUNING_DEFAULTS,
} from './config.js';
import { generatePerson, FIRST } from './people.js';
import { rngFor, pick, pickWeighted, clamp } from './util.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

// --- Geometry (pure) -------------------------------------------------------------------------

export const lotKey = (a, b) => `${a},${b}`;
export const lotOf = (i, j) => ({ a: Math.floor(i / LOT), b: Math.floor(j / LOT) });
export const inMap = (i, j) => i >= 0 && j >= 0 && i < MAP && j < MAP;
export const insideLots = (a, b) => a >= 0 && b >= 0 && a < LOTS_ACROSS && b < LOTS_ACROSS;
/** The 4 lots sharing an edge with (a, b). */
export const lotNeighbours = (a, b) =>
  [
    [a - 1, b],
    [a + 1, b],
    [a, b - 1],
    [a, b + 1],
  ].filter(([x, y]) => insideLots(x, y));

/** Tiles between two footprints (0 when they touch or overlap). */
export function gapBetween(f, g) {
  const di = Math.max(0, g.i - (f.i + f.w), f.i - (g.i + g.w));
  const dj = Math.max(0, g.j - (f.j + f.h), f.j - (g.j + g.h));
  return Math.max(di, dj);
}

/** The home tier index (into HOME_TIERS) for a level. */
export function tierOf(level) {
  let t = 0;
  HOME_TIERS.forEach((h, k) => {
    if (level >= h.from) t = k;
  });
  return t;
}

/** A home's heart plaque: one on the second level of a tier, so every level-up shows. */
export const heartsOf = (level) => (level - HOME_TIERS[tierOf(level)].from > 0 ? 1 : 0);

/** Power at a level: round((base + growth × (level − 1)) × stars). */
export function powerOf(p, level = p.level) {
  return Math.round((POWER.base + POWER.growth * (level - 1)) * RARITIES[p.rarity].mult);
}

/** Coins to go from `level` to the next (null at max). */
export const levelCost = (level) => (level >= MAX_LEVEL ? null : LEVEL_COST[level - 1]);

/** Night n's threat (before the tuning multiplier). */
export const threatOf = (n) => THREAT.base * Math.pow(Math.max(1, n), THREAT.curve);

/** Win chance for a power against a threat. */
export const chanceOf = (power, threat) => clamp(0.5 + ODDS.slope * (power / threat - 1), ODDS.min, ODDS.max);

export function oddsLabel(p) {
  return ODDS_LABELS.find((l) => p >= l.min) || ODDS_LABELS[ODDS_LABELS.length - 1];
}

/** The Gas Station's look level (1..7) on night n: one step per STATION_STEP nights won. */
export const stationLevelOf = (night) => Math.min(STATION_MAX, 1 + Math.floor((night - 1) / STATION_STEP));
/** Look stage (1 Patched, 2 Fixed up, 3 Proud) of a station level. */
export const stageOf = (level) => STAGES[clamp(level, 1, STAGES.length - 1)];
/** Fence tier (index into FENCE_TIERS) from the station level. */
export const fenceTierOf = (level) => (level >= 7 ? 3 : level >= 5 ? 2 : level >= 3 ? 1 : 0);

/** Price of the n-th home you build (n = 1 is the first). */
export function homePriceFor(n) {
  if (n <= HOME_PRICES.length) return HOME_PRICES[n - 1];
  return HOME_PRICES[HOME_PRICES.length - 1] + HOME_PRICE_STEP * (n - HOME_PRICES.length);
}

/** Price of the n-th extra lot (n = 1 is the first clear). */
export function landPriceFor(n) {
  if (n <= LAND_PRICES.length) return LAND_PRICES[n - 1];
  return LAND_PRICES[LAND_PRICES.length - 1] + LAND_PRICE_STEP * (n - LAND_PRICES.length);
}

// --- State ---------------------------------------------------------------------------------------

export function newStats() {
  return { coinsEarned: 0, spent: { levels: 0, homes: 0, decor: 0, land: 0 }, losses: 0, levelUps: 0, newcomers: { rookie: 0, veteran: 0, hero: 0, legend: 0 }, moves: 0 };
}

/** A fresh town: the Gas Station, one Rookie in a tent, a campfire, a bench and a planter. */
export function newTownState(now, seed = (Math.random() * 2 ** 32) >>> 0) {
  const s = {
    v: 1,
    seed: seed >>> 0,
    created: now,
    clockOffset: 0,
    coins: START.coins,
    night: 1,
    runs: 0,
    wins: 0,
    built: 0,
    nextId: 1,
    people: [],
    pick: null,
    lots: { [lotKey(...START_LOT)]: { night: 1 } },
    objects: [],
    nextObj: 1,
    seen: {},
    stats: newStats(),
  };
  const rng = rngFor(s.seed, 'founder');
  const f = START.survivor;
  const p = generatePerson(rng, { id: s.nextId++, cls: f.cls, rarity: f.rarity, vibe: f.vibe, perk: null, level: 1, origin: 'founder', at: now });
  if (p.look.hat === 'mascot') p.look.hat = 'cap'; // the first face you meet is a face
  s.people.push(p);
  s.pick = p.id;
  const I = START_LOT[0] * LOT;
  const J = START_LOT[1] * LOT;
  const add = (kind, ref, u, v, size) => s.objects.push({ id: s.nextObj++, kind, ref, i: I + u, j: J + v, size });
  add('station', 'bigtop', START.station.u, START.station.v, START.station.size);
  add('home', p.id, START.home.u, START.home.v, HOME_SIZE);
  for (const d of START.decor) add('decor', d.kind, d.u, d.v, DECOR[d.kind].size);
  return s;
}

// --- The rules -------------------------------------------------------------------------------------

export class Town {
  constructor(state, { clock = null, tuning = { ...TUNING_DEFAULTS } } = {}) {
    this.s = state;
    this.clock = clock;
    this.tuning = tuning;
    this.force = {}; // testing drawer: one-shot overrides ({ outcome, newcomer })
    this._occ = null;
  }

  now() {
    return this.clock ? this.clock.now() : Date.now();
  }

  // --- People ----------------------------------------------------------------------------------------

  person(id) {
    return this.s.people.find((p) => p.id === id) || null;
  }

  /** Who goes out tonight (always someone). */
  picked() {
    return this.person(this.s.pick) || this.s.people[0] || null;
  }

  setPick(id) {
    if (!this.person(id)) return fail('Not in town');
    this.s.pick = id;
    return { ok: true, id };
  }

  power(p, level = p.level) {
    return powerOf(p, level);
  }

  bestLevel() {
    return this.s.people.reduce((m, p) => Math.max(m, p.level), 1);
  }

  /** The strongest survivor (ties: the newest). */
  strongest() {
    return this.s.people.slice().sort((a, b) => this.power(b) - this.power(a) || b.id - a.id)[0] || null;
  }

  levelCost(p) {
    return levelCost(p.level);
  }

  canUpgrade(id) {
    const p = this.person(id);
    if (!p) return fail('Not in town');
    if (p.level >= MAX_LEVEL) return fail('Max level!', { max: true });
    const cost = levelCost(p.level);
    if (this.s.coins < cost) return fail(`Needs ${cost - this.s.coins} more coins`, { short: cost - this.s.coins, cost });
    return { ok: true, cost };
  }

  /** Level someone up. Returns the before/after so the UI can show the home grow. */
  upgrade(id) {
    const c = this.canUpgrade(id);
    if (!c.ok) return c;
    const p = this.person(id);
    const before = { level: p.level, power: this.power(p), tier: tierOf(p.level), chance: this.chance(p) };
    this.s.coins -= c.cost;
    this.s.stats.spent.levels += c.cost;
    this.s.stats.levelUps++;
    p.level++;
    const tier = tierOf(p.level);
    return { ok: true, id, cost: c.cost, from: before.level, to: p.level, powerBefore: before.power, powerAfter: this.power(p), tierFrom: before.tier, tierTo: tier, newTier: tier !== before.tier, chanceBefore: before.chance, chanceAfter: this.chance(p) };
  }

  // --- Nights ----------------------------------------------------------------------------------------

  threat(night = this.s.night) {
    return threatOf(night) * this.tuning.threat;
  }

  /** Someone's chance tonight (the very first night is a sure thing). */
  chance(p = this.picked(), night = this.s.night) {
    if (!p) return 0;
    if (this.s.runs === 0 && night === 1) return 1;
    return chanceOf(this.power(p), this.threat(night));
  }

  label(p = this.picked()) {
    return oddsLabel(this.chance(p));
  }

  /** Coins for a win (or a loss) on night n. */
  pay(win, night = this.s.night) {
    const full = (PAY.base + PAY.perNight * night) * this.tuning.coins;
    return Math.max(1, Math.round(win ? full : full * PAY.loss));
  }

  stationLevel(night = this.s.night) {
    return stationLevelOf(night);
  }

  fenceTier(night = this.s.night) {
    return fenceTierOf(this.stationLevel(night));
  }

  /**
   * Tonight's night: the picked survivor goes out. Win: coins and the next
   * night. Lose: a third of the coins, same night again. Everything is decided
   * here; the UI plays it back.
   */
  play() {
    const s = this.s;
    const p = this.picked();
    if (!p) return fail('Nobody to send out');
    const night = s.night;
    const chance = this.chance(p);
    const rng = rngFor(s.seed, 'night', s.runs);
    let win = rng() < chance;
    const forced = this.force.outcome || (this.tuning.outcome !== 'auto' ? this.tuning.outcome : null);
    if (forced === 'win') win = true;
    if (forced === 'lose') win = false;
    delete this.force.outcome;
    const coins = this.pay(win, night);
    const stationBefore = this.stationLevel();
    s.coins += coins;
    s.stats.coinsEarned += coins;
    s.runs++;
    p.raids = (p.raids || 0) + 1;
    if (win) {
      s.wins++;
      s.night++;
      p.wins = (p.wins || 0) + 1;
    } else s.stats.losses++;
    const stationAfter = this.stationLevel();
    // How many zombies they bonk on the way (the show only).
    const zeds = win ? 3 + Math.floor(rng() * 3) + Math.min(4, Math.floor(night / 8)) : 2 + Math.floor(rng() * 2);
    return {
      ok: true,
      win,
      night,
      next: s.night,
      coins,
      chance,
      power: this.power(p),
      threat: this.threat(night),
      id: p.id,
      zeds,
      station:
        stationAfter !== stationBefore
          ? { from: stationBefore, to: stationAfter, stage: stageOf(stationAfter), newStage: stageOf(stationAfter) !== stageOf(stationBefore), fence: fenceTierOf(stationAfter) !== fenceTierOf(stationBefore) }
          : null,
    };
  }

  // --- Objects and placement ---------------------------------------------------------------------------

  _dirty() {
    this._occ = null;
  }

  /** tile -> object id (0 = free). */
  occupancy() {
    if (this._occ) return this._occ;
    const occ = new Int32Array(MAP * MAP);
    for (const o of this.s.objects) for (let i = o.i; i < o.i + o.size; i++) for (let j = o.j; j < o.j + o.size; j++) if (inMap(i, j)) occ[j * MAP + i] = o.id;
    this._occ = occ;
    return occ;
  }

  object(id) {
    return this.s.objects.find((o) => o.id === id) || null;
  }

  objectAt(i, j) {
    if (!inMap(i, j)) return null;
    const id = this.occupancy()[j * MAP + i];
    return id ? this.object(id) : null;
  }

  homeOf(personId) {
    return this.s.objects.find((o) => o.kind === 'home' && o.ref === personId) || null;
  }

  station() {
    return this.s.objects.find((o) => o.kind === 'station') || null;
  }

  /** Can a size × size footprint stand at (i, j)? On your land, not overlapping anything but `ignore`. */
  canPlaceAt(i, j, size, ignore = null) {
    for (let x = i; x < i + size; x++)
      for (let y = j; y < j + size; y++) {
        if (!this.ownsTile(x, y)) return fail('Only on your land', { land: true });
        const id = this.occupancy()[y * MAP + x];
        if (id && id !== ignore) return fail('Something is in the way', { blocked: id });
      }
    return { ok: true };
  }

  /** The free spot for a footprint nearest to `near` (default: in front of the station). null if none. */
  freeSpot(size, near = null) {
    const st = this.station();
    const c = near || (st ? { i: st.i + st.size + 1, j: st.j + st.size + 1 } : { i: MAP / 2, j: MAP / 2 });
    let best = null;
    for (const key of Object.keys(this.s.lots)) {
      const [a, b] = key.split(',').map(Number);
      for (let i = a * LOT; i + size <= a * LOT + LOT; i++)
        for (let j = b * LOT; j + size <= b * LOT + LOT; j++) {
          if (!this.canPlaceAt(i, j, size).ok) continue;
          const d = Math.hypot(i + size / 2 - c.i, j + size / 2 - c.j);
          if (!best || d < best.d - 1e-9) best = { i, j, d };
        }
    }
    return best ? { i: best.i, j: best.j } : null;
  }

  hasRoom(size) {
    return !!this.freeSpot(size);
  }

  /** Move anything (free). */
  move(id, i, j) {
    const o = this.object(id);
    if (!o) return fail('Nothing there');
    const at = this.canPlaceAt(i, j, o.size, o.id);
    if (!at.ok) return at;
    const from = { i: o.i, j: o.j };
    o.i = i;
    o.j = j;
    this._dirty();
    this.s.stats.moves++;
    return { ok: true, id, from };
  }

  /** Walkers: blocked off the map and inside footprints. */
  blocked(i, j) {
    return !inMap(i, j) || !!this.occupancy()[j * MAP + i];
  }

  // --- Homes -------------------------------------------------------------------------------------------

  homePrice() {
    return homePriceFor(this.s.built + 1);
  }

  canBuildHome() {
    const price = this.homePrice();
    if (!this.hasRoom(HOME_SIZE)) return fail('No room: clear the lot next door', { room: false, price });
    if (this.s.coins < price) return fail(`Needs ${price - this.s.coins} more coins`, { short: price - this.s.coins, price });
    return { ok: true, price };
  }

  /** Who moves in next: stars (the first is always a Hero), class, level. */
  _newcomer(rng) {
    const s = this.s;
    let rarity = s.built === 0 ? FIRST_NEWCOMER : pickWeighted(rng, NEWCOMER_ODDS);
    if (s.built + 1 >= LEGEND_BY && !s.people.some((q) => q.rarity === 'legend')) rarity = 'legend';
    if (this.force.newcomer && RARITIES[this.force.newcomer]) rarity = this.force.newcomer;
    delete this.force.newcomer;
    const level = Math.max(1, this.bestLevel() - 1);
    const p = generatePerson(rng, { id: s.nextId++, cls: pick(rng, CLASS_ORDER), rarity, level, origin: 'home', at: this.now() });
    uniqueFirst(p, s.people, rng);
    return p;
  }

  /** Build a home at (i, j): pay, and someone new moves in. */
  buildHome(i, j) {
    const c = this.canBuildHome();
    if (!c.ok) return c;
    const at = this.canPlaceAt(i, j, HOME_SIZE);
    if (!at.ok) return at;
    const s = this.s;
    const rng = rngFor(s.seed, 'home', s.built);
    const p = this._newcomer(rng);
    s.coins -= c.price;
    s.stats.spent.homes += c.price;
    s.stats.newcomers[p.rarity]++;
    s.built++;
    s.people.push(p);
    const o = { id: s.nextObj++, kind: 'home', ref: p.id, i, j, size: HOME_SIZE };
    s.objects.push(o);
    this._dirty();
    const pk = this.picked();
    return { ok: true, price: c.price, id: o.id, person: p, stronger: !!pk && pk.id !== p.id && this.power(p) > this.power(pk) };
  }

  // --- Decorations -----------------------------------------------------------------------------------------

  canBuy(kind) {
    const d = DECOR[kind];
    if (!d) return fail('No such decoration');
    if (!this.hasRoom(d.size)) return fail('No room: clear the lot next door', { room: false, price: d.price });
    if (this.s.coins < d.price) return fail(`Needs ${d.price - this.s.coins} more coins`, { short: d.price - this.s.coins, price: d.price });
    return { ok: true, price: d.price };
  }

  buy(kind, i, j) {
    const c = this.canBuy(kind);
    if (!c.ok) return c;
    const d = DECOR[kind];
    const at = this.canPlaceAt(i, j, d.size);
    if (!at.ok) return at;
    this.s.coins -= c.price;
    this.s.stats.spent.decor += c.price;
    const o = { id: this.s.nextObj++, kind: 'decor', ref: kind, i, j, size: d.size };
    this.s.objects.push(o);
    this._dirty();
    return { ok: true, id: o.id, price: c.price };
  }

  // --- Land --------------------------------------------------------------------------------------------------

  owns(a, b) {
    return !!this.s.lots[lotKey(a, b)];
  }

  ownsTile(i, j) {
    if (!inMap(i, j)) return false;
    const { a, b } = lotOf(i, j);
    return this.owns(a, b);
  }

  lotCount() {
    return Object.keys(this.s.lots).length;
  }

  landPrice() {
    return landPriceFor(this.lotCount());
  }

  isFrontier(a, b) {
    return insideLots(a, b) && !this.owns(a, b) && lotNeighbours(a, b).some(([x, y]) => this.owns(x, y));
  }

  /** Every lot next to your land. */
  frontier() {
    const out = [];
    for (let b = 0; b < LOTS_ACROSS; b++) for (let a = 0; a < LOTS_ACROSS; a++) if (this.isFrontier(a, b)) out.push({ a, b, key: lotKey(a, b), ...LOTS[lotKey(a, b)] });
    return out;
  }

  canClear(a, b) {
    const L = LOTS[lotKey(a, b)];
    if (!L) return fail('No such lot');
    if (this.owns(a, b)) return fail('Already yours', { owned: true });
    if (!this.isFrontier(a, b)) return fail('Clear a lot next to it first', { far: true });
    const price = this.landPrice();
    if (this.s.coins < price) return fail(`Needs ${price - this.s.coins} more coins`, { short: price - this.s.coins, price });
    return { ok: true, price };
  }

  /** Clear a lot: pay, it's yours. A landmark is restored; a surprise lot pays out. */
  clear(a, b) {
    const c = this.canClear(a, b);
    if (!c.ok) return c;
    const s = this.s;
    const key = lotKey(a, b);
    const L = LOTS[key];
    s.coins -= c.price;
    s.stats.spent.land += c.price;
    s.lots[key] = { night: s.night };
    this._dirty();
    const out = { ok: true, a, b, key, kind: L.kind, name: L.name, price: c.price, coins: 0, landmark: null };
    if (L.kind === '?') {
      const rng = rngFor(s.seed, 'lot', key);
      out.coins = Math.round(c.price * (SURPRISE.min + rng() * (SURPRISE.max - SURPRISE.min)));
      s.coins += out.coins;
      s.stats.coinsEarned += out.coins;
    }
    if (L.kind === 'L' && LANDMARKS[L.landmark]) {
      const o = { id: s.nextObj++, kind: 'landmark', ref: L.landmark, i: a * LOT + LANDMARK_AT[0], j: b * LOT + LANDMARK_AT[1], size: 3 };
      s.objects.push(o);
      this._dirty();
      out.landmark = L.landmark;
      out.id = o.id;
    }
    return out;
  }

  /** What a lot's card shows. */
  lotInfo(a, b) {
    const key = lotKey(a, b);
    const L = LOTS[key];
    if (!L) return null;
    const owned = this.owns(a, b);
    return { a, b, key, ...L, landmarkInfo: L.landmark ? LANDMARKS[L.landmark] : null, owned, frontier: this.isFrontier(a, b), price: owned ? null : this.landPrice(), can: owned ? null : this.canClear(a, b) };
  }

  /** The border of your land as lot edges: [{ a, b, side }] (i0 = the low-i edge, i1, j0, j1). */
  fenceEdges() {
    const out = [];
    for (const key of Object.keys(this.s.lots)) {
      const [a, b] = key.split(',').map(Number);
      if (!this.owns(a - 1, b)) out.push({ a, b, side: 'i0' });
      if (!this.owns(a + 1, b)) out.push({ a, b, side: 'i1' });
      if (!this.owns(a, b - 1)) out.push({ a, b, side: 'j0' });
      if (!this.owns(a, b + 1)) out.push({ a, b, side: 'j1' });
    }
    return out;
  }

  /** The frontier lot to point at: landmarks first, then the nearest. */
  suggestLot() {
    const f = this.frontier();
    if (!f.length) return null;
    const [a0, b0] = START_LOT;
    return f.sort((x, y) => (y.kind === 'L') - (x.kind === 'L') || Math.hypot(x.a - a0, x.b - b0) - Math.hypot(y.a - a0, y.b - b0) || x.b - y.b || x.a - y.a)[0];
  }

  // --- Testing cheats (the gear) ------------------------------------------------------------------------------

  cheat(kind, arg) {
    const s = this.s;
    if (kind === 'coins') s.coins += arg;
    else if (kind === 'night') {
      s.night += arg;
      s.wins += arg;
      s.runs += arg;
    } else if (kind === 'levels') for (const p of s.people) p.level = Math.min(MAX_LEVEL, p.level + arg);
    else if (kind === 'clear' || kind === 'clearAll') {
      const lots = kind === 'clear' ? [arg] : null;
      const out = [];
      for (let guard = 0; guard < 30; guard++) {
        const lot = lots ? lots.shift() : this.suggestLot();
        if (!lot) break;
        const [a, b] = Array.isArray(lot) ? lot : [lot.a, lot.b];
        if (!this.isFrontier(a, b)) break;
        s.coins += this.landPrice();
        const r = this.clear(a, b);
        if (r.ok) out.push(r);
        s.coins -= r.coins || 0; // a free clear pays no surprise
      }
      return { ok: true, cleared: out };
    } else if (kind === 'people') {
      const out = [];
      for (let k = 0; k < arg; k++) {
        const at = this.freeSpot(HOME_SIZE);
        if (!at) break;
        s.coins += this.homePrice();
        const r = this.buildHome(at.i, at.j);
        if (r.ok) out.push(r.person.id);
      }
      return { ok: true, people: out };
    }
    this._dirty();
    return { ok: true };
  }

  // --- Hints -------------------------------------------------------------------------------------------------

  /**
   * What the finger points at in the first nights: 'play', 'upgrade' (the
   * picked survivor's home), 'build' (a new home) or 'land' (a lot). null
   * once the player has done each a couple of times.
   */
  hint() {
    const s = this.s;
    if (s.runs >= 15 && s.built >= 2 && this.lotCount() >= 2) return null;
    if (s.runs === 0) return 'play';
    const p = this.picked();
    const home = this.canBuildHome();
    if (s.built === 0 && home.ok) return 'build';
    if (p && this.canUpgrade(p.id).ok && this.chance(p) < 0.8) return 'upgrade';
    if (home.ok && s.built < 2) return 'build';
    if (home.room === false || (this.lotCount() === 1 && s.runs >= 6)) {
      const lot = this.suggestLot();
      if (lot && this.canClear(lot.a, lot.b).ok) return 'land';
    }
    return 'play';
  }
}

/** Re-pick a first name nobody in town has yet (when possible). */
function uniqueFirst(p, people, rng) {
  const taken = new Set(people.map((q) => q.first));
  if (!taken.has(p.first)) return;
  const pool = FIRST[p.pronoun].filter((n) => !taken.has(n));
  if (pool.length) p.first = pick(rng, pool);
}
