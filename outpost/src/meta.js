// Last Stop: the Thrill Hill rules (chests, Badges, squad, raids), with hooks
// that town.js extends (landmark bonuses, homes, lots). Thrill Hill: state + rules. No DOM; the clock is injected and every random
// roll comes from a named stream (rngFor(seed, ...)), so the same code runs in
// the browser, the tests and the balance tool, and a chest always holds the
// same thing for the same save.
//
// Two loops feed each other:
//   chests: two static chests (Crate 2 h, Vault 8 h) -> newcomers (everyone
//           moves in) + Badges for the squad -> Badges fill personal bars ->
//           READY -> level up (coins)
//   raids:  pick three -> simulated three-wave raid -> 0-3 crowns -> coins and
//           Skulls -> zones open rides, threats and gate gifts; coins pay for
//           level-ups and buildings
// Actions return { ok: true, ... } or { ok: false, reason }.

import {
  SQUAD_SIZE,
  MAX_LEVEL,
  CLASSES,
  CLASS_ORDER,
  THREATS,
  COUNTER,
  RARITIES,
  RARITY_ORDER,
  ARRIVE_BADGES,
  MAXED_BADGE_COINS,
  LEVEL_BADGES,
  LEVEL_COINS,
  PERKS,
  SIBLINGS,
  GOLDEN_CHANCE,
  BUILDINGS,
  MAX_BUILDING,
  BUILD_COST,
  BIGTOP_COINS,
  CHESTS,
  CHEST_ORDER,
  GRADES,
  KNOCKS,
  PITY,
  FIRST_PITY,
  FIRST_GOLDEN,
  FIRST_SIBLING,
  THREAT_STREAK,
  BEST_MARGIN,
  ZONES,
  GATE_GEMS,
  WAVES,
  CLUTCH,
  CROWN_REWARD,
  RALLY,
  STRAY,
  GOLDEN_ZOMBIE,
  GEM_NOSE_GEMS,
  MILESTONES,
  GIFT,
  START,
  TUNING_DEFAULTS,
} from './config.js';
import { generatePerson, displayName, FIRST } from './people.js';
import { basePower, perkValue, isCounter, squadPower, threatFor, crownOdds, oddsLabel, zoneOf, combos } from './raid.js';
import { rarityOdds, glowChance, gradeAtLeast, chestPeriod, nextReadyAt, openNowCost, effectiveNewcomer } from './chests.js';
import { rngFor, randInt, pick, pickWeighted, clamp } from './util.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const rank = (r) => RARITY_ORDER.indexOf(r);

export function newStats() {
  return {
    raids: 0,
    wins: 0,
    crowns: [0, 0, 0, 0],
    clutches: 0,
    rallies: 0,
    goldenZombies: 0,
    strays: 0,
    chests: { crate: 0, vault: 0 },
    grades: [0, 0, 0, 0],
    newcomers: { rookie: 0, veteran: 0, hero: 0, legend: 0 },
    goldens: 0,
    siblings: 0,
    levelUps: 0,
    upgrades: 0,
    gifts: 0,
    coinsEarned: 0,
    gemsSpent: 0,
  };
}

/** A fresh park: three founders (generated), both chests ready, Zone 1. */
export function newState(now, seed = (Math.random() * 2 ** 32) >>> 0) {
  const s = {
    v: 1,
    seed: seed >>> 0,
    created: now,
    clockOffset: 0,
    coins: START.coins,
    gems: START.gems,
    skulls: 0,
    best: 0,
    zone: 1,
    milestones: 0,
    nextId: 1,
    people: [],
    squad: [],
    buildings: { ...START.buildings },
    chests: { crate: { readyAt: now, opened: 0 }, vault: { readyAt: now, opened: 0 } },
    pity: 0,
    threats: [START.firstThreat],
    threatLeft: 1, // raids left with these threats (the first raid is its own)
    raids: 0,
    losses: 0,
    gift: null,
    giftRolls: 0,
    lastSeen: now,
    seen: {},
    stats: newStats(),
    log: [],
  };
  const rng = rngFor(s.seed, 'founders');
  for (const f of START.founders) {
    const p = generatePerson(rng, { id: s.nextId++, cls: f.cls, rarity: f.rarity, vibe: f.vibe, perk: f.perk, level: 1, origin: 'founder', at: now });
    if (p.look.hat === 'mascot') p.look.hat = 'cap'; // founders show their faces; mascots are a later surprise
    uniqueFirst(p, s.people, rng);
    s.people.push(p);
  }
  s.squad = s.people.map((p) => p.id);
  return s;
}

/** Re-pick a first name that nobody in the park has yet (when possible). */
function uniqueFirst(p, people, rng) {
  const taken = new Set(people.map((q) => q.first));
  if (!taken.has(p.first)) return;
  const pool = FIRST[p.pronoun].filter((n) => !taken.has(n));
  if (pool.length) p.first = pick(rng, pool);
}

/** Skull values of every milestone in order (between gates, never on one). */
export function milestoneAt(i) {
  let k = 0;
  for (let z = 0; z < ZONES.length - 1; z++) {
    for (let at = ZONES[z].gate + MILESTONES.step; at < ZONES[z + 1].gate; at += MILESTONES.step) {
      if (k === i) return at;
      k++;
    }
  }
  return ZONES[ZONES.length - 1].gate + MILESTONES.lateStep * (i - k + 1);
}

