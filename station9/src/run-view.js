// The simulated run: the crew, the route to the safe room, a kill count and a
// ticker written from the crew's names and traits. If the crew wipes late in a
// run it pauses and offers a revive. Tap to fast-forward.

import { portraitSvg } from './portrait.js';
import { icon } from './icons.js';
import { fmtTime } from './format.js';
import { esc } from './ui.js';

export class RunView {
  constructor(root, sound) {
    this.root = root;
    this.sound = sound;
    this.active = false;
  }

  get busy() {
    return this.active;
  }

  /**
   * @param {object} result   planned RunResult (may be changed by a revive)
   * @param {object} o        { title, crew: [person], friends, revive: { cost, can() , use() } | null, onDone(result) }
   */
  play(result, o) {
    this.active = true;
    const el = document.createElement('div');
    el.className = 'runview';
    const members = [...o.crew.map((p) => ({ p })), ...Array.from({ length: o.friends || 0 }, () => ({ p: null }))];
    const slots = members
      .map(({ p }, k) => `<div class="rs${k === 0 ? ' you' : ''}" data-k="${k}" data-id="${p ? p.id : ''}">${p ? portraitSvg(p) : `<span class="ph">${icon('survivor')}</span>`}<b>${p ? esc(p.first) : 'Friend'}</b><i class="hp"><u></u></i><em class="down">DOWN</em></div>`)
      .join('');
    el.innerHTML =
      `<div class="rv-top"><div class="kicker">Simulated run · the action game plugs in here</div><h2>${esc(o.title)}</h2></div>` +
      `<div class="rv-squad">${slots}</div>` +
      `<div class="rv-route"><div class="rv-track"><i class="rv-fill"></i></div><span class="rv-a">${icon('flag')}</span><span class="rv-b">${icon('check')}</span><span class="rv-runner">${icon('truck')}</span></div>` +
      `<div class="rv-stats"><span>${icon('skull')}<b class="rv-k">0</b> kills</span><span>${icon('clock')}<b class="rv-t">0s</b></span></div>` +
      `<div class="rv-feed"></div><div class="rv-prompt"></div><div class="rv-stamp"></div><div class="rv-skip">Tap to skip</div>`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const q = (s) => el.querySelector(s);
    const fill = q('.rv-fill');
    const runner = q('.rv-runner');
    const kills = q('.rv-k');
    const time = q('.rv-t');
    const feed = q('.rv-feed');
    const prompt = q('.rv-prompt');
    const stamp = q('.rv-stamp');
    const hp = [...el.querySelectorAll('.rs')].map((n) => ({ n, bar: n.querySelector('u'), v: 1 }));
    const D = 3800;
    let pos = 0; // 0..1 of the route
    let shown = 0;
    let paused = false;
    let finished = false;
    let last = performance.now();
    let speed = 1;
    this.sound('runStart');

    const line = (e) => {
      const d = document.createElement('div');
      d.className = `rv-line tone-${e.tone}`;
      d.textContent = e.text;
      feed.appendChild(d);
      while (feed.children.length > 4) feed.firstElementChild.remove();
      // Someone takes a hit on warnings; the people named go down on bad news.
      const who = hp[Math.floor(Math.random() * hp.length)];
      if (e.tone === 'warn') who.v = Math.max(0.15, who.v - 0.35);
      if (e.tone === 'bad') {
        for (const h of hp) h.v = Math.max(0, h.v - 0.5);
        for (const h of hp) if (e.downed && e.downed.includes(Number(h.n.dataset.id))) {
          h.v = 0;
          h.n.classList.add('isdown');
        }
      }
      if (e.tone === 'good') for (const h of hp) h.v = Math.min(1, h.v + 0.2);
      if (e.who !== null && e.who !== undefined) {
        const n = hp.find((h) => Number(h.n.dataset.id) === e.who);
        if (n) {
          n.n.classList.remove('spot');
          void n.n.offsetWidth;
          n.n.classList.add('spot');
        }
      }
    };

    const end = () => (result.won ? 1 : result.progress);

    const finish = () => {
      if (finished) return;
      finished = true;
      for (; shown < result.events.length; shown++) line(result.events[shown]);
      pos = end();
      draw();
      stamp.textContent = result.won ? 'MADE IT' : 'FELL BACK';
      stamp.className = `rv-stamp show ${result.won ? 'won' : 'lost'}`;
      this.sound(result.won ? 'win' : 'lose');
      setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 220);
        this.active = false;
        o.onDone(result);
      }, 950);
    };

    const askRevive = () => {
      paused = true;
      for (const h of hp) h.n.classList.add('isdown');
      prompt.innerHTML =
        `<div class="rp"><b>THE CREW IS DOWN</b><span>${Math.round(result.progress * 100)}% of the way there. A revive gets everyone up.</span>` +
        `<div class="btns"><button class="btn" type="button" data-r="no">Give up</button><button class="btn gem big" type="button" data-r="yes">Revive ${icon('gems')}<b>${o.revive.cost}</b></button></div></div>`;
      prompt.classList.add('show');
      this.sound('thud');
    };

    prompt.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      e.stopPropagation();
      prompt.classList.remove('show');
      if (b.dataset.r === 'yes' && o.revive.use()) {
        this.sound('gems');
        for (const h of hp) h.n.classList.remove('isdown');
        for (const h of hp) h.v = Math.max(h.v, 0.5);
        shown = result.events.findIndex((x) => x.at >= pos - 1e-6);
        if (shown < 0) shown = result.events.length;
        paused = false;
        last = performance.now();
        requestAnimationFrame(step);
      } else finish();
    });

    const draw = () => {
      fill.style.transform = `scaleX(${pos})`;
      runner.style.left = `${pos * 100}%`;
      const f = result.won ? pos : pos / Math.max(0.01, result.progress);
      kills.textContent = String(Math.round(result.kills * Math.min(1, f)));
      time.textContent = fmtTime(result.timeS * Math.min(1, f));
      for (const h of hp) {
        h.bar.style.transform = `scaleX(${h.v})`;
        h.n.classList.toggle('low', h.v < 0.35);
      }
    };

    const step = (now) => {
      if (finished || paused) return;
      const dt = Math.min(64, now - last);
      last = now;
      pos = Math.min(end(), pos + (dt / D) * speed);
      while (shown < result.events.length && result.events[shown].at <= pos + 1e-6) {
        const ev = result.events[shown];
        line(ev);
        this.sound(ev.tone === 'bad' ? 'thud' : ev.tone === 'good' ? 'tick' : 'tick');
        shown++;
      }
      for (const h of hp) h.v = Math.min(1, h.v + dt / 9000);
      draw();
      if (pos >= end() - 1e-6) {
        if (!result.won && o.revive && o.revive.can()) askRevive();
        else finish();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    el.addEventListener('click', () => {
      if (paused || finished) return;
      speed = 8; // fast-forward to the end (or to the revive question)
    });
  }
}
