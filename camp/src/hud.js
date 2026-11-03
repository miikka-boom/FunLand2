// Camp HUD: resources (count up when loot lands), the two wait rewards,
// builders / expeditions / run power chips, the objective banner and PLAY.

import { RESOURCES, RES_INFO, QUESTS, ZONES } from './config.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { esc } from './ui.js';

export class Hud {
  constructor(root, camp, onAct) {
    this.root = root;
    this.camp = camp;
    this.onAct = onAct;
    this.shown = {};
    this.holdUntil = {};
    this.cache = new Map();
    this.zone = 'suburbs';
    this._build();
    for (const r of [...RESOURCES, 'gems']) this.shown[r] = this._actual(r);
  }

  _build() {
    const resPill = (r) =>
      `<div class="pill res" data-res="${r}" style="--c:${RES_INFO[r].color}">${icon(r)}<b>0</b><i class="cap"><u></u></i></div>`;
    this.root.innerHTML =
      `<div class="topbar">` +
      `<button class="lvl" type="button" data-act="hq">${icon('tent')}<span><small>CAMP</small><b class="lvn">Lv 1</b></span></button>` +
      `<div class="res-row">${RESOURCES.map(resPill).join('')}` +
      `<div class="pill gems" data-res="gems">${icon('gems')}<b>0</b></div>` +
      `<button class="pill surv" type="button" data-act="survivors">${icon('survivor')}<b>0/0</b></button></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Tuning">${icon('gear')}</button>` +
      `</div>` +
      `<div class="side">` +
      `<button class="reward short" type="button" data-act="reward" data-kind="short"><span class="ring"></span>${icon('crate')}<span class="rt"></span><span class="badge">!</span></button>` +
      `<button class="reward long" type="button" data-act="reward" data-kind="long"><span class="ring"></span>${icon('airdrop')}<span class="rt"></span><span class="badge">!</span></button>` +
      `</div>` +
      `<div class="bottombar">` +
      `<div class="chips">` +
      `<button class="chip builders" type="button" data-act="builders">${icon('hammer')}<b></b></button>` +
      `<button class="chip exped" type="button" data-act="expeditions">${icon('truck')}<b></b><span class="badge">!</span></button>` +
      `<button class="chip power" type="button" data-act="loadout">${icon('power')}<b></b></button>` +
      `</div>` +
      `<button class="quest" type="button" data-act="quest"></button>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small></small></button>` +
      `</div>`;
    this.el = {
      lvl: this.root.querySelector('.lvn'),
      surv: this.root.querySelector('.surv b'),
      gems: this.root.querySelector('.gems b'),
      short: this.root.querySelector('.reward.short'),
      long: this.root.querySelector('.reward.long'),
      builders: this.root.querySelector('.chip.builders'),
      exped: this.root.querySelector('.chip.exped'),
      power: this.root.querySelector('.chip.power b'),
      quest: this.root.querySelector('.quest'),
      playSub: this.root.querySelector('.play small'),
      res: {},
    };
    for (const r of RESOURCES) {
      const p = this.root.querySelector(`.pill[data-res="${r}"]`);
      this.el.res[r] = { pill: p, b: p.querySelector('b'), cap: p.querySelector('u') };
    }
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el) this.onAct(el.dataset.act, el.dataset, el);
    });
  }

  _actual(r) {
    return r === 'gems' ? this.camp.s.gems : Math.floor(this.camp.s.res[r]);
  }

  /** The pill loot flies to. */
  target(r) {
    if (r === 'gems') return this.root.querySelector('.pill.gems');
    if (r === 'survivors') return this.root.querySelector('.pill.surv');
    return this.el.res[r] ? this.el.res[r].pill : null;
  }

  /** Freeze a counter until flying loot arrives, then let it count up. */
  hold(r, ms) {
    this.holdUntil[r] = performance.now() + ms;
  }

  /** Hold every counter (loot was granted behind a modal); thaw() releases what no loot claimed. */
  freeze() {
    for (const r of [...RESOURCES, 'gems']) this.holdUntil[r] = Infinity;
  }

  thaw() {
    for (const r of Object.keys(this.holdUntil)) if (this.holdUntil[r] === Infinity) this.holdUntil[r] = 0;
  }

  bump(r) {
    const t = this.target(r);
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

  _setHtml(el, key, value) {
    if (this.cache.get(key) !== value) {
      this.cache.set(key, value);
      el.innerHTML = value;
    }
  }

  animate(dt) {
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 7);
    for (const r of [...RESOURCES, 'gems']) {
      const actual = this._actual(r);
      if ((this.holdUntil[r] || 0) > now) continue;
      let v = this.shown[r];
      if (v === actual) continue;
      const d = actual - v;
      v += d * k;
      if (Math.abs(actual - v) < 0.6) v = actual;
      this.shown[r] = v;
    }
    for (const r of RESOURCES) this._set(this.el.res[r].b, `res:${r}`, fmtNum(Math.round(this.shown[r])));
    this._set(this.el.gems, 'gems', fmtNum(Math.round(this.shown.gems)));
  }

  update() {
    const camp = this.camp;
    const s = camp.s;
    const cap = camp.storageCap();
    this._set(this.el.lvl, 'lvl', `Lv ${camp.hq}`);
    for (const r of RESOURCES) {
      const e = this.el.res[r];
      const f = Math.min(1, s.res[r] / cap);
      e.cap.style.transform = `scaleX(${f})`;
      e.pill.classList.toggle('full', s.res[r] >= cap);
    }
    this._set(this.el.surv, 'surv', `${s.survivors}/${camp.beds()}`);
    this.root.querySelector('.pill.surv').classList.toggle('hidden', camp.hq < 2 && s.survivors <= 2);

    for (const kind of ['short', 'long']) {
      const info = camp.rewardInfo(kind);
      const el = this.el[kind];
      el.classList.toggle('ready', info.ready);
      el.style.setProperty('--p', String(Math.round(info.frac * 100)));
      this._set(el.querySelector('.rt'), `rt:${kind}`, info.ready ? 'OPEN' : fmtTime(info.remaining));
    }

    const jobs = camp.jobs().length;
    const total = camp.builders();
    this._set(this.el.builders.querySelector('b'), 'builders', `${jobs}/${total}`);
    this.el.builders.classList.toggle('idle', jobs < total);

    const slots = camp.expeditionSlots();
    this.el.exped.classList.toggle('hidden', slots === 0);
    if (slots > 0) {
      const back = s.expeditions.filter((e) => e.end <= camp.now()).length;
      this._set(this.el.exped.querySelector('b'), 'exped', `${s.expeditions.length}/${slots}`);
      this.el.exped.classList.toggle('ready', back > 0);
      this.el.exped.classList.toggle('idle', s.expeditions.length < slots && back === 0);
    }
    this._set(this.el.power, 'power', String(camp.loadout().power));

    const q = camp.questInfo();
    let qh;
    if (!q) qh = `${icon('trophy')}<span class="qt">All objectives done</span>`;
    else {
      const rw = Object.entries(q.def.reward)
        .map(([k, v]) => `<span class="qr">${icon(k)}${fmtNum(v)}</span>`)
        .join('');
      const counted = !q.def.goal.level && q.need > 1; // "Lv 4" goals read fine without x/y
      const prog = counted ? `<em>${Math.min(q.have, q.need)}/${q.need}</em>` : '';
      qh =
        `<span class="qi">${q.done ? icon('check') : icon('star')}</span>` +
        `<span class="qt"><small>${q.done ? 'COMPLETE · TAP TO CLAIM' : `OBJECTIVE ${q.index + 1}/${QUESTS.length}`}</small>${esc(q.def.text)} ${prog}</span>` +
        `<span class="qrs">${rw}</span>`;
    }
    this._setHtml(this.el.quest, 'quest', qh);
    this.el.quest.classList.toggle('done', !!(q && q.done));

    const z = ZONES.find((x) => x.id === this.zone) || ZONES[0];
    this._set(this.el.playSub, 'playsub', `${z.name} · simulated`);
  }
}
