// Station 9: state + rules. No DOM; clock and RNG are injected so the same code runs
// in the browser, the tests and the balance simulator.
//
// One loop, kept small on purpose:
//   strangers at the gate -> take them in (needs a bed)
//   PLAY -> you + up to three teammates -> the next run on the street
//   scrap -> upgrade a building; XP -> people level up; every few runs a building comes back
// Actions return { ok: true, ... } or { ok: false, reason }.

import {
  ROLES,
  ROLE_ORDER,
  TAGS,
  FAVORED_BONUS,
  SCOUT_SCRAP,
  MAX_LEVEL,
  XP_TO_NEXT,
  XP,
  SQUAD_SIZE,
  BUILDINGS,
  BUILDING_INDEX,
  MAX_FACILITY_LEVEL,
  GATE,
  STORY,
  STORY_TOTAL,
  FINALE_SCRAP,
  STAR_SCRAP,
  LOSS_SCRAP,
  RESCUE_ODDS,
  RUN_MINUTES,
  CONVOY,
  TUNING_DEFAULTS,
} from './config.js';
import { generatePerson, rollStars, basePower } from './people.js';
import { simulateRun, odds, riskOf } from './run-sim.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

export function nice(v) {
  if (v <= 0) return 0;
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 200) return Math.round(v / 5) * 5;
  return Math.round(v / 10) * 10;
}

export function newState(now, rng = Math.random) {
  const buildings = {};
  for (const b of BUILDINGS) if (!b.final) buildings[b.id] = b.start ? 1 : 0;
  const s = {
    v: 1,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    scrap: 0,
    people: [],
    nextId: 1,
    you: null, // the survivor you play, always in the crew
    crew: [], // last run's teammates (not you)
    candidates: [], // "who are you?" choices
    buildings,
    story: 0, // index of the next story run; STORY_TOTAL once the street is sealed
    stars: Array(STORY_TOTAL).fill(0),
    sealed: false,
    gate: { visitors: [], on: false, nextAt: 0 },
    convoy: { on: false, readyAt: 0, told: false },
    tut: { done: false, seen: {} }, // Mae: the guided start and one-time tips
    stats: { runs: 0, wins: 0, losses: 0, kills: 0, upgrades: 0, earned: 0, takenIn: 0, sentAway: 0, rests: 0, levelUps: 0, convoys: 0, visitors: 0, letGo: 0 },
    log: [], // pacing: { chain, runs, t, play } when each building comes back
    playMs: 0,
  };
  // Three people you could be: one of each role, all Skilled.
  for (const role of ROLE_ORDER) s.candidates.push(generatePerson(rng, { id: s.nextId++, stars: 2, role, origin: 'you', avoid: new Set(s.candidates.map((p) => p.first)) }));
  return s;
}

export class Meta {
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

  // --- People ------------------------------------------------------------------------------

  person(id) {
    return this.s.people.find((p) => p.id === id) || null;
  }

  you() {
    return this.person(this.s.you);
  }

  /** People strongest first, you on top. */
  roster() {
    return this.s.people.slice().sort((a, b) => (b.id === this.s.you) - (a.id === this.s.you) || basePower(b) - basePower(a) || a.id - b.id);
  }

  /** Teammates who can go out (not you, not resting). */
  available() {
    return this.roster().filter((p) => p.id !== this.s.you && p.rest <= 0);
  }

  power(p) {
    return basePower(p);
  }

  beds() {
    return BUILDINGS[BUILDING_INDEX.firehouse].values[this.s.buildings.firehouse - 1];
  }

  freeBeds() {
    return this.beds() - this.s.people.length;
  }

  xpToNext(p) {
    return p.level >= MAX_LEVEL ? null : XP_TO_NEXT[p.level - 1];
  }

