// The simulated run: a few seconds of route progress, kill count and a
// ticker of what happened, ending on SURVIVED / YOU DIED. Tap to skip.

import { icon } from './icons.js';
import { fmtTime } from './format.js';
import { esc } from './ui.js';

export class RunView {
  constructor(root, sound) {
    this.root = root;
    this.sound = sound;
    this.active = null;
  }

  get busy() {
    return !!this.active;
  }

  play(result, zone, onDone) {
    const el = document.createElement('div');
    el.className = 'runview';
    el.innerHTML =
      `<div class="rv-top"><div class="kicker">Simulated run · stand-in for the action game</div><h2>${esc(zone.name)}</h2></div>` +
      `<div class="rv-route"><div class="rv-track"><i class="rv-fill"></i></div><span class="rv-a">${icon('tent')}</span><span class="rv-b">${icon('check')}</span><span class="rv-runner">${icon('survivor')}</span></div>` +
      `<div class="rv-stats"><span>${icon('skull')}<b class="rv-k">0</b> kills</span><span>${icon('clock')}<b class="rv-t">0s</b></span><span>${icon('power')}<b>${result.power}</b> power</span></div>` +
      `<div class="rv-feed"></div><div class="rv-stamp"></div><div class="rv-skip">Tap to skip</div>`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const q = (s) => el.querySelector(s);
    const fill = q('.rv-fill');
    const runner = q('.rv-runner');
    const kills = q('.rv-k');
    const time = q('.rv-t');
    const feed = q('.rv-feed');
    const stamp = q('.rv-stamp');
    const end = result.progress;
    const D = 3600 * (result.won ? 1 : 0.55 + 0.45 * end);
    const t0 = performance.now();
    let shown = 0;
    let finished = false;
    this.sound('runStart');

    const finish = () => {
      if (finished) return;
      finished = true;
      for (; shown < result.events.length; shown++) addLine(result.events[shown]);
      setPos(1);
      stamp.textContent = result.won ? 'SURVIVED' : 'YOU DIED';
      stamp.className = `rv-stamp show ${result.won ? 'won' : 'lost'}`;
      this.sound(result.won ? 'win' : 'lose');
      setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 220);
        this.active = null;
        onDone();
      }, 900);
    };

    const addLine = (e) => {
      const d = document.createElement('div');
      d.className = `rv-line tone-${e.tone}`;
      d.textContent = e.text;
      feed.appendChild(d);
      while (feed.children.length > 4) feed.firstElementChild.remove();
    };

    const setPos = (f) => {
      const p = Math.min(f, 1) * end;
      fill.style.transform = `scaleX(${p})`;
      runner.style.left = `${p * 100}%`;
      kills.textContent = String(Math.round(result.kills * Math.min(1, f)));
      time.textContent = fmtTime(result.timeS * Math.min(1, f));
    };

    const step = (now) => {
      if (finished) return;
      const f = (now - t0) / D;
      setPos(f);
      while (shown < result.events.length && result.events[shown].at <= Math.min(f, 1) * end + 1e-6) {
        addLine(result.events[shown]);
        this.sound(result.events[shown].tone === 'bad' ? 'thud' : 'tick');
        shown++;
      }
      if (f >= 1) finish();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.addEventListener('click', finish);
    this.active = { el, finish };
  }
}
