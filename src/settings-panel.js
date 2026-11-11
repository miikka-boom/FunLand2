// DOM tuning panel (opened by the sliders button / Esc). Pauses the game.
// Every control writes straight into the live settings object.

import { SCHEMA, PRESETS, WORLD_PRESETS, DEFAULTS, LEVEL_NAMES, levelKey, diffFromDefaults, saveSettings } from './settings.js';
import { loadHistory, clearHistory, historyText } from './playtest.js';

// Log-scale sliders (item.log): position 0..LOG_STEPS maps to min..max
// exponentially; values snap to two significant digits (0.25, 1.0, 4.5, 12).
const LOG_STEPS = 1000;

export function fromLogPos(item, pos) {
  const v = item.min * Math.pow(item.max / item.min, Math.min(1, Math.max(0, pos / LOG_STEPS)));
  const q = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.min(item.max, Math.max(item.min, +(Math.round(v / q) * q).toFixed(6)));
}

export function isDefault(S, key) {
  const a = S[key];
  const b = DEFAULTS[key];
  return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;
}

export function toLogPos(item, v) {
  const x = Math.min(item.max, Math.max(item.min, v));
  return Math.round((Math.log(x / item.min) / Math.log(item.max / item.min)) * LOG_STEPS);
}

export class SettingsPanel {
  constructor(root, settings, actions) {
    this.root = root;
    this.settings = settings;
    this.actions = actions;
    this.controls = new Map();
    this.levelHeads = []; // headers of the groups that are kept per map type
    this.isOpen = false;
    this._build();
  }

  /** Where a control's value lives: per-map-type settings are stored under key@level. */
  _key(item) {
    return item.perLevel ? levelKey(item.key, this.settings.level) : item.key;
  }

  _build() {
    const S = this.settings;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    this.root.innerHTML = '';
    const card = el('div', 'panel-card');
    this.root.appendChild(card);

    const head = el('div', 'panel-head');
    const title = el('div', 'panel-title');
    title.append(el('div', 'kicker', 'PAUSED'), el('div', 'panel-h', 'Feel tuning'));
    const resume = el('button', 'btn primary', 'Resume');
    resume.addEventListener('click', () => this.actions.onClose());
    head.append(title, resume);
    card.appendChild(head);

    const actions = el('div', 'panel-row');
    const mk = (label, fn, cls = 'btn') => {
      const b = el('button', cls, label);
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };
    mk('Call horde now', () => this.actions.onCallHorde());
    mk('Spawn Hunter', () => this.actions.onSpawnHunter());
    mk('Spawn Tank', () => this.actions.onSpawnTank());
    mk('Spawn Night Terror', () => this.actions.onSpawnTerror());
    mk('Restart run', () => this.actions.onRestart());
    mk('New map', () => this.actions.onNewMap());
    this.fsBtn = mk('Fullscreen', () => this.actions.onFullscreen());
    card.appendChild(actions);

    const presetWrap = el('div', 'panel-section');
    presetWrap.appendChild(el('div', 'panel-group', 'Control presets'));
    const presets = el('div', 'panel-row');
    for (const p of PRESETS) {
      const b = el('button', 'btn chip', p.name);
      b.addEventListener('click', () => {
        Object.assign(S, p.values);
        this.sync();
        saveSettings(S);
        this.actions.onChange('*');
        this._flash(`Preset: ${p.name}`);
      });
      presets.appendChild(b);
    }
    presetWrap.appendChild(presets);
    card.appendChild(presetWrap);

    for (const group of SCHEMA) {
      const sec = el('div', 'panel-section');
      const head = el('div', 'panel-group', group.group);
      sec.appendChild(head);
      if (group.perLevel) this.levelHeads.push({ head, name: group.group });
      if (group.note) sec.appendChild(el('p', 'panel-note', group.note));
      if (group.presets === 'world') {
        const row = el('div', 'panel-row');
        for (const p of WORLD_PRESETS) {
          const b = el('button', 'btn chip', p.name);
          b.addEventListener('click', () => {
            Object.assign(S, p.values);
            this.sync();
            saveSettings(S);
            this.actions.onChange('world');
            this._flash(`World: ${p.name}`);
          });
          row.appendChild(b);
        }
        sec.appendChild(row);
      }
      for (const item of group.items) sec.appendChild(this._control(item, el));
      if (group.extra === 'playtest') {
        // Everything rated / finished on this device, ready to paste to the team.
        const row = el('div', 'panel-row');
        this.reportsBtn = el('button', 'btn chip', 'Copy all reports');
        this.reportsBtn.addEventListener('click', () => {
          const list = loadHistory();
          if (!list.length) this._flash('No reports yet: finish a run first');
          else this._copyText(historyText(list), `Copied ${list.length} report${list.length > 1 ? 's' : ''}`);
        });
        const clear = el('button', 'btn chip danger', 'Clear reports');
        clear.addEventListener('click', () => {
          clearHistory();
          this._syncReports();
          this._flash('Reports cleared');
        });
        row.append(this.reportsBtn, clear);
        sec.appendChild(row);
        sec.appendChild(el('p', 'panel-note', 'After each run a small card asks how it felt (fun, difficulty, controls). Reports stay on this device until you copy or share them.'));
      }
      card.appendChild(sec);
    }

    const foot = el('div', 'panel-row foot');
    const copy = el('button', 'btn', 'Copy tuning JSON');
    copy.addEventListener('click', () => this._copy());
    const reset = el('button', 'btn danger', 'Reset all to defaults');
    reset.addEventListener('click', () => {
      const seed = S.seed;
      Object.assign(S, DEFAULTS, { seed });
      this.sync();
      saveSettings(S);
      this.actions.onChange('*');
      this._flash('Defaults restored');
    });
    foot.append(copy, reset);
    card.appendChild(foot);

    this.toast = el('div', 'panel-toast');
    this.root.appendChild(this.toast);
    this.jsonBox = el('textarea', 'panel-json');
    this.jsonBox.readOnly = true;
    card.appendChild(this.jsonBox);

    card.appendChild(
      el('p', 'panel-note', 'Values save on this device. "Copy tuning JSON" copies only what differs from the defaults — paste it back to the team to lock in a feel.'),
    );
  }

