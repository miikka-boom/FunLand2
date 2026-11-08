// The isometric view: one world layer moved by a camera (CSS transform),
// holding the ground (one SVG for the whole map), objects that stand on
// footprints (z-index = depth), walkers (moved every frame), and a placement
// ghost with a green/red footprint. Gestures: one finger pans, two fingers
// pinch-zoom, a tap selects, and dragging the ghost moves it. The wheel zooms.

import { TW, TH, Camera, footBox, footBottom, depth, diamondPoints, mapBounds, tileAt, tileToWorld, worldToTile, inHexagon, inPoly } from './iso.js';

const TAP_MOVE = 8; // px a finger may wander and still be a tap
const TAP_MS = 350;
const LONG_MS = 350; // a still press this long lifts a movable thing
const DOUBLE_MS = 320; // two taps this close zoom in or out
const LIFT_Y = 40; // a lifted thing floats this far above the finger
const EDGE = 48; // dragging near the edge pans the view
const EDGE_SPEED = 0.6; // px per ms at the very edge
const FRICTION = 0.0045; // inertia decay per ms

export class IsoView {
  /**
   * cb: { onTap({ id, i, j, sx, sy, ui }), onGhostMove({ i, j }), onCamera(),
   *       onLongPress({ id, i, j }) -> true to lift, onDrop({ i, j }) when a lifted
   *       drag ends, onPaint({ i, j, first }) in paint mode, onDoubleTap({ sx, sy }) }
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
    this.mode = 'normal'; // or 'paint': one finger paints tiles, two pan
    this.vel = null; // pan inertia { x, y } in screen px per ms
    this.lastTap = null;
    this.edge = null; // edge auto-pan while dragging the ghost
    const b = mapBounds(cols, rows);
    this.bounds = b;
    root.classList.add('iso');
    root.innerHTML =
      `<div class="iso-world">` +
      `<div class="iso-ground" style="left:${b.left}px;top:${b.top}px;width:${b.right - b.left}px;height:${b.bottom - b.top}px"></div>` +
      `<svg class="iso-marks" style="left:${b.left}px;top:${b.top}px" width="${b.right - b.left}" height="${b.bottom - b.top}" viewBox="${b.left} ${b.top} ${b.right - b.left} ${b.bottom - b.top}"></svg>` +
      `<div class="iso-objects"></div>` +
      `<div class="iso-ui"></div>` +
      `</div>`;
    this.world = root.querySelector('.iso-world');
    this.groundEl = root.querySelector('.iso-ground');
    this.marks = root.querySelector('.iso-marks');
    this.layer = root.querySelector('.iso-objects');
    this.ui = root.querySelector('.iso-ui');
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
    // In-world buttons keep a readable size: counter-scaled by max(1, 0.9 / zoom).
    const k = Math.max(1, 0.9 / this.cam.zoom).toFixed(3);
    if (k !== this._uiK) {
      this._uiK = k;
      this.world.style.setProperty('--ui-k', k);
    }
    if (this.cb.onCamera) this.cb.onCamera();
  }

  /** Per frame: pan inertia and edge auto-pan. */
  tick(dt) {
    if (this.vel && !this.pointers.size) {
      const decay = Math.exp(-FRICTION * dt);
      this.vel.x *= decay;
      this.vel.y *= decay;
      if (Math.hypot(this.vel.x, this.vel.y) < 0.02) this.vel = null;
      else {
        const x0 = this.cam.x;
        const y0 = this.cam.y;
        this.cam.panBy(this.vel.x * dt, this.vel.y * dt);
        // Stopped by the roam limit: the glide is over (so a tap isn't taken for "stop").
        if (Math.abs(this.cam.x - x0) + Math.abs(this.cam.y - y0) < 0.01) this.vel = null;
        this.apply();
      }
    }
    const g = this.gesture;
    if (g && g.kind === 'lift' && g.armed && this.ghost) {
      const p = g.last;
      const vw = this.cam.vw;
      const vh = this.cam.vh;
      const ex = p.x < EDGE ? (EDGE - p.x) / EDGE : p.x > vw - EDGE ? -(p.x - (vw - EDGE)) / EDGE : 0;
      const ey = p.y < EDGE ? (EDGE - p.y) / EDGE : p.y > vh - EDGE ? -(p.y - (vh - EDGE)) / EDGE : 0;
      if (ex || ey) {
        this.cam.panBy(ex * EDGE_SPEED * dt, ey * EDGE_SPEED * dt);
        this.apply();
        this._dragGhost(p);
      }
    }
  }