  giveXp(p, amount) {
    if (p.level >= MAX_LEVEL || amount <= 0) return 0;
    p.xp += amount;
    let ups = 0;
    while (p.level < MAX_LEVEL && p.xp >= XP_TO_NEXT[p.level - 1]) {
      p.xp -= XP_TO_NEXT[p.level - 1];
      p.level++;
      ups++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    this.s.stats.levelUps += ups;
    return ups;
  }

  /** Pick who you are. The guided start does this first. */
  chooseYou(k) {
    if (this.s.you !== null) return fail('chosen');
    const p = this.s.candidates[k];
    if (!p) return fail('gone');
    p.origin = 'you';
    p.joined = 1;
    this.s.people.push(p);
    this.s.you = p.id;
    this.s.candidates = [];
    this.changed();
    return { ok: true, person: p };
  }

  /** Newcomers arrive a step behind your best people, so they're useful soon. */
  recruitLevel() {
    const lv = this.roster()
      .slice(0, 3)
      .map((p) => p.level)
      .sort((a, b) => a - b);
    if (!lv.length) return 1;
    return Math.max(1, Math.min(MAX_LEVEL - 1, lv[Math.floor((lv.length - 1) / 2)] - 1));
  }

  missingRoles() {
    const have = new Set(this.s.people.map((p) => p.role));
    return ROLE_ORDER.filter((r) => !have.has(r));
  }

  _newcomer({ odds: starOdds, origin, role = null, stars = null, level = this.recruitLevel() }) {
    const st = stars || rollStars(this.rng, starOdds);
    const avoid = new Set([...this.s.people, ...this.s.gate.visitors, ...this.s.candidates].map((p) => p.first));
    return generatePerson(this.rng, { id: this.s.nextId++, stars: st, role, level, prefer: this.missingRoles(), preferChance: 0.6, origin, avoid });
  }

  // --- The gate ------------------------------------------------------------------------------

  radio() {
    const l = this.s.buildings.radio;
    return l > 0 ? BUILDINGS[BUILDING_INDEX.radio].values[l - 1] : { every: GATE.every, odds: GATE.odds };
  }

  gateInterval() {
    return this.radio().every * 60 * 1000 * this.tuning.gate;
  }

  /** The gate opens for walk-ins once Mae has shown you around. */
  openGate() {
    const g = this.s.gate;
    if (g.on) return;
    g.on = true;
    g.nextAt = this.now() + this.gateInterval();
    this.changed();
  }

  gateInfo() {
    const g = this.s.gate;
    const full = g.visitors.length >= GATE.capacity;
    return { visitors: g.visitors, on: g.on, full, nextIn: g.on && !full ? Math.max(0, (g.nextAt - this.now()) / 1000) : null, interval: this.gateInterval() / 1000 };
  }

  _gateTick() {
    const g = this.s.gate;
    if (!g.on) return 0;
    const now = this.now();
    let n = 0;
    while (g.visitors.length < GATE.capacity && g.nextAt <= now) {
      const p = this._newcomer({ odds: this.radio().odds, origin: 'gate' });
      g.visitors.push(p);
      this.s.stats.visitors++;
      g.nextAt += this.gateInterval();
      n++;
    }
    // A full gate pauses: the next walk-in comes a full interval after a spot frees up.
    if (g.visitors.length >= GATE.capacity && g.nextAt < now) g.nextAt = now;
    if (n) {
      this.emit({ type: 'visitor', id: g.visitors.at(-1).id });
      this.changed();
    }
    return n;
  }

  _gateFreed() {
    const g = this.s.gate;
    if (g.on && g.nextAt <= this.now()) g.nextAt = this.now() + this.gateInterval();
  }

  /** Someone arrives now (the guided start, rescues, the convoy). */
  arrive({ role = null, stars = null, origin = 'gate', odds: o = this.radio().odds, level } = {}) {
    const p = this._newcomer({ odds: o, origin, role, stars, level });
    this.s.gate.visitors.push(p);
    this.s.stats.visitors++;
    this.emit({ type: 'visitor', id: p.id });
    this.changed();
    return p;
  }

  takeIn(id) {
    const g = this.s.gate;
    const k = g.visitors.findIndex((p) => p.id === id);
    if (k < 0) return fail('gone');
    if (this.freeBeds() <= 0) return fail('beds');
    const p = g.visitors.splice(k, 1)[0];
    p.joined = this.s.stats.runs + 1;
    this.s.people.push(p);
    this.s.stats.takenIn++;
    this._gateFreed();
    this.emit({ type: 'joined', id: p.id });
    this.changed();
    return { ok: true, person: p };
  }

  sendAway(id) {
    const g = this.s.gate;
    const k = g.visitors.findIndex((p) => p.id === id);
    if (k < 0) return fail('gone');
    const p = g.visitors.splice(k, 1)[0];
    this.s.stats.sentAway++;
    this._gateFreed();
    this.changed();
    return { ok: true, person: p };
  }

  /** Someone leaves for good (never you): frees a bed when the Bunks are maxed out. */
  letGo(id) {
    if (id === this.s.you) return fail('you');
    const k = this.s.people.findIndex((p) => p.id === id);
    if (k < 0) return fail('gone');
    const p = this.s.people.splice(k, 1)[0];
    this.s.crew = this.s.crew.filter((x) => x !== id);
    this.s.stats.letGo = (this.s.stats.letGo || 0) + 1;
    this.changed();
    return { ok: true, person: p };
  }

  /** The gate's timing changed (testing slider): the next visitor comes no later than one new interval. */
  retime() {
    const g = this.s.gate;
    if (g.on) g.nextAt = Math.min(g.nextAt, this.now() + this.gateInterval());
  }

  // --- Buildings -----------------------------------------------------------------------------

  building(id) {
    return BUILDINGS[BUILDING_INDEX[id]];
  }

  level(id) {
    return this.s.buildings[id] || 0;
  }

  effect(id, level = this.level(id)) {
    const b = this.building(id);
    if (!b || !b.values || level <= 0) return null;
    return b.values[level - 1];
  }

  workshop() {
    return this.effect('hardware') || 0;
  }

  kitchen() {
    return this.effect('diner') || 0;
  }

  training() {
    return this.effect('gym') || 0;
  }

  upgradeCost(id) {
    const l = this.level(id);
    const b = this.building(id);
    if (!b || b.final || l <= 0 || l >= MAX_FACILITY_LEVEL) return null;
    return nice(b.costs[l] * this.tuning.costs);
  }

  upgrade(id) {
    const cost = this.upgradeCost(id);
    if (cost === null) return fail(this.level(id) <= 0 ? 'locked' : 'maxed');
    if (this.s.scrap < cost) return fail('scrap', { cost });
    this.s.scrap -= cost;
    this.s.buildings[id]++;
    this.s.stats.upgrades++;
    this.emit({ type: 'upgrade', id, level: this.s.buildings[id] });
    this.changed();
    return { ok: true, id, level: this.s.buildings[id], cost };
  }

  affordable() {
    return BUILDINGS.filter((b) => !b.final)
      .map((b) => ({ id: b.id, cost: this.upgradeCost(b.id) }))
      .filter((u) => u.cost !== null && u.cost <= this.s.scrap);
  }

  /** The upgrade worth doing now: beds when someone's waiting and you're full, then power, XP, training, radio, beds. */
  bestUpgrade() {
    const can = new Map(this.affordable().map((u) => [u.id, u]));
    if (!can.size) return null;
    const needBeds = this.freeBeds() <= 0 && this.s.gate.visitors.length > 0;
    const order = [needBeds ? 'firehouse' : null, 'hardware', 'diner', 'gym', 'radio', 'firehouse'];
    for (const id of order) if (id && can.has(id)) return { ...can.get(id), why: id === 'firehouse' && needBeds ? 'beds' : 'value' };
    return null;
  }

  // --- Runs ----------------------------------------------------------------------------------

  /** The next run on the street. After the street is sealed: patrols, forever. */
  nextRun() {
    if (this.s.story < STORY_TOTAL) return this.storyRun(this.s.story);
    const last = STORY[STORY_TOTAL - 1];
    const tags = Object.keys(TAGS);
    const tag = tags[this.s.stats.runs % tags.length];
    return { i: STORY_TOTAL, name: 'Patrol', type: 'run', tag, rec: Math.round(last.rec * 0.85 * this.tuning.difficulty), text: 'Keep the street clear. Scrap and XP for whoever goes.', scrap: last.baseScrap, building: null, reclaims: null, rescue: false, chain: STORY[STORY_TOTAL - 1].chain, step: 0, steps: 1, patrol: true, level: 'city' };
  }

  storyRun(i) {
    const d = STORY[i];
    if (!d) return null;
    const b = this.building(d.building);
    const finale = d.type === 'finale';
    return {
      i,
      name: d.name,
      type: d.type,
      tag: d.tag,
      text: d.text,
      rec: Math.round(d.rec * this.tuning.difficulty),
      scrap: Math.round(d.baseScrap * (finale ? FINALE_SCRAP : 1)),
      building: b,
      reclaims: finale ? b.id : null,
      rescue: d.type === 'rescue',
      chain: d.chain,
      step: d.step,
      steps: d.steps,
      level: d.type === 'run' ? 'city' : 'interior',
    };
  }

  favored(run) {
    return TAGS[run.tag].role;
  }

  memberPower(p, run) {
    return basePower(p) * (run && ROLES[p.role].tag === run.tag ? 1 + FAVORED_BONUS : 1);
  }

  /** Crew power: you plus your teammates, with the Workshop's gear. */
  crewPower(ids, run) {
    const sum = ids
      .map((id) => this.person(id))
      .filter(Boolean)
      .reduce((a, p) => a + this.memberPower(p, run), 0);
    return Math.round(sum * (1 + this.workshop()));
  }

  /** You plus the three best teammates for this run. */
  bestCrew(run) {
    const mates = this.available()
      .sort((a, b) => this.memberPower(b, run) - this.memberPower(a, run) || basePower(b) - basePower(a))
      .slice(0, SQUAD_SIZE - 1)
      .map((p) => p.id);
    return [this.s.you, ...mates];
  }

  /** The guided start always wins: the first two runs can't be lost. */
  _guided() {
    return this.s.story < 2 && this.tuning.outcome === 'auto';
  }

  oddsFor(run, ids) {
    const p = this.crewPower(ids, run);
    const o = odds(p, run.rec);
    if (this._guided()) o.chance = 1;
    return { power: p, ...o, risk: riskOf(o.chance) };
  }

  validCrew(ids) {
    if (!Array.isArray(ids) || ids[0] !== this.s.you) return fail('you');
    if (new Set(ids).size !== ids.length || ids.length > SQUAD_SIZE) return fail('crew');
    for (const id of ids) {
      const p = this.person(id);
      if (!p) return fail('gone');
      if (p.rest > 0) return fail('resting', { id });
    }
    return { ok: true };
  }

  planRun(ids, { outcome = this.tuning.outcome, seed } = {}) {
    if (this.s.you === null) return fail('you');
    const v = this.validCrew(ids);
    if (!v.ok) return v;
    const run = this.nextRun();
    const power = this.crewPower(ids, run);
    const crew = ids.map((id) => this.person(id)).map((p) => ({ id: p.id, first: p.first, role: p.role }));
    const result = simulateRun({ run, crew, power, rec: run.rec, outcome, seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed, forceWin: this._guided() && outcome === 'auto' });
    result.crew = ids.slice();
    result.power = power;
    result.run = { i: run.i, name: run.name, type: run.type, tag: run.tag, patrol: !!run.patrol };
    return { ok: true, result };
  }

  /** Bank a RunResult. Returns everything the results screen shows. */
  applyRun(result) {
    const s = this.s;
    const st = s.stats;
    const run = this.nextRun();
    const crew = result.crew.map((id) => this.person(id)).filter(Boolean);
    const out = { won: result.won, stars: result.stars, scrap: 0, xp: [], home: [], hurt: null, back: [], rescued: null, reclaimed: null, sealed: false, arrived: [] };
    st.runs++;
    st.kills += result.kills || 0;

    // Whoever rested last time is back.
    for (const p of s.people) {
      if (p.rest > 0) {
        p.rest = 0;
        out.back.push(p.id);
      }
    }

    // Scrap.
    const scouts = Math.min(2, crew.filter((p) => p.role === 'scout').length);
    let scrap = run.scrap * this.tuning.scrap * (1 + scouts * SCOUT_SCRAP);
    scrap *= result.won ? STAR_SCRAP[result.stars] : LOSS_SCRAP;
    out.scrap = nice(scrap);
    out.scouts = scouts;
    s.scrap += out.scrap;
    st.earned += out.scrap;

    // XP: everyone who went, plus the Kitchen; everyone at home gets Training.
    const runXp = (result.won ? XP.win : XP.loss) + this.kitchen();
    for (const p of crew) {
      p.runs = (p.runs || 0) + 1;
      const from = { level: p.level, xp: p.xp };
      const ups = this.giveXp(p, runXp);
      out.xp.push({ id: p.id, gained: runXp, from, to: { level: p.level, xp: p.xp }, ups });
    }
    const home = this.training();
    if (home > 0) {
      for (const p of s.people) {
        if (result.crew.includes(p.id)) continue;
        const ups = this.giveXp(p, home);
        out.home.push({ id: p.id, gained: home, ups });
      }
    }

    // A lost run hurts one teammate (never you) for the next run, unless a Medic came along.
    if (result.won) st.wins++;
    else {
      st.losses++;
      const medic = crew.some((p) => p.role === 'medic');
      const mates = crew.filter((p) => p.id !== s.you);
      if (!medic && mates.length) {
        const p = mates[Math.floor(this.rng() * mates.length)];
        p.rest = 1;
        st.rests++;
        out.hurt = p.id;
      }
      out.medicSaved = medic && mates.length > 0;
    }

    // The story moves on; rescues bring someone home; a finale takes a building back.
    if (result.won && !run.patrol) {
      s.stars[run.i] = Math.max(s.stars[run.i], result.stars);
      s.story++;
      if (run.rescue) {
        const p = this.arrive({ odds: RESCUE_ODDS, origin: 'rescue' });
        p.rescuedFrom = run.name;
        out.rescued = p;
      }
      if (run.reclaims) {
        if (!run.building.final) s.buildings[run.reclaims] = Math.max(1, s.buildings[run.reclaims]);
        out.reclaimed = run.reclaims;
        s.log.push({ chain: run.chain, runs: st.runs, t: this.now() - s.created, play: s.playMs });
        if (run.building.final) {
          s.sealed = true;
          out.sealed = true;
        }
      }
    }
    s.crew = result.crew.filter((id) => id !== s.you);

    // The run took a few minutes; whoever reached the gate meanwhile is waiting.
    this.clock.warp(RUN_MINUTES * 60 * 1000);
    const before = new Set(s.gate.visitors.map((p) => p.id));
    this._gateTick();
    out.arrived = s.gate.visitors.filter((p) => !before.has(p.id)).map((p) => p.id);
    this.emit({ type: 'run', won: result.won });
    this.changed();
    return out;
  }

  // --- The convoy (long wait) -----------------------------------------------------------------------

  /** The convoy starts coming once Mae has shown you around. */
  startConvoy() {
    const c = this.s.convoy;
    if (c.on) return;
    c.on = true;
    c.readyAt = this.now() + CONVOY.first * 1000;
    this.changed();
  }

  convoyInfo() {
    const c = this.s.convoy;
    if (!c.on) return { on: false, ready: false, remaining: 0, frac: 0 };
    const remaining = Math.max(0, (c.readyAt - this.now()) / 1000);
    const total = c.readyAt - this.now() > CONVOY.first * 1000 ? CONVOY.every : Math.max(CONVOY.first, 1);
    return { on: true, ready: remaining <= 0, remaining, frac: 1 - Math.min(1, remaining / total), scrap: this.convoyScrap() };
  }

  convoyScrap() {
    const run = this.nextRun();
    return nice(run.scrap * CONVOY.scrapRuns * this.tuning.scrap);
  }

  claimConvoy() {
    const info = this.convoyInfo();
    if (!info.ready) return fail('notReady');
    const scrap = info.scrap;
    const p = this.arrive({ odds: CONVOY.odds, origin: 'convoy', level: Math.min(MAX_LEVEL, this.recruitLevel() + 1) });
    this.s.scrap += scrap;
    this.s.stats.earned += scrap;
    this.s.stats.convoys++;
    this.s.convoy = { on: true, readyAt: this.now() + CONVOY.every * 1000, told: false };
    this.changed();
    return { ok: true, scrap, person: p };
  }

  tick() {
    this._gateTick();
    const c = this.s.convoy;
    if (c.on && !c.told && c.readyAt <= this.now()) {
      c.told = true;
      this.emit({ type: 'convoy' });
      this.changed();
    }
  }

  // --- Direction -----------------------------------------------------------------------------

  goal() {
    if (this.s.sealed) return { done: true };
    const run = this.storyRun(this.s.story);
    return { done: false, run, building: run.building, step: run.step, steps: run.steps };
  }

  /** The single best next step, for Mae's hint: gate > beds > convoy > an affordable upgrade > play. */
  advice() {
    const g = this.s.gate.visitors;
    if (g.length && this.freeBeds() > 0) return { kind: 'gate', id: g[0].id, text: `${g[0].first} is at the gate.` };
    const best = this.bestUpgrade();
    if (g.length && best && best.why === 'beds') return { kind: 'build', id: 'firehouse', text: 'We’re out of beds. Upgrade the Bunks.' };
    if (this.convoyInfo().ready) return { kind: 'convoy', text: 'The convoy is here. Go and see.' };
    // Upgrades are instant and permanent: scrap is best spent as soon as it can be.
    if (best) {
      const b = this.building(best.id);
      return { kind: 'build', id: best.id, text: `Upgrade the ${b.facility}: ${b.unit(this.effect(best.id, this.level(best.id) + 1))}.` };
    }
    const run = this.nextRun();
    if (this.s.sealed) return { kind: 'play', text: 'Hope Street is safe. Patrols keep everyone sharp.' };
    const b = run.building;
    const where = b.final ? 'Bring down the overpass' : `Take back ${b.name}`;
    return { kind: 'play', text: `${where}: ${run.name} (${run.step + 1}/${run.steps}).` };
  }

  /** What the meta hands the action game (docs/STATION-9.md). */
  loadout(ids) {
    const run = this.nextRun();
    const view = (p) => ({ id: p.id, name: `${p.first} ${p.last}`, role: p.role, stars: p.stars, level: p.level });
    const crew = ids.map((id) => this.person(id)).filter(Boolean);
    return {
      run: { name: run.name, type: run.type, tag: run.tag, level: run.level, rec: run.rec },
      you: crew[0] ? view(crew[0]) : null,
      teammates: crew.slice(1).map(view),
      favored: this.favored(run),
      workshop: this.workshop(),
      power: this.crewPower(ids, run),
    };
  }

  // --- Testing -------------------------------------------------------------------------------

  give(scrap) {
    this.s.scrap += scrap;
    this.changed();
  }

  /** Win the next run with the best crew (testing). */
  skipRun(stars = 2) {
    const run = this.nextRun();
    for (const p of this.s.people) p.rest = 0;
    const ids = this.bestCrew(run);
    const r = this.planRun(ids, { outcome: 'win', seed: 1 });
    r.result.stars = stars;
    return { result: r.result, out: this.applyRun(r.result) };
  }
}

export { odds, riskOf };
