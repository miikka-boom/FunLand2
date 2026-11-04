// Safehouse HUD. Top: resources with their caps (counting up when loot
// lands), the power meter and the stage. Bottom: build slots, the Loadout
// Crate, the squad, the stage guide and PLAY (a simulated mission).

import { RESOURCES, RES_INFO, STAGES, MISSIONS, SQUAD_SIZE } from './config.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { fmtNum } from './format.js';
import { esc } from './ui.js';

const ANIMATED = RESOURCES;

export class Hud {
  constructor(top, bottom, sh, onAct) {
    this.top = top;
    this.bottom = bottom;
    this.sh = sh;
    this.onAct = onAct;
    this.shown = {};
    this.holdUntil = {};
    this.cache = new Map();
    this._build();
    for (const r of ANIMATED) this.shown[r] = this._actual(r);
  }

  _build() {
    const pill = (r) =>
      `<button class="pill res" type="button" data-act="res" data-res="${r}" style="--c:${RES_INFO[r].color}" aria-label="${RES_INFO[r].name}">` +
      `${icon(r)}<span class="num"><b>0</b><small></small></span><i class="cap"><u></u></i></button>`;
    this.top.innerHTML =
      `<button class="brand" type="button" data-act="stage"><span class="mark">${icon('shield')}</span><span class="bt"><b>SAFEHOUSE</b><small class="stage-t"></small></span></button>` +
      `<div class="res-row">${RESOURCES.map(pill).join('')}</div>` +
      `<button class="power" type="button" data-act="power" aria-label="Power">${icon('power')}<span class="segs"></span><b></b></button>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Tuning">${icon('gear')}</button>`;
    this.bottom.innerHTML =
      `<div class="chips">` +
      `<button class="chip builds" type="button" data-act="builds" aria-label="Builds">${icon('hammer')}<b></b></button>` +
      `<button class="chip crate" type="button" data-act="crate" aria-label="Loadout Crate">${icon('crate')}<b></b></button>` +
      `<button class="chip squad" type="button" data-act="open" data-id="barracks" aria-label="Squad"><span class="faces"></span></button>` +
      `</div>` +
      `<button class="guide" type="button" data-act="guide"></button>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small></small></button>`;
    const q = (root, s) => root.querySelector(s);
    this.el = {
      stage: q(this.top, '.stage-t'),
      segs: q(this.top, '.segs'),
      powerB: q(this.top, '.power b'),
      power: q(this.top, '.power'),
      builds: q(this.bottom, '.chip.builds'),
      crate: q(this.bottom, '.chip.crate'),
      faces: q(this.bottom, '.faces'),
      guide: q(this.bottom, '.guide'),
      playSub: q(this.bottom, '.play small'),
      res: {},
    };
    for (const r of RESOURCES) {
      const p = q(this.top, `.pill[data-res="${r}"]`);
      this.el.res[r] = { pill: p, b: q(p, 'b'), cap: q(p, 'small'), bar: q(p, 'u') };
    }
    const click = (e) => {
      const el = e.target.closest('[data-act]');
      if (el) this.onAct(el.dataset.act, el.dataset, el);
    };
    this.top.addEventListener('click', click);
    this.bottom.addEventListener('click', click);
  }

  _actual(r) {
    return Math.floor(this.sh.s.res[r]);
  }

  /** The element loot flies to. */
  target(k) {
    if (this.el.res[k]) return this.el.res[k].pill;
    if (k === 'crate') return this.el.crate;
    if (k === 'squad') return this.el.faces;
    return null;
  }

  /** Freeze a counter until flying loot arrives, then let it count up. */
  hold(r, ms) {
    this.holdUntil[r] = performance.now() + ms;
  }

  /** Hold every counter (loot was granted behind a layer); thaw() releases what no loot claimed. */
  freeze() {
    for (const r of ANIMATED) this.holdUntil[r] = Infinity;
  }

  thaw() {
    for (const r of Object.keys(this.holdUntil)) if (this.holdUntil[r] === Infinity) this.holdUntil[r] = 0;
  }

  bump(k) {
    const t = this.target(k);
    if (!t) return;
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }

  _set(el, key, value) {
    if (this.cache.get(key) !== value) {
      this.cache.set(key, value);
      el.textContent = value;
    }
  }

  _html(el, key, value) {
    if (this.cache.get(key) !== value) {
      this.cache.set(key, value);
      el.innerHTML = value;
    }
  }

  animate(dt) {
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 7);
    for (const r of ANIMATED) {
      const actual = this._actual(r);
      if ((this.holdUntil[r] || 0) > now) continue;
      let v = this.shown[r];
      if (v === actual) continue;
      v += (actual - v) * k;
      if (Math.abs(actual - v) < 0.6) v = actual;
      this.shown[r] = v;
    }
    for (const r of ANIMATED) this._set(this.el.res[r].b, `res:${r}`, fmtNum(Math.round(this.shown[r])));
  }

  update() {
    const sh = this.sh;
    const s = sh.s;
    for (const r of RESOURCES) {
      const e = this.el.res[r];
      const cap = sh.cap(r);
      const capped = Number.isFinite(cap);
      this._set(e.cap, `cap:${r}`, capped ? `/${fmtNum(cap)}` : '');
      e.bar.style.transform = `scaleX(${capped ? Math.min(1, s.res[r] / Math.max(1, cap)) : 0})`;
      e.pill.classList.toggle('full', capped && s.res[r] >= cap);
      e.pill.classList.toggle('capped', capped);
    }

    // Power: one segment per unit of capacity, lit while a job draws it.
    const cap = sh.powerCap();
    const used = sh.powerUsed();
    const segs = Array.from({ length: Math.max(cap, 1) }, (_, i) => `<i class="${cap === 0 ? 'none' : i < used ? 'on' : ''}"></i>`).join('');
    this._html(this.el.segs, 'segs', segs);
    this._set(this.el.powerB, 'power', cap ? `${used}/${cap}` : 'off');
    this.el.power.classList.toggle('maxed', cap > 0 && used >= cap);

    const st = sh.stageInfo();
    this._set(this.el.stage, 'stage', st ? `Stage ${st.index + 1} · ${st.def.name}` : 'All stages done');

    // Build slots.
    const builds = sh.builds().length;
    const slots = sh.buildSlots();
    this._set(this.el.builds.querySelector('b'), 'builds', `${builds}/${slots}`);
    this.el.builds.classList.toggle('idle', builds < slots);

    // Loadout Crate: total items waiting.
    let items = 0;
    for (const v of Object.values(s.crate)) items += v;
    this._set(this.el.crate.querySelector('b'), 'crate', String(items));
    this.el.crate.classList.toggle('empty', items === 0);

    // Squad faces: you first, then the three with you.
    const sq = sh.squad();
    const faces = sq
      .slice(0, SQUAD_SIZE)
      .map((m) => `<span class="face k-${m.kind}">${portrait(m.kind === 'survivor' ? m.id : m.kind === 'friend' ? (m.id === 'veteran' ? 'friend_veteran' : 'friend_rookie') : m.kind)}</span>`)
      .join('');
    this._html(this.el.faces, 'faces', faces);
    this.bottom.querySelector('.chip.squad').classList.toggle('alert', sh.waiting().length > 0);

    // Stage guide.
    let g;
    if (!st) g = `<span class="gi">${icon('star')}</span><span class="gt"><small>ALL STAGES DONE</small>The long loop: level 5 everything</span>`;
    else {
      const next = st.next;
      const done = st.goals.filter((x) => x.done).length;
      g =
        `<span class="gi">${icon(next && next.focus !== 'play' ? next.focus : 'flag')}</span>` +
        `<span class="gt"><small>STAGE ${st.index + 1}/${STAGES.length} · ${esc(st.def.name.toUpperCase())} · ${done}/${st.goals.length}</small>${esc(next ? next.text : '')}</span>` +
        `<span class="go">›</span>`;
    }
    this._html(this.el.guide, 'guide', g);

    const id = sh.nextMission();
    const M = MISSIONS[id];
    this._set(this.el.playSub, 'playsub', M ? `Ch ${M.chapter} · ${M.name} · simulation` : 'Simulated mission');
  }
}
