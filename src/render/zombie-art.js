// The horde in the artist's 3D models (assets/zombies/, built by tools/zombies/).
//
// Each part of a look (its head, torso, arm and foot, in its colours) is drawn from sprites baked
// for the camera by zombie-bake.js: one per facing (32 of them), and for the arm one per facing
// and pose. Every frame a zombie is put together from them, posed (feet stepping, body bobbing
// and swaying, arms hanging, reaching, raised for a swing or thrown up when it's hit, head
// bobbing), and drawn part by part from the farthest to the nearest. Which part is in front of
// which depends on how it's turned and on its arms, so that order is worked out per facing and
// arm pose from where the parts really overlap (orderFor).
//
// Sprites are baked when first wanted, a few milliseconds' worth per frame at most: a zombie
// whose facing isn't baked yet borrows the nearest one that is, for a frame or two. The camera's
// tilt and zoom are baked in; when either changes, the bakes start over, once the change has
// settled (dragging a slider doesn't bake every frame; meanwhile the old sprites are drawn
// scaled). Turning the camera changes nothing: a sprite is picked by how the zombie faces
// relative to the camera.
//
// Light: sprites are baked fully lit. A zombie in the dark gets each part's black silhouette laid
// over that part at (1 - brightness), which darkens exactly its own pixels, by any amount. A
// silhouette only depends on the shape, so all the colours of a part share theirs.
//
// Lean: a steep camera would mostly see the tops of their heads, so the zombies lean toward the
// camera, pivoting at their feet (the body's parts are baked and placed as if the camera were
// lower: tiltPitches), and their heads tip further toward it about the neck, whichever way they
// face. The draw order is worked out for the same angles.
//
// The dead lie on the ground as decals of their models, on their backs with their arms flung up.

import { BODIES, FOOT, HEADS, BLOCKS } from '../../assets/zombies/meshes.js';
import { decodeMesh, Texture, bake, overlap } from './zombie-bake.js';
import { LOOKS } from '../game/zombie-looks.js';
import { TAU } from '../util.js';

export const DIRS = 32;
const STEP = TAU / DIRS;
/** The arm poses baked, radians up from straight ahead: hanging, low, reaching, raised, up. */
export const ARM_PITCH = [-0.5, -0.25, 0, 0.35, 0.75];
const NP = ARM_PITCH.length;
const STILL = [0];
/** World units per model unit: a model zombie's head is about as wide as its body circle (radius 10 to 12). */
export const SCALE = 0.1;
const SS = 2; // samples per pixel each way when baking
const MAX_PPU = 0.9; // px per model unit at most (a huge screen zoomed right in draws its sprites scaled up instead)
const PAGE = 1024;
const SETTLE = 0.25; // s a new camera has to hold before the bakes start over
const BUDGET = 4; // ms of baking per frame, once a look has its first sprites
// Facings every look gets ready ahead of need (toward the camera, away, sideways), with the arm
// poses of a shambler and a hunter, so a look's first zombie on screen borrows a near facing
// instead of baking everything at once.
const WARM_DIRS = [8, 24, 0, 16];
const WARM_POSES = [1, 2];
const ORDER_PPU = 0.08; // px per model unit for the small bakes that work out the draw order
// The parts, as numbered in a draw order.
export const FOOT_L = 0;
export const FOOT_R = 1;
export const TORSO = 2;
export const ARM_L = 3;
export const ARM_R = 4;
export const HEAD = 5;
/** A model zombie's outline seen through walls (k = 1): its body from body0 to body1 high, its head at head, radius headR. */
export const GHOST = { body0: 4, body1: 17, head: 30, headR: 10.5 };
const DEG = Math.PI / 180;
// A lean stops here: from a camera this low the zombies already show their profiles.
const MIN_BODY = 35 * DEG;
const MIN_HEAD = 20 * DEG;

/**
 * The camera tilts the zombies' bodies and heads are drawn for (radians above the horizon), for a
 * camera at `pitch` and a lean and head tilt toward it (radians).
 */
export function tiltPitches(pitch, lean, headTilt) {
  const body = Math.max(pitch - lean, Math.min(pitch, MIN_BODY));
  const head = Math.max(body - headTilt, Math.min(body, MIN_HEAD));
  return [body, head];
}

