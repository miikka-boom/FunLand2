// The park: one fixed landscape scene (never scrolls). Buildings with their
// level and an upgrade arrow when you can afford one, the Ferris wheel (one lit
// gondola per zone), souvenirs, the squad's bus, every resident walking about
// by their vibe, and goofy zombies bumping the wall (tap one: it falls over).

import { PARK, parkBackSvg, wheelSvg, buildingSvg, souvenirSvg, busSvg, zombieSvg } from './art.js';
import { figureSvg } from './portrait.js';
import { BUILDINGS, CLASSES, ZONES, PARK_WALKERS } from './config.js';
import { displayName } from './people.js';
import { icon } from './icons.js';
import { esc } from './ui.js';

const RIDE_IDS = ['bigtop', 'striker', 'gallery', 'tent', 'garage'];
/** Zombie viewBox sizes (art.js), drawn at ZSCALE in the park. */
export const ZBOX = { walker: [40, 56], runner: [40, 64], brute: [64, 72], spitter: [44, 56], horde: [28, 38], golden: [40, 56] };
const ZSCALE = 0.82;
const SOUVENIR_ZONE = Object.fromEntries(ZONES.filter((z) => z.souvenir).map((z) => [z.souvenir, z.n]));
const rand = (a, b) => a + Math.random() * (b - a);

export class Park {
  constructor(root, meta, { onBuilding, onPerson, onWheel, onGift, sound, fx }) {
    this.root = root;
    this.meta = meta;
    this.cb = { onBuilding, onPerson, onWheel, onGift };
    this.sound = sound;
    this.fx = fx;
    this.walkers = new Map();
    this.zombies = [];
    this.scale = 1;
    this.cache = new Map();
    this.paused = false;
    this._build();
    addEventListener('resize', () => this.layout());
  }

