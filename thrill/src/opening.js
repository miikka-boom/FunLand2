// The chest opening: the park dims, the chest hops to the middle and the
// residents crowd the edges. Knock three times (each knock may Glow-Up the
// chest: Silver, Gold, Rainbow). The lid bursts, coins roll into the wallet,
// Badge stacks fly onto the squad's faces (READY stamps), each newcomer card
// drops face down with an honest rarity glow, flips with drama to match and
// moves in, the Vault's finisher lands, and a summary offers the best next step.
//
// The loot is already paid (meta.openChest) when this starts, so closing the
// app mid-show loses nothing. Taps hurry it along; Skip (from the 3rd opening
// on) jumps to the decisions and the summary.

import { chestSvg, badgeTokenSvg, coinSvg, gemSvg } from './chest-art.js';
import { figureSvg, portraitSvg } from './portrait.js';
import { GRADES, CHESTS, RARITIES, CLASSES } from './config.js';
import { displayName, siblingLine } from './people.js';
import { face, rarityTag, classTag, name, perkLine, pw, coins as coinAmt, gems as gemAmt } from './kit.js';
import { icon } from './icons.js';
import { fmtNum } from './format.js';
import { esc, wait } from './ui.js';

const GRADE_COLORS = [null, ['#e9f1f8', '#b9c6d3', '#ffffff'], ['#ffd34d', '#ffb81c', '#fff1a8'], ['#ff5b5b', '#ffcf3a', '#5be07a', '#4aa3ff', '#b25cff']];
const RARITY_BURST = { rookie: ['#d6dde4', '#ffffff'], veteran: ['#4aa3ff', '#bfe3ff', '#ffffff'], hero: ['#b25cff', '#e3c2ff', '#ff8ad8'], legend: ['#ffc23a', '#fff1a8', '#ff9a3d', '#ffffff'] };

/**
 * Drives a sequence: tap() waits for a tap, pause(ms) waits (a tap cuts it
 * short). A second tap within GUARD ms of the last accepted one is a double
 * tap and is ignored, so one quick double tap never skips a reveal.
 */
const GUARD = 170;
export function driver(el) {
  let waiter = null;
  let fast = false;
  let lastTap = 0;
  const mark = () => (el.dataset.waiting = waiter ? (waiter.tap ? 'tap' : 'pause') : '');
  const release = () => {
    if (!waiter) return;
    const w = waiter;
    waiter = null;
    clearTimeout(w.timer);
    mark();
    w.resolve();
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-skip]')) {
      fast = true;
      release();
      return;
    }
    if (e.target.closest('[data-act]')) return;
    const now = performance.now();
    if (now - lastTap < GUARD) return;
    lastTap = now;
    release();
  });
  return {
    get fast() {
      return fast;
    },
    set fast(v) {
      fast = v;
    },
    tap() {
      if (fast) return wait(30);
      return new Promise((resolve) => {
        waiter = { resolve, tap: true };
        mark();
      });
    },
    pause(ms) {
      if (fast) return wait(Math.min(ms, 40));
      return new Promise((resolve) => {
        const w = { resolve, tap: false };
        w.timer = setTimeout(() => {
          if (waiter === w) waiter = null;
          mark();
          resolve();
        }, ms);
        waiter = w;
        mark();
      });
    },
  };
}

