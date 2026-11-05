// The computer opponent. A Bot plays one side of a Match through the same
// match.play() a person uses. It sees what a person sees (the beans and towers
// on the field, its own hand, next card and mana, the cards the other side
// plays; never the other hand or mana bar), notices new enemy beans only after
// a reaction delay, defends what comes over (in reach of its own tower), builds
// pushes (a front-liner from the back, support behind it once it crosses; bombs
// in front, they hurt friends), punishes a side that just spent its mana, and
// casts spells on clusters worth more than the spell or to finish a tower.
//
//   const bot = new Bot(match, 'red', { skill: 0.6, seed: 7 });
//   every fixed step: bot.update(DT); match.step();
//
// skill 0..1 scales the reaction time (~1.5 s -> ~0.3 s), how often it looks
// at the field, how precisely it places cards (the biggest effect), how well
// it picks counters and spells, how often it misses an attack for a few
// seconds, and mana discipline (careless bots hold mana for a whim and then
// play anything anywhere; careful ones count the other side's mana and don't
// sit at full). Each bot also gets a temper from its seed (patient .. hothead).
// Skill under 0.15 is the tutorial Training Dummy: slow, few cards, no spells.
//
// Deterministic: the same match, team and seed always make the same plays (it
// has its own Rng and reads only sim state). Positions are worked out in
// "forward" coordinates (p = distance from the bot's own back wall: blue
// p = x, red p = 1500 - x), so both sides play exactly alike.

import { WORLD, enemyOf } from '../config.js';
import { CARDS, CARD_ORDER, levelMul } from './cards.js';
import { SPELLS } from './spells.js';
import { TOWER_TAKES, GUARD } from './towers.js';
import { MANA_MAX, MANA_START, MANA_TIME } from './match.js';
import { DT } from './battle.js';
import { Rng } from './rng.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;

// Skill knobs: [at skill 0, at skill 1]. Mutable so the balance tool can try numbers.
export const BOT_TUNING = {
  react: [1.5, 0.3], // seconds before a new enemy bean is noticed
  tick: [0.7, 0.2], // seconds between looks at the field
  noise: [220, 10], // placement noise (px, sd): the biggest difference between a beginner and a good player
  choice: [0.8, 0.04], // score noise when picking a card (scores are ~0..1)
  defend: [2.6, 0.6], // defend when the unanswered attack is worth more than this (mana)
  wait: [0, 1], // share of good players who let attackers walk into their tower's range first
  supportGap: 0.3, // seconds between support cards for the same push
  meet: 210, // defenders go at most this far in front of our front tower (px)
  lapse: [0.6, 0.05], // chance to notice an attack late (2-6 s), per attack
  aggro: [0, 0.8], // range of the bot's temper (from its seed unless opts.aggro): 0 patient defender .. 1 all-out attacker
  spellValue: [0.75, 1.2], // a spell is cast when what it hits is worth >= this x its mana
  pushAt: [6, 6.5], // mana to start a push from the back (2 less in double mana; it waits for its support at the bridge)
  punishAt: [10, 6], // mana to rush the bridge when the other side has <= 3 (counted)
  reserve: [0, 0.5], // mana kept back for defence while supporting a push
  leak: [0, 0.4], // play something this close to full mana (0: may sit at full)
  careless: [1, -1], // > 0: holds mana for a whim (up to 10), then plays a random unit anywhere (skill 0: wholly; 0.5 up: never)
  count: 0.4, // from this skill on, the bot counts the other side's mana
  dummyBelow: 0.15, // skill under this: Training Dummy rules (no spells, long pauses)
  dummyGap: [8, 3], // ...seconds between its plays (at skill 0 and at dummyBelow)
};

/** Mana worth of one bean of each unit type (its first card's mana / count). */
export function unitValues() {
  const v = {};
  for (const id of CARD_ORDER) {
    const c = CARDS[id];
    if (c.kind === 'unit' && v[c.unit] == null) v[c.unit] = c.mana / (c.count || 1);
  }
  return v;
}

/** What a bean is, as far as countering it goes. */
const CLASS = { brick: 'siege', bruiser: 'tank', squire: 'armored', clubber: 'melee', spiker: 'swarm', archer: 'ranged', bomb: 'bomb', megabomb: 'bomb' };
const CLASSES = ['siege', 'tank', 'armored', 'melee', 'swarm', 'ranged', 'bomb'];

