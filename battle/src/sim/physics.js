// Tiny Verlet physics: point masses, distance constraints, a flat ground per
// lane. Velocity is implicit: v = (x - px) / dt. Forces are accumulated in
// fx/fy during a substep and cleared by integrate().

export const MAX_SPEED = 2600; // px/s; hard cap so a bad impulse can't explode a ragdoll

export class Particle {
  constructor(x, y, mass = 1, radius = 2) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.fx = 0;
    this.fy = 0;
    this.mass = mass;
    this.im = mass > 0 ? 1 / mass : 0;
    this.r = radius;
    this.ground = 0; // y of the floor under this particle (its lane)
    this.friction = 0.12; // share of sliding speed lost per contact substep
    this.bounce = 0.18;
    this.onGround = false;
    this.impact = 0; // downward speed of the last ground contact (px/s), read by the unit for thuds
  }

  vx(dt) {
    return (this.x - this.px) / dt;
  }

  vy(dt) {
    return (this.y - this.py) / dt;
  }

  /** Instant velocity change in px/s (mass already applied by the caller). */
  addVel(dvx, dvy, dt) {
    this.px -= dvx * dt;
    this.py -= dvy * dt;
  }

  setVel(vx, vy, dt) {
    this.px = this.x - vx * dt;
    this.py = this.y - vy * dt;
  }

  teleport(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.px += dx;
    this.py += dy;
  }
}

export function integrate(p, dt, gravity, drag) {
  let vx = (p.x - p.px) * drag;
  let vy = (p.y - p.py) * drag;
  const lim = MAX_SPEED * dt;
  const sp2 = vx * vx + vy * vy;
  if (sp2 > lim * lim) {
    const k = lim / Math.sqrt(sp2);
    vx *= k;
    vy *= k;
  }
  p.px = p.x;
  p.py = p.y;
  const dt2 = dt * dt;
  p.x += vx + p.fx * p.im * dt2;
  p.y += vy + (gravity + p.fy * p.im) * dt2;
  p.fx = 0;
  p.fy = 0;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    // Never let a NaN escape into the rest of the sim.
    p.x = p.px = Number.isFinite(p.px) ? p.px : 0;
    p.y = p.py = Number.isFinite(p.py) ? p.py : 0;
  }
}

/** Ground contact with velocity response (once per substep, right after integrate). */
export function collideGround(p, dt) {
  const gy = p.ground - p.r;
  p.onGround = false;
  if (p.y < gy) return;
  const vy = p.y - p.py;
  const vx = p.x - p.px;
  p.impact = vy > 0 ? vy / dt : 0;
  p.y = gy;
  p.px = p.x - vx * (1 - p.friction);
  // Small bounce only for real impacts, so resting bodies don't buzz.
  p.py = vy * dt > 0 && p.impact > 160 ? p.y + vy * p.bounce : p.y;
  p.onGround = true;
}

/** Position-only ground clamp, used inside the constraint iterations. */
export function clampGround(p) {
  const gy = p.ground - p.r;
  if (p.y > gy) p.y = gy;
}

export class Dist {
  constructor(a, b, len = null, stiff = 1, mode = 0) {
    this.a = a;
    this.b = b;
    this.len = len == null ? Math.hypot(b.x - a.x, b.y - a.y) : len;
    this.stiff = stiff;
    this.mode = mode; // 0 = rod, 1 = only push apart (min length), -1 = only pull (rope)
  }

  solve() {
    const a = this.a;
    const b = this.b;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    if (this.mode === 1 && d >= this.len) return;
    if (this.mode === -1 && d <= this.len) return;
    const w = a.im + b.im;
    if (w === 0) return;
    const k = ((d - this.len) / (d * w)) * this.stiff;
    a.x += dx * k * a.im;
    a.y += dy * k * a.im;
    b.x -= dx * k * b.im;
    b.y -= dy * k * b.im;
  }
}

/**
 * Keeps `mid` on one side of the line from `a` to `c` (knees bend forward,
 * never backward). side = +1 / -1 picks the allowed side; strength 0..1.
 */
export function hingeLimit(a, mid, c, side, strength) {
  const lx = c.x - a.x;
  const ly = c.y - a.y;
  const ll = lx * lx + ly * ly;
  if (ll < 1e-6) return;
  const mx = mid.x - a.x;
  const my = mid.y - a.y;
  const cross = lx * my - ly * mx;
  if (cross * side >= 0) return;
  // Reflect a share of the way across the line.
  const t = (mx * lx + my * ly) / ll;
  const fx = a.x + lx * t;
  const fy = a.y + ly * t;
  mid.x += (fx - mid.x) * 2 * strength;
  mid.y += (fy - mid.y) * 2 * strength;
}

/** Spring-damper force pulling p toward (tx, ty); k and c are per unit mass. */
export function springTo(p, tx, ty, k, c, dt, scale = 1, tvx = 0, tvy = 0) {
  if (scale <= 0) return;
  const vx = (p.x - p.px) / dt;
  const vy = (p.y - p.py) / dt;
  p.fx += p.mass * (k * (tx - p.x) - c * (vx - tvx)) * scale;
  p.fy += p.mass * (k * (ty - p.y) - c * (vy - tvy)) * scale;
}

// --- geometry ------------------------------------------------------------------

/** Closest point parameter of p on segment ab (0..1). */
export function segParam(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  if (l < 1e-9) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / l;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function distPointSeg2(px, py, ax, ay, bx, by) {
  const t = segParam(px, py, ax, ay, bx, by);
  const x = ax + (bx - ax) * t - px;
  const y = ay + (by - ay) * t - py;
  return x * x + y * y;
}

/**
 * Closest points between segments p1-q1 and p2-q2. Writes into out:
 * { d2, s, t, x1, y1, x2, y2 }. (Ericson, Real-Time Collision Detection 5.1.9)
 */
export function segSeg(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y, out) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s;
  let t;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    s = t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const den = a * e - b * b;
      s = den > EPS ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  out.s = s;
  out.t = t;
  out.x1 = p1x + d1x * s;
  out.y1 = p1y + d1y * s;
  out.x2 = p2x + d2x * t;
  out.y2 = p2y + d2y * t;
  const dx = out.x1 - out.x2;
  const dy = out.y1 - out.y2;
  out.d2 = dx * dx + dy * dy;
  return out;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
