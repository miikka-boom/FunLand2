// Strays: the rules. Pure and seeded: no DOM, no Date, no Math.random.
// The page, the tests and the balance tool all play through this one class.
//
// The whole game:
//   - The block has 12 rooms. One starts open, with somebody asleep in a bag.
//   - Wake them: a hooded STRAY. Strays are hungry (a meal costs a can) and
//     want hugs (free). Hearts fill a bar; when it is full they dare to show
//     who they are: a SOMEBODY, one of eighteen kinds. A somebody grows into
//     a HERO the same way.
//   - A somebody can GO OUT: one at a time, they bring back cans and then
//     rest. Sometimes a stray follows them home and waits at the door until
//     there is an open room.
//   - Cans feed people and open rooms. That is the only currency.
//   - Zombies gather at the back fence; bonk them, some drop a can.
// Nobody dies, nobody leaves, nobody is turned away.

import {
  COLS,
  ROWS,
  ROOMS,
  FIRST_ROOM,
  BAG,
  STRAY,
  SOMEBODY,
  HERO,
  KINDS,
  KIND_BY_ID,
  RARITIES,
  RARITY_ORDER,
  NAMES,
  SKINS,
  HAIRS,
  STYLES,
  QUIRKS,
} from './config.js';
import { rngFor, randInt, pick, pickWeighted } from './util.js';

export const SEC = 1000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** The rooms that share a wall, a floor or a ceiling with room i. */
export function neighbours(i) {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const out = [];
  if (c > 0) out.push(i - 1);
  if (c < COLS - 1) out.push(i + 1);
  if (r > 0) out.push(i - COLS);
  if (r < ROWS - 1) out.push(i + COLS);
  return out;
}

/** An empty block: every room boarded up, nobody home. */
export function freshState(seed, now) {
  return {
    v: 1,
    seed: seed >>> 0,
    born: now,
    cans: 0,
    rooms: Array.from({ length: ROOMS }, () => ({ open: false, who: null })),
    people: {},
    door: null, // the stray waiting at the front door, if any
    nextId: 1,
    arrivals: 0,
    moveIns: 0,
    trips: 0,
    bonks: 0,
    followMiss: 0,
    bonkMiss: 0,
    zombies: 0,
    zombieAt: 0, // 0: the fence is still quiet (nobody has shown who they are yet)
    met: [], // kinds the block has met, in order: the Book
    heroes: [], // kinds that grew into heroes
    force: {}, // testing: { outcome, rarity, kind, follow }
    seen: {}, // one-time hints and celebrations the page has shown
    stats: { cans: 0, meals: 0, hugs: 0, patches: 0 },
    clockOffset: 0,
  };
}

const no = (why, extra) => ({ ok: false, why, ...extra });

export class Game {
  /** @param ctx { clock, tuning } */
  constructor(state, ctx) {
    this.s = state;
    this.clock = ctx.clock;
    this.t = ctx.tuning;
  }

  /** A new block: one open room by the door, somebody asleep in it, a few cans. */
  static start(seed, ctx) {
    const now = ctx.clock.now();
    const g = new Game(freshState(seed, now), ctx);
    g.s.cans = ctx.tuning.startCans;
    g.s.rooms[FIRST_ROOM].open = true;
    g._moveIn(g._newcomer(now), FIRST_ROOM, now);
    return g;
  }

  now() {
    return this.clock.now();
  }

  // ------------------------------------------------------------------ people

  person(id) {
    return this.s.people[id] || null;
  }

  /** The room somebody lives in, or -1 (still at the door). */
  roomOf(id) {
    const rooms = this.s.rooms;
    for (let i = 0; i < rooms.length; i++) if (rooms[i].who === id) return i;
    return -1;
  }

  /** Everybody who has a room, in room order. */
  residents() {
    const out = [];
    for (const r of this.s.rooms) if (r.who && this.s.people[r.who]) out.push(this.s.people[r.who]);
    return out;
  }

  kindOf(p) {
    return KIND_BY_ID[p.kind];
  }

  rarityOf(p) {
    return RARITIES[KIND_BY_ID[p.kind].rarity];
  }

