// The town map: the iso view of Last Stop. Draws the ground (one image per
// lot), the wild (ruins, landmarks with their bosses, mystery heaps), the Gas
// Station, homes and decorations, the fence, floating tags and bubbles,
// residents walking about on A* paths and goofy zombies at the fence. It also
// runs placing and lifting. Rules live in town.js; this file only shows them
// and reports taps.

import { IsoView } from './isoview.js';
import { footBox, tileToWorld, depth } from './iso.js';
import { findPath } from './path.js';
import { MAP, LOT, LOTS_ACROSS, LOTS, HOME_TIERS, TOWN } from './config.js';
import { lotKey, lotOf, tierOf, heartsOf, gapBetween } from './town.js';
import * as A from './art.js';
import { figureSvg } from './portrait.js';
import { zombieSvg, busSvg, ZBOX } from './thrill-art.js';
import { displayName } from './people.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

const rand = (a, b) => a + Math.random() * (b - a);
const FIG = { w: 26, h: 42 }; // a resident at zoom 1 (figureSvg is 30 × 48)
const ZS = 0.66; // zombies
const WALKERS = 22; // at most this many residents walk about at once
const KIND_ICON = { R: 'lot', L: 'landmark', '?': 'mystery' };
const foot = (o) => ({ i: o.i, j: o.j, w: o.size, h: o.size });

export class TownMap {
  /**
   * cb: { onObject(o, el), onPerson(id, el), onLot(a, b, el), onGround(i, j),
   *       onBus(), onLifted(o), onMoved(result, o), onDropped(), onPlaceOk(),
   *       onCamera(), sound, fx }
   */
  constructor(root, town, cb) {
    this.root = root;
    this.town = town;
    this.cb = cb;
    this.sound = cb.sound || (() => {});
    this.fx = cb.fx;
    this.cache = new Map();
    this.walkers = new Map();
    this.zeds = [];
    this.paused = false; // walkers frozen
    this.locked = false; // taps and lifts ignored (a sequence is playing)
    this.placing = null; // { size, art, onOk(i, j), onCancel(), ... }
    this.lifted = null; // { o, from }
    this.hint = null; // what the finger points at: 'upgrade' | 'land' | ...
    this.view = new IsoView(root, { cols: MAP, rows: MAP }, {
      onTap: (t) => this._tap(t),
      onGhostMove: (t) => this._ghostMove(t),
      onLongPress: (t) => this._longPress(t),
      onDrop: (t) => this._drop(t),
      onCamera: () => this._camera(),
    });
    this.view.cam.min = 0.35;
    this.view.cam.max = 1.8;
    this._build();
  }

  _build() {
    const v = this.view;
    for (const sc of A.sceneryParts().reverse()) {
      const scEl = document.createElement('div');
      scEl.className = 'iso-scenery';
      scEl.style.cssText = `left:${sc.left}px;top:${sc.top}px;width:${sc.width}px;height:${sc.height}px`;
      scEl.innerHTML = svgImgPlain(sc.svg);
      v.world.insertBefore(scEl, v.world.firstChild);
    }
    // The evening tint (19:00–06:00 local) sits over the ground and objects, under the pins.
    this.dusk = document.createElement('div');
    this.dusk.className = 'iso-dusk';
    v.world.insertBefore(this.dusk, v.ui);
    this.night = isNight();
    this.root.classList.toggle('night', this.night);
    // 25 lot ground images inside the ground layer.
    const b = v.bounds;
    let html = '';
    for (let lb = 0; lb < LOTS_ACROSS; lb++)
      for (let la = 0; la < LOTS_ACROSS; la++) {
        const box = footBox(la * LOT, lb * LOT, LOT, LOT);
        html += `<div class="lotg" data-lot="${lotKey(la, lb)}" style="left:${box.left - b.left}px;top:${box.top - b.top}px;width:${box.width}px;height:${box.height}px"></div>`;
      }
    v.groundEl.innerHTML = html;
    // Open on Last Stop with its neighbours' tags in view.
    const st = this.town.station();
    v.focus(st.i + 3.5, st.j + 3.5, { zoom: 0.85, ms: 0 });
    this.update(true);
  }

  // --- Camera ----------------------------------------------------------------------------------

  /** Roam your land plus one lot. */
  _roam() {
    let a0 = 9;
    let b0 = 9;
    let a1 = -1;
    let b1 = -1;
    for (const k of Object.keys(this.town.s.lots)) {
      const [a, b] = k.split(',').map(Number);
      a0 = Math.min(a0, a);
      b0 = Math.min(b0, b);
      a1 = Math.max(a1, a);
      b1 = Math.max(b1, b);
    }
    const key = `${a0},${b0},${a1},${b1}`;
    if (this.cache.get('roam') === key) return;
    this.cache.set('roam', key);
    this.view.setRoam(Math.max(-2, (a0 - 1) * LOT + 2), Math.max(-2, (b0 - 1) * LOT + 2), Math.min(MAP + 2, (a1 + 2) * LOT - 2), Math.min(MAP + 2, (b1 + 2) * LOT - 2));
    this.view.apply();
  }

  _camera() {
    if (!this.view) return; // the view's first resize runs before it is assigned
    const z = this.view.cam.zoom;
    const band = z >= 1.2 ? 'near' : z <= 0.62 ? 'far' : 'mid';
    if (band !== this._band) {
      this._band = band;
      this.root.dataset.zoom = band;
    }
    if (this.cb.onCamera) this.cb.onCamera();
  }

  /** Glide to a tile; resolves when there. */
  glide(i, j, { zoom = null, ms = 600, dy = 0 } = {}) {
    return this.view.focus(i, j, { zoom, ms, dy });
  }

  /** Glide only if the tile is off-screen (or near an edge). */
  showTile(i, j, opts = {}) {
    if (this.view.onScreen(i, j, 70)) return Promise.resolve();
    return this.glide(i, j, opts);
  }

