// One wobbly bean: a Verlet ragdoll with "muscles".
//
// The skeleton is a handful of particles joined by distance constraints. The
// muscles are spring-damper forces toward animated targets: hold the hips up,
// keep the head above the hips, plant the feet, put the hands and weapon where
// the current pose wants them. Every muscle is scaled by `conscious` (0..1):
// a hit knocks some of it out, so the bean wobbles, sags or flops over, then
// the muscles fade back in and it gets up again. Dead = conscious 0 forever.

import { WORLD } from '../config.js';
import { Particle, Dist, springTo } from './physics.js';
import { BODY, WEAPONS, AIR_MIN, BEAT, SHOVE, MAX_JBOMBS } from './unit-types.js';
import { levelMul } from './cards.js';
import { SPELLS } from './spells.js';
import { Rng } from './rng.js';

const G = WORLD.gravity;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

// Muscle gains (per unit mass). Slightly under-damped on purpose: wobble.
const SUP_K = 380; // hip height spring
const SUP_C = 16;
const UP_K = 540; // upright (head over hips)
const UP_C = 14;
const FOOT_K = 1500;
const FOOT_C = 58;
const HAND_K = 760;
const HAND_C = 34;
const TIP_K = 950;
const TIP_C = 30;
const DRIVE_K = 9;
const DRIVE_MAX = 1000;
const KNEE_PUSH = 900;
const BALANCE_K = 55; // hips drift back over the planted feet when standing still
const YELL_T = 0.55; // a dropped unit's battle cry, at the end of its deploy time
const BRACE_T = 0.4; // after a drop landing, for this long...
const BRACE_C = 2.4; // ...the hips are this much more damped
const LIFT_K = 260; // fliers: the propeller (or wings) hold the hips at their altitude, pushing and pulling
const LIFT_C = 14;
const HARD_LANDING = 320; // ground impact (px/s) that thuds, crashes a flier, or slams a dropped bean
const WRAP = SPELLS.bubbleWrap; // stunMul and bounce while wrapped

/** Two-bone IK: joint position for a limb from a to b, bending to `side`. */
function ik(ax, ay, bx, by, l1, l2, side) {
  let dx = bx - ax;
  let dy = by - ay;
  let d = Math.hypot(dx, dy) || 1e-6;
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) {
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  return [ax + ux * a - uy * h * side, ay + uy * a + ux * h * side];
}

function blendPose(a, b, k) {
  const off = typeof a.off === 'string' ? a.off : typeof b.off === 'string' ? b.off : [lerp(a.off[0], b.off[0], k), lerp(a.off[1], b.off[1], k)];
  return {
    main: [lerp(a.main[0], b.main[0], k), lerp(a.main[1], b.main[1], k)],
    off,
    ang: lerp(a.ang, b.ang, k),
    lean: lerp(a.lean, b.lean, k),
    crouch: lerp(a.crouch, b.crouch, k),
    wk: lerp(a.wk || 1, b.wk || 1, k),
    hk: lerp(a.hk || 1, b.hk || 1, k),
    shieldTilt: lerp(a.shieldTilt || 0, b.shieldTilt || 0, k),
  };
}

/** Can this kind of unit attack at all? (A Drummer never does; some new kinds attack only through their own mechanics.) */
const attacks = (type) => !!(type.attack || type.dash || type.blast);

/** A bean that flies, or floats down under an umbrella (low or high: a netter goes for it either way). */
export const isFlier = (u) => !!u && !u.isTower && (!!u.type.flying || u.floatT > 0);

/** A unit's weapon, scaled to its size (type.weaponScale: longer, heavier, bigger head). */
function weaponOf(type) {
  const W = WEAPONS[type.weapon];
  const k = type.weaponScale || 1;
  if (k === 1 || !W.len) return W;
  return { ...W, len: W.len * k, tipMass: W.tipMass * k * k, tipR: W.tipR * k, grip: W.grip * k };
}

export class Unit {
  constructor(type, team, x, lane, id, seed, level = 1) {
    this.type = type;
    this.team = team;
    this.id = id;
    this.rng = new Rng(seed);
    this.lane = lane; // 0..1, depth in the crowd
    this.ground = WORLD.groundY + lane * WORLD.laneDepth;
    this.f = team === 'blue' ? 1 : -1; // facing
    const size = this.rng.range(0.95, 1.06); // every bean is a little different
    this.R = type.radius * size;
    this.L = type.bodyLen * size;
    // Card level: +10% health and damage per level (every damage source reads dmgMul)
    this.level = Math.max(1, level | 0 || 1);
    this.dmgMul = levelMul(this.level);
    this.W = weaponOf(type);
    this.hp = type.hp * this.dmgMul;
    this.maxHp = this.hp;
    this.alive = true;
    this.conscious = 1;
    this.wake = 1;
    this.downT = 0;
    this.state = 'idle';
    this.time = this.rng.range(0, 10);
    this.voice = this.rng.next(); // voice pitch 0..1
    this.speed = type.speed * this.rng.range(0.9, 1.1);
    this.wantVx = 0;
    this.target = null;
    this.thinkT = this.rng.range(0, 0.2);
    this.cooldown = this.rng.range(0, 0.35);
    this.act = null;
    this.striking = false;
    this.held = false;
    this.walkTo = null;
    this.guardT = 0; // squire: shield raised against arrows
    this.wobbleT = 0; // near-fall: weak balance + windmilling arms
    this.charging = false;
    this.hopAt = -1; // battle-cry hop time (set by Battle.start)
    this.hopped = false;
    this.asleep = false; // resting corpse: skipped by the physics
    this.stillT = 0;
    this.preferRange = type.range ? this.rng.range(type.range[0], type.range[1]) : 0;

    // Face / feel state (read by the renderer)
    this.eyes = [
      { ox: 0, oy: 1, vx: 0, vy: 0 },
      { ox: 0, oy: 1, vx: 0, vy: 0 },
    ];
    this.lookX = x + this.f * 200;
    this.lookY = -40;
    this.blinkT = this.rng.range(1, 4);
    this.mouth = 0; // seconds of open mouth left
    this.mouthKind = 'o';
    this.brow = 0; // angry brows 0..1
    this.dizzy = 0;
    this.sq = 0; // squash (+) / stretch (-)
    this.sqv = 0;
    this.accY = 0;
    this.lastHipVy = 0;
    this.hvx0 = 0;
    this.hvy0 = 0;
    this.airT = 0;
    this.screamT = 0;
    this.landT = 0;
    this.hopT = this.rng.range(0.1, 0.8);
    this.bob = 0;
    this.waddle = 0;
    this.lastStep = 0;
    this.stepParity = 0;
    this.bowDraw = 0;
    this.nocked = type.weapon === 'bow';
    this.aimAng = this.f > 0 ? -0.5 : Math.PI + 0.5;
    this.arrows = []; // arrows stuck in the body
    this.shieldArrows = []; // arrows stuck in the shield
    this.hurtT = 0; // flashes white briefly when hit
    this.deadT = 0;
    this.lastHitBy = null;
    this.mass = type.mass || 1; // how hard it is to shove around (giants vs little ones)
    this.B = { ...BODY, ...(type.body || {}) }; // skeleton proportions for this shape and size
    this.fuseT = 0; // bomb: 0..1 once lit
    this.deathFuse = 0; // bomb killed before it went off: seconds until it does
    this.exploded = false;
    this.gone = false; // blown to bits: no body left to draw or simulate
    this.fade = 1; // arena: 1 -> 0 while the corpse fades out (draw alpha); removed at 0
    this.deployT = 0; // > 0 while a freshly dropped unit is not active yet
    this.dropping = false; // still falling from the sky after being played
    this.dropHop = false; // dropped units always get their battle-cry hop
    this.yellT = 0; // own battle-cry pose (dropped units yell after landing)
    this.braceT = 0;

    // Statuses from the newer cards (all off by default; the timers count down in post())
    this.shoveT = 0; // shoved recently: another shove now is much weaker (anti-lock)
    this.slipImmuneT = 0; // just got up from a banana peel: can't slip again yet
    this.liftOffT = 0; // a flier's lift is switched off (netted, anviled, soda'd)
    this.netImmuneT = 0; // just netted: a new net hit doesn't switch the lift off again
    this.beatT = 0; // on the Tummy Drummer's beat: tempo() and moveMul() speed up
    this.wrapHp = 0; // Bubble Wrap: damage it still absorbs...
    this.wrapMax = 0; // ...out of this much...
    this.wrapT = 0; // ...for this many more seconds
    this.squashT = 0; // anvil: drawn as a pancake
    this.floatT = 0; // > 0 while floating down under an umbrella (Brolly)
    this.flipped = false; // ...and its umbrella has gone inside out
    this.heldBy = null; // the unit holding this one (Pelican beak, inside a Big Jelly); `held` is set too
    this.holding = null; // the unit this one holds
    this.spawnOf = null; // id of the building that spawned it
    this.dropSlam = null; // { damage, stun } taken on the first hard landing after a Pelican drop
    this.altWant = null; // flier: altitude wanted right now (null = its cruise altitude)
    this.crashed = false; // flier: already crashed into the dirt since its lift was last on
    this.fumbleT = 0; // Bomb Juggler: no new knockdown fumble until this runs out
    this.flipFall = false; // Brolly: falling since its umbrella flipped, until it hits the ground
    // Pogo Bean: the hop think() wants (hopOn, hopVx, hopVy); hopCool runs down while the
    // stick is on the ground; hopping = from a boing to the next touchdown (enemies don't
    // push it), hopAir = its stick has left the ground since; hopLanded = the stick touched
    // down this step (peels read it); stomped = already stomped a head this hop
    this.hopping = false;
    this.hopOn = false;
    this.hopVx = 0;
    this.hopVy = 0;
    this.hopCool = 0;
    this.hopAir = false;
    this.hopLanded = false;
    this.stomped = false;
    this.beatClock = 0; // Tummy Drummer: seconds since its last beat...
    this.beats = 0; // ...and how many (the mallets alternate)
    this.scoopT = 0; // Pelican: the scoop cools down (s)
    this.engulfT = 0; // Big Jelly: seconds its catch has been inside...
    this.engulfTick = 0; // ...the next digestion tick...
    this.engulfCool = 0; // ...and the cooldown after a spit
    this.bumpT = 0; // Big Jelly: the next belly bump...
    this.bumpPoseT = 0; // ...and the bump pose still showing

    this.build(x);
  }

