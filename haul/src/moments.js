// Long Haul: the big moments, each a little scene over everything else.
//   reveal()  someone answered the radio
//   arrive()  a new stop on the road
//   ferry()   the end of the road
// They are async: they wait for taps and resolve when the player moves on.

import { CAST, CLASSES, RARITIES, AREAS, FERRY_STARS } from './config.js';
import { radioSvg } from './crate-art.js';
import { backdropSvg, STAGE } from './area-art.js';
import { icon } from './icons.js';
import { face, tokenBar, rarityTag, classTag, esc, wait, tapOrWait } from './ui.js';
import { stand } from './sheets.js';
import { buzz } from './fx.js';

const CRACKLE = ['…krrzzt…', '…hello?…', '…is anybody out there?'];

export class Moments {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { game, sfx, fx, tuning }
  }

  _open(html, cls) {
    this.root.innerHTML = `<div class="moment ${cls}">${html}</div>`;
    this.root.classList.add('open');
    return this.root.firstChild;
  }

  close() {
    this.root.classList.remove('open');
    this.root.innerHTML = '';
  }

  /** Wait for a tap on one of the [data-go] buttons; resolves its value. */
  _choice(el) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const fn = (e) => {
        const b = e.target.closest('[data-go]');
        if (!b || performance.now() - t0 < 250) return;
        el.removeEventListener('click', fn);
        resolve(b.dataset.go);
      };
      el.addEventListener('click', fn);
    });
  }

  /**
   * Someone answered. `res` is Game.answer(): the crackle, a shape in their
   * rarity's colour, then who it is. Resolves 'squad' when the player wants
   * the newcomer in the squad, else 'ok'.
   */
  async reveal(res) {
    const { game, sfx, fx, tuning } = this.ctx;
    const c = CAST[res.id];
    const rarity = RARITIES[res.rarity];
    const el = this._open(
      `<div class="call-glow"></div>` +
        `<div class="call-set">${radioSvg()}</div>` +
        `<div class="call-words"></div>` +
        `<div class="call-static">${Array.from({ length: 17 }, (_, i) => `<i style="--i:${(i * 7) % 11}"></i>`).join('')}</div>` +
        `<div class="call-card r-${res.rarity}" hidden></div>` +
        `<div class="call-hint">Tap</div>`,
      `call r-${res.rarity}`,
    );
    el.style.setProperty('--rc', rarity.color);
    const words = el.querySelector('.call-words');
    const set = el.querySelector('.call-set');
    // 1. The crackle. A tap hurries it.
    sfx.play('static');
    set.classList.add('ringing');
    let hurried = false;
    for (let i = 0; i < CRACKLE.length && !hurried; i++) {
      words.innerHTML = `<span>${CRACKLE[i]}</span>`;
      sfx.play('voice', { pitch: 0.3 + i * 0.25 });
      setTimeout(() => sfx.play('voice', { pitch: 0.5 + i * 0.2 }), 110);
      hurried = (await tapOrWait(el, i === 0 ? 520 : 620, 120)) === 'tap';
    }
    // 2. A shape, in their colour.
    el.classList.add('found');
    el.querySelector('.call-hint').remove();
    words.innerHTML = `<span class="rar">${res.isNew ? 'A NEW VOICE' : 'A VOICE YOU KNOW'}</span>`;
    set.classList.remove('ringing');
    set.classList.add('away');
    const card = el.querySelector('.call-card');
    card.hidden = false;
    card.innerHTML = `<div class="call-shape">${face(res.id, { unknown: true, cls: 'huge' })}<b class="rname">${rarity.name.toUpperCase()}</b></div>`;
    sfx.play('callAnswered');
    fx.ring(card, rarity.color, 260);
    const drama = res.rarity === 'legendary' ? 1500 : res.rarity === 'epic' ? 1000 : res.rarity === 'rare' ? 750 : 560;
    if (res.rarity === 'legendary' || res.rarity === 'epic') {
      el.classList.add('rumble');
      buzz([20, 60, 20, 60, 40], tuning.haptics);
    }
    await tapOrWait(el, res.isNew ? drama : 420, 150);
    // 3. Who it is.
    el.classList.remove('rumble');
    el.classList.add('shown');
    sfx.play('reveal', { rarity: res.rarity });
    fx.ring(card, rarity.color, 420);
    if (res.isNew) fx.confetti({ n: res.rarity === 'legendary' ? 110 : res.rarity === 'epic' ? 70 : 36, from: card });
    buzz(res.isNew ? [20, 30, 40] : 15, tuning.haptics);
    const better = res.isNew ? game.betterBench() : null;
    const swap = better && better.id === res.id ? better : null;
    const info = game.levelInfo(res.id);
    words.innerHTML = '';
    card.innerHTML =
      `<div class="call-who">` +
      stand(res.id, res.isNew ? 'wave' : 'idle', 'big') +
      `<div class="call-info">` +
      `<div class="call-tag">${res.isNew ? 'MOVES INTO THE CAMP' : 'SENDS A PACKAGE'}</div>` +
      `<h2>${esc(c.name)}</h2>` +
      `<div class="tags">${rarityTag(res.id)}${classTag(res.id)}<span class="lvtag">Lv ${info.level}</span><span class="pw">${icon('power')}<b>${info.power}</b></span></div>` +
      `<p class="line">“${esc(c.line)}”</p>` +
      (res.isNew
        ? ''
        : `<div class="call-tokens">${icon('token')}<b>+${res.tokens || 0} tokens</b>${res.refund ? `<span>+${res.refund} ${icon('supplies')} (top level)</span>` : tokenBar(info)}${info.ok ? '<em class="ready">READY</em>' : ''}</div>`) +
      `<div class="call-btns">` +
      (swap ? `<button class="btn blue" type="button" data-go="squad">${icon('swap')}INTO THE SQUAD <small>for ${esc(CAST[swap.out].name)}</small></button>` : '') +
      `<button class="btn go" type="button" data-go="ok">${res.isNew ? 'WELCOME!' : 'THANKS!'}</button>` +
      `</div></div></div>`;
    if (res.isNew) setTimeout(() => sfx.play('join'), 500);
    else if (info.ready) setTimeout(() => sfx.play('ready'), 450);
    return this._choice(el);
  }

  /** A new stop on the road: `a` is Game.arrive() ({ area, voices }). */
  async arrive(a) {
    const { game, sfx, fx } = this.ctx;
    const area = AREAS[a.area];
    const bd = backdropSvg(area.id);
    const el = this._open(
      `<svg class="moment-bd" viewBox="0 0 ${STAGE.w} ${STAGE.h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${bd.back}${bd.front}</svg>` +
        `<div class="arrive-card">` +
        `<div class="kicker">STOP ${a.area + 1} OF ${AREAS.length} ON THE ROAD TO PIER 9</div>` +
        `<h1>${esc(area.name)}</h1>` +
        `<p class="sub">${esc(area.sub)}</p>` +
        `<div class="facts">` +
        `<span class="fact">${icon('danger')}<b>${Math.round(game.danger(a.area))}</b><small>danger</small></span>` +
        `<span class="fact">${icon('crate')}<b>×${area.loot}</b><small>in every crate</small></span>` +
        (a.voices.length ? `<span class="fact voices">${icon('radio')}${a.voices.map((id) => face(id, { unknown: !game.has(id), cls: 'tiny' })).join('')}<small>new on the radio</small></span>` : '') +
        `</div>` +
        `<button class="btn go big" type="button" data-go="ok">ONWARD</button>` +
        `</div>`,
      `arrive a-${area.id}`,
    );
    sfx.play('area');
    fx.confetti({ n: 60 });
    await this._choice(el);
  }

  /** The end of the road. */
  async ferry() {
    const { sfx, fx } = this.ctx;
    const bd = backdropSvg('docks');
    const el = this._open(
      `<svg class="moment-bd" viewBox="0 0 ${STAGE.w} ${STAGE.h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${bd.back}${bd.front}</svg>` +
        `<div class="arrive-card">` +
        `<div class="kicker">${FERRY_STARS} STARS · THE END OF THE ROAD</div>` +
        `<h1>The LIBERTY BELLE answered.</h1>` +
        `<p class="sub">No flare, no ferry. You brought the flare.</p>` +
        `<p class="fine">That’s the whole prototype. The road goes on for as long as you like.</p>` +
        `<button class="btn go big" type="button" data-go="ok">KEEP GOING</button>` +
        `</div>`,
      'arrive a-docks ferry',
    );
    sfx.play('ferry');
    fx.confetti({ n: 120 });
    await wait(300);
    await this._choice(el);
  }
}

export { CLASSES };
