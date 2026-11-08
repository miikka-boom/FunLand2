// The town map: the iso view of Last Stop. Draws the ground (one image per
// lot), the wild (ruins, landmarks with their bosses, mystery heaps), your
// buildings, homes and decorations, junk piles, the fence, floating tags and
// bubbles, residents walking about on A* paths and goofy zombies at the fence.
// It also runs placing, lifting and path painting. Rules live in town.js; this
// file only shows them and reports taps.

import { IsoView, svgImg } from './isoview.js';
import { footBox, tileToWorld, diamondPoints } from './iso.js';
import { findPath } from './path.js';
import { MAP, LOT, LOTS_ACROSS, LOTS, LOT_KINDS, LANDMARKS, BUILDINGS, DECOR, KEEPSAKES, HOME_TIERS, CLASSES, SETS, TOWN_COLORS, ROOF_TENTS, PARK_WALKERS, WISH } from './config.js';
import { lotKey, lotOf, tierOf, setOf, gapBetween } from './town.js';
import * as A from './art.js';
import { figureSvg } from './portrait.js';
import { zombieSvg, busSvg, ZBOX } from './thrill-art.js';
import { displayName } from './people.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

const rand = (a, b) => a + Math.random() * (b - a);
const FIG = { w: 26, h: 42 }; // a resident at zoom 1 (figureSvg is 30 × 48)
const ZS = 0.66; // zombies
const KIND_ICON = { R: 'rescue', C: 'cache', D: 'set', L: 'landmark', '?': 'mystery' };
const foot = (o) => ({ i: o.i, j: o.j, w: o.size, h: o.size });
const centre = (o) => ({ i: o.i + o.size / 2, j: o.j + o.size / 2 });

