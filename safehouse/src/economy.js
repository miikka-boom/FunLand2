// Safehouse economy: the save state and every rule that changes it. No DOM:
// the clock and the RNG are injected, so the same code runs in the browser,
// in the unit tests and in the balance simulator.
//
// The UI reads derived values (upgradeInfo, recipeInfo, yardInfo, squad, ...)
// and calls actions. Actions return { ok: true, ... } or { ok: false, reason },
// and push juice-worthy moments ('built', 'crafted', 'yardFull', ...) onto
// `events`, which the UI drains every frame. `rev` increments on every change.
//
// Design rules this file enforces (see docs/SAFEHOUSE.md):
// - Nothing decays, nothing is raided, nothing is lost. Cancelling refunds.
// - Upgrades: resources + Barricade gate + chapter gate + a build slot, then
//   a real-time timer. Builds need no power and no Fuel.
// - Jobs: one running job per station, a queue as long as the station level,
//   power drawn only while running, Fuel paid when a job starts. Waiting jobs
//   start on their own as soon as power and Fuel allow, also while away.

import {
  RESOURCES,
  RES_INFO,
  OVERFLOW_RATE,
  START,
  STATIONS,
  STATION_ORDER,
  BARRICADE_LEAD,
  RECIPES,
  SLOTS,
  ITEMS,
  CRATE_MAX,
  FREE_HEAL,
  WEAPONS,
  WEAPON_ORDER,
  BASE_WEAPONS,
  WEAPON_TIERS,
  ATTACHMENTS,
  SQUAD_SIZE,
  POWER,
  FRIENDS,
  SURVIVORS,
  SURVIVOR_ORDER,
  BOND,
  MISSIONS,
  CHAPTERS,
  RESCUE_CALLS,
  specialMission,
  ORDERS,
  STAGES,
  TUNING_DEFAULTS,
} from './config.js';
import { simulateMission, estimateOdds } from './mission-sim.js';
import { LINES, BOND_CHAPTERS } from './story.js';

const HOUR_MS = 3600 * 1000;
const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
const YARD = 'scrapyard';
const YARD_JOB = 'scrap_run';

