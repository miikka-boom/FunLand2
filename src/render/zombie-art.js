// The horde in the artist's 3D models (assets/zombies/, built by tools/zombies/).
//
// Each part of a look (its head, torso, arm and foot, in its colours) is drawn from sprites baked
// for the camera by zombie-bake.js: one per facing (32 of them), for the arm one per facing and
// pose, for the head one per facing and look in its googly eyes. Every frame a zombie is put
// together from them, posed (feet stepping, body bobbing and swaying, arms hanging, reaching,
// raised for a swing or thrown up when it's hit, head nodding), and drawn part by part from the
// farthest to the nearest. Which part is in front of which depends on how it's turned and on its
// arms, so that order is worked out per facing and arm pose from where the parts really overlap
// (orderFor).
//
// The head has a mind of its own: a shambler's looks about, a hunter's turns to what it wants
// before its body does, and the eyes in it roll: toward you, drooping while it shuffles, blinking
// now and then, rolled up when it's hit, crossed while it reels. The pupils' poses are baked too,
// only for the facings where the eyes show.
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
// silhouette only depends on the shape, so all the colours of a part share theirs. At night most
// of a horde stands where no light reaches, all at the same brightness, so every sprite also
// gets a copy darkened to it: those zombies are six draws, not twelve.
//
// Lean: a steep camera would mostly see the tops of their heads, so the zombies lean toward the
// camera, pivoting at their feet (the body's parts are baked and placed as if the camera were
// lower: tiltPitches), and their heads tip further toward it about the neck, whichever way they
// face. The draw order is worked out for the same angles.
//
// Blood: a zombie that's been shot has it on its shirt (its torso has a second set of sprites,
// bloodied). The dead fall: a few frames of the body going over (16 facings, baked as deaths
// happen), then a decal of the model on the ground, bloodied, lying one of several ways (DEATHS:
// on its back with its arms flung up or out, on its face, on its side). A big enough hit takes
// the head off: it flies, tumbling, bounces (effects.js) and lies by the body.

import { BODIES, FOOT, HEADS, BLOCKS } from '../../assets/zombies/meshes.js';
import { decodeMesh, Texture, bake, overlap, RIM_COLOUR } from './zombie-bake.js';
import { LOOKS } from '../game/zombie-looks.js';
import { TAU } from '../util.js';

export const DIRS = 32;
const STEP = TAU / DIRS;
/** The arm poses baked, radians up from straight ahead: hanging, low, reaching, raised, up. */
export const ARM_PITCH = [-0.5, -0.25, 0, 0.35, 0.75];
const NP = ARM_PITCH.length;
const STILL = [0];
const P = 14; // how far a pupil rolls, model units (an eye's white is about 43 across its middle)
/** The googly eyes' poses: where the pupils are (left eye, right eye: across and up, model units) and how shut the eyes are. */
export const EYES = [
  { name: 'ahead', pupils: [[0, -3], [0, -3]], shut: 0 },
  { name: 'left', pupils: [[-P, -4], [-P, -4]], shut: 0 },
  { name: 'right', pupils: [[P, -4], [P, -4]], shut: 0 },
  { name: 'up', pupils: [[0, P], [0, P]], shut: 0 },
  { name: 'down', pupils: [[0, -P], [0, -P]], shut: 0 },
  { name: 'shut', pupils: [[0, -3], [0, -3]], shut: 1 },
  { name: 'crossed', pupils: [[-0.7 * P, 0.7 * P], [0.7 * P, -0.7 * P]], shut: 0 },
];
export const EYE = Object.fromEntries(EYES.map((e, i) => [e.name, i]));
const NE = EYES.length;
/** World units per model unit: a model zombie's head is about as wide as its body circle (radius 10 to 12). */
export const SCALE = 0.1;
const SS = 2; // samples per pixel each way when baking
const MAX_PPU = 0.9; // px per model unit at most (a huge screen zoomed right in draws its sprites scaled up instead)
const PAGE = 1024;
const SETTLE = 0.25; // s a new camera has to hold before the bakes start over
const BUDGET = 4; // ms of baking per frame, once a look has its first sprites
// ...and for one zombie a frame at most: every batch of new sprites is an upload that makes the
// browser copy an atlas page, so the rest borrow a near facing for a frame or two.
const FILLS = 1;
// Facings every look gets ready ahead of need (toward the camera, away, sideways), with the arm
// poses of a shambler and a hunter, so a look's first zombie on screen borrows a near facing
// instead of baking everything at once.
const WARM_DIRS = [8, 24, 0, 16];
const WARM_POSES = [1, 2];
const ORDER_PPU = 0.08; // px per model unit for the small bakes that work out the draw order
/** How long the dead take to fall (s), the frames of it (how far over, of the way down), and the facings those are baked for. */
export const FALL_T = 0.32;
const FALL_F = [0.32, 0.6, 0.83];
const FALL_DIRS = 16;
const FALL_STARTS = 2; // deaths a frame whose fall may be baked past the budget (a shotgun blast drops several)
const LAND_WAIT = 0.25; // s a body that has landed may hold its last frame while its decal is baked within the budget
const FALL_KEEP = 96; // fall frames kept for the next death to use (each is wanted for a tenth of a second)
// In the dark the rim light stays: what's left of its daylight strength in the darkened copies.
const NIGHT_RIM = 1;
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
const QUARTER = Math.PI / 2;
/**
 * The ways the dead lie (and fall): lie, tipped back onto its back (QUARTER) or forward onto its
 * face (-QUARTER); roll, onto its left side (QUARTER) or its right (-QUARTER); arms, where they end
 * up, [yaw, pitch] for the left and the right (yaw: radians out to its right; pitch: up from
 * straight ahead, toward its head); head, how far its head is turned; eye, its eyes; face, which
 * way it faces, from the way the blow threw it (its head goes that way); w, how often. The arms
 * are long, so they go up past the head or out to the sides, never down by them. On its side,
 * the arms' pitch fans them out on the ground (their yaw only tips them up or down).
 */