  /** Hearts it takes to grow out of this stage (0: nothing left to grow into). */
  need(p) {
    if (p.stage === STRAY) return this.t.needReveal;
    if (p.stage === SOMEBODY) return this.t.needHero;
    return 0;
  }

  /**
   * The one thing somebody wants right now. One bubble at a time:
   *   'door'   waiting outside for a room
   *   'bag'    asleep in the bag     'wake'   ...and ready to be woken
   *   'hurt'   needs patching up     'grow'   the heart bar is full
   *   'rest'   asleep after a trip   'hungry' wants a can
   *   'hug'    wants a hug           null     content
   */
  wish(p, now = this.now()) {
    if (this.s.door === p.id) return 'door';
    if (p.stage === BAG) return now >= p.wakeAt ? 'wake' : 'bag';
    if (p.hurt) return 'hurt';
    if (p.stage < HERO && p.hearts >= this.need(p)) return 'grow';
    if (now < p.restUntil) return 'rest';
    if (p.stage === HERO) return null; // heroes look after themselves
    const hungry = now >= p.hungryAt;
    if (hungry && this.s.cans > 0) return 'hungry';
    if (now >= p.hugAt) return 'hug'; // out of cans: a hug still helps
    return hungry ? 'hungry' : null;
  }

  /** What they could tell you about themselves. */
  info(p, now = this.now()) {
    return {
      id: p.id,
      name: p.name,
      stage: p.stage,
      kind: p.stage >= SOMEBODY ? p.kind : null,
      hearts: Math.min(p.hearts, this.need(p) || p.hearts),
      need: this.need(p),
      day: Math.floor((now - p.born) / DAY) + 1,
      wish: this.wish(p, now),
    };
  }

  // ------------------------------------------------------------------- rooms

  openRooms() {
    return this.s.rooms.filter((r) => r.open).length;
  }

  /** The first open room nobody lives in, or -1. */
  freeRoom() {
    return this.s.rooms.findIndex((r) => r.open && !r.who);
  }

  /** What the next room costs (null: every room is open). */
  price() {
    const n = this.openRooms();
    if (n >= ROOMS) return null;
    const prices = this.t.roomPrices;
    return prices[Math.min(n, prices.length - 1)];
  }

  /** Can room i be opened now? A room opens next to one that already is. */
  canOpen(i) {
    const room = this.s.rooms[i];
    if (!room || room.open) return no('open');
    const price = this.price();
    if (!neighbours(i).some((j) => this.s.rooms[j].open)) return no('far', { price });
    if (this.s.cans < price) return no('cans', { price });
    return { ok: true, price };
  }

  /** Rip the boards off room i. A stray waiting at the door moves straight in. */
  open(i) {
    const can = this.canOpen(i);
    if (!can.ok) return can;
    const s = this.s;
    s.cans -= can.price;
    s.rooms[i].open = true;
    let movedIn = null;
    if (s.door) {
      movedIn = s.door;
      this._moveIn(s.people[s.door], i, this.now());
    }
    return { ok: true, room: i, price: can.price, movedIn };
  }

  // -------------------------------------------------------------------- care

  /** Unzip the bag: a stray climbs out, hungry, and soon wants a hug. */
  wake(id) {
    const p = this.person(id);
    const now = this.now();
    if (!p || this.wish(p, now) !== 'wake') return no('asleep');
    p.stage = STRAY;
    p.hungryAt = now;
    p.hugAt = now + this.t.hugFirstSec * SEC;
    return { ok: true, id };
  }

  /** A meal: one can, and the hearts go up. */
  feed(id) {
    const p = this.person(id);
    const now = this.now();
    if (!p || p.stage < STRAY || p.stage >= HERO || now < p.hungryAt) return no('full');
    if (this.wish(p, now) !== 'hungry') return no('busy');
    if (this.s.cans < 1) return no('cans');
    this.s.cans -= 1;
    this.s.stats.meals += 1;
    p.hungryAt = now + (p.stage === STRAY ? this.t.strayHungerMin : this.t.hungerMin) * MIN;
    return this._hearts(p, this.t.mealHearts);
  }

