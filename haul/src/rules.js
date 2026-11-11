// Long Haul: the rules. No DOM in here: main.js and the views call these and
// draw what comes back; the tests and the balance tool call the same code.
//
// Every roll comes from a stream named after the save's seed and a counter
// (the run number, the call number), so the same save always plays out the
// same way and a reload can't re-roll a crate or a call.

import {
  MAX_LEVEL,
  SQUAD_SIZE,
  CLASSES,
  RARITIES,
  RARITY_ORDER,
  CAST,
  CAST_ORDER,
  POWER,
  TOKENS_TO_LEVEL,
  SUPPLIES_TO_LEVEL,
  TOKEN_REFUND,
  START,
  AREAS,
  FERRY_STARS,
  FRESH_PER_AREA,
  STAND,
  STAND_LABELS,
  SCRAPS,
  GRID,
  CRATES,
  RACK_SIZE,
  CALL_SECONDS,
  FIRST_CALLS,
  CALL_STACK,
  LEGEND_PITY,
  ARRIVE_BELOW,
  GIFT,
  TUNING_DEFAULTS,
} from './config.js';
import { clamp, mean, rngFor, randInt, pick, pickWeighted, shuffle } from './util.js';

// --- Pure helpers ----------------------------------------------------------------------------

/** Power of a survivor of `rarity` at `level`. */
export const powerAt = (rarity, level) => Math.round((POWER.base + POWER.growth * (level - 1)) * RARITIES[rarity].mult);

/** Tokens / supplies to go from `level` to the next one (null at the top). */
export const tokensFor = (level) => (level >= MAX_LEVEL ? null : TOKENS_TO_LEVEL[level - 1]);
export const suppliesFor = (level) => (level >= MAX_LEVEL ? null : SUPPLIES_TO_LEVEL[level - 1]);

/** The stop on the road that `stars` reaches (an index into AREAS). */
export function areaIndexFor(stars) {
  let i = 0;
  while (i + 1 < AREAS.length && stars >= AREAS[i + 1].stars) i++;
  return i;
}

/** The chance that someone with `power` is still standing at the end. */
export function standChanceOf(power, squadAvg, danger) {
  const eff = STAND.own * power + (1 - STAND.own) * squadAvg;
  return clamp(0.5 + STAND.slope * (eff / danger - 1), STAND.min, STAND.max);
}

export const standLabel = (chance) => STAND_LABELS.find((l) => chance >= l.min);

/** How long the n-th radio ever found (0-based) takes to get an answer, in ms. */
export const callMs = (n, mult = 1) => Math.max(1000, Math.round((FIRST_CALLS[n] ?? CALL_SECONDS) * 1000 * mult));

const tierOfRarity = (r) => (r === 'common' ? 'wood' : r === 'rare' ? 'steel' : 'gold');

/** `key` is the object's own (so 'constructor' and friends are nobody's name). */
export const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export function newStats() {
  return {
    stars: [0, 0, 0, 0], // runs by how many came back standing
    earned: 0, // supplies, all sources
    spent: 0, // supplies on levels
    tokens: 0,
    radios: 0,
    luckyGold: 0,
    eyes: 0,
    gifts: 0,
    levelUps: 0,
    newcomers: { common: 0, rare: 0, epic: 0, legendary: 0 },
    dupes: 0,
  };
}

const newMember = (level = 1) => ({ level, tokens: 0, runs: 0, stood: 0 });

/** A fresh save. */
export function newState(now = Date.now(), seed = (Math.random() * 0x100000000) >>> 0) {
  const cast = {};
  for (const id of START.squad) cast[id] = newMember(1);
  return {
    v: 1,
    seed: seed >>> 0,
    born: now,
    lastNow: now,
    clockOffset: 0,
    supplies: START.supplies,
    stars: 0,
    runs: 0,
    squad: [...START.squad],
    cast,
    rack: [], // radios: { n, dur, readyAt }; they call one after another
    radios: 0, // radios ever found
    calls: 0, // calls ever answered
    fresh: START.freshCalls, // calls still guaranteed to reach someone new
    legendWait: 0,
    haul: null, // the crates of the run being picked from
    areaSeen: 0, // the furthest stop already celebrated
    ferry: false, // the ending has been shown
    gift: null, // a crate somebody left at the gate
    gifts: 0,
    welcomed: false,
    stats: newStats(),
  };
}

