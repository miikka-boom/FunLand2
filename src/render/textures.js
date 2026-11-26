// Surface textures for the streets (assets/streets/*.webp, made with Scenario from crops of the
// level's concept art): asphalt, sidewalk slabs, roofs, brick. They are used for their detail
// only: each is tinted to whatever colour the surface has (the map's, or a night look's), so
// every look keeps its palette. A tinted copy keeps the texture's light and dark around the
// colour: base * (1 + (lum / mean - 1) * contrast).
//
// Repeating textures are expensive to fill a screen with on a canvas drawn without a GPU, so
// the ground is painted with them once, into the chunks of ground-cache.js, and only those are
// drawn each frame.

import { ROOFTOP_IMAGE } from '../../assets/streets/rooftop.js';

const FILES = {
  asphalt: 'assets/streets/asphalt.webp',
  sidewalk: 'assets/streets/sidewalk.webp',
  roof: 'assets/streets/roof.webp',
  brick: 'assets/streets/brick.webp',
};

/** World units one repeat of each texture spans (it is square). */
export const TEXTURE_SPAN = { asphalt: 256, sidewalk: 120, roof: 200, brick: 96 };

/** '#rrggbb' or 'rgb(r,g,b)' -> [r, g, b] (null for anything else) */
export function hexRgb(c) {
  if (c[0] === '#') {
    const n = parseInt(c.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

/**
 * The tinted pixels: rgba of the texture (its luminance, normalised to its mean) around colour
 * rgb. Pure, for tests: lum is the texture's luminance per pixel, mean its average.
 */
export function tintPixels(lum, mean, rgb, contrast, out) {
  const k = contrast / (mean || 1);
  for (let i = 0, o = 0; i < lum.length; i++, o += 4) {
    const v = 1 + (lum[i] * k - contrast);
    out[o] = rgb[0] * v;
    out[o + 1] = rgb[1] * v;
    out[o + 2] = rgb[2] * v;
    out[o + 3] = 255;
  }
  return out;
}

export class Textures {
  constructor() {
    this.src = {}; // name -> { w, h, lum: Float32Array, mean }
    this.cache = new Map(); // 'name|#rrggbb|contrast' -> canvas
    this.version = 0; // goes up as textures arrive (the ground cache keys on it)
    this.loading = false;
    this.sheets = {}; // sprite sheets: name -> image
    this.shaded = new Map(); // 'name|level|look' -> a darkened copy
  }

  /** Start loading (in a browser); each texture is usable as soon as it arrives. */
  load(base = '') {
    if (this.loading || typeof Image === 'undefined' || typeof document === 'undefined') return;
    this.loading = true;
    for (const [name, file] of Object.entries(FILES)) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          this._read(name, img);
          this.version++;
        } catch {
          // A texture that can't be read leaves its surface flat.
        }
      };
      img.src = base + file;
    }
    const sheet = new Image();
    sheet.decoding = 'async';
    sheet.onload = () => {
      this.sheets.rooftop = sheet;
      this.version++;
    };
    sheet.src = base + ROOFTOP_IMAGE;
  }

  /**
   * Sprite sheet name darkened (style: a fill laid over its pixels, source-atop, and an optional
   * warm one: zombie-art.js darkenStyles), made once; the sheet itself for none; null while it
   * hasn't loaded.
   */
  sheet(name, key = '', style = null) {
    const img = this.sheets[name];
    if (!img || !style || (!style.fill && !style.warm)) return img || null;
    const k = `${name}|${key}`;
    let c = this.shaded.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    for (const f of [style.fill, style.warm]) {
      if (!f) continue;
      x.fillStyle = f;
      x.fillRect(0, 0, c.width, c.height);
    }
    this.shaded.set(k, c);
    return c;
  }

  _read(name, img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0, o = 0; i < lum.length; i++, o += 4) {
      const l = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      lum[i] = l;
      sum += l;
    }
    this.src[name] = { w, h, lum, mean: sum / lum.length };
  }

  has(name) {
    return !!this.src[name];
  }

  /** The texture tinted to colour hex (a canvas, made once), or null while it hasn't loaded. */
  tinted(name, hex, contrast = 1) {
    const s = this.src[name];
    const rgb = s && hex ? hexRgb(hex) : null;
    if (!rgb) return null;
    const key = `${name}|${hex}|${contrast}`;
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d');
    const img = x.createImageData(s.w, s.h);
    tintPixels(s.lum, s.mean, rgb, contrast, img.data);
    x.putImageData(img, 0, 0);
    this.cache.set(key, c);
    return c;
  }

  /**
   * The texture's detail as a grey to multiply a surface by (white where it is at its lightest,
   * darker in its joints and grain), made once; null while it hasn't loaded.
   */
  detail(name) {
    const s = this.src[name];
    if (!s) return null;
    const key = `${name}|detail`;
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = s.w;
    c.height = s.h;
    const x = c.getContext('2d');
    const img = x.createImageData(s.w, s.h);
    const d = img.data;
    const k = 250 / (1.15 * s.mean);
    for (let i = 0, o = 0; i < s.lum.length; i++, o += 4) {
      const v = Math.min(255, s.lum[i] * k);
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this.cache.set(key, c);
    return c;
  }

  /** The detail of a texture as a repeating fill for ctx (in the units of its current space), or null. */
  detailFill(ctx, name) {
    const c = this.detail(name);
    if (!c || !ctx.createPattern) return null;
    const p = ctx.createPattern(c, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') {
      const sc = TEXTURE_SPAN[name] / c.width;
      p.setTransform(new DOMMatrix([sc, 0, 0, sc, 0, 0]));
    }
    return p;
  }

  /**
   * A fill for ctx: the texture tinted to hex, repeating every TEXTURE_SPAN[name] world units in
   * the ctx's current (world) space; the flat colour while the texture isn't there.
   */
  fill(ctx, name, hex, contrast = 1) {
    const c = this.tinted(name, hex, contrast);
    if (!c || !ctx.createPattern) return hex;
    const p = ctx.createPattern(c, 'repeat');
    if (!p) return hex;
    if (p.setTransform && typeof DOMMatrix !== 'undefined') {
      const s = TEXTURE_SPAN[name] / c.width;
      p.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    }
    return p;
  }
}
