// Camp economy: the save state and every rule that changes it. No DOM: the
// clock and the RNG are injected, so the same code runs in the browser, in the
// unit tests and in the balance simulator.
//
// The UI reads derived values (upgradeInfo, pending, loadout, ...) and calls
// actions. Actions return { ok: true, ... } or { ok: false, reason }, and push
// juice-worthy moments ("built", "hqUp", "collect", ...) onto `events`, which
// the UI drains every frame. `rev` increments on every change.

import {
  RESOURCES,
  START,
  BASE_BEDS,
  FIRST_FILL,
  WEAPONS,
  BASE_WEAPONS,
  POWER,
  BUILDINGS,
  BUILDING_ORDER,
  RUBBLE,
  ZONES,
  EXPEDITIONS,
  EXPEDITION_SCALE,
  RECIPES,
  CARRY_PER_ITEM,
  REWARDS,
  REWARD_SCALE,
  GEM_ANCHORS,
  GEMS_PER_RES,
  QUESTS,
  TUNING_DEFAULTS,
} from './config.js';
import { simulateRun } from './run-sim.js';
import { niceRound, randInt } from './util.js';

const HOUR_MS = 3600 * 1000;
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/** Entry for a level in a per-level table, holding the last value past its end. */
export function scaleAt(table, level) {
  return table[Math.max(0, Math.min(level, table.length - 1))];
}

// --- Pricing -------------------------------------------------------------------------------

/** Gems to rush `sec` seconds: piecewise linear through GEM_ANCHORS, at least 1. */
export function gemCost(sec, mult = 1) {
  if (!(sec > 0)) return 0;
  const A = GEM_ANCHORS;
  let g;
  const last = A.length - 1;
  if (sec >= A[last][0]) {
    const [s0, g0] = A[last - 1];
    const [s1, g1] = A[last];
    g = g1 + ((sec - s1) * (g1 - g0)) / (s1 - s0);
  } else {
    for (let i = 1; i <= last; i++) {
      if (sec <= A[i][0]) {
        const [s0, g0] = A[i - 1];
        const [s1, g1] = A[i];
        g = g0 + ((sec - s0) / (s1 - s0)) * (g1 - g0);
        break;
      }
    }
  }
  return Math.max(1, Math.ceil(g * mult - 1e-9));
}

/** Gems to buy the missing part of a cost. */
export function resGemCost(missing) {
  let g = 0;
  for (const r of RESOURCES) if (missing[r] > 0) g += missing[r] / GEMS_PER_RES[r];
  return g > 0 ? Math.max(1, Math.ceil(g - 1e-9)) : 0;
}

// --- State ---------------------------------------------------------------------------------

export function newState(now) {
  const buildings = {};
  for (const id of Object.keys(BUILDINGS)) buildings[id] = { level: BUILDINGS[id].start || 0, at: now, up: null };
  const rubble = {};
  for (const id of Object.keys(RUBBLE)) rubble[id] = { done: false, up: null };
  const items = {};
  for (const r of RECIPES) items[r.id] = 0;
  return {
    v: 1,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    res: { ...START.res },
    gems: START.gems,
    survivors: START.survivors,
    buildings,
    rubble,
    rewards: {
      short: { readyAt: now + REWARDS.short.first * 1000, told: false },
      long: { readyAt: now + REWARDS.long.first * 1000, told: false },
    },
    expeditions: [], // { uid, type, start, end, crew, loot, back }
    crafts: [], // { uid, recipe, start, end }
    items,
    quest: 0,
    questTold: -1,
    stats: {
      runs: 0,
      wins: 0,
      deaths: 0,
      kills: 0,
      collects: 0,
      crates: 0,
      airdrops: 0,
      expeditions: 0,
      crafts: 0,
      rescued: 0,
      gemsSpent: 0,
      gemsEarned: 0,
      zoneRuns: {},
      zoneWins: {},
    },
    cleared: {}, // zones survived at least once (first-clear gems paid)
    seen: {}, // buildings the player has opened since they unlocked (NEW badges)
    milestones: [{ hq: 1, t: 0, play: 0 }], // pacing log: game ms since start, active play ms
    playMs: 0,
    uid: 1,
  };
}

// --- Camp ----------------------------------------------------------------------------------

export class Camp {
  constructor(state, { clock, tuning = { ...TUNING_DEFAULTS }, rng = Math.random } = {}) {
    this.s = state;
    this.clock = clock;
    this.tuning = tuning;
    this.rng = rng;
    this.events = [];
    this.rev = 0;
  }