/** The zone a Skull count falls in (by gates). */
export function zoneAtSkulls(skulls) {
  let z = 1;
  for (const Z of ZONES) if (skulls >= Z.gate) z = Z.n;
  return z;
}

export class Meta {
  constructor(state, { clock, tuning = { ...TUNING_DEFAULTS } } = {}) {
    this.s = state;
    this.clock = clock;
    this.tuning = tuning;
    this.force = {}; // testing drawer: one-shot overrides
  }

  now() {
    return this.clock ? this.clock.now() : Date.now();
  }

  // --- People --------------------------------------------------------------------------------

  person(id) {
    return this.s.people.find((p) => p.id === id) || null;
  }

  isResident(id) {
    return this.s.people.some((p) => p.id === id);
  }

  squadPeople() {
    return this.s.squad.map((id) => this.s.people.find((p) => p.id === id)).filter(Boolean);
  }

  inSquad(id) {
    return this.s.squad.includes(id);
  }

  /** Badges needed for the next level (null at max). */
  need(p) {
    return p.level >= MAX_LEVEL ? null : LEVEL_BADGES[p.level - 1];
  }

  /** Coins for the next level (null at max). */
  levelCost(p) {
    return p.level >= MAX_LEVEL ? null : LEVEL_COINS[p.level - 1];
  }

  isReady(p) {
    const n = this.need(p);
    return n !== null && p.badges >= n;
  }

  /** How many levels the Badges alone would pay for ("READY ×2"). */
  readyLevels(p) {
    let k = 0;
    let b = p.badges;
    for (let L = p.level; L < MAX_LEVEL; L++) {
      const n = LEVEL_BADGES[L - 1];
      if (b < n) break;
      b -= n;
      k++;
    }
    return k;
  }

  canLevel(p) {
    return this.isReady(p) && this.s.coins >= this.levelCost(p);
  }

  power(p, level = p.level) {
    return basePower(p, this.s.buildings, level);
  }

  bestLevel() {
    return this.s.people.reduce((m, p) => Math.max(m, p.level), 1);
  }

  /** Newcomers arrive relative to this: the squad's average level, rounded down. */
  arrivalBase() {
    const sq = this.squadPeople();
    if (!sq.length) return this.bestLevel();
    return Math.floor(sq.reduce((a, p) => a + p.level, 0) / sq.length);
  }

  levelUp(id) {
    const p = this.s.people.find((q) => q.id === id);
    if (!p) return fail('Not in town');
    if (p.level >= MAX_LEVEL) return fail('Already at max level');
    const need = this.need(p);
    if (p.badges < need) return fail(`Needs ${need - p.badges} more Badges`);
    const cost = this.levelCost(p);
    if (this.s.coins < cost) return fail(`Needs ${cost - this.s.coins} more coins`, { short: 'coins' });
    const before = this.power(p);
    this.s.coins -= cost;
    p.badges -= need;
    p.level++;
    this.s.stats.levelUps++;
    return { ok: true, id, from: p.level - 1, to: p.level, cost, powerBefore: before, powerAfter: this.power(p), stillReady: this.isReady(p) };
  }

  /**
   * Give Badges to someone. At max level they turn into coins instead.
   * Returns the stack as the UI shows it: { id, n, before, after, need, ready, coins }.
   */
  _giveBadges(p, n) {
    const need = this.need(p);
    if (need === null) {
      const coins = n * MAXED_BADGE_COINS;
      this.s.coins += coins;
      return { id: p.id, n, before: p.badges, after: p.badges, need: null, ready: false, coins, maxed: true };
    }
    const before = p.badges;
    p.badges += n;
    return { id: p.id, n, before, after: p.badges, need, ready: p.badges >= need, coins: 0, maxed: false, readyLevels: this.readyLevels(p) };
  }

  // --- Squad ---------------------------------------------------------------------------------

  setSquad(ids) {
    const uniq = [...new Set(ids)].filter((id) => this.isResident(id));
    if (!uniq.length) return fail('Pick at least one survivor');
    if (uniq.length > SQUAD_SIZE) return fail(`A squad is ${SQUAD_SIZE}`);
    this.s.squad = uniq;
    return { ok: true, squad: uniq.slice() };
  }

  /** Add someone (if a slot is free) or drop them. */
  toggleSquad(id) {
    if (this.inSquad(id)) {
      if (this.s.squad.length <= 1) return fail('The squad needs someone');
      return this.setSquad(this.s.squad.filter((x) => x !== id));
    }
    if (this.s.squad.length >= SQUAD_SIZE) return fail('The squad is full. Tap someone in it to drop them.');
    return this.setSquad([...this.s.squad, id]);
  }

  /** Put `id` in slot `slot` (swapping out whoever is there). */
  putInSlot(id, slot) {
    if (!this.isResident(id)) return fail('Not in town');
    const sq = this.s.squad.slice();
    const at = sq.indexOf(id);
    if (at >= 0) {
      // Already in: swap places with whoever is in that slot.
      if (slot < sq.length) [sq[at], sq[slot]] = [sq[slot], sq[at]];
      return this.setSquad(sq);
    }
    if (slot >= sq.length) sq.push(id);
    else sq.splice(slot, 1, id);
    return this.setSquad(sq.slice(0, SQUAD_SIZE));
  }

