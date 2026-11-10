// The battle: units, arrows, dropped weapons, phases and events.
// Pure simulation (no DOM), fixed timestep, seeded RNG -> it runs headless in
// tests and replays identically from the same placement.
//
// Two modes. 'sandbox' (the default) is the free-placement toy: place beans,
// start(), the side with beans left wins. 'arena' is a card match: the fight
// is on from the start, units drop in from the sky (addUnit opts.drop), march
// on the enemy towers (sim/towers.js), spells fly (sim/spells.js), corpses
// fade away, and sim/match.js decides who wins.

import { WORLD, enemyOf } from '../config.js';
import { Particle, Dist, integrate, collideGround, clampGround, hingeLimit, segSeg, springTo } from './physics.js';
import { UNIT_TYPES } from './unit-types.js';
import { Unit, isFlier } from './unit.js';
import { Rng } from './rng.js';
import { Tower, takesOf, updateTowers, damageTower, rectDist, segRect } from './towers.js';
import { makeBuilding } from './buildings.js';
import { updateSpells } from './spells.js';

export const DT = 1 / 120;
const ITER = 4;
const DRAG = 0.9995;
const G = WORLD.gravity;
const MAX_STUCK_GROUND = 160;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tmp = { d2: 0, s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0 };

// Arena tuning
export const MELEE_SIGHT = 230; // melee units notice enemy beans this close (along x)...
export const RANGED_SIGHT = 60; // ...ranged ones this much beyond their preferred range
export const DROP_HEIGHT = 290; // played units fall from this high (px above their lane)...
export const DROP_VY = 140; // ...with a little push downward (px/s)
export const DEPLOY_T = 1.0; // and act this long after the card was played
export const CORPSE_FADE_AT = 4; // seconds dead before a corpse starts to fade
export const CORPSE_FADE_T = 1; // fade duration; then it's removed
export const ITEM_FADE_AT = 4; // dropped weapons and hats likewise
export const ARROW_FADE_AT = 6; // arrows stuck in the dirt (arena)
export const MAX_LIVE = 32; // live units per side: spawns (never cards) are skipped above this
const MAX_TOWER_ARROWS = 24;
const BITE_SPIT = [260, 340]; // px/s (away, up): a lethal Nutcracker bite spits its victim out spinning
const CAP_LIFE = 7; // seconds a Propeller Pal's cap flutters about before it fades
const TOSS_ELEV = 1.35; // rad: the steepest a Bomb Juggler lobs (arrows: 0.85)

/** Units that only ever go for towers and buildings (the Brick, the Pogo Bean). */
const structuresOnly = (type) => type.targets === 'structures' || type.targets === 'towers';

/**
 * Can unit u pick e as a target? Not a dead or held one (in a Pelican's beak,
 * inside a jelly), and a bean high in the air only if u hits air (and, with
 * airReach, only one low enough).
 */
export function canTarget(u, e) {
  if (!e.alive || e.held) return false;
  if (!e.air) return true;
  if (!u.type.hitsAir) return false;
  return !u.type.airReach || e.ground - e.hip.y <= u.type.airReach;
}

export class Battle {
  constructor(seed = 1, opts = {}) {
    this.mode = opts && opts.mode === 'arena' ? 'arena' : 'sandbox';
    this.seed = seed;
    this.rng = new Rng(seed);
    // Cosmetic-only randomness (hat spin) has its own stream, so looks never change a fight
    this.fxRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.units = [];
    this.arrows = [];
    this.items = [];
    this.events = [];
    this.towers = []; // arena: Guard Towers and Castles (sim/towers.js)
    this.spells = []; // active spell entities (sim/spells.js)
    this.shots = []; // castle cannonballs in flight
    this.crowns = { blue: 0, red: 0 }; // arena: towers taken (a castle = 3)
    // Arena: no placement, the fight is on from the start
    this.phase = this.mode === 'arena' ? 'battle' : 'place'; // place | battle | over
    this.time = 0;
    this.battleTime = 0;
    this.winner = null;
    this.nextId = 1;
    this.dt = DT;
    this.yellT = 0;
    this.grab = null;
    this.sorted = [];
    this.sortedDead = [];
    this.blasts = []; // bombs waiting to go off (chain reactions run one step apart)
    this.pending = []; // closures run in order at the very end of step() (see later())
    // Cosmetic hats per team: { unitTypeId | 'all': hatId }. Hats pop off when a bean gets bonked.
    this.hats = { blue: {}, red: {} };
    this.stats = { hits: 0, blocks: 0, arrows: 0, kills: 0 };
  }

  emit(type, x, y, data = {}) {
    data.type = type;
    data.x = x;
    data.y = y;
    this.events.push(data);
  }

  // --- placement ---------------------------------------------------------------

  /**
   * opts: { level: card level (hp and damage +10% per level), drop: fall in
   * from the sky and stand still for DEPLOY_T before joining the fight,
   * float: drift down under an umbrella instead (a Brolly: floatIn) }.
   */
  addUnit(typeId, team, x, lane = null, seed = null, opts = null) {
    const type = Object.prototype.hasOwnProperty.call(UNIT_TYPES, typeId) ? UNIT_TYPES[typeId] : null;
    if (!type) return null;
    const ln = lane == null ? this.rng.next() : clamp(lane, 0, 1);
    const s = seed == null ? (this.rng.next() * 2 ** 31) | 0 : seed;
    const u = new Unit(type, team, x, ln, this.nextId++, s, (opts && opts.level) || 1);
    u.placeSeed = s;
    const hats = this.hats[team] || {};
    const hat = hats[typeId] || hats.all;
    u.hat = hat && hat !== 'none' && !type.noHat ? hat : null; // (noHat: its leaves, cap or shako are its hat)
    if (opts && opts.float && type.float) this.floatIn(u);
    else if (opts && opts.drop) this.dropIn(u);
    this.units.push(u);
    // Keep the crowd drawn back-to-front
    this.units.sort((a, b) => a.lane - b.lane || a.id - b.id);
    return u;
  }

  /** Lift a new unit into the sky: it falls, lands with a wobble, yells, then goes. */
  dropIn(u) {
    const h = DROP_HEIGHT * u.rng.range(0.94, 1.06);
    const dt = this.dt;
    for (const p of u.parts) {
      p.teleport(0, -h);
      p.setVel(0, DROP_VY, dt);
    }
    u.deployT = DEPLOY_T;
    u.dropping = true;
    u.dropHop = true;
    u.hopAt = this.battleTime + DEPLOY_T - 0.25; // the battle-cry hop, then off it goes at DEPLOY_T
    u.lookX = u.hip.x + u.f * 200;
    u.lookY = u.ground;
    this.emit('drop', u.hip.x, u.hip.y, { unit: u });
  }

  /**
   * A Brolly floats in under its umbrella: it starts float.height up, at rest,
   * and drifts down (the drag cap and the sway are in Unit.control). It is not
   * `dropping`, so towers shoot it all the way down, and it is air while it is
   * high. It lands (brollyLand) and goes deployT 0.4 s later; a hit on the way
   * down flips the umbrella inside out and it falls (Unit.takeHit).
   */
  floatIn(u) {
    const h = u.type.float.height * u.rng.range(0.95, 1.05);
    const dt = this.dt;
    for (const p of u.parts) {
      p.teleport(0, -h);
      p.setVel(0, 0, dt);
    }
    u.floatT = 1;
    u.dropping = false;
    u.deployT = 99; // (until it lands)
    u.lookX = u.hip.x + u.f * 200;
    u.lookY = u.ground;
    this.emit('drop', u.hip.x, u.hip.y, { unit: u });
  }

  // --- holding (Pelican beak, inside a Big Jelly) -----------------------------------

  /**
   * holder takes v: v is `held` (it flails and nobody targets it), and every
   * step a spring pulls its chest to holder.holdPoint(). A lit fuse stays lit,
   * a Bomb that wasn't lit is lit now, and a Bomb Juggler fumbles. The caller
   * emits its own event (scoop, engulf).
   */
  hold(holder, v) {
    v.held = true;
    v.heldBy = holder;
    holder.holding = v;
    if (!(v.act && v.act.phase === 'fuse')) v.act = null;
    v.bowDraw = 0;
    v.striking = false;
    v.wantVx = 0;
    v.asleep = false;
    v.stillT = 0;
    v.mouth = 0.8;
    v.mouthKind = 'o';
    if (v.type.blast && !v.exploded && !(v.act && v.act.phase === 'fuse')) this.light(v);
    if (v.type.fumble) this.fumble(v);
  }

  /**
   * Release v from whatever holds it, adding (dvx, dvy) px/s to every part.
   * A Big Jelly cools down after any release, as after a spit (a Sneeze that
   * frees its catch isn't undone by the next swallow).
   */
  letGo(v, dvx = 0, dvy = 0) {
    const h = v.heldBy;
    if (!h) return;
    v.held = false;
    v.heldBy = null;
    if (h.holding === v) h.holding = null;
    if (h.type.engulf) h.engulfCool = Math.max(h.engulfCool, h.type.engulf.cooldown);
    if (dvx || dvy) for (const p of v.parts) p.addVel(dvx, dvy, this.dt);
  }

  /**
   * An early release: holder lets go of what it holds (if anything) and
   * emits letGo {unit, victim, why} ('sneeze' | 'stun' | 'damage' | 'death').
   */
  letGoOf(holder, why, dvx = 0, dvy = 0) {
    const v = holder.holding;
    if (!v) return null;
    this.letGo(v, dvx, dvy);
    this.emit('letGo', v.chest.x, v.chest.y, { unit: holder, victim: v, why });
    return v;
  }

  /** A Bomb's fuse is lit (grabbed by a holder): it panics, then goes off. */
  light(v) {
    v.act = { phase: 'fuse', t: 0, variant: 0, hits: new Set(), done: false, aim: null, quaked: false };
    v.mouth = 1;
    v.mouthKind = 'o';
    this.emit('fuse', v.head.x, v.head.y, { unit: v });
  }

  /**
   * Run fn at the very end of this step (after every unit has moved and been
   * hit). Anything that would add a unit in the middle of a step goes through
   * here: adding one re-sorts battle.units under the loops that walk it.
   */
  later(fn) {
    this.pending.push(fn);
  }

  /**
   * A unit that appears mid-fight (popped out of a Bean Patch, ...), added at
   * the end of the step. Not dropped from the sky: towers may shoot it at
   * once, it gets no battle-cry hop, and it takes no fall damage while
   * deployT > 0. Its lane and seed come from battle.rng when it is added.
   * Skipped when its side already has MAX_LIVE live units.
   * opts: { level, lane?, seed?, pop: [vx, vy] (px/s), deployT, from: Tower | Unit | null }
   */
  spawn(typeId, team, x, opts = {}) {
    this.later(() => {
      if (this.liveCount(team) >= MAX_LIVE) return;
      const u = this.addUnit(typeId, team, x, opts.lane ?? null, opts.seed ?? null, { level: opts.level || 1 });
      if (!u) return;
      if (opts.pop) for (const p of u.parts) p.setVel(opts.pop[0], opts.pop[1], this.dt);
      u.deployT = opts.deployT || 0;
      const from = opts.from;
      if (from && from.isTower && from.spawn) {
        u.spawnOf = from.id;
        from.spawn.kids.push(u.id);
        this.emit('sproutPop', u.hip.x, u.hip.y, { tower: from, unit: u });
      }
    });
  }

