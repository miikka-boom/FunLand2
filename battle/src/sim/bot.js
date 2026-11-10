// The computer opponent. A Bot plays one side of a Match through the same
// match.play() a person uses. It sees what a person sees (the beans, towers,
// buildings and spells on the field, its own hand, next card and mana, the
// cards the other side plays; never the other hand or mana bar), notices new
// enemy beans only after a reaction delay, defends what comes over (in reach
// of its own tower), builds pushes (a front-liner from the back, support
// behind it once it crosses; bombs in front, they hurt friends), punishes a
// side that just spent its mana, and casts spells on clusters worth more than
// the spell or to finish a tower.
//
// It knows every kind of card: fliers (and it only ever answers them with
// something that reaches them up there), buildings (dropped in front of its
// own tower to pull a push in, at a legal spot), the Bean Patch, traps (peels
// in front of an incoming push), spells that help its own side (wrap a push
// about to meet them), Brollies that land anywhere (on a back line, a tower
// that's nearly down or a building) and the structure hunters (a Pogo never
// goes into a standing building).
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
import { GUARD, takesOf } from './towers.js';
import { BUILDINGS, BUILD_GAP, MAX_BUILDINGS, fitBuilding } from './buildings.js';
import { UNIT_TYPES, AIR_MIN } from './unit-types.js';
import { MANA_MAX, MANA_START, MANA_TIME, ANYWHERE } from './match.js';
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
export const CLASS = {
  brick: 'siege',
  bruiser: 'tank',
  squire: 'armored',
  clubber: 'melee',
  spiker: 'swarm',
  archer: 'ranged',
  bomb: 'bomb',
  megabomb: 'bomb',
  sprout: 'swarm',
  copter: 'air',
  pogo: 'siege',
  netter: 'melee',
  juggler: 'ranged',
  nutcracker: 'melee',
  brolly: 'melee',
  drummer: 'ranged', // (a squishy back line)
  pelican: 'air',
  jelly: 'tank',
};
export const CLASSES = ['siege', 'tank', 'armored', 'melee', 'swarm', 'ranged', 'bomb', 'air'];
const AIR = CLASSES.indexOf('air');

// How well each unit or building card stops each class of attacker (0..1), in CLASSES order.
export const COUNTER = {
  clubbers: [0.9, 0.6, 0.6, 0.6, 0.5, 0.7, 0.2, 0],
  squire: [0.5, 0.4, 0.5, 0.5, 0.4, 0.8, 0.2, 0],
  archers: [0.7, 0.6, 0.3, 0.5, 0.4, 0.5, 0.8, 0.9],
  spikers: [0.9, 0.5, 0.3, 0.4, 0.3, 0.7, 0.2, 0],
  bomb: [0.9, 0.6, 0.6, 0.8, 0.9, 0.6, 0.2, 0],
  clubberGang: [1, 0.8, 0.8, 0.8, 0.7, 0.7, 0.3, 0],
  bruiser: [0.8, 0.6, 0.6, 0.8, 0.8, 0.6, 0.3, 0],
  brick: [0, 0, 0, 0, 0, 0, 0, 0],
  bombSquad: [1, 0.8, 0.7, 0.9, 0.9, 0.6, 0.2, 0.1],
  megaBomb: [0.9, 0.7, 0.8, 1, 1, 0.8, 0.3, 0.3],
  shieldWall: [0.7, 0.6, 0.6, 0.7, 0.6, 0.9, 0.3, 0],
  sprouts: [0.6, 0.3, 0.2, 0.3, 0.3, 0.5, 0.5, 0],
  propellerPals: [0.8, 0.6, 0.4, 0.6, 0.3, 0.5, 0.6, 0],
  pogoBean: [0, 0, 0, 0, 0, 0, 0, 0],
  netter: [0.5, 0.3, 0.4, 0.5, 0.3, 0.6, 0.3, 1.0],
  bombJuggler: [0.6, 0.6, 0.4, 0.8, 1.0, 0.6, 0.6, 0.8],
  nutcracker: [1.0, 1.0, 0.9, 0.6, 0.2, 0.5, 0.4, 0],
  brollyBrigade: [0.4, 0.3, 0.3, 0.5, 0.4, 0.8, 0.3, 0],
  tummyDrummer: [0, 0, 0, 0, 0, 0, 0, 0],
  pelican: [0.3, 0, 0.4, 0.7, 0.4, 0.9, 0.6, 0],
  bigJelly: [0.6, 0.5, 0.6, 0.8, 0.8, 0.6, 0.5, 0],
  boingBox: [0.9, 0.4, 0.5, 0.8, 0.4, 0.2, 0.8, 0],
  beanPatch: [0.9, 0.5, 0.3, 0.5, 0.4, 0.3, 0.4, 0],
  wreckingCrane: [0.9, 0.7, 0.8, 1.0, 0.9, 0.2, 0.7, 0.4],
};

