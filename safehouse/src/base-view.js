// The base view: one screen, a cross-section of the Safehouse with its eight
// stations. Tapping a room opens its sheet (Upgrade, Craft, Collect); the
// Scrap Yard's pile can be collected straight from the room (one tap).

import { STATIONS, ITEMS, RECIPES, WEAPONS, SURVIVORS } from './config.js';
import { roomArt, boardedArt, BUNK_SLOTS, ART_VIEW } from './art.js';
import { portrait, PORTRAIT_COLORS } from './portraits.js';
import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { esc, tickLive } from './ui.js';

/** Grid placement: landscape is 4x2, portrait 2x4 (see safehouse.css). */
export const ROOMS = ['radio', 'barracks', 'infirmary', 'armory', 'barricade', 'workshop', 'generator', 'scrapyard'];

/** A survivor face drawn inside the room SVG, clipped round (scales with the art). */
function faceInSvg(id, x, y, r, waiting = false) {
  const svg = portrait(id);
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  const c = PORTRAIT_COLORS[id] || '#ffcf7a';
  return (
    `<svg x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" viewBox="0 0 64 64" overflow="visible">` +
    `<circle cx="32" cy="32" r="33" fill="#15110d"/><g clip-path="url(#sh-face-clip)">${inner}</g>` +
    `<circle cx="32" cy="32" r="31" fill="none" stroke="${c}" stroke-width="4"${waiting ? ' stroke-dasharray="7 5"' : ''}/></svg>`
  );
}

export class BaseView {
  constructor(root, sh, { onRoom, onCollect }) {
    this.root = root;
    this.sh = sh;
    this.onRoom = onRoom;
    this.onCollect = onCollect;
    this.artKey = {};
    this.cache = new Map();
    this._build();
  }

  _build() {
    const room = (id) =>
      `<button class="room" type="button" data-id="${id}" style="grid-area:${id}" aria-label="${esc(STATIONS[id].name)}">` +
      `<span class="art"></span>` +
      `<span class="tag"><span class="nm">${esc(STATIONS[id].name.toUpperCase())}</span><span class="pips">${'<i></i>'.repeat(5)}</span></span>` +
      `<span class="draw" title="Power draw">${icon('power')}<b>${STATIONS[id].levels[0].powerDraw}</b></span>` +
      `<span class="status"><span class="st"></span><span class="bar"><i></i></span></span>` +
      `<span class="badge"></span><span class="up">${icon('up')}</span><span class="pickup" data-collect="${id}"></span>` +
      `</button>`;
    this.root.innerHTML =
      `<div class="building">` +
      `<div class="roofline"><span class="antenna"></span><span class="tank"></span></div>` +
      `<div class="rooms">${ROOMS.map(room).join('')}</div>` +
      `<div class="street"></div>` +
      `</div>`;
    this.rooms = {};
    for (const id of ROOMS) {
      const el = this.root.querySelector(`.room[data-id="${id}"]`);
      this.rooms[id] = {
        el,
        art: el.querySelector('.art'),
        st: el.querySelector('.st'),
        bar: el.querySelector('.bar'),
        barI: el.querySelector('.bar i'),
        badge: el.querySelector('.badge'),
        pickup: el.querySelector('.pickup'),
        pips: [...el.querySelectorAll('.pips i')],
      };
    }
    this.root.addEventListener('click', (e) => {
      const c = e.target.closest('[data-collect]');
      if (c && c.classList.contains('on')) {
        e.stopPropagation();
        this.onCollect(c.dataset.collect, c);
        return;
      }
      const r = e.target.closest('.room');
      if (r) this.onRoom(r.dataset.id, r);
    });
  }

  rectOf(id) {
    const r = this.rooms[id];
    return r ? r.el.getBoundingClientRect() : null;
  }

  /** Bring a room into view and flash it. */
  focus(id) {
    const r = this.rooms[id];
    if (!r) return;
    r.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    r.el.classList.remove('flash');
    void r.el.offsetWidth;
    r.el.classList.add('flash');
  }

  _set(el, key, html) {
    if (this.cache.get(key) !== html) {
      this.cache.set(key, html);
      el.innerHTML = html;
    }
  }

