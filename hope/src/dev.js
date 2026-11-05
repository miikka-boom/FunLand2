// Testing drawer (gear, top right, or the ` key): forced run outcomes, time warp,
// cheats, live economy sliders, the pacing log and save tools.

import { TUNING_DEFAULTS, CHAINS, BUILDINGS, BUILDING_INDEX, STORY_TOTAL, MAX_LEVEL } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'scrap', label: 'Run rewards', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'costs', label: 'Upgrade costs', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'difficulty', label: 'Recommended power', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'xp', label: 'XP', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'gate', label: 'Time between visitors', min: 0.05, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'convoy', label: 'Time between convoys', min: 0.05, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

const inGameDir = /\/hope\/?(index\.html)?$/.test(location.pathname);
const BASE = inGameDir ? '../' : 'https://miikka-boom.github.io/FunLand2/';

export class Dev {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { meta, clock, onTuning, onReset, onImport, onExport, onCheat, toast }
    this.open = false;
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
    const chip = (dev, label, v = '') => `<button class="btn chip" type="button" data-dev="${dev}" data-v="${v}">${label}</button>`;
    const warps = [
      ['+10 min', 600],
      ['+1 h', 3600],
      ['+8 h', 8 * 3600],
      ['+1 day', 86400],
    ]
      .map(([l, v]) => chip('warp', l, v))
      .join('');
    const outcome = ['auto', 'win', 'lose'].map((o) => `<button class="btn chip${t.outcome === o ? ' on' : ''}" type="button" data-dev="outcome" data-v="${o}">${o === 'auto' ? 'By power' : o === 'win' ? 'Always survive' : 'Always die'}</button>`).join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" id="dev-${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const log = s.log.length
      ? s.log.map((l) => `<div class="ms"><b>${BUILDINGS[BUILDING_INDEX[CHAINS[l.chain].building]].name}</b><span>run ${l.runs}</span><span>day ${l.day}</span><span>${fmtTime(l.play / 1000)} played</span><span>${fmtTime(l.t / 1000)} street time</span></div>`).join('')
      : '<div class="panel-note">No building reclaimed yet.</div>';
    const st = s.stats;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn primary" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Runs</div><div class="panel-note">Simulated runs: "by power" uses the odds shown on each run. A run moves the clock on by its length.</div><div class="panel-row">${outcome}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">Visitors and the convoy wait on time. Clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead` : 'on real time'}.</div><div class="panel-row">${warps}${chip('visitor', 'Visitor now')}${chip('convoyReady', 'Convoy ready')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `${chip('scrap', '+500 scrap')}${chip('gems', '+50 gems')}${chip('story', 'Win the next story run')}${chip('reclaim', 'Reclaim the next building')}${chip('levels', 'Everyone +2 levels')}${chip('heal', 'Heal everyone')}${chip('beds', 'Max beds')}` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" id="dev-haptics" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row">${chip('defaults', 'Reset tuning')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div>${log}` +
      `<div class="panel-note">Day ${s.day} · story ${Math.min(s.story, STORY_TOTAL)}/${STORY_TOTAL} · runs ${st.runs} (${st.wins} survived, ${st.deaths} died, ${st.revives} revives) · ${s.people.length} people · visitors ${st.visitors}, taken in ${st.takenIn}, turned away ${st.turnedAway}, let go ${st.letGo} · injuries ${st.injuries} · level-ups ${st.levelUps} · upgrades ${st.upgrades} · scrap earned ${fmtNum(st.earned)} · gems earned ${st.gemsEarned}, spent ${st.gemsSpent} · convoys ${st.convoys}</div>` +
      `<div class="panel-note">Simulate days of play: <code>npm run hope:balance</code></div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row"><button class="btn" type="button" data-dev="export">Copy save</button><button class="btn" type="button" data-dev="import">Load save</button><button class="btn danger" type="button" data-dev="reset">Reset progress</button><button class="btn danger hidden" type="button" data-dev="resetYes">Yes, wipe it</button></div>` +
      `<textarea class="panel-json" id="dev-json" spellcheck="false" placeholder="Paste a save here, then press Load save again"></textarea>` +
      `<div class="panel-row"><a class="btn" href="${BASE}">The action game</a><a class="btn" href="${BASE}evac/">Road to Evac</a><a class="btn" href="${BASE}safehouse/">Safehouse</a><a class="btn" href="${BASE}camp/">Camp (v1)</a></div></div>` +
      `</div>`;
    this.json = this.root.querySelector('.panel-json');
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.meta.tuning;
    t[key] = el.type === 'checkbox' ? el.checked : Number(el.value);
    const d = SLIDERS.find((x) => x.key === key);
    const out = this.root.querySelector(`[data-val="${key}"]`);
    if (d && out) out.textContent = d.fmt(t[key]);
    this.ctx.onTuning(key);
  }