  build(x) {
    const R = this.R;
    const L = this.L;
    const f = this.f;
    const gY = this.ground;
    const B = this.B;
    this.legLen = B.thigh + B.shin;
    // A Pogo Bean stands on its stick: feet on the pegs, the stick's tip hop.stickBelow under them
    const hop = this.type.hop;
    this.standH = hop ? this.legLen * 0.7 + hop.stickBelow : this.legLen * B.standFrac;
    this.armLen = B.upperArm + B.foreArm;
    const cf = B.chestFrac;
    const hipY = gY - this.standH;
    this.parts = [];
    this.cons = [];
    const P = (px, py, m, r, fr = 0.12) => {
      const p = new Particle(px, py, m, r);
      p.ground = gY;
      p.friction = fr;
      this.parts.push(p);
      return p;
    };
    this.hip = P(x, hipY, 3, R * 0.95, 0.1);
    this.chest = P(x, hipY - L * cf, 2.5, R * 0.95, 0.1);
    this.head = P(x, hipY - L, 2, R * 0.95, 0.1);
    this.body = [this.hip, this.chest, this.head];
    for (const p of this.body) p.bounce = 0.32; // one comic bounce on a hard landing

    // Legs (0 = far side, 1 = near side). Near foot a touch forward.
    this.footOff = [-3, 4];
    this.knee = [];
    this.foot = [];
    this.feet = [];
    for (let i = 0; i < 2; i++) {
      const fx = x + this.footOff[i] * f;
      const fy = hop ? hipY + this.legLen * 0.7 : gY - 2;
      const [kx, ky] = ik(x, hipY, fx, fy, B.thigh, B.shin, -f);
      const knee = P(kx, ky, 0.5, 2, 0.3);
      const foot = P(fx, fy, 0.6, 2, 0.5);
      this.knee.push(knee);
      this.foot.push(foot);
      this.cons.push(new Dist(this.hip, knee, B.thigh), new Dist(knee, foot, B.shin));
      this.feet.push({ plant: true, air: false, x: fx, sx: fx, t: 0, dur: 0.18, h: 6 });
    }

    // Arms
    const W = this.W;
    this.mainHand = this.type.weapon === 'sword' ? 0 : 1; // sword in the far hand, shield in the near
    this.elbow = [];
    this.hand = [];
    const rest = this.type.poses.rest;
    for (let i = 0; i < 2; i++) {
      const loc = i === this.mainHand ? rest.main : Array.isArray(rest.off) ? rest.off : rest.main;
      const hx = x + loc[0] * f;
      const hy = this.chest.y - loc[1];
      const [ex, ey] = ik(x, this.chest.y, hx, hy, B.upperArm, B.foreArm, f);
      const elbow = P(ex, ey, 0.35, 2, 0.3);
      const hand = P(hx, hy, 0.45, 2.5, 0.3);
      this.elbow.push(elbow);
      this.hand.push(hand);
      this.cons.push(new Dist(this.chest, elbow, B.upperArm), new Dist(elbow, hand, B.foreArm));
    }

    // Weapon tip (club and sword are physical sticks so swings have momentum)
    this.tip = null;
    this.tipCon = null;
    if (W.len) {
      const h = this.hand[this.mainHand];
      const a = rest.ang * DEG;
      const tip = P(h.x + Math.cos(a) * f * W.len, h.y + Math.sin(a) * W.len, W.tipMass, W.tipR, 0.3);
      this.tip = tip;
      this.tipCon = new Dist(h, tip, W.len);
      this.cons.push(this.tipCon);
    }

    // Spine: rods between neighbours + a softer hip-head rod for jelly bending
    this.cons.push(
      new Dist(this.hip, this.chest, L * cf),
      new Dist(this.chest, this.head, L * (1 - cf)),
      new Dist(this.hip, this.head, L, this.type.spine ?? 0.22),
    );
    this.supportMass = this.parts.reduce((s, p) => s + p.mass, 0) - this.foot[0].mass - this.foot[1].mass;
    this.ux = 0;
    this.uy = -1;
    this.fwx = f;
    this.fwy = 0;
  }

  get x() {
    return this.hip.x;
  }

  get busy() {
    return !!this.act;
  }

  /** Height of the hips above where they stand (px; about 0 standing, > 0 in the air). */
  get alt() {
    return this.ground - this.standH - this.hip.y;
  }

  /** High in the air: only sources that hit air can target or hit it. */
  get air() {
    return this.alive && !this.held && (!!this.type.flying || this.floatT > 0) && this.alt > AIR_MIN;
  }

  /** Attack tempo (x1, or faster on the Drummer's beat): multiplies animation and cooldown time. */
  tempo() {
    return this.beatT > 0 ? BEAT.tempo : 1;
  }

  /** Walking speed multiplier (x1, or faster on the Drummer's beat). */
  moveMul() {
    return this.beatT > 0 ? BEAT.move : 1;
  }

  /** Where a unit this one holds hangs: the tip of a Pelican's beak, else the chest (a Big Jelly's middle). */
  holdPoint() {
    if (this.type.scoop) return [this.head.x + this.fwx * this.R, this.head.y + this.fwy * this.R];
    return [this.chest.x, this.chest.y];
  }

  /** A flier with its lift on: alive, awake and not switched off (netted, anviled, diving). */
  lifting() {
    return !!this.type.flying && this.alive && this.liftOffT <= 0 && this.downT <= 0;
  }

  /** Switch a flier's lift off for t seconds (net, anvil, soda). It never stacks beyond the largest. */
  liftOff(b, t, from = null) {
    if (!this.type.flying) return;
    this.liftOffT = Math.max(this.liftOffT, t);
    b.emit('liftOff', this.hip.x, this.hip.y, { unit: this, from });
  }

  // ---------------------------------------------------------------------------
  // AI: pick a target, walk to it, attack. Runs ~7 times a second.

  think(b) {
    this.charging = false;
    if (!this.alive) return;
    const speed = this.speed * this.moveMul(); // (faster on a Drummer's beat)
    if (b.phase !== 'battle' || this.held) {
      this.wantVx = 0;
      // Placement: dropped outside our zone? Waddle back in.
      if (b.phase === 'place' && !this.held && this.groundF > 0.8) {
        const [z0, z1] = WORLD.zone[this.team];
        if (this.hip.x < z0 || this.hip.x > z1) this.walkTo = clamp(this.hip.x, z0 + 12, z1 - 12);
      }
      if (b.phase === 'place' && !this.held && this.walkTo != null && this.downT <= 0) {
        const dx = this.walkTo - this.hip.x;
        if (Math.abs(dx) > 5) {
          this.wantVx = Math.sign(dx) * speed * 1.25;
          this.f = Math.sign(dx);
        } else {
          this.walkTo = null;
          this.f = this.team === 'blue' ? 1 : -1;
        }
      }
      if (b.phase === 'over' && b.winner === this.team) this.state = 'cheer';
      return;
    }
    if (this.deployT > 0 || this.flipFall) {
      this.wantVx = 0; // just dropped in (or still falling out of the sky): land, look around, battle cry
      this.state = 'idle';
      return;
    }
    if (this.downT > 0 || this.conscious < 0.3) {
      this.wantVx = 0;
      this.hopOn = false;
      return;
    }
    if (b.battleTime < this.hopAt + 0.12) {
      this.wantVx = 0; // battle cry first
      return;
    }
    if (this.type.flying && !this.lifting()) {
      this.wantVx = 0; // in its own dive, or netted into the dirt: nothing to do until the lift is back
      return;
    }
    if (this.type.follow) {
      this.follow(b, speed);
      return;
    }
    if (this.type.scoop && (this.act ? this.act.scoop : this.scoopT <= 0 && this.thinkScoop(b, speed))) return;
    const t = b.findTarget(this);
    this.target = t;
    this.charging = false;
    if (!t) {
      this.wantVx = 0;
      this.hopOn = false;
      return;
    }
    // A tower is a wall: distances are to its near face (engage/reach were tuned
    // against a 13 px bean's surface, hence the -13)
    let dx;
    let grow;
    if (t.isTower) {
      dx = t.x + (this.hip.x < t.x ? -t.w : t.w) / 2 - this.hip.x;
      grow = -13;
      this.lookX = t.x;
      this.lookY = -t.h * 0.6;
    } else {
      dx = t.hip.x - this.hip.x;
      grow = t.R - 13;
      this.lookX = t.head.x;
      this.lookY = t.head.y;
    }
    const dist = Math.abs(dx);
    if (!this.act && dx !== 0) this.f = dx > 0 ? 1 : -1;
    const toward = dx > 0 ? 1 : -1;
    if (this.type.hop) this.thinkHop(dist, toward, t.isTower ? 0 : t.R);
    else if (this.type.ranged) {
      // Shooting a tower: come within its reach (a tower that can't shoot back would fall to one unanswered card)
      const range = t.isTower && t.kind !== 'building' ? Math.min(this.preferRange, t.range - t.w / 2 - 25) : this.preferRange;
      this.wantVx = dist > range ? toward * speed : 0;
      // (a Bomb Juggler waits while enough of its bombs are still in the air)
      if (dist <= range + 40 && !this.act && this.cooldown <= 0 && (!this.type.attack.toss || b.bombsInFlight(this) < MAX_JBOMBS)) this.startAttack(b);
    } else {
      // Against a flier a netter walks right in under it
      const air = this.type.engageAir && isFlier(t);
      const engage = ((air ? this.type.engageAir : this.type.engage) ?? 40) + grow;
      const reach = ((air ? this.type.reachAir : this.type.reach) ?? 50) + grow;
      // Walk in to duel distance, plant the feet while swinging, step back if crowded.
      // Squires turtle under a raised shield; clubbers break into a yelling charge.
      let spd = this.guardT > 0 ? speed * 0.65 : speed;
      if (this.type.charge && dist < 240 && dist > engage + 10) {
        spd *= 1.45;
        this.charging = true;
        this.mouth = Math.max(this.mouth, 0.2);
        this.mouthKind = 'o';
      }
      if (this.type.spread && !this.act && b.bombAhead(this, toward)) spd = 0; // let the one in front go first
      if (this.act && this.act.phase === 'fuse') this.wantVx = toward * speed * 1.35; // lit: charge in screaming
      else if (this.act) this.wantVx = 0;
      else if (dist > engage) this.wantVx = toward * spd;
      else if (dist < engage - 14) this.wantVx = -toward * speed * 0.45;
      else this.wantVx = 0;
      if (dist <= reach && !this.act && attacks(this.type) && (this.cooldown <= 0 || this.type.blast) && this.groundF > 0.6) this.startAttack(b);
    }
    if (this.dizzy > 0) this.wantVx += Math.sin(this.time * 6) * 35; // staggering about
    this.state = this.wantVx || this.hopOn ? 'move' : 'idle';
  }

