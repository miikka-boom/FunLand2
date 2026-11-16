// Strays: the little screen. Everything is drawn on a 152x84 buffer in whole
// pixels, then blown up onto the page's canvas with hard edges and a faint
// dot grid, like the LCD of a pocket toy.

import { INK } from './sprites.js';
import { layout, textWidth } from './font.js';

export const LCD_W = 152;
export const LCD_H = 84;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Lcd {
  constructor(canvas) {
    this.canvas = canvas;
    this.out = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.buf.width = LCD_W;
    this.buf.height = LCD_H;
    this.g = this.buf.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.images = new WeakMap();
    this.grid = null;
    this.px = 4; // device pixels per LCD pixel
    this.css = 4; // CSS pixels per LCD pixel
    this.shake = 0;
  }

  /**
   * Size the canvas for a box of CSS pixels: the biggest scale that is a
   * whole number of device pixels, so every LCD pixel is the same size.
   */
  fit(maxW, maxH, dpr = 1) {
    const px = Math.max(1, Math.floor(Math.min(maxW / LCD_W, maxH / LCD_H) * dpr));
    this.px = px;
    this.css = px / dpr;
    this.canvas.width = LCD_W * px;
    this.canvas.height = LCD_H * px;
    this.canvas.style.width = `${LCD_W * this.css}px`;
    this.canvas.style.height = `${LCD_H * this.css}px`;
    this.grid = null;
    if (px >= 3) {
      const grid = document.createElement('canvas');
      grid.width = this.canvas.width;
      grid.height = this.canvas.height;
      const c = grid.getContext('2d');
      c.fillStyle = 'rgba(10, 8, 30, 0.13)';
      for (let x = 0; x <= LCD_W; x++) c.fillRect(x * px - 1, 0, 1, grid.height);
      for (let y = 0; y <= LCD_H; y++) c.fillRect(0, y * px - 1, grid.width, 1);
      this.grid = grid;
    }
    return this.css;
  }

  /** A sprite ({ w, h, px }) as a canvas, made once. */
  image(sprite) {
    let img = this.images.get(sprite);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = sprite.w;
    img.height = sprite.h;
    const c = img.getContext('2d');
    const data = c.createImageData(sprite.w, sprite.h);
    for (let i = 0; i < sprite.px.length; i++) {
      const col = sprite.px[i];
      if (!col) continue;
      const [r, g, b] = hexToRgb(col);
      data.data[i * 4] = r;
      data.data[i * 4 + 1] = g;
      data.data[i * 4 + 2] = b;
      data.data[i * 4 + 3] = 255;
    }
    c.putImageData(data, 0, 0);
    this.images.set(sprite, img);
    return img;
  }

  clear(colour) {
    this.g.globalAlpha = 1;
    this.g.fillStyle = colour;
    this.g.fillRect(0, 0, LCD_W, LCD_H);
  }

  rect(x, y, w, h, colour, alpha = 1) {
    const g = this.g;
    if (alpha !== 1) g.globalAlpha = alpha;
    g.fillStyle = colour;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha !== 1) g.globalAlpha = 1;
  }

  /** Draw a sprite with its top-left at (x, y). `scale` is a whole number. */
  draw(sprite, x, y, scale = 1, alpha = 1) {
    const g = this.g;
    if (alpha !== 1) g.globalAlpha = alpha;
    const img = this.image(sprite);
    if (scale === 1) g.drawImage(img, Math.round(x), Math.round(y));
    else g.drawImage(img, Math.round(x), Math.round(y), sprite.w * scale, sprite.h * scale);
    if (alpha !== 1) g.globalAlpha = 1;
  }

  /** Text, top-left at (x, y); align 'left' | 'center' | 'right' about x. */
  text(str, x, y, colour, { scale = 1, align = 'left', shadow = null } = {}) {
    const g = this.g;
    const w = textWidth(str, scale);
    let x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    const y0 = Math.round(y);
    if (shadow) {
      g.fillStyle = shadow;
      layout(str, x0, y0 + scale, scale, (px, py, pw, ph) => g.fillRect(px, py, pw, ph));
    }
    layout(str, x0, y0, scale, (px, py, pw, ph, pic) => {
      g.fillStyle = pic ? INK[pic] : colour;
      g.fillRect(px, py, pw, ph);
    });
    return w;
  }

  /** Draw inside a box only. */
  clip(x, y, w, h, fn) {
    const g = this.g;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    fn();
    g.restore();
  }

  /** Blow the buffer up onto the page. */
  present() {
    const out = this.out;
    out.imageSmoothingEnabled = false;
    const s = this.shake ? Math.round((Math.random() * 2 - 1) * this.shake) * this.px : 0;
    if (s) {
      out.fillStyle = INK.k;
      out.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    out.drawImage(this.buf, s, 0, this.canvas.width, this.canvas.height);
    if (this.grid) out.drawImage(this.grid, 0, 0);
  }

  /** Page coordinates (a pointer event) to LCD pixels. */
  toLcd(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * LCD_W,
      y: ((clientY - r.top) / r.height) * LCD_H,
    };
  }
}