  /** The strongest squad against these threats (ids, strongest first). */
  bestSquad(threats = this.s.threats) {
    const all = this.s.people;
    const k = Math.min(SQUAD_SIZE, all.length);
    // Only the strongest few can be in the best squad, plus anyone whose Cheer
    // or family bonus could lift a weaker trio: a small pool, so this stays
    // fast however big the park grows.
    const b = this.s.buildings;
    const mp = new Map(all.map((p) => [p.id, basePower(p, b) * (isCounter(p, threats) ? COUNTER : 1)]));
    const sorted = all.slice().sort((x, y) => mp.get(y.id) - mp.get(x.id));
    const top = sorted.slice(0, 9);
    const extra = sorted.filter((p) => !top.includes(p) && (p.perk === 'cheer' || (p.family != null && top.some((t) => t.family === p.family)))).slice(0, 6);
    const people = [...top, ...extra];
    let best = null;
    for (const c of combos(people, k)) {
      const sp = squadPower(c, threats, this.s.buildings);
      sp.S *= this.powerMult();
      if (!best || sp.S > best.S + 1e-9) best = { ids: c.map((p) => p.id), S: sp.S, sp };
    }
    if (!best) return { ids: [], S: 0 };
    const pw = new Map(best.sp.members.map((m) => [m.id, m.power]));
    best.ids.sort((a, b) => pw.get(b) - pw.get(a));
    return { ids: best.ids, S: best.S };
  }

  /** Does BEST beat the current squad? (BEST pulses when it does.) */
  bestGain() {
    const cur = this.raidPreview().S;
    const best = this.bestSquad();
    return { ids: best.ids, S: best.S, cur, better: best.S > cur * BEST_MARGIN + 0.01 };
  }

  useBest() {
    const b = this.bestSquad();
    if (!b.ids.length) return fail('Nobody to pick');
    return this.setSquad(b.ids);
  }

  // --- Buildings -----------------------------------------------------------------------------

  maxBuildingLevel() {
    return Math.min(MAX_BUILDING, this.s.zone + 1);
  }

  isUnlocked(id) {
    return (this.s.buildings[id] || 0) > 0;
  }

  upgradeCost(id) {
    const lv = this.s.buildings[id] || 0;
    if (lv <= 0 || lv >= MAX_BUILDING) return null;
    return BUILD_COST[lv - 1];
  }

  canUpgrade(id) {
    const lv = this.s.buildings[id] || 0;
    if (!BUILDINGS[id]) return fail('No such building');
    if (lv <= 0) return fail(`Opens in Zone ${BUILDINGS[id].zone}: ${zoneOf(BUILDINGS[id].zone).name}`, { locked: true });
    if (lv >= MAX_BUILDING) return fail('Max level', { max: true });
    if (lv >= this.maxBuildingLevel()) return fail(`Reach Zone ${this.s.zone + 1} to go past Lv ${lv}`, { capped: true });
    const cost = this.upgradeCost(id);
    if (this.s.coins < cost) return fail(`Needs ${cost - this.s.coins} more coins`, { cost, short: 'coins' });
    return { ok: true, cost };
  }

  upgrade(id) {
    const c = this.canUpgrade(id);
    if (!c.ok) return c;
    this.s.coins -= c.cost;
    this.s.buildings[id]++;
    this.s.stats.upgrades++;
    return { ok: true, id, level: this.s.buildings[id], cost: c.cost };
  }

  /** Hooks a variation can change (Last Stop's landmarks do). */
  glowExtra() {
    return this.tuning.glow;
  }

  strayChance() {
    return STRAY.chance;
  }

  powerMult() {
    return 1;
  }

  /** Raids pay this much more (the Big Top). */
  coinBonus(lv = this.s.buildings.bigtop) {
    return BIGTOP_COINS * (Math.max(1, lv) - 1);
  }

  /** What the next level of a building adds, for its sheet. */
  buildingEffect(id, lv = this.s.buildings[id]) {
    const b = BUILDINGS[id];
    if (b.kind === 'coins') return { text: `+${Math.round(this.coinBonus(lv) * 100)}% raid coins`, value: this.coinBonus(lv) };
    if (b.kind === 'ride') return { text: `+${Math.round(10 * lv)}% ${CLASSES[b.cls].name} power`, value: 0.1 * lv };
    return { text: `Level ${lv}`, value: lv };
  }

  // --- Chests --------------------------------------------------------------------------------

  chestPeriod(kind) {
    return chestPeriod(kind, this.tuning.chestTime);
  }

  /**
   * { kind, ready, msLeft, readyAt, period, level, cost }. If the clock went
   * back (readyAt more than a period away), the timer is clamped to one
   * period from now (this writes the state) so it never grows.
   */
  chestState(kind) {
    const t = this.now();
    const ch = this.s.chests[kind];
    const period = this.chestPeriod(kind);
    if (ch.readyAt - t > period) ch.readyAt = t + period;
    const msLeft = Math.max(0, ch.readyAt - t);
    return { kind, ready: t >= ch.readyAt, msLeft, readyAt: ch.readyAt, period, level: this.s.buildings[kind], cost: openNowCost(kind, msLeft) };
  }

  readyChests() {
    return CHEST_ORDER.filter((k) => this.chestState(k).ready);
  }