  /** A hug: free. */
  hug(id) {
    const p = this.person(id);
    const now = this.now();
    if (!p || this.wish(p, now) !== 'hug') return no('busy');
    this.s.stats.hugs += 1;
    p.hugAt = now + this.t.hugMin * MIN;
    return this._hearts(p, this.t.hugHearts);
  }

  /** Patch somebody up after a rough trip. */
  patch(id) {
    const p = this.person(id);
    if (!p || !p.hurt) return no('fine');
    p.hurt = false;
    this.s.stats.patches += 1;
    return this._hearts(p, this.t.patchHearts);
  }

  _hearts(p, n) {
    p.hearts += n;
    const need = this.need(p);
    return { ok: true, id: p.id, hearts: n, total: p.hearts, need, ready: need > 0 && p.hearts >= need };
  }

  /** The bar is full: a stray shows who they are, a somebody becomes a hero. */
  grow(id) {
    const p = this.person(id);
    const now = this.now();
    if (!p || this.wish(p, now) !== 'grow') return no('notyet');
    const s = this.s;
    p.hearts -= this.need(p);
    p.stage += 1;
    if (p.stage === SOMEBODY) {
      p.shownAt = now;
      if (!s.met.includes(p.kind)) s.met.push(p.kind);
      // A fed stray starts their new life with a full belly.
      if (p.hungryAt > now) p.hungryAt = now + this.t.hungerMin * MIN;
      // The first face wakes the fence up: zombies start to gather.
      if (!s.zombieAt) s.zombieAt = now + this.t.zombieFirstSec * SEC;
    } else {
      p.heroAt = now;
      p.hearts = 0;
      if (!s.heroes.includes(p.kind)) s.heroes.push(p.kind);
    }
    return { ok: true, id, stage: p.stage, kind: p.kind, rarity: KIND_BY_ID[p.kind].rarity };
  }

  // ------------------------------------------------------------------- trips

  /** Who could go out right now, in room order. */
  eligible(now = this.now()) {
    return this.residents()
      .filter((p) => p.stage >= SOMEBODY && !p.hurt && now >= p.restUntil)
      .map((p) => p.id);
  }

  /** Why nobody can go: 'strays' (nobody dares yet), 'hurt', or 'resting' (with the time the first one wakes). */
  noTripWhy(now = this.now()) {
    const able = this.residents().filter((p) => p.stage >= SOMEBODY);
    if (!able.length) return { why: 'strays' };
    const resting = able.filter((p) => !p.hurt);
    if (!resting.length) return { why: 'hurt' };
    return { why: 'resting', at: Math.min(...resting.map((p) => p.restUntil)) };
  }

  /**
   * One goes out. They come back with cans and a heart, and then they rest.
   * Rarer kinds find more; heroes find more and get hurt less. If nobody is
   * waiting at the door and the block isn't full, a stray may follow them.
   */
  goOut(id) {
    const p = this.person(id);
    const now = this.now();
    if (!p || !this.eligible(now).includes(id)) return no('cant');
    const s = this.s;
    const t = this.t;
    const n = s.trips++;
    const rng = rngFor(s.seed, 'trip', n);
    const hero = p.stage >= HERO;

    // How it went. Always roll, so a forced outcome can't shift the later rolls.
    const odds = hero ? t.oddsHero : t.oddsSome;
    const roll = rng() * (odds[0] + odds[1] + odds[2]);
    let outcome = roll < odds[0] ? 'great' : roll < odds[0] + odds[1] ? 'good' : 'rough';
    if (n < t.gentleTrips) outcome = n === 0 ? 'great' : outcome === 'rough' ? 'good' : outcome;
    if (s.force.outcome) {
      outcome = s.force.outcome;
      delete s.force.outcome;
    }

    // What they found.
    const range = hero ? t.cansHero : t.cansSome;
    const base = randInt(rng, range[0], range[1]);
    const bonus = RARITIES[KIND_BY_ID[p.kind].rarity].bonus;
    const swing = outcome === 'great' ? t.greatCans : outcome === 'rough' ? -t.roughCans : 0;
    const cans = Math.max(1, base + bonus + swing);
    s.cans += cans;
    s.stats.cans += cans;

    const hearts = outcome === 'great' ? t.greatHearts : t.tripHearts;
    p.hearts += hearts;
    p.trips += 1;
    p.hurt = outcome === 'rough';
    const ramp = t.restRampSec;
    const restMs = n < ramp.length ? ramp[n] * SEC : (hero ? t.restHeroMin : t.restSomeMin) * MIN;
    p.restUntil = now + restMs;

    // Did somebody follow them home?
    const followRoll = rng();
    let follower = null;
    if (!s.door && Object.keys(s.people).length < ROOMS) {
      let comes = n < t.followSure || s.followMiss >= t.followPity || followRoll < t.followChance;
      if (s.force.follow != null) {
        comes = !!s.force.follow;
        delete s.force.follow;
      }
      if (comes) {
        s.followMiss = 0;
        const f = this._newcomer(now);
        s.door = f.id;
        const room = this.freeRoom();
        if (room >= 0) this._moveIn(f, room, now);
        follower = { id: f.id, room };
      } else {
        s.followMiss += 1;
      }
    }

    const need = this.need(p);
    return { ok: true, id, n, outcome, cans, base, bonus, hearts, hurt: p.hurt, restMs, follower, ready: need > 0 && p.hearts >= need };
  }

