// The camp panorama: a horizontally scrolling world with fixed building
// plots, rubble expansions, the campfire and wandering survivors. Reads the
// Camp every UI tick and only touches the DOM when something changed.

import { BUILDINGS, BUILDING_ORDER, RUBBLE, RES_INFO } from './config.js';
import { buildingSvg, campfireSvg, rubbleSvg, skylineSvg, groundSvg, survivorSvg, scaffoldSvg, dropSvg } from './art.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { WORLD, BAND, PLOTS, CAMPFIRE, RUBBLE_AT, WALK, BUBBLE_Y, DROPS, campEdge } from './layout.js';
import { clamp } from './util.js';

const SHIRTS = ['#5f8fb0', '#b0584a', '#6f8a4a', '#c9a24a', '#7a5f9a', '#4f7f7a', '#a86a3a', '#8a8f96'];
const PANTS = ['#3b4a5a', '#4a3a2a', '#2f3a2a', '#45403a'];
const SKIN = ['#e0b08a', '#c68e64', '#8d5a3b', '#f0c8a0', '#a8714b'];
const HAIR = ['#2a1d14', '#5a3a1e', '#a8743a', '#1a1a1a', '#7a7a7a'];

export class Scene {
  constructor(el, camp, handlers) {
    this.el = el;
    this.camp = camp;
    this.handlers = handlers;
    this.scale = 1;
    this.plots = {};
    this.rubble = {};
    this.walkers = [];
    this.edge = -1;
    this.dragging = false;
    this._build();
    this._bindInput();
  }

  // --- DOM -----------------------------------------------------------------------------------

  _build() {
    this.el.innerHTML = '';
    this.sizer = document.createElement('div');
    this.sizer.className = 'sizer';
    this.world = document.createElement('div');
    this.world.className = 'world';
    this.world.style.width = `${WORLD.w}px`;
    this.world.style.height = `${WORLD.h}px`;
    this.skyline = document.createElement('div');
    this.skyline.className = 'skyline';
    this.skyline.innerHTML = skylineSvg(WORLD.w * 0.75 + 400, 120);
    this.skyline.style.top = `${WORLD.horizon - 118}px`;
    this.ground = document.createElement('div');
    this.ground.className = 'ground';
    this.objects = document.createElement('div');
    this.objects.className = 'objects';
    this.world.append(this.skyline, this.ground, this.objects);
    this.el.append(this.sizer, this.world);

    const fire = campfireSvg();
    this.campfire = this._place('campfire', CAMPFIRE.x, CAMPFIRE.y, fire.w, fire.h);
    this.campfire.innerHTML = fire.html;
    this.objects.appendChild(this.campfire);

    // Back row first: where boxes overlap, the front row should win.
    for (const id of [...BUILDING_ORDER].sort((a, b) => PLOTS[a].y - PLOTS[b].y)) this._makePlot(id);
    for (const area of Object.keys(RUBBLE)) this._makeRubble(area);
    this.drops = {};
    for (const kind of ['short', 'long']) {
      const at = DROPS[kind];
      const size = kind === 'short' ? [44, 44] : [68, 112];
      const d = this._place(`drop drop-${kind}`, at.x, at.y, size[0], size[1]);
      d.dataset.kind = kind;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', kind === 'short' ? 'Supply crate' : 'Airdrop');
      d.innerHTML = dropSvg(kind);
      this.objects.appendChild(d);
      this.drops[kind] = { el: d, shown: false };
    }
    this._drawGround();
  }

  _place(cls, x, y, w, h) {
    const d = document.createElement('div');
    d.className = cls;
    d.style.left = `${x - w / 2}px`;
    d.style.top = `${y - h + 8}px`;
    d.style.width = `${w}px`;
    d.style.height = `${h}px`;
    d.style.zIndex = String(Math.round(y));
    return d;
  }

  /**
   * Plots and rubble don't form their own stacking context: their art sorts
   * by baseline with everything else, while their labels (tag, sign, timer,
   * bubble) sit in a band above all art so nothing in front can hide them.
   */
  _layered(d, y) {
    d.style.zIndex = '';
    d.style.setProperty('--z', String(Math.round(y)));
  }

