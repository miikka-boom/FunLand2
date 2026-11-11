// Testing drawer (gear, top right, or the ` key): time warp, forced chest and
// raid outcomes, cheats, town cheats (clear lots, wishes, trunk survivors,
// visitors, people), live economy sliders, the pacing log and save tools.

import { ZONES } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'coins', label: 'Coins (raids, chests)', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'badges', label: 'Chest Badges', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'threat', label: 'Zone threat', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'glow', label: 'Glow-Up chance per knock', min: 0, max: 0.6, step: 0.01, fmt: (v) => `+${Math.round(v * 100)} pts` },
  { key: 'chestTime', label: 'Chest timers', min: 0.02, max: 2, step: 0.01, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

export class Dev {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { meta, clock, tuning, onTuning, onCheat, onReset, onImport, toast }
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
    const { meta, clock } = this.ctx;
    const t = meta.tuning;
    const s = meta.s;
    const f = meta.force;
    const chip = (dev, label, v = '', on = false) => `<button class="btn chip${on ? ' on' : ''}" type="button" data-dev="${dev}" data-v="${v}">${label}</button>`;
    const warps = [
      ['+10 min', 600],
      ['+1 h', 3600],
      ['+2 h', 7200],
      ['+8 h', 8 * 3600],
      ['+1 day', 86400],
    ]
      .map(([l, v]) => chip('warp', l, v))
      .join('');
    const grade = ['Plain', 'Silver', 'Gold', 'Rainbow'].map((l, i) => chip('grade', l, i, f.grade === i)).join('');
    const rarity = ['rookie', 'veteran', 'hero', 'legend'].map((r) => chip('rarity', r[0].toUpperCase() + r.slice(1), r, f.rarity === r)).join('');
    const outcome = [
      ['auto', 'By the odds'],
      ['win', '3 crowns'],
      ['two', '2'],
      ['one', '1'],
      ['lose', '0 crowns'],
      ['clutch', 'Clutch save'],
    ]
      .map(([o, l]) => chip('outcome', l, o, t.outcome === o))
      .join('');
    const sk = ZONES.slice(1)
      .map((z) => chip('skulls', `${z.gate} (${z.name})`, z.gate))
      .join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const log = s.log.length
      ? s.log.map((l) => `<div class="ms"><b>Zone ${l.zone}</b><span>raid ${l.raids}</span><span>${l.chests} chests</span><span>${fmtTime(l.t / 1000)} in</span><span>${l.people} people</span><span>squad Lv ${l.squadLevel.toFixed(1)}</span></div>`).join('')
      : '<div class="panel-note">No zone reached yet.</div>';
    const st = s.stats;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn yellow" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">Chests wait on real time. Clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead` : 'on real time'}.</div><div class="panel-row">${warps}${chip('chests', 'Chests ready now')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Next chest</div><div class="panel-note">Grade and newcomer rarity for the next chest opened (one shot).</div><div class="panel-row">${grade}</div><div class="panel-row">${rarity}${chip('golden', 'Golden', '', f.golden === true)}${chip('sibling', 'Sibling', '', f.sibling === true)}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Raids</div><div class="panel-row">${outcome}</div><div class="panel-row">${chip('gz', 'Golden zombie next', '', !!f.goldenZombie)}${chip('stray', 'Stray next win', '', !!f.stray)}${chip('gift', 'A gift now')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `${chip('coins', '+1,000 coins')}${chip('gems', '+100 gems')}${chip('badges', '+50 Badges to the squad')}${chip('ready', 'Squad READY')}${chip('maxb', 'Max buildings')}` +
      `</div><div class="panel-note">Set Skulls (opens zones, pays milestones):</div><div class="panel-row">${sk}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Town</div><div class="panel-row">` +
      `${chip('clear1', 'Clear the next lot (free)')}${chip('clearall', 'Clear every lot')}${chip('wish', 'A wish now')}${chip('trunk', 'Trunk survivor next pile', '', !!f.trunk)}${chip('people', '+5 people')}${chip('visitor', 'Costume zombie')}${chip('golden', 'Golden zombie', 'gv')}${chip('statue', 'Founders\' Day')}` +
      `</div><div class="panel-note">${s.town.stats.lots} lots cleared · ${s.town.stats.junk} junk popped (${s.town.stats.trunks} trunk survivors) · ${s.town.stats.wishes} wishes · ${s.town.stats.decorBought} bought, ${s.town.stats.decorFound} found · ${s.town.stats.landmarks} landmarks · ${fmtNum(s.town.stats.landCoins)} coins on land · ${s.objects.length} objects</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row">${chip('defaults', 'Reset tuning')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Stats</div><div class="panel-note">${st.raids} raids (crowns 0/1/2/3: ${st.crowns.join('/')}, ${st.clutches} clutch, ${st.rallies} rallies) · ${st.chests.crate} Crates, ${st.chests.vault} Vaults · Glow-Ups ${st.grades[1]} Silver, ${st.grades[2]} Gold, ${st.grades[3]} Rainbow · newcomers ${st.newcomers.rookie}/${st.newcomers.veteran}/${st.newcomers.hero}/${st.newcomers.legend} (R/V/H/L), ${st.goldens} golden, ${st.siblings} siblings · ${st.strays} strays · ${st.goldenZombies} golden zombies · ${fmtNum(st.coinsEarned)} coins earned · ${st.levelUps} level-ups · ${st.upgrades} upgrades</div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div>${log}</div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row">${chip('copy', 'Copy save')}${chip('load', 'Load save…')}${this.confirmReset ? chip('reset2', 'Really reset everything?') + chip('noreset', 'Keep it') : chip('reset', 'Reset progress')}</div>` +
      `<textarea class="savebox hidden" rows="3" placeholder="Paste a save here, then tap Load save again"></textarea></div>` +
      `<div class="panel-note">The console has <code>window.__outpost</code>.</div>` +
      `</div>`;
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.meta.tuning;
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
    const { meta, clock } = this.ctx;
    const f = meta.force;
    const v = b.dataset.v;
    const cheat = (fn, msg) => {
      const r = this.ctx.onCheat(fn);
      if (msg && !(r && r.zones && r.zones.length)) this.ctx.toast(msg);
      if (this.open) this.render();
    };
    switch (b.dataset.dev) {
      case 'close':
        this.hide();
        return;
      case 'warp':
        clock.warp(Number(v) * 1000);
        cheat(() => null, `Clock +${fmtTime(Number(v))}`);
        return;
      case 'chests':
        return cheat(() => meta.cheat('chests'), 'Both chests are ready');
      case 'grade':
        if (f.grade === Number(v)) delete f.grade;
        else f.grade = Number(v);
        return this.render();
      case 'rarity':
        if (f.rarity === v) delete f.rarity;
        else f.rarity = v;
        return this.render();
      case 'golden':
        if (v === 'gv') return cheat(() => meta.cheat('visitor', 'golden'), 'A golden zombie at the fence');
        if (f.golden) delete f.golden;
        else f.golden = true;
        return this.render();
      case 'sibling':
        if (f.sibling) delete f.sibling;
        else f.sibling = true;
        return this.render();
      case 'outcome':
        meta.tuning.outcome = v;
        this.ctx.onTuning('outcome');
        return this.render();
      case 'gz':
        f.goldenZombie = !f.goldenZombie;
        return this.render();
      case 'stray':
        f.stray = !f.stray;
        return this.render();
      case 'gift':
        return cheat(() => meta.giftNow(), 'Someone has a gift for you');
      case 'coins':
        return cheat(() => meta.cheat('coins', 1000), '+1,000 coins');
      case 'gems':
        return cheat(() => meta.cheat('gems', 100), '+100 gems');
      case 'badges':
        return cheat(() => meta.cheat('badges', 50), '+50 Badges each');
      case 'ready':
        return cheat(() => meta.cheat('ready'), 'The squad is READY');
      case 'maxb':
        return cheat(() => meta.cheat('maxBuildings'), 'Buildings at the zone cap');
      case 'skulls':
        return cheat(() => meta.cheat('skulls', Number(v)), `Skulls set to ${v}`);
      case 'clear1': {
        const fr = meta.frontier()[0];
        if (!fr) return this.ctx.toast('Nothing left to clear');
        return cheat(() => ({ ...meta.cheat('clear', [fr.a, fr.b]), clearedLot: true }), `Cleared ${fr.name}`);
      }
      case 'clearall':
        return cheat(() => ({ ...meta.cheat('clearAll'), clearedLot: true }), 'Every lot cleared');
      case 'wish':
        return cheat(() => meta.cheat('wish'), 'Someone has a wish');
      case 'trunk':
        f.trunk = !f.trunk;
        return this.render();
      case 'people':
        return cheat(() => meta.cheat('people', 5), '+5 people');
      case 'visitor':
        return cheat(() => meta.cheat('visitor', 'costume'), 'A costume zombie at the fence');
      case 'statue':
        return cheat(() => meta.cheat('statue'), "Founders' Day: the statue flies in");
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