/** The face-down card, then the flip with drama that matches the rarity. Returns the card element. */
export async function revealNewcomer(stage, p, { meta, fx, sound, drv, line = '' }) {
  const card = document.createElement('div');
  card.className = `ncard r-${p.rarity}${p.golden ? ' isgolden' : ''}`;
  card.style.setProperty('--cls', CLASSES[p.cls].color);
  card.innerHTML =
    `<div class="nc-in"><div class="nc-back"><span class="q">?</span><span class="nc-logo">${icon('star')}</span></div>` +
    `<div class="nc-front"><div class="nc-face">${portraitSvg(p, { mood: p.rarity === 'legend' || p.golden ? 'wow' : 'happy' })}</div>` +
    `<div class="nc-name"><b>${name(p)}</b><span>${esc(p.first)} ${esc(p.last)}, ${p.age}</span></div>` +
    `<div class="nc-tags">${rarityTag(p)}${classTag(p.cls)}<span class="lvtag">Lv ${p.level}</span></div>` +
    `<div class="nc-lines">${pw(meta.power(p))}${perkLine(p)}</div>` +
    `<div class="nc-quirk">“${esc(p.quirk)}”</div></div></div>` +
    `<div class="nc-banner"></div>`;
  stage.appendChild(card);
  sound('whoosh');
  await drv.pause(380);
  stage.dataset.hint = 'Tap to flip!';
  await drv.tap();
  stage.dataset.hint = '';
  const flash = stage.closest('.opening, .reveal-ov');
  if (p.rarity === 'legend') {
    flash.classList.add('blackout');
    sound('drumroll');
    card.classList.add('spot');
    await drv.pause(1250);
    card.classList.add('spin2');
    await drv.pause(700);
    card.classList.add('flipped');
    flash.classList.remove('blackout');
    sound('flip', { rarity: 'legend' });
    fx.burst(card, RARITY_BURST.legend, 40, 220);
    fx.confetti(card, 60);
    if (p.nick) banner(card, `“${esc(p.nick)}”`, 'legend');
  } else if (p.rarity === 'hero') {
    card.classList.add('rumble');
    sound('knock', { n: 2 });
    await drv.pause(650);
    card.classList.remove('rumble');
    card.classList.add('flipped');
    sound('flip', { rarity: 'hero' });
    fx.burst(card, RARITY_BURST.hero, 30, 170);
  } else {
    card.classList.add('flipped');
    sound('flip', { rarity: p.rarity });
    if (p.rarity === 'veteran') fx.burst(card, RARITY_BURST.veteran, 22, 130);
  }
  await drv.pause(500);
  if (p.golden) {
    banner(card, '…wait.', 'wait');
    await drv.pause(900);
    card.classList.add('goldened');
    sound('golden');
    fx.burst(card, ['#ffd34d', '#fff1a8', '#ffffff'], 36, 200);
    banner(card, 'GOLDEN! ×1.2 power', 'golden');
    await drv.pause(700);
  }
  if (p.siblingOf != null) {
    const sib = meta.person(p.siblingOf);
    if (sib) {
      banner(card, `${icon('heart')}${esc(siblingLine(p, sib))}`, 'sib');
      sound('cheer');
      await drv.pause(700);
    }
  }
  if (line) banner(card, line, 'line');
  return card;
}

function banner(card, html, cls) {
  const b = card.querySelector('.nc-banner');
  b.className = `nc-banner show ${cls}`;
  b.innerHTML = html;
}

export class ChestOpening {
  constructor(root, { meta, hud, park, fx, sound, haptic }) {
    Object.assign(this, { root, meta, hud, park, fx, sound, haptic });
  }

  /** Play the opening of `res` (from meta.openChest). Resolves with { next } from the summary. */
  async play(res) {
    const { meta, fx, sound } = this;
    const kind = res.kind;
    const opened = meta.s.stats.chests.crate + meta.s.stats.chests.vault;
    const el = document.createElement('div');
    el.className = `opening k-${kind} g-0`;
    const crowd = meta.s.people
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);
    el.innerHTML =
      `<div class="op-dim"></div><div class="op-rays"></div>` +
      `<div class="op-crowd l">${crowd.filter((_, i) => i % 2 === 0).map((p) => `<span class="cfig">${figureSvg(p, { pose: 'idle' })}</span>`).join('')}</div>` +
      `<div class="op-crowd r">${crowd.filter((_, i) => i % 2 === 1).map((p) => `<span class="cfig">${figureSvg(p, { pose: 'idle' })}</span>`).join('')}</div>` +
      `<div class="op-title">${esc(CHESTS[kind].name)}<small>Lv ${res.level}</small></div>` +
      `<div class="op-banner"></div>` +
      `<div class="op-chest"><div class="op-chest-in">${chestSvg(kind, { grade: 0, open: false, glow: 0.2 })}</div><div class="op-knocks">${'<i></i>'.repeat(3)}</div></div>` +
      `<div class="op-loot"></div><div class="op-faces"></div><div class="op-stage"></div>` +
      `<div class="op-hint"></div>` +
      (opened >= 3 ? `<button class="op-skip" type="button" data-skip>Skip ▸▸</button>` : '');
    this.root.appendChild(el);
    this.root.classList.add('on');
    this.hud.freeze(['coins', 'gems']);
    this.hud.shown.coins = meta.s.coins - res.coins - this._laterCoins(res);
    this.hud.shown.gems = meta.s.gems - res.gems;
    const drv = driver(el);
    const q = (s) => el.querySelector(s);
    const hint = (t) => (q('.op-hint').textContent = t);
    const chestIn = q('.op-chest-in');
    const setChest = (grade, open, glow) => (chestIn.innerHTML = chestSvg(kind, { grade, open, glow }));
    requestAnimationFrame(() => el.classList.add('in'));
    sound('open');
    await drv.pause(450);