  _build() {
    const W = PARK.w;
    const H = PARK.h;
    this.root.style.background = PARK.sky;
    this.root.innerHTML =
      `<div class="groundfill" style="background:${PARK.ground}"></div>` +
      `<div class="scene" style="width:${W}px;height:${H}px">` +
      `<div class="back"></div><div class="souvs"></div><div class="wheelwrap" data-tap="wheel"></div><div class="blds"></div><div class="busw"></div>` +
      `<div class="actors"></div><div class="zeds"></div><div class="tags"></div></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = { scene: q('.scene'), back: q('.back'), souvs: q('.souvs'), wheel: q('.wheelwrap'), blds: q('.blds'), bus: q('.busw'), actors: q('.actors'), zeds: q('.zeds'), tags: q('.tags'), fill: q('.groundfill') };

    // Buildings (one node each; the art is redrawn only when the level changes).
    for (const id of RIDE_IDS) {
      const sl = PARK.slots[id];
      if (!sl) continue;
      const b = document.createElement('div');
      b.className = 'p-bld';
      b.dataset.id = id;
      b.dataset.tap = 'bld';
      b.style.cssText = `left:${sl.x - sl.w / 2}px;top:${sl.y - sl.h}px;width:${sl.w}px;height:${sl.h}px`;
      this.el.blds.appendChild(b);
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'btag';
      t.dataset.id = id;
      t.dataset.tap = 'bld';
      t.style.cssText = `left:${sl.x}px;top:${sl.y - sl.h - 4}px`;
      this.el.tags.appendChild(t);
    }
    const bus = PARK.bus;
    if (bus) {
      this.el.bus.innerHTML = `<div class="p-bus" style="left:${bus.x}px;top:${bus.y}px">${busSvg()}</div>`;
    }
    const wh = PARK.wheel;
    this.el.wheel.style.cssText = `left:${wh.x - wh.r * 1.25}px;top:${wh.y - wh.r * 1.25}px;width:${wh.r * 2.5}px;height:${wh.r * 2.5 + (PARK.wheelStandH || wh.r * 1.1)}px`;

    this.root.addEventListener('click', (e) => this._click(e));
    this.layout();
    this.update(true);
    this._spawnZombies();
  }

  /** Scale the 960×300 scene into the space between the top bar and the bottom row. */
  layout() {
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 44;
    const bot = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bot-h')) || 88;
    const W = innerWidth;
    const H = Math.max(120, innerHeight - top - bot);
    const s = Math.min(W / PARK.w, H / PARK.h);
    this.scale = s;
    const left = (W - PARK.w * s) / 2;
    const y = top + H - PARK.h * s;
    this.el.scene.style.transform = `translate(${left}px, ${y}px) scale(${s})`;
    this.el.fill.style.top = `${top + H - 4 * s}px`;
  }

  /** Scene units → viewport pixels (for the hand, flying loot, captions). */
  toScreen(x, y) {
    const r = this.el.scene.getBoundingClientRect();
    return { x: r.left + x * this.scale, y: r.top + y * this.scale };
  }

  buildingEl(id) {
    return this.el.tags.querySelector(`.btag[data-id="${id}"]`) || this.el.blds.querySelector(`[data-id="${id}"]`);
  }

  walkerEl(id) {
    const w = this.walkers.get(id);
    return w ? w.el : null;
  }

  // --- State → scene ---------------------------------------------------------------------------

  update(force = false) {
    const m = this.meta;
    const s = m.s;
    const step = m.nextStep();
    this._hot = step.kind === 'build' ? step.id : null;
    if (force || this.cache.get('zone') !== s.zone) {
      this.cache.set('zone', s.zone);
      this.el.back.innerHTML = parkBackSvg(s.zone);
      this.el.wheel.innerHTML = wheelSvg(s.zone);
      this._souvenirs();
    }
    for (const id of RIDE_IDS) {
      const lv = s.buildings[id] || 0;
      const node = this.el.blds.querySelector(`[data-id="${id}"]`);
      if (!node) continue;
      const key = `b:${id}`;
      if (this.cache.get(key) !== lv) {
        const was = this.cache.get(key);
        this.cache.set(key, lv);
        node.innerHTML = buildingSvg(id, Math.max(1, lv), { locked: lv <= 0 });
        node.classList.toggle('locked', lv <= 0);
        if (was !== undefined && lv > was) {
          node.classList.remove('built');
          void node.offsetWidth;
          node.classList.add('built');
        }
      }
      const tag = this.el.tags.querySelector(`.btag[data-id="${id}"]`);
      const up = m.canUpgrade(id);
      const B = BUILDINGS[id];
      // Only the one building worth upgrading next bounces; others that you
      // could afford just show a small dot. None while someone in the squad can level up.
      const hot = up.ok && this._hot === id;
      const html = lv <= 0 ? `${icon('lock')}<b>Zone ${B.zone}</b>` : `${hot ? `<i class="arrow">${icon('up')}</i>` : up.ok ? '<i class="dot"></i>' : ''}<b>Lv ${lv}</b>`;
      if (this.cache.get(`t:${id}`) !== html) {
        this.cache.set(`t:${id}`, html);
        tag.innerHTML = html;
      }
      tag.classList.toggle('can', hot);
      tag.classList.toggle('canish', !!up.ok && !hot);
      tag.classList.toggle('locked', lv <= 0);
    }
    this._syncWalkers();
    this._gift();
  }

  /** Souvenirs: 'back' ones behind the buildings, 'front' ones depth-sorted with people. */
  _souvenirs() {
    const z = this.meta.s.zone;
    let back = '';
    for (const old of this.el.actors.querySelectorAll('.p-souv')) old.remove();
    for (const [id, zone] of Object.entries(SOUVENIR_ZONE)) {
      const sl = PARK.souvenirs && PARK.souvenirs[id];
      if (!sl || z < zone) continue;
      const front = sl.z === 'front';
      const html = `<div class="p-souv s-${id}" style="left:${sl.x - sl.w / 2}px;top:${sl.y - sl.h}px;width:${sl.w}px;height:${sl.h}px${front ? `;z-index:${Math.round(sl.y)}` : ''}">${souvenirSvg(id)}${id === 'scoreboard' ? `<span class="score">${this.meta.s.best}</span>` : ''}</div>`;
      if (sl.z === 'front') this.el.actors.insertAdjacentHTML('beforeend', html);
      else back += html;
    }
    this.el.souvs.innerHTML = back;
  }

  // --- Residents --------------------------------------------------------------------------------

  /** Who walks about: the squad, then the newest arrivals, up to PARK_WALKERS. */
  _visible() {
    const m = this.meta;
    const sq = m.squadPeople();
    const rest = m.s.people.filter((p) => !m.inSquad(p.id)).sort((a, b) => b.id - a.id);
    return [...sq, ...rest].slice(0, Math.max(PARK_WALKERS, sq.length));
  }

  _syncWalkers() {
    const m = this.meta;
    const vis = this._visible();
    const ids = new Set(vis.map((p) => p.id));
    for (const [id, w] of this.walkers) {
      if (ids.has(id) || w.leaving) continue;
      if (m.isResident(id)) {
        // Still lives here, just off-screen now: fade out.
        w.el.classList.add('gone');
        setTimeout(() => w.el.remove(), 400);
        this.walkers.delete(id);
      } else this.leave(id);
    }
    for (const p of vis) {
      const w = this.walkers.get(p.id);
      if (!w) this._addWalker(p, false);
      else {
        const key = `${p.level}:${p.golden}:${m.inSquad(p.id)}:${m.isReady(p)}`;
        if (w.key !== key) {
          w.key = key;
          w.el.classList.toggle('squad', m.inSquad(p.id));
          w.el.classList.toggle('ready', m.isReady(p));
          w.squad = m.inSquad(p.id);
        }
      }
    }
  }

  _addWalker(p, fromGate) {
    const W = PARK.walk;
    const el = document.createElement('div');
    el.className = `walker v-${p.vibe}`;
    el.dataset.id = p.id;
    el.dataset.tap = 'person';
    el.innerHTML = `<div class="wfig">${figureSvg(p, { pose: 'idle' })}</div><div class="wname">${esc(displayName(p))}</div>`;
    this.el.actors.appendChild(el);
    const start = fromGate && PARK.gate ? { x: PARK.gate.x, y: PARK.gate.y } : { x: rand(W.x0, W.x1), y: rand(W.y0, W.y1) };
    const w = { id: p.id, el, x: start.x, y: start.y, tx: start.x, ty: start.y, wait: rand(0.5, 3), pose: 'idle', face: 1, key: '', squad: this.meta.inSquad(p.id), leaving: false, vibe: p.vibe, cls: p.cls };
    this.walkers.set(p.id, w);
    this._place(w);
    if (fromGate) {
      w.wait = 0;
      this._target(w, { x: rand(W.x0 + 60, W.x1 - 60), y: rand(W.y0, W.y1) });
      this._pose(w, 'wave');
    }
    return w;
  }

  /** A newcomer walks in through the gate and waves. */
  arrive(id) {
    const p = this.meta.s.people.find((q) => q.id === id);
    if (!p) return;
    const old = this.walkers.get(id);
    if (old) {
      old.el.remove();
      this.walkers.delete(id);
    }
    this._addWalker(p, true);
  }

  /** Someone walks out of the gate, waving. */
  leave(id) {
    const w = this.walkers.get(id);
    if (!w) return;
    w.leaving = true;
    w.wait = 0;
    this._pose(w, 'wave');
    this._target(w, PARK.gate || { x: -40, y: w.y });
    w.onArrive = () => {
      w.el.classList.add('gone');
      setTimeout(() => w.el.remove(), 400);
      this.walkers.delete(id);
    };
  }

  /** One resident cheers where they stand (a level-up). */
  cheerPerson(id) {
    const w = this.walkers.get(id);
    if (!w || w.leaving) return;
    w.tx = w.x;
    w.ty = w.y;
    this._pose(w, 'cheer');
    w.wait = 2.5;
    w.el.classList.remove('jump');
    void w.el.offsetWidth;
    w.el.classList.add('jump');
  }

  /** Residents of a class run over to a building and cheer (after an upgrade). */
  cheerAt(buildingId) {
    const sl = PARK.slots[buildingId];
    if (!sl) return;
    const cls = BUILDINGS[buildingId].cls;
    let n = 0;
    for (const w of this.walkers.values()) {
      if (w.leaving) continue;
      if (cls ? w.cls !== cls : n >= 4) continue;
      n++;
      this._target(w, { x: sl.x + rand(-sl.w * 0.4, sl.w * 0.4), y: Math.min(PARK.walk.y1, sl.y + rand(6, 22)) });
      w.wait = 0;
      w.then = 'cheer';
    }
  }

  _target(w, t) {
    const W = PARK.walk;
    w.tx = t.x;
    w.ty = Math.max(W.y0 - 30, Math.min(W.y1, t.y));
  }

  _pose(w, pose) {
    if (w.pose === pose) return;
    w.pose = pose;
    const p = this.meta.person(w.id);
    if (!p) return;
    w.el.querySelector('.wfig').innerHTML = figureSvg(p, { pose });
    w.el.classList.toggle('sleeping', pose === 'sleep');
  }

  _place(w) {
    w.el.style.transform = `translate(${w.x}px, ${w.y}px)`;
    w.el.style.zIndex = String(Math.round(w.y));
    w.el.classList.toggle('flip', w.face < 0);
  }

  /** Where a walker wants to go next, by vibe and squad. */
  _pickGoal(w) {
    const W = PARK.walk;
    const sp = PARK.spots || {};
    const r = Math.random();
    const ride = PARK.slots[CLASSES[w.cls].ride];
    const rideOpen = (this.meta.s.buildings[CLASSES[w.cls].ride] || 0) > 0;
    const near = (o, dx = 30, dy = 12) => ({ x: o.x + rand(-dx, dx), y: o.y + rand(-dy, dy) });
    const squadSpots = sp.squad || [];
    if (w.squad && squadSpots.length && r < 0.55) {
      const i = Math.max(0, this.meta.s.squad.indexOf(w.id));
      return { at: near(squadSpots[i % squadSpots.length], 4, 2), then: 'idle' };
    }
    if (w.vibe === 'sleepy' && sp.steps && r < 0.65) return { at: near(sp.steps, 14, 4), then: 'sleep' };
    if (w.vibe === 'showoff' && ride && rideOpen && r < 0.6) return { at: near({ x: ride.x, y: Math.min(W.y1, ride.y + 10) }, ride.w * 0.3, 6), then: 'cheer' };
    if (w.vibe === 'sunny' && r < 0.4) return { at: { x: rand(W.x0, W.x1), y: W.y1 - rand(0, 10) }, then: 'wave' };
    if (ride && rideOpen && r < 0.75) return { at: near({ x: ride.x, y: Math.min(W.y1, ride.y + 12) }, ride.w * 0.35, 8), then: 'idle' };
    if (sp.fire && r < 0.85) {
      // Gather round the campfire, never in it.
      const side = Math.random() < 0.5 ? -1 : 1;
      return { at: { x: sp.fire.x + side * rand(24, 44), y: sp.fire.y + rand(4, 16) }, then: 'idle' };
    }
    return { at: { x: rand(W.x0, W.x1), y: rand(W.y0, W.y1) }, then: 'idle' };
  }

  // --- Zombies at the wall --------------------------------------------------------------------

  _spawnZombies() {
    const Z = PARK.zombieZone;
    if (!Z) return;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'zed';
      el.dataset.tap = 'zed';
      const kind = i % 5 === 4 ? 'brute' : i % 3 === 2 ? 'runner' : 'walker';
      const [bw, bh] = ZBOX[kind];
      el.innerHTML = `<div class="zfig" style="width:${bw * ZSCALE}px;height:${bh * ZSCALE}px;left:${(-bw * ZSCALE) / 2}px;top:${-bh * ZSCALE}px">${zombieSvg(kind, { flip: false, variant: i % 4 })}</div>`;
      this.el.zeds.appendChild(el);
      const z = { el, kind, variant: i % 4, x: Z.x0 + ((Z.x1 - Z.x0) * (i + 0.5)) / n + rand(-20, 20), y: Z.y + rand(-3, 3), v: rand(4, 9) * (Math.random() < 0.5 ? -1 : 1), down: 0, bump: rand(4, 14) };
      this.zombies.push(z);
      this._placeZ(z);
    }
  }

  _placeZ(z) {
    z.el.style.transform = `translate(${z.x}px, ${z.y}px)`;
    z.el.classList.toggle('flip', z.v < 0);
  }

  _bonk(z) {
    if (z.down > 0) return;
    z.down = 3.5;
    z.el.classList.add('down');
    const fig = z.el.querySelector('.zfig');
    fig.innerHTML = zombieSvg(z.kind, { ko: true, variant: z.variant });
    this.sound('bonk');
    const r = z.el.getBoundingClientRect();
    this.fx.float({ x: r.left + r.width / 2, y: r.top }, 'BONK!', 'bonk');
  }

  // --- Gifts -------------------------------------------------------------------------------------

  _gift() {
    const g = this.meta.s.gift;
    for (const w of this.walkers.values()) {
      const has = !!g && g.id === w.id;
      if (has !== w.el.classList.contains('gifting')) {
        w.el.classList.toggle('gifting', has);
        const old = w.el.querySelector('.giftb');
        if (old) old.remove();
        if (has) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'giftb';
          b.dataset.tap = 'gift';
          b.innerHTML = icon('gift');
          w.el.appendChild(b);
          const W = PARK.walk;
          this._target(w, { x: (W.x0 + W.x1) / 2 + rand(-80, 80), y: W.y1 });
          w.then = 'wave';
        }
      }
    }
  }

  giftEl() {
    return this.el.actors.querySelector('.giftb');
  }

  // --- Frame ------------------------------------------------------------------------------------

  tick(dt) {
    if (this.paused) return;
    const sec = Math.min(0.1, dt / 1000);
    for (const w of this.walkers.values()) {
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const sp = (w.leaving ? 42 : w.then === 'cheer' ? 46 : 24) * sec;
        w.x += (dx / d) * Math.min(sp, d);
        w.y += (dy / d) * Math.min(sp, d);
        if (Math.abs(dx) > 0.5) w.face = dx > 0 ? 1 : -1;
        if (!w.el.classList.contains('walking')) {
          w.el.classList.add('walking');
          if (w.pose === 'sleep' || w.pose === 'cheer') this._pose(w, 'idle');
        }
        this._place(w);
        continue;
      }
      if (w.el.classList.contains('walking')) {
        w.el.classList.remove('walking');
        if (w.onArrive) {
          w.onArrive();
          continue;
        }
        if (w.then) this._pose(w, w.then);
        w.then = null;
        w.wait = rand(2.5, 7);
      }
      w.wait -= sec;
      if (w.wait <= 0 && !w.leaving && !w.el.classList.contains('gifting')) {
        const g = this._pickGoal(w);
        this._target(w, g.at);
        w.then = g.then;
        if (w.pose !== 'idle') this._pose(w, 'idle');
      }
    }
    const Z = PARK.zombieZone;
    if (Z) {
      for (const z of this.zombies) {
        if (z.down > 0) {
          z.down -= sec;
          if (z.down <= 0) {
            z.el.classList.remove('down');
            z.el.querySelector('.zfig').innerHTML = zombieSvg(z.kind, { variant: z.variant });
          }
          continue;
        }
        z.x += z.v * sec;
        if (z.x < Z.x0 || z.x > Z.x1) {
          z.v = -z.v;
          z.x = Math.max(Z.x0, Math.min(Z.x1, z.x));
        }
        z.bump -= sec;
        if (z.bump <= 0) {
          z.bump = rand(6, 16);
          z.el.classList.remove('bumping');
          void z.el.offsetWidth;
          z.el.classList.add('bumping');
          // Jumpy residents jump.
          for (const w of this.walkers.values()) {
            if (w.vibe !== 'jumpy' || w.leaving) continue;
            w.el.classList.remove('jump');
            void w.el.offsetWidth;
            w.el.classList.add('jump');
          }
        }
        this._placeZ(z);
      }
    }
  }

  _click(e) {
    const t = e.target.closest('[data-tap]');
    if (!t) return;
    const kind = t.dataset.tap;
    if (kind === 'gift') {
      e.stopPropagation();
      this.cb.onGift(t);
      return;
    }
    if (kind === 'bld') this.cb.onBuilding(t.dataset.id, t);
    else if (kind === 'person') this.cb.onPerson(Number(t.dataset.id), t);
    else if (kind === 'wheel') this.cb.onWheel(t);
    else if (kind === 'zed') {
      const z = this.zombies.find((q) => q.el === t);
      if (z) this._bonk(z);
    }
  }
}