  /** An in-world HTML element (tags, bubbles, arrows) pinned to a world point, counter-scaled. */
  pin(id, x, y, html, cls = '') {
    let el = this.ui.querySelector(`[data-pin="${id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.pin = id;
      this.ui.appendChild(el);
    }
    if (el._html !== html) {
      el.innerHTML = html;
      el._html = html;
    }
    el.className = `iso-pin ${cls}`;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(var(--ui-k, 1))`;
    return el;
  }

  unpin(id) {
    const el = this.ui.querySelector(`[data-pin="${id}"]`);
    if (el) el.remove();
  }

  pinEl(id) {
    return this.ui.querySelector(`[data-pin="${id}"]`);
  }

  /** Stop any running glide or inertia. */
  stop() {
    this.vel = null;
    this._glide = null;
  }

  /** Centre the camera on a tile (optionally animate). */
  focus(i, j, { zoom = null, ms = 450, dy = 0 } = {}) {
    const to = tileToWorld(i, j);
    const from = { x: this.cam.x, y: this.cam.y, z: this.cam.zoom };
    const tz = Math.min(this.cam.max, Math.max(this.cam.min, zoom ?? this.cam.zoom));
    // dy: screen px to shift the point down (e.g. above a bottom drawer).
    to.y += dy / tz;
    this.vel = null;
    if (!ms) {
      this.cam.x = to.x;
      this.cam.y = to.y;
      this.cam.zoom = tz;
      this.cam.clamp();
      this.apply();
      return Promise.resolve();
    }
    const t0 = performance.now();
    const token = {};
    this._glide = token;
    return new Promise((resolve) => {
      const step = (now) => {
        if (this._glide !== token) return resolve();
        const k = Math.min(1, (now - t0) / ms);
        const e = 1 - (1 - k) ** 3;
        this.cam.x = from.x + (to.x - from.x) * e;
        this.cam.y = from.y + (to.y - from.y) * e;
        this.cam.zoom = from.z + (tz - from.z) * e;
        this.cam.clamp();
        this.apply();
        if (k < 1) requestAnimationFrame(step);
        else {
          this._glide = null;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** Is a tile on screen (with a margin in px)? */
  onScreen(i, j, margin = 0) {
    const p = tileToWorld(i, j);
    const s = this.cam.worldToScreen(p.x, p.y);
    return s.x >= margin && s.y >= margin && s.x <= this.cam.vw - margin && s.y <= this.cam.vh - margin;
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
      // img: the SVG becomes a cached image (cheap to draw; taps use the hit hexagon).
      el.innerHTML = o.img ? svgImg(o.html) : o.html;
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
    rec.zi = Math.round(depth(rec.i, rec.j, w, h) * 10 + (rec.z || 0));
    rec.box = { left: box.left, right: box.left + box.width, top: bottom - artH, bottom };
    rec.el.style.cssText = `left:${box.left}px;top:${bottom - artH}px;width:${box.width}px;height:${artH}px;z-index:${rec.zi}`;
    this.zGen = (this.zGen || 0) + 1; // walkers re-sort against moved objects
  }

  /**
   * A walker's draw order. Sorting by the feet alone puts someone standing in
   * front of a building's side behind it, so: above every object whose
   * footprint the walker stands in front of (fi ≥ i + w or fj ≥ j + h) and
   * whose box overlaps the sprite, and below every object it stands behind.
   */
  _walkerZ(fi, fj, ww, hh) {
    const base = Math.round((fi + fj) * 10 + 4);
    const p = tileToWorld(fi, fj);
    const l = p.x - ww / 2;
    const r = p.x + ww / 2;
    const t = p.y - hh;
    const b = p.y;
    let lo = -Infinity;
    let hi = Infinity;
    for (const [oid, rec] of this.objects) {
      if (oid === '__ghost' || !rec.box) continue;
      const B = rec.box;
      if (B.right <= l || B.left >= r || B.bottom <= t || B.top >= b) continue;
      const w = rec.w || 1;
      const h = rec.h || 1;
      const on = fi >= rec.i && fi < rec.i + w && fj >= rec.j && fj < rec.j + h;
      if (on && rec.fence === 'front') hi = Math.min(hi, rec.zi - 1); // the fence stands on the strip's outer edge, in front
      else if (fi >= rec.i + w || fj >= rec.j + h) lo = Math.max(lo, rec.zi + 1);
      else if (on) continue; // standing on it (a seat)
      else hi = Math.min(hi, rec.zi - 1);
    }
    if (lo > hi) return lo;
    return Math.min(hi, Math.max(lo, base));
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
    this.zGen = (this.zGen || 0) + 1;
  }

  objectEl(id) {
    const rec = this.objects.get(id);
    return rec ? rec.el : null;
  }

  /** Walkers: small figures at fractional tile positions (feet on the point). */
  /**
   * opts: { html, w, h, flip, z (a fixed draw order, or null for automatic),
   * lift (px the figure is raised, e.g. sitting on a bench) }
   */
  walker(id, fi, fj, { html, w = 30, h = 48, flip = false, z: zFixed, lift } = {}) {
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
    if (zFixed !== undefined) rec.zFixed = zFixed;
    if (lift !== undefined) rec.lift = lift;
    rec.el.style.transform = `translate3d(${(p.x - rec.w / 2).toFixed(1)}px, ${(p.y - rec.h - (rec.lift || 0)).toFixed(1)}px, 0)`;
    rec.el.classList.toggle('flip', !!flip); // mirrors the figure only (names and badges stay readable)
    // Re-sort only when the walker crosses half a tile or objects moved.
    const key = `${Math.floor(fi * 2)},${Math.floor(fj * 2)},${this.zGen || 0}`;
    if ((rec.zKey !== key || rec.zAuto === undefined) && rec.zFixed == null) {
      rec.zKey = key;
      rec.zAuto = this._walkerZ(fi, fj, rec.w, rec.h);
    }
    const zz = rec.zFixed != null ? rec.zFixed : rec.zAuto;
    if (rec.z !== zz) {
      rec.z = zz;
      rec.el.style.zIndex = String(zz);
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
    this.upsert('__ghost', { i: G.i, j: G.j, w: G.w, h: G.h, html: G.html, artH: G.artH, cls: `ghost ${G.valid ? 'ok' : 'bad'}${G.lifted ? ' lifted' : ''}`, z: 100000 }); // a lifted thing floats over everything
    this.ghostMark = `<polygon class="foot ${G.valid ? 'ok' : 'bad'}" points="${diamondPoints(G.i, G.j, G.w, G.h)}"/>`;
    this.setMarks((this.extraMarks || '') + this.ghostMark);
  }

  hideGhost() {
    this.ghost = null;
    this.ghostMark = '';
    this.remove('__ghost');
    this.setMarks(this.extraMarks || '');
  }

  /** Marks that stay under the ghost (a wish range, a selection). */
  setExtraMarks(svg) {
    this.extraMarks = svg;
    this.setMarks(svg + (this.ghostMark || ''));
  }

  /** Screen point of a tile (for HUD bubbles over the map). */
  tileScreen(i, j) {
    const p = tileToWorld(i, j);
    const r = this.root.getBoundingClientRect();
    const s = this.cam.worldToScreen(p.x, p.y);
    return { x: s.x + r.left, y: s.y + r.top };
  }

  // --- Gestures -----------------------------------------------------------------------------
  //
  // One finger: a tap selects; a drag pans (with inertia); a still press of
  // LONG_MS asks onLongPress, which may lift the thing (then the drag moves the
  // ghost, floating LIFT_Y px above the finger, and the view pans near the
  // edges). A drag that starts on the ghost moves it too. In paint mode one
  // finger paints tiles. Two fingers pinch and pan. Two quick taps zoom.

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
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.stop();
        const p = this._local(e);
        this.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
        this.apply();
      },
      { passive: false },
    );
  }

  /** The tile under a screen point (local px), optionally lifted by LIFT_Y. */
  _tileAt(p, lift = 0) {
    const w = this.cam.screenToWorld(p.x, p.y - lift);
    return tileAt(w.x, w.y);
  }

  /**
   * Where the finger grabbed the ghost, in tiles: kept while dragging, so the
   * thing follows the finger from where it was picked up and never jumps.
   */
  _grabAt(p) {
    const w = this.cam.screenToWorld(p.x, p.y);
    const t = worldToTile(w.x, w.y);
    return { i: this.ghost.i - t.i, j: this.ghost.j - t.j };
  }

  _dragGhost(p) {
    if (!this.ghost) return;
    const g = this.gesture;
    const off = g && g.grab;
    let i;
    let j;
    if (off) {
      const w = this.cam.screenToWorld(p.x, p.y);
      const t = worldToTile(w.x, w.y);
      i = Math.round(t.i + off.i);
      j = Math.round(t.j + off.j);
    } else {
      // No grab point: snap the footprint's centre under the (lifted) finger.
      const w = this.cam.screenToWorld(p.x, p.y - LIFT_Y);
      const t = worldToTile(w.x, w.y);
      i = Math.round(t.i - this.ghost.w / 2);
      j = Math.round(t.j - this.ghost.h / 2);
    }
    if (i !== this.ghost.i || j !== this.ghost.j) {
      if (this.cb.onGhostMove) this.cb.onGhostMove({ i, j });
    }
  }

  _down(e) {
    if (e.button !== undefined && e.button > 0) return;
    const halted = !!this.vel && Math.hypot(this.vel.x, this.vel.y) > 0.1; // this press stops a fling
    this.stop();
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const p = this._local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      const onGhost = !!(this.ghost && e.target.closest && e.target.closest('[data-oid="__ghost"]'));
      const ui = e.target.closest ? e.target.closest('.iso-pin [data-ui], .iso-pin') : null;
      const target = e.target.closest ? e.target.closest('[data-oid],[data-wid]') : null;
      const g = { kind: 'press', pid: e.pointerId, start: p, last: p, t0: performance.now(), lt: performance.now(), target, ui, onGhost, moved: false, samples: [], halted };
      this.gesture = g;
      if (this.mode === 'paint' && !ui) {
        // Painted on the first move to another tile, or on lift: a second finger
        // (a two-finger pan) arriving first means nothing gets painted.
        g.kind = 'paint';
        const t = this._tileAt(p);
        g.tile = `${t.i},${t.j}`;
        g.pending = { i: t.i, j: t.j };
        return;
      }
      if (!onGhost && !ui) {
        clearTimeout(this._longT);
        this._longT = setTimeout(() => {
          if (this.gesture !== g || g.moved || this.pointers.size !== 1) return;
          const t = this._tileAt(g.start);
          const w = this.cam.screenToWorld(g.start.x, g.start.y);
          let id = target ? target.dataset.oid || null : null;
          if (!id && target && target.dataset.wid) {
            // A person (or zombie) drawn over the object takes the press: nothing lifts.
            const hit = this._hitObjectZ(w.x, w.y);
            id = hit && hit.d > (Number(target.style.zIndex) || 0) ? hit.oid : null;
            if (!id) return;
          }
          if (!id) id = this._hitObject(w.x, w.y) || this._objectOnTile(t.i, t.j);
          if (this.cb.onLongPress && this.cb.onLongPress({ id, i: t.i, j: t.j })) {
            const cur = this.pointers.get(g.pid) || g.start;
            g.kind = 'lift';
            g.moved = true;
            g.last = cur;
            g.armed = false; // the edge pan waits until the finger really moves
            g.grab = this.ghost ? this._grabAt(cur) : null;
          }
        }, LONG_MS);
      }
    } else if (this.pointers.size === 2) {
      clearTimeout(this._longT);
      const g = this.gesture;
      if (g && g.kind === 'lift') return; // a lifted thing stays with its finger; others are ignored
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  }

  /**
   * The object under a world point: its footprint diamond extruded upward by
   * its body height (a hexagon), front-most first. Returns { oid, d } (d = its
   * draw order) or null.
   */
  _hitObjectZ(wx, wy) {
    let best = null;
    for (const [oid, rec] of this.objects) {
      if (oid === '__ghost' || rec.noTap) continue;
      const w = rec.w || 1;
      const h = rec.h || 1;
      const body = rec.hitH ?? Math.max(0, (rec.artH || 0) * 0.85 - (w + h) * (TH / 2));
      if (!inHexagon(rec.i, rec.j, w, h, body, wx, wy)) continue;
      const d = depth(rec.i, rec.j, w, h) * 10 + (rec.z || 0);
      if (!best || d > best.d) best = { oid, d };
    }
    return best;
  }

  _hitObject(wx, wy) {
    const b = this._hitObjectZ(wx, wy);
    return b ? b.oid : null;
  }

  _objectOnTile(i, j) {
    let best = null;
    for (const [oid, rec] of this.objects) {
      if (oid === '__ghost' || rec.noTap) continue;
      const ww = rec.w || 1;
      const hh = rec.h || 1;
      if (i >= rec.i && i < rec.i + ww && j >= rec.j && j < rec.j + hh) {
        const d = depth(rec.i, rec.j, ww, hh);
        if (!best || d > best.d) best = { oid, d };
      }
    }
    return best ? best.oid : null;
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
    if (g.kind === 'paint') {
      if (this.pointers.size !== 1) return;
      const t = this._tileAt(p);
      const k = `${t.i},${t.j}`;
      // Not yet clearly a one-finger stroke: a second finger may still turn it into a pan.
      if (g.pending && (Math.hypot(p.x - g.start.x, p.y - g.start.y) <= TAP_MOVE || performance.now() - g.t0 < 90)) {
        g.last = p;
        return;
      }
      if (k !== g.tile) {
        const [pi, pj] = g.tile.split(',').map(Number);
        if (g.pending) {
          const q = g.pending;
          g.pending = null;
          if (this.cb.onPaint) this.cb.onPaint({ i: q.i, j: q.j, first: true });
        }
        g.tile = k;
        // Every tile between the last one and this (a fast finger skips tiles between events).
        const n = Math.max(Math.abs(t.i - pi), Math.abs(t.j - pj));
        for (let s = 1; s <= n; s++) {
          const ii = Math.round(pi + ((t.i - pi) * s) / n);
          const jj = Math.round(pj + ((t.j - pj) * s) / n);
          if (this.cb.onPaint) this.cb.onPaint({ i: ii, j: jj, first: false });
        }
      }
      g.last = p;
      return;
    }
    if (g.kind === 'lift') {
      if (e.pointerId !== g.pid) return; // only the finger that holds it moves it
      if (!g.armed && Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_MOVE) g.armed = true;
      g.last = p;
      this._dragGhost(p);
      return;
    }
    if (g.kind !== 'press') return;
    if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) > TAP_MOVE) {
      g.moved = true;
      clearTimeout(this._longT);
      if (g.onGhost && this.ghost) {
        g.kind = 'lift';
        g.armed = true;
        g.grab = this._grabAt(g.start);
      }
    }
    if (!g.moved) return;
    if (g.kind === 'lift') {
      g.last = p;
      this._dragGhost(p);
      return;
    }
    const now = performance.now();
    const dx = p.x - g.last.x;
    const dy = p.y - g.last.y;
    this.cam.panBy(dx, dy);
    this.apply();
    g.samples.push({ dx, dy, dt: Math.max(1, now - g.lt) });
    if (g.samples.length > 5) g.samples.shift();
    g.lt = now;
    g.last = p;
  }

  _up(e, cancel = false) {
    clearTimeout(this._longT);
    const g = this.gesture;
    this.pointers.delete(e.pointerId);
    if (g && g.kind === 'pinch') {
      if (this.pointers.size === 1) {
        const [p] = [...this.pointers.values()];
        this.gesture = { kind: 'press', start: p, last: p, t0: performance.now(), lt: performance.now(), target: null, onGhost: false, moved: true, samples: [] };
      } else if (!this.pointers.size) this.gesture = null;
      return;
    }
    // A lift ends when the finger that holds it lets go (other fingers don't count).
    if (g && g.kind === 'lift') {
      if (e.pointerId !== g.pid) return;
      this.gesture = null;
      if (this.cb.onDrop && this.ghost) this.cb.onDrop({ i: this.ghost.i, j: this.ghost.j, cancel, sx: e.clientX, sy: e.clientY });
      return;
    }
    if (this.pointers.size) return;
    this.gesture = null;
    if (!g) return;
    if (g.kind === 'paint') {
      if (g.pending && !cancel && !g.halted && this.cb.onPaint) this.cb.onPaint({ ...g.pending, first: true }); // a one-finger tap paints one tile
      if (this.cb.onPaintEnd) this.cb.onPaintEnd();
      return;
    }
    if (g.kind !== 'press') return;
    if (g.moved) {
      // Fling: keep the last few moves' speed.
      const n = g.samples.length;
      if (n && performance.now() - g.lt < 80) {
        const sx = g.samples.reduce((a, q) => a + q.dx, 0);
        const sy = g.samples.reduce((a, q) => a + q.dy, 0);
        const st = g.samples.reduce((a, q) => a + q.dt, 0);
        const v = { x: sx / st, y: sy / st };
        if (Math.hypot(v.x, v.y) > 0.25) this.vel = { x: Math.max(-3, Math.min(3, v.x)), y: Math.max(-3, Math.min(3, v.y)) };
      }
      return;
    }
    if (cancel || performance.now() - g.t0 > TAP_MS * 2) return;
    if (g.halted) return; // a tap that stops a fling only stops it
    const p = this._local(e);
    const t = this._tileAt(p);
    if (g.ui) {
      if (this.cb.onTap) this.cb.onTap({ id: null, ui: g.ui, i: t.i, j: t.j, sx: e.clientX, sy: e.clientY });
      return;
    }
    // Double tap on empty ground zooms (0.9 <-> 1.4).
    const now = performance.now();
    const lt = this.lastTap;
    this.lastTap = { t: now, x: p.x, y: p.y };
    const wp = this.cam.screenToWorld(p.x, p.y);
    const hit = this._hitObjectZ(wp.x, wp.y);
    let id = null;
    if (g.target) {
      id = g.target.dataset.oid || null;
      // A walker's box takes the pointer even where an object is drawn over
      // it: whichever is drawn on top wins.
      // (Zombies always keep theirs: BONK beats the lot card behind them.)
      const wid = g.target.dataset.wid;
      if (!id && wid) id = hit && hit.d > (Number(g.target.style.zIndex) || 0) && !/^z/.test(String(wid)) ? hit.oid : `w:${wid}`;
    }
    if (!id) id = (hit && hit.oid) || this._objectOnTile(t.i, t.j);
    if (lt && now - lt.t < DOUBLE_MS && Math.hypot(p.x - lt.x, p.y - lt.y) < 30 && !g.target) {
      this.lastTap = null;
      const to = this.cam.zoom < 1.15 ? 1.4 : 0.9;
      this.zoomTo(to, p.x, p.y);
      if (this.cb.onDoubleTap) this.cb.onDoubleTap({ sx: e.clientX, sy: e.clientY });
      return;
    }
    if (this.cb.onTap) this.cb.onTap({ id, i: t.i, j: t.j, sx: e.clientX, sy: e.clientY });
  }

  /** Animate the zoom about a screen point. */
  zoomTo(z, sx, sy, ms = 260) {
    const z0 = this.cam.zoom;
    const t0 = performance.now();
    const token = {};
    this._glide = token;
    const step = (now) => {
      if (this._glide !== token) return;
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      const target = z0 + (z - z0) * e;
      this.cam.zoomAt(target / this.cam.zoom, sx, sy);
      this.apply();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

const PAD = 16; // world px of room around the viewBox for small overhangs (flags, smoke)
const imgCache = new Map();

/** An <img> of an SVG string, padded so overhangs past the viewBox still show. */
export function svgImg(svg) {
  let url = imgCache.get(svg);
  if (!url) {
    let src = svg;
    const m = /viewBox="\s*([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)\s*"/.exec(src);
    if (m) {
      const [x, y, w, h] = m.slice(1).map(Number);
      src = src.replace(m[0], `viewBox="${x - PAD} ${y - PAD} ${w + 2 * PAD} ${h + 2 * PAD}" width="${w + 2 * PAD}" height="${h + 2 * PAD}"`);
    }
    if (!/xmlns=/.test(src.slice(0, 300))) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    imgCache.set(svg, url);
    if (imgCache.size > 600) imgCache.delete(imgCache.keys().next().value);
  }
  return `<img class="iso-img" src="${url}" alt="" draggable="false" decoding="async" style="left:-${PAD}px;top:-${PAD}px;width:calc(100% + ${2 * PAD}px);height:calc(100% + ${2 * PAD}px)">`;
}

export { inPoly, TW, TH };
