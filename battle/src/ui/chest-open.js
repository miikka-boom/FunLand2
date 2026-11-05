// The chest opening: a full-screen show. The chest drops in, rattles, the lid
// pops with a burst of light, gold and Jellybeans count up, then every card
// stack flies out one at a time (tap to advance), then a summary. The loot is
// paid (and saved) the moment the chest is tapped, so closing early or the
// app dying mid-show loses nothing. Also the info sheet of a chest that is
// still refilling (honest contents and odds).

import { h, icon, fmt, fmtTime, clamp, canvas, cardCanvas, amountChip, gainTile, CARDS, RARITIES } from './hub-kit.js';
import { drawChest } from '../render/chests.js';
import { openChest, chestState, chestOdds } from '../meta/chests.js';

const NAMES = { small: 'Small Chest', big: 'Big Chest' };
const ADVANCE_MS = 330; // a double tap shows the next card, not the one after it

export function createChestOpener(H) {
  let S = null; // the show in progress

  function open(kind) {
    const res = openChest(H.P, kind, H.now());
    if (!res) return false;
    H.persist();
    const big = kind === 'big';
    const Hh = window.innerHeight || 390;
    const Ww = window.innerWidth || 844;
    const cw = Math.round(clamp(Math.min(Hh * 0.58, Ww * 0.34), 150, 380));
    const cv = canvas(cw, Math.round(cw * 0.8), 'hb-co-cv');
    const left = h('b', { class: 'hb-co-left hidden' }, '');
    const loot = h('div', { class: 'hb-co-loot' });
    const stage = h('div', { class: 'hb-co-stage' });
    const hint = h('div', { class: 'hb-co-hint' }, 'Tap!');
    const skip = h('button', { class: 'hb-co-skip', type: 'button', on: { click: (e) => (e.stopPropagation(), !H.guarded() && summary()) } }, 'Skip ▸▸');
    const el = h(
      'div',
      { class: `hb-co hb-full k-${kind} s-drop`, on: { click: () => advance() } },
      h('span', { class: 'hb-rays big' }),
      h('div', { class: 'hb-co-title' }, NAMES[kind] || 'Chest'),
      h('div', { class: 'hb-co-chest' }, cv, left),
      loot,
      stage,
      h('div', { class: 'hb-co-flash' }),
      hint,
      skip,
    );
    S = { kind, big, res, el, cv, left, loot, stage, hint, skip, stageName: 'drop', t: 0, st: 0, shake: 0, open: 0, glow: 0, card: -1, lastAdv: performance.now(), lootDur: 0, reveal: null };
    S.entry = H.openModal(el, { backdrop: false, onClose: finish, refresh: null });
    draw();
    return true;
  }

  function enter(name) {
    if (!S) return;
    S.stageName = name;
    S.st = 0;
    S.el.className = S.el.className.replace(/\bs-\w+/, 's-' + name);
    if (name === 'shake') {
      H.sfx('chestShake', { big: S.big });
      S.hint.textContent = 'Tap to open!';
    } else if (name === 'pop') {
      H.sfx('chestOpen', { big: S.big });
      H.haptic(35);
      H.pop(S.el.querySelector('.hb-co-flash'), 'go');
      S.hint.textContent = '';
    } else if (name === 'loot') {
      const { gold, beans } = S.res;
      let delay = 0;
      if (gold > 0) {
        const chip = amountChip('gold', 0, 'big hb-co-amt');
        S.loot.append(chip);
        const b = chip.querySelector('b');
        H.tween('co-gold', 0, gold, 0.8, (v) => (b.textContent = '+' + fmt(v)), { step: (k) => H.sfx('coins', { pitch: k }) });
        delay = 0.45;
      }
      if (beans > 0) {
        const chip = amountChip('beans', 0, 'big hb-co-amt');
        chip.style.animationDelay = delay + 's';
        S.loot.append(chip);
        const b = chip.querySelector('b');
        H.tween('co-beans', 0, beans, 0.6, (v) => (b.textContent = '+' + fmt(v)), { delay });
        delay += 0.4;
      }
      S.lootDur = delay + 0.8;
      S.left.textContent = String(S.res.cards.length);
      S.left.classList.remove('hidden');
    }
  }

  /** A tap anywhere: hurry the chest, or show the next card. */
  function advance() {
    if (!S || H.guarded()) return;
    const t = performance.now();
    if (t - S.lastAdv < ADVANCE_MS) return;
    S.lastAdv = t;
    if (S.stageName === 'drop' || S.stageName === 'shake') enter('pop');
    else if (S.stageName === 'loot') {
      if (S.st > 0.35) nextCard();
    } else if (S.stageName === 'cards') nextCard();
  }

  function nextCard() {
    const list = S.res.cards;
    S.card++;
    if (S.card >= list.length) return summary();
    if (S.stageName !== 'cards') enter('cards');
    const c = list[S.card];
    const rar = RARITIES[c.rarity] || RARITIES.common;
    const card = CARDS[c.id];
    if (S.reveal) {
      const old = S.reveal;
      old.classList.add('out');
      setTimeout(() => old.remove(), 320);
    }
    const Hh = window.innerHeight || 390;
    const w = Math.round(clamp(Hh * 0.4, 110, 230));
    const fill = h('i', {});
    const need = c.need || 0;
    const before = c.isNew ? 0 : c.countBefore;
    const barTxt = h('span', {}, need ? `${fmt(before)} / ${fmt(need)}` : 'Max level');
    fill.style.transform = `scaleX(${need ? clamp(before / need, 0, 1) : 1})`;
    const info = h(
      'div',
      { class: 'hb-co-info' },
      h('span', { class: `hb-rarity r-${c.rarity}` }, rar.name),
      h('h2', {}, card ? card.name : c.id),
      h('b', { class: 'hb-co-n' }, '×' + fmt(c.n)),
      c.isNew ? h('span', { class: 'hb-new big' }, 'NEW CARD!') : null,
      h('div', { class: 'hb-co-prog' }, h('small', {}, `Level ${c.level}`), h('span', { class: 'hb-bar' + (c.canUpgradeAfter ? ' full' : '') }, fill, barTxt)),
      // (copies AND gold: copies alone say how much gold is still missing)
      c.canUpgrade ? h('span', { class: 'hb-upready big' }, icon('up'), 'Upgrade ready!') : c.canUpgradeAfter && c.goldNeed > 0 ? h('span', { class: 'hb-upready big short' }, `Copies ready · needs ${fmt(c.goldNeed)} more gold`) : null,
    );
    const r = h('div', { class: `hb-co-reveal r-${c.rarity}` }, h('div', { class: 'hb-co-cardwrap' }, h('span', { class: 'hb-co-glow' }), cardCanvas(c.id, w, { level: c.level, name: true })), info);
    S.stage.append(r);
    S.reveal = r;
    const leftN = list.length - S.card - 1;
    S.left.textContent = String(leftN);
    S.left.classList.toggle('hidden', leftN <= 0);
    H.pop(S.left);
    S.hint.textContent = leftN > 0 ? 'Tap for the next card' : 'Tap to finish';
    H.sfx('cardReveal', { rarity: c.rarity });
    if (c.rarity === 'epic') {
      H.haptic(40);
      H.pop(S.el.querySelector('.hb-co-flash'), 'go');
    }
    S.shake = c.rarity === 'common' ? 0.25 : 0.6;
    // The copies bar fills once the card has landed
    setTimeout(() => {
      if (!r.isConnected) return;
      fill.style.transform = `scaleX(${need ? clamp(c.count / need, 0, 1) : 1})`;
      barTxt.textContent = need ? `${fmt(c.count)} / ${fmt(need)}` : 'Max level';
    }, 520);
  }

  function summary() {
    if (!S || S.stageName === 'summary') return;
    if (S.stageName === 'drop' || S.stageName === 'shake') H.sfx('chestOpen', { big: S.big });
    if (!S.lootDur) {
      // skipped before the loot showed: the summary has it all anyway
      S.lootDur = 1;
    }
    S.card = S.res.cards.length;
    enter('summary');
    S.open = 1;
    S.hint.textContent = '';
    S.skip.remove();
    if (S.reveal) S.reveal.remove();
    const w = Math.round(clamp((window.innerHeight || 390) * 0.2, 54, 104));
    const g = S.res;
    const box = h('div', { class: 'hb-rewards' });
    if (g.gold) box.append(amountChip('gold', g.gold, 'big'));
    if (g.beans) box.append(amountChip('beans', g.beans, 'big'));
    g.cards.forEach((c, k) => {
      const t = gainTile(c, w);
      t.style.animationDelay = (0.08 * k).toFixed(2) + 's';
      box.append(t);
    });
    const ups = g.cards.filter((c) => c.canUpgrade).length;
    const short = g.cards.filter((c) => c.canUpgradeAfter && !c.canUpgrade).length;
    const done = h('button', { class: 'hb-btn primary big', type: 'button', on: { click: (e) => (e.stopPropagation(), !H.guarded() && (H.sfx('ui'), H.closeTop())) } }, 'Collect');
    S.stage.append(
      h(
        'div',
        { class: 'hb-co-sum' },
        h('div', { class: 'hb-kicker light' }, (NAMES[S.kind] || 'Chest').toUpperCase()),
        h('h2', {}, 'You got'),
        box,
        ups
          ? h('p', { class: 'hb-co-tip' }, ups > 1 ? `${ups} cards are ready to upgrade: visit the Cards tab!` : 'A card is ready to upgrade: visit the Cards tab!')
          : short
            ? h('p', { class: 'hb-co-tip' }, short > 1 ? `${short} cards have the copies for an upgrade: they need more gold.` : 'A card has the copies for an upgrade: it needs more gold.')
            : null,
        h('div', { class: 'hb-row' }, done),
      ),
    );
    H.changed(); // the Collect button appeared under the finger
  }

  function finish() {
    S = null;
    if ((H.P.tutorial | 0) === 1) H.setTutorial(2);
    H.refreshChrome();
  }

  function draw() {
    if (!S) return;
    drawChest(S.cv, S.kind, { t: S.t, open: S.open, shake: S.shake, glow: S.glow, ready: false });
  }

  function update(dt) {
    if (!S) return;
    S.t += dt;
    S.st += dt;
    switch (S.stageName) {
      case 'drop':
        S.shake = 0;
        if (S.st >= 0.55) enter('shake');
        break;
      case 'shake':
        S.shake = Math.min(1, 0.2 + S.st / 0.9);
        if (S.st >= 1.0) enter('pop');
        break;
      case 'pop':
        S.shake = 0;
        S.open = Math.min(1, S.st / 0.26);
        S.glow = Math.min(1, S.st / 0.12);
        if (S.st >= 0.45) enter('loot');
        break;
      case 'loot':
        S.glow = 0.8 + 0.2 * Math.sin(S.t * 3);
        if (S.st >= S.lootDur + 0.7) nextCard();
        break;
      default:
        S.glow = S.stageName === 'summary' ? 0.5 : 0.65 + 0.15 * Math.sin(S.t * 3);
        S.shake = Math.max(0, S.shake - dt * 1.6);
    }
    draw();
  }

  /** The info sheet for a chest (tapped while it refills). */
  function info(kind) {
    const o = chestOdds(H.P, kind);
    if (!o) return;
    const cv = canvas(96, 78, 'hb-info-chest');
    drawChest(cv, kind, { t: 0.5 });
    const when = h('b', {}, '');
    let timer = 0;
    const tick = () => {
      if (timer && !when.isConnected) return clearInterval(timer); // the hub hid with the sheet up
      const st = chestState(H.P, kind, H.now());
      when.textContent = st.ready ? 'Ready now!' : `Ready in ${fmtTime(st.msLeft)}`;
    };
    tick();
    timer = setInterval(tick, 1000);
    const pct = (q) => (q >= 0.995 ? 'always' : q < 0.005 ? '—' : `${Math.round(q * 100)}%`);
    const hours = Math.round(o.period / 3600000);
    const rows = [
      h('li', {}, h('i', { class: 'hb-coin' }), `${fmt(o.gold[0])}–${fmt(o.gold[1])} gold`),
      h('li', {}, icon('cards'), `about ${fmt(o.cards)} cards in ${o.stacks} stacks`),
    ];
    if (o.beans) rows.push(h('li', {}, h('i', { class: 'hb-bean' }), `${fmt(o.beans)} Jellybeans`));
    if (o.pool.rare.length) rows.push(h('li', { class: 'r-rare' }, h('i', { class: 'hb-gem r-rare' }), `Rare stack: ${pct(o.odds.rare)}`));
    if (o.pool.epic.length && o.odds.epic > 0) rows.push(h('li', { class: 'r-epic' }, h('i', { class: 'hb-gem r-epic' }), `Epic stack: ${pct(o.odds.epic)}`));
    const modal = H.cardModal({
      kicker: 'FREE, ALWAYS',
      title: NAMES[kind],
      body: [
        h('div', { class: 'hb-info-top' }, cv, h('div', {}, h('p', { class: 'hb-when' }, icon('clock'), when), h('p', {}, `Refills every ${hours} hours. It never needs a slot and can't be sped up: just come back later.`))),
        h('ul', { class: 'hb-odds' }, ...rows),
        h('p', { class: 'hb-fine' }, 'Only cards you have unlocked can drop. Chests grow in higher arenas.'),
      ],
      buttons: [H.btn('OK', () => H.closeTop(), 'primary', null)],
      cls: 'hb-chest-info',
    });
    H.openModal(modal, { onClose: () => clearInterval(timer) });
  }

  return {
    open,
    info,
    update,
    active: () => !!S,
    /** The hub hid mid-show: forget it (the loot is already paid). */
    stop() {
      if (S) finish();
    },
  };
}