/** The next local midnight strictly after `t` (daily orders arrive then). */
export function nextMidnight(t) {
  const d = new Date(t);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// --- State ----------------------------------------------------------------------------------------

export function newState(now) {
  const stations = {};
  for (const id of STATION_ORDER) stations[id] = { level: STATIONS[id].start || 0, build: null };
  const crate = {};
  for (const id of Object.keys(ITEMS)) if (!ITEMS[id].free) crate[id] = 0;
  const survivors = {};
  for (const id of SURVIVOR_ORDER) {
    const home = !!SURVIVORS[id].arrives.start;
    survivors[id] = { state: home ? 'housed' : 'unknown', xp: 0, bondDone: false, since: home ? now : 0 };
  }
  return {
    v: 1,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    res: { ...START.res },
    stations,
    jobs: [], // { uid, station, recipe, state: 'waiting'|'running', queued, start, end, paid, fuelPaid }
    yard: { pile: 0, at: now, auto: true },
    crate,
    weapons: { smg: 1 }, // tier per unlocked weapon (1 = Mk I)
    loadout: { weapon: null, throwable: null, heal: null, boost: null }, // null = auto (best in stock), 'none'
    presets: [],
    won: {}, // story mission id -> times cleared
    runs: {}, // mission id -> attempts
    survivors,
    squad: [], // preferred companions, most wanted first
    friend: null, // simulated co-op friend: null | 'rookie' | 'veteran'
    orders: { list: [], nextAt: 0 },
    last: null, // the latest mission, for Barracks reactions
    stage: 0, // index into STAGES of the stage in progress
    stageLog: [{ stage: 0, t: 0, play: 0, missions: 0 }],
    stats: {
      missions: 0,
      wins: 0,
      wipes: 0,
      safeRooms: 0,
      kills: 0,
      crafted: 0,
      itemsUsed: 0,
      fuelCans: 0,
      builds: 0,
      yardScrap: 0,
      overflowScrap: 0,
      ordersDone: 0,
      fuelSpent: 0,
    },
    seen: {}, // stations opened since they became buildable (NEW badges)
    intro: false, // the opening scene was shown
    playMs: 0,
    uid: 1,
  };
}

// --- Safehouse --------------------------------------------------------------------------------------

export class Safehouse {
  constructor(state, { clock, tuning = { ...TUNING_DEFAULTS }, rng = Math.random } = {}) {
    this.s = state;
    this.clock = clock;
    this.tuning = tuning;
    this.rng = rng;
    this.events = [];
    this.rev = 0;
    this._odds = new Map();
    this._oddsRev = -1;
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

  // --- Levels and effects ----------------------------------------------------------------------------

  level(id) {
    return this.s.stations[id].level;
  }

  /** Effect row for a level (the station's `base` row at level 0). */
  row(id, lvl = this.level(id)) {
    const def = STATIONS[id];
    return lvl > 0 ? def.levels[lvl - 1] : { ...def.base };
  }

  maxLevel(id) {
    return STATIONS[id].levels.length;
  }

  get barricade() {
    return this.level('barricade');
  }

  isUnlocked(id) {
    return this.barricade >= STATIONS[id].unlock;
  }

  /** locked | available (can be built) | building | built */
  stationState(id) {
    const st = this.s.stations[id];
    if (st.level > 0) return 'built';
    if (st.build) return 'building';
    return this.isUnlocked(id) ? 'available' : 'locked';
  }

  isNew(id) {
    return this.stationState(id) === 'available' && !this.s.seen[id];
  }

  markSeen(id) {
    if (!this.s.seen[id]) {
      this.s.seen[id] = true;
      this.changed();
    }
  }

  /** Storage cap: Scrap has none (it is where overflow goes). */
  cap(r) {
    if (r === 'parts') return this.row('barricade').partsCap;
    if (r === 'supplies') return this.row('barricade').suppliesCap;
    if (r === 'fuel') return this.row('generator').fuelTank;
    return Infinity;
  }

  powerCap() {
    return this.row('generator').powerCap;
  }

  drawOf(station) {
    return STATIONS[station].levels[0].powerDraw;
  }

  powerUsed() {
    let n = 0;
    for (const j of this.s.jobs) if (j.state === 'running') n += this.drawOf(j.station);
    return n;
  }

  powerFree() {
    return this.powerCap() - this.powerUsed();
  }

  buildSlots() {
    return this.row('barricade').buildSlots;
  }

  builds() {
    const out = [];
    for (const id of STATION_ORDER) {
      const b = this.s.stations[id].build;
      if (b) out.push({ id, ...b });
    }
    return out.sort((a, b) => a.end - b.end);
  }

  freeSlots() {
    return this.buildSlots() - this.builds().length;
  }

  // --- Campaign ---------------------------------------------------------------------------------------

  isCleared(n) {
    return (this.s.won[`c${n}m3`] || 0) > 0;
  }

  chaptersCleared() {
    let n = 0;
    for (const ch of CHAPTERS) if (this.isCleared(ch.n)) n++;
    return n;
  }

  /** How many chapters the Radio Room has opened. */
  chapterLimit() {
    return this.row('radio').chapters;
  }

  chapterOpen(n) {
    return n >= 1 && n <= CHAPTERS.length && n <= this.chapterLimit() && (n === 1 || this.isCleared(n - 1));
  }

  /** Furthest open chapter. */
  frontier() {
    let f = 1;
    for (const ch of CHAPTERS) if (this.chapterOpen(ch.n)) f = ch.n;
    return f;
  }

  /** Chapter list for the mission picker. */
  chapters() {
    return CHAPTERS.map((ch) => {
      const open = this.chapterOpen(ch.n);
      return {
        n: ch.n,
        name: ch.name,
        open,
        cleared: this.isCleared(ch.n),
        radioLocked: !open && ch.n > this.chapterLimit() && (ch.n === 1 || this.isCleared(ch.n - 1)),
        missions: ch.missions.map((name, i) => {
          const id = `c${ch.n}m${i + 1}`;
          return { id, name, index: i + 1, finale: i === ch.missions.length - 1, open: this.missionOpen(id), wins: this.s.won[id] || 0 };
        }),
      };
    });
  }

  /** Rescue calls and bond chapters on offer right now. */
  specialMissions() {
    const out = [];
    const call = this.rescueCall();
    if (call) out.push(this.missionDef(`rescue_${call}`));
    if (this.row('barracks').bondChapters) {
      for (const id of this.housed()) {
        const sv = this.s.survivors[id];
        if (!sv.bondDone && this.bondLevel(id) >= BOND.bondChapterAt) out.push(this.missionDef(`bond_${id}`));
      }
    }
    return out;
  }

  /** The radio survivor calling in, if a bunk is free for them. */
  rescueCall() {
    if (this.level('radio') < 1 || this.callBunks() <= 0) return null;
    for (const id of SURVIVOR_ORDER) if (SURVIVORS[id].arrives.radio && this.s.survivors[id].state === 'unknown') return id;
    return null;
  }

  specialChapter() {
    return Math.max(1, this.frontier() - 1);
  }

  missionDef(id) {
    if (MISSIONS[id]) return MISSIONS[id];
    const m = /^(rescue|bond)_(\w+)$/.exec(id || '');
    if (!m || !SURVIVORS[m[2]]) return null;
    const name = m[1] === 'rescue' ? (RESCUE_CALLS[m[2]] || {}).name : BOND_CHAPTERS[m[2]].name;
    if (!name) return null;
    return specialMission(m[1], m[2], this.specialChapter(), name);
  }

  missionOpen(id) {
    const M = this.missionDef(id);
    if (!M) return false;
    if (M.kind === 'rescue') return this.rescueCall() === M.who;
    if (M.kind === 'bond') return this.specialMissions().some((x) => x.id === id);
    return this.chapterOpen(M.chapter) && (M.index === 1 || (this.s.won[`c${M.chapter}m${M.index - 1}`] || 0) > 0);
  }

  /** The mission the guide points at: the first open story mission not yet cleared. */
  nextMission() {
    for (const ch of CHAPTERS) {
      for (let i = 1; i <= ch.missions.length; i++) {
        const id = `c${ch.n}m${i}`;
        if (this.missionOpen(id) && !this.s.won[id]) return id;
      }
    }
    return `c${this.frontier()}m3`;
  }

  // --- Wallet ------------------------------------------------------------------------------------------

  missingFor(cost) {
    const missing = {};
    for (const r of RESOURCES) {
      const need = (cost && cost[r]) || 0;
      const have = Math.floor(this.s.res[r]);
      if (need > have) missing[r] = need - have;
    }
    return missing;
  }

  canAfford(cost) {
    return Object.keys(this.missingFor(cost)).length === 0;
  }

  _pay(cost) {
    for (const r of RESOURCES) if (cost && cost[r]) this.s.res[r] -= cost[r];
  }

  /** Give back exactly what was paid. Refunds ignore storage caps: nothing is lost. */
  _refund(cost) {
    for (const r of RESOURCES) if (cost && cost[r]) this.s.res[r] += cost[r];
  }

  /**
   * Bank a payout. Above a cap, the extra converts to Scrap at half value
   * (Scrap itself has no cap), so nothing is wasted.
   */
  grant(loot, source = '') {
    const got = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };
    const over = {};
    let value = 0;
    for (const r of RESOURCES) {
      const n = Math.max(0, Math.round((loot && loot[r]) || 0));
      if (!n) continue;
      const room = Math.max(0, this.cap(r) - Math.floor(this.s.res[r]));
      const keep = Math.min(n, room);
      this.s.res[r] += keep;
      got[r] += keep;
      if (n > keep) {
        over[r] = n - keep;
        value += (n - keep) * RES_INFO[r].value * OVERFLOW_RATE;
      }
    }
    const scrap = Math.floor(value + 1e-9);
    if (scrap > 0) {
      this.s.res.scrap += scrap;
      got.scrap += scrap;
      this.s.stats.overflowScrap += scrap;
    }
    this.emit({ type: 'grant', source, got, over, scrap });
    this.changed();
    if (got.fuel > 0) this._pump(this.now()); // jobs waiting for Fuel can start
    return { got, over, scrap };
  }

  // --- Building and upgrading ------------------------------------------------------------------------------

  /** The Barricade level a station level needs (the station's own unlock for level 1). */
  barricadeFor(id, lvl) {
    if (id === 'barricade') return 0;
    return Math.max(STATIONS[id].unlock, lvl - BARRICADE_LEAD);
  }

  upgradeInfo(id) {
    const def = STATIONS[id];
    const st = this.s.stations[id];
    const lvl = st.level;
    const info = { id, level: lvl, max: def.levels.length, maxed: lvl >= def.levels.length, blockers: [], missing: {}, canStart: false };
    if (info.maxed) return info;
    const row = def.levels[lvl];
    info.next = lvl + 1;
    info.row = row;
    info.cost = row.cost;
    info.time = Math.max(0, row.buildSeconds * this.tuning.buildTime);
    if (st.build) info.blockers.push({ type: 'busy' });
    const needB = this.barricadeFor(id, info.next);
    if (this.barricade < needB) info.blockers.push({ type: lvl === 0 ? 'unlock' : 'barricade', need: needB });
    if (this.chaptersCleared() < row.chaptersCleared) info.blockers.push({ type: 'chapters', need: row.chaptersCleared, have: this.chaptersCleared() });
    if (!st.build && info.time > 0 && this.freeSlots() <= 0) info.blockers.push({ type: 'slots', slots: this.buildSlots() });
    info.missing = this.missingFor(info.cost);
    if (Object.keys(info.missing).length) info.blockers.push({ type: 'resources', missing: info.missing });
    info.canStart = info.blockers.length === 0;
    return info;
  }

  startUpgrade(id) {
    const info = this.upgradeInfo(id);
    if (info.maxed) return fail('maxed');
    if (info.blockers.length) return fail(info.blockers[0].type, { info, blocker: info.blockers[0] });
    this._pay(info.cost);
    const now = this.now();
    const st = this.s.stations[id];
    st.build = { to: info.next, start: now, end: now + info.time * 1000, paid: { ...info.cost } };
    this.s.seen[id] = true;
    this.emit({ type: 'buildStart', id, level: info.next, first: info.level === 0, instant: info.time <= 0 });
    this.changed();
    this.tick(); // instant builds (level 1) finish right away
    return { ok: true, end: st.build ? st.build.end : now, instant: info.time <= 0 };
  }

  /** Safe to change your mind: cancelling a build refunds everything. */
  cancelBuild(id) {
    const st = this.s.stations[id];
    if (!st.build) return fail('idle');
    const paid = st.build.paid;
    st.build = null;
    this._refund(paid);
    this.emit({ type: 'buildCancel', id, refund: paid });
    this.changed();
    return { ok: true, refund: paid };
  }

  _completeBuild(id, t) {
    const st = this.s.stations[id];
    const from = st.level;
    if (id === YARD) this._settleYard(t); // earn at the old rate up to now
    st.level = st.build.to;
    st.build = null;
    this.s.stats.builds++;
    const row = this.row(id);
    this.emit({ type: 'built', id, level: st.level, first: from === 0, t });
    if (id === 'barracks') this._houseWaiting(t);
    if (id === 'radio' && from === 0) {
      this._newOrder(t);
      this.s.orders.nextAt = nextMidnight(t);
    }
    if (id === YARD) {
      if (from === 0) {
        this.s.yard = { pile: 0, at: t, auto: true };
        this._queueYardRun();
      } else this._retimeYard(t);
    }
    if (row.weapon && !this.s.weapons[row.weapon]) {
      this.s.weapons[row.weapon] = 1;
      this.emit({ type: 'weapon', weapon: row.weapon });
    }
    if (row.attachment) this.emit({ type: 'attachment', id: row.attachment });
    for (const j of STATIONS[id].jobs) if (j.unlockLevel === st.level && j.id !== YARD_JOB) this.emit({ type: 'recipe', recipe: j.id });
    this.changed();
  }

  // --- Jobs: crafting and production -------------------------------------------------------------------------

  /** Jobs at a station: the running one first, then the queue in order. */
  jobsAt(station) {
    return this.s.jobs
      .filter((j) => j.station === station)
      .sort((a, b) => (a.state === 'running' ? -1 : b.state === 'running' ? 1 : a.uid - b.uid));
  }

  /** Waiting jobs a station can hold: as many as its level. */
  queueCap(station) {
    return this.level(station);
  }

  crateCount(item) {
    return this.s.crate[item] || 0;
  }

  /** Items of a kind already queued or crafting. */
  pendingItem(item) {
    let n = 0;
    for (const j of this.s.jobs) {
      const out = RECIPES[j.recipe].output;
      if (out.item === item) n += out.count;
    }
    return n;
  }

  craftSeconds(rid) {
    return Math.max(0, RECIPES[rid].seconds * this.tuning.craftTime);
  }

  recipeInfo(rid) {
    const r = RECIPES[rid];
    const lvl = this.level(r.station);
    const item = r.output.item;
    const info = {
      ...r,
      item,
      unlocked: lvl >= 1 && lvl >= r.unlockLevel,
      have: this.crateCount(item),
      pending: this.pendingItem(item),
      time: this.craftSeconds(rid),
      missing: this.missingFor(r.cost),
      blockers: [],
    };
    if (lvl < 1) info.blockers.push({ type: 'station' });
    else if (lvl < r.unlockLevel) info.blockers.push({ type: 'locked', need: r.unlockLevel });
    if (lvl >= 1 && this.jobsAt(r.station).length >= lvl + 1) info.blockers.push({ type: 'queue', cap: lvl });
    if (info.have + info.pending + r.output.count > CRATE_MAX) info.blockers.push({ type: 'crate' });
    if (Object.keys(info.missing).length) info.blockers.push({ type: 'resources', missing: info.missing });
    info.canQueue = info.blockers.length === 0;
    return info;
  }

  /** Pay the recipe now; the job starts as soon as power and Fuel allow. */
  queueCraft(rid) {
    const r = RECIPES[rid];
    if (!r || rid === YARD_JOB) return fail('recipe');
    const info = this.recipeInfo(rid);
    if (!info.canQueue) return fail(info.blockers[0].type, { blocker: info.blockers[0] });
    this._pay(r.cost);
    const now = this.now();
    const job = { uid: this.s.uid++, station: r.station, recipe: rid, state: 'waiting', queued: now, start: 0, end: 0, paid: { ...r.cost }, fuelPaid: 0 };
    this.s.jobs.push(job);
    this.emit({ type: 'queued', uid: job.uid, recipe: rid });
    this.changed();
    this._pump(now);
    this.tick();
    return { ok: true, uid: job.uid, started: job.state === 'running' || !this.s.jobs.includes(job) };
  }

  /** Cancelling a craft refunds everything, Fuel included if it had started. */
  cancelJob(uid) {
    const j = this.s.jobs.find((x) => x.uid === uid);
    if (!j) return fail('none');
    if (j.recipe === YARD_JOB) return this.stopYard();
    this.s.jobs.splice(this.s.jobs.indexOf(j), 1);
    this._refund(j.paid);
    if (j.state === 'running' && j.fuelPaid) this._refund({ fuel: j.fuelPaid });
    this.emit({ type: 'jobCancel', uid, recipe: j.recipe });
    this.changed();
    this._pump(this.now());
    return { ok: true };
  }

  /** running | queued (behind another job here) | power | fuel */
  jobStatus(j) {
    if (j.state === 'running') return { state: 'running', start: j.start, end: j.end };
    const here = this.jobsAt(j.station);
    if (here[0] !== j) return { state: 'queued' };
    const draw = this.drawOf(j.station);
    if (this.powerUsed() + draw > this.powerCap()) return { state: 'power', need: draw, free: Math.max(0, this.powerFree()) };
    const fuel = RECIPES[j.recipe].fuel;
    if (this.s.res.fuel < fuel) return { state: 'fuel', need: fuel };
    return { state: 'queued' };
  }

  /** Start every waiting job that can start at time t (oldest first). */
  _pump(t) {
    const waiting = this.s.jobs.filter((j) => j.state === 'waiting').sort((a, b) => a.uid - b.uid);
    let started = false;
    for (const j of waiting) {
      const here = this.jobsAt(j.station);
      if (here[0] !== j) continue; // one job at a time per station, in queue order
      const draw = this.drawOf(j.station);
      const fuel = RECIPES[j.recipe].fuel;
      if (this.powerUsed() + draw > this.powerCap()) continue;
      if (this.s.res.fuel < fuel) continue;
      if (j.recipe === YARD_JOB && this.yardPile(t) >= this.yardStore() - 1e-6) continue;
      this.s.res.fuel -= fuel;
      this.s.stats.fuelSpent += fuel;
      j.fuelPaid = fuel;
      j.state = 'running';
      j.start = t;
      if (j.recipe === YARD_JOB) {
        this.s.yard.at = t;
        j.end = t + ((this.yardStore() - this.s.yard.pile) / this.yardRate()) * HOUR_MS;
      } else j.end = t + this.craftSeconds(j.recipe) * 1000;
      this.emit({ type: 'jobStart', uid: j.uid, recipe: j.recipe, station: j.station, t });
      started = true;
    }
    if (started) this.changed();
  }

  _completeJob(uid, t) {
    const i = this.s.jobs.findIndex((x) => x.uid === uid);
    if (i < 0) return;
    const j = this.s.jobs[i];
    this.s.jobs.splice(i, 1);
    if (j.recipe === YARD_JOB) {
      this.s.yard.pile = this.yardStore();
      this.emit({ type: 'yardFull', t });
    } else {
      const out = RECIPES[j.recipe].output;
      this.s.crate[out.item] = (this.s.crate[out.item] || 0) + out.count;
      this.s.stats.crafted += out.count;
      this.emit({ type: 'crafted', recipe: j.recipe, item: out.item, t });
    }
    this.changed();
  }

  // --- Scrap Yard -----------------------------------------------------------------------------------------------

  yardRate() {
    return this.row(YARD).scrapPerHour;
  }

  yardStore() {
    return this.yardRate() * STATIONS[YARD].storeHours;
  }

  _yardRun() {
    return this.s.jobs.find((j) => j.recipe === YARD_JOB) || null;
  }

  /** Scrap waiting in the yard at time t (pure). */
  yardPile(t = this.now()) {
    const y = this.s.yard;
    const run = this._yardRun();
    let pile = y.pile;
    if (run && run.state === 'running') {
      const from = Math.max(y.at, run.start);
      if (t > from) pile = Math.min(this.yardStore(), pile + (this.yardRate() * (t - from)) / HOUR_MS);
    }
    return pile;
  }

  _settleYard(t) {
    const y = this.s.yard;
    if (this.level(YARD) === 0) return;
    y.pile = this.yardPile(t);
    if (t > y.at) y.at = t;
  }

  /** After a level-up or a collect: a running yard fills up at the new pace. */
  _retimeYard(t) {
    const run = this._yardRun();
    if (run && run.state === 'running') run.end = t + ((this.yardStore() - this.s.yard.pile) / this.yardRate()) * HOUR_MS;
  }

  _queueYardRun() {
    if (this._yardRun()) return;
    this.s.jobs.push({ uid: this.s.uid++, station: YARD, recipe: YARD_JOB, state: 'waiting', queued: this.now(), start: 0, end: 0, paid: {}, fuelPaid: 0 });
    this.changed();
  }

  /** locked | running | waiting (for power/Fuel) | full | stopped */
  yardInfo() {
    const level = this.level(YARD);
    if (!level) return { level: 0, state: 'locked' };
    const run = this._yardRun();
    const pile = this.yardPile();
    const store = this.yardStore();
    let state;
    if (run && run.state === 'running') state = 'running';
    else if (run) state = 'waiting';
    else if (pile >= store - 1e-6) state = 'full';
    else state = 'stopped';
    return { level, rate: this.yardRate(), store, pile, frac: store ? pile / store : 0, state, run, status: run ? this.jobStatus(run) : null, auto: this.s.yard.auto };
  }

  /** One tap: bank the pile; a yard that stopped because it was full starts its next run. */
  collectYard() {
    if (!this.level(YARD)) return fail('locked');
    const now = this.now();
    this._settleYard(now);
    const y = this.s.yard;
    const whole = Math.floor(y.pile);
    if (whole <= 0) return fail('empty');
    y.pile -= whole;
    this.grant({ scrap: whole }, 'yard');
    this.s.stats.yardScrap += whole;
    const run = this._yardRun();
    if (run) this._retimeYard(now);
    else if (y.auto) {
      this._queueYardRun();
      this._pump(now);
    }
    this.emit({ type: 'yardCollect', got: whole });
    this.changed();
    return { ok: true, got: whole, state: this.yardInfo().state };
  }

  startYard() {
    if (!this.level(YARD)) return fail('locked');
    if (this._yardRun()) return fail('busy');
    if (this.yardPile() >= this.yardStore() - 1e-6) return fail('full');
    this.s.yard.auto = true;
    this._settleYard(this.now());
    this._queueYardRun();
    this._pump(this.now());
    this.changed();
    return { ok: true, state: this.yardInfo().state };
  }

  /** Free the yard's power for crafts. The pile stays; the Fuel already burned does not come back. */
  stopYard() {
    const run = this._yardRun();
    if (!run) return fail('idle');
    const now = this.now();
    this._settleYard(now);
    this.s.jobs.splice(this.s.jobs.indexOf(run), 1);
    this.s.yard.auto = false;
    this.emit({ type: 'yardStop' });
    this.changed();
    this._pump(now);
    return { ok: true };
  }

  // --- Loadout and the Armory --------------------------------------------------------------------------------------

  weaponsUnlocked() {
    const out = [...BASE_WEAPONS];
    for (let l = 1; l <= this.level('armory'); l++) {
      const w = STATIONS.armory.levels[l - 1].weapon;
      if (w && !out.includes(w)) out.push(w);
    }
    return WEAPON_ORDER.filter((w) => out.includes(w));
  }

  weaponTier(id) {
    return this.s.weapons[id] || 1;
  }

  maxTier() {
    return this.row('armory').maxTier;
  }

  attachments() {
    const out = [];
    for (let l = 1; l <= this.level('workshop'); l++) {
      const a = STATIONS.workshop.levels[l - 1].attachment;
      if (a) out.push(a);
    }
    return out;
  }

  attachMult() {
    return this.attachments().reduce((m, a) => m * ATTACHMENTS[a].mult, 1);
  }

  weaponPower(id, tier = this.weaponTier(id), attach = this.attachMult()) {
    return WEAPONS[id].power * WEAPON_TIERS[tier - 1].mult * attach;
  }

  bestWeapon() {
    let best = BASE_WEAPONS[0];
    for (const w of this.weaponsUnlocked()) if (this.weaponPower(w) >= this.weaponPower(best)) best = w;
    return best;
  }

  /** Armory level that allows weapon tier `tier`. */
  armoryForTier(tier) {
    const i = STATIONS.armory.levels.findIndex((r) => r.maxTier >= tier);
    return i < 0 ? null : i + 1;
  }

  weaponUpgradeInfo(id) {
    const tier = this.weaponTier(id);
    const next = WEAPON_TIERS[tier];
    const info = { id, tier, next: next || null, blockers: [], canStart: false };
    if (!this.weaponsUnlocked().includes(id)) info.blockers.push({ type: 'locked' });
    if (!next) {
      info.maxed = true;
      return info;
    }
    if (next.tier > this.maxTier()) info.blockers.push({ type: 'armory', need: this.armoryForTier(next.tier) });
    info.missing = this.missingFor(next.cost);
    if (Object.keys(info.missing).length) info.blockers.push({ type: 'resources', missing: info.missing });
    info.canStart = info.blockers.length === 0;
    return info;
  }

  /** Weapon upgrades are instant: the Armory runs no jobs. */
  upgradeWeapon(id) {
    const info = this.weaponUpgradeInfo(id);
    if (info.maxed) return fail('maxed');
    if (info.blockers.length) return fail(info.blockers[0].type, { blocker: info.blockers[0] });
    this._pay(info.next.cost);
    this.s.weapons[id] = info.next.tier;
    this.emit({ type: 'weaponUp', weapon: id, tier: info.next.tier });
    this.changed();
    return { ok: true, tier: info.next.tier };
  }

  /** Crate items for a slot, weakest first. */
  itemsFor(slot) {
    return Object.keys(ITEMS)
      .filter((id) => ITEMS[id].slot === slot && !ITEMS[id].free)
      .map((id) => ({ id, ...ITEMS[id], have: this.crateCount(id) }));
  }

  /**
   * What you carry into the next mission. A slot set to null picks the best
   * item in stock; 'none' leaves it empty. The heal slot always has at
   * least the free bandage.
   */
  resolvedLoadout() {
    const L = this.s.loadout;
    const unlocked = this.weaponsUnlocked();
    const out = { weapon: L.weapon && unlocked.includes(L.weapon) ? L.weapon : this.bestWeapon(), throwable: null, heal: FREE_HEAL, boost: null };
    for (const slot of SLOTS) {
      const want = L[slot];
      let pick = null;
      if (want === 'none' || want === FREE_HEAL) pick = null;
      else if (want && ITEMS[want] && ITEMS[want].slot === slot && this.crateCount(want) > 0) pick = want;
      else {
        const stock = this.itemsFor(slot).filter((x) => x.have > 0);
        pick = stock.length ? stock[stock.length - 1].id : null;
      }
      out[slot] = pick || (slot === 'heal' ? FREE_HEAL : null);
    }
    return out;
  }

  setSlot(slot, value) {
    if (!SLOTS.includes(slot)) return fail('slot');
    if (value !== 'auto' && value !== 'none' && value !== FREE_HEAL && !(ITEMS[value] && ITEMS[value].slot === slot)) return fail('item');
    this.s.loadout[slot] = value === 'auto' ? null : value;
    this.changed();
    return { ok: true };
  }

  setWeapon(id) {
    if (id !== null && !this.weaponsUnlocked().includes(id)) return fail('locked');
    this.s.loadout.weapon = id;
    this.changed();
    return { ok: true };
  }

  presetSlots() {
    return this.row('armory').presets;
  }

  savePreset(i) {
    if (i < 0 || i >= this.presetSlots()) return fail('locked');
    this.s.presets[i] = { ...this.s.loadout };
    this.changed();
    return { ok: true };
  }

  applyPreset(i) {
    const p = this.s.presets[i];
    if (i < 0 || i >= this.presetSlots() || !p) return fail('empty');
    this.s.loadout = { ...p };
    this.changed();
    return { ok: true };
  }

  // --- Survivors and the squad ------------------------------------------------------------------------------------

  survivorState(id) {
    return this.s.survivors[id].state;
  }

  housed() {
    return SURVIVOR_ORDER.filter((id) => this.s.survivors[id].state === 'housed');
  }

  /** Rescued, waiting for a bunk. */
  waiting() {
    return SURVIVOR_ORDER.filter((id) => this.s.survivors[id].state === 'waiting');
  }

  bunks() {
    return this.row('barracks').bunks;
  }

  freeBunks() {
    return this.bunks() - this.housed().length;
  }

  /** Bunks a rescue call may fill: story survivors already rescued come first. */
  callBunks() {
    return this.freeBunks() - this.waiting().length;
  }

  bondLevel(id) {
    const xp = this.s.survivors[id].xp;
    let l = 0;
    for (let i = 1; i < BOND.levels.length; i++) if (xp >= BOND.levels[i]) l = i;
    return l;
  }

  bondInfo(id) {
    const level = this.bondLevel(id);
    const xp = this.s.survivors[id].xp;
    const cur = BOND.levels[level];
    const next = BOND.levels[level + 1];
    return { level, name: BOND.names[level], xp, cur, next: next ?? null, frac: next ? (xp - cur) / (next - cur) : 1 };
  }

  perkValue(id) {
    const p = SURVIVORS[id].perk;
    return p.values[this.bondLevel(id) >= BOND.perkUpAt ? 1 : 0];
  }

  veteranOn() {
    return !!this.row('barracks').perkSlot;
  }

  /** Companions in the squad: your picks first, then everyone else at home. */
  squadIds() {
    const slots = SQUAD_SIZE - 1 - (this.s.friend ? 1 : 0);
    const home = this.housed();
    const picked = this.s.squad.filter((id) => home.includes(id));
    const rest = home.filter((id) => !picked.includes(id));
    return [...picked, ...rest].slice(0, slots);
  }

  /** Put a survivor in the squad (the last one in it moves to reserve). */
  pickSurvivor(id) {
    if (this.survivorState(id) !== 'housed') return fail('notHoused');
    const order = [id, ...this.squadIds().filter((x) => x !== id)];
    this.s.squad = order;
    this.changed();
    return { ok: true };
  }

  setFriend(kind) {
    if (kind !== null && !FRIENDS[kind]) return fail('friend');
    this.s.friend = kind;
    this.changed();
    return { ok: true };
  }

  yourPower() {
    const L = this.resolvedLoadout();
    return POWER.you * this.tuning.skill + this.weaponPower(L.weapon);
  }

  friendPower(kind) {
    const f = FRIENDS[kind];
    return POWER.friend + WEAPONS[f.weapon].power * WEAPON_TIERS[f.tier - 1].mult;
  }

  /** The four in the next mission: you, a friend (if any), survivors, then bots. */
  squad() {
    const L = this.resolvedLoadout();
    const out = [
      {
        kind: 'you',
        id: 'you',
        name: 'You',
        power: this.yourPower(),
        weapon: L.weapon,
        tier: this.weaponTier(L.weapon),
        items: { throwable: L.throwable, heal: L.heal, boost: L.boost },
        own: true,
      },
    ];
    if (this.s.friend) {
      const f = FRIENDS[this.s.friend];
      out.push({ kind: 'friend', id: this.s.friend, name: f.name, power: this.friendPower(this.s.friend), weapon: f.weapon, tier: f.tier, items: { ...f.items }, own: false });
    }
    for (const id of this.squadIds()) {
      const bond = this.bondLevel(id);
      out.push({ kind: 'survivor', id, name: SURVIVORS[id].short, power: POWER.survivor + POWER.perBond * bond, bond });
    }
    while (out.length < SQUAD_SIZE) out.push({ kind: 'bot', id: 'bot', name: 'Bot', power: POWER.bot });
    return out;
  }

  /** Co-op: the squad uses the best starting temp health and Well Rested bonus among its humans. */
  sharedStrengths() {
    const mine = { tempHp: this.row('infirmary').tempHp || 0, rested: this.row('barracks').rested || 0 };
    const out = { tempHp: mine.tempHp, rested: mine.rested, tempFrom: 'you', restedFrom: 'you', mine };
    if (this.s.friend) {
      const f = FRIENDS[this.s.friend];
      const ft = this.row('infirmary', f.infirmary).tempHp || 0;
      const fr = this.row('barracks', f.barracks).rested || 0;
      if (ft > out.tempHp) {
        out.tempHp = ft;
        out.tempFrom = this.s.friend;
      }
      if (fr > out.rested) {
        out.rested = fr;
        out.restedFrom = this.s.friend;
      }
    }
    return out;
  }

  /** Perks of the survivors in a squad, by perk id. */
  squadPerks(members = this.squad()) {
    const P = { medic: 0, chemist: 0, overwatch: 0, siphon: 0, scavenger: 0, triage: 0, improvised: 0, steady: 0, backroads: 0, shortcut: 0 };
    const vet = this.veteranOn();
    for (const m of members) {
      if (m.kind !== 'survivor') continue;
      const def = SURVIVORS[m.id];
      P[def.perk.id] = Math.max(P[def.perk.id], this.perkValue(m.id));
      if (vet) P[def.veteran.id] = Math.max(P[def.veteran.id], def.veteran.value);
    }
    return P;
  }

  /** What a survivor says in the Barracks about the latest mission. */
  survivorLine(id) {
    const sv = this.s.survivors[id];
    const lines = LINES[id];
    if (sv.state === 'waiting') return lines.waiting;
    const last = this.s.last;
    const idx = (this.s.stats.missions + SURVIVOR_ORDER.indexOf(id)) | 0;
    const from = (list) => (Array.isArray(list) ? list[idx % list.length] : list);
    if (!last || !last.squad.includes(id)) return from(lines.idle);
    if (last.first) return lines.first;
    if (!last.won) return from(lines.wipe);
    if (last.healed) return from(lines.close);
    if (last.thrown) return from(lines.throw);
    return from(lines.win);
  }

  _rescue(id, summary, t) {
    const sv = this.s.survivors[id];
    if (sv.state !== 'unknown') return;
    if (this.freeBunks() > 0) {
      sv.state = 'housed';
      sv.since = t;
      summary.movedIn.push(id);
    } else {
      sv.state = 'waiting';
      summary.rescued.push(id);
    }
    summary.scenes.push(`rescue_${id}`);
    this.emit({ type: 'rescued', id, waiting: sv.state === 'waiting' });
  }

  /** A Barracks upgrade finished: survivors waiting for a bunk move in. */
  _houseWaiting(t) {
    for (const id of this.waiting()) {
      if (this.freeBunks() <= 0) break;
      const sv = this.s.survivors[id];
      sv.state = 'housed';
      sv.since = t;
      this.emit({ type: 'movedIn', id, t });
    }
  }

  // --- Missions -------------------------------------------------------------------------------------------------------

  /** MissionLoadout: what the Safehouse hands the game (and the simulator). */
  missionLoadout(id) {
    const M = this.missionDef(id);
    const members = this.squad();
    const shared = this.sharedStrengths();
    const perks = this.squadPerks(members);
    const tempPower = shared.tempHp * POWER.perTempHp * members.length;
    const power = Math.round(members.reduce((a, m) => a + m.power, 0) + tempPower);
    return { mission: M, members, shared, perks, power, tempPower, friend: this.s.friend, firstClear: !!M && M.kind === 'story' && !this.s.won[id] };
  }

  /** Clear chance for the prep screen (deterministic estimate, cached per state). */
  odds(id, runs = 300) {
    if (this._oddsRev !== this.rev) {
      this._odds.clear();
      this._oddsRev = this.rev;
    }
    const key = `${id}|${runs}|${this.tuning.skill}`;
    if (!this._odds.has(key)) {
      const L = this.missionLoadout(id);
      const o = estimateOdds(L, { runs, outcome: this.tuning.outcome === 'auto' ? 'auto' : this.tuning.outcome });
      if (this.s.stats.missions === 0) o.clear = 1;
      this._odds.set(key, { ...o, power: L.power });
    }
    return this._odds.get(key);
  }

  /** Simulate without banking. The UI plays it, moves the clock on, then calls applyMission(). */
  planMission(id, { outcome = this.tuning.outcome, seed } = {}) {
    const M = this.missionDef(id);
    if (!M) return fail('mission');
    if (!this.missionOpen(id)) return fail('locked');
    const loadout = this.missionLoadout(id);
    const report = simulateMission({
      loadout,
      outcome,
      seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed,
      forceWin: this.s.stats.missions === 0, // the very first mission always makes it home
      lootMult: this.tuning.loot,
    });
    report.mission = { id: M.id, kind: M.kind, who: M.who || null, chapter: M.chapter, index: M.index, finale: M.finale, name: M.name };
    return { ok: true, report, loadout };
  }

  /** Plan and bank in one go (tests, balance sim). */
  playMission(id, opts = {}) {
    const r = this.planMission(id, opts);
    if (r.ok) r.summary = this.applyMission(r.report);
    return r;
  }

  /** Bank a MissionReport (from the simulator now, from the real game later). */
  applyMission(r) {
    const now = this.now();
    const st = this.s.stats;
    const M = r.mission || this.missionDef(r.missionId);
    const first = st.missions === 0;
    st.missions++;
    st.kills += r.kills || 0;
    st.safeRooms += r.sectionsCleared || 0;
    st.fuelCans += r.fuelCans || 0;
    if (r.won) st.wins++;
    else st.wipes++;
    this.s.runs[r.missionId] = (this.s.runs[r.missionId] || 0) + 1;

    // Used items leave the crate; everything else simply stays in it.
    for (const [item, n] of Object.entries(r.itemsUsed || {})) {
      const take = Math.min(n, this.crateCount(item));
      this.s.crate[item] = this.crateCount(item) - take;
      st.itemsUsed += take;
    }

    const g = this.grant(r.banked, 'mission');
    const summary = { got: g.got, over: g.over, overflowScrap: g.scrap, rescued: [], movedIn: [], scenes: [], bondUps: [], bondStory: null, chapterCleared: null, firstWin: false, ordersDone: [] };

    if (M.kind === 'story' && r.won) {
      summary.firstWin = !this.s.won[M.id];
      this.s.won[M.id] = (this.s.won[M.id] || 0) + 1;
      if (summary.firstWin && M.finale) {
        summary.chapterCleared = M.chapter;
        this.emit({ type: 'chapter', n: M.chapter });
        const ch = CHAPTERS[M.chapter - 1];
        if (ch.rescue) this._rescue(ch.rescue, summary, now);
      }
    }
    if (M.kind === 'rescue' && r.won) this._rescue(M.who, summary, now);

    // Bonds grow with missions played side by side; Well Rested speeds them up.
    const gain = Math.round(BOND.xpPerMission * (r.won ? 1 : BOND.wipeShare) * (1 + (r.rested || 0) / 100));
    const squadIds = (r.squad && r.squad.survivors) || [];
    for (const id of squadIds) this._addBond(id, gain, summary);
    if (M.kind === 'bond' && r.won && !this.s.survivors[M.who].bondDone) {
      this.s.survivors[M.who].bondDone = true;
      summary.bondStory = M.who;
      this._addBond(M.who, BOND.bondChapterXp, summary);
    }
    summary.bondXp = squadIds.length ? gain : 0;

    this.s.last = { won: r.won, healed: r.healed || 0, thrown: r.thrown || 0, first, squad: squadIds, at: now, mission: M.id };
    this._orderProgress(r, summary);
    this.emit({ type: 'mission', id: M.id, won: r.won });
    this._checkStage(now);
    this.changed();
    return summary;
  }

  _addBond(id, xp, summary) {
    const sv = this.s.survivors[id];
    const before = this.bondLevel(id);
    sv.xp += xp;
    const after = this.bondLevel(id);
    if (after > before) {
      summary.bondUps.push({ id, level: after, perkUp: before < BOND.perkUpAt && after >= BOND.perkUpAt });
      this.emit({ type: 'bondUp', id, level: after });
    }
  }

  // --- Radio Room daily orders -------------------------------------------------------------------------------------------

  orders() {
    return this.s.orders.list;
  }

  orderText(o) {
    const def = ORDERS.types.find((x) => x.type === o.type);
    const t = o.n === 1 && def.textOne ? def.textOne : def.text;
    return t.replace('{n}', String(o.n)).replace('{who}', o.who ? SURVIVORS[o.who].short : 'a survivor');
  }

  _newOrder(t) {
    const list = this.s.orders.list;
    if (list.length >= ORDERS.max) return null;
    const have = new Set(list.map((o) => o.type));
    const pool = ORDERS.types.filter((x) => !have.has(x.type));
    const def = pool[Math.floor(this.rng() * pool.length)] || ORDERS.types[0];
    const n = def.n[Math.floor(this.rng() * def.n.length)];
    let who = null;
    if (def.type === 'with') {
      const home = this.housed();
      who = home[Math.floor(this.rng() * home.length)] || 'nadia';
    }
    const scale = this.row('radio').orderScale || 1;
    const reward = {};
    for (const [r, v] of Object.entries(ORDERS.reward)) reward[r] = Math.round(v * scale);
    const o = { uid: this.s.uid++, type: def.type, n, who, progress: 0, done: false, at: t, reward };
    list.push(o);
    this.emit({ type: 'orderNew', uid: o.uid, t });
    this.changed();
    return o;
  }

  _orderArrives(t) {
    this._newOrder(t);
    this.s.orders.nextAt = nextMidnight(t);
  }

  _orderProgress(r, summary) {
    for (const o of this.s.orders.list) {
      if (o.done) continue;
      let add = 0;
      if (o.type === 'wins') add = r.won ? 1 : 0;
      else if (o.type === 'saferooms') add = r.sectionsCleared || 0;
      else if (o.type === 'throwables') add = r.thrown || 0;
      else if (o.type === 'fuelcans') add = r.fuelCans > 0 ? 1 : 0;
      else if (o.type === 'noheal') add = r.won && !r.healed ? 1 : 0;
      else if (o.type === 'with') add = r.won && r.squad && r.squad.survivors.includes(o.who) ? 1 : 0;
      else if (o.type === 'kills') add = r.kills || 0;
      o.progress = Math.min(o.n, o.progress + add);
      if (o.progress >= o.n) {
        o.done = true;
        summary.ordersDone.push(o.uid);
        this.emit({ type: 'orderDone', uid: o.uid });
      }
    }
  }

  claimOrder(uid) {
    const list = this.s.orders.list;
    const i = list.findIndex((o) => o.uid === uid);
    if (i < 0) return fail('none');
    const o = list[i];
    if (!o.done) return fail('notDone');
    list.splice(i, 1);
    this.s.stats.ordersDone++;
    const g = this.grant(o.reward, 'order');
    this.emit({ type: 'orderClaim', uid, got: g.got });
    this.changed();
    return { ok: true, got: g.got, over: g.over, overflowScrap: g.scrap };
  }

  // --- Progression flow -------------------------------------------------------------------------------------------------------

  goalDone(g) {
    if (g.level) return this.level(g.level[0]) >= g.level[1];
    if (g.crafted) return this.s.stats.crafted >= g.crafted;
    if (g.housed) return this.housed().length >= g.housed;
    return false;
  }

  goalFocus(g) {
    if (g.focus) return g.focus;
    if (g.level) return g.level[0];
    if (g.housed) return this.waiting().length ? 'barracks' : 'play';
    return 'play';
  }

  /** The stage in progress, its goals and the next step (null once all stages are done). */
  stageInfo() {
    const i = this.s.stage;
    const def = STAGES[i];
    if (!def) return null;
    const goals = def.goals.map((g) => ({ text: g.text, done: this.goalDone(g), focus: this.goalFocus(g), g }));
    return { index: i, def, goals, next: goals.find((g) => !g.done) || null, total: STAGES.length };
  }

  _checkStage(t) {
    while (this.s.stage < STAGES.length && STAGES[this.s.stage].goals.every((g) => this.goalDone(g))) {
      this.s.stage++;
      this.s.stageLog.push({ stage: this.s.stage, t: t - this.s.created, play: this.s.playMs, missions: this.s.stats.missions });
      this.emit({ type: 'stage', index: this.s.stage, t });
      this.changed();
    }
  }

  // --- Time ---------------------------------------------------------------------------------------------------------------------

  /** Earliest due timer (build, job or daily order) at or before `now`. */
  _nextDue(now) {
    let best = null;
    for (const id of STATION_ORDER) {
      const b = this.s.stations[id].build;
      if (b && b.end <= now && (!best || b.end < best.t)) best = { t: b.end, kind: 'build', id };
    }
    for (const j of this.s.jobs) if (j.state === 'running' && j.end <= now && (!best || j.end < best.t)) best = { t: j.end, kind: 'job', uid: j.uid };
    const o = this.s.orders;
    if (this.level('radio') > 0 && o.nextAt && o.nextAt <= now && (!best || o.nextAt < best.t)) best = { t: o.nextAt, kind: 'order' };
    return best;
  }

  /**
   * Finish everything that is due, in the order it happened, and start
   * waiting jobs at the moment power or Fuel freed up. Idempotent, and exact
   * after any absence (offline progress).
   */
  tick() {
    const now = this.now();
    for (let guard = 0; guard < 20000; guard++) {
      const ev = this._nextDue(now);
      if (!ev) break;
      this._settleYard(ev.t);
      if (ev.kind === 'build') this._completeBuild(ev.id, ev.t);
      else if (ev.kind === 'job') this._completeJob(ev.uid, ev.t);
      else this._orderArrives(ev.t);
      this._pump(ev.t);
      this._checkStage(ev.t);
    }
    this._settleYard(now);
    this._pump(now);
    if (this.waiting().length && this.freeBunks() > 0) this._houseWaiting(now); // e.g. an imported save
    this._checkStage(now);
  }

  /** Soonest build to finish (for the build-finished notification). */
  nextBuildEnd() {
    const b = this.builds()[0];
    return b ? b : null;
  }

  // --- Dev cheats (tuning panel) ---------------------------------------------------------------------------------------------------

  cheat(loot) {
    for (const r of RESOURCES) if (loot[r]) this.s.res[r] += loot[r];
    this.changed();
    this._pump(this.now());
  }

  finishAll() {
    const now = this.now();
    for (const id of STATION_ORDER) {
      const b = this.s.stations[id].build;
      if (b) b.end = Math.min(b.end, now);
    }
    for (const j of this.s.jobs) if (j.state === 'running') j.end = Math.min(j.end, now);
    this.tick();
    this.changed();
  }

  /** Clear the next chapter outright (story rescues included). */
  clearNextChapter() {
    const n = CHAPTERS.find((ch) => !this.isCleared(ch.n));
    if (!n) return fail('done');
    const summary = { rescued: [], movedIn: [], scenes: [] };
    for (let i = 1; i <= 3; i++) this.s.won[`c${n.n}m${i}`] = Math.max(1, this.s.won[`c${n.n}m${i}`] || 0);
    if (n.rescue) this._rescue(n.rescue, summary, this.now());
    this.emit({ type: 'chapter', n: n.n });
    this._checkStage(this.now());
    this.changed();
    return { ok: true, n: n.n, summary };
  }

  addBondXp(xp) {
    const summary = { bondUps: [] };
    for (const id of this.housed()) this._addBond(id, xp, summary);
    this.changed();
    return summary;
  }
}