  /** Art for a room; only re-rendered when what it shows changes. */
  _art(id, state) {
    const sh = this.sh;
    const lvl = sh.level(id);
    const opts = { level: lvl };
    let faces = '';
    if (state === 'locked') {
      const key = 'locked';
      if (this.artKey[id] !== key) {
        this.artKey[id] = key;
        this.rooms[id].art.innerHTML = boardedArt();
      }
      return;
    }
    if (id === 'generator') opts.active = sh.powerUsed() > 0;
    if (id === 'workshop' || id === 'infirmary') opts.active = sh.jobsAt(id).some((j) => j.state === 'running');
    if (id === 'scrapyard') {
      const y = sh.yardInfo();
      opts.active = y.state === 'running';
      opts.fill = y.level ? Math.round(y.frac * 10) / 10 : 0;
    }
    if (id === 'armory') opts.weapons = sh.weaponsUnlocked();
    if (id === 'radio') opts.alert = !!sh.rescueCall() || sh.orders().some((o) => o.done);
    if (id === 'barracks') {
      const home = sh.housed();
      home.forEach((sid, i) => {
        const p = BUNK_SLOTS[i];
        if (p) faces += faceInSvg(sid, p[0], p[1], 16);
      });
      // Rescued survivors waiting for a bunk sit on the floor, bottom left.
      sh.waiting().forEach((sid, i) => {
        faces += faceInSvg(sid, 24 + i * 30, ART_VIEW.h - 34, 13, true);
      });
    }
    const key = JSON.stringify(opts) + (id === 'barracks' ? sh.housed().join() + '|' + sh.waiting().join() : '');
    if (this.artKey[id] === key) return;
    this.artKey[id] = key;
    let svg = roomArt(id, opts);
    if (faces) svg = svg.replace(/<\/svg>\s*$/, `${faces}</svg>`);
    this.rooms[id].art.innerHTML = svg;
  }

