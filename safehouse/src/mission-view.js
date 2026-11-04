// The simulated mission: a few seconds of route, squad and feed, with the
// loot ticking into BANKED at every safe room, ending on MISSION CLEAR or
// WIPED. Tap to skip. It only plays a MissionReport back; the outcome was
// decided by mission-sim.js before it started.

import { RESOURCES, SURVIVORS, SECTION_KINDS } from './config.js';
import { icon } from './icons.js';
import { portrait } from './portraits.js';
import { fmtNum } from './format.js';
import { esc } from './ui.js';

const PORTRAIT_OF = { you: 'you', bot: 'bot', rookie: 'friend_rookie', veteran: 'friend_veteran' };

export class MissionView {
  constructor(root, sound) {
    this.root = root;
    this.sound = sound;
    this.active = null;
  }

  get busy() {
    return !!this.active;
  }

  play(report, loadout, onDone) {
    const M = loadout.mission;
    const n = M.sections.length;
    const el = document.createElement('div');
    el.className = 'mview';
    const legs = M.sections
      .map((s, i) => `<span class="leg k-${s.kind}" data-i="${i}"><i class="fill"></i><span class="lk">${esc(SECTION_KINDS[s.kind].name)}</span></span><span class="door" data-i="${i}">${icon('saferoom')}</span>`)
      .join('');
    const squad = loadout.members
      .map((m) => {
        const pid = m.kind === 'survivor' ? m.id : PORTRAIT_OF[m.kind === 'friend' ? m.id : m.kind];
        return `<span class="mate k-${m.kind}" data-who="${m.kind === 'survivor' ? m.id : m.kind}"><span class="face">${portrait(pid)}</span><b>${esc(m.name)}</b></span>`;
      })
      .join('');
    el.innerHTML =
      `<div class="mv-top"><div class="kicker">Simulated mission · stand-in for the co-op game</div><h2>${esc(M.name)}</h2>` +
      `<small>${M.kind === 'story' ? `Chapter ${M.chapter} · ${M.finale ? 'Finale' : `Mission ${M.index}`}` : M.kind === 'rescue' ? 'Rescue call' : 'Bond chapter'} · squad power ${loadout.power}</small></div>` +
      `<div class="mv-route"><span class="start">${icon('saferoom')}</span>${legs}<span class="runner">${icon('squad')}</span></div>` +
      `<div class="mv-squad">${squad}</div>` +
      `<div class="mv-bank"><span class="bl">${icon('saferoom')}BANKED</span>${RESOURCES.map((r) => `<span class="bv" data-res="${r}">${icon(r)}<b>0</b></span>`).join('')}</div>` +
      `<div class="mv-feed"></div><div class="mv-stamp"></div><div class="mv-skip">Tap to skip</div>`;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const q = (s) => el.querySelector(s);
    const feed = q('.mv-feed');
    const runner = q('.runner');
    const stamp = q('.mv-stamp');
    const bank = { scrap: 0, parts: 0, supplies: 0, fuel: 0 };

    // Build the schedule: each stretch is a beat per event, then its safe room.
    const steps = [];
    let t = 350;
    const beat = 520;
    report.sections.forEach((sec, i) => {
      const start = t;
      const evs = sec.events || [];
      const dur = Math.max(1300, (evs.length + 1) * beat);
      evs.forEach((e, k) => steps.push({ t: start + ((k + 0.5) / (evs.length + 1)) * dur, fn: () => line(e, sec) }));
      steps.push({ t: start, fn: () => q(`.leg[data-i="${i}"]`).classList.add('on') });
      if (sec.cleared) {
        steps.push({
          t: start + dur,
          fn: () => {
            q(`.leg[data-i="${i}"]`).classList.add('done');
            q(`.door[data-i="${i}"]`).classList.add('reached');
            for (const r of RESOURCES) bank[r] += sec.loot[r] || 0;
            for (const r of RESOURCES) {
              const b = q(`.bv[data-res="${r}"]`);
              b.querySelector('b').textContent = fmtNum(bank[r]);
              if (sec.loot[r]) {
                b.classList.remove('pop');
                void b.offsetWidth;
                b.classList.add('pop');
              }
            }
            line({ text: i === n - 1 ? 'Made it out. Everything banked!' : 'Safe room. Loot banked', tone: 'safe' });
            this.sound('saferoom');
          },
        });
      } else {
        steps.push({
          t: start + dur,
          fn: () => {
            q(`.leg[data-i="${i}"]`).classList.add('failed');
            el.classList.add('shake');
            for (const m of el.querySelectorAll('.mate')) m.classList.add('down');
            this.sound('thud');
          },
        });
      }
      steps.push({ t: start, dur, i, kind: 'move' });
      t = start + dur + 380;
    });
    const total = t;
    steps.sort((a, b) => a.t - b.t);

    const line = (e) => {
      const d = document.createElement('div');
      d.className = `mv-line tone-${e.tone || 'ok'}`;
      const ic = e.item ? icon(e.item) : e.who && SURVIVORS[e.who] ? `<span class="face tiny">${portrait(e.who)}</span>` : '';
      d.innerHTML = `${ic}<span>${esc(e.text)}</span>`;
      feed.appendChild(d);
      while (feed.children.length > 5) feed.firstElementChild.remove();
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

    const moves = steps.filter((s) => s.kind === 'move');
    const route = q('.mv-route');
    const legEls = [...el.querySelectorAll('.leg')];
    const placeRunner = (now) => {
      // Where the squad is: within the stretch being played, or at its door.
      let at = { i: 0, f: 0 };
      for (const m of moves) {
        if (now < m.t) break;
        const f = Math.min(1, (now - m.t) / m.dur);
        at = { i: m.i, f: report.sections[m.i].cleared ? f : Math.min(f, 0.6) };
      }
      const r = route.getBoundingClientRect();
      const L = legEls[at.i].getBoundingClientRect();
      runner.style.transform = `translateX(${L.left - r.left + at.f * L.width}px)`;
      for (const m of moves) {
        const fill = el.querySelector(`.leg[data-i="${m.i}"] .fill`);
        const f = Math.max(0, Math.min(1, (now - m.t) / m.dur));
        const sec = report.sections[m.i];
        fill.style.transform = `scaleX(${sec.cleared ? f : Math.min(f, 0.6)})`;
      }
    };

    let next = 0;
    let finished = false;
    const t0 = performance.now();
    this.sound('start');

    const finish = () => {
      if (finished) return;
      finished = true;
      for (; next < steps.length; next++) if (steps[next].fn) steps[next].fn();
      placeRunner(Infinity);
      stamp.innerHTML = report.won ? 'MISSION CLEAR' : `WIPED<small>${report.sectionsCleared ? `${report.sectionsCleared} safe room${report.sectionsCleared > 1 ? 's' : ''} banked` : 'nothing banked'}</small>`;
      stamp.className = `mv-stamp show ${report.won ? 'won' : 'lost'}`;
      this.sound(report.won ? 'win' : 'lose');
      setTimeout(() => {
        el.classList.remove('in');
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
        this.active = null;
        onDone();
      }, 1100);
    };

    const step = (now) => {
      if (finished) return;
      const e = now - t0;
      while (next < steps.length && steps[next].t <= e) {
        if (steps[next].fn) steps[next].fn();
        next++;
      }
      placeRunner(e);
      if (e >= total) finish();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.addEventListener('click', finish);
    this.active = { el, finish };
  }
}
