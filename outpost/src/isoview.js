// The isometric view: one world layer moved by a camera (CSS transform),
// holding the ground (one SVG for the whole map), objects that stand on
// footprints (z-index = depth), walkers (moved every frame), and a placement
// ghost with a green/red footprint. Gestures: one finger pans, two fingers
// pinch-zoom, a tap selects, and dragging the ghost moves it. The wheel zooms.

import { TW, TH, Camera, footBox, footBottom, depth, diamondPoints, mapBounds, tileAt, tileToWorld, worldToTile } from './iso.js';

const TAP_MOVE = 8; // px a finger may wander and still be a tap
const TAP_MS = 350;

export class IsoView {
  /**
   * cb: { onTap({ id, i, j, sx, sy }), onGhostMove({ i, j }), onCamera() }
   */
  constructor(root, { cols, rows }, cb = {}) {
    this.root = root;
    this.cols = cols;
    this.rows = rows;
    this.cb = cb;
    this.cam = new Camera({ zoom: 1 });
    this.objects = new Map(); // id -> { el, i, j, w, h, z }
    this.walkers = new Map();
    this.ghost = null;
    this.pointers = new Map();
    this.gesture = null;
    const b = mapBounds(cols, rows);
    this.bounds = b;
    root.classList.add('iso');
    root.innerHTML =
      `<div class="iso-world">` +
      `<div class="iso-ground" style="left:${b.left}px;top:${b.top}px;width:${b.right - b.left}px;height:${b.bottom - b.top}px"></div>` +
      `<svg class="iso-marks" style="left:${b.left}px;top:${b.top}px" width="${b.right - b.left}" height="${b.bottom - b.top}" viewBox="${b.left} ${b.top} ${b.right - b.left} ${b.bottom - b.top}"></svg>` +
      `<div class="iso-objects"></div>` +
      `</div>`;
    this.world = root.querySelector('.iso-world');
    this.groundEl = root.querySelector('.iso-ground');
    this.marks = root.querySelector('.iso-marks');
    this.layer = root.querySelector('.iso-objects');
    this.cam.x = (b.left + b.right) / 2;
    this.cam.y = (b.top + b.bottom) / 2;
    // Keep the view centre over the diamond (not its empty bounding-box corners).
    this.setRoam(0, 0, cols, rows);
    this._bind();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /** Limit where the camera centre may go, in tiles (e.g. the unlocked area plus a margin). */
  setRoam(i0, j0, i1, j1) {
    this.cam.limit = (x, y) => {
      const t = worldToTile(x, y);
      const ci = Math.min(i1, Math.max(i0, t.i));
      const cj = Math.min(j1, Math.max(j0, t.j));
      return tileToWorld(ci, cj);
    };
    this.cam.clamp();
  }

  resize() {
    const r = this.root.getBoundingClientRect();
    this.cam.setViewport(r.width || innerWidth, r.height || innerHeight);
    this.apply();
  }

  apply() {
    this.world.style.transform = this.cam.css();
    if (this.cb.onCamera) this.cb.onCamera();
  }

  /** Centre the camera on a tile (optionally animate). */
  focus(i, j, { zoom = null, ms = 450 } = {}) {
    const to = tileToWorld(i, j);
    const from = { x: this.cam.x, y: this.cam.y, z: this.cam.zoom };
    const tz = zoom ?? this.cam.zoom;
    if (!ms) {
      this.cam.x = to.x;
      this.cam.y = to.y;
      this.cam.zoom = tz;
      this.cam.clamp();
      this.apply();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      this.cam.x = from.x + (to.x - from.x) * e;
      this.cam.y = from.y + (to.y - from.y) * e;
      this.cam.zoom = from.z + (tz - from.z) * e;
      this.cam.clamp();
      this.apply();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  setGround(svgHtml) {
    this.groundEl.innerHTML = svgHtml;
  }

  /** Marks drawn on the ground (selection outlines, placement tint): SVG fragments in world coords. */
  setMarks(svgFragment) {
    this.marks.innerHTML = svgFragment;
  }

  /**
   * Add or update an object standing on a footprint. o: { i, j, w, h, html,
   * artH (art height in world px), cls, z (extra depth), tap (bool) }.
   * The art's box is the footprint's width; its bottom sits on the footprint's
   * bottom corner.
   */
  upsert(id, o) {
    let rec = this.objects.get(id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'iso-obj';
      el.dataset.oid = id;
      this.layer.appendChild(el);
      rec = { el, html: null };
      this.objects.set(id, rec);
    }
    Object.assign(rec, o);
    const { el } = rec;
    if (o.html !== undefined && o.html !== rec.shown) {
      el.innerHTML = o.html;
      rec.shown = o.html;
    }
    el.className = `iso-obj ${rec.cls || ''}`;
    this._position(rec);
    return el;
  }

  _position(rec) {
    const w = rec.w || 1;
    const h = rec.h || 1;
    const box = footBox(rec.i, rec.j, w, h);
    const bottom = footBottom(rec.i, rec.j, w, h).y;
    const artH = rec.artH || box.height;
    rec.el.style.cssText = `left:${box.left}px;top:${bottom - artH}px;width:${box.width}px;height:${artH}px;z-index:${Math.round(depth(rec.i, rec.j, w, h) * 10 + (rec.z || 0))}`;
  }

  move(id, i, j) {
    const rec = this.objects.get(id);
    if (!rec) return;
    rec.i = i;
    rec.j = j;
    this._position(rec);
  }

  remove(id) {
    const rec = this.objects.get(id);
    if (!rec) return;
    rec.el.remove();
    this.objects.delete(id);
  }

  objectEl(id) {
    const rec = this.objects.get(id);
    return rec ? rec.el : null;
  }

  /** Walkers: small figures at fractional tile positions (feet on the point). */
  walker(id, fi, fj, { html, w = 30, h = 48, flip = false } = {}) {
    let rec = this.walkers.get(id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'iso-walker';
      el.dataset.wid = id;
      this.layer.appendChild(el);
      rec = { el, shown: null, w, h };
      this.walkers.set(id, rec);
    }
    if (html !== undefined && html !== rec.shown) {
      rec.el.innerHTML = html;
      rec.shown = html;
    }
    const p = tileToWorld(fi, fj);
    const z = Math.round((fi + fj) * 10 + 5);
    rec.el.style.transform = `translate3d(${(p.x - rec.w / 2).toFixed(1)}px, ${(p.y - rec.h).toFixed(1)}px, 0)${flip ? ' scaleX(-1)' : ''}`;
    if (rec.z !== z) {
      rec.z = z;
      rec.el.style.zIndex = String(z);
    }
    rec.el.style.width = `${rec.w}px`;
    rec.el.style.height = `${rec.h}px`;
    return rec.el;
  }

  removeWalker(id) {
    const rec = this.walkers.get(id);
    if (!rec) return;
    rec.el.remove();
    this.walkers.delete(id);
  }

  walkerEl(id) {
    const rec = this.walkers.get(id);
    return rec ? rec.el : null;
  }

  /** Show the placement ghost: { i, j, w, h, html, artH, valid }. */
  showGhost(g) {
    this.ghost = { ...this.ghost, ...g };
    const G = this.ghost;
    this.upsert('__ghost', { i: G.i, j: G.j, w: G.w, h: G.h, html: G.html, artH: G.artH, cls: `ghost ${G.valid ? 'ok' : 'bad'}`, z: 5 });
    this.setMarks(`<polygon class="foot ${G.valid ? 'ok' : 'bad'}" points="${diamondPoints(G.i, G.j, G.w, G.h)}"/>`);
  }

  hideGhost() {
    this.ghost = null;
    this.remove('__ghost');
    this.setMarks('');
  }

  /** Screen point of a tile (for HUD bubbles over the map). */
  tileScreen(i, j) {
    const p = tileToWorld(i, j);
    const r = this.root.getBoundingClientRect();
    const s = this.cam.worldToScreen(p.x, p.y);
    return { x: s.x + r.left, y: s.y + r.top };
  }

  // --- Gestures -----------------------------------------------------------------------------

  _local(e) {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bind() {
    const el = this.root;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this._local(e);
        this.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        this.apply();
      },
      { passive: false },
    );
  }

  _down(e) {
    if (e.button !== undefined && e.button > 0) return;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const p = this._local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      const onGhost = !!(this.ghost && e.target.closest && e.target.closest('[data-oid="__ghost"]'));
      const target = e.target.closest ? e.target.closest('[data-oid],[data-wid]') : null;
      this.gesture = { kind: 'press', start: p, last: p, t0: performance.now(), target, onGhost, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this._local(e);
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (g.dist > 0) this.cam.zoomAt(dist / g.dist, mid.x, mid.y);
      this.cam.panBy(mid.x - g.mid.x, mid.y - g.mid.y);
      g.dist = dist;
      g.mid = mid;
      this.apply();
      return;
    }
    if (g.kind !== 'press') return;
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_MOVE) g.moved = true;
    if (!g.moved) return;
    if (g.onGhost && this.ghost) {
      // Drag the ghost: snap its footprint centre under the finger.
      const w = this.cam.screenToWorld(p.x, p.y);
      const t = tileAt(w.x, w.y + (TH * (this.ghost.h + this.ghost.w)) / 4);
      const i = t.i - Math.floor(this.ghost.w / 2);
      const j = t.j - Math.floor(this.ghost.h / 2);
      if (i !== this.ghost.i || j !== this.ghost.j) {
        if (this.cb.onGhostMove) this.cb.onGhostMove({ i, j });
      }
    } else {
      this.cam.panBy(p.x - g.last.x, p.y - g.last.y);
      this.apply();
    }
    g.last = p;
  }

  _up(e, cancel = false) {
    const g = this.gesture;
    this.pointers.delete(e.pointerId);
    if (g && g.kind === 'pinch') {
      if (this.pointers.size === 1) {
        const [p] = [...this.pointers.values()];
        this.gesture = { kind: 'press', start: p, last: p, t0: performance.now(), target: null, onGhost: false, moved: true };
      } else if (!this.pointers.size) this.gesture = null;
      return;
    }
    this.gesture = null;
    if (cancel || !g || g.kind !== 'press' || g.moved || performance.now() - g.t0 > TAP_MS * 2) return;
    const p = this._local(e);
    const w = this.cam.screenToWorld(p.x, p.y);
    const t = tileAt(w.x, w.y);
    let id = null;
    if (g.target) id = g.target.dataset.oid || (g.target.dataset.wid ? `w:${g.target.dataset.wid}` : null);
    if (!id) {
      // No art under the finger: whatever stands on the tapped tile.
      let best = null;
      for (const [oid, rec] of this.objects) {
        if (oid === '__ghost') continue;
        const ww = rec.w || 1;
        const hh = rec.h || 1;
        if (t.i >= rec.i && t.i < rec.i + ww && t.j >= rec.j && t.j < rec.j + hh) {
          const d = depth(rec.i, rec.j, ww, hh);
          if (!best || d > best.d) best = { oid, d };
        }
      }
      if (best) id = best.oid;
    }
    if (this.cb.onTap) this.cb.onTap({ id, i: t.i, j: t.j, sx: e.clientX, sy: e.clientY });
  }
}

export { TW, TH };