  centreTile() {
    const c = this.view.cam;
    const w = c.screenToWorld(c.vw / 2, c.vh / 2);
    return { i: (w.x / 32 + w.y / 16) / 2, j: (w.y / 16 - w.x / 32) / 2 };
  }

  // --- State → map --------------------------------------------------------------------------------

  update(full = false) {
    const night = this.forceNight ?? isNight();
    if (night !== this.night) {
      this.night = night;
      this.root.classList.toggle('night', night);
      full = true;
    }
    if (full) this.cache.clear();
    this._roam();
    this._lots();
    this._objects();
    const occ = this.town.occupancy();
    if (occ !== this._occSeen) {
      this._occSeen = occ;
      this._reroute();
    }
    this._fence();
    this._tags();
    this._bubbles();
    this._syncWalkers();
    if (!this.zeds.length) this._spawnZeds();
    this._bus();
  }

  /** Ground and wild contents per lot (rebuilt only when something there changed). */
  _lots() {
    const m = this.town;
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (let a = 0; a < LOTS_ACROSS; a++) {
        const key = lotKey(a, b);
        const owned = m.owns(a, b);
        const front = m.isFrontier(a, b);
        const haze = !owned && !front;
        const gk = `${owned}|${haze}`;
        if (this.cache.get(`g:${key}`) !== gk) {
          this.cache.set(`g:${key}`, gk);
          const el = this.view.groundEl.querySelector(`[data-lot="${key}"]`);
          el.innerHTML = svgImgPlain(A.lotGround(a, b, { owned, haze, pathAt: () => null, key }));
          el.classList.toggle('owned', owned);
          el.classList.toggle('haze', haze);
        }
        // The wild: a ruin, a ruined landmark (with its boss) or a mystery heap.
        const L = LOTS[key];
        const wid = `wild:${key}`;
        const wk = owned ? '' : `${L.kind}|${haze}`;
        if (this.cache.get(wid) === wk) continue;
        this.cache.set(wid, wk);
        if (owned || L.kind === 'S') {
          this.view.remove(wid);
          continue;
        }
        let art;
        if (L.kind === 'L') art = A.landmark(L.landmark, false);
        else if (L.kind === '?') art = A.mystery(haze);
        else art = A.ruin(key, haze);
        this.view.upsert(wid, { i: a * LOT + 2, j: b * LOT + 2, w: 3, h: 3, html: art.svg, artH: art.artH, cls: `o-wild k-${L.kind}`, lot: [a, b], img: true, hitH: art.bodyH, tallH: art.artH - 3 * 32 - 12 });
        if (L.kind === 'L') this._boss(key, L.landmark);
      }
  }

  /** The boss zombie waves from the ruined landmark's roof. */
  _boss(key, id) {
    const spot = A.bossSpot(id);
    const art = A.landmark(id, false);
    const el = this.view.objectEl(`wild:${key}`);
    if (!el || !spot) return;
    const W = 6 * 32;
    const [bw, bh] = ZBOX.walker;
    const boss = document.createElement('div');
    boss.className = 'boss';
    boss.style.cssText = `left:${(spot.x / W) * 100}%;top:${(spot.y / art.artH) * 100}%;width:${bw * 0.75}px;height:${bh * 0.75}px`;
    boss.innerHTML = `${zombieSvg('walker', { variant: 2 })}<div class="bprop">${A.bossProp(id)}</div>`;
    el.appendChild(boss);
  }

  _objHtml(o) {
    const m = this.town;
    const night = this.night;
    if (o.kind === 'station') return A.building('bigtop', m.stationLevel(), TOWN, Math.min(6, m.lotCount()), night);
    if (o.kind === 'home') {
      const p = m.person(o.ref);
      if (!p) return A.boxArt(2, 2, 20, '#ccc');
      return A.home(p, HOME_TIERS[tierOf(p.level)].id, { hearts: heartsOf(p.level), legend: p.rarity === 'legend', night });
    }
    if (o.kind === 'decor') return A.decoration(o.ref, night);
    if (o.kind === 'landmark') return A.landmark(o.ref, true, TOWN, { night });
    return A.boxArt(o.size, o.size, 20);
  }

  _objKey(o) {
    const m = this.town;
    const n = this.night ? 'n' : 'd';
    if (o.kind === 'station') return `${m.stationLevel()}|${Math.min(6, m.lotCount())}|${n}`;
    if (o.kind === 'home') {
      const p = m.person(o.ref);
      return p ? `${tierOf(p.level)}|${p.level}|${n}` : 'x';
    }
    return `${o.ref}|${n}`;
  }