const meshes = new Map();
function mesh(m) {
  let d = meshes.get(m);
  if (!d) {
    d = decodeMesh(m);
    meshes.set(m, d);
  }
  return d;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * An atlas page on a canvas. Sprites are written into a pixel buffer and uploaded together
 * (flush), since every upload makes the browser copy the page; a full page lets its buffer go.
 */
export function canvasPage(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  let img = ctx.createImageData(w, h);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  return {
    canvas,
    put(rgba, sw, sh, x, y, black) {
      const d = img.data;
      for (let j = 0; j < sh; j++) {
        let o = ((y + j) * w + x) * 4;
        let q = j * sw * 4;
        for (let i = 0; i < sw; i++, o += 4, q += 4) {
          d[o] = black ? 0 : rgba[q];
          d[o + 1] = black ? 0 : rgba[q + 1];
          d[o + 2] = black ? 0 : rgba[q + 2];
          d[o + 3] = rgba[q + 3];
        }
      }
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x + sw > x1) x1 = x + sw;
      if (y + sh > y1) y1 = y + sh;
    },
    flush() {
      if (x1 > x0) ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
      x0 = y0 = Infinity;
      x1 = y1 = -Infinity;
    },
    seal() {
      this.flush();
      img = null;
    },
  };
}

/** Sprites shelf-packed into pages. */
class Atlas {
  constructor(makePage) {
    this.make = makePage;
    this.pages = [];
    this.cur = null;
    this.x = 0;
    this.y = 0;
    this.row = 0;
    this.px = 0; // pixels used, for the debug read-out
  }

  clear() {
    this.pages.length = 0;
    this.cur = null;
    this.px = 0;
  }

  /** A baked sprite (black: only its silhouette) -> { canvas, x, y, w, h, ox, oy }. */
  add(s, black = false) {
    const w = s.w;
    const h = s.h;
    if (this.cur && this.x + w > PAGE) {
      this.x = 0;
      this.y += this.row + 1;
      this.row = 0;
    }
    if (!this.cur || this.y + h > PAGE) {
      if (this.cur) this.cur.seal();
      this.cur = this.make(PAGE, PAGE);
      this.pages.push(this.cur);
      this.x = 0;
      this.y = 0;
      this.row = 0;
    }
    const x = this.x;
    const y = this.y;
    this.cur.put(s.rgba, w, h, x, y, black);
    this.x += w + 1;
    if (h > this.row) this.row = h;
    this.px += w * h;
    return { canvas: this.cur.canvas, x, y, w, h, ox: s.ox, oy: s.oy, k: null };
  }

  /** Upload what's been added since the last flush. */
  flush() {
    if (this.cur) this.cur.flush();
  }
}

/** A part in one colour block: its sprites by facing and pose, baked when first wanted. */
class Part {
  constructor(m, shift, poses, sil, head) {
    this.head = head; // baked at the head's tilt
    this.item = { mesh: m, shift, pitch: 0 };
    this.poses = poses;
    this.n = poses.length;
    this.s = new Array(DIRS * this.n);
    this.sil = sil; // the silhouettes, shared by every colour of this shape
  }
}

/**
 * The order a zombie's six parts are drawn in when it faces direction d, for every pair of arm
 * poses, worked out from small bakes of the parts in place: where two overlap on screen, the one
 * whose pixels are mostly nearer the camera goes later; parts that don't overlap keep the depth
 * order of their pivots. b and h are the cameras ({ sp, cp }: sine and cosine of the tilt) the
 * body and the head are drawn for (a head tipped toward the camera about its neck is the same,
 * on screen, as that head seen from lower down). Returns Uint8Array: at (leftArm * NP + rightArm)
 * * 6, the parts far to near.
 */
