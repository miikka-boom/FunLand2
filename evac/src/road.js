// The road: a side-scrolling journey through the districts. Stops sit on the
// far curb, the squad's van waits at the last safe room, infected shamble in
// the fog ahead. Clearing a stop drives the van on and pushes the fog back.

import { CAMPAIGNS, TOTAL_CHAPTERS, CHAPTER_TYPES, SURVIVORS } from './config.js';
import { WORLD, DIST_W, START_W, EVAC_W, stopX, worldWidth, districtSvg, startSvg, evacSvg, roadSvg, vanSvg, figureSvg, zombieSvg, heliSvg, portraitSvg, gunSvg } from './art.js';
import { icon } from './icons.js';
import { clamp } from './util.js';

const BAND = { top: 34, bottom: 318 }; // world rows that must stay clear of the HUD bars
const W = worldWidth(CAMPAIGNS.length);
const VAN_Y = 292; // bottom of the van, on the road
const ZOMBIES = 26;

export class Road {
  constructor(el, meta, handlers) {
    this.el = el;
    this.meta = meta;
    this.handlers = handlers;
    this.scale = 1;
    this.stops = [];
    this.squadEls = new Map();
    this.zeds = [];
    this.cine = null;
    this.dragging = false;
    this._build();
    this._input();
  }

  _build() {
    this.el.innerHTML = '';
    this.sizer = div('sizer');
    this.world = div('world');
    this.world.style.width = `${W}px`;
    this.world.style.height = `${WORLD.h}px`;
    this.el.append(this.sizer, this.world);

    const layer = div('layer dists');
    layer.appendChild(place(div('dist start'), 0, START_W, startSvg()));
    this.dists = CAMPAIGNS.map((c, ci) => {
      const d = place(div(`dist d-${c.id}`), START_W + ci * DIST_W, DIST_W, districtSvg(ci));
      layer.appendChild(d);
      return d;
    });
    layer.appendChild(place(div('dist evac'), START_W + CAMPAIGNS.length * DIST_W, EVAC_W, evacSvg()));
    const road = div('layer roadl');
    road.innerHTML = roadSvg(W);
    this.objects = div('layer objects');
    this.fog = div('fog');
    this.marks = div('layer marks');
    this.world.append(layer, road, this.objects, this.fog, this.marks);

    // District signs.
    CAMPAIGNS.forEach((c, ci) => {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'dsign';
      s.dataset.ci = ci;
      // Centered in the gap between the last district's finale and this district's first stop.
      s.style.left = `${START_W + ci * DIST_W + 20}px`;
      s.innerHTML = `<b>${c.name.toUpperCase()}</b><small></small>`;
      this.marks.appendChild(s);
      c.sign = s;
    });

    // Stops.
    for (let i = 0; i < TOTAL_CHAPTERS; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stop';
      b.dataset.i = i;
      b.style.left = `${stopX(i)}px`;
      const ch = this.meta.chapter(i);
      const t = CHAPTER_TYPES[ch.type];
      let reward = '';
      if (ch.unlock && ch.unlock.weapon) reward = `<span class="reward gunr">${gunSvg(ch.unlock.weapon)}</span>`;
      else if (ch.unlock && ch.unlock.survivor) reward = `<span class="reward face">${portraitSvg(ch.unlock.survivor)}</span>`;
      else if (ch.unlock && ch.unlock.evac) reward = `<span class="reward heli">${icon('heli')}</span>`;
      b.innerHTML =
        reward +
        `<span class="badge">${ch.finale ? icon('skull') : `<b>${(i % 5) + 1}</b>`}<i class="ty">${icon(t.icon)}</i></span>` +
        `<span class="stars"></span><span class="post"></span><span class="tag"></span>`;
      this.marks.appendChild(b);
      this.stops.push({ el: b, key: '' });
    }

    // Van, squad, chopper.
    this.van = div('van');
    this.van.innerHTML = vanSvg();
    this.objects.appendChild(this.van);
    this.heli = div('heli');
    this.heli.innerHTML = heliSvg();
    this.heli.style.left = `${START_W + CAMPAIGNS.length * DIST_W + 90}px`;
    this.objects.appendChild(this.heli);

    // Infected in the fog.
    for (let k = 0; k < ZOMBIES; k++) {
      const z = div('zed-w');
      z.innerHTML = zombieSvg(k);
      this.objects.appendChild(z);
      this.zeds.push({ el: z, x: 0, y: 0, home: 0, dir: Math.random() < 0.5 ? -1 : 1, speed: 4 + Math.random() * 6, t: Math.random() * 10 });
    }
    this.vanX = this._vanTarget();
    this.frontier = this._frontierTarget();
    this._layoutZombies(true);
  }

