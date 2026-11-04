// Street HUD: day, people and beds, scrap and gems on top; the gate and the convoy
// on the left; PEOPLE, BUILD, the next goal and PLAY along the bottom; a coach
// bubble that points at the one thing worth doing next.

import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { buildingSvg } from './art.js';
import { esc } from './ui.js';

export class Hud {
  constructor(root, meta, onAct) {
    this.root = root;
    this.meta = meta;
    this.onAct = onAct;
    this.shown = { scrap: meta.s.scrap, gems: meta.s.gems };
    this.holdUntil = {};
    this.cache = new Map();
    this.idle = 0;
    this._build();
  }

  _build() {
    this.root.innerHTML =
      `<div class="top">` +
      `<div class="day"><small>DAY</small><b>1</b></div>` +
      `<button class="ppl" type="button" data-act="people">${icon('bed')}<span><b>0/0</b><small>BEDS</small></span></button>` +
      `<div class="curs"><div class="pill scrap" data-k="scrap">${icon('scrap')}<b>0</b></div><div class="pill gem" data-k="gems">${icon('gems')}<b>0</b></div></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button></div>` +
      `<div class="side">` +
      `<button class="wr gatew" type="button" data-act="gate"><span class="ring"></span>${icon('gate')}<span class="rt"></span><span class="badge"></span></button>` +
      `<button class="wr convoy" type="button" data-act="convoy"><span class="ring"></span>${icon('truck')}<span class="rt"></span><span class="badge">!</span></button></div>` +
      `<div class="bottom">` +
      `<div class="lb"><button class="pplb" type="button" data-act="people">${icon('people')}<b>PEOPLE</b><span class="badge"></span></button>` +
      `<button class="bldb" type="button" data-act="build">${icon('hammer')}<b>BUILD</b><span class="badge"></span></button></div>` +
      `<button class="goal" type="button" data-act="goal"></button>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small></small><i class="risk"></i></button></div>` +
      `<div class="coach" aria-hidden="true"><span></span></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      day: q('.day b'),
      beds: q('.ppl b'),
      scrap: q('.pill.scrap b'),
      gem: q('.pill.gem b'),
      gate: q('.wr.gatew'),
      convoy: q('.wr.convoy'),
      people: q('.pplb'),
      peopleBadge: q('.pplb .badge'),
      build: q('.bldb'),
      buildBadge: q('.bldb .badge'),
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
    return this.root.querySelector(k === 'gems' ? '.pill.gem' : k === 'beds' ? '.ppl' : k === 'gate' ? '.wr.gatew' : '.pill.scrap');
  }

  hold(k, ms) {
    this.holdUntil[k] = performance.now() + ms;
  }

  freeze() {
    for (const k of ['scrap', 'gems']) this.holdUntil[k] = Infinity;
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
    const actual = { scrap: this.meta.s.scrap, gems: this.meta.s.gems };
    for (const key of Object.keys(actual)) {
      if ((this.holdUntil[key] || 0) > now) continue;
      let v = this.shown[key];
      if (v === actual[key]) continue;
      v += (actual[key] - v) * k;
      if (Math.abs(actual[key] - v) < 0.6) v = actual[key];
      this.shown[key] = v;
    }
    this._set(this.el.scrap, 'scrap', fmtNum(Math.round(this.shown.scrap)));
    this._set(this.el.gem, 'gem', fmtNum(Math.round(this.shown.gems)));
    this.idle += dt;
    const show = canCoach && this.idle > 2600;
    if (show !== this.el.coach.classList.contains('show')) {
      this.el.coach.classList.toggle('show', show);
      if (show) this._placeCoach();
    }
  }

  _placeCoach(a = this.meta.advice()) {
    this._coachKey = `${a.kind}:${a.text}`;
    const target = a.kind === 'build' ? this.el.build : a.kind === 'gate' ? this.el.gate : this.el.play;
    const r = target.getBoundingClientRect();
    this._set(this.el.coachText, 'coach', esc(a.text), true);
    const c = this.el.coach;
    const w = Math.min(250, innerWidth - 24);
    c.style.width = `${w}px`;
    const side = a.kind === 'gate';
    c.classList.toggle('side', side);
    if (side) {
      c.style.left = `${r.right + 12}px`;
      c.style.top = `${r.y + r.height / 2}px`;
    } else {
      const x = Math.max(12, Math.min(innerWidth - w - 12, r.x + r.width / 2 - w / 2));
      c.style.left = `${x}px`;
      c.style.top = `${r.y - 12}px`;
      c.style.setProperty('--ax', `${r.x + r.width / 2 - x}px`);
    }
    target.classList.add('nudge');
    clearTimeout(this._nudgeT);
    this._nudgeT = setTimeout(() => target.classList.remove('nudge'), 1600);
  }

  update() {
    const m = this.meta;
    // A visible coach follows the advice as it changes (a visitor arrives, scrap comes in).
    if (this.el.coach.classList.contains('show')) {
      const a = m.advice();
      if (`${a.kind}:${a.text}` !== this._coachKey) this._placeCoach(a);
    }
    this._set(this.el.day, 'day', String(m.s.day));
    this._set(this.el.beds, 'beds', `${m.s.people.length}/${m.beds()}`);
    this.el.beds.parentElement.parentElement.classList.toggle('full', m.freeBeds() <= 0);

    // The gate: visitors waiting, or the countdown to the next one.
    const g = m.gateInfo();
    const n = g.visitors.length;
    this.el.gate.classList.toggle('ready', n > 0);
    this.el.gate.style.setProperty('--p', String(g.full || g.nextIn === null ? 100 : Math.round((1 - g.nextIn / g.interval) * 100)));
    this._set(this.el.gate.querySelector('.rt'), 'gate', n > 0 ? `${n} WAITING` : fmtTime(g.nextIn || 0));
    this._set(this.el.gate.querySelector('.badge'), 'gateb', n > 0 ? String(n) : '');

    const c = m.convoyInfo();
    this.el.convoy.classList.toggle('ready', c.ready);
    this.el.convoy.style.setProperty('--p', String(Math.round(c.frac * 100)));
    this._set(this.el.convoy.querySelector('.rt'), 'convoy', c.ready ? 'OPEN' : fmtTime(c.remaining));

    const hurt = m.s.people.filter((p) => p.injured > 0).length;
    this._set(this.el.peopleBadge, 'pb', hurt ? `${hurt}` : '');
    this.el.people.classList.toggle('hurt', hurt > 0);
    const nb = m.affordable().length;
    this._set(this.el.buildBadge, 'bb', nb ? String(nb) : '');
    this.el.build.classList.toggle('has', nb > 0);

    // PLAY: the next story run, or a scavenge once the street is safe.
    const story = m.storyRun();
    const run = story || m.run('scav1');
    const o = m.bestOdds(run);
    this._set(this.el.playSub, 'psub', story ? story.name : 'Scavenge');
    this.el.risk.className = `risk tone-${o.risk.tone}`;

    const goal = m.goal();
    let html;
    if (goal.done) html = `<span class="g-art">${icon('trophy')}</span><span><small>HOPE STREET</small><b>Safe. For now.</b><em>Scavenge, train, max it out</em></span>`;
    else {
      const b = goal.building;
      const what = b.final ? 'Seals the street' : `Unlocks the ${b.facility}`;
      html = `<span class="g-art bld-mini">${buildingSvg(b.id, 1)}</span><span><small>${b.final ? 'LAST STAND' : 'RECLAIM'} · ${goal.step + 1}/3</small><b>${esc(b.name)}</b><em>${what}</em></span>`;
    }
    this._set(this.el.goal, 'goal', html, true);
  }
}
