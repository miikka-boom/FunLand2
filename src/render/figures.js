// Bodies in 3D: the survivors, the horde and the special infected.
//
// A figure is a handful of limbs (capsules: thick round-capped lines between
// two 3D points) and balls, placed in the body's own frame (forward along its
// facing, sideways, up) and projected by the camera. Which parts are drawn
// first depends on whether the body faces the camera or shows its back.
//
// The commons are drawn in batches (Horde): bodies that are next to each
// other in the painter's order are laid down layer by layer (legs, far arms,
// trunks, heads, near arms), each layer one path per colour, so a crowd still
// costs a few dozen canvas calls instead of ten per zombie.

import { ball, limb, line3, tone, tones, toneIndex } from './prims.js';
import { SKINS, SHIRTS } from '../game/zombies.js';
import { GUN_Z } from '../game/player.js';
import { hash01 } from './draw-utils.js';
import { TAU } from '../util.js';

export const PLAYER_LOOK = {
  ring: 'rgba(120,230,255,0.4)',
  arms: '#c99a78',
  pack: '#3a3226',
  body: '#2f8291',
  hair: '#6b4a2e',
  skin: '#d2a582',
  legs: '#2a3140',
};
export const ALLY_LOOK = {
  ring: 'rgba(140,255,160,0.5)',
  arms: '#b78a66',
  pack: '#2c3424',
  body: '#78872f',
  hair: '#2a1d14',
  skin: '#c49270',
  legs: '#3a3528',
};

const GUN_LEN = { hunting: 27, shotgun: 23, rifle: 23, smg: 16 };

/** A standing survivor (you or the teammate) at brightness b. */
export function drawSurvivor(R, p, look, b) {
  const { ctx, v } = R;
  const s = v.scale;
  const f = p.facing;
  const ca = Math.cos(f);
  const sa = Math.sin(f);
  const k = p.r / 12;
  const fd = ca * v.gx + sa * v.gy; // > 0: facing the camera
  const hurt = p.hurtT > 0;
  const X = (a, c) => p.x + ca * a - sa * c; // a: forward, c: to its right
  const Y = (a, c) => p.y + sa * a + ca * c;
  const w = p.walk;
  const stride = Math.sin(w) * 6.5 * k;
  const bob = Math.abs(Math.cos(w)) * 0.8 * k;
  const rec = (p.recoil || 0) * 4;
  ctx.lineCap = 'round';

  // Legs.
  ctx.strokeStyle = tone(look.legs, b);
  ctx.lineWidth = 6.2 * k * s;
  ctx.beginPath();
  limb(ctx, v, X(0, -3.4 * k), Y(0, -3.4 * k), 17 * k, X(stride, -4.2 * k), Y(stride, -4.2 * k), 3 * k + Math.max(0, Math.cos(w)) * 2.5 * k);
  limb(ctx, v, X(0, 3.4 * k), Y(0, 3.4 * k), 17 * k, X(-stride, 4.2 * k), Y(-stride, 4.2 * k), 3 * k + Math.max(0, -Math.cos(w)) * 2.5 * k);
  ctx.stroke();

  const def = p.weapon.def;
  const gunLen = GUN_LEN[def.id] || 18;
  const gz = GUN_Z + bob;
  const arms = () => {
    ctx.strokeStyle = tone(look.arms, b);
    ctx.lineWidth = 4.4 * k * s;
    ctx.beginPath();
    limb(ctx, v, X(1, 7 * k), Y(1, 7 * k), 30 * k + bob, X(7 - rec, 2.4 * k), Y(7 - rec, 2.4 * k), gz - 1);
    limb(ctx, v, X(1, -7 * k), Y(1, -7 * k), 30 * k + bob, X(14 - rec, 0.6 * k), Y(14 - rec, 0.6 * k), gz - 1);
    ctx.stroke();
    ctx.strokeStyle = tone('#191b1f', Math.max(b, 0.3));
    ctx.lineWidth = (def.id === 'shotgun' ? 3.6 : 3) * k * s;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    limb(ctx, v, X(4 - rec, 1.6 * k), Y(4 - rec, 1.6 * k), gz, X(5 + gunLen - rec, 1.6 * k), Y(5 + gunLen - rec, 1.6 * k), gz);
    ctx.stroke();
    ctx.lineCap = 'round';
  };
  const pack = () => {
    ctx.strokeStyle = tone(look.pack, b);
    ctx.lineWidth = 10 * k * s;
    ctx.beginPath();
    limb(ctx, v, X(-6.4 * k, 0), Y(-6.4 * k, 0), 20.5 * k + bob, X(-6.4 * k, 0), Y(-6.4 * k, 0), 28 * k + bob);
    ctx.stroke();
  };
  const torso = () => {
    ctx.strokeStyle = tone(hurt ? '#9a3a36' : look.body, b);
    ctx.lineWidth = 12.4 * k * s;
    ctx.beginPath();
    limb(ctx, v, X(0, 0), Y(0, 0), 18 * k, X(0.8 * k, 0), Y(0.8 * k, 0), 27.5 * k + bob);
    ctx.stroke();
    ctx.lineWidth = 7 * k * s;
    ctx.beginPath();
    limb(ctx, v, X(0.8 * k, -7 * k), Y(0.8 * k, -7 * k), 30 * k + bob, X(0.8 * k, 7 * k), Y(0.8 * k, 7 * k), 30 * k + bob);
    ctx.stroke();
  };
  const head = () => {
    ctx.fillStyle = tone(look.hair, b);
    ctx.beginPath();
    ball(ctx, v, X(1.2 * k, 0), Y(1.2 * k, 0), 38.6 * k + bob, 5.8 * k);
    ctx.fill();
    if (fd > -0.35) {
      ctx.fillStyle = tone(look.skin, b);
      ctx.beginPath();
      ball(ctx, v, X(3.6 * k, 0), Y(3.6 * k, 0), 37.4 * k + bob, 4.2 * k);
      ctx.fill();
    }
  };
  if (fd < 0) {
    arms();
    torso();
    pack();
    head();
  } else {
    pack();
    torso();
    head();
    arms();
  }
}