  /** Everything the chest sheet shows: contents, every odds table, pity. */
  chestInfo(kind) {
    const c = CHESTS[kind];
    const lv = this.s.buildings[kind];
    const p = glowChance(lv, this.glowExtra());
    const atLeast = gradeAtLeast(p);
    const coins = c.coins(lv) * this.tuning.coins;
    const gemsLo = c.gems.min + (c.gems.perLevel || 0) * lv;
    const gemsHi = c.gems.max + (c.gems.perLevel || 0) * lv;
    const eff = effectiveNewcomer(kind, lv, this.glowExtra());
    return {
      kind,
      name: c.name,
      level: lv,
      period: this.chestPeriod(kind),
      coins: [Math.round(coins * (1 - c.coinSpread)), Math.round(coins * (1 + c.coinSpread))],
      badges: [Math.max(1, c.badges(lv) - c.badgeSpread), c.badges(lv) + c.badgeSpread],
      newcomer: eff.chance,
      second: c.second(lv),
      odds: eff.odds,
      baseOdds: rarityOdds(kind, lv),
      secondOdds: c.second(lv) ? rarityOdds('crate', lv) : null,
      gems: { chance: c.gems.chance, lo: gemsLo, hi: gemsHi },
      finisher: c.finisher ? c.finisher(lv) : 0,
      glow: p,
      grades: { silver: atLeast[1], gold: atLeast[2], rainbow: atLeast[3] },
      pityLeft: Math.max(1, (this.s.stats.newcomers.legend > 0 ? PITY : FIRST_PITY) - this.s.pity),
      next: lv < MAX_BUILDING ? { level: lv + 1, coins: c.coins(lv + 1), badges: c.badges(lv + 1), newcomer: effectiveNewcomer(kind, lv + 1, this.glowExtra()).chance, glow: glowChance(lv + 1, this.glowExtra()), odds: rarityOdds(kind, lv + 1) } : null,
    };
  }

  openNowCost(kind) {
    return this.chestState(kind).cost;
  }

  /** Spend gems so a chest is ready now (the UI then opens it). */
  openNow(kind) {
    const st = this.chestState(kind);
    if (st.ready) return { ok: true, cost: 0 };
    if (this.s.gems < st.cost) return fail(`Needs ${st.cost - this.s.gems} more gems`, { short: 'gems' });
    this.s.gems -= st.cost;
    this.s.stats.gemsSpent += st.cost;
    this.s.chests[kind].readyAt = this.now();
    // Bought time is not lateness: no grace on the next wait.
    this.s.chests[kind].bought = true;
    return { ok: true, cost: st.cost };
  }

  /** Newcomers lean toward the open classes you have fewest of. */
  _newcomerClass(rng) {
    const w = {};
    for (const c of CLASS_ORDER) {
      if (CLASSES[c].zone > this.s.zone) continue;
      w[c] = 1 / (1 + this.s.people.filter((p) => p.cls === c).length);
    }
    return pickWeighted(rng, w);
  }

  /**
   * Make a newcomer. spec: { rarity, cls?, perk?, golden? (true/false/undefined = roll),
   * sibling? (undefined = roll) }. Arrives relative to your best resident, with a
   * half-full Badge bar.
   */
  _makeNewcomer(rng, spec, origin) {
    const s = this.s;
    const rarity = spec.rarity;
    const cls = spec.cls || this._newcomerClass(rng);
    const level = clamp(this.arrivalBase() + RARITIES[rarity].arrive, 1, MAX_LEVEL);
    const met = RARITY_ORDER.reduce((a, r) => a + s.stats.newcomers[r], 0); // newcomers so far
    // First-time surprises arrive on time even when that newcomer is a gate gift or a stray.
    const dueGolden = !s.stats.goldens && met >= FIRST_GOLDEN - 1 && !spec.scripted;
    const dueSibling = !s.stats.siblings && met >= FIRST_SIBLING - 1 && !spec.scripted;
    let golden = spec.golden;
    if (golden === undefined) golden = this.force.golden ?? (rng() < GOLDEN_CHANCE || dueGolden);
    else if (!golden && dueGolden && origin === 'gate') golden = true;
    if (this.force.golden !== undefined && spec.golden === undefined) delete this.force.golden;
    let sibling = null;
    const sibRoll = rng();
    if ((spec.sibling !== false || dueSibling) && s.people.length >= SIBLINGS.minResidents) {
      const want = this.force.sibling ?? (sibRoll < SIBLINGS.chance || dueSibling);
      if (this.force.sibling !== undefined) delete this.force.sibling;
      if (want) sibling = pick(rng, s.people);
    }
    const p = generatePerson(rng, { id: s.nextId++, cls, rarity, level, perk: spec.perk, golden, sibling, origin, at: this.now() });
    uniqueFirst(p, s.people, rng);
    if (sibling && sibling.family == null) sibling.family = sibling.id;
    const need = this.need(p);
    p.badges = need === null ? 0 : Math.floor(need * ARRIVE_BADGES);
    s.stats.newcomers[rarity]++;
    if (golden) s.stats.goldens++;
    if (sibling) s.stats.siblings++;
    return p;
  }

  /** Everyone moves in. */
  _admit(p) {
    this.s.people.push(p);
    return { person: p, placed: true };
  }

  _rollRarity(rng, oddsKind, level) {
    return pickWeighted(rng, rarityOdds(oddsKind, level));
  }

