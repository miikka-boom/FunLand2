// One wobbly bean: a Verlet ragdoll with "muscles".
//
// The skeleton is a handful of particles joined by distance constraints. The
// muscles are spring-damper forces toward animated targets: hold the hips up,
// keep the head above the hips, plant the feet, put the hands and weapon where
// the current pose wants them. Every muscle is scaled by `conscious` (0..1):
// a hit knocks some of it out, so the bean wobbles, sags or flops over, then
// the muscles fade back in and it gets up again. Dead = conscious 0 forever.

import { WORLD } from '../config.js';
import { Particle, Dist, hingeLimit, springTo } from './physics.js';
import { BODY, WEAPONS } from './unit-types.js';
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

export class Unit {
  constructor(type, team, x, lane, id, seed) {
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
    this.hp = type.hp;
    this.maxHp = type.hp;
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

    this.build(x);
  }

  build(x) {
    const R = this.R;
    const L = this.L;
    const f = this.f;
    const gY = this.ground;
    this.legLen = BODY.thigh + BODY.shin;
    this.standH = this.legLen * BODY.standFrac;
    this.armLen = BODY.upperArm + BODY.foreArm;
    const cf = BODY.chestFrac;
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
      const fy = gY - 2;
      const [kx, ky] = ik(x, hipY, fx, fy, BODY.thigh, BODY.shin, -f);
      const knee = P(kx, ky, 0.5, 2, 0.3);
      const foot = P(fx, fy, 0.6, 2, 0.5);
      this.knee.push(knee);
      this.foot.push(foot);
      this.cons.push(new Dist(this.hip, knee, BODY.thigh), new Dist(knee, foot, BODY.shin));
      this.feet.push({ plant: true, air: false, x: fx, sx: fx, t: 0, dur: 0.18, h: 6 });
    }

