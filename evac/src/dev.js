// Testing drawer (gear, top right, or the ` key): time warp, forced run
// outcomes, cheats, live economy sliders, the pacing log and save tools.

import { TUNING_DEFAULTS, CAMPAIGNS, TOTAL_CHAPTERS, SURVIVOR_ORDER, WEAPON_ORDER, MAX_LEVEL, CHAPTERS_PER_CAMPAIGN } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'supplies', label: 'Run rewards', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'costs', label: 'Upgrade costs', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'difficulty', label: 'Recommended power', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'shortMinutes', label: 'Supply Crate every', min: 1, max: 120, step: 1, fmt: (v) => `${v} min` },
  { key: 'longHours', label: 'Airdrop every', min: 1, max: 24, step: 0.5, fmt: (v) => `${v} h` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

const inGameDir = /\/evac\/?(index\.html)?$/.test(location.pathname);
const GAME_URL = inGameDir ? '../' : 'https://miikka-boom.github.io/FunLand2/';
const CAMP_URL = inGameDir ? '../camp/' : 'https://miikka-boom.github.io/FunLand2/camp/';

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
    const warps = [
      ['+10 min', 600],
      ['+1 h', 3600],
      ['+8 h', 8 * 3600],
      ['+1 day', 86400],
    ]
      .map(([l, v]) => `<button class="btn chip" type="button" data-dev="warp" data-v="${v}">${l}</button>`)
      .join('');
    const outcome = ['auto', 'win', 'lose'].map((o) => `<button class="btn chip${t.outcome === o ? ' on' : ''}" type="button" data-dev="outcome" data-v="${o}">${o === 'auto' ? 'By power' : o === 'win' ? 'Always survive' : 'Always die'}</button>`).join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" id="dev-${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const log = s.log.length
      ? s.log.map((l) => `<div class="ms"><b>${CAMPAIGNS[l.campaign].name}</b><span>run ${l.runs}</span><span>${fmtTime(l.play / 1000)} played</span><span>${fmtTime(l.t / 1000)} camp time</span></div>`).join('')
      : '<div class="panel-note">No district cleared yet.</div>';
    const st = s.stats;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn primary" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Runs</div><div class="panel-note">Simulated runs: by power uses the odds shown on each stop.</div><div class="panel-row">${outcome}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">Only the crate and airdrop wait on time. Clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead` : 'on real time'}.</div><div class="panel-row">${warps}<button class="btn chip" type="button" data-dev="ready">Rewards ready</button></div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `<button class="btn" type="button" data-dev="sup">+500 supplies</button><button class="btn" type="button" data-dev="gems">+50 gems</button>` +
      `<button class="btn" type="button" data-dev="clear">Clear next stop ★★★</button><button class="btn" type="button" data-dev="district">Clear district</button><button class="btn" type="button" data-dev="max">Max squad & guns</button>` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" id="dev-haptics" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row"><button class="btn chip" type="button" data-dev="defaults">Reset tuning</button></div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div>${log}` +
      `<div class="panel-note">Road ${Math.min(s.next, TOTAL_CHAPTERS)}/${TOTAL_CHAPTERS} · runs ${st.runs} (${st.wins} survived, ${st.deaths} died, ${st.revives} revives) · upgrades ${st.upgrades} · supplies earned ${fmtNum(st.earned)} · gems earned ${st.gemsEarned}, spent ${st.gemsSpent} · crates ${st.crates} · airdrops ${st.airdrops}</div>` +
      `<div class="panel-note">Simulate days of play: <code>npm run evac:balance</code></div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row"><button class="btn" type="button" data-dev="export">Copy save</button><button class="btn" type="button" data-dev="import">Load save</button><button class="btn danger" type="button" data-dev="reset">Reset progress</button><button class="btn danger hidden" type="button" data-dev="resetYes">Yes, wipe it</button></div>` +
      `<textarea class="panel-json" id="dev-json" spellcheck="false" placeholder="Paste a save here, then press Load save again"></textarea>` +
      `<div class="panel-row"><a class="btn" href="${GAME_URL}">The action game</a><a class="btn" href="${CAMP_URL}">Metagame v1 (camp)</a></div></div>` +
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
      case 'ready':
        for (const k of ['short', 'long']) meta.s.rewards[k].readyAt = meta.now();
        meta.tick();
        break;
      case 'sup':
        meta.give({ supplies: 500 });
        break;
      case 'gems':
        meta.give({ gems: 50 });
        break;
      case 'clear':
        this.ctx.onCheat(() => meta.skipChapter(3));
        break;
      case 'district': {
        const end = (Math.floor(meta.s.next / CHAPTERS_PER_CAMPAIGN) + 1) * CHAPTERS_PER_CAMPAIGN;
        this.ctx.onCheat(() => {
          let out = null;
          while (meta.s.next < Math.min(end, TOTAL_CHAPTERS)) out = meta.skipChapter(2);
          return out;
        });
        break;
      }
      case 'max':
        for (const id of SURVIVOR_ORDER) if (meta.s.survivors[id] > 0) meta.s.survivors[id] = MAX_LEVEL;
        for (const id of WEAPON_ORDER) if (meta.s.weapons[id] > 0) meta.s.weapons[id] = MAX_LEVEL;
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
