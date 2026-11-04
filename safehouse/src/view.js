// The one screen: a top bar with Scrap, the building (four rooms) and the
// next-mission card with PLAY and a one-line hint. Re-rendered at 10 Hz,
// touching the DOM only when something changed.

import { STATIONS, ITEMS, SURVIVORS, CHAPTERS, CRATE_MAX } from './config.js';
import { chanceLabel } from './mission-sim.js';
import { roomArt, BUNK_SLOTS } from './art.js';
import { portrait, PORTRAIT_COLORS } from './portraits.js';
import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { esc, tickLive } from './ui.js';

/** Rooms by floor: the top floor first. */
const ROOMS = ['radio', 'barracks', 'workshop', 'infirmary'];

/** Art has 5 tiers; three levels show 1, 3 and 5 so every upgrade looks different. */
const ART_LEVEL = [0, 1, 3, 5];

const KIND = { workshop: 'throw', infirmary: 'heal' };

/** A survivor face drawn inside the room art, so it scales with it. */
function faceInSvg(id, x, y, r, dashed = false) {
  const svg = portrait(id);
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  return (
    `<svg x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 64 64" overflow="visible">` +
    `<circle cx="32" cy="32" r="33" fill="#15110d"/><g clip-path="url(#sh-face-clip)">${inner}</g>` +
    `<circle cx="32" cy="32" r="31" fill="none" stroke="${PORTRAIT_COLORS[id] || '#ffcf7a'}" stroke-width="4"${dashed ? ' stroke-dasharray="7 5"' : ''}/></svg>`
  );
}

export const faceHtml = (id, cls = '') => `<span class="face ${cls}">${portrait(id)}</span>`;

export class View {
  constructor({ top, house, side }, sh, onAct) {
    this.top = top;
    this.house = house;
    this.side = side;
    this.sh = sh;
    this.onAct = onAct;
    this.cache = new Map();
    this.shown = Math.floor(sh.s.scrap);
    this.holdUntil = 0;
    this._build();
  }

  _build() {
    this.top.innerHTML =
      `<span class="brand">${icon('shield')}<b>SAFEHOUSE</b></span>` +
      `<button class="scrap" type="button" data-act="scrapInfo">${icon('scrap')}<b>0</b><small>Scrap</small></button>` +
      `<button class="gear" type="button" data-act="dev" aria-label="Testing tools">${icon('gear')}</button>`;
    const room = (id) =>
      `<button class="room" type="button" data-id="${id}" style="grid-area:${id}" aria-label="${esc(STATIONS[id].name)}">` +
      `<span class="art"></span>` +
      `<span class="tag"><span class="nm">${esc(STATIONS[id].name.toUpperCase())}</span><span class="pips"><i></i><i></i><i></i></span></span>` +
      `<span class="status"><span class="st"></span><span class="bar"><i></i></span></span>` +
      `<span class="up">${icon('up')}</span></button>`;
    this.house.innerHTML = `<div class="building"><div class="roofline"><span class="antenna"></span></div><div class="rooms">${ROOMS.map(room).join('')}</div><div class="street"></div></div>`;
    this.side.innerHTML = `<button class="hint" type="button" data-act="hint"></button><div class="card"></div>`;
    this.el = {
      scrap: this.top.querySelector('.scrap b'),
      scrapBtn: this.top.querySelector('.scrap'),
      card: this.side.querySelector('.card'),
      hint: this.side.querySelector('.hint'),
      rooms: {},
    };
    for (const id of ROOMS) {
      const el = this.house.querySelector(`.room[data-id="${id}"]`);
      this.el.rooms[id] = { el, art: el.querySelector('.art'), st: el.querySelector('.st'), bar: el.querySelector('.bar'), pips: [...el.querySelectorAll('.pips i')] };
    }
    const click = (e) => {
      const r = e.target.closest('.room');
      if (r) {
        this.onAct('open', { id: r.dataset.id }, r);
        return;
      }
      const el = e.target.closest('[data-act]');
      if (el) this.onAct(el.dataset.act, el.dataset, el);
    };
    for (const root of [this.top, this.house, this.side]) root.addEventListener('click', click);
  }

