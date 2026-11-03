// Tuning drawer for playtests: warp time, fast-forward, cheats, live economy
// multipliers, the pacing log (when each camp level was reached) and save
// export / import. Opened with the gear button (top right) or the ` key.

import { TUNING_DEFAULTS, QUESTS } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'buildTime', label: 'Build / craft / expedition time', min: 0, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'production', label: 'Production rate', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'loot', label: 'Run loot', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'gemCost', label: 'Rush price', min: 0.25, max: 3, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'shortMinutes', label: 'Supply Crate every', min: 1, max: 60, step: 1, fmt: (v) => `${v} min` },
  { key: 'longHours', label: 'Airdrop every', min: 1, max: 24, step: 0.5, fmt: (v) => `${v} h` },
  { key: 'awayMinutes', label: 'Welcome-back summary after', min: 0, max: 60, step: 1, fmt: (v) => `${v} min` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

// Served from the repo (/camp/) the game is one folder up; anywhere else, use Pages.
const GAME_URL = /\/camp\/?(index\.html)?$/.test(location.pathname) ? '../' : 'https://miikka-boom.github.io/FunLand2/';

export class DevPanel {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { camp, clock, onTuning(key), onReset(), onImport(json), onExport() -> string, toast(text) }
    this.open = false;
    root.addEventListener('click', (e) => this._click(e));
    root.addEventListener('input', (e) => this._input(e));
    root.addEventListener('change', (e) => this._input(e));
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

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  render() {
    const { camp, clock } = this.ctx;
    const t = camp.tuning;
    const s = camp.s;
    const speeds = [1, 10, 60, 600].map((v) => `<button class="btn chip${clock.speed === v ? ' on' : ''}" type="button" data-dev="speed" data-v="${v}">×${v}</button>`).join('');
    const warps = [
      ['+1 min', 60],
      ['+10 min', 600],
      ['+1 h', 3600],
      ['+8 h', 8 * 3600],
      ['+1 day', 86400],
    ]
      .map(([l, v]) => `<button class="btn chip" type="button" data-dev="warp" data-v="${v}">${l}</button>`)
      .join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const outcome = ['auto', 'win', 'lose'].map((o) => `<option value="${o}"${t.outcome === o ? ' selected' : ''}>${o === 'auto' ? 'By power (win chance)' : o === 'win' ? 'Always survive' : 'Always die'}</option>`).join('');
    const ms = s.milestones
      .map((m) => `<div class="ms"><b>Camp Lv ${m.hq}</b><span>${fmtTime(m.t / 1000)} camp time</span><span>${fmtTime(m.play / 1000)} played</span></div>`)
      .join('');
    const st = s.stats;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Camp tuning</div></div><button class="btn primary" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">Camp clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead of real time` : 'on real time'}. Timers, production and rewards all follow it, and keep running while the page is closed.</div>` +
      `<div class="panel-row">${warps}</div><div class="panel-group sub">Fast-forward while open</div><div class="panel-row">${speeds}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `<button class="btn" type="button" data-dev="res">+1000 each resource</button><button class="btn" type="button" data-dev="gems">+100 gems</button><button class="btn" type="button" data-dev="surv">+1 survivor</button>` +
      `<button class="btn" type="button" data-dev="finish">Finish all timers</button><button class="btn" type="button" data-dev="fill">Fill producers</button><button class="btn" type="button" data-dev="quest">Skip objective</button>` +
      `</div></div>` +
      `<div class="panel-section"><div class="panel-group">Economy (live)</div>${sliders}` +
      `<label class="ctl"><span class="ctl-top"><span>Simulated run outcome</span></span><select data-key="outcome">${outcome}</select></label>` +
      `<label class="ctl row"><span>Runs move the camp clock on by their length</span><input class="switch" type="checkbox" data-key="runTime"${t.runTime ? ' checked' : ''}></label>` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row"><button class="btn chip" type="button" data-dev="defaults">Reset tuning</button></div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div><div class="panel-note">When each camp level was reached, in camp time (incl. warps) and in time actually spent in the camp.</div>${ms}` +
      `<div class="panel-note">Runs ${st.runs} (${st.wins} survived) · kills ${fmtNum(st.kills)} · objectives ${s.quest}/${QUESTS.length} · gems earned ${st.gemsEarned}, spent ${st.gemsSpent} · crates ${st.crates} · airdrops ${st.airdrops} · expeditions ${st.expeditions} · crafted ${st.crafts}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row"><button class="btn" type="button" data-dev="export">Copy save JSON</button><button class="btn" type="button" data-dev="import">Load save JSON</button><button class="btn danger" type="button" data-dev="reset">Reset progress</button></div>` +
      `<textarea class="panel-json" spellcheck="false" placeholder="Paste a save here, then press Load save JSON again"></textarea>` +
      `<div class="panel-note">Run <code>npm run camp:balance</code> for a scripted multi-day pacing simulation.</div>` +
      `<div class="panel-row"><a class="btn" href="${GAME_URL}"${GAME_URL.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>Open the action game prototype</a></div></div>` +
      `</div>`;
    this.json = this.root.querySelector('.panel-json');
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.camp.tuning;
    if (el.type === 'checkbox') t[key] = el.checked;
    else if (el.tagName === 'SELECT') t[key] = el.value;
    else t[key] = Number(el.value);
    const d = SLIDERS.find((x) => x.key === key);
    const out = this.root.querySelector(`[data-val="${key}"]`);
    if (d && out) out.textContent = d.fmt(t[key]);
    this.ctx.onTuning(key);
  }

  _click(e) {
    if (e.target === this.root) {
      this.hide();
      return;
    }
    const b = e.target.closest('[data-dev]');
    if (!b) return;
    const { camp, clock } = this.ctx;
    const v = Number(b.dataset.v);
    switch (b.dataset.dev) {
      case 'close':
        this.hide();
        return;
      case 'warp':
        clock.warp(v * 1000);
        camp.tick();
        this.ctx.toast(`Camp clock +${fmtTime(v)}`);
        break;
      case 'speed':
        clock.speed = v;
        break;
      case 'res':
        camp.give({ food: 1000, wood: 1000, scrap: 1000 });
        break;
      case 'gems':
        camp.give({ gems: 100 });
        break;
      case 'surv':
        camp.give({ survivors: 1 });
        break;
      case 'finish':
        camp.finishAll();
        break;
      case 'fill':
        camp.fillProducers();
        break;
      case 'quest':
        if (camp.s.quest < QUESTS.length) {
          camp.s.quest++;
          camp.changed();
        }
        break;
      case 'defaults':
        Object.assign(camp.tuning, TUNING_DEFAULTS);
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
        if (this.ctx.onImport(this.json.value)) this.ctx.toast('Save loaded');
        else this.ctx.toast('That save could not be read');
        break;
      case 'reset':
        if (b.classList.contains('armed')) this.ctx.onReset();
        else {
          b.classList.add('armed');
          b.textContent = 'Tap again to wipe the camp';
          setTimeout(() => {
            b.classList.remove('armed');
            b.textContent = 'Reset progress';
          }, 3000);
          return;
        }
        break;
      default:
        return;
    }
    this.render();
  }
}