/** On the floor: pinned, down, or dead. */
export function drawLying(R, p, body, skin, legs, b) {
  const { ctx, v } = R;
  const s = v.scale;
  const ca = Math.cos(p.facing);
  const sa = Math.sin(p.facing);
  const k = p.r / 12;
  const X = (a, c) => p.x + ca * a - sa * c;
  const Y = (a, c) => p.y + sa * a + ca * c;
  ctx.lineCap = 'round';
  ctx.strokeStyle = tone(legs, b);
  ctx.lineWidth = 6 * k * s;
  ctx.beginPath();
  limb(ctx, v, X(-5, -3), Y(-5, -3), 4, X(-21, -6), Y(-21, -6), 3);
  limb(ctx, v, X(-5, 3), Y(-5, 3), 4, X(-20, 7), Y(-20, 7), 3);
  ctx.stroke();
  ctx.strokeStyle = tone(skin, b);
  ctx.lineWidth = 4.2 * k * s;
  ctx.beginPath();
  limb(ctx, v, X(6, -7), Y(6, -7), 5, X(12, -17), Y(12, -17), 3);
  limb(ctx, v, X(6, 7), Y(6, 7), 5, X(2, 18), Y(2, 18), 3);
  ctx.stroke();
  ctx.strokeStyle = tone(body, b);
  ctx.lineWidth = 12.5 * k * s;
  ctx.beginPath();
  limb(ctx, v, X(-5, 0), Y(-5, 0), 6, X(7, 0), Y(7, 0), 6.5);
  ctx.stroke();
  ctx.fillStyle = tone(skin, b);
  ctx.beginPath();
  ball(ctx, v, X(15, 0), Y(15, 0), 6, 5.4 * k);
  ctx.fill();
}

// --- The horde ---------------------------------------------------------------------------------

const J = 24; // floats per body: 12 joints on screen
const LEGS = '#2c2f36';
const LEG_TONES = tones(LEGS);
const SKIN_TONES = SKINS.map((c) => tones(c));
const SHIRT_TONES = SHIRTS.map((c) => tones(c));

export class Horde {
  constructor() {
    this.cap = 96;
    this.n = 0;
    this.zs = [];
    this.j = new Float32Array(this.cap * J);
    this.tone = new Uint8Array(this.cap); // brightness as a tone index
    this.far = new Uint8Array(this.cap); // arms behind the trunk (it shows its back)
    this.k = new Float32Array(this.cap);
    this.done = new Uint8Array(this.cap);
    this.d0 = 0;
    this.sumK = 0;
  }

  /** Does this body still fit the open batch? (Batches stay thin in depth so the layers hold up.) */
  fits(depth) {
    return this.n < this.cap && (this.n === 0 || depth - this.d0 < 13);
  }

  /** Pose a common and put it in the batch. b: its brightness. */
  add(R, z, b, depth) {
    const v = R.v;
    const t = R.t;
    const i = this.n++;
    if (i === 0) {
      this.d0 = depth;
      this.sumK = 0;
    }
    this.zs[i] = z;
    let f = z.face;
    const staggered = z.stagger > 0;
    if (staggered) f += Math.sin(t * 30 + z.id) * 0.35;
    const ca = Math.cos(f);
    const sa = Math.sin(f);
    const k = z.r / 11;
    const chasing = z.state === 'chase' && z.alertDelay <= 0;
    const speed = Math.min(1, Math.hypot(z.vx, z.vy) / (chasing ? 90 : 26));
    const ph = z.anim * (chasing ? 13 : 4.5);
    const stride = Math.sin(ph) * (chasing ? 6.5 : 3.5) * k * speed;
    const lean = staggered ? -3.5 : chasing ? 4 : 2.2; // hunched forward; knocked back when staggered
    const sway = Math.sin(z.anim * (chasing ? 14 : 4)) * (chasing ? 1.6 : 2.6);
    const wind = z.windup > 0 ? 1 : 0;
    const x = z.x;
    const y = z.y;
    const j = this.j;
    let o = i * J;
    const put = (a, c, h) => {
      const wx = x + ca * a - sa * c;
      const wy = y + sa * a + ca * c;
      j[o++] = v.px(wx, wy);
      j[o++] = v.py(wx, wy, h);
    };
    // hips, feet
    put(0, -3.2 * k, 16 * k);
    put(stride, -4 * k, 2.6 * k + Math.max(0, Math.cos(ph)) * 2 * k * speed);
    put(0, 3.2 * k, 16 * k);
    put(-stride, 4 * k, 2.6 * k + Math.max(0, -Math.cos(ph)) * 2 * k * speed);
    // pelvis, chest
    put(0, 0, 17 * k);
    put(lean * k, 0, 26.5 * k);
    // shoulders
    put(lean * k, -6.6 * k, 28.5 * k);
    put(lean * k, 6.6 * k, 28.5 * k);
    // hands: reaching while it hunts, hanging and swaying while it shambles, thrown up when hit
    if (staggered) {
      put((lean + 3) * k, -10 * k, 34 * k + sway);
      put((lean + 2) * k, 10 * k, 33 * k - sway);
    } else if (chasing) {
      const reach = (12 + wind * 5) * k;
      put(lean * k + reach, -4.5 * k - sway, (25 + wind * 5) * k + sway);
      put(lean * k + reach, 4.5 * k + sway, (25 + wind * 5) * k - sway);
    } else {
      put(lean * k + 3 + sway, -7.4 * k, 15 * k);
      put(lean * k + 3 - sway, 7.4 * k, 15 * k);
    }
    // head
    put((lean + 2.6) * k, 0, (chasing ? 34 : 35.5) * k);
    // face: a darker patch on the side it looks
    put((lean + 5.6) * k, 0, (chasing ? 32.6 : 34) * k);
    this.tone[i] = toneIndex(Math.round(b * 10) / 10);
    this.far[i] = ca * v.gx + sa * v.gy < -0.1 ? 1 : 0;
    this.k[i] = k;
    this.sumK += k;
  }

