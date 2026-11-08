// Last Stop: the town rules on top of Thrill Hill's (meta.js). No DOM; the
// clock is injected and every roll comes from a named stream, like meta.js.
//
//   lots:     tap a lot next to your land, pay coins, it's yours (zone sets the cap)
//   objects:  anything goes anywhere on your land if it doesn't overlap; moving is free
//   homes:    everyone who moves in gets a 2×2 home automatically (roof if no room)
//   junk:     cleared lots leave piles; tap one to pop it
//   wishes:   one survivor at a time wishes for a set by their home
//   landmarks: six ruined landmarks; restored, each gives one bonus forever
//
// Actions return { ok: true, ... } or { ok: false, reason } like meta.js.

import {
  MAP,
  LOT,
  LOTS_ACROSS,
  START_LOT,
  LOTS,
  LOT_KINDS,
  LOT_PRICES,
  LOT_PRICE_AFTER,
  LAND_CAP,
  LAND_MAX,
  LOT_GLOW,
  CACHE,
  LANDMARK_GEMS,
  MYSTERY,
  MYSTERY_GRADE_GEMS,
  LANDMARKS,
  START_LAYOUT,
  HOME_SIZE,
  HOME_TIERS,
  HOME_SCORE,
  SETS,
  SET_ORDER,
  DECOR,
  KEEPSAKES,
  KEEPSAKE_SMALL,
  KEEPSAKE_LEGEND,
  SOUVENIR_SIZE,
  STATUE_DAY,
  PATHS,
  JUNK,
  WISH,
  TOWN_PARTS,
  TOWN_COLORS,
  BUILDINGS,
  CHESTS,
  GRADES,
  KNOCKS,
  ZONES,
  STRAY,
  VISITORS,
  FOUND_ARRIVE,
  ARRIVE_BADGES,
  MAX_LEVEL,
  GIFT,
  VIBES,
  RARITY_ORDER,
  MILESTONES,
  CLASSES,
  STAGES,
} from './config.js';
import { Meta, newState, newStats, milestoneAt } from './meta.js';
import { rarityOdds } from './chests.js';
import { rngFor, randInt, pick, pickWeighted, clamp } from './util.js';

const DAY = 24 * 60 * 60 * 1000;
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const rank = (r) => RARITY_ORDER.indexOf(r);

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
/** Rings out from the start: 0 the start, 1 its neighbours' ring, 2 the outer ring. */
export const ringOf = (a, b) => Math.max(Math.abs(a - START_LOT[0]), Math.abs(b - START_LOT[1]));

/**
 * Tiles between two footprints (0 when they touch or overlap): the larger of
 * the gaps along i and along j.
 */
export function gapBetween(f, g) {
  const di = Math.max(0, g.i - (f.i + f.w), f.i - (g.i + g.w));
  const dj = Math.max(0, g.j - (f.j + f.h), f.j - (g.j + g.h));
  return Math.max(di, dj);
}

export const overlapsFoot = (f, g) => f.i < g.i + g.w && g.i < f.i + f.w && f.j < g.j + g.h && g.j < f.j + f.h;

const foot = (o) => ({ i: o.i, j: o.j, w: o.size, h: o.size });

/** The home tier index (into HOME_TIERS) for a level. */
export function tierOf(level) {
  let t = 0;
  HOME_TIERS.forEach((h, k) => {
    if (level >= h.from) t = k;
  });
  return t;
}

/** Look stage of a building level: 1 Patched, 2 Fixed up, 3 Proud. */
export const stageOf = (level) => STAGES[clamp(level, 1, STAGES.length - 1)];

/** Fence tier (index into FENCE_TIERS) from the Gas Station's level. */
export const fenceTierOf = (bigtopLevel) => (bigtopLevel >= 7 ? 3 : bigtopLevel >= 5 ? 2 : bigtopLevel >= 3 ? 1 : 0);

/** The set a decoration or keepsake belongs to (keepsakes belong to none). */
export const setOf = (o) => (o.kind === 'decor' && DECOR[o.ref] ? DECOR[o.ref].set : null);

const PATH_CODE = { dirt: 'd', planks: 'p', brick: 'b' };
const CODE_PATH = { d: 'dirt', p: 'planks', b: 'brick' };

/** Price of the n-th lot you own (n = 2 is the first clear). */
export function lotPriceFor(n) {
  if (n < LOT_PRICES.length) return LOT_PRICES[n];
  return LOT_PRICES[LOT_PRICES.length - 1] + LOT_PRICE_AFTER * (n - LOT_PRICES.length + 1);
}

/** Three town-name suggestions from a stream. */
export function townNames(rng) {
  const out = new Set();
  for (let k = 0; out.size < 3 && k < 30; k++) out.add(`${pick(rng, TOWN_PARTS.a)} ${pick(rng, TOWN_PARTS.b)}`);
  return [...out];
}

// --- State -------------------------------------------------------------------------------------

export function newTownStats() {
  return { lots: 0, junk: 0, trunks: 0, wishes: 0, decorBought: 0, decorFound: 0, landmarks: 0, moves: 0, visitors: 0, lotGrades: [0, 0, 0, 0], landCoins: 0 };
}

/** A fresh town: Thrill Hill's start, plus the Last Stop lot laid out. */
export function newTownState(now, seed) {
  const s = newState(now, seed);
  s.v = 1;
  s.town = { name: 'Last Stop', color: TOWN_COLORS[0], named: false };
  s.lots = { [lotKey(...START_LOT)]: { day: 1, at: now, by: [], name: 'Last Stop', mvp: null } };
  s.objects = [];
  s.nextObj = 1;
  s.paths = '.'.repeat(MAP * MAP);
  s.junk = [];
  s.nextJunk = 1;
  s.box = [];
  s.kits = [];
  s.wish = null;
  s.wishNextAt = now + WISH.after;
  s.lastWisher = null;
  s.mvp = {};
  s.restored = {};
  s.visitor = null;
  s.visitorDay = 0;
  s.junkPopped = 0;
  s.lastTrunk = 0;
  s.shownTier = {};
  s.town.stats = newTownStats();
  const [a0, b0] = START_LOT;
  const I = a0 * LOT;
  const J = b0 * LOT;
  for (const b of START_LAYOUT.buildings) s.objects.push({ id: s.nextObj++, kind: 'building', ref: b.id, i: I + b.u, j: J + b.v, size: BUILDINGS[b.id].size });
  s.people.forEach((p, k) => {
    const h = START_LAYOUT.homes[k];
    if (h) s.objects.push({ id: s.nextObj++, kind: 'home', ref: p.id, i: I + h.u, j: J + h.v, size: HOME_SIZE });
    s.shownTier[p.id] = tierOf(p.level);
    p.hearts = 0;
  });
  for (const d of START_LAYOUT.decor) s.objects.push({ id: s.nextObj++, kind: 'decor', ref: d.kind, i: I + d.u, j: J + d.v, size: DECOR[d.kind].size });
  const paths = s.paths.split('');
  for (const [u, v] of START_LAYOUT.paths) paths[(J + v) * MAP + (I + u)] = 'd';
  s.paths = paths.join('');
  return s;
}

