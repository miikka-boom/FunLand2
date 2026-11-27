// Props as baked 3D models: the streets' parked cars, newspaper boxes, bus shelters and lamp
// posts, and the parks' benches and fountains.
//
// Each is a real mesh (made with Scenario: a concept image after the level's concept art, then
// image-to-3D; tools/props/build_props.py turns it into the zombies' mesh format), rendered into
// sprites by the zombies' baker (zombie-bake.js) through the game's own camera, so it is right
// from every side and at every tilt: one sprite per prop, colour, heading and camera, baked when
// first wanted (a few ms of it a frame at most). The car and the newspaper box are painted
// green, a colour nothing else on them is, so each one's colour is its texture with the paint
// swapped (recolorPaint).
//
// Tilt: a steep camera sees little more than the tops of tall things, so some props lean toward
// it as the zombies do: they are baked as if the camera were `tilt` lower, pivoting where they
// stand (a lamp post shows its pole, a fountain its bowls, a bench its seat and back).
//
// Light: a prop is drawn as bright as the light where it stands, from a copy of its sprite
// darkened to one of ten levels (and the night look's shade, as the zombies are).

import { decodeMesh, Texture, bake } from './zombie-bake.js';
import { darkenStyles, SCALE } from './zombie-art.js';
import { CAR, CAR_TEXTURE } from '../../assets/props/car.js';
import { NEWSBOX, NEWSBOX_TEXTURE } from '../../assets/props/newsbox.js';
import { SHELTER, SHELTER_TEXTURE } from '../../assets/props/shelter.js';
import { LAMP, LAMP_TEXTURE } from '../../assets/props/lamp.js';
import { BENCH, BENCH_TEXTURE } from '../../assets/props/bench.js';
import { FOUNTAIN, FOUNTAIN_TEXTURE } from '../../assets/props/fountain.js';

