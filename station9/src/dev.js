// Testing drawer (gear, top right, or the ` key): forced run outcomes, time warp,
// cheats, the tutorial, live economy sliders, the pacing log and save tools.

import { TUNING_DEFAULTS, CHAINS, BUILDINGS, BUILDING_INDEX, STORY_TOTAL, MAX_LEVEL, GATE, MAX_FACILITY_LEVEL } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'scrap', label: 'Run rewards', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'costs', label: 'Upgrade costs', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'difficulty', label: 'Power needed', min: 0.5, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'gate', label: 'Time between visitors', min: 0.05, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

const inGameDir = /\/station9\/?(index\.html)?$/.test(location.pathname);
const BASE = inGameDir ? '../' : 'https://miikka-boom.github.io/FunLand2/';

export class Dev {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { meta, clock, tutor, onTuning, onReset, onImport, onExport, onCheat, onSkipTutorial, toast }
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
      ['+5 min', 300],
      ['+30 min', 1800],
      ['+8 h', 8 * 3600],
    ]
      .map(([l, v]) => chip('warp', l, v))
      .join('');
    const outcome = ['auto', 'win', 'lose'].map((o) => `<button class="btn chip${t.outcome === o ? ' on' : ''}" type="button" data-dev="outcome" data-v="${o}">${o === 'auto' ? 'By power' : o === 'win' ? 'Always make it' : 'Always lose'}</button>`).join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" id="dev-${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const log = s.log.length
      ? s.log.map((l) => `<div class="ms"><b>${BUILDINGS[BUILDING_INDEX[CHAINS[l.chain].building]].name}</b><span>run ${l.runs}</span><span>${fmtTime(l.play / 1000)} played</span><span>${fmtTime(l.t / 1000)} street time</span></div>`).join('')
      : '<div class="panel-note">No building taken back yet.</div>';
    const st = s.stats;
    const ftue = this.ctx.tutor.ftue;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Testing tools</div></div><button class="btn primary" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Mae</div><div class="panel-note">${s.tut.done ? 'The guided start is done. Start over to see it again.' : 'The guided start is running.'}</div><div class="panel-row">` +
      `${ftue ? chip('skipTut', 'Skip the guided start') : ''}<button class="btn chip" type="button" data-dev="reset">Start over</button><button class="btn danger hidden" type="button" data-dev="resetYes">Yes, wipe it</button>` +
      `<label class="ctl row inl"><span>Mae's voice</span><input class="switch" type="checkbox" data-key="voice"${t.voice ? ' checked' : ''}></label></div></div>` +
      `<div class="panel-section"><div class="panel-group">Runs</div><div class="panel-note">Simulated runs. "By power" uses the odds on the crew screen (the first two runs always make it). A run moves the clock on 5 minutes.</div><div class="panel-row">${outcome}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">Visitors and the convoy wait on time. Clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead` : 'on real time'}.</div><div class="panel-row">${warps}${chip('visitor', 'Visitor now')}${chip('convoyReady', 'Convoy now')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `${chip('scrap', '+100 scrap')}${chip('story', 'Win the next run')}${chip('reclaim', 'Take back the next building')}${chip('levels', 'Everyone +1 level')}${chip('beds', 'Max Bunks')}` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row">${chip('defaults', 'Reset tuning')}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div>${log}` +
      `<div class="panel-note">Story ${Math.min(s.story, STORY_TOTAL)}/${STORY_TOTAL} · runs ${st.runs} (${st.wins} made it, ${st.losses} lost) · ${s.people.length} people · visitors ${st.visitors}, taken in ${st.takenIn}, not now ${st.sentAway}, let go ${st.letGo || 0} · rests ${st.rests} · level-ups ${st.levelUps} · upgrades ${st.upgrades} · scrap earned ${fmtNum(st.earned)} · convoys ${st.convoys} · ${fmtTime(s.playMs / 1000)} played</div>` +
      `<div class="panel-note">Simulate many players: <code>npm run station9:balance</code></div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row"><button class="btn" type="button" data-dev="export">Copy save</button><button class="btn" type="button" data-dev="import">Load save</button></div>` +
      `<textarea class="panel-json" id="dev-json" spellcheck="false" placeholder="Paste a save here, then press Load save again"></textarea>` +
      `<div class="panel-row"><a class="btn" href="${BASE}">The action game</a><a class="btn" href="${BASE}hope/">Hope Street</a><a class="btn" href="${BASE}evac/">Road to Evac</a><a class="btn" href="${BASE}camp/">Camp (v1)</a></div></div>` +
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
      case 'skipTut':
        this.ctx.onSkipTutorial();
        this.hide();
        return;
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
        if (meta.s.gate.visitors.length >= GATE.capacity) this.ctx.toast('Two are already waiting at the gate');
        else meta.arrive();
        break;
      case 'convoyReady':
        if (!meta.s.convoy.on) meta.startConvoy();
        meta.s.convoy.readyAt = meta.now();
        meta.tick();
        break;
      case 'scrap':
        meta.give(100);
        break;
      case 'story':
        this.ctx.onCheat(() => meta.skipRun(3));
        break;
      case 'reclaim':
        this.ctx.onCheat(() => {
          let r = null;
          for (let k = 0; k < 6 && !meta.s.sealed; k++) {
            r = meta.skipRun(2);
            if (r.out.reclaimed) break;
          }
          return r;
        });
        break;
      case 'levels':
        for (const p of meta.s.people) {
          p.level = Math.min(MAX_LEVEL, p.level + 1);
          p.xp = 0;
        }
        meta.changed();
        break;
      case 'beds':
        meta.s.buildings.firehouse = MAX_FACILITY_LEVEL;
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
        return;
      default:
        return;
    }
    this.render();
  }
}
