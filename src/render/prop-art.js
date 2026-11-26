// Props as baked 3D models: the streets' parked cars.
//
// The car is a real mesh (made with Scenario: a concept image after the level's concept art,
// then image-to-3D; tools/props/build_props.py turns it into the zombies' mesh format), rendered
// into sprites by the zombies' baker (zombie-bake.js) through the game's own camera, so it is
// right from every side and at every tilt: one sprite per colour, heading and camera, baked when
// first wanted (a few a frame at most). Its texture is painted green, a colour nothing else on
// a car is, so each car's colour is the texture with its paint swapped (recolorPaint).
//
// Light: a car is drawn as bright as the light where it stands, from a copy of its sprite
// darkened to one of ten levels (and the night look's shade, as the zombies are).

import { decodeMesh, Texture, bake } from './zombie-bake.js';
import { darkenStyles, SCALE } from './zombie-art.js';
import { CAR, CAR_TEXTURE } from '../../assets/props/car.js';

const LEVELS = 10;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const CAR_LEN = (CAR.box[1][0] - CAR.box[0][0]) * SCALE; // world units nose to tail
const CAR_WID = (CAR.box[1][1] - CAR.box[0][1]) * SCALE;

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
    this.state = 'idle';
    this.mesh = null;
    this.base = null; // { w, h, data }
    this.textures = new Map(); // colour -> Texture
    this.sprites = new Map(); // key -> { canvas, ox, oy, w, h, lit: [] }
    this.key = '';
    this.spent = 0;
    this.styles = darkenStyles(null);
  }

  load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    this.loadPixels(CAR_TEXTURE).then(
      (px) => {
        this.base = px;
        this.mesh = decodeMesh(CAR);
        this.state = 'ready';
      },
      () => {
        this.state = 'failed';
      },
    );
  }

  /** Each frame: what the sprites depend on besides the car (camera tilt and zoom, the look). */
  begin(v, dpr, look) {
    if (this.state === 'idle') this.load();
    const key = `${v.pitch.toFixed(4)}|${v.scale.toFixed(4)}|${dpr}|${look ? look.id : '-'}`;
    if (key !== this.key) {
      this.key = key;
      this.sprites.clear();
      this.styles = darkenStyles(look);
    }
    this.spent = 0;
  }

  ready() {
    return this.state === 'ready';
  }

  _texture(color) {
    let t = this.textures.get(color);
    if (!t) {
      const { w, h, data } = this.base;
      t = new Texture(w, h, recolorPaint(data, hexRgb(color)));
      this.textures.set(color, t);
    }
    return t;
  }

  /** The car's sprite for colour, heading (relative to the camera) and scale, baked now if the budget allows. */
  sprite(R, color, phi, s) {
    const k = `${color}|${phi.toFixed(3)}|${s.toFixed(3)}`;
    let sp = this.sprites.get(k);
    if (sp || (this.spent > 0 && this.spent >= this.budget)) return sp || null;
    const t0 = now();
    const v = R.v;
    const b = bake([{ mesh: this.mesh }], this._texture(color), { phi, sp: v.sp, cp: v.cp, ppu: SCALE * v.scale * R.dpr * s, ss: 2, shade: { rim: 0 } });
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

  /**
   * Draw parked car o (a footprint, its colour, which end is its front) at brightness b. Returns
   * false if it can't yet (the caller draws it its old way meanwhile).
   */
  drawCar(R, o, b) {
    if (this.state !== 'ready') return false;
    const v = R.v;
    const vert = o.h > o.w;
    const len = vert ? o.h : o.w;
    const wid = vert ? o.w : o.h;
    const s = Math.round(Math.min((len * 0.96) / CAR_LEN, (wid * 0.96) / CAR_WID) * 100) / 100;
    const phi = carHeading(o) - v.yaw;
    const sp = this.sprite(R, o.color || '#6b6b6b', Math.atan2(Math.sin(phi), Math.cos(phi)), s);
    if (!sp) return false;
    const lv = Math.max(1, Math.min(LEVELS, Math.round(b * LEVELS)));
    const img = this._lit(sp, lv);
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const dpr = R.dpr;
    const ctx = R.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(img, Math.round(v.px(cx, cy) * dpr - sp.ox), Math.round(v.py(cx, cy, 0) * dpr - sp.oy));
    R.reset();
    return true;
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