    // 1. Three knocks.
    let grade = 0;
    const dots = el.querySelectorAll('.op-knocks i');
    for (let i = 0; i < res.knocks.length; i++) {
      hint(i === 0 ? 'Tap to knock!' : 'Knock again!');
      await drv.tap();
      hint('');
      dots[i].classList.add('on');
      sound('knock', { n: i + 1 });
      this.haptic(18 + i * 8);
      chestIn.classList.remove('knock');
      void chestIn.offsetWidth;
      chestIn.classList.add('knock');
      if (res.knocks[i]) {
        grade++;
        dots[i].classList.add('glow');
        await drv.pause(160);
        setChest(grade, false, 0.5 + 0.15 * i);
        el.className = el.className.replace(/\bg-\d\b/, `g-${grade}`);
        const G = GRADES[grade];
        const b = q('.op-banner');
        b.className = `op-banner show g${grade}`;
        b.innerHTML = `<b>${G.banner}</b><span>${esc(G.line)}</span>`;
        sound('glow', { grade });
        this.haptic(40);
        fx.burst(chestIn, GRADE_COLORS[grade], 28 + grade * 8, 150 + grade * 30);
        el.classList.add(`cheer${grade}`);
        for (const f of el.querySelectorAll('.cfig')) f.classList.add('hop');
        await drv.pause(900);
      } else {
        setChest(grade, false, 0.25 + 0.2 * (i + 1));
        await drv.pause(260);
      }
    }
    hint('Tap to open!');
    await drv.tap();
    hint('');

    // 2. The lid bursts.
    q('.op-banner').classList.remove('show');
    setChest(grade, true, 1);
    chestIn.classList.add('burst');
    el.classList.add('popped');
    sound('burst');
    this.haptic(45);
    fx.burst(chestIn, GRADE_COLORS[grade] || ['#ffd36b', '#fff1a8', '#ffffff'], 34, 200);
    for (const f of el.querySelectorAll('.cfig')) f.innerHTML = f.innerHTML; // restart anims
    await drv.pause(420);

    // 3. Coins, then gems, roll into the wallet.
    const loot = q('.op-loot');
    if (res.coins > 0) await this._count(loot, 'coins', res.coins, chestIn, drv);
    if (res.gems > 0) await this._count(loot, 'gems', res.gems, chestIn, drv);

    // 4. Badge stacks fly onto the squad's faces.
    const facesEl = q('.op-faces');
    const faceOf = (id) => {
      let f = facesEl.querySelector(`.opf[data-id="${id}"]`);
      if (!f) {
        const p = meta.person(id);
        if (!p) return null;
        f = document.createElement('div');
        f.className = 'opf';
        f.dataset.id = id;
        f.innerHTML = `${face(p, { size: 64 })}<b>${name(p)}</b><div class="bbar"><i></i><span></span></div><em class="plus"></em>`;
        facesEl.appendChild(f);
      }
      return f;
    };
    const setBar = (f, st) => {
      const bar = f.querySelector('.bbar');
      const i = bar.querySelector('i');
      const span = bar.querySelector('span');
      if (st.need === null) {
        i.style.transform = 'scaleX(1)';
        span.textContent = 'MAX';
        return;
      }
      i.style.transform = `scaleX(${Math.min(1, st.v / st.need).toFixed(3)})`;
      span.textContent = `${st.v} / ${st.need}`;
      bar.classList.toggle('full', st.v >= st.need);
    };
    if (res.stacks.length) {
      for (const st of res.stacks) setBar(faceOf(st.id), { v: st.before, need: st.need });
      facesEl.classList.add('show');
      await drv.pause(300);
      for (const st of res.stacks) await this._stack(faceOf(st.id), st, chestIn, drv, setBar);
      await drv.pause(250);
    }

    // 5. Newcomers.
    const stage = q('.op-stage');
    const finisher = res.finisher;
    const placedNames = [];
    for (const nc of res.newcomers) {
      facesEl.classList.add('dim');
      stage.innerHTML = '';
      const p = nc.person;
      const card = await revealNewcomer(stage, p, { meta, fx, sound, drv });
      this.fx.stamp(card, 'MOVES IN!', 'in');
      sound('moveIn');
      placedNames.push({ p });
      this.park.arrive(p.id);
      await drv.pause(900);
      card.classList.add('away');
      await drv.pause(250);
    }
    stage.innerHTML = '';
    facesEl.classList.remove('dim');

    // 6. The Vault's finisher.
    if (finisher && typeof finisher === 'object' && finisher.id != null) {
      const p = meta.person(finisher.id);
      const b = q('.op-banner');
      b.className = 'op-banner show fin';
      b.innerHTML = `<b>FINISHER</b><span>→ ${p ? name(p) : ''}</span>`;
      sound('badge');
      await drv.pause(500);
      const f = faceOf(finisher.id);
      facesEl.classList.add('show');
      await this._stack(f, finisher, chestIn, drv, setBar, true);
      await drv.pause(600);
      b.classList.remove('show');
    }