export const DEATHS = [
  { name: 'back', lie: QUARTER, arms: [[-0.8, 1.45], [0.8, 1.45]], head: 0, eye: 'up', face: Math.PI, w: 2.5 },
  { name: 'back, left arm out', lie: QUARTER, arms: [[-1.5, 0.1], [0.4, 1.35]], head: 0.5, eye: 'crossed', face: Math.PI, w: 2 },
  { name: 'back, right arm out', lie: QUARTER, arms: [[-0.4, 1.35], [1.5, 0.1]], head: -0.5, eye: 'up', face: Math.PI, w: 2 },
  { name: 'back, arms out', lie: QUARTER, arms: [[-1.4, 0.15], [1.4, 0.15]], head: 0.3, eye: 'shut', face: Math.PI, w: 1.5 },
  { name: 'face down, reaching', lie: -QUARTER, arms: [[-0.45, 1.5], [0.45, 1.5]], head: 0, eye: 'shut', face: 0, w: 2 },
  { name: 'face down, an arm out', lie: -QUARTER, arms: [[-1.45, 0.05], [0.3, 1.45]], head: -0.6, eye: 'shut', face: 0, w: 1.5 },
  { name: 'left side', roll: QUARTER, arms: [[0, -0.15], [-0.2, 0.5]], head: 0.2, eye: 'crossed', face: QUARTER, w: 1.5 },
  { name: 'right side', roll: -QUARTER, arms: [[0.2, 0.5], [0, -0.15]], head: -0.2, eye: 'shut', face: -QUARTER, w: 1.5 },
];
const DEATH_W = DEATHS.reduce((sum, d) => sum + d.w, 0);

/** A way to lie (an index into DEATHS), by weight (r: a number in [0, 1)). */
export function pickDeath(r) {
  let x = r * DEATH_W;
  for (let i = 0; i < DEATHS.length; i++) {
    x -= DEATHS[i].w;
    if (x < 0) return i;
  }
  return DEATHS.length - 1;
}

// How the dead on the ground are shaded: a little darker, no rim light (it's lit from the camera).
const DECAL_SHADE = { dark: 0.66, lit: 0.9, rim: 0 };

/**
 * Blood on a torso (torso: its mesh), as splats [a, c, h, r] in its own axes: level 0, where a
 * wounded one was shot, low on its front and back and on a side, the parts of it that show below
 * its big head; 1, the dead, shot more (its chest, both sides); 2, that and its neck, headless.
 * mirror: on the other side (every other colour block, so not every wound is on the same side).
 */
export function wounds(torso, level, mirror = false) {
  const [a0, c0, h0, a1, c1, h1] = torso.box;
  const w = c1 - c0;
  const H = h1 - h0;
  const D = a1 - a0;
  const m = mirror ? -1 : 1;
  const out = [
    [a1 - 6, m * 0.12 * w, h0 + 0.42 * H, 0.27 * w], // in the belly
    [a0 + 6, -m * 0.15 * w, h0 + 0.48 * H, 0.24 * w], // and out of the back
    [a0 + 0.55 * D, mirror ? c1 - 6 : c0 + 6, h0 + 0.45 * H, 0.2 * w], // its side
  ];
  if (level >= 1) {
    out.push([a1 - 6, m * 0.2 * w, h0 + 0.7 * H, 0.2 * w]); // the chest
    out.push([a0 + 0.45 * D, mirror ? c0 + 6 : c1 - 6, h0 + 0.6 * H, 0.16 * w]); // the other side
  }
  if (level >= 2) {
    // The neck: its stump, and running down the throat and the nape (which show on a body lying
    // on its back or its face; the stump itself is edge-on from above).
    out.push([(a0 + a1) / 2, 0, h1 - 4, 0.3 * w]);
    out.push([a1 - 8, 0, h1 - 12, 0.22 * w]);
    out.push([a0 + 8, 0, h1 - 12, 0.2 * w]);
  }
  return out;
}

