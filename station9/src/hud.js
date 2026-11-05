// The HUD, revealed piece by piece as Mae introduces things: beds, scrap, PLAY, the
// gate, the convoy and her own hint bar. Nothing shows before it means something.

import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { maeSvg } from './portrait.js';
import { esc } from './ui.js';

const TAG_ICON = { horde: 'horde', night: 'moon', toxic: 'biohazard' };

export class Hud {
  constructor(root, meta, onAct) {
    this.root = root;
    this.meta = meta;
    this.onAct = onAct;
    this.shown = { scrap: meta.s.scrap };
    this.holdUntil = {};
    this.cache = new Map();
    this._build();
  }

  _build() {
    this.root.innerHTML =
      `<div class="top">` +
      `<button class="ppl hud-x" data-hud="beds" type="button" data-act="people">${icon('people')}<span><b>0/0</b><small>BEDS</small></span></button>` +
      `<div class="curs"><div class="pill scrap hud-x" data-hud="scrap">${icon('scrap')}<b>0</b></div></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button></div>` +
      `<div class="side">` +
      `<button class="wr gatew hud-x" data-hud="gate" type="button" data-act="gate"><span class="ring"></span>${icon('gate')}<span class="rt"></span><span class="badge"></span></button>` +
      `<button class="wr convoy hud-x" data-hud="convoy" type="button" data-act="convoy"><span class="ring"></span>${icon('truck')}<span class="rt"></span><span class="badge">!</span></button></div>` +
      `<div class="bottom">` +
      `<button class="maeb hud-x" data-hud="hint" type="button" data-act="mae"><span class="mb-face">${maeSvg('smile')}</span><span class="mb-text"><small>MAE</small><b></b></span></button>` +
      `<button class="play hud-x" data-hud="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small></small><i class="risk"></i></button></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      beds: q('.ppl b'),
      scrap: q('.pill.scrap b'),
      gate: q('.wr.gatew'),
      convoy: q('.wr.convoy'),
      mae: q('.maeb'),
      maeText: q('.maeb .mb-text b'),
      play: q('.play'),
      playSub: q('.play small'),
      risk: q('.play .risk'),
    };
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.onAct(b.dataset.act, b.dataset, b);
    });
  }

  /** Show a HUD piece (with a little pop the first time). */
  reveal(key, animate = true) {
    const el = this.root.querySelector(`[data-hud="${key}"]`);
    if (!el || el.classList.contains('on')) return;
    el.classList.add('on');
    if (animate) {
      el.classList.add('pop');
      setTimeout(() => el.classList.remove('pop'), 700);
    }
  }

  hideAll() {
    for (const el of this.root.querySelectorAll('.hud-x')) el.classList.remove('on', 'pop');
  }

  revealAll(seen) {
    for (const key of ['beds', 'scrap', 'play', 'gate', 'convoy', 'hint']) if (seen[`hud:${key}`]) this.reveal(key, false);
  }

  target(k) {
    return this.root.querySelector(k === 'beds' ? '.ppl' : k === 'gate' ? '.wr.gatew' : '.pill.scrap');
  }

  hold(k, ms) {
    this.holdUntil[k] = performance.now() + ms;
  }

  freeze() {
    this.holdUntil.scrap = Infinity;
  }

  thaw() {
    if (this.holdUntil.scrap === Infinity) this.holdUntil.scrap = 0;
  }

  bump(k) {
    const t = this.target(k);
    if (!t) return;
    t.classList.remove('bump');
    void t.offsetWidth;
    t.classList.add('bump');
  }

  _set(el, key, v, html = false) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (html) el.innerHTML = v;
    else el.textContent = v;
  }

  animate(dt) {
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 7);
    const actual = this.meta.s.scrap;
    if ((this.holdUntil.scrap || 0) <= now && this.shown.scrap !== actual) {
      let v = this.shown.scrap + (actual - this.shown.scrap) * k;
      if (Math.abs(actual - v) < 0.6) v = actual;
      this.shown.scrap = v;
    }
    this._set(this.el.scrap, 'scrap', fmtNum(Math.round(this.shown.scrap)));
  }

  /** Mae's face on the hint bar. */
  maeFace(expr) {
    this._set(this.el.mae.querySelector('.mb-face'), 'maeFace', maeSvg(expr), true);
  }

  update() {
    const m = this.meta;
    this._set(this.el.beds, 'beds', `${m.s.people.length}/${m.beds()}`);
    this.el.beds.parentElement.parentElement.classList.toggle('full', m.freeBeds() <= 0);

    const g = m.gateInfo();
    const n = g.visitors.length;
    this.el.gate.classList.toggle('ready', n > 0);
    this.el.gate.style.setProperty('--p', String(n || g.nextIn === null ? 100 : Math.round((1 - g.nextIn / g.interval) * 100)));
    this._set(this.el.gate.querySelector('.rt'), 'gate', n > 0 ? `${n} WAITING` : g.nextIn === null ? 'CLOSED' : fmtTime(g.nextIn));
    this._set(this.el.gate.querySelector('.badge'), 'gateb', n > 0 ? String(n) : '');

    const c = m.convoyInfo();
    this.el.convoy.classList.toggle('ready', c.ready);
    this.el.convoy.style.setProperty('--p', String(Math.round(c.frac * 100)));
    this._set(this.el.convoy.querySelector('.rt'), 'convoy', c.ready ? 'HERE' : fmtTime(c.remaining));

    const run = m.nextRun();
    const o = m.oddsFor(run, m.bestCrew(run));
    this._set(this.el.playSub, 'psub', `${icon(TAG_ICON[run.tag])}${esc(run.name)}`, true);
    this.el.risk.className = `risk tone-${o.risk.tone}`;
    this._set(this.el.maeText, 'mae', m.advice().text);
  }
}