// On the attack: a 'tank' leads a push, 'support' follows one.
export const TANK = { brick: 1, bruiser: 0.9, shieldWall: 0.85, clubberGang: 0.6, squire: 0.5, bigJelly: 0.9, nutcracker: 0.3 };
// Win conditions that rush on their own (a punish, a late push at the bridge), never support
export const RUSH = { pogoBean: 1 };
// Some attackers are worse for a tower than their mana says (fast swarms get their hits in; fliers skip the front line)
const DANGER = { swarm: 1.5, siege: 1.2, air: 1.2 };
// Bombs hurt (and fling) their own side too
const BOMBS = { bomb: 1, bombSquad: 1, megaBomb: 1 };
// Where a card goes when defending: behind the tower (ranged), under the attackers' noses (bombs), right under
// the lead flier (the Netter), in front of our tower (buildings), back home (the Pelican flies to them), on
// their back line (Brollies), else in front of them
const DEFEND_AT = {
  archers: 'back',
  bomb: 'bomb',
  bombSquad: 'bomb',
  megaBomb: 'bomb',
  netter: 'under',
  bombJuggler: 'back',
  boingBox: 'front',
  beanPatch: 'front',
  wreckingCrane: 'front',
  pelican: 'sky',
  brollyBrigade: 'anywhere',
};
// Buildings go this far in front of our front tower (forward px; at least clear of it, BUILD_GAP)...
const BUILD_AT = { boingBox: 40, beanPatch: 60, wreckingCrane: 70 };
const PATCH_IDLE = 100; // ...a Bean Patch played with nothing coming goes a bit further out
const PATCH_MANA = 8; // (and only with this much mana to spare)
// A building goes down ahead of a big ground push still on their half (worth this much), with none of ours
// standing and this long since the last one
const AHEAD_TV = 5;
const AHEAD_GAP = 12;
// What a standing building of ours is worth to a defence near it (mana, at full health)
const BUILD_HELP = { boingBox: 1.2, beanPatch: 0.8, wreckingCrane: 2.5 };
// Support goes this far behind the front of the push (bombs in front: -70; everyone else 50)
const SUPPORT_BACK = { archers: 120, bombJuggler: 120, tummyDrummer: 90, pelican: 150 };
const SUPPORT_BONUS = { tummyDrummer: 0.25 }; // the push amplifier, once there's a push worth drumming for...
const DRUM_PUSH = 4; // ...this much (mana)
const CHEAP = { sprouts: 0.1 }; // cheap leaks: the 1-mana bait first
// Brolly Brigade: the back line it drops on, a tower this weak it finishes, what a building's worth to it
const BACKLINE = { archer: 1, juggler: 1, drummer: 1, netter: 1 };
const BROLLY_TOWER = 0.25;
const BROLLY_CLEAR = 200; // px from the nearest enemy melee bean to its target
const BROLLY_MIN = 2.5; // a drop has to hit something worth this much (mana)...
const BROLLY_GAP = 5; // ...and comes this long after the last one
const BROLLY_VS = { beanPatch: 1, boingBox: 0.7, wreckingCrane: 0.4 }; // (a Crane swings at whoever lands by it)
const ANY_NOISE = 0.7; // placement noise for deploy-anywhere cards (x the unit noise)...
const BUILD_NOISE = 0.5; // ...buildings (it fits them to a legal spot)...
const ANVIL_NOISE = 0.25; // ...and the Anvil, aimed with care at one bean (other spells: 0.5)
const AIRY = 0.5; // a threat with this share in the air only gets answers that reach the air
const NET_REACH = UNIT_TYPES.netter.airReach; // fliers cruising above this are out of a Netter's reach
const FLOAT_FALL = UNIT_TYPES.brolly.float.vMax + 20; // px/s: how fast a Brolly floats down
const HEAVY = SPELLS.bananaPeels.heavyMass; // heavies skid on peels and barely lift in a soda

// Spells that reach beans high in the air (the rest only hit what's on the ground)
const SPELL_AIR = { arrowRain: 1, bigSneeze: 1, shakenSoda: 1, anvil: 1 };
// Spells that never touch a tower (no finishing, no chipping with them)
const NO_TOWER = { bananaPeels: 1, bubbleWrap: 1 };
const SODA_FALL = 20; // the soda's fall on top of its damage (light beans)
const SNEEZE_NEAR = 220; // a Big Sneeze is worth what it blows back from this close to our front tower
const PEEL_LEAD = 0.6; // Banana Peels go this many seconds of walking ahead of the lead...
const PEEL_SLIPS = 2; // ...and a bean that walks across the circle slips about this often
const PEEL_MANA = 0.35; // mana worth of one slip (a second of free bolts)
const WRAP_PUSH = 5; // Bubble Wrap: a push worth this much...
const WRAP_MEET = 260; // ...this close to their beans (or in their tower's range)...
const WRAP_MIN = 3; // ...with this many of ours in the circle...
const WRAP_GAP = 10; // ...once per push (s)

/** Damage a spell does to one bean (before levels). */
const spellDamage = (card) => {
  const s = card.spell;
  if (s === 'boulder') return SPELLS.boulder.damage;
  if (s === 'arrowRain') return SPELLS.arrowRain.damage * SPELLS.arrowRain.volleys;
  if (s === 'bananaPeels') return SPELLS.bananaPeels.damage;
  if (s === 'bigSneeze') return SPELLS.bigSneeze.damage;
  if (s === 'shakenSoda') return SPELLS.shakenSoda.damage + SODA_FALL;
  if (s === 'anvil') return SPELLS.anvil.damage;
  if (s === 'bubbleWrap') return 0;
  return SPELLS.wheel.damage;
};
/** ...and to a tower or building (before its share and levels): the soda's fall doesn't count there. */
const towerDamage = (card) => (NO_TOWER[card.spell] ? 0 : card.spell === 'shakenSoda' ? SPELLS.shakenSoda.damage : spellDamage(card));
// Seconds from casting to the damage (to aim where the beans will be)
const spellDelay = (card) =>
  card.spell === 'boulder'
    ? SPELLS.boulder.fall
    : card.spell === 'arrowRain'
      ? SPELLS.arrowRain.fall + SPELLS.arrowRain.gap
      : card.spell === 'shakenSoda'
        ? SPELLS.shakenSoda.fuse
        : card.spell === 'anvil'
          ? SPELLS.anvil.fall
          : 0.4;