  _set(el, key, html) {
    if (this.cache.get(key) !== html) {
      this.cache.set(key, html);
      el.innerHTML = html;
    }
  }

  rectOf(id) {
    if (id === 'scrap') return this.el.scrapBtn.getBoundingClientRect();
    const r = this.el.rooms[id];
    return r ? r.el.getBoundingClientRect() : null;
  }

  /** Bring a room into view and flash it. */
  focus(id) {
    const r = id === 'play' ? { el: this.side.querySelector('.play') } : this.el.rooms[id];
    if (!r || !r.el) return;
    r.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    r.el.classList.remove('flash');
    void r.el.offsetWidth;
    r.el.classList.add('flash');
  }

  /** Let the Scrap counter wait for flying loot, then count up. */
  hold(ms) {
    this.holdUntil = performance.now() + ms;
  }

  bump() {
    const b = this.el.scrapBtn;
    b.classList.remove('bump');
    void b.offsetWidth;
    b.classList.add('bump');
  }

  animate(dt) {
    const actual = Math.floor(this.sh.s.scrap);
    if (performance.now() >= this.holdUntil && this.shown !== actual) {
      this.shown += (actual - this.shown) * Math.min(1, (dt / 1000) * 7);
      if (Math.abs(actual - this.shown) < 0.6) this.shown = actual;
    }
    this._set(this.el.scrap, 'scrap', fmtNum(Math.round(this.shown)));
  }

  _room(id) {
    const sh = this.sh;
    const r = this.el.rooms[id];
    const lvl = sh.level(id);
    const b = sh.s.build && sh.s.build.id === id ? sh.s.build : null;
    const craft = sh.s.crafts[id] || null;
    const timer = (end) => `<b data-end="${end}"></b>`;

    // Art: the room at its level, survivors on their bunks.
    const opts = { level: id === 'barracks' ? sh.bunks() : ART_LEVEL[lvl], active: !!craft, alert: id === 'radio' && sh.hint().focus === 'radio' };
    let faces = '';
    if (id === 'barracks') {
      sh.home().forEach((sid, i) => (faces += faceInSvg(sid, BUNK_SLOTS[i][0], BUNK_SLOTS[i][1], 16)));
      sh.waiting().forEach((sid, i) => (faces += faceInSvg(sid, 26 + i * 30, 88, 13, true)));
    }
    const artKey = `${JSON.stringify(opts)}|${faces.length}|${sh.home().join()}|${sh.waiting().join()}`;
    if (this.cache.get(`art:${id}`) !== artKey) {
      this.cache.set(`art:${id}`, artKey);
      let svg = roomArt(id, opts);
      if (faces) svg = svg.replace(/<\/svg>\s*$/, `${faces}</svg>`);
      r.art.innerHTML = svg;
    }
    r.pips.forEach((p, i) => p.classList.toggle('on', i < lvl));

    // Status line.
    let html;
    let tone = '';
    let live = null;
    if (b) {
      html = `${icon('hammer')}${lvl === 0 ? 'Building' : `Lv ${b.to}`} in ${timer(b.end)}`;
      tone = 'build';
      live = b;
    } else if (lvl === 0) {
      const u = sh.upgradeInfo(id);
      html = `${icon('hammer')}Build · ${icon('scrap')}${u.cost}`;
      tone = u.canStart ? 'go' : 'idle';
    } else if (KIND[id]) {
      if (craft) {
        html = `${icon(craft.item)}${esc(ITEMS[craft.item].name)} in ${timer(craft.end)}`;
        tone = 'run';
        live = craft;
      } else {
        const n = sh.stock(KIND[id]);
        html = `${icon(sh.row(id).item)}${n}/${CRATE_MAX} ready${n < CRATE_MAX ? ' · tap to craft' : ''}`;
        tone = n === 0 ? 'warn' : 'idle';
      }
    } else if (id === 'barracks') {
      const w = sh.waiting()[0];
      html = w ? `${icon('bed')}${esc(SURVIVORS[w].name)} needs a bunk` : `${icon('bed')}${sh.home().length}/${sh.bunks()} bunks`;
      tone = w ? 'warn' : '';
    } else {
      html = `${icon('map')}Chapters 1-${sh.chaptersOpen()} open`;
    }
    this._set(r.st, `st:${id}`, html);
    r.el.dataset.tone = tone;
    r.el.dataset.state = lvl === 0 && !b ? 'empty' : 'built';
    if (live) {
      r.bar.dataset.barStart = live.start;
      r.bar.dataset.barEnd = live.end;
      r.bar.classList.add('on');
    } else {
      delete r.bar.dataset.barStart;
      r.bar.classList.remove('on');
    }
    r.el.classList.toggle('can-up', lvl > 0 && sh.upgradeInfo(id).canStart);
    r.el.classList.toggle('hinted', sh.hint().focus === id);
  }