// How well each unit card stops each class of attacker (0..1), in CLASSES order.
const COUNTER = {
  clubbers: [0.9, 0.6, 0.6, 0.6, 0.5, 0.7, 0.2],
  squire: [0.5, 0.4, 0.5, 0.5, 0.4, 0.8, 0.2],
  archers: [0.7, 0.6, 0.3, 0.5, 0.4, 0.5, 0.8],
  spikers: [0.9, 0.5, 0.3, 0.4, 0.3, 0.7, 0.2],
  bomb: [0.9, 0.6, 0.6, 0.8, 0.9, 0.6, 0.2],
  clubberGang: [1, 0.8, 0.8, 0.8, 0.7, 0.7, 0.3],
  bruiser: [0.8, 0.6, 0.6, 0.8, 0.8, 0.6, 0.3],
  brick: [0, 0, 0, 0, 0, 0, 0],
  bombSquad: [1, 0.8, 0.7, 0.9, 0.9, 0.6, 0.2],
  megaBomb: [0.9, 0.7, 0.8, 1, 1, 0.8, 0.3],
  shieldWall: [0.7, 0.6, 0.6, 0.7, 0.6, 0.9, 0.3],
};

// On the attack: a 'tank' leads a push, 'support' follows one.
const TANK = { brick: 1, bruiser: 0.9, shieldWall: 0.85, clubberGang: 0.6, squire: 0.5 };
// Some attackers are worse for a tower than their mana says (fast swarms get their hits in)
const DANGER = { swarm: 1.5, siege: 1.2 };
// Bombs hurt (and fling) their own side too
const BOMBS = { bomb: 1, bombSquad: 1, megaBomb: 1 };
// Where a card goes when defending: behind the tower (ranged), under the attackers' noses (bombs), else in front of them
const DEFEND_AT = { archers: 'back', bomb: 'bomb', bombSquad: 'bomb', megaBomb: 'bomb' };

/** Damage a spell does to one bean (before levels). */
const spellDamage = (card) => {
  if (card.spell === 'boulder') return SPELLS.boulder.damage;
  if (card.spell === 'arrowRain') return SPELLS.arrowRain.damage * SPELLS.arrowRain.volleys;
  return SPELLS.wheel.damage;
};
// Seconds from casting to the damage (to aim where the beans will be)
const spellDelay = (card) => (card.spell === 'boulder' ? SPELLS.boulder.fall : card.spell === 'arrowRain' ? SPELLS.arrowRain.fall + SPELLS.arrowRain.gap : 0.4);

export class Bot {
  /** opts: { skill: 0..1, seed, aggro?: 0..1 (temper; default from the seed), tuning?: partial BOT_TUNING for this bot } */
  constructor(match, team, { skill = 0.5, seed = 1, aggro = null, tuning = null } = {}) {
    this.m = match;
    this.team = team;
    this.foe = enemyOf(team);
    this.skill = clamp(+skill || 0, 0, 1);
    this.seed = seed >>> 0 || 1;
    this.rng = new Rng((Math.imul(this.seed, 0x9e3779b1) ^ (team === 'blue' ? 0x1234567 : 0x7654321)) >>> 0);
    const k = this.skill;
    const T = tuning ? { ...BOT_TUNING, ...tuning } : BOT_TUNING;
    this.T = T;
    const at = (key) => lerp(T[key][0], T[key][1], k);
    this.react = at('react');
    this.tickT = at('tick');
    this.noise = at('noise');
    this.choiceNoise = at('choice');
    // Temper: how much it would rather attack than defend (people differ; it changes the shape of a match)
    const A = T.aggro;
    this.aggro = clamp(aggro != null ? +aggro : lerp(A[0], A[1], this.rng.next()) * (1 - 0.6 * k), 0, 1); // good players keep their cool
    this.defendNeed = at('defend') * (1 + 1.5 * this.aggro);
    this.waits = this.rng.next() < at('wait'); // lets attackers come to its tower
    this.lapse = at('lapse');
    this.alarm = false;
    this.busyUntil = -1;
    this.spellValue = at('spellValue');
    this.pushAt = at('pushAt');
    this.punishAt = at('punishAt');
    this.reserve = at('reserve');
    this.leak = at('leak');
    this.counts = k >= T.count;
    this.dummy = k < T.dummyBelow;
    this.gap = this.dummy ? lerp(T.dummyGap[0], T.dummyGap[1], k / T.dummyBelow) : 0;
    this.cool = 0.4 + this.rng.next() * this.tickT; // first look shortly after the start
    this.lastPlay = -99;
    this.lastSupport = -99;
    this.lastSpell = -99;
    this.want = this.rollWant(); // careless bots pick a random mana to wait for
    this.seen = new Map(); // enemy unit id -> match time first seen
    this.value = unitValues();
    this.foeMana = MANA_START; // counted from the cards the other side plays
    this.foePlayed = 0;
    this.log = []; // { t, card, x, why }
    this.stats = { plays: 0, spells: 0, defend: 0, push: 0, punish: 0, support: 0, spell: 0, finish: 0, leak: 0, whim: 0, chip: 0, idle: 0, full: 0 };
  }