export class TownMap {
  /**
   * cb: { onObject(o, el), onPerson(id), onLot(a, b), onJunk(id, el),
   *       onTag(a, b), onWish(), onGift(el), onVisitor(el), onKit(), onGround(i, j),
   *       onLift(o) -> bool, onMoved(result, o), onCamera(), sound, fx }
   */
  constructor(root, meta, cb) {
    this.root = root;
    this.meta = meta;
    this.cb = cb;
    this.sound = cb.sound || (() => {});
    this.fx = cb.fx;
    this.cache = new Map();
    this.walkers = new Map();
    this.zeds = [];
    this.paused = false;
    this.placing = null; // { size, art, ok(i, j), onOk, onCancel, ... }
    this.lifted = null; // { o, from }
    this.painting = null; // { type }
    this.view = new IsoView(root, { cols: MAP, rows: MAP }, {
      onTap: (t) => this._tap(t),
      onGhostMove: (t) => this._ghostMove(t),
      onLongPress: (t) => this._longPress(t),
      onDrop: (t) => this._drop(t),
      onPaint: (t) => this._paint(t),
      onPaintEnd: () => this._flushGround(),
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
    // Open on Last Stop with its four neighbours' tags in view.
    const st = this.meta.station();
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
    for (const k of Object.keys(this.meta.s.lots)) {
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
    const t = { i: 0, j: 0 };
    const w = c.screenToWorld(c.vw / 2, c.vh / 2);
    t.i = (w.x / 32 + w.y / 16) / 2;
    t.j = (w.y / 16 - w.x / 32) / 2;
    return t;
  }

  /** Screen rect (viewport px) of a tile point, for HUD effects. */
  screenAt(i, j) {
    const p = this.view.tileScreen(i, j);
    return { left: p.x - 10, top: p.y - 10, width: 20, height: 20, right: p.x + 10, bottom: p.y + 10, x: p.x, y: p.y };
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
    this._junk();
    this._fence();
    this._tags();
    this._bubbles();
    this._syncWalkers();
    if (!this.zeds.length) this._spawnZeds();
    this._bus();
    this._kitGhost();
  }

  /** Ground and wild contents per lot (rebuilt only when something there changed). */
  _lots() {
    const m = this.meta;
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (let a = 0; a < LOTS_ACROSS; a++) {
        const key = lotKey(a, b);
        const owned = m.owns(a, b);
        const front = m.isFrontier(a, b);
        const haze = !owned && !front;
        const pk = owned ? this._pathKey(a, b) : '';
        const gk = `${owned}|${haze}|${pk}`;
        if (this.cache.get(`g:${key}`) !== gk) {
          this.cache.set(`g:${key}`, gk);
          const el = this.view.groundEl.querySelector(`[data-lot="${key}"]`);
          el.innerHTML = svgImgPlain(A.lotGround(a, b, { owned, haze, pathAt: (i, j) => (m.ownsTile(i, j) ? m.pathAt(i, j) : null), key }));
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
          this.view.removeWalker(`boss:${key}`);
          continue;
        }
        let art;
        if (L.kind === 'L') art = A.landmark(L.landmark, false);
        else if (L.kind === '?') art = A.mystery(haze);
        else art = A.ruin(key, haze);
        this.view.upsert(wid, { i: a * LOT + 2, j: b * LOT + 2, w: 3, h: 3, html: art.svg, artH: art.artH, cls: `o-wild k-${L.kind}`, lot: [a, b], img: true, hitH: art.bodyH });
        if (L.kind === 'L') this._boss(key, L.landmark, a, b);
      }
  }

  /** The 9×9 window of path codes around a lot (so joins redraw when a neighbour changes). */
  _pathKey(a, b) {
    const s = this.meta.s.paths;
    let k = '';
    for (let j = b * LOT - 1; j <= b * LOT + LOT; j++) {
      if (j < 0 || j >= MAP) continue;
      const i0 = Math.max(0, a * LOT - 1);
      const i1 = Math.min(MAP, a * LOT + LOT + 1);
      k += s.slice(j * MAP + i0, j * MAP + i1);
    }
    return k;
  }

  /** The boss zombie waves from the landmark's roof. */
  _boss(key, id, a, b) {
    const spot = A.bossSpot(id);
    const art = A.landmark(id, false);
    const el = this.view.objectEl(`wild:${key}`);
    if (!el || !spot) return;
    const W = 6 * 32;
    const [bw, bh] = ZBOX.walker;
    const left = (spot.x / W) * 100;
    const top = (spot.y / art.artH) * 100;
    const boss = document.createElement('div');
    boss.className = 'boss';
    boss.style.cssText = `left:${left}%;top:${top}%;width:${bw * 0.75}px;height:${bh * 0.75}px`;
    boss.innerHTML = `${zombieSvg('walker', { variant: 2 })}<div class="bprop">${A.bossProp(id)}</div>`;
    el.appendChild(boss);
    void a;
    void b;
  }

  _objHtml(o) {
    const m = this.meta;
    const s = m.s;
    const night = this.night;
    if (o.kind === 'building') return A.building(o.ref, s.buildings[o.ref] || 1, s.town, o.ref === 'bigtop' ? s.zone : 0, night);
    if (o.kind === 'home') {
      const p = m.person(o.ref);
      if (!p) return A.boxArt(2, 2, 20, '#ccc');
      const tier = HOME_TIERS[tierOf(p.level)].id;
      const roof = p.family != null ? TOWN_COLORS[p.family % TOWN_COLORS.length] : undefined;
      return A.home(p, tier, { roof, hearts: Math.min(5, p.hearts || 0), legend: p.rarity === 'legend', wish: !!(s.wish && s.wish.id === p.id), night });
    }
    if (o.kind === 'decor') return A.decor(o.ref, night);
    if (o.kind === 'keepsake') {
      const owner = m.person(o.owner);
      return A.keepsake(o.ref, owner ? owner.first : '', night);
    }
    if (o.kind === 'souvenir') return A.souvenir(o.ref, s.best);
    if (o.kind === 'statue') return A.statue(s.people.filter((p) => p.origin === 'founder').slice(0, 3));
    if (o.kind === 'landmark') return A.landmark(o.ref, true, s.town, { zones: s.zone, night });
    return A.boxArt(o.size, o.size, 20);
  }

  _objKey(o) {
    const m = this.meta;
    const s = m.s;
    const n = this.night ? 'n' : 'd';
    if (o.kind === 'building') return `${o.ref}|${s.buildings[o.ref]}|${s.town.name}|${s.town.color}|${o.ref === 'bigtop' ? s.zone : 0}|${n}`;
    if (o.kind === 'landmark') return `${o.ref}|${s.town.name}|${s.town.color}|${s.zone}|${n}`;
    if (o.kind === 'souvenir') return `${o.ref}|${o.ref === 'scoreboard' ? s.best : ''}`;
    if (o.kind === 'decor' || o.kind === 'keepsake') return `${o.ref}|${n}`;
    if (o.kind === 'home') {
      const p = m.person(o.ref);
      return p ? `${tierOf(p.level)}|${p.hearts}|${p.family}|${p.golden}|${p.level}|${s.wish && s.wish.id === p.id ? 'w' : ''}|${n}` : 'x';
    }
    return o.ref;
  }

  _objects() {
    const m = this.meta;
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
      const el = this.view.upsert(id, { i: o.i, j: o.j, w: o.size, h: o.size, html: art.svg, artH: art.artH, cls: `o-${o.kind}${o.kind === 'building' ? ` b-${o.ref}` : ''}`, oid: o.id, img: true, hitH: art.bodyH });
      // A front overlay (a hot tub's wall, a hammock's lip) so someone can sit in it.
      if (art.front) this.view.upsert(`of${o.id}`, { i: o.i, j: o.j, w: o.size, h: o.size, html: art.front.svg, artH: art.front.artH, cls: 'o-front', z: art.front.z ?? 2, img: true, noTap: true });
      else this.view.remove(`of${o.id}`);
      if (was && was.split('|')[0] !== key.split('|')[0]) {
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

  buildingEl(ref) {
    const o = this.meta.s.objects.find((x) => x.kind === 'building' && x.ref === ref);
    return o ? this.objectEl(o.id) : null;
  }

  homeEl(personId) {
    const o = this.meta.homeOf(personId);
    return o ? this.objectEl(o.id) : null;
  }

  _junk() {
    const m = this.meta;
    const seen = new Set();
    for (const k of m.s.junk) {
      const id = `j${k.id}`;
      seen.add(id);
      if (this.cache.get(id)) continue;
      this.cache.set(id, 1);
      const art = A.junk(k.v);
      this.view.upsert(id, { i: k.i, j: k.j, w: 1, h: 1, html: art.svg, artH: art.artH, cls: 'o-junk', z: 2, img: true, hitH: art.bodyH ?? 30 });
    }
    for (const id of [...this.view.objects.keys()])
      if (id.startsWith('j') && !seen.has(id)) {
        this.view.remove(id);
        this.cache.delete(id);
      }
  }

  junkEl(id) {
    return this.view.objectEl(`j${id}`);
  }

  /** The fence on your border: back edges low in the draw order, front edges in 2-tile pieces. */
  _fence() {
    const m = this.meta;
    const tier = m.fenceTier();
    const edges = m.fenceEdges();
    const color = m.s.town.color;
    const key = `${tier}|${color}|${edges.map((e) => `${e.a}${e.b}${e.side}`).join(',')}`;
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
        const z = back ? -((i + w + j + h) * 10) + (I + J) * 10 - 4 : 8;
        this.view.upsert(`f:${e.a},${e.b},${e.side},${off}`, { i, j, w, h, html: f.svg, artH: f.artH, cls: `o-fence${before ? ' hop' : ''}`, z, noTap: true, img: true });
      }
    }
  }

  /** Floating tags on lots next to your land; names over far lots and (zoomed out) your own. */
  _tags() {
    const m = this.meta;
    const v = this.view;
    const live = new Set();
    for (let b = 0; b < LOTS_ACROSS; b++)
      for (let a = 0; a < LOTS_ACROSS; a++) {
        const key = lotKey(a, b);
        const L = LOTS[key];
        const owned = m.owns(a, b);
        const c = tileToWorld(a * LOT + 3.5, b * LOT + 3.5);
        if (owned) {
          const rec = m.s.lots[key];
          const html = `<span class="lname">${esc(rec.name)}</span>`;
          v.pin(`n:${key}`, c.x, c.y - 30, html, 'pin-name own');
          live.add(`n:${key}`);
          continue;
        }
        if (m.isFrontier(a, b)) {
          const can = m.canClear(a, b);
          const price = m.nextLotPrice();
          const hot = this.hotLot === key;
          const lock = can.capped;
          const html =
            `<button class="tag k-${KIND_ICON[L.kind]}${lock ? ' locked' : ''}${can.ok ? ' can' : ''}${hot ? ' hot' : ''}" type="button" data-ui="lot" data-lot="${key}">` +
            `<span class="ti">${A.townIcon(KIND_ICON[L.kind])}</span><span class="tt"><b>${esc(L.name)}</b>${lock ? `<em>${icon('lock')}Zone ${can.zone || '·'}</em>` : `<em class="pr${m.s.coins < price ? ' short' : ''}">${icon('coin')}${price}</em>`}</span>${hot ? `<i class="arrow">${icon('up')}</i>` : ''}</button>`;
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

  /** Bubbles: READY arrows, the wish, the gift, building arrows, chests ready. */
  _bubbles() {
    const m = this.meta;
    const s = m.s;
    const v = this.view;
    const live = new Set();
    const over = (o, dy = 0) => {
      const c = tileToWorld(o.i, o.j); // top corner of the footprint
      const art = this._objHtml(o);
      return { x: c.x, y: tileToWorld(o.i + o.size, o.j + o.size).y - art.artH + dy };
    };
    // READY over homes.
    for (const p of s.people) {
      if (!m.isReady(p)) continue;
      const h = m.homeOf(p.id);
      if (!h) continue;
      const pt = over(h, 6);
      const can = m.canLevel(p);
      v.pin(`r:${p.id}`, pt.x, pt.y, `<button class="bub ready${can ? ' can' : ''}" type="button" data-ui="ready" data-id="${p.id}">${icon('up')}</button>`, 'pin-bub');
      live.add(`r:${p.id}`);
    }
    // The wish.
    if (s.wish) {
      const h = m.homeOf(s.wish.id);
      if (h) {
        const pt = over(h, -4);
        const ic = s.wish.set ? A.setBadge(s.wish.set) : icon('heart');
        v.pin('wish', pt.x + 26, pt.y, `<button class="bub wish" type="button" data-ui="wish">${icon('heart')}<span class="ws">${ic}</span></button>`, 'pin-bub');
        live.add('wish');
      }
    }
    // Building upgrade arrows (the one worth doing next bounces), chests ready.
    const step = this.step || { kind: '' };
    for (const o of s.objects) {
      if (o.kind !== 'building') continue;
      const id = o.ref;
      const B = BUILDINGS[id];
      const pt = over(o, 2);
      let html = '';
      if (B.kind === 'chest' && m.chestState(id).ready) html = `<button class="bub chest" type="button" data-ui="chest" data-k="${id}">OPEN!</button>`;
      else if (step.kind === 'build' && step.id === id) html = `<button class="bub up hot" type="button" data-ui="bld" data-id="${o.id}">${icon('up')}</button>`;
      if (html) {
        v.pin(`b:${o.id}`, pt.x + (B.size * 32) / 2 - 16, pt.y, html, 'pin-bub');
        live.add(`b:${o.id}`);
      }
    }
    // Roof campers.
    const campers = m.campers();
    const st = m.station();
    if (campers.length && st) {
      const pt = over(st, 0);
      const html = `<button class="bub camp" type="button" data-ui="campers">${campers
        .slice(0, ROOF_TENTS)
        .map((p) => `<i style="--c:${CLASSES[p.cls].color}"></i>`)
        .join('')}${campers.length > ROOF_TENTS ? `<b>+${campers.length - ROOF_TENTS}</b>` : ''}</button>`;
      v.pin('campers', pt.x + 48, pt.y + 18, html, 'pin-bub');
      live.add('campers');
    }
    // The visitor at the fence.
    if (s.visitor && this._visitorAt) {
      const p = tileToWorld(this._visitorAt.i, this._visitorAt.j);
      v.pin('visitor', p.x, p.y - 60, `<button class="bub visitor ${s.visitor.kind}" type="button" data-ui="visitor">BONK!</button>`, 'pin-bub');
      live.add('visitor');
    }
    for (const el of [...v.ui.querySelectorAll('.pin-bub')]) if (!live.has(el.dataset.pin)) el.remove();
  }

  pinEl(id) {
    const el = this.view.pinEl(id);
    return el ? el.firstElementChild || el : null;
  }

  /** The waiting kit: a green ghost on a free spot near the station, one ✓ places it. */
  _kitGhost() {
    const m = this.meta;
    if (this.placing || this.lifted || this.painting) return;
    const kit = m.s.kits[0];
    if (!kit || this.noKit) {
      this.view.unpin('kitok');
      return;
    }
    if (this.cb.onKit) this.cb.onKit(kit);
  }

  // --- Placing, lifting, painting -------------------------------------------------------------------

  /**
   * Show a ghost to place something new. opts: { size, art, at, onOk(i, j) -> result,
   * onCancel(), wish (person id whose range to show), set }
   */
  startPlace(opts) {
    this.endPlace();
    const m = this.meta;
    const c = this.centreTile();
    const at = opts.at || m.freeSpot(opts.size, { near: { i: c.i, j: c.j }, avoidJunk: false }) || { i: Math.round(c.i - opts.size / 2), j: Math.round(c.j - opts.size / 2) };
    this.placing = { ...opts, i: at.i, j: at.j };
    this._showPlace();
    if (!this.view.onScreen(at.i + opts.size / 2, at.j + opts.size / 2, 110)) this.glide(at.i + opts.size / 2, at.j + opts.size / 2, { ms: 400 });
  }

  _valid(i, j, size, ignore = null) {
    return this.meta.canPlaceAt(i, j, size, ignore).ok;
  }

  _showPlace() {
    const P = this.placing;
    if (!P) return;
    const valid = this._valid(P.i, P.j, P.size, P.ignore || null);
    P.valid = valid;
    this.view.showGhost({ i: P.i, j: P.j, w: P.size, h: P.size, html: P.art.svg, artH: P.art.artH, valid, lifted: !!P.lift });
    this._wishMarks(P);
    // ✓ / ✕ float beside the ghost (not while a finger is dragging it).
    if (!P.lift) {
      const r = tileToWorld(P.i + P.size, P.j); // right corner
      const btns = `<div class="okx"><button class="okb${valid ? '' : ' off'}" type="button" data-ui="place-ok">${icon('check')}</button>${P.noCancel ? '' : `<button class="xb" type="button" data-ui="place-x">${icon('close')}</button>`}</div>`;
      this.view.pin('placebtns', r.x + 8, r.y - 8, btns, 'pin-okx');
    } else this.view.unpin('placebtns');
  }

  /** While a wished-for set item is lifted: the wisher's range, and a ♥ that glows in range. */
  _wishMarks(P) {
    const m = this.meta;
    const w = m.s.wish;
    let marks = '';
    if (w && w.set && P.set === w.set) {
      const h = m.homeOf(w.id);
      if (h) {
        const R = WISH.range;
        marks = `<polygon class="wishring" points="${diamondPoints(h.i - R, h.j - R, h.size + 2 * R, h.size + 2 * R)}"/>`;
        const inRange = gapBetween(foot(h), { i: P.i, j: P.j, w: P.size, h: P.size }) <= R && P.valid;
        const pin = this.view.pinEl('wish');
        if (pin) pin.classList.toggle('inrange', inRange);
      }
    }
    this.view.setExtraMarks(marks);
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
      this.fx && this.fx.shake(this.view.objectEl('__ghost'));
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
    this.view.setExtraMarks('');
    const pin = this.view.pinEl('wish');
    if (pin) pin.classList.remove('inrange');
  }

  /** Dust and a bump where something landed. */
  thud(at) {
    const c = tileToWorld(at.i + at.size / 2, at.j + at.size / 2);
    const s = this.view.cam.worldToScreen(c.x, c.y);
    const r = this.root.getBoundingClientRect();
    if (this.fx) this.fx.burst({ left: s.x + r.left - 20, top: s.y + r.top - 10, width: 40, height: 20 }, ['#e9d8b4', '#c9b48a', '#ffffff'], 14, 50);
    this.sound('thud');
  }

  /** Long press: lift a movable thing (the rules say what moves). */
  _longPress({ id }) {
    if (this.placing || this.painting || this.paused) return false;
    if (!id || !id.startsWith('o')) return false;
    const o = this.meta.object(Number(id.slice(1)));
    if (!o || !this.meta.isMovable(o)) return false;
    return this.lift(o);
  }

  /** Lift something placed: it follows the finger; let go on green to move it. */
  lift(o, { byTap = false } = {}) {
    if (this.cb.onLift && this.cb.onLift(o) === false) return false;
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
      set: setOf(o),
      onOk: (i, j) => this._moveTo(o, i, j),
      onCancel: () => this._unlift(),
    };
    this._showPlace();
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
    const r = this.meta.move(o.id, i, j);
    this._unlift();
    if (r.ok && (from.i !== i || from.j !== j) && this.cb.onMoved) this.cb.onMoved(r, o);
    return r;
  }

  _unlift() {
    if (!this.lifted) return;
    const el = this.objectEl(this.lifted.o.id);
    if (el) el.classList.remove('liftsrc');
    this.cache.delete(`o${this.lifted.o.id}`);
    this.lifted = null;
  }

  _drop({ i, j, sx, sy }) {
    const P = this.placing;
    if (!P) return;
    P.i = i;
    P.j = j;
    if (this.lifted) {
      const o = this.lifted.o;
      // Dropped on the box button?
      const box = document.querySelector('.boxdrop.show');
      if (box && this.meta.isBoxable(o)) {
        const r = box.getBoundingClientRect();
        if (sx >= r.left - 10 && sx <= r.right + 10 && sy >= r.top - 10 && sy <= r.bottom + 10) {
          this.endPlace();
          this._unlift();
          if (this.cb.onBox) this.cb.onBox(o);
          this.update();
          return;
        }
      }
      if (P.lift) {
        // A drag-lift lands where it's let go (or slides home on red).
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
    }
    // A new thing being placed: it stays where it was let go; ✓ confirms.
    this._showPlace();
  }

  /** Paint mode: one finger paints `type` (null erases), two pan. */
  startPaint(type) {
    this.endPlace();
    this.painting = { type, dirty: false };
    this.view.mode = 'paint';
    this.root.classList.add('painting');
  }

  setPaint(type) {
    if (this.painting) this.painting.type = type;
  }

  endPaint() {
    if (!this.painting) return;
    this.painting = null;
    this.view.mode = 'normal';
    this.root.classList.remove('painting');
    this._flushGround();
  }

  _paint({ i, j, first }) {
    const P = this.painting;
    if (!P) return;
    const r = this.meta.paint(i, j, P.type);
    if (!r.ok) {
      if (first && this.cb.onPaintFail) this.cb.onPaintFail(r);
      return;
    }
    if (r.changed) {
      P.dirty = true;
      this.sound('tick', { quiet: true });
      if (!this._pt) this._pt = setTimeout(() => this._flushGround(), 100);
    }
  }

  _flushGround() {
    clearTimeout(this._pt);
    this._pt = 0;
    this._lots();
    if (this.cb.onPainted) this.cb.onPainted();
  }

  // --- Taps ------------------------------------------------------------------------------------------

  _tap({ id, ui, i, j }) {
    if (this.paused) return;
    if (ui) {
      const b = ui.closest('[data-ui]') || ui.querySelector('[data-ui]');
      if (!b) return;
      const k = b.dataset.ui;
      if (k === 'place-ok') return this.cb.onPlaceOk ? this.cb.onPlaceOk() : this.placeOk();
      if (k === 'place-x') return this.placeCancel();
      if (k === 'lot') {
        const [a, bb] = b.dataset.lot.split(',').map(Number);
        return this.cb.onLot(a, bb, b);
      }
      if (k === 'ready') return this.cb.onPerson(Number(b.dataset.id), b);
      if (k === 'wish') return this.cb.onWish(b);
      if (k === 'gift') return this.cb.onGift(b);
      if (k === 'chest') return this.cb.onChest(b.dataset.k, b);
      if (k === 'bld') return this.cb.onObject(this.meta.object(Number(b.dataset.id)), b);
      if (k === 'campers') return this.cb.onCampers(b);
      if (k === 'visitor') return this.cb.onVisitor(b);
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
    if (this.painting) return;
    if (id && id.startsWith('w:')) {
      const wid = id.slice(2);
      if (wid.startsWith('z')) return this._bonkZed(wid);
      if (wid === 'bus') return this.cb.onBus && this.cb.onBus();
      const pid = Number(wid);
      const w = this.walkers.get(pid);
      if (w && w.gift) return this.cb.onGift(this.view.walkerEl(pid));
      return this.cb.onPerson(pid, this.view.walkerEl(pid));
    }
    if (id && id.startsWith('j')) return this.cb.onJunk(Number(id.slice(1)), this.view.objectEl(id));
    if (id && id.startsWith('o')) {
      const o = this.meta.object(Number(id.slice(1)));
      if (o) return this.cb.onObject(o, this.view.objectEl(id));
    }
    const { a, b } = lotOf(i, j);
    if (id && id.startsWith('wild:')) return this.cb.onLot(a, b, this.view.objectEl(id));
    if (i < 0 || j < 0 || i >= MAP || j >= MAP) return;
    if (this.meta.owns(a, b)) return this.cb.onGround(i, j);
    return this.cb.onLot(a, b, null);
  }

  // --- Residents -------------------------------------------------------------------------------------

  /** Who walks: the squad, READY people, the wisher, the gift-bearer, the 3 newest, then a rotation. */
  _visible() {
    const m = this.meta;
    const s = m.s;
    const out = [];
    const add = (p) => {
      if (p && m.homeOf(p.id) && !out.includes(p)) out.push(p);
    };
    m.squadPeople().forEach(add);
    s.people.filter((p) => m.isReady(p)).forEach(add);
    if (s.wish) add(m.person(s.wish.id));
    if (s.gift) add(m.person(s.gift.id));
    s.people
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, 3)
      .forEach(add);
    const rest = s.people.filter((p) => !out.includes(p) && m.homeOf(p.id));
    const rot = Math.floor(performance.now() / 90000);
    for (let k = 0; k < rest.length && out.length < PARK_WALKERS; k++) out.push(rest[(k + rot * 5) % rest.length]);
    return out.slice(0, Math.max(PARK_WALKERS, m.s.squad.length));
  }

  _syncWalkers() {
    const m = this.meta;
    const vis = this._visible();
    const ids = new Set(vis.map((p) => p.id));
    for (const [id, w] of this.walkers) {
      if (ids.has(id)) continue;
      this.view.removeWalker(id);
      this.walkers.delete(id);
    }
    for (const p of vis) {
      let w = this.walkers.get(p.id);
      if (!w) w = this._addWalker(p);
      const key = `${p.level}:${p.golden}:${m.inSquad(p.id)}:${m.isReady(p)}:${m.s.gift && m.s.gift.id === p.id}`;
      if (w.key !== key) {
        w.key = key;
        w.squad = m.inSquad(p.id);
        w.gift = !!(m.s.gift && m.s.gift.id === p.id);
        this._render(w, true);
      }
    }
  }

  _addWalker(p, from = null) {
    const h = this.meta.homeOf(p.id);
    const start = from || this._door(h) || { i: h.i + h.size + 0.5, j: h.j + 0.5 };
    const w = { id: p.id, fi: start.i + 0.5, fj: start.j + 0.5, path: [], wait: rand(0.2, 4), pose: 'idle', then: 'idle', face: 1, squad: false, key: '', vibe: p.vibe, cls: p.cls };
    this.walkers.set(p.id, w);
    this._render(w, true);
    return w;
  }

  _render(w, html = false) {
    const p = this.meta.person(w.id);
    if (!p) return;
    const opts = { w: FIG.w, h: FIG.h, flip: w.face < 0, z: w.seat ? w.seat.z : null, lift: w.seat ? w.seat.lift : 0 };
    if (html) {
      const tags = `${w.gift ? `<button class="wgift" type="button">${icon('gift')}</button>` : ''}${this.meta.isReady(p) ? `<i class="wready">${icon('up')}</i>` : ''}`;
      opts.html = `<div class="wfig v-${p.vibe}${w.squad ? ' squad' : ''} p-${w.pose}">${svgImgPlain(figureSvg(p, { pose: w.pose }))}</div><span class="wname">${esc(displayName(p))}</span>${tags}`;
    }
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
    const m = this.meta;
    // The art's own spot just in front of the door (fractional), when it's walkable.
    const art = this._objHtml(o);
    const d = art.door || (o.kind === 'building' && A.ANCHORS[o.ref] && A.ANCHORS[o.ref].spot) || (o.kind === 'home' && art.door) || null;
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
    const cand = [];
    for (let k = 0; k < n; k++) cand.push([o.i + n, o.j + k], [o.i + k, o.j + n]);
    cand.push([o.i + n, o.j + n], [o.i - 1, o.j + k0(n)], [o.i + k0(n), o.j - 1]);
    for (const [i, j] of cand) if (m.ownsTile(i, j) && !m.blocked(i, j)) return { i, j };
    return null;
  }

  _walkable(i, j) {
    const m = this.meta;
    return m.ownsTile(i, j) && !m.blocked(i, j);
  }

  _route(w, to) {
    if (!to) return false;
    const m = this.meta;
    const si = Math.floor(w.fi);
    const sj = Math.floor(w.fj);
    const blocked = (i, j) => !this._walkable(i, j);
    const cost = (i, j) => (m.pathAt(i, j) ? 1 : 3);
    const p = findPath(MAP, MAP, blocked, si, sj, to.i, to.j, 2500, cost);
    if (!p) return false;
    this._unseat(w);
    w.path = p.map(([i, j]) => ({ i: i + 0.5, j: j + 0.5 }));
    if (to.exact) w.path.push({ i: to.exact.i, j: to.exact.j });
    if (to.seat) w.path.push({ i: to.seat.i, j: to.seat.j, seat: to.seat });
    return true;
  }

  /** Sit (or stand) on a piece: drawn just over it, lifted by the seat height. */
  _seat(w, seat) {
    const rec = this.view.objects.get(`o${seat.oid}`);
    if (!rec) return;
    w.seat = { ...seat, z: rec.zi + 1 };
    const pose = { sit: 'sleep', nap: 'sleep', soak: 'sleep', bounce: 'cheer', perform: 'cheer', dance: 'cheer', slide: 'cheer', climb: 'wave', salute: 'wave', ride: 'wave', pose: 'wave' }[seat.act];
    if (pose) w.then = pose;
  }

  _unseat(w) {
    if (!w.seat) return;
    w.seat = null;
    this.view.walker(w.id, w.fi, w.fj, { z: null, lift: 0 });
  }

  _pickGoal(w) {
    const m = this.meta;
    const s = m.s;
    const p = m.person(w.id);
    if (!p) return null;
    const r = Math.random();
    const homeO = m.homeOf(p.id);
    const night = isNight();
    if (w.squad && r < 0.5) {
      const st = m.station();
      const k = Math.max(0, s.squad.indexOf(p.id));
      const spot = { i: st.i + st.size, j: st.j + st.size - 1 - k };
      if (this._walkable(spot.i, spot.j)) return { to: spot, then: 'idle' };
    }
    if (night && p.vibe === 'sleepy') return { to: this._door(homeO), then: 'sleep' };
    if (r < 0.25) return { to: this._door(homeO), then: p.vibe === 'sleepy' ? 'sleep' : 'idle' };
    if (r < 0.5) {
      const yard = s.objects.find((o) => o.kind === 'building' && o.ref === CLASSES[p.cls].ride);
      if (yard) return { to: this._door(yard), then: 'cheer' };
    }
    if (r < 0.75) {
      const set = Object.keys(SETS).find((k) => SETS[k].vibe === p.vibe);
      const items = s.objects.filter((o) => setOf(o) === set);
      if (items.length) {
        const it = items[Math.floor(Math.random() * items.length)];
        const pose = { sleepy: 'sleep', sunny: 'idle', showoff: 'cheer', jumpy: 'wave' }[p.vibe] || 'idle';
        return { to: this._door(it, { seat: true }), then: pose };
      }
    }
    if (r < 0.85 && homeO) {
      const near = s.objects.filter((o) => o.kind === 'home' && o.ref !== p.id && gapBetween(foot(o), foot(homeO)) <= 2);
      if (near.length) return { to: this._door(near[Math.floor(Math.random() * near.length)]), then: 'wave', heart: true };
    }
    // Stroll: a path tile on your land (or any free tile).
    for (let k = 0; k < 12; k++) {
      const keys = Object.keys(s.lots);
      const [a, b] = keys[Math.floor(Math.random() * keys.length)].split(',').map(Number);
      const i = a * LOT + Math.floor(Math.random() * LOT);
      const j = b * LOT + Math.floor(Math.random() * LOT);
      if (this._walkable(i, j) && (m.pathAt(i, j) || k > 8)) return { to: { i, j }, then: 'idle' };
    }
    return null;
  }

  /** A newcomer parachutes in: their figure drops onto their home's doorstep. */
  arrive(id) {
    const p = this.meta.person(id);
    if (!p || !this.meta.homeOf(id)) return;
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

  /** People of a class (or the nearest few) run to a building and cheer. */
  cheerAt(o, cls = null) {
    let n = 0;
    for (const w of this.walkers.values()) {
      if (cls ? w.cls !== cls : n >= 5) continue;
      n++;
      if (this._route(w, this._door(o))) {
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

  giftEl() {
    for (const w of this.walkers.values()) if (w.gift) return this.view.walkerEl(w.id);
    return null;
  }

  // --- The bus and the zombies ----------------------------------------------------------------------

  _bus() {
    const st = this.meta.station();
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
    const fi = st.i + bu;
    const fj = st.j + bv;
    this.busAt = { i: fi, j: fj };
    this.view.walker('bus', fi, fj, { html: `<div class="busfig">${svgImgPlain(busSvg())}</div>`, w: 66, h: 38, z: (st.i + st.size + st.j + st.size) * 10 + 2 });
  }

  /** The bus drives off (a raid) and comes back. */
  busGo(away) {
    this.busAway = away;
    this.cache.delete('bus');
    const el = this.view.walkerEl('bus');
    if (el && away) {
      el.classList.add('leaving');
      setTimeout(() => {
        this._bus();
      }, 600);
    } else this._bus();
    if (!away) {
      const e2 = this.view.walkerEl('bus');
      if (e2) {
        e2.classList.remove('arrive');
        void e2.offsetWidth;
        e2.classList.add('arrive');
      }
    }
  }

  busEl() {
    return this.view.walkerEl('bus');
  }

  /** Wild zombies doze and bump the front fence (on lots in front of your land). */
  _spawnZeds() {
    const m = this.meta;
    const spots = this._fenceFront();
    if (!spots.length) return;
    const kinds = ['walker', 'runner', 'walker', 'brute'];
    for (let k = 0; k < 4; k++) {
      const sp = spots[(k * 3) % spots.length];
      const kind = kinds[k];
      const z = { id: `z${k}`, kind, variant: k % 4, edge: sp, t: Math.random(), v: rand(0.08, 0.16) * (Math.random() < 0.5 ? -1 : 1), down: 0, bump: rand(3, 10) };
      this.zeds.push(z);
      this._placeZed(z, true);
    }
    void m;
  }

  /** Front fence lines (outside your land at higher i or j), as segments in tile space. */
  _fenceFront() {
    const out = [];
    for (const e of this.meta.fenceEdges()) {
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
    const fi = e.i0 + (e.i1 - e.i0) * z.t;
    const fj = e.j0 + (e.j1 - e.j0) * z.t;
    z.fi = fi;
    z.fj = fj;
    const [bw, bh] = ZBOX[z.kind];
    const opts = { w: bw * ZS, h: bh * ZS, flip: z.v < 0 };
    if (html) opts.html = `<div class="zfig${z.down > 0 ? ' down' : ''}">${svgImgPlain(zombieSvg(z.kind, { variant: z.variant, ko: z.down > 0 }))}</div>`;
    this.view.walker(z.id, fi, fj, opts);
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

  /** Where the fence visitor stands (a costume or golden zombie), or null. */
  visitorSpot() {
    const f = this._fenceFront()[0];
    if (!f) return null;
    return { i: (f.i0 + f.i1) / 2, j: (f.j0 + f.j1) / 2 };
  }

  _visitor() {
    const v = this.meta.s.visitor;
    if (!v) {
      if (this._visitorAt) {
        this._visitorAt = null;
        this.view.removeWalker('zv');
      }
      return;
    }
    const at = this.visitorSpot();
    if (!at) return;
    const key = `${v.kind}|${v.taps}|${at.i},${at.j}`;
    if (this._visitorKey === key) return;
    this._visitorKey = key;
    this._visitorAt = at;
    const kind = v.kind === 'golden' ? 'golden' : 'walker';
    const [bw, bh] = ZBOX[kind];
    this.view.walker('zv', at.i, at.j, { html: `<div class="zfig visitor ${v.kind}">${zombieSvg(kind, { variant: 1 })}${v.kind === 'costume' ? '<i class="cone"></i>' : ''}</div>`, w: bw * 0.8, h: bh * 0.8 });
  }

  visitorEl() {
    return this.view.walkerEl('zv');
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

  /** Squad figures sprint into a lot and back (the BONK run). */
  async squadRun(a, b) {
    const m = this.meta;
    const target = { i: a * LOT + 3, j: b * LOT + 3 };
    for (const id of m.s.squad) {
      const w = this.walkers.get(id);
      if (!w) continue;
      w.path = [];
      // Straight there (the wild is not walkable by the rules, so no A* here).
      const n = 10;
      const fi0 = w.fi;
      const fj0 = w.fj;
      w.path = Array.from({ length: n }, (_, k) => ({ i: fi0 + ((target.i + rand(-1.5, 1.5) - fi0) * (k + 1)) / n, j: fj0 + ((target.j + rand(-1.5, 1.5) - fj0) * (k + 1)) / n }));
      w.run = true;
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
        const sp = (w.run ? 3.2 : 1.1) * sec;
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
      // The piece someone sits on was moved or boxed: hop off.
      if (w.seat) {
        const o = this.meta.object(w.seat.oid);
        if (!o || `${o.i},${o.j}` !== w.seat.at) {
          this._unseat(w);
          w.wait = 0;
        }
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
    this._visitor();
  }
}

const k0 = (n) => Math.floor(n / 2);

/** A flat image of an SVG (ground, scenery): no padding, fills its box. */
const plainCache = new Map();
function svgImgPlain(svg) {
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
void svgImg;

/** Evening (19:00–06:00 local): sleepy people go home. */
export function isNight(d = new Date()) {
  const h = d.getHours();
  return h >= 19 || h < 6;
}

export { LOT_KINDS, LANDMARKS, DECOR, KEEPSAKES, centre };
