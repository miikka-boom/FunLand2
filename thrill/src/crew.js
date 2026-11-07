// The Crew screen. Left: three big slots, the next threat, the odds bar, BEST
// and GO. Right: everyone in the park, counters first, then by power, with
// COUNTER tags and READY glows. Tap someone to put them in the selected slot
// (or take them out if they're already in); tap a slot to select it. The odds
// update live.

import { CLASSES, THREATS, SQUAD_SIZE, WAVES } from './config.js';
import { isCounter } from './raid.js';
import { face, name, classTag, threatChip, pw, badgeBar } from './kit.js';
import { icon } from './icons.js';
import { esc, moreHint, wait } from './ui.js';

export class Crew {
  constructor(root, { meta, sound, fx, onCard, onGo, onChange }) {
    Object.assign(this, { root, meta, sound, fx, onCard, onGo, onChange });
    this.el = null;
    this.slot = 0;
  }

  get isOpen() {
    return !!this.el;
  }

  open() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'crew';
    this.root.appendChild(el);
    this.root.classList.add('on');
    this.el = el;
    // Select the weakest non-counter slot by default (the likely swap).
    const m = this.meta;
    const sq = m.squadPeople();
    const pre = m.raidPreview();
    let pick = sq.length < SQUAD_SIZE ? sq.length : 0;
    if (sq.length >= SQUAD_SIZE) {
      let worst = Infinity;
      sq.forEach((p, i) => {
        const mm = pre.members.find((x) => x.id === p.id);
        const v = mm ? mm.power : 0;
        if (v < worst) {
          worst = v;
          pick = i;
        }
      });
    }
    this.slot = pick;
    el.addEventListener('click', (e) => this._click(e));
    this.render();
    requestAnimationFrame(() => el.classList.add('in'));
    this.sound('open');
  }

  async close() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('in');
    el.classList.add('out');
    await wait(220);
    el.remove();
    if (!this.root.children.length) this.root.classList.remove('on');
  }

  render() {
    const el = this.el;
    if (!el) return;
    const m = this.meta;
    const s = m.s;
    const pre = m.raidPreview();
    const best = m.bestGain();
    const sq = m.squadPeople();
    const pmap = new Map(pre.members.map((x) => [x.id, x]));
    const slots = [];
    for (let i = 0; i < SQUAD_SIZE; i++) {
      const p = sq[i];
      if (!p) {
        slots.push(`<button class="slot empty${this.slot === i ? ' sel' : ''}" type="button" data-slot="${i}"><span>+</span><small>Empty</small></button>`);
        continue;
      }
      const mm = pmap.get(p.id);
      slots.push(
        `<button class="slot${this.slot === i ? ' sel' : ''}${mm && mm.counter ? ' ctr' : ''}" type="button" data-slot="${i}">` +
          face(p, { size: 48, extra: mm && mm.counter ? '<i class="ctr">×1.5</i>' : '' }) +
          `<b>${name(p)}</b>${pw(mm ? mm.power : m.power(p))}</button>`,
      );
    }
    const waves = pre.odds.waves;
    const people = s.people.slice().sort((a, b) => {
      const ca = isCounter(a, s.threats) ? 1 : 0;
      const cb = isCounter(b, s.threats) ? 1 : 0;
      return cb - ca || m.power(b) - m.power(a);
    });
    const roster = people
      .map((p) => {
        const inSq = m.inSquad(p.id);
        const ctr = isCounter(p, s.threats);
        return (
          `<div class="rc${inSq ? ' in' : ''}${ctr ? ' ctr' : ''}${m.isReady(p) ? ' ready' : ''}" data-id="${p.id}">` +
          `<button class="rc-main" type="button" data-pick="${p.id}">${face(p, { size: 52 })}<span class="rc-t"><b>${name(p)}</b><span>${icon(p.cls)}${pw(m.power(p))}</span></span>${ctr ? '<i class="tag">COUNTER</i>' : ''}${inSq ? `<i class="in">${icon('check')}</i>` : ''}</button>` +
          `<button class="rc-info" type="button" data-info="${p.id}" aria-label="Card">${icon('info')}</button>` +
          `${m.isReady(p) ? `<i class="rdy">${icon('up')}READY</i>` : ''}</div>`
        );
      })
      .join('');
    const sibs = pre.siblings ? `<span class="sib">${icon('heart')}Family +10%</span>` : '';
    const cheer = pre.cheer ? `<span class="sib">${icon('cheer')}Cheer +${Math.round(pre.cheer * 100)}%</span>` : '';
    el.innerHTML =
      `<div class="cr-left">` +
      `<div class="cr-head"><button class="btn back" type="button" data-act="back">← Park</button>${s.threats.map(threatChip).join('')}${pre.rally ? '<span class="rally">RALLY!</span>' : ''}</div>` +
      `<div class="slots">${slots.join('')}</div><div class="cr-pw">${icon('star')}Squad <b>${Math.round(pre.S)}</b> vs threat <b>${Math.round(pre.T)}</b></div>` +
      `<div class="cr-hint">${s.threats.map((t) => `${CLASSES[THREATS[t].by].plural} beat ${THREATS[t].name}`).join(' · ')}${sibs}${cheer}</div>` +
      `<div class="crownodds o-${pre.label.id}">${WAVES.map((w, i) => `<div class="co"><span class="co-c">${icon('crown')}</span><b>${Math.round(waves[i] * 100)}%</b><small>${esc(w.name)}</small></div>`).join('<span class="co-arrow">›</span>')}<div class="co-all"><small>All 3</small><b>${Math.round(pre.three * 100)}%</b><span>${pre.label.name}</span></div></div>` +
      `<div class="cr-btns"><button class="btn bestbtn${best.better ? ' pulse' : ''}" type="button" data-act="best"${best.better ? '' : ' disabled'}>${icon('best')}BEST${best.better ? ` +${Math.round(best.S - best.cur)}` : ''}</button>` +
      `<button class="btn yellow big go" type="button" data-act="go"${sq.length ? '' : ' disabled'}>${icon('play')}GO!</button></div>` +
      `</div>` +
      `<div class="cr-right"><div class="cr-rhead"><span class="kicker">Everyone in the park</span><span class="beds">${icon('people')}${s.people.length}</span></div><div class="roster scroll">${roster}</div></div>`;
    const sc = el.querySelector('.roster');
    if (this._scroll) sc.scrollTop = this._scroll;
    sc.addEventListener('scroll', () => (this._scroll = sc.scrollTop), { passive: true });
    moreHint(sc);
  }

  _click(e) {
    const m = this.meta;
    const t = e.target.closest('[data-slot],[data-pick],[data-info],[data-act]');
    if (!t) return;
    if (t.dataset.info) {
      this.onCard(Number(t.dataset.info));
      return;
    }
    if (t.dataset.slot !== undefined) {
      this.slot = Number(t.dataset.slot);
      this.sound('tap');
      this.render();
      return;
    }
    if (t.dataset.pick) {
      const id = Number(t.dataset.pick);
      let r;
      if (m.inSquad(id)) {
        const idx = m.s.squad.indexOf(id);
        if (idx === this.slot && m.s.squad.length > 1) r = m.toggleSquad(id);
        else {
          this.slot = idx;
          this.sound('tap');
          this.render();
          return;
        }
      } else r = m.putInSlot(id, this.slot);
      if (r && r.ok) {
        this.sound('tap');
        // Move the selection on to the next weakest slot after a swap.
        this.slot = Math.min(this.slot, m.s.squad.length);
      } else if (r) this.sound('error');
      this.onChange();
      this.render();
      return;
    }
    const act = t.dataset.act;
    if (act === 'back') this.close();
    else if (act === 'best') {
      const before = m.raidPreview().S;
      m.useBest();
      const after = m.raidPreview().S;
      this.sound('levelUp');
      this.fx.burst(t, ['#ffd36b', '#62e6ff', '#ffffff'], 18, 80);
      if (after > before) this.fx.float(t, `+${Math.round(after - before)} power`, 'good');
      this.onChange();
      this.render();
    } else if (act === 'go') {
      this.close().then(() => this.onGo());
    }
  }
}