  /**
   * Open a ready chest. Everything is paid now (the UI only shows it). The
   * Vault's finisher comes last, after the newcomers moved in.
   * Returns { ok, kind, level, knocks, grade, coins, gems, stacks, newcomers, finisher }
   */
  openChest(kind) {
    const s = this.s;
    const c = CHESTS[kind];
    if (!c) return fail('No such chest');
    const st = this.chestState(kind);
    if (!st.ready) return fail('Not ready yet');
    const lv = s.buildings[kind];
    const n = s.chests[kind].opened;
    const rng = rngFor(s.seed, 'chest', kind, n);
    const script = n === 0 && !s.seen.noScript ? START.script[kind] : null;

    // The three knocks (the grade is decided now; the UI only reveals it).
    const p = glowChance(lv, this.glowExtra());
    let knocks = Array.from({ length: KNOCKS }, () => rng() < p);
    if (script) knocks = script.knocks.slice();
    if (this.force.grade !== undefined) {
      const g = this.force.grade;
      knocks = Array.from({ length: KNOCKS }, (_, i) => i >= KNOCKS - g);
      delete this.force.grade;
    }
    const grade = knocks.filter(Boolean).length;
    const G = GRADES[grade];

    const spread = 1 + (rng() * 2 - 1) * c.coinSpread;
    const coins = Math.max(1, Math.round(c.coins(lv) * spread * G.mult * this.tuning.coins));
    let gems = 0;
    if (rng() < c.gems.chance) gems = randInt(rng, c.gems.min, c.gems.max) + (c.gems.perLevel || 0) * lv;
    gems = Math.round(gems * G.mult);
    s.coins += coins;
    s.gems += gems;
    s.stats.coinsEarned += coins;

    const stacks = this.squadPeople().map((q) => {
      const base = c.badges(lv) + randInt(rng, -c.badgeSpread, c.badgeSpread);
      return this._giveBadges(q, Math.max(1, Math.round(base * G.mult * this.tuning.badges)));
    });

    // Newcomers: [{ oddsKind, floor }]
    let specs = [];
    if (script) specs = script.newcomers.map((x) => ({ ...x, scripted: true }));
    else {
      if (rng() < c.newcomer(lv) || G.floor) specs.push({ oddsKind: kind });
      if (c.second(lv)) specs.push({ oddsKind: 'crate' });
    }
    const newcomers = [];
    specs.forEach((sp, i) => {
      let rarity = sp.rarity || this._rollRarity(rng, sp.oddsKind, lv);
      if (i === 0 && G.floor && rank(rarity) < rank(G.floor)) rarity = G.floor;
      const pityAt = s.stats.newcomers.legend > 0 ? PITY : FIRST_PITY;
      if (!sp.scripted && s.pity >= pityAt - 1) rarity = 'legend';
      if (this.force.rarity) {
        rarity = this.force.rarity;
        delete this.force.rarity;
      }
      s.pity = rarity === 'legend' ? 0 : s.pity + 1;
      const person = this._makeNewcomer(rng, { rarity, cls: sp.cls, perk: sp.perk, golden: sp.scripted ? false : undefined, sibling: sp.scripted ? false : undefined, scripted: sp.scripted }, kind);
      newcomers.push(this._admit(person));
    });

    const finisher = c.finisher ? this._applyFinisher(c.finisher(lv), c.finisherTopUp) : null;

    const period = this.chestPeriod(kind);
    const bought = s.chests[kind].bought;
    if (c.ramp && n < c.ramp.length) s.chests[kind].readyAt = this.now() + c.ramp[n] * this.tuning.chestTime; // quick first refills
    else s.chests[kind].readyAt = bought ? this.now() + period : nextReadyAt(period, st.readyAt, this.now());
    s.chests[kind].bought = false;
    // Testing overrides for "the next chest" are spent by this chest, newcomer or not.
    for (const k of ['grade', 'rarity', 'golden', 'sibling']) delete this.force[k];
    s.chests[kind].opened++;
    s.stats.chests[kind]++;
    s.stats.grades[grade]++;
    return { ok: true, kind, level: lv, knocks, grade, coins, gems, stacks, newcomers, finisher };
  }

  /**
   * The Vault finisher: Badges for whoever is fewest from their next level,
   * topped up to exactly what they need if that is FINISHER_TOPUP or less.
   */
  _applyFinisher(size, topUp) {
    const f = { n: size };
    // The squad (the people you play with); everyone only if the squad is maxed.
    const squadOpen = this.squadPeople().filter((p) => p.level < MAX_LEVEL);
    const pool = squadOpen.length ? squadOpen : this.s.people.filter((p) => p.level < MAX_LEVEL);
    if (!pool.length) {
      const coins = f.n * MAXED_BADGE_COINS;
      this.s.coins += coins;
      return { id: null, n: f.n, coins, finisher: true };
    }
    const gap = (p) => this.need(p) - p.badges;
    const notReady = pool.filter((p) => gap(p) > 0);
    const list = (notReady.length ? notReady : pool).slice();
    list.sort((a, b) => gap(a) - gap(b) || b.level - a.level);
    const target = list[0];
    const missing = gap(target);
    let n = f.n;
    if (missing > n && missing <= topUp(this.need(target))) n = missing;
    return { ...this._giveBadges(target, n), finisher: true };
  }

  // --- Raids ---------------------------------------------------------------------------------

  isRally() {
    return this.s.losses >= RALLY.losses;
  }

  /** Squad power, threat and crown odds for a squad (default: the current one). */
  raidPreview(ids = this.s.squad, threats = this.s.threats) {
    const people = ids.map((id) => this.s.people.find((p) => p.id === id)).filter(Boolean);
    const sp = squadPower(people, threats, this.s.buildings);
    sp.S *= this.powerMult();
    const rally = this.isRally();
    const T = threatFor(this.s.zone, { rally, tune: this.tuning.threat });
    const odds = crownOdds(sp.S, T);
    return { ...sp, T, odds, three: odds.three, label: oddsLabel(odds.three), rally, threats: threats.slice(), zone: this.s.zone, first: this.s.raids === 0 };
  }

