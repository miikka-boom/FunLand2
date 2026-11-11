// Long Haul: the testing drawer (the gear, top right, or the ` key). Forced
// outcomes, time jumps for the radio, who answers the next call, cheats, live
// sliders, stats and save tools. None of it is part of the game.

import { CAST, CAST_ORDER, RARITY_ORDER, RARITIES, RACK_SIZE, AREAS } from './config.js';
import { fmtNum } from './format.js';
import { esc } from './ui.js';

const SLIDERS = [
  { key: 'supplies', label: 'Supplies in crates', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'tokens', label: 'Tokens in crates and calls', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'danger', label: 'Danger at every stop', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'callTime', label: 'How long a call takes', min: 0.05, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

const HOUR = 3600 * 1000;

export class Dev {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { game, onTuning(key), onCheat(kind, arg), onWarp(ms), onReset(), onImport(text), onExport(), onClose(), toast(msg) }
    this.open = false;
    this.confirmReset = false;
    root.addEventListener('click', (e) => this._click(e));
    root.addEventListener('input', (e) => this._input(e));
    root.addEventListener('change', (e) => this._input(e));
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.confirmReset = false;
    this.render();
    this.root.classList.add('open');
  }

  hide() {
    this.open = false;
    this.root.classList.remove('open');
    if (this.ctx.onClose) this.ctx.onClose();
  }

  render() {
    const { game } = this.ctx;
    const t = game.tuning;
    const s = game.s;
    const f = game.force;
    const chip = (dev, label, v = '', on = false) => `<button class="btn chipb${on ? ' on' : ''}" type="button" data-dev="${dev}" data-v="${v}">${label}</button>`;
    const outcome = [
      ['auto', 'By the odds'],
      ['3', 'All 3 standing'],
      ['2', '2 standing'],
      ['1', '1 standing'],
      ['0', 'Nobody'],
    ]
      .map(([o, l]) => chip('outcome', l, o, t.outcome === o))
      .join('');
    const calls = [['new', 'Someone new'], ...RARITY_ORDER.map((r) => [r, RARITIES[r].name])].map(([v, l]) => chip('call', l, v, f.call === v)).join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const st = s.stats;
    const runs = st.stars.reduce((a, b) => a + b, 0);
    const people = CAST_ORDER.filter((id) => s.cast[id])
      .map((id) => `${esc(CAST[id].name)} ${s.cast[id].level}`)
      .join(', ');
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn go small" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Runs</div><div class="panel-note">How many are left standing on every run from now on.</div><div class="panel-row">${outcome}</div>` +
      `<div class="panel-row">${chip('eyes', 'Two little eyes on the next haul', '', !!f.eyes)}${chip('lucky', 'A second gold crate', '', !!f.lucky)}</div></div>` +
      `<div class="panel-section"><div class="panel-group">The radio</div><div class="panel-note">Rack ${s.rack.length}/${RACK_SIZE} · ${game.answered()} answered · ${s.fresh} call${s.fresh === 1 ? '' : 's'} still sure to reach someone new.</div>` +
      `<div class="panel-row">${chip('warp', '+10 min', 1 / 6)}${chip('warp', '+1 hour', 1)}${chip('warp', '+3 hours', 3)}${chip('warp', '+1 day', 24)}${chip('answer', 'Every call answered now')}${chip('radio', '+1 radio')}</div>` +
      `<div class="panel-note">Who answers the next call (one shot):</div><div class="panel-row">${calls}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `${chip('supplies', '+500 supplies', 500)}${chip('supplies', '+5,000 supplies', 5000)}${chip('tokens', 'Fill the squad’s bars')}${chip('levels', 'Everyone +1 level')}${chip('everyone', 'Everyone moves in')}` +
      `${chip('stars', '+5 stars', 5)}${chip('next', 'To the next stop')}${chip('gift', 'A crate at the gate')}` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Show what was in the crates left behind</span><input class="switch" type="checkbox" data-key="peek"${t.peek ? ' checked' : ''}></label>` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row">${chip('defaults', 'Reset tuning')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Stats</div><div class="panel-note">${runs} runs: ${st.stars[3]} with all three standing, ${st.stars[2]} with two, ${st.stars[1]} with one, ${st.stars[0]} with nobody · ${fmtNum(s.stars)} stars, stop ${game.areaIndex() + 1} (${esc(AREAS[game.areaIndex()].name)}) · ${fmtNum(st.earned)} supplies earned, ${fmtNum(st.spent)} spent on ${st.levelUps} level-ups · ${st.tokens} tokens · ${st.radios} radios, ${s.calls} calls (${st.newcomers.common}/${st.newcomers.rare}/${st.newcomers.epic}/${st.newcomers.legendary} new by rarity, ${st.dupes} packages) · ${st.luckyGold} gold crates opened · eyes followed ${st.eyes} · ${st.gifts} crates at the gate<br>${people}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row">${chip('copy', 'Copy save')}${chip('load', 'Load save…')}${this.confirmReset ? chip('reset2', 'Really reset everything?') + chip('noreset', 'Keep it') : chip('reset', 'Reset progress')}</div>` +
      `<textarea class="savebox hidden" rows="3" placeholder="Paste a save here, then tap Load save again"></textarea></div>` +
      `<div class="panel-note">The console has <code>window.__haul</code>.</div>` +
      `</div>`;
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.game.tuning;
    if (el.type === 'checkbox') t[key] = el.checked;
    else t[key] = Number(el.value);
    const d = SLIDERS.find((x) => x.key === key);
    const v = this.root.querySelector(`[data-val="${key}"]`);
    if (d && v) v.textContent = d.fmt(t[key]);
    this.ctx.onTuning(key);
  }

  _click(e) {
    const b = e.target.closest('[data-dev]');
    if (!b) {
      if (e.target === this.root) this.hide();
      return;
    }
    const { game } = this.ctx;
    const f = game.force;
    const v = b.dataset.v;
    const cheat = (kind, arg, msg, fail) => {
      const ok = this.ctx.onCheat(kind, arg);
      this.ctx.toast(ok === false ? fail || 'Nothing to do' : msg);
      if (this.open) this.render();
    };
    const flip = (k) => {
      if (f[k]) delete f[k];
      else f[k] = true;
      this.render();
    };
    switch (b.dataset.dev) {
      case 'close':
        return this.hide();
      case 'outcome':
        game.tuning.outcome = v;
        this.ctx.onTuning('outcome');
        return this.render();
      case 'eyes':
        return flip('eyes');
      case 'lucky':
        return flip('lucky');
      case 'call':
        if (f.call === v) delete f.call;
        else f.call = v;
        return this.render();
      case 'warp':
        this.ctx.onWarp(Number(v) * HOUR);
        this.ctx.toast(`Time jumped ${Number(v) < 1 ? '10 minutes' : Number(v) === 1 ? 'an hour' : Number(v) === 24 ? 'a day' : `${v} hours`}`);
        return this.render();
      case 'answer':
        return cheat('answer', null, 'Every call has its answer', 'No radios on the rack');
      case 'radio':
        return cheat('radio', null, 'A radio on the rack', 'The rack is full');
      case 'supplies':
        return cheat('supplies', Number(v), `+${fmtNum(Number(v))} supplies`);
      case 'tokens':
        return cheat('tokens', null, 'The squad’s bars are full');
      case 'levels':
        return cheat('levels', null, 'Everyone went up a level');
      case 'everyone':
        return cheat('everyone', null, 'Everyone has moved in');
      case 'stars':
        return cheat('stars', Number(v), `+${v} stars`);
      case 'next':
        return cheat('next', null, 'On to the next stop');
      case 'gift':
        return cheat('gift', null, 'There’s a crate at the gate', 'There is one already');
      case 'defaults':
        this.ctx.onTuning('*defaults');
        return this.render();
      case 'copy':
        return this.ctx.onExport();
      case 'load': {
        const box = this.root.querySelector('.savebox');
        if (box.classList.contains('hidden')) {
          box.classList.remove('hidden');
          box.focus();
        } else if (box.value.trim()) this.ctx.onImport(box.value.trim());
        return undefined;
      }
      case 'reset':
        this.confirmReset = true;
        return this.render();
      case 'noreset':
        this.confirmReset = false;
        return this.render();
      case 'reset2':
        return this.ctx.onReset();
      default:
        return undefined;
    }
  }
}