  _input() {
    this.world.addEventListener('click', (e) => {
      if (this.dragging || this.cine) return;
      const stop = e.target.closest('.stop');
      if (stop) return this.handlers.onStop(Number(stop.dataset.i));
      const sign = e.target.closest('.dsign');
      if (sign) return this.handlers.onSign(Number(sign.dataset.ci));
      if (e.target.closest('.van') || e.target.closest('.sq')) this.handlers.onSquad();
    });
    let down = null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = { x: e.clientX, left: this.el.scrollLeft };
      this.dragging = false;
    });
    addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 6) this.dragging = true;
      if (this.dragging) this.el.scrollLeft = down.left - dx;
    });
    addEventListener('pointerup', () => {
      down = null;
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
  }

  // --- Layout --------------------------------------------------------------------------------

  resize(vw, vh, hudTop = 50, hudBottom = 80) {
    const s = clamp((vh - hudTop - hudBottom) / (BAND.bottom - BAND.top), 0.6, 1.7);
    this.scale = s;
    this.vw = vw;
    this.vh = vh;
    const offY = Math.max(vh - hudBottom - BAND.bottom * s, vh - WORLD.h * s);
    this.world.style.transform = `translate(0px, ${offY}px) scale(${s})`;
    this.sizer.style.width = `${W * s}px`;
    this.sizer.style.height = `${vh}px`;
    document.documentElement.style.setProperty('--hz', `${Math.round(offY + WORLD.horizon * s)}px`);
  }

  centerOn(x, smooth = true) {
    const left = clamp(x * this.scale - this.vw / 2, 0, Math.max(0, W * this.scale - this.vw));
    this.el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  focusStop(i, smooth = true) {
    this.centerOn(stopX(i), smooth);
    const el = this.stops[i].el;
    el.classList.remove('ping');
    void el.offsetWidth;
    el.classList.add('ping');
  }

  focusVan(smooth = false) {
    // Keep the next stop in view too.
    const next = Math.min(this.meta.s.next, TOTAL_CHAPTERS - 1);
    this.centerOn((this.vanX + stopX(next)) / 2 + 40, smooth);
  }

  stopRect(i) {
    return this.stops[i].el.querySelector('.badge').getBoundingClientRect();
  }

  // --- State -----------------------------------------------------------------------------------

  _vanTarget() {
    const n = this.meta.s.next;
    if (n <= 0) return 120;
    if (n >= TOTAL_CHAPTERS) return START_W + CAMPAIGNS.length * DIST_W + 40;
    return stopX(n - 1) + 6;
  }

  _frontierTarget() {
    const n = this.meta.s.next;
    if (n >= TOTAL_CHAPTERS) return W + 400;
    return stopX(n) + 90;
  }

  update() {
    const m = this.meta;
    for (let i = 0; i < TOTAL_CHAPTERS; i++) {
      const ch = m.chapter(i);
      const st = this.stops[i];
      const key = `${ch.state}:${ch.stars}`;
      if (key === st.key) continue;
      st.key = key;
      st.el.className = `stop st-${ch.state}${ch.finale ? ' finale' : ''}${ch.unlock ? ' has-reward' : ''}`;
      st.el.querySelector('.stars').innerHTML = ch.state === 'done' ? [1, 2, 3].map((k) => icon(k <= ch.stars ? 'star' : 'starEmpty')).join('') : '';
      st.el.querySelector('.tag').textContent = ch.state === 'next' ? 'PLAY' : '';
      st.el.setAttribute('aria-label', `${ch.label}: ${ch.name}`);
    }
    CAMPAIGNS.forEach((c, ci) => {
      const p = m.campaignProgress(ci);
      this.dists[ci].classList.toggle('reclaimed', p.done);
      const small = c.sign.querySelector('small');
      const txt = p.done ? `${p.mastered ? 'MASTERED' : 'RECLAIMED'} · ★${p.stars}/${p.maxStars}` : `${p.cleared}/5 · ★${p.stars}`;
      if (small.textContent !== txt) small.textContent = txt;
      c.sign.classList.toggle('done', p.done);
    });
    if (!this.cine) {
      const vx = this._vanTarget();
      if (vx !== this.vanX) this.vanX = vx;
      const f = this._frontierTarget();
      if (f !== this.frontier) this.frontier = f;
    }
    this._placeVan();
    this._placeFog();
    this._syncSquad();
    this.heli.classList.toggle('gone', m.s.evac);
  }

  _placeVan() {
    this.van.style.transform = `translate(${this.vanX - 60}px, ${VAN_Y - 64}px)`;
    let k = 0;
    for (const [, el] of this.squadEls) {
      el.style.transform = `translate(${this.vanX - 78 - k * 17}px, ${VAN_Y + 8 - 38 + (k % 2) * 3}px)`;
      el.style.zIndex = String(10 + (k % 2));
      k++;
    }
  }

  _placeFog() {
    this.fog.style.transform = `translateX(${this.frontier}px)`;
  }

  _syncSquad() {
    const want = this.meta.squad();
    const key = want.join(',');
    if (key === this._squadKey) return;
    this._squadKey = key;
    for (const [id, el] of this.squadEls) if (!want.includes(id)) {
      el.remove();
      this.squadEls.delete(id);
    }
    for (const id of want) {
      if (this.squadEls.has(id)) continue;
      const el = div('sq');
      el.innerHTML = figureSvg(id);
      el.title = SURVIVORS[id].name;
      this.objects.appendChild(el);
      this.squadEls.set(id, el);
    }
    // Keep you first.
    const ordered = new Map(want.map((id) => [id, this.squadEls.get(id)]));
    this.squadEls = ordered;
    this._placeVan();
  }

  _layoutZombies(first = false) {
    const from = this.frontier + 40;
    const to = START_W + CAMPAIGNS.length * DIST_W;
    const span = Math.max(1, to - from);
    this.zeds.forEach((z, k) => {
      if (first || z.home < from) {
        z.home = from + ((k + Math.random() * 0.8) / this.zeds.length) * span;
        z.x = z.home;
        z.y = 246 + Math.random() * 54;
      }
    });
  }

  animate(dt) {
    const step = Math.min(0.1, dt / 1000);
    for (const z of this.zeds) {
      z.t += step;
      z.x += z.dir * z.speed * step;
      if (Math.abs(z.x - z.home) > 26) z.dir *= -1;
      const hidden = z.home < this.frontier + 30;
      z.el.style.opacity = hidden ? '0' : '';
      z.el.style.transform = `translate(${z.x}px, ${z.y - 36}px) scaleX(${z.dir < 0 ? -1 : 1})`;
      z.el.style.zIndex = String(Math.round(z.y));
    }
    if (this.cine) this._cineStep(step);
  }

  // --- The drive ---------------------------------------------------------------------------------

  /** Drive the van from where it was to the new safe room; resolves when done. */
  drive({ fromX, toX, fogTo, reclaim = null }) {
    return new Promise((resolve) => {
      this.vanX = fromX;
      this.cine = { fromX, toX, t: 0, dur: Math.min(2.4, 0.9 + Math.abs(toX - fromX) / 260), fogFrom: this.frontier, fogTo, reclaim, resolve };
      this.van.classList.add('driving');
      for (const [, el] of this.squadEls) el.classList.add('hop');
      this.el.classList.add('locked');
    });
  }

  /** Finish the drive quickly from wherever it is (a tap during the cinematic). */
  hurry() {
    const c = this.cine;
    if (!c || c.hurried) return;
    c.hurried = true;
    c.fromX = this.vanX;
    c.fogFrom = this.frontier;
    c.t = 0;
    c.dur = 0.3;
  }

  _cineStep(step) {
    const c = this.cine;
    c.t += step;
    const f = Math.min(1, c.t / c.dur);
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    this.vanX = c.fromX + (c.toX - c.fromX) * e;
    this.frontier = c.fogFrom + (c.fogTo - c.fogFrom) * Math.min(1, e * 1.1);
    this._placeVan();
    this._placeFog();
    this.el.scrollLeft = clamp((this.vanX + 140) * this.scale - this.vw / 2, 0, W * this.scale - this.vw);
    if (f >= 1) {
      this.cine = null;
      this.van.classList.remove('driving');
      for (const [, el] of this.squadEls) el.classList.remove('hop');
      this.el.classList.remove('locked');
      this._layoutZombies();
      c.resolve();
    }
  }
}

function div(cls) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function place(d, x, w, html) {
  d.style.left = `${x}px`;
  d.style.width = `${w}px`;
  d.innerHTML = html;
  return d;
}

export { W as ROAD_W, stopX };