  /**
   * Play a raid: three waves, a crown for each one cleared, stopping at the
   * first miss. The outcome is rolled first; the UI plays it back. Pays coins
   * and Skulls by crowns, claims milestones, opens zones, may bring a stray.
   */
  raid() {
    const s = this.s;
    const squad = this.squadPeople();
    if (!squad.length) return fail('Pick at least one survivor');
    const n = s.raids;
    const rng = rngFor(s.seed, 'raid', n);
    const zone = s.zone;
    const threats = s.threats.slice();
    const pre = this.raidPreview();
    const { S, T, odds, rally } = pre;
    const rolls = WAVES.map(() => rng());
    const clutchRoll = rng();
    const clutchPts = squad.reduce((a, p) => a + (p.perk === 'clutch' ? perkValue(p) : 0), 0);
    let crowns = 0;
    while (crowns < WAVES.length && rolls[crowns] < odds.waves[crowns]) crowns++;
    let clutch = false;
    const last = WAVES.length - 1;
    if (crowns === last && rolls[last] < odds.waves[last] + CLUTCH.window && clutchRoll < CLUTCH.chance + clutchPts) {
      crowns = WAVES.length;
      clutch = true;
    }
    const outcome = n === 0 ? 'win' : this.force.outcome || this.tuning.outcome;
    delete this.force.outcome;
    const forced = { win: [3, false], two: [2, false], one: [1, false], lose: [0, false], clutch: [3, true] }[outcome];
    if (forced) [crowns, clutch] = forced;
    const won = crowns === WAVES.length;
    const byPower = squad.slice().sort((a, b) => this.power(b) - this.power(a));
    const clutchBy = clutch ? (squad.filter((p) => p.perk === 'clutch').sort((a, b) => perkValue(b) - perkValue(a))[0] || byPower[0]).id : null;

    // The golden zombie shows up in wave 2: clear it to bag it.
    const gzRoll = rng();
    const goldenZombie = n > 0 && (this.force.goldenZombie || gzRoll < GOLDEN_ZOMBIE.chance);
    if (n > 0) delete this.force.goldenZombie;
    const bagged = goldenZombie && crowns >= 2;

    const lucky = squad.reduce((a, p) => a + (p.perk === 'lucky' ? perkValue(p) : 0), 0);
    let coins = CROWN_REWARD.coins(zone, crowns) * (1 + lucky) * (1 + this.coinBonus());
    if (rally) coins *= RALLY.coins;
    if (bagged) coins *= GOLDEN_ZOMBIE.coins;
    coins = Math.round(coins * this.tuning.coins);
    let gems = bagged ? GOLDEN_ZOMBIE.gems : 0;
    // Gem Nose: a named little find on a good raid.
    let gemNose = null;
    for (const p of squad) {
      const roll = rng();
      if (crowns >= 2 && !gemNose && p.perk === 'gemnose' && roll < perkValue(p)) gemNose = p.id;
    }
    if (gemNose) gems += GEM_NOSE_GEMS;

    const before = s.skulls;
    const floor = zoneOf(zone).gate;
    s.skulls = Math.max(floor, before + CROWN_REWARD.skulls[crowns]);
    s.best = Math.max(s.best, s.skulls);
    s.coins += coins;
    s.gems += gems;
    s.stats.coinsEarned += coins;

    for (const p of squad) {
      p.raids++;
      if (won) p.wins++;
    }
    s.raids++;
    s.losses = crowns < RALLY.bad ? s.losses + 1 : 0;
    const st = s.stats;
    st.raids++;
    st.crowns[crowns]++;
    if (won) st.wins++;
    if (clutch) st.clutches++;
    if (rally) st.rallies++;
    if (bagged) st.goldenZombies++;

    // A stray follows you home after a 3-crown raid.
    const strayRoll = rng();
    let stray = null;
    if (won && n > 0 && (this.force.stray || strayRoll < this.strayChance())) {
      const rarity = this._rollRarity(rng, 'crate', 1);
      stray = this._admit(this._makeNewcomer(rng, { rarity }, 'stray'));
      st.strays++;
      delete this.force.stray;
    }

    const milestones = this._claimMilestones();
    s.threatLeft = (s.threatLeft || 1) - 1; // before a gate, which starts a fresh streak
    const zones = this._advanceZones(rng);
    if (!zones.length && s.threatLeft <= 0) {
      s.threats = this._nextThreats(rng, n);
      s.threatLeft = THREAT_STREAK;
    }

    const fix = crowns >= 2 ? null : this._fix();
    return {
      ok: true,
      n,
      zone,
      threats,
      rally,
      S,
      T,
      odds,
      crowns,
      won,
      clutch,
      clutchBy,
      goldenZombie,
      bagged,
      coins,
      gems,
      gemNose,
      skulls: s.skulls - before,
      skullsBefore: before,
      skullsAfter: s.skulls,
      floor,
      stray,
      milestones,
      zones,
      next: s.threats.slice(),
      threatLeft: s.threatLeft,
      nextRally: this.isRally(),
      fix,
      squad: squad.map((p) => p.id),
      members: pre.members,
      first: n === 0,
    };
  }