  // ----------------------------------------------------------------- zombies

  /** Bonk the zombie at the front of the fence. Some drop a can. */
  bonk() {
    const s = this.s;
    const t = this.t;
    if (s.zombies < 1) return no('none');
    const wasFull = s.zombies >= t.zombieMax;
    s.zombies -= 1;
    const n = s.bonks++;
    const rng = rngFor(s.seed, 'bonk', n);
    const can = s.bonkMiss >= t.zombiePity || rng() < t.zombieCanChance;
    if (can) {
      s.cans += 1;
      s.stats.cans += 1;
      s.bonkMiss = 0;
    } else {
      s.bonkMiss += 1;
    }
    if (wasFull) s.zombieAt = this.now() + t.zombieMin * MIN;
    return { ok: true, can, left: s.zombies };
  }

  /**
   * Let time pass: zombies that turned up while nobody looked take their
   * place at the fence (never more than zombieMax). Wishes need no ticking:
   * they are read straight off the clock. Returns how many zombies arrived.
   */
  tick(now = this.now()) {
    const s = this.s;
    const t = this.t;
    if (!s.zombieAt) return { zombies: 0 };
    let arrived = 0;
    while (s.zombies < t.zombieMax && now >= s.zombieAt) {
      s.zombies += 1;
      arrived += 1;
      s.zombieAt += t.zombieMin * MIN;
    }
    // A full fence waits: the next one comes a while after a place frees up.
    if (s.zombies >= t.zombieMax) s.zombieAt = now + t.zombieMin * MIN;
    return { zombies: arrived };
  }

  // ------------------------------------------------------------------ advice

  /** What tapping room i would do: { act, id?, price?, ms? }. */
  roomAction(i, now = this.now()) {
    const room = this.s.rooms[i];
    if (!room) return { act: 'none' };
    if (!room.open) {
      const can = this.canOpen(i);
      return { act: can.ok ? 'open' : can.why === 'far' ? 'far' : 'poor', price: can.price };
    }
    if (!room.who) return { act: 'empty' };
    const p = this.s.people[room.who];
    const id = p.id;
    switch (this.wish(p, now)) {
      case 'bag':
        return { act: 'asleep', id, ms: p.wakeAt - now };
      case 'wake':
        return { act: 'wake', id };
      case 'hurt':
        return { act: 'patch', id };
      case 'grow':
        return { act: 'grow', id };
      case 'rest':
        return { act: 'resting', id, ms: p.restUntil - now };
      case 'hungry':
        return { act: this.s.cans > 0 ? 'feed' : 'nocans', id };
      case 'hug':
        return { act: 'hug', id };
      default:
        return { act: 'hello', id };
    }
  }