// --- The rules -----------------------------------------------------------------------------------

export class Town extends Meta {
  constructor(state, opts) {
    super(state, opts);
    this._occ = null; // tile -> object id, rebuilt on change
  }

  get t() {
    return this.s.town.stats;
  }

  day(now = this.now()) {
    return Math.floor((now - this.s.created) / DAY) + 1;
  }

  // --- Landmark bonuses (hooks from meta.js) -----------------------------------------------------

  isRestored(id) {
    return !!this.s.restored[id];
  }

  glowExtra() {
    return this.tuning.glow + (this.isRestored('wheel') ? LANDMARKS.wheel.glow : 0);
  }

  strayChance() {
    return STRAY.chance * (this.isRestored('radio') ? LANDMARKS.radio.strays : 1);
  }

  powerMult() {
    return 1 + (this.isRestored('fire') ? LANDMARKS.fire.power : 0);
  }

  coinBonus(lv = this.s.buildings.bigtop) {
    return super.coinBonus(lv) + (this.isRestored('drivein') ? LANDMARKS.drivein.coins : 0);
  }

  chestPeriod(kind) {
    const MIN = 60 * 1000;
    if (kind === 'crate' && this.isRestored('tower')) return LANDMARKS.tower.cratePeriod * MIN * this.tuning.chestTime;
    if (kind === 'vault' && this.isRestored('light')) return LANDMARKS.light.vaultPeriod * MIN * this.tuning.chestTime;
    return super.chestPeriod(kind);
  }

  buildingEffect(id, lv = this.s.buildings[id]) {
    const e = super.buildingEffect(id, lv);
    if (BUILDINGS[id].kind === 'coins') return { text: `+${Math.round(super.coinBonus(lv) * 100)}% raid coins`, value: super.coinBonus(lv) };
    return e;
  }

  // --- Lots ----------------------------------------------------------------------------------------

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

  /** Milestones claimed past the last gate (each lifts the land cap by one). */
  lateMilestones() {
    const last = ZONES[ZONES.length - 1].gate;
    let n = 0;
    for (let i = 0; i < this.s.milestones; i++) if (milestoneAt(i) > last) n++;
    return n;
  }

  landCap(zone = this.s.zone) {
    if (this._capOverride) return LAND_MAX;
    return Math.min(LAND_MAX, LAND_CAP[clamp(zone, 1, LAND_CAP.length) - 1] + (zone >= ZONES.length ? this.lateMilestones() : 0));
  }

  /** The zone whose cap would let you own one more lot (null at the max). */
  capZone() {
    const n = this.lotCount();
    for (let z = this.s.zone + 1; z <= LAND_CAP.length; z++) if (LAND_CAP[z - 1] > n) return z;
    return null;
  }

  /** At the last zone (below LAND_MAX): the Skulls at which the next lot opens, else null. */
  nextLandAt() {
    const n = this.lotCount();
    if (this.s.zone < ZONES.length || n >= LAND_MAX) return null;
    // Each late milestone lifts the cap by one.
    return milestoneAt(this.s.milestones + Math.max(0, n - this.landCap()));
  }

  nextLotPrice() {
    return lotPriceFor(this.lotCount() + 1);
  }

  isFrontier(a, b) {
    return insideLots(a, b) && !this.owns(a, b) && lotNeighbours(a, b).some(([x, y]) => this.owns(x, y));
  }

  /** Every lot next to your land, with its price and whether you can clear it now. */
  frontier() {
    const out = [];
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (let a = 0; a < LOTS_ACROSS; a++) if (this.isFrontier(a, b)) out.push({ a, b, key: lotKey(a, b), ...LOTS[lotKey(a, b)], price: this.nextLotPrice(), can: this.canClear(a, b) });
    return out;
  }

  canClear(a, b) {
    const key = lotKey(a, b);
    if (!LOTS[key]) return fail('No such lot');
    if (this.owns(a, b)) return fail('Already yours', { owned: true });
    if (!this.isFrontier(a, b)) return fail('Clear a lot next to it first', { far: true });
    if (this.lotCount() >= this.landCap()) {
      const z = this.capZone();
      const at = z ? null : this.nextLandAt();
      return fail(z ? `Reach Zone ${z} to own more land` : at ? `A new lot opens at ${at} Skulls` : 'Your town is as big as it gets', { capped: true, zone: z, at });
    }
    const price = this.nextLotPrice();
    if (this.s.coins < price) return fail(`Needs ${price - this.s.coins} more coins`, { short: 'coins', price });
    return { ok: true, price };
  }

  /** What the lot card shows. */
  lotInfo(a, b) {
    const key = lotKey(a, b);
    const L = LOTS[key];
    if (!L) return null;
    const rec = this.s.lots[key] || null;
    return {
      a,
      b,
      key,
      ...L,
      kindName: LOT_KINDS[L.kind] ? LOT_KINDS[L.kind].name : 'Home',
      prize: LOT_KINDS[L.kind] ? LOT_KINDS[L.kind].prize : '',
      landmark: L.landmark ? { id: L.landmark, ...LANDMARKS[L.landmark] } : null,
      owned: !!rec,
      record: rec,
      frontier: this.isFrontier(a, b),
      price: rec ? null : this.nextLotPrice(),
      can: rec ? null : this.canClear(a, b),
      ring: ringOf(a, b),
    };
  }

  /** The squad member with the most crowns since the last clear (ties: higher level, then newer). */
  mvp() {
    const sq = this.squadPeople();
    if (!sq.length) return null;
    return sq.slice().sort((x, y) => (this.s.mvp[y.id] || 0) - (this.s.mvp[x.id] || 0) || y.level - x.level || y.id - x.id)[0];
  }

  /**
   * Clear a lot: pay, name it after the MVP, roll the prize (three knocks),
   * crumble the ruin into junk (the squad pops the first pile), move roof
   * campers in. Everything is decided now; the UI plays it back.
   */
  clear(a, b) {
    const c = this.canClear(a, b);
    if (!c.ok) return c;
    const s = this.s;
    const key = lotKey(a, b);
    const L = LOTS[key];
    const rng = rngFor(s.seed, 'lot', key);
    const firstClear = this.t.lots === 0;
    s.coins -= c.price;
    this.t.landCoins += c.price;
    const mvp = this.mvp();
    const name = mvp ? `${mvp.first}'s ${L.name}` : L.name;
    s.lots[key] = { day: this.day(), at: this.now(), by: s.squad.slice(), name, mvp: mvp ? mvp.id : null, kind: L.kind };
    s.mvp = {};
    this.t.lots++;
    this._dirty();

    const out = { ok: true, a, b, key, kind: L.kind, price: c.price, name, mvp: mvp ? mvp.id : null, knocks: [], grade: 0, prize: null, newcomers: [], placed: [], junk: [], firstPile: null, campers: [], landmark: null, wish: null };

    // The prize knocks three times (landmarks don't knock: they're restored).
    if (L.kind !== 'L') {
      const p = clamp(LOT_GLOW + this.glowExtra(), 0, 1);
      let knocks = Array.from({ length: KNOCKS }, () => rng() < p);
      if (this.force.grade !== undefined) {
        const g = this.force.grade;
        knocks = Array.from({ length: KNOCKS }, (_, i) => i >= KNOCKS - g);
        delete this.force.grade;
      }
      out.knocks = knocks;
      let grade = knocks.filter(Boolean).length;
      if (L.kind === 'R' && ringOf(a, b) >= 2) grade = Math.min(3, grade + 1); // outer-ring rescues start at Silver
      out.grade = grade;
      this.t.lotGrades[grade]++;
    }
    out.prize = this._prize(rng, a, b, L, out.grade, out);

    // The ruin crumbles into junk; the squad pops the first pile for free.
    out.junk = this._spawnJunk(rng, a, b);
    if (out.junk.length) {
      const first = out.junk[0];
      out.firstPile = this.popJunk(first.id, { squad: true, hiding: firstClear && !out.newcomers.length });
      if (out.firstPile.newcomer) out.newcomers.push(out.firstPile.newcomer);
    } else if (firstClear && !out.newcomers.length) {
      const nc = this._admit(this._makeNewcomer(rng, { rarity: this._rollRarity(rng, 'vault', s.buildings.vault) }, 'rescue'));
      out.newcomers.push(nc);
    }

    out.campers = this._placeCampers();
    out.wish = this._checkWish();
    return out;
  }