  /** The next raid's threats: never the same single threat twice in a row. */
  _nextThreats(rng, n) {
    if (n === 0 && START.script.secondThreat && this.s.zone === 1) return [START.script.secondThreat];
    const Z = zoneOf(this.s.zone);
    const cur = this.s.threats;
    if (!Z.two) {
      const options = Z.threats.filter((t) => !(cur.length === 1 && cur[0] === t));
      return [pick(rng, options.length ? options : Z.threats)];
    }
    const key = (a) => a.slice().sort().join('+');
    let pair = null;
    for (let i = 0; i < 6; i++) {
      const a = pick(rng, Z.threats);
      const b = pick(rng, Z.threats.filter((t) => t !== a));
      pair = [a, b];
      if (key(pair) !== key(cur)) break;
    }
    return pair;
  }

  /** Milestones up to your best Skulls, each once. */
  _claimMilestones() {
    const out = [];
    while (milestoneAt(this.s.milestones) <= this.s.best) {
      out.push(this._payMilestone(this.s.milestones));
      this.s.milestones++;
    }
    return out;
  }

  milestoneReward(i) {
    const at = milestoneAt(i);
    const zone = zoneAtSkulls(at);
    const kind = MILESTONES.cycle[i % MILESTONES.cycle.length];
    if (kind === 'coins') return { i, at, kind, zone, coins: Math.round(MILESTONES.coins(zone) * this.tuning.coins) };
    if (kind === 'badges') return { i, at, kind, zone, badges: MILESTONES.badges(zone) };
    return { i, at, kind, zone, gems: MILESTONES.gems };
  }

  _payMilestone(i) {
    const m = this.milestoneReward(i);
    if (m.coins) {
      this.s.coins += m.coins;
      this.s.stats.coinsEarned += m.coins;
    }
    if (m.gems) this.s.gems += m.gems;
    if (m.badges) m.stacks = this.squadPeople().map((p) => this._giveBadges(p, m.badges));
    return m;
  }

  /** Open every zone whose gate you have passed. */
  _advanceZones(rng) {
    const out = [];
    while (this.s.zone < ZONES.length && this.s.skulls >= ZONES[this.s.zone].gate) out.push(this._zoneUp(rng));
    return out;
  }

  _zoneUp(rng) {
    const s = this.s;
    const prev = zoneOf(s.zone);
    s.zone++;
    const Z = zoneOf(s.zone);
    s.gems += GATE_GEMS;
    const unlocked = [];
    for (const [id, b] of Object.entries(BUILDINGS)) {
      if (b.zone === s.zone && !s.buildings[id]) {
        s.buildings[id] = 1;
        unlocked.push(id);
      }
    }
    let gift = null;
    if (Z.gift) gift = this._admit(this._makeNewcomer(rng, { rarity: Z.gift.rarity, cls: Z.gift.cls || undefined, golden: Z.gift.golden, sibling: false }, 'gate'));
    s.threatLeft = THREAT_STREAK;
    const fresh = Z.threats.filter((t) => !prev.threats.includes(t));
    if (fresh.length && !Z.two) s.threats = [fresh[0]];
    else if (Z.two && !prev.two) s.threats = this._nextThreats(rng, -1);
    else s.threats = this._nextThreats(rng, -1);
    s.log.push({ zone: s.zone, raids: s.raids, chests: s.stats.chests.crate + s.stats.chests.vault, t: this.now() - s.created, people: s.people.length, squadLevel: this.squadPeople().reduce((a, p) => a + p.level, 0) / Math.max(1, s.squad.length) });
    return { zone: s.zone, name: Z.name, gems: GATE_GEMS, unlocked, gift, souvenir: Z.souvenir, opens: Z.opens, newThreats: fresh, maxLevel: this.maxBuildingLevel() };
  }

  /**
   * One fix after a bad raid, for the NEXT raid: the BEST squad for its threats
   * (if it is clearly stronger), else level someone up, else upgrade a ride.
   */
  _fix() {
    const squad = this.squadPeople();
    const threats = this.s.threats;
    const best = this.bestGain();
    if (best.better) {
      const t = threats.find((x) => best.ids.some((id) => isCounter(this.person(id), [x]))) || threats[0];
      return { kind: 'best', threat: t, cls: THREATS[t].by, gain: Math.round(best.S - best.cur) };
    }
    const ready = squad.filter((p) => this.canLevel(p)).sort((a, b) => this.levelCost(a) - this.levelCost(b))[0];
    if (ready) return { kind: 'level', id: ready.id };
    const rides = [...new Set(squad.map((p) => CLASSES[p.cls].ride))].filter((id) => this.canUpgrade(id).ok);
    if (rides.length) return { kind: 'build', id: rides[0] };
    const anyReady = squad.find((p) => this.isReady(p));
    if (anyReady) return { kind: 'coins', id: anyReady.id };
    return null;
  }

  // --- The ladder ----------------------------------------------------------------------------

  /** Zone, Skull bar and the next three rewards (milestones and gates). */
  ladder() {
    const s = this.s;
    const Z = zoneOf(s.zone);
    const nextZ = s.zone < ZONES.length ? ZONES[s.zone] : null;
    const items = [];
    for (let i = s.milestones; items.length < 6 && i < s.milestones + 12; i++) items.push({ ...this.milestoneReward(i), gate: false });
    for (const z of ZONES) if (z.gate > s.best) items.push({ at: z.gate, kind: 'gate', zone: z.n, name: z.name, gift: z.gift, gems: GATE_GEMS, gate: true });
    items.sort((a, b) => a.at - b.at);
    const prevAt = Math.max(Z.gate, s.milestones > 0 ? milestoneAt(s.milestones - 1) : 0);
    const next = items[0];
    return {
      zone: s.zone,
      name: Z.name,
      skulls: s.skulls,
      best: s.best,
      floor: Z.gate,
      nextGate: nextZ ? nextZ.gate : null,
      nextZone: nextZ ? nextZ.name : null,
      next3: items.slice(0, 3),
      barFrom: prevAt,
      barTo: next ? next.at : prevAt + MILESTONES.lateStep,
    };
  }