  _makePlot(id) {
    const at = PLOTS[id];
    const a = buildingSvg(id, 1);
    const d = this._place('plot', at.x, at.y, a.w, a.h);
    this._layered(d, at.y);
    d.dataset.id = id;
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', BUILDINGS[id].name);
    d.innerHTML =
      `<div class="plot-pad"></div>` +
      `<div class="plot-art"></div>` +
      `<div class="plot-scaffold">${scaffoldSvg(a.w, a.h)}</div>` +
      `<div class="plot-tag"><span class="lv"></span><span class="nm">${BUILDINGS[id].name}</span><span class="upa">${icon('arrow')}</span></div>` +
      `<div class="plot-sign"></div>` +
      `<div class="plot-timer"><div class="bar"><i></i></div><span class="t"></span></div>` +
      `<div class="plot-new">NEW</div>` +
      (BUILDINGS[id].kind === 'producer'
        ? `<button class="bubble" type="button" data-res="${BUILDINGS[id].produces}" style="--c:${RES_INFO[BUILDINGS[id].produces].color};top:${Math.round(a.h * (BUBBLE_Y[id] || 0.3) - 22)}px">${icon(BUILDINGS[id].produces)}<b></b></button>`
        : '');
    this.objects.appendChild(d);
    this.plots[id] = {
      el: d,
      art: d.querySelector('.plot-art'),
      lv: d.querySelector('.lv'),
      sign: d.querySelector('.plot-sign'),
      timerBar: d.querySelector('.plot-timer i'),
      timerText: d.querySelector('.plot-timer .t'),
      bubble: d.querySelector('.bubble'),
      bubbleText: d.querySelector('.bubble b'),
      w: a.w,
      h: a.h,
      key: '',
      artKey: '',
      signKey: '',
    };
  }

  _makeRubble(area) {
    const at = RUBBLE_AT[area];
    const a = rubbleSvg(area);
    const d = this._place('rubble', at.x, at.y, a.w, a.h);
    this._layered(d, at.y);
    d.dataset.area = area;
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', RUBBLE[area].name);
    d.innerHTML =
      `<div class="plot-art">${a.html}</div>` +
      `<div class="plot-scaffold dust"><i></i><i></i><i></i><i></i></div>` +
      `<div class="plot-sign"></div>` +
      `<div class="plot-timer"><div class="bar"><i></i></div><span class="t"></span></div>`;
    this.objects.appendChild(d);
    this.rubble[area] = {
      el: d,
      sign: d.querySelector('.plot-sign'),
      timerBar: d.querySelector('.plot-timer i'),
      timerText: d.querySelector('.plot-timer .t'),
      key: '',
    };
  }

  _drawGround() {
    const edge = campEdge(this.camp.s.rubble);
    if (edge === this.edge) return;
    this.edge = edge;
    this.ground.innerHTML = groundSvg(WORLD.w, WORLD.h, WORLD.horizon, edge);
  }

  // --- Input -----------------------------------------------------------------------------------