export function orderFor(body, head, tex, b, h, d) {
  const { sp, cp } = b;
  const o = { phi: d * STEP, sp, cp, ppu: ORDER_PPU, ss: 1 };
  const out = new Uint8Array(NP * NP * 6);
  const mounts = [body.feet[0], body.feet[1], [0, 0, 0], body.shoulders[0], body.shoulders[1], [0, 0, body.neck]];
  const X = new Float64Array(6);
  const Y = new Float64Array(6);
  const Z = new Float64Array(6);
  const cf = Math.cos(o.phi);
  const sf = Math.sin(o.phi);
  for (let i = 0; i < 6; i++) {
    const [a, c, h] = mounts[i];
    const g = a * sf + c * cf;
    X[i] = ORDER_PPU * (a * cf - c * sf);
    Y[i] = ORDER_PPU * (g * sp - h * cp);
    Z[i] = g * cp + h * sp;
  }
  const foot = bake([{ mesh: mesh(FOOT) }], tex, o);
  const spr = [foot, foot, bake([{ mesh: mesh(body.torso) }], tex, o), null, null, bake([{ mesh: mesh(head.mesh) }], tex, { ...o, sp: h.sp, cp: h.cp })];
  const am = mesh(body.arm);
  const arms = ARM_PITCH.map((p) => bake([{ mesh: am, pitch: p }], tex, o));
  const sign = (s) => (s > 1 ? 1 : s < -1 ? -1 : 0);
  const rel = (i, si, j, sj) => sign(overlap(si, X[i], Y[i], Z[i], sj, X[j], Y[j], Z[j]));
  const fixed = new Int8Array(36); // [i * 6 + j] = 1: i goes before j
  const still = [FOOT_L, FOOT_R, TORSO, HEAD];
  for (let p = 0; p < 4; p++) {
    for (let q = p + 1; q < 4; q++) {
      const i = still[p];
      const j = still[q];
      const r = rel(i, spr[i], j, spr[j]);
      if (r > 0) fixed[j * 6 + i] = 1;
      else if (r < 0) fixed[i * 6 + j] = 1;
    }
  }
  const armVs = new Int8Array(2 * NP * 6); // [(side * NP + pose) * 6 + j]: is that arm in front of part j
  for (let side = 0; side < 2; side++) {
    const i = side ? ARM_R : ARM_L;
    for (let p = 0; p < NP; p++) for (const j of still) armVs[(side * NP + p) * 6 + j] = rel(i, arms[p], j, spr[j]);
  }
  const before = new Int8Array(36);
  for (let l = 0; l < NP; l++) {
    for (let r = 0; r < NP; r++) {
      before.set(fixed);
      for (const j of still) {
        const sl = armVs[l * 6 + j];
        if (sl > 0) before[j * 6 + ARM_L] = 1;
        else if (sl < 0) before[ARM_L * 6 + j] = 1;
        const sr = armVs[(NP + r) * 6 + j];
        if (sr > 0) before[j * 6 + ARM_R] = 1;
        else if (sr < 0) before[ARM_R * 6 + j] = 1;
      }
      const s = rel(ARM_L, arms[l], ARM_R, arms[r]);
      if (s > 0) before[ARM_R * 6 + ARM_L] = 1;
      else if (s < 0) before[ARM_L * 6 + ARM_R] = 1;
      sortParts(before, Z, out, (l * NP + r) * 6);
    }
  }
  return out;
}

/** Far to near: whatever nothing still undrawn has to precede, farthest pivot first (a cycle gives way at its least-bound part). */
function sortParts(before, depth, out, at) {
  let done = 0;
  for (let k = 0; k < 6; k++) {
    let best = -1;
    let bestN = 99;
    for (let i = 0; i < 6; i++) {
      if (done & (1 << i)) continue;
      let n = 0;
      for (let j = 0; j < 6; j++) if (j !== i && !(done & (1 << j)) && before[j * 6 + i]) n++;
      if (n < bestN || (n === bestN && depth[i] < depth[best])) {
        best = i;
        bestN = n;
      }
    }
    done |= 1 << best;
    out[at + k] = best;
  }
}

export class ZombieArt {
  /** opts.makePage(w, h): an atlas page (default: a canvas); opts.texture: a Texture (skips loading). */
  constructor(opts = {}) {
    this.makePage = opts.makePage || canvasPage;
    this.atlas = new Atlas(this.makePage);
    this.tex = opts.texture || null;
    this.state = this.tex ? 'ready' : 'idle'; // 'loading' | 'ready' | 'failed'
    this.budget = opts.budget ?? BUDGET;
    this.cam = null; // what the sprites are baked for: { pitch, ppu, sp, cp }
    this.want = null;
    this.wantT = 0;
    this.looks = [];
    this.parts = new Map();
    this.sils = new Map();
    this.orders = new Map();
    this.orderKey = '';
    this.spent = 0; // ms baked this frame
    this.bakeMs = 0; // ms baked since the camera last changed
    this.bakes = 0;
    this.warmAt = 0; // how far warm() has got through every look's first facings
    this.X = new Float64Array(6);
    this.Y = new Float64Array(6);
    this.o = { phi: 0, sp: 1, cp: 0, ppu: 1, ss: SS }; // the body's parts
    this.oH = { phi: 0, sp: 1, cp: 0, ppu: 1, ss: SS }; // the head
    this.one = [null];
  }