  /** Call once per fixed step, before match.step(). */
  update(dt = DT) {
    const m = this.m;
    if (m.phase === 'over') return;
    this.countFoe(dt);
    if (m.sides[this.team].mana >= MANA_MAX - 1e-9) this.stats.full += dt; // seconds spent at full mana (wasted)
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = this.tickT * (0.75 + 0.5 * this.rng.next());
    this.think();
  }

  /** Mana counting: the other side's mana from the clock and the cards seen played (like a careful player). */
  countFoe(dt) {
    const s = this.m.sides[this.foe];
    this.foeMana = Math.min(MANA_MAX, this.foeMana + ((this.m.doubleMana ? 2 : 1) / MANA_TIME) * dt);
    while (this.foePlayed < s.played) {
      // The cards just played went to the back of their queue (and were on screen)
      const id = s.queue[s.queue.length - (s.played - this.foePlayed)];
      this.foeMana = Math.max(0, this.foeMana - (CARDS[id] ? CARDS[id].mana : 3));
      this.foePlayed++;
    }
  }

  // --- coordinates -------------------------------------------------------------------

  /** Forward position: distance from our own back wall. */
  fwd(x) {
    return this.team === 'blue' ? x : WORLD.width - x;
  }

  wx(p) {
    return this.team === 'blue' ? p : WORLD.width - p;
  }

  /** Our playable unit zone in forward coordinates [p0, p1]. */
  zoneP() {
    const [a, b] = this.m.zone(this.team);
    const p = [this.fwd(a), this.fwd(b)];
    return p[0] < p[1] ? p : [p[1], p[0]];
  }

  /** Careless bots hold their mana for a whim (3..10, sloppier = more random) and then play whatever; careful ones: 0. */
  rollWant() {
    const c = clamp(lerp(this.T.careless[0], this.T.careless[1], this.skill), 0, 1);
    return c > 0 ? lerp(MANA_MAX, 3 + this.rng.next() * 7, c) : 0;
  }

  // --- what the bot sees --------------------------------------------------------------

  view() {
    const m = this.m;
    const b = m.battle;
    const now = m.time;
    const enemies = [];
    const mine = [];
    for (const u of b.units) {
      if (!u.alive || u.gone) continue;
      const p = this.fwd(u.hip.x);
      if (u.team === this.team) {
        mine.push({ u, p, v: this.worth(u) });
        continue;
      }
      let t0 = this.seen.get(u.id);
      if (t0 == null) this.seen.set(u.id, (t0 = now));
      if (now - t0 < this.react) continue; // not noticed yet
      const vp = clamp(u.hip.vx(b.dt) * (this.team === 'blue' ? 1 : -1), -140, 140);
      enemies.push({ u, p, vp, v: this.worth(u), cls: CLASS[u.type.id] || 'melee' });
    }
    // Forget the dead now and then (the map would only grow)
    if (this.seen.size > 80) {
      const live = new Set(b.units.map((u) => u.id));
      for (const id of [...this.seen.keys()]) if (!live.has(id)) this.seen.delete(id);
    }
    const towers = { mine: [], theirs: [] };
    for (const t of b.towers) if (t.alive) (t.team === this.team ? towers.mine : towers.theirs).push(t);
    const front = towers.mine.find((t) => t.kind === 'guard') || towers.mine[0] || null;
    const frontP = front ? this.fwd(front.x) : 120;
    return { enemies, mine, towers, front, frontP, side: m.sides[this.team] };
  }