  /**
   * Tummy Drummer: it never attacks. It walks follow.behind px behind the own
   * unit furthest forward (not another follower, not held), or, alone,
   * follow.home px behind its own Guard Tower (its Castle once that falls).
   */
  follow(b, speed) {
    const F = this.type.follow;
    const dir = this.team === 'blue' ? 1 : -1;
    let lead = null;
    for (const o of b.units) {
      if (o === this || o.team !== this.team || !o.alive || o.held || o.type.follow) continue;
      if (!lead || o.hip.x * dir > lead.hip.x * dir) lead = o;
    }
    let goal;
    if (lead) goal = lead.hip.x - dir * F.behind;
    else {
      let home = null;
      for (const t of b.towers) {
        if (t.team !== this.team || !t.alive || t.kind === 'building') continue;
        if (!home || t.kind === 'guard') home = t;
      }
      goal = home ? home.x - dir * F.home : this.hip.x;
    }
    this.target = null;
    const dx = goal - this.hip.x;
    if (Math.abs(dx) > 12) {
      this.wantVx = Math.sign(dx) * speed;
      this.f = Math.sign(dx);
    } else {
      this.wantVx = 0;
      this.f = dir;
    }
    this.lookX = this.hip.x + this.f * 200;
    this.lookY = -40;
    if (this.dizzy > 0) this.wantVx += Math.sin(this.time * 6) * 35;
    this.state = this.wantVx ? 'move' : 'idle';
  }

  /**
   * Pelican, scoop ready: fly at the best liftable enemy (Battle.scoopTarget)
   * and swoop on it from within `reach` along x. A bean behind an enemy tower
   * or building is swooped on only once the Pelican is over it (a swoop from
   * this side would hit the wall). Returns false when there is nothing to
   * scoop (then it pecks like any diver).
   */
  thinkScoop(b, speed) {
    const v = b.scoopTarget(this);
    if (!v) return false;
    this.target = v;
    const dx = v.hip.x - this.hip.x;
    this.f = dx >= 0 ? 1 : -1;
    this.lookX = v.head.x;
    this.lookY = v.head.y;
    if (Math.abs(dx) > this.type.reach || b.towerBetween(v.team, this.hip.x, v.hip.x)) {
      this.wantVx = this.f * speed;
      this.state = 'move';
      return true;
    }
    this.act = { phase: 'swoop', t: 0, scoop: true, victim: v, hits: new Set(), done: false, alt0: this.alt, x0: 0, goal: 0, dmg: 0 };
    this.brow = 1;
    this.mouth = Math.max(this.mouth, 0.3);
    this.mouthKind = 'o';
    b.emit('swoop', this.hip.x, this.hip.y, { unit: this, victim: v });
    return true;
  }

  /**
   * Pogo Bean: it never walks, it hops (Unit.hop, at each touchdown). Far off
   * it hops at its target at full speed; close to it (a structure's face, a
   * bean's surface) it hops in place, edging in to bonking reach.
   */
  thinkHop(dist, toward, tR) {
    const H = this.type.hop;
    const gap = dist - tR;
    const near = gap < H.bonk.reach + 20;
    this.wantVx = 0;
    this.hopOn = true;
    this.hopVy = near ? H.wallVy : H.vy;
    this.hopVx = near ? toward * clamp((gap - this.R - 2) * 4, 0, H.vx) : toward * H.vx;
  }

  startAttack(b) {
    const T = this.type;
    const toss = T.ranged && T.attack.toss;
    if (T.ranged && !toss) this.nocked = true; // a new draw always has an arrow on the string
    // The netter scoops fliers (variant 1) and swats beans (variant 0); the squire mixes stab and slash
    const variant = T.attack && T.attack.air ? (isFlier(this.target) ? 1 : 0) : T.poses.windup2 ? (this.rng.chance(0.45) ? 1 : 0) : 0;
    const phase = T.ranged ? 'draw' : T.blast ? 'fuse' : 'windup';
    this.act = { phase, t: 0, variant, hits: new Set(), done: false, aim: null, quaked: false };
    this.brow = 1;
    if (toss) this.mouth = Math.max(this.mouth, 0.2);
    else if (T.ranged) b.emit('bowDraw', this.hip.x, this.hip.y, { unit: this });
    else if (T.blast) {
      b.emit('fuse', this.head.x, this.head.y, { unit: this });
      this.mouth = 1;
      this.mouthKind = 'o';
    } else {
      b.emit('grunt', this.hip.x, this.hip.y, { unit: this });
      this.mouth = Math.max(this.mouth, 0.25);
      this.mouthKind = 'o';
    }
  }

  // ---------------------------------------------------------------------------
  // Per-substep control: animation -> pose -> muscle forces.

  control(dt, b) {
    const hip = this.hip;
    const head = this.head;
    this.time += dt;
    if (this.cooldown > 0) this.cooldown -= dt * this.tempo();
    if (this.scoopT > 0) this.scoopT -= dt * this.tempo();

    if (this.alive) {
      if (this.downT > 0) {
        this.downT -= dt;
        this.wake = 0;
        if (this.downT <= 0) {
          this.dizzy = 1.8;
          b.emit('dizzy', this.head.x, this.head.y - this.R, { unit: this });
          if (this.type.hop) this.hopCool = Math.max(this.hopCool, this.type.hop.remount); // climbing back on the stick
        }
      } else {
        this.wake = this.held ? 0.3 : 1;
      }
      const rate = this.conscious < this.wake ? (this.dizzy > 0 ? 1.3 : 2.2) : 7;
      this.conscious += (this.wake - this.conscious) * Math.min(1, rate * dt);
    } else if (this.conscious > 0) {
      this.conscious = this.conscious < 0.01 ? 0 : this.conscious * Math.exp(-dt * 4); // last wobble, then limp
    }
    if (this.wobbleT > 0) this.wobbleT -= dt;
    // Battle-cry hop at the start of the fight
    if (this.alive && !this.hopped && this.hopAt >= 0 && b.phase === 'battle' && b.battleTime >= this.hopAt) {
      this.hopped = true;
      // (a bean that just dropped in may still be rising out of its landing squat: hop anyway)
      if (this.groundF > (this.dropHop ? 0.3 : 0.8)) for (const p of this.parts) p.addVel(0, -this.rng.range(200, 290), dt);
      this.mouth = Math.max(this.mouth, 0.6);
    }
    const m = this.conscious;

    // Body frame
    let ux = head.x - hip.x;
    let uy = head.y - hip.y;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul;
    uy /= ul;
    const f = this.f;
    this.ux = ux;
    this.uy = uy;
    this.fwx = -uy * f;
    this.fwy = ux * f;

    const hipVx = hip.vx(dt);
    const hipVy = hip.vy(dt);
    const height = this.ground - hip.y;
    // A flier with its lift on stands on the air (it walks, turns and attacks up there);
    // a Pogo stands on its stick's tip
    const gF = this.lifting() ? 1 : this.type.hop ? clamp((5 - (height - this.standH)) / 5, 0, 1) : clamp((this.legLen + 6 - height) / 12, 0, 1);
    this.groundF = gF;

    let pose = this.animate(dt, b);
    if (this.guardT > 0 && this.type.shield && (!this.act || this.act.phase === 'windup')) {
      pose = { ...pose, off: [9, 15], crouch: pose.crouch + 2, lean: pose.lean + 0.06 };
    }
    if (this.floatT > 0) this.floatDrag(dt, hipVx, hipVy);
    if (this.type.hop) this.hop(dt, b, gF, hipVx, hipVy);
    if (this.type.engulf && this.alive) this.jelly(dt, b);
    if (m < 0.01) return;

    if (this.type.flying) this.lift(hipVy, m);
    else if (!this.flipFall) {
      // Hold the hips up (legs can only push, never pull: launches stay launches)
      // Breathing while standing around
      const breath = !this.wantVx && !this.act ? Math.sin(this.time * 2.3) * 0.9 : 0;
      const targetH = this.standH - pose.crouch + this.bob + breath;
      // Just landed from a drop: the knees soak it up (more damping), one soft wobble instead of a trampoline
      const supC = this.braceT > 0 ? SUP_C * BRACE_C : SUP_C;
      let fy = this.supportMass * (SUP_K * (this.ground - targetH - hip.y) - supC * hipVy - G);
      if (fy > 0) fy = 0;
      const cap = this.supportMass * G * 5;
      if (fy < -cap) fy = -cap;
      hip.fy += fy * m * gF;
    }

    // Keep the head over the hips at the pose's lean (an internal torque pair)
    const lean = pose.lean + this.waddle + clamp((hipVx * f) / 90, -1, 1) * 0.1 + (this.charging ? 0.22 : 0) + (this.dizzy > 0 ? Math.sin(this.time * 7) * 0.12 * Math.min(1, this.dizzy) : 0);
    const sx = Math.sin(lean) * f;
    const sy = -Math.cos(lean);
    const bal = this.wobbleT > 0 ? m * 0.35 : m; // near-fall: balance gives way for a moment
    this.uprightPull(this.head, this.L, sx, sy, bal, dt);
    this.uprightPull(this.chest, this.L * this.B.chestFrac, sx, sy, bal, dt);

    // Lit bomb: shaking with panic
    if (this.act && this.act.phase === 'fuse') {
      const shake = (0.2 + this.fuseT) * 500;
      hip.fx += Math.sin(this.time * 70) * shake * hip.mass;
      this.head.fx -= Math.sin(this.time * 70) * shake * this.head.mass;
    }

    // Walk
    const pouncing = this.act && this.act.phase === 'dash';
    if (gF > 0 && !pouncing) {
      let ax = DRIVE_K * (this.wantVx - hipVx);
      const striking = this.act && this.act.phase === 'strike' && !this.type.ranged;
      if (striking) ax = 30 * (f * 150 - hipVx); // step into the blow, don't get kicked back by it
      else if (!this.wantVx && this.feet[0].plant && this.feet[1].plant) {
        const mid = (this.feet[0].x + this.feet[1].x) / 2 - f * 0.5;
        ax += BALANCE_K * (mid - hip.x);
      }
      ax = clamp(ax, -DRIVE_MAX, DRIVE_MAX);
      const F = this.supportMass * ax * m * gF;
      hip.fx += F * 0.7;
      this.chest.fx += F * 0.3;
    }

    this.legs(dt, b, m, gF, hipVx);
    this.arms(dt, pose, m);

    // Celebrate: little hops
    if (this.state === 'cheer' && gF > 0.8 && m > 0.8) {
      this.hopT -= dt;
      if (this.hopT <= 0) {
        this.hopT = this.rng.range(0.55, 1.25);
        const v = -this.rng.range(260, 380);
        for (const p of this.parts) p.addVel(0, v, dt);
        this.mouth = 0.5;
        this.mouthKind = 'smile';
        if (this.rng.chance(0.45)) b.emit('cheer', hip.x, hip.y, { unit: this });
      }
    }
  }