/** How well a card answers beans high in the air (0: it can't touch them up there). */
export function airValue(id) {
  const c = CARDS[id];
  if (!c) return 0;
  if (c.kind === 'spell') return SPELL_AIR[c.spell] ? 1 : 0;
  const row = COUNTER[id];
  return row ? row[AIR] : 0;
}

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
    this.lastWrap = -99;
    this.lastDrop = -99;
    this.lastBuild = -99;
    this.want = this.rollWant(); // careless bots pick a random mana to wait for
    this.seen = new Map(); // enemy unit id -> match time first seen
    this.value = unitValues();
    this.foeMana = MANA_START; // counted from the cards the other side plays
    this.foePlayed = 0;
    // Its own deck holds something that reaches fliers (worth saving up for when they come)
    this.airAnswers = (match.sides[team] ? match.sides[team].deck : []).some((id) => airValue(id) > 0);
    this.log = []; // { t, card, x, why, air? (the threat's share in the air, on defence) }
    this.stats = { plays: 0, spells: 0, defend: 0, push: 0, punish: 0, support: 0, spell: 0, finish: 0, leak: 0, whim: 0, chip: 0, idle: 0, full: 0, rescue: 0, wrap: 0, drop: 0, build: 0, ahead: 0 };
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

  /** A world range [a, b] in forward coordinates, low end first. */
  toP([a, b]) {
    const p = [this.fwd(a), this.fwd(b)];
    return p[0] < p[1] ? p : [p[1], p[0]];
  }

  /** Our playable unit zone in forward coordinates [p0, p1]. */
  zoneP() {
    return this.toP(this.m.zone(this.team));
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
    // Towers and buildings apart: buildings give no crowns, don't shoot and only ever stand in their own zone
    const towers = { mine: [], theirs: [] };
    const buildings = { mine: [], theirs: [] };
    for (const t of b.towers) {
      if (!t.alive) continue;
      const list = t.kind === 'building' ? buildings : towers;
      (t.team === this.team ? list.mine : list.theirs).push(t);
    }
    const front = towers.mine.find((t) => t.kind === 'guard') || towers.mine[0] || null;
    const frontP = front ? this.fwd(front.x) : 120;
    return { enemies, mine, towers, buildings, front, frontP, side: m.sides[this.team] };
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

    // 0. One of ours in a beak or inside a jelly: ACHOO, and it drops it
    for (const h of ok) {
      if (h.card.spell !== 'bigSneeze') continue;
      const x = this.rescueAt(V);
      if (x != null && this.tryPlay(h, x, 'rescue')) return;
    }

    // 1. A spell that finishes an enemy tower (or Brollies onto one that's nearly down)
    for (const h of ok) {
      if (h.card.kind !== 'spell') continue;
      const t = this.finishable(h, V);
      if (t && this.tryPlay(h, this.spellAt(h, t), 'finish')) return;
    }
    for (const h of ok) {
      if (!h.card.anywhere) continue;
      const s = this.anywhereAt(V);
      if (s && s.what === 'tower' && this.tryPlay(h, s.x, 'finish')) {
        this.lastDrop = m.time;
        return;
      }
    }

    // 2. Defend what's coming over (unless busy with something else: people miss things)
    const threat = this.threat(V);
    const alarm = threat.need > this.defendNeed;
    if (alarm && !this.alarm && this.rng.next() < this.lapse) this.busyUntil = m.time + lerp(2, 6, this.rng.next());
    this.alarm = alarm;
    let holdAir = false; // fliers coming and nothing in hand that reaches them: no pushes until an answer turns up
    if (alarm && m.time >= this.busyUntil) {
      const pick = this.pickDefence(threat, V, hand, mana);
      if (pick && !pick.later) {
        if (pick.card.mana <= mana + 1e-9) {
          if (this.tryPlay(pick, pick.x, 'defend', { air: threat.air })) return;
        } else if (this.skill > 0.35 && this.aggro < 0.5) return; // save up for the right answer
      } else if (!pick && threat.air >= AIRY && this.airAnswers && this.skill > 0.35 && this.aggro < 0.5) holdAir = true;
    }

    // 3. Spells on clusters that are worth it (not on top of one still landing; peels only in front of a threat)
    if (m.time - this.lastSpell > 1.6) {
      let best = null;
      for (const h of ok) {
        if (h.card.kind !== 'spell') continue;
        const s = this.bestSpellSpot(h, V, h.card.spell === 'bananaPeels' ? threat.group : V.enemies);
        if (!s) continue;
        const ratio = s.value / h.card.mana;
        if (ratio >= this.spellValue && (!best || ratio > best.ratio)) best = { h, x: s.x, ratio };
      }
      if (best && this.tryPlay(best.h, best.x, 'spell')) return;
    }

    // Careless bots wait for a random amount of mana, then play something
    if (mana < this.want) return;
    const calm = threat.need < this.defendNeed || this.aggro > 0.7; // hotheads attack back instead

    // A big ground push on its way over (still on their half) and a building in hand for it: down in its
    // path now, or (careful players) the mana kept for it rather than spent on something else
    let saving = holdAir;
    if (!holdAir && calm) {
      const a = this.buildAhead(hand, V, mana);
      if (a && a.h && this.tryPlay(a.h, a.x, 'ahead')) return;
      if (a && a.save) saving = true;
    }

    // 4. Support a push that's on its way (and wrap it before it meets them)
    const push = this.push(V);
    const reserve = (dbl || sudden ? this.reserve * 0.4 : this.reserve) * (1 - this.aggro);
    if (m.time - this.lastWrap > WRAP_GAP) {
      const h = ok.find((c) => c.card.spell === 'bubbleWrap');
      const x = h && h.card.mana <= mana - reserve + 1e-9 ? this.wrapSpot(h, V, push) : null;
      if (x != null && this.tryPlay(h, x, 'wrap')) {
        this.lastWrap = m.time;
        return;
      }
    }
    if (!saving && push.v >= 2.5 && push.front >= WORLD.mid - 170 && push.v < 12 && m.time - this.lastSupport > this.T.supportGap) {
      const h = this.pickSupport(ok, mana - reserve, push);
      if (h && this.tryPlay(h, this.supportAt(h, push), 'support')) {
        this.lastSupport = m.time;
        return;
      }
    }

    // 4b. A second front: Brollies onto their back line or a building of theirs
    if (calm && !saving && m.time - this.lastDrop > BROLLY_GAP) {
      const h = ok.find((c) => c.card.anywhere && c.card.mana <= mana - reserve + 1e-9);
      const s = h ? this.anywhereAt(V) : null;
      if (s && s.value >= BROLLY_MIN && this.tryPlay(h, s.x, 'drop')) {
        this.lastDrop = m.time;
        return;
      }
    }

    // 5. Punish: they just spent their mana, rush the bridge
    if (!saving && calm && this.counts && this.foeMana <= 3 && mana >= this.punishAt - (dbl ? 1.5 : 0) && push.v < 2) {
      const h = this.pickTank(ok, true, V);
      if (h && this.tryPlay(h, this.bridgeAt(), 'punish')) return;
    }

    // 5b. Nothing coming and mana to spare: a Bean Patch in front of our tower (slow pressure)
    if (!saving && threat.need <= 0 && mana >= PATCH_MANA) {
      const h = ok.find((c) => c.id === 'beanPatch');
      const x = h && this.roomToBuild(V) ? this.buildAt(h, V, PATCH_IDLE) : null;
      if (x != null && this.tryPlay(h, x, 'build')) return;
    }

    // 6. Start a push from the back (at the bridge in double mana and overtime: no time to walk)
    const late = (dbl ? 2 : 0) + (sudden || this.behindLate() ? 1.5 : 0);
    if (!saving && calm && mana >= clamp(this.pushAt - late - 2 * this.aggro, 3, MANA_MAX) && push.v < 2) {
      const fast = dbl || sudden || this.skill < 0.4;
      const h = this.pickTank(ok, false, V, fast);
      if (h) {
        if (this.tryPlay(h, fast ? this.bridgeAt() : this.backAt(V), 'push')) return;
      }
    }

    // 7. Overtime is decided on the weakest tower: chip it with spare spells
    if (sudden && m.timeLeft < 20 && mana >= 7) {
      const t = V.towers.theirs.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const h = ok.find((c) => c.card.kind === 'spell' && !NO_TOWER[c.card.spell]);
      if (t && h && this.tryPlay(h, this.spellAt(h, t), 'chip')) return;
    }

    // 8. About to waste mana: play something cheap (careless bots: whatever they fancy, wherever)
    if (this.want > 0 && mana >= this.want) {
      const units = ok.filter((h) => h.card.kind === 'unit');
      const [z0, z1] = this.zoneP();
      if (units.length && this.tryPlay(units[(this.rng.next() * units.length) | 0], this.wx(lerp(z0 + 60, z1, this.rng.next())), 'whim')) return;
    }
    if (mana >= MANA_MAX - this.leak - 1e-9) {
      // Nothing coming and none of ours standing: a building ready for the next push beats spilling mana
      if (threat.need <= 0 && !V.buildings.mine.length) {
        const b = ok.find((c) => c.card.kind === 'building');
        const x = b ? this.buildAt(b, V) : null;
        if (x != null && this.tryPlay(b, x, 'build')) return;
      }
      const h = this.pickCheap(ok);
      if (h && this.tryPlay(h, this.leakAt(h, V), 'leak')) return;
      if (!h) this.leakRest(ok, V);
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

  /**
   * Play hand card h at world x (made legal: a unit inside our zone, a
   * deploy-anywhere unit inside ANYWHERE, a building fitted to a free spot in
   * our own deploy zone, a spell on the field). Returns true if played.
   */
  tryPlay(h, x, why, info = null) {
    const m = this.m;
    const card = h.card;
    let wx = x + this.rng.gauss() * this.noise * (card.kind === 'spell' ? (card.spell === 'anvil' ? ANVIL_NOISE : 0.5) : card.kind === 'building' ? BUILD_NOISE : card.anywhere ? ANY_NOISE : 1);
    if (card.kind === 'spell') wx = clamp(wx, 0, WORLD.width);
    else if (card.kind === 'building') {
      // fitBuilding slides it to the nearest free spot; if there's none near where the hand slipped, where it meant to
      wx = fitBuilding(m.battle, this.team, card.building, wx) ?? fitBuilding(m.battle, this.team, card.building, x);
      if (wx == null) return false;
    } else if (card.anywhere) wx = clamp(wx, ANYWHERE[0], ANYWHERE[1]);
    else {
      const [a, b] = m.zone(this.team);
      wx = clamp(wx, a, b);
    }
    if (m.canPlay(this.team, h.i, wx) || !m.play(this.team, h.i, wx)) return false;
    this.lastPlay = m.time;
    this.want = this.rollWant();
    this.stats.plays++;
    if (card.kind === 'building') this.lastBuild = m.time;
    if (card.kind === 'spell') {
      this.stats.spells++;
      if (card.spell !== 'bubbleWrap') this.lastSpell = m.time; // (a wrap on our own beans never gets in the way of a spell on theirs)
    }
    this.stats[why] = (this.stats[why] || 0) + 1;
    this.log.push(info ? { t: m.time, card: h.id, x: wx, why, ...info } : { t: m.time, card: h.id, x: wx, why });
    return true;
  }

  // --- defence ---------------------------------------------------------------------------

  /**
   * How much attack is on its way to our towers that our own beans, buildings
   * and towers won't handle: { need (mana), lead (forward p of the closest
   * attacker), groundLead, airLead, group, mix, tv, air (share of the threat
   * up in the air), highV (worth of fliers cruising above a Netter's reach),
   * aa (share that shoots fliers down) }. Our beans that can't hit air only
   * count against the part of it on the ground. A longer `reach` also looks at
   * a push still on their half (the beans already walking our way).
   */
  threat(V, reach = Math.max(V.frontP + 430, WORLD.mid + 20)) {
    // (by default: on our half, or close to our front tower; further out, only beans already on their way over)
    const near = Math.max(V.frontP + 430, WORLD.mid + 20);
    const group = V.enemies.filter((e) => e.p < reach && (e.p < near || e.vp < -10));
    if (!group.length) return { need: 0, lead: Infinity, groundLead: Infinity, airLead: Infinity, group, mix: null, tv: 0, air: 0, highV: 0, aa: 0 };
    let tv = 0;
    let lead = Infinity;
    let groundLead = Infinity;
    let airLead = Infinity;
    let highV = 0;
    let aaV = 0;
    const mix = Object.fromEntries(CLASSES.map((c) => [c, 0]));
    for (const e of group) {
      const v = e.v * (DANGER[e.cls] || 1);
      tv += v;
      mix[e.cls] += v;
      lead = Math.min(lead, e.p);
      if (e.cls !== 'air') groundLead = Math.min(groundLead, e.p);
      else {
        airLead = Math.min(airLead, e.p);
        if (e.u.type.flying && e.u.type.flying.alt > NET_REACH) highV += v;
      }
      if (e.u.type.hitsAir) aaV += v;
    }
    const air = tv > 0 ? mix.air / tv : 0;
    // Our beans that will meet them, our buildings by them, and the tower helping (once they're in its range)
    let dv = 0;
    for (const o of V.mine) if (o.p > lead - 260 && o.p < lead + 160) dv += o.v * (o.u.type.hitsAir ? 1 : 1 - air);
    const f = V.front;
    const towerHelp = f && lead < V.frontP + GUARD.range ? (f.kind === 'castle' ? 2.2 : 1.6) * (f.hp / f.maxHp > 0.25 ? 1 : 0.5) : 0;
    let built = 0;
    for (const t of V.buildings.mine) if (Math.abs(this.fwd(t.x) - lead) < 220) built += (BUILD_HELP[t.bid] || 1) * clamp(t.hp / t.maxHp, 0, 1) * (1 - air);
    return { need: tv - 0.85 * dv - towerHelp - built, lead, groundLead, airLead, group, mix, tv, air, highV, aa: tv > 0 ? aaV / tv : 0 };
  }

  /** The best answer in hand to a threat: { i, id, card, x, score, later } (maybe not affordable yet). */
  pickDefence(threat, V, hand, mana) {
    let best = null;
    const tv = Math.max(0.5, threat.tv);
    // Good players let attackers walk into their tower's range before dropping beans on them
    const early = this.waits && threat.lead > V.frontP + GUARD.range - 20;
    const airy = threat.air >= AIRY; // mostly fliers: only what reaches them will do
    for (const h of hand) {
      const c = h.card;
      if (airy && !(airValue(h.id) > 0)) continue; // never answer fliers with a card that can't touch them
      let fit;
      let x;
      if (c.kind === 'spell') {
        if (this.m.time - this.lastSpell < 1.6 || c.spell === 'bubbleWrap') continue; // (the wrap is for our own pushes)
        const s = this.bestSpellSpot(h, V, threat.group);
        if (!s || s.value < c.mana * this.spellValue * 0.8) continue; // a spell on defence still has to be worth it
        fit = clamp(s.value / Math.max(1, c.mana), 0, 1.3) * 0.85;
        x = s.x;
      } else {
        const row = COUNTER[h.id];
        if (!row || (h.id === 'megaBomb' && threat.tv < 4)) continue; // a Mega Bomb is for big pushes
        if (c.kind === 'building' && !this.buildingFor(h, threat, V)) continue;
        if (h.id === 'propellerPals' && threat.aa > 0.2) continue; // (only against beans that can't shoot them down)
        let f = 0;
        for (let k = 0; k < CLASSES.length; k++) f += row[k] * threat.mix[CLASSES[k]];
        const T = UNIT_TYPES[c.unit];
        if (threat.highV > 0 && T && T.airReach) f -= row[AIR] * threat.highV * 0.5; // (a Pelican cruises above a Netter's reach)
        fit = f / tv;
        x = c.kind === 'building' ? this.buildAt(h, V) : this.defendAt(h, threat, V);
        if (x == null) continue; // (no room for it)
        if (c.kind === 'building') fit -= 0.2 * V.buildings.mine.filter((t) => Math.abs(t.x - x) < 150).length; // one fort, not a pile
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
    // Ground answers meet the part of it on the ground (fliers sail over them)
    const P = airValue(h.id) > 0 || threat.groundLead === Infinity ? threat.lead : threat.groundLead;
    const front = V.frontP;
    let p;
    const how = DEFEND_AT[h.id];
    if (how === 'back') p = Math.min(P - 250, front - 20);
    else if (how === 'bomb') p = P - (h.id === 'megaBomb' ? 70 : 100);
    else if (how === 'under') p = threat.airLead < Infinity ? threat.airLead : Math.min(P - 70, front + this.T.meet);
    else if (how === 'sky') p = front - 60;
    else if (how === 'anywhere') {
      const s = this.backlineAt(threat.group, V);
      if (s) return s.x;
      p = Math.min(P - 70, front + this.T.meet);
    } else p = Math.min(P - 70, front + this.T.meet); // just in front of them, inside our tower's range
    return this.wx(clamp(p, z0, z1));
  }

  /** Our beans in a beak or inside a jelly, worth a Big Sneeze: where to cast it (world x), or null. */
  rescueAt(V) {
    let best = null;
    for (const o of V.mine) {
      const H = o.u.heldBy;
      if (!o.u.held || !H || H.team !== this.foe || o.v < 1) continue;
      if (!V.enemies.some((e) => e.u === H)) continue; // (not noticed yet)
      if (!best || o.v > best.v) best = { v: o.v, x: H.hip.x + H.hip.vx(this.m.battle.dt) * SPELLS.bigSneeze.inhale };
    }
    return best ? clamp(best.x, 0, WORLD.width) : null;
  }

  // --- buildings -----------------------------------------------------------------------------

  /** Is this building the answer to this threat (a Box: melee, siege, bombs; a Patch: siege, tanks; the Crane: a big melee push)? */
  buildingFor(h, threat, V) {
    const M = threat.mix;
    const tv = Math.max(0.5, threat.tv);
    if (threat.groundLead < V.frontP - 30 || !this.roomToBuild(V)) return false; // (they're past our tower already: too late to pull them)
    if (h.id === 'boingBox') return (M.melee + M.siege + M.bomb) / tv >= 0.35;
    if (h.id === 'beanPatch') return (M.siege + M.tank) / tv >= 0.35;
    if (h.id === 'wreckingCrane') return threat.tv >= 5 && (M.melee + M.swarm + M.tank) / tv >= 0.5;
    return true;
  }

  /** Room for one more building of ours (a 4th crumbles the oldest: only if that one is nearly gone anyway). */
  roomToBuild(V) {
    const mine = V.buildings.mine;
    if (mine.length < MAX_BUILDINGS) return true;
    let old = mine[0];
    for (const t of mine) if (t.id < old.id) old = t;
    return old.hp / old.maxHp < 0.3;
  }

  /**
   * A building in hand for a big ground push (AHEAD_TV) on its way over:
   * { h, x } to put it down in front of our tower now, { save: true } when a
   * careful bot should keep its mana for it, else null. None while one of ours
   * stands or within AHEAD_GAP of the last; a Boing Box only for a structure
   * hunter (anything else may never walk into its reach).
   */
  buildAhead(hand, V, mana) {
    if (V.buildings.mine.length || this.m.time - this.lastBuild <= AHEAD_GAP) return null;
    const blds = hand.filter((h) => h.card.kind === 'building');
    if (!blds.length) return null;
    const ahead = this.threat(V, WORLD.width);
    if (!(ahead.tv >= AHEAD_TV) || ahead.air >= AIRY) return null;
    let save = false;
    for (const h of blds) {
      if (h.id === 'boingBox' && ahead.mix.siege < ahead.tv * 0.35) continue;
      if (!this.buildingFor(h, ahead, V)) continue;
      if (h.card.mana > mana + 1e-9) save ||= this.skill > 0.35 && this.aggro < 0.5;
      else {
        const x = this.buildAt(h, V);
        if (x != null) return { h, x };
      }
    }
    return save ? { save } : null;
  }

  /**
   * Where a building goes: `off` px in front of our front tower (at least
   * clear of it), inside our own deploy zone, fitted to a legal spot. World x,
   * or null when there is none.
   */
  buildAt(h, V, off = BUILD_AT[h.id] ?? 60) {
    const def = BUILDINGS[h.card.building];
    if (!def) return null;
    const f = V.front;
    const clear = f ? f.w / 2 + def.w / 2 + BUILD_GAP + 1 : 0;
    const [z0, z1] = this.toP(this.m.buildZone(this.team));
    const p = clamp(V.frontP + Math.max(off, clear), z0 + def.w / 2, z1 - def.w / 2);
    return fitBuilding(this.m.battle, this.team, h.card.building, this.wx(p));
  }

  // --- deploy-anywhere ---------------------------------------------------------------------

  /**
   * Where a Brolly Brigade floats down (contract order): an enemy tower at
   * <= 25% (50 px in front of its face), else their most valuable back line
   * (Archers, Juggler, Drummer, Netter) standing well clear of their melee,
   * else by one of their buildings (its near side). { x, value, what } or null.
   */
  anywhereAt(V) {
    let weak = null;
    for (const t of V.towers.theirs) if (t.hp <= t.maxHp * BROLLY_TOWER && (!weak || t.hp < weak.hp)) weak = t;
    if (weak) return { x: this.wx(this.fwd(weak.x) - weak.w / 2 - 50), value: weak.kind === 'castle' ? 12 : 6, what: 'tower' };
    const back = this.backlineAt(V.enemies, V);
    if (back) return back;
    let best = null;
    for (const t of V.buildings.theirs) {
      const v = (CARDS[t.bid] ? CARDS[t.bid].mana : 3) * clamp(t.hp / t.maxHp, 0, 1) * (BROLLY_VS[t.bid] ?? 0.7);
      if (!best || v > best.value) best = { x: this.wx(this.fwd(t.x) - t.w / 2 - 20), value: v, what: 'building' };
    }
    return best;
  }

  /** The most valuable back-line bunch among `group` with none of their melee within BROLLY_CLEAR: { x, value, what } or null. */
  backlineAt(group, V) {
    let best = null;
    for (const e of group) {
      if (!BACKLINE[e.u.type.id] || e.u.air || e.u.held) continue;
      // (one standing at a tower or a building of theirs is behind a wall: Brollies can't get at it)
      if (this.m.battle.towers.some((t) => t.alive && t.team === this.foe && Math.abs(e.u.hip.x - t.x) < t.w / 2 + 2 * e.u.R)) continue;
      let guarded = false;
      for (const o of V.enemies) {
        if (BACKLINE[o.u.type.id] || o.cls === 'siege' || o.cls === 'ranged') continue;
        if (Math.abs(o.p - e.p) < BROLLY_CLEAR) guarded = true;
      }
      if (guarded) continue;
      let v = 0;
      for (const o of group) if (BACKLINE[o.u.type.id] && Math.abs(o.p - e.p) < 60) v += o.v;
      if (!best || v > best.value) best = { x: clamp(this.wx(e.p + e.vp * 0.5), ANYWHERE[0], ANYWHERE[1]), value: v, what: 'back' };
    }
    return best;
  }

  // --- spells ------------------------------------------------------------------------------

  /** An enemy tower this spell would finish off (or null). */
  finishable(h, V) {
    if (NO_TOWER[h.card.spell]) return null;
    const lvl = levelMul(this.m.sides[this.team].levels[h.id] || 1);
    let best = null;
    for (const t of V.towers.theirs) {
      const dmg = towerDamage(h.card) * takesOf(t, 'spell') * lvl;
      if (t.hp <= dmg * 0.97 && (!best || t.kind === 'castle')) best = t;
    }
    return best;
  }

  /** Where to cast a spell so it reaches a tower (a wheel rolls toward the enemy, so start it short). */
  spellAt(h, t) {
    return h.card.spell === 'cheeseWheel' ? t.x - (this.team === 'blue' ? 1 : -1) * 200 : t.x;
  }

  /** Will this enemy still be up in the air (out of reach of a ground spell) `delay` s from now? */
  high(e, delay) {
    if (e.cls === 'air') return true;
    return e.u.air && e.u.alt - FLOAT_FALL * delay > AIR_MIN; // (a Brolly still floating down)
  }

  /** Mana worth of what `dmg` (before its share) takes off an enemy building: its card's mana x the health share it loses. */
  buildingVal(t, dmg) {
    return ((CARDS[t.bid] ? CARDS[t.bid].mana : 3) * Math.min(t.hp, dmg * takesOf(t, 'spell'))) / t.maxHp;
  }

  /**
   * Best spot for a spell among the (noticed) enemies: { x, value } where value
   * is the mana worth of what it kills (partly what it hurts), towers and
   * buildings included. Each newer spell has its own idea of worth (peels: the
   * slips in front of a push; the sneeze: what it blows back off our tower;
   * the anvil: one big hit); the wrap is never cast on them.
   */
  bestSpellSpot(h, V, group = V.enemies) {
    const card = h.card;
    const sp = card.spell;
    if (sp === 'bubbleWrap') return null;
    if (sp === 'bananaPeels') return this.peelSpot(h, V, group);
    if (sp === 'bigSneeze') return this.sneezeSpot(h, V, group);
    if (sp === 'anvil') return this.anvilSpot(h, V, group);
    if (!group.length) return null;
    const lvl = levelMul(this.m.sides[this.team].levels[h.id] || 1);
    const dmg = spellDamage(card) * lvl;
    const tdmg = towerDamage(card) * lvl;
    const delay = spellDelay(card);
    const reach = !!SPELL_AIR[sp];
    const soda = sp === 'shakenSoda';
    // Predicted forward positions when the spell lands
    const pts = group.map((e) => ({ e, p: e.p + e.vp * delay })).sort((a, b) => a.p - b.p);
    const towerVal = (t) => ((tdmg * takesOf(t, 'spell')) / t.maxHp) * (t.kind === 'castle' ? 12 : 6);
    const hitVal = (e) => {
      if (!reach && this.high(e, delay)) return 0; // up there, out of its reach
      const frac = Math.min(1, dmg / Math.max(1, e.u.hp + e.u.wrapHp));
      const v = e.v * (frac >= 1 ? 1 : frac * 0.6) + (card.spell !== 'arrowRain' && e.cls !== 'siege' ? 0.15 : 0); // knockdowns are worth a little
      return soda && e.u.mass >= HEAVY ? v * 0.3 : v; // (heavies barely lift)
    };
    let best = null;
    if (sp === 'cheeseWheel') {
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
        for (const t of V.buildings.theirs) {
          const tp = this.fwd(t.x);
          if (tp >= p0 && tp <= p0 + D) v += this.buildingVal(t, tdmg);
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
      for (const t of V.buildings.theirs) if (Math.abs(this.fwd(t.x) - c) <= R + t.w / 2) v += this.buildingVal(t, tdmg);
      if (!best || v > best.value) best = { x: clamp(this.wx(c), 0, WORLD.width), value: v };
    }
    return best;
  }

  /**
   * Banana Peels, on defence only: just ahead of the lead walker of a threat
   * (PEEL_LEAD s of its walking), inside our tower's range, worth PEEL_MANA per
   * slip of the ground beans that will walk across it (heavies only skid,
   * ranged beans stop short, fliers fly over). Not on top of our own peels.
   */
  peelSpot(h, V, group) {
    const S = SPELLS.bananaPeels;
    const R = h.card.radius;
    const reach = Math.max(V.frontP + 430, WORLD.mid + 20);
    let lead = null;
    const walkers = [];
    for (const e of group) {
      if (e.p >= reach || e.cls === 'air' || e.cls === 'ranged' || e.u.air || e.u.held || e.u.mass >= HEAVY) continue;
      walkers.push(e);
      if (!lead || e.p < lead.p) lead = e;
    }
    if (!lead) return null;
    const [z0] = this.zoneP();
    const c = clamp(lead.p + Math.min(0, lead.vp) * PEEL_LEAD, z0 + R, V.frontP + GUARD.range - R * 0.5);
    let slips = 0;
    for (const e of walkers) {
      if (e.p < c - R - 10 || e.vp > 20) continue; // past it already, or going away
      slips += e.p > c + R ? PEEL_SLIPS : 1; // (one standing in it now slips once)
    }
    let peels = 0;
    for (const it of this.m.battle.items) if (it.kind === 'peel' && it.team === this.team && it.uses > 0 && Math.abs(this.fwd((it.a.x + it.b.x) / 2) - c) < R) peels++;
    if (peels >= 3) return null; // (still peeled there)
    return { x: clamp(this.wx(c), 0, WORLD.width), value: PEEL_MANA * Math.min(S.maxSlips, slips) };
  }

  /**
   * Big Sneeze: 0.6 x the worth of what it blows back from within SNEEZE_NEAR
   * of our front tower (fliers alike; heavies barely move), plus whatever its
   * little damage kills, plus 2 for each of ours it frees from a holder.
   */
  sneezeSpot(h, V, group) {
    if (!group.length) return null;
    const S = SPELLS.bigSneeze;
    const R = h.card.radius;
    const dmg = S.damage * levelMul(this.m.sides[this.team].levels[h.id] || 1);
    const near = V.frontP + SNEEZE_NEAR;
    const pts = group.map((e) => ({ e, p: e.p + e.vp * S.inhale })).sort((a, b) => a.p - b.p);
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      let n = 0;
      let sum = 0;
      for (let j = i; j < pts.length && pts[j].p - pts[i].p <= R * 1.6; j++) {
        sum += pts[j].p;
        n++;
      }
      const c = sum / n;
      let v = 0;
      for (const o of pts) {
        if (Math.abs(o.p - c) > R + o.e.u.R * 0.5) continue;
        const u = o.e.u;
        if (dmg >= u.hp + u.wrapHp) v += o.e.v;
        else if (o.p <= near) v += 0.6 * o.e.v * Math.min(1, u.type.heft ?? 1);
        if (u.holding && u.holding.team === this.team) v += 2;
      }
      if (!best || v > best.value) best = { x: clamp(this.wx(c), 0, WORLD.width), value: v };
    }
    return best;
  }

  /**
   * Anvil: the best single spot (an enemy bean where it will be, or one of
   * their buildings): the worth x kill share of everything in its column
   * (fast walkers step out from under it), towers and buildings included.
   */
  anvilSpot(h, V, group) {
    const S = SPELLS.anvil;
    const R = h.card.radius;
    if (!group.length && !V.buildings.theirs.length) return null;
    const dmg = S.damage * levelMul(this.m.sides[this.team].levels[h.id] || 1);
    const pts = group.map((e) => ({ e, p: e.p + e.vp * S.fall }));
    const spots = pts.map((s) => s.p);
    for (const t of V.buildings.theirs) spots.push(this.fwd(t.x));
    let best = null;
    for (const c of spots) {
      let v = 0;
      for (const o of pts) {
        const u = o.e.u;
        if (Math.abs(o.p - c) > R + u.R) continue;
        const frac = Math.min(1, (dmg * (u.type.shield ? S.shield : 1)) / Math.max(1, u.hp + u.wrapHp));
        v += o.e.v * frac * (Math.abs(o.e.vp) > 70 ? 0.5 : 1);
      }
      for (const t of V.towers.theirs) if (Math.abs(this.fwd(t.x) - c) <= R + t.w / 2) v += ((dmg * takesOf(t, 'spell')) / t.maxHp) * (t.kind === 'castle' ? 12 : 6);
      for (const t of V.buildings.theirs) if (Math.abs(this.fwd(t.x) - c) <= R + t.w / 2) v += this.buildingVal(t, dmg);
      if (!best || v > best.value) best = { x: clamp(this.wx(c), 0, WORLD.width), value: v };
    }
    return best;
  }

  /**
   * Bubble Wrap on our own beans (world x, or null): on a bunch of ours under
   * an enemy spell that's still coming down, or on our push (worth WRAP_PUSH)
   * as it meets them (WRAP_MEET px from their beans, or in their tower's
   * range) with at least WRAP_MIN of ours in the circle not wrapped yet.
   */
  wrapSpot(h, V, push) {
    const R = h.card.radius;
    const fresh = V.mine.filter((o) => !(o.u.wrapHp > o.u.wrapMax * 0.5) && !o.u.held);
    const around = (c) => {
      let n = 0;
      let v = 0;
      for (const o of fresh) {
        if (Math.abs(o.p - c) > R + o.u.R * 0.5) continue;
        n++;
        v += o.v;
      }
      return { n, v };
    };
    // A spell of theirs about to land on a bunch of ours (people see the rock and the arrows coming)
    for (const s of this.m.battle.spells) {
      if (s.team !== this.foe || s.t < this.react * 0.5 || !this.coming(s)) continue;
      const c = this.fwd(s.tx ?? s.x);
      const a = around(c);
      if (a.n >= 2 && a.v >= 2.5) return clamp(this.wx(c), 0, WORLD.width);
    }
    if (push.v < WRAP_PUSH) return null;
    const them = V.towers.theirs.find((t) => t.kind === 'guard') || V.towers.theirs[0];
    const inRange = them && push.front >= this.fwd(them.x) - them.w / 2 - them.range;
    if (!inRange && !V.enemies.some((e) => e.p > push.rear - 60 && e.p - push.front < WRAP_MEET)) return null;
    const pts = fresh.filter((o) => o.p >= V.frontP + 100).sort((a, b) => a.p - b.p);
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      let n = 0;
      let sum = 0;
      for (let j = i; j < pts.length && pts[j].p - pts[i].p <= R * 1.6; j++) {
        sum += pts[j].p;
        n++;
      }
      const c = sum / n;
      const a = around(c);
      if (a.n >= WRAP_MIN && (!best || a.v > best.v)) best = { c, v: a.v };
    }
    return best ? clamp(this.wx(best.c), 0, WORLD.width) : null;
  }

  /** An enemy spell entity that hasn't done its damage yet (a wrap now would soak it). */
  coming(s) {
    if (s.kind === 'boulder') return s.state === 'fall';
    if (s.kind === 'arrowRain') return s.volley < SPELLS.arrowRain.volleys;
    if (s.kind === 'soda') return s.state === 'fizz';
    if (s.kind === 'sneeze') return s.state === 'inhale';
    return false;
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
      if (RUSH[h.id] || c.anywhere) continue; // (a Pogo goes on its own; Brollies drop on targets of their own)
      if (h.id === 'tummyDrummer' && push.v < DRUM_PUSH) continue; // (nothing worth drumming for yet)
      // Bombs blow up friends too: they only join a push if they can go in front of it (a Mega Bomb never: too slow)
      if (BOMBS[h.id] && (push.front > z1 - 40 || h.id === 'megaBomb')) continue;
      const score = 1 - (TANK[h.id] || 0) * 0.6 - c.mana * 0.03 + this.rng.gauss() * this.choiceNoise * 2 + (SUPPORT_BONUS[h.id] || 0);
      if (!best || score > best.score) best = { ...h, score };
    }
    return best;
  }

  /** Support goes behind the front of the push (archers and the Juggler further back, the Pelican further still, bombs out in front). */
  supportAt(h, push) {
    const [z0, z1] = this.zoneP();
    const back = SUPPORT_BACK[h.id] ?? (BOMBS[h.id] ? -70 : 50);
    return this.wx(clamp(Math.min(push.front, z1) - back, z0, z1));
  }

  /**
   * A card to lead a push with: a cheap front-liner from the back, or (rush)
   * anything that hits hard right away. A Pogo only rushes or leads a late
   * push at the bridge (`fast`), and never into a standing building of theirs
   * (it would hop straight onto it); a Brick would rather not either.
   */
  pickTank(cands, rush, V = null, fast = false) {
    let best = null;
    const walls = !!V && V.buildings.theirs.some((t) => t.hp > t.maxHp * 0.3);
    for (const h of cands) {
      const c = h.card;
      if (c.kind !== 'unit' || c.anywhere || h.id === 'tummyDrummer') continue; // (Brollies drop on targets; a Drummer alone does nothing)
      if (RUSH[h.id] && (walls || !(rush || fast))) continue;
      const tank = TANK[h.id] || 0;
      // From the back: a front-liner that leaves mana for the support that joins it at the bridge
      const score = (rush ? 0.5 + tank * 0.5 - (h.id === 'brick' ? 0.3 : 0) + c.mana * 0.04 : tank * 0.7 - c.mana * 0.1) + this.rng.gauss() * this.choiceNoise * 2;
      const s = score + (RUSH[h.id] ? (rush ? 0.35 : 0.6) : 0) - (walls && h.id === 'brick' ? 0.3 : 0);
      if (!best || s > best.score) best = { ...h, score: s };
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

  /** The cheapest unit worth playing when mana is about to overflow (Sprouts first; no Pogo, Brollies or Drummer: they go on purpose). */
  pickCheap(cands) {
    let best = null;
    for (const h of cands) {
      const c = h.card;
      if (c.kind !== 'unit' || c.anywhere || RUSH[h.id] || h.id === 'tummyDrummer') continue;
      const score = -c.mana * 0.15 + (TANK[h.id] || 0) * 0.3 + this.rng.gauss() * this.choiceNoise * 2 + (CHEAP[h.id] || 0);
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

  /**
   * Full mana and no cheap unit in hand: Brollies on anything of theirs, a
   * Pogo at the bridge (no building in its way), or as a last resort a
   * Drummer behind our tower (it waits there for the next push to drum for).
   */
  leakRest(ok, V) {
    const brolly = ok.find((h) => h.card.anywhere);
    const s = brolly ? this.anywhereAt(V) : null;
    if (s && this.tryPlay(brolly, s.x, 'leak')) {
      this.lastDrop = this.m.time;
      return true;
    }
    const pogo = ok.find((h) => RUSH[h.id]);
    if (pogo && !V.buildings.theirs.some((t) => t.hp > t.maxHp * 0.3) && this.tryPlay(pogo, this.bridgeAt(), 'leak')) return true;
    const drum = ok.find((h) => h.id === 'tummyDrummer');
    return !!drum && this.tryPlay(drum, this.leakAt(drum, V), 'leak');
  }
}