  /** Draw the batch and empty it. */
  flush(R) {
    const n = this.n;
    if (!n) return;
    const { ctx, v } = R;
    const j = this.j;
    const zs = this.zs;
    const tn = this.tone;
    const far = this.far;
    const done = this.done;
    const s = v.scale * (this.sumK / n);
    ctx.lineCap = 'round';

    // Legs: one colour, grouped by brightness. (Thin limbs get square ends:
    // at this size it doesn't show, and round caps cost as much as a head each.)
    ctx.lineCap = 'butt';
    ctx.lineWidth = 5.2 * s;
    done.fill(0, 0, n);
    for (let a = 0; a < n; a++) {
      if (done[a]) continue;
      const key = tn[a];
      ctx.beginPath();
      for (let i = a; i < n; i++) {
        if (done[i] || tn[i] !== key) continue;
        done[i] = 1;
        const o = i * J;
        ctx.moveTo(j[o], j[o + 1]);
        ctx.lineTo(j[o + 2], j[o + 3]);
        ctx.moveTo(j[o + 4], j[o + 5]);
        ctx.lineTo(j[o + 6], j[o + 7]);
      }
      ctx.strokeStyle = LEG_TONES[key];
      ctx.stroke();
    }

    const arms = (wantFar) => {
      ctx.lineCap = 'butt';
      ctx.lineWidth = 4 * s;
      done.fill(0, 0, n);
      for (let a = 0; a < n; a++) {
        if (done[a] || far[a] !== wantFar) continue;
        const z0 = zs[a];
        const key = tn[a];
        ctx.beginPath();
        for (let i = a; i < n; i++) {
          if (done[i] || far[i] !== wantFar || tn[i] !== key || zs[i].skinI !== z0.skinI) continue;
          done[i] = 1;
          const o = i * J;
          ctx.moveTo(j[o + 12], j[o + 13]);
          ctx.lineTo(j[o + 16], j[o + 17]);
          ctx.moveTo(j[o + 14], j[o + 15]);
          ctx.lineTo(j[o + 18], j[o + 19]);
        }
        ctx.strokeStyle = SKIN_TONES[z0.skinI][key];
        ctx.stroke();
      }
    };
    arms(1);

    // Trunks, then shoulders (two widths), grouped by shirt and brightness.
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = (pass ? 6 : 11.2) * s;
      done.fill(0, 0, n);
      for (let a = 0; a < n; a++) {
        if (done[a]) continue;
        const z0 = zs[a];
        const key = tn[a];
        ctx.beginPath();
        for (let i = a; i < n; i++) {
          if (done[i] || tn[i] !== key || zs[i].shirtI !== z0.shirtI) continue;
          done[i] = 1;
          const o = i * J + (pass ? 12 : 8);
          ctx.moveTo(j[o], j[o + 1]);
          ctx.lineTo(j[o + 2], j[o + 3]);
        }
        ctx.strokeStyle = SHIRT_TONES[z0.shirtI][key];
        ctx.stroke();
      }
    }

    // Heads.
    done.fill(0, 0, n);
    for (let a = 0; a < n; a++) {
      if (done[a]) continue;
      const z0 = zs[a];
      const key = tn[a];
      ctx.beginPath();
      for (let i = a; i < n; i++) {
        if (done[i] || tn[i] !== key || zs[i].skinI !== z0.skinI) continue;
        done[i] = 1;
        const o = i * J + 20;
        const r = 5 * this.k[i] * v.scale;
        ctx.moveTo(j[o] + r, j[o + 1]);
        ctx.arc(j[o], j[o + 1], r, 0, TAU);
      }
      ctx.fillStyle = SKIN_TONES[z0.skinI][key];
      ctx.fill();
    }
    // Sunken faces on the ones looking this way.
    ctx.fillStyle = 'rgba(20,14,12,0.45)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (far[i] || tn[i] < 5) continue;
      const o = i * J + 22;
      const r = 2.6 * this.k[i] * v.scale;
      ctx.moveTo(j[o] + r, j[o + 1]);
      ctx.arc(j[o], j[o + 1], r, 0, TAU);
    }
    ctx.fill();

    arms(0);

    // Hit flashes.
    let any = false;
    for (let i = 0; i < n; i++) {
      if (zs[i].hitFlash > 0) {
        if (!any) {
          any = true;
          ctx.strokeStyle = 'rgba(255,240,230,0.6)';
          ctx.lineCap = 'round';
          ctx.lineWidth = 12 * s;
          ctx.beginPath();
        }
        const o = i * J;
        ctx.moveTo(j[o + 8], j[o + 9]);
        ctx.lineTo(j[o + 20], j[o + 21]);
      }
    }
    if (any) ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) zs[i] = null; // don't keep dead zombies alive
    this.n = 0;
  }
}

