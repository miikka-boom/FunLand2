// Testing drawer (gear, top right, or the ` key): forced outcomes, the next
// newcomer's stars, cheats, live economy sliders, stats and save tools.

import { fmtNum } from './format.js';

const SLIDERS = [
  { key: 'coins', label: 'Coins from nights', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'threat', label: 'Night threat', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

export class Dev {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { town, tuning, onTuning, onCheat, onReset, onImport, onExport, toast }
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
  }

  render() {
    const { town } = this.ctx;
    const t = town.tuning;
    const s = town.s;
    const f = town.force;
    const chip = (dev, label, v = '', on = false) => `<button class="btn chip${on ? ' on' : ''}" type="button" data-dev="${dev}" data-v="${v}">${label}</button>`;
    const outcome = [
      ['auto', 'By the odds'],
      ['win', 'Always win'],
      ['lose', 'Always lose'],
    ]
      .map(([o, l]) => chip('outcome', l, o, t.outcome === o))
      .join('');
    const stars = ['rookie', 'veteran', 'hero', 'legend'].map((r, k) => chip('newcomer', `${'★'.repeat(k + 1)} ${r[0].toUpperCase() + r.slice(1)}`, r, f.newcomer === r)).join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const st = s.stats;
    const sp = st.spent;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn yellow" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Nights</div><div class="panel-row">${outcome}</div><div class="panel-row">${chip('night', '+5 nights', 5)}${chip('night', '+20 nights', 20)}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Next newcomer</div><div class="panel-note">Who moves into the next home you build (one shot).</div><div class="panel-row">${stars}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `${chip('coins', '+1,000 coins', 1000)}${chip('coins', '+10,000 coins', 10000)}${chip('levels', 'Everyone +1 level')}${chip('clear1', 'Clear the next lot (free)')}${chip('clearall', 'Clear every lot')}${chip('people', '+3 people')}` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row">${chip('defaults', 'Reset tuning')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Stats</div><div class="panel-note">Night ${s.night} · ${s.runs} played, ${s.wins} won, ${st.losses} lost · ${s.people.length} people (${st.newcomers.rookie}/${st.newcomers.veteran}/${st.newcomers.hero}/${st.newcomers.legend} by stars) · ${town.lotCount()} lots · ${s.objects.filter((o) => o.kind === 'decor').length} decorations · ${fmtNum(st.coinsEarned)} coins earned: ${fmtNum(sp.levels)} on levels, ${fmtNum(sp.homes)} on homes, ${fmtNum(sp.decor)} on decorations, ${fmtNum(sp.land)} on land · ${st.moves} moves</div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row">${chip('copy', 'Copy save')}${chip('load', 'Load save…')}${this.confirmReset ? chip('reset2', 'Really reset everything?') + chip('noreset', 'Keep it') : chip('reset', 'Reset progress')}</div>` +
      `<textarea class="savebox hidden" rows="3" placeholder="Paste a save here, then tap Load save again"></textarea></div>` +
      `<div class="panel-note">The console has <code>window.__outpost</code>.</div>` +
      `</div>`;
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.town.tuning;
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
    const { town } = this.ctx;
    const f = town.force;
    const v = b.dataset.v;
    const cheat = (kind, arg, msg) => {
      this.ctx.onCheat(kind, arg);
      if (msg) this.ctx.toast(msg);
      if (this.open) this.render();
    };
    switch (b.dataset.dev) {
      case 'close':
        this.hide();
        return;
      case 'outcome':
        town.tuning.outcome = v;
        this.ctx.onTuning('outcome');
        return this.render();
      case 'newcomer':
        if (f.newcomer === v) delete f.newcomer;
        else f.newcomer = v;
        return this.render();
      case 'night':
        return cheat('night', Number(v), `Night +${v}`);
      case 'coins':
        return cheat('coins', Number(v), `+${fmtNum(Number(v))} coins`);
      case 'levels':
        return cheat('levels', 1, 'Everyone went up a level');
      case 'clear1': {
        const fr = town.suggestLot();
        if (!fr) return this.ctx.toast('Nothing left to clear');
        return cheat('clear', [fr.a, fr.b], `Cleared ${fr.name}`);
      }
      case 'clearall':
        return cheat('clearAll', null, 'Every lot cleared');
      case 'people':
        return cheat('people', 3, '+3 people');
      case 'defaults':
        this.ctx.onTuning('*defaults');
        return this.render();
      case 'copy':
        this.ctx.onExport();
        return;
      case 'load': {
        const box = this.root.querySelector('.savebox');
        if (box.classList.contains('hidden')) {
          box.classList.remove('hidden');
          box.focus();
        } else if (box.value.trim()) this.ctx.onImport(box.value.trim());
        return;
      }
      case 'reset':
        this.confirmReset = true;
        return this.render();
      case 'noreset':
        this.confirmReset = false;
        return this.render();
      case 'reset2':
        this.ctx.onReset();
        return;
      default:
    }
  }
}
