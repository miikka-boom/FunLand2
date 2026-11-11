// Long Haul: the camp on screen. Draws camp-art's scene, fits a window of it to
// the screen, puts everyone where they belong (the squad by the truck, the rest
// around the fire), keeps the radio rack and its bubble up to date, and turns
// taps on the scene into actions.

import { campSvg, SCENE, SPOTS, tentSvg, rackSvg, giftSvg, skySvg, citySvg } from './camp-art.js';
import { figureSvg, figureHeight } from './figures.js';
import { CAST, RARITIES, RACK_SIZE } from './config.js';
import { icon } from './icons.js';
import { fmtLeft } from './format.js';
import { wait } from './ui.js';

export class CampView {
  /**
   * @param root the element the scene fills
   * @param pins an overlay for bubbles pinned to points of the scene
   * @param ctx { game, onAct(act, data), sfx }
   */
  constructor(root, pins, ctx) {
    this.root = root;
    this.pinsRoot = pins;
    this.ctx = ctx;
    this.view = { s: 1, x0: 0, y0: 0 };
    this.away = false; // the squad is out on a run
    root.innerHTML = campSvg();
    this.svg = root.querySelector('svg');
    this.world = this.svg.querySelector('#c-world');
    this.g = {};
    for (const k of ['tents', 'rack', 'people-back', 'people', 'gift', 'sky', 'city']) this.g[k] = this.svg.querySelector(`#c-${k}`);
    this.areaDrawn = 0; // the stop whose sky and horizon are on screen
    this.truck = this.svg.querySelector('#c-truck');
    this.truckHome = this.truck.getAttribute('transform');
    root.addEventListener('click', (e) => this._click(e));
    pins.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) ctx.onAct(b.dataset.act, b.dataset, b);
    });
    this.fit();
  }

  // --- Fitting the scene to the screen ---------------------------------------------------------

  /** Show the widest window that keeps the whole camp in view, the ground at the bottom. */
  fit() {
    const vw = this.root.clientWidth || window.innerWidth;
    const vh = this.root.clientHeight || window.innerHeight;
    const safeW = SCENE.safe.x1 - SCENE.safe.x0;
    const s = Math.min(vw / safeW, vh / (SCENE.h - SCENE.safe.top));
    const w = vw / s;
    const h = vh / s;
    const x0 = (SCENE.safe.x0 + SCENE.safe.x1) / 2 - w / 2;
    // A tall screen gets mostly more sky, and a little more ground.
    const y0 = SCENE.h - h + Math.min(Math.max(0, h - SCENE.h) * 0.3, 90);
    this.svg.setAttribute('viewBox', `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`);
    this.world.setAttribute('transform', `translate(${(-x0).toFixed(1)},${(-y0).toFixed(1)})`);
    this.view = { s, x0, y0 };
    this._placePins();
  }

  /** A point of the scene, on screen. */
  point(x, y) {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + (x - this.view.x0) * this.view.s, y: r.top + (y - this.view.y0) * this.view.s };
  }

  /** Where a survivor stands (their feet), and how big: a squad spot or a place by the fire. */
  spotOf(id) {
    const s = this.ctx.game.s;
    const k = s.squad.indexOf(id);
    if (k >= 0) return SPOTS.squad[k];
    const b = this.ctx.game.bench().indexOf(id);
    return b >= 0 ? SPOTS.bench[b % SPOTS.bench.length] : null;
  }

  /** The middle of a survivor's body, on screen (for things that fly to them), or null. */
  figurePoint(id) {
    const sp = this.spotOf(id);
    if (!sp || (this.away && this.ctx.game.s.squad.includes(id))) return null;
    return this.point(sp.x, sp.y - figureHeight(id) * sp.s * 0.55);
  }

  figureEl(id) {
    return this.svg.querySelector(`.c-fig[data-id="${id}"]`);
  }

  // --- Drawing ---------------------------------------------------------------------------------

  /** Draw everything that depends on the save. */
  render() {
    const { game } = this.ctx;
    const s = game.s;
    const owned = game.owned();
    // The camp has moved on with the squad: a new sky, new shapes beyond the fence.
    // (Only once the stop has been celebrated, so the card comes first.)
    const stop = Math.min(game.areaIndex(), s.areaSeen);
    if (stop !== this.areaDrawn) {
      this.areaDrawn = stop;
      this.g.sky.innerHTML = skySvg(stop);
      this.g.city.innerHTML = citySvg(stop);
    }
    // One tent for every two people.
    const tents = [];
    for (let i = 0; i < Math.ceil(owned.length / 2) && i < SPOTS.tents.length; i++) {
      const t = SPOTS.tents[i];
      const best = [owned[i * 2], owned[i * 2 + 1]].filter(Boolean).sort((a, b) => RARITIES[CAST[b].rarity].mult - RARITIES[CAST[a].rarity].mult)[0];
      tents.push({ y: t.y, html: `<g class="c-tent" transform="translate(${t.x},${t.y}) scale(${t.s})">${tentSvg(i, RARITIES[CAST[best].rarity].color)}</g>` });
    }
    this.g.tents.innerHTML = tents
      .sort((a, b) => a.y - b.y)
      .map((t) => t.html)
      .join('');
    // People, far to near.
    const front = [];
    let back = '';
    for (const id of owned) {
      const inSquad = s.squad.includes(id);
      if (inSquad && this.away) continue;
      const sp = this.spotOf(id);
      if (!sp) continue;
      const html = this._fig(id, sp, inSquad);
      if (sp.back) back += html;
      else front.push({ y: sp.y, html });
    }
    this.g['people-back'].innerHTML = back;
    this.g.people.innerHTML = front
      .sort((a, b) => a.y - b.y)
      .map((p) => p.html)
      .join('');
    this.g.gift.innerHTML = s.gift ? giftSvg(s.gift.line) : '';
    this.renderRack();
  }

  _fig(id, sp, inSquad, pose = 'idle') {
    const h = figureHeight(id);
    const delay = -((id.charCodeAt(0) * 37 + id.length * 91) % 300) / 100;
    return (
      `<g class="c-fig${inSquad ? ' is-squad' : ''}" data-act="survivor" data-id="${id}" transform="translate(${sp.x},${sp.y})">` +
      `<rect x="${-26 * sp.s}" y="${-h * sp.s}" width="${52 * sp.s}" height="${h * sp.s + 6}" fill="transparent"/>` +
      `<g class="c-fig-in" transform="scale(${sp.flip ? -sp.s : sp.s},${sp.s})" style="--d:${delay}s">${figureSvg(id, pose)}</g>` +
      `</g>`
    );
  }

  /** Redraw one survivor in another pose (idle, cheer, wave...). */
  pose(id, pose) {
    const el = this.figureEl(id);
    const sp = this.spotOf(id);
    if (!el || !sp) return;
    el.querySelector('.c-fig-in').innerHTML = figureSvg(id, pose);
  }

  /** Someone is pleased: arms up for a moment, with a little hop. */
  async cheer(id, ms = 1100) {
    const el = this.figureEl(id);
    if (!el) return;
    this.pose(id, 'cheer');
    el.classList.add('hop');
    await wait(ms);
    const again = this.figureEl(id);
    if (again) {
      again.classList.remove('hop');
      this.pose(id, 'idle');
    }
  }

  renderRack() {
    const { game } = this.ctx;
    const rack = game.rack();
    this.g.rack.innerHTML = rackSvg(rack);
    this.svg.classList.toggle('calling', rack.some((r) => r.state === 'calling'));
    this._rackKey = rack.map((r) => r.state).join(',');
    this._pins();
  }

  /** Call often: redraws the rack when a call gets its answer. */
  tick() {
    const rack = this.ctx.game.rack();
    const key = rack.map((r) => r.state).join(',');
    if (key !== this._rackKey) {
      this.renderRack();
      return true;
    }
    return false;
  }

  // --- Bubbles pinned to the scene --------------------------------------------------------------

  _pins() {
    const { game } = this.ctx;
    const rack = game.rack();
    const answered = rack.filter((r) => r.state === 'answered').length;
    const calling = rack.find((r) => r.state === 'calling');
    let html = '';
    if (answered) {
      html += `<button class="pin pin-radio answered" type="button" data-act="radio" data-x="${SPOTS.rack.x}" data-y="${SPOTS.rack.y - 54}">${icon('radio')}<b>SOMEONE ANSWERED!</b>${answered > 1 ? `<i>${answered}</i>` : ''}</button>`;
    } else if (calling) {
      html += `<button class="pin pin-radio calling" type="button" data-act="radio" data-x="${SPOTS.rack.x}" data-y="${SPOTS.rack.y - 50}">${icon('radio')}<span>Calling</span><b data-until="${calling.readyAt}">${fmtLeft(calling.left)}</b>${rack.length >= RACK_SIZE ? `<i class="full">RACK FULL</i>` : ''}</button>`;
    }
    if (game.s.gift) html += `<button class="pin pin-gift" type="button" data-act="gift" data-x="${SPOTS.gift.x}" data-y="${SPOTS.gift.y - 74}"><b>?</b></button>`;
    this.pinsRoot.innerHTML = html;
    this._placePins();
  }

  _placePins() {
    if (!this.pinsRoot) return;
    const r = this.root.getBoundingClientRect();
    for (const el of this.pinsRoot.children) {
      const p = this.point(Number(el.dataset.x), Number(el.dataset.y));
      el.style.left = `${p.x - r.left}px`;
      el.style.top = `${p.y - r.top}px`;
    }
  }

  /** A few words over someone's head for a moment. */
  say(id, text, ms = 2600) {
    const sp = this.spotOf(id);
    if (!sp || !this.figureEl(id)) return false;
    const el = document.createElement('div');
    el.className = 'pin pin-say';
    el.textContent = text;
    el.dataset.x = sp.x;
    el.dataset.y = sp.y - figureHeight(id) * sp.s - 4;
    this.pinsRoot.appendChild(el);
    this._placePins();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }, ms);
    return true;
  }

  /** The radio bubble (or the rack itself when there is no bubble), for the pointing hand. */
  radioTarget() {
    return this.pinsRoot.querySelector('.pin-radio') || this.point(SPOTS.rack.x, SPOTS.rack.y - 10);
  }

  // --- Coming and going -------------------------------------------------------------------------

  /** The squad climbs in and the truck pulls out through the gate. */
  async depart() {
    const s = this.ctx.game.s;
    const tail = { x: 846, y: 404 };
    const figs = s.squad.map((id) => this.figureEl(id)).filter(Boolean);
    figs.forEach((el, i) => {
      const id = el.dataset.id;
      el.querySelector('.c-fig-in').innerHTML = figureSvg(id, 'walk');
      el.classList.add('walking');
      const sp = this.spotOf(id);
      el.animate([{ transform: `translate(${sp.x}px,${sp.y}px)` }, { transform: `translate(${tail.x}px,${tail.y - 6}px)`, opacity: 1, offset: 0.8 }, { transform: `translate(${tail.x + 20}px,${tail.y - 26}px)`, opacity: 0 }], {
        duration: 420 + i * 60,
        easing: 'ease-in',
        fill: 'forwards',
      });
    });
    await wait(480);
    this.ctx.sfx.play('engine');
    this.away = true;
    this.truck.classList.add('rumble');
    await wait(160);
    this.truck.classList.remove('rumble');
    this.truck.animate([{ transform: 'translate(900px,404px)' }, { transform: 'translate(1700px,404px)' }], { duration: 620, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' });
    await wait(520);
  }

  /** Back at camp: the truck is home and everyone is where they belong. */
  arrive() {
    this.away = false;
    for (const a of this.truck.getAnimations()) a.cancel();
    this.truck.setAttribute('transform', this.truckHome);
    this.render();
    this.truck.animate([{ transform: 'translate(1500px,404px)' }, { transform: 'translate(900px,404px)' }], { duration: 520, easing: 'cubic-bezier(.1,.7,.3,1)' });
  }

  /** A tent pops up, a newcomer walks in: call after render() when someone has just moved in. */
  welcome(id) {
    const el = this.figureEl(id);
    if (!el) return;
    el.classList.add('arrive');
    setTimeout(() => el.classList.remove('arrive'), 900);
  }

  _click(e) {
    const t = e.target.closest('[data-act]');
    if (!t || !this.root.contains(t)) return;
    this.ctx.onAct(t.dataset.act, t.dataset, t);
  }
}