  /** Live units of one side. */
  liveCount(team) {
    let n = 0;
    for (const u of this.units) if (u.alive && u.team === team) n++;
    return n;
  }

  /** A Guard Tower ('guard') or Castle ('castle'); level = the side's King Level. */
  addTower(kind, team, x, level = 1, hpMul = 1) {
    const t = new Tower(kind, team, x, level, this.nextId++, hpMul);
    this.towers.push(t);
    return t;
  }

  /**
   * A building card's building (sim/buildings.js), centred at x and solid and
   * damageable from this step on (it drops in, arms and decays in
   * updateBuilding). Returns the building, or null for an unknown id.
   */
  addBuilding(bid, team, x, level = 1) {
    const t = makeBuilding(bid, team, x, level, this.nextId++);
    if (!t) return null;
    this.towers.push(t);
    this.emit('buildingPlaced', t.x, 0, { tower: t, team, bid });
    return t;
  }

  removeUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    if (this.grab && this.grab.unit === u) this.grab = null;
    if (u.heldBy) this.letGo(u);
    if (u.holding) this.letGo(u.holding);
    this.arrows = this.arrows.filter((a) => a.host !== u);
    if (this.mode !== 'arena') return;
    // Arena: forget it everywhere, so long matches don't hold on to the dead
    for (const a of this.arrows) {
      if (a.target === u) a.target = null;
      if (a.from === u) a.from = null;
    }
    for (const o of this.units) {
      if (o.target === u) o.target = null;
      if (o.lastHitBy === u) o.lastHitBy = null;
    }
    for (const t of this.towers) if (t.target === u) t.target = null;
    for (const s of this.shots) if (s.from === u) s.from = null;
    const k = this.blasts.indexOf(u);
    if (k >= 0) this.blasts.splice(k, 1);
    if (u.spawnOf != null) {
      // A spawner keeps the ids of its live kids only
      const t = this.towers.find((o) => o.id === u.spawnOf);
      if (t && t.spawn) t.spawn.kids = t.spawn.kids.filter((id) => id !== u.id);
    }
  }

  clearTeam(team) {
    for (const u of this.units.slice()) if (!team || u.team === team) this.removeUnit(u);
  }

  /** Placement as plain data (for retry / next round), always inside each team's zone. */
  snapshot() {
    return this.units.map((u) => ({ type: u.type.id, team: u.team, x: Math.round(zoneClamp(u.team, u.walkTo ?? u.homeX ?? u.hip.x)), lane: u.lane, seed: u.placeSeed }));
  }

  count(team, aliveOnly = true) {
    let n = 0;
    for (const u of this.units) if (u.team === team && (!aliveOnly || u.alive)) n++;
    return n;
  }

  cost(team) {
    let c = 0;
    for (const u of this.units) if (u.team === team) c += u.type.cost;
    return c;
  }

  teamHp(team) {
    let hp = 0;
    let max = 0;
    for (const u of this.units) {
      if (u.team !== team) continue;
      hp += Math.max(0, u.hp);
      max += u.maxHp;
    }
    return { hp, max };
  }

  /**
   * Placement rule for the player: a bean held or dropped over the line goes
   * back to its zone edge. (Re-created rather than teleported: its planted
   * feet would drag it straight back.) Call before start().
   */
  enforceZones() {
    this.release();
    for (const u of this.units.slice()) {
      const x = zoneClamp(u.team, u.walkTo ?? u.hip.x);
      if (Math.abs(x - u.hip.x) < 1 && u.walkTo == null) continue;
      this.removeUnit(u);
      this.addUnit(u.type.id, u.team, x, u.lane, u.placeSeed);
    }
  }

  start() {
    if (this.phase !== 'place' || !this.count('blue') || !this.count('red')) return false;
    this.release();
    this.phase = 'battle';
    this.battleTime = 0;
    this.yellT = 0.9;
    for (const u of this.units) {
      u.homeX = u.homeX ?? u.hip.x;
      u.hopAt = this.rng.range(0, 0.35); // the army leaps up yelling in a ripple, then charges
      u.mouth = this.rng.range(0.5, 0.9);
      u.mouthKind = 'o';
      u.brow = 1;
    }
    this.emit('battleStart', WORLD.width / 2, -100, {});
    return true;
  }

  // --- simulation --------------------------------------------------------------

  step(dt = DT) {
    this.dt = dt;
    this.time += dt;
    if (this.phase === 'battle') this.battleTime += dt;
    if (this.yellT > 0) this.yellT -= dt;
    const units = this.units;
    if (this.blasts.length) for (const u of this.blasts.splice(0)) this.explode(u);

    // Tummy Drummers keep the beat
    for (const u of units) if (u.type.beat) this.drum(u, dt);

    // AI (staggered, ~7 Hz)
    for (const u of units) {
      u.thinkT -= dt;
      if (u.thinkT <= 0) {
        u.thinkT = 0.14 + u.rng.next() * 0.06;
        u.think(this);
      }
    }

    // Muscles
    for (const u of units) {
      if (u.asleep) continue;
      u.control(dt, this);
      u.shieldTilt = u.type.shield ? this.shieldTiltOf(u) : 0;
    }

    // Hand of god
    if (this.grab) {
      const g = this.grab;
      springTo(g.p, g.x, g.y, 900, 48, dt, (g.unit.supportMass + 1) / g.p.mass * 0.55);
    }
    // Held beans hang from their holder (the same spring)
    for (const h of units) {
      const v = h.holding;
      if (!v) continue;
      const [ax, ay] = h.holdPoint();
      springTo(v.chest, ax, ay, 900, 48, dt, ((v.supportMass + 1) / v.chest.mass) * 0.55);
    }

    // Integrate + ground
    for (const u of units) {
      if (u.asleep) continue;
      for (const p of u.parts) {
        integrate(p, dt, G, DRAG);
        collideGround(p, dt);
      }
    }
    for (const it of this.items) {
      it.age += dt;
      integrate(it.a, dt, G, DRAG);
      integrate(it.b, dt, G, DRAG);
      if (it.flutter) flutter(it, dt);
      collideGround(it.a, dt);
      collideGround(it.b, dt);
    }

    // Constraints
    for (let k = 0; k < ITER; k++) {
      for (const u of units) {
        if (u.asleep) continue;
        const cons = u.cons;
        for (let i = 0; i < cons.length; i++) cons[i].solve();
        const side = -u.f;
        const lim = u.alive ? 0.5 : 0.25;
        hingeLimit(u.hip, u.knee[0], u.foot[0], side, lim);
        hingeLimit(u.hip, u.knee[1], u.foot[1], side, lim);
        for (const p of u.parts) clampGround(p);
      }
      for (const it of this.items) {
        it.con.solve();
        clampGround(it.a);
        clampGround(it.b);
      }
    }

    this.separate(dt);
    this.walls(dt);
    if (this.towers.length) this.towerWalls(dt);

    if (this.phase === 'battle' || this.phase === 'over') {
      for (const u of units) {
        if (!u.striking || !u.alive) continue;
        if (u.type.dash) this.resolveDash(u);
        else if (u.type.attack && u.type.attack.bite) this.resolveBite(u);
        else this.resolveMelee(u);
      }
    }
    this.updateArrows(dt);
    if (this.towers.length || this.shots.length) updateTowers(this, dt);
    if (this.spells.length) updateSpells(this, dt);

    for (const u of units) u.post(dt, this);

    if (this.mode === 'arena') this.reap(dt);
    else if (this.phase === 'battle') this.checkEnd();
    if (this.pending.length) for (const fn of this.pending.splice(0)) fn();
  }

  /** Arena housekeeping: fade out and remove the dead, old weapons and old arrows. */
  reap(dt) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.alive) continue;
      if (u.gone) {
        if (u.exploded) this.removeUnit(u);
        continue;
      }
      if (u.deadT < CORPSE_FADE_AT) continue;
      u.fade = Math.max(0, u.fade - dt / CORPSE_FADE_T);
      if (u.fade <= 0) this.removeUnit(u);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.age < (it.life ?? ITEM_FADE_AT)) continue;
      it.fade = Math.max(0, (it.fade ?? 1) - dt / CORPSE_FADE_T);
      if (it.fade > 0) continue;
      this.items.splice(i, 1);
      if (it.kind === 'shield') this.arrows = this.arrows.filter((a) => a.item !== it);
    }
  }

  shieldTiltOf(u) {
    // Shield tilt follows the attack poses a little; raised = tipped back over the head
    const a = u.act;
    if (u.guardT > 0 && (!a || a.phase === 'windup')) return 0.85;
    if (!a) return 0.12;
    if (a.phase === 'strike') return a.variant ? 0.2 : 0.15;
    return 0.06;
  }

  /** Soft body-vs-body pushing. Teammates squeeze past each other, enemies don't. */
  separate(dt) {
    const s = this.sorted;
    s.length = 0;
    for (const u of this.units) if (u.alive && !u.held) s.push(u); // (a held bean is carried through the crowd)
    s.sort((a, b) => a.hip.x - b.hip.x);
    for (let i = 0; i < s.length; i++) {
      const a = s[i];
      for (let j = i + 1; j < s.length; j++) {
        const b = s[j];
        const dx = b.hip.x - a.hip.x;
        if (dx > 70) break;
        if (Math.abs(b.hip.y - a.hip.y) > 34) continue;
        const same = a.team === b.team;
        if (same) {
          // Teammates: soft personal space only, weaker across lanes, so a
          // walking bean can squeeze past one that's standing (1D can't swap
          // order otherwise).
          // Bombs keep their distance from each other (one going off shouldn't take them all)
          const minD = a.type.spread && b.type.spread ? Math.max(a.type.spread, b.type.spread) : (a.R + b.R) * 0.8;
          if (dx >= minD) continue;
          const lane = 1 - Math.min(1, Math.abs(a.lane - b.lane)) * 0.75;
          const acc = Math.min(260, (minD - dx) * 45) * lane;
          const wa = (2 * b.mass) / (a.mass + b.mass); // the lighter one gives way
          const wb = (2 * a.mass) / (a.mass + b.mass);
          for (const p of a.body) p.addVel(-acc * wa * dt, 0, dt);
          for (const p of b.body) p.addVel(acc * wb * dt, 0, dt);
          continue;
        }
        // A Pogo high on its hop sails over beans, and a swooping Pelican flies right into its catch
        if (hopsOver(a) || hopsOver(b) || swoopsAt(a, b) || swoopsAt(b, a)) continue;
        // Enemies: solid. Move whole torsos (keeps velocity), bleed off approach speed
        const minD = (a.R + b.R) * 1.05 + 3;
        if (dx < minD) {
          const share = 0.7 * (minD - dx);
          moveTorso(a, (-share * b.mass) / (a.mass + b.mass), 0);
          moveTorso(b, (share * a.mass) / (a.mass + b.mass), 0);
          const closing = a.hip.vx(dt) - b.hip.vx(dt);
          if (closing > 0) {
            for (const p of a.body) p.addVel(-closing * 0.25, 0, dt);
            for (const p of b.body) p.addVel(closing * 0.25, 0, dt);
          }
        }
        // Leaning upper bodies too: no heads inside heads
        capsulePush(a, b, (a.R + b.R) * 0.92, 0.5);
      }
    }
    // Corpses shove each other so they pile up instead of sinking into one another
    const d = this.sortedDead;
    d.length = 0;
    for (const u of this.units) if (!u.alive && !u.gone && !u.held) d.push(u);
    d.sort((a, b) => a.hip.x - b.hip.x);
    for (let i = 0; i < d.length; i++) {
      for (let j = i + 1; j < d.length; j++) {
        const a = d[i];
        const b = d[j];
        if (Math.min(b.hip.x, b.head.x) - Math.max(a.hip.x, a.head.x) > 40) {
          if (b.hip.x - a.hip.x > 80) break;
          continue;
        }
        if (a.asleep && b.asleep) continue;
        if (capsulePush(a, b, (a.R + b.R) * 0.85, 0.4) > 1) {
          a.asleep = false;
          b.asleep = false;
        }
      }
    }
  }

  /** Soft world walls at the castles: beans bounce off them instead of leaving the world. */
  walls(dt) {
    // The arena is framed whole on screen: keep everyone inside the picture
    const lo = this.mode === 'arena' ? 12 : -150;
    const hi = this.mode === 'arena' ? WORLD.width - 12 : WORLD.width + 150;
    for (const u of this.units) {
      if (u.asleep) continue;
      const x = u.hip.x;
      const over = x < lo ? lo - x : x > hi ? hi - x : 0;
      if (!over) continue;
      const vx = u.hip.vx(dt);
      for (const p of u.parts) {
        p.teleport(over, 0);
        if (Math.sign(p.x - p.px) !== Math.sign(over)) p.px = p.x + (p.x - p.px) * 0.4; // reflect, damped
      }
      for (const ft of u.feet) ft.x += over;
      if (Math.abs(vx) > 250) this.emit('land', u.hip.x, u.ground, { unit: u, power: Math.min(1.2, Math.abs(vx) / 900) });
    }
    for (const it of this.items) {
      for (const p of [it.a, it.b]) {
        if (p.x < lo - 40) p.teleport(lo - 40 - p.x, 0);
        else if (p.x > hi + 40) p.teleport(hi + 40 - p.x, 0);
      }
    }
  }

  /**
   * Standing towers are walls to the other team: bodies, limbs and weapons are
   * pushed out to the side the bean is on and lose the speed that was carrying
   * them in. Teammates walk past their own towers (drawn in front of them).
   * A Castle backs onto the edge of the world: there is no room behind it, so
   * it is a wall all the way up (nobody gets flung over it into the gap and
   * stuck off screen) and always puts enemies back out on the field side.
   */
  towerWalls(dt) {
    for (const t of this.towers) {
      if (!t.alive) continue;
      const x0 = t.x - t.w / 2;
      const x1 = t.x + t.w / 2;
      const castle = t.kind === 'castle';
      const top = castle ? -Infinity : -t.h;
      for (const u of this.units) {
        // (a bean in a Pelican's beak or a Jelly is carried past: its holder's own tower is no wall to it)
        if (u.team === t.team || u.asleep || u.gone || u.heldBy) continue;
        if (u.hip.x < x0 - 110 || u.hip.x > x1 + 110) continue;
        const side = castle ? t.f : u.hip.x < t.x ? -1 : 1;
        let hit = 0;
        for (const p of u.parts) {
          if (p.y + p.r < top) continue; // flying over it
          const lim = side < 0 ? x0 - p.r : x1 + p.r;
          if ((p.x - lim) * side >= 0) continue;
          const vx = p.x - p.px;
          p.x = lim;
          // Into the wall: a dull, damped bounce. Along it: keep sliding.
          p.px = vx * side < 0 ? p.x + vx * 0.25 : p.x - vx;
          if (p === u.hip) hit = Math.max(hit, Math.abs(vx) / dt);
        }
        for (const ft of u.feet) {
          const lim = side < 0 ? x0 - 2 : x1 + 2;
          if ((ft.x - lim) * side < 0) ft.x = lim;
        }
        if (hit > 300) this.emit('land', u.hip.x, u.ground, { unit: u, power: Math.min(1.2, hit / 900) });
      }
    }
  }

  /** Is a standing tower or building of `team` strictly between x0 and x1? */
  towerBetween(team, x0, x1) {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (const t of this.towers) if (t.alive && t.team === team && t.x > a && t.x < b) return true;
    return false;
  }

  /**
   * Arena targeting: the nearest enemy bean in sight along x (melee
   * MELEE_SIGHT, ranged preferred range + RANGED_SIGHT) that it can target,
   * else the nearest standing enemy structure (tower or building). The Brick
   * and the Pogo only ever go for structures, and melee beans don't chase
   * someone standing behind an enemy structure: the structure comes first. A
   * netter (prefersAir) goes for any flier it can reach within that far first.
   */
  findArenaTarget(u) {
    const foe = enemyOf(u.team);
    let best = null;
    if (!structuresOnly(u.type)) {
      if (u.type.prefersAir) best = this.nearestBean(u, foe, u.type.prefersAir, isFlier);
      if (!best) best = this.nearestBean(u, foe, u.type.ranged ? u.preferRange + RANGED_SIGHT : MELEE_SIGHT, null);
    }
    if (best) return best;
    let bd = Infinity;
    for (const t of this.towers) {
      if (t.team !== foe || !t.alive) continue;
      const d = Math.abs(t.x - u.hip.x);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** The enemy bean u would go for within `sight` px along x (only those passing `only`, if given), or null. */
  nearestBean(u, foe, sight, only) {
    let best = null;
    let bestScore = Infinity;
    for (const e of this.units) {
      if (e.team !== foe || !e.alive || !canTarget(u, e) || (only && !only(e))) continue;
      const d = Math.abs(e.hip.x - u.hip.x);
      if (d > sight) continue;
      if (!u.type.ranged && this.towerBetween(foe, u.hip.x, e.hip.x)) continue;
      let score = d + Math.abs(e.lane - u.lane) * 20;
      if (e === u.target) score -= 30;
      score += ((e.id * 7919 + u.id * 104729) % 23) - 11;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Can unit u pick e as a target? (The exported canTarget, for callers holding a battle.) */
  canTarget(u, e) {
    return canTarget(u, e);
  }

  findTarget(u) {
    if (this.mode === 'arena') return this.findArenaTarget(u);
    const foe = enemyOf(u.team);
    let best = null;
    let bestScore = Infinity;
    for (const e of this.units) {
      if (e.team !== foe || !e.alive || (e.air && !canTarget(u, e))) continue; // (a flier out of its reach: no point chasing it)
      let score = Math.abs(e.hip.x - u.hip.x) + Math.abs(e.lane - u.lane) * 20;
      if (e === u.target) score -= 30; // sticky
      // Spread out a bit so everyone doesn't dogpile the same bean
      score += ((e.id * 7919 + u.id * 104729) % 23) - 11;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /**
   * Spiker pounce: its point against enemy shields and bodies. One hit per
   * leap. A flier's dive (dash.kind 'dive': Propeller Pals, the Pelican's
   * peck) works the same, head first, and rebounds up and back off what it hits.
   */
  resolveDash(u) {
    const a = u.act;
    if (!a || a.done) return;
    const D = u.type.dash;
    const dt = this.dt;
    const dive = D.kind === 'dive';
    const kind = dive ? (u.type.scoop ? 'peck' : 'dive') : 'spike';
    const tx = u.head.x + u.ux * u.R * 0.7;
    const ty = u.head.y + u.uy * u.R * 0.7;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive) continue;
      if (Math.abs(e.hip.x - u.hip.x) > 100) continue;
      if (e.air && !u.type.hitsAir) continue; // high up: out of its league
      const sh = e.shieldFrame();
      if (sh && e.conscious > 0.4 && Math.sign(u.hip.x - e.hip.x) === e.f) {
        const pad = (u.R * 0.6 + 4) ** 2;
        if (segSeg(u.chest.x, u.chest.y, tx, ty, sh.x - sh.ax * sh.half, sh.y - sh.ay * sh.half, sh.x + sh.ax * sh.half, sh.y + sh.ay * sh.half, tmp).d2 < pad) {
          // BOING: bounced off the shield, seeing stars
          a.done = true;
          e.takeHit(this, { damage: 4 * u.dmgMul, dvx: u.f * 70, dvy: -20, x: tmp.x2, y: tmp.y2, stun: 0.1, kind: 'block', from: u, spin: 0.2 });
          for (const p of u.parts) p.setVel(-u.f * 230, -260, dt);
          u.conscious = Math.max(0, u.conscious - 0.75);
          u.downT = Math.max(u.downT, 0.5);
          this.stats.blocks++;
          this.emit('block', tmp.x2, tmp.y2, { power: 0.9, dirX: -u.f, dirY: -0.3, unit: e, from: u, kind: 'melee' });
          return;
        }
      }
      const rr = e.R + u.R * 0.45;
      const hitA = segSeg(u.chest.x, u.chest.y, tx, ty, e.hip.x, e.hip.y, e.chest.x, e.chest.y, tmp).d2 < rr * rr;
      const hitB = !hitA && segSeg(u.chest.x, u.chest.y, tx, ty, e.chest.x, e.chest.y, e.head.x, e.head.y, tmp).d2 < rr * rr;
      if (!hitA && !hitB) continue;
      a.done = true;
      const lethal = e.hp - D.damage <= 0;
      const k = (lethal ? 1.2 : 1) * this.rng.range(0.9, 1.1);
      const hx = tmp.x2;
      const hy = tmp.y2;
      e.takeHit(this, { damage: D.damage * this.rng.range(0.9, 1.1) * u.dmgMul, dvx: u.f * D.launch[0] * k, dvy: -D.launch[1] * k, x: hx, y: hy, stun: D.stun, kind, from: u, spin: 0.4, flip: 140 });
      // The spiker rebounds off its victim (a diver bounces up and back, BONK)
      for (const p of u.parts) p.setVel(-u.f * 120, dive ? -260 : -180, dt);
      this.stats.hits++;
      this.emit('hit', hx, hy, { kind, power: dive ? 0.8 : 1.05, dirX: u.f * 0.8, dirY: -0.6, unit: e, from: u, killed: !e.alive });
      return;
    }
    // Point-first into an enemy tower
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      const pad = u.R * 0.45 + 4;
      const hit = segRect(u.chest.x, u.chest.y, tx, ty, t.x - t.w / 2 - pad, -t.h - pad, t.x + t.w / 2 + pad, WORLD.laneDepth + 40);
      if (!hit) continue;
      a.done = true;
      const hx = clamp(hit.x, t.x - t.w / 2, t.x + t.w / 2);
      damageTower(this, t, D.damage * this.rng.range(0.9, 1.1) * u.dmgMul * takesOf(t, 'spike', D.vsTower), hx, hit.y, kind, u);
      if (dive) {
        for (const p of u.parts) p.setVel(-u.f * 120, -260, dt);
        return;
      }
      for (const p of u.parts) p.setVel(-u.f * 170, -220, dt); // boing off the stone
      u.conscious = Math.max(0, u.conscious - 0.3);
      return;
    }
  }

  /** Brick hammer meets the ground: a shockwave hops everything nearby into the air. */
  quake(u, x) {
    const Q = u.type.attack.quake;
    const dt = this.dt;
    this.emit('quake', x, u.ground, { unit: u, power: 1 });
    for (const e of this.units) {
      if (e === u || e.gone) continue;
      if (e.alive && e.team === u.team) continue;
      const dx = e.hip.x - x;
      const ad = Math.abs(dx);
      if (ad > Q.radius) continue;
      if (e.ground - e.hip.y - e.standH > 40) continue; // already airborne: it passes underneath
      const k = 1 - ad / Q.radius;
      const dir = Math.sign(dx) || u.f;
      const live = e.alive ? 1 : 0.6;
      e.takeHit(this, {
        damage: Q.damage * k * u.dmgMul,
        dvx: dir * Q.launch[0] * k * live,
        dvy: -Q.launch[1] * (0.45 + 0.55 * k) * live,
        x: e.hip.x,
        y: e.hip.y + e.R,
        stun: Q.stun * (0.5 + 0.5 * k),
        kind: 'quake',
        from: u,
        spin: 0.3,
        flip: 70 * k,
      });
    }
    for (const it of this.items) {
      const ad = Math.abs((it.a.x + it.b.x) / 2 - x);
      if (ad > Q.radius) continue;
      const k = 1 - ad / Q.radius;
      it.a.addVel(0, -320 * k, dt);
      it.b.addVel(0, -360 * k, dt);
    }
    // Towers shake too (stone: reduced splash)
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive) continue;
      const ad = Math.max(0, Math.abs(t.x - x) - t.w / 2);
      if (ad > Q.radius) continue;
      const k = 1 - ad / Q.radius;
      damageTower(this, t, Q.damage * k * u.dmgMul * takesOf(t, 'quake', Q.vsTower), clamp(x, t.x - t.w / 2, t.x + t.w / 2), -12, 'quake', u);
    }
  }

  /** Is another bomb of u's team close ahead of it (in direction dir)? */
  bombAhead(u, dir) {
    for (const o of this.units) {
      if (o === u || !o.alive || o.team !== u.team || !o.type.spread) continue;
      const d = (o.hip.x - u.hip.x) * dir;
      if (d > 0 && d < u.type.spread) return true;
    }
    return false;
  }

  /** Knock a unit's hat off: it becomes a loose item that tumbles to the ground. */
  popHat(u, dvx = 0, dvy = 0) {
    if (!u.hat) return;
    const dt = this.dt;
    const R = u.R;
    const ux = u.ux;
    const uy = u.uy;
    const nx = -uy; // across the head (the brim)
    const ny = ux;
    // Same seat as the renderer's hatAnchor (render/hats.js), so the hat leaves from where it sat
    const shape = u.type.shape || 'bean';
    const base = shape === 'ball' ? u.chest : u.head;
    const seat = shape === 'triangle' ? 0.45 : shape === 'brick' ? 0.95 : shape === 'ball' ? 1.0 : shape === 'jelly' ? 0.9 : 0.92;
    const cx = base.x + ux * R * seat;
    const cy = base.y + uy * R * seat;
    const w = R * 1.5;
    const vx = base.vx(dt) + dvx * 0.4;
    const vy = base.vy(dt) + dvy * 0.4 - 220;
    const spin = (this.fxRng.next() - 0.5) * 500;
    const mk = (x, y, s) => {
      const p = new Particle(x, y, 0.3, 2.5);
      p.setVel(vx - ny * spin * s, vy + nx * spin * s, dt);
      p.ground = u.ground;
      p.friction = 0.4;
      p.bounce = 0.35;
      return p;
    };
    const a = mk(cx - (nx * w) / 2, cy - (ny * w) / 2, -1);
    const b = mk(cx + (nx * w) / 2, cy + (ny * w) / 2, 1);
    this.items.push({ kind: 'hat', hat: u.hat, team: u.team, f: u.f, R, a, b, con: new Dist(a, b, w), age: 0 });
    u.hat = null;
    this.emit('hatOff', cx, cy, { unit: u });
  }

  queueBlast(u) {
    if (!u.exploded && !this.blasts.includes(u)) this.blasts.push(u);
  }

  /** Bomb goes off: blown to bits, and a blast launches everything around it. */
  explode(u) {
    if (u.exploded) return;
    u.exploded = true;
    const cx = u.chest.x;
    const cy = u.chest.y;
    // Blown to bits: no corpse, nothing left to simulate
    u.alive = false;
    u.hp = 0;
    u.conscious = 0;
    u.act = null;
    u.striking = false;
    u.state = 'dead';
    u.gone = true;
    u.asleep = true;
    if (this.grab && this.grab.unit === u) this.grab = null;
    if (u.heldBy) this.letGoOf(u.heldBy, 'death');
    if (u.holding) this.letGoOf(u, 'death');
    this.arrows = this.arrows.filter((a) => a.host !== u);
    u.arrows.length = 0;
    this.blastAt(cx, cy, u.type.blast, u.team, u.dmgMul, u);
  }

  /**
   * A blast at (cx, cy) set off by `team`: launches every bean in X.radius
   * (teammates get X.friendly of the damage), lights bombs close to it, flings
   * items and damages enemy structures. X = { radius, damage, launch,
   * friendly, chain, vsGiant, vsTower }; from = the bomb that went off (it is
   * never hit by its own blast), or null (nobody is spared).
   * opts: { power (event strength, 1), small (a little blast: no hitstop or word) }
   */
  blastAt(cx, cy, X, team, dmgMul, from = null, opts = {}) {
    const dt = this.dt;
    this.emit('explode', cx, cy, { unit: from, power: opts.power ?? 1, team, radius: X.radius, small: !!opts.small });
    for (const e of this.units) {
      if (e === from || e.gone) continue;
      let d = Infinity;
      for (const p of e.body) d = Math.min(d, Math.hypot(p.x - cx, p.y - cy));
      if (d > X.radius) continue;
      const k = 1 - d / X.radius;
      let nx = e.chest.x - cx;
      let ny = e.chest.y - cy - 25; // always a bit upward
      let l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (ny > -0.4) {
        ny = -0.4;
        l = Math.hypot(nx, ny);
        nx /= l;
        ny /= l;
      }
      const sp = X.launch * (0.35 + 0.65 * k);
      const friend = e.team === team;
      // Bombs right next to the blast light up, get flung, and go off where they land
      if (e.type.blast && e.alive && !e.exploded && d < X.radius * 0.5) {
        const left = e.act && e.act.phase === 'fuse' ? e.type.blast.fuse - e.act.t : Infinity;
        const delay = e.type.blast.chain;
        if (left > delay) e.act = { phase: 'fuse', t: e.type.blast.fuse - delay, hits: new Set(), done: false };
      }
      // In a match your own living beans are only shoved, not floored, by your
      // bombs (at full strength the bomb cards were too self-defeating to use);
      // the sandbox keeps the full chaos.
      const soft = friend && e.alive && this.mode === 'arena' ? 0.35 : 1;
      e.takeHit(this, {
        damage: X.damage * k * (friend ? X.friendly : 1) * (e.mass >= 3 ? X.vsGiant || 1 : 1) * dmgMul,
        dvx: nx * sp * soft,
        dvy: ny * sp * soft,
        x: cx,
        y: cy,
        stun: (0.3 + 1.0 * k) * soft,
        kind: 'blast',
        from,
        spin: 0.5,
        flip: 120 * k * Math.sign(nx || 1) * soft,
      });
    }
    for (const it of this.items) {
      for (const p of [it.a, it.b]) {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d > X.radius) continue;
        const k = 1 - d / X.radius;
        p.addVel(((p.x - cx) / (d || 1)) * 300 * k, -420 * k, dt);
      }
    }
    // Enemy towers and buildings in the blast (a wall right next to it takes nearly all of it)
    for (const t of this.towers) {
      if (t.team === team || !t.alive) continue;
      const d = rectDist(t, cx, cy);
      if (d > X.radius) continue;
      const k = 1 - (0.5 * d) / X.radius;
      damageTower(this, t, X.damage * k * dmgMul * takesOf(t, 'blast', X.vsTower), clamp(cx, t.x - t.w / 2, t.x + t.w / 2), clamp(cy, -t.h, 0), 'blast', from);
    }
  }

  /** Swept test of a swinging weapon against enemy shields and bodies. */
  resolveMelee(u) {
    if (!u.tip || !u.act) return;
    const W = u.W;
    const A = u.type.attack;
    const h = u.hand[u.mainHand];
    const t = u.tip;
    const s0 = u.type.weapon === 'club' ? 0.4 : 0.15;
    const ax = h.x + (t.x - h.x) * s0;
    const ay = h.y + (t.y - h.y) * s0;
    const tvx = t.vx(this.dt);
    const tvy = t.vy(this.dt);
    const tipSpeed = Math.hypot(tvx, tvy);
    const ref = u.type.weapon === 'club' ? 650 : 260; // a sword thrust is slower than a club swing
    const sf = clamp(tipSpeed / ref, 0.35, 1.3);
    for (const e of this.units) {
      if (u.act.done) return;
      if (e.team === u.team || !e.alive || u.act.hits.has(e.id)) continue;
      if (Math.abs(e.hip.x - u.hip.x) > 140) continue;
      if (e.air && !u.type.hitsAir) continue; // swinging at thin air: it's flying too high
      if (A.air && u.act.variant && !isFlier(e)) continue; // a netter's air scoop sweeps up past the beans below its flier
      const rr = e.R + W.tipR;
      // Body capsule (hip-chest, chest-head)
      let hit = false;
      let hx = 0;
      let hy = 0;
      const segs = [
        [e.hip, e.chest],
        [e.chest, e.head],
      ];
      for (const [p, q] of segs) {
        if (segSeg(ax, ay, t.x, t.y, p.x, p.y, q.x, q.y, tmp).d2 < rr * rr || segSeg(t.px, t.py, t.x, t.y, p.x, p.y, q.x, q.y, tmp).d2 < rr * rr) {
          hit = true;
          hx = tmp.x1;
          hy = tmp.y1;
          break;
        }
      }
      // Shield: only when the attacker is in front of it. A hit that lands
      // above the shield's top edge goes over it (clubs come down on heads).
      const sh = e.shieldFrame();
      if (sh && e.conscious > 0.4 && Math.sign(u.hip.x - e.hip.x) === e.f) {
        const sx0 = sh.x - sh.ax * sh.half;
        const sy0 = sh.y - sh.ay * sh.half;
        const sx1 = sh.x + sh.ax * sh.half;
        const sy1 = sh.y + sh.ay * sh.half;
        const pad = (W.tipR + 4) ** 2;
        const touch = segSeg(ax, ay, t.x, t.y, sx0, sy0, sx1, sy1, tmp).d2 < pad || segSeg(t.px, t.py, t.x, t.y, sx0, sy0, sx1, sy1, tmp).d2 < pad;
        const over = hit && (hx - sh.x) * sh.ax + (hy - sh.y) * sh.ay > sh.half * 0.45;
        if (touch && !over) {
          this.blockHit(u, e, tmp.x2, tmp.y2, sf);
          return; // the shield stops the weapon: nobody else gets hit by this swing
        }
      }
      if (!hit) continue;
      u.act.hits.add(e.id);
      if (!A.cleave) u.act.done = true;
      if (A.air && isFlier(e) && !(e.netImmuneT > 0)) {
        this.netted(u, e, hx, hy);
        if (!A.cleave) return;
        continue;
      }
      const dmg = A.damage * (0.55 + 0.45 * sf) * this.rng.range(0.9, 1.1) * u.dmgMul;
      const lethal = e.hp - dmg <= 0;
      const tl = tipSpeed || 1;
      let dvx;
      let dvy;
      if (A.launch) {
        // The star of the show: up, away and cartwheeling. Killing blows go further.
        const k = clamp(sf, 0.6, 1.15) * (lethal ? 1.25 : 1) * this.rng.range(0.9, 1.1);
        dvx = u.f * A.launch[0] * k;
        dvy = -A.launch[1] * k;
      } else {
        // Mostly "away and up" so hits shove beans instead of burying them
        const knock = A.knock * sf * (lethal ? 1.3 : 1);
        const kx = u.f * 0.82 + (tvx / tl) * 0.25;
        const ky = -0.6 + Math.min(0, tvy / tl) * 0.2;
        const kl = Math.hypot(kx, ky);
        dvx = (kx / kl) * knock;
        dvy = (ky / kl) * knock;
      }
      const dl = Math.hypot(dvx, dvy) || 1;
      const kx = dvx / dl;
      const ky = dvy / dl;
      e.takeHit(this, {
        damage: dmg,
        dvx,
        dvy,
        x: hx,
        y: hy,
        stun: A.stun * (0.6 + 0.4 * sf),
        kind: u.type.weapon,
        from: u,
        spin: A.launch ? 0.35 : 0.5,
        flip: A.launch ? 150 * clamp(sf, 0.6, 1.15) : 0,
      });
      // Follow-through: the weapon slows down on impact
      t.addVel(-tvx * 0.35, -tvy * 0.35, this.dt);
      this.stats.hits++;
      const power = clamp((dmg / 40) * sf, 0.15, 1.5);
      this.emit('hit', hx, hy, { kind: u.type.weapon === 'club' ? 'bonk' : u.type.weapon === 'net' ? 'net' : 'slash', power, dirX: kx, dirY: ky, unit: e, from: u, killed: !e.alive });
      if (!A.cleave) return;
    }
    if (this.towers.length && !u.act.done) this.meleeTower(u, ax, ay, sf);
  }

  /**
   * Butterfly Netter catches a flier (high or low): it's slammed down into the
   * dirt with its lift off, a ground target for everyone until the lift comes
   * back. Once caught it is net-immune for a while: a new net hit is a plain swat.
   */
  netted(u, e, hx, hy) {
    const N = u.type.attack.air;
    e.takeHit(this, { damage: N.damage * u.dmgMul, dvx: u.f * 60, dvy: 0, x: hx, y: hy, stun: N.stun, kind: 'net', from: u, spin: 0.3 });
    e.liftOff(this, N.liftOff, u);
    for (const p of e.parts) p.addVel(0, N.yank, this.dt);
    e.netImmuneT = N.immune;
    this.stats.hits++;
    this.emit('netted', hx, hy, { unit: e, from: u });
    this.emit('hit', hx, hy, { kind: 'net', power: 1, dirX: u.f * 0.3, dirY: 1, unit: e, from: u, killed: !e.alive });
  }

  /**
   * Nutcracker: one CRUNCH, on the first strike substep, at the jaw just in
   * front of its face. The nearest enemy bean whose head or chest is in reach
   * takes it (heavies x vsHeavy; shields don't help); with no bean there, a
   * structure face within 20 px does (stone x vsTower: "ow, my teeth").
   */
  resolveBite(u) {
    const a = u.act;
    if (!a || a.done) return;
    a.done = true; // one bite per strike, hit or miss
    const A = u.type.attack;
    const jaw = u.R + 8;
    const jx = u.head.x + u.fwx * jaw;
    const jy = u.head.y + u.fwy * jaw;
    let best = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive || e.held || (e.air && !u.type.hitsAir)) continue;
      if (Math.abs(e.hip.x - jx) > 120) continue;
      const d = Math.min(Math.hypot(e.head.x - jx, e.head.y - jy), Math.hypot(e.chest.x - jx, e.chest.y - jy));
      if (d < A.biteR + e.R && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      this.bite(u, best, jx, jy);
      return;
    }
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive || rectDist(t, jx, jy) > 20) continue;
      damageTower(this, t, A.damage * u.dmgMul * takesOf(t, 'melee', A.vsTower), clamp(jx, t.x - t.w / 2, t.x + t.w / 2), clamp(jy, -t.h, 0), 'bite', u);
      return;
    }
  }

  bite(u, e, jx, jy) {
    const A = u.type.attack;
    const dmg = A.damage * u.dmgMul * (e.mass >= A.heavyMass ? A.vsHeavy : 1);
    const lethal = e.hp + e.wrapHp - dmg <= 0;
    // A crunch shoves the victim back a step; a lethal one spits it out spinning
    const dvx = u.f * (lethal ? BITE_SPIT[0] : A.knock * 0.8);
    const dvy = -(lethal ? BITE_SPIT[1] : A.knock * 0.6);
    e.takeHit(this, { damage: dmg, dvx, dvy, x: jx, y: jy, stun: A.stun, kind: 'bite', from: u, spin: lethal ? 1.2 : 0.4, flip: lethal ? 220 : 0 });
    e.sqv += 10; // squeezed between the jaws
    this.stats.hits++;
    this.emit('hit', jx, jy, { kind: 'bite', power: clamp(dmg / 70, 0.5, 1.5), dirX: u.f, dirY: -0.4, unit: e, from: u, killed: !e.alive });
  }

  /** The weapon against enemy tower walls: one hit per swing, and it bounces off the stone. */
  meleeTower(u, ax, ay, sf) {
    const W = u.W;
    const A = u.type.attack;
    const t = u.tip;
    const dt = this.dt;
    const pad = W.tipR + 2;
    for (const tw of this.towers) {
      if (tw.team === u.team || !tw.alive || u.act.hits.has(tw.id)) continue;
      if (Math.abs(tw.x - u.hip.x) > tw.w / 2 + 160) continue;
      const x0 = tw.x - tw.w / 2 - pad;
      const x1 = tw.x + tw.w / 2 + pad;
      const hit = segRect(ax, ay, t.x, t.y, x0, -tw.h - pad, x1, WORLD.laneDepth + 40) || segRect(t.px, t.py, t.x, t.y, x0, -tw.h - pad, x1, WORLD.laneDepth + 40);
      if (!hit) continue;
      u.act.hits.add(tw.id);
      if (!A.cleave) u.act.done = true;
      const dmg = A.damage * (0.55 + 0.45 * sf) * this.rng.range(0.9, 1.1) * u.dmgMul * takesOf(tw, 'melee', A.vsTower);
      const hx = clamp(hit.x, tw.x - tw.w / 2, tw.x + tw.w / 2);
      damageTower(this, tw, dmg, hx, hit.y, u.type.weapon, u);
      // Thunk: the weapon rebounds and the swing's kick goes back into the bean
      t.addVel(-t.vx(dt) * 0.9, -t.vy(dt) * 0.6 - 80, dt);
      u.hip.addVel(-u.f * 40 * sf, 0, dt);
      this.stats.hits++;
      return;
    }
  }

  blockHit(u, e, x, y, sf) {
    const A = u.type.attack;
    u.act.hits.add(e.id);
    u.act.done = true;
    const dmg = A.damage * (0.55 + 0.45 * sf) * (A.shieldPierce ?? 0.3) * u.dmgMul;
    const knock = A.knock * sf * 0.45;
    e.takeHit(this, { damage: dmg, dvx: u.f * knock, dvy: -knock * 0.25, x, y, stun: A.stun * 0.3, kind: 'block', from: u, spin: 0.2 });
    // Weapon bounces off, attacker wobbles
    const t = u.tip;
    t.addVel(-t.vx(this.dt) * 1.1, -t.vy(this.dt) * 1.1 - 120, this.dt);
    u.conscious = Math.max(0, u.conscious - 0.12);
    const sh = e.hand[1 - e.mainHand];
    sh.addVel(u.f * 120 * sf, -40, this.dt);
    // The defender is rocked back a step
    e.wobbleT = Math.max(e.wobbleT, 0.3);
    for (const p of e.body) p.addVel(u.f * 90 * sf, 0, this.dt);
    this.stats.blocks++;
    this.emit('block', x, y, { power: clamp(sf, 0.2, 1.3), dirX: -u.f, dirY: -0.3, unit: e, from: u, kind: 'melee' });
  }

  // --- arrows ------------------------------------------------------------------

  /** Ballistic launch toward a target's predicted chest (or a tower's upper body). */
  solveAim(u, t) {
    const A = u.type.attack;
    let bowX = u.chest.x;
    let bowY = u.chest.y;
    let ax;
    let ay;
    let tvx = 0;
    if (t.isTower) {
      ax = t.x + (bowX < t.x ? -t.w : t.w) * 0.3;
      ay = -t.h * 0.72;
    } else {
      if (t.type.shield) t.guardT = Math.max(t.guardT, 0.3); // "incoming!" -> shield up
      ax = t.chest.x;
      ay = t.chest.y;
      tvx = t.alive ? clamp(t.hip.vx(this.dt), -200, 200) : 0;
    }
    let tx = ax;
    let ty = ay;
    if (!u.act.elev) {
      const d0 = Math.abs(tx - bowX);
      u.act.elev = d0 < 170 ? 0.1 + (d0 / 170) * 0.25 : u.rng.range(0.55, 0.85); // lobs that read at arena range
    }
    let elev = u.act.elev;
    let speed = A.maxSpeed;
    let ang = 0;
    // A bomb toss may go up steeply (at a flier overhead); an arrow keeps to readable lobs
    const eMax = A.toss ? TOSS_ELEV : 0.85;
    for (let iter = 0; iter < 3; iter++) {
      const dx = tx - bowX;
      const dist = Math.max(8, Math.abs(dx));
      const h = bowY - ty; // target height above the bow
      let e = elev;
      speed = A.maxSpeed;
      for (let k = 0; k < (A.toss ? 24 : 12); k++) {
        const c = Math.cos(e);
        const den = 2 * c * c * (dist * Math.tan(e) - h);
        if (den > 0) {
          const v = Math.sqrt((G * dist * dist) / den);
          if (v <= A.maxSpeed) {
            speed = v;
            break;
          }
        }
        e += 0.06;
        if (e > eMax) {
          // Out of reach: an arrow flies its 45 degrees; a bomb goes as high as it can over the target
          e = A.toss ? clamp(Math.atan((A.maxSpeed * A.maxSpeed) / (G * dist)), elev, eMax) : 0.785;
          break;
        }
      }
      ang = dx >= 0 ? -e : Math.PI + e;
      const flight = dist / Math.max(60, speed * Math.cos(e));
      tx = ax + tvx * flight;
      ty = ay;
      // The arrow leaves from the bow at arm's length, not from the chest: aim from there
      const reach = u.armLen * 0.92 + 6;
      bowX = u.chest.x + Math.cos(ang) * reach;
      bowY = u.chest.y + Math.sin(ang) * reach;
    }
    return { ang, speed };
  }

  fireArrow(u, sol) {
    const A = u.type.attack;
    const ang = sol.ang + u.rng.gauss() * A.spread;
    const sp = sol.speed * (1 + u.rng.gauss() * 0.04);
    const bh = u.hand[1];
    const vx = Math.cos(ang) * sp;
    const vy = Math.sin(ang) * sp;
    this.arrows.push({
      x: bh.x + Math.cos(ang) * 6,
      y: bh.y + Math.sin(ang) * 6,
      vx,
      vy,
      ang,
      team: u.team,
      from: u,
      damage: A.damage * u.rng.range(0.9, 1.1) * u.dmgMul,
      stun: A.stun,
      state: 'fly',
      ground: WORLD.groundY + this.rng.next() * WORLD.laneDepth + 3,
      host: null,
      target: u.target,
      age: 0,
    });
    this.stats.arrows++;
    this.emit('bowRelease', bh.x, bh.y, { unit: u });
  }

  /**
   * Bomb Juggler: lob one of its bombs along an aim solution (solveAim with
   * its own maxSpeed: a lob), from arm's length like an arrow. The bomb is a
   * 'jbomb' shot (towers.js updateShots): it bursts on the first enemy it
   * touches, or bounces once, rolls and goes off after its fuse.
   */
  fireBomb(u, sol) {
    const A = u.type.attack;
    const X = u.type.bomb;
    const ang = sol.ang + u.rng.gauss() * A.spread;
    const sp = sol.speed * (1 + u.rng.gauss() * 0.04);
    const reach = u.armLen * 0.92 + 6;
    const x = u.chest.x + Math.cos(sol.ang) * reach;
    const y = u.chest.y + Math.sin(sol.ang) * reach;
    const t = u.target;
    const ground = t && !t.isTower ? t.ground : u.ground;
    this.shots.push({ kind: 'jbomb', team: u.team, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: X.r, age: 0, bounced: false, fuseT: -1, from: u, dmgMul: u.dmgMul, X, ground });
    this.emit('juggleToss', x, y, { unit: u });
  }

  /** How many of u's own thrown bombs are still in the air (fumbles are nobody's). */
  bombsInFlight(u) {
    let n = 0;
    for (const s of this.shots) if (s.from === u && s.kind === 'jbomb') n++;
    return n;
  }

  /**
   * A Bomb Juggler drops lit bombs: one at its feet when it's knocked down or
   * grabbed (at most once per fumble.every s), or all of them scattered
   * around it when it dies. They are 'jbomb' shots of nobody's (from: null):
   * its own side, the Juggler included, takes the friendly share.
   */
  fumble(u, death = false) {
    const F = u.type.fumble;
    if (!F) return;
    if (!death) {
      if (u.fumbleT > 0) return;
      u.fumbleT = F.every;
    }
    const n = death ? F.onDeath : F.onDown;
    const X = u.type.bomb;
    this.later(() => {
      for (let i = 0; i < n; i++) {
        const x = u.hip.x + (death ? (this.rng.next() * 2 - 1) * F.spread : 0);
        const vx = (this.rng.next() * 2 - 1) * 60;
        this.shots.push({ kind: 'jbomb', team: u.team, x, y: u.chest.y, vx, vy: -120, r: X.r, age: 0, bounced: false, fuseT: F.delay, from: null, dmgMul: u.dmgMul, X, ground: u.ground });
      }
      this.emit('fumble', u.hip.x, u.chest.y, { unit: u, n });
    });
  }

  /** A Propeller Pal's cap pops off as it dies: it spins up and away, then flutters down like a maple seed (cosmetic). */
  popCap(u) {
    const dt = this.dt;
    const r = this.fxRng;
    const cx = u.head.x + u.ux * u.R;
    const cy = u.head.y + u.uy * u.R;
    const vx = u.head.vx(dt) * 0.5 + (r.next() - 0.5) * 160;
    const vy = Math.min(0, u.head.vy(dt) * 0.5) - 240 - r.next() * 100;
    const spin = (r.next() - 0.5) * 600;
    const w = u.R * 1.3;
    const mk = (x, y, s) => {
      const p = new Particle(x, y, 0.2, 2);
      p.setVel(vx, vy + spin * s, dt);
      p.ground = u.ground;
      p.friction = 0.5;
      p.bounce = 0.2;
      return p;
    };
    const a = mk(cx - w / 2, cy, -1);
    const b = mk(cx + w / 2, cy, 1);
    this.items.push({ kind: 'propCap', team: u.team, f: u.f, R: u.R, a, b, con: new Dist(a, b, w), age: 0, life: CAP_LIFE, flutter: 50 });
    this.emit('propOff', cx, cy, { unit: u });
  }

  // --- Tummy Drummer -----------------------------------------------------------------

  /**
   * A Drummer's beat (each step, before the AI): every beat.every s every
   * friend within beat.radius along x (at any height, the Drummer too) is on
   * the beat for beat.time s (beatT: tempo() and moveMul()). Two Drummers
   * never stack: beatT only ever goes up to beat.time.
   */
  drum(u, dt) {
    if (!u.alive || u.deployT > 0 || u.downT > 0 || u.held || this.phase !== 'battle') return;
    const B = u.type.beat;
    u.beatClock += dt;
    if (u.beatClock < B.every) return;
    u.beatClock -= B.every;
    u.beats++;
    for (const o of this.units) {
      if (o.team !== u.team || !o.alive || Math.abs(o.hip.x - u.hip.x) > B.radius) continue;
      if (o.beatT < B.time) o.beatT = B.time;
    }
    this.emit('beat', u.chest.x, u.chest.y, { unit: u });
  }

  /** A Drummer's drum comes off as it dies and rolls away ringing (cosmetic: a short stick drawn as a disc). */
  dropDrum(u) {
    const dt = this.dt;
    const r = this.fxRng;
    const c = u.chest;
    const vx = c.vx(dt) * 0.6 + (r.next() - 0.5) * 120 - u.f * 60;
    const vy = Math.min(0, c.vy(dt) * 0.5) - 160 - r.next() * 80;
    const R = u.R * 0.75;
    const mk = (x) => {
      const p = new Particle(x, c.y, 0.6, R);
      p.setVel(vx, vy, dt);
      p.ground = u.ground;
      p.friction = 0.04; // it rolls
      p.bounce = 0.45;
      return p;
    };
    const a = mk(c.x - 3);
    const b = mk(c.x + 3);
    this.items.push({ kind: 'drum', team: u.team, f: u.f, R, a, b, con: new Dist(a, b, 6), age: 0 });
  }

  // --- Pogo Bean -----------------------------------------------------------------------

  /**
   * The stick touches down (Unit.hop): within hop.bonk.reach of an enemy
   * structure's face it bonks it.
   */
  bonk(u) {
    const K = u.type.hop.bonk;
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive || rectDist(t, u.hip.x, -10) > K.reach) continue;
      const x = clamp(u.hip.x, t.x - t.w / 2, t.x + t.w / 2);
      damageTower(this, t, K.damage * u.dmgMul * takesOf(t, 'melee'), x, -20, 'pogo', u);
      u.hip.addVel(-Math.sign(t.x - u.hip.x) * 60, 0, this.dt); // BONK: it rebounds a little
      return t;
    }
    return null;
  }

  /**
   * A Pogo coming down: its stick tip on an enemy head stomps it (damage,
   * stun, a squash) and bounces the Pogo high off it. Once per hop.
   */
  stomp(u) {
    const H = u.type.hop;
    const S = H.stomp;
    const tip = u.tip;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive || e.held || e.air || Math.abs(e.head.x - tip.x) > 40) continue;
      if (Math.hypot(e.head.x - tip.x, e.head.y - tip.y) > e.R + 4) continue;
      u.stomped = true;
      e.takeHit(this, { damage: S.damage * u.dmgMul, dvx: 0, dvy: 120, x: tip.x, y: e.head.y - e.R, stun: S.stun, kind: 'stomp', from: u, spin: 0.2 });
      e.sqv += 8;
      const vy = -H.vy * S.bounce * 0.8 - u.hip.vy(this.dt);
      for (const p of u.parts) p.addVel(0, vy, this.dt);
      this.stats.hits++;
      this.emit('stomp', tip.x, e.head.y - e.R, { unit: u, victim: e });
      this.emit('hit', tip.x, e.head.y - e.R, { kind: 'stomp', power: 0.7, dirX: 0, dirY: 1, unit: e, from: u, killed: !e.alive });
      return e;
    }
    return null;
  }

  // --- Pelican ------------------------------------------------------------------------

  /**
   * The bean a Pelican would scoop: the best liftable enemy within scoop.sight
   * along x, by |dx| - 80 for the back line (ranged and support: Archers, the
   * Juggler, the Drummer, the Netter), ties by id. Null if there is none.
   */
  scoopTarget(u) {
    const S = u.type.scoop;
    let best = null;
    let bs = Infinity;
    for (const e of this.units) {
      if (e.team === u.team || !liftable(e, S.maxMass)) continue;
      const dx = Math.abs(e.hip.x - u.hip.x);
      if (dx > S.sight) continue;
      const score = dx - (e.type.ranged || e.type.follow || e.type.prefersAir ? 80 : 0);
      if (score < bs || (score === bs && e.id < best.id)) {
        bs = score;
        best = e;
      }
    }
    return best;
  }

  /**
   * Where a carry ends: carryBack px toward the Pelican's own side from x0,
   * but never into its own Castle's face (nothing gets behind a Castle).
   */
  carryGoal(u, x0) {
    const home = u.team === 'blue' ? -1 : 1;
    let goal = x0 + home * u.type.scoop.carryBack;
    for (const t of this.towers) {
      if (t.team !== u.team || !t.alive || t.kind !== 'castle') continue;
      const limit = t.x - home * (t.w / 2 + 30);
      if ((goal - limit) * home > 0) goal = limit;
    }
    return clamp(goal, 30, WORLD.width - 30);
  }

  // --- Big Jelly ---------------------------------------------------------------------

  /** The liftable enemy a Big Jelly can engulf right now (within engulf.gap of its surface, the nearest), or null. */
  engulfTarget(u) {
    const E = u.type.engulf;
    let best = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (e.team === u.team || !liftable(e, E.maxMass)) continue;
      const d = Math.hypot(e.hip.x - u.hip.x, e.hip.y - u.hip.y);
      if (d < u.R + e.R + E.gap && d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * The Jelly's belly bump: the nearest other enemy bean (not high up, not
   * held, and not one it is about to swallow: with nothing inside and the
   * engulf ready, a liftable bean is left to come in) within bump.gap of its
   * surface is knocked away; with none, a structure face that close takes
   * vsStructure. Returns whether it bumped anything.
   */
  jellyBump(u) {
    const B = u.type.bump;
    const E = u.type.engulf;
    const hungry = !u.holding && u.engulfCool <= 0;
    let best = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive || e.held || e.air || (hungry && liftable(e, E.maxMass))) continue;
      const d = Math.hypot(e.hip.x - u.hip.x, e.hip.y - u.hip.y) - u.R - e.R;
      if (d < B.gap && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const dir = Math.sign(best.hip.x - u.hip.x) || u.f;
      const hx = u.hip.x + dir * u.R;
      const hy = u.chest.y;
      best.takeHit(this, { damage: B.damage * u.dmgMul, dvx: dir * B.knock * 0.85, dvy: -B.knock * 0.55, x: hx, y: hy, stun: B.stun, kind: 'bump', from: u, spin: 0.4, flip: 60 });
      this.stats.hits++;
      this.emit('hit', hx, hy, { kind: 'bump', power: 0.9, dirX: dir, dirY: -0.5, unit: best, from: u, killed: !best.alive });
      return true;
    }
    for (const t of this.towers) {
      if (t.team === u.team || !t.alive || rectDist(t, u.hip.x, u.chest.y) - u.R > B.gap) continue;
      damageTower(this, t, B.vsStructure * u.dmgMul * takesOf(t, 'melee'), clamp(u.hip.x, t.x - t.w / 2, t.x + t.w / 2), u.chest.y, 'bump', u);
      return true;
    }
    return false;
  }

  updateArrows(dt) {
    const foe = { blue: 'red', red: 'blue' };
    const arena = this.mode === 'arena';
    let groundStuck = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.state === 'ground') {
        groundStuck++;
        if (groundStuck > MAX_STUCK_GROUND || (arena && this.time - a.stuckAt > ARROW_FADE_AT)) a.fade = true;
        if (a.fade) {
          a.alpha = (a.alpha ?? 1) - dt * 1.5;
          if (a.alpha <= 0) this.arrows.splice(i, 1);
        }
        continue;
      }
      if (a.state === 'tower') {
        // The tower fell: its arrows sink with the rubble and fade away
        if (a.fade || !a.host.alive) {
          a.fade = true;
          a.alpha = (a.alpha ?? 1) - dt * 1.6;
          if (a.alpha <= 0) {
            this.arrows.splice(i, 1);
            const k = a.host.arrows.indexOf(a);
            if (k >= 0) a.host.arrows.splice(k, 1);
          }
        }
        continue;
      }
      if (a.state !== 'fly') continue;
      if (a.target && a.target.alive && a.target.type && a.target.type.shield) a.target.guardT = Math.max(a.target.guardT, 0.25);
      a.vy += G * dt;
      const nx = a.x + a.vx * dt;
      const ny = a.y + a.vy * dt;
      a.ang = Math.atan2(a.vy, a.vx);
      let done = false;
      for (const e of this.units) {
        if (e.team !== foe[a.team] || !e.alive) continue;
        if (Math.abs(e.hip.x - nx) > 70) continue;
        const sh = e.shieldFrame();
        if (sh && e.conscious > 0.4 && Math.sign(a.vx) === -e.f) {
          const sx0 = sh.x - sh.ax * sh.half;
          const sy0 = sh.y - sh.ay * sh.half;
          const sx1 = sh.x + sh.ax * sh.half;
          const sy1 = sh.y + sh.ay * sh.half;
          if (segSeg(a.x, a.y, nx, ny, sx0, sy0, sx1, sy1, tmp).d2 < 9) {
            this.stickInShield(a, e, tmp.x2, tmp.y2);
            done = true;
            break;
          }
        }
        const rr = e.R;
        if (segSeg(a.x, a.y, nx, ny, e.hip.x, e.hip.y, e.chest.x, e.chest.y, tmp).d2 < rr * rr) {
          this.stickInBody(a, e, 0, tmp);
          done = true;
          break;
        }
        if (segSeg(a.x, a.y, nx, ny, e.chest.x, e.chest.y, e.head.x, e.head.y, tmp).d2 < rr * rr) {
          this.stickInBody(a, e, 1, tmp);
          done = true;
          break;
        }
      }
      if (done) continue;
      for (const t of this.towers) {
        if (t.team !== foe[a.team] || !t.alive || Math.abs(t.x - nx) > t.w / 2 + 40) continue;
        const hit = segRect(a.x, a.y, nx, ny, t.x - t.w / 2, -t.h, t.x + t.w / 2, WORLD.laneDepth + 10);
        if (!hit) continue;
        this.stickInTower(a, t, hit.x, hit.y);
        done = true;
        break;
      }
      if (done) continue;
      if (ny >= a.ground) {
        // Stick in the dirt a few px deep
        const k = (a.ground - a.y) / Math.max(1e-6, ny - a.y);
        a.x += (nx - a.x) * clamp(k, 0, 1) + Math.cos(a.ang) * 5;
        a.y = a.ground + Math.sin(a.ang) * 5;
        a.state = 'ground';
        a.stuckAt = this.time;
        this.emit('arrowGround', a.x, a.ground, { dirX: Math.sign(a.vx) });
        continue;
      }
      a.x = nx;
      a.y = ny;
      if (a.age > 8) this.arrows.splice(i, 1); // gravity always brings them down well before this
    }
  }

  stickInBody(a, e, seg, c) {
    const p = seg === 0 ? e.hip : e.chest;
    const q = seg === 0 ? e.chest : e.head;
    // Tip goes ~6 px past the surface point; store it in the segment's frame
    const tipX = c.x1 + Math.cos(a.ang) * 7;
    const tipY = c.y1 + Math.sin(a.ang) * 7;
    const fr = segFrame(p, q);
    const rx = tipX - p.x;
    const ry = tipY - p.y;
    let along = (rx * fr.ax + ry * fr.ay) / fr.len;
    let perp = rx * fr.nx + ry * fr.ny;
    perp = clamp(perp, -e.R * 0.55, e.R * 0.55);
    along = clamp(along, -0.2, 1.2);
    a.state = 'body';
    a.stuckAt = this.time;
    a.host = e;
    a.seg = seg;
    a.along = along;
    a.perp = perp;
    a.rel = a.ang - fr.ang;
    e.arrows.push(a);
    if (e.arrows.length > 14) {
      const old = e.arrows.shift();
      const k = this.arrows.indexOf(old);
      if (k >= 0) this.arrows.splice(k, 1);
    }
    const sp = Math.hypot(a.vx, a.vy);
    // A jolt, not a shove: little push on the whole body, lots on the struck part (wobble)
    e.takeHit(this, {
      damage: a.damage,
      dvx: (a.vx / sp) * 45,
      dvy: (a.vy / sp) * 20 - 10,
      x: c.x1,
      y: c.y1,
      stun: a.stun ?? 0.16, // carried by the arrow: its shooter may be a tower, or gone
      kind: 'arrow',
      from: a.from,
      spin: 3.2,
    });
    this.emit('hit', c.x1, c.y1, { kind: 'arrow', power: 0.4, dirX: a.vx / sp, dirY: a.vy / sp, unit: e, from: a.from, killed: !e.alive });
  }

  /** An arrow (or a rain arrow, damage 0) thunks into a tower wall and stays there. */
  stickInTower(a, t, x, y) {
    a.state = 'tower';
    a.stuckAt = this.time;
    a.host = t;
    a.lx = x + Math.cos(a.ang) * 6 - t.x; // tip a few px into the stone, relative to the tower base
    a.ly = y + Math.sin(a.ang) * 6;
    t.arrows.push(a);
    if (t.arrows.length > MAX_TOWER_ARROWS) {
      const old = t.arrows.shift();
      const k = this.arrows.indexOf(old);
      if (k >= 0) this.arrows.splice(k, 1);
    }
    if (a.damage > 0) damageTower(this, t, a.damage * takesOf(t, 'arrow'), x, y, a.from && a.from.isTower ? 'bolt' : 'arrow', a.from);
    else this.emit('arrowTower', x, y, { tower: t, dirX: Math.sign(a.vx) });
  }

  stickInShield(a, e, x, y) {
    const sh = e.shieldFrame();
    const rx = x + Math.cos(a.ang) * 4 - sh.x;
    const ry = y + Math.sin(a.ang) * 4 - sh.y;
    a.state = 'shield';
    a.stuckAt = this.time;
    a.host = e;
    a.along = rx * sh.ax + ry * sh.ay;
    a.out = rx * -sh.ay + ry * sh.ax;
    a.rel = a.ang - Math.atan2(sh.ay, sh.ax);
    e.shieldArrows.push(a);
    if (e.shieldArrows.length > 10) {
      const old = e.shieldArrows.shift();
      const k = this.arrows.indexOf(old);
      if (k >= 0) this.arrows.splice(k, 1);
    }
    const hand = e.hand[1 - e.mainHand];
    hand.addVel(Math.sign(a.vx) * 90, 0, this.dt);
    e.conscious = Math.max(0, e.conscious - 0.05);
    // Heavy crossbow bolts punch partly through (otherwise a shield would make a bean tower-proof)
    if (a.pierce && a.damage > 0) {
      e.takeHit(this, { damage: a.damage * a.pierce, dvx: Math.sign(a.vx) * 30, dvy: 0, x, y, stun: 0.05, kind: 'block', from: a.from, spin: 0.2 });
    }
    this.stats.blocks++;
    this.emit('block', x, y, { kind: 'arrow', power: 0.35, dirX: -Math.sign(a.vx), dirY: -0.2, unit: e });
  }

  /** World transform of an arrow that's stuck in something (for drawing). */
  arrowPose(a) {
    const p = this.arrowPoseRaw(a);
    if (p && a.stuckAt != null) {
      // Twang: a stuck arrow quivers for a moment
      const t = this.time - a.stuckAt;
      if (t < 0.6) p.ang += Math.sin(t * 82) * 0.16 * Math.exp(-t * 7);
    }
    return p;
  }

  arrowPoseRaw(a) {
    if (a.state === 'tower') {
      // A fallen tower's arrows sink with the rubble while they fade
      const sink = a.host.downT > 0 ? Math.min(60, a.host.downT * 110) : 0;
      return { x: a.host.x + a.lx, y: a.ly + sink, ang: a.ang };
    }
    if (a.state === 'body') {
      const e = a.host;
      const p = a.seg === 0 ? e.hip : e.chest;
      const q = a.seg === 0 ? e.chest : e.head;
      const fr = segFrame(p, q);
      return {
        x: p.x + fr.ax * a.along * fr.len + fr.nx * a.perp,
        y: p.y + fr.ay * a.along * fr.len + fr.ny * a.perp,
        ang: fr.ang + a.rel,
      };
    }
    if (a.state === 'shield') {
      const sh = a.host.alive ? a.host.shieldFrame() : a.item ? itemShieldFrame(a.item) : null;
      if (!sh) return null;
      return {
        x: sh.x + sh.ax * a.along - sh.ay * a.out,
        y: sh.y + sh.ay * a.along + sh.ax * a.out,
        ang: Math.atan2(sh.ay, sh.ax) + a.rel,
      };
    }
    return { x: a.x, y: a.y, ang: a.ang };
  }

  // --- dropped weapons -----------------------------------------------------------

  dropWeapon(u) {
    const kind = u.type.weapon;
    const W = u.W;
    const mk = (x, y, vx, vy, m, r) => {
      const p = new Particle(x, y, m, r);
      p.setVel(vx, vy, this.dt);
      p.ground = u.ground;
      p.friction = 0.35;
      p.bounce = 0.3;
      return p;
    };
    const dt = this.dt;
    const h = u.hand[u.mainHand];
    if (u.tip) {
      const a = mk(h.x, h.y, h.vx(dt), h.vy(dt), 0.5, 2.5);
      const b = mk(u.tip.x, u.tip.y, u.tip.vx(dt), u.tip.vy(dt), W.tipMass, W.tipR);
      if (kind === 'pogo') a.bounce = b.bounce = 0.8; // boing... boing... boing
      this.items.push({ kind, team: u.team, a, b, con: new Dist(a, b, W.len), age: 0, scale: u.type.weaponScale || 1 });
      // Detach the weapon from the corpse
      u.parts.splice(u.parts.indexOf(u.tip), 1);
      u.cons.splice(u.cons.indexOf(u.tipCon), 1);
      u.tip = null;
      u.tipCon = null;
    }
    if (kind === 'bow') {
      const bh = u.hand[1];
      const ang = u.aimAng + Math.PI / 2;
      const half = W.half;
      const a = mk(bh.x - Math.cos(ang) * half, bh.y - Math.sin(ang) * half, bh.vx(dt) + 30, bh.vy(dt) - 60, 0.3, 2);
      const b = mk(bh.x + Math.cos(ang) * half, bh.y + Math.sin(ang) * half, bh.vx(dt) - 30, bh.vy(dt) - 60, 0.3, 2);
      this.items.push({ kind: 'bow', team: u.team, a, b, con: new Dist(a, b, half * 2), age: 0, side: u.f });
    }
    if (u.type.shield) {
      const sh = u.shieldFrameRaw();
      const sp = u.hand[1 - u.mainHand];
      const a = mk(sh.x - sh.ax * 15, sh.y - sh.ay * 15, sp.vx(dt), sp.vy(dt) - 40, 0.7, 4);
      const b = mk(sh.x + sh.ax * 15, sh.y + sh.ay * 15, sp.vx(dt) + u.f * 40, sp.vy(dt) - 80, 0.7, 4);
      const item = { kind: 'shield', team: u.team, a, b, con: new Dist(a, b, 30), age: 0, side: u.f };
      this.items.push(item);
      for (const ar of u.shieldArrows) ar.item = item;
    }
  }

  // --- hand of god -------------------------------------------------------------

  /** The unit under (x, y); `slack` = extra world px around the body. */
  unitAt(x, y, filter, slack = 10) {
    let best = null;
    let bd = Infinity;
    for (const u of this.units) {
      if (u.gone || (filter && !filter(u))) continue;
      for (const p of u.body) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < u.R + slack && d < bd) {
          bd = d;
          best = u;
        }
      }
    }
    return best;
  }

  grabAt(x, y, filter, slack = 10) {
    const u = this.unitAt(x, y, filter, slack);
    if (!u) return null;
    if (u.heldBy) this.letGo(u); // (the hand of god takes it out of a beak or a jelly)
    u.asleep = false;
    u.stillT = 0;
    // Grab whichever body part is closest (head = dangling by the head)
    let p = u.head;
    let bd = Infinity;
    for (const q of u.body) {
      const d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) {
        bd = d;
        p = q;
      }
    }
    this.grab = { unit: u, p, x, y, ox: p.x - x, oy: p.y - y };
    u.held = true;
    if (!(u.act && u.act.phase === 'fuse')) u.act = null; // a lit bomb stays lit: throw it!
    u.bowDraw = 0;
    u.mouth = 0.6;
    u.mouthKind = 'o';
    this.emit('grab', p.x, p.y, { unit: u });
    return u;
  }

  moveGrab(x, y) {
    if (!this.grab) return;
    this.grab.x = clamp(x + this.grab.ox * 0.3, -120, WORLD.width + 120);
    this.grab.y = Math.min(y + this.grab.oy * 0.3, this.grab.unit.ground - 24);
  }

  release() {
    const g = this.grab;
    if (!g) return null;
    g.unit.held = false;
    this.grab = null;
    // Cap the fling so the bean lands somewhere the camera can see
    for (const p of g.unit.parts) {
      const vx = p.vx(this.dt);
      const vy = p.vy(this.dt);
      const sp = Math.hypot(vx, vy);
      if (sp > 1100) p.setVel((vx / sp) * 1100, (vy / sp) * 1100, this.dt);
    }
    this.emit('drop', g.p.x, g.p.y, { unit: g.unit });
    return g.unit;
  }

  // --- end of battle -------------------------------------------------------------

  checkEnd() {
    const b = this.count('blue');
    const r = this.count('red');
    let winner = null;
    if (b === 0 && r === 0) winner = 'draw';
    else if (b === 0) winner = 'red';
    else if (r === 0) winner = 'blue';
    else if (this.battleTime > 150) {
      const hb = this.teamHp('blue');
      const hr = this.teamHp('red');
      const fb = hb.hp / hb.max;
      const fr = hr.hp / hr.max;
      winner = Math.abs(fb - fr) < 1e-6 ? 'draw' : fb > fr ? 'blue' : 'red';
    }
    if (!winner) return;
    this.phase = 'over';
    this.winner = winner;
    for (const u of this.units) if (u.alive && u.team === winner) u.state = 'cheer';
    this.emit('battleEnd', WORLD.width / 2, -100, { winner });
  }
}