  /** Roll and pay a lot's prize. */
  _prize(rng, a, b, L, grade, out) {
    const s = this.s;
    const G = GRADES[grade];
    if (L.kind === 'R') {
      let rarity = this._rollRarity(rng, 'vault', s.buildings.vault);
      const floor = grade >= 3 ? 'legend' : grade >= 1 ? 'hero' : 'veteran';
      if (rank(rarity) < rank(floor)) rarity = floor;
      if (this.force.rarity) {
        rarity = this.force.rarity;
        delete this.force.rarity;
      }
      const nc = this._admit(this._makeNewcomer(rng, { rarity }, 'rescue'));
      out.newcomers.push(nc);
      return { kind: 'rescue', id: nc.person.id, rarity };
    }
    if (L.kind === 'C') {
      const coins = Math.round(CACHE.coins(s.zone) * G.mult);
      const gems = Math.round(CACHE.gems * G.mult);
      s.coins += coins;
      s.gems += gems;
      s.stats.coinsEarned += coins;
      return { kind: 'cache', coins, gems };
    }
    if (L.kind === 'D') {
      const set = L.set;
      const sig = DECOR_BY_SET[set].signature;
      const commons = DECOR_BY_SET[set].commons.slice();
      const rare = DECOR_BY_SET[set].rare;
      const a1 = commons.splice(Math.floor(rng() * commons.length), 1)[0];
      const a2 = commons.length ? pick(rng, commons) : a1;
      const items = [sig, grade >= 1 ? rare : a1, grade >= 2 ? rare : a2];
      if (grade >= 3) items.push('gnome');
      out.placed = items.map((k) => this._giveDecor(k, a, b));
      return { kind: 'set', set, items };
    }
    if (L.kind === '?') {
      let roll = pickWeighted(rng, Object.fromEntries(MYSTERY.map((m) => [m.kind, m.w])));
      if (this.force.mystery) {
        roll = this.force.mystery;
        delete this.force.mystery;
      }
      const bonus = MYSTERY_GRADE_GEMS * grade;
      s.gems += bonus;
      if (roll === 'legend' || roll === 'goldenHero' || roll === 'sibling') {
        const spec = roll === 'legend' ? { rarity: 'legend' } : roll === 'goldenHero' ? { rarity: 'hero', golden: true } : { rarity: 'hero' };
        if (roll === 'sibling') this.force.sibling = true;
        const nc = this._admit(this._makeNewcomer(rng, spec, 'mystery'));
        delete this.force.sibling;
        out.newcomers.push(nc);
        return { kind: 'mystery', roll, id: nc.person.id, gems: bonus };
      }
      if (roll === 'giant') {
        const owned = new Set([...this.s.objects.filter((o) => o.kind === 'decor').map((o) => o.ref), ...this.s.box.filter((x) => x.kind === 'decor').map((x) => x.ref)]);
        const sigs = SET_ORDER.map((st) => DECOR_BY_SET[st].signature);
        const fresh = sigs.filter((k) => !owned.has(k));
        const k = pick(rng, fresh.length ? fresh : sigs);
        out.placed = [this._giveDecor(k, a, b)];
        return { kind: 'mystery', roll, decor: k, gems: bonus };
      }
      const gems = MYSTERY.find((m) => m.kind === 'gems').gems;
      s.gems += gems;
      return { kind: 'mystery', roll: 'gems', gems: gems + bonus };
    }
    if (L.kind === 'L') {
      const id = L.landmark;
      const i = a * LOT + 2;
      const j = b * LOT + 2;
      s.objects.push({ id: s.nextObj++, kind: 'landmark', ref: id, i, j, size: 3 });
      this._dirty();
      s.restored[id] = { day: this.day(), by: s.squad.slice() };
      s.gems += LANDMARK_GEMS;
      this.t.landmarks++;
      out.landmark = id;
      let hero = null;
      if (id === 'radio') {
        hero = this._admit(this._makeNewcomer(rng, { rarity: 'hero' }, 'radio'));
        out.newcomers.push(hero);
      }
      return { kind: 'landmark', id, gems: LANDMARK_GEMS, hero: hero ? hero.person.id : null };
    }
    return null;
  }

  /** A decoration that came with a lot: stand it on that lot if there's room, else the box. */
  _giveDecor(kind, a, b) {
    const size = DECOR[kind].size;
    const spot = this.freeSpot(size, { lot: [a, b], avoidPaths: true });
    this.t.decorFound++;
    if (spot) {
      const o = this._addObject('decor', kind, spot.i, spot.j, size);
      return { kind, id: o.id, i: o.i, j: o.j };
    }
    this.s.box.push({ kind: 'decor', ref: kind });
    return { kind, boxed: true };
  }

  // --- Objects and placement --------------------------------------------------------------------

  _dirty() {
    this._occ = null;
  }

  /** tile -> object id (0 = free). */
  occupancy() {
    if (this._occ) return this._occ;
    const occ = new Int32Array(MAP * MAP);
    for (const o of this.s.objects) {
      for (let i = o.i; i < o.i + o.size; i++) for (let j = o.j; j < o.j + o.size; j++) if (inMap(i, j)) occ[j * MAP + i] = o.id;
    }
    this._occ = occ;
    return occ;
  }

  objectAt(i, j) {
    if (!inMap(i, j)) return null;
    const id = this.occupancy()[j * MAP + i];
    return id ? this.object(id) : null;
  }

  object(id) {
    return this.s.objects.find((o) => o.id === id) || null;
  }

  homeOf(personId) {
    return this.s.objects.find((o) => o.kind === 'home' && o.ref === personId) || null;
  }

  station() {
    return this.s.objects.find((o) => o.kind === 'building' && o.ref === 'bigtop');
  }

  /** People with no home on the ground (they camp on the Gas Station roof). */
  campers() {
    return this.s.people.filter((p) => !this.homeOf(p.id));
  }