  _control(item, el) {
    const S = this.settings;
    const row = el('div', 'ctl');
    const id = `ctl-${item.key}`;
    const name = el('label', 'ctl-name', item.label);
    name.htmlFor = id;
    const val = el('span', 'ctl-val');
    let input;
    if (item.type === 'range') {
      input = el('input');
      input.type = 'range';
      if (item.log) {
        // The track is 0..LOG_STEPS; the value is exponential along it.
        input.min = 0;
        input.max = LOG_STEPS;
        input.step = 1;
      } else {
        input.min = item.min;
        input.max = item.max;
        input.step = item.step;
      }
      input.addEventListener('input', () => {
        S[this._key(item)] = item.log ? fromLogPos(item, parseFloat(input.value)) : parseFloat(input.value);
        this._show(item.key);
        saveSettings(S);
        this.actions.onChange(item.key);
      });
    } else if (item.type === 'select') {
      input = el('select');
      for (const [v, label] of item.options) {
        const o = el('option', null, label);
        o.value = v;
        input.appendChild(o);
      }
      input.addEventListener('change', () => {
        S[this._key(item)] = input.value;
        this._show(item.key);
        saveSettings(S);
        this.actions.onChange(item.key);
        // Another map type: the per-map controls now show that one's values.
        if (item.key === 'level') this.sync();
      });
    } else {
      input = el('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.addEventListener('change', () => {
        S[this._key(item)] = input.checked;
        this._show(item.key);
        saveSettings(S);
        this.actions.onChange(item.key);
      });
    }
    input.id = id;
    // Per-setting reset: shown (and the name marked) only while the value
    // differs from the default. It keeps its space when hidden, so a slider
    // never jumps under your thumb as you drag off the default.
    const reset = el('button', 'ctl-reset', 'Default');
    reset.type = 'button';
    reset.title = `Reset ${item.label} to default`;
    reset.addEventListener('click', (e) => {
      e.preventDefault();
      const k = this._key(item);
      if (isDefault(S, k)) return;
      S[k] = DEFAULTS[k];
      this._show(item.key, true);
      saveSettings(S);
      this.actions.onChange(item.key);
      this._flash(`${item.label}: default`);
    });
    const side = el('span', 'ctl-side');
    side.append(val, reset);
    const top = el('div', 'ctl-top');
    top.append(name, side);
    row.append(top, input);
    this.controls.set(item.key, { item, input, val, row });
    return row;
  }

  /** Refresh one control's value label and changed state (and the input itself if asked). */
  _show(key, setInput = false) {
    const c = this.controls.get(key);
    if (!c) return;
    const S = this.settings;
    const { item, input, val, row } = c;
    const k = this._key(item);
    if (item.type === 'range') {
      if (setInput) input.value = item.log ? toLogPos(item, S[k]) : S[k];
      val.textContent = item.fmt ? item.fmt(S[k]) : String(S[k]);
    } else if (item.type === 'select') {
      if (setInput) input.value = S[k];
      val.textContent = '';
    } else {
      if (setInput) input.checked = !!S[k];
      val.textContent = '';
    }
    row.classList.toggle('changed', !isDefault(S, k));
  }

  sync() {
    for (const h of this.levelHeads) h.head.textContent = `${h.name} · ${LEVEL_NAMES[this.settings.level] || this.settings.level}`;
    for (const key of this.controls.keys()) this._show(key, true);
    this._syncReports();
    if (this.fsBtn) this.fsBtn.style.display = document.documentElement.requestFullscreen ? '' : 'none';
  }

  _syncReports() {
    if (!this.reportsBtn) return;
    const n = loadHistory().length;
    this.reportsBtn.textContent = n ? `Copy all reports (${n})` : 'Copy all reports';
  }

  _flash(text) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toast.classList.remove('show'), 1400);
  }

  _copy() {
    return this._copyText(JSON.stringify(diffFromDefaults(this.settings), null, 2), 'Copied tuning JSON');
  }

  async _copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      this._flash(done);
    } catch {
      // Clipboard blocked (http, old Safari): show it for manual copy.
      this.jsonBox.value = text;
      this.jsonBox.classList.add('show');
      this.jsonBox.focus();
      this.jsonBox.select();
      this._flash('Select + copy the text below');
    }
  }

  open() {
    this.sync();
    this.jsonBox.classList.remove('show');
    this.root.classList.add('open');
    this.isOpen = true;
  }

  close() {
    this.root.classList.remove('open');
    this.isOpen = false;
  }
}
