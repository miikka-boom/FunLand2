// Hope Street: state + rules. No DOM; clock and RNG are injected so the same code
// runs in the browser, the tests and the balance simulator.
//
// Two loops feed each other:
//   people:  strangers at the gate -> take them in (needs a bed) -> pick a crew of
//            up to four per run -> they level up by playing (and training at home)
//   street:  runs bring scrap -> instant facility upgrades; story runs reclaim the
//            next building, which becomes a new facility
// Actions return { ok: true, ... } or { ok: false, reason }.

import {
  ROLES,
  ROLE_ORDER,
  TAGS,
  TRAITS,
  FAVORED_BONUS,
  ROLE_SQUAD,
  MAX_LEVEL,
  XP_TO_NEXT,
  SQUAD_SIZE,
  BUILDINGS,
  BUILDING_INDEX,
  MAX_FACILITY_LEVEL,
  GATE,
  CHAINS,
  RUNS_PER_CHAIN,
  STORY_TOTAL,
  FINALE_SCRAP,
  RESCUE_ODDS,
  SCAVENGE_SITES,
  SCAVENGE,
  RUN_XP,
  STAR_MULT,
  DEATH_KEEP,
  DEATH_XP,
  COOP_BONUS,
  INJURY,
  REVIVE,
  CONVOY,
  RUSH_GEMS_PER_HOUR,
  START,
  TUNING_DEFAULTS,
  RUN_TYPES,
} from './config.js';
import { generatePerson, rollGrade, basePower, fullName } from './people.js';
import { simulateRun, odds, riskOf } from './run-sim.js';
import { randInt } from './util.js';

const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra });

/** Round costs and rewards to amounts that read well. */
export function nice(v) {
  if (v <= 0) return 0;
  if (v < 20) return Math.max(1, Math.round(v));
  if (v < 200) return Math.round(v / 5) * 5;
  if (v < 2000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
}

export function newState(now, rng = Math.random) {
  const buildings = {};
  for (const b of BUILDINGS) if (!b.final) buildings[b.id] = b.start ? 1 : 0;
  const s = {
    v: 1,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    day: 1,
    scrap: START.scrap,
    gems: START.gems,
    people: [],
    nextId: 1,
    squad: [], // the last crew, the one you play first
    buildings,
    story: 0, // index of the next story run; STORY_TOTAL once the street is sealed
    stars: Array(STORY_TOTAL).fill(0),
    sealed: false,
    scavenges: [],
    gate: { visitors: [], nextAt: now + GATE.first * 1000, arrivals: 0 },
    convoy: { readyAt: now + CONVOY.first * 1000, told: false },
    stats: { runs: 0, wins: 0, deaths: 0, revives: 0, kills: 0, upgrades: 0, earned: 0, gemsEarned: 0, gemsSpent: 0, takenIn: 0, turnedAway: 0, letGo: 0, injuries: 0, levelUps: 0, convoys: 0, visitors: 0 },
    log: [], // pacing: { chain, runs, day, t, play } when each building is reclaimed
    playMs: 0,
    seen: {},
  };
  // Two founders: different roles, the stronger one leads.
  const roles = ROLE_ORDER.slice();
  for (const grade of START.founders) {
    const role = roles.splice(Math.floor(rng() * roles.length), 1)[0];
    const p = generatePerson(rng, { id: s.nextId++, grade, role, origin: 'founder', day: 1 });
    p.joined = 1;
    s.people.push(p);
  }
  s.squad = s.people.map((p) => p.id);
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
    if (!this.s.scavenges.length) this._rollScavenges();
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

  // --- People ------------------------------------------------------------------------------------

  person(id) {
    return this.s.people.find((p) => p.id === id) || null;
  }

  power(p) {
    return basePower(p);
  }

  /** People sorted strongest first. */
  roster() {
    return this.s.people.slice().sort((a, b) => basePower(b) - basePower(a) || b.level - a.level || a.id - b.id);
  }

  available() {
    return this.roster().filter((p) => p.injured <= 0);
  }

  beds() {
    const f = BUILDINGS[BUILDING_INDEX.firehouse];
    const m = BUILDINGS[BUILDING_INDEX.motel];
    const lf = this.s.buildings.firehouse;
    const lm = this.s.buildings.motel;
    return f.values[lf - 1] + (lm > 0 ? m.values[lm - 1] : 0);
  }

  freeBeds() {
    return this.beds() - this.s.people.length;
  }

  xpToNext(p) {
    return p.level >= MAX_LEVEL ? null : XP_TO_NEXT[p.level - 1];
  }

  /** Give XP and level up. Returns the number of levels gained. */
  giveXp(p, amount) {
    if (p.level >= MAX_LEVEL || amount <= 0) return 0;
    p.xp += Math.round(amount);
    let ups = 0;
    while (p.level < MAX_LEVEL && p.xp >= XP_TO_NEXT[p.level - 1]) {
      p.xp -= XP_TO_NEXT[p.level - 1];
      p.level++;
      ups++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    if (ups) this.s.stats.levelUps += ups;
    return ups;
  }

  /** The level a newcomer arrives at: a step behind your best four, so they can catch up. */
  recruitLevel() {
    const lv = this.roster()
      .slice(0, SQUAD_SIZE)
      .map((p) => p.level)
      .sort((a, b) => a - b);
    if (!lv.length) return 1;
    const median = lv[Math.floor((lv.length - 1) / 2)];
    return Math.max(1, Math.min(MAX_LEVEL - 1, median - 1));
  }

  /** Roles nobody here has yet: newcomers lean toward them. */
  missingRoles() {
    const have = new Set(this.s.people.map((p) => p.role));
    return ROLE_ORDER.filter((r) => !have.has(r));
  }

  _newcomer({ odds: gradeOdds, origin, level = this.recruitLevel(), preferChance = 0.5 }) {
    const grade = rollGrade(this.rng, gradeOdds);
    return generatePerson(this.rng, { id: this.s.nextId++, grade, level, prefer: this.missingRoles(), preferChance, origin, day: this.s.day });
  }

  // --- The gate -----------------------------------------------------------------------------------

  radio() {
    const l = this.s.buildings.radio;
    return l > 0 ? BUILDINGS[BUILDING_INDEX.radio].values[l - 1] : GATE;
  }

  gateInterval() {
    return this.radio().every * 60 * 1000 * this.tuning.gate;
  }

  gateCapacity() {
    return this.radio().gate;
  }

  gateInfo() {
    const g = this.s.gate;
    const full = g.visitors.length >= this.gateCapacity();
    return { visitors: g.visitors, full, capacity: this.gateCapacity(), nextIn: full ? null : Math.max(0, (g.nextAt - this.now()) / 1000), interval: this.gateInterval() / 1000 };
  }

  /** Arrivals while you were away (or while the page was open). Random visitors stop when the gate is full. */
  _gateTick() {
    const g = this.s.gate;
    const now = this.now();
    let n = 0;
    while (g.visitors.length < this.gateCapacity() && g.nextAt <= now) {
      // The first two visitors always bring a role you don't have yet.
      const p = this._newcomer({ odds: this.radio().odds, origin: 'gate', preferChance: g.arrivals < 2 ? 1 : 0.5 });
      p.arrived = g.nextAt;
      g.visitors.push(p);
      g.arrivals++;
      this.s.stats.visitors++;
      n++;
      // Onboarding: the second visitor comes sooner than the rest.
      const gap = g.arrivals === 1 ? (GATE.second - GATE.first) * 1000 : this.gateInterval();
      g.nextAt += gap;
    }
    // A full gate pauses the queue: the next visitor comes a full interval after a spot frees up.
    if (g.visitors.length >= this.gateCapacity() && g.nextAt < now) g.nextAt = now;
    if (n) {
      this.emit({ type: 'visitor', n });
      this.changed();
    }
    return n;
  }

  _gateFreed() {
    const g = this.s.gate;
    const now = this.now();
    if (g.nextAt <= now) g.nextAt = now + this.gateInterval();
  }

  takeIn(visitorId) {
    const g = this.s.gate;
    const k = g.visitors.findIndex((p) => p.id === visitorId);
    if (k < 0) return fail('gone');
    if (this.freeBeds() <= 0) return fail('beds');
    const p = g.visitors.splice(k, 1)[0];
    p.joined = this.s.day;
    delete p.arrived;
    this.s.people.push(p);
    this.s.stats.takenIn++;
    this._gateFreed();
    this.emit({ type: 'joined', id: p.id });
    this.changed();
    return { ok: true, person: p };
  }

  turnAway(visitorId) {
    const g = this.s.gate;
    const k = g.visitors.findIndex((p) => p.id === visitorId);
    if (k < 0) return fail('gone');
    const p = g.visitors.splice(k, 1)[0];
    this.s.stats.turnedAway++;
    this._gateFreed();
    this.changed();
    return { ok: true, person: p };
  }

  /** Radio someone to the gate right now, for gems. The scheduled visitor still comes. */
  callCost() {
    return GATE.callGems;
  }

  callNow() {
    if (this.s.gate.visitors.length >= this.gateCapacity()) return fail('gateFull');
    if (this.s.gems < GATE.callGems) return fail('gems', { cost: GATE.callGems });
    this.s.gems -= GATE.callGems;
    this.s.stats.gemsSpent += GATE.callGems;
    const p = this._newcomer({ odds: this.radio().odds, origin: 'gate' });
    p.arrived = this.now();
    this.s.gate.visitors.push(p);
    this.s.stats.visitors++;
    this.emit({ type: 'visitor', n: 1 });
    this.changed();
    return { ok: true, person: p, cost: GATE.callGems };
  }

  /** Someone leaves Hope Street for good. You always keep at least one person. */
  letGo(id) {
    const k = this.s.people.findIndex((p) => p.id === id);
    if (k < 0) return fail('gone');
    if (this.s.people.length <= 1) return fail('last');
    const p = this.s.people.splice(k, 1)[0];
    this.s.squad = this.s.squad.filter((x) => x !== id);
    this.s.stats.letGo++;
    this.emit({ type: 'left', id });
    this.changed();
    return { ok: true, person: p };
  }

  /** Make room and take someone in, in one step. */
  swap(visitorId, personId) {
    if (!this.s.gate.visitors.some((p) => p.id === visitorId)) return fail('gone');
    const r = this.letGo(personId);
    if (!r.ok) return r;
    return this.takeIn(visitorId);
  }

  // --- Facilities ---------------------------------------------------------------------------------

  building(id) {
    return BUILDINGS[BUILDING_INDEX[id]];
  }

  level(id) {
    return this.s.buildings[id] || 0;
  }

  /** Value of a facility's effect at a level (0 = not reclaimed). */
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

  homeXp() {
    return this.effect('gym') || 0;
  }

  infirmary() {
    return this.effect('clinic') || { faster: 0, safer: 0 };
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

  /** Facilities you can upgrade right now. */
  affordable() {
    return BUILDINGS.filter((b) => !b.final)
      .map((b) => ({ id: b.id, cost: this.upgradeCost(b.id) }))
      .filter((u) => u.cost !== null && u.cost <= this.s.scrap);
  }

  /**
   * The upgrade worth doing now, in a fixed, explainable order: beds when someone is
   * waiting and you're full, then the Workshop (power), Kitchen (XP), Training,
   * the Infirmary when people are hurt, the Radio, then beds.
   */
  bestUpgrade() {
    const can = new Map(this.affordable().map((u) => [u.id, u]));
    if (!can.size) return null;
    const bedIds = ['firehouse', 'motel'].filter((id) => can.has(id));
    const cheapestBed = bedIds.sort((a, b) => can.get(a).cost - can.get(b).cost)[0];
    const needBeds = this.freeBeds() <= 0 && (this.s.gate.visitors.length > 0 || this.s.people.length < 6);
    const order = [needBeds ? cheapestBed : null, 'hardware', 'diner', 'gym', this.s.people.some((p) => p.injured > 0) ? 'clinic' : null, 'radio', 'clinic', cheapestBed];
    for (const id of order) if (id && can.has(id)) return { ...can.get(id), why: id === cheapestBed && needBeds ? 'beds' : 'value' };
    return null;
  }

  // --- Runs ---------------------------------------------------------------------------------------

  chainIndex() {
    return Math.min(CHAINS.length - 1, Math.floor(this.s.story / RUNS_PER_CHAIN));
  }

  /** Story run i (0 .. STORY_TOTAL-1). */
  storyRun(i = this.s.story) {
    if (i < 0 || i >= STORY_TOTAL) return null;
    const c = Math.floor(i / RUNS_PER_CHAIN);
    const k = i % RUNS_PER_CHAIN;
    const chain = CHAINS[c];
    const def = chain.runs[k];
    const b = this.building(chain.building);
    const finale = def.type === 'finale';
    return {
      key: 'story',
      kind: 'story',
      i,
      chain: c,
      step: k,
      name: def.name,
      text: def.text,
      type: def.type,
      tags: def.tags,
      rec: Math.round(def.rec * this.tuning.difficulty),
      scrap: Math.round(chain.scrap * (finale ? FINALE_SCRAP : 1)),
      gems: finale ? chain.gems : 0,
      gemChance: finale ? 1 : 0,
      survivor: def.type === 'rescue' ? 1 : 0,
      xp: RUN_XP[c],
      building: b,
      reclaims: finale ? b.id : null,
      label: `${b.name} · ${k + 1}/${RUNS_PER_CHAIN}`,
    };
  }

  _rollScavenges() {
    const kinds = ['quick', 'haul'];
    const taken = new Set();
    this.s.scavenges = kinds.map((kind) => {
      let site;
      do site = Math.floor(this.rng() * SCAVENGE_SITES.length);
      while (taken.has(site) && taken.size < SCAVENGE_SITES.length);
      taken.add(site);
      return { kind, site };
    });
  }

  _rerollScavenge(slot) {
    const other = this.s.scavenges[1 - slot];
    let site;
    do site = Math.floor(this.rng() * SCAVENGE_SITES.length);
    while (site === this.s.scavenges[slot].site || (other && site === other.site));
    this.s.scavenges[slot].site = site;
  }

  scavengeRun(slot) {
    const o = this.s.scavenges[slot];
    if (!o) return null;
    const site = SCAVENGE_SITES[o.site];
    const k = SCAVENGE[o.kind];
    const c = this.chainIndex();
    const chain = CHAINS[c];
    // After the street is sealed, scavenges keep the last chain's level.
    const base = chain.runs[0].rec;
    return {
      key: `scav${slot}`,
      kind: 'scavenge',
      slot,
      chain: c,
      name: site.name,
      text: o.kind === 'haul' ? 'A big haul, if you can carry it out.' : 'In and out. Quick scrap, quick XP.',
      type: 'scavenge',
      tags: site.tags,
      rec: Math.round(base * k.rec * this.tuning.difficulty),
      scrap: Math.round(chain.scrap * k.scrap),
      gems: k.gems ? 3 : 0,
      gemChance: k.gems,
      survivor: k.survivor,
      xp: Math.round(RUN_XP[c] * k.xp),
      building: null,
      reclaims: null,
      label: k.label,
      scav: o.kind,
    };
  }

  run(key) {
    if (key === 'story') return this.storyRun();
    if (key === 'scav0') return this.scavengeRun(0);
    if (key === 'scav1') return this.scavengeRun(1);
    return null;
  }

  runs() {
    return ['story', 'scav0', 'scav1'].map((k) => this.run(k)).filter(Boolean);
  }

  /** One person's power on a given run: favored role and tag traits included. */
  memberPower(p, run) {
    let m = 1;
    if (run && run.tags.includes(ROLES[p.role].favored)) m += FAVORED_BONUS;
    for (const t of p.traits) {
      const d = TRAITS[t];
      if (d.tag && run && run.tags.includes(d.tag)) m += d.power;
    }
    return basePower(p) * m;
  }

  /** Why someone is good (or bad) on this run: short labels for the squad picker. */
  fit(p, run) {
    const out = [];
    if (run.tags.includes(ROLES[p.role].favored)) out.push({ good: true, text: `${ROLES[p.role].name} +${Math.round(FAVORED_BONUS * 100)}%` });
    for (const t of p.traits) {
      const d = TRAITS[t];
      if (d.tag && run.tags.includes(d.tag)) out.push({ good: d.good, text: `${d.name} ${d.power > 0 ? '+' : '−'}${Math.round(Math.abs(d.power) * 100)}%` });
      if (t === 'leader') out.push({ good: true, text: `${d.name} +${Math.round(d.squad * 100)}% crew` });
    }
    return out;
  }

  /** A friend in co-op brings someone about as strong as your best. */
  friendPower() {
    const top = this.roster().slice(0, SQUAD_SIZE);
    if (!top.length) return 20;
    return top.reduce((a, p) => a + basePower(p), 0) / top.length;
  }

  /** Crew power on a run. `ids` are your people (you first); friends fill the rest. */
  squadPower(ids, run, friends = 0) {
    const crew = ids.map((id) => this.person(id)).filter(Boolean);
    let sum = crew.reduce((a, p) => a + this.memberPower(p, run), 0);
    sum += friends * this.friendPower();
    const leader = crew.some((p) => p.traits.includes('leader')) ? TRAITS.leader.squad : 0;
    return Math.round(sum * (1 + this.workshop() + leader));
  }

  /** The strongest crew of up to `size` available people for this run. */
  bestSquad(run, size = SQUAD_SIZE) {
    const pool = this.available();
    if (size <= 0) return [];
    const ranked = pool.slice().sort((a, b) => this.memberPower(b, run) - this.memberPower(a, run));
    let best = ranked.slice(0, size).map((p) => p.id);
    // A Born leader lifts everyone: swap one in if it beats the weakest pick.
    if (!best.some((id) => this.person(id).traits.includes('leader'))) {
      const lead = ranked.find((p) => p.traits.includes('leader') && !best.includes(p.id));
      if (lead && best.length) {
        const alt = best.slice(0, -1).concat(lead.id);
        if (this.squadPower(alt, run) > this.squadPower(best, run)) best = alt;
      }
    }
    return best;
  }

  /** The crew to start from: last time's (if they're fit), topped up with the best. */
  suggestedSquad(run, friends = 0) {
    const size = Math.max(0, SQUAD_SIZE - friends);
    const keep = this.s.squad.filter((id) => {
      const p = this.person(id);
      return p && p.injured <= 0;
    });
    const out = keep.slice(0, size);
    for (const id of this.bestSquad(run, SQUAD_SIZE)) if (out.length < size && !out.includes(id)) out.push(id);
    return out;
  }

  oddsFor(run, ids, friends = 0) {
    const p = this.squadPower(ids, run, friends);
    const o = odds(p, run.rec);
    // The very first run always makes it: the tutorial win.
    if (this.s.stats.runs === 0 && run.kind === 'story' && this.tuning.outcome === 'auto') o.chance = 1;
    return { power: p, ...o, risk: riskOf(o.chance) };
  }

  /** Best-case odds on a run (with the best crew), for the board and the coach. */
  bestOdds(run) {
    return this.oddsFor(run, this.bestSquad(run));
  }

  validSquad(ids, friends = 0) {
    if (!Array.isArray(ids)) return fail('squad');
    if (new Set(ids).size !== ids.length) return fail('squad');
    if (ids.length + friends > SQUAD_SIZE) return fail('full');
    if (ids.length < 1) return fail('empty');
    for (const id of ids) {
      const p = this.person(id);
      if (!p) return fail('gone');
      if (p.injured > 0) return fail('injured', { id });
    }
    return { ok: true };
  }

  canPlay(key) {
    const r = this.run(key);
    if (!r) return fail(key === 'story' && this.s.sealed ? 'sealed' : 'locked');
    return { ok: true, run: r };
  }

  /** Simulate a run without banking it. The UI plays it, may offer a revive, then calls applyRun. */
  planRun(key, ids, { friends = 0, outcome = this.tuning.outcome, seed } = {}) {
    const can = this.canPlay(key);
    if (!can.ok) return can;
    const v = this.validSquad(ids, friends);
    if (!v.ok) return v;
    const run = can.run;
    const power = this.squadPower(ids, run, friends);
    const crew = ids.map((id) => this.person(id)).map((p) => ({ id: p.id, first: p.first, role: p.role, traits: p.traits }));
    const result = simulateRun({
      run,
      crew,
      power,
      rec: run.rec,
      outcome,
      seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed,
      forceWin: this.s.stats.runs === 0 && outcome === 'auto' && run.kind === 'story',
      friends,
    });
    result.squad = ids.slice();
    result.power = power;
    result.run = { key: run.key, kind: run.kind, i: run.i, slot: run.slot, chain: run.chain, name: run.name, type: run.type, tags: run.tags };
    return { ok: true, result };
  }

  reviveCost(result) {
    return REVIVE.gems[Math.min(result.run.chain, REVIVE.gems.length - 1)];
  }

  canRevive(result) {
    return !result.won && !result.revived && result.progress >= REVIVE.minProgress && this.s.gems >= this.reviveCost(result);
  }

  revive(result) {
    const cost = this.reviveCost(result);
    if (!this.canRevive(result)) return fail(result.won ? 'won' : this.s.gems < cost ? 'gems' : 'early');
    this.s.gems -= cost;
    this.s.stats.gemsSpent += cost;
    this.s.stats.revives++;
    result.revived = true;
    result.won = true;
    result.stars = result.ratio >= 1.1 ? 2 : 1;
    result.diedAt = result.progress;
    result.progress = 1;
    result.downed = [];
    result.events = [...result.events.filter((e) => e.tone !== 'bad' && e.at < result.diedAt), { at: result.diedAt, text: 'Back on your feet!', tone: 'good' }, { at: 0.97, text: 'Safe room reached', tone: 'good' }];
    this.emit({ type: 'revive' });
    this.changed();
    return { ok: true };
  }

  _injuryChance(p, ids) {
    const medics = Math.min(2, ids.map((id) => this.person(id)).filter((m) => m && m.role === 'medic').length);
    let c = INJURY.win * Math.pow(ROLE_SQUAD.medicInjury, medics) * (1 - this.infirmary().safer);
    for (const t of p.traits) if (TRAITS[t].injury) c *= TRAITS[t].injury;
    return c;
  }

  /** Bank a RunResult. A day passes. Returns everything the results screen shows. */
  applyRun(result) {
    const s = this.s;
    const st = s.stats;
    const run = this.run(result.run.key) || result.run;
    const crew = result.squad.map((id) => this.person(id)).filter(Boolean);
    const out = { won: result.won, stars: result.stars, lines: [], scrap: 0, gems: 0, xp: [], home: [], injured: [], healed: [], found: null, rescued: null, reclaimed: null, sealed: false, advanced: false, day: s.day + 1 };
    st.runs++;
    st.kills += result.kills || 0;

    // A day passes: injuries tick down for everyone who was already hurt.
    for (const p of s.people) {
      if (p.injured > 0) {
        p.injured--;
        if (p.injured === 0) out.healed.push(p.id);
      }
    }
    s.day++;

    for (const p of crew) {
      p.runs++;
      p.kills += (result.killsBy && result.killsBy[p.id]) || 0;
    }

    // Scrap.
    const scouts = Math.min(2, crew.filter((p) => p.role === 'scout').length);
    const lucky = crew.filter((p) => p.traits.includes('lucky')).length;
    if (result.won) {
      st.wins++;
      let total = run.scrap * this.tuning.scrap;
      out.lines.push({ label: run.kind === 'story' ? 'Run reward' : `${run.label}`, value: Math.round(total) });
      const sm = STAR_MULT.scrap[result.stars];
      if (sm > 1) {
        const extra = Math.round(run.scrap * this.tuning.scrap * (sm - 1));
        out.lines.push({ label: `${'★'.repeat(result.stars)} bonus`, value: extra });
        total += extra;
      }
      const bonus = scouts * ROLE_SQUAD.scoutScrap + lucky * TRAITS.lucky.scrap;
      if (bonus > 0) {
        const extra = Math.round(total * bonus);
        out.lines.push({ label: scouts && lucky ? 'Scouts + Lucky' : scouts ? `Scout${scouts > 1 ? 's' : ''}: +${Math.round(scouts * ROLE_SQUAD.scoutScrap * 100)}%` : 'Lucky', value: extra });
        total += extra;
      }
      if (result.friends > 0) {
        const extra = Math.round(total * COOP_BONUS * result.friends);
        out.lines.push({ label: `Co-op: ${result.friends} friend${result.friends > 1 ? 's' : ''}`, value: extra });
        total += extra;
      }
      out.scrap = nice(total);
      if (run.gemChance && this.rng() < run.gemChance) out.gems = run.kind === 'story' ? run.gems : randInt(this.rng, 2, 4);
    } else {
      st.deaths++;
      out.scrap = nice(run.scrap * this.tuning.scrap * (DEATH_KEEP.base + DEATH_KEEP.perProgress * result.progress));
      out.lines.push({ label: `Kept ${Math.round(result.progress * 100)}% of the haul`, value: out.scrap });
    }
    s.scrap += out.scrap;
    st.earned += out.scrap;
    if (out.gems) {
      s.gems += out.gems;
      st.gemsEarned += out.gems;
    }

    // XP for the crew, training for everyone at home.
    const runXp = run.xp * this.tuning.xp * (1 + this.kitchen()) * (result.won ? STAR_MULT.xp[result.stars] : DEATH_XP.base + DEATH_XP.perProgress * result.progress);
    for (const p of crew) {
      const mult = 1 + p.traits.reduce((a, t) => a + (TRAITS[t].xp || 0), 0);
      const gained = Math.round(runXp * mult);
      const from = { level: p.level, xp: p.xp };
      const ups = this.giveXp(p, gained);
      out.xp.push({ id: p.id, gained, from, to: { level: p.level, xp: p.xp }, ups });
    }
    const home = this.homeXp() * this.tuning.xp;
    if (home > 0) {
      for (const p of s.people) {
        if (result.squad.includes(p.id) || p.injured > 0) continue;
        const mult = 1 + p.traits.reduce((a, t) => a + (TRAITS[t].xp || 0), 0);
        const gained = Math.round(home * mult * (1 + this.kitchen()));
        const ups = this.giveXp(p, gained);
        out.home.push({ id: p.id, gained, ups });
      }
    }

    // Injuries.
    const faster = this.infirmary().faster;
    const downed = result.won ? [] : result.downed || [];
    for (const p of crew) {
      let days = 0;
      if (downed.includes(p.id)) days = Math.max(1, randInt(this.rng, INJURY.downedDays[0], INJURY.downedDays[1]) - faster);
      else if (result.won && this.rng() < this._injuryChance(p, result.squad)) days = INJURY.winDays;
      if (days > 0) {
        p.injured = days;
        st.injuries++;
        out.injured.push({ id: p.id, days });
      }
    }

    // Story progress and finds.
    if (run.kind === 'story' && result.won) {
      s.stars[run.i] = Math.max(s.stars[run.i], result.stars);
      s.story++;
      out.advanced = true;
      if (run.survivor) {
        const p = this._newcomer({ odds: RESCUE_ODDS, origin: 'rescue', level: Math.max(1, this.recruitLevel()) });
        p.rescuedFrom = run.name;
        p.arrived = this.now();
        s.gate.visitors.push(p);
        out.rescued = p;
      }
      if (run.reclaims) {
        s.buildings[run.reclaims] = Math.max(1, s.buildings[run.reclaims] || 0);
        out.reclaimed = run.reclaims;
        s.log.push({ chain: run.chain, runs: st.runs, day: s.day, t: this.now() - s.created, play: s.playMs });
        if (run.building.final) {
          s.sealed = true;
          out.sealed = true;
        }
      }
    }
    if (run.kind === 'scavenge') {
      if (result.won && run.survivor && this.rng() < run.survivor) {
        const p = this._newcomer({ odds: this.radio().odds, origin: 'scavenge' });
        p.rescuedFrom = run.name;
        p.arrived = this.now();
        s.gate.visitors.push(p);
        out.found = p;
      }
      this._rerollScavenge(run.slot);
    }

    // Remember the crew for next time.
    s.squad = result.squad.slice();
    // The run took real minutes: the street's clock moves on, and whoever reached
    // the gate meanwhile is waiting there when you get back.
    if (result.timeS > 0) this.clock.warp(result.timeS * 1000);
    const before = s.gate.visitors.length;
    this._gateTick();
    out.arrived = s.gate.visitors.slice(before).map((p) => p.id);
    this.emit({ type: 'run', won: result.won });
    this.changed();
    return out;
  }

  /** Heal someone now for gems. */
  healCost(p) {
    return p.injured > 0 ? p.injured * INJURY.healGemsPerDay : 0;
  }

  heal(id) {
    const p = this.person(id);
    if (!p) return fail('gone');
    if (p.injured <= 0) return fail('healthy');
    const cost = this.healCost(p);
    if (this.s.gems < cost) return fail('gems', { cost });
    this.s.gems -= cost;
    this.s.stats.gemsSpent += cost;
    p.injured = 0;
    this.changed();
    return { ok: true, cost };
  }

  // --- The convoy (long wait) -----------------------------------------------------------------------

  convoyInterval() {
    return CONVOY.every * 1000 * this.tuning.convoy;
  }

  convoyInfo() {
    const c = this.s.convoy;
    const now = this.now();
    const remaining = Math.max(0, (c.readyAt - now) / 1000);
    const total = this.convoyInterval() / 1000;
    return { ready: remaining <= 0, remaining, frac: total > 0 ? 1 - Math.min(1, remaining / total) : 1, rushCost: remaining > 0 ? Math.max(1, Math.ceil((remaining / 3600) * RUSH_GEMS_PER_HOUR)) : 0, scrap: this.convoyScrap() };
  }

  convoyScrap() {
    return nice(CHAINS[this.chainIndex()].scrap * CONVOY.scrapRuns * this.tuning.scrap);
  }

  claimConvoy() {
    const info = this.convoyInfo();
    if (!info.ready) return fail('notReady');
    const scrap = nice(info.scrap * (0.85 + this.rng() * 0.3));
    const gems = randInt(this.rng, CONVOY.gems[0], CONVOY.gems[1]);
    const p = this._newcomer({ odds: CONVOY.odds, origin: 'convoy', level: this.recruitLevel() + 1 });
    p.arrived = this.now();
    this.s.gate.visitors.push(p);
    this.s.scrap += scrap;
    this.s.gems += gems;
    this.s.stats.earned += scrap;
    this.s.stats.gemsEarned += gems;
    this.s.stats.convoys++;
    this.s.convoy = { readyAt: this.now() + this.convoyInterval(), told: false };
    this.changed();
    return { ok: true, scrap, gems, person: p };
  }

  rushConvoy() {
    const info = this.convoyInfo();
    if (info.ready) return this.claimConvoy();
    if (this.s.gems < info.rushCost) return fail('gems', { cost: info.rushCost });
    this.s.gems -= info.rushCost;
    this.s.stats.gemsSpent += info.rushCost;
    this.s.convoy.readyAt = this.now();
    return { ...this.claimConvoy(), rushed: info.rushCost };
  }

  /** Called when a tuning value changes: keep timers sane. */
  retime() {
    const now = this.now();
    const c = this.s.convoy;
    if (c.readyAt - now > this.convoyInterval()) c.readyAt = now + this.convoyInterval();
    const g = this.s.gate;
    if (g.nextAt - now > this.gateInterval()) g.nextAt = now + this.gateInterval();
  }

  tick() {
    this._gateTick();
    const c = this.s.convoy;
    if (!c.told && c.readyAt <= this.now()) {
      c.told = true;
      this.emit({ type: 'convoy' });
      this.changed();
    }
  }

  // --- Direction --------------------------------------------------------------------------------------

  /** The next building to reclaim, with how many runs are left. */
  goal() {
    if (this.s.sealed) return { done: true };
    const run = this.storyRun();
    return { done: false, building: run.building, step: run.step, left: RUNS_PER_CHAIN - run.step, run };
  }

  /**
   * The single best next step, for the coach and the goal card:
   * gate > beds > upgrade (when it matters) > story > scavenge.
   */
  advice() {
    const g = this.s.gate.visitors;
    const free = this.freeBeds();
    if (g.length && free > 0) {
      const v = g[0];
      return { kind: 'gate', text: `${v.first} is at the gate`, id: v.id };
    }
    const best = this.bestUpgrade();
    if (g.length && free <= 0 && best && best.why === 'beds') return { kind: 'build', item: best, text: `No free bed. Upgrade the ${this.building(best.id).facility}` };
    const story = this.storyRun();
    const so = story ? this.bestOdds(story) : null;
    if (best && (this.s.stats.runs <= 2 || !so || so.chance < 0.8)) {
      const b = this.building(best.id);
      return { kind: 'build', item: best, text: `Upgrade the ${b.facility}: ${b.unit(this.effect(best.id, this.level(best.id) + 1))}` };
    }
    if (story && so.chance >= 0.45) {
      const pct = Math.round(so.chance * 100);
      return { kind: 'play', key: 'story', text: so.chance < 0.8 ? `Play ${story.name}: ${pct}% to survive` : `Play ${story.name}` };
    }
    // Too tough (or the street is sealed): the scavenge that pays best per try.
    let pickKey = null;
    let bestV = 0;
    for (const key of ['scav0', 'scav1']) {
      const r = this.run(key);
      const o = this.bestOdds(r);
      const v = r.scrap * o.chance * (o.chance >= 0.5 ? 1 : 0.3);
      if (v > bestV) {
        bestV = v;
        pickKey = key;
      }
    }
    if (pickKey) {
      const r = this.run(pickKey);
      return { kind: 'scavenge', key: pickKey, text: story ? `Too tough for now. Scavenge the ${r.name} for scrap and XP` : `Scavenge the ${r.name}` };
    }
    return { kind: 'play', key: 'story', text: story ? `Play ${story.name}` : 'Hope Street is safe' };
  }

  /** What the meta hands the action game for the next run (docs/HOPE-STREET.md). */
  loadout(key, ids, friends = 0) {
    const run = this.run(key);
    const crew = ids.map((id) => this.person(id)).filter(Boolean);
    const view = (p) => ({ id: p.id, name: fullName(p), role: p.role, grade: p.grade, level: p.level, traits: p.traits.slice() });
    return {
      run: { key: run.key, kind: run.kind, name: run.name, type: run.type, tags: run.tags.slice(), level: run.tags.includes('indoors') ? 'interior' : 'city', rec: run.rec },
      you: crew[0] ? view(crew[0]) : null,
      bots: crew.slice(1).map(view),
      friends,
      favored: run.tags.map((t) => TAGS[t].role),
      workshop: this.workshop(),
      power: this.squadPower(ids, run, friends),
    };
  }

  // --- Dev cheats ----------------------------------------------------------------------------------------

  give({ scrap = 0, gems = 0 } = {}) {
    this.s.scrap += scrap;
    this.s.gems += gems;
    this.changed();
  }

  /** Win the next story run with the best crew (testing). */
  skipStory(stars = 2) {
    const run = this.storyRun();
    if (!run) return null;
    let ids = this.bestSquad(run);
    if (!ids.length) {
      for (const p of this.s.people) p.injured = 0;
      ids = this.bestSquad(run);
    }
    const r = this.planRun('story', ids, { outcome: 'win', seed: 1 });
    r.result.stars = stars;
    return { result: r.result, out: this.applyRun(r.result) };
  }

  /** A visitor arrives now (testing). */
  callVisitor() {
    const p = this._newcomer({ odds: this.radio().odds, origin: 'gate' });
    p.arrived = this.now();
    this.s.gate.visitors.push(p);
    this.s.stats.visitors++;
    this.changed();
    return p;
  }
}

export { odds, riskOf, RUN_TYPES };