    // Arms
    const W = WEAPONS[this.type.weapon];
    this.mainHand = this.type.weapon === 'sword' ? 0 : 1; // sword in the far hand, shield in the near
    this.elbow = [];
    this.hand = [];
    const rest = this.type.poses.rest;
    for (let i = 0; i < 2; i++) {
      const loc = i === this.mainHand ? rest.main : Array.isArray(rest.off) ? rest.off : rest.main;
      const hx = x + loc[0] * f;
      const hy = this.chest.y - loc[1];
      const [ex, ey] = ik(x, this.chest.y, hx, hy, BODY.upperArm, BODY.foreArm, f);
      const elbow = P(ex, ey, 0.35, 2, 0.3);
      const hand = P(hx, hy, 0.45, 2.5, 0.3);
      this.elbow.push(elbow);
      this.hand.push(hand);
      this.cons.push(new Dist(this.chest, elbow, BODY.upperArm), new Dist(elbow, hand, BODY.foreArm));
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
      new Dist(this.hip, this.head, L, 0.22),
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

  // ---------------------------------------------------------------------------
  // AI: pick a target, walk to it, attack. Runs ~7 times a second.

  think(b) {
    if (!this.alive) return;
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
          this.wantVx = Math.sign(dx) * this.speed * 1.25;
          this.f = Math.sign(dx);
        } else {
          this.walkTo = null;
          this.f = this.team === 'blue' ? 1 : -1;
        }
      }
      if (b.phase === 'over' && b.winner === this.team) this.state = 'cheer';
      return;
    }
    if (this.downT > 0 || this.conscious < 0.3) {
      this.wantVx = 0;
      return;
    }
    if (b.battleTime < this.hopAt + 0.12) {
      this.wantVx = 0; // battle cry first
      return;
    }
    const t = b.findTarget(this);
    this.target = t;
    this.charging = false;
    if (!t) {
      this.wantVx = 0;
      return;
    }
    const dx = t.hip.x - this.hip.x;
    const dist = Math.abs(dx);
    this.lookX = t.head.x;
    this.lookY = t.head.y;
    if (!this.act && dx !== 0) this.f = dx > 0 ? 1 : -1;
    const toward = dx > 0 ? 1 : -1;
    if (this.type.ranged) {
      this.wantVx = dist > this.preferRange ? toward * this.speed : 0;
      if (dist <= this.preferRange + 40 && !this.act && this.cooldown <= 0) this.startAttack(b);
    } else {
      const grow = t.R - 13;
      const engage = this.type.engage + grow;
      const reach = this.type.reach + grow;
      // Walk in to duel distance, plant the feet while swinging, step back if crowded.
      // Squires turtle under a raised shield; clubbers break into a yelling charge.
      let spd = this.guardT > 0 ? this.speed * 0.65 : this.speed;
      if (this.type.charge && dist < 240 && dist > engage + 10) {
        spd *= 1.45;
        this.charging = true;
        this.mouth = Math.max(this.mouth, 0.2);
        this.mouthKind = 'o';
      }
      if (this.act) this.wantVx = 0;
      else if (dist > engage) this.wantVx = toward * spd;
      else if (dist < engage - 14) this.wantVx = -toward * this.speed * 0.45;
      else this.wantVx = 0;
      if (dist <= reach && !this.act && this.cooldown <= 0 && this.groundF > 0.6) this.startAttack(b);
    }
    if (this.dizzy > 0) this.wantVx += Math.sin(this.time * 6) * 35; // staggering about
    this.state = this.wantVx ? 'move' : 'idle';
  }

  startAttack(b) {
    const variant = this.type.poses.windup2 ? (this.rng.chance(0.45) ? 1 : 0) : 0;
    this.act = { phase: this.type.ranged ? 'draw' : 'windup', t: 0, variant, hits: new Set(), done: false, aim: null };
    this.brow = 1;
    if (this.type.ranged) b.emit('bowDraw', this.hip.x, this.hip.y, { unit: this });
    else {
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
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.alive) {
      if (this.downT > 0) {
        this.downT -= dt;
        this.wake = 0;
        if (this.downT <= 0) {
          this.dizzy = 1.8;
          b.emit('dizzy', this.head.x, this.head.y - this.R, { unit: this });
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
      if (this.groundF > 0.8) for (const p of this.parts) p.addVel(0, -this.rng.range(200, 290), dt);
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
    const gF = clamp((this.legLen + 6 - height) / 12, 0, 1);
    this.groundF = gF;

    let pose = this.animate(dt, b);
    if (this.guardT > 0 && this.type.shield && (!this.act || this.act.phase === 'windup')) {
      pose = { ...pose, off: [9, 15], crouch: pose.crouch + 2, lean: pose.lean + 0.06 };
    }
    if (m < 0.01) return;

    // Hold the hips up (legs can only push, never pull: launches stay launches)
    // Breathing while standing around
    const breath = !this.wantVx && !this.act ? Math.sin(this.time * 2.3) * 0.9 : 0;
    const targetH = this.standH - pose.crouch + this.bob + breath;
    let fy = this.supportMass * (SUP_K * (this.ground - targetH - hip.y) - SUP_C * hipVy - G);
    if (fy > 0) fy = 0;
    const cap = this.supportMass * G * 5;
    if (fy < -cap) fy = -cap;
    hip.fy += fy * m * gF;

    // Keep the head over the hips at the pose's lean (an internal torque pair)
    const lean = pose.lean + this.waddle + clamp((hipVx * f) / 90, -1, 1) * 0.1 + (this.charging ? 0.22 : 0) + (this.dizzy > 0 ? Math.sin(this.time * 7) * 0.12 * Math.min(1, this.dizzy) : 0);
    const sx = Math.sin(lean) * f;
    const sy = -Math.cos(lean);
    const bal = this.wobbleT > 0 ? m * 0.35 : m; // near-fall: balance gives way for a moment
    this.uprightPull(this.head, this.L, sx, sy, bal, dt);
    this.uprightPull(this.chest, this.L * BODY.chestFrac, sx, sy, bal, dt);

    // Walk
    if (gF > 0) {
      let ax = DRIVE_K * (this.wantVx - hipVx);
      if (!this.wantVx && this.feet[0].plant && this.feet[1].plant) {
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
    const walking = gF > 0.35 && m > 0.3;
    this.bob = 0;
    this.waddle = 0;
    if (walking) {
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
    } else {
      // Airborne (or nearly out): cartoon running in the air
      const ph = this.time * 17;
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
    const flail = (this.groundF < 0.2 || this.wobbleT > 0) && this.alive ? 1 : 0;
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

    const W = WEAPONS[this.type.weapon];
    if (this.tip) {
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
      hand.fx -= Fx * 0.3;
      hand.fy -= Fy * 0.3;
      this.chest.fx -= Fx * 0.7;
      this.chest.fy -= Fy * 0.7;
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
    if (!this.alive) return P.rest;
    if (this.state === 'cheer' && !this.act) return P.cheer;
    if (b.yellT > 0 && !this.act && this.alive) {
      // Battle cry: brandish the weapon
      const k = Math.sin(clamp(b.yellT / 0.9, 0, 1) * Math.PI);
      return blendPose(P.rest, P.cheer, k * 0.8);
    }
    const a = this.act;
    if (!a) return P.rest;
    if (this.downT > 0 || this.conscious < 0.2) {
      this.act = null;
      this.bowDraw = 0;
      return P.rest;
    }
    a.t += dt;
    if (this.type.ranged) return this.animateBow(dt, b, a);

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
        const lunge = this.type.weapon === 'club' ? 130 : 90;
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
    return blendPose(strike, P.rest, easeInOut(a.t / A.recover));
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
        b.fireArrow(this, sol);
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

  // ---------------------------------------------------------------------------
  // Getting hit

  /**
   * hit: { damage, dvx, dvy, x, y, stun, kind, from, spin }
   * dvx/dvy is the launch velocity (px/s) given to the whole body; the struck
   * part gets extra so the bean spins.
   */
  takeHit(b, hit) {
    const heft = this.type.heft || 1; // heavy beans slide less, but still fly
    this.knock(hit.dvx * heft, hit.dvy, hit.x, hit.y, hit.spin == null ? 0.7 : hit.spin, b.dt, hit.flip || 0, hit.from ? hit.from.f : 0);
    this.sqv += 6 * Math.min(1.5, Math.hypot(hit.dvx, hit.dvy) / 300);
    if (!this.alive) return;
    this.hp -= hit.damage;
    this.hurtT = 0.1;
    this.lastHitBy = hit.from || null;
    const stun = hit.stun * (this.type.poise || 1);
    this.conscious = Math.max(0, this.conscious - stun);
    if (this.hp <= 0) {
      this.die(b, hit);
      return;
    }
    if (stun >= 0.85 || this.conscious < 0.12) {
      this.downT = this.rng.range(0.75, 1.25);
      this.act = null;
      this.bowDraw = 0;
      this.mouth = 0.8;
      this.mouthKind = 'o';
      b.emit('knockdown', this.head.x, this.head.y, { unit: this });
    } else {
      if (stun >= 0.5 && this.act && this.act.phase !== 'recover') {
        this.act = null; // interrupted
        this.bowDraw = 0;
        this.cooldown = Math.max(this.cooldown, 0.25);
      }
      if (stun >= 0.25) this.wobbleT = 0.45; // whoa-whoa-whoa
    }
    if (hit.damage >= 12) {
      this.mouth = Math.max(this.mouth, 0.35);
      this.mouthKind = 'o';
      b.emit('hitVoice', this.head.x, this.head.y, { unit: this, power: hit.damage / 40 });
    }
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
    b.emit('death', this.head.x, this.head.y, { unit: this, power: hit ? Math.hypot(hit.dvx, hit.dvy) / 400 : 0.5 });
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

    // Landings: thud + dust, fall damage for big drops
    this.landT -= dt;
    for (const p of this.body) {
      if (p.onGround && p.impact > 320 && this.landT <= 0) {
        this.landT = 0.25;
        const power = clamp(p.impact / 900, 0, 1.5);
        b.emit('land', p.x, this.ground, { unit: this, power });
        this.sqv += power * 5;
        if (this.alive && b.phase === 'battle' && p.impact > 820) {
          const dmg = (p.impact - 820) * 0.06;
          this.hp -= dmg;
          this.conscious = Math.max(0, this.conscious - 0.4);
          if (this.hp <= 0) this.die(b, null);
        }
        p.impact = 0;
      }
    }

    // Flying -> scream
    const fast = Math.hypot(hip.vx(dt), vy);
    if (this.groundF < 0.05 && fast > 280) this.airT += dt;
    else this.airT = 0;
    this.screamT -= dt;
    if (this.alive && this.airT > 0.08 && this.screamT <= 0) {
      this.screamT = 1.4;
      this.mouth = 0.8;
      this.mouthKind = 'o';
      b.emit('scream', head.x, head.y, { unit: this });
    }

    // Timers
    if (this.mouth > 0) this.mouth -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.dizzy > 0) this.dizzy -= dt;
    if (this.guardT > 0) this.guardT -= dt;
    if (!this.act && this.brow > 0) this.brow = Math.max(0, this.brow - dt * 3);
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
