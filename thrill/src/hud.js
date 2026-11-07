// The HUD: zone + Skull bar, coins, gems and the gear on top; along the bottom
// the Supply Crate, the squad's three faces, the next threat with the odds and
// PLAY, and the Ticket Vault. Plus the idle hand that points at the one thing
// worth doing next.

import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { portraitSvg } from './portrait.js';
import { chestSvg } from './chest-art.js';
import { threatIconSvg } from './art.js';
import { THREATS, CHESTS, CLASSES, THREAT_STREAK } from './config.js';
import { isCounter } from './raid.js';
import { esc } from './ui.js';

export class Hud {
  constructor(root, meta, onAct) {
    this.root = root;
    this.meta = meta;
    this.onAct = onAct;
    this.shown = { coins: meta.s.coins, gems: meta.s.gems, skulls: meta.s.skulls };
    this.hold = { coins: 0, gems: 0, skulls: 0 };
    this.cache = new Map();
    this.idle = 0;
    this.handOn = null;
    this._build();
  }

  _build() {
    this.root.innerHTML =
      `<div class="top">` +
      `<button class="zonechip" type="button" data-act="ladder" aria-label="Skull ladder"><span class="zn"></span><span class="zt"><b class="zname"></b><i class="skbar"><u></u></i></span><span class="sk">${icon('skull')}<b></b></span><span class="nx"></span></button>` +
      `<div class="wallet"><div class="pill coin" data-k="coins">${icon('coin')}<b>0</b></div><div class="pill gem" data-k="gems">${icon('gem')}<b>0</b></div></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button>` +
      `</div>` +
      `<div class="bottom">` +
      this._chestBtn('crate') +
      `<div class="squadbox"><button class="best" type="button" data-act="best">${icon('best')}<b>BEST</b></button>` +
      `<button class="squadbtn" type="button" data-act="crew" aria-label="Squad"><span class="faces"></span><span class="sqlbl"><b>SQUAD</b><em class="readyn"></em></span></button></div>` +
      `<div class="playbox"><div class="threatrow"></div><button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small class="odds"></small></button></div>` +
      this._chestBtn('vault') +
      `</div>` +
      `<div class="hand" aria-hidden="true"><i></i></div>` +
      `<div class="caption" aria-hidden="true"><span></span></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      zchip: q('.zonechip'),
      zn: q('.zonechip .zn'),
      zname: q('.zonechip .zname'),
      skbar: q('.skbar u'),
      sk: q('.zonechip .sk b'),
      nx: q('.zonechip .nx'),
      coins: q('.pill.coin b'),
      gems: q('.pill.gem b'),
      crate: q('.chestbtn.crate'),
      vault: q('.chestbtn.vault'),
      faces: q('.faces'),
      squad: q('.squadbtn'),
      readyn: q('.readyn'),
      best: q('.best'),
      threats: q('.threatrow'),
      play: q('.play'),
      odds: q('.play .odds'),
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

  _chestBtn(kind) {
    return (
      `<button class="chestbtn ${kind}" type="button" data-act="chest" data-k="${kind}" aria-label="${CHESTS[kind].name}">` +
      `<span class="cart"></span><span class="ctxt"><small>${CHESTS[kind].short}</small><b class="cst"></b></span><span class="clv"></span><span class="cgem"></span></button>`
    );
  }

  /** The element the fly-to animations should aim at. */
  target(k) {
    if (k === 'coins') return this.root.querySelector('.pill.coin');
    if (k === 'gems') return this.root.querySelector('.pill.gem');
    if (k === 'skulls') return this.el.zchip;
    if (k === 'crate' || k === 'vault') return this.el[k];
    if (k === 'play') return this.el.play;
    if (k === 'squad') return this.el.squad;
    if (k === 'best') return this.el.best;
    if (typeof k === 'number') return this.el.faces.querySelector(`[data-id="${k}"]`) || this.el.squad;
    return null;
  }

  /** Keep a counter where it is until released (while loot flies to it). */
  freeze(keys = ['coins', 'gems', 'skulls']) {
    for (const k of keys) this.hold[k] = Infinity;
  }

  thaw(keys = ['coins', 'gems', 'skulls']) {
    for (const k of keys) this.hold[k] = 0;
  }

  /** Let a frozen counter roll up by `amount` (as one flying coin lands). */
  nudge(k, amount) {
    this.shown[k] += amount;
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

  /** Re-read the state (call after any action). */
  update() {
    const m = this.meta;
    const s = m.s;
    // Ladder chip.
    const L = m.ladder();
    this._set(this.el.zn, 'zn', String(L.zone));
    this._set(this.el.zname, 'zname', L.name);
    const next = L.next3[0];
    const nxHtml = next ? (next.kind === 'gate' ? icon('zone') : next.kind === 'coins' ? icon('coin') : next.kind === 'gems' ? icon('gem') : icon('badge')) : '';
    this._set(this.el.nx, 'nx', nxHtml, true);
    this.ladder = L;
    // Chests.
    for (const k of ['crate', 'vault']) this._chest(k);
    // Squad faces.
    const squad = m.squadPeople();
    const threats = s.threats;
    const facesKey = squad.map((p) => `${p.id}:${p.level}:${m.isReady(p) ? 1 : 0}:${m.canLevel(p) ? 1 : 0}:${isCounter(p, threats) ? 1 : 0}:${p.rarity}:${p.golden}`).join('|') + `|${squad.length}`;
    if (this.cache.get('faces') !== facesKey) {
      this.cache.set('faces', facesKey);
      let html = '';
      for (const p of squad) {
        const ready = m.isReady(p);
        html +=
          `<span class="face r-${p.rarity}${p.golden ? ' golden' : ''}${ready ? ' ready' : ''}${m.canLevel(p) ? ' can' : ''}" data-act="face" data-id="${p.id}" style="--cls:${CLASSES[p.cls].color}">` +
          portraitSvg(p, { crop: 'face' }) +
          `<i class="lv">${p.level}</i>${isCounter(p, threats) ? '<i class="ctr">×1.5</i>' : ''}${ready ? `<i class="rdy">${icon('up')}</i>` : ''}</span>`;
      }
      for (let i = squad.length; i < 3; i++) html += `<span class="face empty">+</span>`;
      this.el.faces.innerHTML = html;
    }
    const readyN = s.people.filter((p) => m.isReady(p)).length;
    this._set(this.el.readyn, 'readyn', readyN ? `READY ${readyN}` : '');
    this.el.squad.classList.toggle('has-ready', readyN > 0);
    const best = m.bestGain();
    this.el.best.classList.toggle('show', best.better);
    // Threats + odds.
    const pre = m.raidPreview();
    const left = Math.max(1, s.threatLeft || 1);
    const tKey = threats.join('+') + (pre.rally ? '!' : '') + left;
    if (this.cache.get('threats') !== tKey) {
      this.cache.set('threats', tKey);
      // Pips: how many more raids these threats stay.
      const pips = s.raids > 0 ? `<span class="streak" title="Raids left against these">${Array.from({ length: THREAT_STREAK }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</span>` : '';
      this.el.threats.innerHTML =
        (pre.rally ? `<span class="rally">RALLY!</span>` : '') +
        threats.map((t) => `<span class="chip t-${t}">${threatIconSvg(t)}<b>${THREATS[t].name}</b></span>`).join('') +
        pips;
    }
    const oddsHtml = crownPips(pre.odds) + `<span>${pre.label.name}</span>`;
    this._set(this.el.odds, 'odds', oddsHtml, true);
    this.el.play.dataset.odds = pre.label.id;
  }

  _chest(kind) {
    const m = this.meta;
    const st = m.chestState(kind);
    const el = this.el[kind];
    const key = `${kind}:${st.ready}:${st.level}`;
    if (this.cache.get(key + 'art') !== key) {
      this.cache.set(key + 'art', key);
      el.querySelector('.cart').innerHTML = chestSvg(kind, { grade: 0, open: false, glow: st.ready ? 0.6 : 0 });
      el.querySelector('.clv').textContent = `Lv ${st.level}`;
    }
    el.classList.toggle('ready', st.ready);
    const gem = el.querySelector('.cgem');
    const showGem = !st.ready && m.s.gems >= st.cost;
    if (gem.dataset.v !== String(showGem ? st.cost : '')) {
      gem.dataset.v = String(showGem ? st.cost : '');
      gem.innerHTML = showGem ? `${icon('gem')}${st.cost}` : '';
    }
    const cst = el.querySelector('.cst');
    if (st.ready) {
      if (cst.dataset.state !== 'open') {
        cst.dataset.state = 'open';
        cst.textContent = 'OPEN!';
        cst.removeAttribute('data-end');
      }
    } else {
      if (cst.dataset.state !== 'wait') cst.dataset.state = 'wait';
      const t = fmtTime(st.msLeft / 1000);
      if (cst.textContent !== t) cst.textContent = t;
    }
  }

  /** Per frame: counters roll toward the real numbers, chest timers tick, the idle hand. */
  animate(dt, canHint) {
    const s = this.meta.s;
    const now = performance.now();
    const k = Math.min(1, (dt / 1000) * 8);
    for (const key of ['coins', 'gems', 'skulls']) {
      if ((this.hold[key] || 0) > now) continue;
      let v = this.shown[key];
      const actual = s[key];
      if (v === actual) continue;
      v += (actual - v) * k;
      if (Math.abs(actual - v) < 0.6) v = actual;
      this.shown[key] = v;
    }
    this._set(this.el.coins, 'coins', fmtNum(Math.round(this.shown.coins)));
    this._set(this.el.gems, 'gems', fmtNum(Math.round(this.shown.gems)));
    this._set(this.el.sk, 'sk', fmtNum(Math.round(this.shown.skulls)));
    const L = this.ladder;
    if (L) {
      const f = Math.max(0, Math.min(1, (this.shown.skulls - L.floor) / Math.max(1, (L.nextGate ?? L.barTo) - L.floor)));
      const fs = f.toFixed(3);
      if (this.cache.get('skbar') !== fs) {
        this.cache.set('skbar', fs);
        this.el.skbar.style.transform = `scaleX(${fs})`;
      }
    }
    this._tickT = (this._tickT || 0) + dt;
    if (this._tickT > 250) {
      this._tickT = 0;
      for (const kind of ['crate', 'vault']) this._chest(kind);
    }
    this.idle += dt;
    if (canHint && this.idle > (this.hintDelay || 4000) && !this.handOn) this.onAct('hint', {}, null);
    if (!canHint && this.handOn) this.hideHand();
  }

  /** Point the hand at an element (a rect in viewport pixels). */
  pointAt(el, label = '') {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    this.handOn = el;
    const h = this.el.hand;
    const below = r.top < innerHeight * 0.45;
    h.classList.toggle('up', below);
    h.style.left = `${r.left + r.width / 2}px`;
    h.style.top = `${below ? r.bottom - 4 : r.top + 4}px`;
    h.classList.add('show');
    if (label) this.caption(label, r);
  }

  hideHand() {
    this.handOn = null;
    this.el.hand.classList.remove('show');
    this.el.caption.classList.remove('show');
  }

  /** A short line next to the hand. */
  caption(text, r) {
    const c = this.el.caption;
    this.el.captionText.innerHTML = text;
    c.classList.add('show');
    const w = Math.min(260, innerWidth - 24);
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const above = r.top > innerHeight * 0.45;
    c.style.left = `${left}px`;
    c.style.width = `${w}px`;
    // Clear the hand (about 46px) and whatever sits just above the target.
    const h = c.offsetHeight || 40;
    c.style.top = above ? `${Math.max(4, r.top - 58 - h)}px` : `${r.bottom + 50}px`;
  }

  setPlayLabel(text) {
    this.el.play.querySelector('.pl b').textContent = text;
  }
}

/** Three crowns, each filled by the chance of getting at least that many. */
export function crownPips(odds) {
  return `<span class="pips">${[1, 2, 3].map((k) => `<i style="--f:${odds.atLeast[k].toFixed(2)}"><span class="g">${icon('crown')}</span><span class="c">${icon('crown')}</span></i>`).join('')}</span>`;
}

export { esc };