/**
 * The camera tilts the zombies' bodies and heads are drawn for (radians above the horizon), for a
 * camera at `pitch` and a lean and head tilt toward it (radians).
 */
export function tiltPitches(pitch, lean, headTilt) {
  const body = Math.max(pitch - lean, Math.min(pitch, MIN_BODY));
  const head = Math.max(body - headTilt, Math.min(body, MIN_HEAD));
  return [body, head];
}

const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

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
 * put(..., k, rim): the sprite's colours times k (1 as baked, 0 its black silhouette, between:
 * dimmed, keeping a moonlit rim where the sprite's rim light was).
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
    put(rgba, sw, sh, x, y, k = 1, rim = null) {
      const d = img.data;
      const moon = rim && k > 0 && k < 1 ? ((1 - k) * NIGHT_RIM) / 255 : 0;
      for (let j = 0; j < sh; j++) {
        let o = ((y + j) * w + x) * 4;
        let q = j * sw * 4;
        let r = j * sw;
        for (let i = 0; i < sw; i++, o += 4, q += 4, r++) {
          const m = moon ? rim[r] * moon : 0;
          d[o] = rgba[q] * k + RIM_COLOUR[0] * m;
          d[o + 1] = rgba[q + 1] * k + RIM_COLOUR[1] * m;
          d[o + 2] = rgba[q + 2] * k + RIM_COLOUR[2] * m;
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

  /** A baked sprite, its colours times k (0: its black silhouette) -> { canvas, x, y, w, h, ox, oy }. */
  add(s, k = 1) {
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
    this.cur.put(s.rgba, w, h, x, y, k, s.rim);
    this.x += w + 1;
    if (h > this.row) this.row = h;
    this.px += w * h;
    return { canvas: this.cur.canvas, x, y, w, h, ox: s.ox, oy: s.oy, k: null, dk: null };
  }

  /** Upload what's been added since the last flush. */
  flush() {
    if (this.cur) this.cur.flush();
  }
}

/**
 * A part in one colour block: its sprites by facing and variant (an arm's poses, a head's eyes, a
 * torso clean or bloodied), baked when first wanted. Silhouettes are shared by every colour of
 * the shape; a head's are the same whatever its eyes do and a torso's whatever blood is on it, so
 * those keep one per facing.
 */
class Part {
  constructor(kind, m, shift, variants, sil, eyes) {
    this.kind = kind; // 'head' (its variants are eyes; baked at the head's tilt), 'torso' (blood), 'arm' (pitch), 'foot'
    this.head = kind === 'head';
    this.one = kind === 'head' || kind === 'torso'; // one silhouette per facing, whatever the variant
    this.item = { mesh: m, shift, pitch: 0, eye: null, eyes, blood: null };
    this.variants = variants;
    this.n = variants.length;
    this.s = new Array(DIRS * this.n);
    this.sil = sil;
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
    this.atlas = new Atlas(this.makePage); // the parts of the standing
    this.deadAtlas = new Atlas(this.makePage); // the dead on the ground (fall frames have canvases of their own: _fallEntry)
    this.fallKeys = []; // the fall frames kept, oldest first: [map, key, map, key, ...]
    this.tex = opts.texture || null;
    this.state = this.tex ? 'ready' : 'idle'; // 'loading' | 'ready' | 'failed'
    this.budget = opts.budget ?? BUDGET;
    this.cam = null; // what the sprites are baked for: { pitch, pb, ph, ppu, sp, cp, spH, cpH, b0 }
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
    this._yaw = 0;
    this.fallStarts = 0;
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
   * degrees the zombies and their heads lean toward the camera; b0: how bright it is where no
   * light reaches (1 by day). Returns true when the horde can be drawn with the models this
   * frame. t: seconds, any clock.
   */
  sync(v, dpr, t = now() / 1000, lean = 0, headTilt = 0, b0 = 1) {
    if (this.state === 'idle') this.load();
    if (this.state !== 'ready') return false;
    this.spent = 0;
    this.fills = 0;
    this.fallStarts = 0;
    this._yaw = v.yaw;
    const ppu = Math.min(SCALE * v.scale * dpr, MAX_PPU);
    const [pb, ph] = tiltPitches(v.pitch, lean * DEG, headTilt * DEG);
    const dim = Math.round(Math.min(1, b0) * 200) / 200;
    const same = (c) => c && Math.abs(c.pb - pb) < 1e-4 && Math.abs(c.ph - ph) < 1e-4 && Math.abs(c.ppu / ppu - 1) < 0.01 && c.b0 === dim;
    if (same(this.cam)) {
      this.want = null;
      return true;
    }
    if (this.cam) {
      // A new camera: wait until it holds still, drawing with the sprites there are.
      if (!same(this.want)) {
        this.want = { pb, ph, ppu, b0: dim };
        this.wantT = t;
        return true;
      }
      if (t - this.wantT < SETTLE) return true;
    }
    this.want = null;
    const c = (this.cam = { pitch: v.pitch, pb, ph, ppu, sp: Math.sin(pb), cp: Math.cos(pb), spH: Math.sin(ph), cpH: Math.cos(ph), b0: dim });
    Object.assign(this.o, { sp: c.sp, cp: c.cp, ppu });
    Object.assign(this.oH, { sp: c.spH, cp: c.cpH, ppu });
    this.atlas.clear();
    this.deadAtlas.clear();
    this.fallKeys.length = 0;
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

  _part(key, shape, kind, m, shift, variants, eyes = null) {
    let p = this.parts.get(key);
    if (!p) {
      let sil = this.sils.get(shape);
      if (!sil) {
        sil = new Array(DIRS * (kind === 'head' || kind === 'torso' ? 1 : variants.length));
        this.sils.set(shape, sil);
      }
      p = new Part(kind, m, shift, variants, sil, eyes);
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
    const mirror = (lk.block.charCodeAt(0) - 65) % 2 === 1; // B and D have their wounds on the other side
    L = this.looks[i] = {
      look: lk,
      body,
      headDef: head,
      head: this._part(`head ${lk.head} ${lk.block}`, `head ${lk.head}`, 'head', mesh(head.mesh), shift, EYES, head.eyes),
      // Clean, and bloodied once it's been shot.
      torso: this._part(`torso ${lk.body} ${lk.block}`, `torso ${lk.body}`, 'torso', mesh(body.torso), shift, [null, wounds(body.torso, 0, mirror)]),
      arm: this._part(`arm ${lk.body} ${lk.block}`, `arm ${lk.body}`, 'arm', mesh(body.arm), shift, ARM_PITCH),
      foot: this._part(`foot ${lk.block}`, 'foot', 'foot', mesh(FOOT), shift, STILL),
      blood: [wounds(body.torso, 1, mirror), wounds(body.torso, 2, mirror)], // on the dead: with a head, without
      order,
      fall: new Map(), // falling frames: `${pose} ${facing} ${frame} ${headless}` -> sprite
      dead: new Map(), // lying on the ground: `${pose} ${headless}` -> decal
      headDecal: null,
    };
    return L;
  }

  /** Put a baked sprite in the atlas with what darkening it needs: sil, its silhouette if shared already. */
  _entry(s, sil) {
    const e = this.atlas.add(s);
    e.k = sil || this.atlas.add(s, 0);
    if (this.cam.b0 < 0.95) e.dk = this.atlas.add(s, this.cam.b0);
    return e;
  }

  /**
   * A fall frame, with its silhouette and (at night) its darkened copy beside it, on a canvas of
   * its own rather than in the atlas: it's wanted for a tenth of a second, and kept only until
   * FALL_KEEP newer ones have been baked, so a long fight doesn't fill the atlas with them (every
   * page the horde's sprites are spread over makes drawing them slower).
   */
  _fallEntry(s) {
    const night = this.cam.b0 < 0.95;
    const w = s.w;
    const pg = this.makePage(night ? 3 * w + 2 : 2 * w + 1, s.h);
    pg.put(s.rgba, w, s.h, 0, 0, 1, s.rim);
    pg.put(s.rgba, w, s.h, w + 1, 0, 0, s.rim);
    if (night) pg.put(s.rgba, w, s.h, 2 * w + 2, 0, this.cam.b0, s.rim);
    pg.seal();
    const c = pg.canvas;
    return { canvas: c, x: 0, y: 0, w, h: s.h, ox: s.ox, oy: s.oy, k: { canvas: c, x: w + 1, y: 0 }, dk: night ? { canvas: c, x: 2 * w + 2, y: 0 } : null };
  }

  _time(t0) {
    const ms = now() - t0;
    this.spent += ms;
    this.bakeMs += ms;
  }

  /** Bake a part's sprite for facing d and variant v (and its shape's silhouette, if that's new). */
  _bake(part, d, v) {
    const t0 = now();
    const o = part.head ? this.oH : this.o;
    o.phi = d * STEP;
    const va = part.variants[v];
    if (part.kind === 'head') part.item.eye = va;
    else if (part.kind === 'torso') part.item.blood = va;
    else part.item.pitch = va;
    this.one[0] = part.item;
    const s = bake(this.one, this.tex, o);
    const si = part.one ? d : d * part.n + v;
    const e = this._entry(s, part.sil[si]);
    if (!part.sil[si]) part.sil[si] = e.k;
    part.s[d * part.n + v] = e;
    this.bakes++;
    this._time(t0);
  }

  _go(force) {
    return force || this.spent < this.budget;
  }

  /** May a zombie have new sprites baked this frame? (One a frame, within the budget.) */
  _may() {
    return this.fills < FILLS && this.spent < this.budget;
  }

  /** Is the body (draw order, clean torso, feet, these arm poses) ready at facing d? */
  _body(L, d, iL, iR) {
    return !!(L.order[d] && L.torso.s[d * L.torso.n] && L.foot.s[d] && L.arm.s[d * NP + iL] && L.arm.s[d * NP + iR]);
  }

  /** Bake what the body lacks at facing d while the frame's budget lasts (or regardless, when forced). */
  _fillBody(L, d, iL, iR, force) {
    if (!force) {
      if (!this._may()) return false;
      this.fills++;
    }
    let ok = true;
    if (!L.order[d]) {
      if (this._go(force)) {
        const t0 = now();
        L.order[d] = orderFor(L.body, L.headDef, this.tex, this.o, this.oH, d);
        this._time(t0);
      } else ok = false;
    }
    const need = [L.torso, 0, L.foot, 0, L.arm, iL, L.arm, iR];
    for (let k = 0; ok && k < need.length; k += 2) {
      const part = need[k];
      const v = need[k + 1];
      if (part.s[d * part.n + v]) continue;
      if (!this._go(force)) ok = false;
      else this._bake(part, d, v);
    }
    this.atlas.flush();
    return ok;
  }

  _fillHead(L, d, e, force) {
    if (L.head.s[d * NE + e]) return true;
    if (!force) {
      if (!this._may()) return false;
      this.fills++;
    }
    this._bake(L.head, d, e);
    this.atlas.flush();
    return true;
  }

  /**
   * The facings, eyes and shirt to draw a zombie of look L with: what it wants if that can be had
   * this frame, else the nearest that is baked (the body first, then the head: its own facing
   * with its eyes ahead, or the body's; then the blood on its shirt, w: 1 wanted, or a clean
   * shirt for a frame or two).
   */
  _pick(L, d, dh, e, iL, iR, w, out) {
    let bd = d;
    if (!this._body(L, d, iL, iR) && !this._fillBody(L, d, iL, iR, false)) {
      bd = -1;
      for (let k = 1; k <= DIRS / 2 && bd < 0; k++) {
        if (this._body(L, (d + k) % DIRS, iL, iR)) bd = (d + k) % DIRS;
        else if (this._body(L, (d - k + DIRS) % DIRS, iL, iR)) bd = (d - k + DIRS) % DIRS;
      }
      if (bd < 0) {
        this._fillBody(L, d, iL, iR, true); // the look's first sprites: no waiting
        bd = d;
      }
    }
    let hd = (((dh + bd - d) % DIRS) + DIRS) % DIRS;
    if (!this._fillHead(L, hd, e, false)) {
      if (L.head.s[hd * NE]) e = 0;
      else if (L.head.s[bd * NE + e]) hd = bd;
      else {
        hd = bd;
        e = 0;
        this._fillHead(L, hd, 0, true);
      }
    }
    let tw = 0;
    if (w) {
      if (L.torso.s[bd * L.torso.n + 1]) tw = 1;
      else if (this._may()) {
        this.fills++;
        this._bake(L.torso, bd, 1);
        this.atlas.flush();
        tw = 1;
      }
    }
    out[0] = bd;
    out[1] = hd;
    out[2] = e;
    out[3] = tw;
    return out;
  }

  /**
   * After the frame's zombies are drawn: spend what's left of its budget getting the looks'
   * first facings ready (WARM_DIRS), one facing of every look before the next facing of any.
   */
  warm() {
    if (!this.cam || this.fills >= FILLS) return;
    const n = LOOKS.length;
    while (this.warmAt < n * WARM_DIRS.length) {
      const L = this.look(this.warmAt % n);
      const d = WARM_DIRS[(this.warmAt / n) | 0];
      if (!this._body(L, d, WARM_POSES[0], WARM_POSES[1]) || !L.head.s[d * NE + EYE.down]) {
        if (this.spent >= this.budget) return;
        // This frame's one batch of new sprites: a look's body and head at one facing.
        this.fills = FILLS;
        this._fillBody(L, d, WARM_POSES[0], WARM_POSES[1], true);
        this._fillHead(L, d, EYE.down, true);
        this.warmAt++;
        return;
      }
      this.warmAt++;
    }
  }

  /** Draw one sprite: as baked, its darkened copy (exactly the brightness asked for), or as baked with its silhouette over it. */
  _draw(ctx, s, dx, dy, dw, dh, b, b0) {
    if (s.dk && Math.abs(b - b0) < 0.012) {
      ctx.drawImage(s.dk.canvas, s.dk.x, s.dk.y, s.w, s.h, dx, dy, dw, dh);
      return;
    }
    ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h, dx, dy, dw, dh);
    if (b < 0.95) {
      ctx.globalAlpha = 1 - Math.max(0, b);
      ctx.drawImage(s.k.canvas, s.k.x, s.k.y, s.w, s.h, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
  }

  /** Where a zombie's eyes look, and whether its head turns from its body: [head turn (radians), eyes]. */
  _gaze(R, z, f, chasing, st, t, out) {
    let turn;
    let e;
    const tgt = this._target(R, z);
    const toward = tgt ? wrap(Math.atan2(tgt.y - z.y, tgt.x - z.x) - f) : 0;
    if (st) {
      turn = Math.sin(t * 20 + z.id) * 0.45; // reeling
      e = Math.sin(t * 9 + z.id) > 0 ? EYE.crossed : EYE.up;
    } else if (z.hitFlash > 0) {
      turn = 0;
      e = EYE.up;
    } else if (tgt && (chasing || z.alertDelay > 0 || z.windup > 0)) {
      // The head turns to what it wants before the body does; the eyes go the rest of the way.
      turn = Math.max(-0.9, Math.min(0.9, toward));
      const rest = toward - turn;
      e = rest > 0.12 ? EYE.right : rest < -0.12 ? EYE.left : EYE.ahead;
    } else {
      // A shambler glances about, holding each look a second or two, its eyes drooping.
      const k = Math.floor(z.anim / 1.7 + z.id * 0.37);
      const r = Math.sin(k * 12.9898 + z.id * 78.233) * 43758.5453;
      turn = (Math.floor((r - Math.floor(r)) * 5) - 2) * STEP * 1.5;
      e = EYE.down;
    }
    // A blink every few seconds.
    if (!st && (z.anim + z.id * 1.37) % 4.3 < 0.13) e = EYE.shut;
    out[0] = turn;
    out[1] = e;
    return out;
  }

  /** The survivor a zombie is after: the nearer of you and the teammate. */
  _target(R, z) {
    const g = R.game;
    if (!g) return null;
    const p = g.player && g.player.alive ? g.player : null;
    const a = g.ally && g.ally.alive && !g.ally.down ? g.ally : null;
    if (!p) return a;
    if (!a) return p;
    return Math.hypot(a.x - z.x, a.y - z.y) < Math.hypot(p.x - z.x, p.y - z.y) ? a : p;
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
    const gz = this._gaze(R, z, f, chasing, st, t, GAZE);
    const rel = (f - v.yaw) / STEP;
    let d = Math.round(rel) % DIRS;
    if (d < 0) d += DIRS;
    let dh = Math.round(rel + gz[0] / STEP) % DIRS;
    if (dh < 0) dh += DIRS;
    // Eyes that face away from the camera don't show: no need for their poses.
    let e = Math.sin(dh * STEP) * this.cam.cpH < -0.12 ? EYE.ahead : gz[1];
    // Blood on its shirt once it's been shot (and bled: a shove or a fire doesn't show).
    const pick = this._pick(L, d, dh, e, iL, iR, z.bloodied ? 1 : 0, PICK);
    d = pick[0];
    dh = pick[1];
    e = pick[2];
    const tw = pick[3];
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
    const b0 = this.cam.b0;
    const flash = z.hitFlash > 0;
    for (let pass = 0; pass < (flash ? 2 : 1); pass++) {
      if (pass) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
      }
      for (let q = 0; q < 6; q++) {
        const i = order[at + q];
        const s = i === HEAD ? L.head.s[dh * NE + e] : i === TORSO ? L.torso.s[d * L.torso.n + tw] : i <= FOOT_R ? L.foot.s[d] : L.arm.s[d * NP + (i === ARM_L ? iL : iR)];
        const dx = exact ? Math.round(X[i] * dpr - s.ox) * F : X[i] - s.ox * F;
        const dy = exact ? Math.round(Y[i] * dpr - s.oy) * F : Y[i] - s.oy * F;
        if (pass) ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h, dx, dy, s.w * F, s.h * F);
        else this._draw(ctx, s, dx, dy, s.w * F, s.h * F, b, b0);
      }
    }
    if (flash) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // --- The dead ----------------------------------------------------------------------------

  /**
   * The items of a look's body going down as DEATHS[p] has it, t of the way (1: lying there; the
   * body's own tip, lie and roll, is the bake's), with its eyes eye, bloodied (headless: without
   * its head, the stump of its neck bloodied too).
   */
  _lying(L, p, t, headless, eye) {
    const P = DEATHS[p];
    const lk = L.look;
    const body = L.body;
    const shift = BLOCKS[lk.block];
    const [[yl, pl], [yr, pr]] = P.arms;
    const items = [
      { mesh: mesh(FOOT), shift, at: body.feet[0] },
      { mesh: mesh(FOOT), shift, at: body.feet[1] },
      { mesh: mesh(body.torso), shift, blood: L.blood[headless ? 1 : 0] },
      // From reaching ahead, as they were, to where they end up.
      { mesh: mesh(body.arm), shift, at: body.shoulders[0], yaw: yl * t, pitch: 0.2 + (pl - 0.2) * t },
      { mesh: mesh(body.arm), shift, at: body.shoulders[1], yaw: yr * t, pitch: 0.2 + (pr - 0.2) * t },
    ];
    if (!headless) items.push({ mesh: mesh(L.headDef.mesh), shift, at: [0, 0, body.neck], yaw: P.head * t, eye, eyes: L.headDef.eyes });
    return items;
  }

  _fallSprite(L, p, d, fr, headless, force) {
    const key = `${p} ${d} ${fr} ${headless ? 1 : 0}`;
    let s = L.fall.get(key);
    if (s || !this._go(force)) return s || null;
    const t0 = now();
    const P = DEATHS[p];
    const f = FALL_F[fr];
    // One sample a pixel: the frames are on screen for a tenth of a second each.
    const o = { phi: (d * TAU) / FALL_DIRS, sp: this.cam.sp, cp: this.cam.cp, ppu: this.cam.ppu, ss: 1, lie: (P.lie || 0) * f, roll: (P.roll || 0) * f };
    s = this._fallEntry(bake(this._lying(L, p, (fr + 1) / (FALL_F.length + 1), headless, EYES[EYE.up]), this.tex, o));
    L.fall.set(key, s);
    const kept = this.fallKeys;
    kept.push(L.fall, key);
    if (kept.length > 2 * FALL_KEEP) kept.shift().delete(kept.shift());
    this._time(t0);
    return s;
  }

  /** Which way corpse c lies (an index into DEATHS), decided once, from c.pose (effects.js). */
  pose(c) {
    if (c.poseI === undefined) c.poseI = pickDeath(c.pose ?? 0);
    return c.poseI;
  }

  /**
   * A dead zombie is about to go over (call on its first frames, before the ground is drawn):
   * true if it will be drawn falling (drawFalling) until FALL_T, false if there's no time to bake
   * its fall this frame and it goes straight to the ground. Decided once per corpse.
   */
  startFall(c) {
    if (c.fall !== undefined) return c.fall;
    const L = this.look(c.look);
    const hl = c.head ? 1 : 0;
    let p = this.pose(c);
    // It goes over facing the way its pose has it (on its back: toward whoever shot it), its
    // head toward where the shot threw it.
    const yaw = this._yaw;
    const dir = (p) => {
      const d = Math.round(((c.ang + DEATHS[p].face - yaw) / TAU) * FALL_DIRS) % FALL_DIRS;
      return d < 0 ? d + FALL_DIRS : d;
    };
    const extra = this.spent >= this.budget && this.fallStarts < FALL_STARTS;
    c.fall = !!this._fallSprite(L, p, dir(p), 0, hl, extra);
    if (c.fall && extra) {
      this.fallStarts++;
      c.fallForce = true; // and its other two frames, then
    }
    if (!c.fall && !L.dead.has(`${p} ${hl}`)) {
      // No time to bake its fall: it drops, and lies as one of its look's dead already do, if any.
      for (let k = 1; k < DEATHS.length; k++) {
        const q = (p + k) % DEATHS.length;
        if (L.dead.has(`${q} ${hl}`)) {
          p = c.poseI = q;
          break;
        }
      }
    }
    const d = dir(p);
    c.fallDir = d;
    c.angQ = yaw + (d * TAU) / FALL_DIRS - DEATHS[p].face; // where its head goes: the decal lies the same way
    return c.fall;
  }

  /**
   * Is corpse c going over (drawn standing, by drawFalling) rather than lying on the ground? Call
   * for the dead on screen before the ground is drawn. A body that has landed holds its last
   * frame a little longer while its decal is baked within the budget, so a crowd going down
   * together doesn't bake all its decals in one frame.
   */
  falling(c) {
    if (c.t < FALL_T) return this.startFall(c);
    return c.fall === true && c.t < FALL_T + LAND_WAIT && !this.look(c.look).dead.has(`${this.pose(c)} ${c.head ? 1 : 0}`);
  }

  /** A dead zombie going over (corpse c, effects.js), drawn standing, as the world's bodies are, at brightness b. */
  drawFalling(R, c, b) {
    const L = this.look(c.look);
    const v = R.v;
    const hl = c.head ? 1 : 0;
    const p = this.pose(c);
    let fr = Math.min(FALL_F.length - 1, Math.floor((c.t / FALL_T) * FALL_F.length));
    let s = this._fallSprite(L, p, c.fallDir, fr, hl, !!c.fallForce);
    while (!s && fr > 0) s = L.fall.get(`${p} ${c.fallDir} ${--fr} ${hl}`); // no time: the frame before
    if (!s) {
      c.fall = false; // the camera changed under it: to the ground
      return;
    }
    this._put(R, s, v.px(c.x, c.y), v.py(c.x, c.y, 0), b);
    // Its decal, ready for when it lands, if there's time for it now (once it's down, whatever
    // else wants baking this frame).
    if (!L.dead.has(`${p} ${hl}`) && (this._may() || (c.t >= FALL_T && this.spent < this.budget))) {
      this.fills++;
      this.corpse(c.look, !!hl, p);
    }
  }

  /** A sprite with its origin at (x, y) CSS px, one to one on whole device pixels when the camera allows. */
  _put(R, s, x, y, b) {
    const { ctx, v } = R;
    const dpr = R.dpr;
    const exact = Math.abs(this.cam.ppu - SCALE * v.scale * dpr) < 1e-9;
    const F = exact ? 1 / dpr : (SCALE * v.scale) / this.cam.ppu;
    const dx = exact ? Math.round(x * dpr - s.ox) * F : x - s.ox * F;
    const dy = exact ? Math.round(y * dpr - s.oy) * F : y - s.oy * F;
    this._draw(ctx, s, dx, dy, s.w * F, s.h * F, b, this.cam.b0);
  }

  /** A knocked-off head in the air (corpse c's head): tumbling, its facing turning as it spins, eyes rolling. */
  drawHead(R, c, b) {
    const L = this.look(c.look);
    const v = R.v;
    const hd = c.head;
    let d = Math.round((hd.rot - v.yaw) / STEP) % DIRS;
    if (d < 0) d += DIRS;
    let e = (hd.rot * 2) % TAU < Math.PI ? EYE.crossed : EYE.up;
    if (!L.head.s[d * NE + e]) {
      if (this._may()) {
        this.fills++;
        this._bake(L.head, d, e);
        this.atlas.flush();
      } else {
        // Spinning: a near facing (in either roll of the eyes) does for a frame.
        const other = e === EYE.up ? EYE.crossed : EYE.up;
        let found = false;
        for (let k = 0; k <= DIRS / 2 && !found; k++) {
          for (const dd of [(d + k) % DIRS, (d - k + DIRS) % DIRS]) {
            if (L.head.s[dd * NE + e] || L.head.s[dd * NE + other]) {
              e = L.head.s[dd * NE + e] ? e : other;
              d = dd;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          this._bake(L.head, d, e);
          this.atlas.flush();
        }
      }
    }
    // Its neck where it is, that high up (in the leaning frame, as the standing ones are).
    this._put(R, L.head.s[d * NE + e], v.px(hd.x, hd.y), v.py(hd.x, hd.y, 0) - hd.z * v.scale * this.cam.cp, b);
  }

  /**
   * The look's body lying as DEATHS[p] has it (headless: without its head), seen from straight
   * above: a ground decal, its feet at the corpse's spot, turned so that its head is toward -x.
   */
  corpse(i, headless = false, p = 0) {
    const L = this.look(i);
    const key = `${p} ${headless ? 1 : 0}`;
    let e = L.dead.get(key);
    if (!e) {
      const t0 = now();
      const P = DEATHS[p];
      const items = this._lying(L, p, 1, headless, EYES[EYE[P.eye] ?? EYE.up]);
      const s = bake(items, this.tex, { phi: P.face - Math.PI, sp: 1, cp: 0, ppu: this.cam.ppu, ss: SS, lie: P.lie || 0, roll: P.roll || 0, shade: DECAL_SHADE });
      e = this.deadAtlas.add(s);
      e.cx = s.ox;
      e.cy = s.oy;
      this.deadAtlas.flush();
      L.dead.set(key, e);
      this._time(t0);
    }
    return e;
  }

  /** A knocked-off head come to rest, face up: a ground decal (its middle at the spot). */
  headDecal(i) {
    const L = this.look(i);
    if (!L.headDecal) {
      const t0 = now();
      const items = [{ mesh: mesh(L.headDef.mesh), shift: BLOCKS[L.look.block], eye: EYES[EYE.crossed], eyes: L.headDef.eyes }];
      const s = bake(items, this.tex, { phi: 0, sp: 1, cp: 0, ppu: this.cam.ppu, ss: SS, lie: Math.PI / 2, shade: DECAL_SHADE });
      L.headDecal = this.deadAtlas.add(s);
      L.headDecal.cx = s.w / 2;
      L.headDecal.cy = s.h / 2;
      this.deadAtlas.flush();
      this._time(t0);
    }
    return L.headDecal;
  }

  /**
   * The dead with a look, as decals on the ground (under the night, like the rest of the
   * ground): the body lying its way from its feet, its head toward where it was thrown, and a
   * knocked-off head where it came to rest. list: corpses with .look. Leaves the canvas on the
   * ground transform.
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
    const k = SCALE / this.cam.ppu; // world units per sprite px
    const at = (s, x, y, th, fl) => {
      const co = Math.cos(th) * k;
      const si = Math.sin(th) * k;
      ctx.setTransform(A * co + C * si, B * co + D * si, fl * (C * co - A * si), fl * (D * co - B * si), A * x + C * y + E, B * x + D * y + G);
      ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h, -s.cx, -s.cy, s.w, s.h);
    };
    for (const c of list) {
      ctx.globalAlpha = c.t > 48 ? Math.max(0, (50 - c.t) / 2) : 1;
      // Head toward where it was thrown (the sprite has it on the left). Never mirrored: the
      // poses come in both hands already, and the fall before it wasn't mirrored either.
      at(this.corpse(c.look, !!c.head, this.pose(c)), c.x, c.y, (c.angQ ?? c.ang) + Math.PI, 1);
      if (c.head && c.head.rest) at(this.headDecal(c.look), c.head.x, c.head.y, c.head.rot, 1);
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
    const a = this.atlas;
    const d = this.deadAtlas;
    return { pages: a.pages.length + d.pages.length, px: a.px + d.px, dead: d.px, falls: this.fallKeys.length / 2, ms: Math.round(this.bakeMs), bakes: this.bakes, looks: this.looks.filter(Boolean).length };
  }
}

const GAZE = [0, 0];
const PICK = [0, 0, 0, 0];