/** A body you could see from above but the camera can't: a faint outline through whatever hides it. */
export function ghostPath(ctx, v, z, lift = 0) {
  const k = z.r / 11;
  limb(ctx, v, z.x, z.y, 12 * k + lift, z.x, z.y, 30 * k + lift);
}

// --- Special infected --------------------------------------------------------------------------

/** How high a Hunter is off the ground right now. */
export function hunterLift(h) {
  return h.mode === 'leap' ? 15 : 0;
}

export function drawHunter(R, h, b) {
  const { ctx, v } = R;
  const s = v.scale;
  const t = R.t;
  const r = h.r;
  let f = h.face;
  if (h.mode === 'stunned') f += Math.sin(t * 22 + h.id) * 0.4;
  const ca = Math.cos(f);
  const sa = Math.sin(f);
  const fd = ca * v.gx + sa * v.gy;
  const X = (a, c) => h.x + ca * a - sa * c;
  const Y = (a, c) => h.y + sa * a + ca * c;
  const lift = hunterLift(h);
  const pin = h.mode === 'pin';
  // Posture: on all fours while stalking, coiled when crouched, stretched out in the air.
  let hip = 14;
  let chest = 20;
  let fwd = 7;
  let headZ = 25;
  if (h.mode === 'crouch') { hip = 9; chest = 12; fwd = 6; headZ = 16; }
  else if (h.mode === 'leap') { hip = 12; chest = 14; fwd = 12; headZ = 15; }
  else if (pin) { hip = 12; chest = 15; fwd = 6; headZ = 19; }
  else if (h.mode === 'stunned') { hip = 15; chest = 25; fwd = 0; headZ = 32; }
  const ph = h.anim * 12;
  const stride = h.mode === 'stalk' ? Math.sin(ph) * 6 : h.mode === 'leap' ? -9 : 0;
  const reach = h.mode === 'stunned' ? 0.4 : h.mode === 'stalk' ? 0.95 + Math.sin(ph) * 0.3 : pin ? 0.9 + Math.sin(t * 30) * 0.35 : 1.35;
  ctx.lineCap = 'round';
  const legs = () => {
    ctx.strokeStyle = tone('#20242c', b);
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    limb(ctx, v, X(-3, -4), Y(-3, -4), hip + lift, X(-6 + stride, -6), Y(-6 + stride, -6), 2.5 + lift);
    limb(ctx, v, X(-3, 4), Y(-3, 4), hip + lift, X(-6 - stride, 6), Y(-6 - stride, 6), 2.5 + lift);
    ctx.stroke();
  };
  const claws = () => {
    ctx.strokeStyle = tone(h.skin, b);
    ctx.lineWidth = r * 0.34 * s;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const flail = pin ? Math.sin(t * 28 + side) * 5 : 0;
      limb(ctx, v, X(fwd, 6.5 * side), Y(fwd, 6.5 * side), chest + 3 + lift, X(fwd + r * reach, 6 * side + flail), Y(fwd + r * reach, 6 * side + flail), (h.mode === 'stalk' ? 3 : chest - 2) + lift);
    }
    ctx.stroke();
  };
  const trunk = () => {
    ctx.strokeStyle = tone(h.shirt, b * 1.6);
    ctx.lineWidth = 11.5 * s;
    ctx.beginPath();
    limb(ctx, v, X(-3, 0), Y(-3, 0), hip + lift, X(fwd, 0), Y(fwd, 0), chest + lift);
    ctx.stroke();
  };
  const hood = () => {
    ctx.fillStyle = tone('#2c3550', b * 1.25);
    ctx.beginPath();
    ball(ctx, v, X(fwd + 4, 0), Y(fwd + 4, 0), headZ + lift, 6);
    ctx.fill();
  };
  legs();
  if (fd < 0) {
    claws();
    trunk();
    hood();
  } else {
    trunk();
    hood();
    claws();
  }
  if (h.hitFlash > 0) {
    ctx.strokeStyle = 'rgba(255,240,230,0.55)';
    ctx.lineWidth = 13 * s;
    ctx.beginPath();
    limb(ctx, v, X(-3, 0), Y(-3, 0), hip + lift, X(fwd + 4, 0), Y(fwd + 4, 0), headZ + lift);
    ctx.stroke();
  }
}

/** Where a Hunter's eyes are (they glint in the dark). */
export function hunterEyes(v, h, out) {
  const ca = Math.cos(h.face);
  const sa = Math.sin(h.face);
  let fwd = 7;
  let z = 25;
  if (h.mode === 'crouch') { fwd = 6; z = 16; } else if (h.mode === 'leap') { fwd = 12; z = 15; }
  const lift = hunterLift(h);
  out.x = h.x + ca * (fwd + 8);
  out.y = h.y + sa * (fwd + 8);
  out.z = z + lift;
  return out;
}

