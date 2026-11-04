// The street: one side-scrolling view of Hope Street. Your people wander the
// yard, visitors wait outside the gate, the infected shamble on the street and
// beyond the frontier barricade. Reclaiming a building pushes the fog back and
// moves the barricade one building further along.

import { BUILDINGS, BUILDING_INDEX } from './config.js';
import { WORLD, W, LEFT, SLOT, slotX, buildingX, centerX, skylineSvg, groundSvg, buildingSvg, buildingHeight, wallSvg, frontierSvg, campfireSvg, yardPropSvg, zombieSvg } from './art.js';
import { figureSvg } from './portrait.js';
import { icon } from './icons.js';
import { clamp } from './util.js';

const BAND = { top: 20, bottom: 336 }; // world rows that must stay clear of the HUD bars
const GATE_X = centerX(0); // the gate sits in the wall in front of the firehouse
const STREET_ZEDS = 12;
const DARK_ZEDS = 10;
const FIRE = { x: centerX(0) + 92, y: WORLD.yardTop + 30 };

export class Street {
  constructor(el, meta, handlers) {
    this.el = el;
    this.meta = meta;
    this.handlers = handlers; // { onBuilding(id), onTarget(), onPerson(id), onGate(), onLocked(id) }
    this.scale = 1;
    this.vw = innerWidth;
    this.people = new Map(); // id -> walker
    this.visitors = new Map(); // id -> walker outside the gate
    this.leaving = [];
    this.zeds = [];
    this.cine = null;
    this.dragging = false;
    this.hold = false;
    this._keys = {};
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

    const back = div('layer back');
    back.innerHTML = `<div class="sk">${skylineSvg()}</div><div class="gr">${groundSvg()}</div>`;
    this.bEls = BUILDINGS.map((b, i) => {
      const d = div(`bld b-${b.id}`);
      d.dataset.id = b.id;
      d.style.left = `${buildingX(i)}px`;
      d.style.top = `${WORLD.ground - buildingHeight(b.id) - 2}px`;
      back.appendChild(d);
      return d;
    });
    this.objects = div('layer objects');
    this.wallEls = BUILDINGS.map((b, i) => {
      const d = div('wall');
      d.style.left = `${slotX(i)}px`;
      d.style.top = `${WORLD.wallY - 6}px`;
      d.style.zIndex = String(WORLD.wallY + 26);
      this.objects.appendChild(d);
      return d;
    });
    this.propEls = BUILDINGS.map((b, i) => {
      const d = div('prop');
      d.style.left = `${centerX(i) - 34}px`;
      d.style.top = `${WORLD.yardTop - 4}px`;
      d.style.zIndex = String(WORLD.yardTop + 22);
      if (i > 0 && !b.final) d.innerHTML = yardPropSvg(b.id);
      this.objects.appendChild(d);
      return d;
    });
    const fire = div('fire');
    fire.innerHTML = campfireSvg();
    fire.style.transform = `translate(${FIRE.x - 20}px, ${FIRE.y - 30}px)`;
    fire.style.zIndex = String(FIRE.y);
    this.objects.appendChild(fire);
    this.frontierEl = div('frontier');
    this.frontierEl.innerHTML = frontierSvg();
    this.frontierEl.style.top = `${WORLD.ground - 4}px`;
    this.frontierEl.style.zIndex = String(WORLD.wallY + 24);
    this.objects.appendChild(this.frontierEl);
    for (let k = 0; k < STREET_ZEDS + DARK_ZEDS; k++) {
      const z = div('zw');
      z.innerHTML = zombieSvg(k);
      this.objects.appendChild(z);
      const street = k < STREET_ZEDS;
      this.zeds.push({ el: z, street, x: 0, y: 0, home: 0, dir: Math.random() < 0.5 ? -1 : 1, speed: 3 + Math.random() * 6, t: Math.random() * 10 });
    }
    this.fog = div('fog');
    this.fogNear = div('fog near');
    this.marks = div('layer marks');
    this.target = document.createElement('button');
    this.target.type = 'button';
    this.target.className = 'target';
    this.marks.appendChild(this.target);
    this.tags = BUILDINGS.map((b, i) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'ftag hidden';
      t.dataset.id = b.id;
      t.style.left = `${centerX(i)}px`;
      t.style.top = `${WORLD.ground + 1}px`;
      this.marks.appendChild(t);
      return t;
    });
    this.world.append(back, this.objects, this.fogNear, this.fog, this.marks);
    this.frontier = this._frontierTarget();
    this._layoutZombies(true);
  }

  _input() {
    this.world.addEventListener('click', (e) => {
      if (this.dragging || this.cine) return;
      const t = e.target;
      if (t.closest('.target')) return this.handlers.onTarget();
      if (t.closest('.vis')) return this.handlers.onGate();
      const pp = t.closest('.pp');
      if (pp) return this.handlers.onPerson(Number(pp.dataset.id));
      const tag = t.closest('.ftag');
      if (tag) return this.handlers.onBuilding(tag.dataset.id);
      const b = t.closest('.bld');
      if (b) {
        const i = BUILDING_INDEX[b.dataset.id];
        if (this.meta.level(b.dataset.id) > 0) return this.handlers.onBuilding(b.dataset.id);
        if (i === this._reclaimed()) return this.handlers.onTarget();
        if (BUILDINGS[i].final && this.meta.s.sealed) return this.handlers.onTarget();
        return this.handlers.onLocked(b.dataset.id);
      }
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

  // --- Layout ------------------------------------------------------------------------------

  resize(vw, vh, hudTop = 50, hudBottom = 80) {
    const s = clamp((vh - hudTop - hudBottom) / (BAND.bottom - BAND.top), 0.55, 1.7);
    this.scale = s;
    this.vw = vw;
    const offY = Math.min(hudTop - BAND.top * s, vh - hudBottom - BAND.bottom * s);
    this.offY = Math.max(offY, vh - hudBottom - BAND.bottom * s);
    this.world.style.transform = `translate(0px, ${this.offY}px) scale(${s})`;
    this.sizer.style.width = `${W * s}px`;
    this.sizer.style.height = `${vh}px`;
    document.documentElement.style.setProperty('--hz', `${Math.round(this.offY + (WORLD.ground - 60) * s)}px`);
  }

  centerOn(x, smooth = true) {
    const left = clamp(x * this.scale - this.vw / 2, 0, Math.max(0, W * this.scale - this.vw));
    this.el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  focusBuilding(id, smooth = true) {
    const i = BUILDING_INDEX[id];
    this.centerOn(centerX(i), smooth);
    const el = this.bEls[i];
    el.classList.remove('ping');
    void el.offsetWidth;
    el.classList.add('ping');
  }

  /** Home view: the gate and the frontier both in view when they fit. */
  focusHome(smooth = false) {
    const f = this.frontier;
    const mid = Math.min((GATE_X + f) / 2 + 60, f - this.vw / this.scale / 2 + 120);
    this.centerOn(Math.max(GATE_X + 40, mid), smooth);
  }

  focusGate(smooth = true) {
    this.centerOn(GATE_X + 60, smooth);
  }

  /** Screen rect of a building (for flying effects). */
  rectOf(id) {
    return this.bEls[BUILDING_INDEX[id]].getBoundingClientRect();
  }

  gateRect() {
    return this.wallEls[0].getBoundingClientRect();
  }

  // --- State ---------------------------------------------------------------------------------

  /** How many buildings are yours (the firehouse counts). */
  _reclaimed() {
    let n = 0;
    for (const b of BUILDINGS) if (!b.final && this.meta.level(b.id) > 0) n++;
    if (this.meta.s.sealed) n = BUILDINGS.length;
    return n;
  }

  _frontierTarget() {
    return slotX(this._reclaimed());
  }

  update() {
    if (this.hold) return;
    const m = this.meta;
    const reclaimed = this._reclaimed();
    const can = new Set(m.affordable().map((u) => u.id));
    BUILDINGS.forEach((b, i) => {
      const lv = b.final ? (m.s.sealed ? 1 : 0) : m.level(b.id);
      const key = `${lv}`;
      if (this._keys[`b${i}`] !== key) {
        this._keys[`b${i}`] = key;
        this.bEls[i].innerHTML = buildingSvg(b.id, lv);
        this.bEls[i].classList.toggle('mine', lv > 0);
        this.wallEls[i].innerHTML = lv > 0 && !b.final ? wallSvg(lv, { gate: i === 0 }) : '';
        this.propEls[i].classList.toggle('on', lv > 0);
      }
      this.bEls[i].classList.toggle('next', i === reclaimed && !m.s.sealed);
      const tag = this.tags[i];
      const show = lv > 0 && !b.final;
      tag.classList.toggle('hidden', !show);
      if (show) {
        const up = can.has(b.id);
        const html = `<span>${b.facility}</span><b>${lv}</b>${up ? icon('up') : ''}`;
        if (tag._html !== html) {
          tag._html = html;
          tag.innerHTML = html;
        }
        tag.classList.toggle('up', up);
      }
    });
    if (!this.cine) {
      const f = this._frontierTarget();
      if (f !== this.frontier) {
        this.frontier = f;
        this._layoutZombies();
      }
      this._placeFog();
    }
    // The target marker over the next building.
    const goal = m.goal();
    this.target.classList.toggle('hidden', goal.done);
    if (!goal.done) {
      const i = BUILDING_INDEX[goal.building.id];
      const html = `<span class="tk">${goal.building.final ? 'SEAL THE STREET' : 'RECLAIM'}</span><span class="tp">${[0, 1, 2].map((k) => `<i class="${k < goal.step ? 'on' : k === goal.step ? 'cur' : ''}"></i>`).join('')}</span>`;
      if (this.target._html !== html) {
        this.target._html = html;
        this.target.innerHTML = html;
      }
      this.target.style.left = `${centerX(i)}px`;
      // Over the roof, but never up under the HUD.
      this.target.style.top = `${Math.max(BAND.top + 58, WORLD.ground - buildingHeight(goal.building.id) - 12)}px`;
    }
    this._syncPeople();
  }

  _placeFog() {
    const f = this.frontier;
    this.fogNear.style.transform = `translateX(${f}px)`;
    this.fog.style.transform = `translateX(${f + SLOT}px)`;
    this.frontierEl.style.transform = `translateX(${f - 14}px)`;
    this.frontierEl.classList.toggle('hidden', this.meta.s.sealed && !this.cine);
  }

  // --- People ---------------------------------------------------------------------------------

  _yardBounds() {
    return { x0: LEFT + 18, x1: Math.max(LEFT + 120, this.frontier - 26), y0: WORLD.yardTop + 4, y1: WORLD.yardBottom };
  }

  _walker(p, x, y, cls = 'pp') {
    const el = div(cls);
    el.dataset.id = p.id;
    el.innerHTML = figureSvg(p, { hurt: p.injured > 0 }) + `<i class="nm">${escapeHtml(p.first)}</i>`;
    this.objects.appendChild(el);
    return { el, id: p.id, x, y, tx: x, ty: y, path: [], idle: Math.random() * 3, speed: 16 + Math.random() * 10, dir: 1, hurt: p.injured > 0, look: p.look };
  }

  _syncPeople() {
    const m = this.meta;
    const ids = new Set(m.s.people.map((p) => p.id));
    const vis = new Set(m.s.gate.visitors.map((p) => p.id));
    // Visitors who were taken in walk through the gate.
    for (const [id, w] of this.visitors) {
      if (vis.has(id)) continue;
      this.visitors.delete(id);
      if (ids.has(id)) {
        w.el.className = 'pp';
        w.el.classList.add('arriving');
        w.path = [
          { x: GATE_X, y: WORLD.wallY + 40 },
          { x: GATE_X, y: WORLD.yardBottom - 2 },
          { x: GATE_X + 30 + Math.random() * 80, y: WORLD.yardTop + 10 + Math.random() * 30 },
        ];
        w.speed = 30;
        this.people.set(id, w);
        this._openGate();
      } else {
        // Turned away: off down the street.
        w.path = [{ x: w.x + (Math.random() < 0.5 ? -1 : 1) * 260, y: w.y + 10 }];
        w.speed = 26;
        w.fade = true;
        this.leaving.push(w);
      }
    }
    // People who left walk out through the gate.
    for (const [id, w] of this.people) {
      if (ids.has(id)) continue;
      this.people.delete(id);
      w.path = [
        { x: GATE_X, y: WORLD.yardBottom - 2 },
        { x: GATE_X, y: WORLD.wallY + 40 },
        { x: GATE_X + 300, y: WORLD.street + 40 },
      ];
      w.speed = 30;
      w.fade = true;
      w.el.classList.add('leaving');
      this.leaving.push(w);
      this._openGate();
    }
    // Everyone else: make sure they're on the street, hurt ones resting by the fire.
    const b = this._yardBounds();
    for (const p of m.s.people) {
      let w = this.people.get(p.id);
      if (!w) {
        w = this._walker(p, b.x0 + Math.random() * (b.x1 - b.x0), b.y0 + Math.random() * (b.y1 - b.y0));
        this.people.set(p.id, w);
      }
      const hurt = p.injured > 0;
      if (hurt !== w.hurt) {
        w.hurt = hurt;
        w.el.querySelector('.fig').outerHTML = figureSvg(p, { hurt });
      }
      w.el.classList.toggle('hurt', hurt);
      w.el.classList.toggle('crew', m.s.squad.includes(p.id));
    }
    // Visitors outside the gate.
    let k = 0;
    for (const p of m.s.gate.visitors) {
      let w = this.visitors.get(p.id);
      const spotX = GATE_X - 40 + k * 26 + (k % 2) * 6;
      const spotY = WORLD.wallY + 40 + (k % 2) * 6;
      if (!w) {
        w = this._walker(p, spotX + 160, spotY + 14, 'pp vis');
        w.path = [{ x: spotX, y: spotY }];
        w.speed = 24;
        this.visitors.set(p.id, w);
      } else if (!w.path.length) {
        w.path = [{ x: spotX, y: spotY }];
      }
      w.home = { x: spotX, y: spotY };
      k++;
    }
  }

  _openGate() {
    const w = this.wallEls[0];
    w.innerHTML = wallSvg(this.meta.level('firehouse'), { gate: true, open: true });
    clearTimeout(this._gateT);
    this._gateT = setTimeout(() => {
      w.innerHTML = wallSvg(this.meta.level('firehouse'), { gate: true });
    }, 2600);
  }

  _layoutZombies(first = false) {
    const f = this.frontier;
    this.zeds.forEach((z, k) => {
      if (z.street) {
        if (first) {
          z.home = 80 + Math.random() * (W - 160);
          if (Math.abs(z.home - GATE_X) < 90) z.home += 200;
          z.y = WORLD.street + 14 + Math.random() * 54;
          z.x = z.home;
        }
      } else if (first || z.home < f + 30) {
        const span = Math.max(1, W - f - 60);
        z.home = f + 40 + ((k - STREET_ZEDS + Math.random() * 0.8) / DARK_ZEDS) * span;
        z.x = z.home;
        z.y = WORLD.yardTop + 6 + Math.random() * 46;
      }
    });
  }

  // --- Animation -------------------------------------------------------------------------------

  animate(dt) {
    const step = Math.min(0.1, dt / 1000);
    const b = this._yardBounds();
    for (const w of this.people.values()) this._walk(w, step, b, true);
    for (const w of this.visitors.values()) this._walk(w, step, null, false);
    this.leaving = this.leaving.filter((w) => {
      this._walk(w, step, null, false);
      if (!w.path.length) {
        w.el.remove();
        return false;
      }
      return true;
    });
    for (const z of this.zeds) {
      z.t += step;
      z.x += z.dir * z.speed * step;
      if (Math.abs(z.x - z.home) > 30) z.dir *= -1;
      const hidden = !z.street && z.home < this.frontier + 20;
      z.el.style.opacity = hidden ? '0' : '';
      z.el.style.transform = `translate(${z.x - 12}px, ${z.y - 44}px) scaleX(${z.dir < 0 ? -1 : 1})`;
      z.el.style.zIndex = String(Math.round(z.y));
    }
    if (this.cine) this._cineStep(step);
  }

  _walk(w, step, bounds, wander) {
    if (!w.path.length && wander) {
      w.idle -= step;
      if (w.idle <= 0 && !w.hurt) {
        // Wander: the fire, a facility, or anywhere in the yard.
        const r = Math.random();
        let x;
        let y;
        if (r < 0.3) {
          x = FIRE.x - 40 + Math.random() * 80;
          y = FIRE.y + 4 + Math.random() * 14;
        } else {
          x = bounds.x0 + Math.random() * (bounds.x1 - bounds.x0);
          y = bounds.y0 + Math.random() * (bounds.y1 - bounds.y0);
        }
        w.path = [{ x: clamp(x, bounds.x0, bounds.x1), y: clamp(y, bounds.y0, bounds.y1) }];
        w.idle = 2 + Math.random() * 5;
        w.speed = 14 + Math.random() * 10;
      } else if (w.hurt && w.idle <= 0) {
        w.idle = 999;
        w.path = [{ x: FIRE.x - 60 + Math.random() * 30, y: FIRE.y + 12 + Math.random() * 10 }];
      }
    }
    // Keep people inside the yard when the street shrinks or grows.
    if (bounds && !w.path.length && (w.x > bounds.x1 + 4 || w.x < bounds.x0 - 4)) w.path = [{ x: clamp(w.x, bounds.x0, bounds.x1), y: w.y }];
    const moving = w.path.length > 0;
    if (moving) {
      const t = w.path[0];
      const dx = t.x - w.x;
      const dy = t.y - w.y;
      const d = Math.hypot(dx, dy);
      const v = w.speed * step;
      if (d <= v) {
        w.x = t.x;
        w.y = t.y;
        w.path.shift();
        if (!w.path.length) w.el.classList.remove('arriving');
      } else {
        w.x += (dx / d) * v;
        w.y += (dy / d) * v;
        if (Math.abs(dx) > 0.5) w.dir = dx < 0 ? -1 : 1;
      }
    }
    w.el.classList.toggle('walking', moving);
    w.el.style.transform = `translate(${w.x - 12}px, ${w.y - 44}px)`;
    w.el.firstElementChild.style.transform = w.dir < 0 ? 'scaleX(-1)' : '';
    w.el.style.zIndex = String(Math.round(w.y));
    if (w.fade && w.path.length <= 1) w.el.style.opacity = String(Math.max(0, (parseFloat(w.el.style.opacity || '1') || 1) - step * 0.6));
  }

  // --- Cinematics ---------------------------------------------------------------------------------

  /** A building was reclaimed: pan to it, light it up, push the fog and the barricade back. */
  reclaim(id) {
    return new Promise((resolve) => {
      const i = BUILDING_INDEX[id];
      this.hold = true;
      this.centerOn(centerX(i), true);
      this.el.classList.add('locked');
      this.cine = { t: 0, dur: 2.2, i, fromF: slotX(i), toF: slotX(i + 1), lit: false, resolve, id };
    });
  }

  _cineStep(step) {
    const c = this.cine;
    c.t += step;
    const f = clamp((c.t - 0.6) / (c.dur - 0.8), 0, 1);
    const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
    this.frontier = c.fromF + (c.toF - c.fromF) * e;
    this._placeFog();
    if (!c.lit && c.t > 0.9) {
      c.lit = true;
      this.hold = false;
      this.update(); // light the building, build its wall
      this.hold = true;
      const el = this.bEls[c.i];
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
    if (c.t >= c.dur) {
      this.cine = null;
      this.hold = false;
      this.el.classList.remove('locked');
      this.frontier = this._frontierTarget();
      this._layoutZombies();
      this.update();
      c.resolve();
    }
  }

  /** Little build animation when a facility is upgraded. */
  built(id) {
    const el = this.bEls[BUILDING_INDEX[id]];
    el.classList.remove('built');
    void el.offsetWidth;
    el.classList.add('built');
  }

  /** Skip the cinematic (a tap while it plays). */
  hurry() {
    if (this.cine) this.cine.t = Math.max(this.cine.t, this.cine.dur - 0.25);
  }
}

function div(cls) {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