  _objects() {
    const m = this.town;
    const seen = new Set();
    for (const o of m.s.objects) {
      const id = `o${o.id}`;
      seen.add(id);
      if (this.lifted && this.lifted.o.id === o.id) continue;
      const key = `${this._objKey(o)}|${o.i},${o.j}`;
      if (this.cache.get(id) === key) continue;
      const was = this.cache.get(id);
      this.cache.set(id, key);
      const art = this._objHtml(o);
      const el = this.view.upsert(id, { i: o.i, j: o.j, w: o.size, h: o.size, html: art.svg, artH: art.artH, cls: `o-${o.kind}${o.kind === 'station' ? ' b-bigtop' : ''}`, oid: o.id, img: true, hitH: art.bodyH, tallH: o.kind === 'landmark' ? art.artH - 3 * 32 - 12 : undefined });
      // A front overlay (a hot tub's wall, a hammock's lip) so someone can sit in it.
      if (art.front) this.view.upsert(`of${o.id}`, { i: o.i, j: o.j, w: o.size, h: o.size, html: art.front.svg, artH: art.front.artH, cls: 'o-front', z: art.front.z ?? 2, img: true, noTap: true });
      else this.view.remove(`of${o.id}`);
      // It changed look (a level-up, the station fixing itself up): a little pop.
      if (was && was.split('|').slice(0, -1).join('|') !== key.split('|').slice(0, -1).join('|')) {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }
    for (const id of [...this.view.objects.keys()]) {
      if (id.startsWith('of')) {
        if (!seen.has(`o${id.slice(2)}`)) this.view.remove(id);
        continue;
      }
      if (id.startsWith('o') && !seen.has(id) && !(this.lifted && id === `o${this.lifted.o.id}`)) {
        this.view.remove(id);
        this.cache.delete(id);
      }
    }
  }

  objectEl(id) {
    return this.view.objectEl(`o${id}`);
  }

  stationEl() {
    const st = this.town.station();
    return st ? this.objectEl(st.id) : null;
  }

  homeEl(personId) {
    const o = this.town.homeOf(personId);
    return o ? this.objectEl(o.id) : null;
  }

  /** The fence on your border: back edges low in the draw order, front edges in 2-tile pieces. */
  _fence() {
    const m = this.town;
    const tier = m.fenceTier();
    const edges = m.fenceEdges();
    const color = TOWN.color;
    const key = `${tier}|${edges.map((e) => `${e.a}${e.b}${e.side}`).join(',')}`;
    if (this.cache.get('fence') === key) return;
    const before = this.cache.get('fence');
    this.cache.set('fence', key);
    for (const id of [...this.view.objects.keys()]) if (id.startsWith('f:')) this.view.remove(id);
    for (const e of edges) {
      const I = e.a * LOT;
      const J = e.b * LOT;
      const back = e.side === 'i0' || e.side === 'j0';
      const pieces = back ? [[0, LOT]] : [[0, 2], [2, 2], [4, 2], [6, 1]];
      for (const [off, len] of pieces) {
        const f = A.fence(tier, e.side, len, color, e.a * 7 + e.b * 3 + off, off, LOT);
        if (!f) continue;
        let i;
        let j;
        let w;
        let h;
        if (e.side === 'i0' || e.side === 'i1') {
          i = e.side === 'i0' ? I : I + LOT - 1;
          j = J + off;
          w = 1;
          h = len;
        } else {
          j = e.side === 'j0' ? J : J + LOT - 1;
          i = I + off;
          w = len;
          h = 1;
        }
        // Back edges sit under everything on the lot; front pieces over what stands behind them.
        const z = back ? -depth(i, j, w, h) * 10 + (I + J) * 10 - 4 : 8;
        this.view.upsert(`f:${e.a},${e.b},${e.side},${off}`, { i, j, w, h, html: f.svg, artH: f.artH, cls: `o-fence${before ? ' hop' : ''}`, z, noTap: true, img: true, fence: back ? 'back' : 'front' });
      }
    }
  }

  /** A price tag on every lot next to your land; names over the far ones. */
  _tags() {
    const m = this.town;
    const v = this.view;
    const live = new Set();
    const price = m.landPrice();
    const hot = this.hint === 'land' ? m.suggestLot() : null;
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (let a = 0; a < LOTS_ACROSS; a++) {
        const key = lotKey(a, b);
        const L = LOTS[key];
        if (m.owns(a, b)) continue;
        const c = tileToWorld(a * LOT + 3.5, b * LOT + 3.5);
        if (m.isFrontier(a, b)) {
          const isHot = !!hot && hot.key === key;
          const can = m.s.coins >= price;
          const html =
            `<button class="tag k-${KIND_ICON[L.kind]}${can ? ' can' : ''}${isHot ? ' hot' : ''}" type="button" data-ui="lot" data-lot="${key}">` +
            `<span class="ti">${A.townIcon(KIND_ICON[L.kind])}</span><span class="tt"><b>${esc(L.name)}</b><em class="pr${can ? '' : ' short'}">${icon('coin')}${price}</em></span>${isHot ? `<i class="arrow">${icon('up')}</i>` : ''}</button>`;
          v.pin(`t:${key}`, c.x, c.y - 34, html, 'pin-tag');
          live.add(`t:${key}`);
        } else {
          v.pin(`n:${key}`, c.x, c.y - 50, `<span class="lname far">${esc(L.name)}</span>`, 'pin-name');
          live.add(`n:${key}`);
        }
      }
    for (const el of [...v.ui.querySelectorAll('.pin-tag, .pin-name')]) if (!live.has(el.dataset.pin)) el.remove();
  }

  tagEl(a, b) {
    const el = this.view.pinEl(`t:${lotKey(a, b)}`);
    return el ? el.querySelector('.tag') : null;
  }

  /** The ↑ over the home of whoever goes out tonight, when their upgrade is affordable. */
  _bubbles() {
    const m = this.town;
    const v = this.view;
    const live = new Set();
    const p = m.picked();
    const h = p && m.homeOf(p.id);
    if (h && m.canUpgrade(p.id).ok && !this.placing) {
      const art = this._objHtml(h);
      const c = tileToWorld(h.i, h.j);
      const y = tileToWorld(h.i + h.size, h.j + h.size).y - art.artH + 6;
      const hot = this.hint === 'upgrade';
      v.pin(`up:${h.id}`, c.x, y, `<button class="bub up${hot ? ' hot' : ''}" type="button" data-ui="up" data-id="${h.id}">${icon('up')}</button>`, 'pin-bub');
      live.add(`up:${h.id}`);
    }
    for (const el of [...v.ui.querySelectorAll('.pin-bub')]) if (!live.has(el.dataset.pin)) el.remove();
  }

  pinEl(id) {
    const el = this.view.pinEl(id);
    return el ? el.firstElementChild || el : null;
  }

  // --- Placing and lifting ------------------------------------------------------------------------

  /** Show a ghost to place something new. opts: { size, art, at, onOk(i, j) -> result, onCancel() } */
  startPlace(opts) {
    this.endPlace();
    this._unlift();
    const m = this.town;
    const c = this.centreTile();
    const at = opts.at || m.freeSpot(opts.size, { i: c.i, j: c.j }) || { i: Math.round(c.i - opts.size / 2), j: Math.round(c.j - opts.size / 2) };
    this.placing = { ...opts, i: at.i, j: at.j };
    this._showPlace();
    this._bubbles();
    if (!this.view.onScreen(at.i + opts.size / 2, at.j + opts.size / 2, 110)) this.glide(at.i + opts.size / 2, at.j + opts.size / 2, { ms: 400 });
  }

  _valid(i, j, size, ignore = null) {
    return this.town.canPlaceAt(i, j, size, ignore).ok;
  }

  _showPlace() {
    const P = this.placing;
    if (!P) return;
    const valid = this._valid(P.i, P.j, P.size, P.ignore || null);
    P.valid = valid;
    this.view.showGhost({ i: P.i, j: P.j, w: P.size, h: P.size, html: P.art.svg, artH: P.art.artH, valid, lifted: !!P.lift });
    // ✓ / ✕ float beside the ghost (not while a finger is dragging it).
    if (!P.lift) {
      const r = tileToWorld(P.i + P.size, P.j); // right corner
      const btns = `<div class="okx"><button class="okb${valid ? '' : ' off'}" type="button" data-ui="place-ok">${icon('check')}</button><button class="xb" type="button" data-ui="place-x">${icon('close')}</button></div>`;
      this.view.pin('placebtns', r.x + 8, r.y - 8, btns, 'pin-okx');
    } else this.view.unpin('placebtns');
  }

  _ghostMove({ i, j }) {
    const P = this.placing;
    if (!P) return;
    if (i === P.i && j === P.j) return;
    P.i = i;
    P.j = j;
    this._showPlace();
    this.sound('tick', { quiet: true });
  }

  placeOk() {
    const P = this.placing;
    if (!P) return null;
    if (!this._valid(P.i, P.j, P.size, P.ignore || null)) {
      this.sound('error');
      if (this.fx) this.fx.shake(this.view.objectEl('__ghost'));
      return null;
    }
    const r = P.onOk(P.i, P.j);
    if (r && r.ok) {
      const at = { i: P.i, j: P.j, size: P.size };
      this.endPlace();
      this.update();
      this.thud(at);
    }
    return r;
  }

  placeCancel() {
    const P = this.placing;
    this.endPlace();
    if (P && P.onCancel) P.onCancel();
    this.update();
  }

  endPlace() {
    if (!this.placing) return;
    this.placing = null;
    this.view.hideGhost();
    this.view.unpin('placebtns');
  }

  /** Dust and a bump where something landed. */
  thud(at) {
    const c = tileToWorld(at.i + at.size / 2, at.j + at.size / 2);
    const s = this.view.cam.worldToScreen(c.x, c.y);
    const r = this.root.getBoundingClientRect();
    if (this.fx) this.fx.burst({ left: s.x + r.left - 20, top: s.y + r.top - 10, width: 40, height: 20 }, ['#e9d8b4', '#c9b48a', '#ffffff'], 14, 50);
    this.sound('thud');
  }

  /** Long press: lift anything you've placed. */
  _longPress({ id }) {
    if (this.placing || this.paused || this.locked) return false;
    if (!id || !id.startsWith('o')) return false;
    const o = this.town.object(Number(id.slice(1)));
    if (!o) return false;
    return this.lift(o);
  }

  /** Lift something placed: it follows the finger (or, byTap, waits for ✓); let go on green to move it. */
  lift(o, { byTap = false } = {}) {
    this.endPlace();
    this._unlift();
    const art = this._objHtml(o);
    this.lifted = { o, from: { i: o.i, j: o.j } };
    const el = this.objectEl(o.id);
    if (el) el.classList.add('liftsrc');
    this.placing = {
      size: o.size,
      art,
      i: o.i,
      j: o.j,
      ignore: o.id,
      lift: !byTap,
      onOk: (i, j) => this._moveTo(o, i, j),
      onCancel: () => {
        this._unlift();
        if (this.cb.onDropped) this.cb.onDropped();
      },
    };
    this._showPlace();
    this._bubbles();
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch {
      // unsupported
    }
    this.sound('lift');
    if (this.cb.onLifted) this.cb.onLifted(o);
    return true;
  }

  _moveTo(o, i, j) {
    const from = { i: o.i, j: o.j };
    const r = this.town.move(o.id, i, j);
    this._unlift();
    if (r.ok && (from.i !== i || from.j !== j)) {
      if (this.cb.onMoved) this.cb.onMoved(r, o);
    } else if (r.ok && this.cb.onDropped) this.cb.onDropped();
    return r;
  }

  _unlift() {
    if (!this.lifted) return;
    const el = this.objectEl(this.lifted.o.id);
    if (el) el.classList.remove('liftsrc');
    this.cache.delete(`o${this.lifted.o.id}`);
    this.lifted = null;
  }

  _drop({ i, j, cancel }) {
    const P = this.placing;
    if (!P) return;
    if (cancel && this.lifted && P.lift) {
      // The system took the touch: not a let-go, so it slides home.
      this.endPlace();
      this._unlift();
      this.update();
      if (this.cb.onDropped) this.cb.onDropped();
      return;
    }
    P.i = i;
    P.j = j;
    if (this.lifted && P.lift) {
      // A drag-lift lands where it's let go (or slides home on red).
      const o = this.lifted.o;
      if (this._valid(i, j, P.size, o.id)) {
        const r = this._moveTo(o, i, j);
        const at = { i, j, size: P.size };
        this.endPlace();
        this.update();
        if (r && r.ok) this.thud(at);
      } else {
        this.sound('error');
        this.endPlace();
        this._unlift();
        this.update();
      }
      if (this.cb.onDropped) this.cb.onDropped();
      return;
    }
    // A new thing being placed: it stays where it was let go; ✓ confirms.
    this._showPlace();
  }

  // --- Taps ------------------------------------------------------------------------------------------

  _tap({ id, ui, i, j }) {
    if (this.paused || this.locked) return;
    if (ui) {
      const b = ui.closest('[data-ui]') || ui.querySelector('[data-ui]');
      if (!b) return;
      const k = b.dataset.ui;
      if (k === 'place-ok') return this.cb.onPlaceOk ? this.cb.onPlaceOk() : this.placeOk();
      if (k === 'place-x') return this.placeCancel();
      if (this.placing) return; // a ghost is up: only ✓ / ✕ answer
      if (k === 'lot') {
        const [a, bb] = b.dataset.lot.split(',').map(Number);
        return this.cb.onLot(a, bb, b);
      }
      if (k === 'up') return this.cb.onObject(this.town.object(Number(b.dataset.id)), b);
      return;
    }
    if (this.placing) {
      // Tapping the map moves the ghost there.
      if (!this.placing.lift) {
        const P = this.placing;
        this._ghostMove({ i: i - Math.floor(P.size / 2), j: j - Math.floor(P.size / 2) });
      }
      return;
    }
    if (id && id.startsWith('w:')) {
      const wid = id.slice(2);
      if (wid.startsWith('z')) return this._bonkZed(wid);
      if (wid === 'bus') return this.cb.onBus && this.cb.onBus();
      const pid = Number(wid);
      return this.cb.onPerson(pid, this.view.walkerEl(pid));
    }
    if (id && id.startsWith('o')) {
      const o = this.town.object(Number(id.slice(1)));
      if (o) return this.cb.onObject(o, this.view.objectEl(id));
    }
    // A tall ruin or landmark reaches over the lot behind it: its own lot answers.
    if (id && id.startsWith('wild:')) {
      const [wa, wb] = id.slice(5).split(',').map(Number);
      return this.cb.onLot(wa, wb, this.view.objectEl(id));
    }
    const { a, b } = lotOf(i, j);
    if (i < 0 || j < 0 || i >= MAP || j >= MAP) return;
    if (this.town.owns(a, b)) return this.cb.onGround && this.cb.onGround(i, j);
    return this.cb.onLot(a, b, null);
  }

  // --- Residents -------------------------------------------------------------------------------------

  /** Who walks: tonight's pick, the 3 newest, then a slow rotation of everyone else. */
  _visible() {
    const m = this.town;
    const s = m.s;
    const out = [];
    const add = (p) => {
      if (p && m.homeOf(p.id) && !out.includes(p)) out.push(p);
    };
    add(m.picked());
    s.people
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, 3)
      .forEach(add);
    const rest = s.people.filter((p) => !out.includes(p) && m.homeOf(p.id));
    const rot = Math.floor(performance.now() / 90000);
    for (let k = 0; k < rest.length && out.length < WALKERS; k++) out.push(rest[(k + rot * 5) % rest.length]);
    return out.slice(0, WALKERS);
  }

