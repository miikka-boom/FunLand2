// Two short shows over the map:
//   nightShow   tonight's survivor runs out, bonks zombies and comes home
//               (a win) or runs home early (a loss); the coins fly to the wallet
//   moveInShow  someone new moves into the home you just built: the stars
//               knock in one by one, then their face
// A tap speeds a show up. Both resolve when the overlay is gone.

import { zoneBackdropSvg, zombieSvg, ZBOX } from './thrill-art.js';
import { figureSvg, portraitSvg } from './portrait.js';
import { RARITIES, CLASSES } from './config.js';
import { svgImgPlain } from './map.js';
import { icon } from './icons.js';
import { name, stars, coinSvg } from './kit.js';
import { esc, wait } from './ui.js';

/** The backdrop changes every ten nights (six places, then round again). */
const backdropFor = (night) => 1 + (Math.floor((night - 1) / 10) % 6);
const ZED_KINDS = ['walker', 'runner', 'walker', 'brute', 'spitter', 'walker', 'runner', 'horde', 'walker'];

function open(overlay, cls, html) {
  overlay.innerHTML = `<div class="ov ${cls}">${html}</div>`;
  overlay.classList.add('on');
  const root = overlay.firstElementChild;
  // Figures scale with the screen height (a plain number for calc()).
  root.style.setProperty('--k', Math.max(1.6, Math.min(3, innerHeight / 170)).toFixed(3));
  requestAnimationFrame(() => root.classList.add('in'));
  return root;
}

async function close(overlay) {
  const root = overlay.firstElementChild;
  if (root) {
    root.classList.remove('in');
    root.classList.add('out');
  }
  await wait(260);
  overlay.innerHTML = '';
  overlay.classList.remove('on');
}

/** Tap to speed up: returns a wait that shortens once tapped, and a cleanup. */
function speedy(root) {
  const st = { fast: false };
  const on = () => (st.fast = true);
  root.addEventListener('pointerdown', on);
  return { w: (ms) => wait(st.fast ? Math.min(ms, 50) : ms), st, off: () => root.removeEventListener('pointerdown', on) };
}

/** Resolve on a tap or after `ms`. */
function tapOrWait(root, ms) {
  return new Promise((res) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      root.removeEventListener('pointerup', done);
      res();
    }
    root.addEventListener('pointerup', done);
  });
}

const fig = (p, pose) => `<span class="figimg">${svgImgPlain(figureSvg(p, { pose }))}</span>`;
const zed = (kind, k) => {
  const [w, h] = ZBOX[kind];
  return `<span class="nz" data-k="${k}" style="--w:${w}px;--h:${h}px">${svgImgPlain(zombieSvg(kind, { variant: k % 4, flip: true }))}</span>`;
};

/** The night out. result: town.play()'s result. */
export async function nightShow(overlay, { town, result, fx, sound, hud, haptic = () => {} }) {
  const p = town.person(result.id);
  const n = result.zeds;
  // A loss: more come from the right once the first one or two are down.
  const late = result.win ? '' : Array.from({ length: 4 }, (_, k) => zed(['brute', 'horde', 'runner', 'horde'][k], k).replace('class="nz"', 'class="nz late"')).join('');
  const zeds = Array.from({ length: n }, (_, k) => zed(ZED_KINDS[(k + result.night) % ZED_KINDS.length], k)).join('') + late;
  const root = open(
    overlay,
    `night ${result.win ? 'win' : 'lose'}`,
    `<div class="nr-sky">${zoneBackdropSvg(backdropFor(result.night))}</div>` +
      `<div class="nr-head"><small>NIGHT</small><b>${result.night}</b></div>` +
      `<div class="nr-stage"><span class="nr-hero" style="--c:${CLASSES[p.cls].color}">${fig(p, 'idle')}<em class="nr-name">${name(p)}</em></span><span class="nr-zeds">${zeds}</span></div>` +
      `<div class="nr-end"></div><div class="nr-skip">Tap to skip</div>`,
  );
  const { w, off } = speedy(root);
  const hero = root.querySelector('.nr-hero');
  const zs = [...root.querySelectorAll('.nz:not(.late)')];
  sound('whoosh');
  try {
    await w(500);
    hero.classList.add('run');
    // A win bonks them all; a loss bonks one or two before the rest pile in.
    const bonks = result.win ? zs.length : Math.max(1, Math.min(zs.length - 1, 1 + (result.night % 2)));
    for (let k = 0; k < bonks; k++) {
      await w(330);
      const z = zs[k];
      hero.style.setProperty('--x', `${Math.round(((k + 1) / (zs.length + 1)) * (result.win ? 62 : 40))}%`);
      await w(170);
      z.classList.add('ko');
      sound('bonk');
      haptic(8);
      if (fx) {
        const r = z.getBoundingClientRect();
        fx.float({ x: r.left + r.width / 2, y: r.top }, 'BONK!', 'bonk');
      }
    }
    if (!result.win) {
      await w(260);
      root.classList.add('swarm');
      sound('lose');
      haptic(30);
      await w(520);
      hero.classList.add('flee');
      await w(650);
    } else {
      await w(300);
      hero.innerHTML = `${fig(p, 'cheer')}<em class="nr-name">${name(p)}</em>`;
      hero.classList.add('cheer');
      sound('win');
      if (fx) fx.confetti(root.querySelector('.nr-stage'), 50);
    }
    // The result and the coins.
    const end = root.querySelector('.nr-end');
    end.innerHTML = result.win
      ? `<div class="stampbig good">SURVIVED!</div><div class="nr-pay">${icon('coin')}<b>+${result.coins}</b></div><div class="nr-next">Next up: Night ${result.next}</div>`
      : `<div class="stampbig bad">RAN HOME!</div><div class="nr-pay">${icon('coin')}<b>+${result.coins}</b></div><div class="nr-next">Night ${result.night} again. Upgrade ${name(p)} or send someone stronger.</div>`;
    end.classList.add('on');
    await w(350);
    if (fx && hud) {
      const pay = end.querySelector('.nr-pay');
      fx.fly({ from: pay.getBoundingClientRect(), to: hud.target('coins'), html: coinSvg(), count: Math.min(10, 3 + Math.round(result.coins / 15)), onEach: () => sound('coin', { pitch: Math.random() }) });
      setTimeout(() => {
        hud.thaw();
        hud.bump('coins');
      }, 520);
    } else if (hud) hud.thaw();
    off();
    await tapOrWait(root, result.win ? 1500 : 2600);
  } finally {
    off();
    if (hud) hud.thaw();
    await close(overlay);
  }
}