  now() {
    return this.clock.now();
  }

  changed() {
    this.rev++;
  }

  emit(e) {
    this.events.push(e);
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // --- Derived values ------------------------------------------------------------------------

  get hq() {
    return this.s.buildings.hq.level;
  }

  level(id) {
    return this.s.buildings[id].level;
  }

  /** Level row for the current (or given) level, or null at level 0. */
  row(id, lvl = this.level(id)) {
    return lvl > 0 ? BUILDINGS[id].levels[lvl - 1] : null;
  }

  maxLevel(id) {
    return BUILDINGS[id].levels.length;
  }

  scaledTime(sec) {
    return Math.max(0, sec * this.tuning.buildTime);
  }

  storageCap() {
    return this.row('hq').cap + (this.level('warehouse') > 0 ? this.row('warehouse').cap : 0);
  }

  beds() {
    return BASE_BEDS + (this.level('bunkhouse') > 0 ? this.row('bunkhouse').beds : 0);
  }

  crewAway() {
    let n = 0;
    for (const e of this.s.expeditions) n += e.crew;
    return n;
  }

  freeSurvivors() {
    return this.s.survivors - this.crewAway();
  }

  builders() {
    return this.row('hq').builders;
  }

  /** Timers that occupy a builder: building upgrades and rubble clearing. */
  jobs() {
    if (this._jobsRev === this.rev && this._jobs) return this._jobs;
    const out = [];
    for (const id of BUILDING_ORDER) {
      const up = this.s.buildings[id].up;
      if (up) out.push({ kind: 'building', id, name: BUILDINGS[id].name, to: up.to, start: up.start, end: up.end });
    }
    for (const id of Object.keys(RUBBLE)) {
      const up = this.s.rubble[id].up;
      if (up) out.push({ kind: 'rubble', id, name: RUBBLE[id].name, start: up.start, end: up.end });
    }
    this._jobs = out.sort((a, b) => a.end - b.end);
    this._jobsRev = this.rev;
    return this._jobs;
  }

  freeBuilders() {
    return this.builders() - this.jobs().length;
  }

  areaOpen(area) {
    return !area || this.s.rubble[area].done;
  }

  /**
   * hidden (behind rubble) | locked (camp level too low) | available (can be
   * built) | constructing | built | upgrading
   */
  plotState(id) {
    const b = this.s.buildings[id];
    const def = BUILDINGS[id];
    if (b.level > 0) return b.up ? 'upgrading' : 'built';
    if (b.up) return 'constructing';
    if (!this.areaOpen(def.area)) return 'hidden';
    if (this.hq < def.unlockHq) return 'locked';
    return 'available';
  }

  isNew(id) {
    const st = this.plotState(id);
    return st === 'available' && !this.s.seen[id];
  }

  markSeen(id) {
    if (!this.s.seen[id]) {
      this.s.seen[id] = true;
      this.changed();
    }
  }

  // --- Production ------------------------------------------------------------------------------

  /** Production per hour right now. */
  rate(id) {
    const row = this.row(id);
    return row && row.rate ? row.rate * this.tuning.production : 0;
  }

  /** Amount waiting in a producer (float). Production pauses while upgrading. */
  pending(id) {
    const b = this.s.buildings[id];
    if (BUILDINGS[id].kind !== 'producer' || b.level === 0 || b.up) return 0;
    const h = Math.max(0, this.now() - b.at) / HOUR_MS;
    return Math.min(this.row(id).store, this.rate(id) * h);
  }

  pendingFrac(id) {
    const row = this.row(id);
    return row && row.store ? this.pending(id) / row.store : 0;
  }

  /** Seconds until a producer is full (0 if full or not producing). */
  timeToFull(id) {
    const r = this.rate(id);
    if (r <= 0 || this.s.buildings[id].up || this.level(id) === 0) return 0;
    return ((this.row(id).store - this.pending(id)) / r) * 3600;
  }

  /** Bank what a producer holds, up to the storage cap. */
  collect(id, { silent = false } = {}) {
    const def = BUILDINGS[id];
    if (def.kind !== 'producer') return fail('notProducer');
    const pending = this.pending(id);
    const whole = Math.floor(pending);
    const r = def.produces;
    if (whole <= 0) return fail('empty', { res: r });
    const room = Math.max(0, this.storageCap() - Math.floor(this.s.res[r]));
    const got = Math.min(whole, room);
    if (got <= 0) return fail('full', { res: r });
    this.s.res[r] += got;
    const left = pending - got;
    const rate = this.rate(id);
    this.s.buildings[id].at = rate > 0 ? this.now() - (left / rate) * HOUR_MS : this.now();
    this.s.stats.collects++;
    if (!silent) this.emit({ type: 'collect', id, res: r, got, left: Math.floor(left) });
    this.changed();
    return { ok: true, res: r, got, left: Math.floor(left) };
  }

  collectAll() {
    const got = {};
    let any = false;
    let full = false;
    for (const id of BUILDING_ORDER) {
      if (BUILDINGS[id].kind !== 'producer') continue;
      const res = this.collect(id);
      if (res.ok) {
        got[res.res] = (got[res.res] || 0) + res.got;
        any = true;
        if (res.left > 0) full = true;
      } else if (res.reason === 'full') full = true;
    }
    return { ok: any, got, full };
  }

  // --- Spending --------------------------------------------------------------------------------

  missingFor(cost) {
    const missing = {};
    for (const r of RESOURCES) {
      const need = (cost && cost[r]) || 0;
      const have = Math.floor(this.s.res[r]);
      if (need > have) missing[r] = need - have;
    }
    return missing;
  }

  /** Pay a cost, topping up whatever is missing with gems if allowed. */
  _pay(cost, withGems) {
    const missing = this.missingFor(cost);
    const gems = resGemCost(missing);
    if (gems > 0) {
      if (!withGems) return fail('resources', { missing, gems });
      if (this.s.gems < gems) return fail('gems', { missing, gems });
      this.spendGems(gems, 'resources');
      for (const r of RESOURCES) if (missing[r]) this.s.res[r] += missing[r];
    }
    for (const r of RESOURCES) if (cost && cost[r]) this.s.res[r] -= cost[r];
    return { ok: true, gems };
  }

  spendGems(n, why) {
    this.s.gems -= n;
    this.s.stats.gemsSpent += n;
    this.emit({ type: 'gems', n, why });
    this.changed();
  }

  /**
   * Add a reward. Rewards may go over the storage cap (only collecting from
   * producers is capped). Survivors need a free bed or they move on.
   */
  grant(loot, source = '') {
    const out = { food: 0, wood: 0, scrap: 0, gems: 0, survivors: 0, survivorsLost: 0 };
    for (const r of RESOURCES) {
      const n = Math.max(0, Math.round(loot[r] || 0));
      this.s.res[r] += n;
      out[r] = n;
    }
    if (loot.gems > 0) {
      this.s.gems += loot.gems;
      this.s.stats.gemsEarned += loot.gems;
      out.gems = loot.gems;
    }
    if (loot.survivors > 0) {
      const room = Math.max(0, this.beds() - this.s.survivors);
      const n = Math.min(room, loot.survivors);
      this.s.survivors += n;
      this.s.stats.rescued += n;
      out.survivors = n;
      out.survivorsLost = loot.survivors - n;
    }
    this.emit({ type: 'grant', source, loot: out });
    this.changed();
    return out;
  }

  // --- Building & upgrading ---------------------------------------------------------------------

  upgradeInfo(id) {
    const def = BUILDINGS[id];
    const b = this.s.buildings[id];
    const lvl = b.level;
    const info = { id, level: lvl, max: def.levels.length, maxed: lvl >= def.levels.length, blockers: [], missing: {}, missingGems: 0 };
    if (info.maxed) return info;
    const next = def.levels[lvl];
    info.next = lvl + 1;
    info.row = next;
    info.cost = next.cost || {};
    info.time = this.scaledTime(next.time);
    if (b.up) info.blockers.push({ type: 'busy' });
    if (!this.areaOpen(def.area)) info.blockers.push({ type: 'area', area: def.area });
    const needHq = id === 'hq' ? 0 : Math.max(def.unlockHq, next.hq || 0);
    if (this.hq < needHq) info.blockers.push({ type: 'hq', need: needHq });
    if (next.needSurvivors && this.s.survivors < next.needSurvivors) {
      info.blockers.push({ type: 'survivors', need: next.needSurvivors, have: this.s.survivors });
    }
    if (!b.up && this.freeBuilders() <= 0) info.blockers.push({ type: 'builders' });
    info.missing = this.missingFor(info.cost);
    info.missingGems = resGemCost(info.missing);
    info.affordable = info.missingGems === 0;
    info.canStart = info.blockers.length === 0 && info.affordable;
    return info;
  }

  startUpgrade(id, { withGems = false } = {}) {
    const info = this.upgradeInfo(id);
    if (info.maxed) return fail('maxed');
    if (info.blockers.length) return fail(info.blockers[0].type, { info });
    const paid = this._pay(info.cost, withGems);
    if (!paid.ok) return paid;
    const def = BUILDINGS[id];
    const b = this.s.buildings[id];
    const now = this.now();
    // Upgrading pauses production: bank what's stored first, and keep
    // whatever doesn't fit in storage in the building until it reopens.
    let held = 0;
    if (def.kind === 'producer' && b.level > 0) {
      const before = this.pending(id);
      const r = this.collect(id, { silent: true });
      held = Math.max(0, before - (r.ok ? r.got : 0));
    }
    const end = now + info.time * 1000;
    b.up = { to: b.level + 1, start: now, end };
    if (def.kind === 'producer') {
      b.at = end;
      b.held = held;
    }
    this.s.seen[id] = true;
    this.emit({ type: 'buildStart', id, level: b.up.to, first: b.level === 0 });
    this.changed();
    this.tick(); // zero-length timers (tuning) finish at once
    return { ok: true, end, gems: paid.gems };
  }

  rushCost(id) {
    const up = this.s.buildings[id].up;
    return up ? gemCost((up.end - this.now()) / 1000, this.tuning.gemCost) : 0;
  }

  rush(id) {
    const b = this.s.buildings[id];
    if (!b.up) return fail('idle');
    const cost = this.rushCost(id);
    if (this.s.gems < cost) return fail('gems', { cost });
    if (cost > 0) this.spendGems(cost, 'rush');
    const now = this.now();
    b.up.end = Math.min(b.up.end, now);
    this._completeBuilding(id, b.up.end);
    return { ok: true, cost };
  }

  _completeBuilding(id, t) {
    const b = this.s.buildings[id];
    const def = BUILDINGS[id];
    const from = b.level;
    b.level = b.up.to;
    b.up = null;
    const row = this.row(id);
    if (def.kind === 'producer') {
      const rate = this.rate(id);
      // A new producer starts partly full; an upgraded one gets back what it held.
      const startWith = from === 0 ? FIRST_FILL * row.store : Math.min(row.store, b.held || 0);
      b.at = rate > 0 ? t - (startWith / rate) * HOUR_MS : t;
      b.held = 0;
    }
    this.emit({ type: 'built', id, level: b.level, first: from === 0, t });
    if (id === 'hq') {
      this.s.milestones.push({ hq: b.level, t: t - this.s.created, play: this.s.playMs });
      this.emit({ type: 'hqUp', level: b.level, unlocks: this.unlocksAt(b.level) });
    }
    if (row.weapon) this.emit({ type: 'weapon', weapon: row.weapon, name: WEAPONS[row.weapon].name });
    if (row.zone) this.emit({ type: 'zone', zone: row.zone, name: ZONES.find((z) => z.id === row.zone).name });
    if (row.recipe) this.emit({ type: 'recipe', recipe: row.recipe, name: RECIPES.find((r) => r.id === row.recipe).name });
    this.changed();
  }

  /** What a Command Post level brings, for the level-up reveal and the HQ panel. */
  unlocksAt(level) {
    const out = [];
    for (const id of BUILDING_ORDER) {
      if (id !== 'hq' && BUILDINGS[id].unlockHq === level) out.push({ type: 'building', id, name: BUILDINGS[id].name, area: BUILDINGS[id].area || null });
    }
    for (const [id, r] of Object.entries(RUBBLE)) if (r.hq === level) out.push({ type: 'rubble', id, name: r.name });
    const cur = BUILDINGS.hq.levels[level - 1];
    const prev = BUILDINGS.hq.levels[level - 2];
    if (cur && prev && cur.builders > prev.builders) out.push({ type: 'builder', n: cur.builders });
    if (cur && prev && cur.cap > prev.cap) out.push({ type: 'storage', cap: cur.cap });
    const ups = BUILDING_ORDER.filter(
      (id) => id !== 'hq' && BUILDINGS[id].unlockHq < level && BUILDINGS[id].levels.some((r) => r.hq === level),
    );
    if (ups.length) out.push({ type: 'levels', ids: ups });
    return out;
  }

  // --- Rubble (camp expansions) -------------------------------------------------------------------

  rubbleInfo(area) {
    const def = RUBBLE[area];
    const r = this.s.rubble[area];
    const info = { area, done: r.done, cost: def.cost, time: this.scaledTime(def.time), blockers: [] };
    if (r.done) return info;
    if (r.up) info.blockers.push({ type: 'busy' });
    if (this.hq < def.hq) info.blockers.push({ type: 'hq', need: def.hq });
    if (!r.up && this.freeBuilders() <= 0) info.blockers.push({ type: 'builders' });
    info.missing = this.missingFor(def.cost);
    info.missingGems = resGemCost(info.missing);
    info.affordable = info.missingGems === 0;
    info.canStart = info.blockers.length === 0 && info.affordable;
    return info;
  }

  startClear(area, { withGems = false } = {}) {
    const info = this.rubbleInfo(area);
    if (info.done) return fail('done');
    if (info.blockers.length) return fail(info.blockers[0].type, { info });
    const paid = this._pay(info.cost, withGems);
    if (!paid.ok) return paid;
    const now = this.now();
    this.s.rubble[area].up = { start: now, end: now + info.time * 1000 };
    this.emit({ type: 'clearStart', area });
    this.changed();
    this.tick();
    return { ok: true, gems: paid.gems };
  }

  rushClearCost(area) {
    const up = this.s.rubble[area].up;
    return up ? gemCost((up.end - this.now()) / 1000, this.tuning.gemCost) : 0;
  }

  rushClear(area) {
    const r = this.s.rubble[area];
    if (!r.up) return fail('idle');
    const cost = this.rushClearCost(area);
    if (this.s.gems < cost) return fail('gems', { cost });
    if (cost > 0) this.spendGems(cost, 'rush');
    this._completeRubble(area, Math.min(r.up.end, this.now()));
    return { ok: true, cost };
  }

  _completeRubble(area, t) {
    const r = this.s.rubble[area];
    r.done = true;
    r.up = null;
    const reveals = BUILDING_ORDER.filter((id) => BUILDINGS[id].area === area);
    this.emit({ type: 'cleared', area, reveals, t });
    this.changed();
  }

  // --- Wait rewards ----------------------------------------------------------------------------------

  rewardInterval(kind) {
    return kind === 'short' ? this.tuning.shortMinutes * 60 : this.tuning.longHours * 3600;
  }

  rewardInfo(kind) {
    const r = this.s.rewards[kind];
    const remaining = Math.max(0, (r.readyAt - this.now()) / 1000);
    const def = REWARDS[kind];
    const interval = this.rewardInterval(kind);
    return {
      kind,
      def,
      ready: remaining <= 0,
      remaining,
      frac: interval > 0 ? 1 - Math.min(1, remaining / interval) : 1,
      rushCost: def.skippable && remaining > 0 ? gemCost(remaining, this.tuning.gemCost) : 0,
    };
  }

  /** Re-time rewards after the interval was tuned, so a shorter one applies now. */
  retimeRewards() {
    const now = this.now();
    for (const kind of ['short', 'long']) {
      const r = this.s.rewards[kind];
      r.readyAt = Math.min(r.readyAt, now + this.rewardInterval(kind) * 1000);
    }
    this.changed();
  }

  /** Wait-reward size at the current Command Post level. */
  rewardScale() {
    return scaleAt(REWARD_SCALE, this.hq);
  }

  rollReward(kind) {
    const def = REWARDS[kind];
    const scale = this.rewardScale();
    const loot = {};
    for (const r of RESOURCES) loot[r] = niceRound((def.loot[r] || 0) * scale * (0.8 + this.rng() * 0.4));
    loot.gems = this.rng() < def.gemChance ? randInt(this.rng, def.gems[0], def.gems[1]) : 0;
    loot.survivors = this.rng() < def.survivorChance ? 1 : 0;
    return loot;
  }

  claimReward(kind) {
    const info = this.rewardInfo(kind);
    if (!info.ready) return fail('notReady', { remaining: info.remaining });
    const loot = this.rollReward(kind);
    const got = this.grant(loot, kind);
    const r = this.s.rewards[kind];
    r.readyAt = this.now() + this.rewardInterval(kind) * 1000;
    r.told = false;
    if (kind === 'short') this.s.stats.crates++;
    else this.s.stats.airdrops++;
    this.emit({ type: 'reward', kind, loot: got });
    this.changed();
    return { ok: true, loot: got };
  }

  rushReward(kind) {
    const info = this.rewardInfo(kind);
    if (info.ready) return this.claimReward(kind);
    if (!info.def.skippable) return fail('notSkippable');
    if (this.s.gems < info.rushCost) return fail('gems', { cost: info.rushCost });
    this.spendGems(info.rushCost, 'rush');
    this.s.rewards[kind].readyAt = this.now();
    return this.claimReward(kind);
  }

  // --- Runs (simulated) ------------------------------------------------------------------------------

  zones() {
    const radio = this.level('radio');
    return ZONES.map((z) => ({
      ...z,
      unlocked: radio >= z.radio,
      cleared: !!this.s.cleared[z.id],
      wins: this.s.stats.zoneWins[z.id] || 0,
      runs: this.s.stats.zoneRuns[z.id] || 0,
    }));
  }

  weapons() {
    const out = [...BASE_WEAPONS];
    for (let l = 1; l <= this.level('armory'); l++) {
      const w = BUILDINGS.armory.levels[l - 1].weapon;
      if (w && !out.includes(w)) out.push(w);
    }
    return out;
  }

  /**
   * What the camp gives the next run: the RunLoadout contract for the action
   * game. `pack` chooses crafted items to bring ({ medkit: 1 }); by default
   * everything in stock up to the carry limit is packed.
   */
  loadout(pack = null) {
    const armory = this.row('armory');
    const infirmary = this.row('infirmary');
    const garage = this.row('garage');
    const radio = this.row('radio');
    const hpBonus = infirmary ? infirmary.hp : 0;
    const dmg = armory ? armory.dmg : 0;
    const medkits = infirmary ? infirmary.medkits : 0;
    const weapons = this.weapons();
    const items = {};
    for (const r of RECIPES) {
      const want = pack ? pack[r.id] || 0 : CARRY_PER_ITEM;
      const n = Math.min(this.s.items[r.id] || 0, CARRY_PER_ITEM, want);
      if (n > 0) items[r.id] = n;
    }
    let power = POWER.base + hpBonus * POWER.perHp + dmg * POWER.perDmg + medkits * POWER.medkit;
    for (const w of weapons) power += WEAPONS[w].power;
    for (const [id, n] of Object.entries(items)) power += RECIPES.find((r) => r.id === id).power * n;
    return {
      maxHp: 100 + hpBonus,
      damageMult: 1 + dmg / 100,
      weapons,
      medkits,
      items,
      lootMult: 1 + (garage ? garage.loot : 0) / 100,
      rescueBonus: (radio ? radio.rescue : 0) / 100,
      power: Math.round(power),
    };
  }

  /**
   * Simulate a run without banking it. The UI shows the run, moves the clock
   * on by result.timeS (camp timers keep going while you are out) and then
   * calls applyRun().
   */
  planRun(zoneId, { pack = null, outcome = this.tuning.outcome, seed } = {}) {
    const zone = this.zones().find((z) => z.id === zoneId);
    if (!zone) return fail('zone');
    if (!zone.unlocked) return fail('locked');
    const loadout = this.loadout(pack);
    const result = simulateRun({
      zone,
      loadout,
      outcome,
      seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed,
      firstClear: !this.s.cleared[zoneId],
      forceWin: this.s.stats.runs === 0, // the very first run always makes it home
      lootMult: this.tuning.loot,
    });
    result.loadout = loadout;
    return { ok: true, result };
  }

  /** Plan and bank in one go (tests, balance sim). */
  playRun(zoneId, opts = {}) {
    const r = this.planRun(zoneId, opts);
    if (r.ok) r.result.granted = this.applyRun(r.result);
    return r;
  }

  /** Bank a RunResult (from the simulator now, from the real game later). */
  applyRun(result) {
    const st = this.s.stats;
    const z = result.zone;
    st.runs++;
    st.kills += result.kills || 0;
    st.zoneRuns[z] = (st.zoneRuns[z] || 0) + 1;
    if (result.won) {
      st.wins++;
      st.zoneWins[z] = (st.zoneWins[z] || 0) + 1;
      this.s.cleared[z] = true;
    } else st.deaths++;
    for (const [id, n] of Object.entries(result.itemsUsed || {})) this.s.items[id] = Math.max(0, (this.s.items[id] || 0) - n);
    const granted = this.grant({ ...result.loot, gems: result.gems || 0, survivors: result.rescued || 0 }, 'run');
    this.emit({ type: 'run', won: result.won, zone: z });
    this.changed();
    return granted;
  }

  // --- Expeditions (Garage) -----------------------------------------------------------------------------

  expeditionSlots() {
    const g = this.row('garage');
    return g ? g.slots : 0;
  }

  expeditionTypes() {
    const lvl = this.level('garage');
    const scale = scaleAt(EXPEDITION_SCALE, this.hq);
    return EXPEDITIONS.map((e) => ({ ...e, unlocked: lvl >= e.garage, time: this.scaledTime(e.time), scale }));
  }

  startExpedition(type) {
    const t = this.expeditionTypes().find((e) => e.id === type);
    if (!t) return fail('type');
    if (this.level('garage') === 0) return fail('garage');
    if (!t.unlocked) return fail('locked');
    if (this.s.expeditions.length >= this.expeditionSlots()) return fail('slots');
    if (this.freeSurvivors() < t.crew) return fail('crew');
    const loot = {};
    for (const r of RESOURCES) loot[r] = niceRound((t.loot[r] || 0) * t.scale * (0.8 + this.rng() * 0.4));
    loot.gems = this.rng() < t.gemChance ? randInt(this.rng, t.gems[0], t.gems[1]) : 0;
    loot.survivors = this.rng() < t.survivorChance ? 1 : 0;
    const now = this.now();
    const e = { uid: this.s.uid++, type, start: now, end: now + t.time * 1000, crew: t.crew, loot, back: false };
    this.s.expeditions.push(e);
    this.s.stats.expeditions++;
    this.emit({ type: 'expeditionStart', uid: e.uid, kind: type });
    this.changed();
    this.tick();
    return { ok: true, uid: e.uid };
  }

  rushExpeditionCost(uid) {
    const e = this.s.expeditions.find((x) => x.uid === uid);
    return e && e.end > this.now() ? gemCost((e.end - this.now()) / 1000, this.tuning.gemCost) : 0;
  }

  rushExpedition(uid) {
    const e = this.s.expeditions.find((x) => x.uid === uid);
    if (!e) return fail('none');
    const cost = this.rushExpeditionCost(uid);
    if (this.s.gems < cost) return fail('gems', { cost });
    if (cost > 0) this.spendGems(cost, 'rush');
    e.end = Math.min(e.end, this.now());
    this.tick();
    return { ok: true, cost };
  }

  collectExpedition(uid) {
    const i = this.s.expeditions.findIndex((x) => x.uid === uid);
    if (i < 0) return fail('none');
    const e = this.s.expeditions[i];
    if (e.end > this.now()) return fail('away');
    this.s.expeditions.splice(i, 1);
    const got = this.grant(e.loot, 'expedition');
    this.emit({ type: 'expeditionCollect', uid, kind: e.type, loot: got });
    this.changed();
    return { ok: true, loot: got, kind: e.type };
  }

  // --- Workshop crafting ----------------------------------------------------------------------------------

  craftSlots() {
    const w = this.row('workshop');
    return w ? w.slots : 0;
  }

  recipeLevel(id) {
    return BUILDINGS.workshop.levels.findIndex((r) => r.recipe === id) + 1;
  }

  recipes() {
    const lvl = this.level('workshop');
    const speed = lvl ? this.row('workshop').speed : 0;
    return RECIPES.map((r) => ({
      ...r,
      unlockLevel: this.recipeLevel(r.id),
      unlocked: lvl > 0 && lvl >= this.recipeLevel(r.id),
      time: this.scaledTime(r.time * (1 - speed / 100)),
      have: this.s.items[r.id] || 0,
      missing: this.missingFor(r.cost),
    }));
  }

  startCraft(id, { withGems = false } = {}) {
    const r = this.recipes().find((x) => x.id === id);
    if (!r) return fail('recipe');
    if (!r.unlocked) return fail('locked');
    if (this.s.crafts.length >= this.craftSlots()) return fail('slots');
    const paid = this._pay(r.cost, withGems);
    if (!paid.ok) return paid;
    const now = this.now();
    this.s.crafts.push({ uid: this.s.uid++, recipe: id, start: now, end: now + r.time * 1000 });
    this.emit({ type: 'craftStart', recipe: id });
    this.changed();
    this.tick();
    return { ok: true, gems: paid.gems };
  }

  rushCraftCost(uid) {
    const c = this.s.crafts.find((x) => x.uid === uid);
    return c ? gemCost((c.end - this.now()) / 1000, this.tuning.gemCost) : 0;
  }

  rushCraft(uid) {
    const c = this.s.crafts.find((x) => x.uid === uid);
    if (!c) return fail('none');
    const cost = this.rushCraftCost(uid);
    if (this.s.gems < cost) return fail('gems', { cost });
    if (cost > 0) this.spendGems(cost, 'rush');
    this._completeCraft(uid, Math.min(c.end, this.now()));
    return { ok: true, cost };
  }

  _completeCraft(uid, t) {
    const i = this.s.crafts.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const c = this.s.crafts[i];
    this.s.crafts.splice(i, 1);
    this.s.items[c.recipe] = (this.s.items[c.recipe] || 0) + 1;
    this.s.stats.crafts++;
    this.emit({ type: 'crafted', recipe: c.recipe, name: RECIPES.find((r) => r.id === c.recipe).name, t });
    this.changed();
  }

  // --- Objectives ---------------------------------------------------------------------------------------------

  goalProgress(g) {
    if (g.level) return [this.level(g.level[0]), g.level[1]];
    if (g.stat) return [this.s.stats[g.stat[0]] || 0, g.stat[1]];
    if (g.survivors) return [this.s.survivors, g.survivors];
    if (g.cleared) return [this.s.rubble[g.cleared].done ? 1 : 0, 1];
    if (g.zoneWin) return [this.s.stats.zoneWins[g.zoneWin[0]] || 0, g.zoneWin[1]];
    return [0, 1];
  }

  questInfo() {
    const def = QUESTS[this.s.quest];
    if (!def) return null;
    const [have, need] = this.goalProgress(def.goal);
    return { index: this.s.quest, total: QUESTS.length, def, have: Math.min(have, need), need, done: have >= need };
  }

  claimQuest() {
    const q = this.questInfo();
    if (!q) return fail('none');
    if (!q.done) return fail('notDone');
    const got = this.grant(q.def.reward, 'quest');
    this.s.quest++;
    this.emit({ type: 'questClaim', index: q.index, loot: got });
    this.changed();
    return { ok: true, loot: got };
  }

  // --- Time --------------------------------------------------------------------------------------------------

  /** Finish every timer that is due, in the order they ended. Idempotent. */
  tick() {
    const now = this.now();
    const due = [];
    for (const id of Object.keys(this.s.buildings)) {
      const up = this.s.buildings[id].up;
      if (up && up.end <= now) due.push({ t: up.end, run: () => this._completeBuilding(id, up.end) });
    }
    for (const id of Object.keys(this.s.rubble)) {
      const up = this.s.rubble[id].up;
      if (up && up.end <= now) due.push({ t: up.end, run: () => this._completeRubble(id, up.end) });
    }
    for (const c of this.s.crafts) if (c.end <= now) due.push({ t: c.end, run: () => this._completeCraft(c.uid, c.end) });
    due.sort((a, b) => a.t - b.t);
    for (const d of due) d.run();

    for (const e of this.s.expeditions) {
      if (!e.back && e.end <= now) {
        e.back = true;
        this.emit({ type: 'expeditionBack', uid: e.uid, kind: e.type });
        this.changed();
      }
    }
    for (const kind of ['short', 'long']) {
      const r = this.s.rewards[kind];
      if (!r.told && r.readyAt <= now) {
        r.told = true;
        this.emit({ type: 'rewardReady', kind });
        this.changed();
      }
    }
    const q = this.questInfo();
    if (q && q.done && this.s.questTold !== q.index) {
      this.s.questTold = q.index;
      this.emit({ type: 'questDone', index: q.index });
      this.changed();
    }
  }

  // --- Dev cheats (tuning panel) -------------------------------------------------------------------------------

  give(loot) {
    return this.grant(loot, 'cheat');
  }

  finishAll() {
    const now = this.now();
    for (const b of Object.values(this.s.buildings)) if (b.up) b.up.end = Math.min(b.up.end, now);
    for (const r of Object.values(this.s.rubble)) if (r.up) r.up.end = Math.min(r.up.end, now);
    for (const c of this.s.crafts) c.end = Math.min(c.end, now);
    for (const e of this.s.expeditions) e.end = Math.min(e.end, now);
    for (const r of Object.values(this.s.rewards)) r.readyAt = Math.min(r.readyAt, now);
    this.tick();
    this.changed();
  }

  fillProducers() {
    const now = this.now();
    for (const id of BUILDING_ORDER) {
      const b = this.s.buildings[id];
      if (BUILDINGS[id].kind !== 'producer' || b.level === 0 || b.up) continue;
      const rate = this.rate(id);
      if (rate > 0) b.at = now - (this.row(id).store / rate) * HOUR_MS;
    }
    this.changed();
  }
}
