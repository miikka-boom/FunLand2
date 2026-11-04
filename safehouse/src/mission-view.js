// The simulated mission, played back in a few seconds: three stretches with
// safe-room doors, the squad, a short feed and the Scrap banked at each safe
// room, ending on MISSION CLEAR or WIPED. Tap to skip. The outcome was
// decided by mission-sim.js before it starts.

import { SURVIVORS } from './config.js';
import { icon } from './icons.js';
import { faceHtml } from './view.js';
import { esc } from './ui.js';

export class MissionView {
  constructor(root, sound) {
    this.root = root;
    this.sound = sound;
    this.active = null;
  }

  get busy() {
    return !!this.active;
  }

  play(report, loadout, squad, onDone) {
    const M = loadout.mission;
    const el = document.createElement('div');
    el.className = 'mview';
    const legs = report.stretches.length < report.total ? [...report.stretches, ...Array(report.total - report.stretches.length).fill(null)] : report.stretches;
    const names = M.finale ? ['Streets', 'Horde', 'Finale'] : ['Streets', 'Horde', 'Way out'];
    el.innerHTML =
      `<div class="mv-top"><div class="kicker">Simulated mission</div><h2>${esc(M.name)}</h2></div>` +
      `<div class="mv-route"><span class="door start">${icon('saferoom')}</span>` +
      legs.map((_, i) => `<span class="leg k-${i === 1 ? 'horde' : i === 2 && M.finale ? 'finale' : 'run'}" data-i="${i}"><i class="fill"></i><span class="lk">${names[i]}</span></span><span class="door" data-i="${i}">${icon('saferoom')}</span>`).join('') +
      `</div>` +
      `<div class="mv-squad">${squad.map((m) => `<span class="mate" data-who="${m.kind === 'survivor' ? m.id : m.kind}">${faceHtml(m.kind === 'survivor' ? m.id : m.kind)}<b>${esc(m.name)}</b></span>`).join('')}</div>` +
      `<div class="mv-bank">${icon('saferoom')}<span>Banked</span><b>0</b>${icon('scrap')}</div>` +
      `<div class="mv-feed"></div><div class="mv-stamp"></div><div class="mv-skip">Tap to skip</div>`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const q = (s) => el.querySelector(s);
    const feed = q('.mv-feed');
    const bankB = q('.mv-bank b');
    let bank = 0;

    const line = (e) => {
      const d = document.createElement('div');
      d.className = `mv-line tone-${e.tone || 'ok'}`;
      const lead = e.item ? icon(e.item) : e.who && SURVIVORS[e.who] ? faceHtml(e.who, 'tiny') : '';
      d.innerHTML = `${lead}<span>${esc(e.text)}</span>`;
      feed.appendChild(d);
      while (feed.children.length > 4) feed.firstElementChild.remove();
      if (e.who) {
        const mate = el.querySelector(`.mate[data-who="${e.who}"]`);
        if (mate) {
          mate.classList.remove('talk');
          void mate.offsetWidth;
          mate.classList.add('talk');
        }
      }
      this.sound(e.tone === 'bad' ? 'thud' : 'tick');
    };

    // Schedule: each stretch plays its lines while its bar fills, then its safe room.
    const steps = [];
    const fills = [];
    let t = 300;
    report.stretches.forEach((s, i) => {
      const dur = Math.max(1000, (s.events.length + 1) * 480);
      s.events.forEach((e, k) => steps.push({ t: t + ((k + 0.5) / (s.events.length + 1)) * dur, fn: () => line(e) }));
      fills.push({ i, t, dur, cleared: s.cleared });
      steps.push({
        t: t + dur,
        fn: () => {
          const leg = q(`.leg[data-i="${i}"]`);
          if (s.cleared) {
            leg.classList.add('done');
            q(`.door[data-i="${i}"]`).classList.add('reached');
            bank += s.scrap;
            bankB.textContent = String(bank);
            bankB.parentElement.classList.remove('pop');
            void bankB.offsetWidth;
            bankB.parentElement.classList.add('pop');
            line({ text: i === report.total - 1 ? `Made it out: +${s.scrap} Scrap banked` : `Safe room: +${s.scrap} Scrap banked`, tone: 'safe' });
            this.sound('saferoom');
          } else {
            leg.classList.add('failed');
            el.classList.add('shake');
            for (const m of el.querySelectorAll('.mate')) m.classList.add('down');
            this.sound('thud');
          }
        },
      });
      t += dur + 320;
    });
    const total = t;
    steps.sort((a, b) => a.t - b.t);

    const setFills = (now) => {
      for (const f of fills) {
        const p = Math.max(0, Math.min(1, (now - f.t) / f.dur));
        q(`.leg[data-i="${f.i}"] .fill`).style.transform = `scaleX(${f.cleared ? p : Math.min(p, 0.6)})`;
      }
    };

    let next = 0;
    let finished = false;
    const t0 = performance.now();
    this.sound('start');
    const finish = () => {
      if (finished) return;
      finished = true;
      for (; next < steps.length; next++) steps[next].fn();
      setFills(Infinity);
      const stamp = q('.mv-stamp');
      stamp.innerHTML = report.won ? 'MISSION CLEAR' : `WIPED<small>${report.scrap} Scrap still banked</small>`;
      stamp.className = `mv-stamp show ${report.won ? 'won' : 'lost'}`;
      this.sound(report.won ? 'win' : 'lose');
      setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
        this.active = null;
        onDone();
      }, 1000);
    };
    const step = (now) => {
      if (finished) return;
      const e = now - t0;
      while (next < steps.length && steps[next].t <= e) steps[next++].fn();
      setFills(e);
      if (e >= total) finish();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.addEventListener('click', finish);
    this.active = { el, finish };
  }
}