  /**
   * Can a footprint stand at (i, j)? It must be on your land and not overlap
   * anything (`ignore` = the object being moved). Paths never block; junk under
   * it pops. Returns { ok, junk: [ids] } or a failure.
   */
  canPlaceAt(i, j, size, ignore = null) {
    for (let x = i; x < i + size; x++)
      for (let y = j; y < j + size; y++) {
        if (!this.ownsTile(x, y)) return fail('Only on your land', { land: true });
        const id = this.occupancy()[y * MAP + x];
        if (id && id !== ignore) return fail('Something is in the way', { blocked: id });
      }
    const f = { i, j, w: size, h: size };
    const junk = this.s.junk.filter((k) => overlapsFoot(f, { i: k.i, j: k.j, w: 1, h: 1 })).map((k) => k.id);
    return { ok: true, junk };
  }

  _addObject(kind, ref, i, j, size, extra = {}) {
    const o = { id: this.s.nextObj++, kind, ref, i, j, size, ...extra };
    this.s.objects.push(o);
    this._dirty();
    return o;
  }

  /** After something lands: pop the junk under it and check the wish. */
  _landed(o) {
    const f = foot(o);
    const popped = this.s.junk.filter((k) => overlapsFoot(f, { i: k.i, j: k.j, w: 1, h: 1 })).map((k) => this.popJunk(k.id));
    return { popped, wish: this._checkWish() };
  }

  /** What a decoration costs and whether you can buy one. */
  canBuy(kind) {
    const d = DECOR[kind];
    if (!d) return fail('No such decoration');
    if (d.price == null) return fail('Found in junk and lots, not sold', { unsold: true });
    if ((d.zone || 1) > this.s.zone) return fail(`Opens in Zone ${d.zone}`, { locked: true, zone: d.zone });
    if (this.s.coins < d.price) return fail(`Needs ${d.price - this.s.coins} more coins`, { short: 'coins', price: d.price });
    return { ok: true, price: d.price };
  }

  /** Buy a decoration and put it at (i, j). */
  buy(kind, i, j) {
    const c = this.canBuy(kind);
    if (!c.ok) return c;
    const size = DECOR[kind].size;
    const at = this.canPlaceAt(i, j, size);
    if (!at.ok) return at;
    this.s.coins -= c.price;
    this.t.decorBought++;
    const o = this._addObject('decor', kind, i, j, size);
    return { ok: true, id: o.id, price: c.price, ...this._landed(o) };
  }

  /** The footprint size of a box entry or kit. */
  sizeOf(item) {
    if (item.kind === 'decor') return DECOR[item.ref].size;
    if (item.kind === 'keepsake') return KEEPSAKES[item.ref].size;
    if (item.kind === 'souvenir' || item.kind === 'statue') return SOUVENIR_SIZE;
    if (item.kind === 'building') return BUILDINGS[item.ref].size;
    if (item.kind === 'home') return HOME_SIZE;
    return 1;
  }

  /** Box counts by key ("decor:bench") for the drawer's "×2 in box". */
  boxCounts() {
    const m = {};
    for (const x of this.s.box) m[`${x.kind}:${x.ref}`] = (m[`${x.kind}:${x.ref}`] || 0) + 1;
    return m;
  }

  /** Put something from the box at (i, j). `index` into s.box. */
  unbox(index, i, j) {
    const item = this.s.box[index];
    if (!item) return fail('Not in the box');
    const size = this.sizeOf(item);
    const at = this.canPlaceAt(i, j, size);
    if (!at.ok) return at;
    this.s.box.splice(index, 1);
    const { kind, ref, ...extra } = item;
    const o = this._addObject(kind, ref, i, j, size, extra);
    return { ok: true, id: o.id, ...this._landed(o) };
  }

  /** The first box entry matching kind and ref (or -1). */
  boxIndex(kind, ref) {
    return this.s.box.findIndex((x) => x.kind === kind && x.ref === ref);
  }

  /** Place the first waiting kit (a zone-gate building, a souvenir or the statue) at (i, j). */
  placeKit(i, j, index = 0) {
    const kit = this.s.kits[index];
    if (!kit) return fail('No kit waiting');
    const size = this.sizeOf(kit);
    const at = this.canPlaceAt(i, j, size);
    if (!at.ok) return at;
    this.s.kits.splice(index, 1);
    const { kind, ref, ...extra } = kit;
    const o = this._addObject(kind, ref, i, j, size, extra);
    return { ok: true, id: o.id, ...this._landed(o) };
  }

  isMovable(o) {
    return !!o && ['building', 'home', 'decor', 'keepsake', 'souvenir', 'statue'].includes(o.kind);
  }

  isBoxable(o) {
    return !!o && ['decor', 'keepsake', 'souvenir', 'statue'].includes(o.kind);
  }

  /** Move something placed (free). Returns { ok, from, popped, wish }. */
  move(id, i, j) {
    const o = this.object(id);
    if (!this.isMovable(o)) return fail(o ? 'That stays put' : 'Nothing there');
    const at = this.canPlaceAt(i, j, o.size, o.id);
    if (!at.ok) return at;
    const from = { i: o.i, j: o.j };
    o.i = i;
    o.j = j;
    this._dirty();
    this.t.moves++;
    return { ok: true, id, from, ...this._landed(o) };
  }

  /** Put a placed decoration, keepsake, souvenir or the statue in the box. */
  toBox(id) {
    const o = this.object(id);
    if (!this.isBoxable(o)) return fail(o ? "That can't go in the box" : 'Nothing there');
    this.s.objects = this.s.objects.filter((x) => x !== o);
    this._dirty();
    const { id: _id, i: _i, j: _j, size: _size, ...item } = o;
    this.s.box.push(item);
    return { ok: true, item };
  }

  /** Put a camper's home (or move anyone's) at (i, j). */
  placeHome(personId, i, j) {
    const p = this.person(personId);
    if (!p) return fail('Not in town');
    const h = this.homeOf(personId);
    if (h) return this.move(h.id, i, j);
    const at = this.canPlaceAt(i, j, HOME_SIZE);
    if (!at.ok) return at;
    const o = this._addObject('home', personId, i, j, HOME_SIZE);
    const keepsake = this._unboxKeepsake(p, o);
    return { ok: true, id: o.id, keepsake, ...this._landed(o) };
  }

  /**
   * A free spot for a footprint: on your land, not overlapping anything (and
   * not on paths or junk if asked), nearest to `near` (tile) or the lot's
   * centre, or the station. Returns { i, j } or null.
   */
  freeSpot(size, { lot = null, near = null, avoidPaths = false, avoidJunk = true } = {}) {
    let best = null;
    const st = this.station();
    const c = near || (lot ? { i: lot[0] * LOT + 3, j: lot[1] * LOT + 3 } : st ? { i: st.i + 1, j: st.j + 1 } : { i: MAP / 2, j: MAP / 2 });
    const i0 = lot ? lot[0] * LOT : 0;
    const j0 = lot ? lot[1] * LOT : 0;
    const i1 = lot ? i0 + LOT : MAP;
    const j1 = lot ? j0 + LOT : MAP;
    for (let i = i0; i + size <= i1; i++)
      for (let j = j0; j + size <= j1; j++) {
        if (!this._free(i, j, size, { avoidPaths, avoidJunk })) continue;
        const d = Math.hypot(i + size / 2 - c.i, j + size / 2 - c.j);
        if (!best || d < best.d - 1e-9) best = { i, j, d };
      }
    return best ? { i: best.i, j: best.j } : null;
  }