  _syncWalkers() {
    const m = this.town;
    const vis = this._visible();
    const ids = new Set(vis.map((p) => p.id));
    for (const id of [...this.walkers.keys()]) {
      if (ids.has(id)) continue;
      this.view.removeWalker(id);
      this.walkers.delete(id);
    }
    const pick = m.picked();
    for (const p of vis) {
      let w = this.walkers.get(p.id);
      if (!w) w = this._addWalker(p);
      const key = `${p.level}:${pick && pick.id === p.id}`;
      if (w.key !== key) {
        w.key = key;
        w.picked = !!pick && pick.id === p.id;
        this._render(w, true);
      }
    }
  }

  _addWalker(p, from = null) {
    const h = this.town.homeOf(p.id);
    const start = from || this._door(h) || { i: h.i + h.size + 0.5, j: h.j + 0.5 };
    const w = { id: p.id, fi: start.i + 0.5, fj: start.j + 0.5, path: [], wait: rand(0.2, 4), pose: 'idle', then: 'idle', face: 1, picked: false, key: '', vibe: p.vibe, cls: p.cls };
    this.walkers.set(p.id, w);
    this._render(w, true);
    return w;
  }

  _render(w, html = false) {
    const p = this.town.person(w.id);
    if (!p) return;
    const opts = { w: FIG.w, h: FIG.h, flip: w.face < 0, z: w.seat ? w.seat.z : null, lift: w.seat ? w.seat.lift : 0 };
    if (html) opts.html = `<div class="wfig v-${p.vibe}${w.picked ? ' picked' : ''} p-${w.pose}">${svgImgPlain(figureSvg(p, { pose: w.pose }))}</div><span class="wname">${esc(displayName(p))}</span>`;
    const el = this.view.walker(w.id, w.fi, w.fj, opts);
    el.classList.toggle('walking', !!w.path.length);
    el.classList.toggle('flip', w.face < 0);
  }