  _bindInput() {
    this.world.addEventListener('click', (e) => {
      if (this.dragging) return;
      const bubble = e.target.closest('.bubble');
      const plot = e.target.closest('.plot');
      if (bubble && plot) {
        e.stopPropagation();
        this.handlers.onCollect(plot.dataset.id, bubble);
        return;
      }
      if (plot) {
        this.handlers.onPlot(plot.dataset.id);
        return;
      }
      const rub = e.target.closest('.rubble');
      if (rub) {
        this.handlers.onRubble(rub.dataset.area);
        return;
      }
      const drop = e.target.closest('.drop');
      if (drop) this.handlers.onReward(drop.dataset.kind, drop.getBoundingClientRect());
    });
    // Mouse: drag to pan, wheel scrolls sideways. Touch uses native scrolling.
    let down = null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = { x: e.clientX, left: this.el.scrollLeft };
      this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 6) this.dragging = true;
      if (this.dragging) this.el.scrollLeft = down.left - dx;
    });
    window.addEventListener('pointerup', () => {
      down = null;
      // Let the click that ends a drag see `dragging`, then clear it.
      setTimeout(() => (this.dragging = false), 0);
    });
    this.el.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          this.el.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
    this.el.addEventListener('scroll', () => this._parallax(), { passive: true });
  }

  _parallax() {
    const x = this.el.scrollLeft / this.scale;
    this.skyline.style.transform = `translateX(${x * 0.45}px)`;
  }

  // --- Layout ------------------------------------------------------------------------------------

  /**
   * Fit the playable band between the HUD bars: `hudTop` px of top bar and
   * `hudBottom` px of bottom bar stay clear of buildings.
   */
  resize(vw, vh, hudTop = 46, hudBottom = 74) {
    const band = BAND.bottom - BAND.top;
    const s = clamp((vh - hudTop - hudBottom) / band, 0.6, 1.6);
    this.scale = s;
    this.vw = vw;
    this.vh = vh;
    const worldW = WORLD.w * s;
    const offX = Math.max(0, (vw - worldW) / 2);
    // Anchor the band's bottom to the top of the bottom bar.
    // ...but never leave a gap under the ground on very small screens.
    const offY = Math.max(vh - hudBottom - BAND.bottom * s, vh - WORLD.h * s);
    this.offY = offY;
    this.world.style.transform = `translate(${offX}px, ${offY}px) scale(${s})`;
    this.sizer.style.width = `${Math.max(vw, worldW)}px`;
    this.sizer.style.height = `${vh}px`;
    document.documentElement.style.setProperty('--hz', `${Math.round(offY + WORLD.horizon * s)}px`);
    this._parallax();
  }

  /** Scroll so a world x is centred (smoothly unless `instant`). */
  centerOn(x, instant = false) {
    const left = clamp(x * this.scale - this.vw / 2, 0, Math.max(0, this.sizer.offsetWidth - this.vw));
    this.el.scrollTo({ left, behavior: instant ? 'auto' : 'smooth' });
  }

  focus(id) {
    const target = PLOTS[id] || RUBBLE_AT[id];
    if (!target) return;
    this.centerOn(target.x);
    const el = (this.plots[id] || this.rubble[id]).el;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 1600);
  }

  rectOf(id) {
    const p = this.plots[id] || this.rubble[id];
    return p ? p.el.getBoundingClientRect() : null;
  }

  bubbleRect(id) {
    const p = this.plots[id];
    return p && p.bubble ? p.bubble.getBoundingClientRect() : this.rectOf(id);
  }

  // --- Per tick --------------------------------------------------------------------------------------

  update() {
    const camp = this.camp;
    const now = camp.now();
    this._drawGround();
    for (const id of BUILDING_ORDER) this._updatePlot(id, now);
    for (const area of Object.keys(RUBBLE)) this._updateRubble(area, now);
    for (const kind of ['short', 'long']) {
      const d = this.drops[kind];
      const ready = camp.rewardInfo(kind).ready;
      if (ready !== d.shown) {
        d.shown = ready;
        d.el.classList.toggle('show', ready);
      }
    }
    this._syncWalkers();
  }

  _updatePlot(id, now) {
    const p = this.plots[id];
    const camp = this.camp;
    const b = camp.s.buildings[id];
    const state = camp.plotState(id);
    const lvl = b.level;
    const def = BUILDINGS[id];
    const key = `${state}:${lvl}`;
    if (key !== p.key) {
      p.key = key;
      p.el.className = `plot st-${state}`;
      const artLevel = lvl || 1;
      const artKey = `${artLevel}`;
      if (artKey !== p.artKey) {
        p.artKey = artKey;
        p.art.innerHTML = buildingSvg(id, artLevel).html;
      }
      p.lv.textContent = lvl > 0 ? String(lvl) : '';
    }
    // Sign for locked/available plots.
    let sign = '';
    if (state === 'locked') sign = `${icon('lock')}<span>Camp Lv ${def.unlockHq}</span>`;
    else if (state === 'available') sign = `${icon('hammer')}<span>Build</span>`;
    if (sign !== p.signKey) {
      p.signKey = sign;
      p.sign.innerHTML = sign;
    }
    p.el.classList.toggle('is-new', camp.isNew(id));
    const busy = state === 'upgrading' || state === 'constructing';
    p.el.classList.toggle('can-up', state === 'built' && camp.upgradeInfo(id).canStart);
    if (busy) {
      const up = b.up;
      const f = clamp((now - up.start) / Math.max(1, up.end - up.start), 0, 1);
      p.timerBar.style.transform = `scaleX(${f})`;
      p.timerText.textContent = fmtTime((up.end - now) / 1000);
    }
    if (p.bubble) {
      const frac = camp.pendingFrac(id);
      const show = state === 'built' && (frac >= 0.04 || camp.pending(id) >= 10);
      p.el.classList.toggle('has-bubble', show);
      if (show) {
        p.bubbleText.textContent = fmtNum(camp.pending(id));
        p.bubble.style.setProperty('--p', String(Math.round(frac * 100)));
        p.bubble.classList.toggle('full', frac >= 0.999);
      }
    }
  }

  _updateRubble(area, now) {
    const r = this.rubble[area];
    const st = this.camp.s.rubble[area];
    const def = RUBBLE[area];
    let state;
    if (st.done) state = 'done';
    else if (st.up) state = 'clearing';
    else if (this.camp.hq < def.hq) state = 'locked';
    else state = 'available';
    if (state !== r.key) {
      const was = r.key;
      r.key = state;
      r.el.className = `rubble st-${state}`;
      if (state === 'locked') r.sign.innerHTML = `${icon('lock')}<span>Camp Lv ${def.hq}</span>`;
      else if (state === 'available') r.sign.innerHTML = `${icon('hammer')}<span>Clear</span>`;
      else r.sign.innerHTML = '';
      if (state === 'done' && was && was !== 'done') r.el.classList.add('poof');
    }
    if (state === 'clearing') {
      const f = clamp((now - st.up.start) / Math.max(1, st.up.end - st.up.start), 0, 1);
      r.timerBar.style.transform = `scaleX(${f})`;
      r.timerText.textContent = fmtTime((st.up.end - now) / 1000);
    }
  }

  // --- Survivors ---------------------------------------------------------------------------------------

  _syncWalkers() {
    const want = Math.min(16, Math.max(0, this.camp.freeSurvivors()));
    while (this.walkers.length < want) this._addWalker(this.walkers.length);
    while (this.walkers.length > want) {
      const w = this.walkers.pop();
      w.el.remove();
    }
  }

  _addWalker(i) {
    const el = document.createElement('div');
    el.className = 'walker';
    const pick = (arr, k) => arr[(i * 7 + k * 3) % arr.length];
    el.innerHTML = survivorSvg(pick(SHIRTS, 1), pick(PANTS, 2), pick(SKIN, 3), pick(HAIR, 4));
    this.objects.appendChild(el);
    const w = { el, x: CAMPFIRE.x + (Math.random() - 0.5) * 120, y: WALK.y0 + Math.random() * (WALK.y1 - WALK.y0), tx: 0, ty: 0, wait: Math.random() * 3, speed: 16 + Math.random() * 12, dir: 1, walking: false };
    this._retarget(w);
    this.walkers.push(w);
    this._placeWalker(w);
  }

  _retarget(w) {
    const edge = this.edge > 0 ? this.edge : 980;
    if (Math.random() < 0.38) {
      // Gather round the fire.
      const a = Math.random() * Math.PI * 2;
      w.tx = CAMPFIRE.x + Math.cos(a) * (46 + Math.random() * 16);
      w.ty = CAMPFIRE.y - 6 + Math.sin(a) * 10;
    } else {
      w.tx = WALK.x0 + Math.random() * (edge - 40 - WALK.x0);
      w.ty = WALK.y0 + Math.random() * (WALK.y1 - WALK.y0);
    }
  }

  _placeWalker(w) {
    w.el.style.transform = `translate(${w.x - 8}px, ${w.y - 29}px) scaleX(${w.dir})`;
    w.el.style.zIndex = String(Math.round(w.y));
  }

  animate(dt) {
    const step = Math.min(0.1, dt / 1000);
    for (const w of this.walkers) {
      if (w.wait > 0) {
        w.wait -= step;
        if (w.walking) {
          w.walking = false;
          w.el.classList.remove('walking');
        }
        continue;
      }
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) {
        w.wait = 1.5 + Math.random() * 5;
        this._retarget(w);
        continue;
      }
      if (!w.walking) {
        w.walking = true;
        w.el.classList.add('walking');
      }
      const v = Math.min(d, w.speed * step);
      w.x += (dx / d) * v;
      w.y += (dy / d) * v * 0.8;
      if (Math.abs(dx) > 1) w.dir = dx > 0 ? 1 : -1;
      this._placeWalker(w);
    }
  }
}
