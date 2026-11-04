// Safehouse rules (simple version): the save state and everything that
// changes it. No DOM: the clock and the RNG are injected, so the same code
// runs in the browser and in the tests.
//
// - One resource: Scrap. Missions bring it home; rooms and crafts spend it.
// - Four stations, three levels each. One upgrade runs at a time; the first
//   level of a station is instant. Every level adds squad strength.
// - The Workshop and the Infirmary craft one item at a time into the crate
//   (up to 3 of each kind). A mission takes the best of each kind along.
// - Missions are played in order. Chapter finales rescue a survivor, who
//   moves in once the Barracks has a bunk for them.
// - Nothing decays and nothing is lost: timers also finish while you're away.

import {
  START_SCRAP,
  STATIONS,
  STATION_ORDER,
  BASE_CHAPTERS,
  STRENGTH_PER_LEVEL,
  MEMBERS,
  SQUAD_SIZE,
  ITEMS,
  CRATE_MAX,
  SURVIVORS,
  SURVIVOR_ORDER,
  MISSIONS,
} from './config.js';
import { simulateMission, estimateOdds } from './mission-sim.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });
export const CRAFTERS = ['workshop', 'infirmary'];
const KIND = { workshop: 'throw', infirmary: 'heal' };

export function newState(now) {
  const levels = {};
  for (const id of STATION_ORDER) levels[id] = STATIONS[id].start || 0;
  const crate = {};
  for (const id of Object.keys(ITEMS)) crate[id] = 0;
  return {
    v: 2,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    intro: false,
    scrap: START_SCRAP,
    levels,
    build: null, // { id, to, start, end }
    crafts: { workshop: null, infirmary: null }, // { item, start, end }
    crate,
    survivors: { nadia: 'home', theo: 'unknown', grace: 'unknown' }, // unknown | waiting (for a bunk) | home
    cleared: 0, // missions cleared, in order
    stats: { missions: 0, wins: 0, wipes: 0, scrapEarned: 0, crafted: 0 },
    playMs: 0,
  };
}

