// Particles, tracers, muzzle flashes, transient lights, corpses and the
// persistent blood decal layer (painted once into a world-sized canvas).

import { rand, randSpread, TAU, pick } from '../util.js';

const DECAL_SCALE = 0.4;
const BLOOD = ['#4d0a0a', '#5c0c0c', '#6a1010', '#3f0808', '#561109'];
const MAX_PARTICLES = 900;
const MAX_CORPSES = 160;

export class Effects {
  constructor(w, h) {
    this.particles = [];
    this.tracers = [];
    this.flashes = [];
    this.lights = [];
    this.arcs = [];
    this.corpses = [];
    this.decal = document.createElement('canvas');
    this.decal.width = Math.ceil(w * DECAL_SCALE);
    this.decal.height = Math.ceil(h * DECAL_SCALE);
    this.decalScale = DECAL_SCALE;
    this.dctx = this.decal.getContext('2d');
    this.dctx.setTransform(DECAL_SCALE, 0, 0, DECAL_SCALE, 0, 0);
  }

  // --- Spawners --------------------------------------------------------------

  _p(p) {
    if (this.particles.length >= MAX_PARTICLES) return null;
    this.particles.push(p);
    return p;
  }

  blood(x, y, dx, dy, n = 4, speed = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + randSpread() * 0.7;
      const s = speed * rand(0.35, 1.2);
      this._p({
        kind: 'blood', x, y, z: rand(6, 14), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(40, 170),
        size: rand(1.4, 3.2), life: 2, max: 2, color: pick(BLOOD),
      });
    }
  }

  gibs(x, y, dx, dy, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + randSpread() * 1.2;
      const s = rand(60, 220);
      this._p({
        kind: 'gib', x, y, z: rand(8, 16), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(90, 220),
        size: rand(2.5, 4.5), life: 3, max: 3, color: pick(['#5a1a14', '#6e2a20', '#4a1410']), rot: rand(0, TAU), spin: rand(-12, 12),
      });
    }
  }

  /** Rock / concrete chunks (no blood); pass a palette for splinters etc. */
  debris(x, y, n = 8, palette = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = rand(60, 260);
      this._p({
        kind: 'debris', x, y, z: rand(4, 16), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(60, 200),
        size: rand(2.5, 5.5), life: 1.6, max: 1.6, color: palette ? pick(palette) : Math.random() < 0.5 ? '#6f6a63' : '#8a847b', rot: rand(0, TAU), spin: rand(-14, 14),
      });
    }
    this._p({ kind: 'dust', x, y, vx: 0, vy: 0, life: 0.7, max: 0.7, size: 14 });
  }

  sparks(x, y, nx, ny, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + randSpread() * 1.3;
      const s = rand(80, 320);
      this._p({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.08, 0.22), max: 0.22, size: rand(1, 2) });
    }
    this._p({ kind: 'dust', x, y, vx: nx * 20, vy: ny * 20, life: 0.5, max: 0.5, size: rand(5, 9) });
  }

  casing(x, y, aim, shell = false) {
    const a = aim + Math.PI / 2 + randSpread() * 0.5;
    const s = rand(60, 130);
    this._p({
      kind: 'casing', x, y, z: 12, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(70, 140),
      life: 6, max: 6, rot: rand(0, TAU), spin: rand(-20, 20), shell, bounced: false,
    });
  }

  /** A ring of glittering sparks (a stash popping open). */
  sparkle(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      const s = rand(90, 190);
      this._p({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.5), max: 0.5, size: rand(1.4, 2.4) });
    }
  }

  smoke(x, y, size = 10) {
    this._p({ kind: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-6, 6), vy: rand(-26, -10), life: rand(1.6, 2.6), max: 2.6, size });
  }

  ember(x, y) {
    this._p({ kind: 'spark', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-20, 20), vy: rand(-60, -20), life: rand(0.4, 0.9), max: 0.9, size: rand(1, 1.8) });
  }

  tracer(x0, y0, x1, y1, rgb, width = 1.6, life = 0.07) {
    this.tracers.push({ x0, y0, x1, y1, rgb, width, life, max: life });
  }

  muzzle(x, y, ang, size = 1) {
    this.flashes.push({ x, y, ang, size, life: 0.05, max: 0.05 });
    this.light(x, y, 150 * size, 0.06, 0.85);
  }

  light(x, y, r, life, k = 1) {
    this.lights.push({ x, y, r, life, max: life, k });
  }

  shoveArc(x, y, ang, reach) {
    this.arcs.push({ x, y, ang, reach, life: 0.16, max: 0.16 });
  }

  corpse(z, dx, dy, force) {
    if (this.corpses.length >= MAX_CORPSES) {
      // Oldest corpse becomes a stain.
      const old = this.corpses.shift();
      this.stain(old.x, old.y, old.r * 1.4);
    }
    const s = Math.min(force, 260);
    this.corpses.push({
      x: z.x, y: z.y, r: z.r, ang: Math.atan2(dy, dx) + randSpread() * 0.6,
      vx: dx * s, vy: dy * s, t: 0, skin: z.skin, shirt: z.shirt, flip: Math.random() < 0.5 ? -1 : 1,
    });
  }

  // --- Decals ----------------------------------------------------------------

  splat(x, y, size, alpha = 0.75) {
    const c = this.dctx;
    c.globalAlpha = alpha * rand(0.6, 0.9);
    c.fillStyle = pick(BLOOD);
    c.beginPath();
    c.arc(x, y, size, 0, TAU);
    c.fill();
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      c.arc(x + randSpread() * size * 2, y + randSpread() * size * 2, size * rand(0.25, 0.5), 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  pool(x, y, r) {
    const c = this.dctx;
    c.fillStyle = pick(BLOOD);
    for (let k = 0; k < 5; k++) {
      c.globalAlpha = rand(0.35, 0.6);
      c.beginPath();
      c.arc(x + randSpread() * r * 0.8, y + randSpread() * r * 0.8, r * rand(0.45, 0.9), 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  stain(x, y, r) {
    const c = this.dctx;
    c.globalAlpha = 0.35;
    c.fillStyle = '#2a0b08';
    c.beginPath();
    c.ellipse(x, y, r * 1.3, r * 0.9, rand(0, Math.PI), 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }

  // --- Update ------------------------------------------------------------------

  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      let dead = p.life <= 0;
      switch (p.kind) {
        case 'debris': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          if (p.z > 0 || p.vz > 0) {
            p.vz -= 900 * dt;
            p.z += p.vz * dt;
            if (p.z <= 0) {
              p.z = 0;
              p.vz = 0;
            }
          }
          const f = Math.exp(-(p.z > 0 ? 0.6 : 7) * dt);
          p.vx *= f;
          p.vy *= f;
          break;
        }
        case 'blood':
        case 'gib': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vz -= 900 * dt;
          p.z += p.vz * dt;
          if (p.rot !== undefined) p.rot += p.spin * dt;
          if (p.z <= 0) {
            this.splat(p.x, p.y, p.kind === 'gib' ? p.size * 1.6 : p.size * 1.3, p.kind === 'gib' ? 0.9 : 0.7);
            dead = true;
          }
          break;
        }
        case 'casing': {
          if (p.z > 0 || p.vz > 0) {
            p.vz -= 900 * dt;
            p.z += p.vz * dt;
            if (p.z <= 0) {
              p.z = 0;
              if (!p.bounced) {
                p.vz = -p.vz * 0.3;
                p.bounced = true;
              } else p.vz = 0;
              p.vx *= 0.5;
              p.vy *= 0.5;
            }
          }
          const f = Math.exp(-(p.z > 0 ? 0.5 : 6) * dt);
          p.vx *= f;
          p.vy *= f;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt * (p.z > 0 ? 1 : 0.2);
          break;
        }
        case 'spark': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const f = Math.exp(-7 * dt);
          p.vx *= f;
          p.vy *= f;
          break;
        }
        case 'smoke':
        case 'dust': {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.size += dt * (p.kind === 'smoke' ? 14 : 18);
          break;
        }
        default:
          break;
      }
      if (dead) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
      }
    }

    const age = (list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) {
          list[i] = list[list.length - 1];
          list.pop();
        }
      }
    };
    age(this.tracers);
    age(this.flashes);
    age(this.lights);
    age(this.arcs);

    const cs = this.corpses;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      c.t += dt;
      if (c.t < 0.6) {
        const f = Math.exp(-7 * dt);
        c.vx *= f;
        c.vy *= f;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }
      if (c.t > 50) {
        this.stain(c.x, c.y, c.r * 1.4);
        cs.splice(i, 1);
      }
    }
  }
}