// --- The game --------------------------------------------------------------------------------

export class Game {
  /**
   * @param state a save (newState() or a migrated one); mutated in place
   * @param clock { now(): ms }
   * @param tuning the testing sliders (TUNING_DEFAULTS)
   */
  constructor(state, { clock, tuning } = {}) {
    this.s = state;
    this.clock = clock || { now: () => Date.now() };
    this.tuning = tuning || { ...TUNING_DEFAULTS };
    /** One-shot testing overrides: { call: id | rarity | 'new', eyes: true, lucky: true }. */
    this.force = {};
  }

  now() {
    return this.clock.now();
  }

  // --- People ----------------------------------------------------------------------------------

  has(id) {
    return own(this.s.cast, id);
  }

  /** Everyone in the camp, in card order. */
  owned() {
    return CAST_ORDER.filter((id) => this.s.cast[id]);
  }

  bench() {
    return this.owned().filter((id) => !this.s.squad.includes(id));
  }

  level(id) {
    return this.s.cast[id].level;
  }

  power(id) {
    return powerAt(CAST[id].rarity, this.s.cast[id].level);
  }

  squadPower(squad = this.s.squad) {
    return mean(squad.map((id) => this.power(id)));
  }

  /** What levelling `id` up takes, and whether it can happen now. */
  levelInfo(id) {
    const m = this.s.cast[id];
    const max = m.level >= MAX_LEVEL;
    const need = tokensFor(m.level);
    const cost = suppliesFor(m.level);
    const hasTokens = !max && m.tokens >= need;
    const hasSupplies = !max && this.s.supplies >= cost;
    return {
      id,
      level: m.level,
      max,
      tokens: m.tokens,
      need,
      cost,
      hasTokens,
      hasSupplies,
      ready: hasTokens, // the bar is full
      ok: hasTokens && hasSupplies,
      power: this.power(id),
      nextPower: max ? null : powerAt(CAST[id].rarity, m.level + 1),
    };
  }

  levelUp(id) {
    if (!this.has(id)) return { ok: false, why: 'unknown' };
    const info = this.levelInfo(id);
    if (info.max) return { ok: false, why: 'max' };
    if (!info.hasTokens) return { ok: false, why: 'tokens' };
    if (!info.hasSupplies) return { ok: false, why: 'supplies' };
    const m = this.s.cast[id];
    m.tokens -= info.need;
    this.s.supplies -= info.cost;
    m.level += 1;
    this.s.stats.spent += info.cost;
    this.s.stats.levelUps += 1;
    return { ok: true, id, level: m.level, before: info.power, power: this.power(id), cost: info.cost };
  }

  /** Everyone whose bar is full and whose level-up is affordable, squad first. */
  readyList() {
    const squad = this.s.squad;
    return [...squad, ...this.bench()].filter((id) => this.levelInfo(id).ok);
  }

  // --- The squad -------------------------------------------------------------------------------

  /** Put `id` in `slot`. Someone already in the squad swaps places instead. */
  putInSquad(id, slot) {
    const sq = this.s.squad;
    if (!this.has(id) || !(slot >= 0 && slot < SQUAD_SIZE)) return { ok: false };
    const at = sq.indexOf(id);
    const out = sq[slot];
    if (at === slot) return { ok: true, out: null };
    if (at >= 0) sq[at] = out;
    sq[slot] = id;
    return { ok: true, out: at >= 0 ? null : out };
  }

  weakestSlot() {
    const sq = this.s.squad;
    let w = 0;
    for (let i = 1; i < sq.length; i++) if (this.power(sq[i]) < this.power(sq[w])) w = i;
    return w;
  }