const LEVELS = 10;
const DEG = Math.PI / 180;
// A tilt stops here: from a camera this low props already show their sides.
const MIN_PITCH = 35 * DEG;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The props: each one's mesh and texture, whether its paint is swapped for each one's colour,
 * how far it leans toward the camera (degrees), whether it is fitted to its footprint by its
 * width across its front alone (a bench's length: set at a slant, it overhangs its footprint a
 * little), and where its light is (a lamp's lantern, model units: a forward, c right, h up).
 */
export const PROPS = {
  car: { mesh: CAR, texture: CAR_TEXTURE, paint: true },
  newsbox: { mesh: NEWSBOX, texture: NEWSBOX_TEXTURE, paint: true },
  shelter: { mesh: SHELTER, texture: SHELTER_TEXTURE, paint: false },
  lamp: { mesh: LAMP, texture: LAMP_TEXTURE, paint: false, tilt: 15, light: [219, 0, 735] },
  bench: { mesh: BENCH, texture: BENCH_TEXTURE, paint: false, tilt: 12, fit: 'across' },
  fountain: { mesh: FOUNTAIN, texture: FOUNTAIN_TEXTURE, paint: false, tilt: 22 },
};
/** The camera tilt (radians above the horizon) prop name is baked for, under a camera at pitch. */
export function propPitch(name, pitch) {
  const t = (PROPS[name].tilt || 0) * DEG;
  return t ? Math.max(pitch - t, Math.min(pitch, MIN_PITCH)) : pitch;
}
/** How long (forward, along a) and how wide (c) a prop is as built, world units. */
export const propSize = (name) => {
  const b = PROPS[name].mesh.box;
  return [(b[1][0] - b[0][0]) * SCALE, (b[1][1] - b[0][1]) * SCALE];
};

/** Is texel (r, g, b) the car's green paint? */
export const isPaint = (r, g, b) => g > r * 1.15 && g > b * 1.15 && g - Math.min(r, b) > 0.3 * g;

/**
 * The texture's pixels with the green paint swapped for colour rgb, keeping the paint's light
 * and dark (each paint texel is rgb times its luminance over the paint's average). Pure.
 */
export function recolorPaint(src, rgb, out = new Uint8ClampedArray(src.length)) {
  let sum = 0;
  let n = 0;
  for (let o = 0; o < src.length; o += 4) {
    if (!isPaint(src[o], src[o + 1], src[o + 2])) continue;
    sum += 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
    n++;
  }
  const mean = n ? sum / n : 1;
  for (let o = 0; o < src.length; o += 4) {
    const r = src[o];
    const g = src[o + 1];
    const b = src[o + 2];
    if (isPaint(r, g, b)) {
      const k = (0.299 * r + 0.587 * g + 0.114 * b) / mean;
      out[o] = rgb[0] * k;
      out[o + 1] = rgb[1] * k;
      out[o + 2] = rgb[2] * k;
    } else {
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
    out[o + 3] = src[o + 3];
  }
  return out;
}

const hexRgb = (c) => {
  const n = parseInt((c || '#888888').slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The heading of a parked car (radians, 0: facing +x) from its footprint and which end is its front. */
export function carHeading(o) {
  const front = o.front || 1;
  if (o.h > o.w) return front > 0 ? Math.PI / 2 : -Math.PI / 2;
  return front > 0 ? 0 : Math.PI;
}

export class PropArt {
  /**
   * opts: makeCanvas (a canvas for a sprite), loadPixels (url -> Promise<{ w, h, data }>, the
   * texture's RGBA), budget (ms of baking a frame: past it, no more this frame; at least one).
   */
  constructor(opts = {}) {
    this.makeCanvas = opts.makeCanvas || (() => document.createElement('canvas'));
    this.loadPixels = opts.loadPixels || defaultLoad;
    this.budget = opts.budget ?? 6;
    this.models = {}; // name -> { state, mesh, base: { w, h, data }, textures: colour -> Texture }
    this.sprites = new Map(); // key -> { canvas, ox, oy, w, h, lit: [] }
    this.key = '';
    this.spent = 0;
    this.styles = darkenStyles(null);
  }

  /** Prop name's model, its texture loading the first time it's asked for. */
  _model(name) {
    let m = this.models[name];
    if (m) return m;
    const def = PROPS[name];
    m = this.models[name] = { state: 'loading', mesh: null, base: null, textures: new Map(), paint: def.paint };
    this.loadPixels(def.texture).then(
      (px) => {
        m.base = px;
        m.mesh = decodeMesh(def.mesh);
        m.state = 'ready';
      },
      () => {
        m.state = 'failed';
      },
    );
    return m;
  }

  /** Start loading every prop's texture. */
  load() {
    for (const name of Object.keys(PROPS)) this._model(name);
  }

  /** Each frame: what the sprites depend on besides the prop (camera tilt and zoom, the look). */
  begin(v, dpr, look) {
    this.load();
    const key = `${v.pitch.toFixed(4)}|${v.scale.toFixed(4)}|${dpr}|${look ? look.id : '-'}`;
    if (key !== this.key) {
      this.key = key;
      this.sprites.clear();
      this.styles = darkenStyles(look);
    }
    this.spent = 0;
  }

  /** Is prop name's model in (default: the car)? */
  ready(name = 'car') {
    const m = this.models[name];
    return !!m && m.state === 'ready';
  }

  _texture(m, color) {
    const key = m.paint ? color : '-';
    let t = m.textures.get(key);
    if (!t) {
      const { w, h, data } = m.base;
      t = new Texture(w, h, m.paint ? recolorPaint(data, hexRgb(color)) : data);
      m.textures.set(key, t);
    }
    return t;
  }

  /** Prop name's sprite for colour, heading (relative to the camera) and scale, baked now if the budget allows. */
  sprite(R, name, color, phi, s) {
    const m = this._model(name);
    if (m.state !== 'ready') return null;
    const k = `${name}|${m.paint ? color : '-'}|${phi.toFixed(3)}|${s.toFixed(3)}`;
    let sp = this.sprites.get(k);
    if (sp || (this.spent > 0 && this.spent >= this.budget)) return sp || null;
    const t0 = now();
    const v = R.v;
    const pitch = propPitch(name, v.pitch);
    const b = bake([{ mesh: m.mesh }], this._texture(m, color), { phi, sp: Math.sin(pitch), cp: Math.cos(pitch), ppu: SCALE * v.scale * R.dpr * s, ss: 2, shade: { rim: 0 } });
    const canvas = this.makeCanvas();
    canvas.width = Math.max(1, b.w);
    canvas.height = Math.max(1, b.h);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(canvas.width, canvas.height);
    img.data.set(b.rgba);
    ctx.putImageData(img, 0, 0);
    sp = { canvas, ox: b.ox, oy: b.oy, w: b.w, h: b.h, lit: [] };
    this.sprites.set(k, sp);
    this.spent += Math.max(0.001, now() - t0);
    return sp;
  }

  /** Sprite sp darkened to level lv (of LEVELS), made once. */
  _lit(sp, lv) {
    if (lv >= LEVELS && !this.styles[LEVELS].warm) return sp.canvas;
    let c = sp.lit[lv];
    if (c) return c;
    const st = this.styles[lv];
    c = this.makeCanvas();
    c.width = sp.canvas.width;
    c.height = sp.canvas.height;
    const x = c.getContext('2d');
    x.drawImage(sp.canvas, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    for (const f of [st.fill, st.warm]) {
      if (!f) continue;
      x.fillStyle = f;
      x.fillRect(0, 0, c.width, c.height);
    }
    sp.lit[lv] = c;
    return c;
  }

  /** Draw parked car o (a footprint, its colour, which end is its front) at brightness b. */
  drawCar(R, o, b) {
    return this.drawProp(R, 'car', o, b, carHeading(o), o.color || '#6b6b6b');
  }

  /**
   * Draw prop name on footprint o, facing heading (radians, 0: +x; a multiple of a right angle)
   * and then turned a little more (turn, radians: a bench set at a slant), in colour (if its
   * paint is swapped), at brightness b: fitted to the footprint, standing on its middle. Returns
   * false if it can't yet (the caller draws it its old way meanwhile).
   */
  drawProp(R, name, o, b, heading, color, turn = 0) {
    const along = Math.abs(Math.cos(heading)) > 0.5; // its forward axis runs along x
    const len = along ? o.w : o.h;
    const wid = along ? o.h : o.w;
    const [pl, pw] = propSize(name);
    const fit = PROPS[name].fit === 'across' ? (wid * 0.96) / pw : Math.min((len * 0.96) / pl, (wid * 0.96) / pw);
    const s = Math.round(fit * 100) / 100;
    return this.drawAt(R, name, o.x + o.w / 2, o.y + o.h / 2, 0, heading + turn, b, s, color);
  }

  /**
   * Draw prop name standing at (x, y, z) facing heading (radians, 0: +x), at scale s and
   * brightness b, in colour. Returns false if it can't yet.
   */
  drawAt(R, name, x, y, z, heading, b, s = 1, color = null) {
    const v = R.v;
    const phi = heading - v.yaw;
    const sp = this.sprite(R, name, color, Math.atan2(Math.sin(phi), Math.cos(phi)), s);
    if (!sp) return false;
    const lv = Math.max(1, Math.min(LEVELS, Math.round(b * LEVELS)));
    const img = this._lit(sp, lv);
    const dpr = R.dpr;
    const ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(img, Math.round(v.px(x, y) * dpr - sp.ox), Math.round(v.py(x, y, z) * dpr - sp.oy));
    R.reset();
    return true;
  }

  /**
   * Where point p of prop name (model units: a forward, c right, h up), standing at its origin
   * facing heading at scale s, is on screen relative to that origin (CSS pixels), as its sprite
   * draws it (tilted toward the camera). out: [x, y].
   */
  offsetOf(v, name, heading, s, p, out = [0, 0]) {
    const phi = heading - v.yaw;
    const cf = Math.cos(phi);
    const sf = Math.sin(phi);
    const pitch = propPitch(name, v.pitch);
    const k = SCALE * v.scale * s;
    const g = p[0] * sf + p[1] * cf;
    out[0] = k * (p[0] * cf - p[1] * sf);
    out[1] = k * (g * Math.sin(pitch) - p[2] * Math.cos(pitch));
    return out;
  }
}

/** The texture's RGBA, in a browser. */
function defaultLoad(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('no images here'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      resolve({ w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data });
    };
    img.onerror = reject;
    img.src = url;
  });
}
