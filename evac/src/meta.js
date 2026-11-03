// Road to Evac: state + rules. No DOM; clock and RNG are injected so the
// same code runs in the browser, the tests and the balance simulator.
//
// One loop: play the next stop on the road -> Supplies (+stars) -> instant
// upgrades -> more power -> the next stop. Upgrades never wait on a timer.
// Actions return { ok: true, ... } or { ok: false, reason }; juicy moments
// are pushed to `events` for the UI.

import {
  SURVIVORS,
  SURVIVOR_ORDER,
  SQUAD_SIZE,
  WEAPONS,
  WEAPON_ORDER,
  MAX_LEVEL,
  LEVEL_COST,
  POWER,
  CAMPAIGNS,
  CHAPTERS_PER_CAMPAIGN,
  TOTAL_CHAPTERS,
  STAR_MULT,
  FIRST_CLEAR_BONUS,
  DEATH_KEEP,
  MASTERY_REWARD,
  COOP_BONUS,
  REVIVE,
  START,
  REWARDS,
  RUSH_GEMS_PER_HOUR,
  TUNING_DEFAULTS,
} from './config.js';
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

export function newState(now) {
  const survivors = {};
  for (const id of SURVIVOR_ORDER) survivors[id] = SURVIVORS[id].start ? 1 : 0;
  const weapons = {};
  for (const id of WEAPON_ORDER) weapons[id] = WEAPONS[id].start ? 1 : 0;
  return {
    v: 1,
    created: now,
    lastSeen: now,
    clockOffset: 0,
    supplies: START.supplies,
    gems: START.gems,
    next: 0, // the next stop on the road to clear
    stars: Array(TOTAL_CHAPTERS).fill(0),
    survivors, // level, 0 = not rescued yet
    weapons, // level, 0 = not found yet
    main: 'rook',
    weapon: 'smg',
    mastery: {}, // district id -> true once all its stops have 3 stars
    evac: false,
    rewards: {
      short: { readyAt: now + REWARDS.short.first * 1000, told: false },
      long: { readyAt: now + REWARDS.long.first * 1000, told: false },
    },
    stats: { runs: 0, wins: 0, deaths: 0, kills: 0, revives: 0, upgrades: 0, earned: 0, gemsEarned: 0, gemsSpent: 0, crates: 0, airdrops: 0 },
    log: [], // pacing: { campaign, runs, t, play } when each district is first cleared
    playMs: 0,
    seen: {}, // one-time hints shown
  };
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

  // --- The road -------------------------------------------------------------------------------

  chapter(i) {
    const ci = Math.floor(i / CHAPTERS_PER_CAMPAIGN);
    const k = i % CHAPTERS_PER_CAMPAIGN;
    const camp = CAMPAIGNS[ci];
    const def = camp.chapters[k];
    const stars = this.s.stars[i];
    let state = 'locked';
    if (stars > 0) state = 'done';
    else if (i === this.s.next) state = 'next';
    return {
      i,
      ci,
      k,
      campaign: camp,
      def,
      name: def.name,
      type: def.type,
      finale: def.type === 'finale',
      rec: Math.round(def.rec * this.tuning.difficulty),
      supplies: nice(def.supplies * this.tuning.supplies),
      unlock: def.unlock || null,
      gems: def.gems || 0,
      stars,
      state,
      label: `${camp.name} · ${def.type === 'finale' ? 'Finale' : `Chapter ${k + 1}`}`,
    };
  }

  /** The stop the PLAY button goes to: the next one, or the last one once the road is done. */
  playTarget() {
    return Math.min(this.s.next, TOTAL_CHAPTERS - 1);
  }

  campaignProgress(ci) {
    let cleared = 0;
    let stars = 0;
    for (let k = 0; k < CHAPTERS_PER_CAMPAIGN; k++) {
      const st = this.s.stars[ci * CHAPTERS_PER_CAMPAIGN + k];
      if (st > 0) cleared++;
      stars += st;
    }
    return { cleared, stars, maxStars: CHAPTERS_PER_CAMPAIGN * 3, done: cleared === CHAPTERS_PER_CAMPAIGN, mastered: !!this.s.mastery[CAMPAIGNS[ci].id] };
  }

  /** The next unlock waiting on the road (for the goal card). */
  nextUnlock() {
    for (let i = this.s.next; i < TOTAL_CHAPTERS; i++) {
      const c = this.chapter(i);
      if (c.unlock) return c;
    }
    return null;
  }

  // --- Squad and power -----------------------------------------------------------------------------

  rescued() {
    return SURVIVOR_ORDER.filter((id) => this.s.survivors[id] > 0);
  }

  found() {
    return WEAPON_ORDER.filter((id) => this.s.weapons[id] > 0);
  }

  /** You first, then the three best other survivors. */
  squad(main = this.s.main) {
    const others = this.rescued()
      .filter((id) => id !== main)
      .sort((a, b) => this.s.survivors[b] - this.s.survivors[a] || SURVIVOR_ORDER.indexOf(a) - SURVIVOR_ORDER.indexOf(b));
    return [main, ...others.slice(0, SQUAD_SIZE - 1)];
  }

  survivorPower(id, asMain, level = this.s.survivors[id]) {
    if (level <= 0) return 0;
    return asMain ? POWER.mainBase + POWER.mainPerLevel * (level - 1) : POWER.botBase + POWER.botPerLevel * (level - 1);
  }

  weaponPower(id, level = this.s.weapons[id]) {
    if (level <= 0) return 0;
    return WEAPONS[id].base + POWER.weaponPerLevel * (level - 1);
  }

  power(main = this.s.main, weapon = this.s.weapon) {
    const squad = this.squad(main);
    const parts = [{ kind: 'survivor', id: main, main: true, p: this.survivorPower(main, true) }, { kind: 'weapon', id: weapon, p: this.weaponPower(weapon) }];
    for (const id of squad.slice(1)) parts.push({ kind: 'survivor', id, main: false, p: this.survivorPower(id, false) });
    return { total: parts.reduce((a, x) => a + x.p, 0), parts, squad };
  }

  /** Squad perks, in %: what the camp would hand the action game. */
  perks(main = this.s.main) {
    const out = {};
    for (const id of this.squad(main)) {
      const d = SURVIVORS[id];
      out[d.perk] = (out[d.perk] || 0) + d.perkPer * this.s.survivors[id];
    }
    return out;
  }

  lootBonus(main = this.s.main) {
    return (this.perks(main)['Supplies found'] || 0) / 100;
  }

  oddsFor(i, main = this.s.main, weapon = this.s.weapon) {
    const c = this.chapter(i);
    const o = odds(this.power(main, weapon).total, c.rec);
    const first = this.s.stats.runs === 0 && this.tuning.outcome === 'auto';
    const chance = first ? 1 : o.chance;
    return { ...o, chance, risk: riskOf(chance) };
  }

  setMain(id) {
    if (!(this.s.survivors[id] > 0)) return fail('locked');
    this.s.main = id;
    this.changed();
    return { ok: true };
  }

  setWeapon(id) {
    if (!(this.s.weapons[id] > 0)) return fail('locked');
    this.s.weapon = id;
    this.changed();
    return { ok: true };
  }

  // --- Upgrades (instant) ------------------------------------------------------------------------------

  level(kind, id) {
    return kind === 'survivor' ? this.s.survivors[id] : this.s.weapons[id];
  }

  upgradeCost(kind, id) {
    const lvl = this.level(kind, id);
    if (lvl <= 0 || lvl >= MAX_LEVEL) return null;
    const mult = kind === 'survivor' ? SURVIVORS[id].costMult : WEAPONS[id].costMult;
    return nice(LEVEL_COST[lvl - 1] * mult * this.tuning.costs);
  }

  /** Power gained by upgrading this item, for the current loadout. */
  upgradeGain(kind, id) {
    const lvl = this.level(kind, id);
    if (lvl <= 0 || lvl >= MAX_LEVEL) return 0;
    const before = this.power().total;
    if (kind === 'weapon') {
      const after = this.weaponPower(id, lvl + 1);
      // Upgrading another gun only helps once it beats the one you carry.
      return id === this.s.weapon ? POWER.weaponPerLevel : Math.max(0, after - this.weaponPower(this.s.weapon));
    }
    this.s.survivors[id] = lvl + 1;
    const after = this.power().total;
    this.s.survivors[id] = lvl;
    return after - before;
  }

  upgrade(kind, id) {
    const cost = this.upgradeCost(kind, id);
    if (cost === null) return fail(this.level(kind, id) <= 0 ? 'locked' : 'maxed');
    if (this.s.supplies < cost) return fail('supplies', { need: cost - this.s.supplies });
    const before = this.power().total;
    this.s.supplies -= cost;
    if (kind === 'survivor') this.s.survivors[id]++;
    else this.s.weapons[id]++;
    this.s.stats.upgrades++;
    const after = this.power().total;
    const level = this.level(kind, id);
    this.emit({ type: 'upgrade', kind, id, level, gain: after - before });
    this.changed();
    return { ok: true, cost, level, before, after };
  }

  /** Everything you can afford right now, best power-per-supply first. */
  affordable() {
    const out = [];
    for (const id of this.rescued()) {
      const cost = this.upgradeCost('survivor', id);
      if (cost !== null && cost <= this.s.supplies) out.push({ kind: 'survivor', id, cost, gain: this.upgradeGain('survivor', id) });
    }
    for (const id of this.found()) {
      const cost = this.upgradeCost('weapon', id);
      if (cost !== null && cost <= this.s.supplies) out.push({ kind: 'weapon', id, cost, gain: this.upgradeGain('weapon', id) });
    }
    return out.sort((a, b) => b.gain / b.cost - a.gain / a.cost || b.gain - a.gain);
  }

  bestUpgrade() {
    const list = this.affordable().filter((u) => u.gain > 0);
    return list[0] || null;
  }

  // --- Runs ----------------------------------------------------------------------------------------------

  canPlay(i) {
    return i >= 0 && i < TOTAL_CHAPTERS && i <= this.s.next;
  }

  /** Simulate a run without banking it. The UI plays it, may offer a revive, then calls applyRun. */
  planRun(i, { friends = 0, outcome = this.tuning.outcome, seed } = {}) {
    if (!this.canPlay(i)) return fail('locked');
    const c = this.chapter(i);
    const p = this.power();
    const friendBoost = friends > 0 ? 1 + 0.03 * friends : 1; // friends are a bit better than bots
    const result = simulateRun({
      index: i,
      chapter: c.def,
      campaign: c.ci,
      power: Math.round(p.total * friendBoost),
      rec: c.rec,
      squad: p.squad,
      outcome,
      seed: seed === undefined ? Math.floor(this.rng() * 4294967296) : seed,
      forceWin: this.s.stats.runs === 0 && outcome === 'auto',
      friends,
    });
    result.main = this.s.main;
    result.weapon = this.s.weapon;
    result.power = p.total;
    return { ok: true, result };
  }

  reviveCost(result) {
    const ci = Math.floor(result.index / CHAPTERS_PER_CAMPAIGN);
    return REVIVE.gems[Math.min(ci, REVIVE.gems.length - 1)];
  }

  canRevive(result) {
    return !result.won && !result.revived && result.progress >= REVIVE.minProgress && this.s.gems >= this.reviveCost(result);
  }

  /** Spend gems to get back up: the run is survived, with 1 star (2 if you were strong). */
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
    result.events = [...result.events.filter((e) => e.tone !== 'bad' && e.at < result.diedAt), { at: result.diedAt, text: 'Back on your feet!', tone: 'good' }, { at: 0.97, text: 'Safe room reached', tone: 'good' }];
    this.emit({ type: 'revive' });
    this.changed();
    return { ok: true };
  }

  /** Bank a RunResult. Returns everything the results screen shows. */
  applyRun(result) {
    const i = result.index;
    const c = this.chapter(i);
    const st = this.s.stats;
    st.runs++;
    st.kills += result.kills || 0;
    const out = { index: i, won: result.won, stars: result.stars, lines: [], supplies: 0, gems: 0, unlocks: [], firstClear: false, advanced: false, campaignDone: false, mastery: null, evac: false };
    if (result.won) {
      st.wins++;
      const firstClear = this.s.stars[i] === 0;
      out.firstClear = firstClear;
      out.prevStars = this.s.stars[i];
      let total = c.supplies;
      out.lines.push({ label: 'Chapter reward', value: c.supplies });
      const starMult = STAR_MULT[result.stars];
      if (starMult > 1) {
        const extra = Math.round(c.supplies * (starMult - 1));
        out.lines.push({ label: `${'★'.repeat(result.stars)} bonus`, value: extra });
        total += extra;
      }
      const loot = this.lootBonus(result.main);
      if (loot > 0) {
        const extra = Math.round(total * loot);
        out.lines.push({ label: `${SURVIVORS.juno.name}: supplies +${Math.round(loot * 100)}%`, value: extra });
        total += extra;
      }
      if (result.friends > 0) {
        const extra = Math.round(total * COOP_BONUS * result.friends);
        out.lines.push({ label: `Co-op: ${result.friends} friend${result.friends > 1 ? 's' : ''}`, value: extra });
        total += extra;
      }
      if (firstClear) {
        const extra = Math.round(c.supplies * FIRST_CLEAR_BONUS);
        out.lines.push({ label: 'First clear', value: extra });
        total += extra;
        if (c.gems) out.gems += c.gems;
      }
      out.supplies = total;
      this.s.stars[i] = Math.max(this.s.stars[i], result.stars);
      if (i === this.s.next) {
        this.s.next++;
        out.advanced = true;
      }
      if (firstClear && c.unlock) out.unlocks.push(this._unlock(c.unlock));
      if (firstClear && c.finale) {
        out.campaignDone = true;
        this.s.log.push({ campaign: c.ci, runs: st.runs, t: this.now() - this.s.created, play: this.s.playMs });
        if (c.unlock && c.unlock.evac) {
          this.s.evac = true;
          out.evac = true;
        }
      }
      const prog = this.campaignProgress(c.ci);
      if (prog.stars === prog.maxStars && !this.s.mastery[c.campaign.id]) {
        this.s.mastery[c.campaign.id] = true;
        const finale = this.chapter(c.ci * CHAPTERS_PER_CAMPAIGN + CHAPTERS_PER_CAMPAIGN - 1);
        out.mastery = { campaign: c.campaign.name, gems: MASTERY_REWARD.gems, supplies: nice(finale.supplies * MASTERY_REWARD.suppliesMult) };
        out.supplies += out.mastery.supplies;
        out.gems += out.mastery.gems;
      }
    } else {
      st.deaths++;
      out.supplies = nice(c.supplies * (DEATH_KEEP.base + DEATH_KEEP.perProgress * result.progress));
      out.lines.push({ label: `Kept ${Math.round(result.progress * 100)}% of the route`, value: out.supplies });
    }
    this.s.supplies += out.supplies;
    st.earned += out.supplies;
    if (out.gems) {
      this.s.gems += out.gems;
      st.gemsEarned += out.gems;
    }
    this.emit({ type: 'run', won: result.won, index: i });
    this.changed();
    return out;
  }

  _unlock(u) {
    if (u.weapon) {
      // A new gun arrives at the level of your best gun, so it is always an upgrade.
      const best = Math.max(...WEAPON_ORDER.map((id) => this.s.weapons[id]));
      this.s.weapons[u.weapon] = Math.max(1, best);
      return { kind: 'weapon', id: u.weapon, level: this.s.weapons[u.weapon] };
    }
    if (u.survivor) {
      this.s.survivors[u.survivor] = 1;
      return { kind: 'survivor', id: u.survivor, level: 1 };
    }
    return { kind: 'evac' };
  }

  // --- Wait rewards -----------------------------------------------------------------------------------------

  rewardInterval(kind) {
    return kind === 'short' ? this.tuning.shortMinutes * 60 : this.tuning.longHours * 3600;
  }

  rewardInfo(kind) {
    const r = this.s.rewards[kind];
    const remaining = Math.max(0, (r.readyAt - this.now()) / 1000);
    const interval = this.rewardInterval(kind);
    return {
      kind,
      def: REWARDS[kind],
      ready: remaining <= 0,
      remaining,
      frac: interval > 0 ? 1 - Math.min(1, remaining / interval) : 1,
      rushCost: kind === 'long' && remaining > 0 ? Math.max(1, Math.ceil((remaining / 3600) * RUSH_GEMS_PER_HOUR)) : 0,
    };
  }

  /** What a wait reward is worth right now: multiples of a stop's reward in your district. */
  rewardValue(kind) {
    const ci = Math.floor(this.playTarget() / CHAPTERS_PER_CAMPAIGN);
    let sum = 0;
    for (let k = 0; k < CHAPTERS_PER_CAMPAIGN; k++) sum += this.chapter(ci * CHAPTERS_PER_CAMPAIGN + k).supplies;
    return (sum / CHAPTERS_PER_CAMPAIGN) * REWARDS[kind].chapters;
  }

  claimReward(kind) {
    const info = this.rewardInfo(kind);
    if (!info.ready) return fail('notReady');
    const def = REWARDS[kind];
    const supplies = nice(this.rewardValue(kind) * (0.85 + this.rng() * 0.3));
    const gems = this.rng() < def.gemChance ? randInt(this.rng, def.gems[0], def.gems[1]) : 0;
    this.s.supplies += supplies;
    this.s.stats.earned += supplies;
    this.s.gems += gems;
    this.s.stats.gemsEarned += gems;
    if (kind === 'short') this.s.stats.crates++;
    else this.s.stats.airdrops++;
    const r = this.s.rewards[kind];
    r.readyAt = this.now() + this.rewardInterval(kind) * 1000;
    r.told = false;
    this.emit({ type: 'reward', kind, supplies, gems });
    this.changed();
    return { ok: true, supplies, gems };
  }

  rushReward(kind) {
    const info = this.rewardInfo(kind);
    if (info.ready) return this.claimReward(kind);
    if (kind !== 'long') return fail('notSkippable');
    if (this.s.gems < info.rushCost) return fail('gems', { cost: info.rushCost });
    this.s.gems -= info.rushCost;
    this.s.stats.gemsSpent += info.rushCost;
    this.s.rewards[kind].readyAt = this.now();
    return { ...this.claimReward(kind), rushed: info.rushCost };
  }

  retimeRewards() {
    const now = this.now();
    for (const kind of ['short', 'long']) {
      const r = this.s.rewards[kind];
      r.readyAt = Math.min(r.readyAt, now + this.rewardInterval(kind) * 1000);
    }
    this.changed();
  }

  // --- What to do next ------------------------------------------------------------------------------------------

  /**
   * The single best next step, so the player always knows what to do:
   * upgrade when it matters, replay for stars when the road is too tough,
   * otherwise play the next stop.
   */
  advice() {
    const target = this.playTarget();
    if (this.s.evac) {
      const missing = this._bestReplay(true);
      if (missing !== null) return { kind: 'replay', i: missing, text: `Go for ★★★ on ${this.chapter(missing).name}` };
      return { kind: 'done', text: 'Every stop mastered. Legend.' };
    }
    const o = this.oddsFor(target);
    const best = this.bestUpgrade();
    if (best && (this.s.stats.runs <= 3 || o.chance < 0.8)) {
      const name = best.kind === 'survivor' ? SURVIVORS[best.id].name : WEAPONS[best.id].name;
      return { kind: 'upgrade', item: best, text: `Upgrade ${name}: +${best.gain} power` };
    }
    if (o.chance < 0.45) {
      const r = this._bestReplay();
      if (r !== null) return { kind: 'replay', i: r, text: `Too tough for now. Replay ${this.chapter(r).name} for supplies` };
    }
    return { kind: 'play', i: target, text: `Play ${this.chapter(target).name}` };
  }

  /**
   * The cleared stop that pays the most supplies per attempt (odds x reward),
   * or, with `missingOnly`, only stops still short of 3 stars.
   */
  _bestReplay(missingOnly = false) {
    let best = null;
    let bestValue = 0;
    for (let i = 0; i < this.s.next && i < TOTAL_CHAPTERS; i++) {
      if (missingOnly && this.s.stars[i] >= 3) continue;
      const c = this.chapter(i);
      const o = this.oddsFor(i);
      const value = c.supplies * o.chance;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    return best;
  }

  // --- Time ------------------------------------------------------------------------------------------------------

  tick() {
    const now = this.now();
    for (const kind of ['short', 'long']) {
      const r = this.s.rewards[kind];
      if (!r.told && r.readyAt <= now) {
        r.told = true;
        this.emit({ type: 'rewardReady', kind });
        this.changed();
      }
    }
  }

  /** What the camp hands the action game for the next run (docs/METAGAME.md). */
  loadout(i = this.playTarget()) {
    const c = this.chapter(i);
    const perks = this.perks();
    return {
      chapter: { index: i, campaign: c.campaign.id, name: c.name, type: c.type, rec: c.rec },
      survivor: { id: this.s.main, level: this.s.survivors[this.s.main] },
      weapon: { id: this.s.weapon, game: WEAPONS[this.s.weapon].game, level: this.s.weapons[this.s.weapon] },
      squad: this.squad().slice(1).map((id) => ({ id, level: this.s.survivors[id] })),
      perks,
      power: this.power().total,
    };
  }

  // --- Dev cheats --------------------------------------------------------------------------------------------------

  give({ supplies = 0, gems = 0 } = {}) {
    this.s.supplies += supplies;
    this.s.gems += gems;
    this.changed();
  }

  /** Clear the next stop with N stars (dev). */
  skipChapter(stars = 3) {
    if (this.s.next >= TOTAL_CHAPTERS) return null;
    const r = { index: this.s.next, won: true, stars, progress: 1, kills: 0, timeS: 0, incaps: 0, ratio: 1.3, events: [], friends: 0, main: this.s.main };
    return this.applyRun(r);
  }
}

export { odds, riskOf };