  /** Mana worth of a bean still standing (level and health scaled). */
  worth(u) {
    return (this.value[u.type.id] ?? 2) * u.dmgMul * clamp(u.hp / u.maxHp, 0, 1);
  }

  // --- thinking ------------------------------------------------------------------------

  think() {
    const m = this.m;
    const V = this.view();
    const side = V.side;
    const mana = side.mana;
    if (this.dummy) return this.thinkDummy(V);
    const hand = side.hand.map((id, i) => ({ i, id, card: CARDS[id] })).filter((h) => h.card);
    const ok = hand.filter((h) => h.card.mana <= mana + 1e-9);
    const dbl = m.doubleMana;
    const sudden = m.phase === 'overtime';

    // 1. A spell that finishes an enemy tower
    for (const h of ok) {
      if (h.card.kind !== 'spell') continue;
      const t = this.finishable(h, V);
      if (t && this.tryPlay(h, this.spellAt(h, t), 'finish')) return;
    }

    // 2. Defend what's coming over (unless busy with something else: people miss things)
    const threat = this.threat(V);
    const alarm = threat.need > this.defendNeed;
    if (alarm && !this.alarm && this.rng.next() < this.lapse) this.busyUntil = m.time + lerp(2, 6, this.rng.next());
    this.alarm = alarm;
    if (alarm && m.time >= this.busyUntil) {
      const pick = this.pickDefence(threat, V, hand, mana);
      if (pick && !pick.later) {
        if (pick.card.mana <= mana + 1e-9) {
          if (this.tryPlay(pick, pick.x, 'defend')) return;
        } else if (this.skill > 0.35 && this.aggro < 0.5) return; // save up for the right answer
      }
    }

    // 3. Spells on clusters that are worth it (not on top of one still landing)
    if (m.time - this.lastSpell > 1.6) {
      let best = null;
      for (const h of ok) {
        if (h.card.kind !== 'spell') continue;
        const s = this.bestSpellSpot(h, V);
        if (!s) continue;
        const ratio = s.value / h.card.mana;
        if (ratio >= this.spellValue && (!best || ratio > best.ratio)) best = { h, x: s.x, ratio };
      }
      if (best && this.tryPlay(best.h, best.x, 'spell')) return;
    }

    // Careless bots wait for a random amount of mana, then play something
    if (mana < this.want) return;
    const calm = threat.need < this.defendNeed || this.aggro > 0.7; // hotheads attack back instead

    // 4. Support a push that's on its way
    const push = this.push(V);
    const reserve = (dbl || sudden ? this.reserve * 0.4 : this.reserve) * (1 - this.aggro);
    if (push.v >= 2.5 && push.front >= WORLD.mid - 170 && push.v < 12 && m.time - this.lastSupport > this.T.supportGap) {
      const h = this.pickSupport(ok, mana - reserve, push);
      if (h && this.tryPlay(h, this.supportAt(h, push), 'support')) {
        this.lastSupport = m.time;
        return;
      }
    }

    // 5. Punish: they just spent their mana, rush the bridge
    if (calm && this.counts && this.foeMana <= 3 && mana >= this.punishAt - (dbl ? 1.5 : 0) && push.v < 2) {
      const h = this.pickTank(ok, true);
      if (h && this.tryPlay(h, this.bridgeAt(), 'punish')) return;
    }

    // 6. Start a push from the back (at the bridge in double mana and overtime: no time to walk)
    const late = (dbl ? 2 : 0) + (sudden || this.behindLate() ? 1.5 : 0);
    if (calm && mana >= clamp(this.pushAt - late - 2 * this.aggro, 3, MANA_MAX) && push.v < 2) {
      const h = this.pickTank(ok, false);
      if (h) {
        const fast = dbl || sudden || this.skill < 0.4;
        if (this.tryPlay(h, fast ? this.bridgeAt() : this.backAt(V), 'push')) return;
      }
    }

    // 7. Overtime is decided on the weakest tower: chip it with spare spells
    if (sudden && m.timeLeft < 20 && mana >= 7) {
      const t = V.towers.theirs.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const h = ok.find((c) => c.card.kind === 'spell');
      if (t && h && this.tryPlay(h, this.spellAt(h, t), 'chip')) return;
    }

    // 8. About to waste mana: play something cheap (careless bots: whatever they fancy, wherever)
    if (this.want > 0 && mana >= this.want) {
      const units = ok.filter((h) => h.card.kind === 'unit');
      const [z0, z1] = this.zoneP();
      if (units.length && this.tryPlay(units[(this.rng.next() * units.length) | 0], this.wx(lerp(z0 + 60, z1, this.rng.next())), 'whim')) return;
    }
    if (mana >= MANA_MAX - this.leak - 1e-9) {
      const h = this.pickCheap(ok);
      if (h && this.tryPlay(h, this.leakAt(h, V), 'leak')) return;
    }
  }