/**
 * Someone moves in. Resolves 'pick' (send them out tonight) or 'ok'.
 * stronger: they'd do better tonight than whoever goes out now.
 */
export async function moveInShow(overlay, { person: p, town, fx, sound, haptic = () => {}, stronger = false }) {
  const n = RARITIES[p.rarity].stars;
  const root = open(
    overlay,
    `movein r-${p.rarity}`,
    `<div class="mi-card"><div class="mi-title">Someone's moving in!</div>` +
      `<div class="mi-face r-${p.rarity}" style="--cls:${CLASSES[p.cls].color}">${portraitSvg(p, { mood: 'happy' })}</div>` +
      `<div class="mi-stars">${Array.from({ length: 4 }, (_, k) => `<i class="${k < n ? 'on' : 'off'}">★</i>`).join('')}</div>` +
      `<div class="mi-info"><h2>${name(p)}</h2><div class="mi-sub">${stars(p)}<span class="cls" style="--c:${CLASSES[p.cls].color}">${esc(CLASSES[p.cls].name)}</span></div>` +
      `<div class="mi-bio">${esc(p.job)}, ${p.age}. “${esc(p.quote || p.quirk)}”</div><div class="mi-pw">Lv ${p.level} · Power <b>${town.power(p)}</b></div></div>` +
      `<div class="mi-btns"></div></div>`,
  );
  const { w, off } = speedy(root);
  const card = root.querySelector('.mi-card');
  const st = [...root.querySelectorAll('.mi-stars i')];
  try {
    sound('drumroll');
    await w(600);
    for (let k = 0; k < n; k++) {
      await w(k === 0 ? 250 : 330 + k * 60);
      st[k].classList.add('lit');
      sound('pop', { pitch: k / 4 });
      haptic(10 + k * 4);
      if (k >= 2 && fx) fx.burst(st[k], k >= 3 ? ['#ffd36b', '#fff2b0', '#ff8ad8'] : ['#b25cff', '#e3c4ff'], 12 + k * 4, 60);
    }
    await w(350);
    card.classList.add('reveal');
    sound(p.rarity === 'legend' ? 'golden' : 'moveIn');
    if (fx) {
      if (n >= 3) fx.confetti(card, n >= 4 ? 120 : 60);
      fx.stamp(card.querySelector('.mi-face'), `${RARITIES[p.rarity].name.toUpperCase()}!`, `r-${p.rarity}`);
    }
    await w(400);
  } finally {
    off();
  }
  const btns = root.querySelector('.mi-btns');
  btns.innerHTML =
    (stronger ? `<button class="btn blue big" type="button" data-v="pick">${icon('play')}SEND OUT TONIGHT</button>` : '') +
    `<button class="btn ${stronger ? '' : 'yellow big'}" type="button" data-v="ok">${icon('heart')}WELCOME HOME!</button>`;
  const v = await new Promise((res) => {
    btns.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) res(b.dataset.v);
    });
  });
  sound('tap');
  await close(overlay);
  return v;
}