  _setPose(w, pose) {
    if (w.pose === pose) return;
    w.pose = pose;
    this._render(w, true);
  }

  /** A free tile in front of a footprint (where you'd stand to use it). */
  _door(o, { seat = false } = {}) {
    if (!o) return null;
    const m = this.town;
    // The art's own spot just in front of the door (fractional), when it's walkable.
    const art = this._objHtml(o);
    const d = art.door || (o.kind === 'station' && A.ANCHORS.bigtop && A.ANCHORS.bigtop.spot) || null;
    if (d) {
      const ei = o.i + d[0];
      const ej = o.j + d[1];
      const ti = Math.floor(ei);
      const tj = Math.floor(ej);
      if (this._walkable(ti, tj)) {
        const out = { i: ti, j: tj, exact: { i: ei, j: ej } };
        // Pieces you use from on top (a bench, the hot tub, a trampoline): hop on.
        const sp = art.spot;
        if (seat && sp && sp.over) out.seat = { i: o.i + sp.u, j: o.j + sp.v, lift: sp.z || 0, oid: o.id, at: `${o.i},${o.j}`, act: sp.act };
        return out;
      }
    }
    const n = o.size;
    const mid = Math.floor(n / 2);
    const cand = [];
    for (let k = 0; k < n; k++) cand.push([o.i + n, o.j + k], [o.i + k, o.j + n]);
    cand.push([o.i + n, o.j + n], [o.i - 1, o.j + mid], [o.i + mid, o.j - 1]);
    for (const [i, j] of cand) if (m.ownsTile(i, j) && !m.blocked(i, j)) return { i, j };
    return null;
  }