  /** Training Dummy: now and then a random unit somewhere on its half. No spells, no plan. */
  thinkDummy(V) {
    const m = this.m;
    if (m.time - this.lastPlay < this.gap) return;
    const side = V.side;
    const units = side.hand.map((id, i) => ({ i, id, card: CARDS[id] })).filter((h) => h.card && h.card.kind === 'unit' && h.card.mana <= side.mana);
    if (!units.length || side.mana < this.want) return;
    const h = units[(this.rng.next() * units.length) | 0];
    const [z0, z1] = this.zoneP();
    this.tryPlay(h, this.wx(lerp(z0 + 120, z1 - 40, this.rng.next())), 'idle');
  }

  /** Behind on crowns past the first minute: get more aggressive. */
  behindLate() {
    const c = this.m.crowns;
    return c[this.team] < c[this.foe] && this.m.time > 60;
  }

  /** Play hand card h at world x (clamped to what's legal). Returns true if played. */
  tryPlay(h, x, why) {
    const m = this.m;
    const card = h.card;
    let wx = x + this.rng.gauss() * this.noise * (card.kind === 'spell' ? 0.5 : 1);
    if (card.kind === 'spell') wx = clamp(wx, 0, WORLD.width);
    else {
      const [a, b] = m.zone(this.team);
      wx = clamp(wx, a, b);
    }
    if (m.canPlay(this.team, h.i, wx) || !m.play(this.team, h.i, wx)) return false;
    this.lastPlay = m.time;
    this.want = this.rollWant();
    this.stats.plays++;
    if (card.kind === 'spell') {
      this.stats.spells++;
      this.lastSpell = m.time;
    }
    this.stats[why] = (this.stats[why] || 0) + 1;
    this.log.push({ t: m.time, card: h.id, x: wx, why });
    return true;
  }

  // --- defence ---------------------------------------------------------------------------

  /**
   * How much attack is on its way to our towers that our own beans and towers
   * won't handle: { need (mana), lead (forward p of the closest attacker), group, mix, tv }.
   */
  threat(V) {
    const reach = Math.max(V.frontP + 430, WORLD.mid + 20); // on our half, or close to our front tower
    const group = V.enemies.filter((e) => e.p < reach);
    if (!group.length) return { need: 0, lead: Infinity, group, mix: null, tv: 0 };
    let tv = 0;
    let lead = Infinity;
    const mix = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    for (const e of group) {
      const v = e.v * (DANGER[e.cls] || 1);
      tv += v;
      mix[e.cls] += v;
      lead = Math.min(lead, e.p);
    }
    // Our beans that will meet them, and the tower helping (once they're in its range)
    let dv = 0;
    for (const o of V.mine) if (o.p > lead - 260 && o.p < lead + 160) dv += o.v;
    const f = V.front;
    const towerHelp = f && lead < V.frontP + GUARD.range ? (f.kind === 'castle' ? 2.2 : 1.6) * (f.hp / f.maxHp > 0.25 ? 1 : 0.5) : 0;
    return { need: tv - 0.85 * dv - towerHelp, lead, group, mix, tv };
  }

