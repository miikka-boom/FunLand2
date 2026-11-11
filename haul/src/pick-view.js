// Long Haul: the haul. Nine crates on a pallet and one pick for everyone who
// came back standing. A tap opens a crate: the lid flies, the crate turns out
// to be wood, steel or gold, and what was inside is yours at once. When the
// picks are used up the crates left behind show what they held, and it's back
// to camp or straight out again.

import { CAST, AREAS, GRID } from './config.js';
import { crateSvg, cansSvg, radioSvg, eyesSvg } from './crate-art.js';
import { icon } from './icons.js';
import { fmtNum, fmtLeft } from './format.js';
import { face, tokenBar, esc, wait, nextFrame } from './ui.js';
import { buzz } from './fx.js';

const RADIO_LINES = ['A RADIO!', 'A RADIO!', 'ANOTHER RADIO!'];

export class PickView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { game, sfx, fx, tuning, save }
  }

  /**
   * Show the haul in the save and let the player pick. `res` is the run that
   * brought it (null when picking up where a reload left off).
   * Resolves { next: 'camp' | 'again', open?: id } once every pick is used.
   */
  async show(res = null) {
    const { game, sfx, fx, tuning } = this.ctx;
    const s = game.s;
    const h = s.haul;
    const root = this.root;
    const squad = res ? res.squad : s.squad;
    const standing = res ? res.standing : squad.map((_, i) => i < h.picks);
    const area = AREAS[h.area];
    const roadBefore = res ? res.road.before : s.stars - h.picks;
    const cell = (i) =>
      `<button class="crate" type="button" data-i="${i}" aria-label="Crate ${i + 1}">` + crateSvg() + `<span class="loot"></span></button>`;
    root.innerHTML =
      `<div class="pick">` +
      `<div class="pick-left">` +
      `<h2>THE HAUL</h2>` +
      `<p class="pick-how">Everyone still standing carries <b>one crate</b> home.</p>` +
      `<div class="carriers">${squad
        .map((id, i) => `<span class="carrier${standing[i] ? '' : ' down'}" data-i="${i}">${face(id, { mood: standing[i] ? 'happy' : 'ko' })}<i>${standing[i] ? icon('crate') : 'DOWN'}</i></span>`)
        .join('')}</div>` +
      `<div class="pick-count"></div>` +
      `</div>` +
      `<div class="pick-mid"><div class="pallet">${Array.from({ length: GRID }, (_, i) => cell(i)).join('')}</div></div>` +
      `<div class="pick-right">` +
      `<span class="chip wallet pick-wallet">${icon('supplies')}<b>${fmtNum(s.supplies)}</b></span>` +
      `<div class="got"><h3>Coming home</h3><ul></ul></div>` +
      `<div class="pick-road"></div>` +
      `<div class="pick-btns" hidden><button class="btn plain" type="button" data-next="camp">CAMP</button><button class="btn play small" type="button" data-next="again">${icon('play')}PLAY AGAIN</button></div>` +
      `</div>` +
      `</div>`;
    root.classList.add('open');
    const el = root.firstChild;
    const crates = [...el.querySelectorAll('.crate')];
    const count = el.querySelector('.pick-count');
    const list = el.querySelector('.got ul');
    const walletB = el.querySelector('.pick-wallet b');
    let shown = s.supplies;
    const carriers = [...el.querySelectorAll('.carrier:not(.down)')];

    const setCount = () => {
      const left = h.picks - h.picked.length;
      count.innerHTML = left > 0 ? `<b>PICK ${left}</b><span>${left === h.picks ? 'Tap a crate' : 'more'}</span>` : `<b class="done">${icon('check')}ALL PICKED</b>`;
      el.classList.toggle('picking', left > 0);
      carriers.forEach((c, k) => c.classList.toggle('used', k < h.picked.length));
    };

    // The road: the stars this run was worth.
    const road = el.querySelector('.pick-road');
    const drawRoad = () => {
      const r = game.road();
      const crossed = res && res.road.areaAfter > res.road.areaBefore;
      const toName = r.next ? r.next.name : 'the ferry';
      road.innerHTML =
        `<span class="pr-stars">${icon('star')}<b>+${h.picks}</b></span>` +
        `<span class="pr-bar"><span class="bar"><i style="width:${Math.round(r.t * 100)}%"></i></span><small>${crossed ? `<em>NEW STOP: ${esc(AREAS[r.area].name)}!</em>` : r.left > 0 ? `${r.left} to ${esc(toName)}` : 'Pier 9'}</small></span>`;
    };
    drawRoad();
    void roadBefore;

    const lootHtml = (c) => {
      if (c.kind === 'supplies') return `${cansSvg(c.gold ? 'gold' : c.tier)}<b class="loot-n">+${fmtNum(c.amount)}</b>`;
      if (c.kind === 'tokens') return `<span class="tokface">${face(c.who)}</span><b class="loot-n">+${c.amount}</b>`;
      return `${radioSvg()}<b class="loot-n radio">RADIO!</b>`;
    };
    const tierOf = (c) => (c.kind === 'radio' || c.gold ? 'gold' : c.tier);

    /** Draw a crate as already opened (a reload, or the ones left behind). */
    const showOpen = (i, c, peek = false) => {
      const b = crates[i];
      b.classList.add('open', `t-${tierOf(c)}`, peek ? 'peek' : 'mine');
      b.querySelector('.loot').innerHTML = lootHtml(c);
      b.disabled = true;
    };
    for (const i of h.picked) showOpen(i, h.crates[i]);

    // Two little eyes by the special crate, looking at it.
    const eyes = () => {
      if (h.eyes == null || h.picked.includes(h.eyes)) return;
      const b = crates[h.eyes];
      const e = document.createElement('span');
      e.className = 'eyes-spot';
      e.innerHTML = eyesSvg(1, -1);
      b.appendChild(e);
      setTimeout(() => sfx.play('eyes'), 900);
    };
    eyes();
    setCount();

    // Crates thump down one after another.
    if (!h.picked.length) {
      crates.forEach((b, i) => {
        b.style.setProperty('--drop', `${i * 45}ms`);
        b.classList.add('dropping');
        setTimeout(() => sfx.play('crateTap'), i * 45 + 160);
      });
      setTimeout(() => crates.forEach((b) => b.classList.remove('dropping')), 900);
    }

    const addGot = (html, cls = '') => {
      const li = document.createElement('li');
      li.className = cls;
      li.innerHTML = html;
      list.appendChild(li);
      return li;
    };
    for (const i of h.picked) {
      const c = h.crates[i];
      if (c.kind === 'supplies') addGot(`${icon('supplies')}<b>+${fmtNum(c.amount)}</b><span>supplies</span>`);
      else if (c.kind === 'tokens') addGot(`${face(c.who, { cls: 'tiny' })}<b>+${c.amount}</b><span>${esc(CAST[c.who].name)}</span>`);
      else addGot(`${icon('radio')}<b>Radio!</b><span></span>`, 'radio');
    }

    let busy = false;
    const open = async (i) => {
      if (busy || h.picked.includes(i) || h.picked.length >= h.picks) return;
      busy = true;
      const out = game.pick(i);
      if (!out.ok) {
        busy = false;
        return;
      }
      this.ctx.save();
      const c = out.crate;
      const b = crates[i];
      const tier = tierOf(c);
      const spot = b.querySelector('.eyes-spot');
      if (spot) spot.classList.add('gone');
      b.disabled = true;
      b.classList.add('shake');
      sfx.play('crateTap');
      buzz(10, tuning.haptics);
      await wait(170);
      b.classList.remove('shake');
      b.classList.add('open', 'mine', 'fresh', `t-${tier}`);
      b.querySelector('.loot').innerHTML = lootHtml(c);
      sfx.play('crateOpen', { tier });
      fx.ring(b, tier === 'gold' ? '#ffc531' : tier === 'steel' ? '#8fc4ff' : '#f4e3c0', tier === 'gold' ? 220 : 150);
      if (tier === 'gold') {
        fx.burst(b, { color: '#ffd36b', n: 16, r: 80 });
        fx.shake(el, 4, 220);
        buzz([15, 40, 25], tuning.haptics);
      } else if (tier === 'steel') fx.burst(b, { color: '#bfe0ff', n: 9, r: 54, size: 7 });
      setCount();

      if (c.kind === 'supplies') {
        const li = addGot(`${icon('supplies')}<b>+${fmtNum(c.amount)}</b><span>supplies</span>`, 'new');
        const n = Math.min(12, Math.max(3, Math.round(c.amount / (8 * area.loot))));
        const each = c.amount / n;
        let landed = 0;
        fx.fly({
          from: b,
          to: el.querySelector('.pick-wallet'),
          html: icon('supplies'),
          count: n,
          size: 24,
          onEach: () => {
            landed++;
            shown = landed === n ? s.supplies : Math.round(shown + each);
            walletB.textContent = fmtNum(Math.min(shown, s.supplies));
            sfx.play('supplies', { pitch: landed / n });
            fx.pop(el.querySelector('.pick-wallet'), 1.12, 160);
          },
        });
        void li;
      } else if (c.kind === 'tokens') {
        const info = game.levelInfo(c.who);
        const tail = out.refund ? `<em class="ready">+${fmtNum(out.refund)} ${icon('supplies')}</em>` : info.ready ? `<em class="ready">READY</em>` : tokenBar(info, { compact: true });
        const li = addGot(`${face(c.who, { cls: 'tiny' })}<b>+${c.amount}</b><span>${esc(CAST[c.who].name)}</span>${tail}`, 'new');
        fx.fly({ from: b, to: li, html: icon('token'), count: Math.min(6, c.amount), size: 22, stagger: 70, onEach: (k) => sfx.play('token', { pitch: (k + 1) / Math.min(6, c.amount) }) });
        if (info.ready) setTimeout(() => sfx.play('ready'), 520);
        if (out.refund) {
          shown = s.supplies;
          walletB.textContent = fmtNum(shown);
        }
      } else {
        sfx.play('radioFound');
        const r = out.radio;
        const first = s.rack.length === 1;
        addGot(`${icon('radio')}<b>Radio!</b><span>${first ? 'calling' : 'in line'}</span><em class="when">${fmtLeft(r.readyAt - game.now())}</em>`, 'new radio');
        fx.float(b, RADIO_LINES[Math.min(2, s.rack.length - 1)], 'big gold');
        fx.confetti({ n: 26, from: b });
      }
      await wait(c.kind === 'radio' ? 620 : 380);
      b.classList.remove('fresh');
      busy = false;
      if (h.picked.length >= h.picks) finish();
    };

    const result = new Promise((resolve) => {
      this._resolve = resolve;
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.crate');
      if (b && !b.disabled) return open(Number(b.dataset.i));
      const n = e.target.closest('[data-next]');
      if (n) {
        sfx.play('tap');
        this._resolve({ next: n.dataset.next, open: n.dataset.open || null });
      }
    });

    const finish = async () => {
      setCount();
      await wait(350);
      // What was in the others.
      if (tuning.peek) {
        const rest = [];
        for (let i = 0; i < GRID; i++) if (!h.picked.includes(i)) rest.push(i);
        for (const i of rest) {
          showOpen(i, h.crates[i], true);
          await wait(55);
        }
        await wait(250);
      } else for (const b of crates) if (!b.classList.contains('open')) b.classList.add('left');
      // Someone can level up: offer the short way there.
      const ready = game.readyList();
      const btns = el.querySelector('.pick-btns');
      if (ready.length) {
        const id = ready[0];
        const up = document.createElement('button');
        up.className = 'btn up small';
        up.type = 'button';
        up.dataset.next = 'camp';
        up.dataset.open = id;
        up.innerHTML = `${icon('up')}LEVEL UP ${esc(CAST[id].name.toUpperCase())}`;
        btns.replaceChild(up, btns.querySelector('[data-next="camp"]'));
      }
      btns.hidden = false;
      await nextFrame();
      btns.classList.add('in');
    };
    if (h.picked.length >= h.picks) finish();

    const answer = await result;
    return answer;
  }

  close() {
    this.root.classList.remove('open');
    this.root.innerHTML = '';
  }
}
