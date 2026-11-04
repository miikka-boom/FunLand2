// The battle: units, arrows, dropped weapons, phases and events.
// Pure simulation (no DOM), fixed timestep, seeded RNG -> it runs headless in
// tests and replays identically from the same placement.

import { WORLD, enemyOf } from '../config.js';
import { Particle, Dist, integrate, collideGround, clampGround, hingeLimit, segSeg, springTo } from './physics.js';
import { UNIT_TYPES, WEAPONS } from './unit-types.js';
import { Unit } from './unit.js';
import { Rng } from './rng.js';

export const DT = 1 / 120;
const ITER = 4;
const DRAG = 0.9995;
const G = WORLD.gravity;
const ARROW_LEN = 30;
const MAX_STUCK_GROUND = 160;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const tmp = { d2: 0, s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0 };

export class Battle {
  constructor(seed = 1) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.units = [];
    this.arrows = [];
    this.items = [];
    this.events = [];
    this.phase = 'place'; // place | battle | over
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

  addUnit(typeId, team, x, lane = null, seed = null) {
    const type = UNIT_TYPES[typeId];
    if (!type) return null;
    const ln = lane == null ? this.rng.next() : clamp(lane, 0, 1);
    const s = seed == null ? (this.rng.next() * 2 ** 31) | 0 : seed;
    const u = new Unit(type, team, x, ln, this.nextId++, s);
    u.placeSeed = s;
    const hats = this.hats[team] || {};
    const hat = hats[typeId] || hats.all;
    u.hat = hat && hat !== 'none' ? hat : null;
    this.units.push(u);
    // Keep the crowd drawn back-to-front
    this.units.sort((a, b) => a.lane - b.lane || a.id - b.id);
    return u;
  }