  /**
   * A flier's lift instead of legs: a spring that pushes and pulls the hips
   * toward the wanted altitude, with a lazy bob. It sags with consciousness (a
   * stunned flier drops), and is off while liftOffT runs and once it's dead.
   */
  lift(hipVy, m) {
    if (this.liftOffT > 0 || !this.alive) return;
    const F = this.type.flying;
    const want = this.altWant ?? F.alt;
    const ty = this.ground - this.standH - want + Math.sin(this.time * 2.2) * F.bob;
    const c = this.act && this.act.scoop ? LIFT_C * 2 : LIFT_C; // (a Pelican holds steady in a swoop and a carry: no bouncing into the dirt)
    let fy = this.supportMass * (LIFT_K * (ty - this.hip.y) - c * hipVy - G);
    fy = clamp(fy, -4 * G * this.supportMass, 1.5 * G * this.supportMass);
    this.hip.fy += fy * m;
  }

  /** Floating down under an umbrella (Brolly): the canopy caps the fall at float.vMax and sways it side to side. */
  floatDrag(dt, hipVx, hipVy) {
    const F = this.type.float;
    if (hipVy > F.vMax) for (const p of this.parts) p.addVel(0, -(hipVy - F.vMax) * 0.5, dt);
    const sway = F.sway * Math.sin(1.7 * this.time);
    this.hip.fx += this.supportMass * 4 * (sway - hipVx);
  }

  /**
   * Pogo Bean, each substep: notice the stick touching down (hopLanded; a
   * bonk if it's at a structure's face), rest on it for hop.rest s, then boing
   * off again (think() says where: hopVx, hopVy). It only hops while awake
   * and in the fight; after a knockdown it climbs back on first (hop.remount).
   */
  hop(dt, b, gF, hipVx, hipVy) {
    const H = this.type.hop;
    this.hopLanded = false;
    if (gF < 0.3) this.hopAir = true;
    if (gF <= 0.8) return;
    const able = this.alive && !this.held && this.downT <= 0 && this.conscious > 0.6 && b.phase === 'battle';
    if (this.hopAir) {
      this.hopAir = false;
      this.hopping = false;
      this.hopLanded = true;
      if (able && b.towers.length) b.bonk(this);
    }
    if (this.hopCool > 0) {
      this.hopCool -= dt;
      return;
    }
    if (!able || !this.hopOn) return;
    const vx = this.hopVx * this.moveMul();
    for (const p of this.parts) p.addVel(vx - hipVx, -this.hopVy - hipVy, dt);
    this.hopCool = H.rest / this.tempo();
    this.hopping = true;
    this.stomped = false;
    this.sqv -= 5; // stretch up off the spring
    b.emit('boing', this.tip ? this.tip.x : this.hip.x, this.ground, { unit: this });
  }

  /**
   * Big Jelly, each substep. Its catch is digested (dps every tick) and spat
   * out after engulf.hold s; with nothing inside and the cooldown over it
   * engulfs a liftable enemy that comes within engulf.gap of it. The belly
   * bump runs on its own timer. A Drummer's beat speeds all of it up.
   */
  jelly(dt, b) {
    const E = this.type.engulf;
    const k = dt * this.tempo();
    if (this.engulfCool > 0) this.engulfCool -= k;
    if (this.bumpT > 0) this.bumpT -= k;
    if (this.bumpPoseT > 0) this.bumpPoseT -= dt;
    const awake = b.phase === 'battle' && this.deployT <= 0 && this.downT <= 0 && this.conscious > 0.5;
    const v = this.holding;
    if (v) {
      this.engulfT += k;
      this.engulfTick -= k;
      if (this.engulfTick <= 0) {
        this.engulfTick += E.tick;
        v.takeHit(b, { damage: E.dps * E.tick * this.dmgMul, dvx: 0, dvy: 0, x: v.chest.x, y: v.chest.y, stun: 0, kind: 'engulf', from: this, spin: 0 });
      }
      if (this.holding === v && this.engulfT >= E.hold) this.spit(b);
    } else if (awake && this.engulfCool <= 0) {
      const e = b.engulfTarget(this);
      if (e) {
        b.hold(this, e);
        this.engulfT = 0;
        this.engulfTick = E.tick;
        this.sqv += 6; // BLOOP
        b.emit('engulf', e.chest.x, e.chest.y, { unit: this, victim: e });
      }
    }
    if (awake && this.bumpT <= 0 && b.jellyBump(this)) {
      this.bumpT = this.type.bump.every;
      this.bumpPoseT = 0.25;
    }
  }

  /** PTOO: the Jelly spits its catch out, flying (a shove: anti-lock applies), and cools down. */
  spit(b) {
    const E = this.type.engulf;
    const v = this.holding;
    b.letGo(v);
    v.takeHit(b, { damage: 0, dvx: this.f * E.spit[0], dvy: -E.spit[1], x: v.chest.x, y: v.chest.y, stun: E.spitStun, kind: 'spit', from: this, spin: 0.6, shove: true });
    b.emit('spit', v.chest.x, v.chest.y, { unit: this, victim: v });
    this.engulfCool = E.cooldown;
    this.bumpT = Math.max(this.bumpT, this.type.bump.every); // (no belly bump on top of the spit)
    this.sqv -= 6;
  }

  /** Hand muscle: spring toward a target, reaction on the chest (arms can't push the body around). */
  muscle(p, tx, ty, k, c, dt, m) {
    if (m <= 0) return;
    const ch = this.chest;
    const rvx = (p.x - p.px - (ch.x - ch.px)) / dt;
    const rvy = (p.y - p.py - (ch.y - ch.py)) / dt;
    const Fx = p.mass * (k * (tx - p.x) - c * rvx) * m;
    const Fy = p.mass * (k * (ty - p.y) - c * rvy) * m;
    p.fx += Fx;
    p.fy += Fy;
    ch.fx -= Fx;
    ch.fy -= Fy;
  }

  uprightPull(p, len, sx, sy, m, dt) {
    const base = this.hip;
    const tx = base.x + sx * len;
    const ty = base.y + sy * len;
    const rvx = (p.x - p.px - (base.x - base.px)) / dt;
    const rvy = (p.y - p.py - (base.y - base.py)) / dt;
    const Fx = p.mass * (UP_K * (tx - p.x) - UP_C * rvx) * m;
    const Fy = p.mass * (UP_K * (ty - p.y) - UP_C * rvy) * m;
    p.fx += Fx;
    p.fy += Fy;
    base.fx -= Fx;
    base.fy -= Fy;
  }