  _walkable(i, j) {
    const m = this.town;
    return m.ownsTile(i, j) && !m.blocked(i, j);
  }

  _route(w, to) {
    if (!to) return false;
    const si = Math.floor(w.fi);
    const sj = Math.floor(w.fj);
    const blocked = (i, j) => !this._walkable(i, j);
    const p = findPath(MAP, MAP, blocked, si, sj, to.i, to.j, 2500);
    if (!p) return false;
    this._unseat(w);
    w.path = p.map(([i, j]) => ({ i: i + 0.5, j: j + 0.5 }));
    if (to.exact) w.path.push({ i: to.exact.i, j: to.exact.j });
    if (to.seat) w.path.push({ i: to.seat.i, j: to.seat.j, seat: to.seat });
    return true;
  }

  /** Something was placed or moved: walkers on its way find another way (or step out from under it). */
  _reroute() {
    for (const w of this.walkers.values()) {
      if ((w.sprint && w.path.length) || w.seat) continue; // a sprint into the wild goes straight on purpose
      const ci = Math.floor(w.fi);
      const cj = Math.floor(w.fj);
      const endRun = () => {
        w.run = false;
        w.sprint = false;
        w.runSpeed = 0;
      };
      if (!this._walkable(ci, cj)) {
        const t = this._nearestFree(ci, cj);
        w.path = t ? [{ i: t.i + 0.5, j: t.j + 0.5 }] : [];
        w.then = 'idle';
        w.heart = false;
        endRun();
        continue;
      }
      if (!w.path.length) continue;
      const end = w.path[w.path.length - 1];
      if (end.seat) {
        const o = this.town.object(end.seat.oid);
        if (!o || `${o.i},${o.j}` !== end.seat.at) {
          w.path = [];
          w.wait = 0;
          endRun();
          continue;
        }
      }
      const steps = w.path.filter((q) => !q.seat);
      if (steps.some((q) => !this._walkable(Math.floor(q.i), Math.floor(q.j)))) {
        const last = steps[steps.length - 1];
        if (!last || !this._walkable(Math.floor(last.i), Math.floor(last.j)) || !this._route(w, { i: Math.floor(last.i), j: Math.floor(last.j) })) {
          w.path = [];
          w.wait = 0;
          endRun();
        }
      }
    }
  }