function zoneClamp(team, x) {
  const [z0, z1] = WORLD.zone[team];
  return clamp(x, z0 + 12, z1 - 12);
}

/** A Pogo Bean on its hop (from the boing to the next touchdown, or above hop.overAlt): enemies don't push it, it hops over them. */
const hopsOver = (u) => !!u.type.hop && (u.hopping || u.alt > u.type.hop.overAlt);

/** Is a swooping at b (a Pelican's swoop: it flies into its catch)? */
const swoopsAt = (a, b) => !!a.act && a.act.victim === b;

/**
 * Can a holder (a Pelican beak, a Big Jelly) take e? Only a light bean
 * (mass <= maxMass) that is alive, standing on the ground (not high in the
 * air, not floating down or falling from a flipped umbrella, not a flier),
 * done deploying and not held already.
 */
export function liftable(e, maxMass) {
  return e.alive && !e.gone && !e.held && !e.holding && !e.air && !e.type.flying && !(e.floatT > 0) && !e.flipFall && e.deployT <= 0 && e.mass <= maxMass;
}

/** Move a bean's torso without changing its velocity; planted feet follow halfway. */
function moveTorso(u, dx, dy) {
  for (const p of u.body) p.teleport(dx, dy);
  for (const ft of u.feet) if (ft.plant) ft.x += dx * 0.5;
}