  _free(i, j, size, { avoidPaths = false, avoidJunk = false, forecourt = null } = {}) {
    const occ = this.occupancy();
    for (let x = i; x < i + size; x++)
      for (let y = j; y < j + size; y++) {
        if (!this.ownsTile(x, y) || occ[y * MAP + x]) return false;
        if (avoidPaths && this.pathAt(x, y)) return false;
        if (avoidJunk && this.s.junk.some((k) => k.i === x && k.j === y)) return false;
        if (forecourt && forecourt.has(y * MAP + x)) return false;
      }
    return true;
  }

  /** The tiles just in front of the Gas Station (where the bus parks): homes never land there. */
  forecourt() {
    const st = this.station();
    const out = new Set();
    if (!st) return out;
    const n = st.size;
    for (let k = 0; k <= n; k++) {
      for (const [x, y] of [
        [st.i + n, st.j + k],
        [st.i + k, st.j + n],
      ])
        if (inMap(x, y)) out.add(y * MAP + x);
    }
    return out;
  }

  /**
   * The best free 2×2 spot for someone's home: +3 touching a path, +2 per home
   * within a tile, +4 next to a sibling, −0.2 per tile from the station, never
   * on the forecourt or a path. null if nothing fits.
   */
  homeSpot(p) {
    const st = this.station();
    const fc = this.forecourt();
    const homes = this.s.objects.filter((o) => o.kind === 'home' && o.ref !== p.id);
    const sibs = new Set(p.family != null ? this.s.people.filter((q) => q.family === p.family && q.id !== p.id).map((q) => q.id) : []);
    const n = HOME_SIZE;
    let best = null;
    for (const key of Object.keys(this.s.lots)) {
      const [a, b] = key.split(',').map(Number);
      for (let i = a * LOT; i + n <= a * LOT + LOT; i++)
        for (let j = b * LOT; j + n <= b * LOT + LOT; j++) {
          if (!this._free(i, j, n, { avoidPaths: true, avoidJunk: true, forecourt: fc })) continue;
          const f = { i, j, w: n, h: n };
          let score = 0;
          if (this._touchesPath(f)) score += HOME_SCORE.path;
          for (const h of homes) {
            if (gapBetween(f, foot(h)) <= 1) {
              score += HOME_SCORE.neighbour;
              if (sibs.has(h.ref)) score += HOME_SCORE.sibling;
            }
          }
          if (st) score += HOME_SCORE.perTile * Math.hypot(i + 1 - (st.i + st.size / 2), j + 1 - (st.j + st.size / 2));
          if (!best || score > best.score + 1e-9) best = { i, j, score };
        }
    }
    return best;
  }

  _touchesPath(f) {
    for (let x = f.i - 1; x <= f.i + f.w; x++)
      for (let y = f.j - 1; y <= f.j + f.h; y++) {
        const inside = x >= f.i && x < f.i + f.w && y >= f.j && y < f.j + f.h;
        const corner = (x === f.i - 1 || x === f.i + f.w) && (y === f.j - 1 || y === f.j + f.h);
        if (!inside && !corner && this.pathAt(x, y)) return true;
      }
    return false;
  }

  /** Give someone a home where it fits best (or the roof). */
  _settle(p) {
    const spot = this.homeSpot(p);
    if (!spot) return null;
    const o = this._addObject('home', p.id, spot.i, spot.j, HOME_SIZE);
    return o;
  }

  /** Roof campers move down where there's room now. */
  _placeCampers() {
    // Homes first, then keepsakes, so a keepsake never takes another camper's plot.
    const moved = [];
    for (const p of this.campers()) {
      const o = this._settle(p);
      if (!o) break;
      moved.push([p, o]);
    }
    return moved.map(([p, o]) => ({ id: p.id, home: o.id, i: o.i, j: o.j, keepsake: this._unboxKeepsake(p, o) }));
  }

  /**
   * A camper's keepsake waited in the box; put it by their new home if it
   * fits. (A camper never had a home, so this is the one boxed on arrival.)
   */
  _unboxKeepsake(p, home) {
    if (!p || !home) return null;
    const k = this.s.box.findIndex((x) => x.kind === 'keepsake' && x.owner === p.id);
    if (k < 0) return null;
    const { ref } = this.s.box[k];
    const size = KEEPSAKES[ref].size;
    const spot = this._keepsakeSpot(home, size);
    if (!spot) return null;
    this.s.box.splice(k, 1);
    const o = this._addObject('keepsake', ref, spot.i, spot.j, size, { owner: p.id });
    return { kind: ref, id: o.id, i: o.i, j: o.j };
  }

  /** People found in town arrive a little below chest newcomers (FOUND_ARRIVE). */
  _makeNewcomer(rng, spec, origin) {
    const p = super._makeNewcomer(rng, spec, origin);
    if (['rescue', 'trunk', 'mystery', 'radio'].includes(origin) && FOUND_ARRIVE) {
      p.level = clamp(p.level + FOUND_ARRIVE, 1, MAX_LEVEL);
      const need = this.need(p);
      p.badges = need === null ? 0 : Math.floor(need * ARRIVE_BADGES);
    }
    return p;
  }

  /** Everyone moves in: a home, and a keepsake for Heroes, Legends and goldens. */
  _admit(p) {
    this.s.people.push(p);
    p.hearts = p.hearts || 0;
    this.s.shownTier[p.id] = tierOf(p.level);
    const home = this._settle(p);
    let keepsake = null;
    if (p.rarity === 'hero' || p.rarity === 'legend' || p.golden) {
      const rng = rngFor(this.s.seed, 'keepsake', p.id);
      const kind = p.rarity === 'legend' ? pick(rng, KEEPSAKE_LEGEND) : pick(rng, KEEPSAKE_SMALL);
      const size = KEEPSAKES[kind].size;
      const spot = home ? this._keepsakeSpot(home, size) : null;
      if (spot) {
        const o = this._addObject('keepsake', kind, spot.i, spot.j, size, { owner: p.id });
        keepsake = { kind, id: o.id, i: o.i, j: o.j };
      } else {
        this.s.box.push({ kind: 'keepsake', ref: kind, owner: p.id });
        keepsake = { kind, boxed: true };
      }
    }
    return { person: p, placed: true, home: home ? { id: home.id, i: home.i, j: home.j } : null, camper: !home, keepsake };
  }

  _keepsakeSpot(home, size) {
    let best = null;
    const hf = foot(home);
    for (let i = home.i - 2; i <= home.i + home.size + 1; i++)
      for (let j = home.j - 2; j <= home.j + home.size + 1; j++) {
        if (!this._free(i, j, size, { avoidPaths: true, avoidJunk: true })) continue;
        const g = gapBetween(hf, { i, j, w: size, h: size });
        if (g > 1) continue;
        // In front of the home first (higher i + j), then nearest.
        const sc = g * 10 - (i + j - home.i - home.j) * 0.1;
        if (!best || sc < best.sc) best = { i, j, sc };
      }
    return best;
  }