  // --- Coming back -----------------------------------------------------------------------------

  /** Call on boot and when the page comes back: maybe someone has a gift. */
  arrive() {
    const now = this.now();
    const away = now - this.s.lastSeen;
    this.s.lastSeen = now;
    if (this.s.gift || away < GIFT.away) return null;
    const rng = rngFor(this.s.seed, 'gift', this.s.giftRolls++);
    if (!(this.force.gift || rng() < GIFT.chance)) return null;
    delete this.force.gift;
    return this._makeGift(rng);
  }

  _makeGift(rng) {
    const sunny = this.s.people.filter((p) => p.vibe === 'sunny');
    const who = pick(rng, sunny.length ? sunny : this.s.people);
    if (!who) return null;
    const kind = pickWeighted(rng, Object.fromEntries(GIFT.table.map((g) => [g.kind, g.w])));
    const row = GIFT.table.find((g) => g.kind === kind);
    const amount = kind === 'coins' ? Math.round(randInt(rng, row.min, row.max) * (1 + 0.5 * (this.s.zone - 1)) * this.tuning.coins) : row.n;
    this.s.gift = { id: who.id, kind, amount };
    return this.s.gift;
  }

  /** Testing: a gift right now. */
  giftNow() {
    if (this.s.gift) return this.s.gift;
    return this._makeGift(rngFor(this.s.seed, 'gift', this.s.giftRolls++));
  }

  claimGift() {
    const g = this.s.gift;
    if (!g) return fail('No gift');
    this.s.gift = null;
    this.s.stats.gifts++;
    const who = this.s.people.find((p) => p.id === g.id);
    if (g.kind === 'coins') {
      this.s.coins += g.amount;
      this.s.stats.coinsEarned += g.amount;
    } else if (g.kind === 'gems') this.s.gems += g.amount;
    else if (g.kind === 'badges') {
      if (!who) {
        this.s.coins += g.amount * MAXED_BADGE_COINS;
        return { ok: true, ...g, kind: 'coins', amount: g.amount * MAXED_BADGE_COINS };
      }
      return { ok: true, ...g, stack: this._giveBadges(who, g.amount) };
    }
    return { ok: true, ...g };
  }

  touch() {
    this.s.lastSeen = this.now();
  }

  // --- Advice ----------------------------------------------------------------------------------

  /**
   * The single best next step for the idle hand: a ready chest, a READY survivor you can afford, a gift, an affordable building, PLAY.
   */
  nextStep() {
    const s = this.s;
    if (s.raids === 0) return { kind: 'play' }; // the guided first raid comes first
    const chest = this.readyChests()[0];
    if (chest) return { kind: 'chest', id: chest };
    const ready = [...this.squadPeople(), ...s.people.filter((p) => !this.inSquad(p.id))].find((p) => this.canLevel(p));
    if (ready) return { kind: 'ready', id: ready.id };
    if (s.gift) return { kind: 'gift', id: s.gift.id };
    const best = this.bestGain();
    if (best.better) return { kind: 'best' };
    const order = [];
    for (const p of this.squadPeople()) order.push(CLASSES[p.cls].ride);
    order.push('crate', 'vault', 'bigtop', 'striker', 'gallery', 'tent', 'garage');
    const build = [...new Set(order)].find((id) => this.canUpgrade(id).ok);
    if (build) return { kind: 'build', id: build };
    return { kind: 'play' };
  }

  /** One-time flags (captions, tutorial beats). Returns true the first time. */
  once(key) {
    if (this.s.seen[key]) return false;
    this.s.seen[key] = true;
    return true;
  }

  // --- Testing cheats --------------------------------------------------------------------------

  cheat(name, arg) {
    const s = this.s;
    switch (name) {
      case 'coins':
        s.coins += arg ?? 1000;
        return { ok: true };
      case 'gems':
        s.gems += arg ?? 100;
        return { ok: true };
      case 'badges':
        return { ok: true, stacks: this.squadPeople().map((p) => this._giveBadges(p, arg ?? 50)) };
      case 'ready':
        for (const p of this.squadPeople()) {
          const n = this.need(p);
          if (n !== null && p.badges < n) p.badges = n;
        }
        return { ok: true };
      case 'chests':
        for (const k of CHEST_ORDER) s.chests[k].readyAt = Math.min(s.chests[k].readyAt, this.now());
        return { ok: true };
      case 'maxBuildings':
        for (const id of Object.keys(BUILDINGS)) if (s.buildings[id] > 0) s.buildings[id] = this.maxBuildingLevel();
        return { ok: true };
      case 'skulls': {
        s.skulls = Math.max(0, arg);
        s.best = Math.max(s.best, s.skulls);
        const rng = rngFor(s.seed, 'cheat', s.raids, s.skulls);
        const milestones = this._claimMilestones();
        const zones = this._advanceZones(rng);
        s.skulls = Math.max(s.skulls, zoneOf(s.zone).gate);
        return { ok: true, milestones, zones };
      }
      default:
        return fail('Unknown cheat');
    }
  }
}

export { displayName };
