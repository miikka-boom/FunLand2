// The HUD floats over the map. Top left: coins. Top right: the gear (testing
// tools). Bottom left: BUILD. Bottom right: who goes out tonight (tap to pick
// someone else) and PLAY with tonight's night and odds. Plus the hand that
// points at the next thing to do in the first nights, and an edge pointer when
// that thing is off-screen.

import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { portraitSvg } from './portrait.js';
import { townIcon } from './art.js';
import { CLASSES } from './config.js';

export class Hud {
  constructor(root, town, onAct) {
    this.root = root;
    this.town = town;
    this.onAct = onAct;
    this.shown = { coins: town.s.coins };
    this.hold = { coins: 0 };
    this.cache = new Map();
    this.idle = 0;
    this.handOn = null;
    this._build();
  }

  _build() {
    this.root.innerHTML =
      `<div class="top">` +
      `<div class="pill coin" data-k="coins">${icon('coin')}<b>0</b></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button>` +
      `</div>` +
      `<div class="bottom">` +
      `<button class="buildbtn" type="button" data-act="build" aria-label="Build">${townIcon('build')}<b>BUILD</b></button>` +
      `<div class="gobox">` +
      `<button class="who" type="button" data-act="people" aria-label="Who goes out tonight"></button>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small class="odds"></small></button>` +
      `</div>` +
      `</div>` +
      `<button class="homebtn" type="button" data-act="home" aria-label="Back to the station">${townIcon('focus')}</button>` +
      `<div class="edgeptr" aria-hidden="true"><i>${icon('arrowRight')}</i></div>` +
      `<div class="hand" aria-hidden="true"><i></i></div>` +
      `<div class="caption" aria-hidden="true"><span></span></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      coins: q('.pill.coin b'),
      coinPill: q('.pill.coin'),
      build: q('.buildbtn'),
      who: q('.who'),
      play: q('.play'),
      odds: q('.play .odds'),
      home: q('.homebtn'),
      edge: q('.edgeptr'),
      hand: q('.hand'),
      caption: q('.caption'),
      captionText: q('.caption span'),
    };
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      this.poke();
      if (b && !b.disabled) this.onAct(b.dataset.act, b.dataset, b);
    });
  }

  /** The element the fly-to animations should aim at. */
  target(k) {
    if (k === 'coins') return this.el.coinPill;
    if (k === 'play') return this.el.play;
    if (k === 'who') return this.el.who;
    if (k === 'build') return this.el.build;
    return null;
  }

  freeze() {
    this.hold.coins = Infinity;
  }

  thaw() {
    this.hold.coins = 0;
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
    this.hideHand();
  }

  _set(el, key, v, html = false) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (html) el.innerHTML = v;
    else el.textContent = v;
  }

  /** Placing or lifting: only the coin pill stays. Building: BUILD lights up. */
  setMode(mode) {
    this.root.dataset.mode = mode || '';
  }

  update() {
    const m = this.town;
    const s = m.s;
    const p = m.picked();
    if (p) {
      const key = `${p.id}:${p.level}:${p.rarity}`;
      if (this.cache.get('who') !== key) {
        this.cache.set('who', key);
        this.el.who.className = `who r-${p.rarity}`;
        this.el.who.style.setProperty('--cls', CLASSES[p.cls].color);
        this.el.who.innerHTML = `${portraitSvg(p, { crop: 'face' })}<i class="lv">${p.level}</i>${s.people.length > 1 ? `<i class="sw">${icon('swap')}</i>` : ''}`;
      }
    }
    const label = m.label(p);
    this._set(this.el.odds, 'odds', `NIGHT ${s.night} · <span>${s.runs === 0 ? 'Easy' : label.name}</span>`, true);
    this.el.play.dataset.odds = s.runs === 0 ? 'easy' : label.id;
  }

  /** Per frame: the coin counter rolls toward the real number; the idle hand. */
  animate(dt, canHint) {
    const s = this.town.s;
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 8);
    if ((this.hold.coins || 0) <= now && this.shown.coins !== s.coins) {
      let v = this.shown.coins + (s.coins - this.shown.coins) * k;
      if (Math.abs(s.coins - v) < 0.6) v = s.coins;
      this.shown.coins = v;
    }
    this._set(this.el.coins, 'coins', fmtNum(Math.round(this.shown.coins)));
    this.idle += dt;
    if (this.handOn && !this.handOn.isConnected) this.poke(); // its target went away
    if (canHint && this.idle > (this.hintDelay || 4000) && !this.handOn) this.onAct('hint', {}, null);
    if (!canHint && this.handOn) this.hideHand();
    if (this.handOn && this.handFollow) this._placeHand(this.handOn);
  }

  /** Point the hand at an element, with an optional caption. */
  pointAt(el, label = '', follow = false) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    this.handOn = el;
    this.handFollow = follow;
    this._placeHand(el);
    this.el.hand.classList.add('show');
    if (label) this.caption(label, r);
  }

  _placeHand(el) {
    const r = el.getBoundingClientRect();
    const h = this.el.hand;
    const below = r.top < innerHeight * 0.45;
    h.classList.toggle('up', below);
    h.style.left = `${r.left + r.width / 2}px`;
    const inside = el === this.el.play ? r.height * 0.55 : 4;
    h.style.top = `${below ? r.bottom - 4 : r.top + inside}px`;
  }

  hideHand() {
    this.handOn = null;
    this.el.hand.classList.remove('show');
    this.el.caption.classList.remove('show');
  }

  /** The pointer at the screen edge when the hint's target is off-screen (screen point or null). */
  edgeAt(pt) {
    const e = this.el.edge;
    if (!pt) {
      e.classList.remove('show');
      return;
    }
    const W = innerWidth;
    const H = innerHeight;
    const cx = W / 2;
    const cy = H / 2;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const k = Math.min((W / 2 - 34) / Math.max(1, Math.abs(dx)), (H / 2 - 64) / Math.max(1, Math.abs(dy)));
    e.style.transform = `translate(${(cx + dx * k).toFixed(0)}px, ${(cy + dy * k).toFixed(0)}px) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    e.classList.add('show');
  }

  showHome(on) {
    this.el.home.classList.toggle('show', !!on);
  }

  caption(text, r) {
    const c = this.el.caption;
    this.el.captionText.innerHTML = text;
    c.classList.add('show');
    const w = Math.min(260, innerWidth - 24);
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const above = r.top > innerHeight * 0.45;
    c.style.left = `${left}px`;
    c.style.width = `${w}px`;
    const h = c.offsetHeight || 40;
    c.style.top = above ? `${Math.max(4, r.top - 58 - h)}px` : `${r.bottom + 50}px`;
  }
}