  _nearestFree(i, j) {
    for (let r = 1; r <= 6; r++)
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this._walkable(i + di, j + dj)) return { i: i + di, j: j + dj };
        }
    return null;
  }

  /** Sit (or stand) on a piece: drawn just over it, lifted by the seat height. */
  _seat(w, seat) {
    const rec = this.view.objects.get(`o${seat.oid}`);
    if (!rec) return;
    w.seat = { ...seat, z: rec.zi + 1 };
    const pose = { sit: 'sleep', nap: 'sleep', soak: 'sleep', bounce: 'cheer', perform: 'cheer', dance: 'cheer', slide: 'cheer', putt: 'cheer', climb: 'wave', salute: 'wave', ride: 'wave', pose: 'wave' }[seat.act];
    if (pose) w.then = pose;
  }

  _unseat(w) {
    if (!w.seat) return;
    w.seat = null;
    this.view.walker(w.id, w.fi, w.fj, { z: null, lift: 0 });
  }

  /** Where someone wanders next: home, a decoration (and on it), a neighbour, the station, a stroll. */
  _pickGoal(w) {
    const m = this.town;
    const s = m.s;
    const p = m.person(w.id);
    if (!p) return null;
    const r = Math.random();
    const homeO = m.homeOf(p.id);
    if (w.picked && r < 0.3) {
      const st = m.station();
      if (st) return { to: this._door(st), then: 'cheer' };
    }
    if (this.night && p.vibe === 'sleepy') return { to: this._door(homeO), then: 'sleep' };
    if (r < 0.25) return { to: this._door(homeO), then: p.vibe === 'sleepy' ? 'sleep' : 'idle' };
    if (r < 0.65) {
      const items = s.objects.filter((o) => o.kind === 'decor' || o.kind === 'landmark');
      if (items.length) {
        const it = items[Math.floor(Math.random() * items.length)];
        const pose = { sleepy: 'sleep', sunny: 'idle', showoff: 'cheer', jumpy: 'wave' }[p.vibe] || 'idle';
        return { to: this._door(it, { seat: true }), then: pose };
      }
    }
    if (r < 0.8 && homeO) {
      const near = s.objects.filter((o) => o.kind === 'home' && o.ref !== p.id && gapBetween(foot(o), foot(homeO)) <= 3);
      if (near.length) return { to: this._door(near[Math.floor(Math.random() * near.length)]), then: 'wave', heart: true };
    }
    // Stroll: any free tile on your land.
    const keys = Object.keys(s.lots);
    for (let k = 0; k < 12; k++) {
      const [a, b] = keys[Math.floor(Math.random() * keys.length)].split(',').map(Number);
      const i = a * LOT + Math.floor(Math.random() * LOT);
      const j = b * LOT + Math.floor(Math.random() * LOT);
      if (this._walkable(i, j)) return { to: { i, j }, then: 'idle' };
    }
    return null;
  }

  /** A newcomer arrives: their figure drops onto their home's doorstep and waves. */
  arrive(id) {
    const p = this.town.person(id);
    if (!p || !this.town.homeOf(id)) return;
    let w = this.walkers.get(id);
    if (!w) w = this._addWalker(p);
    w.wait = 1.2;
    this._setPose(w, 'wave');
    const el = this.view.walkerEl(id);
    if (el) {
      el.classList.remove('drop');
      void el.offsetWidth;
      el.classList.add('drop');
    }
  }

  cheerPerson(id) {
    const w = this.walkers.get(id);
    if (!w) return;
    w.path = [];
    this._setPose(w, 'cheer');
    w.wait = 2.5;
    const el = this.view.walkerEl(id);
    if (el) {
      el.classList.remove('jump');
      void el.offsetWidth;
      el.classList.add('jump');
    }
  }

  /** The nearest few run to something and cheer. */
  cheerAt(o, n = 5) {
    let k = 0;
    for (const w of this.walkers.values()) {
      if (k >= n) break;
      if (this._route(w, this._door(o)) && w.path.length) {
        k++;
        w.then = 'cheer';
        w.wait = 0;
        w.run = true;
      }
    }
  }

  walkerEl(id) {
    const el = this.view.walkerEl(id);
    return el ? el.querySelector('.wfig') || el : null;
  }

  /** Bring someone's figure out of view (they're out for the night) or back. */
  setAway(id, away) {
    const el = this.view.walkerEl(id);
    if (el) el.classList.toggle('away', away);
  }

  // --- The bus and the zombies ----------------------------------------------------------------------

  _bus() {
    const st = this.town.station();
    if (!st) return;
    const key = `${st.i},${st.j},${this.busAway ? 1 : 0}`;
    if (this.cache.get('bus') !== key && !this.busAway) this.view.removeWalker('bus');
    if (this.cache.get('bus') === key) return;
    this.cache.set('bus', key);
    if (this.busAway) {
      this.view.removeWalker('bus');
      return;
    }
    // The bus parks at the pumps (inside the station's footprint), drawn just over it.
    const [bu, bv] = (A.ANCHORS.bigtop && A.ANCHORS.bigtop.bus) || [st.size + 0.05, st.size - 0.3];
    this.view.walker('bus', st.i + bu, st.j + bv, { html: `<div class="busfig">${svgImgPlain(busSvg())}</div>`, w: 66, h: 38 });
  }

  /** Wild zombies doze and bump the front fence (on lots in front of your land). */
  _spawnZeds() {
    const spots = this._fenceFront();
    if (!spots.length) return;
    const kinds = ['walker', 'runner', 'walker', 'brute'];
    for (let k = 0; k < 4; k++) {
      const sp = spots[(k * 3) % spots.length];
      const z = { id: `z${k}`, kind: kinds[k], variant: k % 4, edge: sp, t: Math.random(), v: rand(0.08, 0.16) * (Math.random() < 0.5 ? -1 : 1), down: 0, bump: rand(3, 10) };
      this.zeds.push(z);
      this._placeZed(z, true);
    }
  }

  /** Front fence lines (outside your land at higher i or j), as segments in tile space. */
  _fenceFront() {
    const out = [];
    for (const e of this.town.fenceEdges()) {
      const I = e.a * LOT;
      const J = e.b * LOT;
      if (e.side === 'i1' && e.a < LOTS_ACROSS - 1) out.push({ i0: I + LOT + 1.6, j0: J + 0.6, i1: I + LOT + 1.6, j1: J + LOT - 0.6 });
      if (e.side === 'j1' && e.b < LOTS_ACROSS - 1) out.push({ i0: I + 0.6, j0: J + LOT + 1.6, i1: I + LOT - 0.6, j1: J + LOT + 1.6 });
    }
    return out;
  }

  /** The fence moved (a clear): zombies find the new front. */
  resetZeds() {
    for (const z of this.zeds) this.view.removeWalker(z.id);
    this.zeds = [];
    this._spawnZeds();
  }

  _placeZed(z, html = false) {
    const e = z.edge;
    z.fi = e.i0 + (e.i1 - e.i0) * z.t;
    z.fj = e.j0 + (e.j1 - e.j0) * z.t;
    const [bw, bh] = ZBOX[z.kind];
    const opts = { w: bw * ZS, h: bh * ZS, flip: z.v < 0 };
    if (html) opts.html = `<div class="zfig${z.down > 0 ? ' down' : ''}">${svgImgPlain(zombieSvg(z.kind, { variant: z.variant, ko: z.down > 0 }))}</div>`;
    this.view.walker(z.id, z.fi, z.fj, opts);
  }

  _bonkZed(id) {
    const z = this.zeds.find((q) => q.id === id);
    if (!z || z.down > 0) return;
    z.down = 3.5;
    this._placeZed(z, true);
    this.sound('bonk');
    const el = this.view.walkerEl(z.id);
    if (el && this.fx) {
      const r = el.getBoundingClientRect();
      this.fx.float({ x: r.left + r.width / 2, y: r.top }, 'BONK!', 'bonk');
    }
  }

  // --- Clear sequence pieces (main.js runs the beats) --------------------------------------------------

  /** Grass blooms tile by tile over a lot (1.2 s). */
  bloom(a, b) {
    const box = footBox(a * LOT, b * LOT, LOT, LOT);
    const el = document.createElement('div');
    el.className = 'bloomov';
    el.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
    el.innerHTML = A.bloomTiles(a, b);
    this.view.world.insertBefore(el, this.view.layer);
    setTimeout(() => el.remove(), 1700);
  }

  /** A sign rises over the lot. */
  sign(a, b, text) {
    const c = tileToWorld(a * LOT + 3.5, b * LOT + 3.5);
    const el = this.view.pin(`sign:${a},${b}`, c.x, c.y - 70, `<div class="risesign"><b>${esc(text.toUpperCase())}</b></div>`, 'pin-sign');
    setTimeout(() => this.view.unpin(`sign:${a},${b}`), 3200);
    return el;
  }

  /** A few residents sprint into a lot (the BONK run): tonight's pick and the two nearest. */
  runTo(a, b) {
    const target = { i: a * LOT + 3, j: b * LOT + 3 };
    const pick = this.town.picked();
    const ws = [...this.walkers.values()].sort((x, y) => (pick && y.id === pick.id) - (pick && x.id === pick.id) || Math.hypot(x.fi - target.i, x.fj - target.j) - Math.hypot(y.fi - target.i, y.fj - target.j)).slice(0, 3);
    for (const w of ws) {
      this._unseat(w);
      // Straight there (the wild is not walkable by the rules, so no A* here).
      const n = 10;
      const fi0 = w.fi;
      const fj0 = w.fj;
      const ti = target.i + rand(-1.5, 1.5);
      const tj = target.j + rand(-1.5, 1.5);
      w.path = Array.from({ length: n }, (_, k) => ({ i: fi0 + ((ti - fi0) * (k + 1)) / n, j: fj0 + ((tj - fj0) * (k + 1)) / n }));
      w.run = true;
      w.sprint = true;
      w.runSpeed = Math.max(3.2, Math.hypot(ti - fi0, tj - fj0) / 0.45); // there in time for the BONK
      w.then = 'cheer';
      w.wait = 2;
    }
  }

  /** The ruin crumbles (drops out). */
  crumble(a, b) {
    const el = this.view.objectEl(`wild:${lotKey(a, b)}`);
    if (el) el.classList.add('crumble');
    return el;
  }

  wildEl(a, b) {
    return this.view.objectEl(`wild:${lotKey(a, b)}`);
  }

  // --- Frame ----------------------------------------------------------------------------------------------

  tick(dt) {
    this.view.tick(dt);
    if (this.paused) return;
    const sec = Math.min(0.1, dt / 1000);
    for (const w of this.walkers.values()) {
      if (w.path.length) {
        const t = w.path[0];
        const di = t.i - w.fi;
        const dj = t.j - w.fj;
        const d = Math.hypot(di, dj);
        const sp = (w.run ? w.runSpeed || 3.2 : 1.1) * sec;
        if (d <= sp) {
          w.fi = t.i;
          w.fj = t.j;
          w.path.shift();
          if (t.seat) this._seat(w, t.seat);
        } else {
          w.fi += (di / d) * sp;
          w.fj += (dj / d) * sp;
        }
        // Screen-x direction: x grows with (i - j).
        const sx = di - dj;
        if (Math.abs(sx) > 0.01) w.face = sx > 0 ? 1 : -1;
        if (w.pose !== 'idle') this._setPose(w, 'idle');
        this._render(w);
        if (!w.path.length) {
          w.run = false;
          w.sprint = false;
          w.runSpeed = 0;
          // A sprint can end inside something that landed meanwhile: step out.
          if (!w.seat && !this._walkable(Math.floor(w.fi), Math.floor(w.fj)) && this.town.ownsTile(Math.floor(w.fi), Math.floor(w.fj))) {
            const t2 = this._nearestFree(Math.floor(w.fi), Math.floor(w.fj));
            if (t2) w.path = [{ i: t2.i + 0.5, j: t2.j + 0.5 }];
          }
          if (w.then) this._setPose(w, w.then);
          if (w.heart && this.fx) {
            const el = this.view.walkerEl(w.id);
            if (el) this.fx.float(el.getBoundingClientRect(), icon('heart'), 'heart');
          }
          w.heart = false;
          w.then = null;
          w.wait = rand(4, 9);
          this._render(w);
        }
        continue;
      }
      // The piece someone sits on was moved: hop off.
      if (w.seat) {
        const o = this.town.object(w.seat.oid);
        if (!o || `${o.i},${o.j}` !== w.seat.at) {
          this._unseat(w);
          w.wait = 0;
        }
      }
      if (w.run) {
        w.run = false; // a run with nowhere to go ends
        w.runSpeed = 0;
      }
      w.wait -= sec;
      if (w.wait <= 0) {
        w.wait = rand(6, 12);
        const g = this._pickGoal(w);
        if (g && this._route(w, g.to)) {
          w.then = g.then;
          w.heart = !!g.heart;
        }
      }
    }
    for (const z of this.zeds) {
      if (z.down > 0) {
        z.down -= sec;
        if (z.down <= 0) this._placeZed(z, true);
        continue;
      }
      const e = z.edge;
      const len = Math.hypot(e.i1 - e.i0, e.j1 - e.j0) || 1;
      z.t += (z.v * sec) / len;
      if (z.t < 0 || z.t > 1) {
        z.v = -z.v;
        z.t = Math.max(0, Math.min(1, z.t));
        this._placeZed(z, true);
      } else this._placeZed(z);
      z.bump -= sec;
      if (z.bump <= 0) {
        z.bump = rand(6, 16);
        const el = this.view.walkerEl(z.id);
        if (el) {
          el.classList.remove('bumping');
          void el.offsetWidth;
          el.classList.add('bumping');
        }
        for (const w of this.walkers.values()) {
          if (w.vibe !== 'jumpy') continue;
          const el2 = this.view.walkerEl(w.id);
          if (!el2) continue;
          el2.classList.remove('jump');
          void el2.offsetWidth;
          el2.classList.add('jump');
        }
      }
    }
  }
}

/** A flat image of an SVG (ground, scenery, figures): no padding, fills its box. */
const plainCache = new Map();
export function svgImgPlain(svg) {
  let url = plainCache.get(svg);
  if (!url) {
    let src = svg;
    if (!/xmlns=/.test(src.slice(0, 300))) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    plainCache.set(svg, url);
    if (plainCache.size > 400) plainCache.delete(plainCache.keys().next().value);
  }
  return `<img src="${url}" alt="" draggable="false" style="display:block;width:100%;height:100%;overflow:visible">`;
}

/** Evening (19:00–06:00 local): sleepy people go home. */
export function isNight(d = new Date()) {
  const h = d.getHours();
  return h >= 19 || h < 6;
}
