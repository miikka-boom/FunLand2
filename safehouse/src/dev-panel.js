// Tuning drawer for playtests: warp time, fast-forward, cheats, live
// multipliers, forced mission outcomes, the pacing log (when each stage was
// reached) and save export / import. Opened with the gear (top right) or `.

import { TUNING_DEFAULTS, STAGES } from './config.js';
import { fmtTime, fmtNum } from './format.js';

const SLIDERS = [
  { key: 'buildTime', label: 'Build timers', min: 0, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'craftTime', label: 'Craft timers', min: 0, max: 2, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'loot', label: 'Mission loot', min: 0.25, max: 4, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'skill', label: 'Simulated skill (your power)', min: 0.5, max: 1.5, step: 0.05, fmt: (v) => `×${v.toFixed(2)}` },
  { key: 'awayMinutes', label: 'Welcome-back summary after', min: 0, max: 60, step: 1, fmt: (v) => `${v} min` },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
];

export class DevPanel {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { sh, clock, onTuning(key), onReset(), onImport(json), onExport(), onCheat(name), toast(text) }
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
    const { sh, clock } = this.ctx;
    const t = sh.tuning;
    const s = sh.s;
    const speeds = [1, 10, 60, 600].map((v) => `<button class="btn chip${clock.speed === v ? ' on' : ''}" type="button" data-dev="speed" data-v="${v}">×${v}</button>`).join('');
    const warps = [
      ['+1 min', 60],
      ['+10 min', 600],
      ['+1 h', 3600],
      ['+6 h', 6 * 3600],
      ['+1 day', 86400],
    ]
      .map(([l, v]) => `<button class="btn chip" type="button" data-dev="warp" data-v="${v}">${l}</button>`)
      .join('');
    const sliders = SLIDERS.map(
      (d) =>
        `<label class="ctl"><span class="ctl-top"><span>${d.label}</span><span class="ctl-val" data-val="${d.key}">${d.fmt(t[d.key])}</span></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${t[d.key]}" data-key="${d.key}"></label>`,
    ).join('');
    const outcome = [
      ['auto', 'By squad power (simulated odds)'],
      ['win', 'Always clear'],
      ['wipe', 'Always wipe (in a random stretch)'],
    ]
      .map(([v, l]) => `<option value="${v}"${t.outcome === v ? ' selected' : ''}>${l}</option>`)
      .join('');
    const log = s.stageLog
      .slice(1)
      .map((m) => {
        const def = STAGES[m.stage - 1];
        return `<div class="plog"><b>${def ? `Stage ${m.stage} done: ${def.name}` : `Stage ${m.stage}`}</b><span>${fmtTime(m.t / 1000)} clock</span><span>${fmtTime(m.play / 1000)} played</span><span>${m.missions} missions</span><span class="doc">doc: ${def ? def.when : ''}</span></div>`;
      })
      .join('');
    const st = s.stats;
    this.root.innerHTML =
      `<div class="panel-card">` +
      `<div class="panel-head"><div><div class="kicker">PROTOTYPE</div><div class="panel-h">Safehouse tuning</div></div><button class="btn primary" type="button" data-dev="close">Done</button></div>` +
      `<div class="panel-section"><div class="panel-group">Time</div><div class="panel-note">The Safehouse clock is ${clock.offset > 1000 ? `<b>${fmtTime(clock.offset / 1000)}</b> ahead of real time` : 'on real time'}. Builds, crafts, the Scrap Yard and daily orders all follow it, also while the page is closed.</div>` +
      `<div class="panel-row">${warps}</div><div class="panel-group sub">Fast-forward while open</div><div class="panel-row">${speeds}</div></div>` +
      `<div class="panel-section"><div class="panel-group">Cheats</div><div class="panel-row">` +
      `<button class="btn" type="button" data-dev="cheat" data-v="scrap">+1000 Scrap</button><button class="btn" type="button" data-dev="cheat" data-v="parts">+100 Parts</button>` +
      `<button class="btn" type="button" data-dev="cheat" data-v="supplies">+100 Supplies</button><button class="btn" type="button" data-dev="cheat" data-v="fuel">+20 Fuel</button>` +
      `<button class="btn" type="button" data-dev="cheat" data-v="finish">Finish all timers</button><button class="btn" type="button" data-dev="cheat" data-v="chapter">Clear next chapter</button>` +
      `<button class="btn" type="button" data-dev="cheat" data-v="bond">+500 bond XP</button>` +
      `</div><div class="panel-note">Resource cheats ignore storage caps.</div></div>` +
      `<div class="panel-section"><div class="panel-group">Tuning (live)</div>${sliders}` +
      `<label class="ctl"><span class="ctl-top"><span>Simulated mission outcome</span></span><select data-key="outcome">${outcome}</select></label>` +
      `<label class="ctl row"><span>Missions move the clock on by their length</span><input class="switch" type="checkbox" data-key="missionTime"${t.missionTime ? ' checked' : ''}></label>` +
      `<label class="ctl row"><span>Browser notification when a build finishes (best effort, page must stay open)</span><input class="switch" type="checkbox" data-key="notify"${t.notify ? ' checked' : ''}></label>` +
      `<label class="ctl row"><span>Haptics (Android)</span><input class="switch" type="checkbox" data-key="haptics"${t.haptics ? ' checked' : ''}></label>` +
      `<div class="panel-row"><button class="btn chip" type="button" data-dev="defaults">Reset tuning</button></div></div>` +
      `<div class="panel-section"><div class="panel-group">Pacing log</div><div class="panel-note">When each stage of the progression flow was completed, in Safehouse clock time (warps included) and in time actually spent on the page, next to the design doc's typical timing.</div>${log || '<div class="panel-note">No stage completed yet.</div>'}` +
      `<div class="panel-note">Missions ${st.missions} (${st.wins} cleared, ${st.wipes} wiped) · safe rooms ${st.safeRooms} · infected ${fmtNum(st.kills)} · crafted ${st.crafted} · items used ${st.itemsUsed} · Fuel burned ${st.fuelSpent} · fuel cans ${st.fuelCans} · yard Scrap ${fmtNum(st.yardScrap)} · overflow Scrap ${fmtNum(st.overflowScrap)} · orders ${st.ordersDone} · chapters ${sh.chaptersCleared()}/12</div></div>` +
      `<div class="panel-section"><div class="panel-group">Save</div><div class="panel-row"><button class="btn" type="button" data-dev="export">Copy save JSON</button><button class="btn" type="button" data-dev="import">Load save JSON</button><button class="btn danger" type="button" data-dev="reset">Reset progress</button></div>` +
      `<textarea class="panel-json" spellcheck="false" placeholder="Paste a save here, then press Load save JSON"></textarea>` +
      `<div class="panel-note">Run <code>npm run safehouse:balance</code> for a scripted multi-week pacing simulation.</div></div>` +
      `</div>`;
    this.json = this.root.querySelector('.panel-json');
  }

  _input(e) {
    const el = e.target;
    const key = el.dataset && el.dataset.key;
    if (!key) return;
    const t = this.ctx.sh.tuning;
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
    const { sh, clock } = this.ctx;
    const v = b.dataset.v;
    switch (b.dataset.dev) {
      case 'close':
        this.hide();
        return;
      case 'warp':
        clock.warp(Number(v) * 1000);
        sh.tick();
        this.ctx.toast(`Warped ${fmtTime(Number(v))}`);
        break;
      case 'speed':
        clock.speed = Number(v);
        break;
      case 'cheat':
        this.ctx.onCheat(v);
        break;
      case 'defaults':
        Object.assign(sh.tuning, TUNING_DEFAULTS);
        this.ctx.onTuning('*');
        break;
      case 'export': {
        const json = this.ctx.onExport();
        this.json.value = json;
        this.json.select();
        const done = () => this.ctx.toast('Save copied');
        if (navigator.clipboard) navigator.clipboard.writeText(json).then(done, () => this.ctx.toast('Select the text and copy it'));
        else this.ctx.toast('Select the text and copy it');
        return;
      }
      case 'import':
        if (!this.json.value.trim()) {
          this.ctx.toast('Paste a save into the box first');
          return;
        }
        this.ctx.toast(this.ctx.onImport(this.json.value) ? 'Save loaded' : 'That save could not be read');
        break;
      case 'reset':
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1';
          b.textContent = 'Tap again to reset';
          setTimeout(() => {
            b.dataset.armed = '';
            b.textContent = 'Reset progress';
          }, 2600);
          return;
        }
        this.ctx.onReset();
        return;
      default:
        return;
    }
    this.render();
  }
}