  /** The strongest three. Ties go to whoever is already in the squad, then card order. */
  bestSquad() {
    const sq = this.s.squad;
    const rank = (id) => this.power(id) * 1000 + (sq.includes(id) ? 100 : 0) - CAST_ORDER.indexOf(id);
    return this.owned()
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, SQUAD_SIZE);
  }

  /** Switch to the strongest three; whoever stays keeps their place. Returns who came in. */
  useBest() {
    const best = this.bestSquad();
    const sq = this.s.squad;
    const incoming = best.filter((id) => !sq.includes(id));
    const came = [...incoming];
    for (let i = 0; i < sq.length; i++) if (!best.includes(sq[i])) sq[i] = incoming.shift();
    return came;
  }

  /** Someone on the bench who is stronger than the weakest of the squad: { id, slot, out } or null. */
  betterBench() {
    const slot = this.weakestSlot();
    const out = this.s.squad[slot];
    let best = null;
    for (const id of this.bench()) if (this.power(id) > this.power(out) && (!best || this.power(id) > this.power(best))) best = id;
    return best ? { id: best, slot, out } : null;
  }

  // --- The road --------------------------------------------------------------------------------

  /** Where the squad goes out: the furthest stop the stars reach. */
  areaIndex() {
    return areaIndexFor(this.s.stars);
  }

  area() {
    return AREAS[this.areaIndex()];
  }

  danger(i = this.areaIndex()) {
    return AREAS[i].danger * this.tuning.danger;
  }

  /** Progress to the next stop (or to the ferry from the last one). */
  road() {
    const i = this.areaIndex();
    const next = AREAS[i + 1] || null;
    const from = AREAS[i].stars;
    const to = next ? next.stars : FERRY_STARS;
    const stars = this.s.stars;
    return { area: i, stars, from, to, next, left: Math.max(0, to - stars), t: clamp((stars - from) / (to - from), 0, 1), ferry: !next };
  }

  /** A stop reached but not yet celebrated (its index), or null. */
  pendingArea() {
    return this.areaIndex() > this.s.areaSeen ? this.s.areaSeen + 1 : null;
  }

  /** Celebrate the next stop: its voices are on the radio, and the next call reaches someone new. */
  arrive() {
    const i = this.pendingArea();
    if (i == null) return null;
    this.s.areaSeen = i;
    this.s.fresh += FRESH_PER_AREA;
    return { area: i, voices: CAST_ORDER.filter((id) => CAST[id].area === i) };
  }

  pendingFerry() {
    return !this.s.ferry && this.s.stars >= FERRY_STARS;
  }

  boardFerry() {
    this.s.ferry = true;
  }

  // --- The run ---------------------------------------------------------------------------------

  /** The chance `id` is still standing after a run with `squad`. */
  standChance(id, squad = this.s.squad) {
    return standChanceOf(this.power(id), this.squadPower(squad), this.danger());
  }

  /** The stars a run is worth on average with `squad`. */
  expectedStars(squad = this.s.squad) {
    return squad.reduce((a, id) => a + this.standChance(id, squad), 0);
  }

  /**
   * Send the squad out. Everyone still standing carries a crate: that many
   * stars, and that many picks from the nine crates (this.s.haul). Nobody
   * standing: no crates, a handful of scraps.
   */
  play() {
    const s = this.s;
    if (s.haul) return { ok: false, why: 'haul' };
    const run = s.runs;
    const rng = rngFor(s.seed, 'run', run);
    const area = this.areaIndex();
    const squad = [...s.squad];
    const chances = squad.map((id) => this.standChance(id, squad));
    let standing = chances.map((c) => rng() < c);
    if (run === 0) standing = squad.map(() => true); // the first run always goes well
    const forced = this.tuning.outcome;
    if (forced !== 'auto' && forced != null) {
      // The testing drawer: exactly this many left standing, the likeliest first.
      const n = clamp(Number(forced) || 0, 0, squad.length);
      const order = squad.map((_, i) => i).sort((a, b) => chances[b] - chances[a] || this.power(squad[b]) - this.power(squad[a]) || a - b);
      standing = squad.map(() => false);
      for (const i of order.slice(0, n)) standing[i] = true;
    }
    const stars = standing.filter(Boolean).length;
    const kills = squad.map((id, i) => 2 + Math.floor(rng() * 2) + (standing[i] ? 1 : 0)); // drowsers each one drops, for the run you watch
    s.runs += 1;
    squad.forEach((id, i) => {
      s.cast[id].runs += 1;
      if (standing[i]) s.cast[id].stood += 1;
    });
    s.stats.stars[stars] += 1;
    const before = s.stars;
    s.stars += stars;
    let scraps = 0;
    if (stars > 0) s.haul = this._makeHaul(area, run, stars, squad, standing);
    else {
      scraps = Math.max(1, Math.round(SCRAPS * AREAS[area].loot * this.tuning.supplies));
      this._earn(scraps);
    }
    return { ok: true, run, area, squad, chances, standing, stars, kills, scraps, road: { before, after: s.stars, areaBefore: area, areaAfter: this.areaIndex() } };
  }

  // --- The crates ------------------------------------------------------------------------------

  _earn(n) {
    this.s.supplies += n;
    this.s.stats.earned += n;
  }

  /** A token stack for `who` in area `area` (`times` bigger for a radio call). */
  _stack(rng, who, area, times = 1) {
    const n = CRATES.tokens.base + Math.floor(CRATES.tokens.perArea * area) + randInt(rng, 0, 1);
    return Math.max(1, Math.round(n * times * RARITIES[CAST[who].rarity].stack * this.tuning.tokens));
  }

  _supplyCrate(rng, def, area) {
    const amount = Math.max(1, Math.round(randInt(rng, def.supplies[0], def.supplies[1]) * AREAS[area].loot * this.tuning.supplies));
    return { kind: 'supplies', tier: def.tier, amount };
  }

  _tokenCrate(rng, area) {
    const s = this.s;
    const open = (ids) => ids.filter((id) => s.cast[id].level < MAX_LEVEL);
    const squad = open(s.squad);
    const others = open(this.bench());
    let from = !others.length || (squad.length && rng() < CRATES.squadShare) ? squad : others;
    if (!from.length) from = s.squad; // everyone at the top: the tokens become supplies when picked
    const who = pick(rng, from);
    return { kind: 'tokens', tier: tierOfRarity(CAST[who].rarity), who, amount: this._stack(rng, who, area) };
  }

  _makeHaul(area, run, picks, squad = this.s.squad, standing = squad.map((_, i) => i < picks)) {
    const s = this.s;
    const rng = rngFor(s.seed, 'haul', run);
    const crates = [];
    for (let i = 0; i < CRATES.small.count; i++) crates.push(this._supplyCrate(rng, CRATES.small, area));
    for (let i = 0; i < CRATES.medium.count; i++) crates.push(this._supplyCrate(rng, CRATES.medium, area));
    for (let i = 0; i < CRATES.tokens.count; i++) crates.push(this._tokenCrate(rng, area));
    const gold = () => ({ ...this._supplyCrate(rng, CRATES.gold, area), gold: true });
    // The special crate: a radio while the rack has room for it, the gold crate otherwise.
    crates.push(this.rackRoom() > 0 ? { kind: 'radio', tier: 'gold' } : gold());
    const lucky = rng() < CRATES.luckyGold || this.force.lucky;
    const eyes = rng() < CRATES.eyes || this.force.eyes;
    delete this.force.lucky;
    delete this.force.eyes;
    if (lucky && run > 0) crates[0] = gold();
    shuffle(rng, crates);
    // Who went and who is carrying is kept with the haul, so a reload shows the same people.
    const haul = { run, area, picks, picked: [], crates, eyes: null, script: null, squad: [...squad], standing: [...standing] };
    if (run === 0) {
      // The first haul teaches one of each, whichever crates are tapped:
      // supplies, then tokens that fill a bar, then the radio.
      const first = s.squad[0];
      const t = crates.find((c) => c.kind === 'tokens');
      t.who = first;
      t.tier = tierOfRarity(CAST[first].rarity);
      t.amount = tokensFor(1);
      const need = suppliesFor(1);
      const m = crates.find((c) => c.kind === 'supplies' && c.tier === 'steel');
      m.amount = Math.max(m.amount, need);
      // (The special crate is the radio, or the gold one if the rack was filled by hand first.)
      haul.script = [crates.indexOf(m), crates.indexOf(t), crates.findIndex((c) => c.kind === 'radio' || c.gold)];
    } else if (eyes) haul.eyes = crates.findIndex((c) => c.kind === 'radio' || c.gold);
    return haul;
  }

  /** Open crate `i` of the haul. What is inside is yours at once. */
  pick(i) {
    const s = this.s;
    const h = s.haul;
    if (!h) return { ok: false, why: 'nohaul' };
    if (!(i >= 0 && i < GRID) || h.picked.includes(i)) return { ok: false, why: 'taken' };
    if (h.picked.length >= h.picks) return { ok: false, why: 'nopicks' };
    if (h.script) {
      // Bring the scripted crate under the finger.
      const k = h.picked.length;
      const j = h.script[k];
      if (j != null && j >= 0 && j !== i && !h.picked.includes(j)) {
        [h.crates[i], h.crates[j]] = [h.crates[j], h.crates[i]];
        for (let m = k + 1; m < h.script.length; m++) if (h.script[m] === i) h.script[m] = j;
      }
    }
    let c = h.crates[i];
    h.picked.push(i);
    const out = { ok: true, i, left: h.picks - h.picked.length };
    if (c.kind === 'radio' && this.rackRoom() <= 0) {
      // The rack filled up in the meantime (testing tools): it's the gold crate after all.
      c = h.crates[i] = { ...this._supplyCrate(rngFor(s.seed, 'swap', h.run), CRATES.gold, h.area), gold: true };
    }
    if (c.kind === 'supplies') {
      this._earn(c.amount);
      if (c.gold) s.stats.luckyGold += 1;
    } else if (c.kind === 'tokens') {
      const got = this._giveTokens(c.who, c.amount, h.area);
      if (got.refund) out.refund = got.refund;
    } else if (c.kind === 'radio') {
      out.radio = this._addRadio();
    }
    if (h.eyes === i) s.stats.eyes += 1;
    out.crate = c;
    return out;
  }

  /** Done picking: back to camp. Returns the crates left behind. */
  finishHaul() {
    const h = this.s.haul;
    if (!h) return null;
    this.s.haul = null;
    return { left: h.crates.map((c, i) => ({ i, crate: c })).filter((x) => !h.picked.includes(x.i)), unused: h.picks - h.picked.length };
  }

  _giveTokens(id, n, area = this.areaIndex()) {
    const m = this.s.cast[id];
    this.s.stats.tokens += n;
    if (m.level >= MAX_LEVEL) {
      const refund = Math.round(n * TOKEN_REFUND * AREAS[area].loot);
      this._earn(refund);
      return { tokens: 0, refund };
    }
    m.tokens += n;
    return { tokens: n, refund: 0 };
  }

  // --- The radio -------------------------------------------------------------------------------

  rackRoom() {
    return RACK_SIZE - this.s.rack.length;
  }

  _addRadio() {
    const s = this.s;
    const now = this.now();
    const dur = callMs(s.radios, this.tuning.callTime);
    const last = s.rack[s.rack.length - 1];
    const start = Math.max(now, last ? last.readyAt : 0);
    const radio = { n: s.radios, dur, readyAt: start + dur };
    s.radios += 1;
    s.stats.radios += 1;
    s.rack.push(radio);
    return radio;
  }

  /** The rack as the camp shows it: each radio answered, calling or waiting its turn. */
  rack() {
    const now = this.now();
    let calling = false;
    return this.s.rack.map((r) => {
      const left = r.readyAt - now;
      if (left <= 0) return { n: r.n, state: 'answered', left: 0, dur: r.dur, t: 1 };
      if (!calling) {
        calling = true;
        return { n: r.n, state: 'calling', left, dur: r.dur, t: clamp(1 - left / r.dur, 0, 1), readyAt: r.readyAt };
      }
      return { n: r.n, state: 'queued', left, dur: r.dur, t: 0, readyAt: r.readyAt };
    });
  }

  answered() {
    const now = this.now();
    return this.s.rack.filter((r) => r.readyAt <= now).length;
  }

  /** When the next call gets its answer (ms), or null with nothing calling. */
  nextAnswerAt() {
    const now = this.now();
    const r = this.s.rack.find((x) => x.readyAt > now);
    return r ? r.readyAt : null;
  }

  /**
   * Pick up the first answered call. Someone new moves into the camp; someone
   * you know sends tokens.
   */
  answer() {
    const s = this.s;
    const now = this.now();
    const idx = s.rack.findIndex((r) => r.readyAt <= now);
    if (idx < 0) return { ok: false, why: 'noanswer' };
    s.rack.splice(idx, 1);
    const res = this._rollCall();
    s.calls += 1;
    return res;
  }

  /** Everyone whose voice is out there at the stops reached so far. */
  voices(area = this.areaIndex()) {
    return CAST_ORDER.filter((id) => CAST[id].area <= area);
  }

  _rollCall() {
    const s = this.s;
    const rng = rngFor(s.seed, 'call', s.calls);
    const area = this.areaIndex();
    const pool = this.voices(area);
    const unknown = pool.filter((id) => !s.cast[id]);
    const weighted = (ids) => {
      const w = {};
      for (const id of ids) w[id] = RARITIES[CAST[id].rarity].call;
      return pickWeighted(rng, w);
    };
    const legend = unknown.find((id) => CAST[id].rarity === 'legendary');
    let id = null;
    let why = 'odds';
    const f = this.force.call;
    delete this.force.call;
    if (f && CAST[f] && pool.includes(f)) {
      id = f;
      why = 'forced';
    } else if (f && RARITIES[f] && pool.some((x) => CAST[x].rarity === f)) {
      const of = pool.filter((x) => CAST[x].rarity === f);
      const fresh = of.filter((x) => !s.cast[x]);
      id = pick(rng, fresh.length ? fresh : of);
      why = 'forced';
    } else if (s.calls === 0 && unknown.includes(START.firstCall)) {
      id = START.firstCall;
      why = 'first';
    } else if (legend && s.legendWait >= LEGEND_PITY - 1) {
      id = legend;
      why = 'pity';
    } else {
      // A fresh call reaches someone new (never the Legendary: that one is luck, or patience).
      const fresh = unknown.filter((x) => CAST[x].rarity !== 'legendary');
      if ((s.fresh > 0 || f === 'new') && fresh.length) {
        id = weighted(fresh);
        why = 'fresh';
      } else {
        const w = {};
        for (const r of RARITY_ORDER) if (pool.some((x) => CAST[x].rarity === r)) w[r] = RARITIES[r].call;
        const r = pickWeighted(rng, w);
        id = pick(
          rng,
          pool.filter((x) => CAST[x].rarity === r),
        );
      }
    }
    const rarity = CAST[id].rarity;
    const isNew = !s.cast[id];
    if (legend) s.legendWait = id === legend ? 0 : s.legendWait + 1;
    if (isNew && s.fresh > 0 && rarity !== 'legendary') s.fresh -= 1;
    const out = { ok: true, id, rarity, isNew, why, level: 1, tokens: 0, refund: 0 };
    if (isNew) {
      const avg = Math.round(mean(s.squad.map((x) => s.cast[x].level)));
      out.level = clamp(avg - ARRIVE_BELOW[rarity], 1, MAX_LEVEL - 1);
      s.cast[id] = newMember(out.level);
      s.stats.newcomers[rarity] += 1;
    } else {
      const n = this._stack(rng, id, area, CALL_STACK);
      const got = this._giveTokens(id, n, area);
      out.level = s.cast[id].level;
      out.tokens = got.tokens;
      out.refund = got.refund;
      s.stats.dupes += 1;
    }
    return out;
  }

  // --- A crate at the gate ---------------------------------------------------------------------

  /**
   * Call when the player comes back. After a while away there is sometimes a
   * crate at the gate with a few words on it in orange crayon. Nobody says who
   * leaves them.
   */
  comeBack() {
    const s = this.s;
    const now = this.now();
    const away = now - s.lastNow;
    if (away < 0) {
      // The device clock went backwards: no call takes longer because of it.
      for (const r of s.rack) r.readyAt += away;
    }
    let gift = null;
    if (!s.gift && s.runs >= GIFT.afterRuns && away >= GIFT.awayMs) {
      const rng = rngFor(s.seed, 'gift', s.gifts, Math.floor(now / GIFT.awayMs));
      if (rng() < GIFT.chance || this.force.gift) {
        const amount = Math.max(1, Math.round(randInt(rng, GIFT.supplies[0], GIFT.supplies[1]) * this.area().loot * this.tuning.supplies));
        gift = s.gift = { amount, line: pick(rng, GIFT.lines) };
      }
    }
    delete this.force.gift;
    s.lastNow = now;
    return { away, gift };
  }

  /** Keep `lastNow` moving while the page is open. */
  tick() {
    const now = this.now();
    if (now < this.s.lastNow) for (const r of this.s.rack) r.readyAt += now - this.s.lastNow;
    this.s.lastNow = now;
  }

  takeGift() {
    const g = this.s.gift;
    if (!g) return { ok: false };
    this.s.gift = null;
    this.s.gifts += 1;
    this.s.stats.gifts += 1;
    this._earn(g.amount);
    return { ok: true, ...g };
  }

  // --- What to do next -------------------------------------------------------------------------

  /** The first session is guided by a pointing hand; after that the glows do the job. */
  guiding() {
    const s = this.s;
    return s.runs < 4 || s.stats.levelUps < 2 || s.calls < 1;
  }

  /** The best next step: { kind: 'pick' | 'radio' | 'level' | 'squad' | 'gift' | 'play', id? }. */
  hint() {
    const s = this.s;
    if (s.haul) return { kind: 'pick' };
    if (this.answered() > 0) return { kind: 'radio' };
    const up = s.squad.find((id) => this.levelInfo(id).ok);
    if (up) return { kind: 'level', id: up };
    const better = this.betterBench();
    if (better) return { kind: 'squad', id: better.id };
    if (s.gift) return { kind: 'gift' };
    return { kind: 'play' };
  }

  // --- Testing tools ---------------------------------------------------------------------------

  cheat(kind, arg) {
    const s = this.s;
    switch (kind) {
      case 'supplies':
        s.supplies = Math.max(0, s.supplies + arg);
        return true;
      case 'tokens': // fill the squad's bars
        for (const id of s.squad) {
          const need = tokensFor(s.cast[id].level);
          if (need != null) s.cast[id].tokens = Math.max(s.cast[id].tokens, need);
        }
        return true;
      case 'radio':
        if (this.rackRoom() <= 0) return false;
        this._addRadio();
        return true;
      case 'answer': {
        // Every call gets its answer now.
        const now = this.now();
        for (const r of s.rack) r.readyAt = Math.min(r.readyAt, now);
        return s.rack.length > 0;
      }
      case 'stars':
        s.stars = Math.max(0, s.stars + arg);
        return true;
      case 'next': {
        // To the next stop (or to the ferry).
        const r = this.road();
        s.stars = Math.max(s.stars, r.to);
        return true;
      }
      case 'levels':
        for (const id of this.owned()) s.cast[id].level = Math.min(MAX_LEVEL, s.cast[id].level + 1);
        return true;
      case 'everyone':
        for (const id of CAST_ORDER) if (!s.cast[id]) s.cast[id] = newMember(1);
        return true;
      case 'gift': {
        if (s.gift) return false;
        const rng = rngFor(s.seed, 'cheatgift', s.gifts, s.runs);
        s.gift = { amount: Math.max(1, Math.round(randInt(rng, GIFT.supplies[0], GIFT.supplies[1]) * this.area().loot * this.tuning.supplies)), line: pick(rng, GIFT.lines) };
        return true;
      }
      default:
        return false;
    }
  }
}

export { CLASSES };