export function drawTank(R, k, b) {
  const { ctx, v } = R;
  const s = v.scale;
  const r = k.r;
  const f = k.face;
  const ca = Math.cos(f);
  const sa = Math.sin(f);
  const fd = ca * v.gx + sa * v.gy;
  const X = (a, c) => k.x + ca * a - sa * c;
  const Y = (a, c) => k.y + sa * a + ca * c;
  const ph = k.anim * 7;
  const walk = Math.sin(ph) * 0.35;
  const stride = Math.sin(ph) * 9 * Math.min(1, Math.hypot(k.vx, k.vy) / 60);
  const wind = k.mode === 'punch' ? 1 - k.modeT / 0.42 : 0;
  const throwing = k.mode === 'throw';
  const skin = wind > 0 ? mixRed(k.skin, wind) : k.skin;
  ctx.lineCap = 'round';
  // Legs like tree trunks.
  ctx.strokeStyle = tone('#3a332f', b);
  ctx.lineWidth = 13 * s;
  ctx.beginPath();
  limb(ctx, v, X(0, -9), Y(0, -9), 24, X(stride, -11), Y(stride, -11), 6);
  limb(ctx, v, X(0, 9), Y(0, 9), 24, X(-stride, 11), Y(-stride, 11), 6);
  ctx.stroke();
  const arms = () => {
    for (const side of [-1, 1]) {
      let reach = 0.9 + walk * side * 0.5;
      let hz = 14;
      let spread = 4;
      if (throwing) {
        reach = 0.5;
        hz = 78;
        spread = -8; // both hands up together, holding the rock
      } else if (k.mode === 'punch' && side === 1) {
        reach = wind < 0.75 ? 0.2 - wind * 0.6 : 1.9; // haul back... then the haymaker
        hz = wind < 0.75 ? 40 : 34;
      }
      const sx = X(8, r * 0.95 * side);
      const sy = Y(8, r * 0.95 * side);
      const ex = X(8 + r * reach, (r * 0.95 + spread) * side);
      const ey = Y(8 + r * reach, (r * 0.95 + spread) * side);
      ctx.strokeStyle = tone(skin, b);
      ctx.lineWidth = r * 0.52 * s;
      ctx.beginPath();
      limb(ctx, v, sx, sy, 52, ex, ey, hz);
      ctx.stroke();
      ctx.fillStyle = tone(skin, b * 0.95);
      ctx.beginPath();
      ball(ctx, v, ex, ey, hz, r * 0.4);
      ctx.fill();
    }
  };
  const trunk = () => {
    // Torn shirt on the belly, hulking shoulders in skin.
    ctx.strokeStyle = tone(k.shirt, b);
    ctx.lineWidth = r * 1.25 * s;
    ctx.beginPath();
    limb(ctx, v, X(0, 0), Y(0, 0), 28, X(5, 0), Y(5, 0), 44);
    ctx.stroke();
    ctx.strokeStyle = tone(skin, b);
    ctx.lineWidth = r * 0.82 * s;
    ctx.beginPath();
    limb(ctx, v, X(8, -r * 0.8), Y(8, -r * 0.8), 54, X(8, r * 0.8), Y(8, r * 0.8), 54);
    ctx.stroke();
  };
  const head = () => {
    ctx.fillStyle = tone('#8c7f73', b);
    ctx.beginPath();
    ball(ctx, v, X(14, 0), Y(14, 0), 61, r * 0.3);
    ctx.fill();
  };
  if (fd < 0 && !throwing) {
    arms();
    trunk();
    head();
  } else {
    trunk();
    head();
    arms();
  }
  if (throwing) {
    const grow = Math.min(1, (1 - k.modeT) * 1.6);
    drawRock(R, X(8 + r * 0.5, 0), Y(8 + r * 0.5, 0), 84, 13 * (0.6 + grow * 0.4), R.t * 2, b);
  }
  if (k.hitFlash > 0) {
    ctx.strokeStyle = 'rgba(255,240,230,0.4)';
    ctx.lineWidth = r * 1.3 * s;
    ctx.beginPath();
    limb(ctx, v, X(0, 0), Y(0, 0), 28, X(8, 0), Y(8, 0), 54);
    ctx.stroke();
  }
}