  _card() {
    const sh = this.sh;
    const nm = sh.nextMission();
    const M = nm.mission;
    const ch = CHAPTERS[M.chapter - 1];
    const odds = sh.odds();
    const lab = chanceLabel(odds);
    const L = sh.loadout(M);
    const pos = (M.index % 3) + 1;
    const head = nm.done
      ? `<div class="kicker">All missions cleared · replay</div>`
      : nm.replay
        ? `<div class="kicker locked">${icon('lock')}Chapter ${nm.lockedChapter} needs the Radio Room · replay</div>`
        : `<div class="kicker">Next mission · Ch ${M.chapter} ${esc(ch.name)} · ${pos}/3</div>`;
    const squad = sh.squad().map((m) => faceHtml(m.kind === 'survivor' ? m.id : m.kind, `k-${m.kind}`)).join('');
    const carry = [L.throwable, L.heal].filter(Boolean);
    const carryHtml = carry.length
      ? carry.map((it) => `<span class="it">${icon(it)}${esc(ITEMS[it].name)}</span>`).join('')
      : `<span class="it none">Nothing crafted yet</span>`;
    const html =
      head +
      `<h2>${esc(M.name)}${M.finale ? ` <span class="fin">${icon('flag')}Finale</span>` : ''}</h2>` +
      (M.rescue && sh.s.survivors[M.rescue] === 'unknown' && !nm.replay ? `<p class="sub">Someone is waiting at the end…</p>` : '') +
      `<div class="odds t-${lab.tone}"><span class="ring" style="--p:${Math.round(odds * 100)}"><b>${Math.round(odds * 100)}%</b></span>` +
      `<span class="ot"><b>${lab.text} chance</b><small>Strength ${L.strength} vs danger ${M.danger}</small></span></div>` +
      `<div class="row"><span class="lbl">Squad</span><span class="faces">${squad}</span></div>` +
      `<div class="row"><span class="lbl">Carrying</span><span class="carry">${carryHtml}</span></div>` +
      `<button class="play" type="button" data-act="play"><span class="pl">${icon('play')}<b>${nm.replay ? 'REPLAY' : 'PLAY'}</b></span><small>simulated mission · up to ${M.scrap} Scrap</small></button>`;
    this._set(this.el.card, 'card', html);
    const h = sh.hint();
    this._set(this.el.hint, 'hint', `<span class="hi">${icon(h.focus === 'play' ? 'play' : h.focus)}</span><span class="ht">${esc(h.text)}</span><span class="go">›</span>`);
  }

  update() {
    for (const id of ROOMS) this._room(id);
    this._card();
    tickLive(this.house, this.sh.now());
  }
}