export class Safehouse {
  constructor(state, { clock, rng = Math.random, tuning = {} } = {}) {
    this.s = state;
    this.clock = clock;
    this.rng = rng;
    this.tuning = tuning;
    this.events = [];
    this.rev = 0;
    this._odds = { rev: -1, value: 0 };
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

  level(id) {
    return this.s.levels[id];
  }

  row(id, lvl = this.level(id)) {
    return lvl > 0 ? STATIONS[id].levels[lvl - 1] : null;
  }

  maxLevel(id) {
    return STATIONS[id].levels.length;
  }

  // --- Upgrades ----------------------------------------------------------------------------------

  upgradeInfo(id) {
    const lvl = this.level(id);
    const info = { id, level: lvl, max: this.maxLevel(id), maxed: lvl >= this.maxLevel(id), canStart: false, why: '' };
    if (info.maxed) {
      info.why = 'Max level';
      return info;
    }
    const next = STATIONS[id].levels[lvl];
    Object.assign(info, { next: lvl + 1, cost: next.cost, time: next.time, row: next });
    const b = this.s.build;
    if (b && b.id === id) info.why = 'Already upgrading';
    else if (b && next.time > 0) info.why = `One upgrade at a time: the ${STATIONS[b.id].name} is upgrading`;
    else if (this.s.scrap < next.cost) info.why = `Need ${Math.ceil(next.cost - this.s.scrap)} more Scrap`;
    info.canStart = !info.why;
    return info;
  }

  startUpgrade(id) {
    const info = this.upgradeInfo(id);
    if (!info.canStart) return fail(info.maxed ? 'maxed' : 'blocked', { why: info.why });
    this.s.scrap -= info.cost;
    const now = this.now();
    if (info.time <= 0) {
      this._levelUp(id, now);
      this.changed();
      return { ok: true, instant: true };
    }
    this.s.build = { id, to: info.next, start: now, end: now + info.time * 1000 };
    this.emit({ type: 'buildStart', id, level: info.next });
    this.changed();
    return { ok: true, instant: false, end: this.s.build.end };
  }

  _levelUp(id, t) {
    const from = this.s.levels[id];
    this.s.levels[id] = from + 1;
    this.emit({ type: 'built', id, level: from + 1, first: from === 0, t });
    if (id === 'barracks') this._houseWaiting(t);
    const row = this.row(id);
    if (row.item) this.emit({ type: 'newItem', item: row.item });
    if (row.chapters) this.emit({ type: 'chapter', n: row.chapters });
  }

  // --- Crafting ------------------------------------------------------------------------------------

  /** Items of a kind ('throw' | 'heal') in the crate. */
  stock(kind) {
    let n = 0;
    for (const [id, c] of Object.entries(this.s.crate)) if (ITEMS[id].kind === kind) n += c;
    return n;
  }

  craftInfo(id) {
    const lvl = this.level(id);
    if (!lvl) return { id, built: false, canStart: false, why: 'Build it first' };
    const item = this.row(id).item;
    const it = ITEMS[item];
    const running = this.s.crafts[id];
    const have = this.stock(it.kind);
    const info = { id, built: true, item, cost: it.cost, time: it.time, have, max: CRATE_MAX, running, canStart: false, why: '' };
    if (running) info.why = `Already making a ${ITEMS[running.item].name.toLowerCase()}`;
    else if (have >= CRATE_MAX) info.why = `The crate is full (${CRATE_MAX})`;
    else if (this.s.scrap < it.cost) info.why = `Need ${Math.ceil(it.cost - this.s.scrap)} more Scrap`;
    info.canStart = !info.why;
    return info;
  }

  startCraft(id) {
    const info = this.craftInfo(id);
    if (!info.canStart) return fail('blocked', { why: info.why });
    this.s.scrap -= info.cost;
    const now = this.now();
    this.s.crafts[id] = { item: info.item, start: now, end: now + info.time * 1000 };
    this.emit({ type: 'craftStart', id, item: info.item });
    this.changed();
    this.tick();
    return { ok: true };
  }

  _finishCraft(id, t) {
    const c = this.s.crafts[id];
    this.s.crafts[id] = null;
    this.s.crate[c.item]++;
    this.s.stats.crafted++;
    this.emit({ type: 'crafted', id, item: c.item, t });
  }

  /** The best item of a kind in the crate (what the next mission takes along). */
  best(kind) {
    let best = null;
    for (const [id, c] of Object.entries(this.s.crate)) {
      if (c > 0 && ITEMS[id].kind === kind && (!best || ITEMS[id].effect > ITEMS[best].effect)) best = id;
    }
    return best;
  }

  // --- The squad ----------------------------------------------------------------------------------------

  bunks() {
    return this.row('barracks').bunks;
  }

  home() {
    return SURVIVOR_ORDER.filter((id) => this.s.survivors[id] === 'home');
  }

  waiting() {
    return SURVIVOR_ORDER.filter((id) => this.s.survivors[id] === 'waiting');
  }

  /** You, the survivors with a bunk, then bots in the empty slots. */
  squad() {
    const out = [{ kind: 'you', id: 'you', name: 'You', power: MEMBERS.you }];
    for (const id of this.home()) out.push({ kind: 'survivor', id, name: SURVIVORS[id].name, power: MEMBERS.survivor });
    while (out.length < SQUAD_SIZE) out.push({ kind: 'bot', id: 'bot', name: 'Bot', power: MEMBERS.bot });
    return out.slice(0, SQUAD_SIZE);
  }

  levelsTotal() {
    let n = 0;
    for (const id of STATION_ORDER) n += this.level(id);
    return n;
  }

  strength() {
    const base = this.squad().reduce((a, m) => a + m.power, 0) + STRENGTH_PER_LEVEL * this.levelsTotal();
    const sharp = this.home().includes('grace') ? SURVIVORS.grace.sharp : 0;
    return Math.round(base * (1 + sharp));
  }

  perks() {
    const home = this.home();
    return { medic: home.includes('nadia') ? SURVIVORS.nadia.medic : 0, chemist: home.includes('theo') ? SURVIVORS.theo.chemist : 0 };
  }

  _rescue(id, t) {
    if (this.s.survivors[id] !== 'unknown') return null;
    this.s.survivors[id] = this.home().length < this.bunks() ? 'home' : 'waiting';
    this.emit({ type: 'rescued', id, waiting: this.s.survivors[id] === 'waiting', t });
    return this.s.survivors[id];
  }

  _houseWaiting(t) {
    for (const id of this.waiting()) {
      if (this.home().length >= this.bunks()) break;
      this.s.survivors[id] = 'home';
      this.emit({ type: 'movedIn', id, t });
    }
  }

  // --- Missions ------------------------------------------------------------------------------------------

  chaptersOpen() {
    return this.level('radio') ? this.row('radio').chapters : BASE_CHAPTERS;
  }

  /**
   * What PLAY starts: the next mission in order. While the Radio Room hasn't
   * opened its chapter (or after the last mission), PLAY replays the last
   * mission cleared, for Scrap.
   */
  nextMission() {
    const next = MISSIONS[this.s.cleared];
    if (next && next.chapter <= this.chaptersOpen()) return { mission: next, replay: false, lockedChapter: null, done: false };
    const last = MISSIONS[Math.max(0, this.s.cleared - 1)];
    return { mission: last, replay: true, lockedChapter: next ? next.chapter : null, done: !next };
  }

  loadout(mission = this.nextMission().mission) {
    return { mission, strength: this.strength(), throwable: this.best('throw'), heal: this.best('heal'), squad: this.home(), perks: this.perks() };
  }

  /** Chance to clear the next mission (estimated, cached until something changes). */
  odds() {
    if (this._odds.rev !== this.rev) {
      const forced = this.s.stats.missions === 0 || this.tuning.outcome === 'win' ? 1 : this.tuning.outcome === 'wipe' ? 0 : null;
      this._odds = { rev: this.rev, value: forced ?? estimateOdds(this.loadout()) };
    }
    return this._odds.value;
  }

  /** Simulate the next mission without banking it; the UI plays it back, then calls applyMission(). */
  planMission({ seed, outcome = this.tuning.outcome || 'auto' } = {}) {
    const { mission, replay } = this.nextMission();
    const loadout = this.loadout(mission);
    const report = simulateMission({
      loadout,
      seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed,
      outcome,
      forceWin: this.s.stats.missions === 0, // the very first mission always makes it home
    });
    report.replay = replay;
    return { ok: true, report, loadout };
  }

  playMission(opts = {}) {
    const r = this.planMission(opts);
    r.summary = this.applyMission(r.report);
    return r;
  }

  /** Bank a mission: Scrap from every safe room reached, used items leave the crate, progress and rescues. */
  applyMission(r) {
    const now = this.now();
    const st = this.s.stats;
    const M = MISSIONS.find((m) => m.id === r.missionId);
    st.missions++;
    if (r.won) st.wins++;
    else st.wipes++;
    this.s.scrap += r.scrap;
    st.scrapEarned += r.scrap;
    const used = Object.keys(r.used);
    for (const id of used) this.s.crate[id] = Math.max(0, this.s.crate[id] - 1);
    const summary = { scrap: r.scrap, used, firstClear: false, chapterDone: null, rescued: null, waiting: false, allDone: false };
    if (r.won && !r.replay && M.index === this.s.cleared) {
      this.s.cleared++;
      summary.firstClear = true;
      if (M.finale) summary.chapterDone = M.chapter;
      if (M.rescue && this._rescue(M.rescue, now)) {
        summary.rescued = M.rescue;
        summary.waiting = this.s.survivors[M.rescue] === 'waiting';
      }
      summary.allDone = this.s.cleared === MISSIONS.length;
    }
    this.emit({ type: 'mission', won: r.won, id: M.id });
    this.changed();
    return summary;
  }

  // --- Time -----------------------------------------------------------------------------------------------

  /** Finish every timer that is due, in the order it ended. Idempotent; exact after any absence. */
  tick() {
    const now = this.now();
    for (let guard = 0; guard < 100; guard++) {
      let due = null;
      const b = this.s.build;
      if (b && b.end <= now) due = { t: b.end, run: () => ((this.s.build = null), this._levelUp(b.id, b.end)) };
      for (const id of CRAFTERS) {
        const c = this.s.crafts[id];
        if (c && c.end <= now && (!due || c.end < due.t)) due = { t: c.end, run: () => this._finishCraft(id, c.end) };
      }
      if (!due) break;
      due.run();
      this.changed();
    }
  }

  // --- The next step -----------------------------------------------------------------------------------

  /** One line telling the player what to do next, and where ('play' or a station id). */
  hint() {
    const s = this.s;
    if (s.stats.missions === 0) return { text: 'Tap PLAY for your first mission', focus: 'play' };
    if (!this.level('workshop')) return { text: 'Build the Workshop: it makes throwables', focus: 'workshop' };
    if (!this.level('infirmary')) return { text: 'Build the Infirmary: it makes heals', focus: 'infirmary' };
    for (const id of CRAFTERS) {
      if (this.stock(KIND[id]) === 0 && !s.crafts[id] && this.craftInfo(id).canStart) {
        return { text: `Craft a ${ITEMS[this.row(id).item].name.toLowerCase()} for the next mission`, focus: id };
      }
    }
    // Opening the next chapter comes first: it's what lets the story go on.
    const nm = this.nextMission();
    if (nm.lockedChapter) {
      if (s.build && s.build.id === 'radio') return { text: `The Radio Room is finding Chapter ${nm.lockedChapter}. Replay missions for Scrap meanwhile`, focus: 'play' };
      if (!s.build) return { text: `Upgrade the Radio Room to reach Chapter ${nm.lockedChapter}`, focus: 'radio' };
    }
    const w = this.waiting()[0];
    if (w && !s.build) return { text: `${SURVIVORS[w].name} needs a bunk: upgrade the Barracks`, focus: 'barracks' };
    if (nm.lockedChapter) return { text: `Upgrades take time: the ${STATIONS[s.build.id].name} is busy. Replay missions for Scrap meanwhile`, focus: 'play' };
    if (nm.done) return { text: 'Every mission cleared! Replay for Scrap and max out the rooms', focus: 'play' };
    if (!s.build) {
      const ups = STATION_ORDER.map((id) => this.upgradeInfo(id)).filter((u) => u.canStart).sort((a, b) => a.cost - b.cost);
      if (ups.length && this.odds() < 0.75) return { text: `Upgrade the ${STATIONS[ups[0].id].name}: every level makes the squad stronger`, focus: ups[0].id };
    }
    return { text: 'Play the next mission', focus: 'play' };
  }

  // --- Dev cheats --------------------------------------------------------------------------------------------

  cheat(scrap) {
    this.s.scrap += scrap;
    this.changed();
  }

  finishAll() {
    const now = this.now();
    if (this.s.build) this.s.build.end = Math.min(this.s.build.end, now);
    for (const id of CRAFTERS) if (this.s.crafts[id]) this.s.crafts[id].end = Math.min(this.s.crafts[id].end, now);
    this.tick();
    this.changed();
  }
}