  legs(dt, b, m, gF, hipVx) {
    const f = this.f;
    const hip = this.hip;
    const speed = Math.abs(hipVx);
    const flier = !!this.type.flying; // fliers never plant a foot: their legs paddle lazily
    const pegs = !!this.type.hop && this.alive; // a Pogo's feet ride on the stick's pegs
    const walking = !flier && !pegs && gF > 0.35 && m > 0.3;
    this.bob = 0;
    this.waddle = 0;
    if (pegs || (this.floatT > 0 && this.alive)) {
      // A Pogo's feet ride on the stick's pegs; a floater's dangle under it. The hips carry
      // them (the reaction goes into the hips, damped relative to them), so the legs neither
      // drag a hop down nor push the body along through the air.
      const hvy = hip.vy(dt);
      for (let i = 0; i < 2; i++) {
        this.feet[i].air = true;
        this.feet[i].plant = false;
        const p = this.foot[i];
        const fx = p.fx;
        const fy = p.fy;
        const tx = hip.x + (pegs ? (i ? 3 : -3) : this.footOff[i]) * f;
        const ty = hip.y + this.legLen * (pegs ? 0.7 : 0.88);
        springTo(p, tx, ty, pegs ? 900 : 600, pegs ? 40 : 30, dt, Math.max(m, 0.15), hipVx, hvy);
        hip.fx -= p.fx - fx;
        hip.fy -= p.fy - fy;
      }
    } else if (walking) {
      const stepDur = clamp(10.5 / Math.max(speed, 1), 0.12, 0.2);
      const lead = clamp(hipVx * stepDur, -15, 15);
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i];
        if (ft.air) {
          ft.air = false;
          ft.plant = true;
          ft.x = clamp(this.foot[i].x, hip.x - 14, hip.x + 14);
        }
        if (!ft.plant) {
          ft.t += dt / ft.dur;
          if (ft.t >= 1) {
            ft.plant = true;
            ft.x = hip.x + this.footOff[i] * f + lead * 1.5;
            this.lastStep = this.time;
            b.emit('step', ft.x, this.ground, { unit: this, power: clamp(speed / 120, 0.1, 1) });
          }
        }
      }
      // Start a step with the foot that's furthest from home (one foot at a time)
      if (this.feet[0].plant && this.feet[1].plant && this.time - this.lastStep > stepDur * 0.35) {
        const trig = speed > 12 ? 5 : 7;
        let best = -1;
        let bestErr = trig;
        for (let i = 0; i < 2; i++) {
          const home = hip.x + this.footOff[i] * f + lead;
          let err = Math.abs(this.feet[i].x - home);
          if (i === this.stepParity) err *= 1.15; // alternate feet
          if (err > bestErr) {
            bestErr = err;
            best = i;
          }
        }
        if (best >= 0) {
          const ft = this.feet[best];
          ft.plant = false;
          ft.sx = ft.x;
          ft.t = 0;
          ft.dur = stepDur;
          ft.h = 4 + Math.min(6, speed * 0.06);
          this.stepParity = 1 - best;
        }
      }
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i];
        const p = this.foot[i];
        let tx;
        let ty;
        if (ft.plant) {
          // Dragged by a push? Re-plant where it is instead of skating back
          if (Math.abs(p.x - ft.x) > 4) ft.x = p.x - Math.sign(p.x - ft.x) * 4;
          tx = ft.x;
          ty = this.ground - p.r;
        } else {
          const s = ft.t;
          const dest = hip.x + this.footOff[i] * f + lead * 1.5;
          tx = lerp(ft.sx, dest, easeInOut(s));
          ty = this.ground - p.r - Math.sin(Math.PI * s) * ft.h;
          this.bob += Math.sin(Math.PI * s) * 2.4;
          this.waddle += Math.sin(Math.PI * s) * (i === 0 ? 0.06 : -0.06);
        }
        springTo(p, tx, ty, FOOT_K, FOOT_C, dt, m * gF);
      }
    } else if (this.dropping && !flier) {
      // Dropped in from the sky: feet straight down under the hips, braced for the landing.
      // Damped relative to the hips, so the legs don't act like a sail and push the bean sideways.
      const hvy = hip.vy(dt);
      for (let i = 0; i < 2; i++) {
        this.feet[i].air = true;
        this.feet[i].plant = false;
        springTo(this.foot[i], hip.x + this.footOff[i] * f, hip.y + this.legLen * 0.88, 600, 30, dt, m, hipVx, hvy);
      }
    } else {
      // Airborne (or nearly out): cartoon running in the air (a flier at half the rate)
      const ph = this.time * (flier ? 8.5 : 17);
      for (let i = 0; i < 2; i++) {
        this.feet[i].air = true;
        this.feet[i].plant = false;
        const a = ph + i * Math.PI;
        const tx = hip.x + f * Math.cos(a) * 9;
        const ty = hip.y + this.legLen * 0.72 + Math.sin(a) * 6;
        springTo(this.foot[i], tx, ty, 300, 16, dt, m * 0.8);
      }
    }
    // Knees bend forward (internal: the hip takes the reaction, so it can't propel us)
    for (let i = 0; i < 2; i++) {
      const F = f * KNEE_PUSH * this.knee[i].mass * Math.max(m, 0.2);
      this.knee[i].fx += F;
      hip.fx -= F;
    }
  }

  /** Local pose point (fx forward, uy up, relative to the chest) -> world. */
  toWorld(fx, uy) {
    const c = this.chest;
    return [c.x + this.fwx * fx + this.ux * uy, c.y + this.fwy * fx + this.uy * uy];
  }

  /** Direction of a weapon angle (degrees, body frame) in world space. */
  weaponDir(angDeg) {
    const a = angDeg * DEG;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [this.fwx * c - this.ux * s, this.fwy * c - this.uy * s];
  }

  arms(dt, pose, m) {
    const mi = this.mainHand;
    const oi = 1 - mi;
    const hand = this.hand[mi];
    const off = this.hand[oi];
    const hk = pose.hk || 1;
    // (a floater holds its umbrella up, a Pogo its handlebar, unless it's knocked silly)
    const steady = this.floatT > 0 || (!!this.type.hop && this.downT <= 0 && this.conscious > 0.6);
    const flail = (this.groundF < 0.2 || this.wobbleT > 0) && this.alive && !steady ? 1 : 0;
    const walkSwing = this.groundF > 0.8 ? Math.sin(this.time * 11) * clamp(Math.abs(this.hip.vx(dt)) / 60, 0, 1) * 3.5 : 0;

    let mx;
    let my;
    if (pose.mainWorld) [mx, my] = pose.mainWorld;
    else [mx, my] = this.toWorld(pose.main[0] + walkSwing, pose.main[1]);
    if (flail) {
      // Windmill when flying
      const a = this.time * 14;
      mx += Math.cos(a) * 7;
      my += Math.sin(a) * 7 - 8;
    }
    this.muscle(hand, mx, my, HAND_K * hk, HAND_C * Math.sqrt(hk), dt, m);

    const W = this.W;
    if (this.tip) {
      // During the strike the body is braced: most of the swing's kick goes into the ground
      const rk = this.act && this.act.phase === 'strike' ? 0.2 : 1;
      const [dx, dy] = this.weaponDir(pose.ang);
      const tx = hand.x + dx * W.len;
      const ty = hand.y + dy * W.len;
      const tip = this.tip;
      const wk = pose.wk || 1;
      const rvx = (tip.x - tip.px - (hand.x - hand.px)) / dt;
      const rvy = (tip.y - tip.py - (hand.y - hand.py)) / dt;
      const Fx = tip.mass * (TIP_K * wk * (tx - tip.x) - TIP_C * Math.sqrt(wk) * rvx) * m;
      const Fy = tip.mass * (TIP_K * wk * (ty - tip.y) - TIP_C * Math.sqrt(wk) * rvy) * m;
      tip.fx += Fx;
      tip.fy += Fy;
      hand.fx -= Fx * 0.3 * rk;
      hand.fy -= Fy * 0.3 * rk;
      this.chest.fx -= Fx * 0.7 * rk;
      this.chest.fy -= Fy * 0.7 * rk;
    }

    let ox;
    let oy;
    if (pose.offWorld) [ox, oy] = pose.offWorld;
    else if (pose.off === 'shaft' && this.tip) {
      const dx = this.tip.x - hand.x;
      const dy = this.tip.y - hand.y;
      const l = Math.hypot(dx, dy) || 1;
      ox = hand.x + (dx / l) * W.grip;
      oy = hand.y + (dy / l) * W.grip;
    } else if (Array.isArray(pose.off)) [ox, oy] = this.toWorld(pose.off[0] - walkSwing * (this.type.shield ? 0.3 : 1), pose.off[1]);
    else [ox, oy] = this.toWorld(pose.main[0] - 4, pose.main[1] - 2);
    if (flail) {
      const a = this.time * 14 + 2.4;
      ox += Math.cos(a) * 8;
      oy += Math.sin(a) * 8 - 8;
    }
    this.muscle(off, ox, oy, HAND_K * (pose.off === 'shaft' ? 1.6 : 1), HAND_C, dt, m);

    // Elbows hang out a little
    for (let i = 0; i < 2; i++) {
      const F = 300 * this.elbow[i].mass * m;
      this.elbow[i].fy += F;
      this.chest.fy -= F;
    }
  }

  // ---------------------------------------------------------------------------
  // Animation state machine. Returns the pose to steer toward this substep.

  animate(dt, b) {
    const P = this.type.poses;
    this.striking = false;
    // A flier cruises at its own altitude: whatever wants it higher or lower (a dive's climb) says so every substep
    if (this.type.flying) this.altWant = null;
    if (!this.alive) return P.rest;
    if (this.floatT > 0 && P.float) return P.float; // umbrella up
    if (this.state === 'cheer' && !this.act) return P.cheer;
    if ((b.yellT > 0 || this.yellT > 0) && !this.act && this.alive) {
      // Battle cry: brandish the weapon
      const k = b.yellT > 0 ? Math.sin(clamp(b.yellT / 0.9, 0, 1) * Math.PI) : Math.sin(clamp(this.yellT / YELL_T, 0, 1) * Math.PI);
      return blendPose(P.rest, P.cheer, k * 0.8);
    }
    const a = this.act;
    if (!a) return this.idlePose(P);
    if (a.phase === 'fuse') {
      a.t += dt;
      return this.animateFuse(dt, b, a); // a lit fuse burns whatever happens
    }
    if (this.downT > 0 || this.conscious < 0.2) {
      if (a.scoop) this.cutScoop();
      this.act = null;
      this.bowDraw = 0;
      return P.rest;
    }
    // On a Drummer's beat everything goes faster, except a dash's flight and a
    // melee strike (and fuses, above): a heavy weapon needs its whole strike to
    // reach the target, so a faster sweep would whiff
    a.t += a.phase === 'dash' || a.phase === 'strike' ? dt : dt * this.tempo();
    if (a.scoop) return this.animateScoop(dt, b, a);
    if (this.type.ranged) return this.type.attack.toss ? this.animateToss(dt, b, a) : this.animateBow(dt, b, a);
    if (this.type.dash) return this.animateDash(dt, b, a);

    const A = this.type.attack;
    const wind = a.variant ? P.windup2 : P.windup;
    const strike = a.variant ? P.strike2 : P.strike;
    if (a.phase === 'windup') {
      const hold = A.hold || 0;
      if (a.t >= A.windup && a.t < A.windup + hold) {
        // Trembling at the top: the "here it comes" beat
        return { ...wind, ang: wind.ang + Math.sin(a.t * 113) * 3, crouch: wind.crouch + 1 };
      }
      if (a.t >= A.windup + hold) {
        a.phase = 'strike';
        a.t = 0;
        // Lunge into the swing
        const lunge = this.type.weapon === 'club' ? 180 : 90;
        this.hip.addVel(this.f * lunge, 0, dt);
        this.chest.addVel(this.f * lunge, 0, dt);
        b.emit('whoosh', this.hip.x, this.hip.y, { unit: this, power: this.type.weapon === 'club' ? 1 : 0.6 });
        this.mouth = Math.max(this.mouth, 0.3);
        return wind; // the strike sweeps from here next substep (no one-frame pop)
      }
      return blendPose(P.rest, wind, easeOut(a.t / A.windup));
    }
    if (a.phase === 'strike') {
      this.striking = !a.done && a.t > A.strike * 0.15;
      if (A.quake && !a.quaked && this.tip && (this.tip.y >= this.ground - 16 || a.t >= A.strike * 0.95)) {
        a.quaked = true;
        b.quake(this, this.tip.x);
      }
      if (a.t >= A.strike) {
        a.phase = 'recover';
        a.t = 0;
        return strike;
      }
      // Sweep the target along the arc (over the top), fast at the end
      const k = clamp(a.t / (A.strike * 0.75), 0, 1);
      return blendPose(wind, strike, k * k);
    }
    // recover
    this.striking = !a.done && a.t < 0.07;
    if (a.t >= A.recover) {
      this.act = null;
      this.cooldown = A.cooldown * this.rng.range(0.8, 1.4);
      this.brow = 0;
      return P.rest;
    }
    const k = a.t / A.recover;
    if (P.recover && !a.variant) return k < 0.5 ? blendPose(strike, P.recover, easeOut(k * 2)) : blendPose(P.recover, P.rest, easeInOut(k * 2 - 1));
    return blendPose(strike, P.rest, easeInOut(k));
  }

  /**
   * The pose with nothing to do: a Drummer drums (the mallets swap on each
   * beat), a Pelican flaps (3 Hz), a Big Jelly shows its bump for a moment.
   */
  idlePose(P) {
    if (this.type.beat && this.deployT <= 0) return this.beats % 2 ? P.beatA : P.beatB;
    if (this.bumpPoseT > 0 && P.bump) return P.bump;
    if (P.flap && this.lifting()) return blendPose(P.rest, P.flap, 0.5 + 0.5 * Math.sin(this.time * 6 * Math.PI));
    return P.rest;
  }

  /**
   * Pelican's scoop (act.scoop). 'swoop': down to swoopAlt and at the victim,
   * beak first; the beak on its chest grabs it (battle.hold, a pinch, scoop),
   * or after `swoop` s it gives up. 'carry': up to carryAlt and carryBack px
   * home (for at most carryMax s), then it drops it from up there (pelicanDrop,
   * and the victim's dropSlam). 'recover': back up to cruise.
   */
  animateScoop(dt, b, a) {
    const P = this.type.poses;
    const S = this.type.scoop;
    const speed = this.speed * this.moveMul();
    if (a.phase === 'swoop') {
      const v = a.victim;
      if (!v.alive || v.gone || (v.held && v.heldBy !== this) || v.air) return this.endScoop(a, S.cooldown * 0.5);
      // Down to swoopAlt (the beak scoops from under the chest: a little higher for a tall bean
      // like a Pogo on its stick), gliding over the first half of the swoop
      const [bx, by] = this.holdPoint();
      const low = Math.max(S.swoopAlt, this.alt + by - v.chest.y - S.beak * 0.5);
      this.altWant = lerp(a.alt0, low, easeInOut(clamp(a.t / (S.swoop * 0.5), 0, 1)));
      const dx = v.chest.x + clamp(v.hip.vx(dt), -150, 150) * 0.1 - bx;
      this.f = v.hip.x >= this.hip.x ? 1 : -1;
      this.wantVx = clamp(dx * 6, -speed * 2.5, speed * 2.5);
      if (Math.hypot(v.chest.x - bx, v.chest.y - by) <= S.beak) this.scoop(b, a, v);
      else if (a.t >= S.swoop) return this.endScoop(a, S.cooldown * 0.5);
      return blendPose(P.rest, P.dash, 0.6 * easeOut(clamp(a.t / 0.25, 0, 1)));
    }
    if (a.phase === 'carry') {
      if (!this.holding) return this.endScoop(a, S.cooldown); // shaken loose (a sneeze, a big hit, its catch died)
      this.altWant = lerp(a.alt0, S.carryAlt, easeInOut(clamp(a.t / 0.7, 0, 1)));
      const home = this.team === 'blue' ? -1 : 1;
      const left = (a.goal - this.hip.x) * home;
      this.f = home;
      this.wantVx = left > 6 ? home * speed : 0;
      if ((left <= 6 && a.t > 0.6) || a.t >= S.carryMax) {
        const v = this.holding;
        b.letGo(v, this.f * 60, 40);
        v.dropSlam = { damage: S.dropDamage * this.dmgMul, stun: S.dropStun };
        b.emit('pelicanDrop', v.chest.x, v.chest.y, { unit: this, victim: v });
        return this.endScoop(a, S.cooldown);
      }
      return blendPose(P.rest, P.flap, 0.5 + 0.5 * Math.sin(this.time * 6 * Math.PI));
    }
    // recover: back up to cruise height
    this.wantVx = 0;
    if (a.t >= 0.5) {
      this.act = null;
      this.brow = 0;
    }
    return P.rest;
  }

  /** The beak closes on v: it's held (a Bomb lights, a Juggler fumbles), pinched, and the carry starts. */
  scoop(b, a, v) {
    const S = this.type.scoop;
    b.hold(this, v);
    b.emit('scoop', v.chest.x, v.chest.y, { unit: this, victim: v });
    v.takeHit(b, { damage: S.pinch * this.dmgMul, dvx: 0, dvy: -60, x: v.chest.x, y: v.chest.y, stun: 0, kind: 'pinch', from: this, spin: 0 });
    a.phase = 'carry';
    a.t = 0;
    a.alt0 = this.alt;
    a.x0 = this.hip.x;
    a.goal = b.carryGoal(this, this.hip.x);
    a.dmg = 0;
    this.f = this.team === 'blue' ? -1 : 1;
    this.mouth = 0;
  }

  /** A Pelican knocked out of its scoop (a knockdown, a stunning hit): it cools down as after a miss, or a drop if it had a catch. */
  cutScoop() {
    const a = this.act;
    if (a.phase === 'recover') return; // (already over: its cooldown started when it ended)
    this.endScoop(a, a.phase === 'swoop' ? this.type.scoop.cooldown * 0.5 : this.type.scoop.cooldown);
  }

  /** The scoop is over (dropped, missed or shaken loose): climb back up, the scoop cools down. */
  endScoop(a, cool) {
    a.phase = 'recover';
    a.t = 0;
    a.victim = null;
    this.wantVx = 0;
    this.scoopT = Math.max(this.scoopT, cool);
    return this.type.poses.rest;
  }

  /**
   * Spiker: rear back, then leap point-first at the target. A flier's dive
   * (dash.kind 'dive') climbs a little instead, then cuts its lift and shoots
   * head-first at the target's head; the lift comes back on to recover.
   */
  animateDash(dt, b, a) {
    const P = this.type.poses;
    const D = this.type.dash;
    const dive = D.kind === 'dive' && !!this.type.flying;
    if (a.phase === 'windup') {
      if (dive) this.altWant = this.type.flying.alt + D.climb * easeOut(Math.min(1, a.t / D.windup));
      if (a.t >= D.windup) {
        a.phase = 'dash';
        a.t = 0;
        if (dive) this.dive(b, D, dt);
        else {
          for (const p of this.parts) p.addVel(this.f * D.speed, -(D.up ?? 0), dt);
          b.emit('whoosh', this.hip.x, this.hip.y, { unit: this, power: 0.9 });
        }
        this.mouth = 0.6;
        this.mouthKind = 'o';
        return P.dash;
      }
      return blendPose(P.rest, P.windup, easeOut(a.t / D.windup));
    }
    if (a.phase === 'dash') {
      this.striking = !a.done;
      if (a.t >= D.time || (a.t > 0.15 && this.groundF > 0.8) || a.done) {
        // The propeller catches it again (unless a net or an anvil has switched it off for longer meanwhile)
        if (dive && this.liftOffT <= D.time - a.t + 1e-6) this.liftOffT = 0;
        a.phase = 'recover';
        a.t = 0;
      }
      return P.dash;
    }
    this.striking = false;
    if (a.t >= D.recover) {
      this.act = null;
      this.cooldown = D.cooldown * this.rng.range(0.8, 1.3);
      this.brow = 0;
      return P.rest;
    }
    return blendPose(P.dash, P.rest, easeInOut(a.t / D.recover));
  }

  /**
   * The dive starts: lift off for the dive's time, and every part shoots at
   * the target's head (a tower's face at mid-height), aimed a little high
   * because gravity pulls it down on the way.
   */
  dive(b, D, dt) {
    const t = this.target;
    let tx;
    let ty;
    if (t && t.isTower && t.alive) {
      tx = t.x + ((this.hip.x < t.x ? -t.w : t.w) / 2);
      ty = -t.h / 2;
    } else if (t && !t.isTower && t.alive) {
      // Lead a walking target a little: where its head will be when the dive gets there
      const eta = Math.hypot(t.head.x - this.head.x, t.head.y - this.head.y) / D.speed;
      tx = t.head.x + clamp(t.hip.vx(dt), -150, 150) * eta;
      ty = t.head.y;
    } else {
      tx = this.head.x + this.f * 60; // its target is gone: dive at the dirt ahead
      ty = this.ground;
    }
    const dx = tx - this.head.x;
    const d = Math.hypot(dx, ty - this.head.y) || 1;
    const dy = ty - this.head.y - 0.5 * G * (d / D.speed) ** 2;
    const l = Math.hypot(dx, dy) || 1;
    this.liftOffT = Math.max(this.liftOffT, D.time);
    for (const p of this.parts) p.setVel((dx / l) * D.speed, (dy / l) * D.speed, dt);
    b.emit('dive', this.hip.x, this.hip.y, { unit: this });
  }

  /** Bomb: the fuse fizzes, the bomb panics, then BOOM. */
  animateFuse(dt, b, a) {
    const X = this.type.blast;
    this.fuseT = clamp(a.t / X.fuse, 0, 1);
    this.mouth = 1;
    this.brow = 0;
    if (a.t >= X.fuse && !this.exploded) b.explode(this);
    return this.type.poses.fuse;
  }

  animateBow(dt, b, a) {
    const P = this.type.poses;
    const A = this.type.attack;
    const t = this.target;
    const c = this.chest;
    if (a.phase === 'draw') {
      if (!t || !t.alive) {
        this.act = null;
        this.bowDraw = 0;
        return P.rest;
      }
      // Re-aim every substep: the bow arm tracks the solution
      const sol = b.solveAim(this, t);
      a.aim = sol;
      this.aimAng = sol.ang;
      const k = easeOut(clamp(a.t / A.draw, 0, 1));
      this.bowDraw = k;
      const dx = Math.cos(sol.ang);
      const dy = Math.sin(sol.ang);
      const reach = this.armLen * 0.92;
      const bowX = c.x + dx * reach;
      const bowY = c.y + dy * reach;
      const pull = lerp(reach * 0.75, -4, k);
      const lean = clamp(-(Math.abs(dy) * 0.25), -0.25, 0) - 0.05 * k;
      if (a.t >= A.draw) {
        if (A.toss) b.fireBomb(this, sol);
        else b.fireArrow(this, sol);
        this.nocked = false;
        a.phase = 'recover';
        a.t = 0;
        this.bowDraw = 0;
        // String hand flies back, bow kicks
        this.hand[0].addVel(-dx * 260, -dy * 260 - 60, dt);
        this.hand[1].addVel(-dx * 60, -40, dt);
        this.mouth = Math.max(this.mouth, 0.15);
      }
      return {
        main: P.rest.main,
        mainWorld: [bowX, bowY],
        offWorld: [c.x + dx * pull, c.y + dy * pull],
        off: P.rest.off,
        ang: -90,
        lean,
        crouch: 1.5 * k,
        wk: 1,
        hk: 1.4,
      };
    }
    // recover
    if (a.t > A.recover * 0.5) this.nocked = true;
    if (a.t >= A.recover) {
      this.act = null;
      this.cooldown = A.cooldown * this.rng.range(0.8, 1.6);
      this.brow = 0;
      return P.rest;
    }
    const dx = Math.cos(this.aimAng);
    const dy = Math.sin(this.aimAng);
    const k = easeInOut(a.t / A.recover);
    const reach = this.armLen * 0.92;
    const [rx, ry] = this.toWorld(P.rest.main[0], P.rest.main[1]);
    return {
      main: P.rest.main,
      mainWorld: [lerp(c.x + dx * reach, rx, k), lerp(c.y + dy * reach, ry, k)],
      off: P.rest.off,
      ang: -90,
      lean: lerp(-0.08, P.rest.lean, k),
      crouch: 0,
      wk: 1,
      hk: 1,
    };
  }

  /**
   * Bomb Juggler: the bow's timing with an underarm lob. The throwing arm
   * goes back while it aims (draw), the bomb flies at the end of the draw
   * (battle.fireBomb), then the arm comes back up to juggle (recover).
   */
  animateToss(dt, b, a) {
    const P = this.type.poses;
    const A = this.type.attack;
    const t = this.target;
    if (a.phase === 'draw') {
      if (!t || !t.alive) {
        this.act = null;
        return P.rest;
      }
      const sol = b.solveAim(this, t);
      a.aim = sol;
      this.aimAng = sol.ang;
      if (a.t >= A.draw) {
        b.fireBomb(this, sol);
        a.phase = 'recover';
        a.t = 0;
        // The throwing hand flicks forward and up
        this.hand[this.mainHand].addVel(Math.cos(sol.ang) * 240, Math.sin(sol.ang) * 240 - 80, dt);
        this.mouth = Math.max(this.mouth, 0.2);
        return P.toss;
      }
      return blendPose(P.rest, P.toss, easeOut(clamp(a.t / A.draw, 0, 1)));
    }
    if (a.t >= A.recover) {
      this.act = null;
      this.cooldown = A.cooldown * this.rng.range(0.8, 1.6);
      this.brow = 0;
      return P.rest;
    }
    return blendPose(P.toss, P.rest, easeInOut(a.t / A.recover));
  }

  // ---------------------------------------------------------------------------
  // Getting hit

  /**
   * hit: { damage, dvx, dvy, x, y, stun, kind, from, spin, flip, shove }
   * dvx/dvy is the launch velocity (px/s) given to the whole body; the struck
   * part gets extra so the bean spins. shove: a push from a shoving card
   * (a second one soon after is much weaker, see SHOVE).
   */
  takeHit(b, hit) {
    if (hit.shove) hit = this.shoved(hit);
    const heft = this.type.heft || 1; // heavy beans slide less, and fly a bit lower (but still fly)
    this.knock(hit.dvx * heft, hit.dvy * (this.type.heftUp || 1), hit.x, hit.y, hit.spin == null ? 0.7 : hit.spin, b.dt, hit.flip || 0, hit.from ? hit.from.f : 0);
    this.sqv += 6 * Math.min(1.5, Math.hypot(hit.dvx, hit.dvy) / 300);
    if (!this.alive) return;
    // Bubble Wrap soaks the damage first and cushions the stun (the knock still lands: wrapped beans fly)
    const wrapped = this.wrapHp > 0;
    const soft = wrapped ? WRAP.stunMul : 1;
    const damage = wrapped ? this.soak(b, hit.damage) : hit.damage;
    this.hp -= damage;
    this.hurtT = 0.1;
    // Big hits knock the hat off
    if (this.hat && (Math.hypot(hit.dvx, hit.dvy) > 320 || this.hp <= 0 || hit.stun >= 0.8)) b.popHat(this, hit.dvx, hit.dvy);
    this.lastHitBy = hit.from || null;
    const stun = hit.stun * (this.type.poise || 1) * soft;
    this.conscious = Math.max(0, this.conscious - stun);
    if (this.floatT > 0 && hit.damage > 0) this.flip(b); // the umbrella goes inside out
    if (this.holding && this.type.scoop && this.hp > 0) this.shaken(b, damage, stun);
    if (this.hp <= 0) {
      this.die(b, hit);
      return;
    }
    // Full-speed club bonks floor even armoured beans; poise only saves them from weak ones.
    // A hit that floors (a peel's slip, the Anvil) ignores poise: only Bubble Wrap cushions it
    const downStun = hit.kind === 'club' ? hit.stun * Math.min(1, (this.type.poise || 1) + 0.12) * soft : hit.floor ? hit.stun * soft : stun;
    const lit = this.act && this.act.phase === 'fuse'; // nothing puts out a lit fuse
    if (downStun >= 0.85 || this.conscious < 0.12) {
      this.downT = this.rng.range(0.75, 1.25);
      if (!lit) {
        if (this.act && this.act.scoop) this.cutScoop();
        this.act = null;
      }
      this.bowDraw = 0;
      this.mouth = 0.8;
      this.mouthKind = 'o';
      b.emit('knockdown', this.head.x, this.head.y, { unit: this });
      if (this.type.fumble) b.fumble(this); // uh-oh: a juggled bomb lands on its toes
    } else {
      if (stun >= 0.5 && this.act && this.act.phase !== 'recover' && !lit) {
        if (this.act.scoop) this.cutScoop();
        this.act = null; // interrupted
        this.bowDraw = 0;
        this.cooldown = Math.max(this.cooldown, 0.25);
      }
      if (stun >= 0.25) this.wobbleT = 0.45; // whoa-whoa-whoa
    }
    if (damage >= 12) {
      this.mouth = Math.max(this.mouth, 0.35);
      this.mouthKind = 'o';
      b.emit('hitVoice', this.head.x, this.head.y, { unit: this, power: damage / 40 });
    }
  }

  /** A hit on a floating Brolly turns its umbrella inside out: it falls freely, and lands hard (post). */
  flip(b) {
    this.floatT = 0;
    this.flipped = true;
    this.flipFall = true;
    this.deployT = 0; // (it takes fall damage, and towers keep shooting)
    this.mouth = 1;
    this.mouthKind = 'o';
    b.emit('canopyFlip', this.hip.x, this.hip.y - this.L, { unit: this });
  }

  /**
   * A Pelican hit while it holds a bean lets go: at once on a stunning hit
   * (scoop.letGoStun), or once a carry has taken scoop.letGoDamage in all.
   */
  shaken(b, damage, stun) {
    const S = this.type.scoop;
    const a = this.act;
    if (a && a.scoop) a.dmg += damage;
    if (stun >= S.letGoStun) b.letGoOf(this, 'stun');
    else if (a && a.scoop && a.dmg >= S.letGoDamage) b.letGoOf(this, 'damage');
  }

  /** Anti-lock: a shove that lands while the last one is still fresh keeps only a little of its push and stun. */
  shoved(hit) {
    const again = this.shoveT > 0;
    this.shoveT = SHOVE.time;
    if (!again) return hit;
    return { ...hit, dvx: hit.dvx * SHOVE.knock, dvy: hit.dvy * SHOVE.knock, stun: hit.stun * SHOVE.stun };
  }

  /** Bubble Wrap absorbs what it can of a hit (pop-pop-pop). Returns the damage that gets through. */
  soak(b, damage) {
    const a = Math.min(this.wrapHp, damage);
    if (!(a > 0)) return damage;
    this.wrapHp -= a;
    b.emit('wrapPop', this.chest.x, this.chest.y, { unit: this, left: this.wrapHp });
    return damage - a;
  }

  /** Bubble Wrap ends (time up, popped, or its bean died): the body stops bouncing like a ball. */
  unwrap(b) {
    const popped = this.wrapHp <= 0;
    this.wrapHp = 0;
    this.wrapT = 0;
    for (const p of this.body) p.bounce = this.alive ? 0.32 : 0.4;
    b.emit('wrapEnd', this.chest.x, this.chest.y, { unit: this, popped });
  }

  /**
   * Banana peel underfoot: the feet shoot forward and up, the head goes back,
   * a beat flat in mid-air, WHUMP (a knockdown). A heavy bean only skids.
   * Either way it can't slip again until it's up and SPELLS.bananaPeels.immune
   * s have passed. peel: the peel item (its dmgMul is the caster's card level).
   */
  slip(b, peel) {
    if (!this.alive) return;
    const P = SPELLS.bananaPeels;
    const dir = this.f;
    const dt = b.dt;
    if (this.mass >= P.heavyMass) {
      this.hip.addVel(dir * P.skid, 0, dt);
      this.wobbleT = Math.max(this.wobbleT, P.skidWobble);
      this.slipImmuneT = P.immune;
      b.emit('skid', this.hip.x, this.ground, { unit: this });
      return;
    }
    for (let i = 0; i < 2; i++) {
      this.foot[i].addVel(dir * P.feet, -220, dt);
      this.knee[i].addVel(dir * P.feet, -220, dt);
    }
    this.head.addVel(-dir * P.head, -60, dt);
    this.chest.addVel(-dir * P.head, -60, dt);
    this.hip.addVel(dir * 60, -P.hipUp, dt);
    b.emit('slip', this.hip.x, this.ground, { unit: this });
    const dmg = P.damage * ((peel && peel.dmgMul) || 1);
    this.takeHit(b, { damage: dmg, dvx: 0, dvy: 0, x: this.hip.x, y: this.ground, stun: 1.0, kind: 'slip', from: null, spin: 0, floor: true });
    // (downT counts down at the same rate: immune from now until 1.5 s after it gets up)
    this.slipImmuneT = Math.max(0, this.downT) + P.immune;
  }

  knock(dvx, dvy, x, y, spin, dt, flip = 0, dir = 0) {
    this.asleep = false;
    this.stillT = 0;
    for (const p of this.parts) p.addVel(dvx * 0.85, dvy * 0.85, dt);
    if (flip && dir) {
      // Head forward, feet back: a cartwheel
      this.head.addVel(dir * flip, 0, dt);
      this.hip.addVel(-dir * flip * 0.6, 0, dt);
    }
    // Extra on the body particle nearest the hit -> spin
    let best = this.hip;
    let bd = Infinity;
    for (const p of this.body) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    best.addVel(dvx * spin, dvy * spin, dt);
  }

  die(b, hit) {
    this.alive = false;
    this.hp = 0;
    this.conscious = Math.min(this.conscious, 0.3); // fades out in control(): a last wobble
    for (const p of this.body) p.bounce = 0.4;
    this.wake = 0;
    this.act = null;
    this.striking = false;
    this.state = 'dead';
    this.wantVx = 0;
    this.bowDraw = 0;
    this.mouth = 1.2;
    this.mouthKind = 'o';
    this.brow = 0;
    this.dizzy = 0;
    b.dropWeapon(this);
    // A bomb that dies still goes off: its fuse burns while it flies
    if (this.type.blast && !this.exploded) this.deathFuse = this.type.blast.chain;
    b.emit('death', this.head.x, this.head.y, { unit: this, power: hit ? Math.hypot(hit.dvx, hit.dvy) / 400 : 0.5 });
    if (this.wrapT > 0) this.unwrap(b);
    this.floatT = 0; // (the umbrella falls with it)
    this.flipFall = false;
    this.hopOn = false;
    if (this.holding) b.letGoOf(this, 'death');
    if (this.heldBy) {
      // Died in a beak or inside a jelly: dropped (a jelly pops the body out)
      const h = this.heldBy;
      const out = h.type.engulf ? 1 : 0;
      b.letGoOf(h, 'death', h.f * 160 * out, -220 * out);
    }
    if (this.type.beat) b.dropDrum(this); // the drum rolls away ringing
    if (this.type.id === 'copter') b.popCap(this); // the lift dies with it; the cap flutters down on its own
    if (this.type.fumble) b.fumble(this, true); // all its juggled bombs come down around it
  }

  // ---------------------------------------------------------------------------
  // After the physics step: googly eyes, squash, landings, timers.

  post(dt, b) {
    const hip = this.hip;
    const head = this.head;

    // Squash & stretch follows the felt vertical acceleration of the hips
    const vy = hip.vy(dt);
    const ay = (vy - this.lastHipVy) / dt;
    this.lastHipVy = vy;
    this.accY += (ay - this.accY) * Math.min(1, dt * 25);
    let target = clamp((-this.accY / G) * 0.045, -0.09, 0.22);
    if (this.groundF < 0.1) {
      // Flying fast: stretch into a sausage
      const sp = Math.hypot(hip.vx(dt), vy);
      target -= clamp((sp - 350) / 1600, 0, 0.17);
    }
    this.sqv += ((target - this.sq) * 420 - this.sqv * 11) * dt;
    this.sq = clamp(this.sq + this.sqv * dt, -0.2, 0.28);

    // Googly pupils: gravity minus head acceleration, plus a look-at pull
    const hvx = head.vx(dt);
    const hvy = head.vy(dt);
    const hax = clamp((hvx - this.hvx0) / dt, -9000, 9000);
    const hay = clamp((hvy - this.hvy0) / dt, -9000, 9000);
    this.hvx0 = hvx;
    this.hvy0 = hvy;
    const er = this.R * 0.42;
    const maxOff = er * 0.5 - 0.2;
    let lx = 0;
    let ly = 0;
    let lk = 0;
    if (this.alive && this.conscious > 0.4 && this.dizzy <= 0) {
      const dx = this.lookX - head.x;
      const dy = this.lookY - head.y;
      const d = Math.hypot(dx, dy) || 1;
      lx = dx / d;
      ly = dy / d;
      lk = 340;
    }
    for (let i = 0; i < 2; i++) {
      const e = this.eyes[i];
      let ex = -hax * 0.22 - e.vx * 3;
      let ey = G * 0.42 - hay * 0.22 - e.vy * 3;
      if (lk) {
        ex += lk * (lx * maxOff - e.ox);
        ey += lk * (ly * maxOff - e.oy);
      } else if (this.dizzy > 0) {
        // Dizzy: pupils roll around the rim
        const a = this.time * 9 + i * 1.3;
        ex += 900 * Math.cos(a);
        ey += 900 * Math.sin(a);
      }
      e.vx += ex * dt;
      e.vy += ey * dt;
      e.ox += e.vx * dt;
      e.oy += e.vy * dt;
      const d = Math.hypot(e.ox, e.oy);
      if (d > maxOff) {
        const nx = e.ox / d;
        const ny = e.oy / d;
        e.ox = nx * maxOff;
        e.oy = ny * maxOff;
        const vn = e.vx * nx + e.vy * ny;
        if (vn > 0) {
          e.vx -= vn * nx * 1.5;
          e.vy -= vn * ny * 1.5;
        }
        e.vx *= 0.99;
        e.vy *= 0.99;
      }
    }

    // Landings: thud + dust, fall damage for big drops (a flier that fell without its lift crashes)
    this.landT -= dt;
    if (this.crashed && this.lifting()) this.crashed = false;
    if (this.dropSlam) this.slamCheck(b, vy);
    for (const p of this.body) {
      if (p.onGround && p.impact > HARD_LANDING && this.landT <= 0) {
        this.landT = 0.25;
        const power = clamp(p.impact / 900, 0, 1.5);
        if (this.type.flying && !this.crashed && !this.ownFlight()) {
          this.crashed = true;
          b.emit('crash', p.x, this.ground, { unit: this, power });
        } else b.emit('land', p.x, this.ground, { unit: this, power });
        this.sqv += power * 5;
        if (this.alive && b.phase === 'battle' && p.impact > 650 && this.deployT <= 0 && !this.cushioned()) {
          const dmg = (p.impact - 650) * 0.12;
          this.hp -= dmg;
          this.conscious = Math.max(0, this.conscious - 0.4);
          if (this.hp <= 0) this.die(b, null);
        }
        p.impact = 0;
      }
    }

    if (this.floatT > 0 || this.flipFall) this.touchdown(b);
    if (this.type.hop && !this.stomped && this.alive && !this.held && this.tip && this.downT <= 0 && this.tip.vy(dt) > 0 && b.phase === 'battle') b.stomp(this);
    if (this.holding) this.keepHold(b);

    // Flying -> scream
    const fast = Math.hypot(hip.vx(dt), vy);
    if (this.groundF < 0.05 && fast > 280 && !(this.type.flying && this.ownFlight()) && !this.onPurpose()) this.airT += dt; // (a dive or a hop is on purpose)
    else this.airT = 0;
    this.screamT -= dt;
    if (this.alive && this.airT > 0.08 && this.screamT <= 0 && this.deployT <= 0) {
      this.screamT = 1.4;
      this.mouth = 0.8;
      this.mouthKind = 'o';
      b.emit('scream', head.x, head.y, { unit: this });
    }

    // Timers
    if (this.deployT > 0) {
      if (this.dropping && this.type.flying) {
        if (vy < 30) this.dropping = false; // its propeller caught it: hovering in, no landing
      } else if (this.dropping && this.groundF > 0.5) {
        // Touchdown: thud + dust (the legs take it, so the body never hits the ground itself)
        this.dropping = false;
        this.braceT = BRACE_T;
        if (this.landT <= 0) {
          this.landT = 0.3;
          b.emit('land', hip.x, this.ground, { unit: this, power: clamp(Math.max(0, vy) / 900, 0.3, 1.2) });
          this.sqv += 4;
        }
      }
      this.deployT -= dt;
      if (!this.dropping && this.alive && this.deployT <= YELL_T && this.deployT > 0 && this.yellT <= 0) {
        this.yellT = this.deployT; // landed: brandish the weapon until it's time to go
        this.brow = 1;
      }
      if (this.deployT <= 0) {
        this.deployT = 0;
        this.dropping = false;
      }
    }
    if (this.yellT > 0) this.yellT -= dt;
    if (this.braceT > 0) this.braceT -= dt;
    this.statusTimers(dt);
    if (this.wrapT > 0) this.wrapTick(b, dt);
    if (this.mouth > 0) this.mouth -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.dizzy > 0) this.dizzy -= dt;
    if (this.guardT > 0) this.guardT -= dt;
    if (!this.act && this.brow > 0) this.brow = Math.max(0, this.brow - dt * 3);
    if (this.deathFuse > 0) {
      this.deathFuse -= dt;
      this.fuseT = 1 - this.deathFuse / this.type.blast.chain;
      if (this.deathFuse <= 0) b.explode(this);
    }
    if (!this.alive) {
      this.deadT += dt;
      // Resting corpses go to sleep (skipped by the physics) until something hits them
      let moving = false;
      for (const p of this.parts) if (Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 5 * dt) moving = true;
      this.stillT = moving || this.deadT < 1 ? 0 : this.stillT + dt;
      if (this.stillT > 0.6 && !this.held) {
        this.asleep = true;
        for (const p of this.parts) {
          p.px = p.x;
          p.py = p.y;
        }
      }
    }
    this.blinkT -= dt;
    if (this.blinkT < -0.13) this.blinkT = this.rng.range(1.5, 5);
    if (this.alive && !this.target && b.phase !== 'battle') {
      // Idle: glance around now and then
      if (this.rng.chance(dt * 0.5)) {
        this.lookX = hip.x + this.rng.range(-300, 300);
        this.lookY = hip.y + this.rng.range(-200, 40);
      }
    }
  }

  /**
   * A Brolly reaches the ground. Floating, it lands softly (brollyLand) and
   * goes 0.4 s later. Fallen from a flipped umbrella, once its body hits the
   * dirt (after any fall damage, above) it lies there float.landStun s, then 0.4.
   */
  touchdown(b) {
    const F = this.type.float;
    if (this.floatT > 0) {
      if (this.groundF <= 0.5) return;
      this.floatT = 0;
      this.deployT = 0.4;
      this.braceT = BRACE_T;
      b.emit('brollyLand', this.hip.x, this.ground, { unit: this });
      return;
    }
    let down = false;
    for (const p of this.body) if (p.onGround) down = true;
    if (!down) return;
    this.flipFall = false;
    if (!this.alive) return;
    this.downT = Math.max(this.downT, F.landStun);
    this.deployT = F.landStun + 0.4;
  }

  /** A holder keeps its catch only while it means to: a Pelican in its carry, a Big Jelly (until it spits). */
  keepHold(b) {
    const v = this.holding;
    if (v.heldBy !== this) {
      this.holding = null; // (taken from it)
      return;
    }
    if (this.type.scoop && !(this.act && this.act.scoop && this.act.phase === 'carry')) b.letGoOf(this, 'stun');
  }

  /** Count down the newer cards' status timers (each stays at 0 when unused). */
  statusTimers(dt) {
    if (this.shoveT > 0) this.shoveT -= dt;
    if (this.slipImmuneT > 0) this.slipImmuneT -= dt;
    if (this.liftOffT > 0) this.liftOffT -= dt;
    if (this.netImmuneT > 0) this.netImmuneT -= dt;
    if (this.beatT > 0) this.beatT -= dt;
    if (this.squashT > 0) this.squashT -= dt;
    if (this.fumbleT > 0) this.fumbleT -= dt;
  }

  /** Bubble Wrap, each step it holds: the body bounces like a rubber ball. It ends when time's up or it's popped. */
  wrapTick(b, dt) {
    this.wrapT -= dt;
    if (this.wrapT <= 0 || this.wrapHp <= 0 || !this.alive) {
      this.unwrap(b);
      return;
    }
    for (const p of this.body) p.bounce = WRAP.bounce;
  }

  /** A flier held up by its own lift, or in its own dive. */
  ownFlight() {
    return this.lifting() || (!!this.type.flying && !!this.act && this.act.phase === 'dash');
  }

  /** A Pogo hopping (not knocked flying): no screaming, it meant to. */
  onPurpose() {
    return !!this.type.hop && this.downT <= 0 && this.conscious > 0.6;
  }

  /** No fall damage: Bubble Wrap holds, or a flier is flying (a netted or knocked-out one isn't). */
  cushioned() {
    return this.wrapHp > 0 || this.ownFlight();
  }

  /**
   * Dropped from a Pelican's beak (dropSlam = { damage, stun }): it remembers
   * how fast it fell, and when it first touches the ground (body or feet: its
   * legs only soften it) after falling faster than HARD_LANDING it takes the
   * slam on top of any fall damage. A gentle drop is no slam.
   */
  slamCheck(b, vy) {
    const S = this.dropSlam;
    if (this.held) return; // (still in the beak)
    S.fell = Math.max(S.fell || 0, vy);
    let down = false;
    for (const p of this.body) if (p.onGround) down = true;
    for (const p of this.foot) if (p.onGround) down = true;
    if (!down) return;
    this.dropSlam = null;
    if (!this.alive || S.fell <= HARD_LANDING) return;
    this.takeHit(b, { damage: S.damage, dvx: 0, dvy: 0, x: this.hip.x, y: this.ground, stun: S.stun, kind: 'slam', from: null, spin: 0 });
  }

  /** The shield as a segment (center, half-axis), or null. */
  shieldFrame() {
    if (!this.type.shield || !this.alive) return null;
    return this.shieldFrameRaw();
  }

  shieldFrameRaw() {
    const h = this.hand[1 - this.mainHand];
    const tilt = this.shieldTilt || 0.1;
    // Shield face runs along the body's up axis, tilted back a little
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const ax = this.ux * c - this.fwx * s;
    const ay = this.uy * c - this.fwy * s;
    return { x: h.x + this.fwx * 3, y: h.y + this.fwy * 3, ax, ay, half: 16 };
  }
}