  /** Fetch and decode the texture (in a browser; anywhere else the stick figures stay). */
  load() {
    if (this.state !== 'idle') return;
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      this.state = 'failed';
      return;
    }
    this.state = 'loading';
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        this.tex = new Texture(c.width, c.height, g.getImageData(0, 0, c.width, c.height).data);
        this.state = 'ready';
      } catch (e) {
        console.warn('Zombie models: the texture could not be read, so the stick figures stay.', e);
        this.state = 'failed';
      }
    };
    img.onerror = () => {
      this.state = 'failed';
    };
    img.src = new URL('../../assets/zombies/zombies.png', import.meta.url).href;
  }

  /**
   * Keep the sprites in step with the camera (once a frame, before drawing). lean and headTilt:
   * degrees the zombies and their heads lean toward the camera. Returns true when the horde can be
   * drawn with the models this frame. t: seconds, any clock.
   */
  sync(v, dpr, t = now() / 1000, lean = 0, headTilt = 0) {
    if (this.state === 'idle') this.load();
    if (this.state !== 'ready') return false;
    this.spent = 0;
    const ppu = Math.min(SCALE * v.scale * dpr, MAX_PPU);
    const [pb, ph] = tiltPitches(v.pitch, lean * DEG, headTilt * DEG);
    const same = (c) => c && Math.abs(c.pb - pb) < 1e-4 && Math.abs(c.ph - ph) < 1e-4 && Math.abs(c.ppu / ppu - 1) < 0.01;
    if (same(this.cam)) {
      this.want = null;
      return true;
    }
    if (this.cam) {
      // A new camera: wait until it holds still, drawing with the sprites there are.
      if (!same(this.want)) {
        this.want = { pb, ph, ppu };
        this.wantT = t;
        return true;
      }
      if (t - this.wantT < SETTLE) return true;
    }
    this.want = null;
    const c = (this.cam = { pitch: v.pitch, pb, ph, ppu, sp: Math.sin(pb), cp: Math.cos(pb), spH: Math.sin(ph), cpH: Math.cos(ph) });
    Object.assign(this.o, { sp: c.sp, cp: c.cp, ppu });
    Object.assign(this.oH, { sp: c.spH, cp: c.cpH, ppu });
    this.atlas.clear();
    this.looks.length = 0;
    this.parts.clear();
    this.sils.clear();
    const okey = `${pb} ${ph}`;
    if (this.orderKey !== okey) {
      this.orders.clear();
      this.orderKey = okey;
    }
    this.bakeMs = 0;
    this.bakes = 0;
    this.warmAt = 0;
    return true;
  }

  _part(key, shape, m, shift, poses, head = false) {
    let p = this.parts.get(key);
    if (!p) {
      let sil = this.sils.get(shape);
      if (!sil) {
        sil = new Array(DIRS * poses.length);
        this.sils.set(shape, sil);
      }
      p = new Part(m, shift, poses, sil, head);
      this.parts.set(key, p);
    }
    return p;
  }

  /** A look: its parts and draw orders (their sprites come as they're wanted). */
  look(i) {
    let L = this.looks[i];
    if (L) return L;
    const lk = LOOKS[i] || LOOKS[0];
    const body = BODIES[lk.body];
    const head = HEADS[lk.head];
    const shift = BLOCKS[lk.block];
    const okey = `${lk.body} ${lk.head}`;
    let order = this.orders.get(okey);
    if (!order) {
      order = new Array(DIRS);
      this.orders.set(okey, order);
    }
    L = this.looks[i] = {
      look: lk,
      body,
      headDef: head,
      head: this._part(`head ${lk.head} ${lk.block}`, `head ${lk.head}`, mesh(head.mesh), shift, STILL, true),
      torso: this._part(`torso ${lk.body} ${lk.block}`, `torso ${lk.body}`, mesh(body.torso), shift, STILL),
      arm: this._part(`arm ${lk.body} ${lk.block}`, `arm ${lk.body}`, mesh(body.arm), shift, ARM_PITCH),
      foot: this._part(`foot ${lk.block}`, 'foot', mesh(FOOT), shift, STILL),
      order,
      corpse: null,
    };
    return L;
  }

  /** Bake a part's sprite for facing d and pose p (and its shape's silhouette, if that's new). */
  _bake(part, d, p) {
    const t0 = now();
    const o = part.head ? this.oH : this.o;
    o.phi = d * STEP;
    part.item.pitch = part.poses[p];
    this.one[0] = part.item;
    const s = bake(this.one, this.tex, o);
    const i = d * part.n + p;
    const e = this.atlas.add(s);
    if (!part.sil[i]) part.sil[i] = this.atlas.add(s, true);
    e.k = part.sil[i];
    part.s[i] = e;
    const ms = now() - t0;
    this.spent += ms;
    this.bakeMs += ms;
    this.bakes++;
  }

  /** Has everything a zombie of look L needs at facing d with these arm poses been baked? */
  _has(L, d, iL, iR) {
    return !!(L.order[d] && L.head.s[d] && L.torso.s[d] && L.foot.s[d] && L.arm.s[d * NP + iL] && L.arm.s[d * NP + iR]);
  }

  /** Bake what's missing for facing d while the frame's budget lasts (or regardless, when forced). */
  _fill(L, d, iL, iR, force) {
    const go = () => force || this.spent < this.budget;
    if (!L.order[d]) {
      if (!go()) return false;
      const t0 = now();
      L.order[d] = orderFor(L.body, L.headDef, this.tex, this.o, this.oH, d);
      const ms = now() - t0;
      this.spent += ms;
      this.bakeMs += ms;
    }
    const need = [L.head, 0, L.torso, 0, L.foot, 0, L.arm, iL, L.arm, iR];
    for (let k = 0; k < need.length; k += 2) {
      const part = need[k];
      const p = need[k + 1];
      if (part.s[d * part.n + p]) continue;
      if (!go()) {
        this.atlas.flush();
        return false;
      }
      this._bake(part, d, p);
    }
    this.atlas.flush();
    return true;
  }

  /** The facing to draw a zombie of look L with: d if it can be had this frame, else the nearest baked one. */
  _dir(L, d, iL, iR) {
    if (this._has(L, d, iL, iR) || this._fill(L, d, iL, iR, false)) return d;
    for (let k = 1; k <= DIRS / 2; k++) {
      const a = (d + k) % DIRS;
      if (this._has(L, a, iL, iR)) return a;
      const b = (d - k + DIRS) % DIRS;
      if (this._has(L, b, iL, iR)) return b;
    }
    this._fill(L, d, iL, iR, true); // the look's first sprites: no waiting
    return d;
  }

  /**
   * After the frame's zombies are drawn: spend what's left of its budget getting the looks'
   * first facings ready (WARM_DIRS), one facing of every look before the next facing of any.
   */
  warm() {
    if (!this.cam) return;
    const n = LOOKS.length;
    while (this.warmAt < n * WARM_DIRS.length && this.spent < this.budget) {
      const L = this.look(this.warmAt % n);
      const d = WARM_DIRS[(this.warmAt / n) | 0];
      if (!this._has(L, d, WARM_POSES[0], WARM_POSES[1]) && !this._fill(L, d, WARM_POSES[0], WARM_POSES[1], false)) break;
      this.warmAt++;
    }
  }

  /** The look's body lying on its back, arms flung up, seen from straight above: a ground decal with its head toward -x. */
  corpse(i) {
    const L = this.look(i);
    if (L.corpse) return L.corpse;
    const t0 = now();
    const lk = L.look;
    const body = L.body;
    const shift = BLOCKS[lk.block];
    const items = [
      { mesh: mesh(FOOT), shift, at: body.feet[0] },
      { mesh: mesh(FOOT), shift, at: body.feet[1] },
      { mesh: mesh(body.torso), shift },
      { mesh: mesh(body.arm), shift, at: body.shoulders[0], yaw: -0.8, pitch: 1.45 },
      { mesh: mesh(body.arm), shift, at: body.shoulders[1], yaw: 0.8, pitch: 1.45 },
      { mesh: mesh(L.headDef.mesh), shift, at: [0, 0, body.neck] },
    ];
    // Facing screen right and tipped onto its back, its head ends up on the left.
    const s = bake(items, this.tex, { phi: 0, sp: 1, cp: 0, ppu: this.cam.ppu, ss: SS, lie: Math.PI / 2, ambient: 0.52, diffuse: 0.4 });
    const e = this.atlas.add(s);
    e.cx = s.w / 2; // the middle of the body, between its feet and the top of its head and hands
    e.cy = s.oy;
    L.corpse = e;
    this.atlas.flush();
    const ms = now() - t0;
    this.spent += ms;
    this.bakeMs += ms;
    return e;
  }

  /** Draw a common at brightness b (ctx at the device-pixel scale, CSS px coordinates). */
  drawZombie(R, z, b) {
    const L = this.look(z.look ?? 0);
    const { ctx, v } = R;
    const t = R.t;
    const st = z.stagger > 0;
    const chasing = z.state === 'chase' && z.alertDelay <= 0;
    // The arms, in key poses (they are baked, so they change pose the way drawn frames do): low
    // while it shambles, reaching while it hunts, raised, up and down on you for a swing, flailing
    // when it's hit. Their smaller motions are bobs.
    let iL = 1;
    let iR = 1;
    let lean = chasing ? 12 : 3; // hunched toward what it wants
    if (st) {
      lean = -16;
      const fl = Math.sin(t * 12 + z.id) > 0;
      iL = fl ? 4 : 3;
      iR = fl ? 3 : 4;
    } else if (z.windup > 0) {
      const w = 1 - z.windup / 0.3; // 0 -> 1 as the blow lands
      iL = iR = w < 0.35 ? 3 : w < 0.7 ? 4 : 1;
      lean += w < 0.7 ? -4 : 10;
    } else if (chasing) {
      iL = iR = 2;
    }
    let f = z.face;
    if (st) f += Math.sin(t * 30 + z.id) * 0.35;
    let d = Math.round((f - v.yaw) / STEP) % DIRS;
    if (d < 0) d += DIRS;
    d = this._dir(L, d, iL, iR);
    // Parts are placed for the facing the sprites show, so they stay joined.
    const fq = v.yaw + d * STEP;
    const ca = Math.cos(fq);
    const sa = Math.sin(fq);
    const S = SCALE;
    const spd = Math.min(1, Math.hypot(z.vx, z.vy) / (chasing ? 90 : 26));
    const ph = z.anim * (chasing ? 13 : 4.5);
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);
    // The rest of the pose, in model units.
    const stride = (chasing ? 46 : 30) * spd;
    const lift = (chasing ? 26 : 14) * spd;
    const bob = Math.abs(cs) * (chasing ? 12 : 8) * spd;
    const sway = cs * (chasing ? 6 : 9) * spd + Math.sin(z.anim * 1.9 + z.id) * 4;
    const nod = Math.sin(z.anim * 2.6 + z.id * 0.7) * 5;
    const body = L.body;
    const fL = body.feet[0];
    const fR = body.feet[1];
    const sL = body.shoulders[0];
    const sR = body.shoulders[1];
    const X = this.X;
    const Y = this.Y;
    // Parts are placed in the leaning body's frame: on screen, the same as seen from its lower camera.
    const X0 = v.px(z.x, z.y);
    const Y0 = v.py(z.x, z.y, 0);
    const k = S * v.scale;
    const spB = this.cam.sp;
    const cpB = this.cam.cp;
    const ex = v.cy; // screen right, on the ground
    const ey = v.sy;
    const put = (i, a, c, h) => {
      const wx = ca * a - sa * c;
      const wy = sa * a + ca * c;
      X[i] = X0 + k * (wx * ex + wy * ey);
      Y[i] = Y0 + k * ((wy * ex - wx * ey) * spB - h * cpB);
    };
    put(FOOT_L, fL[0] + sn * stride, fL[1], cs > 0 ? cs * lift : 0);
    put(FOOT_R, fR[0] - sn * stride, fR[1], cs < 0 ? -cs * lift : 0);
    put(TORSO, lean * 0.3, sway * 0.5, bob);
    const reach = chasing ? 6 : 0;
    const swing = st || z.windup > 0 ? 0 : chasing ? sn * 9 : Math.sin(z.anim * 2.3 + z.id * 1.7) * 7;
    put(ARM_L, sL[0] + lean * 0.5 + reach, sL[1] + sway * 0.5, sL[2] + bob + swing);
    put(ARM_R, sR[0] + lean * 0.5 + reach, sR[1] + sway * 0.5, sR[2] + bob - swing);
    put(HEAD, lean, sway, body.neck + bob * 1.15 + nod - (chasing ? 5 : 0));

    const order = L.order[d];
    const at = (iL * NP + iR) * 6;
    // Sprites go down one to one on whole device pixels (no resampling, the cheapest draw there is),
    // unless the camera has just changed and they're waiting to be baked again: then they're scaled.
    const dpr = R.dpr;
    const exact = Math.abs(this.cam.ppu - S * v.scale * dpr) < 1e-9;
    const F = exact ? 1 / dpr : (S * v.scale) / this.cam.ppu; // CSS px per sprite px
    const dark = b < 0.95 ? 1 - Math.max(0, b) : 0;
    const flash = z.hitFlash > 0;
    for (let pass = 0; pass < (flash ? 2 : 1); pass++) {
      if (pass) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
      }
      for (let k = 0; k < 6; k++) {
        const i = order[at + k];
        const s = i === HEAD ? L.head.s[d] : i === TORSO ? L.torso.s[d] : i <= FOOT_R ? L.foot.s[d] : L.arm.s[d * NP + (i === ARM_L ? iL : iR)];
        const dx = exact ? Math.round(X[i] * dpr - s.ox) * F : X[i] - s.ox * F;
        const dy = exact ? Math.round(Y[i] * dpr - s.oy) * F : Y[i] - s.oy * F;
        const dw = s.w * F;
        const dh = s.h * F;
        ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
        if (dark && !pass) {
          const k2 = s.k;
          ctx.globalAlpha = dark;
          ctx.drawImage(k2.canvas, k2.x, k2.y, s.w, s.h, dx, dy, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
    }
    if (flash) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The dead with a look, as decals on the ground (under the night, like the rest of the
   * ground). list: corpses with .look. Leaves the canvas on the ground transform.
   */
  drawCorpses(ctx, R, list) {
    const v = R.v;
    const dpr = R.dpr;
    const A = dpr * v.ax;
    const B = dpr * v.bx;
    const C = dpr * v.ay;
    const D = dpr * v.by;
    const E = dpr * v.ox;
    const G = dpr * v.oy;
    for (const c of list) {
      const s = this.corpse(c.look);
      const k = SCALE / this.cam.ppu; // world units per sprite px
      // Head toward where it was thrown (the sprite has it on the left).
      const th = c.ang + Math.PI;
      const co = Math.cos(th) * k;
      const si = Math.sin(th) * k;
      const fl = c.flip || 1;
      ctx.globalAlpha = c.t > 48 ? Math.max(0, (50 - c.t) / 2) : 1;
      ctx.setTransform(A * co + C * si, B * co + D * si, fl * (C * co - A * si), fl * (D * co - B * si), A * c.x + C * c.y + E, B * c.x + D * c.y + G);
      ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h, -s.cx, -s.cy, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    v.applyGround(ctx, dpr, 0);
  }

  /**
   * The outline of a zombie seen through a wall, as the leaning model stands (subpaths, in CSS
   * px): body() a line to stroke, head() a disc to fill.
   */
  ghostBody(ctx, v, z) {
    const x = v.px(z.x, z.y);
    const y = v.py(z.x, z.y, 0);
    const k = (z.r / 11) * v.scale * (this.cam ? this.cam.cp : v.cp);
    ctx.moveTo(x, y - GHOST.body0 * k);
    ctx.lineTo(x, y - GHOST.body1 * k);
  }

  ghostHead(ctx, v, z) {
    const x = v.px(z.x, z.y);
    const y = v.py(z.x, z.y, 0) - (z.r / 11) * v.scale * (this.cam ? this.cam.cp : v.cp) * GHOST.head;
    const r = (z.r / 11) * v.scale * GHOST.headR;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }

  /** For the debug read-out. */
  stats() {
    return { pages: this.atlas.pages.length, px: this.atlas.px, ms: Math.round(this.bakeMs), bakes: this.bakes, looks: this.looks.filter(Boolean).length };
  }
}