  _click(e) {
    if (e.target === this.root) return this.hide();
    const b = e.target.closest('[data-dev]');
    if (!b) return;
    const { meta, clock } = this.ctx;
    const v = b.dataset.v;
    switch (b.dataset.dev) {
      case 'close':
        return this.hide();
      case 'outcome':
        meta.tuning.outcome = v;
        this.ctx.onTuning('outcome');
        break;
      case 'warp':
        clock.warp(Number(v) * 1000);
        meta.tick();
        this.ctx.toast(`Clock +${fmtTime(Number(v))}`);
        break;
      case 'visitor':
        if (meta.s.gate.visitors.length >= meta.gateCapacity()) this.ctx.toast('The gate is full');
        else meta.callVisitor();
        break;
      case 'convoyReady':
        meta.s.convoy.readyAt = meta.now();
        meta.tick();
        break;
      case 'scrap':
        meta.give({ scrap: 500 });
        break;
      case 'gems':
        meta.give({ gems: 50 });
        break;
      case 'story':
        this.ctx.onCheat(() => meta.skipStory(3));
        break;
      case 'reclaim': {
        const c = Math.floor(meta.s.story / 3);
        this.ctx.onCheat(() => {
          let out = null;
          while (!meta.s.sealed && Math.floor(meta.s.story / 3) === c) out = meta.skipStory(2);
          return out;
        });
        break;
      }
      case 'levels':
        for (const p of meta.s.people) {
          p.level = Math.min(MAX_LEVEL, p.level + 2);
          p.xp = 0;
        }
        meta.changed();
        break;
      case 'heal':
        for (const p of meta.s.people) p.injured = 0;
        meta.changed();
        break;
      case 'beds':
        meta.s.buildings.firehouse = 5;
        if (meta.s.buildings.motel > 0) meta.s.buildings.motel = 5;
        meta.changed();
        break;
      case 'defaults':
        Object.assign(meta.tuning, TUNING_DEFAULTS);
        this.ctx.onTuning('*');
        break;
      case 'export': {
        const json = this.ctx.onExport();
        this.json.value = json;
        this.json.classList.add('show');
        try {
          navigator.clipboard.writeText(json).then(
            () => this.ctx.toast('Save copied'),
            () => this.ctx.toast('Select the text to copy it'),
          );
        } catch {
          this.ctx.toast('Select the text to copy it');
        }
        return;
      }
      case 'import':
        if (!this.json.classList.contains('show') || !this.json.value.trim()) {
          this.json.value = '';
          this.json.classList.add('show');
          this.json.focus();
          return;
        }
        this.ctx.toast(this.ctx.onImport(this.json.value) ? 'Save loaded' : 'That save could not be read');
        break;
      case 'reset':
        b.classList.add('hidden');
        this.root.querySelector('[data-dev="resetYes"]').classList.remove('hidden');
        return;
      case 'resetYes':
        this.ctx.onReset();
        break;
      default:
        return;
    }
    this.render();
  }
}