  removeUnit(u) {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
    if (this.grab && this.grab.unit === u) this.grab = null;
    this.arrows = this.arrows.filter((a) => a.host !== u);
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

    // Integrate + ground
    for (const u of units) {
      if (u.asleep) continue;
      for (const p of u.parts) {
        integrate(p, dt, G, DRAG);
        collideGround(p, dt);
      }
    }
    for (const it of this.items) {
      integrate(it.a, dt, G, DRAG);
      integrate(it.b, dt, G, DRAG);
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

    if (this.phase === 'battle' || this.phase === 'over') {
      for (const u of units) {
        if (!u.striking || !u.alive) continue;
        if (u.type.dash) this.resolveDash(u);
        else this.resolveMelee(u);
      }
    }
    this.updateArrows(dt);

    for (const u of units) u.post(dt, this);

    if (this.phase === 'battle') this.checkEnd();
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
    for (const u of this.units) if (u.alive) s.push(u);
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
    for (const u of this.units) if (!u.alive && !u.gone) d.push(u);
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
    const lo = -150;
    const hi = WORLD.width + 150;
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

  findTarget(u) {
    const foe = enemyOf(u.team);
    let best = null;
    let bestScore = Infinity;
    for (const e of this.units) {
      if (e.team !== foe || !e.alive) continue;
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

  /** Spiker pounce: its point against enemy shields and bodies. One hit per leap. */
  resolveDash(u) {
    const a = u.act;
    if (!a || a.done) return;
    const D = u.type.dash;
    const dt = this.dt;
    const tx = u.head.x + u.ux * u.R * 0.7;
    const ty = u.head.y + u.uy * u.R * 0.7;
    for (const e of this.units) {
      if (e.team === u.team || !e.alive) continue;
      if (Math.abs(e.hip.x - u.hip.x) > 100) continue;
      const sh = e.shieldFrame();
      if (sh && e.conscious > 0.4 && Math.sign(u.hip.x - e.hip.x) === e.f) {
        const pad = (u.R * 0.6 + 4) ** 2;
        if (segSeg(u.chest.x, u.chest.y, tx, ty, sh.x - sh.ax * sh.half, sh.y - sh.ay * sh.half, sh.x + sh.ax * sh.half, sh.y + sh.ay * sh.half, tmp).d2 < pad) {
          // BOING: bounced off the shield, seeing stars
          a.done = true;
          e.takeHit(this, { damage: 4, dvx: u.f * 70, dvy: -20, x: tmp.x2, y: tmp.y2, stun: 0.1, kind: 'block', from: u, spin: 0.2 });
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
      e.takeHit(this, { damage: D.damage * this.rng.range(0.9, 1.1), dvx: u.f * D.launch[0] * k, dvy: -D.launch[1] * k, x: hx, y: hy, stun: D.stun, kind: 'spike', from: u, spin: 0.4, flip: 140 });
      // The spiker rebounds off its victim
      for (const p of u.parts) p.setVel(-u.f * 120, -180, dt);
      this.stats.hits++;
      this.emit('hit', hx, hy, { kind: 'spike', power: 1.05, dirX: u.f * 0.8, dirY: -0.6, unit: e, from: u, killed: !e.alive });
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
        damage: Q.damage * k,
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
    const cx = u.head.x + ux * R * 0.95;
    const cy = u.head.y + uy * R * 0.95;
    const w = R * 1.5;
    const vx = u.head.vx(dt) + dvx * 0.4;
    const vy = u.head.vy(dt) + dvy * 0.4 - 220;
    const spin = (this.rng.next() - 0.5) * 500;
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

  /** Bomb goes off: launches everything around it (teammates get a share of the damage). */
  explode(u) {
    if (u.exploded) return;
    u.exploded = true;
    const X = u.type.blast;
    const dt = this.dt;
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
    this.arrows = this.arrows.filter((a) => a.host !== u);
    u.arrows.length = 0;
    this.emit('explode', cx, cy, { unit: u, power: 1, team: u.team });
    for (const e of this.units) {
      if (e === u || e.gone) continue;
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
      const friend = e.team === u.team;
      // Bombs right next to the blast light up, get flung, and go off where they land
      if (e.type.blast && e.alive && !e.exploded && d < X.radius * 0.5) {
        const left = e.act && e.act.phase === 'fuse' ? e.type.blast.fuse - e.act.t : Infinity;
        const delay = e.type.blast.chain;
        if (left > delay) e.act = { phase: 'fuse', t: e.type.blast.fuse - delay, hits: new Set(), done: false };
      }
      e.takeHit(this, {
        damage: X.damage * k * (friend ? X.friendly : 1) * (e.mass >= 3 ? X.vsGiant || 1 : 1),
        dvx: nx * sp,
        dvy: ny * sp,
        x: cx,
        y: cy,
        stun: 0.3 + 1.0 * k,
        kind: 'blast',
        from: u,
        spin: 0.5,
        flip: 120 * k * Math.sign(nx || 1),
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
  }

  /** Swept test of a swinging weapon against enemy shields and bodies. */
  resolveMelee(u) {
    if (!u.tip || !u.act) return;
    const W = WEAPONS[u.type.weapon];
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
      const dmg = A.damage * (0.55 + 0.45 * sf) * this.rng.range(0.9, 1.1);
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
      this.emit('hit', hx, hy, { kind: u.type.weapon === 'club' ? 'bonk' : 'slash', power, dirX: kx, dirY: ky, unit: e, from: u, killed: !e.alive });
      if (!A.cleave) return;
    }
  }

  blockHit(u, e, x, y, sf) {
    const A = u.type.attack;
    u.act.hits.add(e.id);
    u.act.done = true;
    const dmg = A.damage * (0.55 + 0.45 * sf) * (A.shieldPierce ?? 0.3);
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

  /** Ballistic launch toward a target's predicted chest. */
  solveAim(u, t) {
    const A = u.type.attack;
    if (t.type.shield) t.guardT = Math.max(t.guardT, 0.3); // "incoming!" -> shield up
    const bowX = u.chest.x;
    const bowY = u.chest.y;
    let tx = t.chest.x;
    let ty = t.chest.y;
    const tvx = t.alive ? clamp(t.hip.vx(this.dt), -200, 200) : 0;
    if (!u.act.elev) {
      const d0 = Math.abs(tx - bowX);
      u.act.elev = d0 < 170 ? 0.1 + (d0 / 170) * 0.25 : u.rng.range(0.45, 0.8);
    }
    let elev = u.act.elev;
    let speed = A.maxSpeed;
    let ang = 0;
    for (let iter = 0; iter < 3; iter++) {
      const dx = tx - bowX;
      const dist = Math.max(8, Math.abs(dx));
      const h = bowY - ty; // target height above the bow
      let e = elev;
      speed = A.maxSpeed;
      for (let k = 0; k < 12; k++) {
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
        if (e > 0.85) {
          e = 0.785;
          break;
        }
      }
      ang = dx >= 0 ? -e : Math.PI + e;
      const flight = dist / Math.max(60, speed * Math.cos(e));
      tx = t.chest.x + tvx * flight;
      ty = t.chest.y;
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
      damage: A.damage * u.rng.range(0.9, 1.1),
      state: 'fly',
      ground: WORLD.groundY + this.rng.next() * WORLD.laneDepth + 3,
      host: null,
      target: u.target,
      age: 0,
    });
    this.stats.arrows++;
    this.emit('bowRelease', bh.x, bh.y, { unit: u });
  }

  updateArrows(dt) {
    const foe = { blue: 'red', red: 'blue' };
    let groundStuck = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.age += dt;
      if (a.state === 'ground') {
        groundStuck++;
        if (groundStuck > MAX_STUCK_GROUND) a.fade = true;
        if (a.fade) {
          a.alpha = (a.alpha ?? 1) - dt * 1.5;
          if (a.alpha <= 0) this.arrows.splice(i, 1);
        }
        continue;
      }
      if (a.state !== 'fly') continue;
      if (a.target && a.target.alive && a.target.type.shield) a.target.guardT = Math.max(a.target.guardT, 0.25);
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
      stun: a.from ? a.from.type.attack.stun : 0.16,
      kind: 'arrow',
      from: a.from,
      spin: 3.2,
    });
    this.emit('hit', c.x1, c.y1, { kind: 'arrow', power: 0.4, dirX: a.vx / sp, dirY: a.vy / sp, unit: e, from: a.from, killed: !e.alive });
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
      const b = mk(u.tip.x, u.tip.y, u.tip.vx(dt), u.tip.vy(dt), WEAPONS[kind].tipMass, WEAPONS[kind].tipR);
      this.items.push({ kind, team: u.team, a, b, con: new Dist(a, b, WEAPONS[kind].len), age: 0 });
      // Detach the weapon from the corpse
      u.parts.splice(u.parts.indexOf(u.tip), 1);
      u.cons.splice(u.cons.indexOf(u.tipCon), 1);
      u.tip = null;
      u.tipCon = null;
    }
    if (kind === 'bow') {
      const bh = u.hand[1];
      const ang = u.aimAng + Math.PI / 2;
      const half = WEAPONS.bow.half;
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