  /**
   * The one next thing worth doing, for the hint line and the simulated
   * player: { do, id?, room?, price?, at? }.
   */
  advice(now = this.now()) {
    const s = this.s;
    const here = this.residents();
    const by = (w) => here.find((p) => this.wish(p, now) === w);
    let p;
    if ((p = by('wake'))) return { do: 'wake', id: p.id };
    if ((p = by('hurt'))) return { do: 'patch', id: p.id };
    if ((p = by('grow'))) return { do: 'grow', id: p.id };
    if (s.cans > 0 && (p = by('hungry'))) return { do: 'feed', id: p.id };
    if ((p = by('hug'))) return { do: 'hug', id: p.id };
    const price = this.price();
    if (s.door && price != null && s.cans >= price) return { do: 'open', price };
    const able = this.eligible(now);
    if (able.length) return { do: 'go', id: able[0] };
    if (s.zombies > 0) return { do: 'bonk' };
    if (s.door && price != null) return { do: 'save', price };
    return { do: 'wait', at: this.nextAt(now) };
  }

  /** When the next thing happens by itself (a nap ends, a belly rumbles), or null. */
  nextAt(now = this.now()) {
    let at = Infinity;
    const later = (v) => {
      if (v > now && v < at) at = v;
    };
    for (const p of this.residents()) {
      if (p.stage === BAG) later(p.wakeAt);
      else {
        later(p.restUntil);
        if (p.stage < HERO) {
          later(p.hungryAt);
          later(p.hugAt);
        }
      }
    }
    if (this.s.zombieAt && this.s.zombies < this.t.zombieMax) later(this.s.zombieAt);
    return at === Infinity ? null : at;
  }

  /** The block at a glance. */
  tally() {
    const here = this.residents();
    const count = (st) => here.filter((p) => p.stage === st).length;
    const heroes = count(HERO);
    const somebodies = count(SOMEBODY);
    return {
      rooms: this.openRooms(),
      people: here.length,
      strays: count(BAG) + count(STRAY),
      somebodies,
      heroes,
      met: this.s.met.length,
      kinds: KINDS.length,
      full: somebodies + heroes === ROOMS,
      allHeroes: heroes === ROOMS,
    };
  }

  // ---------------------------------------------------------------- internal

  /** Somebody new: who they are is settled here, by the save's seed and the arrival number. */
  _newcomer(now) {
    const s = this.s;
    const n = s.arrivals++;
    const rng = rngFor(s.seed, 'arrival', n);
    const kind = this._drawKind(rng, n);
    const taken = new Set(Object.values(s.people).map((p) => p.name));
    const free = NAMES.filter((x) => !taken.has(x));
    const p = {
      id: 'p' + s.nextId++,
      kind,
      name: pick(rng, free.length ? free : NAMES),
      skin: randInt(rng, 0, SKINS - 1),
      hair: randInt(rng, 0, HAIRS - 1),
      style: randInt(rng, 0, STYLES - 1),
      quirk: pick(rng, QUIRKS),
      born: now,
      stage: BAG,
      hearts: 0,
      wakeAt: now,
      hungryAt: 0,
      hugAt: 0,
      hurt: false,
      restUntil: 0,
      trips: 0,
    };
    s.people[p.id] = p;
    return p;
  }

  /** A kind nobody in the block is yet: roll a rarity, then pick one of that rarity. */
  _drawKind(rng, n) {
    const s = this.s;
    const here = new Set(Object.values(s.people).map((p) => p.kind));
    const pool = KINDS.filter((k) => !here.has(k.id));
    const weights = {};
    for (const r of RARITY_ORDER) if (pool.some((k) => k.rarity === r)) weights[r] = RARITIES[r].weight;
    let rarity = pickWeighted(rng, weights);
    if (n === 0) rarity = 'common'; // the first face is an everyday one
    if (s.force.rarity && weights[s.force.rarity]) rarity = s.force.rarity;
    const of = pool.filter((k) => k.rarity === rarity);
    let kind = pick(rng, of.length ? of : pool).id;
    if (s.force.kind && pool.some((k) => k.id === s.force.kind)) kind = s.force.kind;
    delete s.force.rarity;
    delete s.force.kind;
    return kind;
  }

  /** Into a room, into a bag: the first few newcomers sleep only a moment. */
  _moveIn(p, room, now) {
    const s = this.s;
    s.rooms[room].who = p.id;
    if (s.door === p.id) s.door = null;
    const ramp = this.t.bagRampSec;
    const n = s.moveIns++;
    p.wakeAt = now + ramp[Math.min(n, ramp.length - 1)] * SEC;
  }
}