    // 7. Summary.
    this.hud.thaw(['coins', 'gems']);
    const best = [...meta.squadPeople(), ...meta.s.people].find((p) => meta.canLevel(p));
    const sum = document.createElement('div');
    sum.className = 'op-sum';
    const totalBadges = res.stacks.reduce((a, s) => a + s.n, 0) + (finisher && finisher.n ? finisher.n : 0);
    sum.innerHTML =
      `<div class="kicker">${esc(CHESTS[kind].name)}${grade ? ` · <span class="g${grade}">${GRADES[grade].name}</span>` : ''}</div>` +
      `<div class="sum-row">${coinAmt(res.coins)}${res.gems ? gemAmt(res.gems) : ''}<span class="amt">${icon('badge')}<b>${totalBadges}</b></span></div>` +
      (placedNames.length ? `<div class="sum-new">${placedNames.map((x) => `<span class="sn">${face(x.p, { size: 44 })}<b>${name(x.p)}</b><small>moved in</small></span>`).join('')}</div>` : '') +
      `<div class="btns">${best ? `<button class="btn green big glow" type="button" data-act="next" data-id="${best.id}">${icon('up')}LEVEL UP ${name(best)}</button><button class="btn" type="button" data-act="ok">Later</button>` : `<button class="btn yellow big" type="button" data-act="ok">OK</button>`}</div>`;
    el.appendChild(sum);
    q('.op-skip') && q('.op-skip').remove();
    requestAnimationFrame(() => sum.classList.add('in'));
    const choice = await new Promise((resolve) => {
      sum.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        resolve(b.dataset.act === 'next' ? { next: 'level', id: Number(b.dataset.id) } : { next: null });
      });
    });
    el.classList.remove('in');
    el.classList.add('out');
    await wait(260);
    el.remove();
    if (!this.root.children.length) this.root.classList.remove('on');
    return choice;
  }

  /** Coins a farewell or finisher may pay later in the show (maxed people). */
  _laterCoins(res) {
    let c = 0;
    for (const s of res.stacks) c += s.coins || 0;
    if (res.finisher && typeof res.finisher === 'object' && res.finisher.coins) c += res.finisher.coins;
    return c;
  }

  async _count(loot, k, total, from, drv) {
    const row = document.createElement('div');
    row.className = `ol ${k}`;
    row.innerHTML = `${k === 'coins' ? icon('coin') : icon('gem')}<b>+0</b>`;
    loot.appendChild(row);
    const b = row.querySelector('b');
    const n = Math.min(14, Math.max(4, Math.round(Math.sqrt(total) * 1.4)));
    const per = total / n;
    let shown = 0;
    let landed = 0;
    this.sound(k === 'coins' ? 'coin' : 'gem', { pitch: 0 });
    const target = this.hud.target(k);
    await new Promise((resolve) => {
      this.fx.fly({
        from,
        to: target,
        html: k === 'coins' ? coinSvg() : gemSvg(),
        count: n,
        stagger: drv.fast ? 10 : 55,
        duration: drv.fast ? 300 : 560,
        onEach: () => {
          landed++;
          const v = landed === n ? total : Math.round(per * landed);
          this.hud.nudge(k, v - shown);
          shown = v;
          b.textContent = `+${fmtNum(v)}`;
          this.sound(k === 'coins' ? 'coin' : 'gem', { pitch: landed / n });
          if (k === 'coins' && landed % 3 === 0) this.haptic(6);
          this.hud.bump(k);
        },
        onDone: resolve,
      });
    });
    await drv.pause(200);
  }

  async _stack(f, st, from, drv, setBar, finisher = false) {
    if (!f || !st) return;
    const p = this.meta.person(st.id);
    const plus = f.querySelector('.plus');
    plus.textContent = st.maxed ? `+${st.coins} ${'coins'}` : `+${st.n}`;
    plus.className = `plus show${finisher ? ' fin' : ''}`;
    this.sound('badge');
    await new Promise((resolve) => {
      this.fx.fly({ from, to: f.querySelector('.face'), html: badgeTokenSvg(p ? p.cls : 'brawler'), count: Math.min(6, Math.max(2, Math.round(st.n / 3))), stagger: drv.fast ? 10 : 45, duration: drv.fast ? 250 : 480, size: 22, onDone: resolve });
    });
    setBar(f, { v: st.after, need: st.need });
    this.fx.pop(f.querySelector('.face'));
    if (st.ready && !(st.before >= st.need)) {
      this.fx.stamp(f, 'READY!', 'ready');
      this.sound('ready');
      this.haptic(25);
      await drv.pause(380);
    } else await drv.pause(220);
  }
}