  /** The home a person's level shows, and whether it changed since last shown. */
  levelUp(id) {
    const p = this.person(id);
    const before = p ? tierOf(p.level) : 0;
    const r = super.levelUp(id);
    if (!r.ok) return r;
    const after = tierOf(p.level);
    if (after !== before) r.home = { from: HOME_TIERS[before].id, to: HOME_TIERS[after].id, homeId: this.homeOf(id) ? this.homeOf(id).id : null };
    this.s.shownTier[p.id] = after;
    return r;
  }

  // --- Paths ------------------------------------------------------------------------------------------

  pathAt(i, j) {
    if (!inMap(i, j)) return null;
    return CODE_PATH[this.s.paths[j * MAP + i]] || null;
  }

  canPaint(type) {
    if (type == null) return { ok: true };
    const P = PATHS[type];
    if (!P) return fail('No such path');
    if (P.zone > this.s.zone) return fail(`Opens in Zone ${P.zone}`, { locked: true, zone: P.zone });
    return { ok: true };
  }

  /** Paint (or erase with null) one path tile on your land. Returns { ok, changed }. */
  paint(i, j, type) {
    const c = this.canPaint(type);
    if (!c.ok) return c;
    if (!this.ownsTile(i, j)) return fail('Only on your land', { land: true });
    const k = j * MAP + i;
    const code = type ? PATH_CODE[type] : '.';
    if (this.s.paths[k] === code) return { ok: true, changed: false };
    this.s.paths = this.s.paths.slice(0, k) + code + this.s.paths.slice(k + 1);
    return { ok: true, changed: true };
  }

  /** Walkable for walkers: on the map and not inside a footprint (landmarks and buildings included). */
  blocked(i, j) {
    return !inMap(i, j) || !!this.occupancy()[j * MAP + i];
  }

  // --- The fence ----------------------------------------------------------------------------------------

  fenceTier() {
    return fenceTierOf(this.s.buildings.bigtop);
  }

  /**
   * The border of your land as lot edges: [{ a, b, side }] where side is i0
   * (low-i edge), i1, j0 or j1, for every owned lot edge that faces a lot you
   * don't own.
   */
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

  // --- Junk ------------------------------------------------------------------------------------------------

  _spawnJunk(rng, a, b) {
    const out = [];
    const tiles = [];
    for (let i = a * LOT; i < a * LOT + LOT; i++) for (let j = b * LOT; j < b * LOT + LOT; j++) if (this._free(i, j, 1, { avoidJunk: true, avoidPaths: true })) tiles.push([i, j]);
    for (let k = 0; k < JUNK.perLot && tiles.length; k++) {
      const [i, j] = tiles.splice(Math.floor(rng() * tiles.length), 1)[0];
      const pile = { id: this.s.nextJunk++, i, j, v: randInt(rng, 0, 2) };
      this.s.junk.push(pile);
      out.push(pile);
    }
    return out;
  }

  /**
   * Pop a junk pile (free). Coins (70%), 2–4 gems (15%), a common decoration
   * (12%) or a rare one (3%); separately a 3% chance someone was hiding in it
   * (the first by the 12th pile, never more than 40 apart). `hiding` forces a
   * survivor (the first clear always brings someone).
   */
  popJunk(id, { squad = false, hiding = false } = {}) {
    const s = this.s;
    const k = s.junk.findIndex((x) => x.id === id);
    if (k < 0) return fail('No junk there');
    const pile = s.junk[k];
    s.junk.splice(k, 1);
    const n = ++s.junkPopped;
    this.t.junk++;
    const rng = rngFor(s.seed, 'junk', n);
    const out = { ok: true, id, i: pile.i, j: pile.j, squad, coins: 0, gems: 0, decor: null, newcomer: null };
    const scripted = !s.seen.noScript && !squad && !s.seen.scriptFlamingo; // the first pile you pop yourself
    let kind = pickWeighted(rng, Object.fromEntries(JUNK.table.map((r) => [r.kind, r.w])));
    if (scripted) kind = 'flamingo';
    if (this.force.junk) {
      kind = this.force.junk;
      delete this.force.junk;
    }
    if (kind === 'coins') {
      const coins = Math.max(1, Math.round(JUNK.coins(s.zone) * (1 + (rng() * 2 - 1) * JUNK.coinSpread)));
      s.coins += coins;
      s.stats.coinsEarned += coins;
      out.coins = coins;
    } else if (kind === 'gems') {
      const row = JUNK.table.find((r) => r.kind === 'gems');
      out.gems = randInt(rng, row.min, row.max);
      s.gems += out.gems;
    } else if (kind === 'common' || kind === 'rare' || kind === 'flamingo') {
      const pool = kind === 'flamingo' ? ['flamingo'] : kind === 'rare' ? RARE_DECOR : COMMON_DECOR.filter((d) => (DECOR[d].zone || 1) <= s.zone);
      out.decor = pick(rng, pool);
      out.rare = kind === 'rare';
      s.box.push({ kind: 'decor', ref: out.decor });
      this.t.decorFound++;
      if (kind === 'flamingo') {
        s.seen.scriptFlamingo = true;
        out.wish = this._scriptWish();
      }
    }
    // Someone's in the trunk!
    const since = n - s.lastTrunk;
    const due = (this.t.trunks === 0 && n >= JUNK.firstTrunk) || since >= JUNK.trunkMax;
    const trunkRoll = rng();
    if (hiding || this.force.trunk || due || trunkRoll < JUNK.trunk) {
      delete this.force.trunk;
      const rarity = hiding ? this._rollRarity(rng, 'vault', s.buildings.vault) : this._rollRarity(rng, 'crate', s.buildings.crate);
      out.newcomer = this._admit(this._makeNewcomer(rng, { rarity }, 'trunk'));
      out.trunk = !hiding;
      s.lastTrunk = n;
      if (!hiding) this.t.trunks++;
    }
    return out;
  }

  // --- Wishes ---------------------------------------------------------------------------------------------

  /** Sets with an item standing within range of a footprint. */
  setsNear(f) {
    const out = new Set();
    for (const o of this.s.objects) {
      const st = setOf(o);
      if (st && gapBetween(f, foot(o)) <= WISH.range) out.add(st);
    }
    return out;
  }

  /**
   * Is there room for a size × size piece within the wish range of a
   * footprint? (`ignore` = an object that may move out of the way.)
   */
  wishRoom(f, size = 1, ignore = null) {
    const R = WISH.range;
    for (let i = f.i - R - size; i <= f.i + f.w + R; i++)
      for (let j = f.j - R - size; j <= f.j + f.h + R; j++) {
        if (gapBetween(f, { i, j, w: size, h: size }) > R) continue;
        if (this.canPlaceAt(i, j, size, ignore).ok) return true;
      }
    return false;
  }