const redCache = new Map();
function mixRed(hex, k) {
  const q = Math.round(k * 6);
  const key = hex + q;
  let c = redCache.get(key);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    const u = q / 6;
    const r = Math.round(((n >> 16) & 255) * (1 - u * 0.45) + 255 * u * 0.45);
    const g = Math.round(((n >> 8) & 255) * (1 - u * 0.5));
    const bl = Math.round((n & 255) * (1 - u * 0.5));
    c = `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
    redCache.set(key, c);
  }
  return c;
}

/** A lump of concrete at (x, y, z). */
export function drawRock(R, x, y, z, r, rot, b) {
  const { ctx, v } = R;
  const sx = v.px(x, y);
  const sy = v.py(x, y, z);
  const rr = r * v.scale;
  ctx.fillStyle = tone('#6f6a63', b);
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = rot + (i / 7) * TAU;
    const q = rr * (0.82 + hash01(i * 3.7) * 0.3);
    if (i === 0) ctx.moveTo(sx + Math.cos(a) * q, sy + Math.sin(a) * q);
    else ctx.lineTo(sx + Math.cos(a) * q, sy + Math.sin(a) * q);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tone('#8a847b', b);
  ctx.beginPath();
  ctx.arc(sx - rr * 0.25, sy - rr * 0.3, rr * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.arc(sx + Math.cos(rot) * rr * 0.35, sy + Math.sin(rot) * rr * 0.35 + rr * 0.2, rr * 0.3, 0, TAU);
  ctx.fill();
}

/** Night Terror: a pale, long-limbed, eyeless thing, only as visible as it is lit. */
export function drawTerror(R, z) {
  const { ctx, v } = R;
  const t = R.t;
  let a = Math.min(1, z.lit * 1.15);
  if (z.mode === 'flee') a *= Math.min(1, z.modeT / 1.5);
  if (a < 0.02) return;
  const s = v.scale;
  const r = z.r * 1.3; // drawn bigger than its body: long limbs
  const f = z.face + (z.mode === 'recoil' ? Math.sin(t * 47 + z.id) * 0.3 : 0);
  const ca = Math.cos(f);
  const sa = Math.sin(f);
  const fd = ca * v.gx + sa * v.gy;
  const jx = z.mode === 'recoil' ? Math.sin(t * 61) * 1.5 : 0;
  const X = (p, c) => z.x + jx + ca * p - sa * c;
  const Y = (p, c) => z.y + sa * p + ca * c;
  const walk = Math.sin(z.anim * 9);
  const reach = z.mode === 'windup' ? 0.55 : z.mode === 'lunge' ? 2.1 : z.mode === 'recoil' ? 0.3 : 1.25;
  // Stooped: taller than a man, bent so its head hangs forward.
  const hip = 27;
  const chest = z.mode === 'windup' ? 38 : z.mode === 'lunge' ? 30 : 43;
  const fwd = z.mode === 'lunge' ? 13 : 7;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Long thin legs.
  ctx.strokeStyle = '#9aa0aa';
  ctx.lineWidth = r * 0.22 * s;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const st = walk * side * 6;
    const kx = X(st * 0.5 + 3, 4 * side);
    const ky = Y(st * 0.5 + 3, 4 * side);
    ctx.moveTo(v.px(X(-2, 3 * side), Y(-2, 3 * side)), v.py(X(-2, 3 * side), Y(-2, 3 * side), hip));
    ctx.lineTo(v.px(kx, ky), v.py(kx, ky, hip * 0.5));
    ctx.lineTo(v.px(X(st - 3, 5 * side), Y(st - 3, 5 * side)), v.py(X(st - 3, 5 * side), Y(st - 3, 5 * side), 1.5));
  }
  ctx.stroke();
  const arms = () => {
    // Arms bent out to the side, then reaching forward; three long fingers.
    ctx.strokeStyle = z.skin;
    ctx.lineWidth = r * 0.2 * s;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const sw = z.mode === 'stalk' ? -walk * side * 3 : 0;
      const ex = X(fwd + 2, 11 * side);
      const ey = Y(fwd + 2, 11 * side);
      const hx = X(fwd + r * reach + sw, 7 * side);
      const hy = Y(fwd + r * reach + sw, 7 * side);
      const hz = z.mode === 'lunge' ? chest - 4 : z.mode === 'windup' ? chest + 4 : 20;
      ctx.moveTo(v.px(X(fwd, 6 * side), Y(fwd, 6 * side)), v.py(X(fwd, 6 * side), Y(fwd, 6 * side), chest));
      ctx.lineTo(v.px(ex, ey), v.py(ex, ey, chest - 10));
      ctx.lineTo(v.px(hx, hy), v.py(hx, hy, hz));
      for (const q of [-0.5, 0, 0.5]) {
        const fa = f + q * 0.5;
        ctx.moveTo(v.px(hx, hy), v.py(hx, hy, hz));
        ctx.lineTo(v.px(hx + Math.cos(fa) * r * 0.45, hy + Math.sin(fa) * r * 0.45), v.py(hx + Math.cos(fa) * r * 0.45, hy + Math.sin(fa) * r * 0.45, hz - 3));
      }
    }
    ctx.stroke();
  };
  const trunk = () => {
    // Narrow torso, ribs showing.
    ctx.strokeStyle = '#a7adb7';
    ctx.lineWidth = r * 0.62 * s;
    ctx.beginPath();
    limb(ctx, v, X(-2, 0), Y(-2, 0), hip, X(fwd, 0), Y(fwd, 0), chest);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,44,52,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const q of [0.3, 0.55, 0.8]) {
      const cx = X(-2 + (fwd + 2) * q, 0);
      const cy = Y(-2 + (fwd + 2) * q, 0);
      const cz = hip + (chest - hip) * q;
      line3(ctx, v, cx - sa * -4, cy + ca * -4, cz, cx - sa * 4, cy + ca * 4, cz);
    }
    ctx.stroke();
  };
  const head = () => {
    // Long eyeless head; the mouth gapes when it breathes in, lunges or shrieks.
    const hx = X(fwd + 6, 0);
    const hy = Y(fwd + 6, 0);
    const hz = chest + 1;
    ctx.strokeStyle = z.skin;
    ctx.lineWidth = r * 0.56 * s;
    ctx.beginPath();
    limb(ctx, v, hx, hy, hz, X(fwd + 11, 0), Y(fwd + 11, 0), hz - 3);
    ctx.stroke();
    if (fd > -0.3) {
      const open = z.mode === 'windup' || z.mode === 'lunge' || z.mode === 'recoil' ? 1 : 0.35 + Math.sin(t * 3 + z.id) * 0.1;
      ctx.fillStyle = '#07080b';
      ctx.beginPath();
      ball(ctx, v, X(fwd + 13, 0), Y(fwd + 13, 0), hz - 5, r * (0.1 + 0.14 * open));
      ctx.fill();
    }
  };
  if (fd < 0) {
    arms();
    trunk();
    head();
  } else {
    trunk();
    head();
    arms();
  }
  if (z.hitFlash > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = r * 0.8 * s;
    ctx.beginPath();
    limb(ctx, v, X(-2, 0), Y(-2, 0), hip, X(fwd + 8, 0), Y(fwd + 8, 0), chest);
    ctx.stroke();
  }
  ctx.globalAlpha = prev;
}

// --- The Witch ---------------------------------------------------------------------------------

const WITCH_HAIR = '#16141b';
const WITCH_RISE = 0.95; // game/witch.js: WITCH.rise
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const WP = { u: 0, hipA: 0, hipZ: 0, chestA: 0, chestZ: 0, headA: 0, headZ: 0 };

/**
 * Where her hips, chest and head are (forward of her centre, and how high):
 * folded up and rocking while she sits, coming up through the scream, leaning
 * into the run.
 */
function witchPose(w, t) {
  let u = 1;
  if (w.mode === 'sit') u = 0;
  else if (w.mode === 'rise') {
    const k = 1 - Math.max(0, w.modeT) / WITCH_RISE;
    u = k * k * (3 - 2 * k);
  }
  const look = w.look || 0;
  const run = w.mode === 'charge' || w.mode === 'flee';
  const lean = run ? 1 : w.mode === 'attack' ? 0.6 : w.mode === 'stumble' ? -0.6 : 0;
  // Lost in it: she rocks, and the sobs shake her. Both stop as her head comes up.
  const lost = (1 - look) * (1 - u);
  const rock = Math.sin(t * 1.15 + w.id) * 1.3 * lost;
  const sob = Math.pow(Math.max(0, Math.sin(t * 2.1 + w.id * 1.7)), 6) * Math.sin(t * 34) * 0.8 * lost;
  const shake = (u === 0 && look > 0.5 ? Math.sin(t * 43) * 0.5 * look : 0) + (w.mode === 'rise' ? Math.sin(t * 52) * 0.9 : 0);
  WP.u = u;
  WP.hipA = lerp(-3, -1, u);
  WP.hipZ = lerp(5, 19, u);
  WP.chestA = lerp(4 + rock, 1 + lean * 5.5, u) + shake;
  WP.chestZ = lerp(17 + sob + look * 1.5 + (w.flinch > 0 ? 1.4 : 0), 31.5 - Math.abs(lean) * 2.5, u);
  WP.headA = lerp(8.5 + rock * 1.2 - look * 2.5, 3 + lean * 9, u) + shake;
  WP.headZ = lerp(20 + sob * 1.3 + look * 5, 40 - Math.abs(lean) * 4.5 + (w.mode === 'rise' ? 1.5 : 0), u);
  return WP;
}

/** Where a Witch's eyes are (they burn once she has heard you). */
export function witchEyes(w, t, out) {
  const P = witchPose(w, t);
  const ca = Math.cos(w.face);
  const sa = Math.sin(w.face);
  out.x = w.x + ca * (P.headA + 4);
  out.y = w.y + sa * (P.headA + 4);
  out.z = P.headZ - 0.6;
  return out;
}

/**
 * The Witch: thin, in a long pale nightgown, dark hair over her face. Seated
 * she is folded round the light of a phone, rocking; on her feet she is all
 * arms.
 */
export function drawWitch(R, w, b) {
  const { ctx, v } = R;
  const s = v.scale;
  const t = R.t;
  const P = witchPose(w, t);
  const u = P.u;
  const ca = Math.cos(w.face);
  const sa = Math.sin(w.face);
  const fd = ca * v.gx + sa * v.gy; // > 0: facing the camera
  const X = (a, c) => w.x + ca * a - sa * c;
  const Y = (a, c) => w.y + sa * a + ca * c;
  const mv = (a, c, z) => ctx.moveTo(v.px(X(a, c), Y(a, c)), v.py(X(a, c), Y(a, c), z));
  const ln = (a, c, z) => ctx.lineTo(v.px(X(a, c), Y(a, c)), v.py(X(a, c), Y(a, c), z));
  const held = !(w.phoneT > 0); // the phone is still in her hands (and lights her from below)
  const lit = held ? Math.max(b, 0.6) : b;
  const gown = tone(w.shirt, b);
  const skin = tone(w.skin, lit);
  const hair = tone(WITCH_HAIR, Math.min(1, Math.max(b, 0.1) * 1.5));
  const run = w.mode === 'charge' || w.mode === 'flee';
  const ph = w.anim * 15;
  const stride = run ? Math.sin(ph) * 8 : w.mode === 'attack' ? Math.sin(ph) * 3 : 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const legs = () => {
    // Bare shins under the hem: knees drawn up in front of her, or long strides.
    ctx.strokeStyle = skin;
    ctx.lineWidth = 3.4 * s;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      mv(lerp(8, 1 + stride * side * 0.5, u), lerp(4.2, 3, u) * side, lerp(11.5, 10, u));
      ln(lerp(12.5, -1 + stride * side, u), lerp(4.6, 3.6, u) * side, 1.5 + (run ? Math.max(0, Math.cos(ph) * side) * 3 * u : 0));
    }
    ctx.stroke();
    // The gown: over her thighs, or hanging to the knee.
    ctx.strokeStyle = gown;
    ctx.beginPath();
    if (u < 0.6) {
      ctx.lineWidth = 6.4 * s;
      for (const side of [-1, 1]) {
        mv(P.hipA, 2.6 * side, P.hipZ + 1);
        ln(lerp(8, 1, u), lerp(4.2, 3, u) * side, lerp(11.5, 10, u));
      }
    } else {
      ctx.lineWidth = 9 * s;
      mv(P.hipA, 0, P.hipZ);
      ln(P.hipA + stride * 0.15, 0, 10);
    }
    ctx.stroke();
  };

  // Hands: on the phone; flung wide as she comes up; swept back as she runs; one after the other when she strikes.
  const hand = (side, out) => {
    const sx = P.headA + 3.2;
    const sz = P.chestZ - 4.2;
    let a = sx;
    let c = 1.7 * side;
    let z = sz;
    if (w.mode === 'rise') {
      a = lerp(sx, -1, u);
      c = lerp(1.7, 15, u) * side;
      z = lerp(sz, 23 + Math.sin(t * 50 + side) * 1.2, u);
    } else if (run) {
      a = -6 + Math.sin(ph + side) * 2;
      c = 12.5 * side;
      z = 20;
    } else if (w.mode === 'attack') {
      // The arm that just struck follows through low; the other is already coming over.
      const k = clamp01(1 - w.attackCd / 0.42);
      if (side === -w.arm) {
        a = lerp(15, -3, k);
        c = lerp(1, 11, k) * side;
        z = lerp(19, 26, k);
      } else {
        const wind = w.windup > 0 ? 1 : k;
        a = lerp(-2, 12, wind * wind);
        c = lerp(10, 3, wind) * side;
        z = lerp(34, 30, wind);
      }
    } else if (w.mode === 'stumble') {
      a = -5;
      c = 13 * side;
      z = 33;
    }
    out.a = a;
    out.c = c;
    out.z = z;
    return out;
  };
  const H = [{ a: 0, c: 0, z: 0 }, { a: 0, c: 0, z: 0 }];
  hand(-1, H[0]);
  hand(1, H[1]);

  const arms = () => {
    ctx.strokeStyle = skin;
    ctx.lineWidth = 2.9 * s;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const h = H[i];
      const shA = P.chestA;
      const shC = 5 * side;
      const shZ = P.chestZ - 0.5;
      // A sharp elbow, out to the side.
      mv(shA, shC, shZ);
      ln((shA + h.a) / 2 - 1.5 * u, (shC + h.c) / 2 + 3.5 * side, (shZ + h.z) / 2 - 3 + 4 * u);
      ln(h.a, h.c, h.z);
    }
    ctx.stroke();
    if (u > 0.4) {
      // Long fingers.
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      for (let i = 0; i < 2; i++) {
        const h = H[i];
        for (const q of [-1, 0, 1]) {
          mv(h.a, h.c, h.z);
          ln(h.a + 4.5, h.c + q * 2.2, h.z - 2.5);
        }
      }
      ctx.stroke();
    }
  };

  const phone = () => {
    if (!held) return;
    const a = P.headA + 3.6;
    const z = P.chestZ - 4;
    ctx.lineCap = 'butt';
    if (fd < 0.5 || v.sp > 0.8) {
      // The screen (it faces her, and up: from high above you always see it).
      ctx.strokeStyle = '#dbe9ff';
      ctx.lineWidth = 3.6 * s;
      ctx.beginPath();
      mv(a, -2.1, z);
      ln(a, 2.1, z);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#0c0d12';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      mv(a + 0.6, -2.1, z);
      ln(a + 0.6, 2.1, z);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(170,200,255,0.16)';
    ctx.beginPath();
    ball(ctx, v, X(a, 0), Y(a, 0), z, 8.5);
    ctx.fill();
  };

  const trunk = () => {
    ctx.strokeStyle = gown;
    ctx.lineWidth = 9.2 * s;
    ctx.beginPath();
    mv(P.hipA, 0, P.hipZ);
    ln(P.chestA, 0, P.chestZ);
    ctx.stroke();
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    mv(P.chestA, -5, P.chestZ);
    ln(P.chestA, 5, P.chestZ);
    ctx.stroke();
  };

  const hairBack = () => {
    // Down her back while she sits; streaming behind her when she runs.
    ctx.strokeStyle = hair;
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    mv(P.headA - 1.5, 0, P.headZ + 1);
    if (run) ln(P.chestA - 11, Math.sin(ph * 0.5) * 2, P.chestZ + 4);
    else ln(lerp(P.hipA + 1.5, P.chestA - 3.5, u), 0, lerp(P.hipZ + 5.5, P.chestZ - 5, u));
    ctx.stroke();
  };

  const head = () => {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ball(ctx, v, X(P.headA, 0), Y(P.headA, 0), P.headZ, 5.1);
    ctx.fill();
    if (fd > -0.35) {
      // What shows of her face: lit blue-white from below while she has the phone.
      ctx.fillStyle = held ? tone('#c3cde6', lit) : skin;
      ctx.beginPath();
      ball(ctx, v, X(P.headA + 2.4, 0), Y(P.headA + 2.4, 0), P.headZ - 1, 3.6);
      ctx.fill();
    }
    if (u < 0.5) {
      // The hair that hangs over it.
      ctx.strokeStyle = hair;
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        mv(P.headA + 2, 3.6 * side, P.headZ + 1);
        ln(P.headA + 3.4, 3.2 * side, P.headZ - 7 + (w.look || 0) * 2);
      }
      ctx.stroke();
    }
  };

  if (u < 0.5) {
    if (fd < 0) {
      legs();
      arms();
      phone();
      trunk();
      hairBack();
      head();
    } else {
      hairBack();
      trunk();
      legs();
      arms();
      phone();
      head();
    }
  } else {
    legs();
    if (fd < 0) {
      arms();
      trunk();
      hairBack();
      head();
    } else {
      hairBack();
      trunk();
      head();
      arms();
    }
  }
  if (w.hitFlash > 0) {
    ctx.strokeStyle = 'rgba(255,240,235,0.6)';
    ctx.lineWidth = 10 * s;
    ctx.beginPath();
    mv(P.hipA, 0, P.hipZ);
    ln(P.headA, 0, P.headZ);
    ctx.stroke();
  }
}
