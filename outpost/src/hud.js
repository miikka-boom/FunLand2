// The HUD floats over the map. Top: the town's flag and name (rename), the
// zone with its Skull bar (the ladder), coins, gems and the gear. Bottom row:
// the Supply Crate, BUILD, the squad's three faces with the threat and PLAY,
// CREW, and the Bank Vault. Plus the idle hand that points at the one thing
// worth doing next, and the edge pointer when that thing is off-screen.

import { icon } from './icons.js';
import { fmtNum, fmtTime } from './format.js';
import { portraitSvg } from './portrait.js';
import { chestSvg } from './chest-art.js';
import { threatIconSvg } from './thrill-art.js';
import { townIcon } from './art.js';
import { THREATS, CHESTS, CLASSES, THREAT_STREAK } from './config.js';
import { isCounter } from './raid.js';
import { crownPips } from './kit.js';
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
      `<button class="townchip" type="button" data-act="rename" aria-label="Your town"><span class="tflag"><i></i></span><b class="tname"></b></button>` +
      `<button class="zonechip" type="button" data-act="ladder" aria-label="Skull ladder"><span class="zn"></span><span class="zt"><b class="zname"></b><i class="skbar"><u></u></i></span><span class="sk">${icon('skull')}<b></b></span><span class="nx"></span></button>` +
      `<div class="wallet"><div class="pill coin" data-k="coins">${icon('coin')}<b>0</b></div><div class="pill gem" data-k="gems">${icon('gem')}<b>0</b></div></div>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button>` +
      `</div>` +
      `<div class="bottom">` +
      this._chestBtn('crate') +
      `<button class="buildbtn" type="button" data-act="build" aria-label="Build">${townIcon('build')}<b>BUILD</b><i class="dot"></i></button>` +
      `<div class="squadbox"><button class="best" type="button" data-act="best">${icon('best')}<b>BEST</b></button>` +
      `<span class="faces"></span>` +
      `<div class="playbox"><div class="threatrow"></div><button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>PLAY</b></span><small class="odds"></small></button></div></div>` +
      `<button class="crewbtn" type="button" data-act="crew" aria-label="Crew">${icon('people')}<b>CREW</b><em class="readyn"></em></button>` +
      this._chestBtn('vault') +
      `</div>` +
      `<button class="homebtn" type="button" data-act="home" aria-label="Back to the station">${townIcon('focus')}</button>` +
      `<div class="edgeptr" aria-hidden="true"><i>${icon('arrowRight')}</i></div>` +
      `<div class="boxdrop" aria-hidden="true">${townIcon('box')}<b>Box it</b></div>` +
      `<div class="undo"><button type="button" data-act="undo">${townIcon('undo')}<b>Undo</b></button></div>` +
      `<div class="hand" aria-hidden="true"><i></i></div>` +
      `<div class="caption" aria-hidden="true"><span></span></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      town: q('.townchip'),
      tname: q('.tname'),
      tflag: q('.tflag i'),
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
      build: q('.buildbtn'),
      faces: q('.faces'),
      crew: q('.crewbtn'),
      readyn: q('.readyn'),
      best: q('.best'),
      threats: q('.threatrow'),
      play: q('.play'),
      odds: q('.play .odds'),
      home: q('.homebtn'),
      edge: q('.edgeptr'),
      box: q('.boxdrop'),
      undo: q('.undo'),
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
    if (k === 'squad' || k === 'crew') return this.el.crew;
    if (k === 'best') return this.el.best;
    if (k === 'build') return this.el.build;
    if (k === 'town') return this.el.town;
    if (typeof k === 'number') return this.el.faces.querySelector(`[data-id="${k}"]`) || this.el.crew;
    return null;
  }

  freeze(keys = ['coins', 'gems', 'skulls']) {
    for (const k of keys) this.hold[k] = Infinity;
  }

  thaw(keys = ['coins', 'gems', 'skulls']) {
    for (const k of keys) this.hold[k] = 0;
  }

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

  /** Placing, painting or lifting: only the coin pill stays. */
  setMode(mode) {
    this.root.dataset.mode = mode || '';
  }

  showBox(on) {
    this.el.box.classList.toggle('show', !!on);
  }

  showUndo(on) {
    this.el.undo.classList.toggle('show', !!on);
  }

  update() {
    const m = this.meta;
    const s = m.s;
    // Town.
    this._set(this.el.tname, 'tname', s.town.name);
    if (this.cache.get('tcol') !== s.town.color) {
      this.cache.set('tcol', s.town.color);
      this.el.tflag.style.background = s.town.color;
    }
    // Ladder chip.
    const L = m.ladder();
    this._set(this.el.zn, 'zn', String(L.zone));
    this._set(this.el.zname, 'zname', L.name);
    const next = L.next3[0];
    const nxHtml = next ? (next.kind === 'gate' ? icon('zone') : next.kind === 'coins' ? icon('coin') : next.kind === 'gems' ? icon('gem') : next.kind === 'decor' ? townIcon('set') : icon('badge')) : '';
    this._set(this.el.nx, 'nx', nxHtml, true);
    this.ladder = L;
    for (const k of ['crate', 'vault']) this._chest(k);
    // BUILD: a dot when something waits (a kit, the box, a camper).
    if ((s.seen.boxSeen || 0) > s.box.length) s.seen.boxSeen = s.box.length; // things left the box
    const waits = s.kits.length > 0 || m.campers().length > 0 || s.box.length > (s.seen.boxSeen || 0);
    this.el.build.classList.toggle('has', waits);
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
          `<button type="button" class="face r-${p.rarity}${p.golden ? ' golden' : ''}${ready ? ' ready' : ''}${m.canLevel(p) ? ' can' : ''}" data-act="face" data-id="${p.id}" style="--cls:${CLASSES[p.cls].color}">` +
          portraitSvg(p, { crop: 'face' }) +
          `<i class="lv">${p.level}</i>${isCounter(p, threats) ? '<i class="ctr">×1.5</i>' : ''}${ready ? `<i class="rdy">${icon('up')}</i>` : ''}</button>`;
      }
      for (let i = squad.length; i < 3; i++) html += `<button type="button" class="face empty" data-act="crew">+</button>`;
      this.el.faces.innerHTML = html;
    }
    const readyN = s.people.filter((p) => m.isReady(p)).length;
    this._set(this.el.readyn, 'readyn', readyN ? `READY ${readyN}` : '');
    this.el.crew.classList.toggle('has-ready', readyN > 0);
    this.el.best.classList.toggle('show', m.bestGain().better);
    // Threats + odds.
    const pre = m.raidPreview();
    const left = Math.max(1, s.threatLeft || 1);
    const tKey = threats.join('+') + (pre.rally ? '!' : '') + left;
    if (this.cache.get('threats') !== tKey) {
      this.cache.set('threats', tKey);
      const pips = s.raids > 0 ? `<span class="streak" title="Raids left against these">${Array.from({ length: THREAT_STREAK }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')}</span>` : '';
      this.el.threats.classList.toggle('tight', threats.length > 1 || pre.rally);
      this.el.threats.innerHTML = (pre.rally ? `<span class="rally">RALLY!</span>` : '') + threats.map((t) => `<span class="chip t-${t}">${threatIconSvg(t)}<b>${THREATS[t].name}</b></span>`).join('') + pips;
    }
    this._set(this.el.odds, 'odds', crownPips(pre.odds) + `<span>${pre.label.name}</span>`, true);
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
    if (this.handOn && !this.handOn.isConnected) this.poke(); // its target went away (a popped pile, re-drawn faces)
    if (canHint && this.idle > (this.hintDelay || 4000) && !this.handOn) this.onAct('hint', {}, null);
    if (!canHint && this.handOn) this.hideHand();
    if (this.handOn && this.handFollow) this._placeHand(this.handOn);
  }

  /** Point the hand at an element (a rect in viewport pixels). */
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

  /** The next-step pointer at the screen edge when its target is off-screen (screen point or null). */
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
    const x = cx + dx * k;
    const y = cy + dy * k;
    e.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
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

  setPlayLabel(text) {
    this.el.play.querySelector('.pl b').textContent = text;
  }
}

export { esc, crownPips };