  /** The free spots within the wish range of a home for a size × size piece, nearest and frontmost first. */
  wishSpots(home, size = 1, ignore = null) {
    const R = WISH.range;
    const f = foot(home);
    const out = [];
    for (let i = f.i - R - size; i <= f.i + f.w + R; i++)
      for (let j = f.j - R - size; j <= f.j + f.h + R; j++) {
        const g = gapBetween(f, { i, j, w: size, h: size });
        if (g > R || !this.canPlaceAt(i, j, size, ignore).ok) continue;
        out.push({ i, j, g, score: g * 10 - (i + j - f.i - f.j) + (this.pathAt(i, j) ? 30 : 0) });
      }
    return out.sort((a, b) => a.score - b.score);
  }

  /** Is the open wish granted by the town as it stands? */
  wishMet(w = this.s.wish) {
    if (!w) return false;
    const h = this.homeOf(w.id);
    if (!h) return false;
    if (w.sib != null) {
      const g = this.homeOf(w.sib);
      return !!g && gapBetween(foot(h), foot(g)) <= WISH.range;
    }
    return this.setsNear(foot(h)).has(w.set);
  }

  /** Grant the open wish if it's met: Badges, a heart, a plaque. */
  _checkWish() {
    const s = this.s;
    const w = s.wish;
    if (!w || !this.wishMet(w)) return null;
    const p = this.person(w.id);
    s.wish = null;
    s.lastWisher = w.id;
    s.wishNextAt = this.now() + WISH.after;
    if (!p) return null;
    p.hearts = (p.hearts || 0) + 1;
    this.t.wishes++;
    const stack = this._giveBadges(p, WISH.badges(s.zone));
    return { id: p.id, set: w.set || null, sib: w.sib ?? null, badges: WISH.badges(s.zone), stack, hearts: p.hearts };
  }

  /** The scripted first wish: the Show-off founder wants something fun (Party). */
  _scriptWish() {
    const s = this.s;
    if (s.wish || s.seen.firstWish) return null;
    s.seen.firstWish = true;
    const who = s.people.find((p) => p.origin === 'founder' && p.vibe === 'showoff' && this.homeOf(p.id)) || s.people.find((p) => this.homeOf(p.id));
    if (!who) return null;
    const near = this.setsNear(foot(this.homeOf(who.id)));
    if (near.has('party')) return null;
    s.wish = { id: who.id, set: 'party', at: this.now(), first: true };
    return s.wish;
  }

  /** Maybe start a wish (one at a time; 20 min after the last, or forced on return). */
  maybeWish({ force = false } = {}) {
    const s = this.s;
    if (s.wish) return null;
    if (!force && this.now() < s.wishNextAt) return null;
    const rng = rngFor(s.seed, 'wish', this.t.wishes, s.lastWisher ?? 0, s.people.length);
    const w = {};
    const opts = {};
    for (const p of s.people) {
      if (p.id === s.lastWisher) continue;
      const h = this.homeOf(p.id);
      if (!h) continue;
      const near = this.setsNear(foot(h));
      // Only sets the home lacks and has room for (every set has a 1×1 Zone 1 piece).
      const sets = this.wishRoom(foot(h)) ? SET_ORDER.filter((st) => !near.has(st)) : [];
      let sib = null;
      if (p.family != null) {
        // Only when one home fits near the other.
        const far = s.people.filter((q) => {
          if (q.family !== p.family || q.id === p.id) return false;
          const g = this.homeOf(q.id);
          if (!g || gapBetween(foot(h), foot(g)) <= WISH.range) return false;
          return this.wishRoom(foot(g), HOME_SIZE, h.id) || this.wishRoom(foot(h), HOME_SIZE, g.id);
        });
        if (far.length) sib = far[0].id;
      }
      if (!sets.length && sib == null) continue;
      let weight = 1;
      if (this.inSquad(p.id)) weight *= WISH.squadWeight;
      if (p.rarity === 'hero' || p.rarity === 'legend') weight *= WISH.starWeight;
      w[p.id] = weight;
      opts[p.id] = { sets, sib, vibeSet: SET_ORDER.find((st) => SETS[st].vibe === p.vibe) };
    }
    const ids = Object.keys(w);
    if (!ids.length) {
      s.wishNextAt = this.now() + WISH.after;
      return null;
    }
    const id = Number(pickWeighted(rng, w));
    const o = opts[id];
    let wish;
    if (o.sib != null && (rng() < WISH.siblingChance || !o.sets.length)) wish = { id, sib: o.sib, at: this.now() };
    else wish = { id, set: o.sets.includes(o.vibeSet) && rng() < 0.6 ? o.vibeSet : pick(rng, o.sets), at: this.now() };
    s.wish = wish;
    // Already met (something stands there now)? Grant it straight away next check.
    return wish;
  }

  // --- Raids, milestones, zones ------------------------------------------------------------------------------

  raid() {
    const r = super.raid();
    if (!r.ok) return r;
    for (const id of r.squad) this.s.mvp[id] = (this.s.mvp[id] || 0) + r.crowns;
    return r;
  }

  milestoneReward(i) {
    const kind = MILESTONES.cycle[i % MILESTONES.cycle.length];
    if (kind !== 'decor') return super.milestoneReward(i);
    const at = milestoneAt(i);
    const m = super.milestoneReward(i);
    const pool = COMMON_DECOR.filter((d) => (DECOR[d].zone || 1) <= m.zone);
    const decor = pool[Math.floor(i / MILESTONES.cycle.length) % pool.length]; // every common in turn
    return { i, at, kind, zone: m.zone, decor };
  }

  _payMilestone(i) {
    const m = this.milestoneReward(i);
    if (m.kind !== 'decor') return super._payMilestone(i);
    this.s.box.push({ kind: 'decor', ref: m.decor });
    this.t.decorFound++;
    return m;
  }

  _zoneUp(rng) {
    const capBefore = this.landCap(this.s.zone);
    const r = super._zoneUp(rng);
    for (const id of r.unlocked) {
      if (!this.s.objects.some((o) => o.kind === 'building' && o.ref === id) && !this.s.kits.some((k) => k.kind === 'building' && k.ref === id)) this.s.kits.push({ kind: 'building', ref: id });
    }
    if (r.souvenir) this.s.kits.push({ kind: 'souvenir', ref: r.souvenir });
    r.lots = this.landCap(this.s.zone) - capBefore;
    r.landCap = this.landCap(this.s.zone);
    return r;
  }

  // --- Coming back ------------------------------------------------------------------------------------------------

  /** Only people with a home walk about, so only they can bring a gift. */
  _giftBearers() {
    return this.s.people.filter((p) => this.homeOf(p.id));
  }

  /** Boot and return: gifts (Thrill's), wishes, visitors at the fence, the Founders' Statue. */
  arrive() {
    const now = this.now();
    const away = now - this.s.lastSeen;
    const gift = super.arrive();
    const s = this.s;
    if (away >= WISH.awayAfter) this.maybeWish({ force: true });
    else this.maybeWish();
    if (away >= GIFT.away && !s.visitor) {
      const rng = rngFor(s.seed, 'visitor', s.stats.raids, Math.floor(now / 60000));
      const d = this.day(now);
      if (away >= VISITORS.golden.away && s.visitorDay !== d && rng() < VISITORS.golden.chance) {
        s.visitor = { kind: 'golden', taps: 0 };
        s.visitorDay = d;
      } else if (rng() < VISITORS.costume.chance) s.visitor = { kind: 'costume', taps: 0 };
    }
    this._statueCheck();
    return gift;
  }