  /** The best answer in hand to a threat: { i, id, card, x, score, later } (maybe not affordable yet). */
  pickDefence(threat, V, hand, mana) {
    let best = null;
    const tv = Math.max(0.5, threat.tv);
    // Good players let attackers walk into their tower's range before dropping beans on them
    const early = this.waits && threat.lead > V.frontP + GUARD.range - 20;
    for (const h of hand) {
      const c = h.card;
      let fit;
      let x;
      if (c.kind === 'spell') {
        if (this.m.time - this.lastSpell < 1.6) continue;
        const s = this.bestSpellSpot(h, V, threat.group);
        if (!s || s.value < c.mana * this.spellValue * 0.8) continue; // a spell on defence still has to be worth it
        fit = clamp(s.value / Math.max(1, c.mana), 0, 1.3) * 0.85;
        x = s.x;
      } else {
        const row = COUNTER[h.id];
        if (!row || (h.id === 'megaBomb' && threat.tv < 4)) continue; // a Mega Bomb is for big pushes
        let f = 0;
        for (let k = 0; k < CLASSES.length; k++) f += row[k] * threat.mix[CLASSES[k]];
        fit = f / tv;
        x = this.defendAt(h, threat, V);
      }
      // Don't overspend: a card about the size of what's left to stop
      const size = Math.abs(c.mana - clamp(threat.need, 2, 7)) * 0.08;
      const wait = c.mana > mana ? (c.mana - mana) * 0.12 : 0; // has to wait for mana
      // Bombs on top of our own beans hurt (and fling) them too; a Mega Bomb's blast is huge
      const mega = h.id === 'megaBomb';
      const own = BOMBS[h.id] ? V.mine.filter((o) => Math.abs(o.p - threat.lead) < (mega ? 260 : 150)).length * (mega ? 0.3 : 0.12) : 0;
      const score = fit - size - wait - own + this.rng.gauss() * this.choiceNoise;
      if (fit > 0.25 && (!best || score > best.score)) best = { ...h, x, score, later: early && c.kind === 'unit' };
    }
    return best;
  }

  /** Where to drop a defender (world x). */
  defendAt(h, threat, V) {
    const [z0, z1] = this.zoneP();
    const P = threat.lead;
    const front = V.frontP;
    let p;
    const how = DEFEND_AT[h.id];
    if (how === 'back') p = Math.min(P - 250, front - 20);
    else if (how === 'bomb') p = P - (h.id === 'megaBomb' ? 70 : 100);
    else p = Math.min(P - 70, front + this.T.meet); // just in front of them, inside our tower's range
    return this.wx(clamp(p, z0, z1));
  }

  // --- spells ------------------------------------------------------------------------------

  /** An enemy tower this spell would finish off (or null). */
  finishable(h, V) {
    const lvl = levelMul(this.m.sides[this.team].levels[h.id] || 1);
    const dmg = spellDamage(h.card) * TOWER_TAKES.spell * lvl;
    let best = null;
    for (const t of V.towers.theirs) if (t.hp <= dmg * 0.97 && (!best || t.kind === 'castle')) best = t;
    return best;
  }

  /** Where to cast a spell so it reaches a tower (a wheel rolls toward the enemy, so start it short). */
  spellAt(h, t) {
    return h.card.spell === 'cheeseWheel' ? t.x - (this.team === 'blue' ? 1 : -1) * 200 : t.x;
  }

  /**
   * Best spot for a spell among the (noticed) enemies: { x, value } where value
   * is the mana worth of what it kills (partly what it hurts), towers included.
   */
  bestSpellSpot(h, V, group = V.enemies) {
    const card = h.card;
    if (!group.length) return null;
    const lvl = levelMul(this.m.sides[this.team].levels[h.id] || 1);
    const dmg = spellDamage(card) * lvl;
    const delay = spellDelay(card);
    // Predicted forward positions when the spell lands
    const pts = group.map((e) => ({ e, p: e.p + e.vp * delay })).sort((a, b) => a.p - b.p);
    const towerVal = (t) => ((dmg * TOWER_TAKES.spell) / t.maxHp) * (t.kind === 'castle' ? 12 : 6);
    const hitVal = (e) => {
      const frac = Math.min(1, dmg / Math.max(1, e.u.hp));
      return e.v * (frac >= 1 ? 1 : frac * 0.6) + (card.spell !== 'arrowRain' && e.cls !== 'siege' ? 0.15 : 0); // knockdowns are worth a little
    };
    let best = null;
    if (card.spell === 'cheeseWheel') {
      // Rolls forward from where it's cast: start it just behind the nearest one
      const D = SPELLS.wheel.dist;
      for (const s of pts) {
        const p0 = s.p - 25;
        let v = 0;
        for (const o of pts) if (o.p >= p0 - 10 && o.p <= p0 + D) v += hitVal(o.e);
        for (const t of V.towers.theirs) {
          const tp = this.fwd(t.x);
          if (tp >= p0 && tp <= p0 + D) v += towerVal(t);
        }
        if (!best || v > best.value) best = { x: clamp(this.wx(p0), 0, WORLD.width), value: v };
      }
      return best;
    }
    const R = card.radius;
    for (let i = 0; i < pts.length; i++) {
      // Centre on the cluster that starts here (everyone within the circle's width)
      let n = 0;
      let sum = 0;
      for (let j = i; j < pts.length && pts[j].p - pts[i].p <= R * 1.6; j++) {
        sum += pts[j].p;
        n++;
      }
      const c = sum / n;
      let v = 0;
      for (const o of pts) if (Math.abs(o.p - c) <= R + o.e.u.R * 0.5) v += hitVal(o.e);
      for (const t of V.towers.theirs) if (Math.abs(this.fwd(t.x) - c) <= R + t.w / 2) v += towerVal(t);
      if (!best || v > best.value) best = { x: clamp(this.wx(c), 0, WORLD.width), value: v };
    }
    return best;
  }

