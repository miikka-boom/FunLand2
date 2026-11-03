// Map HUD: power + the two currencies on top, the wait rewards on the left,
// UPGRADE / next-reward goal / PLAY along the bottom, and a coach bubble
// that points at the one thing worth doing next.

import { SURVIVORS, WEAPONS, TOTAL_CHAPTERS } from './config.js';
import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { portraitSvg, gunSvg } from './art.js';
import { esc } from './ui.js';

export class Hud {
  constructor(root, meta, onAct) {
    this.root = root;
    this.meta = meta;
    this.onAct = onAct;
    this.shown = { supplies: meta.s.supplies, gems: meta.s.gems, power: meta.power().total };
    this.holdUntil = {};
    this.cache = new Map();
    this.idle = 0;
    this._build();
  }

  _build() {
    this.root.innerHTML =
      `<div class="top">` +
      `<button class="power" type="button" data-act="upgrades">${icon('power')}<span><b>0</b><small>POWER</small></span></button>` +
      `<div class="curs"><div class="pill sup" data-k="supplies">${icon('supplies')}<b>0</b></div><div class="pill gem" data-k="gems">${icon('gems')}<b>0</b></div></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button></div>` +
      `<div class="side">` +
      `<button class="wr short" type="button" data-act="reward" data-kind="short"><span class="ring"></span>${icon('crate')}<span class="rt"></span><span class="badge">!</span></button>` +
      `<button class="wr long" type="button" data-act="reward" data-kind="long"><span class="ring"></span>${icon('airdrop')}<span class="rt"></span><span class="badge">!</span></button></div>` +
      `<div class="bottom">` +
      `<button class="upgb" type="button" data-act="upgrades">${icon('up')}<b>UPGRADE</b><span class="badge"></span></button>` +
      `<button class="goal" type="button" data-act="goal"></button>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small></small><i class="risk"></i></button></div>` +
      `<div class="coach" aria-hidden="true"><span></span></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      power: q('.power b'),
      powerBtn: q('.power'),
      sup: q('.pill.sup b'),
      gem: q('.pill.gem b'),
      short: q('.wr.short'),
      long: q('.wr.long'),
      upg: q('.upgb'),
      upgBadge: q('.upgb .badge'),
      goal: q('.goal'),
      play: q('.play'),
      playSub: q('.play small'),
      risk: q('.play .risk'),
      coach: q('.coach'),
      coachText: q('.coach span'),
    };
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      this.poke();
      if (b) this.onAct(b.dataset.act, b.dataset, b);
    });
  }

  target(k) {
    return this.root.querySelector(k === 'gems' ? '.pill.gem' : k === 'power' ? '.power' : '.pill.sup');
  }

  hold(k, ms) {
    this.holdUntil[k] = performance.now() + ms;
  }

  freeze() {
    for (const k of ['supplies', 'gems', 'power']) this.holdUntil[k] = Infinity;
  }

  thaw() {
    for (const k of Object.keys(this.holdUntil)) if (this.holdUntil[k] === Infinity) this.holdUntil[k] = 0;
  }

  bump(k) {
    const t = this.target(k);
    if (!t) return;
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }

  /** Any interaction hides the coach for a while. */
  poke() {
    this.idle = 0;
    this.el.coach.classList.remove('show');
  }

  _set(el, key, v, html = false) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (html) el.innerHTML = v;
    else el.textContent = v;
  }

  animate(dt, canCoach) {
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 7);
    const actual = { supplies: this.meta.s.supplies, gems: this.meta.s.gems, power: this.meta.power().total };
    for (const key of Object.keys(actual)) {
      if ((this.holdUntil[key] || 0) > now) continue;
      let v = this.shown[key];
      if (v === actual[key]) continue;
      v += (actual[key] - v) * k;
      if (Math.abs(actual[key] - v) < 0.6) v = actual[key];
      this.shown[key] = v;
    }
    this._set(this.el.sup, 'sup', fmtNum(Math.round(this.shown.supplies)));
    this._set(this.el.gem, 'gem', fmtNum(Math.round(this.shown.gems)));
    this._set(this.el.power, 'pow', String(Math.round(this.shown.power)));
    // Coach: after a few idle seconds, point at the advised button.
    this.idle += dt;
    const show = canCoach && this.idle > 2600;
    if (show !== this.el.coach.classList.contains('show')) {
      this.el.coach.classList.toggle('show', show);
      if (show) this._placeCoach();
    }
  }

  _placeCoach() {
    const a = this.meta.advice();
    const target = a.kind === 'upgrade' ? this.el.upg : this.el.play;
    const r = target.getBoundingClientRect();
    this._set(this.el.coachText, 'coach', esc(a.text), true);
    const c = this.el.coach;
    const w = Math.min(240, innerWidth - 24);
    c.style.width = `${w}px`;
    const x = Math.max(12, Math.min(innerWidth - w - 12, r.x + r.width / 2 - w / 2));
    c.style.left = `${x}px`;
    c.style.top = `${r.y - 12}px`;
    c.style.setProperty('--ax', `${r.x + r.width / 2 - x}px`);
    target.classList.add('nudge');
    clearTimeout(this._nudgeT);
    this._nudgeT = setTimeout(() => target.classList.remove('nudge'), 1600);
  }

  update() {
    const m = this.meta;
    for (const kind of ['short', 'long']) {
      const info = m.rewardInfo(kind);
      const el = this.el[kind];
      el.classList.toggle('ready', info.ready);
      el.style.setProperty('--p', String(Math.round(info.frac * 100)));
      this._set(el.querySelector('.rt'), `rt:${kind}`, info.ready ? 'OPEN' : fmtTime(info.remaining));
    }
    const n = m.affordable().filter((u) => u.gain > 0).length;
    this._set(this.el.upgBadge, 'badge', n ? String(n) : '');
    this.el.upg.classList.toggle('has', n > 0);

    const target = m.playTarget();
    const ch = m.chapter(target);
    const o = m.oddsFor(target);
    this._set(this.el.playSub, 'psub', m.s.evac ? 'Replay any stop' : `${ch.finale ? 'Finale' : `Ch. ${(target % 5) + 1}`} · ${ch.name}`);
    this.el.risk.className = `risk tone-${o.risk.tone}`;
    this.el.risk.title = `${o.risk.label}: ${Math.round(o.chance * 100)}%`;

    const nu = m.nextUnlock();
    let g;
    if (m.s.evac) g = `${icon('trophy')}<span><small>THE EVAC</small><b>You made it</b><em>Go for 3 stars everywhere</em></span>`;
    else if (nu) {
      const stops = nu.i - m.s.next;
      const art = nu.unlock.weapon ? `<span class="g-art gunr">${gunSvg(nu.unlock.weapon)}</span>` : nu.unlock.survivor ? `<span class="g-art face">${portraitSvg(nu.unlock.survivor)}</span>` : `<span class="g-art">${icon('heli')}</span>`;
      const name = nu.unlock.weapon ? WEAPONS[nu.unlock.weapon].name : nu.unlock.survivor ? SURVIVORS[nu.unlock.survivor].name : 'Evac';
      g = `${art}<span><small>NEXT REWARD</small><b>${esc(name)}</b><em>${stops === 0 ? 'Next stop!' : `${stops + 1} stops away · ${esc(nu.name)}`}</em></span>`;
    } else g = `<span><small>ROAD</small><b>${m.s.next}/${TOTAL_CHAPTERS}</b></span>`;
    this._set(this.el.goal, 'goal', g, true);
  }
}