/**
 * Push two beans' body capsules (hip -> head) apart along the contact
 * normal, weighted toward the parts that touch. Returns the overlap depth.
 */
function capsulePush(a, b, rr, k) {
  segSeg(a.hip.x, a.hip.y, a.head.x, a.head.y, b.hip.x, b.hip.y, b.head.x, b.head.y, tmp);
  if (tmp.d2 >= rr * rr) return 0;
  const d = Math.sqrt(tmp.d2);
  let nx = tmp.x1 - tmp.x2;
  let ny = tmp.y1 - tmp.y2;
  if (d > 1e-4) {
    nx /= d;
    ny /= d;
  } else {
    nx = a.hip.x < b.hip.x ? -1 : 1;
    ny = 0;
  }
  const push = (rr - d) * k;
  const ma = b.mass / (a.mass + b.mass); // share a moves: the lighter bean gives way
  const mb = a.mass / (a.mass + b.mass);
  const s = tmp.s;
  const t = tmp.t;
  const wa = [Math.max(0.2, 1 - s), Math.max(0.2, 1 - Math.abs(s - 0.5) * 2), Math.max(0.2, s)];
  const wb = [Math.max(0.2, 1 - t), Math.max(0.2, 1 - Math.abs(t - 0.5) * 2), Math.max(0.2, t)];
  for (let i = 0; i < 3; i++) {
    a.body[i].teleport(nx * push * ma * wa[i], ny * push * ma * wa[i]);
    b.body[i].teleport(-nx * push * mb * wb[i], -ny * push * mb * wb[i]);
  }
  return rr - d;
}

/** A light item (a propeller cap) falling no faster than it.flutter px/s, swaying side to side as it goes. */
function flutter(it, dt) {
  const sway = Math.sin(it.age * 5) * 40; // px/s
  for (const p of [it.a, it.b]) {
    if (p.y - p.py > it.flutter * dt) p.py = p.y - it.flutter * dt;
    if (p.y >= p.ground - p.r - 1) continue;
    const vx = (p.x - p.px) / dt; // the air drags it toward the sway
    p.px = p.x - (vx + (sway - vx) * 0.05) * dt;
  }
}

function segFrame(p, q) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ax = dx / len;
  const ay = dy / len;
  return { ax, ay, nx: -ay, ny: ax, len, ang: Math.atan2(dy, dx) };
}

export function itemShieldFrame(it) {
  const dx = it.b.x - it.a.x;
  const dy = it.b.y - it.a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2, ax: dx / l, ay: dy / l, half: 15 };
}