  // --- attack --------------------------------------------------------------------------------

  /** Our beans out in front of our tower, on their way: { v, front, rear } (forward p). */
  push(V) {
    let v = 0;
    let front = -Infinity;
    let rear = Infinity;
    for (const o of V.mine) {
      if (o.p < V.frontP + 100) continue; // still at home
      v += o.v;
      front = Math.max(front, o.p);
      rear = Math.min(rear, o.p);
    }
    return { v, front, rear };
  }

  /** A support card that fits in the mana we're willing to spend. */
  pickSupport(cands, spend, push) {
    let best = null;
    const [, z1] = this.zoneP();
    for (const h of cands) {
      const c = h.card;
      if (c.kind !== 'unit' || c.mana > spend + 1e-9 || h.id === 'brick') continue;
      // Bombs blow up friends too: they only join a push if they can go in front of it (a Mega Bomb never: too slow)
      if (BOMBS[h.id] && (push.front > z1 - 40 || h.id === 'megaBomb')) continue;
      const score = 1 - (TANK[h.id] || 0) * 0.6 - c.mana * 0.03 + this.rng.gauss() * this.choiceNoise * 2;
      if (!best || score > best.score) best = { ...h, score };
    }
    return best;
  }

  /** Support goes behind the front of the push (archers further back, bombs out in front). */
  supportAt(h, push) {
    const [z0, z1] = this.zoneP();
    const back = h.id === 'archers' ? 120 : BOMBS[h.id] ? -70 : 50;
    return this.wx(clamp(Math.min(push.front, z1) - back, z0, z1));
  }

  /** A card to lead a push with: a cheap front-liner from the back, or (rush) anything that hits hard right away. */
  pickTank(cands, rush) {
    let best = null;
    for (const h of cands) {
      const c = h.card;
      if (c.kind !== 'unit') continue;
      const tank = TANK[h.id] || 0;
      // From the back: a front-liner that leaves mana for the support that joins it at the bridge
      const score = (rush ? 0.5 + tank * 0.5 - (h.id === 'brick' ? 0.3 : 0) + c.mana * 0.04 : tank * 0.7 - c.mana * 0.1) + this.rng.gauss() * this.choiceNoise * 2;
      if (!best || score > best.score) best = { ...h, score };
    }
    return best;
  }

  /** At the bridge (or deep in the pocket once their Guard Tower is down), just out of their tower's reach. */
  bridgeAt() {
    const [z0, z1] = this.zoneP();
    return this.wx(clamp(z1 - 25, z0, z1));
  }

  /** Behind our own front tower: a slow push that gathers support on the way. */
  backAt(V) {
    const [z0, z1] = this.zoneP();
    return this.wx(clamp(V.frontP - 110, z0, z1));
  }

  /** The cheapest thing worth playing when mana is about to overflow. */
  pickCheap(cands) {
    let best = null;
    for (const h of cands) {
      const c = h.card;
      if (c.kind === 'spell') continue;
      const score = -c.mana * 0.15 + (TANK[h.id] || 0) * 0.3 + this.rng.gauss() * this.choiceNoise * 2;
      if (!best || score > best.score) best = { ...h, score };
    }
    return best;
  }

  /** Overflow plays: from the back (careful bots) or anywhere (careless ones). */
  leakAt(h, V) {
    const [z0, z1] = this.zoneP();
    if (this.skill < 0.4) return this.wx(lerp(z0 + 80, z1, this.rng.next()));
    return this.wx(clamp(V.frontP - (TANK[h.id] ? 110 : 40), z0, z1));
  }
}
