// DOM tuning panel (opened by the sliders button / Esc). Pauses the game.
// Every control writes straight into the live settings object.

import { SCHEMA, PRESETS, DEFAULTS, diffFromDefaults, saveSettings } from './settings.js';

// Log-scale sliders (item.log): position 0..LOG_STEPS maps to min..max
// exponentially; values snap to two significant digits (0.25, 1.0, 4.5, 12).
const LOG_STEPS = 1000;

export function fromLogPos(item, pos) {
  const v = item.min * Math.pow(item.max / item.min, Math.min(1, Math.max(0, pos / LOG_STEPS)));
  const q = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.min(item.max, Math.max(item.min, +(Math.round(v / q) * q).toFixed(6)));
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
    this.isOpen = false;
    this._build();
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
      sec.appendChild(el('div', 'panel-group', group.group));
      for (const item of group.items) sec.appendChild(this._control(item, el));
      card.appendChild(sec);
    }

    const foot = el('div', 'panel-row foot');
    const copy = el('button', 'btn', 'Copy tuning JSON');
    copy.addEventListener('click', () => this._copy());
    const reset = el('button', 'btn danger', 'Reset to defaults');
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
    const row = el('label', 'ctl');
    const name = el('span', 'ctl-name', item.label);
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
        S[item.key] = item.log ? fromLogPos(item, parseFloat(input.value)) : parseFloat(input.value);
        val.textContent = item.fmt ? item.fmt(S[item.key]) : String(S[item.key]);
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
        S[item.key] = input.value;
        saveSettings(S);
        this.actions.onChange(item.key);
      });
    } else {
      input = el('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.addEventListener('change', () => {
        S[item.key] = input.checked;
        saveSettings(S);
        this.actions.onChange(item.key);
      });
    }
    const top = el('span', 'ctl-top');
    top.append(name, val);
    row.append(top, input);
    this.controls.set(item.key, { item, input, val });
    return row;
  }

  sync() {
    const S = this.settings;
    for (const { item, input, val } of this.controls.values()) {
      if (item.type === 'range') {
        input.value = item.log ? toLogPos(item, S[item.key]) : S[item.key];
        val.textContent = item.fmt ? item.fmt(S[item.key]) : String(S[item.key]);
      } else if (item.type === 'select') {
        input.value = S[item.key];
        val.textContent = '';
      } else {
        input.checked = !!S[item.key];
        val.textContent = '';
      }
    }
    if (this.fsBtn) this.fsBtn.style.display = document.documentElement.requestFullscreen ? '' : 'none';
  }

  _flash(text) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toast.classList.remove('show'), 1400);
  }

  async _copy() {
    const text = JSON.stringify(diffFromDefaults(this.settings), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this._flash('Copied tuning JSON');
    } catch {
      // Clipboard blocked (http, old Safari): show it for manual copy.
      this.jsonBox.value = text;
      this.jsonBox.classList.add('show');
      this.jsonBox.focus();
      this.jsonBox.select();
      this._flash('Select + copy the JSON below');
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