  /** What the status strip says, plus badge and pickup. */
  _status(id, state) {
    const sh = this.sh;
    const def = STATIONS[id];
    const out = { html: '', tone: '', live: null, frac: null, badge: '', pickup: '' };
    const timer = (end) => `<b data-end="${end}"></b>`;
    if (state === 'locked') {
      out.html = `${icon('lock')}Needs Barricade Lv ${def.unlock}`;
      out.tone = 'locked';
      return out;
    }
    const b = sh.s.stations[id].build;
    if (state === 'available') {
      const info = sh.upgradeInfo(id);
      const cost = Object.entries(info.cost)
        .map(([r, v]) => `${icon(r)}${fmtNum(v)}`)
        .join(' ');
      out.html = `${icon('hammer')}Build ${cost}`;
      out.tone = info.canStart ? 'go' : 'idle';
      if (sh.isNew(id)) out.badge = 'NEW';
      return out;
    }
    if (b) {
      out.html = `${icon('hammer')}${b.to === 1 ? 'Building' : `Lv ${b.to}`} ${timer(b.end)}`;
      out.tone = 'build';
      out.live = b;
      return out;
    }
    switch (id) {
      case 'workshop':
      case 'infirmary': {
        const jobs = sh.jobsAt(id);
        if (!jobs.length) {
          out.html = 'Idle · tap to craft';
          out.tone = 'idle';
          break;
        }
        const j = jobs[0];
        const s = sh.jobStatus(j);
        const item = RECIPES[j.recipe].output.item;
        const more = jobs.length > 1 ? ` <em>+${jobs.length - 1}</em>` : '';
        if (s.state === 'running') {
          out.html = `${icon(item)}${esc(ITEMS[item].name)} ${timer(j.end)}${more}`;
          out.live = j;
          out.tone = 'run';
        } else if (s.state === 'power') {
          out.html = `${icon('power')}Waiting for power${more}`;
          out.tone = 'warn';
        } else if (s.state === 'fuel') {
          out.html = `${icon('fuel')}Out of Fuel${more}`;
          out.tone = 'bad';
        } else out.html = `${icon(item)}Starting…`;
        break;
      }
      case 'scrapyard': {
        const y = sh.yardInfo();
        const pile = Math.floor(y.pile);
        if (y.state === 'running') {
          out.html = `${icon('scrap')}${fmtNum(pile)}/${fmtNum(y.store)} · full in ${timer(y.run.end)}`;
          out.frac = y.frac;
          out.tone = 'run';
        } else if (y.state === 'full') {
          out.html = `${icon('scrap')}Full: ${fmtNum(pile)} · tap to collect`;
          out.tone = 'ready';
          out.frac = 1;
          out.badge = '!';
        } else if (y.state === 'waiting') {
          out.html = y.status.state === 'fuel' ? `${icon('fuel')}Needs Fuel to start` : `${icon('power')}Waiting for power`;
          out.tone = y.status.state === 'fuel' ? 'bad' : 'warn';
        } else {
          out.html = `${icon('scrap')}Stopped${pile ? ` · ${fmtNum(pile)} waiting` : ''}`;
          out.tone = 'idle';
        }
        if (pile >= 1) out.pickup = `+${fmtNum(pile)}`;
        break;
      }
      case 'generator': {
        const cap = sh.powerCap();
        out.html = `${icon('power')}${sh.powerUsed()}/${cap} in use · ${icon('fuel')}${Math.floor(sh.s.res.fuel)}/${sh.cap('fuel')}`;
        out.tone = sh.powerUsed() >= cap ? 'warn' : '';
        break;
      }
      case 'barricade': {
        const r = sh.row('barricade');
        out.html = `${icon('hammer')}${sh.builds().length}/${sh.buildSlots()} builds · ${icon('parts')}${r.partsCap} ${icon('supplies')}${r.suppliesCap}`;
        break;
      }
      case 'barracks': {
        const w = sh.waiting();
        if (w.length) {
          out.html = `${icon('bed')}${esc(SURVIVORS[w[0]].short)} needs a bunk`;
          out.tone = 'warn';
          out.badge = '!';
        } else out.html = `${icon('bed')}${sh.housed().length}/${sh.bunks()} bunks · Rested +${sh.row('barracks').rested}%`;
        break;
      }
      case 'armory': {
        const w = sh.resolvedLoadout().weapon;
        out.html = `${icon(w)}${sh.weaponsUnlocked().length} guns · ${esc(WEAPONS[w].name)} Mk ${sh.weaponTier(w)}`;
        break;
      }
      case 'radio': {
        const call = sh.rescueCall();
        const done = sh.orders().filter((o) => o.done).length;
        if (call) {
          out.html = `${icon('radio')}Rescue call: ${esc(SURVIVORS[call].short)}!`;
          out.tone = 'ready';
          out.badge = '!';
        } else if (done) {
          out.html = `${icon('order')}${done} order${done > 1 ? 's' : ''} done · claim`;
          out.tone = 'ready';
          out.badge = '!';
        } else {
          const n = sh.orders().length;
          out.html = `${icon('order')}${n}/3 orders · next ${timer(sh.s.orders.nextAt)}`;
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  update() {
    const sh = this.sh;
    for (const id of ROOMS) {
      const r = this.rooms[id];
      const state = sh.stationState(id);
      const lvl = sh.level(id);
      r.el.dataset.state = state;
      this._art(id, state);
      r.pips.forEach((p, i) => p.classList.toggle('on', i < lvl));
      const s = this._status(id, state);
      this._set(r.st, `st:${id}`, s.html);
      r.el.dataset.tone = s.tone;
      const running = (id === 'workshop' || id === 'infirmary' || id === 'scrapyard') && sh.jobsAt(id).some((j) => j.state === 'running');
      r.el.classList.toggle('drawing', running);
      if (s.live) {
        r.bar.dataset.barStart = s.live.start;
        r.bar.dataset.barEnd = s.live.end;
        r.bar.classList.add('on');
      } else {
        delete r.bar.dataset.barStart;
        delete r.bar.dataset.barEnd;
        r.bar.classList.toggle('on', s.frac !== null);
        if (s.frac !== null) r.barI.style.transform = `scaleX(${s.frac})`;
      }
      this._set(r.badge, `badge:${id}`, s.badge);
      r.badge.classList.toggle('on', !!s.badge);
      this._set(r.pickup, `pickup:${id}`, s.pickup ? `${icon('scrap')}<b>${s.pickup}</b>` : '');
      r.pickup.classList.toggle('on', !!s.pickup);
      r.pickup.classList.toggle('full', s.tone === 'ready');
      r.el.classList.toggle('can-up', state === 'built' && !sh.s.stations[id].build && sh.upgradeInfo(id).canStart);
    }
    tickLive(this.root, sh.now());
  }
}