  /** Call now and then while playing (wishes come on their own clock). */
  tick() {
    this._statueCheck();
    return this.maybeWish();
  }

  _statueCheck() {
    const s = this.s;
    if (this.day() >= STATUE_DAY && !s.seen.statue) {
      s.seen.statue = true;
      s.kits.push({ kind: 'statue', ref: 'founders' });
      return true;
    }
    return false;
  }

  /** BONK the visitor at the fence: a costume zombie pays at once; the golden one takes three taps. */
  bonkVisitor() {
    const s = this.s;
    const v = s.visitor;
    if (!v) return fail('Nobody at the fence');
    v.taps++;
    const rng = rngFor(s.seed, 'bonk', this.t.visitors, v.taps);
    if (v.kind === 'golden') {
      if (v.taps < VISITORS.golden.taps) return { ok: true, kind: 'golden', taps: v.taps, done: false };
      s.visitor = null;
      this.t.visitors++;
      s.gems += VISITORS.golden.gems;
      return { ok: true, kind: 'golden', taps: v.taps, done: true, gems: VISITORS.golden.gems };
    }
    s.visitor = null;
    this.t.visitors++;
    if (rng() < VISITORS.costume.decorChance) {
      const pool = COMMON_DECOR.filter((d) => (DECOR[d].zone || 1) <= s.zone);
      const decor = pick(rng, pool);
      s.box.push({ kind: 'decor', ref: decor });
      return { ok: true, kind: 'costume', done: true, decor };
    }
    const coins = VISITORS.costume.coins(s.zone);
    s.coins += coins;
    s.stats.coinsEarned += coins;
    return { ok: true, kind: 'costume', done: true, coins };
  }

  // --- The town's name ------------------------------------------------------------------------------------------

  nameIdeas() {
    return townNames(rngFor(this.s.seed, 'names', this.s.seen.nameRolls || 0));
  }

  rename(name, color) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 18);
    if (!n) return fail('Give it a name');
    this.s.town.name = n;
    if (color && TOWN_COLORS.includes(color)) this.s.town.color = color;
    this.s.town.named = true;
    return { ok: true, name: n, color: this.s.town.color };
  }

  // --- Advice -----------------------------------------------------------------------------------------------------

  /**
   * The single next step (one bouncing arrow): OPEN, a READY person you can
   * afford, a gift, a kit to place, BEST, the cheaper of the best upgrade and
   * the next lot, PLAY. Junk, wishes and decorations never get the arrow.
   */
  nextStep() {
    const s = this.s;
    if (s.raids === 0) return { kind: 'play' };
    const chest = this.readyChests()[0];
    if (chest) return { kind: 'chest', id: chest };
    const ready = [...this.squadPeople(), ...s.people.filter((p) => !this.inSquad(p.id))].find((p) => this.canLevel(p));
    if (ready) return { kind: 'ready', id: ready.id };
    if (s.gift && this.homeOf(s.gift.id)) return { kind: 'gift', id: s.gift.id };
    if (s.kits.length) return { kind: 'kit', item: s.kits[0] };
    if (this.bestGain().better) return { kind: 'best' };
    const order = [];
    for (const p of this.squadPeople()) order.push(CLASSES[p.cls].ride);
    order.push('crate', 'vault', 'bigtop', 'striker', 'gallery', 'tent', 'garage');
    const build = [...new Set(order)].find((id) => this.canUpgrade(id).ok);
    const lot = this.suggestLot();
    if (lot && (!build || lot.price <= this.upgradeCost(build))) return { kind: 'lot', a: lot.a, b: lot.b, key: lot.key, price: lot.price };
    if (build) return { kind: 'build', id: build };
    return { kind: 'play' };
  }

  /** The lot the arrow suggests: an affordable frontier lot, rescues first, then toward the nearest landmark. */
  suggestLot() {
    const open = this.frontier().filter((f) => f.can.ok);
    if (!open.length) return null;
    const land = Object.entries(LOTS).filter(([k, L]) => L.kind === 'L' && !this.s.lots[k]).map(([k]) => k.split(',').map(Number));
    const score = (f) => {
      if (f.kind === 'R') return -100;
      if (f.kind === 'L') return -50;
      const d = land.length ? Math.min(...land.map(([x, y]) => Math.abs(x - f.a) + Math.abs(y - f.b))) : 9;
      return d + (f.kind === '?' ? 0.5 : 0);
    };
    return open.slice().sort((x, y) => score(x) - score(y))[0];
  }

  // --- Testing cheats -------------------------------------------------------------------------------------------------

  cheat(name, arg) {
    const s = this.s;
    switch (name) {
      case 'clear': {
        const [a, b] = arg;
        const c0 = s.coins;
        s.coins += this.nextLotPrice();
        this._capOverride = true; // the drawer can clear past the land cap
        const r = this.clear(a, b);
        this._capOverride = false;
        if (!r.ok) s.coins = c0;
        return r;
      }
      case 'clearAll': {
        let n = 0;
        for (let k = 0; k < 30; k++) {
          const f = this.frontier()[0];
          if (!f) break;
          if (this.cheat('clear', [f.a, f.b]).ok) n++;
        }
        return { ok: true, n };
      }
      case 'wish':
        s.wish = null;
        s.wishNextAt = 0;
        return { ok: true, wish: this.maybeWish({ force: true }) };
      case 'trunk':
        this.force.trunk = true;
        return { ok: true };
      case 'people': {
        const out = [];
        const rng = rngFor(s.seed, 'cheatPeople', s.people.length);
        for (let k = 0; k < (arg || 5); k++) out.push(this._admit(this._makeNewcomer(rng, { rarity: this._rollRarity(rng, 'crate', 1) }, 'stray')));
        return { ok: true, n: out.length };
      }
      case 'visitor':
        s.visitor = { kind: arg || 'costume', taps: 0 };
        return { ok: true };
      case 'statue':
        s.seen.statue = false;
        s.created = Math.min(s.created, this.now() - STATUE_DAY * DAY);
        this._statueCheck();
        return { ok: true };
      default:
        return super.cheat(name, arg);
    }
  }
}

// --- Decoration lists ---------------------------------------------------------------------------------------------------

export const COMMON_DECOR = Object.keys(DECOR).filter((k) => DECOR[k].price != null);
export const RARE_DECOR = Object.keys(DECOR).filter((k) => DECOR[k].rare);
export const DECOR_BY_SET = Object.fromEntries(
  SET_ORDER.map((st) => {
    const ks = Object.keys(DECOR).filter((k) => DECOR[k].set === st);
    return [st, { commons: ks.filter((k) => DECOR[k].price != null), rare: ks.find((k) => DECOR[k].rare), signature: ks.find((k) => DECOR[k].signature) }];
  }),
);

export { newStats, VIBES, CHESTS };
