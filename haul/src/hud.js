// Long Haul: the HUD over the camp. Top left: where you are on the road. Top
// right: supplies and the gear. Bottom: everyone (the cards screen), the squad
// of three, and PLAY. Also the hand that points the way in the first session.

import { CAST, AREAS, FERRY_STARS } from './config.js';
import { standLabel } from './rules.js';
import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { face, tokenBar, esc, shortName, stars } from './ui.js';
import { centre } from './fx.js';

export class Hud {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { game, onAct }
    this.shown = null; // the supplies figure on screen (it counts up to the real one)
    this.roadShown = null; // how full the road bar is drawn, 0..1, while stars are still flying home
    root.innerHTML = `<div class="top"></div><div class="bottom"></div><div class="hand" hidden>${icon('hand')}<span></span></div>`;
    this.top = root.querySelector('.top');
    this.bottom = root.querySelector('.bottom');
    this.hand = root.querySelector('.hand');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) ctx.onAct(b.dataset.act, b.dataset, b);
    });
  }

  render() {
    const { game } = this.ctx;
    const s = game.s;
    const r = game.road();
    const area = AREAS[r.area];
    const goal = r.next ? r.next.name : s.ferry ? 'The ferry' : 'The ferry';
    const done = r.ferry && s.stars >= FERRY_STARS;
    this.top.innerHTML =
      `<button class="chip road" type="button" data-act="road" aria-label="The road">` +
      `<span class="road-ic">${icon('road')}</span>` +
      `<span class="road-txt"><b>${esc(area.name)}</b><span class="bar"><i style="width:${Math.round((this.roadShown ?? r.t) * 100)}%"></i></span></span>` +
      `<span class="road-stars">${icon('star')}<b>${done ? fmtNum(s.stars) : `${s.stars}/${r.to}`}</b></span>` +
      `<span class="road-next">${done ? 'Pier 9 · you made it' : `to ${esc(goal)}`}</span>` +
      `</button>` +
      `<span class="grow"></span>` +
      `<span class="chip wallet" id="wallet">${icon('supplies')}<b>${fmtNum(this.shown == null ? s.supplies : this.shown)}</b></span>` +
      `<button class="chip gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button>`;
    if (this.shown == null) this.shown = s.supplies;

    const ready = game.readyList();
    const benchReady = ready.filter((id) => !s.squad.includes(id)).length;
    const better = game.betterBench();
    const cards = s.squad
      .map((id) => {
        const info = game.levelInfo(id);
        const st = standLabel(game.standChance(id));
        // The one rule that decides a run, in a word: their power against the danger out there.
        return (
          `<button class="card r-${CAST[id].rarity}${info.ok ? ' can' : ''}" type="button" data-act="survivor" data-id="${id}">` +
          face(id, { level: info.level }) +
          `<span class="card-txt"><b class="nm">${shortName(id)}</b>` +
          `<span class="odds st-${st.id}">${icon('power')}<b>${info.power}</b><i>${st.name.toUpperCase()}</i></span>` +
          tokenBar(info, { compact: true }) +
          `</span>` +
          (info.ok ? `<span class="upbadge">${icon('up')}</span>` : '') +
          `</button>`
        );
      })
      .join('');
    this.bottom.innerHTML =
      `<button class="btn people" type="button" data-act="people">${icon('people')}<span>EVERYONE</span>${benchReady || better ? `<i class="dot">${benchReady || '!'}</i>` : ''}</button>` +
      `<div class="squad">${cards}</div>` +
      // PLAY says what is out there and how many are likely to come back standing.
      `<button class="btn play" type="button" data-act="play" aria-label="Play: danger ${Math.round(game.danger())} at ${esc(area.name)}"><span class="play-main">${icon('play')}PLAY</span><span class="play-sub">${icon('danger')}<b>${Math.round(game.danger())}</b>${stars(Math.round(game.expectedStars()))}</span></button>`;
  }

  /** Draw the road bar at `t` (0..1) until told otherwise; null goes back to the truth. */
  setRoad(t) {
    this.roadShown = t;
    const bar = this.root.querySelector('.chip.road .bar i');
    if (bar) bar.style.width = `${Math.round((t ?? this.ctx.game.road().t) * 100)}%`;
  }

  roadEl() {
    return this.root.querySelector('.chip.road');
  }

  walletEl() {
    return this.root.querySelector('#wallet');
  }

  cardEl(id) {
    return this.root.querySelector(`.card[data-id="${id}"]`);
  }

  playEl() {
    return this.root.querySelector('.btn.play');
  }

  peopleEl() {
    return this.root.querySelector('.btn.people');
  }

  /** Move the wallet's figure toward the real one (call as loot lands). */
  bump(to = this.ctx.game.s.supplies) {
    this.shown = to;
    const b = this.root.querySelector('#wallet b');
    if (b) b.textContent = fmtNum(to);
    const w = this.walletEl();
    if (w) {
      w.classList.remove('bump');
      void w.offsetWidth;
      w.classList.add('bump');
    }
  }

  /** Add `n` to the figure on screen, one landing at a time. */
  bumpBy(n) {
    this.bump(Math.min(this.ctx.game.s.supplies, (this.shown ?? 0) + n));
  }

  /** Snap the wallet to the truth (after spending). */
  sync() {
    this.shown = this.ctx.game.s.supplies;
    const b = this.root.querySelector('#wallet b');
    if (b) b.textContent = fmtNum(this.shown);
  }

  // --- The pointing hand ------------------------------------------------------------------------

  /** Point at an element, a rect or a { x, y } with a few words. `null` hides the hand. */
  point(target, text = '') {
    const p = centre(target);
    if (!p) {
      this.hand.hidden = true;
      return;
    }
    const r = target.getBoundingClientRect ? target.getBoundingClientRect() : { top: p.y, bottom: p.y, left: p.x, right: p.x, width: 0, height: 0 };
    const vw = window.innerWidth;
    const below = r.top < 120; // things at the top are pointed at from underneath
    this.hand.hidden = false;
    this.hand.classList.toggle('below', below);
    const x = Math.max(34, Math.min(vw - 34, p.x));
    this.hand.style.left = `${x}px`;
    this.hand.style.top = `${below ? r.bottom + 4 : r.top - 4}px`;
    const label = this.hand.querySelector('span');
    label.textContent = text;
    label.hidden = !text;
    // Keep the words on screen: lean them left or right of the hand near an edge.
    label.style.transform = '';
    const lw = label.offsetWidth;
    const over = Math.max(0, x + lw / 2 + 8 - vw) || Math.min(0, x - lw / 2 - 8);
    label.style.transform = `translateX(calc(-50% - ${over}px))`;
  }

  hideHand() {
    this.hand.hidden = true;
  }
}
